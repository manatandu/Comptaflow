import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'crypto';

/**
 * LA LICENCE D'UNE INSTALLATION SUR SITE · un fichier signé par VMG, vérifié
 * sans internet. Moteur PUR · ni disque, ni horloge, ni réseau : le service
 * lui passe tout ce qu'il lit.
 *
 * POURQUOI UN FICHIER SIGNÉ ET NON UN APPEL EN LIGNE · décidé par Manasse le
 * 2026-09-26. La connexion d'un bureau congolais tombe des jours entiers ; une
 * licence qui exigerait un contact régulier avec nos serveurs couperait la
 * comptabilité d'un client en pleine clôture pour une panne de son opérateur.
 * Le fichier est signé en Ed25519 par la clé PRIVÉE de VMG, qui ne quitte
 * jamais nos serveurs ; le logiciel ne porte que la clé PUBLIQUE, qui vérifie
 * et ne sait pas signer. Modifier une date ou un plafond dans le fichier casse
 * la signature.
 *
 * LA COPIE EST TENUE PAR L'EMPREINTE DE LA MACHINE · la licence nomme
 * l'empreinte du poste serveur pour lequel elle est émise. Copiée sur un autre
 * poste avec les données, elle ne vaut rien.
 *
 * LE MODÈLE COMMERCIAL EST DANS DEUX DATES, et elles ne disent pas la même
 * chose. `finMaintenance` borne les MISES À JOUR · le client garde à vie la
 * version qu'il a, mais une version publiée après cette date refuse de
 * tourner sous cette licence. `expiration` borne l'USAGE, et vaut `null` pour
 * une licence perpétuelle ; elle sert à une location ou à un essai.
 */

export const FORMAT_LICENCE = 1;

export interface ContenuLicence {
  format: number;
  numero: string;
  titulaire: string;
  /** SHA-256 hexadécimal de l'identifiant du poste serveur (`empreinteMachine`). */
  empreinteMachine: string;
  /** AAAA-MM-JJ */
  emiseLe: string;
  /** AAAA-MM-JJ · dernière date de publication d'une version couverte. */
  finMaintenance: string;
  /** AAAA-MM-JJ, ou `null` pour une licence perpétuelle. */
  expiration: string | null;
  /** Nombre de dossiers (entités tenues) que l'installation peut ouvrir. */
  dossiersMax: number;
}

export interface FichierLicence {
  contenu: ContenuLicence;
  /** Signature Ed25519 de `serialiser(contenu)`, en base64. */
  signature: string;
}

export type StatutLicenceSurSite =
  | 'CLE_EDITEUR_ABSENTE'
  | 'ABSENTE'
  | 'ILLISIBLE'
  | 'SIGNATURE_INVALIDE'
  | 'AUTRE_MACHINE'
  | 'HORLOGE_RECULEE'
  | 'EXPIREE'
  | 'VERSION_INCONNUE'
  | 'VERSION_NON_COUVERTE'
  | 'VALIDE';

export interface VerdictLicence {
  statut: StatutLicenceSurSite;
  motif: string | null;
  contenu: ContenuLicence | null;
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const EMPREINTE = /^[0-9a-f]{64}$/;

/**
 * La forme SIGNÉE du contenu · clés dans un ordre fixe. Un `JSON.stringify`
 * direct dépend de l'ordre d'insertion des clés : un fichier relu puis
 * réécrit par un éditeur de texte ou un autre outil pourrait les réordonner,
 * et une licence authentique serait déclarée falsifiée.
 */
export function serialiser(c: ContenuLicence): string {
  return JSON.stringify([c.format, c.numero, c.titulaire, c.empreinteMachine, c.emiseLe, c.finMaintenance, c.expiration, c.dossiersMax]);
}

/** Pourquoi un contenu est irrecevable, ou `null` · la même règle à l'émission et à la vérification. */
export function motifRefusContenu(c: Partial<ContenuLicence> | null | undefined): string | null {
  if (!c || typeof c !== 'object') return 'contenu absent';
  if (c.format !== FORMAT_LICENCE) return `format ${String(c.format)} inconnu de cette version`;
  if (typeof c.numero !== 'string' || !c.numero.trim()) return 'numéro absent';
  if (typeof c.titulaire !== 'string' || !c.titulaire.trim()) return 'titulaire absent';
  if (typeof c.empreinteMachine !== 'string' || !EMPREINTE.test(c.empreinteMachine)) return 'empreinte de machine illisible';
  for (const [nom, v] of [['émission', c.emiseLe], ['fin de maintenance', c.finMaintenance]] as const) {
    if (typeof v !== 'string' || !JOUR.test(v) || Number.isNaN(Date.parse(v))) return `date de ${nom} illisible`;
  }
  if (c.expiration !== null && (typeof c.expiration !== 'string' || !JOUR.test(c.expiration) || Number.isNaN(Date.parse(c.expiration)))) {
    return 'date d’expiration illisible';
  }
  if (!Number.isInteger(c.dossiersMax) || (c.dossiersMax as number) < 1) return 'nombre de dossiers illisible';
  if (c.finMaintenance! < c.emiseLe!) return 'fin de maintenance antérieure à l’émission';
  if (c.expiration && c.expiration < c.emiseLe!) return 'expiration antérieure à l’émission';
  return null;
}

/** Signe un contenu · appelé par la console de VMG, seule à détenir la clé privée. */
export function signerLicence(contenu: ContenuLicence, clePriveePem: string): FichierLicence {
  const m = motifRefusContenu(contenu);
  if (m) throw new Error(`Licence irrecevable · ${m}.`);
  const signature = sign(null, Buffer.from(serialiser(contenu), 'utf8'), createPrivateKey(clePriveePem)).toString('base64');
  return { contenu, signature };
}

/**
 * L'empreinte d'un poste · un hachage de son identifiant système, jamais
 * l'identifiant lui-même, qu'on n'a aucune raison de faire circuler. Le
 * préfixe la rend propre à OmegaX : la même machine n'a pas la même
 * empreinte pour un autre logiciel qui hacherait le même identifiant.
 */
export function empreinteDe(identifiantSysteme: string): string {
  return createHash('sha256').update(`omegax:${identifiantSysteme.trim().toLowerCase()}`).digest('hex');
}

export interface ContexteVerification {
  /** Clé publique de VMG (PEM), ou `null` tant qu'elle n'est pas posée dans le code. */
  clePubliquePem: string | null;
  empreinte: string;
  /** AAAA-MM-JJ, calendrier du poste. */
  aujourdhui: string;
  /** La date la plus tardive jamais vue par cette installation (AAAA-MM-JJ), ou `null`. */
  horlogeMax: string | null;
  /** Date de publication de la version installée (AAAA-MM-JJ), ou `null` si inconnue. */
  dateVersion: string | null;
}

const verdict = (statut: StatutLicenceSurSite, motif: string | null, contenu: ContenuLicence | null = null): VerdictLicence => ({ statut, motif, contenu });

/**
 * Un jour de tolérance sur l'horloge · un poste resynchronisé, ou un
 * changement de fuseau, peut reculer de quelques heures sans que personne
 * n'ait triché. Au-delà, on a remonté le calendrier pour faire revivre une
 * licence expirée.
 */
function veille(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function verifierLicence(texte: string | null, ctx: ContexteVerification): VerdictLicence {
  if (!ctx.clePubliquePem) {
    return verdict('CLE_EDITEUR_ABSENTE', 'Cette version ne porte pas la clé publique de VMG Consulting · aucune licence ne peut y être vérifiée. Elle ne doit pas être installée chez un client.');
  }
  if (texte === null || !texte.trim()) {
    return verdict('ABSENTE', 'Aucune licence n’est installée sur ce poste. Communiquez l’empreinte de la machine à VMG Consulting pour recevoir votre fichier de licence.');
  }
  let fichier: FichierLicence;
  try {
    fichier = JSON.parse(texte) as FichierLicence;
  } catch {
    return verdict('ILLISIBLE', 'Le fichier de licence est illisible · ce n’est pas un fichier émis par VMG Consulting.');
  }
  const m = motifRefusContenu(fichier?.contenu);
  if (m || typeof fichier.signature !== 'string') {
    return verdict('ILLISIBLE', `Le fichier de licence est illisible · ${m ?? 'signature absente'}.`);
  }
  const c = fichier.contenu;
  let signatureOk = false;
  try {
    signatureOk = verify(null, Buffer.from(serialiser(c), 'utf8'), createPublicKey(ctx.clePubliquePem), Buffer.from(fichier.signature, 'base64'));
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return verdict('SIGNATURE_INVALIDE', 'La signature de la licence est invalide · le fichier a été modifié, ou il n’a pas été émis par VMG Consulting.');
  }
  // Tout ce qui suit parle d'une licence AUTHENTIQUE · le contenu est rendu,
  // l'écran peut dire à qui elle a été émise, même quand elle ne vaut pas ici.
  if (c.empreinteMachine !== ctx.empreinte) {
    return verdict('AUTRE_MACHINE', `Cette licence (n° ${c.numero}) a été émise pour un autre poste. Elle ne se transfère pas · demandez à VMG Consulting une licence pour l’empreinte de ce poste.`, c);
  }
  if (ctx.horlogeMax && ctx.aujourdhui < veille(ctx.horlogeMax)) {
    return verdict('HORLOGE_RECULEE', `L’horloge de ce poste indique le ${ctx.aujourdhui}, alors que l’installation a déjà fonctionné le ${ctx.horlogeMax}. Remettez le poste à la bonne date.`, c);
  }
  if (c.expiration && ctx.aujourdhui > c.expiration) {
    return verdict('EXPIREE', `La licence n° ${c.numero} a expiré le ${c.expiration}.`, c);
  }
  if (!ctx.dateVersion) {
    return verdict('VERSION_INCONNUE', 'La date de cette version est inconnue · la couverture par la maintenance ne peut pas être vérifiée. Réinstallez OmegaX depuis un paquet officiel.', c);
  }
  if (ctx.dateVersion > c.finMaintenance) {
    return verdict(
      'VERSION_NON_COUVERTE',
      `Cette version a été publiée le ${ctx.dateVersion}, après la fin de maintenance de la licence n° ${c.numero} (${c.finMaintenance}). Renouvelez la maintenance, ou réinstallez une version publiée au plus tard à cette date.`,
      c,
    );
  }
  return verdict('VALIDE', null, c);
}
