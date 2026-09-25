// Les références restantes se lisent sur 32 relations · elles sont rendues
// par le vrai helper en production, et doublées ici pour vérifier qu'elles
// sont bien RENDUES à l'appelant.
jest.mock('../../common/suppression/references', () => ({
  ...jest.requireActual('../../common/suppression/references'),
  referencesVers: jest.fn().mockResolvedValue([{ modele: 'TauxTva', champ: 'compteCollecteId', nombre: 1 }]),
}));
import { EcritureService } from './ecriture.service';
import { dateDansExercice, motifRefusFusionComptes } from './reimputation';

const c = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  numero: id,
  classe: 'CLASSE_6',
  typeCompte: 'DETAIL',
  estActif: true,
  ...extra,
});

describe('Fusion de comptes · règles', () => {
  it('ne réunit que deux comptes de détail de la même classe, vers un compte actif', () => {
    expect(motifRefusFusionComptes(c('601'), c('601'))).toMatch(/lui-même/);
    expect(motifRefusFusionComptes(c('601'), c('60', { typeCompte: 'TOTAL' }))).toMatch(/détail/);
    expect(motifRefusFusionComptes(c('601'), c('401', { classe: 'CLASSE_4' }))).toMatch(/même classe/);
    expect(motifRefusFusionComptes(c('601'), c('604', { estActif: false }))).toMatch(/sommeil/);
    expect(motifRefusFusionComptes(c('601'), c('604'))).toBeNull();
  });

  it("date la correction dans l'exercice · aujourd'hui s'il y tombe, sa dernière journée sinon", () => {
    const ex = { dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') };
    expect(dateDansExercice(new Date('2026-03-01'), ex)).toEqual(new Date('2025-12-31'));
    expect(dateDansExercice(new Date('2025-06-15'), ex)).toEqual(new Date('2025-06-15'));
  });
});

describe('Fusion de comptes · le service', () => {
  function service(lignes: { id: string; exerciceId: string }[]) {
    const prisma = {
      compte: {
        findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(c(where.id))),
        update: jest.fn().mockResolvedValue({}),
      },
      ligneEcriture: {
        findMany: jest.fn().mockResolvedValue(
          lignes.map((l) => ({
            id: l.id,
            ecriture: { exercice: { id: l.exerciceId, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') } },
          })),
        ),
      },
    };
    const s = new EcritureService(prisma as never, {} as never, {} as never, {} as never);
    const appels: { simuler?: boolean; ids: string[] }[] = [];
    jest.spyOn(s, 'reimputer').mockImplementation(async (_t, _u, dto, options = {}) => {
      appels.push({ simuler: options.simuler, ids: dto.ligneIds });
      return { auBrouillard: dto.ligneIds.length, validees: 0, ecrituresPassees: [] };
    });
    return { s, prisma, appels };
  }

  it('SIMULE chaque exercice avant d’en écrire un seul, puis met le compte absorbé en sommeil', async () => {
    const { s, prisma, appels } = service([
      { id: 'l1', exerciceId: 'e1' },
      { id: 'l2', exerciceId: 'e2' },
    ]);
    const r = await s.fusionnerComptes('t', 'u', '601', '604', 'doublon');
    expect(appels.slice(0, 2).every((a) => a.simuler)).toBe(true);
    expect(appels.slice(2).every((a) => !a.simuler)).toBe(true);
    expect(prisma.compte.update).toHaveBeenCalledWith({ where: { id: '601' }, data: { estActif: false } });
    expect(r.auBrouillard).toBe(2);
    expect(r.encoreUtilisePar).toEqual(['taux de taxes (TVA collectée) (1)']);
  });

  it("n'écrit rien quand la simulation d'un exercice refuse", async () => {
    const { s, prisma } = service([{ id: 'l1', exerciceId: 'e1' }]);
    (s.reimputer as jest.Mock).mockRejectedValueOnce(new Error('La ligne du 601 est lettrée'));
    await expect(s.fusionnerComptes('t', 'u', '601', '604', 'doublon')).rejects.toThrow(/lettrée/);
    expect(prisma.compte.update).not.toHaveBeenCalled();
  });
});
