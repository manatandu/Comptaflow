/**
 * MODE D'INSTALLATION · le même serveur tourne à deux endroits.
 *
 * EN LIGNE (défaut) · Cloud Run, une base Neon, les dossiers de tous les
 * cabinets, l'interface servie par Firebase depuis une autre origine.
 *
 * SUR SITE (`MODE_INSTALLATION=SUR_SITE`) · la machine d'un client, sa propre
 * base, ses seuls dossiers, et l'interface servie par le serveur lui-même,
 * sur le réseau local et en http. Trois choses en changent, et trois
 * seulement : la licence (un fichier signé par VMG, jamais une ligne de
 * base), le cookie de session (même origine, pas de https), et le service de
 * l'interface. Aucune règle comptable ne lit ce mode · un dossier se tient
 * de la même façon chez le client et en ligne.
 */
export function estSurSite(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MODE_INSTALLATION === 'SUR_SITE';
}
