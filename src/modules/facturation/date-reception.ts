/**
 * LA FACTURE D'ACHAT DATÉE À SA RÉCEPTION (ligne A21) · moteur PUR, une seule
 * règle pour l'enregistrement, la note reçue et le passage de l'écriture.
 *
 * LE TEXTE. AUDCIF art. 16, al. 2 (non exclu par l'art. 3 du SYCEBNL, qui
 * n'écarte que les art. 5, 8, 10 à 13, 17 al. 7 et 8, 18, 19 4e tiret, 21,
 * 25 à 34, 49, 69, 70, 71 et 73 à 113 · il vaut donc aux deux référentiels) :
 *
 *   « Les mouvements affectant le patrimoine de l'entité sont enregistrés en
 *   comptabilité, opération par opération, dans l'ordre de leur date de valeur
 *   comptable. Cette date est celle de l'émission par l'entité de la pièce
 *   justificative de l'opération, ou celle de la réception des pièces
 *   d'origine externe. »
 *
 * Une facture REÇUE d'un fournisseur est une pièce d'origine externe · son
 * écriture se date au jour où elle est parvenue, la date de facture restant
 * celle du document (portée sur la facture, dans le libellé et la référence
 * de l'écriture, et dans l'état détaillé de l'art. 134, qui demande
 * « n°/date/montant HT de la facture »). Une VENTE est émise par le dossier ·
 * sa date de valeur est son émission, la date de facture, et une date de
 * réception n'y a aucun sens.
 *
 * CE QUI N'EST JAMAIS DÉDUIT. Une facture enregistrée avant cette ligne n'a pas
 * de date de réception. Ni la date de facture (ce serait la règle d'avant, que
 * le texte écarte), ni le jour de la saisie (une facture peut être saisie des
 * semaines après sa réception) ne la remplacent · elle se DÉCLARE, sinon
 * l'écriture ne se passe pas.
 */

export type SensPiece = 'VENTE' | 'ACHAT';

export interface PieceDatee {
  sens: SensPiece;
  dateFacture: Date;
  dateReception: Date | null;
}

const jour = (d: Date) => d.toISOString().slice(0, 10);
const fr = (d: Date) => {
  const [a, m, j] = jour(d).split('-');
  return `${j}/${m}/${a}`;
};

/**
 * Le refus d'une date de réception déclarée, ou null. `aujourdhui` est le jour
 * de Kinshasa (`common/echeance.ts`) · une pièce ne se reçoit pas demain.
 */
export function motifRefusDateReception(p: PieceDatee, aujourdhui: Date): string | null {
  if (!p.dateReception) return null;
  if (p.sens === 'VENTE') {
    return (
      'Une facture de vente est émise par le dossier · sa date de valeur comptable est celle de son émission ' +
      '(AUDCIF art. 16, al. 2), elle ne porte pas de date de réception.'
    );
  }
  if (jour(p.dateReception) < jour(p.dateFacture)) {
    return (
      `La date de réception (${fr(p.dateReception)}) est antérieure à la date de la facture (${fr(p.dateFacture)}) · ` +
      'une pièce ne se reçoit pas avant d’avoir été établie.'
    );
  }
  if (jour(p.dateReception) > jour(aujourdhui)) {
    return `La date de réception (${fr(p.dateReception)}) est postérieure à aujourd’hui · une pièce se déclare reçue une fois parvenue.`;
  }
  return null;
}

/**
 * LA DATE DE L'ÉCRITURE d'une facture, ou le refus qui dit quoi déclarer.
 * Vente · la date de facture (émission). Achat · la date de réception, exigée.
 */
export function dateDeValeurComptable(p: PieceDatee): { date: Date } | { refus: string } {
  if (p.sens === 'VENTE') return { date: p.dateFacture };
  if (!p.dateReception) {
    return {
      refus:
        'La date de réception de la facture n’est pas renseignée · une pièce d’origine externe s’enregistre à la ' +
        'date de sa réception (AUDCIF art. 16, al. 2). Déclarez la date à laquelle la facture est parvenue au dossier.',
    };
  }
  return { date: p.dateReception };
}

/**
 * Le libellé de l'écriture · il porte la date de la FACTURE, puisque l'écriture
 * n'est plus datée d'elle (art. 17, 5° · « les références de la pièce
 * justificative qui l'appuie »).
 */
export function libelleDeFacture(
  nature: 'FACTURE' | 'NOTE_DE_CREDIT',
  numeroSerie: string,
  dateFacture: Date,
  contrepartieNom: string,
): string {
  return `${nature === 'NOTE_DE_CREDIT' ? 'Note de crédit' : 'Facture'} ${numeroSerie} du ${fr(dateFacture)} · ${contrepartieNom}`.slice(0, 250);
}

/**
 * LA CHARGE QUI CHANGE D'EXERCICE. Une facture datée de N et reçue en N+1
 * s'enregistre en N+1 · si l'achat appartient à N, c'est à la clôture de N
 * qu'il se constate, par le compte 408, fiche du compte 60 des deux plans,
 * mot pour mot identique : « À la clôture de l'exercice, les biens reçus par
 * l'entité avant réception de la facture correspondante sont néanmoins
 * inscrits dans les achats, par le crédit d'un compte divisionnaire de
 * fournisseurs (408 · Factures non parvenues). Cette précaution a pour but
 * d'éviter de fausser les résultats. » Le logiciel ne sait pas si les biens
 * ont été reçus en N (ni si une charge à payer a déjà été passée) · il le DIT,
 * il ne passe rien.
 */
export function avertissementExerciceDeLaFacture(
  dateFacture: Date,
  dateEcriture: Date,
  exerciceDeLaFacture: { dateDebut: Date; dateFin: Date } | null,
): string | null {
  if (!exerciceDeLaFacture) return null;
  if (jour(dateEcriture) <= jour(exerciceDeLaFacture.dateFin)) return null;
  return (
    `La facture est datée du ${fr(dateFacture)} et a été reçue le ${fr(dateEcriture)} · l’écriture est passée dans ` +
    'l’exercice de la réception (AUDCIF art. 16, al. 2). Si les biens ou services appartiennent à l’exercice ' +
    `clos le ${fr(exerciceDeLaFacture.dateFin)}, ils s’y constatent à la clôture par le compte 408 (factures non ` +
    'parvenues), contre-passé à l’ouverture.'
  );
}
