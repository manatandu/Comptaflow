import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EtatsFinanciersProjetService } from './etats-financiers-projet.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';

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
    lister: jest.fn().mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;
  return new EtatsFinanciersProjetService(ecritureService, exerciceService);
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
    it('expose brut/amortissement/net séparément sur un poste actif amorti (AD, matériel et mobilier)', async () => {
      const service = serviceAvecBalance([
        ligne('24100000', ClasseCompte.CLASSE_2, 8000, 0),
        ligne('28400000', ClasseCompte.CLASSE_2, 0, 2000),
      ]);
      const bilan = await service.bilan('t1', 'e1');
      const ad = poste(bilan, 'AD')!;
      expect(ad.brut).toBe(8000);
      expect(ad.amortissement).toBe(2000);
      expect(ad.montant).toBe(6000);
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
    it('XA (revenus) inclut RE (reprises) — anomalie n° 2 corrigée, pas le "Somme RA à RD" littéral du texte', async () => {
      const service = serviceAvecBalance([
        ligne('70200000', ClasseCompte.CLASSE_7, 0, 500), // RA
        ligne('79000000', ClasseCompte.CLASSE_7, 0, 50), // RE
      ]);
      const ce = await service.compteExploitation('t1', 'e1');
      expect(ce.totalRevenus).toBe(550);
    });

    it('RC (subventions, compte 71) est bien rattachée — anomalie n° 1 corrigée', async () => {
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
});
