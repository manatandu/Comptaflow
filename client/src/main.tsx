import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

/*
 * DÉPLOIEMENT PENDANT UNE SESSION OUVERTE · les pages sont chargées à la
 * demande (chunks hachés) et Firebase ne sert plus ceux de la version
 * précédente : la première fenêtre jamais ouverte après un déploiement
 * recevrait un module introuvable. Vite signale cet échec par
 * `vite:preloadError` : on recharge alors l'application UNE fois (le
 * marqueur de session empêche toute boucle si le rechargement ne suffit
 * pas), ce qui ramène l'index.html neuf et ses chunks.
 */
window.addEventListener('vite:preloadError', (evenement) => {
  const CLE = 'omegax:rechargement-chunk';
  if (sessionStorage.getItem(CLE)) return; // déjà tenté · laisser l'erreur s'afficher
  sessionStorage.setItem(CLE, '1');
  evenement.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => sessionStorage.removeItem('omegax:rechargement-chunk'));

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
