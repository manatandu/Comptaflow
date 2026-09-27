import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * CLÔTURER PUIS AFFECTER, SUR LA BASE RÉELLE (audit final F4, F5, F6).
 *
 * Le défaut F4 avait passé des milliers de tests unitaires parce que la
 * balance y était une doublure · l'écriture de clôture restait au brouillard,
 * la balance la rangeait en report, et l'affectation lisait un résultat nul
 * sur TOUT exercice clos par OmegaX. Ce parcours ne double rien : il passe
 * par les routes, le serveur et une base PostgreSQL.
 */
const MONTANT = 150_000;

interface Exercice { id: string; dateDebut: string; dateFin: string; statut: string }
interface LigneBalance {
  numero: string;
  reportDebit: number;
  reportCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  clotureDebit: number;
  clotureCredit: number;
  solde: number;
}

const jour = (iso: string) => iso.slice(0, 10);
const lendemain = (iso: string) => new Date(Date.parse(jour(iso)) + 86_400_000).toISOString().slice(0, 10);

for (const referentiel of ['SYSCOHADA', 'SYCEBNL'] as const) {
  test(`${referentiel} · clôture dans l’ordre, balance du clos, affectation du résultat`, async ({ page }) => {
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Clôture e2e ${referentiel}`, montant: MONTANT });
    await seConnecter(page, dossier.email);

    const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
    await appelApi(page, 'POST', '/ecritures/valider-jusqua', { exerciceId: exercice.id, dateLimite: jour(exercice.dateFin) });

    // F6 · l'exercice suivant ne se clôt pas avant celui-ci.
    const debutSuivant = lendemain(exercice.dateFin);
    const finSuivant = `${Number(debutSuivant.slice(0, 4))}-12-31`;
    const suivant = await appelApi<Exercice>(page, 'POST', '/exercices', { dateDebut: debutSuivant, dateFin: finSuivant });
    await expect(appelApi(page, 'POST', `/exercices/${suivant.id}/cloturer`)).rejects.toThrow(/n.est pas clôturé/);

    await appelApi(page, 'POST', `/exercices/${exercice.id}/cloturer`);

    // F5 · sur l'exercice clos, le produit n'a aucune ouverture, et le
    // résultat de l'exercice n'est pas pris pour un report.
    const { lignes } = await appelApi<{ lignes: LigneBalance[] }>(page, 'GET', `/ecritures/balance?exerciceId=${exercice.id}`);
    const produit = lignes.find((l) => l.numero.startsWith('7'))!;
    const resultat = lignes.find((l) => l.numero.startsWith('131'))!;
    expect({
      produit: [produit.reportDebit, produit.reportCredit, produit.mouvementCredit, produit.clotureDebit, produit.solde],
      resultat: [resultat.reportCredit, resultat.clotureCredit, resultat.solde],
    }).toEqual({
      produit: [0, 0, MONTANT, MONTANT, 0],
      resultat: [0, MONTANT, -MONTANT],
    });

    // F4 · l'affectation voit le résultat que la clôture a posé.
    const affectation = await appelApi<{ montant: number; estBenefice: boolean }>(
      page,
      'GET',
      `/affectation-resultat/exercice/${exercice.id}`,
    );
    expect({ montant: affectation.montant, estBenefice: affectation.estBenefice }).toEqual({ montant: MONTANT, estBenefice: true });

    expect(pannes).toEqual([]);
  });
}
