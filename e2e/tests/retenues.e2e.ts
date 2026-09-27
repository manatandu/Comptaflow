import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LE SOLDE D'OUVERTURE DES RETENUES, SUR LA BASE RÉELLE (audit final F26).
 *
 * La retenue de décembre 2025 se reverse en janvier 2026, et la retenue de
 * janvier 2026 ne l'est jamais. Le registre doit imputer le reversement sur
 * l'ouverture et signaler janvier · d'abord exercice 2025 encore ouvert
 * (ouverture reconstituée sur le livre-journal), puis 2025 clôturé
 * (ouverture lue sur le report à-nouveau validé). Les deux chemins doivent
 * rendre le même registre.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Compte { id: string; numero: string; typeCompte: string }
interface Journal { id: string; code: string; type: string }
interface Nature { cle: string; soldeOuverture: number; mois: Array<{ mois: string; solde: number; enRetard: boolean }> }

test('SYCEBNL · le reversement de décembre N-1 n’acquitte pas janvier N', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYCEBNL', nom: 'Retenues e2e ASBL', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const annee = Number(exercice.dateDebut.slice(0, 4));
  const precedent = await appelApi<Exercice>(page, 'POST', '/exercices', {
    dateDebut: `${annee - 1}-01-01`,
    dateFin: `${annee - 1}-12-31`,
  });

  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const compte = (numero: string) => {
    const c = comptes.find((x) => x.numero === numero);
    if (!c) throw new Error(`Compte ${numero} absent du plan semé`);
    return c.id;
  };
  const retenue = compte('44720000');
  const charge = comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith('661'))!.id;
  const banque = comptes.find((c) => c.typeCompte === 'DETAIL' && c.numero.startsWith('52'))!.id;
  const journaux = await appelApi<Journal[]>(page, 'GET', '/journaux');
  const journal = (journaux.find((j) => j.type === 'GENERAL') ?? journaux[0]).id;
  const passer = (exerciceId: string, date: string, debitId: string, creditId: string) =>
    appelApi(page, 'POST', '/ecritures', {
      exerciceId,
      journalId: journal,
      date,
      libelle: `Retenue e2e ${date}`,
      lignes: [
        { compteId: debitId, libelle: 'e2e', debit: 100_000, credit: 0 },
        { compteId: creditId, libelle: 'e2e', debit: 0, credit: 100_000 },
      ],
    });

  await passer(precedent.id, `${annee - 1}-12-31`, charge, retenue);
  await passer(exercice.id, `${annee}-01-10`, retenue, banque);
  await passer(exercice.id, `${annee}-01-31`, charge, retenue);
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: precedent.id, dateLimite: `${annee - 1}-12-31` });
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: `${annee}-01-31` });

  const lire = async () => {
    const r = await appelApi<{ natures: Nature[] }>(
      page,
      'GET',
      `/retenues/registre?exerciceId=${exercice.id}&dateReference=${annee}-03-01`,
    );
    const n = r.natures.find((x) => x.cle === 'irppSalaires')!;
    return { ouverture: n.soldeOuverture, mois: n.mois.map((m) => [m.mois, m.solde, m.enRetard]) };
  };
  const attendu = {
    ouverture: 100_000,
    mois: [
      ['ANTERIEUR', 0, false],
      [`${annee}-01`, 100_000, true],
    ],
  };

  // Exercice précédent ouvert · l'ouverture se lit sur son livre-journal.
  expect(await lire()).toEqual(attendu);

  // Exercice précédent clôturé · l'ouverture est le report à-nouveau validé.
  await appelApi(page, 'POST', `/exercices/${precedent.id}/cloturer`);
  expect(await lire()).toEqual(attendu);

  expect(pannes).toEqual([]);
});
