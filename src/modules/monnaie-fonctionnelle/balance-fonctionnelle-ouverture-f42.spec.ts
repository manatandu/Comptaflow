import { BalanceFonctionnelleService } from './balance-fonctionnelle.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F42 · LE SECOND JEU NE CONVERTIT PLUS L'À-NOUVEAU NI LA CLÔTURE.
 *
 * L'à-nouveau était converti au cours du premier jour de l'exercice · un bien
 * acquis l'an dernier entrait au cours du 1er janvier, contre l'en-tête qui
 * annonce « chaque écriture au cours de SA date ». Et l'écriture qui solde les
 * comptes de gestion, convertie au cours du 31 décembre, laissait un reliquat
 * sur des charges converties chacune à sa date. L'ouverture est désormais la
 * clôture du MÊME jeu pour l'exercice précédent.
 *
 * La doublure honore les filtres · exercice, drapeaux de clôture, borne de
 * date de l'exercice précédent, racine 13 du compte de résultat. Elle sert les
 * ÉCRITURES par tranches, comme Prisma · ordre par identifiant, `take`,
 * curseur et `skip` (audit final F189).
 */

const j = (s: string) => new Date(`${s}T00:00:00.000Z`);
const EX26 = { id: 'ex26', tenantId: 't1', dateDebut: j('2026-01-01'), dateFin: j('2026-12-31') };
const EX27 = { id: 'ex27', tenantId: 't1', dateDebut: j('2027-01-01'), dateFin: j('2027-12-31') };
const COURS = [
  { date: j('2026-01-01'), cours: 2500 },
  { date: j('2026-06-01'), cours: 2800 },
  { date: j('2026-12-01'), cours: 3100 },
  { date: j('2027-01-01'), cours: 3200 },
];

interface Ligne {
  exerciceId: string;
  ecritureId: string;
  date: Date;
  gpc?: boolean;
  sdcg?: boolean;
  numero: string;
  debit: number;
  credit: number;
}
const l = (exerciceId: string, ecritureId: string, date: string, numero: string, debit: number, credit: number, drapeaux: { gpc?: boolean; sdcg?: boolean } = {}): Ligne => ({
  exerciceId,
  ecritureId,
  date: j(date),
  numero,
  debit,
  credit,
  ...drapeaux,
});

function service(lignes: Ligne[], exercices = [EX26, EX27]) {
  const vue = (x: Ligne) => ({
    debit: x.debit,
    credit: x.credit,
    montantDevise: null,
    devise: null,
    ecriture: { id: x.ecritureId, date: x.date },
    compte: { id: `c${x.numero}`, numero: x.numero, intitule: `Compte ${x.numero}` },
  });
  type Filtre = { ecriture: { exerciceId: string; estGenereeParCloture?: boolean; estSoldeDesComptesDeGestion?: boolean }; compte?: { numero: { startsWith: string } } };
  const retient = (x: Ligne, w: Filtre) =>
    x.exerciceId === w.ecriture.exerciceId &&
    (w.ecriture.estGenereeParCloture === undefined || (x.gpc ?? false) === w.ecriture.estGenereeParCloture) &&
    (w.ecriture.estSoldeDesComptesDeGestion === undefined || (x.sdcg ?? false) === w.ecriture.estSoldeDesComptesDeGestion) &&
    (!w.compte || x.numero.startsWith(w.compte.numero.startsWith));
  // Les lignes se regroupent en écritures, drapeaux compris · le service lit
  // les écritures par tranches, chacune avec toutes ses lignes.
  type LigneLue = Omit<ReturnType<typeof vue>, 'ecriture'>;
  const parEcriture = new Map<string, { id: string; date: Date; premiere: Ligne; lignes: LigneLue[] }>();
  for (const x of lignes) {
    const e = parEcriture.get(x.ecritureId) ?? { id: x.ecritureId, date: x.date, premiere: x, lignes: [] };
    const { debit, credit, montantDevise, devise, compte } = vue(x);
    e.lignes.push({ debit, credit, montantDevise, devise, compte });
    parEcriture.set(x.ecritureId, e);
  }
  const ecritures = [...parEcriture.values()].sort((a, b) => a.id.localeCompare(b.id));
  type Page = { take?: number; cursor?: { id: string }; skip?: number };
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
    devise: { findFirst: jest.fn().mockResolvedValue({ id: 'd1', code: 'USD', cours: COURS }) },
    ecriture: {
      findMany: jest.fn(({ where, take, cursor, skip }: { where: Filtre['ecriture'] } & Page) => {
        const retenues = ecritures.filter((e) => retient(e.premiere, { ecriture: where }));
        const debut = cursor ? retenues.findIndex((e) => e.id === cursor.id) + (skip ?? 0) : 0;
        return Promise.resolve(
          retenues
            .slice(debut, take === undefined ? undefined : debut + take)
            .map((e) => ({ id: e.id, date: e.date, lignes: e.lignes })),
        );
      }),
    },
    ligneEcriture: {
      findFirst: jest.fn(({ where }: { where: Filtre }) => {
        const x = lignes.find((y) => retient(y, where));
        return Promise.resolve(x ? vue(x) : null);
      }),
    },
  };
  return new BalanceFonctionnelleService(prisma as unknown as PrismaService);
}

// 2026 · un bien acheté en mars (cours 2500), une charge de juillet (2800), un
// produit de décembre (3100), puis la clôture qui solde les deux sur le 1310.
// 2027 · l'à-nouveau en francs, puis une recette de mars (3200).
const DEUX_EXERCICES: Ligne[] = [
  l('ex26', 'acq', '2026-03-10', '24410000', 2_500_000, 0),
  l('ex26', 'acq', '2026-03-10', '52100000', 0, 2_500_000),
  l('ex26', 'chg', '2026-07-10', '60100000', 2_800_000, 0),
  l('ex26', 'chg', '2026-07-10', '52100000', 0, 2_800_000),
  l('ex26', 'pdt', '2026-12-10', '52100000', 6_200_000, 0),
  l('ex26', 'pdt', '2026-12-10', '70100000', 0, 6_200_000),
  l('ex26', 'clo', '2026-12-31', '60100000', 0, 2_800_000, { gpc: true, sdcg: true }),
  l('ex26', 'clo', '2026-12-31', '70100000', 6_200_000, 0, { gpc: true, sdcg: true }),
  l('ex26', 'clo', '2026-12-31', '13100000', 0, 3_400_000, { gpc: true, sdcg: true }),
  l('ex27', 'an', '2027-01-01', '24410000', 2_500_000, 0, { gpc: true }),
  l('ex27', 'an', '2027-01-01', '52100000', 900_000, 0, { gpc: true }),
  l('ex27', 'an', '2027-01-01', '13100000', 0, 3_400_000, { gpc: true }),
  l('ex27', 'rec', '2027-03-10', '52100000', 3_200_000, 0),
  l('ex27', 'rec', '2027-03-10', '70100000', 0, 3_200_000),
];

const parNumero = (r: Awaited<ReturnType<BalanceFonctionnelleService['balance']>>) =>
  Object.fromEntries(r.lignes.map((x) => [x.numero, [x.debit, x.credit, x.solde]]));

describe('F42 · l’ouverture est la clôture du même jeu pour l’exercice précédent', () => {
  it('le bien acquis l’an dernier garde son cours de mars, le résultat converti va au 1310', async () => {
    const r = await service(DEUX_EXERCICES).balance('t1', 'ex27');
    expect(r.origine.ouverture).toBe('EXERCICE_PRECEDENT');
    // 2 500 000 / 2500 = 1 000, et non / 3200 = 781,25 au cours du 1er janvier.
    // Le 521 : -1 000 -1 000 +2 000 = 0 à l'ouverture, puis 1 000 en mars.
    // Le résultat 2026 : 2 000 de produit moins 1 000 de charge.
    expect(parNumero(r)).toEqual({
      '13100000': [0, 1000, -1000],
      '24410000': [1000, 0, 1000],
      '52100000': [1000, 0, 1000],
      '70100000': [0, 1000, -1000],
    });
    expect(r.totaux).toEqual({ debit: 2000, credit: 2000, ecartDeConversion: 0, dontOuverture: 0 });
    expect(r.lignes.find((x) => x.numero === '24410000')).toMatchObject({ ouvertureDebit: 1000 });
    expect(r.lignes.find((x) => x.numero === '70100000')).toMatchObject({ ouvertureDebit: 0, ouvertureCredit: 0 });
    // Seuls les mouvements de 2027 sont comptés comme lignes converties.
    expect(r.origine).toMatchObject({ lignes: 2, ecritures: 1 });
  });

  it('un exercice clos s’arrête avant sa clôture · aucun reliquat sur les comptes de gestion', async () => {
    const r = await service(DEUX_EXERCICES).balance('t1', 'ex26');
    const lu = parNumero(r);
    expect(lu['60100000']).toEqual([1000, 0, 1000]);
    expect(lu['70100000']).toEqual([0, 2000, -2000]);
    expect(lu['13100000']).toBeUndefined();
    expect(r.totaux.ecartDeConversion).toBe(0);
    expect(r.origine.ouverture).toBe('AUCUNE');
  });

  it('sans exercice précédent (reprise), l’à-nouveau est converti au cours de sa date, et c’est dit', async () => {
    const r = await service(
      DEUX_EXERCICES.filter((x) => x.exerciceId === 'ex27'),
      [EX27],
    ).balance('t1', 'ex27');
    expect(r.origine.ouverture).toBe('CONVERTIE_A_SA_DATE');
    expect(parNumero(r)['24410000']).toEqual([781.25, 0, 781.25]);
    // Porté en OUVERTURE, pas en mouvement de l'exercice.
    expect(r.lignes.find((x) => x.numero === '24410000')).toMatchObject({ ouvertureDebit: 781.25, ouvertureCredit: 0 });
  });

  it('exercice précédent non clôturé · le résultat reste sur sa propre ligne, jamais sur un 13 inventé', async () => {
    const r = await service(DEUX_EXERCICES.filter((x) => !x.sdcg)).balance('t1', 'ex27');
    const resultat = r.lignes.find((x) => x.compteId === 'resultat-ex26')!;
    expect(resultat).toMatchObject({ numero: '13', credit: 1000 });
    expect(r.lignes.find((x) => x.numero === '13100000')).toBeUndefined();
  });

  it('la clôture de l’exercice lu n’est ni convertie ni comptée parmi les écritures', async () => {
    const r = await service(DEUX_EXERCICES).balance('t1', 'ex26');
    expect(r.origine.ecritures).toBe(3);
  });
});
