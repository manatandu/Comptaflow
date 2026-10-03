import { StatutEcriture, StatutExercice } from '@prisma/client';
import { DevisesService } from './devises.service';
import type { PrismaService } from '../../common/prisma.service';
import type { EcritureService } from '../comptabilite/ecriture.service';

/**
 * ANNULER UNE RÉÉVALUATION (ligne A6, décision D6 du 2026-10-03) · AUDCIF
 * art. 20, al. 2 (« exclusivement par inscription en négatif des éléments
 * erronés ; l'enregistrement exact est ensuite opéré »), art. 22, 2° (une
 * écriture validée est irréversible), art. 20, al. 3 (l'exercice clos relève
 * du report à nouveau, hors du geste). Ce qui casserait en silence · une
 * écriture validée supprimée, une réévaluation effacée au lieu d'être
 * marquée, ou une annulation qui laisse une postérieure partir d'une
 * provision qui n'existe plus.
 */
type Ecr = { id: string; statut: StatutEcriture; numeroPiece: number; exercice: { statut: StatutExercice } };
const ecr = (id: string, statut: StatutEcriture, exercice: StatutExercice = StatutExercice.OUVERT): Ecr => ({ id, statut, numeroPiece: 7, exercice: { statut: exercice } });

function monter(p: {
  ecarts?: Ecr | null;
  provision?: Ecr | null;
  extourne?: Ecr | null;
  exercice?: StatutExercice;
  annuleeLe?: Date | null;
  posterieure?: { dateReevaluation: Date } | null;
  version?: { compteProvision: string; dateReference: Date } | null;
}) {
  const reeval = {
    id: 'r1',
    tenantId: 't',
    exerciceId: 'ex',
    dateReevaluation: new Date('2026-12-31'),
    annuleeLe: p.annuleeLe ?? null,
    exercice: { statut: p.exercice ?? StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') },
    ecritureEcarts: p.ecarts === undefined ? ecr('ecarts', StatutEcriture.VALIDEE) : p.ecarts,
    ecritureProvision: p.provision === undefined ? ecr('prov', StatutEcriture.BROUILLARD) : p.provision,
    ecritureExtourne: p.extourne ?? null,
  };
  const tx = {
    reevaluation: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'r1', annuleeLe: new Date() }),
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    ecriture: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    reevaluation: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; dateReevaluation?: unknown } }) =>
        where.id ? reeval : (p.posterieure ?? null),
      ),
    },
    provisionChangeOuverture: { findFirst: jest.fn(async () => p.version ?? null) },
    verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const inscrire = jest.fn(async (_t: string, _u: string, id: string) => ({ id: `neg-${id}`, numeroPiece: 99, date: new Date('2026-12-31') }));
  const service = new DevisesService(prisma as unknown as PrismaService, { inscrireEnNegatifPourAnnulation: inscrire } as unknown as EcritureService);
  return { service, prisma, tx, inscrire };
}

describe('annuler une réévaluation des devises (D6)', () => {
  it('validée · inscrite en négatif ; au brouillard · supprimée ; l’enregistrement est MARQUÉ, jamais supprimé', async () => {
    const { service, tx, inscrire } = monter({});
    await service.annulerReevaluation('t', 'u', 'r1', 'Cours du 31/12 corrigé');
    expect(inscrire).toHaveBeenCalledTimes(1);
    expect(inscrire).toHaveBeenCalledWith('t', 'u', 'ecarts', 'Cours du 31/12 corrigé', tx);
    expect(tx.ecriture.deleteMany).toHaveBeenCalledWith({ where: { id: 'prov', tenantId: 't' } });
    expect(tx.ecriture.deleteMany).not.toHaveBeenCalledWith({ where: { id: 'ecarts', tenantId: 't' } });
    const marque = tx.reevaluation.updateMany.mock.calls[0][0];
    expect(marque.where).toEqual({ id: 'r1', tenantId: 't', annuleeLe: null });
    expect(marque.data).toMatchObject({ annuleePar: 'u', motifAnnulation: 'Cours du 31/12 corrigé', annuleeLe: expect.any(Date) });
    expect(marque.data.annulation).toEqual([
      expect.objectContaining({ role: 'ECARTS', traitement: 'INSCRITE_EN_NEGATIF', negatifId: 'neg-ecarts' }),
      expect.objectContaining({ role: 'PROVISION', traitement: 'SUPPRIMEE' }),
    ]);
  });

  it('avec la contre-passation en N+1 · elle est annulée aussi', async () => {
    const { service, inscrire } = monter({ extourne: ecr('ext', StatutEcriture.VALIDEE), provision: ecr('prov', StatutEcriture.VALIDEE) });
    await service.annulerReevaluation('t', 'u', 'r1', 'motif');
    expect(inscrire.mock.calls.map((c) => c[2])).toEqual(['ecarts', 'prov', 'ext']);
  });

  it('le motif est obligatoire', async () => {
    const { service } = monter({});
    await expect(service.annulerReevaluation('t', 'u', 'r1', '  ')).rejects.toThrow(/motif de l'annulation est obligatoire/);
  });

  it('refus nommés · exercice clôturé, contre-passation dans un exercice clos, déjà annulée', async () => {
    await expect(monter({ exercice: StatutExercice.CLOTURE }).service.annulerReevaluation('t', 'u', 'r1', 'm')).rejects.toThrow(
      /exercice de cette réévaluation est clôturé.*art\. 20, al\. 3/,
    );
    await expect(
      monter({ extourne: ecr('ext', StatutEcriture.VALIDEE, StatutExercice.CLOTURE) }).service.annulerReevaluation('t', 'u', 'r1', 'm'),
    ).rejects.toThrow(/contre-passation .* exercice clôturé/);
    await expect(monter({ annuleeLe: new Date('2027-01-10') }).service.annulerReevaluation('t', 'u', 'r1', 'm')).rejects.toThrow(/déjà annulée/);
  });

  it('refus · une réévaluation postérieure non annulée, ou une version d’ouverture qui s’appuie sur celle-ci · rien n’est écrit', async () => {
    const posterieure = monter({ posterieure: { dateReevaluation: new Date('2027-12-31') } });
    await expect(posterieure.service.annulerReevaluation('t', 'u', 'r1', 'm')).rejects.toThrow(/2027-12-31, postérieure, n'est pas annulée/);
    expect(posterieure.prisma.$transaction).not.toHaveBeenCalled();
    const version = monter({ version: { compteProvision: '4991', dateReference: new Date('2027-01-01') } });
    await expect(version.service.annulerReevaluation('t', 'u', 'r1', 'm')).rejects.toThrow(/déclarée au 2027-01-01 \(compte 4991\) s'appuie/);
    expect(version.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('les lectures « la réévaluation de l’exercice » écartent les annulées · la réévaluation EXACTE peut suivre', () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const devises = readFileSync(join(__dirname, 'devises.service.ts'), 'utf8');
    const corps = (debut: string) => devises.slice(devises.indexOf(debut), devises.indexOf('\n  }\n', devises.indexOf(debut)));
    expect(corps('const dejaFaite = await this.prisma.reevaluation.findFirst({')).toContain('annuleeLe: null');
    expect(corps('private async reevaluationUtilisatrice(')).toContain('annuleeLe: null');
    expect(corps('private async motifRefusOrdre(')).toContain('annuleeLe: null');
    const ecritures = readFileSync(join(__dirname, '../comptabilite/ecriture.service.ts'), 'utf8');
    expect(ecritures).toContain("where: { tenantId, annuleeLe: null, OR: [{ ecritureEcartsId: ecritureId }");
    const a6 = readFileSync(join(__dirname, '../reglements/reevaluation-et-ecart-realise.ts'), 'utf8');
    expect(a6.split('annuleeLe: null').length - 1).toBe(2);
  });
});
