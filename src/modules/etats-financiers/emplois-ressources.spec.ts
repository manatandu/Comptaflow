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

function service(
  lignes: ReturnType<typeof ligne>[],
  options: {
    bailleurs?: { id: string; nom: string }[];
    rattachements?: Record<string, string>;
    /**
     * Lignes CUMULÉES depuis l'origine (colonne « solde cumulé fin ») et
     * cumulées jusqu'à la fin de N-1 (colonne « solde cumulé début »). À
     * défaut, le cumul vaut l'exercice et le début est vide · c'est le
     * dossier qui n'a qu'un exercice, cas de la plupart des tests existants.
     */
    cumulFin?: ReturnType<typeof ligne>[];
    cumulDebut?: ReturnType<typeof ligne>[];
    exercicePrecedentId?: string;
  } = {},
) {
  const ecritureService = {
    balance: jest.fn().mockResolvedValue({ lignes, totaux: { debit: 0, credit: 0 } }),
    balanceCumulee: jest.fn().mockImplementation((_t: string, exerciceId: string) =>
      Promise.resolve({
        lignes:
          exerciceId === (options.exercicePrecedentId ?? '__aucun__')
            ? (options.cumulDebut ?? [])
            : (options.cumulFin ?? lignes),
        totaux: { debit: 0, credit: 0 },
      }),
    ),
  } as unknown as EcritureService;
  const exerciceService = {
    lister: jest.fn().mockResolvedValue(
      options.exercicePrecedentId
        ? [
            { id: 'e1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') },
            { id: options.exercicePrecedentId, dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') },
          ]
        : [],
    ),
  } as unknown as ExerciceService;
  const prisma = {
    bailleur: { findMany: jest.fn().mockResolvedValue(options.bailleurs ?? []) },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          // Deux formes d'appel : par identifiants (bilan, compte
          // d'exploitation) et par « tous les comptes rattachés à un
          // bailleur » (tableau emplois-ressources, qui lit les
          // rattachements une fois pour ses trois colonnes).
          (where.id?.in ?? Object.keys(options.rattachements ?? {}))
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
  /*
   * LES TROIS COLONNES DE LA MAQUETTE OFFICIELLE.
   *
   * « REF | DESIGNATION | SOLDE CUMULE DEBUT EXERCICE N | EXERCICE N | SOLDE
   * CUMULE FIN EXERCICE N » (SYCEBNL, Partie 4 ch. 3, Section 1). Le logiciel
   * n'en publiait qu'une. Ce qui manquait n'est pas un agrément de
   * présentation : un projet se finance sur une convention pluriannuelle, et
   * la colonne de l'exercice ne dit rien de ce qu'un bailleur a déjà versé.
   */
  describe('colonnes cumulées', () => {
    it('rend le CUMUL DEPUIS L’ORIGINE à côté du montant de l’exercice', async () => {
      // Le bailleur a versé 300 000 cette année, 800 000 depuis l'origine du
      // projet dont 500 000 avant l'ouverture de l'exercice.
      const s = service([ligne('46200000', ClasseCompte.CLASSE_4, { credit: 300_000 })], {
        exercicePrecedentId: 'e0',
        cumulFin: [ligne('46200000', ClasseCompte.CLASSE_4, { credit: 800_000 })],
        cumulDebut: [ligne('46200000', ClasseCompte.CLASSE_4, { credit: 500_000 })],
      });
      const er = await s.tableauEmploisRessources('t1', 'e1');
      const fa = poste(er, 'FA') as unknown as { montant: number; montantCumulDebut: number; montantCumulFin: number };
      expect(fa.montant).toBe(300_000);
      expect(fa.montantCumulDebut).toBe(500_000);
      expect(fa.montantCumulFin).toBe(800_000);
    });

    it('UN BAILLEUR QUI N’A RIEN VERSÉ CETTE ANNÉE GARDE SA LIGNE, avec son cumul', async () => {
      // Le cas que la colonne cumulée existe pour montrer : un bailleur qui a
      // financé les deux premières années et n'a rien versé cette année. Sa
      // ligne survit parce que les rattachements de comptes sont lus UNE fois,
      // hors période · les déduire des seuls mouvements de l'exercice le
      // ferait sortir du tableau, et les 800 000 déjà reçus ne seraient nulle
      // part. Rien ne se déséquilibre : le total de la colonne de l'exercice
      // reste juste.
      const s = service([], {
        bailleurs: [{ id: 'b-a', nom: 'Alpha' }],
        rattachements: { 'id-46200001': 'b-a' },
        exercicePrecedentId: 'e0',
        cumulFin: [ligne('46200001', ClasseCompte.CLASSE_4, { credit: 800_000 })],
        cumulDebut: [ligne('46200001', ClasseCompte.CLASSE_4, { credit: 800_000 })],
      });
      const er = await s.tableauEmploisRessources('t1', 'e1');
      const alpha = er.lignes.find((l) => l.libelle.includes('Alpha')) as unknown as {
        montant: number;
        montantCumulDebut: number;
        montantCumulFin: number;
      };
      expect(alpha.montant).toBe(0);
      expect(alpha.montantCumulDebut).toBe(800_000);
      expect(alpha.montantCumulFin).toBe(800_000);
    });

    it('apparie les lignes par leur CLÉ, jamais par leur RANG', async () => {
      // Le bloc des bailleurs est de LONGUEUR VARIABLE d'une colonne à
      // l'autre : la ligne « comptes non rattachés à un bailleur » n'existe
      // que si de tels comptes ont bougé sur la période. Ici elle n'existe
      // que sur le cumul. Un appariement positionnel décalerait alors toute
      // la suite du tableau d'une ligne, et le poste FC (fonds de
      // contrepartie État) recevrait les 400 000 des comptes non rattachés ·
      // un montant juste, sur la mauvaise ligne, dans un tableau dont tous
      // les totaux restent exacts.
      const bailleurs = [{ id: 'b-a', nom: 'Alpha' }];
      const rattachements = { 'id-46200001': 'b-a' };
      const s = service([ligne('46200001', ClasseCompte.CLASSE_4, { credit: 100_000 })], {
        bailleurs,
        rattachements,
        exercicePrecedentId: 'e0',
        cumulFin: [
          ligne('46200001', ClasseCompte.CLASSE_4, { credit: 900_000 }),
          ligne('46200099', ClasseCompte.CLASSE_4, { credit: 400_000 }),
        ],
        cumulDebut: [ligne('46200001', ClasseCompte.CLASSE_4, { credit: 800_000 })],
      });
      const er = await s.tableauEmploisRessources('t1', 'e1');
      const alpha = er.lignes.find((l) => l.libelle.includes('Alpha')) as unknown as {
        montant: number;
        montantCumulFin: number;
      };
      expect(alpha.montant).toBe(100_000);
      expect(alpha.montantCumulFin).toBe(900_000);
      const fc = poste(er, 'FC') as unknown as { montantCumulFin: number };
      expect(fc.montantCumulFin).toBe(0);
      // Et les fonds non rattachés apparaissent bien QUELQUE PART : ils sont
      // sur leur propre ligne, ajoutée depuis le cumul.
      const nonRattaches = er.lignes.find((l) => l.libelle.includes('non rattachés')) as unknown as {
        montantCumulFin: number;
      };
      expect(nonRattaches.montantCumulFin).toBe(400_000);
    });

    it('vérifie le CONTRÔLE VII sur chacune des trois colonnes', async () => {
      // « VII. CONTRÔLE : TOTAL V = TOTAL VI ». Sur une colonne cumulée, IV
      // est le fonds disponible à l'ORIGINE (le bilan d'ouverture) et VI le
      // fonds à la fin de la fenêtre · sans ce contrôle, un cumul faux se
      // lirait comme une simple addition.
      const s = service(
        [
          ligne('46200000', ClasseCompte.CLASSE_4, { credit: 300_000 }),
          ligne('52110000', ClasseCompte.CLASSE_5, { debit: 300_000 }),
        ],
        {
          exercicePrecedentId: 'e0',
          cumulFin: [
            ligne('46200000', ClasseCompte.CLASSE_4, { credit: 800_000 }),
            ligne('52110000', ClasseCompte.CLASSE_5, { debit: 800_000 }),
          ],
          cumulDebut: [
            ligne('46200000', ClasseCompte.CLASSE_4, { credit: 500_000 }),
            ligne('52110000', ClasseCompte.CLASSE_5, { debit: 500_000 }),
          ],
        },
      );
      const er = await s.tableauEmploisRessources('t1', 'e1');
      expect(er.controle.boucle).toBe(true);
      expect(er.controle.cumulFin.boucle).toBe(true);
      expect(er.controle.cumulDebut.boucle).toBe(true);
    });
  });
});
