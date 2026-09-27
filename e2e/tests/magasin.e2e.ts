import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LE BONI ET LE MALI D'INVENTAIRE, SUR LA BASE RÉELLE (audit final F35, F36).
 *
 * Un mali constaté au comptage du 30 juin, alors qu'une sortie est saisie
 * après lui · la confrontation ne rejoue que le magasin du jour du comptage
 * (F36). La régularisation inscrit la sortie au magasin, liée à son écriture,
 * si bien qu'une seconde confrontation au même comptage ne trouve plus rien à
 * régulariser (F35) · avant, elle reproposait le même écart.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Confrontation {
  confrontation: {
    differences: Array<{ sens: string; ecartQuantite: number; montant: number }>;
    sansDifference: Array<{ articleId: string; quantite: number }>;
  } | null;
}

test('SYSCOHADA · un mali régularisé entre au magasin et ne se repropose plus', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Magasin e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);

  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const annee = exercice.dateDebut.slice(0, 4);
  await appelApi(page, 'PATCH', '/dossier/methode-inventaire-stocks', { methodeInventaireStocks: 'PERMANENT' });
  const comptes = await appelApi<Array<{ id: string; numero: string }>>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const stock = comptes.find((c) => c.numero === '33100000');
  if (!stock) throw new Error('Compte 33100000 absent du plan semé');
  const article = await appelApi<{ id: string }>(page, 'POST', '/magasin/articles', {
    compteId: stock.id,
    code: 'CIM-50',
    designation: 'Ciment 50 kg',
    uniteMesure: 'sac',
    methodeValorisation: 'CMPACE',
  });
  const mouvement = (date: string, sens: 'ENTREE' | 'SORTIE', quantite: number, cout?: number) =>
    appelApi(page, 'POST', `/magasin/articles/${article.id}/mouvements`, {
      date: `${annee}-${date}`,
      sens,
      quantite,
      ...(cout === undefined ? {} : { cout }),
      piece: `BE-${date}`,
    });
  await mouvement('01-05', 'ENTREE', 100, 1200);
  await mouvement('02-10', 'ENTREE', 200, 3000);
  await mouvement('03-15', 'SORTIE', 50);
  await mouvement('11-20', 'SORTIE', 100);

  const comptage = { dateComptage: `${annee}-06-30`, comptages: [{ articleId: article.id, quantitePhysique: 240 }] };
  const premiere = await appelApi<Confrontation>(page, 'POST', '/magasin/inventaire/confrontation', comptage);
  expect(premiere.confrontation!.differences).toEqual([
    expect.objectContaining({ sens: 'MALI', ecartQuantite: -10, montant: 140 }),
  ]);

  const journaux = await appelApi<Array<{ id: string; code: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  await appelApi(page, 'POST', '/magasin/inventaire/regularisation', {
    ...comptage,
    exerciceId: exercice.id,
    journalId: od.id,
    date: exercice.dateFin.slice(0, 10),
  });

  const seconde = await appelApi<Confrontation>(page, 'POST', '/magasin/inventaire/confrontation', comptage);
  expect(seconde.confrontation!.differences).toEqual([]);
  expect(seconde.confrontation!.sansDifference).toEqual([expect.objectContaining({ quantite: 240 })]);

  const fiche = await appelApi<{ lignes: Array<{ libelle: string | null; ecritureId: string | null; date: string }> }>(
    page,
    'GET',
    `/magasin/articles/${article.id}/fiche`,
  );
  const mali = fiche.lignes.find((l) => l.libelle === "Mali d'inventaire");
  expect(mali).toMatchObject({ date: `${annee}-06-30` });
  expect(mali!.ecritureId).not.toBeNull();

  expect(pannes).toEqual([]);
});
