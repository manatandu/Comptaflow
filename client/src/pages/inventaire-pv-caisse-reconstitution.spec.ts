import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LIGNE A10 · LE PV DE CAISSE À L'ÉCRAN.
 *
 * Ce qui casserait en silence. (1) Le solde comparé se saisissait, et le
 * serveur le figeait tel quel · il est LU par le serveur au livre-journal du
 * jour du comptage (fiche du compte 57) ; le corps envoyé porte exactement les
 * champs de la saisie du comptage. (2) Les PV établis doivent rester lisibles
 * après la clôture de la campagne, quand le bloc des caisses à compter
 * disparaît. (3) L'aperçu se lit AVANT d'établir, et le bouton attend sa
 * réponse. Les tests découpent la STRUCTURE (blocs équilibrés, littéral
 * d'objet), jamais une distance ni l'absence d'un mot (§ 10).
 */

const page = readFileSync(join(__dirname, 'InventairePage.tsx'), 'utf8');

/** Indice de la parenthèse, accolade ou crochet qui ferme celui ouvert en `debut`. */
function finDuBloc(texte: string, debut: number): number {
  let profondeur = 0;
  let chaine: string | null = null;
  for (let k = debut; k < texte.length; k++) {
    const c = texte[k];
    if (!chaine && c === '/' && texte[k + 1] === '/') {
      k = texte.indexOf('\n', k);
      continue;
    }
    if (chaine) {
      if (c === '\\') k++;
      else if (c === chaine) chaine = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') chaine = c;
    else if ('({['.includes(c)) profondeur++;
    else if (')}]'.includes(c)) {
      profondeur--;
      if (profondeur === 0) return k;
    }
  }
  throw new Error('bloc non refermé');
}

/**
 * Le corps d'une fonction de premier niveau de la page, de sa déclaration à
 * la déclaration de premier niveau suivante · les apostrophes du texte JSX
 * (« d'établir ») ne se laissent pas équilibrer comme du code.
 */
function corpsDe(nom: string): string {
  const debut = page.search(new RegExp(`^(export )?function ${nom}\\(`, 'm'));
  expect([`${nom} absente`, debut >= 0]).toEqual([`${nom} absente`, true]);
  const suite = page.slice(debut + 1).search(/^(export )?(function|const|type|interface) /m);
  return suite === -1 ? page.slice(debut) : page.slice(debut, debut + 1 + suite);
}

/** Les clés de premier niveau d'un littéral d'objet ouvert en `debut`. */
function clesDuLitteral(texte: string, debut: number): string[] {
  const corps = texte.slice(debut + 1, finDuBloc(texte, debut));
  const cles: string[] = [];
  let profondeur = 0;
  let segment = '';
  let chaine: string | null = null;
  for (const c of corps) {
    if (chaine) {
      segment += c;
      if (c === chaine) chaine = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') chaine = c;
    if ('({['.includes(c)) profondeur++;
    if (')}]'.includes(c)) profondeur--;
    if (c === ',' && profondeur === 0) {
      cles.push(segment);
      segment = '';
    } else segment += c;
  }
  if (segment.trim()) cles.push(segment);
  return cles.map((x) => x.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1] ?? `?${x.trim()}`);
}

describe('ligne A10 · le PV de caisse', () => {
  it('le corps envoyé porte exactement les champs de la saisie du comptage, jamais un solde', () => {
    const formulaire = corpsDe('FormulairePvCaisse');
    const appel = formulaire.indexOf('/pv-caisse`');
    expect(appel).toBeGreaterThan(0);
    const objet = formulaire.indexOf('{', appel);
    expect(clesDuLitteral(formulaire, objet).sort()).toEqual(
      [
        'attestationEtablieLe',
        'attestationPar',
        'compteId',
        'coupures',
        'dateComptage',
        'deviseId',
        'especesComptees',
        'heureComptage',
        'modeComparaison',
        'observations',
        'sousCommissionId',
      ].sort(),
    );
  });

  it('les PV établis se montrent HORS du bloc gardé « campagne non close »', () => {
    const garde = page.indexOf("{detail.statut !== 'CLOTUREE' && (");
    expect(garde).toBeGreaterThan(0);
    const finGarde = finDuBloc(page, garde);
    const appel = page.indexOf('<BlocPvCaisse');
    expect(appel).toBeGreaterThan(finGarde);
  });

  it('l’aperçu se lit avant d’établir, et le bouton attend une lecture favorable', () => {
    const formulaire = corpsDe('FormulairePvCaisse');
    expect(formulaire).toContain('/pv-caisse/apercu?');
    expect(formulaire).toContain('apercu?.lisible === true');
    expect(formulaire).toContain('<ApercuDuPv');
  });

  it('la reconstitution affiche les totaux figés, les espèces à la clôture et les mentions du serveur', () => {
    const pv = corpsDe('PvCaisse');
    for (const champ of [
      'pv.soldeALaCloture',
      'pv.mouvementsValeurAvantCloture',
      'pv.encaissementsPosterieurs',
      'pv.decaissementsPosterieurs',
      'pv.soldeComptableFige',
      'pv.especesReconstitueesALaCloture',
      'pv.reconstitutionManquante',
      'pv.mentions.map',
    ]) {
      expect([champ, pv.includes(champ)]).toEqual([champ, true]);
    }
  });

  it('l’écart se dit par un mot, et les dates du bloc se lisent en UTC', () => {
    expect(corpsDe('PvCaisse')).toContain('qualifierEcart(pv.ecart)');
    expect(corpsDe('qualifierEcart')).toContain("'manquant'");
    expect(corpsDe('qualifierEcart')).toContain("'excédent'");
    expect(page).toMatch(/const jourUtc = [^;]*timeZone: 'UTC'/);
  });

  it('les en-têtes du tableau des mouvements et les libellés de la reconstitution sont balisés', () => {
    const pv = corpsDe('PvCaisse');
    expect((pv.match(/<th scope="col"/g) ?? []).length).toBe(6);
    expect(pv).toContain('<th scope="row"');
    expect(corpsDe('ApercuDuPv')).toContain('<th scope="row"');
  });

  it('un échec de lecture des mouvements se dit, une liste tronquée et une discordance aussi', () => {
    const pv = corpsDe('PvCaisse');
    expect(pv).toContain('Mouvements illisibles');
    expect(pv).toContain('mouvements.tronque');
    expect(pv).toContain('mouvements.concorde === false');
    expect(pv).toContain('mouvements.saisiesDepuisLePv.nombre > 0');
  });

  it('une réponse pour une autre campagne est jetée', () => {
    const lireDetail = page.slice(page.indexOf('const lireDetail ='), page.indexOf('useEffect(', page.indexOf('const lireDetail =')));
    expect(lireDetail).toContain('campagneAffichee.current === id');
  });
});
