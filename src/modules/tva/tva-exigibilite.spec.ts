import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * EXIGIBILITÉ DE LA TVA · ordonnance-loi n° 10/001, art. 25 et 26.
 *
 * Le point que ces tests figent n'est PAS le montant de la taxe (le logiciel
 * ne la liquide pas, il totalise ce que la comptabilité porte) mais la
 * PÉRIODE dans laquelle elle tombe. Pour une prestation de services, l'art.
 * 25, 2° place l'exigibilité « au moment de l'encaissement du prix, des
 * acomptes ou avances » : une facture de mars réglée en juin se déclare en
 * juin. Déclarer en mars, c'est verser une taxe qu'on n'a pas encaissée ·
 * c'est ce que faisait le logiciel, pour tous les dossiers.
 */

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'TVA 16 %',
  taux: 16,
  compteCollecteId: 'c443',
  compteDeductibleId: 'c445',
};

interface Lettrage {
  statut: 'PARTIEL' | 'SOLDE';
  solde: number;
  soldeAt: Date | null;
}

/** Une facture de vente : la créance client, et la TVA collectée. */
function facture(opts: {
  date: string;
  tva: number;
  creance: number;
  lettrage: Lettrage | null;
}) {
  return {
    id: `l-${opts.date}`,
    compteId: 'c443',
    debit: 0,
    credit: opts.tva,
    ecriture: {
      date: new Date(opts.date),
      lignes: opts.lettrage
        ? [
            {
              debit: opts.creance,
              credit: 0,
              lettrage: {
                ...opts.lettrage,
                soldeAt: opts.lettrage.soldeAt,
              },
            },
          ]
        : [],
    },
  };
}

function service(regime: 'LIVRAISONS' | 'ENCAISSEMENTS' | 'DEBITS', lignesTva: unknown[]) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: regime }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue(lignesTva),
      // Utilisé par le régime des livraisons ET par le prorata.
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const MARS = new Date('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');
const JUIN = new Date('2026-06-01');
const FIN_JUIN = new Date('2026-06-30T23:59:59.999Z');

describe('Exigibilité de la TVA · régime de l’encaissement (art. 25, 2°)', () => {
  it('une facture de mars encore impayée ne se déclare PAS en mars', async () => {
    const s = service('ENCAISSEMENTS', [
      facture({ date: '2026-03-10', tva: 160_000, creance: 1_160_000, lettrage: { statut: 'PARTIEL', solde: 1_160_000, soldeAt: null } }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(0);
    // Mais elle est ANNONCÉE : sans ce chiffre, l'écart entre le chiffre
    // d'affaires et la déclaration ressemblerait à une TVA perdue.
    expect(d.tvaEnAttenteEncaissement).toBe(160_000);
  });

  it('la même facture, réglée en juin, se déclare en JUIN', async () => {
    const s = service('ENCAISSEMENTS', [
      facture({
        date: '2026-03-10',
        tva: 160_000,
        creance: 1_160_000,
        lettrage: { statut: 'SOLDE', solde: 0, soldeAt: new Date('2026-06-12') },
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalCollecte).toBe(160_000);
  });

  it('un règlement PARTIEL rend la taxe exigible à proportion de l’encaissement', async () => {
    // Créance de 1 160 000, il reste 290 000 à encaisser · 75 % encaissés.
    const s = service('ENCAISSEMENTS', [
      facture({
        date: '2026-03-10',
        tva: 160_000,
        creance: 1_160_000,
        lettrage: { statut: 'PARTIEL', solde: 290_000, soldeAt: new Date('2026-06-12') },
      }),
    ]);
    const d = await s.declaration('t1', JUIN, FIN_JUIN);
    expect(d.totalCollecte).toBe(120_000);
  });

  it('une vente au comptant, sans créance lettrable, reste exigible à sa date', async () => {
    // Encaissement et écriture coïncident : rien à décaler.
    const s = service('ENCAISSEMENTS', [
      facture({ date: '2026-03-10', tva: 160_000, creance: 0, lettrage: null }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(160_000);
  });

  it('porte le régime appliqué et sa base légale · un chiffre sans son régime ne se vérifie pas', async () => {
    const s = service('ENCAISSEMENTS', []);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.regimeExigibilite).toBe('ENCAISSEMENTS');
    expect(d.mentionExigibilite).toContain('art. 25, 2°');
  });
});

describe('Exigibilité de la TVA · livraisons et débits', () => {
  it('le régime des LIVRAISONS garde l’agrégation par date d’écriture', async () => {
    // Comportement historique, inchangé : c'est le défaut, et aucun dossier
    // existant ne doit voir sa déclaration bouger sans décision.
    const s = service('LIVRAISONS', []);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.regimeExigibilite).toBe('LIVRAISONS');
    expect(d.tvaEnAttenteEncaissement).toBe(0);
    // Et il avertit un dossier de services qu'il est sans doute au mauvais régime.
    expect(d.mentionExigibilite).toContain('PRESTATIONS DE SERVICES');
  });

  it('le régime des DÉBITS (art. 26) date la taxe à la facture, pas au règlement', async () => {
    const s = service('DEBITS', []);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.regimeExigibilite).toBe('DEBITS');
    expect(d.mentionExigibilite).toContain('art. 26');
    expect(d.mentionExigibilite).toContain('Directeur Général des Impôts');
  });
});
