import { GranulariteCloture, Referentiel, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import {
  comptesBancairesSansRapprochement,
  dernierJourFige,
  estCompteBancaireARapprocher,
  journauxEnRetardDeClotureInformatique,
  periodeOuverte,
  premiereEcheanceDepassee,
  sourceClotureInformatique,
  sourceFicheCompte52,
  texteEnVigueurPourLExercice,
  type EtatRapprochementCompte,
} from './banque-et-cloture-informatique';

/**
 * LIGNE A13 · banque sans rapprochement clos à la clôture (fiche du compte 52
 * des deux plans) et période restée ouverte au-delà de la clôture
 * informatique (AUDCIF art. 22, 3°). Deux contrôles AVERTISSEMENT, bornés au
 * texte (§ 10 bis) · ce que ces tests gèlent, c'est d'abord ce qui NE doit
 * PAS s'allumer.
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
      // Le 526 porte des intérêts COURUS · aucun relevé n'a de solde à leur opposer.
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

  it('chaque référentiel cite SON chemin, jamais celui de l’autre', () => {
    expect(sourceFicheCompte52(Referentiel.SYCEBNL)).toBe('SYCEBNL, Partie 2 ch. 3, compte 52');
    expect(sourceFicheCompte52(Referentiel.SYSCOHADA)).toBe('AUDCIF, Titre VII, compte 52');
    expect(sourceClotureInformatique(Referentiel.SYCEBNL)).toContain("l'art. 3 de l'Acte uniforme SYCEBNL n'exclut pas");
    expect(sourceClotureInformatique(Referentiel.SYSCOHADA)).toBe('AUDCIF art. 22, 3°');
  });
});

describe('banque · rapprochement clos qui couvre la clôture', () => {
  const banque = { compteId: 'c1', numero: '52110000', intitule: 'Banque' };
  const etats = (e: Partial<EtatRapprochementCompte>) =>
    new Map<string, EtatRapprochementCompte>([['c1', { dernierClos: null, enCours: null, ...e }]]);

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
    const interets = { compteId: 'c2', numero: '52670000', intitule: 'Intérêts courus' };
    expect(comptesBancairesSansRapprochement([interets], new Map(), D('2026-12-31'), D('2027-03-01'))).toEqual([]);
  });
});

describe('clôture informatique · période ouverte et échéance (AUDCIF art. 22, 3°)', () => {
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
        detail: "figé jusqu'au 2026-03-31 · période ouverte depuis le 2026-04-01, à clôturer au plus tard le 2026-09-30",
        date: '2026-09-30',
      },
    ]);
  });

  it('sans clôture, le détail le dit', () => {
    expect(
      journauxEnRetardDeClotureInformatique([journaux[0]], [], D('2026-01-01'), D('2026-12-31'), D('2026-07-01'))[0].detail,
    ).toBe("aucune clôture de période ni totale dans l'exercice · période ouverte depuis le 2026-01-01, à clôturer au plus tard le 2026-06-30");
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

function ecriture(id: string, journalId: string, code: string, lignes: ReturnType<typeof ligne>[]) {
  return {
    id,
    date: D('2026-05-10'),
    libelle: 'Opération',
    reference: 'PJ',
    numeroPiece: 1,
    statut: 'VALIDEE',
    createdAt: D('2026-05-10'),
    createdBy: 'u1',
    valideeBy: 'u2',
    secondRegardNom: null,
    estGenereeParCloture: false,
    estANouveauProvisoire: false,
    journalId,
    journal: { code },
    lignes,
  };
}

function monter(options: {
  referentiel?: Referentiel;
  statut?: StatutExercice;
  dateDebut?: string;
  dateFin?: string;
  rapprochements?: Rap[];
  clotures?: Clo[];
}) {
  const ecritures = [
    ecriture('e1', 'jBQ', 'BQ', [ligne('1', '52110000', 1000), ligne('2', '52670000', 0, 1000)]),
    ecriture('e2', 'jAC', 'AC', [ligne('3', '60100000', 500), ligne('4', '40110000', 0, 500)]),
  ];
  const rapprochementBancaire = {
    // Le contrôle 30 lit les rapprochements qui tiennent un à-nouveau (filtre
    // sur `lignes`) · aucun ici. Les lectures de la ligne A13 sont honorées.
    findMany: jest.fn(async ({ where }: { where: { statut?: string; compteId?: { in: string[] }; lignes?: unknown } }) =>
      where.lignes
        ? []
        : (options.rapprochements ?? []).filter(
            (r) => (!where.statut || r.statut === where.statut) && (!where.compteId || where.compteId.in.includes(r.compteId)),
          ),
    ),
  };
  const cloture = {
    findMany: jest.fn(
      async ({ where }: { where: { annuleeAt: null; granularite: { in: GranulariteCloture[] }; dateLimite: { gte: Date; lte: Date } } }) =>
        (options.clotures ?? []).filter(
          (c) =>
            (c.annuleeAt ?? null) === where.annuleeAt &&
            where.granularite.in.includes(c.granularite) &&
            c.dateLimite >= where.dateLimite.gte &&
            c.dateLimite <= where.dateLimite.lte,
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

  it('signale le compte de banque mouvementé sans rapprochement clos, jamais le 526', async () => {
    le('2027-01-15');
    const m = monter({ rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-11-30') }] });
    const a = await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
    expect(a?.gravite).toBe('AVERTISSEMENT');
    expect(a?.consequence).toContain('AUDCIF, Titre VII, compte 52');
    expect(a?.occurrences).toEqual([
      { reference: '52110000 Compte 52110000', detail: 'dernier rapprochement clos au relevé du 2026-11-30', date: '2026-11-30' },
    ]);
    // La lecture ne porte que sur les comptes à rapprocher, dans le dossier.
    const lecture = m.rapprochementBancaire.findMany.mock.calls.find(
      ([args]) => (args as { where: { statut?: string } }).where.statut === 'CLOTURE',
    )![0] as { where: { tenantId: string; compteId: { in: string[] } } };
    expect(lecture.where.tenantId).toBe('t');
    expect(lecture.where.compteId.in).toEqual(['c-52110000']);
  });

  it('se tait quand un rapprochement clos atteint la clôture', async () => {
    le('2027-01-15');
    const m = monter({ rapprochements: [{ compteId: 'c-52110000', statut: 'CLOTURE', dateReleve: D('2026-12-31') }] });
    expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
  });

  it('ne lit pas les rapprochements avant le lendemain de la clôture', async () => {
    le('2026-12-31');
    const m = monter({});
    expect(await anomalie(m, 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE')).toBeUndefined();
    expect(
      m.rapprochementBancaire.findMany.mock.calls.some(([args]) => (args as { where: { statut?: string } }).where.statut !== undefined),
    ).toBe(false);
  });

  it('un exercice SYCEBNL d’avant 2024 n’est pas examiné', async () => {
    le('2027-01-15');
    const m = monter({ referentiel: Referentiel.SYCEBNL, dateDebut: '2023-01-01', dateFin: '2023-12-31' });
    const rapport = await m.svc.analyser('t', 'ex');
    expect(rapport.anomalies.map((a) => a.code)).not.toContain('BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
    expect(rapport.anomalies.map((a) => a.code)).not.toContain('CLOTURE_INFORMATIQUE_EN_RETARD');
    expect(m.cloture.findMany).not.toHaveBeenCalled();
  });

  it('au SYCEBNL, la fiche du 52 et l’art. 22 sont cités par le chemin du SYCEBNL', async () => {
    le('2027-01-15');
    const m = monter({ referentiel: Referentiel.SYCEBNL });
    const rapport = await m.svc.analyser('t', 'ex');
    const banque = rapport.anomalies.find((a) => a.code === 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE');
    const cloture = rapport.anomalies.find((a) => a.code === 'CLOTURE_INFORMATIQUE_EN_RETARD');
    expect(banque?.consequence).toContain('SYCEBNL, Partie 2 ch. 3, compte 52');
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
      dateLimite: { gte: D('2026-01-01'), lte: D('2026-12-31') },
    });
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
