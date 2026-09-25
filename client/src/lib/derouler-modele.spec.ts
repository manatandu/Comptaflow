import { deroulerModele, lignesASaisir, type LigneDeModele } from './derouler-modele';
import type { TauxTva } from './types';

const t16 = { id: 't16', code: 'TVA16', taux: 16 } as unknown as TauxTva;
const ligne = (ordre: number, numero: string, sens: 'DEBIT' | 'CREDIT', fonction: LigneDeModele['fonction'], extra: Partial<LigneDeModele> = {}): LigneDeModele => ({
  ordre, compteId: 'c' + numero, compteNumero: numero, compteIntitule: numero, sens, libelle: null, montant: null, fonction, ...extra,
});

// Le modèle du manuel Sage : « Achat de m/ses. TVA 20 % », ici au taux de 16 %.
const achat = [
  ligne(0, '60110000', 'DEBIT', 'SAISIR'),
  ligne(1, '44520000', 'DEBIT', 'CALCULER', { tauxTvaId: 't16' }),
  ligne(2, '40110000', 'CREDIT', 'EQUILIBRER'),
];

describe('dérouler un modèle (Sage i7)', () => {
  it('seul le HT se demande', () => {
    expect(lignesASaisir(achat).map((l) => l.compteNumero)).toEqual(['60110000']);
  });

  it('Saisir, Calculer, Équilibrer · 100 000 HT donnent 16 000 de taxe et 116 000 au fournisseur', () => {
    const r = deroulerModele(achat, { 0: 100000 }, [t16]);
    expect(r.motif).toBeNull();
    expect(r.lignes.map((l) => [l.numero, l.debit, l.credit])).toEqual([
      ['60110000', 100000, 0],
      ['44520000', 16000, 0],
      ['40110000', 0, 116000],
    ]);
    // Le taux est porté par la LIGNE DE TAXE, c'est elle que la déclaration lit.
    expect(r.lignes[1].tauxTvaId).toBe('t16');
    expect(r.lignes[0].tauxTvaId).toBeUndefined();
  });

  it('Répéter reprend le montant de la ligne précédente', () => {
    const r = deroulerModele([ligne(0, '62410000', 'DEBIT', 'SAISIR'), ligne(1, '57110000', 'CREDIT', 'REPETER')], { 0: 2000 }, []);
    expect(r.lignes.map((l) => l.debit + l.credit)).toEqual([2000, 2000]);
  });

  it('un équilibrage à contresens est laissé à zéro, et dit', () => {
    const r = deroulerModele([ligne(0, '60110000', 'CREDIT', 'SAISIR'), ligne(1, '40110000', 'CREDIT', 'EQUILIBRER')], { 0: 100 }, []);
    expect(r.lignes[1].credit).toBe(0);
    expect(r.motif).toMatch(/sens opposé/);
  });

  it('un taux introuvable ne calcule rien, et le dit', () => {
    const r = deroulerModele(achat, { 0: 100 }, []);
    expect(r.lignes[1].debit).toBe(0);
    expect(r.motif).toMatch(/introuvable/);
  });
});
