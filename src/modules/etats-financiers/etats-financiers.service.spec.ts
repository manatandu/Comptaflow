import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersService } from './etats-financiers.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { TOUS_LES_POSTES_FLUX } from './correspondance-tft';
import { correspond } from './etats-financiers.communs';

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

    it('BILAN COMPLET — un dossier réaliste boucle exactement (amortissement + tiers 2 sens + découvert + déficit)', async () => {
      // Scénario en partie double, vérifié à la main (somme des soldes = 0) :
      //  1. dotation 10 000 en banque            5211 D / 101  C
      //  2. achat matériel 4 000 à crédit        2410 D / 481  C
      //  3. paiement du fournisseur d'invest.     481 D / 5211 C
      //  4. dotation aux amortissements 800      6813 D / 2841 C
      //  5. cotisations appelées 3 000           4110 D / 7010 C
      //  6. encaissement partiel 2 000           5211 D / 4110 C
      //  7. achat de fournitures 500 à crédit    6040 D / 4010 C
      //  8. services extérieurs 9 000 payés      6220 D / 5211 C  -> banque à DÉCOUVERT
      const service = serviceAvecBalance([
        ligne('10100000', ClasseCompte.CLASSE_1, 0, 10000), // CA
        ligne('24100000', ClasseCompte.CLASSE_2, 4000, 0), // AL brut
        ligne('28410000', ClasseCompte.CLASSE_2, 0, 800), // AL amortissement
        ligne('48100000', ClasseCompte.CLASSE_4, 4000, 4000), // DF, soldé
        ligne('41100000', ClasseCompte.CLASSE_4, 3000, 2000), // BD
        ligne('40100000', ClasseCompte.CLASSE_4, 0, 500), // DH
        ligne('52110000', ClasseCompte.CLASSE_5, 12000, 13000), // découvert -> DW
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 3000), // RA
        ligne('60400000', ClasseCompte.CLASSE_6, 500, 0), // TD
        ligne('62200000', ClasseCompte.CLASSE_6, 9000, 0), // TG
        ligne('68130000', ClasseCompte.CLASSE_6, 800, 0), // TL
      ]);
      const bilan = await service.bilan('t1', 'e1');

      // Actif : matériel net 3 200 + adhérents 1 000 + trésorerie 0 (au passif)
      expect(poste(bilan, 'AL')!.brut).toBe(4000);
      expect(poste(bilan, 'AL')!.amortissement).toBe(800);
      expect(poste(bilan, 'AL')!.montant).toBe(3200);
      expect(poste(bilan, 'BD')!.montant).toBe(1000);
      expect(poste(bilan, 'BW')!.montant).toBe(0);
      // Passif : dotation 10 000 + déficit -7 300 + fournisseurs 500 + découvert 1 000
      expect(poste(bilan, 'CA')!.montant).toBe(10000);
      expect(poste(bilan, 'CH')!.montant).toBe(-7300);
      expect(poste(bilan, 'DH')!.montant).toBe(500);
      expect(poste(bilan, 'DW')!.montant).toBe(1000);

      expect(bilan.totalActif).toBe(4200);
      expect(bilan.totalPassif).toBe(4200);
      expect(bilan.equilibre).toBe(true);
      // Aucun compte ne doit tomber hors des postes officiels dans ce scénario.
      expect(bilan.comptesNonRattaches).toEqual([]);
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

/**
 * Fixture propre au TABLEAU DE FLUX : contrairement au bilan et au compte de
 * résultat, le TFT distingue le REPORT À-NOUVEAU des MOUVEMENTS PROPRES de
 * l'exercice — sans quoi le report d'un compte d'immobilisation serait lu
 * comme une acquisition de l'année. `report` porte le report à-nouveau
 * (débit, crédit) ; `d`/`c` les mouvements de la période ; les totaux sont
 * leur somme, exactement comme `EcritureService.balance` les calcule.
 */
function ligneF(
  numero: string,
  classe: ClasseCompte,
  d: number,
  c: number,
  report: [number, number] = [0, 0],
) {
  const [rd, rc] = report;
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    totalDebit: d + rd,
    totalCredit: c + rc,
    reportDebit: rd,
    reportCredit: rc,
    mouvementDebit: d,
    mouvementCredit: c,
    solde: d + rd - c - rc,
  };
}

const DEUX_EXERCICES = [
  { id: 'eN', dateDebut: new Date('2026-01-01') },
  { id: 'eN1', dateDebut: new Date('2025-01-01') },
];

describe('EtatsFinanciersService — tableau de flux de trésorerie', () => {
  const ref = (tft: any, r: string) => tft.lignes.find((l: any) => l.ref === r);

  it('applique la formule officielle et BOUCLE : cycle complet des cotisations sur deux exercices', async () => {
    // Scénario vérifié à la main, chiffre par chiffre.
    //
    // N-1 : cotisations appelées 1 000, encaissées 800 -> créance 200, banque 800.
    // N   : cotisations appelées 1 500, encaissements 1 400 -> créance 300, banque 2 200.
    //
    // Formule officielle (Partie 4, ch. 1 § 4), reprise de l'exemple du texte :
    //   Cotisations encaissées en N = 1 500 + 200 (créances N-1) - 300 (créances N) = 1 400.
    const service = serviceAvecExercices(
      {
        eN1: [
          ligneF('41100000', ClasseCompte.CLASSE_4, 1000, 800),
          ligneF('52110000', ClasseCompte.CLASSE_5, 800, 0),
          ligneF('70100000', ClasseCompte.CLASSE_7, 0, 1000),
        ],
        eN: [
          ligneF('41100000', ClasseCompte.CLASSE_4, 1500, 1400, [200, 0]),
          ligneF('52110000', ClasseCompte.CLASSE_5, 1400, 0, [800, 0]),
          ligneF('70100000', ClasseCompte.CLASSE_7, 0, 1500),
        ],
      },
      DEUX_EXERCICES,
    );

    const tft = await service.tableauFluxTresorerie('t1', 'eN');

    expect(ref(tft, 'ZA').montant).toBe(800); // trésorerie à l'ouverture
    expect(ref(tft, 'FA').montant).toBe(1400); // 1500 + 200 - 300
    expect(ref(tft, 'ZB').montant).toBe(1400);
    expect(ref(tft, 'ZF').montant).toBe(1400);
    expect(ref(tft, 'ZG').montant).toBe(2200);

    // Les DEUX égalités de contrôle du texte officiel, vérifiées ensemble.
    expect(tft.controle.tresorerieClotureParFlux).toBe(2200);
    expect(tft.controle.tresorerieClotureParBilan).toBe(2200);
    expect(tft.controle.ecart).toBe(0);
    expect(tft.controle.coherent).toBe(true);
  });

  it('côté charges : le décaissement fournisseurs est le paiement RÉEL, pas l’achat de l’exercice', async () => {
    // N-1 : dette fournisseurs 150, banque 1 000.
    // N   : achats 600, paiements 500 -> dette 250, banque 500.
    // Décaissements = 600 + 150 (dettes N-1) - 250 (dettes N) = 500 = les paiements réels.
    const service = serviceAvecExercices(
      {
        eN1: [
          ligneF('40110000', ClasseCompte.CLASSE_4, 0, 150),
          ligneF('52110000', ClasseCompte.CLASSE_5, 1000, 0),
        ],
        eN: [
          ligneF('40110000', ClasseCompte.CLASSE_4, 500, 600, [0, 150]),
          ligneF('60400000', ClasseCompte.CLASSE_6, 600, 0),
          ligneF('52110000', ClasseCompte.CLASSE_5, 0, 500, [1000, 0]),
        ],
      },
      DEUX_EXERCICES,
    );

    const tft = await service.tableauFluxTresorerie('t1', 'eN');

    // Présenté en NÉGATIF : le modèle officiel écrit « - Décaissement des
    // sommes versées aux fournisseurs », et les sous-totaux sont des sommes.
    expect(ref(tft, 'FF').montant).toBe(-500);
    expect(ref(tft, 'ZB').montant).toBe(-500);
    expect(ref(tft, 'ZG').montant).toBe(500);
    expect(tft.controle.coherent).toBe(true);
  });

  it('le REPORT À-NOUVEAU d’une immobilisation n’est JAMAIS une acquisition de l’exercice', async () => {
    // LE défaut que la lecture en mouvements propres existe pour empêcher :
    // un bâtiment détenu depuis l'exercice précédent (report 20 000) plus une
    // acquisition de l'année (5 000). Lire le solde donnerait 25 000 de
    // décaissement d'investissement, dont 20 000 purement imaginaires.
    const service = serviceAvecExercices(
      {
        eN1: [ligneF('52110000', ClasseCompte.CLASSE_5, 25000, 0)],
        eN: [
          ligneF('23110000', ClasseCompte.CLASSE_2, 5000, 0, [20000, 0]),
          ligneF('52110000', ClasseCompte.CLASSE_5, 0, 5000, [25000, 0]),
        ],
      },
      DEUX_EXERCICES,
    );

    const tft = await service.tableauFluxTresorerie('t1', 'eN');
    expect(ref(tft, 'FI').montant).toBe(-5000);
    expect(tft.controle.coherent).toBe(true);
  });

  it('une acquisition ET une cession la même année ne se compensent pas : deux flux réels, de sens opposés', async () => {
    // Lire le NET du compte 231 donnerait une acquisition de 2 000 au lieu de
    // 5 000, et ferait disparaître la sortie d'actif. `DEBIT_SEUL` l'interdit.
    const service = serviceAvecExercices(
      {
        eN1: [ligneF('52110000', ClasseCompte.CLASSE_5, 10000, 0)],
        eN: [
          ligneF('23110000', ClasseCompte.CLASSE_2, 5000, 3000),
          ligneF('82200000', ClasseCompte.CLASSE_8, 0, 3500), // prix de cession encaissé
          ligneF('81200000', ClasseCompte.CLASSE_8, 3000, 0), // valeur comptable sortie
          ligneF('52110000', ClasseCompte.CLASSE_5, 3500, 5000, [10000, 0]),
        ],
      },
      DEUX_EXERCICES,
    );

    const tft = await service.tableauFluxTresorerie('t1', 'eN');
    expect(ref(tft, 'FI').montant).toBe(-5000); // acquisition, débit seul
    expect(ref(tft, 'FK').montant).toBe(3500); // prix de cession, compte 82
    expect(ref(tft, 'ZC').montant).toBe(-1500);
    expect(tft.controle.coherent).toBe(true);
  });

  it('un compte NON VENTILÉ est dit, et l’écart de bouclage en chiffre exactement l’effet', async () => {
    // Compte 4491 « Etat, subvention à recevoir » : le plan ne le subdivise
    // PAS entre exploitation (FB) et investissement (FN), il n'est donc
    // rattaché à aucun poste (anomalie n° 2 de correspondance-tft.ts).
    //
    // Une subvention de 500 acquise mais non encaissée gonfle donc FB de 500
    // sans contrepartie de trésorerie. Le tableau ne le corrige pas : il
    // signale un écart de 500 ET nomme le compte responsable.
    const service = serviceAvecExercices(
      {
        eN1: [ligneF('52110000', ClasseCompte.CLASSE_5, 1000, 0)],
        eN: [
          ligneF('44910000', ClasseCompte.CLASSE_4, 500, 0),
          ligneF('71100000', ClasseCompte.CLASSE_7, 0, 500),
          ligneF('52110000', ClasseCompte.CLASSE_5, 0, 0, [1000, 0]),
        ],
      },
      DEUX_EXERCICES,
    );

    const tft = await service.tableauFluxTresorerie('t1', 'eN');

    expect(ref(tft, 'FB').montant).toBe(500);
    expect(tft.controle.tresorerieClotureParFlux).toBe(1500);
    expect(tft.controle.tresorerieClotureParBilan).toBe(1000); // la banque n'a pas bougé
    expect(tft.controle.ecart).toBe(500);
    expect(tft.controle.coherent).toBe(false);
    // La cause est nommée, pas seulement le montant.
    expect(tft.comptesNonVentiles.map((c: any) => c.numero)).toContain('44910000');
  });

  it('sans exercice antérieur, la trésorerie d’ouverture est nulle et le tableau le dit', async () => {
    const service = serviceAvecExercices({
      eN: [
        ligneF('70100000', ClasseCompte.CLASSE_7, 0, 900),
        ligneF('52110000', ClasseCompte.CLASSE_5, 900, 0),
      ],
    });
    const tft = await service.tableauFluxTresorerie('t1', 'eN');
    expect(tft.exerciceN1Disponible).toBe(false);
    expect(ref(tft, 'ZA').montant).toBe(0);
    expect(ref(tft, 'FA').montant).toBe(900);
    expect(ref(tft, 'ZG').montant).toBe(900);
    expect(tft.controle.coherent).toBe(true);
  });

  it('AUCUN compte n’est réclamé par deux postes de flux — ni en flux, ni en contrepartie', async () => {
    // Troisième fois que ce défaut apparaît dans le projet (bilan BW/DW,
    // notes 13/22 puis 10/19-21) : ici il produirait un tableau qui boucle à
    // tort, le double comptage se compensant entre deux postes. Un compte
    // PEUT figurer en flux d'un poste et en contrepartie d'un autre (23110000
    // est le flux de FI et rien d'autre ; 40110000 la contrepartie de FF) —
    // ce qui est interdit, c'est qu'il soit réclamé DEUX FOIS au même titre.
    const ECHANTILLON = [
      // Produits et charges
      '70100000', '70400000', '70600000', '70500000', '71100000', '77100000',
      '60400000', '61200000', '62200000', '64100000', '65800000', '66100000', '67100000',
      // Tiers
      '40110000', '41100000', '41610000', '41810000', '41200000', '41620000', '41820000',
      '42200000', '43100000', '44200000', '44910000', '47110000', '47310000', '47320000', '47500000',
      '48100000', '48510000', '48560000',
      // Immobilisations et ressources durables
      '21200000', '23110000', '26100000', '27100000', '10110000', '14110000', '16500000', '18200000',
      // Classe 8
      '82200000', '82600000', '88100000',
    ];
    for (const numero of ECHANTILLON) {
      const enFlux = TOUS_LES_POSTES_FLUX.filter((p) => correspond(numero, p.comptesFlux, p.exclusionsFlux));
      const enContrepartie = TOUS_LES_POSTES_FLUX.filter(
        (p) => p.comptesContrepartie && correspond(numero, p.comptesContrepartie, p.exclusionsContrepartie),
      );
      // FM et FO partagent volontairement le compte 10, lus en sens OPPOSÉS
      // (`CREDIT_SEUL` / `DEBIT_SEUL`) — de même FP et FQ sur 16/18. Ce n'est
      // pas un double comptage : c'est ainsi que le modèle sépare l'apport du
      // remboursement. On vérifie donc l'unicité PAR SENS DE LECTURE.
      const parLecture = new Map<string, string[]>();
      for (const p of enFlux) parLecture.set(p.lectureFlux, [...(parLecture.get(p.lectureFlux) ?? []), p.ref]);
      for (const [lecture, refs] of parLecture) {
        expect({ numero, lecture, refs }).toEqual({ numero, lecture, refs: refs.slice(0, 1) });
      }
      expect({ numero, contreparties: enContrepartie.map((p) => p.ref) }).toEqual({
        numero,
        contreparties: enContrepartie.map((p) => p.ref).slice(0, 1),
      });
    }
  });

  it('la colonne N-1 est une VRAIE comparaison à trois exercices, pas une copie de la colonne N', async () => {
    // Le modèle officiel porte « Exercice N | Exercice N-1 » — et chaque
    // ligne du tableau est déjà elle-même une comparaison entre deux
    // exercices. La colonne N-1 exige donc un TROISIÈME exercice (N-2) en
    // arrière-plan. Créance adhérents : 50 fin N-2, 150 fin N-1 (inchangée
    // fin N). Cotisations appelées : 900 en N-1, 1000 en N.
    //
    //   Encaissé N-1 = 900 + 50 (créance N-2) - 150 (créance N-1) = 800.
    //   Encaissé N   = 1000 + 150 (créance N-1) - 150 (créance N) = 1000.
    const trois = [
      { id: 'eN', dateDebut: new Date('2027-01-01') },
      { id: 'eN1', dateDebut: new Date('2026-01-01') },
      { id: 'eN2', dateDebut: new Date('2025-01-01') },
    ];
    const service = serviceAvecExercices(
      {
        eN2: [ligneF('41100000', ClasseCompte.CLASSE_4, 50, 0)],
        eN1: [
          ligneF('41100000', ClasseCompte.CLASSE_4, 150, 0), // solde de clôture N-1
          ligneF('70100000', ClasseCompte.CLASSE_7, 0, 900),
        ],
        eN: [
          ligneF('41100000', ClasseCompte.CLASSE_4, 150, 0), // inchangée sur l'exercice N
          ligneF('70100000', ClasseCompte.CLASSE_7, 0, 1000),
        ],
      },
      trois,
    );

    const tft = await service.tableauFluxTresorerie('t1', 'eN');
    expect(ref(tft, 'FA').montant).toBe(1000);
    expect(ref(tft, 'FA').montantN1).toBe(800);
    expect(tft.exerciceN1Disponible).toBe(true);
  });

  it('sans troisième exercice (N-2), la colonne N-1 se dégrade proprement — jamais un crash', async () => {
    const service = serviceAvecExercices(
      {
        eN1: [ligneF('41100000', ClasseCompte.CLASSE_4, 200, 0), ligneF('70100000', ClasseCompte.CLASSE_7, 0, 500)],
        eN: [ligneF('70100000', ClasseCompte.CLASSE_7, 0, 100)],
      },
      DEUX_EXERCICES,
    );
    const tft = await service.tableauFluxTresorerie('t1', 'eN');
    // N-1 = 500 + 0 (créance N-2 absente, chargerLignes(null) = []) - 200 (créance N-1) = 300.
    expect(ref(tft, 'FA').montantN1).toBe(300);
  });

  it('reproduit l’ordre officiel, en-têtes de section compris, et la ligne de financement SANS code REF', async () => {
    const service = serviceAvecExercices({ eN: [] });
    const tft = await service.tableauFluxTresorerie('t1', 'eN');

    const refs = tft.lignes.filter((l: any) => !('section' in l)).map((l: any) => l.ref);
    expect(refs).toEqual([
      'ZA',
      'FA', 'FB', 'FC', 'FD', 'FE', 'FF', 'FG', 'FH', 'ZB',
      'FI', 'FJ', 'FK', 'FL', 'ZC',
      'FM', 'FN', 'FO', 'ZD',
      'FP', 'FQ', 'ZE',
      '', // « Flux de trésorerie provenant des activités de financement (D+E) » — sans REF au texte officiel
      'ZF', 'ZG',
    ]);
    const sections = tft.lignes.filter((l: any) => 'section' in l).map((l: any) => l.section);
    expect(sections).toHaveLength(4);
    expect(sections[0]).toBe('Flux de trésorerie provenant des activités opérationnelles');
  });
});
