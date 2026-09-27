/**
 * CE QUE « À PROPOS » DIT DE LA CONSTRUCTION (audit final F180).
 *
 * La boîte annonçait « Version de développement » partout, production
 * comprise. Or une installation sur site ne reçoit que les versions dont le
 * PAQUET est antérieur à sa fin de maintenance (`sur-site/licence-signee.ts`) ·
 * sans la date du paquet à l'écran, le client ne peut pas dire ce qu'il a.
 *
 * Les trois valeurs viennent de `vite.config.ts`. Lues par `typeof`, jamais
 * directement · un lanceur de tests qui ne les définit pas lèverait sinon.
 */
// Posés par `vite.config.ts` · déclarés ICI et non dans vite-env.d.ts, que le
// jest de la racine ne lit pas en vérifiant les types de ce module.
declare const __OMEGAX_VERSION__: string | null | undefined;
declare const __OMEGAX_COMMIT__: string | null | undefined;
declare const __OMEGAX_CONSTRUIT_LE__: string | undefined;

export interface IdentiteConstruction {
  version: string | null;
  commit: string | null;
  construitLe: string | null;
}

export function identiteConstruction(): IdentiteConstruction {
  return {
    version: typeof __OMEGAX_VERSION__ !== 'undefined' ? __OMEGAX_VERSION__ : null,
    commit: typeof __OMEGAX_COMMIT__ !== 'undefined' ? __OMEGAX_COMMIT__ : null,
    construitLe: typeof __OMEGAX_CONSTRUIT_LE__ !== 'undefined' ? __OMEGAX_CONSTRUIT_LE__ : null,
  };
}

/**
 * La ligne affichée · ce qui manque est DIT (« révision non renseignée »),
 * jamais remplacé, et la date du paquet sur site s'ajoute quand le poste la
 * connaît.
 */
export function ligneVersion(c: IdentiteConstruction, datePaquetSurSite?: string | null): string {
  const morceaux = [
    c.version ? `Version ${c.version}` : 'Version non renseignée',
    c.commit ? `révision ${c.commit}` : 'révision non renseignée (construction locale)',
  ];
  if (c.construitLe) morceaux.push(`construite le ${c.construitLe}`);
  if (datePaquetSurSite) morceaux.push(`paquet sur site du ${datePaquetSurSite}`);
  return `${morceaux.join(' · ')}.`;
}
