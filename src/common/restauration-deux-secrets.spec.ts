import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * AUDIT FINAL F48 · la procédure de restauration ne faisait changer que
 * `API_DATABASE_URL`, alors que le service reçoit `API_DATABASE_URL_POOLED`.
 * Suivie à la lettre, elle migrait la base restaurée pendant que le service
 * écrivait dans l'ancienne, sous un déploiement vert. Un document de
 * procédure d'urgence se relit le jour de l'urgence · ce qu'il doit dire est
 * gelé ici, avec ce que le workflow doit continuer d'afficher pour qu'on le
 * vérifie.
 */
const lire = (f: string) => readFileSync(join(__dirname, '../..', f), 'utf8');

describe('F48 · la restauration bascule les deux chaînes', () => {
  const doc = lire('docs/sauvegardes-et-restauration.md');
  const procedure = doc.slice(doc.indexOf('## Restaurer'), doc.indexOf('## Ce que ça garantit'));

  it('l’étape de bascule nomme les deux secrets, et dit qu’ils désignent la même base', () => {
    expect(procedure.length).toBeGreaterThan(0);
    const bascule = procedure.slice(procedure.indexOf('Basculer l'), procedure.indexOf('Vérifier la bascule'));
    expect(bascule).toContain('`API_DATABASE_URL`');
    expect(bascule).toContain('`API_DATABASE_URL_POOLED`');
    expect(bascule).toMatch(/MÊME\s+base/);
  });

  it('la vérification lit la ligne « endpoint POOLÉ » que le workflow écrit, et prouve l’écriture du service', () => {
    const verification = procedure.slice(procedure.indexOf('Vérifier la bascule'));
    expect(verification).toContain('Base · endpoint POOLÉ');
    expect(verification).toContain('tentativesEchouees');
    // Le workflow écrit bien cette ligne, et donne au service la chaîne poolée d'abord.
    const flux = lire('.github/workflows/deploy-cloud-run.yml');
    expect(flux).toContain('f"Base · endpoint {regime}, plafond de connexions "');
    expect(flux).toContain('DATABASE_URL: ${{ secrets.API_DATABASE_URL_POOLED || secrets.API_DATABASE_URL }}');
  });

  it('la liste des actions du propriétaire renvoie à la bascule des deux secrets', () => {
    expect(lire('docs/actions-du-proprietaire.md')).toMatch(/une bascule change les DEUX secrets/);
  });
});
