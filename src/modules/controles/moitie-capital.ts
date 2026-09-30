import { FormeJuridiqueSyscohada } from '@prisma/client';

/**
 * CAPITAUX PROPRES INFÉRIEURS À LA MOITIÉ DU CAPITAL SOCIAL (passes O1b-A4,
 * D1 et G3). Le fait se lit dans les livres, l'obligation qui suit a un
 * délai, et le dépôt n'en portait rien.
 *
 * TROIS FORMES, DEUX RÉGIMES, jamais l'un pour l'autre :
 *  · SARL, art. 371 à 373 · le GÉRANT ou le commissaire aux comptes CONSULTE
 *    les associés dans les quatre mois qui suivent l'approbation ;
 *    reconstitution dans les DEUX ANS qui suivent la clôture de l'exercice
 *    déficitaire, sinon réduction du capital, jamais sous le capital légal ;
 *    à défaut, dissolution judiciaire à la demande de tout intéressé ;
 *  · SA, art. 664 à 669 · le conseil d'administration ou l'administrateur
 *    général CONVOQUE l'AGE dans les quatre mois ; réduction au plus tard à la
 *    clôture du DEUXIÈME EXERCICE SUIVANT ; non applicable en redressement
 *    judiciaire ou liquidation des biens (art. 669) ;
 *  · SAS · l'art. 853-3 n'écarte que les art. 387 al. 1er, 414 à 561, 690 et
 *    751 à 753 · les art. 664 à 669 lui valent, la décision revenant
 *    collectivement aux associés (art. 853-11, al. 2).
 * L'art. 901 punit les dirigeants qui, sciemment, n'ont pas fait convoquer.
 *
 * LES DEUX GRANDEURS SONT CELLES QUE L'AUDCIF DÉFINIT POUR CETTE PROCÉDURE
 * (Titre VIII ch. 16, section 3). Capitaux propres · « capital nominal +
 * écarts de réévaluation + réserves + report à nouveau + résultat net de
 * l'exercice + subventions d'investissement + provisions réglementées », hors
 * autres fonds propres, « leur montant est celui qui figure au passif du
 * bilan (total capitaux propres), AUGMENTÉ DU CAPITAL NON APPELÉ ». C'est la
 * ligne CP du bilan (CA à CM), lue par la résolution du ch. 7 et jamais
 * recalculée, plus le 109 débiteur. Capital · « capital social nominal, qu'il
 * soit libéré ou non », soit le solde créditeur du 101.
 *
 * AUCUNE DATE N'EST CALCULÉE · les délais courent de l'approbation, que les
 * livres ne portent pas, et l'état de redressement judiciaire n'est pas au
 * dossier. Le contrôle informe, il ne constate aucun manquement.
 */
export interface VerdictMoitieCapital {
  capitauxPropres: number;
  capital: number;
  consequence: string;
  action: string;
}

export function verdictMoitieCapital(
  forme: FormeJuridiqueSyscohada | null,
  totalCapitauxPropresBilan: number,
  capitalNonAppele: number,
  capitalNominal: number,
): VerdictMoitieCapital | null {
  // Sans capital, la moitié ne se mesure pas.
  if (capitalNominal <= 0.005) return null;
  const regime =
    forme === FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE
      ? 'SARL'
      : forme === FormeJuridiqueSyscohada.SOCIETE_ANONYME
        ? 'SA'
        : forme === FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE
          ? 'SAS'
          : null;
  if (!regime) return null;
  const capitauxPropres = Math.round((totalCapitauxPropresBilan + Math.max(0, capitalNonAppele)) * 100) / 100;
  if (capitauxPropres >= capitalNominal / 2) return null;

  const lecture =
    'Capitaux propres au sens de l’AUDCIF, Titre VIII ch. 16, section 3 · total des capitaux propres du bilan ' +
    '(subventions d’investissement et provisions réglementées comprises), augmenté du capital non appelé.';
  if (regime === 'SARL') {
    return {
      capitauxPropres,
      capital: capitalNominal,
      consequence:
        'Les capitaux propres sont inférieurs à la moitié du capital social. Si c’est du fait des pertes constatées ' +
        'dans les états financiers de synthèse, le gérant ou, le cas échéant, le commissaire aux comptes doit, dans ' +
        'les quatre mois qui suivent l’approbation des comptes, consulter les associés sur la dissolution anticipée ' +
        '(AUSCGIE art. 371). Si elle est écartée, les capitaux propres se reconstituent dans les deux ans qui suivent ' +
        'la clôture de l’exercice déficitaire, sinon le capital se réduit, jamais sous le capital légal (art. 372) ; ' +
        'à défaut, tout intéressé peut demander la dissolution (art. 373). L’art. 901 punit les dirigeants. ' +
        lecture,
      action:
        'Préparez la consultation des associés · OmegaX ne connaît pas la date d’approbation et ne calcule aucun ' +
        'délai.',
    };
  }
  const organe =
    regime === 'SA'
      ? 'le conseil d’administration ou l’administrateur général, selon le cas, convoque l’assemblée générale ' +
        'extraordinaire'
      : 'les associés décident collectivement, dans les conditions des statuts (art. 853-11, al. 2, par le renvoi de ' +
        'l’art. 853-3)';
  return {
    capitauxPropres,
    capital: capitalNominal,
    consequence:
      'Les capitaux propres sont inférieurs à la moitié du capital social. Si c’est du fait des pertes constatées ' +
      `dans les états financiers de synthèse, ${organe} dans les quatre mois qui suivent l’approbation des comptes, ` +
      'pour décider de la dissolution anticipée (AUSCGIE art. 664). Si elle n’est pas prononcée, le capital se ' +
      'réduit au plus tard à la clôture du deuxième exercice suivant, faute de reconstitution (art. 665). Ces ' +
      'règles ne valent pas en redressement judiciaire ou en liquidation des biens (art. 669), état que le dossier ' +
      'ne porte pas. L’art. 901 punit les dirigeants. ' +
      lecture,
    action:
      'Préparez la décision sur la dissolution anticipée · OmegaX ne connaît pas la date d’approbation et ne ' +
      'calcule aucun délai.',
  };
}
