/**
 * MODÈLES DE SAISIE · un jeu par référentiel.
 *
 * Sortis du composant pour être testables : ils citent des NUMÉROS DE
 * COMPTES, et un numéro faux dans un modèle de saisie ne casse rien · il
 * insère une écriture parfaitement valide et parfaitement fausse.
 */
export type ModeleSimple = {
  code: string;
  libelle: string;
  numeroContrepartie: string;
  sens: 'recette' | 'depense';
};

/**
 * UN JEU DE MODÈLES PAR RÉFÉRENTIEL · ils citent des NUMÉROS DE COMPTES, et
 * les deux plans n'ont ni les mêmes numéros ni les mêmes intitulés.
 *
 * Servir le jeu SYCEBNL à une entreprise produisait deux dégâts, l'un et
 * l'autre muets :
 *
 *  · le 70410000 existe bien au plan SYSCOHADA, mais c'est « 7041 Ventes de
 *    produits résiduels dans la Région ». Le modèle « Don reçu en numéraire »
 *    y insérait donc une VENTE DE DÉCHETS · écriture parfaitement valide,
 *    parfaitement fausse, et rien ne pouvait le signaler ;
 *  · 70100000, 60500000 et 66100000 n'existent PAS au plan SYSCOHADA : 701,
 *    605 et 661 y sont semés en TOTAL, donc non imputables (CLAUDE.md §7).
 *    Trois modèles sur quatre ne trouvaient aucun compte.
 *
 * Les quatre comptes SYSCOHADA retenus sont vérifiés Détail dans
 * `compte-seed-syscohada.ts`, et leurs intitulés viennent du plan officiel.
 */
export const MODELES_SIMPLES_SYCEBNL: ModeleSimple[] = [
  { code: 'don', libelle: 'Don reçu en numéraire', numeroContrepartie: '70410000', sens: 'recette' },
  { code: 'cotisation', libelle: 'Cotisation reçue', numeroContrepartie: '70100000', sens: 'recette' },
  // 6011 « Achats de biens et services liés à l'activité dans l'État partie ».
  // Le semis SYCEBNL descend désormais au quatrième chiffre comme le plan
  // officiel : 605 et 661 y sont devenus des TOTAL, donc non imputables, tout
  // comme au SYSCOHADA. Les deux référentiels visent maintenant le même
  // niveau, et pour la même raison.
  { code: 'achat', libelle: 'Achat payé', numeroContrepartie: '60110000', sens: 'depense' },
  // 6611 « Appointements salaires et commissions » (personnel national).
  { code: 'salaire', libelle: 'Salaire payé', numeroContrepartie: '66110000', sens: 'depense' },
];

export const MODELES_SIMPLES_SYSCOHADA: ModeleSimple[] = [
  // 7011 « Ventes de marchandises · Dans la Région ».
  { code: 'vente', libelle: 'Vente de marchandises au comptant', numeroContrepartie: '70110000', sens: 'recette' },
  // 7061 « Services vendus · Dans la Région ».
  { code: 'service', libelle: 'Prestation de services encaissée', numeroContrepartie: '70610000', sens: 'recette' },
  // 6011 « Achats de marchandises · Dans la Région ».
  { code: 'achat', libelle: 'Achat de marchandises payé', numeroContrepartie: '60110000', sens: 'depense' },
  // 6611 « Appointements salaires et commissions ».
  { code: 'salaire', libelle: 'Salaire payé', numeroContrepartie: '66110000', sens: 'depense' },
];

