import { createHash } from 'node:crypto';

/**
 * DOCUMENTS ATTACHÉS AUX TIERS (point 21 de la comparaison Sage i7).
 *
 * Sage i7, fiche tiers : « Sous volet Documents · Ce volet permet de compléter
 * la fiche d'identification du tiers par le rattachement d'un fichier lié. A
 * chaque fichier lié peut être associé un commentaire de 69 caractères. »
 *
 * C'est TOUT ce que dit la source · ni types, ni taille, ni nombre. Ce qui suit
 * est donc la définition d'OmegaX, et chaque borne dit d'où elle vient.
 *
 * LA PIÈCE EST RANGÉE EN BASE, décision de Manasse du 2026-09-25 · Sage lie un
 * chemin du poste, une application web n'a pas de disque partagé. En base,
 * elle suit la sauvegarde nocturne chiffrée et l'archive de restitution.
 *
 * TROIS RÈGLES À NE PAS DÉFAIRE.
 * 1. LE TYPE SE LIT DANS LES OCTETS, JAMAIS DANS LE NOM NI DANS L'EN-TÊTE ·
 *    l'extension et le type annoncé par le navigateur se falsifient d'un
 *    renommage, et une page HTML déposée sous « contrat.pdf » serait resservie
 *    telle quelle. La signature du fichier doit correspondre à l'extension.
 * 2. LA PIÈCE NE SE REND QU'EN TÉLÉCHARGEMENT (`attachment`, `nosniff`) ·
 *    jamais affichée dans la page de l'application.
 * 3. UNE MÊME PIÈCE N'EST PAS ATTACHÉE DEUX FOIS AU MÊME TIERS · l'empreinte
 *    SHA-256 en fait foi, et elle permet aussi de vérifier qu'une pièce
 *    restituée est bien celle qui a été déposée.
 */

/** 5 Mo · plafond retenu par Manasse le 2026-09-25 (choix du stockage en base). */
export const TAILLE_MAX_DOCUMENT = 5 * 1024 * 1024;

/** Sage : « un commentaire de 69 caractères ». */
export const LONGUEUR_MAX_COMMENTAIRE = 69;

/** Longueur gardée du nom de fichier · convention d'OmegaX, le nom sert à l'écran et au téléchargement. */
export const LONGUEUR_MAX_NOM = 150;

interface TypeAdmis {
  typeMime: string;
  extensions: readonly string[];
  /** Octets de tête qui identifient le format. */
  signature: readonly number[];
}

/**
 * Les pièces qu'un cabinet attache à un tiers · statuts, RCCM, contrat,
 * attestation, scan. Liste FERMÉE, convention d'OmegaX : un exécutable ou une
 * page HTML n'a rien à faire dans une fiche de tiers.
 *
 * Les formats Office récents sont des archives ZIP (« PK ») ; les anciens
 * (.doc, .xls) des fichiers composés OLE. La signature ne distingue pas un
 * .docx d'un .xlsx · c'est l'extension, CONFRONTÉE à elle, qui départage.
 */
export const TYPES_ADMIS: readonly TypeAdmis[] = [
  { typeMime: 'application/pdf', extensions: ['pdf'], signature: [0x25, 0x50, 0x44, 0x46] },
  { typeMime: 'image/png', extensions: ['png'], signature: [0x89, 0x50, 0x4e, 0x47] },
  { typeMime: 'image/jpeg', extensions: ['jpg', 'jpeg'], signature: [0xff, 0xd8, 0xff] },
  {
    typeMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    signature: [0x50, 0x4b, 0x03, 0x04],
  },
  {
    typeMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    signature: [0x50, 0x4b, 0x03, 0x04],
  },
  { typeMime: 'application/msword', extensions: ['doc'], signature: [0xd0, 0xcf, 0x11, 0xe0] },
  { typeMime: 'application/vnd.ms-excel', extensions: ['xls'], signature: [0xd0, 0xcf, 0x11, 0xe0] },
];

/**
 * Le nom tel qu'il sera gardé · le dernier segment seulement (un navigateur
 * ancien envoie parfois le chemin complet du poste), sans caractère de
 * contrôle ni séparateur, borné en longueur. Vide après nettoyage, il est
 * refusé plutôt que remplacé par un nom inventé.
 */
export function nettoyerNomFichier(nom: string): string {
  const dernier = nom.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const propre = dernier.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  if (propre.length <= LONGUEUR_MAX_NOM) return propre;
  const point = propre.lastIndexOf('.');
  const extension = point > 0 && propre.length - point <= 6 ? propre.slice(point) : '';
  return propre.slice(0, LONGUEUR_MAX_NOM - extension.length) + extension;
}

function extensionDe(nom: string): string {
  const point = nom.lastIndexOf('.');
  return point > 0 ? nom.slice(point + 1).toLowerCase() : '';
}

/** Le type admis que porte la pièce, ou le motif du refus. */
export function identifierType(contenu: Buffer, nom: string): { typeMime: string } | { refus: string } {
  const extension = extensionDe(nom);
  const candidat = TYPES_ADMIS.find((t) => t.extensions.includes(extension));
  if (!candidat) {
    return {
      refus:
        `Le format « .${extension || '?'} » n'est pas admis. Formats acceptés : ` +
        TYPES_ADMIS.flatMap((t) => t.extensions).map((e) => `.${e}`).join(', ') + '.',
    };
  }
  const conforme =
    contenu.length >= candidat.signature.length && candidat.signature.every((octet, i) => contenu[i] === octet);
  if (!conforme) {
    return {
      refus:
        `Le contenu du fichier ne correspond pas à son extension .${extension} · il n'est pas enregistré. ` +
        'Un fichier renommé ne change pas de format.',
    };
  }
  return { typeMime: candidat.typeMime };
}

export interface PieceDeposee {
  nom: string;
  contenu: Buffer;
  commentaire?: string | null;
}

/** Tous les refus d'une pièce, avant toute écriture. */
export function motifRefusDocument(piece: PieceDeposee): string | null {
  const nom = nettoyerNomFichier(piece.nom);
  if (!nom) return 'Le fichier n’a pas de nom lisible.';
  if (piece.contenu.length === 0) return 'Le fichier est vide.';
  if (piece.contenu.length > TAILLE_MAX_DOCUMENT) {
    return `Le fichier dépasse 5 Mo (${(piece.contenu.length / 1024 / 1024).toFixed(1)} Mo) · réduisez-le ou numérisez-le en plus basse définition.`;
  }
  const commentaire = (piece.commentaire ?? '').trim();
  if (commentaire.length > LONGUEUR_MAX_COMMENTAIRE) {
    return `Le commentaire dépasse ${LONGUEUR_MAX_COMMENTAIRE} caractères (${commentaire.length}).`;
  }
  const type = identifierType(piece.contenu, nom);
  return 'refus' in type ? type.refus : null;
}

export function empreinteDocument(contenu: Buffer): string {
  return createHash('sha256').update(contenu).digest('hex');
}

/**
 * L'en-tête `Content-Disposition` du téléchargement · toujours `attachment`,
 * avec le nom en ASCII de repli ET en UTF-8 (RFC 6266 et 5987), faute de quoi
 * « Attestation RCCM Société Démo.pdf » arriverait mutilé.
 */
export function dispositionTelechargement(nom: string): string {
  const ascii = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`;
}
