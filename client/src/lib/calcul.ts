/**
 * Évalue une expression arithmétique (+ - * / parenthèses, décimales à la
 * virgule ou au point). Retourne null si l'expression est mal formée.
 *
 * Analyseur descendant récursif sur trois niveaux de priorité, écrit à la
 * main plutôt que confié à `eval` : une zone de saisie ne doit jamais devenir
 * un point d'exécution de code, même dans une application authentifiée. Le
 * seul jeu de caractères accepté est celui des chiffres et des cinq
 * opérateurs.
 */
export function evaluerExpression(entree: string): number | null {
  const texte = entree.replace(/\s/g, '').replace(/,/g, '.');
  if (!texte || !/^[0-9+\-*/().]+$/.test(texte)) return null;

  let i = 0;
  const finie = () => i >= texte.length;

  const nombre = (): number | null => {
    if (texte[i] === '(') {
      i++;
      const v = somme();
      if (v === null || texte[i] !== ')') return null;
      i++;
      return v;
    }
    if (texte[i] === '-') {
      i++;
      const v = nombre();
      return v === null ? null : -v;
    }
    const debut = i;
    while (!finie() && /[0-9.]/.test(texte[i])) i++;
    if (debut === i) return null;
    const v = Number(texte.slice(debut, i));
    return Number.isFinite(v) ? v : null;
  };

  const produit = (): number | null => {
    let gauche = nombre();
    if (gauche === null) return null;
    while (!finie() && (texte[i] === '*' || texte[i] === '/')) {
      const op = texte[i++];
      const droite = nombre();
      if (droite === null) return null;
      // Une division par zéro renverrait l'infini, qu'on reporterait ensuite
      // dans une zone de montant : mieux vaut refuser l'expression.
      if (op === '/' && droite === 0) return null;
      gauche = op === '*' ? gauche * droite : gauche / droite;
    }
    return gauche;
  };

  const somme = (): number | null => {
    let gauche = produit();
    if (gauche === null) return null;
    while (!finie() && (texte[i] === '+' || texte[i] === '-')) {
      const op = texte[i++];
      const droite = produit();
      if (droite === null) return null;
      gauche = op === '+' ? gauche + droite : gauche - droite;
    }
    return gauche;
  };

  const resultat = somme();
  if (resultat === null || !finie() || !Number.isFinite(resultat)) return null;
  return Math.round(resultat * 100) / 100;
}
