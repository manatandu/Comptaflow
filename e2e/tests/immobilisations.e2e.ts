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

/**
 * LA CLÔTURE DU CONTRAT, SUR LA BASE RÉELLE (§ 2.1.8.2) · refusée tant que le
 * 623 ne porte pas les loyers échus, puis passée · le 623 se vide, le 17 baisse
 * du capital, les courus vont au 176. La table de clôture naît d'une migration
 * écrite à la main.
 */
test('SYSCOHADA · la clôture vire le 623 au 17 et au 672, une fois', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Clôture crédit-bail e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Array<{ id: string; numero: string; locationAcquisition: boolean }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const materiel = comptes.find((c) => c.locationAcquisition && c.numero.startsWith('2456'));
  const plan = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const banque = plan.find((c) => c.numero.startsWith('52'));
  const redevances = plan.find((c) => c.numero === '62330000');
  if (!materiel || !banque || !redevances) throw new Error('Comptes du semis introuvables');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);

  const { immobilisation } = await appelApi<{ immobilisation: { id: string } }>(page, 'POST', '/immobilisations/location-acquisition', {
    compteImmobilisationId: materiel.id,
    nature: 'CREDIT_BAIL_MOBILIER',
    datePriseEffet: debut,
    dureeMois: 36,
    periodicite: 'MENSUELLE',
    termeAEchoir: false,
    loyer: 10_000,
    prixOption: 1_000,
    tauxAnnuel: 0.12,
    optionRaisonnablementCertaine: true,
    bienDeFaibleValeur: false,
    designation: 'Machine e2e',
    dureeAmortissementAns: 5,
    reference: 'CB-CLO',
    dateConclusion: debut,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  expect(immobilisation.id).toBeTruthy();
  const [contrat] = await appelApi<Array<{ id: string }>>(page, 'GET', `/immobilisations/location-acquisition/contrats?exerciceId=${exercice.id}`);
  const proposition = await appelApi<{ ventilation: { loyers: number; capital: number; interetsCourus: number }; refus: string[] }>(
    page,
    'GET',
    `/immobilisations/location-acquisition/contrats/${contrat.id}/cloture?exerciceId=${exercice.id}`,
  );
  // Douze loyers mensuels échus du mois suivant la prise d'effet au 31/12 · onze ou douze selon le jour.
  expect(proposition.ventilation.loyers).toBeGreaterThan(0);
  expect(proposition.refus.join(' ')).toMatch(/ne porte que 0\.00/);
  const corps = { exerciceId: exercice.id, journalId: od.id };
  await expect(appelApi(page, 'POST', `/immobilisations/location-acquisition/contrats/${contrat.id}/cloture`, corps)).rejects.toThrow(/400/);

  // Le cabinet saisit les redevances au 623 (§ 2.1.8.1).
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: od.id,
    date: exercice.dateFin.slice(0, 10),
    libelle: 'Redevances crédit-bail e2e',
    lignes: [
      { compteId: redevances.id, libelle: 'e2e', debit: proposition.ventilation.loyers, credit: 0 },
      { compteId: banque.id, libelle: 'e2e', debit: 0, credit: proposition.ventilation.loyers },
    ],
  });
  await appelApi(page, 'POST', `/immobilisations/location-acquisition/contrats/${contrat.id}/cloture`, corps);
  await expect(appelApi(page, 'POST', `/immobilisations/location-acquisition/contrats/${contrat.id}/cloture`, corps)).rejects.toThrow(/déjà passée/);

  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${exercice.id}`,
  );
  const ligne = (n: string) => lignes.find((l) => l.numero === n);
  expect(Number(ligne('62330000')?.mouvementCredit)).toBeCloseTo(proposition.ventilation.loyers, 2);
  expect(Number(ligne('17300000')?.mouvementDebit)).toBeCloseTo(proposition.ventilation.capital, 2);
  if (proposition.ventilation.interetsCourus > 0) {
    expect(Number(ligne('17630000')?.mouvementCredit)).toBeCloseTo(proposition.ventilation.interetsCourus, 2);
  }

  expect(pannes).toEqual([]);
});

/**
 * L'OPTION NON LEVÉE, SUR LA BASE RÉELLE (§ 2.1.9 B) · le bien sort à la date
 * de l'option, cédé au bailleur pour le capital restant dû · D 17 / C 82, le
 * 81 recevant la valeur nette. Un second envoi est refusé.
 */
test('SYSCOHADA · l’option non levée sort le bien, la dette du 17 pour prix', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Option crédit-bail e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Array<{ id: string; numero: string; locationAcquisition: boolean }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const materiel = comptes.find((c) => c.locationAcquisition && c.numero.startsWith('2456'));
  if (!materiel) throw new Error('Aucun compte 2456 au plan semé');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  // Treize mois · l'option échoit dans l'exercice suivant, que l'on ouvre.
  await appelApi(page, 'POST', '/immobilisations/location-acquisition', {
    compteImmobilisationId: materiel.id,
    nature: 'CREDIT_BAIL_MOBILIER',
    datePriseEffet: debut,
    dureeMois: 13,
    periodicite: 'MENSUELLE',
    termeAEchoir: false,
    loyer: 10_000,
    prixOption: 5_000,
    tauxAnnuel: 0.12,
    optionRaisonnablementCertaine: true,
    bienDeFaibleValeur: false,
    designation: 'Option e2e',
    dureeAmortissementAns: 5,
    reference: 'CB-OPT',
    dateConclusion: debut,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  const annee = Number(debut.slice(0, 4)) + 1;
  const suivant = await appelApi<{ id: string }>(page, 'POST', '/exercices', { dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31` });
  const [contrat] = await appelApi<Array<{ id: string; dateOption: string; optionLevee: boolean | null }>>(
    page,
    'GET',
    `/immobilisations/location-acquisition/contrats?exerciceId=${suivant.id}`,
  );
  expect(contrat.optionLevee).toBeNull();
  const corps = { levee: false, exerciceId: suivant.id, journalId: od.id };
  await appelApi(page, 'POST', `/immobilisations/location-acquisition/contrats/${contrat.id}/option`, corps);
  await expect(appelApi(page, 'POST', `/immobilisations/location-acquisition/contrats/${contrat.id}/option`, corps)).rejects.toThrow(/déjà déclarée/);

  const biens = await appelApi<Array<{ designation: string; statut: string; prixCession: unknown }>>(page, 'GET', '/immobilisations');
  const bien = biens.find((b) => b.designation === 'Option e2e');
  expect(bien?.statut).toBe('CEDEE');
  // Le prix est le capital restant dû de l'échéancier, arrondi ligne à
  // ligne · il solde le 17 au centime, à un centime au plus du prix d'option.
  const prix = Number(bien?.prixCession);
  expect(Math.abs(prix - 5000)).toBeLessThanOrEqual(0.02);
  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${suivant.id}`,
  );
  expect(Number(lignes.find((l) => l.numero === '17300000')?.mouvementDebit)).toBe(prix);
  expect(Number(lignes.find((l) => l.numero.startsWith('82'))?.mouvementCredit)).toBe(prix);

  expect(pannes).toEqual([]);
});

/**
 * LE BIEN REÇU EN SUBVENTION, SUR LA BASE RÉELLE (fiche du compte 14) · il
 * entre par le 14 au SYSCOHADA, la reprise au 799 se propose une fois la
 * dotation passée, au même montant, et ne se passe qu'une fois.
 */
test('SYSCOHADA · un bien reçu en subvention se reprend au 799 au rythme de sa dotation', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Subvention en nature e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const vehicule = comptes.find((c) => c.numero.startsWith('2451'));
  if (!vehicule) throw new Error('Aucun compte 2451 au plan semé');
  const contreparties = await appelApi<Array<{ id: string; numero: string; mode: string | null }>>(
    page,
    'GET',
    `/immobilisations/contreparties-acquisition?compteImmobilisationId=${vehicule.id}`,
  );
  const subvention = contreparties.find((c) => c.numero === '14170000');
  expect(subvention?.mode).toBe('SUBVENTION_EN_NATURE');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  const bien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
    compteImmobilisationId: vehicule.id,
    designation: 'Véhicule reçu e2e',
    dateAcquisition: debut,
    dateMiseEnService: debut,
    valeurOrigine: 6_000_000,
    dureeAmortissementAns: 5,
    compteContrepartieId: subvention!.id,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  const avant = await appelApi<{ motif: string | null }>(page, 'GET', `/immobilisations/${bien.id}/reprise-subvention?exerciceId=${exercice.id}`);
  expect(avant.motif).toMatch(/dotation/);

  const dotation = await appelApi<{ montant: number }>(page, 'POST', `/immobilisations/${bien.id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  const { biens } = await appelApi<{ biens: Array<{ id: string; montant: number; subvention: number }> }>(
    page,
    'GET',
    `/immobilisations/reprises-subvention?exerciceId=${exercice.id}`,
  );
  const proposition = biens.find((b) => b.id === bien.id);
  expect(proposition?.subvention).toBe(6_000_000);
  expect(proposition?.montant).toBeCloseTo(Number(dotation.montant), 2);

  const corps = { exerciceId: exercice.id, journalId: od.id };
  await appelApi(page, 'POST', `/immobilisations/${bien.id}/reprise-subvention`, corps);
  await expect(appelApi(page, 'POST', `/immobilisations/${bien.id}/reprise-subvention`, corps)).rejects.toThrow(/déjà passée/);
  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementCredit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${exercice.id}`,
  );
  expect(Number(lignes.find((l) => l.numero === '79900000')?.mouvementCredit)).toBeCloseTo(Number(dotation.montant), 2);

  expect(pannes).toEqual([]);
});

/**
 * L'ÉCHANGE, SUR LA BASE RÉELLE (Guide d'application SYSCOHADA, Partie 1
 * ch. 5 § 4.5) · l'ancien bien sort au prix de reprise (485 / 82), le
 * nouveau entre à prix de reprise + soulte (2 / 481), aux deux référentiels.
 */
for (const [referentiel, fournisseur] of [
  ['SYSCOHADA', '48120000'],
  ['SYCEBNL', '48120000'],
] as const) {
  test(`${referentiel} · l’échange sort l’ancien bien au prix de reprise et fait entrer le nouveau avec la soulte`, async ({ page }) => {
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Échange ${referentiel} e2e`, montant: 10_000 });
    await seConnecter(page, dossier.email);
    const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
    const comptes = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
    const vehicule = comptes.find((c) => c.numero.startsWith('2451'));
    const plan = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?typeCompte=DETAIL');
    const banque = plan.find((c) => c.numero.startsWith('52'));
    const creance = plan.find((c) => c.numero.startsWith('485'));
    const dette = plan.find((c) => c.numero === fournisseur);
    if (!vehicule || !banque || !creance || !dette) throw new Error('Comptes du semis introuvables');
    const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
    const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
    const debut = exercice.dateDebut.slice(0, 10);
    const ancien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
      compteImmobilisationId: vehicule.id,
      designation: 'Vieux camion e2e',
      dateAcquisition: debut,
      dateMiseEnService: debut,
      valeurOrigine: 5_000_000,
      dureeAmortissementAns: 5,
      compteContrepartieId: banque.id,
      exerciceId: exercice.id,
      journalId: od.id,
    });
    const milieu = new Date((Date.parse(exercice.dateDebut) + Date.parse(exercice.dateFin)) / 2).toISOString().slice(0, 10);
    const r = await appelApi<{ valeurOrigine: number }>(page, 'POST', `/immobilisations/${ancien.id}/echange`, {
      dateEchange: milieu,
      exerciceId: exercice.id,
      journalId: od.id,
      prixDeReprise: 3_000_000,
      soulte: 4_000_000,
      compteCreanceId: creance.id,
      compteFournisseurId: dette.id,
      compteImmobilisationId: vehicule.id,
      designation: 'Camion neuf e2e',
      dureeAmortissementAns: 5,
    });
    expect(r.valeurOrigine).toBe(7_000_000);
    const biens = await appelApi<Array<{ designation: string; statut: string; valeurOrigine: unknown }>>(page, 'GET', '/immobilisations');
    expect(biens.find((b) => b.designation === 'Vieux camion e2e')?.statut).toBe('CEDEE');
    expect(Number(biens.find((b) => b.designation === 'Camion neuf e2e')?.valeurOrigine)).toBe(7_000_000);
    const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(
      page,
      'GET',
      `/ecritures/balance?exerciceId=${exercice.id}`,
    );
    expect(Number(lignes.find((l) => l.numero === creance.numero)?.mouvementDebit)).toBe(3_000_000);
    expect(Number(lignes.find((l) => l.numero === fournisseur)?.mouvementCredit)).toBe(7_000_000);
    expect(Number(lignes.find((l) => l.numero.startsWith('822'))?.mouvementCredit)).toBe(3_000_000);
    // Un bien sorti ne s'échange plus.
    await expect(
      appelApi(page, 'POST', `/immobilisations/${ancien.id}/echange`, {
        dateEchange: milieu,
        exerciceId: exercice.id,
        journalId: od.id,
        prixDeReprise: 1,
        soulte: 0,
        compteCreanceId: creance.id,
        compteFournisseurId: dette.id,
        compteImmobilisationId: vehicule.id,
        designation: 'Doublon',
      }),
    ).rejects.toThrow(/déjà sorti/);

    expect(pannes).toEqual([]);
  });
}

/**
 * L'AMORTISSEMENT EXCEPTIONNEL, SUR LA BASE RÉELLE (loi n° 23/053, art. 36 à
 * 38, décisions D-8 à D-10) · les colonnes de la déclaration de l'art. 36
 * naissent d'une migration écrite à la main ; l'option se prend sous 20 %
 * refusée, au-dessus retenue, et le dérogatoire de la première année porte
 * 60 % du coût moins la dotation comptable, au 851 contre le 151.
 */
test('SYSCOHADA · l’amortissement exceptionnel passe 60 % du coût la première année, l’écart au 851', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Exceptionnel e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const materiel = comptes.find((c) => c.numero.startsWith('241'));
  if (!materiel) throw new Error('Aucun compte 241 au plan semé');
  const contreparties = await appelApi<Array<{ id: string; numero: string; mode: string | null }>>(
    page,
    'GET',
    `/immobilisations/contreparties-acquisition?compteImmobilisationId=${materiel.id}`,
  );
  const fournisseur = contreparties.find((c) => c.mode === 'ACHAT_A_CREDIT');
  if (!fournisseur) throw new Error('Aucun fournisseur d’investissement proposé');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  const bien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
    compteImmobilisationId: materiel.id,
    designation: 'Presse industrielle e2e',
    dateAcquisition: debut,
    dateMiseEnService: debut,
    valeurOrigine: 10_000_000,
    dureeAmortissementAns: 5,
    compteContrepartieId: fournisseur.id,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  const option = {
    categorie: 'MATERIEL_INDUSTRIEL',
    bienNeuf: true,
    dureeFiscaleAns: 5,
    exceptionnel: true,
    activiteIndustrielle: true,
    chiffreAffairesExportHt: 150_000,
    chiffreAffairesTotalHt: 1_000_000,
    sourceChiffreAffaires: 'Déclaration e2e',
  };
  await expect(appelApi(page, 'POST', `/immobilisations/${bien.id}/option-degressif`, option)).rejects.toThrow(/15\.00 %/);
  await appelApi(page, 'POST', `/immobilisations/${bien.id}/option-degressif`, { ...option, chiffreAffairesExportHt: 300_000 });

  const plan = await appelApi<{ amortissementExceptionnel: boolean; prorataExport: number; lignes: Array<{ annuiteFiscale: number; mode: string }> }>(
    page,
    'GET',
    `/immobilisations/${bien.id}/plan-fiscal`,
  );
  expect(plan.amortissementExceptionnel).toBe(true);
  expect(plan.prorataExport).toBe(0.3);
  expect(plan.lignes[0]).toMatchObject({ annuiteFiscale: 6_000_000, mode: 'EXCEPTIONNEL_ART_38' });

  const dotation = await appelApi<{ montant: number }>(page, 'POST', `/immobilisations/${bien.id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  await appelApi(page, 'POST', `/immobilisations/${bien.id}/derogatoire`, { exerciceId: exercice.id, journalId: od.id });
  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${exercice.id}`,
  );
  const attendu = 6_000_000 - Number(dotation.montant);
  expect(Number(lignes.find((l) => l.numero === '85100000')?.mouvementDebit)).toBeCloseTo(attendu, 2);
  expect(Number(lignes.find((l) => l.numero === '15100000')?.mouvementCredit)).toBeCloseTo(attendu, 2);

  expect(pannes).toEqual([]);
});

/**
 * LA FIN D'UN PROJET DE DÉVELOPPEMENT, SUR LA BASE RÉELLE (SYCEBNL Partie 3
 * ch. 3 § 2.5) · le bien sort par le fonds affecté qui l'a financé (D 162 /
 * C 2), sans 28 ni 81, et la sortie est refusée sans ce compte.
 */
test('SYCEBNL · projet de développement, le bien sort par le 162, sans 81', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Fin de projet e2e', montant: 10_000, jeuSycebnl: 'PROJETS_DEVELOPPEMENT' });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const materiel = comptes.find((c) => c.numero.startsWith('24'));
  if (!materiel) throw new Error('Aucun compte 24 au plan semé');
  const contreparties = await appelApi<Array<{ id: string; numero: string; mode: string | null }>>(
    page,
    'GET',
    `/immobilisations/contreparties-acquisition?compteImmobilisationId=${materiel.id}`,
  );
  const fournisseur = contreparties.find((c) => c.mode === 'ACHAT_A_CREDIT');
  if (!fournisseur) throw new Error('Aucun fournisseur d’investissement proposé');
  const tous = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const fonds = tous.find((c) => c.numero === '16200000');
  if (!fonds) throw new Error('Aucun 16200000 au plan semé');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  const bien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
    compteImmobilisationId: materiel.id,
    designation: 'Véhicule du projet e2e',
    dateAcquisition: debut,
    dateMiseEnService: debut,
    valeurOrigine: 8_000_000,
    dureeAmortissementAns: 5,
    compteContrepartieId: fournisseur.id,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  await expect(appelApi(page, 'POST', `/immobilisations/${bien.id}/dotation`, { exerciceId: exercice.id, journalId: od.id })).rejects.toThrow(
    /art\. 7 et 9/,
  );
  const sortie = { dateSortie: exercice.dateFin.slice(0, 10), type: 'MISE_HORS_SERVICE', exerciceId: exercice.id, journalId: od.id };
  await expect(appelApi(page, 'POST', `/immobilisations/${bien.id}/sortie`, sortie)).rejects.toThrow(/162, 163 ou 164/);
  await appelApi(page, 'POST', `/immobilisations/${bien.id}/sortie`, { ...sortie, compteFondsProjetId: fonds.id });

  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${exercice.id}`,
  );
  expect(Number(lignes.find((l) => l.numero === '16200000')?.mouvementDebit)).toBe(8_000_000);
  expect(Number(lignes.find((l) => l.numero === materiel.numero)?.mouvementCredit)).toBe(8_000_000);
  expect(lignes.filter((l) => l.numero.startsWith('81') && Number(l.mouvementDebit) > 0)).toEqual([]);

  expect(pannes).toEqual([]);
});

/**
 * LA REPRISE DU 167, SUR LA BASE RÉELLE (SYCEBNL Partie 3 ch. 2 § 1.2.2,
 * Guide, Application 5) · un bien légué à conserver se reprend au 7923 pour
 * la dotation de l'exercice, proposée depuis la fiche, une fois.
 */
test('SYCEBNL · un legs à conserver (167) se reprend au 7923 pour la dotation', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Legs e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const comptes = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const mobilier = comptes.find((c) => c.numero.startsWith('2441'));
  if (!mobilier) throw new Error('Aucun compte 2441 au plan semé');
  const contreparties = await appelApi<Array<{ id: string; numero: string; mode: string | null }>>(
    page,
    'GET',
    `/immobilisations/contreparties-acquisition?compteImmobilisationId=${mobilier.id}`,
  );
  const legs = contreparties.find((c) => c.numero.startsWith('167') && !c.numero.startsWith('1679'));
  if (!legs) throw new Error('Aucun 167 proposé en contrepartie');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  const bien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
    compteImmobilisationId: mobilier.id,
    designation: 'Mobilier légué e2e',
    dateAcquisition: debut,
    dateMiseEnService: debut,
    valeurOrigine: 25_000_000,
    dureeAmortissementAns: 10,
    compteContrepartieId: legs.id,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  const dotation = await appelApi<{ montant: number }>(page, 'POST', `/immobilisations/${bien.id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  const { biens } = await appelApi<{ biens: Array<{ id: string; montant: number }> }>(page, 'GET', `/immobilisations/reprises-subvention?exerciceId=${exercice.id}`);
  expect(biens.find((b) => b.id === bien.id)?.montant).toBeCloseTo(Number(dotation.montant), 2);
  const corps = { exerciceId: exercice.id, journalId: od.id };
  await appelApi(page, 'POST', `/immobilisations/${bien.id}/reprise-subvention`, corps);
  await expect(appelApi(page, 'POST', `/immobilisations/${bien.id}/reprise-subvention`, corps)).rejects.toThrow(/déjà passée/);
  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${exercice.id}`,
  );
  expect(Number(lignes.find((l) => l.numero === '79230000')?.mouvementCredit)).toBeCloseTo(Number(dotation.montant), 2);
  expect(Number(lignes.find((l) => l.numero === legs.numero)?.mouvementDebit)).toBeCloseTo(Number(dotation.montant), 2);

  expect(pannes).toEqual([]);
});

test('SYCEBNL · une subvention en numéraire rattachée au bien se reprend au 799, puis se réduit', async ({ page }) => {
  // Application 3 du Guide · notification au 4731 / 1417, bien payé ensuite
  // au 4812 ; le rattachement déclare le lien (AUDCIF Titre VIII ch. 17 § 3.2).
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Subvention e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const plan = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const compte = (numero: string) => {
    const c = plan.find((x) => x.numero === numero);
    if (!c) throw new Error(`Compte ${numero} absent du plan semé`);
    return c;
  };
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: od.id,
    date: debut,
    libelle: 'Notification de subvention e2e',
    lignes: [
      { compteId: compte('47310000').id, libelle: 'e2e', debit: 120_000_000, credit: 0 },
      { compteId: compte('14170000').id, libelle: 'e2e', debit: 0, credit: 120_000_000 },
    ],
  });
  const comptesBien = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const batiment = comptesBien.find((c) => c.numero.startsWith('231'));
  if (!batiment) throw new Error('Aucun compte 231 au plan semé');
  const contreparties = await appelApi<Array<{ id: string; numero: string }>>(
    page,
    'GET',
    `/immobilisations/contreparties-acquisition?compteImmobilisationId=${batiment.id}`,
  );
  const fournisseur = contreparties.find((c) => c.numero === '48120000');
  if (!fournisseur) throw new Error('Aucun 4812 proposé en contrepartie');
  const bien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
    compteImmobilisationId: batiment.id,
    designation: 'Entrepôt subventionné e2e',
    dateAcquisition: debut,
    dateMiseEnService: debut,
    valeurOrigine: 100_000_000,
    dureeAmortissementAns: 20,
    compteContrepartieId: fournisseur.id,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  // Plus que l'octroi passé au 14 · refusé.
  const corpsRattachement = { compteSubventionId: compte('14170000').id, dateOctroi: debut, reference: 'Convention e2e' };
  await expect(
    appelApi(page, 'POST', '/immobilisations/subventions-rattachees', { ...corpsRattachement, lignes: [{ immobilisationId: bien.id, montant: 130_000_000 }] }),
  ).rejects.toThrow();
  const [rattache] = await appelApi<Array<{ id: string }>>(page, 'POST', '/immobilisations/subventions-rattachees', {
    ...corpsRattachement,
    lignes: [{ immobilisationId: bien.id, montant: 100_000_000 }],
  });
  const dotation = await appelApi<{ montant: number }>(page, 'POST', `/immobilisations/${bien.id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  const { biens } = await appelApi<{ biens: Array<{ id: string; montant: number }> }>(page, 'GET', `/immobilisations/reprises-subvention?exerciceId=${exercice.id}`);
  // Subvention égale à la valeur d'entrée · la reprise vaut la dotation.
  expect(biens.find((b) => b.id === bien.id)?.montant).toBeCloseTo(Number(dotation.montant), 2);
  await appelApi(page, 'POST', `/immobilisations/${bien.id}/reprise-subvention`, { exerciceId: exercice.id, journalId: od.id });

  // Remboursement de 10 000 000 au 4739 · D 14 / C 4739.
  await appelApi(page, 'POST', `/immobilisations/subventions-rattachees/${rattache.id}/reductions`, {
    nature: 'REMBOURSEMENT',
    exerciceId: exercice.id,
    journalId: od.id,
    date: exercice.dateFin.slice(0, 10),
    montant: 10_000_000,
    compteContrepartieId: compte('47390000').id,
    motif: 'Conditions non remplies e2e',
  });
  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${exercice.id}`,
  );
  expect(Number(lignes.find((l) => l.numero === '79900000')?.mouvementCredit)).toBeCloseTo(Number(dotation.montant), 2);
  expect(Number(lignes.find((l) => l.numero === '47390000')?.mouvementCredit)).toBeCloseTo(10_000_000, 2);
  expect(Number(lignes.find((l) => l.numero === '14170000')?.mouvementDebit)).toBeCloseTo(Number(dotation.montant) + 10_000_000, 2);

  expect(pannes).toEqual([]);
});

for (const [referentiel, mobilier] of [
  ['SYSCOHADA', '24440000'],
  ['SYCEBNL', '24410000'],
] as const) {
  test(`${referentiel} · le barème et les comptes se proposent dans les deux sens, colonne du référentiel`, async ({ page }) => {
    // Lot 6, décision D-4 · « mobiliers de bureau » (VI.2) au 2444 SYSCOHADA,
    // au 2441 SYCEBNL, où le 2444 est le matériel et mobilier sportifs.
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Barème ${referentiel} e2e`, montant: 10_000 });
    await seConnecter(page, dossier.email);
    const bareme = await appelApi<Array<{ cle: string; comptes: string[] }>>(page, 'GET', '/immobilisations/bareme-fiscal');
    expect(bareme).toHaveLength(131);
    expect(bareme.find((n) => n.cle === 'VI.2')?.comptes).toEqual([mobilier]);
    const comptes = await appelApi<Array<{ numero: string; naturesBareme: string[] }>>(page, 'GET', '/immobilisations/comptes-du-bien');
    expect(comptes.find((c) => c.numero === mobilier)?.naturesBareme).toContain('VI.2');
    for (const c of bareme.flatMap((n) => n.comptes)) expect(comptes.some((x) => x.numero === c)).toBe(true);
    expect(pannes).toEqual([]);
  });
}

test('SYCEBNL · un legs grevé de dettes · une pièce par bien, 4861 et 167 aux totaux de l’acte, reprise à la quote-part', async ({ page }) => {
  // SYCEBNL Partie 3 ch. 2 § 1.2.2, Application 5 réduite à deux biens ;
  // décisions D-15 et D-16.
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Legs grevé e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const plan = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const compte = (numero: string) => {
    const c = plan.find((x) => x.numero === numero);
    if (!c) throw new Error(`Compte ${numero} absent du plan semé`);
    return c;
  };
  const comptesBien = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const batiment = comptesBien.find((c) => c.numero === '23130000');
  const informatique = comptesBien.find((c) => c.numero === '24420000');
  if (!batiment || !informatique) throw new Error('Comptes 2313 ou 2442 absents');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  const corps = {
    exerciceId: exercice.id,
    journalId: od.id,
    dateActe: debut,
    referenceActe: 'Acte e2e',
    compteFondsId: compte('16710000').id,
    compteDettesId: compte('48610000').id,
    dettes: 10_000_000,
    biens: [
      { compteImmobilisationId: batiment.id, designation: 'Bâtiment légué e2e', valeurOrigine: 400_000_000, dureeAmortissementAns: 30, dateMiseEnService: debut },
      { compteImmobilisationId: informatique.id, designation: 'Informatique léguée e2e', valeurOrigine: 100_000_000, dureeAmortissementAns: 2, dateMiseEnService: debut },
    ],
  };
  // Le 1679 n'est pas un fonds reçu · refusé, et rien n'est créé.
  await expect(appelApi(page, 'POST', '/immobilisations/legs', { ...corps, compteFondsId: compte('16790000').id })).rejects.toThrow();
  const { biens } = await appelApi<{ biens: Array<{ id: string; dettes: number; fonds: number }> }>(page, 'POST', '/immobilisations/legs', corps);
  expect(biens.map((b) => b.dettes)).toEqual([8_000_000, 2_000_000]);
  const balance = async () =>
    (await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number; mouvementCredit: number }> }>(page, 'GET', `/ecritures/balance?exerciceId=${exercice.id}`)).lignes;
  let lignes = await balance();
  expect(Number(lignes.find((l) => l.numero === '48610000')?.mouvementCredit)).toBeCloseTo(10_000_000, 2);
  expect(Number(lignes.find((l) => l.numero === '16710000')?.mouvementCredit)).toBeCloseTo(490_000_000, 2);

  // Reprise du bâtiment · dotation × 392 000 000 / 400 000 000.
  const dotation = await appelApi<{ montant: number }>(page, 'POST', `/immobilisations/${biens[0].id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  await appelApi(page, 'POST', `/immobilisations/${biens[0].id}/reprise-subvention`, { exerciceId: exercice.id, journalId: od.id });
  lignes = await balance();
  expect(Number(lignes.find((l) => l.numero === '79230000')?.mouvementCredit)).toBeCloseTo((Number(dotation.montant) * 392) / 400, 1);

  expect(pannes).toEqual([]);
});

test('SYSCOHADA · un prix global se ventile, et une partie non identifiée sort de la structure', async ({ page }) => {
  // Lot 8 · AUDCIF art. 38, Titre VIII ch. 11 § 1.7.1 et ch. 4 § 4.2.
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Prix global e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const annee = Number(exercice.dateDebut.slice(0, 4));
  const comptesBien = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  // Un terrain nu, que le plan ne fait pas amortir (221 agricole s'amortit au 2821).
  const terrain = comptesBien.find((c) => /^22[235678]/.test(c.numero));
  const batiment = comptesBien.find((c) => c.numero.startsWith('231'));
  if (!terrain || !batiment) throw new Error('Aucun compte 22 ou 231 au plan semé');
  const contreparties = await appelApi<Array<{ id: string; numero: string }>>(
    page,
    'GET',
    `/immobilisations/contreparties-acquisition?compteImmobilisationId=${batiment.id}`,
  );
  const fournisseur = contreparties.find((c) => c.numero === '48120000');
  if (!fournisseur) throw new Error('Aucun 4812 proposé en contrepartie');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];

  // Terrain par comparaison, bâtiment par différence.
  const r = await appelApi<{ biens: Array<{ id: string; montant: number }> }>(page, 'POST', '/immobilisations/prix-global', {
    exerciceId: exercice.id,
    journalId: od.id,
    dateAcquisition: `${annee}-02-01`,
    referenceActe: 'Acte e2e',
    compteContrepartieId: fournisseur.id,
    prix: 500_000_000,
    nature: 'ENSEMBLE',
    fondement: 'COMPARAISON_TERRAINS_NUS',
    sourceValeurs: 'Parcelle voisine vendue nue',
    biens: [
      { compteImmobilisationId: terrain.id, designation: 'Terrain e2e', montant: 120_000_000 },
      { compteImmobilisationId: batiment.id, designation: 'Bâtiment e2e', parDifference: true, dureeAmortissementAns: 30 },
    ],
  });
  expect(r.biens.map((b) => b.montant)).toEqual([120_000_000, 380_000_000]);
  const liste = await appelApi<Array<{ id: string; valeurOrigine: number; modaliteVentilation: string | null }>>(page, 'GET', '/immobilisations');
  expect(liste.find((i) => i.id === r.biens[1].id)?.modaliteVentilation).toMatch(/comparaison/);

  // Bâtiment repris, cinq annuités passées (25 000 000 sur 150 000 000 à 30 ans).
  const structure = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
    compteImmobilisationId: batiment.id,
    designation: 'Siège repris e2e',
    dateAcquisition: `${annee - 5}-01-02`,
    dateMiseEnService: `${annee - 5}-01-02`,
    valeurOrigine: 150_000_000,
    dureeAmortissementAns: 30,
    amortissementAnterieur: 25_000_000,
    repris: true,
    exerciceId: exercice.id,
  });
  await appelApi(page, 'POST', `/immobilisations/${structure.id}/remplacement-imprevu`, {
    exerciceId: exercice.id,
    journalId: od.id,
    dateRenouvellement: `${annee}-06-30`,
    designation: 'Ascenseur neuf e2e',
    coutRenouvellement: 40_000_000,
    dureeAmortissementAns: 10,
    compteContrepartieId: fournisseur.id,
    designationPartie: 'Ascenseur d’origine e2e',
    valeurOrigineEstimee: 30_000_000,
    methodeEstimation: 'COUT_ACTUEL_A_NEUF',
    sourceEstimation: 'Fiche technique',
    justificationDecomposition: 'Ascenseur à durée distincte',
  });
  // La partie sort · 30 000 000 − 5 000 000 au prorata − 500 000 de janvier à juin.
  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementDebit: number }> }>(
    page,
    'GET',
    `/ecritures/balance?exerciceId=${exercice.id}`,
  );
  expect(Number(lignes.find((l) => l.numero.startsWith('812'))?.mouvementDebit)).toBeCloseTo(24_500_000, 2);
  // La structure garde 120 000 000 et 20 000 000 d'amortissements, pas 25 000 000.
  const tableau = await appelApi<{ groupes: Array<{ lignes: Array<{ id: string; valeurBrute: number; amortissements: number }> }> }>(page, 'GET', '/immobilisations/tableau');
  const ligne = tableau.groupes.flatMap((g) => g.lignes).find((l) => l.id === structure.id);
  expect(ligne?.valeurBrute).toBeCloseTo(120_000_000, 2);
  expect(ligne?.amortissements).toBeCloseTo(20_000_000, 2);
  const dotation = await appelApi<{ montant: number }>(page, 'POST', `/immobilisations/${structure.id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  expect(Number(dotation.montant)).toBeCloseTo(4_000_000, 2);

  expect(pannes).toEqual([]);
});

test('SYCEBNL · le catalogue renvoie au module, et le bien à vendre se déprécie au 2902 par sa fiche', async ({ page }) => {
  // Lot 9 · SYCEBNL Partie 3 ch. 2 § 2.2 ; décisions D-20, D-21.
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Catalogue e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  await expect(
    appelApi(page, 'POST', '/operations-specifiques/proposition', { codeModele: 'B18-AMORTISSEMENT', parametres: { valeur: 150_000_000, duree: 10, mois: 12 } }),
  ).rejects.toThrow(/fenêtre Immobilisations/);

  const plan = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const compte = (numero: string) => {
    const c = plan.find((x) => x.numero === numero);
    if (!c) throw new Error(`Compte ${numero} absent du plan semé`);
    return c;
  };
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const debut = exercice.dateDebut.slice(0, 10);
  // B17-COMPTABILISATION par la fiche · D 203 / C 172.
  const bien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', {
    compteImmobilisationId: compte('20300000').id,
    designation: 'Bâtiment légué à vendre e2e',
    dateAcquisition: debut,
    valeurOrigine: 400_000_000,
    compteContrepartieId: compte('17200000').id,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  const depreciation = (compte29: string, contrepartie: string) =>
    appelApi(page, 'POST', `/immobilisations/${bien.id}/depreciation`, {
      exerciceId: exercice.id,
      journalId: od.id,
      sens: 'DOTATION',
      montant: 100_000_000,
      compteDepreciationId: compte(compte29).id,
      compteContrepartieId: compte(contrepartie).id,
      indice: 'Estimation du notaire à 300 000 000',
    });
  await expect(depreciation('29010000', '69520000')).rejects.toThrow(/2902/);
  await expect(depreciation('29020000', '69510000')).rejects.toThrow(/6952/);
  await depreciation('29020000', '69520000');
  const { lignes } = await appelApi<{ lignes: Array<{ numero: string; mouvementCredit: number }> }>(page, 'GET', `/ecritures/balance?exerciceId=${exercice.id}`);
  expect(Number(lignes.find((l) => l.numero === '29020000')?.mouvementCredit)).toBeCloseTo(100_000_000, 2);

  expect(pannes).toEqual([]);
});

test('SYSCOHADA · une marque à durée non limitée n’est pas amortie, puis bascule à compter de la décision', async ({ page }) => {
  // Lot 10 · AUDCIF Titre VIII ch. 2 § 4.2.2 (exemple du texte · quatre ans au 1er septembre).
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Marque e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const annee = Number(exercice.dateDebut.slice(0, 4));
  const debut = exercice.dateDebut.slice(0, 10);
  const comptesBien = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/immobilisations/comptes-du-bien');
  const marque = comptesBien.find((c) => c.numero === '21400000');
  const logiciel = comptesBien.find((c) => c.numero === '21310000');
  if (!marque || !logiciel) throw new Error('Comptes 214 ou 2131 absents du plan semé');
  const contreparties = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', `/immobilisations/contreparties-acquisition?compteImmobilisationId=${marque.id}`);
  const fournisseur = contreparties.find((c) => c.numero === '48110000');
  if (!fournisseur) throw new Error('Aucun 4811 proposé en contrepartie');
  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  const corps = (compte: string, designation: string) => ({
    compteImmobilisationId: compte,
    designation,
    dateAcquisition: debut,
    dateMiseEnService: debut,
    valeurOrigine: 12_000_000,
    dureeNonLimitee: true,
    justificationDureeNonLimitee: 'Marque protégée, aucune fin prévisible',
    compteContrepartieId: fournisseur.id,
    exerciceId: exercice.id,
    journalId: od.id,
  });
  await expect(appelApi(page, 'POST', '/immobilisations', corps(logiciel.id, 'Logiciel e2e'))).rejects.toThrow(/logiciel/);
  const bien = await appelApi<{ id: string }>(page, 'POST', '/immobilisations', corps(marque.id, 'Marque e2e'));
  const doter = () => appelApi<{ montant: number }>(page, 'POST', `/immobilisations/${bien.id}/dotation`, { exerciceId: exercice.id, journalId: od.id });
  await expect(doter()).rejects.toThrow(/non limitée/);

  await appelApi(page, 'POST', `/immobilisations/${bien.id}/duree-limitee`, {
    dateDecision: `${annee}-09-01`,
    dureeResiduelleAns: 4,
    motif: `Décision d'arrêter la marque au 30 août ${annee + 4}`,
    testDepreciation: 'Valeur actuelle supérieure à la valeur comptable',
  });
  // 12 000 000 sur quatre ans, de septembre à décembre · 1 000 000, et non 3 000 000.
  expect(Number((await doter()).montant)).toBeCloseTo(1_000_000, 2);

  expect(pannes).toEqual([]);
});
