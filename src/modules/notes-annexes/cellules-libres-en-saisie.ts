import type { ColonneNote, RubriqueNote, SpecificationNote } from './note-annexe.types';

/**
 * CELLULES LIBRE D'UNE RUBRIQUE CHIFFRÉE · la règle, écrite une fois.
 *
 * Une cellule CHIFFRÉE n'est jamais en saisie ; une cellule LIBRE d'une
 * rubrique chiffrée peut l'être. C'est la règle qui remplace « une rubrique
 * rattachable n'est jamais en saisie », trop large : elle laissait vides et
 * non modifiables les trois colonnes de sûretés réelles de la note 1, que le
 * texte veut renseignées (AUDCIF Titre VII, COMPTE 16, commentaires · « le
 * montant et la portée de la caution, de la garantie ou du gage doivent être
 * indiqués dans les Notes annexes » ; commentaire officiel de la note 1 des
 * deux référentiels · « indiquer la raison d'être des sûretés »). Une case
 * blanche sous « Hypothèques » se lit « aucune hypothèque ».
 *
 * Trois lecteurs la consultent · le calcul de la note (quelles cellules
 * servir), la porte d'écriture (`NoteAnnexeService.celluleSaisissable`) et,
 * par la colonne qu'elle qualifie, l'écran et l'export. Écrite deux fois,
 * elle aurait fini par proposer à l'écran une cellule que le serveur refuse.
 */

/**
 * La colonne se renseigne sur les lignes chiffrées : LIBRE ET déclarée
 * telle. Le type est relu ici, pas seulement à la transcription · une colonne
 * de montant qualifiée par erreur ne doit jamais devenir une seconde source
 * pour un chiffre que la balance porte.
 */
export function colonneLibreEnSaisie(colonne: ColonneNote): boolean {
  return colonne.type === 'LIBRE' && colonne.saisieSurLigneChiffree === true;
}

/**
 * La rubrique ouvre ses cellules LIBRE déclarées · chiffrée (pas `saisie`,
 * qui ouvre déjà tout), pourvue d'une `cle` (l'ancre du stockage
 * `SaisieNote` : sans elle, le texte n'aurait pas où s'accrocher) et PAS un
 * total. Un sous-total ou un total ne reçoit aucun texte : une sûreté se
 * rapporte à une dette, et un texte ne s'additionne pas · le recopier sur le
 * total le ferait valoir pour toutes les lignes, y compris celles qui n'en
 * ont aucune.
 */
export function celluleLibreEnSaisie(spec: SpecificationNote, rubrique: RubriqueNote): boolean {
  return (
    !rubrique.saisie &&
    rubrique.cle !== undefined &&
    rubrique.totalDeRubriques === undefined &&
    spec.colonnes.some(colonneLibreEnSaisie)
  );
}
