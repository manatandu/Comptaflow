import { StatutEcriture } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';
import { AnalytiqueService } from '../analytique/analytique.service';
import { AUCUN_VIREMENT, virementsDesLignes } from './virements-mise-en-service';

/**
 * D6 (2026-10-01) · la mise en service d'un bien en cours est un VIREMENT de
 * poste à poste. Ce que les notes des immobilisations brutes et le tableau
 * des flux retirent de leurs mouvements tient à UNE lecture, gelée ici sur
 * sa requête · une doublure qui rendrait ce qu'on lui donne ne prouverait
 * rien, c'est le `where` qui dit quelles écritures sont retirées.
 */
describe('EcritureService.virementsDeMiseEnService', () => {
  function serviceAvec(groupes: Array<{ compteId: string; _sum: { debit: unknown; credit: unknown } }>) {
    const groupBy = jest.fn().mockResolvedValue(groupes);
    const prisma = { ligneEcriture: { groupBy } } as unknown as PrismaService;
    const service = new EcritureService(
      prisma,
      {} as JournalService,
      {} as ExerciceService,
      {} as AnalytiqueService,
    );
    return { service, groupBy };
  }

  it('ne retient que les écritures qu’une fiche désigne, au livre-journal, hors report à-nouveau', async () => {
    const { service, groupBy } = serviceAvec([
      { compteId: 'c231', _sum: { debit: '50000000', credit: '0' } },
      { compteId: 'c239', _sum: { debit: null, credit: '50000000' } },
    ]);
    const virements = await service.virementsDeMiseEnService('t1', 'e1');
    const { where, by } = groupBy.mock.calls[0][0];
    expect(by).toEqual(['compteId']);
    // La LIAISON de la fiche (`ecritureMiseEnServiceId`), jamais le compte ni
    // le libellé · un crédit du 2x9 peut aussi être un rebut.
    expect(where.ecriture.immobilisationMiseEnService).toEqual({ isNot: null });
    // Les mêmes écritures que la colonne « mouvements » de `balance(…, false)`
    // que lisent les notes et le tableau des flux · retirer une mise en
    // service restée au brouillard ferait passer ces colonnes sous zéro.
    expect(where.ecriture.tenantId).toBe('t1');
    expect(where.ecriture.exerciceId).toBe('e1');
    expect(where.ecriture.statut).toBe(StatutEcriture.VALIDEE);
    expect(where.ecriture.estGenereeParCloture).toBe(false);
    expect(where.ecriture.libelle).toBeUndefined();
    expect(virements.get('c231')).toEqual({ debit: 50_000_000, credit: 0 });
    expect(virements.get('c239')).toEqual({ debit: 0, credit: 50_000_000 });
  });

  it('sans exercice (pas de N-1), aucun virement et aucune lecture', async () => {
    const { service, groupBy } = serviceAvec([]);
    expect(await service.virementsDeMiseEnService('t1', null)).toBe(AUCUN_VIREMENT);
    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe('virementsDesLignes', () => {
  it('cumule les virements des seuls comptes d’une rubrique, débit et crédit à part', () => {
    const virements = new Map([
      ['c231', { debit: 50, credit: 0 }],
      ['c2391', { debit: 0, credit: 50 }],
      ['c241', { debit: 7, credit: 0 }],
    ]);
    expect(virementsDesLignes([{ compteId: 'c231' }, { compteId: 'c2391' }], virements)).toEqual({ debit: 50, credit: 50 });
    expect(virementsDesLignes([{ compteId: 'c241' }], virements)).toEqual({ debit: 7, credit: 0 });
    expect(virementsDesLignes([{ compteId: 'c22' }], virements)).toEqual({ debit: 0, credit: 0 });
  });
});
