/**
 * Saisie des fourchettes d'une nature de compte (point 14) · « 40 » ou
 * « 311-315 », séparées par des virgules. Le serveur revérifie tout
 * (comptes/natures-compte.ts).
 */
export function fourchettesEnTexte(f: { du: string; au: string }[]): string {
  return f.map((x) => (x.du === x.au ? x.du : `${x.du}-${x.au}`)).join(', ');
}
export function texteEnFourchettes(t: string): { du: string; au: string }[] {
  return t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [du, au] = s.split('-').map((x) => x.trim());
      return { du, au: au ?? du };
    });
}

