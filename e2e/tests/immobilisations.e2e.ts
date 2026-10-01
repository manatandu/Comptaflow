import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LE BIEN REPRIS, SUR LA BASE RÉELLE (audit final F32).
 *
 * La fiche d'un bien acquis avant l'ouverture naît sans écriture
 * d'acquisition · la colonne `ecritureAcquisitionId` devient nullable par une
 * migration écrite à la main, et seule une base PostgreSQL dit qu'elle l'est
 * vraiment. Le même bien, non déclaré repris, est refusé avec les deux issues,
 * et sa première dotation ne porte que le reliquat.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Famille { id: string; dureeAmortissementAns: number; estActif: boolean }
interface Immobilisation { id: string; ecritureAcquisitionId: string | null; amortissementAnterieur: unknown }
interface Liste { total: number }

test('SYSCOHADA · un bien repris naît sans écriture et ne dote que son reliquat', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Immobilisations e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const annee = Number(exercice.dateDebut.slice(0, 4));
  const familles = await appelApi<Famille[]>(page, 'GET', '/immobilisations/familles');
  const famille = familles.find((f) => f.estActif);
  if (!famille) throw new Error('Aucune famille d’immobilisations semée');
  const ecritures = async () =>
    (await appelApi<Liste>(page, 'GET', `/ecritures?exerciceId=${exercice.id}&inclureBrouillard=true`)).total;
  const avant = await ecritures();

  // Il ne reste que 1 000 000 à amortir · la dotation est l'annuité pleine
  // (un bien repris a passé sa première année ailleurs), bornée au reliquat.
  const valeur = 12_000_000;
  const reliquat = 1_000_000;
  const attendu = Math.min(reliquat, Math.round((valeur / famille.dureeAmortissementAns) * 100) / 100);
  const bien = {
    familleId: famille.id,
    designation: 'Camion repris e2e',
    dateAcquisition: `${annee - 3}-03-15`,
    dateMiseEnService: `${annee - 3}-04-01`,
    valeurOrigine: valeur,
    amortissementAnterieur: valeur - reliquat,
    exerciceId: exercice.id,
  };

  await expect(appelApi(page, 'POST', '/immobilisations', bien)).rejects.toThrow(/400 · .*bien repris/);

  const cree = await appelApi<Immobilisation>(page, 'POST', '/immobilisations', { ...bien, repris: true });
  expect(cree.ecritureAcquisitionId).toBeNull();
  expect(Number(cree.amortissementAnterieur)).toBe(bien.amortissementAnterieur);
  expect(await ecritures()).toBe(avant);

  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  await appelApi(page, 'POST', `/immobilisations/${cree.id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  const [fiche] = (await appelApi<Array<Immobilisation & { dotations: Array<{ montant: number }> }>>(
    page,
    'GET',
    '/immobilisations',
  )).filter((i) => i.id === cree.id);
  expect(fiche.dotations).toHaveLength(1);
  expect(fiche.dotations[0].montant).toBeCloseTo(attendu, 2);

  expect(pannes).toEqual([]);
});

test('SYSCOHADA · une révision majeure sans durée prend celle de sa famille, et le refus du ch. 5 § 1 joue', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Révision majeure e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const famille = (await appelApi<Famille[]>(page, 'GET', '/immobilisations/familles')).find((f) => f.estActif);
  if (!famille) throw new Error('Aucune famille d’immobilisations semée');
  const comptes = await appelApi<Array<{ id: string; numero: string; typeCompte: string }>>(
    page,
    'GET',
    '/comptes?typeCompte=DETAIL',
  );
  const banque = comptes.find((c) => c.numero.startsWith('52'));
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const date = exercice.dateDebut.slice(0, 10);
  const acquisition = { exerciceId: exercice.id, journalId: od.id, compteContrepartieId: banque!.id };

  const principal = await appelApi<Immobilisation>(page, 'POST', '/immobilisations', {
    ...acquisition,
    familleId: famille.id,
    designation: 'Machine e2e',
    dateAcquisition: date,
    dateMiseEnService: date,
    valeurOrigine: 180_000_000,
  });
  const revision = {
    ...acquisition,
    familleId: famille.id,
    designation: 'Révision majeure e2e',
    dateAcquisition: date,
    dateMiseEnService: date,
    valeurOrigine: 10_000_000,
    immobilisationPrincipaleId: principal.id,
    typeComposant: 'REVISION_MAJEURE',
    justificationDecomposition: 'Révision tous les deux ans',
  };
  // Même famille, donc même durée que la structure · refusé sans durée saisie.
  await expect(appelApi(page, 'POST', '/immobilisations', revision)).rejects.toThrow(/400 · .*intervalle/);
  if (famille.dureeAmortissementAns > 1) {
    const cree = await appelApi<{ dureeAmortissementAns: number }>(page, 'POST', '/immobilisations', {
      ...revision,
      dureeAmortissementAns: 1,
    });
    expect(cree.dureeAmortissementAns).toBe(1);
  }

  expect(pannes).toEqual([]);
});

/**
 * LE COMPTE DU BIEN, SUR LA BASE RÉELLE (2026-10-01) · la liste vient du plan
 * semé, le 28 et le 68 en sont déduits, et la famille naît à la première
 * création pour être reprise à la seconde.
 */
test('SYCEBNL · un bien se crée par son compte, la famille suit et se reprend', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Compte du bien e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);

  const comptes = await appelApi<Array<{ id: string; numero: string; compteAmortissement: { numero: string } | null; motifComptes: string | null }>>(
    page,
    'GET',
    '/immobilisations/comptes-du-bien',
  );
  const vehicule = comptes.find((c) => c.numero.startsWith('2451'));
  if (!vehicule) throw new Error('Aucun compte 2451 au plan semé');
  expect(vehicule.motifComptes).toBeNull();
  expect(vehicule.compteAmortissement?.numero.startsWith('2845')).toBe(true);

  const contreparties = await appelApi<Array<{ id: string; numero: string; mode: string | null }>>(
    page,
    'GET',
    `/immobilisations/contreparties-acquisition?compteImmobilisationId=${vehicule.id}`,
  );
  const tresorerie = contreparties.find((c) => c.mode === 'ACHAT_COMPTANT');
  if (!tresorerie) throw new Error('Aucune contrepartie de trésorerie admise');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  const bien = {
    compteImmobilisationId: vehicule.id,
    designation: 'TOYOTA RAV4',
    dateAcquisition: debut,
    dateMiseEnService: debut,
    valeurOrigine: 30_000_000,
    dureeAmortissementAns: 4,
    modeAmortissement: 'LINEAIRE',
    compteContrepartieId: tresorerie.id,
    journalId: od.id,
    exerciceId: exercice.id,
  };
  const premier = await appelApi<{ familleId: string }>(page, 'POST', '/immobilisations', bien);
  const second = await appelApi<{ familleId: string }>(page, 'POST', '/immobilisations', { ...bien, designation: 'TOYOTA RAV4 bis' });
  expect(second.familleId).toBe(premier.familleId);

  expect(pannes).toEqual([]);
});

/**
 * LA LOCATION-ACQUISITION, SUR LA BASE RÉELLE (AUDCIF Titre VIII ch. 8) · la
 * table du contrat naît d'une migration écrite à la main ; la dette part au
 * 17 au SYSCOHADA et au 187 au SYCEBNL, un numéro, deux sens, et l'exemple du
 * § 2.1.4 rend sa dette au centime.
 */
for (const [referentiel, dette] of [
  ['SYSCOHADA', '17300000'],
  ['SYCEBNL', '18720000'],
] as const) {
  test(`${referentiel} · un crédit-bail mobilier entre au bilan pour la dette actualisée, au crédit du ${dette}`, async ({ page }) => {
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Crédit-bail ${referentiel} e2e`, montant: 10_000 });
    await seConnecter(page, dossier.email);
    const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
    const comptes = await appelApi<Array<{ id: string; numero: string; locationAcquisition: boolean }>>(
      page,
      'GET',
      '/immobilisations/comptes-du-bien',
    );
    const materiel = comptes.find((c) => c.locationAcquisition && c.numero.startsWith('2456'));
    if (!materiel) throw new Error('Aucun compte 2456 au plan semé');
    expect(comptes.find((c) => c.numero.startsWith('2451'))?.locationAcquisition).toBe(false);
    const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
    const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
    const contrat = {
      compteImmobilisationId: materiel.id,
      nature: 'CREDIT_BAIL_MOBILIER',
      datePriseEffet: exercice.dateDebut.slice(0, 10),
      dureeMois: 96,
      periodicite: 'ANNUELLE',
      termeAEchoir: false,
      loyer: 90_000,
      prixOption: 0,
      tauxAnnuel: 0.0786,
      optionRaisonnablementCertaine: true,
      bienDeFaibleValeur: false,
    };
    const simulation = await appelApi<{ dette: number; lignes: unknown[] }>(
      page,
      'POST',
      '/immobilisations/location-acquisition/simulation',
      contrat,
    );
    expect(simulation.dette).toBe(519956.68);
    expect(simulation.lignes).toHaveLength(8);

    // Option hypothétique · location simple, refusée en le disant.
    await expect(
      appelApi(page, 'POST', '/immobilisations/location-acquisition/simulation', { ...contrat, optionRaisonnablementCertaine: false }),
    ).rejects.toThrow(/400 · .*location simple/);

    const cree = await appelApi<{ immobilisation: { id: string; valeurOrigine: unknown; ecritureAcquisitionId: string } }>(
      page,
      'POST',
      '/immobilisations/location-acquisition',
      {
        ...contrat,
        designation: 'Presse en crédit-bail e2e',
        dureeAmortissementAns: 10,
        reference: 'CB-E2E',
        dateConclusion: exercice.dateDebut.slice(0, 10),
        exerciceId: exercice.id,
        journalId: od.id,
      },
    );
    expect(Number(cree.immobilisation.valeurOrigine)).toBe(519956.68);
    expect(cree.immobilisation.ecritureAcquisitionId).toBeTruthy();
    const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementCredit: number }> }>(
      page,
      'GET',
      `/ecritures/balance?exerciceId=${exercice.id}`,
    );
    expect(Number(lignes.find((l) => l.numero === dette)?.mouvementCredit)).toBe(519956.68);

    expect(pannes).toEqual([]);
  });
}
