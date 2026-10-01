/**
 * LA SUBVENTION D'INVESTISSEMENT REÇUE EN NUMÉRAIRE, RATTACHÉE AU BIEN (lot 5,
 * 2026-10-01) · règles pures.
 *
 * AUDCIF Titre VIII ch. 17 § 3.2 · « accroissement des capitaux propres à la
 * date d'octroi de la subvention (crédit du compte 14) », puis reprise « au fur
 * et à mesure de l'exécution du plan d'amortissement du bien ». Le SYCEBNL y
 * renvoie (Partie 3 ch. 1 § 2.5.1) et l'Application 3 du Guide le chiffre ·
 * notification au 4731 / 1417, fonds en banque, PUIS achat du terrain et de
 * l'entrepôt au 4812. Le 14 crédité n'a donc aucun lien avec le bien · le
 * cabinet le DÉCLARE, montant compris (une subvention de 120 000 000 répartie
 * 20 000 000 au terrain et 100 000 000 à l'entrepôt).
 *
 * Rien ici ne poste · le service vérifie ces refus AVANT toute écriture.
 */

export type Ref = 'SYSCOHADA' | 'SYCEBNL';
export type NatureReduction = 'REMBOURSEMENT' | 'NON_VERSEE';

const centimes = (x: number) => Math.round(x * 100) / 100;

/** Le compte de la subvention · un 14 de détail, aux deux plans. */
export function motifRefusCompteSubvention(numero: string, estDetail: boolean): string | null {
  if (!numero.startsWith('14')) {
    return "Une subvention d'investissement se lit au compte 14 (AUDCIF Titre VIII ch. 17 § 3.2) · choisissez un compte 14.";
  }
  if (!estDetail) return 'Choisissez un compte de détail du 14, pas un compte de regroupement.';
  return null;
}

/**
 * L'OCTROI · la première écriture de la subvention, sans laquelle rien ne se
 * rattache. Fiche du compte 14, « lors de l'octroi de la subvention » ·
 *
 * SYCEBNL (Partie 2 ch. 3) · « est crédité le compte 14 [...] par le débit du
 * compte 4731 – Subventions d'équipement à recevoir » ; l'Application 3 du
 * Guide passe la notification au 4731 contre le 1417.
 *
 * AUDCIF (Titre VII) · « crédité du montant de la subvention, par le débit du
 * compte approprié de la classe 4, TEL QUE 4494 (État, subventions
 * d'équipement à recevoir) ou 4582 (Organismes internationaux, subventions à
 * recevoir) » · « tel que » ouvre la classe 4 et donne deux exemples, proposés
 * en tête. Un numéro, deux sens · le 473 SYSCOHADA est celui des
 * intermédiaires (4731 « Mandants », 4739 « fonds global d'allocation »),
 * refusé là où le SYCEBNL l'impose.
 *
 * La subvention EN NATURE (débit d'un compte de classe 2) n'entre pas ici ·
 * elle naît avec le bien, par « Nouvelle immobilisation », mode subvention.
 */
export const CONTREPARTIES_OCTROI_PROPOSEES: Record<Ref, readonly string[]> = {
  SYCEBNL: ['47310000'],
  SYSCOHADA: ['44940000', '45820000'],
};

export function motifRefusContrepartieOctroi(referentiel: Ref, numero: string): string | null {
  if (referentiel === 'SYCEBNL') {
    return numero.startsWith('4731')
      ? null
      : "L'octroi d'une subvention d'investissement se passe au débit du 4731 « Subventions d'équipement à recevoir » (SYCEBNL, fiche du compte 14).";
  }
  if (!numero.startsWith('4')) {
    return "L'octroi d'une subvention d'investissement se passe au débit d'un compte de tiers de la classe 4, tel que 4494 ou 4582 (AUDCIF Titre VII, fiche du compte 14).";
  }
  if (numero.startsWith('473')) {
    return 'Au SYSCOHADA, le 473 est celui des intermédiaires (mandants, fonds global d\'allocation) · une subvention à recevoir se porte au 4494 (État) ou au 4582 (organismes internationaux).';
  }
  return null;
}

/**
 * § 4.4 · « les subventions sont ventilées proportionnellement entre les
 * différents composants, sauf si elles ne sont pas significatives. Si leur
 * montant n'est pas significatif ou si la ventilation n'est pas possible, les
 * subventions sont amorties et reprises au même rythme que l'amortissement du
 * composant structure. » Proposé au prorata des valeurs d'entrée, le dernier
 * prenant le reste au centime (décision D-13).
 */
export function ventilerAuProrata(
  montant: number,
  biens: readonly { id: string; valeurOrigine: number }[],
): { immobilisationId: string; montant: number }[] {
  const total = biens.reduce((t, b) => t + b.valeurOrigine, 0);
  let reparti = 0;
  return biens.map((b, i) => {
    const part = i === biens.length - 1 ? centimes(montant - reparti) : total > 0 ? centimes((montant * b.valeurOrigine) / total) : 0;
    reparti = centimes(reparti + part);
    return { immobilisationId: b.id, montant: part };
  });
}

/**
 * Un bien à composants dont la subvention reste sur la seule structure ·
 * permis par le § 4.4, mais avec son MOTIF écrit (non significatif,
 * ventilation impossible), sans quoi l'oubli et le choix se confondent.
 */
export function motifRefusSansVentilation(o: {
  principalAvecComposants: boolean;
  composantsRattaches: number;
  motif: string | null | undefined;
}): string | null {
  if (!o.principalAvecComposants || o.composantsRattaches > 0) return null;
  if (o.motif && o.motif.trim().length >= 3) return null;
  return "Ce bien a des composants · la subvention se ventile entre eux au prorata, sauf si elle n'est pas significative ou si la ventilation n'est pas possible (AUDCIF Titre VIII ch. 17 § 4.4). Ventilez-la, ou écrivez le motif qui la laisse sur la structure.";
}

/**
 * LA CONTREPARTIE D'UNE RÉDUCTION · un compte de tiers (classe 4).
 *
 * Remboursement (§ 4.3.1) · au SYCEBNL, la fiche du compte 47 nomme le 4739
 * « subvention à reverser » (« la dette relative à la restitution de la part
 * du bénéficiaire au tiers financeur »), PROPOSÉ ; au SYSCOHADA, aucun compte
 * « à reverser » et le 4739 y est le « fonds global d'allocation » · un numéro,
 * deux sens, refusé. Le cabinet choisit le tiers (449 pour l'État, 458 pour un
 * organisme international, 4712 sinon · décision D-14).
 *
 * Non versée (§ 4.7) · la créance annulée, au 4731 (SYCEBNL) ou au 4494 /
 * 4582 (SYSCOHADA), choisie elle aussi.
 */
export function motifRefusContrepartieReduction(referentiel: Ref, nature: NatureReduction, numero: string): string | null {
  if (!numero.startsWith('4')) {
    return nature === 'REMBOURSEMENT'
      ? 'La subvention remboursable est une dette envers le concédant · choisissez un compte de tiers (classe 4).'
      : 'La subvention non versée annule une créance sur le concédant · choisissez le compte de tiers qui la porte (classe 4).';
  }
  if (referentiel === 'SYSCOHADA' && nature === 'REMBOURSEMENT' && numero.startsWith('4739')) {
    return "Au SYSCOHADA, le 4739 est le « fonds global d'allocation », pas une subvention à reverser · choisissez le tiers concédant (449 État, 458 organisme international, 4712 sinon).";
  }
  return null;
}

/** Le compte proposé pour un remboursement · celui que le texte du dossier nomme. */
export function contrepartieRemboursementProposee(referentiel: Ref): string | null {
  return referentiel === 'SYCEBNL' ? '47390000' : null;
}

/**
 * Une réduction ne dépasse ni ce qui reste du rattachement, ni ce qui reste
 * non repris sur le bien · « en réduisant le solde du compte 14 du montant
 * remboursable » (§ 4.3.1) ; au-delà, le texte ne dit pas où irait l'excédent.
 */
export function motifRefusReduction(o: { montant: number; resteRattachement: number; soldeNonReprisBien: number }): string | null {
  if (!(o.montant > 0)) return 'Le montant doit être positif.';
  const plafond = centimes(Math.min(o.resteRattachement, o.soldeNonReprisBien));
  if (centimes(o.montant) > plafond) {
    return `La réduction dépasse ce qui reste de la subvention non reprise sur ce bien (${plafond.toFixed(2)}) · le texte réduit le solde du 14 (AUDCIF Titre VIII ch. 17 § 4.3.1, § 4.7) et ne dit pas où irait l'excédent.`;
  }
  return null;
}

/**
 * Les lignes de l'écriture d'une réduction.
 *  · REMBOURSEMENT · D 14 / C tiers (§ 4.3.1).
 *  · NON_VERSEE · D 6515 / C créance, puis D 14 / C 799 (§ 4.7 · « dans le
 *    compte 6515 Pertes sur créances autres débiteurs pour les subventions
 *    d'exploitation et d'investissement » ; « le compte 14 [...] sera débité
 *    par le crédit du compte 799 »). Une seule pièce, quatre lignes.
 */
export function lignesReduction(o: {
  nature: NatureReduction;
  montant: number;
  compte14Id: string;
  contrepartieId: string;
  compte6515Id?: string;
  compte799Id?: string;
}): { compteId: string; debit: number; credit: number }[] {
  const m = centimes(o.montant);
  if (o.nature === 'REMBOURSEMENT') {
    return [
      { compteId: o.compte14Id, debit: m, credit: 0 },
      { compteId: o.contrepartieId, debit: 0, credit: m },
    ];
  }
  return [
    { compteId: o.compte6515Id!, debit: m, credit: 0 },
    { compteId: o.contrepartieId, debit: 0, credit: m },
    { compteId: o.compte14Id, debit: m, credit: 0 },
    { compteId: o.compte799Id!, debit: 0, credit: m },
  ];
}

export const COMPTE_PERTES_AUTRES_DEBITEURS = '65150000';
export const COMPTE_REPRISE_SUBVENTION = '79900000';
