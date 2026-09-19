/**
 * LA VALORISATION DES BIENS FONGIBLES · trois méthodes admises sur cinq, et
 * celle que la plupart des logiciels implémentent par défaut n'en fait pas
 * partie.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LE TEXTE, ET IL EST BEAUCOUP PLUS PRÉCIS QUE LE CHAPITRE DES COMPTES.
 *
 * Le chapitre 3 de la classe 3 abrège : « les biens interchangeables […] sont
 * évalués soit selon la technique du COÛT MOYEN PONDÉRÉ (C.M.P.), soit selon
 * la méthode du PREMIER ENTRÉ PREMIER SORTI (P.E.P.S.) ». Pris au mot, cela
 * autoriserait n'importe quel coût moyen.
 *
 * Le glossaire (AUDCIF, Titre VI, « VALORISATION DES BIENS FONGIBLES ») dit
 * autre chose, et c'est lui qui tranche. Il ÉNUMÈRE CINQ méthodes :
 *
 *  · coût moyen pondéré ANNUEL ;
 *  · coût moyen après chaque entrée (C.M.P.A.C.E.) ;
 *  · coût moyen de PÉRIODE DE STOCKAGE ;
 *  · premier entré, premier sorti (P.E.P.S.) ;
 *  · dernier entré, premier sorti (D.E.P.S.).
 *
 * puis : « Parmi ces cinq méthodes, le SYSTÈME COMPTABLE OHADA EN ACCEPTE
 * TROIS ; celle qui est retenue doit être MENTIONNÉE DANS LES NOTES ANNEXES :
 * P.E.P.S. ; C.M.P.A.C.E. ; C.M.P. de période de stockage. »
 *
 * Et il apparie les méthodes au mode de tenue : « Cette dernière méthode est
 * compatible avec la pratique de l'inventaire INTERMITTENT, alors que les deux
 * autres reposent sur celle de l'inventaire PERMANENT. »
 * ────────────────────────────────────────────────────────────────────────
 *
 * CE QUE LA LECTURE A ÉVITÉ. Le « coût moyen pondéré » allait être codé comme
 * une seule méthode, dans sa forme la plus répandue · la moyenne de la période.
 * Or le COÛT MOYEN PONDÉRÉ ANNUEL figure parmi les cinq et PAS parmi les trois
 * admises. Le coder aurait donné un stock final plausible, une balance qui
 * boucle, et une méthode que le référentiel n'accepte pas · sans qu'aucun test
 * ne puisse le dire, puisque l'arithmétique en est juste.
 *
 * DEUX MÉTHODES SONT NOMMÉMENT REFUSÉES, et elles ne sont pas dans
 * l'énumération de ce fichier : le D.E.P.S. (L.I.F.O.), exclu des trois
 * admises, et le N.I.F.O. ou coût de remplacement, que le même paragraphe
 * déclare « INACCEPTABLES en comptabilité générale, car elles n'assurent pas le
 * raccordement entre les valeurs des sorties et celles des entrées ». Un test
 * gèle la liste à trois valeurs.
 *
 * CE QUE CE MODULE NE FAIT PAS ENCORE, et le dit. Le C.M.P. DE PÉRIODE DE
 * STOCKAGE n'est pas implémenté. Sa définition tient en une phrase et elle
 * suppose une donnée que le module ne tient pas : « on calcule la DATE
 * D'ENTRÉE MOYENNE du stock existant en fin d'exercice, on en déduit le coût
 * unitaire moyen d'entrée à cette date ». Il faudrait l'historique des entrées
 * d'un dossier qui, par construction, tient un inventaire INTERMITTENT et n'en
 * saisit aucune. Inventer une pondération produirait un chiffre plausible et
 * hors du texte · c'est la lacune, elle est nommée, elle n'est pas comblée.
 */

/**
 * LES TROIS MÉTHODES ADMISES, et rien d'autre.
 *
 * L'ordre est celui du glossaire. Un quatrième membre ajouté ici ferait tomber
 * `valorisation-stocks.spec.ts`, qui relit cette liste et exige qu'elle porte
 * exactement les trois noms du texte.
 */
export const METHODES_ADMISES = ['PEPS', 'CMPACE', 'CMP_PERIODE_STOCKAGE'] as const;
export type MethodeValorisation = (typeof METHODES_ADMISES)[number];

/** Les deux méthodes qui « reposent sur la pratique de l'inventaire PERMANENT ». */
export const METHODES_INVENTAIRE_PERMANENT: MethodeValorisation[] = ['PEPS', 'CMPACE'];

/** La seule que le texte dit « compatible avec la pratique de l'inventaire INTERMITTENT ». */
export const METHODES_INVENTAIRE_INTERMITTENT: MethodeValorisation[] = ['CMP_PERIODE_STOCKAGE'];

/** Un mouvement de magasin, avant valorisation. */
export interface MouvementAValoriser {
  /** Repère stable dans l'ordre de saisie · départage deux mouvements du même jour. */
  ordre: number;
  date: string;
  sens: 'ENTREE' | 'SORTIE';
  quantite: number;
  /**
   * Coût TOTAL de l'entrée · prix d'achat, droits de douane et taxes non
   * récupérables, transport, manutention, rabais et remises DÉDUITS
   * (AUDCIF Titre VII ch. 3, « Coût des stocks »).
   *
   * NULL SUR UNE SORTIE, ET C'EST TOUT LE PROPOS. La valeur d'une sortie se
   * CALCULE ; la saisir à la main défait le raccordement que le glossaire
   * exige entre les valeurs sorties et les valeurs entrées.
   */
  cout: number | null;
}

export interface MouvementValorise extends MouvementAValoriser {
  /** Valeur retenue pour ce mouvement · saisie à l'entrée, calculée à la sortie. */
  valeur: number;
  /** État du magasin APRÈS ce mouvement. */
  quantiteApres: number;
  valeurApres: number;
}

export type MotifRefusValorisation =
  | 'METHODE_SANS_MOUVEMENTS'
  | 'ENTREE_SANS_COUT'
  | 'ENTREE_COUT_NEGATIF'
  | 'SORTIE_AVEC_COUT_IMPOSE'
  | 'QUANTITE_NON_POSITIVE'
  | 'SORTIE_SUPERIEURE_AU_STOCK'
  | 'METHODE_NON_IMPLEMENTEE';

export interface RefusValorisation {
  ordre: number | null;
  motif: MotifRefusValorisation;
  explication: string;
}

export interface Valorisation {
  methode: MethodeValorisation;
  mouvements: MouvementValorise[];
  quantiteFinale: number;
  valeurFinale: number;
  /** Total des valeurs entrées et sorties · l'axiome du glossaire se vérifie dessus. */
  totalEntrees: number;
  totalSorties: number;
  refus: RefusValorisation[];
}

/** Une couche d'entrée non encore consommée · la mémoire du P.E.P.S. */
interface Couche {
  quantite: number;
  coutUnitaire: number;
}

/**
 * Valorise une suite de mouvements de magasin.
 *
 * LE PREMIER REFUS EST LE PLUS IMPORTANT · une sortie ne porte JAMAIS son coût.
 * Le glossaire fonde les trois méthodes sur « un correct RACCORDEMENT des
 * sorties aux entrées », et pose l'axiome qui en découle : « l'axiomatique
 * comptable impose une égalité systématique, dans tout compte, des sorties et
 * des entrées en valeurs, dès lors que toutes les unités entrées sont
 * sorties ». Une sortie chiffrée à la main rompt ce raccordement, et le stock
 * final cesse d'être la différence de ce qui est entré et de ce qui est sorti.
 *
 * NE LÈVE JAMAIS · un mouvement impossible est écarté avec son motif, et les
 * autres sont valorisés. Le magasin s'arrête là où il devient faux, pas avant.
 */
export function valoriser(
  mouvementsBruts: MouvementAValoriser[],
  methode: MethodeValorisation,
): Valorisation {
  const refus: RefusValorisation[] = [];

  if (methode === 'CMP_PERIODE_STOCKAGE') {
    return {
      methode,
      mouvements: [],
      quantiteFinale: 0,
      valeurFinale: 0,
      totalEntrees: 0,
      totalSorties: 0,
      refus: [
        {
          ordre: null,
          motif: 'METHODE_NON_IMPLEMENTEE',
          explication:
            "Le coût moyen de PÉRIODE DE STOCKAGE n'est pas calculé par OmegaX. Le glossaire le " +
            "définit ainsi : « on calcule la DATE D'ENTRÉE MOYENNE du stock existant en fin " +
            "d'exercice, on en déduit le coût unitaire moyen d'entrée à cette date ». Il faudrait " +
            "l'historique des entrées d'un dossier qui, tenant un inventaire intermittent, n'en " +
            'saisit aucune. Inventer une pondération rendrait un chiffre plausible et hors du ' +
            'texte. Cette méthode se calcule hors du logiciel, et sa mention en Notes annexes ' +
            'reste due.',
        },
      ],
    };
  }

  // L'ORDRE CHRONOLOGIQUE EST LA MATIÈRE MÊME DES DEUX MÉTHODES. Le P.E.P.S.
  // sort « au prix d'entrée des articles LES PLUS ANCIENS » et le C.M.P.A.C.E.
  // valorise « au coût moyen du stock détenu À LA DATE DE CETTE SORTIE » : lus
  // dans l'ordre de saisie plutôt que dans l'ordre des dates, les deux rendent
  // un autre chiffre. Le tri est STABLE sur `ordre`, ce qui départage deux
  // mouvements du même jour sans en inverser aucun.
  const mouvements = [...mouvementsBruts].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.ordre - b.ordre,
  );

  const couches: Couche[] = [];
  let quantite = 0;
  let valeur = 0;
  let totalEntrees = 0;
  let totalSorties = 0;
  const valorises: MouvementValorise[] = [];

  for (const m of mouvements) {
    if (!(m.quantite > 0)) {
      refus.push({
        ordre: m.ordre,
        motif: 'QUANTITE_NON_POSITIVE',
        explication:
          'Un mouvement de magasin porte une quantité strictement positive · son SENS dit déjà ' +
          "s'il entre ou s'il sort. Une quantité négative inverserait le sens sans le dire.",
      });
      continue;
    }

    if (m.sens === 'ENTREE') {
      if (m.cout === null) {
        refus.push({
          ordre: m.ordre,
          motif: 'ENTREE_SANS_COUT',
          explication:
            "Une entrée en magasin porte son COÛT D'ACQUISITION ou son coût de production · " +
            "c'est lui qui alimente la valeur du stock, et rien d'autre ne peut le fournir.",
        });
        continue;
      }
      if (m.cout < 0) {
        refus.push({
          ordre: m.ordre,
          motif: 'ENTREE_COUT_NEGATIF',
          explication:
            "Le coût d'une entrée ne peut pas être négatif. Les rabais, remises et ristournes se " +
            "DÉDUISENT du coût d'acquisition (AUDCIF Titre VII ch. 3) · ils ne se saisissent pas " +
            'comme une entrée de signe inverse.',
        });
        continue;
      }
      couches.push({ quantite: m.quantite, coutUnitaire: m.cout / m.quantite });
      quantite += m.quantite;
      valeur += m.cout;
      totalEntrees += m.cout;
      valorises.push({ ...m, valeur: m.cout, quantiteApres: quantite, valeurApres: valeur });
      continue;
    }

    // SORTIE.
    if (m.cout !== null) {
      refus.push({
        ordre: m.ordre,
        motif: 'SORTIE_AVEC_COUT_IMPOSE',
        explication:
          "La valeur d'une sortie se CALCULE, elle ne se saisit pas. Les trois méthodes admises " +
          'reposent sur « un correct raccordement des sorties aux entrées » (AUDCIF Titre VI, ' +
          'Valorisation des biens fongibles) · un coût imposé à la main rompt ce raccordement, et ' +
          "le stock cesse d'être la différence de ce qui est entré et de ce qui est sorti.",
      });
      continue;
    }
    if (m.quantite > quantite) {
      refus.push({
        ordre: m.ordre,
        motif: 'SORTIE_SUPERIEURE_AU_STOCK',
        explication:
          `Cette sortie porte sur ${m.quantite} unités alors que le magasin n'en détient que ` +
          `${quantite} à cette date. Un stock est un ACTIF : il ne descend pas sous zéro. La ` +
          "sortie est antérieure à une entrée non saisie, ou la quantité est fausse.",
      });
      continue;
    }

    let sortie: number;
    if (m.quantite === quantite) {
      // LE MAGASIN SE VIDE · on sort la valeur RESTANTE, exactement.
      //
      // C'est ce qui rend vrai l'axiome du glossaire au centime près :
      // « égalité systématique des sorties et des entrées en valeurs, dès lors
      // que toutes les unités entrées sont sorties ». Recalculer une dernière
      // fois quantité × coût moyen laisserait un résidu d'arrondi au magasin,
      // c'est-à-dire un stock de valeur non nulle sur une quantité nulle.
      sortie = valeur;
      couches.length = 0;
    } else if (methode === 'PEPS') {
      // « Chaque article est supposé sortir au prix d'entrée des articles LES
      // PLUS ANCIENS » · on consomme les couches dans leur ordre d'arrivée.
      let reste = m.quantite;
      sortie = 0;
      while (reste > 0) {
        const couche = couches[0];
        const prise = Math.min(reste, couche.quantite);
        sortie += prise * couche.coutUnitaire;
        couche.quantite -= prise;
        reste -= prise;
        if (couche.quantite === 0) couches.shift();
      }
    } else {
      // C.M.P.A.C.E. · « chaque sortie est valorisée au coût moyen du stock
      // détenu à la date de cette sortie ».
      sortie = (valeur / quantite) * m.quantite;
      const restant = quantite - m.quantite;
      const coutMoyen = (valeur - sortie) / restant;
      couches.length = 0;
      couches.push({ quantite: restant, coutUnitaire: coutMoyen });
    }

    quantite -= m.quantite;
    valeur -= sortie;
    totalSorties += sortie;
    valorises.push({ ...m, valeur: sortie, quantiteApres: quantite, valeurApres: valeur });
  }

  return {
    methode,
    mouvements: valorises,
    quantiteFinale: quantite,
    valeurFinale: valeur,
    totalEntrees,
    totalSorties,
    refus,
  };
}

/**
 * La méthode de valorisation est-elle compatible avec le mode de tenue ?
 *
 * Le glossaire les apparie explicitement, et l'incompatibilité n'est pas
 * théorique : le P.E.P.S. et le C.M.P.A.C.E. valorisent CHAQUE SORTIE, ce
 * qu'un inventaire intermittent ne connaît pas ; le coût moyen de période de
 * stockage valorise le STOCK FINAL, ce qui ne dit rien des sorties d'un
 * inventaire permanent.
 */
export function methodeCompatible(
  methode: MethodeValorisation,
  inventaire: 'PERMANENT' | 'INTERMITTENT',
): boolean {
  return inventaire === 'PERMANENT'
    ? METHODES_INVENTAIRE_PERMANENT.includes(methode)
    : METHODES_INVENTAIRE_INTERMITTENT.includes(methode);
}
