/**
 * LANCEUR D'UNE INSTALLATION SUR SITE · c'est lui que le service Windows
 * démarre, jamais `dist/main.js` directement. Quatre choses avant le serveur,
 * dans cet ordre, et aucune ne se saute :
 *
 *  1. LIRE LA CONFIGURATION du poste (`omegax.env`, dans les données, écrite
 *     à l'installation · chaîne de connexion, secret de session, dossiers).
 *     Elle ne vit pas dans le dossier du programme, qu'une mise à jour
 *     remplace en entier.
 *  2. VÉRIFIER LA LICENCE si la version change (audit final F193) · une
 *     version que la maintenance ne couvre pas s'arrête ICI, avant d'avoir
 *     touché à la base. Refusée par le serveur une fois démarré, elle avait
 *     déjà migré la base, et le client ne pouvait plus revenir à la version
 *     que sa licence couvre.
 *  3. SAUVEGARDER AVANT UNE MISE À JOUR · si la version installée n'est pas
 *     celle du dernier démarrage, une copie de la base part AVANT les
 *     migrations. Une migration qui échoue à mi-chemin sur le poste d'un
 *     client, sans copie, c'est sa comptabilité en jeu et personne à côté
 *     pour la reprendre. Cette copie ne s'écrase JAMAIS (audit final F191).
 *  4. APPLIQUER LES MIGRATIONS (`prisma migrate deploy`), exactement comme
 *     le déploiement en ligne le fait avant de basculer.
 *
 * Écrit en JavaScript simple · il doit tourner avant que quoi que ce soit
 * d'autre ne soit prêt. Ce qu'il ne réécrit pas, il le prend au serveur
 * COMPILÉ de ce même paquet (`moduleCompile`) · la lecture de la licence et
 * les règles des copies y sont déjà, et deux écritures d'une même règle
 * finissent par diverger.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ICI = __dirname;
const DONNEES = process.env.DOSSIER_DONNEES || path.join(process.env.ProgramData || 'C:\\ProgramData', 'OmegaX');
const FICHIER_ENV = process.env.OMEGAX_ENV || path.join(DONNEES, 'omegax.env');
const journal = (m) => console.log(`[omegax ${new Date().toISOString()}] ${m}`);

function lireEnv(fichier) {
  if (!fs.existsSync(fichier)) throw new Error(`Configuration introuvable : ${fichier}. Relancez l'installation.`);
  Object.assign(process.env, analyserEnv(fs.readFileSync(fichier, 'utf8')));
}

/**
 * Le fichier est écrit par PowerShell 5, dont `-Encoding utf8` pose une
 * marque d'ordre des octets en tête · retirée avant toute lecture, sans quoi
 * la première clé porterait un caractère invisible et ne serait jamais lue.
 */
function analyserEnv(texte) {
  const valeurs = {};
  for (const ligne of texte.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (ligne.trim().startsWith('#')) continue;
    const m = /^([A-Z0-9_]+)\s*=(.*)$/.exec(ligne.trimEnd());
    if (m) valeurs[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return valeurs;
}

/**
 * L'identité d'une version · le COMMIT, et la date seulement à défaut. Deux
 * paquets publiés le même jour portent la même date : comparer les dates
 * ferait migrer le second sans copie préalable.
 */
function identiteVersion(v) {
  return v && (v.commit || v.date) ? String(v.commit || v.date) : null;
}

function pg(url) {
  const u = new URL(url);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

/**
 * Un module du serveur COMPILÉ, pris dans ce paquet · même recherche que
 * l'entrée du serveur, `dist/src` puis `dist`. Introuvable, le lanceur
 * s'arrête AVANT la base · une vérification qui ne peut pas se faire ne se
 * saute pas en silence.
 */
function moduleCompile(ici, relatif) {
  const f = ['dist/src', 'dist'].map((d) => path.join(ici, d, relatif)).find((c) => fs.existsSync(c));
  if (!f) throw new Error(`Module du serveur introuvable dans ce paquet (${relatif}) · réinstallez OmegaX depuis un paquet officiel.`);
  return require(f);
}

/**
 * AUDIT FINAL F193 · ce que la licence du poste oppose à une migration, ou
 * `null`. Le service de licence du serveur, construit comme le serveur le
 * construira (accès au poste, clé de l'éditeur par défaut), le dossier de ce
 * paquet donnant la date de la version. La règle est la sienne
 * (`motifRefusMigration`) · rien n'est réécrit ici.
 */
function refusDeLaLicence(ici, env) {
  const { LicenceSurSiteService } = moduleCompile(ici, 'modules/sur-site/licence-sur-site.service.js');
  return new LicenceSurSiteService(undefined, env, undefined, ici).motifRefusMigration();
}

/** Écriture en deux temps · une coupure en pleine écriture laisserait sinon un repère tronqué. */
function ecrireEnDeuxTemps(chemin, contenu) {
  const provisoire = `${chemin}.tmp`;
  fs.writeFileSync(provisoire, contenu);
  fs.renameSync(provisoire, chemin);
}

/**
 * AVANT LES MIGRATIONS · la licence, puis la copie. Rend `apresMigration`, à
 * appeler une fois `prisma migrate deploy` ABOUTI, qui note la version et
 * tourne les copies. Les règles viennent de `copies-avant-mise-a-jour`
 * (`regles`), les gestes risqués sont passés par l'appelant (`copier`,
 * `refusLicence`) · c'est ce qui rend l'enchaînement vérifiable sans poste
 * Windows.
 *
 * AUDIT FINAL F191 · WinSW relance le service après un échec
 * (`omegax-service.xml`, `onfailure`), et la copie avant mise à jour était
 * refaite à chaque relance, sous le MÊME nom, depuis une base à moitié migrée ·
 * la seule image saine était écrasée par une image cassée. Désormais :
 *  - une copie s'écrit sous un nom PROVISOIRE et ne prend son nom qu'une fois
 *    complète · une copie interrompue ne passe jamais pour une copie faite ;
 *  - le repère ne la nomme qu'ensuite (`enCours`), et tant qu'une migration
 *    n'a pas abouti, la copie qu'il nomme est REPRISE, jamais refaite ;
 *  - un nom horodaté ne se réutilise pas, et une copie déjà là n'est jamais
 *    écrasée.
 */
function preparerMiseAJour(o) {
  const { donnees, dossier, version, maintenant, regles, garder, copier, refusLicence } = o;
  const noter = o.journal || journal;
  const cheminRepere = path.join(donnees, 'derniere-version.json');
  const texteAvant = fs.existsSync(cheminRepere) ? fs.readFileSync(cheminRepere, 'utf8') : null;
  const avant = regles.lireRepere(texteAvant);
  const plan = regles.planMiseAJour(avant, version, (nom) => fs.existsSync(path.join(dossier, nom)));

  // La licence AVANT toute copie et toute migration (audit final F193) ·
  // jamais sur un simple redémarrage de la version en place, dont la base a
  // déjà la forme et que le serveur jugera lui-même.
  if (plan.action !== 'AUCUNE') {
    const motif = refusLicence();
    if (motif) throw new Error(`${regles.etatDeLaBaseAuRefus(plan)} ${motif}`);
  }

  let repere = avant;
  if (plan.action === 'COPIER') {
    fs.mkdirSync(dossier, { recursive: true });
    for (const n of regles.provisoiresAvantMiseAJour(fs.readdirSync(dossier))) fs.rmSync(path.join(dossier, n), { force: true });
    const nom = regles.nomCopieAvantMiseAJour(maintenant, plan.versionDeLaBase);
    const cible = path.join(dossier, nom);
    if (fs.existsSync(cible)) throw new Error(`La copie ${nom} existe déjà et n'est jamais écrasée · relancez le service.`);
    const provisoire = `${cible}${regles.SUFFIXE_PROVISOIRE}`;
    if (plan.copiePerdue) noter(`La copie ${plan.copiePerdue} d'une mise à jour inachevée est introuvable · nouvelle copie de la base dans son état présent`);
    noter(`Mise à jour ${plan.versionDeLaBase ?? 'de version inconnue'} → ${version} · copie de la base avant migration (${nom})`);
    try {
      copier(provisoire);
    } catch (e) {
      fs.rmSync(provisoire, { force: true });
      throw e;
    }
    fs.renameSync(provisoire, cible);
    repere = regles.repereApresCopie(avant, version, nom);
    ecrireEnDeuxTemps(cheminRepere, JSON.stringify(repere));
  } else if (plan.action === 'REPRENDRE') {
    noter(`Mise à jour vers ${version} · la migration précédente n'a pas abouti, la copie ${plan.copie} est reprise telle quelle`);
    repere = regles.repereApresReprise(avant, version);
    ecrireEnDeuxTemps(cheminRepere, JSON.stringify(repere));
  }

  return {
    plan,
    apresMigration() {
      const final = regles.repereApresMigration(repere, version);
      const texte = JSON.stringify(final);
      if (texte !== texteAvant) ecrireEnDeuxTemps(cheminRepere, texte);
      let noms = [];
      try {
        noms = fs.readdirSync(dossier);
      } catch {
        return;
      }
      // Le reste d'une copie qu'une coupure a interrompue · une migration
      // aboutie n'en a plus aucune en cours, et sans cela il occupait la taille
      // de la base jusqu'à la mise à jour suivante (audit final F265).
      const aRetirer = [
        ...regles.provisoiresAvantMiseAJour(noms),
        ...regles.copiesAvantMiseAJourARetirer(noms, garder, regles.copiesProtegees(repere, final)),
      ];
      for (const n of aRetirer) {
        try {
          fs.unlinkSync(path.join(dossier, n));
        } catch (e) {
          noter(`Ancienne copie avant mise à jour non retirée (${n}) · ${e && e.message ? e.message : e}`);
        }
      }
    },
  };
}

function principal() {
  lireEnv(FICHIER_ENV);
  // Le poste d'un client n'a pas forcément internet · Prisma ne doit ni
  // chercher de mise à jour ni envoyer de télémétrie au démarrage.
  process.env.CHECKPOINT_DISABLE = '1';
  process.env.PRISMA_HIDE_UPDATE_MESSAGE = '1';
  process.env.DOSSIER_DONNEES = process.env.DOSSIER_DONNEES || DONNEES;
  const version = identiteVersion(JSON.parse(fs.readFileSync(path.join(ICI, 'version-sur-site.json'), 'utf8')));
  if (!version) throw new Error('version-sur-site.json illisible · réinstallez OmegaX depuis un paquet officiel.');
  const regles = moduleCompile(ICI, 'modules/sur-site/copies-avant-mise-a-jour.js');
  const pgDump = path.join(process.env.PG_BIN || '', process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
  const miseAJour = preparerMiseAJour({
    donnees: DONNEES,
    // Le dossier que le service des sauvegardes lit · `DOSSIER_DONNEES` APRÈS
    // la configuration du poste, comme lui. Pris sur `DONNEES`, calculé avant
    // elle, une configuration qui déplace les données laisserait les copies
    // avant mise à jour hors de sa liste et de sa rotation (audit final F265).
    dossier: process.env.DOSSIER_SAUVEGARDES || path.join(process.env.DOSSIER_DONNEES, 'sauvegardes'),
    version,
    maintenant: new Date(),
    regles,
    garder: regles.avantMiseAJourAGarder(process.env),
    refusLicence: () => refusDeLaLicence(ICI, process.env),
    copier: (fichier) =>
      execFileSync(pgDump, ['--format=custom', '--no-owner', '--file', fichier], { env: { ...process.env, ...pg(process.env.DATABASE_URL) }, stdio: 'inherit', windowsHide: true }),
  });

  journal('Migrations de la base');
  execFileSync(process.execPath, [path.join(ICI, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    cwd: ICI,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  // La version n'est notée qu'APRÈS des migrations réussies · un échec
  // rejouera la migration au prochain démarrage, jamais la copie, qui est
  // reprise (audit final F191).
  miseAJour.apresMigration();

  process.chdir(ICI);
  const entree = ['dist/src/main.js', 'dist/main.js'].map((f) => path.join(ICI, f)).find((f) => fs.existsSync(f));
  if (!entree) throw new Error('Serveur compilé introuvable dans ce paquet.');
  journal(`Démarrage du serveur · port ${process.env.PORT}`);
  require(entree);
}

if (require.main === module) {
  try {
    principal();
  } catch (e) {
    journal(`ÉCHEC · ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
} else {
  module.exports = { analyserEnv, identiteVersion, moduleCompile, refusDeLaLicence, preparerMiseAJour };
}
