import type { JeuEtatsFinanciersSycebnl, Referentiel } from './types';

/**
 * DOSSIERS RÉCENTS · l'équivalent du menu Fichier > Favoris de Sage 100.
 *
 * Le manuel Sage i7 écrit d'une ONG (Drive/Sage) décrit ainsi le retour de
 * l'utilisateur : « A la prochaine exécution du logiciel, l'utilisateur
 * procèdera à l'ouverture de son fichier comptable au nom et à l'emplacement
 * dans lequel il avait enregistré le fichier lors de sa création. Une fois le
 * logiciel exécuté, une fenêtre s'affiche demandant le nom de l'utilisateur
 * ainsi que son mot de passe. »
 *
 * Sage retrouve le fichier par son chemin sur le disque, et ses Favoris ne
 * sont qu'une liste de chemins. OmegaX est hébergé : il n'y a pas de chemin,
 * mais il y a le même besoin · ne pas redemander à quelqu'un qui revient de
 * quel dossier il s'agit.
 *
 * Ce que cette liste contient et ce qu'elle ne contient PAS : le nom du
 * dossier, l'adresse e-mail utilisée et la date de dernière ouverture.
 * Jamais de mot de passe, jamais de jeton. Elle vit dans le `localStorage`
 * de CE navigateur et ne quitte jamais l'appareil · elle ne dispense donc
 * d'aucune authentification, elle ne fait qu'éviter de retaper une adresse.
 */

const CLE = 'omegax.dossiers-recents';
const MAXIMUM = 5;

export interface DossierRecent {
  nom: string;
  email: string;
  referentiel?: Referentiel;
  jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl;
  /** ISO 8601 · sert au tri, le plus récent en tête. */
  derniereOuverture: string;
}

/**
 * Toute lecture du stockage peut lever : navigation privée, site data
 * bloqué, quota. Une porte d'entrée qui refuse de s'afficher parce que la
 * liste des favoris est illisible serait absurde · on rend une liste vide.
 */
export function lireDossiersRecents(): DossierRecent[] {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return [];
    const valeur: unknown = JSON.parse(brut);
    if (!Array.isArray(valeur)) return [];
    return valeur
      .filter((d): d is DossierRecent => {
        const o = d as Partial<DossierRecent>;
        return typeof o?.nom === 'string' && typeof o?.email === 'string' && typeof o?.derniereOuverture === 'string';
      })
      .sort((a, b) => b.derniereOuverture.localeCompare(a.derniereOuverture))
      .slice(0, MAXIMUM);
  } catch {
    return [];
  }
}

/** Un dossier ouvert remonte en tête · la clé d'unicité est l'adresse e-mail. */
export function memoriserDossier(dossier: Omit<DossierRecent, 'derniereOuverture'>): void {
  try {
    const autres = lireDossiersRecents().filter((d) => d.email !== dossier.email);
    const liste = [{ ...dossier, derniereOuverture: new Date().toISOString() }, ...autres].slice(0, MAXIMUM);
    localStorage.setItem(CLE, JSON.stringify(liste));
  } catch {
    // Sans stockage, la porte d'entrée reste celle d'un premier passage.
  }
}

export function oublierDossier(email: string): DossierRecent[] {
  try {
    const liste = lireDossiersRecents().filter((d) => d.email !== email);
    localStorage.setItem(CLE, JSON.stringify(liste));
    return liste;
  } catch {
    return [];
  }
}
