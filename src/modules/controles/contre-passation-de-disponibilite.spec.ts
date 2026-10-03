import { JeuEtatsFinanciersSycebnl } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * CONTRÔLE 34 · LES ANCIENNES CONTRE-PASSATIONS QUI ONT INVERSÉ UNE CAISSE
 * (ligne A5 bis). AUDCIF art. 57 · l'écart d'une disponibilité en devise est
 * réalisé, inscrit « directement dans les produits et charges de
 * l'exercice » ; avant A5 bis, la contre-passation l'inversait à
 * l'ouverture. Rien n'est retraité (art. 20, al. 2 ; art. 22, 2°) · le
 * contrôle nomme la ligne, son montant, et l'issue selon que l'exercice de la
 * réévaluation est encore ouvert (annulation, D6) ou clôturé.
 */

function service(reevaluations: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(reevaluations);
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'e27', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') }),
    },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS }),
    },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
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
    reevaluation: { findMany },
    rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  return { svc: new ControlesService(prisma), findMany };
}

/**
 * Réévaluation au 31/12/2026, contre-passée au 01/01/2027 caisse comprise
 * (forme d'avant A5 bis). L'issue se règle sur l'exercice qui PORTE la
 * contre-passation (second tour, m2).
 */
const ancienne = (statutExercice: 'OUVERT' | 'CLOTURE', statutPorteuse: 'OUVERT' | 'CLOTURE' = statutExercice) => ({
  dateReevaluation: new Date('2026-12-31'),
  exercice: { statut: statutExercice },
  ecritureExtourne: {
    numeroPiece: 12,
    date: new Date('2027-01-01'),
    exercice: { statut: statutPorteuse },
    lignes: [
      { debit: 0, credit: 300_000, compte: { numero: '47810000' } },
      { debit: 300_000, credit: 0, compte: { numero: '41110000' } },
      { debit: 0, credit: 300_000, compte: { numero: '67600000' } },
      { debit: 300_000, credit: 0, compte: { numero: '57120000' } },
    ],
  },
});

const trouver = async (svc: ControlesService) =>
  (await svc.analyser('t', 'e27')).anomalies.find((a) => a.code === 'CONTRE_PASSATION_DE_DISPONIBILITE');

describe('contrôle 34 · contre-passation qui a inversé une disponibilité', () => {
  it('nomme la caisse inversée, son montant, et l’annulation quand l’exercice de la réévaluation est ouvert', async () => {
    const { svc, findMany } = service([ancienne('OUVERT')]);
    const a = await trouver(svc);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('INFORMATION');
    expect(a!.occurrences).toEqual([
      expect.objectContaining({ reference: '57120000 · contre-passation n° 12', montant: 300_000, date: '2027-01-01' }),
    ]);
    expect(a!.action).toMatch(/annulez-la \(Devises, « Annuler la contre-passation »/);
    // Lu dans l'exercice qui PORTE la contre-passation, réévaluations annulées écartées.
    // (Le contrôle 32 lit aussi les traces des contre-passations annulées, m3 · l'appel du 34 se retrouve par son filtre.)
    const appel34 = findMany.mock.calls.find((c) => c[0].where?.ecritureExtourne);
    expect(appel34?.[0].where).toMatchObject({ tenantId: 't', annuleeLe: null, ecritureExtourne: { is: { exerciceId: 'e27' } } });
  });

  it('exercice qui porte la contre-passation clôturé · aucune annulation proposée, et la ligne de la banque ne se repasse pas à la main', async () => {
    const { svc } = service([ancienne('CLOTURE')]);
    const a = await trouver(svc);
    expect(a!.action).not.toMatch(/annulez-la/);
    expect(a!.action).toMatch(/Contre-passation dans un exercice clôturé/);
    expect(a!.action).toMatch(/passerait l’écart une seconde fois/);
  });

  it('m2 · réévaluation d’un exercice clôturé, contre-passation dans un exercice ouvert · elle s’annule seule, sans la réévaluation entière', async () => {
    const { svc } = service([ancienne('CLOTURE', 'OUVERT')]);
    const a = await trouver(svc);
    expect(a!.action).toMatch(/Contre-passation dans un exercice encore ouvert · annulez-la \(Devises, « Annuler la contre-passation »/);
    expect(a!.action).not.toMatch(/exercice clôturé/);
  });

  it('B-I · la conséquence ne promet un résultat juste qu’une fois la réévaluation passée, et cumulé', async () => {
    const { svc } = service([ancienne('OUVERT')]);
    const a = await trouver(svc);
    expect(a!.consequence).toMatch(/une fois elle passée, le résultat cumulé des exercices en sort juste/);
    expect(a!.consequence).not.toMatch(/le résultat net en sort juste/);
  });

  it('M7 · exercice ouvert · l’annulation nomme son préalable, et la phrase de l’exercice clôturé ne vient pas', async () => {
    const { svc } = service([ancienne('OUVERT')]);
    const a = await trouver(svc);
    expect(a!.action).toMatch(/après avoir annulé la réévaluation de cet exercice-ci s'il est déjà réévalué/);
    expect(a!.action).not.toMatch(/exercice clôturé/);
  });

  it('M7 · contre-passation intégrale par exception nommée (B2) · dite comme telle, sans issue à prendre', async () => {
    const voulue = { ...ancienne('OUVERT'), contrePassationIntegrale: 'EXERCICE_SUIVANT_ANCIEN_REGIME' };
    const { svc } = service([voulue]);
    const a = await trouver(svc);
    expect(a!.occurrences[0].detail).toMatch(/contre-passation intégrale par exception \(exercice suivant réévalué sous l’ancien régime\)/);
    expect(a!.action).toMatch(/par exception nommée/);
    expect(a!.action).not.toMatch(/annulez-la/);
  });

  it('se tait sur une contre-passation qui ne porte que le 478, le 479 et le tiers (forme d’A5 bis)', async () => {
    const a5bis = ancienne('OUVERT');
    a5bis.ecritureExtourne.lignes = a5bis.ecritureExtourne.lignes.slice(0, 2);
    const { svc } = service([a5bis]);
    expect(await trouver(svc)).toBeUndefined();
  });
});
