import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEXIQUE, entreeLexique, type CleLexique } from './lexique';

/**
 * LE LEXIQUE NE DOIT JAMAIS SERVIR LA DÉFINITION D'UN RÉFÉRENTIEL À L'AUTRE.
 *
 * Douze fenêtres sont communes aux deux référentiels, et toutes appelaient
 * `LEXIQUE[sujet]` en dur. Une entreprise lisait donc, dans la bulle « ? » de
 * son propre écran, que le compte 41 porte des adhérents, que les journaux se
 * centralisent chaque semaine, ou qu'on ne relance pas des clients mais des
 * membres pour une cotisation. Rien ne cassait : une définition fausse
 * s'affiche aussi bien qu'une vraie, et se recopie dans un rapport.
 *
 * Ce spec relie donc trois choses que rien ne reliait :
 *   1. le registre des fenêtres, qui dit quel écran est servi à quel
 *      référentiel (`referentielsApplicables`) ;
 *   2. les sujets `<Aide sujet="…" />` réellement posés dans chaque écran ;
 *   3. le texte de l'entrée que `entreeLexique` rendrait pour ce référentiel.
 *
 * Il lit les fichiers plutôt que de rendre les composants : ce qu'on vérifie
 * est une correspondance entre trois tables, pas un comportement de rendu.
 */

const RACINE = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf8');

/**
 * Écrans réservés au SYCEBNL, d'après le registre lui-même · leurs bulles
 * peuvent légitimement parler d'adhérents, de bailleurs ou de fonds affectés.
 * La liste est DÉDUITE et non recopiée : une fenêtre qui perdrait son filtre
 * doit faire tomber ce test, pas passer sous le radar.
 */
function pagesReservees(referentiel: 'SYCEBNL' | 'SYSCOHADA'): Set<string> {
  const registre = lire('lib/registre-fenetres.tsx');
  const reservees = new Set<string>();
  for (const bloc of registre.split(/\n  \{/)) {
    if (!bloc.includes(`referentielsApplicables: ['${referentiel}']`)) continue;
    for (const [, composant] of bloc.matchAll(/<(\w+Page)\b/g)) reservees.add(composant);
  }
  return reservees;
}

/**
 * L'AUTRE MOITIÉ DU CLOISONNEMENT, celle que le registre ne dit pas.
 *
 * Deux écrans (états financiers, notes annexes) sont ouverts aux deux
 * référentiels mais AIGUILLENT : la page `X` porte la branche SYCEBNL et
 * délègue à `XSyscohada` pour l'autre (CLAUDE.md § 6). Une page qui a un
 * jumeau `…SyscohadaPage` est donc, elle aussi, une page SYCEBNL.
 */
const aUnJumeauSyscohada = (fichier: string, tous: string[]) =>
  tous.includes(fichier.replace(/Page\.tsx$/, 'SyscohadaPage.tsx'));

/** Mots qui trahissent une définition SYCEBNL servie hors de son référentiel. */
const MOTS_SYCEBNL = [
  /SYCEBNL/i,
  /adhérent/i,
  /clients?-usagers?/i,
  /cotisation/i,
  /fonds affectés/i,
  /bailleur/i,
  /\bEBNL\b/,
  /but non lucratif/i,
  /contribution(s)? (volontaire|en nature)/i,
  /emplois-ressources/i,
  /exécution budgétaire/i,
];

/** Et l'inverse : rien de commercial ni de SYSCOHADA sur un écran SYCEBNL. */
const MOTS_SYSCOHADA = [/SYSCOHADA/i, /AUDCIF/i, /bénéfice imposable/i, /impôt sur les sociétés/i];

describe('lexique · aiguillage par référentiel', () => {
  const reservees = pagesReservees('SYCEBNL');
  const reserveesSyscohada = pagesReservees('SYSCOHADA');
  const pages = readdirSync(join(RACINE, 'pages')).filter((f) => f.endsWith('.tsx'));

  it('lit le registre des fenêtres, sinon tout le reste du fichier ment', () => {
    // Garde-fou du garde-fou : si le format du registre change, la liste
    // deviendrait vide et le test passerait sans rien vérifier.
    expect(reservees.size).toBeGreaterThanOrEqual(4);
    expect(reservees).toContain('BailleursPage');
    expect(reservees).toContain('RegistreDonateursPage');
  });

  it('ne sert aucune définition SYCEBNL dans une fenêtre ouverte au SYSCOHADA', () => {
    const fautifs: string[] = [];
    for (const fichier of pages) {
      const composant = fichier.replace(/\.tsx$/, '');
      if (reservees.has(composant) || aUnJumeauSyscohada(fichier, pages)) continue;
      // Un écran réservé au SYSCOHADA peut nommer le SYCEBNL POUR L'EN
      // DISTINGUER (« une entité à but non lucratif est exemptée », « ne pas
      // confondre ces seuils avec ceux du SYCEBNL ») : c'est le contraire
      // d'une définition empruntée.
      if (reserveesSyscohada.has(composant)) continue;
      const source = lire(join('pages', fichier));
      for (const [, cle] of source.matchAll(/sujet="(\w+)"/g)) {
        if (!(cle in LEXIQUE)) {
          fautifs.push(`${fichier} · sujet inconnu "${cle}"`);
          continue;
        }
        // Même raison pour une entrée native du SYSCOHADA : son suffixe dit
        // qu'elle a été écrite pour lui.
        if (cle.endsWith('Syscohada')) continue;
        const entree = entreeLexique(cle as CleLexique, 'SYSCOHADA');
        const texte = `${entree.titre} ${entree.texte} ${entree.source}`;
        for (const mot of MOTS_SYCEBNL) {
          if (mot.test(texte)) fautifs.push(`${fichier} · sujet "${cle}" · ${mot}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('ne sert aucune définition SYSCOHADA dans une fenêtre réservée au SYCEBNL', () => {
    const fautifs: string[] = [];
    for (const fichier of pages) {
      if (!reservees.has(fichier.replace(/\.tsx$/, ''))) continue;
      const source = lire(join('pages', fichier));
      for (const [, cle] of source.matchAll(/sujet="(\w+)"/g)) {
        const entree = entreeLexique(cle as CleLexique, 'SYCEBNL');
        const texte = `${entree.titre} ${entree.texte} ${entree.source}`;
        for (const mot of MOTS_SYSCOHADA) {
          if (mot.test(texte)) fautifs.push(`${fichier} · sujet "${cle}" · ${mot}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('rend le pendant SYSCOHADA dès qu’il existe, et l’entrée d’origine sinon', () => {
    // La convention est mécanique : `x` → `xSyscohada`. Elle n'a de valeur que
    // si elle est vraie de toutes les paires, pas seulement de celles qu'on a
    // en tête au moment d'écrire l'appel.
    for (const cle of Object.keys(LEXIQUE) as CleLexique[]) {
      if (cle.endsWith('Syscohada')) continue;
      const pendant = `${cle}Syscohada`;
      const attendu = pendant in LEXIQUE ? LEXIQUE[pendant as CleLexique] : LEXIQUE[cle];
      expect(entreeLexique(cle, 'SYSCOHADA')).toBe(attendu);
      // Sans référentiel connu (session non chargée), on ne bascule pas :
      // le SYCEBNL reste le référentiel par défaut du logiciel.
      expect(entreeLexique(cle, undefined)).toBe(LEXIQUE[cle]);
    }
  });

  it('cite une source dans chaque entrée, et le bon compte 41 de chaque côté', () => {
    for (const [cle, e] of Object.entries(LEXIQUE)) {
      expect(`${cle}: ${e.source.length > 8}`).toBe(`${cle}: true`);
    }
    // SYSCOHADA : le client va au 411 · le 412 y porte des effets à recevoir.
    expect(LEXIQUE.compte41Syscohada.texte).toContain('412 Clients, effets à recevoir en portefeuille');
    expect(LEXIQUE.compte41Syscohada.titre).toContain('Clients et comptes rattachés');
    // SYCEBNL : le 412 porte les clients-usagers.
    expect(LEXIQUE.compte41.titre).toContain('Adhérents');
  });
});
