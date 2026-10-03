import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE COMPTE DE TVA DÉPEND DE L'OPÉRATION, JAMAIS DE SON TAUX.
 *
 * Chaque `TauxTva` porte un compte de collecte et un compte de déduction. Ce
 * n'est qu'une commodité de saisie : elle pré-remplit la contrepartie. Mais la
 * DÉCLARATION agrégeait sur ces deux identifiants exactement, ce qui suppose
 * qu'un taux n'a qu'un compte · faux dès que le plan subdivise, et l'AUDCIF
 * subdivise les deux (Titre VII, COMPTE 44) :
 *
 *   443 TVA facturée   · 4431 ventes · 4432 prestations de services ·
 *                        4433 travaux · 4434 production livrée à soi-même
 *   445 TVA récupérable · 4451 immobilisations · 4452 achats ·
 *                        4453 transport · 4454 services extérieurs
 *
 * Conséquence, et c'est la raison d'être de ce spec : une TVA sur prestation
 * de services correctement imputée en 4432 n'était PAS déclarée, le taux à
 * 16 % pointant sur 4431. Une TVA collectée absente d'une déclaration est un
 * redressement.
 *
 * Ce qui identifie la ligne, c'est le TAUX (`tauxTvaId`, posé à la saisie) et
 * la FAMILLE du compte · deux racines à trois chiffres, justes quel que soit
 * le degré de subdivision du plan, et communes aux deux référentiels puisque
 * le SYCEBNL porte les mêmes 443 et 445, simplement non subdivisés.
 *
 * CE SPEC A CHANGÉ DE FORME, PAS D'OBJET. La déclaration ne peut plus agréger
 * en base : depuis que l'exigibilité suit la NATURE de l'opération (art. 25),
 * deux lignes de la même famille et du même taux peuvent tomber dans deux
 * périodes différentes. Elle lit donc ligne à ligne, et ce qu'on surveille ici
 * reste le même · aucune sélection par l'identifiant de compte porté par le
 * taux, une sélection par les racines 443 et 445.
 *
 * Le régime DÉBITS est retenu ici à dessein : il date TOUTES les natures à
 * l'écriture (biens au fait générateur, services au débit du compte client
 * par l'autorisation de l'art. 26), ce qui isole la question des familles de
 * celle des dates, traitée par `tva-exigibilite.spec.ts`.
 */

interface LigneTva {
  numero: string;
  debit: number;
  credit: number;
  /** Compte de charge de la même écriture, pour l'art. 41. */
  charge?: string;
}

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'Taux normal 16 %',
  taux: 16,
  // Le taux ne pointe QUE sur 4431 et 4452 · c'est le défaut du semis, et
  // c'est précisément ce sur quoi la déclaration ne doit plus s'appuyer.
  compteCollecteId: 'c4431',
  compteDeductibleId: 'c4452',
  estActif: true,
};

function service(lignes: LigneTva[]) {
  const requetesLignes: Record<string, unknown>[] = [];
  const prisma = {
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ regimeExigibiliteTva: 'DEBITS', referentiel: 'SYSCOHADA', dateAutorisationDebitsTva: null }),
    },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    // F25 · la déclaration compte les écritures restées au brouillard ; ce jeu
    // d'essai n'en porte aucune.
    ecriture: { count: jest.fn().mockResolvedValue(0) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        // Le prorata interroge lui aussi `findMany`, sur d'autres critères ·
        // seule la requête de la DÉCLARATION porte les deux racines, et c'est
        // la seule que ce spec observe et sert.
        const compte = where.compte as { OR?: { numero: { startsWith: string } }[] } | undefined;
        if (!compte?.OR) return Promise.resolve([]);
        requetesLignes.push(where);
        const racines = compte.OR.map((c) => c.numero.startsWith);
        return Promise.resolve(
          lignes
            .filter((l) => racines.some((r) => l.numero.startsWith(r)))
            .map((l) => ({
              id: `l-${l.numero}`,
              compteId: `c${l.numero.slice(0, 4)}`,
              tauxTvaId: TAUX.id,
              compte: { numero: l.numero },
              debit: l.debit,
              credit: l.credit,
              ecriture: {
                date: new Date('2026-03-15'),
                lignes: l.charge ? [{ debit: l.debit * 6.25, credit: 0, compte: { numero: l.charge, classe: 'CLASSE_6' } }] : [],
              },
            })),
        );
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    compte: {
      findFirst: jest.fn(({ where }: { where: { numero: string } }) => Promise.resolve({ id: `c${where.numero.slice(0, 4)}`, numero: where.numero })),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od', code: 'OD' }) },
  } as unknown as PrismaService;
  const ecrites: { compteId: string; debit?: number; credit?: number }[][] = [];
  const ecritureService = {
    creer: jest.fn((_t: string, _u: string, dto: { lignes: { compteId: string; debit?: number; credit?: number }[] }) => {
      ecrites.push(dto.lignes);
      return Promise.resolve({ id: 'e1' });
    }),
  } as unknown as EcritureService;
  return { svc: new TauxTvaService(prisma, ecritureService), requetesLignes, ecrites };
}

const DEBUT = new Date('2026-03-01');
const FIN = new Date('2026-03-31');

describe('Déclaration de TVA · sélection par famille de compte', () => {
  it('compte la TVA sur PRESTATIONS (4432), que le taux ne désigne pas', async () => {
    const { svc } = service([
      { numero: '44310000', debit: 0, credit: 100_000 },
      { numero: '44320000', debit: 0, credit: 60_000 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    // 160 000 et non 100 000 · le 4432 entrait sinon dans aucun total.
    expect(d.totalCollecte).toBe(160_000);
  });

  it('compte la TVA récupérable sur SERVICES EXTÉRIEURS (4454) et sur IMMOBILISATIONS (4451)', async () => {
    const { svc } = service([
      { numero: '44520000', debit: 40_000, credit: 0 },
      { numero: '44540000', debit: 25_000, credit: 0 },
      { numero: '44510000', debit: 80_000, credit: 0 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.totalDeductible).toBe(145_000);
  });

  it('ne confond jamais les deux familles · 443 au crédit, 445 au débit', async () => {
    const { svc } = service([
      { numero: '44330000', debit: 0, credit: 90_000 },
      { numero: '44530000', debit: 12_000, credit: 0 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.totalCollecte).toBe(90_000);
    expect(d.totalDeductible).toBe(12_000);
    expect(d.net).toBe(78_000);
    expect(d.sens).toBe('A_PAYER');
  });

  it('n’interroge PLUS la base par l’identifiant du compte porté par le taux', async () => {
    // Le défaut tenait dans un `compteId: t.compteCollecteId`. Aucune requête
    // de la déclaration ne doit filtrer sur un identifiant de compte : elle
    // sélectionne sur les racines 443 et 445, et sur le TAUX de la ligne.
    const { svc, requetesLignes } = service([{ numero: '44310000', debit: 0, credit: 1000 }]);
    await svc.declaration('t1', DEBUT, FIN);
    expect(requetesLignes.length).toBeGreaterThan(0);
    for (const where of requetesLignes) {
      expect(where.compteId).toBeUndefined();
      const compte = where.compte as { OR: { numero: { startsWith: string } }[] };
      expect(compte.OR.map((c) => c.numero.startsWith).sort()).toEqual(['443', '445']);
      expect(where.tauxTvaId).toEqual({ in: [TAUX.id] });
    }
  });

  it('un dossier SYCEBNL, dont le plan ne subdivise pas, est servi par la même règle', async () => {
    // 44310000 et 44510000 sont les deux seules feuilles de son plan · les
    // mêmes racines les captent, sans branche de référentiel.
    const { svc } = service([
      { numero: '44310000', debit: 0, credit: 32_000 },
      { numero: '44510000', debit: 8_000, credit: 0 },
    ]);
    const d = await svc.declaration('t1', DEBUT, FIN);
    expect(d.totalCollecte).toBe(32_000);
    expect(d.totalDeductible).toBe(8_000);
  });

  it('la LIQUIDATION solde chaque compte réellement mouvementé, jamais le compte du taux', async () => {
    // Le taux pointe sur 4431 et 4452 ; la TVA est sur 4432 et 4454. Soldée au
    // compte du taux, la liquidation laissait le 4431 débiteur et le 4432
    // créditeur du même montant, sur une écriture équilibrée.
    const { svc, ecrites } = service([
      { numero: '44320000', debit: 0, credit: 60_000 },
      { numero: '44310000', debit: 0, credit: 100_000 },
      { numero: '44540000', debit: 25_000, credit: 0 },
    ]);
    await svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex1', dateDebut: '2026-03-01', dateFin: '2026-03-31' });
    const solde = (compteId: string) =>
      ecrites[0].filter((l) => l.compteId === compteId).reduce((x, l) => x + (l.debit ?? 0) - (l.credit ?? 0), 0);
    expect(solde('c4432')).toBe(60_000);
    expect(solde('c4431')).toBe(100_000);
    expect(solde('c4454')).toBe(-25_000);
    expect(solde('c4452')).toBe(0);
    expect(solde('c4441')).toBe(-135_000);
  });

  it('la LIQUIDATION ne solde du 445 que la déduction admise · la TVA exclue par l’art. 41 n’y est pas comptée', async () => {
    const { svc, ecrites } = service([
      { numero: '44310000', debit: 0, credit: 100_000 },
      { numero: '44540000', debit: 16_000, credit: 0, charge: '63830000' },
    ]);
    await svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex1', dateDebut: '2026-03-01', dateFin: '2026-03-31' });
    const solde = (compteId: string) =>
      ecrites[0].filter((l) => l.compteId === compteId).reduce((x, l) => x + (l.debit ?? 0) - (l.credit ?? 0), 0);
    expect(solde('c4454')).toBe(0);
    expect(solde('c4441')).toBe(-100_000);
  });
});

