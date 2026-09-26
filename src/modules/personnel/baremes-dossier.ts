import {
  BAREMES_INPP,
  BAREMES_ONEM,
  TAUX_CNSS,
  type BaremeInpp,
  type VersionCnss,
  type VersionsDuDossier,
} from './cotisations-paie';

/**
 * BARÈMES DE PAIE EN DONNÉES DATÉES (priorité 4 de la comparaison avec les
 * autres produits Sage, docs/comparaison-sage-i7-omegax.md).
 *
 * Sage Paie tient ses constantes et barèmes en table, et c'est le cabinet qui
 * les met à jour. La compétence `sage-i7` ne décrit que ce principe · la règle
 * ci-dessous est celle d'OmegaX, et l'aide le dit.
 *
 * CE QUI EST SERVI · les TAUX de cotisation, CNSS (décret n° 18/041), INPP
 * (arrêtés de 2006 et de 2025) et ONEM (arrêtés de 2018 et de 2025). Ce sont
 * les barèmes que l'Administration change par un texte bref, un article, sans
 * toucher à la structure du calcul.
 *
 * CE QUI NE L'EST PAS, ET POURQUOI · le SMIG et sa grille de dix-sept classes
 * (décret n° 25/22 et son annexe), parce que la grille distingue le taux PAYÉ
 * du taux FIXÉ et que son annexe se vérifie par une arithmétique close
 * (bareme-smig.ts) qu'une saisie ne porterait pas ; et les tranches de l'IRPP
 * (loi n° 23/053, art. 118), qui sont dans la loi et ne changent que par une
 * loi. Un barème faux sur ces deux-là fausse l'impôt ou le minimum légal de
 * tout le parc.
 *
 * TROIS RÈGLES.
 *  1. UNE VERSION S'AJOUTE, ELLE NE REMPLACE RIEN · les versions livrées dans
 *     le code ne se modifient ni ne s'antidatent, et une version du cabinet
 *     vient APRÈS la dernière connue du même barème. Insérer une version entre
 *     deux autres réécrirait en silence le taux d'une période déjà payée.
 *  2. LE TEXTE QUI LA FONDE EST OBLIGATOIRE, et il voyage avec chaque ligne de
 *     bulletin calculée sur elle, avec la réserve RESERVE_BAREME_CABINET ·
 *     OmegaX ne l'a pas lu.
 *  3. UN TAUX NUL EST REFUSÉ · un texte qui supprime une cotisation n'est pas
 *     un changement de taux, et un zéro saisi par erreur ferait disparaître la
 *     ligne de tous les bulletins sans que le net cesse d'être plausible.
 */

export type NomBareme = 'CNSS' | 'INPP' | 'ONEM';

export const BAREMES_SERVIS: readonly NomBareme[] = ['CNSS', 'INPP', 'ONEM'];

/**
 * La date du dernier texte livré, par barème. La CNSS n'a pas de date d'effet
 * lue (voir tauxCnss) · c'est la date du décret n° 18/041 lui-même qui sert de
 * borne, une version ne pouvant précéder le texte qu'elle remplace.
 */
export const DERNIERE_DATE_LIVREE: Record<NomBareme, string> = {
  CNSS: '2018-11-24',
  INPP: BAREMES_INPP[BAREMES_INPP.length - 1].aPartirDu,
  ONEM: BAREMES_ONEM[BAREMES_ONEM.length - 1].aPartirDu,
};

export type VersionSaisie = {
  bareme: string;
  aPartirDu: string;
  reference: string;
  valeurs: unknown;
};

const dateValide = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const tauxValide = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 100;

/** Les valeurs normalisées d'une version, ou le motif qui la refuse. */
export function lireValeurs(
  bareme: NomBareme,
  valeurs: unknown,
): { ok: true; valeurs: Record<string, unknown> } | { ok: false; motif: string } {
  const v = (valeurs ?? {}) as Record<string, unknown>;
  const refusTaux = "Chaque taux est un pourcentage strictement positif et au plus égal à 100 · un texte qui supprime une cotisation n'est pas un changement de taux.";
  if (bareme === 'CNSS') {
    const cles = ['prestationsAuxFamilles', 'pensionsEmployeur', 'pensionsTravailleur', 'risquesProfessionnels'] as const;
    if (!cles.every((c) => tauxValide(v[c]))) return { ok: false, motif: `CNSS · les quatre taux sont obligatoires. ${refusTaux}` };
    return { ok: true, valeurs: Object.fromEntries(cles.map((c) => [c, v[c]])) };
  }
  if (bareme === 'ONEM') {
    if (!tauxValide(v.tauxPourCent)) return { ok: false, motif: `ONEM · ${refusTaux}` };
    return { ok: true, valeurs: { tauxPourCent: v.tauxPourCent } };
  }
  if (!tauxValide(v.publicPourCent)) return { ok: false, motif: `INPP · le taux des employeurs publics est obligatoire. ${refusTaux}` };
  const tranches = Array.isArray(v.priveParTranche) ? (v.priveParTranche as Record<string, unknown>[]) : [];
  if (tranches.length === 0) return { ok: false, motif: "INPP · au moins une tranche d'effectif pour le privé." };
  let borne = 0;
  for (let i = 0; i < tranches.length; i++) {
    const t = tranches[i];
    const derniere = i === tranches.length - 1;
    if (!tauxValide(t.tauxPourCent)) return { ok: false, motif: `INPP · tranche ${i + 1}. ${refusTaux}` };
    if (derniere) {
      // La dernière tranche est ouverte · sans elle, un employeur au-delà de
      // la dernière borne n'aurait aucun taux et l'INPP s'abstiendrait.
      if (t.jusqua !== null) return { ok: false, motif: "INPP · la dernière tranche est ouverte (« au-delà »), sans borne d'effectif." };
    } else {
      if (typeof t.jusqua !== 'number' || !Number.isInteger(t.jusqua) || t.jusqua <= borne) {
        return { ok: false, motif: `INPP · la borne de la tranche ${i + 1} est un effectif entier, supérieur à celle de la tranche précédente.` };
      }
      borne = t.jusqua;
    }
  }
  return {
    ok: true,
    valeurs: {
      publicPourCent: v.publicPourCent,
      priveParTranche: tranches.map((t) => ({ jusqua: t.jusqua ?? null, tauxPourCent: t.tauxPourCent })),
    },
  };
}

/**
 * Le motif qui refuse une version, ou null. `datesDuDossier` sont les dates
 * des versions du cabinet déjà enregistrées pour ce barème.
 */
export function motifRefusVersion(saisie: VersionSaisie, datesDuDossier: readonly string[]): string | null {
  if (!BAREMES_SERVIS.includes(saisie.bareme as NomBareme)) {
    return "Seuls les taux CNSS, INPP et ONEM se saisissent · le SMIG et le barème de l'IRPP restent ceux des textes lus par OmegaX.";
  }
  const bareme = saisie.bareme as NomBareme;
  if (!dateValide(saisie.aPartirDu)) return "La date d'effet est une date (AAAA-MM-JJ).";
  if (!saisie.reference || saisie.reference.trim().length < 8) {
    return "Le texte qui fonde la version est obligatoire · numéro, date et article. Il est porté sur chaque bulletin calculé avec ce taux.";
  }
  const dates = [DERNIERE_DATE_LIVREE[bareme], ...datesDuDossier].sort();
  const derniere = dates[dates.length - 1];
  if (saisie.aPartirDu <= derniere) {
    return (
      `Une version ${bareme} vient après la dernière connue, du ${derniere} · ` +
      "insérer une version entre deux autres réécrirait en silence le taux d'une période déjà payée."
    );
  }
  const lecture = lireValeurs(bareme, saisie.valeurs);
  return lecture.ok ? null : lecture.motif;
}

export type LigneVersion = { bareme: string; aPartirDu: string; reference: string; valeurs: unknown };

/** Les versions enregistrées, sous la forme que le moteur de cotisations lit. */
export function versionsDuDossier(lignes: readonly LigneVersion[]): VersionsDuDossier {
  const de = (b: NomBareme) => lignes.filter((l) => l.bareme === b);
  return {
    cnss: de('CNSS').map((l) => ({ ...(l.valeurs as object), aPartirDu: l.aPartirDu, reference: l.reference }) as VersionCnss),
    inpp: de('INPP').map((l) => ({ ...(l.valeurs as object), aPartirDu: l.aPartirDu, reference: l.reference }) as BaremeInpp),
    onem: de('ONEM').map((l) => ({ tauxPourCent: (l.valeurs as { tauxPourCent: number }).tauxPourCent, aPartirDu: l.aPartirDu, reference: l.reference })),
  };
}

/**
 * Les mois de paie couverts par une version · de son mois d'effet jusqu'au mois
 * qui précède la version suivante du même barème, sans fin s'il n'y en a pas.
 * Le moteur compare au PREMIER jour du mois (baremeDuMois) : une version datée
 * du 24 mord sur la paie de son propre mois.
 */
export function moisCouverts(aPartirDu: string, suivante: string | null): { depuis: string; avant: string | null } {
  return { depuis: aPartirDu.slice(0, 7), avant: suivante ? suivante.slice(0, 7) : null };
}

/** Les versions livrées, pour l'écran · jamais modifiables. */
export function versionsLivrees() {
  return {
    CNSS: [
      {
        aPartirDu: null as string | null,
        reference: 'Décret n° 18/041 du 24 novembre 2018, articles 2 à 4',
        valeurs: {
          prestationsAuxFamilles: TAUX_CNSS.prestationsAuxFamilles.tauxPourCent,
          pensionsEmployeur: TAUX_CNSS.pensionsEmployeur.tauxPourCent,
          pensionsTravailleur: TAUX_CNSS.pensionsTravailleur.tauxPourCent,
          risquesProfessionnels: TAUX_CNSS.risquesProfessionnels.tauxPourCent,
        } as Record<string, unknown>,
      },
    ],
    INPP: BAREMES_INPP.map((b) => ({
      aPartirDu: b.aPartirDu as string | null,
      reference: b.reference,
      valeurs: { publicPourCent: b.publicPourCent, priveParTranche: b.priveParTranche } as Record<string, unknown>,
    })),
    ONEM: BAREMES_ONEM.map((b) => ({
      aPartirDu: b.aPartirDu as string | null,
      reference: b.reference,
      valeurs: { tauxPourCent: b.tauxPourCent } as Record<string, unknown>,
    })),
  };
}
