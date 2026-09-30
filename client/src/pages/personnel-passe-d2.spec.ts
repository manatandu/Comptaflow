import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PASSES D2, O4 ET F11 · ce que l'écran de la paie lit et envoie. On gèle des
 * PRÉSENCES (une valeur proposée, un champ du corps, une donnée servie
 * affichée), jamais l'absence d'un mot.
 */
const page = readFileSync(join(__dirname, 'PersonnelPage.tsx'), 'utf8');
const bulletins = readFileSync(join(__dirname, 'BulletinsPaie.tsx'), 'utf8');

/** Le bloc qui commence à `debut` et se ferme sur `fin`. */
function bloc(texte: string, debut: string, fin: string): string {
  const i = texte.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return texte.slice(i, texte.indexOf(fin, i));
}

describe('D2 · la majoration des risques professionnels se déclare au niveau notifié', () => {
  it('propose aucune, 50 % et 100 % en récidive, et rien d’autre', () => {
    const choix = bloc(page, 'Majoration risques prof.', '</select>');
    expect(choix).toContain('<option value="">');
    expect(choix).toContain('<option value="50">');
    expect(choix).toContain('<option value="100">');
  });

  it('le corps de la simulation porte le pourcentage, pas un booléen', () => {
    expect(page).toContain('majorationRisquesProfessionnelsPourCent: Number(majorationRp)');
  });
});

describe('D2 · la confrontation affiche l’effet propre à chaque requalification', () => {
  it('l’effet et la réserve viennent du serveur', () => {
    const rendu = bloc(page, 'f.requalifications.map((r) =>', '))}');
    expect(rendu).toContain('{r.effet}');
    expect(rendu).toContain('r.reserve');
  });

  it('l’abstention de l’art. 40, al. 2 est affichée', () => {
    expect(page).toContain('{f.jourLeJourNonCompte}');
  });
});

describe('D2 et F11 · la simulation', () => {
  it('envoie les jours ouvrant droit aux allocations (mention 28)', () => {
    expect(page).toContain('joursAllocationsFamiliales: nombre(joursAllocations)');
  });

  it('affiche la réserve du plafond et celle de l’indemnité de logement à Kinshasa', () => {
    expect(page).toContain('{simulation.reserveTauxLegalAllocations}');
    expect(page).toContain('{simulation.reserveIndemniteLogement}');
  });
});

describe('D2 · le livre de paie', () => {
  it('garde le libellé de l’arrêté de 2008 dans l’aide du second double', () => {
    expect(page).toContain('title={livre.texteSecondDouble}');
  });

  it('nomme les écarts de l’arrêté n° 142/2018', () => {
    expect(page).toContain('livre.arrete1422018.ecarts.map');
  });
});

describe('Recensement · la part de main-d’œuvre se dit « locale », mot de la loi n° 004/2001', () => {
  it('le libellé est celui de l’art. 37, 4°', () => {
    const ligne = bloc(page, 'Loi n° 004/2001, art. 37, 4°', '</td>');
    expect(ligne).toContain('Main-d’œuvre locale');
  });
});

describe('D2 · les assujettis que la paie ne calcule pas, et les numéros CNSS', () => {
  it('l’aide du registre nomme le mandataire, le marin et l’associé actif', () => {
    expect(page).toMatch(/associé actif d’une société, assujettis à toutes les branches de la CNSS/);
  });

  it('les deux numéros CNSS disent le nom que leur donne la Caisse', () => {
    expect(page).toMatch(/numéro d’immatriculation de la carte de sécurité sociale \(arrêté n° 146\/2018/);
    expect(page).toMatch(/certificat d’affiliation que la Caisse délivre à l’employeur \(arrêté n° 146\/2018, art\. 7\)/);
  });
});

describe('D2 · le bulletin émis nomme ce qu’il porte du modèle', () => {
  it('imprime les mentions 5, 6, 27 et 29 servies par le serveur', () => {
    for (const rang of [5, 6, 27, 29]) expect(bulletins).toContain(`{ rang: ${rang},`);
    expect(bulletins).toContain('ouvert.enonciations?.portees.find');
  });

  it('dit les énonciations non portées', () => {
    expect(bulletins).toContain('Énonciations non portées : n° {ouvert.enonciations.nonPortees.join');
  });
});
