import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Referentiel, RoleUtilisateur } from '@prisma/client';
import { PerimetreService } from './perimetre.service';
import { ConsolidationController } from './consolidation.controller';
import { REFERENTIELS_KEY } from '../../common/decorators/referentiels.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

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
  const filtre = (rows: any[], where: any) =>
    rows.filter((r) => Object.entries(where ?? {}).every(([k, v]) => r[k] === v));
  const prisma: any = {
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ id: T, nom: 'Mère SA' })) },
    exercice: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === EX && where.tenantId === T
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
      delete: jest.fn(),
    },
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
