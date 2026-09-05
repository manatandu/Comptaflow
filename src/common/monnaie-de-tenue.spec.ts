import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MONNAIE_DE_TENUE, monnaieDuJeuLegal } from './monnaie-de-tenue';

/**
 * LA MONNAIE DE TENUE NE SE CHOISIT PAS, ET RIEN NE DOIT LA RENDRE CHOISISSABLE
 * À NOUVEAU.
 *
 * CE QUI ÉTAIT CASSÉ. `Tenant.devise` ne convertissait rien · elle ÉTIQUETAIT
 * le cartouche de chaque état exporté (« montants en X », voir
 * ExportService.cartouche). Un dossier basculé en USD depuis l'écran des
 * paramètres imprimait donc « montants en USD » sur sa balance, son bilan,
 * son compte de résultat et sa liasse entière, alors qu'aucun montant n'était
 * touché. Trois clics, aucun avertissement, tous les états publiés faux.
 *
 * CE QUE DIT LE TEXTE. Loi n° 23/053, art. 141, 1° · « Cette comptabilité est
 * exprimée en Franc congolais ». AUDCIF, art. 17, 1° · « la tenue de la
 * comptabilité dans […] l'unité monétaire ayant cours légal dans l'État
 * partie ». Aucune option, aucun seuil, aucune dérogation.
 *
 * AUCUN TEST NE PORTAIT LÀ-DESSUS · ceux qui existaient figeaient au contraire
 * le verrouillage à la première écriture, c'est-à-dire admettaient qu'avant
 * elle le choix était légitime.
 */

const RACINE = join(__dirname, '..', '..');

function fichiers(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(join(RACINE, dossier))) {
    const relatif = `${dossier}/${entree}`;
    if (statSync(join(RACINE, relatif)).isDirectory()) sortie.push(...fichiers(relatif));
    else if (relatif.endsWith('.ts') && !relatif.endsWith('.spec.ts')) sortie.push(relatif);
  }
  return sortie;
}

describe('la monnaie de tenue', () => {
  it('vaut le franc congolais, et le cartouche s’y replie', () => {
    expect(MONNAIE_DE_TENUE).toBe('CDF');
    expect(monnaieDuJeuLegal('CDF')).toBe('CDF');
    // Un dossier ancien dont la colonne serait nulle imprime quand même une
    // unité · un état sans unité ne se lit pas.
    expect(monnaieDuJeuLegal(null)).toBe('CDF');
    expect(monnaieDuJeuLegal(undefined)).toBe('CDF');
  });

  it('n’est écrite par AUCUN service', () => {
    // La colonne existe encore (un dossier d'un autre État partie aura un jour
    // une autre unité légale), mais plus personne ne l'écrit. Un `devise:`
    // réapparu dans un `data:` de mise à jour ferait retomber ce test.
    const coupables = fichiers('src').filter((f) => {
      const source = readFileSync(join(RACINE, f), 'utf8');
      // Une AFFECTATION depuis une entrée · `devise: dto.x`, `devise: params.x`.
      // Les lectures (`devise: tenant.devise`) restent permises : la colonne
      // se lit toujours, elle ne s'écrit plus.
      return /^\s*devise:\s*(dto|params)\./m.test(source);
    });
    expect(coupables).toEqual([]);
  });

  it('ne figure dans aucun DTO d’entrée', () => {
    // Le champ ne se refuse pas, il n'existe plus · `forbidNonWhitelisted`
    // rejette alors la requête entière (bootstrap.ts). Un champ qu'on ne peut
    // plus envoyer vaut mieux qu'un champ qu'on refuse.
    const coupables = fichiers('src')
      .filter((f) => f.includes('/dto/'))
      .filter((f) => /^\s*devise\?:\s*string;/m.test(readFileSync(join(RACINE, f), 'utf8')));
    expect(coupables).toEqual([]);
  });

  it('n’est plus modifiable depuis l’écran des paramètres', () => {
    const page = readFileSync(join(RACINE, 'client/src/pages/ParametresDossierPage.tsx'), 'utf8');
    const bloc = page.slice(page.indexOf('label="Monnaie de tenue"'));
    const champ = bloc.slice(0, bloc.indexOf('</Ligne>'));
    expect(champ).toContain('readOnly');
    expect(champ).not.toContain('setDevise(');
    // Et l'écran dit POURQUOI · un champ grisé sans motif se lit comme une
    // panne.
    expect(page.replace(/\s+/g, ' ')).toContain('La monnaie de tenue ne se choisit pas');
    expect(page).toContain('art. 141');
  });
});
