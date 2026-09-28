import { ClasseCompte } from '@prisma/client';
import { EtatsAnalytiquesService, PLAFOND_LIGNES_SANS_REPARTITION } from './etats-analytiques.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F186 · le contrôle des cumuls rapatriait TOUTES les lignes des
 * classes ventilées de l'exercice, plan par plan, pour en faire deux sommes,
 * et rendait la liste entière des lignes sans répartition. Les cumuls se
 * demandent désormais à la base, la liste se borne, se dit tronquée et
 * compte exactement ce qu'elle ne montre pas.
 *
 * La doublure HONORE les filtres (tenantId, exercice, dates, classes,
 * ventilations du plan, montants non nuls, tri, take) et REFUSE tout filtre
 * qu'elle ne sait pas lire · une doublure qui ignorerait un filtre validerait
 * un service qui ne filtre pas. La lecture d'avant est réécrite ici, telle
 * quelle, comme référence : sous le plafond, le résultat doit lui être égal.
 */

type Compte = { id: string; numero: string; intitule: string; classe: ClasseCompte };
type Ecriture = {
  id: string;
  tenantId: string;
  exerciceId: string;
  date: Date;
  numeroPiece: number | null;
  libelle: string;
  journal: { code: string };
  /** L'écriture qui solde les classes 6 à 8 à la clôture, VALIDÉE depuis l'audit final F4. */
  estSoldeDesComptesDeGestion?: boolean;
};
type Ligne = { id: string; ecritureId: string; compteId: string; libelle: string | null; debit: number; credit: number };
type Ventilation = { id: string; ligneEcritureId: string; planId: string; debit: number; credit: number };
type Plan = { id: string; tenantId: string; code: string; intitule: string; classesVentilees: string; estActif: boolean; ordre: number };

interface Donnees {
  comptes: Compte[];
  ecritures: Ecriture[];
  lignes: Ligne[];
  ventilations: Ventilation[];
  plans: Plan[];
}

const EXERCICE = { id: 'e1', tenantId: 't1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

function inconnu(ou: string, cle: string): never {
  throw new Error(`Filtre non honoré par la doublure (${ou}) : ${cle}`);
}

function montantRepond(montant: number, filtre: Record<string, number>): boolean {
  return Object.entries(filtre).every(([op, v]) => {
    if (op === 'not') return montant !== v;
    if (op === 'gt') return montant > v;
    if (op === 'gte') return montant >= v;
    return inconnu('montant', op);
  });
}

function doublure(d: Donnees) {
  const compteDe = (l: Ligne) => d.comptes.find((c) => c.id === l.compteId)!;
  const ecritureDe = (l: Ligne) => d.ecritures.find((e) => e.id === l.ecritureId)!;

  const ecritureRepond = (e: Ecriture, w: Record<string, any>): boolean =>
    Object.entries(w).every(([cle, v]) => {
      if (cle === 'tenantId' || cle === 'exerciceId') return e[cle] === v;
      if (cle === 'estSoldeDesComptesDeGestion') return (e.estSoldeDesComptesDeGestion ?? false) === v;
      if (cle === 'date')
        return Object.entries(v as Record<string, Date>).every(([op, borne]) => {
          if (op === 'gte') return e.date.getTime() >= borne.getTime();
          if (op === 'lte') return e.date.getTime() <= borne.getTime();
          return inconnu('date', op);
        });
      return inconnu('écriture', cle);
    });

  const compteRepond = (c: Compte, w: Record<string, any>): boolean =>
    Object.entries(w).every(([cle, v]) => {
      if (cle === 'classe') {
        if (!('in' in v) || Object.keys(v).length !== 1) return inconnu('classe', Object.keys(v).join(','));
        return (v.in as ClasseCompte[]).includes(c.classe);
      }
      return inconnu('compte', cle);
    });

  const ventilationRepond = (v: Ventilation, w: Record<string, any>): boolean =>
    Object.entries(w).every(([cle, val]) => {
      if (cle === 'planId') return v.planId === val;
      if (cle === 'ligne') return ligneRepond(d.lignes.find((l) => l.id === v.ligneEcritureId)!, val);
      return inconnu('ventilation', cle);
    });

  function ligneRepond(l: Ligne, w: Record<string, any>): boolean {
    return Object.entries(w).every(([cle, v]) => {
      if (cle === 'ecriture') return ecritureRepond(ecritureDe(l), v);
      if (cle === 'compte') return compteRepond(compteDe(l), v);
      if (cle === 'debit' || cle === 'credit') return montantRepond(l[cle], v);
      if (cle === 'OR') return (v as Record<string, any>[]).some((x) => ligneRepond(l, x));
      if (cle === 'ventilations') {
        if (!('none' in v) || Object.keys(v).length !== 1) return inconnu('ventilations', Object.keys(v).join(','));
        return !d.ventilations.some((x) => x.ligneEcritureId === l.id && ventilationRepond(x, v.none));
      }
      return inconnu('ligne', cle);
    });
  }

  // Tri honoré clé par clé ET dans son SENS · un tri absent rend l'ordre
  // d'insertion, comme une base sans ORDER BY rend l'ordre physique. Une
  // doublure qui trierait toujours en croissant laisserait passer un tri
  // inversé dans le service (vu à la relecture, audit final F186).
  const sensDu = (direction: unknown): 1 | -1 =>
    direction === 'asc' ? 1 : direction === 'desc' ? -1 : inconnu('sens du tri', JSON.stringify(direction));
  const trier = (lignes: Ligne[], orderBy: Record<string, any>[] | undefined) => {
    if (!orderBy) return lignes;
    const critere = (l: Ligne, cle: Record<string, any>): { valeur: number | string | null; sens: 1 | -1 } => {
      if ('id' in cle) return { valeur: l.id, sens: sensDu(cle.id) };
      if ('ecriture' in cle) {
        const champ = Object.keys(cle.ecriture)[0];
        const sens = sensDu(cle.ecriture[champ]);
        if (champ === 'date') return { valeur: ecritureDe(l).date.getTime(), sens };
        if (champ === 'numeroPiece') return { valeur: ecritureDe(l).numeroPiece, sens };
        return inconnu('tri écriture', champ);
      }
      return inconnu('tri', Object.keys(cle).join(','));
    };
    return [...lignes].sort((a, b) => {
      for (const cle of orderBy) {
        const ca = critere(a, cle);
        const cb = critere(b, cle);
        if (ca.valeur === cb.valeur) continue;
        // PostgreSQL tient NULL pour plus grand que toute valeur · en dernier
        // sur un tri croissant, en premier sur un tri décroissant.
        const comparaison = ca.valeur === null ? 1 : cb.valeur === null ? -1 : ca.valeur < cb.valeur ? -1 : 1;
        return comparaison * ca.sens;
      }
      return 0;
    });
  };

  const somme = (elements: { debit: number; credit: number }[]) =>
    elements.length === 0
      ? { debit: null, credit: null }
      : {
          debit: elements.reduce((t, x) => t + x.debit, 0),
          credit: elements.reduce((t, x) => t + x.credit, 0),
        };

  // Un argument de requête que la doublure ne sait pas jouer (curseur, skip,
  // distinct…) est refusé, pas ignoré · ignoré, il validerait une pagination
  // que personne n'a vérifiée.
  const seulement = <T extends Record<string, any>>(args: T, permis: string[], ou: string): T => {
    for (const cle of Object.keys(args)) if (!permis.includes(cle)) inconnu(ou, cle);
    return args;
  };

  const prisma = {
    exercice: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(where.id === EXERCICE.id && where.tenantId === EXERCICE.tenantId ? EXERCICE : null),
      ),
    },
    planAnalytique: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          d.plans
            .filter((p) => p.tenantId === where.tenantId && p.estActif === where.estActif && (!where.id || p.id === where.id))
            .sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code)),
        ),
      ),
    },
    ligneEcriture: {
      aggregate: jest.fn((args: any) => {
        const { where } = seulement(args, ['where', '_sum'], 'ligneEcriture.aggregate');
        return Promise.resolve({ _sum: somme(d.lignes.filter((l) => ligneRepond(l, where))) });
      }),
      count: jest.fn((args: any) => {
        const { where } = seulement(args, ['where'], 'ligneEcriture.count');
        return Promise.resolve(d.lignes.filter((l) => ligneRepond(l, where)).length);
      }),
      // `include.ventilations` est honoré aussi · c'est ce qui permet de jouer
      // la lecture d'avant (toutes les lignes, avec leurs ventilations) contre
      // cette spec et de la voir tomber pour ce qu'elle faisait, pas pour une
      // doublure incomplète.
      findMany: jest.fn((args: any) => {
        const { where, include, orderBy, take } = seulement(
          args,
          ['where', 'include', 'orderBy', 'take'],
          'ligneEcriture.findMany',
        );
        const retenues = trier(
          d.lignes.filter((l) => ligneRepond(l, where)),
          orderBy,
        );
        return Promise.resolve(
          (take === undefined ? retenues : retenues.slice(0, take)).map((l) => ({
            ...l,
            compte: compteDe(l),
            ecriture: ecritureDe(l),
            ...(include?.ventilations
              ? {
                  ventilations: d.ventilations.filter(
                    (v) => v.ligneEcritureId === l.id && ventilationRepond(v, include.ventilations.where ?? {}),
                  ),
                }
              : {}),
          })),
        );
      }),
    },
    ventilationAnalytique: {
      aggregate: jest.fn((args: any) => {
        const { where } = seulement(args, ['where', '_sum'], 'ventilationAnalytique.aggregate');
        return Promise.resolve({ _sum: somme(d.ventilations.filter((v) => ventilationRepond(v, where))) });
      }),
    },
  };
  return { prisma, service: new EtatsAnalytiquesService(prisma as unknown as PrismaService) };
}

/**
 * La lecture d'AVANT la correction, recopiée · toutes les lignes du
 * périmètre en mémoire, deux sommes, et la liste des lignes sans ventilation
 * du plan et non nulles. Seul le tri s'y ajoute, l'ancienne liste n'en ayant
 * aucun : c'est l'ordre déterministe que la correction pose.
 */
function lectureDAvant(d: Donnees, plan: Plan, du: Date, au: Date) {
  const classes = plan.classesVentilees.split(',').map((c) => `CLASSE_${c}`);
  const lignes = d.lignes.filter((l) => {
    const e = d.ecritures.find((x) => x.id === l.ecritureId)!;
    const c = d.comptes.find((x) => x.id === l.compteId)!;
    return (
      e.tenantId === 't1' &&
      e.exerciceId === 'e1' &&
      e.date.getTime() >= du.getTime() &&
      e.date.getTime() <= au.getTime() &&
      classes.includes(c.classe)
    );
  });
  let gd = 0;
  let gc = 0;
  let ad = 0;
  let ac = 0;
  const sans: Ligne[] = [];
  for (const l of lignes) {
    gd += l.debit;
    gc += l.credit;
    const vs = d.ventilations.filter((v) => v.ligneEcritureId === l.id && v.planId === plan.id);
    for (const v of vs) {
      ad += v.debit;
      ac += v.credit;
    }
    if (vs.length === 0 && (l.debit !== 0 || l.credit !== 0)) sans.push(l);
  }
  const ecritureDe = (l: Ligne) => d.ecritures.find((x) => x.id === l.ecritureId)!;
  sans.sort((a, b) => {
    const ea = ecritureDe(a);
    const eb = ecritureDe(b);
    return (
      ea.date.getTime() - eb.date.getTime() ||
      (ea.numeroPiece ?? Infinity) - (eb.numeroPiece ?? Infinity) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
  return {
    mouvementsGenerauxDebit: gd,
    mouvementsGenerauxCredit: gc,
    mouvementsAnalytiquesDebit: ad,
    mouvementsAnalytiquesCredit: ac,
    ecartDebit: gd - ad,
    ecartCredit: gc - ac,
    ligneIds: sans.map((l) => l.id),
  };
}

const COMPTES: Compte[] = [
  { id: 'c6', numero: '60400000', intitule: 'Achats stockés', classe: ClasseCompte.CLASSE_6 },
  { id: 'c7', numero: '70600000', intitule: 'Services vendus', classe: ClasseCompte.CLASSE_7 },
  { id: 'c4', numero: '40110000', intitule: 'Fournisseurs', classe: ClasseCompte.CLASSE_4 },
];

const PLANS: Plan[] = [
  { id: 'p1', tenantId: 't1', code: 'PROJ', intitule: 'Projets', classesVentilees: '6,7', estActif: true, ordre: 0 },
  { id: 'p2', tenantId: 't1', code: 'BAIL', intitule: 'Bailleurs', classesVentilees: '6', estActif: true, ordre: 1 },
];

/**
 * Un dossier sous le plafond, qui porte chaque cas de bord que la boucle
 * d'avant tranchait · insérées dans le DÉSORDRE, pour qu'un tri absent se
 * voie.
 */
function dossierOrdinaire(): Donnees {
  const ecritures: Ecriture[] = [
    { id: 'E3', tenantId: 't1', exerciceId: 'e1', date: new Date('2026-03-10'), numeroPiece: 7, libelle: 'Loyer', journal: { code: 'AC' } },
    { id: 'E1', tenantId: 't1', exerciceId: 'e1', date: new Date('2026-02-01'), numeroPiece: 2, libelle: 'Fournitures', journal: { code: 'AC' } },
    { id: 'E2', tenantId: 't1', exerciceId: 'e1', date: new Date('2026-02-01'), numeroPiece: 1, libelle: 'Prestation', journal: { code: 'VT' } },
    { id: 'E4', tenantId: 't1', exerciceId: 'e1', date: new Date('2026-03-10'), numeroPiece: null, libelle: 'Réimputation', journal: { code: 'OD' } },
    // Hors de la fenêtre demandée (fin au 30 juin).
    { id: 'E5', tenantId: 't1', exerciceId: 'e1', date: new Date('2026-09-15'), numeroPiece: 3, libelle: 'Hors fenêtre', journal: { code: 'AC' } },
    // Un autre dossier sur le même identifiant d'exercice · seule la borne
    // du dossier l'écarte.
    { id: 'EX', tenantId: 't2', exerciceId: 'e1', date: new Date('2026-02-01'), numeroPiece: 1, libelle: 'Voisin', journal: { code: 'AC' } },
  ];
  const lignes: Ligne[] = [
    // Ventilée sur p1 et sur p2.
    { id: 'L01', ecritureId: 'E1', compteId: 'c6', libelle: null, debit: 1000, credit: 0 },
    // Sans aucune ventilation.
    { id: 'L02', ecritureId: 'E1', compteId: 'c6', libelle: 'Papier', debit: 250.5, credit: 0 },
    // Tiers · hors des classes ventilées, porte pourtant une ventilation p1.
    { id: 'L03', ecritureId: 'E1', compteId: 'c4', libelle: null, debit: 0, credit: 1250.5 },
    // Produit ventilé sur p2 seulement · reste à ventiler sur p1, hors du
    // périmètre de p2 (classe 7).
    { id: 'L04', ecritureId: 'E2', compteId: 'c7', libelle: null, debit: 0, credit: 800 },
    // Ligne nulle sans ventilation · jamais listée.
    { id: 'L05', ecritureId: 'E2', compteId: 'c6', libelle: null, debit: 0, credit: 0 },
    // Ventilée partiellement sur p1.
    { id: 'L06', ecritureId: 'E3', compteId: 'c6', libelle: null, debit: 600, credit: 0 },
    // Inscription en négatif, sans ventilation · reste à ventiler.
    { id: 'L07', ecritureId: 'E4', compteId: 'c6', libelle: 'Annulation', debit: -120, credit: 0 },
    // Sans ventilation, même jour que L06 mais pièce nulle · rangée après.
    { id: 'L08', ecritureId: 'E4', compteId: 'c6', libelle: null, debit: 120, credit: 0 },
    // Hors fenêtre.
    { id: 'L09', ecritureId: 'E5', compteId: 'c6', libelle: null, debit: 999, credit: 0 },
    // Autre dossier.
    { id: 'LX', ecritureId: 'EX', compteId: 'c6', libelle: null, debit: 5000, credit: 0 },
  ];
  const ventilations: Ventilation[] = [
    { id: 'v1', ligneEcritureId: 'L01', planId: 'p1', debit: 1000, credit: 0 },
    { id: 'v2', ligneEcritureId: 'L01', planId: 'p2', debit: 1000, credit: 0 },
    { id: 'v3', ligneEcritureId: 'L03', planId: 'p1', debit: 0, credit: 1250.5 },
    { id: 'v4', ligneEcritureId: 'L04', planId: 'p2', debit: 0, credit: 800 },
    { id: 'v5', ligneEcritureId: 'L06', planId: 'p1', debit: 400, credit: 0 },
    { id: 'v6', ligneEcritureId: 'L09', planId: 'p1', debit: 999, credit: 0 },
    { id: 'vx', ligneEcritureId: 'LX', planId: 'p1', debit: 5000, credit: 0 },
  ];
  return { comptes: COMPTES, ecritures, lignes, ventilations, plans: PLANS };
}

/**
 * Des lignes sans répartition en masse, insérées de la plus tardive à la plus
 * ancienne · la tranche doit garder les plus anciennes. Dix par quart de
 * journée, pièces croissantes, dans la fenêtre du premier semestre.
 */
function ajouterMasse(donnees: Donnees, nombre: number) {
  for (let i = nombre - 1; i >= 0; i--) {
    const jour = new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 10) * 86_400_000 / 4);
    const id = `M${String(i).padStart(5, '0')}`;
    donnees.ecritures.push({
      id: `EM${id}`,
      tenantId: 't1',
      exerciceId: 'e1',
      date: jour,
      numeroPiece: 100 + i,
      libelle: 'Masse',
      journal: { code: 'AC' },
    });
    donnees.lignes.push({ id, ecritureId: `EM${id}`, compteId: 'c6', libelle: null, debit: 10, credit: 0 });
  }
}

describe('Contrôle des cumuls · les cumuls à la base, la liste bornée (F186)', () => {
  it('sous le plafond, rend exactement ce que rendait la lecture d’avant, plan par plan', async () => {
    const donnees = dossierOrdinaire();
    const { service } = doublure(donnees);
    const r = await service.controleCumuls('t1', { exerciceId: 'e1', dateDebut: '2026-01-01', dateFin: '2026-06-30' });

    expect(r.map((c) => c.planCode)).toEqual(['PROJ', 'BAIL']);
    for (const plan of PLANS) {
      const attendu = lectureDAvant(donnees, plan, new Date('2026-01-01'), new Date('2026-06-30'));
      const obtenu = r.find((c) => c.planId === plan.id)!;
      expect(obtenu.mouvementsGenerauxDebit).toBeCloseTo(attendu.mouvementsGenerauxDebit, 6);
      expect(obtenu.mouvementsGenerauxCredit).toBeCloseTo(attendu.mouvementsGenerauxCredit, 6);
      expect(obtenu.mouvementsAnalytiquesDebit).toBeCloseTo(attendu.mouvementsAnalytiquesDebit, 6);
      expect(obtenu.mouvementsAnalytiquesCredit).toBeCloseTo(attendu.mouvementsAnalytiquesCredit, 6);
      expect(obtenu.ecartDebit).toBeCloseTo(attendu.ecartDebit, 6);
      expect(obtenu.ecartCredit).toBeCloseTo(attendu.ecartCredit, 6);
      expect(obtenu.lignesSansRepartition.map((l) => l.ligneId)).toEqual(attendu.ligneIds);
      expect(obtenu.nombreSansRepartition).toBe(attendu.ligneIds.length);
      expect(obtenu.tronque).toBe(false);
    }
  });

  it('les chiffres attendus, écrits en clair pour le plan PROJ', async () => {
    const { service } = doublure(dossierOrdinaire());
    const [proj] = await service.controleCumuls('t1', {
      exerciceId: 'e1',
      dateDebut: '2026-01-01',
      dateFin: '2026-06-30',
      planId: 'p1',
    });
    // Généraux · L01 + L02 + L06 + L07 + L08 au débit, L04 au crédit (le
    // tiers, la ligne hors fenêtre et le voisin n'y sont pas).
    expect(proj.mouvementsGenerauxDebit).toBeCloseTo(1000 + 250.5 + 600 - 120 + 120, 6);
    expect(proj.mouvementsGenerauxCredit).toBeCloseTo(800, 6);
    // Ventilés · v1 et v5 seulement · v3 porte sur un tiers, v6 est hors
    // fenêtre, vx chez le voisin, v2 et v4 sur un autre plan.
    expect(proj.mouvementsAnalytiquesDebit).toBeCloseTo(1400, 6);
    expect(proj.mouvementsAnalytiquesCredit).toBeCloseTo(0, 6);
    expect(proj.ecartDebit).toBeCloseTo(450.5, 6);
    expect(proj.ecartCredit).toBeCloseTo(800, 6);
    // Par date, pièce, identifiant · le 1er février pièce 1 (L04) avant la
    // pièce 2 (L02), le 10 mars pièce nulle (L07, L08) après aucune autre.
    expect(proj.lignesSansRepartition.map((l) => l.ligneId)).toEqual(['L04', 'L02', 'L07', 'L08']);
    const negative = proj.lignesSansRepartition.find((l) => l.ligneId === 'L07')!;
    expect(negative).toEqual({
      ligneId: 'L07',
      ecritureId: 'E4',
      date: '2026-03-10',
      journal: 'OD',
      compteNumero: '60400000',
      compteIntitule: 'Achats stockés',
      libelle: 'Annulation',
      debit: -120,
      credit: 0,
    });
    // Le libellé de l'écriture supplée celui de la ligne.
    expect(proj.lignesSansRepartition.find((l) => l.ligneId === 'L04')!.libelle).toBe('Prestation');
  });

  it('au-delà du plafond, la liste montre les premières, se dit tronquée et compte EXACTEMENT', async () => {
    const donnees = dossierOrdinaire();
    const enTrop = 7;
    const nombre = PLAFOND_LIGNES_SANS_REPARTITION + enTrop;
    ajouterMasse(donnees, nombre);
    const { service, prisma } = doublure(donnees);
    const [proj] = await service.controleCumuls('t1', {
      exerciceId: 'e1',
      dateDebut: '2026-01-01',
      dateFin: '2026-06-30',
      planId: 'p1',
    });
    const attendu = lectureDAvant(donnees, PLANS[0], new Date('2026-01-01'), new Date('2026-06-30'));

    expect(proj.nombreSansRepartition).toBe(attendu.ligneIds.length);
    expect(proj.nombreSansRepartition).toBeGreaterThan(PLAFOND_LIGNES_SANS_REPARTITION);
    expect(proj.tronque).toBe(true);
    expect(proj.lignesSansRepartition).toHaveLength(PLAFOND_LIGNES_SANS_REPARTITION);
    // Les PREMIÈRES dans l'ordre déterministe, pas n'importe lesquelles.
    expect(proj.lignesSansRepartition.map((l) => l.ligneId)).toEqual(
      attendu.ligneIds.slice(0, PLAFOND_LIGNES_SANS_REPARTITION),
    );
    // Les cumuls portent TOUTE la période, jamais la seule tranche.
    expect(proj.mouvementsGenerauxDebit).toBeCloseTo(attendu.mouvementsGenerauxDebit, 6);
    expect(proj.ecartDebit).toBeCloseTo(attendu.ecartDebit, 6);
    expect(proj.mouvementsGenerauxDebit).toBeCloseTo(1850.5 + nombre * 10, 6);

    // Aucune ligne n'est rapatriée au-delà du plafond, pour aucune lecture.
    for (const [args] of prisma.ligneEcriture.findMany.mock.calls) {
      expect(args.take).toBe(PLAFOND_LIGNES_SANS_REPARTITION);
    }
  });

  it('pile au plafond, la liste est entière et ne se dit pas tronquée', async () => {
    // Le plan PROJ porte déjà quatre lignes sans répartition (L02, L04, L07,
    // L08) · on complète jusqu'au plafond exact. « 500 premières sur 500 »
    // dirait qu'il en manque quand il n'en manque aucune (vu à la relecture,
    // audit final F186).
    const donnees = dossierOrdinaire();
    ajouterMasse(donnees, PLAFOND_LIGNES_SANS_REPARTITION - 4);
    const { service } = doublure(donnees);
    const [proj] = await service.controleCumuls('t1', {
      exerciceId: 'e1',
      dateDebut: '2026-01-01',
      dateFin: '2026-06-30',
      planId: 'p1',
    });
    expect(proj.nombreSansRepartition).toBe(PLAFOND_LIGNES_SANS_REPARTITION);
    expect(proj.lignesSansRepartition).toHaveLength(PLAFOND_LIGNES_SANS_REPARTITION);
    expect(proj.tronque).toBe(false);
  });

  it('agrégats, tranche et décompte lisent le même périmètre, borné au dossier par sa valeur', async () => {
    const { service, prisma } = doublure(dossierOrdinaire());
    await service.controleCumuls('t1', { exerciceId: 'e1', planId: 'p1' });

    const perimetre = prisma.ligneEcriture.aggregate.mock.calls[0][0].where;
    expect(perimetre.ecriture.tenantId).toBe('t1');
    expect(perimetre.ecriture.exerciceId).toBe('e1');
    expect(prisma.ventilationAnalytique.aggregate.mock.calls[0][0].where).toEqual({ planId: 'p1', ligne: perimetre });

    const tranche = prisma.ligneEcriture.findMany.mock.calls[0][0].where;
    expect(prisma.ligneEcriture.count.mock.calls[0][0].where).toEqual(tranche);
    // La tranche est le périmètre, restreint aux lignes non ventilées du plan.
    expect(tranche).toMatchObject(perimetre);
    expect(tranche.ventilations).toEqual({ none: { planId: 'p1' } });
  });

  it('sans ligne dans le périmètre, les cumuls valent zéro et la liste est vide', async () => {
    const donnees = dossierOrdinaire();
    donnees.plans = [{ ...PLANS[0], classesVentilees: '9' }];
    const { service } = doublure(donnees);
    const [proj] = await service.controleCumuls('t1', { exerciceId: 'e1' });
    expect(proj).toMatchObject({
      mouvementsGenerauxDebit: 0,
      mouvementsGenerauxCredit: 0,
      mouvementsAnalytiquesDebit: 0,
      mouvementsAnalytiquesCredit: 0,
      ecartDebit: 0,
      ecartCredit: 0,
      nombreSansRepartition: 0,
      tronque: false,
      lignesSansRepartition: [],
    });
  });
});

describe('Contrôle des cumuls · un exercice clos (régression de F4)', () => {
  it('ne compte ni ne liste l’écriture qui solde les comptes de gestion', async () => {
    // Le 31 décembre, l'écriture validée de clôture solde le 604 sur le 13 ·
    // lue avec le reste, elle doublait les mouvements généraux et sa ligne
    // ressortait « à ventiler » sur tout exercice clos.
    const donnees = dossierOrdinaire();
    donnees.ecritures.push({
      id: 'ECL', tenantId: 't1', exerciceId: 'e1', date: new Date('2026-12-31'), numeroPiece: 99,
      libelle: 'Solde des comptes de gestion', journal: { code: 'CL' }, estSoldeDesComptesDeGestion: true,
    });
    donnees.lignes.push({ id: 'LCL', ecritureId: 'ECL', compteId: 'c6', libelle: null, debit: 0, credit: 1_000_000 });
    const { service } = doublure(donnees);
    const [proj] = await service.controleCumuls('t1', { exerciceId: 'e1', planId: 'p1' });
    expect(proj.lignesSansRepartition.map((l) => l.ligneId)).not.toContain('LCL');
    expect(proj.mouvementsGenerauxCredit).toBeLessThan(1_000_000);
  });
});
