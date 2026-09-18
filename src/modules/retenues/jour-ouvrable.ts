/**
 * REPORT D'UNE ÉCHÉANCE FISCALE TOMBANT UN JOUR NON OUVRABLE.
 *
 * Loi n° 004/2003 portant réforme des procédures fiscales, Livre II, Titre VI,
 * chapitre unique, art. 110 bis, alinéa 2 (créé par la L.F. n° 21/029 du
 * 31 décembre 2021), VERBATIM :
 *
 *   « Si le dernier jour du délai prescrit par la législation fiscale pour
 *   l'exécution d'une obligation ou l'exercice d'un droit est un jour non
 *   ouvrable, la date de l'exécution d'une obligation ou l'exercice d'un droit
 *   est reportée au premier jour ouvrable qui suit. »
 *
 * POURQUOI CE FICHIER EXISTE · le registre des retenues calculait ses échéances
 * en dates calendaires brutes et en tirait un « en retard » catégorique, en
 * rouge, plus un avertissement de non-déductibilité au titre de l'art. 20. Le
 * 15 février 2026 est un DIMANCHE : le redevable est dans les délais toute la
 * journée du lundi 16, et OmegaX lui écrivait « 1 mois en retard » dès le 16.
 * C'est le § 10 bis de CLAUDE.md dans sa forme la plus coûteuse · un contrôle
 * qui FABRIQUE une anomalie, que le cabinet corrige, et dont personne ne saura
 * jamais qu'elle n'existait pas. Le cas n'est pas rare : en 2026, l'échéance du
 * 15 tombe un dimanche en février, mars et novembre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA DÉFINITION VIENT DU CODE DU TRAVAIL, ET C'EST UNE TRANSPOSITION DÉCLARÉE.
 *
 * La législation fiscale emploie « jour ouvrable » sans jamais le définir · ni
 * l'art. 110 bis, ni aucun article du Livre II lu à la passe F10. La seule
 * définition congolaise lue est celle du Code du travail, art. 7, 9° :
 *
 *   « Jour ouvrable : chaque jour de la semaine à l'exception du jour de repos
 *   hebdomadaire et des jours fériés légaux. »
 *
 * Elle est reprise ici FAUTE DE DÉFINITION FISCALE, et le dire importe : c'est
 * un emprunt à un autre corpus, pas une règle de droit fiscal. Un texte fiscal
 * qui définirait le terme autrement primerait celui-ci.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE SAMEDI · CORRIGÉ LE 2026-09-18, ET C'EST UNE ERREUR DE TRANSPOSITION.
 *
 * Ce fichier a d'abord posé, EN CAPITALES et comme « la décision qui compte le
 * plus ici », que le samedi était OUVRABLE. Le raisonnement était : le Code du
 * travail ne donne qu'un jour de repos hebdomadaire, le dimanche (art. 121,
 * al. 2), donc six jours ouvrables par semaine, ce que confirme la base de
 * 26 jours par mois du décompte final.
 *
 * LE RAISONNEMENT ÉTAIT JUSTE ET LA SOURCE ÉTAIT LA MAUVAISE. Le Code du
 * travail régit les rapports entre EMPLOYEURS ET TRAVAILLEURS. L'obligation que
 * l'art. 110 bis fait tomber à une date, elle, s'exécute DEVANT
 * L'ADMINISTRATION · on dépose une déclaration et on verse à un guichet. Et les
 * jours d'ouverture de ce guichet sont fixés ailleurs :
 *
 *   DÉCRET N° 24/09 DU 17 FÉVRIER 2024 portant règlement d'administration
 *   relatif à la discipline, art. 1er, VERBATIM : « L'horaire de travail dans
 *   les services publics est fixé comme suit : DU LUNDI AU VENDREDI, de
 *   8 heures à 17 heures, avec une pause de 12 heures 30 à 13 heures. »
 *
 * Les services publics ne travaillent donc pas le samedi, et un redevable dont
 * l'échéance y tombe ne peut ni déclarer ni payer. C'est exactement le cas que
 * l'art. 110 bis, alinéa 2 règle. LE SAMEDI EST NON OUVRABLE pour une échéance
 * fiscale, à compter du 17 février 2024 (art. 51 du même décret, « entre en
 * vigueur à la date de sa signature »).
 *
 * CE QUE L'ERREUR COÛTAIT · le 25 juillet 2026, première échéance d'acompte sur
 * l'impôt des sociétés, est un SAMEDI. Le logiciel l'opposait telle quelle.
 *
 * DEUX RÉSERVES, écrites plutôt que tues. (1) Le décret n° 24/09 fixe un
 * HORAIRE DE TRAVAIL des agents, il ne définit pas le « jour ouvrable » de la
 * loi fiscale · c'est une transposition, mieux fondée que la première pour ce
 * qui se fait devant un guichet, mais une transposition. (2) Son art. 2,
 * alinéa 3 permet à un ministre de fixer « des horaires de prestation
 * spécifiques » pour les services spéciaux relevant de son autorité · une
 * administration fiscale ouverte le samedi par cette voie ne serait pas connue
 * du logiciel.
 *
 * AVANT LE 17 FÉVRIER 2024, le samedi reste tenu pour ouvrable ici · le texte
 * qui réglait alors l'horaire des services publics n'est pas au corpus, et le
 * décret abroge l'ordonnance n° 81-067 du 7 mai 1981 sans en reprendre le
 * contenu. Même discipline que pour les jours fériés ci-dessous.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LES JOURS FÉRIÉS SONT CALCULÉS DEPUIS LE 2026-09-18 · la liste a été fournie.
 *
 * Ce fichier a porté pendant un jour la phrase « ce décret n'est dans aucune
 * source lue », et elle était vraie de ce que le dépôt détenait alors. Manasse
 * a fourni le texte le 2026-09-18 : **ORDONNANCE N° 23-042 DU 30 MARS 2023**
 * fixant la liste des jours fériés légaux en République démocratique du Congo
 * (J.O. RDC, 15 mai 2023), prise sur le fondement de l'art. 123 du Code du
 * travail et abrogeant l'ordonnance 14-010 du 14 mai 2014.
 *
 * Son art. 1er ferme la liste · « La liste des jours fériés en République
 * démocratique du Congo est fixée comme suit », puis DIX dates, toutes FIXES.
 * AUCUNE FÊTE MOBILE n'y figure · ni Pâques, ni l'Ascension, ni aucune fête
 * musulmane. Ne pas en ajouter « par évidence » : la liste est limitative, et
 * un jour de plus reporterait une échéance que la loi ne reporte pas.
 *
 * LA LISTE EST BORNÉE AU 30 MARS 2023, et cette borne n'est pas une précaution.
 * Art. 4 : l'ordonnance « sort ses effets à la date de sa signature ». Avant
 * cette date s'appliquait l'ordonnance 14-010 du 14 mai 2014, QUI N'EST PAS AU
 * CORPUS et dont la liste peut différer. Une échéance antérieure au 30 mars
 * 2023 ne se voit donc appliquer QUE le dimanche · c'est le deuxième piège du
 * dépôt (un texte daté se borne à son entrée en vigueur), et le registre des
 * retenues calcule bel et bien des échéances d'exercices anciens.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'ARTICLE 2 JOUE EN SENS INVERSE DE L'ART. 110 BIS, ET IL N'EST PAS CALCULÉ.
 *
 * Art. 2, VERBATIM : « Dans le cas où l'un des jours fériés légaux visés à
 * l'article 1er coïncide avec un DIMANCHE, le congé relatif à ce jour est pris
 * LE JOUR PRÉCÉDENT. » Le congé recule ; l'art. 110 bis, alinéa 2, lui, fait
 * AVANCER l'échéance. Les deux textes bougent une date dans des directions
 * opposées, et rien ne les articule.
 *
 * DEUX LECTURES, ET LE CODE NE TRANCHE PAS. Ou bien seul le CONGÉ se déplace et
 * le samedi reste un jour ouvrable au sens de l'art. 7, 9° du Code du travail,
 * qui n'excepte que « le jour de repos hebdomadaire et les JOURS FÉRIÉS
 * LÉGAUX » · or le jour férié légal reste la date de l'art. 1er, pas le samedi.
 * Ou bien le samedi devient le jour du congé et cesse d'être ouvrable.
 *
 * LE CODE RETIENT LA PREMIÈRE, et le motif est celui qui gouverne tout ce
 * fichier : rendre un samedi non ouvrable REPORTERAIT une échéance que la loi
 * ne reporte peut-être pas, c'est-à-dire dirait au redevable qu'il a plus de
 * temps qu'il n'en a. Sur un doute, on ne se trompe pas dans ce sens-là. La
 * réserve est écrite plutôt que tue.
 *
 * LE CAS N'EST PAS THÉORIQUE et il est même cocasse en 2027 : le 17 janvier
 * (Lumumba) tombe un dimanche, et le « jour précédent » où le congé serait pris
 * est le 16 janvier, QUI EST DÉJÀ FÉRIÉ (Laurent Désiré Kabila). L'ordonnance
 * ne dit pas ce qu'il advient alors.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUATRE ANOMALIES DU TEXTE SOURCE, signalées et non corrigées.
 *
 * (1) L'art. 123 du Code du travail annonce un DÉCRET du Président ; l'acte
 * pris est une ORDONNANCE. (2) L'art. 3 est syntaxiquement fautif · « Sont
 * abrogées toutes l'ordonnance 14-010 [...] ainsi que toutes les dispositions
 * antérieures contraires ». (3) Le même article écrit « jours fériés légaus ».
 * (4) Des espaces manquent dans la source (« le25décembre », « dui8 février
 * 2006 », « mai2023 ») · artefacts d'extraction, sans incidence sur le sens.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ET LE REPORT N'EST PAS INCONDITIONNEL · l'alinéa 3 joue en sens inverse.
 *
 * Art. 110 bis, alinéa 3 : « Par dérogation aux dispositions de l'alinéa
 * précédent, l'Administration des Impôts peut, en matière de déclaration et de
 * paiement des impôts, fixer l'échéance déclarative et de paiement au jour
 * ouvrable PRÉCÉDANT la date de l'échéance légale. » L'Administration peut donc
 * ANTICIPER. Cet acte n'est dans aucune comptabilité et OmegaX ne peut pas le
 * connaître : il est nommé dans la réserve, jamais calculé.
 */

/** Dimanche et samedi, au sens de `Date.prototype.getDay()`. */
const DIMANCHE = 0;
const SAMEDI = 6;

/**
 * Entrée en vigueur du décret n° 24/09, art. 51 · « entre en vigueur à la date
 * de sa signature », le 17 février 2024. C'est lui qui ferme le samedi dans les
 * services publics. Avant, le texte applicable n'est pas au corpus.
 */
const ENTREE_EN_VIGUEUR_DECRET_24_09 = new Date(2024, 1, 17);

/**
 * Entrée en vigueur de l'ordonnance n° 23-042, art. 4 · « sort ses effets à la
 * date de sa signature », le 30 mars 2023. Avant, l'ordonnance 14-010 du
 * 14 mai 2014 s'appliquait et n'est pas au corpus.
 */
const ENTREE_EN_VIGUEUR_ORDONNANCE_23_042 = new Date(2023, 2, 30);

/**
 * LES DIX JOURS FÉRIÉS LÉGAUX, art. 1er de l'ordonnance n° 23-042 du 30 mars
 * 2023, dans l'ordre du texte. Le mois est en base 1, comme le texte l'écrit.
 *
 * La liste est LIMITATIVE (« est fixée comme suit ») et ne porte que des dates
 * FIXES · aucune fête mobile. Ne pas en ajouter.
 */
export const JOURS_FERIES: ReadonlyArray<{ mois: number; jour: number; nom: string }> = [
  { mois: 1, jour: 1, nom: 'Nouvel an' },
  { mois: 1, jour: 4, nom: "Journée des Martyrs de l'indépendance" },
  { mois: 1, jour: 16, nom: 'Journée du héros national Laurent Désiré Kabila' },
  { mois: 1, jour: 17, nom: 'Journée du héros national Patrice Emery Lumumba' },
  { mois: 4, jour: 6, nom: 'Journée du combat de Simon Kimbangu et de la conscience africaine' },
  { mois: 5, jour: 1, nom: 'Fête du travail' },
  { mois: 5, jour: 17, nom: 'Journée des Forces armées' },
  { mois: 6, jour: 30, nom: "Journée de l'indépendance" },
  { mois: 8, jour: 1, nom: 'Fête des parents' },
  { mois: 12, jour: 25, nom: 'Noël' },
];

/**
 * La date est-elle un jour férié légal opposable ?
 *
 * Rend le NOM du jour férié, ou `null`. Le nom sert à l'affichage : une
 * échéance déplacée doit pouvoir dire par quoi.
 *
 * Une date ANTÉRIEURE au 30 mars 2023 rend toujours `null` · voir l'en-tête,
 * la liste d'avant n'est pas au corpus et la deviner serait l'inventer.
 */
export function jourFerie(date: Date): string | null {
  if (date.getTime() < ENTREE_EN_VIGUEUR_ORDONNANCE_23_042.getTime()) return null;
  const trouve = JOURS_FERIES.find((f) => f.mois === date.getMonth() + 1 && f.jour === date.getDate());
  return trouve ? trouve.nom : null;
}

/**
 * Un jour est-il ouvrable pour l'exécution d'une obligation fiscale ?
 *
 * TROIS EXCLUSIONS, chacune sa source et sa borne :
 * - le DIMANCHE, jour de repos hebdomadaire · Code du travail, art. 121,
 *   alinéa 2, et art. 7, 9°. De tout temps ;
 * - le SAMEDI, jour où les services publics ne travaillent pas · décret
 *   n° 24/09, art. 1er, à compter du 17 février 2024 ;
 * - les DIX JOURS FÉRIÉS LÉGAUX · ordonnance n° 23-042, art. 1er, à compter du
 *   30 mars 2023.
 *
 * Les bornes ne sont pas une coquetterie : le registre des retenues calcule des
 * échéances d'exercices anciens, et leur appliquer un texte postérieur est le
 * deuxième piège du dépôt.
 */
export function estJourOuvrable(date: Date): boolean {
  if (date.getDay() === DIMANCHE) return false;
  if (date.getDay() === SAMEDI && date.getTime() >= ENTREE_EN_VIGUEUR_DECRET_24_09.getTime()) return false;
  return jourFerie(date) === null;
}

/**
 * Reporte une échéance au premier jour ouvrable qui suit, art. 110 bis, al. 2.
 *
 * La date d'entrée n'est JAMAIS modifiée en place · les appelants gardent des
 * échéances calculées ailleurs, et muter l'objet reçu ferait dériver un tableau
 * entier à la première lecture.
 */
export function reporterAuJourOuvrable(echeance: Date): Date {
  const reportee = new Date(echeance.getTime());
  while (!estJourOuvrable(reportee)) {
    reportee.setDate(reportee.getDate() + 1);
  }
  return reportee;
}

/**
 * L'échéance a-t-elle été déplacée par le report ? Sert à l'affichage · une
 * date reportée doit pouvoir dire POURQUOI elle ne tombe pas le 15.
 */
export function echeanceReportee(echeanceLegale: Date): boolean {
  return !estJourOuvrable(echeanceLegale);
}

/**
 * Réserve rendue avec tout état qui oppose une échéance au redevable.
 *
 * Elle porte les deux moitiés que le logiciel ne calcule pas · les jours fériés
 * faute de décret, et la faculté d'anticipation de l'Administration. Sans elle,
 * une échéance affichée passerait pour certaine dans les deux sens.
 */
export const RESERVE_JOUR_OUVRABLE =
  "REPORT DES ÉCHÉANCES · art. 110 bis, alinéa 2 de la loi de procédures fiscales : une échéance tombant un jour " +
  'non ouvrable est reportée au premier jour ouvrable qui suit. Cet état applique le report sur TROIS exclusions, ' +
  'chacune avec sa source et sa date. Le DIMANCHE, jour de repos hebdomadaire (Code du travail, art. 121, ' +
  'alinéa 2), de tout temps. Le SAMEDI, parce que les services publics travaillent « du lundi au vendredi » ' +
  '(décret n° 24/09 du 17 février 2024, art. 1er) et que la déclaration comme le paiement se font devant eux · ' +
  'à compter du 17 février 2024. Et les DIX JOURS FÉRIÉS LÉGAUX de l\u2019article 1er de l\u2019ordonnance ' +
  'n° 23-042 du 30 mars 2023 (1er, 4, 16 et 17 janvier, 6 avril, 1er et 17 mai, 30 juin, 1er août, 25 décembre) · ' +
  "à compter du 30 mars 2023. QUATRE RÉSERVES. (1) La législation fiscale ne définit pas le « jour ouvrable » : " +
  'ces trois règles lui sont EMPRUNTÉES au droit du travail et au droit de la fonction publique. (2) Avant leurs ' +
  "dates d'effet, les textes antérieurs (ordonnance 14-010 du 14 mai 2014 pour les fériés, ordonnance 81-067 du " +
  "7 mai 1981 pour la discipline) ne sont pas au corpus du logiciel · une échéance plus ancienne ne porte que le " +
  'report du dimanche. (3) L\u2019article 2 de l\u2019ordonnance n° 23-042 dispose que le congé d\u2019un jour ' +
  "férié tombant un dimanche « est pris le jour précédent » · il fait RECULER un congé quand l'article 110 bis " +
  "fait AVANCER une échéance, et rien n'articule les deux. Le logiciel ne s'en sert pas et le dit. (4) Un " +
  "ministre peut fixer « des horaires de prestation spécifiques » pour les services spéciaux de son autorité " +
  "(décret n° 24/09, art. 2, alinéa 3), et l'Administration peut fixer l'échéance au jour ouvrable PRÉCÉDANT " +
  "l'échéance légale (art. 110 bis, alinéa 3) · deux actes qu'aucune comptabilité ne porte.";
