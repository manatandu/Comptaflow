/**
 * ÉCART DE CHANGE RÉALISÉ AU RÈGLEMENT D'UNE CRÉANCE OU D'UNE DETTE EN DEVISE
 * (relevé CPCC C2, ligne A6 du suivi, décision de Manasse du 2026-10-02).
 * Règles pures, sans Prisma.
 *
 * LE TEXTE. AUDCIF art. 55 · « À la date de règlement des créances et dettes,
 * les pertes et gains de change à cette date sont constatés par rapport à
 * leur coût historique. » Titre VIII ch. 22 § 2.3 · « Ils sont constatés par
 * différence entre la valeur d'encaissement ou de règlement et la valeur
 * d'origine », puis « Créances et dettes commerciales → résultat
 * d'exploitation · pertes de change → débit du compte 656 [...] ; gains de
 * change → crédit du compte 756 », et « Opérations à caractère financier
 * (emprunt bancaire en devise, liquidités en devises…) → résultat financier ·
 * 676 [...] ; 776 ». Les fiches des comptes 65, 67, 75 et 77 du Titre VII
 * disent la même chose (exclusion du 67 · « Les pertes de change sur créances
 * et dettes commerciales, inscrites en résultat d'exploitation → 656 »).
 *
 * ANOMALIE DU TEXTE, SIGNALÉE ET NON CORRIGÉE · l'art. 53 range les écarts
 * d'une créance née et réglée dans le même exercice « dans les charges
 * financières ou les produits financiers », quand le ch. 22 § 2.3 et les
 * fiches 656 et 756 mettent l'écart COMMERCIAL en résultat d'exploitation.
 * OmegaX suit le compte que le plan et sa fiche nomment (656, 756), seul à
 * dire un numéro ; l'art. 53 n'en nomme aucun.
 *
 * UN NUMÉRO, DEUX PLANS. Le SYCEBNL n'ouvre NI 656 NI 756 (son 65 n'a que 651,
 * 652, 654, 657, 658, 659 ; son 75 que 751, 752, 754, 758, 759, plan des
 * comptes et fiches, Partie 2 ch. 2 et ch. 3). Ses fiches des comptes 67 et 77
 * réservent le 676 et le 776 aux « opérations ayant un caractère financier
 * (emprunt bancaire en devise, liquidités en devises etc.) », et la fiche du
 * 75 l'écrit en exclusion (« les profits de change sur opérations ayant un
 * caractère financier [...] → 776 »). Pour une créance ou une dette
 * COMMERCIALE, le texte du SYCEBNL ne donne AUCUN compte · seule la maquette de
 * la NOTE 19 des projets de développement imprime une rubrique « Perte de
 * change sur créances » parmi les AUTRES CHARGES (65), sans compte
 * (`correspondance-notes-projets.ts`, anomalie n° 4). OmegaX n'en invente
 * aucun · le cabinet CHOISIT le sous-compte de son dossier, sous le 65 pour
 * une perte, sous le 75 pour un gain (la rubrique de la note 19 et l'exclusion
 * de la fiche du 75, qui n'écarte du 75 que le change FINANCIER), jamais le
 * 676 ni le 776, qui relèvent du poste TK et y seraient comptés à tort.
 *
 * LE TIERS SE SOLDE AU COÛT HISTORIQUE, DANS SA DEVISE. La ligne du tiers
 * porte la contrevaleur historique de ce qu'elle éteint (art. 55), avec le
 * montant réglé en devise · le tiers est soldé dans sa devise ET en francs.
 * La trésorerie porte ce qui a réellement été payé ou encaissé, au cours du
 * jour du règlement. L'écart a SA ligne, au compte que le texte donne, et la
 * pièce reste équilibrée · c'est l'écriture du séminaire CPCC (exemple
 * MBIKAYI / NZUZI · « D/ 401 1 008 000, D/ 656 42 000, C/ 571 1 050 000 »),
 * témoin et non source.
 */

import type { SensReglement } from './reglement-tiers';

export type Referentiel = 'SYCEBNL' | 'SYSCOHADA';
export type NatureCreanceDette = 'COMMERCIALE' | 'FINANCIERE';

/**
 * LA NATURE D'UNE CRÉANCE OU D'UNE DETTE se lit sur son compte, jamais
 * devinée au-delà de ce que le texte range. 40 et 41 (fournisseurs, clients)
 * sont les dettes et créances COMMERCIALES du § 2.3 ; 16 (emprunts) et 27
 * (prêts) les opérations FINANCIÈRES qu'il cite (« emprunt bancaire en
 * devise »). Tout autre compte · `null`, la nature reste au cabinet.
 */
export function natureDuCompte(numero: string): NatureCreanceDette | null {
  if (numero.startsWith('40') || numero.startsWith('41')) return 'COMMERCIALE';
  if (numero.startsWith('16') || numero.startsWith('27')) return 'FINANCIERE';
  return null;
}

/**
 * LES COMPTES QUE LE TEXTE DONNE, en numéro semé à huit chiffres (les deux
 * semis, `compte-seed.ts` et `compte-seed-syscohada.ts`, les ouvrent tels
 * quels · 65600000, 75600000, 67600000, 77600000 au SYSCOHADA ; 67600000 et
 * 77600000 seuls au SYCEBNL). `null` avec le motif quand le texte n'en donne
 * aucun.
 */
export function comptesPrescrits(
  referentiel: Referentiel,
  nature: NatureCreanceDette | null,
): { perte: string; gain: string } | { perte: null; gain: null; motif: string } {
  if (nature === null) {
    return {
      perte: null,
      gain: null,
      motif:
        "La nature de ce compte (commerciale ou financière) ne se lit pas sur son numéro · choisissez le compte " +
        "d'écart de change (AUDCIF, Titre VIII ch. 22 § 2.3).",
    };
  }
  if (nature === 'FINANCIERE') return { perte: '67600000', gain: '77600000' };
  if (referentiel === 'SYSCOHADA') return { perte: '65600000', gain: '75600000' };
  return {
    perte: null,
    gain: null,
    motif: MOTIF_SYCEBNL_SANS_COMPTE,
  };
}

export const MOTIF_SYCEBNL_SANS_COMPTE =
  "Le SYCEBNL ne donne aucun compte pour l'écart de change réalisé sur une créance ou une dette commerciale · " +
  "son plan n'ouvre ni 656 ni 756, et ses fiches des comptes 67 et 77 réservent le 676 et le 776 aux opérations " +
  "à caractère financier. Choisissez le sous-compte de votre dossier, sous le 65 pour une perte, sous le 75 pour un gain.";

/**
 * LE COMPTE CHOISI par le cabinet, quand il en choisit un. Il doit être de la
 * racine que le texte donne · le 656 ou le 756 (et leurs subdivisions) au
 * SYSCOHADA commercial, le 676 ou le 776 au financier ; au SYCEBNL
 * commercial, un compte du 65 (hors 659, provisions) pour une perte, du 75
 * (hors 759, reprises) pour un gain, jamais le 676 ni le 776. `null` si
 * admis.
 */
export function motifRefusCompteEcart(params: {
  referentiel: Referentiel;
  nature: NatureCreanceDette | null;
  ecart: 'PERTE' | 'GAIN';
  numero: string;
}): string | null {
  const { referentiel, nature, ecart, numero } = params;
  const lEcart = ecart === 'PERTE' ? 'Une perte' : 'Un gain';
  const prescrits = comptesPrescrits(referentiel, nature);
  if (prescrits.perte !== null) {
    const racine = (ecart === 'PERTE' ? prescrits.perte : prescrits.gain).slice(0, 3);
    if (numero.startsWith(racine)) return null;
    const objet = nature === 'FINANCIERE' ? 'sur une opération financière' : 'sur une créance ou une dette commerciale';
    return `${lEcart} de change ${objet} se passe au ${racine} (AUDCIF, Titre VIII ch. 22 § 2.3) · le compte ${numero} n'en est pas.`;
  }
  if (nature === null) {
    // Nature non lue · le cabinet tranche, dans la seule classe de l'écart.
    const classe = ecart === 'PERTE' ? '6' : '7';
    return numero.startsWith(classe) ? null : `${lEcart} de change se passe en classe ${classe} · le compte ${numero} n'en est pas.`;
  }
  // SYCEBNL, créance ou dette commerciale.
  if (numero.startsWith('676') || numero.startsWith('776')) {
    return (
      `Le ${numero.slice(0, 3)} est réservé par le SYCEBNL aux opérations à caractère financier (fiches des comptes 67 et 77) · ` +
      "l'écart d'une créance ou d'une dette commerciale va au sous-compte du dossier, sous le 65 ou le 75."
    );
  }
  if (ecart === 'PERTE') {
    if (numero.startsWith('65') && !numero.startsWith('659')) return null;
    return `Une perte de change commerciale va sous le 65 (autres charges), hors 659 · le compte ${numero} n'en est pas.`;
  }
  if (numero.startsWith('75') && !numero.startsWith('759')) return null;
  return `Un gain de change commercial va sous le 75 (autres produits), hors 759 · le compte ${numero} n'en est pas.`;
}

/** Une facture en devise, telle que le règlement la lit. */
export interface FactureEnDevise {
  id: string;
  /** Dû en francs, positif, dans le sens de l'échéance (sa contrevaleur historique). */
  francs: number;
  /** Montant en devise, positif. */
  montantDevise: number;
  date: Date;
}

const centimes = (x: number) => Math.round(x * 100);

/**
 * LE COÛT HISTORIQUE DE CE QUI EST RÉGLÉ (art. 55). Réglée en entier, une
 * facture rend sa contrevaleur d'origine au centime. Réglée en partie, la
 * part de sa contrevaleur dans la proportion du montant en devise réglé · une
 * facture de 1 160 USD à 1 680 réglée de 600 USD éteint 1 008 000, soit 600 ×
 * 1 680. Plusieurs factures se règlent dans l'ordre de leurs dates, les plus
 * anciennes d'abord (convention d'OmegaX, celle des lots de virements) · seule
 * la dernière atteinte peut l'être en partie.
 */
export function coutHistoriqueRegle(factures: FactureEnDevise[], montantDeviseRegle: number): number {
  const ordonnees = [...factures].sort((a, b) => a.date.getTime() - b.date.getTime());
  let reste = montantDeviseRegle;
  let total = 0;
  for (const f of ordonnees) {
    if (reste <= 1e-9) break;
    if (reste + 1e-9 >= f.montantDevise) {
      total += centimes(f.francs);
      reste -= f.montantDevise;
    } else {
      total += centimes((f.francs * reste) / f.montantDevise);
      reste = 0;
    }
  }
  return total / 100;
}

/**
 * L'ÉCART, signé · positif pour une PERTE, négatif pour un GAIN, dans les deux
 * sens de règlement. Payer un fournisseur plus cher en francs que la valeur
 * d'origine de la dette est une perte ; encaisser d'un client moins que la
 * valeur d'origine de la créance en est une aussi.
 */
export function ecartSigne(sens: SensReglement, historique: number, francsPayes: number): number {
  const brut = sens === 'FOURNISSEUR' ? francsPayes - historique : historique - francsPayes;
  return Math.round(brut * 100) / 100;
}

export interface LigneDuReglementEnDevise {
  compteId: string;
  debit?: number;
  credit?: number;
  libelle: string;
  deviseId?: string;
  montantDevise?: number;
  coursApplique?: number;
}

/**
 * LES LIGNES DU RÈGLEMENT EN DEVISE · débits puis crédits, comme toute pièce
 * proposée (client/src/lib/ordre-ecriture.ts). Le tiers au coût historique et
 * au montant réglé en devise (son cours se déduit des deux montants, celui des
 * factures qu'il éteint) ; la trésorerie au montant payé, en devise au cours
 * du jour si le moyen de paiement est en devise ; l'écart sur sa ligne.
 */
export function lignesDuReglementEnDevise(p: {
  sens: SensReglement;
  compteTiersId: string;
  compteTresorerieId: string;
  compteEcartId: string | null;
  historique: number;
  francsPayes: number;
  deviseId: string;
  montantDevise: number;
  coursReglement: number;
  tresorerieEnDevise: boolean;
  libelle: string;
}): LigneDuReglementEnDevise[] {
  const ecart = ecartSigne(p.sens, p.historique, p.francsPayes);
  if (ecart !== 0 && !p.compteEcartId) {
    throw new Error("Un écart de change sans compte d'écart · le règlement l'aurait laissé hors de la pièce.");
  }
  const tiers = { compteId: p.compteTiersId, libelle: p.libelle, deviseId: p.deviseId, montantDevise: p.montantDevise };
  const tresorerie = {
    compteId: p.compteTresorerieId,
    libelle: p.libelle,
    ...(p.tresorerieEnDevise ? { deviseId: p.deviseId, montantDevise: p.montantDevise, coursApplique: p.coursReglement } : {}),
  };
  const libelleEcart = `${ecart > 0 ? 'Perte' : 'Gain'} de change · ${p.libelle}`.slice(0, 190);
  const ligneEcart =
    ecart === 0
      ? null
      : ecart > 0
        ? { compteId: p.compteEcartId!, debit: ecart, libelle: libelleEcart }
        : { compteId: p.compteEcartId!, credit: -ecart, libelle: libelleEcart };

  const debits: LigneDuReglementEnDevise[] = [];
  const credits: LigneDuReglementEnDevise[] = [];
  if (p.sens === 'FOURNISSEUR') {
    debits.push({ ...tiers, debit: p.historique });
    credits.push({ ...tresorerie, credit: p.francsPayes });
  } else {
    debits.push({ ...tresorerie, debit: p.francsPayes });
    credits.push({ ...tiers, credit: p.historique });
  }
  if (ligneEcart) (ligneEcart.debit !== undefined ? debits : credits).push(ligneEcart);
  return [...debits, ...credits];
}

/**
 * L'ÉCART D'UN GROUPE DE LETTRAGE soldé dans sa devise et non en francs ·
 * c'est le règlement du solde passé à un autre cours que l'origine (le
 * second règlement du séminaire, 560 USD à 1 900 contre 1 680). Rendu SIGNÉ
 * comme `ecartSigne` (positif = perte), ou `null` · plus d'une devise, solde
 * en devise non nul, ou rien en devise. Zéro quand rien ne reste en francs.
 */
export function ecartDuGroupe(
  lignes: Array<{ debit: number; credit: number; deviseId: string | null; montantDevise: number | null }>,
): { deviseId: string; ecart: number } | null {
  const enDevise = lignes.filter((l) => l.deviseId !== null && l.montantDevise !== null);
  if (enDevise.length === 0) return null;
  const devises = new Set(enDevise.map((l) => l.deviseId));
  if (devises.size !== 1) return null;
  const soldeDevise = enDevise.reduce((s, l) => s + (l.debit - l.credit >= 0 ? 1 : -1) * Number(l.montantDevise), 0);
  if (Math.abs(soldeDevise) > 0.005) return null;
  const soldeFrancs = lignes.reduce((s, l) => s + centimes(l.debit) - centimes(l.credit), 0) / 100;
  // Un solde débiteur restant sur le tiers se ferme par un CRÉDIT du tiers,
  // dont la contrepartie est une charge · c'est une perte, que le compte soit
  // un client ou un fournisseur.
  return { deviseId: [...devises][0]!, ecart: soldeFrancs };
}

/** Les deux lignes qui ferment l'écart d'un groupe · tiers et compte d'écart. */
export function lignesEcartDuGroupe(p: {
  compteTiersId: string;
  compteEcartId: string;
  ecart: number;
  libelle: string;
}): LigneDuReglementEnDevise[] {
  const montant = Math.abs(p.ecart);
  return p.ecart > 0
    ? [
        { compteId: p.compteEcartId, debit: montant, libelle: p.libelle },
        { compteId: p.compteTiersId, credit: montant, libelle: p.libelle },
      ]
    : [
        { compteId: p.compteTiersId, debit: montant, libelle: p.libelle },
        { compteId: p.compteEcartId, credit: montant, libelle: p.libelle },
      ];
}
