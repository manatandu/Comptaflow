import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'ORDRE DE VIREMENT À L'ÉCRAN · trois propriétés que rien d'autre ne
 * vérifie. On gèle ce que le code FAIT (l'ordre des appels dans le corps d'une
 * fonction, la classe posée sur le conteneur), jamais une distance en
 * caractères ni l'absence d'un mot.
 */
const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

/** Le corps d'une fonction fléchée `const nom = async (...) => { ... };`, par équilibrage des accolades. */
function corps(source: string, nom: string): string {
  const debut = source.indexOf(`const ${nom} = async`);
  expect(debut).toBeGreaterThan(-1);
  const ouverture = source.indexOf('{', source.indexOf('=>', debut));
  let profondeur = 0;
  for (let i = ouverture; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    if (source[i] === '}' && --profondeur === 0) return source.slice(ouverture, i + 1);
  }
  throw new Error(`corps de ${nom} introuvable`);
}

describe("l'ordre de virement à l'écran", () => {
  const ordres = lire('components/OrdresVirement.tsx');
  const reglements = lire('pages/ReglementsPage.tsx');

  it("l'impression est ENREGISTRÉE au serveur avant d'ouvrir la boîte d'impression", () => {
    const imprimer = corps(ordres, 'imprimer');
    const appel = imprimer.indexOf('/impression');
    const boite = imprimer.indexOf('window.print');
    expect(appel).toBeGreaterThan(-1);
    expect(boite).toBeGreaterThan(appel);
  });

  it("l'ordre n'est demandé que pour des fournisseurs", () => {
    const enregistrer = corps(reglements, 'enregistrer');
    expect(enregistrer).toContain("avecOrdre && ordresServis && sens === 'FOURNISSEUR'");
    expect(enregistrer).toContain('ordreVirement: true');
  });

  it("seul le document remis à la banque s'imprime quand un ordre est ouvert", () => {
    expect(reglements).toContain("${ordreOuvert ? 'avec-edition' : ''}");
    expect(ordres).toContain('className="impression-seul ordre-virement');
  });

  it("la liste part de null et « aucun ordre » ne se dit que d'une liste lue (audit final F207)", () => {
    expect(ordres).toContain('useState<ListeOrdresVirement<OrdreResume> | null>(null)');
    expect(ordres).toContain('{!ordre && liste && (');
    expect(ordres).toContain('{liste.total === 0 ? (');
  });

  it('la tranche et les ordres à imprimer hors de la liste se disent (audit final F207)', () => {
    expect(ordres).toContain('const tranche = liste ? mentionTrancheOrdres(liste) : null;');
    expect(ordres).toContain('const attenteHorsListe = liste ? mentionAttenteHorsListe(liste) : null;');
    expect(ordres).toContain('{tranche && <span');
    expect(ordres).toContain('{attenteHorsListe && <span');
  });

  describe('le filtre par état (audit final F207, le reste)', () => {
    /** Le corps de `const nom = (...) => { ... };`, par équilibrage des accolades. */
    function corpsFleche(source: string, nom: string): string {
      const debut = source.indexOf(`const ${nom} = (`);
      expect(debut).toBeGreaterThan(-1);
      const ouverture = source.indexOf('{', source.indexOf('=>', debut));
      let profondeur = 0;
      for (let i = ouverture; i < source.length; i++) {
        if (source[i] === '{') profondeur++;
        if (source[i] === '}' && --profondeur === 0) return source.slice(ouverture, i + 1);
      }
      throw new Error(`corps de ${nom} introuvable`);
    }

    it('la liste se lit sous le filtre choisi, et se relit quand il change', () => {
      const recharger = corpsFleche(ordres, 'recharger');
      expect(recharger).toContain('cheminListeOrdres(filtre)');
      expect(ordres).toContain('}, [filtre, ordreInitial]);');
    });

    it('seule la dernière lecture demandée s’affiche, réponse comme refus', () => {
      const recharger = corpsFleche(ordres, 'recharger');
      expect(recharger).toContain('const lecture = ++derniereLecture.current;');
      expect(recharger).toContain('if (lecture === derniereLecture.current) setListe(l);');
      expect(recharger).toContain('if (lecture === derniereLecture.current) setErreur(');
    });

    it("changer de filtre retire l'ancienne liste · rien ne s'affiche sous un choix qu'elle ne porte pas", () => {
      const changer = corpsFleche(ordres, 'changerFiltre');
      expect(changer).toContain('setListe(null);');
      expect(changer).toContain("setFiltre(valeur === '' ? null : (valeur as StatutOrdre));");
    });

    it('les états proposés sont ceux de la table des libellés, et « tous » vide le filtre', () => {
      expect(ordres).toContain("value={filtre ?? ''}");
      expect(ordres).toContain('onChange={(e) => changerFiltre(e.target.value)}');
      expect(ordres).toContain('<option value="">Tous les états</option>');
      expect(ordres).toContain('(Object.keys(LIBELLE_STATUT_ORDRE) as StatutOrdre[]).map((s) => (');
    });

    it('une liste filtrée vide se dit par la règle, et les ordres à imprimer hors filtre restent dits', () => {
      expect(ordres).toContain('const listeVide = liste ? mentionListeVide(liste) : null;');
      expect(ordres).toContain('{listeVide}');
      // Dans le bloc de la liste lue, la mention des ordres à imprimer vient
      // AVANT l'aiguillage « liste vide ou tableau » · elle se lit dans les deux.
      const bloc = ordres.slice(ordres.indexOf('{!ordre && liste && ('));
      const mention = bloc.indexOf('{(tranche || attenteHorsListe) && (');
      const aiguillage = bloc.indexOf('{liste.total === 0 ? (');
      expect(mention).toBeGreaterThan(-1);
      expect(aiguillage).toBeGreaterThan(mention);
    });
  });

  it('un ordre annulé ne produit aucun document imprimable', () => {
    expect(ordres).toContain("{ordre && ordre.statut !== 'ANNULE' && (\n        <div className=\"impression-seul");
  });
});
