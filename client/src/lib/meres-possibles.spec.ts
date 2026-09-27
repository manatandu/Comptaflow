import { meresPossibles } from './meres-possibles';

const d = (id: string, referentiel: string, systeme: string | null, autre: Record<string, unknown> = {}) => ({
  id,
  referentiel,
  systemeComptableSyscohada: systeme,
  dossierMere: null as { id: string } | null,
  licence: { type: 'ABONNEMENT' } as { type: string } | null,
  ...autre,
});

const LISTE = [
  d('asbl', 'SYCEBNL', null),
  d('sa', 'SYSCOHADA', 'NORMAL'),
  d('smt', 'SYSCOHADA', 'MINIMAL_TRESORERIE'),
  d('cellule', 'SYSCOHADA', 'NORMAL', { dossierMere: { id: 'sa' } }),
  d('editeur', 'SYSCOHADA', 'NORMAL', { licence: { type: 'PROPRIETAIRE' } }),
];

describe('les mères proposées par la console (audit final F47)', () => {
  it('ne propose que le même référentiel et, au SYSCOHADA, le même système', () => {
    expect(meresPossibles(LISTE, { referentiel: 'SYCEBNL', systemeComptableSyscohada: null }).map((c) => c.id)).toEqual(['asbl']);
    expect(meresPossibles(LISTE, { referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' }).map((c) => c.id)).toEqual(['sa']);
    expect(meresPossibles(LISTE, { referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'MINIMAL_TRESORERIE' }).map((c) => c.id)).toEqual([
      'smt',
    ]);
  });

  it('écarte le dossier lui-même, les cellules et le dossier de l’éditeur', () => {
    expect(meresPossibles(LISTE, { saufId: 'sa', referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' })).toEqual([]);
  });
});
