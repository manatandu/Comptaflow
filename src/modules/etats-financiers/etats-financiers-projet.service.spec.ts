import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { PrismaService } from '../../common/prisma.service';

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

/** Stub Prisma minimal : noteBailleur() ne trouve aucun compte/aucune ligne par défaut. */
function prismaVide() {
  return {
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
}

function serviceAvecExercices(
  lignesParExercice: Record<string, ReturnType<typeof ligne>[]>,
  exercices: Array<{ id: string; dateDebut: Date }> = [],
  prisma: PrismaService = prismaVide(),
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
    lister: jest.fn().mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;
  return new EtatsFinanciersProjetService(ecritureService, exerciceService, prisma);
}

function serviceAvecBalance(lignes: ReturnType<typeof ligne>[]) {
  return serviceAvecExercices({ e1: lignes });
}

function poste(etat: { actif: any[]; passif: any[] } | { revenus: any[]; charges: any[] }, ref: string) {
  const tous = 'actif' in etat ? [...etat.actif, ...etat.passif] : [...etat.revenus, ...etat.charges];
  return tous.find((p) => p.ref === ref);
}

describe('EtatsFinanciersProjetService', () => {
  describe('bilan', () => {
    it('n’expose NI brut NI amortissement : ce jeu n’a que deux colonnes de valeur (audit 2026-08-28)', async () => {
      // Le texte officiel du bilan projet donne « EXERCICE AU 31/12/N | N-1 »,
      // et son tableau de correspondance ne cite aucun compte 28x/29x. Une
      // première version avait recopié les amortissements du jeu associations.
      const service = serviceAvecBalance([ligne('24100000', ClasseCompte.CLASSE_2, 8000, 0)]);
      const bilan = await service.bilan('t1', 'e1');
      const ad = poste(bilan, 'AD')!;
      expect(ad.montant).toBe(8000);
      expect(ad.brut).toBeUndefined();
      expect(ad.amortissement).toBeUndefined();
    });

    it('un compte 28x/29x ne disparaît pas en silence : il ressort en « comptes non rattachés »', async () => {
      const service = serviceAvecBalance([ligne('28400000', ClasseCompte.CLASSE_2, 0, 2000)]);
      const bilan = await service.bilan('t1', 'e1');
      expect(bilan.comptesNonRattaches.map((c: any) => c.numero)).toContain('28400000');
    });

    it('BD exclut 411 ET 419 comme le dit le texte ; 411 ressort en non rattaché', async () => {
      const service = serviceAvecBalance([
        ligne('41100000', ClasseCompte.CLASSE_4, 700, 0),
        ligne('41200000', ClasseCompte.CLASSE_4, 300, 0),
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'BD')!.montant).toBe(300); // 412 seulement, pas 411
      expect(bilan.comptesNonRattaches.map((c: any) => c.numero)).toContain('41100000');
    });

    it('un découvert bancaire ne casse pas l’équilibre du bilan (régression audit)', async () => {
      const service = serviceAvecBalance([
        ligne('24100000', ClasseCompte.CLASSE_2, 300, 0),
        ligne('52110000', ClasseCompte.CLASSE_5, 0, 300),
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(bilan.totalActif).toBe(300);
      expect(bilan.totalPassif).toBe(300);
      expect(bilan.equilibre).toBe(true);
    });

    // Régression audit RE-176 (2026-09-04) · anomalie n° 4 de
    // correspondance-projet-bilan.ts. Le tableau officiel donne « DH | Autres
    // dettes | 419, Soldes créditeurs : 42, 43, 44, 47 (sauf 478) » et « DY |
    // Ecart de conversion-Passif | 479 » : sans exclusion de 479 sur DH, le
    // préfixe '47' avale 479 et le gain latent de change entre à la fois dans
    // DJ (donc DZ) et dans DY. Le passif ressortait au double.
    it('un écart de conversion-passif (479) n’est porté QUE par DY, jamais aussi par DH', async () => {
      const service = serviceAvecBalance([
        ligne('41200000', ClasseCompte.CLASSE_4, 500, 0), // BD · clients-usagers
        ligne('47910000', ClasseCompte.CLASSE_4, 0, 500), // DY · écart de conversion-passif
      ]);
      const bilan = await service.bilan('t1', 'e1');

      expect(poste(bilan, 'DY')!.montant).toBe(500);
      expect(poste(bilan, 'DH')!.montant).toBe(0);
      expect(poste(bilan, 'DH')!.comptes.map((c: any) => c.numero)).not.toContain('47910000');
      expect(poste(bilan, 'DJ')!.montant).toBe(0); // TOTAL PASSIF CIRCULANT, qui somme DH
      expect(bilan.totalPassif).toBe(500); // et non 1000
      expect(bilan.totalActif).toBe(500);
      expect(bilan.equilibre).toBe(true);
    });

    it('l’exclusion de 479 n’ampute rien d’autre du poste DH · un 471 créditeur y reste', async () => {
      // 471 « Débiteurs et créditeurs divers » (Partie 2 ch. 3, COMPTE 47) :
      // il doit continuer à alimenter DH, sinon la correction aurait déplacé
      // de vraies dettes en « comptes non rattachés ».
      const service = serviceAvecBalance([ligne('47120000', ClasseCompte.CLASSE_4, 0, 300)]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'DH')!.montant).toBe(300);
      expect(bilan.comptesNonRattaches.map((c: any) => c.numero)).not.toContain('47120000');
    });

    it('AZ (total actif immobilisé) additionne AA à AH', async () => {
      const service = serviceAvecBalance([
        ligne('21000000', ClasseCompte.CLASSE_2, 1000, 0), // AA
        ligne('22000000', ClasseCompte.CLASSE_2, 500, 0), // AB
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'AZ')!.montant).toBe(1500);
    });

    it('CC (solde des opérations) vient UNIQUEMENT du compte 13, jamais des classes 6/7/8', async () => {
      const service = serviceAvecBalance([
        ligne('13100000', ClasseCompte.CLASSE_1, 0, 400), // compte 13 créditeur -> CC = 400
        ligne('66000000', ClasseCompte.CLASSE_6, 900, 0), // ignoré par CC (contrairement à CH côté associations)
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'CC')!.montant).toBe(400);
    });

    it('DW capte les découverts bancaires (52/53 créditeurs) en plus de 56', async () => {
      const service = serviceAvecBalance([
        ligne('52100000', ClasseCompte.CLASSE_5, 0, 300), // banque à découvert -> DW
        ligne('56100000', ClasseCompte.CLASSE_5, 0, 100),
      ]);
      const bilan = await service.bilan('t1', 'e1');
      expect(poste(bilan, 'DW')!.montant).toBe(400);
    });

    it('signale les comptes de bilan non rattachés à aucun poste officiel', async () => {
      const service = serviceAvecBalance([ligne('45900000', ClasseCompte.CLASSE_4, 100, 0)]);
      const bilan = await service.bilan('t1', 'e1');
      expect(bilan.comptesNonRattaches.map((c: any) => c.numero)).toContain('45900000');
    });

    it('comparatif N-1 : absent (undefined) au premier exercice du dossier, présent sinon', async () => {
      const service = serviceAvecBalance([ligne('21000000', ClasseCompte.CLASSE_2, 1000, 0)]);
      const bilan = await service.bilan('t1', 'e1');
      expect(bilan.exerciceN1Disponible).toBe(false);
      expect(poste(bilan, 'AA')!.montantN1).toBeUndefined();

      const service2 = serviceAvecExercices(
        { e1: [ligne('21000000', ClasseCompte.CLASSE_2, 1000, 0)], e0: [ligne('21000000', ClasseCompte.CLASSE_2, 700, 0)] },
        [
          { id: 'e1', dateDebut: new Date('2026-01-01') },
          { id: 'e0', dateDebut: new Date('2025-01-01') },
        ],
      );
      const bilan2 = await service2.bilan('t1', 'e1');
      expect(bilan2.exerciceN1Disponible).toBe(true);
      expect(poste(bilan2, 'AA')!.montantN1).toBe(700);
    });
  });

  describe('compteExploitation', () => {
    it('XA (revenus) inclut RE (reprises) · anomalie n° 2 corrigée, pas le "Somme RA à RD" littéral du texte', async () => {
      const service = serviceAvecBalance([
        ligne('70200000', ClasseCompte.CLASSE_7, 0, 500), // RA
        ligne('79000000', ClasseCompte.CLASSE_7, 0, 50), // RE
      ]);
      const ce = await service.compteExploitation('t1', 'e1');
      expect(ce.totalRevenus).toBe(550);
    });

    it('RC (subventions, compte 71) est bien rattachée · anomalie n° 1 corrigée', async () => {
      const service = serviceAvecBalance([ligne('71000000', ClasseCompte.CLASSE_7, 0, 200)]);
      const ce = await service.compteExploitation('t1', 'e1');
      expect(poste(ce, 'RC')!.montant).toBe(200);
    });

    it('le doublon officiel TJ/TK (comptes 66/69 et 67/82-88) est bien réparti sur deux lignes distinctes, jamais confondu', async () => {
      const service = serviceAvecBalance([
        ligne('66000000', ClasseCompte.CLASSE_6, 300, 0), // TJ_PERSONNEL
        ligne('69000000', ClasseCompte.CLASSE_6, 40, 0), // TJ_DOTATIONS_PROVISIONS
        ligne('67000000', ClasseCompte.CLASSE_6, 20, 0), // TK_FRAIS_FINANCIERS
        ligne('82000000', ClasseCompte.CLASSE_8, 0, 60), // TK_PRODUITS_HAO (signe PRODUIT malgré le préfixe T)
      ]);
      const ce = await service.compteExploitation('t1', 'e1');
      const tj = ce.charges.filter((p) => p.ref === 'TJ');
      const tk = ce.charges.filter((p) => p.ref === 'TK');
      expect(tj.map((p) => p.montant)).toEqual([300, 40]);
      expect(tk.map((p) => p.montant)).toEqual([20, 60]);
      // XB additionne les deux lignes de chaque ref, y compris le produit HAO en +.
      expect(ce.totalCharges).toBe(300 + 40 + 20 + 60);
    });

    it('XC = XA - XB, exposé même non nul (pas forcé à zéro)', async () => {
      const service = serviceAvecBalance([
        ligne('70200000', ClasseCompte.CLASSE_7, 0, 600), // RA
        ligne('66000000', ClasseCompte.CLASSE_6, 250, 0), // TJ_PERSONNEL
      ]);
      const ce = await service.compteExploitation('t1', 'e1');
      expect(ce.solde).toBe(350);
      expect(ce.controle.boucleAZero).toBe(false);
    });

    it('comparatif N-1 sur totaux et solde', async () => {
      const service = serviceAvecExercices(
        {
          e1: [ligne('70200000', ClasseCompte.CLASSE_7, 0, 600), ligne('66000000', ClasseCompte.CLASSE_6, 250, 0)],
          e0: [ligne('70200000', ClasseCompte.CLASSE_7, 0, 400), ligne('66000000', ClasseCompte.CLASSE_6, 400, 0)],
        },
        [
          { id: 'e1', dateDebut: new Date('2026-01-01') },
          { id: 'e0', dateDebut: new Date('2025-01-01') },
        ],
      );
      const ce = await service.compteExploitation('t1', 'e1');
      expect(ce.totalRevenusN1).toBe(400);
      expect(ce.totalChargesN1).toBe(400);
      expect(ce.soldeN1).toBe(0);
    });

    it('signale les comptes de gestion non rattachés à aucun poste officiel', async () => {
      const service = serviceAvecBalance([ligne('68000000', ClasseCompte.CLASSE_6, 50, 0)]);
      const ce = await service.compteExploitation('t1', 'e1');
      expect(ce.comptesNonRattaches.map((c) => c.numero)).toContain('68000000');
    });
  });

  describe('noteBailleur', () => {
    const bailleurUE = { id: 'b-ue', code: 'UE-01', nom: 'Union européenne' };
    const bailleurBM = { id: 'b-bm', code: 'BM-01', nom: 'Banque mondiale' };

    function compte(id: string, numero: string, bailleur: typeof bailleurUE | null = null) {
      return { id, numero, bailleur };
    }
    function ligneMouvement(compteId: string, debit: number, credit: number, estGenereeParCloture = false) {
      return { compteId, debit, credit, ecriture: { estGenereeParCloture } };
    }

    function prisma(comptes: ReturnType<typeof compte>[], mouvements: ReturnType<typeof ligneMouvement>[]) {
      return {
        compte: { findMany: jest.fn().mockResolvedValue(comptes) },
        ligneEcriture: { findMany: jest.fn().mockResolvedValue(mouvements) },
      } as unknown as PrismaService;
    }

    it('les trois colonnes se réconcilient TOUJOURS : solde restant = décaissé − consommé', async () => {
      const prismaMock = prisma(
        [compte('id-16210000', '16210000', bailleurUE)],
        [ligneMouvement('id-16210000', 0, 900), ligneMouvement('id-16210000', 350, 0)],
      );
      const service = serviceAvecExercices({ e1: [] }, [], prismaMock);
      const note = await service.noteBailleur('t1', 'e1');
      const ue = note.investissement.find((b) => b.bailleur.code === 'UE-01')!;
      expect(ue.soldeRestant).toBe(ue.decaisse - ue.consomme);
      expect(ue.soldeRestant).toBe(550);
    });

    it('cumule TOUTES les périodes : la note suit le projet, pas l’exercice (audit 2026-08-28)', async () => {
      // Le mock ligneEcriture.findMany ignore le filtre : ce test vérifie que
      // le service ne passe PLUS `exerciceId` dans sa clause where.
      const prismaMock = prisma([compte('id-16210000', '16210000', bailleurUE)], [ligneMouvement('id-16210000', 0, 100000)]);
      const service = serviceAvecExercices({ e1: [] }, [], prismaMock);
      await service.noteBailleur('t1', 'e1');
      const where = (prismaMock.ligneEcriture.findMany as jest.Mock).mock.calls[0][0].where;
      // Le filtre porte sur le dossier et sur le statut, jamais sur
      // l'exercice · la note 9 cumule depuis l'origine du projet. Le statut
      // VALIDEE s'y est ajouté avec le brouillard : la note 9 est un état
      // financier, elle ne lit pas les écritures non encore validées.
      expect(where.ecriture).toEqual({ tenantId: 't1', statut: 'VALIDEE' });
      expect(where.ecriture.exerciceId).toBeUndefined();
    });

    it('décaissé = crédits réels, consommé = débits réels · les écritures de clôture (RAN) sont exclues', async () => {
      const prismaMock = prisma(
        [compte('id-16210000', '16210000', bailleurUE)],
        [
          ligneMouvement('id-16210000', 0, 1000), // mise à disposition réelle
          ligneMouvement('id-16210000', 300, 0), // consommation réelle
          ligneMouvement('id-16210000', 0, 5000, true), // report à-nouveau · doit être IGNORÉ
        ],
      );
      const service = serviceAvecExercices({ e1: [] }, [], prismaMock);
      const note = await service.noteBailleur('t1', 'e1');
      const ue = note.investissement.find((b) => b.bailleur.code === 'UE-01')!;
      expect(ue.decaisse).toBe(1000); // PAS 1000+5000 : le report à-nouveau est exclu
      expect(ue.consomme).toBe(300);
      expect(ue.soldeRestant).toBe(700); // 1000 - 300, réconcilié par construction
    });

    it('sépare fonds d’investissement (162-164) et fonds d’administration (462-464) même pour le même bailleur', async () => {
      const prismaMock = prisma(
        [compte('c-162', '16210000', bailleurUE), compte('c-462', '46210000', bailleurUE)],
        [ligneMouvement('c-162', 0, 500), ligneMouvement('c-462', 0, 800)],
      );
      const service = serviceAvecExercices(
        { e1: [ligne('16210000', ClasseCompte.CLASSE_1, 0, 500), ligne('46210000', ClasseCompte.CLASSE_4, 0, 800)] },
        [],
        prismaMock,
      );
      const note = await service.noteBailleur('t1', 'e1');
      expect(note.investissement.find((b) => b.bailleur.code === 'UE-01')!.decaisse).toBe(500);
      expect(note.administration.find((b) => b.bailleur.code === 'UE-01')!.decaisse).toBe(800);
    });

    it('agrège plusieurs sous-comptes du même bailleur, distingue deux bailleurs différents', async () => {
      const prismaMock = prisma(
        [compte('c-1621', '16210000', bailleurUE), compte('c-1622', '16220000', bailleurUE), compte('c-1631', '16310000', bailleurBM)],
        [ligneMouvement('c-1621', 0, 400), ligneMouvement('c-1622', 0, 100), ligneMouvement('c-1631', 0, 900)],
      );
      const service = serviceAvecExercices(
        {
          e1: [
            ligne('16210000', ClasseCompte.CLASSE_1, 0, 400),
            ligne('16220000', ClasseCompte.CLASSE_1, 0, 100),
            ligne('16310000', ClasseCompte.CLASSE_1, 0, 900),
          ],
        },
        [],
        prismaMock,
      );
      const note = await service.noteBailleur('t1', 'e1');
      expect(note.investissement.find((b) => b.bailleur.code === 'UE-01')!.decaisse).toBe(500); // 400 + 100
      expect(note.investissement.find((b) => b.bailleur.code === 'BM-01')!.decaisse).toBe(900);
    });

    it('un compte 162-164/462-464 SANS bailleur ressort dans nonAffecte, jamais silencieusement absorbé dans un total', async () => {
      const prismaMock = prisma([compte('c-164', '16400000', null)], [ligneMouvement('c-164', 0, 250)]);
      const service = serviceAvecExercices({ e1: [ligne('16400000', ClasseCompte.CLASSE_1, 0, 250)] }, [], prismaMock);
      const note = await service.noteBailleur('t1', 'e1');
      expect(note.investissement).toHaveLength(0);
      expect(note.investissementNonAffecte.decaisse).toBe(250);
    });

    it('totalFondsDuBailleur additionne investissement + administration (bailleurs affectés seulement)', async () => {
      const prismaMock = prisma(
        [compte('c-162', '16210000', bailleurUE), compte('c-462', '46210000', bailleurUE)],
        [ligneMouvement('c-162', 0, 500), ligneMouvement('c-462', 0, 800)],
      );
      const service = serviceAvecExercices(
        { e1: [ligne('16210000', ClasseCompte.CLASSE_1, 0, 500), ligne('46210000', ClasseCompte.CLASSE_4, 0, 800)] },
        [],
        prismaMock,
      );
      const note = await service.noteBailleur('t1', 'e1');
      expect(note.totalFondsDuBailleur.decaisse).toBe(1300);
    });
  });
});
