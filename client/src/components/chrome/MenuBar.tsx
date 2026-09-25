import { useEffect, useRef, useState } from 'react';
import {
  coteSousMenu,
  estGroupe,
  lignesDuMenu,
  type MenuDef,
  type MenuEntreeDef,
  type MenuGroupeDef,
  type MenuItemDef,
} from './menu-groupes';

// Les types du menu vivent dans `menu-groupes.ts` (un module sans JSX, donc
// exécutable par le jest de la racine) · ils continuent de s'importer d'ici,
// puisque c'est le composant que les écrans connaissent.
export type { MenuDef, MenuEntreeDef, MenuGroupeDef, MenuItemDef };

/**
 * UNE MÉDIA-REQUÊTE SUIVIE EN DIRECT · la fenêtre du navigateur peut changer
 * de taille pendant qu'un menu est ouvert, et le mode doit suivre.
 */
function useMedia(requete: string): boolean {
  const lire = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(requete).matches;
  const [vrai, setVrai] = useState(lire);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(requete);
    const suivre = () => setVrai(mq.matches);
    suivre();
    mq.addEventListener?.('change', suivre);
    return () => mq.removeEventListener?.('change', suivre);
  }, [requete]);
  return vrai;
}

/**
 * DÉLAIS DU SURVOL, calqués sur Windows 11.
 *  · OUVERTURE d'un menu depuis la barre au repos : un court délai, pour
 *    qu'un pointeur qui TRAVERSE la barre en descendant vers une fenêtre
 *    n'ouvre pas un menu au passage ;
 *  · passage d'un menu ouvert à son voisin : immédiat ;
 *  · SOUS-MENU : il s'ouvre et se ferme après une courte pause, ce qui
 *    laisse le pointeur couper en diagonale vers le sous-menu sans que le
 *    groupe survolé en chemin ne le remplace ;
 *  · FERMETURE quand le pointeur quitte le menu : différée, pour pardonner
 *    une sortie de quelques pixels.
 */
const DELAI_OUVERTURE_MS = 90;
const DELAI_SOUS_MENU_MS = 140;
const DELAI_FERMETURE_MS = 320;

/** Chevron du sous-menu · tracé, pour ne dépendre d'aucune police. */
function Chevron({ vers }: { vers: 'droite' | 'bas' }) {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-text-dim">
      <path
        d={vers === 'droite' ? 'M3.5 1.8 6.8 5 3.5 8.2' : 'M1.8 3.5 5 6.8 8.2 3.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Une commande du menu · en retrait lorsqu'elle appartient à un groupe replié (écran étroit). */
function CommandeMenu({
  item,
  retrait,
  apresClic,
  auSurvol,
}: {
  item: MenuItemDef;
  retrait: boolean;
  apresClic: () => void;
  auSurvol?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onMouseEnter={auSurvol}
      onClick={() => {
        if (item.disabled) return;
        item.onClick?.();
        apresClic();
      }}
      // `pl-[27px]` n'est pas un retrait décoratif · c'est l'abscisse du titre
      // de groupe (px-3 = 12 px, chevron 10 px, gap 5 px), si bien qu'une
      // commande repliée se lit à l'aplomb du titre qui la contient.
      className={`w-full flex items-center text-left rounded-[3px] ${
        retrait ? 'pl-[27px] pr-3' : 'px-3'
      } h-[30px] text-[12px] hover:enabled:bg-chrome-alt focus-visible:bg-chrome-alt outline-none disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span className="min-w-0 truncate">{item.label}</span>
    </button>
  );
}

/**
 * Barre de menus (Fichier / Structure / Traitement / État / ...), dans la
 * forme d'un logiciel Windows 11 :
 *  · le SURVOL d'un titre ouvre son menu, sans clic (demande de Manasse du
 *    2026-09-23). Le clic l'ouvre aussi, pour les écrans tactiles, qui n'ont
 *    pas de survol ;
 *  · un groupe ouvre un SOUS-MENU à droite de son titre, comme le « Nouveau »
 *    du clic droit de Windows · et non plus un repli vers le bas, qui
 *    rallongeait le panneau ;
 *  · Échap, un clic dehors, ou la sortie du pointeur referment.
 *
 * Chaque menu ne contient QUE des commandes réelles · pas d'items « à venir »
 * ni de menus vides, un logiciel fini ne montre pas ses chantiers.
 */
export function MenuBar({
  menus,
  avant,
  apres,
}: {
  menus: MenuDef[];
  /** Commandes posées AVANT les menus (navigation). */
  avant?: React.ReactNode;
  /** Commandes posées à l'extrémité droite de la ligne (calculette). */
  apres?: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  // UN SEUL groupe ouvert à la fois, en sous-menu comme en repli · voir
  // `lignesDuMenu`. Un état qui porterait une collection laisserait rouvrir
  // les six groupes du menu « État » d'un coup.
  const [groupeDeplie, setGroupeDeplie] = useState<string | null>(null);
  const [cote, setCote] = useState<'droite' | 'gauche'>('droite');
  const ref = useRef<HTMLDivElement>(null);
  const refPanneau = useRef<HTMLDivElement>(null);
  const minuterie = useRef<number | undefined>(undefined);
  const minuterieSous = useRef<number | undefined>(undefined);

  // Sous-menus volants au-delà de 640 px ; repli dans le panneau en deçà.
  const volant = useMedia('(min-width: 640px)');
  // Ouverture au survol seulement là où le survol EXISTE · sur un écran
  // tactile, un « survol » est émis au toucher, juste avant le clic : il
  // ouvrirait le menu, et le clic qui suit le refermerait aussitôt.
  const survolable = useMedia('(hover: hover) and (pointer: fine)');

  const annuler = () => window.clearTimeout(minuterie.current);
  const annulerSous = () => window.clearTimeout(minuterieSous.current);
  const fermer = () => {
    annuler();
    annulerSous();
    setOuvert(null);
  };

  // Refermer ou changer de menu referme ses groupes · le menu se rouvre
  // replié, dans l'état où il tient à l'écran.
  useEffect(() => setGroupeDeplie(null), [ouvert]);

  // Le côté du sous-menu se décide à l'ouverture du panneau, sur sa position
  // réelle à l'écran (voir `coteSousMenu`).
  useEffect(() => {
    if (!ouvert || !refPanneau.current) return;
    setCote(coteSousMenu(refPanneau.current.getBoundingClientRect().right, window.innerWidth));
  }, [ouvert]);

  useEffect(() => {
    const onClicDehors = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer();
    };
    const onEchap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    document.addEventListener('mousedown', onClicDehors);
    document.addEventListener('keydown', onEchap);
    return () => {
      document.removeEventListener('mousedown', onClicDehors);
      document.removeEventListener('keydown', onEchap);
      annuler();
      annulerSous();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const survolerTitre = (titre: string) => {
    if (!survolable) {
      // Sans survol, on garde le geste de Windows classique : un menu déjà
      // ouvert suit le doigt ou le stylet d'un titre à l'autre.
      if (ouvert && ouvert !== titre) setOuvert(titre);
      return;
    }
    annuler();
    if (ouvert) setOuvert(titre);
    else minuterie.current = window.setTimeout(() => setOuvert(titre), DELAI_OUVERTURE_MS);
  };

  const quitterBarre = () => {
    if (!survolable) return;
    annuler();
    minuterie.current = window.setTimeout(() => setOuvert(null), DELAI_FERMETURE_MS);
  };

  const ouvrirGroupeApres = (titre: string | null) => {
    annulerSous();
    minuterieSous.current = window.setTimeout(() => setGroupeDeplie(titre), DELAI_SOUS_MENU_MS);
  };

  /** Mode large · le panneau garde sa hauteur, le groupe sort sur le côté. */
  const rendreVolant = (items: MenuEntreeDef[]) =>
    items.map((entree, i) => {
      if (estGroupe(entree) && entree.items.length === 0) return null;
      // Deux groupes qui se suivent ne sont plus séparés d'un trait : chacun
      // tient désormais sur UNE ligne, et le trait qui délimitait une famille
      // dépliée rayait le panneau à chaque rang.
      const precedent = items[i - 1];
      const entreDeuxGroupes = estGroupe(entree) && precedent !== undefined && estGroupe(precedent);
      const trait = entree.separateurAvant && !entreDeuxGroupes && <div className="my-1 mx-2 border-t border-border" />;
      if (!estGroupe(entree)) {
        return (
          <div key={`${entree.label}-${i}`}>
            {trait}
            <CommandeMenu item={entree} retrait={false} apresClic={fermer} auSurvol={() => ouvrirGroupeApres(null)} />
          </div>
        );
      }
      const deplie = groupeDeplie === entree.titre;
      return (
        <div key={`${entree.titre}-${i}`} className="relative">
          {trait}
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={deplie}
            data-groupe-menu
            onMouseEnter={() => ouvrirGroupeApres(entree.titre)}
            onClick={() => {
              annulerSous();
              setGroupeDeplie(entree.titre);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault();
                setGroupeDeplie(entree.titre);
              }
            }}
            className={`w-full flex items-center gap-2 text-left rounded-[3px] px-3 h-[30px] text-[12px] outline-none focus-visible:bg-chrome-alt ${
              deplie ? 'bg-chrome-alt' : 'hover:bg-chrome-alt'
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{entree.titre}</span>
            <Chevron vers="droite" />
          </button>
          {deplie && (
            <div
              role="menu"
              aria-label={entree.titre}
              onMouseEnter={annulerSous}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') setGroupeDeplie(null);
              }}
              className={`anim-sous-menu ${
                cote === 'droite' ? 'sous-menu-droite' : 'sous-menu-gauche'
              } absolute top-[-5px] z-10 min-w-[232px] rounded-[4px] border border-border panneau-menu p-1`}
            >
              {entree.items.map((item, j) => (
                <div key={`${item.label}-${j}`}>
                  {item.separateurAvant && <div className="my-1 mx-2 border-t border-border" />}
                  <CommandeMenu item={item} retrait={false} apresClic={fermer} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });

  /** Écran étroit · le repli dans le panneau, une famille à la fois. */
  const rendreReplie = (items: MenuEntreeDef[]) =>
    lignesDuMenu(items, groupeDeplie).map((ligne, i) => {
      const entree = ligne.sorte === 'groupe' ? ligne.groupe : ligne.item;
      const cle = ligne.sorte === 'groupe' ? ligne.groupe.titre : ligne.item.label;
      const enRetrait = ligne.sorte === 'commande' && ligne.retrait;
      return (
        <div key={`${cle}-${i}`}>
          {/* Le trait d'un groupe se pose devant SON titre · une commande en
              retrait n'ouvre jamais une famille. */}
          {!enRetrait && entree.separateurAvant && <div className="my-1 mx-2 border-t border-border" />}
          {ligne.sorte === 'groupe' ? (
            <button
              type="button"
              aria-expanded={ligne.deplie}
              onClick={() => setGroupeDeplie(ligne.deplie ? null : ligne.groupe.titre)}
              className="w-full flex items-center gap-[5px] text-left rounded-[3px] px-3 h-[30px] text-[12px] font-semibold hover:bg-chrome-alt"
            >
              {/* La petite flèche dit dans quel sens le repli va, comme un
                  dossier de l'explorateur. `aria-hidden` : l'état est déjà
                  porté par `aria-expanded`. */}
              <span aria-hidden className="w-[10px] shrink-0 text-[10px] text-text-dim">
                {ligne.deplie ? '▾' : '▸'}
              </span>
              <span className="min-w-0 truncate">{ligne.groupe.titre}</span>
            </button>
          ) : (
            <CommandeMenu item={ligne.item} retrait={ligne.retrait} apresClic={fermer} />
          )}
        </div>
      );
    });

  return (
    <div
      ref={ref}
      onMouseLeave={quitterBarre}
      onMouseEnter={() => {
        // Revenir sur la barre ou le menu annule une fermeture en cours.
        if (ouvert) annuler();
      }}
      /*
        `relative z-40` n'est PAS décoratif · il corrige un menu qui s'ouvrait
        DERRIÈRE la fenêtre active. `backdrop-blur` créait un contexte
        d'empilement sur cette barre (il est retiré depuis le fond Mica, le
        z-index reste la garde si un effet de ce genre revient), et `will-change: transform` en crée un
        autre sur la fenêtre en dessous : deux contextes à z-index `auto`,
        donc à égalité, que seul l'ordre du DOM départageait · la fenêtre,
        écrite après, recouvrait le menu déroulé. La barre passe donc
        explicitement au-dessus (voir le `relative z-0` de <main> dans
        AppShell, qui borne l'autre côté).
      */
      /*
        `flex-wrap` + `min-h` plutôt qu'une hauteur figée : à 360 px, les huit
        titres de menus dépassent la largeur de l'écran. Sans retour à la
        ligne, la barre débordait et entraînait TOUTE l'application sur le
        côté. On ne peut pas s'en tirer par `overflow-x-auto` ici : un
        conteneur qui défile en X rogne aussi en Y, et les menus seraient
        coupés. 32 px : la hauteur d'une barre de commandes de Windows 11.
      */
      className="relative z-40 min-h-[32px] flex flex-wrap items-center gap-0.5 px-2 py-0.5 bg-surface border-b border-border shadow-[0_1px_2px_rgba(20,47,107,0.06)] select-none"
    >
      {avant}
      {menus.map((m) => (
        // `static` sous `sm` : le menu déroulé se cale alors sur la BARRE
        // et non sur son titre. Ancré au titre, un menu de droite (« État »,
        // « Fenêtre ») partait 103 px hors de l'écran à 360 px.
        // `self-stretch` et NON `h-full` : `height:100%` se mesure sur la
        // BARRE entière, si bien qu'une fois celle-ci repliée sur deux rangs
        // chaque titre réclamait le double de son rang. `align-self: stretch`
        // se mesure sur le RANG, ce qui est la mesure voulue dans les deux cas.
        <div key={m.titre} className="static sm:relative self-stretch flex items-center">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={ouvert === m.titre}
            // Avec survol, le clic OUVRE et ne referme pas : le menu est déjà
            // ouvert par le survol quand le clic arrive, et un bascule le
            // refermerait sous le doigt de l'utilisateur.
            onClick={() => {
              annuler();
              setOuvert(survolable ? m.titre : ouvert === m.titre ? null : m.titre);
            }}
            onMouseEnter={() => survolerTitre(m.titre)}
            className={`rounded-[3px] px-2.5 h-[26px] text-[12px] transition-colors duration-100 ${
              ouvert === m.titre ? 'bg-sel-soft text-sel' : 'text-text/85 hover:bg-sel-soft hover:text-sel'
            }`}
          >
            {m.titre}
          </button>
          {ouvert === m.titre && (
            <div
              ref={refPanneau}
              role="menu"
              aria-label={m.titre}
              // En mode volant, le panneau ne défile pas : un conteneur qui
              // défile rogne tout ce qui en dépasse, sous-menu compris. Il
              // n'en a plus besoin, les groupes gardant sa hauteur fixe.
              className={`anim-menu absolute left-2 right-2 sm:left-0 sm:right-auto top-full mt-1 z-30 sm:min-w-[232px] rounded-[4px] border border-border panneau-menu p-1 ${
                volant ? '' : 'max-h-[calc(100dvh-64px)] overflow-y-auto'
              }`}
            >
              {volant ? rendreVolant(m.items) : rendreReplie(m.items)}
            </div>
          )}
        </div>
      ))}
      {apres && <div className="ml-auto flex items-center gap-0.5">{apres}</div>}
    </div>
  );
}
