import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COLONNES_QUI_RETIENNENT, ECRITURE_LAISSEE_PARTIR } from './detenteurs-ecriture';

/**
 * TOUTE RELATION VERS UNE ÉCRITURE EST UNE DÉCISION (CLAUDE.md § 10 bis, audit
 * du serveur I1). Le reclassement d'immobilisation avait été ajouté au schéma
 * sans que personne ne décide : l'écriture passait la garde, puis la base
 * levait une erreur brute. Ce spec lit le schéma, il ne recopie rien · une
 * relation ajoutée demain le fait tomber tant qu'elle n'est pas rangée.
 */

const RACINE = join(__dirname, '../../..');

function relationsVersEcriture(): string[] {
  const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
  const relations: string[] = [];
  let modele = '';
  for (const ligne of schema.split('\n')) {
    const tete = ligne.match(/^model (\w+) \{/);
    if (tete) modele = tete[1];
    const champ = ligne.match(/^\s+\w+\s+Ecriture\??\s+@relation\([^)]*fields: \[(\w+)\]/);
    if (champ) relations.push(`${modele}.${champ[1]}`);
  }
  return relations;
}

/** Corps de `detenteursDe`, découpé par équilibrage des accolades. */
function corpsDetenteursDe(): string {
  const source = readFileSync(join(__dirname, 'ecriture.service.ts'), 'utf8');
  const debut = source.indexOf('private async detenteursDe(');
  const ouvrante = source.indexOf('{', source.indexOf(')', debut));
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}' && --profondeur === 0) return source.slice(ouvrante, i + 1);
  }
  throw new Error('detenteursDe introuvable');
}

describe('détenteurs d’une écriture · la décision est prise pour chaque relation', () => {
  const relations = relationsVersEcriture();
  const laissees = Object.keys(ECRITURE_LAISSEE_PARTIR);

  it('le schéma porte des relations vers une écriture · sinon rien n’est vérifié', () => {
    expect(relations.length).toBeGreaterThan(20);
    expect(relations).toContain('ReclassementImmobilisation.ecritureId');
  });

  it('chaque relation est rangée, une seule fois', () => {
    const nonRangees = relations.filter((r) => !COLONNES_QUI_RETIENNENT.includes(r) && !laissees.includes(r));
    const deuxFois = relations.filter((r) => COLONNES_QUI_RETIENNENT.includes(r) && laissees.includes(r));
    const fantomes = [...COLONNES_QUI_RETIENNENT, ...laissees].filter((r) => !relations.includes(r));
    expect(['non rangées', nonRangees, 'deux fois', deuxFois, 'hors schéma', fantomes]).toEqual([
      'non rangées', [], 'deux fois', [], 'hors schéma', [],
    ]);
  });

  it('chaque motif de départ est écrit', () => {
    const sansMotif = laissees.filter((r) => ECRITURE_LAISSEE_PARTIR[r].trim().length < 20);
    expect(sansMotif).toEqual([]);
  });

  it('chaque colonne qui retient est comptée par detenteursDe', () => {
    const corps = corpsDetenteursDe();
    const absentes = COLONNES_QUI_RETIENNENT.filter((r) => {
      const [modele, colonne] = r.split('.');
      const delegue = modele[0].toLowerCase() + modele.slice(1);
      if (!corps.includes(`this.prisma.${delegue}.count(`)) return true;
      // `ecritureId` passe souvent par l'objet `parLEcriture` ou par la
      // propriété abrégée · les autres colonnes sont nommées en toutes lettres.
      return colonne !== 'ecritureId' && !corps.includes(`${colonne}:`);
    });
    expect(absentes).toEqual([]);
  });

  it('un mouvement de magasin ANNULÉ ne tient plus son écriture (audit final F133)', () => {
    expect(corpsDetenteursDe()).toContain('this.prisma.mouvementStock.count({ where: { tenantId, ecritureId, annuleLe: null } })');
  });

  it('toute relation vers une écriture déclare son onDelete (audit du serveur I3)', () => {
    // Seize colonnes facultatives reposaient sur le défaut implicite de
    // Prisma, SET NULL, et les obligatoires sur RESTRICT · c'est ce silence
    // qui a produit le § 10 bis. Le défaut est désormais ÉCRIT, et `prisma
    // migrate diff` sur une base jetable confirme qu'il ne change rien.
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    const muettes = schema
      .split('\n')
      .filter((l) => /^\s+\w+\s+Ecriture\??\s+@relation\([^)]*fields:/.test(l))
      .filter((l) => !l.includes('onDelete:'));
    expect(muettes.map((l) => l.trim())).toEqual([]);
  });
});
