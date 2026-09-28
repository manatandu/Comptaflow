import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import { NATURES_RETENUES, obligationsDeclarativesApplicables } from './correspondance-retenues';
import { obligationsEvenementiellesApplicables, JALONS_CLOTURE } from '../exercice/planning-cloture';

/**
 * PASSE F7 · la loi de procédures fiscales, Titre 1 (obligations
 * déclaratives), confrontée à l'échéancier et au planning de clôture.
 */
const cles = (forme: FormeJuridiqueSyscohada | null) =>
  obligationsDeclarativesApplicables(Referentiel.SYSCOHADA, forme).map((o) => o.cle);

describe('art. 12 et 17 · la déclaration annuelle suit la qualité de la personne', () => {
  it('une personne physique reçoit la déclaration IRPP, jamais celle de l’impôt sur les sociétés', () => {
    for (const forme of [FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, FormeJuridiqueSyscohada.ENTREPRENANT]) {
      expect(cles(forme)).toContain('declarationIrpp');
      expect(cles(forme)).not.toContain('declarationImpotSocietes');
    }
    expect(cles(FormeJuridiqueSyscohada.SOCIETE_ANONYME)).toContain('declarationImpotSocietes');
    expect(cles(FormeJuridiqueSyscohada.SOCIETE_ANONYME)).not.toContain('declarationIrpp');
  });

  it('art. 13 et 14 · les états certifiés ne visent que le Système normal ; relevé, perte et liquidation sont dits', () => {
    const is = obligationsDeclarativesApplicables(Referentiel.SYSCOHADA, FormeJuridiqueSyscohada.SOCIETE_ANONYME).find((o) => o.cle === 'declarationImpotSocietes')!;
    expect(is.contenu).toContain('Pour une entreprise relevant du Système normal');
    expect(is.contenu).toContain('art. 13, al. 3');
    expect(is.contenu).toContain('art. 15');
    expect(is.contenu).toContain('art. 16');
    expect(is.contenu).toContain('contresignée par le conseil ou le comptable du redevable');
  });
});

describe('art. 18 et 19 · la déclaration mensuelle est due même sans paie', () => {
  it('« Néant » sur l’IRPP salaires et sur le prélèvement des expatriés', () => {
    const nature = (cle: string) => NATURES_RETENUES.find((n) => n.cle === cle)!;
    expect(nature('irppSalaires').echeance).toContain('« Néant » (art. 18, al. 2)');
    expect(nature('prelevementExpatries').echeance).toContain('« Néant » (art. 19, al. 2)');
  });
});

describe('art. 22 ter · une personne physique n’y est tenue qu’au réel ou aux petites entreprises', () => {
  it('la réserve est servie à la personne physique, pas à la personne morale', () => {
    const pour = (forme: FormeJuridiqueSyscohada) =>
      obligationsDeclarativesApplicables(Referentiel.SYSCOHADA, forme).find((o) => o.cle === 'declarationAnnuelleSalaires')!.reserve;
    expect(pour(FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE)).toContain('art. 22 ter');
    expect(pour(FormeJuridiqueSyscohada.SOCIETE_ANONYME)).toBeNull();
  });
});

describe('art. 3, 13 al. 4, 13 bis et 2 · le planning de clôture', () => {
  it('le jalon SYCEBNL distingue exemption et exonération et nomme l’art. 13, al. 4', () => {
    const jalon = JALONS_CLOTURE.find((j) => j.etape === 15 && j.referentiels?.includes(Referentiel.SYCEBNL))!;
    expect(jalon.detail).toContain('Les personnes exemptées sont dispensées de l’obligation de souscrire les déclarations');
    expect(jalon.detail).toContain('art. 13, al. 4');
    expect(jalon.detail).not.toContain('aucun texte lu ne le dit');
  });

  it('le procès-verbal d’assemblée n’est pas servi à une personne physique ; la déclaration de l’art. 2 l’est à tous', () => {
    const pour = (forme: FormeJuridiqueSyscohada | null) =>
      obligationsEvenementiellesApplicables({ referentiel: Referentiel.SYSCOHADA, formeJuridique: 'ASSOCIATION', droitEtranger: false, formeJuridiqueSyscohada: forme }).map((o) => o.cle);
    expect(pour(FormeJuridiqueSyscohada.ENTREPRENANT)).not.toContain('proceValAssembleeGenerale');
    expect(pour(FormeJuridiqueSyscohada.SOCIETE_ANONYME)).toContain('proceValAssembleeGenerale');
    expect(pour(FormeJuridiqueSyscohada.ENTREPRENANT)).toContain('modificationsIdentiteFiscale');
    expect(
      obligationsEvenementiellesApplicables({ referentiel: Referentiel.SYCEBNL, formeJuridique: 'ASSOCIATION', droitEtranger: false }).map((o) => o.cle),
    ).toContain('modificationsIdentiteFiscale');
  });
});
