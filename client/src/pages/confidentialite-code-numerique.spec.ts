import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA POLITIQUE DE CONFIDENTIALITÉ FACE AU CODE DU NUMÉRIQUE CONGOLAIS.
 *
 * Ordonnance-loi n° 23/10 du 13 mars 2023, Livre III. Trois articles la
 * commandent, et la page les nommait tous les trois par leur absence :
 *
 *  · art. 201 · « Les données personnelles sont stockées et/ou hébergées en
 *    République Démocratique du Congo. » OmegaX héberge chez Neon et Google
 *    Cloud, hors RDC. La page le disait déjà · elle ne disait pas SUR QUELLE
 *    BASE, ce qui laissait le lecteur devant un fait sans règle.
 *  · art. 202, 2° · le transfert reste possible s'il est « nécessaire à
 *    l'exécution d'un contrat entre la personne concernée et le responsable
 *    du traitement ».
 *  · art. 244 · notification « sans délai » de toute violation, à l'Autorité
 *    ET à la personne concernée. Aucun engagement de ce genre ne figurait.
 *
 * Ce que la page NE DIT PAS, et c'est délibéré · que l'autorisation préalable
 * de l'art. 201 n'a pas été obtenue. Publier un aveu de non-conformité est une
 * décision de VMG, pas un geste de développement. Voir
 * docs/code-du-numerique-et-omegax.md, qui l'écrit en interne.
 */

const page = readFileSync(join(__dirname, '..', '..', 'src/pages/ConfidentialitePage.tsx'), 'utf8');
const deplie = page.replace(/\s+/g, ' ');

describe('la politique cite le Code du numérique', () => {
  it('nomme le texte, son numéro et sa date', () => {
    expect(deplie).toContain('ordonnance-loi n° 23/10 du 13 mars 2023');
  });

  it('dit la règle de localisation ET la base du transfert', () => {
    // Le fait sans la règle laissait le lecteur juge · la règle sans la base
    // le laisserait inquiet.
    expect(deplie).toContain('hébergées hors de la République démocratique du Congo');
    expect(deplie).toContain('article 201');
    expect(deplie).toContain('article 202');
    expect(deplie).toContain('nécessaire à l’exécution du contrat');
  });

  it('prend l’engagement de notification de l’article 244, à l’Autorité et à la personne', () => {
    expect(deplie).toContain('article 244');
    expect(deplie).toContain('sans délai');
    expect(deplie).toContain('Autorité de protection des données et à vous-même');
  });

  it('renvoie à la restitution complète pour le droit de portabilité', () => {
    // Elle existe depuis G2b · une politique qui promet un export sans dire
    // par où passer promet à moitié.
    expect(deplie).toContain('Restituer le dossier complet');
  });

  it('n’affirme aucune conformité qu’OmegaX ne tient pas', () => {
    // Ni « conforme au Code du numérique », ni « autorisé par l'Autorité ».
    expect(page).not.toMatch(/conforme au Code du numérique|autorisation de l’Autorité a été/i);
  });

  it('laisse les deux adresses en blanc plutôt que d’en inventer', () => {
    expect(deplie).toContain('doivent être arrêtées par VMG Consulting');
    expect(deplie).toContain('adresse inventée dirigerait vos demandes vers le vide');
  });

  it('numérote ses sections sans doublon', () => {
    // Deux « 7. » se suivaient après l'insertion · un document juridique qui
    // se renvoie à lui-même par numéro ne peut pas en avoir deux.
    const numeros = [...page.matchAll(/<Titre>(\d+)\./g)].map(([, n]) => Number(n));
    expect(numeros).toEqual([...Array(numeros.length).keys()].map((i) => i + 1));
  });
});
