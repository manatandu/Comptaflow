import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE JUSTIFICATIF DE SOLDE N'EST PAS LE GRAND LIVRE DU COMPTE.
 *
 * Le grand livre est borné à l'exercice. Le justificatif remonte aussi loin
 * que le solde le demande : dans le dossier de cabinet relevé sur le Drive, le
 * détail du compte 469150 arrêté au 31/12/2025 part de 2020, parce qu'une
 * créance ouverte il y a cinq ans compose encore le solde d'aujourd'hui.
 *
 * D'où LE piège, et c'est lui que ce spec garde : remonter tout l'historique
 * en gardant les écritures d'à-nouveau DOUBLE le solde, puisque l'à-nouveau
 * reprend le cumul qu'on est déjà en train de lister ligne à ligne. Elles sont
 * écartées, sauf celles du PREMIER exercice, qui ne reprennent rien mais
 * portent le bilan d'ouverture · les écarter toutes ferait disparaître le
 * point de départ d'un dossier repris en cours de vie, en silence.
 */

const service = readFileSync(join(__dirname, 'ecriture.service.ts'), 'utf8');

let n = 0;
function ligne(date: string, debit: number, credit: number, options: Partial<{ aNouveau: boolean; lettre: string }> = {}) {
  n += 1;
  return {
    id: `l${n}`,
    libelle: `Opération ${n}` as string | null,
    debit,
    credit,
    lettre: options.lettre ?? null,
    montantDevise: null,
    devise: null,
    ecriture: {
      date: new Date(date),
      libelle: `Écriture ${n}`,
      reference: `PJ-${n}`,
      numeroPiece: n,
      estGenereeParCloture: options.aNouveau ?? false,
      journal: { code: 'OD' },
    },
  };
}

function harnais(lignes: ReturnType<typeof ligne>[], soldeBalance = { debit: 0, credit: 0 }) {
  const findMany = jest.fn().mockResolvedValue(lignes);
  const prisma = {
    compte: {
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'c1', numero: '469150', intitule: 'Débiteurs divers' }),
    },
    exercice: {
      findFirstOrThrow: jest
        .fn()
        // 1er appel : l'exercice demandé. 2e : le premier exercice du dossier.
        .mockResolvedValueOnce({ id: 'ex2025', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') })
        .mockResolvedValueOnce({ id: 'ex2020' }),
    },
    ligneEcriture: {
      findMany,
      aggregate: jest.fn().mockResolvedValue({ _sum: { debit: soldeBalance.debit, credit: soldeBalance.credit } }),
    },
  } as unknown as PrismaService;
  return { service: new EcritureService(prisma, {} as never, {} as never, {} as never), findMany };
}

const AU_31_12 = { compteId: 'c1', exerciceId: 'ex2025' };

describe('justificatif de solde', () => {
  it('n’est pas borné à l’exercice · aucun filtre exerciceId sur la liste', () => {
    // C'est LA différence avec le grand livre du compte. Un filtre d'exercice
    // ici rendrait l'état inutile sur un compte à antériorité longue.
    expect(service).toContain('date: { lte: arret }');
    expect(service).not.toContain('exerciceId: params.exerciceId },\n        include');
  });

  it('écarte les à-nouveaux de clôture, garde ceux du premier exercice', async () => {
    const { service: svc, findMany } = harnais([]);
    await svc.justificatifSolde('t', AU_31_12);
    const where = findMany.mock.calls[0][0].where;
    expect(where.ecriture.NOT).toEqual({
      AND: [{ estGenereeParCloture: true }, { exerciceId: { not: 'ex2020' } }],
    });
    // Et rien qui borne l'historique à l'exercice demandé.
    expect(where.ecriture.exerciceId).toBeUndefined();
  });

  it('totalise débit, crédit et solde sur les lignes retenues', async () => {
    const { service: svc } = harnais([
      ligne('2020-10-01', 1208.93, 0, { aNouveau: true }),
      ligne('2023-06-14', 4322.76, 0),
      ligne('2023-07-12', 0, 2338.18),
      ligne('2025-02-28', 163.55, 0),
    ]);
    const r = await svc.justificatifSolde('t', AU_31_12);
    expect(r.totaux.debit).toBe(5695.24);
    expect(r.totaux.credit).toBe(2338.18);
    expect(r.totaux.solde).toBe(3357.06);
    expect(r.lignes[0].estANouveau).toBe(true);
  });

  it('recoupe avec la balance par un AUTRE chemin, et signale l’écart', async () => {
    // Recouper la liste contre elle-même ne prouverait rien. Le solde de
    // référence vient d'une agrégation sur l'exercice, comme la balance.
    const { service: svc } = harnais([ligne('2025-03-01', 1000, 0)], { debit: 1000, credit: 0 });
    const r = await svc.justificatifSolde('t', AU_31_12);
    expect(r.recoupement.applicable).toBe(true);
    expect(r.recoupement.concordant).toBe(true);

    const { service: svc2 } = harnais([ligne('2025-03-01', 1000, 0)], { debit: 1400, credit: 0 });
    const r2 = await svc2.justificatifSolde('t', AU_31_12);
    expect(r2.recoupement.concordant).toBe(false);
    expect(r2.recoupement.ecart).toBe(-400);
  });

  it('n’annonce pas de recoupement à une date intermédiaire', async () => {
    // La balance de l'exercice porte des mouvements postérieurs à l'arrêté :
    // un écart y est attendu, l'annoncer serait une fausse alerte.
    const { service: svc } = harnais([ligne('2025-03-01', 1000, 0)], { debit: 4000, credit: 0 });
    const r = await svc.justificatifSolde('t', { ...AU_31_12, dateArret: '2025-06-30' });
    expect(r.recoupement.applicable).toBe(false);
  });

  it('n’annonce pas de recoupement quand on masque les lignes lettrées', async () => {
    const { service: svc } = harnais([ligne('2025-03-01', 1000, 0)], { debit: 1000, credit: 0 });
    const r = await svc.justificatifSolde('t', { ...AU_31_12, masquerLettrees: true });
    expect(r.recoupement.applicable).toBe(false);
  });

  it('borne un arrêté postérieur à la clôture', async () => {
    const { service: svc } = harnais([]);
    const r = await svc.justificatifSolde('t', { ...AU_31_12, dateArret: '2026-06-30' });
    expect(r.dateArret).toBe('2025-12-31');
  });

  it('prend le libellé de la LIGNE, et retombe sur celui de l’écriture', async () => {
    const l = ligne('2025-03-01', 100, 0);
    const sansLibelle = { ...ligne('2025-03-02', 200, 0), libelle: null };
    const { service: svc } = harnais([l, sansLibelle]);
    const r = await svc.justificatifSolde('t', AU_31_12);
    expect(r.lignes[0].libelle).toBe(l.libelle);
    expect(r.lignes[1].libelle).toBe(sansLibelle.ecriture.libelle);
  });
});
