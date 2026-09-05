/**
 * CE QUI EST REFUSÉ À L'ÉCRITURE, ET POURQUOI PAS À LA TROISIÈME TENTATIVE.
 *
 * Une adresse vide ou manifestement fausse ne devient pas juste en attendant.
 * Laissée entrer dans la file, elle consomme le plafond de tentatives, et son
 * erreur ne remonte que des heures plus tard, quand plus personne ne fait le
 * lien avec la relance décidée le matin. Le refus est donc posé au moment où
 * l'appelant tient encore le tiers, la pièce et le geste qui les a produits ·
 * c'est le seul moment où « adresse du tiers absente » désigne quelque chose
 * que quelqu'un peut corriger.
 *
 * LE CONTRÔLE RESTE GROSSIER, À DESSEIN. Aucune expression régulière ne dit
 * si une boîte aux lettres existe · seul le serveur destinataire le sait, et
 * c'est lui qui répondra. Ce qui est écarté ici, ce sont les seules fautes
 * qu'aucun serveur n'aurait l'occasion de signaler : le vide, l'absence
 * d'arobase, un domaine sans point, une espace au milieu. Refuser plus large
 * (interdire l'apostrophe, le signe plus, les accents) rejetterait des
 * adresses valides, et un logiciel qui refuse une adresse valide fait ressaisir
 * une adresse fausse.
 */

/** Longueur maximale d'une adresse acceptée · au-delà, c'est une pièce jointe collée dans le champ. */
const LONGUEUR_MAXIMALE = 254;

/** L'adresse telle qu'elle sera écrite en base et remise au transport. */
export function normaliserAdresse(brut: string | null | undefined): string {
  return (brut ?? '').trim();
}

export function adresseAcceptable(adresse: string): boolean {
  if (adresse.length === 0 || adresse.length > LONGUEUR_MAXIMALE) return false;
  // Une espace, une tabulation ou un retour à la ligne dans une adresse est
  // toujours une erreur de recopie · et un retour à la ligne dans un en-tête
  // de courriel est le moyen classique d'y injecter un second destinataire.
  if (/\s/.test(adresse)) return false;
  // La virgule et le point-virgule signent une LISTE glissée dans un champ qui
  // n'en attend qu'une. Acceptée telle quelle, elle partirait à deux tiers à
  // la fois, dont l'un n'a rien à voir avec la pièce.
  if (/[,;]/.test(adresse)) return false;

  const morceaux = adresse.split('@');
  if (morceaux.length !== 2) return false;
  const [locale, domaine] = morceaux;
  if (locale.length === 0 || domaine.length === 0) return false;

  // Un domaine sans point n'est pas joignable depuis l'extérieur du réseau ·
  // « comptable@intranet » se remet au serveur, qui le refusera toujours.
  if (!domaine.includes('.')) return false;
  if (domaine.startsWith('.') || domaine.endsWith('.') || domaine.includes('..')) return false;
  return true;
}
