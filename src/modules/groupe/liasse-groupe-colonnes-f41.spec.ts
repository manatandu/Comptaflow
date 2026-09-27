import { BadRequestException } from '@nestjs/common';
import { GroupeService } from './groupe.service';

/**
 * AUDIT FINAL F41 · LA LIASSE DU GROUPE POSTE L'À-NOUVEAU, LES MOUVEMENTS ET
 * LA CLÔTURE CHACUN DANS SA COLONNE.
 *
 * La combinaison reversait la balance agrégée en UNE écriture ordinaire. La
 * balance du dossier de combinaison rangeait donc tout en mouvements · le
 * tableau des flux et les notes de variation lisaient le parc historique comme
 * des acquisitions de l'exercice, et le compte de résultat d'une cellule close
 * lisait des comptes de gestion déjà soldés.
 *
 * Le jeu d'essai déduit la balance des MÊMES lignes que l'élimination, avec la
 * partition de `EcritureService.balance` (clôture, puis report, puis le reste) ·
 * un chiffre posé deux fois à la main pourrait se contredire sans rien dire.
 */

type Colonne = 'report' | 'mouvement' | 'cloture';
interface LigneFixture {
  ecritureId: string;
  tenantId: string;
  exerciceId: string;
  colonne: Colonne;
  compteId: string;
  numero: string;
  debit: number;
  credit: number;
}
interface RattachementFixture {
  compteId: string;
  tenantId: string;
  code: string;
  nom: string;
  celluleGroupeId: string;
}
interface EcritureCreee {
  numeroPiece: number;
  date: Date;
  estGenereeParCloture: boolean;
  estSoldeDesComptesDeGestion: boolean;
  lignes: { create: Array<{ compteId: string; debit: number; credit: number }> };
}

const EX = { id: 'ex-m', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const EX_C1 = { id: 'ex-c1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

interface LigneBalance {
  compteId: string;
  numero: string;
  intitule: string;
  typeCompte: string;
  totalDebit: number;
  totalCredit: number;
  reportDebit: number;
  reportCredit: number;
  clotureDebit: number;
  clotureCredit: number;
}

function balanceDe(lignes: LigneFixture[], tenantId: string, exerciceId: string) {
  const par = new Map<string, LigneBalance>();
  for (const l of lignes) {
    if (l.tenantId !== tenantId || l.exerciceId !== exerciceId) continue;
    const c = par.get(l.compteId) ?? {
      compteId: l.compteId,
      numero: l.numero,
      intitule: l.numero,
      typeCompte: 'DETAIL',
      totalDebit: 0,
      totalCredit: 0,
      reportDebit: 0,
      reportCredit: 0,
      clotureDebit: 0,
      clotureCredit: 0,
    };
    c.totalDebit += l.debit;
    c.totalCredit += l.credit;
    if (l.colonne === 'report') {
      c.reportDebit += l.debit;
      c.reportCredit += l.credit;
    } else if (l.colonne === 'cloture') {
      c.clotureDebit += l.debit;
      c.clotureCredit += l.credit;
    }
    par.set(l.compteId, c);
  }
  const sorties = [...par.values()].map((c) => ({ ...c, solde: c.totalDebit - c.totalCredit }));
  return {
    lignes: sorties,
    totaux: {
      debit: sorties.reduce((t, c) => t + c.totalDebit, 0),
      credit: sorties.reduce((t, c) => t + c.totalCredit, 0),
    },
  };
}

function harnais(
  lignes: LigneFixture[],
  rattachements: RattachementFixture[] = [],
  balanceForcee?: (t: string) => unknown,
  referentiel = 'SYCEBNL',
) {
  const creees: EcritureCreee[] = [];
  const s = new GroupeService(
    {
      exercice: {
        findFirst: async ({ where }: { where: { id?: string; tenantId: string } }) =>
          where.id === 'ex-m' && where.tenantId === 'mere' ? EX : where.tenantId === 't-comb' ? { id: 'ex-comb' } : null,
      },
      tenant: {
        findUnique: async () => ({ id: 'mere', nom: 'Siège', dossierCombinaisonId: 't-comb', referentiel }),
        update: async () => ({}),
        findMany: async ({ where }: { where: { dossierMereId: string } }) =>
          where.dossierMereId === 'mere' ? [{ id: 'c1', nom: 'Antenne', exercices: [EX_C1] }] : [],
      },
      tiersCompte: {
        findMany: async ({ where }: { where: { tiers: { tenantId: { in: string[] } } } }) =>
          rattachements
            .filter((r) => where.tiers.tenantId.in.includes(r.tenantId))
            .map((r) => ({
              compteId: r.compteId,
              tiers: { tenantId: r.tenantId, code: r.code, nom: r.nom, celluleGroupeId: r.celluleGroupeId },
            })),
      },
      ligneEcriture: {
        deleteMany: async () => ({ count: 0 }),
        findMany: async ({
          where,
        }: {
          where: { ecriture: { tenantId: { in: string[] }; exerciceId: { in: string[] }; lignes: { some: { compteId: { in: string[] } } } } };
        }) => {
          const f = where.ecriture;
          const retenues = lignes.filter((l) => f.tenantId.in.includes(l.tenantId) && f.exerciceId.in.includes(l.exerciceId));
          const internes = new Set(retenues.filter((l) => f.lignes.some.compteId.in.includes(l.compteId)).map((l) => l.ecritureId));
          return retenues
            .filter((l) => internes.has(l.ecritureId))
            .map((l) => ({
              ecritureId: l.ecritureId,
              compteId: l.compteId,
              debit: l.debit,
              credit: l.credit,
              ecriture: {
                tenantId: l.tenantId,
                estGenereeParCloture: l.colonne !== 'mouvement',
                estSoldeDesComptesDeGestion: l.colonne === 'cloture',
              },
              compte: { numero: l.numero, intitule: l.numero },
            }));
        },
      },
      ecriture: {
        count: async () => 0,
        deleteMany: async () => ({ count: 0 }),
        aggregate: async () => ({ _max: { numeroPiece: creees.reduce((m, e) => Math.max(m, e.numeroPiece), 0) || null } }),
        create: async ({ data }: { data: EcritureCreee }) => {
          creees.push(data);
          return {};
        },
      },
      compte: {
        createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }),
        findMany: async ({ where }: { where: { numero: { in: string[] } } }) =>
          where.numero.in.map((n) => ({ id: `cpt-${n}`, numero: n })),
      },
      journal: { findFirst: async () => ({ id: 'j-od', numerotation: 'CONTINUE_FICHIER' }) },
    } as never,
    {
      balance: async (tenantId: string, exerciceId: string) =>
        balanceForcee ? balanceForcee(tenantId) : balanceDe(lignes, tenantId, exerciceId),
    } as never,
    undefined as never,
    { liasseCompleteExcel: async () => ({ buffer: Buffer.from('x'), nomFichier: 'liasse.xlsx' }) } as never,
  );
  return { s, creees };
}

const l = (
  ecritureId: string,
  tenantId: string,
  colonne: Colonne,
  numero: string,
  debit: number,
  credit: number,
  compteId = `cpt-${tenantId}-${numero}`,
): LigneFixture => ({
  ecritureId,
  tenantId,
  exerciceId: tenantId === 'mere' ? 'ex-m' : 'ex-c1',
  colonne,
  compteId,
  numero,
  debit,
  credit,
});

/** Les lignes d'une écriture créée, lisibles d'un coup d'œil. */
const lu = (e: EcritureCreee) =>
  e.lignes.create
    .map((x) => `${x.compteId.replace('cpt-', '')} ${x.debit}/${x.credit}`)
    .sort();
const piece = (creees: EcritureCreee[], gpc: boolean, sdcg: boolean) =>
  creees.find((e) => e.estGenereeParCloture === gpc && e.estSoldeDesComptesDeGestion === sdcg);

// Le siège détient un mobilier repris (1 000 000) et en achète pour 200 000 ;
// l'antenne, close, a une caisse de 50 000 à l'ouverture et dépense 30 000.
const PARC_ET_CLOTURE: LigneFixture[] = [
  l('an-m', 'mere', 'report', '24410000', 1_000_000, 0),
  l('an-m', 'mere', 'report', '10300000', 0, 1_000_000),
  l('acq', 'mere', 'mouvement', '24410000', 200_000, 0),
  l('acq', 'mere', 'mouvement', '52110000', 0, 200_000),
  l('an-c', 'c1', 'report', '57100000', 50_000, 0),
  l('an-c', 'c1', 'report', '12000000', 0, 50_000),
  l('dep', 'c1', 'mouvement', '60500000', 30_000, 0),
  l('dep', 'c1', 'mouvement', '57100000', 0, 30_000),
  l('clo', 'c1', 'cloture', '60500000', 0, 30_000),
  l('clo', 'c1', 'cloture', '13100000', 30_000, 0),
];

describe('F41 · trois écritures, chacune avec les drapeaux de celles des dossiers', () => {
  it('le parc repris entre par l’à-nouveau, l’acquisition par les mouvements, le solde des charges par la clôture', async () => {
    const { s, creees } = harnais(PARC_ET_CLOTURE);
    await s.liasseGroupe('mere', 'ex-m', 'u1');
    expect(creees).toHaveLength(3);

    const report = piece(creees, true, false)!;
    expect(report.date).toEqual(EX.dateDebut);
    expect(lu(report)).toEqual(['10300000 0/1000000', '12000000 0/50000', '24410000 1000000/0', '57100000 50000/0']);

    const mouvements = piece(creees, false, false)!;
    expect(lu(mouvements)).toEqual(['24410000 200000/0', '52110000 0/200000', '57100000 0/30000', '60500000 30000/0']);

    const cloture = piece(creees, true, true)!;
    expect(cloture.date).toEqual(EX.dateFin);
    expect(lu(cloture)).toEqual(['13100000 30000/0', '60500000 0/30000']);
  });

  it('la numérotation du fichier se suit sur les trois pièces', async () => {
    const { s, creees } = harnais(PARC_ET_CLOTURE);
    await s.liasseGroupe('mere', 'ex-m', 'u1');
    expect(creees.map((e) => e.numeroPiece)).toEqual([1, 2, 3]);
  });

  it('un groupe sans à-nouveau ni clôture ne pose que ses mouvements', async () => {
    const { s, creees } = harnais(PARC_ET_CLOTURE.filter((x) => x.colonne === 'mouvement'));
    await s.liasseGroupe('mere', 'ex-m', 'u1');
    expect(creees.map((e) => [e.estGenereeParCloture, e.estSoldeDesComptesDeGestion])).toEqual([[false, false]]);
  });
});

// Le siège avait facturé 400 000 à l'antenne l'an dernier, et l'antenne le
// règle dans l'exercice. Créance et dette réciproques figurent aux DEUX
// à-nouveaux, leur règlement aux mouvements.
const RATTACHEMENTS: RattachementFixture[] = [
  { compteId: 'cpt-mere-41110000', tenantId: 'mere', code: 'CLI-ANT', nom: 'Antenne', celluleGroupeId: 'c1' },
  { compteId: 'cpt-c1-40110000', tenantId: 'c1', code: 'FRS-SIE', nom: 'Siège', celluleGroupeId: 'mere' },
];
const CREANCE_REPRISE: LigneFixture[] = [
  l('an-m', 'mere', 'report', '41110000', 400_000, 0),
  l('an-m', 'mere', 'report', '10300000', 0, 400_000),
  l('enc', 'mere', 'mouvement', '52110000', 400_000, 0),
  l('enc', 'mere', 'mouvement', '41110000', 0, 400_000),
  l('an-c', 'c1', 'report', '40110000', 0, 400_000),
  l('an-c', 'c1', 'report', '12000000', 400_000, 0),
  l('reg', 'c1', 'mouvement', '40110000', 400_000, 0),
  l('reg', 'c1', 'mouvement', '57100000', 0, 400_000),
];

describe('F41 · une élimination sort de la colonne d’où vient la ligne', () => {
  it('la créance interne d’ouverture s’élimine dans l’à-nouveau, son règlement dans les mouvements', async () => {
    const { s, creees } = harnais(CREANCE_REPRISE, RATTACHEMENTS);
    await s.liasseGroupe('mere', 'ex-m', 'u1');
    expect(lu(piece(creees, true, false)!)).toEqual(['10300000 0/400000', '12000000 400000/0']);
    expect(lu(piece(creees, false, false)!)).toEqual(['52110000 400000/0', '57100000 0/400000']);
  });

  it('l’agrégat porte les parts de chaque colonne, sans avertissement', async () => {
    const { s } = harnais(CREANCE_REPRISE, RATTACHEMENTS);
    const a = await s.balanceAgregee('mere', 'ex-m');
    expect(a.lignes.find((x) => x.numero === '41110000')).toBeUndefined();
    expect(a.avertissements.some((x) => x.includes("Soldes réciproques d'OUVERTURE"))).toBe(false);
  });
});

// L'antenne avait porté sa dette de clôture sur un autre fournisseur, et la
// reclasse dans l'exercice · le total se confirme, l'ouverture non.
const OUVERTURE_DISCORDANTE: LigneFixture[] = [
  l('an-m', 'mere', 'report', '41110000', 400_000, 0),
  l('an-m', 'mere', 'report', '10300000', 0, 400_000),
  l('an-c', 'c1', 'report', '40119999', 0, 400_000),
  l('an-c', 'c1', 'report', '12000000', 400_000, 0),
  l('recl', 'c1', 'mouvement', '40119999', 400_000, 0),
  l('recl', 'c1', 'mouvement', '40110000', 0, 400_000),
];

describe('F41 · une ouverture qui ne se compense pas est prise sur les mouvements, et dite', () => {
  it('chaque écriture s’équilibre encore, et l’avertissement nomme l’écart', async () => {
    const { s, creees } = harnais(OUVERTURE_DISCORDANTE, RATTACHEMENTS);
    const a = await s.balanceAgregee('mere', 'ex-m');
    expect(a.avertissements.find((x) => x.includes("Soldes réciproques d'OUVERTURE"))).toMatch(/écart 400000\.00/);
    await s.liasseGroupe('mere', 'ex-m', 'u1');
    for (const e of creees) {
      const ecart = e.lignes.create.reduce((t, x) => t + x.debit - x.credit, 0);
      expect(Math.abs(ecart)).toBeLessThan(0.01);
    }
    expect(lu(piece(creees, true, false)!)).toEqual([
      '10300000 0/400000',
      '12000000 400000/0',
      '40119999 0/400000',
      '41110000 400000/0',
    ]);
    expect(lu(piece(creees, false, false)!)).toEqual(['40119999 400000/0', '41110000 0/400000']);
  });
});

describe('F41 · une colonne qui ne s’équilibre pas refuse la liasse avant toute pièce', () => {
  it('à-nouveau déséquilibré dans une balance · rien n’est posé', async () => {
    const bancale = {
      lignes: [
        { compteId: 'x1', numero: '24410000', intitule: 'x', typeCompte: 'DETAIL', totalDebit: 100, totalCredit: 0, reportDebit: 100, reportCredit: 0, clotureDebit: 0, clotureCredit: 0, solde: 100 },
        { compteId: 'x2', numero: '52110000', intitule: 'x', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 100, reportDebit: 0, reportCredit: 0, clotureDebit: 0, clotureCredit: 0, solde: -100 },
      ],
      totaux: { debit: 100, credit: 100 },
    };
    const vide = { lignes: [], totaux: { debit: 0, credit: 0 } };
    const { s, creees } = harnais([], [], (t) => (t === 'mere' ? bancale : vide));
    await expect(s.liasseGroupe('mere', 'ex-m', 'u1')).rejects.toThrow(BadRequestException);
    await expect(s.liasseGroupe('mere', 'ex-m', 'u1')).rejects.toThrow(/Report à-nouveau/);
    expect(creees).toEqual([]);
  });
});

// SYSCOHADA · la liaison siège / succursale (184 à 187) reprise à l'ouverture,
// « égaux et de sens contraire dans les deux comptabilités » (fiche du
// COMPTE 18). Neutralisée, elle sort de l'agrégat · de l'à-nouveau.
const LIAISON_OUVERTURE: LigneFixture[] = [
  l('an-m', 'mere', 'report', '18510001', 500_000, 0),
  l('an-m', 'mere', 'report', '10100000', 0, 500_000),
  l('an-c', 'c1', 'report', '52110000', 500_000, 0),
  l('an-c', 'c1', 'report', '18510000', 0, 500_000),
];

describe('F41 · la liaison siège / établissements sort de l’à-nouveau', () => {
  it('ni à-nouveau ni mouvement sur les 185 de la combinaison', async () => {
    const { s, creees } = harnais(LIAISON_OUVERTURE, [], undefined, 'SYSCOHADA');
    await s.liasseGroupe('mere', 'ex-m', 'u1');
    expect(creees).toHaveLength(1);
    expect(lu(piece(creees, true, false)!)).toEqual(['10100000 0/500000', '52110000 500000/0']);
  });
});
