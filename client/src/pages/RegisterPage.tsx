import { AuthPage } from './AuthPage';

/**
 * /inscription ouvre la même page d'ouverture, l'assistant de création de
 * dossier déjà déplié · l'URL reste valide pour un lien envoyé à quelqu'un
 * qui doit créer son dossier.
 */
export function RegisterPage() {
  return <AuthPage assistantInitial />;
}
