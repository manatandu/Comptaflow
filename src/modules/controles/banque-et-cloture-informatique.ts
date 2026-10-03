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
 * bancaire ». Un « doit » · AVERTISSEMENT.
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
 * BANQUE · le texte ne fixe AUCUNE date au rapprochement · « périodiquement ».
 * OmegaX ne réclame donc pas un relevé daté du jour de clôture, seulement que
 * la chaîne des rapprochements CLOS du compte atteigne ce jour (un relevé
 * daté au plus tôt de la clôture). La chaîne est continue (chaque
 * rapprochement part du solde du précédent clos), si bien qu'un clos daté
 * après la clôture a confronté à la banque tout ce qui la précède. Le geste
 * est toujours possible · un rapprochement s'ouvre sur un relevé de toute
 * date, et le pointage n'est pas figé par la clôture de l'exercice. Le
 * contrôle ne parle qu'au LENDEMAIN de la clôture (avant, aucun relevé ne
 * peut la couvrir). Le 526 « Banques, intérêts courus » est ÉCARTÉ · ses deux
 * comptes (charges à payer, produits à recevoir, mêmes numéros aux deux
 * semis) portent des intérêts COURUS, que la banque n'a pas encore inscrits ·
 * aucun relevé n'a de solde à leur opposer.
 *
 * CLÔTURE INFORMATIQUE · OmegaX ne connaît pas les périodes que l'entité
 * s'est données · il lit les clôtures qu'elle a POSÉES. Seules la clôture de
 * PÉRIODE (tous journaux) et la clôture TOTALE (un journal jusqu'à une date)
 * figent la chronologie, définitivement ; la PARTIELLE est réversible
 * (`annulable`), elle n'écarte aucune insertion, comme `gel-cloture.ts` le
 * tient déjà. Pour chaque journal écrit dans l'exercice, la période ouverte
 * commence au lendemain de son dernier jour figé (ou au début de
 * l'exercice) ; elle peut durer au plus trois mois (« au moins
 * trimestrielle »), bornée à la fin de l'exercice, et sa clôture est due au
 * plus tard au dernier jour des trois mois qui suivent. C'est la lecture la
 * PLUS LARGE que le texte permette · une entité aux périodes plus courtes
 * aurait une échéance plus proche, jamais une plus lointaine. Le retard ne
 * se dit qu'au lendemain de l'échéance (`echeanceDepassee`). Un exercice
 * clôturé fige tout · il n'est pas examiné.
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

/** La fiche du compte 52 que le dossier lit. */
export function sourceFicheCompte52(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL ? 'SYCEBNL, Partie 2 ch. 3, compte 52' : 'AUDCIF, Titre VII, compte 52';
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

// ---------------------------------------------------------------------------
// Banque sans rapprochement clos qui couvre la clôture
// ---------------------------------------------------------------------------

export interface CompteBancaireMouvemente {
  compteId: string;
  numero: string;
  intitule: string;
}

export interface EtatRapprochementCompte {
  /** Le relevé du dernier rapprochement CLOS du compte, s'il y en a un. */
  dernierClos: Date | null;
  /** Le relevé du rapprochement EN COURS, s'il y en a un. */
  enCours: Date | null;
}

export interface CompteSansRapprochement {
  reference: string;
  detail: string;
  date?: string;
}

/**
 * Les comptes de banque mouvementés dont aucun rapprochement CLOS n'atteint
 * le jour de clôture. Le contrôle ne parle qu'au lendemain de la clôture ·
 * avant, rend une liste vide.
 */
export function comptesBancairesSansRapprochement(
  comptes: CompteBancaireMouvemente[],
  etats: Map<string, EtatRapprochementCompte>,
  dateFin: Date,
  aujourdhui: Date,
): CompteSansRapprochement[] {
  if (!echeanceDepassee(dateFin, aujourdhui)) return [];
  const cloture = jourUtc(dateFin).getTime();
  const sans: CompteSansRapprochement[] = [];
  for (const c of comptes) {
    if (!estCompteBancaireARapprocher(c.numero)) continue;
    const etat = etats.get(c.compteId) ?? { dernierClos: null, enCours: null };
    if (etat.dernierClos !== null && jourUtc(etat.dernierClos).getTime() >= cloture) continue;
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
  // « au moins trimestrielle » · trois mois au plus, la veille du même
  // quantième trois mois plus tard (1er janvier → 31 mars).
  const finTroisMois = veille(ajouterMois(debut, 3));
  const finAuPlusTard = finTroisMois.getTime() < finExercice.getTime() ? finTroisMois : finExercice;
  // « au plus tard à la fin du trimestre qui suit la fin de chaque période ».
  const echeance = veille(ajouterMois(lendemain(finAuPlusTard), 3));
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
          ? `figé jusqu'au ${iso(fige)}`
          : "aucune clôture de période ni totale dans l'exercice") +
        ` · période ouverte depuis le ${iso(p.debut)}, à clôturer au plus tard le ${iso(p.echeance)}`,
      date: iso(p.echeance),
    });
  }
  return enRetard;
}
