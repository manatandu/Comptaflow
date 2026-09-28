import { Referentiel } from '@prisma/client';
import { DossierRevisionService } from './dossier-revision.service';

/**
 * DOSSIER DE RÉVISION · le solde que le réviseur lit, compte par compte.
 *
 * L'écriture qui solde les classes 6 à 8 sur le 13 à la clôture entre
 * VALIDÉE depuis l'audit final F4. Lue avec elle, chaque charge d'un exercice
 * clos sortait à zéro sous des débits et des crédits doublés.
 */

type Mouvement = { compteId: string; debit: number; credit: number; soldeDeGestion?: boolean };

function service(mouvements: Mouvement[], comptes: { id: string; numero: string; intitule: string }[]) {
  const prisma = {
    ligneEcriture: {
      // LA DOUBLURE HONORE LE FILTRE · elle somme par compte ce que la requête
      // retient, et n'écarte le solde de clôture que si la requête le demande.
      groupBy: jest.fn(async ({ where }: { where: { ecriture: { estSoldeDesComptesDeGestion?: boolean } } }) => {
        const parCompte = new Map<string, { debit: number; credit: number }>();
        for (const m of mouvements) {
          if (m.soldeDeGestion && where.ecriture.estSoldeDesComptesDeGestion === false) continue;
          const a = parCompte.get(m.compteId) ?? { debit: 0, credit: 0 };
          a.debit += m.debit;
          a.credit += m.credit;
          parCompte.set(m.compteId, a);
        }
        return [...parCompte].map(([compteId, s]) => ({ compteId, _sum: s }));
      }),
    },
    compte: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        comptes.filter((c) => where.id.in.includes(c.id)),
      ),
    },
  };
  return new DossierRevisionService(prisma as never);
}

describe('Dossier de révision · un exercice clos', () => {
  it('rend la charge de l’année, pas le zéro du solde de clôture (régression de F4)', async () => {
    const svc = service(
      [
        { compteId: 'c-601', debit: 400, credit: 0 },
        { compteId: 'c-601', debit: 0, credit: 400, soldeDeGestion: true },
        { compteId: 'c-131', debit: 400, credit: 0, soldeDeGestion: true },
      ],
      [
        { id: 'c-601', numero: '60110000', intitule: 'Achats' },
        { id: 'c-131', numero: '13100000', intitule: 'Résultat' },
      ],
    );
    const { comptes } = await svc.dossier('t-1', 'ex-1', Referentiel.SYSCOHADA);
    expect(comptes.map((c) => [c.numero, c.debit, c.credit, c.solde])).toEqual([['60110000', 400, 0, 400]]);
  });
});
