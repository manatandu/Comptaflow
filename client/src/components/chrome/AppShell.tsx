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
 *
 * PARTAGE DES RÔLES ENTRE LES SURFACES DE NAVIGATION, à tenir.
 *
 *   BARRE DE MENUS  · la carte complète du logiciel. Toute fenêtre s'y
 *                     trouve, et une seule fois. C'est le seul endroit qui
 *                     a vocation à être exhaustif.
 *   BARRE D'OUTILS  · les sept fenêtres du quotidien, à un clic, depuis
 *                     n'importe quel écran. Un raccourci, pas un sommaire :
 *                     tout ce qui n'est pas quotidien reste dans les menus.
 *   ACCUEIL         · où en est CE dossier et ce qui réclame une action.
 *                     Pas un lanceur · la barre d'outils, présente au-dessus
 *                     de lui, en est déjà un.
 *
 * La règle vient d'un défaut relevé à l'usage : « Journal » se trouvait à la
 * fois sur la page d'accueil, dans la barre d'outils juste au-dessus, et dans
 * le menu État. Trois chemins pour une même fenêtre, dont deux visibles en
 * même temps. La grille de raccourcis de l'accueil a été retirée (voir
 * AccueilPage), la barre d'outils et les menus se partageant désormais
 * clairement le travail : accès rapide d'un côté, exhaustivité de l'autre.
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
        // Sage : Fichier > Ouvrir. Ouvrir un autre fichier ferme d'abord le
        // fichier courant · ici, refermer le dossier c'est se déconnecter, et
        // la porte d'entrée présente ensuite les dossiers récents (l'équivalent
        // de Fichier > Favoris). Voir client/src/pages/AuthPage.tsx.
        {
          label: 'Ouvrir un autre dossier…',
          onClick: () => {
            seDeconnecter();
            navigate('/connexion');
          },
        },
        // Sage : Fichier → Autorisations d'accès. La gestion des utilisateurs
        // est une commande du dossier, pas un « outil » à part.
        ...(estAdmin ? [{ label: "Autorisations d'accès (utilisateurs)", onClick: () => navigate('/utilisateurs') }] : []),
        // Sage : Fichier → Importer. C'est par là qu'une association arrive
        // avec son tableur ou l'export de son logiciel précédent.
        ...(estAdmin ? [{ label: 'Importer des données…', separateurAvant: true, onClick: () => navigate('/import') }] : []),
        // Sage : Fichier → Mise en page / Format d'impression. Ici, une seule
        // commande : la boîte du navigateur, où « Enregistrer au format PDF »
        // produit le fichier à déposer chez un bailleur ou au greffe. Ce qui
        // s'imprime est exactement ce qui est à l'écran · aucun second moteur
        // de rendu, donc aucune divergence possible entre les deux.
        { label: 'Imprimer la fenêtre…', separateurAvant: true, onClick: () => window.print() },
        { label: 'Fermer le dossier (déconnexion)', separateurAvant: true, onClick: seDeconnecter },
      ],
    },
    {
      titre: 'Structure',
      items: [
        { label: 'Plan comptable', onClick: () => navigate('/comptes') },
        { label: 'Plan des tiers', onClick: () => navigate('/tiers') },
        // Sage : Structure → Plan analytique. Chez une EBNL, l'axe analytique
        // est celui des projets et des bailleurs · voir
        // docs/analytique-et-budget.md.
        { label: 'Plans analytiques', onClick: () => navigate('/plans-analytiques') },
        { label: 'Codes journaux', onClick: () => navigate('/journaux') },
        { label: 'Taux de taxes', onClick: () => navigate('/taux-tva') },
        { label: 'Bailleurs de fonds', separateurAvant: true, onClick: () => navigate('/bailleurs') },
        { label: 'Immobilisations', onClick: () => navigate('/immobilisations') },
        // Sage : Fichier > Paramètres société, où l'utilisateur « met à jour le
        // système comptable utilisé ». Ici les paramètres décisifs sont le
        // référentiel et le jeu d'états financiers SYCEBNL (associations et
        // ordres professionnels / projets de développement / Système minimal
        // de trésorerie), qui commandent toute la liasse · ils ont leur place
        // dans Structure, avec les autres éléments qui structurent le dossier.
        { label: 'Paramètres du dossier', separateurAvant: true, onClick: () => navigate('/parametres-dossier') },
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
        { label: 'Régularisations et abonnements', onClick: () => navigate('/regularisations') },
        { label: 'Devises et réévaluation', onClick: () => navigate('/devises') },
        { label: 'Rappel et relevé', onClick: () => navigate('/relances') },
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
        { label: 'Brouillard', onClick: () => navigate('/brouillard') },
        // Deux états jumeaux et complémentaires : la balance âgée recense le
        // RETARD, l'échéancier annonce ce qui VIENT. Sage les distingue de la
        // même façon.
        { label: 'Balance âgée', separateurAvant: true, onClick: () => navigate('/balance-agee') },
        { label: 'Échéancier de trésorerie', onClick: () => navigate('/echeancier') },
        { label: 'États analytiques et budgétaires', onClick: () => navigate('/etats-analytiques') },
        { label: 'Analyse et contrôles', separateurAvant: true, onClick: () => navigate('/controles') },
        { label: 'États financiers', separateurAvant: true, onClick: () => navigate('/etats-financiers') },
        { label: 'Notes annexes', onClick: () => navigate('/notes-annexes') },
        { label: 'Documents obligatoires', onClick: () => navigate('/documents-obligatoires') },
        { label: 'Déclaration de TVA', separateurAvant: true, onClick: () => navigate('/declaration-tva') },
        // Une ASBL exonérée d'impôt sur les sociétés reste redevable de tout
        // ce qu'elle retient pour autrui, et de la déclaration même à zéro ·
        // voir docs/fiscalite-asbl-rdc.md.
        { label: 'Retenues et échéancier fiscal', onClick: () => navigate('/retenues') },
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
      items: [{ label: "À propos d’OmegaX", onClick: () => setAProposOuvert(true) }],
    },
  ];

  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      {/*
        Barre de titre · elle porte l'identité du dossier ouvert, comme la
        barre de titres de Sage (« Le nouvel exercice s'affiche dans la barre
        de titres »). Fond sombre profond plutôt que le dégradé bleu d'antan :
        une barre sombre encadre l'espace de travail au lieu de rivaliser
        avec lui, et fait ressortir le blanc des fenêtres.
      */}
      <div
        className="ecran-seul h-[34px] flex items-center justify-between px-3 text-white text-[12px] shrink-0 relative"
        style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
      >
        {/* Filet lumineux en haut : la profondeur vient de là, pas d'une ombre. */}
        <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center justify-center w-[20px] h-[20px] rounded-[6px] bg-white/10">
            <IconLogo width={13} height={13} />
          </span>
          <span className="font-semibold tracking-[0.01em]">OmegaX</span>
          <span className="text-white/25">/</span>
          <span className="truncate text-white/85">{utilisateur?.tenant.nom}</span>
          {anneeExercice && (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-[1px] text-[10.5px] font-semibold text-white/80">
              Exercice {anneeExercice}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-white/55 text-[11px] hidden sm:inline">{utilisateur?.email}</span>
          <button
            onClick={seDeconnecter}
            className="rounded-[7px] px-2.5 py-[3px] text-[11px] font-semibold text-white/75 hover:bg-white/10 hover:text-white"
          >
            Déconnexion
          </button>
        </div>
      </div>

      <div className="ecran-seul contents">
        <MenuBar menus={menus} />
        <Toolbar />
      </div>

      {/*
        La fenêtre active glisse en place à chaque changement de route.
        Clé = pathname SEUL : changer d'onglet dans une même fenêtre ne la
        remonte pas et n'y perd donc aucun état de saisie. `will-change`
        prévient le compositeur pour que la transition parte sur la carte
        graphique dès la première image, sans le saut d'une frame.
      */}
      <main className="flex-1 min-h-0 overflow-auto">
        <div
          key={location.pathname}
          className="anim-fenetre min-h-full"
          style={{ willChange: 'transform, opacity' }}
        >
          <Outlet />
        </div>
      </main>

      <div className="ecran-seul contents">
        <StatusBar />
      </div>
      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}
    </div>
  );
}
