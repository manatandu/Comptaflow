/**
 * POURQUOI LE GROUPE ÉLIMINE SES OPÉRATIONS INTERNES · et le texte qui le
 * fonde, qui n'est pas le même des deux côtés.
 *
 * Le groupe d'établissements est UNE SEULE personne morale tenue en plusieurs
 * dossiers. Le D4C (Titres XII et XIII) n'en est pas le fondement · il régit la
 * consolidation et la combinaison d'entités DISTINCTES, et l'art. 3 du SYCEBNL
 * écarte les art. 73 à 113 de l'AUDCIF qu'il développe. Sa méthode reste une
 * référence EMPRUNTÉE côté SYSCOHADA, dite comme telle, jamais citée à une
 * association (passe R4, constats C22 et C23).
 *
 * - SYSCOHADA · la fiche du COMPTE 18 (AUDCIF Titre VII) · les opérations entre
 *   le siège et l'établissement sont enregistrées « comme s'il s'agissait d'un
 *   tiers », et « les comptes de liaison sont égaux et de sens contraire dans
 *   les deux comptabilités ».
 * - SYCEBNL · le postulat de l'entité (cadre conceptuel § 3.3.1.1.2) · « ce sont
 *   les transactions de l'entité […] qui sont prises en compte dans les états
 *   financiers de l'entité ».
 */
export function fondementEliminationGroupe(syscohada: boolean): string {
  return syscohada
    ? 'le groupe est une seule entité, dont les opérations entre le siège et ses établissements sont enregistrées « comme s’il ' +
        's’agissait d’un tiers » (AUDCIF Titre VII, compte 18) · la méthode du D4C (ch. XII-5, XIII-4), qui vise des entités ' +
        'distinctes, n’est qu’une référence empruntée'
    : 'le groupe est une seule entité, et « ce sont les transactions de l’entité » que ses états financiers retiennent ' +
        '(SYCEBNL, cadre conceptuel § 3.3.1.1.2, postulat de l’entité) · une opération entre deux de ses cellules n’est pas conclue avec un tiers';
}
