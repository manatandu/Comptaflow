import { BadRequestException } from '@nestjs/common';
import { AbonnementsService, LOT_ABONNEMENTS_A_FACTURER } from './abonnements/abonnements.service';
import { LicencesSurSiteService } from './licences-sur-site.service';
import { PLAFOND_LISTE_CONSOLE } from './plafond-console';
import { PlateformeService } from './plateforme.service';

/**
 * AUDIT FINAL F260 · la console lisait ses listes sans borne (cabinets,
 * abonnements) ou sous une borne muette (licences sur site), et la
 * facturation relisait la série entière des factures de l'année pour CHAQUE
 * abonnement facturé.
 *
 * LA DOUBLURE HONORE `where`, `orderBy`, `take`, `cursor` et `skip` · une
 * borne se prouve sur ce que la requête RAMÈNE, jamais sur un résultat simulé
 * qui ignorerait la requête (CLAUDE.md, passe F2a). Le cas qui compte est
 * PLAFOND + 1 · en deçà, une liste sans borne et une liste bornée rendent la
 * même chose.
 */

type Ligne = Record<string, unknown> & { id: string };

function table(lignes: Ligne[]) {
  const garde = (l: Ligne, ou?: Record<string, unknown>) =>
    !ou || Object.entries(ou).every(([cle, attendu]) => l[cle] === attendu || (attendu === null && l[cle] == null));
  const findMany = jest.fn(
    async (a: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
      cursor?: { id: string };
      skip?: number;
    } = {}) => {
      let r = lignes.filter((l) => garde(l, a.where));
      if (a.orderBy) {
        const [cle, sens] = Object.entries(a.orderBy)[0];
        r = [...r].sort((x, y) => (String(x[cle]) < String(y[cle]) ? -1 : String(x[cle]) > String(y[cle]) ? 1 : 0) * (sens === 'asc' ? 1 : -1));
      }
      if (a.cursor) r = r.slice(r.findIndex((l) => l.id === a.cursor!.id) + (a.skip ?? 0));
      return a.take === undefined ? r : r.slice(0, a.take);
    },
  );
  const count = jest.fn(async (a: { where?: Record<string, unknown> } = {}) => lignes.filter((l) => garde(l, a.where)).length);
  return { findMany, count };
}

const num = (i: number) => String(i).padStart(4, '0');

describe('F260 · la liste des cabinets est une tranche qui se dit', () => {
  const cabinet = (i: number, combinaison = false): Ligne => ({
    id: `t-${num(i)}`,
    nom: `Cabinet ${num(i)}`,
    referentiel: 'SYSCOHADA',
    jeuEtatsFinanciersSycebnl: null,
    systemeComptableSyscohada: 'NORMAL',
    ville: null,
    pays: null,
    numeroImpot: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    licence: null,
    dossierMere: null,
    plafondCellules: null,
    combinaisonPour: combinaison ? 't-0000' : null,
    _count: { users: 1, ecritures: 0, cellules: 0 },
  });

  it('au-delà du plafond, rend la tranche, le total du périmètre et le dit', async () => {
    const tenants = table([...Array.from({ length: PLAFOND_LISTE_CONSOLE + 1 }, (_, i) => cabinet(i)), cabinet(9999, true)]);
    const s = new PlateformeService({ tenant: tenants } as never, {} as never, {} as never);
    const r = await s.listeCabinets();
    expect(r.cabinets).toHaveLength(PLAFOND_LISTE_CONSOLE);
    // Le dossier de combinaison, technique, n'est compté ni dans la liste ni
    // dans le total · sans quoi l'écran dirait tronquée une liste complète.
    expect(r).toMatchObject({ total: PLAFOND_LISTE_CONSOLE + 1, tronque: true, plafond: PLAFOND_LISTE_CONSOLE });
    expect(r.cabinets[0].nom).toBe('Cabinet 0000');
    expect(tenants.count).toHaveBeenCalledWith({ where: { combinaisonPour: null } });
  });

  it('en deçà, la liste est entière et ne se dit pas tronquée', async () => {
    const s = new PlateformeService({ tenant: table([cabinet(1), cabinet(2), cabinet(3, true)]) } as never, {} as never, {} as never);
    const r = await s.listeCabinets();
    expect(r.cabinets.map((c) => c.nom)).toEqual(['Cabinet 0001', 'Cabinet 0002']);
    expect(r).toMatchObject({ total: 2, tronque: false });
  });
});

describe('F260 · la liste des abonnements est une tranche qui se dit', () => {
  const abonnement = (i: number): Ligne => ({
    id: `a-${num(i)}`,
    cabinetId: `t-${num(i)}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    cabinet: { nom: `Cabinet ${num(i)}`, licence: null },
    formule: { code: 'ESSENTIEL', libelle: 'Essentiel' },
    options: [],
    dossiersSupplementaires: 0,
    periodicite: 'MENSUELLE',
    debut: new Date('2026-01-01T00:00:00Z'),
    finEssai: null,
    tiers: { nom: 'Client' },
    actif: true,
    factures: [],
  });

  it('au-delà du plafond, rend la tranche et le total', async () => {
    const t = table(Array.from({ length: PLAFOND_LISTE_CONSOLE + 1 }, (_, i) => abonnement(i)));
    const s = new AbonnementsService({ abonnementCabinet: t } as never, {} as never, {} as never);
    const r = await s.lister();
    expect(r.abonnements).toHaveLength(PLAFOND_LISTE_CONSOLE);
    expect(r).toMatchObject({ total: PLAFOND_LISTE_CONSOLE + 1, tronque: true });
    // Les premiers souscrits · l'ordre d'avant est gardé.
    expect(r.abonnements[0].cabinet).toBe('Cabinet 0000');
  });

  it('en deçà, entière', async () => {
    const s = new AbonnementsService({ abonnementCabinet: table([abonnement(1)]) } as never, {} as never, {} as never);
    expect(await s.lister()).toMatchObject({ total: 1, tronque: false });
  });
});

describe('F260 · le registre des licences sur site dit sa tranche', () => {
  const licence = (i: number): Ligne => ({ id: `l-${num(i)}`, numero: `OMX-2026-${num(i)}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });

  it('la borne existait, muette · elle se dit désormais, le total compté par la base', async () => {
    const t = table(Array.from({ length: PLAFOND_LISTE_CONSOLE + 1 }, (_, i) => licence(i)));
    const s = new LicencesSurSiteService({ licenceSurSiteEmise: t } as never, {}, null);
    const r = await s.lister();
    expect(r.licences).toHaveLength(PLAFOND_LISTE_CONSOLE);
    expect(r).toMatchObject({ total: PLAFOND_LISTE_CONSOLE + 1, tronque: true });
    // Les plus récentes d'abord, comme avant.
    expect(r.licences[0].numero).toBe(`OMX-2026-${num(PLAFOND_LISTE_CONSOLE)}`);
  });
});

describe('F260 · la facturation lit la série une fois, et le parc par tranches', () => {
  const EDITEUR = 'vmg';
  const F = (prix: number | null) => ({
    id: 'f', code: 'ESSENTIEL', libelle: 'Essentiel', type: 'FORMULE',
    prixMensuelUsd: prix === null ? null : { toString: () => String(prix), valueOf: () => prix },
    prixAnnuelUsd: null,
  });
  // Un abonnement facturable dans CHAQUE tranche · le premier et le dernier.
  const facturables = new Set([0, LOT_ABONNEMENTS_A_FACTURER]);
  const abonnements = Array.from({ length: LOT_ABONNEMENTS_A_FACTURER + 1 }, (_, i): Ligne => ({
    id: `a-${num(i)}`,
    tiersId: 'cli',
    cabinet: { nom: `Cabinet ${num(i)}` },
    formule: F(facturables.has(i) ? 20 : null),
    options: [],
    dossiersSupplementaires: 0,
    periodicite: 'MENSUELLE',
    debut: new Date('2026-10-01T00:00:00Z'),
    finEssai: null,
    actif: true,
    factures: [],
  }));

  function monde() {
    const parc = table(abonnements);
    const serie = jest.fn(async () => [{ numeroSerie: 'VMG-2026-0003' }]);
    const numeros: string[] = [];
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn(async () => ({ assujettiTva: false })) },
      coursDevise: { findFirst: jest.fn(async () => ({ cours: 2800 })) },
      abonnementCabinet: parc,
      facture: { findMany: serie },
      factureAbonnement: { create: jest.fn(async () => ({ id: `fa-${numeros.length}` })) },
    };
    const facturation = {
      enregistrer: jest.fn(async (_t: string, dto: { numeroSerie: string }) => {
        numeros.push(dto.numeroSerie);
        return { id: `fac-${numeros.length}` };
      }),
      supprimer: jest.fn(),
    };
    const plateforme = { dossierEditeurId: jest.fn(async () => EDITEUR) };
    return { s: new AbonnementsService(prisma as never, facturation as never, plateforme as never), parc, serie, numeros, facturation };
  }

  it('la série de l’année est lue UNE fois, et les numéros se suivent', async () => {
    const m = monde();
    const r = await m.s.facturer(EDITEUR, '2026-10', '2026-10-31', null);
    expect(m.serie).toHaveBeenCalledTimes(1);
    expect(m.numeros).toEqual(['VMG-2026-0004', 'VMG-2026-0005']);
    expect(r.resultats.filter((x) => x.statut === 'FACTURE').map((x) => x.numero)).toEqual(['VMG-2026-0004', 'VMG-2026-0005']);
  });

  it('un numéro pris entre-temps fait relire la série UNE fois, et la pièce se refait sous le numéro libre', async () => {
    // Une autre facturation, ou une facture saisie à la main dans le dossier
    // de l'éditeur, a pris VMG-2026-0004 après la lecture de la série. La
    // relecture à chaque abonnement couvrait ce cas · le numéro calculé une
    // fois doit le couvrir aussi, sans quoi la facturation entière tombe.
    const m = monde();
    m.serie.mockResolvedValueOnce([{ numeroSerie: 'VMG-2026-0003' }]).mockResolvedValueOnce([
      { numeroSerie: 'VMG-2026-0003' },
      { numeroSerie: 'VMG-2026-0004' },
    ]);
    const enregistrer = m.facturation.enregistrer.getMockImplementation()!;
    m.facturation.enregistrer.mockImplementationOnce(async (_t: string, dto: { numeroSerie: string }) => {
      m.numeros.push(`refusé ${dto.numeroSerie}`);
      throw new BadRequestException(`Le numéro de série « ${dto.numeroSerie} » est déjà porté par une facture de ce sens dans ce dossier.`);
    });
    m.facturation.enregistrer.mockImplementation(enregistrer);
    const r = await m.s.facturer(EDITEUR, '2026-10', '2026-10-31', null);
    expect(m.serie).toHaveBeenCalledTimes(2);
    expect(m.numeros).toEqual(['refusé VMG-2026-0004', 'VMG-2026-0005', 'VMG-2026-0006']);
    expect(r.resultats.filter((x) => x.statut === 'FACTURE').map((x) => x.numero)).toEqual(['VMG-2026-0005', 'VMG-2026-0006']);
  });

  it('un refus qui ne tient pas au numéro remonte tel quel · la série relue n’a pas bougé', async () => {
    const m = monde();
    m.facturation.enregistrer.mockImplementationOnce(async () => {
      throw new BadRequestException('Tiers introuvable dans ce dossier.');
    });
    await expect(m.s.facturer(EDITEUR, '2026-10', '2026-10-31', null)).rejects.toThrow('Tiers introuvable dans ce dossier.');
    expect(m.serie).toHaveBeenCalledTimes(2);
    expect(m.numeros).toEqual([]);
  });

  it('le parc se lit par tranches ordonnées, et aucun abonnement ne se perd entre deux', async () => {
    const m = monde();
    const r = await m.s.facturer(EDITEUR, '2026-10', '2026-10-31', null);
    expect(m.parc.findMany).toHaveBeenCalledTimes(2);
    expect(m.parc.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { id: 'asc' }, take: LOT_ABONNEMENTS_A_FACTURER });
    expect(m.parc.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: `a-${num(LOT_ABONNEMENTS_A_FACTURER - 1)}` }, skip: 1 });
    expect(r.resultats).toHaveLength(LOT_ABONNEMENTS_A_FACTURER + 1);
  });
});
