// FICHIER ENGENDRÉ par client/scripts/engendrer-marque.py · ne pas modifier à la main.
//
// La géométrie de la marque OmegaX, partagée par l'interface et par les
// icônes de la PWA. Deux dessins tenus séparément divergent toujours.

export const MARQUE = {
  /** Le repère du tracé · toutes les valeurs ci-dessous y sont exprimées. */
  viewBox: '0 0 64 64',
  /** L'arche · un trait d'épaisseur constante, à bouts ronds. */
  arche: 'M 41.64 45.96 A 16.80 16.80 0 1 0 22.36 45.96',
  archeTrait: 8.40,
  /** Les deux pieds · des barres à arêtes vives, séparées par le vide central. */
  pieds: [
    { x: 7.00, y: 43.60, largeur: 19.80, hauteur: 9.20 },
    { x: 37.20, y: 43.60, largeur: 19.80, hauteur: 9.20 },
  ],
  /** Le carré d'encre, quand la marque est posée sur son fond. */
  encre: '#142f6b',
  /** Rayon des coins du carré, dans le même repère. */
  rayonCarre: 14,
} as const;
