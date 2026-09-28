import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NatureOperationVente, NatureReponseDevis, Referentiel } from '@prisma/client';
import { CommercialService, PLAFOND_LISTE_DEVIS } from './commercial.service';
import { CommercialController } from './commercial.controller';
import { ListerDevisDto } from './dto/devis.dto';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F188 · la liste des devis rendait tous les devis du dossier,
 * lignes comprises. Elle se lit sur la DATE D'ÉMISSION et sous un plafond qui
 * se DIT, le plus récent d'abord comme avant.
 *
 * LA DOUBLURE HONORE `where`, `orderBy`, `take` et `include` · la correction
 * tient dans ce que la requête ramène, y compris la contre-proposition qui ne
 * revient que si la requête la DEMANDE.
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

const devis = (id: string, jour: string, sur: Ligne = {}): Ligne => ({
  id,
  tenantId: 't',
  emetteur: 'DOSSIER',
  numero: `DV-${id}`,
  dateEmission: new Date(`${jour}T00:00:00.000Z`),
  dateReception: null,
  delaiJours: null,
  declareeIrrevocable: false,
  destinataireDetermine: true,
  volonteDEtreLie: true,
  nature: NatureOperationVente.MARCHANDISES,
  tiersId: null,
  clientNom: 'Client SARL',
  objet: null,
  mentionsSocieteEmetteur: null,
  natureReponse: null,
  dateReponse: null,
  detailReponse: null,
  revoqueLe: null,
  motifRevocation: null,
  contrePropositionDeId: null,
  contreProposition: null,
  lignes: [{ id: `l-${id}`, ordre: 1, designation: 'Ciment', quantite: 1, prixUnitaire: 100, montantHT: 100 }],
  ...sur,
});

function harnais(tous: Ligne[]) {
  const findMany = jest.fn(
    async (a: { where: Ligne; orderBy: Array<Record<string, 'asc' | 'desc'>>; take?: number; include?: Ligne }) =>
      trier(tous.filter((d) => correspond(d, a.where)), a.orderBy)
        .slice(0, a.take ?? Infinity)
        // La relation ne revient que si la requête l'inclut, comme en base.
        .map((d) => {
          const { contreProposition, ...reste } = d;
          return a.include?.contreProposition ? { ...reste, contreProposition } : reste;
        }),
  );
  const count = jest.fn(async (a: { where: Ligne }) => tous.filter((d) => correspond(d, a.where)).length);
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel: Referentiel.SYSCOHADA }) },
    devis: { findMany, count },
  };
  return { svc: new CommercialService(prisma as unknown as PrismaService), prisma };
}

describe('F188 · les devis se lisent sur une période, et leur tranche se dit', () => {
  it('sans période et sous le plafond, la liste est celle d’avant · même ordre, rien de coupé', async () => {
    const { svc } = harnais([
      devis('a', '2025-03-01'),
      devis('b', '2026-09-10', { numero: 'DV-0002' }),
      devis('c', '2026-09-10', { numero: 'DV-0009' }),
      devis('v', '2026-09-11', { tenantId: 'voisin' }),
    ]);
    const r = await svc.lister('t', { dateReference: '2026-09-28' });
    expect(r.devis.map((d) => d.numero)).toEqual(['DV-0009', 'DV-0002', 'DV-a']);
    expect([r.total, r.tronque, r.periode]).toEqual([3, false, { du: null, au: null }]);
  });

  it('la période borne la DATE D’ÉMISSION, ses deux jours compris, et le total la compte', async () => {
    const { svc, prisma } = harnais([
      devis('avant', '2025-12-31'),
      devis('premier', '2026-01-01'),
      devis('dernier', '2026-12-31'),
      devis('apres', '2027-01-01'),
    ]);
    const r = await svc.lister('t', { du: '2026-01-01', au: '2026-12-31' });
    expect(r.devis.map((d) => d.id)).toEqual(['dernier', 'premier']);
    expect([r.total, r.tronque]).toEqual([2, false]);
    expect(prisma.devis.count.mock.calls[0][0].where).toEqual(prisma.devis.findMany.mock.calls[0][0].where);
  });

  it('au-delà du plafond, les plus récents sont rendus et la tranche le DIT', async () => {
    const tous = Array.from({ length: PLAFOND_LISTE_DEVIS + 1 }, (_, i) =>
      devis(String(i).padStart(4, '0'), '2026-01-01', { dateEmission: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000) }),
    );
    const { svc } = harnais(tous);
    const r = await svc.lister('t');
    expect(r.devis).toHaveLength(PLAFOND_LISTE_DEVIS);
    expect([r.total, r.tronque, r.plafond]).toEqual([PLAFOND_LISTE_DEVIS + 1, true, PLAFOND_LISTE_DEVIS]);
    expect(r.devis[0].id).toBe(String(PLAFOND_LISTE_DEVIS).padStart(4, '0'));
    expect(r.devis.some((d) => d.id === '0000')).toBe(false);
  });

  it('la contre-proposition se lit sur la ligne du devis rejeté, même émise hors de la période', async () => {
    // L'écran cherchait la suite dans la liste · la liste n'étant plus qu'une
    // tranche, une contre-proposition de janvier aurait laissé rouvrir, sur le
    // devis de décembre, un geste que le serveur refuse ensuite.
    const { svc } = harnais([
      devis('origine', '2026-12-15', {
        natureReponse: NatureReponseDevis.MODIFICATION_SUBSTANTIELLE,
        dateReponse: new Date('2026-12-20'),
        detailReponse: 'Prix revu',
        contreProposition: { id: 'suite' },
      }),
      devis('suite', '2027-01-05', { emetteur: 'CLIENT', contrePropositionDeId: 'origine' }),
    ]);
    const r = await svc.lister('t', { du: '2026-01-01', au: '2026-12-31', dateReference: '2027-01-10' });
    expect(r.devis.map((d) => [d.id, d.contrePropositionId])).toEqual([['origine', 'suite']]);
  });

  it('une date illisible est REFUSÉE avant toute lecture, jamais ignorée', async () => {
    const { svc, prisma } = harnais([devis('a', '2026-01-01')]);
    await expect(svc.lister('t', { au: '2026-02-30' })).rejects.toThrow(BadRequestException);
    expect(prisma.devis.findMany).not.toHaveBeenCalled();
    expect(prisma.tenant.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('F188 · la porte transmet la période, et le DTO la déclare', () => {
  it('le contrôleur passe la date de référence et les deux dates au service', async () => {
    const lister = jest.fn().mockResolvedValue({});
    const ctl = new CommercialController({ lister } as unknown as CommercialService);
    await ctl.lister({ tenantId: 't' } as never, { dateReference: '2026-09-28', du: '2026-01-01', au: '2026-12-31' });
    expect(lister).toHaveBeenCalledWith('t', { dateReference: '2026-09-28', du: '2026-01-01', au: '2026-12-31' });
  });

  it('le filtre global admet du et au, et refuse une date de référence illisible', async () => {
    const ok = plainToInstance(ListerDevisDto, { dateReference: '2026-09-28', du: '2026-01-01', au: '2026-12-31' });
    expect(await validate(ok, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    const illisible = plainToInstance(ListerDevisDto, { dateReference: 'hier' });
    expect(await validate(illisible, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });
});
