import { GranulariteCloture, Referentiel, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import {
  compteFermeCouvert,
  comptesBancairesSansRapprochement,
  dernierJourFige,
  estCompteBancaireARapprocher,
  finDeTroisMois,
  journauxEnRetardDeClotureInformatique,
  periodeOuverte,
  premiereEcheanceDepassee,
  sourceClotureInformatique,
  sourceFicheCompte52,
  texteEnVigueurPourLExercice,
  type CompteBancaireMouvemente,
  type EtatRapprochementCompte,
} from './banque-et-cloture-informatique';

/**
 * LIGNE A13 · banque à rapprocher avant l'arrêté des comptes (fiche du compte
 * 52 des deux plans, AUDCIF art. 42 et 23) et période restée ouverte au-delà
 * de la clôture informatique (AUDCIF art. 22, 3°). Deux contrôles
 * AVERTISSEMENT, bornés au texte (§ 10 bis) · ce que ces tests gèlent, c'est
 * d'abord ce qui NE doit PAS s'allumer.
 */

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('les comptes de banque à rapprocher · racine 52, hors 526', () => {
  it('lit les comptes de banque des deux semis, et écarte les intérêts courus', () => {
    for (const plan of [PLAN_COMPTES_SYCEBNL, PLAN_COMPTES_SYSCOHADA]) {
      const detail52 = plan.filter((c) => c.numero.startsWith('52') && c.typeCompte !== TypeCompteDetailTotal.TOTAL);
      const retenus = detail52.filter((c) => estCompteBancaireARapprocher(c.numero)).map((c) => c.numero);
      const ecartes = detail52.filter((c) => !estCompteBancaireARapprocher(c.numero));
      expect(retenus).toEqual(['52110000', '52150000', '52200000', '52300000', '52400000', '52500000']);
      // Le 526 porte des intérêts COURUS · aucun relevé n'a de solde à leur
      // opposer. Écart du texte (première relecture, j) · la fiche du compte
      // 52 de l'AUDCIF écrit « 5261 en monnaie locale · 5265 en devises »,
      // les semis ouvrent 5261 et 5267 en intérêts courus. Rien n'est changé.
      expect(ecartes.map((c) => c.numero)).toEqual(['52610000', '52670000']);
      for (const c of ecartes) expect(c.intitule.toLowerCase()).toContain('intérêts courus');
    }
  });

  it('un sous-compte ouvert par le cabinet suit sa racine', () => {
    expect(estCompteBancaireARapprocher('5211000123')).toBe(true);
    expect(estCompteBancaireARapprocher('5261000123')).toBe(false);
    expect(estCompteBancaireARapprocher('53100000')).toBe(false);
    expect(estCompteBancaireARapprocher('57110000')).toBe(false);
  });
});

describe('entrée en vigueur des textes (§ 10 bis)', () => {
  it('AUDCIF art. 113 · comptes personnels au 1er janvier 2018', () => {
    expect(texteEnVigueurPourLExercice(Referentiel.SYSCOHADA, D('2017-01-01'))).toBe(false);
    expect(texteEnVigueurPourLExercice(Referentiel.SYSCOHADA, D('2018-01-01'))).toBe(true);
  });

  it('Acte uniforme SYCEBNL art. 28 · applicable au 1er janvier 2024', () => {
    expect(texteEnVigueurPourLExercice(Referentiel.SYCEBNL, D('2023-01-01'))).toBe(false);
    expect(texteEnVigueurPourLExercice(Referentiel.SYCEBNL, D('2024-01-01'))).toBe(true);
  });

  it('chaque référentiel cite SON chemin, art. 42 compris (première relecture, a)', () => {
    expect(sourceFicheCompte52(Referentiel.SYCEBNL)).toBe(
      "SYCEBNL, Partie 2 ch. 3, compte 52 ; AUDCIF art. 42, que l'art. 3 de l'Acte uniforme SYCEBNL n'exclut pas",
    );
    expect(sourceFicheCompte52(Referentiel.SYSCOHADA)).toBe('AUDCIF, Titre VII, compte 52 ; AUDCIF art. 42');
    expect(sourceClotureInformatique(Referentiel.SYCEBNL)).toContain("l'art. 3 de l'Acte uniforme SYCEBNL n'exclut pas");
    expect(sourceClotureInformatique(Referentiel.SYSCOHADA)).toBe('AUDCIF art. 22, 3°');
  });
});

describe('banque · rapprochement clos qui couvre la clôture', () => {
  const banque: CompteBancaireMouvemente = {
    compteId: 'c1',
    numero: '52110000',
    intitule: 'Banque',
    soldeCloture: 1000,
    derniereLigne: D('2026-12-20'),
  };
  const etats = (e: Partial<EtatRapprochementCompte>) =>
    new Map<string, EtatRapprochementCompte>([['c1', { dernierClos: null, soldeDernierClos: null, enCours: null, ...e }]]);

  it('se tait le jour même de la clôture · aucun relevé ne peut encore la couvrir', () => {
    expect(comptesBancairesSansRapprochement([banque], new Map(), D('2026-12-31'), D('2026-12-31'))).toEqual([]);
  });

  it('parle au lendemain, quand aucun rapprochement n’a été clos', () => {
    expect(comptesBancairesSansRapprochement([banque], new Map(), D('2026-12-31'), D('2027-01-01'))).toEqual([
      { reference: '52110000 Banque', detail: 'aucun rapprochement clos' },
    ]);
  });

  it('nomme le dernier relevé clos quand il s’arrête avant la clôture, et l’en cours', () => {
    expect(
      comptesBancairesSansRapprochement(
        [banque],
        etats({ dernierClos: D('2026-11-30'), enCours: D('2026-12-31') }),
        D('2026-12-31'),
        D('2027-01-15'),
      ),
    ).toEqual([
      {
        reference: '52110000 Banque',
        detail: 'dernier rapprochement clos au relevé du 2026-11-30 · rapprochement en cours au relevé du 2026-12-31, non clos',
        date: '2026-11-30',
      },
    ]);
  });

  it('un relevé clos daté de la clôture, ou plus tard, la couvre · le texte ne fixe aucune date', () => {
    expect(comptesBancairesSansRapprochement([banque], etats({ dernierClos: D('2026-12-31') }), D('2026-12-31'), D('2027-02-01'))).toEqual([]);
    expect(comptesBancairesSansRapprochement([banque], etats({ dernierClos: D('2027-01-31') }), D('2026-12-31'), D('2027-02-01'))).toEqual([]);
  });

  it('n’examine jamais le 526', () => {
    const interets = { ...banque, compteId: 'c2', numero: '52670000', intitule: 'Intérêts courus' };
    expect(comptesBancairesSansRapprochement([interets], new Map(), D('2026-12-31'), D('2027-03-01'))).toEqual([]);
  });

  describe('le compte fermé en cours d’exercice (première relecture, B1)', () => {
    const ferme: CompteBancaireMouvemente = { ...banque, soldeCloture: 0, derniereLigne: D('2026-06-15') };
    const clos = (dernierClos: string, soldeDernierClos: number | null) =>
      ({ dernierClos: D(dernierClos), soldeDernierClos, enCours: null }) as EtatRapprochementCompte;

    it('est couvert par son dernier relevé à solde nul, daté au plus tôt de sa dernière ligne, solde comptable nul', () => {
      expect(compteFermeCouvert(ferme, clos('2026-06-30', 0))).toBe(true);
      // Daté du jour même de la dernière ligne · couvre aussi.
      expect(compteFermeCouvert(ferme, clos('2026-06-15', 0))).toBe(true);
      expect(comptesBancairesSansRapprochement([ferme], etats(clos('2026-06-30', 0)), D('2026-12-31'), D('2027-01-15'))).toEqual([]);
    });

    it('ne l’est pas quand le relevé précède la dernière ligne', () => {
      expect(compteFermeCouvert(ferme, clos('2026-06-14', 0))).toBe(false);
      expect(comptesBancairesSansRapprochement([ferme], etats(clos('2026-06-14', 0)), D('2026-12-31'), D('2027-01-15'))).toHaveLength(1);
    });

    it('ne l’est pas quand le relevé porte un solde, même si les livres sont nuls', () => {
      // Un compte actif peut être nul aux livres et garder un solde en banque.
      expect(compteFermeCouvert(ferme, clos('2026-06-30', 250))).toBe(false);
      expect(compteFermeCouvert(ferme, clos('2026-06-30', null))).toBe(false);
    });

    it('ne l’est pas quand le solde comptable n’est pas nul, même relevé nul', () => {
      expect(compteFermeCouvert({ ...ferme, soldeCloture: 0.5 }, clos('2026-06-30', 0))).toBe(false);
      expect(compteFermeCouvert({ ...ferme, soldeCloture: 0.004 }, clos('2026-06-30', 0))).toBe(true);
    });

    it('ne l’est pas sans aucun rapprochement clos', () => {
      expect(compteFermeCouvert(ferme, { dernierClos: null, soldeDernierClos: null, enCours: null })).toBe(false);
    });
  });
});

describe('clôture informatique · période ouverte et échéance (AUDCIF art. 22, 3°)', () => {
  it('trois mois finissent la veille du même quantième, ou à la fin du mois qui n’en a pas (première relecture, c)', () => {
    expect(iso(finDeTroisMois(D('2026-01-01')))).toBe('2026-03-31');
    expect(iso(finDeTroisMois(D('2026-01-31')))).toBe('2026-04-30');
    expect(iso(finDeTroisMois(D('2026-11-30')))).toBe('2027-02-28');
    expect(iso(finDeTroisMois(D('2026-11-29')))).toBe('2027-02-28');
    expect(iso(finDeTroisMois(D('2027-11-29')))).toBe('2028-02-28');
    expect(iso(finDeTroisMois(D('2027-11-30')))).toBe('2028-02-29');
    expect(iso(finDeTroisMois(D('2026-08-30')))).toBe('2026-11-29');
    expect(iso(finDeTroisMois(D('2026-02-15')))).toBe('2026-05-14');
  });

  it('une période ouverte au 31 janvier court jusqu’au 30 avril, non au 29', () => {
    const p = periodeOuverte(D('2026-01-30'), D('2026-01-01'), D('2026-12-31'))!;
    expect([iso(p.debut), iso(p.finAuPlusTard), iso(p.echeance)]).toEqual(['2026-01-31', '2026-04-30', '2026-07-31']);
  });

  it('sans clôture, la première période court trois mois et se clôture à la fin des trois suivants', () => {
    const p = periodeOuverte(null, D('2026-01-01'), D('2026-12-31'))!;
    expect([iso(p.debut), iso(p.finAuPlusTard), iso(p.echeance)]).toEqual(['2026-01-01', '2026-03-31', '2026-06-30']);
  });

  it('repart du lendemain du dernier jour figé', () => {
    const p = periodeOuverte(D('2026-03-31'), D('2026-01-01'), D('2026-12-31'))!;
    expect([iso(p.debut), iso(p.finAuPlusTard), iso(p.echeance)]).toEqual(['2026-04-01', '2026-06-30', '2026-09-30']);
    const q = periodeOuverte(D('2026-02-14'), D('2026-01-01'), D('2026-12-31'))!;
    expect([iso(q.debut), iso(q.finAuPlusTard), iso(q.echeance)]).toEqual(['2026-02-15', '2026-05-14', '2026-08-14']);
  });

  it('la période ne franchit pas la fin de l’exercice', () => {
    const p = periodeOuverte(D('2026-11-30'), D('2026-01-01'), D('2026-12-31'))!;
    expect([iso(p.finAuPlusTard), iso(p.echeance)]).toEqual(['2026-12-31', '2027-03-31']);
  });

  it('un exercice figé jusqu’à sa fin n’a plus de période ouverte', () => {
    expect(periodeOuverte(D('2026-12-31'), D('2026-01-01'), D('2026-12-31'))).toBeNull();
  });

  it('un exercice décalé compte ses trimestres depuis son ouverture', () => {
    const p = periodeOuverte(null, D('2026-07-01'), D('2027-06-30'))!;
    expect([iso(p.finAuPlusTard), iso(p.echeance)]).toEqual(['2026-09-30', '2026-12-31']);
  });

  it('la partielle ne fige rien · seules la période et la totale de CE journal comptent', () => {
    const clotures = [
      { granularite: GranulariteCloture.PARTIELLE, journalId: 'A', dateLimite: D('2026-09-30') },
      { granularite: GranulariteCloture.TOTALE, journalId: 'B', dateLimite: D('2026-08-31') },
      { granularite: GranulariteCloture.PERIODE, journalId: null, dateLimite: D('2026-03-31') },
    ];
    expect(iso(dernierJourFige('A', clotures)!)).toBe('2026-03-31');
    expect(iso(dernierJourFige('B', clotures)!)).toBe('2026-08-31');
  });

  const journaux = [
    { journalId: 'A', code: 'BQ' },
    { journalId: 'B', code: 'AC' },
  ];

  it('le retard ne se dit qu’au lendemain de l’échéance', () => {
    expect(journauxEnRetardDeClotureInformatique(journaux, [], D('2026-01-01'), D('2026-12-31'), D('2026-06-30'))).toEqual([]);
    expect(
      journauxEnRetardDeClotureInformatique(journaux, [], D('2026-01-01'), D('2026-12-31'), D('2026-07-01')).map((j) => j.reference),
    ).toEqual(['Journal AC', 'Journal BQ']);
  });

  it('une clôture de période repousse l’échéance de tous les journaux, une totale du seul sien', () => {
    const periode = { granularite: GranulariteCloture.PERIODE, journalId: null, dateLimite: D('2026-03-31') };
    expect(journauxEnRetardDeClotureInformatique(journaux, [periode], D('2026-01-01'), D('2026-12-31'), D('2026-07-01'))).toEqual([]);
    const totaleA = { granularite: GranulariteCloture.TOTALE, journalId: 'A', dateLimite: D('2026-06-30') };
    expect(journauxEnRetardDeClotureInformatique(journaux, [periode, totaleA], D('2026-01-01'), D('2026-12-31'), D('2026-10-01'))).toEqual([
      {
        reference: 'Journal AC',
        detail: "figé dans OmegaX jusqu'au 2026-03-31 · période ouverte depuis le 2026-04-01, à clôturer au plus tard le 2026-09-30",
        date: '2026-09-30',
      },
    ]);
  });

  it('sans clôture, le détail dit qu’aucune n’est posée DANS OMEGAX (première relecture, d)', () => {
    expect(
      journauxEnRetardDeClotureInformatique([journaux[0]], [], D('2026-01-01'), D('2026-12-31'), D('2026-07-01'))[0].detail,
    ).toBe(
      "aucune clôture de période ni totale posée dans OmegaX pour l'exercice · période ouverte depuis le 2026-01-01, " +
        'à clôturer au plus tard le 2026-06-30',
    );
  });

  it('la première échéance borne la lecture · rien à lire avant elle', () => {
    expect(premiereEcheanceDepassee(D('2026-01-01'), D('2026-12-31'), D('2026-06-30'))).toBe(false);
    expect(premiereEcheanceDepassee(D('2026-01-01'), D('2026-12-31'), D('2026-07-01'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LE CÂBLAGE SE TESTE AVEC LA RÈGLE · la batterie lit, filtre, et parle.
// ---------------------------------------------------------------------------

interface Rap {
  compteId: string;
  statut: 'EN_COURS' | 'CLOTURE';
  dateReleve: Date;
  soldeReleve?: number;
  clotureAt?: Date | null;
}
interface Clo {
  granularite: GranulariteCloture;
  journalId: string | null;
  dateLimite: Date;
  annuleeAt?: Date | null;
}

function ligne(id: string, numero: string, debit: number, credit = 0) {
  return { id: `l-${id}`, debit, credit, lettre: null, compte: { id: `c-${numero}`, numero, intitule: `Compte ${numero}` } };
}

function ecriture(
  id: string,
  journalId: string,
  code: string,
  lignes: ReturnType<typeof ligne>[],
  autres: {
    date?: string;
    estANouveauProvisoire?: boolean;
    /** Écriture d'écarts d'une réévaluation (liaison `Reevaluation.ecritureEcartsId`). */
    ecartsDeReevaluation?: boolean;
    /** Inscription en négatif de l'écriture d'écarts d'une réévaluation annulée. */
    negatifDEcarts?: boolean;
  } = {},
) {
  return {
    id,
    date: D(autres.date ?? '2026-05-10'),
    libelle: 'Opération',
    reference: 'PJ',
    numeroPiece: 1,
    statut: 'VALIDEE',
    createdAt: D('2026-05-10'),
    createdBy: 'u1',
    valideeBy: 'u2',
    secondRegardNom: null,
    estGenereeParCloture: false,
    estANouveauProvisoire: autres.estANouveauProvisoire ?? false,
    reevaluationEcarts: autres.ecartsDeReevaluation ? { id: 'reeval' } : null,
    reevaluationExtourne: null,
    corrigeEcriture: autres.negatifDEcarts ? { reevaluationEcarts: { id: 'reeval' }, reevaluationExtourne: null } : null,
    journalId,
    journal: { code },
    lignes,
  };
}

interface WhereRap {
  tenantId?: string;
  statut?: string;
  compteId?: { in: string[] };
  lignes?: unknown;
  OR?: { compteId: string; dateReleve: Date }[];
}

function monter(options: {
  referentiel?: Referentiel;
  statut?: StatutExercice;
  dateDebut?: string;
  dateFin?: string;
  rapprochements?: Rap[];
  clotures?: Clo[];
  ecritures?: ReturnType<typeof ecriture>[];
  /** Les traces des contre-passations annulées (A5 bis, M1) · lues par le contrôle 32 (second tour, m3). */
  annulationsContrePassation?: { ecritureId: string; negatifId?: string }[];
  /** Plus de traces que la borne · la vraie au-delà (troisième tour, mineur 3). */
  tracesAuDelaDeLaBorne?: boolean;
}) {
  const ecritures = options.ecritures ?? [
    ecriture('e1', 'jBQ', 'BQ', [ligne('1', '52110000', 1000), ligne('2', '52670000', 0, 1000)]),
    ecriture('e2', 'jAC', 'AC', [ligne('3', '60100000', 500), ligne('4', '40110000', 0, 500)]),
  ];
  const raps = options.rapprochements ?? [];
  const retenus = (where: WhereRap) =>
    raps.filter(
      (r) =>
        (!where.statut || r.statut === where.statut) &&
        (!where.compteId || where.compteId.in.includes(r.compteId)) &&
        (!where.OR || where.OR.some((o) => o.compteId === r.compteId && o.dateReleve.getTime() === r.dateReleve.getTime())),
    );
  const rapprochementBancaire = {
    // Le contrôle 30 lit les rapprochements qui tiennent un à-nouveau (filtre
    // sur `lignes`) · aucun ici. Les lectures de la ligne A13 sont honorées.
    findMany: jest.fn(async ({ where, orderBy }: { where: WhereRap; orderBy?: { clotureAt: 'desc' } }) => {
      if (where.lignes) return [];
      const lus = retenus(where).map((r) => ({ ...r, soldeReleve: r.soldeReleve ?? 0, clotureAt: r.clotureAt ?? null }));
      if (orderBy?.clotureAt === 'desc') lus.sort((a, b) => (b.clotureAt?.getTime() ?? 0) - (a.clotureAt?.getTime() ?? 0));
      return lus;
    }),
    groupBy: jest.fn(async ({ where }: { by: ['compteId']; where: WhereRap }) => {
      const max = new Map<string, Date>();
      for (const r of retenus(where)) {
        const m = max.get(r.compteId);
        if (!m || r.dateReleve.getTime() > m.getTime()) max.set(r.compteId, r.dateReleve);
      }
      return [...max].map(([compteId, dateReleve]) => ({ compteId, _max: { dateReleve } }));
    }),
  };
  const cloture = {
    findMany: jest.fn(
      async ({ where }: { where: { annuleeAt: null; granularite: { in: GranulariteCloture[] }; dateLimite: { gte: Date; lte?: Date } } }) =>
        (options.clotures ?? []).filter(
          (c) =>
            (c.annuleeAt ?? null) === where.annuleeAt &&
            where.granularite.in.includes(c.granularite) &&
            c.dateLimite >= where.dateLimite.gte &&
            (where.dateLimite.lte === undefined || c.dateLimite <= where.dateLimite.lte),
        ),
    ),
  };
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        statut: options.statut ?? StatutExercice.OUVERT,
        dateDebut: D(options.dateDebut ?? '2026-01-01'),
        dateFin: D(options.dateFin ?? '2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel: options.referentiel ?? Referentiel.SYSCOHADA }) },
    ecriture: { findMany: jest.fn(async ({ cursor }: { cursor?: unknown }) => (cursor ? [] : ecritures)) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
    dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
    clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    // Le contrôle 34 lit les contre-passations de réévaluation de l'exercice · aucune ici ; le
    // contrôle 32, les traces des contre-passations annulées (second tour, m3).
    reevaluation: {
      findMany: jest.fn(async ({ where }: { where: { annulationsContrePassation?: unknown } }) =>
        where.annulationsContrePassation && options.annulationsContrePassation
          ? [
              ...(options.tracesAuDelaDeLaBorne
                ? Array.from({ length: 50 }, (_, i) => ({ annulationsContrePassation: [{ ecritureId: `autre-${i}` }] }))
                : []),
              { annulationsContrePassation: options.annulationsContrePassation },
            ]
          : [],
      ),
    },
    rapprochementBancaire,
    cloture,
  };
  return { svc: new ControlesService(prisma as unknown as PrismaService), rapprochementBancaire, cloture };
}

describe('la batterie de contrôles · câblage de la ligne A13', () => {
  let maintenant: jest.SpyInstance;
  const le = (jour: string) => maintenant.mockReturnValue(new Date(`${jour}T12:00:00.000Z`).getTime());
  beforeEach(() => {
    maintenant = jest.spyOn(Date, 'now');
  });
  afterEach(() => maintenant.mockRestore());

  const anomalie = async (m: ReturnType<typeof monter>, code: string) =>
    (await m.svc.analyser('t', 'ex')).anomalies.find((a) => a.code === code);

  it('signale le compte de banque à rapprocher avant l’arrêté, jamais le 526', async () => {
    le('2027-01-15');
    const m = monter({ rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-11-30') }] });
    const a = await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
    expect(a?.gravite).toBe('AVERTISSEMENT');
    expect(a?.occurrences).toEqual([
      { reference: '52110000 Compte 52110000', detail: 'dernier rapprochement clos au relevé du 2026-11-30', date: '2026-11-30' },
    ]);
    // La date du dernier relevé clos est demandée à la base, une ligne par
    // compte (première relecture, g), dans le dossier, sur les seuls comptes à
    // rapprocher.
    expect(m.rapprochementBancaire.groupBy).toHaveBeenCalledWith({
      by: ['compteId'],
      where: { tenantId: 't', compteId: { in: ['c-52110000'] }, statut: 'CLOTURE' },
      _max: { dateReleve: true },
    });
  });

  it('dit un état à régler avant l’arrêté, jamais un retard (première relecture, a, b, f)', async () => {
    le('2027-01-15');
    const a = await anomalie(monter({}), 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
    expect(a?.libelle).toBe("Compte de banque à rapprocher avant l'arrêté des comptes");
    expect(a?.consequence).toContain('AUDCIF, Titre VII, compte 52 ; AUDCIF art. 42');
    expect(a?.consequence).toContain('« doit procéder au recensement et à l\'évaluation de ses biens, créances et dettes » (art. 42)');
    expect(a?.consequence).toContain('dans les quatre mois qui suivent la clôture (AUDCIF art. 23)');
    expect(a?.action).toMatch(/^À rapprocher avant l’arrêté des comptes/);
    expect(a?.action).toContain('Pour un compte en devises, le solde du relevé se compare en francs au cours de clôture');
    expect(a?.action).toContain('Devises et réévaluation');
    expect(`${a?.libelle} ${a?.consequence} ${a?.action}`).not.toMatch(/retard/i);
  });

  it('se tait quand un rapprochement clos atteint la clôture, sans lire aucun solde de relevé', async () => {
    le('2027-01-15');
    const m = monter({ rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-12-31') }] });
    expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
    expect(m.rapprochementBancaire.findMany.mock.calls.some(([args]) => 'OR' in (args as { where: object }).where)).toBe(false);
  });

  describe('le compte fermé en cours d’exercice (première relecture, B1)', () => {
    // Ouvert en mai, vidé et fermé en juin · solde comptable nul à la clôture.
    const ferme = () => [
      ecriture('e1', 'jBQ', 'BQ', [ligne('1', '52110000', 1000), ligne('2', '70110000', 0, 1000)], { date: '2026-05-10' }),
      ecriture('e2', 'jBQ', 'BQ', [ligne('3', '58500000', 1000), ligne('4', '52110000', 0, 1000)], { date: '2026-06-15' }),
    ];

    it('est couvert par son dernier relevé clos à solde nul, daté au plus tôt de sa dernière opération', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: ferme(),
        rapprochements: [
          { compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-05-31'), soldeReleve: 1000, clotureAt: D('2026-06-02') },
          { compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 0, clotureAt: D('2026-07-02') },
        ],
      });
      expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
      // Une seule ligne par compte · celle du dernier relevé clos.
      const lecture = m.rapprochementBancaire.findMany.mock.calls.find(([args]) => 'OR' in (args as { where: object }).where)![0] as {
        where: WhereRap;
      };
      expect(lecture.where).toEqual({
        tenantId: 't',
        statut: 'CLOTURE',
        OR: [{ compteId: 'c-52110000', dateReleve: D('2026-06-30') }],
      });
    });

    it('reste signalé quand le relevé à solde nul précède la dernière opération', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: ferme(),
        rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-10'), soldeReleve: 0 }],
      });
      expect((await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE'))?.occurrences).toHaveLength(1);
    });

    it('reste signalé quand le relevé porte un solde, les livres fussent-ils nuls', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: ferme(),
        rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 300 }],
      });
      expect((await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE'))?.occurrences).toHaveLength(1);
    });

    // Compte en USD fermé en juin, relevé final nul en juin, puis écart de
    // conversion passé au 31/12 par la réévaluation (AUDCIF art. 57) · le
    // solde comptable redevient nul (seconde relecture, B-α).
    const fermeEnDevisesPuisReevalue = (autres: Parameters<typeof ecriture>[4]) => [
      ecriture('e1', 'jBQ', 'BQ', [ligne('1', '52110000', 1000), ligne('2', '70110000', 0, 1000)], { date: '2026-05-10' }),
      ecriture('e2', 'jBQ', 'BQ', [ligne('3', '58500000', 1020), ligne('4', '52110000', 0, 1020)], { date: '2026-06-15' }),
      ecriture('e3', 'jOD', 'OD', [ligne('5', '52110000', 20), ligne('6', '77600000', 0, 20)], { date: '2026-12-31', ...autres }),
    ];

    it('l’écart de conversion du 31/12 ne fait pas d’un compte en devises fermé en juin un compte à rapprocher', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: fermeEnDevisesPuisReevalue({ ecartsDeReevaluation: true }),
        rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 0 }],
      });
      expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
    });

    it('réévaluation annulée · ni l’écart d’origine ni son négatif ne sont des opérations de banque', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: [
          ...fermeEnDevisesPuisReevalue({ ecartsDeReevaluation: true }),
          ecriture('e4', 'jOD', 'OD', [ligne('7', '52110000', 0, 20), ligne('8', '77600000', 20)], { date: '2026-12-31', negatifDEcarts: true }),
          // L'écart exact, repassé par une nouvelle réévaluation.
          ecriture('e5', 'jOD', 'OD', [ligne('9', '52110000', 20), ligne('10', '77600000', 0, 20)], { date: '2026-12-31', ecartsDeReevaluation: true }),
        ],
        rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 0 }],
      });
      expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
    });

    it('m3 · contre-passation annulée (A5 bis, M1) · l’écriture déliée et son négatif, nommés par la trace, ne sont pas des opérations de banque', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: [
          ...fermeEnDevisesPuisReevalue({ ecartsDeReevaluation: true }),
          // L'ancienne contre-passation qui inversait la banque, déliée, et son inscription en négatif.
          ecriture('e6', 'jOD', 'OD', [ligne('11', '52110000', 0, 20), ligne('12', '77600000', 20)], { date: '2026-12-31' }),
          ecriture('e7', 'jOD', 'OD', [ligne('13', '52110000', 20), ligne('14', '77600000', 0, 20)], { date: '2026-12-31' }),
        ],
        rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 0 }],
        annulationsContrePassation: [{ ecritureId: 'e6', negatifId: 'e7' }],
      });
      expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
    });

    it('mineur 3 · au-delà de la borne des traces, la contre-passation annulée redevient une opération · la lecture bornée est DITE', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: [
          ...fermeEnDevisesPuisReevalue({ ecartsDeReevaluation: true }),
          ecriture('e6', 'jOD', 'OD', [ligne('11', '52110000', 0, 20), ligne('12', '77600000', 20)], { date: '2026-12-31' }),
          ecriture('e7', 'jOD', 'OD', [ligne('13', '52110000', 20), ligne('14', '77600000', 0, 20)], { date: '2026-12-31' }),
        ],
        rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 0 }],
        annulationsContrePassation: [{ ecritureId: 'e6', negatifId: 'e7' }],
        tracesAuDelaDeLaBorne: true,
      });
      const a = await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
      expect(a?.occurrences[0]).toMatchObject({ reference: 'Lecture bornée', detail: expect.stringMatching(/50 réévaluations à contre-passation annulée lues/) });
      expect(a?.occurrences).toHaveLength(2);
    });

    it('jumeau · la même ligne passée à la main, vraie opération de banque après le relevé, reste signalée', async () => {
      le('2027-01-15');
      const m = monter({
        ecritures: fermeEnDevisesPuisReevalue({}),
        rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 0 }],
      });
      expect((await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE'))?.occurrences).toHaveLength(1);
    });

    it('un solde comptable non nul ne fait lire aucun solde de relevé · le compte n’est pas fermé', async () => {
      le('2027-01-15');
      const m = monter({ rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-06-30'), soldeReleve: 0 }] });
      expect((await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE'))?.occurrences).toHaveLength(1);
      expect(m.rapprochementBancaire.findMany.mock.calls.some(([args]) => 'OR' in (args as { where: object }).where)).toBe(false);
    });
  });

  it('ne lit pas les rapprochements avant le lendemain de la clôture', async () => {
    le('2026-12-31');
    const m = monter({});
    expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
    expect(m.rapprochementBancaire.groupBy).not.toHaveBeenCalled();
  });

  it('un exercice SYCEBNL d’avant 2024 n’est pas examiné', async () => {
    le('2027-01-15');
    const m = monter({ referentiel: Referentiel.SYCEBNL, dateDebut: '2023-01-01', dateFin: '2023-12-31' });
    const rapport = await m.svc.analyser('t', 'ex');
    expect(rapport.anomalies.map((a) => a.code)).not.toContain('BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
    expect(rapport.anomalies.map((a) => a.code)).not.toContain('CLOTURE_INFORMATIQUE_EN_RETARD');
    expect(m.cloture.findMany).not.toHaveBeenCalled();
  });

  it('chez une association, fiche du 52, AUDCIF art. 42 et AUDCIF art. 22 passent par le chemin du SYCEBNL', async () => {
    le('2027-01-15');
    const m = monter({ referentiel: Referentiel.SYCEBNL });
    const rapport = await m.svc.analyser('t', 'ex');
    const banque = rapport.anomalies.find((a) => a.code === 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
    const cloture = rapport.anomalies.find((a) => a.code === 'CLOTURE_INFORMATIQUE_EN_RETARD');
    expect(banque?.consequence).toContain(
      "SYCEBNL, Partie 2 ch. 3, compte 52 ; AUDCIF art. 42, que l'art. 3 de l'Acte uniforme SYCEBNL n'exclut pas",
    );
    expect(cloture?.consequence).toContain("que l'art. 3 de l'Acte uniforme SYCEBNL n'exclut pas");
  });

  it('signale le journal resté ouvert au-delà de l’échéance, et lit les seules clôtures qui figent', async () => {
    le('2027-01-15');
    const m = monter({
      clotures: [
        { granularite: GranulariteCloture.PERIODE, journalId: null, dateLimite: D('2026-06-30') },
        { granularite: GranulariteCloture.TOTALE, journalId: 'jBQ', dateLimite: D('2026-09-30') },
        { granularite: GranulariteCloture.PARTIELLE, journalId: 'jAC', dateLimite: D('2026-12-31') },
      ],
    });
    const a = await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD');
    expect(a?.gravite).toBe('AVERTISSEMENT');
    expect(a?.occurrences.map((o) => o.reference)).toEqual(['Journal AC']);
    const where = (m.cloture.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual({
      tenantId: 't',
      annuleeAt: null,
      granularite: { in: [GranulariteCloture.PERIODE, GranulariteCloture.TOTALE] },
      // Aucune borne haute (seconde relecture, B-β) · une clôture de N+1 fige N.
      dateLimite: { gte: D('2026-01-01') },
    });
  });

  it('l’action nomme le rôle, l’effet et la clôture faite ailleurs (première relecture, d, e)', async () => {
    le('2027-01-15');
    const a = await anomalie(monter({}), 'CLOTURE_INFORMATIQUE_EN_RETARD');
    expect(a?.action).toMatch(/^L'administrateur du dossier pose une clôture de période/);
    expect(a?.action).toContain('fige aussi, jusqu\'à sa date, le lettrage et la ventilation analytique');
    expect(a?.action).toContain("faite dans un autre logiciel avant la reprise du dossier n'est pas connue d'OmegaX");
  });

  it('l’à-nouveau provisoire ne fait pas d’un journal un journal écrit (première relecture, i)', async () => {
    le('2026-07-01');
    const m = monter({
      ecritures: [
        ecriture('an', 'jAN', 'AN', [ligne('1', '52110000', 1000), ligne('2', '10100000', 0, 1000)], {
          date: '2026-01-01',
          estANouveauProvisoire: true,
        }),
        ecriture('e2', 'jAC', 'AC', [ligne('3', '60100000', 500), ligne('4', '40110000', 0, 500)]),
      ],
    });
    expect((await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD'))?.occurrences.map((o) => o.reference)).toEqual(['Journal AC']);
  });

  it('un dossier dont seul l’à-nouveau provisoire est écrit ne lit aucune clôture', async () => {
    le('2026-07-01');
    const m = monter({
      ecritures: [
        ecriture('an', 'jAN', 'AN', [ligne('1', '52110000', 1000), ligne('2', '10100000', 0, 1000)], {
          date: '2026-01-01',
          estANouveauProvisoire: true,
        }),
      ],
    });
    expect(await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD')).toBeUndefined();
    expect(m.cloture.findMany).not.toHaveBeenCalled();
  });

  it('une clôture de PÉRIODE posée dans N+1 fige tout N · rien signalé sur N (seconde relecture, B-β)', async () => {
    le('2027-04-15');
    const m = monter({ clotures: [{ granularite: GranulariteCloture.PERIODE, journalId: null, dateLimite: D('2027-03-31') }] });
    expect(await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD')).toBeUndefined();
  });

  it('une clôture TOTALE de N+1 fige son seul journal sur N', async () => {
    le('2027-04-15');
    const m = monter({ clotures: [{ granularite: GranulariteCloture.TOTALE, journalId: 'jBQ', dateLimite: D('2027-02-28') }] });
    expect((await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD'))?.occurrences.map((o) => o.reference)).toEqual(['Journal AC']);
  });

  it('une clôture annulée ne compte pas', async () => {
    le('2026-10-01');
    const m = monter({
      clotures: [{ granularite: GranulariteCloture.PERIODE, journalId: null, dateLimite: D('2026-06-30'), annuleeAt: D('2026-07-02') }],
    });
    expect((await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD'))?.occurrences).toHaveLength(2);
  });

  it('un exercice clôturé fige tout · aucune lecture des clôtures', async () => {
    le('2027-06-15');
    const m = monter({ statut: StatutExercice.CLOTURE });
    expect(await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD')).toBeUndefined();
    expect(m.cloture.findMany).not.toHaveBeenCalled();
  });

  it('avant la première échéance, aucune lecture des clôtures', async () => {
    le('2026-06-30');
    const m = monter({});
    expect(await anomalie(m, 'CLOTURE_INFORMATIQUE_EN_RETARD')).toBeUndefined();
    expect(m.cloture.findMany).not.toHaveBeenCalled();
  });
});
