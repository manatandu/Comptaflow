import { defineConfig, devices } from '@playwright/test';

/**
 * TESTS NAVIGATEUR · le client construit, servi, contre le serveur réel et
 * une base jetable. Les tests unitaires tournent sur des Prisma factices et
 * ne montent aucun écran : une fenêtre qui plante au rendu, une route qui
 * rend un 500 à la première lecture, un cookie qui ne voyage plus, rien de
 * tout cela ne rougit ailleurs.
 *
 * `OMEGAX_APP` et `OMEGAX_API` désignent le client et le serveur déjà
 * lancés (le workflow les démarre). `PW_CHROMIUM` permet de pointer un
 * Chromium déjà installé, sans téléchargement.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.e2e\.ts$/,
  // Un seul navigateur à la fois · les dossiers sont créés à la volée, et la
  // limitation de débit du serveur compte par adresse.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.OMEGAX_APP ?? 'http://localhost:4173',
    viewport: { width: 1366, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  // WEBKIT · le moteur de TOUS les navigateurs de l'iPhone. Sans lui, la panne
  // du 2026-09-26 (session jetée aussitôt ouverte) passait au vert sous Chrome.
  // Posé en CI par PW_WEBKIT ; en local, seulement si WebKit est installé.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    ...(process.env.PW_WEBKIT
      ? [{ name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 900 } } }]
      : []),
  ],
});
