import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import {
  AucunPlanABudgetsException,
  EtatsFinanciersProjetBudgetService,
} from '../etats-financiers/etats-financiers-projet-budget.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { PrismaService } from '../../common/prisma.service';
import { NoteAnnexeService } from './note-annexe.service';
import type { RubriqueNote } from './note-annexe.types';

/**
 * UNE RUBRIQUE DE NOTE SE LIT AU SOLDE (audit final F213).
 *
 * Le type portait une « source » de montant, « mouvement débit » ou
 * « mouvement crédit », qu'aucune rubrique des trois jeux ne posait, et que le
 * moteur lisait sur le TOTAL de la balance, report à-nouveau compris · un
 * bâtiment détenu depuis des années y serait sorti en mouvement de l'exercice.
 * La branche morte est retirée. C'est le COMPILATEUR qui la tient retirée ·
 * une table de notes qui voudrait la poser ne compilerait plus.
 */

describe('rubriques de notes · le solde, et lui seul (audit final F213)', () => {
  it('le type d’une rubrique n’accepte plus de source de montant', () => {
    const rubrique: RubriqueNote = {
      libelle: 'Achats',
      comptes: ['60'],
      // @ts-expect-error · plus aucune source à choisir, le montant est le solde.
      source: 'MOUVEMENT_DEBIT',
    };
    expect(rubrique.libelle).toBe('Achats');
  });

  it('le montant d’une rubrique est le solde de ses comptes, report compris', async () => {
    // Une banque ouverte à 300 000 (report), 600 000 encaissés et 415 000
    // décaissés dans l'exercice · le solde est 485 000. Le total débit
    // (900 000) est ce que la source « mouvement débit » aurait rendu.
    const lignes = [
      {
        compteId: 'id-52110000',
        numero: '52110000',
        intitule: 'Banque',
        classe: ClasseCompte.CLASSE_5,
        typeCompte: TypeCompteDetailTotal.DETAIL,
        reportDebit: 300_000,
        reportCredit: 0,
        mouvementDebit: 600_000,
        mouvementCredit: 415_000,
        totalDebit: 900_000,
        totalCredit: 415_000,
        solde: 485_000,
      },
    ];
    const ecriture = {
      balance: jest.fn(() => Promise.resolve({ lignes, totaux: { debit: 900_000, credit: 415_000 } })),
      virementsDeMiseEnService: jest.fn().mockResolvedValue(new Map()),
      mouvementsDeReevaluation: jest.fn().mockResolvedValue(new Map()),
    } as unknown as EcritureService;
    const exercice = {
      lister: jest.fn().mockResolvedValue([{ id: 'e1', dateDebut: new Date('2026-01-01T00:00:00Z') }]),
    } as unknown as ExerciceService;
    const prisma = {
      rattachementNote: { findMany: jest.fn().mockResolvedValue([]) },
      // Registre des provisions vide · aucun passif éventuel à porter à la 16C / 18B (passe R2, B2).
      provisionRisqueCharge: { findMany: jest.fn().mockResolvedValue([]) },
      saisieNote: { findMany: jest.fn().mockResolvedValue([]) },
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e1', dateFin: new Date('2026-12-31T00:00:00Z') }) },
      ecriture: { findMany: jest.fn().mockResolvedValue([]) },
      ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const budget = {
      executionBudgetaire: jest.fn().mockRejectedValue(new AucunPlanABudgetsException('aucun plan à budgets')),
    } as unknown as EtatsFinanciersProjetBudgetService;
    const service = new NoteAnnexeService(ecriture, exercice, prisma, budget, new EtatsFinanciersService(ecriture, exercice));

    const { notes } = await service.notesAssociations('t', 'e1');
    const banques = notes
      .find((n) => n.code === '13')!
      .lignes.find((l) => l.libelle === 'Banques locales' && l.montantN > 0)!;
    expect(banques.montantN).toBe(485_000);
    expect(banques.comptes).toEqual([{ numero: '52110000', intitule: 'Banque', montant: 485_000 }]);
  });
});
