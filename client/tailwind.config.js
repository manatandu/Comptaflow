/**
 * Les couleurs de la charte que les écrans emploient en utilitaires. Chacune
 * a sa variable `--x` et son canal `--x-rgb` dans index.css.
 */
const COULEURS_CHARTE = [
  'chrome',
  'mica',
  'chrome-alt',
  'chrome-border',
  'chrome-text',
  'chrome-text-dim',
  'bg',
  'surface',
  'surface-alt',
  'border',
  'border-dark',
  'text',
  'text-dim',
  'sel',
  'sel-soft',
  'positive',
  'positive-soft',
  'warning',
  'warning-soft',
  'danger',
  'danger-soft',
];

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Pile système moderne · un logiciel installé doit ressembler au
        // système sur lequel il tourne, pas à une page web. `ui-sans-serif`
        // en tête prend la police d'interface native de chaque plateforme ;
        // Segoe UI Variable reste nommée pour Windows 11.
        // Segoe UI Variable EN TÊTE depuis le 2026-09-23 : derrière
        // `ui-sans-serif`, Chrome sous Windows prenait Segoe UI, la police de
        // Windows 10. Voir `body` dans index.css.
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Inter',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        // La police de la MARQUE. Le logotype est un tracé ; là où il tombe
        // sous son plancher de lisibilité (14 px), le nom « OmegaX » est
        // COMPOSÉ ici plutôt que tracé · même dessin, même approche, autre
        // technique. Le nom ne s'écrit jamais dans une autre police.
        marque: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Servie depuis notre origine depuis le 2026-09-05. Elle était nommée
        // ici depuis longtemps sans être chargée nulle part : chaque poste
        // retombait sur `ui-monospace`, et la promesse du code était fausse.
        // `font-mono` SUIT LA POLICE D'INTERFACE depuis le 2026-09-25 · Sage 100
        // affiche numéros de compte, codes et montants dans la police de
        // Windows, pas en chasse fixe (manuel de formation Sage Comptabilité,
        // captures de la saisie des journaux). Les chiffres restent alignés
        // par `tabular-nums`, posé sur `body`. IBM Plex Mono reste servie
        // (`public/polices`) pour la marque, qui ne l'emploie plus à l'écran.
        mono: [
          '"Segoe UI Variable Text"',
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Roboto',
          'Arial',
          'sans-serif',
        ],
      },
      /*
       * LES COULEURS DE LA CHARTE ACCEPTENT UNE OPACITÉ (2026-09-28).
       *
       * Écrites `var(--sel)`, elles ne l'acceptaient pas : Tailwind ne sait pas
       * décomposer une variable, et `border-danger/30`, `bg-warning/5`,
       * `border-border/40` ne produisaient AUCUNE règle. Silencieusement · plus
       * de cinq cents emplois dans les écrans, et les encadrés d'erreur
       * tombaient sur le gris par défaut de Tailwind au lieu de leur filet
       * rouge. Rien ne l'a jamais signalé, la page restait lisible.
       *
       * D'où les CANAUX `--x-rgb` posés dans index.css, lus en
       * `rgb(var(--x-rgb) / <alpha-value>)` · la syntaxe à barre oblique est
       * comprise depuis Chrome 65 et Safari 12.1, bien avant `color-mix`, dont
       * l'absence sur une vieille vue web aurait éteint TOUS les fonds d'un
       * coup. `canaux-couleurs.spec.ts` tient chaque canal égal à sa variable.
       *
       * LE TEXTE GARDE LA VARIABLE PLEINE (`textColor` plus bas) · une encre
       * adoucie par une opacité tomberait sous le plancher de contraste AA
       * mesuré au § 7.4 de la charte, sans que personne l'ait mesurée.
       */
      colors: Object.fromEntries(COULEURS_CHARTE.map((n) => [n, `rgb(var(--${n}-rgb) / <alpha-value>)`])),
      textColor: Object.fromEntries(COULEURS_CHARTE.map((n) => [n, `var(--${n})`])),
      borderRadius: {
        DEFAULT: '3px',
      },
      boxShadow: {
        plate: 'var(--ombre-plate)',
        posee: 'var(--ombre-posee)',
        flottante: 'var(--ombre-flottante)',
        dominante: 'var(--ombre-dominante)',
        focus: 'var(--anneau-focus)',
      },
      transitionTimingFunction: {
        sortie: 'var(--t-sortie)',
        ressort: 'var(--t-ressort)',
        doux: 'var(--t-doux)',
      },
    },
  },
  plugins: [],
};
