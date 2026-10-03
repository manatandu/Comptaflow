import { Prisma, StatutEcriture, StatutExercice, TypeMouvementCreanceDouteuse } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { CreancesDouteusesService } from './creances-douteuses.service';

/**
 * A7 TER, B2b · UNE PÉRIODE CLOSE APRÈS L'EXTINCTION N'ENFERME PAS LA CRÉANCE.
 *
 * Le scénario de la relecture adverse · reclassement du 15/11 (1 160 000 au
 * 4161), recouvrement du 30/11 (760 000), perte du 20/12 (400 000) · la perte
 * éteint la créance et le module lettre ses trois lignes 416. Le 10/01, la
 * période est close au 30/11, l'exercice restant ouvert (AUDCIF art. 22, 3°).
 * Les deux premières lignes du groupe sont figées (`gel-cloture.ts`) · le
 * groupe ne se défait plus. Avant la correction, le 15/01, l'annulation de la
 * perte était refusée (« la ligne du 2026-11-15 est figée »), celle du
 * recouvrement aussi, et par ricochet celle du reclassement.
 *
 * La VRAIE inscription en négatif (`EcritureService.inscrireEnNegatifPourAnnulation`)
 * tourne ici sur une base en mémoire · la date de l'annulation (premier jour
 * non clôturé, art. 22, 4°), ses lignes et les soldes qui en résultent sont
 * ceux que la base recevrait.
 */

const D = (x: number) => new Prisma.Decimal(x);
const CLOTURE = new Date('2026-11-30');
const EXERCICE = { id: 'ex-26', statut: StatutExercice.OUVERT, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

interface Ligne {
  id: string;
  ecritureId: string;
  compteId: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  lettre: string | null;
  lettrageId: string | null;
  rapprochementId: string | null;
}
interface Ecriture {
  id: string;
  statut: StatutEcriture;
  date: Date;
  dateValeur: Date | null;
  numeroPiece: number;
  journalId: string;
  libelle: string;
  corrigeEcritureId: string | null;
}

function monterScenario() {
  const ecritures: Ecriture[] = [];
  const lignes: Ligne[] = [];
  let rangLigne = 0;
  const ecrire = (e: Omit<Ecriture, 'dateValeur' | 'corrigeEcritureId' | 'statut'>, ls: Array<[string, number, number]>, groupe: string | null) => {
    ecritures.push({ ...e, statut: StatutEcriture.VALIDEE, dateValeur: null, corrigeEcritureId: null });
    for (const [compteId, debit, credit] of ls) {
      lignes.push({
        id: `l-${++rangLigne}`,
        ecritureId: e.id,
        compteId,
        debit: D(debit),
        credit: D(credit),
        // Le groupe du module ne porte que les lignes 416.
        lettre: compteId === 'c4161' && groupe ? 'A' : null,
        lettrageId: compteId === 'c4161' ? groupe : null,
        rapprochementId: null,
      });
    }
  };
  ecrire({ id: 'ecr-r', date: new Date('2026-11-15'), numeroPiece: 1, journalId: 'od', libelle: 'Reclassement' }, [['c4161', 1_160_000, 0], ['c411', 0, 1_160_000]], 'g-A');
  ecrire({ id: 'ecr-mr', date: new Date('2026-11-30'), numeroPiece: 2, journalId: 'bq', libelle: 'Recouvrement' }, [['c521', 760_000, 0], ['c4161', 0, 760_000]], 'g-A');
  ecrire({ id: 'ecr-p', date: new Date('2026-12-20'), numeroPiece: 3, journalId: 'od', libelle: 'Perte' }, [['c6511', 400_000, 0], ['c4161', 0, 400_000]], 'g-A');

  const mouvements = [
    { id: 'mv-r', creanceId: 'cd-1', tenantId: 't', type: TypeMouvementCreanceDouteuse.RECOUVREMENT, date: new Date('2026-11-30'), montant: 760_000, ecritureId: 'ecr-mr', annuleeLe: null as Date | null },
    { id: 'mv-p', creanceId: 'cd-1', tenantId: 't', type: TypeMouvementCreanceDouteuse.PERTE, date: new Date('2026-12-20'), montant: 400_000, ecritureId: 'ecr-p', annuleeLe: null as Date | null },
  ];
  const creance = { id: 'cd-1', tenantId: 't', compte416Id: 'c4161', ecritureReclassementId: 'ecr-r' };
  const groupes = [{ id: 'g-A', code: 'A', origine: 'MODULE' }];
  const clotures = [{ granularite: 'PERIODE', journalId: null, dateLimite: CLOTURE }];

  const journal = (id: string) => ({ id, code: id === 'bq' ? 'BQ' : 'OD' });
  const vueEcriture = (e: Ecriture) => ({
    ...e,
    tenantId: 't',
    exerciceId: EXERCICE.id,
    reference: null,
    journal: journal(e.journalId),
    exercice: EXERCICE,
    correction: ecritures.find((x) => x.corrigeEcritureId === e.id) ? { id: ecritures.find((x) => x.corrigeEcritureId === e.id)!.id } : null,
    lignes: lignes
      .filter((l) => l.ecritureId === e.id)
      .map((l) => ({ ...l, libelle: null, tauxTvaId: null, dateEcheance: null, dateVersement: null, deviseId: null, montantDevise: null, coursApplique: null, ventilations: [] })),
  });
  const vueLigne = (l: Ligne) => {
    const e = ecritures.find((x) => x.id === l.ecritureId)!;
    return { ...l, ecriture: { exerciceId: EXERCICE.id, date: e.date, journalId: e.journalId, journal: journal(e.journalId), exercice: { statut: EXERCICE.statut } } };
  };

  const prisma: any = {
    verrouCreancesDouteuses: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'verrou' }),
    },
    creanceDouteuse: { findFirst: jest.fn().mockResolvedValue(creance) },
    ajustementCreanceDouteuse: { findFirst: jest.fn().mockResolvedValue(null) },
    mouvementCreanceDouteuse: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const m = mouvements.find((x) => x.id === where.id && x.creanceId === where.creanceId);
        if (!m) return Promise.resolve(null);
        const e = ecritures.find((x) => x.id === m.ecritureId);
        return Promise.resolve({ ...m, exercice: { statut: EXERCICE.statut }, ecriture: e ? vueEcriture(e) : null });
      }),
      findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(mouvements.filter((m) => m.creanceId === where.creanceId && m.ecritureId))),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const m = mouvements.find((x) => x.id === where.id)!;
        m.annuleeLe = data.annuleeLe;
        return Promise.resolve(m);
      }),
    },
    lettrage: { findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(groupes.find((g) => g.id === where.id) ?? null)) },
    cloture: { findMany: jest.fn().mockResolvedValue(clotures) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where, take }: any) => {
        let r = lignes;
        if (where.lettrageId) r = r.filter((l) => l.lettrageId === where.lettrageId);
        if (where.id?.in) r = r.filter((l) => where.id.in.includes(l.id));
        if (where.ecritureId?.in) r = r.filter((l) => where.ecritureId.in.includes(l.ecritureId));
        else if (where.ecritureId) r = r.filter((l) => l.ecritureId === where.ecritureId);
        if (where.compteId) r = r.filter((l) => l.compteId === where.compteId);
        return Promise.resolve(r.slice(0, take ?? r.length).map(vueLigne));
      }),
    },
    ecriture: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const e = ecritures.find((x) => x.id === where.id);
        return Promise.resolve(e ? vueEcriture(e) : null);
      }),
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(ecritures.filter((e) => e.corrigeEcritureId && where.corrigeEcritureId?.in?.includes(e.corrigeEcritureId)).map((e) => ({ id: e.id }))),
      ),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const e: Ecriture = {
          id: `neg-${ecritures.length}`,
          statut: data.statut,
          date: data.date,
          dateValeur: data.dateValeur,
          numeroPiece: data.numeroPiece,
          journalId: data.journalId,
          libelle: data.libelle,
          corrigeEcritureId: data.corrigeEcritureId,
        };
        ecritures.push(e);
        for (const l of data.lignes.create) {
          lignes.push({ id: `l-${++rangLigne}`, ecritureId: e.id, compteId: l.compteId, debit: l.debit, credit: l.credit, lettre: null, lettrageId: null, rapprochementId: null });
        }
        return Promise.resolve({ id: e.id, numeroPiece: e.numeroPiece, date: e.date });
      }),
    },
    $transaction: (f: (tx: unknown) => unknown) => f(prisma),
  };
  // Le premier jour non clôturé · le lendemain de la période close pour une date qu'elle couvre (art. 22, 4°).
  const exerciceService = {
    premierJourOuvert: jest.fn().mockImplementation((_t: string, _j: string, date: Date) =>
      Promise.resolve(date <= CLOTURE ? new Date(CLOTURE.getTime() + 24 * 3600 * 1000) : date),
    ),
  };
  let piece = 100;
  const journalService = { prochainNumeroPiece: jest.fn().mockImplementation(() => Promise.resolve(++piece)) };
  const ecritureService = new EcritureService(prisma, journalService as never, exerciceService as never, {} as never);
  // Le groupe est figé · le module ne doit JAMAIS chercher à le défaire.
  const lettrage = {
    defaireLettrageDuModule: jest.fn().mockRejectedValue(new Error('la ligne du 2026-11-15 est figée')),
    lettrerLignesDuModule: jest.fn(),
  };
  const service = new CreancesDouteusesService(prisma, ecritureService, lettrage as never);
  const solde = (compteId: string) => lignes.filter((l) => l.compteId === compteId).reduce((t, l) => t + l.debit.toNumber() - l.credit.toNumber(), 0);
  const ouvertes416 = () => lignes.filter((l) => l.compteId === 'c4161' && l.lettrageId === null);
  return { service, ecritures, lignes, solde, ouvertes416, lettrage };
}

describe('A7 ter, B2b · période close après l’extinction de la créance', () => {
  it('l’annulation de la perte du 20/12 passe · négatif à sa date, 651 à zéro, 416 à 400 000 sur la seule ligne ouverte', async () => {
    const s = monterScenario();
    const r: any = await s.service.annulerMouvement('t', 'u', 'cd-1', 'mv-p', { motif: 'Le client a repris ses paiements' });
    expect(r.annulation).toMatchObject({ traitement: 'INSCRITE_EN_NEGATIF', lettrageMaintenu: 'g-A' });
    const negatif = s.ecritures.find((e) => e.corrigeEcritureId === 'ecr-p')!;
    // Le 20/12 n'est pas sous la clôture · le négatif garde la date de la perte.
    expect(negatif).toMatchObject({ statut: StatutEcriture.VALIDEE, date: new Date('2026-12-20'), dateValeur: null });
    expect(s.solde('c6511')).toBe(0);
    expect(s.solde('c4161')).toBe(400_000);
    // Le groupe reste sur ses trois lignes ; la ligne en négatif, ouverte, porte le reste.
    expect(s.lignes.filter((l) => l.lettrageId === 'g-A')).toHaveLength(3);
    expect(s.ouvertes416().map((l) => l.debit.toNumber() - l.credit.toNumber())).toEqual([400_000]);
    expect(s.lettrage.defaireLettrageDuModule).not.toHaveBeenCalled();
  });

  it('l’annulation du recouvrement du 30/11 passe · négatif au premier jour non clôturé, date de valeur le 30/11 (art. 22, 4°)', async () => {
    const s = monterScenario();
    await s.service.annulerMouvement('t', 'u', 'cd-1', 'mv-p', { motif: 'Le client a repris ses paiements' });
    await s.service.annulerMouvement('t', 'u', 'cd-1', 'mv-r', { motif: 'Virement rejeté par la banque' });
    const negatif = s.ecritures.find((e) => e.corrigeEcritureId === 'ecr-mr')!;
    expect(negatif).toMatchObject({ date: new Date('2026-12-01'), dateValeur: new Date('2026-11-30') });
    expect(s.solde('c521')).toBe(0);
    expect(s.solde('c6511')).toBe(0);
    // Toute la créance est de nouveau au 416, portée par les deux lignes ouvertes.
    expect(s.solde('c4161')).toBe(1_160_000);
    expect(s.ouvertes416().reduce((t, l) => t + l.debit.toNumber() - l.credit.toNumber(), 0)).toBe(1_160_000);
  });
});
