import { NatureLocationAcquisition } from '@prisma/client';
import { ContratSaisi, construireEcheancier, motifRefusComplements, motifRefusContrat, valeurActualisee } from './echeancier-location-acquisition';
import { ventilerExercice } from './cloture-location-acquisition';

/**
 * LOT 15 · COMPLÉMENTS DU CRÉDIT-BAIL · AUDCIF Titre VIII ch. 8 § 2.1.2. Les
 * paiements locatifs comprennent « les loyers variables qui dépendent d'un
 * indice ou d'un taux » (évalués « en retenant l'indice ou le taux en
 * vigueur au commencement du contrat ») et « les montants que le preneur
 * s'attend à payer au titre d'une garantie de valeur résiduelle ». Rejoué sur
 * l'exemple du § 2.1.4 (8 loyers annuels échus de 90 000 à 7,86 %).
 */
const EXEMPLE: ContratSaisi = {
  nature: NatureLocationAcquisition.CREDIT_BAIL_MOBILIER,
  datePriseEffet: new Date('2026-01-01T00:00:00Z'),
  dureeMois: 96,
  periodicite: 'ANNUELLE',
  termeAEchoir: false,
  loyer: 90000,
  prixOption: 0,
  optionRaisonnablementCertaine: true,
  bienDeFaibleValeur: false,
  tauxAnnuel: 0.0786,
};

describe('garantie de valeur résiduelle (§ 2.1.2)', () => {
  it('entre dans la dette à sa valeur actualisée au terme · « paiements estimés à la fin du contrat » (§ 2.1.3)', () => {
    const sans = construireEcheancier(EXEMPLE);
    const avec = construireEcheancier({ ...EXEMPLE, garantieValeurResiduelle: 50000 });
    expect(avec.dette).toBeCloseTo(sans.dette + 50000 / Math.pow(1.0786, 8), 1);
    const derniere = avec.lignes[avec.lignes.length - 1];
    expect(derniere.garantie).toBe(true);
    expect(derniere.date.toISOString().slice(0, 10)).toBe('2034-01-01');
    expect(derniere.restant).toBe(0);
    expect(avec.lignes.filter((l) => l.garantie)).toHaveLength(1);
  });

  it('elle entre aussi dans le taux implicite tiré de la valeur du contrat', () => {
    const c = { ...EXEMPLE, tauxAnnuel: null, valeurContrat: 550000, garantieValeurResiduelle: 50000 };
    const e = construireEcheancier(c);
    expect(valeurActualisee(c, e.tauxPeriodique)).toBeCloseTo(550000, 2);
  });

  it('jamais négative', () => {
    expect(motifRefusContrat({ ...EXEMPLE, garantieValeurResiduelle: -1 })).toContain('garantie');
  });

  const exo = { dateDebut: new Date('2034-01-01T00:00:00Z'), dateFin: new Date('2034-12-31T00:00:00Z') };
  it('à l’échéance, la clôture exige la déclaration de son appel, comme l’option', () => {
    const e = construireEcheancier({ ...EXEMPLE, garantieValeurResiduelle: 50000 });
    const v = ventilerExercice(e.lignes, EXEMPLE.datePriseEffet, e.dette, e.tauxPeriodique, exo, null, null);
    expect(v.garantieNonDeclaree).toBe(true);
    expect(v.loyers).toBe(90000);
  });

  it('appelée, elle se vire au 17 avec la dernière échéance ; non appelée, jamais, et sa part de dette se dit', () => {
    const e = construireEcheancier({ ...EXEMPLE, garantieValeurResiduelle: 50000 });
    const appelee = ventilerExercice(e.lignes, EXEMPLE.datePriseEffet, e.dette, e.tauxPeriodique, exo, null, true);
    expect(appelee.loyers).toBe(140000);
    expect(appelee.garantieNonDeclaree).toBe(false);
    const non = ventilerExercice(e.lignes, EXEMPLE.datePriseEffet, e.dette, e.tauxPeriodique, exo, null, false);
    expect(non.loyers).toBe(90000);
    expect(non.garantieNonAppelee).toBeCloseTo(50000, 0);
  });

  it('sans garantie, rien ne change · aucune ligne, aucune déclaration réclamée', () => {
    const e = construireEcheancier(EXEMPLE);
    expect(e.lignes.some((l) => l.garantie)).toBe(false);
    const v = ventilerExercice(e.lignes, EXEMPLE.datePriseEffet, e.dette, e.tauxPeriodique, exo);
    expect(v.garantieNonDeclaree).toBe(false);
    expect(v.garantieNonAppelee).toBe(0);
  });
});

describe('loyers indexés (§ 2.1.2)', () => {
  it('l’indice et sa valeur au commencement se déclarent ; le loyer saisi est celui qu’elle donne, la dette inchangée', () => {
    const indexe = { ...EXEMPLE, loyerIndexe: true, indiceLoyer: 'Indice des prix à la consommation', valeurIndiceCommencement: 112.4 };
    expect(motifRefusContrat(indexe)).toBeNull();
    expect(construireEcheancier(indexe).dette).toBe(construireEcheancier(EXEMPLE).dette);
  });

  it('refus nommés · indice absent, valeur absente, indice sans loyer indexé', () => {
    expect(motifRefusComplements({ loyerIndexe: true, indiceLoyer: ' ', valeurIndiceCommencement: 100 })).toContain("Nommez l'indice");
    expect(motifRefusComplements({ loyerIndexe: true, indiceLoyer: 'IPC', valeurIndiceCommencement: null })).toContain('valeur de l');
    expect(motifRefusComplements({ loyerIndexe: false, indiceLoyer: 'IPC' })).toContain('loyer indexé');
    expect(motifRefusComplements({})).toBeNull();
  });
});
