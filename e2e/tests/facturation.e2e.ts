import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * UNE FACTURE SAISIE À L'ÉCRAN SE PASSE AU JOURNAL (audit final F23).
 *
 * Le formulaire n'envoyait ni le tiers ni le taux, alors que la passation
 * exige le compte du tiers et le compte de TVA du taux · « Passer
 * l'écriture » refusait toute pièce saisie ici, et aucune route ne permettait
 * de la compléter ensuite. Ce parcours saisit la pièce par l'écran, la passe
 * par l'écran, et relit l'écriture au brouillard.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Taux { id: string; code: string; compteCollecteId: string | null; taux: string }
interface Ecriture { reference: string | null; statut: string; lignes: Array<{ debit: number | string; credit: number | string }> }

test('SYSCOHADA · une vente saisie à l’écran, avec son tiers et son taux, se passe au brouillard', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Facturation e2e SARL', montant: 50_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const date = new Date((Date.parse(exercice.dateDebut) + Date.parse(exercice.dateFin)) / 2).toISOString().slice(0, 10);
  await appelApi(page, 'POST', '/tiers', { type: 'CLIENT', code: 'CLI-E2E', nom: 'Client e2e SARL' });
  const taux = (await appelApi<Taux[]>(page, 'GET', '/taux-tva?actifsSeuls=true')).find((t) => t.compteCollecteId && Number(t.taux) > 0);
  if (!taux) throw new Error('Aucun taux semé avec un compte de TVA facturée');
  // Le plan semé part NON RETENU (décision du 2026-09-28, « Comptes retenus ») ·
  // la liste de choix de la passation ne propose que les comptes retenus ou
  // utilisés. Le cabinet retient le compte de produit qu'il emploie, comme il
  // le ferait dans Plan comptable.
  const produit = (await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?classe=CLASSE_7&typeCompte=DETAIL')).find(
    (c) => c.numero === '70110000',
  );
  if (!produit) throw new Error('Compte 70110000 absent du plan semé');
  await appelApi(page, 'PATCH', `/comptes/${produit.id}`, { estRetenu: true });

  await page.goto('/#/facturation');
  const formulaire = page.locator('section', { hasText: 'Enregistrer une facture' });
  await formulaire.getByLabel('Tiers au plan').selectOption({ label: 'CLI-E2E · Client e2e SARL' });
  await formulaire.getByLabel('N° de série').fill('FV-E2E-1');
  await formulaire.getByLabel('Date', { exact: true }).fill(date);
  await formulaire.getByLabel('Désignation').fill('Prestation e2e');
  await formulaire.getByLabel('Quantité').fill('1');
  await formulaire.getByLabel('Prix unitaire').fill('100000');
  await formulaire.getByLabel('Montant HT').fill('100000');
  await formulaire.getByLabel('Taux de taxe').selectOption(taux.id);
  await formulaire.getByLabel('Montant de TVA').fill(String(100000 * Number(taux.taux) / 100));
  await formulaire.getByRole('button', { name: 'Enregistrer' }).click();

  const ligne = page.locator('tr', { hasText: 'FV-E2E-1' });
  await ligne.getByRole('button', { name: 'Passer l’écriture' }).click();
  const compte = ligne.getByLabel('Compte');
  await expect(compte.locator('option').nth(1)).toBeAttached();
  await compte.selectOption({ index: 1 });
  await ligne.getByRole('button', { name: 'Passer au brouillard' }).click();
  await expect(ligne.getByText('Écriture passée')).toBeVisible();

  const { ecritures } = await appelApi<{ ecritures: Ecriture[] }>(page, 'GET', `/ecritures?exerciceId=${exercice.id}`);
  const passee = ecritures.find((e) => e.reference === 'FV-E2E-1');
  expect({ statut: passee?.statut, lignes: passee?.lignes.length }).toEqual({ statut: 'BROUILLARD', lignes: 3 });

  // AUDIT FINAL F25 · la même pièce, restée au brouillard, n'entre pas dans la
  // déclaration de TVA, qui la nomme, et la période ne se liquide pas.
  const mois = date.slice(0, 7);
  const fin = new Date(Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const decl = await appelApi<{ totalCollecte: number; tvaAuBrouillard: { collecte: number; ecritures: number } }>(
    page,
    'GET',
    `/taux-tva/declaration?dateDebut=${mois}-01&dateFin=${fin}`,
  );
  expect(decl).toMatchObject({ totalCollecte: 0, tvaAuBrouillard: { collecte: 100000 * Number(taux.taux) / 100, ecritures: 1 } });
  await expect(
    appelApi(page, 'POST', '/taux-tva/declaration/comptabiliser', {
      exerciceId: exercice.id,
      dateDebut: `${mois}-01`,
      dateFin: fin,
    }),
  ).rejects.toThrow(/400 · .*au brouillard/);
  expect(pannes).toEqual([]);
});
