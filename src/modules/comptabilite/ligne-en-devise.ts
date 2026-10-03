import { MONNAIE_DE_TENUE } from '../../common/monnaie-de-tenue';

/**
 * UNE LIGNE EN DEVISE (audit final F49) · la saisie et l'import n'écrivaient
 * jamais la devise d'une ligne, si bien que la réévaluation de clôture ne
 * trouvait aucune position et que l'écart de change réalisé du lettrage
 * n'était jamais calculé. Le serveur acceptait les trois champs sans rien en
 * vérifier · une devise d'un autre dossier passait, et un montant en devise
 * sans rapport avec le montant en francs aurait fabriqué une perte latente.
 *
 * LE MONTANT DE LA LIGNE RESTE EN MONNAIE DE TENUE (loi n° 23/053 art. 141,
 * 1° ; AUDCIF art. 17, 1°). Les trois champs gardent l'opération d'origine ·
 * le montant en devise, sa devise, et le cours auquel elle a été convertie.
 *
 * LE COURS EST CELUI QUE LE COMPTABLE A APPLIQUÉ, jamais un cours deviné ·
 * AUDCIF art. 52, la conversion se fait « sur la base du cours de change à la
 * date de formalisation de l'accord des parties (transactions commerciales)
 * ou à la date de mise à disposition des devises (opérations financières) »,
 * date qu'aucune écriture ne porte. Saisi, il doit rendre le montant de la
 * ligne ; absent, il se déduit des deux montants, qui le définissent.
 */

export interface LigneDevise {
  debit?: number | null;
  credit?: number | null;
  deviseId?: string | null;
  montantDevise?: number | null;
  coursApplique?: number | null;
}

/**
 * Un centime · la part d'arrondi que deux logiciels peuvent donner au même
 * produit. S'y ajoute celle du cours lui-même, gardé à six décimales
 * (`coursApplique`, Decimal(18, 6)) · un cours déduit puis relu à la
 * modification de la pièce s'écarte au plus d'un demi-millionième, multiplié
 * par le montant en devise. Sans cette part, une ligne d'un million de
 * dollars enregistrée hier serait refusée à sa première retouche.
 */
const TOLERANCE = 0.01;
const DEMI_UNITE_DU_COURS = 0.5e-6;

export function porteUneDevise(l: LigneDevise): boolean {
  return (l.deviseId ?? null) !== null || (l.montantDevise ?? null) !== null || (l.coursApplique ?? null) !== null;
}

/** Le montant en monnaie de tenue d'une ligne, quel que soit son sens. */
function montantEnTenue(l: LigneDevise): number {
  return Math.abs(Number(l.debit ?? 0) - Number(l.credit ?? 0));
}

/** Montant en devise × cours, arrondi au centime comme le montant de la ligne. */
export function contrevaleur(montantDevise: number, cours: number): number {
  return Math.round(montantDevise * cours * 100) / 100;
}

/**
 * La contrevaleur PORTÉE s'accorde-t-elle au montant en devise et au cours ?
 * Un centime, plus la part d'arrondi du cours à six décimales · la règle de
 * toute ligne en devise, servie aussi au règlement en devise (ligne A6).
 */
export function contrevaleurAdmise(montantDevise: number, cours: number, francs: number): boolean {
  return Math.abs(contrevaleur(montantDevise, cours) - francs) <= TOLERANCE + montantDevise * DEMI_UNITE_DU_COURS;
}

/**
 * Le motif du refus d'une ligne, ou `null` · `devise` est la devise du
 * dossier que nomme la ligne (`undefined` si elle n'en est pas une).
 */
export function motifRefusLigneEnDevise(l: LigneDevise, devise: { code: string } | undefined): string | null {
  if (!porteUneDevise(l)) return null;
  if (!l.deviseId) return 'Une ligne qui porte un montant en devise ou un cours nomme aussi sa devise.';
  if (!devise) return 'Devise introuvable pour ce dossier.';
  if (devise.code.toUpperCase() === MONNAIE_DE_TENUE) {
    return `${MONNAIE_DE_TENUE} est la monnaie de tenue · une ligne en francs ne porte ni devise ni cours.`;
  }
  const m = l.montantDevise ?? null;
  if (m === null || !Number.isFinite(Number(m)) || Number(m) <= 0) {
    return `La ligne en ${devise.code} porte son montant en devise, positif · le sens est celui de la ligne.`;
  }
  const francs = montantEnTenue(l);
  if (francs <= 0) return `La ligne en ${devise.code} porte aussi son montant en monnaie de tenue.`;
  const c = l.coursApplique ?? null;
  if (c !== null) {
    if (!Number.isFinite(Number(c)) || Number(c) <= 0) return `Le cours de la ligne en ${devise.code} doit être positif.`;
    const attendu = contrevaleur(Number(m), Number(c));
    if (!contrevaleurAdmise(Number(m), Number(c), francs)) {
      return (
        `${Number(m)} ${devise.code} au cours de ${Number(c)} font ${attendu} ${MONNAIE_DE_TENUE}, ` +
        `et la ligne porte ${francs}. Le montant d'une ligne en devise est sa contrevaleur au cours appliqué (AUDCIF art. 52).`
      );
    }
  }
  return null;
}

/**
 * Le cours enregistré · celui qui a été saisi, sinon celui que les deux
 * montants définissent, à six décimales comme la colonne. `undefined` pour
 * une ligne en francs.
 */
export function coursDeLaLigne(l: LigneDevise): number | undefined {
  if (!l.deviseId || !l.montantDevise) return undefined;
  if (l.coursApplique !== null && l.coursApplique !== undefined) return Number(l.coursApplique);
  return Math.round((montantEnTenue(l) / Number(l.montantDevise)) * 1e6) / 1e6;
}
