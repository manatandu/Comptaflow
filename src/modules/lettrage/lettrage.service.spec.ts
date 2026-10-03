import { BadRequestException } from '@nestjs/common';
import { OrigineLettrage } from '@prisma/client';
import { LettrageService } from './lettrage.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * Doublure Prisma en mémoire · le lettrage écrit dans une transaction
 * sérialisable, et son comportement (statut du groupe, pose de la lettre,
 * écart de change) ne se voit qu'après écriture. Une doublure qui ne ferait
 * que renvoyer des listes ne testerait rien.
 */
interface LigneFausse {
  id: string;
  compteId: string;
  debit: number;
  credit: number;
  lettre: string | null;
  lettrageId: string | null;
  deviseId: string | null;
  montantDevise: number | null;
  ecriture: {
    tenantId: string;
    date: Date;
    reference: string | null;
    journalId: string;
    journal: { code: string };
    exercice: { statut: 'OUVERT' | 'CLOTURE' };
  };
  libelle: string | null;
}

interface GroupeFaux {
  id: string;
  tenantId: string;
  compteId: string;
  code: string;
  statut: 'PARTIEL' | 'SOLDE';
  solde: number;
  origine: string;
  verrouille: boolean;
  ecartChange: number | null;
  createdAt: Date;
  createdBy: string;
  soldeAt: Date | null;
}

function ligne(
  id: string,
  debit: number,
  credit: number,
  extra: Partial<Pick<LigneFausse, 'deviseId' | 'montantDevise' | 'lettre' | 'lettrageId'>> & {
    reference?: string;
    date?: string;
    exerciceClos?: boolean;
  } = {},
): LigneFausse {
  return {
    id,
    compteId: 'c1',
    debit,
    credit,
    lettre: extra.lettre ?? null,
    lettrageId: extra.lettrageId ?? null,
    deviseId: extra.deviseId ?? null,
    montantDevise: extra.montantDevise ?? null,
    libelle: null,
    ecriture: {
      tenantId: 't1',
      date: new Date(extra.date ?? '2026-03-01'),
      reference: extra.reference ?? null,
      journalId: 'jACH',
      journal: { code: 'ACH' },
      exercice: { statut: extra.exerciceClos ? 'CLOTURE' : 'OUVERT' },
    },
  };
}

interface ClotureFausse {
  granularite: 'PARTIELLE' | 'TOTALE' | 'PERIODE';
  journalId: string | null;
  dateLimite: Date;
}

function service(lignes: LigneFausse[], options: { lettrable?: boolean; clotures?: ClotureFausse[] } = {}) {
  const groupes: GroupeFaux[] = [];
  let seq = 0;

  const filtrer = (where: any) =>
    lignes.filter((l) => {
      if (where?.id?.in && !where.id.in.includes(l.id)) return false;
      if (where?.compteId && l.compteId !== where.compteId) return false;
      if (where?.lettrageId !== undefined) {
        if (where.lettrageId === null && l.lettrageId !== null) return false;
        if (typeof where.lettrageId === 'string' && l.lettrageId !== where.lettrageId) return false;
      }
      if (where?.lettre === null && l.lettre !== null) return false;
      if (where?.lettre?.not === null && l.lettre === null) return false;
      if (typeof where?.lettre === 'string' && l.lettre !== where.lettre) return false;
      if (where?.ecriture?.tenantId && l.ecriture.tenantId !== where.ecriture.tenantId) return false;
      return true;
    });

  const prisma = {
    $transaction: <R>(fn: (tx: unknown) => Promise<R>) => fn(prisma),
    // La doublure honore le filtre `granularite: { not }` · une clôture
    // PARTIELLE ne doit jamais atteindre la règle, et c'est la requête qui
    // l'écarte (exercice/gel-cloture.ts).
    cloture: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve((options.clotures ?? []).filter((c) => c.granularite !== where?.granularite?.not)),
      ),
    },
    compte: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'c1',
        tenantId: 't1',
        numero: '41100000',
        intitule: 'Adhérents',
        lettrable: options.lettrable ?? true,
      }),
    },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(filtrer(where))),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        const cibles = filtrer(where);
        for (const l of cibles) Object.assign(l, data);
        return Promise.resolve({ count: cibles.length });
      }),
    },
    lettrage: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(groupes.filter((g) => (!where?.compteId || g.compteId === where.compteId) && (!where?.tenantId || g.tenantId === where.tenantId))),
      ),
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          groupes.find(
            (g) =>
              (!where.id || g.id === where.id) &&
              (!where.tenantId || g.tenantId === where.tenantId) &&
              (!where.compteId || g.compteId === where.compteId) &&
              (!where.code || g.code === where.code),
          ) ?? null,
        ),
      ),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const g: GroupeFaux = { id: `g${++seq}`, createdAt: new Date(), ...data, solde: Number(data.solde) };
        groupes.push(g);
        return Promise.resolve(g);
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const g = groupes.find((x) => x.id === where.id)!;
        Object.assign(g, data);
        return Promise.resolve(g);
      }),
      delete: jest.fn().mockImplementation(({ where }: any) => {
        const i = groupes.findIndex((x) => x.id === where.id);
        const [g] = groupes.splice(i, 1);
        return Promise.resolve(g);
      }),
    },
  };
  return { service: new LettrageService(prisma as unknown as PrismaService), lignes, groupes, prisma };
}

// ---------------------------------------------------------------------------
// Lettrage partiel · l'apport central du chapitre 6 du CPCC
// ---------------------------------------------------------------------------

describe('Lettrage partiel', () => {
  it('refuse par défaut un groupe dont le solde n’est pas nul, et dit de combien', async () => {
    const { service: s } = service([ligne('a', 1000, 0), ligne('b', 0, 600)]);
    await expect(s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte le partiel quand il est demandé, et laisse les lignes SANS lettre', async () => {
    // « la somme des montants lettrés au débit pouvant être égale, supérieure
    // ou inférieure à celle des montants lettrés au crédit » (CPCC, ch. 6).
    // Les lignes restent ouvertes : c'est ce qui les garde visibles du report
    // à-nouveau Détail, des relances et de la note annexe des créances.
    const { service: s, lignes, groupes } = service([ligne('a', 1000, 0), ligne('b', 0, 600)]);
    const r = await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1', { autoriserPartiel: true });
    expect(r.statut).toBe('PARTIEL');
    expect(r.solde).toBe(400);
    expect(r.lettre).toBe('a'); // minuscule tant que le groupe n'est pas soldé
    expect(lignes.every((l) => l.lettre === null)).toBe(true);
    expect(lignes.every((l) => l.lettrageId === groupes[0].id)).toBe(true);
  });

  it('compléter un partiel jusqu’à zéro le passe SOLDE et pose la lettre sur TOUTES ses lignes', async () => {
    const { service: s, lignes, groupes } = service([ligne('a', 1000, 0), ligne('b', 0, 600), ligne('c', 0, 400)]);
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1', { autoriserPartiel: true });
    const r = await s.completer('t1', groupes[0].id, ['c']);
    expect(r.statut).toBe('SOLDE');
    expect(r.solde).toBe(0);
    expect(r.lettre).toBe('A'); // majuscule une fois soldé
    expect(lignes.map((l) => l.lettre)).toEqual(['A', 'A', 'A']);
  });

  it('un lettrage soldé ne se complète pas', async () => {
    const { service: s, groupes } = service([ligne('a', 500, 0), ligne('b', 0, 500), ligne('c', 100, 0)]);
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1');
    await expect(s.completer('t1', groupes[0].id, ['c'])).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// Comptes lettrables et verrouillage
// ---------------------------------------------------------------------------

describe('Comptes lettrables et verrouillage', () => {
  it('refuse le lettrage sur un compte non déclaré lettrable', async () => {
    const { service: s } = service([ligne('a', 500, 0), ligne('b', 0, 500)], { lettrable: false });
    await expect(s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un lettrage verrouillé ne se défait pas et ne se complète pas', async () => {
    const { service: s, groupes } = service([ligne('a', 1000, 0), ligne('b', 0, 600), ligne('c', 0, 400)]);
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1', { autoriserPartiel: true });
    await s.verrouiller('t1', groupes[0].id, true);
    await expect(s.completer('t1', groupes[0].id, ['c'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.delettrer('t1', 'c1', 'A')).rejects.toBeInstanceOf(BadRequestException);
    await s.verrouiller('t1', groupes[0].id, false);
    await expect(s.completer('t1', groupes[0].id, ['c'])).resolves.toMatchObject({ statut: 'SOLDE' });
  });

  it('délettrer libère les lignes ET supprime le groupe', async () => {
    const { service: s, lignes, groupes } = service([ligne('a', 500, 0), ligne('b', 0, 500)]);
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1');
    const r = await s.delettrer('t1', 'c1', 'A');
    expect(r.nombreLignes).toBe(2);
    expect(lignes.every((l) => l.lettre === null && l.lettrageId === null)).toBe(true);
    expect(groupes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Lettrage automatique · a priori puis a posteriori
// ---------------------------------------------------------------------------

describe('Lettrage automatique', () => {
  it('apparie D’ABORD par référence de pièce, et le trace comme tel', async () => {
    // Deux paires de même montant : sans la passe par référence, le
    // rapprochement 1-pour-1 pourrait apparier la facture F1 au règlement de
    // F2. La référence lève l'ambiguïté, et c'est une donnée saisie, pas une
    // présomption du logiciel.
    const { service: s, groupes } = service([
      ligne('f1', 500, 0, { reference: 'FAC-001' }),
      ligne('f2', 500, 0, { reference: 'FAC-002' }),
      ligne('r2', 0, 500, { reference: 'FAC-002' }),
      ligne('r1', 0, 500, { reference: 'FAC-001' }),
    ]);
    const r = await s.lettrageAutomatique('t1', 'c1', 'u1');
    expect(r.parPiece).toBe(2);
    expect(r.parMontant).toBe(0);
    expect(groupes.every((g) => g.origine === 'AUTOMATIQUE_PIECE')).toBe(true);
    expect(groupes.every((g) => g.statut === 'SOLDE')).toBe(true);
  });

  it('n’apparie pas une référence portée par trois lignes : deviner serait ce qu’on veut éviter', async () => {
    const { service: s } = service([
      ligne('a', 500, 0, { reference: 'FAC-001' }),
      ligne('b', 500, 0, { reference: 'FAC-001' }),
      ligne('c', 0, 500, { reference: 'FAC-001' }),
    ]);
    const r = await s.lettrageAutomatique('t1', 'c1', 'u1');
    expect(r.parPiece).toBe(0);
  });

  // AUDIT FINAL F57 · les groupes sont calculés HORS transaction, et
  // `creerGroupe` réaffectait les lignes sans vérifier qu'elles étaient
  // encore libres · un lettrage concurrent perdait des lignes, et son solde
  // stocké devenait faux.
  it('refuse, sans rien lettrer, une ligne prise par un autre lettrage entre le calcul et la transaction', async () => {
    const { service: s, lignes, groupes, prisma } = service([ligne('a', 750, 0), ligne('b', 0, 750)]);
    const transaction = prisma.$transaction;
    prisma.$transaction = (<R>(fn: (tx: unknown) => Promise<R>) => {
      lignes[1].lettrageId = 'autre';
      return transaction(fn);
    }) as typeof prisma.$transaction;
    await expect(s.lettrageAutomatique('t1', 'c1', 'u1')).rejects.toThrow(/lettrée entre-temps/);
    expect(groupes).toHaveLength(0);
    expect(lignes[0].lettrageId).toBeNull();
  });

  it('refuse une ligne prise entre la lecture et l’écriture du groupe', async () => {
    const { service: s, lignes, prisma } = service([ligne('a', 750, 0), ligne('b', 0, 750)]);
    const creer = prisma.lettrage.create.getMockImplementation()!;
    prisma.lettrage.create.mockImplementation((args: unknown) => {
      lignes[1].lettrageId = 'autre';
      return creer(args);
    });
    await expect(s.lettrageAutomatique('t1', 'c1', 'u1')).rejects.toThrow(/lettrée entre-temps/);
  });

  it('retombe sur l’appariement par montant quand aucune référence ne concorde', async () => {
    const { service: s, groupes } = service([ligne('a', 750, 0), ligne('b', 0, 750)]);
    const r = await s.lettrageAutomatique('t1', 'c1', 'u1');
    expect(r.parPiece).toBe(0);
    expect(r.parMontant).toBe(1);
    expect(groupes[0].origine).toBe('AUTOMATIQUE_MONTANT');
  });

  /**
   * AUDIT FINAL F2 · chaque groupe relisait tous les codes du compte pour
   * trouver la lettre suivante, dans une transaction bornée à cinq secondes ·
   * un lettrage automatique de milliers de groupes échouait entier.
   */
  it('lit la lettre suivante UNE fois pour le lot, et pose un délai à la mesure du lot', async () => {
    const { service: s, groupes, prisma } = service([
      ligne('a', 100, 0), ligne('b', 0, 100),
      ligne('c', 200, 0), ligne('d', 0, 200),
      ligne('e', 300, 0), ligne('f', 0, 300),
    ]);
    const transaction = jest.fn(prisma.$transaction);
    prisma.$transaction = transaction as typeof prisma.$transaction;
    await s.lettrageAutomatique('t1', 'c1', 'u1');
    expect({
      lectures: prisma.lettrage.findMany.mock.calls.length,
      codes: groupes.map((g) => g.code).sort(),
      delai: (transaction.mock.calls[0] as unknown[])[1] as { timeout?: number },
    }).toEqual({ lectures: 1, codes: ['A', 'B', 'C'], delai: expect.objectContaining({ timeout: 10_150 }) });
  });

  it('ne réapparie pas une ligne déjà rattachée à un groupe partiel', async () => {
    const { service: s, groupes } = service([ligne('a', 1000, 0), ligne('b', 0, 600), ligne('c', 0, 400)]);
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1', { autoriserPartiel: true });
    const r = await s.lettrageAutomatique('t1', 'c1', 'u1');
    // Seule 'c' reste libre : rien à apparier avec elle.
    expect(r.groupes).toBe(0);
    expect(groupes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Écart de change réalisé
// ---------------------------------------------------------------------------

describe('Écart de change réalisé au dénouement', () => {
  it('calcule l’écart sur les seules lignes en devise, l’écriture d’écart équilibrant le groupe', async () => {
    // Facture de 100 USD comptabilisée à 250 000 CDF (cours 2 500), réglée
    // quand le dollar vaut 2 600 : 260 000 CDF encaissés. Les deux lignes en
    // devise ne s'équilibrent PAS en monnaie de tenue, et c'est l'écriture de
    // gain de change (ici 10 000 au débit du compte de tiers, contre le 756
    // au SYSCOHADA pour une créance commerciale · ligne A6) qui ramène le
    // groupe à zéro. C'est exactement le cas que vise le CPCC.
    const { service: s, groupes } = service([
      ligne('f', 250000, 0, { deviseId: 'usd', montantDevise: 100 }),
      ligne('r', 0, 260000, { deviseId: 'usd', montantDevise: 100 }),
      ligne('chg', 10000, 0),
    ]);
    await s.lettrerManuel('t1', 'c1', ['f', 'r', 'chg'], 'u1');
    expect(groupes[0].statut).toBe('SOLDE');
    // 250 000 - 260 000 : signé, le sens économique dépendant de la nature du
    // compte (créance ou dette), que le lettrage ne juge pas.
    expect(groupes[0].ecartChange).toBe(-10000);
  });

  it('rend zéro, et non null, quand le cours n’a pas bougé', async () => {
    const { service: s, groupes } = service([
      ligne('f', 250000, 0, { deviseId: 'usd', montantDevise: 100 }),
      ligne('r', 0, 250000, { deviseId: 'usd', montantDevise: 100 }),
    ]);
    await s.lettrerManuel('t1', 'c1', ['f', 'r'], 'u1');
    expect(groupes[0].ecartChange).toBe(0);
  });

  it('laisse l’écart à null quand la créance n’est pas dénouée EN DEVISE', async () => {
    // Règlement partiel de 40 USD sur une facture de 100 USD : la position en
    // devise reste ouverte, il n'y a pas encore d'écart réalisé.
    const { service: s, groupes } = service([
      ligne('f', 250000, 0, { deviseId: 'usd', montantDevise: 100 }),
      ligne('r', 0, 104000, { deviseId: 'usd', montantDevise: 40 }),
      ligne('x', 0, 146000),
    ]);
    await s.lettrerManuel('t1', 'c1', ['f', 'r', 'x'], 'u1');
    expect(groupes[0].statut).toBe('SOLDE');
    expect(groupes[0].ecartChange).toBeNull();
  });

  it('laisse l’écart à null quand aucune ligne n’est en devise · null n’est pas zéro', async () => {
    const { service: s, groupes } = service([ligne('a', 500, 0), ligne('b', 0, 500)]);
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1');
    expect(groupes[0].ecartChange).toBeNull();
  });

  it('laisse l’écart à null quand deux devises se mélangent dans le même groupe', async () => {
    const { service: s, groupes } = service([
      ligne('a', 500, 0, { deviseId: 'usd', montantDevise: 10 }),
      ligne('b', 0, 500, { deviseId: 'eur', montantDevise: 9 }),
    ]);
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1');
    expect(groupes[0].ecartChange).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Écart de change PROPOSÉ (ligne A6) · le cas MBIKAYI du séminaire CPCC,
// TVA corrigée (1 160 USD à 1 680 = 1 948 800 ; 600 USD réglés au coût
// historique de 1 008 000 ; le solde de 560 USD payé au cours de 1 900).
// ---------------------------------------------------------------------------

describe('Écart de change proposé au lettrage', () => {
  const mbikayi = () => [
    ligne('f', 0, 1948800, { deviseId: 'usd', montantDevise: 1160 }),
    ligne('r1', 1008000, 0, { deviseId: 'usd', montantDevise: 600 }),
    ligne('r2', 1064000, 0, { deviseId: 'usd', montantDevise: 560, date: '2027-02-02' }),
  ];

  function avecProposition(referentiel: 'SYSCOHADA' | 'SYCEBNL', lignes = mbikayi(), numero = '40110000') {
    const monte = service(lignes);
    const p = monte.prisma as any;
    p.tenant = { findFirst: jest.fn().mockResolvedValue({ referentiel }) };
    const trouverGroupe = p.lettrage.findFirst.getMockImplementation();
    p.lettrage.findFirst = jest.fn().mockImplementation(async (args: any) => {
      const g = await trouverGroupe(args);
      return g ? { ...g, compte: { id: g.compteId, numero, intitule: 'NZUZI' } } : null;
    });
    const compteDuTiers = p.compte.findFirst.getMockImplementation();
    p.compte.findFirst = jest.fn().mockImplementation(async (args: any) => {
      if (!args?.where?.numero) return compteDuTiers(args);
      return args.where.numero === '65600000' && referentiel === 'SYSCOHADA'
        ? { id: 'c656', numero: '65600000', intitule: 'Pertes de change' }
        : null;
    });
    return monte;
  }

  it('soldé en devise et non en francs · le lettrage plein est refusé en NOMMANT l’écart réalisé', async () => {
    const { service: s } = avecProposition('SYSCOHADA');
    await expect(s.lettrerManuel('t1', 'c1', ['f', 'r1', 'r2'], 'u1')).rejects.toThrow(
      /soldées dans leur devise mais pas en francs · l'écart de 123200.00 est une perte de change réalisé/,
    );
  });

  it('SYSCOHADA · proposé au 656, perte de 123 200, à la date du dernier règlement, sans rien écrire', async () => {
    const { service: s, groupes, lignes } = avecProposition('SYSCOHADA');
    await s.lettrerManuel('t1', 'c1', ['f', 'r1', 'r2'], 'u1', { autoriserPartiel: true });
    const p = await s.propositionEcartChange('t1', groupes[0].id);
    expect(p).toMatchObject({ ecart: 123200, sens: 'PERTE', numeroPrescrit: '65600000', comptePrescrit: { id: 'c656' }, motif: null });
    expect((p as { date: Date }).date).toEqual(new Date('2027-02-02'));
    // Une proposition n'écrit rien · le groupe reste partiel.
    expect(groupes[0].statut).toBe('PARTIEL');
    expect(lignes).toHaveLength(3);
  });

  it('NZUZI · le même dénouement côté client est un gain, proposé au 756', async () => {
    const nzuzi = mbikayi().map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
    const { service: s, groupes } = avecProposition('SYSCOHADA', nzuzi, '41110000');
    await s.lettrerManuel('t1', 'c1', ['f', 'r1', 'r2'], 'u1', { autoriserPartiel: true });
    const p = await s.propositionEcartChange('t1', groupes[0].id);
    expect(p).toMatchObject({ ecart: -123200, sens: 'GAIN', numeroPrescrit: '75600000' });
  });

  it('SYCEBNL · aucun compte proposé, et le motif dit que le texte n’en donne aucun', async () => {
    const { service: s, groupes } = avecProposition('SYCEBNL');
    await s.lettrerManuel('t1', 'c1', ['f', 'r1', 'r2'], 'u1', { autoriserPartiel: true });
    const p = await s.propositionEcartChange('t1', groupes[0].id);
    expect(p).toMatchObject({ ecart: 123200, comptePrescrit: null, numeroPrescrit: null });
    expect(p.motif).toMatch(/ne donne aucun compte/);
  });

  it('pas encore soldé en devise · aucune proposition, et ce n’est pas zéro', async () => {
    const { service: s, groupes } = avecProposition('SYSCOHADA', mbikayi().slice(0, 2));
    await s.lettrerManuel('t1', 'c1', ['f', 'r1'], 'u1', { autoriserPartiel: true });
    const p = await s.propositionEcartChange('t1', groupes[0].id);
    expect(p.ecart).toBeNull();
    expect(p.motif).toMatch(/pas soldé dans sa devise/);
  });

  it('l’écart passé par la pièce du règlement est gardé par le groupe soldé', async () => {
    // Règlement entier de 1 160 USD à 1 750 · le tiers soldé au coût
    // historique, la perte de 81 200 sur sa propre ligne, hors du compte.
    const { service: s, groupes } = service([
      ligne('f', 0, 1948800, { deviseId: 'usd', montantDevise: 1160 }),
      ligne('r', 1948800, 0, { deviseId: 'usd', montantDevise: 1160 }),
    ]);
    await s.lettrerManuel('t1', 'c1', ['f', 'r'], 'u1', { ecartChangeRealise: 81200 });
    expect(groupes[0].ecartChange).toBe(81200);
  });
});

// ---------------------------------------------------------------------------
// Pré-lettrage · « l'une propose, l'autre confirme »
// ---------------------------------------------------------------------------

/** Les groupes réellement POSÉS, relus depuis les lignes · un ensemble d'ensembles. */
const compositions = (lignes: LigneFausse[]) => {
  const par = new Map<string, string[]>();
  for (const l of lignes) {
    if (!l.lettrageId) continue;
    par.set(l.lettrageId, [...(par.get(l.lettrageId) ?? []), l.id]);
  }
  return [...par.values()].map((ids) => ids.sort().join('+')).sort();
};

describe('Pré-lettrage', () => {
  const scene = () => [
    ligne('f1', 500, 0, { reference: 'FAC-001' }),
    ligne('r1', 0, 500, { reference: 'FAC-001' }),
    ligne('d', 750, 0),
    ligne('c', 0, 750),
    ligne('seule', 120, 0),
  ];

  it('N’ÉCRIT RIEN · c’est tout le sens de l’état', async () => {
    // Une proposition qui poserait le lettrage ne serait pas une proposition.
    // Le contrôle porte sur les DEUX écritures que la pose effectue : la
    // création du groupe et le rattachement des lignes.
    const { service: s, prisma, groupes } = service(scene());
    const r = await s.preLettrage('t1', 'c1');
    expect(r.propositions.length).toBeGreaterThan(0);
    expect(prisma.lettrage.create).not.toHaveBeenCalled();
    expect(prisma.ligneEcriture.updateMany).not.toHaveBeenCalled();
    expect(groupes).toHaveLength(0);
  });

  it('propose EXACTEMENT ce que le lettrage automatique poserait · un seul calcul, deux appelants', async () => {
    // Un second calcul écrit à part pour le pré-lettrage aurait divergé du
    // premier au premier correctif, et l'écart n'aurait sauté aux yeux de
    // personne : les deux listes sont plausibles séparément. Ce test est le
    // seul endroit où la divergence se voit.
    const propose = service(scene());
    const pose = service(scene());
    const r = await propose.service.preLettrage('t1', 'c1');
    await pose.service.lettrageAutomatique('t1', 'c1', 'u1');
    expect(r.propositions.map((p) => [...p.ligneIds].sort().join('+')).sort()).toEqual(compositions(pose.lignes));
  });

  it('trace l’origine de chaque proposition, et compte ce qu’il n’a PAS su rapprocher', async () => {
    // Un pré-lettrage qui ne montrerait que ses trouvailles laisserait croire
    // que le reste est rapproché · « seule » n'a pas de contrepartie.
    const { service: s } = service(scene());
    const r = await s.preLettrage('t1', 'c1');
    expect(r.propositions.map((p) => p.origine).sort()).toEqual(['AUTOMATIQUE_MONTANT', 'AUTOMATIQUE_PIECE']);
    expect(r.nonProposees).toBe(1);
    // Chaque proposition est donnée À LIRE, pas seulement à cocher.
    expect(r.propositions.every((p) => p.lignes.length === p.ligneIds.length)).toBe(true);
    expect(r.propositions.every((p) => p.solde === 0)).toBe(true);
  });

  it('la confirmation CONSERVE l’origine proposée', async () => {
    // Elle dit COMMENT le rapprochement a été trouvé, pas qui l'a béni : un
    // groupe issu d'une coïncidence de montants reste AUTOMATIQUE_MONTANT même
    // confirmé à la main, sinon la piste d'audit affirmerait qu'un humain a
    // apparié ces lignes une par une.
    const { service: s, groupes } = service(scene());
    const r = await s.preLettrage('t1', 'c1');
    await s.confirmerPreLettrage(
      't1',
      'c1',
      'u1',
      r.propositions.map((p) => ({ ligneIds: p.ligneIds, origine: p.origine })),
    );
    expect(groupes.map((g) => g.origine).sort()).toEqual(['AUTOMATIQUE_MONTANT', 'AUTOMATIQUE_PIECE']);
    expect(groupes.every((g) => g.statut === 'SOLDE')).toBe(true);
  });

  it('refuse un groupe qui ne solde pas · il ne vient pas d’une proposition', async () => {
    // Les quatre passes n'apparient que des sommes exactement égales.
    // L'accepter poserait un lettrage PARTIEL sous une origine automatique,
    // c'est-à-dire une présomption du logiciel sur une opération que le
    // logiciel n'a jamais proposée.
    const { service: s, groupes } = service(scene());
    await expect(
      s.confirmerPreLettrage('t1', 'c1', 'u1', [
        { ligneIds: ['f1', 'seule'], origine: OrigineLettrage.AUTOMATIQUE_MONTANT },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(groupes).toHaveLength(0);
  });

  it('refuse l’origine MANUEL · un groupe composé à la main passe par le lettrage manuel', async () => {
    const { service: s } = service(scene());
    await expect(
      s.confirmerPreLettrage('t1', 'c1', 'u1', [{ ligneIds: ['f1', 'r1'], origine: OrigineLettrage.MANUEL }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une proposition PÉRIMÉE · les lignes ont été lettrées entre-temps', async () => {
    // C'est le cas qui a fait renoncer à stocker les propositions. Le premier
    // utilisateur voit la scène, le second lettre les mêmes lignes autrement,
    // et la confirmation du premier arrive après. Elle est refusée par le
    // contrôle commun, pas par une vérification propre au pré-lettrage.
    const { service: s, groupes } = service(scene());
    const r = await s.preLettrage('t1', 'c1');
    await s.lettrerManuel('t1', 'c1', ['f1', 'r1'], 'u2');
    await expect(
      s.confirmerPreLettrage(
        't1',
        'c1',
        'u1',
        r.propositions.map((p) => ({ ligneIds: p.ligneIds, origine: p.origine })),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Le groupe manuel du second reste seul posé.
    expect(groupes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Point 12 · la clôture totale fige aussi le lettrage (Sage i7)
// ---------------------------------------------------------------------------

describe('Gel du lettrage par la clôture', () => {
  const totale: ClotureFausse = { granularite: 'TOTALE', journalId: 'jACH', dateLimite: new Date('2026-12-31') };

  it('refuse de lettrer une ligne d’un journal clôturé totalement, en nommant le journal', async () => {
    const { service: s } = service([ligne('a', 1000, 0), ligne('b', 0, 1000)], { clotures: [totale] });
    await expect(s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1')).rejects.toThrow(/journal ACH est clôturé totalement/);
  });

  it('laisse lettrer après une clôture PARTIELLE · c’est tout son objet', async () => {
    const partielle: ClotureFausse = { granularite: 'PARTIELLE', journalId: 'jACH', dateLimite: new Date('2026-12-31') };
    const { service: s } = service([ligne('a', 1000, 0), ligne('b', 0, 1000)], { clotures: [partielle] });
    await expect(s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1')).resolves.toMatchObject({ statut: 'SOLDE' });
  });

  it('une clôture totale ne fige pas les lignes postérieures à sa date limite', async () => {
    const { service: s } = service([ligne('a', 1000, 0, { date: '2027-02-01' }), ligne('b', 0, 1000, { date: '2027-02-02' })], {
      clotures: [totale],
    });
    await expect(s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1')).resolves.toMatchObject({ statut: 'SOLDE' });
  });

  it('une clôture de période fige tous les journaux jusqu’à sa date', async () => {
    const periode: ClotureFausse = { granularite: 'PERIODE', journalId: null, dateLimite: new Date('2026-03-31') };
    const { service: s } = service([ligne('a', 1000, 0), ligne('b', 0, 1000, { date: '2026-04-10' })], { clotures: [periode] });
    await expect(s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1')).rejects.toThrow(/période jusqu'au 2026-03-31/);
  });

  it('une ligne d’exercice clôturé ne se lettre plus', async () => {
    const { service: s } = service([ligne('a', 1000, 0, { exerciceClos: true }), ligne('b', 0, 1000)]);
    await expect(s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1')).rejects.toThrow(/exercice est clôturé/);
  });

  it('refuse de délettrer un groupe dont une ligne est devenue figée, et laisse les lignes lettrées', async () => {
    const clotures: ClotureFausse[] = [];
    const { service: s, lignes } = service([ligne('a', 1000, 0), ligne('b', 0, 1000)], { clotures });
    const { lettre } = await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1');
    clotures.push(totale);
    await expect(s.delettrer('t1', 'c1', lettre)).rejects.toThrow(/délettrer/);
    expect(lignes.every((l) => l.lettre === lettre)).toBe(true);
  });

  it('refuse de compléter un partiel dont une ligne ANCIENNE est figée, même si la nouvelle ne l’est pas', async () => {
    const periode: ClotureFausse = { granularite: 'PERIODE', journalId: null, dateLimite: new Date('2026-03-31') };
    const clotures: ClotureFausse[] = [];
    const { service: s, groupes } = service(
      [ligne('a', 1000, 0), ligne('b', 0, 600), ligne('c', 0, 400, { date: '2026-05-01' })],
      { clotures },
    );
    await s.lettrerManuel('t1', 'c1', ['a', 'b'], 'u1', { autoriserPartiel: true });
    clotures.push(periode);
    await expect(s.completer('t1', groupes[0].id, ['c'])).rejects.toThrow(/compléter ce lettrage/);
  });

  it('le lettrage automatique et le pré-lettrage n’apparient pas une ligne figée', async () => {
    const lignesAuto = [ligne('a', 500, 0), ligne('b', 0, 500), ligne('x', 700, 0, { date: '2027-01-15' }), ligne('y', 0, 700, { date: '2027-01-20' })];
    const periode: ClotureFausse = { granularite: 'PERIODE', journalId: null, dateLimite: new Date('2026-12-31') };
    const { service: s } = service(lignesAuto, { clotures: [periode] });
    const pre = await s.preLettrage('t1', 'c1');
    expect(pre.propositions.map((p) => p.ligneIds.sort())).toEqual([['x', 'y']]);
    const auto = await s.lettrageAutomatique('t1', 'c1', 'u1');
    expect(auto.groupes).toBe(1);
    expect(lignesAuto.find((l) => l.id === 'a')!.lettrageId).toBeNull();
  });

  it('la confirmation d’un pré-lettrage rejoue le gel · une clôture a pu survenir entre-temps', async () => {
    const { service: s } = service([ligne('a', 500, 0), ligne('b', 0, 500)], { clotures: [totale] });
    await expect(
      s.confirmerPreLettrage('t1', 'c1', 'u1', [{ ligneIds: ['a', 'b'], origine: OrigineLettrage.AUTOMATIQUE_MONTANT }]),
    ).rejects.toThrow(/figée/);
  });
});
