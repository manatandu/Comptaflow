import { JeuEtatsFinanciersSycebnl, Referentiel, SensDepreciation } from '@prisma/client';

/**
 * LES COMPTES QUI SUIVENT LE BIEN · amortissement, dépréciation et leurs
 * contreparties, lus dans le Titre VII de l'AUDCIF et dans la Partie 2 ch. 3
 * du SYCEBNL. Chaque règle est une fonction pure, appelée à la porte du
 * service (famille, dotation, dépréciation) et par tout lecteur qui en a
 * besoin (tableaux, sortie, contrôles), pour qu'aucune copie ne diverge.
 *
 * Passe R1 (A1, A4, A5) et R5 (B1) · 2026-09-30.
 */

/**
 * UN BIEN QUE LE PLAN NE FAIT PAS AMORTIR · le motif, ou `null`.
 *
 * Le module amortissait tout compte 20 à 27 · une écriture 68/28 sur un
 * terrain nu, un titre de participation ou un bien reçu en don destiné à la
 * vente s'équilibre, la balance boucle, et le résultat est minoré. Trois
 * familles de refus, chacune ÉCRITE dans les deux textes, et rien d'autre :
 *
 *  · SYCEBNL, division 20 hors 2011 · « les biens reçus en dons destinés à
 *    la vente sont comptabilisés à la valeur actuelle. Ils ne doivent pas être
 *    amortis mais la dépréciation doit être constatée en cas de perte de
 *    valeur » (Partie 2 ch. 3, présentation de la classe 2). L'usufruit
 *    temporaire (2011) s'amortit, lui, « sur la durée de la donation » (fiche
 *    du compte 20, au 280).
 *  · 25, 26 et 27 · le compte 28 n'ouvre AUCUNE subdivision pour eux (AUDCIF,
 *    fiche 28 : 281 à 284 ; SYCEBNL : 280 à 284), alors que « les comptes 28
 *    et 29 ont été développés selon la structure des comptes de la classe 2 »
 *    (AUDCIF, Titre VII ch. 2) et que le 29, lui, ouvre 295, 296 et 297. Une
 *    avance se solde, un titre se déprécie (« les moins-values sont inscrites
 *    au compte de dépréciations »).
 *  · Les terrains nus, bâtis, de carrières, aménagés, en concession et autres
 *    (222, 223, 225 à 228) · le 282 ne s'ouvre que sur « 2824 travaux de mise
 *    en valeur des terrains », et la fiche 22 des deux textes ne crédite le 282
 *    que « pour le montant des amortissements pratiqués sur les terrains
 *    agricoles ou forestiers et sur les travaux de mise en valeur des
 *    terrains ».
 *
 * CE QUE LA RÈGLE NE TRANCHE PAS, ET QUI RESTE AU CABINET · le 221 (terrains
 * agricoles et forestiers), que la fiche 22 dit amortissable quand le 282 ne
 * lui ouvre aucun sous-compte ; les incorporels à durée non limitée (fonds
 * commercial, marque) que le Titre VIII ch. 2 déclare non amortissables « en
 * principe » · c'est un jugement, pas un numéro. Aucune liste n'est inventée
 * pour eux. Les en-cours (2x9) sont tenus par la date de mise en service.
 *
 * La dépréciation (29) reste ouverte à tous ces biens.
 */
export function motifNonAmortissable(numeroCompte: string, referentiel: Referentiel): string | null {
  if (referentiel === Referentiel.SYCEBNL && numeroCompte.startsWith('20') && !numeroCompte.startsWith('2011')) {
    return (
      `Le compte ${numeroCompte} porte un bien reçu en don destiné à la vente · « Ils ne doivent pas être amortis ` +
      "mais la dépréciation doit être constatée en cas de perte de valeur » (SYCEBNL, Partie 2 ch. 3, classe 2). " +
      "Seul l'usufruit temporaire (2011) s'amortit."
    );
  }
  const texte =
    referentiel === Referentiel.SYSCOHADA ? 'AUDCIF, Titre VII, fiche du compte 28' : 'SYCEBNL, Partie 2 ch. 3, fiche du compte 28';
  if (/^2[567]/.test(numeroCompte)) {
    return (
      `Le compte ${numeroCompte} n'a aucun compte d'amortissement au plan · le compte 28 ne s'ouvre que sur les ` +
      `divisions 2${referentiel === Referentiel.SYCEBNL ? '0' : '1'} à 24 (${texte}). Une avance se solde, une ` +
      'immobilisation financière se déprécie au 29.'
    );
  }
  if (/^22[235678]/.test(numeroCompte)) {
    return (
      `Le compte ${numeroCompte} porte un terrain que le plan ne fait pas amortir · le 282 ne s'ouvre que sur ` +
      `« 2824 travaux de mise en valeur des terrains » (${texte}), et la fiche du compte 22 ne le crédite que pour ` +
      "les terrains agricoles ou forestiers et les travaux de mise en valeur. La dépréciation (29) reste ouverte."
    );
  }
  return null;
}

/**
 * UN PROJET DE DÉVELOPPEMENT NE S'AMORTIT PAS · décision de Manasse du
 * 2026-10-01 (D-1, `docs/plan-immobilisations-verrouille.md`).
 *
 * Acte uniforme SYCEBNL, art. 7 · « Le Compte d'exploitation des projets de
 * développement et entités assimilées récapitule en liste, les charges SANS
 * AMORTISSEMENT, NI DÉPRÉCIATION » et « Le Tableau emplois-ressources
 * récapitule tous les emplois, immobilisations et charges, sans amortissement
 * ni dépréciation » ; art. 9, même phrase pour le Compte d'exploitation. Le
 * Guide (Application 8) le suit · « aucune dotation aux amortissements n'est
 * constatée », et les états de la Partie 4 ch. 3 n'ont aucune ligne
 * d'amortissement.
 *
 * ÉCART ÉCRIT, NON TRANCHÉ EN SILENCE · le premier alinéa du même art. 7
 * (« Il doit être procédé, dans l'exercice, à tous amortissements ») et le
 * cadre conceptuel § 5.4.2.3 (fonds d'investissement repris « dans la même
 * quotité que les dotations aux amortissements ») disent le contraire en
 * termes généraux · les articles qui visent le cas l'emportent. La sortie de
 * fin de projet par le 162 à 164 (P3 ch. 3 § 2.5) est le lot 3 du plan.
 */
export function motifSansAmortissementProjet(jeu: JeuEtatsFinanciersSycebnl | null | undefined): string | null {
  if (jeu !== JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT) return null;
  return (
    "Un projet de développement ne constate aucune dotation aux amortissements · ses états récapitulent « les " +
    "charges sans amortissement, ni dépréciation » (Acte uniforme SYCEBNL, art. 7 et 9 ; Guide, Application 8)."
  );
}

/**
 * LA FIN D'UN PROJET DE DÉVELOPPEMENT · SYCEBNL Partie 3 ch. 3 § 2.5.
 *
 * Cession (§ 2.5.1, « en accord avec le bailleur »), remise gratuite à
 * l'entité (§ 2.5.2), restitution au bailleur, vol, destruction ou mise au
 * rebut (§ 2.5.3) · une seule écriture de sortie, « 162, 163, 164 Fonds
 * affectés aux investissements » au débit par le crédit du 2, et pour la
 * cession seule le prix au 485 ou en trésorerie contre le 82. Aucun 28 ni
 * aucun 81 · le bien n'a jamais été amorti (Acte uniforme, art. 7 et 9,
 * décision D-1), et le fonds qui l'a financé le reprend.
 *
 * LE COMPTE DE FONDS SE CHOISIT · bailleurs (162), État (163), autres
 * organismes (164), selon qui a financé le bien ; rien sur la fiche ne le dit.
 */
export const RACINES_FONDS_PROJET = ['162', '163', '164'] as const;

/** Un compte de fonds affecté aux investissements · la même racine pour la liste servie et pour le refus. */
export function estCompteFondsProjet(numero: string): boolean {
  return RACINES_FONDS_PROJET.some((r) => numero.startsWith(r));
}

/**
 * POURQUOI LA LISTE DES FONDS EST VIDE · § 9 ter du règlement (« une liste qui
 * dépend d'un choix dit pourquoi elle est vide et ce qu'il faut faire
 * d'abord »). Hors projet de développement, la liste n'a pas d'objet et le
 * dit ; en projet, le compte manque au plan ou y dort.
 */
export function motifListeFondsProjetVide(o: {
  projet: boolean;
  nombre: number;
  inactifs: number;
  /** Fonds actifs que la règle des comptes retenus écarte (`comptes-proposes.ts`). */
  nonRetenus?: number;
}): string | null {
  if (!o.projet) {
    return "Le compte de fonds affectés ne sert qu'à la sortie d'un bien de projet de développement (SYCEBNL Partie 3 ch. 3 § 2.5).";
  }
  if (o.nombre > 0) return null;
  // Des fonds existent au plan sans être ni retenus ni utilisés · la liste de
  // choix les écarte (décision du 2026-09-28), et le geste est de les retenir,
  // pas de les ouvrir. Rien n'est refusé : la sortie admet tout 162 à 164.
  if (o.nonRetenus && o.nonRetenus > 0) {
    return (
      `Aucun compte de fonds affectés aux investissements (162, 163, 164) n'est retenu ni utilisé (${o.nonRetenus} au plan) · ` +
      'retenez dans Plan comptable celui qui a financé le bien, puis rouvrez la sortie (SYCEBNL Partie 3 ch. 3 § 2.5).'
    );
  }
  if (o.inactifs > 0) {
    return (
      `Les comptes de fonds affectés aux investissements (162, 163, 164) du plan sont en sommeil (${o.inactifs}) · ` +
      'réactivez dans Plan comptable celui qui a financé le bien, puis rouvrez la sortie (SYCEBNL Partie 3 ch. 3 § 2.5).'
    );
  }
  return (
    'Aucun compte de détail 162, 163 ou 164 au plan du dossier · ouvrez dans Plan comptable le fonds affecté aux ' +
    'investissements qui a financé le bien (bailleurs 162, État 163, autres organismes 164), puis rouvrez la sortie ' +
    '(SYCEBNL Partie 3 ch. 3 § 2.5).'
  );
}

/**
 * LE REFUS DE LA SORTIE DE FIN DE PROJET · même règle que la liste servie.
 *
 * UN FONDS EN SOMMEIL EST REFUSÉ (décision D3 du suivi, 2026-10-02) · la
 * liste de `comptesFondsProjet` l'écartait déjà, mais un identifiant envoyé
 * hors de l'écran passait au serveur, et la sortie se postait sur un compte
 * que le cabinet avait mis en sommeil pour qu'il ne serve plus. Le compte se
 * réactive dans Plan comptable, comme le dit le motif de la liste vide.
 * `compteFondsEnSommeil` absent vaut actif · seul un sommeil LU refuse.
 */
export function motifRefusSortieProjet(o: {
  projet: boolean;
  numeroCompteFonds: string | null;
  cumulAmorti: number;
  cumulDepreciation: number;
  compteFondsEnSommeil?: boolean;
}): string | null {
  if (!o.projet) {
    return o.numeroCompteFonds
      ? "Le compte de fonds affectés ne sert qu'à la sortie d'un bien de projet de développement (SYCEBNL Partie 3 ch. 3 § 2.5)."
      : null;
  }
  if (!o.numeroCompteFonds) {
    return "Indiquez le compte de fonds affectés aux investissements (162, 163 ou 164) qui reprend le bien · « 162, 163, 164 Fonds affectés aux investissements » au débit, le bien au crédit (SYCEBNL Partie 3 ch. 3 § 2.5).";
  }
  if (!estCompteFondsProjet(o.numeroCompteFonds)) {
    return `Le compte ${o.numeroCompteFonds} n'est pas un fonds affecté aux investissements · seuls les comptes 162, 163 et 164 reprennent le bien (SYCEBNL Partie 3 ch. 3 § 2.5).`;
  }
  if (o.compteFondsEnSommeil) {
    return (
      `Le compte de fonds ${o.numeroCompteFonds} est en sommeil · réactivez-le dans Plan comptable, ou choisissez ` +
      'le fonds actif qui a financé le bien (SYCEBNL Partie 3 ch. 3 § 2.5).'
    );
  }
  if (o.cumulAmorti > 0.005 || o.cumulDepreciation > 0.005) {
    return (
      "Ce bien porte un amortissement ou une dépréciation · les états d'un projet récapitulent « les charges sans " +
      "amortissement, ni dépréciation » (Acte uniforme SYCEBNL, art. 7 et 9), et la sortie du § 2.5 ne connaît que le " +
      'fonds et le bien. Contre-passez d\'abord ces écritures.'
    );
  }
  return null;
}

/**
 * LE 28 ET LE 29 SUIVENT LA DIVISION DU BIEN · SYSCOHADA.
 *
 * AUDCIF, Titre VII ch. 2 · « les comptes 28 et 29 ont été développés selon
 * la structure des comptes de la classe 2 » : 281/291 pour le 21, 282/292
 * pour le 22, 283/293 pour le 23, 284/294 pour le 24, 295 à 297 pour les 25 à
 * 27. Un bâtiment amorti au 2844 sortait brut au poste AK du bilan pendant que
 * le matériel, au poste AM, était minoré jusqu'au négatif · le total de
 * l'actif restait juste et rien ne le signalait. Au-delà de la division, le
 * sous-compte reste au cabinet.
 *
 * Le SYCEBNL n'est pas visé · sa structure est la même (280 à 284, 290 à 297),
 * mais son texte n'écrit pas la phrase du ch. 2, et rien n'est transposé.
 */
function motifRefusDivision(
  referentiel: Referentiel,
  numeroBien: string,
  numeroCompte: string,
  racine: '28' | '29',
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA) return null;
  const attendu = `${racine}${numeroBien.charAt(1)}`;
  if (numeroCompte.startsWith(attendu)) return null;
  return (
    `Le compte ${numeroCompte} ne correspond pas à la division du bien (${numeroBien}) · attendu un ${attendu}. ` +
    '« Les comptes 28 et 29 ont été développés selon la structure des comptes de la classe 2 » (AUDCIF, Titre VII ch. 2).'
  );
}

export function motifRefusCompteAmortissement(
  referentiel: Referentiel,
  numeroBien: string,
  numeroCompte28: string,
): string | null {
  return motifRefusDivision(referentiel, numeroBien, numeroCompte28, '28');
}

export function motifRefusCompteDepreciation(
  referentiel: Referentiel,
  numeroBien: string,
  numeroCompte29: string,
): string | null {
  return motifRefusDivision(referentiel, numeroBien, numeroCompte29, '29');
}

/**
 * LA CONTREPARTIE D'UNE DÉPRÉCIATION · SYSCOHADA, fiche du compte 29.
 *
 * « Le compte 29 est crédité de la dotation aux provisions, par le débit du
 * 691 […], ou du 697 […], ou du 853 […]. Le compte 29 est débité de la reprise
 * de provision, par le crédit du 791 […], du 797 […], ou du 863. » Le serveur
 * ne bornait rien · une dotation passait au débit d'un 681, une reprise au
 * crédit d'un 758, sur une écriture équilibrée. Le choix entre exploitation,
 * financier et H.A.O. reste au comptable.
 *
 * Le SYCEBNL écrit sa propre fiche 29, non transposée ici.
 */
export const CONTREPARTIES_DEPRECIATION_SYSCOHADA: Record<SensDepreciation, readonly string[]> = {
  [SensDepreciation.DOTATION]: ['691', '697', '853'],
  [SensDepreciation.REPRISE]: ['791', '797', '863'],
};

export function motifRefusContrepartieDepreciation(
  referentiel: Referentiel,
  sens: SensDepreciation,
  numeroContrepartie: string,
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA) return null;
  const admises = CONTREPARTIES_DEPRECIATION_SYSCOHADA[sens];
  if (admises.some((r) => numeroContrepartie.startsWith(r))) return null;
  return (
    `Le compte ${numeroContrepartie} n'est pas une contrepartie de ${sens === SensDepreciation.DOTATION ? 'dotation' : 'reprise'} ` +
    `de dépréciation · la fiche du compte 29 (AUDCIF, Titre VII) nomme ${admises.join(', ')}.`
  );
}

/**
 * L'USUFRUIT TEMPORAIRE (2011) · SYCEBNL, ses deux comptes sont écrits.
 *
 * Partie 3 ch. 2 § 2.3.2 · dépréciation « 6951 Dotations aux dépréciations /
 * 2901 Dépréciations d'usufruit temporaire », reprise « 2901 / 7951 Reprises
 * des dépréciations d'usufruit temporaire ». Le 795 est partagé avec les biens
 * reçus destinés à la vente (7952, 6952), et une reprise d'usufruit au 7952
 * s'équilibrait sans un mot · Note 5D et compte de résultat faux d'autant.
 * Décision de Manasse du 2026-10-01 (D-2) · la dépréciation reste permise,
 * la simplification de l'Application 7 du Guide est dite en aide.
 */
export function motifRefusContrepartieUsufruit(
  referentiel: Referentiel,
  numeroBien: string,
  sens: SensDepreciation,
  numeroContrepartie: string,
): string | null {
  if (referentiel !== Referentiel.SYCEBNL || !numeroBien.startsWith('2011')) return null;
  const attendu = sens === SensDepreciation.DOTATION ? '6951' : '7951';
  if (numeroContrepartie.startsWith(attendu)) return null;
  return (
    `L'usufruit temporaire se ${sens === SensDepreciation.DOTATION ? 'déprécie' : 'reprend'} au ${attendu}, ` +
    `pas au ${numeroContrepartie} (SYCEBNL Partie 3 ch. 2 § 2.3.2).`
  );
}

/**
 * LA DIVISION 20 DU SYCEBNL · ses comptes de dépréciation sont écrits, bien
 * par bien (lot 9). Partie 3 ch. 2 § 2.2.2 · le bien destiné à la vente se
 * déprécie « 6952 [...] / 2902 », § 2.2.3 · « 2902 / 7952 » à la reprise ;
 * § 2.3.2 · l'usufruit temporaire « 6951 / 2901 », reprise « 2901 / 7951 ».
 * Les deux natures partagent le 290, le 695 et le 795 · croisées, elles
 * s'équilibrent sans un mot et la Note 5D comme le compte de résultat sont
 * faux d'autant. Le catalogue, qui passait la dépréciation du bien à vendre
 * hors fiche (B17-DEPRECIATION), y renvoie désormais.
 */
export function motifRefusDepreciationDivision20(
  referentiel: Referentiel,
  numeroBien: string,
  sens: SensDepreciation,
  numeroCompte29: string,
  numeroContrepartie: string,
): string | null {
  if (referentiel !== Referentiel.SYCEBNL || !numeroBien.startsWith('20')) return null;
  const usufruit = numeroBien.startsWith('2011');
  const attendu29 = usufruit ? '2901' : '2902';
  if (!numeroCompte29.startsWith(attendu29)) {
    return usufruit
      ? `L'usufruit temporaire se déprécie au 2901, pas au ${numeroCompte29} (SYCEBNL Partie 3 ch. 2 § 2.3.2).`
      : `Un bien destiné à la vente se déprécie au 2902, pas au ${numeroCompte29} (SYCEBNL Partie 3 ch. 2 § 2.2.2).`;
  }
  if (usufruit) return motifRefusContrepartieUsufruit(referentiel, numeroBien, sens, numeroContrepartie);
  const attendu = sens === SensDepreciation.DOTATION ? '6952' : '7952';
  if (numeroContrepartie.startsWith(attendu)) return null;
  return (
    `Un bien destiné à la vente se ${sens === SensDepreciation.DOTATION ? 'déprécie' : 'reprend'} au ${attendu}, ` +
    `pas au ${numeroContrepartie} (SYCEBNL Partie 3 ch. 2 § ${sens === SensDepreciation.DOTATION ? '2.2.2' : '2.2.3'}).`
  );
}

/**
 * LA CRÉANCE NÉE D'UNE CESSION · SYSCOHADA, deux exclusions écrites, et deux
 * seulement (passe R1, B6).
 *
 *  · Fiche du compte 41, Exclusions · « Les créances sur des tiers nées des
 *    opérations autres que la vente des marchandises, des produits
 *    intermédiaires, des produits finis ou services → 485 (Créances sur
 *    cessions d'immobilisations). » Une cession H.A.O. (produit au 82) ne se
 *    porte donc pas sur un client.
 *  · Fiche du compte 48, Commentaires · les créances sur cessions sont H.A.O.
 *    hors de l'activité courante ; « dans le cas contraire, elles constituent
 *    des créances rattachées au compte Client (compte 414) et sont débitées
 *    par le crédit du compte 754 ». Une cession courante ne se porte donc pas
 *    au 485.
 *
 * Le bilan range le 485 en BA et le 41 en BI · l'écriture s'équilibre et le
 * besoin de financement H.A.O. que le 48 existe pour mesurer est faux. Le
 * reste de la contrepartie demeure libre : les fiches 82 et 754 disent « par
 * le débit des comptes de tiers concernés ou des comptes de trésorerie », et
 * une liste fermée refuserait un chèque, un apport contre titres ou une
 * compensation que le texte admet.
 */
export function motifRefusContrepartieCession(
  referentiel: Referentiel,
  cessionCourante: boolean,
  numeroContrepartie: string,
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA) return null;
  if (!cessionCourante && numeroContrepartie.startsWith('41')) {
    return (
      `Une cession hors activités ordinaires ne se porte pas sur un compte client (${numeroContrepartie}) · « Les ` +
      "créances sur des tiers nées des opérations autres que la vente […] → 485 (Créances sur cessions " +
      "d'immobilisations) » (AUDCIF, Titre VII, fiche du compte 41, Exclusions)."
    );
  }
  if (cessionCourante && numeroContrepartie.startsWith('485')) {
    return (
      `Une cession courante ne se porte pas au ${numeroContrepartie} · ses créances « constituent des créances ` +
      "rattachées au compte Client (compte 414) et sont débitées par le crédit du compte 754 » (AUDCIF, Titre VII, " +
      'fiche du compte 48).'
    );
  }
  return null;
}
