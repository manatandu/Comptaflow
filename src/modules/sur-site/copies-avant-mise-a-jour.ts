/**
 * LES COPIES « AVANT MISE À JOUR » D'UNE INSTALLATION SUR SITE · écrites par
 * le lanceur (`installation/demarrer.cjs`) avant les migrations, listées,
 * tournées et recopiées par le service des sauvegardes.
 *
 * Moteur PUR · ni Nest, ni disque, ni horloge. Le lanceur le charge COMPILÉ
 * depuis le paquet (`dist/modules/sur-site/copies-avant-mise-a-jour.js`),
 * avant que le serveur n'existe, et le service l'importe. Le nom, le motif et
 * la rotation ne s'écrivent donc qu'une fois (audit final F265) · écrits deux
 * fois, le lanceur déposait des copies que le service ne reconnaissait pas,
 * et elles s'accumulaient sur le disque sans être ni listées, ni tournées, ni
 * recopiées hors du poste.
 *
 * LE REPÈRE DE VERSION (`derniere-version.json`) porte trois choses, et c'est
 * lui qui empêche d'écraser la seule copie qui compte (audit final F191) :
 *  - `commit` · la version dont les migrations ont ABOUTI, donc celle dont la
 *    base a la forme ;
 *  - `enCours` · une copie de cette base cohérente a été faite, et une
 *    migration vers `vers` n'a pas encore abouti. La base peut être à moitié
 *    migrée · la recopier maintenant écraserait la seule image saine par une
 *    image cassée, et c'est ce que faisait chaque redémarrage de WinSW ;
 *  - `nonAbouties` · les copies prises avant une migration qui n'a jamais
 *    abouti (retour à la version précédente), que la rotation ne retire pas.
 */

/** Le suffixe d'une copie en cours d'écriture · retiré une fois la copie complète. */
export const SUFFIXE_PROVISOIRE = '.partiel';

/** L'horodatage d'un nom de copie · calendrier du poste, triable comme une chaîne. */
export function horodatageCopie(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Le motif d'une copie avant mise à jour · `omegax-AAAAMMJJ-HHMMSS-` comme une
 * copie quotidienne, si bien que les deux séries se trient ensemble par date,
 * puis le suffixe qui les sépare. La copie quotidienne (`omegax-AAAAMMJJ-HHMMSS.dump`) ne
 * répond pas à ce motif, ni celui-ci au sien · chaque série a sa rotation.
 */
export const MOTIF_AVANT_MISE_A_JOUR = /^omegax-(\d{8}-\d{6})-avant-mise-a-jour-([0-9A-Za-z]{1,12})\.dump$/;
/** La même copie, chiffrée dans le dossier externe. */
export const MOTIF_AVANT_MISE_A_JOUR_CHIFFRE = /^omegax-(\d{8}-\d{6})-avant-mise-a-jour-([0-9A-Za-z]{1,12})\.dump\.chiffre$/;
const MOTIF_AVANT_MISE_A_JOUR_PROVISOIRE = /^omegax-(\d{8}-\d{6})-avant-mise-a-jour-([0-9A-Za-z]{1,12})\.dump\.partiel$/;

/**
 * Le nom d'une copie avant mise à jour · il porte la version DONT LA BASE A LA
 * FORME, parce que c'est elle qu'il faudra réinstaller pour relire la copie.
 * `null` (repère illisible) donne « inconnue ». L'horodatage rend le nom
 * unique · une copie n'est jamais réécrite sous son propre nom.
 */
export function nomCopieAvantMiseAJour(d: Date, versionDeLaBase: string | null): string {
  const v = String(versionDeLaBase ?? '')
    .replace(/[^0-9A-Za-z]/g, '')
    .slice(0, 12);
  return `omegax-${horodatageCopie(d)}-avant-mise-a-jour-${v || 'inconnue'}.dump`;
}

/** Les restes d'une copie avant mise à jour interrompue (coupure, arrêt du service) · à retirer avant d'en refaire une. */
export function provisoiresAvantMiseAJour(noms: string[]): string[] {
  return noms.filter((n) => MOTIF_AVANT_MISE_A_JOUR_PROVISOIRE.test(n));
}

/**
 * Cinq copies avant mise à jour gardées, sauf réglage du poste
 * (`SAUVEGARDES_AVANT_MISE_A_JOUR_A_GARDER`). Convention d'OmegaX · aucun
 * texte n'en fixe le nombre. Une mise à jour est rare, et chacune de ces
 * copies est la base entière.
 */
export const AVANT_MISE_A_JOUR_A_GARDER_PAR_DEFAUT = 5;

export function avantMiseAJourAGarder(env: NodeJS.ProcessEnv): number {
  const g = Number.parseInt(env.SAUVEGARDES_AVANT_MISE_A_JOUR_A_GARDER ?? '', 10);
  return Number.isInteger(g) && g > 0 ? g : AVANT_MISE_A_JOUR_A_GARDER_PAR_DEFAUT;
}

export interface RepereVersion {
  /** La version dont les migrations ont abouti · `null` si le repère est illisible. */
  commit: string | null;
  /** Une copie faite, une migration vers `vers` pas encore aboutie. */
  enCours?: { vers: string; copie: string } | null;
  /** Les copies prises avant une migration qui n'a jamais abouti. */
  nonAbouties?: string[];
}

/**
 * Lit le repère · `null` quand il n'existe pas (poste neuf). Illisible, il
 * n'est pas « absent » : une installation a déjà tourné ici, et la prochaine
 * version différente fera sa copie, d'une version de base dite inconnue. Une
 * copie qu'un repère nomme doit répondre au motif · un repère retouché à la
 * main ne fait ni protéger ni reprendre un fichier qui n'est pas une copie.
 */
export function lireRepere(texte: string | null): RepereVersion | null {
  if (texte === null) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(texte.replace(/^\uFEFF/, ''));
  } catch {
    return { commit: null };
  }
  if (!brut || typeof brut !== 'object') return { commit: null };
  const o = brut as Record<string, unknown>;
  const commit = typeof o.commit === 'string' && o.commit ? o.commit : typeof o.date === 'string' && o.date ? o.date : null;
  const r: RepereVersion = { commit };
  const e = o.enCours as Record<string, unknown> | null | undefined;
  if (e && typeof e === 'object' && typeof e.vers === 'string' && typeof e.copie === 'string' && MOTIF_AVANT_MISE_A_JOUR.test(e.copie)) {
    r.enCours = { vers: e.vers, copie: e.copie };
  }
  if (Array.isArray(o.nonAbouties)) {
    const n = o.nonAbouties.filter((x): x is string => typeof x === 'string' && MOTIF_AVANT_MISE_A_JOUR.test(x));
    if (n.length) r.nonAbouties = n;
  }
  return r;
}

export type PlanMiseAJour =
  /** Aucun repère · poste neuf, sa base est vide et rien n'est à copier. */
  | { action: 'PREMIER_DEMARRAGE' }
  /** La version installée est celle dont la base a la forme · rien à copier. */
  | { action: 'AUCUNE' }
  /** Une nouvelle version · copie de la base avant les migrations. */
  | { action: 'COPIER'; versionDeLaBase: string | null; copiePerdue: string | null }
  /** Une migration n'a pas abouti · la copie faite avant elle est reprise, JAMAIS réécrite (audit final F191). */
  | { action: 'REPRENDRE'; copie: string };

/**
 * Ce que le lanceur doit faire avant les migrations. `copieExiste` dit si une
 * copie nommée par le repère est encore sur le disque.
 *
 * REPRENDRE vaut aussi quand la version à installer a changé depuis l'échec
 * (un correctif livré après une mise à jour qui a cassé) · la base reste à
 * moitié migrée, et la dernière image cohérente est toujours la copie faite
 * avant le premier essai. Une copie en cours que le disque n'a plus est dite
 * perdue, et une nouvelle copie part · de l'état présent, faute de mieux.
 */
export function planMiseAJour(repere: RepereVersion | null, version: string, copieExiste: (nom: string) => boolean): PlanMiseAJour {
  if (!repere) return { action: 'PREMIER_DEMARRAGE' };
  if (repere.commit === version) return { action: 'AUCUNE' };
  if (repere.enCours && copieExiste(repere.enCours.copie)) return { action: 'REPRENDRE', copie: repere.enCours.copie };
  return { action: 'COPIER', versionDeLaBase: repere.commit, copiePerdue: repere.enCours?.copie ?? null };
}

/**
 * Ce que le lanceur dit de la base quand la licence arrête une mise à jour
 * (audit final F193). « La base n'a pas été modifiée » n'est vrai que si
 * aucune migration n'a encore été tentée. Sur une REPRISE (un correctif livré
 * après l'échec, publié hors maintenance), l'essai précédent a pu la laisser
 * à moitié migrée · le taire ferait croire qu'il suffit de réinstaller la
 * version précédente, alors que la seule image saine est la copie faite avant
 * cet essai.
 */
export function etatDeLaBaseAuRefus(plan: PlanMiseAJour): string {
  return plan.action === 'REPRENDRE'
    ? `Mise à jour arrêtée avant les migrations · une migration précédente n’a pas abouti et la base peut être à moitié migrée ; la copie ${plan.copie}, faite avant elle, est conservée.`
    : 'Mise à jour arrêtée avant la copie et les migrations · la base n’a pas été modifiée.';
}

/** Le repère une fois la copie COMPLÈTE · jamais avant, sans quoi une copie interrompue serait reprise comme faite. */
export function repereApresCopie(repere: RepereVersion | null, version: string, copie: string): RepereVersion {
  return { commit: repere?.commit ?? null, enCours: { vers: version, copie }, ...(repere?.nonAbouties ? { nonAbouties: repere.nonAbouties } : {}) };
}

/** Le repère quand la copie d'un essai précédent est reprise · elle vaut désormais pour la version à installer. */
export function repereApresReprise(repere: RepereVersion, version: string): RepereVersion {
  return { ...repere, enCours: { vers: version, copie: repere.enCours!.copie } };
}

/**
 * Le repère après des migrations ABOUTIES. Une copie en cours dont la
 * migration visait une AUTRE version (retour à la version précédente après un
 * échec) n'a jamais servi à une migration aboutie · elle rejoint les copies
 * que la rotation ne retire pas.
 */
export function repereApresMigration(repere: RepereVersion | null, version: string): RepereVersion {
  const nonAbouties = [...(repere?.nonAbouties ?? [])];
  const e = repere?.enCours;
  if (e && e.vers !== version && !nonAbouties.includes(e.copie)) nonAbouties.push(e.copie);
  return nonAbouties.length ? { commit: version, nonAbouties } : { commit: version };
}

/** Les copies que la rotation ne touche jamais · celle de la mise à jour qui vient d'aboutir, et les non abouties. */
export function copiesProtegees(avant: RepereVersion | null, apres: RepereVersion): string[] {
  return [...new Set([...(avant?.enCours ? [avant.enCours.copie] : []), ...(apres.nonAbouties ?? [])])];
}

/**
 * Les copies avant mise à jour à retirer pour n'en garder que `garder`, les
 * plus récentes · jamais une copie protégée, jamais un fichier qui n'est pas
 * une copie d'OmegaX, et toujours au moins une.
 */
export function copiesAvantMiseAJourARetirer(noms: string[], garder: number, protegees: string[] = [], motif: RegExp = MOTIF_AVANT_MISE_A_JOUR): string[] {
  return noms
    .filter((n) => motif.test(n))
    .sort()
    .reverse()
    .slice(Math.max(1, garder))
    .filter((n) => !protegees.includes(n));
}
