import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';
import { useFenetres } from '../../lib/fenetres';
import { definitionPour } from '../../lib/registre-fenetres';
import { fenetreDisponible } from '../../lib/referentiel-fenetre';
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
    // DIVISION SYCEBNL / SYSCOHADA · le point de passage OBLIGÉ de toute
    // ouverture. Cacher l'entrée de menu ne suffit pas : l'adresse se tape,
    // se colle depuis un courriel, ou reste dans l'historique du navigateur
    // après un changement de dossier. Une fenêtre propre à l'autre
    // référentiel n'ouvre donc pas · on retombe sur l'accueil plutôt que de
    // laisser une fenêtre vide ou, pire, un écran d'ASBL dans une SARL.
    //
    // Le serveur refuse déjà ces routes (ReferentielGuard) · c'est la même
    // défense en profondeur, prise du côté qui décide de ce qui s'affiche.
    if (!fenetreDisponible(def, utilisateur?.tenant.referentiel)) {
      navigate('/', { replace: true });
      return;
    }
    ouvrir(location.pathname + location.search, { titre: def.titre, titreCourt: def.titreCourt });
  }, [location.pathname, location.search, ouvrir, navigate, utilisateur?.tenant.referentiel]);

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
        // La création de dossiers passe par la console VMG (option A :
        // l'auto-inscription publique est fermée) · l'entrée n'existe que
        // pour l'opérateur de la plateforme, et mène à sa console.
        ...(utilisateur?.estOperateurPlateforme
          ? [{ label: 'Nouveau fichier comptable…', onClick: () => navigate('/plateforme') }]
          : []),
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
        // Console de l'opérateur de la plateforme (le cabinet exploitant) ·
        // invisible pour tout utilisateur ordinaire, et de toute façon
        // inaccessible : le serveur relit le drapeau en base à chaque requête.
        ...(utilisateur?.estOperateurPlateforme
          ? [{ label: 'Administration VMG Consulting', separateurAvant: true, onClick: () => navigate('/plateforme') }]
          : []),
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
        { label: 'Modèles de saisie', onClick: () => navigate('/modeles-saisie') },
        // Notion SYCEBNL (division 46) · masqué pour un dossier SYSCOHADA,
        // comme le registre des donateurs · le serveur refuse pareil.
        ...(estSycebnl
          ? [{ label: 'Bailleurs de fonds', separateurAvant: true, onClick: () => navigate('/bailleurs') }]
          : []),
        { label: 'Immobilisations', separateurAvant: !estSycebnl, onClick: () => navigate('/immobilisations') },
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
        // Geste ANNUEL, décidé par un organe · rangé avec les traitements de
        // fin d'exercice plutôt qu'avec la saisie courante.
        { label: 'Affectation du résultat', onClick: () => navigate('/affectation-resultat') },
        { label: 'Devises et réévaluation', onClick: () => navigate('/devises') },
        { label: 'Rappel et relevé', onClick: () => navigate('/relances') },
        ...(estSycebnl
          ? [{ label: 'Registre des donateurs', separateurAvant: true, onClick: () => navigate('/registre-donateurs') }]
          : []),
        { label: "Fin d'exercice…", onClick: () => navigate('/exercice') },
      ],
    },
    {
      // VINGT-DEUX ÉDITIONS, SIX REPLIS · le menu les déroulait d'un bloc, et
      // à 360 px cela ne tenait pas : le panneau s'ouvre sous une barre de
      // menus repliée sur deux rangs (≈ 82 px du haut de l'écran) alors que
      // sa hauteur est plafonnée à `100dvh - 64px` (MenuBar.tsx) · il finit
      // donc TOUJOURS une vingtaine de pixels sous le bord bas, et son défilé
      // interne n'y peut rien puisque l'application est en `h-screen`
      // `overflow-hidden`. Les dernières entrées, la fiscalité, étaient
      // matériellement inatteignables.
      //
      // Le repli se fait DANS le panneau, pas en sous-menu volant : un
      // panneau qui sortirait à droite de son titre reproduirait le même
      // défaut sur l'autre axe (voir menu-groupes.ts).
      //
      // Aucune promesse de disponibilité ne s'écrit dans ce menu, pas même en
      // commentaire : aiguillage-referentiel.spec.ts cherche la formule de
      // report mot pour mot dans tout le fichier (CLAUDE.md §4).
      titre: 'État',
      items: [
        // Sage range le tableau de bord dans l'Édition Pilotée, côté États ·
        // même logique ici : c'est une édition de synthèse, pas une fenêtre
        // de gestion. Il était dans le menu Fenêtre, où rien ne le justifiait.
        // Il reste une entrée DIRECTE, en tête et hors de tout groupe : c'est
        // la vue qu'on ouvre en arrivant, elle ne se mérite pas d'un dépliage.
        { label: 'Tableau de bord', onClick: () => navigate('/tableau-de-bord') },
        {
          // LE SEUL GROUPE QUI TIENNE D'UN TEXTE, et il faut le lire à la
          // lettre. AUDCIF art. 19 : « Les livres comptables et autres
          // supports dont la tenue est obligatoire sont : le livre-journal,
          // dans lequel sont inscrits les mouvements de l'exercice ; le
          // grand-livre, constitué par l'ensemble des comptes de l'entité, où
          // sont reportés compte par compte les différents mouvements de
          // l'exercice ; la balance générale des comptes, état récapitulatif
          // faisant apparaître à la clôture, pour chaque compte : le solde à
          // l'ouverture, le cumul des mouvements débiteurs et créditeurs
          // depuis l'ouverture, le solde à la date considérée ; le livre
          // d'inventaire […] ». Les TROIS PREMIERS tirets font ce groupe.
          //
          // Le quatrième n'y est pas : le livre d'inventaire ne se tient pas,
          // il TRANSCRIT les états financiers · il est servi par « Documents
          // obligatoires », dans le groupe « États financiers ».
          //
          // Le SYCEBNL n'y change rien pour les trois premiers : son art. 3
          // rend l'AUDCIF applicable aux entités à but non lucratif « à
          // l'exception des articles 5, 8, 10 à 13, 17 alinéas 7 et 8, 18,
          // 19 quatrième tiret, 21, […] », donc de ce seul quatrième tiret,
          // que son art. 14 réécrit (« Le livre d'inventaire est un document
          // obligatoire sur lequel sont transcrits : 1) pour les associations
          // et les ordres professionnels, le Bilan, le Compte de résultat et
          // le Tableau des flux de trésorerie de chaque exercice ainsi que le
          // résumé de l'opération d'inventaire ; […] »). Le Système comptable
          // lui-même reprend la liste à l'identique et y ajoute « le registre
          // des donateurs » (Partie 2, ch. 2, section 2), qui a sa place au
          // menu Traitement puisqu'on l'y alimente.
          //
          // Le BROUILLARD tient au groupe par le dernier alinéa du même
          // art. 19 : « L'établissement du livre-journal et du grand-livre
          // peut être facilité par la tenue de journaux et livres auxiliaires.
          // Dans ce cas, les totaux de ces supports sont périodiquement et au
          // moins une fois par mois centralisés dans le livre-journal et le
          // grand-livre » · c'est le support d'AVANT centralisation des trois
          // autres, pas un état de plus (voir BrouillardPage.tsx, qui calcule
          // le retard sur ce délai et sur celui du SYCEBNL, hebdomadaire).
          titre: 'Livres comptables',
          separateurAvant: true,
          items: [
            { label: 'Journal', onClick: () => navigate('/journal?onglet=journal') },
            { label: 'Grand livre des comptes', onClick: () => navigate('/journal?onglet=grand-livre') },
            { label: 'Balance des comptes', onClick: () => navigate('/journal?onglet=balance') },
            { label: 'Brouillard', onClick: () => navigate('/brouillard') },
          ],
        },
        {
          // Ce qu'on demande à un compte une fois qu'il est tenu : de quoi
          // son solde est fait, à qui il se rattache, depuis quand il dort.
          //
          // La balance âgée et l'échéancier de trésorerie restent deux états
          // jumeaux et complémentaires · la première recense le RETARD, le
          // second annonce ce qui VIENT, et Sage les distingue de la même
          // façon. Le repli porte désormais cette distinction, là où un
          // simple trait horizontal s'en chargeait : l'échéancier est passé
          // au groupe « Suivi et prévision », qui est son temps à lui.
          titre: 'Analyse des comptes',
          separateurAvant: true,
          items: [
            { label: 'Balance âgée', onClick: () => navigate('/balance-agee') },
            { label: 'Balance auxiliaire', onClick: () => navigate('/balance-auxiliaire') },
            { label: 'Justificatif de solde', onClick: () => navigate('/justificatif-solde') },
            { label: 'Évolution des soldes', onClick: () => navigate('/evolution-soldes') },
          ],
        },
        {
          // Les trois états qui regardent au-delà de la clôture : un plan
          // d'amortissement court sur les exercices suivants, un échéancier
          // annonce des flux, un budget se compare à son réalisé.
          titre: 'Suivi et prévision',
          separateurAvant: true,
          items: [
            { label: 'Immobilisations et amortissements', onClick: () => navigate('/tableaux-immobilisations') },
            { label: 'Échéancier de trésorerie', onClick: () => navigate('/echeancier') },
            { label: 'États analytiques et budgétaires', onClick: () => navigate('/etats-analytiques') },
          ],
        },
        {
          titre: 'Contrôle et révision',
          separateurAvant: true,
          items: [
            { label: 'Analyse et contrôles', onClick: () => navigate('/controles') },
            { label: 'Dossier de révision', onClick: () => navigate('/dossier-revision') },
            // Dossier mère d'un groupe d'établissements (une église et ses
            // cellules) · la balance agrégée du groupe est une édition du
            // siège. Le module est monté sur le plan SYCEBNL (canevas de
            // trésorerie et liasse combinée, cf. groupe.service.ts) et son
            // contrôleur est réservé à ce référentiel · le compte des
            // cellules ne suffit pas.
            ...(estSycebnl && (utilisateur?.tenant.nombreCellules ?? 0) > 0
              ? [{ label: 'Balance agrégée du groupe', onClick: () => navigate('/groupe') }]
              : []),
          ],
        },
        {
          // États financiers et Notes annexes servent les DEUX référentiels :
          // chaque fenêtre aiguille sur le référentiel du dossier et, pour un
          // dossier SYSCOHADA, sur son système (AUDCIF art. 11 · Système normal
          // ou Système minimal de trésorerie). Voir l'aiguillage en fin de
          // EtatsFinanciersPage.tsx et de NotesAnnexesPage.tsx · plus rien n'est
          // « en construction » derrière ces deux entrées.
          //
          // Les documents obligatoires ont d'abord été MASQUÉS pour un dossier
          // SYSCOHADA · non que le référentiel n'en exige pas (l'AUDCIF art. 19
          // impose le livre-journal, le grand-livre, la balance générale et le
          // livre d'inventaire, ce dernier transcrivant le Bilan, le Compte de
          // résultat et le Tableau des flux), mais parce que cette fenêtre-ci
          // était montée sur les seuls états et textes du SYCEBNL (art. 14 et
          // 16-3) : la montrer aurait imprimé à une entreprise les documents
          // d'une ASBL. Elle sert les deux référentiels depuis le 2026-09-02,
          // chaque document étant lu dans SON texte et aucun n'étant transposé
          // (voir correspondance-inventaire-syscohada.ts côté serveur et le
          // registre des fenêtres, d'où le filtre a été retiré) · l'entrée
          // n'est donc plus gardée.
          titre: 'États financiers',
          separateurAvant: true,
          items: [
            { label: 'États financiers', onClick: () => navigate('/etats-financiers') },
            { label: 'Notes annexes', onClick: () => navigate('/notes-annexes') },
            // Les deux référentiels · AUDCIF art. 19 pour le livre d'inventaire,
            // AUSCGIE art. 138 (ou AUSCOOP art. 108) pour le rapport de gestion.
            { label: 'Documents obligatoires', onClick: () => navigate('/documents-obligatoires') },
          ],
        },
        {
          titre: 'Fiscalité',
          separateurAvant: true,
          items: [
            { label: 'Déclaration de TVA', onClick: () => navigate('/declaration-tva') },
            // Une ASBL exonérée d'impôt sur les sociétés reste redevable de
            // tout ce qu'elle retient pour autrui, et de la déclaration même à
            // zéro · voir docs/fiscalite-asbl-rdc.md.
            { label: 'Retenues et échéancier fiscal', onClick: () => navigate('/retenues') },
            // Le pendant SYSCOHADA : une entreprise commerciale paie l'impôt
            // sur ses bénéfices, une ASBL en est exemptée (loi n° 23/053,
            // art. 5).
            ...(estSycebnl
              ? []
              : [{ label: 'Résultat fiscal et impôt sur les bénéfices', onClick: () => navigate('/fiscalite') }]),
            // Les facilités douanières de l'article 39 de la loi 004/2001 · un
            // arrêté prévisionnel périmé se découvre d'ordinaire au port.
            ...(estSycebnl
              ? [{ label: 'Exonérations douanières et fiscales', onClick: () => navigate('/exonerations') }]
              : []),
          ],
        },
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
    // `overflow-x-hidden` : garde-fou de dernier rang. Aucun élément du
    // chrome ne doit dépasser en largeur, mais si l'un le fait un jour, il
    // sera rogné au lieu d'emmener toute l'application sur le côté.
    <div className="h-screen flex flex-col bg-bg text-text overflow-x-hidden">
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
          {/*
            Le nom du logiciel et sa barre oblique s'effacent sous `sm` : à
            360 px ils prenaient 60 px sur les 360 disponibles et le nom du
            DOSSIER, seule information qui change d'un écran à l'autre,
            tombait à 38 px. Le logo à gauche continue de porter l'identité.
          */}
          <span className="hidden sm:inline font-semibold tracking-[0.01em]">OmegaX</span>
          <span className="hidden sm:inline text-white/25">/</span>
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
