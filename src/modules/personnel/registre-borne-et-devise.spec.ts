import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  LOT_CONFRONTATION,
  PLAFOND_CONFRONTATION,
  PLAFOND_REGISTRE_PERSONNEL,
  PersonnelService,
} from './personnel.service';
import { AvancesRubriquesService, PLAFOND_LISTES_PAIE } from './avances-rubriques.service';
import { BAREMES_SERVIS, MOTIF_BAREME_NON_SAISISSABLE, motifRefusVersion } from './baremes-dossier';
import { ContratTravailDto, DeviseRemunerationDto, MOTIF_MONNAIE_REMUNERATION, VersionBaremePaieDto } from './dto/personnel.dto';

/**
 * AUDIT FINAL F226, F227 ET F259 · la monnaie du contrat, le refus de barème
 * qui excluait le SMIG, et les listes du registre sans borne.
 *
 * LES DOUBLURES HONORENT LES FILTRES · `where` (égalité, null compris),
 * `orderBy`, `cursor`, `skip` et `take`. Une doublure qui rend tout ce qu'on
 * lui donne validerait une liste non bornée et une borne mal posée.
 */

type Ligne = Record<string, unknown>;

function correspond(l: Ligne, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => v === undefined || l[k] === v);
}

function trier(lignes: Ligne[], orderBy: unknown): Ligne[] {
  const cles = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Record<string, 'asc' | 'desc'>[];
  return [...lignes].sort((a, b) => {
    for (const o of cles) {
      const [k, sens] = Object.entries(o)[0];
      const x = a[k] as string | number | Date;
      const y = b[k] as string | number | Date;
      if (x < y) return sens === 'asc' ? -1 : 1;
      if (x > y) return sens === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

type ArgsLecture = {
  where?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  skip?: number;
  cursor?: { id: string };
};

function lecture(table: Ligne[]) {
  return jest.fn(async (args: ArgsLecture = {}) => {
    let r = trier(
      table.filter((l) => correspond(l, args.where)),
      args.orderBy,
    );
    if (args.cursor) r = r.slice(r.findIndex((l) => l.id === args.cursor!.id));
    if (args.skip) r = r.slice(args.skip);
    if (args.take !== undefined) r = r.slice(0, args.take);
    return r;
  });
}

function compte(table: Ligne[]) {
  return jest.fn(async (args: { where?: Record<string, unknown> } = {}) => table.filter((l) => correspond(l, args.where)).length);
}

const pad = (n: number, l: number) => String(n).padStart(l, '0');

function contrat(over: Ligne = {}): Ligne {
  return {
    id: 'c-1',
    tenantId: 't1',
    type: 'DUREE_INDETERMINEE',
    constateParEcrit: true,
    dateEntreeEnVigueur: new Date('2026-01-05T00:00:00Z'),
    dateConclusion: new Date('2026-01-02T00:00:00Z'),
    lieuConclusion: 'Kinshasa',
    dateFinPrevue: null,
    ouvrageDetermine: null,
    motifRemplacement: null,
    emploiPermanent: true,
    natureTravail: 'Gardiennage',
    lieuExecution: 'Kinshasa',
    categorieProfessionnelle: null,
    classeProfessionnelle: 1,
    periodiciteRemuneration: 'MOIS',
    manoeuvreSansSpecialite: false,
    remunerationBase: 1000,
    deviseRemuneration: 'USD',
    avantagesConvenus: 'Transport',
    clauseEssai: false,
    essaiConstateParEcrit: false,
    essaiDureeJours: null,
    dureePreavisJours: 14,
    viseParOnem: true,
    dateVisaOnem: null,
    renouvelleDeId: null,
    dateFin: null,
    motifFin: null,
    ...over,
  };
}

function salarie(over: Ligne = {}): Ligne {
  return {
    id: 's-1',
    tenantId: 't1',
    matricule: null,
    nom: 'Mukendi',
    postNom: 'Tshibangu',
    prenoms: 'Jean',
    sexe: 'MASCULIN',
    numeroAffiliationCnss: 'CNSS-0099',
    dateNaissance: new Date('1990-04-12T00:00:00Z'),
    millesimeNaissance: null,
    lieuNaissance: 'Mbuji-Mayi',
    nationalite: 'Congolaise',
    nomConjoint: null,
    aptitudeConstateeLe: new Date('2026-01-02T00:00:00Z'),
    aptitudeProvisoire: false,
    declarationEngagementLe: new Date('2026-01-10T00:00:00Z'),
    declarationDepartLe: null,
    actif: true,
    enfants: [],
    contrats: [contrat()],
    ...over,
  };
}

function monterPersonnel(salaries: Ligne[], contrats: Ligne[] = []) {
  const salarieFindMany = lecture(salaries);
  const salarieCount = compte(salaries);
  const create = jest.fn(async (args: { data: Ligne }) => ({ id: 'c-neuf', ...args.data }));
  const updateMany = jest.fn(async (args: { where: Ligne; data: Ligne }) => {
    const touches = contrats.filter((c) => correspond(c, args.where));
    for (const c of touches) Object.assign(c, args.data);
    return { count: touches.length };
  });
  // L'écriture UNITAIRE honore tout son filtre, condition « encore nulle »
  // comprise, et rend l'erreur de Prisma quand rien n'y répond.
  const update = jest.fn(async (args: { where: Ligne; data: Ligne }) => {
    const c = contrats.find((x) => correspond(x, args.where));
    if (!c) {
      throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: '5' });
    }
    Object.assign(c, args.data);
    return { ...c };
  });
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn(async () => ({ nom: 'ASBL Bomoko', numeroAffiliationCnssEmployeur: 'CNSS-EMP-4471' })),
    },
    versionBaremePaie: { findMany: jest.fn(async () => []) },
    salarie: {
      findMany: salarieFindMany,
      count: salarieCount,
      findFirst: jest.fn(async (args: { where: Ligne }) => salaries.find((s) => correspond(s, args.where)) ?? null),
    },
    contratTravail: {
      findFirst: jest.fn(async (args: { where: Ligne }) => {
        const c = contrats.find((x) => correspond(x, args.where));
        return c ? { ...c } : null;
      }),
      updateMany,
      update,
      create,
    },
  };
  return { svc: new PersonnelService(prisma as never), salarieFindMany, salarieCount, create, updateMany, update, prisma };
}

const AUJOURDHUI = new Date('2026-03-15T10:00:00Z');

describe('F226 · la monnaie du contrat, jusqu’à la confrontation', () => {
  it('un salaire en dollars n’est jamais « en deçà » d’un minimum en francs', async () => {
    // 1 000 USD par mois lus comme 1 000 FC passaient très en deçà des
    // 559 000 FC de la classe 1 en janvier 2026.
    const { svc } = monterPersonnel([salarie()]);
    const r = await svc.confronter('t1', AUJOURDHUI);
    const v = r.fiches[0].remunerationMinimale;
    expect(v.conforme).toBeNull();
    expect(v.abstention).toBe('REMUNERATION_HORS_FRANC');
    expect(v.convenueFc).toBeNull();
    expect(v.manqueFc).toBeNull();
  });

  it('sans monnaie déclarée, le contrôle s’abstient et le dit', async () => {
    const { svc } = monterPersonnel([salarie({ contrats: [contrat({ deviseRemuneration: null })] })]);
    const v = (await svc.confronter('t1', AUJOURDHUI)).fiches[0].remunerationMinimale;
    expect(v.conforme).toBeNull();
    expect(v.abstention).toBe('DEVISE_NON_RENSEIGNEE');
  });

  it('en francs, le contrôle mord toujours', async () => {
    const { svc } = monterPersonnel([salarie({ contrats: [contrat({ deviseRemuneration: 'CDF' })] })]);
    const r = await svc.confronter('t1', AUJOURDHUI);
    expect(r.fiches[0].remunerationMinimale.conforme).toBe(false);
    expect(r.fiches[0].remunerationMinimale.manqueFc).toBe(559_000 - 1000);
  });

  it('la création du contrat écrit la monnaie, et null quand elle n’est pas dite', async () => {
    const { svc, create } = monterPersonnel([salarie()]);
    await svc.creerContrat('t1', 'u-1', 's-1', {
      type: 'DUREE_INDETERMINEE',
      dateEntreeEnVigueur: '2026-01-05',
      remunerationBase: 1000,
      deviseRemuneration: 'USD',
    } as never);
    expect(create.mock.calls[0][0].data.deviseRemuneration).toBe('USD');
    await svc.creerContrat('t1', 'u-1', 's-1', { type: 'DUREE_INDETERMINEE', dateEntreeEnVigueur: '2026-01-05' } as never);
    expect(create.mock.calls[1][0].data.deviseRemuneration).toBeNull();
  });

  describe('déclarer la monnaie d’un contrat saisi sans elle', () => {
    it('la complète quand elle manque', async () => {
      const lignes = [contrat({ deviseRemuneration: null })];
      const { svc } = monterPersonnel([], lignes);
      const r = await svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF');
      expect(lignes[0].deviseRemuneration).toBe('CDF');
      expect(r).toMatchObject({ id: 'c-1', deviseRemuneration: 'CDF' });
    });

    it('ne change jamais une monnaie déjà déclarée', async () => {
      const lignes = [contrat({ deviseRemuneration: 'CDF' })];
      const { svc, updateMany, update } = monterPersonnel([], lignes);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'USD')).rejects.toBeInstanceOf(ConflictException);
      expect(lignes[0].deviseRemuneration).toBe('CDF');
      expect(update).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('pose la condition « encore nulle » dans l’écriture même', async () => {
      // Un autre poste a déclaré entre la lecture et l'écriture.
      const lignes = [contrat({ deviseRemuneration: 'USD' })];
      const { svc, prisma, update } = monterPersonnel([], lignes);
      prisma.contratTravail.findFirst.mockResolvedValueOnce({ id: 'c-1', deviseRemuneration: null } as never);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF')).rejects.toBeInstanceOf(ConflictException);
      expect(lignes[0].deviseRemuneration).toBe('USD');
      expect(update.mock.calls[0][0].where).toEqual({ id: 'c-1', tenantId: 't1', deviseRemuneration: null });
    });

    it('écrit par une opération UNITAIRE, que le journal d’audit recopie avant et après', async () => {
      // Relecture adverse de F226 · un `updateMany` ne laisse au journal
      // que son filtre et son compte, et la monnaie déclarée, qui décide si
      // le minimum se contrôle, n'y paraissait pas.
      const lignes = [contrat({ deviseRemuneration: null })];
      const { svc, update, updateMany } = monterPersonnel([], lignes);
      await svc.declarerDeviseRemuneration('t1', 'c-1', 'USD');
      expect(updateMany).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0].data).toEqual({ deviseRemuneration: 'USD' });
    });

    it('une autre erreur de la base remonte telle quelle, jamais en faux conflit', async () => {
      const lignes = [contrat({ deviseRemuneration: null })];
      const { svc, update } = monterPersonnel([], lignes);
      const panne = new Error('connexion perdue');
      update.mockRejectedValueOnce(panne);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF')).rejects.toBe(panne);
    });

    it('une monnaie inconnue est refusée en français, aux deux portes', async () => {
      const complete = await validate(plainToInstance(DeviseRemunerationDto, { deviseRemuneration: 'EUR' }));
      expect(complete.find((e) => e.property === 'deviseRemuneration')?.constraints?.isEnum).toBe(MOTIF_MONNAIE_REMUNERATION);
      const cree = await validate(
        plainToInstance(ContratTravailDto, {
          type: 'DUREE_INDETERMINEE',
          dateEntreeEnVigueur: '2026-01-05',
          deviseRemuneration: 'EUR',
        }),
      );
      expect(cree.find((e) => e.property === 'deviseRemuneration')?.constraints?.isEnum).toBe(MOTIF_MONNAIE_REMUNERATION);
      expect(await validate(plainToInstance(DeviseRemunerationDto, { deviseRemuneration: 'USD' }))).toEqual([]);
    });

    it('un contrat d’un autre dossier n’existe pas', async () => {
      const lignes = [contrat({ tenantId: 't2', deviseRemuneration: null })];
      const { svc } = monterPersonnel([], lignes);
      await expect(svc.declarerDeviseRemuneration('t1', 'c-1', 'CDF')).rejects.toBeInstanceOf(NotFoundException);
      expect(lignes[0].deviseRemuneration).toBeNull();
    });
  });

  describe('la fin du contrat, au journal d’audit comme la monnaie', () => {
    // Relecture de cohérence du lot 5 · la date de fin choisit le mois de
    // référence du contrôle du minimum. Écrite par `updateMany`, elle ne
    // laissait au journal que le filtre et le compte.
    it('écrit la date et le motif de fin par une opération UNITAIRE, bornée au dossier', async () => {
      const lignes = [contrat({ deviseRemuneration: 'CDF' })];
      const { svc, update, updateMany } = monterPersonnel([], lignes);
      const r = await svc.terminerContrat('t1', 'c-1', { dateFin: '2026-06-30', motifFin: ' Démission ' } as never);
      expect(updateMany).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toEqual({
        where: { id: 'c-1', tenantId: 't1' },
        data: { dateFin: new Date('2026-06-30'), motifFin: 'Démission' },
      });
      expect(lignes[0].dateFin).toEqual(new Date('2026-06-30'));
      expect(r).toMatchObject({ id: 'c-1', motifFin: 'Démission' });
    });

    it('un contrat d’un autre dossier n’est pas terminé', async () => {
      const lignes = [contrat({ tenantId: 't2' })];
      const { svc, update } = monterPersonnel([], lignes);
      await expect(svc.terminerContrat('t1', 'c-1', { dateFin: '2026-06-30' } as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
      expect(lignes[0].dateFin).toBeNull();
    });
  });
});

describe('F259 · le registre du personnel, une liste de travail bornée', () => {
  const registre = (n: number, over: (i: number) => Ligne = () => ({})) =>
    Array.from({ length: n }, (_, i) =>
      salarie({ id: `s-${pad(i, 4)}`, nom: `S${pad(i, 4)}`, contrats: [], ...over(i) }),
    );

  it('rend une tranche, et compte le registre ENTIER', async () => {
    const lignes = [...registre(PLAFOND_REGISTRE_PERSONNEL + 1), salarie({ id: 's-inactif', nom: 'Zola', actif: false, contrats: [] })];
    const { svc } = monterPersonnel(lignes);
    const r = await svc.lister('t1');
    expect(r.salaries).toHaveLength(PLAFOND_REGISTRE_PERSONNEL);
    expect(r.total).toBe(PLAFOND_REGISTRE_PERSONNEL + 1);
    expect(r.tronque).toBe(true);
    expect(r.plafond).toBe(PLAFOND_REGISTRE_PERSONNEL);
  });

  it('le total suit le même périmètre que la liste · les inactifs selon la case', async () => {
    const lignes = [...registre(2), salarie({ id: 's-inactif', nom: 'Zola', actif: false, contrats: [] })];
    const { svc } = monterPersonnel(lignes);
    const actifs = await svc.lister('t1');
    expect(actifs.total).toBe(2);
    expect(actifs.tronque).toBe(false);
    const tous = await svc.lister('t1', true);
    expect(tous.total).toBe(3);
    expect(tous.salaries).toHaveLength(3);
    expect(tous.tronque).toBe(false);
  });

  it('le contrat en cours et le nombre de contrats restent servis', async () => {
    const { svc } = monterPersonnel([salarie()]);
    const r = await svc.lister('t1');
    expect(r.salaries[0].contratEnCours).toMatchObject({ id: 'c-1' });
    expect(r.salaries[0].nombreContrats).toBe(1);
  });

  describe('la confrontation, lue par tranches', () => {
    // L'identifiant va à rebours du nom · l'ordre de lecture (par
    // identifiant) n'est pas l'ordre de l'écran (par nom), et une tranche
    // retenue dans l'ordre de lecture garderait les mauvais contrats.
    const n = PLAFOND_CONFRONTATION + 1;
    const lignes = [
      ...Array.from({ length: n }, (_, i) =>
        salarie({
          id: `s-${pad(9999 - i, 4)}`,
          nom: `S${pad(i, 4)}`,
          postNom: null,
          prenoms: null,
          contrats: [contrat({ id: `c-${pad(i, 4)}`, deviseRemuneration: 'CDF' })],
        }),
      ),
      // Un salarié d'un autre dossier · la doublure honore la borne.
      salarie({ id: 's-0000', tenantId: 't2', nom: 'Autre dossier' }),
    ];

    it('rend les premières fiches dans l’ordre du nom, et le dit', async () => {
      const { svc } = monterPersonnel(lignes);
      const r = await svc.confronter('t1', AUJOURDHUI);
      expect(r.fiches).toHaveLength(PLAFOND_CONFRONTATION);
      expect(r.totalFiches).toBe(n);
      expect(r.tronque).toBe(true);
      expect(r.fiches[0].salarie).toBe('S0000');
      expect(r.fiches[PLAFOND_CONFRONTATION - 1].salarie).toBe(`S${pad(PLAFOND_CONFRONTATION - 1, 4)}`);
      expect(r.fiches.some((f) => f.salarie === `S${pad(n - 1, 4)}`)).toBe(false);
    });

    it('compte les signalements sur le registre ENTIER, pas sur la tranche', async () => {
      const { svc } = monterPersonnel(lignes);
      const r = await svc.confronter('t1', AUJOURDHUI);
      // Des contrats identiques · chacun porte le même nombre de signalements
      // (ici, le minimum en deçà de la classe 1).
      const f = r.fiches[0];
      const parFiche =
        f.mentionsManquantes.length +
        f.requalifications.length +
        f.declarations.filter((d) => d.enRetard).length +
        (f.remunerationMinimale.conforme === false ? 1 : 0);
      expect(parFiche).toBeGreaterThan(0);
      expect(r.totalSignalements).toBe(parFiche * n);
    });

    it('lit les salariés par lots bornés, chacun dans le dossier', async () => {
      const { svc, salarieFindMany } = monterPersonnel(lignes);
      await svc.confronter('t1', AUJOURDHUI);
      expect(salarieFindMany.mock.calls.length).toBe(Math.ceil(n / LOT_CONFRONTATION));
      for (const [args] of salarieFindMany.mock.calls) {
        expect(args?.where).toEqual({ tenantId: 't1' });
        expect(args?.take).toBe(LOT_CONFRONTATION);
      }
    });

    it('une liste qui tient dans la borne n’est pas dite tronquée', async () => {
      const { svc } = monterPersonnel([salarie()]);
      const r = await svc.confronter('t1', AUJOURDHUI);
      expect(r.fiches).toHaveLength(1);
      expect(r.totalFiches).toBe(1);
      expect(r.tronque).toBe(false);
    });
  });
});

describe('F259 · rubriques, bulletins modèles et avances, bornés', () => {
  function monter(tables: { rubriques?: Ligne[]; modeles?: Ligne[]; avances?: Ligne[] }) {
    const r = tables.rubriques ?? [];
    const m = tables.modeles ?? [];
    const a = tables.avances ?? [];
    return new AvancesRubriquesService({
      rubriquePaie: { findMany: lecture(r), count: compte(r) },
      modeleBulletin: { findMany: lecture(m), count: compte(m) },
      avanceSalaire: { findMany: lecture(a), count: compte(a) },
    } as never);
  }
  const avance = (i: number, salarieId: string): Ligne => ({
    id: `a-${pad(i, 4)}`,
    tenantId: 't1',
    salarieId,
    salarie: { nom: 'Mukendi', postNom: null, prenoms: null, matricule: null },
    type: 'AVANCE',
    categoriePret: null,
    dateOctroi: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
    montantFc: 100_000,
    retenueMensuelleFc: null,
    objet: 'Rentrée',
    pieceJustificative: 'Reconnaissance',
    retenues: [],
  });

  it('les avances · une tranche, et le total du périmètre demandé', async () => {
    const avances = [
      ...Array.from({ length: PLAFOND_LISTES_PAIE + 1 }, (_, i) => avance(i, 's1')),
      ...Array.from({ length: 3 }, (_, i) => avance(900 + i, 's2')),
    ];
    const s = monter({ avances });
    const tout = await s.listerAvances('t1');
    expect(tout.avances).toHaveLength(PLAFOND_LISTES_PAIE);
    expect(tout.total).toBe(PLAFOND_LISTES_PAIE + 4);
    expect(tout.tronque).toBe(true);
    const duSalarie = await s.listerAvances('t1', 's2');
    expect(duSalarie.avances).toHaveLength(3);
    expect(duSalarie.total).toBe(3);
    expect(duSalarie.tronque).toBe(false);
    // Le solde reste calculé sur chaque ligne rendue.
    expect(duSalarie.avances[0].soldeFc).toBe(100_000);
  });

  it('les rubriques · une tranche, les natures permises toujours servies', async () => {
    const rubriques = Array.from({ length: PLAFOND_LISTES_PAIE + 1 }, (_, i) => ({
      id: `r-${i}`,
      tenantId: 't1',
      code: `R${pad(i, 4)}`,
    }));
    const r = await monter({ rubriques }).listerRubriques('t1');
    expect(r.rubriques).toHaveLength(PLAFOND_LISTES_PAIE);
    expect(r.total).toBe(PLAFOND_LISTES_PAIE + 1);
    expect(r.tronque).toBe(true);
    expect(r.naturesPermises.length).toBeGreaterThan(0);
  });

  it('les bulletins modèles · une tranche qui le dit', async () => {
    const modeles = Array.from({ length: PLAFOND_LISTES_PAIE + 1 }, (_, i) => ({
      id: `m-${i}`,
      tenantId: 't1',
      nom: `M${pad(i, 4)}`,
    }));
    const r = await monter({ modeles }).listerModeles('t1');
    expect(r.modeles).toHaveLength(PLAFOND_LISTES_PAIE);
    expect(r.total).toBe(PLAFOND_LISTES_PAIE + 1);
    expect(r.tronque).toBe(true);
    const court = await monter({ modeles: modeles.slice(0, 2) }).listerModeles('t1');
    expect(court.tronque).toBe(false);
  });
});

describe('F227 · le refus de barème dit ce qui se saisit, SMIG compris', () => {
  it('nomme chaque barème servi parmi ceux qui se saisissent', () => {
    const motif = motifRefusVersion({ bareme: 'IRPP', aPartirDu: '2027-01-01', reference: 'Loi n° 99/2027', valeurs: {} }, []);
    expect(motif).toBe(MOTIF_BAREME_NON_SAISISSABLE);
    // La première phrase est celle de ce qui SE SAISIT · le SMIG y est.
    const seSaisit = MOTIF_BAREME_NON_SAISISSABLE.split(' · ')[0];
    for (const b of BAREMES_SERVIS) expect(seSaisit).toContain(b);
    expect(MOTIF_BAREME_NON_SAISISSABLE).toContain("barème de l'IRPP");
  });

  it('le corps de la requête reçoit le même refus, en français', async () => {
    const dto = plainToInstance(VersionBaremePaieDto, {
      bareme: 'IRPP',
      aPartirDu: '2027-01-01',
      reference: 'Loi n° 99/2027',
      valeurs: {},
    });
    const erreurs = await validate(dto);
    const bareme = erreurs.find((e) => e.property === 'bareme');
    expect(bareme?.constraints?.isEnum).toBe(MOTIF_BAREME_NON_SAISISSABLE);
    // Et un barème servi passe la même porte.
    const smig = plainToInstance(VersionBaremePaieDto, {
      bareme: 'SMIG',
      aPartirDu: '2027-01-01',
      reference: 'Arrêté n° 99/2027',
      valeurs: { smigJournalierFc: 25_000 },
    });
    expect((await validate(smig)).find((e) => e.property === 'bareme')).toBeUndefined();
  });
});
