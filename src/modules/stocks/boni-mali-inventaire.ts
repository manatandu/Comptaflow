import { Referentiel } from '@prisma/client';
import { motifHorsVariation, variationDuCompte } from './nomenclature-stocks';
import { valoriser, type MethodeValorisation, type MouvementAValoriser } from './valorisation-stocks';

/**
 * LE BONI ET LE MALI D'INVENTAIRE · un écart de QUANTITÉ, qui se comptabilise,
 * et qu'il ne faut jamais confondre avec l'excédent de VALEUR que l'art. 43
 * interdit d'inscrire.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LES DEUX TEXTES LE NOMMENT, ET ILS DÉSIGNENT LA CONTREPARTIE.
 *
 * AUDCIF, Titre VII, COMPTE 603 · « Ce compte enregistre les variations de
 * stocks […] en retraçant les opérations relatives aux entrées en stocks, aux
 * sorties de stocks, et aux DIFFÉRENCES CONSTATÉES ENTRE L'INVENTAIRE
 * COMPTABLE PERMANENT ET L'INVENTAIRE PHYSIQUE. » Puis, au fonctionnement,
 * « en cas d'inventaire permanent » : « À la clôture, DÉBITÉ des différences
 * en MOINS constatées entre l'inventaire comptable et l'inventaire physique,
 * par le crédit des stocks concernés. À la clôture, CRÉDITÉ des différences en
 * PLUS […], par le débit des comptes de stocks concernés. »
 *
 * SYCEBNL, Partie 2 ch. 3, fiches des comptes 31, 32, 33 et 36, et fiche du
 * compte 603 · le texte emploie les mots eux-mêmes. « En cas d'existence d'un
 * BONI D'INVENTAIRE à la clôture de l'exercice : est débité le compte 31 […]
 * après inventaire physique, pour régularisation du stock […] des différences
 * constatées en plus, PAR RAPPORT À L'INVENTAIRE PERMANENT ; par le crédit du
 * compte 6031. » Et symétriquement pour le MALI D'INVENTAIRE.
 * ────────────────────────────────────────────────────────────────────────
 *
 * TROIS CONSÉQUENCES, ET CHACUNE EST UN REFUS DE CE FICHIER.
 *
 * 1 · IL N'Y A DE BONI NI DE MALI QU'EN INVENTAIRE PERMANENT. Les deux textes
 * bornent la règle dans la même phrase · « par rapport à l'inventaire
 * permanent », « entre l'inventaire comptable PERMANENT et l'inventaire
 * physique ». En inventaire intermittent il n'existe AUCUN inventaire
 * comptable à confronter : le comptage EST le stock final, et il entre par
 * l'écriture de variation de `variation-stocks.ts`. Servir un boni là
 * compterait deux fois la même chose, sur une écriture équilibrée.
 *
 * 2 · L'ART. 43 NE S'OPPOSE PAS AU BONI, ET C'EST LA DISTINCTION CENTRALE.
 * L'article dit que « si la valeur d'inventaire est SUPÉRIEURE à la valeur
 * d'entrée, cette dernière est MAINTENUE dans les comptes » · il oppose deux
 * VALEURS du MÊME bien et interdit d'inscrire une plus-value latente. Un boni
 * d'inventaire est autre chose : des UNITÉS existent que les livres n'avaient
 * pas. Les porter à leur coût d'entrée n'inscrit aucune plus-value, cela
 * corrige un compte. Le dépôt avait déjà tranché la même distinction sur la
 * caisse le 06/09 ; elle vaut ici, avec cette différence qu'ici les textes
 * disent quoi faire, alors qu'aucune source lue ne le dit pour un écart de
 * caisse.
 *
 * 3 · LA CONTREPARTIE N'EST PAS LIBRE. C'est le compte de VARIATION du compte
 * de stock, dans le référentiel du dossier · 6031 à 6034 ou 73x selon le plan,
 * et `nomenclature-stocks.ts` en est la seule source. Porter un mali en charge
 * diverse laisserait la ligne « Variation des stocks » du compte de résultat
 * fausse du montant de l'écart, sur une écriture parfaitement équilibrée.
 */

export type SensDifferenceInventaire = 'BONI' | 'MALI';

export type MotifRefusBoniMali =
  | 'INVENTAIRE_INTERMITTENT'
  | 'QUANTITE_PHYSIQUE_ABSENTE'
  | 'MAGASIN_NON_VALORISABLE'
  | 'HORS_VARIATION_AUTOMATIQUE'
  | 'PAS_UN_COMPTE_DE_STOCK'
  | 'COUT_DU_BONI_NON_FOURNI';

export interface ArticleAConfronter {
  articleId: string;
  code: string;
  designation: string;
  uniteMesure: string;
  /** Numéro du compte de stock, tel que le plan du référentiel l'ouvre. */
  compteNumero: string;
  compteIntitule: string;
  methode: MethodeValorisation;
  /** Les mouvements du magasin, dans l'ordre de saisie. */
  mouvements: MouvementAValoriser[];
  /**
   * La quantité RÉELLEMENT COMPTÉE. `null` veut dire « pas encore compté », et
   * ce n'est PAS zéro · lue comme zéro, elle transformerait un article non
   * inventorié en mali total, à la charge de l'entité.
   */
  quantitePhysique: number | null;
  /**
   * Coût unitaire retenu pour un BONI, et sa source. Voir la note du § BONI
   * ci-dessous : il n'est demandé qu'en P.E.P.S., et seulement s'il y a un
   * boni.
   */
  coutUnitaireBoni?: number | null;
  sourceCoutBoni?: string | null;
}

export interface DifferenceInventaire {
  articleId: string;
  code: string;
  designation: string;
  uniteMesure: string;
  compteNumero: string;
  compteIntitule: string;
  methode: MethodeValorisation;
  sens: SensDifferenceInventaire;
  quantiteComptable: number;
  quantitePhysique: number;
  /** quantitePhysique moins quantiteComptable · positif = boni, négatif = mali. */
  ecartQuantite: number;
  coutUnitaireRetenu: number;
  /** Toujours POSITIF · le sens est porté par `sens`, jamais par un signe. */
  montant: number;
  /** Comment le coût unitaire a été obtenu · c'est ce que le réviseur demandera. */
  fondementDuCout: string;
  compteVariation: string;
  intituleVariation: string;
}

export interface ArticleSansDifference {
  articleId: string;
  code: string;
  quantite: number;
}

export interface RefusBoniMali {
  articleId: string | null;
  code: string | null;
  motif: MotifRefusBoniMali;
  explication: string;
}

export interface ConfrontationInventaire {
  differences: DifferenceInventaire[];
  sansDifference: ArticleSansDifference[];
  refus: RefusBoniMali[];
  totalBoni: number;
  totalMali: number;
}

/**
 * Confronte le magasin au comptage physique, article par article.
 *
 * NE LÈVE JAMAIS, ET UN REFUS N'EMPORTE JAMAIS LES AUTRES ARTICLES · un
 * magasin de quarante références dont une seule n'a pas été comptée doit
 * montrer les trente-neuf autres. Même parti que la proposition de variation.
 */
export function confronterInventaire(
  articles: ArticleAConfronter[],
  referentiel: Referentiel,
  modeInventaire: 'PERMANENT' | 'INTERMITTENT',
): ConfrontationInventaire {
  const differences: DifferenceInventaire[] = [];
  const sansDifference: ArticleSansDifference[] = [];
  const refus: RefusBoniMali[] = [];

  // LE PREMIER REFUS EST GLOBAL, ET IL EST DE DROIT. Les deux textes bornent
  // le boni et le mali à l'inventaire permanent, dans la phrase même qui les
  // pose. Le rendre par article laisserait croire que certains articles y
  // échappent, alors que c'est le MODE DE TENUE du dossier qui décide.
  if (modeInventaire === 'INTERMITTENT') {
    return {
      differences: [],
      sansDifference: [],
      refus: [
        {
          articleId: null,
          code: null,
          motif: 'INVENTAIRE_INTERMITTENT',
          explication:
            "Ce dossier tient un inventaire INTERMITTENT : il n'existe aucun inventaire comptable " +
            'permanent à confronter au comptage, et donc ni boni ni mali. Les deux textes bornent ' +
            "la règle dans la phrase qui la pose · « les différences constatées entre l'inventaire " +
            'comptable PERMANENT et l\'inventaire physique » (AUDCIF Titre VII, compte 603) et ' +
            '« par rapport à l\'inventaire permanent » (SYCEBNL Partie 2 ch. 3, comptes 31 à 36). ' +
            "Ici le comptage EST le stock final, et il entre par l'écriture de variation · le " +
            'porter deux fois gonflerait le stock du montant du comptage.',
        },
      ],
      totalBoni: 0,
      totalMali: 0,
    };
  }

  for (const a of articles) {
    const correspondance = variationDuCompte(a.compteNumero, referentiel);
    if (!correspondance) {
      const horsVariation = motifHorsVariation(a.compteNumero, referentiel);
      refus.push({
        articleId: a.articleId,
        code: a.code,
        motif: horsVariation ? 'HORS_VARIATION_AUTOMATIQUE' : 'PAS_UN_COMPTE_DE_STOCK',
        explication: horsVariation
          ? `Le compte ${a.compteNumero} est hors de la variation automatique · ${horsVariation.motif} ` +
            "L'écriture de régularisation se passe à la main."
          : `Le compte ${a.compteNumero} ne porte aucun compte de variation dans le plan ` +
            `${referentiel}. Un boni ou un mali d'inventaire a pour contrepartie le compte de ` +
            'variation du stock, et lui seul : sans lui, il n\'y a rien à proposer.',
      });
      continue;
    }

    if (a.quantitePhysique === null || a.quantitePhysique === undefined) {
      refus.push({
        articleId: a.articleId,
        code: a.code,
        motif: 'QUANTITE_PHYSIQUE_ABSENTE',
        explication:
          `L'article ${a.code} n'a pas été compté. « Pas encore compté » n'est PAS zéro · lu ` +
          "comme zéro, il produirait un mali égal à tout le stock de l'article, mis à la charge " +
          "de l'entité, sur une écriture parfaitement équilibrée.",
      });
      continue;
    }

    const valorisation = valoriser(a.mouvements, a.methode);
    if (valorisation.refus.length > 0) {
      refus.push({
        articleId: a.articleId,
        code: a.code,
        motif: 'MAGASIN_NON_VALORISABLE',
        explication:
          `La fiche de l'article ${a.code} ne se valorise pas · ` +
          valorisation.refus.map((r) => r.explication).join(' ') +
          " Tant qu'elle ne se valorise pas, l'écart avec le comptage ne se chiffre pas : le " +
          'chiffrer sur une fiche incomplète produirait un montant plausible et faux.',
      });
      continue;
    }

    const quantiteComptable = valorisation.quantiteFinale;
    const ecart = arrondir(a.quantitePhysique - quantiteComptable, 3);
    if (ecart === 0) {
      sansDifference.push({ articleId: a.articleId, code: a.code, quantite: quantiteComptable });
      continue;
    }

    const sens: SensDifferenceInventaire = ecart > 0 ? 'BONI' : 'MALI';
    const cout = coutUnitaireDeLaDifference(a, valorisation, sens);
    if (cout === null) {
      refus.push({
        articleId: a.articleId,
        code: a.code,
        motif: 'COUT_DU_BONI_NON_FOURNI',
        explication:
          `L'article ${a.code} présente un BONI de ${ecart} ${a.uniteMesure} et il est suivi en ` +
          "P.E.P.S. Aucune source lue ne dit à quelle COUCHE rattacher des unités que les livres " +
          "n'avaient pas : le P.E.P.S. règle l'ordre des SORTIES, il ne dit rien de l'entrée d'un " +
          'boni. Le coût unitaire est donc demandé, avec sa source · c\'est elle que le réviseur ' +
          'demandera. En C.M.P.A.C.E., la question ne se pose pas : le magasin ne détient qu\'une ' +
          'seule valeur unitaire à cette date, et le module la retient.',
      });
      continue;
    }

    differences.push({
      articleId: a.articleId,
      code: a.code,
      designation: a.designation,
      uniteMesure: a.uniteMesure,
      compteNumero: a.compteNumero,
      compteIntitule: a.compteIntitule,
      methode: a.methode,
      sens,
      quantiteComptable,
      quantitePhysique: a.quantitePhysique,
      ecartQuantite: ecart,
      coutUnitaireRetenu: cout.coutUnitaire,
      montant: arrondir(Math.abs(ecart) * cout.coutUnitaire, 2),
      fondementDuCout: cout.fondement,
      compteVariation: correspondance.variation,
      intituleVariation: correspondance.intituleVariation,
    });
  }

  return {
    differences,
    sansDifference,
    refus,
    totalBoni: arrondir(
      differences.filter((d) => d.sens === 'BONI').reduce((s, d) => s + d.montant, 0),
      2,
    ),
    totalMali: arrondir(
      differences.filter((d) => d.sens === 'MALI').reduce((s, d) => s + d.montant, 0),
      2,
    ),
  };
}

/**
 * LE COÛT UNITAIRE DE LA DIFFÉRENCE, ET POURQUOI LES DEUX SENS NE SE TRAITENT
 * PAS PAREIL.
 *
 * UN MALI EST UNE SORTIE. Des unités que les livres portaient ne sont plus là :
 * elles sortent, et une sortie se valorise PAR LA MÉTHODE. Le module les fait
 * donc sortir par le moteur, en rejouant la fiche avec un mouvement de sortie
 * de plus · en P.E.P.S. elles consomment les couches les plus anciennes, en
 * C.M.P.A.C.E. elles prennent le coût moyen en vigueur. Rien n'est inventé,
 * c'est la méthode qui répond.
 *
 * UN BONI EST UNE ENTRÉE, ET LÀ LES DEUX MÉTHODES NE RÉPONDENT PAS PAREIL.
 * En C.M.P.A.C.E., le magasin ne détient à cette date qu'UNE SEULE valeur
 * unitaire · le coût moyen en vigueur. Le boni la prend, et ce n'est pas un
 * choix de l'éditeur : c'est l'arithmétique de la méthode. En P.E.P.S., le
 * magasin détient plusieurs couches à des coûts différents, et AUCUNE SOURCE
 * LUE ne dit à laquelle rattacher des unités dont les livres ignoraient
 * l'existence · le P.E.P.S. règle l'ordre des sorties, pas l'entrée d'un boni.
 * Retenir « la couche la plus récente » serait plausible et inventé. Le coût
 * est donc RÉCLAMÉ, avec sa source, comme le stock final d'une variation ou le
 * relevé d'unités d'œuvre.
 */
function coutUnitaireDeLaDifference(
  a: ArticleAConfronter,
  valorisation: ReturnType<typeof valoriser>,
  sens: SensDifferenceInventaire,
): { coutUnitaire: number; fondement: string } | null {
  if (sens === 'MALI') {
    const ecart = arrondir(valorisation.quantiteFinale - (a.quantitePhysique ?? 0), 3);
    const ordreSuivant = Math.max(0, ...a.mouvements.map((m) => m.ordre)) + 1;
    const rejoue = valoriser(
      [
        ...a.mouvements,
        {
          ordre: ordreSuivant,
          // La sortie du mali est POSTÉRIEURE à tout le reste · c'est la
          // clôture qui la constate. Une date antérieure la ferait consommer
          // des couches qui n'étaient pas encore entrées.
          date: '9999-12-31',
          sens: 'SORTIE' as const,
          quantite: ecart,
          cout: null,
        },
      ],
      a.methode,
    );
    const sortie = rejoue.mouvements.find((m) => m.ordre === ordreSuivant);
    if (!sortie || rejoue.refus.length > 0) return null;
    return {
      coutUnitaire: arrondir(sortie.valeur / ecart, 6),
      fondement:
        a.methode === 'PEPS'
          ? "Sortie valorisée en P.E.P.S. · les unités manquantes consomment les couches les plus anciennes encore en stock, comme toute sortie."
          : "Sortie valorisée au coût moyen pondéré en vigueur à la date de l'inventaire.",
    };
  }

  if (a.methode === 'CMPACE') {
    if (!(valorisation.quantiteFinale > 0)) {
      // Magasin vide en C.M.P.A.C.E. · il n'y a aucun coût moyen en vigueur,
      // et le boni est alors dans la même situation que sous P.E.P.S.
      return coutFourni(a);
    }
    return {
      coutUnitaire: arrondir(valorisation.valeurFinale / valorisation.quantiteFinale, 6),
      fondement:
        "Coût moyen pondéré en vigueur à la date de l'inventaire · en C.M.P.A.C.E. le magasin ne détient qu'une seule valeur unitaire, et c'est la méthode qui la fixe, non l'éditeur.",
    };
  }

  return coutFourni(a);
}

function coutFourni(a: ArticleAConfronter): { coutUnitaire: number; fondement: string } | null {
  if (
    a.coutUnitaireBoni === null ||
    a.coutUnitaireBoni === undefined ||
    !(a.coutUnitaireBoni > 0) ||
    !a.sourceCoutBoni
  ) {
    return null;
  }
  return {
    coutUnitaire: a.coutUnitaireBoni,
    fondement: `Coût unitaire déclaré par le cabinet · ${a.sourceCoutBoni}.`,
  };
}

export interface LigneRegularisation {
  compte: string;
  intitule: string;
  libelle: string;
  sens: 'DEBIT' | 'CREDIT';
  montant: number;
}

/**
 * L'écriture de régularisation, dans le sens que les textes écrivent.
 *
 * BONI · débit du compte de stock, crédit du compte de variation.
 * MALI · débit du compte de variation, crédit du compte de stock.
 *
 * SERVIR L'UN POUR L'AUTRE S'ÉQUILIBRE ET SE VOIT NULLE PART · la balance
 * boucle, le stock bouge dans le mauvais sens et la ligne « Variation des
 * stocks » du compte de résultat est fausse de DEUX FOIS le montant de
 * l'écart. Un test tombe si le sens d'un des deux change.
 */
export function lignesDeLaRegularisation(
  differences: DifferenceInventaire[],
): LigneRegularisation[] {
  const lignes: LigneRegularisation[] = [];
  for (const d of differences) {
    const libelle = `${d.sens === 'BONI' ? "Boni" : 'Mali'} d'inventaire · ${d.code} ${d.designation}`;
    lignes.push({
      compte: d.compteNumero,
      intitule: d.compteIntitule,
      libelle,
      sens: d.sens === 'BONI' ? 'DEBIT' : 'CREDIT',
      montant: d.montant,
    });
    lignes.push({
      compte: d.compteVariation,
      intitule: d.intituleVariation,
      libelle,
      sens: d.sens === 'BONI' ? 'CREDIT' : 'DEBIT',
      montant: d.montant,
    });
  }
  return lignes;
}

function arrondir(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}
