/**
 * SCHÉMAS D'ÉCRITURE ATTESTÉS PAR LE GUIDE D'APPLICATION SYCEBNL.
 *
 * FICHIER ENGENDRÉ · ne pas retoucher à la main. Il se régénère par
 * `node scripts/extraire-schemas-guides.cjs <racine des compétences>` depuis
 * le guide officiel encodé dans la compétence `sycebnl`.
 *
 * Chaque entrée est UNE écriture du guide : les comptes débités, les comptes
 * crédités, et l'application dont elle vient. La provenance n'est pas
 * décorative · un contrôle qui dit « ce schéma n'est pas au guide » doit
 * pouvoir montrer, pour ceux qui y sont, l'application exacte qui l'atteste.
 *
 * Les numéros sont ceux du guide, à leur profondeur d'origine (parfois 2
 * chiffres, parfois 4) · les rallonger inventerait une subdivision. Le
 * rapprochement avec le plan du dossier se fait par PRÉFIXE.
 */
export interface SchemaAtteste {
  /** Le guide et son numéro d'application · la preuve. */
  source: string;
  /** Intitulé de l'application, tel qu'il figure au guide. */
  titre: string;
  debits: string[];
  credits: string[];
  /**
   * Écriture de TRANSITION vers le référentiel révisé · elle mouvemente des
   * comptes abolis et ne justifie AUCUNE écriture d'aujourd'hui.
   */
  transition?: boolean;
}

export const SCHEMAS_GUIDE_SYCEBNL: SchemaAtteste[] = [
  { source: "SYCEBNL · Application 1", titre: "Dotation consomptible et non consomptible", debits: ["4511","4512"], credits: ["1015","1041"] },
  { source: "SYCEBNL · Application 1", titre: "Dotation consomptible et non consomptible", debits: ["2441","2442","2451","571"], credits: ["4511","4512"] },
  { source: "SYCEBNL · Application 1", titre: "Dotation consomptible et non consomptible", debits: ["4511","4512"], credits: ["1021","1025"] },
  { source: "SYCEBNL · Application 1", titre: "Dotation consomptible et non consomptible", debits: ["2441","52","57"], credits: ["4511","4512"] },
  { source: "SYCEBNL · Application 1", titre: "Dotation consomptible et non consomptible", debits: ["1049"], credits: ["703"] },
  { source: "SYCEBNL · Application 1", titre: "Dotation consomptible et non consomptible", debits: ["2441","2442","2451","571"], credits: ["1015","1041"] },
  { source: "SYCEBNL · Application 1", titre: "Dotation consomptible et non consomptible", debits: ["2441","52","57"], credits: ["1021","1025"] },
  { source: "SYCEBNL · Application 2", titre: "Droit d'adhésion et appel de cotisations de nouveaux membres", debits: ["411"], credits: ["103","1851","701"] },
  { source: "SYCEBNL · Application 2", titre: "Droit d'adhésion et appel de cotisations de nouveaux membres", debits: ["52"], credits: ["411"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["4731"], credits: ["1417"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["5211"], credits: ["4731"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["2221"], credits: ["4812"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["4812"], credits: ["5211"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["1417"], credits: ["799"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["231"], credits: ["4812"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["4812"], credits: ["5211"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["6813"], credits: ["2838"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["1417"], credits: ["799"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["1417"], credits: ["799"] },
  { source: "SYCEBNL · Application 3", titre: "Subventions d'investissement destinées à une association", debits: ["2234"], credits: ["2221"] },
  { source: "SYCEBNL · Application 4", titre: "Fonds non utilisés en fin d'exercice destinés à un projet spécifique", debits: ["52"], credits: ["165"] },
  { source: "SYCEBNL · Application 4", titre: "Fonds non utilisés en fin d'exercice destinés à un projet spécifique", debits: ["165"], credits: ["7925"] },
  { source: "SYCEBNL · Application 4", titre: "Fonds non utilisés en fin d'exercice destinés à un projet spécifique", debits: ["165"], credits: ["7925"] },
  { source: "SYCEBNL · Application 5", titre: "Fonds provenant des dons et des legs d'immobilisations", debits: ["2313","2441","2442","2451"], credits: ["167","4861"] },
  { source: "SYCEBNL · Application 5", titre: "Fonds provenant des dons et des legs d'immobilisations", debits: ["4861"], credits: ["52"] },
  { source: "SYCEBNL · Application 5", titre: "Fonds provenant des dons et des legs d'immobilisations", debits: ["1679"], credits: ["192"] },
  { source: "SYCEBNL · Application 5", titre: "Fonds provenant des dons et des legs d'immobilisations", debits: ["6813"], credits: ["28313","28442","28444","28451"] },
  { source: "SYCEBNL · Application 5", titre: "Fonds provenant des dons et des legs d'immobilisations", debits: ["167"], credits: ["7923"] },
  { source: "SYCEBNL · Application 6", titre: "Legs et donations non encore reçus d'immobilisations destinées à la vente", debits: ["203","204"], credits: ["172"] },
  { source: "SYCEBNL · Application 6", titre: "Legs et donations non encore reçus d'immobilisations destinées à la vente", debits: ["6952"], credits: ["2902"] },
  { source: "SYCEBNL · Application 6", titre: "Legs et donations non encore reçus d'immobilisations destinées à la vente", debits: ["818"], credits: ["203","204"] },
  { source: "SYCEBNL · Application 6", titre: "Legs et donations non encore reçus d'immobilisations destinées à la vente", debits: ["485"], credits: ["828"] },
  { source: "SYCEBNL · Application 6", titre: "Legs et donations non encore reçus d'immobilisations destinées à la vente", debits: ["52"], credits: ["485"] },
  { source: "SYCEBNL · Application 6", titre: "Legs et donations non encore reçus d'immobilisations destinées à la vente", debits: ["172"], credits: ["7962"] },
  { source: "SYCEBNL · Application 6", titre: "Legs et donations non encore reçus d'immobilisations destinées à la vente", debits: ["2902"], credits: ["7952"] },
  { source: "SYCEBNL · Application 7", titre: "Donation temporaire d'usufruit", debits: ["2011"], credits: ["171"] },
  { source: "SYCEBNL · Application 7", titre: "Donation temporaire d'usufruit", debits: ["412"], credits: ["7082"] },
  { source: "SYCEBNL · Application 7", titre: "Donation temporaire d'usufruit", debits: ["52"], credits: ["412"] },
  { source: "SYCEBNL · Application 7", titre: "Donation temporaire d'usufruit", debits: ["680"], credits: ["280"] },
  { source: "SYCEBNL · Application 7", titre: "Donation temporaire d'usufruit", debits: ["171"], credits: ["7961"] },
  { source: "SYCEBNL · Application 7", titre: "Donation temporaire d'usufruit", debits: ["280"], credits: ["2011"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["52"], credits: ["162","462"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["2234","2318","2441","2442","2451"], credits: ["4812"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["4812"], credits: ["52"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["6011","6050","6181"], credits: ["40"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["6611"], credits: ["422"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["6413"], credits: ["4421"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["664"], credits: ["431"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["431","4421"], credits: ["52"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["462"], credits: ["702"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["162"], credits: ["165"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["165"], credits: ["162"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["462"], credits: ["702"] },
  { source: "SYCEBNL · Application 8", titre: "Projet de développement", debits: ["162"], credits: ["462"] },
  { source: "SYCEBNL · Application 9", titre: "Dons en nature à distribuer", debits: ["654"], credits: ["7542"] },
  { source: "SYCEBNL · Application 9", titre: "Dons en nature à distribuer", debits: ["345"], credits: ["6035"] },
  { source: "SYCEBNL · Application 9", titre: "Dons en nature à distribuer", debits: ["7542"], credits: ["4713"] },
  { source: "SYCEBNL · Application 9", titre: "Dons en nature à distribuer", debits: ["6035"], credits: ["345"] },
  { source: "SYCEBNL · Application 9", titre: "Dons en nature à distribuer", debits: ["4713"], credits: ["7542"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["412"], credits: ["7081"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["52","57"], credits: ["412"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["901"], credits: ["910"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["8311"], credits: ["52"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["476"], credits: ["8311"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["8311"], credits: ["476"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["52"], credits: ["8421"] },
  { source: "SYCEBNL · Application 10", titre: "Dons en nature à vendre", debits: ["910"], credits: ["901"] },
  { source: "SYCEBNL · Application 11", titre: "Dons en numéraire et revenus des manifestations et édifices religieux", debits: ["52","57"], credits: ["70410","70430","70441","70442"] },
  { source: "SYCEBNL · Application 11", titre: "Dons en numéraire et revenus des manifestations et édifices religieux", debits: ["475"], credits: ["7041"] },
  { source: "SYCEBNL · Application 11", titre: "Dons en numéraire et revenus des manifestations et édifices religieux", debits: ["6061","6062"], credits: ["401"] },
  { source: "SYCEBNL · Application 11", titre: "Dons en numéraire et revenus des manifestations et édifices religieux", debits: ["57"], credits: ["706"] },
  { source: "SYCEBNL · Application 11", titre: "Dons en numéraire et revenus des manifestations et édifices religieux", debits: ["52","57"], credits: ["7041","7044","7045"] },
  { source: "SYCEBNL · Application 11", titre: "Dons en numéraire et revenus des manifestations et édifices religieux", debits: ["252"], credits: ["52"] },
  { source: "SYCEBNL · Application 11", titre: "Dons en numéraire et revenus des manifestations et édifices religieux", debits: ["2327"], credits: ["252","4812"] },
  { source: "SYCEBNL · Application 12", titre: "Frais de recherche de fonds", debits: ["636"], credits: ["40"] },
  { source: "SYCEBNL · Application 13", titre: "Cotisations des membres", debits: ["411"], credits: ["701"] },
  { source: "SYCEBNL · Application 13", titre: "Cotisations des membres", debits: ["57"], credits: ["411"] },
  { source: "SYCEBNL · Application 13", titre: "Cotisations des membres", debits: ["4161"], credits: ["411"] },
  { source: "SYCEBNL · Application 13", titre: "Cotisations des membres", debits: ["6594"], credits: ["4912"] },
  { source: "SYCEBNL · Application 14", titre: "Contribution du fondateur pour couverture des frais de fonctionnement d'une fondation", debits: ["52"], credits: ["752"] },
  { source: "SYCEBNL · Application 15", titre: "Subventions et aides financières versées par les EBNL", debits: ["652"], credits: ["57"] },
  { source: "SYCEBNL · Application 16", titre: "Subventions d'exploitation se répartissant sur plusieurs exercices", debits: ["4732"], credits: ["711"] },
  { source: "SYCEBNL · Application 16", titre: "Subventions d'exploitation se répartissant sur plusieurs exercices", debits: ["52"], credits: ["4732"] },
  { source: "SYCEBNL · Application 16", titre: "Subventions d'exploitation se répartissant sur plusieurs exercices", debits: ["711"], credits: ["477"] },
  { source: "SYCEBNL · Application 16", titre: "Subventions d'exploitation se répartissant sur plusieurs exercices", debits: ["477"], credits: ["711"] },
  { source: "SYCEBNL · Application 17", titre: "Abandons de frais engagés par les bénévoles", debits: ["6055","6181","6383","6384"], credits: ["4572"] },
  { source: "SYCEBNL · Application 17", titre: "Abandons de frais engagés par les bénévoles", debits: ["4572"], credits: ["7583"] },
  { source: "SYCEBNL · Application 18", titre: "Convention de mécénat", debits: ["4751"], credits: ["7046"] },
  { source: "SYCEBNL · Application 18", titre: "Convention de mécénat", debits: ["52"], credits: ["4751"] },
  { source: "SYCEBNL · Application 18", titre: "Convention de mécénat", debits: ["52"], credits: ["4751"] },
  { source: "SYCEBNL · Application 19", titre: "Restitution de subvention non utilisée conformément à l'objet prévu dans la convention", debits: ["4731","4732"], credits: ["1417","713"] },
  { source: "SYCEBNL · Application 19", titre: "Restitution de subvention non utilisée conformément à l'objet prévu dans la convention", debits: ["52"], credits: ["4731","4732"] },
  { source: "SYCEBNL · Application 19", titre: "Restitution de subvention non utilisée conformément à l'objet prévu dans la convention", debits: ["1417"], credits: ["4739"] },
  { source: "SYCEBNL · Application 19", titre: "Restitution de subvention non utilisée conformément à l'objet prévu dans la convention", debits: ["4739"], credits: ["52"] },
  { source: "SYCEBNL · Application 20", titre: "Contributions volontaires en nature", debits: ["901"], credits: ["910"] },
  { source: "SYCEBNL · Application 20", titre: "Contributions volontaires en nature", debits: ["904"], credits: ["914"] },
];
