import { ecritureDeFacture, FacturePourEcriture } from './ecriture-facture';

const base = (x: Partial<FacturePourEcriture> = {}): FacturePourEcriture => ({
  sens: 'VENTE',
  nature: 'FACTURE',
  numeroSerie: 'F-1',
  contrepartieNom: 'Client',
  compteTiersId: 'c411',
  autresImpotsEtTaxes: null,
  lignes: [
    { designation: 'Service', montantHT: 1000, montantTva: 160, compteTvaId: 'c443', tauxTvaId: 't16' },
    { designation: 'Autre', montantHT: 500, montantTva: 80, compteTvaId: 'c443', tauxTvaId: 't16' },
  ],
  ...x,
});
const sens = (r: ReturnType<typeof ecritureDeFacture>) => {
  if ('refus' in r) throw new Error(r.refus);
  return Object.fromEntries(r.lignes.map((l) => [l.compteId, l.debit - l.credit]));
};

describe('écriture d’une facture', () => {
  it('vente · client au débit du TTC, produit et TVA facturée au crédit', () => {
    expect(sens(ecritureDeFacture(base(), 'c706'))).toEqual({ c411: 1740, c706: -1500, c443: -240 });
  });

  it('achat · charge et TVA récupérable au débit, fournisseur au crédit', () => {
    const r = ecritureDeFacture(base({ sens: 'ACHAT', compteTiersId: 'c401', lignes: [{ designation: 'Loyer', montantHT: 1000, montantTva: 160, compteTvaId: 'c445', tauxTvaId: 't16' }] }), 'c622');
    expect(sens(r)).toEqual({ c401: -1160, c622: 1000, c445: 160 });
  });

  it('une note de crédit est l’inverse exact de la facture', () => {
    expect(sens(ecritureDeFacture(base({ nature: 'NOTE_DE_CREDIT' }), 'c706'))).toEqual({ c411: -1740, c706: 1500, c443: 240 });
    const achat = ecritureDeFacture(base({ sens: 'ACHAT', nature: 'NOTE_DE_CREDIT', compteTiersId: 'c401', lignes: [{ designation: 'x', montantHT: 100, montantTva: 0, compteTvaId: null, tauxTvaId: null }] }), 'c601');
    expect(sens(achat)).toEqual({ c401: 100, c601: -100 });
  });

  it('un compte par ligne l’emporte sur celui de la facture, et la TVA porte son taux', () => {
    const r = ecritureDeFacture(base({ lignes: [{ ...base().lignes[0], compteGestionId: 'c707' }, base().lignes[1]] }), 'c706');
    expect(sens(r)).toEqual({ c411: 1740, c707: -1000, c706: -500, c443: -240 });
    if (!('refus' in r)) expect(r.lignes.find((l) => l.compteId === 'c443')?.tauxTvaId).toBe('t16');
  });

  it('s’équilibre toujours, au centime', () => {
    const r = ecritureDeFacture(base({ lignes: [0.1, 0.2, 0.3].map((h) => ({ designation: 'x', montantHT: h, montantTva: 0.016, compteTvaId: 'c443', tauxTvaId: 't' })) }), 'c706');
    if ('refus' in r) throw new Error(r.refus);
    const d = r.lignes.reduce((s, l) => s + l.debit, 0);
    const c = r.lignes.reduce((s, l) => s + l.credit, 0);
    expect(Math.round(d * 100)).toBe(Math.round(c * 100));
  });

  it('refuse sans compte du tiers, sans compte de gestion, sans compte de TVA, ou avec d’autres taxes', () => {
    expect(ecritureDeFacture(base({ compteTiersId: null }), 'c706')).toMatchObject({ refus: expect.stringMatching(/compte principal/) });
    expect(ecritureDeFacture(base(), null)).toMatchObject({ refus: expect.stringMatching(/Aucun compte de produit/) });
    expect(ecritureDeFacture(base({ lignes: [{ ...base().lignes[0], compteTvaId: null }] }), 'c706')).toMatchObject({ refus: expect.stringMatching(/sans taux/) });
    expect(ecritureDeFacture(base({ autresImpotsEtTaxes: 50 }), 'c706')).toMatchObject({ refus: expect.stringMatching(/autres impôts/) });
  });
});
