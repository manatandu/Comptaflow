import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Prisma, Referentiel, RoleUtilisateur } from '@prisma/client';
import { PerimetreService } from './perimetre.service';
import { ConsolidationController } from './consolidation.controller';
import { REFERENTIELS_KEY } from '../../common/decorators/referentiels.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { EXERCICE_REQUIS } from './exercice-requis';

/**
 * Le câblage du périmètre · le moteur est testé à part, ici on vérifie que le
 * service lui passe ce qui est en base, qu'il refuse AVANT d'écrire, et que la
 * route est fermée au SYCEBNL.
 */
const T = 'dossier-1';
const EX = 'ex-2026';

function doublure() {
  const entites: any[] = [];
  const liens: any[] = [];
  const faits: any[] = [];
  let n = 0;
  // La doublure HONORE les filtres comme Prisma · un champ `undefined` ne
  // filtre rien, et `{ not: x }` écarte x (audit final F234 et F235). Une
  // doublure qui prendrait `undefined` pour un refus ferait passer pour
  // cloisonnée une lecture qui, en base, rend tout le dossier.
  const vaut = (r: any, k: string, v: any) =>
    v === undefined || (v && typeof v === 'object' && 'not' in v ? r[k] !== v.not : r[k] === v);
  const filtre = (rows: any[], where: any) =>
    rows.filter((r) => Object.entries(where ?? {}).every(([k, v]) => vaut(r, k, v)));
  const prisma: any = {
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ id: T, nom: 'Mère SA' })) },
    exercice: {
      findFirst: jest.fn(async ({ where }: any) =>
        (where.id === undefined || where.id === EX) && where.tenantId === T
          ? { id: EX, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }
          : null,
      ),
    },
    entitePerimetreConsolidation: {
      findMany: jest.fn(async ({ where }: any) => filtre(entites, where)),
      findFirst: jest.fn(async ({ where }: any) => filtre(entites, where)[0] ?? null),
      create: jest.fn(async ({ data }: any) => {
        const e = {
          id: `e${++n}`,
          designationMajoriteDeuxExercices: false,
          aucunAutreAssocieSuperieur: false,
          controleContractuel: false,
          accordControleConjoint: false,
          influenceNotableDeclaree: false,
          motifExclusion: null,
          justificationExclusion: null,
          dateCloture: null,
          ...data,
        };
        entites.push(e);
        return e;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const e = entites.find((x) => x.id === where.id);
        for (const [k, v] of Object.entries(data)) if (v !== undefined) e[k] = v;
        return e;
      }),
      delete: jest.fn(),
    },
    lienParticipationConsolidation: {
      findMany: jest.fn(async ({ where }: any) => filtre(liens, where)),
      findFirst: jest.fn(async ({ where }: any) => filtre(liens, where)[0] ?? null),
      create: jest.fn(async ({ data }: any) => {
        const l = { id: `l${++n}`, createdAt: new Date(), ...data };
        liens.push(l);
        return l;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const l = liens.find((x) => x.id === where.id);
        for (const [k, v] of Object.entries(data)) if (v !== undefined) l[k] = v;
        return l;
      }),
      delete: jest.fn(),
    },
    operationReciproqueConsolidation: { findMany: jest.fn(async () => []) },
    resultatInterneConsolidation: { findMany: jest.fn(async () => []) },
    ecartEvaluationConsolidation: { findMany: jest.fn(async () => []) },
    provisionChangeConsolidation: { findMany: jest.fn(async () => []) },
    faitsConsolidationExercice: {
      findFirst: jest.fn(async ({ where }: any) => filtre(faits, where)[0] ?? null),
      create: jest.fn(async ({ data }: any) => {
        const f = { id: `f${++n}`, ...data };
        faits.push(f);
        return f;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const f = faits.find((x) => x.id === where.id);
        for (const [k, v] of Object.entries(data)) if (v !== undefined) f[k] = v;
        return f;
      }),
    },
  };
  return { prisma, entites, liens, faits, service: new PerimetreService(prisma) };
}

async function entite(s: PerimetreService, nom: string, extra: Record<string, unknown> = {}) {
  return s.creerEntite(T, { exerciceId: EX, nom, ...extra } as any);
}

describe('PerimetreService · le câblage du moteur', () => {
  it('une participation sans détentrice est celle du dossier, qui est la consolidante', async () => {
    const { service } = doublure();
    const a = await entite(service, 'Filiale A');
    await service.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 80, pctCapital: 70 });
    const etat = await service.etat(T, EX);
    const r = etat.resultats.find((x) => x.id === a.id)!;
    expect(r).toMatchObject({ pctControle: 80, pctInteret: 70, methode: 'IG' });
    expect(etat.resultats.find((x) => x.estConsolidante)?.id).toBe(T);
    expect(etat.obligation.obligation).not.toBe('NON_REQUISE');
  });

  it('la date de clôture de la consolidante est celle de l’exercice (art. 97)', async () => {
    const { service } = doublure();
    const a = await entite(service, 'A', { dateCloture: '2026-06-30' });
    await service.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 80, pctCapital: 80 });
    const etat = await service.etat(T, EX);
    expect(etat.resultats.find((x) => x.id === a.id)?.dateCloture?.verdict).toBe('ETATS_SUPPLEMENTAIRES');
  });

  it('une participation croisée entre filiales est refusée AVANT d’être écrite', async () => {
    const { service, liens } = doublure();
    const a = await entite(service, 'A');
    const b = await entite(service, 'B');
    await service.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 80, pctCapital: 80 });
    await service.ajouterLien(T, { exerciceId: EX, detentriceId: a.id, detenueId: b.id, pctDroitsVote: 30, pctCapital: 30 });
    await expect(
      service.ajouterLien(T, { exerciceId: EX, detentriceId: b.id, detenueId: a.id, pctDroitsVote: 10, pctCapital: 10 }),
    ).rejects.toThrow(/Participations croisées entre filiales/);
    expect(liens).toHaveLength(2);
  });

  it('plus de 100 % sur une même détenue est refusé, et rien n’est écrit', async () => {
    const { service, liens } = doublure();
    const a = await entite(service, 'A');
    const b = await entite(service, 'B');
    await service.ajouterLien(T, { exerciceId: EX, detenueId: b.id, pctDroitsVote: 60, pctCapital: 60 });
    await service.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 90, pctCapital: 90 });
    await expect(
      service.ajouterLien(T, { exerciceId: EX, detentriceId: a.id, detenueId: b.id, pctDroitsVote: 50, pctCapital: 30 }),
    ).rejects.toThrow(/dépassent 100 %/);
    expect(liens).toHaveLength(2);
  });

  it('une participation vers une entité inconnue de l’exercice est refusée', async () => {
    const { service } = doublure();
    await expect(
      service.ajouterLien(T, { exerciceId: EX, detenueId: 'ailleurs', pctDroitsVote: 80, pctCapital: 80 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('une entité ne se détient pas elle-même', async () => {
    const { service, liens } = doublure();
    const a = await entite(service, 'A');
    await expect(
      service.ajouterLien(T, { exerciceId: EX, detentriceId: a.id, detenueId: a.id, pctDroitsVote: 10, pctCapital: 10 }),
    ).rejects.toThrow(/ne se détient pas elle-même/);
    expect(liens).toHaveLength(0);
  });

  it('un exercice d’un autre dossier est introuvable', async () => {
    const { service } = doublure();
    await expect(service.etat(T, 'ex-voisin')).rejects.toThrow(/Exercice introuvable/);
  });

  it('art. 96 · un motif d’exclusion sans justification est refusé, et l’inverse aussi', async () => {
    const { service } = doublure();
    await expect(entite(service, 'A', { motifExclusion: 'IMPORTANCE_NEGLIGEABLE' })).rejects.toThrow(/art\. 96/);
    await expect(entite(service, 'B', { justificationExclusion: 'CA marginal' })).rejects.toThrow(/art\. 96/);
    const c = await entite(service, 'C', { motifExclusion: 'IMPORTANCE_NEGLIGEABLE', justificationExclusion: 'CA 0,2 %' });
    await expect(service.modifierEntite(T, c.id, { justificationExclusion: null })).rejects.toThrow(/art\. 96/);
  });

  it('art. 95 · un seuil en francs sans sa source est refusé ; une source déjà enregistrée suffit', async () => {
    const { service } = doublure();
    await expect(service.enregistrerFaits(T, { exerciceId: EX, seuilEquivalentFc: 1e9 })).rejects.toThrow(/art\. 95/);
    await service.enregistrerFaits(T, { exerciceId: EX, seuilEquivalentFc: 1e9, sourceSeuil: 'BCC, cours du 31/12' });
    await expect(service.enregistrerFaits(T, { exerciceId: EX, seuilEquivalentFc: 2e9 })).resolves.toBeTruthy();
  });

  it('les faits déclarés arrivent au verdict d’obligation', async () => {
    const { service } = doublure();
    const a = await entite(service, 'A');
    await service.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 80, pctCapital: 80 });
    await service.enregistrerFaits(T, {
      exerciceId: EX,
      seuilEquivalentFc: 1_000_000,
      sourceSeuil: 'test',
      chiffreAffairesN: 900_000,
      chiffreAffairesN1: 1_000_000,
    });
    expect((await service.etat(T, EX)).obligation.obligation).toBe('DISPENSEE');
    await service.enregistrerFaits(T, { exerciceId: EX, appelPublicEpargne: true });
    const v = (await service.etat(T, EX)).obligation;
    expect(v.normesIfrsRequises).toBe(true);
  });
});

describe('ConsolidationController · les deux moitiés du cloisonnement', () => {
  it('la route est fermée au SYCEBNL (l’art. 3 du SYCEBNL écarte les art. 73 à 113)', () => {
    expect(Reflect.getMetadata(REFERENTIELS_KEY, ConsolidationController)).toEqual([Referentiel.SYSCOHADA]);
  });

  it('toute route qui écrit porte @Roles', () => {
    const proto = ConsolidationController.prototype as any;
    for (const m of ['creerEntite', 'modifierEntite', 'supprimerEntite', 'ajouterLien', 'supprimerLien', 'enregistrerFaits']) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[m])).toEqual([RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE]);
    }
  });
});

describe('F150 · une participation se modifie, rejouée par l’analyse', () => {
  it('le pourcentage change et l’analyse suit, l’acquisition déclarée reste', async () => {
    const { service, liens } = doublure();
    const a = await entite(service, 'A');
    const l = await service.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 80, pctCapital: 70 });
    (liens[0] as any).coutAcquisition = 800;
    await service.modifierLien(T, l.id, { pctCapital: 60 });
    expect(liens[0]).toMatchObject({ pctDroitsVote: 80, pctCapital: 60, coutAcquisition: 800 });
    const r = (await service.etat(T, EX)).resultats.find((x) => x.id === a.id)!;
    expect(r).toMatchObject({ pctControle: 80, pctInteret: 60 });
  });

  it('une modification qui porterait une détenue au-delà de 100 % est refusée, et rien n’est écrit', async () => {
    const { service, liens, prisma } = doublure();
    const a = await entite(service, 'A');
    const b = await entite(service, 'B');
    await service.ajouterLien(T, { exerciceId: EX, detenueId: b.id, pctDroitsVote: 60, pctCapital: 60 });
    await service.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 90, pctCapital: 90 });
    const l = await service.ajouterLien(T, { exerciceId: EX, detentriceId: a.id, detenueId: b.id, pctDroitsVote: 30, pctCapital: 30 });
    await expect(service.modifierLien(T, l.id, { pctDroitsVote: 50 })).rejects.toThrow(/dépassent 100 %/);
    expect(prisma.lienParticipationConsolidation.update).not.toHaveBeenCalled();
    expect(liens.find((x) => x.id === l.id)).toMatchObject({ pctDroitsVote: 30 });
  });

  it('une participation d’un autre dossier est introuvable', async () => {
    const { service } = doublure();
    await expect(service.modifierLien('autre', 'l-inconnu', { pctCapital: 10 })).rejects.toThrow(/introuvable/);
  });

  it('la route est ouverte au comptable, au SYSCOHADA seul comme le reste du contrôleur', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ConsolidationController.prototype.modifierLien);
    expect(roles).toEqual([RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE]);
    expect(Reflect.getMetadata(REFERENTIELS_KEY, ConsolidationController)).toEqual([Referentiel.SYSCOHADA]);
  });
});

/**
 * AUDIT FINAL F235 · l'unicité (exercice, nom) n'était vérifiée qu'à la
 * création · renommer vers un nom déjà pris laissait la base lever sa violation
 * d'unicité, rendue en 500.
 */
describe('F235 · renommer une entité passe par la règle de la création', () => {
  it('un nom déjà pris dans l’exercice est refusé en 400, nommé, et rien n’est écrit', async () => {
    const { service, prisma, entites } = doublure();
    await entite(service, 'Filiale A');
    const b = await entite(service, 'Filiale B');
    await expect(service.modifierEntite(T, b.id, { nom: ' Filiale A ' })).rejects.toMatchObject({
      status: 400,
      message: '« Filiale A » figure déjà au périmètre de cet exercice.',
    });
    expect(prisma.entitePerimetreConsolidation.update).not.toHaveBeenCalled();
    expect(entites.find((e) => e.id === b.id)?.nom).toBe('Filiale B');
  });

  it('une entité garde son propre nom, et un nom pris dans un AUTRE exercice reste libre', async () => {
    const { service, entites } = doublure();
    const a = await entite(service, 'Filiale A');
    entites.push({ id: 'e-2025', tenantId: T, exerciceId: 'ex-2025', nom: 'Filiale Z' });
    await service.modifierEntite(T, a.id, { nom: 'Filiale A', controleContractuel: true });
    await service.modifierEntite(T, a.id, { nom: 'Filiale Z' });
    expect(entites.find((e) => e.id === a.id)).toMatchObject({ nom: 'Filiale Z', controleContractuel: true });
  });

  it('deux saisies simultanées · la violation d’unicité de la base rend le même refus nommé, jamais une 500', async () => {
    const { service, prisma } = doublure();
    const a = await entite(service, 'Filiale A');
    prisma.entitePerimetreConsolidation.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.modifierEntite(T, a.id, { nom: 'Filiale C' })).rejects.toMatchObject({
      status: 400,
      message: '« Filiale C » figure déjà au périmètre de cet exercice.',
    });
    prisma.entitePerimetreConsolidation.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(entite(service, 'Filiale D')).rejects.toMatchObject({ status: 400, message: '« Filiale D » figure déjà au périmètre de cet exercice.' });
  });

  it('un nom vide est refusé aux deux portes', async () => {
    const { service } = doublure();
    await expect(entite(service, '   ')).rejects.toThrow(/se déclare avec son nom/);
    const a = await entite(service, 'Filiale A');
    await expect(service.modifierEntite(T, a.id, { nom: ' ' })).rejects.toThrow(/se déclare avec son nom/);
  });
});

/**
 * AUDIT FINAL F234 · un `@Query` scalaire échappe au ValidationPipe global, et
 * Prisma ignore un `exerciceId` absent · le périmètre se lisait sur tous les
 * exercices du dossier à la fois.
 */
describe('F234 · les lectures exigent l’exercice', () => {
  it.each(['etat', 'cumul', 'etats'])('%s · le paramètre exerciceId passe par un ParseUUIDPipe', (methode) => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ConsolidationController, methode) as Record<string, { data?: string; pipes: unknown[] }>;
    const exercice = Object.values(args).find((a) => a.data === 'exerciceId');
    expect(exercice?.pipes).toContain(EXERCICE_REQUIS);
    expect(exercice?.pipes.some((p) => p instanceof ParseUUIDPipe)).toBe(true);
  });

  it('le pipe refuse un exerciceId absent ou illisible en 400, avec son motif', async () => {
    const meta = { type: 'query' as const, data: 'exerciceId' };
    for (const v of [undefined, '', 'ex-2026']) {
      await expect(EXERCICE_REQUIS.transform(v as any, meta)).rejects.toMatchObject({
        status: 400,
        message: expect.stringMatching(/exerciceId est requis/),
      });
    }
    await expect(EXERCICE_REQUIS.transform('0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30', meta)).resolves.toBe('0b5f9c1e-3a4d-4c2b-9f1e-2a7d6c8b1e30');
  });

  it('au service aussi · sans exercice, rien n’est lu, jamais le dossier entier', async () => {
    const { service, prisma } = doublure();
    await entite(service, 'Filiale A');
    prisma.entitePerimetreConsolidation.findMany.mockClear();
    await expect(service.etat(T, undefined as unknown as string)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.entitePerimetreConsolidation.findMany).not.toHaveBeenCalled();
  });
});
