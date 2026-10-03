import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, FENETRE_EN_ERREUR, seConnecter, surveiller } from './outils';

/**
 * LA PROVISION POUR PERTES DE CHANGE S'AJUSTE, SUR LA BASE RÉELLE (ligne A5
 * du suivi des immobilisations, relevé CPCC C1).
 *
 * AUDCIF Titre VIII ch. 22 § 2.3 · « La provision pour pertes de change de
 * fin d'exercice est ajustée pour tenir compte des opérations dénouées au
 * cours de l'exercice ». Le module dotait la provision entière à chaque
 * clôture sans lire celle en place, et REFUSAIT une réévaluation sans
 * position · la provision d'une créance encaissée restait au passif pour
 * toujours. Ce parcours passe par les routes, le serveur et PostgreSQL, puis
 * par l'écran, qui doit offrir de passer la seule reprise.
 */

interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Compte { id: string; numero: string; typeCompte: string }
interface Journal { id: string; code: string; type: string }
interface LigneBalance { numero: string; mouvementDebit: number; mouvementCredit: number }

const jour = (iso: string) => iso.slice(0, 10);
const lendemain = (iso: string) => new Date(Date.parse(jour(iso)) + 86_400_000).toISOString().slice(0, 10);

test('SYSCOHADA · la provision de N est reprise en N+1 quand la créance est dénouée, depuis l’écran', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Devises e2e SYSCOHADA', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
  const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;

  // Une créance client de 1 000 USD inscrite au cours de 2 000, une clôture à
  // 1 900 · perte latente de 100 000, provision d'exploitation (6591 / 4991).
  const usd = await appelApi<{ id: string }>(page, 'POST', '/devises', { code: 'USD', intitule: 'Dollar américain' });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: jour(exercice.dateFin), cours: 1900, source: 'e2e' });
  const milieu = new Date((Date.parse(exercice.dateDebut) + Date.parse(exercice.dateFin)) / 2).toISOString().slice(0, 10);
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: journal.id,
    date: milieu,
    libelle: 'Vente en dollars',
    lignes: [
      { compteId: detail('411').id, libelle: 'Client USD', debit: 2_000_000, credit: 0, deviseId: usd.id, montantDevise: 1000, coursApplique: 2000 },
      { compteId: detail('701').id, libelle: 'Vente', debit: 0, credit: 2_000_000 },
    ],
  });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });

  // N+1 · la créance a été encaissée, plus aucune position en devise.
  const debut = lendemain(exercice.dateFin);
  const suivant = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: debut, dateFin: `${debut.slice(0, 4)}-12-31` });

  // L'exercice le plus récent est retenu par l'écran · c'est N+1. Le
  // contexte d'exercice a été lu à la connexion, avant que N+1 n'existe ·
  // la page se recharge pour le relire.
  await page.goto('/#/devises');
  await page.reload();
  await expect(page.getByText('Réévaluation à la clôture')).toBeVisible();
  await expect(page.getByText(FENETRE_EN_ERREUR)).toHaveCount(0);
  await page.getByRole('button', { name: 'Calculer' }).click();
  const ajustement = page.getByTestId('ajustement-provision');
  await expect(ajustement).toBeVisible();
  await expect(ajustement).toContainText('4991');
  await expect(ajustement).toContainText('(7591)');
  await expect(page.getByText('Aucune position en devise à réévaluer à cette date.')).toBeVisible();

  // Sans position, le bouton reste offert · seule la reprise se passe.
  await page.getByRole('button', { name: 'Passer les écritures' }).click();
  await expect(page.getByText('Réévaluation passée')).toBeVisible();
  await expect(page.getByText('Aucun écart')).toBeVisible();

  const [passee] = await appelApi<{ ecritureEcarts: unknown; ecritureProvision: { id: string } | null }[]>(
    page,
    'GET',
    `/devises/reevaluation/liste?exerciceId=${suivant.id}`,
  );
  expect({ ecarts: passee.ecritureEcarts, provision: !!passee.ecritureProvision }).toEqual({ ecarts: null, provision: true });

  const { lignes } = await appelApi<{ lignes: LigneBalance[] }>(page, 'GET', `/ecritures/balance?exerciceId=${suivant.id}`);
  const ligne = (racine: string) => lignes.find((l) => l.numero.startsWith(racine));
  expect({
    provision: [ligne('4991')?.mouvementDebit, ligne('4991')?.mouvementCredit],
    reprise: [ligne('7591')?.mouvementDebit, ligne('7591')?.mouvementCredit],
    dotation: ligne('6591')?.mouvementDebit ?? 0,
  }).toEqual({ provision: [100_000, 0], reprise: [0, 100_000], dotation: 0 });

  expect(pannes).toEqual([]);
});

/**
 * DOSSIER REPRIS · LA PROVISION D'OUVERTURE SE DÉCLARE (décisions de Manasse
 * du 2026-10-02). Fiche du compte 19 · « réajusté à la clôture de chaque
 * exercice, soit par dotations supplémentaires, soit par reprises des
 * provisions antérieures ». Le dossier est repris par un VRAI bilan
 * d'ouverture importé, resté au brouillard, qui porte 100 000 au 4991 ·
 * l'écran le propose « provisoire, non validé », la réévaluation se calcule
 * mais ne se passe pas tant que la provision n'est pas déclarée (Q1). Déclarés,
 * les 100 000 sont lus en place, et une perte retombée à 60 000 ne se dote
 * pas une seconde fois · seule la reprise de 40 000 au 7591 se passe. La
 * version utilisée se fige (Q2).
 */
test('SYSCOHADA · bilan d’ouverture importé, provision déclarée à l’écran, puis reprise de l’écart seul', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Devises e2e repris', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
  const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;

  // Le bilan d'ouverture du dossier repris · 100 000 au 4991, contre la banque.
  const csv = `Compte;Intitule;Debit;Credit\n${detail('52').numero};Banque;100000;0\n${detail('4991').numero};Provision;0;100000\n`;
  await appelApi(page, 'POST', '/import/executer', {
    type: 'BALANCE',
    nomFichier: 'bilan-ouverture.csv',
    contenuBase64: Buffer.from(csv, 'utf8').toString('base64'),
    mapping: { numero: 'Compte', intitule: 'Intitule', debit: 'Debit', credit: 'Credit' },
    exerciceId: exercice.id,
    journalId: journal.id,
    bilanDOuverture: true,
  });

  // Créance de 1 000 USD inscrite à 2 000, clôture à 1 940 · perte de 60 000.
  const usd = await appelApi<{ id: string }>(page, 'POST', '/devises', { code: 'USD', intitule: 'Dollar américain' });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: jour(exercice.dateFin), cours: 1940, source: 'e2e' });
  const milieu = new Date((Date.parse(exercice.dateDebut) + Date.parse(exercice.dateFin)) / 2).toISOString().slice(0, 10);
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: journal.id,
    date: milieu,
    libelle: 'Vente en dollars',
    lignes: [
      { compteId: detail('411').id, libelle: 'Client USD', debit: 2_000_000, credit: 0, deviseId: usd.id, montantDevise: 1000, coursApplique: 2000 },
      { compteId: detail('701').id, libelle: 'Vente', debit: 0, credit: 2_000_000 },
    ],
  });

  await page.goto('/#/devises');
  await page.reload();
  const cadre = page.getByTestId('provision-ouverture');
  await expect(cadre).toBeVisible();
  await expect(page.getByText(FENETRE_EN_ERREUR)).toHaveCount(0);
  const ligne4991 = cadre.locator('[data-compte="4991"]');
  // m3 et Q4 · le bilan d'ouverture au brouillard est lu, et dit provisoire.
  await expect(ligne4991).toContainText(/100[\s\u202f\u00a0]000/);
  await expect(ligne4991).toContainText('provisoire, non validé');
  await expect(ligne4991).toContainText('Non déclarée');
  await expect(ligne4991.getByText('Non déclarée')).toHaveCount(1);

  // Q1 · la réserve n'empêche pas le calcul, elle retire le passage.
  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByTestId('reserve-provision-ouverture')).toContainText('4991');
  await expect(page.getByRole('button', { name: 'Passer les écritures' })).toHaveCount(0);
  await expect(page.getByText(/n'expliquent que 0[.,]00/)).toBeVisible();
  // Et le serveur le refuse aussi, sans rien passer.
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id })).rejects.toThrow(/non déclarée/);

  // m4 · un montant vide n'est pas zéro.
  await ligne4991.getByLabel('Montant déclaré au 4991').fill('');
  await ligne4991.getByRole('button', { name: 'Déclarer' }).click();
  await expect(cadre).toContainText('un champ vide n\'est pas zéro');

  // Source absente · refus nommé du serveur, rien enregistré.
  await ligne4991.getByLabel('Montant déclaré au 4991').fill('100000');
  await ligne4991.getByRole('button', { name: 'Déclarer' }).click();
  await expect(cadre).toContainText('La source du montant déclaré est exigée');

  await ligne4991.getByLabel('Source de la provision au 4991').fill('Liasse de l’exercice précédent, note 28');
  await ligne4991.getByRole('button', { name: 'Déclarer' }).click();
  await expect(ligne4991.getByRole('button', { name: 'Modifier' })).toBeVisible();
  await expect(ligne4991).not.toContainText('Non déclarée');

  await page.getByRole('button', { name: 'Calculer' }).click();
  await expect(page.getByTestId('reserve-provision-ouverture')).toHaveCount(0);
  const ajustement = page.getByTestId('ajustement-provision');
  await expect(ajustement).toContainText('4991');
  await expect(ajustement).toContainText('(7591)');
  await page.getByRole('button', { name: 'Passer les écritures' }).click();
  await expect(page.getByText('Réévaluation passée')).toBeVisible();

  const { lignes } = await appelApi<{ lignes: LigneBalance[] }>(page, 'GET', `/ecritures/balance?exerciceId=${exercice.id}`);
  const ligne = (racine: string) => lignes.find((l) => l.numero.startsWith(racine));
  expect({
    provision: [ligne('4991')?.mouvementDebit, ligne('4991')?.mouvementCredit],
    reprise: ligne('7591')?.mouvementCredit,
    dotation: ligne('6591')?.mouvementDebit ?? 0,
  }).toEqual({ provision: [40_000, 0], reprise: 40_000, dotation: 0 });

  // Q2 · la version a servi · l'écran la fige, le serveur refuse de la réécrire.
  await expect(cadre.locator('[data-compte="4991"]')).toContainText('Utilisée');
  await expect(cadre.locator('[data-compte="4991"]').getByRole('button', { name: 'Modifier' })).toHaveCount(0);
  await expect(
    appelApi(page, 'POST', '/devises/provision-ouverture', {
      compteProvision: '4991',
      montant: 90_000,
      dateReference: jour(exercice.dateDebut),
      source: 'Correction',
    }),
  ).rejects.toThrow(/409.*ne se modifie plus/);

  expect(pannes).toEqual([]);
});

/**
 * L'IMPASSE, PUIS L'ORDRE (relectures adverses, deuxième et troisième passes),
 * SUR LA BASE RÉELLE. Dossier repris dans N (bilan d'ouverture importé,
 * 100 000 au 4991), vente de 1 000 USD à 2 000 validée, cours de clôture
 * 1 940 · perte requise de 60 000. N+1 est ouvert et déclaré d'abord. On
 * réévalue DANS L'ORDRE (fiche du compte 19, « réajusté à la clôture de
 * chaque exercice ») · N+1 est refusé tant que N ne l'est pas ; N se déclare
 * (avant la version de N+1, admis) et se réévalue ; N+1 naît par à-nouveaux
 * provisoires ; sa version, devenue fausse, est refusée puis corrigée ; N+1
 * se réévalue. Le SOLDE du 4991 est vérifié, pas seulement les mouvements ·
 * il doit valoir la perte requise, une fois.
 */
test('SYSCOHADA · N et N+1 réévalués dans l’ordre · le 4991 finit à la provision requise, une fois', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Devises e2e ordre', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
  const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;

  const csv = `Compte;Intitule;Debit;Credit\n${detail('52').numero};Banque;100000;0\n${detail('4991').numero};Provision;0;100000\n`;
  await appelApi(page, 'POST', '/import/executer', {
    type: 'BALANCE',
    nomFichier: 'bilan-ouverture.csv',
    contenuBase64: Buffer.from(csv, 'utf8').toString('base64'),
    mapping: { numero: 'Compte', intitule: 'Intitule', debit: 'Debit', credit: 'Credit' },
    exerciceId: exercice.id,
    journalId: journal.id,
    bilanDOuverture: true,
  });
  const usd = await appelApi<{ id: string }>(page, 'POST', '/devises', { code: 'USD', intitule: 'Dollar américain' });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: jour(exercice.dateFin), cours: 1940, source: 'e2e' });
  const milieu = new Date((Date.parse(exercice.dateDebut) + Date.parse(exercice.dateFin)) / 2).toISOString().slice(0, 10);
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: journal.id,
    date: milieu,
    libelle: 'Vente en dollars',
    lignes: [
      { compteId: detail('411').id, libelle: 'Client USD', debit: 2_000_000, credit: 0, deviseId: usd.id, montantDevise: 1000, coursApplique: 2000 },
      { compteId: detail('701').id, libelle: 'Vente', debit: 0, credit: 2_000_000 },
    ],
  });

  // N+1, ouvert sans clôturer N, déclaré à son début.
  const debut = lendemain(exercice.dateFin);
  const suivant = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: debut, dateFin: `${debut.slice(0, 4)}-12-31` });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: jour(suivant.dateFin), cours: 1940, source: 'e2e' });
  const source = 'Bilan d’ouverture importé';
  await appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 100_000, dateReference: debut, source });

  // L'ORDRE · N+1 refusé tant que N, antérieur et ouvert, n'est pas réévalué.
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id })).rejects.toThrow(/400.*antérieur et encore ouvert/);
  // N · la réserve arrête, la déclaration au début de N (avant la version de N+1) est admise, N passe.
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id })).rejects.toThrow(/400.*non déclarée \(4991\)/);
  await appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 100_000, dateReference: jour(exercice.dateDebut), source });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });

  // N+1 naît de N · validation, à-nouveaux provisoires, contre-passation des écarts.
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: jour(exercice.dateFin) });
  await appelApi(page, 'POST', `/exercices/${exercice.id}/a-nouveaux-provisoires`, {});
  const [reevalN] = await appelApi<{ id: string }[]>(page, 'GET', `/devises/reevaluation/liste?exerciceId=${exercice.id}`);
  await appelApi(page, 'POST', `/devises/reevaluation/${reevalN.id}/extourne`, { exerciceSuivantId: suivant.id });

  // La version de N+1, déclarée avant que N ne reprenne 40 000, dépasse l'ouverture · refusée, puis corrigée avec motif.
  // L'ouverture de N+1 n'est pas validée · la version se lit sous le solde reconstitué de N (60 000), son plafond.
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id })).rejects.toThrow(
    /400.*4991 · 100000\.00 au-dessus du solde reconstitué à la clôture de l'exercice précédent \(60000\.00\)/,
  );
  await expect(
    appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 60_000, dateReference: debut, source }),
  ).rejects.toThrow(/400.*porte son motif/);
  await appelApi(page, 'POST', '/devises/provision-ouverture', {
    compteProvision: '4991',
    montant: 60_000,
    dateReference: debut,
    source,
    motif: 'Ouverture de N+1 après la reprise de 40 000 en N',
  });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id });

  // LE SOLDE · 60 000 au crédit du 4991 à la clôture de N, et à celle de N+1 (report compris), pas 120 000 ni 20 000.
  const soldeDu4991 = async (exerciceId: string) => {
    const { lignes } = await appelApi<{ lignes: (LigneBalance & { solde: number })[] }>(page, 'GET', `/ecritures/balance?exerciceId=${exerciceId}`);
    return lignes.filter((l) => l.numero.startsWith('4991')).reduce((t, l) => t + l.solde, 0);
  };
  expect(await soldeDu4991(exercice.id)).toBe(-60_000);
  expect(await soldeDu4991(suivant.id)).toBe(-60_000);

  expect(pannes).toEqual([]);
});


/** Écritures, cours et soldes communs aux deux parcours de la quatrième relecture. */
async function contexteDevises(page: import('@playwright/test').Page, nom: string) {
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom, montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
  const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;
  const usd = await appelApi<{ id: string }>(page, 'POST', '/devises', { code: 'USD', intitule: 'Dollar américain' });
  const vendre = async (ex: Exercice) => {
    const milieu = new Date((Date.parse(ex.dateDebut) + Date.parse(ex.dateFin)) / 2).toISOString().slice(0, 10);
    await appelApi(page, 'POST', '/ecritures', {
      exerciceId: ex.id,
      journalId: journal.id,
      date: milieu,
      libelle: 'Vente en dollars',
      lignes: [
        { compteId: detail('411').id, libelle: 'Client USD', debit: 2_000_000, credit: 0, deviseId: usd.id, montantDevise: 1000, coursApplique: 2000 },
        { compteId: detail('701').id, libelle: 'Vente', debit: 0, credit: 2_000_000 },
      ],
    });
  };
  const coter = (ex: Exercice, cours: number) => appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: jour(ex.dateFin), cours, source: 'e2e' });
  const soldeDu4991 = async (exerciceId: string) => {
    const { lignes } = await appelApi<{ lignes: (LigneBalance & { solde: number })[] }>(page, 'GET', `/ecritures/balance?exerciceId=${exerciceId}`);
    return lignes.filter((l) => l.numero.startsWith('4991')).reduce((t, l) => t + l.solde, 0);
  };
  return { exercice, vendre, coter, soldeDu4991 };
}

/**
 * QUATRIÈME RELECTURE · N RÉÉVALUÉ, À-NOUVEAUX PROVISOIRES, PUIS N+1. La
 * réévaluation de N passe sa dotation au brouillard ; l'à-nouveau provisoire
 * (livre-journal seul) porte donc 0 au 4991. L'ouverture de N+1 n'est pas cet
 * à-nouveau · c'est la provision en place à la clôture de N, 100 000. Ni
 * réserve, ni préremplissage à 0, ni seconde dotation · déclarer 100 000 est
 * accepté sans faux refus. Le SOLDE du 4991 vaut la perte requise, une fois.
 */
test('SYSCOHADA · N réévalué, à-nouveaux provisoires, puis N+1 · le 4991 finit à 100 000, une fois', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice, vendre, coter, soldeDu4991 } = await contexteDevises(page, 'Devises e2e a-nouveaux provisoires');
  await vendre(exercice);
  await coter(exercice, 1900);
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: jour(exercice.dateFin) });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
  // N+1 naît des à-nouveaux provisoires · la dotation de N, au brouillard, n'y est pas.
  await appelApi(page, 'POST', `/exercices/${exercice.id}/a-nouveaux-provisoires`, {});
  const suivant = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).find((e) => e.dateDebut.slice(0, 10) === lendemain(exercice.dateFin))!;
  await coter(suivant, 1900);

  const lecture = await appelApi<{ comptes: { compteProvision: string; soldeOuverturePropose: number; statutSoldeOuverture: string; reserve: boolean }[] }>(
    page,
    'GET',
    `/devises/provision-ouverture?exerciceId=${suivant.id}`,
  );
  expect(lecture.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
    soldeOuverturePropose: 100_000,
    statutSoldeOuverture: 'CLOTURE_PRECEDENTE',
    reserve: false,
  });
  // Déclarer 100 000 au début de N+1 · juste, aucun faux refus de dépassement.
  await appelApi(page, 'POST', '/devises/provision-ouverture', {
    compteProvision: '4991',
    montant: 100_000,
    dateReference: jour(suivant.dateDebut),
    source: 'Provision de N, réévaluation OmegaX',
  });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id });
  const [passee] = await appelApi<{ ecritureProvision: unknown }[]>(page, 'GET', `/devises/reevaluation/liste?exerciceId=${suivant.id}`);
  expect(passee.ecritureProvision).toBeNull();
  // LE SOLDE · 100 000 au crédit en N, rien de plus en N+1 · la perte requise, une fois.
  expect((await soldeDu4991(exercice.id)) + (await soldeDu4991(suivant.id))).toBe(-100_000);
  expect(pannes).toEqual([]);
});

/**
 * QUATRIÈME RELECTURE · N, N+1 ET N+2 OUVERTS SANS À-NOUVEAU. L'ouverture se
 * lit récursivement, de clôture en clôture · N+2 n'est ni bloqué ni reconstitué
 * à moitié. Perte requise croissante, 50 000, 100 000, 150 000 · chaque
 * exercice ne dote que l'écart, et le 4991 finit à 150 000.
 */
test('SYSCOHADA · N, N+1, N+2 ouverts sans à-nouveau · le 4991 finit à la perte requise de 150 000', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice, vendre, coter, soldeDu4991 } = await contexteDevises(page, 'Devises e2e trois exercices');
  const n1Debut = lendemain(exercice.dateFin);
  const n1 = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: n1Debut, dateFin: `${n1Debut.slice(0, 4)}-12-31` });
  const n2Debut = lendemain(n1.dateFin);
  const n2 = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: n2Debut, dateFin: `${n2Debut.slice(0, 4)}-12-31` });
  // Une créance de 1 000 USD par exercice (aucun à-nouveau ne reporte la précédente), cours en baisse.
  for (const [ex, cours] of [[exercice, 1950], [n1, 1900], [n2, 1850]] as const) {
    await vendre(ex);
    await coter(ex, cours);
  }
  // L'ordre · N+2 refusé tant que N et N+1 ne sont pas réévalués.
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n2.id })).rejects.toThrow(/400.*antérieur et encore ouvert/);
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n1.id });
  const lecture = await appelApi<{ comptes: { compteProvision: string; soldeOuverturePropose: number; reserve: boolean }[] }>(
    page,
    'GET',
    `/devises/provision-ouverture?exerciceId=${n2.id}`,
  );
  expect(lecture.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({ soldeOuverturePropose: 100_000, reserve: false });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n2.id });
  const soldes = [await soldeDu4991(exercice.id), await soldeDu4991(n1.id), await soldeDu4991(n2.id)];
  expect(soldes).toEqual([-50_000, -50_000, -50_000]);
  expect(soldes.reduce((t, x) => t + x, 0)).toBe(-150_000);
  expect(pannes).toEqual([]);
});

/**
 * QUATRIÈME RELECTURE · LE VERROU NE RETIENT AUCUNE CONNEXION. Trois
 * déclarations simultanées · une passe, les autres reçoivent un 409 nommé
 * AUSSITÔT, aucune ne finit en 500, et la lecture d'un autre dossier n'attend
 * pas. Le serveur du job tourne avec son pool ordinaire ; la mesure à
 * `connection_limit=3` se refait en montant le serveur avec ce paramètre.
 */
test('SYSCOHADA · trois déclarations simultanées · 409 aussitôt, aucun 500, aucune attente', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice } = await contexteDevises(page, 'Devises e2e verrou');
  const corps = { compteProvision: '4991', montant: 0, dateReference: jour(exercice.dateDebut), source: 'e2e' };
  const debut = Date.now();
  const statuts = await page.evaluate(
    async ({ api, corps }) => {
      const csrf = localStorage.getItem('omegax:csrf') ?? '';
      const un = () =>
        fetch(api + '/devises/provision-ouverture', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify(corps),
        }).then(async (r) => ({ statut: r.status, texte: await r.text() }));
      return Promise.all([un(), un(), un()]);
    },
    { api: process.env.OMEGAX_API ?? 'http://localhost:4173/api', corps },
  );
  const duree = Date.now() - debut;
  expect(statuts.every((r) => r.statut < 300 || r.statut === 409)).toBe(true);
  expect(statuts.some((r) => r.statut < 300)).toBe(true);
  for (const r of statuts.filter((x) => x.statut === 409)) expect(r.texte).toContain('opération sur la provision pour pertes de change est en cours');
  expect(duree).toBeLessThan(5_000);
  expect(pannes).toEqual([]);
});


/**
 * CINQUIÈME RELECTURE · S1 ET S1b, SUR LA BASE RÉELLE. Dossier repris avec un
 * N-1 gardé pour les comparatifs, et le bilan d'ouverture importé dans N
 * (100 000 au 4991, au brouillard). L'à-nouveau importé PRIME sur la clôture
 * de N-1 · réserve (un seul message), passage refusé tant que la provision n'est pas
 * déclarée ; déclarée à 100 000, la reprise de 40 000 se passe, et le 4991
 * de N finit à la perte requise de 60 000. En S1b, N-1 porte une reprise de
 * balance au 4991 · la déclaration juste n'est pas refusée, et la ligne de
 * N-1 est signalée.
 */
for (const repriseDeBalance of [false, true]) {
  test(`SYSCOHADA · ${repriseDeBalance ? 'S1b' : 'S1'} · bilan importé dans N avec un N-1 · le 4991 finit à 60 000`, async ({ page }) => {
    const pannes = surveiller(page);
    const { exercice, vendre, coter, soldeDu4991 } = await contexteDevises(page, `Devises e2e ${repriseDeBalance ? 'S1b' : 'S1'}`);
    const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
    const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
    const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
    const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;
    const annee = Number(exercice.dateDebut.slice(0, 4));
    const precedent = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: `${annee - 1}-01-01`, dateFin: `${annee - 1}-12-31` });
    const importer = (exerciceId: string, bilanDOuverture: boolean) =>
      appelApi(page, 'POST', '/import/executer', {
        type: 'BALANCE',
        nomFichier: 'balance.csv',
        contenuBase64: Buffer.from(
          `Compte;Intitule;Debit;Credit\n${detail('52').numero};Banque;100000;0\n${detail('4991').numero};Provision;0;100000\n`,
          'utf8',
        ).toString('base64'),
        mapping: { numero: 'Compte', intitule: 'Intitule', debit: 'Debit', credit: 'Credit' },
        exerciceId,
        journalId: journal.id,
        bilanDOuverture,
      });
    if (repriseDeBalance) await importer(precedent.id, false);
    await importer(exercice.id, true);
    await vendre(exercice);
    await coter(exercice, 1940);

    // L'à-nouveau importé prime · 100 000, au brouillard, en réserve.
    const lecture = await appelApi<{ comptes: { compteProvision: string; soldeOuverturePropose: number; statutSoldeOuverture: string; reserve: boolean }[] }>(
      page,
      'GET',
      `/devises/provision-ouverture?exerciceId=${exercice.id}`,
    );
    expect(lecture.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
      soldeOuverturePropose: 100_000,
      statutSoldeOuverture: 'IMPORTE',
      reserve: true,
    });
    const calcul = await appelApi<{ avertissements: string[] }>(page, 'POST', '/devises/reevaluation/calcul', { exerciceId: exercice.id });
    // Un seul message de réserve (sixième passe, m3) · la clôture de N-1 n'ajoute rien à la part expliquée.
    expect(calcul.avertissements.filter((a) => /4991 s'ouvre avec un solde de 100000\.00/.test(a))).toHaveLength(1);
    expect(calcul.avertissements.some((a) => /ne concorde pas/.test(a))).toBe(false);
    if (repriseDeBalance) {
      expect(calcul.avertissements.some((a) => /hors réévaluation dans un exercice antérieur encore ouvert/.test(a))).toBe(true);
    }
    await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id })).rejects.toThrow(/400.*non déclarée \(4991\)/);

    // Déclarée à 100 000 au début de N · acceptée, sans faux refus, et la reprise de 40 000 passe.
    await appelApi(page, 'POST', '/devises/provision-ouverture', {
      compteProvision: '4991',
      montant: 100_000,
      dateReference: jour(exercice.dateDebut),
      source: 'Bilan d’ouverture importé',
    });
    await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
    expect(await soldeDu4991(exercice.id)).toBe(-60_000);
    expect(pannes).toEqual([]);
  });
}

/**
 * SIXIÈME RELECTURE · S8 ET S8b, SUR LA BASE RÉELLE. Un à-nouveau arrive dans
 * N APRÈS sa réévaluation · report réel d'un N-1 ajouté et clôturé (S8), ou
 * bilan d'ouverture importé après coup (S8b). N+1, sur à-nouveau provisoire,
 * s'ouvre sur la clôture de N reconstituée (160 000), que les réévaluations
 * OmegaX n'expliquent qu'à 60 000 · réserve nommée, passage refusé ; déclarée,
 * la reprise de 100 000 passe et le 4991 finit à la perte requise de 60 000.
 */
// Deux lectures du solde inexpliqué (septième relecture) · tout en CHANGE (déclaré 160 000, reprise de 100 000,
// 60 000 au bout), ou un LITIGE du même compte (déclarée la seule part de change · S8 60 000, rien ne se passe,
// 160 000 au bout ; S8b 80 000 dont 20 000 du bilan importé, reprise de 20 000, 140 000 au bout).
const LECTURES = [
  { cas: 'S8', lecture: 'change', declare: 160_000, final: 60_000 },
  { cas: 'S8b', lecture: 'change', declare: 160_000, final: 60_000 },
  { cas: 'S8', lecture: 'litige', declare: 60_000, final: 160_000 },
  { cas: 'S8b', lecture: 'litige', declare: 80_000, final: 140_000 },
] as const;
for (const { cas, lecture: lectureDuSolde, declare, final } of LECTURES) {
  test(`SYSCOHADA · ${cas}, lecture ${lectureDuSolde} · à-nouveau entré dans N après sa réévaluation · le 4991 finit à ${final}`, async ({ page }) => {
    const pannes = surveiller(page);
    const { exercice, vendre, coter } = await contexteDevises(page, `Devises e2e ${cas} ${lectureDuSolde}`);
    const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
    const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
    const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
    const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;
    const lignes4991 = async (exerciceId: string) => {
      const { lignes } = await appelApi<{ lignes: (LigneBalance & { solde: number })[] }>(page, 'GET', `/ecritures/balance?exerciceId=${exerciceId}`);
      const du = lignes.filter((l) => l.numero.startsWith('4991'));
      return {
        solde: du.reduce((t, l) => t + l.solde, 0),
        mouvement: du.reduce((t, l) => t + l.mouvementCredit - l.mouvementDebit, 0),
      };
    };

    await vendre(exercice);
    await coter(exercice, 1940);
    await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: jour(exercice.dateFin) });
    await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });

    if (cas === 'S8') {
      // N-1 ajouté après coup, 100 000 au 4991, validé et clôturé · son report arrive dans N.
      const annee = Number(exercice.dateDebut.slice(0, 4));
      const precedent = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: `${annee - 1}-01-01`, dateFin: `${annee - 1}-12-31` });
      await appelApi(page, 'POST', '/ecritures', {
        exerciceId: precedent.id,
        journalId: journal.id,
        date: `${annee - 1}-06-30`,
        libelle: 'Provision de N-1',
        lignes: [
          { compteId: detail('52').id, libelle: 'Banque', debit: 100_000, credit: 0 },
          { compteId: detail('4991').id, libelle: 'Provision', debit: 0, credit: 100_000 },
        ],
      });
      await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: precedent.id, dateLimite: `${annee - 1}-12-31` });
      await appelApi(page, 'POST', `/exercices/${precedent.id}/cloturer`);
    } else {
      // Le bilan d'ouverture de N, importé après sa réévaluation.
      await appelApi(page, 'POST', '/import/executer', {
        type: 'BALANCE',
        nomFichier: 'bilan-ouverture.csv',
        contenuBase64: Buffer.from(
          `Compte;Intitule;Debit;Credit\n${detail('52').numero};Banque;100000;0\n${detail('4991').numero};Provision;0;100000\n`,
          'utf8',
        ).toString('base64'),
        mapping: { numero: 'Compte', intitule: 'Intitule', debit: 'Debit', credit: 'Credit' },
        exerciceId: exercice.id,
        journalId: journal.id,
        bilanDOuverture: true,
      });
    }

    // N+1 sur à-nouveaux provisoires.
    await appelApi(page, 'POST', `/exercices/${exercice.id}/a-nouveaux-provisoires`, {});
    const suivant = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).find((e) => e.dateDebut.slice(0, 10) === lendemain(exercice.dateFin))!;
    await coter(suivant, 1940);

    const lecture = await appelApi<{ comptes: { compteProvision: string; soldeOuverturePropose: number; statutSoldeOuverture: string; reserve: boolean }[] }>(
      page,
      'GET',
      `/devises/provision-ouverture?exerciceId=${suivant.id}`,
    );
    expect(lecture.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
      soldeOuverturePropose: 160_000,
      statutSoldeOuverture: 'CLOTURE_PRECEDENTE',
      reserve: true,
    });
    await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id })).rejects.toThrow(/400.*non déclarée \(4991\)/);

    await appelApi(page, 'POST', '/devises/provision-ouverture', {
      compteProvision: '4991',
      montant: declare,
      dateReference: jour(suivant.dateDebut),
      source: lectureDuSolde === 'change' ? 'Tout le solde couvre des pertes de change' : 'Seule la part de change · le reste est un litige',
    });
    await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id });

    // LE SOLDE FINAL · la clôture de N (report et mouvements) plus les mouvements de N+1 · provision de change
    // requise (60 000), plus le litige dans la seconde lecture.
    const n = await lignes4991(exercice.id);
    const n1 = await lignes4991(suivant.id);
    expect(-n.solde + n1.mouvement).toBe(final);
    expect(pannes).toEqual([]);
  });
}


/**
 * SEPTIÈME RELECTURE · L1, SUR LA BASE RÉELLE. N, N+1, N+2 ouverts sans
 * à-nouveau ; un litige de 30 000 saisi à la main au 4991 dans N+1. N+2
 * s'ouvre sur 110 000 reconstitués, dont OmegaX n'explique que 80 000 ·
 * réserve ; la part de change (80 000) déclarée est ACCEPTÉE, rien ne se
 * passe, et le 4991 finit à 110 000 (80 000 de change + 30 000 de litige).
 */
test('SYSCOHADA · L1 · litige saisi dans N+1 ouvert · N+2 accepte 80 000 de change · le 4991 finit à 110 000', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice, vendre, coter } = await contexteDevises(page, 'Devises e2e L1');
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
  const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;
  const n1Debut = lendemain(exercice.dateFin);
  const n1 = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: n1Debut, dateFin: `${n1Debut.slice(0, 4)}-12-31` });
  const n2Debut = lendemain(n1.dateFin);
  const n2 = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: n2Debut, dateFin: `${n2Debut.slice(0, 4)}-12-31` });
  for (const [ex, cours] of [[exercice, 1950], [n1, 1920], [n2, 1920]] as const) {
    await vendre(ex);
    await coter(ex, cours);
  }
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: n1.id,
    journalId: journal.id,
    date: `${n1Debut.slice(0, 4)}-06-30`,
    libelle: 'Litige',
    lignes: [
      { compteId: detail('52').id, libelle: 'Banque', debit: 30_000, credit: 0 },
      { compteId: detail('4991').id, libelle: 'Provision pour litige', debit: 0, credit: 30_000 },
    ],
  });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n1.id });
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n2.id })).rejects.toThrow(/400.*non déclarée \(4991\)/);
  await appelApi(page, 'POST', '/devises/provision-ouverture', {
    compteProvision: '4991',
    montant: 80_000,
    dateReference: jour(n2.dateDebut),
    source: 'Seule la part de change · le reste est un litige',
  });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n2.id });
  const [passee] = await appelApi<{ ecritureProvision: unknown }[]>(page, 'GET', `/devises/reevaluation/liste?exerciceId=${n2.id}`);
  expect(passee.ecritureProvision).toBeNull();
  let total = 0;
  for (const ex of [exercice, n1, n2]) {
    const { lignes } = await appelApi<{ lignes: LigneBalance[] }>(page, 'GET', `/ecritures/balance?exerciceId=${ex.id}`);
    total += lignes.filter((l) => l.numero.startsWith('4991')).reduce((t, l) => t + l.mouvementCredit - l.mouvementDebit, 0);
  }
  expect(total).toBe(110_000);
  expect(pannes).toEqual([]);
});

/**
 * HUITIÈME RELECTURE · UNE VERSION SE LIT ENTRE UN PLANCHER ET UN PLAFOND.
 * 0 est déclaré au début de N+1 AVANT la réévaluation de N (vrai à ce
 * moment), puis N dote 100 000 ; N+1 clôture à 1 930, provision requise
 * 70 000. X1 · un franc passé à la main au 4991 dans N suffisait à faire
 * accepter la version périmée (le compte finissait à 170 001). X3 · N clôturé,
 * l'ouverture validée ne jugeait que le dépassement (170 000). Les deux sont
 * refusés sous le plancher (la provision du module), puis corrigés · le
 * SOLDE FINAL est la perte requise, une fois.
 */
async function versionPerimee(page: import('@playwright/test').Page, nom: string) {
  const ctx = await contexteDevises(page, nom);
  const { exercice, vendre, coter } = ctx;
  const debut = lendemain(exercice.dateFin);
  const suivant = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: debut, dateFin: `${debut.slice(0, 4)}-12-31` });
  await appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 0, dateReference: debut, source: 'Déclarée avant la réévaluation de N' });
  await vendre(exercice);
  await coter(exercice, 1900);
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: jour(exercice.dateFin) });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
  await coter(suivant, 1930);
  return { ...ctx, suivant, debut };
}

test('SYSCOHADA · X1 · un franc au 4991 dans N ne fait plus passer une version périmée · le 4991 finit à 70 001', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice, suivant, debut, soldeDu4991 } = await versionPerimee(page, 'Devises e2e X1');
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
  const journal = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: journal.id,
    date: jour(exercice.dateFin),
    libelle: 'Arrondi',
    lignes: [
      { compteId: detail('6591').id, libelle: 'Arrondi', debit: 1, credit: 0 },
      { compteId: detail('4991').id, libelle: 'Arrondi', debit: 0, credit: 1 },
    ],
  });
  await appelApi(page, 'POST', `/exercices/${exercice.id}/a-nouveaux-provisoires`, {});

  const lecture = await appelApi<{ comptes: { compteProvision: string; provisionModuleOuverture: number; plancherVersion: number; plafondVersion: number; horsBornes: string | null }[] }>(
    page,
    'GET',
    `/devises/provision-ouverture?exerciceId=${suivant.id}`,
  );
  expect(lecture.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
    provisionModuleOuverture: 100_000,
    plancherVersion: 100_000,
    plafondVersion: 100_001,
    horsBornes: 'PLANCHER',
  });
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id })).rejects.toThrow(
    /400.*4991 · 0\.00 sous la provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente \(100000\.00\) · la perte déjà provisionnée par OmegaX serait dotée une seconde fois/,
  );
  // Corrigée · la version n'a servi à aucune réévaluation, elle se retouche.
  await appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 100_000, dateReference: debut, source: 'Provision de N, réévaluation OmegaX' });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id });
  // LE SOLDE · 100 001 en N (dotation et franc au brouillard, hors à-nouveau provisoire), reprise de 30 000 en N+1.
  expect((await soldeDu4991(exercice.id)) + (await soldeDu4991(suivant.id))).toBe(-70_001);
  expect(pannes).toEqual([]);
});

test('SYSCOHADA · X3 · N clôturé, la version périmée est refusée contre l’ouverture validée aussi · le 4991 finit à 70 000', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice, suivant, debut, soldeDu4991 } = await versionPerimee(page, 'Devises e2e X3');
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: jour(exercice.dateFin) });
  await appelApi(page, 'POST', `/exercices/${exercice.id}/cloturer`, {});
  const lecture = await appelApi<{ comptes: { compteProvision: string; statutSoldeOuverture: string; soldeOuverturePropose: number; plancherVersion: number }[] }>(
    page,
    'GET',
    `/devises/provision-ouverture?exerciceId=${suivant.id}`,
  );
  expect(lecture.comptes.find((c) => c.compteProvision === '4991')).toMatchObject({
    statutSoldeOuverture: 'VALIDE',
    soldeOuverturePropose: 100_000,
    plancherVersion: 100_000,
  });
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id })).rejects.toThrow(
    /400.*4991 · 0\.00 sous la provision pour pertes de change passée par OmegaX jusqu'à la clôture précédente \(100000\.00\) · la perte déjà provisionnée/,
  );
  await appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 100_000, dateReference: debut, source: 'À-nouveau validé de N' });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id });
  // LE SOLDE · à-nouveau validé de 100 000, reprise de 30 000 · la perte requise, une fois.
  expect(await soldeDu4991(suivant.id)).toBe(-70_000);
  expect(pannes).toEqual([]);
});

/**
 * NEUVIÈME RELECTURE · LA CONTESTATION EST RATTACHÉE À UN MONTANT. Elle fige,
 * côté serveur, la provision du module qu'elle conteste · une réévaluation
 * passée ensuite la change, et la contestation ne couvre pas ce qu'elle n'a
 * pas vu. Y9 · 0 contesté au début de N+1 quand le module montrait 0, puis N
 * dote 100 000 (170 000 pour 70 000 sans le rattachement). Y9b · la
 * contestation visait les 50 000 de N-1, puis N dote 100 000 de plus (220 000
 * pour 70 000). Refus nommé, correction, SOLDE FINAL = la perte requise.
 */
const contestation = (debut: string) => ({
  compteProvision: '4991',
  montant: 0,
  dateReference: debut,
  source: 'Contestation',
  provisionModuleContestee: true,
  motifContestation: 'Provision OmegaX sans fondement',
});

test('SYSCOHADA · Y9 · contestation déclarée avant la réévaluation de N · refusée quand N dote · le 4991 finit à 70 000', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice, vendre, coter, soldeDu4991 } = await contexteDevises(page, 'Devises e2e Y9');
  const debut = lendemain(exercice.dateFin);
  const suivant = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: debut, dateFin: `${debut.slice(0, 4)}-12-31` });
  await appelApi(page, 'POST', '/devises/provision-ouverture', contestation(debut));
  await vendre(exercice);
  await coter(exercice, 1900);
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: jour(exercice.dateFin) });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
  await appelApi(page, 'POST', `/exercices/${exercice.id}/a-nouveaux-provisoires`, {});
  await coter(suivant, 1930);
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id })).rejects.toThrow(
    /400.*4991 · la provision passée par OmegaX a changé depuis la contestation \(0\.00 contestés, 100000\.00 aujourd'hui\)/,
  );
  await appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 100_000, dateReference: debut, source: 'Provision de N' });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: suivant.id });
  expect((await soldeDu4991(exercice.id)) + (await soldeDu4991(suivant.id))).toBe(-70_000);
  expect(pannes).toEqual([]);
});

test('SYSCOHADA · Y9b · la contestation visait les 50 000 de N-1, N dote 100 000 de plus · refusée · le 4991 finit à 70 000', async ({ page }) => {
  const pannes = surveiller(page);
  const { exercice, vendre, coter, soldeDu4991 } = await contexteDevises(page, 'Devises e2e Y9b');
  const n1Debut = lendemain(exercice.dateFin);
  const n1 = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: n1Debut, dateFin: `${n1Debut.slice(0, 4)}-12-31` });
  const n2Debut = lendemain(n1.dateFin);
  const n2 = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: n2Debut, dateFin: `${n2Debut.slice(0, 4)}-12-31` });
  // Une créance de 1 000 USD par exercice, sans à-nouveau · pertes requises 50 000, 150 000, 70 000.
  for (const [ex, cours] of [[exercice, 1950], [n1, 1850], [n2, 1930]] as const) {
    await vendre(ex);
    await coter(ex, cours);
  }
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
  // Contestée quand le module montrait 50 000 · le serveur fige ce montant.
  await appelApi(page, 'POST', '/devises/provision-ouverture', contestation(n2Debut));
  const lecture = await appelApi<{ comptes: { compteProvision: string; enVigueur: { provisionModuleContesteeMontant: number | null } | null }[] }>(
    page,
    'GET',
    `/devises/provision-ouverture?exerciceId=${n2.id}`,
  );
  expect(lecture.comptes.find((c) => c.compteProvision === '4991')!.enVigueur).toMatchObject({ provisionModuleContesteeMontant: 50_000 });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n1.id });
  await expect(appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n2.id })).rejects.toThrow(
    /400.*a changé depuis la contestation \(50000\.00 contestés, 150000\.00 aujourd'hui\)/,
  );
  await appelApi(page, 'POST', '/devises/provision-ouverture', { compteProvision: '4991', montant: 150_000, dateReference: n2Debut, source: 'Provision de N' });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: n2.id });
  const soldes = [await soldeDu4991(exercice.id), await soldeDu4991(n1.id), await soldeDu4991(n2.id)];
  expect(soldes.reduce((t, x) => t + x, 0)).toBe(-70_000);
  expect(pannes).toEqual([]);
});

/**
 * DÉCISION D6 (2026-10-03) · RÉÉVALUER, ANNULER, RÉÉVALUER, SUR LA BASE
 * RÉELLE. AUDCIF art. 20, al. 2 · « exclusivement par inscription en négatif
 * des éléments erronés ; l'enregistrement exact est ensuite opéré ». Sur le
 * 401 · facture A de 1 000 USD à 1 700, réglée au cours de 1 800 (100 000 au
 * 656) ; facture B de 500 USD à 1 700, ouverte. Réévaluée au cours de 1 900
 * coté par erreur (100 000 au 478 et au 4991), validée ; le cours corrigé à
 * 1 850, la réévaluation est ANNULÉE (inscription en négatif) puis refaite ·
 * 75 000 au 478 et au 4991, le 401 à 925 000, le 656 intact à 100 000.
 */
test('SYSCOHADA · D6 · réévaluer, annuler, réévaluer · 478, 4991, 656 et 401 au bon solde', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Devises e2e D6', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const parNumero = (numero: string) => comptes.find((c) => c.numero === numero)!;
  const detail = (racine: string) => comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith(racine))!;
  const journaux = await appelApi<(Journal & { estActif: boolean; compteTresorerieId: string | null })[]>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux.find((j) => j.type === 'GENERAL')!;
  const tresorerie = journaux.find((j) => j.type === 'TRESORERIE' && j.estActif && j.compteTresorerieId)!;
  const fournisseur = parNumero('40110000');
  const debut = Date.parse(exercice.dateDebut);
  const date = (jours: number) => new Date(debut + jours * 86_400_000).toISOString().slice(0, 10);

  const usd = await appelApi<{ id: string }>(page, 'POST', '/devises', { code: 'USD', intitule: 'Dollar américain' });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: date(60), cours: 1700, source: 'e2e' });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: date(150), cours: 1800, source: 'e2e' });
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: jour(exercice.dateFin), cours: 1900, source: 'e2e, erroné' });
  const facture = (libelle: string, usdMontant: number) =>
    appelApi<{ lignes: Array<{ id: string; compteId: string }> }>(page, 'POST', '/ecritures', {
      exerciceId: exercice.id,
      journalId: od.id,
      date: date(60),
      libelle,
      lignes: [
        { compteId: detail('601').id, libelle, debit: usdMontant * 1700, credit: 0 },
        { compteId: fournisseur.id, libelle, debit: 0, credit: usdMontant * 1700, deviseId: usd.id, montantDevise: usdMontant, coursApplique: 1700 },
      ],
    });
  const a = await facture('Facture A', 1000);
  await facture('Facture B', 500);
  await appelApi(page, 'POST', '/reglements', {
    sens: 'FOURNISSEUR',
    exerciceId: exercice.id,
    journalId: tresorerie.id,
    date: date(150),
    reglements: [{ compteId: fournisseur.id, ligneIds: [a.lignes.find((l) => l.compteId === fournisseur.id)!.id], coursReglement: 1800 }],
  });

  // Réévaluée au cours erroné, puis VALIDÉE · l'annulation passera par l'inscription en négatif.
  const passee = await appelApi<{ ecritures: string[] }>(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });
  await appelApi(page, 'POST', '/ecritures/valider', { ecritureIds: passee.ecritures });
  // Le comptable corrige le cours coté (`poserCours`, qui remplace celui de la date).
  await appelApi(page, 'POST', `/devises/${usd.id}/cours`, { date: jour(exercice.dateFin), cours: 1850, source: 'e2e, corrigé' });
  const [reeval] = await appelApi<{ id: string }[]>(page, 'GET', `/devises/reevaluation/liste?exerciceId=${exercice.id}`);
  await expect(appelApi(page, 'POST', `/devises/reevaluations/${reeval.id}/annuler`, { motif: '' })).rejects.toThrow(/400/);
  await appelApi(page, 'POST', `/devises/reevaluations/${reeval.id}/annuler`, { motif: 'Cours du 31 décembre corrigé' });
  await appelApi(page, 'POST', '/devises/reevaluation', { exerciceId: exercice.id });

  const liste = await appelApi<{ annuleeLe: string | null }[]>(page, 'GET', `/devises/reevaluation/liste?exerciceId=${exercice.id}`);
  expect(liste.map((r) => r.annuleeLe !== null).sort()).toEqual([false, true]);
  const { lignes } = await appelApi<{ lignes: LigneBalance[] }>(page, 'GET', `/ecritures/balance?exerciceId=${exercice.id}`);
  const solde = (numero: string) =>
    lignes.filter((l) => l.numero.startsWith(numero)).reduce((t, l) => t + Number(l.mouvementDebit) - Number(l.mouvementCredit), 0);
  expect({ e478: solde('478'), e4991: solde('4991'), e656: solde('656'), e401: solde('4011') }).toEqual({
    e478: 75_000,
    e4991: -75_000,
    e656: 100_000,
    e401: -925_000,
  });
  expect(pannes).toEqual([]);
});
