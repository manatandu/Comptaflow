import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import {
  REGLES,
  dotationReserveLegale,
  racineCapital,
  regimeReserveLegale,
} from './regles-affectation';

/**
 * LA RÉSERVE LÉGALE · une règle du droit des SOCIÉTÉS, pas du droit comptable.
 *
 * « Il est obligatoirement constitué sur le bénéfice de l'exercice diminué, le
 * cas échéant, des pertes antérieures, une dotation égale à un dixième au moins
 * affectée à la formation d'un fonds de réserve dit "réserve légale". Cette
 * dotation cesse d'être obligatoire lorsque la réserve atteint le cinquième du
 * montant du capital social. Toute délibération prise en violation du présent
 * alinéa est nulle. » (AUSCGIE art. 346 pour la SARL ; art. 546, 2° pour la SA,
 * « à peine de nullité de toute délibération contraire ».)
 *
 * Trois pièges que ces tests figent, et qu'une lecture rapide manque :
 *
 *  1. l'assiette n'est PAS le bénéfice, c'est le bénéfice DIMINUÉ DES PERTES
 *     ANTÉRIEURES · une société qui redevient bénéficiaire après deux exercices
 *     de perte ne dote pas sur son seul bénéfice de l'année ;
 *  2. le seuil qui libère de l'obligation porte sur le CAPITAL SOCIAL, pas sur
 *     le bénéfice ni sur les capitaux propres ;
 *  3. la dotation obligatoire est PLAFONNÉE par ce qui manque pour atteindre le
 *     cinquième · exiger le dixième entier au-delà, ce serait ajouter au texte,
 *     et la sanction étant la nullité, le logiciel ne peut pas se permettre
 *     d'exiger plus que la loi.
 *
 * Et une quatrième chose, qui n'est pas un piège mais une frontière : cette
 * obligation n'existe pas pour une entité à but non lucratif. Le SYCEBNL n'a
 * ni réserve légale ni capital social · lui appliquer l'AUSCGIE serait la même
 * faute, en sens inverse, que celle que l'audit a passé sa vie à corriger.
 */

describe('Réserve légale · SYSCOHADA', () => {
  const cas = (p: Partial<Parameters<typeof dotationReserveLegale>[0]>) =>
    dotationReserveLegale({
      referentiel: Referentiel.SYSCOHADA,
      // SARL · l'une des DEUX formes que l'AUSCGIE astreint à la dotation
      // (art. 346). Les cas ci-dessous éprouvent le CALCUL ; le champ
      // d'application, lui, est éprouvé dans le describe « quelles formes ».
      forme: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
      benefice: 0,
      pertesAnterieures: 0,
      reserveExistante: 0,
      capitalSocial: 10_000_000,
      ...p,
    });

  it('dote un dixième du bénéfice quand rien ne s’y oppose', () => {
    const r = cas({ benefice: 3_000_000 });
    expect(r.dotation).toBe(300_000);
    expect(r.motif).toContain('dixième');
  });

  it('déduit d’abord les pertes antérieures de l’assiette', () => {
    // 3 000 000 de bénéfice, 1 000 000 de report débiteur : l'assiette est de
    // 2 000 000, la dotation de 200 000 et non de 300 000.
    const r = cas({ benefice: 3_000_000, pertesAnterieures: 1_000_000 });
    expect(r.dotation).toBe(200_000);
  });

  it('ne dote rien si les pertes antérieures absorbent le bénéfice', () => {
    const r = cas({ benefice: 1_000_000, pertesAnterieures: 1_200_000 });
    expect(r.dotation).toBeNull();
    expect(r.motif).toContain('ne laisse rien');
  });

  it('ne dote rien sur un exercice déficitaire', () => {
    const r = cas({ benefice: 0 });
    expect(r.dotation).toBeNull();
  });

  it('cesse d’être obligatoire au cinquième du CAPITAL SOCIAL', () => {
    // Capital 10 000 000 · le cinquième vaut 2 000 000. Réserve déjà à ce
    // niveau : plus rien n'est dû, quel que soit le bénéfice.
    const r = cas({ benefice: 5_000_000, reserveExistante: 2_000_000 });
    expect(r.dotation).toBeNull();
    expect(r.motif).toContain('cinquième du capital social');
  });

  it('plafonne la dotation à ce qui manque pour atteindre le cinquième', () => {
    // Il manque 50 000 pour atteindre 2 000 000. Le dixième vaudrait 300 000 ·
    // seuls 50 000 sont OBLIGATOIRES, et exiger plus serait ajouter au texte.
    const r = cas({ benefice: 3_000_000, reserveExistante: 1_950_000 });
    expect(r.dotation).toBe(50_000);
  });

  it('dote le dixième entier quand le capital n’est pas renseigné', () => {
    // Sans capital connu, aucun plafond ne peut être calculé · la règle du
    // dixième s'applique seule, ce qui est le sens prudent.
    const r = cas({ benefice: 3_000_000, capitalSocial: 0 });
    expect(r.dotation).toBe(300_000);
  });
});

describe('Réserve légale · SYCEBNL', () => {
  it('n’existe pas · l’AUSCGIE ne régit pas une entité à but non lucratif', () => {
    const r = dotationReserveLegale({
      referentiel: Referentiel.SYCEBNL,
      forme: null,
      benefice: 5_000_000,
      pertesAnterieures: 0,
      reserveExistante: 0,
      capitalSocial: 0,
    });
    expect(r.dotation).toBeNull();
    expect(r.motif).toContain('sociétés commerciales');
  });

  it('la table ne porte pas de réserve légale pour ce référentiel', () => {
    expect(REGLES[Referentiel.SYCEBNL].reserveLegale).toBeUndefined();
    expect(REGLES[Referentiel.SYSCOHADA].reserveLegale).toBe('111');
  });

  it('et aucun capital n’y est lu · le compte 10 du SYCEBNL est une DOTATION', () => {
    expect(racineCapital(Referentiel.SYCEBNL, null)).toBeNull();
  });
});

describe('Destinations du résultat · les deux plans ne les offrent pas toutes', () => {
  it('le SYCEBNL ne connaît pas les dividendes', () => {
    // « est débité le compte 13 […] par le crédit des comptes 12 - Report à
    // nouveau, 11 - Réserves, 10 - Dotation » · pas de 465. Une EBNL ne
    // distribue rien, c'est ce qui la définit.
    expect(REGLES[Referentiel.SYCEBNL].destinations).not.toContain('465');
    expect(REGLES[Referentiel.SYCEBNL].interdits.map((i) => i.racine)).toContain('465');
  });

  it('le SYSCOHADA les connaît · 465 Associés, dividendes à payer', () => {
    expect(REGLES[Referentiel.SYSCOHADA].destinations).toContain('465');
    expect(REGLES[Referentiel.SYSCOHADA].interdits).toEqual([]);
  });

  it('les deux soldent le 13 par la classe 1, et le report à nouveau y est toujours', () => {
    for (const r of Object.values(REGLES)) {
      expect(r.reportANouveau).toBe('12');
      expect(r.destinations).toContain('11');
      expect(r.destinations).toContain('12');
    }
  });
});

/**
 * QUELLES FORMES SONT TENUES · le défaut que ces tests figent.
 *
 * Le module indexait la règle sur le seul RÉFÉRENTIEL : `reserveLegale: '111'`
 * était posé pour tout dossier SYSCOHADA, la forme juridique n'était jamais
 * lue, et le service REFUSAIT l'affectation qui ne dotait pas le dixième. Un
 * GIE, une coopérative, une entreprise individuelle ne pouvaient plus solder
 * leur compte 13, donc plus clôturer.
 *
 * Ce que le texte dit, article par article, et qui n'a pas à être redécouvert :
 *
 *  · art. 346 · « Dans la société à responsabilité limitée » (chapitre Droit au
 *    dividende de la SARL) ;
 *  · art. 546, 2° · compétences de l'assemblée générale ordinaire de la SA ;
 *  · art. 142 · « les dotations NÉCESSAIRES à la réserve légale » · un renvoi,
 *    pas une obligation autonome : ni taux, ni plafond, ni sanction ;
 *  · art. 853-3 · la SAS reçoit les règles de la SA « à l'exception des
 *    articles […] 414 à 561 », donc SANS l'art. 546, 2° ;
 *  · art. 293-1 · la SCS suit la SNC, qui ne porte aucune réserve légale ;
 *  · art. 869 al. 3 et 870 · le GIE peut n'avoir aucun capital et ne réalise
 *    pas de bénéfice par lui-même ;
 *  · AUSCOOP art. 1 al. 3 · la coopérative relève de l'AUSCOOP « nonobstant »
 *    l'AUSCGIE, et sa cascade de l'art. 114 est autre : VINGT pour cent, deux
 *    réserves, plafond au capital des statuts.
 *
 * Ces cas cassent EN SILENCE dans l'autre sens aussi : si un jour quelqu'un
 * remet la règle sur le seul référentiel, rien ne se déséquilibre · une
 * « réserve légale » simplement apparaît au bilan d'une entité qui n'en doit
 * pas, et le contrôle bloque un dossier régulier.
 */
describe('Réserve légale · quelles formes le texte vise', () => {
  const dote = (forme: FormeJuridiqueSyscohada | null) =>
    dotationReserveLegale({
      referentiel: Referentiel.SYSCOHADA,
      forme,
      benefice: 3_000_000,
      pertesAnterieures: 0,
      reserveExistante: 0,
      capitalSocial: 10_000_000,
    });

  it('la SARL dote · art. 346, et le motif cite CET article', () => {
    const r = dote(FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE);
    expect(r.dotation).toBe(300_000);
    expect(r.motif).toContain('art. 346');
    // Chacune son article · servir le 546 à une SARL ferait citer, dans un
    // refus opposable, un texte qui ne la régit pas.
    expect(r.motif).not.toContain('546');
  });

  it('la SA dote · art. 546, 2°, et le motif cite CET article', () => {
    const r = dote(FormeJuridiqueSyscohada.SOCIETE_ANONYME);
    expect(r.dotation).toBe(300_000);
    expect(r.motif).toContain('art. 546, 2°');
    expect(r.motif).not.toContain('346');
  });

  it.each([
    [FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE, '853-3'],
    [FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF, 'nom collectif'],
    [FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE, '293-1'],
    [FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE, '869'],
    [FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE, 'AUSCOOP'],
    [FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, 'AUDCG'],
    [FormeJuridiqueSyscohada.ENTREPRENANT, 'AUDCG'],
    [FormeJuridiqueSyscohada.SUCCURSALE, '117'],
    [FormeJuridiqueSyscohada.ENTITE_PUBLIQUE, '102'],
    [FormeJuridiqueSyscohada.AUTRE, 'Autre'],
  ])('%s ne dote pas, et le motif dit ce qui a été lu', (forme, attendu) => {
    const r = dote(forme);
    expect(r.dotation).toBeNull();
    expect(r.motif).toContain(attendu);
  });

  it('une forme non renseignée ne dote pas · le logiciel ne présume pas une SARL', () => {
    // `formeJuridiqueSyscohada` est nullable et SANS défaut au schéma :
    // « la forme se lit dans les statuts, elle ne se devine pas ».
    const r = dote(null);
    expect(r.dotation).toBeNull();
    expect(r.motif).toContain("n'est pas renseignée");
  });

  it('le GIE sans capital ne se voit pas réclamer le dixième plein', () => {
    // LE CŒUR DU DÉFAUT. Capital nul : le plafond du cinquième était sauté
    // (`capitalSocial > 0`) et la dotation retombait sur le dixième ENTIER,
    // sans plafond, exercice après exercice. Art. 869 al. 3 : « Il peut être
    // constitué sans capital ».
    const r = dotationReserveLegale({
      referentiel: Referentiel.SYSCOHADA,
      forme: FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
      benefice: 3_000_000,
      pertesAnterieures: 0,
      reserveExistante: 0,
      capitalSocial: 0,
    });
    expect(r.dotation).toBeNull();
  });

  it('la coopérative n’est pas traitée en société commerciale', () => {
    // AUSCOOP art. 114 : deux réserves, « vingt pour cent » chacune, tant
    // qu'elles n'atteignent pas « le montant du capital fixé par les statuts ».
    // Le logiciel ne contrôle PAS cette cascade (il ne connaît ni les excédents
    // nets d'exploitation au sens du texte, ni le capital statutaire) · il dit
    // le texte au lieu de contrôler à 10 % ce que la loi veut à 20 %.
    const r = dote(FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE);
    expect(r.dotation).toBeNull();
    expect(r.motif).toContain('vingt pour cent');
    expect(r.motif).toContain('art. 114');
    expect(r.motif).not.toContain('346');
    expect(r.motif).not.toContain('546');
  });

  it('chaque forme du schéma a un régime décidé · aucune ne tombe dans un trou', () => {
    // Le jour où une treizième forme est ajoutée à l'enum, ce test tombe et
    // oblige à LIRE le texte pour elle, plutôt qu'à hériter en silence du
    // régime de la voisine.
    for (const forme of Object.values(FormeJuridiqueSyscohada)) {
      const regime = regimeReserveLegale(forme);
      expect(regime).toBeDefined();
      expect(regime.source.length).toBeGreaterThan(0);
      if (!regime.exigee) expect(regime.motif.length).toBeGreaterThan(0);
    }
  });
});

describe('Réserve légale · le capital se lit là où la forme le porte', () => {
  // AUDCIF, Titre VII · 101 Capital social (sociétés), 102 Capital par dotation
  // (« ne peut être utilisé que dans les entités publiques »), 103 Capital
  // personnel (entités individuelles). Lu au seul 101, le capital d'une
  // entreprise individuelle valait ZÉRO, le plafond du cinquième n'était jamais
  // atteint, et la dotation était réclamée sans fin.
  it.each([
    [FormeJuridiqueSyscohada.SOCIETE_ANONYME, '101'],
    [FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE, '101'],
    [FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE, '101'],
    [FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, '103'],
    [FormeJuridiqueSyscohada.ENTREPRENANT, '103'],
    [FormeJuridiqueSyscohada.ENTITE_PUBLIQUE, '102'],
  ])('%s porte son capital au %s', (forme, racine) => {
    expect(racineCapital(Referentiel.SYSCOHADA, forme)).toBe(racine);
  });

  it('le GIE et la succursale n’ont pas de capital à lire', () => {
    // AUSCGIE art. 869 al. 3 (le GIE « peut être constitué sans capital ») et
    // art. 117 (la succursale « n'a pas de personnalité juridique autonome »).
    expect(racineCapital(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE)).toBeNull();
    expect(racineCapital(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SUCCURSALE)).toBeNull();
  });
});
