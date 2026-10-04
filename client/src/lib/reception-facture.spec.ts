import { corpsComptabilisation, passageComplet, receptionADeclarer } from './reception-facture';

describe('facture d’achat datée à sa réception (ligne A21)', () => {
  it('la réception se déclare sur un achat qui ne l’a pas, jamais sur une vente', () => {
    expect(receptionADeclarer({ sens: 'ACHAT', dateReception: null })).toBe(true);
    expect(receptionADeclarer({ sens: 'ACHAT' })).toBe(true);
    expect(receptionADeclarer({ sens: 'ACHAT', dateReception: '2026-01-05T00:00:00.000Z' })).toBe(false);
    expect(receptionADeclarer({ sens: 'VENTE', dateReception: null })).toBe(false);
  });

  it('n’envoie la date que lorsqu’elle est à déclarer, et rien n’est prérempli', () => {
    expect(corpsComptabilisation({ sens: 'ACHAT', dateReception: null }, 'j', 'c', '2026-01-05')).toEqual({
      journalId: 'j',
      compteGestionId: 'c',
      dateReception: '2026-01-05',
    });
    expect(corpsComptabilisation({ sens: 'ACHAT', dateReception: '2026-01-05' }, 'j', 'c', '2026-02-01')).toEqual({ journalId: 'j', compteGestionId: 'c' });
    expect(corpsComptabilisation({ sens: 'VENTE' }, 'j', '', '2026-01-05')).toEqual({ journalId: 'j', compteGestionId: null });
  });

  it('le passage attend la réception d’un achat qui ne l’a pas', () => {
    expect(passageComplet({ sens: 'ACHAT', dateReception: null }, 'j', 'c', '')).toBe(false);
    expect(passageComplet({ sens: 'ACHAT', dateReception: null }, 'j', 'c', '2026-01-05')).toBe(true);
    expect(passageComplet({ sens: 'VENTE' }, 'j', 'c', '')).toBe(true);
    expect(passageComplet({ sens: 'VENTE' }, '', 'c', '')).toBe(false);
  });
});
