import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';
import { api } from '../lib/api';
import { porteInscription, type EtatSurSite, type PorteInscription } from '../lib/sur-site';

/**
 * /inscription · UNE PAGE, DEUX INSTALLATIONS (audit final F251).
 *
 * EN LIGNE, c'est une porte de service · aucun bouton de l'écran d'ouverture
 * n'y mène (l'auto-inscription publique est fermée), seul qui détient le lien
 * y accède, et le VRAI verrou reste au serveur : /auth/register refuse tant
 * qu'INSCRIPTION_PUBLIQUE n'est pas posée. VMG ouvre ce verrou le temps d'une
 * création accompagnée, puis le referme · l'assistant, lui, reste prêt.
 *
 * SUR SITE, c'est la porte du PREMIER dossier, et l'écran d'ouverture y
 * renvoie tant que le poste n'en a aucun (audit final F44) · le commentaire
 * qui la disait reliée à « aucun bouton » ne valait que pour la moitié des
 * installations. Une fois ce dossier né, le serveur refuse toute inscription
 * publique, les dossiers suivants naissant dans la fenêtre Restitution du
 * dossier d'installation. La page le dit alors au lieu de dérouler un
 * assistant entier voué au refus final. La règle est celle du lien
 * de l'écran d'ouverture (`porteInscription`, lib/sur-site.ts), pour que le
 * lien et la page ne divergent jamais.
 *
 * Une lecture de l'état qui échoue garde l'assistant · c'est la porte d'un
 * serveur en ligne d'avant la route (404), et partout ailleurs le serveur
 * reste celui qui refuse.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const [porte, setPorte] = useState<PorteInscription | null>(null);

  useEffect(() => {
    let vivant = true;
    api
      .get<EtatSurSite>('/sur-site/etat')
      .then((e) => vivant && setPorte(porteInscription(e)))
      .catch(() => vivant && setPorte({ mode: 'EN_LIGNE' }));
    return () => {
      vivant = false;
    };
  }, []);

  if (!porte) return <div className="min-h-screen bg-bg" />;

  if (porte.mode === 'SUR_SITE_FERMEE') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="w-full max-w-[460px] bg-surface border border-border px-5 py-4 text-[12px]">
          <p role="status">{porte.motif}</p>
          <a href="#/connexion" className="mt-3 inline-block text-[11.5px] underline">
            Retour à l'ouverture
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <NouveauFichierWizard onClose={() => navigate('/connexion')} onTermine={() => navigate('/parametres-dossier')} />
    </div>
  );
}
