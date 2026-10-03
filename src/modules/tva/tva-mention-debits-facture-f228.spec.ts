import { readFileSync } from 'fs';
import { join } from 'path';
import { NatureFacture, SensFacture } from '@prisma/client';
import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * AUDIT FINAL F228 · un commentaire et un message de la TVA dépassés.
 *
 * (1) LA MENTION DE L'ART. 60 SE LIT SUR LA FACTURE D'ACHAT ENREGISTRÉE.
 * Décret n° 011/42, art. 60 : « La mention "Autorisation d'acquitter la TVA
 * d'après les débits" doit figurer sur toutes les factures délivrées par le
 * prestataire de services ou l'entrepreneur de travaux publics ou de travaux
 * immobiliers. » La déclaration écrivait qu'elle « se prouve par la mention
 * portée sur la facture, qu'OmegaX ne peut pas vérifier », alors que la
 * facture rattachée à l'écriture porte `mentionTvaDebits`. Elle la lit
 * désormais · pour dire ce que l'anticipation a de prouvé, et ce que la fiche
 * du fournisseur ne dit pas encore. La DATE de la déduction ne change pas :
 * elle suit toujours la fiche (art. 26, décret art. 58 et 59).
 *
 * (2) LE COMMENTAIRE DU PRORATA CITAIT UNE CONDITION ABSENTE, `if (tva >
 * 0.005)` dans `ModelesSaisie.tsx`, qui n'y est plus · la ligne au taux zéro
 * est posée par `construireLigneTva`. Un commentaire qui cite du code se
 * vérifie contre ce code.
 *
 * LA DOUBLURE HONORE LE `select` · la pièce n'est rendue que si la requête la
 * demande, et seulement dans les colonnes demandées. Une correction qui
 * dépend de ce que la requête RAMÈNE se teste sur la requête elle-même.
 */

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'TVA 16 %',
  taux: 16,
  compteCollecteId: 'c443',
  compteDeductibleId: 'c445',
};

type Contrepartie = { autorise: boolean; reference?: string | null };
type Piece = { sens: SensFacture; mentionTvaDebits: boolean; nature?: NatureFacture } | null;

/** Une facture d'achat de services, impayée, rattachée ou non à une pièce enregistrée. */
function achat(opts: { date: string; tva: number; fournisseur: Contrepartie; piece: Piece }) {
  return {
    id: `l-${opts.date}-${opts.tva}`,
    tauxTvaId: TAUX.id,
    compteId: 'c4454',
    compte: { numero: '44540000' },
    debit: opts.tva,
    credit: 0,
    piece: opts.piece,
    ecriture: {
      date: new Date(opts.date),
      lignes: [
        {
          debit: 0,
          credit: opts.tva * 7.25,
          compte: {
            numero: '40110001',
            classe: 'CLASSE_4',
            tiersCompte: {
              tiers: {
                autoriseTvaDebits: opts.fournisseur.autorise,
                referenceAutorisationDebits: opts.fournisseur.reference ?? null,
              },
            },
          },
          lettrage: { statut: 'PARTIEL', solde: opts.tva * 7.25, soldeAt: null, lignes: [] },
        },
        { debit: opts.tva * 6.25, credit: 0, compte: { numero: '62400000', classe: 'CLASSE_6', tiersCompte: null }, lettrage: null },
      ],
    },
  };
}

function service(lignesTva: ReturnType<typeof achat>[]) {
  const findMany = jest.fn().mockImplementation(({ where, select }: { where: Record<string, unknown>; select?: any }) => {
    const compte = where.compte as { OR?: unknown } | undefined;
    if (!compte?.OR) return Promise.resolve([]);
    // Ne rend de la pièce QUE les colonnes que la requête demande.
    const colonnes: Record<string, boolean> | undefined = select?.ecriture?.select?.facture?.select;
    return Promise.resolve(
      lignesTva.map(({ piece, ...l }) => ({
        ...l,
        ecriture: {
          ...l.ecriture,
          facture:
            colonnes && piece
              ? Object.fromEntries(Object.entries(piece).filter(([cle]) => colonnes[cle]))
              : null,
        },
      })),
    );
  });
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
    ligneEcriture: {
      findMany,
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    regularisationTvaCreance: { findMany: jest.fn().mockResolvedValue([]) },
    tvaVenteDeclaree: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    mouvementCreanceDouteuse: { findMany: jest.fn().mockResolvedValue([]) },
    liquidationTva: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return { s: new TauxTvaService(prisma, {} as EcritureService), findMany };
}

const MARS = new Date('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');
const AUTORISE: Contrepartie = { autorise: true, reference: 'DGI/DIR.GEN/2025/1142' };
const NON_RENSEIGNE: Contrepartie = { autorise: false };
const ACHAT_AVEC_MENTION: Piece = { sens: SensFacture.ACHAT, mentionTvaDebits: true, nature: NatureFacture.FACTURE };
const ACHAT_SANS_MENTION: Piece = { sens: SensFacture.ACHAT, mentionTvaDebits: false, nature: NatureFacture.FACTURE };
const VENTE_AVEC_MENTION: Piece = { sens: SensFacture.VENTE, mentionTvaDebits: true, nature: NatureFacture.FACTURE };

describe('F228 · la mention de l’art. 60 se LIT sur la facture d’achat enregistrée', () => {
  it('la requête de la déclaration demande le sens de la pièce et sa mention des débits', async () => {
    const { s, findMany } = service([achat({ date: '2026-03-10', tva: 160_000, fournisseur: AUTORISE, piece: null })]);
    await s.declaration('t1', MARS, FIN_MARS);
    const appel = findMany.mock.calls.find(([arg]) => (arg.where?.compte as { OR?: unknown })?.OR);
    expect(appel?.[0].select.ecriture.select.facture.select).toEqual({ nature: true, sens: true, mentionTvaDebits: true });
  });

  it('une anticipation dont la facture d’achat PORTE la mention est dite prouvée par la pièce', async () => {
    const { s } = service([achat({ date: '2026-03-10', tva: 160_000, fournisseur: AUTORISE, piece: ACHAT_AVEC_MENTION })]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    const p = d.mentionExigibilite;
    expect(p).toContain('FOURNISSEURS AUTORISÉS AUX DÉBITS');
    expect(p).toContain('qu’OmegaX lit sur la facture d’achat enregistrée et rattachée à l’écriture');
    expect(p).toContain('Chacune de ces écritures est rattachée à une facture d’achat enregistrée qui la porte.');
    // La date ne bouge pas · la déduction reste anticipée, du même montant.
    expect(d.totalDeductible).toBe(160_000);
  });

  it('une anticipation SANS facture qui porte la mention nomme le montant à vérifier sur la pièce', async () => {
    const { s } = service([
      achat({ date: '2026-03-10', tva: 160_000, fournisseur: AUTORISE, piece: ACHAT_AVEC_MENTION }),
      achat({ date: '2026-03-12', tva: 48_000, fournisseur: AUTORISE, piece: ACHAT_SANS_MENTION }),
      achat({ date: '2026-03-14', tva: 32_000, fournisseur: AUTORISE, piece: null }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    const p = d.mentionExigibilite;
    expect(p).toContain(
      `${(80_000).toLocaleString('fr-FR')} CDF ne reposent sur aucune facture d’achat enregistrée où la mention soit cochée`,
    );
    expect(d.totalDeductible).toBe(240_000);
  });

  it('la mention d’une facture de VENTE ne prouve rien du fournisseur', async () => {
    // La mention d'une vente est celle du DOSSIER pour sa propre collecte.
    const { s } = service([achat({ date: '2026-03-10', tva: 160_000, fournisseur: AUTORISE, piece: VENTE_AVEC_MENTION })]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.mentionExigibilite).toContain(
      `${(160_000).toLocaleString('fr-FR')} CDF ne reposent sur aucune facture d’achat enregistrée`,
    );
  });

  it('une déduction DIFFÉRÉE dont la facture d’achat porte la mention invite à renseigner la fiche, sans rien avancer', async () => {
    const { s } = service([
      achat({ date: '2026-03-10', tva: 160_000, fournisseur: NON_RENSEIGNE, piece: ACHAT_AVEC_MENTION }),
      achat({ date: '2026-03-12', tva: 48_000, fournisseur: NON_RENSEIGNE, piece: null }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    const p = d.mentionExigibilite;
    expect(p).toContain('DÉDUCTION SUR SERVICES');
    expect(p).toContain(
      `Dont ${(160_000).toLocaleString('fr-FR')} CDF sur une facture d’achat enregistrée qui PORTE la mention`,
    );
    // L'exigibilité à la facture (art. 61) ne fait naître la déduction du
    // client que par l'art. 96 · les deux articles sont cités.
    expect(p).toContain('la déduction naîtra alors à la facture (décret art. 61 et 96)');
    // LA DATE SUIT LA FICHE · rien n'est déduit avant le paiement.
    expect(d.totalDeductible).toBe(0);
  });

  it('sans facture qui porte la mention, la déduction différée ne s’en invente pas', async () => {
    const { s } = service([achat({ date: '2026-03-12', tva: 48_000, fournisseur: NON_RENSEIGNE, piece: ACHAT_SANS_MENTION })]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    const p = d.mentionExigibilite;
    expect(p).toContain('OmegaX ne PEUT pas avancer la déduction');
    // Une case non cochée n'est pas une mention lue · aucune invitation.
    expect(p).not.toContain('qui PORTE la mention');
  });
});

describe('F228 · un commentaire qui cite du code se vérifie contre ce code', () => {
  it('le commentaire du prorata cite une condition qui existe dans le fichier qu’il nomme', () => {
    const source = readFileSync(join(__dirname, 'taux-tva.service.ts'), 'utf8');
    const debut = source.indexOf("TROIS AGRÉGATS PLUTÔT QU'UN FILTRE NÉGATIF UNIQUE.");
    expect(debut).toBeGreaterThan(0);
    const bloc = source.slice(debut, source.indexOf('*/', debut));
    const cites = [...bloc.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    // Serveur comme client · un chemin cité qui n'existe plus fait tomber la
    // lecture du fichier, et c'est voulu.
    const fichiers = cites.filter((c) => /^(client\/)?src\/.+\.tsx?$/.test(c));
    const conditions = cites.filter((c) => c.includes('(') && !fichiers.includes(c));
    // Il y a bien un fichier et une condition cités · un bloc qui ne cite plus
    // rien passerait sans rien vérifier.
    expect(fichiers.length).toBeGreaterThan(0);
    expect(conditions.length).toBeGreaterThan(0);
    const racine = join(__dirname, '..', '..', '..');
    const textes = fichiers.map((f) => readFileSync(join(racine, f), 'utf8'));
    for (const condition of conditions) {
      expect({ condition, trouvee: textes.some((t) => t.includes(condition)) }).toEqual({ condition, trouvee: true });
    }
  });
});
