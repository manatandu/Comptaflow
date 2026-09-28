import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { autoriserRechargement } from './lib/rechargement-chunk';

/*
 * DÉPLOIEMENT PENDANT UNE SESSION OUVERTE · les pages sont chargées à la
 * demande (chunks hachés) et Firebase ne sert plus ceux de la version
 * précédente : la première fenêtre jamais ouverte après un déploiement
 * recevrait un module introuvable. Vite signale cet échec par
 * `vite:preloadError` : on recharge alors l'application, ce qui ramène
 * l'index.html neuf et ses chunks. Un seul rechargement par fenêtre de temps,
 * tenu par un marqueur DATÉ de la session qui ne s'efface pas au chargement
 * (lib/rechargement-chunk.ts, audit final F246) · au-delà, l'erreur
 * s'affiche au lieu de relancer la page sans fin.
 */
window.addEventListener('vite:preloadError', (evenement) => {
  if (!autoriserRechargement(() => window.sessionStorage, Date.now())) return;
  evenement.preventDefault();
  window.location.reload();
});

/*
 * ENREGISTREMENT DU SERVICE WORKER · le seul geste qui rend l'application
 * installable. Il ne met rien en cache (voir public/sw.js) : il existe parce
 * qu'aucun navigateur ne propose l'installation sans lui.
 *
 * Enregistré APRÈS le `load` pour ne pas disputer la bande passante au premier
 * rendu, et l'échec est AVALÉ : un service worker qui ne s'enregistre pas
 * (navigateur ancien, contexte non sécurisé, réglage de l'utilisateur) ne doit
 * pas empêcher un comptable de travailler.
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
