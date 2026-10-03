import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { ModeComparaisonCaisse, Prisma, RoleMembreInventaire, StatutCampagneInventaire, StatutEcriture } from '@prisma/client';
import { InventaireService } from './inventaire.service';
import { EtablirPvCaisseDto } from './dto/inventaire.dto';
import {
  compteApresLaCloture,
  especesReconstitueesALaCloture,
  exercicesDuComptage,
  lireSoldeCaisseAuComptage,
  mentionsDuPv,
} from './solde-caisse-au-comptage';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LIGNE A10 · LA CAISSE COMPTÉE APRÈS LA CLÔTURE (relevé CPCC C6).
 *
 * Fiche du compte 57, mot pour mot dans les deux plans · « Le solde du compte
 * caisse doit toujours correspondre exactement à la somme disponible
 * réellement. » Des espèces comptées le 10 janvier se comparent au solde du
 * livre-journal du 10 janvier, et le PV remonte à la clôture par les
 * mouvements intercalés (AUDCIF art. 16, al. 4 et 5 ; art. 42).
 *
 * Ce qui casserait en silence, et que chaque bloc ci-dessous attrape :
 *  · le REPORT À-NOUVEAU de N+1 lu comme un mouvement · le solde au comptage
 *    double, et un manquant de la taille de la caisse apparaît ;
 *  · une opération reportée au premier jour ouvert (AUDCIF art. 22, 4°) lue à
 *    sa date d'inscription · la sortie d'espèces devient un excédent ;
 *  · l'exercice suivant non ouvert lu comme « aucun mouvement » · la
 *    reconstitution affirme que la caisse n'a pas bougé ;
 *  · une ligne au brouillard lue ou ignorée · un écart que personne n'a
 *    constaté.
 *
 * La doublure HONORE les filtres (dossier, compte, exercice, statut, dates,
 * date de valeur, drapeaux d'à-nouveau) · une doublure qui rendrait tout
 * laisserait passer chacun de ces défauts.
 */

type Cond = unknown;

function egal(v: unknown, attendu: unknown): boolean {
  if (attendu instanceof Date) return v instanceof Date && v.getTime() === attendu.getTime();
  return v === attendu;
}

function verifie(v: unknown, cond: Cond): boolean {
  if (cond === null) return v === null || v === undefined;
  if (cond instanceof Date || typeof cond !== 'object') return egal(v, cond);
  const c = cond as Record<string, unknown>;
  if ('is' in c) return verifie(v, c.is);
  if ('not' in c && Object.keys(c).length === 1) return !verifie(v, c.not);
  const operateurs = ['in', 'lt', 'lte', 'gt', 'gte'];
  if (Object.keys(c).some((k) => operateurs.includes(k))) {
    if (v === null || v === undefined) return false;
    const n = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
    if ('in' in c && !(c.in as unknown[]).includes(v)) return false;
    if ('lt' in c && !(n(v) < n(c.lt))) return false;
    if ('lte' in c && !(n(v) <= n(c.lte))) return false;
    if ('gt' in c && !(n(v) > n(c.gt))) return false;
    if ('gte' in c && !(n(v) >= n(c.gte))) return false;
    return true;
  }
  return correspond(v as Record<string, unknown>, c);
}

function correspond(obj: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Record<string, unknown>[]).some((w) => correspond(obj, w));
    if (k === 'AND') return (cond as Record<string, unknown>[]).every((w) => correspond(obj, w));
    return verifie(obj[k], cond);
  });
}

type Ecr = {
  id: string;
  tenantId: string;
  exerciceId: string;
  statut: StatutEcriture;
  date: Date;
  dateValeur: Date | null;
  estGenereeParCloture: boolean;
  estANouveauProvisoire: boolean;
  estSoldeDesComptesDeGestion: boolean;
  valideeAt: Date | null;
  createdAt: Date;
  numeroPiece: number | null;
  libelle: string;
  journal: { code: string };
  /** Écriture d'écarts d'une réévaluation des devises (ligne A5), ou null. */
  reevaluationEcarts: { id: string } | null;
};
type Ligne = {
  id: string;
  compteId: string;
  debit: number;
  credit: number;
  libelle: string | null;
  deviseId: string | null;
  montantDevise: number | null;
  ecriture: Ecr;
};

const J = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let rang = 0;
function ligne(
  exerciceId: string,
  date: string,
  sens: { debit?: number; credit?: number },
  options: Partial<Ecr> & { compteId?: string; devise?: [string, number] } = {},
): Ligne {
  rang += 1;
  const { compteId = 'caisse', devise, ...ecr } = options;
  return {
    id: `l${rang}`,
    compteId,
    debit: sens.debit ?? 0,
    credit: sens.credit ?? 0,
    libelle: null,
    deviseId: devise ? devise[0] : null,
    montantDevise: devise ? devise[1] : null,
    ecriture: {
      id: `e${rang}`,
      tenantId: 't1',
      exerciceId,
      statut: StatutEcriture.VALIDEE,
      date: J(date),
      dateValeur: null,
      estGenereeParCloture: false,
      estANouveauProvisoire: false,
      estSoldeDesComptesDeGestion: false,
      valideeAt: J(date),
      createdAt: J(date),
      numeroPiece: rang,
      libelle: `Pièce ${rang}`,
      journal: { code: 'CA' },
      reevaluationEcarts: null,
      ...ecr,
    },
  };
}

const EX25 = { id: 'ex25', tenantId: 't1', dateDebut: J('2025-01-01'), dateFin: J('2025-12-31') };
const EX26 = { id: 'ex26', tenantId: 't1', dateDebut: J('2026-01-01'), dateFin: J('2026-12-31') };

/**
 * Le livre de la caisse. Clôture 2025 · 200 000 + 900 000 − 100 000 + 50 000 =
 * 1 050 000. Du 1er au 10 janvier 2026 · + 300 000, − 450 000, et − 20 000
 * inscrits le 1er février avec la date de valeur du 7 janvier · 880 000.
 */
function livre(): Ligne[] {
  return [
    ligne('ex25', '2025-01-01', { debit: 200_000 }, { estGenereeParCloture: true }),
    ligne('ex25', '2025-06-10', { debit: 900_000 }),
    ligne('ex25', '2025-12-20', { credit: 100_000 }),
    ligne('ex25', '2025-12-28', { debit: 50_000 }),
    // Le report à-nouveau de 2026 reprend la clôture · jamais un mouvement.
    ligne('ex26', '2026-01-01', { debit: 1_050_000 }, { estGenereeParCloture: true }),
    ligne('ex26', '2026-01-05', { debit: 300_000 }),
    ligne('ex26', '2026-01-08', { credit: 450_000 }),
    ligne('ex26', '2026-02-01', { credit: 20_000 }, { dateValeur: J('2026-01-07'), valideeAt: J('2026-02-01') }),
    ligne('ex26', '2026-01-15', { debit: 999 }),
    // Une autre caisse, le même jour · jamais lue.
    ligne('ex26', '2026-01-06', { debit: 77_777 }, { compteId: 'caisse-agence' }),
  ];
}

function prismaDu(lignes: Ligne[], exercices = [EX25, EX26]) {
  // La doublure HONORE tout le filtre de la ligne · compte, sens, devise,
  // montant en devise, et l'écriture (statut, dates, drapeaux, réévaluation).
  const filtre = (where: Record<string, unknown>) =>
    lignes.filter((l) => correspond(l as unknown as Record<string, unknown>, where));
  return {
    devise: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        ({ usd: { id: 'usd', code: 'USD' }, eur: { id: 'eur', code: 'EUR' } } as Record<string, { id: string; code: string }>)[where.id] ?? null,
      ),
    },
    exercice: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        exercices.filter((e) => correspond(e as unknown as Record<string, unknown>, where)),
      ),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        exercices.find((e) => correspond(e as unknown as Record<string, unknown>, where)) ?? null,
      ),
    },
    ligneEcriture: {
      count: jest.fn(async ({ where }: { where: never }) => filtre(where).length),
      aggregate: jest.fn(async ({ where }: { where: never }) => {
        const l = filtre(where);
        return {
          _sum: {
            debit: l.reduce((s, x) => s + x.debit, 0),
            credit: l.reduce((s, x) => s + x.credit, 0),
            montantDevise: l.reduce((s, x) => s + (x.montantDevise ?? 0), 0),
          },
          _count: { _all: l.length },
        };
      }),
      findMany: jest.fn(async ({ where, take }: { where: never; take?: number }) => filtre(where).slice(0, take)),
      groupBy: jest.fn(async ({ where }: { where: never }) =>
        [...new Set(filtre(where).map((l) => l.deviseId))].map((deviseId) => ({ deviseId })),
      ),
    },
  };
}

const FRANCS = { mode: ModeComparaisonCaisse.FRANCS, devise: null };

const MAINTENANT = J('2026-03-01');

async function lire(lignes: Ligne[], date: string, exercices = [EX25, EX26]) {
  return lireSoldeCaisseAuComptage(prismaDu(lignes, exercices) as never, 't1', 'caisse', EX25, J(date), MAINTENANT);
}

describe('comptée après la clôture · le solde est celui du livre-journal à la date du comptage', () => {
  it('reprend la clôture, ajoute les encaissements et retranche les paiements intercalés', async () => {
    const r = await lire(livre(), '2026-01-10');
    expect(r).toEqual({
      lisible: true,
      soldeComptable: 880_000,
      unite: FRANCS,
      reconstitution: {
        dateCloture: EX25.dateFin,
        soldeALaCloture: 1_050_000,
        mouvementsValeurAvantCloture: 0,
        encaissementsPosterieurs: 300_000,
        decaissementsPosterieurs: 470_000,
        mouvementsPosterieurs: 3,
      },
    });
  });

  it('ne lit JAMAIS le report à-nouveau de l’exercice suivant comme un mouvement', async () => {
    // Lu, il doublerait la clôture · 1 930 000 au lieu de 880 000.
    const r = await lire(livre(), '2026-01-10');
    expect(r.lisible && r.soldeComptable).toBe(880_000);
    expect(r.lisible && r.reconstitution?.encaissementsPosterieurs).toBe(300_000);
  });

  it('lit une opération reportée au premier jour ouvert à sa DATE DE VALEUR (art. 22, 4°)', async () => {
    // Le paiement du 7 janvier, inscrit le 1er février · à sa date
    // d'inscription il manquerait, et les espèces sorties feraient un excédent.
    const r = await lire(livre(), '2026-01-10');
    expect(r.lisible && r.reconstitution?.decaissementsPosterieurs).toBe(470_000);
  });

  it('s’arrête au jour du comptage · le 15 janvier n’est pas lu le 10', async () => {
    const r = await lire(livre(), '2026-01-15');
    expect(r.lisible && r.soldeComptable).toBe(880_999);
  });

  it('la reconstitution des espèces à la clôture garde le même écart', () => {
    const r = { encaissementsPosterieurs: 300_000, decaissementsPosterieurs: 470_000 };
    // 870 000 comptés pour 880 000 au livre le 10 janvier · − 10 000.
    expect(especesReconstitueesALaCloture(870_000, r)).toBe(1_040_000);
    expect(1_040_000 - 1_050_000).toBe(870_000 - 880_000);
  });
});

describe('comptée au plus tard à la clôture · rien à reconstituer', () => {
  it('au 31 décembre, le solde de l’exercice entier', async () => {
    expect(await lire(livre(), '2025-12-31')).toEqual({ lisible: true, soldeComptable: 1_050_000, unite: FRANCS, reconstitution: null });
  });

  it('avant le 31 décembre, le solde de SA date · le 28 décembre n’est pas lu le 20', async () => {
    expect(await lire(livre(), '2025-12-20')).toEqual({ lisible: true, soldeComptable: 1_000_000, unite: FRANCS, reconstitution: null });
  });

  it('jugée au jour, jamais à l’instant', () => {
    expect(compteApresLaCloture(new Date('2025-12-31T18:00:00Z'), J('2025-12-31'))).toBe(false);
    expect(compteApresLaCloture(J('2026-01-01'), J('2025-12-31'))).toBe(true);
  });
});

describe('un solde non calculable refuse le PV, jamais à zéro', () => {
  it('exercice suivant NON OUVERT · les mouvements de janvier ne peuvent pas être au livre-journal', async () => {
    const r = await lire(livre().filter((l) => l.ecriture.exerciceId === 'ex25'), '2026-01-10', [EX25]);
    expect(r.lisible).toBe(false);
    expect(!r.lisible && r.motif).toMatch(/aucun exercice du dossier ne couvre le 2026-01-01/);
    expect(!r.lisible && r.motif).toMatch(/ouvrez l'exercice suivant/);
  });

  it('un TROU entre la clôture et l’exercice suivant est refusé, nommé à son premier jour', () => {
    const decale = { id: 'ex26b', dateDebut: J('2026-02-01'), dateFin: J('2027-01-31') };
    const r = exercicesDuComptage(EX25.dateFin, J('2026-03-10'), [decale]);
    expect('motif' in r && r.motif).toMatch(/ne couvre le 2026-01-01/);
  });

  it('plusieurs exercices contigus jusqu’au comptage sont lus ensemble', () => {
    const court = { id: 'a', dateDebut: J('2026-01-01'), dateFin: J('2026-01-31') };
    const suite = { id: 'b', dateDebut: J('2026-02-01'), dateFin: J('2026-12-31') };
    expect(exercicesDuComptage(EX25.dateFin, J('2026-02-10'), [suite, court])).toEqual({ ids: ['a', 'b'] });
  });

  it('une ligne au BROUILLARD sur la caisse avant le comptage refuse', async () => {
    const l = [...livre(), ligne('ex26', '2026-01-09', { credit: 5_000 }, { statut: StatutEcriture.BROUILLARD, valideeAt: null })];
    const r = await lire(l, '2026-01-10');
    expect(r.lisible).toBe(false);
    expect(!r.lisible && r.motif).toMatch(/1 ligne\(s\) au brouillard/);
  });

  it('une ligne au brouillard APRÈS le comptage ne gêne pas', async () => {
    const l = [...livre(), ligne('ex26', '2026-01-20', { credit: 5_000 }, { statut: StatutEcriture.BROUILLARD, valideeAt: null })];
    expect((await lire(l, '2026-01-10')).lisible).toBe(true);
  });

  it('le brouillard de l’exercice de la campagne refuse un comptage postérieur, quelle que soit sa date', async () => {
    const l = [...livre(), ligne('ex25', '2025-12-30', { credit: 5_000 }, { statut: StatutEcriture.BROUILLARD, valideeAt: null })];
    expect((await lire(l, '2026-01-10')).lisible).toBe(false);
    // Compté le 20 décembre, une ligne du 30 n'est pas du solde de ce jour-là.
    expect((await lire(l, '2025-12-20')).lisible).toBe(true);
  });

  it('le report à-nouveau PROVISOIRE de l’exercice suivant n’est ni un mouvement ni un brouillard qui bloque', async () => {
    const l = livre().filter((x) => !(x.ecriture.exerciceId === 'ex26' && x.ecriture.estGenereeParCloture));
    l.push(
      ligne('ex26', '2026-01-01', { debit: 1_050_000 }, {
        estGenereeParCloture: true,
        estANouveauProvisoire: true,
        statut: StatutEcriture.BROUILLARD,
        valideeAt: null,
      }),
    );
    const r = await lire(l, '2026-01-10');
    expect(r.lisible && r.soldeComptable).toBe(880_000);
  });

  it('une OUVERTURE PROVISOIRE de l’exercice de la campagne refuse · elle n’est pas au livre-journal', async () => {
    const l = livre().filter((x) => !(x.ecriture.exerciceId === 'ex25' && x.ecriture.estGenereeParCloture));
    l.push(
      ligne('ex25', '2025-01-01', { debit: 200_000 }, {
        estGenereeParCloture: true,
        estANouveauProvisoire: true,
        statut: StatutEcriture.BROUILLARD,
        valideeAt: null,
      }),
    );
    const r = await lire(l, '2025-12-31');
    expect(!r.lisible && r.motif).toMatch(/PROVISOIRE/);
  });

  it('une date avant l’ouverture de l’exercice, ou future, est refusée', async () => {
    expect(!(await lire(livre(), '2024-12-31')).lisible).toBe(true);
    const futur = await lire(livre(), '2026-03-02');
    expect(!futur.lisible && futur.motif).toMatch(/dans le futur/);
  });
});

// ---------------------------------------------------------------------------
// Le service · le solde est LU et FIGÉ, jamais reçu
// ---------------------------------------------------------------------------

const MEMBRES = [{ role: RoleMembreInventaire.INVENTORIANT }, { role: RoleMembreInventaire.TEMOIN }];

function monter(lignes: Ligne[], exercices = [EX25, EX26]) {
  const base = prismaDu(lignes, exercices);
  const pvs: Record<string, unknown>[] = [];
  const prisma: Record<string, unknown> = {
    ...base,
    // La transaction rejoue le même client · lecture et création y passent (b).
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    campagneInventaire: {
      findFirst: jest.fn(async () => ({ id: 'camp1', tenantId: 't1', exerciceId: 'ex25', statut: StatutCampagneInventaire.RECENSEMENT })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    compte: { findFirst: jest.fn(async () => ({ id: 'caisse', numero: '57100000', intitule: 'Caisse siège' })) },
    sousCommissionInventaire: { findFirst: jest.fn(async () => ({ id: 'sc1', nom: 'Caisses', membres: MEMBRES })) },
    procesVerbalComptageCaisse: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // L'index unique [campagneId, compteId] · un second PV pour la même caisse.
        if (pvs.some((p) => p.compteId === data.compteId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '5' });
        }
        // Établi le 5 février, après l'inscription du paiement reporté au 1er.
        const pv = { id: 'pv1', etabliLe: J('2026-02-05'), ...data };
        pvs.push(pv);
        return pv;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const pv = pvs.find((p) => p.id === where.id && where.tenantId === 't1');
        return pv ? { ...pv, campagne: { exerciceId: 'ex25' }, devise: pv.deviseId ? { id: pv.deviseId, code: 'USD' } : null } : null;
      }),
    },
  };
  return {
    svc: new InventaireService(prisma as unknown as PrismaService, {} as EcritureService),
    pvs,
    prisma: prisma as { $transaction: jest.Mock },
  };
}

const corps = (date: string, especes: number) =>
  ({ compteId: 'caisse', sousCommissionId: 'sc1', dateComptage: date, especesComptees: especes }) as never;

describe('le PV fige le solde lu et sa reconstitution', () => {
  it('compté le 10 janvier · solde 880 000 et les quatre colonnes de la reconstitution', async () => {
    const m = monter(livre());
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000));
    expect(m.pvs[0]).toMatchObject({
      soldeComptableFige: 880_000,
      ecart: -10_000,
      soldeALaCloture: 1_050_000,
      mouvementsValeurAvantCloture: 0,
      encaissementsPosterieurs: 300_000,
      decaissementsPosterieurs: 470_000,
      mouvementsPosterieurs: 3,
      modeComparaison: ModeComparaisonCaisse.FRANCS,
      deviseId: null,
    });
  });

  it('compté au 31 décembre · aucune reconstitution, les quatre colonnes nulles', async () => {
    const m = monter(livre());
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2025-12-31', 1_050_000));
    expect(m.pvs[0]).toMatchObject({
      soldeComptableFige: 1_050_000,
      ecart: 0,
      soldeALaCloture: null,
      mouvementsValeurAvantCloture: null,
      encaissementsPosterieurs: null,
      decaissementsPosterieurs: null,
      mouvementsPosterieurs: null,
    });
  });

  it('un second PV pour la même caisse sort en 409 nommé, jamais en 500 (b)', async () => {
    const m = monter(livre());
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000));
    const second = m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000));
    await expect(second).rejects.toBeInstanceOf(ConflictException);
    await expect(m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000))).rejects.toThrow(
      /existe déjà pour cette caisse/,
    );
  });

  it('lit et crée dans UNE transaction (b)', async () => {
    const m = monter(livre());
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000));
    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuse sans rien écrire quand le solde n’est pas calculable', async () => {
    const m = monter(livre().filter((l) => l.ecriture.exerciceId === 'ex25'), [EX25]);
    await expect(m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(m.pvs).toHaveLength(0);
  });

  it('sert les mouvements ligne à ligne, tels que le PV les a lus, et dit qu’ils concordent', async () => {
    const l = livre();
    const m = monter(l);
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000));
    // Une pièce du 9 janvier validée APRÈS l'établissement · elle n'était pas
    // au livre-journal quand le solde a été figé, et n'entre pas.
    l.push(ligne('ex26', '2026-01-09', { credit: 1_000 }, { valideeAt: J('2026-02-20'), createdAt: J('2026-02-20') }));
    const r = await m.svc.mouvementsReconstitution('t1', 'pv1');
    expect(r.applicable).toBe(true);
    if (!r.applicable) return;
    expect(r.lignes.map((x) => [x.encaissement, x.decaissement])).toEqual([
      [300_000, 0],
      [0, 450_000],
      [0, 20_000],
    ]);
    expect(r.lignes[2].date).toEqual(J('2026-01-07'));
    expect({ total: r.total, tronque: r.tronque, concorde: r.concorde }).toEqual({ total: 3, tronque: false, concorde: true });
    // (c) La pièce validée depuis le PV, datée avant le comptage, se dit à part.
    expect(r.saisiesDepuisLePv).toEqual({ nombre: 1, net: -1_000 });
  });

  it('confronte AUSSI le solde à la clôture relu · une pièce de N validée après le PV ne change pas les figés (c)', async () => {
    const l = livre();
    const m = monter(l);
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000));
    l.push(ligne('ex25', '2025-12-30', { credit: 5_000 }, { valideeAt: J('2026-02-20'), createdAt: J('2026-02-20') }));
    const r = await m.svc.mouvementsReconstitution('t1', 'pv1');
    if (!r.applicable) throw new Error('applicable attendu');
    expect(r.soldeALaCloture).toBe(1_050_000);
    expect(r.concorde).toBe(true);
    expect(r.saisiesDepuisLePv).toEqual({ nombre: 1, net: -5_000 });
  });

  it('dit la DISCORDANCE quand le livre-journal relu ne rend plus les totaux figés (c)', async () => {
    const l = livre();
    const m = monter(l);
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 870_000));
    // Figé à la main différent · le PV dit 1 050 000 ; on simule une ligne de N
    // sans date de validation, créée avant le PV, ajoutée après coup.
    l.push(ligne('ex25', '2025-12-29', { debit: 7_000 }, { valideeAt: null, createdAt: J('2026-01-01') }));
    const r = await m.svc.mouvementsReconstitution('t1', 'pv1');
    if (!r.applicable) throw new Error('applicable attendu');
    expect(r.soldeALaCloture).toBe(1_057_000);
    expect(r.concorde).toBe(false);
  });
});

describe('la présentation d’un PV dit ce qui manque', () => {
  const base = {
    especesComptees: 870_000,
    soldeComptableFige: 880_000,
    mouvementsPosterieurs: null,
    mouvementsValeurAvantCloture: null,
    modeComparaison: ModeComparaisonCaisse.FRANCS,
  };
  it('un PV compté après la clôture sans reconstitution figée le dit', () => {
    const p = InventaireService.presenterPvCaisse(
      { ...base, dateComptage: J('2026-01-10'), soldeALaCloture: null, encaissementsPosterieurs: null, decaissementsPosterieurs: null },
      EX25.dateFin,
    );
    expect(p).toMatchObject({ compteApresLaCloture: true, reconstitutionManquante: true, especesReconstitueesALaCloture: null });
  });

  it('un PV reconstitué rend les espèces à la clôture', () => {
    const p = InventaireService.presenterPvCaisse(
      {
        ...base,
        mouvementsPosterieurs: 3,
        mouvementsValeurAvantCloture: 0,
        dateComptage: J('2026-01-10'),
        soldeALaCloture: 1_050_000,
        encaissementsPosterieurs: 300_000,
        decaissementsPosterieurs: 470_000,
      },
      EX25.dateFin,
    );
    expect(p).toMatchObject({ reconstitutionManquante: false, especesReconstitueesALaCloture: 1_040_000 });
  });
});

describe('le solde comptable ne se reçoit plus de l’écran', () => {
  it('un corps qui le porte est refusé par la liste blanche', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const corpsAvecSolde = {
      compteId: '6f1c8a2e-3b4d-4c5e-8f9a-0b1c2d3e4f5a',
      sousCommissionId: '6f1c8a2e-3b4d-4c5e-8f9a-0b1c2d3e4f5b',
      dateComptage: '2026-01-10',
      especesComptees: 870_000,
      soldeComptable: 0,
    };
    await expect(pipe.transform(corpsAvecSolde, { type: 'body', metatype: EtablirPvCaisseDto })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const { soldeComptable: _retire, ...sansSolde } = corpsAvecSolde;
    await expect(pipe.transform(sansSolde, { type: 'body', metatype: EtablirPvCaisseDto })).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Seconde passe · devises, date de valeur avant la clôture, bilan importé,
// mentions, format de la date
// ---------------------------------------------------------------------------

/** Une caisse en dollars · chaque ligne porte la devise et son montant. */
function livreUsd(): Ligne[] {
  return [
    ligne('ex25', '2025-01-01', { debit: 2_800_000 }, { estGenereeParCloture: true, devise: ['usd', 1_000] }),
    ligne('ex25', '2025-06-10', { debit: 5_800_000 }, { devise: ['usd', 2_000] }),
    ligne('ex25', '2025-12-20', { credit: 1_450_000 }, { devise: ['usd', 500] }),
    // Écart de réévaluation des devises (A5) · une ligne en francs sans
    // devise, qui n'a AUCUN montant en dollars.
    ligne('ex25', '2025-12-31', { debit: 350_000 }, { reevaluationEcarts: { id: 'reev1' } }),
    ligne('ex26', '2026-01-01', { debit: 7_500_000 }, { estGenereeParCloture: true, devise: ['usd', 2_500] }),
    ligne('ex26', '2026-01-05', { debit: 900_000 }, { devise: ['usd', 300] }),
    ligne('ex26', '2026-01-08', { credit: 1_200_000 }, { devise: ['usd', 400] }),
  ];
}

describe('B1 · une caisse en devises se compare dans SA devise', () => {
  it('toutes les lignes en dollars · solde et reconstitution en dollars, aucun cours appliqué', async () => {
    const r = await lire(livreUsd(), '2026-01-10');
    expect(r).toEqual({
      lisible: true,
      soldeComptable: 2_400,
      unite: { mode: ModeComparaisonCaisse.DEVISE, devise: { id: 'usd', code: 'USD' } },
      reconstitution: {
        dateCloture: EX25.dateFin,
        soldeALaCloture: 2_500,
        mouvementsValeurAvantCloture: 0,
        encaissementsPosterieurs: 300,
        decaissementsPosterieurs: 400,
        mouvementsPosterieurs: 2,
      },
    });
  });

  it('l’écart de réévaluation sans devise ne fait pas tomber la caisse en lignes mêlées', async () => {
    // Sans l'exclusion, la ligne de 350 000 FC sans devise rendait la caisse
    // « mêlée », et l'écart redevenait un mélange de cours.
    const r = await lire(livreUsd(), '2025-12-31');
    expect(r.lisible && r.unite.mode).toBe(ModeComparaisonCaisse.DEVISE);
    expect(r.lisible && r.soldeComptable).toBe(2_500);
  });

  it('lignes MÊLÉES (francs et dollars) · comparaison en francs, sans refus, et le PV le dit', async () => {
    const l = [...livreUsd(), ligne('ex25', '2025-12-22', { debit: 100_000 })];
    const r = await lire(l, '2025-12-31');
    expect(r.lisible && r.unite).toEqual({ mode: ModeComparaisonCaisse.FRANCS_COURS_HISTORIQUES, devise: null });
    expect(r.lisible && r.soldeComptable).toBe(2_800_000 + 5_800_000 - 1_450_000 + 350_000 + 100_000);
    const m = mentionsDuPv({
      dateComptage: J('2025-12-31'),
      dateCloture: EX25.dateFin,
      mode: ModeComparaisonCaisse.FRANCS_COURS_HISTORIQUES,
      soldeComptable: 1,
      soldeALaCloture: null,
      mouvementsValeurAvantCloture: null,
      especesReconstituees: null,
    });
    expect(m).toContain("Comparaison en francs, au cours historique de chaque mouvement · l'écart comprend l'effet de change.");
  });

  it('deux devises · francs au cours historique, sans refus', async () => {
    const l = [...livreUsd(), ligne('ex25', '2025-12-22', { debit: 300_000 }, { devise: ['eur', 100] })];
    const r = await lire(l, '2025-12-31');
    expect(r.lisible && r.unite.mode).toBe(ModeComparaisonCaisse.FRANCS_COURS_HISTORIQUES);
  });

  it('le PV fige l’unité et la devise, et l’écart se compte en dollars', async () => {
    const m = monter(livreUsd());
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 2_350));
    expect(m.pvs[0]).toMatchObject({
      soldeComptableFige: 2_400,
      ecart: -50,
      modeComparaison: ModeComparaisonCaisse.DEVISE,
      deviseId: 'usd',
    });
  });
});

describe('(d) une opération de l’exercice suivant à date de valeur ANTÉRIEURE à la clôture', () => {
  it('est au solde du jour du comptage, isolée, jamais comptée dans les mouvements intercalés', async () => {
    const l = [...livre(), ligne('ex26', '2026-01-02', { credit: 30_000 }, { dateValeur: J('2025-12-30') })];
    const r = await lire(l, '2026-01-10');
    expect(r.lisible && r.reconstitution).toMatchObject({
      soldeALaCloture: 1_050_000,
      mouvementsValeurAvantCloture: -30_000,
      encaissementsPosterieurs: 300_000,
      decaissementsPosterieurs: 470_000,
    });
    expect(r.lisible && r.soldeComptable).toBe(850_000);
  });
});

describe('(f) un bilan d’ouverture IMPORTÉ dans l’exercice suivant n’est pas un mouvement', () => {
  it('porté `estGenereeParCloture` par l’import, il n’est pas compté une seconde fois', async () => {
    // Deux à-nouveaux dans 2026 · le report de clôture ET un bilan importé
    // (import.service · `estGenereeParCloture: bilanDOuverture`), validé ou
    // au brouillard. Aucun ne double la clôture lue sur 2025.
    const l = [
      ...livre(),
      ligne('ex26', '2026-01-01', { debit: 1_050_000 }, { estGenereeParCloture: true }),
      ligne('ex26', '2026-01-01', { debit: 999_999 }, {
        estGenereeParCloture: true,
        statut: StatutEcriture.BROUILLARD,
        valideeAt: null,
      }),
    ];
    const r = await lire(l, '2026-01-10');
    expect(r.lisible && r.soldeComptable).toBe(880_000);
    expect(r.lisible && r.reconstitution?.encaissementsPosterieurs).toBe(300_000);
  });
});

describe('(g) les mentions du PV, écrites par le serveur', () => {
  const base = {
    dateCloture: EX25.dateFin,
    mode: ModeComparaisonCaisse.FRANCS,
    soldeComptable: 880_000,
    soldeALaCloture: 1_050_000,
    mouvementsValeurAvantCloture: 0,
    especesReconstituees: 1_040_000,
  };

  it('compté après la clôture · l’écart est du jour du comptage, et la réévaluation postérieure n’y est pas', () => {
    const m = mentionsDuPv({ ...base, dateComptage: J('2026-01-10') });
    expect(m).toContain("Écart constaté au jour du comptage · son rattachement à l'exercice clos ou en cours est à apprécier.");
    expect(m.some((x) => x.startsWith('Solde à la clôture lu au livre-journal'))).toBe(true);
  });

  it('compté avant la clôture · les mouvements jusqu’à la clôture ne sont pas reconstitués', () => {
    const m = mentionsDuPv({ ...base, dateComptage: J('2025-12-20'), soldeALaCloture: null, especesReconstituees: null });
    expect(m).toContain("Compté avant la clôture · mouvements jusqu'au 2025-12-31 non reconstitués.");
  });

  it('un solde lu CRÉDITEUR cite la fiche du compte 57', () => {
    const m = mentionsDuPv({ ...base, dateComptage: J('2026-01-10'), soldeComptable: -5_000 });
    expect(m.join(' ')).toContain("« un solde créditeur du compte caisse constitue une présomption d'irrégularité de la comptabilité »");
  });

  it('des espèces reconstituées NÉGATIVES se signalent', () => {
    const m = mentionsDuPv({ ...base, dateComptage: J('2026-01-10'), especesReconstituees: -100 });
    expect(m.some((x) => x.startsWith('Espèces reconstituées à la clôture négatives'))).toBe(true);
  });

  it('au 31 décembre, aucune mention de reconstitution', () => {
    expect(mentionsDuPv({ ...base, dateComptage: J('2025-12-31'), soldeALaCloture: null, especesReconstituees: null })).toEqual([]);
  });
});

describe('(e) la date du comptage est une date civile AAAA-MM-JJ', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const corpsDate = (dateComptage: string) => ({
    compteId: '6f1c8a2e-3b4d-4c5e-8f9a-0b1c2d3e4f5a',
    sousCommissionId: '6f1c8a2e-3b4d-4c5e-8f9a-0b1c2d3e4f5b',
    dateComptage,
    especesComptees: 1,
  });

  it.each(['2026-01-10T23:30:00+01:00', '2026-01-10T00:00:00Z', '10/01/2026', ''])('refuse « %s » en 400 nommé', async (d) => {
    await expect(pipe.transform(corpsDate(d), { type: 'body', metatype: EtablirPvCaisseDto })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(() => InventaireService.lireDateComptage(d)).toThrow(/AAAA-MM-JJ/);
  });

  it('admet 2026-01-10, lu à minuit UTC', async () => {
    await expect(pipe.transform(corpsDate('2026-01-10'), { type: 'body', metatype: EtablirPvCaisseDto })).resolves.toBeDefined();
    expect(InventaireService.lireDateComptage('2026-01-10')).toEqual(J('2026-01-10'));
  });
});

describe('(a) l’aperçu avant de figer', () => {
  it('rend le solde et la reconstitution sans rien écrire, ou le motif du refus', async () => {
    const m = monter(livre());
    const ok = await m.svc.apercuPvCaisse('t1', 'camp1', 'caisse', '2026-01-10');
    expect(ok).toMatchObject({ lisible: true, soldeComptable: 880_000, modeComparaison: ModeComparaisonCaisse.FRANCS });
    expect(m.pvs).toHaveLength(0);
    const refus = await monter(livre().filter((x) => x.ecriture.exerciceId === 'ex25'), [EX25]).svc.apercuPvCaisse(
      't1',
      'camp1',
      'caisse',
      '2026-01-10',
    );
    expect(refus).toMatchObject({ lisible: false });
  });
});

describe('une inscription en NÉGATIF se compte dans son sens (AUDCIF art. 20, `lignesEnNegatif`)', () => {
  // `lignesEnNegatif` nie le débit ou le crédit et recopie le montant en
  // devise SANS signe · filtrée sur `debit > 0`, la correction disparaissait
  // et l'encaissement corrigé restait au solde en dollars.
  const negatif = (exerciceId: string, date: string, montantFc: number, usd: number) =>
    ligne(exerciceId, date, { debit: -montantFc }, { devise: ['usd', usd] });

  it('encaissement de 300 USD inscrit en négatif · il ne reste rien de lui au solde', async () => {
    const l = [...livreUsd(), negatif('ex26', '2026-01-06', 900_000, 300)];
    const r = await lire(l, '2026-01-10');
    expect(r.lisible && r.soldeComptable).toBe(2_100);
    expect(r.lisible && r.reconstitution).toMatchObject({
      soldeALaCloture: 2_500,
      encaissementsPosterieurs: 0,
      decaissementsPosterieurs: 400,
    });
  });

  it('réimputé vers le 5211 · négatif sur la caisse, l’exact sur la banque, la caisse perd les 300 USD', async () => {
    const l = [
      ...livreUsd(),
      negatif('ex26', '2026-01-06', 900_000, 300),
      ligne('ex26', '2026-01-06', { debit: 900_000 }, { compteId: '5211', devise: ['usd', 300] }),
    ];
    const r = await lire(l, '2026-01-10');
    expect(r.lisible && r.soldeComptable).toBe(2_100);
  });

  it('un décaissement inscrit en négatif au crédit se retranche des décaissements', async () => {
    const l = [...livreUsd(), ligne('ex26', '2026-01-09', { credit: -1_200_000 }, { devise: ['usd', 400] })];
    const r = await lire(l, '2026-01-10');
    expect(r.lisible && r.soldeComptable).toBe(2_800);
    expect(r.lisible && r.reconstitution).toMatchObject({ encaissementsPosterieurs: 300, decaissementsPosterieurs: 0 });
  });

  it('en francs, rien ne change · le négatif était déjà soustrait par la somme des débits', async () => {
    const l = [...livre(), ligne('ex26', '2026-01-06', { debit: -300_000 })];
    const r = await lire(l, '2026-01-10');
    expect(r.lisible && r.soldeComptable).toBe(580_000);
    expect(r.lisible && r.reconstitution).toMatchObject({ encaissementsPosterieurs: 0, decaissementsPosterieurs: 470_000 });
  });

  it('les mouvements ligne à ligne gardent le négatif dans SA colonne, et leurs sommes rendent les totaux', async () => {
    const m = monter([...livreUsd(), negatif('ex26', '2026-01-06', 900_000, 300)]);
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 2_100));
    const r = await m.svc.mouvementsReconstitution('t1', 'pv1');
    if (!r.applicable) throw new Error('applicable attendu');
    expect(r.lignes.map((x) => [x.encaissement, x.decaissement])).toEqual([
      [300, 0],
      [0, 400],
      [-300, 0],
    ]);
    expect(r.lignes.reduce((s, x) => s + x.encaissement, 0)).toBe(r.encaissements);
    expect(r.concorde).toBe(true);
  });

  it('en francs, une ligne négative au débit reste un encaissement négatif, jamais un décaissement négatif', async () => {
    const m = monter([...livre(), ligne('ex26', '2026-01-06', { debit: -300_000 })]);
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2026-01-10', 580_000));
    const r = await m.svc.mouvementsReconstitution('t1', 'pv1');
    if (!r.applicable) throw new Error('applicable attendu');
    expect(r.lignes.find((x) => x.encaissement === -300_000)).toBeDefined();
    expect(r.lignes.every((x) => x.decaissement >= 0)).toBe(true);
  });
});
