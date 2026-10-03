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
 * COMMERCIALE, aucune subdivision NOMMÉE ne reçoit l'écart · TRANCHÉ PAR
 * MANASSE le 2026-10-03 (« réfère-toi à la loi », décision D2) · il tombe au
 * RÉSIDU de chaque fiche. Fiche 65 · 651 Pertes sur créances
 * (irrécouvrables), 652 Subventions accordées, 654 Dons en nature, 657
 * Pénalités, 658 CHARGES DIVERSES, la dépréciation exclue vers le 659 · la
 * perte au 658 (semé 65800000). Fiche 75 · 751 Profits sur créances, 752
 * Contribution du fondateur, 754 Dons en nature, 758 Produits divers (7582,
 * 7583, 7588 AUTRES PRODUITS DIVERS), « le compte 758 - Produits divers
 * enregistre les autres produits non imputables aux autres subdivisions du
 * compte 75 » · le gain au 7588 (semé 75880000). Jamais le 676 ni le 776,
 * réservés au change financier et comptés au poste TK.
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
 * devinée au-delà de ce que le texte range.
 *
 *  · COMMERCIALES · 40 et 41 (fournisseurs, clients), aux deux plans (§ 2.3,
 *    « Créances et dettes commerciales »).
 *  · FINANCIÈRES · les emprunts (§ 2.3, « emprunt bancaire en devise ») ·
 *    UN NUMÉRO, DEUX PLANS · au 16 du SYSCOHADA (Titre VII, « COMPTE 16 :
 *    Emprunts et dettes assimilées ») et au 18 du SYCEBNL (« 18 EMPRUNTS ET
 *    DETTES ASSIMILÉES », Partie 2 ch. 2), dont le 16 est « FONDS
 *    AFFECTÉS » · un fonds de projet lu en emprunt aurait mis son écart au
 *    676. Les dettes de location acquisition, au 17 du SYSCOHADA, que le
 *    bilan range au poste DB parmi les « DETTES FINANCIÈRES ET RESSOURCES
 *    ASSIMILÉES » (Titre IX, poste DD), et au 187 du SYCEBNL, sous son 18
 *    (« 187 Dettes de location-acquisition ») ; le 17 du SYCEBNL est « FONDS
 *    REPORTÉS ». Les prêts, au 27 des deux plans (« AUTRES IMMOBILISATIONS
 *    FINANCIÈRES »). Les fournisseurs d'investissements, au 481 des deux
 *    plans · le ch. 22 § 1.1 dit de l'immobilisation payée à terme en devise
 *    que « la différence constitue une charge ou un produit financier (perte
 *    ou gain de change) ». POUR LA MÊME RAISON, le 404 du SYSCOHADA
 *    (A6 bis, M3) · « Fournisseurs, acquisitions courantes
 *    d'immobilisations » (Titre VII, fiche du compte 40) · c'est le prix payé
 *    d'une immobilisation, que le § 1.1 met en résultat FINANCIER ; lu
 *    commercial par sa racine 40, son écart allait au 656. Le SYCEBNL
 *    n'ouvre pas de 404 (Partie 2 ch. 2).
 *  · SANS NATURE, et dit (A6 bis, M3) · le 414 du SYSCOHADA, « Créances sur
 *    cessions courantes d'immobilisations ». Le § 1.1 ne vise que le prix
 *    PAYÉ par l'acquéreur ; la fiche du compte 41 range la créance parmi les
 *    comptes rattachés au client sans la dire « commerciale » au sens du
 *    § 2.3 · aucun texte lu ne tranche, le cabinet choisit parmi les comptes
 *    de change. Le SYCEBNL n'ouvre pas de 414.
 *  · Tout autre compte · `null`, la nature reste au cabinet, dans les seuls
 *    comptes de change (`racinesAdmises`).
 */
export function natureDuCompte(numero: string, referentiel: Referentiel): NatureCreanceDette | null {
  if (referentiel === 'SYSCOHADA' && numero.startsWith('414')) return null;
  const financieres = referentiel === 'SYSCOHADA' ? ['16', '17', '27', '404', '481'] : ['18', '27', '481'];
  if (financieres.some((r) => numero.startsWith(r))) return 'FINANCIERE';
  if (numero.startsWith('40') || numero.startsWith('41')) return 'COMMERCIALE';
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
  // SYCEBNL commercial · le résidu des fiches 65 et 75 (décision D2).
  return { perte: '65800000', gain: '75880000' };
}

/** La racine d'un compte prescrit · ses zéros de complément retirés (65800000 → 658, 75880000 → 7588). */
export function racineDuPrescrit(numero: string): string {
  return numero.replace(/0+$/, '');
}

/** Une racine admise, et ce qu'elle exclut. */
export interface RacineAdmise {
  racine: string;
  sauf?: string;
}

/**
 * LES RACINES OÙ L'ÉCART PEUT ALLER · l'écran en tient une COPIE
 * (`client/src/lib/ecart-change.ts`), tenue en miroir · son spec relit les
 * cas `CAS_ADMIS` de ce spec-ci et les rejoue :
 *
 *  · nature FINANCIÈRE · 676 ou 776, aux deux plans ;
 *  · nature COMMERCIALE · 656 ou 756 au SYSCOHADA ; au SYCEBNL, le 658 ou le
 *    7588 (décision D2), sous-comptes de détail compris · 651, 652, 654, 657,
 *    659, 751, 752, 754, 7582, 7583 et 759 refusés ;
 *  · nature NON LUE · les seuls comptes de change ou de résidu · 656 ou 676,
 *    756 ou 776 au SYSCOHADA ; 658 ou 676, 7588 ou 776 au SYCEBNL. Jamais une
 *    classe entière · un 601 passait pour un compte de change.
 */
export function racinesAdmises(
  referentiel: Referentiel,
  nature: NatureCreanceDette | null,
  ecart: 'PERTE' | 'GAIN',
): RacineAdmise[] {
  const perte = ecart === 'PERTE';
  const financier: RacineAdmise = { racine: perte ? '676' : '776' };
  const commercial: RacineAdmise =
    referentiel === 'SYSCOHADA' ? { racine: perte ? '656' : '756' } : { racine: perte ? '658' : '7588' };
  if (nature === 'FINANCIERE') return [financier];
  if (nature === 'COMMERCIALE') return [commercial];
  return [commercial, financier];
}

export function compteAdmisPourEcart(racines: RacineAdmise[], numero: string): boolean {
  return racines.some((r) => numero.startsWith(r.racine) && !(r.sauf && numero.startsWith(r.sauf)));
}

const lesRacines = (racines: RacineAdmise[]) =>
  racines.map((r) => (r.sauf ? `le ${r.racine} (hors ${r.sauf})` : `le ${r.racine}`)).join(' ou ');

/**
 * LE COMPTE CHOISI par le cabinet, quand il en choisit un · dans
 * `racinesAdmises`, sous-comptes compris. `null` si admis.
 */
export function motifRefusCompteEcart(params: {
  referentiel: Referentiel;
  nature: NatureCreanceDette | null;
  ecart: 'PERTE' | 'GAIN';
  numero: string;
}): string | null {
  const { referentiel, nature, ecart, numero } = params;
  const racines = racinesAdmises(referentiel, nature, ecart);
  if (compteAdmisPourEcart(racines, numero)) return null;
  const lEcart = ecart === 'PERTE' ? 'Une perte' : 'Un gain';
  if (referentiel === 'SYCEBNL' && nature === 'COMMERCIALE' && (numero.startsWith('676') || numero.startsWith('776'))) {
    return (
      `Le ${numero.slice(0, 3)} est réservé par le SYCEBNL aux opérations à caractère financier (fiches des comptes 67 et 77) · ` +
      "l'écart d'une créance ou d'une dette commerciale va au 658 (perte) ou au 7588 (gain)."
    );
  }
  const objet =
    nature === 'FINANCIERE'
      ? ' sur une opération financière'
      : nature === 'COMMERCIALE'
        ? ' sur une créance ou une dette commerciale'
        : '';
  return `${lEcart} de change${objet} se passe sous ${lesRacines(racines)} (AUDCIF, Titre VIII ch. 22 § 2.3) · le compte ${numero} n'en est pas.`;
}

/** LE LIBELLÉ de l'écart, un seul, accordé · « Perte de change réalisée », « Gain de change réalisé ». */
export function libelleEcartRealise(ecart: number): string {
  return ecart > 0 ? 'Perte de change réalisée' : 'Gain de change réalisé';
}

/**
 * LE COURS ET LES FRANCS D'UN RÈGLEMENT EN DEVISE · même règle que toute
 * ligne en devise (`comptabilite/ligne-en-devise.ts`, AUDCIF art. 52) · le
 * cours saisi donne la contrevaleur ; le débit réel saisi en francs prime, et
 * le cours s'en déduit à six décimales ; les deux saisis doivent s'accorder à
 * la tolérance près. Ni l'un ni l'autre · refus, jamais un cours deviné.
 *
 * RIEN DE NUL NI DE NÉGATIF NE PASSE (A6 bis, B1) · un règlement de 600 USD
 * « payé » zéro franc soldait 1 008 000 au 401 contre un 52 à zéro, le tout
 * porté en GAIN au 756 ; un montant de -600 rendait un cours de -1. La pièce
 * était équilibrée et la balance bouclée (§ 10 bis). Le montant réglé en
 * devise, les francs payés et le cours, saisi ou déduit, sont tous
 * strictement positifs, contrôlés ICI, sur la valeur que la pièce porterait
 * (arrondie), quelle que soit la porte · un `null` ou un `NaN` venu d'un
 * appelant qui aurait sauté le DTO tombe sous le même refus.
 */
export function coursEtFrancsDuReglement(p: {
  montantDevise: number;
  cours?: number | null;
  francs?: number | null;
  tolerance: (montantDevise: number, cours: number, francs: number) => boolean;
}): { cours: number; francs: number } | { motif: string } {
  if (!(p.montantDevise > 0)) {
    return { motif: 'le montant réglé en devise doit être strictement positif · un règlement nul ou négatif ne règle rien.' };
  }
  if (p.cours === undefined && p.francs === undefined) {
    return {
      motif:
        "les factures sont en devise · le cours du jour du règlement, ou le montant réellement payé en francs, est exigé, l'écart de change réalisé " +
        'se mesurant contre lui (AUDCIF art. 55).',
    };
  }
  const motifCours =
    'le cours du jour du règlement doit être strictement positif · un cours nul ou négatif ferait passer ce que le tiers éteint pour un gain ' +
    '(AUDCIF art. 52 et 55).';
  const motifFrancs =
    'le montant payé en francs doit être strictement positif · un règlement à zéro franc solderait le tiers contre une trésorerie vide ' +
    'et ferait du dû entier un gain de change (AUDCIF art. 55).';
  if (p.cours !== undefined && !(Number(p.cours) > 0)) return { motif: motifCours };
  if (p.francs === undefined) {
    const cours = Number(p.cours);
    const francsDuCours = Math.round(p.montantDevise * cours * 100) / 100;
    if (!(francsDuCours > 0)) return { motif: motifFrancs };
    return { cours, francs: francsDuCours };
  }
  const francs = Math.round(Number(p.francs) * 100) / 100;
  if (!(francs > 0)) return { motif: motifFrancs };
  if (p.cours === undefined) {
    const deduit = Math.round((francs / p.montantDevise) * 1e6) / 1e6;
    if (!(deduit > 0)) return { motif: motifCours };
    return { cours: deduit, francs };
  }
  const cours = Number(p.cours);
  if (!p.tolerance(p.montantDevise, cours, francs)) {
    const attendu = Math.round(p.montantDevise * cours * 100) / 100;
    return {
      motif:
        `${p.montantDevise.toFixed(2)} au cours de ${cours} font ${attendu.toFixed(2)} en francs, et le montant saisi est ${francs.toFixed(2)} · ` +
        'saisissez le seul montant payé, le cours s’en déduit (AUDCIF art. 52).',
    };
  }
  return { cours, francs };
}

/**
 * LA TRÉSORERIE EN DEVISE (« Moyen de paiement en devise ») porte la devise
 * de la banque ou de la caisse, jamais celle de la facture par défaut · une
 * banque en USD qui paie une facture en EUR, ou un lot USD et EUR, aurait
 * marqué le 52 d'une devise qu'il ne tient pas, et la conversion des
 * disponibilités à la clôture (AUDCIF art. 57) l'aurait fausse. Refus ·
 * case cochée sans devise de trésorerie déclarée, lot à plusieurs devises ou
 * portant des factures en francs, devise déclarée autre que celle des
 * factures, RIB du journal tenu dans une autre devise ; et, case décochée, un
 * RIB tenu dans une devise étrangère, QUEL QUE SOIT LE LOT (A6 bis, B3) · le
 * 52 recevrait des francs sans leur devise, et la conversion des
 * disponibilités à la clôture (AUDCIF art. 57 ; fiche du compte 52 des deux
 * plans, « les avoirs en monnaies étrangères sont évalués au dernier cours
 * officiel de change connu ») porterait une position fausse. Le refus valait
 * jusque-là pour un lot EN DEVISE seulement · une banque en USD qui payait
 * des factures en francs passait C 52 sans devise. Payer une facture en
 * francs PAR une trésorerie en devise n'est pas ouvert ici (relevé de la
 * ligne) · le refus le dit et nomme l'issue. `null` si admis.
 */
export function motifRefusTresorerieEnDevise(p: {
  tresorerieEnDevise: boolean;
  /** Devise de chaque règlement du lot, `null` pour un règlement en francs. */
  devisesDuLot: Array<{ id: string; code: string } | null>;
  deviseTresorerie: { id: string; code: string } | null;
  /** `RibBanque.devise` du journal, code ISO, ou `null` s'il n'est pas renseigné. */
  deviseRib: string | null;
  monnaieDeTenue: string;
  journalCode: string;
}): string | null {
  const enDevise = p.devisesDuLot.filter((d): d is { id: string; code: string } => d !== null);
  const codesLot = [...new Set(enDevise.map((d) => d.code))];
  const rib = p.deviseRib && p.deviseRib.trim() !== '' ? p.deviseRib.trim().toUpperCase() : null;
  const ribEtranger = rib !== null && rib !== p.monnaieDeTenue ? rib : null;
  if (!p.tresorerieEnDevise) {
    if (ribEtranger && enDevise.length > 0) {
      return (
        `Le RIB du journal ${p.journalCode} est tenu en ${ribEtranger} · cochez « Moyen de paiement en devise », sans quoi le ` +
        'compte de trésorerie recevrait des francs sans leur devise et échapperait à la conversion de clôture (AUDCIF art. 57) ; ' +
        'ou, si le RIB est mal renseigné, corrigez sa devise (Banques).'
      );
    }
    if (ribEtranger) {
      return (
        `Le RIB du journal ${p.journalCode} est tenu en ${ribEtranger} et les factures choisies sont en francs · le compte de trésorerie ` +
        `recevrait des francs sans leur devise et la conversion des disponibilités à la clôture le fausserait (AUDCIF art. 57). ` +
        'Réglez ces factures depuis le journal d’un compte tenu en francs, ou, si le RIB est mal renseigné, corrigez sa devise (Banques) ; ' +
        'le paiement d’une facture en francs par une trésorerie en devise ne passe pas par le règlement des tiers, il se saisit au journal ' +
        'avec sa devise et son cours.'
      );
    }
    return null;
  }
  if (enDevise.length === 0 || enDevise.length !== p.devisesDuLot.length) {
    return 'Un moyen de paiement en devise ne règle que des factures en devise · réglez les factures en francs dans une autre pièce.';
  }
  if (codesLot.length > 1) {
    return `Le lot porte plusieurs devises (${codesLot.join(', ')}) · un moyen de paiement en devise n'en tient qu'une, une saisie par devise.`;
  }
  if (!p.deviseTresorerie) return 'Précisez la devise du moyen de paiement.';
  if (p.deviseTresorerie.id !== enDevise[0]!.id) {
    return (
      `Le moyen de paiement est en ${p.deviseTresorerie.code} et les factures en ${codesLot[0]} · OmegaX ne passe pas un ` +
      "règlement d'une devise dans une autre."
    );
  }
  if (rib !== null && rib !== p.deviseTresorerie.code.toUpperCase()) {
    return `Le RIB du journal ${p.journalCode} est tenu en ${rib}, et non en ${p.deviseTresorerie.code} · choisissez le journal du compte en ${p.deviseTresorerie.code}.`;
  }
  return null;
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
 *
 * DEUX FACTURES DU MÊME JOUR (A6 bis, M4) · l'ordre était celui où la base
 * rendait les lignes, que rien ne garantit · deux factures du même jour à des
 * cours différents donnaient deux coûts historiques, donc deux écarts, au gré
 * de la requête. Elles se départagent par l'identifiant de LIGNE, à l'écran
 * comme au passage (`client/src/lib/ecart-change.ts`, `ecartEstime`) et dans
 * le signalement des anciens règlements (`reglements-sans-ecart.ts`, D4), qui
 * rejoue la règle après coup · l'ordre où l'écran envoie `ligneIds` n'est
 * gardé nulle part, et ne peut donc pas départager.
 */
export function ordreDeReglement<T extends { id: string; date: Date }>(a: T, b: T): number {
  return a.date.getTime() - b.date.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function coutHistoriqueRegle(factures: FactureEnDevise[], montantDeviseRegle: number): number {
  return coutsHistoriquesSuccessifs(factures, [montantDeviseRegle])[0]!;
}

/**
 * LES COÛTS HISTORIQUES DE PLUSIEURS RÈGLEMENTS SUCCESSIFS d'un même groupe
 * (A6 bis, M1) · chacun consomme les factures dans l'ordre de règlement, à
 * partir de là où le précédent s'est arrêté. Une facture entamée garde son
 * cours d'origine (sa contrevaleur au prorata de la devise réglée), et la
 * part qui l'épuise prend ce qui reste de ses francs, jamais quantité ×
 * cours (sinon un centime d'arrondi resterait au tiers). Le premier règlement
 * rend exactement `coutHistoriqueRegle` · c'est la même règle, rejouée.
 */
export function coutsHistoriquesSuccessifs(factures: FactureEnDevise[], montantsDevise: number[]): number[] {
  const file = [...factures].sort(ordreDeReglement).map((f) => ({ f, devise: f.montantDevise, francs: centimes(f.francs) }));
  return montantsDevise.map((montant) => {
    let reste = montant;
    let total = 0;
    for (const e of file) {
      if (reste <= 1e-9) break;
      if (e.devise <= 1e-9) continue;
      if (reste + 1e-9 >= e.devise) {
        total += e.francs;
        reste -= e.devise;
        e.devise = 0;
        e.francs = 0;
      } else {
        const part = centimes((e.f.francs * reste) / e.f.montantDevise);
        total += part;
        e.devise -= reste;
        e.francs -= part;
        reste = 0;
      }
    }
    return total / 100;
  });
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
  const libelleEcart = `${libelleEcartRealise(ecart)} · ${p.libelle}`.slice(0, 190);
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
