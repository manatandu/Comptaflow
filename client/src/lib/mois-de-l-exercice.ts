/**
 * LES MOIS D'UN EXERCICE, LUS EN UTC.
 *
 * Un exercice commence et finit à minuit UTC (le serveur les pose par
 * `Date.UTC`), comme tout jour du dépôt (audit final F81). La saisie découpait
 * l'exercice en mois, et l'en-tête d'impression comptait sa durée, à l'heure
 * du POSTE · à l'ouest de Greenwich, l'ouverture au 1er janvier tombait le
 * 31 décembre la veille, la saisie proposait décembre de l'année d'avant, et
 * l'imprimé annonçait treize mois pour un exercice de douze.
 */

export interface MoisDeSaisie {
  annee: number;
  /** 0 à 11, comme `Date.getUTCMonth`. */
  mois: number;
  libelle: string;
}

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Chaque mois que l'exercice touche, dans l'ordre (« Janvier 2027 »). */
export function periodesDeLExercice(dateDebut: string, dateFin: string): MoisDeSaisie[] {
  const debut = new Date(dateDebut);
  const fin = new Date(dateFin);
  const dernier = fin.getUTCFullYear() * 12 + fin.getUTCMonth();
  const periodes: MoisDeSaisie[] = [];
  for (let rang = debut.getUTCFullYear() * 12 + debut.getUTCMonth(); rang <= dernier; rang++) {
    const annee = Math.floor(rang / 12);
    const mois = rang % 12;
    periodes.push({ annee, mois, libelle: `${MOIS_FR[mois]} ${annee}` });
  }
  return periodes;
}

/**
 * La durée en MOIS ENTAMÉS, bornes comprises (« Durée (en mois) » de
 * l'en-tête du § 7.4) · un exercice du 01/01 au 31/12 fait douze mois, un
 * premier exercice ouvert au 01/09 en fait quatre.
 */
export function dureeEnMois(dateDebut: string, dateFin: string): number {
  return periodesDeLExercice(dateDebut, dateFin).length;
}
