import { Referentiel } from '@prisma/client';

/**
 * UN MODÈLE QUI SOLDE UNE CHARGE OU UN PRODUIT DIRECTEMENT SUR LA TRÉSORERIE.
 *
 * Le 2026-09-18, les modèles ÉCRITS DANS LE CODE ont été corrigés : un achat
 * crédite désormais le fournisseur, une vente débite le client, un salaire
 * crédite le 422. Les modèles que le CABINET fabrique lui-même, eux, n'ont
 * jamais eu de garde : `verifierLignes` contrôle que les comptes existent,
 * qu'ils sont imputables et qu'il y a un débit et un crédit. Rien de plus. Un
 * modèle « Achat » qui solde sur la banque s'enregistre, et il engendre
 * ensuite autant d'écritures fautives qu'on l'applique.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE DISENT LES DEUX TEXTES, ET ILS DISENT LA MÊME CHOSE.
 *
 * Guide d'application du SYSCOHADA révisé, Partie 1 ch. 2 § 1.1 :
 * « Recommandation SYSCOHADA (flux de trésorerie) : contrepartie systématique
 * = 401 pour les achats de biens/services (hors immobilisations) ; 481 ou 404
 * pour les immobilisations. »
 *
 * SYCEBNL, fonctionnement du COMPTE 40, en deux temps explicitement séparés :
 * « est crédité le compte 40 FOURNISSEURS ET COMPTES RATTACHES du montant des
 * factures d'achats de biens ou de prestations de services […] par le débit
 * des comptes concernés de la classe 6 […] du compte 445 Etat, T.V.A.
 * récupérable » ; puis « est débité le compte 40 […] des règlements effectués
 * sur factures ; par le crédit des comptes de trésorerie ».
 *
 * Même règle à la vente (Guide, Application 2 : 4111 Client au débit) et à la
 * paie (Guide, Partie 1 ch. 3 § 4.1 : « Montant brut au crédit 422 Personnel,
 * rémunérations dues, par débit 661-663 »).
 * ────────────────────────────────────────────────────────────────────────
 *
 * POURQUOI UN AVERTISSEMENT ET NON UN REFUS. C'est la doctrine que le dépôt
 * applique déjà aux fiches par compte (CLAUDE.md § 6) : « l'avertissement
 * n'empêche pas la saisie · le logiciel ne connaît pas la nature de
 * l'opération, refuser bloquerait des écritures justes ». Des frais bancaires
 * que le relevé justifie à lui seul, une opération diverse, un cas que ces
 * textes ne visent pas : un refus sec les bloquerait, et le cabinet finirait
 * par contourner l'outil. Le contrôle CHARGE_SANS_TIERS dit d'ailleurs la
 * même chose en aval, en AVERTISSEMENT lui aussi.
 *
 * CE QUI CHANGE, C'EST LE MOMENT. Le contrôle en aval relit des écritures
 * déjà passées ; celui-ci parle au moment où le MODÈLE naît, c'est-à-dire une
 * fois pour toutes les écritures qu'il engendrera.
 */

/** Une ligne de modèle, réduite à ce qu'il faut pour la diagnostiquer. */
export interface LigneADiagnostiquer {
  numero: string;
  sens: 'DEBIT' | 'CREDIT';
}

/**
 * LE DON MANUEL EN NUMÉRAIRE · la seule opération de ce module qui aille
 * légitimement d'un compte de produit à la trésorerie, sans aucun tiers.
 *
 * SYCEBNL, Partie 3 ch. 4 § 3 : les dons, legs, denier du culte, zakat, dîme,
 * célébrations, mécénat et parrainage « sont enregistrés dans le compte 704
 * Revenus liés à la générosité ». Il n'y a pas de débiteur : le fait
 * générateur est la remise elle-même. Le même paragraphe range à part les
 * revenus de générosité PROMIS et non encore reçus, qui passent par le compte
 * 475 « Générosités financières à recevoir » · ceux-là ont un tiers, et ce
 * n'est donc pas ce cas-ci.
 *
 * ET CETTE EXCEPTION EST BORNÉE AU SYCEBNL, ce qui n'est pas un détail. Le
 * 7041 est « Revenus liés à la générosité · dons » au plan SYCEBNL et
 * « Ventes de produits résiduels » au plan SYSCOHADA (les deux semis le
 * portent, sous ces deux intitulés). Exempter le 704 sans regarder le
 * référentiel dispenserait une société de tiers sur ses ventes de déchets ·
 * ce serait la DIX-SEPTIÈME occurrence du piège « un numéro, deux sens », et
 * la première qu'une exception aurait fabriquée.
 */
const PRODUITS_SANS_TIERS_SYCEBNL = ['704'];

const CLASSE_CHARGE = '6';
const CLASSE_PRODUIT = '7';
const CLASSE_TIERS = '4';
const CLASSE_TRESORERIE = '5';

function citationDuReferentiel(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL
    ? "SYCEBNL, fonctionnement du compte 40 · le compte est crédité des FACTURES par le débit de la classe 6 et " +
        'du compte 445, PUIS débité des RÈGLEMENTS par le crédit des comptes de trésorerie. Deux écritures.'
    : "Guide d'application du SYSCOHADA révisé, Partie 1 ch. 2 § 1.1 · « Recommandation SYSCOHADA (flux de " +
        'trésorerie) : contrepartie systématique = 401 pour les achats de biens/services (hors immobilisations) ; ' +
        '481 ou 404 pour les immobilisations. »';
}

/**
 * Diagnostique un modèle de saisie du dossier.
 *
 * Rend la liste des avertissements · vide quand il n'y a rien à dire. Le
 * modèle est enregistré dans tous les cas : cette fonction ne lève jamais.
 *
 * LE DÉCLENCHEUR, EN TROIS CONDITIONS CUMULATIVES. Le modèle porte un compte
 * de NATURE (charge débitée ou produit crédité), il porte une TRÉSORERIE en
 * face, et il ne porte AUCUN compte de tiers. C'est exactement l'écriture que
 * les deux textes remplacent par deux. Un modèle qui porte déjà une ligne de
 * classe 4 ne déclenche rien, même s'il touche aussi la trésorerie : c'est le
 * cas d'une facture réglée partiellement le jour même, où le tiers est nommé.
 */
export function diagnostiquerTiers(
  lignes: LigneADiagnostiquer[],
  referentiel: Referentiel,
): string[] {
  const chargesDebitees = lignes.filter(
    (l) => l.sens === 'DEBIT' && l.numero.startsWith(CLASSE_CHARGE),
  );
  const produitsCredites = lignes
    .filter((l) => l.sens === 'CREDIT' && l.numero.startsWith(CLASSE_PRODUIT))
    .filter(
      (l) =>
        !(
          referentiel === Referentiel.SYCEBNL &&
          PRODUITS_SANS_TIERS_SYCEBNL.some((r) => l.numero.startsWith(r))
        ),
    );
  const aUnTiers = lignes.some((l) => l.numero.startsWith(CLASSE_TIERS));
  const aUneTresorerie = lignes.some((l) => l.numero.startsWith(CLASSE_TRESORERIE));

  // Aucun compte de nature, ou déjà un tiers, ou aucune trésorerie en face :
  // rien à dire. Un virement interne (deux comptes 5) tombe ici.
  if (aUnTiers || !aUneTresorerie) return [];
  if (chargesDebitees.length === 0 && produitsCredites.length === 0) return [];

  const comptes = [...chargesDebitees, ...produitsCredites].map((l) => l.numero);
  const sens = chargesDebitees.length > 0 ? 'La CHARGE' : 'Le PRODUIT';

  return [
    `${sens} de ce modèle (${comptes.join(', ')}) est soldé DIRECTEMENT sur un compte de trésorerie, ` +
      "sans passer par un compte de tiers. Les deux référentiels demandent DEUX écritures : la facture, qui " +
      'crée la dette ou la créance sur le tiers, puis le règlement, qui la solde par la trésorerie. ' +
      citationDuReferentiel(referentiel) +
      " CE QUE CETTE ÉCRITURE COÛTE : le compte du tiers reste vide, et ni la balance âgée, ni l'échéancier, " +
      'ni le lettrage, ni la circularisation ne peuvent dire à qui cette somme est due ou due par qui. ' +
      "OmegaX N'EMPÊCHE PAS d'enregistrer ce modèle · il ne connaît pas la nature de votre opération, et " +
      'certaines se soldent légitimement sur la trésorerie (des frais bancaires que le relevé justifie seul, ' +
      'un don manuel reçu en numéraire). Vérifiez laquelle est la vôtre avant de vous en servir.',
  ];
}
