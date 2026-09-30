import { Referentiel } from '@prisma/client';
import { PLAN_COMPTES_SYSCOHADA } from './compte-seed-syscohada';
import { RENVOIS_PLAN_SYSCOHADA, renvoisDuPlanSyscohada } from './renvois-plan-syscohada';
import { CompteService } from './compte.service';

/**
 * PASSE R1, C8 · les renvois annexés au plan SYSCOHADA sont servis, texte
 * compris, pour chaque marqueur du semis.
 */
describe('renvois annexés au plan SYSCOHADA', () => {
  it('chaque marqueur du semis a son texte · aucun n’est orphelin', () => {
    const marqueurs = PLAN_COMPTES_SYSCOHADA.flatMap((l) => [...l.intitule.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    expect(marqueurs.length).toBeGreaterThan(20);
    for (const n of new Set(marqueurs)) expect([n, typeof RENVOIS_PLAN_SYSCOHADA[n]]).toEqual([n, 'string']);
    expect(Object.keys(RENVOIS_PLAN_SYSCOHADA).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('le renvoi [8] suit les 7072, 7073, 7075 et 7076, et dit le 706', () => {
    const huit = renvoisDuPlanSyscohada().filter((r) => r.renvoi === 8).map((r) => r.numero);
    expect(huit.sort()).toEqual(['70720000', '70730000', '70750000', '70760000']);
    expect(RENVOIS_PLAN_SYSCOHADA[8]).toBe(
      "À inscrire au compte 706 si ces produits correspondent à une activité principale de l'entité.",
    );
  });

  it('le serveur ne sert les renvois qu’à un dossier SYSCOHADA', async () => {
    const service = (referentiel: Referentiel) =>
      new CompteService({
        tenant: {
          findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 't' ? { referentiel } : null)),
        },
      } as never);
    expect((await service(Referentiel.SYSCOHADA).renvoisDuPlan('t')).length).toBeGreaterThan(20);
    expect(await service(Referentiel.SYCEBNL).renvoisDuPlan('t')).toEqual([]);
    expect(await service(Referentiel.SYSCOHADA).renvoisDuPlan('autre')).toEqual([]);
  });
});
