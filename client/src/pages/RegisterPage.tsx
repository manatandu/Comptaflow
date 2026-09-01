import { AuthPage } from './AuthPage';

/**
 * /inscription reste une adresse valide (liens anciens, favoris) mais mène
 * à la même porte que /connexion : l'auto-inscription est FERMÉE (option A),
 * l'ouverture d'un dossier passe par VMG Consulting · le serveur refuse de
 * toute façon /auth/register.
 */
export function RegisterPage() {
  return <AuthPage />;
}
