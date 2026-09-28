/**
 * SQUELETTE DE CHARGEMENT · la forme de ce qui arrive, plutôt qu'un mot.
 *
 * La classe `.squelette` existait (index.css) et ne servait qu'à quatre
 * endroits · le reste du logiciel écrivait « Chargement… » en gris, qui dit
 * qu'on attend sans dire quoi. Ces barres prennent la place des lignes à
 * venir, si bien que rien ne saute quand elles arrivent.
 *
 * Le mot reste, pour un lecteur d'écran · il est posé par l'appelant en
 * `sr-only` (des tests relisent « Chargement… » dans les pages, et c'est
 * bien ce que la page dit encore). Les barres, elles, sont `aria-hidden` :
 * une forme grise n'a rien à annoncer.
 *
 * Les largeurs varient d'une ligne à l'autre · des barres toutes égales se
 * lisent comme un tableau vide, pas comme du texte qui arrive.
 */
const LARGEURS = ['92%', '76%', '84%', '64%', '88%', '70%'];

export function LignesSquelette({ lignes = 3, hauteur = 10 }: { lignes?: number; hauteur?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="squelette" style={{ height: hauteur, width: LARGEURS[i % LARGEURS.length] }} />
      ))}
    </div>
  );
}
