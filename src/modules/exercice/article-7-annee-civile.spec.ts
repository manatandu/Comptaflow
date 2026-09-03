import { BadRequestException } from '@nestjs/common';
import { ExerciceService, exerciceSuivantApres } from './exercice.service';

/**
 * L'EXERCICE COÏNCIDE AVEC L'ANNÉE CIVILE · AUDCIF art. 7, et glossaire du
 * SYCEBNL à l'entrée EXERCICE, mot pour mot. L'article n'est pas dans la liste
 * d'exclusion de l'art. 3 du SYCEBNL : la règle vaut des deux côtés.
 *
 * DEUX DÉFAUTS QUE RIEN NE POUVAIT VOIR, ET QUI SONT LA RAISON DE CE FICHIER.
 *
 * 1. La création d'exercice n'exigeait que « fin après début ». Un exercice du
 *    15 mars au 20 août était accepté, et plus rien en aval ne pouvait le
 *    rattraper : l'en-tête obligatoire des états publiait « Exercice clos le
 *    20-08 », le planning de clôture calculait ses échéances depuis cette
 *    date, la liasse entière était cohérente avec une période illégale. Un
 *    garde-fou absent à la racine ne laisse aucune trace en aval.
 *
 * 2. La clôture engendrait l'exercice suivant en RECOPIANT la durée du
 *    précédent en millisecondes. Sur deux années de même longueur le compte
 *    tombait juste ; il tombait faux dès qu'une année bissextile entrait dans
 *    le calcul, et il tombait faux SILENCIEUSEMENT, parce que l'en-tête
 *    imprime la durée en mois entamés, qui restait douze.
 *
 * Les deux tests ci-dessous partent du texte, pas du code.
 */

const service = (nombreDExercicesExistants: number) =>
  new ExerciceService(
    { exercice: { count: async () => nombreDExercicesExistants, create: async (a: unknown) => a } } as never,
    {} as never,
  );

const creer = (nbExistants: number, dateDebut: string, dateFin: string, liquidation?: boolean) =>
  service(nbExistants).creer('t1', { dateDebut, dateFin, ...(liquidation ? { liquidation } : {}) });

describe('article 7 · la création d’exercice', () => {
  it('accepte l’année civile', async () => {
    await expect(creer(3, '2026-01-01', '2026-12-31')).resolves.toBeDefined();
  });

  it('refuse un exercice qui ne finit pas un 31 décembre', async () => {
    // Le cas qui passait : n'importe quel couple de dates ordonnées.
    await expect(creer(0, '2026-03-15', '2026-08-20')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse à un exercice qui n’est pas le premier de s’écarter de l’année civile', async () => {
    await expect(creer(1, '2026-04-01', '2026-12-31')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte le premier exercice du premier semestre, plus court que douze mois', async () => {
    // « La durée de l'exercice EST exceptionnellement inférieure à douze mois
    // pour le premier exercice débutant au cours du premier semestre. »
    await expect(creer(0, '2026-04-01', '2026-12-31')).resolves.toBeDefined();
  });

  it('refuse au premier exercice du premier semestre de déborder sur l’année suivante', async () => {
    await expect(creer(0, '2026-04-01', '2027-12-31')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte le premier exercice du deuxième semestre, plus long que douze mois', async () => {
    // « Cette durée PEUT être supérieure à douze mois pour le premier exercice
    // commencé au cours du deuxième semestre. » Les deux fins sont ouvertes.
    await expect(creer(0, '2026-09-01', '2027-12-31')).resolves.toBeDefined();
    await expect(creer(0, '2026-09-01', '2026-12-31')).resolves.toBeDefined();
  });

  it('refuse un premier exercice de plus de vingt-quatre mois', async () => {
    await expect(creer(0, '2026-09-01', '2028-12-31')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('laisse passer l’exercice de liquidation, et lui seul', async () => {
    // Art. 7 al. 4 · « la durée des opérations de liquidation est comptée pour
    // un seul exercice ». Déclaré explicitement, jamais toléré par défaut.
    await expect(creer(4, '2026-03-15', '2028-06-30', true)).resolves.toBeDefined();
    await expect(creer(4, '2026-03-15', '2028-06-30')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('article 7 · l’exercice engendré par la clôture', () => {
  it('finit toujours un 31 décembre, y compris autour des années bissextiles', () => {
    // 2024 et 2028 sont bissextiles. La recopie de durée donnait
    // respectivement le 30 décembre 2024 (après clôture de 2023) et le
    // 1er janvier 2026 (après clôture de 2024).
    for (const annee of [2023, 2024, 2025, 2026, 2027, 2028]) {
      const suivant = exerciceSuivantApres(new Date(Date.UTC(annee, 11, 31)));
      expect({
        annee,
        debut: suivant.dateDebut.toISOString().slice(0, 10),
        fin: suivant.dateFin.toISOString().slice(0, 10),
      }).toEqual({
        annee,
        debut: `${annee + 1}-01-01`,
        fin: `${annee + 1}-12-31`,
      });
    }
  });

  it('régularise un exercice hérité qui ne finissait pas un 31 décembre', () => {
    // Un dossier repris peut porter un exercice illégal créé avant le
    // garde-fou. La clôture ne le perpétue pas : le suivant rentre dans
    // l'année civile, quitte à être court.
    const suivant = exerciceSuivantApres(new Date(Date.UTC(2026, 7, 20)));
    expect(suivant.dateDebut.toISOString().slice(0, 10)).toBe('2026-08-21');
    expect(suivant.dateFin.toISOString().slice(0, 10)).toBe('2026-12-31');
  });
});
