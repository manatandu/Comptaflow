import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { Prisma, RoleUtilisateur } from '@prisma/client';
import { IfrsService } from './ifrs.service';
import { IfrsController } from './ifrs.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';

/**
 * Le câblage des états IFRS · la balance légale arrive au moteur par la même
 * lecture que les états légaux, les règles et retraitements sont refusés à la
 * porte par les mêmes règles que le moteur, et AUCUN état légal ne lit les
 * tables IFRS (`docs/decision-multi-classification.md` § 4).
 */
const T = 'dossier-1';
const EX = 'ex-2026';
const EX1 = 'ex-2025';
const EX2 = 'ex-2024';

type LigneDoublure = [string, number] | [string, number, number, number];

function doublure(avecPrecedent = false, avecAvantPrecedent = false, balancesPropres: Record<string, LigneDoublure[]> = {}) {
  const tables: Record<string, any[]> = { regles: [], retraitements: [], parametres: [], mouvements: [] };
  // La doublure HONORE la borne `dateFin < …` · une doublure qui rendrait
  // toujours le même exercice ferait passer la recherche du précédent pour
  // juste quelle que soit la date qu'elle cherche.
  const exercices = [
    { id: EX, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') },
    ...(avecPrecedent ? [{ id: EX1, dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') }] : []),
    ...(avecAvantPrecedent ? [{ id: EX2, dateDebut: new Date('2024-01-01'), dateFin: new Date('2024-12-31') }] : []),
  ];
  let seq = 0;
  const prisma: any = {
    exercice: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id) return (where.tenantId === T && exercices.find((e) => e.id === where.id)) || null;
        const avant = exercices.filter((e) => e.dateFin < where.dateFin.lt).sort((a, b) => b.dateFin.getTime() - a.dateFin.getTime());
        return avant[0] ?? null;
      }),
    },
    parametresIfrs: {
      findUnique: jest.fn(async () => tables.parametres[0] ?? null),
      upsert: jest.fn(async ({ create, update }: any) => {
        tables.parametres[0] = tables.parametres[0] ? { ...tables.parametres[0], ...update } : create;
        return tables.parametres[0];
      }),
    },
    regleCorrespondanceIfrs: {
      findMany: jest.fn(async () => tables.regles),
      findFirst: jest.fn(async ({ where }: any) => tables.regles.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        if (tables.regles.some((r) => r.prefixe === data.prefixe)) {
          throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
        }
        const r = { id: `r-${++seq}`, ...data };
        tables.regles.push(r);
        return r;
      }),
      delete: jest.fn(async ({ where }: any) => (tables.regles = tables.regles.filter((r) => r.id !== where.id))),
    },
    mouvementCapitauxPropresIfrs: {
      findMany: jest.fn(async ({ where }: any) => tables.mouvements.filter((m) => m.exerciceId === where.exerciceId && m.tenantId === where.tenantId)),
      findFirst: jest.fn(async ({ where }: any) => tables.mouvements.find((m) => m.id === where.id && m.tenantId === where.tenantId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const m = { id: `m-${++seq}`, createdAt: new Date(), ...data, montant: new Prisma.Decimal(data.montant) };
        tables.mouvements.push(m);
        return m;
      }),
      delete: jest.fn(async ({ where }: any) => (tables.mouvements = tables.mouvements.filter((m) => m.id !== where.id))),
    },
    retraitementIfrs: {
      // La doublure HONORE `aLaTransition` · sans quoi un ajustement de
      // transition paraîtrait bien écarté des retraitements de l'exercice
      // quel que soit le filtre que le service pose.
      findMany: jest.fn(async ({ where }: any) =>
        tables.retraitements.filter((r) => r.exerciceId === where.exerciceId && (r.aLaTransition ?? false) === (where.aLaTransition ?? false)),
      ),
      findFirst: jest.fn(async ({ where }: any) => tables.retraitements.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const r = { id: `t-${++seq}`, createdAt: new Date(), ...data, lignes: data.lignes.create.map((l: any) => ({ ...l, montant: new Prisma.Decimal(l.montant) })) };
        tables.retraitements.push(r);
        return r;
      }),
      delete: jest.fn(async ({ where }: any) => (tables.retraitements = tables.retraitements.filter((r) => r.id !== where.id))),
    },
  };
  const balances: Record<string, LigneDoublure[]> = {
    [EX]: [['24100000', 1000], ['10100000', -800], ['70100000', -500], ['60100000', 300]],
    [EX1]: [['24100000', 900], ['10100000', -800], ['70100000', -400], ['60100000', 300]],
    [EX2]: [['24100000', 800], ['10100000', -800]],
    ...balancesPropres,
  };
  const ecritures: any = {
    balance: jest.fn(async (_t: string, ex: string, brouillard: boolean) => {
      expect(brouillard).toBe(false);
      return {
        lignes: balances[ex].map(([numero, solde, reportDebit = 0, reportCredit = 0]) => ({
          numero,
          intitule: numero,
          classe: `CLASSE_${numero[0]}`,
          typeCompte: 'DETAIL',
          solde,
          totalDebit: Math.max(solde, 0),
          totalCredit: Math.max(-solde, 0),
          reportDebit,
          reportCredit,
        })),
      };
    }),
  };
  // Le VRAI service des états SYSCOHADA · c'est sa correspondance du bilan qui
  // donne les capitaux propres publiés, et une doublure ferait passer un
  // signe inversé pour juste.
  const syscohada = new EtatsFinanciersSyscohadaService(ecritures, {} as any);
  return { prisma, tables, ecritures, service: new IfrsService(prisma, ecritures, syscohada) };
}

const REGLES = [
  { prefixe: '24', rubrique: 'SF_IMMOBILISATIONS_CORPORELLES' },
  { prefixe: '10', rubrique: 'SF_CAPITAL' },
  { prefixe: '70', rubrique: 'PL_PRODUITS' },
  { prefixe: '60', rubrique: 'PL_ACHATS_CONSOMMES' },
];

describe('IfrsService · de la balance légale aux états IFRS', () => {
  it('le livre-journal seul, les règles déclarées, un retraitement déclaré · résultat 200 → 150', async () => {
    const { service } = doublure();
    for (const r of REGLES) await service.ajouterRegle(T, r);
    await service.declarerActivite(T, { activitePrincipale: 'AUCUNE' });
    await service.ajouterRetraitement(T, {
      exerciceId: EX,
      libelle: 'Dépréciation',
      fondement: 'IAS 36 § 59',
      lignes: [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 50 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -50 }],
    });
    const e = await service.etat(T, EX);
    expect(e.n.rapprochements).toMatchObject({ resultatSyscohada: 200, retraitementsResultat: -50, resultatIfrs: 150 });
    expect(e.n.controles.every((c) => c.ok)).toBe(true);
    expect(e.activitePrincipale).toBe('AUCUNE');
    expect(e.n1).toBeNull();
    expect(e.motifN1).toMatch(/Aucun exercice précédent/);
  });

  it('le comparatif est un second calcul sur l’exercice précédent, avec les mêmes règles', async () => {
    const { service } = doublure(true);
    for (const r of REGLES) await service.ajouterRegle(T, r);
    const e = await service.etat(T, EX);
    // N-1 · 400 − 300 = 100, sans retraitement.
    expect(e.n1!.rapprochements.resultatIfrs).toBe(100);
  });

  it('refus à la porte · règle hors classe ou vers le mauvais état, doublon, retraitement déséquilibré ou sans fondement', async () => {
    const { service, tables } = doublure();
    await expect(service.ajouterRegle(T, { prefixe: '60', rubrique: 'SF_STOCKS' })).rejects.toThrow(/compte de gestion/);
    await service.ajouterRegle(T, REGLES[0]);
    await expect(service.ajouterRegle(T, { prefixe: ' 24 ', rubrique: 'SF_GOODWILL' })).rejects.toThrow(/existe déjà pour le préfixe 24/);
    const l = [{ rubrique: 'SF_STOCKS', montant: 10 }, { rubrique: 'SF_RESERVES', montant: -5 }];
    await expect(service.ajouterRetraitement(T, { exerciceId: EX, libelle: 'x', fondement: 'IAS 2', lignes: l })).rejects.toThrow(/déséquilibré/);
    await expect(service.ajouterRetraitement(T, { exerciceId: EX, libelle: 'x', fondement: '', lignes: l })).rejects.toThrow(/sans fondement/);
    await expect(service.ajouterRetraitement(T, { exerciceId: 'autre', libelle: 'x', fondement: 'IAS 2', lignes: l })).rejects.toThrow(/introuvable/);
    expect(tables.retraitements).toHaveLength(0);
    expect(tables.regles).toHaveLength(1);
  });
});

describe('IfrsService · variation des capitaux propres sur trois exercices', () => {
  // 2024 · capital 800. 2025 · capital 800, résultat 100. 2026 · capital 800,
  // résultat 200, et le résultat de 2025 ne se retrouve plus nulle part · il a
  // été distribué, ce que seule une déclaration peut dire.
  it('deux blocs, N et N-1 ; l’écart non déclaré est nommé, la distribution déclarée l’explique', async () => {
    const { service, tables } = doublure(true, true);
    for (const r of REGLES) await service.ajouterRegle(T, r);
    await service.declarerActivite(T, { activitePrincipale: 'AUCUNE' });
    let e = await service.etat(T, EX);
    const L = (v: any, cle: string) => v.lignes.find((l: any) => l.cle === cle);
    expect(L(e.variationCapitauxPropres.n1, 'RESULTAT_NET').reserves).toBe(100);
    expect(L(e.variationCapitauxPropres.n1, 'ECART_NON_EXPLIQUE')).toBeUndefined();
    expect(L(e.variationCapitauxPropres.n, 'ECART_NON_EXPLIQUE').reserves).toBe(-100);
    expect(e.n.motifsNonPubliable.join(' ')).toMatch(/-100 de variation/);

    await service.ajouterMouvementCp(T, { exerciceId: EX, type: 'DISTRIBUTION', composante: 'RESERVES', montant: -100, libelle: 'Dividende 2025', justification: 'PV AGO' });
    expect(tables.mouvements).toHaveLength(1);
    e = await service.etat(T, EX);
    expect(L(e.variationCapitauxPropres.n, 'DISTRIBUTIONS').reserves).toBe(-100);
    expect(L(e.variationCapitauxPropres.n, 'ECART_NON_EXPLIQUE')).toBeUndefined();
    expect(e.n.motifsNonPubliable.join(' ')).not.toMatch(/de variation que ni le résultat global/);
    expect(e.variationCapitauxPropres.mouvements.map((m: any) => m.montant)).toEqual([-100]);
  });

  it('sans l’exercice N-2, le bloc comparatif n’est pas rendu et le jeu le dit (§ 10 f)', async () => {
    const { service } = doublure(true);
    for (const r of REGLES) await service.ajouterRegle(T, r);
    const e = await service.etat(T, EX);
    expect(e.variationCapitauxPropres.n).not.toBeNull();
    expect(e.variationCapitauxPropres.n1).toBeNull();
    expect(e.n.motifsNonPubliable.join(' ')).toMatch(/Bloc comparatif de l’état des variations des capitaux propres non établi \(IFRS 18 § 10 f\)/);
  });

  it('refus à la porte · distribution positive, mouvement d’un autre dossier', async () => {
    const { service, tables } = doublure();
    await expect(
      service.ajouterMouvementCp(T, { exerciceId: EX, type: 'DISTRIBUTION', composante: 'RESERVES', montant: 10, libelle: 'x', justification: 'PV' }),
    ).rejects.toThrow(/montant est négatif/);
    await expect(service.supprimerMouvementCp('autre-dossier', 'm-1')).rejects.toThrow(/introuvable/);
    expect(tables.mouvements).toHaveLength(0);
  });
});

describe('IfrsService · première application (IFRS 1)', () => {
  // 2025, l'exercice comparatif · ouverture 24 : 750 au débit, capital 700 et
  // subvention (14) 50 au crédit ; en cours d'exercice, un apport en nature de
  // 100 porte le capital à 800 ; clôture 24 : 950, résultat 100. La subvention
  // est reclassée hors des capitaux propres par la règle du 14. Le capital
  // BOUGE exprès · un jeu où report et solde coïncident laisserait lire
  // l'ouverture sur la clôture sans que rien ne tombe.
  const B = {
    [EX1]: [
      ['24100000', 950, 750, 0],
      ['10100000', -800, 0, 700],
      ['14100000', -50, 0, 50],
      ['70100000', -400],
      ['60100000', 300],
    ] as LigneDoublure[],
  };
  const REGLES_PA = [...REGLES, { prefixe: '14', rubrique: 'SF_FOURNISSEURS_NC' }];
  const lignes = (immo: number, contrepartie: string, montant = immo) => [
    { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: immo },
    { rubrique: contrepartie, montant: -montant },
  ];

  async function dossier() {
    const d = doublure(true, true, B);
    for (const r of REGLES_PA) await d.service.ajouterRegle(T, r);
    await d.service.declarerActivite(T, { activitePrincipale: 'AUCUNE' });
    await d.service.declarerPremiereApplication(T, { premierExerciceIfrsId: EX, dejaAdoptant: false });
    return d;
  }

  it('trois rapprochements chiffrés à la main, reclassement et méthodes avant erreurs (§ 24 a i, a ii, b, § 26)', async () => {
    const { service } = await dossier();
    // Coût présumé à la transition (§ D5) · +100 aux immobilisations, aux réserves.
    await service.ajouterRetraitement(T, { exerciceId: EX1, libelle: 'Coût présumé', fondement: 'IFRS 1 § D5', lignes: lignes(100, 'SF_RESERVES'), aLaTransition: true });
    // Le même écart, redéclaré à la clôture du comparatif, plus l'amortissement de l'écart et une erreur.
    await service.ajouterRetraitement(T, { exerciceId: EX1, libelle: 'Coût présumé reporté', fondement: 'IFRS 1 § D5', lignes: lignes(100, 'SF_RESERVES') });
    await service.ajouterRetraitement(T, {
      exerciceId: EX1,
      libelle: 'Amortissement de l’écart',
      fondement: 'IAS 16 § 50',
      lignes: [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 20 }, { rubrique: 'SF_IMMOBILISATIONS_CORPORELLES', montant: -20 }],
    });
    await service.ajouterRetraitement(T, {
      exerciceId: EX1,
      libelle: 'Facture omise',
      fondement: 'IAS 8 § 42',
      correctionErreur: true,
      lignes: [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 10 }, { rubrique: 'SF_FOURNISSEURS', montant: -10 }],
    });
    const e = await service.etat(T, EX);
    const pa = e.premiereApplication!;
    expect(pa.dateTransition).toBe('2025-01-01');
    const [ouverture, cloture, global] = pa.rapprochements;
    // Ouverture · 700 + 50 publiés = 750, − 50 reclassés, + 100 = 800.
    expect(ouverture.lignes.map((l) => [l.cle.replace(/^R_.*/, 'R'), l.montant])).toEqual([['DEPART', 750], ['RECLASSEMENTS', -50], ['R', 100], ['ARRIVEE', 800]]);
    // Clôture 2025 · 950 publiés (résultat 100 compris), − 50, + 100, − 20, puis l'erreur − 10 = 970.
    expect(cloture.lignes.map((l) => [l.libelle, l.nature ?? null, l.montant])).toEqual([
      ['Capitaux propres selon le SYSCOHADA (bilan, total CP)', null, 950],
      ['Reclassements de présentation (règles de correspondance)', null, -50],
      ['Coût présumé reporté', 'METHODE', 100],
      ['Amortissement de l’écart', 'METHODE', -20],
      ['Facture omise', 'ERREUR', -10],
      ['Capitaux propres selon les IFRS', null, 970],
    ]);
    // Résultat global 2025 · 100 − 20 − 10 = 70 ; le report de bilan n'y figure pas.
    expect(global.lignes.map((l) => l.montant)).toEqual([100, -20, -10, 70]);
    expect(pa.rapprochements.every((r) => r.ecart === 0)).toBe(true);
    // L'ajustement de transition n'entre pas dans la clôture du comparatif · sinon 1 070.
    expect(e.n1!.rapprochements.capitauxPropresIfrs).toBe(970);
    expect(e.ajustementsTransition.map((r: any) => r.libelle)).toEqual(['Coût présumé']);
  });

  it('le bloc comparatif des capitaux propres part de l’état d’ouverture, pas de la clôture N-2', async () => {
    const { service } = await dossier();
    await service.ajouterRetraitement(T, { exerciceId: EX1, libelle: 'Coût présumé', fondement: 'IFRS 1 § D5', lignes: lignes(100, 'SF_RESERVES'), aLaTransition: true });
    await service.ajouterRetraitement(T, { exerciceId: EX1, libelle: 'Coût présumé reporté', fondement: 'IFRS 1 § D5', lignes: lignes(100, 'SF_RESERVES') });
    await service.ajouterMouvementCp(T, { exerciceId: EX1, type: 'APPORT', composante: 'CAPITAL', montant: 100, libelle: 'Apport en nature', justification: 'PV AGE' });
    const e = await service.etat(T, EX);
    const L = (cle: string) => e.variationCapitauxPropres.n1!.lignes.find((l: any) => l.cle === cle);
    expect(L('OUVERTURE_PUBLIEE')).toMatchObject({ capital: 700, reserves: 100 });
    expect(L('APPORTS')).toMatchObject({ capital: 100 });
    expect(L('CLOTURE')).toMatchObject({ capital: 800, reserves: 200 });
    expect(L('ECART_NON_EXPLIQUE')).toBeUndefined();
  });

  it('ajustement de transition · refusé hors de l’exercice comparatif, sans premier exercice déclaré, ou vers le résultat (§ 11)', async () => {
    const nu = doublure(true);
    await expect(
      nu.service.ajouterRetraitement(T, { exerciceId: EX1, libelle: 'x', fondement: 'IFRS 1 § D5', lignes: lignes(10, 'SF_RESERVES'), aLaTransition: true }),
    ).rejects.toThrow(/suppose un premier exercice IFRS déclaré/);
    const { service, tables } = await dossier();
    await expect(
      service.ajouterRetraitement(T, { exerciceId: EX, libelle: 'x', fondement: 'IFRS 1 § D5', lignes: lignes(10, 'SF_RESERVES'), aLaTransition: true }),
    ).rejects.toThrow(/se pose sur l’exercice comparatif/);
    await expect(
      service.ajouterRetraitement(T, {
        exerciceId: EX1,
        libelle: 'x',
        fondement: 'IFRS 1 § D5',
        lignes: [{ rubrique: 'PL_AUTRES_CHARGES_OPERATIONNELLES', montant: 10 }, { rubrique: 'SF_FOURNISSEURS', montant: -10 }],
        aLaTransition: true,
      }),
    ).rejects.toThrow(/IFRS 1 § 11/);
    expect(tables.retraitements).toHaveLength(0);
  });

  it('la déclaration · non déclarée, le jeu le dit ; déjà adoptant, rien ; les deux à la fois, refusé', async () => {
    const { service } = doublure(true, false, B);
    for (const r of REGLES_PA) await service.ajouterRegle(T, r);
    let e = await service.etat(T, EX);
    expect(e.n.motifsNonPubliable.join(' ')).toMatch(/Première application non déclarée · les premiers états financiers IFRS relèvent d’IFRS 1 \(§ 2 et 3\)/);
    expect(e.premiereApplication).toBeNull();
    await service.declarerPremiereApplication(T, { premierExerciceIfrsId: null, dejaAdoptant: true });
    e = await service.etat(T, EX);
    expect(e.n.motifsNonPubliable.join(' ')).not.toMatch(/Première application/);
    await expect(service.declarerPremiereApplication(T, { premierExerciceIfrsId: EX, dejaAdoptant: true })).rejects.toThrow(/l’un ou l’autre/);
    await expect(service.declarerPremiereApplication(T, { premierExerciceIfrsId: 'ailleurs', dejaAdoptant: false })).rejects.toThrow(/introuvable/);
  });

  it('un premier exercice sans exercice comparatif, et un exercice antérieur à la transition, sont nommés', async () => {
    const seul = doublure();
    await seul.service.declarerPremiereApplication(T, { premierExerciceIfrsId: EX });
    const e = await seul.service.etat(T, EX);
    expect(e.premiereApplication).toBeNull();
    expect(e.motifPremiereApplication).toMatch(/au moins un exercice comparatif \(IFRS 1 § 21\)/);
    expect(e.n.motifsNonPubliable.join(' ')).toMatch(/Première application non établie · Le premier exercice IFRS présente/);

    const trois = doublure(true, true);
    for (const r of REGLES) await trois.service.ajouterRegle(T, r);
    await trois.service.declarerPremiereApplication(T, { premierExerciceIfrsId: EX });
    const avant = await trois.service.etat(T, EX2);
    expect(avant.n.motifsNonPubliable.join(' ')).toMatch(/Exercice antérieur à la date de transition aux IFRS/);
    const comparatif = await trois.service.etat(T, EX1);
    expect(comparatif.n.motifsNonPubliable.join(' ')).not.toMatch(/Exercice antérieur à la date de transition/);
  });
});

describe('IfrsController · les écritures sont réservées', () => {
  it('toute route qui écrit porte @Roles, sans la lecture seule', () => {
    const proto = IfrsController.prototype as any;
    for (const m of ['declarerActivite', 'declarerPremiereApplication', 'ajouterRegle', 'supprimerRegle', 'ajouterRetraitement', 'supprimerRetraitement', 'ajouterMouvementCp', 'supprimerMouvementCp']) {
      const roles = Reflect.getMetadata(ROLES_KEY, proto[m]);
      expect(roles).toEqual([RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE]);
    }
  });
});

describe('les tables IFRS ne sont lues que par le module IFRS', () => {
  it('les fichiers du serveur qui les nomment sont exactement le service IFRS et la liste du cloisonnement', () => {
    const racine = join(__dirname, '..', '..');
    const fichiers = (dossier: string): string[] =>
      readdirSync(dossier).flatMap((nom) => {
        const p = join(dossier, nom);
        return statSync(p).isDirectory() ? fichiers(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
      });
    const lecteurs = fichiers(racine)
      .filter((f) => /\b(retraitementIfrs|regleCorrespondanceIfrs|parametresIfrs|ligneRetraitementIfrs|RetraitementIfrs|RegleCorrespondanceIfrs|ParametresIfrs|LigneRetraitementIfrs|mouvementCapitauxPropresIfrs|MouvementCapitauxPropresIfrs)\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(racine, f))
      .sort();
    expect(lecteurs).toEqual(['common/cloisonnement/modeles-cloisonnes.ts', 'modules/ifrs/ifrs.service.ts']);
  });
});
