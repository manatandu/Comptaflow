import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersService } from './etats-financiers.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';

/** Fabrique une ligne de balance telle que `EcritureService.balance()` la renvoie. */
function ligne(
  numero: string,
  classe: ClasseCompte,
  totalDebit: number,
  totalCredit: number,
  typeCompte: TypeCompteDetailTotal = TypeCompteDetailTotal.DETAIL,
) {
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe,
    typeCompte,
    totalDebit,
    totalCredit,
    solde: totalDebit - totalCredit,
  };
}

/**
 * Service avec un jeu de lignes DISTINCT par exercice (pour tester le
 * comparatif N-1) et la liste d'exercices que `trouverExerciceN1` consulte
 * pour trouver le plus récent antérieur au demandé.
 */
function serviceAvecExercices(
  lignesParExercice: Record<string, ReturnType<typeof ligne>[]>,
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
    // ExerciceService.lister() trie par dateDebut décroissant — répliqué ici.
    lister: jest.fn().mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;
  return new EtatsFinanciersService(ecritureService, exerciceService);
}

/** Un seul exercice ('e1'), sans N-1 — c'est ce que la quasi-totalité des tests exercent. */
function serviceAvecBalance(lignes: ReturnType<typeof ligne>[]) {
  return serviceAvecExercices({ e1: lignes });
}

describe('EtatsFinanciersService', () => {
  describe('bilan', () => {
    /** Cherche un poste par sa référence officielle (RA, BW, CA...), côté actif ou passif. */
    const poste = (bilan: Awaited<ReturnType<EtatsFinanciersService['bilan']>>, ref: string) =>
      [...bilan.actif, ...bilan.passif].find((p) => p.ref === ref);

    it('équilibre un jeu simple actif / passif / résultat, chaque poste au bon endroit', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', ClasseCompte.CLASSE_5, 1000, 0), // banque débitrice → BW (actif)
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 800), // dotation → CA (passif)
        ligne('60100000', ClasseCompte.CLASSE_6, 200, 0), // charge → résultat -200
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 400), // produit → résultat +400
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'BW')?.montant).toBe(1000);
      expect(poste(bilan, 'CA')?.montant).toBe(800);
      expect(poste(bilan, 'CH')?.montant).toBe(200); // résultat net = 400 - 200
      // Totaux hiérarchiques : BX(trésorerie) -> AZ/BT/BX/BY -> BZ ; CK -> CZ -> DE -> DZ.
      expect(poste(bilan, 'BX')?.montant).toBe(1000);
      expect(poste(bilan, 'BZ')?.montant).toBe(1000);
      expect(poste(bilan, 'CK')?.montant).toBe(1000); // CA(800) + CH(200)
      expect(poste(bilan, 'DZ')?.montant).toBe(1000);
      expect(bilan.totalActif).toBe(1000);
      expect(bilan.totalPassif).toBe(1000);
      expect(bilan.equilibre).toBe(true);
      // BZ et DZ sont marqués comme des totaux, pas comme des postes de détail.
      expect(poste(bilan, 'BZ')?.estTotal).toBe(true);
      expect(poste(bilan, 'BW')?.estTotal).toBe(false);
    });

    /**
     * RÉGRESSION — bug réel constaté le 2026-08-28. La classe 8 (H.A.O.)
     * tombait dans un `default: break` et n'entrait donc pas dans le
     * résultat : toute cession d'immobilisation (le module Immobilisations
     * poste en 81/82) déséquilibrait le bilan du montant exact de
     * l'opération H.A.O. Le compte de résultat officiel capte 81/82 via ses
     * postes TM/TN (hors bilan direct), mais leur solde net doit quand même
     * entrer dans CH comme n'importe quel résultat de gestion.
     */
    it('fait entrer la classe 8 (H.A.O.) dans le résultat — sinon le bilan ne boucle pas', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', ClasseCompte.CLASSE_5, 40, 0), // encaissement de la cession
        ligne('82200000', ClasseCompte.CLASSE_8, 0, 40), // produit de cession H.A.O.
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'CH')?.montant).toBe(40);
      expect(bilan.totalActif).toBe(40);
      expect(bilan.totalPassif).toBe(40);
      expect(bilan.equilibre).toBe(true);
    });

    it('ignore les comptes de classe 9 (hors bilan par construction de l’Acte uniforme)', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', ClasseCompte.CLASSE_5, 100, 0),
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 100),
        ligne('90000000', ClasseCompte.CLASSE_9, 500, 0), // ne doit rien changer, et ne doit PAS ressortir en anomalie
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.totalActif).toBe(100);
      expect(bilan.totalPassif).toBe(100);
      expect(bilan.comptesNonRattaches.some((c) => c.numero === '90000000')).toBe(false);
    });

    it('exclut les comptes Total, qui ne sont qu’un agrégat des comptes Détail', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', ClasseCompte.CLASSE_5, 100, 0),
        ligne('52', ClasseCompte.CLASSE_5, 100, 0, TypeCompteDetailTotal.TOTAL), // agrégat du précédent
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 100),
      ]);

      const bilan = await service.bilan('t1', 'e1');

      // 200 si le compte Total avait été compté en plus du compte Détail.
      expect(bilan.totalActif).toBe(100);
    });

    /**
     * RÉGRESSION — bug de signe trouvé en dérivant ce cas de test à la main
     * avant toute exécution : un compte d'amortissement soumis à `-l.solde`
     * s'ADDITIONNAIT au brut au lieu de s'en soustraire (5000 + 1500 = 6500
     * au lieu de 5000 - 1500 = 3500). Jamais constaté en production — repéré
     * avant la première exécution du test.
     */
    it('soustrait l’amortissement du brut, pas l’inverse', async () => {
      const service = serviceAvecBalance([
        ligne('24510000', ClasseCompte.CLASSE_2, 5000, 0), // AM brut — matériel de transport
        ligne('28450000', ClasseCompte.CLASSE_2, 0, 1500), // AM amortissement
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'AM')?.montant).toBe(3500);
    });

    it('sépare BE (créances) et DI (dettes) par le sens du solde, sur les mêmes préfixes de tiers', async () => {
      // Anomalie n° 2 du tableau officiel (voir correspondance-bilan.ts) :
      // sans qualificatif de sens, ces comptes compteraient deux fois.
      const service = serviceAvecBalance([
        ligne('47110000', ClasseCompte.CLASSE_4, 100, 0), // débiteur -> BE seulement
        ligne('47120000', ClasseCompte.CLASSE_4, 0, 60), // créditeur -> DI seulement
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'BE')?.montant).toBe(100);
      expect(poste(bilan, 'DI')?.montant).toBe(60);
      expect(poste(bilan, 'BE')?.comptes.map((c) => c.numero)).toEqual(['47110000']);
      expect(poste(bilan, 'DI')?.comptes.map((c) => c.numero)).toEqual(['47120000']);
    });

    it('retire le compte 41 de BE — déjà entièrement capté par BD (anomalie n° 1)', async () => {
      const service = serviceAvecBalance([ligne('41100000', ClasseCompte.CLASSE_4, 200, 0)]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'BD')?.montant).toBe(200);
      expect(poste(bilan, 'BE')?.montant).toBe(0);
    });

    it('CH prend le résultat des classes 6/7/8 quand elles sont mouvementées (avant clôture)', async () => {
      const service = serviceAvecBalance([ligne('70100000', ClasseCompte.CLASSE_7, 0, 500)]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'CH')?.montant).toBe(500);
      expect(bilan.controle.resultatClasses678).toBe(500);
      expect(bilan.controle.resultatCompte13).toBe(0);
      expect(bilan.controle.doubleComptageProbable).toBe(false);
    });

    it('CH bascule sur le compte 13 quand les classes 6/7/8 sont soldées (après clôture)', async () => {
      const service = serviceAvecBalance([ligne('13100000', ClasseCompte.CLASSE_1, 0, 500)]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'CH')?.montant).toBe(500);
      expect(bilan.controle.resultatClasses678).toBe(0);
      expect(bilan.controle.resultatCompte13).toBe(500);
      expect(bilan.controle.doubleComptageProbable).toBe(false);
    });

    it('signale (sans trancher) un double comptage probable — classes 6/7/8 ET compte 13 mouvementés à la fois', async () => {
      const service = serviceAvecBalance([
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 500),
        ligne('13100000', ClasseCompte.CLASSE_1, 0, 300), // reliquat d'un exercice antérieur, par exemple
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.controle.doubleComptageProbable).toBe(true);
      // Le résultat retenu reste déterministe (classes 6/7/8, avant clôture) même signalé en anomalie.
      expect(poste(bilan, 'CH')?.montant).toBe(500);
    });

    it('signale un compte de bilan qu’aucun poste officiel ne réclame — et fait fuir l’équilibre de son montant', async () => {
      // Une vraie écriture a toujours une contrepartie : le compte 29999999
      // (hors de tout préfixe officiel) est débité, son crédit compensateur
      // ATTERRIT normalement sur CA — c'est justement cette contrepartie
      // captée d'un côté et pas de l'autre qui fait fuir l'équilibre, pas
      // l'absence de contrepartie (un compte isolé sans écriture réelle
      // donnerait trivialement 0 = 0, ce qui ne prouverait rien).
      const service = serviceAvecBalance([
        ligne('29999999', ClasseCompte.CLASSE_2, 700, 0),
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 700),
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.comptesNonRattaches).toEqual([expect.objectContaining({ numero: '29999999', montant: 700 })]);
      expect(bilan.totalActif).toBe(0); // 29999999 non capté par aucun poste actif
      expect(bilan.totalPassif).toBe(700); // CA, lui, est bien capté
      expect(bilan.equilibre).toBe(false);
    });
  });

  describe('compteDeResultat', () => {
    it('ventile chaque compte dans son poste officiel et applique les formules XA/XB/XC/XD/XE', async () => {
      const service = serviceAvecBalance([
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 3000), // RA
        ligne('70510000', ClasseCompte.CLASSE_7, 0, 1200), // RD
        ligne('70520000', ClasseCompte.CLASSE_7, 0, 800), // RE
        ligne('60200000', ClasseCompte.CLASSE_6, 900, 0), // TC
        ligne('62200000', ClasseCompte.CLASSE_6, 400, 0), // TG
        ligne('66100000', ClasseCompte.CLASSE_6, 1500, 0), // TJ
        ligne('82200000', ClasseCompte.CLASSE_8, 0, 600), // TM
        ligne('81200000', ClasseCompte.CLASSE_8, 450, 0), // TN
      ]);

      const cr = await service.compteDeResultat('t1', 'e1');

      expect(cr.produits.find((p) => p.ref === 'RA')?.montant).toBe(3000);
      expect(cr.produits.find((p) => p.ref === 'RD')?.montant).toBe(1200);
      expect(cr.produits.find((p) => p.ref === 'RE')?.montant).toBe(800);
      expect(cr.totalProduits).toBe(5000); // XA
      // Les charges sont présentées en positif, comme l'état officiel.
      expect(cr.charges.find((p) => p.ref === 'TC')?.montant).toBe(900);
      expect(cr.totalCharges).toBe(2800); // XB
      expect(cr.resultatActivitesOrdinaires).toBe(2200); // XC = XA - XB
      expect(cr.produitsHao.montant).toBe(600); // TM
      expect(cr.chargesHao.montant).toBe(450); // TN
      expect(cr.resultatHao).toBe(150); // XD
      expect(cr.resultatNet).toBe(2350); // XE
      expect(cr.controle.coherent).toBe(true);
      expect(cr.comptesNonRattaches).toHaveLength(0);
    });

    it('inclut RH (reprises) dans XA — sans quoi le résultat cesserait d’égaler celui du bilan', async () => {
      // Anomalie n° 4 du texte officiel : le libellé de XA dit « Somme RA à
      // RG », ce qui exclurait RH. Voir correspondance-compte-resultat.ts.
      const service = serviceAvecBalance([ligne('79000000', ClasseCompte.CLASSE_7, 0, 500)]);

      const cr = await service.compteDeResultat('t1', 'e1');

      expect(cr.produits.find((p) => p.ref === 'RH')?.montant).toBe(500);
      expect(cr.totalProduits).toBe(500);
      expect(cr.resultatNet).toBe(500);
      expect(cr.controle.coherent).toBe(true);
    });

    it('signale un compte de gestion hors poste et chiffre l’écart plutôt que de le masquer', async () => {
      const service = serviceAvecBalance([
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 100), // RA
        ligne('70500000', ClasseCompte.CLASSE_7, 0, 500), // aucun poste : 705 générique
      ]);

      const cr = await service.compteDeResultat('t1', 'e1');

      expect(cr.resultatNet).toBe(100); // le 705 n'entre dans aucun total
      expect(cr.comptesNonRattaches).toEqual([
        expect.objectContaining({ numero: '70500000', montant: 500 }),
      ]);
      expect(cr.controle.coherent).toBe(false);
      // L'écart vaut exactement le montant non rattaché.
      expect(cr.controle.ecart).toBe(500);
      expect(cr.controle.resultatToutesClassesDeGestion).toBe(600);
    });

    it('donne le même résultat net que le bilan (contrôle croisé des deux états)', async () => {
      const lignes = [
        ligne('52110000', ClasseCompte.CLASSE_5, 5000, 0),
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 2750),
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 3000),
        ligne('60200000', ClasseCompte.CLASSE_6, 900, 0),
        ligne('82200000', ClasseCompte.CLASSE_8, 0, 600),
        ligne('81200000', ClasseCompte.CLASSE_8, 450, 0),
      ];
      // Une vraie balance a forcément Σdébits = Σcrédits ; on le vérifie ici
      // pour qu'un jeu d'essai mal construit échoue comme tel, et ne passe
      // pas pour un déséquilibre imputé au code testé.
      expect(lignes.reduce((s, l) => s + l.totalDebit, 0)).toBe(lignes.reduce((s, l) => s + l.totalCredit, 0));
      const service = serviceAvecBalance(lignes);

      const bilan = await service.bilan('t1', 'e1');
      const cr = await service.compteDeResultat('t1', 'e1');

      const resultatAuBilan = bilan.passif.find((p) => p.ref === 'CH')?.montant ?? 0;
      expect(cr.resultatNet).toBe(resultatAuBilan);
      expect(bilan.equilibre).toBe(true);
      expect(cr.controle.coherent).toBe(true);
    });

    it('ne compte pas deux fois un compte Total et son compte Détail', async () => {
      const service = serviceAvecBalance([
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 300),
        ligne('701', ClasseCompte.CLASSE_7, 0, 300, TypeCompteDetailTotal.TOTAL),
      ]);

      const cr = await service.compteDeResultat('t1', 'e1');

      expect(cr.totalProduits).toBe(300);
    });
  });

  /**
   * Colonnes Brut / Amortissements et dépréciations / Net — le texte
   * officiel les exige toutes les trois côté actif du bilan (Partie 4 ch. 2 :
   * « Colonnes : REF | ACTIF | Note | Brut (N) | Amort. et déprec. (N) |
   * Net (N) | Net (N-1) »). Un export/écran qui ne montre qu'un montant net
   * unique n'est pas fidèle à la maquette — corrigé après une question
   * directe de l'utilisateur sur une capture d'écran (2026-08-28).
   */
  describe('bilan — colonnes Brut / Amortissement / Net (actif)', () => {
    const poste = (bilan: Awaited<ReturnType<EtatsFinanciersService['bilan']>>, ref: string) =>
      [...bilan.actif, ...bilan.passif].find((p) => p.ref === ref);

    it('expose brut, amortissement (magnitude positive) et net séparément sur un poste actif amorti', async () => {
      const service = serviceAvecBalance([
        ligne('24510000', ClasseCompte.CLASSE_2, 5000, 0), // AM brut
        ligne('28450000', ClasseCompte.CLASSE_2, 0, 1500), // AM amortissement
      ]);

      const bilan = await service.bilan('t1', 'e1');
      const am = poste(bilan, 'AM')!;

      expect(am.brut).toBe(5000);
      expect(am.amortissement).toBe(1500); // magnitude positive, pas -1500
      expect(am.montant).toBe(3500); // net = brut - amortissement
    });

    it('remonte brut/amortissement dans les totaux hiérarchiques (AH, AZ)', async () => {
      const service = serviceAvecBalance([
        ligne('24510000', ClasseCompte.CLASSE_2, 5000, 0),
        ligne('28450000', ClasseCompte.CLASSE_2, 0, 1500),
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'AH')?.brut).toBe(5000); // IMMOBILISATIONS CORPORELLES
      expect(poste(bilan, 'AH')?.amortissement).toBe(1500);
      expect(poste(bilan, 'AH')?.montant).toBe(3500);
      expect(poste(bilan, 'AZ')?.montant).toBe(3500); // TOTAL ACTIF IMMOBILISE
    });

    it('un poste sans compte d’amortissement (AG) a amortissement=0, pas undefined', async () => {
      const service = serviceAvecBalance([ligne('25100000', ClasseCompte.CLASSE_2, 800, 0)]);

      const bilan = await service.bilan('t1', 'e1');
      const ag = poste(bilan, 'AG')!;

      expect(ag.brut).toBe(800);
      expect(ag.amortissement).toBe(0);
      expect(ag.montant).toBe(800);
    });

    it('un poste PASSIF n’a pas de brut/amortissement — seulement un montant net', async () => {
      const service = serviceAvecBalance([ligne('10110000', ClasseCompte.CLASSE_1, 0, 800)]);

      const bilan = await service.bilan('t1', 'e1');
      const ca = poste(bilan, 'CA')!;

      expect(ca.brut).toBeUndefined();
      expect(ca.amortissement).toBeUndefined();
      expect(ca.montant).toBe(800);
    });
  });

  /**
   * Comparatif N-1 — exigé par le texte officiel sur le bilan (colonne
   * « Net (N-1) ») ET sur le compte de résultat (colonne « Net exercice au
   * 31/12/N-1 »), pas seulement sur le premier. `trouverExerciceN1` cherche
   * l'exercice du même tenant dont la date de début est la plus récente
   * parmi celles antérieures à l'exercice demandé.
   */
  // Régressions issues de l'audit du 2026-08-28 — chacun de ces tests
  // reproduit un bug qui était RÉELLEMENT présent en production.
  describe('audit 2026-08-28 — régressions', () => {
    const poste = (bilan: Awaited<ReturnType<EtatsFinanciersService['bilan']>>, ref: string) =>
      [...bilan.actif, ...bilan.passif].find((p) => p.ref === ref);

    it('un découvert bancaire ne casse plus l’équilibre du bilan (52/53 créditeurs comptés une seule fois)', async () => {
      // Matériel 300 financé par un découvert de 300 : Actif 300 = Passif 300.
      // Avant correctif : BW captait le -300 (actif ramené à 0) pendant que DW
      // ajoutait +300 au passif -> totalActif 0 / totalPassif 300.
      const service = serviceAvecBalance([
        ligne('24100000', ClasseCompte.CLASSE_2, 300, 0),
        ligne('52110000', ClasseCompte.CLASSE_5, 0, 300),
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(bilan.totalActif).toBe(300);
      expect(bilan.totalPassif).toBe(300);
      expect(bilan.equilibre).toBe(true);
      expect(poste(bilan, 'BW')!.montant).toBe(0);
      expect(poste(bilan, 'DW')!.montant).toBe(300);
    });

    it('une banque DÉBITRICE reste bien à l’actif (le transfert ne vaut que pour les soldes créditeurs)', async () => {
      const service = serviceAvecBalance([ligne('52110000', ClasseCompte.CLASSE_5, 800, 0)]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'BW')!.montant).toBe(800);
      expect(poste(bilan, 'DW')!.montant).toBe(0);
    });

    it('une caisse créditrice (57, anomalie de saisie) reste VISIBLE en négatif à l’actif, pas déplacée au passif', async () => {
      const service = serviceAvecBalance([ligne('57100000', ClasseCompte.CLASSE_5, 0, 120)]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'BW')!.montant).toBe(-120);
      expect(poste(bilan, 'DW')!.montant).toBe(0);
    });

    it('DW capte 561 et 566 (crédits de trésorerie, intérêts courus) — la restriction à 564/565 les perdait', async () => {
      const service = serviceAvecBalance([
        ligne('56100000', ClasseCompte.CLASSE_5, 0, 500), // crédits de trésorerie
        ligne('56600000', ClasseCompte.CLASSE_5, 0, 20), // intérêts courus
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'DW')!.montant).toBe(520);
    });
  });

  describe('comparatif N-1', () => {
    const exercices = [
      { id: 'e1', dateDebut: new Date('2026-01-01') },
      { id: 'e0', dateDebut: new Date('2025-01-01') },
    ];

    it('bilan : peuple montantN1/brutN1/amortissementN1 depuis l’exercice antérieur', async () => {
      const service = serviceAvecExercices(
        {
          e1: [ligne('52110000', ClasseCompte.CLASSE_5, 1000, 0), ligne('10110000', ClasseCompte.CLASSE_1, 0, 1000)],
          e0: [ligne('52110000', ClasseCompte.CLASSE_5, 600, 0), ligne('10110000', ClasseCompte.CLASSE_1, 0, 600)],
        },
        exercices,
      );

      const bilan = await service.bilan('t1', 'e1');
      const bw = [...bilan.actif].find((p) => p.ref === 'BW')!;
      const ca = [...bilan.passif].find((p) => p.ref === 'CA')!;

      expect(bilan.exerciceN1Disponible).toBe(true);
      expect(bw.montant).toBe(1000);
      expect(bw.montantN1).toBe(600);
      expect(ca.montant).toBe(1000);
      expect(ca.montantN1).toBe(600);
      expect(bilan.totalActifN1).toBe(600);
      expect(bilan.totalPassifN1).toBe(600);
    });

    it('bilan : sans exercice antérieur, montantN1 est undefined — jamais un faux 0', async () => {
      const service = serviceAvecExercices({ e1: [ligne('52110000', ClasseCompte.CLASSE_5, 1000, 0)] }, [
        { id: 'e1', dateDebut: new Date('2026-01-01') },
      ]);

      const bilan = await service.bilan('t1', 'e1');
      const bw = [...bilan.actif].find((p) => p.ref === 'BW')!;

      expect(bilan.exerciceN1Disponible).toBe(false);
      expect(bw.montantN1).toBeUndefined();
      expect(bilan.totalActifN1).toBeUndefined();
    });

    it('choisit le PLUS RÉCENT exercice antérieur quand il y en a plusieurs', async () => {
      const troisExercices = [
        { id: 'e2', dateDebut: new Date('2027-01-01') },
        { id: 'e1', dateDebut: new Date('2026-01-01') },
        { id: 'e0', dateDebut: new Date('2025-01-01') },
      ];
      const service = serviceAvecExercices(
        {
          e2: [ligne('52110000', ClasseCompte.CLASSE_5, 900, 0)],
          e1: [ligne('52110000', ClasseCompte.CLASSE_5, 600, 0)], // le bon N-1 pour e2
          e0: [ligne('52110000', ClasseCompte.CLASSE_5, 300, 0)],
        },
        troisExercices,
      );

      const bilan = await service.bilan('t1', 'e2');
      const bw = [...bilan.actif].find((p) => p.ref === 'BW')!;

      expect(bw.montant).toBe(900);
      expect(bw.montantN1).toBe(600); // e1, pas e0
    });

    it('compte de résultat : peuple totalProduitsN1/totalChargesN1/resultatNetN1', async () => {
      const service = serviceAvecExercices(
        {
          e1: [ligne('70100000', ClasseCompte.CLASSE_7, 0, 500), ligne('60100000', ClasseCompte.CLASSE_6, 200, 0)],
          e0: [ligne('70100000', ClasseCompte.CLASSE_7, 0, 300), ligne('60100000', ClasseCompte.CLASSE_6, 100, 0)],
        },
        exercices,
      );

      const cr = await service.compteDeResultat('t1', 'e1');

      expect(cr.exerciceN1Disponible).toBe(true);
      expect(cr.totalProduits).toBe(500);
      expect(cr.totalProduitsN1).toBe(300);
      expect(cr.totalCharges).toBe(200);
      expect(cr.totalChargesN1).toBe(100);
      expect(cr.resultatNet).toBe(300);
      expect(cr.resultatNetN1).toBe(200);
      expect(cr.produits.find((p) => p.ref === 'RA')?.montantN1).toBe(300);
    });

    it('compte de résultat : sans exercice antérieur, tous les champs N1 sont undefined', async () => {
      const service = serviceAvecExercices({ e1: [ligne('70100000', ClasseCompte.CLASSE_7, 0, 500)] }, [
        { id: 'e1', dateDebut: new Date('2026-01-01') },
      ]);

      const cr = await service.compteDeResultat('t1', 'e1');

      expect(cr.exerciceN1Disponible).toBe(false);
      expect(cr.totalProduitsN1).toBeUndefined();
      expect(cr.resultatNetN1).toBeUndefined();
      expect(cr.produits.find((p) => p.ref === 'RA')?.montantN1).toBeUndefined();
    });
  });
});
