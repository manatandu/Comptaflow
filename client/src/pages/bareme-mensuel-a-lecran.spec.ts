import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE BARÈME AU MOIS, À L'ÉCRAN ET SUR LE BULLETIN.
 *
 * Un salaire se paie au mois : la simulation et le bulletin émis montrent la
 * retenue avec les tranches divisées par douze. Le calcul reste celui du
 * serveur (`bareme-irpp.ts`, `detailMensuel`) · si l'un des deux écrans
 * recalculait de son côté, ils pourraient afficher deux impôts différents pour
 * le même salarié.
 */
const lire = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const composant = lire('BaremeMensuelIrpp.tsx');

describe('le barème mensuel de l’IRPP', () => {
  it('est rendu par le même composant sur la simulation et sur le bulletin', () => {
    expect(lire('PersonnelPage.tsx')).toContain('<BaremeMensuelIrpp');
    expect(lire('PersonnelPage.tsx')).toContain('mensuel={simulation.retenue.mensuel}');
    expect(lire('BulletinsPaie.tsx')).toContain('mensuel={ouvert.calcul.retenue.mensuel}');
  });

  it('titre ses colonnes au mois', () => {
    expect(composant).toContain('Tranche mensuelle');
    expect(composant).toContain('Base du mois');
  });

  it('affiche ce que le serveur rend, tranche par tranche, sans recalcul', () => {
    // Présences gelées : la borne, la base et l'impôt viennent de la ligne rendue.
    expect(composant).toContain('mensuel.parTranche.map');
    expect(composant).toContain('fc(t.baseFc)');
    expect(composant).toContain('fc(t.impotFc)');
    expect(composant).toContain('fc(mensuel.retenueFc)');
  });
});
