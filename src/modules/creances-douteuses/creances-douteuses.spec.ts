import {
  NatureCreanceDouteuse,
  Prisma,
  Referentiel,
  StatutExercice,
  TypeCompteDetailTotal,
  TypeJournal,
  TypeMouvementCreanceDouteuse,
} from '@prisma/client';
import { depreciationsOrphelines } from './depreciations-orphelines';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import {
  COMPTES_CREANCES_DOUTEUSES,
  RACINES_CREANCE_SOURCE,
  compte416Propose,
  compte491,
  comptePertePropose,
  depreciationEnPlace,
  ecartDeDepreciation,
  enPlaceAvant,
  motifClotureDepreciationsOrphelines,
  motifRefusAnnulationRevue,
  motifRefusDeclaration,
  motifRefusMouvement,
  motifRefusReclassement,
  motifRefusRecuperationTva,
  plafondTvaRecuperable,
  ventilationPerte,
  motifRefusRevue,
  piecesLisibles,
  resteDeLaCreance,
  revueAFaire,
} from './creances-douteuses';
import { CreancesDouteusesService } from './creances-douteuses.service';

/**
 * LIGNE A7 · créances douteuses ou litigieuses (relevé CPCC C3). Fiches des
 * comptes 41, 49, 65 et 759, AUDCIF Titre VII et SYCEBNL Partie 2 ch. 3.
 */

const semis = {
  [Referentiel.SYSCOHADA]: new Map(PLAN_COMPTES_SYSCOHADA.map((c) => [c.numero, c.intitule])),
  [Referentiel.SYCEBNL]: new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c.intitule])),
};
const huit = (r: string) => r.padEnd(8, '0');

describe('créances douteuses · les comptes lus dans les deux semis (un numéro, deux sens)', () => {
  it('le 416, le 491, le 6594 et le 7594 sont ouverts aux deux plans sous l’intitulé qui les justifie', () => {
    for (const ref of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) {
      expect(semis[ref].get(huit('4911'))).toMatch(/litigieuses/i);
      expect(semis[ref].get(huit('4912'))).toMatch(/douteuses/i);
      expect(semis[ref].get(huit(COMPTES_CREANCES_DOUTEUSES.dotation))).toMatch(/cr[ée]ances/i);
      expect(semis[ref].get(huit(COMPTES_CREANCES_DOUTEUSES.reprise))).toMatch(/cr[ée]ances/i);
      expect(semis[ref].has(huit('4161'))).toBe(true);
      expect(semis[ref].has(huit('4162'))).toBe(true);
    }
  });

  it('au SYSCOHADA le sous-compte du 416 dit la NATURE, au SYCEBNL il dit le DÉBITEUR', () => {
    expect(semis.SYSCOHADA.get('41610000')).toBe('Créances litigieuses');
    expect(semis.SYSCOHADA.get('41620000')).toBe('Créances douteuses');
    expect(semis.SYCEBNL.get('41610000')).toMatch(/cotisations/);
    // Les propositions suivent cette lecture.
    expect(compte416Propose(Referentiel.SYSCOHADA, NatureCreanceDouteuse.LITIGIEUSE, '41110001')).toBe('4161');
    expect(compte416Propose(Referentiel.SYSCOHADA, NatureCreanceDouteuse.DOUTEUSE, '41110001')).toBe('4162');
    expect(compte416Propose(Referentiel.SYCEBNL, NatureCreanceDouteuse.DOUTEUSE, '41100003')).toBe('4161');
    expect(compte416Propose(Referentiel.SYCEBNL, NatureCreanceDouteuse.LITIGIEUSE, '41200007')).toBe('4162');
    // Un 413 collectif au SYCEBNL ne dit pas son débiteur · rien n'est deviné.
    expect(compte416Propose(Referentiel.SYCEBNL, NatureCreanceDouteuse.DOUTEUSE, '41300000')).toBeNull();
    expect(compte491(NatureCreanceDouteuse.LITIGIEUSE)).toBe('4911');
    expect(compte491(NatureCreanceDouteuse.DOUTEUSE)).toBe('4912');
  });

  it('la perte va au 651 du débiteur · 6512 « Adhérents » n’existe qu’au SYCEBNL', () => {
    expect(semis.SYCEBNL.get('65120000')).toMatch(/Adhérents/);
    expect(semis.SYSCOHADA.has('65120000')).toBe(false);
    expect(comptePertePropose(Referentiel.SYSCOHADA, '41110001')).toBe('6511');
    expect(comptePertePropose(Referentiel.SYCEBNL, '41100003')).toBe('6512');
    expect(comptePertePropose(Referentiel.SYCEBNL, '41200003')).toBe('6511');
    for (const ref of [Referentiel.SYSCOHADA, Referentiel.SYCEBNL]) expect(semis[ref].has('65110000')).toBe(true);
  });

  it('le 412 se reclasse au SYCEBNL (clients-usagers), pas au SYSCOHADA (effets en portefeuille)', () => {
    expect(RACINES_CREANCE_SOURCE.SYCEBNL).toContain('412');
    expect(RACINES_CREANCE_SOURCE.SYSCOHADA).not.toContain('412');
    expect(semis.SYSCOHADA.get('41210000')).toMatch(/effets/i);
    expect(semis.SYCEBNL.get('41200000')).toBe('Clients-usagers');
  });
});

const pieces = piecesLisibles([{ nature: 'Mise en demeure', reference: 'LR 2026-118', date: '2026-11-04' }]);

describe('créances douteuses · le reclassement au 416 (fiche du compte 41)', () => {
  const base = {
    referentiel: Referentiel.SYSCOHADA,
    nature: NatureCreanceDouteuse.DOUTEUSE,
    numeroSource: '41110001',
    sourceEstDetail: true,
    numero416: '41620000',
    numero416EstDetail: true,
    montant: 1_160_000,
    soldeDebiteur: 1_160_000,
    ligneEnDevise: false,
    motif: 'Client en redressement judiciaire',
    pieces,
    exerciceOuvert: true,
    dateDansExercice: true,
    journalGeneral: true,
  };

  it('passe quand tout est réuni', () => expect(motifRefusReclassement(base)).toBeNull());

  it('chaque refus est nommé', () => {
    expect(motifRefusReclassement({ ...base, numeroSource: '41210000' })).toContain('411, 413');
    expect(motifRefusReclassement({ ...base, numeroSource: '41910000' })).toContain('fiche du compte 41');
    expect(motifRefusReclassement({ ...base, numero416: '41610000' })).toContain('ne correspond pas à la nature');
    expect(motifRefusReclassement({ ...base, numero416: '41100000' })).toContain('416');
    expect(motifRefusReclassement({ ...base, montant: 1_160_000.01 })).toContain('dépasse ce que le client doit');
    expect(motifRefusReclassement({ ...base, motif: '  ' })).toContain('justifier les motifs');
    expect(motifRefusReclassement({ ...base, pieces: [] })).toContain('pièce justificative');
    expect(motifRefusReclassement({ ...base, ligneEnDevise: true })).toContain('devise');
    expect(motifRefusReclassement({ ...base, journalGeneral: false })).toContain("opérations diverses");
    expect(motifRefusReclassement({ ...base, exerciceOuvert: false })).toContain('clôturé');
  });

  it('E3 · au SYCEBNL, le 416 se DÉDUIT du débiteur (fiche du compte 41) · croisé, refusé ; hors table, au choix', () => {
    const s = { ...base, referentiel: Referentiel.SYCEBNL };
    // Un client-usager (412) va au 4162, quelle que soit la nature.
    expect(motifRefusReclassement({ ...s, numeroSource: '41200004', numero416: '41620000' })).toBeNull();
    expect(motifRefusReclassement({ ...s, numeroSource: '41200004', numero416: '41610000' })).toMatch(
      /client-usager.*4162 · fiche du compte 41, « 4161 Adhérents cotisations litigieuses ou douteuses, 4162 Créances litigieuses ou douteuses »/,
    );
    // Un adhérent (411, 4131, 4133) va au 4161.
    expect(motifRefusReclassement({ ...s, numeroSource: '41100003', numero416: '41610000' })).toBeNull();
    expect(motifRefusReclassement({ ...s, numeroSource: '41330000', numero416: '41620000' })).toMatch(/un adhérent/);
    expect(motifRefusReclassement({ ...s, numeroSource: '41380000', numero416: '41610000' })).toMatch(/un client-usager/);
    // Un 413 non subdivisé ne se lit pas · au choix du cabinet, aucun refus.
    expect(motifRefusReclassement({ ...s, numeroSource: '41300000', numero416: '41610000' })).toBeNull();
    expect(motifRefusReclassement({ ...s, numeroSource: '41300000', numero416: '41620000' })).toBeNull();
    // Le sens SYSCOHADA (la nature) est inchangé.
    expect(motifRefusReclassement({ ...base, nature: NatureCreanceDouteuse.LITIGIEUSE, numero416: '41620000' })).toContain('ne correspond pas à la nature');
  });

  it('une pièce sans nature ou sans référence n’en est pas une', () => {
    expect(piecesLisibles([{ nature: 'Courrier', reference: ' ' }, { nature: '', reference: 'X' }])).toEqual([]);
  });
});

describe('créances douteuses · la revue à la clôture (fiche du compte 49)', () => {
  const ex2026 = new Date('2026-12-31');
  const ex2027Debut = new Date('2027-01-01');

  it('la dépréciation en place est la somme des écarts des revues ANTÉRIEURES du module', () => {
    const revues = [
      { exerciceDateFin: ex2026, ecart: 600_000 },
      { exerciceDateFin: new Date('2027-12-31'), ecart: -200_000 },
    ];
    expect(depreciationEnPlace(revues, ex2027Debut)).toBe(600_000);
    expect(depreciationEnPlace(revues, new Date('2028-01-01'))).toBe(400_000);
  });

  it('AUCUN POURCENTAGE PAR ÂGE · deux créances d’âges différents, même dépréciation déclarée, même écart', () => {
    // La règle ne reçoit que la dépréciation déclarée et celle en place · ni
    // date de facture, ni ancienneté. Une créance de cinq ans et une créance
    // de trois mois, déclarées dépréciées de 300 000, donnent la même dotation.
    expect(ecartDeDepreciation(0, 300_000)).toBe(300_000);
    expect(ecartDeDepreciation(0, 300_000)).toBe(ecartDeDepreciation(0, 300_000));
    expect(ecartDeDepreciation.length).toBe(2);
    expect(ecartDeDepreciation(600_000, 400_000)).toBe(-200_000);
    expect(ecartDeDepreciation(400_000, 400_000)).toBe(0);
  });

  it('le reste au 416 ne compte que les mouvements datés au plus tard ce jour', () => {
    const mv = [
      { date: new Date('2026-06-30'), montant: 160_000 },
      { date: new Date('2027-02-01'), montant: 100_000 },
    ];
    expect(resteDeLaCreance(1_160_000, mv, ex2026)).toBe(1_000_000);
    expect(resteDeLaCreance(1_160_000, mv, new Date('2027-12-31'))).toBe(900_000);
  });

  const revue = {
    necessaire: 400_000,
    enPlace: 0,
    reste: 1_000_000,
    motif: 'Syndic · 60 % de récupération attendue',
    pieces,
    exerciceOuvert: true,
    avantReclassement: false,
    revuePosterieure: null,
    anterieursSansRevue: [] as string[],
    refusSmt: null,
    journalGeneral: true,
  };

  it('passe, et chaque refus est nommé', () => {
    expect(motifRefusRevue(revue)).toBeNull();
    expect(motifRefusRevue({ ...revue, necessaire: 1_000_000.01 })).toContain('jamais plus que la créance');
    expect(motifRefusRevue({ ...revue, necessaire: -1 })).toContain('positif ou nul');
    expect(motifRefusRevue({ ...revue, motif: '' })).toContain('justifier les motifs');
    expect(motifRefusRevue({ ...revue, pieces: [] })).toContain('pièce');
    expect(motifRefusRevue({ ...revue, revuePosterieure: '2027-12-31' })).toContain('Retirez d’abord la revue postérieure');
    expect(motifRefusRevue({ ...revue, anterieursSansRevue: ["l'exercice clos le 2026-12-31"] })).toContain('doterait deux fois');
    expect(motifRefusRevue({ ...revue, avantReclassement: true })).toContain('précède le reclassement');
  });

  it('au Système minimal, la dotation est refusée, la reprise reste ouverte', () => {
    const smt = 'Système minimal · aucun poste de dépréciation';
    expect(motifRefusRevue({ ...revue, refusSmt: smt })).toBe(smt);
    expect(motifRefusRevue({ ...revue, refusSmt: smt, enPlace: 600_000, necessaire: 400_000 })).toBeNull();
  });
});

describe('créances douteuses · la perte et le recouvrement', () => {
  const mv = {
    type: TypeMouvementCreanceDouteuse.PERTE,
    montant: 1_000_000,
    reste: 1_000_000,
    motif: 'Certificat d’irrécouvrabilité du syndic',
    pieces,
    exerciceOuvert: true,
    dateDansExercice: true,
    avantReclassement: false,
    revueApres: null,
    journalAttendu: true,
    numeroPerte: '65110000',
    numeroPerteEstDetail: true,
  };
  it('passe, et chaque refus est nommé', () => {
    expect(motifRefusMouvement(mv)).toBeNull();
    expect(motifRefusMouvement({ ...mv, montant: 1_000_000.5 })).toContain('dépasse ce qui reste');
    expect(motifRefusMouvement({ ...mv, numeroPerte: '65800000' })).toContain('fiche du compte 65');
    expect(motifRefusMouvement({ ...mv, numeroPerte: null })).toContain('Choisissez le compte de perte');
    // Le refus nomme l'issue (B2) · annuler la revue, passer le mouvement, refaire la revue.
    expect(motifRefusMouvement({ ...mv, revueApres: '2026-12-31' })).toMatch(/annulez cette revue.*passez le mouvement, puis refaites la revue/);
    expect(motifRefusMouvement({ ...mv, type: TypeMouvementCreanceDouteuse.RECOUVREMENT, journalAttendu: false })).toContain('journal de trésorerie');
    expect(motifRefusMouvement({ ...mv, type: TypeMouvementCreanceDouteuse.RECOUVREMENT, numeroPerte: null })).toBeNull();
  });
});


describe('créances douteuses · règles de la relecture adverse (B1, B2, M3)', () => {
  it('B1 · une revue est à faire seulement si elle change quelque chose', () => {
    expect(revueAFaire({ revueDeLExercice: false, enPlace: 800, reste: 0, aucuneRevue: false })).toBe(true);
    expect(revueAFaire({ revueDeLExercice: false, enPlace: 0, reste: 1000, aucuneRevue: true })).toBe(true);
    expect(revueAFaire({ revueDeLExercice: false, enPlace: 400, reste: 1000, aucuneRevue: false })).toBe(false);
    expect(revueAFaire({ revueDeLExercice: false, enPlace: 0, reste: 0, aucuneRevue: true })).toBe(false);
    expect(revueAFaire({ revueDeLExercice: true, enPlace: 800, reste: 0, aucuneRevue: false })).toBe(false);
  });

  it('B1 · le motif de clôture nomme la créance, les montants et l’issue', () => {
    expect(motifClotureDepreciationsOrphelines([])).toBeNull();
    expect(motifClotureDepreciationsOrphelines([{ creance: '41110001 Client Kasa', enPlace: 800, reste: 0 }])).toMatch(
      /41110001 Client Kasa \(dépréciation en place 800\.00, reste au 416 0\.00\).*Passez la revue.*fiche du compte 49/,
    );
  });

  it('B1 · les dépréciations orphelines sont lues sur les revues NON annulées, celle de l’exercice dispensant', async () => {
    const ex = { id: 'ex-27', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };
    const base = {
      montant: 1000,
      dateReclassement: new Date('2026-06-30'),
      declareeOuverture: false,
      depreciationOuverture: 0,
      compteCreance: { numero: '41110001', intitule: 'Kasa' },
      mouvements: [{ date: new Date('2027-05-10'), montant: 1000 }],
    };
    const prisma: any = {
      exercice: { findFirst: jest.fn().mockResolvedValue(ex) },
      creanceDouteuse: {
        findMany: jest.fn().mockResolvedValue([
          { ...base, id: 'a', ajustements: [{ exerciceId: 'ex-26', ecart: 800, exercice: { dateFin: new Date('2026-12-31') } }] },
          {
            ...base,
            id: 'b',
            ajustements: [
              { exerciceId: 'ex-26', ecart: 800, exercice: { dateFin: new Date('2026-12-31') } },
              { exerciceId: 'ex-27', ecart: -800, exercice: { dateFin: ex.dateFin } },
            ],
          },
        ]),
      },
    };
    const r = await depreciationsOrphelines(prisma, { tenantId: 't', exerciceId: 'ex-27' });
    expect(r).toEqual([{ creance: '41110001 Kasa', enPlace: 800, reste: 0 }]);
    // La requête ne lit que les revues non annulées.
    expect(prisma.creanceDouteuse.findMany.mock.calls[0][0].select.ajustements.where).toEqual({ annuleeLe: null });
  });

  it('B2 · l’annulation exige un exercice ouvert, la plus récente d’abord, et un motif de 3 à 500 caractères', () => {
    const ok = { dejaAnnulee: null, exerciceClos: false, posterieureNonAnnulee: null, motif: 'Revue passée sur un reste faux' };
    expect(motifRefusAnnulationRevue(ok)).toBeNull();
    expect(motifRefusAnnulationRevue({ ...ok, exerciceClos: true })).toContain('art. 20, al. 3');
    expect(motifRefusAnnulationRevue({ ...ok, posterieureNonAnnulee: '2027-12-31' })).toContain('plus récente à la plus ancienne');
    expect(motifRefusAnnulationRevue({ ...ok, motif: 'ab' })).toContain('de 3 à 500');
    expect(motifRefusAnnulationRevue({ ...ok, motif: 'x'.repeat(501) })).toContain('de 3 à 500');
    expect(motifRefusAnnulationRevue({ ...ok, dejaAnnulee: '2026-12-31' })).toContain('déjà annulée');
  });

  it('M3 · la dépréciation déclarée à l’ouverture est en place dès sa date', () => {
    const c = { declareeOuverture: true, depreciationOuverture: 300, dateReclassement: new Date('2026-01-01') };
    expect(enPlaceAvant(c, [], new Date('2026-01-01'))).toBe(300);
    expect(enPlaceAvant(c, [{ exerciceDateFin: new Date('2026-12-31'), ecart: -100 }], new Date('2027-01-01'))).toBe(200);
    expect(enPlaceAvant({ ...c, declareeOuverture: false }, [], new Date('2026-01-01'))).toBe(0);
  });

  it('M3 · la déclaration est bornée par l’à-nouveau du 416 et du 491, source exigée', () => {
    const d = {
      referentiel: Referentiel.SYSCOHADA,
      nature: NatureCreanceDouteuse.DOUTEUSE,
      numeroSource: '41110001',
      numero416: '41620000',
      numero416EstDetail: true,
      montant: 1000,
      depreciation: 300,
      source: 'Balance de reprise au 01/01/2026',
      dateDebutExercice: true,
      exerciceOuvert: true,
      aNouveau: true,
      aNouveau416: 1000,
      dejaDeclare416: 0,
      aNouveau491: 300,
      dejaDeclare491: 0,
    };
    expect(motifRefusDeclaration(d)).toBeNull();
    expect(motifRefusDeclaration({ ...d, source: ' ' })).toContain('source est exigée');
    expect(motifRefusDeclaration({ ...d, aNouveau: false })).toContain("pas encore d'à-nouveau");
    expect(motifRefusDeclaration({ ...d, dejaDeclare416: 1 })).toContain('dépassent son à-nouveau');
    expect(motifRefusDeclaration({ ...d, aNouveau491: 299 })).toContain('491');
    expect(motifRefusDeclaration({ ...d, depreciation: 1001 })).toContain('jamais au-delà de la créance');
    // E3 · la déclaration suit la même table que le reclassement.
    expect(motifRefusDeclaration({ ...d, numero416: '41610000' })).toContain('ne correspond pas à la nature');
    expect(
      motifRefusDeclaration({ ...d, referentiel: Referentiel.SYCEBNL, numeroSource: '41100002', numero416: '41620000' }),
    ).toContain('un adhérent');
  });
});

/**
 * LE CÂBLAGE · la doublure HONORE la requête (borne des dates, statut,
 * racine, revues non annulées) · ce qui dépend de ce qu'une requête ramène se
 * teste sur la requête (CLAUDE.md, passe F4b).
 */
describe('créances douteuses · service', () => {
  const exercices = [
    { id: 'ex-26', tenantId: 't', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: StatutExercice.OUVERT },
    { id: 'ex-27', tenantId: 't', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31'), statut: StatutExercice.OUVERT },
  ];
  const plan = [
    { id: 'cli', numero: '41110001', intitule: 'Client Kasa', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'adh', numero: '41100002', intitule: 'Adhérent Mbuyi', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c4161', numero: '41610000', intitule: '4161', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c4162', numero: '41620000', intitule: '4162', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c4911', numero: '49110000', intitule: '4911', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c4912', numero: '49120000', intitule: '4912', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c6594', numero: '65940000', intitule: '6594', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c7594', numero: '75940000', intitule: '7594', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c6511', numero: '65110000', intitule: '6511', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
    { id: 'c6512', numero: '65120000', intitule: '6512', typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true },
  ];
  const journaux = [
    { id: 'od', code: 'OD', type: TypeJournal.GENERAL, compteTresorerieId: null },
    { id: 'bq', code: 'BQ', type: TypeJournal.TRESORERIE, compteTresorerieId: 'c521' },
    { id: 've', code: 'VE', type: TypeJournal.VENTES, compteTresorerieId: null },
  ];

  function monter(
    options: {
      referentiel?: Referentiel;
      regime?: Record<string, unknown>;
      creance?: Record<string, unknown> | null;
      solde?: number;
      creationEchoue?: boolean;
      aNouveauDans?: string[];
      revue?: Record<string, unknown> | null;
      verrouTenu?: boolean;
    } = {},
  ) {
    let rang = 0;
    const creer = jest.fn().mockImplementation(() => Promise.resolve({ id: `ecr-${++rang}` }));
    const retirerCompensation = jest.fn().mockResolvedValue(undefined);
    const inscrireEnNegatifPourAnnulation = jest.fn().mockResolvedValue({ id: 'neg-1', numeroPiece: 99 });
    const supprimer = jest.fn().mockImplementation(async (_t: string, _id: string, m: { liberer: (tx: unknown) => Promise<unknown> }) => {
      await m.liberer(prisma);
      return { supprime: true };
    });
    const echec = () => Promise.reject(new Error('base indisponible'));
    const aNouveauDans = options.aNouveauDans ?? ['ex-26', 'ex-27'];
    const prisma: any = {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          referentiel: options.referentiel ?? Referentiel.SYSCOHADA,
          systemeComptableSyscohada: 'NORMAL',
          jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS',
          ...options.regime,
        }),
      },
      verrouCreancesDouteuses: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(() =>
          options.verrouTenu
            ? Promise.reject(Object.assign(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' })))
            : Promise.resolve({ id: 'verrou-1' }),
        ),
        findFirst: jest.fn().mockResolvedValue({ geste: 'REVUE', createdAt: new Date('2026-12-31T10:00:00Z'), echeance: new Date('2026-12-31T10:15:00Z') }),
      },
      ecriture: {
        count: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.estGenereeParCloture && aNouveauDans.includes(where.exerciceId) ? 1 : 0)),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      exercice: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.id) return Promise.resolve(exercices.find((e) => e.id === where.id) ?? null);
          const avant = exercices.filter((e) => !where.dateFin?.lt || e.dateFin < where.dateFin.lt);
          return Promise.resolve(avant.sort((a, b) => b.dateFin.getTime() - a.dateFin.getTime())[0] ?? null);
        }),
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            exercices.filter(
              (e) =>
                (!where.statut || e.statut === where.statut) &&
                (!where.dateFin?.gte || e.dateFin >= where.dateFin.gte) &&
                (!where.dateFin?.lt || e.dateFin < where.dateFin.lt),
            ),
          ),
        ),
      },
      journal: { findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(journaux.find((j) => j.id === where.id) ?? null)) },
      compte: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.id
              ? plan.find((c) => c.id === where.id) ?? null
              : plan.filter((c) => c.numero.startsWith(where.numero.startsWith)).sort((a, b) => a.numero.localeCompare(b.numero))[0] ?? null,
          ),
        ),
      },
      ligneEcriture: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { debit: options.solde ?? 1_160_000, credit: 0 } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([{ lettre: null, lettrageId: null, rapprochementId: null }]),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      creanceDouteuse: {
        findFirst: jest.fn().mockResolvedValue(options.creance ?? null),
        create: jest.fn().mockImplementation(({ data }) => (options.creationEchoue ? echec() : Promise.resolve({ id: 'cd-1', ...data }))),
        delete: jest.fn().mockResolvedValue({}),
        aggregate: jest.fn().mockResolvedValue({ _sum: { montant: 0, depreciationOuverture: 0 } }),
      },
      ajustementCreanceDouteuse: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'aj-1', ...data })),
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id ? options.revue ?? null : null)),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      mouvementCreanceDouteuse: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mv-1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: (f: (tx: unknown) => unknown) => f(prisma),
    };
    const service = new CreancesDouteusesService(prisma, { creer, retirerCompensation, supprimer, inscrireEnNegatifPourAnnulation } as any);
    return { service, prisma, creer, retirerCompensation, supprimer, inscrireEnNegatifPourAnnulation };
  }

  const dtoReclassement = {
    exerciceId: 'ex-26',
    journalId: 'od',
    date: '2026-11-15',
    compteCreanceId: 'cli',
    nature: NatureCreanceDouteuse.DOUTEUSE,
    montant: 1_160_000,
    motif: 'Client en redressement judiciaire',
    pieces: [{ nature: 'Jugement d’ouverture', reference: 'RJ 44/2026' }],
  };

  it('reclasse D 4162 / C compte du client et garde motif, pièces et 491 de la nature, sous le verrou du dossier', async () => {
    const { service, creer, prisma } = monter();
    await service.reclasser('t', 'u', dtoReclassement);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c4162', debit: 1_160_000, credit: 0 },
      { compteId: 'cli', debit: 0, credit: 1_160_000 },
    ]);
    const data = prisma.creanceDouteuse.create.mock.calls[0][0].data;
    expect(data.compte491Id).toBe('c4912');
    expect(data.pieces).toEqual([{ nature: 'Jugement d’ouverture', reference: 'RJ 44/2026', date: null }]);
    // L'exercice a son à-nouveau · le solde du client se lit dans lui seul, à la date.
    expect(prisma.ligneEcriture.aggregate.mock.calls[0][0].where).toEqual({
      compte: { tenantId: 't', id: 'cli' },
      ecriture: { tenantId: 't', exerciceId: { in: ['ex-26'] }, date: { lte: new Date('2026-11-15') } },
    });
    expect(prisma.verrouCreancesDouteuses.create).toHaveBeenCalled();
    expect(prisma.verrouCreancesDouteuses.deleteMany).toHaveBeenLastCalledWith({ where: { tenantId: 't', id: 'verrou-1' } });
  });

  it('M2 · sans à-nouveau, le solde se lit sur le report reconstitué de l’exercice précédent, et le refus le dit', async () => {
    const { service, prisma } = monter({ aNouveauDans: [], solde: 1_000_000 });
    await expect(service.reclasser('t', 'u', { ...dtoReclassement, exerciceId: 'ex-27', date: '2027-02-15' })).rejects.toThrow(
      /report RECONSTITUÉ de l'exercice précédent.*passez l'à-nouveau/,
    );
    expect(prisma.ligneEcriture.aggregate.mock.calls[0][0].where.ecriture.exerciceId).toEqual({ in: ['ex-27', 'ex-26'] });
  });

  it('M6 · un second geste reçoit aussitôt un 409 qui dit le geste en cours', async () => {
    const { service, creer } = monter({ verrouTenu: true });
    await expect(service.reclasser('t', 'u', dtoReclassement)).rejects.toThrow(/en cours.*Geste en cours · REVUE/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('refuse AVANT toute écriture un montant au-delà du solde du client, et libère le verrou', async () => {
    const { service, creer, prisma } = monter({ solde: 1_000_000 });
    await expect(service.reclasser('t', 'u', dtoReclassement)).rejects.toThrow('dépasse ce que le client doit');
    expect(creer).not.toHaveBeenCalled();
    expect(prisma.verrouCreancesDouteuses.deleteMany).toHaveBeenLastCalledWith({ where: { tenantId: 't', id: 'verrou-1' } });
  });

  it('une ligne refusée ne laisse pas son écriture au journal', async () => {
    const { service, retirerCompensation } = monter({ creationEchoue: true });
    await expect(service.reclasser('t', 'u', dtoReclassement)).rejects.toThrow('base indisponible');
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'ecr-1');
  });

  it('au SYCEBNL, un adhérent se reclasse au 4161', async () => {
    const { service, creer } = monter({ referentiel: Referentiel.SYCEBNL });
    await service.reclasser('t', 'u', { ...dtoReclassement, compteCreanceId: 'adh' });
    expect(creer.mock.calls[0][2].lignes[0].compteId).toBe('c4161');
  });

  const creance = (ajustements: unknown[] = [], mouvements: unknown[] = [], extra: Record<string, unknown> = {}) => ({
    id: 'cd-1',
    tenantId: 't',
    exerciceId: 'ex-26',
    nature: NatureCreanceDouteuse.DOUTEUSE,
    compteCreance: { id: 'adh', numero: '41100002', intitule: 'Adhérent Mbuyi', tiersCompte: null },
    compte416: { id: 'c4161', numero: '41610000', intitule: '4161' },
    compte491: { id: 'c4912', numero: '49120000', intitule: '4912' },
    dateReclassement: new Date('2026-11-15'),
    montant: 1_160_000,
    motif: 'm',
    pieces: [],
    declareeOuverture: false,
    depreciationOuverture: 0,
    ecritureReclassementId: 'ecr-r',
    ajustements,
    mouvements,
    ...extra,
  });

  const dtoRevue = { exerciceId: 'ex-26', journalId: 'od', depreciationNecessaire: 400_000, motif: 'Syndic', pieces: [{ nature: 'Lettre du syndic', reference: 'S-9' }] };
  const revue26 = { id: 'aj-26', exerciceId: 'ex-26', date: new Date('2026-12-31'), ecart: 400_000, depreciationNecessaire: 400_000, ecritureId: 'ecr-a', exercice: exercices[0] };

  it('la première revue dote D 6594 / C 4912 au dernier jour de l’exercice', async () => {
    const { service, creer, prisma } = monter({ creance: creance() });
    await service.revoir('t', 'u', 'cd-1', dtoRevue);
    const ecr = creer.mock.calls[0][2];
    expect(ecr.date).toBe('2026-12-31');
    expect(ecr.lignes).toEqual([
      { compteId: 'c6594', debit: 400_000, credit: 0 },
      { compteId: 'c4912', debit: 0, credit: 400_000 },
    ]);
    expect(prisma.ajustementCreanceDouteuse.create.mock.calls[0][0].data).toMatchObject({ depreciationEnPlace: 0, ecart: 400_000, ecritureId: 'ecr-1' });
    // Seules les revues NON annulées sont lues.
    expect(prisma.creanceDouteuse.findFirst.mock.calls[0][0].include.ajustements.where).toEqual({ annuleeLe: null });
  });

  it('la revue suivante ne passe que l’écart, lu sur les revues du module et jamais sur le solde du 491 · reprise D 4912 / C 7594', async () => {
    const { service, creer, prisma } = monter({ creance: creance([revue26]) });
    await service.revoir('t', 'u', 'cd-1', { ...dtoRevue, exerciceId: 'ex-27', depreciationNecessaire: 250_000 });
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c4912', debit: 150_000, credit: 0 },
      { compteId: 'c7594', debit: 0, credit: 150_000 },
    ]);
    expect(prisma.ligneEcriture.aggregate).not.toHaveBeenCalled();
  });

  it('M3 · une créance déclarée à l’ouverture apporte sa dépréciation en place à la première revue', async () => {
    const declaree = creance([], [], { declareeOuverture: true, depreciationOuverture: 300_000, dateReclassement: new Date('2026-01-01'), ecritureReclassementId: null });
    const { service, creer } = monter({ creance: declaree });
    await service.revoir('t', 'u', 'cd-1', { ...dtoRevue, depreciationNecessaire: 400_000 });
    expect(creer.mock.calls[0][2].lignes[0]).toEqual({ compteId: 'c6594', debit: 100_000, credit: 0 });
  });

  it('M3 · la déclaration se borne par l’à-nouveau et ne passe aucune écriture', async () => {
    const { service, creer, prisma } = monter();
    prisma.ligneEcriture.aggregate
      .mockResolvedValueOnce({ _sum: { debit: 1_000_000, credit: 0 } })
      .mockResolvedValueOnce({ _sum: { debit: 0, credit: 300_000 } });
    const dto = {
      exerciceId: 'ex-26',
      compteCreanceId: 'cli',
      compte416Id: 'c4162',
      nature: NatureCreanceDouteuse.DOUTEUSE,
      montant: 1_000_000,
      depreciationOuverture: 300_000,
      source: 'Balance de reprise',
    };
    await service.declarer('t', 'u', dto);
    expect(creer).not.toHaveBeenCalled();
    expect(prisma.creanceDouteuse.create.mock.calls[0][0].data).toMatchObject({
      declareeOuverture: true,
      dateReclassement: exercices[0].dateDebut,
      depreciationOuverture: 300_000,
      sourceDeclaration: 'Balance de reprise',
    });
    prisma.ligneEcriture.aggregate
      .mockResolvedValueOnce({ _sum: { debit: 900_000, credit: 0 } })
      .mockResolvedValueOnce({ _sum: { debit: 0, credit: 300_000 } });
    await expect(service.declarer('t', 'u', dto)).rejects.toThrow('dépassent son à-nouveau');
  });

  it('une dépréciation maintenue se garde sans écriture', async () => {
    const { service, creer, prisma } = monter({ creance: creance([revue26]) });
    await service.revoir('t', 'u', 'cd-1', { ...dtoRevue, exerciceId: 'ex-27', depreciationNecessaire: 400_000 });
    expect(creer).not.toHaveBeenCalled();
    expect(prisma.ajustementCreanceDouteuse.create.mock.calls[0][0].data).toMatchObject({ ecart: 0, ecritureId: null });
  });

  it('on revoit dans l’ordre · N+1 refusé tant que N, encore ouvert, n’est pas revu', async () => {
    const { service, creer } = monter({ creance: creance() });
    await expect(service.revoir('t', 'u', 'cd-1', { ...dtoRevue, exerciceId: 'ex-27' })).rejects.toThrow('doterait deux fois');
    expect(creer).not.toHaveBeenCalled();
  });

  it('au Système minimal, la dotation est refusée au serveur', async () => {
    const { service, creer } = monter({ creance: creance(), regime: { systemeComptableSyscohada: 'MINIMAL_TRESORERIE' } });
    await expect(service.revoir('t', 'u', 'cd-1', dtoRevue)).rejects.toThrow('Système minimal');
    expect(creer).not.toHaveBeenCalled();
  });

  it('la perte d’un adhérent au SYCEBNL va au 6512 et crédite le 416 de la créance', async () => {
    const { service, creer } = monter({ referentiel: Referentiel.SYCEBNL, creance: creance() });
    await service.perte('t', 'u', 'cd-1', {
      exerciceId: 'ex-26',
      journalId: 'od',
      date: '2026-12-20',
      montant: 1_160_000,
      motif: 'Irrécouvrable',
      pieces: [{ nature: 'PV de carence', reference: 'H-12' }],
    });
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c6512', debit: 1_160_000, credit: 0 },
      { compteId: 'c4161', debit: 0, credit: 1_160_000 },
    ]);
  });

  it('le recouvrement débite le compte du journal de trésorerie, et refuse un autre journal', async () => {
    const dto = { exerciceId: 'ex-26', journalId: 'bq', date: '2026-12-20', montant: 160_000, motif: 'Paiement partiel', pieces: [{ nature: 'Avis de crédit', reference: 'AC-3' }] };
    const { service, creer } = monter({ creance: creance() });
    await service.recouvrement('t', 'u', 'cd-1', dto);
    expect(creer.mock.calls[0][2].lignes[0]).toEqual({ compteId: 'c521', debit: 160_000, credit: 0 });
    await expect(service.recouvrement('t', 'u', 'cd-1', { ...dto, journalId: 've' })).rejects.toThrow('journal de trésorerie');
  });

  it('B2 · un mouvement daté avant une revue passée est refusé, l’issue (annuler la revue) nommée', async () => {
    const { service, creer } = monter({ creance: creance([revue26]) });
    await expect(
      service.perte('t', 'u', 'cd-1', {
        exerciceId: 'ex-26',
        journalId: 'od',
        date: '2026-12-20',
        montant: 1_000,
        motif: 'x',
        pieces: [{ nature: 'n', reference: 'r' }],
      }),
    ).rejects.toThrow(/annulez cette revue/);
    expect(creer).not.toHaveBeenCalled();
  });

  const revueEnBase = (statut: 'BROUILLARD' | 'VALIDEE', extra: Record<string, unknown> = {}) => ({
    id: 'aj-26',
    creanceId: 'cd-1',
    date: new Date('2026-12-31'),
    annuleeLe: null,
    exercice: { statut: StatutExercice.OUVERT, dateFin: new Date('2026-12-31') },
    ecriture: { id: 'ecr-a', statut, numeroPiece: 12, lignes: [{ lettre: null, lettrageId: null, rapprochementId: null }] },
    ...extra,
  });

  it('B2 · annulée VALIDÉE, la revue est inscrite en négatif et marquée par un update unitaire avec motif', async () => {
    const { service, prisma, inscrireEnNegatifPourAnnulation } = monter({ revue: revueEnBase('VALIDEE') });
    await service.annulerRevue('t', 'u', 'cd-1', 'aj-26', { motif: 'Revue passée sur un reste faux' });
    expect(inscrireEnNegatifPourAnnulation).toHaveBeenCalledWith('t', 'u', 'ecr-a', 'Revue passée sur un reste faux', prisma);
    const maj = prisma.ajustementCreanceDouteuse.update.mock.calls[0][0];
    expect(maj.where).toEqual({ id: 'aj-26', tenantId: 't', annuleeLe: null });
    expect(maj.data).toMatchObject({ annuleePar: 'u', motifAnnulation: 'Revue passée sur un reste faux', annulation: { traitement: 'INSCRITE_EN_NEGATIF', negatifId: 'neg-1' } });
    expect(maj.data.ecritureId).toBeUndefined();
    expect(prisma.ecriture.deleteMany).not.toHaveBeenCalled();
  });

  it('B2 · annulée AU BROUILLARD, son écriture est supprimée après que le lien est effacé', async () => {
    const { service, prisma, inscrireEnNegatifPourAnnulation } = monter({ revue: revueEnBase('BROUILLARD') });
    await service.annulerRevue('t', 'u', 'cd-1', 'aj-26', { motif: 'Erreur de saisie' });
    expect(inscrireEnNegatifPourAnnulation).not.toHaveBeenCalled();
    expect(prisma.ajustementCreanceDouteuse.update.mock.calls[0][0].data).toMatchObject({ ecritureId: null, annulation: { traitement: 'SUPPRIMEE' } });
    expect(prisma.ecriture.deleteMany).toHaveBeenCalledWith({ where: { id: 'ecr-a', tenantId: 't' } });
  });

  it('B2 · refus · ligne lettrée, exercice clôturé (M5, même sans écriture), revue postérieure non annulée', async () => {
    const lettree = revueEnBase('VALIDEE', {
      ecriture: { id: 'ecr-a', statut: 'VALIDEE', numeroPiece: 12, lignes: [{ lettre: 'AB', lettrageId: 'l-1', rapprochementId: null }] },
    });
    await expect(monter({ revue: lettree }).service.annulerRevue('t', 'u', 'cd-1', 'aj-26', { motif: 'Erreur' })).rejects.toThrow(/lettrées/);
    const close = revueEnBase('VALIDEE', { ecriture: null, exercice: { statut: StatutExercice.CLOTURE, dateFin: new Date('2026-12-31') } });
    await expect(monter({ revue: close }).service.annulerRevue('t', 'u', 'cd-1', 'aj-26', { motif: 'Erreur' })).rejects.toThrow(/clôturé/);
    const m = monter({ revue: revueEnBase('VALIDEE') });
    m.prisma.ajustementCreanceDouteuse.findFirst.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id ? revueEnBase('VALIDEE') : { date: new Date('2027-12-31') }),
    );
    await expect(m.service.annulerRevue('t', 'u', 'cd-1', 'aj-26', { motif: 'Erreur' })).rejects.toThrow(/plus récente à la plus ancienne/);
    expect(m.prisma.ajustementCreanceDouteuse.update).not.toHaveBeenCalled();
  });

  it('un mouvement compté par une revue ne se retire pas avant elle ; une créance revue ne se retire plus', async () => {
    const mv = { id: 'mv-1', type: TypeMouvementCreanceDouteuse.RECOUVREMENT, date: new Date('2026-12-20'), montant: 160_000, ecritureId: 'ecr-m' };
    const { service, prisma } = monter({ creance: creance([revue26], [mv]) });
    await expect(service.retirerMouvement('t', 'cd-1', 'mv-1')).rejects.toThrow('annulez-la d’abord');
    prisma.ajustementCreanceDouteuse.count.mockResolvedValue(1);
    await expect(service.retirerCreance('t', 'cd-1')).rejects.toThrow('même annulée');
  });

  it('B1 · la liste dit si une revue est à faire · reprise due après une perte', async () => {
    const perte = { id: 'mv-1', type: TypeMouvementCreanceDouteuse.PERTE, date: new Date('2027-05-10'), montant: 1_160_000, ecritureId: 'ecr-m' };
    const { service, prisma } = monter({ creance: null });
    prisma.creanceDouteuse.count = jest.fn().mockResolvedValue(1);
    prisma.creanceDouteuse.findMany = jest.fn().mockResolvedValue([creance([revue26], [perte])]);
    prisma.ajustementCreanceDouteuse.findMany = jest.fn().mockResolvedValue([]);
    const l = await service.lister('t', 'ex-27');
    expect(l.creances[0]).toMatchObject({ resteALaCloture: 0, depreciationOuverture: 400_000, revueAFaire: true });
    expect(l.rapprochement?.provisoire).toBe(false);
  });
});

describe('créances douteuses · E1, la base est le TTC inscrit au 416 (décision de Manasse, fiches 41 et 49)', () => {
  const revue = {
    enPlace: 0,
    reste: 1_160_000,
    motif: 'Débiteur en liquidation',
    pieces: piecesLisibles([{ nature: 'Jugement', reference: 'J-1' }]),
    exerciceOuvert: true,
    avantReclassement: false,
    revuePosterieure: null,
    anterieursSansRevue: [] as string[],
    refusSmt: null,
    journalGeneral: true,
  };
  it('une vente de 1 000 000 HT et 160 000 de TVA se déprécie jusqu’au TTC de 1 160 000, jamais au-delà', () => {
    expect(motifRefusRevue({ ...revue, necessaire: 1_160_000 })).toBeNull();
    expect(motifRefusRevue({ ...revue, necessaire: 1_160_000.01 })).toContain('jamais plus que la créance');
  });
});

describe('créances douteuses · E2, la TVA d’une créance irrécouvrable (O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127)', () => {
  const base = {
    assujetti: true,
    montantSorti: 1_160_000,
    montantCreance: 1_160_000,
    tvaRecuperee: 160_000,
    tvaFactureeCreance: 160_000,
    numeroCompteTva: '44310000',
    compteTvaEstDetail: true,
    duplicataReference: 'DUP-2026-14',
    duplicataDateEnvoi: '2026-12-15',
    datePerte: '2026-12-20',
  };

  it('passe, et chaque condition manquante est refusée par un motif nommé', () => {
    expect(motifRefusRecuperationTva(base)).toBeNull();
    expect(motifRefusRecuperationTva({ ...base, assujetti: false })).toContain('pas déclaré assujetti');
    expect(motifRefusRecuperationTva({ ...base, numeroCompteTva: '44520000' })).toContain('443');
    expect(motifRefusRecuperationTva({ ...base, compteTvaEstDetail: false })).toContain('443');
    expect(motifRefusRecuperationTva({ ...base, tvaFactureeCreance: null })).toContain('TVA facturée');
    expect(motifRefusRecuperationTva({ ...base, duplicataReference: ' ' })).toContain('duplicata surchargé');
    expect(motifRefusRecuperationTva({ ...base, duplicataDateEnvoi: null })).toContain('duplicata surchargé');
    expect(motifRefusRecuperationTva({ ...base, duplicataDateEnvoi: '2026-12-21' })).toContain('au plus tard le jour de la perte');
  });

  it('au plus le prorata de la TVA facturée sur la part perdue', () => {
    // Perte de la moitié de la créance · au plus la moitié de la TVA.
    expect(plafondTvaRecuperable(160_000, 580_000, 1_160_000)).toBe(80_000);
    expect(motifRefusRecuperationTva({ ...base, montantSorti: 580_000, tvaRecuperee: 80_000 })).toBeNull();
    expect(motifRefusRecuperationTva({ ...base, montantSorti: 580_000, tvaRecuperee: 80_000.01 })).toContain('prorata');
  });

  it('hors taxe et TVA font le TTC sorti au centime', () => {
    expect(ventilationPerte(1_160_000, 160_000)).toEqual({ horsTaxe: 1_000_000, tva: 160_000 });
    const v = ventilationPerte(333.33, 45.98);
    expect(Math.round((v.horsTaxe + v.tva) * 100)).toBe(33333);
  });

  function monterE2(assujettiTva: boolean, lettrageId: string | null = 'let-1') {
    let rang = 0;
    const creer = jest.fn().mockImplementation(() => Promise.resolve({ id: `ecr-${++rang}` }));
    const plan: Record<string, { id: string; numero: string; typeCompte: TypeCompteDetailTotal }> = {
      c6511: { id: 'c6511', numero: '65110000', typeCompte: TypeCompteDetailTotal.DETAIL },
      c4431: { id: 'c4431', numero: '44310000', typeCompte: TypeCompteDetailTotal.DETAIL },
    };
    const prisma: any = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA, systemeComptableSyscohada: 'NORMAL', assujettiTva }) },
      verrouCreancesDouteuses: { deleteMany: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'v' }), findFirst: jest.fn() },
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'ex-26', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: StatutExercice.OUVERT }) },
      journal: { findFirst: jest.fn().mockResolvedValue({ id: 'od', code: 'OD', type: TypeJournal.GENERAL, compteTresorerieId: null }) },
      compte: {
        findFirst: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(where.id ? plan[where.id] ?? null : Object.values(plan).find((c) => c.numero.startsWith(where.numero.startsWith)) ?? null),
        ),
        findMany: jest.fn().mockResolvedValue([{ id: 'c4431', numero: '44310000', intitule: 'TVA facturée sur ventes' }]),
      },
      ligneEcriture: {
        findFirst: jest.fn().mockResolvedValue({ lettrageId }),
        findMany: jest.fn().mockImplementation(({ where }) =>
          Promise.resolve(
            where.lettrageId
              ? [{ ecritureId: 'fac-1', debit: 1_160_000 }]
              : [{ compteId: 'c4431', debit: 0, credit: 160_000, compte: { numero: '44310000' } }],
          ),
        ),
      },
      creanceDouteuse: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cd-1',
          compteCreance: { id: 'cli', numero: '41110001', intitule: 'Kasa', tiersCompte: null },
          compte416: { id: 'c4162', numero: '41620000', intitule: '4162' },
          compte491: { id: 'c4912', numero: '49120000', intitule: '4912' },
          dateReclassement: new Date('2026-11-15'),
          montant: 1_160_000,
          declareeOuverture: false,
          depreciationOuverture: 0,
          ecritureReclassementId: 'ecr-r',
          ajustements: [],
          mouvements: [],
        }),
      },
      mouvementCreanceDouteuse: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mv', ...data })) },
      $transaction: (f: (tx: unknown) => unknown) => f(prisma),
    };
    const service = new CreancesDouteusesService(prisma, { creer, retirerCompensation: jest.fn() } as any);
    return { service, creer, prisma };
  }
  const dto = {
    exerciceId: 'ex-26',
    journalId: 'od',
    date: '2026-12-20',
    montant: 1_160_000,
    motif: 'Irrécouvrable',
    pieces: [{ nature: 'PV de carence', reference: 'H-12' }],
    recuperationTva: { compteTvaId: 'c4431', tvaRecuperee: 160_000, tvaFactureeCreance: 160_000, duplicataReference: 'DUP-14', duplicataDateEnvoi: '2026-12-15' },
  };

  it('la perte avec récupération passe D 651 hors taxe, D 443 TVA, C 416 TTC, et garde le duplicata', async () => {
    const { service, creer, prisma } = monterE2(true);
    await service.perte('t', 'u', 'cd-1', dto);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c6511', debit: 1_000_000, credit: 0 },
      { compteId: 'c4431', debit: 160_000, credit: 0 },
      { compteId: 'c4162', debit: 0, credit: 1_160_000 },
    ]);
    expect(prisma.mouvementCreanceDouteuse.create.mock.calls[0][0].data).toMatchObject({
      tvaRecuperee: 160_000,
      compteTvaId: 'c4431',
      duplicataReference: 'DUP-14',
      duplicataDateEnvoi: new Date('2026-12-15'),
    });
  });

  it('un dossier non assujetti est refusé avant toute écriture ; sans demande, la perte passe au TTC entier', async () => {
    const non = monterE2(false);
    await expect(non.service.perte('t', 'u', 'cd-1', dto)).rejects.toThrow('pas déclaré assujetti');
    expect(non.creer).not.toHaveBeenCalled();
    const { recuperationTva: _r, ...sansRecup } = dto;
    await non.service.perte('t', 'u', 'cd-1', sansRecup);
    expect(non.creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c6511', debit: 1_160_000, credit: 0 },
      { compteId: 'c4162', debit: 0, credit: 1_160_000 },
    ]);
  });

  it('la TVA d’origine se propose par le lettrage du 411, jamais devinée sans lui', async () => {
    const { service } = monterE2(true);
    expect(await service.tvaOrigine('t', 'cd-1')).toMatchObject({
      assujetti: true,
      proposition: { compteTvaId: 'c4431', numero: '44310000', tvaFactureeCreance: 160_000 },
      raison: null,
    });
    const sans = monterE2(true, null);
    expect(await sans.service.tvaOrigine('t', 'cd-1')).toMatchObject({ proposition: null, raison: expect.stringContaining('pas lettré') });
  });
});
