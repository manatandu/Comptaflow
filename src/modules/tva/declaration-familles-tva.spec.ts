import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE COMPTE DE TVA DÉPEND DE L'OPÉRATION, JAMAIS DE SON TAUX.
 *
 * Chaque `TauxTva` porte un compte de collecte et un compte de déduction. Ce
 * n'est qu'une commodité de saisie : elle pré-remplit la contrepartie. Mais la
 * DÉCLARATION agrégeait sur ces deux identifiants exactement, ce qui suppose
 * qu'un taux n'a qu'un compte · faux dès que le plan subdivise, et l'AUDCIF
 * subdivise les deux (Titre VII, COMPTE 44) :
 *
 *   443 TVA facturée   · 4431 ventes · 4432 prestations de services ·
 *                        4433 travaux · 4434 production livrée à soi-même
 *   445 TVA récupérable · 4451 immobilisations · 4452 achats ·
 *                        4453 transport · 4454 services extérieurs
 *
 * Conséquence, et c'est la raison d'être de ce spec : une TVA sur prestation
 * de services correctement imputée en 4432 n'était PAS déclarée, le taux à
 * 16 % pointant sur 4431. Une TVA collectée absente d'une déclaration est un
 * redressement.
 *
 * Ce qui identifie la ligne, c'est le TAUX (`tauxTvaId`, posé à la saisie) et
 * la FAMILLE du compte · deux racines à trois chiffres, justes quel que soit
 * le degré de subdivision du plan, et communes aux deux référentiels puisque
 * le SYCEBNL porte les mêmes 443 et 445, simplement non subdivisés.
 */

interface LigneTva {
  numero: string;
  debit: number;
  credit: number;
}

function service(lignes: LigneTva[]) {
  const agregations: { where: Record<string, unknown>; sum: { credit?: number; debit?: number } }[] = [];
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ regimeExigibiliteTva: 'DEBITS', dateAutorisationDebitsTva: null }),
    },
    tauxTva: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'tx16',
          code: 'TVA16',
          intitule: 'Taux normal 16 %',
          taux: 16,
          // Le taux ne pointe QUE sur 4431 et 4452 · c'est le défaut du semis,
          // et c'est précisément ce sur quoi la déclaration ne doit plus
          // s'appuyer.
          compteCollecteId: 'c4431',
          compteDeductibleId: 'c4452',
          estActif: true,
        },
      ]),
    },
    ligneEcriture: {
      aggregate: jest.fn().mockImplementation(({ where, _sum }: { where: Record<string, unknown>; _sum: Record<string, boolean> }) => {
        // Le calcul du prorata agrège lui aussi, sur d'autres critères · seules
        // les agrégations de la DÉCLARATION portent une racine de compte, et ce
        // sont les seules que ce spec observe.
        const compte = where.compte as { numero?: { startsWith?: string } } | undefined;
        const racine = compte?.numero?.startsWith;
        if (racine === undefined) return Promise.resolve({ _sum: { credit: 0, debit: 0 } });
        const retenues = lignes.filter((l) => l.numero.startsWith(racine));
        agregations.push({ where, sum: {} });
        return Promise.resolve({
          _sum: {
            credit: _sum.credit ? retenues.reduce((s, l) => s + l.credit, 0) : undefined,
            debit: _sum.debit ? retenues.reduce((s, l) => s + l.debit, 0) : undefined,
          },
        });
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
  return { svc: new TauxTvaService(prisma, {} as EcritureService), agregations };
}

const DEBUT = new Date('2026-03-01');
const FIN = new Date('2026-03-31');

describe('Déclaration de TVA · agrégation par famille de compte', () => {
  it('compte la TVA sur PRESTATIONS (4432), que le taux ne désigne pas', async () => {
    const { svc } = service([
      { numero: '44310000', debit: 0, credit: 100_000 },
      { numero: '44320000', debit: 0, credit: 60_000 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    // 160 000 et non 100 000 · le 4432 entrait sinon dans aucun total.
    expect(d.totalCollecte).toBe(160_000);
  });

  it('compte la TVA récupérable sur SERVICES EXTÉRIEURS (4454) et sur IMMOBILISATIONS (4451)', async () => {
    const { svc } = service([
      { numero: '44520000', debit: 40_000, credit: 0 },
      { numero: '44540000', debit: 25_000, credit: 0 },
      { numero: '44510000', debit: 80_000, credit: 0 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.totalDeductible).toBe(145_000);
  });

  it('ne confond jamais les deux familles · 443 au crédit, 445 au débit', async () => {
    const { svc } = service([
      { numero: '44330000', debit: 0, credit: 90_000 },
      { numero: '44530000', debit: 12_000, credit: 0 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.totalCollecte).toBe(90_000);
    expect(d.totalDeductible).toBe(12_000);
    expect(d.net).toBe(78_000);
    expect(d.sens).toBe('A_PAYER');
  });

  it('n’interroge PLUS la base par l’identifiant du compte porté par le taux', async () => {
    // Le défaut tenait dans un `compteId: t.compteCollecteId`. Aucune
    // agrégation ne doit plus filtrer sur un identifiant de compte.
    const { svc, agregations } = service([{ numero: '44310000', debit: 0, credit: 1000 }]);
    await svc.declaration('t1', DEBUT, FIN);
    expect(agregations.length).toBeGreaterThan(0);
    for (const a of agregations) {
      expect(a.where.compteId).toBeUndefined();
      expect(a.where.compte).toBeDefined();
    }
  });

  it('un dossier SYCEBNL, dont le plan ne subdivise pas, est servi par la même règle', async () => {
    // 44310000 et 44510000 sont les deux seules feuilles de son plan · les
    // mêmes racines les captent, sans branche de référentiel.
    const { svc } = service([
      { numero: '44310000', debit: 0, credit: 32_000 },
      { numero: '44510000', debit: 8_000, credit: 0 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.totalCollecte).toBe(32_000);
    expect(d.totalDeductible).toBe(8_000);
  });
});
