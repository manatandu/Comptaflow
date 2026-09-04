import type { NotesSmt } from './types';

/**
 * LA PART NON DATÉE DE LA NOTE 3 DU S.M.T · ce que la ventilation ne sait pas
 * ranger, et la phrase qui le dit.
 *
 * La maquette officielle n'intitule pas cette note « état des créances et des
 * dettes » : elle l'intitule « ETAT DES CREANCES ET DES DETTES NON ECHUES »
 * (SYCEBNL, Partie 4, ch. 4, section 3, NOTE 3). Le service ventile donc
 * chaque solde en trois : la part NON ÉCHUE (échéance postérieure à la
 * clôture), la part ÉCHUE (échéance atteinte), et le RESTE.
 *
 * CE RESTE N'EST PAS UNE TROISIÈME CATÉGORIE DE CRÉANCE. Il n'est mesuré par
 * rien : il est défini comme le solde moins les deux parts datées, ce qui lui
 * interdit de mentir sur le total mais lui interdit aussi de signifier
 * quoi que ce soit d'autre qu'une LACUNE DE TENUE. Une ligne sans date
 * d'échéance y tombe, un report à-nouveau passé en mode SOLDE aussi, et il
 * peut être NÉGATIF · un règlement non lettré en face d'une facture datée le
 * rend négatif, et c'est alors le lettrage qui manque, pas l'échéance.
 *
 * POURQUOI CETTE PHRASE COMPTE PLUS QUE LE RESTE DE LA NOTE · aucun dossier
 * existant ne saisit les échéances, donc la totalité du solde tombe
 * aujourd'hui dans ce reste sur TOUS les dossiers. C'est la première chose
 * que le comptable lira. L'art. 15, al. 3 de l'Acte uniforme SYCEBNL veut que
 * les Notes annexes comportent « tous les éléments à caractère significatif
 * qui ne sont pas mis en évidence dans les autres états financiers et sont
 * susceptibles d'influencer le jugement que les utilisateurs des documents
 * peuvent porter sur le patrimoine, la situation financière et la performance
 * de l'entité » : une note qui s'annonce « non échues » sans pouvoir le
 * démontrer doit le dire, pas le taire.
 */
export interface LacuneEcheancesNote3 {
  /** Part non datée des créances · peut être négative, ce n'est pas un montant à additionner. */
  creances: number;
  /** Part non datée des dettes · même réserve. */
  dettes: number;
  /** Ce que le titre de la note ne peut pas encore tenir. */
  phrase: string;
  /** Le geste qui ferme la lacune, en une phrase. */
  geste: string;
  /**
   * Non null quand une des deux parts est négative · la lacune n'est alors
   * plus une échéance manquante mais un LETTRAGE manquant, et le geste
   * demandé n'est pas le même.
   */
  resteNegatif: string | null;
}

/** Sous ce seuil, un solde n'est pas négatif mais nul · même seuil que le service. */
const CENTIME = 0.005;

/**
 * Rend la lacune à afficher, ou `null` quand la ventilation est complète ·
 * un dossier dont toutes les échéances sont saisies ne voit RIEN de plus
 * qu'avant.
 */
export function lacuneEcheancesNote3(note3: NotesSmt['note3']): LacuneEcheancesNote3 | null {
  // LE VERDICT VIENT DU SERVEUR, ET DE LUI SEUL · lui a vu ligne à ligne.
  // Le recalculer ici depuis les deux totaux poserait une SECONDE règle pour
  // une même question, et c'est ainsi que l'écran finit par dire autre chose
  // que le classeur exporté sans qu'aucun test ne s'en aperçoive.
  if (note3.echeancesTenues) return null;
  return {
    creances: note3.totalCreancesNonVentilees,
    dettes: note3.totalDettesNonVentilees,
    phrase:
      'Cette note s’intitule « état des créances et des dettes NON ÉCHUES », et elle ne peut pas encore le ' +
      'démontrer : faute de date d’échéance, les montants ci-dessous ne sont ni échus ni non échus. Ils restent ' +
      'au bilan, entiers et justes · ce qui manque n’est pas un montant, c’est leur terme.',
    geste:
      'Porter la date d’échéance sur les lignes de tiers, et tenir ces comptes en report à-nouveau mode DÉTAIL ' +
      '(le mode SOLDE reporte une ligne unique, qui ne peut porter aucune échéance). La ventilation se remplit ' +
      'alors d’elle-même, sans ressaisie.',
    resteNegatif:
      note3.totalCreancesNonVentilees < -CENTIME || note3.totalDettesNonVentilees < -CENTIME
        ? 'Une part non datée NÉGATIVE ne se lit pas comme un montant dû : elle signale un règlement resté non ' +
          'lettré en face d’une facture datée. Lettrer d’abord · l’échéance ne réglera pas celle-là.'
        : null,
  };
}
