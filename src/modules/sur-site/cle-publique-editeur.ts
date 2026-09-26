/**
 * LA CLÉ PUBLIQUE DE VMG CONSULTING · celle qui VÉRIFIE les licences sur
 * site. Elle ne sait pas signer, et sa publication ne coûte rien : c'est la
 * clé privée, gardée par VMG seul, qui signe.
 *
 * `null` TANT QUE MANASSE NE L'A PAS POSÉE · la paire se génère une seule
 * fois (voir docs/installation-sur-site.md, « Clés de licence »), la clé
 * privée va dans le secret de déploiement, la clé publique ici. Sans elle,
 * aucune licence ne se vérifie, et le paquet d'installation refuse de se
 * construire · une version sans clé installée chez un client ne s'ouvrirait
 * jamais.
 *
 * ELLE NE SE LIT JAMAIS DANS L'ENVIRONNEMENT · une clé réglable sur le poste
 * permettrait au client d'y poser la sienne et de se signer ses licences.
 */
export const CLE_PUBLIQUE_EDITEUR: string | null = null;
