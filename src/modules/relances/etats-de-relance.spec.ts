import { Referentiel, StatutMessage, TypeRelance } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService } from '../courrier/courrier.service';
import { motifRienAReclamer, RelancesService } from './relances.service';
import { LOT_LECTURE } from '../../common/lecture-par-lots';

/**
 * AUDIT FINAL F166 À F169 · CHAQUE ÉTAT DE RELANCE LIT SES PROPRES NIVEAUX,
 * SES PROPRES DATES, ET LES SEULES RELANCES DE LA DETTE OUVERTE.
 *
 * Quatre défauts qui laissaient partir une lettre plausible et fausse, ou n'en
 * laissaient partir aucune sans le dire · l'avis préventif qui annonçait
 * l'échéance au jour même du courrier, le rappel à qui l'on suggérait un avis
 * préventif, l'avis préventif suggéré deux mois avant l'échéance, et le client
 * oublié parce qu'une vieille relance d'une dette soldée bloquait tout.
 *
 * La doublure HONORE les filtres (`type`, `compteId in`, `dateRelance gte`) ·
 * une doublure qui rendrait tout quel que soit le `where` validerait le code
 * d'avant ces corrections (CLAUDE.md, « une doublure qui ne filtre pas valide
 * un code qui ne charge pas »).
 */

const DOSSIER = 'd-1';
const AGENT = 'u-1';
const REF = '2026-10-01';

type Niveau = {
  id: string;
  tenantId: string;
  niveau: number;
  libelle: string;
  type: TypeRelance;
  joursApresEcheance: number;
  modeleTexte: string;
  estActif: boolean;
};

const PREVENTIF: Niveau = {
  id: 'n-1',
  tenantId: DOSSIER,
  niveau: 1,
  libelle: 'Avis préventif',
  type: TypeRelance.PREVENTIVE,
  joursApresEcheance: -7,
  modeleTexte: 'Échéance le {echeance} · lettre du {date}',
  estActif: true,
};
const RAPPEL: Niveau = {
  id: 'n-2',
  tenantId: DOSSIER,
  niveau: 2,
  libelle: 'Premier rappel',
  type: TypeRelance.RAPPEL,
  joursApresEcheance: 15,
  modeleTexte: 'Cher {tiers}, {montant} dû au {date}.',
  estActif: true,
};

function ligne(compte: string, piece: string, echeance: string) {
  return {
    debit: 100_000,
    credit: 0,
    lettre: null,
    libelle: `Facture ${compte}`,
    dateEcheance: new Date(`${echeance}T00:00:00Z`),
    compte: {
      id: `c-${compte}`,
      numero: compte,
      intitule: `Client ${compte}`,
      tiersCompte: {
        tiers: {
          id: `t-${compte}`,
          nom: `Tiers ${compte}`,
          type: 'CLIENT',
          email: null,
          horsRelance: false,
          motifHorsRelance: null,
          horsRelanceDepuis: null,
        },
      },
    },
    ecriture: { date: new Date(`${piece}T00:00:00Z`), libelle: 'Vente' },
  };
}

type RelanceEnBase = { compteId: string; dateRelance: Date; niveauRelance: { niveau: number } };

function service(lignes: ReturnType<typeof ligne>[], niveaux: Niveau[], relances: RelanceEnBase[] = []) {
  const relanceFindMany = jest.fn(
    async (args: { where: { compteId?: { in: string[] }; dateRelance?: { gte: Date } } }) =>
      relances
        .filter((r) => !args.where.compteId || args.where.compteId.in.includes(r.compteId))
        .filter((r) => !args.where.dateRelance || r.dateRelance >= args.where.dateRelance.gte)
        .sort((a, b) => b.dateRelance.getTime() - a.dateRelance.getTime()),
  );
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }),
      findUnique: jest.fn().mockResolvedValue({ nom: 'SARL Kin' }),
    },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    niveauRelance: {
      findFirst: jest.fn(async (args: { where: { id: string } }) => niveaux.find((n) => n.id === args.where.id) ?? null),
      findMany: jest.fn(async (args: { where: { type?: TypeRelance; estActif?: boolean } }) =>
        niveaux
          .filter((n) => args.where.type === undefined || n.type === args.where.type)
          .filter((n) => args.where.estActif === undefined || n.estActif === args.where.estActif)
          .sort((a, b) => b.joursApresEcheance - a.joursApresEcheance),
      ),
    },
    relance: { findMany: relanceFindMany, createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
    compte: {
      findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id) => ({ id, numero: id.replace('c-', ''), intitule: `Client ${id.replace('c-', '')}` })),
      ),
    },
    // L'émission écrit sous un verrou par dossier, dans une transaction
    // (audit final F241) · la doublure joue la transaction sur elle-même.
    $executeRaw: jest.fn(async () => 0),
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  } as unknown as PrismaService;
  const courrier = {
    // La file du lot (audit final F241) · une réponse par message.
    ecrireEnFileSansTenter: jest.fn(async (_tx: unknown, _dossier: string, lot: unknown[]) =>
      lot.map(() => ({ id: 'm-1', statut: StatutMessage.SANS_TRANSPORT, motif: null })),
    ),
  } as unknown as CourrierService;
  return { svc: new RelancesService(prisma, courrier), relanceFindMany };
}

describe('F166 · l’avis préventif annonce l’ÉCHÉANCE, pas la date du courrier', () => {
  it('les deux jeux livrés écrivent « {echeance} » dans leur avis préventif', async () => {
    for (const r of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      const createMany = jest.fn().mockResolvedValue({ count: 3 });
      const prisma = { niveauRelance: { count: jest.fn().mockResolvedValue(0), createMany } } as unknown as PrismaService;
      await new RelancesService(prisma, {} as CourrierService).seedNiveauxDefaut('t1', r);
      const data = createMany.mock.calls[0][0].data as { type: TypeRelance; modeleTexte: string }[];
      const preventif = data.find((n) => n.type === TypeRelance.PREVENTIVE)!;
      // « arrive à terme le … » (SYCEBNL), « viendra à échéance le … »
      // (SYSCOHADA) · la date du terme est l'échéance, jamais le jour du courrier.
      expect(preventif.modeleTexte).toMatch(/(à terme|à échéance) le \{echeance\}/);
    }
  });

  it('la lettre porte l’échéance de la ligne, et le courrier sa propre date', async () => {
    const { svc } = service([ligne('41100001', '2026-09-01', '2026-10-04')], [PREVENTIF]);
    const r = await svc.emettre(DOSSIER, AGENT, { exerciceId: 'ex-1', niveauId: PREVENTIF.id, compteIds: ['c-41100001'], dateReference: REF });
    expect(r.emises).toBe(1);
    expect(r.lettres[0].texte).toBe(
      `Échéance le 04/10/2026 · lettre du ${new Date(REF).toLocaleDateString('fr-FR')}`,
    );
  });
});

describe('F167 · un état ne suggère que ses propres niveaux, et dit ce qu’il n’a pas à réclamer', () => {
  it('un rappel échu de cinq jours ne se voit pas suggérer l’avis préventif', async () => {
    // Échu de 5 jours · le seuil préventif (-7) est « atteint », le rappel (15)
    // ne l'est pas encore. Rien n'est à suggérer dans l'état RAPPEL.
    const { svc } = service([ligne('41100001', '2026-08-01', '2026-09-26')], [PREVENTIF, RAPPEL]);
    const [p] = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RAPPEL, dateReference: REF });
    expect(p.retardMaxJours).toBe(5);
    expect(p.niveauSuggere).toBeNull();
  });

  it('un compte désigné sans rien à réclamer dans cet état est nommé, jamais sauté en silence', async () => {
    // Le 41100002 n'a qu'une échéance future · un rappel n'a rien à lui dire.
    const { svc } = service(
      [ligne('41100001', '2026-06-01', '2026-07-01'), ligne('41100002', '2026-09-20', '2026-11-30')],
      [PREVENTIF, RAPPEL],
    );
    const r = await svc.emettre(DOSSIER, AGENT, {
      exerciceId: 'ex-1',
      niveauId: RAPPEL.id,
      compteIds: ['c-41100001', 'c-41100002'],
      dateReference: REF,
    });
    expect(r.emises).toBe(1);
    expect(r.sansObjet).toEqual([
      { compteId: 'c-41100002', compte: '41100002 · Client 41100002', motif: motifRienAReclamer(TypeRelance.RAPPEL) },
    ]);
  });

  it('le motif dit l’état, pas une phrase passe-partout', () => {
    expect(motifRienAReclamer(TypeRelance.PREVENTIVE)).toContain('à prévenir');
    expect(motifRienAReclamer(TypeRelance.RAPPEL)).toContain('à rappeler');
    expect(motifRienAReclamer(TypeRelance.RELEVE)).toContain('Rien de dû');
  });
});

describe('F168 · l’avis préventif ne part pas deux mois avant l’échéance', () => {
  it('une échéance à soixante jours n’atteint pas le seuil de sept jours', async () => {
    const { svc } = service([ligne('41100001', '2026-09-20', '2026-11-30')], [PREVENTIF]);
    const [p] = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.PREVENTIVE, dateReference: REF });
    expect(p.retardMaxJours).toBe(-60);
    expect(p.niveauSuggere).toBeNull();
  });

  it('une échéance à trois jours l’atteint', async () => {
    const { svc } = service([ligne('41100001', '2026-09-20', '2026-10-04')], [PREVENTIF]);
    const [p] = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.PREVENTIVE, dateReference: REF });
    expect(p.retardMaxJours).toBe(-3);
    expect(p.niveauSuggere).toBe(1);
  });
});

describe('F169 · seules comptent les relances de la dette encore ouverte', () => {
  it('une relance antérieure à la plus ancienne pièce ouverte ne bloque plus la suggestion', async () => {
    // Relance de décembre 2025, pour une dette depuis soldée · la facture
    // ouverte date de juin 2026 et est échue de trois mois.
    const { svc } = service([ligne('41100001', '2026-06-01', '2026-07-01')], [RAPPEL], [
      { compteId: 'c-41100001', dateRelance: new Date('2025-12-01T00:00:00Z'), niveauRelance: { niveau: 2 } },
    ]);
    const [p] = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RAPPEL, dateReference: REF });
    expect(p.derniereRelance).toBeNull();
    expect(p.niveauSuggere).toBe(2);
  });

  it('une relance de la dette ouverte, elle, bloque toujours le même niveau', async () => {
    const { svc } = service([ligne('41100001', '2026-06-01', '2026-07-01')], [RAPPEL], [
      { compteId: 'c-41100001', dateRelance: new Date('2026-08-01T00:00:00Z'), niveauRelance: { niveau: 2 } },
    ]);
    const [p] = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RAPPEL, dateReference: REF });
    expect(p.derniereRelance).toEqual({ niveau: 2, date: '2026-08-01' });
    expect(p.niveauSuggere).toBeNull();
  });

  it('la borne est la PLUS ANCIENNE pièce du compte, pas la plus récente', async () => {
    // Deux factures ouvertes, mars et juin · la relance d'avril porte sur la
    // première, toujours due, et bloque encore le même niveau.
    const { svc } = service(
      [ligne('41100001', '2026-06-01', '2026-07-01'), ligne('41100001', '2026-03-01', '2026-04-01')],
      [RAPPEL],
      [{ compteId: 'c-41100001', dateRelance: new Date('2026-04-15T00:00:00Z'), niveauRelance: { niveau: 2 } }],
    );
    const [p] = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RAPPEL, dateReference: REF });
    expect(p.derniereRelance).toEqual({ niveau: 2, date: '2026-04-15' });
    expect(p.niveauSuggere).toBeNull();
  });

  it('la borne se lit compte par compte · la pièce d’un voisin plus ancien ne la recule pas', async () => {
    // Le 41100001 est ouvert depuis janvier, le 41100002 depuis juin. Une
    // relance du 41100002 datée de mars (dette antérieure, soldée) passe la
    // borne de la LECTURE, prise sur le plus ancien des deux, et doit être
    // écartée par celle du compte.
    const { svc } = service(
      [ligne('41100001', '2026-01-10', '2026-02-10'), ligne('41100002', '2026-06-01', '2026-07-01')],
      [RAPPEL],
      [{ compteId: 'c-41100002', dateRelance: new Date('2026-03-01T00:00:00Z'), niveauRelance: { niveau: 2 } }],
    );
    const positions = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RAPPEL, dateReference: REF });
    const p2 = positions.find((p) => p.compteId === 'c-41100002')!;
    expect(p2.derniereRelance).toBeNull();
    expect(p2.niveauSuggere).toBe(2);
  });

  it('la lecture des relances est bornée aux comptes retenus et à leur plus ancienne pièce', async () => {
    const { svc, relanceFindMany } = service(
      [ligne('41100001', '2026-01-10', '2026-02-10'), ligne('41100002', '2026-06-01', '2026-07-01')],
      [RAPPEL],
    );
    await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RAPPEL, dateReference: REF });
    expect(relanceFindMany).toHaveBeenCalledTimes(1);
    const { where } = relanceFindMany.mock.calls[0][0] as {
      where: { tenantId: string; compteId: { in: string[] }; dateRelance: { gte: Date } };
    };
    expect(where.tenantId).toBe(DOSSIER);
    expect([...where.compteId.in].sort()).toEqual(['c-41100001', 'c-41100002']);
    expect(where.dateRelance.gte.toISOString().slice(0, 10)).toBe('2026-01-10');
  });

  it('sans aucune position, l’historique n’est pas lu du tout', async () => {
    const { svc, relanceFindMany } = service([], [RAPPEL]);
    expect(await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RAPPEL, dateReference: REF })).toEqual([]);
    expect(relanceFindMany).not.toHaveBeenCalled();
  });
});

describe('F185 · les positions se lisent par tranches, et aucune ligne ne se perd entre deux', () => {
  it('la requête pagine par identifiant, et le montant dû porte les lignes de toutes les tranches', async () => {
    // Un lot entier plus deux lignes · la troisième tranche n'existe que si
    // le curseur avance. Une lecture d'un seul tenant ne ferait qu'un appel.
    const toutes = Array.from({ length: LOT_LECTURE + 2 }, (_, i) => ({
      ...ligne('41100001', '2026-09-01', '2026-09-15'),
      id: `l-${String(i).padStart(6, '0')}`,
    }));
    const { svc } = service([], [PREVENTIF]);
    const findMany = jest.fn(async (args: { take: number; cursor?: { id: string }; skip?: number }) => {
      const debut = args.cursor ? toutes.findIndex((l) => l.id === args.cursor!.id) + (args.skip ?? 0) : 0;
      return toutes.slice(debut, debut + args.take);
    });
    (svc as unknown as { prisma: { ligneEcriture: { findMany: unknown } } }).prisma.ligneEcriture.findMany = findMany;
    const [p] = await svc.positions(DOSSIER, { exerciceId: 'ex-1', type: TypeRelance.RELEVE, dateReference: REF });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0]).toMatchObject({ orderBy: { id: 'asc' }, take: LOT_LECTURE });
    expect(p.lignes).toHaveLength(LOT_LECTURE + 2);
    expect(p.montantDu).toBe((LOT_LECTURE + 2) * 100_000);
  });
});
