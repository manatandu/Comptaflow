import { expect, test } from '@playwright/test';
import { appelApi, creerDossier, seConnecter, surveiller } from './outils';

/**
 * LIGNE A7, SUR LA BASE RÉELLE · les trois tables des créances douteuses
 * naissent d'une migration écrite à la main, et seule une base PostgreSQL dit
 * qu'elles sont lues et écrites comme le schéma l'annonce. Parcours court ·
 * une vente de 1 160 000 au client, reclassée au 416, dépréciée de 400 000
 * à la clôture (D 6594 / C 491), l'écriture tenue par le module, puis la
 * revue annulée, et une perte saisie fausse annulée puis repassée (K4).
 */
interface Exercice { id: string; dateDebut: string; dateFin: string }
interface Compte { id: string; numero: string; typeCompte: string }
interface Liste {
  creances: Array<{ id: string; compte416: { numero: string }; resteALaCloture: number; depreciationALaCloture: number; revue: { id: string; ecritureId: string | null } | null }>;
  rapprochement: { solde416: number; resteModule: number; solde491: number; depreciationModule: number } | null;
}

for (const referentiel of ['SYSCOHADA', 'SYCEBNL'] as const) {
  test(`${referentiel} · une créance reclassée au 416, dépréciée à la clôture, retenue par le module`, async ({ page }) => {
    const pannes = surveiller(page);
    const dossier = await creerDossier(page, { referentiel, nom: `Créances douteuses e2e ${referentiel}`, montant: 10_000 });
    await seConnecter(page, dossier.email);
    const [exercice] = (await appelApi<Exercice[]>(page, 'GET', '/exercices')).filter((e) => e.id === dossier.exerciceId);
    const comptes = await appelApi<Compte[]>(page, 'GET', '/comptes?typeCompte=DETAIL');
    const journaux = await appelApi<Array<{ id: string; code: string; type: string }>>(page, 'GET', '/journaux');
    const od = journaux.find((j) => j.type === 'GENERAL') ?? journaux[0];
    const detail = (racine: string) => {
      const c = comptes.find((x) => x.typeCompte === 'DETAIL' && x.numero.startsWith(racine));
      if (!c) throw new Error(`Aucun compte de détail sous ${racine}`);
      return c;
    };
    // SYSCOHADA · le client (411) ; SYCEBNL · le client-usager (412).
    const client = detail(referentiel === 'SYSCOHADA' ? '411' : '412');
    const produit = detail('7');
    const debut = exercice.dateDebut.slice(0, 10);
    const annee = debut.slice(0, 4);
    await appelApi(page, 'POST', '/ecritures', {
      exerciceId: exercice.id,
      journalId: od.id,
      date: `${annee}-03-15`,
      libelle: 'Vente e2e à crédit',
      lignes: [
        { compteId: client.id, debit: 1_160_000, credit: 0 },
        { compteId: produit.id, debit: 0, credit: 1_160_000 },
      ],
    });

    // Le motif et la pièce sont exigés · refus nommé avant toute écriture.
    await expect(
      appelApi(page, 'POST', '/creances-douteuses', {
        exerciceId: exercice.id,
        journalId: od.id,
        date: `${annee}-11-15`,
        compteCreanceId: client.id,
        nature: 'DOUTEUSE',
        montant: 1_160_000,
        motif: 'Client en redressement judiciaire',
        pieces: [],
      }),
    ).rejects.toThrow(/400 · .*pièce justificative/);

    const creance = await appelApi<{ id: string; ecritureReclassementId: string }>(page, 'POST', '/creances-douteuses', {
      exerciceId: exercice.id,
      journalId: od.id,
      date: `${annee}-11-15`,
      compteCreanceId: client.id,
      nature: 'DOUTEUSE',
      montant: 1_160_000,
      motif: 'Client en redressement judiciaire',
      pieces: [{ nature: 'Jugement d’ouverture', reference: 'RJ 44' }],
    });

    await appelApi(page, 'POST', `/creances-douteuses/${creance.id}/revue`, {
      exerciceId: exercice.id,
      journalId: od.id,
      depreciationNecessaire: 400_000,
      motif: 'Syndic · 60 % de récupération attendue',
      pieces: [{ nature: 'Lettre du syndic', reference: 'S-9' }],
    });
    // Une seconde revue du même exercice se dit en 409.
    await expect(
      appelApi(page, 'POST', `/creances-douteuses/${creance.id}/revue`, {
        exerciceId: exercice.id,
        journalId: od.id,
        depreciationNecessaire: 500_000,
        motif: 'x',
        pieces: [{ nature: 'y', reference: 'z' }],
      }),
    ).rejects.toThrow(/409/);

    const liste = await appelApi<Liste>(page, 'GET', `/creances-douteuses?exerciceId=${exercice.id}`);
    expect(liste.creances).toHaveLength(1);
    const ligne = liste.creances[0];
    // SYSCOHADA · 4162 « Créances douteuses » ; SYCEBNL · 4162, celui des clients-usagers.
    expect(ligne.compte416.numero.startsWith('4162')).toBe(true);
    expect(ligne.resteALaCloture).toBe(1_160_000);
    expect(ligne.depreciationALaCloture).toBe(400_000);
    // Le module et la balance disent la même chose du 416 et du 491.
    expect(liste.rapprochement).toEqual({ provisoire: false, solde416: 1_160_000, resteModule: 1_160_000, solde491: 400_000, depreciationModule: 400_000 });

    // L'écriture de la dotation est TENUE · elle ne se supprime pas du journal.
    await expect(appelApi(page, 'DELETE', `/ecritures/${ligne.revue!.ecritureId}`)).rejects.toThrow(/400 · .*créance douteuse/);

    // À l'écran · la fenêtre s'ouvre, montre la créance, et l'annulation passe par sa modale.
    await page.goto('/#/creances-douteuses');
    await expect(page.getByText(client.numero, { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Annuler la revue' }).click();
    await page.getByRole('textbox').last().fill('Revue passée sur un reste faux');
    await page.getByRole('button', { name: 'Annuler la revue' }).last().click();
    await expect(page.getByRole('button', { name: 'Annuler la revue' })).toHaveCount(0);

    // Au brouillard, l'écriture de la revue est supprimée ; la revue reste, annulée.
    const apres = await appelApi<Liste & { creances: Array<{ revuesAnnulees: unknown[] }> }>(page, 'GET', `/creances-douteuses?exerciceId=${exercice.id}`);
    expect(apres.creances[0].revue).toBeNull();
    expect(apres.creances[0].revuesAnnulees).toHaveLength(1);
    expect(apres.rapprochement).toEqual({ provisoire: false, solde416: 1_160_000, resteModule: 1_160_000, solde491: 0, depreciationModule: 0 });
    // Une créance dont une revue est gardée, même annulée, ne se retire plus.
    await expect(appelApi(page, 'DELETE', `/creances-douteuses/${creance.id}`)).rejects.toThrow(/400 · .*même annulés/);

    // K4 · une perte saisie 1 000 000 au lieu de 100 000 s'ANNULE (au brouillard,
    // son écriture part), reste au dossier marquée, et le bon montant se repasse.
    const perte = (montant: number) =>
      appelApi<{ id: string }>(page, 'POST', `/creances-douteuses/${creance.id}/perte`, {
        exerciceId: exercice.id,
        journalId: od.id,
        date: `${annee}-12-20`,
        montant,
        motif: 'Liquidation judiciaire clôturée pour insuffisance d’actif',
        pieces: [{ nature: 'Certificat d’irrécouvrabilité', reference: 'CI-1' }],
      });
    const fausse = await perte(1_000_000);
    await appelApi(page, 'POST', `/creances-douteuses/${creance.id}/mouvements/${fausse.id}/annuler`, { motif: 'Montant saisi faux' });
    await perte(100_000);
    const fin = await appelApi<Liste & { creances: Array<{ mouvementsAnnules: unknown[] }> }>(page, 'GET', `/creances-douteuses?exerciceId=${exercice.id}`);
    expect(fin.creances[0].resteALaCloture).toBe(1_060_000);
    expect(fin.creances[0].mouvementsAnnules).toHaveLength(1);
    expect(fin.rapprochement?.solde416).toBe(1_060_000);
    expect(pannes).toEqual([]);
  });
}
