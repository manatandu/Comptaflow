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
/** L'écriture des écarts · créance (4781 / 4111) et caisse (676 / 5712), perte de 300 000 sur chacune. */
const ECARTS = [
  { compteId: 'c-4781', debit: 300_000, credit: 0, compte: { numero: '47810000' } },
  { compteId: 'c-4111', debit: 0, credit: 300_000, compte: { numero: '41110000' } },
  { compteId: 'c-676', debit: 300_000, credit: 0, compte: { numero: '67600000' } },
  { compteId: 'c-5712', debit: 0, credit: 300_000, compte: { numero: '57120000' } },
];
/** Sa contre-passation intégrale, ligne à ligne. */
const INVERSE = ECARTS.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));

const ancienne = (statutExercice: 'OUVERT' | 'CLOTURE', statutPorteuse: 'OUVERT' | 'CLOTURE' = statutExercice) => ({
  dateReevaluation: new Date('2026-12-31'),
  exercice: { statut: statutExercice },
  ecritureEcarts: { lignes: ECARTS },
  contrePassationDeclaree: null as unknown,
  ecritureExtourne: {
    exerciceId: 'e27',
    numeroPiece: 12,
    date: new Date('2027-01-01'),
    exercice: { statut: statutPorteuse },
    lignes: INVERSE,
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
    const appel34 = findMany.mock.calls.find((c) => c[0].where?.OR?.[0]?.ecritureExtourne);
    // La contre-passation du module OU celle faite à la main et déclarée (troisième tour), tri stable.
    expect(appel34?.[0].where).toMatchObject({
      tenantId: 't',
      annuleeLe: null,
      OR: [{ ecritureExtourne: { is: { exerciceId: 'e27' } } }, { contrePassationDeclaree: { is: { exerciceId: 'e27' } } }],
    });
    expect(appel34?.[0].orderBy).toEqual([{ dateReevaluation: 'asc' }, { id: 'asc' }]);
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

  it('mineur 1 · réévaluation des seules disponibilités · l’annulation est proposée, jamais « repassez-la », rien n’étant à repasser', async () => {
    const seules = ancienne('OUVERT');
    seules.ecritureEcarts = { lignes: ECARTS.slice(2) };
    seules.ecritureExtourne.lignes = INVERSE.slice(2);
    const { svc } = service([seules]);
    const a = await trouver(svc);
    expect(a!.action).toMatch(/annulez-la \(Devises, « Annuler la contre-passation »/);
    expect(a!.action).not.toMatch(/repassez-la/);
    expect(a!.action).toMatch(/il n'y a rien à repasser/);
  });

  describe('troisième tour · la contre-passation faite à la main et déclarée', () => {
    /** Une OD d'ouverture qui a tout inversé, plus une remise de chèque sur la banque 5211, autre geste groupé. */
    const declaree = (statutPorteuse: 'OUVERT' | 'CLOTURE', lignes = [...INVERSE, { compteId: 'c-5211', debit: 50_000, credit: 0, compte: { numero: '52110000' } }]) => ({
      ...ancienne('OUVERT'),
      ecritureExtourne: null,
      contrePassationDeclaree: { exerciceId: 'e27', numeroPiece: 40, date: new Date('2027-01-03'), exercice: { statut: statutPorteuse }, lignes },
    });

    it('elle a inversé la caisse · nommée comme manuelle, seule la caisse inversée (pas la remise de chèque), l’issue est de retirer la déclaration', async () => {
      const { svc } = service([declaree('OUVERT')]);
      const a = await trouver(svc);
      expect(a!.occurrences).toEqual([
        expect.objectContaining({ reference: '57120000 · contre-passation n° 40', montant: 300_000, detail: expect.stringMatching(/contre-passation manuelle déclarée/) }),
      ]);
      expect(a!.action).toMatch(/Contre-passation manuelle déclarée, dans un exercice encore ouvert · retirez la déclaration/);
      expect(a!.action).not.toMatch(/Annuler la contre-passation/);
    });

    it('exercice qui la porte clôturé · elle ne se corrige plus', async () => {
      const { svc } = service([declaree('CLOTURE')]);
      expect((await trouver(svc))!.action).toMatch(/Contre-passation manuelle déclarée, dans un exercice clôturé · elle ne se corrige plus/);
    });

    it('elle ne touche que le 478 et le tiers · rien à dire', async () => {
      const { svc } = service([declaree('OUVERT', INVERSE.slice(0, 2))]);
      expect(await trouver(svc)).toBeUndefined();
    });
  });
});
