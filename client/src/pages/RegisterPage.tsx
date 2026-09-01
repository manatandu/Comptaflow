import { useNavigate } from 'react-router-dom';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';

/**
 * PORTE DE SERVICE · /inscription n'est reliée à AUCUN bouton de
 * l'interface (option A : l'auto-inscription publique est fermée). Seul qui
 * détient le lien y accède, et le VRAI verrou reste côté serveur :
 * /auth/register refuse tant qu'INSCRIPTION_PUBLIQUE n'est pas posée. VMG
 * ouvre ce verrou le temps d'une création accompagnée (son propre compte,
 * un cas particulier), puis le referme · l'assistant, lui, reste prêt.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-bg">
      <NouveauFichierWizard onClose={() => navigate('/connexion')} onTermine={() => navigate('/parametres-dossier')} />
    </div>
  );
}
