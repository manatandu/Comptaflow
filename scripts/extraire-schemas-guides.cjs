/**
 * EXTRACTEUR DES GUIDES D'APPLICATION · SYCEBNL et SYSCOHADA.
 *
 * Les deux guides officiels donnent des écritures-types entièrement chiffrées.
 * Ce sont elles, et pas la mémoire, qui disent quel compte va avec quel compte.
 * Ce script les lit dans les compétences installées et en tire une table de
 * SCHÉMAS ATTESTÉS, committée dans le dépôt · le serveur n'a pas accès aux
 * compétences, et une règle comptable ne doit jamais dépendre d'un fichier
 * absent à l'exécution (même parti que compte-seed-syscohada.ts).
 *
 * LES DEUX GUIDES N'ONT PAS LE MÊME TABLEAU, et les confondre inverserait
 * débits et crédits :
 *
 *   SYCEBNL   | Compte | Intitulé | Débit | Crédit |   colonnes 3 et 4 = MONTANTS
 *   SYSCOHADA | Débit  | Crédit   | Date et libellé | Montant débit | Montant crédit |
 *                                                    colonnes 1 et 2 = COMPTES
 *
 * Usage : node scripts/extraire-schemas-guides.cjs <racine des compétences>
 */
const fs = require('node:fs');
const path = require('node:path');

const racine = process.argv[2];
if (!racine || !fs.existsSync(racine)) {
  console.error('Racine des compétences introuvable · passer le chemin en argument.');
  process.exit(1);
}

/** Un numéro de compte tel qu'il figure au guide, suffixes analytiques retirés. */
function normaliser(brut) {
  const t = String(brut).trim().replace(/\*/g, '');
  // « 4011.. », « 2443.26 », « 6011.17 » · le suffixe après le point est un
  // sous-compte de tiers ou une section analytique propre à l'exemple, pas
  // une subdivision du plan officiel.
  const sansSuffixe = t.split('.')[0].trim();
  return /^\d{2,8}$/.test(sansSuffixe) ? sansSuffixe : null;
}

function lignesDeTableau(bloc) {
  return bloc
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
}

/** Découpe un fichier en applications : { numero, titre, corps }. */
function applications(texte, motif) {
  const decoupe = [];
  const lignes = texte.split('\n');
  let courante = null;
  for (const l of lignes) {
    const m = l.match(motif);
    if (m) {
      if (courante) decoupe.push(courante);
      courante = { numero: m[1], titre: m[2].trim(), corps: [] };
    } else if (courante) {
      courante.corps.push(l);
    }
  }
  if (courante) decoupe.push(courante);
  return decoupe.map((a) => ({ ...a, corps: a.corps.join('\n') }));
}

/** Les tableaux d'un corps d'application, chacun rendu en lignes de cellules. */
function tableaux(corps) {
  const blocs = [];
  let bloc = [];
  for (const l of corps.split('\n')) {
    if (l.trim().startsWith('|')) bloc.push(l);
    else if (bloc.length) {
      blocs.push(bloc.join('\n'));
      bloc = [];
    }
  }
  if (bloc.length) blocs.push(bloc.join('\n'));
  return blocs.map(lignesDeTableau).filter((t) => t.length >= 2);
}

/** Une écriture est retenue si elle a AU MOINS un débit et un crédit. */
function retenir(schemas, source, titre, debits, credits, transition = false) {
  const d = [...new Set(debits)].sort();
  const c = [...new Set(credits)].sort();
  if (!d.length || !c.length) return;
  schemas.push({ source, titre, debits: d, credits: c, ...(transition ? { transition: true } : {}) });
}

// --- SYCEBNL ------------------------------------------------------------
function extraireSycebnl() {
  const f = path.join(racine, 'sycebnl/references/guide-application-cas-pratiques.md');
  const schemas = [];
  for (const app of applications(fs.readFileSync(f, 'utf8'), /^###\s+APPLICATION\s+(\d+)\s+[—-]\s+(.*)$/)) {
    for (const t of tableaux(app.corps)) {
      const entete = t[0].map((c) => c.toLowerCase());
      // Seuls les tableaux d'ÉCRITURE · le guide en contient d'autres
      // (correspondances emplois-ressources, budgets).
      if (!(entete[0] === 'compte' && entete.includes('débit') && entete.includes('crédit'))) continue;
      const iD = entete.indexOf('débit');
      const iC = entete.indexOf('crédit');
      const debits = [];
      const credits = [];
      for (const l of t.slice(1)) {
        if (l.every((c) => /^:?-+:?$/.test(c) || c === '')) continue;
        const compte = normaliser(l[0]);
        if (!compte) continue;
        const montantD = (l[iD] ?? '').replace(/[\s ]/g, '');
        const montantC = (l[iC] ?? '').replace(/[\s ]/g, '');
        if (montantD) debits.push(compte);
        else if (montantC) credits.push(compte);
      }
      retenir(schemas, `SYCEBNL · Application ${app.numero}`, app.titre, debits, credits);
    }
  }
  return schemas;
}

// --- SYSCOHADA ----------------------------------------------------------
function extraireSyscohada() {
  const dossier = path.join(racine, 'syscohada/ecritures/references');
  const schemas = [];
  for (const nom of fs.readdirSync(dossier).filter((n) => n.endsWith('.md')).sort()) {
    const texte = fs.readFileSync(path.join(dossier, nom), 'utf8');
    // CHAPITRE 41 · « Première application du SYSCOHADA révisé ». Tout ce
    // chapitre montre le passage de l'ANCIEN plan au nouveau, et ses
    // « rappels des écritures antérieures » mouvementent des comptes que la
    // révision de 2017 a supprimés (2011 Frais de constitution, 206 Primes
    // de remboursement des obligations, 6811 Dotations aux amortissements
    // des charges immobilisées). Ces schémas sont vrais pour une transition
    // et FAUX pour une écriture d'aujourd'hui · les marquer est la seule
    // façon qu'un contrôle ne s'en serve pas pour justifier l'injustifiable.
    const transition = nom.includes('premiere-application-syscohada-revise');
    // Deux niveaux de titre coexistent dans le guide SYSCOHADA (`##` et
    // `###`), et deux applications portent un numéro composé (« 12, P »).
    // N'accepter que `###` en perdait les deux tiers.
    for (const app of applications(texte, /^#{2,4}\s+Application\s+(\d+(?:\s*,\s*[A-Z0-9]+)?)\s*[—-]\s*(.*)$/)) {
      for (const t of tableaux(app.corps)) {
        const entete = t[0].map((c) => c.toLowerCase());
        if (!(entete[0] === 'débit' && entete[1] === 'crédit')) continue;
        const debits = [];
        const credits = [];
        for (const l of t.slice(1)) {
          if (l.every((c) => /^:?-+:?$/.test(c) || c === '')) continue;
          const d = normaliser(l[0]);
          const c = normaliser(l[1]);
          if (d) debits.push(d);
          if (c) credits.push(c);
        }
        retenir(schemas, `SYSCOHADA · Application ${app.numero}`, app.titre, debits, credits, transition);
      }
    }
  }
  return schemas;
}

function ecrire(chemin, nomConstante, referentiel, schemas) {
  const corps = schemas
    .map(
      (s) =>
        `  { source: ${JSON.stringify(s.source)}, titre: ${JSON.stringify(s.titre)}, ` +
        `debits: ${JSON.stringify(s.debits)}, credits: ${JSON.stringify(s.credits)}` +
        (s.transition ? ', transition: true' : '') +
        ` },`,
    )
    .join('\n');
  fs.writeFileSync(
    chemin,
    `/**
 * SCHÉMAS D'ÉCRITURE ATTESTÉS PAR LE GUIDE D'APPLICATION ${referentiel}.
 *
 * FICHIER ENGENDRÉ · ne pas retoucher à la main. Il se régénère par
 * \`node scripts/extraire-schemas-guides.cjs <racine des compétences>\` depuis
 * le guide officiel encodé dans la compétence \`${referentiel.toLowerCase()}\`.
 *
 * Chaque entrée est UNE écriture du guide : les comptes débités, les comptes
 * crédités, et l'application dont elle vient. La provenance n'est pas
 * décorative · un contrôle qui dit « ce schéma n'est pas au guide » doit
 * pouvoir montrer, pour ceux qui y sont, l'application exacte qui l'atteste.
 *
 * Les numéros sont ceux du guide, à leur profondeur d'origine (parfois 2
 * chiffres, parfois 4) · les rallonger inventerait une subdivision. Le
 * rapprochement avec le plan du dossier se fait par PRÉFIXE.
 */
export interface SchemaAtteste {
  /** Le guide et son numéro d'application · la preuve. */
  source: string;
  /** Intitulé de l'application, tel qu'il figure au guide. */
  titre: string;
  debits: string[];
  credits: string[];
  /**
   * Écriture de TRANSITION vers le référentiel révisé · elle mouvemente des
   * comptes abolis et ne justifie AUCUNE écriture d'aujourd'hui.
   */
  transition?: boolean;
}

export const ${nomConstante}: SchemaAtteste[] = [
${corps}
];
`,
    'utf8',
  );
}

const sycebnl = extraireSycebnl();
const syscohada = extraireSyscohada();
ecrire('src/modules/controles/schemas-guide-sycebnl.ts', 'SCHEMAS_GUIDE_SYCEBNL', 'SYCEBNL', sycebnl);
ecrire('src/modules/controles/schemas-guide-syscohada.ts', 'SCHEMAS_GUIDE_SYSCOHADA', 'SYSCOHADA', syscohada);
console.log(`SYCEBNL   · ${sycebnl.length} écritures, ${new Set(sycebnl.map((s) => s.source)).size} applications`);
console.log(`SYSCOHADA · ${syscohada.length} écritures, ${new Set(syscohada.map((s) => s.source)).size} applications`);
