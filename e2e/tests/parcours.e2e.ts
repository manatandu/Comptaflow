import { expect, test } from '@playwright/test';
import { FENETRE_EN_ERREUR, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LE PARCOURS DE BASE, DANS LES DEUX RÉFÉRENTIELS · une écriture passée,
 * retrouvée au journal, portée à la balance, et les états financiers qui
 * s'ouvrent sur elle. C'est le chemin que tout client emprunte le premier
 * jour ; s'il casse, rien d'autre ne compte.
 */
const MONTANT = 150_000;
// Le séparateur de milliers du français est une espace insécable (fine ou
// non selon le navigateur) · on accepte les trois.
const MONTANT_AFFICHE = /150[\s  ]000/;

for (const referentiel of ['SYSCOHADA', 'SYCEBNL'] as const) {
  test(`${referentiel} · écriture, journal, balance, états financiers`, async ({ page }) => {
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Dossier e2e ${referentiel}`, montant: MONTANT });
    await seConnecter(page, dossier.email);

    await page.goto('/#/journal?onglet=journal');
    await expect(page.getByText(dossier.libelle).first()).toBeVisible();

    await page.goto('/#/journal?onglet=balance');
    await expect(page.getByText(MONTANT_AFFICHE).first()).toBeVisible();

    await page.goto('/#/etats-financiers');
    await expect(page.getByText(/^ACTIF$/).first()).toBeVisible();
    await expect(page.getByText(FENETRE_EN_ERREUR)).toHaveCount(0);

    expect(pannes).toEqual([]);
  });
}
