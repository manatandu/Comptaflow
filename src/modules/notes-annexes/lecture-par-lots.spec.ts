import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOT_LECTURE, lireParLots } from './note-annexe.service';

/**
 * L'INCIDENT DU 2026-09-03, DEUXIÈME PARTIE.
 *
 * Le banc d'un million de lignes a montré que la liasse complète et les
 * notes annexes tuaient le serveur · `JavaScript heap out of memory`,
 * processus arrêté, tous les dossiers de l'instance avec lui. La cause
 * n'était PAS ExcelJS, contrairement à ce qu'on supposait : deux calculs de
 * notes chargeaient en mémoire TOUTES les écritures et TOUTES les lignes
 * non lettrées de l'exercice.
 *
 * Ils lisent désormais par tranches. L'algorithme n'a pas changé · seul le
 * chemin de lecture. Après correction, sur le même banc : notes annexes 200
 * en 43 s, liasse complète 200 en 48 s, serveur vivant à 335 Mo.
 *
 * Aucun test ne pouvait voir la panne : une doublure Prisma rend dix lignes.
 * Ce qui se fige ici, c'est la CORRECTION du parcours · un parcours qui
 * saute ou recompte un élément donne une note annexe fausse, sans erreur.
 */

/** Une source qui se comporte exactement comme Prisma : curseur + `skip: 1`. */
function sourcePaginee(nombre: number, taille: number) {
  const donnees = Array.from({ length: nombre }, (_, i) => ({ id: `l-${String(i).padStart(6, '0')}`, valeur: 1 }));
  let appels = 0;
  return {
    donnees,
    get appels() {
      return appels;
    },
    charger: async (curseur: string | undefined) => {
      appels++;
      const depart = curseur ? donnees.findIndex((d) => d.id === curseur) + 1 : 0;
      return donnees.slice(depart, depart + taille);
    },
  };
}

describe('lecture par lots', () => {
  it('visite chaque élément UNE fois, jamais deux', async () => {
    // Le double comptage est le risque numéro un : sans `skip: 1`, Prisma
    // rend de nouveau la ligne du curseur à chaque tranche, et son montant
    // s'ajoute deux fois à la note.
    const source = sourcePaginee(2503, 100);
    const vus: string[] = [];
    await lireParLots(source.charger, (e) => vus.push(e.id), 100);
    expect(vus).toHaveLength(2503);
    expect(new Set(vus).size).toBe(2503);
    expect(vus).toEqual(source.donnees.map((d) => d.id));
  });

  it('la somme lue égale la somme réelle', async () => {
    const source = sourcePaginee(10_000, 5000);
    let total = 0;
    await lireParLots(source.charger, (e) => (total += e.valeur), 5000);
    expect(total).toBe(10_000);
  });

  it('s’arrête sur un lot INCOMPLET, sans requête pour rien', async () => {
    // 250 éléments par tranches de 100 · trois requêtes suffisent (100, 100,
    // 50). S'arrêter sur un lot vide en aurait demandé une quatrième.
    const source = sourcePaginee(250, 100);
    await lireParLots(source.charger, () => undefined, 100);
    expect(source.appels).toBe(3);
  });

  it('un dernier lot PLEIN demande bien la tranche suivante', async () => {
    // 200 éléments par tranches de 100 : le deuxième lot est plein, on ne
    // peut pas savoir sans demander. Quatre requêtes serait un bogue, deux
    // aussi · trois est le compte juste.
    const source = sourcePaginee(200, 100);
    const vus: string[] = [];
    await lireParLots(source.charger, (e) => vus.push(e.id), 100);
    expect(vus).toHaveLength(200);
    expect(source.appels).toBe(3);
  });

  it('une collection vide ne coûte qu’une requête', async () => {
    const source = sourcePaginee(0, 100);
    await lireParLots(source.charger, () => undefined, 100);
    expect(source.appels).toBe(1);
  });
});

describe('les deux lectures lourdes passent bien par les lots', () => {
  const source = readFileSync(join(__dirname, 'note-annexe.service.ts'), 'utf8');

  it('la ventilation par nature et les échéances sont paginées', () => {
    // Ce sont elles qui tuaient le serveur · une seule des deux remise en
    // lecture unique suffirait à le retuer.
    const parLots = source.match(/this\.parLots\(/g) ?? [];
    expect(parLots).toHaveLength(2);
  });

  it('chaque requête paginée porte `skip: 1` avec son curseur', () => {
    // LA LIGNE QUI ÉVITE LE DOUBLE COMPTAGE. Sans elle le parcours reste
    // correct en apparence et les montants sont faux.
    const curseurs = source.match(/cursor: \{ id: curseur \}, skip: 1/g) ?? [];
    expect(curseurs).toHaveLength(2);
  });

  it('chaque requête paginée est ORDONNÉE · un curseur sans ordre ne veut rien dire', () => {
    const ordres = source.match(/orderBy: \{ id: 'asc' \},\s*\n\s*take: NoteAnnexeService\.LOT_LECTURE/g) ?? [];
    expect(ordres).toHaveLength(2);
  });

  it('le lot reste d’une taille qui tient dans un conteneur', () => {
    expect(LOT_LECTURE).toBeLessThanOrEqual(10_000);
    expect(LOT_LECTURE).toBeGreaterThanOrEqual(500);
  });
});
