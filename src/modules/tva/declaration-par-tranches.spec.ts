import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { LOT_ECRITURES, LOT_LECTURE } from '../../common/lecture-par-lots';

/**
 * LA DÉCLARATION DE TVA LIT PAR TRANCHES · audit final F188.
 *
 * La fenêtre de lecture de la déclaration remonte sans borne inférieure, et
 * doit le faire : la déchéance de l'article 37, alinéa 2 se compte sur toute
 * l'histoire, une ligne datée à l'encaissement (art. 25, 2°) entre dans la
 * période de son règlement quel que soit l'âge de sa facture, et les avoirs
 * sur ventes sans liquidation antérieure (art. 52) se comptent depuis
 * l'origine. La requête rapatriait donc TOUTE la TVA validée du dossier d'un
 * seul coup, chaque ligne avec son écriture, ses contreparties et son groupe
 * de lettrage : la mémoire d'une déclaration grandissait avec l'ancienneté du
 * dossier.
 *
 * Ce spec vérifie les deux moitiés de la correction, et la seconde compte
 * autant que la première : AUCUN APPEL ne rend plus d'une tranche, et le
 * RÉSULTAT est celui qu'aurait rendu la lecture d'un bloc, au centime.
 *
 * LA DOUBLURE HONORE LA REQUÊTE · `where`, `select`, `orderBy`, `cursor`,
 * `skip` et `take`. C'est la condition pour que le test prouve quelque chose :
 * une doublure qui ignore `take` ne verrait pas une lecture d'un bloc, et une
 * doublure qui ignore `select` ne verrait pas une colonne oubliée dans la
 * sélection réduite (sans les lignes du groupe de lettrage, un service réglé
 * cette année retomberait sur la date de sa facture, et passerait de la
 * déclaration à la déchéance sans qu'aucune erreur ne le dise).
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c4431', compteDeductibleId: 'c4452' };

type Objet = Record<string, any>;

/** Projection d'un objet stocké par un `select` Prisma, filtres imbriqués compris. */
function projeter(objet: Objet | null | undefined, select: Objet | undefined): Objet | null | undefined {
  if (!select || objet == null) return objet;
  const rendu: Objet = {};
  for (const [cle, valeur] of Object.entries(select)) {
    if (valeur === true) rendu[cle] = objet[cle];
    else if (valeur && typeof valeur === 'object') {
      const brut = objet[cle];
      rendu[cle] = Array.isArray(brut)
        ? brut.filter((x) => ligneRetenue(x, valeur.where)).map((x) => projeter(x, valeur.select))
        : projeter(brut, valeur.select);
    }
  }
  return rendu;
}

/** Le `where` des contreparties · un OU de conditions sur la classe, le lettrage et le tiers. */
function ligneRetenue(ligne: Objet, where: Objet | undefined): boolean {
  if (!where?.OR) return true;
  return (where.OR as Objet[]).some((o) => {
    if (o.compte?.classe && ligne.compte?.classe !== o.compte.classe) return false;
    if (o.lettrageId && o.lettrageId.not === null && ligne.lettrageId == null) return false;
    if (o.compte?.tiersCompte && o.compte.tiersCompte.isNot === null && ligne.compte?.tiersCompte == null) return false;
    return true;
  });
}

/** Le `where` de tête · taux, famille du compte, statut et dates de l'écriture. */
function retenue(ligne: Objet, where: Objet): boolean {
  const e = where.ecriture ?? {};
  if (e.statut && ligne.ecriture.statut !== e.statut) return false;
  if (e.date?.lte && ligne.ecriture.date > e.date.lte) return false;
  if (e.date?.gte && ligne.ecriture.date < e.date.gte) return false;
  if (where.tauxTvaId?.in && !where.tauxTvaId.in.includes(ligne.tauxTvaId)) return false;
  if (where.tauxTvaId && 'not' in where.tauxTvaId && where.tauxTvaId.not === null && ligne.tauxTvaId == null) return false;
  const c = where.compte;
  if (c?.OR) return (c.OR as Objet[]).some((o) => ligne.compte.numero.startsWith(o.numero.startsWith));
  if (c?.numero?.startsWith) return ligne.compte.numero.startsWith(c.numero.startsWith);
  return true;
}

interface Appel {
  requete: Objet;
  rendues: number;
  /** Identifiant de la dernière ligne rendue · c'est lui que le curseur suivant doit porter. */
  derniere?: string;
}

/**
 * La doublure. Elle compte ses appels et refuse d'en servir plus de deux
 * cents · une pagination cassée boucle à l'infini sur une doublure honnête,
 * et un test qui ne rend jamais la main ne tombe pas, il pend.
 *
 * `bloc` en fait une lecture D'UN BLOC (audit final F188, relecture) · la
 * même requête, triée de la même façon, rendue en entier au premier appel et
 * vide ensuite. C'est l'étalon · la déclaration lue par tranches doit lui être
 * égale objet pour objet, ordre des comptes compris, et non seulement sur les
 * totaux qu'on a pensé à vérifier. Seules les frontières de tranche les
 * distinguent, et c'est là qu'une ligne se perd ou se compte deux fois.
 */
function monter(stock: Objet[], referentiel = 'SYSCOHADA', bloc = false) {
  const appels: Appel[] = [];
  const findMany = jest.fn().mockImplementation((args: Objet) => {
    if (appels.length >= 200) throw new Error('pagination sans fin');
    let lignes = stock.filter((l) => retenue(l, args.where ?? {}));
    if (args.orderBy?.id === 'asc') lignes = [...lignes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let tranche: Objet[];
    if (bloc) {
      tranche = args.cursor ? [] : lignes;
    } else {
      let debut = 0;
      if (args.cursor) {
        const i = lignes.findIndex((l) => l.id === args.cursor.id);
        if (i < 0) return Promise.resolve([]);
        debut = i;
      }
      debut += args.skip ?? 0;
      tranche = lignes.slice(debut, args.take === undefined ? lignes.length : debut + args.take);
    }
    appels.push({ requete: args, rendues: tranche.length, derniere: tranche[tranche.length - 1]?.id });
    return Promise.resolve(tranche.map((l) => projeter(l, args.select)));
  });
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ecriture: { count: jest.fn().mockResolvedValue(0) },
    ligneEcriture: {
      findMany,
      aggregate: jest.fn().mockImplementation((args: Objet) => {
        // Au taux zéro, le numérateur du prorata reprend le crédit de classe 7
        // de l'écriture · mille par écriture dans ce jeu d'essai.
        const ids = args.where?.ecritureId?.in as string[] | undefined;
        return Promise.resolve({ _sum: { credit: ids ? 1000 * ids.length : 0, debit: 0 } });
      }),
    },
    regularisationTvaCreance: { findMany: jest.fn().mockResolvedValue([]) },
    tvaVenteDeclaree: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    mouvementCreanceDouteuse: { findMany: jest.fn().mockResolvedValue([]) },
    liquidationTva: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return { service: new TauxTvaService(prisma, {} as EcritureService), appels };
}

/**
 * LA PAGINATION SE VÉRIFIE PAR SES VALEURS, jamais par sa présence · un
 * curseur posé sur une autre ligne que la dernière rendue rejoue des lignes
 * (en arrière) ou en saute (en avant), un `skip` absent compte deux fois la
 * ligne du curseur, et sans ordre sur l'identifiant la base ne garantit
 * aucune suite d'une tranche à l'autre.
 */
function exigerUnePaginationExacte(lecture: Appel[], taille: number) {
  lecture.forEach((a, i) => {
    expect(a.requete.take).toBe(taille);
    expect(a.requete.orderBy).toEqual({ id: 'asc' });
    expect(a.rendues).toBeLessThanOrEqual(taille);
    if (i === 0) {
      expect(a.requete.cursor).toBeUndefined();
    } else {
      expect(a.requete.cursor).toEqual({ id: lecture[i - 1].derniere });
      expect(a.requete.skip).toBe(1);
    }
  });
}

/**
 * Des identifiants MÊLÉS · l'ordre des tranches (par identifiant) ne suit ni
 * l'ordre de saisie ni l'ordre des dates, si bien qu'une tranche porte à la
 * fois de l'ancien et de la période. 100 003 est premier : k × 7 919 le
 * parcourt sans collision.
 */
const identifiant = (k: number) => `l${String((k * 7919) % 100003).padStart(6, '0')}`;

const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function contrepartie(numero: string, classe: string, montant: number, sensDebit: boolean): Objet {
  return {
    debit: sensDebit ? montant : 0,
    credit: sensDebit ? 0 : montant,
    lettrageId: null,
    compte: { numero, classe, tiersCompte: null },
    lettrage: null,
  };
}

/** Une contrepartie de tiers lettrée dans un groupe SOLDÉ par un règlement daté. */
function tiersLettre(
  numero: string,
  montant: number,
  sensDebit: boolean,
  dateFacture: string,
  dateReglement: string,
  tiers: Objet | null = null,
): Objet {
  const facture = { debit: sensDebit ? montant : 0, credit: sensDebit ? 0 : montant, ecriture: { date: jour(dateFacture) } };
  const reglement = { debit: sensDebit ? 0 : montant, credit: sensDebit ? montant : 0, ecriture: { date: jour(dateReglement) } };
  return {
    ...facture,
    lettrageId: `lg-${numero}-${dateFacture}`,
    compte: { numero, classe: 'CLASSE_4', tiersCompte: tiers ? { tiers } : null },
    lettrage: { statut: 'SOLDE', solde: 0, soldeAt: null, lignes: [facture, reglement] },
  };
}

interface Famille {
  nombre: number;
  compteTva: string;
  date: string;
  /** Montant de TVA, porté au crédit d'un 443 ou au débit d'un 445. */
  tva: number;
  /** Un avoir sur vente débite le 443. */
  avoir?: boolean;
  lignes: Objet[];
}

function dossier(familles: Famille[]): Objet[] {
  const stock: Objet[] = [];
  let k = 1;
  for (const f of familles) {
    const collecte = f.compteTva.startsWith('443');
    for (let n = 0; n < f.nombre; n++, k++) {
      const auCredit = collecte !== !!f.avoir;
      stock.push({
        id: identifiant(k),
        tauxTvaId: TAUX.id,
        compteId: `c${f.compteTva.slice(0, 4)}`,
        debit: auCredit ? 0 : f.tva,
        credit: auCredit ? f.tva : 0,
        compte: { numero: f.compteTva },
        ecritureId: `e${k}`,
        tauxTva: { taux: TAUX.taux },
        ecriture: { date: jour(f.date), statut: 'VALIDEE', facture: null, lignes: f.lignes },
      });
    }
  }
  return stock;
}

const MARS = jour('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');

/*
  Le dossier · quatre exercices, 1 550 lignes de TVA, et chaque famille passe
  par un chemin de datation différent.
*/
const FAMILLES: Famille[] = [
  // Achats de BIENS de 2023 · exigibles à la facture, délai expiré le
  // 31 décembre 2024 · ils ne comptent qu'à la déchéance.
  { nombre: 710, compteTva: '44520000', date: '2023-05-10', tva: 1000, lignes: [contrepartie('60110000', 'CLASSE_6', 6250, true)] },
  // Ventes de BIENS de la période · fait générateur.
  { nombre: 300, compteTva: '44310000', date: '2026-03-15', tva: 160, lignes: [contrepartie('70110000', 'CLASSE_7', 1000, false)] },
  // Achats de BIENS de la période.
  { nombre: 250, compteTva: '44520000', date: '2026-03-20', tva: 100, lignes: [contrepartie('60110000', 'CLASSE_6', 625, true)] },
  // SERVICES achetés en 2024, payés le 18 mars 2026 · la déduction naît au
  // paiement (art. 37 al. 1, décret art. 96), donc dans cette déclaration.
  {
    nombre: 120,
    compteTva: '44540000',
    date: '2024-11-10',
    tva: 50,
    lignes: [contrepartie('63240000', 'CLASSE_6', 312.5, true), tiersLettre('40110000', 362.5, false, '2024-11-10', '2026-03-18')],
  },
  // SERVICES vendus en 2025, encaissés le 5 mars 2026 · exigibles ce jour-là
  // (art. 25, 2°).
  {
    nombre: 80,
    compteTva: '44320000',
    date: '2025-06-10',
    tva: 200,
    lignes: [contrepartie('70610000', 'CLASSE_7', 1250, false), tiersLettre('41110000', 1450, true, '2025-06-10', '2026-03-05')],
  },
  // Avoirs sur ventes de 2025, sans aucune liquidation antérieure · rendus à
  // part, jamais imputés (art. 52).
  { nombre: 50, compteTva: '44310000', date: '2025-02-01', tva: 300, avoir: true, lignes: [] },
  // SERVICES de la période d'un fournisseur AUTORISÉ AUX DÉBITS (art. 26),
  // payés en avril · sa taxe est exigible à la facture (décret art. 61), et la
  // déduction avec elle. C'est le TIERS de la contrepartie qui le dit.
  {
    nombre: 40,
    compteTva: '44540000',
    date: '2026-03-12',
    tva: 25,
    lignes: [
      contrepartie('63240000', 'CLASSE_6', 156.25, true),
      tiersLettre('40110000', 181.25, false, '2026-03-12', '2026-04-05', {
        autoriseTvaDebits: true,
        referenceAutorisationDebits: 'DGI/2025/017',
      }),
    ],
  },
];

describe('Déclaration de TVA · la lecture par tranches (audit final F188)', () => {
  it('aucun appel ne rend plus d’une tranche, et chaque appel en demande une', async () => {
    const stock = dossier(FAMILLES);
    expect(stock.length).toBeGreaterThan(3 * LOT_ECRITURES);
    const { service, appels } = monter(stock);
    await service.declaration('t1', MARS, FIN_MARS);
    const lecture = appels.filter((a) => a.requete.where?.compte?.OR);
    expect(lecture.length).toBe(Math.ceil(stock.length / LOT_ECRITURES));
    exigerUnePaginationExacte(lecture, LOT_ECRITURES);
    // Les colonnes lues, et l'identifiant qui porte le curseur.
    expect(lecture[0].requete.select.id).toBe(true);
  });

  it('rend l’objet ENTIER de la lecture d’un bloc · mêmes montants, mêmes mentions, même ordre des comptes', async () => {
    const stock = dossier(FAMILLES);
    const parTranches = await monter(stock).service.declaration('t1', MARS, FIN_MARS);
    const enUnBloc = await monter(stock, 'SYSCOHADA', true).service.declaration('t1', MARS, FIN_MARS);
    expect(parTranches).toEqual(enUnBloc);
  });

  it('rend le résultat de la lecture d’un bloc, au centime', async () => {
    const { service } = monter(dossier(FAMILLES));
    const d = await service.declaration('t1', MARS, FIN_MARS);
    // Ventes de biens de mars (300 × 160) et services encaissés en mars (80 × 200).
    expect(d.totalCollecte).toBe(64_000);
    // Achats de biens de mars (250 × 100), services de 2024 payés en mars
    // (120 × 50), services aux débits facturés en mars (40 × 25).
    expect(d.totalDeductible).toBe(32_000);
    expect(d.tvaDeductibleDechue).toBe(710_000);
    expect(d.avoirsCollecteNonImputes).toBe(15_000);
    expect(d.tvaEnAttenteEncaissement).toBe(0);
    expect(d.prorata.pourcentage).toBe(100);
    expect(d.net).toBe(32_000);
    // LE CUMUL COMPTE PAR COMPTE · c'est lui que la liquidation solde.
    const parCompte = Object.fromEntries(d.lignes[0].parCompte.map((p) => [p.compteId, p]));
    expect(parCompte.c4431.collecte).toBe(48_000);
    expect(parCompte.c4432.collecte).toBe(16_000);
    expect(parCompte.c4452.deductible).toBe(25_000);
    expect(parCompte.c4454.deductible).toBe(7_000);
  });
});

describe('Prorata de déduction · la TVA collectée de l’année lue par tranches (audit final F188)', () => {
  it('aucun appel ne rend plus d’une tranche, et le numérateur est celui de toute l’année', async () => {
    const annee = { debut: jour('2025-01-01'), fin: new Date('2025-12-31T23:59:59.999Z') };
    const stock: Objet[] = [];
    // 5 200 ventes taxées à 16 % · base de 100 chacune.
    for (let k = 1; k <= 5200; k++) {
      stock.push({
        id: identifiant(k),
        tauxTvaId: TAUX.id,
        credit: 16,
        ecritureId: `e${k}`,
        compte: { numero: '44310000' },
        tauxTva: { taux: 16 },
        ecriture: { date: jour('2025-06-10'), statut: 'VALIDEE' },
      });
    }
    // Une livraison à soi-même (4434) · exclue des deux termes (art. 43).
    stock.push({
      id: identifiant(5201),
      tauxTvaId: TAUX.id,
      credit: 16_000,
      ecritureId: 'e-soi',
      compte: { numero: '44340000' },
      tauxTva: { taux: 16 },
      ecriture: { date: jour('2025-07-01'), statut: 'VALIDEE' },
    });
    // Une exportation au taux zéro · sa base est le crédit de classe 7 de son écriture.
    stock.push({
      id: identifiant(5202),
      tauxTvaId: 'tx0',
      credit: 0,
      ecritureId: 'e-export',
      compte: { numero: '44310000' },
      tauxTva: { taux: 0 },
      ecriture: { date: jour('2025-08-01'), statut: 'VALIDEE' },
    });
    // Une vente de 2024, hors de l'année.
    stock.push({
      id: identifiant(5203),
      tauxTvaId: TAUX.id,
      credit: 16_000,
      ecritureId: 'e-2024',
      compte: { numero: '44310000' },
      tauxTva: { taux: 16 },
      ecriture: { date: jour('2024-12-31'), statut: 'VALIDEE' },
    });
    const { service, appels } = monter(stock);
    const p = await service.calculerProrata('t1', annee.debut, annee.fin);
    const lecture = appels.filter((a) => a.requete.where?.compte?.numero?.startsWith === '443');
    expect(lecture.length).toBe(2);
    exigerUnePaginationExacte(lecture, LOT_LECTURE);
    expect(lecture[0].requete.select.id).toBe(true);
    expect(p.numerateur).toBe(521_000);
    // L'étalon · le même prorata lu d'un bloc.
    const enUnBloc = await monter(stock, 'SYSCOHADA', true).service.calculerProrata('t1', annee.debut, annee.fin);
    expect(p).toEqual(enUnBloc);
  });
});
