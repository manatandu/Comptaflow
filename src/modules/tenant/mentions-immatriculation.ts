import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import { FORMES_SOCIETES_COMMERCIALES } from './mentions-societe';

/**
 * L'IMMATRICULATION IMPRIMÉE · AUDCG, et elle ne se réduit pas à l'art. 17 de
 * l'AUSCGIE (passe O2, 2026-09-28).
 *
 * - Art. 14 · « Les livres de commerce doivent mentionner le numéro
 *   d'immatriculation au Registre du Commerce et du Crédit Mobilier. »
 * - Art. 59 · « Toute personne immatriculée est tenue d'indiquer sur ses
 *   factures, bons de commande, tarifs, documents commerciaux et
 *   correspondance son numéro et son lieu d'immatriculation. »
 * - Art. 62 · l'entreprenant mentionne son NUMÉRO DE DÉCLARATION D'ACTIVITÉ,
 *   « suivi de l'indication du RCCM et de la mention "Entreprenant dispensé
 *   d'immatriculation" » ; l'art. 64 lui interdit d'être en même temps
 *   immatriculé.
 * - Art. 140 · le locataire-gérant indique « en tête de ses bons de commande,
 *   factures et autres documents à caractère financier ou commercial, avec
 *   son numéro d'immatriculation au RCCM, sa qualité de locataire-gérant du
 *   fonds », sous sanction pénale.
 *
 * QUI EST IMMATRICULÉ · l'art. 35, 1° · commerçants personnes physiques,
 * sociétés commerciales, GIE, succursales, et les établissements publics à
 * activité économique « bénéficiant de l'autonomie juridique et financière ».
 * La coopérative ne l'est pas (Registre des Sociétés Coopératives, AUSCOOP
 * art. 74) · sa ligne est celle de l'AUSCOOP art. 19, que `mentionsEmetteur`
 * compose (`mentionsCooperative`), jamais une ligne de l'AUDCG. Pour l'entité publique et « autre », le texte dépend de faits que
 * le dossier ne dit pas · le numéro s'imprime s'il est saisi, son absence
 * n'est pas reprochée.
 *
 * LE LIEU · lecture d'OmegaX, déclarée · le numéro du RCCM congolais porte le
 * greffe qui l'a attribué (« CD/KIN/RCCM/… »), et le numéro est donc imprimé
 * tel que saisi, sans champ de lieu séparé.
 */

// Lue à l'appel, jamais au chargement · `mentions-societe.ts` importe ce
// module, et une liste composée au chargement y lirait un import circulaire
// encore vide.
const estImmatriculeeObligatoirement = (forme: FormeJuridiqueSyscohada) =>
  FORMES_SOCIETES_COMMERCIALES.includes(forme) ||
  forme === FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE ||
  forme === FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE ||
  forme === FormeJuridiqueSyscohada.SUCCURSALE;

export interface IdentiteImmatriculation {
  referentiel: Referentiel;
  formeJuridiqueSyscohada: FormeJuridiqueSyscohada | null;
  rccm: string | null;
  numeroDeclarationActivite?: string | null;
  /** Art. 140 · null, pas encore dit. */
  locataireGerantFonds?: boolean | null;
  /** AUSCOOP art. 74 · le registre de la coopérative, qui n'est pas le RCCM. */
  numeroRegistreCooperatives?: string | null;
}

export interface MentionImmatriculation {
  /** À imprimer, ou null. */
  ligne: string | null;
  /** Ce que le texte exige et que le dossier ne porte pas. */
  manquantes: string[];
}

export const MENTION_ENTREPRENANT = 'Entreprenant dispensé d’immatriculation';

export function mentionImmatriculation(t: IdentiteImmatriculation): MentionImmatriculation {
  if (t.referentiel !== Referentiel.SYSCOHADA || !t.formeJuridiqueSyscohada) return { ligne: null, manquantes: [] };
  const forme = t.formeJuridiqueSyscohada;
  const renseigne = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

  if (forme === FormeJuridiqueSyscohada.ENTREPRENANT) {
    const n = renseigne(t.numeroDeclarationActivite);
    return n
      ? { ligne: `N° de déclaration d’activité ${n} (RCCM) · ${MENTION_ENTREPRENANT}`, manquantes: [] }
      : { ligne: MENTION_ENTREPRENANT, manquantes: ['numéro de déclaration d’activité (AUDCG art. 62)'] };
  }
  if (forme === FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE) return { ligne: null, manquantes: [] };

  const rccm = renseigne(t.rccm);
  const morceaux: string[] = [];
  const manquantes: string[] = [];
  if (t.locataireGerantFonds === true) morceaux.push('Locataire-gérant du fonds de commerce');
  if (rccm) morceaux.push(`RCCM ${rccm}`);
  else if (estImmatriculeeObligatoirement(forme) || t.locataireGerantFonds === true) {
    manquantes.push('numéro et lieu d’immatriculation au RCCM (AUDCG art. 59)');
  }
  return { ligne: morceaux.length ? morceaux.join(' · ') : null, manquantes };
}

/**
 * Le segment des livres de commerce (art. 14) · le numéro, ou le manque DIT,
 * jamais un blanc qui se lirait comme un dossier qui n'a rien à déclarer.
 */
export function immatriculationDesLivres(t: IdentiteImmatriculation): string {
  const m = mentionImmatriculation(t);
  if (m.manquantes.length === 0) return m.ligne ?? '';
  if (t.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.ENTREPRENANT) {
    return `N° de déclaration d’activité non renseigné · ${MENTION_ENTREPRENANT}`;
  }
  return `${m.ligne ? `${m.ligne} · ` : ''}RCCM non renseigné`;
}

/**
 * La case du registre de la liasse (fiche d'identification) · le RCCM d'une
 * personne immatriculée, le numéro de déclaration d'activité de
 * l'entreprenant et celui de la coopérative NOMMÉS comme tels · jamais l'un
 * imprimé pour l'autre (AUDCG art. 64, AUSCOOP art. 77).
 */
export function numeroRegistreLiasse(t: IdentiteImmatriculation): string {
  if (t.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.ENTREPRENANT) {
    const n = t.numeroDeclarationActivite?.trim();
    return n ? `N° de déclaration d’activité ${n} · ${MENTION_ENTREPRENANT}` : '';
  }
  // AUSCOOP art. 74 et 77 · la coopérative porte son numéro au Registre des
  // Sociétés Coopératives, NOMMÉ comme tel · la case ZE est générique
  // (« N° REGISTRE (RCCM, F92, CONVENTION...) »), le registre se dit donc.
  if (t.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE) {
    const n = t.numeroRegistreCooperatives?.trim();
    return n ? `Registre des Sociétés Coopératives n° ${n}` : '';
  }
  return t.rccm?.trim() ?? '';
}
