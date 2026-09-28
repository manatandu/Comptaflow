import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE PRORATA D'UN EXERCICE CLOS · régression de l'audit final F4.
 *
 * L'écriture qui solde les classes 6 à 8 sur le 13 entre VALIDÉE, datée de
 * la fin de l'exercice. Elle CRÉDITE les comptes de classe 7 à solde débiteur
 * (le 709 des rabais accordés) · lue avec le reste, elle comptait ce crédit
 * comme une recette, au dénominateur et parmi les recettes que rien ne
 * qualifie, sur toute période qui touche la clôture.
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };
const TAXEES = 40_000_000;
const NON_QUALIFIEES = 10_000_000;
// Le 709 débité de 3 000 000 dans l'année · la clôture le crédite d'autant.
const CREDIT_DE_CLOTURE_SUR_709 = 3_000_000;

function service() {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { OR?: unknown; numero?: { startsWith?: string } } | undefined;
        if (compte?.OR) return Promise.resolve([]);
        if (compte?.numero?.startsWith !== '443') return Promise.resolve([]);
        return Promise.resolve([
          { credit: (TAXEES * 16) / 100, ecritureId: 'e-taxee', compte: { numero: '44310000' }, tauxTva: { taux: 16 } },
        ]);
      }),
      // LA DOUBLURE HONORE LE FILTRE DE L'ÉCRITURE DE SOLDE · le crédit de
      // clôture sur le 709 n'est écarté que si la requête le demande.
      aggregate: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { OR?: unknown } | undefined;
        const ecriture = where.ecriture as { lignes?: { none?: unknown }; estSoldeDesComptesDeGestion?: boolean } | undefined;
        const cloture = ecriture?.estSoldeDesComptesDeGestion === false ? 0 : CREDIT_DE_CLOTURE_SUR_709;
        if (ecriture?.lignes?.none) return Promise.resolve({ _sum: { credit: NON_QUALIFIEES + cloture } });
        if (compte?.OR) return Promise.resolve({ _sum: { credit: 0 } });
        return Promise.resolve({ _sum: { credit: TAXEES + NON_QUALIFIEES + cloture } });
      }),
    },
    liquidationTva: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

describe('Prorata · un exercice clos (régression de F4)', () => {
  it('ne compte pas le crédit de clôture comme une recette', async () => {
    const p = await service().calculerProrata('t1', new Date('2026-01-01'), new Date('2026-12-31T23:59:59.999Z'));
    expect(p.denominateur).toBe(TAXEES + NON_QUALIFIEES);
    expect(p.recettesNonQualifiees).toBe(NON_QUALIFIEES);
    expect(p.pourcentage).toBe(80);
  });
});
