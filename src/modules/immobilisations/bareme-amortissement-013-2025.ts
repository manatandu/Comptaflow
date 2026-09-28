/*
  FICHIER ENGENDRÉ · ne pas retoucher à la main.
  Source · compétence fiscalite-rdc-socle, references/amortissements-am-013-2025.md,
  arrêté ministériel n° 013/CAB/MIN/FINANCES/2025 du 19 février 2025, article 2
  (en vigueur au 1er janvier 2026, art. 6).
  Engendré par scripts/extraire-bareme-amortissement.cjs · corriger la source et
  régénérer.

  La clé est « section.rang » et non le numéro publié · la section IV répète
  son numéro 6 et saute des numéros, la VII aussi (défauts du texte officiel,
  reproduits). Le taux est celui IMPRIMÉ · 100 / durée tronqué à deux décimales.
*/

export interface NatureBaremeFiscal {
  /** Section et rang dans la section, « IV.5 » · la seule clé unique. */
  cle: string;
  /** Section de l'art. 2, en chiffres romains. */
  section: string;
  intituleSection: string;
  /** Numéro tel que publié · répété ou sauté dans les sections IV et VII. */
  numero: string;
  designation: string;
  dureeAns: number;
  /** Taux annuel en pour cent du coût de revient. */
  taux: number;
}

export const BAREME_AMORTISSEMENT_013_2025: readonly NatureBaremeFiscal[] = [
  {
    "cle": "I.1",
    "section": "I",
    "intituleSection": "Éléments incorporels",
    "numero": "1",
    "designation": "Brevets, licences et logiciels",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "I.2",
    "section": "I",
    "intituleSection": "Éléments incorporels",
    "numero": "2",
    "designation": "Fonds de commerce",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "II.1",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "1",
    "designation": "Constructions en matériaux durables",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.2",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "2",
    "designation": "Bâtiments commerciaux, industriels, garages, hangars, ateliers",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.3",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "3",
    "designation": "Cabines de transformation",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.4",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "4",
    "designation": "Installations de chutes d'eau, barrages",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.5",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "5",
    "designation": "Châteaux d'eau",
    "dureeAns": 25,
    "taux": 4
  },
  {
    "cle": "II.6",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "6",
    "designation": "Canalisations",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.7",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "7",
    "designation": "Usines",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.8",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "8",
    "designation": "Maisons d'habitation",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.9",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "9",
    "designation": "Fours à chaux, plâtre",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "II.10",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "10",
    "designation": "Fours électriques",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "II.11",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "11",
    "designation": "Bâtiments démontables ou provisoires",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "II.12",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "12",
    "designation": "Autoroutes, ponts et échangeurs",
    "dureeAns": 40,
    "taux": 2.5
  },
  {
    "cle": "II.13",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "13",
    "designation": "Dépenses des grosses réparations des autoroutes, des ponts et des échangeurs",
    "dureeAns": 8,
    "taux": 12.5
  },
  {
    "cle": "II.14",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "14",
    "designation": "Pistes pour avions",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.15",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "15",
    "designation": "Quais portuaires",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.16",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "16",
    "designation": "Voies ferrées",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.17",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "17",
    "designation": "Signalisations des voies ferrées",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.18",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "18",
    "designation": "Réseaux de canalisations",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "II.19",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "19",
    "designation": "Parkings non couverts",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "II.20",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "20",
    "designation": "Cours de tennis",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "II.21",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "21",
    "designation": "Piscines",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "II.22",
    "section": "II",
    "intituleSection": "Constructions",
    "numero": "22",
    "designation": "Dépenses des grosses réparations des parkings, cours de tennis, piscines",
    "dureeAns": 4,
    "taux": 25
  },
  {
    "cle": "III.1",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "1",
    "designation": "Chaudières à vapeur",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "III.2",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "2",
    "designation": "Cuves à ciment",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "III.3",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "3",
    "designation": "Machines à papier et à carton",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "III.4",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "4",
    "designation": "Presses hydrauliques",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "III.5",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "5",
    "designation": "Presses, compresseurs",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.6",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "6",
    "designation": "Réservoirs à pétrole",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.7",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "7",
    "designation": "Transformateurs lourds de forte puissance",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.8",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "8",
    "designation": "Turbines et machines à vapeur",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.9",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "9",
    "designation": "Pétrins mécaniques, malaxeurs",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.10",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "10",
    "designation": "Excavateurs",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.11",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "11",
    "designation": "Foudres, cuves de brasseries, de distillation ou de vinification",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.12",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "12",
    "designation": "Appareils d'épuration, de triage",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.13",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "13",
    "designation": "Appareils de laminage, d'essorage",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.14",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "14",
    "designation": "Machines-outils légères, tours, mortaiseuses, raboteuses, perceuses",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.15",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "15",
    "designation": "Lignes de transport d'énergie électrique",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.16",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "16",
    "designation": "Appareils à découper le bois",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.17",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "17",
    "designation": "Matériels d'usines y compris machines-outils",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.18",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "18",
    "designation": "Marteaux pneumatiques",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.19",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "19",
    "designation": "Perforatrices",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "III.20",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "20",
    "designation": "Matériels d'usine fixes",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "III.21",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "21",
    "designation": "Dépenses des grosses réparations des machines, matériels et équipements",
    "dureeAns": 4,
    "taux": 25
  },
  {
    "cle": "III.22",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "22",
    "designation": "Machines et équipement de chauffage et frigorifiques",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.23",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "23",
    "designation": "Ascenseurs, monte-charges et escaliers mécaniques",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.24",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "24",
    "designation": "Silos et bacs de stockage",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "III.25",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "25",
    "designation": "Dépenses des grosses réparations des équipements de chauffage et frigorifiques, des ascenseurs, monte-charge et escaliers mécaniques",
    "dureeAns": 4,
    "taux": 25
  },
  {
    "cle": "III.26",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "26",
    "designation": "Rayonnages métalliques",
    "dureeAns": 7,
    "taux": 14.28
  },
  {
    "cle": "III.27",
    "section": "III",
    "intituleSection": "Machines, matériels et équipements en général",
    "numero": "27",
    "designation": "Citernes et fûts",
    "dureeAns": 7,
    "taux": 14.28
  },
  {
    "cle": "IV.1",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "1",
    "designation": "Gros engins (bulldozers, scrapers, rouleaux, bétonnières, foreuses, camions dumpers, pervibrateur, treuil, polisseuse, compacteurs)",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "IV.2",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "2",
    "designation": "Petits engins (camion goudronneur, camion arroseur, etc.)",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IV.3",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "3",
    "designation": "Engins de transport",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IV.4",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "6",
    "designation": "Bétonnières auto-tractées ou mobiles",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IV.5",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "6",
    "designation": "Poste de soudure : fixe",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "IV.6",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "11",
    "designation": "Poste de soudure : mobile ou destiné à être transporté",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IV.7",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "12",
    "designation": "Dépenses des grosses réparations des machines et matériels des travaux publics",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "IV.8",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "13",
    "designation": "Équipements de production, de transport et de distribution de l'électricité et du gaz",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "IV.9",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "14",
    "designation": "Dépenses des grosses réparations des équipements d'électricité et de gaz",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "IV.10",
    "section": "IV",
    "intituleSection": "Matériel de travaux publics et de bâtiment",
    "numero": "15",
    "designation": "Grosses grues",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "V.1",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "1",
    "designation": "Wagons et locomotives",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "V.2",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "2",
    "designation": "Wagons de transport des marchandises",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "V.3",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "3",
    "designation": "Wagons techniques pour le contrôle des voies ferrées",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "V.4",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "4",
    "designation": "Dépenses des grosses réparations des voies ferrées",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "V.5",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "5",
    "designation": "Voies de chemin de fer",
    "dureeAns": 50,
    "taux": 2
  },
  {
    "cle": "V.6",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "6",
    "designation": "Véhicules élévateurs",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "V.7",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "7",
    "designation": "Aéronefs et appareils navals",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "V.8",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "8",
    "designation": "Parties fixes des avions et leurs moteurs",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "V.9",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "9",
    "designation": "Dépenses des grosses réparations des avions",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "V.10",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "10",
    "designation": "Dépenses et grosses réparations des moteurs d'avions",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "V.11",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "11",
    "designation": "Fûts de transport (bière et vin)",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "V.12",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "12",
    "designation": "Fûts de transport métalliques",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "V.13",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "13",
    "designation": "Containers",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "V.14",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "14",
    "designation": "Véhicules automobiles de tourisme",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "V.15",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "15",
    "designation": "Véhicules automobiles utilitaires légers",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "V.16",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "16",
    "designation": "Véhicules automobiles de transport de marchandises",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "V.17",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "17",
    "designation": "Matériels automobiles de transport en commun",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "V.18",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "18",
    "designation": "Tracteurs",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "V.19",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "19",
    "designation": "Charrettes",
    "dureeAns": 4,
    "taux": 25
  },
  {
    "cle": "V.20",
    "section": "V",
    "intituleSection": "Matériels et moyens de transport",
    "numero": "20",
    "designation": "Tracteurs utilisés par les forestiers",
    "dureeAns": 4,
    "taux": 25
  },
  {
    "cle": "VI.1",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "1",
    "designation": "Agencements, aménagements, installations",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "VI.2",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "2",
    "designation": "Mobiliers de bureau ou autres",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "VI.3",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "3",
    "designation": "Meubles meublant (lits, chaises, tables, armoires, etc.)",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VI.4",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "4",
    "designation": "Matériels de bureau",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VI.5",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "5",
    "designation": "Matériels de campements (tentes, réchauds, lits)",
    "dureeAns": 2,
    "taux": 50
  },
  {
    "cle": "VI.6",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "6",
    "designation": "Coffres forts et armoires blindées",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "VI.7",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "7",
    "designation": "Machines informatiques (serveur)",
    "dureeAns": 4,
    "taux": 25
  },
  {
    "cle": "VI.8",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "8",
    "designation": "Matériels de reprographie",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "VI.9",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "9",
    "designation": "Extincteurs",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VI.10",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "10",
    "designation": "Installations téléphoniques (standard, etc.)",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "VI.11",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "11",
    "designation": "Équipements sanitaires fixes",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "VI.12",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "12",
    "designation": "Équipements sanitaires mobiles",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VI.13",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "13",
    "designation": "Bâches et protections souples",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "VI.14",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "14",
    "designation": "Panneaux publicitaires et enseignes (lumineux ou autres) fixés à demeure",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "VI.15",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "15",
    "designation": "Tondeuses à gazon à moteur",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VI.16",
    "section": "VI",
    "intituleSection": "Matériel, mobilier, agencement et installation",
    "numero": "16",
    "designation": "Climatisation centrale",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "VII.1",
    "section": "VII",
    "intituleSection": "Électroménager",
    "numero": "1",
    "designation": "Climatiseurs autres, ventilateurs fixes",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VII.2",
    "section": "VII",
    "intituleSection": "Électroménager",
    "numero": "2",
    "designation": "Ventilateurs mobiles, humidificateurs, etc.",
    "dureeAns": 2,
    "taux": 50
  },
  {
    "cle": "VII.3",
    "section": "VII",
    "intituleSection": "Électroménager",
    "numero": "5",
    "designation": "Horloges pointeuses et assimilées",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VII.4",
    "section": "VII",
    "intituleSection": "Électroménager",
    "numero": "6",
    "designation": "Réfrigérateurs, fontaines réfrigérantes et assimilées",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VII.5",
    "section": "VII",
    "intituleSection": "Électroménager",
    "numero": "7",
    "designation": "Machines à laver",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.1",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "1",
    "designation": "Literie",
    "dureeAns": 3,
    "taux": 33.33
  },
  {
    "cle": "VIII.2",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "2",
    "designation": "Matériels de cuisines et buanderie",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.3",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "3",
    "designation": "Argenterie",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.4",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "4",
    "designation": "Aménagements décoratifs",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.5",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "5",
    "designation": "Tapis, rideaux, tentures",
    "dureeAns": 4,
    "taux": 25
  },
  {
    "cle": "VIII.6",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "6",
    "designation": "Accessoires des piscines",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.7",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "7",
    "designation": "Presses à compression",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "VIII.8",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "8",
    "designation": "Presses à transfert",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "VIII.9",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "9",
    "designation": "Préchauffeurs ou étuves",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.10",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "10",
    "designation": "Pastilleuses",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.11",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "11",
    "designation": "Presses à injection",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.12",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "12",
    "designation": "Machines à gélifier, à boudiner",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.13",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "13",
    "designation": "Machines à former par le vide",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.14",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "14",
    "designation": "Machines à métalliser",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.15",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "15",
    "designation": "Machines à souder et à découper",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.16",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "16",
    "designation": "Moules",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.17",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "17",
    "designation": "Lessiveuses, diffuseurs",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.18",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "18",
    "designation": "Appareils de récupération des produits",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.19",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "19",
    "designation": "Appareils de blanchissage",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "VIII.20",
    "section": "VIII",
    "intituleSection": "Matériels d'hôtels et de restauration",
    "numero": "20",
    "designation": "Appareils de cuisson",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IX.1",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "1",
    "designation": "Matériels de pêche et de chasse",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IX.2",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "2",
    "designation": "Animaux inscrits en immobilisations (géniteurs producteurs, labours, etc.)",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IX.3",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "3",
    "designation": "Tracteurs agricoles et matériels roulant autotractés",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IX.4",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "4",
    "designation": "Autres machines et matériels",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IX.5",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "5",
    "designation": "Animaux de production et animaux de service",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IX.6",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "6",
    "designation": "Plantations pérennes",
    "dureeAns": 20,
    "taux": 5
  },
  {
    "cle": "IX.7",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "7",
    "designation": "Travaux de conservation des eaux et du sol",
    "dureeAns": 5,
    "taux": 20
  },
  {
    "cle": "IX.8",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "8",
    "designation": "Puits",
    "dureeAns": 10,
    "taux": 10
  },
  {
    "cle": "IX.9",
    "section": "IX",
    "intituleSection": "Matériels agricoles, de pêche et de chasse",
    "numero": "9",
    "designation": "Équipements d'arrosage",
    "dureeAns": 5,
    "taux": 20
  }
];
