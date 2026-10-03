import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * RÈGLEMENT EN DEVISE ET ÉCART DE CHANGE RÉALISÉ, SUR LA BASE RÉELLE (ligne
 * A6, AUDCIF art. 55, Titre VIII ch. 22 § 2.3).
 *
 * Le cas MBIKAYI / NZUZI du séminaire CPCC (témoin), TVA corrigée · une
 * dette de 1 160 USD au cours de 1 680 (1 948 800), 600 USD réglés par
 * l'écran au cours de 1 750 · le tiers soldé de 1 008 000 dans sa devise, la
 * perte de 42 000 au 656 sur sa propre ligne, la caisse de 1 050 000. Avant la
 * ligne A6, ce règlement était REFUSÉ dès que le cours montait au-delà du dû
 * en francs. Puis le solde de 560 USD payé au cours de 1 900 · le lettrage
 * PROPOSE la perte de 123 200, passée seulement au clic.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Compte { id: string; numero: string; typeCompte: string }
interface Journal { id: string; code: string; type: string; compteTresorerieId: string | null; estActif: boolean }
interface Ligne { compteId: string; debit: number | string; credit: number | string; montantDevise: number | string | null }
interface Ecriture { id: string; libelle: string; lignes: Ligne[] }

const jourPlus = (iso: string, jours: number) => new Date(Date.parse(iso) + jours * 86_400_000).toISOString().slice(0, 10);

test('SYSCOHADA · une dette en dollars réglée à un cours plus haut · perte au 656, tiers soldé dans sa devise', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Change e2e SARL', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const dateFacture = jourPlus(exercice.dateDebut.slice(0, 10), 100);
  const dateReglement = jourPlus(exercice.dateDebut.slice(0, 10), 150);
  const dateSolde = jourPlus(exercice.dateDebut.slice(0, 10), 200);

  const usd = await appelApi<{ id: string }>(page, 'POST', '/devises', { code: 'USD', intitule: 'Dollar américain' });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: dateFacture, cours: 1680 });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: dateReglement, cours: 1750 });

  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const parNumero = (numero: string) => {
    const c = comptes.find((x) => x.numero === numero);
    if (!c) throw new Error(`Compte ${numero} absent du plan semé`);
    return c;
  };
  const fournisseur = parNumero('40110000');
  const achat = comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith('601'))!;
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const achats = journaux.find((j) => j.type === 'ACHATS')!;
  const tresorerie = journaux.find((j) => j.type === 'TRESORERIE' && j.estActif && j.compteTresorerieId)!;

  // La facture de NZUZI · 1 160 USD TTC au cours de 1 680.
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: achats.id,
    date: dateFacture,
    libelle: 'Facture NZUZI e2e',
    lignes: [
      { compteId: achat.id, libelle: 'Marchandises', debit: 1_948_800, credit: 0 },
      { compteId: fournisseur.id, libelle: 'NZUZI', debit: 0, credit: 1_948_800, deviseId: usd.id, montantDevise: 1160, coursApplique: 1680 },
    ],
  });

  // LE RÈGLEMENT PAR L'ÉCRAN · 600 USD, cours du jour proposé.
  await page.goto('/#/reglements');
  await page.getByLabel('Échéances jusqu\'au').fill(dateSolde);
  await page.getByLabel('Journal de trésorerie').selectOption(tresorerie.id);
  await page.getByLabel('Date du règlement').fill(dateReglement);
  await page.getByRole('checkbox', { name: 'Régler cette facture' }).first().check();
  await page.getByLabel('Montant réglé en USD').fill('600');
  await expect(page.getByLabel('Cours du jour du règlement')).toHaveValue('1750');
  await page.getByRole('button', { name: /Enregistrer 1 règlement/ }).click();
  await expect(page.getByText(/perte de change réalisée de 42/)).toBeVisible();

  const lire = async () => (await appelApi<{ ecritures: Ecriture[] }>(page, 'GET', `/ecritures?exerciceId=${exercice.id}`)).ecritures;
  const reglement = (await lire()).find((e) => e.libelle.startsWith('Règlement'))!;
  const resume = (e: Ecriture) =>
    e.lignes
      .map((l) => [comptes.find((c) => c.id === l.compteId)?.numero ?? l.compteId, Number(l.debit), Number(l.credit)])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const numeroTresorerie = comptes.find((c) => c.id === tresorerie.compteTresorerieId)?.numero;
  expect(resume(reglement)).toEqual(
    [
      ['40110000', 1_008_000, 0],
      ['65600000', 42_000, 0],
      [numeroTresorerie, 0, 1_050_000],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
  expect(Number(reglement.lignes.find((l) => l.compteId === fournisseur.id)!.montantDevise)).toBe(600);

  // LE SOLDE de 560 USD au cours de 1 900, passé au journal de trésorerie,
  // puis ajouté au lettrage partiel · soldé en devise, pas en francs.
  const solde = await appelApi<{ lignes: Array<{ id: string; compteId: string }> }>(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: tresorerie.id,
    date: dateSolde,
    libelle: 'Solde NZUZI e2e',
    lignes: [
      { compteId: fournisseur.id, libelle: 'NZUZI', debit: 1_064_000, credit: 0, deviseId: usd.id, montantDevise: 560, coursApplique: 1900 },
      { compteId: tresorerie.compteTresorerieId, libelle: 'NZUZI', debit: 0, credit: 1_064_000 },
    ],
  });
  const etat = await appelApi<{ lettrages: Array<{ id: string; statut: string }> }>(page, 'GET', `/comptes/${fournisseur.id}/lettrage`);
  const groupe = etat.lettrages.find((g) => g.statut === 'PARTIEL')!;
  await appelApi(page, 'POST', `/comptes/${fournisseur.id}/lettrage/${groupe.id}/completer`, {
    ligneIds: [solde.lignes.find((l) => l.compteId === fournisseur.id)!.id],
  });

  // LE LETTRAGE PROPOSE l'écart, rien n'est passé avant le clic.
  await page.goto(`/#/comptes/${fournisseur.id}/lettrage`);
  await page.getByRole('button', { name: 'Écart de change', exact: true }).click();
  const panneau = page.getByLabel('Écart de change proposé');
  await expect(panneau.getByText(/Perte de change réalisée de 123/)).toBeVisible();
  await expect(panneau.getByLabel("Compte d'écart de change")).toContainText('65600000');
  expect((await lire()).some((e) => e.libelle.startsWith('Perte de change réalisée'))).toBe(false);
  await panneau.getByLabel('Journal de l\'écart de change').selectOption({ index: 1 });
  await panneau.getByRole('button', { name: 'Passer l\'écart' }).click();
  await expect(page.getByText(/passée au 65600000, lettrage A soldé/)).toBeVisible();

  const ecart = (await lire()).find((e) => e.libelle.startsWith('Perte de change réalisée'))!;
  expect(resume(ecart)).toEqual([
    ['40110000', 0, 123_200],
    ['65600000', 123_200, 0],
  ]);
  // Le groupe soldé porte le réalisé TOTAL · 42 000 au règlement, 123 200 au dénouement.
  const apres = await appelApi<{ lettrages: Array<{ statut: string; ecartChange: number | null }> }>(page, 'GET', `/comptes/${fournisseur.id}/lettrage`);
  expect(apres.lettrages.find((g) => g.statut === 'SOLDE')?.ecartChange).toBe(165_200);
  expect(pannes).toEqual([]);
});
