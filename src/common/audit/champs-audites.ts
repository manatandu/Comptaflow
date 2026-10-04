/**
 * CE QUI EST JOURNALISÉ, ET CE QUI NE L'EST PAS.
 *
 * Journaliser tous les modèles reviendrait à doubler chaque écriture de la
 * base, y compris les lignes engendrées en masse (lignes d'écriture,
 * échéances, ventilations analytiques), pour une trace que personne ne lira ·
 * le détail est déjà reconstituable depuis la pièce mère.
 *
 * CHAQUE MODÈLE DU SCHÉMA EST CLASSÉ, UN PAR UN · ici, ou dans
 * `NON_AUDITES_MOTIVES` avec son motif, jamais les deux. Un test relit le
 * schéma et tombe sur tout modèle nouveau tant que personne ne l'a tranché ·
 * c'est ainsi que des tables de même nature que les auditées (dépréciation,
 * facture, consignation, engagement, mandat de l'auditeur…) étaient restées
 * hors du journal sans que personne l'ait décidé.
 *
 * La liste ci-dessous est celle des modèles qu'un réviseur demande : la
 * CONFIGURATION du dossier (qui a changé le plan de comptes, un journal, un
 * taux de taxe, un droit d'accès) et les ACTES qui touchent la comptabilité
 * hors du flux normal de saisie (clôture, affectation du résultat,
 * lettrage, réévaluation).
 */
export const MODELES_AUDITES = new Set<string>([
  // Le dossier lui-même et ses accès · le premier bloc qu'un auditeur
  // demande, avant même les comptes.
  'Tenant',
  'User',
  'Licence',
  // La configuration comptable · en changer un poste change tous les états
  // produits ensuite, sans qu'aucune écriture ne bouge.
  'Compte',
  // Les natures commandent les défauts des comptes créés ensuite.
  'NatureCompte',
  'Journal',
  'TauxTva',
  'Devise',
  'PlanAnalytique',
  'SectionAnalytique',
  'FamilleImmobilisation',
  'ModeleSaisie',
  // Un RIB modifié en silence détourne un paiement · la banque se journalise.
  'Banque',
  'RibBanque',
  'LibelleEcriture',
  'Tiers',
  // Retirer le contrat ou le RCCM d'un tiers doit laisser une trace · le
  // CONTENU n'est pas recopié (colonne exclue ci-dessous), l'empreinte suffit.
  'DocumentTiers',
  // Même raison que RibBanque · le RIB d'un fournisseur changé la veille d'un
  // virement est la fraude la plus courante qui soit. L'ordre de virement se
  // journalise à la tête · création, impressions, annulation.
  'RibTiers',
  'OrdreVirement',
  'Bailleur',
  // Les actes qui font ou défont un exercice.
  'Exercice',
  'Cloture',
  'AffectationResultat',
  // Les écritures, à la tête seulement · les lignes suivent la tête et sont
  // reconstituables par elle. Journaliser LigneEcriture doublerait le volume
  // de la table la plus grosse du logiciel pour n'ajouter aucune information
  // que la tête ne porte déjà.
  'Ecriture',
  'Lettrage',
  'Regularisation',
  'Reevaluation',
  // La provision pour pertes de change existant à l'ouverture (A5) · une
  // DÉCLARATION, comme l'en-cours d'ouverture · retouchée après coup, elle
  // change la dotation ou la reprise de la réévaluation suivante sans
  // qu'aucune écriture n'en garde la cause.
  'ProvisionChangeOuverture',
  'RapprochementBancaire',
  // L'en-cours d'ouverture est une DÉCLARATION, comme le solde de départ qu'il
  // explique · retouché après coup, il referme l'écart d'ouverture sans
  // qu'aucune écriture n'ait bougé, et rien d'autre n'en garderait la trace.
  'EncoursOuvertureRapprochement',
  // Les registres légaux et fiscaux.
  'Immobilisation',
  'Donation',
  'TranscriptionInventaire',
  // L'inventaire extra-comptable · l'écart et sa DÉCISION sont exactement ce
  // qu'un réviseur reprend. Un écart requalifié après coup, ou un responsable
  // effacé, ne se verrait nulle part ailleurs. Les fiches, elles, ne sont pas
  // journalisées : elles se créent par centaines en une fois (le parc
  // immobilisé), et c'est l'écart qu'elles produisent qui porte l'enjeu.
  'CampagneInventaire',
  'EcartInventaire',
  // La circularisation · la campagne (sa forme, ses conditions déclarées)
  // et chaque demande, dont le solde figé, la réponse et sa qualification.
  // Un écart requalifié de « anomalie potentielle » en « délai » après coup
  // ne se verrait nulle part ailleurs.
  'CampagneCircularisation',
  'DemandeConfirmation',
  // Le registre des provisions · une condition décochée après coup, un
  // statut passé de PASSIF_EVENTUEL à ECARTEE, une reprise saisie en
  // utilisation : rien de tout cela ne laisse de trace ailleurs, et
  // chacun change ce que la Note annexe publiera.
  'ProvisionRisqueCharge',
  // Le registre des faiblesses · la QUALIFICATION est le champ du module.
  // Une significative rétrogradée en « autre » après coup fait disparaître,
  // d'un seul geste, l'écrit du § 9 et le report obligatoire du § A17, et
  // rien ailleurs n'en garderait la trace. La date de communication écrite
  // et l'escalade du § A24 sont dans le même cas.
  'FaiblesseControleInterne',
  'RegistreFaiblesses',
  // Le questionnaire de révision · c'est `estException` qui compte. Une
  // réponse retournée après coup fait passer une ligne du rouge au vert sans
  // que rien n'ait changé au dossier, et le questionnaire imprimé ne le dirait
  // pas. La réponse elle-même et son commentaire suivent.
  'ReponseQuestionnaire',
  // Le relevé d'unités d'œuvre · c'est le seul chiffre du plan
  // d'amortissement qu'aucun livre ne porte, et il commande directement
  // l'annuité. Un relevé corrigé après coup change la dotation d'un
  // exercice sans laisser de trace ailleurs que dans l'écriture elle-même,
  // qui ne dit pas d'où venait le nombre.
  'ConsommationUniteOeuvre',
  // Le contrat de location-acquisition · taux, loyers et option commandent la
  // dette et sa ventilation à chaque clôture (AUDCIF Titre VIII ch. 8). Un
  // taux retouché après coup déplace des intérêts d'un exercice à l'autre, et
  // l'écriture d'entrée ne dirait pas d'où venait le chiffre.
  'ContratLocationAcquisition',
  // Sa clôture par exercice · elle fige la ventilation des loyers entre la
  // dette et les intérêts, et les courus que l'exercice suivant extournera.
  'ClotureLocationAcquisition',
  // La reprise au 799 d'une subvention en nature · elle fixe la part du 14
  // rapportée au résultat de l'exercice.
  'RepriseSubventionImmobilisation',
  // Le rattachement d'une subvention en numéraire et ses réductions (lot 5) ·
  // un montant rattaché ou réduit après coup change toutes les reprises
  // suivantes, sur une écriture équilibrée.
  'SubventionImmobilisation',
  'ReductionSubventionImmobilisation',
  // La révision d'un plan d'amortissement (lot 11) · une durée changée après
  // coup change chaque dotation suivante, sur une écriture équilibrée.
  'RevisionPlanAmortissement',
  'CoutEmpruntIncorpore',
  // La réévaluation (lot 14) et la reprise de sa provision spéciale · un
  // coefficient ou une valeur actuelle changés après coup changent chaque
  // dotation suivante, sur des écritures équilibrées. Les lignes par bien,
  // engendrées en masse avec l'opération, n'y entrent pas.
  'ReevaluationBilan',
  'RepriseProvisionReevaluation',
  'MouvementDemantelement',
  // Les créances douteuses (ligne A7) · le motif, les pièces et la dépréciation
  // déclarée justifient la charge (fiche du compte 49) · retouchés après coup,
  // le dossier de révision montrerait une justification qui n'était pas celle
  // de la décision.
  'CreanceDouteuse',
  'AjustementCreanceDouteuse',
  'MouvementCreanceDouteuse',
  // L'impôt sur le résultat constaté (ligne A11) · le montant figé au clic,
  // l'attestation qui fonde l'assujettissement et l'annulation avec son motif.
  // Retouchés après coup, le constat dirait un impôt que l'écriture ne porte pas.
  'ConstatImpotResultat',
  // Comptabilité de gestion (ligne A20) · une clé de répartition justifie les
  // OD qu'elle produit, et la capacité normale déclarée décide de la part des
  // charges fixes portée au coût · retouchées en silence, le coût et la
  // répartition montrés ne seraient plus ceux qu'on a établis.
  'CleRepartition',
  'CoutProductionDeclare',
  // L'instantané qui fige les comportements d'un exercice clos · c'est lui que
  // le seuil et le coût de cet exercice lisent désormais.
  'ComportementsGestionFiges',
  // Le PV de comptage d'une caisse · le solde figé, les espèces comptées et
  // l'écart qu'ils produisent. Un chiffre corrigé après coup referme un écart
  // que la commission avait à trancher, et le PV imprimé ne le dirait pas.
  'ProcesVerbalComptageCaisse',
  'Exoneration',
  'LiquidationTva',
  'RetraitementFiscal',
  // LE REGISTRE DU PERSONNEL · les trois tables de P1. Elles sont auditées
  // pour la même raison que les écarts d'inventaire : ce qui compte n'est pas
  // la création, c'est la RETOUCHE. Une date d'entrée en vigueur reculée, un
  // type passé de CDD à CDI, une date de fin déplacée, un enfant à charge
  // ajouté après coup · chacun change une ancienneté, une requalification ou
  // une allocation, et rien d'autre n'en garderait la trace.
  //
  // ET C'EST PRÉCISÉMENT POURQUOI LA LISTE D'EXCLUSION LES SUIT. Le journal
  // recopie la ligne entière, et ces lignes portent les premières données
  // personnelles du dépôt. On garde la CLÉ (savoir que la date de naissance a
  // changé fait partie de la trace) et on masque la VALEUR.
  'Salarie',
  'ContratTravail',
  'EnfantACharge',
  // LE BULLETIN ÉMIS (P8) · il ne se modifie jamais, il s'ANNULE, et c'est
  // l'annulation et la déclaration de remise que le journal doit dater et
  // attribuer. Un bulletin annulé puis réémis sans trace est exactement ce
  // qu'un contentieux sur l'article 103 viendrait chercher.
  'BulletinPaie',
  // Une rubrique désactivée ou un fondement réécrit changent ce que le
  // bulletin suivant affichera · la trace dit qui et quand. Une avance
  // inscrite ou retirée change le net de plusieurs mois ; son MONTANT est
  // masqué comme la rémunération du contrat, la clé reste.
  'RubriquePaie',
  'AvanceSalaire',
  // Un taux de cotisation saisi par le cabinet change le calcul de tous les
  // bulletins à venir · la trace dit qui l'a posé, sur quel texte, et qui l'a
  // retiré.
  'VersionBaremePaie',

  // ══ CLASSEMENT DU 2026-09-27 · tables de même nature que les précédentes,
  // restées hors du journal sans décision (audit serveur, point I4). ══

  // Rattacher un compte à un tiers ou un modèle de règlement à ses échéances
  // change ce que le lettrage, les relances et le règlement liront ensuite ·
  // de la configuration, au même titre que la fiche du tiers.
  'TiersCompte',
  'ModeleReglement',
  // Le rattachement d'un compte à une rubrique de note change ce que la Note
  // annexe publie, sans qu'aucune écriture ne bouge.
  'RattachementNote',
  // Une cellule saisie d'une note annexe (engagements, effectifs, événements
  // postérieurs) se réécrit ou s'efface, y compris sur un exercice clos dont
  // la liasse est déposée · seul le journal garde la valeur remplacée (audit
  // final F87). Le service la retouche par son identifiant pour que l'état
  // antérieur soit lu.
  'SaisieNote',
  // Les registres du bailleur · un montant accordé, une tranche déclarée
  // encaissée ou un rapport daté transmis après coup changent ce que le
  // bailleur lira, et rien d'autre n'en garde la trace. Idem de l'engagement
  // de dépense, de sa clôture motivée et de son rattachement à une écriture.
  'ConventionFinancement',
  'TrancheFinancement',
  'RapportBailleur',
  'EngagementDepense',
  'ExecutionEngagement',
  // L'OD analytique déplace du réalisé entre sections sans passer par le
  // journal · journalisée à la tête, comme l'écriture.
  'OdAnalytique',
  // Un modèle d'abonnement engendre des écritures chaque période, un niveau de
  // relance commande chaque courrier · de la configuration.
  'ModeleAbonnement',
  'NiveauRelance',
  // Les actes du registre des immobilisations qui portent un JUGEMENT du
  // cabinet · le motif d'un reclassement, l'INDICE d'une perte de valeur
  // (AUDCIF Titre VIII ch. 12 § 2.1), qui rend la dépréciation opposable. Les
  // dotations et le dérogatoire, eux, sont CALCULÉS (voir plus bas).
  'ReclassementImmobilisation',
  'DepreciationImmobilisation',
  // Les documents obligatoires versionnés, au même titre que le livre
  // d'inventaire (manuel · AUDCIF art. 16 ; rapport · SYCEBNL art. 16-3,
  // AUSCGIE art. 138, AUSCOOP art. 108).
  'ManuelProcedures',
  'RapportActivite',
  // Qui a compté et qui a assisté · ce sont ces membres que le PV signe, et
  // une commission recomposée après coup changerait la signature d'un PV.
  'SousCommissionInventaire',
  'MembreSousCommission',
  // La tête du questionnaire · sa clôture et son motif, comme le registre des
  // faiblesses.
  'QuestionnaireRevision',
  // Ce que l'entité a fait devant son assemblée ou devant le Ministère du
  // Plan · un refus de prorogation (SYCEBNL art. 22) ou une dénonciation posé
  // après coup changent un signalement, et rien d'autre n'en garde la trace.
  'MandatAuditeur',
  'AccordCadrePlan',
  // Le facturier et l'offre · une pièce justificative (AUDCIF art. 17) et une
  // offre dont la révocation ou la réponse forment ou non un contrat (AUDCG
  // art. 242 à 245). La facture ne se modifie pas, elle s'annule par une note
  // de crédit (décret n° 011/42, art. 127) · sa suppression doit se lire.
  'Facture',
  'Devis',
  // Le magasin · l'article porte le compte de stock, et un mouvement retouché
  // ou retiré ferait naître un MALI D'INVENTAIRE qui n'existe pas.
  'ArticleStock',
  'MouvementStock',
  // La consignation · compte d'attente dont le DÉNOUEMENT (retour, vente,
  // écart) décide du bilan.
  'Consignation',
  // Les déclarations de la consolidation et du jeu IFRS · rien ne s'y déduit,
  // tout se déclare (coût des titres, pourcentages, taux, marges internes,
  // retraitements, notes), exactement comme le retraitement fiscal déjà
  // journalisé. Une déclaration retouchée change les états consolidés ou IFRS
  // sans qu'aucune écriture du dossier ne bouge.
  'EntitePerimetreConsolidation',
  'LienParticipationConsolidation',
  'FaitsConsolidationExercice',
  'OperationReciproqueConsolidation',
  'ProvisionChangeConsolidation',
  'EcartEvaluationConsolidation',
  'ResultatInterneConsolidation',
  'ParametresIfrs',
  'RegleCorrespondanceIfrs',
  'RetraitementIfrs',
  'RegleConsolidationIfrs',
  'MouvementCapitauxPropresIfrs',
  'EffetChangeTresorerieIfrs',
  'NotesIfrs',
  // Le dossier fiscal de l'exercice · acomptes versés, déficit saisi,
  // suppléments de l'Administration. Aucun livre ne les porte et chacun
  // change l'impôt ou la base des acomptes suivants (LPF art. 57 bis).
  'DossierFiscalExercice',
  // Un lot de virements récurrents retient des fournisseurs et un montant
  // habituel · de la configuration de paiement, comme le RIB.
  'LotVirement',
]);

/**
 * LES MODÈLES QUI NE LAISSENT AUCUN MAILLON, ET POURQUOI.
 *
 * Un motif par modèle, jamais une exclusion tacite. Le manifeste de
 * restitution lit cette table pour dire au dossier, table par table, pourquoi
 * l'historique n'est pas dans l'archive. Quatre familles de motifs, et une
 * cinquième se discute avant de s'écrire : les lignes d'une tête journalisée,
 * les lignes engendrées en masse (une boucle d'écritures ajouterait un verrou
 * et un maillon par ligne), ce que le logiciel CALCULE et poste avec une
 * écriture journalisée qu'il retient, et ce qui n'appartient pas à la
 * comptabilité du dossier.
 */
const LIGNES_DE_LA_TETE =
  "Lignes d'une tête journalisée, réécrites avec elle · l'événement de la tête date et attribue la retouche.";
export const NON_AUDITES_MOTIVES: Readonly<Record<string, string>> = {
  VerrouProvisionChange:
    "Verrou technique d'un geste sur la provision pour pertes de change (A5) · posé et retiré dans la même requête, il ne porte aucune donnée du dossier ; le geste, lui, est journalisé (déclaration, réévaluation, écritures).",
  VerrouCreancesDouteuses:
    "Verrou technique d'un geste sur les créances douteuses (A7) · posé et retiré dans la même requête, il ne porte aucune donnée du dossier ; le geste, lui, est journalisé (créance, revue, mouvement, écritures).",
  // ── Lignes d'une tête journalisée
  LigneEcriture:
    "Lignes de l'écriture, journalisée à la tête · la table la plus grosse du logiciel, la doubler n'ajouterait rien que la tête ne date déjà.",
  LigneAffectation: LIGNES_DE_LA_TETE,
  LigneOdAnalytique: LIGNES_DE_LA_TETE,
  LigneCleRepartition: LIGNES_DE_LA_TETE,
  LigneModeleSaisie: LIGNES_DE_LA_TETE,
  EcheanceReglement: LIGNES_DE_LA_TETE,
  LigneRetraitementIfrs: LIGNES_DE_LA_TETE,
  LigneLotVirement: LIGNES_DE_LA_TETE,
  LigneReevaluationBilan:
    'Lignes par bien de la réévaluation, journalisée à la tête · écrites avec elle ; seuls la reprise de la provision et l’imputation d’une perte les retouchent, actes eux-mêmes journalisés ou portés par une écriture.',
  CoupureComptee: 'Ventilation par coupure du PV de comptage, journalisé · le total compté est sur le PV.',
  LigneFacture: 'Lignes de la facture, journalisée, écrites avec elle et jamais retouchées seules.',
  LigneDevis: 'Lignes du devis, journalisé, écrites avec lui et jamais retouchées seules.',
  LigneOrdreVirement:
    "Lignes de l'ordre de virement, journalisé, recopiées à la date de l'ordre et jamais modifiées.",
  RetenueAvanceBulletin: "Retenue née avec le bulletin émis, journalisé · un bulletin ne se modifie pas, il s'annule.",
  // ── Lignes engendrées en masse
  LigneReleveBancaire:
    'Relevé importé en masse · la pièce est le relevé de la banque, le pointage se lit sur le rapprochement journalisé.',
  VentilationAnalytique: "Ventilations engendrées ligne à ligne avec les écritures · reconstituables depuis l'écriture.",
  BudgetSection: "Budgets mensuels engendrés en série (dotation, report d'exercice) · la section est journalisée.",
  EcheanceAbonnement: "Échéances engendrées par le modèle d'abonnement, journalisé · chacune pointe vers son écriture.",
  FicheInventaire: "Fiches créées par centaines en une fois · l'écart qu'elles produisent, et sa décision, sont journalisés.",
  LigneBalanceConsolidation: "Balance de filiale importée en masse · l'entité porte la date et le nom du fichier importé.",
  Relance:
    "Historique des rappels, émis par lots et figé à l'émission · chaque ligne est elle-même la trace (date, auteur, montant).",
  CoursDevise:
    "Cours du jour saisi en série · toute conversion fige le cours qu'elle applique (ligne d'écriture, bulletin, facture d'abonnement).",
  // ── Calculé par le logiciel, avec une écriture journalisée qu'il retient
  DotationAmortissement:
    "Calculée depuis le plan d'amortissement et postée avec son écriture, journalisée et retenue · aucune route ne la modifie.",
  AmortissementDerogatoire:
    'Calculé depuis le plan fiscal et posté avec son écriture, journalisée et retenue · aucune route ne le modifie.',
  // ── Hors de la comptabilité du dossier
  EvenementAudit: "Le journal lui-même · s'y journaliser serait récursif, sa chaîne d'empreintes le protège.",
  Message: "File d'envoi des courriels · technique, sans effet sur les comptes.",
  ModeleBulletin: 'Gabarit qui pré-remplit une simulation et ne décide rien · le bulletin émis est journalisé.',
  EtatPersonnalise: "Définition d'un état de consultation · ni état financier ni document déposé, aucune écriture.",
  SimulationBudgetaire: "Hypothèses de simulation · rien n'est passé au journal.",
  LieuBien:
    "Référentiel de localisation sans effet comptable · l'affectation d'un bien se lit sur l'immobilisation journalisée.",
  LicenceSurSiteEmise:
    "Registre d'émission de l'éditeur, hors dossier · chaque ligne porte son numéro, son émetteur et sa date.",
  FormuleAbonnement: "Grille de l'éditeur, hors dossier.",
  AbonnementCabinet:
    "Abonnement tenu par l'éditeur, hors dossier · la licence qu'il pose chez le cabinet est journalisée.",
  OptionAbonnement: "Options d'un abonnement de l'éditeur, hors dossier.",
  FactureAbonnement:
    "Lien de l'éditeur vers la facture émise, elle-même journalisée dans le dossier de l'éditeur.",
};

/**
 * CHAMPS QUE LE JOURNAL NE DOIT JAMAIS RECOPIER.
 *
 * Un journal d'audit qui recopie l'empreinte d'un mot de passe est une
 * SECONDE base de mots de passe, moins surveillée que la première et
 * conservée bien plus longtemps. Idem pour un jeton de session ou un secret.
 * La comparaison se fait en minuscules et par inclusion : `motDePasse`,
 * `motDePasseHash`, `ancienMotDePasse` tombent tous.
 */
const FRAGMENTS_SENSIBLES = [
  'motdepasse',
  'password',
  'secret',
  'jeton',
  'token',
  'csrf',
  'apikey',
  'cledeconnexion',
  'databaseurl',
];

export const MARQUEUR_MASQUE = '[masqué]';

/**
 * LA LISTE FERMÉE · ce que le fragment de nom ne peut pas attraper.
 *
 * `FRAGMENTS_SENSIBLES` est une heuristique sur le NOM · elle attrape
 * `motDePasse` parce qu'il se nomme ainsi. Elle ne peut rien contre un champ
 * dont le nom ne dit pas qu'il est sensible.
 *
 * `User.estOperateurPlateforme` en est le cas exact. Le schéma dit de lui
 * « aucun DTO n'expose ce champ » et « jamais renvoyé par /utilisateurs » ·
 * et pourtant le journal d'audit le rendait, en clair, à tout utilisateur du
 * dossier ayant accès à `/journal-audit`, puisque `User` est un modèle audité
 * et que la charge `apres` recopie la ligne entière. Le drapeau désigne le
 * compte de l'exploitant du logiciel présent dans le dossier du client :
 * exactement le compte qu'un attaquant cherche.
 *
 * D'où une liste nommée COLONNE PAR COLONNE, et un test qui la tient FERMÉE ·
 * une colonne ajoutée demain à `User` fait tomber ce test tant que quelqu'un
 * ne l'a pas classée d'un côté ou de l'autre. C'est la seule forme de liste
 * qui ne se périme pas en silence.
 */
export const COLONNES_EXCLUES_PAR_MODELE: Readonly<Record<string, readonly string[]>> = {
  // Le secret de la double authentification, le pas consommé et les
  // empreintes des codes de secours · un second facteur recopié dans un
  // journal lisible par tout le dossier n'en serait plus un.
  User: ['motDePasse', 'estOperateurPlateforme', 'secretDoubleAuth', 'dernierPasDoubleAuth', 'codesSecoursDoubleAuth'],

  // LE FICHIER LUI-MÊME · jusqu'à 5 Mo recopiés dans chaque événement, et un
  // scan de pièce d'identité lisible par tout le dossier dans un journal
  // conservé plus longtemps que la fiche. Le nom, la taille et l'empreinte
  // SHA-256 désignent la pièce sans la reproduire.
  DocumentTiers: ['contenu'],

  // LE REGISTRE DU PERSONNEL · le premier cas où l'exclusion ne protège pas
  // le LOGICIEL mais une PERSONNE.
  //
  // Le journal d'audit est lisible par tout utilisateur du dossier ayant
  // accès à `/journal-audit`. Un comptable saisit les salaires ; il n'a pas à
  // lire, dans un journal conservé bien plus longtemps que la fiche, la date
  // de naissance d'un collègue, le nom de son conjoint, celui de ses enfants
  // ou son numéro d'affiliation.
  //
  // CE QUI RESTE LISIBLE, ET POURQUOI. Le nom, le matricule et le sexe : ils
  // désignent la ligne, et un journal qui ne dit plus DE QUI il parle ne sert
  // plus de chemin de révision (AUDCIF art. 22, 6°). Les dates de
  // déclaration, l'aptitude et le drapeau `actif` : ce sont des faits de
  // GESTION, pas des données de la personne, et ce sont eux qu'un inspecteur
  // du travail vient vérifier.
  //
  // CE QUI EST MASQUÉ. Tout ce qui décrit la personne plutôt que sa relation
  // de travail, plus la RÉMUNÉRATION : la clé suffit à dire qu'elle a changé,
  // et la valeur n'a rien à faire dans un journal que tout le dossier lit.
  Salarie: [
    'numeroAffiliationCnss',
    'dateNaissance',
    'millesimeNaissance',
    'lieuNaissance',
    'nationalite',
    'nomConjoint',
  ],
  EnfantACharge: ['nom', 'postNom', 'prenoms', 'dateNaissance'],
  ContratTravail: ['remunerationBase', 'avantagesConvenus'],
  AvanceSalaire: ['montantFc', 'retenueMensuelleFc', 'objet'],
  // Le bulletin reste IDENTIFIABLE (numéro, mois, nom, statut, dates, motif
  // d'annulation) · ses MONTANTS et le détail du calcul ne le sont pas, pour
  // la même raison que la rémunération du contrat.
  BulletinPaie: [
    'numeroAffiliationCnss',
    'totalVerseFc',
    'assietteSocialeFc',
    'cotisationsTravailleurFc',
    'cotisationsEmployeurFc',
    'irppFc',
    'netAPayerFc',
    'entree',
    'calcul',
  ],
};

/** Les colonnes exclues du JOURNAL, en minuscules, comparables telles quelles. */
export function colonnesExclues(modele: string): ReadonlySet<string> {
  return new Set((COLONNES_EXCLUES_PAR_MODELE[modele] ?? []).map((c) => c.toLowerCase()));
}

/**
 * CE QUI NE SORT JAMAIS DU LOGICIEL · une liste DISTINCTE, et il a fallu
 * l'écrire.
 *
 * LES DEUX LISTES NE SERVENT PAS LA MÊME CHOSE, et les confondre a failli
 * coûter cher. `COLONNES_EXCLUES_PAR_MODELE` protège une personne d'un
 * JOURNAL que tout le dossier lit et qu'on conserve bien plus longtemps que
 * la fiche. L'archive de restitution, elle, rend au dossier SES PROPRES
 * DONNÉES, à lui seul, sur sa demande.
 *
 * `colonnesDuModele()` de la restitution lisait la liste du journal. Tant que
 * cette liste ne contenait que `motDePasse` et `estOperateurPlateforme`, les
 * deux usages coïncidaient. Le registre du personnel les a séparés : y verser
 * la date de naissance, la nationalité et la rémunération aurait, du même
 * geste, VIDÉ L'ARCHIVE de ce qu'elle doit rendre · un dossier n'aurait plus
 * pu reconstituer son propre registre, et l'archive se serait dite complète.
 * Le socle qui ne peut pas mentir aurait menti.
 *
 * D'où deux listes. Celle-ci ne contient que ce qui n'appartient PAS au
 * dossier : l'empreinte d'un mot de passe, et le drapeau qui désigne le
 * compte de l'exploitant du logiciel.
 */
export const COLONNES_JAMAIS_RESTITUEES: Readonly<Record<string, readonly string[]>> = {
  // Le second facteur est, comme le mot de passe, un moyen d'entrer, pas une
  // donnée du dossier.
  User: ['motDePasse', 'estOperateurPlateforme', 'secretDoubleAuth', 'dernierPasDoubleAuth', 'codesSecoursDoubleAuth'],
};

/** Les colonnes qu'une ARCHIVE DE RESTITUTION ne porte pas. */
export function colonnesNonRestituables(modele: string): ReadonlySet<string> {
  return new Set((COLONNES_JAMAIS_RESTITUEES[modele] ?? []).map((c) => c.toLowerCase()));
}

export function estChampSensible(nom: string, exclues?: ReadonlySet<string>): boolean {
  const n = nom.toLowerCase();
  if (exclues?.has(n)) return true;
  return FRAGMENTS_SENSIBLES.some((f) => n.includes(f));
}

/**
 * Remplace les valeurs sensibles par un marqueur, à toute profondeur. On
 * garde la CLÉ · savoir que le mot de passe a changé fait partie de la
 * trace, connaître sa valeur n'en fait pas partie.
 */
export function masquer(valeur: unknown, exclues?: ReadonlySet<string>): unknown {
  if (valeur === null || valeur === undefined) return valeur;
  if (Array.isArray(valeur)) return valeur.map((v) => masquer(v, exclues));
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === 'bigint') return valeur.toString();
  // Un Decimal de Prisma · sa sérialisation JSON par défaut est instable
  // selon la version, sa représentation textuelle ne l'est pas.
  if (typeof valeur === 'object') {
    const o = valeur as Record<string, unknown>;
    if (typeof (o as { toFixed?: unknown }).toFixed === 'function') return String(valeur);
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(o)) {
      // L'exclusion vaut à TOUTE profondeur · la charge d'une opération de
      // masse porte le filtre de la requête, qui peut nommer la colonne.
      sortie[cle] = estChampSensible(cle, exclues) ? MARQUEUR_MASQUE : masquer(v, exclues);
    }
    return sortie;
  }
  return valeur;
}
