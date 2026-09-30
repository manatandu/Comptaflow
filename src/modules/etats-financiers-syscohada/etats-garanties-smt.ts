import { FormeJuridiqueSyscohada } from '@prisma/client';
import { FORMES_SOCIETES_COMMERCIALES } from '../tenant/mentions-societe';

/**
 * LES DEUX ÉTATS DES GARANTIES QU'UN ACTE UNIFORME AJOUTE AU SYSTÈME MINIMAL
 * DE TRÉSORERIE (passes O1a, C7 et O6, B3).
 *
 * Le Titre X de l'AUDCIF ferme les notes du SMT aux NOTES 1 à 3 (matériel,
 * mobilier et cautions VERSÉES du 275 ; stocks ; créances et dettes) et au
 * journal de trésorerie. Aucune ne porte les garanties DONNÉES ni les
 * sûretés CONSENTIES · la « caution » de la NOTE 1 est un actif, celle-ci un
 * engagement : même mot, deux objets.
 *
 * Or deux Actes uniformes, qui s'appliquent à raison de la FORME et non du
 * système comptable, les exigent :
 *  - AUSCGIE art. 139 (Partie 1, commune à toute société commerciale) ·
 *    « Figurent dans l'état annexé inclus dans les états financiers de
 *    synthèse : 1°) un état des cautionnements, avals et garanties donnés
 *    par la société ; 2°) un état des sûretés réelles consenties par la
 *    société. » ;
 *  - AUSCOOP art. 109 (Partie 1, toute société coopérative) · « Figurent dans
 *    les états financiers de synthèse : - un état des cautionnements, avals
 *    et autres garanties personnelles données par la société coopérative ;
 *    - un état des sûretés réelles consenties par la société coopérative. »
 *
 * Les deux Actes s'ajoutent au Titre X sans le contredire · ce n'est pas une
 * transposition. OmegaX ne sait pas encore les SAISIR au SMT (le moteur des
 * notes en saisie ne sert que les jeux du Système normal et du SYCEBNL) · il
 * NOMME donc leur absence sur l'écran des notes, pour qu'un dossier ne sorte
 * pas ses états sans eux en croyant l'annexe complète. Aucune autre forme
 * n'est visée · le GIE, l'entreprise individuelle, l'entreprenant, la
 * succursale et l'entité publique ne relèvent d'aucun des deux articles.
 */
export interface EtatsDesGarantiesDus {
  /** L'article qui les exige, tel qu'il se cite. */
  article: string;
  /** Les deux états, dans l'ordre et les mots de l'article. */
  etats: [string, string];
}

export function etatsDesGarantiesDus(forme: FormeJuridiqueSyscohada | null | undefined): EtatsDesGarantiesDus | null {
  if (!forme) return null;
  if (FORMES_SOCIETES_COMMERCIALES.includes(forme)) {
    return {
      article: 'AUSCGIE art. 139',
      etats: [
        'État des cautionnements, avals et garanties donnés par la société',
        'État des sûretés réelles consenties par la société',
      ],
    };
  }
  if (forme === FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE) {
    return {
      article: 'AUSCOOP art. 109',
      etats: [
        'État des cautionnements, avals et autres garanties personnelles données par la société coopérative',
        'État des sûretés réelles consenties par la société coopérative',
      ],
    };
  }
  return null;
}
