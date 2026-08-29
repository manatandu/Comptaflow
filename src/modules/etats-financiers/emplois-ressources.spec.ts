import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * TABLEAU EMPLOIS-RESSOURCES · le contrôle officiel du tableau lui-même
 * (« VII. CONTRÔLE : TOTAL V = TOTAL VI ») est le meilleur test possible :
 * il n'est vérifié que si les mouvements sont bien lus et les corrections de
 * dettes bien signées.
 */

function ligne(
  numero: string,
  classe: ClasseCompte,
  mouvement: { debit?: number; credit?: number },
  report: { debit?: number; credit?: number } = {},
) {
  const reportDebit = report.debit ?? 0;
  const reportCredit = report.credit ?? 0;
  const mouvementDebit = mouvement.debit ?? 0;
  const mouvementCredit = mouvement.credit ?? 0;
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    totalDebit: reportDebit + mouvementDebit,
    totalCredit: reportCredit + mouvementCredit,
    reportDebit,
    reportCredit,
    mouvementDebit,
    mouvementCredit,
    solde: reportDebit + mouvementDebit - reportCredit - mouvementCredit,
  };
}

function service(lignes: ReturnType<typeof ligne>[], options: { bailleurs?: { id: string; nom: string }[]; rattachements?: Record<string, string> } = {}) {
  const ecritureService = {
    balance: jest.fn().mockResolvedValue({ lignes, totaux: { debit: 0, credit: 0 } }),
  } as unknown as EcritureService;
  const exerciceService = { lister: jest.fn().mockResolvedValue([]) } as unknown as ExerciceService;
  const prisma = {
    bailleur: { findMany: jest.fn().mockResolvedValue(options.bailleurs ?? []) },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          (where.id?.in ?? [])
            .filter((id: string) => options.rattachements?.[id])
            .map((id: string) => ({ id, bailleurId: options.rattachements![id] })),
        ),
      ),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return new EtatsFinanciersProjetService(ecritureService, exerciceService, prisma);
}

const poste = (etat: { lignes: Array<{ ref: string }> }, ref: string) =>
  etat.lignes.find((l) => l.ref === ref) as {
    ref: string;
    libelle: string;
    montant: number;
    brut?: number;
    correction?: number;
  };

describe('Tableau emplois-ressources · projets de développement', () => {
  it('lit les ressources dans le MOUVEMENT CRÉDIT, pas dans le solde', async () => {
    // Un compte 462 ouvert avec un report ne doit pas voir ce report compté
    // comme une ressource de l'exercice.
    const s = service([ligne('46200000', ClasseCompte.CLASSE_4, { credit: 1_000_000 }, { credit: 400_000 })]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    expect(poste(er, 'FA').montant).toBe(1_000_000);
  });

  it('la correction de dettes S’AJOUTE : une dette qui augmente réduit l’emploi décaissé', async () => {
    // Charge de personnel de 200 000, dont 50 000 restent dus au 42.
    // Formule du guide : emploi = charge + dette N-1 − dette N = 150 000.
    // La lire comme une soustraction donnerait 250 000, soit plus que la
    // charge elle-même.
    const s = service([
      ligne('66100000', ClasseCompte.CLASSE_6, { debit: 200_000 }),
      ligne('42200000', ClasseCompte.CLASSE_4, { credit: 50_000 }),
    ]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    const fr = poste(er, 'FR');
    expect(fr.brut).toBe(200_000);
    expect(fr.correction).toBe(-50_000);
    expect(fr.montant).toBe(150_000);
  });

  it('le renvoi 8 RETRANCHE le mouvement crédit du 166, il ne l’ajoute pas', async () => {
    const s = service([
      ligne('67100000', ClasseCompte.CLASSE_6, { debit: 80_000 }),
      ligne('16600000', ClasseCompte.CLASSE_1, { credit: 30_000 }),
    ]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    expect(poste(er, 'FS').montant).toBe(50_000);
  });

  it('écarte le 603 du poste Achats · le guide l’exclut nommément du compte 60', async () => {
    const s = service([
      ligne('60100000', ClasseCompte.CLASSE_6, { debit: 500_000 }),
      ligne('60300000', ClasseCompte.CLASSE_6, { debit: 120_000 }),
    ]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    expect(poste(er, 'FM').montant).toBe(500_000);
  });

  it('FT se lit en SOLDE DÉBITEUR de clôture, seul poste d’emploi dans ce cas', async () => {
    const s = service([ligne('40910000', ClasseCompte.CLASSE_4, { debit: 90_000, credit: 30_000 })]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    expect(poste(er, 'FT').montant).toBe(60_000);
  });

  it('LE CONTRÔLE OFFICIEL BOUCLE · V = VI sur un projet entièrement décaissé', async () => {
    // 1 000 000 reçus du bailleur en banque ; 300 000 de matériel payés ;
    // 200 000 de personnel dont 50 000 non payés. Trésorerie de clôture :
    // 1 000 000 - 300 000 - 150 000 = 550 000.
    const s = service([
      ligne('46200000', ClasseCompte.CLASSE_4, { credit: 1_000_000 }),
      ligne('24110000', ClasseCompte.CLASSE_2, { debit: 300_000 }),
      ligne('66100000', ClasseCompte.CLASSE_6, { debit: 200_000 }),
      ligne('42200000', ClasseCompte.CLASSE_4, { credit: 50_000 }),
      ligne('52110000', ClasseCompte.CLASSE_5, { debit: 1_000_000, credit: 450_000 }),
    ]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    expect(er.totalRessources).toBe(1_000_000);
    expect(er.totalEmplois).toBe(450_000);
    expect(er.excedent).toBe(550_000);
    expect(er.encaisseDisponible).toBe(550_000);
    expect(er.fondsFinExercice).toBe(550_000);
    expect(er.controle.boucle).toBe(true);
    expect(er.controle.ecart).toBe(0);
  });

  it('émet une ligne PAR BAILLEUR quand les comptes de fonds leur sont rattachés', async () => {
    const s = service(
      [
        ligne('46210000', ClasseCompte.CLASSE_4, { credit: 600_000 }),
        ligne('46220000', ClasseCompte.CLASSE_4, { credit: 400_000 }),
      ],
      {
        bailleurs: [
          { id: 'b1', nom: 'Union européenne' },
          { id: 'b2', nom: 'USAID' },
        ],
        rattachements: { 'id-46210000': 'b1', 'id-46220000': 'b2' },
      },
    );
    const er = await s.tableauEmploisRessources('t1', 'e1');
    const fonds = er.lignes.filter((l) => l.libelle.startsWith('Fonds reçus, Bailleur'));
    expect(fonds.map((l) => l.libelle)).toEqual([
      'Fonds reçus, Bailleur Union européenne',
      'Fonds reçus, Bailleur USAID',
    ]);
    expect(fonds.map((l) => l.ref)).toEqual(['FA', 'FB']);
    expect(er.totalRessources).toBe(1_000_000);
  });

  it('signale un poste rendu négatif par la correction, sans masquer que le TOTAL reste juste', async () => {
    // Une immobilisation dont la dette est passée au 401 (fournisseurs
    // d'exploitation) au lieu du 481 : la correction du renvoi (4) tombe sur
    // les charges et les rend négatives. Le total des emplois, lui, est
    // exact. C'est une erreur d'imputation du dossier, pas du moteur, et
    // l'état doit la nommer.
    const s = service([
      ligne('24110000', ClasseCompte.CLASSE_2, { debit: 400_000 }),
      ligne('60100000', ClasseCompte.CLASSE_6, { debit: 300_000 }),
      ligne('40110000', ClasseCompte.CLASSE_4, { credit: 400_000 }),
    ]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    expect(poste(er, 'FM').montant).toBe(-100_000);
    expect(er.anomalies.map((a) => a.ref)).toEqual(['FM']);
    expect(er.anomalies[0].diagnostic).toContain('481');
    // 400 000 d'immobilisation - 100 000 de charges nettes : le décaissement
    // réel de la période est bien de 300 000.
    expect(er.totalEmplois).toBe(300_000);
  });

  it('déclare que la contrepartie État ne peut pas être isolée, au lieu de répartir au jugé', async () => {
    const s = service([ligne('52110000', ClasseCompte.CLASSE_5, { debit: 500_000 })]);
    const er = await s.tableauEmploisRessources('t1', 'e1');
    expect(poste(er, 'FY').montant).toBe(0);
    expect(poste(er, 'FZ').montant).toBe(500_000);
    expect(er.avertissements.some((a) => a.includes('contrepartie État'))).toBe(true);
  });
});
