import { BadRequestException } from '@nestjs/common';
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
  ecriture: { tenantId: string; date: Date; reference: string | null; journal: { code: string } };
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
  extra: Partial<Pick<LigneFausse, 'deviseId' | 'montantDevise' | 'lettre' | 'lettrageId'>> & { reference?: string } = {},
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
    ecriture: { tenantId: 't1', date: new Date('2026-03-01'), reference: extra.reference ?? null, journal: { code: 'ACH' } },
  };
}

function service(lignes: LigneFausse[], options: { lettrable?: boolean } = {}) {
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
  return { service: new LettrageService(prisma as unknown as PrismaService), lignes, groupes };
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

  it('retombe sur l’appariement par montant quand aucune référence ne concorde', async () => {
    const { service: s, groupes } = service([ligne('a', 750, 0), ligne('b', 0, 750)]);
    const r = await s.lettrageAutomatique('t1', 'c1', 'u1');
    expect(r.parPiece).toBe(0);
    expect(r.parMontant).toBe(1);
    expect(groupes[0].origine).toBe('AUTOMATIQUE_MONTANT');
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
    // gain de change (compte 776, ici 10 000 au débit du compte de tiers) qui
    // ramène le groupe à zéro. C'est exactement le cas que vise le CPCC.
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
