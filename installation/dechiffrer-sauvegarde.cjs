/**
 * DÉCHIFFRER UNE COPIE EXTERNE (audit final F44) · la copie qui part sur une
 * clé USB ou un partage réseau est chiffrée par la phrase que l'administrateur
 * du dossier d'installation a choisie. Ce petit outil la remet en clair, pour
 * `pg_restore`, le jour où le disque du poste a lâché et qu'OmegaX a été
 * réinstallé ailleurs.
 *
 *   "C:\Program Files\OmegaX\node\node.exe" "C:\Program Files\OmegaX\serveur\dechiffrer-sauvegarde.cjs" E:\omegax-AAAAMMJJ-HHMMSS.dump.chiffre
 *
 * La phrase est demandée au clavier, jamais passée en argument · une ligne de
 * commande se lit dans la liste des processus. Le format est lu par le MODULE
 * DU SERVEUR, jamais réécrit ici · deux écritures du même format finiraient
 * par diverger, et la copie deviendrait illisible le seul jour où elle sert.
 */
'use strict';
const path = require('path');
const readline = require('readline');
const { dechiffrerFichier } = require(path.join(__dirname, 'dist', 'modules', 'sur-site', 'chiffrement-sauvegarde.js'));

function demanderPhrase() {
  return new Promise((resoudre) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // La phrase ne s'affiche pas pendant la frappe.
    rl._writeToOutput = (texte) => {
      if (texte.includes('Phrase')) process.stdout.write(texte);
    };
    rl.question('Phrase de chiffrement : ', (phrase) => {
      rl.close();
      process.stdout.write('\n');
      resoudre(phrase);
    });
  });
}

async function principal() {
  const source = process.argv[2];
  if (!source || !source.endsWith('.chiffre')) {
    console.error('Usage : dechiffrer-sauvegarde.cjs <copie.dump.chiffre> [sortie.dump]');
    process.exit(2);
  }
  const cible = process.argv[3] || source.replace(/\.chiffre$/, '');
  await dechiffrerFichier(source, cible, await demanderPhrase());
  console.log(`Copie remise en clair : ${cible}`);
}

principal().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
