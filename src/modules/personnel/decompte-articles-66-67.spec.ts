import { BadRequestException } from '@nestjs/common';
import {
  DELAI_NOUVEL_EMPLOI_MAXIMUM_JOURS,
  RESERVE_DEPART_AVANT_LA_MOITIE,
  decompteFinal,
  motifRefusDecompte,
  type ParametresDecompte,
} from './decompte-final';
import { elementsDuDecompte } from './decompte-final-emis';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import type { DecompteFinalDto } from './dto/personnel.dto';

/**
 * A9 · RELEVÉ CPCC C5 · les articles 66 et 67 du Code du travail, lus verbatim.
 *
 * ART. 66 · « Le travailleur qui reçoit le préavis peut cesser le travail à
 * l'expiration de la moitié du délai de préavis que l'employeur est tenu de
 * lui donner. L'employeur doit la rémunération et les allocations familiales
 * pendant le temps restant à courir. »
 *
 * ART. 67 · « Le travailleur qui a reçu le préavis et justifie avoir trouvé un
 * nouvel emploi peut quitter son employeur dans un délai moindre, fixé de
 * commun accord, sans qu'il puisse être supérieur à sept jours à dater du jour
 * où il trouve un nouvel engagement. Dans ce cas, il perd le droit à la
 * rémunération et aux allocations familiales de la période de préavis restant
 * à courir. »
 *
 * CE QUI CASSAIT EN SILENCE · déclaré « non observé, partie responsable le
 * travailleur », le départ à mi-préavis faisait DEVOIR au travailleur
 * l'indemnité de l'art. 63, al. 3, sur une écriture équilibrée.
 */

const CDI = 'DUREE_INDETERMINEE' as const;

/** Trois ans d'ancienneté · art. 64, 14 + 7 × 3 = 35 jours ouvrables ; la moitié, 17,5. */
const LICENCIEMENT: ParametresDecompte = {
  anneesAnciennete: 3,
  moisNonCouvertsParUnConge: 12,
  moinsDeDixHuitAns: false,
  initiative: 'EMPLOYEUR',
  motif: 'LICENCIEMENT',
  typeContrat: CDI,
  remunerationJournaliereFc: 20_000,
  // 26 000 par mois ramenés au jour par 26 · 1 000 FC par jour.
  moyenneMensuelleArticle66Fc: 26_000,
  moyenneMensuelleArticle142Fc: 0,
  avantagesPendantPreavisFc: 70_000,
  arrieresFc: 150_000,
  gratificationFc: 0,
  enfantsBeneficiairesAllocations: 2,
  joursAllocationsFamiliales: 30,
  allocationFamilialeParEnfantFc: 796.3,
};

const MI_PREAVIS: ParametresDecompte = {
  ...LICENCIEMENT,
  executionPreavis: 'DEPART_A_MI_PREAVIS',
  joursPreavisNonObserves: 17.5,
  avantagesEnNatureRestantsFc: 5_000,
};

const NOUVEL_EMPLOI: ParametresDecompte = {
  ...LICENCIEMENT,
  executionPreavis: 'DEPART_POUR_NOUVEL_EMPLOI',
  nouvelEmploiJustifie: true,
  delaiDepartNouvelEmploiJours: 5,
};

const preavisDe = (p: ParametresDecompte) => decompteFinal(p).rubriques.find((r) => r.cle === 'preavis')!;

describe("A9 · article 66 · le départ à mi-préavis, et l'employeur doit le temps restant", () => {
  it('crédite le travailleur de la rémunération du temps restant, moyenne et avantages en nature compris', () => {
    const v = decompteFinal(MI_PREAVIS);
    const p = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.libelle).toBe('Rémunération du préavis restant à courir');
    expect(p.montantFc).toBeCloseTo(17.5 * (20_000 + 1_000) + 5_000, 6);
    expect(p.fondement).toContain("L'employeur doit la rémunération et les allocations familiales pendant le temps restant à courir");
    // Rien n'est dû PAR le travailleur · il a usé d'un droit.
    expect(v.duParLeTravailleur).toEqual([]);
    expect(v.totalBrutFc).not.toBeNull();
  });

  it("n'y fait entrer ni le logement ni le transport · l'art. 66 dit « la rémunération » (art. 7, point 8)", () => {
    const p = preavisDe(MI_PREAVIS);
    // Les avantages de toute nature de l'art. 63 ne s'y ajoutent pas.
    expect(p.montantFc).not.toBeCloseTo(17.5 * 21_000 + 70_000, 0);
    expect(p.avantagesInclusFc).toBeUndefined();
    expect(p.fondement).toContain('ni le logement ou son indemnité ni le transport');
  });

  it('accepte un départ après la moitié (moins de jours restants)', () => {
    expect(preavisDe({ ...MI_PREAVIS, joursPreavisNonObserves: 10 }).montantFc).toBeCloseTo(10 * 21_000 + 5_000, 6);
  });

  it('refuse un départ AVANT la moitié · ce n’est plus l’article 66, et rien n’est chiffré', () => {
    const v = decompteFinal({ ...MI_PREAVIS, joursPreavisNonObserves: 20 });
    const p = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBeNull();
    expect(p.reserve).toContain('AVANT la moitié');
    expect(v.totalBrutFc).toBeNull();
  });

  it('ne lit jamais zéro un fait non déclaré · jours restants, moyenne ou avantages en nature absents', () => {
    expect(preavisDe({ ...MI_PREAVIS, joursPreavisNonObserves: null }).montantFc).toBeNull();
    expect(preavisDe({ ...MI_PREAVIS, avantagesEnNatureRestantsFc: null }).montantFc).toBeNull();
    expect(preavisDe({ ...MI_PREAVIS, avantagesEnNatureRestantsFc: null }).reserve).toContain('zéro est une réponse');
    expect(preavisDe({ ...MI_PREAVIS, moyenneMensuelleArticle66Fc: null }).montantFc).toBeNull();
    expect(preavisDe({ ...MI_PREAVIS, remunerationJournaliereFc: null }).montantFc).toBeNull();
    expect(preavisDe({ ...MI_PREAVIS, avantagesEnNatureRestantsFc: 0 }).montantFc).toBeCloseTo(17.5 * 21_000, 6);
  });

  it('garde les allocations familiales du temps restant, et le dit', () => {
    const af = decompteFinal(MI_PREAVIS).horsBrut.find((r) => r.cle === 'allocations-familiales')!;
    expect(af.montantFc).toBeCloseTo(2 * 30 * 796.3, 6);
    expect(af.reserve).toContain('DUES (art. 66, al. 2');
  });

  it("s'émet sous l'indemnité de fin de contrat (6614), sans ventilation d'avantages", () => {
    const { elements, refus } = elementsDuDecompte(decompteFinal(MI_PREAVIS));
    expect(refus).toEqual([]);
    expect(elements.find((e) => e.cleRubrique === 'preavis')).toEqual(
      expect.objectContaining({ nature: 'INDEMNITE_DE_FIN_DE_CONTRAT', montantFc: 17.5 * 21_000 + 5_000 }),
    );
  });
});

describe('A9 · relevé CPCC C5 · un départ à mi-préavis saisi « non observé » ne fait plus payer le travailleur', () => {
  const MAL_SAISI: ParametresDecompte = {
    ...LICENCIEMENT,
    executionPreavis: 'NON_OBSERVE',
    partieResponsable: 'TRAVAILLEUR',
    joursPreavisNonObserves: 17.5,
  };

  it("n'impute rien au travailleur parti à la moitié, et renvoie à l'article 66", () => {
    const v = decompteFinal(MAL_SAISI);
    expect(v.duParLeTravailleur).toEqual([]);
    const p = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBeNull();
    expect(p.reserve).toContain('Article 66');
    expect(p.reserve).toContain('mi-préavis');
    // Un solde où l'employeur doit le temps restant ne s'émet pas à zéro.
    expect(v.totalBrutFc).toBeNull();
    expect(elementsDuDecompte(v).refus.length).toBeGreaterThan(0);
  });

  it("n'impute au travailleur parti avant la moitié que les jours d'avant elle", () => {
    const v = decompteFinal({ ...MAL_SAISI, joursPreavisNonObserves: 25 });
    const du = v.duParLeTravailleur.find((r) => r.cle === 'preavis')!;
    // 25 jours non observés, 17,5 que l'art. 66 le laissait ne pas prester · 7,5 imputés.
    expect(du.montantFc).toBeCloseTo(7.5 * 21_000 + 70_000, 6);
    expect(du.reserve).toBe(RESERVE_DEPART_AVANT_LA_MOITIE);
    expect(du.fondement).toContain('seuls les 7.5 jours');
  });

  it("laisse entier le préavis du démissionnaire · l'art. 66 vise celui qui REÇOIT le préavis", () => {
    const v = decompteFinal({
      ...LICENCIEMENT,
      motif: 'DEMISSION',
      initiative: 'TRAVAILLEUR',
      executionPreavis: 'NON_OBSERVE',
      joursPreavisNonObserves: 17.5,
    });
    const du = v.duParLeTravailleur.find((r) => r.cle === 'preavis')!;
    expect(du.montantFc).toBeCloseTo(17.5 * 21_000 + 70_000, 6);
    expect(du.reserve).toBeNull();
  });

  it("ne touche pas au préavis non observé par l'employeur", () => {
    const p = preavisDe({ ...MAL_SAISI, partieResponsable: 'EMPLOYEUR', joursPreavisNonObserves: 10 });
    expect(p.montantFc).toBeCloseTo(10 * 21_000 + 70_000, 6);
  });
});

describe('A9 · article 67 · le départ pour un nouvel emploi, et le travailleur perd le reste', () => {
  it('ne doit rien au travailleur pour le temps restant, ni rien de lui', () => {
    const v = decompteFinal(NOUVEL_EMPLOI);
    const p = v.rubriques.find((r) => r.cle === 'preavis')!;
    expect(p.montantFc).toBe(0);
    expect(p.fondement).toContain('il perd le droit à la rémunération et aux allocations familiales');
    expect(v.duParLeTravailleur).toEqual([]);
    expect(v.totalBrutFc).not.toBeNull();
  });

  it('dit que les allocations du temps restant sont perdues', () => {
    expect(decompteFinal(NOUVEL_EMPLOI).horsBrut[0].reserve).toContain('PERDUES (art. 67)');
  });

  it('borne le délai convenu à sept jours, compris', () => {
    expect(DELAI_NOUVEL_EMPLOI_MAXIMUM_JOURS).toBe(7);
    expect(preavisDe({ ...NOUVEL_EMPLOI, delaiDepartNouvelEmploiJours: 7 }).montantFc).toBe(0);
    const p = preavisDe({ ...NOUVEL_EMPLOI, delaiDepartNouvelEmploiJours: 8 });
    expect(p.montantFc).toBeNull();
    expect(p.reserve).toContain('supérieur à sept jours');
  });

  it("n'écrit pas le zéro sans la justification ni le délai déclarés", () => {
    const sans = preavisDe({ ...NOUVEL_EMPLOI, nouvelEmploiJustifie: null });
    expect(sans.montantFc).toBeNull();
    const non = preavisDe({ ...NOUVEL_EMPLOI, nouvelEmploiJustifie: false });
    expect(non.montantFc).toBeNull();
    expect(non.reserve).toContain('63, al. 3');
    expect(preavisDe({ ...NOUVEL_EMPLOI, delaiDepartNouvelEmploiJours: null }).montantFc).toBeNull();
  });

  it("s'émet sans élément de préavis et sans refus", () => {
    const { elements, refus } = elementsDuDecompte(decompteFinal(NOUVEL_EMPLOI));
    expect(refus).toEqual([]);
    expect(elements.some((e) => e.cleRubrique === 'preavis')).toBe(false);
  });
});

describe('A9 · les articles 66 et 67 ne valent que pour le préavis REÇU de l’employeur', () => {
  it('refuse les deux départs sur une démission', () => {
    expect(motifRefusDecompte({ initiative: 'TRAVAILLEUR', motif: 'DEMISSION', executionPreavis: 'DEPART_A_MI_PREAVIS' })).toContain('Article 66');
    expect(motifRefusDecompte({ initiative: 'TRAVAILLEUR', motif: 'DEMISSION', executionPreavis: 'DEPART_POUR_NOUVEL_EMPLOI' })).toContain('Article 67');
    expect(motifRefusDecompte({ initiative: 'EMPLOYEUR', motif: 'LICENCIEMENT', executionPreavis: 'DEPART_A_MI_PREAVIS' })).toBeNull();
  });

  it('le service refuse en 400 et transmet les faits nouveaux au moteur', async () => {
    const svc = new PersonnelService({} as unknown as PrismaService);
    const dto: DecompteFinalDto = {
      anneesAnciennete: 3,
      moisNonCouvertsParUnConge: 12,
      initiative: 'EMPLOYEUR',
      motif: 'LICENCIEMENT',
      typeContrat: CDI,
      executionPreavis: 'DEPART_A_MI_PREAVIS',
      joursPreavisNonObserves: 17.5,
      remunerationJournaliereFc: 20_000,
      moyenneMensuelleArticle66Fc: 0,
      avantagesEnNatureRestantsFc: 1_000,
    };
    const v = await svc.decompteFinal('t1', dto);
    expect(v.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBeCloseTo(17.5 * 20_000 + 1_000, 6);
    const v67 = await svc.decompteFinal('t1', {
      ...dto,
      executionPreavis: 'DEPART_POUR_NOUVEL_EMPLOI',
      nouvelEmploiJustifie: true,
      delaiDepartNouvelEmploiJours: 3,
    });
    expect(v67.rubriques.find((r) => r.cle === 'preavis')!.montantFc).toBe(0);
    await expect(
      svc.decompteFinal('t1', { ...dto, initiative: 'TRAVAILLEUR', motif: 'DEMISSION' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
