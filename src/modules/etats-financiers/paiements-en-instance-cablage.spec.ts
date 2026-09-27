import { ExportController } from '../exports/export.controller';
import { EtatsFinanciersController } from './etats-financiers.controller';

/**
 * REPÈRE H · LE CÂBLAGE DES TROIS PORTES (audit final F13). La lecture est
 * juste ; encore faut-il que l'écran, l'export du tableau et la liasse
 * complète la fassent passer au service. Une porte qui reprendrait
 * `Number(x ?? 0)` rendrait le zéro que F13 retire, sans qu'aucun test de la
 * règle ne le voie.
 */
const user = { tenantId: 't1' } as never;
const res = () => ({ set: jest.fn(), send: jest.fn() }) as never;
const classeur = { buffer: Buffer.from(''), nomFichier: 'x.xlsx' };

describe('Repère H · câblage des portes (audit final F13)', () => {
  it('l’écran passe « non renseigné » au service, et un montant tel quel', async () => {
    const budget = { reconciliationTresorerie: jest.fn().mockResolvedValue({}) };
    const ctl = new EtatsFinanciersController({} as never, {} as never, {} as never, budget as never);
    await ctl.reconciliationTresorerie(user, 'ex', undefined);
    await ctl.reconciliationTresorerie(user, 'ex', '0');
    expect(budget.reconciliationTresorerie.mock.calls.map((c) => c[2])).toEqual([null, 0]);
  });

  it('les deux exports passent « non renseigné », et refusent l’illisible avant tout calcul', async () => {
    const svc = {
      reconciliationTresorerieExcel: jest.fn().mockResolvedValue(classeur),
      liasseCompleteExcel: jest.fn().mockResolvedValue(classeur),
    };
    const ctl = new ExportController(svc as never);
    await ctl.reconciliationTresorerie(user, res(), 'ex', undefined);
    await ctl.liasseComplete(user, res(), 'ex', '');
    await expect(ctl.liasseComplete(user, res(), 'ex', 'mille')).rejects.toThrow(/illisibles/);
    expect({
      tableau: svc.reconciliationTresorerieExcel.mock.calls.map((c) => c[2]),
      liasse: svc.liasseCompleteExcel.mock.calls.map((c) => c[2]),
    }).toEqual({ tableau: [null], liasse: [null] });
  });
});
