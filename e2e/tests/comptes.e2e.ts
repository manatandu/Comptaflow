import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LA CLASSE D'UN COMPTE CRÉÉ SE LIT DANS SON NUMÉRO (audit final F40).
 *
 * Sur la base réelle, par la route de création · un compte de charge créé sans
 * classe arrive en classe 6, et une classe qui contredit le numéro est refusée
 * sans que rien ne soit créé.
 */
test('SYCEBNL · un compte de charge créé sans classe est rangé en classe 6', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Classe e2e', montant: 1_000 });
  await seConnecter(page, dossier.email);

  const cree = await appelApi<{ numero: string; classe: string }>(page, 'POST', '/comptes', {
    numero: '60110099',
    intitule: 'Achats de riz',
  });
  expect(cree).toMatchObject({ numero: '60110099', classe: 'CLASSE_6' });

  await expect(
    appelApi(page, 'POST', '/comptes', { numero: '60110098', intitule: 'x', classe: 'CLASSE_1' }),
  ).rejects.toThrow(/· 400 ·[\s\S]*est de la classe 6/);

  const classe6 = await appelApi<Array<{ numero: string }>>(page, 'GET', '/comptes?classe=CLASSE_6');
  expect(classe6.map((c) => c.numero)).toContain('60110099');
  expect(classe6.map((c) => c.numero)).not.toContain('60110098');
  expect(pannes).toEqual([]);
});
