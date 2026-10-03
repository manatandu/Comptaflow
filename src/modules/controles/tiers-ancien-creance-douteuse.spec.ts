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
/** Le reclassement en vigueur du compte d'origine, le plus récent (mineur 9). */
const RECLASSE_LE = new Date('2026-01-10');

function ligne(numero: string, debit: number, credit = 0, creanceReclassee = false) {
  idLigne += 1;
  return {
    id: `l${idLigne}`,
    debit,
    credit,
    lettre: null,
    compte: {
      id: `c-${numero}`,
      numero,
      intitule: `Compte ${numero}`,
      ...(creanceReclassee ? { creancesDouteusesSource: [{ dateReclassement: RECLASSE_LE }] } : {}),
    },
  };
}

function ecriture(libelle: string, lignes: ReturnType<typeof ligne>[], liaisons: Record<string, unknown> = {}, date = new Date('2026-01-05')) {
  return {
    id: `e-${libelle}`,
    date,
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
    // Les traces des contre-passations annulées (A5 bis, contrôle 32) · aucune ici.
    reevaluation: { findMany: jest.fn().mockResolvedValue([]) },
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

  // MINEUR 9 · seule la facture antérieure au reclassement est nommée · une
  // vente postérieure du même client est une créance ordinaire, à lettrer avec
  // son règlement. Aucun critère de TVA (règle d'A7, rétablie au second tour).
  it('mineur 9 · une vente postérieure au reclassement n’est pas annotée ; une facture antérieure l’est, taxée ou non (règle d’A7)', async () => {
    const posterieure = ecriture(
      'Facture F-130',
      [ligne('41110001', 580_000, 0, true), ligne('70100000', 0, 500_000), ligne('44310000', 0, 80_000)],
      {},
      new Date('2026-01-20'),
    );
    const sansTva = ecriture('Facture F-119', [ligne('41110001', 300_000, 0, true), ligne('70100000', 0, 300_000)]);
    const a = await anciennes([facture(), posterieure, sansTva]);
    expect(a!.occurrences.map((o) => o.detail)).toEqual([
      "Facture F-118 · compte d'une créance reclassée au 416, à ne pas lettrer avec le reclassement",
      'Facture F-130',
      "Facture F-119 · compte d'une créance reclassée au 416, à ne pas lettrer avec le reclassement",
    ]);
  });

  it('sans liaison servie, rien ne passe pour tenu · une facture ordinaire reste listée telle quelle', async () => {
    const a = await anciennes([ecriture('Facture ordinaire', [ligne('41110009', 300_000), ligne('70100000', 0, 300_000)])]);
    expect(a!.occurrences.map((o) => o.detail)).toEqual(['Facture ordinaire']);
  });

  // A7 TER, MINEUR 1 · le règlement de la créance passé sur le compte du
  // client (Règlement des tiers) après le reclassement le rend CRÉDITEUR · le
  // chemin juste n'est pas le 4191 de TIERS_SOLDE_INVERSE, c'est le
  // recouvrement du module · constat propre, en information.
  it('mineur 1 et m-d · le compte d’origine d’une créance reclassée devenu créditeur a son constat, en AVERTISSEMENT, hors du solde inversé', async () => {
    const reglement = ecriture('Règlement client', [ligne('52110000', 400_000), ligne('41110001', 0, 400_000, true)]);
    const r = await service([facture(), reclassement(), reglement]).analyser('t', 'ex');
    const constat = r.anomalies.find((a) => a.code === 'COMPTE_CREANCE_RECLASSEE_CREDITEUR');
    expect(constat).toMatchObject({ gravite: 'AVERTISSEMENT' });
    expect(constat!.occurrences).toEqual([expect.objectContaining({ reference: '41110001', montant: -400_000 })]);
    expect(constat!.action).toMatch(/passez l’encaissement par « Recouvrement » dans « Créances douteuses ou litigieuses »/);
    const inverse = r.anomalies.find((a) => a.code === 'TIERS_SOLDE_INVERSE');
    expect(inverse?.occurrences.map((o) => o.reference) ?? []).not.toContain('41110001');
  });

  it('la lecture porte les trois liaisons et le compte d’origine en vigueur (une seule lecture des écritures)', () => {
    const source = readFileSync(join(__dirname, 'controles.service.ts'), 'utf8');
    const select = source.slice(source.indexOf('const SELECT_ECRITURE_CONTROLEE'), source.indexOf('satisfies Prisma.EcritureSelect'));
    expect(select).toContain('creanceDouteuseReclassement: { select: { annuleeLe: true } }');
    expect(select).toContain('mouvementCreanceDouteuse: { select: { annuleeLe: true, creance: { select: { annuleeLe: true } } } }');
    expect(select).toContain('ajustementCreanceDouteuse: { select: { annuleeLe: true, creance: { select: { annuleeLe: true } } } }');
    expect(select).toMatch(/creancesDouteusesSource: \{\s*where: \{ annuleeLe: null \},\s*select: \{ dateReclassement: true \},\s*orderBy: \{ dateReclassement: 'desc' \},\s*take: 1,/);
  });
});
