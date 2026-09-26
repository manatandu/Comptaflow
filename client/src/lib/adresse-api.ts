/**
 * L'adresse de l'API. SUR SITE, l'interface est servie par le serveur
 * lui-même : l'API est à la MÊME origine, et l'adresse est vide (chemins
 * relatifs). Le paquet d'installation construit l'interface avec
 * `VITE_API_URL=meme-origine` plutôt qu'avec une chaîne vide, qu'un outil de
 * construction peut confondre avec une variable absente · on retomberait
 * alors sur localhost:3000, que le poste d'un client n'écoute pas.
 */
export function adresseApi(brute: string | undefined): string {
  if (brute === 'meme-origine') return '';
  return brute ?? 'http://localhost:3000';
}
