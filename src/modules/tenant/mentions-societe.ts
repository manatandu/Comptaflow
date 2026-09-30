import { FormeJuridiqueEbnl, FormeJuridiqueSyscohada, Referentiel, VarianteCooperative } from '@prisma/client';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';
import { mentionImmatriculation } from './mentions-immatriculation';

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
 * plus ; le GIE, la coopérative, la succursale et l'entité publique ne portent
 * pas la ligne de l'art. 17, et le capital leur reste saisissable sans être
 * exigé. L'IMMATRICULATION du GIE, de la succursale et de l'entité publique
 * s'imprime · AUDCG art. 14, 59, 62 et 140, `mentions-immatriculation.ts`
 * (passe O2). `mentionsEmetteur` réunit les deux.
 *
 * DEUX AUTRES TEXTES PRENNENT LE RELAIS, parce qu'une règle hors de son
 * périmètre rend « pas de réponse » et qu'une liste de manques vide se lit
 * comme conforme (passe O6, D1) ·
 *
 * - la COOPÉRATIVE n'est ni au RCCM ni sous l'art. 17 · l'AUSCOOP art. 19
 *   al. 3 lui impose sa propre ligne, « l'indication de la forme de la
 *   société coopérative, de l'adresse de son siège social et de la mention de
 *   son numéro d'immatriculation au registre des sociétés coopératives », la
 *   forme étant l'expression et le sigle de l'art. 205 (SCOOPS) ou 268
 *   (COOP-CA). Pas de capital · l'art. 19 ne le demande pas. Dissoute, elle
 *   ajoute « société en liquidation » et le nom du ou des liquidateurs
 *   (art. 183) ;
 * - l'ASBL DE DROIT CONGOLAIS · loi n° 004/2001, art. 16 : « Tous les actes,
 *   factures, annonces, publications et autres pièces émanant de
 *   l'association sans but lucratif doivent mentionner la dénomination
 *   sociale précédée ou suivie immédiatement de ces mots écrits lisiblement
 *   en toute lettre : « association sans but lucratif » en sigle
 *   « A.S.B.L. ». » L'article est à la Section I du Chapitre II (ASBL de droit
 *   congolais) · l'ONG (art. 35) et l'association confessionnelle (art. 48)
 *   sont des ASBL, l'établissement d'utilité publique (Titre II), l'unité de
 *   gestion de projet et l'entité de droit étranger (Section II) ne sont pas
 *   visés.
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

/**
 * AUSCGIE art. 269-1 · la clause de variabilité n'est ouverte qu'aux
 * « sociétés anonymes ne faisant pas appel public à l'épargne et sociétés par
 * actions simplifiées ». L'appel public à l'épargne n'est pas tenu sur le
 * dossier · il est rappelé à l'écran, jamais déduit.
 */
export const FORMES_CAPITAL_VARIABLE: FormeJuridiqueSyscohada[] = [
  FormeJuridiqueSyscohada.SOCIETE_ANONYME,
  FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
];

/**
 * Pourquoi le dossier ne peut pas se déclarer « à capital variable », ou null.
 * Refusé aux seules sociétés commerciales que l'art. 269-1 n'admet pas (SARL,
 * SNC, SCS) · la coopérative, dont le capital EST variable par la loi
 * (AUSCOOP art. 52), n'est pas visée, et les autres formes n'impriment pas la
 * ligne de l'art. 17.
 */
export function motifRefusCapitalVariable(forme: FormeJuridiqueSyscohada | null): string | null {
  if (forme && FORMES_SOCIETES_COMMERCIALES.includes(forme) && !FORMES_CAPITAL_VARIABLE.includes(forme)) {
    return "Le capital variable n'est ouvert qu'à la société anonyme ne faisant pas appel public à l'épargne et à la société par actions simplifiée (AUSCGIE art. 269-1).";
  }
  return null;
}

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
  /** AUDCG art. 62 · l'entreprenant, qui n'est pas immatriculé (art. 64). */
  numeroDeclarationActivite?: string | null;
  /** AUDCG art. 140 · null, pas encore dit. */
  locataireGerantFonds?: boolean | null;
  /** Loi n° 004/2001, art. 16 · forme de l'EBNL et droit étranger (SYCEBNL). */
  formeJuridique?: FormeJuridiqueEbnl | null;
  droitEtranger?: boolean | null;
  /** AUSCOOP art. 19, 74 · numéro au Registre des Sociétés Coopératives. */
  numeroRegistreCooperatives?: string | null;
  /** AUSCOOP art. 205 et 268 · null, pas encore dit. */
  varianteCooperative?: VarianteCooperative | null;
  /** AUSCGIE art. 386 et 414 · SA seule ; null ou absent, pas encore dit. */
  modeAdministrationSa?: 'CONSEIL_ADMINISTRATION' | 'ADMINISTRATEUR_GENERAL' | null;
  /** AUSCGIE art. 853-2 al. 2 · SAS seule ; null ou absent, pas encore dit. */
  associeUniqueSas?: boolean | null;
  /** AUSCGIE art. 203 et 204, AUSCOOP art. 183 · null tant qu'aucune dissolution n'est déclarée. */
  dateDissolution?: Date | null;
  liquidateurs?: string | null;
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
 * LE SIÈGE, ET CE QUI EN FAIT UNE ADRESSE. AUSCGIE art. 25 · le siège « doit
 * être localisé par une adresse ou une indication géographique suffisamment
 * précise ». Une ville seule ne l'est pas · elle s'imprime avec ce qui est
 * connu, mais l'adresse reste DITE manquante (même lecture pour l'AUSCOOP
 * art. 19, « l'adresse de son siège social »). Aucune détection de boîte
 * postale · la précision ne se juge pas à la machine.
 */
function ligneSiege(t: Pick<IdentiteSociete, 'adresse' | 'ville'>): { texte: string; adresse: boolean } {
  const renseigne = (v: string | null) => !!v && v.trim() !== '';
  return {
    texte: [t.adresse, t.ville].filter((v) => renseigne(v)).join(', '),
    adresse: renseigne(t.adresse),
  };
}

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
  let forme = FORME_SOCIALE[t.formeJuridiqueSyscohada]!;
  // LA FORME SOCIALE, ET CE QUE SON PROPRE LIVRE Y AJOUTE.
  //  · SA · « les mots "société anonyme" ou le sigle "S.A." et du mode
  //    d'administration de la société tel que prévu à l'article 414 »
  //    (art. 386) · non déclaré, le manque se DIT, jamais un mode présumé
  //    (passe O1b, B1) ;
  //  · SAS · « Lorsque la société ne comprend qu'un associé […] "société par
  //    actions simplifiée unipersonnelle" ou le sigle "SASU" » (art. 853-2,
  //    al. 2 · passe O1b, G6).
  if (t.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.SOCIETE_ANONYME) {
    if (t.modeAdministrationSa === 'CONSEIL_ADMINISTRATION') forme = 'Société anonyme avec conseil d’administration';
    else if (t.modeAdministrationSa === 'ADMINISTRATEUR_GENERAL') forme = 'Société anonyme avec administrateur général';
    else manquantes.push('mode d’administration de la société anonyme (AUSCGIE art. 386 et 414)');
  }
  if (t.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE) {
    if (t.associeUniqueSas === true) forme = 'Société par actions simplifiée unipersonnelle';
    else if (t.associeUniqueSas !== false) manquantes.push('associé unique ou non (AUSCGIE art. 853-2)');
  }
  // Art. 269-2 · « si la société use de la faculté accordée par l'article
  // 269-1 », que seules la SA et la SAS ont. Un drapeau hérité sur une autre
  // forme n'est pas imprimé · il est DIT, pour être retiré.
  const variableAdmis = FORMES_CAPITAL_VARIABLE.includes(t.formeJuridiqueSyscohada);
  morceaux.push(t.capitalVariable && variableAdmis ? `${forme} à capital variable` : forme);
  if (t.capitalVariable && !variableAdmis) {
    manquantes.push('« à capital variable » non imprimé · réservé à la SA et à la SAS (AUSCGIE art. 269-1)');
  }
  if (t.capitalSocial !== null) {
    morceaux.push(`au capital de ${montant(t.capitalSocial)} ${t.devise ?? ''}`.trim());
  } else {
    manquantes.push('montant du capital social');
  }
  const siege = ligneSiege(t);
  if (siege.texte) morceaux.push(`siège social : ${siege.texte}`);
  if (!siege.adresse) manquantes.push('adresse du siège social');
  if (t.rccm) morceaux.push(`RCCM ${t.rccm}`);
  else manquantes.push("numéro d'immatriculation au RCCM");
  return { ligne: morceaux.join(' · '), manquantes };
}

/**
 * L'identité telle que la base la rend (capital en Decimal) · un seul
 * convertisseur, pour que /auth/me et les pièces émises lisent la même ligne.
 */
export function identiteSociete(t: Omit<IdentiteSociete, 'capitalSocial'> & { capitalSocial: { toString(): string } | number | null }): IdentiteSociete {
  return { ...t, capitalSocial: t.capitalSocial === null ? null : Number(t.capitalSocial) };
}

/** Ce qu'une pièce émise par le dossier recopie à sa date (facture, devis). */
export interface MentionsRecopiees extends MentionsSociete {
  denomination: string;
}

/**
 * LA COPIE PORTÉE PAR UNE PIÈCE ÉMISE. La dénomination voyage avec la ligne ·
 * un devis ne recopie pas le nom du dossier ailleurs, et la relire au jour de
 * l'impression réécrirait l'offre faite l'an dernier.
 */
export function mentionsRecopiees(t: IdentiteSociete, datePiece: Date = new Date()): MentionsRecopiees {
  return { denomination: t.nom, ...mentionsEmetteur(t, datePiece) };
}

const EXPRESSION_COOPERATIVE: Record<VarianteCooperative, string> = {
  // Art. 205 et 268 · l'expression ET le sigle, mot pour mot.
  SCOOPS: 'Société Coopérative Simplifiée · SCOOPS',
  COOP_CA: "Société Coopérative avec Conseil d'Administration · COOP-CA",
};

/**
 * AUSCOOP art. 19 al. 3 · forme, adresse du siège et numéro au Registre des
 * Sociétés Coopératives, chacun imprimé s'il est connu, sinon NOMMÉ. Et
 * l'art. 183 · « société en liquidation » et le liquidateur, en tête, sur les
 * pièces datées de la dissolution déclarée ou après.
 */
export function mentionsCooperative(t: IdentiteSociete, datePiece: Date = new Date()): MentionsSociete {
  const morceaux: string[] = [];
  const manquantes: string[] = [];
  const renseigne = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  if (t.dateDissolution && t.dateDissolution.getTime() <= datePiece.getTime()) {
    const liquidateurs = renseigne(t.liquidateurs);
    morceaux.push(liquidateurs ? `Société en liquidation · liquidateur : ${liquidateurs}` : 'Société en liquidation');
    if (!liquidateurs) manquantes.push('nom du ou des liquidateurs (AUSCOOP art. 183)');
  }
  if (t.varianteCooperative) morceaux.push(EXPRESSION_COOPERATIVE[t.varianteCooperative]);
  else manquantes.push('forme de la société coopérative (AUSCOOP art. 19, 205 ou 268)');
  const siege = ligneSiege(t);
  if (siege.texte) morceaux.push(`siège social : ${siege.texte}`);
  if (!siege.adresse) manquantes.push('adresse du siège social (AUSCOOP art. 19)');
  const numero = renseigne(t.numeroRegistreCooperatives);
  if (numero) morceaux.push(`Registre des Sociétés Coopératives n° ${numero}`);
  else manquantes.push("numéro d'immatriculation au Registre des Sociétés Coopératives (AUSCOOP art. 19 et 74)");
  return { ligne: morceaux.length ? morceaux.join(' · ') : null, manquantes };
}

/** Les formes d'ASBL de droit congolais que vise la loi n° 004/2001, art. 16. */
export const FORMES_ASBL_ARTICLE_16: FormeJuridiqueEbnl[] = [
  FormeJuridiqueEbnl.ASSOCIATION,
  FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
  FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE,
];

export const MENTION_ASBL = 'Association sans but lucratif · A.S.B.L.';

/**
 * Loi n° 004/2001, art. 16. Une dénomination qui porte déjà les mots ou le
 * sigle n'appelle rien de plus (l'art. 7, 1° les met dans les statuts). Sinon
 * les DEUX formes s'impriment à côté, jamais en réécrivant la dénomination ·
 * « en toute lettre » puis « en sigle » laisse ouverte la lecture (le mot
 * entier, le sigle, ou les deux), et imprimer les deux satisfait chacune sans
 * la trancher.
 */
export function mentionsAsbl(t: IdentiteSociete): MentionsSociete {
  if (t.referentiel !== Referentiel.SYCEBNL || !t.formeJuridique || t.droitEtranger) return { ligne: null, manquantes: [] };
  if (!FORMES_ASBL_ARTICLE_16.includes(t.formeJuridique)) return { ligne: null, manquantes: [] };
  const portee = /association\s+sans\s+but\s+lucratif|\ba\.?\s*s\.?\s*b\.?\s*l\b/i.test(t.nom);
  return { ligne: portee ? null : MENTION_ASBL, manquantes: [] };
}

/**
 * CE QUI ACCOMPAGNE LA DÉNOMINATION sur toute pièce émise et tout document
 * imprimé · la ligne de l'art. 17 pour une société (le RCCM y est déjà), la
 * mention d'immatriculation de l'AUDCG pour les autres formes, et la qualité
 * de locataire-gérant (art. 140) en tête dans les deux cas. La coopérative
 * (AUSCOOP art. 19 et 183) et l'ASBL (loi n° 004/2001, art. 16) ont chacune
 * leur règle. `datePiece` est la date de la pièce, pour la liquidation.
 */
export function mentionsEmetteur(t: IdentiteSociete, datePiece: Date = new Date()): MentionsSociete {
  if (t.referentiel === Referentiel.SYCEBNL) return mentionsAsbl(t);
  if (t.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE) return mentionsCooperative(t, datePiece);
  const art17 = mentionsArticle17(t);
  if (art17.ligne === null) return mentionImmatriculation(t);
  const liquidation = mentionLiquidation(t, datePiece);
  const locataire = t.locataireGerantFonds === true ? 'Locataire-gérant du fonds de commerce · ' : '';
  return {
    ligne: `${liquidation.ligne ? `${liquidation.ligne} · ` : ''}${locataire}${art17.ligne}`,
    manquantes: [...liquidation.manquantes, ...art17.manquantes],
  };
}

/**
 * LA SOCIÉTÉ EN LIQUIDATION · AUSCGIE art. 204 (passe O1a, D1) : « La société
 * est en liquidation dès l'instant de sa dissolution pour quelque cause que ce
 * soit. La mention "société en liquidation" ainsi que le nom du ou des
 * liquidateurs doivent figurer sur tous les actes et documents émanant de la
 * société et destinés aux tiers, notamment sur toutes lettres, factures,
 * annonces et publications diverses. »
 *
 * Le périmètre est celui de l'art. 203 · les cinq sociétés commerciales, hors
 * liquidation conduite sous l'AUPCAP. Une dissolution se DÉCLARE, elle n'est
 * jamais présumée, et un liquidateur non nommé se dit dans les manques · il
 * n'est jamais inventé. La mention ne vaut que pour une pièce datée de la
 * dissolution ou après (`datePiece`, même convention que la coopérative,
 * AUSCOOP art. 183), et elle est recopiée avec les autres.
 */
export function mentionLiquidation(t: IdentiteSociete, datePiece: Date = new Date()): MentionsSociete {
  if (
    !t.dateDissolution ||
    t.dateDissolution.getTime() > datePiece.getTime() ||
    !t.formeJuridiqueSyscohada ||
    !FORMES_SOCIETES_COMMERCIALES.includes(t.formeJuridiqueSyscohada)
  ) {
    return { ligne: null, manquantes: [] };
  }
  const liquidateurs = t.liquidateurs?.trim();
  return liquidateurs
    ? { ligne: `Société en liquidation · liquidateur(s) : ${liquidateurs}`, manquantes: [] }
    : { ligne: 'Société en liquidation', manquantes: ['nom du ou des liquidateurs (AUSCGIE art. 204)'] };
}
