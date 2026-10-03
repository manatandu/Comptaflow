import { Referentiel } from '@prisma/client';
import { DevisesService } from './devises.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { lectureDesGroupes } from './perimetre-reevaluation';

/**
 * LIGNE A6 bis, B1 ET B-3 · LA RÉÉVALUATION LIT CHAQUE EXERCICE POUR LUI-MÊME.
 *
 * Une facture client de 1 000 USD au cours de 2 800 (2 800 000) est passée en
 * N ; elle est encaissée en N+1 au cours de 2 700 (2 700 000), le réalisé de
 * 100 000 est passé au 656 (AUDCIF art. 55 ; Titre VIII ch. 22 § 2.3), et le
 * règlement est lettré avec la facture de N (groupe à cheval). Clôture de N
 * au cours de 2 750, de N+1 au cours de 2 700.
 *
 *  · B1 · en N+1, la ligne d'à-nouveau de la facture n'est dans aucun groupe,
 *    et le règlement était écarté parce que lettré · l'à-nouveau se
 *    réévaluait seul (−100 000), et le réalisé déjà au 656 était provisionné
 *    une seconde fois. Lu ouvert, le règlement le compense · rien à doter.
 *  · B2 · avec une seconde facture de 500 USD à 2 800 ouverte en N+1, la
 *    provision est de 50 000 et non 150 000, la charge de N+1 de 150 000
 *    (100 000 réalisés, 50 000 dotés) et non 250 000.
 *  · B-3 · en N, la facture lettrée par un règlement de N+1 « subsiste au
 *    bilan à la date de clôture » (AUDCIF art. 54) · elle se réévalue.
 */
type Ligne = {
  id: string;
  exerciceId: 'N' | 'N1';
  date: string;
  debit: number;
  credit: number;
  /** null · ligne en francs (écart réalisé, sans devise). */
  montantDevise: number | null;
  lettrageId: string | null;
  lettre: string | null;
};

const EXERCICES = {
  N: { id: 'N', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31'), statut: 'OUVERT' },
  N1: { id: 'N1', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31'), statut: 'OUVERT' },
} as const;

/**
 * La doublure HONORE la requête de `calculer` · exercice, date, devise, et
 * la branche « non lettrée, ou lettrée par un groupe qui sort de l'exercice
 * ou dépasse la date » ; la lecture des groupes rend toutes leurs lignes.
 */
function monter(lignes: Ligne[]) {
  const habiller = (l: Ligne) => ({
    ...l,
    compteId: 'c411',
    deviseId: l.montantDevise === null ? null : 'usd',
    compte: { id: 'c411', numero: '41110000', intitule: 'Client KASONGO' },
    devise: l.montantDevise === null ? null : { id: 'usd', code: 'USD' },
    lettrage: l.lettrageId ? { code: 'A' } : null,
    ecriture: { exerciceId: l.exerciceId, date: new Date(l.date) },
  });
  const sortDe = (groupe: string, exerciceId: string, date: Date) =>
    lignes.some((x) => x.lettrageId === groupe && (x.exerciceId !== exerciceId || new Date(x.date) > date));
  const findMany = jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if (where.lettrageId) {
      const ids = (where.lettrageId as { in: string[] }).in;
      return lignes.filter((l) => l.lettrageId && ids.includes(l.lettrageId)).map(habiller);
    }
    const e = where.ecriture as { exerciceId?: string; date?: { lte: Date } } | undefined;
    // Une requête que la doublure ne sait pas lire (provision, ouverture) ne ramène rien.
    // L'ancienne forme (`lettre: null` seul) est lue aussi · les cas ci-dessous
    // tombent sur elle, ils ne passent pas faute de lecture.
    if (!e?.exerciceId || !e.date || !(Array.isArray(where.OR) || where.lettre === null)) return [];
    const branche = Array.isArray(where.OR);
    return lignes
      .filter((l) => l.exerciceId === e.exerciceId && new Date(l.date) <= e.date!.lte && l.montantDevise !== null)
      .filter((l) => l.lettre === null || (branche && l.lettrageId !== null && sortDe(l.lettrageId, e.exerciceId!, e.date!.lte)))
      .map(habiller);
  });
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYSCOHADA }) },
    exercice: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(async ({ where }: { where: { id?: 'N' | 'N1' } }) => (where.id ? EXERCICES[where.id] : null)),
    },
    ligneEcriture: { aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 } }), findMany },
    reevaluation: { findMany: jest.fn().mockResolvedValue([]) },
    provisionChangeOuverture: { findMany: jest.fn().mockResolvedValue([]) },
    verrouProvisionChange: { deleteMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'verrou' }) },
    ecriture: { count: jest.fn().mockResolvedValue(1) },
    coursDevise: {
      findFirst: jest.fn(async ({ where }: { where: { date: { lte: Date } } }) => ({
        cours: where.date.lte <= EXERCICES.N.dateFin ? 2750 : 2700,
      })),
    },
  };
  return { svc: new DevisesService(prisma as unknown as PrismaService, {} as EcritureService), findMany };
}

// La facture de N, lettrée par un groupe qui se solde en N+1.
const facture: Ligne = { id: 'F', exerciceId: 'N', date: '2026-11-10', debit: 2_800_000, credit: 0, montantDevise: 1000, lettrageId: 'G', lettre: 'A' };
// Son à-nouveau en N+1 · hors de tout groupe (règle 1 du report).
const aNouveau: Ligne = { id: 'AN', exerciceId: 'N1', date: '2027-01-01', debit: 2_800_000, credit: 0, montantDevise: 1000, lettrageId: null, lettre: null };
// Encaissement au coût historique (A6) · le 656 reçoit le réalisé, le 411 rien de plus.
const auCoutHistorique: Ligne = { id: 'R', exerciceId: 'N1', date: '2027-03-15', debit: 0, credit: 2_800_000, montantDevise: 1000, lettrageId: 'G', lettre: 'A' };
// Encaissement au payé, puis l'écart passé SUR LE GROUPE (second tour, B2) · une ligne en francs.
const auPaye: Ligne = { id: 'R', exerciceId: 'N1', date: '2027-03-15', debit: 0, credit: 2_700_000, montantDevise: 1000, lettrageId: 'G', lettre: 'A' };
const ecartPasse: Ligne = { id: 'E', exerciceId: 'N1', date: '2027-03-15', debit: 0, credit: 100_000, montantDevise: null, lettrageId: 'G', lettre: 'A' };

describe('A6 bis, B1 · en N+1, le règlement d’un groupe à cheval compense l’à-nouveau', () => {
  it('au Détail, règlement au coût historique · la position est dénouée, rien à doter', async () => {
    const { svc } = monter([facture, aNouveau, auCoutHistorique]);
    const r = await svc.calculer('t', { exerciceId: 'N1' });
    expect(r.positions).toEqual([]);
    expect(r.provision).toBe(0);
    expect(r.perteLatente).toBe(0);
  });

  it('règlement au payé et écart réalisé passé sur le groupe · la ligne en francs entre dans la valeur comptable, rien à doter', async () => {
    const { svc } = monter([facture, aNouveau, auPaye, ecartPasse]);
    const r = await svc.calculer('t', { exerciceId: 'N1' });
    expect(r.positions).toEqual([]);
    expect(r.positionsNonReevaluees).toEqual([]);
    expect(r.provision).toBe(0);
  });

  it('écart réalisé PAS ENCORE passé · la position soldée en devise est dite dénouée, 100 000 à passer, jamais au 478', async () => {
    const { svc } = monter([facture, aNouveau, auPaye]);
    const r = await svc.calculer('t', { exerciceId: 'N1' });
    expect(r.positions).toEqual([]);
    expect(r.positionsNonReevaluees).toEqual([
      expect.objectContaining({ numero: '41110000', montantDevise: 0, motif: expect.stringMatching(/position dénouée.*100000\.00/) }),
    ]);
  });

  it('au SOLDE, réglée pour moitié en N et soldée en N+1 · l’à-nouveau de 500 USD et le solde se compensent', async () => {
    // N · 1 000 USD à 2 800, 500 USD encaissés au coût historique (groupe G, soldé en N+1).
    const partielN: Ligne = { id: 'P', exerciceId: 'N', date: '2026-12-01', debit: 0, credit: 1_400_000, montantDevise: 500, lettrageId: 'G', lettre: 'A' };
    // N+1 · l'à-nouveau en SOLDE, une ligne par devise · 500 USD pour 1 400 000.
    const anSolde: Ligne = { id: 'AN', exerciceId: 'N1', date: '2027-01-01', debit: 1_400_000, credit: 0, montantDevise: 500, lettrageId: null, lettre: null };
    const solde: Ligne = { id: 'S', exerciceId: 'N1', date: '2027-03-15', debit: 0, credit: 1_400_000, montantDevise: 500, lettrageId: 'G', lettre: 'A' };
    const { svc } = monter([facture, partielN, anSolde, solde]);
    const r = await svc.calculer('t', { exerciceId: 'N1' });
    expect(r.positions).toEqual([]);
    expect(r.provision).toBe(0);
  });
});

describe('A6 bis, B2 · la provision et la charge de N+1 avec une seconde facture ouverte', () => {
  // 500 USD à 2 800 en N+1, ouverts à la clôture (cours 2 700) · −50 000.
  const ouverte: Ligne = { id: 'H', exerciceId: 'N1', date: '2027-05-01', debit: 1_400_000, credit: 0, montantDevise: 500, lettrageId: null, lettre: null };

  it('provision 50 000 et non 150 000 · charge 150 000 (100 000 réalisés, 50 000 dotés) et non 250 000', async () => {
    const { svc } = monter([facture, aNouveau, auPaye, ecartPasse, ouverte]);
    const r = await svc.calculer('t', { exerciceId: 'N1' });
    expect(r.positions).toEqual([expect.objectContaining({ montantDevise: 500, valeurComptable: 1_400_000, ecart: -50_000 })]);
    expect(r.provision).toBe(50_000);
    const dotation = r.ajustementsProvision.reduce((t, a) => t + a.dotation, 0);
    expect(dotation).toBe(50_000);
    // La charge de change de N+1 · le réalisé passé (656) et la dotation.
    expect(ecartPasse.credit + dotation).toBe(150_000);
  });

  it('réalisé PAS ENCORE passé · il sort de la position et se nomme · la seconde facture seule se réévalue (−50 000), jamais −150 000', async () => {
    const { svc } = monter([facture, aNouveau, auPaye, ouverte]);
    const r = await svc.calculer('t', { exerciceId: 'N1' });
    expect(r.positions).toEqual([expect.objectContaining({ montantDevise: 500, valeurComptable: 1_400_000, ecart: -50_000 })]);
    expect(r.provision).toBe(50_000);
    expect(r.positionsNonReevaluees).toEqual([expect.objectContaining({ motif: expect.stringMatching(/^lettrage a · position dénouée.*100000\.00/) })]);
  });
});

describe('A6 bis, B-3 · en N, une facture lettrée par un règlement de N+1 subsiste à la clôture', () => {
  it('lettrée (SOLDE) par un groupe qui a une ligne en N+1 · lue ouverte, réévaluée · −50 000 au cours de 2 750', async () => {
    const { svc } = monter([facture, aNouveau, auCoutHistorique]);
    const r = await svc.calculer('t', { exerciceId: 'N' });
    expect(r.positions).toEqual([expect.objectContaining({ montantDevise: 1000, valeurComptable: 2_800_000, ecart: -50_000 })]);
    expect(r.perteLatente).toBe(50_000);
  });

  it('réglée pour moitié en N, soldée en N+1 · les 500 USD restants se réévaluent · −25 000', async () => {
    const partielN: Ligne = { id: 'P', exerciceId: 'N', date: '2026-12-01', debit: 0, credit: 1_400_000, montantDevise: 500, lettrageId: 'G', lettre: 'A' };
    const solde: Ligne = { id: 'S', exerciceId: 'N1', date: '2027-03-15', debit: 0, credit: 1_400_000, montantDevise: 500, lettrageId: 'G', lettre: 'A' };
    const { svc } = monter([facture, partielN, solde]);
    const r = await svc.calculer('t', { exerciceId: 'N' });
    expect(r.positions).toEqual([expect.objectContaining({ montantDevise: 500, valeurComptable: 1_400_000, ecart: -25_000 })]);
  });

  it('un groupe soldé tout entier dans N reste éteint · rien à réévaluer', async () => {
    const regleeN: Ligne = { ...auCoutHistorique, exerciceId: 'N', date: '2026-12-15' };
    const { svc, findMany } = monter([facture, regleeN]);
    const r = await svc.calculer('t', { exerciceId: 'N' });
    expect(r.positions).toEqual([]);
    // La requête porte la branche « lettrée par un groupe qui sort de l'exercice ».
    const lue = findMany.mock.calls[0][0] as { where: { OR: unknown[] } };
    expect(lue.where.OR).toEqual([
      { lettre: null },
      {
        lettrage: {
          lignes: { some: { OR: [{ ecriture: { exerciceId: { not: 'N' } } }, { ecriture: { date: { gt: EXERCICES.N.dateFin } } }] } },
        },
      },
    ]);
  });
});

describe('lectureDesGroupes · la règle pure', () => {
  const l = (id: string, lettrageId: string, exerciceId: string, date: string, devise: string | null) => ({
    id,
    lettrageId,
    code: 'A',
    compteId: 'c',
    compte: null,
    debit: 0,
    credit: 1,
    deviseId: devise,
    montantDevise: devise ? 1 : null,
    devise: devise ? { id: devise, code: devise.toUpperCase() } : null,
    ecriture: { exerciceId, date: new Date(date) },
  });
  const p = { exerciceId: 'N1', date: new Date('2027-12-31') };

  it('à cheval par l’exercice ou par la date · la ligne en francs de l’exercice est rendue, avec la devise du groupe', () => {
    const r = lectureDesGroupes(
      [
        l('F', 'G', 'N', '2026-11-10', 'usd'),
        l('R', 'G', 'N1', '2027-03-15', 'usd'),
        l('E', 'G', 'N1', '2027-03-15', null),
        l('X', 'H', 'N1', '2027-03-15', 'usd'),
        l('Y', 'H', 'N1', '2027-04-15', null),
      ],
      p,
    );
    expect([...r.aCheval]).toEqual(['G']);
    expect(r.lignesEnFrancs.map((x) => x.id)).toEqual(['E']);
    expect(r.deviseDuGroupe.get('G')).toEqual({ id: 'usd', code: 'USD' });
  });

  it('un groupe à deux devises n’a pas de devise · rien n’est deviné', () => {
    const r = lectureDesGroupes([l('F', 'G', 'N', '2026-11-10', 'usd'), l('R', 'G', 'N1', '2027-03-15', 'eur')], p);
    expect(r.deviseDuGroupe.has('G')).toBe(false);
  });
});
