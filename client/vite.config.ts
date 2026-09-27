import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `tsc -b` compile ce fichier sans les types de Node (client/tsconfig.node.json
// n'en déclare pas) · sans cette déclaration, la construction du site tombe.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  // L'IDENTITÉ DE LA CONSTRUCTION (audit final F180) · « À propos » disait
  // « Version de développement » en production, alors que les versions sur
  // site sont bornées par la date du paquet. `npm run build` pose la version
  // du paquet, GitHub Actions le commit ; hors d'Actions, pas de commit, et
  // l'écran le dit au lieu d'en inventer un.
  define: {
    __OMEGAX_VERSION__: JSON.stringify(process.env.npm_package_version ?? null),
    __OMEGAX_COMMIT__: JSON.stringify(process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : null),
    __OMEGAX_CONSTRUIT_LE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  server: {
    port: 5173,
  },
  // LE RELAIS DES TESTS NAVIGATEUR · `vite preview` sert l'interface et relaie
  // /api vers le serveur, comme Firebase Hosting relaie oomega.web.app/api
  // vers Cloud Run. Le cookie de session est alors, comme en production, un
  // cookie de la page elle-même. Actif seulement si OMEGAX_API_RELAIS est posé.
  preview: process.env.OMEGAX_API_RELAIS
    ? { proxy: { '/api': { target: process.env.OMEGAX_API_RELAIS, changeOrigin: false } } }
    : undefined,
});
