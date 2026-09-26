import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `tsc -b` compile ce fichier sans les types de Node (client/tsconfig.node.json
// n'en déclare pas) · sans cette déclaration, la construction du site tombe.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
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
