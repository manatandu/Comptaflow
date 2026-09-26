import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { API, FENETRE_EN_ERREUR, creerDossier, seConnecter, surveiller } from './outils';

/**
 * CHAQUE COMMANDE DE MENU S'OUVRE SANS PLANTER, dans les deux référentiels.
 * Les chemins sont LUS dans AppShell, jamais recopiés · une fenêtre ajoutée
 * demain entre dans le balayage sans que personne y pense.
 *
 * Ce qui fait tomber le test : une fenêtre qui affiche la limite d'erreur,
 * une exception JavaScript non rattrapée, une réponse 5xx du serveur. Un
 * refus (403 d'une route cloisonnée, 400 d'un paramètre manquant) est une
 * réponse, pas une panne.
 */
const source = readFileSync(join(__dirname, '../../client/src/components/chrome/AppShell.tsx'), 'utf8');
const CHEMINS = [...new Set([...source.matchAll(/chemin: '(\/[^']*)'/g)].map((m) => m[1]))].sort();

test('le balayage trouve encore les commandes de menu', () => {
  // Un balayage qui ne trouve plus rien passe sans rien vérifier.
  expect(CHEMINS.length).toBeGreaterThan(50);
});

for (const referentiel of ['SYSCOHADA', 'SYCEBNL'] as const) {
  test(`${referentiel} · toutes les fenêtres du menu s'ouvrent`, async ({ page }) => {
    const pannes = surveiller(page);
    const limites: string[] = [];
    page.on('response', (r) => {
      if (r.url().startsWith(API) && r.status() === 429) limites.push(r.url().slice(API.length));
    });
    const dossier = await creerDossier(page, { referentiel, nom: `Balayage e2e ${referentiel}`, montant: 1000 });
    await seConnecter(page, dossier.email);

    const enErreur: string[] = [];
    const croix = page.locator('button[aria-label^="Fermer "]');
    for (const chemin of CHEMINS) {
      await page.goto(`/#${chemin}`);
      // UNE FENÊTRE À LA FOIS, LUE UNE FOIS RENDUE · sans ces deux attentes,
      // une panne de rendu s'affichait pendant qu'on regardait déjà la
      // fenêtre suivante, et le test l'attribuait au mauvais écran (vu à la
      // réinjection : /libelles cassé, /magasin accusé).
      // Une fenêtre réservée à l'autre référentiel ne s'ouvre pas (registre
      // des fenêtres, `referentielsApplicables`) · on ne l'attend pas 15 s.
      await croix.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
      await page.getByText('Chargement…', { exact: true }).first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle');
      if ((await page.getByText(FENETRE_EN_ERREUR).count()) > 0) {
        enErreur.push(`${chemin} · ${await page.locator('pre').first().innerText().catch(() => '')}`);
      }
      for (let i = 0; i < 10 && (await croix.count()) > 0; i++) await croix.first().click();
    }
    // La limitation de débit du serveur compte par adresse · un 429 n'est
    // pas une panne, mais il masquerait une fenêtre non chargée. Dit, pas
    // avalé.
    if (limites.length) console.warn(`${limites.length} réponse(s) 429 pendant le balayage ${referentiel}`);

    expect(enErreur, 'fenêtres en erreur').toEqual([]);
    expect(pannes, 'exceptions et réponses 5xx').toEqual([]);
  });
}
