/**
 * LES SEPT RETENUES AUTORISÉES · ARTICLE 112 DU CODE DU TRAVAIL,
 * ET LA RÉPONSE À LA COTISATION SYNDICALE.
 *
 * Ce fichier ne calcule rien. Il porte une LISTE FERMÉE et la conséquence
 * pénale de son dépassement, parce que ce dépassement ne se voit pas sur un
 * bulletin : une ligne de retenue illicite a exactement l'aspect d'une ligne
 * de retenue licite.
 *
 * ARTICLE 112, VERBATIM :
 *   « Est nulle de plein droit, toute stipulation attribuant à l'employeur le
 *   droit d'infliger des réductions de rémunérations à titre de
 *   dommages-intérêts. TOUTEFOIS, LES RETENUES CI-APRÈS SONT AUTORISÉES :
 *   a) retenues fiscales : taxe professionnelle ; b) cotisation due à
 *   l'Institut National de Sécurité Sociale ; c) retenues à titre d'avances ;
 *   d) retenues à titre d'indemnités compensatoires en cas de violation par
 *   le travailleur de l'obligation qui lui est faite par l'article 52 ;
 *   e) retenues en vue de constituer un cautionnement […] ; f) retenues à
 *   titre de prêt ; g) saisie-arrêt. »
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA COTISATION SYNDICALE · LA QUESTION A ÉTÉ MAL POSÉE PENDANT SIX PASSES.
 *
 * Le journal de ce dépôt la formulait ainsi, de P0 à P6 : « l'article 112
 * ferme la liste sans nommer la cotisation syndicale, donc on ne sait pas ».
 * C'ÉTAIT LIRE UN SEUL ARTICLE. Le Code répond, mais au Titre XII.
 *
 * ARTICLE 279 · toute convention collective « COMPORTE OBLIGATOIREMENT […]
 * les modalités de perception et de versement PAR LES TRAVAILLEURS des
 * cotisations syndicales à l'organisation professionnelle intéressée ».
 *
 * LE SUJET DU VERBE EST LE TRAVAILLEUR, PAS L'EMPLOYEUR. Ce n'est pas un
 * détail de rédaction : cinq sources indépendantes donnent la même phrase
 * (Journal officiel, Codes Larcier tome IV, Code annoté 2016, et deux
 * supports d'enseignement), et l'une d'elles rapporte qu'un état ANTÉRIEUR du
 * droit congolais mettait la perception à la charge DES EMPLOYEURS. Le
 * changement de sujet est donc un choix du législateur de 2002, pas une
 * maladresse.
 *
 * POURQUOI UNE CONVENTION COLLECTIVE NE PEUT PAS RÉTABLIR LA RETENUE.
 * L'article 274 permet à la convention d'être plus favorable au travailleur
 * « MAIS [elle] NE PEUT DÉROGER AUX DISPOSITIONS D'ORDRE PUBLIC ». Or
 * l'article 112 en est une, et deux indices le prouvent plutôt qu'un :
 *  · son alinéa 1er frappe de NULLITÉ DE PLEIN DROIT ;
 *  · il est PÉNALEMENT SANCTIONNÉ · l'article 321 le vise, et l'article
 *    328 b) le range parmi ceux dont « l'amende est appliquée AUTANT DE FOIS
 *    QU'IL Y A DES TRAVAILLEURS CONCERNÉS par l'infraction ».
 * L'article 279, lui, n'est dans AUCUNE des deux listes pénales. Une mention
 * obligatoire de convention collective ne crée donc pas une retenue que la
 * loi n'autorise pas.
 *
 * CE QUI RESTE OUVERT, ET C'EST UNE VOIE, PAS UNE RETENUE · L'ARTICLE 114.
 * Il régit « la CESSION » de la rémunération autant que la saisie, et une
 * cession est un acte DU TRAVAILLEUR, pas une retenue de l'employeur. Un
 * travailleur qui cède une fraction de sa rémunération à son syndicat, dans
 * la limite de la quotité cessible, fait quelque chose que l'article 114
 * prévoit expressément ; l'employeur qui paie le cessionnaire EXÉCUTE une
 * cession, il ne pratique pas une retenue de l'article 112.
 *
 * C'EST UNE LECTURE D'ÉDITEUR, ET ELLE EST DÉCLARÉE COMME TELLE. Aucune
 * source lue ne l'énonce en ces termes. Elle a deux conséquences qu'un
 * cabinet doit connaître avant de s'en servir : la cession CONSOMME LA
 * QUOTITÉ CESSIBLE, donc elle entre en concurrence avec les créanciers du
 * travailleur ; et elle suppose un ÉCRIT DU TRAVAILLEUR, révocable, jamais
 * une clause de convention collective qui vaudrait pour tous.
 * ────────────────────────────────────────────────────────────────────────
 *
 * DEUX LITTERAE DE L'ARTICLE 112 SONT DATÉES, ET ON LES LIT DÉJÀ PAR
 * ÉQUIVALENCE. Le litera a) dit « taxe professionnelle », un impôt abrogé
 * bien avant l'IRPP de la loi n° 23/053 ; le litera b) dit « Institut
 * National de Sécurité Sociale », devenu la CNSS par le décret n° 18/027 du
 * 14 juillet 2018. Personne n'en conclut que la retenue fiscale ou la
 * quote-part ouvrière seraient devenues illicites. MAIS CETTE SOUPLESSE A
 * UNE LIMITE · elle vaut pour un texte qui REMPLACE celui que la liste
 * nomme, jamais pour une retenue que la liste n'a jamais prévue.
 */

/** Les sept litterae, dans l'ordre du texte. */
export type LitteraArticle112 = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

export type RetenueAutorisee = {
  readonly littera: LitteraArticle112;
  /** Le libellé du Code, recopié. */
  readonly libelle: string;
  /** Ce que le litera désigne aujourd'hui, quand le mot a vieilli. */
  readonly equivalentActuel: string | null;
};

export const RETENUES_ARTICLE_112: readonly RetenueAutorisee[] = [
  {
    littera: 'a',
    libelle: 'retenues fiscales : taxe professionnelle',
    equivalentActuel:
      "l'impôt sur les rémunérations en vigueur, soit la retenue de l'article 119 de la loi n° 23/053 depuis le 1er janvier 2026",
  },
  {
    littera: 'b',
    libelle: "cotisation due à l'Institut National de Sécurité Sociale",
    equivalentActuel:
      "la quote-part ouvrière due à la CNSS, l'Institut ayant été remplacé par le décret n° 18/027 du 14 juillet 2018",
  },
  { littera: 'c', libelle: "retenues à titre d'avances", equivalentActuel: null },
  {
    littera: 'd',
    libelle:
      "retenues à titre d'indemnités compensatoires en cas de violation par le travailleur de l'obligation qui lui est faite par l'article 52",
    equivalentActuel: null,
  },
  {
    littera: 'e',
    libelle: "retenues en vue de constituer un cautionnement pour garantir l'exécution par le travailleur de l'obligation prévue à l'article 52",
    equivalentActuel: null,
  },
  { littera: 'f', libelle: 'retenues à titre de prêt', equivalentActuel: null },
  { littera: 'g', libelle: 'saisie-arrêt', equivalentActuel: null },
] as const;

export const SANCTION_ARTICLE_112 =
  "ARTICLE 112 · la liste est FERMÉE, et son dépassement est PÉNALEMENT SANCTIONNÉ. L'article 321 le vise " +
  "(amende n'excédant pas 20 000 Francs congolais constants) et l'article 328 b) le range parmi ceux dont " +
  "« l'amende est appliquée AUTANT DE FOIS QU'IL Y A DES TRAVAILLEURS CONCERNÉS par l'infraction ». Une " +
  "retenue illicite pratiquée sur cent bulletins est donc cent amendes, dans la limite de cinquante fois le taux.";

export const REPONSE_COTISATION_SYNDICALE =
  "LA COTISATION SYNDICALE NE SE RETIENT PAS SUR LA PAIE. L'article 279 impose à toute convention collective " +
  "de régler « les modalités de perception et de versement PAR LES TRAVAILLEURS des cotisations syndicales à " +
  "l'organisation professionnelle intéressée » · LE SUJET DU VERBE EST LE TRAVAILLEUR. Et une convention " +
  "collective ne peut pas y ajouter une retenue : l'article 274 lui interdit de déroger à l'ordre public, et " +
  "l'article 112 en est, puisqu'il frappe de nullité de plein droit ET qu'il est pénalement sanctionné par " +
  "travailleur concerné. L'article 279, lui, n'est dans aucune liste pénale.";

export const RESERVE_CESSION_SYNDICALE =
  "LA VOIE QUI RESTE EST UNE CESSION, PAS UNE RETENUE, ET C'EST UNE LECTURE D'ÉDITEUR. L'article 114 régit " +
  "« la CESSION » de la rémunération autant que la saisie. Une cession est un acte DU TRAVAILLEUR : celui qui " +
  "cède une fraction de sa rémunération à son syndicat, dans la limite de la quotité cessible, fait ce que " +
  "l'article 114 prévoit, et l'employeur qui paie le cessionnaire EXÉCUTE une cession au lieu de pratiquer " +
  "une retenue. AUCUNE SOURCE LUE NE L'ÉNONCE EN CES TERMES. Deux conséquences avant de s'en servir : la " +
  "cession CONSOMME LA QUOTITÉ CESSIBLE et entre donc en concurrence avec les créanciers du travailleur ; et " +
  "elle suppose un ÉCRIT DU TRAVAILLEUR, révocable, jamais une clause qui vaudrait pour tous.";

export const RESERVE_LITTERAE_DATEES =
  "DEUX LITTERAE SONT DATÉS ET SE LISENT PAR ÉQUIVALENCE · le a) nomme la « taxe professionnelle », abrogée, " +
  "et le b) l'« Institut National de Sécurité Sociale », devenu la CNSS en 2018. La souplesse vaut pour un " +
  "texte qui REMPLACE celui que la liste nomme · JAMAIS pour une retenue que la liste n'a jamais prévue.";

/**
 * Une retenue proposée est-elle dans la liste ? La fonction ne devine pas :
 * elle reçoit le litera revendiqué, et refuse l'absence de litera. C'est le
 * cabinet qui rattache, parce que le rattachement est un acte de
 * qualification, et parce qu'une retenue qu'on n'arrive pas à rattacher est
 * précisément celle qu'il ne faut pas pratiquer.
 */
export function retenueAutorisee(littera: string | null | undefined): {
  readonly autorisee: boolean;
  readonly retenue: RetenueAutorisee | null;
  readonly refus: string | null;
} {
  const trouvee = RETENUES_ARTICLE_112.find((r) => r.littera === littera) ?? null;
  if (!trouvee) {
    return {
      autorisee: false,
      retenue: null,
      refus:
        `Aucun litera de l'article 112 ne couvre cette retenue${littera ? ` (« ${littera} » proposé)` : ''}. ` +
        SANCTION_ARTICLE_112,
    };
  }
  return { autorisee: true, retenue: trouvee, refus: null };
}
