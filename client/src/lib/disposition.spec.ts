import { nomDeDisposition } from './disposition';

describe('le nom du fichier téléchargé', () => {
  it('prend la forme UTF-8 avant le repli ASCII · un nom accentué reste accentué', () => {
    expect(
      nomDeDisposition(`attachment; filename="Societe Demo.pdf"; filename*=UTF-8''Soci%C3%A9t%C3%A9%20D%C3%A9mo.pdf`),
    ).toBe('Société Démo.pdf');
  });

  it('retombe sur le repli ASCII, puis sur rien', () => {
    expect(nomDeDisposition('attachment; filename="balance-2026.xlsx"')).toBe('balance-2026.xlsx');
    expect(nomDeDisposition(null)).toBeUndefined();
  });
});
