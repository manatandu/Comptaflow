import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cheminListeOrdres,
  LIBELLE_STATUT_ORDRE,
  mentionAttenteHorsListe,
  mentionListeVide,
  mentionTrancheOrdres,
  type StatutOrdre,
} from './liste-ordres-virement';

// Aucun import de « vitest » · convention du dépôt, `globals` fournit describe,
// it et expect.

/**
 * AUDIT FINAL F207 · la liste des ordres de virement s'arrêtait à cinq cents
 * sans le dire, et un ordre ancien resté à imprimer sortait de l'onglet.
 */
const ordre = (statut: string) => ({ statut });

describe('la liste des ordres de virement dit sa tranche', () => {
  it('une liste entière ne porte aucune mention', () => {
    const liste = { ordres: [ordre('IMPRIME'), ordre('A_IMPRIMER')], total: 2, tronque: false, enAttenteImpression: 1, statut: null };
    expect(mentionTrancheOrdres(liste)).toBeNull();
    expect(mentionAttenteHorsListe(liste)).toBeNull();
    expect(mentionListeVide(liste)).toBeNull();
  });

  it('une tranche dit combien elle montre et sur combien', () => {
    const liste = { ordres: [ordre('IMPRIME'), ordre('IMPRIME')], total: 7, tronque: true, enAttenteImpression: 0, statut: null };
    expect(mentionTrancheOrdres(liste)).toBe('Les 2 ordres les plus récents sur 7.');
  });

  it('un ordre à imprimer hors de la tranche est compté, sur le dossier entier', () => {
    const liste = { ordres: [ordre('A_IMPRIMER'), ordre('IMPRIME')], total: 9, tronque: true, enAttenteImpression: 3, statut: null };
    expect(mentionAttenteHorsListe(liste)).toBe("2 ordres en attente d'impression ne sont pas dans la liste affichée.");
    expect(mentionAttenteHorsListe({ ...liste, enAttenteImpression: 2 })).toBe(
      "1 ordre en attente d'impression n'est pas dans la liste affichée.",
    );
  });

  it('les ordres à imprimer que la tranche montre ne sont pas redits', () => {
    const liste = { ordres: [ordre('A_IMPRIMER'), ordre('A_IMPRIMER')], total: 9, tronque: true, enAttenteImpression: 2, statut: null };
    expect(mentionAttenteHorsListe(liste)).toBeNull();
  });
});

/**
 * AUDIT FINAL F207, LE RESTE · le filtre par état. La phrase de la tranche
 * nomme le filtre que la RÉPONSE porte, et une liste filtrée vide ne dit rien
 * du dossier.
 */
describe('la liste des ordres se filtre par état', () => {
  it('sans filtre, la route entière ; filtrée, l’état passé tel quel', () => {
    expect(cheminListeOrdres(null)).toBe('/ordres-virement');
    expect(cheminListeOrdres('A_IMPRIMER')).toBe('/ordres-virement?statut=A_IMPRIMER');
    expect(cheminListeOrdres('ANNULE')).toBe('/ordres-virement?statut=ANNULE');
  });

  it('une tranche filtrée nomme son état', () => {
    const liste = { ordres: [ordre('IMPRIME'), ordre('IMPRIME')], total: 7, tronque: true, enAttenteImpression: 0, statut: 'IMPRIME' as StatutOrdre };
    expect(mentionTrancheOrdres(liste)).toBe('Les 2 ordres les plus récents sur 7 à l\'état « Imprimé ».');
  });

  it('une liste filtrée vide ne dit rien du dossier, seulement de l’état demandé', () => {
    const vide = { ordres: [], total: 0, tronque: false, enAttenteImpression: 0 };
    expect(mentionListeVide({ ...vide, statut: 'ANNULE' as StatutOrdre })).toBe("Aucun ordre à l'état « Annulé ».");
    expect(mentionListeVide({ ...vide, statut: null })).toBe(
      'Aucun ordre de virement. Cochez « Préparer un ordre de virement » en enregistrant des règlements fournisseurs.',
    );
  });

  it('sous un filtre qui les écarte, les ordres à imprimer restent dits', () => {
    const liste = { ordres: [], total: 0, tronque: false, enAttenteImpression: 3, statut: 'ANNULE' as StatutOrdre };
    expect(mentionAttenteHorsListe(liste)).toBe("3 ordres en attente d'impression ne sont pas dans la liste affichée.");
  });

  it("les états proposés sont exactement ceux de l'énumération Prisma", () => {
    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const debut = schema.indexOf('enum StatutOrdreVirement {');
    expect(debut).toBeGreaterThan(0);
    const corps = schema.slice(debut, schema.indexOf('}', debut));
    const valeurs = [...corps.matchAll(/^\s*([A-Z_]+)\s*$/gm)].map((m) => m[1]);
    expect(valeurs.length).toBeGreaterThan(0);
    expect(new Set(Object.keys(LIBELLE_STATUT_ORDRE))).toEqual(new Set(valeurs));
  });
});
