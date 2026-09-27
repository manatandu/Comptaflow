import { estSurSite } from './mode-installation';

/**
 * COMBIEN DE RELAIS L'ADRESSE DU CLIENT TRAVERSE AVANT LE SERVEUR (audit
 * final F160) · c'est le réglage `trust proxy` d'Express, et c'est lui seul
 * qui décide de `requete.ip`.
 *
 * `X-Forwarded-For` se lit de DROITE À GAUCHE. Chaque relais AJOUTE, à la fin,
 * l'adresse qu'il a vue se connecter à lui ; tout ce qui précède a pu être
 * écrit par le client lui-même. La première entrée, que le journal d'audit
 * prenait, est donc celle que n'importe qui choisit.
 *
 * EN LIGNE, DEUX RELAIS · depuis le 2026-09-26, l'interface appelle
 * `oomega.web.app/api/**`, que Firebase Hosting relaie vers Cloud Run. Firebase
 * ajoute l'adresse du client, Cloud Run celle de Firebase. Avec UN saut de
 * confiance, `requete.ip` rendait l'adresse du relais Firebase · le journal
 * notait une adresse de Google pour tout le monde, et la limitation de débit
 * comptait tous les cabinets sur quelques adresses.
 *
 * CE QUE LE RÉGLAGE NE FERME PAS, et ce n'est pas du ressort du code · un appel
 * adressé DIRECTEMENT à l'adresse Cloud Run (`*.run.app`) ne traverse qu'un
 * relais, et la deuxième entrée à partir de la droite est alors celle du
 * client. Le fermer demande de n'admettre à Cloud Run que le trafic de
 * Firebase, ce qui se règle dans l'infrastructure.
 *
 * SUR SITE, AUCUN RELAIS · le serveur répond lui-même sur le réseau local.
 * Faire confiance à un relais qui n'existe pas rendrait l'adresse choisie par
 * le poste appelant.
 *
 * `SAUTS_PROXY_CONFIANCE` (entier, 0 compris) prime, pour un déploiement dont
 * la chaîne diffère. Une valeur illisible est refusée au démarrage plutôt
 * qu'ignorée · ignorée, elle rendrait en silence une adresse forgeable.
 */
export const SAUTS_EN_LIGNE = 2;

export function sautsDeConfiance(env: NodeJS.ProcessEnv = process.env): number {
  const declare = env.SAUTS_PROXY_CONFIANCE;
  if (declare !== undefined && declare.trim() !== '') {
    if (!/^\d+$/.test(declare.trim())) {
      throw new Error(`SAUTS_PROXY_CONFIANCE doit être un entier positif ou nul · « ${declare} » ne l'est pas.`);
    }
    return Number(declare.trim());
  }
  return estSurSite(env) ? 0 : SAUTS_EN_LIGNE;
}
