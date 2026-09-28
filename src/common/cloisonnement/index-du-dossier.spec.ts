import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELES_CLOISONNES } from './modeles-cloisonnes';

/**
 * AUDIT FINAL F261 · UNE TABLE CLOISONNÉE SE LIT PAR SON DOSSIER, ET IL LUI
 * FAUT UN INDEX QUI COMMENCE PAR LUI.
 *
 * La garde de cloisonnement borne chaque lecture par `tenantId`. Sur une table
 * sans index qui commence par cette colonne, chaque lecture balaie donc la
 * table ENTIÈRE, tous cabinets confondus · rien ne tombe, rien ne se voit, et
 * le coût grandit avec le parc. Six tables étaient dans ce cas (User, Cloture,
 * RapprochementBancaire, LigneOdAnalytique, Immobilisation,
 * LigneRetraitementIfrs), et un index sur une clé étrangère (`odId`,
 * `retraitementId`, `immobilisationPrincipaleId`) ne les couvrait pas, puisqu'il
 * ne commence pas par le dossier.
 *
 * Le premier test gèle la PROPRIÉTÉ pour toute table cloisonnée, celles qui
 * n'existent pas encore comprises · une table ajoutée demain sans son index
 * fait tomber le test au lieu d'attendre le prochain audit. Les deux suivants
 * gèlent les six index posés et leur migration, que Prisma nomme
 * `<table>_<colonnes>_idx` · un index déclaré au schéma et absent de la SQL
 * écrite à la main ne se verrait qu'au contrôle de dérive, qu'aucun test ne
 * joue.
 */

const RACINE = join(__dirname, '..', '..', '..');
const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
const CLOISONNES = [...MODELES_CLOISONNES];

/** Corps de chaque modèle, commentaires retirés ligne à ligne. */
const MODELES = new Map(
  [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, nom, corps]) => [
    nom,
    corps.split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()),
  ]),
);

/** Colonnes de chaque `@@index([...])` du modèle, dans l'ordre déclaré. */
function indexDuModele(lignes: string[]): string[][] {
  return lignes
    .map((l) => /^@@index\(\s*(?:fields:\s*)?\[([^\]]*)\]/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1].split(',').map((c) => c.trim()));
}

/** Vrai si un index, un unique ou la clé du modèle commence par `tenantId`. */
function commenceParLeDossier(lignes: string[]): boolean {
  return (
    lignes.some((l) => /^@@(index|unique|id)\(\s*(?:fields:\s*)?\[\s*tenantId\b/.test(l)) ||
    lignes.some((l) => /^tenantId\s.*@(unique|id)\b/.test(l))
  );
}

function tableDuModele(nom: string, lignes: string[]): string {
  return /^@@map\("([^"]+)"\)/.exec(lignes.find((l) => l.startsWith('@@map(')) ?? '')?.[1] ?? nom;
}

/** Les six index posés par F261, avec les colonnes choisies sur les requêtes réelles. */
const INDEX_F261: Array<{ modele: string; table: string; colonnes: string[] }> = [
  { modele: 'User', table: 'users', colonnes: ['tenantId'] },
  { modele: 'Cloture', table: 'clotures', colonnes: ['tenantId', 'exerciceId'] },
  { modele: 'RapprochementBancaire', table: 'rapprochements_bancaires', colonnes: ['tenantId', 'compteId'] },
  { modele: 'LigneOdAnalytique', table: 'lignes_od_analytique', colonnes: ['tenantId', 'sectionId'] },
  { modele: 'Immobilisation', table: 'immobilisations', colonnes: ['tenantId', 'statut'] },
  { modele: 'LigneRetraitementIfrs', table: 'lignes_retraitement_ifrs', colonnes: ['tenantId'] },
];

describe('F261 · un index qui commence par le dossier, sur toute table cloisonnée', () => {
  it('le recensement trouve encore les tables cloisonnées · un garde-fou qui ne trouve rien ne vérifie rien', () => {
    expect(CLOISONNES.length).toBeGreaterThan(0);
    for (const nom of CLOISONNES) expect(MODELES.has(nom)).toBe(true);
    for (const { modele } of INDEX_F261) expect(CLOISONNES).toContain(modele);
  });

  it('chaque table cloisonnée porte un index, un unique ou une clé qui commence par tenantId', () => {
    const sansIndex = CLOISONNES.filter((nom) => !commenceParLeDossier(MODELES.get(nom) ?? []));
    expect(sansIndex).toEqual([]);
  });
});

describe('F261 · les six index posés, au schéma et dans leur migration', () => {
  const migrations = readdirSync(join(RACINE, 'prisma/migrations'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readFileSync(join(RACINE, 'prisma/migrations', e.name, 'migration.sql'), 'utf8'))
    .join('\n');

  it.each(INDEX_F261)('$modele porte son index par le dossier sur la table $table', ({ modele, table, colonnes }) => {
    const lignes = MODELES.get(modele) ?? [];
    expect(tableDuModele(modele, lignes)).toBe(table);
    expect(indexDuModele(lignes)).toContainEqual(colonnes);
  });

  it.each(INDEX_F261)('la migration crée l’index de $modele sous le nom que Prisma lui donne', ({ table, colonnes }) => {
    const nom = `${table}_${colonnes.join('_')}_idx`;
    const cols = colonnes.map((c) => `"${c}"`).join(', ');
    expect(migrations).toContain(`CREATE INDEX "${nom}" ON "${table}"(${cols});`);
  });
});
