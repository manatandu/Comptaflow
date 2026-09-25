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
