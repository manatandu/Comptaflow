import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersSyscohadaService } from './etats-financiers-syscohada.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { ORDRE_AFFICHAGE_COMPTE_RESULTAT } from './correspondance-compte-resultat-syscohada';
import { CONTROLE_ZH_PAR_LES_FLUX, TOUS_LES_POSTES_FLUX_SYSCOHADA, besoinsDuPoste } from './correspondance-tft-syscohada';

/**
 * Ce spec ne re-teste pas les tables de correspondance (leurs specs voisins
 * s'en chargent, poste par poste et compte par compte contre le plan semé) :
 * il teste ce que le SERVICE peut casser EN SILENCE, c'est-à-dire un état qui
 * ne boucle plus.
 *
 * Les quatre bouclages du texte officiel, chacun couvert ici :
 *  - BILAN · total actif = total passif (AUDCIF Titre IX ch. 3 section 2, les
 *    deux rubriques BZ et DZ portant le même libellé « TOTAL GÉNÉRAL ») ;
 *  - COMPTE DE RÉSULTAT · XI, obtenu par les sommes du modèle (ch. 4 section
 *    2, « logique de signe »), doit valoir le solde de TOUTES les classes de
 *    gestion, celui-là même que le bilan loge en CJ ;
 *  - TFT · ZH par le cumul des flux (G + A) doit valoir ZH par le bilan
 *    (« Contrôle : Trésorerie actif N – Trésorerie passif N », ch. 5 section
 *    2), les deux calculs restant indépendants ;
 *  - DÉCOUVERT BANCAIRE · un 52 créditeur va au passif (DR) et n'est PAS
 *    laissé en négatif à l'actif : c'est le cas où un bilan reste « équilibré »
 *    tout en étant faux du double du découvert.
 *
 * Les numéros de comptes utilisés sont ceux du plan SYSCOHADA semé
 * (`compte-seed-syscohada.ts`, généré depuis le skill `syscohada`), à une
 * exception commentée sur place : le compte de gestion hors plan, qui teste
 * précisément le comportement face à un plan personnalisé.
 */

/**
 * Fabrique une ligne de balance telle que `EcritureService.balance()` la
 * renvoie · les six agrégats, dont la scission report / mouvement sans
 * laquelle le tableau de flux lirait un report à-nouveau comme une
 * acquisition de l'exercice.
 */
function ligne(
  numero: string,
  classe: ClasseCompte,
  mouvementDebit: number,
  mouvementCredit: number,
  report: { debit?: number; credit?: number } = {},
  typeCompte: TypeCompteDetailTotal = TypeCompteDetailTotal.DETAIL,
) {
  const reportDebit = report.debit ?? 0;
  const reportCredit = report.credit ?? 0;
  const totalDebit = reportDebit + mouvementDebit;
  const totalCredit = reportCredit + mouvementCredit;
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe,
    typeCompte,
    totalDebit,
    totalCredit,
    reportDebit,
    reportCredit,
    mouvementDebit,
    mouvementCredit,
    solde: totalDebit - totalCredit,
  };
}

type LigneBalance = ReturnType<typeof ligne>;

function serviceAvecExercices(
  lignesParExercice: Record<string, LigneBalance[]>,
  exercices: Array<{ id: string; dateDebut: Date }> = [],
) {
  const ecritureService = {
    balance: jest.fn().mockImplementation((_tenantId: string, exerciceId: string) => {
      const lignes = lignesParExercice[exerciceId] ?? [];
      return Promise.resolve({
        lignes,
        totaux: {
          debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
          credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
        },
      });
    }),
  } as unknown as EcritureService;
  const exerciceService = {
    // ExerciceService.lister() trie par dateDebut décroissant · répliqué ici,
    // c'est sur ce tri que `trouverExerciceN1` s'appuie.
    lister: jest.fn().mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;
  return new EtatsFinanciersSyscohadaService(ecritureService, exerciceService);
}

/** Un seul exercice ('e1'), sans antérieur. */
function serviceAvecBalance(lignes: LigneBalance[]) {
  return serviceAvecExercices({ e1: lignes });
}

const C1 = ClasseCompte.CLASSE_1;
const C2 = ClasseCompte.CLASSE_2;
const C4 = ClasseCompte.CLASSE_4;
const C5 = ClasseCompte.CLASSE_5;
const C6 = ClasseCompte.CLASSE_6;
const C7 = ClasseCompte.CLASSE_7;
const C9 = ClasseCompte.CLASSE_9;

/**
 * DOSSIER DE RÉFÉRENCE · deux exercices, balances équilibrées, et un jeu
 * d'écritures choisi pour que le tableau des flux BOUCLE EXACTEMENT (écart 0).
 * Il sert aux trois états à la fois, ce qui est le point : les trois lisent la
 * même balance et doivent se répondre.
 *
 * Exercice e1 (N-1) · le dossier ouvre : capital 10 000 souscrit et versé en
 * banque, un véhicule de 6 000 amorti de 1 000, 2 000 de créances clients,
 * 500 de dettes fournisseurs, 3 500 en banque.
 *   Actif 5 000 (AN net) + 2 000 (BI) + 3 500 (BS) = 10 500
 *   Passif 10 000 (CA) + 500 (DJ) = 10 500
 *
 * Exercice e2 (N) · reprise en report à-nouveau, puis 8 000 de ventes dont
 * 7 000 encaissées, 5 000 d'achats dont 4 800 réglés, 1 500 de salaires payés,
 * 500 de dotation aux amortissements (sans trésorerie), et une écriture de
 * liaison siège/établissement de 400 (186 contre 187) qu'AUCUN poste du bilan
 * ni du tableau de flux ne réclame · anomalie n° 5 de la table du bilan et
 * n° 17 de celle du TFT, présente ici exprès pour vérifier qu'elle ressort.
 *   Actif 4 500 (AN net) + 3 000 (BI) + 4 200 (BS) = 11 700
 *   Passif 10 000 (CA) + 1 000 (CJ) + 700 (DJ) = 11 700
 *   Trésorerie : 3 500 à l'ouverture, 4 200 à la clôture, variation +700.
 */
const LIGNES_E1: LigneBalance[] = [
  ligne('10130000', C1, 0, 10000),
  ligne('24510000', C2, 6000, 0),
  ligne('28450000', C2, 0, 1000),
  ligne('41110000', C4, 2000, 0),
  ligne('40110000', C4, 0, 500),
  ligne('52110000', C5, 3500, 0),
];

const LIGNES_E2: LigneBalance[] = [
  ligne('10130000', C1, 0, 0, { credit: 10000 }),
  ligne('24510000', C2, 0, 0, { debit: 6000 }),
  ligne('28450000', C2, 0, 500, { credit: 1000 }),
  ligne('41110000', C4, 8000, 7000, { debit: 2000 }),
  ligne('40110000', C4, 4800, 5000, { credit: 500 }),
  ligne('52110000', C5, 7000, 6300, { debit: 3500 }),
  ligne('70110000', C7, 0, 8000), // TA · ventes de marchandises
  ligne('60110000', C6, 5000, 0), // RA · achats de marchandises
  ligne('66110000', C6, 1500, 0), // RK · charges de personnel
  ligne('68130000', C6, 500, 0), // RL · dotation aux amortissements
  ligne('18600000', C1, 400, 0), // compte de liaison charges · sans poste
  ligne('18700000', C1, 0, 400), // compte de liaison produits · sans poste
];

const EXERCICES = [
  { id: 'e1', dateDebut: new Date('2025-01-01') },
  { id: 'e2', dateDebut: new Date('2026-01-01') },
];

function serviceDeReference() {
  return serviceAvecExercices({ e1: LIGNES_E1, e2: LIGNES_E2 }, EXERCICES);
}

describe('EtatsFinanciersSyscohadaService', () => {
  // =========================================================================
  describe('bilan', () => {
    const poste = (bilan: Awaited<ReturnType<EtatsFinanciersSyscohadaService['bilan']>>, ref: string) =>
      [...bilan.actif, ...bilan.passif].find((p) => p.ref === ref);

    it('équilibre le dossier de référence et loge chaque compte au poste du ch. 7', async () => {
      const bilan = await serviceDeReference().bilan('t1', 'e2');

      expect(poste(bilan, 'AN')?.brut).toBe(6000);
      expect(poste(bilan, 'AN')?.amortissement).toBe(1500); // magnitude POSITIVE, colonne officielle
      expect(poste(bilan, 'AN')?.montant).toBe(4500); // net = brut - amortissements
      expect(poste(bilan, 'BI')?.montant).toBe(3000);
      expect(poste(bilan, 'BS')?.montant).toBe(4200);
      expect(poste(bilan, 'CA')?.montant).toBe(10000);
      expect(poste(bilan, 'CJ')?.montant).toBe(1000);
      expect(poste(bilan, 'DJ')?.montant).toBe(700);

      // Totalisations du modèle : AI = AJ à AN, AZ = AD + AI + AP + AQ
      // (anomalie n° 13 de la table : AP est une rubrique sœur de AI).
      expect(poste(bilan, 'AI')?.montant).toBe(4500);
      expect(poste(bilan, 'AZ')?.montant).toBe(4500);
      expect(poste(bilan, 'BG')?.montant).toBe(3000);
      expect(poste(bilan, 'BT')?.montant).toBe(4200);
      expect(poste(bilan, 'CP')?.montant).toBe(11000);
      expect(poste(bilan, 'DP')?.montant).toBe(700);

      expect(bilan.totalActif).toBe(11700);
      expect(bilan.totalPassif).toBe(11700);
      expect(bilan.equilibre).toBe(true);
      expect(poste(bilan, 'BZ')?.estTotal).toBe(true);
      expect(poste(bilan, 'AN')?.estTotal).toBe(false);
    });

    it('n’imprime pas de drill-down sous une rubrique de totalisation', async () => {
      const bilan = await serviceDeReference().bilan('t1', 'e2');
      // Les comptes de AN sont déjà sous AN : les répéter sous AI, AZ puis BZ
      // ferait croire à un triple compte du même véhicule.
      expect(poste(bilan, 'BZ')?.comptes).toEqual([]);
      expect(poste(bilan, 'AN')?.comptes.map((c) => c.numero)).toEqual(['24510000', '28450000']);
    });

    it('porte le comparatif N-1 quand l’exercice antérieur existe, et rien quand il n’existe pas', async () => {
      const avecN1 = await serviceDeReference().bilan('t1', 'e2');
      expect(avecN1.exerciceN1Disponible).toBe(true);
      expect(poste(avecN1, 'AN')?.montantN1).toBe(5000); // 6000 - 1000
      expect(poste(avecN1, 'AN')?.brutN1).toBe(6000);
      expect(avecN1.totalActifN1).toBe(10500);

      const sansN1 = await serviceDeReference().bilan('t1', 'e1');
      expect(sansN1.exerciceN1Disponible).toBe(false);
      // Jamais un faux zéro : le comparatif est ABSENT, il ne vaut pas 0.
      expect(poste(sansN1, 'AN')?.montantN1).toBeUndefined();
      expect(sansN1.totalActifN1).toBeUndefined();
    });

    /**
     * DÉCOUVERT BANCAIRE · ch. 7, clés de lecture : « 52, 53 vont en BS si
     * débiteurs, DR si créditeurs ». Laisser le compte des deux côtés compte
     * le découvert DEUX FOIS, en négatif à l'actif et en positif au passif :
     * le bilan reste « équilibré » et se trouve faux du double du découvert.
     */
    it('transfère un 52 créditeur de BS vers DR, sans double comptage', async () => {
      const service = serviceAvecBalance([
        ligne('10130000', C1, 0, 700),
        ligne('57110000', C5, 1000, 0), // caisse débitrice · reste en BS
        ligne('52110000', C5, 0, 300), // banque à découvert · part en DR
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'BS')?.montant).toBe(1000);
      expect(poste(bilan, 'BS')?.comptes.map((c) => c.numero)).toEqual(['57110000']);
      expect(poste(bilan, 'DR')?.montant).toBe(300);
      expect(poste(bilan, 'DR')?.comptes.map((c) => c.numero)).toEqual(['52110000']);
      // 700 si le découvert était resté en négatif à l'actif tout en étant
      // repris au passif ; 1 300 s'il avait été compté deux fois en positif.
      expect(bilan.totalActif).toBe(1000);
      expect(poste(bilan, 'BT')?.montant).toBe(1000);
      expect(poste(bilan, 'DT')?.montant).toBe(300);
      expect(bilan.totalPassif).toBe(1000);
      expect(bilan.equilibre).toBe(true);
    });

    it('laisse un 57 créditeur VISIBLE en négatif dans BS · aucun poste de passif ne l’accueille', async () => {
      // Anomalie n° 3 de la table : appliquer à la lettre le qualificatif
      // « soldes débiteurs » de BS ferait DISPARAÎTRE du bilan une caisse
      // créditrice, sans autre signe qu'un total faux.
      const service = serviceAvecBalance([
        ligne('10130000', C1, 0, 700),
        ligne('52110000', C5, 1000, 0),
        ligne('57110000', C5, 0, 300),
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'BS')?.montant).toBe(700);
      expect(poste(bilan, 'BS')?.comptes.find((c) => c.numero === '57110000')?.montant).toBe(-300);
      expect(bilan.equilibre).toBe(true);
    });

    it('soustrait l’amortissement du brut, jamais l’inverse', async () => {
      const service = serviceAvecBalance([ligne('24510000', C2, 5000, 0), ligne('28450000', C2, 0, 1500)]);
      const bilan = await service.bilan('t1', 'e1');
      // 6 500 si le solde créditeur de l'amortissement avait été signé en
      // positif dans la somme du net au lieu d'y être ajouté tel quel.
      expect(poste(bilan, 'AN')?.montant).toBe(3500);
    });

    it('ignore la classe 9, hors états de synthèse selon le ch. 7', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', C5, 100, 0),
        ligne('10130000', C1, 0, 100),
        ligne('90100000', C9, 500, 0),
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(bilan.totalActif).toBe(100);
      expect(bilan.comptesNonRattaches.some((c) => c.numero === '90100000')).toBe(false);
    });

    it('exclut les comptes Total, simple agrégat d’affichage des comptes Détail', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', C5, 100, 0),
        ligne('52', C5, 100, 0, {}, TypeCompteDetailTotal.TOTAL),
        ligne('10130000', C1, 0, 100),
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(bilan.totalActif).toBe(100); // 200 si le compte Total avait été additionné
    });

    it('liste les comptes de bilan sans poste, jamais absorbés dans un poste voisin', async () => {
      const bilan = await serviceDeReference().bilan('t1', 'e2');
      // 186 et 187 (comptes de liaison) n'ont aucun poste au ch. 7 · anomalie
      // n° 5 de la table. Ils doivent ressortir NOMMÉS, pas être glissés dans
      // DA (« 16, 181, 182, 183, 184 ») dont ils ne font pas partie.
      expect(bilan.comptesNonRattaches.map((c) => c.numero).sort()).toEqual(['18600000', '18700000']);
    });

    /**
     * Anomalie n° 7 · le 130 (résultat de l'exercice PRÉCÉDENT en instance
     * d'affectation) n'est ni dans CJ ni dans CH tant que l'assemblée n'a pas
     * statué. Le mettre dans CJ présenterait le résultat N-1 comme résultat N
     * sur toute balance arrêtée avant l'assemblée. Le 585 (virements de fonds)
     * doit être soldé à la clôture, anomalie n° 4.
     */
    it('laisse le 130 et le 585 orphelins et les signale, plutôt que de les ranger d’office', async () => {
      const service = serviceAvecBalance([
        ligne('13010000', C1, 0, 800), // résultat en instance d'affectation
        ligne('58500000', C5, 200, 0), // virement de fonds non soldé
        ligne('52110000', C5, 800, 200),
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.comptesNonRattaches.map((c) => c.numero).sort()).toEqual(['13010000', '58500000']);
      expect(poste(bilan, 'CJ')?.montant).toBe(0); // le 130 n'est PAS le résultat de N
      expect(bilan.equilibre).toBe(false); // et le déséquilibre le dit
    });

    it('prend le résultat dans le compte 13 APRÈS clôture, quand les classes de gestion sont soldées', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', C5, 11000, 0),
        ligne('10130000', C1, 0, 10000),
        ligne('13100000', C1, 0, 1000), // Résultat net : bénéfice
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'CJ')?.montant).toBe(1000);
      expect(bilan.controle.resultatClasses678).toBe(0);
      expect(bilan.controle.resultatCompte13).toBe(1000);
      expect(bilan.controle.doubleComptageProbable).toBe(false);
      expect(bilan.equilibre).toBe(true);
    });

    it('signale le double comptage quand les DEUX sources du résultat sont non nulles', async () => {
      // Titre VII COMPTE 13 : le compte 13 ne se mouvemente qu'À la clôture,
      // en soldant justement les classes 6/7/8. Les deux à la fois = balance
      // transmise à un moment ambigu de la clôture.
      const service = serviceAvecBalance([
        ligne('52110000', C5, 11000, 0),
        ligne('10130000', C1, 0, 10000),
        ligne('13100000', C1, 0, 1000),
        ligne('41110000', C4, 500, 0),
        ligne('70110000', C7, 0, 500),
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.controle.resultatClasses678).toBe(500);
      expect(bilan.controle.resultatCompte13).toBe(1000);
      expect(bilan.controle.doubleComptageProbable).toBe(true);
      // Avant clôture, c'est la source « classes de gestion » qui prime.
      expect(poste(bilan, 'CJ')?.montant).toBe(500);
    });
  });

  // =========================================================================
  describe('compteDeResultat', () => {
    it('rend la maquette complète du ch. 4, dans l’ordre du modèle', async () => {
      const cr = await serviceDeReference().compteDeResultat('t1', 'e2');
      expect(cr.lignes.map((l) => l.ref)).toEqual(ORDRE_AFFICHAGE_COMPTE_RESULTAT);
      const xa = cr.lignes.find((l) => l.ref === 'XA');
      expect(xa?.estSolde).toBe(true);
      expect(xa?.formuleOfficielle).toBe('Somme TA à RB');
      expect(cr.lignes.find((l) => l.ref === 'TA')?.estSolde).toBeUndefined();
    });

    /**
     * Convention du ch. 4 : « les postes de charges (préfixe R) sont saisis EN
     * NÉGATIF ; les formules de totalisation sont des SOMMES, jamais des
     * différences […] ne jamais soustraire deux fois ». Une charge rendue en
     * positif ferait double emploi avec le signe des formules.
     */
    it('porte les charges en NÉGATIF et les produits en positif', async () => {
      const cr = await serviceDeReference().compteDeResultat('t1', 'e2');
      const montant = (ref: string) => cr.lignes.find((l) => l.ref === ref)!.montant;
      expect(montant('TA')).toBe(8000);
      expect(montant('RA')).toBe(-5000);
      expect(montant('RK')).toBe(-1500);
      expect(montant('RL')).toBe(-500);
    });

    it('calcule les neuf lignes X* par les formules du modèle', async () => {
      const cr = await serviceDeReference().compteDeResultat('t1', 'e2');
      expect(cr.soldes.margeCommerciale).toBe(3000); // XA = TA + RA + RB
      expect(cr.soldes.chiffreAffaires).toBe(8000); // XB = A + B + C + D
      expect(cr.soldes.valeurAjoutee).toBe(3000); // XC = (XB + RA + RB) + somme TE à RJ
      expect(cr.soldes.excedentBrutExploitation).toBe(1500); // XD = XC + RK
      expect(cr.soldes.resultatExploitation).toBe(1000); // XE = XD + TJ + RL
      expect(cr.soldes.resultatFinancier).toBe(0); // XF
      expect(cr.soldes.resultatActivitesOrdinaires).toBe(1000); // XG = XE + XF
      expect(cr.soldes.resultatHorsActivitesOrdinaires).toBe(0); // XH
      expect(cr.soldes.resultatNet).toBe(1000); // XI = XG + XH + RQ + RS
      // Les lignes affichées portent les mêmes montants que les soldes nommés.
      expect(cr.lignes.find((l) => l.ref === 'XI')?.montant).toBe(1000);
    });

    /**
     * BOUCLAGE avec le bilan · XI, obtenu par les postes du modèle, doit
     * valoir le solde de toutes les classes de gestion, celui que le bilan
     * loge en CJ. Tout écart vaut exactement la somme des comptes de gestion
     * non rattachés.
     */
    it('boucle : XI vaut le solde de toutes les classes de gestion', async () => {
      const cr = await serviceDeReference().compteDeResultat('t1', 'e2');
      const classesDeGestion: ClasseCompte[] = [ClasseCompte.CLASSE_6, ClasseCompte.CLASSE_7, ClasseCompte.CLASSE_8];
      const soldeDesClassesDeGestion = LIGNES_E2.filter((l) => classesDeGestion.includes(l.classe)).reduce(
        (s, l) => s + l.solde,
        0,
      );

      expect(cr.soldes.resultatNet).toBe(-soldeDesClassesDeGestion);
      expect(cr.controle.resultatToutesClassesDeGestion).toBe(1000);
      expect(cr.controle.ecart).toBe(0);
      expect(cr.controle.coherent).toBe(true);

      const bilan = await serviceDeReference().bilan('t1', 'e2');
      expect([...bilan.actif, ...bilan.passif].find((p) => p.ref === 'CJ')?.montant).toBe(cr.soldes.resultatNet);
    });

    it('signale un compte de gestion sans poste et chiffre l’écart qu’il crée', async () => {
      // 609 n'existe pas au plan SYSCOHADA (le ch. 7 note que « 606, 607 et
      // 788 n'existent pas au plan ») : c'est le cas d'un plan personnalisé,
      // celui-là même pour lequel la garantie existe.
      const service = serviceAvecBalance([ligne('60900000', C6, 300, 0), ligne('52110000', C5, 0, 300)]);

      const cr = await service.compteDeResultat('t1', 'e1');

      expect(cr.comptesNonRattaches).toEqual([{ numero: '60900000', intitule: 'Compte 60900000', montant: -300 }]);
      expect(cr.soldes.resultatNet).toBe(0);
      expect(cr.controle.ecart).toBe(-300); // exactement le compte non rattaché
      expect(cr.controle.coherent).toBe(false);
    });

    /**
     * QUOTE-PART DE RÉSULTAT PARTAGÉ · AUDCIF Titre VIII ch. 33 section 7.2 :
     * les deux postes supplémentaires sont « à la fin du niveau
     * "Exploitation" ». De bout en bout, sur une vraie balance : ce que le
     * texte protège, ce sont la valeur ajoutée et l'excédent brut, où le
     * rattachement en bloc du 65 et du 75 (ch. 7) faisait entrer la
     * quote-part sans que rien ne le signale. Le bilan, lui, doit continuer
     * de boucler avec le compte de résultat · c'est la moitié du test.
     */
    it('sort la quote-part de résultat partagé de la valeur ajoutée et de l’EBE, sans rompre le bouclage (ch. 33)', async () => {
      // Coparticipant NON GÉRANT : 1 000 de ventes encaissées, et le gérant
      // lui impute 400 de perte (débit 6525 par crédit 463, ch. 33 § 6.3).
      const service = serviceAvecBalance([
        ligne('52110000', C5, 1000, 0),
        ligne('70110000', C7, 0, 1000),
        ligne('65250000', C6, 400, 0),
        ligne('46310000', C4, 0, 400),
      ]);

      const cr = await service.compteDeResultat('t1', 'e1');
      const montantDe = (ref: string) => cr.lignes.find((l) => l.ref === ref)!.montant;

      expect(montantDe('RQP')).toBe(-400);
      expect(montantDe('RJ')).toBe(0); // le 652 n'est plus absorbé par « Autres charges »
      expect(cr.soldes.valeurAjoutee).toBe(1000);
      expect(cr.soldes.excedentBrutExploitation).toBe(1000);
      expect(cr.soldes.resultatExploitation).toBe(600);
      expect(cr.soldes.resultatNet).toBe(600);
      // Le compte est bien rattaché : aucun compte de gestion orphelin, et XI
      // vaut le solde de toutes les classes de gestion.
      expect(cr.comptesNonRattaches).toEqual([]);
      expect(cr.controle.ecart).toBe(0);
      expect(cr.controle.coherent).toBe(true);

      // Et le bilan répond : CJ porte le même résultat, actif = passif.
      const bilan = await service.bilan('t1', 'e1');
      expect([...bilan.actif, ...bilan.passif].find((p) => p.ref === 'CJ')?.montant).toBe(600);
      expect(bilan.totalActif).toBe(1000);
      expect(bilan.totalPassif).toBe(1000);
    });

    it('rend la colonne N-1 seulement quand l’exercice antérieur existe', async () => {
      const avecN1 = await serviceDeReference().compteDeResultat('t1', 'e2');
      expect(avecN1.exerciceN1Disponible).toBe(true);
      expect(avecN1.soldesN1?.resultatNet).toBe(0); // e1 n'a aucun compte de gestion
      expect(avecN1.lignes.every((l) => l.montantN1 !== undefined)).toBe(true);

      const sansN1 = await serviceDeReference().compteDeResultat('t1', 'e1');
      expect(sansN1.exerciceN1Disponible).toBe(false);
      expect(sansN1.soldesN1).toBeUndefined();
      expect(sansN1.lignes.every((l) => l.montantN1 === undefined)).toBe(true);
    });
  });

  // =========================================================================
  describe('tableauFluxTresorerie', () => {
    const montant = (
      tft: Awaited<ReturnType<EtatsFinanciersSyscohadaService['tableauFluxTresorerie']>>,
      ref: string,
    ) => tft.lignes.find((l): l is Extract<(typeof tft.lignes)[number], { ref: string }> => 'ref' in l && l.ref === ref)!;

    it('applique la méthode indirecte : FA part de l’EBE, FB à FE sont des variations de bilan', async () => {
      const tft = await serviceDeReference().tableauFluxTresorerie('t1', 'e2');

      expect(montant(tft, 'FA').montant).toBe(1500); // CAFG = EBE, aucun retraitement ici
      expect(montant(tft, 'FB').montant).toBe(0);
      expect(montant(tft, 'FC').montant).toBe(0);
      expect(montant(tft, 'FD').montant).toBe(-1000); // BG passe de 2 000 à 3 000
      expect(montant(tft, 'FE').montant).toBe(200); // DP passe de 500 à 700
      expect(montant(tft, 'ZB').montant).toBe(700);
      expect(montant(tft, 'ZC').montant).toBe(0);
      expect(montant(tft, 'ZF').montant).toBe(0);
    });

    /**
     * Le seul bouclage imposé par le modèle (ch. 5 section 2) : « ZH
     * Trésorerie nette au 31 Décembre (G + A) · Contrôle : Trésorerie actif N
     * – Trésorerie passif N ». Les deux calculs sont indépendants : l'un
     * cumule les flux, l'autre relit le bilan.
     */
    it('boucle : ZH par les flux = ZA + ZB + ZC + ZF = ZH par le bilan', async () => {
      const tft = await serviceDeReference().tableauFluxTresorerie('t1', 'e2');

      expect(montant(tft, 'ZA').montant).toBe(3500); // BT - DT de l'exercice antérieur
      expect(montant(tft, 'ZG').montant).toBe(700);
      expect(montant(tft, 'ZH').montant).toBe(4200);

      const parLesFlux = CONTROLE_ZH_PAR_LES_FLUX.reduce((s, ref) => s + montant(tft, ref).montant, 0);
      expect(parLesFlux).toBe(4200);

      expect(tft.controle.tresorerieOuverture).toBe(3500);
      expect(tft.controle.variation).toBe(700);
      expect(tft.controle.tresorerieClotureParFlux).toBe(4200);
      expect(tft.controle.tresorerieClotureParBilan).toBe(4200);
      expect(tft.controle.ecart).toBe(0);
      expect(tft.controle.coherent).toBe(true);

      // Et c'est bien la trésorerie du BILAN, pas un second calcul parallèle.
      const bilan = await serviceDeReference().bilan('t1', 'e2');
      const bt = [...bilan.actif].find((p) => p.ref === 'BT')!.montant;
      const dt = [...bilan.passif].find((p) => p.ref === 'DT')!.montant;
      expect(tft.controle.tresorerieClotureParBilan).toBe(bt - dt);
    });

    it('lit la trésorerie du contrôle APRÈS transfert du découvert, sans le compter deux fois', async () => {
      const service = serviceAvecBalance([
        ligne('10130000', C1, 0, 700),
        ligne('57110000', C5, 1000, 0),
        ligne('52110000', C5, 0, 300),
      ]);

      const tft = await service.tableauFluxTresorerie('t1', 'e1');

      // 1 000 - 300 = 700. Si le 52 créditeur était resté à l'actif ET repris
      // au passif, le contrôle vaudrait 400 ; s'il n'était nulle part, 1 000.
      expect(tft.controle.tresorerieClotureParBilan).toBe(700);
    });

    it('laisse VIDES et SIGNALE les postes de variation quand il n’y a pas d’exercice antérieur', async () => {
      const tft = await serviceDeReference().tableauFluxTresorerie('t1', 'e1');

      expect(tft.exerciceN1Disponible).toBe(false);
      // Les postes concernés sont exactement ceux que la table déclare
      // dépendants d'un exercice antérieur (ZA, FB à FG) : la liste n'est pas
      // recopiée ici, elle est relue depuis `besoinsDuPoste`.
      const attendus = TOUS_LES_POSTES_FLUX_SYSCOHADA.filter((p) => besoinsDuPoste(p).exerciceN1).map((p) => p.ref);
      expect(attendus.length).toBeGreaterThan(0);
      for (const ref of attendus) {
        expect(tft.postesNonCalculables.some((p) => p.ref === ref)).toBe(true);
        expect(montant(tft, ref).montant).toBe(0);
      }
      // Et la colonne N-1 du modèle reste absente, jamais remplie de zéros.
      expect(montant(tft, 'ZH').montantN1).toBeUndefined();
    });

    it('rend la colonne N-1 quand l’exercice antérieur existe', async () => {
      const tft = await serviceDeReference().tableauFluxTresorerie('t1', 'e2');
      expect(tft.exerciceN1Disponible).toBe(true);
      // e1 n'a lui-même aucun exercice antérieur : sa colonne se réduit à ses
      // postes calculables, ce qui est le comportement voulu, pas un zéro.
      expect(montant(tft, 'ZA').montantN1).toBe(0);
    });

    it('liste les comptes de bilan mouvementés qu’aucun poste ne ventile', async () => {
      const tft = await serviceDeReference().tableauFluxTresorerie('t1', 'e2');
      // 186 et 187 · anomalie n° 17 de la table du TFT. Ils n'entrent dans
      // aucun total lu par le tableau ; s'ils n'étaient pas nommés, un écart de
      // bouclage resterait sans explication.
      expect(tft.comptesNonVentiles.map((c) => c.numero)).toEqual(['18600000', '18700000']);
      // Les comptes que le tableau ventile bel et bien n'y figurent pas.
      expect(tft.comptesNonVentiles.some((c) => c.numero === '52110000')).toBe(false);
      expect(tft.comptesNonVentiles.some((c) => c.numero === '41110000')).toBe(false);
      expect(tft.comptesNonVentiles.some((c) => c.numero === '28450000')).toBe(false);
    });

    it('reproduit la maquette du modèle : rubriques intercalées, clés A à H, drill-down des postes', async () => {
      const tft = await serviceDeReference().tableauFluxTresorerie('t1', 'e2');

      expect(tft.lignes.some((l) => 'section' in l)).toBe(true);
      expect(montant(tft, 'ZA').repere).toBe('A');
      expect(montant(tft, 'ZH').repere).toBe('H');
      expect(montant(tft, 'ZH').estTotal).toBe(true);
      expect(montant(tft, 'FA').estTotal).toBe(false);
      // FD lit le poste BG du bilan : son drill-down doit nommer le compte qui
      // porte la variation, pas rester muet.
      expect(montant(tft, 'FD').comptes.map((c) => c.numero)).toEqual(['41110000']);
      expect(montant(tft, 'FD').comptes[0].montant).toBe(-1000);
    });
  });
});
