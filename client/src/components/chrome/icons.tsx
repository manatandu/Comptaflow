/**
 * Icônes SVG inline, tracé simple, cohérentes avec le canevas de design
 * validé — jamais d'emoji, jamais d'icon font.
 */
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'square' as const,
  ...props,
});

export const IconDashboard = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 13h6V4H4v9zM14 20h6V4h-6v16zM4 20h6v-4H4v4z" /></svg>
);
export const IconSaisie = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconComptes = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h10" /></svg>
);
export const IconJournal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4H6.5A2.5 2.5 0 004 6.5v13z" /></svg>
);
export const IconEtats = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 3v5h5M6 3h8l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-5.3M20 14a8 8 0 01-14 5.3" /></svg>
);
export const IconExport = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
);
export const IconPrint = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a1 1 0 011-1h16a1 1 0 011 1v5a1 1 0 01-1 1h-2M6 14h12v7H6z" /></svg>
);
export const IconFilter = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 5h16l-6 8v6l-4-2v-4z" /></svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
export const IconNew = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 6L9 17l-5-5" /></svg>
);
export const IconLogo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
);
