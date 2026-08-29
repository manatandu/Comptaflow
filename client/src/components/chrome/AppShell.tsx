import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';
import { IconLogo } from './icons';
import { MenuBar, type MenuDef } from './MenuBar';
import { Toolbar } from './Toolbar';
import { StatusBar } from './StatusBar';
import { AProposModale } from './AProposModale';

/**
 * L'espace de travail, calqué sur la fenêtre principale de Sage 100 i7 :
 *   barre de titre (dossier + exercice) → barre de menus → barre d'outils
 *   → fenêtre active → barre d'état.
 * Sage affiche le nom du fichier comptable et l'exercice dans la barre de
 * titres (« Le nouvel exercice s'affiche dans la barre de titres ») ; même
 * chose ici. Les menus reprennent la structure de Sage : Fichier (le dossier
 * et ses accès), Structure (les plans et codes), Traitement (le quotidien),
 * État (les éditions), Fenêtre, « ? ».
 */
export function AppShell() {
  const { utilisateur, estAdmin, seDeconnecter } = useAuth();
  const { exerciceCourant } = useExercice();
  const navigate = useNavigate();
  const location = useLocation();
  const [aProposOuvert, setAProposOuvert] = useState(false);

  const anneeExercice = exerciceCourant ? new Date(exerciceCourant.dateDebut).getFullYear() : null;

  const menus: MenuDef[] = [
    {
      titre: 'Fichier',
      items: [
        { label: 'Nouveau fichier comptable…', onClick: () => navigate('/') },
        // Sage : Fichier → Autorisations d'accès. La gestion des utilisateurs
        // est une commande du dossier, pas un « outil » à part.
        ...(estAdmin ? [{ label: "Autorisations d'accès (utilisateurs)", onClick: () => navigate('/utilisateurs') }] : []),
        { label: 'Fermer le dossier (déconnexion)', separateurAvant: true, onClick: seDeconnecter },
      ],
    },
    {
      titre: 'Structure',
      items: [
        { label: 'Plan comptable', onClick: () => navigate('/comptes') },
        { label: 'Plan des tiers', onClick: () => navigate('/tiers') },
        { label: 'Codes journaux', onClick: () => navigate('/journaux') },
        { label: 'Taux de taxes', onClick: () => navigate('/taux-tva') },
        { label: 'Bailleurs de fonds', separateurAvant: true, onClick: () => navigate('/bailleurs') },
        { label: 'Immobilisations', onClick: () => navigate('/immobilisations') },
      ],
    },
    {
      titre: 'Traitement',
      items: [
        { label: 'Saisie des journaux', onClick: () => navigate('/saisie') },
        // Interrogation d'un compte = son grand livre + son lettrage ; l'entrée
        // se fait par le plan comptable (bouton Interroger de chaque compte),
        // exactement comme le bouton « Gérer » de la fiche compte chez Sage.
        { label: 'Interrogation et lettrage', separateurAvant: true, onClick: () => navigate('/comptes') },
        { label: 'Rapprochement bancaire', onClick: () => navigate('/rapprochement') },
        { label: 'Registre des donateurs', separateurAvant: true, onClick: () => navigate('/registre-donateurs') },
        { label: "Fin d'exercice…", onClick: () => navigate('/exercice') },
      ],
    },
    {
      titre: 'État',
      items: [
        { label: 'Journal', onClick: () => navigate('/journal?onglet=journal') },
        { label: 'Grand livre des comptes', onClick: () => navigate('/journal?onglet=grand-livre') },
        { label: 'Balance des comptes', onClick: () => navigate('/journal?onglet=balance') },
        { label: 'Balance âgée', onClick: () => navigate('/balance-agee') },
        { label: 'États financiers', separateurAvant: true, onClick: () => navigate('/etats-financiers') },
        { label: 'Notes annexes', onClick: () => navigate('/notes-annexes') },
        { label: 'Documents obligatoires', onClick: () => navigate('/documents-obligatoires') },
        { label: 'Déclaration de TVA', separateurAvant: true, onClick: () => navigate('/declaration-tva') },
      ],
    },
    {
      titre: 'Fenêtre',
      items: [
        { label: 'Accueil', onClick: () => navigate('/') },
        { label: 'Tableau de bord', onClick: () => navigate('/tableau-de-bord') },
      ],
    },
    {
      titre: '?',
      items: [{ label: 'À propos de Compta Flow', onClick: () => setAProposOuvert(true) }],
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      {/* Barre de titre — dossier comptable ouvert + exercice, comme chez Sage. */}
      <div
        className="h-[26px] flex items-center justify-between px-2 text-white text-[11.5px] shrink-0"
        style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
      >
        <div className="flex items-center gap-2">
          <IconLogo width={14} height={14} />
          <span>
            Compta Flow — {utilisateur?.tenant.nom}
            {anneeExercice && ` — Exercice ${anneeExercice}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/75 text-[10.5px]">{utilisateur?.email}</span>
          <button onClick={seDeconnecter} className="text-white/85 hover:text-white text-[11px] px-1.5">
            Déconnexion
          </button>
        </div>
      </div>

      <MenuBar menus={menus} />
      <Toolbar />

      {/* La fenêtre active glisse en place à chaque changement de route
          (clé = pathname seul : changer d'onglet dans une même fenêtre ne
          la remonte pas et n'y perd donc aucun état). */}
      <main className="flex-1 min-h-0 overflow-auto">
        <div key={location.pathname} className="anim-fenetre min-h-full">
          <Outlet />
        </div>
      </main>

      <StatusBar />
      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}
    </div>
  );
}
