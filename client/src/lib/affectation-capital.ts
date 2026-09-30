/**
 * LE LIBELLÉ DE LA CASE « CAPITAL » DE L'AFFECTATION SUIT LA RACINE SERVIE
 * (passe O1b, constat D4).
 *
 * Le serveur lit le capital là où la FORME le porte · 101 Capital social pour
 * une société, 102 Capital par dotation pour une entité publique, 103 Capital
 * personnel pour une entité individuelle (AUDCIF, Titre VII, exclusions du
 * compte 101 : « les apports de l'exploitant individuel → 103 […] les apports
 * non remboursables de la puissance publique → 102 »). L'écran écrivait
 * « Capital social (101) » en dur, si bien qu'une entreprise individuelle lisait
 * un capital social tiré de son 103, juste au-dessus du motif qui lui dit
 * qu'elle n'en a pas. Sans racine, il n'y a pas de case · un « 0,00 » étiqueté
 * 101 se lirait comme un capital nul.
 */
const LIBELLES: Record<string, string> = {
  '101': 'Capital social (101)',
  '102': 'Capital par dotation (102)',
  '103': 'Capital personnel (103)',
};

export function libelleCapitalAffectation(racine: string | null | undefined): string | null {
  if (!racine) return null;
  return LIBELLES[racine] ?? `Capital (${racine})`;
}
