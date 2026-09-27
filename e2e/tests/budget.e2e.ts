import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LA RETOUCHE D'UN MOIS DE BUDGET, SUR LA BASE RÉELLE (audit final F38).
 *
 * Le défaut tenait à la base elle-même · la ligne annuelle porte un mois nul,
 * qu'une clé unique ordinaire ne sert pas, si bien que la retouche échouait
 * après avoir écrit le mois. Seul PostgreSQL le dit : la retouche doit
 * aboutir, et l'annuelle suivre la somme des mois.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Plan { id: string; code: string; gererBudgets: boolean }
interface Budget { annuel: number; mensuel: Array<{ mois: number; montant: number }> }

for (const referentiel of ['SYCEBNL', 'SYSCOHADA'] as const) {
  test(`${referentiel} · un mois retouché, l'annuelle suit`, async ({ page }) => {
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Budget e2e ${referentiel}`, montant: 10_000 });
    await seConnecter(page, dossier.email);

    const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
    const [plan] = await appelApi<Plan[]>(page, 'GET', '/analytique/plans');
    if (!plan) throw new Error('Aucun plan analytique semé');
    if (!plan.gererBudgets) await appelApi(page, 'PATCH', `/analytique/plans/${plan.id}`, { gererBudgets: true });
    const section = await appelApi<{ id: string }>(page, 'POST', `/analytique/plans/${plan.id}/sections`, {
      code: 'E2E1',
      intitule: 'Section e2e',
    });

    await appelApi(page, 'POST', `/analytique/sections/${section.id}/budget`, { exerciceId: exercice.id, montantAnnuel: 1_200_000 });
    const premier = Number(exercice.dateDebut.slice(5, 7));
    const retouche = await appelApi<Budget>(page, 'PATCH', `/analytique/sections/${section.id}/budget`, {
      exerciceId: exercice.id,
      mois: premier,
      montant: 400_000,
    });
    const moisCouverts = retouche.mensuel.length;
    expect(retouche.mensuel.find((m) => m.mois === premier)?.montant).toBe(400_000);
    expect(retouche.annuel).toBeCloseTo(retouche.mensuel.reduce((s, m) => s + m.montant, 0), 2);
    expect(moisCouverts).toBeGreaterThan(0);

    // Une seconde retouche passe aussi · l'annuelle est unique et atteinte.
    const seconde = await appelApi<Budget>(page, 'PATCH', `/analytique/sections/${section.id}/budget`, {
      exerciceId: exercice.id,
      mois: premier,
      montant: 100_000,
    });
    expect(seconde.annuel).toBeCloseTo(retouche.annuel - 300_000, 2);

    expect(pannes).toEqual([]);
  });
}
