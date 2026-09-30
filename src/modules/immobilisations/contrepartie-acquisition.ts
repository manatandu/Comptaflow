import { Referentiel, TypeComposant } from '@prisma/client';

/**
 * LA CONTREPARTIE D'UNE ACQUISITION D'IMMOBILISATION · une liste FERMÉE, lue
 * dans la fiche des comptes 21 à 24 de chaque texte. L'écran proposait tout
 * le plan et le serveur acceptait n'importe quel compte · une charge, un
 * client ou une TVA passait en contrepartie d'un matériel sur une écriture
 * équilibrée, et la balance bouclait.
 *
 * AUDCIF, Titre VII, comptes 21 à 24 · débités « par le crédit du 10
 * (Capital) ; du 46 (Apporteurs, Associés et Groupe) ; des comptes de tiers
 * et de trésorerie concernés ; du 72 (Production immobilisée) ». Les tiers
 * concernés sont les fournisseurs d'immobilisations · la fiche du compte 40
 * EXCLUT les fournisseurs d'immobilisations et les renvoie au 481 ; le 404
 * « acquisitions courantes d'immobilisations » est ouvert au plan.
 *
 * SYCEBNL, Partie 2 ch. 3, comptes 21 à 24 · « par le crédit du compte 10 –
 * Dotation, ou du compte 16 – Fonds affectés aux investissements du projet de
 * développement et assimilés, ou du compte 45 – Fondateurs, ou des comptes de
 * tiers, ou des comptes de trésorerie ». Le 72 n'y figure pas, mais la fiche du
 * compte 72 le fait créditer par le débit des 21, 23 ou 24 (voir plus bas).
 *
 * LA NATURE DU BIEN CHOISIT LE SOUS-COMPTE DU FOURNISSEUR · 4811 et 4821
 * (et 4041, 4046 au SYSCOHADA) pour un incorporel (21), 4812 et 4822 (4042,
 * 4047) pour un corporel. Le 4817 (retenues de garantie) n'est pas une
 * contrepartie d'acquisition d'un bien.
 *
 * CE QUE LES FICHES DU BIEN AJOUTENT À CE SOCLE (passe R1, A2 et R5, B2 ·
 * 2026-09-30), chacune lue dans la fiche du compte du bien et servie à lui
 * seul. Jusque-là, ce commentaire affirmait que le 4813 « n'est pas une
 * contrepartie d'acquisition d'un bien » et que les en-cours « ne passent
 * pas par la création d'une fiche » · les deux étaient contraires au texte,
 * et un bâtiment achevé depuis le 2391 ne pouvait naître au registre que sur
 * une contrepartie fausse, le 2391 restant au bilan à côté du bien.
 *
 *   · L'EN-COURS ACHEVÉ · AUDCIF, fiches 21 à 24 (« ou du 219 / 229 / 239 /
 *     249, lorsque [les travaux] sont terminés ») ; SYCEBNL, fiches 23 et 24
 *     seulement (« ou du compte 239 », « ou du compte 249 »), ses fiches 21
 *     et 22 n'en disent rien. Jamais pour un bien porté lui-même sur l'en-cours.
 *   · L'AVANCE SOLDÉE · fiche 25 des deux textes, « crédité, pour solde, à la
 *     réception de la facture définitive […] par le débit du compte
 *     d'immobilisation concerné » · 251 pour un incorporel, 252 pour un
 *     corporel (subdivisions semées aux deux plans).
 *   · LA PART NON LIBÉRÉE DES TITRES · fiches 26 et 27 des deux textes, « ou
 *     du 4813 […], pour la partie non libérée des titres » · pour un 26 ou un
 *     27 seulement.
 *   · LE DÉMANTÈLEMENT · AUDCIF, introduction de la classe 2 (bien acquis à
 *     titre onéreux) : « le SYSCOHADA autorise que le sous-compte composant
 *     démantèlement soit débité directement par le crédit du 1984 » · pour
 *     un composant de type DEMANTELEMENT seulement, au SYSCOHADA seulement.
 *   · LA SUBVENTION EN NATURE · SYCEBNL, fiche 14 : « crédité […] par le
 *     débit du compte approprié de la classe 2, sur la base de l'évaluation
 *     des immobilisations transférées gratuitement ».
 *   · LE FONDS REPORTÉ · SYCEBNL, fiche 20 : « débité le compte 20 de la
 *     valeur actuelle ; par le crédit du compte 17 – Fonds reportés » · pour
 *     un bien de la division 20 seulement, 171 (donation temporaire
 *     d'usufruit) pour le 2011, 172 (legs et donations non encore reçus
 *     d'immobilisations destinées à la vente) pour les autres, d'après les
 *     intitulés semés.
 *   · LA PRODUCTION IMMOBILISÉE · SYCEBNL, fiche 72 : « crédité […] par le
 *     débit : du compte 21 […] du compte 23 […] ou 24 » · pour ces trois
 *     divisions seulement.
 */
const TRESORERIE = ['52', '53', '55', '57'];

/**
 * RÉSERVE DE PROPRIÉTÉ (4816) ET FACTURES NON PARVENUES (4818) · LA NATURE DU
 * BIEN SE LIT À UN CRAN PLUS BAS AU SYCEBNL, ET NULLE PART AU SYSCOHADA.
 *
 * SYCEBNL · la fiche du compte 48 (Partie 2 ch. 3) n'ouvre que « 4816 Réserve
 * de propriété » et « 4818 Factures non parvenues », sans les ventiler. Le
 * semis, lui, les subdivise · 48161000 « réserve de propriété
 * (incorporelles) », 48162000 « (corporelles) », 48181000 et 48182000 de même.
 * L'affectation n'est donc PAS du texte · elle vient de l'intitulé du semis et
 * de la symétrie avec 4811 (incorporelles) et 4812 (corporelles), que la fiche
 * écrit, elle. Servir '4816' aux deux natures admettait (et proposait) un
 * matériel crédité au 48161, réserve de propriété d'un INCORPOREL · le compte
 * existe, l'écriture s'équilibre, la balance boucle.
 *
 * SYSCOHADA · le semis ne subdivise pas (48160000, 48170000, 48180000), le
 * compte ne dit pas la nature du bien · '4816' et '4818' restent communs aux
 * deux natures, faute de quoi rien ne pourrait y être crédité. Le Titre VII
 * (compte 48) demande pourtant de « créer des sous-comptes pour distinguer
 * les immobilisations corporelles des incorporelles » · aucun numéro n'en
 * est écrit, et un sous-compte que le cabinet ouvrirait sous le 4816 reste
 * admis pour les deux natures, faute de convention lisible.
 */
const FOURNISSEURS_INCORPORELS: Record<Referentiel, readonly string[]> = {
  [Referentiel.SYSCOHADA]: ['4811', '4816', '4818', '4821'],
  [Referentiel.SYCEBNL]: ['4811', '48161', '48181', '4821'],
};
const FOURNISSEURS_CORPORELS: Record<Referentiel, readonly string[]> = {
  [Referentiel.SYSCOHADA]: ['4812', '4816', '4818', '4822'],
  [Referentiel.SYCEBNL]: ['4812', '48162', '48182', '4822'],
};

const PROPRES: Record<Referentiel, readonly string[]> = {
  // Capital, dotation, capital personnel, compte de l'exploitant · jamais
  // les primes (105), écarts de réévaluation (106) ni le non-appelé (109).
  [Referentiel.SYSCOHADA]: ['101', '102', '103', '104', '46', '72'],
  // Dotations (101, 102, 104) · le 103 est le droit d'entrée des membres,
  // le 106 les écarts de réévaluation. Fonds affectés aux investissements
  // (162 à 164), fonds affectés à un projet spécifique (165, que sa fiche
  // fait créditer « par le débit du compte 52 lors de la mise à disposition »
  // et reprendre par le 7925 · admis tel quel, sans rien trancher ici) et
  // dons et legs d'immobilisations (167) · jamais le 161, avances de fonds à
  // justifier, ni le 169, fonds à recevoir.
  [Referentiel.SYCEBNL]: ['101', '102', '104', '162', '163', '164', '165', '167', '45'],
};

export interface OptionsContrepartie {
  /** Le type du composant créé, pour la seule contrepartie qu'il ouvre (1984). */
  typeComposant?: TypeComposant | null;
}

/** Ce que la fiche du compte du bien ajoute au socle commun (voir l'en-tête). */
function racinesDeLaFiche(referentiel: Referentiel, compte: string, options: OptionsContrepartie): string[] {
  const division = compte.slice(0, 2);
  const ajouts: string[] = [];
  const enCours = `${division}9`;
  const enCoursAdmis =
    referentiel === Referentiel.SYSCOHADA ? ['21', '22', '23', '24'] : ['23', '24'];
  if (enCoursAdmis.includes(division) && !compte.startsWith(enCours)) ajouts.push(enCours);
  if (['21', '22', '23', '24'].includes(division)) ajouts.push(division === '21' ? '251' : '252');
  if (division === '26' || division === '27') ajouts.push('4813');
  if (referentiel === Referentiel.SYSCOHADA) {
    if (options.typeComposant === TypeComposant.DEMANTELEMENT) ajouts.push('1984');
  } else {
    ajouts.push('14');
    if (division === '20') ajouts.push(compte.startsWith('2011') ? '171' : '172');
    if (['21', '23', '24'].includes(division)) ajouts.push('72');
  }
  return ajouts;
}

export function racinesContrepartieAcquisition(
  referentiel: Referentiel,
  compteImmobilisation: string,
  options: OptionsContrepartie = {},
): string[] {
  const incorporel = compteImmobilisation.startsWith('21');
  const fournisseurs = incorporel ? [...FOURNISSEURS_INCORPORELS[referentiel]] : [...FOURNISSEURS_CORPORELS[referentiel]];
  if (referentiel === Referentiel.SYSCOHADA) fournisseurs.push(...(incorporel ? ['4041', '4046'] : ['4042', '4047']));
  return [
    ...PROPRES[referentiel],
    ...fournisseurs,
    ...TRESORERIE,
    ...racinesDeLaFiche(referentiel, compteImmobilisation, options),
  ];
}

export function contrepartieAcquisitionAdmise(
  referentiel: Referentiel,
  compteImmobilisation: string,
  contrepartie: string,
  options: OptionsContrepartie = {},
): boolean {
  return racinesContrepartieAcquisition(referentiel, compteImmobilisation, options).some((r) =>
    contrepartie.startsWith(r),
  );
}

/**
 * Le refus nomme la FICHE DU COMPTE DU BIEN et la liste que le logiciel en
 * tire pour lui · jusqu'au 2026-09-30, il citait un résumé commun aux 21 à
 * 24 comme s'il était exhaustif, et attribuait au Titre VII une exclusion
 * qu'il n'écrit pas.
 */
export function motifRefusContrepartie(
  referentiel: Referentiel,
  compteImmobilisation: string,
  contrepartie: string,
  options: OptionsContrepartie = {},
): string | null {
  if (contrepartieAcquisitionAdmise(referentiel, compteImmobilisation, contrepartie, options)) return null;
  const division = compteImmobilisation.slice(0, 2);
  const fiche =
    referentiel === Referentiel.SYSCOHADA
      ? `AUDCIF, Titre VII, fiche du compte ${division}`
      : `SYCEBNL, Partie 2 ch. 3, fiche du compte ${division}`;
  const racines = racinesContrepartieAcquisition(referentiel, compteImmobilisation, options);
  return (
    `Le compte ${contrepartie} n'est pas une contrepartie d'acquisition admise pour un bien au ${compteImmobilisation} · ` +
    `${fiche}. Racines admises : ${racines.join(', ')}.`
  );
}
