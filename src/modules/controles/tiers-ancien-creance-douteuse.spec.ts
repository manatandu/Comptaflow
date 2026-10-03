import { Referentiel } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LIGNE A7 TER, B2 (a) · `TIERS_ANCIEN_NON_LETTRE` listait la facture, le
 * reclassement au 416 et la perte d'une créance tenue par le module des
 * créances douteuses, et conseillait « Lettrez ce qui est réglé » · le
 * cabinet aurait lettré la facture avec le reclassement, ce qui rend la TVA
 * exigible. Les écritures TENUES par une créance en vigueur (reclassement,
 * mouvements, revues), reconnues par leur LIAISON, sortent du contrôle ; la
 * facture reste, NOMMÉE comme celle d'une créance reclassée.
 */

let idLigne = 0;
function ligne(numero: string, debit: number, credit = 0, creanceReclassee = false) {
  idLigne += 1;
  return {
    id: `l${idLigne}`,
    debit,
    credit,
    lettre: null,
    compte: { id: `c-${numero}`, numero, intitule: `Compte ${numero}`, ...(creanceReclassee ? { creancesDouteusesSource: [{ id: 'cd-1' }] } : {}) },
  };
}

function ecriture(libelle: string, lignes: ReturnType<typeof ligne>[], liaisons: Record<string, unknown> = {}) {
  return {
    id: `e-${libelle}`,
    date: new Date('2026-01-05'),
    libelle,
    reference: 'PJ-1',
    numeroPiece: 1,
    createdAt: new Date('2026-01-05'),
    statut: 'VALIDEE',
    journalId: 'jOD',
    journal: { code: 'OD' },
    lignes,
    ...liaisons,
  };
}

function service(ecritures: ReturnType<typeof ecriture>[]) {
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }) },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 't',
        referentiel: Referentiel.SYSCOHADA,
        jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
        systemeComptableSyscohada: null,
        formeJuridiqueSyscohada: null,
      }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
    clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    cloture: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const anciennes = async (ecritures: ReturnType<typeof ecriture>[]) =>
  (await service(ecritures).analyser('t', 'ex')).anomalies.find((a) => a.code === 'TIERS_ANCIEN_NON_LETTRE');

// La créance du relecteur · facture de 1 160 000, reclassée au 4162, perdue en partie.
const facture = () => ecriture('Facture F-118', [ligne('41110001', 1_160_000, 0, true), ligne('70100000', 0, 1_000_000), ligne('44310000', 0, 160_000)]);
const reclassement = (annuleeLe: Date | null = null) =>
  ecriture('Créance douteuse reclassée', [ligne('41620000', 1_160_000), ligne('41110001', 0, 1_160_000, true)], {
    creanceDouteuseReclassement: { annuleeLe },
  });
const perte = (annuleeLe: Date | null = null, creanceAnnulee: Date | null = null) =>
  ecriture('Perte sur créance irrécouvrable', [ligne('65110000', 400_000), ligne('41620000', 0, 400_000)], {
    mouvementCreanceDouteuse: { annuleeLe, creance: { annuleeLe: creanceAnnulee } },
  });

describe('A7 ter, B2 (a) · le contrôle d’ancienneté laisse au module ce qu’il tient', () => {
  it('le reclassement et la perte d’une créance en vigueur sortent du contrôle, reconnus par leur liaison', async () => {
    const a = await anciennes([facture(), reclassement(), perte()]);
    expect(a).toBeDefined();
    expect(a!.occurrences.map((o) => o.detail)).toEqual([
      "Facture F-118 · compte d'une créance reclassée au 416, à ne pas lettrer avec le reclassement",
    ]);
    expect(a!.action).toMatch(/ne se lettre pas avec le reclassement/);
  });

  it('un acte ANNULÉ, ou une créance annulée, ne tient plus rien · ses écritures reviennent au contrôle', async () => {
    const a = await anciennes([reclassement(new Date('2026-03-01')), perte(new Date('2026-03-01')), perte(null, new Date('2026-03-02'))]);
    expect(a!.occurrences).toHaveLength(3);
  });

  it('sans liaison servie, rien ne passe pour tenu · une facture ordinaire reste listée telle quelle', async () => {
    const a = await anciennes([ecriture('Facture ordinaire', [ligne('41110009', 300_000), ligne('70100000', 0, 300_000)])]);
    expect(a!.occurrences.map((o) => o.detail)).toEqual(['Facture ordinaire']);
  });

  it('la lecture porte les trois liaisons et le compte d’origine en vigueur (une seule lecture des écritures)', () => {
    const source = readFileSync(join(__dirname, 'controles.service.ts'), 'utf8');
    const select = source.slice(source.indexOf('const SELECT_ECRITURE_CONTROLEE'), source.indexOf('satisfies Prisma.EcritureSelect'));
    expect(select).toContain('creanceDouteuseReclassement: { select: { annuleeLe: true } }');
    expect(select).toContain('mouvementCreanceDouteuse: { select: { annuleeLe: true, creance: { select: { annuleeLe: true } } } }');
    expect(select).toContain('ajustementCreanceDouteuse: { select: { annuleeLe: true, creance: { select: { annuleeLe: true } } } }');
    expect(select).toContain('creancesDouteusesSource: { where: { annuleeLe: null }, select: { id: true }, take: 1 }');
  });
});
