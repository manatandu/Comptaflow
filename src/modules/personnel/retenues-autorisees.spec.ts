import {
  REPONSE_COTISATION_SYNDICALE,
  RESERVE_CESSION_SYNDICALE,
  RESERVE_LITTERAE_DATEES,
  RETENUES_ARTICLE_112,
  SANCTION_ARTICLE_112,
  retenueAutorisee,
} from './retenues-autorisees';

describe("Les sept retenues de l'article 112, recopiées", () => {
  it('en porte exactement sept, de a) à g), sans trou', () => {
    expect(RETENUES_ARTICLE_112).toHaveLength(7);
    expect(RETENUES_ARTICLE_112.map((r) => r.littera)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
  });

  it('ne nomme NULLE PART la cotisation syndicale', () => {
    // Le défaut visé : ajouter un huitième litera « par équivalence », comme
    // on le fait pour la taxe professionnelle et pour l'INSS.
    for (const r of RETENUES_ARTICLE_112) {
      expect(r.libelle.toLowerCase()).not.toContain('syndic');
      expect((r.equivalentActuel ?? '').toLowerCase()).not.toContain('syndic');
    }
  });

  it("porte l'équivalent actuel des deux seuls litterae datés", () => {
    const parLittera = Object.fromEntries(RETENUES_ARTICLE_112.map((r) => [r.littera, r]));
    expect(parLittera.a.libelle).toContain('taxe professionnelle');
    expect(parLittera.a.equivalentActuel).toContain('119');
    expect(parLittera.b.libelle).toContain('Institut National de Sécurité Sociale');
    expect(parLittera.b.equivalentActuel).toContain('CNSS');
    // Et AUCUN autre · une équivalence de plus serait une retenue inventée.
    const avecEquivalent = RETENUES_ARTICLE_112.filter((r) => r.equivalentActuel !== null);
    expect(avecEquivalent.map((r) => r.littera)).toEqual(['a', 'b']);
  });

  it("borne la souplesse de l'équivalence", () => {
    expect(RESERVE_LITTERAE_DATEES).toMatch(/CNSS pour le b/);
    expect(RESERVE_LITTERAE_DATEES).toMatch(/JAMAIS pour une retenue que la liste n'a jamais prévue/i);
  });
});

describe('Le rattachement est un acte de qualification, pas une devinette', () => {
  it('accepte les sept litterae', () => {
    for (const l of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      expect(retenueAutorisee(l).autorisee).toBe(true);
    }
  });

  it("refuse l'absence de litera, et le refus porte la sanction", () => {
    const v = retenueAutorisee(null);
    expect(v.autorisee).toBe(false);
    expect(v.retenue).toBeNull();
    expect(v.refus).toMatch(/AUTANT DE FOIS QU'IL Y A DES TRAVAILLEURS CONCERNÉS/);
  });

  it("refuse un litera inventé, et le cite pour qu'on voie l'erreur", () => {
    const v = retenueAutorisee('h');
    expect(v.autorisee).toBe(false);
    expect(v.refus).toContain('« h »');
  });

  it("ne s'ouvre PAS sur un litera en capitale ou avec parenthèse", () => {
    // Le défaut visé : une normalisation permissive qui laisserait passer
    // n'importe quoi de vaguement ressemblant.
    expect(retenueAutorisee('A').autorisee).toBe(false);
    expect(retenueAutorisee('a)').autorisee).toBe(false);
  });
});

/**
 * LA RÉPONSE À LA COTISATION SYNDICALE · on gèle la CONCLUSION et ses deux
 * appuis, pas seulement les numéros d'article. La leçon de la réserve CNSS.
 */
describe("La cotisation syndicale · six passes pour lire le bon article", () => {
  it("répond NON à la retenue, et dit d'où vient la réponse", () => {
    expect(REPONSE_COTISATION_SYNDICALE).toMatch(/NE SE RETIENT PAS SUR LA PAIE/);
    expect(REPONSE_COTISATION_SYNDICALE).toContain('279');
    expect(REPONSE_COTISATION_SYNDICALE).toMatch(/PAR LES TRAVAILLEURS/);
    expect(REPONSE_COTISATION_SYNDICALE).toMatch(/LE SUJET DU VERBE EST LE TRAVAILLEUR/);
  });

  it('ferme la porte de la convention collective par les deux verrous', () => {
    // 274 · pas de dérogation à l'ordre public. 112 · nullité de plein droit
    // ET sanction pénale par travailleur. Un seul des deux ne suffirait pas.
    expect(REPONSE_COTISATION_SYNDICALE).toContain('274');
    expect(REPONSE_COTISATION_SYNDICALE).toContain('112');
    expect(REPONSE_COTISATION_SYNDICALE).toMatch(/nullité de plein droit/i);
    expect(REPONSE_COTISATION_SYNDICALE).toMatch(/pénalement sanctionné/i);
    // Et l'asymétrie qui tranche : 279 n'est dans aucune liste pénale.
    expect(REPONSE_COTISATION_SYNDICALE).toMatch(/aucune liste pénale/i);
  });

  it("nomme la voie qui reste, et AVOUE que c'est une lecture", () => {
    expect(RESERVE_CESSION_SYNDICALE).toMatch(/UNE CESSION, PAS UNE RETENUE/);
    expect(RESERVE_CESSION_SYNDICALE).toContain('114');
    expect(RESERVE_CESSION_SYNDICALE).toMatch(/LECTURE D'ÉDITEUR/);
    expect(RESERVE_CESSION_SYNDICALE).toMatch(/AUCUNE SOURCE LUE NE L'ÉNONCE/);
  });

  it('dit les deux conséquences de cette voie avant de la proposer', () => {
    expect(RESERVE_CESSION_SYNDICALE).toMatch(/CONSOMME LA QUOTITÉ CESSIBLE/);
    expect(RESERVE_CESSION_SYNDICALE).toMatch(/ÉCRIT DU TRAVAILLEUR/);
    expect(RESERVE_CESSION_SYNDICALE).toMatch(/révocable/);
    expect(RESERVE_CESSION_SYNDICALE).toMatch(/jamais une clause qui vaudrait pour tous/i);
  });

  it('chiffre la sanction et son multiplicateur', () => {
    expect(SANCTION_ARTICLE_112).toContain('321');
    expect(SANCTION_ARTICLE_112).toContain('328');
    expect(SANCTION_ARTICLE_112).toContain('20 000');
    expect(SANCTION_ARTICLE_112).toMatch(/cinquante fois/);
  });
});
