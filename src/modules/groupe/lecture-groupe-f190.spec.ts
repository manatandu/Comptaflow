import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { EcritureService } from '../comptabilite/ecriture.service';
import { garderCloisonnement } from '../../common/cloisonnement/extension-cloisonnement';
import { CloisonnementViole, perimetreDeGroupe } from '../../common/cloisonnement/contexte-cloisonnement';
import { dansContexteAudit } from '../../common/audit/contexte-audit';
import { TRANCHE_DOSSIERS, balancesDesDossiers, comptagesDesDossiers } from './lecture-des-dossiers';
import { GroupeService } from './groupe.service';

/**
 * AUDIT FINAL F190 · LE GROUPE SE LIT PAR TRANCHES DE DOSSIERS, ET PLUS PAR
 * UNE BALANCE PAR CELLULE.
 *
 * La balance agrégée et la supervision appelaient `EcritureService.balance`
 * cellule par cellule, en série, et la supervision y ajoutait trois comptages
 * par cellule · de l'ordre de mille cinq cents requêtes à la file pour un
 * groupe fourni. La liasse lançait ensemble deux comptages par dossier, six
 * cents requêtes simultanées pour trois cents cellules.
 *
 * Ce fichier gèle trois choses :
 *  · la balance lue par tranches est CELLE de `EcritureService.balance`,
 *    dossier par dossier, au bit près · confrontée au vrai service, qui tourne
 *    ici sur la même doublure ;
 *  · le nombre de requêtes suit le nombre de TRANCHES, jamais plus de quatre
 *    ne partent ensemble, et aucune n'est faite par cellule ;
 *  · chaque requête passe la VRAIE garde de cloisonnement, sous le périmètre
 *    du siège · une cellule oubliée du périmètre fait lever.
 */

type Statut = 'BROUILLARD' | 'VALIDEE';
interface CompteF {
  id: string;
  tenantId: string;
  numero: string;
  intitule: string;
  classe: string;
  typeCompte: 'DETAIL' | 'TOTAL';
}
interface EcritureF {
  id: string;
  tenantId: string;
  exerciceId: string;
  statut: Statut;
  date: Date;
  estGenereeParCloture: boolean;
  estSoldeDesComptesDeGestion: boolean;
  estANouveauProvisoire: boolean;
}
interface LigneF {
  ecritureId: string;
  compteId: string;
  debit: number;
  credit: number;
}
interface Base {
  comptes: CompteF[];
  ecritures: EcritureF[];
  lignes: LigneF[];
}

type Filtre = Record<string, unknown>;

/**
 * Le filtre tel que Prisma l'applique · une clé indéfinie ne filtre pas,
 * `in`, `equals`, `OR` et `AND` s'appliquent, et tout autre opérateur LÈVE ·
 * une doublure qui ignorerait un filtre validerait une requête que la base
 * n'exécuterait pas ainsi.
 */
function correspond(objet: Record<string, unknown>, filtre: Filtre): boolean {
  return Object.entries(filtre).every(([cle, attendu]) => {
    if (attendu === undefined) return true;
    if (cle === 'OR') return (attendu as Filtre[]).some((branche) => correspond(objet, branche));
    if (cle === 'AND') return ([] as Filtre[]).concat(attendu as Filtre).every((branche) => correspond(objet, branche));
    const valeur = objet[cle];
    if (attendu !== null && typeof attendu === 'object' && !(attendu instanceof Date)) {
      return Object.entries(attendu as Filtre).every(([operateur, x]) => {
        if (operateur === 'in') return (x as unknown[]).includes(valeur);
        if (operateur === 'equals') return valeur === x;
        throw new Error(`doublure · opérateur non simulé « ${operateur} » sur ${cle}`);
      });
    }
    return valeur === attendu;
  });
}

const parNumero = (a: CompteF, b: CompteF) => (a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0);

/**
 * La doublure de la base · chaque appel est journalisé, compté en vol, et
 * passe par `garderCloisonnement` comme en production. Le compteur en vol
 * cède la main une fois avant de répondre · des requêtes lancées ensemble
 * sont donc vues ensemble.
 */
function doublure(base: Base, extra: Record<string, Record<string, (args: never) => unknown>> = {}) {
  const appels: Array<{ nom: string; args: { where?: Filtre; by?: string[] } }> = [];
  const suivi = { enVol: 0, maxEnVol: 0 };
  const ecritureDe = new Map(base.ecritures.map((e) => [e.id, e]));
  const requete =
    (modele: string, operation: string, executer: (args: never) => unknown) =>
    async (args: never) => {
      appels.push({ nom: `${modele}.${operation}`, args });
      suivi.enVol++;
      suivi.maxEnVol = Math.max(suivi.maxEnVol, suivi.enVol);
      try {
        await new Promise((r) => setImmediate(r));
        return await garderCloisonnement({} as never, {
          model: modele,
          operation,
          args,
          query: async (a) => executer(a as never),
        });
      } finally {
        suivi.enVol--;
      }
    };

  const prisma: Record<string, Record<string, (args: never) => Promise<unknown>>> = {
    compte: {
      findMany: requete('Compte', 'findMany', (({ where, orderBy, select }: { where: Filtre; orderBy?: unknown; select?: Record<string, boolean> }) => {
        if (orderBy !== undefined && JSON.stringify(orderBy) !== JSON.stringify({ numero: 'asc' })) {
          throw new Error('doublure · ordre non simulé');
        }
        return base.comptes
          .filter((c) => correspond(c as never, where))
          .sort(parNumero)
          .map((c) => (select ? Object.fromEntries(Object.entries(c).filter(([k]) => select[k])) : { ...c }));
      }) as never),
    },
    ligneEcriture: {
      groupBy: requete('LigneEcriture', 'groupBy', (({ by, where }: { by: string[]; where: { ecriture: Filtre } }) => {
        const { ecriture, ...reste } = where;
        if (JSON.stringify(by) !== JSON.stringify(['compteId']) || Object.keys(reste).length > 0) {
          throw new Error('doublure · regroupement non simulé');
        }
        const sommes = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
        for (const l of base.lignes) {
          if (!correspond(ecritureDe.get(l.ecritureId) as never, ecriture)) continue;
          const s = sommes.get(l.compteId) ?? { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
          sommes.set(l.compteId, { debit: s.debit.add(l.debit), credit: s.credit.add(l.credit) });
        }
        return [...sommes].map(([compteId, _sum]) => ({ compteId, _sum }));
      }) as never),
    },
    ecriture: {
      groupBy: requete('Ecriture', 'groupBy', (({ by, where }: { by: Array<keyof EcritureF>; where: Filtre }) => {
        const groupes = new Map<string, Record<string, unknown> & { _count: { _all: number }; _max: { date: Date | null } }>();
        for (const e of base.ecritures) {
          if (!correspond(e as never, where)) continue;
          const cle = by.map((k) => String(e[k])).join('|');
          const g = groupes.get(cle) ?? {
            ...Object.fromEntries(by.map((k) => [k, e[k]])),
            _count: { _all: 0 },
            _max: { date: null },
          };
          g._count._all++;
          if (!g._max.date || e.date.getTime() > g._max.date.getTime()) g._max.date = e.date;
          groupes.set(cle, g);
        }
        return [...groupes.values()];
      }) as never),
      // Le comptage un par un reste servi · s'il revenait, c'est le compte des
      // appels et des requêtes en vol qui tomberait, pas une fonction absente.
      count: requete('Ecriture', 'count', (({ where }: { where: Filtre }) =>
        base.ecritures.filter((e) => correspond(e as never, where)).length) as never),
    },
  };
  for (const [modele, operations] of Object.entries(extra)) {
    const nomModele = modele.charAt(0).toUpperCase() + modele.slice(1);
    prisma[modele] = {
      ...(prisma[modele] ?? {}),
      ...Object.fromEntries(Object.entries(operations).map(([op, f]) => [op, requete(nomModele, op, f)])),
    };
  }
  return { prisma, appels, suivi };
}

const SIEGE = 'siege';
/** La session du siège, et le périmètre que `dansLeGroupe` déclarerait. */
const commeLeSiege = <T,>(perimetre: string[], suite: () => Promise<T>) =>
  dansContexteAudit({ acteurEmail: 'siege@eglise.cd', tenantId: SIEGE }, () => perimetreDeGroupe([SIEGE, ...perimetre], suite));

// --------------------------------------------------------------------------
// LE JEU D'ESSAI DE L'ÉQUIVALENCE · trois dossiers lus, un quatrième qui ne
// l'est pas. Tout ce qu'une balance écarte y figure : un exercice voisin, un
// compte Total mouvementé, un compte à lignes nulles, un compte sans ligne, un
// compte soldé mais mouvementé, du brouillard, l'à-nouveau et la clôture, et
// des décimales qui ne tombent pas juste en virgule flottante.
// --------------------------------------------------------------------------
const compte = (tenantId: string, numero: string, typeCompte: 'DETAIL' | 'TOTAL' = 'DETAIL'): CompteF => ({
  id: `${tenantId}:${numero}`,
  tenantId,
  numero,
  intitule: `Compte ${numero}`,
  classe: `CLASSE_${numero[0]}`,
  typeCompte,
});
const ecriture = (
  id: string,
  tenantId: string,
  exerciceId: string,
  colonne: 'report' | 'mouvement' | 'cloture',
  date: string,
  statut: Statut = 'VALIDEE',
  estANouveauProvisoire = false,
): EcritureF => ({
  id,
  tenantId,
  exerciceId,
  statut,
  date: new Date(date),
  estGenereeParCloture: colonne !== 'mouvement',
  estSoldeDesComptesDeGestion: colonne === 'cloture',
  estANouveauProvisoire,
});
const ligne = (ecritureId: string, tenantId: string, numero: string, debit: number, credit: number): LigneF => ({
  ecritureId,
  compteId: `${tenantId}:${numero}`,
  debit,
  credit,
});

const BASE: Base = {
  comptes: [
    ...['10110000', '13100000', '41110000', '47100000', '52110000', '58100000', '60100000', '70100000'].map((n) => compte('d-a', n)),
    compte('d-a', '52', 'TOTAL'),
    ...['52110000', '57100000', '65800000'].map((n) => compte('d-b', n)),
    ...['52110000', '70100000'].map((n) => compte('d-c', n)),
    compte('d-x', '52110000'),
  ],
  ecritures: [
    ecriture('a-an', 'd-a', 'a-26', 'report', '2026-01-01'),
    ecriture('a-mv1', 'd-a', 'a-26', 'mouvement', '2026-02-03'),
    ecriture('a-mv2', 'd-a', 'a-26', 'mouvement', '2026-05-05', 'BROUILLARD'),
    ecriture('a-mv3', 'd-a', 'a-26', 'mouvement', '2026-06-06'),
    ecriture('a-nul', 'd-a', 'a-26', 'mouvement', '2026-07-07'),
    ecriture('a-tot', 'd-a', 'a-26', 'mouvement', '2026-08-08'),
    ecriture('a-clo', 'd-a', 'a-26', 'cloture', '2026-12-31'),
    ecriture('a-ancien', 'd-a', 'a-25', 'mouvement', '2025-04-04'),
    ecriture('b-mv', 'd-b', 'b-26', 'mouvement', '2026-03-03'),
    ecriture('b-mv2', 'd-b', 'b-26', 'mouvement', '2026-09-09', 'BROUILLARD'),
    ecriture('c-mv', 'd-c', 'c-25', 'mouvement', '2025-10-10'),
    ecriture('c-mv26', 'd-c', 'c-26', 'mouvement', '2026-10-10'),
    ecriture('x-mv', 'd-x', 'x-26', 'mouvement', '2026-01-15'),
  ],
  lignes: [
    ligne('a-an', 'd-a', '52110000', 1000.1, 0),
    ligne('a-an', 'd-a', '10110000', 0, 1000.1),
    ligne('a-mv1', 'd-a', '60100000', 0.2, 0),
    ligne('a-mv1', 'd-a', '52110000', 0, 0.2),
    ligne('a-mv2', 'd-a', '41110000', 333.33, 0),
    ligne('a-mv2', 'd-a', '70100000', 0, 333.33),
    ligne('a-mv3', 'd-a', '52110000', 333.33, 0),
    ligne('a-mv3', 'd-a', '41110000', 0, 333.33),
    // Des lignes à zéro · le compte n'a pas bougé, il n'est pas une ligne.
    ligne('a-nul', 'd-a', '47100000', 0, 0),
    // Une ligne sur un compte Total · jamais saisissable, et jamais lue.
    ligne('a-tot', 'd-a', '52', 5, 0),
    ligne('a-tot', 'd-a', '70100000', 0, 5),
    ligne('a-clo', 'd-a', '70100000', 338.33, 0),
    ligne('a-clo', 'd-a', '60100000', 0, 0.2),
    ligne('a-clo', 'd-a', '13100000', 0, 338.13),
    ligne('a-ancien', 'd-a', '52110000', 777, 0),
    ligne('a-ancien', 'd-a', '70100000', 0, 777),
    ligne('b-mv', 'd-b', '57100000', 50.05, 0),
    ligne('b-mv', 'd-b', '52110000', 0, 50.05),
    ligne('b-mv2', 'd-b', '65800000', 12.5, 0),
    ligne('b-mv2', 'd-b', '57100000', 0, 12.5),
    ligne('c-mv', 'd-c', '52110000', 10, 0),
    ligne('c-mv', 'd-c', '70100000', 0, 10),
    ligne('c-mv26', 'd-c', '52110000', 99, 0),
    ligne('c-mv26', 'd-c', '70100000', 0, 99),
    ligne('x-mv', 'd-x', '52110000', 42, 0),
  ],
};

// La cellule C est lue sur son exercice PRÉCÉDENT · la borne est le couple,
// pas le dossier.
const COUPLES = [
  { tenantId: 'd-a', exerciceId: 'a-26' },
  { tenantId: 'd-b', exerciceId: 'b-26' },
  { tenantId: 'd-c', exerciceId: 'c-25' },
];
const LUS = COUPLES.map((c) => c.tenantId);

describe('F190 · la balance lue par tranches est celle du service des écritures', () => {
  it('dossier par dossier, au bit près, dans le même ordre', async () => {
    const { prisma } = doublure(BASE);
    const ecritures = new EcritureService(prisma as never, {} as never, {} as never, {} as never);
    await commeLeSiege(LUS, async () => {
      const balances = await balancesDesDossiers(prisma as never, COUPLES);
      expect([...balances.keys()].sort()).toEqual(['d-a', 'd-b', 'd-c']);
      for (const { tenantId, exerciceId } of COUPLES) {
        const attendue = await ecritures.balance(tenantId, exerciceId);
        const lue = balances.get(tenantId)!;
        expect(lue).toEqual(attendue);
        // `toBe` compare au bit · un ordre d'addition différent se verrait ici.
        expect([lue.totaux.debit, lue.totaux.credit]).toEqual([attendue.totaux.debit, attendue.totaux.credit]);
        lue.lignes.forEach((l, i) => expect(l.totalDebit).toBe(attendue.lignes[i].totalDebit));
      }
    });
  });

  it('le jeu d’essai porte bien ce qu’une balance écarte · sinon l’équivalence ne prouverait rien', async () => {
    const { prisma } = doublure(BASE);
    await commeLeSiege(LUS, async () => {
      const a = (await balancesDesDossiers(prisma as never, COUPLES)).get('d-a')!;
      const numeros = a.lignes.map((l) => l.numero);
      // Ni le Total, ni les lignes nulles, ni le compte sans ligne.
      expect(numeros).toEqual(['10110000', '13100000', '41110000', '52110000', '60100000', '70100000']);
      // Le compte soldé mais mouvementé reste, brouillard compris.
      expect(a.lignes.find((l) => l.numero === '41110000')).toMatchObject({ totalDebit: 333.33, totalCredit: 333.33, solde: 0 });
      // Les trois colonnes, et rien de l'exercice voisin.
      expect(a.lignes.find((l) => l.numero === '52110000')).toMatchObject({ reportDebit: 1000.1, mouvementDebit: 333.33, mouvementCredit: 0.2 });
      expect(a.lignes.find((l) => l.numero === '70100000')).toMatchObject({ clotureDebit: 338.33, mouvementCredit: 338.33 });
      // La cellule C, lue sur 2025, ne voit rien de 2026.
      const c = (await balancesDesDossiers(prisma as never, COUPLES)).get('d-c')!;
      expect(c.totaux).toEqual({ debit: 10, credit: 10 });
    });
  });

  it('un dossier sans mouvement rend une balance vide, jamais une absence', async () => {
    const { prisma } = doublure(BASE);
    await commeLeSiege(['d-x'], async () => {
      const balances = await balancesDesDossiers(prisma as never, [{ tenantId: 'd-x', exerciceId: 'x-25' }]);
      expect(balances.get('d-x')).toEqual({ lignes: [], totaux: { debit: 0, credit: 0 } });
    });
  });

  it('un même dossier nommé pour deux exercices lève · ses comptes réuniraient les deux', async () => {
    const { prisma } = doublure(BASE);
    await expect(
      balancesDesDossiers(prisma as never, [
        { tenantId: 'd-a', exerciceId: 'a-26' },
        { tenantId: 'd-a', exerciceId: 'a-25' },
      ]),
    ).rejects.toThrow(/un seul exercice/);
    await expect(
      comptagesDesDossiers(prisma as never, [
        { tenantId: 'd-a', exerciceId: 'a-26' },
        { tenantId: 'd-a', exerciceId: 'a-25' },
      ]),
    ).rejects.toThrow(/un seul exercice/);
  });
});

describe('F190 · les comptages de la supervision et de la liasse', () => {
  const COMPTAGE: Base = {
    comptes: [],
    lignes: [],
    ecritures: [
      ecriture('v', 'd-a', 'a-26', 'mouvement', '2026-03-01'),
      ecriture('b', 'd-a', 'a-26', 'mouvement', '2026-11-30', 'BROUILLARD'),
      ecriture('p', 'd-a', 'a-26', 'report', '2026-01-01', 'BROUILLARD', true),
      // Un autre exercice du même dossier · jamais compté.
      ecriture('ancien', 'd-a', 'a-25', 'mouvement', '2025-12-31', 'BROUILLARD'),
      ecriture('w', 'd-b', 'b-26', 'mouvement', '2026-02-02'),
    ],
  };

  it('écritures, brouillard, à-nouveau provisoire et dernière date, par couple', async () => {
    const { prisma } = doublure(COMPTAGE);
    await commeLeSiege(['d-a', 'd-b', 'd-c'], async () => {
      const c = await comptagesDesDossiers(prisma as never, COUPLES);
      expect(c.get('d-a')).toEqual({
        nbEcritures: 3,
        nbBrouillard: 2,
        nbProvisoiresAuBrouillard: 1,
        derniereEcriture: new Date('2026-11-30'),
      });
      expect(c.get('d-b')).toEqual({ nbEcritures: 1, nbBrouillard: 0, nbProvisoiresAuBrouillard: 0, derniereEcriture: new Date('2026-02-02') });
      // Aucune écriture · des zéros et aucune date, comme un comptage vide.
      expect(c.get('d-c')).toEqual({ nbEcritures: 0, nbBrouillard: 0, nbProvisoiresAuBrouillard: 0, derniereEcriture: null });
    });
  });
});

// --------------------------------------------------------------------------
// UN GROUPE FOURNI · le siège et quarante-cinq cellules, chacune avec une
// écriture dans l'exercice du siège et une autre, plus lourde, dans l'exercice
// précédent, qui ne doit jamais être lue.
// --------------------------------------------------------------------------
const EX_SIEGE = { id: 'ex-siege', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const NOMBRE_CELLULES = 45;
const idCellule = (i: number) => `cel-${String(i).padStart(2, '0')}`;
const CELLULES = Array.from({ length: NOMBRE_CELLULES }, (_, i) => idCellule(i));
const exerciceDe = (t: string) => (t === SIEGE ? EX_SIEGE.id : `ex-${t}`);

function groupeFourni(particularites: { brouillard?: string; provisoire?: string } = {}): Base {
  const base: Base = { comptes: [], ecritures: [], lignes: [] };
  for (const t of [SIEGE, ...CELLULES]) {
    base.comptes.push(compte(t, '52110000'), compte(t, '70100000'));
    base.ecritures.push(ecriture(`${t}-e`, t, exerciceDe(t), 'mouvement', '2026-06-30'));
    base.lignes.push(ligne(`${t}-e`, t, '52110000', 100, 0), ligne(`${t}-e`, t, '70100000', 0, 100));
    base.ecritures.push(ecriture(`${t}-ancien`, t, `ancien-${t}`, 'mouvement', '2025-06-30'));
    base.lignes.push(ligne(`${t}-ancien`, t, '52110000', 999, 0), ligne(`${t}-ancien`, t, '70100000', 0, 999));
  }
  if (particularites.brouillard) {
    const t = particularites.brouillard;
    base.ecritures.push(ecriture(`${t}-b`, t, exerciceDe(t), 'mouvement', '2026-09-15', 'BROUILLARD'));
    base.lignes.push(ligne(`${t}-b`, t, '52110000', 5, 0), ligne(`${t}-b`, t, '70100000', 0, 5));
  }
  if (particularites.provisoire) {
    const t = particularites.provisoire;
    base.ecritures.push(ecriture(`${t}-p`, t, exerciceDe(t), 'report', '2026-01-01', 'BROUILLARD', true));
    base.lignes.push(ligne(`${t}-p`, t, '52110000', 7, 0), ligne(`${t}-p`, t, '70100000', 0, 7));
  }
  return base;
}

function serviceDuGroupe(base: Base) {
  const d = doublure(base, {
    tenant: {
      findUnique: (() => ({
        id: SIEGE,
        nom: 'Siège',
        referentiel: 'SYCEBNL',
        systemeComptableSyscohada: null,
        jeuEtatsFinanciersSycebnl: null,
        dossierCombinaisonId: 't-comb',
      })) as never,
      findMany: (({ where }: { where: { dossierMereId: string } }) =>
        where.dossierMereId === SIEGE
          ? CELLULES.map((t) => ({
              id: t,
              nom: `Cellule ${t}`,
              jeuEtatsFinanciersSycebnl: 'SYSTEME_MINIMAL_TRESORERIE',
              exercices: [
                { id: exerciceDe(t), dateDebut: EX_SIEGE.dateDebut, dateFin: EX_SIEGE.dateFin },
                { id: `ancien-${t}`, dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') },
              ],
            }))
          : []) as never,
      update: (() => ({})) as never,
    },
    exercice: {
      findFirst: (({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === EX_SIEGE.id && where.tenantId === SIEGE ? EX_SIEGE : null) as never,
    },
    tiersCompte: { findMany: (() => []) as never },
  });
  // AUCUNE BALANCE PAR DOSSIER · le service des écritures n'en offre plus au
  // groupe, et un retour au parcours cellule par cellule tomberait ici.
  const s = new GroupeService(d.prisma as never, {} as never, {} as never, {
    liasseCompleteExcel: async () => {
      throw new Error('la liasse ne doit pas être produite sur un groupe qui a du brouillard');
    },
  } as never);
  return { s, ...d };
}

const enSession = <T,>(suite: () => Promise<T>) =>
  dansContexteAudit({ acteurEmail: 'siege@eglise.cd', tenantId: SIEGE }, suite);
const tranches = Math.ceil((NOMBRE_CELLULES + 1) / TRANCHE_DOSSIERS);

describe('F190 · un groupe fourni se lit en quelques requêtes, jamais une par cellule', () => {
  it('la balance agrégée · trois regroupements par tranche, sous la garde, pas plus de quatre en vol', async () => {
    const { s, appels, suivi } = serviceDuGroupe(groupeFourni());
    const a = await enSession(() => s.balanceAgregee(SIEGE, EX_SIEGE.id));

    // Chaque dossier compte ses 100, et rien de son exercice précédent.
    expect(a.totaux).toEqual({ debit: 100 * (NOMBRE_CELLULES + 1), credit: 100 * (NOMBRE_CELLULES + 1) });
    expect(a.dossiers).toHaveLength(NOMBRE_CELLULES + 1);
    expect(a.controles.tousEquilibres).toBe(true);

    const regroupements = appels.filter((x) => x.nom === 'LigneEcriture.groupBy');
    expect(regroupements).toHaveLength(3 * tranches);
    expect(appels.filter((x) => x.nom === 'Compte.findMany')).toHaveLength(tranches);
    // Chaque requête lit une tranche bornée, et toutes ensemble lisent chaque
    // dossier une fois par colonne.
    const couples = regroupements.flatMap((x) => (x.args.where!.ecriture as { OR: Array<{ tenantId: string; exerciceId: string }> }).OR);
    const tailles = regroupements.map((x) => (x.args.where!.ecriture as { OR: unknown[] }).OR.length);
    for (const taille of tailles) expect(taille).toBeLessThanOrEqual(TRANCHE_DOSSIERS);
    // Aucune requête ne lit le groupe entier d'un coup · c'est ce qui borne la
    // mémoire et la taille de chaque requête quand le groupe grandit. La borne
    // ne dépend pas de la constante, qu'une tranche démesurée ne trahirait pas.
    expect(Math.max(...tailles)).toBeLessThan(NOMBRE_CELLULES + 1);
    expect(couples).toHaveLength(3 * (NOMBRE_CELLULES + 1));
    expect(new Set(couples.map((c) => `${c.tenantId}|${c.exerciceId}`)).size).toBe(NOMBRE_CELLULES + 1);
    expect(suivi.maxEnVol).toBeLessThanOrEqual(4);
  });

  it('la supervision · aucune requête par cellule, et les voyants tirés des comptages', async () => {
    const { s, appels, suivi } = serviceDuGroupe(groupeFourni({ brouillard: idCellule(17) }));
    const sup = await enSession(() => s.supervision(SIEGE, EX_SIEGE.id));

    expect(sup.cellules).toHaveLength(NOMBRE_CELLULES);
    const brouillee = sup.cellules.find((c) => c.id === idCellule(17))!;
    expect(brouillee).toMatchObject({ nbEcritures: 2, nbBrouillard: 1, prete: false, derniereEcriture: new Date('2026-09-15') });
    const saine = sup.cellules.find((c) => c.id === idCellule(3))!;
    expect(saine).toMatchObject({ nbEcritures: 1, nbBrouillard: 0, prete: true, tresorerie: 100, equilibre: true });
    expect(saine.derniereEcriture).toEqual(new Date('2026-06-30'));

    expect(appels.some((x) => x.nom === 'Ecriture.count' || x.nom === 'Ecriture.findFirst')).toBe(false);
    expect(appels.filter((x) => x.nom === 'Ecriture.groupBy')).toHaveLength(Math.ceil(NOMBRE_CELLULES / TRANCHE_DOSSIERS));
    // Balances PUIS comptages · jamais plus qu'une seule balance en vol.
    expect(suivi.maxEnVol).toBeLessThanOrEqual(4);
    // Le total des requêtes suit les tranches, pas les cellules.
    expect(appels.length).toBeLessThan(NOMBRE_CELLULES);
  });

  it('la liasse · le brouillard compté par tranche, et l’à-nouveau provisoire nommé', async () => {
    const { s, appels, suivi } = serviceDuGroupe(groupeFourni({ brouillard: idCellule(7), provisoire: idCellule(31) }));
    const refus = await enSession(() => s.liasseGroupe(SIEGE, EX_SIEGE.id, 'u-siege')).catch((e: Error) => e.message);

    expect(refus).toContain(`Cellule ${idCellule(7)} (1 pièce(s))`);
    expect(refus).toContain(`Cellule ${idCellule(31)} (1 pièce(s), dont l'à-nouveau provisoire`);
    expect(appels.some((x) => x.nom === 'Ecriture.count')).toBe(false);
    // Deux comptages par dossier lancés ensemble auraient mis quatre-vingt-dix
    // requêtes en vol.
    expect(suivi.maxEnVol).toBeLessThanOrEqual(4);
  });

  it('un exercice étranger au siège reste refusé avant toute lecture des cellules', async () => {
    const { s, appels } = serviceDuGroupe(groupeFourni());
    await expect(enSession(() => s.balanceAgregee(SIEGE, 'ex-inconnu'))).rejects.toThrow(NotFoundException);
    expect(appels.some((x) => x.nom === 'LigneEcriture.groupBy')).toBe(false);
  });
});

// --------------------------------------------------------------------------
// LA SUPERVISION LIT UNE CELLULE DÉCALÉE SUR L'EXERCICE QUI RECOUVRE LA
// PÉRIODE · c'est ce qu'elle faisait cellule par cellule, et c'est ce que le
// couple de la tranche doit porter. L'exercice précédent de la cellule, qui
// recouvre moins, est rangé EN PREMIER dans sa liste · un couple pris au rang
// et non au choix le lirait, et ses 999 sortiraient à l'écran.
// --------------------------------------------------------------------------
describe('F190 · la supervision lit une cellule décalée sur son exercice recouvrant', () => {
  const EX_AVANT = { id: 'ex-dec-avant', dateDebut: new Date('2025-07-01'), dateFin: new Date('2026-06-30') };
  const EX_DECALE = { id: 'ex-dec', dateDebut: new Date('2026-07-01'), dateFin: new Date('2027-06-30') };
  const base: Base = {
    comptes: ['cel-decalee', 'cel-vide'].flatMap((t) => [compte(t, '52110000'), compte(t, '70100000')]),
    ecritures: [
      ecriture('dec-e', 'cel-decalee', EX_DECALE.id, 'mouvement', '2026-08-01'),
      ecriture('dec-avant', 'cel-decalee', EX_AVANT.id, 'mouvement', '2026-03-01'),
    ],
    lignes: [
      ligne('dec-e', 'cel-decalee', '52110000', 60, 0),
      ligne('dec-e', 'cel-decalee', '70100000', 0, 60),
      ligne('dec-avant', 'cel-decalee', '52110000', 999, 0),
      ligne('dec-avant', 'cel-decalee', '70100000', 0, 999),
    ],
  };

  it('l’activité vient de l’exercice retenu, et une cellule sans exercice ne demande rien', async () => {
    const { prisma, appels } = doublure(base, {
      tenant: {
        findUnique: (() => ({ id: SIEGE, referentiel: 'SYCEBNL', dossierCombinaisonId: null })) as never,
        findMany: (({ where }: { where: { dossierMereId: string } }) =>
          where.dossierMereId === SIEGE
            ? [
                { id: 'cel-decalee', nom: 'Cellule décalée', jeuEtatsFinanciersSycebnl: null, exercices: [EX_AVANT, EX_DECALE] },
                { id: 'cel-vide', nom: 'Cellule vide', jeuEtatsFinanciersSycebnl: null, exercices: [] },
              ]
            : []) as never,
      },
      exercice: {
        findFirst: (({ where }: { where: { id: string; tenantId: string } }) =>
          where.id === EX_SIEGE.id && where.tenantId === SIEGE ? EX_SIEGE : null) as never,
      },
    });
    const s = new GroupeService(prisma as never, {} as never, {} as never, {} as never);
    const sup = await enSession(() => s.supervision(SIEGE, EX_SIEGE.id));

    const decalee = sup.cellules.find((c) => c.id === 'cel-decalee')!;
    expect(decalee).toMatchObject({
      exerciceId: EX_DECALE.id,
      periodeDiscordante: { dateDebut: EX_DECALE.dateDebut, dateFin: EX_DECALE.dateFin },
      nbEcritures: 1,
      nbBrouillard: 0,
      tresorerie: 60,
      equilibre: true,
      prete: false,
      derniereEcriture: new Date('2026-08-01'),
    });
    expect(sup.cellules.find((c) => c.id === 'cel-vide')).toMatchObject({ exerciceId: null, nbEcritures: 0, prete: false });

    // Chaque lecture ne nomme que le couple retenu · ni l'exercice précédent
    // de la cellule décalée, ni la cellule sans exercice.
    const lectures = appels.filter((x) => x.nom === 'LigneEcriture.groupBy' || x.nom === 'Ecriture.groupBy');
    expect(lectures.length).toBeGreaterThan(0);
    for (const x of lectures) {
      const filtre = (x.nom === 'Ecriture.groupBy' ? x.args.where : x.args.where!.ecriture) as { OR: unknown[] };
      expect(filtre.OR).toEqual([{ tenantId: 'cel-decalee', exerciceId: EX_DECALE.id }]);
    }
  });
});

describe('F190 · chaque requête est bornée par la VALEUR de ses dossiers', () => {
  it('passe la garde sous le périmètre du siège, et lève pour une cellule qui n’en est pas', async () => {
    const { prisma } = doublure(BASE);
    await expect(commeLeSiege(LUS, () => balancesDesDossiers(prisma as never, COUPLES))).resolves.toBeDefined();
    await expect(commeLeSiege(LUS, () => comptagesDesDossiers(prisma as never, COUPLES))).resolves.toBeDefined();
    // La cellule B manque au périmètre · la garde refuse la tranche entière.
    await expect(commeLeSiege(['d-a', 'd-c'], () => balancesDesDossiers(prisma as never, COUPLES))).rejects.toBeInstanceOf(
      CloisonnementViole,
    );
    await expect(commeLeSiege(['d-a', 'd-c'], () => comptagesDesDossiers(prisma as never, COUPLES))).rejects.toBeInstanceOf(
      CloisonnementViole,
    );
  });
});
