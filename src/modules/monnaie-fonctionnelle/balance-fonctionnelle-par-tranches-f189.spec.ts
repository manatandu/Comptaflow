import { BalanceFonctionnelleService } from './balance-fonctionnelle.service';
import { PrismaService } from '../../common/prisma.service';
import { LOT_ECRITURES } from '../../common/lecture-par-lots';

/**
 * AUDIT FINAL F189 · LE SECOND JEU LIT L'EXERCICE PAR TRANCHES.
 *
 * La balance en monnaie fonctionnelle chargeait d'un coup toutes les lignes de
 * l'exercice, puis celles de chaque exercice précédent en remontant, pour ne
 * rendre qu'un cumul par compte. Elle lit désormais les écritures par tranches
 * de LOT_ECRITURES, chacune avec toutes ses lignes, et convertit au fil de
 * l'eau.
 *
 * CE QUI COMPTE, C'EST QUE RIEN DU RÉSULTAT NE BOUGE. La balance lue par
 * tranches est confrontée ici à une balance calculée À LA MAIN, sur un jeu de
 * trois tranches · une tranche perdue, lue deux fois ou mal enchaînée change
 * un total.
 *
 * La doublure se comporte comme Prisma · filtres de l'écriture, ordre par
 * identifiant, `take`, curseur et `skip`. Elle sert AUSSI l'ancienne lecture
 * (toutes les lignes d'un bloc) · un retour en arrière rendrait la même
 * balance, et c'est la borne de chaque lecture qui le fait tomber.
 */

const j = (s: string) => new Date(`${s}T00:00:00.000Z`);
const COURS = [
  { date: j('2026-01-01'), cours: 2500 },
  { date: j('2026-06-01'), cours: 2800 },
];

interface LigneStock {
  debit: number;
  credit: number;
  montantDevise: number | null;
  devise: { code: string } | null;
  compte: { id: string; numero: string; intitule: string };
}
interface EcritureStock {
  id: string;
  tenantId: string;
  exerciceId: string;
  date: Date;
  gpc?: boolean;
  sdcg?: boolean;
  lignes: LigneStock[];
}
interface Exercice {
  id: string;
  tenantId: string;
  dateDebut: Date;
  dateFin: Date;
}
type Where = {
  tenantId?: string;
  exerciceId?: string;
  estGenereeParCloture?: boolean;
  estSoldeDesComptesDeGestion?: boolean;
};
type Page = { take?: number; cursor?: { id: string }; skip?: number; orderBy?: { id?: 'asc' | 'desc' } };
type Lecture = Page & { modele: 'ecriture' | 'ligneEcriture'; where: Where; rendues: number; ids: string[] };

const EX26: Exercice = { id: 'ex26', tenantId: 't1', dateDebut: j('2026-01-01'), dateFin: j('2026-12-31') };

const ligne = (numero: string, debit: number, credit: number, usd: number | null = null): LigneStock => ({
  debit,
  credit,
  montantDevise: usd,
  devise: usd === null ? null : { code: 'USD' },
  compte: { id: `c${numero}`, numero, intitule: `Compte ${numero}` },
});

const idDe = (i: number) => `e-${String(i).padStart(5, '0')}`;

/**
 * Trois sortes d'écritures, en rotation · la balance attendue se compte donc
 * à la main.
 *  · i % 3 = 0 · achat de mars, cours 2500 · 250 000 CDF = 100 USD ;
 *  · i % 3 = 1 · vente de juillet, cours 2800 · 280 000 CDF = 100 USD ;
 *  · i % 3 = 2 · encaissement de septembre, cours 2800 · la banque est prise à
 *    son montant d'origine (100 USD), le client converti (285 600 / 2800 =
 *    102 USD) · 2 USD d'écart de conversion par écriture.
 */
function ecritureNo(i: number, exerciceId = 'ex26'): EcritureStock {
  const base = { id: idDe(i), tenantId: 't1', exerciceId };
  if (i % 3 === 0) {
    return { ...base, date: j('2026-03-01'), lignes: [ligne('60100000', 250_000, 0), ligne('40100000', 0, 250_000)] };
  }
  if (i % 3 === 1) {
    return { ...base, date: j('2026-07-01'), lignes: [ligne('52100000', 280_000, 0), ligne('70100000', 0, 280_000)] };
  }
  return {
    ...base,
    date: j('2026-09-15'),
    lignes: [ligne('52100000', 285_600, 0, 100), ligne('41100000', 0, 285_600)],
  };
}

/** Deux tranches pleines et sept écritures de plus · trois lectures. */
const N = 2 * LOT_ECRITURES + 7;

function doublure(stock: EcritureStock[], exercices: Exercice[] = [EX26], cours = COURS) {
  const lectures: Lecture[] = [];
  const retient = (e: EcritureStock, w: Where) =>
    (w.tenantId === undefined || e.tenantId === w.tenantId) &&
    (w.exerciceId === undefined || e.exerciceId === w.exerciceId) &&
    (w.estGenereeParCloture === undefined || (e.gpc ?? false) === w.estGenereeParCloture) &&
    (w.estSoldeDesComptesDeGestion === undefined || (e.sdcg ?? false) === w.estSoldeDesComptesDeGestion);
  const pagine = <T extends { id: string }>(liste: T[], p: Page): T[] => {
    const triee = p.orderBy?.id ? [...liste].sort((a, b) => a.id.localeCompare(b.id)) : liste;
    if (p.orderBy?.id === 'desc') triee.reverse();
    const debut = p.cursor ? triee.findIndex((x) => x.id === p.cursor!.id) + (p.skip ?? 0) : 0;
    return triee.slice(debut, p.take === undefined ? undefined : debut + p.take);
  };
  // La vue « ligne » de l'ancienne lecture · une ligne porte son écriture.
  const vuesLignes = stock.flatMap((e) => e.lignes.map((l, i) => ({ id: `${e.id}-${i}`, e, l })));
  const noter = (modele: Lecture['modele'], where: Where, p: Page, rendues: { id: string }[]) =>
    lectures.push({ modele, where, ...p, rendues: rendues.length, ids: rendues.map((x) => x.id) });

  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ devise: 'CDF', deviseFonctionnelle: 'USD' }) },
    exercice: {
      findFirst: jest.fn(({ where }: { where: { id?: string; tenantId: string; dateFin?: { lt: Date } } }) => {
        const du = exercices.filter((e) => e.tenantId === where.tenantId);
        if (where.id) return Promise.resolve(du.find((e) => e.id === where.id) ?? null);
        const avant = du.filter((e) => e.dateFin.getTime() < where.dateFin!.lt.getTime());
        return Promise.resolve(avant.sort((a, b) => b.dateFin.getTime() - a.dateFin.getTime())[0] ?? null);
      }),
    },
    devise: { findFirst: jest.fn().mockResolvedValue({ id: 'd1', code: 'USD', cours }) },
    ecriture: {
      findMany: jest.fn(async ({ where, ...p }: { where: Where } & Page) => {
        const rendues = pagine(
          stock.filter((e) => retient(e, where)),
          p,
        ).map((e) => ({ id: e.id, date: e.date, lignes: e.lignes }));
        noter('ecriture', where, p, rendues);
        return rendues;
      }),
    },
    ligneEcriture: {
      findMany: jest.fn(async ({ where, ...p }: { where: { ecriture: Where } } & Page) => {
        const rendues = pagine(
          vuesLignes.filter((v) => retient(v.e, where.ecriture)),
          p,
        ).map((v) => ({ id: v.id, ...v.l, ecriture: { id: v.e.id, date: v.e.date } }));
        noter('ligneEcriture', where.ecriture, p, rendues);
        return rendues;
      }),
      findFirst: jest.fn(
        async ({ where }: { where: { ecriture: Where; compte?: { numero: { startsWith: string } } } }) => {
          const v = vuesLignes.find(
            (x) =>
              retient(x.e, where.ecriture) &&
              (!where.compte || x.l.compte.numero.startsWith(where.compte.numero.startsWith)),
          );
          return v ? { id: v.id, compte: v.l.compte } : null;
        },
      ),
    },
  };
  return { svc: new BalanceFonctionnelleService(prisma as unknown as PrismaService), lectures };
}

/** Le stock est rangé à rebours · seul l'ordre demandé par le service le remet d'aplomb. */
const stockDeTroisTranches = () => Array.from({ length: N }, (_, i) => ecritureNo(i)).reverse();

describe('F189 · la balance fonctionnelle lue par tranches', () => {
  it('rend, sur trois tranches, la balance calculée à la main', async () => {
    const { svc } = doublure(stockDeTroisTranches());
    const r = await svc.balance('t1', 'ex26');

    // 1 007 écritures · 336 de mars (i % 3 = 0), 336 de juillet (i % 3 = 1),
    // 335 de septembre (i % 3 = 2).
    //  · 60100000 · 336 × 100 = 33 600 au débit ; 40100000 · 33 600 au crédit ;
    //  · 52100000 · 336 × 100 + 335 × 100 = 67 100 au débit ;
    //  · 70100000 · 336 × 100 = 33 600 au crédit ;
    //  · 41100000 · 335 × 102 = 34 170 au crédit.
    expect(r.lignes.map((l) => [l.numero, l.ouvertureDebit, l.ouvertureCredit, l.debit, l.credit, l.solde])).toEqual([
      ['40100000', 0, 0, 0, 33_600, -33_600],
      ['41100000', 0, 0, 0, 34_170, -34_170],
      ['52100000', 0, 0, 67_100, 0, 67_100],
      ['60100000', 0, 0, 33_600, 0, 33_600],
      ['70100000', 0, 0, 0, 33_600, -33_600],
    ]);
    // Débit 33 600 + 67 100 = 100 700 ; crédit 33 600 + 34 170 + 33 600 =
    // 101 370 ; l'écart, 335 × 2 = 670, reste sur sa ligne, jamais absorbé.
    expect(r.totaux).toEqual({ debit: 100_700, credit: 101_370, ecartDeConversion: -670, dontOuverture: 0 });
    // 2 lignes par écriture, une banque de septembre sur trois prise à son
    // montant d'origine.
    expect(r.origine).toEqual({
      lignes: 2 * N,
      lignesExactes: 335,
      lignesConverties: 2 * N - 335,
      ecritures: N,
      ouverture: 'AUCUNE',
    });
    expect(r.mention).toBe(BalanceFonctionnelleService.MENTION_SANS_VALEUR_LEGALE);
  });

  it('aucune lecture n’est sans borne · les écritures viennent par LOT_ECRITURES, curseur exclu', async () => {
    const { svc, lectures } = doublure(stockDeTroisTranches());
    await svc.balance('t1', 'ex26');

    // Toute collection lue porte sa borne, et n'en rend pas davantage · la
    // lecture d'un bloc de toutes les lignes de l'exercice tomberait ici.
    expect(lectures.length).toBeGreaterThan(0);
    for (const l of lectures) {
      expect(l.take).toBe(LOT_ECRITURES);
      expect(l.rendues).toBeLessThanOrEqual(LOT_ECRITURES);
    }
    const mouvements = lectures.filter((l) => l.modele === 'ecriture' && l.where.estGenereeParCloture === false);
    expect(mouvements).toHaveLength(3);
    expect(mouvements.map((l) => l.rendues)).toEqual([LOT_ECRITURES, LOT_ECRITURES, 7]);
    // Chaque tranche repart APRÈS la dernière écriture de la précédente.
    expect(mouvements[0].cursor).toBeUndefined();
    expect(mouvements[1]).toMatchObject({ cursor: { id: idDe(LOT_ECRITURES - 1) }, skip: 1, orderBy: { id: 'asc' } });
    expect(mouvements[2]).toMatchObject({ cursor: { id: idDe(2 * LOT_ECRITURES - 1) }, skip: 1 });
    // Chaque tranche est bornée au dossier et à l'exercice, par leur valeur.
    for (const l of mouvements) expect(l.where).toMatchObject({ tenantId: 't1', exerciceId: 'ex26' });
    // Aucune écriture lue deux fois, aucune oubliée.
    const lues = mouvements.flatMap((l) => l.ids);
    expect(new Set(lues).size).toBe(N);
  });

  it('le refus rend les dates sans cours de TOUTES les tranches, pas seulement de la première', async () => {
    const stock = Array.from({ length: N }, (_, i) => ecritureNo(i));
    // Une écriture de la première tranche et une de la troisième, datées avant
    // tout cours saisi.
    stock[3] = { ...stock[3], date: j('2025-12-10') };
    stock[2 * LOT_ECRITURES + 5] = { ...stock[2 * LOT_ECRITURES + 5], date: j('2025-12-20') };
    const { svc, lectures } = doublure(stock);

    const refus = svc.balance('t1', 'ex26');
    await expect(refus).rejects.toThrow(/à 2 date\(s\) d'écriture \(2025-12-10, 2025-12-20\)/);
    // L'état s'est arrêté APRÈS la dernière tranche.
    expect(lectures.filter((l) => l.modele === 'ecriture' && l.where.estGenereeParCloture === false)).toHaveLength(3);
  });

  it('le cours se cherche une fois par date, pas une fois par écriture', async () => {
    const espion = jest.spyOn(BalanceFonctionnelleService, 'coursApplicable');
    try {
      const { svc } = doublure(stockDeTroisTranches());
      await svc.balance('t1', 'ex26');
      // Trois dates distinctes pour 1 007 écritures.
      expect(espion).toHaveBeenCalledTimes(3);
    } finally {
      espion.mockRestore();
    }
  });

  it('une écriture sans ligne n’est ni comptée ni datée · comme avant, quand la lecture partait des lignes', async () => {
    const stock = stockDeTroisTranches();
    // Datée avant tout cours · si elle était datée, l'état s'arrêterait.
    stock.push({ id: 'e-vide', tenantId: 't1', exerciceId: 'ex26', date: j('2025-06-01'), lignes: [] });
    const { svc } = doublure(stock);
    const r = await svc.balance('t1', 'ex26');
    expect(r.origine.ecritures).toBe(N);
    expect(r.totaux.ecartDeConversion).toBe(-670);
  });
});

describe('F189 · l’à-nouveau ne se relit que s’il faut le convertir', () => {
  const EX27: Exercice = { id: 'ex27', tenantId: 't1', dateDebut: j('2027-01-01'), dateFin: j('2027-12-31') };
  const COURS_27 = [...COURS, { date: j('2027-01-01'), cours: 3200 }];
  // L'à-nouveau 2027 reprend en francs ce que 2026 a laissé au bilan.
  const aNouveau: EcritureStock = {
    id: 'an-27',
    tenantId: 't1',
    exerciceId: 'ex27',
    date: j('2027-01-01'),
    gpc: true,
    lignes: [ligne('52100000', 3_200_000, 0), ligne('10100000', 0, 3_200_000)],
  };
  const recette: EcritureStock = {
    id: 'rec-27',
    tenantId: 't1',
    exerciceId: 'ex27',
    date: j('2027-03-10'),
    lignes: [ligne('52100000', 320_000, 0), ligne('70100000', 0, 320_000)],
  };

  it('avec un exercice précédent, l’ouverture vient de son jeu, et l’à-nouveau n’est jamais lu en entier', async () => {
    const stock2026 = Array.from({ length: N }, (_, i) => ecritureNo(i));
    const { svc, lectures } = doublure([...stock2026, aNouveau, recette], [EX26, EX27], COURS_27);
    const r = await svc.balance('t1', 'ex27');

    expect(r.origine.ouverture).toBe('EXERCICE_PRECEDENT');
    // L'exercice 2026 a été lu lui aussi par tranches, en entier.
    const lu2026 = lectures.filter((l) => l.modele === 'ecriture' && l.where.exerciceId === 'ex26');
    expect(lu2026.map((l) => l.rendues)).toEqual([LOT_ECRITURES, LOT_ECRITURES, 7]);
    // Aucune lecture des écritures d'à-nouveau · une ligne a suffi à dire
    // qu'il existe.
    expect(lectures.filter((l) => l.where.estGenereeParCloture === true)).toEqual([]);
    // Le 521 ouvre au solde du jeu 2026 (67 100) et reçoit la recette de mars
    // (320 000 / 3200 = 100) · jamais l'à-nouveau converti par-dessus.
    expect(r.lignes.find((l) => l.numero === '52100000')).toMatchObject({ ouvertureDebit: 67_100, debit: 67_200 });
  });

  it('sans exercice précédent (reprise), l’à-nouveau est lu par tranches et converti à sa date', async () => {
    const { svc, lectures } = doublure([aNouveau, recette], [EX27], COURS_27);
    const r = await svc.balance('t1', 'ex27');

    expect(r.origine.ouverture).toBe('CONVERTIE_A_SA_DATE');
    const lu = lectures.filter((l) => l.where.estGenereeParCloture === true);
    expect(lu).toHaveLength(1);
    expect(lu[0]).toMatchObject({ take: LOT_ECRITURES, where: { tenantId: 't1', exerciceId: 'ex27' } });
    // 3 200 000 / 3200 = 1 000 à l'ouverture, 100 en mars.
    expect(r.lignes.find((l) => l.numero === '52100000')).toMatchObject({ ouvertureDebit: 1000, debit: 1100 });
    expect(r.origine).toMatchObject({ lignes: 4, ecritures: 2 });
  });

  it('une reprise CLOSE · la relecture de l’à-nouveau laisse dehors l’écriture qui solde les comptes de gestion', async () => {
    // La clôture de 2027 porte elle aussi `estGenereeParCloture`. Relire
    // l'à-nouveau sur ce seul drapeau la convertirait en OUVERTURE, au cours
    // du 31 décembre · le 701 ouvrirait au débit de la recette de l'année et
    // le 13 recevrait un résultat que personne n'a encore reporté. Le test
    // d'existence (une ligne) et la relecture par tranches doivent porter le
    // même filtre (audit final F189).
    const cloture: EcritureStock = {
      id: 'clo-27',
      tenantId: 't1',
      exerciceId: 'ex27',
      date: j('2027-12-31'),
      gpc: true,
      sdcg: true,
      lignes: [ligne('70100000', 320_000, 0), ligne('13100000', 0, 320_000)],
    };
    const { svc, lectures } = doublure([aNouveau, recette, cloture], [EX27], COURS_27);
    const r = await svc.balance('t1', 'ex27');

    expect(r.origine).toEqual({ lignes: 4, lignesExactes: 0, lignesConverties: 4, ecritures: 2, ouverture: 'CONVERTIE_A_SA_DATE' });
    expect(r.lignes.map((l) => [l.numero, l.ouvertureDebit, l.ouvertureCredit, l.debit, l.credit])).toEqual([
      ['10100000', 0, 1000, 0, 1000],
      ['52100000', 1000, 0, 1100, 0],
      ['70100000', 0, 0, 0, 100],
    ]);
    const lu = lectures.filter((l) => l.where.estGenereeParCloture === true);
    expect(lu).toHaveLength(1);
    expect(lu[0].where).toEqual({
      tenantId: 't1',
      exerciceId: 'ex27',
      estGenereeParCloture: true,
      estSoldeDesComptesDeGestion: false,
    });
  });
});
