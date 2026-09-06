import { NumerotationPiece, StatutEcriture } from '@prisma/client';
import { AnalyseJournauxService } from './analyse-journaux.service';
import { PrismaService } from '../../common/prisma.service';
import { perimetreDeLaSequence, trousDeLaSequence } from './sequence-pieces';

/**
 * PALMARÈS DES COMPTES ET ANALYSE DES JOURNAUX.
 *
 * Deux états de relecture, sans texte comptable derrière · le catalogue Sage
 * les NOMME et ne les définit pas. Ce qui se teste n'est donc pas la conformité
 * à une maquette, c'est que chaque décision de lecture soit celle qui est
 * écrite, parce que chacune change le classement ou fabrique une anomalie.
 */

type EcritureStub = {
  id: string;
  journalId: string;
  date: Date;
  numeroPiece: number | null;
  statut?: StatutEcriture;
  estGenereeParCloture?: boolean;
  lignes: Array<{ debit: number; credit: number }>;
};

function service(options: {
  comptes?: Array<{ id: string; numero: string; intitule: string; classe: string }>;
  groupes?: Array<{ compteId: string; debit: number; credit: number; lignes: number }>;
  journaux?: Array<{ id: string; code: string; intitule: string; type: string; numerotation: NumerotationPiece }>;
  ecritures?: EcritureStub[];
}) {
  const prisma = {
    compte: {
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          (options.comptes ?? []).filter((c) =>
            where?.numero?.startsWith ? c.numero.startsWith(where.numero.startsWith) : true,
          ),
        ),
      ),
    },
    ligneEcriture: {
      // Le faux ne SIMULE PAS le filtrage · il n'a aucun moyen de le faire,
      // les agrégats reçus étant déjà des sommes. C'est le FILTRE envoyé qui
      // est vérifié, dans le test dédié · le simuler ici donnerait l'illusion
      // d'un contrôle sans en être un.
      groupBy: jest.fn(() =>
        Promise.resolve(
          (options.groupes ?? []).map((g) => ({
            compteId: g.compteId,
            _sum: { debit: g.debit, credit: g.credit },
            _count: { _all: g.lignes },
          })),
        ),
      ),
    },
    journal: { findMany: jest.fn().mockResolvedValue(options.journaux ?? []) },
    ecriture: {
      findMany: jest.fn().mockResolvedValue(
        (options.ecritures ?? []).map((e) => ({
          id: e.id,
          journalId: e.journalId,
          date: e.date,
          numeroPiece: e.numeroPiece,
          statut: e.statut ?? StatutEcriture.VALIDEE,
          estGenereeParCloture: e.estGenereeParCloture ?? false,
          _count: { lignes: e.lignes.length },
          lignes: e.lignes,
        })),
      ),
    },
  } as unknown as PrismaService;
  return { service: new AnalyseJournauxService(prisma), prisma: prisma as any };
}

const COMPTES = [
  { id: 'c52', numero: '52110000', intitule: 'Banque', classe: 'CLASSE_5' },
  { id: 'c60', numero: '60100000', intitule: 'Achats', classe: 'CLASSE_6' },
  { id: 'c61', numero: '61100000', intitule: 'Transports', classe: 'CLASSE_6' },
];

describe('Palmarès des comptes', () => {
  it('CLASSE SUR LE MOUVEMENT, PAS SUR LE SOLDE', async () => {
    // La banque a encaissé et décaissé 1 000 000 : son solde est nul, son
    // mouvement est le plus lourd du dossier. Classée au solde, elle
    // disparaîtrait du palmarès · c'est pourtant le compte qu'un réviseur veut
    // voir en premier.
    const { service: s } = service({
      comptes: COMPTES,
      groupes: [
        { compteId: 'c52', debit: 500_000, credit: 500_000, lignes: 400 },
        { compteId: 'c60', debit: 300_000, credit: 0, lignes: 12 },
      ],
    });
    const p = await s.palmaresComptes('t1', { exerciceId: 'e1' });
    expect(p.lignes[0].numero).toBe('52110000');
    expect(p.lignes[0].mouvement).toBe(1_000_000);
    expect(p.lignes[0].solde).toBe(0);
  });

  it('la PART CUMULÉE se prend sur le périmètre entier, pas sur la tranche affichée', async () => {
    // Tronqué à un rang, le cumul du premier ne doit pas valoir 100 % · ce
    // serait dire que le palmarès couvre tout le dossier alors qu'il en montre
    // un tiers, et la lecture de Pareto n'aurait plus aucun sens.
    const { service: s } = service({
      comptes: COMPTES,
      groupes: [
        { compteId: 'c52', debit: 500_000, credit: 0, lignes: 5 },
        { compteId: 'c60', debit: 300_000, credit: 0, lignes: 5 },
        { compteId: 'c61', debit: 200_000, credit: 0, lignes: 5 },
      ],
    });
    const p = await s.palmaresComptes('t1', { exerciceId: 'e1', limite: 1 });
    expect(p.lignes).toHaveLength(1);
    expect(p.lignes[0].part).toBe(50);
    expect(p.lignes[0].partCumulee).toBe(50);
    expect(p.total.comptes).toBe(3);
    expect(p.tronque).toBe(true);
  });

  it('EXCLUT LE REPORT À-NOUVEAU, et NE LIT PAS le brouillard par défaut', async () => {
    // Le report n'est pas une activité de l'exercice : l'inclure ferait
    // remonter en tête les comptes de bilan les plus lourds du dossier, année
    // après année, indépendamment de ce qui s'y est passé. Ce test lit le
    // FILTRE envoyé à la base · c'est la seule chose qui décide, et un faux
    // qui rendrait les mêmes lignes dans les deux cas ne le montrerait pas.
    const { service: s, prisma } = service({
      comptes: COMPTES,
      groupes: [{ compteId: 'c60', debit: 1, credit: 0, lignes: 1 }],
    });
    await s.palmaresComptes('t1', { exerciceId: 'e1' });
    const filtre = prisma.ligneEcriture.groupBy.mock.calls[0][0].where.ecriture;
    expect(filtre.estGenereeParCloture).toBe(false);
    expect(filtre.statut).toBe(StatutEcriture.VALIDEE);

    const ouvert = service({ comptes: COMPTES, groupes: [] });
    await ouvert.service.palmaresComptes('t1', { exerciceId: 'e1', inclureBrouillard: true });
    expect(ouvert.prisma.ligneEcriture.groupBy.mock.calls[0][0].where.ecriture.statut).toBeUndefined();
  });
});

describe('Analyse des journaux', () => {
  const journal = (
    code: string,
    numerotation: NumerotationPiece,
    id = code,
  ) => ({ id, code, intitule: `Journal ${code}`, type: 'ACHATS', numerotation });

  const ecr = (
    journalId: string,
    numeroPiece: number | null,
    mois = 0,
    extra: Partial<EcritureStub> = {},
  ): EcritureStub => ({
    id: `${journalId}-${numeroPiece}-${mois}`,
    journalId,
    date: new Date(Date.UTC(2026, mois, 15)),
    numeroPiece,
    lignes: [{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }],
    ...extra,
  });

  it('TROUVE LE TROU d’une numérotation continue par journal', async () => {
    const { service: s } = service({
      journaux: [journal('ACH', NumerotationPiece.CONTINUE_JOURNAL)],
      ecritures: [ecr('ACH', 1), ecr('ACH', 2), ecr('ACH', 5)],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    expect(a.lignes[0].sequence.manquants).toBe(2);
    expect(a.lignes[0].sequence.trous).toEqual([{ de: 3, a: 4 }]);
  });

  it('NE CRIE PAS AU TROU sur une numérotation CONTINUE SUR LE FICHIER', async () => {
    // Le journal des achats porte 1, 3 et le journal des ventes 2, 4. Lus
    // journal par journal, les deux paraissent troués de partout · la séquence
    // du dossier, elle, est parfaite. C'est le contrôle qui FABRIQUE une
    // anomalie (§ 10 bis) : plausible, sourcé, et faux.
    const { service: s } = service({
      journaux: [
        journal('ACH', NumerotationPiece.CONTINUE_FICHIER),
        journal('VEN', NumerotationPiece.CONTINUE_FICHIER),
      ],
      ecritures: [ecr('ACH', 1), ecr('VEN', 2), ecr('ACH', 3), ecr('VEN', 4)],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    for (const l of a.lignes) {
      expect(l.sequence.manquants).toBeNull();
      expect(l.sequence.explication).toContain('TOUS les journaux');
    }
    expect(a.sequenceDuDossier.applicable).toBe(true);
    expect(a.sequenceDuDossier.manquants).toBe(0);
  });

  it('NE CRIE PAS AU TROU au changement de mois sur une numérotation MENSUELLE', async () => {
    // La séquence repart de 1 chaque mois. Lue sur l'exercice, elle
    // « retombe » et chaque redémarrage passe pour un trou géant.
    const { service: s } = service({
      journaux: [journal('ACH', NumerotationPiece.MENSUELLE)],
      ecritures: [ecr('ACH', 1, 0), ecr('ACH', 2, 0), ecr('ACH', 1, 1), ecr('ACH', 2, 1)],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    expect(a.lignes[0].sequence.manquants).toBe(0);
  });

  it('TROUVE le trou À L’INTÉRIEUR d’un mois, que la lecture annuelle MASQUERAIT', async () => {
    // Janvier porte 1 et 2, février porte 1 et 3 · il manque le 2 de février.
    // Lue mois par mois, la séquence le dit. Lue sur l'exercice entier, l'union
    // des numéros vaut {1, 2, 3} et ne montre AUCUN trou : le 2 de janvier
    // bouche celui de février. Une numérotation mensuelle lue à l'année ne
    // fabrique donc pas de fausse anomalie · elle en MASQUE une vraie, ce qui
    // est pire, parce que rien ne le signale.
    const { service: s } = service({
      journaux: [journal('ACH', NumerotationPiece.MENSUELLE)],
      ecritures: [ecr('ACH', 1, 0), ecr('ACH', 2, 0), ecr('ACH', 1, 1), ecr('ACH', 3, 1)],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    expect(a.lignes[0].sequence.trous).toEqual([{ de: 2, a: 2 }]);
    expect(a.lignes[0].sequence.manquants).toBe(1);
  });

  it('NE SE PRONONCE PAS sur une numérotation MANUELLE', async () => {
    // Aucune séquence n'est imposée : inventer un contrôle reprocherait au
    // cabinet une discipline qu'il n'a pas choisie.
    const { service: s } = service({
      journaux: [journal('OD', NumerotationPiece.MANUELLE)],
      ecritures: [ecr('OD', 7), ecr('OD', 99)],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    expect(a.lignes[0].sequence.manquants).toBeNull();
    expect(a.lignes[0].sequence.trous).toEqual([]);
  });

  it('SÉPARE le brouillard et la clôture du travail de saisie', async () => {
    const { service: s } = service({
      journaux: [journal('ACH', NumerotationPiece.CONTINUE_JOURNAL)],
      ecritures: [
        ecr('ACH', 1),
        ecr('ACH', 2, 0, { statut: StatutEcriture.BROUILLARD }),
        ecr('ACH', 3, 0, { estGenereeParCloture: true }),
      ],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    expect(a.lignes[0].nombreEcritures).toBe(3);
    expect(a.lignes[0].enBrouillard).toBe(1);
    expect(a.lignes[0].deCloture).toBe(1);
  });

  it('la séquence du DOSSIER ne mêle pas les journaux qui ne sont pas sur le fichier', async () => {
    // Un journal mensuel repart de 1 : ses numéros entrés dans la séquence du
    // dossier la rendraient illisible, avec des trous et des doublons.
    const { service: s } = service({
      journaux: [
        journal('ACH', NumerotationPiece.CONTINUE_FICHIER),
        journal('OD', NumerotationPiece.MENSUELLE),
      ],
      ecritures: [ecr('ACH', 10), ecr('ACH', 11), ecr('OD', 1), ecr('OD', 2)],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    expect(a.sequenceDuDossier.manquants).toBe(0);
    expect(a.sequenceDuDossier.trous).toEqual([]);
  });

  it('N’AFFICHE AUCUN CONTRÔLE D’ÉQUILIBRE PAR JOURNAL', async () => {
    // Chaque écriture est équilibrée et appartient à un seul journal : débit =
    // crédit y est vrai PAR CONSTRUCTION. Une colonne toujours verte n'apprend
    // rien et apprend à ne plus lire les colonnes. L'absence est figée ici
    // plutôt que laissée à la mémoire de qui relira.
    const { service: s } = service({
      journaux: [journal('ACH', NumerotationPiece.CONTINUE_JOURNAL)],
      ecritures: [ecr('ACH', 1)],
    });
    const a = await s.analyseJournaux('t1', { exerciceId: 'e1' });
    expect(Object.keys(a.lignes[0])).not.toContain('equilibre');
    expect(Object.keys(a.lignes[0])).not.toContain('boucle');
  });
});

describe('Règle de séquence, isolée', () => {
  it('la séquence ne commence PAS forcément à 1', () => {
    // Un dossier repris en cours d'année reprend la numérotation du logiciel
    // précédent. Exiger 1 signalerait à chaque reprise un manque de tout ce
    // qui précède l'entrée dans OmegaX.
    expect(trousDeLaSequence([340, 341, 342])).toEqual([]);
  });

  it('chaque mode de numérotation a SON périmètre', () => {
    expect(perimetreDeLaSequence(NumerotationPiece.CONTINUE_JOURNAL)).toBe('JOURNAL_EXERCICE');
    expect(perimetreDeLaSequence(NumerotationPiece.CONTINUE_FICHIER)).toBe('DOSSIER_EXERCICE');
    expect(perimetreDeLaSequence(NumerotationPiece.MENSUELLE)).toBe('JOURNAL_MOIS');
    expect(perimetreDeLaSequence(NumerotationPiece.MANUELLE)).toBe('AUCUN');
  });
});
