import { JeuNotesAnnexes } from '@prisma/client';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { NOTES_PROJETS } from './correspondance-notes-projets';
import { NOTES_SYSCOHADA_1 } from '../etats-financiers-syscohada/correspondance-notes-syscohada-1';
import { NOTES_SYSCOHADA_2 } from '../etats-financiers-syscohada/correspondance-notes-syscohada-2';
import { NOTES_SYSCOHADA_3 } from '../etats-financiers-syscohada/correspondance-notes-syscohada-3';
import type { SpecificationNote } from './note-annexe.types';

/**
 * GARDE-FOU DE LA SAISIE DES NOTES · commun aux trois jeux.
 *
 * Une rubrique `saisie: true` est renseignée hors comptabilité et son contenu
 * est STOCKÉ (`SaisieNote`, table `saisies_notes`). Le stockage s'ancre sur
 * deux repères et sur eux seuls : la CLÉ de la rubrique et le RANG de la
 * colonne. Ce que ce fichier verrouille, c'est la stabilité de ces deux
 * repères · leur dérive n'aurait aucune conséquence visible à l'exécution,
 * elle ferait simplement disparaître, sans erreur ni message, un texte
 * d'annexe rédigé par le cabinet.
 */
const JEUX: [JeuNotesAnnexes, SpecificationNote[]][] = [
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS, NOTES_ASSOCIATIONS],
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT, NOTES_PROJETS],
  [JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL, [...NOTES_SYSCOHADA_1, ...NOTES_SYSCOHADA_2, ...NOTES_SYSCOHADA_3]],
];

const etiquette = (n: SpecificationNote) => (n.sousTableau ? `${n.code}|${n.sousTableau}` : n.code);

/**
 * NOMBRE DE COLONNES GELÉ, par tableau qui porte au moins une rubrique en
 * saisie. La colonne est stockée par son RANG · une colonne insérée au milieu
 * décalerait toutes les saisies déjà enregistrées d'un cran vers la droite.
 *
 * Les colonnes viennent de la maquette officielle et ne bougent pas sans
 * révision du référentiel ; une correction de transcription, elle, arrive.
 * D'où ce gel : le jour où un nombre change, la migration des saisies déjà
 * en base doit être décidée EN MÊME TEMPS, pas découverte après coup.
 */
const COLONNES_GELEES: Record<JeuNotesAnnexes, Record<string, number>> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: {
    '18B': 2,
    '1|ENGAGEMENTS FINANCIERS': 3,
    '5G': 5,
    '2': 1,
    '3': 1,
    '4': 1,
    '5H': 4,
    '29B|PERSONNEL PROPRE': 8,
    '29B|PERSONNEL EXTERIEUR ET BENEVOLE': 1,
    '33': 4,
    '34': 1,
    '35': 8,
  },
  PROJETS_DEVELOPPEMENT: {
    '1': 1,
    '2': 1,
    '9': 1,
    '20B|PERSONNEL PROPRE': 8,
    '20B|PERSONNEL EXTERIEUR ET BENEVOLE': 1,
    '22': 1,
    '24': 8,
  },
  SYSCOHADA_SYSTEME_NORMAL: {
    '1|ENGAGEMENTS FINANCIERS': 2,
    '2': 1,
    '3B': 8,
    '3C': 4,
    '3D': 5,
    '3E': 3,
    '3F': 3,
    '4|LISTE DES FILIALES ET PARTICIPATIONS': 6,
    '13': 6,
    '16B|HYPOTHÈSES ACTUARIELLES': 2,
    '16B|VARIATION DE LA VALEUR DE L\'ENGAGEMENT DE RETRAITE AU COURS DE L\'EXERCICE': 2,
    '16B|ANALYSE DE SENSIBILITÉ DES HYPOTHÈSES ACTUARIELLES': 4,
    '16B bis|ACTIF/PASSIF NET COMPTABILISÉ AU TITRE DES RÉGIMES FINANCÉS': 2,
    '16B bis|VALEUR ACTUELLE DES ACTIFS DU RÉGIME': 4,
    '16C|ACTIF ÉVENTUEL': 2,
    '16C|PASSIF ÉVENTUEL': 2,
    '27B|1. Personnel propre': 16,
    '27B|2. Personnel extérieur': 16,
    '31': 5,
    '32': 15,
    '33': 9,
    '34': 3,
    '35': 1,
    '36': 2,
  },
};

describe('rubriques de notes en saisie · ancrage du stockage', () => {
  it.each(JEUX)('%s · toute rubrique en saisie porte une clé', (_jeu, table) => {
    const sansCle = table.flatMap((n) =>
      n.rubriques.filter((r) => r.saisie && !r.cle).map((r) => `${etiquette(n)} :: ${r.libelle}`),
    );
    // Sans clé, la saisie du dossier n'a pas où s'accrocher : elle serait
    // écrite sous une ancre vide, donc confondue avec celle de la rubrique
    // voisine sans clé de la même note.
    expect(sansCle).toEqual([]);
  });

  it.each(JEUX)('%s · les clés sont uniques DANS UN CODE, sous-tableaux compris', (_jeu, table) => {
    // L'ancre est le couple (code, clé) et non (tableau, clé) : la note 1
    // aligne trois tableaux sous un seul code, la 16C deux. Deux rubriques
    // homonymes de deux sous-tableaux écriraient l'une par-dessus l'autre ·
    // c'était le cas de « Litiges » entre l'actif et le passif éventuels de
    // la note 16C, corrigé le 2026-09-03.
    const vues = new Map<string, string>();
    const collisions: string[] = [];
    for (const n of table) {
      for (const r of n.rubriques) {
        if (!r.cle) continue;
        const ancre = `${n.code}::${r.cle}`;
        if (vues.has(ancre)) collisions.push(`${ancre} · ${vues.get(ancre)} et ${etiquette(n)}`);
        vues.set(ancre, etiquette(n));
      }
    }
    expect(collisions).toEqual([]);
  });

  it.each(JEUX)('%s · une rubrique en saisie n’ouvre jamais un rattachement', (_jeu, table) => {
    // `NoteAnnexeService.rubriqueRattachable` n'accepte que
    // `subdivisionAttendue`. Une rubrique qui porterait les deux serait à la
    // fois saisie à la main et chiffrée par des comptes rattachés · deux
    // sources pour une même cellule, et rien pour dire laquelle prime.
    const ambigues = table.flatMap((n) =>
      n.rubriques.filter((r) => r.saisie && r.subdivisionAttendue).map((r) => `${etiquette(n)} :: ${r.libelle}`),
    );
    expect(ambigues).toEqual([]);
  });

  it.each(JEUX)('%s · le nombre de colonnes des tableaux en saisie est celui qui est gelé', (jeu, table) => {
    const reel: Record<string, number> = {};
    for (const n of table) {
      if (!n.rubriques.some((r) => r.saisie)) continue;
      reel[etiquette(n)] = n.colonnes.length;
    }
    expect(reel).toEqual(COLONNES_GELEES[jeu]);
  });
});
