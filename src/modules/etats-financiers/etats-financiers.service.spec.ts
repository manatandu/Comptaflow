import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersService } from './etats-financiers.service';
import { EcritureService } from '../comptabilite/ecriture.service';

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

function serviceAvecBalance(lignes: ReturnType<typeof ligne>[]) {
  const ecritureService = {
    balance: jest.fn().mockResolvedValue({
      lignes,
      totaux: {
        debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
        credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
      },
    }),
  } as unknown as EcritureService;
  return new EtatsFinanciersService(ecritureService);
}

describe('EtatsFinanciersService', () => {
  describe('bilan', () => {
    it('équilibre un jeu simple actif / passif / résultat', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', ClasseCompte.CLASSE_5, 1000, 0), // banque débitrice → actif
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 800), // dotation → passif
        ligne('60100000', ClasseCompte.CLASSE_6, 200, 0), // charge → résultat -200
        ligne('70100000', ClasseCompte.CLASSE_7, 0, 400), // produit → résultat +400
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.totalActif).toBe(1000);
      expect(bilan.totalPassif).toBe(1000); // 800 + résultat 200
      expect(bilan.equilibre).toBe(true);
      expect(bilan.passif.find((p) => p.numero === '13100000')?.montant).toBe(200);
    });

    /**
     * RÉGRESSION — bug réel constaté le 2026-08-28. La classe 8 (H.A.O.)
     * tombait dans un `default: break` et n'entrait donc pas dans le
     * résultat : toute cession d'immobilisation (le module Immobilisations
     * poste en 81/82) déséquilibrait le bilan du montant exact de
     * l'opération H.A.O.
     */
    it('fait entrer la classe 8 (H.A.O.) dans le résultat — sinon le bilan ne boucle pas', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', ClasseCompte.CLASSE_5, 40, 0), // encaissement de la cession
        ligne('82200000', ClasseCompte.CLASSE_8, 0, 40), // produit de cession H.A.O.
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.passif.find((p) => p.numero === '13100000')?.montant).toBe(40);
      expect(bilan.totalActif).toBe(40);
      expect(bilan.totalPassif).toBe(40);
      expect(bilan.equilibre).toBe(true);
    });

    it('ignore les comptes de classe 9 (hors bilan par construction de l’Acte uniforme)', async () => {
      const service = serviceAvecBalance([
        ligne('52110000', ClasseCompte.CLASSE_5, 100, 0),
        ligne('10110000', ClasseCompte.CLASSE_1, 0, 100),
        ligne('90000000', ClasseCompte.CLASSE_9, 500, 0), // ne doit rien changer
      ]);

      const bilan = await service.bilan('t1', 'e1');

      expect(bilan.totalActif).toBe(100);
      expect(bilan.totalPassif).toBe(100);
      expect(bilan.actif.some((l) => l.numero === '90000000')).toBe(false);
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

      const resultatAuBilan = bilan.passif.find((p) => p.numero === '13100000')?.montant ?? 0;
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
});
