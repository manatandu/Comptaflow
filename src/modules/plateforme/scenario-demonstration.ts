import { Referentiel, TypeTiers } from '@prisma/client';

/**
 * LE SCÉNARIO DES DOSSIERS DE DÉMONSTRATION · une association (SYCEBNL) et
 * une SARL (SYSCOHADA), garnies d'opérations FICTIVES sur l'exercice ouvert.
 *
 * AUCUN NUMÉRO N'EST CHOISI ICI. Les comptes de nature sont ceux des modèles
 * de saisie de l'écran (`client/src/lib/modeles-saisie.ts`), déjà vérifiés
 * contre les plans semés et sourcés au Guide d'application · un spec exige que
 * chaque numéro employé ici y figure, dans le même sens. Les comptes de tiers
 * sont les comptes INDIVIDUELS que la création du tiers pose sous son
 * collectif, et la trésorerie est le compte du journal de banque.
 *
 * Chaque opération suit la règle de ces modèles · la facture crée la dette ou
 * la créance, le règlement est une seconde écriture. Des factures restent
 * ouvertes À DESSEIN, pour que la balance âgée, le lettrage et les relances
 * aient de quoi montrer.
 */

export type JournalDemo = 'ACH' | 'VEN' | 'BQ' | 'OD';

type Sens = 'DEBIT' | 'CREDIT';
/** Un compte de nature (numéro des modèles), un tiers (son code), ou la banque. */
export type CompteDemo = { nature: string; sens: Sens } | { tiers: string; sens: Sens } | { tresorerie: true; sens: Sens };
export type LigneDemo = CompteDemo & { montant: number };

export interface OperationDemo {
  /** Mois et jour · l'année est celle de l'exercice ouvert. */
  jour: string;
  journal: JournalDemo;
  libelle: string;
  reference?: string;
  lignes: LigneDemo[];
}

export interface ScenarioDemo {
  nomEntite: string;
  activite: string;
  tiers: { code: string; nom: string; type: TypeTiers }[];
  operations: OperationDemo[];
}

/** Deux lignes équilibrées · la forme de tous les modèles simples. */
const deux = (a: CompteDemo, b: CompteDemo, montant: number): LigneDemo[] => [
  { ...a, montant },
  { ...b, montant },
];

const SYCEBNL: ScenarioDemo = {
  nomEntite: 'Association Santé pour Tous (démonstration)',
  activite: 'Démonstration · association fictive, toutes les données de ce dossier sont fictives',
  tiers: [
    { code: 'ADH001', nom: 'Membre Kabeya (fictif)', type: TypeTiers.ADHERENT },
    { code: 'ADH002', nom: 'Membre Mwamba (fictif)', type: TypeTiers.ADHERENT },
    { code: 'FRN001', nom: 'Papeterie du Centre (fictif)', type: TypeTiers.FOURNISSEUR },
    { code: 'FRN002', nom: 'Transports Lukusa (fictif)', type: TypeTiers.FOURNISSEUR },
  ],
  operations: [
    { jour: '01-15', journal: 'BQ', libelle: 'Don reçu · campagne de janvier', lignes: deux({ tresorerie: true, sens: 'DEBIT' }, { nature: '70410000', sens: 'CREDIT' }, 2_500_000) },
    { jour: '01-31', journal: 'OD', libelle: 'Appel de cotisation · Kabeya', lignes: deux({ tiers: 'ADH001', sens: 'DEBIT' }, { nature: '70100000', sens: 'CREDIT' }, 120_000) },
    { jour: '01-31', journal: 'OD', libelle: 'Appel de cotisation · Mwamba', lignes: deux({ tiers: 'ADH002', sens: 'DEBIT' }, { nature: '70100000', sens: 'CREDIT' }, 120_000) },
    { jour: '02-20', journal: 'BQ', libelle: 'Recouvrement de cotisation · Kabeya', lignes: deux({ tresorerie: true, sens: 'DEBIT' }, { tiers: 'ADH001', sens: 'CREDIT' }, 120_000) },
    { jour: '03-10', journal: 'ACH', libelle: 'Fournitures de bureau', reference: 'PC-2031', lignes: deux({ nature: '60110000', sens: 'DEBIT' }, { tiers: 'FRN001', sens: 'CREDIT' }, 450_000) },
    { jour: '03-25', journal: 'BQ', libelle: 'Règlement · Papeterie du Centre', reference: 'PC-2031', lignes: deux({ tiers: 'FRN001', sens: 'DEBIT' }, { tresorerie: true, sens: 'CREDIT' }, 450_000) },
    { jour: '04-30', journal: 'OD', libelle: 'Salaires d’avril · brut', lignes: [{ nature: '66110000', sens: 'DEBIT', montant: 800_000 }, { nature: '42200000', sens: 'CREDIT', montant: 800_000 }] },
    { jour: '05-12', journal: 'ACH', libelle: 'Transport de matériel médical', reference: 'TL-118', lignes: deux({ nature: '60110000', sens: 'DEBIT' }, { tiers: 'FRN002', sens: 'CREDIT' }, 300_000) },
    { jour: '06-15', journal: 'BQ', libelle: 'Don reçu · journée portes ouvertes', lignes: deux({ tresorerie: true, sens: 'DEBIT' }, { nature: '70410000', sens: 'CREDIT' }, 1_000_000) },
  ],
};

const SYSCOHADA: ScenarioDemo = {
  nomEntite: 'Kivu Négoce SARL (démonstration)',
  activite: 'Démonstration · société fictive, toutes les données de ce dossier sont fictives',
  tiers: [
    { code: 'CLI001', nom: 'Boutique Mboka (fictif)', type: TypeTiers.CLIENT },
    { code: 'CLI002', nom: 'Hôtel du Lac (fictif)', type: TypeTiers.CLIENT },
    { code: 'FRN001', nom: 'Grossiste Import (fictif)', type: TypeTiers.FOURNISSEUR },
    { code: 'FRN002', nom: 'Transports Lukusa (fictif)', type: TypeTiers.FOURNISSEUR },
  ],
  operations: [
    { jour: '01-15', journal: 'ACH', libelle: 'Achat de marchandises', reference: 'GI-501', lignes: deux({ nature: '60110000', sens: 'DEBIT' }, { tiers: 'FRN001', sens: 'CREDIT' }, 3_000_000) },
    { jour: '01-20', journal: 'VEN', libelle: 'Vente de marchandises · Mboka', reference: 'F-0001', lignes: deux({ tiers: 'CLI001', sens: 'DEBIT' }, { nature: '70110000', sens: 'CREDIT' }, 4_200_000) },
    { jour: '02-10', journal: 'BQ', libelle: 'Encaissement · Mboka', reference: 'F-0001', lignes: deux({ tresorerie: true, sens: 'DEBIT' }, { tiers: 'CLI001', sens: 'CREDIT' }, 4_200_000) },
    { jour: '02-15', journal: 'BQ', libelle: 'Règlement · Grossiste Import', reference: 'GI-501', lignes: deux({ tiers: 'FRN001', sens: 'DEBIT' }, { tresorerie: true, sens: 'CREDIT' }, 3_000_000) },
    { jour: '03-05', journal: 'VEN', libelle: 'Prestation de services · Hôtel du Lac', reference: 'F-0002', lignes: deux({ tiers: 'CLI002', sens: 'DEBIT' }, { nature: '70610000', sens: 'CREDIT' }, 1_500_000) },
    { jour: '03-30', journal: 'BQ', libelle: 'Encaissement partiel · Hôtel du Lac', reference: 'F-0002', lignes: deux({ tresorerie: true, sens: 'DEBIT' }, { tiers: 'CLI002', sens: 'CREDIT' }, 1_000_000) },
    { jour: '04-10', journal: 'ACH', libelle: 'Transport de marchandises', reference: 'TL-204', lignes: deux({ nature: '60110000', sens: 'DEBIT' }, { tiers: 'FRN002', sens: 'CREDIT' }, 600_000) },
    { jour: '04-30', journal: 'OD', libelle: 'Salaires d’avril · brut', lignes: [{ nature: '66110000', sens: 'DEBIT', montant: 900_000 }, { nature: '42200000', sens: 'CREDIT', montant: 900_000 }] },
    { jour: '05-15', journal: 'VEN', libelle: 'Vente de marchandises · Hôtel du Lac', reference: 'F-0003', lignes: deux({ tiers: 'CLI002', sens: 'DEBIT' }, { nature: '70110000', sens: 'CREDIT' }, 2_000_000) },
  ],
};

export function scenarioDemonstration(referentiel: Referentiel): ScenarioDemo {
  return referentiel === Referentiel.SYSCOHADA ? SYSCOHADA : SYCEBNL;
}
