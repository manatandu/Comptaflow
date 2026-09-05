import {
  BLOC,
  BLOC_BOITE,
  ENCRE,
  LOGOTYPE,
  LOGOTYPE_BOITE,
  RAYON_ICONE,
  SIGNE,
  SIGNE_BOITE,
} from './marque-geometrie';

/**
 * LA MARQUE OMEGAX.
 *
 * Signe et logotype sont servis en SVG EN LIGNE, jamais en `<img>` : ils
 * héritent ainsi de la couleur du texte, suivent le mode sombre sans seconde
 * version, et restent nets à l'impression d'un état. Leur géométrie vient de
 * `marque-geometrie.ts`, engendré par `scripts/engendrer-marque.py`, qui
 * produit aussi les fichiers de `public/` et les icônes de la PWA · un seul
 * dessin, tous les formats.
 *
 * ## LE MOT EST EN COURBES, ET C'EST TOUT LE POINT
 *
 * Une version antérieure composait « OmegaX » en TEXTE, à la police de
 * l'interface. C'était le seul endroit où OmegaX restait en deçà de toute
 * charte professionnelle : les quatorze chartes dépouillées FIXENT leur
 * logotype, aucune ne le laisse dépendre des polices installées sur le poste
 * du lecteur. Une police absente ferait rendre la marque dans une autre, et
 * une marque qui change de police n'est plus une marque.
 *
 * Le mot est donc figé en contours, tirés d'IBM Plex Sans SemiBold, approche
 * resserrée à -15/1000 d'em. C'est un TRACÉ, plus un texte : les écrans qui
 * doivent aussi ANNONCER le nom portent leur propre libellé accessible.
 *
 * ## CE QUE LE DESSIN VEUT DIRE
 *
 * L'oméga est la dernière lettre : en comptabilité, la CLÔTURE. Sa forme est
 * une arche posée sur deux pieds, et en partie double ces deux pieds sont le
 * débit et le crédit. Le VIDE qui les sépare n'est pas un intervalle
 * décoratif : c'est la ligne de partage du journal, et c'est lui qui fait lire
 * les deux pieds comme deux colonnes plutôt que comme deux pattes.
 *
 * ## RÈGLES D'EMPLOI · le détail est dans `docs/charte-omegax.md`
 *
 * Air minimal autour de la marque : la moitié de sa hauteur, de tous les
 * côtés. Taille minimale : 16 px de haut pour le signe seul, 18 px pour le
 * bloc. Ne jamais l'étirer, le pencher, lui ajouter une ombre portée, ni la
 * poser sur un fond qui n'offre pas 4,5:1 de contraste avec sa couleur.
 */

/** Rapport largeur/hauteur d'une boîte `viewBox` · sert à ne jamais déformer. */
function rapport(boite: string): number {
  const [, , l, h] = boite.split(' ').map(Number);
  return l / h;
}

/** Le signe seul · il prend la couleur héritée (`currentColor`). */
export function SymboleOmegaX({
  taille = 20,
  className,
}: {
  taille?: number;
  className?: string;
}) {
  return (
    <svg
      width={taille * rapport(SIGNE_BOITE)}
      height={taille}
      viewBox={SIGNE_BOITE}
      className={className}
      // Décoratif quand il accompagne le nom écrit à côté · le faire annoncer
      // deux fois est du bruit pour un lecteur d'écran.
      aria-hidden="true"
      focusable="false"
    >
      <path d={SIGNE} fill="currentColor" fillRule="nonzero" />
    </svg>
  );
}

/** Le signe en réserve sur son carré d'encre · l'icône, à l'écran. */
export function IconeOmegaX({ taille = 32, className }: { taille?: number; className?: string }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 1000 1000"
      className={className}
      role="img"
      aria-label="OmegaX"
    >
      <rect width="1000" height="1000" rx={RAYON_ICONE * 1000} fill={ENCRE} />
      <g transform={carreDuSigne()}>
        <path d={SIGNE} fill="#ffffff" fillRule="nonzero" />
      </g>
    </svg>
  );
}

/**
 * Le placement du signe dans le carré de l'icône.
 *
 * Il est recalculé ICI plutôt que servi par le fichier engendré, pour que
 * l'icône à l'écran et l'icône en fichier partent des mêmes deux constantes
 * (la boîte du signe, la marge). Deux placements écrits séparément divergent,
 * et l'écart ne se voit qu'une fois l'application installée.
 */
function carreDuSigne(): string {
  const [x, y, l, h] = SIGNE_BOITE.split(' ').map(Number);
  const MARGE = 0.155;
  const k = (1000 * (1 - 2 * MARGE)) / Math.max(l, h);
  return `translate(${(1000 - l * k) / 2 - x * k} ${(1000 - h * k) / 2 - y * k}) scale(${k})`;
}

/**
 * LE BLOC MARQUE · signe et mot dans leur rapport figé.
 *
 * C'est la composition principale, et la seule qui vaille identité complète.
 * Elle ne se recompose pas : le signe monte à 1,12 fois la hauteur de
 * capitale du mot, l'écart vaut 0,42 fois cette même hauteur, et les deux
 * s'alignent sur la ligne de pied. Ces trois nombres sont dans le script qui
 * engendre `BLOC` ; les changer ici ne changerait que l'affichage, pas les
 * fichiers remis à un imprimeur.
 */
export function BlocMarqueOmegaX({
  hauteur = 24,
  className,
}: {
  /** Hauteur totale du bloc en pixels, descendante du « g » comprise. */
  hauteur?: number;
  className?: string;
}) {
  return (
    <svg
      width={hauteur * rapport(BLOC_BOITE)}
      height={hauteur}
      viewBox={BLOC_BOITE}
      className={className}
      role="img"
      aria-label="OmegaX"
    >
      <path d={BLOC} fill="currentColor" fillRule="nonzero" />
    </svg>
  );
}

/**
 * LE LOGOTYPE SEUL · le mot, sans le signe.
 *
 * Sa place est là où le signe est DÉJÀ présent à côté (une pastille, une
 * barre de titre) : le répéter dans le bloc complet le ferait figurer deux
 * fois sur la même ligne. En dessous de 14 px de haut il cède la place au nom
 * composé en police de substitution · le « g » et le « a » s'empâtent avant.
 */
export function LogotypeOmegaX({
  hauteur = 18,
  className,
}: {
  /** Hauteur totale en pixels, descendante du « g » comprise. */
  hauteur?: number;
  className?: string;
}) {
  return (
    <svg
      width={hauteur * rapport(LOGOTYPE_BOITE)}
      height={hauteur}
      viewBox={LOGOTYPE_BOITE}
      className={className}
      role="img"
      aria-label="OmegaX"
    >
      <path d={LOGOTYPE} fill="currentColor" fillRule="nonzero" />
    </svg>
  );
}
