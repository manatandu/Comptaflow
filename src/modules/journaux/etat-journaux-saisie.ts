import { StatutEcriture } from '@prisma/client';
import { ClotureActive, motifLigneFigee } from '../exercice/gel-cloture';

/**
 * FENÊTRE DES JOURNAUX DE SAISIE (point 17 de la comparaison Sage i7).
 *
 * Sage i7, Traitement / Journaux de saisie : « permet de visualiser, de
 * modifier et d'enregistrer les mouvements sur les journaux » ; on y choisit
 * « le code journal et le mois appropriés ». Le support Sage 100 décrit
 * l'écran : tous les codes journaux créés, et pour chacun « le mois et l'année
 * auxquels correspond le journal » avec un indicateur de « l'état du journal :
 * Brouillard, Non imprimé, Journal, Non clôturé, Clôturé ».
 *
 * QUATRE ÉTATS SONT SERVIS, ET UN NE L'EST PAS.
 *  · VIDE · aucune écriture sur le mois ;
 *  · BROUILLARD · au moins une écriture n'est pas validée · c'est là que le
 *    travail n'est pas fini (AUDCIF art. 22, 2°, validation « au terme de
 *    chaque période qui ne peut excéder un mois ») ;
 *  · JOURNAL · toutes les écritures du mois sont validées ;
 *  · CLÔTURÉ · le mois ENTIER est figé, par la règle unique de
 *    `gel-cloture.ts` lue sur son dernier jour (exercice clôturé, clôture
 *    totale du journal, clôture de période). Une clôture qui s'arrête au
 *    milieu du mois ne clôt pas le mois · la date jusqu'où il est figé est
 *    rendue à part, et l'état reste celui des écritures.
 * « NON IMPRIMÉ » N'EST PAS SERVI · OmegaX ne tient aucune trace de
 * l'impression d'un journal, et l'état se déduirait de rien.
 *
 * L'À-NOUVEAU PROVISOIRE NE MET PAS LE MOIS EN BROUILLARD. Il reste au
 * brouillard par construction (il ne se valide jamais, voir le point 11) :
 * compté comme un brouillard ordinaire, le mois d'ouverture signalerait un
 * travail inachevé que personne ne peut achever. Il est compté à part, et un
 * mois qui ne porte que lui reste VIDE · « tout validé » serait faux.
 */

export type EtatMoisJournal = 'VIDE' | 'BROUILLARD' | 'JOURNAL' | 'CLOTURE';

export interface MoisExercice {
  /** Premier jour du mois, AAAA-MM-01. */
  debut: string;
  /** Dernier jour du mois, borné à la fin de l'exercice. */
  fin: string;
}

export interface ComptageJour {
  journalId: string;
  date: Date;
  statut: StatutEcriture;
  estANouveauProvisoire: boolean;
  nombre: number;
}

export interface CaseJournalMois {
  mois: string;
  etat: EtatMoisJournal;
  nombreEcritures: number;
  enBrouillard: number;
  aNouveauProvisoire: number;
  /** Date jusqu'où le mois est figé quand une clôture s'arrête en son milieu. */
  figeJusquau: string | null;
}

const jour = (d: Date) => d.toISOString().slice(0, 10);

/** Les mois de l'exercice, bornés à ses dates (un exercice ne commence pas forcément un 1er). */
export function moisDeLExercice(dateDebut: Date, dateFin: Date): MoisExercice[] {
  const sortie: MoisExercice[] = [];
  let curseur = new Date(Date.UTC(dateDebut.getUTCFullYear(), dateDebut.getUTCMonth(), 1));
  while (curseur <= dateFin) {
    const finMois = new Date(Date.UTC(curseur.getUTCFullYear(), curseur.getUTCMonth() + 1, 0));
    const debut = curseur < dateDebut ? dateDebut : curseur;
    sortie.push({ debut: jour(debut), fin: jour(finMois > dateFin ? dateFin : finMois) });
    curseur = new Date(Date.UTC(curseur.getUTCFullYear(), curseur.getUTCMonth() + 1, 1));
  }
  return sortie;
}

/** La dernière date figée du mois quand une clôture s'arrête avant sa fin, sinon null. */
function figeJusquauDansLeMois(
  journalId: string,
  m: MoisExercice,
  clotures: ClotureActive[],
): string | null {
  const dates = clotures
    .filter((c) => c.granularite !== 'PARTIELLE' && (c.granularite === 'PERIODE' || c.journalId === journalId))
    .map((c) => jour(c.dateLimite))
    .filter((d) => d >= m.debut && d < m.fin)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** La grille journal × mois. `journaux` fixe l'ordre des lignes. */
export function grilleJournauxSaisie(
  journaux: Array<{ id: string }>,
  mois: MoisExercice[],
  comptages: ComptageJour[],
  clotures: ClotureActive[],
  exerciceClos: boolean,
): Array<{ journalId: string; cases: CaseJournalMois[] }> {
  const cle = (journalId: string, date: string) => `${journalId}|${date.slice(0, 7)}`;
  const cumul = new Map<string, { nombre: number; brouillard: number; provisoire: number }>();
  for (const c of comptages) {
    const k = cle(c.journalId, jour(c.date));
    const v = cumul.get(k) ?? { nombre: 0, brouillard: 0, provisoire: 0 };
    v.nombre += c.nombre;
    if (c.estANouveauProvisoire) v.provisoire += c.nombre;
    else if (c.statut === StatutEcriture.BROUILLARD) v.brouillard += c.nombre;
    cumul.set(k, v);
  }
  return journaux.map((j) => ({
    journalId: j.id,
    cases: mois.map((m) => {
      const v = cumul.get(cle(j.id, m.debut)) ?? { nombre: 0, brouillard: 0, provisoire: 0 };
      const figeFin = motifLigneFigee(
        { journalId: j.id, date: new Date(`${m.fin}T00:00:00.000Z`), exerciceClos },
        clotures,
      );
      const etat: EtatMoisJournal = figeFin
        ? 'CLOTURE'
        : v.nombre - v.provisoire === 0
          ? 'VIDE'
          : v.brouillard > 0
            ? 'BROUILLARD'
            : 'JOURNAL';
      return {
        mois: m.debut.slice(0, 7),
        etat,
        nombreEcritures: v.nombre,
        enBrouillard: v.brouillard,
        aNouveauProvisoire: v.provisoire,
        figeJusquau: figeFin ? null : figeJusquauDansLeMois(j.id, m, clotures),
      };
    }),
  }));
}
