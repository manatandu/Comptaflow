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

/**
 * LES NOTES DU JEU ASSOCIATIONS LISENT CHAQUE EXERCICE UNE FOIS (audit final
 * F214).
 *
 * Les notes lisaient N et N-1, puis la note 33 appelait le bilan (N, N-1), le
 * compte de résultat (N, N-1) et le tableau des flux (N, N-1, N-2) · NEUF
 * balances pour trois exercices. Le spec monte le VRAI service des états sur
 * une balance qui compte ses appels · une doublure de `bilan` ne relirait
 * rien, et validerait une mémoire qui ne sert à personne.
 *
 * Et la mémoire ne change AUCUNE valeur · le même dossier, lu par un service
 * des états qui ne peut pas l'emprunter, rend les mêmes notes au chiffre près.
 */

function ligne(
  numero: string,
  classe: ClasseCompte,
  reportDebit: number,
  reportCredit: number,
  mouvementDebit: number,
  mouvementCredit: number,
) {
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    reportDebit,
    reportCredit,
    mouvementDebit,
    mouvementCredit,
    totalDebit: reportDebit + mouvementDebit,
    totalCredit: reportCredit + mouvementCredit,
    solde: reportDebit + mouvementDebit - reportCredit - mouvementCredit,
  };
}

// Trois exercices aux balances DIFFÉRENTES · une mémoire qui confondrait deux
// exercices rendrait des notes fausses, et la comparaison le verrait.
const BALANCES: Record<string, ReturnType<typeof ligne>[]> = {
  e2: [
    ligne('10110000', ClasseCompte.CLASSE_1, 0, 800_000, 0, 0),
    ligne('23110000', ClasseCompte.CLASSE_2, 600_000, 0, 150_000, 0),
    ligne('28310000', ClasseCompte.CLASSE_2, 0, 100_000, 0, 50_000),
    ligne('40110000', ClasseCompte.CLASSE_4, 0, 0, 145_000, 190_000),
    ligne('52110000', ClasseCompte.CLASSE_5, 300_000, 0, 600_000, 415_000),
    ligne('60410000', ClasseCompte.CLASSE_6, 0, 0, 190_000, 0),
    ligne('66110000', ClasseCompte.CLASSE_6, 0, 0, 120_000, 0),
    ligne('68110000', ClasseCompte.CLASSE_6, 0, 0, 50_000, 0),
    ligne('70110000', ClasseCompte.CLASSE_7, 0, 0, 0, 400_000),
    ligne('71110000', ClasseCompte.CLASSE_7, 0, 0, 0, 200_000),
  ],
  e1: [
    ligne('10110000', ClasseCompte.CLASSE_1, 0, 800_000, 0, 0),
    ligne('23110000', ClasseCompte.CLASSE_2, 500_000, 0, 100_000, 0),
    ligne('28310000', ClasseCompte.CLASSE_2, 0, 60_000, 0, 40_000),
    ligne('52110000', ClasseCompte.CLASSE_5, 360_000, 0, 250_000, 310_000),
    ligne('60410000', ClasseCompte.CLASSE_6, 0, 0, 140_000, 0),
    ligne('70110000', ClasseCompte.CLASSE_7, 0, 0, 0, 180_000),
  ],
  e0: [
    ligne('10110000', ClasseCompte.CLASSE_1, 0, 800_000, 0, 0),
    ligne('23110000', ClasseCompte.CLASSE_2, 0, 0, 500_000, 0),
    ligne('52110000', ClasseCompte.CLASSE_5, 0, 0, 800_000, 440_000),
    ligne('70110000', ClasseCompte.CLASSE_7, 0, 0, 0, 60_000),
  ],
};

const EXERCICES = [
  { id: 'e2', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z') },
  { id: 'e1', dateDebut: new Date('2025-01-01T00:00:00Z'), dateFin: new Date('2025-12-31T00:00:00Z') },
  { id: 'e0', dateDebut: new Date('2024-01-01T00:00:00Z'), dateFin: new Date('2024-12-31T00:00:00Z') },
];

/** Une balance qui compte ses lectures, et rend l'exercice DEMANDÉ. */
function balanceComptee(): EcritureService {
  return {
    balance: jest.fn((_t: string, exerciceId: string) => {
      const lignes = BALANCES[exerciceId] ?? [];
      return Promise.resolve({
        lignes,
        totaux: {
          debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
          credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
        },
      });
    }),
    // Aucune mise en service liée à une fiche (D6) · les mouvements restent tels quels.
    virementsDeMiseEnService: jest.fn().mockResolvedValue(new Map()),
    mouvementsDeReevaluation: jest.fn().mockResolvedValue(new Map()),
  } as unknown as EcritureService;
}

function exercices(): ExerciceService {
  return { lister: jest.fn().mockResolvedValue([...EXERCICES]) } as unknown as ExerciceService;
}

function prisma(): PrismaService {
  return {
    rattachementNote: { findMany: jest.fn().mockResolvedValue([]) },
    // Registre des provisions vide · aucun passif éventuel à porter à la 16C / 18B (passe R2, B2).
    provisionRisqueCharge: { findMany: jest.fn().mockResolvedValue([]) },
    saisieNote: { findMany: jest.fn().mockResolvedValue([]) },
    exercice: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(EXERCICES.find((e) => e.id === where.id) ?? null),
      ),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
}

const sansBudget = {
  executionBudgetaire: jest.fn().mockRejectedValue(new AucunPlanABudgetsException('aucun plan à budgets')),
} as unknown as EtatsFinanciersProjetBudgetService;

/** Le service des notes sur le VRAI service des états, qui lit la même balance. */
function notesAvecEtatsReels(ecriture: EcritureService): NoteAnnexeService {
  const exercice = exercices();
  return new NoteAnnexeService(ecriture, exercice, prisma(), sansBudget, new EtatsFinanciersService(ecriture, exercice));
}

/**
 * La RÉFÉRENCE sans mémoire · un service des états enveloppé, dont les
 * méthodes appellent le vrai service sur sa propre balance. Rien ne peut lui
 * prêter la balance de l'appel · c'est la lecture d'avant la correction.
 */
function notesSansMemoire(ecriture: EcritureService): NoteAnnexeService {
  const exercice = exercices();
  const reel = new EtatsFinanciersService(ecriture, exercice);
  const enveloppe = {
    bilan: (t: string, e: string) => reel.bilan(t, e),
    compteDeResultat: (t: string, e: string) => reel.compteDeResultat(t, e),
    tableauFluxTresorerie: (t: string, e: string) => reel.tableauFluxTresorerie(t, e),
  } as unknown as EtatsFinanciersService;
  return new NoteAnnexeService(ecriture, exercice, prisma(), sansBudget, enveloppe);
}

const exercicesLus = (ecriture: EcritureService) =>
  (ecriture.balance as jest.Mock).mock.calls.map((appel: unknown[]) => appel[1] as string).sort();

describe('notes du jeu associations · une balance par exercice (audit final F214)', () => {
  it('lit N, N-1 et N-2 une fois chacun, et pas neuf fois', async () => {
    const ecriture = balanceComptee();
    await notesAvecEtatsReels(ecriture).notesAssociations('t', 'e2');
    expect(exercicesLus(ecriture)).toEqual(['e0', 'e1', 'e2']);
  });

  it('la référence sans mémoire relit bien neuf fois · la comparaison qui suit porte sur l’état d’avant', async () => {
    const ecriture = balanceComptee();
    await notesSansMemoire(ecriture).notesAssociations('t', 'e2');
    expect(exercicesLus(ecriture)).toEqual(['e0', 'e1', 'e1', 'e1', 'e1', 'e2', 'e2', 'e2', 'e2']);
  });

  it('ne change AUCUNE valeur · notes, fiche et note 33 identiques à la lecture sans mémoire', async () => {
    const [avec, sans] = await Promise.all([
      notesAvecEtatsReels(balanceComptee()).notesAssociations('t', 'e2'),
      notesSansMemoire(balanceComptee()).notesAssociations('t', 'e2'),
    ]);
    expect(avec).toEqual(sans);
    // La note 33 est bien chiffrée · une comparaison de deux fiches vides ne
    // prouverait rien.
    const n33 = avec.notes.find((n) => n.code === '33')!;
    expect(n33.lignes.some((l) => (l.saisie ?? []).some((v) => typeof v === 'number' && Math.abs(v) > 0.005))).toBe(true);
  });

  it('la mémoire ne survit pas à l’appel · un second appel relit la base', async () => {
    const ecriture = balanceComptee();
    const service = notesAvecEtatsReels(ecriture);
    await service.notesAssociations('t', 'e2');
    await service.notesAssociations('t', 'e2');
    expect(exercicesLus(ecriture)).toEqual(['e0', 'e0', 'e1', 'e1', 'e2', 'e2']);
  });

  it('le service des états injecté garde sa propre balance · la mémoire ne lui est que prêtée', async () => {
    const ecriture = balanceComptee();
    const exercice = exercices();
    const etats = new EtatsFinanciersService(ecriture, exercice);
    const service = new NoteAnnexeService(ecriture, exercice, prisma(), sansBudget, etats);
    await service.notesAssociations('t', 'e2');
    (ecriture.balance as jest.Mock).mockClear();
    await etats.bilan('t', 'e2');
    expect(exercicesLus(ecriture)).toEqual(['e1', 'e2']);
  });
});
