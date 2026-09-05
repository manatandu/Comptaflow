import { MARQUE } from './marque-geometrie';

/**
 * LA MARQUE OMEGAX.
 *
 * Le SYMBOLE est dessiné en SVG EN LIGNE, jamais servi en `<img>` : il hérite
 * ainsi de la couleur du texte, suit le mode sombre sans seconde version, et
 * reste net à l'impression d'un état. Sa géométrie vient de
 * `marque-geometrie.ts`, engendré par `scripts/engendrer-marque.py`, qui
 * produit aussi les icônes de la PWA · un seul dessin, tous les formats.
 *
 * LE MOT est composé en TEXTE, pas en courbes. Un logotype se trace
 * normalement en courbes, mais tracer six lettres à la main sans fonderie
 * donne des lettres approximatives, et une marque à lettres approximatives est
 * pire qu'une marque sans lettres. Composé en texte, le mot reste
 * sélectionnable, lisible par un lecteur d'écran, et net sur tout écran.
 *
 * ## CE QUE LE DESSIN VEUT DIRE
 *
 * L'oméga est la dernière lettre : en comptabilité, la CLÔTURE. Sa forme est
 * une arche posée sur deux pieds, et en partie double ces deux pieds sont le
 * débit et le crédit. Le VIDE qui les sépare n'est pas un intervalle décoratif :
 * sa largeur est posée, et c'est lui qui fait lire les deux pieds comme deux
 * colonnes de journal plutôt que comme deux pattes.
 *
 * ## RÈGLES D'EMPLOI
 *
 * Air minimal autour du symbole : la moitié de sa hauteur, de tous les côtés.
 * Taille minimale : 16 px de côté · en dessous, l'ouverture de l'arche se
 * referme et le signe devient une tache. Ne jamais l'étirer, le pencher, lui
 * ajouter une ombre portée, ni le poser sur un fond qui n'offre pas 4,5:1 de
 * contraste avec sa couleur.
 */

/** Le symbole seul · il prend la couleur héritée (`currentColor`). */
export function SymboleOmegaX({
  taille = 20,
  className,
}: {
  taille?: number;
  className?: string;
}) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox={MARQUE.viewBox}
      className={className}
      // Décoratif quand il accompagne le mot · le nom est déjà écrit à côté,
      // et le faire annoncer deux fois est du bruit pour un lecteur d'écran.
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={MARQUE.arche}
        fill="none"
        stroke="currentColor"
        strokeWidth={MARQUE.archeTrait}
        strokeLinecap="round"
      />
      {MARQUE.pieds.map((pied) => (
        <rect
          key={pied.x}
          x={pied.x}
          y={pied.y}
          width={pied.largeur}
          height={pied.hauteur}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

/** Le symbole sur son carré d'encre · usage sur fond clair. */
export function MarqueOmegaX({ taille = 32, className }: { taille?: number; className?: string }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox={MARQUE.viewBox}
      className={className}
      role="img"
      aria-label="OmegaX"
    >
      <rect width="64" height="64" rx={MARQUE.rayonCarre} fill={MARQUE.encre} />
      <path
        d={MARQUE.arche}
        fill="none"
        stroke="#ffffff"
        strokeWidth={MARQUE.archeTrait}
        strokeLinecap="round"
      />
      {MARQUE.pieds.map((pied) => (
        <rect key={pied.x} x={pied.x} y={pied.y} width={pied.largeur} height={pied.hauteur} fill="#ffffff" />
      ))}
    </svg>
  );
}

/**
 * LE BLOC MARQUE · symbole et mot, dans leur rapport figé.
 *
 * Le mot est en graisse 600 avec un interlettrage RESSERRÉ (-0,015 em) : à la
 * graisse d'un titre, l'espacement par défaut d'une police d'interface fait
 * flotter les lettres, et un mot qui flotte ne se lit pas comme une marque.
 * Le « X » final n'est pas mis en valeur · le nom se dit d'un seul tenant.
 */
export function BlocMarqueOmegaX({
  taille = 'moyen',
  surFonce = false,
  className,
}: {
  taille?: 'petit' | 'moyen' | 'grand';
  /** Vrai sur un bandeau sombre · le symbole passe alors en blanc. */
  surFonce?: boolean;
  className?: string;
}) {
  const mesures = {
    petit: { symbole: 18, texte: 'text-[13px]', ecart: 'gap-1.5' },
    moyen: { symbole: 26, texte: 'text-[18px]', ecart: 'gap-2' },
    grand: { symbole: 40, texte: 'text-[27px]', ecart: 'gap-2.5' },
  }[taille];

  return (
    <span className={`inline-flex items-center ${mesures.ecart} ${className ?? ''}`}>
      {surFonce ? (
        <SymboleOmegaX taille={mesures.symbole} className="text-white" />
      ) : (
        <MarqueOmegaX taille={mesures.symbole} />
      )}
      <span
        className={`font-semibold tracking-[-0.015em] leading-none ${mesures.texte} ${
          surFonce ? 'text-white' : 'text-text'
        }`}
      >
        OmegaX
      </span>
    </span>
  );
}
