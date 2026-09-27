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
