import { consommerPrechargement, oublierPrechargement, prechargerExercices, VALIDITE_PRECHARGEMENT_MS } from './prechargement';
import type { Exercice } from './types';

/**
 * LE PRÉCHARGEMENT DES EXERCICES · un aller-retour de moins, jamais une
 * réponse périmée.
 */
const liste = [{ id: 'ex1', tenantId: 't1' }] as unknown as Exercice[];

describe('prechargement des exercices', () => {
  beforeEach(() => oublierPrechargement());

  it('la réponse partie au démarrage est reprise, sans nouvelle demande', async () => {
    let appels = 0;
    prechargerExercices(() => {
      appels++;
      return Promise.resolve(liste);
    }, 1000);
    const p = consommerPrechargement(1500);
    expect(p).not.toBeNull();
    expect(await p).toBe(liste);
    expect(appels).toBe(1);
  });

  it('consommée UNE fois · un rechargement suivant interroge le serveur', () => {
    prechargerExercices(() => Promise.resolve(liste), 1000);
    expect(consommerPrechargement(1100)).not.toBeNull();
    expect(consommerPrechargement(1200)).toBeNull();
  });

  it('périmée au-delà de quinze secondes', () => {
    prechargerExercices(() => Promise.resolve(liste), 1000);
    expect(consommerPrechargement(1000 + VALIDITE_PRECHARGEMENT_MS + 1)).toBeNull();
  });

  it('oubliée à la déconnexion · un autre dossier n’hérite pas des exercices du précédent', () => {
    prechargerExercices(() => Promise.resolve(liste), 1000);
    oublierPrechargement();
    expect(consommerPrechargement(1100)).toBeNull();
  });

  it('un échec (pas de session) ne remonte pas comme une promesse rejetée non gérée', async () => {
    const rejets: unknown[] = [];
    const ecouteur = (r: unknown) => rejets.push(r);
    process.on('unhandledRejection', ecouteur);
    prechargerExercices(() => Promise.reject(new Error('401')), 1000);
    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', ecouteur);
    expect(rejets).toEqual([]);
    // Et celui qui la consomme voit bien l'échec, pour redemander.
    await expect(consommerPrechargement(1100)).rejects.toThrow('401');
  });
});

/**
 * LE CÂBLAGE · une fonction juste que personne n'appelle ne fait rien gagner.
 * Lu dans la source, comme les autres specs de câblage du client : monter
 * React et les deux contextes coûterait plus que ce qu'on vérifie.
 */
describe('câblage du préchargement', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lire = (f: string) => require('fs').readFileSync(require('path').join(__dirname, f), 'utf-8') as string;

  it('la vérification de session lance les exercices EN MÊME TEMPS', () => {
    const auth = lire('auth.tsx');
    const effet = auth.slice(auth.indexOf('useEffect(() => {'), auth.indexOf('const seConnecter'));
    expect(effet).toMatch(/prechargerExercices\([\s\S]*chargerUtilisateur\(\)/);
  });

  it('une session refusée et une déconnexion oublient le préchargement', () => {
    const auth = lire('auth.tsx');
    const refus = auth.slice(auth.indexOf('} catch (erreur) {'), auth.indexOf('} finally {'));
    expect(refus).toContain('oublierPrechargement()');
    const sortie = auth.slice(auth.indexOf('const seDeconnecter'));
    expect(sortie.slice(0, 200)).toContain('oublierPrechargement()');
  });

  it('le contexte d’exercice reprend la réponse AU DÉMARRAGE seulement, et redemande si elle a échoué', () => {
    const ex = lire('exercice.tsx');
    expect(ex).toContain('auDemarrage ? consommerPrechargement() : null');
    expect(ex).toMatch(/prechargee\.catch\(\(\) => api\.get<Exercice\[\]>\('\/exercices'\)\)/);
    expect(ex).toContain('recharger(true);');
  });
});
