import { TauxTvaService } from './taux-tva.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * L'ANNULATION D'UNE LIQUIDATION PASSE LE VRAI `EcritureService`.
 *
 * Audit du serveur du 2026-09-27, B1 · `liquidation-verrou.spec.ts` doublait
 * `EcritureService`, si bien que personne ne voyait `supprimer` refuser
 * l'écriture parce qu'une liquidation la tenait · le marqueur même que
 * l'annulation venait défaire. Ici la doublure est celle de Prisma, et le
 * marqueur n'existe plus qu'une fois SUPPRIMÉ dans la transaction.
 */

const EXERCICE = { id: 'ex', statut: 'OUVERT', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

function monter(options: { autreDetenteur?: boolean } = {}) {
  let marqueur: { id: string; ecritureId: string } | null = { id: 'liq1', ecritureId: 'ecr1' };
  const zero = () => ({ count: jest.fn().mockResolvedValue(0) });
  const ordre: string[] = [];
  const prisma: Record<string, unknown> = {
    ecriture: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ecr1', tenantId: 't1', statut: 'BROUILLARD', exercice: EXERCICE, lignes: [], journal: {}, date: new Date('2026-03-31'),
      }),
      delete: jest.fn().mockImplementation(async () => ordre.push('ecriture')),
    },
    ligneEcriture: { deleteMany: jest.fn().mockImplementation(async () => ordre.push('lignes')) },
    liquidationTva: {
      findFirst: jest.fn().mockImplementation(async () => marqueur),
      count: jest.fn().mockImplementation(async () => (marqueur ? 1 : 0)),
      delete: jest.fn().mockImplementation(async () => {
        ordre.push('marqueur');
        marqueur = null;
      }),
    },
    immobilisation: zero(),
    dotationAmortissement: zero(),
    depreciationImmobilisation: zero(),
    reclassementImmobilisation: zero(),
    reevaluation: zero(),
    regularisation: zero(),
    echeanceAbonnement: zero(),
    donation: { count: jest.fn().mockResolvedValue(options.autreDetenteur ? 1 : 0) },
    affectationResultat: zero(),
    executionEngagement: zero(),
    mouvementStock: zero(),
    ecartInventaire: zero(),
    consignation: zero(),
    bulletinPaie: zero(),
    ligneOrdreVirement: zero(),
    amortissementDerogatoire: zero(),
  };
  prisma.$transaction = jest.fn().mockImplementation((f: (tx: unknown) => unknown) => f(prisma));
  const ecritures = new EcritureService(prisma as unknown as PrismaService, {} as never, {} as never, {} as never);
  const tva = new TauxTvaService(prisma as unknown as PrismaService, ecritures);
  return { tva, ordre, marqueurRestant: () => marqueur };
}

describe('annulation d’une liquidation de TVA', () => {
  it('aboutit · le marqueur, puis les lignes, puis la tête, dans une transaction', async () => {
    const m = monter();
    await expect(m.tva.annulerLiquidation('t1', 'liq1')).resolves.toMatchObject({ supprime: true });
    expect(m.marqueurRestant()).toBeNull();
    expect(m.ordre).toEqual(['marqueur', 'lignes', 'ecriture']);
  });

  it('un AUTRE module qui tient l’écriture refuse encore · seul le détenteur nommé est libéré', async () => {
    const m = monter({ autreDetenteur: true });
    await expect(m.tva.annulerLiquidation('t1', 'liq1')).rejects.toThrow(/une donation/);
    expect(m.marqueurRestant()).not.toBeNull();
    expect(m.ordre).toEqual([]);
  });
});
