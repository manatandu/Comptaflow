import { JeuNotesAnnexes } from '@prisma/client';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { NOTES_PROJETS } from './correspondance-notes-projets';
import { NOTES_SYSCOHADA_1 } from '../etats-financiers-syscohada/correspondance-notes-syscohada-1';
import { NOTES_SYSCOHADA_2 } from '../etats-financiers-syscohada/correspondance-notes-syscohada-2';
import { NOTES_SYSCOHADA_3 } from '../etats-financiers-syscohada/correspondance-notes-syscohada-3';
import type { SpecificationNote } from './note-annexe.types';
import { celluleLibreEnSaisie, colonneLibreEnSaisie } from './cellules-libres-en-saisie';

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

/** Le tableau stocke des saisies : une rubrique en saisie, ou une colonne LIBRE ouverte sur ses lignes chiffrées. */
const stockeDesSaisies = (n: SpecificationNote) => n.rubriques.some((r) => r.saisie) || n.colonnes.some(colonneLibreEnSaisie);

/**
 * NOMBRE DE COLONNES GELÉ, par tableau qui porte au moins une rubrique en
 * saisie ou une colonne LIBRE saisie sur ses lignes chiffrées (passe O3). La colonne est stockée par son RANG · une colonne insérée au milieu
 * décalerait toutes les saisies déjà enregistrées d'un cran vers la droite.
 *
 * Les colonnes viennent de la maquette officielle et ne bougent pas sans
 * révision du référentiel ; une correction de transcription, elle, arrive.
 * D'où ce gel : le jour où un nombre change, la migration des saisies déjà
 * en base doit être décidée EN MÊME TEMPS, pas découverte après coup.
 */
const COLONNES_GELEES: Record<JeuNotesAnnexes, Record<string, number>> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: {
    '1|DETTES GARANTIES PAR DES SURETES REELLES': 5,
    '5C': 5,
    '17A': 7,
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
    '3B': 5,
    '10': 5,
    '2': 1,
    '9': 1,
    '20B|PERSONNEL PROPRE': 8,
    '20B|PERSONNEL EXTERIEUR ET BENEVOLE': 1,
    '22': 1,
    '24': 8,
  },
  SYSCOHADA_SYSTEME_NORMAL: {
    '1|DETTES GARANTIES PAR DES SÛRETÉS RÉELLES': 5,
    '1|ENGAGEMENTS FINANCIERS': 2,
    '2': 1,
    '3B': 8,
    '3C': 4,
    '3D': 5,
    '3E': 3,
    '3F': 3,
    '4|LISTE DES FILIALES ET PARTICIPATIONS': 6,
    '13': 6,
    '15A': 7,
    '15B': 6,
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
      if (!stockeDesSaisies(n)) continue;
      reel[etiquette(n)] = n.colonnes.length;
    }
    expect(reel).toEqual(COLONNES_GELEES[jeu]);
  });
});

/**
 * UNE CELLULE CHIFFRÉE N'EST JAMAIS EN SAISIE ; UNE CELLULE LIBRE D'UNE
 * RUBRIQUE CHIFFRÉE PEUT L'ÊTRE (passe O3, constat A1/D1). La règle d'avant,
 * « une rubrique rattachable n'est jamais en saisie », laissait blanches et
 * non modifiables les sûretés réelles de la note 1 · un blanc sous
 * « Hypothèques » se lit « aucune hypothèque ».
 */
describe('cellules LIBRE d’une rubrique chiffrée · ce qui s’ouvre et ce qui reste fermé', () => {
  it.each(JEUX)('%s · une colonne ouverte à la saisie est LIBRE, jamais la colonne « Note »', (_jeu, table) => {
    const fautives = table.flatMap((n) =>
      n.colonnes
        .filter((c) => c.saisieSurLigneChiffree && (c.type !== 'LIBRE' || /^note$/i.test(c.libelle)))
        .map((c) => `${etiquette(n)} :: ${c.libelle}`),
    );
    expect(fautives).toEqual([]);
  });

  it.each(JEUX)('%s · chaque ligne de détail d’un tableau ouvert porte sa clé, aucun total ne s’ouvre', (_jeu, table) => {
    // Sans clé, la cellule n'a pas d'ancre et reste blanche sans que rien ne
    // le dise ; un total ne reçoit aucun texte (une sûreté se rapporte à UNE
    // dette, et un texte ne s'additionne pas).
    const sansAncre: string[] = [];
    const totauxOuverts: string[] = [];
    for (const n of table) {
      if (!n.colonnes.some(colonneLibreEnSaisie)) continue;
      for (const r of n.rubriques) {
        if (r.totalDeRubriques && celluleLibreEnSaisie(n, r)) totauxOuverts.push(`${etiquette(n)} :: ${r.libelle}`);
        if (!r.totalDeRubriques && !r.saisie && !r.cle) sansAncre.push(`${etiquette(n)} :: ${r.libelle}`);
      }
    }
    expect({ sansAncre, totauxOuverts }).toEqual({ sansAncre: [], totauxOuverts: [] });
  });

  it('la note 1 ouvre ses trois colonnes de sûretés, et elles seules, dans les deux référentiels', () => {
    const ouvertes = (table: SpecificationNote[], sousTableau: string) =>
      table
        .find((n) => n.code === '1' && n.sousTableau === sousTableau)!
        .colonnes.map((c, i) => (colonneLibreEnSaisie(c) ? i : -1))
        .filter((i) => i >= 0);
    expect(ouvertes(NOTES_ASSOCIATIONS, 'DETTES GARANTIES PAR DES SURETES REELLES')).toEqual([2, 3, 4]);
    expect(ouvertes(NOTES_SYSCOHADA_1, 'DETTES GARANTIES PAR DES SÛRETÉS RÉELLES')).toEqual([2, 3, 4]);
  });

  it.each(JEUX)('%s · les clés du code 1 sont uniques sur ses sous-tableaux, dettes garanties comprises', (_jeu, table) => {
    // La note 1 aligne deux ou trois tableaux sous un seul code, et l'ancre
    // du stockage est (code, clé) : une clé de dette garantie homonyme d'une
    // clé d'engagement écrirait l'une par-dessus l'autre.
    const note1 = table.filter((n) => n.code === '1');
    const cles = note1.flatMap((n) => n.rubriques.map((r) => r.cle).filter(Boolean));
    expect(cles.length).toBe(new Set(cles).size);
  });

  it('la note 1 porte au moins deux sous-tableaux à clés · le test d’unicité ci-dessus mord', () => {
    for (const table of [NOTES_ASSOCIATIONS, NOTES_SYSCOHADA_1]) {
      const aCles = table.filter((n) => n.code === '1' && n.rubriques.some((r) => r.cle));
      expect(aCles.length).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * LISTE FERMÉE des colonnes LIBRE posées sur des rubriques chiffrées et qui
   * restent VIDES, chacune avec son motif. Une colonne LIBRE nouvelle sur une
   * ligne chiffrée fait tomber le test tant qu'on n'a pas décidé : la
   * saisir (`saisieSurLigneChiffree`), ou la laisser vide ici en disant
   * pourquoi.
   */
  const MOTIF_RENVOI = 'porte le renvoi de la ligne (`renvoi`), fixé par la spécification';
  const MOTIF_MONTANT = 'MONTANT mal typé : saisi sur une ligne chiffrée, il ferait une seconde source à côté de A/B/C/D';
  const MOTIF_DEVISE = 'une ligne par sens d’écart, pas par devise · le texte veut le détail par devise, que la saisie par ligne ne porte pas';
  const MOTIF_PAR_PERSONNE = 'le texte veut une ligne par membre ou apporteur ; la ligne chiffrée agrège par nature';
  const VIDES_MOTIVEES: Record<JeuNotesAnnexes, Record<string, string>> = {
    ASSOCIATIONS_ORDRES_PROFESSIONNELS: {
      '1|DETTES GARANTIES PAR DES SURETES REELLES :: Note': MOTIF_RENVOI,
      // Passe R6, constat B11, puis D6 et lot 14 · la 5A et la 5B n'ont
      // plus de sous-colonne LIBRE · le moteur sert les « Virements de poste
      // à poste » (mise en service d'un bien en cours, `VIREMENTS_*`) et la
      // « Suite à une réévaluation » (écriture du module, `REEVALUATION`).
      '5D :: D · Virements de poste à poste': MOTIF_MONTANT,
      '5E :: D · Virements de poste à poste': MOTIF_MONTANT,
      '14 :: Devises': MOTIF_DEVISE,
      '14 :: Montant en devises': MOTIF_DEVISE,
      '14 :: Cours UML Année acquisition': MOTIF_DEVISE,
      '14 :: Cours UML 31/12': MOTIF_DEVISE,
      '15 :: Nom et prénoms des membres': MOTIF_PAR_PERSONNE,
      '15 :: Nationalité': MOTIF_PAR_PERSONNE,
      '15 :: Préciser avec ou sans droit de reprise':
        'se lit au compte (renvoi officiel de la note : 101 sans droit de reprise, 102 avec), et le texte veut une ligne par membre',
      '17A :: Note': MOTIF_RENVOI,
      '17B :: Note': MOTIF_RENVOI,
    },
    PROJETS_DEVELOPPEMENT: {
      // Même lecture que les 5A et 5B des associations · virements (D6) et
      // réévaluation (lot 14) de la 3A sont servis par le moteur.
      '8 :: Devises': MOTIF_DEVISE,
      '8 :: Montant en devises': MOTIF_DEVISE,
      '8 :: Cours UML Année acquisition': MOTIF_DEVISE,
      '8 :: Cours UML 31/12': MOTIF_DEVISE,
      '8 :: Variation en %': MOTIF_DEVISE,
    },
    SYSCOHADA_SYSTEME_NORMAL: {
      '1|DETTES GARANTIES PAR DES SÛRETÉS RÉELLES :: Note': MOTIF_RENVOI,
      // Les virements de poste à poste des 3A et 3B sont servis depuis la
      // décision D6 (2026-10-01), la réévaluation depuis le lot 14.
      '12|ÉCARTS DE CONVERSION :: Devises': MOTIF_DEVISE,
      '12|ÉCARTS DE CONVERSION :: Montant en devises': MOTIF_DEVISE,
      '12|ÉCARTS DE CONVERSION :: Cours UML Année acquisition': MOTIF_DEVISE,
      '12|ÉCARTS DE CONVERSION :: Cours UML 31/12': MOTIF_DEVISE,
      '13 :: Nom et prénoms': MOTIF_PAR_PERSONNE,
      '13 :: Nationalité': MOTIF_PAR_PERSONNE,
      '13 :: Nature des actions ou parts (Ordinaires ou préférences)': MOTIF_PAR_PERSONNE,
      '13 :: Nombre': MOTIF_PAR_PERSONNE,
      "13 :: Cessions ou remboursements en cours d'exercice": MOTIF_MONTANT,
      '15A :: NOTE': MOTIF_RENVOI,
      '15B :: NOTE': MOTIF_RENVOI,
    },
  };

  it.each(JEUX)('%s · toute colonne LIBRE d’un tableau chiffré est ouverte, ou vide sous un motif écrit', (jeu, table) => {
    const videsReelles: string[] = [];
    for (const n of table) {
      if (!n.rubriques.some((r) => !r.saisie && !r.totalDeRubriques)) continue;
      for (const c of n.colonnes) {
        if (c.type === 'LIBRE' && !colonneLibreEnSaisie(c)) videsReelles.push(`${etiquette(n)} :: ${c.libelle}`);
      }
    }
    expect(videsReelles.sort()).toEqual(Object.keys(VIDES_MOTIVEES[jeu]).sort());
  });
});
