import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';
import { useFenetres } from '../../lib/fenetres';
import { definitionPour } from '../../lib/registre-fenetres';
import { IconLogo } from './icons';
import { MenuBar, type MenuDef } from './MenuBar';
import { CalculetteChrome, NavigationChrome } from './OutilsChrome';
import { StatusBar } from './StatusBar';
import { BarreFenetres } from './BarreFenetres';
import { Fenetre } from './Fenetre';
import { AccueilPage } from '../../pages/AccueilPage';
import { LimiteErreur } from './LimiteErreur';
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
 * ESPACE DE TRAVAIL MULTI-FENÊTRES (MDI), comme Sage · l'accueil n'est PAS
 * une page parmi d'autres : c'est le FOND de l'espace de travail, toujours
 * là, sur lequel les fenêtres s'ouvrent et se referment. Fermer la dernière
 * fenêtre ramène donc à l'accueil sans avoir à y naviguer · c'est ce que
 * fait Sage avec sa page IntuiSage.
 *
 * PARTAGE DES RÔLES ENTRE LES SURFACES DE NAVIGATION, à tenir.
 *
 *   BARRE DE MENUS  · la carte complète du logiciel. Toute fenêtre s'y
 *                     trouve, et une seule fois. C'est le seul endroit qui
 *                     a vocation à être exhaustif.
 *   BARRE D'OUTILS  · le retour/avance/accueil, puis les fenêtres du
 *                     quotidien à un clic. Un raccourci, pas un sommaire.
 *   ACCUEIL (fond)  · le lanceur par domaine ET l'état du dossier, à la
 *                     façon de la page IntuiSage de Sage.
 *   BARRE DES FENÊTRES · en bas, ce qui est ouvert · seule façon de
 *                     retrouver une fenêtre réduite.
 *
 * Le doublon relevé plus tôt (« Journal » à trois endroits visibles en même
 * temps) ne se reproduit pas ainsi : l'accueil est un FOND, jamais visible
 * en même temps qu'une fenêtre plein écran, là où l'ancienne grille de
 * raccourcis s'affichait sous la barre d'outils qui la répétait.
 */
export function AppShell() {
  const { utilisateur, estAdmin, seDeconnecter } = useAuth();
  // DIVISION SYCEBNL / SYSCOHADA · voir docs/plan-de-construction.md §8.
  // Absent tant que le dossier n'est pas chargé : rien de propre à un
  // référentiel ne s'affiche avant qu'on le connaisse.
  const estSycebnl = utilisateur?.tenant.referentiel === 'SYCEBNL';
  const { exerciceCourant } = useExercice();
  const navigate = useNavigate();
  const location = useLocation();
  const { fenetres, cleActive, ouvrir, fermerTout, reorganiser, actualiser } = useFenetres();
  const [aProposOuvert, setAProposOuvert] = useState(false);

  const anneeExercice = exerciceCourant ? new Date(exerciceCourant.dateDebut).getFullYear() : null;

  /**
   * L'URL COMMANDE L'OUVERTURE DES FENÊTRES.
   *
   * Chaque page continue d'appeler `navigate('/comptes')` comme avant : rien
   * à réécrire dans les trente écrans. C'est ici que le changement d'adresse
   * se traduit en ouverture (ou en remise au premier plan) d'une fenêtre.
   * L'URL reste ainsi l'adresse réelle de ce qu'on regarde · un lien collé
   * dans un courriel rouvre la bonne fenêtre.
   */
  useEffect(() => {
    if (location.pathname === '/') return; // l'accueil est le fond, pas une fenêtre
    const def = definitionPour(location.pathname);
    if (!def) return;
    ouvrir(location.pathname + location.search, { titre: def.titre, titreCourt: def.titreCourt });
  }, [location.pathname, location.search, ouvrir]);

  /**
   * … ET RÉCIPROQUEMENT : donner le premier plan à une fenêtre remet l'URL
   * sur son adresse. Sans ça, la barre d'adresse et la barre d'état
   * décriraient une fenêtre qu'on ne regarde plus.
   *
   * `precedenteCle` évite la boucle : on ne réécrit l'URL que lorsque la
   * fenêtre active CHANGE, jamais en réaction à l'effet ci-dessus (qui, lui,
   * se déclenche sur chaque changement d'URL).
   */
  const precedenteCle = useRef<string | null>(null);
  useEffect(() => {
    if (precedenteCle.current === cleActive) return;
    precedenteCle.current = cleActive;
    const cible = cleActive ? (fenetres.find((f) => f.cle === cleActive)?.adresse ?? '/') : '/';
    if (cible !== location.pathname + location.search) navigate(cible, { replace: true });
    // `fenetres` est volontairement hors dépendances : seule la BASCULE de
    // fenêtre active doit réécrire l'URL, pas chaque remaniement de la pile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleActive]);

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
        // La fenêtre s'ouvre directement, son sélecteur intégré désigne le
        // compte · passer par le plan comptable était un détour trompeur
        // (le menu « Lettrage » ouvrait une autre fenêtre que celle annoncée).
        { label: 'Interrogation et lettrage', separateurAvant: true, onClick: () => navigate('/lettrage') },
        { label: 'Rapprochement bancaire', onClick: () => navigate('/rapprochement') },
        { label: 'Régularisations et abonnements', onClick: () => navigate('/regularisations') },
        { label: 'Devises et réévaluation', onClick: () => navigate('/devises') },
        { label: 'Rappel et relevé', onClick: () => navigate('/relances') },
        ...(estSycebnl
          ? [{ label: 'Registre des donateurs', separateurAvant: true, onClick: () => navigate('/registre-donateurs') }]
          : []),
        { label: "Fin d'exercice…", onClick: () => navigate('/exercice') },
      ],
    },
    {
      titre: 'État',
      items: [
        // Sage range le tableau de bord dans l'Édition Pilotée, côté États ·
        // même logique ici : c'est une édition de synthèse, pas une fenêtre
        // de gestion. Il était dans le menu Fenêtre, où rien ne le justifiait.
        { label: 'Tableau de bord', onClick: () => navigate('/tableau-de-bord') },
        { label: 'Journal', separateurAvant: true, onClick: () => navigate('/journal?onglet=journal') },
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
        // Les facilités douanières de l'article 39 de la loi 004/2001 · un
        // arrêté prévisionnel périmé se découvre d'ordinaire au port.
        ...(estSycebnl
          ? [{ label: 'Exonérations douanières et fiscales', onClick: () => navigate('/exonerations') }]
          : []),
      ],
    },
    {
      // Sage : menu Fenêtre · Réorganiser, Actualiser (F5), puis la liste des
      // fenêtres ouvertes. Les commandes de personnalisation d'écran de Sage
      // (Personnaliser, Barre verticale, Modes) n'ont pas d'équivalent ici :
      // on ne met PAS d'entrée sans effet pour faire nombre, on grise comme
      // Sage grise · une commande inapplicable reste visible mais éteinte.
      titre: 'Fenêtre',
      items: [
        {
          label: 'Réorganiser (cascade)',
          disabled: fenetres.length === 0,
          onClick: reorganiser,
        },
        {
          label: 'Actualiser la fenêtre active',
          disabled: !cleActive,
          onClick: () => cleActive && actualiser(cleActive),
        },
        {
          label: "Tout fermer · revenir à l'accueil",
          disabled: fenetres.length === 0,
          onClick: fermerTout,
        },
        ...fenetres.map((f, i) => ({
          label: `${f.cle === cleActive ? '• ' : '\u2007\u2007'}${f.titre}`,
          separateurAvant: i === 0,
          onClick: () => navigate(f.adresse),
        })),
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
        className="ecran-seul h-[30px] flex items-center justify-between px-3 text-white text-[10.5px] shrink-0 relative"
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
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-[1px] text-[10px] font-semibold text-white/80">
              Exercice {anneeExercice}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-white/55 text-[10.5px] hidden sm:inline">{utilisateur?.email}</span>
          <button
            onClick={seDeconnecter}
            className="rounded-[7px] px-2.5 py-[3px] text-[10.5px] font-semibold text-white/75 hover:bg-white/10 hover:text-white"
          >
            Déconnexion
          </button>
        </div>
      </div>

      <div className="ecran-seul contents">
        {/* Une SEULE rangée de commandes · l'ancienne barre d'outils et ses
            dix verbes est supprimée (voir OutilsChrome.tsx), ce qui rend
            environ 44 px de hauteur à l'espace de travail. */}
        <MenuBar menus={menus} avant={<NavigationChrome />} apres={<CalculetteChrome />} />
      </div>

      {/*
        ESPACE DE TRAVAIL · l'accueil occupe le fond, en permanence ; les
        fenêtres se posent dessus, chacune à son rang d'empilement.
        `overflow-hidden` : une fenêtre déplacée près du bord ne doit pas
        faire défiler l'espace, elle doit être bornée (voir Fenetre.tsx).
      */}
      <main className="relative z-0 flex-1 min-h-0 overflow-hidden">
        <div className="absolute inset-0 overflow-auto">
          <LimiteErreur titreFenetre="Accueil">
            <AccueilPage />
          </LimiteErreur>
        </div>
        {fenetres.map((f) => (
          <Fenetre key={f.cle} fenetre={f} active={f.cle === cleActive} />
        ))}
      </main>

      <div className="ecran-seul contents">
        <BarreFenetres />
        <StatusBar />
      </div>
      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}
    </div>
  );
}
