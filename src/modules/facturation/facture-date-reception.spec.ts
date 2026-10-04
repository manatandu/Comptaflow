import * as fs from 'fs';
import * as path from 'path';
import { avertissementExerciceDeLaFacture, dateDeValeurComptable, libelleDeFacture, motifRefusDateReception } from './date-reception';
import { ComptabilisationFactureService } from './comptabilisation-facture.service';

/**
 * LIGNE A21 · la facture d'achat datée à sa RÉCEPTION. AUDCIF art. 16, al. 2 :
 * « Cette date est celle de l'émission par l'entité de la pièce justificative
 * de l'opération, ou celle de la réception des pièces d'origine externe. »
 */

const J = (s: string) => new Date(`${s}T00:00:00.000Z`);
const AUJOURDHUI = J('2026-10-04');

describe('date de valeur comptable d’une facture (règle pure)', () => {
  it('une vente se date à son émission, une facture reçue à sa réception', () => {
    expect(dateDeValeurComptable({ sens: 'VENTE', dateFacture: J('2025-12-28'), dateReception: null })).toEqual({ date: J('2025-12-28') });
    expect(dateDeValeurComptable({ sens: 'ACHAT', dateFacture: J('2025-12-28'), dateReception: J('2026-01-05') })).toEqual({ date: J('2026-01-05') });
  });

  it('une facture reçue sans date de réception n’en reçoit aucune · ni la date de facture, ni aujourd’hui', () => {
    const r = dateDeValeurComptable({ sens: 'ACHAT', dateFacture: J('2025-12-28'), dateReception: null });
    expect(r).toEqual({ refus: expect.stringContaining('art. 16, al. 2') });
  });

  it('refuse une réception sur une vente, avant la facture, ou future', () => {
    expect(motifRefusDateReception({ sens: 'VENTE', dateFacture: J('2026-01-02'), dateReception: J('2026-01-05') }, AUJOURDHUI)).toMatch(/émise par le dossier/);
    expect(motifRefusDateReception({ sens: 'ACHAT', dateFacture: J('2026-01-05'), dateReception: J('2026-01-04') }, AUJOURDHUI)).toMatch(/antérieure à la date de la facture/);
    expect(motifRefusDateReception({ sens: 'ACHAT', dateFacture: J('2026-01-05'), dateReception: J('2026-10-05') }, AUJOURDHUI)).toMatch(/postérieure à aujourd/);
    // Le jour même de la facture, et le jour même d'aujourd'hui, sont admis.
    expect(motifRefusDateReception({ sens: 'ACHAT', dateFacture: J('2026-01-05'), dateReception: J('2026-01-05') }, AUJOURDHUI)).toBeNull();
    expect(motifRefusDateReception({ sens: 'ACHAT', dateFacture: J('2026-01-05'), dateReception: AUJOURDHUI }, AUJOURDHUI)).toBeNull();
    expect(motifRefusDateReception({ sens: 'ACHAT', dateFacture: J('2026-01-05'), dateReception: null }, AUJOURDHUI)).toBeNull();
  });

  it('le libellé porte la date de la FACTURE, que l’écriture ne porte plus', () => {
    expect(libelleDeFacture('FACTURE', 'FA-12', J('2025-12-28'), 'Fournisseur SA')).toBe('Facture FA-12 du 28/12/2025 · Fournisseur SA');
    expect(libelleDeFacture('NOTE_DE_CREDIT', 'NC-1', J('2026-01-02'), 'X')).toBe('Note de crédit NC-1 du 02/01/2026 · X');
  });

  it('dit la charge qui change d’exercice (fiche du compte 60, compte 408), sans rien passer', () => {
    const ex = { dateDebut: J('2025-01-01'), dateFin: J('2025-12-31') };
    expect(avertissementExerciceDeLaFacture(J('2025-12-28'), J('2026-01-05'), ex)).toMatch(/compte 408/);
    expect(avertissementExerciceDeLaFacture(J('2025-12-02'), J('2025-12-28'), ex)).toBeNull();
    expect(avertissementExerciceDeLaFacture(J('2025-12-28'), J('2026-01-05'), null)).toBeNull();
  });
});

/** Doublure qui HONORE le `where` des exercices (dates) et de la facture. */
function monde(o: { sens?: 'VENTE' | 'ACHAT'; dateReception?: Date | null; exercices?: { id: string; dateDebut: Date; dateFin: Date }[] } = {}) {
  const exercices = o.exercices ?? [
    { id: 'ex25', dateDebut: J('2025-01-01'), dateFin: J('2025-12-31') },
    { id: 'ex26', dateDebut: J('2026-01-01'), dateFin: J('2026-12-31') },
  ];
  const creees: Record<string, unknown>[] = [];
  const facture = {
    id: 'f1', tenantId: 't', sens: o.sens ?? 'ACHAT', nature: 'FACTURE', numeroSerie: 'FA-12', emetteurNom: 'Fournisseur SA', contrepartieNom: 'Le dossier',
    autresImpotsEtTaxes: null, ecritureId: null as string | null, dateFacture: J('2025-12-28'),
    dateReception: o.dateReception === undefined ? J('2026-01-05') : o.dateReception,
    tiers: { comptesRattaches: [{ compteId: 'c401' }] },
    lignes: [
      {
        id: 'l1', designation: 'Fournitures', montantHT: 1000, montantTva: 160, imposable: true, tauxTvaId: 't16',
        tauxTva: { tenantId: 't', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' },
      },
    ],
  };
  type OuFacture = { id: string; tenantId: string; ecritureId: null; dateReception?: null };
  const prisma = {
    facture: {
      findFirst: jest.fn(async () => facture),
      updateMany: jest.fn(async ({ where, data }: { where: OuFacture; data: { ecritureId: string; dateReception?: Date } }) => {
        const libre = where.id === facture.id && facture.ecritureId === null && (!('dateReception' in where) || facture.dateReception === null);
        if (!libre) return { count: 0 };
        Object.assign(facture, data);
        return { count: 1 };
      }),
    },
    journal: { findFirst: jest.fn(async () => ({ type: facture.sens === 'VENTE' ? 'VENTES' : 'ACHATS' })) },
    compte: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] }; numero?: { in: string[] } } }) =>
        [{ id: 'c601', numero: '60110000' }].filter((c) => (!where.id || where.id.in.includes(c.id)) && (!where.numero || where.numero.in.includes(c.numero))),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ referentiel: 'SYSCOHADA' })) },
    exercice: {
      findFirst: jest.fn(async ({ where }: { where: { dateDebut: { lte: Date }; dateFin: { gte: Date } } }) => {
        const e = exercices.find((x) => x.dateDebut <= where.dateDebut.lte && x.dateFin >= where.dateFin.gte);
        return e ?? null;
      }),
    },
  };
  const ecritures = {
    creer: jest.fn(async (_t: string, _u: string, dto: Record<string, unknown>) => (creees.push(dto), { id: 'e1' })),
    retirerCompensation: jest.fn(async () => undefined),
  };
  return { s: new ComptabilisationFactureService(prisma as never, ecritures as never), prisma, ecritures, creees, facture };
}

describe('passer l’écriture d’une facture reçue (service)', () => {
  it('date l’écriture à la RÉCEPTION, dans l’exercice de la réception, la date de facture au libellé', async () => {
    const m = monde();
    const r = await m.s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601' });
    expect(m.creees[0]).toMatchObject({ exerciceId: 'ex26', date: '2026-01-05', reference: 'FA-12', libelle: 'Facture FA-12 du 28/12/2025 · Fournisseur SA' });
    expect(r).toMatchObject({ ecritureId: 'e1', date: '2026-01-05', avertissement: expect.stringMatching(/408/) });
  });

  it('le libellé d’un achat nomme le FOURNISSEUR (émetteur), jamais le dossier (contrepartie)', async () => {
    const m = monde({ dateReception: J('2025-12-30') });
    await m.s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601' });
    expect(m.creees[0].libelle).toBe('Facture FA-12 du 28/12/2025 · Fournisseur SA');
  });

  it('une facture reçue sans réception est REFUSÉE, sans écriture, tant qu’elle n’est pas déclarée', async () => {
    const m = monde({ dateReception: null });
    await expect(m.s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601' })).rejects.toThrow(/date de réception/);
    expect(m.ecritures.creer).not.toHaveBeenCalled();
  });

  it('la réception déclarée au passage date l’écriture et se pose avec le lien, une fois', async () => {
    const m = monde({ dateReception: null });
    await m.s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601', dateReception: '2026-01-05' });
    expect(m.creees[0]).toMatchObject({ exerciceId: 'ex26', date: '2026-01-05' });
    expect(m.prisma.facture.updateMany).toHaveBeenCalledWith({
      where: { id: 'f1', tenantId: 't', ecritureId: null, dateReception: null },
      data: { ecritureId: 'e1', dateReception: J('2026-01-05') },
    });
    expect(m.facture.dateReception).toEqual(J('2026-01-05'));
  });

  it('une réception déjà portée ne se change pas au passage, et une réception avant la facture est refusée', async () => {
    await expect(
      monde().s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601', dateReception: '2026-01-09' }),
    ).rejects.toThrow(/ne se change pas/);
    await expect(
      monde({ dateReception: null }).s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601', dateReception: '2025-12-20' }),
    ).rejects.toThrow(/antérieure à la date de la facture/);
  });

  it('aucun exercice ne couvre la réception · refus nommé, rien de passé', async () => {
    const m = monde({ exercices: [{ id: 'ex25', dateDebut: J('2025-01-01'), dateFin: J('2025-12-31') }] });
    await expect(m.s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601' })).rejects.toThrow(/date de réception de la facture/);
    expect(m.ecritures.creer).not.toHaveBeenCalled();
  });

  it('reçue dans le même exercice · aucun avertissement', async () => {
    const m = monde({ dateReception: J('2025-12-30') });
    const r = await m.s.comptabiliser('t', 'u', 'f1', { journalId: 'ja', compteGestionId: 'c601' });
    expect(m.creees[0]).toMatchObject({ exerciceId: 'ex25', date: '2025-12-30' });
    expect(r).not.toHaveProperty('avertissement');
  });
});

describe('la migration de la ligne A21', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../../prisma/migrations/20270130000000_facture_date_reception/migration.sql'), 'utf8');
  it('ajoute la colonne nullable SANS défaut · une facture d’avant ne reçoit aucune date inventée', () => {
    expect(sql).toMatch(/ADD COLUMN "dateReception" TIMESTAMP\(3\);/);
    expect(sql).not.toMatch(/dateReception"[^;]*DEFAULT/);
    expect(sql).not.toMatch(/UPDATE "factures"/);
  });
  it('la base refuse une réception sur une vente ou avant la pièce', () => {
    expect(sql).toMatch(/CHECK \("dateReception" IS NULL OR \("sens" = 'ACHAT' AND "dateReception" >= "dateFacture"\)\)/);
  });
});
