import { Referentiel } from '@prisma/client';
import { REGLES, dotationReserveLegale } from './regles-affectation';

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
      benefice: 5_000_000,
      pertesAnterieures: 0,
      reserveExistante: 0,
      capitalSocial: 0,
    });
    expect(r.dotation).toBeNull();
    expect(r.motif).toContain('sociétés commerciales');
  });

  it('la table ne porte ni réserve légale ni capital social pour ce référentiel', () => {
    expect(REGLES[Referentiel.SYCEBNL].reserveLegale).toBeUndefined();
    expect(REGLES[Referentiel.SYCEBNL].capitalSocial).toBeUndefined();
    expect(REGLES[Referentiel.SYSCOHADA].reserveLegale).toBe('111');
    expect(REGLES[Referentiel.SYSCOHADA].capitalSocial).toBe('101');
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
