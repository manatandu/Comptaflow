import type { Exercice, Referentiel, TypeRegularisation } from './types';

/**
 * LES CINQ RÉGULARISATIONS À L'ÉCRAN (audit final F67). Le serveur servait la
 * charge à payer et le produit à recevoir, l'écran n'en connaissait que trois
 * et n'envoyait jamais la nature du tiers · le rattachement décrit comme
 * livré ne s'accomplissait pas.
 *
 * La nature du tiers décide du compte de rattachement, que le SERVEUR résout
 * (`RegularisationService.compteRattachement`) · l'écran ne propose que les
 * natures que la table du serveur ouvre pour le type, et un spec les relit
 * dans sa source. Une charge à payer sur un client est une dette envers un
 * client (419), un produit à recevoir sur un fournisseur une créance sur
 * fournisseur (409) · aucune des deux n'est offerte.
 */

export type NatureTiers = 'FOURNISSEURS' | 'CLIENTS' | 'PERSONNEL' | 'ORGANISMES_SOCIAUX' | 'ETAT';

export const LIBELLE_NATURE_TIERS: Record<NatureTiers, string> = {
  FOURNISSEURS: 'Fournisseurs',
  CLIENTS: 'Clients, adhérents et usagers',
  PERSONNEL: 'Personnel',
  ORGANISMES_SOCIAUX: 'Organismes sociaux',
  ETAT: 'État et collectivités publiques',
};

export function estRattachement(type: TypeRegularisation): boolean {
  return type === 'CHARGE_A_PAYER' || type === 'PRODUIT_A_RECEVOIR';
}

/** Le compte de gestion porte une charge (classe 6) ou un produit (classe 7). */
export function porteUneCharge(type: TypeRegularisation): boolean {
  return type === 'CHARGE_CONSTATEE_AVANCE' || type === 'CHARGE_A_PAYER';
}

export function naturesTiersProposees(type: TypeRegularisation): NatureTiers[] {
  if (type === 'CHARGE_A_PAYER') return ['FOURNISSEURS', 'PERSONNEL', 'ORGANISMES_SOCIAUX', 'ETAT'];
  if (type === 'PRODUIT_A_RECEVOIR') return ['CLIENTS', 'PERSONNEL', 'ORGANISMES_SOCIAUX', 'ETAT'];
  return [];
}

/**
 * LES EXERCICES OÙ UNE RÉGULARISATION SE REPREND · ouverts et POSTÉRIEURS à
 * celui de la constatation (audit final F79), la règle que le serveur oppose
 * (`RegularisationService.exercicePosterieur`). La liste proposait tout autre
 * exercice ouvert, antérieur compris.
 */
export function exercicesDeReprise<E extends Pick<Exercice, 'id' | 'dateDebut' | 'statut'>>(
  exercices: E[],
  exerciceConstatationId: string,
): E[] {
  const constatation = exercices.find((e) => e.id === exerciceConstatationId);
  if (!constatation) return [];
  const debut = new Date(constatation.dateDebut).getTime();
  return exercices.filter((e) => e.statut === 'OUVERT' && new Date(e.dateDebut).getTime() > debut);
}

/**
 * LE MOMENT DE LA REPRISE DÉPEND DU TYPE AUTANT QUE DU RÉFÉRENTIEL (audit final
 * F208). La bulle de la colonne « Reprise » ne lisait que le référentiel, et
 * annonçait « à la fin de l'exercice concerné » à toute ligne d'un dossier
 * SYCEBNL, charge à payer comprise, que le serveur contre-passe pourtant à
 * l'ouverture. Même règle que `dateReprise` du serveur, que l'écran ne fait
 * que dire · il ne calcule aucune date.
 *
 * Le rattachement (charge à payer, produit à recevoir) se contre-passe à
 * l'OUVERTURE des deux côtés · les fiches des comptes 40 et 41 des deux plans
 * écrivent la même phrase (« À l'ouverture de l'exercice ces écritures sont
 * contre-passées »). Les 476 et 477 vont à l'ouverture au SYSCOHADA, qui la
 * recommande (Guide, Partie 1 ch. 6, § 5.5 et § 6.5), et à la fin au SYCEBNL.
 * La subvention pluriannuelle va à la fin des deux côtés (SYCEBNL, Partie 3
 * ch. 6, section 1 · « à la fin de chaque exercice ultérieur concerné »).
 */
export type MomentReprise = 'OUVERTURE' | 'FIN';

export function momentDeReprise(referentiel: Referentiel | undefined, type: TypeRegularisation): MomentReprise {
  if (estRattachement(type)) return 'OUVERTURE';
  if (referentiel === 'SYSCOHADA' && type !== 'SUBVENTION_PLURIANNUELLE') return 'OUVERTURE';
  return 'FIN';
}

/**
 * Le texte de la bulle, ligne par ligne. La source citée est celle que le
 * référentiel du dossier lui oppose · les fiches des comptes 40 et 41 portent
 * la même phrase dans les deux plans, mais ce ne sont pas les mêmes textes.
 */
export function aideDateReprise(
  referentiel: Referentiel | undefined,
  type: TypeRegularisation,
): { texte: string; source: string } {
  const syscohada = referentiel === 'SYSCOHADA';
  if (type === 'CHARGE_A_PAYER') {
    return {
      texte:
        "La charge à payer se contre-passe À L'OUVERTURE de l'exercice suivant, dans les deux référentiels, ou le compte du fournisseur la solde à la réception de la facture.",
      source: syscohada ? 'AUDCIF, Titre VII, fiche du compte 40' : 'SYCEBNL, Partie 2 ch. 3, fiche du compte 40',
    };
  }
  if (type === 'PRODUIT_A_RECEVOIR') {
    return {
      texte:
        "Le produit à recevoir se contre-passe À L'OUVERTURE de l'exercice suivant, dans les deux référentiels, ou le compte du client le solde à l'émission de la facture.",
      source: syscohada ? 'AUDCIF, Titre VII, fiche du compte 41' : 'SYCEBNL, Partie 2 ch. 3, fiche du compte 41',
    };
  }
  if (type === 'SUBVENTION_PLURIANNUELLE') {
    // Chaque dossier lit SON texte · le SYCEBNL traite nommément le cas, le
    // SYSCOHADA admet la reprise « en fin de n+1 » d'un produit constaté
    // d'avance, sans le recommander.
    return syscohada
      ? {
          texte:
            "La quote-part de la subvention se reprend À LA FIN de l'exercice concerné · le référentiel admet cette date pour un produit constaté d'avance.",
          source: 'Guide SYSCOHADA, Partie 1 ch. 6, § 6.5',
        }
      : {
          texte: 'La quote-part de la subvention se reprend À LA FIN de chaque exercice ultérieur concerné.',
          source: 'SYCEBNL, Partie 3 ch. 6, section 1',
        };
  }
  if (syscohada) {
    return {
      texte:
        "La reprise se passe À L'OUVERTURE de l'exercice concerné : le référentiel permet les deux dates, mais recommande vivement la contre-passation à l'ouverture · reprise seulement à la clôture, la part différée reste au bilan douze mois de plus et fausse toutes les situations intermédiaires de l'année.",
      source:
        type === 'CHARGE_CONSTATEE_AVANCE'
          ? 'Guide SYSCOHADA, Partie 1 ch. 6, § 5.5'
          : 'Guide SYSCOHADA, Partie 1 ch. 6, § 6.5',
    };
  }
  return {
    texte:
      "La quote-part différée se reprend À LA FIN de l'exercice concerné, comme la Partie 3 ch. 6 le fait pour la subvention pluriannuelle, et non par contre-passation à son ouverture.",
    source: "SYCEBNL, Partie 3 ch. 6 · la fiche du compte 47 ne fixe pas la date de reprise",
  };
}
