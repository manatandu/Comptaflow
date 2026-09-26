import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * LA DOUBLE AUTHENTIFICATION · un code à six chiffres, calculé par une
 * application d'authentification (Google Authenticator, Microsoft
 * Authenticator, FreeOTP…) à partir d'un secret partagé une fois.
 *
 * TOTP, RFC 6238, sur HOTP, RFC 4226 · HMAC-SHA1, pas de trente secondes, six
 * chiffres. Ce sont les réglages par défaut de toutes ces applications, et
 * les seuls que l'URI `otpauth://` n'a pas besoin de nommer. Écrit ici plutôt
 * que tiré d'une bibliothèque · une trentaine de lignes, figées par les
 * vecteurs de la RFC, contre une dépendance de plus sur le chemin de la
 * connexion. Rien ne passe par le réseau : le code se vérifie hors ligne, ce
 * qui le rend servable aussi sur une installation sur site.
 */

export const PAS_SECONDES = 30;
export const CHIFFRES = 6;
/**
 * UN PAS DE PART ET D'AUTRE · l'horloge d'un téléphone dérive, et un code tapé
 * à la vingt-neuvième seconde arrive au pas suivant. Plus large, un code volé
 * servirait plus longtemps.
 */
export const FENETRE_PAS = 1;
export const NOMBRE_CODES_SECOURS = 8;

const ALPHABET_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(octets: Buffer): string {
  let bits = 0;
  let valeur = 0;
  let sortie = '';
  for (const octet of octets) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      sortie += ALPHABET_BASE32[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += ALPHABET_BASE32[(valeur << (5 - bits)) & 31];
  return sortie;
}

export function depuisBase32(texte: string): Buffer {
  const propre = texte.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const c of propre) {
    const i = ALPHABET_BASE32.indexOf(c);
    if (i < 0) throw new Error('Secret illisible.');
    valeur = (valeur << 5) | i;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(octets);
}

/** Vingt octets, la longueur de la sortie de SHA-1 que la RFC 4226 recommande. */
export function genererSecret(): string {
  return base32(randomBytes(20));
}

/** HOTP · la troncature dynamique de la RFC 4226, § 5.3. */
export function codeHotp(cle: Buffer, compteur: number, chiffres = CHIFFRES): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(compteur));
  const hmac = createHmac('sha1', cle).update(message).digest();
  const decalage = hmac[hmac.length - 1] & 0x0f;
  const binaire = hmac.readUInt32BE(decalage) & 0x7fffffff;
  return String(binaire % 10 ** chiffres).padStart(chiffres, '0');
}

export function pasDe(instantMs: number): number {
  return Math.floor(instantMs / 1000 / PAS_SECONDES);
}

/**
 * Le PAS reconnu pour ce code, ou null. Un pas déjà servi est refusé · sans
 * cela, un code lu par-dessus l'épaule resterait bon une minute entière.
 */
export function verifierCodeTotp(secret: string, code: string, instantMs: number, dernierPas: number | null): number | null {
  const propre = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(propre)) return null;
  const cle = depuisBase32(secret);
  const courant = pasDe(instantMs);
  for (let d = -FENETRE_PAS; d <= FENETRE_PAS; d++) {
    const pas = courant + d;
    if (dernierPas !== null && pas <= dernierPas) continue;
    const attendu = codeHotp(cle, pas);
    if (timingSafeEqual(Buffer.from(attendu), Buffer.from(propre))) return pas;
  }
  return null;
}

/** L'adresse qu'une application d'authentification lit (QR code ou lien). */
export function uriOtpauth(secret: string, compte: string, emetteur = 'OmegaX'): string {
  const etiquette = encodeURIComponent(`${emetteur}:${compte}`);
  return `otpauth://totp/${etiquette}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=${CHIFFRES}&period=${PAS_SECONDES}`;
}

/**
 * CODES DE SECOURS · le téléphone perdu ne doit pas fermer le compte, et la
 * console ne doit jamais dépendre d'un seul appareil. Chacun sert UNE fois.
 * Seule leur empreinte est gardée · cinquante bits d'aléa par code, trop pour
 * qu'une empreinte rapide se renverse, d'où SHA-256 plutôt que bcrypt, qui
 * coûterait huit hachages lents par connexion de secours.
 */
export function normaliserCodeSecours(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function empreinteCodeSecours(code: string): string {
  return createHash('sha256').update(normaliserCodeSecours(code)).digest('hex');
}

export function genererCodesSecours(n = NOMBRE_CODES_SECOURS): { codes: string[]; empreintes: string[] } {
  const codes = Array.from({ length: n }, () => {
    const brut = base32(randomBytes(7)).slice(0, 10);
    return `${brut.slice(0, 5)}-${brut.slice(5)}`;
  });
  return { codes, empreintes: codes.map(empreinteCodeSecours) };
}

/** Les empreintes restantes si le code est l'un d'eux, sinon null. */
export function consommerCodeSecours(code: string, empreintes: readonly string[]): string[] | null {
  if (normaliserCodeSecours(code).length !== 10) return null;
  const e = empreinteCodeSecours(code);
  const i = empreintes.indexOf(e);
  return i < 0 ? null : [...empreintes.slice(0, i), ...empreintes.slice(i + 1)];
}

export interface EtatSecondFacteur {
  secretDoubleAuth: string | null;
  dernierPasDoubleAuth: number | null;
  codesSecoursDoubleAuth: string[];
}

/**
 * Le second facteur présenté · un code de l'application, sinon un code de
 * secours. Rend ce qu'il faut ÉCRIRE pour qu'il ne resserve pas (le pas
 * consommé, ou les codes restants), ou null s'il est refusé.
 */
export function secondFacteurAccepte(
  u: EtatSecondFacteur,
  code: string,
  instantMs: number,
): { dernierPasDoubleAuth: number } | { codesSecoursDoubleAuth: string[] } | null {
  if (!u.secretDoubleAuth) return null;
  const pas = verifierCodeTotp(u.secretDoubleAuth, code, instantMs, u.dernierPasDoubleAuth);
  if (pas !== null) return { dernierPasDoubleAuth: pas };
  const reste = consommerCodeSecours(code, u.codesSecoursDoubleAuth);
  return reste ? { codesSecoursDoubleAuth: reste } : null;
}

/**
 * CE QU'UNE RÉINITIALISATION DE MOT DE PASSE LÈVE AUSSI. Celui qui
 * réinitialise (l'administrateur du dossier, l'opérateur de la console)
 * tient déjà l'entrée du compte par le mot de passe provisoire · laisser le
 * second facteur en place ne protégerait de rien, et fermerait pour de bon
 * le compte dont le titulaire a perdu son téléphone ET ses codes de secours.
 * Le titulaire la réactive lui-même, après avoir posé son mot de passe.
 */
export const SANS_DOUBLE_AUTH = {
  secretDoubleAuth: null,
  doubleAuthActiveDepuis: null,
  dernierPasDoubleAuth: null,
  codesSecoursDoubleAuth: [] as string[],
};
