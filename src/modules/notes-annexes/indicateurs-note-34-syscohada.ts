/**
 * NOTE 34 DU SYSTÈME NORMAL SYSCOHADA · FICHE DE SYNTHÈSE DES PRINCIPAUX
 * INDICATEURS FINANCIERS (AUDCIF Titre IX ch. 6), calculée (passe R2, B3).
 *
 * La note était transcrite en saisie · une quarantaine de lignes à reporter à
 * la main depuis le bilan, le compte de résultat et le tableau des flux de la
 * même liasse, sans rien qui signale un chiffre ressaisi qui divergerait
 * d'eux. Or « les éléments d'information chiffrés des Notes annexes sont
 * établis selon les mêmes principes et dans les mêmes conditions que ceux du
 * Bilan et du Compte de résultat » (ch. 6 § 1.1). C'est le motif qui a fait
 * calculer la note 33 SYCEBNL, et il vaut ici tel quel.
 *
 * AUCUNE FORMULE N'EST ÉCRITE ICI · la fiche est évaluée terme à terme depuis
 * `FICHE_SYNTHESE_SYSCOHADA`, qui porte déjà ses choix, chacun motivé
 * (anomalie n° 10) : « Dettes financières* » = DA + DB, la variation de
 * trésorerie selon le modèle du TFT (+ ZC), la ligne hors maquette de la
 * CAFG. Une seconde écriture des formules divergerait de la table au premier
 * correctif.
 *
 * TROIS LECTURES D'OMEGAX, dites dans la note (`PRECISION_NOTE_34`) :
 *  - la ligne HORS MAQUETTE « autres charges HAO » est RETENUE dans la CAFG,
 *    qui égale alors le poste FA du tableau des flux · le terme porte son
 *    marqueur, et la rubrique le dit ;
 *  - le renvoi (b) n'est pas appliqué · le bilan présente les écarts de
 *    conversion en postes autonomes (BU, DV) sans dire à quelles créances ou
 *    dettes ils se rapportent. Ils restent hors des agrégats, et l'écart
 *    qu'ils créent se lit sur la ligne CONTRÔLE, avec celui de DC que la
 *    table annonce déjà (même parti que la note 33 SYCEBNL) ;
 *  - la RENTABILITÉ ÉCONOMIQUE reste en saisie · le renvoi (a) la veut
 *    « après impôt théorique sur le bénéfice », taux qu'aucun état ne porte.
 *    La calculer avant impôt publierait un autre ratio sous son nom.
 *
 * Les montants sont rendus EN MILLIERS, comme la maquette l'annonce en tête
 * (« EN MILLIERS DE FRANCS »), sans arrondi · les sous-totaux et le contrôle
 * continuent de boucler. Un ratio est rendu en pourcentage, sans échelle.
 * Une ligne précédée de « – » est rendue NÉGATIVE, comme la table signe son
 * terme · la colonne s'additionne alors telle qu'elle s'imprime.
 *
 * `null` n'est jamais zéro · un poste que l'état laisse vide (tableau des
 * flux sans exercice antérieur, colonne N-1 absente), un dénominateur nul, et
 * tout sous-total qui en dépend.
 */
import { LigneBalancePourEtat, correspond } from '../etats-financiers/etats-financiers.communs';
import {
  FICHE_SYNTHESE_SYSCOHADA,
  LigneFicheSynthese,
  TermeFicheSynthese,
} from '../etats-financiers-syscohada/correspondance-notes-syscohada-3';
import { POSTES_CHARGES_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';
import { TOTAUX_FLUX_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-tft-syscohada';
import { MILLIERS_DE_FRANCS, UniteIndicateur } from './indicateurs-note-33';

/** Rubriques de la note 34 que le logiciel ne calcule pas · voir l'en-tête. */
export const INDICATEURS_NOTE_34_LAISSES_EN_SAISIE = ['rentabilite-economique'];

/** Ce que la note dit d'elle-même, au lecteur de la liasse. */
export const PRECISION_NOTE_34 =
  'Calculée depuis le bilan, le compte de résultat et le tableau des flux de la liasse. La ligne « autres ' +
  'charges HAO », absente de la maquette, est retenue dans la CAFG, qui égale alors le poste FA du tableau des ' +
  'flux. Le renvoi (b) n’est pas appliqué, le bilan ne rattachant les écarts de conversion (BU, DV) à aucune ' +
  'créance ni dette · leur écart se lit sur la ligne CONTRÔLE. La rentabilité économique reste à saisir : ' +
  'l’impôt théorique du renvoi (a) n’est porté par aucun état.';

interface PosteLu {
  ref?: string;
  montant?: number;
  montantN1?: number;
}

export interface EtatsSyscohadaPourNote34 {
  bilan: { actif: PosteLu[]; passif: PosteLu[] };
  compteDeResultat: { lignes: PosteLu[] };
  fluxTresorerie: {
    lignes: Array<PosteLu | { section: string }>;
    exerciceN1Disponible: boolean;
    postesNonCalculables: Array<{ ref: string }>;
  };
}

export interface IndicateurNote34 {
  cle: string;
  unite: UniteIndicateur;
  valeurN: number | null;
  valeurN1: number | null;
}

const REFS_CHARGES = new Set(POSTES_CHARGES_SYSCOHADA.map((p) => p.ref));

/**
 * Les postes du tableau des flux laissés VIDES en colonne N · un poste qui
 * exige l'exercice antérieur quand le dossier n'en a pas, et tout total qui
 * en dépend. Le service des états ne les publie pas en tant que tels ; il
 * les chiffre à 0 et nomme les premiers (`postesNonCalculables`) · les
 * reprendre à 0 ferait publier une CAFG ou une variation de trésorerie
 * fausse. Avec un exercice antérieur, aucun poste n'est laissé vide
 * (`resoudreFluxPourExercice`).
 */
function fluxVidesEnN(flux: EtatsSyscohadaPourNote34['fluxTresorerie']): Set<string> {
  const vides = new Set<string>();
  if (flux.exerciceN1Disponible) return vides;
  for (const p of flux.postesNonCalculables) vides.add(p.ref);
  for (const total of TOTAUX_FLUX_SYSCOHADA) {
    if (total.deRefs.some((r) => vides.has(r))) vides.add(total.ref);
  }
  return vides;
}

/**
 * Les indicateurs de la note 34, dans l'ordre de la table, rubriques laissées
 * en saisie exclues.
 */
export function indicateursNote34Syscohada(
  etats: EtatsSyscohadaPourNote34,
  lignesN: LigneBalancePourEtat[],
  lignesN1: LigneBalancePourEtat[],
  exerciceN1Disponible: boolean,
): IndicateurNote34[] {
  const parRef = (postes: PosteLu[]) => new Map(postes.filter((p) => p.ref).map((p) => [p.ref!, p]));
  const bilan = parRef([...etats.bilan.actif, ...etats.bilan.passif]);
  const cr = parRef(etats.compteDeResultat.lignes);
  const flux = parRef(etats.fluxTresorerie.lignes.filter((l): l is PosteLu => !('section' in l)));
  const videsN = fluxVidesEnN(etats.fluxTresorerie);

  const pourUnExercice = (colonne: 'N' | 'N1') => {
    const lire = (p: PosteLu | undefined): number | null => {
      if (!p) return null;
      const v = colonne === 'N' ? p.montant : p.montantN1;
      return v === undefined || v === null ? null : v;
    };
    const lignes = colonne === 'N' ? lignesN : lignesN1;
    const valeurs = new Map<string, number | null>();

    const terme = (t: TermeFicheSynthese): number | null => {
      let v: number | null;
      switch (t.source) {
        case 'COMPTE_RESULTAT': {
          const brut = lire(cr.get(t.ref));
          // Le modèle du ch. 4 porte les charges (R*) en négatif · la table
          // les prend en valeur ABSOLUE, son `signe` disant s'ils s'ajoutent
          // ou se retranchent. Les produits (T*) et les soldes (X*) restent
          // tels que l'état les présente, une perte restant une perte.
          v = brut === null ? null : REFS_CHARGES.has(t.ref) ? -brut : brut;
          break;
        }
        case 'BILAN':
          v = lire(bilan.get(t.ref));
          break;
        case 'FLUX_TRESORERIE':
          v = colonne === 'N' && videsN.has(t.ref) ? null : lire(flux.get(t.ref));
          break;
        case 'COMPTE': {
          if (colonne === 'N1' && !exerciceN1Disponible) {
            v = null;
            break;
          }
          // Même lecture que la CAFG de la note 33 (`cessionsDeLExercice`) ·
          // total débit moins total crédit pour un compte débiteur par nature,
          // l'inverse pour un compte créditeur.
          v = lignes
            .filter((l) => correspond(l.numero, [t.ref]))
            .reduce(
              (s, l) => s + (t.solde === 'CREDITEUR' ? l.totalCredit - l.totalDebit : l.totalDebit - l.totalCredit),
              0,
            );
          break;
        }
        case 'LIGNE':
          v = valeurs.get(t.ref) ?? null;
          break;
      }
      return v === null ? null : t.signe * v;
    };
    const somme = (termes: TermeFicheSynthese[]): number | null => {
      let s = 0;
      for (const t of termes) {
        const v = terme(t);
        if (v === null) return null;
        s += v;
      }
      return s;
    };

    for (const l of FICHE_SYNTHESE_SYSCOHADA) {
      if (INDICATEURS_NOTE_34_LAISSES_EN_SAISIE.includes(l.cle)) continue;
      if (l.ratio) {
        const num = somme(l.ratio.numerateur);
        const den = somme(l.ratio.denominateur);
        valeurs.set(l.cle, num === null || den === null || Math.abs(den) < 0.005 ? null : (num / den) * 100);
      } else {
        valeurs.set(l.cle, somme(l.termes ?? []));
      }
    }
    return valeurs;
  };

  const n = pourUnExercice('N');
  const n1 = exerciceN1Disponible ? pourUnExercice('N1') : null;
  const unite = (l: LigneFicheSynthese): UniteIndicateur => (l.ratio ? 'POURCENT' : 'MONTANT');

  return FICHE_SYNTHESE_SYSCOHADA.filter((l) => !INDICATEURS_NOTE_34_LAISSES_EN_SAISIE.includes(l.cle)).map((l) => {
    const u = unite(l);
    const echelle = u === 'POURCENT' ? 1 : MILLIERS_DE_FRANCS;
    const aLEchelle = (v: number | null | undefined) => (v === null || v === undefined ? null : v / echelle);
    return { cle: l.cle, unite: u, valeurN: aLEchelle(n.get(l.cle)), valeurN1: n1 ? aLEchelle(n1.get(l.cle)) : null };
  });
}
