import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import {
  contratCouvrantLeMois,
  moisValide,
  motifRefusRemise,
  motifsRefusEmission,
  nomCompletMajuscules,
  type SimulationEmissible,
} from './bulletin-paie';
import type { SimulationPaieDto } from './dto/personnel.dto';

/**
 * P8 · LE BULLETIN ÉMIS. Deux moitiés, comme depuis F4a : la RÈGLE (fonctions
 * pures) et le CÂBLAGE (le service l'appelle, avec la bonne entrée, et refuse
 * là où elle refuse).
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('le contrat en cours sur le mois', () => {
  const c = (id: string, debut: string, fin: string | null) => ({
    id,
    dateEntreeEnVigueur: d(debut),
    dateFin: fin ? d(fin) : null,
  });

  it('retient un contrat entré en vigueur pendant le mois', () => {
    expect(contratCouvrantLeMois([c('a', '2026-03-20', null)], '2026-03')?.id).toBe('a');
  });

  it("écarte un contrat qui n'entre en vigueur qu'au mois suivant", () => {
    expect(contratCouvrantLeMois([c('a', '2026-04-01', null)], '2026-03')).toBeNull();
  });

  it('écarte un contrat terminé avant le premier jour du mois', () => {
    expect(contratCouvrantLeMois([c('a', '2025-01-01', '2026-02-28')], '2026-03')).toBeNull();
  });

  it('retient un contrat terminé en cours de mois · la paie de ce mois lui appartient', () => {
    expect(contratCouvrantLeMois([c('a', '2025-01-01', '2026-03-10')], '2026-03')?.id).toBe('a');
  });

  it('prend le PLUS RÉCENT quand un renouvellement tombe dans le mois', () => {
    const r = contratCouvrantLeMois([c('ancien', '2025-03-15', '2026-03-14'), c('nouveau', '2026-03-15', null)], '2026-03');
    expect(r?.id).toBe('nouveau');
  });
});

describe('les refus d’émettre · aucun montant provisoire sur un décompte opposable', () => {
  const complete: SimulationEmissible = {
    baremeApplicable: true,
    motifBaremeInapplicable: null,
    retenue: { retenueFc: 12_000 },
    cotisations: { totalEmployeurFc: 130_000, totalTravailleurFc: 50_000, abstentions: [] },
    net: { totalVerseFc: 1_000_000, netAPayerFc: 938_000 },
    assiettes: { assietteSocialeFc: 1_000_000 },
  };

  it('une simulation complète s’émet', () => {
    expect(motifsRefusEmission(complete)).toEqual([]);
  });

  it("un impôt non chiffré bloque · jamais un zéro par défaut", () => {
    expect(motifsRefusEmission({ ...complete, retenue: null }).join(' ')).toContain('article 119');
  });

  it('une cotisation en abstention bloque, avec son motif', () => {
    const m = motifsRefusEmission({
      ...complete,
      cotisations: { ...complete.cotisations, abstentions: ['INPP · nature de l’employeur non déclarée'] },
    });
    expect(m).toEqual(['Cotisation non chiffrée · INPP · nature de l’employeur non déclarée']);
  });

  it('un barème hors période bloque', () => {
    expect(
      motifsRefusEmission({ ...complete, baremeApplicable: false, motifBaremeInapplicable: 'avant 2026' }),
    ).toHaveLength(1);
  });

  it('un net indéterminé bloque', () => {
    expect(motifsRefusEmission({ ...complete, net: { totalVerseFc: 1, netAPayerFc: null } })).toContain(
      'Net à payer indéterminé.',
    );
  });
});

describe('les mentions recopiées et la remise', () => {
  it('écrit les noms en MAJUSCULES D’IMPRIMERIE, post-nom compris (mention 2)', () => {
    expect(nomCompletMajuscules({ nom: 'Mukendi', postNom: 'Kabasele', prenoms: 'Élodie' })).toBe(
      'MUKENDI KABASELE ÉLODIE',
    );
    expect(nomCompletMajuscules({ nom: 'Ilunga', postNom: null, prenoms: ' ' })).toBe('ILUNGA');
  });

  it('lit le mois sous la forme AAAA-MM et rien d’autre', () => {
    expect(moisValide('2026-03')).toBe(true);
    expect(moisValide('2026-13')).toBe(false);
    expect(moisValide('2026-3')).toBe(false);
  });

  it('refuse une remise antérieure à l’émission ou future, admet le jour même', () => {
    const emis = new Date('2026-03-31T15:00:00Z');
    const maintenant = new Date('2026-04-02T09:00:00Z');
    expect(motifRefusRemise(d('2026-03-30'), emis, maintenant)).toMatch(/précéder/);
    expect(motifRefusRemise(d('2026-04-03'), emis, maintenant)).toMatch(/l'avance/);
    expect(motifRefusRemise(d('2026-03-31'), emis, maintenant)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────
// LE CÂBLAGE
// ────────────────────────────────────────────────────────────────────────

const SALARIE = {
  id: 's-1',
  nom: 'Mukendi',
  postNom: 'Kabasele',
  prenoms: 'Élodie',
  matricule: 'M-014',
  numeroAffiliationCnss: 'CNSS-77',
  nomConjoint: null,
  _count: { enfants: 0 },
  contrats: [
    {
      id: 'c-1',
      dateEntreeEnVigueur: d('2025-01-01'),
      dateFin: null,
      natureTravail: 'Comptable',
      categorieProfessionnelle: 'Maîtrise',
    },
  ],
};

function service(opts: { salarie?: unknown; actif?: unknown; max?: number | null; collisions?: number } = {}) {
  let collisions = opts.collisions ?? 0;
  const create = jest.fn().mockImplementation(({ data }) => {
    if (collisions > 0) {
      collisions -= 1;
      return Promise.reject(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
      );
    }
    return Promise.resolve({ id: 'b-1', ...data });
  });
  const bulletinFindFirst = jest.fn().mockImplementation(({ where }) => {
    // Deux lectures distinctes · la recherche d'un bulletin ACTIF du mois, et
    // la relecture après émission par identifiant.
    if (where.statut) return Promise.resolve(opts.actif ?? null);
    return Promise.resolve({
      id: where.id,
      totalVerseFc: new Prisma.Decimal(0),
      assietteSocialeFc: new Prisma.Decimal(0),
      cotisationsTravailleurFc: new Prisma.Decimal(0),
      cotisationsEmployeurFc: new Prisma.Decimal(0),
      irppFc: new Prisma.Decimal(0),
      netAPayerFc: new Prisma.Decimal(0),
    });
  });
  const aggregate = jest.fn().mockResolvedValue({ _max: { numero: opts.max ?? null } });
  const prisma: Record<string, unknown> = {
    salarie: { findFirst: jest.fn().mockResolvedValue(opts.salarie === undefined ? SALARIE : opts.salarie) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    versionBaremePaie: { findMany: jest.fn().mockResolvedValue([]) },
    bulletinPaie: { findFirst: bulletinFindFirst, aggregate, create, update: jest.fn() },
  };
  prisma.$transaction = (fn: (tx: unknown) => unknown) => fn(prisma);
  return { svc: new PersonnelService(prisma as unknown as PrismaService), create, aggregate, prisma };
}

const dto = (over: Partial<SimulationPaieDto> = {}): SimulationPaieDto =>
  ({
    moisDePaie: '2026-03',
    elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 1_000_000 }],
    natureEmployeurInpp: 'PRIVE',
    effectif: 12,
    ...over,
  }) as SimulationPaieDto;

describe('émettre · le serveur rejoue le calcul et fige ce qu’il rend', () => {
  it('fige les montants de SA simulation, jamais un montant venu du client', async () => {
    const { svc, create } = service();
    const attendu = await svc.simulerPaie('t-1', 's-1', dto());
    await svc.emettreBulletin('t-1', 'u-1', 's-1', dto());
    const data = create.mock.calls[0][0].data;
    expect(data.netAPayerFc).toBe(attendu.net.netAPayerFc);
    expect(data.irppFc).toBe(attendu.retenue?.retenueFc);
    expect(data.cotisationsEmployeurFc).toBe(attendu.cotisations.totalEmployeurFc);
    expect(data.calcul).toEqual(JSON.parse(JSON.stringify(attendu)));
  });

  it('un salaire en USD est figé au cours du JOUR D’ÉMISSION, et le bulletin garde le cours', async () => {
    const { svc, create, prisma } = service();
    // Deux jours cotés · seul celui de l'émission doit servir.
    const cotes: Record<string, number> = { '2026-03-30': 2800, '2026-03-31': 2825 };
    prisma.coursDevise = {
      findFirst: jest.fn(async ({ where }: { where: { date: Date } }) => {
        const c = cotes[where.date.toISOString().slice(0, 10)];
        return c === undefined ? null : { cours: c, source: 'BCC' };
      }),
    };
    const enUsd = dto({
      deviseStipulation: 'USD',
      elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantUsd: 400 }],
    } as Partial<SimulationPaieDto>);
    await svc.emettreBulletin('t-1', 'u-1', 's-1', enUsd, new Date('2026-03-31T10:00:00Z'));
    const data = create.mock.calls[0][0].data;
    expect(data.totalVerseFc).toBe(1_130_000);
    expect(data.calcul.conversion).toMatchObject({ cours: 2825, dateCours: '2026-03-31' });
    // L'entrée garde la stipulation telle quelle · on sait relire ce qui a été convenu.
    expect(data.entree.elements[0]).toMatchObject({ montantUsd: 400 });
  });

  it('recopie les mentions 1 à 4 à la date d’émission, nom en majuscules', async () => {
    const { svc, create } = service();
    await svc.emettreBulletin('t-1', 'u-1', 's-1', dto());
    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      nomComplet: 'MUKENDI KABASELE ÉLODIE',
      matricule: 'M-014',
      emploi: 'Comptable',
      categorieProfessionnelle: 'Maîtrise',
      numeroAffiliationCnss: 'CNSS-77',
      contratId: 'c-1',
      emisPar: 'u-1',
    });
  });

  it('numérote à la suite du plus grand numéro du dossier, annulés compris (art. 214)', async () => {
    const { svc, create, aggregate } = service({ max: 41 });
    await svc.emettreBulletin('t-1', 'u-1', 's-1', dto());
    expect(create.mock.calls[0][0].data.numero).toBe(42);
    // Aucun filtre de statut sur le maximum · un numéro annulé ne se réutilise pas.
    expect(aggregate.mock.calls[0][0].where).toEqual({ tenantId: 't-1' });
  });

  it('refuse sans rien créer quand l’INPP est en abstention', async () => {
    const { svc, create } = service();
    await expect(svc.emettreBulletin('t-1', 'u-1', 's-1', dto({ natureEmployeurInpp: undefined }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse sans contrat en cours sur le mois', async () => {
    const { svc, create } = service({ salarie: { ...SALARIE, contrats: [] } });
    await expect(svc.emettreBulletin('t-1', 'u-1', 's-1', dto())).rejects.toThrow(/Aucun contrat/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse quand le seul contrat du salarié est terminé avant le mois · jamais de contrat de repli', async () => {
    // Trouvé par réinjection : un service qui retombait sur le premier contrat
    // venu passait tous les tests, le seul cas « sans contrat » ayant une
    // liste vide. Ici la liste n'est PAS vide, et le bulletin porterait un
    // contrat rompu depuis trois mois.
    const termine = { ...SALARIE.contrats[0], dateFin: d('2025-12-31') };
    const { svc, create } = service({ salarie: { ...SALARIE, contrats: [termine] } });
    await expect(svc.emettreBulletin('t-1', 'u-1', 's-1', dto())).rejects.toThrow(/Aucun contrat/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse un second bulletin actif pour le même salarié et le même mois', async () => {
    const { svc, create } = service({ actif: { numero: 7 } });
    await expect(svc.emettreBulletin('t-1', 'u-1', 's-1', dto())).rejects.toThrow(/n° 7/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse un salarié d’un autre dossier', async () => {
    const { svc } = service({ salarie: null });
    await expect(svc.emettreBulletin('t-1', 'u-1', 's-x', dto())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejoue une fois sur collision de numéro, puis s’arrête', async () => {
    const une = service({ collisions: 1 });
    await une.svc.emettreBulletin('t-1', 'u-1', 's-1', dto());
    expect(une.create).toHaveBeenCalledTimes(2);

    const deux = service({ collisions: 2 });
    await expect(deux.svc.emettreBulletin('t-1', 'u-1', 's-1', dto())).rejects.toThrow(/réessayez/);
  });
});

describe('annuler et remettre · jamais modifier', () => {
  function avecBulletin(b: Record<string, unknown>) {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      bulletinPaie: {
        findFirst: jest.fn().mockImplementation(({ select }) =>
          Promise.resolve(
            select
              ? b
              : {
                  ...b,
                  totalVerseFc: 0,
                  assietteSocialeFc: 0,
                  cotisationsTravailleurFc: 0,
                  cotisationsEmployeurFc: 0,
                  irppFc: 0,
                  netAPayerFc: 0,
                },
          ),
        ),
        update,
      },
    } as unknown as PrismaService;
    return { svc: new PersonnelService(prisma), update };
  }

  it('exige un motif, et n’annule qu’un bulletin émis', async () => {
    const { svc, update } = avecBulletin({ statut: 'EMIS' });
    await expect(svc.annulerBulletin('t-1', 'u-1', 'b-1', '  ')).rejects.toThrow(/motif/);
    await svc.annulerBulletin('t-1', 'u-1', 'b-1', 'Prime oubliée');
    expect(update.mock.calls[0][0].data).toMatchObject({
      statut: 'ANNULE',
      annulePar: 'u-1',
      motifAnnulation: 'Prime oubliée',
    });

    const deja = avecBulletin({ statut: 'ANNULE' });
    await expect(deja.svc.annulerBulletin('t-1', 'u-1', 'b-1', 'Encore une fois')).rejects.toThrow(/déjà annulé/);
  });

  it('déclare la remise une seule fois', async () => {
    const hier = new Date(Date.now() - 86_400_000);
    const libre = avecBulletin({ statut: 'EMIS', remisLe: null, emisLe: hier });
    await libre.svc.declarerRemise('t-1', 'b-1', new Date().toISOString());
    expect(libre.update).toHaveBeenCalledTimes(1);

    const deja = avecBulletin({ statut: 'EMIS', remisLe: hier, emisLe: hier });
    await expect(deja.svc.declarerRemise('t-1', 'b-1', new Date().toISOString())).rejects.toThrow(/déjà déclarée/);
  });

  it('LE SERVICE NE MODIFIE UN BULLETIN QU’EN L’ANNULANT OU EN DATANT SA REMISE, et ne le supprime jamais', () => {
    // Art. 4 de l'arrêté de 2008 · écriture indélébile. On gèle ce que le code
    // FAIT : chaque `bulletinPaie.update` n'écrit que les champs d'annulation
    // ou la date de remise, et aucun `delete` n'existe.
    const source = readFileSync(join(__dirname, 'personnel.service.ts'), 'utf8');
    expect(source).not.toMatch(/bulletinPaie\.(delete|deleteMany|updateMany|upsert)\(/);
    const updates = [...source.matchAll(/bulletinPaie\.update\(\{[\s\S]*?data: \{([^}]*)\}/g)].map((m) =>
      m[1]
        .split(',')
        .map((x) => x.split(':')[0].trim())
        .filter(Boolean)
        .sort()
        .join(','),
    );
    expect(updates.sort()).toEqual(['annuleLe,annulePar,motifAnnulation,statut', 'remisLe']);
  });
});

describe('les routes', () => {
  const ctrl = readFileSync(join(__dirname, 'personnel.controller.ts'), 'utf8');
  const bloc = (route: string) => ctrl.slice(ctrl.indexOf(route), ctrl.indexOf('async', ctrl.indexOf(route)));

  it('la consultation est ouverte au réviseur', () => {
    expect(bloc("@Get('bulletins')")).toContain('LECTURE_SEULE');
    expect(bloc("@Get('bulletins/:id')")).toContain('LECTURE_SEULE');
  });

  it('émettre, annuler et remettre ne le sont pas', () => {
    for (const r of ["@Post('salaries/:salarieId/bulletins')", "@Post('bulletins/:id/annulation')", "@Post('bulletins/:id/remise')"]) {
      expect([r, bloc(r).includes('LECTURE_SEULE')]).toEqual([r, false]);
      expect([r, bloc(r).includes('@Roles(')]).toEqual([r, true]);
    }
  });
});
