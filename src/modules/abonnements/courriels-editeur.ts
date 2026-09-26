/**
 * LES COURRIELS DE L'ÉDITEUR · la facture d'abonnement et la licence sur site.
 *
 * Deux compositions pures, sans lecture ni envoi · le service les met en file
 * par `CourrierService`, seul chemin d'envoi du produit (voir courrier.module).
 *
 * LA FACTURE PART EN TEXTE, DANS LE CORPS. La pièce imprimée est rendue par le
 * navigateur (FacturationPage) ; en fabriquer une seconde côté serveur, en PDF
 * ou en HTML, ferait deux maquettes de la même pièce, qui divergeraient au
 * premier correctif. Le corps reprend donc ce que la pièce porte, dans le même
 * ordre, et comme elle il DIT ce qu'il n'est pas (décret n° 23/10, art. 22).
 */

export interface FactureACourrieler {
  numeroSerie: string;
  dateFacture: string; // AAAA-MM-JJ
  periode: string; // AAAA-MM
  emetteurNom: string;
  /** La ligne de l'art. 17 AUSCGIE recopiée à la date de la pièce, ou null. */
  mentionsLigne: string | null;
  contrepartieNom: string;
  lignes: { designation: string; quantite: number; prixUnitaire: number; montantHT: number; montantTva: number }[];
  totaux: { montantHT: number; montantTva: number; montantTTC: number };
  montantUsd: number;
  cours: number;
  /** L'échéance de la licence du client à l'envoi, AAAA-MM-JJ, ou null. */
  echeanceLicence: string | null;
}

export interface LicenceACourrieler {
  numero: string;
  titulaire: string;
  empreinteMachine: string;
  emiseLe: string;
  finMaintenance: string;
  expiration: string | null;
  dossiersMax: number;
  fichier: string;
}

export interface Courriel {
  sujet: string;
  corps: string;
  pieceJointe: { nom: string; texte: string } | null;
}

const MENTION_NON_HOMOLOGUE =
  'Pièce établie par un système de facturation non homologué (décret n° 23/10 du 3 mars 2023, art. 22) · ce n’est pas une facture normalisée.';

/** Montant en francs, deux décimales, espaces ordinaires (un courriel n'a pas l'espace fine partout). */
export function montantFc(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ')} FC`;
}

/** AAAA-MM-JJ en JJ/MM/AAAA. */
export function dateLisible(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

export function courrielFactureAbonnement(f: FactureACourrieler): Courriel {
  const corps = [
    'Bonjour,',
    '',
    `Veuillez trouver ci-dessous la facture n° ${f.numeroSerie} du ${dateLisible(f.dateFacture)}, abonnement OmegaX, période ${f.periode}.`,
    '',
    `Émetteur : ${f.emetteurNom}`,
    ...(f.mentionsLigne ? [f.mentionsLigne] : []),
    `Client : ${f.contrepartieNom}`,
    '',
    ...f.lignes.map(
      (l) =>
        `- ${l.designation} · quantité ${l.quantite} · prix unitaire ${montantFc(l.prixUnitaire)} · montant HT ${montantFc(l.montantHT)}` +
        (l.montantTva ? ` · TVA ${montantFc(l.montantTva)}` : ''),
    ),
    '',
    `Montant hors TVA : ${montantFc(f.totaux.montantHT)}`,
    `TVA : ${montantFc(f.totaux.montantTva)}`,
    `Montant TTC : ${montantFc(f.totaux.montantTTC)}`,
    `Soit ${f.montantUsd} USD au cours de ${f.cours} FC du ${dateLisible(f.dateFacture)}.`,
    '',
    ...(f.echeanceLicence
      ? [`La licence de votre dossier OmegaX court jusqu’au ${dateLisible(f.echeanceLicence)} ; elle est prolongée à l’encaissement de cette facture.`, '']
      : []),
    MENTION_NON_HOMOLOGUE,
    '',
    f.emetteurNom,
  ].join('\n');
  return { sujet: `Facture ${f.numeroSerie} · abonnement OmegaX ${f.periode}`, corps, pieceJointe: null };
}

export function courrielLicenceSurSite(l: LicenceACourrieler): Courriel {
  const corps = [
    'Bonjour,',
    '',
    `Veuillez trouver en pièce jointe la licence OmegaX n° ${l.numero}.`,
    '',
    `Titulaire : ${l.titulaire}`,
    `Empreinte du poste : ${l.empreinteMachine}`,
    `Émise le : ${dateLisible(l.emiseLe)}`,
    `Fin de maintenance : ${dateLisible(l.finMaintenance)}`,
    `Expiration : ${l.expiration ? dateLisible(l.expiration) : 'aucune (licence perpétuelle)'}`,
    `Dossiers : ${l.dossiersMax}`,
    '',
    'Pour l’installer, ouvrez OmegaX sur le poste serveur et déposez le fichier joint depuis l’écran d’ouverture.',
    'Elle ne vaut que sur le poste dont l’empreinte figure ci-dessus.',
    '',
    'VMG Consulting',
  ].join('\n');
  return {
    sujet: `Licence OmegaX ${l.numero} · ${l.titulaire}`,
    corps,
    // Même nom que le téléchargement de la console · un seul fichier, deux chemins.
    pieceJointe: { nom: `licence-${l.numero}.omegax`, texte: l.fichier },
  };
}
