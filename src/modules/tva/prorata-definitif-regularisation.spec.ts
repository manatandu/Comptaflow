import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LA RÉGULARISATION DU PRORATA PORTE SUR LES DÉDUCTIONS RÉELLEMENT OPÉRÉES.
 *
 * Art. 45, al. 2 : « Le prorata définitif est arrêté au plus tard le 31 mars
 * de l'année suivante. LES DÉDUCTIONS OPÉRÉES sont régularisées en conséquence
 * à l'échéance qui suit. » Le décret n° 011/42, art. 128, en donne le sens :
 * définitif supérieur au provisoire, déduction complémentaire ; inférieur,
 * reversement.
 *
 * Le calcul ne lisait pas les déductions opérées : il RECALCULAIT un provisoire
 * sur l'année N−1 et le tenait pour le taux appliqué, alors que le taux
 * réellement appliqué est stocké liquidation par liquidation
 * (`LiquidationTva.prorataApplique`). Deux conséquences :
 *
 *  · quand N−1 était vide, le « provisoire appliqué » devenait le définitif
 *    lui-même et la régularisation sortait NULLE PAR CONSTRUCTION. C'est le cas
 *    du nouvel assujetti, celui-là même qui a déclaré toute l'année sur des
 *    estimations mensuelles variables · l'écran concluait « Aucune
 *    régularisation · le définitif rejoint le provisoire », ce qui était faux ;
 *  · un dossier dont le provisoire a changé en cours d'année voyait tout son
 *    exercice régularisé au dernier taux venu.
 *
 * L'assiette était fausse elle aussi : la somme des seuls DÉBITS des comptes
 * 445x comptait un avoir fournisseur comme de la taxe déduite de plus.
 */

interface Ligne445 {
  date: string;
  debit?: number;
  credit?: number;
}

interface Liquidation {
  dateDebut: string;
  dateFin: string;
  prorataApplique: number;
}

function service(opts: {
  /** Recettes de classe 7 de l'année · commandent le prorata définitif. */
  recettes: number;
  /** TVA collectée de l'année, au taux normal · numérateur du définitif. */
  tvaCollectee: number;
  lignes445: Ligne445[];
  liquidations: Liquidation[];
}) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    compte: { findMany: jest.fn().mockResolvedValue([{ id: 'c445' }]) },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue([
        { credit: opts.tvaCollectee, ecritureId: 'e1', compte: { numero: '44310000' }, tauxTva: { taux: 16 } },
      ]),
      aggregate: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        // TVA d'amont · reconnaissable à sa sélection par identifiants de
        // compte, la seule du service à en porter.
        if (where.compteId) {
          const date = (where.ecriture as { date: { gte: Date; lte: Date } }).date;
          const retenues = opts.lignes445.filter((l) => {
            const d = new Date(l.date);
            return d >= date.gte && d <= date.lte;
          });
          return Promise.resolve({
            _sum: {
              debit: retenues.reduce((s, l) => s + (l.debit ?? 0), 0),
              credit: retenues.reduce((s, l) => s + (l.credit ?? 0), 0),
            },
          });
        }
        // Recettes exclues du dénominateur · aucune ici.
        if ((where.compte as { OR?: unknown })?.OR) return Promise.resolve({ _sum: { credit: 0 } });
        return Promise.resolve({ _sum: { credit: opts.recettes } });
      }),
    },
    liquidationTva: {
      findMany: jest.fn().mockResolvedValue(
        opts.liquidations.map((l, i) => ({
          id: `liq${i}`,
          dateDebut: new Date(l.dateDebut),
          dateFin: new Date(l.dateFin),
          prorataApplique: l.prorataApplique,
        })),
      ),
    },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

/** Prorata définitif de 55 % · 55 000 000 de base taxable sur 100 000 000. */
const RECETTES = 100_000_000;
const TVA_COLLECTEE = 8_800_000;

describe('Prorata définitif · régularisation des déductions RÉELLEMENT opérées (art. 45)', () => {
  it('lit le prorata appliqué à CHAQUE période liquidée, au lieu d’en recalculer un seul', async () => {
    // Le nouvel assujetti a déclaré toute l'année sur des estimations
    // successives (90 %, 40 %, 70 %) : c'est sur ELLES que la régularisation
    // se fait, pas sur un provisoire reconstruit à partir d'une année N−1 qui
    // n'existe pas.
    const s = service({
      recettes: RECETTES,
      tvaCollectee: TVA_COLLECTEE,
      lignes445: [
        { date: '2026-02-10', debit: 3_000_000 },
        { date: '2026-06-10', debit: 3_000_000 },
        { date: '2026-10-10', debit: 2_000_000 },
      ],
      liquidations: [
        { dateDebut: '2026-01-01', dateFin: '2026-04-30', prorataApplique: 90 },
        { dateDebut: '2026-05-01', dateFin: '2026-08-31', prorataApplique: 40 },
        { dateDebut: '2026-09-01', dateFin: '2026-12-31', prorataApplique: 70 },
      ],
    });
    const r = await s.prorataDefinitif('t1', 2026);
    expect(r.definitif.pourcentage).toBe(55);
    // 3 000 000 × 90 % + 3 000 000 × 40 % + 2 000 000 × 70 % = 5 300 000.
    expect(r.admiseAppliquee).toBe(5_300_000);
    // 8 000 000 × 55 % = 4 400 000.
    expect(r.admiseDefinitive).toBe(4_400_000);
    expect(r.regularisation).toBe(-900_000);
    expect(r.sens).toBe('REVERSEMENT');
    // L'ANCIEN COMPORTEMENT : sans année N−1, le provisoire « appliqué »
    // devenait le définitif et la régularisation sortait à zéro.
    expect(r.regularisation).not.toBe(0);
  });

  it('rend le DÉTAIL par période · un taux moyen seul ne se vérifie pas', async () => {
    const s = service({
      recettes: RECETTES,
      tvaCollectee: TVA_COLLECTEE,
      lignes445: [
        { date: '2026-02-10', debit: 3_000_000 },
        { date: '2026-06-10', debit: 3_000_000 },
        { date: '2026-10-10', debit: 2_000_000 },
      ],
      liquidations: [
        { dateDebut: '2026-01-01', dateFin: '2026-04-30', prorataApplique: 90 },
        { dateDebut: '2026-05-01', dateFin: '2026-08-31', prorataApplique: 40 },
        { dateDebut: '2026-09-01', dateFin: '2026-12-31', prorataApplique: 70 },
      ],
    });
    const r = await s.prorataDefinitif('t1', 2026);
    expect(r.periodes).toHaveLength(3);
    expect(r.periodes[1]).toMatchObject({
      dateDebut: '2026-05-01',
      pourcentageApplique: 40,
      tvaDeductibleBrute: 3_000_000,
      deduite: 1_200_000,
    });
    // Moyenne PONDÉRÉE par l'assiette de chaque période · 5 300 000 / 8 000 000.
    expect(r.pourcentageApplique).toBe(66.25);
  });

  it('l’assiette se lit en SOLDE · un avoir fournisseur n’est pas de la taxe déduite', async () => {
    const s = service({
      recettes: RECETTES,
      tvaCollectee: TVA_COLLECTEE,
      lignes445: [
        { date: '2026-02-10', debit: 4_000_000 },
        { date: '2026-03-15', credit: 1_000_000 },
      ],
      liquidations: [{ dateDebut: '2026-01-01', dateFin: '2026-12-31', prorataApplique: 80 }],
    });
    const r = await s.prorataDefinitif('t1', 2026);
    // 4 000 000 − 1 000 000 et non 4 000 000.
    expect(r.tvaDeductibleBrute).toBe(3_000_000);
    expect(r.admiseAppliquee).toBe(2_400_000);
    expect(r.admiseDefinitive).toBe(1_650_000);
  });

  it('SANS liquidation, ne prétend pas que « le définitif rejoint le provisoire »', async () => {
    // Aucune déduction opérée n'est tracée : la régularisation ne peut pas
    // être chiffrée, et c'est autre chose qu'un écart nul. L'écran ne rend
    // qu'un texte libre, `echeance` · c'est là que la raison est portée.
    const s = service({
      recettes: RECETTES,
      tvaCollectee: TVA_COLLECTEE,
      lignes445: [{ date: '2026-02-10', debit: 4_000_000 }],
      liquidations: [],
    });
    const r = await s.prorataDefinitif('t1', 2026);
    expect(r.regularisation).toBe(0);
    expect(r.pourcentageApplique).toBe(0);
    expect(r.echeance).toContain('Aucune liquidation');
    expect(r.echeance).toContain('31 mars 2027');
    // La TVA d'amont de l'année reste rendue, elle · elle existe.
    expect(r.tvaDeductibleBruteAnnee).toBe(4_000_000);
  });

  it('annonce la part de l’année que AUCUNE liquidation ne couvre', async () => {
    // Elle n'a donné lieu à aucune déduction opérée · la régulariser
    // reviendrait à corriger une déduction qui n'a pas eu lieu.
    const s = service({
      recettes: RECETTES,
      tvaCollectee: TVA_COLLECTEE,
      lignes445: [
        { date: '2026-02-10', debit: 3_000_000 },
        { date: '2026-11-10', debit: 5_000_000 },
      ],
      liquidations: [{ dateDebut: '2026-01-01', dateFin: '2026-06-30', prorataApplique: 80 }],
    });
    const r = await s.prorataDefinitif('t1', 2026);
    expect(r.tvaDeductibleBrute).toBe(3_000_000);
    expect(r.tvaDeductibleBruteAnnee).toBe(8_000_000);
    expect(r.tvaDeductibleNonLiquidee).toBe(5_000_000);
    expect(r.echeance).toContain('aucune liquidation');
    expect(r.echeance).toContain('31 mars 2027');
  });
});
