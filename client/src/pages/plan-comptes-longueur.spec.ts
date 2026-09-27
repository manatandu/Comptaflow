import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F144 · la saisie d'un numéro de compte était bornée à huit
 * chiffres en dur, quand le dossier porte sa longueur jusqu'à treize
 * (`Tenant.longueurCompte`) et que le serveur la relit. Un cabinet qui avait
 * élargi sa borne ne pouvait ouvrir aucun sous-compte plus fin.
 */
const plan = readFileSync(join(__dirname, 'PlanComptesPage.tsx'), 'utf8');
const parametres = readFileSync(join(__dirname, 'ParametresDossierPage.tsx'), 'utf8');

describe('F144 · la borne du numéro vient du dossier', () => {
  it('le champ Numéro lit la longueur de la session', () => {
    expect(plan).toContain('const longueurMax = utilisateur?.tenant?.longueurCompte ?? 8;');
    const i = plan.indexOf('Numéro :');
    const champ = plan.slice(i, plan.indexOf('/>', i));
    expect(champ).toContain('pattern={`\\\\d{3,${longueurMax}}`}');
  });

  it('changer la longueur relit la session', () => {
    const i = parametres.indexOf('const changerLongueurCompte = async');
    const corps = parametres.slice(i, parametres.indexOf('} finally {', i));
    expect(corps).toContain('await rafraichir();');
  });
});
