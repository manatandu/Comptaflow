import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { Prisma, RoleUtilisateur } from '@prisma/client';
import { IfrsService } from './ifrs.service';
import { IfrsController } from './ifrs.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

/**
 * Le câblage des états IFRS · la balance légale arrive au moteur par la même
 * lecture que les états légaux, les règles et retraitements sont refusés à la
 * porte par les mêmes règles que le moteur, et AUCUN état légal ne lit les
 * tables IFRS (`docs/decision-multi-classification.md` § 4).
 */
const T = 'dossier-1';
const EX = 'ex-2026';
const EX1 = 'ex-2025';

function doublure(avecPrecedent = false) {
  const tables: Record<string, any[]> = { regles: [], retraitements: [], parametres: [] };
  let seq = 0;
  const prisma: any = {
    exercice: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id === EX && where.tenantId === T) return { id: EX, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
        if (!where.id && avecPrecedent) return { id: EX1, dateDebut: new Date('2025-01-01') };
        return null;
      }),
    },
    parametresIfrs: {
      findUnique: jest.fn(async () => tables.parametres[0] ?? null),
      upsert: jest.fn(async ({ create, update }: any) => {
        tables.parametres[0] = tables.parametres[0] ? { ...tables.parametres[0], ...update } : create;
        return tables.parametres[0];
      }),
    },
    regleCorrespondanceIfrs: {
      findMany: jest.fn(async () => tables.regles),
      findFirst: jest.fn(async ({ where }: any) => tables.regles.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        if (tables.regles.some((r) => r.prefixe === data.prefixe)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
        }
        const r = { id: `r-${++seq}`, ...data };
        tables.regles.push(r);
        return r;
      }),
      delete: jest.fn(async ({ where }: any) => (tables.regles = tables.regles.filter((r) => r.id !== where.id))),
    },
    retraitementIfrs: {
      findMany: jest.fn(async ({ where }: any) => tables.retraitements.filter((r) => r.exerciceId === where.exerciceId)),
      findFirst: jest.fn(async ({ where }: any) => tables.retraitements.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const r = { id: `t-${++seq}`, createdAt: new Date(), ...data, lignes: data.lignes.create.map((l: any) => ({ ...l, montant: new Prisma.Decimal(l.montant) })) };
        tables.retraitements.push(r);
        return r;
      }),
      delete: jest.fn(async ({ where }: any) => (tables.retraitements = tables.retraitements.filter((r) => r.id !== where.id))),
    },
  };
  const balances: Record<string, [string, number][]> = {
    [EX]: [['24100000', 1000], ['10100000', -800], ['70100000', -500], ['60100000', 300]],
    [EX1]: [['24100000', 900], ['10100000', -800], ['70100000', -400], ['60100000', 300]],
  };
  const ecritures: any = {
    balance: jest.fn(async (_t: string, ex: string, brouillard: boolean) => {
      expect(brouillard).toBe(false);
      return { lignes: balances[ex].map(([numero, solde]) => ({ numero, intitule: numero, solde, typeCompte: 'DETAIL' })) };
    }),
  };
  return { prisma, tables, ecritures, service: new IfrsService(prisma, ecritures) };
}

const REGLES = [
  { prefixe: '24', rubrique: 'SF_IMMOBILISATIONS_CORPORELLES' },
  { prefixe: '10', rubrique: 'SF_CAPITAL' },
  { prefixe: '70', rubrique: 'PL_PRODUITS' },
  { prefixe: '60', rubrique: 'PL_ACHATS_CONSOMMES' },
];

describe('IfrsService · de la balance légale aux états IFRS', () => {
  it('le livre-journal seul, les règles déclarées, un retraitement déclaré · résultat 200 → 150', async () => {
    const { service } = doublure();
    for (const r of REGLES) await service.ajouterRegle(T, r);
    await service.declarerActivite(T, { activitePrincipale: 'AUCUNE' });
    await service.ajouterRetraitement(T, {
      exerciceId: EX,
      libelle: 'Dépréciation',
      fondement: 'IAS 36 § 59',
      lignes: [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 50 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -50 }],
    });
    const e = await service.etat(T, EX);
    expect(e.n.rapprochements).toMatchObject({ resultatSyscohada: 200, retraitementsResultat: -50, resultatIfrs: 150 });
    expect(e.n.controles.every((c) => c.ok)).toBe(true);
    expect(e.activitePrincipale).toBe('AUCUNE');
    expect(e.n1).toBeNull();
    expect(e.motifN1).toMatch(/Aucun exercice précédent/);
  });

  it('le comparatif est un second calcul sur l’exercice précédent, avec les mêmes règles', async () => {
    const { service } = doublure(true);
    for (const r of REGLES) await service.ajouterRegle(T, r);
    const e = await service.etat(T, EX);
    // N-1 · 400 − 300 = 100, sans retraitement.
    expect(e.n1!.rapprochements.resultatIfrs).toBe(100);
  });

  it('refus à la porte · règle hors classe ou vers le mauvais état, doublon, retraitement déséquilibré ou sans fondement', async () => {
    const { service, tables } = doublure();
    await expect(service.ajouterRegle(T, { prefixe: '60', rubrique: 'SF_STOCKS' })).rejects.toThrow(/compte de gestion/);
    await service.ajouterRegle(T, REGLES[0]);
    await expect(service.ajouterRegle(T, { prefixe: ' 24 ', rubrique: 'SF_GOODWILL' })).rejects.toThrow(/existe déjà pour le préfixe 24/);
    const l = [{ rubrique: 'SF_STOCKS', montant: 10 }, { rubrique: 'SF_RESERVES', montant: -5 }];
    await expect(service.ajouterRetraitement(T, { exerciceId: EX, libelle: 'x', fondement: 'IAS 2', lignes: l })).rejects.toThrow(/déséquilibré/);
    await expect(service.ajouterRetraitement(T, { exerciceId: EX, libelle: 'x', fondement: '', lignes: l })).rejects.toThrow(/sans fondement/);
    await expect(service.ajouterRetraitement(T, { exerciceId: 'autre', libelle: 'x', fondement: 'IAS 2', lignes: l })).rejects.toThrow(/introuvable/);
    expect(tables.retraitements).toHaveLength(0);
    expect(tables.regles).toHaveLength(1);
  });
});

describe('IfrsController · les écritures sont réservées', () => {
  it('toute route qui écrit porte @Roles, sans la lecture seule', () => {
    const proto = IfrsController.prototype as any;
    for (const m of ['declarerActivite', 'ajouterRegle', 'supprimerRegle', 'ajouterRetraitement', 'supprimerRetraitement']) {
      const roles = Reflect.getMetadata(ROLES_KEY, proto[m]);
      expect(roles).toEqual([RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE]);
    }
  });
});

describe('les tables IFRS ne sont lues que par le module IFRS', () => {
  it('les fichiers du serveur qui les nomment sont exactement le service IFRS et la liste du cloisonnement', () => {
    const racine = join(__dirname, '..', '..');
    const fichiers = (dossier: string): string[] =>
      readdirSync(dossier).flatMap((nom) => {
        const p = join(dossier, nom);
        return statSync(p).isDirectory() ? fichiers(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
      });
    const lecteurs = fichiers(racine)
      .filter((f) => /\b(retraitementIfrs|regleCorrespondanceIfrs|parametresIfrs|ligneRetraitementIfrs|RetraitementIfrs|RegleCorrespondanceIfrs|ParametresIfrs|LigneRetraitementIfrs)\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(racine, f))
      .sort();
    expect(lecteurs).toEqual(['common/cloisonnement/modeles-cloisonnes.ts', 'modules/ifrs/ifrs.service.ts']);
  });
});
