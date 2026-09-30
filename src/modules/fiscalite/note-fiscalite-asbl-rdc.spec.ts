import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * PASSE F11 · LA NOTE FISCALE ASBL RELUE CONTRE SES SOURCES.
 *
 * `docs/fiscalite-asbl-rdc.md` se présente comme la matière fiscale du
 * logiciel : c'est par elle qu'une citation fausse reviendrait dans le code.
 * Ces tests gèlent ce que la note DOIT porter, lu dans les textes.
 */
describe('Passe F11 · la note fiscale ASBL', () => {
  const note = readFileSync(join(__dirname, '../../../docs/fiscalite-asbl-rdc.md'), 'utf8');

  it('B9 · rattache le 20 % au texte qui le PORTE (loi n° 83/004, art. 11), le D.-L. n° 109/2000 comme modificatif', () => {
    // 08-autres-textes-impots-revenus.md, art. 11 · « modifié et complété par
    // le D.-L. n° 109/2000 » · « égal à 20% du montant brut du loyer ». Même
    // correction que celle de correspondance-retenues.ts, dont c'était le jumeau.
    const ligne = note.split('\n').find((l) => l.startsWith('| Retenue opérée par le locataire'))!;
    expect(ligne).toContain('art. 11 de la loi n° 83/004 du 23 février 1983, tel que modifié par le D.-L. n° 109/2000');
  });

  it('A1 · la colonne est neutre et les deux régimes de l’O.-L. n° 69-006 sont nommés chacun par son mot', () => {
    expect(note).toContain('| Impôt | Base | Régime ASBL / EUP |');
    const foncier = note.split('\n').find((l) => l.startsWith('| Impôt foncier | O.-L. n° 69-006, art. 2, 2°'))!;
    expect(foncier).toContain('Exemption (art. 2, 2°)');
    // Le litera c) · les EUP, sans condition d'objet.
    expect(foncier).toContain('établissements d\'utilité publique créés par application du décret du 19 juillet 1926');
    expect(foncier).toContain('en vertu de décrets spéciaux');
    const vehicules = note.split('\n').find((l) => l.startsWith('| Impôt sur les véhicules'))!;
    expect(vehicules).toContain('Non-établissement');
    expect(vehicules).toContain('art. 39, 2°');
  });

  it('A1 · porte l’obligation de déclarer dans le mois (art. 36 §2) et laisse la correspondance des régimes non tranchée', () => {
    expect(note).toContain('art. 36 §2');
    expect(note).toContain('**dans le mois**');
    expect(note).toContain('**Non tranché · la correspondance des régimes de personnalité.**');
  });
});
