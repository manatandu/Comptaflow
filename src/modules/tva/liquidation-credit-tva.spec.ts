import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * OÙ ATTERRIT UN CRÉDIT DE TVA, ET CE QU'IL DEVIENT ENSUITE.
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
 * SECOND VOLET, ARTICLE 63 · le crédit était bien CONSTATÉ, jamais IMPUTÉ.
 * « Lorsque le montant de la taxe sur la valeur ajoutée déductible au titre
 * d'un mois est supérieur à celui de la taxe exigible, l'excédent constitue un
 * crédit d'impôt imputable sur la taxe exigible du ou des mois suivants
 * jusqu'à l'épuisement. Le crédit d'impôt ne peut pas faire l'objet d'un
 * remboursement au profit de l'assujetti et ne peut être cédé. » Le report est
 * donc le régime de droit commun ET la seule issue ordinaire du crédit : la
 * déclaration du mois suivant annonçait pourtant « À PAYER » le net de sa
 * seule période, et le dossier versait deux fois pendant que son crédit
 * dormait au 4449.
 */
type Faux = Record<string, unknown>;

/**
 * @param net Net de la période AVANT report du crédit antérieur.
 * @param creditAnterieur Net de la dernière liquidation · négatif = crédit.
 */
function service(net: number, referentiel: 'SYCEBNL' | 'SYSCOHADA', creditAnterieur = 0) {
  const ecrites: { compteId: string; debit?: number; credit?: number; libelle?: string }[][] = [];
  const traces: Record<string, unknown>[] = [];
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
    // Le verrou anti-double-liquidation interroge ce marqueur avant tout · ici
    // aucune période n'est liquidée.
    liquidationTva: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: Record<string, unknown>) => {
        traces.push(args.data as Record<string, unknown>);
        return Promise.resolve({});
      }),
    },
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
  const creditImpute = Math.min(creditAnterieur, Math.max(0, net));
  // Collecté et déductible restent COHÉRENTS avec le net demandé · sans quoi
  // le contrôle d'équilibre de l'écriture ne prouverait rien.
  const collecte = 6_000_000;
  const deductibleAdmise = collecte - net;
  jest.spyOn(svc, 'declaration').mockResolvedValue({
    totalCollecte: collecte,
    totalDeductibleAdmise: deductibleAdmise,
    netAvantImputation: net,
    creditAnterieur,
    creditImpute,
    net: net - creditAnterieur,
    prorata: { pourcentage: 100 },
    lignes: [
      {
        compteCollecteId: 'c-443',
        totalCollecte: collecte,
        compteDeductibleId: 'c-445',
        totalDeductible: deductibleAdmise,
      },
    ],
  } as never);
  return { svc, ecrites, traces };
}

const liquider = (svc: TauxTvaService) =>
  svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex1', dateDebut: '2026-01-01', dateFin: '2026-01-31' });

/** Une écriture doit rester équilibrée · c'est le premier contrôle de tous. */
const equilibre = (lignes: { debit?: number; credit?: number }[]) => {
  const d = lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
  const c = lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
  return Math.round((d - c) * 100) / 100;
};

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

describe('report du crédit de TVA · article 63', () => {
  it('le crédit antérieur ÉTEINT la taxe de la période, et seul le solde est dû', async () => {
    // Crédit de 3 000 000 en mars, 5 000 000 de TVA nette en avril : la somme
    // réellement due est 2 000 000. Le logiciel en réclamait 5 000 000, et le
    // crédit restait immobilisé au 4449.
    const { svc, ecrites } = service(5_000_000, 'SYSCOHADA', 3_000_000);
    await liquider(svc);
    const imputation = ecrites[0].find((l) => l.libelle?.includes('Imputation du crédit'));
    expect(imputation?.compteId).toBe('c-44490000');
    expect(imputation?.credit).toBe(3_000_000);
    const due = ecrites[0].find((l) => l.libelle === 'TVA due');
    expect(due?.compteId).toBe('c-44410000');
    expect(due?.credit).toBe(2_000_000);
    expect(equilibre(ecrites[0])).toBe(0);
  });

  it('un crédit plus grand que la taxe du mois s’impute jusqu’à concurrence, le reste demeure reportable', async () => {
    // « imputable sur la taxe exigible du ou des mois suivants JUSQU'À
    // L'ÉPUISEMENT » : on n'impute jamais plus que la taxe du mois.
    const { svc, ecrites, traces } = service(1_000_000, 'SYSCOHADA', 3_000_000);
    await liquider(svc);
    const imputation = ecrites[0].find((l) => l.libelle?.includes('Imputation du crédit'));
    expect(imputation?.credit).toBe(1_000_000);
    expect(ecrites[0].find((l) => l.libelle === 'TVA due')).toBeUndefined();
    expect(equilibre(ecrites[0])).toBe(0);
    // Le marqueur porte le net APRÈS imputation · c'est lui que la
    // déclaration suivante relit pour connaître le crédit encore reportable.
    expect(traces[0].net).toBe(-2_000_000);
  });

  it('une période qui dégage elle-même un crédit l’AJOUTE au report, sans réinscrire l’ancien', async () => {
    // Le 4449 porte déjà le crédit antérieur : le réinscrire le compterait
    // deux fois, et l'écriture ne s'équilibrerait plus. Seul le crédit de la
    // période est porté ; le marqueur, lui, cumule.
    const { svc, ecrites, traces } = service(-2_000_000, 'SYSCOHADA', 3_000_000);
    await liquider(svc);
    const report = ecrites[0].find((l) => l.libelle === 'Crédit de TVA à reporter');
    expect(report?.debit).toBe(2_000_000);
    expect(ecrites[0].some((l) => l.libelle?.includes('Imputation du crédit'))).toBe(false);
    expect(equilibre(ecrites[0])).toBe(0);
    expect(traces[0].net).toBe(-5_000_000);
  });

  it('sans crédit antérieur, l’écriture est celle d’avant · aucune ligne d’imputation parasite', async () => {
    const { svc, ecrites } = service(200, 'SYSCOHADA', 0);
    await liquider(svc);
    expect(ecrites[0].some((l) => l.libelle?.includes('Imputation du crédit'))).toBe(false);
    expect(equilibre(ecrites[0])).toBe(0);
  });
});

/**
 * Harnais de DÉCLARATION · ici la déclaration n'est pas mockée, c'est elle
 * qu'on observe. Ce que le logiciel affichait à l'écran était le net de la
 * seule période demandée, sans jamais consulter le crédit constaté au mois
 * précédent · « TVA NETTE À DÉCAISSER » y était donc plus élevé que la somme
 * réellement due.
 */
function declarant(precedente: { dateDebut: string; dateFin: string; net: number } | null, tvaDuMois: number) {
  const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }),
    },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'l1',
          tauxTvaId: TAUX.id,
          compte: { numero: '44310000' },
          debit: 0,
          credit: tvaDuMois,
          ecriture: { date: new Date('2026-04-15'), lignes: [] },
        },
      ]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        // `dateFin.lt` identifie la recherche du crédit reportable · le verrou
        // de chevauchement, lui, demande un intervalle qui recouvre.
        if (!(where.dateFin as { lt?: Date })?.lt || !precedente) return Promise.resolve(null);
        return Promise.resolve({
          id: 'liq-mars',
          dateDebut: new Date(precedente.dateDebut),
          dateFin: new Date(precedente.dateFin),
          net: precedente.net,
          ecritureId: 'ecr-mars',
        });
      }),
    },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const AVRIL = new Date('2026-04-01');
const FIN_AVRIL = new Date('2026-04-30T23:59:59.999Z');

describe('la DÉCLARATION impute le crédit reporté avant d’annoncer un montant à décaisser', () => {
  it('3 000 000 de crédit en mars, 5 000 000 de taxe en avril · 2 000 000 à payer, pas 5 000 000', async () => {
    const s = declarant({ dateDebut: '2026-03-01', dateFin: '2026-03-31', net: -3_000_000 }, 5_000_000);
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.netAvantImputation).toBe(5_000_000);
    expect(d.creditAnterieur).toBe(3_000_000);
    expect(d.creditImpute).toBe(3_000_000);
    expect(d.net).toBe(2_000_000);
    expect(d.sens).toBe('A_PAYER');
    // Et le chiffre s'explique · sinon personne ne peut le recouper.
    expect(d.mentionExigibilite).toContain('article 63');
    expect(d.creditAnterieurOrigine).toMatchObject({ dateDebut: '2026-03-01', dateFin: '2026-03-31' });
  });

  it('un crédit supérieur à la taxe du mois bascule la déclaration en CRÉDIT, sans le perdre', async () => {
    const s = declarant({ dateDebut: '2026-03-01', dateFin: '2026-03-31', net: -3_000_000 }, 1_000_000);
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.creditImpute).toBe(1_000_000);
    expect(d.net).toBe(-2_000_000);
    expect(d.sens).toBe('CREDIT');
  });

  it('une période précédente DÉBITRICE ne laisse aucun crédit · rien à imputer', async () => {
    const s = declarant({ dateDebut: '2026-03-01', dateFin: '2026-03-31', net: 800_000 }, 5_000_000);
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.creditAnterieur).toBe(0);
    expect(d.net).toBe(5_000_000);
    expect(d.mentionExigibilite).not.toContain('article 63');
  });

  it('sans aucune liquidation antérieure, la déclaration est celle d’avant', async () => {
    const s = declarant(null, 5_000_000);
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.creditAnterieur).toBe(0);
    expect(d.net).toBe(5_000_000);
  });
});
