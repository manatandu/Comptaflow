import { readFileSync } from 'fs';
import { join } from 'path';
import { Referentiel } from '@prisma/client';
import { articleComparabilite, evaluerComparabilite, moisCouverts } from './comparabilite-exercices';

const ex = (debut: string, fin: string) => ({ dateDebut: new Date(debut), dateFin: new Date(fin) });

describe('Comparabilité de la colonne N-1', () => {
  it('deux exercices de douze mois se comparent · l’exception reste l’exception', () => {
    // Présumer l'inverse ferait naître un avertissement sur chaque dossier
    // normal, et on apprendrait à l'ignorer avant le jour où il compte.
    const c = evaluerComparabilite(
      Referentiel.SYCEBNL,
      ex('2026-01-01', '2026-12-31'),
      ex('2025-01-01', '2025-12-31'),
    );
    expect(c.disponible).toBe(true);
    expect(c.comparable).toBe(true);
    expect(c.motifs).toHaveLength(0);
  });

  it('une année BISSEXTILE ne rend rien incomparable · l’unité du texte est le MOIS', () => {
    // AUDCIF art. 7 : « une période de DOUZE MOIS, appelée exercice ». Compter
    // en jours ferait crier le signalement une année sur quatre, sur tous les
    // dossiers du parc, pour un 366e jour qui ne change rien à la comparaison.
    const c = evaluerComparabilite(
      Referentiel.SYSCOHADA,
      ex('2028-01-01', '2028-12-31'), // 366 jours
      ex('2027-01-01', '2027-12-31'), // 365 jours
    );
    expect(c.comparable).toBe(true);
  });

  it('un premier exercice de six mois rend la DEUXIÈME liasse non comparable', () => {
    // Le cas ordinaire, pas un cas limite : l'art. 7 autorise nommément un
    // premier exercice plus court quand l'entité commence au premier semestre.
    const c = evaluerComparabilite(
      Referentiel.SYCEBNL,
      ex('2026-01-01', '2026-12-31'),
      ex('2025-07-01', '2025-12-31'),
    );
    expect(c.comparable).toBe(false);
    expect(c.motifs.map((m) => m.code)).toEqual(['DUREE_DIFFERENTE']);
    expect(c.motifs[0].phrase).toContain('12 mois');
    expect(c.motifs[0].phrase).toContain('6');
  });

  it('un premier exercice PLUS LONG que douze mois est signalé aussi', () => {
    // Même article, l'autre moitié : « supérieure à douze mois pour le premier
    // exercice commencé au cours du deuxième semestre ».
    const c = evaluerComparabilite(
      Referentiel.SYSCOHADA,
      ex('2027-01-01', '2027-12-31'),
      ex('2025-09-01', '2026-12-31'),
    );
    expect(c.comparable).toBe(false);
    expect(moisCouverts(ex('2025-09-01', '2026-12-31'))).toBe(16);
  });

  it('le PREMIER exercice du dossier ne porte aucun motif · il n’a pas de colonne à qualifier', () => {
    // Signaler une non-comparabilité là reprocherait à un dossier neuf de
    // n'avoir pas de passé.
    const c = evaluerComparabilite(Referentiel.SYCEBNL, ex('2026-01-01', '2026-12-31'), null);
    expect(c.disponible).toBe(false);
    expect(c.comparable).toBe(true);
    expect(c.motifs).toHaveLength(0);
  });

  it('chaque référentiel cite SON article, jamais celui de l’autre', () => {
    // L'art. 34 de l'AUDCIF fait partie des articles 25 à 34 que l'art. 3 du
    // SYCEBNL écarte expressément · l'invoquer à une association serait citer
    // un article que son référentiel ne lui applique pas.
    const ebnl = articleComparabilite(Referentiel.SYCEBNL);
    const commercial = articleComparabilite(Referentiel.SYSCOHADA);
    expect(ebnl).toContain('SYCEBNL art. 16, 7°');
    expect(commercial).toContain('AUDCIF art. 34');
    expect(commercial).not.toContain('SYCEBNL art. 16');
    // Le chemin du SYCEBNL NOMME l'AUDCIF, mais pour dire qu'il l'écarte ·
    // c'est l'explication, pas la source servie.
    expect(ebnl).toContain('écarte');
  });

  it('LE MODULE N’ADAPTE RIEN · aucun prorata dans la source', () => {
    // Le texte confie l'adaptation à l'entité. Une adaptation automatique
    // rendrait une colonne plausible, comparable, et inventée · le pire des
    // trois états possibles. Ce test gèle l'absence plutôt que de la laisser à
    // la mémoire de qui relira.
    const source = readFileSync(join(__dirname, 'comparabilite-exercices.ts'), 'utf8');
    const code = source
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//') && !l.trimStart().startsWith('/*'))
      .join('\n');
    for (const interdit of ['prorata', 'proratis', 'adapter(', 'adapte(', 'ajuster(']) {
      expect(code.toLowerCase()).not.toContain(interdit.toLowerCase());
    }
    // Et aucune division par un rapport de durées, qui EST le prorata.
    expect(code).not.toMatch(/moisN\s*\/\s*moisN1|moisN1\s*\/\s*moisN/);
  });
});

// ---------------------------------------------------------------------------
// LE CÂBLAGE, ET PAS SEULEMENT LA RÈGLE. Le module ci-dessus peut être juste
// et n'atteindre personne : le contrôle lit l'exercice précédent par une
// requête dont le `select` ne portait pas `dateDebut`, et une durée ne se
// calcule pas sans elle.
// ---------------------------------------------------------------------------
import { ControlesService } from '../controles/controles.service';
import { PrismaService } from '../../common/prisma.service';

type Faux = Record<string, unknown>;

function serviceControles(referentiel: Referentiel, precedent: { dateDebut: string; dateFin: string } | null) {
  const courant = { id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), dateArreteComptes: new Date('2027-03-31') };
  const prisma = {
    exercice: {
      // La recherche de l'exercice ANTÉRIEUR se reconnaît à son filtre
      // `dateFin: { lt }` · une doublure qui rendrait le même objet aux deux
      // appels ferait comparer l'exercice à lui-même, et le contrôle ne
      // signalerait jamais rien (c'est exactement ce que font les doublures
      // des autres specs, et pourquoi le contrôle porte sa garde).
      findFirst: jest.fn().mockImplementation(({ where }: { where: Faux }) => {
        const filtreFin = where.dateFin as { lt?: Date } | undefined;
        if (filtreFin?.lt) {
          return Promise.resolve(
            precedent ? { id: 'exN1', dateDebut: new Date(precedent.dateDebut), dateFin: new Date(precedent.dateFin) } : null,
          );
        }
        return Promise.resolve(courant);
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService);
}

const anomalie = async (referentiel: Referentiel, precedent: { dateDebut: string; dateFin: string } | null) => {
  const rapport = await serviceControles(referentiel, precedent).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'COMPARATIF_N1_NON_COMPARABLE');
};

describe('le contrôle qui refuse de servir la colonne N-1 en silence', () => {
  it('SYCEBNL · signale un précédent de six mois, et cite SON article', async () => {
    const a = await anomalie(Referentiel.SYCEBNL, { dateDebut: '2025-07-01', dateFin: '2025-12-31' });
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.consequence).toContain('SYCEBNL art. 16, 7°');
    expect(a!.consequence).toContain('Notes annexes');
    // L'action dit que le logiciel n'adapte pas · sans cette phrase, le
    // cabinet attendrait d'OmegaX une adaptation qui ne viendra jamais.
    expect(a!.action).toMatch(/n’adapte aucun chiffre|proratis/i);
  });

  it('SYSCOHADA · même signalement, article de l’AUDCIF', async () => {
    const a = await anomalie(Referentiel.SYSCOHADA, { dateDebut: '2025-07-01', dateFin: '2025-12-31' });
    expect(a!.consequence).toContain('AUDCIF art. 34');
    expect(a!.consequence).not.toContain('SYCEBNL art. 16');
  });

  it('se TAIT quand les deux exercices font douze mois · pas d’anomalie fabriquée', async () => {
    // § 10 bis · un contrôle qui s'allume partout n'apprend à personne qu'à
    // être ignoré, et il emporte les vrais signalements avec lui.
    expect(await anomalie(Referentiel.SYCEBNL, { dateDebut: '2025-01-01', dateFin: '2025-12-31' })).toBeUndefined();
  });

  it('se TAIT sur le premier exercice du dossier', async () => {
    expect(await anomalie(Referentiel.SYSCOHADA, null)).toBeUndefined();
  });
});
