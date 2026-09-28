import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NatureFacture, SensFacture } from '@prisma/client';
import { FacturationService, PLAFOND_LISTE_FACTURES } from './facturation.service';
import { FacturationController } from './facturation.controller';
import { ListerFacturesDto } from './dto/facture.dto';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F188 · le facturier à l'écran rendait toutes les pièces du
 * dossier, lignes comprises. Il se lit sur une période et sous un plafond qui
 * se DIT, la plus récente d'abord comme avant.
 *
 * LA DOUBLURE HONORE `where`, `orderBy` et `take` · la correction tient tout
 * entière dans ce que la requête ramène, et une doublure qui rendrait ce
 * qu'on lui donne validerait un service qui ne borne rien.
 */
type Ligne = Record<string, unknown>;

const valeur = (x: unknown) => (x instanceof Date ? x.getTime() : x);

function correspond(l: Ligne, ou: Ligne): boolean {
  return Object.entries(ou).every(([cle, attendu]) => {
    const x = l[cle];
    if (attendu && typeof attendu === 'object' && !(attendu instanceof Date)) {
      const bornes = attendu as Record<string, Date>;
      const inconnus = Object.keys(bornes).filter((k) => !['gte', 'lt'].includes(k));
      if (inconnus.length) throw new Error(`Opérateur non servi par la doublure : ${inconnus.join(', ')}`);
      if (x === null || x === undefined) return false;
      const v = valeur(x) as number;
      return (!bornes.gte || v >= bornes.gte.getTime()) && (!bornes.lt || v < bornes.lt.getTime());
    }
    return valeur(x) === valeur(attendu);
  });
}

function trier(lignes: Ligne[], ordre: Array<Record<string, 'asc' | 'desc'>>): Ligne[] {
  return [...lignes].sort((a, b) => {
    for (const o of ordre) {
      const [cle, sens] = Object.entries(o)[0];
      const x = valeur(a[cle]) as number | string;
      const y = valeur(b[cle]) as number | string;
      if (x === y) continue;
      return (x < y ? -1 : 1) * (sens === 'asc' ? 1 : -1);
    }
    return 0;
  });
}

const piece = (id: string, jour: string, sur: Ligne = {}): Ligne => ({
  id,
  tenantId: 't',
  sens: SensFacture.VENTE,
  nature: NatureFacture.FACTURE,
  numeroSerie: `FV-${id}`,
  dateFacture: new Date(`${jour}T00:00:00.000Z`),
  emetteurNom: 'Le dossier',
  emetteurAdresse: 'Kinshasa',
  emetteurNumeroImpot: 'A0000000A',
  contrepartieNom: 'Client SARL',
  contrepartieAdresse: 'Kinshasa',
  contrepartieNumeroImpot: 'B0000000B',
  mentionTvaDebits: false,
  mentionsSocieteEmetteur: null,
  autresImpotsEtTaxes: 0,
  ecritureId: null,
  tiers: null,
  factureAnnulee: null,
  noteDeCredit: null,
  lignes: [{ id: `l-${id}`, ordre: 1, designation: 'Conseil', quantite: 1, prixUnitaire: 100, montantHT: 100, imposable: true, tauxApplique: 16, montantTva: 16 }],
  ...sur,
});

function harnais(pieces: Ligne[]) {
  const findMany = jest.fn(async (a: { where: Ligne; orderBy: Array<Record<string, 'asc' | 'desc'>>; take?: number }) =>
    trier(pieces.filter((p) => correspond(p, a.where)), a.orderBy).slice(0, a.take ?? Infinity),
  );
  const count = jest.fn(async (a: { where: Ligne }) => pieces.filter((p) => correspond(p, a.where)).length);
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        nom: 'Le dossier',
        formeJuridiqueSyscohada: 'SOCIETE_RESPONSABILITE_LIMITEE',
        regimeExigibiliteTva: null,
      }),
    },
    facture: { findMany, count },
  };
  return { svc: new FacturationService(prisma as unknown as PrismaService), prisma };
}

describe('F188 · le facturier se lit sur une période, et sa tranche se dit', () => {
  it('sans période et sous le plafond, la liste est celle d’avant · même ordre, rien de coupé', async () => {
    const { svc } = harnais([
      piece('a', '2025-03-01'),
      piece('b', '2026-09-10', { numeroSerie: 'FV-0002' }),
      piece('c', '2026-09-10', { numeroSerie: 'FV-0009' }),
      piece('v', '2026-09-11', { tenantId: 'voisin' }),
    ]);
    const r = await svc.lister('t');
    expect(r.factures.map((f) => f.numeroSerie)).toEqual(['FV-0009', 'FV-0002', 'FV-a']);
    expect([r.total, r.tronque, r.periode]).toEqual([3, false, { du: null, au: null }]);
  });

  it('la période borne la DATE DE LA PIÈCE, ses deux jours compris, et le total la compte', async () => {
    const { svc } = harnais([
      piece('avant', '2025-12-31'),
      piece('premier', '2026-01-01'),
      piece('dernier', '2026-12-31'),
      piece('apres', '2027-01-01'),
    ]);
    const r = await svc.lister('t', { du: '2026-01-01', au: '2026-12-31' });
    expect(r.factures.map((f) => f.id)).toEqual(['dernier', 'premier']);
    expect([r.total, r.tronque]).toEqual([2, false]);
    expect(r.periode).toEqual({ du: '2026-01-01', au: '2026-12-31' });
  });

  it('au-delà du plafond, les plus récentes sont rendues et la tranche le DIT, total compté sur la période', async () => {
    const pieces = Array.from({ length: PLAFOND_LISTE_FACTURES + 1 }, (_, i) =>
      piece(String(i).padStart(4, '0'), new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString().slice(0, 10), {
        dateFacture: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000),
      }),
    );
    const { svc, prisma } = harnais(pieces);
    const r = await svc.lister('t');
    expect(r.factures).toHaveLength(PLAFOND_LISTE_FACTURES);
    expect([r.total, r.tronque, r.plafond]).toEqual([PLAFOND_LISTE_FACTURES + 1, true, PLAFOND_LISTE_FACTURES]);
    // La plus ancienne est celle qui ne tient pas · la plus récente est en tête.
    expect(r.factures[0].id).toBe(String(PLAFOND_LISTE_FACTURES).padStart(4, '0'));
    expect(r.factures.some((f) => f.id === '0000')).toBe(false);
    // La tranche et le décompte portent le MÊME périmètre.
    expect(prisma.facture.count.mock.calls[0][0].where).toEqual(prisma.facture.findMany.mock.calls[0][0].where);
  });

  it('le sens et la période se cumulent, dans la lecture comme dans le décompte', async () => {
    const { svc, prisma } = harnais([
      piece('v1', '2026-05-01'),
      piece('a1', '2026-05-02', { sens: SensFacture.ACHAT }),
      piece('a0', '2025-05-02', { sens: SensFacture.ACHAT }),
    ]);
    const r = await svc.lister('t', { sens: SensFacture.ACHAT, du: '2026-01-01' });
    expect(r.factures.map((f) => f.id)).toEqual(['a1']);
    expect(r.total).toBe(1);
    expect(prisma.facture.count.mock.calls[0][0].where).toEqual(prisma.facture.findMany.mock.calls[0][0].where);
  });

  it('une date illisible est REFUSÉE avant toute lecture, jamais ignorée', async () => {
    const { svc, prisma } = harnais([piece('a', '2026-01-01')]);
    await expect(svc.lister('t', { du: '2026-02-30' })).rejects.toThrow(BadRequestException);
    await expect(svc.lister('t', { au: 'demain' })).rejects.toThrow(/illisible/);
    expect(prisma.facture.findMany).not.toHaveBeenCalled();
    expect(prisma.tenant.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('F188 · la porte transmet la période, et le DTO la déclare', () => {
  it('le contrôleur passe le sens et les deux dates au service', async () => {
    const lister = jest.fn().mockResolvedValue({});
    const ctl = new FacturationController({ lister } as unknown as FacturationService, {} as never);
    await ctl.lister({ tenantId: 't' } as never, { sens: SensFacture.VENTE, du: '2026-01-01', au: '2026-12-31' });
    expect(lister).toHaveBeenCalledWith('t', { sens: SensFacture.VENTE, du: '2026-01-01', au: '2026-12-31' });
  });

  it('le filtre global, qui refuse tout paramètre inconnu, admet du et au', async () => {
    const dto = plainToInstance(ListerFacturesDto, { sens: 'VENTE', du: '2026-01-01', au: '2026-12-31' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    const intrus = plainToInstance(ListerFacturesDto, { depuis: '2026-01-01' });
    expect(await validate(intrus, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });
});
