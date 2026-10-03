import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RoleMembreInventaire, StatutCampagneInventaire, StatutEcriture } from '@prisma/client';
import { InventaireService } from './inventaire.service';
import { EtablirPvCaisseDto } from './dto/inventaire.dto';
import {
  compteApresLaCloture,
  especesReconstitueesALaCloture,
  exercicesDuComptage,
  lireSoldeCaisseAuComptage,
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
};
type Ligne = { id: string; compteId: string; debit: number; credit: number; libelle: string | null; ecriture: Ecr };

const J = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let rang = 0;
function ligne(
  exerciceId: string,
  date: string,
  sens: { debit?: number; credit?: number },
  options: Partial<Ecr> & { compteId?: string } = {},
): Ligne {
  rang += 1;
  const { compteId = 'caisse', ...ecr } = options;
  return {
    id: `l${rang}`,
    compteId,
    debit: sens.debit ?? 0,
    credit: sens.credit ?? 0,
    libelle: null,
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
  const filtre = (where: { compteId?: string; ecriture?: Record<string, unknown> }) =>
    lignes.filter((l) => (where.compteId === undefined || l.compteId === where.compteId) && correspond(l.ecriture, where.ecriture));
  return {
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
          _sum: { debit: l.reduce((s, x) => s + x.debit, 0), credit: l.reduce((s, x) => s + x.credit, 0) },
          _count: { _all: l.length },
        };
      }),
      findMany: jest.fn(async ({ where, take }: { where: never; take?: number }) => filtre(where).slice(0, take)),
    },
  };
}

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
      reconstitution: {
        dateCloture: EX25.dateFin,
        soldeALaCloture: 1_050_000,
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
    expect(await lire(livre(), '2025-12-31')).toEqual({ lisible: true, soldeComptable: 1_050_000, reconstitution: null });
  });

  it('avant le 31 décembre, le solde de SA date · le 28 décembre n’est pas lu le 20', async () => {
    expect(await lire(livre(), '2025-12-20')).toEqual({ lisible: true, soldeComptable: 1_000_000, reconstitution: null });
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
  const prisma = {
    ...base,
    campagneInventaire: {
      findFirst: jest.fn(async () => ({ id: 'camp1', tenantId: 't1', exerciceId: 'ex25', statut: StatutCampagneInventaire.RECENSEMENT })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    compte: { findFirst: jest.fn(async () => ({ id: 'caisse', numero: '57100000', intitule: 'Caisse siège' })) },
    sousCommissionInventaire: { findFirst: jest.fn(async () => ({ id: 'sc1', nom: 'Caisses', membres: MEMBRES })) },
    procesVerbalComptageCaisse: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        // Établi le 5 février, après l'inscription du paiement reporté au 1er.
        const pv = { id: 'pv1', etabliLe: J('2026-02-05'), ...data };
        pvs.push(pv);
        return pv;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        const pv = pvs.find((p) => p.id === where.id && where.tenantId === 't1');
        return pv ? { ...pv, campagne: { exerciceId: 'ex25' } } : null;
      }),
    },
  };
  return { svc: new InventaireService(prisma as unknown as PrismaService, {} as EcritureService), pvs };
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
      encaissementsPosterieurs: 300_000,
      decaissementsPosterieurs: 470_000,
      mouvementsPosterieurs: 3,
    });
  });

  it('compté au 31 décembre · aucune reconstitution, les quatre colonnes nulles', async () => {
    const m = monter(livre());
    await m.svc.etablirPvCaisse('t1', 'camp1', 'u1', corps('2025-12-31', 1_050_000));
    expect(m.pvs[0]).toMatchObject({
      soldeComptableFige: 1_050_000,
      ecart: 0,
      soldeALaCloture: null,
      encaissementsPosterieurs: null,
      decaissementsPosterieurs: null,
      mouvementsPosterieurs: null,
    });
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
  });
});

describe('la présentation d’un PV dit ce qui manque', () => {
  const base = { especesComptees: 870_000, mouvementsPosterieurs: null };
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
