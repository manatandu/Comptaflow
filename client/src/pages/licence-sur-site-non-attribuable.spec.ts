import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// AUCUN import de « vitest » ici, volontairement · convention du dépôt (voir
// chrome-etroit.spec.ts et calcul.spec.ts) : describe/it/expect arrivent par
// les globales, ce qui rend le fichier exécutable par les DEUX lanceurs. Le
// jest de la racine ramasse aussi client/src (clé `roots` de package.json), et
// les `.tsx` n'y étant ni transformés ni résolus, l'écran se vérifie sur sa
// SOURCE · le dépôt n'embarque ni jsdom ni bibliothèque de rendu.

/**
 * LA CONSOLE NE VEND PLUS LE SEUL TYPE DE LICENCE QUI VERROUILLE LE DOSSIER.
 *
 * `PlateformePage` offrait « Perpétuelle (sur site) » dans ses DEUX listes
 * déroulantes de licence : celle du nouveau cabinet client et celle du
 * changement de type. Or ce type exige un heartbeat que RIEN n'émet :
 * `LicenceService.evaluerLicence` refuse une licence PERPETUEL_ONPREMISE dont
 * le `dernierHeartbeatAt` est nul, et `grep -rn "enregistrerHeartbeat" src/`
 * ne rend que sa propre définition · ni route, ni tâche planifiée, ni client
 * sur site. Le mode sur site est une phase 4 (prisma/schema.prisma, enum
 * TypeLicence : « payé une fois, installé chez le client (Phase 4) »).
 *
 * Le défaut ne lève aucune erreur de type et ne casse aucun rendu : il se voit
 * seulement à l'usage, et TARD · le cabinet naissait complet (tenant, licence,
 * admin, plan de comptes, exercice) puis se faisait refuser sa PREMIÈRE
 * requête. Le serveur ferme désormais l'attribution aux deux portes
 * (`PlateformeService.creerCabinet` avant `register()`,
 * `PlateformeService.modifierLicence` avant toute lecture) ; ce fichier
 * vérifie que la console ne propose plus ce que le serveur refuse.
 *
 * Ce que la disparition de ces assertions ferait revenir : une liste qui rend
 * une erreur garantie, ou · aussi grave · le retrait SILENCIEUX de l'option,
 * qu'un opérateur venu la chercher lirait comme une panne de l'écran.
 */
const source = readFileSync(join(__dirname, 'PlateformePage.tsx'), 'utf8');

/** Le `<select>` qui porte ce setteur, balises comprises · le spec ne recopie
 *  pas les listes, il les déduit de la source. */
function selecteur(setteur: string): string {
  const ancre = source.indexOf(setteur);
  expect(ancre).toBeGreaterThan(-1);
  return source.slice(source.lastIndexOf('<select', ancre), source.indexOf('</select>', ancre) + 9);
}

/** Le paragraphe qui SUIT ce sélecteur · la ligne que lit l'opérateur, replis
 *  de mise en forme réduits pour que l'assertion ne dépende pas des retours à
 *  la ligne. */
function noteSous(setteur: string): string {
  const finSelect = source.indexOf('</select>', source.indexOf(setteur));
  return source.slice(finSelect, source.indexOf('</p>', finSelect)).replace(/\s+/g, ' ');
}

describe('console de plateforme · « Perpétuelle (sur site) » n’est plus proposée', () => {
  it('la création d’un cabinet client n’offre plus que les deux types livrables', () => {
    const select = selecteur('setTypeLicence(e.target.value');
    expect(select).toContain('value="ABONNEMENT"');
    expect(select).toContain('value="PERPETUEL_SAAS"');
    // `creerCabinet` refuse ce type AVANT `register()` : le proposer rendait
    // une erreur garantie, et l'avoir refusé APRÈS aurait laissé un cabinet
    // complet et inaccessible derrière elle.
    expect(select).not.toContain('PERPETUEL_ONPREMISE');
  });

  it('le changement de type ne l’offre plus, et l’option ne subsiste que pour AFFICHER un dossier qui la porte', () => {
    const select = selecteur('setLicType(e.target.value');
    expect(select).toContain('value="ABONNEMENT"');
    expect(select).toContain('value="PERPETUEL_SAAS"');
    // Retirer l'option sans condition aurait ouvert le sélecteur VIDE sur la
    // donnée réelle d'un dossier déjà attribué · elle reste donc rendue quand
    // c'est SA valeur, et seulement là.
    expect(select).toMatch(/licenceEnCours\.licence\?\.type === 'PERPETUEL_ONPREMISE' &&/);
    // Et elle se lit dans LIBELLE_LICENCE, la table de la colonne LICENCE :
    // deux libellés recopiés finiraient par diverger.
    expect(select).toContain('{LIBELLE_LICENCE.PERPETUEL_ONPREMISE}');
  });

  it('aucune option de ce type n’est SÉLECTIONNABLE, dans aucune des deux listes', () => {
    // La seule qui subsiste est un affichage · sans `disabled`, un opérateur
    // qui en serait sorti pourrait y revenir, et le PATCH serait refusé.
    expect([...source.matchAll(/<option value="PERPETUEL_ONPREMISE"[^>]*>/g)].map((m) => m[0])).toEqual([
      '<option value="PERPETUEL_ONPREMISE" disabled>',
    ]);
  });
});

describe('console de plateforme · le retrait n’est pas silencieux', () => {
  // Un opérateur qui cherchait la ligne et ne la trouve plus conclut à un bug
  // de l'écran et rouvre un ticket. Chaque sélecteur porte donc la raison.
  for (const [ecran, setteur] of [
    ['nouveau cabinet client', 'setTypeLicence(e.target.value'],
    ['changement de type', 'setLicType(e.target.value'],
  ] as const) {
    it(`le sélecteur du ${ecran} dit POURQUOI le mode sur site a disparu`, () => {
      const note = noteSous(setteur);
      // Le libellé exact qu'il cherchait · c'est à ça qu'il reconnaît sa ligne.
      expect(note).toContain('{LIBELLE_LICENCE.PERPETUEL_ONPREMISE}');
      // Un chantier daté, pas une suppression : le type reviendra.
      expect(note).toContain('phase 4');
      // La cause, telle que le serveur la constate.
      expect(note).toContain("rien n'émet encore la vérification en ligne");
      // Et la conséquence, qui justifie de fermer plutôt que de laisser faire.
      expect(note).toContain('refusé dès sa première requête');
      // Sans le repli nommé, l'opérateur qui voulait une licence sans échéance
      // repart sans solution.
      expect(note).toContain('{LIBELLE_LICENCE.PERPETUEL_SAAS}');
    });
  }

  it('un dossier qui porte DÉJÀ ce type s’entend dire comment en sortir', () => {
    // Le serveur refuse tout PATCH portant ce type, y compris sur un dossier
    // qui le porte déjà (PlateformeService.modifierLicence) : enregistrer sans
    // changer le type échouerait, et rien ne l'aurait annoncé.
    expect(noteSous('setLicType(e.target.value')).toContain('Ce dossier la porte encore');
  });
});

describe('console de plateforme · le type reste LISIBLE, c’est le choix qu’on retire', () => {
  it('la liste des licences sait toujours nommer un dossier attribué sur site', () => {
    const table = source.slice(
      source.indexOf('const LIBELLE_LICENCE'),
      source.indexOf('};', source.indexOf('const LIBELLE_LICENCE')),
    );
    // Sans cette entrée, la colonne LICENCE d'un dossier réel s'afficherait
    // VIDE · c'est le choix qu'on ferme, jamais l'affichage.
    expect(table).toContain("PERPETUEL_ONPREMISE: 'Perpétuelle (sur site)'");
    expect(source).toContain('LIBELLE_LICENCE[c.licence.type]');
  });

  it('l’énumération TypeScript garde les trois types, comme l’énumération Prisma', () => {
    // La donnée existe peut-être déjà en base, et la règle du heartbeat sera
    // juste en phase 4 : on ferme une porte, on ne démolit pas le type.
    expect(source).toContain("type TypeLicence = 'ABONNEMENT' | 'PERPETUEL_SAAS' | 'PERPETUEL_ONPREMISE';");
  });
});
