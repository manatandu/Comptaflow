import { GranulariteCloture, Referentiel } from '@prisma/client';
import { ajouterMois } from '../../common/ajouter-mois';
import { echeanceDepassee, jourUtc } from '../../common/echeance';

/**
 * LIGNE A13 · DEUX CONTRÔLES DE CLÔTURE (relevé CPCC C9 et C10, décision de
 * Manasse du 2026-10-02). Deux CONTRÔLES, jamais deux refus · ils signalent,
 * ils ne bloquent ni la saisie ni la clôture. Les règles vivent ici, pures ;
 * `ControlesService.analyser` ne fait que lire et appeler.
 *
 * ## Les textes, lus
 *
 * BANQUE · fiche du compte 52, mot pour mot aux DEUX plans (AUDCIF, Titre VII,
 * compte 52 ; SYCEBNL, Partie 2 ch. 3, compte 52) · « Le solde qui ressort
 * des livres comptables DOIT ÊTRE RAPPROCHÉ du solde du compte tenu par la
 * banque et envoyé périodiquement à l'entité. Les différences éventuelles
 * doivent être recherchées et faire l'objet d'écritures de redressement
 * lorsqu'elles n'ont pas pour origine un chevauchement de dates. » Éléments
 * de contrôle · « des relevés bancaires ; des états de rapprochement
 * bancaire ». Un « doit » · AVERTISSEMENT. La DATE vient de l'AUDCIF art. 42,
 * non exclu par l'art. 3 de l'Acte uniforme SYCEBNL · « À la clôture de
 * chaque exercice, l'entité doit procéder au recensement et à l'évaluation de
 * ses biens, créances et dettes à leur valeur effective du moment ». Le
 * DÉLAI vient de l'art. 23 · « Les états financiers annuels sont arrêtés au
 * plus tard dans les quatre mois qui suivent la date de clôture » · le
 * rapprochement est donc un état À RÉGLER AVANT L'ARRÊTÉ, jamais un retard,
 * et aucun texte ne fixe d'échéance plus courte.
 *
 * CLÔTURE INFORMATIQUE · AUDCIF art. 22, 3° · « la chronologie des
 * opérations écarte toute insertion intercalaire ou addition ultérieure ; une
 * procédure périodique dite « clôture informatique » au moins trimestrielle
 * est prévue, mise en œuvre au plus tard à la fin du trimestre qui suit la fin
 * de chaque période ». Le glossaire (Titre VI, « CLÔTURE INFORMATIQUE ») le
 * redit. L'art. 22 n'est PAS dans la liste d'exclusion de l'art. 3 de l'Acte
 * uniforme SYCEBNL (« à l'exception des articles 5, 8, 10 à 13, 17 alinéas 7
 * et 8, 18, 19 quatrième tiret, 21, 25 à 34, 49, 69, 70, 71, 73 à 113 ») ·
 * il vaut aux deux référentiels, par deux chemins que les messages nomment.
 * « est prévue, mise en œuvre au plus tard » · une obligation, AVERTISSEMENT.
 *
 * ## Les bornes (§ 10 bis, « le contrôle qui FABRIQUE une anomalie »)
 *
 * ENTRÉE EN VIGUEUR · AUDCIF art. 113, « pour les comptes personnels des
 * entités, au 1er janvier 2018 » ; Acte uniforme SYCEBNL art. 28, « applicable
 * à compter du 1er janvier 2024 » (la fiche du compte 52 du SYCEBNL est dans
 * le système qui lui est annexé, et l'art. 22 n'atteint une association que
 * par son art. 3). Un exercice ouvert avant ces dates n'est pas examiné ·
 * le texte qui le régissait n'est pas au corpus.
 *
 * BANQUE · le texte ne fixe AUCUNE date au relevé · « périodiquement ».
 * OmegaX ne réclame donc pas un relevé daté du jour de clôture, seulement que
 * la chaîne des rapprochements CLOS du compte atteigne ce jour (un relevé
 * daté au plus tôt de la clôture). La chaîne est continue (chaque
 * rapprochement part du solde du précédent clos), si bien qu'un clos daté
 * après la clôture a confronté à la banque tout ce qui la précède. Le geste
 * est toujours possible · un rapprochement s'ouvre sur un relevé de toute
 * date, et le pointage n'est pas figé par la clôture de l'exercice. Le
 * contrôle ne parle qu'au LENDEMAIN de la clôture (avant, aucun relevé ne
 * peut la couvrir).
 *
 * LE COMPTE FERMÉ EN COURS D'EXERCICE EST COUVERT (première relecture, B1).
 * Il n'aura jamais de relevé au jour de la clôture · le réclamer pousserait à
 * saisir un relevé fictif. Il est couvert quand TROIS faits sont réunis · le
 * dernier rapprochement clos porte un solde de relevé NUL, son relevé est
 * daté au plus tôt de la DERNIÈRE ligne du compte dans l'exercice, et le
 * solde comptable est nul à la clôture. Un solde comptable nul seul ne suffit
 * pas · un compte actif peut être nul aux livres et porter un solde en banque.
 *
 * LE 526 EST ÉCARTÉ. Il porte des intérêts COURUS, que la banque n'a pas
 * encore inscrits · aucun relevé n'a de solde à leur opposer. ÉCART DU TEXTE,
 * signalé sans rien changer puisque toute la racine est écartée · la fiche du
 * compte 52 (AUDCIF Titre VII) subdivise le 526 en « 5261 en monnaie locale ·
 * 5265 en devises », quand les deux semis ouvrent 52610000 « intérêts courus,
 * charges à payer » et 52670000 « intérêts courus, produits à recevoir ».
 *
 * LIMITE · un compte 52 sans AUCUNE ligne dans l'exercice (exercice précédent
 * non clôturé, aucun à-nouveau passé) n'est pas vu · son solde n'existe pas
 * encore dans l'exercice examiné, et le contrôle de l'exercice précédent le
 * porte. Pour la même raison, le solde comptable d'un compte se lit sur les
 * seules lignes de l'exercice, à-nouveau compris.
 *
 * LA DERNIÈRE LIGNE EST UNE OPÉRATION DE BANQUE (seconde relecture, B-α).
 * Une disponibilité en devises se réévalue au cours de clôture (AUDCIF
 * art. 57) · un compte en USD fermé en juin garde une position nulle en
 * devise mais non nulle en francs, et l'écart passé au 31/12 sur le 52 est
 * une CONVERSION, pas un mouvement du relevé. Les lignes des écritures
 * d'écarts et de contre-passation d'une réévaluation, et de leurs négatifs,
 * comptent au solde et jamais à la date de la dernière ligne
 * (`estEcritureDeConversion`, par la liaison).
 *
 * LIMITE DES TROIS FAITS (seconde relecture, m4). Ils lisent les livres et
 * le dernier relevé clos · un mouvement réel de la banque POSTÉRIEUR au
 * relevé nul et jamais passé aux livres (frais prélevés après la fermeture
 * déclarée, virement entrant tardif) ne se voit pas · solde comptable nul,
 * relevé nul, aucune ligne après lui. Seul un relevé postérieur, que le
 * dossier n'a pas, le montrerait.
 *
 * CLÔTURE INFORMATIQUE · OmegaX ne connaît pas les périodes que l'entité
 * s'est données · il lit les clôtures qu'elle a POSÉES DANS OMEGAX. Une
 * clôture faite dans un autre logiciel (dossier repris) ne lui est pas
 * connue, et le message le dit. Seules la clôture de PÉRIODE (tous journaux)
 * et la clôture TOTALE (un journal jusqu'à une date) figent la chronologie,
 * définitivement ; la PARTIELLE est réversible (`annulable`), elle n'écarte
 * aucune insertion, comme `gel-cloture.ts` le tient déjà. Pour chaque journal
 * écrit dans l'exercice, la période ouverte commence au lendemain de son
 * dernier jour figé (ou au début de l'exercice) ; elle peut durer au plus
 * trois mois (« au moins trimestrielle »), bornée à la fin de l'exercice, et
 * sa clôture est due au plus tard au dernier jour des trois mois qui suivent.
 * C'est la lecture la PLUS LARGE que le texte permette · une entité aux
 * périodes plus courtes aurait une échéance plus proche, jamais une plus
 * lointaine. Le retard ne se dit qu'au lendemain de l'échéance
 * (`echeanceDepassee`). Un exercice clôturé fige tout · il n'est pas examiné.
 *
 * UN JOURNAL CRÉÉ EN COURS D'ANNÉE NE PART PAS DE SA PREMIÈRE ÉCRITURE
 * (première relecture, d). La période et la chronologie que l'art. 22, 3°
 * protège sont celles de l'ORGANISATION comptable, pas d'un journal · une
 * écriture datée de mars dans un journal ouvert en septembre est précisément
 * une « insertion intercalaire », et seule une clôture qui couvre mars
 * l'écarte. Le texte ne permet donc pas de faire partir la période de la
 * première écriture du journal ; une clôture de période, qui vaut pour tous
 * les journaux, couvre aussi celui-là.
 */

/** AUDCIF art. 113 · comptes personnels, 1er janvier 2018. */
export const ENTREE_EN_VIGUEUR_AUDCIF_2017 = new Date('2018-01-01T00:00:00.000Z');

/** Acte uniforme SYCEBNL art. 28 · « applicable à compter du 1er janvier 2024 ». */
export const ENTREE_EN_VIGUEUR_SYCEBNL = new Date('2024-01-01T00:00:00.000Z');

/** Le texte régit-il l'exercice ? Lu sur l'ouverture de l'exercice. */
export function texteEnVigueurPourLExercice(referentiel: Referentiel, dateDebut: Date): boolean {
  const borne = referentiel === Referentiel.SYCEBNL ? ENTREE_EN_VIGUEUR_SYCEBNL : ENTREE_EN_VIGUEUR_AUDCIF_2017;
  return jourUtc(dateDebut).getTime() >= borne.getTime();
}

/** Un compte de banque dont le solde se rapproche d'un relevé · racine 52, hors 526 (intérêts courus). */
export function estCompteBancaireARapprocher(numero: string): boolean {
  return numero.startsWith('52') && !numero.startsWith('526');
}

/** La fiche du compte 52 que le dossier lit, avec l'article qui en fixe la date. */
export function sourceFicheCompte52(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL
    ? "SYCEBNL, Partie 2 ch. 3, compte 52 ; AUDCIF art. 42, que l'art. 3 de l'Acte uniforme SYCEBNL n'exclut pas"
    : 'AUDCIF, Titre VII, compte 52 ; AUDCIF art. 42';
}

/** Le chemin par lequel l'art. 22, 3° atteint le dossier. */
export function sourceClotureInformatique(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL
    ? "AUDCIF art. 22, 3°, que l'art. 3 de l'Acte uniforme SYCEBNL n'exclut pas"
    : 'AUDCIF art. 22, 3°';
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const veille = (d: Date) => new Date(jourUtc(d).getTime() - 86_400_000);
const lendemain = (d: Date) => new Date(jourUtc(d).getTime() + 86_400_000);

/** Un montant arrondi au centime est-il nul ? */
const estNul = (montant: number) => Math.abs(montant) < 0.005;

// ---------------------------------------------------------------------------
// Banque sans rapprochement clos qui couvre la clôture
// ---------------------------------------------------------------------------

export interface CompteBancaireMouvemente {
  compteId: string;
  numero: string;
  intitule: string;
  /** Solde débit moins crédit des lignes de l'exercice, à-nouveau compris. */
  soldeCloture: number;
  /** Date de la dernière opération de banque du compte dans l'exercice · null si seules des conversions l'ont touché. */
  derniereLigne: Date | null;
}

export interface EtatRapprochementCompte {
  /** Le relevé du dernier rapprochement CLOS du compte, s'il y en a un. */
  dernierClos: Date | null;
  /** Le solde de relevé de ce dernier clos ; null quand il n'a pas été lu. */
  soldeDernierClos: number | null;
  /** Le relevé du rapprochement EN COURS, s'il y en a un. */
  enCours: Date | null;
}

export interface CompteSansRapprochement {
  reference: string;
  detail: string;
  date?: string;
}

/**
 * Le compte, fermé en cours d'exercice, est-il couvert ? Les TROIS faits du
 * B1 · relevé clos à solde nul, daté au plus tôt de la dernière ligne, et
 * solde comptable nul.
 */
export function compteFermeCouvert(c: CompteBancaireMouvemente, etat: EtatRapprochementCompte): boolean {
  return (
    etat.dernierClos !== null &&
    etat.soldeDernierClos !== null &&
    estNul(etat.soldeDernierClos) &&
    (c.derniereLigne === null || jourUtc(etat.dernierClos).getTime() >= jourUtc(c.derniereLigne).getTime()) &&
    estNul(c.soldeCloture)
  );
}

/** Le dernier relevé clos atteint-il la clôture ? */
export function releveCouvreLaCloture(etat: EtatRapprochementCompte, dateFin: Date): boolean {
  return etat.dernierClos !== null && jourUtc(etat.dernierClos).getTime() >= jourUtc(dateFin).getTime();
}

/**
 * Les comptes de banque mouvementés dont aucun rapprochement CLOS n'atteint
 * le jour de clôture, compte fermé couvert mis à part. Le contrôle ne parle
 * qu'au lendemain de la clôture · avant, rend une liste vide.
 */
export function comptesBancairesSansRapprochement(
  comptes: CompteBancaireMouvemente[],
  etats: Map<string, EtatRapprochementCompte>,
  dateFin: Date,
  aujourdhui: Date,
): CompteSansRapprochement[] {
  if (!echeanceDepassee(dateFin, aujourdhui)) return [];
  const sans: CompteSansRapprochement[] = [];
  for (const c of comptes) {
    if (!estCompteBancaireARapprocher(c.numero)) continue;
    const etat = etats.get(c.compteId) ?? { dernierClos: null, soldeDernierClos: null, enCours: null };
    if (releveCouvreLaCloture(etat, dateFin) || compteFermeCouvert(c, etat)) continue;
    const morceaux: string[] = [
      etat.dernierClos !== null
        ? `dernier rapprochement clos au relevé du ${iso(etat.dernierClos)}`
        : 'aucun rapprochement clos',
    ];
    if (etat.enCours !== null) morceaux.push(`rapprochement en cours au relevé du ${iso(etat.enCours)}, non clos`);
    sans.push({
      reference: `${c.numero} ${c.intitule}`,
      detail: morceaux.join(' · '),
      ...(etat.dernierClos !== null ? { date: iso(etat.dernierClos) } : {}),
    });
  }
  return sans;
}

// ---------------------------------------------------------------------------
// Période restée ouverte au-delà de la clôture informatique
// ---------------------------------------------------------------------------

export interface CloturePosee {
  granularite: GranulariteCloture;
  journalId: string | null;
  dateLimite: Date;
}

export interface JournalEcrit {
  journalId: string;
  code: string;
}

export interface PeriodeOuverte {
  /** Premier jour non figé. */
  debut: Date;
  /** Fin la plus lointaine que la période puisse avoir (trois mois au plus, bornée à l'exercice). */
  finAuPlusTard: Date;
  /** Dernier jour pour la clôturer · fin des trois mois qui suivent. */
  echeance: Date;
}

/**
 * Dernier jour de trois mois qui commencent à `debut` · la veille du même
 * quantième trois mois plus tard (1er janvier → 31 mars), et la FIN DU MOIS
 * quand ce quantième n'existe pas (31 janvier → 30 avril, non 29 avril ;
 * première relecture, c). `ajouterMois` borne alors au dernier jour du mois,
 * qui est la fin cherchée.
 */
export function finDeTroisMois(debut: Date): Date {
  const cible = ajouterMois(jourUtc(debut), 3);
  return cible.getUTCDate() !== jourUtc(debut).getUTCDate() ? cible : veille(cible);
}

/**
 * La période ouverte qui suit le dernier jour figé, et son échéance. Null si
 * tout l'exercice est figé.
 */
export function periodeOuverte(dernierJourFige: Date | null, dateDebut: Date, dateFin: Date): PeriodeOuverte | null {
  const debutExercice = jourUtc(dateDebut);
  const finExercice = jourUtc(dateFin);
  const debut =
    dernierJourFige !== null && jourUtc(dernierJourFige).getTime() >= debutExercice.getTime()
      ? lendemain(dernierJourFige)
      : debutExercice;
  if (debut.getTime() > finExercice.getTime()) return null;
  // « au moins trimestrielle » · trois mois au plus.
  const finTroisMois = finDeTroisMois(debut);
  const finAuPlusTard = finTroisMois.getTime() < finExercice.getTime() ? finTroisMois : finExercice;
  // « au plus tard à la fin du trimestre qui suit la fin de chaque période ».
  const echeance = finDeTroisMois(lendemain(finAuPlusTard));
  return { debut, finAuPlusTard, echeance };
}

/** Le dernier jour figé d'un journal · la plus lointaine clôture de période ou totale de CE journal. */
export function dernierJourFige(journalId: string, clotures: CloturePosee[]): Date | null {
  let dernier: Date | null = null;
  for (const c of clotures) {
    const vise =
      c.granularite === GranulariteCloture.PERIODE ||
      (c.granularite === GranulariteCloture.TOTALE && c.journalId === journalId);
    if (!vise) continue;
    if (dernier === null || c.dateLimite.getTime() > dernier.getTime()) dernier = c.dateLimite;
  }
  return dernier;
}

/**
 * Sans aucune clôture, la première échéance possible est-elle déjà dépassée ?
 * Une clôture ne fait que reculer l'échéance · si celle-ci ne l'est pas,
 * aucune ne l'est, et rien n'est à lire.
 */
export function premiereEcheanceDepassee(dateDebut: Date, dateFin: Date, aujourdhui: Date): boolean {
  const p = periodeOuverte(null, dateDebut, dateFin);
  return p !== null && echeanceDepassee(p.echeance, aujourdhui);
}

export interface JournalEnRetard {
  reference: string;
  detail: string;
  date: string;
}

/** Les journaux écrits dont la période ouverte a passé son échéance. */
export function journauxEnRetardDeClotureInformatique(
  journaux: JournalEcrit[],
  clotures: CloturePosee[],
  dateDebut: Date,
  dateFin: Date,
  aujourdhui: Date,
): JournalEnRetard[] {
  const enRetard: JournalEnRetard[] = [];
  for (const j of [...journaux].sort((a, b) => a.code.localeCompare(b.code))) {
    const fige = dernierJourFige(j.journalId, clotures);
    const p = periodeOuverte(fige, dateDebut, dateFin);
    if (p === null || !echeanceDepassee(p.echeance, aujourdhui)) continue;
    enRetard.push({
      reference: `Journal ${j.code}`,
      detail:
        (fige !== null && jourUtc(fige).getTime() >= jourUtc(dateDebut).getTime()
          ? `figé dans OmegaX jusqu'au ${iso(fige)}`
          : "aucune clôture de période ni totale posée dans OmegaX pour l'exercice") +
        ` · période ouverte depuis le ${iso(p.debut)}, à clôturer au plus tard le ${iso(p.echeance)}`,
      date: iso(p.echeance),
    });
  }
  return enRetard;
}

// ---------------------------------------------------------------------------
// Virements internes (585, 588) non soldés à la clôture · ligne A17
// ---------------------------------------------------------------------------

/**
 * LIGNE A17 · relevé CPCC C14. Un CONTRÔLE, jamais un refus.
 *
 * ## Les textes, lus
 *
 * SYCEBNL, Partie 2 ch. 3, COMPTE 58 « Virements internes » · subdivisions
 * « 585 Virements de fonds ; 588 Autres virements internes ». Commentaires ·
 * « Ce sont des comptes de passage utiles à la comptabilisation d'opérations
 * internes à l'entité. [...] En tout état de cause ces comptes doivent être
 * soldés au terme de leur utilisation. » Éléments de contrôle · « Il importe
 * de s'assurer que les comptes 585 et 588 relatifs aux virements internes
 * sont soldés à la fin de l'exercice. »
 *
 * AUDCIF, Titre VII, COMPTE 58 « Régies d'avances, accréditifs et virements
 * internes » · les MÊMES phrases sur les 585 et 588 (« doivent être soldés au
 * terme de leur utilisation » ; « soldés à la fin de l'exercice »). Le
 * contrôle vaut donc aux DEUX référentiels, par le texte de chacun, et non au
 * seul SYCEBNL que nommait la ligne du suivi · cloisonner le ferait taire
 * chez une société que sa propre fiche oblige de même.
 *
 * UN NUMÉRO, DEUX CONTENUS · le 58 du SYSCOHADA porte aussi les 581 (régies
 * d'avance) et 582 (accréditifs), qu'aucune phrase ne fait solder à la
 * clôture (ils se régularisent, « crédité lors de la régularisation des
 * avances et du règlement définitif des accréditifs ») ; le 58 du SYCEBNL n'a
 * que 585 et 588. Le contrôle ne lit donc que les racines 585 et 588, aux
 * deux plans, jamais la division 58 entière.
 *
 * « doivent être soldés » · une obligation, AVERTISSEMENT, comme le compte 52
 * de la même famille. C'est un ÉTAT à la clôture, jamais un retard · il ne
 * parle qu'au lendemain de la fin de l'exercice (avant, la contrepartie d'un
 * virement en cours peut encore être datée de l'exercice, et le signaler
 * fabriquerait une anomalie, § 10 bis), et sous la même borne d'entrée en
 * vigueur que les contrôles de la ligne A13.
 *
 * ## Le solde lu
 *
 * Sur les lignes de l'exercice, à-nouveau compris, en CENTIMES · la clôture
 * annuelle ne solde que les classes 6 à 8, un 585 n'a donc ni colonne de
 * clôture ni report hors de l'à-nouveau. DEUX soldes, jamais l'un pour
 * l'autre · celui du LIVRE-JOURNAL (écritures validées, AUDCIF art. 22, 2°),
 * qui est celui des états, et celui qui compte AUSSI le brouillard et
 * l'à-nouveau provisoire. Un virement soldé par une pièce encore au
 * brouillard n'est pas soldé au livre-journal ; un virement dont la seconde
 * moitié n'a pas même été saisie ne l'est nulle part. Le compte est signalé
 * dès que l'un des deux n'est pas nul, et le détail dit les deux.
 */

/** Un compte de virement interne à solder à la clôture · racines 585 et 588, aux deux plans. */
export function estCompteDeVirementInterne(numero: string): boolean {
  return numero.startsWith('585') || numero.startsWith('588');
}

/** La fiche du compte 58 que le dossier lit. */
export function sourceFicheCompte58(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL ? 'SYCEBNL, Partie 2 ch. 3, compte 58' : 'AUDCIF, Titre VII, compte 58';
}

export interface CompteDeVirementInterne {
  compteId: string;
  numero: string;
  intitule: string;
  /** Débit moins crédit des lignes VALIDÉES de l'exercice, en centimes. */
  soldeLivreJournalCentimes: number;
  /** Débit moins crédit de toutes les lignes de l'exercice, brouillard et à-nouveau provisoire compris, en centimes. */
  soldeToutesLignesCentimes: number;
}

export interface VirementInterneNonSolde {
  reference: string;
  detail: string;
  /** Solde au livre-journal, débit positif, en francs. */
  montant: number;
}

const enFrancs = (centimes: number) =>
  (Math.abs(centimes) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decrireSolde = (centimes: number) =>
  centimes === 0 ? 'nul' : `${centimes > 0 ? 'débiteur' : 'créditeur'} de ${enFrancs(centimes)}`;

/**
 * Les comptes 585 et 588 non soldés à la clôture, par numéro. Le contrôle ne
 * parle qu'au lendemain de la clôture · avant, rend une liste vide.
 */
export function virementsInternesNonSoldes(
  comptes: CompteDeVirementInterne[],
  dateFin: Date,
  aujourdhui: Date,
): VirementInterneNonSolde[] {
  if (!echeanceDepassee(dateFin, aujourdhui)) return [];
  return comptes
    .filter((c) => estCompteDeVirementInterne(c.numero))
    .filter((c) => c.soldeLivreJournalCentimes !== 0 || c.soldeToutesLignesCentimes !== 0)
    .sort((a, b) => a.numero.localeCompare(b.numero))
    .map((c) => {
      const lj = c.soldeLivreJournalCentimes;
      const tout = c.soldeToutesLignesCentimes;
      let detail = `solde ${decrireSolde(lj)} au livre-journal au ${iso(dateFin)}`;
      if (tout !== lj) {
        // Le brouillard ne se lit jamais comme validé · il se dit à côté.
        detail +=
          tout === 0
            ? ' · nul en comptant le brouillard, la pièce qui le solde reste à valider'
            : ` · ${decrireSolde(tout)} en comptant le brouillard et l'à-nouveau provisoire`;
      }
      return { reference: `${c.numero} ${c.intitule}`, detail, montant: lj / 100 };
    });
}
