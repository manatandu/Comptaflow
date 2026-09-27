import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, FENETRE_EN_ERREUR, seConnecter, surveiller } from './outils';

/**
 * LE RAPPORT DE GESTION D'UNE SOCIÉTÉ, À L'ÉCRAN (audit final F16).
 *
 * L'onglet lisait la déclaration de l'art. 18 du SYCEBNL, absente en
 * SYSCOHADA, et levait à l'affichage ; il rangeait les six sections de
 * l'AUSCGIE dans les quatre colonnes du SYCEBNL par leur rang, et
 * n'envoyait jamais `sections`. Une société ne pouvait pas établir son
 * rapport. Ce parcours monte l'onglet, établit le rapport par l'écran et
 * relit ce que le serveur a rangé, sans doublure.
 */
interface Exercice { id: string; dateFin: string }
interface Conformite { etabli: boolean; sections: Array<{ cle: string; renseignee: boolean }> }

test('SYSCOHADA · le rapport de gestion s’affiche, s’établit et se relit sous ses clés', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Rapport e2e SARL', montant: 80_000 });
  await seConnecter(page, dossier.email);
  await appelApi(page, 'PATCH', '/dossier/forme-syscohada', { formeJuridiqueSyscohada: 'SOCIETE_RESPONSABILITE_LIMITEE' });
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const lendemain = new Date(Date.parse(exercice.dateFin.slice(0, 10)) + 86_400_000).toISOString().slice(0, 10);

  await page.goto('/#/documents-obligatoires');
  await page.getByRole('button', { name: 'RAPPORT DE GESTION' }).click();
  await expect(page.getByRole('button', { name: 'Établir le rapport' })).toBeVisible();
  expect(await page.getByText(FENETRE_EN_ERREUR).count()).toBe(0);

  await page.locator('input[type=date]').first().fill(lendemain);
  await page.locator('textarea').first().fill('Activité de l’exercice, écrite à l’écran.');
  await page.getByRole('button', { name: 'Établir le rapport' }).click();
  await expect(page.getByText('Version 1')).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue('Activité de l’exercice, écrite à l’écran.');

  const conf = await appelApi<Conformite>(page, 'GET', `/documents-obligatoires/rapport-activite/conformite?exerciceId=${exercice.id}`);
  expect({
    etabli: conf.etabli,
    premiere: conf.sections[0],
    autres: conf.sections.slice(1).every((s) => !s.renseignee),
  }).toEqual({ etabli: true, premiere: { ...conf.sections[0], renseignee: true }, autres: true });
  expect(pannes).toEqual([]);
});
