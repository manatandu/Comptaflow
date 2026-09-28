import { Referentiel } from '@prisma/client';
import { NATURES_RETENUES, reservePourReferentiel } from './correspondance-retenues';

/**
 * RÉSERVES DU REGISTRE DES RETENUES · ce qu'elles citent, et à quelle date.
 *
 * On gèle ce que la réserve SERVIE dit (par `reservePourReferentiel`, que le
 * service appelle), jamais l'absence d'un mot dans la source.
 */
const nature = (cle: string) => NATURES_RETENUES.find((n) => n.cle === cle)!;
const servie = (cle: string, referentiel: Referentiel) => reservePourReferentiel(nature(cle), referentiel) ?? '';

describe('TVA · la réserve servie à une association cite la bonne base légale', () => {
  // L'arrêté n° 007/CAB/MIN/FINANCES/2025 ne traite pas de TVA (art. 1er à 6) ;
  // l'exonération d'une ASBL vient de l'O.-L. n° 10/001, art. 15, 2° et 17, 8°,
  // et son exemption d'IS de la loi n° 23/053, art. 5, point 3.
  const reserve = servie('tva', Referentiel.SYCEBNL);

  it("rattache l'exonération aux articles 15, 2° et 17, 8° de l'ordonnance-loi n° 10/001", () => {
    expect(reserve).toContain('ordonnance-loi n° 10/001, art. 15, 2°');
    expect(reserve).toContain('même texte, art. 17, 8°');
  });

  it("rattache l'exemption d'IS de l'ASBL à l'art. 5, point 3, et dit que l'arrêté n° 007 ne traite pas de TVA", () => {
    expect(reserve).toContain('loi n° 23/053, art. 5, point 3');
    expect(reserve).toContain(
      "pris pour la seule exemption d'IS des établissements d'utilité publique et des ONG (art. 1er), ne traite pas de TVA",
    );
  });
});

describe('D3 · les natures dont la base est entrée en vigueur au 1er janvier 2026 portent leur borne', () => {
  const CAS: Array<{ cle: string; textes: string[] }> = [
    {
      cle: 'capitauxMobiliers',
      textes: ['loi n° 23/053 (art. 153)', 'inséré par la loi n° 23/052 (art. 2 et 6)', 'n° 008/CAB/MIN/FINANCES/2025 (art. 4)', "l'impôt mobilier"],
    },
    { cle: 'irppSalaires', textes: ['loi n° 23/053, art. 153', 'loi n° 23/052 (art. 1er et 6)', 'revenus salariaux (art. 5)'] },
    { cle: 'plusValues', textes: ['loi n° 23/053 (art. 153)', 'article 18 ter', 'loi n° 23/052 (art. 2 et 6)'] },
    { cle: 'prestatairesNonResidents', textes: ['article 144 de la loi n° 23/053 (art. 153)', 'article 22 bis', 'loi n° 23/052 (art. 1er et 6)'] },
  ];

  for (const { cle, textes } of CAS) {
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      it(`${cle} · ${referentiel}`, () => {
        const reserve = servie(cle, referentiel);
        expect(reserve).toContain('EN VIGUEUR AU 1er JANVIER 2026');
        expect(reserve).toContain('SUR UN EXERCICE ANTÉRIEUR');
        expect(reserve).toMatch(/ici ne lui sont pas opposables/);
        for (const t of textes) expect(reserve).toContain(t);
      });
    }
  }
});
