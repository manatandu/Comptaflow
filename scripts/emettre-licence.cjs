/**
 * ÉMISSION D'UNE LICENCE SUR SITE HORS CONSOLE · secours, quand la console
 * n'est pas joignable. Même moteur que la console (le serveur compilé), pour
 * qu'une licence émise ici soit exactement celle qu'elle aurait émise.
 *
 *   npm run build
 *   node scripts/emettre-licence.cjs --cle omegax-licences-privee.pem \
 *     --numero OMX-2026-0001 --titulaire "ASBL X" --empreinte <64 hex> \
 *     --maintenance 2027-12-31 [--expiration 2027-06-30] --dossiers 2 > licence.omegax
 *
 * Le numéro est donné À LA MAIN · le registre de la console ne le connaît
 * pas, et il faut l'y reporter pour que la suite de numéros reste continue.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const moteur = ['dist/src/modules/sur-site/licence-signee.js', 'dist/modules/sur-site/licence-signee.js']
  .map((f) => path.join(__dirname, '..', f))
  .find((f) => fs.existsSync(f));
if (!moteur) {
  console.error('Serveur non compilé · lancez « npm run build » d’abord.');
  process.exit(1);
}
const { FORMAT_LICENCE, signerLicence } = require(moteur);

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
for (const obligatoire of ['cle', 'numero', 'titulaire', 'empreinte', 'maintenance', 'dossiers']) {
  if (!args[obligatoire]) {
    console.error(`Paramètre manquant · --${obligatoire}`);
    process.exit(1);
  }
}
const p = (n) => String(n).padStart(2, '0');
const d = new Date(Date.now() + 60 * 60 * 1000);
const contenu = {
  format: FORMAT_LICENCE,
  numero: args.numero,
  titulaire: args.titulaire,
  empreinteMachine: args.empreinte.toLowerCase(),
  emiseLe: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
  finMaintenance: args.maintenance,
  expiration: args.expiration || null,
  dossiersMax: Number(args.dossiers),
};
process.stdout.write(JSON.stringify(signerLicence(contenu, fs.readFileSync(args.cle, 'utf8')), null, 2) + '\n');
