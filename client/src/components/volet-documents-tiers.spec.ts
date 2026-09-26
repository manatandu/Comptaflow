import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE VOLET DOCUMENTS NE MÉLANGE JAMAIS DEUX TIERS. Un changement de fiche
 * pendant un chargement lent affichait les pièces de A sous la fiche de B, et
 * « Retirer » y supprimait une pièce de A. Deux gardes, gelées ici · le parent
 * remonte le volet à chaque tiers (champ fichier et commentaire vidés), et
 * l'effet ignore une réponse arrivée après le changement.
 */
const racine = join(__dirname, '..');
const page = readFileSync(join(racine, 'pages/TiersPage.tsx'), 'utf8');
const volet = readFileSync(join(racine, 'components/VoletDocumentsTiers.tsx'), 'utf8');

describe('volet Documents du tiers', () => {
  it('est remonté à chaque tiers par sa clé', () => {
    expect(page).toMatch(/<VoletDocumentsTiers\s+key=\{tiersSelectionne\.id\}/);
  });

  it('ignore une liste arrivée après le changement de tiers', () => {
    const debut = volet.indexOf('useEffect(');
    const effet = volet.slice(debut, volet.indexOf('}, [tiersId]);', debut));
    expect(effet).toContain('actuel && setDocuments(');
    expect(effet).toContain('actuel = false');
  });
});

/**
 * Les étendues des blocs JSX ouverts par `estAdmin && (` ou `estAdmin && <x`,
 * lues par équilibrage des parenthèses ou jusqu'à la balise fermante · une
 * STRUCTURE, jamais une distance en caractères.
 */
function blocsAdmin(source: string): Array<[number, number]> {
  const blocs: Array<[number, number]> = [];
  const marque = 'estAdmin && ';
  let i = source.indexOf(marque);
  while (i >= 0) {
    const debut = i + marque.length;
    if (source[debut] === '(') {
      let niveau = 0;
      for (let j = debut; j < source.length; j++) {
        if (source[j] === '(') niveau++;
        if (source[j] === ')') niveau--;
        if (niveau === 0) {
          blocs.push([debut, j]);
          break;
        }
      }
    } else if (source[debut] === '<') {
      const balise = /^<([a-zA-Z]+)/.exec(source.slice(debut))?.[1];
      const fin = balise ? source.indexOf(`</${balise}>`, debut) : -1;
      if (fin > 0) blocs.push([debut, fin]);
    }
    i = source.indexOf(marque, debut);
  }
  return blocs;
}

describe('Plan des tiers ouvert en consultation (2026-09-26)', () => {
  it('chaque action de structure est posée sous estAdmin, les champs sont en lecture pour les autres', () => {
    // Chaque libellé d'action de structure vit dans un bloc ouvert par
    // `estAdmin &&` · on relit le bloc JSX qui l'enveloppe, pas une distance.
    const actions = [
      'Nouveau tiers',
      'Modèles de règlement…',
      'Fusionner…',
      'Créer son compte sous le collectif',
      'Définir principal',
      'Détacher',
      'Rattacher',
    ];
    const blocs = blocsAdmin(page);
    for (const libelle of actions) {
      const i = page.indexOf(`${libelle}\n`);
      expect(i).toBeGreaterThan(0);
      expect(blocs.some(([debut, fin]) => i > debut && i < fin)).toBe(true);
    }
    expect(page).toContain('readOnly={!estAdmin}');
    expect(page).toContain('disabled={!estAdmin}');
  });
});
