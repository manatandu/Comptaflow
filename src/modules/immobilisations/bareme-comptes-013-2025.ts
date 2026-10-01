/*
  FICHIER ENGENDRÉ · ne pas retoucher à la main.
  Source · docs/bareme-013-2025-comptes.md (proposition de l'éditeur, décision
  D-4 de Manasse du 2026-10-01). Engendré par scripts/extraire-bareme-comptes.cjs
  · corriger la source et régénérer.

  Aucun texte ne relie une nature de l'arrêté n° 013/2025 à un compte du plan ·
  ces comptes se PROPOSENT, le premier en tête, et ne refusent jamais rien.
  Une colonne par référentiel, jamais servie à l'autre.
*/

export interface ComptesDeLaNature {
  /** Numéros semés, dans l'ordre de préférence · vide si le plan n'en ouvre aucun. */
  comptes: string[];
  /** Pourquoi ce compte, ou quand en choisir un autre · vide si rien à dire. */
  remarque: string;
}

export interface CorrespondanceBareme {
  /** Clé « section.rang » de la table engendrée du barème. */
  cle: string;
  SYSCOHADA: ComptesDeLaNature;
  SYCEBNL: ComptesDeLaNature;
}

export const CORRESPONDANCE_BAREME_COMPTES: readonly CorrespondanceBareme[] = [
  {
    "cle": "I.1",
    "SYSCOHADA": {
      "comptes": [
        "21210000",
        "21220000",
        "21310000"
      ],
      "remarque": "Une ligne fiscale, trois comptes · le brevet au 2121, la licence au 2122, le logiciel au 2131. Choix selon le bien."
    },
    "SYCEBNL": {
      "comptes": [
        "21210000",
        "21220000",
        "21310000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "I.2",
    "SYSCOHADA": {
      "comptes": [
        "21500000"
      ],
      "remarque": "Le plan l'intitule « Fonds commercial ». Amortissable au fiscal (10 %) · au comptable, voir la fiche du compte 21 avant d'amortir."
    },
    "SYCEBNL": {
      "comptes": [],
      "remarque": "Le plan SYCEBNL n'ouvre aucun 215 (fonds commercial) · rien à attribuer."
    }
  },
  {
    "cle": "II.1",
    "SYSCOHADA": {
      "comptes": [
        "23130000"
      ],
      "remarque": "Par défaut · 2311 industriel, 2312 agricole, 2314 logement du personnel selon l'usage ; 232x sur sol d'autrui."
    },
    "SYCEBNL": {
      "comptes": [
        "23130000",
        "23170000"
      ],
      "remarque": "Administratif ou, pour un culte, édifice religieux (2317, propre au SYCEBNL)."
    }
  },
  {
    "cle": "II.2",
    "SYSCOHADA": {
      "comptes": [
        "23110000",
        "23130000"
      ],
      "remarque": "Industriel (garages, hangars, ateliers) au 2311, commercial au 2313."
    },
    "SYCEBNL": {
      "comptes": [
        "23110000",
        "23130000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.3",
    "SYSCOHADA": {
      "comptes": [
        "23410000"
      ],
      "remarque": "Installation complexe spécialisée sur sol propre (2342 sur sol d'autrui)."
    },
    "SYCEBNL": {
      "comptes": [
        "23410000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.4",
    "SYSCOHADA": {
      "comptes": [
        "23340000"
      ],
      "remarque": "Barrages, digues."
    },
    "SYCEBNL": {
      "comptes": [
        "23340000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.5",
    "SYSCOHADA": {
      "comptes": [
        "23430000"
      ],
      "remarque": "Installation à caractère spécifique sur sol propre."
    },
    "SYCEBNL": {
      "comptes": [
        "23430000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.6",
    "SYSCOHADA": {
      "comptes": [
        "23430000"
      ],
      "remarque": "Installation à caractère spécifique · un réseau public d'adduction irait au 2338."
    },
    "SYCEBNL": {
      "comptes": [
        "23430000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.7",
    "SYSCOHADA": {
      "comptes": [
        "23110000"
      ],
      "remarque": "Bâtiment industriel · les machines qu'il abrite vont au 2411."
    },
    "SYCEBNL": {
      "comptes": [
        "23110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.8",
    "SYSCOHADA": {
      "comptes": [
        "23140000"
      ],
      "remarque": "Logement du personnel · 2315 si immeuble de placement."
    },
    "SYCEBNL": {
      "comptes": [
        "23140000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.9",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel industriel · 2341 si l'ouvrage est maçonné et indissociable du bâtiment."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.10",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.11",
    "SYSCOHADA": {
      "comptes": [
        "23130000"
      ],
      "remarque": "Bâtiment selon l'usage · 232x s'il est posé sur le sol d'autrui."
    },
    "SYCEBNL": {
      "comptes": [
        "23130000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.12",
    "SYSCOHADA": {
      "comptes": [
        "23310000"
      ],
      "remarque": "Voies de terre."
    },
    "SYCEBNL": {
      "comptes": [
        "23310000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.13",
    "SYSCOHADA": {
      "comptes": [
        "23310000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "23310000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.14",
    "SYSCOHADA": {
      "comptes": [
        "23350000"
      ],
      "remarque": "Pistes d'aérodrome."
    },
    "SYCEBNL": {
      "comptes": [
        "23350000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.15",
    "SYSCOHADA": {
      "comptes": [
        "23330000"
      ],
      "remarque": "Voies d'eau."
    },
    "SYCEBNL": {
      "comptes": [
        "23330000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.16",
    "SYSCOHADA": {
      "comptes": [
        "23320000"
      ],
      "remarque": "Voies de fer."
    },
    "SYCEBNL": {
      "comptes": [
        "23320000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.17",
    "SYSCOHADA": {
      "comptes": [
        "23320000"
      ],
      "remarque": "Composant de la voie de fer, à sous-compter."
    },
    "SYCEBNL": {
      "comptes": [
        "23320000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.18",
    "SYSCOHADA": {
      "comptes": [
        "23380000"
      ],
      "remarque": "Autres ouvrages d'infrastructure · 2343 s'il dessert un seul site de l'entité."
    },
    "SYCEBNL": {
      "comptes": [
        "23380000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.19",
    "SYSCOHADA": {
      "comptes": [
        "22610000"
      ],
      "remarque": "Terrain aménagé « Parkings » · le revêtement s'amortit, le terrain nu non (fiche du compte 22) : à séparer."
    },
    "SYCEBNL": {
      "comptes": [
        "22610000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "II.20",
    "SYSCOHADA": {
      "comptes": [
        "23430000"
      ],
      "remarque": "Installation à caractère spécifique."
    },
    "SYCEBNL": {
      "comptes": [
        "23370000"
      ],
      "remarque": "Stades et autres infrastructures sportives (propre au SYCEBNL)."
    }
  },
  {
    "cle": "II.21",
    "SYSCOHADA": {
      "comptes": [
        "23430000"
      ],
      "remarque": "Installation à caractère spécifique."
    },
    "SYCEBNL": {
      "comptes": [
        "23370000"
      ],
      "remarque": "Stades et autres infrastructures sportives (propre au SYCEBNL)."
    }
  },
  {
    "cle": "II.22",
    "SYSCOHADA": {
      "comptes": [
        "22610000",
        "23430000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "22610000",
        "23370000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    }
  },
  {
    "cle": "III.1",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.2",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.3",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.4",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.5",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.6",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "2343 si l'ouvrage est fixé au sol et maçonné."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.7",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "2341 s'il fait partie d'une installation complexe spécialisée."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.8",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.9",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel industriel (boulangerie) · 2413 en commerce."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.10",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel industriel de chantier."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.11",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.12",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.13",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.14",
    "SYSCOHADA": {
      "comptes": [
        "24120000"
      ],
      "remarque": "Outillage industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24120000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.15",
    "SYSCOHADA": {
      "comptes": [
        "23410000"
      ],
      "remarque": "Installation complexe spécialisée (2342 sur sol d'autrui)."
    },
    "SYCEBNL": {
      "comptes": [
        "23410000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.16",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.17",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.18",
    "SYSCOHADA": {
      "comptes": [
        "24120000"
      ],
      "remarque": "Outillage industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24120000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.19",
    "SYSCOHADA": {
      "comptes": [
        "24120000"
      ],
      "remarque": "Outillage industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24120000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.20",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.21",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.22",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "2343 si incorporé au bâtiment."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.23",
    "SYSCOHADA": {
      "comptes": [
        "23450000"
      ],
      "remarque": "Aménagement du bâtiment · composant du bâtiment à durée propre (fiche du compte 23)."
    },
    "SYCEBNL": {
      "comptes": [
        "23450000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.24",
    "SYSCOHADA": {
      "comptes": [
        "23430000"
      ],
      "remarque": "Installation à caractère spécifique · 2411 si mobile."
    },
    "SYCEBNL": {
      "comptes": [
        "23430000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.25",
    "SYSCOHADA": {
      "comptes": [
        "24110000",
        "23450000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000",
        "23450000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.26",
    "SYSCOHADA": {
      "comptes": [
        "24130000"
      ],
      "remarque": "Matériel commercial · 2444 en bureau."
    },
    "SYCEBNL": {
      "comptes": [
        "24130000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "III.27",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Les fûts consignés vont au 243 (emballages récupérables)."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.1",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel industriel de travaux publics."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.2",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Matériel de chantier · 2451 s'il est d'abord un véhicule immatriculé."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.3",
    "SYSCOHADA": {
      "comptes": [
        "24580000"
      ],
      "remarque": "Autres matériels de transport · 2451 si automobile."
    },
    "SYCEBNL": {
      "comptes": [
        "24580000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.4",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.5",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.6",
    "SYSCOHADA": {
      "comptes": [
        "24120000"
      ],
      "remarque": "Outillage industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24120000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.7",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.8",
    "SYSCOHADA": {
      "comptes": [
        "23410000"
      ],
      "remarque": "Installation complexe spécialisée."
    },
    "SYCEBNL": {
      "comptes": [
        "23410000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.9",
    "SYSCOHADA": {
      "comptes": [
        "23410000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "23410000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IV.10",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.1",
    "SYSCOHADA": {
      "comptes": [
        "24520000"
      ],
      "remarque": "Matériel ferroviaire."
    },
    "SYCEBNL": {
      "comptes": [
        "24520000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.2",
    "SYSCOHADA": {
      "comptes": [
        "24520000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24520000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.3",
    "SYSCOHADA": {
      "comptes": [
        "24520000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24520000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.4",
    "SYSCOHADA": {
      "comptes": [
        "23320000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "23320000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.5",
    "SYSCOHADA": {
      "comptes": [
        "23320000"
      ],
      "remarque": "Voies de fer · même bien que « Voies ferrées » (II), à un autre taux : à trancher."
    },
    "SYCEBNL": {
      "comptes": [
        "23320000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.6",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "Chariots de manutention · 2451 s'ils circulent sur route."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.7",
    "SYSCOHADA": {
      "comptes": [
        "24550000",
        "24540000"
      ],
      "remarque": "Aérien au 2455, naval au 2454 (fluvial ou lagunaire au 2453)."
    },
    "SYCEBNL": {
      "comptes": [
        "24550000",
        "24540000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.8",
    "SYSCOHADA": {
      "comptes": [
        "24550000"
      ],
      "remarque": "Composants de l'aéronef."
    },
    "SYCEBNL": {
      "comptes": [
        "24550000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.9",
    "SYSCOHADA": {
      "comptes": [
        "24550000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "24550000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.10",
    "SYSCOHADA": {
      "comptes": [
        "24550000"
      ],
      "remarque": "Composant « révision majeure » du bien (AUDCIF Titre VIII ch. 5 § 1), dans le compte du bien concerné · aucune provision pour grosses réparations."
    },
    "SYCEBNL": {
      "comptes": [
        "24550000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.11",
    "SYSCOHADA": {
      "comptes": [
        "24300000"
      ],
      "remarque": "Matériel d'emballage récupérable et identifiable."
    },
    "SYCEBNL": {
      "comptes": [
        "24300000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.12",
    "SYSCOHADA": {
      "comptes": [
        "24300000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24300000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.13",
    "SYSCOHADA": {
      "comptes": [
        "24300000",
        "24580000"
      ],
      "remarque": "Emballage récupérable s'il circule avec la marchandise ; autre matériel de transport sinon."
    },
    "SYCEBNL": {
      "comptes": [
        "24300000",
        "24580000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.14",
    "SYSCOHADA": {
      "comptes": [
        "24510000"
      ],
      "remarque": "Matériel automobile."
    },
    "SYCEBNL": {
      "comptes": [
        "24510000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.15",
    "SYSCOHADA": {
      "comptes": [
        "24510000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24510000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.16",
    "SYSCOHADA": {
      "comptes": [
        "24510000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24510000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.17",
    "SYSCOHADA": {
      "comptes": [
        "24510000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24510000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.18",
    "SYSCOHADA": {
      "comptes": [
        "24510000",
        "24210000"
      ],
      "remarque": "Routier au 2451, agricole au 2421."
    },
    "SYCEBNL": {
      "comptes": [
        "24510000",
        "24210000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.19",
    "SYSCOHADA": {
      "comptes": [
        "24570000"
      ],
      "remarque": "Matériel hippomobile · 2421 si charrette agricole."
    },
    "SYCEBNL": {
      "comptes": [
        "24570000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "V.20",
    "SYSCOHADA": {
      "comptes": [
        "24210000"
      ],
      "remarque": "Matériel agricole (exploitation forestière)."
    },
    "SYCEBNL": {
      "comptes": [
        "24210000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.1",
    "SYSCOHADA": {
      "comptes": [
        "23450000",
        "23510000"
      ],
      "remarque": "Des bâtiments au 2345, de bureaux au 2351 · du matériel au 2471."
    },
    "SYCEBNL": {
      "comptes": [
        "23450000",
        "23510000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.2",
    "SYSCOHADA": {
      "comptes": [
        "24440000"
      ],
      "remarque": "Mobilier de bureau."
    },
    "SYCEBNL": {
      "comptes": [
        "24410000"
      ],
      "remarque": "Matériel et mobilier de bureau (le 2444 SYCEBNL est le mobilier SPORTIF)."
    }
  },
  {
    "cle": "VI.3",
    "SYSCOHADA": {
      "comptes": [
        "24440000",
        "24470000"
      ],
      "remarque": "Bureau au 2444, logements du personnel au 2447."
    },
    "SYCEBNL": {
      "comptes": [
        "24410000",
        "24470000"
      ],
      "remarque": "Bureau au 2441 (le 2444 SYCEBNL est le mobilier SPORTIF), logements du personnel au 2447."
    }
  },
  {
    "cle": "VI.4",
    "SYSCOHADA": {
      "comptes": [
        "24410000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24410000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.5",
    "SYSCOHADA": {
      "comptes": [
        "24880000"
      ],
      "remarque": "Divers matériels mobiliers."
    },
    "SYCEBNL": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.6",
    "SYSCOHADA": {
      "comptes": [
        "24440000"
      ],
      "remarque": "Mobilier de bureau."
    },
    "SYCEBNL": {
      "comptes": [
        "24410000"
      ],
      "remarque": "Matériel et mobilier de bureau (le 2444 SYCEBNL est le mobilier SPORTIF)."
    }
  },
  {
    "cle": "VI.7",
    "SYSCOHADA": {
      "comptes": [
        "24420000"
      ],
      "remarque": "Matériel informatique."
    },
    "SYCEBNL": {
      "comptes": [
        "24420000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.8",
    "SYSCOHADA": {
      "comptes": [
        "24430000"
      ],
      "remarque": "Matériel bureautique."
    },
    "SYCEBNL": {
      "comptes": [
        "24420000"
      ],
      "remarque": "Matériel et mobilier informatique et bureautique (le 2443 SYCEBNL est le mobilier RELIGIEUX)."
    }
  },
  {
    "cle": "VI.9",
    "SYSCOHADA": {
      "comptes": [
        "24880000"
      ],
      "remarque": "Divers · 2345 s'ils font partie de l'installation de sécurité du bâtiment."
    },
    "SYCEBNL": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.10",
    "SYSCOHADA": {
      "comptes": [
        "23510000"
      ],
      "remarque": "Installation générale de bureaux · 2441 si le poste est mobile."
    },
    "SYCEBNL": {
      "comptes": [
        "23510000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.11",
    "SYSCOHADA": {
      "comptes": [
        "23450000"
      ],
      "remarque": "Aménagement du bâtiment."
    },
    "SYCEBNL": {
      "comptes": [
        "23450000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.12",
    "SYSCOHADA": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.13",
    "SYSCOHADA": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.14",
    "SYSCOHADA": {
      "comptes": [
        "23450000"
      ],
      "remarque": "Fixés à demeure · agencement du bâtiment."
    },
    "SYCEBNL": {
      "comptes": [
        "23450000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.15",
    "SYSCOHADA": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VI.16",
    "SYSCOHADA": {
      "comptes": [
        "23450000"
      ],
      "remarque": "Aménagement du bâtiment."
    },
    "SYCEBNL": {
      "comptes": [
        "23450000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VII.1",
    "SYSCOHADA": {
      "comptes": [
        "23510000"
      ],
      "remarque": "Installation générale · 2441 pour un appareil indépendant."
    },
    "SYCEBNL": {
      "comptes": [
        "23510000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VII.2",
    "SYSCOHADA": {
      "comptes": [
        "24410000"
      ],
      "remarque": "Matériel de bureau · souvent sous le seuil du petit matériel (arrêté n° 014/2025)."
    },
    "SYCEBNL": {
      "comptes": [
        "24410000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VII.3",
    "SYSCOHADA": {
      "comptes": [
        "24410000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24410000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VII.4",
    "SYSCOHADA": {
      "comptes": [
        "24410000",
        "24470000"
      ],
      "remarque": "Bureau ou logement du personnel."
    },
    "SYCEBNL": {
      "comptes": [
        "24410000",
        "24470000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VII.5",
    "SYSCOHADA": {
      "comptes": [
        "24470000",
        "24130000"
      ],
      "remarque": "Logement du personnel, ou matériel commercial (blanchisserie)."
    },
    "SYCEBNL": {
      "comptes": [
        "24470000",
        "24130000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.1",
    "SYSCOHADA": {
      "comptes": [
        "24470000",
        "24880000"
      ],
      "remarque": "Logement du personnel ; hôtellerie au 2488."
    },
    "SYCEBNL": {
      "comptes": [
        "24470000",
        "24880000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.2",
    "SYSCOHADA": {
      "comptes": [
        "24130000"
      ],
      "remarque": "Matériel commercial (restauration, hôtellerie)."
    },
    "SYCEBNL": {
      "comptes": [
        "24130000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.3",
    "SYSCOHADA": {
      "comptes": [
        "24130000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24130000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.4",
    "SYSCOHADA": {
      "comptes": [
        "23450000"
      ],
      "remarque": "2481 s'il s'agit d'œuvres d'art."
    },
    "SYCEBNL": {
      "comptes": [
        "23450000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.5",
    "SYSCOHADA": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24880000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.6",
    "SYSCOHADA": {
      "comptes": [
        "23430000"
      ],
      "remarque": "Composant de la piscine."
    },
    "SYCEBNL": {
      "comptes": [
        "23820000"
      ],
      "remarque": "Autres installations et agencements des stades et infrastructures sportives."
    }
  },
  {
    "cle": "VIII.7",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.8",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.9",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.10",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.11",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.12",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.13",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.14",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.15",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.16",
    "SYSCOHADA": {
      "comptes": [
        "24120000"
      ],
      "remarque": "Outillage industriel."
    },
    "SYCEBNL": {
      "comptes": [
        "24120000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.17",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.18",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.19",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "VIII.20",
    "SYSCOHADA": {
      "comptes": [
        "24110000"
      ],
      "remarque": "2413 en restauration."
    },
    "SYCEBNL": {
      "comptes": [
        "24110000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.1",
    "SYSCOHADA": {
      "comptes": [
        "24210000"
      ],
      "remarque": "Matériel agricole · 2454 pour un navire de pêche."
    },
    "SYCEBNL": {
      "comptes": [
        "24210000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.2",
    "SYSCOHADA": {
      "comptes": [
        "24620000",
        "24610000"
      ],
      "remarque": "Reproducteurs au 2462, trait (labour) au 2461."
    },
    "SYCEBNL": {
      "comptes": [
        "24620000",
        "24610000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.3",
    "SYSCOHADA": {
      "comptes": [
        "24210000"
      ],
      "remarque": ""
    },
    "SYCEBNL": {
      "comptes": [
        "24210000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.4",
    "SYSCOHADA": {
      "comptes": [
        "24210000"
      ],
      "remarque": "Matériel agricole."
    },
    "SYCEBNL": {
      "comptes": [
        "24210000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.5",
    "SYSCOHADA": {
      "comptes": [
        "24620000",
        "24610000",
        "24630000"
      ],
      "remarque": "Production au 2462, service (trait, garde) au 2461 ou au 2463."
    },
    "SYCEBNL": {
      "comptes": [
        "24620000",
        "24610000",
        "24630000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.6",
    "SYSCOHADA": {
      "comptes": [
        "24650000"
      ],
      "remarque": "Plantations agricoles · 2241 s'il s'agit d'une mise en valeur du terrain."
    },
    "SYCEBNL": {
      "comptes": [
        "24650000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.7",
    "SYSCOHADA": {
      "comptes": [
        "22450000"
      ],
      "remarque": "Améliorations du fonds · amortissables, à la différence du terrain."
    },
    "SYCEBNL": {
      "comptes": [
        "22450000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.8",
    "SYSCOHADA": {
      "comptes": [
        "23430000"
      ],
      "remarque": "Installation à caractère spécifique."
    },
    "SYCEBNL": {
      "comptes": [
        "23430000"
      ],
      "remarque": ""
    }
  },
  {
    "cle": "IX.9",
    "SYSCOHADA": {
      "comptes": [
        "24210000"
      ],
      "remarque": "Matériel agricole · 2343 si le réseau est enterré."
    },
    "SYCEBNL": {
      "comptes": [
        "24210000"
      ],
      "remarque": ""
    }
  }
];
