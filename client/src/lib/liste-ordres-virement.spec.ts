import { mentionAttenteHorsListe, mentionTrancheOrdres } from './liste-ordres-virement';

// Aucun import de « vitest » · convention du dépôt, `globals` fournit describe,
// it et expect.

/**
 * AUDIT FINAL F207 · la liste des ordres de virement s'arrêtait à cinq cents
 * sans le dire, et un ordre ancien resté à imprimer sortait de l'onglet.
 */
const ordre = (statut: string) => ({ statut });

describe('la liste des ordres de virement dit sa tranche', () => {
  it('une liste entière ne porte aucune mention', () => {
    const liste = { ordres: [ordre('IMPRIME'), ordre('A_IMPRIMER')], total: 2, tronque: false, enAttenteImpression: 1 };
    expect(mentionTrancheOrdres(liste)).toBeNull();
    expect(mentionAttenteHorsListe(liste)).toBeNull();
  });

  it('une tranche dit combien elle montre et sur combien', () => {
    const liste = { ordres: [ordre('IMPRIME'), ordre('IMPRIME')], total: 7, tronque: true, enAttenteImpression: 0 };
    expect(mentionTrancheOrdres(liste)).toBe('Les 2 ordres les plus récents sur 7.');
  });

  it('un ordre à imprimer hors de la tranche est compté, sur le dossier entier', () => {
    const liste = { ordres: [ordre('A_IMPRIMER'), ordre('IMPRIME')], total: 9, tronque: true, enAttenteImpression: 3 };
    expect(mentionAttenteHorsListe(liste)).toBe("2 ordres en attente d'impression ne sont pas dans la liste affichée.");
    expect(mentionAttenteHorsListe({ ...liste, enAttenteImpression: 2 })).toBe(
      "1 ordre en attente d'impression n'est pas dans la liste affichée.",
    );
  });

  it('les ordres à imprimer que la tranche montre ne sont pas redits', () => {
    const liste = { ordres: [ordre('A_IMPRIMER'), ordre('A_IMPRIMER')], total: 9, tronque: true, enAttenteImpression: 2 };
    expect(mentionAttenteHorsListe(liste)).toBeNull();
  });
});
