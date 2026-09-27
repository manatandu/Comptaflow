import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { createReadStream, createWriteStream, openSync, readSync, closeSync, renameSync, statSync, unlinkSync } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * LA COPIE EXTERNE EST CHIFFRÉE (audit final F44) · elle quitte le poste pour
 * une clé USB ou un partage réseau, et c'est la base ENTIÈRE, tous les
 * dossiers de l'installation. En clair, qui ramasse la clé lit la
 * comptabilité de chaque entité.
 *
 * LA CLÉ VIENT D'UNE PHRASE que l'administrateur choisit, et non d'un secret
 * tiré sur le poste · la copie externe existe pour le jour où le disque du
 * poste lâche, et un secret rangé sur ce disque disparaîtrait avec lui,
 * rendant la copie illisible exactement quand elle sert. La phrase, elle,
 * survit dans la tête ou le coffre de celui qui l'a choisie. Le poste garde
 * la clé DÉRIVÉE pour chiffrer chaque jour sans la redemander · elle est sur
 * le même disque que les copies locales, qui sont en clair.
 *
 * Format · `OMXSAV01`, sel (16 octets), vecteur (12), texte chiffré en
 * AES-256-GCM, étiquette d'authentification (16). Le sel voyage dans le
 * fichier, si bien que la phrase suffit à le relire sur n'importe quel poste.
 * Ce fichier est aussi chargé tel quel par `dechiffrer-sauvegarde.cjs`, qui
 * tourne après la perte du disque : une seule écriture du format.
 */

export const ENTETE_CHIFFREE = Buffer.from('OMXSAV01', 'ascii');
const LONGUEUR_SEL = 16;
const LONGUEUR_VECTEUR = 12;
const LONGUEUR_ETIQUETTE = 16;
const DEBUT_CHIFFRE = ENTETE_CHIFFREE.length + LONGUEUR_SEL + LONGUEUR_VECTEUR;

/** Une phrase trop courte se devine · douze caractères, convention d'OmegaX, aucun texte n'en fixe. */
export const LONGUEUR_PHRASE_MIN = 12;

export function motifRefusPhrase(phrase: string | null | undefined): string | null {
  if (!phrase || phrase.length < LONGUEUR_PHRASE_MIN) {
    return `La phrase de chiffrement doit compter au moins ${LONGUEUR_PHRASE_MIN} caractères · c'est elle, et elle seule, qui relira la copie externe si le disque de ce poste lâche.`;
  }
  return null;
}

export function nouveauSel(): Buffer {
  return randomBytes(LONGUEUR_SEL);
}

/**
 * scrypt, lent à dessein · une phrase volée avec un fichier ne doit pas se
 * retrouver par essais. La forme normalisée évite qu'un « é » tapé sur deux
 * claviers différents donne deux clés.
 */
export function deriverCle(phrase: string, sel: Buffer): Buffer {
  return scryptSync(phrase.normalize('NFC'), sel, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/**
 * Chiffre `source` vers `cible`. Écrit d'abord sous un nom provisoire puis
 * renomme · une copie interrompue ne doit jamais porter le nom d'une copie
 * complète.
 */
export async function chiffrerFichier(source: string, cible: string, cle: Buffer, sel: Buffer): Promise<void> {
  const vecteur = randomBytes(LONGUEUR_VECTEUR);
  const chiffreur = createCipheriv('aes-256-gcm', cle, vecteur);
  const provisoire = `${cible}.partiel`;
  try {
    await pipeline(
      createReadStream(source),
      async function* (entree: AsyncIterable<Buffer>) {
        yield Buffer.concat([ENTETE_CHIFFREE, sel, vecteur]);
        for await (const morceau of entree) yield chiffreur.update(morceau);
        yield chiffreur.final();
        yield chiffreur.getAuthTag();
      },
      createWriteStream(provisoire),
    );
    renameSync(provisoire, cible);
  } catch (e) {
    retirerSansErreur(provisoire);
    throw e;
  }
}

/**
 * Déchiffre une copie externe. Une phrase fausse ou un fichier altéré font
 * échouer l'étiquette GCM, et rien n'est laissé derrière · un fichier à moitié
 * déchiffré se restaurerait comme une base tronquée.
 */
export async function dechiffrerFichier(source: string, cible: string, phrase: string): Promise<void> {
  const taille = statSync(source).size;
  if (taille < DEBUT_CHIFFRE + LONGUEUR_ETIQUETTE) throw new Error('Fichier trop court pour une copie chiffrée d’OmegaX.');
  const tete = lireOctets(source, 0, DEBUT_CHIFFRE);
  if (!tete.subarray(0, ENTETE_CHIFFREE.length).equals(ENTETE_CHIFFREE)) {
    throw new Error('Ce fichier n’est pas une copie chiffrée d’OmegaX.');
  }
  const sel = tete.subarray(ENTETE_CHIFFREE.length, ENTETE_CHIFFREE.length + LONGUEUR_SEL);
  const vecteur = tete.subarray(ENTETE_CHIFFREE.length + LONGUEUR_SEL, DEBUT_CHIFFRE);
  const etiquette = lireOctets(source, taille - LONGUEUR_ETIQUETTE, LONGUEUR_ETIQUETTE);
  const dechiffreur = createDecipheriv('aes-256-gcm', deriverCle(phrase, sel), vecteur);
  dechiffreur.setAuthTag(etiquette);
  const provisoire = `${cible}.partiel`;
  try {
    const fin = taille - LONGUEUR_ETIQUETTE - 1;
    // Un chiffré vide (base vide) · `createReadStream` refuse `end < start`.
    const entree = fin >= DEBUT_CHIFFRE ? createReadStream(source, { start: DEBUT_CHIFFRE, end: fin }) : vide();
    await pipeline(entree, dechiffreur, createWriteStream(provisoire));
    renameSync(provisoire, cible);
  } catch (e) {
    retirerSansErreur(provisoire);
    if (/unable to authenticate|auth/i.test((e as Error).message)) {
      throw new Error('Phrase de chiffrement fausse, ou fichier altéré · rien n’a été écrit.');
    }
    throw e;
  }
}

async function* vide(): AsyncGenerator<Buffer> {
  // aucun octet chiffré
}

function lireOctets(fichier: string, position: number, longueur: number): Buffer {
  const fd = openSync(fichier, 'r');
  try {
    const b = Buffer.alloc(longueur);
    readSync(fd, b, 0, longueur, position);
    return b;
  } finally {
    closeSync(fd);
  }
}

function retirerSansErreur(fichier: string) {
  try {
    unlinkSync(fichier);
  } catch {
    /* rien à retirer */
  }
}
