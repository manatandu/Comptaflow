import { StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService, donneesLigneSaisie, type MemoireControles } from './ecriture.service';
import { contrevaleur, coursDeLaLigne, motifRefusLigneEnDevise, porteUneDevise } from './ligne-en-devise';
import { ImportService } from '../import/import.service';
import { TypeImport } from '../import/dto/import.dto';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F49 · aucune porte n'écrivait la devise d'une ligne · la
 * réévaluation de clôture ne trouvait aucune position, l'écart de change
 * réalisé du lettrage ne naissait jamais. Désormais la grille et l'import la
 * portent, et le serveur la vérifie · devise du dossier, jamais la monnaie de
 * tenue, et un montant de ligne qui est la contrevaleur au cours appliqué.
 */

const USD = { id: 'usd', code: 'USD' };

describe('F49 · la règle d’une ligne en devise', () => {
  it('une ligne sans aucun des trois champs n’est pas en devise, et rien ne lui est demandé', () => {
    expect(porteUneDevise({ debit: 100 })).toBe(false);
    expect(motifRefusLigneEnDevise({ debit: 100 }, undefined)).toBeNull();
    expect(porteUneDevise({ debit: 100, montantDevise: 10 })).toBe(true);
    expect(porteUneDevise({ debit: 100, coursApplique: 2800 })).toBe(true);
  });

  it('un montant en devise ou un cours sans devise nommée est refusé', () => {
    expect(motifRefusLigneEnDevise({ debit: 2800, montantDevise: 1 }, undefined)).toMatch(/nomme aussi sa devise/);
  });

  it('une devise que le dossier ne connaît pas est refusée', () => {
    expect(motifRefusLigneEnDevise({ debit: 2800, deviseId: 'ailleurs', montantDevise: 1 }, undefined)).toMatch(/introuvable/);
  });

  it('la monnaie de tenue n’est pas une devise · une ligne en francs ne porte ni devise ni cours', () => {
    expect(motifRefusLigneEnDevise({ debit: 2800, deviseId: 'cdf', montantDevise: 2800 }, { code: 'cdf' })).toMatch(
      /CDF est la monnaie de tenue/,
    );
  });

  it('le montant en devise est positif, et la ligne porte aussi son montant en francs', () => {
    expect(motifRefusLigneEnDevise({ debit: 2800, deviseId: 'usd', montantDevise: 0 }, USD)).toMatch(/positif/);
    expect(motifRefusLigneEnDevise({ debit: 2800, deviseId: 'usd', montantDevise: -1 }, USD)).toMatch(/positif/);
    expect(motifRefusLigneEnDevise({ debit: 2800, deviseId: 'usd' }, USD)).toMatch(/positif/);
    expect(motifRefusLigneEnDevise({ debit: 0, credit: 0, deviseId: 'usd', montantDevise: 1 }, USD)).toMatch(
      /monnaie de tenue/,
    );
  });

  it('un cours saisi doit rendre le montant de la ligne, au centime, débit ou crédit', () => {
    expect(motifRefusLigneEnDevise({ debit: 280_000, deviseId: 'usd', montantDevise: 100, coursApplique: 2800 }, USD)).toBeNull();
    expect(motifRefusLigneEnDevise({ credit: 280_000, deviseId: 'usd', montantDevise: 100, coursApplique: 2800 }, USD)).toBeNull();
    expect(
      motifRefusLigneEnDevise({ debit: 280_100, deviseId: 'usd', montantDevise: 100, coursApplique: 2800 }, USD),
    ).toMatch(/100 USD au cours de 2800 font 280000 CDF, et la ligne porte 280100.*AUDCIF art\. 52/);
    expect(motifRefusLigneEnDevise({ debit: 280_000, deviseId: 'usd', montantDevise: 100, coursApplique: 0 }, USD)).toMatch(
      /cours .* positif/,
    );
  });

  it('un cours déduit, relu à la retouche de la pièce, passe encore sur un gros montant', () => {
    // 1 000 000,37 USD pour 2 853 456 789,13 FC · le cours gardé à six
    // décimales s'écarte de près de 0,3 FC du produit exact.
    const ligne = { debit: 2_853_456_789.13, deviseId: 'usd', montantDevise: 1_000_000.37 };
    const cours = coursDeLaLigne(ligne)!;
    expect(Math.abs(contrevaleur(ligne.montantDevise, cours) - ligne.debit)).toBeGreaterThan(0.01);
    expect(motifRefusLigneEnDevise({ ...ligne, coursApplique: cours }, USD)).toBeNull();
  });

  it('le cours enregistré est celui saisi, sinon celui que les deux montants définissent', () => {
    expect(coursDeLaLigne({ debit: 280_000, deviseId: 'usd', montantDevise: 100, coursApplique: 2800 })).toBe(2800);
    // Le saisi prime, même quand les deux montants en définiraient un autre à l'arrondi près.
    expect(coursDeLaLigne({ debit: 285_050, deviseId: 'usd', montantDevise: 100, coursApplique: 2850.5001 })).toBe(2850.5001);
    expect(coursDeLaLigne({ credit: 285_050, deviseId: 'usd', montantDevise: 100 })).toBe(2850.5);
    expect(coursDeLaLigne({ debit: 280_000 })).toBeUndefined();
    expect(
      donneesLigneSaisie({ compteId: 'c', debit: 285_050, deviseId: 'usd', montantDevise: 100 } as never, new Map()).coursApplique,
    ).toBe(2850.5);
  });
});

/** Un EcritureService dont les doublures honorent le dossier demandé. */
function serviceEcritures() {
  const devises = [
    { id: 'usd', code: 'USD', tenantId: 't' },
    { id: 'cdf', code: 'CDF', tenantId: 't' },
    { id: 'usd-voisin', code: 'USD', tenantId: 'autre' },
  ];
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        statut: StatutExercice.OUVERT,
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, numero: id, typeCompte: TypeCompteDetailTotal.DETAIL }))),
      ),
    },
    devise: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { tenantId: string } }) =>
        Promise.resolve(devises.filter((d) => d.tenantId === where.tenantId).map(({ id, code }) => ({ id, code }))),
      ),
    },
  };
  const journal = { trouver: jest.fn().mockResolvedValue({ id: 'j', code: 'BQ', estActif: true }) };
  const exercice = { cloturesApplicables: jest.fn().mockResolvedValue([]), verifierEcritureAutorisee: jest.fn() };
  const s = new EcritureService(prisma as never, journal as never, exercice as never, {} as never);
  return { s, prisma };
}

const piece = (enDevise: Record<string, unknown>) => ({
  exerciceId: 'ex',
  journalId: 'j',
  date: new Date('2026-03-10'),
  lignes: [
    { compteId: 'c521', debit: 280_000, credit: 0, ...enDevise },
    { compteId: 'c411', debit: 0, credit: 280_000 },
  ],
  exigerVentilationObligatoire: false,
});

describe('F49 · les contrôles d’entrée vérifient la devise d’une ligne', () => {
  it('une ligne en devise du dossier, cohérente, passe', async () => {
    const { s } = serviceEcritures();
    await expect(s.controlesDEntree('t', piece({ deviseId: 'usd', montantDevise: 100, coursApplique: 2800 }))).resolves.toBeDefined();
  });

  it('la devise d’un autre dossier est refusée, nommant la ligne', async () => {
    const { s, prisma } = serviceEcritures();
    await expect(s.controlesDEntree('t', piece({ deviseId: 'usd-voisin', montantDevise: 100 }))).rejects.toThrow(
      /Ligne 1 · Devise introuvable/,
    );
    expect(prisma.devise.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't' });
  });

  it('la monnaie de tenue et un montant incohérent sont refusés', async () => {
    const { s } = serviceEcritures();
    await expect(s.controlesDEntree('t', piece({ deviseId: 'cdf', montantDevise: 280_000 }))).rejects.toThrow(/monnaie de tenue/);
    await expect(s.controlesDEntree('t', piece({ deviseId: 'usd', montantDevise: 100, coursApplique: 2700 }))).rejects.toThrow(
      /AUDCIF art\. 52/,
    );
  });

  it('une pièce sans devise ne lit pas les devises, et un lot ne les lit qu’une fois', async () => {
    const { s, prisma } = serviceEcritures();
    await s.controlesDEntree('t', piece({}));
    expect(prisma.devise.findMany).not.toHaveBeenCalled();
    const memoire: MemoireControles = new Map();
    await s.controlesDEntree('t', piece({ deviseId: 'usd', montantDevise: 100 }), undefined, memoire);
    await s.controlesDEntree('t', piece({ deviseId: 'usd', montantDevise: 100 }), undefined, memoire);
    expect(prisma.devise.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('F49 · l’import d’écritures porte la devise', () => {
  function serviceImport() {
    const tx = {
      ecriture: {
        aggregate: jest.fn().mockResolvedValue({ _max: { numeroPiece: 0 } }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      ligneEcriture: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't', longueurCompte: 8, referentiel: 'SYSCOHADA' }) },
      exercice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ex',
          statut: 'OUVERT',
          dateDebut: new Date('2026-01-01'),
          dateFin: new Date('2026-12-31'),
        }),
      },
      journal: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'j-od', code: 'OD', type: 'GENERAL', numerotation: 'CONTINUE_JOURNAL' },
          { id: 'j-bq', code: 'BQ', type: 'TRESORERIE', numerotation: 'CONTINUE_JOURNAL' },
        ]),
      },
      compte: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c521', numero: '52110000', typeCompte: 'DETAIL' },
          { id: 'c411', numero: '41110000', typeCompte: 'DETAIL' },
        ]),
      },
      devise: {
        findMany: jest.fn().mockImplementation(({ where }: { where: { tenantId: string } }) =>
          Promise.resolve(where.tenantId === 't' ? [{ id: 'usd', code: 'USD' }] : []),
        ),
      },
      $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
    } as unknown as PrismaService;
    const controlesDEntree = jest.fn().mockResolvedValue({});
    return { svc: new ImportService(prisma, { controlesDEntree } as never), tx, prisma, controlesDEntree };
  }

  const fichier = (lignes: string[]) =>
    Buffer.from(['Date;Journal;Piece;Compte;Libelle;Debit;Credit;Devise;Montant devise;Cours', ...lignes].join('\n'), 'utf8').toString(
      'base64',
    );
  const MAPPING = {
    date: 'Date',
    journal: 'Journal',
    piece: 'Piece',
    numero: 'Compte',
    libelle: 'Libelle',
    debit: 'Debit',
    credit: 'Credit',
    devise: 'Devise',
    montantDevise: 'Montant devise',
    cours: 'Cours',
  };

  it('écrit devise, montant et cours (déduit s’il manque), et les soumet aux contrôles d’entrée', async () => {
    const { svc, tx, prisma, controlesDEntree } = serviceImport();
    const r = await svc.executer('t', 'u', {
      type: TypeImport.ECRITURES,
      nomFichier: 'banque.csv',
      contenuBase64: fichier([
        '2026-03-10;BQ;P1;52110000;Encaissement;285050;0;usd;100;',
        '2026-03-10;BQ;P1;41110000;Encaissement;0;285050;;;',
      ]),
      mapping: MAPPING,
    });
    const lignes = tx.ligneEcriture.createMany.mock.calls.flatMap((c) => c[0].data) as Array<Record<string, unknown>>;
    expect({
      anomalies: r.anomalies,
      enDevise: lignes.map((l) => [l.deviseId ?? null, l.montantDevise ?? null, l.coursApplique ?? null]),
      controlee: controlesDEntree.mock.calls[0][1].lignes[0],
      lecture: (prisma.devise.findMany as jest.Mock).mock.calls[0][0].where,
    }).toEqual({
      anomalies: [],
      enDevise: [
        ['usd', 100, 2850.5],
        [null, null, null],
      ],
      controlee: expect.objectContaining({ deviseId: 'usd', montantDevise: 100 }),
      lecture: { tenantId: 't' },
    });
  });

  it('une devise inconnue du dossier est une anomalie nommée, et la pièce ne part pas', async () => {
    const { svc, tx } = serviceImport();
    const r = await svc.executer('t', 'u', {
      type: TypeImport.ECRITURES,
      nomFichier: 'banque.csv',
      contenuBase64: fichier([
        '2026-03-10;BQ;P1;52110000;Encaissement;285050;0;EUR;100;',
        '2026-03-10;BQ;P1;41110000;Encaissement;0;285050;;;',
      ]),
      mapping: MAPPING,
    });
    expect(r.anomalies.map((a) => a.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Devise « EUR » inconnue du dossier/)]),
    );
    expect(tx.ligneEcriture.createMany).not.toHaveBeenCalled();
  });

  it('un montant en devise sans devise est une anomalie, jamais une ligne en francs', async () => {
    const { svc } = serviceImport();
    const r = await svc.executer('t', 'u', {
      type: TypeImport.ECRITURES,
      nomFichier: 'banque.csv',
      contenuBase64: fichier([
        '2026-03-10;BQ;P1;52110000;Encaissement;285050;0;;100;',
        '2026-03-10;BQ;P1;41110000;Encaissement;0;285050;;;',
      ]),
      mapping: MAPPING,
    });
    expect(r.anomalies.map((a) => a.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Montant en devise ou cours sans devise/)]),
    );
  });

  it('un fichier sans colonne de devise ne lit pas les devises du dossier', async () => {
    const { svc, prisma } = serviceImport();
    const { devise, montantDevise, cours, ...sansDevise } = MAPPING;
    void devise;
    void montantDevise;
    void cours;
    await svc.executer('t', 'u', {
      type: TypeImport.ECRITURES,
      nomFichier: 'banque.csv',
      contenuBase64: fichier([
        '2026-03-10;BQ;P1;52110000;Encaissement;285050;0;;;',
        '2026-03-10;BQ;P1;41110000;Encaissement;0;285050;;;',
      ]),
      mapping: sansDevise,
    });
    expect(prisma.devise.findMany).not.toHaveBeenCalled();
  });
});
