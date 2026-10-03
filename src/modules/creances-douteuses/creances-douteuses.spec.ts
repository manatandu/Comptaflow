import { NatureCreanceDouteuse, Referentiel, StatutExercice, TypeCompteDetailTotal, TypeJournal, TypeMouvementCreanceDouteuse } from '@prisma/client';
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
  motifRefusMouvement,
  motifRefusReclassement,
  motifRefusRevue,
  piecesLisibles,
  resteDeLaCreance,
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

  it('au SYCEBNL le 4161 ou le 4162 se choisit sans refus de nature, le 412 est admis', () => {
    const s = { ...base, referentiel: Referentiel.SYCEBNL, numeroSource: '41200004', numero416: '41610000' };
    expect(motifRefusReclassement(s)).toBeNull();
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
    expect(motifRefusMouvement({ ...mv, revueApres: '2026-12-31' })).toContain('retirez d’abord cette revue');
    expect(motifRefusMouvement({ ...mv, type: TypeMouvementCreanceDouteuse.RECOUVREMENT, journalAttendu: false })).toContain('journal de trésorerie');
    expect(motifRefusMouvement({ ...mv, type: TypeMouvementCreanceDouteuse.RECOUVREMENT, numeroPerte: null })).toBeNull();
  });
});

/**
 * LE CÂBLAGE · la doublure HONORE la requête (borne des dates, statut,
 * racine) · ce qui dépend de ce qu'une requête ramène se teste sur la
 * requête (CLAUDE.md, passe F4b).
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

  function monter(options: { referentiel?: Referentiel; regime?: Record<string, unknown>; creance?: Record<string, unknown> | null; solde?: number; creationEchoue?: boolean } = {}) {
    let rang = 0;
    const creer = jest.fn().mockImplementation(() => Promise.resolve({ id: `ecr-${++rang}` }));
    const retirerCompensation = jest.fn().mockResolvedValue(undefined);
    const supprimer = jest.fn().mockImplementation(async (_t: string, _id: string, m: { liberer: (tx: unknown) => Promise<unknown> }) => {
      await m.liberer(prisma);
      return { supprime: true };
    });
    const echec = () => Promise.reject(new Error('base indisponible'));
    const prisma: any = {
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          referentiel: options.referentiel ?? Referentiel.SYSCOHADA,
          systemeComptableSyscohada: 'NORMAL',
          jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS',
          ...options.regime,
        }),
      },
      exercice: {
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve(exercices.find((e) => e.id === where.id) ?? null)),
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
      },
      creanceDouteuse: {
        findFirst: jest.fn().mockResolvedValue(options.creance ?? null),
        create: jest.fn().mockImplementation(({ data }) => (options.creationEchoue ? echec() : Promise.resolve({ id: 'cd-1', ...data }))),
        delete: jest.fn().mockResolvedValue({}),
      },
      ajustementCreanceDouteuse: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'aj-1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      mouvementCreanceDouteuse: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mv-1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: (f: (tx: unknown) => unknown) => f(prisma),
    };
    const service = new CreancesDouteusesService(prisma, { creer, retirerCompensation, supprimer } as any);
    return { service, prisma, creer, retirerCompensation, supprimer };
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

  it('reclasse D 4162 / C compte du client et garde motif, pièces et 491 de la nature', async () => {
    const { service, creer, prisma } = monter();
    await service.reclasser('t', 'u', dtoReclassement);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c4162', debit: 1_160_000, credit: 0 },
      { compteId: 'cli', debit: 0, credit: 1_160_000 },
    ]);
    const data = prisma.creanceDouteuse.create.mock.calls[0][0].data;
    expect(data.compte491Id).toBe('c4912');
    expect(data.pieces).toEqual([{ nature: 'Jugement d’ouverture', reference: 'RJ 44/2026', date: null }]);
    // Le solde du client est lu à la date du reclassement, dans son exercice.
    expect(prisma.ligneEcriture.aggregate.mock.calls[0][0].where).toEqual({
      compteId: 'cli',
      ecriture: { tenantId: 't', exerciceId: 'ex-26', date: { lte: new Date('2026-11-15') } },
    });
  });

  it('refuse AVANT toute écriture un montant au-delà du solde du client', async () => {
    const { service, creer } = monter({ solde: 1_000_000 });
    await expect(service.reclasser('t', 'u', dtoReclassement)).rejects.toThrow('dépasse ce que le client doit');
    expect(creer).not.toHaveBeenCalled();
  });

  it('une ligne refusée ne laisse pas son écriture au journal', async () => {
    const { service, retirerCompensation } = monter({ creationEchoue: true });
    await expect(service.reclasser('t', 'u', dtoReclassement)).rejects.toThrow('base indisponible');
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'ecr-1');
  });

  it('au SYCEBNL, un adhérent se reclasse au 4161 et sa perte va au 6512', async () => {
    const { service, creer } = monter({ referentiel: Referentiel.SYCEBNL });
    await service.reclasser('t', 'u', { ...dtoReclassement, compteCreanceId: 'adh' });
    expect(creer.mock.calls[0][2].lignes[0].compteId).toBe('c4161');
  });

  const creance = (ajustements: unknown[] = [], mouvements: unknown[] = []) => ({
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
    ecritureReclassementId: 'ecr-r',
    ajustements,
    mouvements,
  });

  const dtoRevue = { exerciceId: 'ex-26', journalId: 'od', depreciationNecessaire: 400_000, motif: 'Syndic', pieces: [{ nature: 'Lettre du syndic', reference: 'S-9' }] };

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
  });

  it('la revue suivante ne passe que l’écart, lu sur les revues du module et jamais sur le solde du 491 · reprise D 4912 / C 7594', async () => {
    const revue26 = { id: 'aj-26', exerciceId: 'ex-26', date: new Date('2026-12-31'), ecart: 400_000, depreciationNecessaire: 400_000, exercice: exercices[0] };
    const { service, creer, prisma } = monter({ creance: creance([revue26]) });
    await service.revoir('t', 'u', 'cd-1', { ...dtoRevue, exerciceId: 'ex-27', depreciationNecessaire: 250_000 });
    expect(creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c4912', debit: 150_000, credit: 0 },
      { compteId: 'c7594', debit: 0, credit: 150_000 },
    ]);
    // Le solde du 491 n'a pas été lu pour calculer l'écart.
    expect(prisma.ligneEcriture.aggregate).not.toHaveBeenCalled();
  });

  it('une dépréciation maintenue se garde sans écriture', async () => {
    const revue26 = { id: 'aj-26', exerciceId: 'ex-26', date: new Date('2026-12-31'), ecart: 400_000, depreciationNecessaire: 400_000, exercice: exercices[0] };
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

  it('un mouvement compté par une revue ne se retire pas avant elle ; la créance ne se retire qu’une fois vide', async () => {
    const revue26 = { id: 'aj-26', exerciceId: 'ex-26', date: new Date('2026-12-31'), ecart: 400_000, ecritureId: 'ecr-a', exercice: exercices[0] };
    const mv = { id: 'mv-1', type: TypeMouvementCreanceDouteuse.RECOUVREMENT, date: new Date('2026-12-20'), montant: 160_000, ecritureId: 'ecr-m' };
    const { service, supprimer, prisma } = monter({ creance: creance([revue26], [mv]) });
    await expect(service.retirerMouvement('t', 'cd-1', 'mv-1')).rejects.toThrow('retirez-la d’abord');
    await expect(service.retirerCreance('t', 'cd-1')).rejects.toThrow('retirez-les d’abord');
    await service.retirerRevue('t', 'cd-1', 'aj-26');
    expect(supprimer).toHaveBeenCalledWith('t', 'ecr-a', expect.objectContaining({ detenteur: 'une créance douteuse (revue de la dépréciation)' }));
    expect(prisma.ajustementCreanceDouteuse.delete).toHaveBeenCalledWith({ where: { id: 'aj-26' } });
  });
});
