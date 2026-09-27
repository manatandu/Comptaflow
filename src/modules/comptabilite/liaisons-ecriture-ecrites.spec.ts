import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * TOUTE COLONNE DE LIAISON VERS UNE ÉCRITURE EST ÉCRITE QUELQUE PART.
 *
 * Audit du serveur de 2026-09, I2 · `EcartInventaire.ecritureId`,
 * `Consignation.ecritureConsignationId` et `ecritureDenouementId` n'étaient
 * écrites par aucun service. Rien ne le montrait : la colonne se lisait, le
 * détenteur de `verifierAucunModuleNeLaTient` la comptait, et le compte
 * valait toujours zéro. Un refus qui ne peut pas se déclencher se lit comme
 * un refus posé.
 *
 * SEULES LES COLONNES FACULTATIVES sont recensées · une colonne obligatoire
 * ne se crée pas sans valeur, le type Prisma l'impose (ou la relation
 * imbriquée la pose, comme `LigneEcriture.ecritureId`).
 *
 * UN SITE D'ÉCRITURE est un appel `.<modele>.create|createMany|update|
 * updateMany|upsert(` dont l'argument, découpé par équilibrage de
 * parenthèses, NOMME la colonne après son `data`. Ancré sur la structure,
 * jamais sur une distance en caractères.
 */
const RACINE = join(__dirname, '..', '..', '..');

function colonnesFacultatives(): Array<{ modele: string; colonne: string }> {
  const schema = readFileSync(join(RACINE, 'prisma', 'schema.prisma'), 'utf8');
  const colonnes: Array<{ modele: string; colonne: string }> = [];
  let modele: string | null = null;
  for (const ligne of schema.split('\n')) {
    const debut = ligne.match(/^model (\w+) \{/);
    if (debut) {
      modele = debut[1];
      continue;
    }
    if (ligne.startsWith('}')) modele = null;
    const col = ligne.match(/^\s+(ecriture\w*Id)\s+String\?/);
    if (modele && col) colonnes.push({ modele, colonne: col[1] });
  }
  return colonnes;
}

function sourcesDuServeur(): string[] {
  const sources: string[] = [];
  const parcourir = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith('.ts') && !chemin.endsWith('.spec.ts')) sources.push(readFileSync(chemin, 'utf8'));
    }
  };
  parcourir(join(RACINE, 'src'));
  return sources;
}

/** L'argument de l'appel, de sa parenthèse ouvrante à sa fermante. */
function argument(source: string, ouvrante: number): string {
  let profondeur = 0;
  for (let j = ouvrante; j < source.length; j++) {
    if (source[j] === '(') profondeur++;
    else if (source[j] === ')' && --profondeur === 0) return source.slice(ouvrante, j + 1);
  }
  return '';
}

function sitesDEcriture(sources: string[], modele: string, colonne: string): number {
  const nomClient = modele[0].toLowerCase() + modele.slice(1);
  const appel = new RegExp(`\\.${nomClient}\\.(create|createMany|update|updateMany|upsert)\\(`, 'g');
  const nommee = new RegExp(`\\b${colonne}\\b`);
  let sites = 0;
  for (const source of sources) {
    for (const m of source.matchAll(appel)) {
      const arg = argument(source, (m.index ?? 0) + m[0].length - 1);
      const data = arg.indexOf('data');
      if (data >= 0 && nommee.test(arg.slice(data))) sites++;
    }
  }
  return sites;
}

describe('liaisons vers une écriture · chacune a un site d’écriture', () => {
  const colonnes = colonnesFacultatives();
  const sources = sourcesDuServeur();

  it('le recensement trouve les colonnes du constat', () => {
    // Un garde-fou qui ne trouve plus rien passe sans rien vérifier.
    const noms = colonnes.map((c) => `${c.modele}.${c.colonne}`);
    expect(noms).toEqual(
      expect.arrayContaining([
        'EcartInventaire.ecritureId',
        'Consignation.ecritureConsignationId',
        'Consignation.ecritureDenouementId',
      ]),
    );
  });

  it.each(colonnesFacultatives().map((c) => [`${c.modele}.${c.colonne}`, c.modele, c.colonne]))(
    '%s',
    (nom, modele, colonne) => {
      expect([nom, sitesDEcriture(sources, modele, colonne) > 0]).toEqual([nom, true]);
    },
  );
});
