import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LIGNE A7 QUATER, (B), SUR LA BASE RÉELLE ET À TRAVERS UNE CLÔTURE · le
 * lettrage automatique donnait la facture reclassée U au règlement P d'une
 * autre facture T dès que P précédait le reclassement R (U 10/02, T 01/05,
 * P 20/05, R 15/06 · [U,P] posé, T ouverte, sa TVA datée à tort, décret
 * n° 011/42, art. 57). Les passes par montant s'abstiennent désormais, et
 * en N+1 les à-nouveaux de U et de R, sans liaison, ne s'apparient pas.
 * Rejoué sur base réelle par l'API du serveur compilé avant intégration
 * (AVANCEMENT-A7quater.md), gelé ici.
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Compte { id: string; numero: string; typeCompte: string }
interface Auto { groupes: number; parMontant: number; ecarteesReclassement: number; passesParMontantSuspendues: boolean; miseDeCote: string | null }
interface LigneLettrage { id: string; libelle: string | null; debit: number; credit: number; lettre: string | null }

test('SYSCOHADA · la facture reclassée n’est jamais donnée au règlement d’une autre facture, ni en N ni en N+1', async ({ page }) => {
  const pannes = surveiller(page);
  const dossier = await creerDossier(page, { referentiel: 'SYSCOHADA', nom: 'Lettrage et reclassement e2e', montant: 10_000 });
  await seConnecter(page, dossier.email);
  const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
  const annee = Number(exercice.dateDebut.slice(0, 4));
  const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
  const journaux = await appelApi<Array<{ id: string; type: string }>>(page, 'GET', '/journaux');
  const od = journaux.find((j) => j.type === 'GENERAL') ?? journaux[0];
  const detail = (racine: string) => {
    const c = comptes.find((x) => x.typeCompte === 'DETAIL' && x.numero.startsWith(racine));
    if (!c) throw new Error(`Aucun compte de détail sous ${racine}`);
    return c;
  };
  const produit = detail('706');
  const tva = detail('443');
  const banque = detail('521');
  const client = await appelApi<Compte>(page, 'POST', '/comptes', {
    numero: '41110101',
    intitule: 'Client Kasa',
    typeCompte: 'DETAIL',
    lettrable: true,
    modeReportANouveau: 'DETAIL',
  });
  const vente = (jour: string, libelle: string) =>
    appelApi(page, 'POST', '/ecritures', {
      exerciceId: exercice.id,
      journalId: od.id,
      date: `${annee}-${jour}`,
      libelle,
      lignes: [
        { compteId: client.id, debit: 1_160_000, credit: 0 },
        { compteId: produit.id, debit: 0, credit: 1_000_000 },
        { compteId: tva.id, debit: 0, credit: 160_000 },
      ],
    });
  await vente('02-10', 'U · facture reclassée ensuite');
  await vente('05-01', 'T · prestation taxée');
  await appelApi(page, 'POST', '/ecritures', {
    exerciceId: exercice.id,
    journalId: od.id,
    date: `${annee}-05-20`,
    libelle: 'P · règlement de T',
    lignes: [
      { compteId: banque.id, debit: 1_160_000, credit: 0 },
      { compteId: client.id, debit: 0, credit: 1_160_000 },
    ],
  });
  await appelApi(page, 'POST', '/creances-douteuses', {
    exerciceId: exercice.id,
    journalId: od.id,
    date: `${annee}-06-15`,
    compteCreanceId: client.id,
    nature: 'DOUTEUSE',
    montant: 1_160_000,
    motif: 'Client U en redressement judiciaire',
    pieces: [{ nature: 'Jugement', reference: 'RJ-1' }],
  });

  // N · aucune paire par montant, et le nombre de lignes laissées ouvertes est dit.
  const autoN = await appelApi<Auto>(page, 'POST', `/comptes/${client.id}/lettrage/auto`, {});
  expect(autoN).toMatchObject({ groupes: 0, passesParMontantSuspendues: true, ecarteesReclassement: 4 });
  expect(autoN.miseDeCote).toMatch(/aucun rapprochement par montant/);
  const lignesN = (await appelApi<{ lignes: LigneLettrage[] }>(page, 'GET', `/comptes/${client.id}/lettrage`)).lignes;
  expect(lignesN.every((l) => l.lettre === null)).toBe(true);
  // Le cabinet lettre T et P à la main, ce qu'il sait.
  const parLibelle = (debut: string) => lignesN.find((l) => (l.libelle ?? '').startsWith(debut))!;
  await appelApi(page, 'POST', `/comptes/${client.id}/lettrage`, { ligneIds: [parLibelle('T ').id, parLibelle('P ').id] });

  // Clôture de N, ouverture de N+1 · les à-nouveaux de U et de R, en détail.
  await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: exercice.dateFin.slice(0, 10) });
  const suivant = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: `${annee + 1}-01-01`, dateFin: `${annee + 1}-12-31` });
  await appelApi(page, 'POST', `/exercices/${exercice.id}/cloturer`);
  const autoN1 = await appelApi<Auto>(page, 'POST', `/comptes/${client.id}/lettrage/auto`, {});
  expect(autoN1).toMatchObject({ groupes: 0, passesParMontantSuspendues: true, ecarteesReclassement: 2 });
  const toutes = (await appelApi<{ lignes: LigneLettrage[] }>(page, 'GET', `/comptes/${client.id}/lettrage`)).lignes;
  expect(toutes.filter((l) => l.lettre !== null)).toHaveLength(2);

  // Les soldes · le 411 du client à zéro dans les deux exercices, le 4162 à 1 160 000.
  const { lignes: balance } = await appelApi<{ lignes: Array<{ numero: string; solde: number }> }>(page, 'GET', `/ecritures/balance?exerciceId=${suivant.id}`);
  expect(balance.find((l) => l.numero === '41110101')?.solde).toBe(0);
  expect(balance.find((l) => l.numero === '41620000')?.solde).toBe(1_160_000);
  expect(pannes).toEqual([]);
});
