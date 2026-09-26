/**
 * LANCEUR D'UNE INSTALLATION SUR SITE · c'est lui que le service Windows
 * démarre, jamais `dist/main.js` directement. Trois choses avant le serveur,
 * dans cet ordre, et aucune ne se saute :
 *
 *  1. LIRE LA CONFIGURATION du poste (`omegax.env`, dans les données, écrite
 *     à l'installation · chaîne de connexion, secret de session, dossiers).
 *     Elle ne vit pas dans le dossier du programme, qu'une mise à jour
 *     remplace en entier.
 *  2. SAUVEGARDER AVANT UNE MISE À JOUR · si la version installée n'est pas
 *     celle du dernier démarrage, une copie de la base part AVANT les
 *     migrations. Une migration qui échoue à mi-chemin sur le poste d'un
 *     client, sans copie, c'est sa comptabilité en jeu et personne à côté
 *     pour la reprendre.
 *  3. APPLIQUER LES MIGRATIONS (`prisma migrate deploy`), exactement comme
 *     le déploiement en ligne le fait avant de basculer.
 *
 * Écrit en JavaScript simple et sans dépendance · il doit tourner avant que
 * quoi que ce soit d'autre ne soit prêt.
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

function sauvegarderAvantMiseAJour(version) {
  const repere = path.join(DONNEES, 'derniere-version.json');
  const precedente = fs.existsSync(repere) ? identiteVersion(JSON.parse(fs.readFileSync(repere, 'utf8'))) : null;
  if (precedente === version) return;
  if (precedente) {
    const dossier = process.env.DOSSIER_SAUVEGARDES || path.join(DONNEES, 'sauvegardes');
    fs.mkdirSync(dossier, { recursive: true });
    const cible = path.join(dossier, `avant-mise-a-jour-${precedente.slice(0, 12)}-vers-${version.slice(0, 12)}.dump`);
    const pgDump = path.join(process.env.PG_BIN || '', process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
    journal(`Mise à jour ${precedente} → ${version} · copie de la base avant migration`);
    execFileSync(pgDump, ['--format=custom', '--no-owner', '--file', cible], { env: { ...process.env, ...pg(process.env.DATABASE_URL) }, stdio: 'inherit', windowsHide: true });
  }
  return () => fs.writeFileSync(repere, JSON.stringify({ commit: version }));
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
  const noterVersion = sauvegarderAvantMiseAJour(version);

  journal('Migrations de la base');
  execFileSync(process.execPath, [path.join(ICI, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    cwd: ICI,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  // La version n'est notée qu'APRÈS des migrations réussies · un échec
  // rejouera la copie et la migration au prochain démarrage.
  if (noterVersion) noterVersion();

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
  module.exports = { analyserEnv, identiteVersion };
}
