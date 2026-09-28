import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * AUDIT FINAL F245 · trois commentaires de documentation s'empilaient au-dessus
 * d'une seule route de la console, et deux au-dessus d'une seule méthode du
 * service · chacun décrivait une AUTRE déclaration que celle qui le suivait.
 * Un éditeur montre à qui survole `reinitialiserAdmin` le commentaire du
 * dossier de l'éditeur, et le lecteur corrige la mauvaise méthode. Le schéma,
 * lui, renvoyait à `src/modules/abonnements`, qui n'a jamais existé.
 *
 * Ce qui est relu, par STRUCTURE et jamais par distance (CLAUDE.md § 10) · un
 * bloc `/** … *\/` n'est jamais suivi d'un autre bloc, chacun précède la
 * déclaration qu'il décrit, et tout chemin `src/modules/…` qu'un commentaire
 * du schéma cite existe sur le disque.
 */

const RACINE = join(__dirname, '..', '..', '..');
const lire = (chemin: string) => readFileSync(join(RACINE, chemin), 'utf8');

function sources(dossier: string): string[] {
  return readdirSync(join(RACINE, dossier)).flatMap((n) => {
    const p = join(dossier, n);
    if (statSync(join(RACINE, p)).isDirectory()) return sources(p);
    return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });
}

/** La première ligne de code qui suit le bloc de documentation contenant `marque`. */
function declarationDocumentee(source: string, marque: string): string {
  const debut = source.lastIndexOf('/**', source.indexOf(marque));
  expect(debut).toBeGreaterThan(-1);
  const fin = source.indexOf('*/', debut) + 2;
  return source
    .slice(fin)
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)!;
}

describe('F245 · un commentaire de documentation précède SA déclaration', () => {
  const fichiers = ['src/modules/plateforme', 'src/modules/relances', 'src/modules/courrier'].flatMap(sources);

  it('le relevé trouve encore les sources du groupe', () => {
    expect(fichiers).toEqual(expect.arrayContaining(['src/modules/plateforme/plateforme.controller.ts', 'src/modules/plateforme/plateforme.service.ts']));
  });

  it('aucun bloc de documentation n’est suivi d’un autre bloc', () => {
    const empiles = fichiers.flatMap((f) => {
      const lignes = lire(f).split('\n');
      return lignes.flatMap((l, i) => (l.trim() === '*/' && (lignes[i + 1] ?? '').trim().startsWith('/**') ? [`${f}:${i + 1}`] : []));
    });
    expect(empiles).toEqual([]);
  });

  it('les routes de la console portent chacune leur commentaire', () => {
    const c = lire('src/modules/plateforme/plateforme.controller.ts');
    expect(declarationDocumentee(c, 'DERNIER RECOURS')).toBe("@Post('cabinets/:tenantId/reinitialiser-admin')");
    expect(declarationDocumentee(c, 'DOSSIER DE DÉMONSTRATION')).toBe("@Post('dossier-demonstration')");
    expect(declarationDocumentee(c, 'Désigne le dossier de l')).toBe("@Post('cabinets/:tenantId/dossier-editeur')");
  });

  it('les méthodes du service portent chacune leur commentaire', () => {
    const s = lire('src/modules/plateforme/plateforme.service.ts');
    expect(declarationDocumentee(s, 'Suspension, réactivation')).toMatch(/^private async modifierLicenceSansGarde\(/);
    expect(declarationDocumentee(s, 'LA LICENCE EST CELLE D')).toMatch(/^modifierLicence\(/);
    expect(declarationDocumentee(s, 'DOSSIER DE DÉMONSTRATION · le troisième')).toMatch(/^async preparerDossierDemonstration\(/);
    expect(declarationDocumentee(s, 'DÉSIGNER LE DOSSIER DE L')).toMatch(/^async designerDossierEditeur\(/);
  });
});

describe('F245 · les chemins que le schéma cite existent', () => {
  it('tout `src/modules/…` d’un commentaire du schéma désigne un fichier ou un dossier réel', () => {
    const schema = lire('prisma/schema.prisma');
    const cites = [...schema.matchAll(/(?<![\w/])src\/modules\/[\w./-]*[\w-]/g)].map((m) => m[0]);
    // Le relevé trouve encore quelque chose · la formule des abonnements en cite un.
    expect(cites).toContain('src/modules/plateforme/abonnements');
    expect(cites.filter((c) => !existsSync(join(RACINE, c)))).toEqual([]);
  });
});
