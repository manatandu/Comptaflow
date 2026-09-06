import { BalanceFonctionnelleService } from './balance-fonctionnelle.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LA BALANCE EN MONNAIE FONCTIONNELLE · ce qui casserait en silence.
 *
 * Le second jeu n'a aucun texte derrière lui · M1 l'a établi, l'AUDCIF ne
 * connaît la devise que pour convertir VERS l'unité légale (art. 36 et
 * suivants, Titre VIII ch. 22), jamais pour en sortir. C'est donc un document
 * de l'éditeur, et c'est précisément pour cela qu'il doit être irréprochable
 * dans sa méthode : personne ne pourra le vérifier contre un texte.
 *
 * TROIS DÉFAUTS, ET AUCUN NE PRODUIT D'ERREUR.
 *
 *  1. LE COURS DE CLÔTURE APPLIQUÉ À TOUT · un bâtiment acheté il y a six ans
 *     se retrouve exprimé au cours d'aujourd'hui, et la balance cesse
 *     d'équilibrer. Le module convertit au cours de la DATE DE L'ÉCRITURE.
 *  2. DEUX COURS DANS UNE MÊME ÉCRITURE · elle se déséquilibre par pure
 *     arithmétique, et la balance entière avec elle. Toutes les lignes d'une
 *     écriture prennent le cours de sa date.
 *  3. UN COURS POSTÉRIEUR APPLIQUÉ À UNE DATE ANTÉRIEURE · l'état devient
 *     rétrospectif au lieu d'historique, avec une information que personne
 *     n'avait au moment de l'opération.
 *
 * Et le refus qui les couvre tous : une date sans cours ARRÊTE l'état.
 */

const j = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('le cours applicable · le dernier connu à la date ou avant', () => {
  const cours = [
    { date: j('2026-01-01'), cours: 2500 },
    { date: j('2026-06-01'), cours: 2800 },
    { date: j('2026-12-01'), cours: 3100 },
  ];

  it('retient le dernier cours antérieur ou égal', () => {
    expect(BalanceFonctionnelleService.coursApplicable(cours, j('2026-06-01'))).toBe(2800);
    expect(BalanceFonctionnelleService.coursApplicable(cours, j('2026-07-15'))).toBe(2800);
    expect(BalanceFonctionnelleService.coursApplicable(cours, j('2026-12-31'))).toBe(3100);
  });

  it('ne prend JAMAIS un cours postérieur · l’état est historique, pas rétrospectif', () => {
    expect(BalanceFonctionnelleService.coursApplicable(cours, j('2025-12-31'))).toBeNull();
    expect(BalanceFonctionnelleService.coursApplicable(cours, j('2026-05-31'))).toBe(2500);
  });

  it('rend null quand aucun cours n’est connu', () => {
    expect(BalanceFonctionnelleService.coursApplicable([], j('2026-06-01'))).toBeNull();
  });
});

describe('la conversion d’une ligne', () => {
  const ligne = (o: Partial<Parameters<typeof BalanceFonctionnelleService.convertirLigne>[0]> = {}) => ({
    debit: 0,
    credit: 0,
    deviseCode: null,
    montantDevise: null,
    ...o,
  });

  it('divise par le cours · le cours dit combien vaut UNE unité en monnaie de tenue', () => {
    const r = BalanceFonctionnelleService.convertirLigne(ligne({ debit: 2_800_000 }), 'USD', 2800);
    expect(r).toEqual({ debit: 1000, credit: 0, exacte: false });
  });

  it('prend le montant d’ORIGINE quand la ligne est déjà dans la monnaie fonctionnelle', () => {
    // 10 000 USD au cours de 2800 valent 28 000 000 CDF. Reconvertir rendrait
    // 10 000 ici, mais 9 999,97 dès que le cours porte des décimales · le
    // montant d'origine est exact par construction.
    const r = BalanceFonctionnelleService.convertirLigne(
      ligne({ debit: 28_000_000, deviseCode: 'USD', montantDevise: 10_000 }),
      'USD',
      2800,
    );
    expect(r).toEqual({ debit: 10_000, credit: 0, exacte: true });
  });

  it('place le montant d’origine du bon côté · c’est le sens en monnaie de tenue qui le dit', () => {
    const r = BalanceFonctionnelleService.convertirLigne(
      ligne({ credit: 28_000_000, deviseCode: 'USD', montantDevise: 10_000 }),
      'USD',
      2800,
    );
    expect(r).toEqual({ debit: 0, credit: 10_000, exacte: true });
  });

  it('convertit une ligne libellée dans une AUTRE devise · seule la fonctionnelle est exacte', () => {
    const r = BalanceFonctionnelleService.convertirLigne(
      ligne({ debit: 2_800_000, deviseCode: 'EUR', montantDevise: 900 }),
      'USD',
      2800,
    );
    expect(r).toEqual({ debit: 1000, credit: 0, exacte: false });
  });
});

describe('la balance du second jeu', () => {
  type Etat = {
    deviseFonctionnelle?: string | null;
    devise?: string | null;
    deviseExiste?: boolean;
    cours?: { date: Date; cours: number }[];
    lignes?: {
      debit: number;
      credit: number;
      montantDevise: number | null;
      devise: { code: string } | null;
      ecriture: { id: string; date: Date };
      compte: { id: string; numero: string; intitule: string };
    }[];
  };

  function service(etat: Etat = {}) {
    const prisma = {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          devise: etat.devise === undefined ? 'CDF' : etat.devise,
          deviseFonctionnelle: etat.deviseFonctionnelle === undefined ? 'USD' : etat.deviseFonctionnelle,
        }),
      },
      exercice: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ex1', dateDebut: j('2026-01-01'), dateFin: j('2026-12-31') }),
      },
      devise: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            etat.deviseExiste === false ? null : { id: 'd1', code: 'USD', cours: etat.cours ?? [{ date: j('2026-01-01'), cours: 2500 }] },
          ),
      },
      ligneEcriture: { findMany: jest.fn().mockResolvedValue(etat.lignes ?? []) },
    } as unknown as PrismaService;
    return new BalanceFonctionnelleService(prisma);
  }

  const ligne = (
    numero: string,
    debit: number,
    credit: number,
    ecritureId = 'e1',
    date = j('2026-03-01'),
    devise: { code: string } | null = null,
    montantDevise: number | null = null,
  ) => ({
    debit,
    credit,
    montantDevise,
    devise,
    ecriture: { id: ecritureId, date },
    compte: { id: `c${numero}`, numero, intitule: `Compte ${numero}` },
  });

  it('refuse quand aucune monnaie fonctionnelle n’est nommée', async () => {
    await expect(service({ deviseFonctionnelle: null }).balance('t1', 'ex1')).rejects.toThrow(
      /Aucune monnaie fonctionnelle/,
    );
  });

  it('refuse quand elle est déjà la monnaie de tenue · rien à convertir', async () => {
    await expect(service({ deviseFonctionnelle: 'CDF' }).balance('t1', 'ex1')).rejects.toThrow(/déjà sa monnaie de tenue/);
  });

  it('refuse quand la devise n’existe pas au plan des devises', async () => {
    await expect(service({ deviseExiste: false }).balance('t1', 'ex1')).rejects.toThrow(/plan des devises/);
  });

  it('ARRÊTE l’état sur une date sans cours plutôt que d’inventer', async () => {
    const svc = service({
      cours: [{ date: j('2026-06-01'), cours: 2800 }],
      lignes: [ligne('60100000', 2_800_000, 0, 'e1', j('2026-03-01'))],
    });
    await expect(svc.balance('t1', 'ex1')).rejects.toThrow(/2026-03-01/);
    await expect(svc.balance('t1', 'ex1')).rejects.toThrow(/plausible et fausse/);
  });

  it('convertit chaque écriture au cours de SA date, et l’équilibre est conservé', async () => {
    const r = await service({
      cours: [
        { date: j('2026-01-01'), cours: 2500 },
        { date: j('2026-06-01'), cours: 2800 },
      ],
      lignes: [
        // Une écriture de mars, au cours de 2500.
        ligne('60100000', 2_500_000, 0, 'e1', j('2026-03-01')),
        ligne('40100000', 0, 2_500_000, 'e1', j('2026-03-01')),
        // Une écriture de juillet, au cours de 2800.
        ligne('60100000', 2_800_000, 0, 'e2', j('2026-07-01')),
        ligne('40100000', 0, 2_800_000, 'e2', j('2026-07-01')),
      ],
    }).balance('t1', 'ex1');
    expect(r.totaux.debit).toBe(2000);
    expect(r.totaux.credit).toBe(2000);
    // AUCUN ÉCART · toutes les lignes d'une écriture ont pris le même cours.
    expect(r.totaux.ecartDeConversion).toBe(0);
    expect(r.lignes.find((l) => l.numero === '60100000')?.debit).toBe(2000);
  });

  it('MONTRE l’écart de conversion, jamais absorbé dans un compte', async () => {
    // Une écriture qui mêle une ligne prise à son montant d'origine (1 000 USD
    // exactement) et une ligne convertie à un cours qui ne retombe pas dessus.
    const r = await service({
      cours: [{ date: j('2026-01-01'), cours: 2500 }],
      lignes: [
        ligne('52100000', 2_600_000, 0, 'e1', j('2026-03-01'), { code: 'USD' }, 1_000),
        ligne('41100000', 0, 2_600_000, 'e1', j('2026-03-01')),
      ],
    }).balance('t1', 'ex1');
    expect(r.totaux.debit).toBe(1000);
    expect(r.totaux.credit).toBe(1040);
    expect(r.totaux.ecartDeConversion).toBe(-40);
    // Aucune ligne de bouclage n'a été créée · l'écart vit dans les totaux.
    expect(r.lignes.map((l) => l.numero)).toEqual(['41100000', '52100000']);
  });

  it('compte les lignes prises à leur montant d’origine', async () => {
    const r = await service({
      cours: [{ date: j('2026-01-01'), cours: 2500 }],
      lignes: [
        ligne('52100000', 2_500_000, 0, 'e1', j('2026-03-01'), { code: 'USD' }, 1_000),
        ligne('41100000', 0, 2_500_000, 'e1', j('2026-03-01')),
      ],
    }).balance('t1', 'ex1');
    expect(r.origine).toEqual({ lignes: 2, lignesExactes: 1, lignesConverties: 1, ecritures: 1 });
  });

  it('porte la mention qui dit ce que l’état n’est pas', async () => {
    const r = await service({ lignes: [] }).balance('t1', 'ex1');
    expect(r.mention).toContain('SANS VALEUR LÉGALE');
    expect(r.mention).toContain('CDF');
    expect(r.mention).toContain('Aucun texte lu ne régit ce second jeu');
    expect(r.monnaie).toBe('USD');
  });
});
