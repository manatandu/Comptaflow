import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LOT 15, SUR LA BASE RÉELLE · la table `mouvements_demantelement` et les
 * colonnes des six critères naissent d'une migration écrite à la main, et
 * seule une base PostgreSQL dit qu'elles sont lues et écrites comme le
 * schéma l'annonce. Exemple du texte (AUDCIF Titre VIII ch. 6 § 2.5) ·
 * démantèlement de 10 000 000 au terme, 12 %, dix ans · composant de
 * 3 219 732, désactualisation de la première année 386 367,84, provision
 * 3 606 099,84, reprise au 7911 et au 7971.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface CompteDuBien { id: string; numero: string; motifComptes: string | null }
interface Compte { id: string; numero: string; typeCompte: string }

async function contexte(page: Parameters<typeof appelApi>[0], dossier: { exerciceId: string }) {
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const detail = (racine: string) => {
    const c = comptes.find((x) => x.typeCompte === 'DETAIL' && x.numero.startsWith(racine));
    if (!c) throw new Error(`Aucun compte de détail sous ${racine}`);
    return c;
  };
  return { exercice, od, detail };
}

for (const referentiel of ['SYSCOHADA', 'SYCEBNL'] as const) {
  test(`${referentiel} · le composant démantèlement entre par le 1984, se désactualise au 6971 et se reprend au 7911 et au 7971`, async ({ page }) => {
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Démantèlement e2e ${referentiel}`, montant: 10_000 });
    await seConnecter(page, dossier.email);
    const { exercice, od, detail } = await contexte(page, dossier);
    const debut = exercice.dateDebut.slice(0, 10);
    const fin = exercice.dateFin.slice(0, 10);

    const comptesBien = await appelApi<CompteDuBien[]>(page, 'GET', '/immobilisations/comptes-du-bien');
    const materiel = comptesBien.find((c) => c.numero.startsWith('241') && !c.motifComptes);
    if (!materiel) throw new Error('Aucun compte 241 au plan semé');
    const banque = detail('52');
    const provision = detail('1984');

    const principal = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
      compteImmobilisationId: materiel.id,
      designation: 'Plate-forme e2e',
      dateAcquisition: debut,
      dateMiseEnService: debut,
      valeurOrigine: 200_000_000,
      dureeAmortissementAns: 10,
      modeAmortissement: 'LINEAIRE',
      compteContrepartieId: banque.id,
      journalId: od.id,
      exerciceId: exercice.id,
    });
    const composant = await appelApi<{ id: string; ecritureAcquisitionId: string }>(page, 'POST', '/immobilisations', {
      compteImmobilisationId: materiel.id,
      designation: 'Plate-forme e2e · démantèlement',
      dateAcquisition: debut,
      dateMiseEnService: debut,
      valeurOrigine: 3_219_732,
      dureeAmortissementAns: 10,
      modeAmortissement: 'LINEAIRE',
      compteContrepartieId: provision.id,
      journalId: od.id,
      exerciceId: exercice.id,
      immobilisationPrincipaleId: principal.id,
      typeComposant: 'DEMANTELEMENT',
      justificationDecomposition: 'Obligation de remise en état du site au terme',
      coutFuturDemantelement: 10_000_000,
      tauxActualisationDemantelementPourcent: 12,
    });
    expect(composant.ecritureAcquisitionId).toBeTruthy();

    const etat = await appelApi<{ desactualisation: { montant: number; mois: number } }>(
      page,
      'GET',
      `/immobilisations/${composant.id}/demantelement?exerciceId=${exercice.id}`,
    );
    expect(etat.desactualisation.mois).toBe(12);
    expect(etat.desactualisation.montant).toBeCloseTo(386_367.84, 2);

    // Avant la désactualisation, une reprise au 30 juin la passerait d'abord ·
    // on désactualise l'exercice entier, À L'ÉCRAN · onglet Biens, ligne du
    // composant, bouton « Provision », puis la reprise au 30 juin est refusée.
    await page.goto('/#/immobilisations');
    await page.getByRole('tab', { name: 'Biens', exact: true }).click();
    // Seul le composant démantèlement porte le bouton « Provision ».
    await expect(page.getByRole('tabpanel').getByText('Plate-forme e2e · démantèlement')).toBeVisible();
    await page.getByRole('button', { name: 'Provision', exact: true }).click();
    const cadre = page.locator('[data-provision-demantelement]');
    await cadre.getByRole('button', { name: /^Désactualiser · .* sur 12 mois$/ }).click();
    await expect(page.getByText(/Désactualisation de .* passée pour « Plate-forme e2e · démantèlement »/)).toBeVisible();
    await expect(
      appelApi(page, 'POST', `/immobilisations/${composant.id}/demantelement/desactualisation`, { exerciceId: exercice.id, journalId: od.id }),
    ).rejects.toThrow(/400 · .*déjà passée/);
    const milieu = `${debut.slice(0, 4)}-06-30`;
    await expect(
      appelApi(page, 'POST', `/immobilisations/${composant.id}/demantelement/reprise`, {
        exerciceId: exercice.id,
        journalId: od.id,
        date: milieu,
        motif: 'ENGAGEMENT_COUTS',
      }),
    ).rejects.toThrow(/400 · .*déjà passée jusqu/);

    const reprise = await appelApi<{ montant: number; repriseExploitation: number; repriseFinanciere: number }>(
      page,
      'POST',
      `/immobilisations/${composant.id}/demantelement/reprise`,
      { exerciceId: exercice.id, journalId: od.id, date: fin, motif: 'ENGAGEMENT_COUTS' },
    );
    expect(reprise.montant).toBeCloseTo(3_606_099.84, 2);
    expect(Number(reprise.repriseExploitation)).toBeCloseTo(3_219_732, 2);
    expect(Number(reprise.repriseFinanciere)).toBeCloseTo(386_367.84, 2);

    const apres = await appelApi<{ repriseFaite: boolean; reprise: unknown; provision: number }>(
      page,
      'GET',
      `/immobilisations/${composant.id}/demantelement?exerciceId=${exercice.id}`,
    );
    expect(apres).toMatchObject({ repriseFaite: true, reprise: null, provision: 0 });

    expect(pannes).toEqual([]);
  });
}

test('SYSCOHADA · un frais de développement ne s’inscrit au 211 que sur ses six critères, gardés sur la fiche', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Frais de développement e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const { exercice, od, detail } = await contexte(page, dossier);
  const date = exercice.dateFin.slice(0, 10);

  const comptesBien = await appelApi<CompteDuBien[]>(page, 'GET', '/immobilisations/comptes-du-bien');
  const fraisDev = comptesBien.find((c) => c.numero.startsWith('211'));
  if (!fraisDev) throw new Error('Aucun compte 211 au plan SYSCOHADA semé');
  const bien = {
    compteImmobilisationId: fraisDev.id,
    designation: 'Médicament P1 e2e',
    dateAcquisition: date,
    dateMiseEnService: date,
    valeurOrigine: 110_000_000,
    dureeAmortissementAns: 5,
    modeAmortissement: 'LINEAIRE',
    compteContrepartieId: detail('721').id,
    journalId: od.id,
    exerciceId: exercice.id,
  };
  await expect(appelApi(page, 'POST', '/immobilisations', bien)).rejects.toThrow(/400 · .*Critère 1 non démontré/);

  const six = {
    FAISABILITE_TECHNIQUE: 'Prototype validé',
    INTENTION: 'Décision du conseil',
    CAPACITE: 'Équipe en place',
    AVANTAGES_ECONOMIQUES: 'Autorisation de mise sur le marché',
    RESSOURCES: 'Financement voté',
    EVALUATION_FIABLE: 'Suivi analytique par projet',
  };
  const cree = await appelApi<{ id: string; criteresFraisDeveloppement: Record<string, string>; dateReunionCriteresDeveloppement: string }>(
    page,
    'POST',
    '/immobilisations',
    { ...bien, criteresFraisDeveloppement: six, dateReunionCriteresDeveloppement: exercice.dateDebut.slice(0, 10) },
  );
  expect(cree.criteresFraisDeveloppement).toEqual(six);
  expect(cree.dateReunionCriteresDeveloppement.slice(0, 10)).toBe(exercice.dateDebut.slice(0, 10));

  // La fiche se lit dans l'onglet Biens de la fenêtre.
  await page.goto('/#/immobilisations');
  await page.getByRole('tab', { name: 'Biens', exact: true }).click();
  await expect(page.getByRole('tabpanel').getByText('Médicament P1 e2e')).toBeVisible();

  expect(pannes).toEqual([]);
});
