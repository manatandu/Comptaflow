import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';

/**
 * MENTIONS DE L'ARTICLE 17 DE L'AUSCGIE (point 16 de la comparaison Sage i7).
 *
 * Le manuel Sage i7 porte le capital, le courriel et le site dans son exemple
 * d'identification de la société, sans rien en dire de plus. La règle qui
 * donne son poids au capital est dans l'AUSCGIE, art. 17 : « La dénomination
 * sociale doit figurer sur tous les actes et documents émanant de la société
 * et destinés aux tiers, notamment les lettres, les factures, les annonces et
 * publications diverses. Elle doit être précédée ou suivie immédiatement en
 * caractères lisibles de l'indication de la forme de la société, du montant
 * de son capital social, de l'adresse de son siège social et de la mention de
 * son numéro d'immatriculation au registre du commerce et du crédit
 * mobilier. » L'art. 891-1, 2° punit les dirigeants qui, sciemment, ne le font
 * pas. Et l'art. 269-2 ajoute à la forme les mots « à capital variable » quand
 * les statuts usent de la faculté de l'art. 269-1.
 *
 * LE PÉRIMÈTRE EST CELUI DES SOCIÉTÉS COMMERCIALES DE L'ART. 6, ET DE ELLES
 * SEULES. L'art. 17 est au chapitre de la « dénomination sociale » des
 * sociétés. Une ASBL n'a pas de capital social, une personne physique non
 * plus ; le GIE, la coopérative, la succursale et l'entité publique relèvent
 * d'autres textes que ce module n'a pas lus · la ligne ne leur est pas
 * reprochée, et le capital leur reste saisissable sans être exigé.
 */

export const FORMES_SOCIETES_COMMERCIALES: FormeJuridiqueSyscohada[] = [
  FormeJuridiqueSyscohada.SOCIETE_ANONYME,
  FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
  FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
  FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
  FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE,
];

const FORME_SOCIALE: Partial<Record<FormeJuridiqueSyscohada, string>> = {
  SOCIETE_ANONYME: 'Société anonyme',
  SOCIETE_PAR_ACTIONS_SIMPLIFIEE: 'Société par actions simplifiée',
  SOCIETE_RESPONSABILITE_LIMITEE: 'Société à responsabilité limitée',
  SOCIETE_NOM_COLLECTIF: 'Société en nom collectif',
  SOCIETE_COMMANDITE_SIMPLE: 'Société en commandite simple',
};

/** Pourquoi le dossier ne peut pas porter de capital social, ou null s'il le peut. */
export function motifRefusCapital(referentiel: Referentiel, forme: FormeJuridiqueSyscohada | null): string | null {
  if (referentiel === Referentiel.SYCEBNL) {
    return "Une entité à but non lucratif n'a pas de capital social · ses fonds propres se lisent au compte 10 (dotation), pas dans un capital.";
  }
  if (forme && FORMES_PERSONNES_PHYSIQUES.includes(forme)) {
    return "Un commerçant personne physique ou un entreprenant n'a pas de capital social · il n'y a pas de société.";
  }
  return null;
}

export interface IdentiteSociete {
  referentiel: Referentiel;
  formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null;
  nom: string;
  capitalSocial: number | null;
  capitalVariable: boolean;
  adresse: string | null;
  ville: string | null;
  rccm: string | null;
  devise: string | null;
}

export interface MentionsSociete {
  /** La ligne à imprimer à côté de la dénomination, ou null hors du périmètre. */
  ligne: string | null;
  /** Les mentions de l'art. 17 que le dossier ne porte pas encore. */
  manquantes: string[];
}

const montant = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/ | /g, ' ');

/**
 * La ligne de l'art. 17, et ce qui y manque. Une mention absente n'est pas
 * remplacée · la ligne s'imprime avec ce qui est connu et le manque se DIT,
 * parce qu'une ligne complète en apparence se lirait comme conforme.
 */
export function mentionsArticle17(t: IdentiteSociete): MentionsSociete {
  if (t.referentiel !== Referentiel.SYSCOHADA || !t.formeJuridiqueSyscohada) return { ligne: null, manquantes: [] };
  if (!FORMES_SOCIETES_COMMERCIALES.includes(t.formeJuridiqueSyscohada)) return { ligne: null, manquantes: [] };

  const morceaux: string[] = [];
  const manquantes: string[] = [];
  const forme = FORME_SOCIALE[t.formeJuridiqueSyscohada]!;
  morceaux.push(t.capitalVariable ? `${forme} à capital variable` : forme);
  if (t.capitalSocial !== null) {
    morceaux.push(`au capital de ${montant(t.capitalSocial)} ${t.devise ?? ''}`.trim());
  } else {
    manquantes.push('montant du capital social');
  }
  const siege = [t.adresse, t.ville].filter((v) => v && v.trim() !== '').join(', ');
  if (siege) morceaux.push(`siège social : ${siege}`);
  else manquantes.push('adresse du siège social');
  if (t.rccm) morceaux.push(`RCCM ${t.rccm}`);
  else manquantes.push("numéro d'immatriculation au RCCM");
  return { ligne: morceaux.join(' · '), manquantes };
}
