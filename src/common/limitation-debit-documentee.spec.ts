import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * LA LIMITATION DE DÉBIT, RELUE CONTRE LE DOCUMENT QUI LA DÉCRIT (audit final
 * F268).
 *
 * `docs/connexions-et-plafonds.md` § 7 est la marche à suivre que `CLAUDE.md`
 * § 5 désigne pour les plafonds du service. Il écrivait un DÉCOMPTE des routes
 * limitées (« 20 par minute sur les deux routes d'identification ; 30 par
 * heure sur la troisième ») quand six routes portaient déjà le plafond de 20
 * par minute, sur deux contrôleurs · le décompte avait périmé à chaque route
 * ajoutée, sans qu'aucun test ne le voie. Le document renvoie désormais aux
 * contrôleurs au lieu de compter.
 *
 * Ce spec gèle ce renvoi par des PRÉSENCES, jamais par l'absence d'un mot :
 * chaque fichier de `src/` qui pose un décorateur `@Throttle` doit être NOMMÉ
 * dans le § 7, et le plafond commun que le document écrit doit être celui de
 * `app.module.ts`. Un contrôleur qui se met à limiter une route fait tomber le
 * test tant que le document ne le nomme pas · c'est le seul moyen qu'un
 * renvoi ne vieillisse pas comme le décompte a vieilli.
 */
const RACINE = join(__dirname, '..', '..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

/** Les fichiers de `src/` hors specs · un spec peut citer le décorateur sans l'appliquer. */
function sourcesServeur(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return sourcesServeur(chemin);
    if (!nom.endsWith('.ts') || nom.endsWith('.spec.ts')) return [];
    return [relative(RACINE, chemin).split('\\').join('/')];
  });
}

/** Un décorateur APPLIQUÉ, en tête de ligne · un commentaire qui nomme « @Throttle » ne compte pas. */
const DECORATEUR_APPLIQUE = /^\s*@Throttle\(/m;

/** Le § 7 du document, de son titre au paragraphe suivant de même niveau. */
function paragraphe7(): string {
  const doc = lire('docs/connexions-et-plafonds.md');
  const debut = doc.indexOf('## 7. ');
  if (debut < 0) throw new Error('Le § 7 de docs/connexions-et-plafonds.md est introuvable');
  const fin = doc.indexOf('\n## ', debut + 1);
  return doc.slice(debut, fin < 0 ? undefined : fin);
}

describe('limitation de débit · le § 7 de connexions-et-plafonds contre les contrôleurs (audit final F268)', () => {
  const limites = sourcesServeur(join(RACINE, 'src')).filter((f) => DECORATEUR_APPLIQUE.test(lire(f)));
  const texte = paragraphe7();

  it('le recensement trouve encore les deux contrôleurs de l’audit · un parcours vide ne vérifierait rien', () => {
    expect(limites).toEqual(
      expect.arrayContaining(['src/modules/auth/auth.controller.ts', 'src/modules/sur-site/sur-site.controller.ts']),
    );
  });

  it('chaque fichier qui pose un @Throttle est nommé dans le § 7, chemin complet', () => {
    for (const f of limites) {
      expect({ f, nomme: texte.includes(`\`${f}\``) }).toEqual({ f, nomme: true });
    }
  });

  it('le plafond commun écrit au § 7 est celui que pose app.module.ts', () => {
    const module = lire('src/app.module.ts');
    const m = /throttlers:\s*\[\{\s*ttl:\s*([\d_]+),\s*limit:\s*([\d_]+)\s*\}\]/.exec(module);
    expect(m).not.toBeNull();
    const ttl = Number(m![1].split('_').join(''));
    const limite = Number(m![2].split('_').join(''));
    // Le document parle « par minute » · une fenêtre d'une autre durée
    // obligerait à réécrire la phrase, pas seulement le nombre.
    expect(ttl).toBe(60_000);
    expect(texte).toContain(`${limite} requêtes par minute et par adresse`);
    expect(texte).toContain('`src/app.module.ts`');
  });

  it('le § 7 dit où se lisent la liste et les chiffres, au lieu de les recompter', () => {
    expect(texte).toContain("grep -rn '@Throttle' src");
    expect(texte).toContain('src/common/limitation-debit-documentee.spec.ts');
  });
});
