import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * OÙ ATTERRIT UN CRÉDIT DE TVA.
 *
 * Le plan SYSCOHADA subdivise le compte 444 « État, TVA due ou crédit de
 * TVA » en deux : « 4441 État, TVA due » et « 4449 État, crédit de TVA à
 * reporter ». Le SYCEBNL ne le subdivise pas et ne sème que 44410000, qui y
 * porte les deux sens.
 *
 * La liquidation servait 44410000 dans les deux sens et pour les deux
 * référentiels. Écrire un crédit de TVA au DÉBIT du 4441 « TVA due » est un
 * contresens : le compte finit débiteur alors que son intitulé annonce une
 * dette, et le poste de bilan qui le lit range une créance sur l'État parmi
 * les dettes fiscales. Rien ne le signale · l'écriture reste équilibrée, la
 * balance aussi, et seul le bilan est faux.
 *
 * Ces tests regardent le COMPTE d'arrivée, pas le montant · le montant était
 * juste depuis le début, c'est l'imputation qui ne l'était pas.
 */
type Faux = Record<string, unknown>;

function service(net: number, referentiel: 'SYCEBNL' | 'SYSCOHADA') {
  const ecrites: { compteId: string; debit?: number; credit?: number; libelle?: string }[][] = [];
  // Le semis SYSCOHADA pose 44410000 ET 44490000 ; celui du SYCEBNL n'a que
  // 44410000. Le faux plan reproduit cette différence, sans quoi le test ne
  // prouverait rien.
  const plan = referentiel === 'SYSCOHADA' ? ['44410000', '44490000'] : ['44410000'];
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel }) },
    compte: {
      findFirst: jest.fn(({ where }: { where: { numero: string } }) =>
        Promise.resolve(plan.includes(where.numero) ? { id: `c-${where.numero}`, numero: where.numero } : null),
      ),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od', code: 'OD' }) },
  } as Faux;
  const ecritureService = {
    creer: jest.fn((_t: string, _u: string, dto: { lignes: { compteId: string; debit?: number; credit?: number; libelle?: string }[] }) => {
      ecrites.push(dto.lignes);
      return Promise.resolve({ id: 'e1' });
    }),
  } as unknown as EcritureService;

  const svc = new TauxTvaService(prisma as unknown as PrismaService, ecritureService);
  // La déclaration elle-même n'est pas l'objet du test : elle a ses propres
  // tests d'exigibilité. On fige son résultat pour n'observer que l'écriture.
  jest.spyOn(svc, 'declaration').mockResolvedValue({
    totalCollecte: net > 0 ? 300 : 100,
    totalDeductibleAdmise: net > 0 ? 100 : 300,
    net,
    prorata: { pourcentage: 100 },
    lignes: [
      { compteCollecteId: 'c-443', totalCollecte: net > 0 ? 300 : 100, compteDeductibleId: 'c-445', totalDeductible: net > 0 ? 100 : 300 },
    ],
  } as never);
  return { svc, ecrites };
}

const liquider = (svc: TauxTvaService) =>
  svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex1', dateDebut: '2026-01-01', dateFin: '2026-01-31' });

describe('liquidation de TVA · le compte d’arrivée dépend du SENS et du référentiel', () => {
  it('SYSCOHADA · une TVA DUE se crédite au 4441', async () => {
    const { svc, ecrites } = service(200, 'SYSCOHADA');
    await liquider(svc);
    const ligne = ecrites[0].find((l) => (l.credit ?? 0) === 200);
    expect(ligne?.compteId).toBe('c-44410000');
  });

  it('SYSCOHADA · un CRÉDIT DE TVA se débite au 4449, jamais au 4441', async () => {
    const { svc, ecrites } = service(-200, 'SYSCOHADA');
    await liquider(svc);
    const ligne = ecrites[0].find((l) => (l.debit ?? 0) === 200);
    // 4449 « État, crédit de TVA à reporter ». C'EST LE DÉFAUT D'ORIGINE :
    // le crédit partait au débit du 4441 « État, TVA due ».
    expect(ligne?.compteId).toBe('c-44490000');
    expect(ecrites[0].map((l) => l.compteId)).not.toContain('c-44410000');
  });

  it('SYCEBNL · les deux sens restent sur son unique 44410000, que son plan ne subdivise pas', async () => {
    const due = service(200, 'SYCEBNL');
    await liquider(due.svc);
    expect(due.ecrites[0].find((l) => (l.credit ?? 0) === 200)?.compteId).toBe('c-44410000');

    const credit = service(-200, 'SYCEBNL');
    await liquider(credit.svc);
    expect(credit.ecrites[0].find((l) => (l.debit ?? 0) === 200)?.compteId).toBe('c-44410000');
  });

  it('un dossier SYSCOHADA sans 44490000 échoue en le NOMMANT, au lieu de retomber sur le 4441', async () => {
    const { svc } = service(-200, 'SYSCOHADA');
    // On retire 44490000 du faux plan pour simuler un dossier incomplet.
    const prisma = (svc as unknown as { prisma: { compte: { findFirst: jest.Mock } } }).prisma;
    prisma.compte.findFirst = jest.fn(({ where }: { where: { numero: string } }) =>
      Promise.resolve(where.numero === '44410000' ? { id: 'c-44410000', numero: '44410000' } : null),
    );
    await expect(liquider(svc)).rejects.toThrow(/44490000/);
  });
});
