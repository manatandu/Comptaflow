/**
 * LE CONTRAT DE LOCATION-ACQUISITION, CÔTÉ ÉCRAN · le serveur qualifie le
 * contrat, calcule la dette et son échéancier
 * (`src/modules/immobilisations/location-acquisition/`). L'écran ne fait que
 * mettre la saisie en forme · le taux se tape en POURCENT et part en
 * fraction, et c'est le taux OU la valeur du contrat, jamais les deux.
 */
export type NatureLocationAcquisition = 'CREDIT_BAIL_IMMOBILIER' | 'CREDIT_BAIL_MOBILIER' | 'LOCATION_VENTE' | 'AUTRE';
export type PeriodiciteLoyer = 'MENSUELLE' | 'TRIMESTRIELLE' | 'SEMESTRIELLE' | 'ANNUELLE';

export const LIBELLES_NATURE: Record<NatureLocationAcquisition, string> = {
  CREDIT_BAIL_IMMOBILIER: 'Crédit-bail immobilier',
  CREDIT_BAIL_MOBILIER: 'Crédit-bail mobilier',
  LOCATION_VENTE: 'Location-vente',
  AUTRE: 'Autre location-acquisition',
};
export const LIBELLES_PERIODICITE: Record<PeriodiciteLoyer, string> = {
  MENSUELLE: 'Mensuel',
  TRIMESTRIELLE: 'Trimestriel',
  SEMESTRIELLE: 'Semestriel',
  ANNUELLE: 'Annuel',
};

export interface SaisieContrat {
  nature: NatureLocationAcquisition;
  reference: string;
  bailleurTiersId: string;
  dateConclusion: string;
  datePriseEffet: string;
  dureeMois: string;
  periodicite: PeriodiciteLoyer;
  termeAEchoir: boolean;
  loyer: string;
  prixOption: string;
  /** « taux » ou « valeur » · l'un des deux (AUDCIF Titre VIII ch. 8 § 2.1.3). */
  base: 'taux' | 'valeur';
  tauxPourcent: string;
  valeurContrat: string;
  optionRaisonnablementCertaine: boolean;
  bienDeFaibleValeur: boolean;
  coutsDirects: string;
  avantagesRecus: string;
  compteContrepartieCoutsId: string;
}

export function saisieInitiale(aujourdhui: string): SaisieContrat {
  return {
    nature: 'CREDIT_BAIL_MOBILIER',
    reference: '',
    bailleurTiersId: '',
    dateConclusion: aujourdhui,
    datePriseEffet: aujourdhui,
    dureeMois: '',
    periodicite: 'MENSUELLE',
    termeAEchoir: false,
    loyer: '',
    prixOption: '0',
    base: 'taux',
    tauxPourcent: '',
    valeurContrat: '',
    optionRaisonnablementCertaine: false,
    bienDeFaibleValeur: false,
    coutsDirects: '0',
    avantagesRecus: '0',
    compteContrepartieCoutsId: '',
  };
}

const nombre = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

/** Le corps de la simulation · null tant qu'un chiffre manque. */
export function corpsSimulation(compteImmobilisationId: string, s: SaisieContrat): Record<string, unknown> | null {
  const duree = nombre(s.dureeMois);
  const loyer = nombre(s.loyer);
  const option = nombre(s.prixOption || '0');
  const taux = nombre(s.tauxPourcent);
  const valeur = nombre(s.valeurContrat);
  if (!compteImmobilisationId || !s.datePriseEffet || !Number.isInteger(duree) || !(loyer > 0) || !(option >= 0)) return null;
  if (s.base === 'taux' ? !(taux >= 0) : !(valeur > 0)) return null;
  return {
    compteImmobilisationId,
    nature: s.nature,
    datePriseEffet: s.datePriseEffet,
    dureeMois: duree,
    periodicite: s.periodicite,
    termeAEchoir: s.termeAEchoir,
    loyer,
    prixOption: option,
    // Le taux saisi en pourcent part en fraction (7,86 → 0,0786).
    tauxAnnuel: s.base === 'taux' ? taux / 100 : null,
    valeurContrat: s.base === 'valeur' ? valeur : null,
    optionRaisonnablementCertaine: s.optionRaisonnablementCertaine,
    bienDeFaibleValeur: s.bienDeFaibleValeur,
  };
}

/** Les coûts directs nets des avantages reçus (§ 2.1.5) · la contrepartie n'est exigée que s'ils ne sont pas nuls. */
export function coutsNets(s: SaisieContrat): number {
  const net = (nombre(s.coutsDirects || '0') || 0) - (nombre(s.avantagesRecus || '0') || 0);
  return Math.round(net * 100) / 100;
}

/** Le corps de la création · la simulation plus le bien et l'écriture. */
export function corpsCreation(
  compteImmobilisationId: string,
  s: SaisieContrat,
  bien: { designation: string; numeroInventaire?: string; lieuId?: string; natureFiscaleCle?: string; dureeAmortissementAns: number; exerciceId: string; journalId: string },
): Record<string, unknown> | null {
  const simulation = corpsSimulation(compteImmobilisationId, s);
  if (!simulation) return null;
  return {
    ...simulation,
    ...bien,
    reference: s.reference,
    bailleurTiersId: s.bailleurTiersId || undefined,
    dateConclusion: s.dateConclusion,
    coutsDirects: nombre(s.coutsDirects || '0') || 0,
    avantagesRecus: nombre(s.avantagesRecus || '0') || 0,
    compteContrepartieCoutsId: coutsNets(s) !== 0 ? s.compteContrepartieCoutsId || undefined : undefined,
  };
}

export interface LigneEcheancier {
  rang: number;
  date: string;
  paiement: number;
  interets: number;
  capital: number;
  restant: number;
  option: boolean;
}
export interface EcheancierServi {
  dette: number;
  tauxPeriodique: number;
  lignes: LigneEcheancier[];
  comptes: { dette: string; interetsCourus: string; interets: string; redevances: string };
}
