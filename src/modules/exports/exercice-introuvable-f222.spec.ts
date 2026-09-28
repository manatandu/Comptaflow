import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { ExerciceService } from '../exercice/exercice.service';
import { MOTIF_EXERCICE_INTROUVABLE, trouverExerciceN1 } from '../etats-financiers/etats-financiers.communs';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { ExportService } from './export.service';

/**
 * UN EXERCICE INCONNU DU DOSSIER EST UN 404 À L'EXPORT AUSSI (audit final
 * F222, revue de cohérence du lot).
 *
 * Les états refusent un exercice inconnu par un 404 (`trouverExerciceN1`),
 * mais les exports lisent l'identité du cartouche EN MÊME TEMPS qu'eux
 * (`Promise.all`), et cette lecture passait par `findFirstOrThrow` · l'erreur
 * brute de Prisma remontait en 500. La première des deux qui échouait faisait
 * la réponse, si bien qu'un même exercice inconnu rendait tantôt un 404,
 * tantôt un 500. Le spec fait échouer l'identité SEULE, les états restant en
 * attente, pour que la réponse ne puisse venir que d'elle.
 */

const TENANT = { id: 't1', nom: 'ASBL ESPOIR', numeroImpot: 'A1', adresse: null, ville: null, pays: null };
const EXERCICES = [
  { id: 'e1', tenantId: 't1', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z'), dateArreteComptes: null },
  { id: 'e0', tenantId: 't1', dateDebut: new Date('2025-01-01T00:00:00Z'), dateFin: new Date('2025-12-31T00:00:00Z'), dateArreteComptes: null },
];

type OuExercice = { id?: string; tenantId?: string; dateDebut?: { lt: Date } };

function prismaFactice(): PrismaService {
  return {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
    exercice: {
      // Honore le dossier ET l'identifiant · un exercice d'un autre dossier
      // n'existe pas. Sans identifiant, l'antérieur le plus récent.
      findFirst: jest.fn().mockImplementation(({ where }: { where: OuExercice }) => {
        if (where.id !== undefined) {
          return Promise.resolve(EXERCICES.find((e) => e.id === where.id && e.tenantId === where.tenantId) ?? null);
        }
        const avant = EXERCICES.filter((e) => e.tenantId === where.tenantId && (!where.dateDebut || e.dateDebut < where.dateDebut.lt));
        avant.sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());
        return Promise.resolve(avant[0] ?? null);
      }),
      // Ce que Prisma fait réellement d'un exercice introuvable · une erreur
      // qui n'est pas une exception HTTP, et que Nest rend en 500.
      findFirstOrThrow: jest.fn().mockImplementation(({ where }: { where: OuExercice }) => {
        const trouve = EXERCICES.find((e) => e.id === where.id && e.tenantId === where.tenantId);
        return trouve
          ? Promise.resolve(trouve)
          : Promise.reject(new Prisma.PrismaClientKnownRequestError('No Exercice found', { code: 'P2025', clientVersion: '5' }));
      }),
    },
  } as unknown as PrismaService;
}

function exportService(notes: Partial<NoteAnnexeService> = {}): ExportService {
  return new ExportService(
    prismaFactice(),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    notes as NoteAnnexeService,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('export d’un exercice inconnu du dossier (audit final F222)', () => {
  it('le classeur des notes est refusé par un 404 nommé, même quand l’identité échoue la première', async () => {
    // Les notes ne répondent jamais · seule l'identité du cartouche peut
    // faire la réponse, et elle doit être le refus des états.
    const enAttente = new Promise<never>(() => undefined);
    const service = exportService({ notesProjet: jest.fn().mockReturnValue(enAttente) });
    const refus = service.notesProjetExcel('t1', 'inconnu');
    await expect(refus).rejects.toBeInstanceOf(NotFoundException);
    await expect(refus).rejects.toThrow(MOTIF_EXERCICE_INTROUVABLE);
  });

  it('l’exercice d’un AUTRE dossier est inconnu ici', async () => {
    const service = exportService({ notesProjet: jest.fn().mockReturnValue(new Promise<never>(() => undefined)) });
    await expect(service.notesProjetExcel('t2', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('le comparatif des liasses refuse lui aussi, et sert l’antérieur d’un exercice connu', async () => {
    const service = exportService();
    const exerciceN1Id = (tenantId: string, exerciceId: string): Promise<string | null> =>
      (service as unknown as { exerciceN1Id: (t: string, e: string) => Promise<string | null> }).exerciceN1Id(tenantId, exerciceId);
    await expect(exerciceN1Id('t1', 'inconnu')).rejects.toBeInstanceOf(NotFoundException);
    await expect(exerciceN1Id('t1', 'e1')).resolves.toBe('e0');
    await expect(exerciceN1Id('t1', 'e0')).resolves.toBeNull();
  });

  it('le refus de l’export est mot pour mot celui des états · la réponse ne dépend pas de l’ordre', async () => {
    const lister = { lister: jest.fn().mockResolvedValue(EXERCICES) } as unknown as ExerciceService;
    const [etat, exporte] = await Promise.allSettled([
      trouverExerciceN1(lister, 't1', 'inconnu'),
      exportService({ notesProjet: jest.fn().mockReturnValue(new Promise<never>(() => undefined)) }).notesProjetExcel(
        't1',
        'inconnu',
      ),
    ]);
    expect(etat.status).toBe('rejected');
    expect(exporte.status).toBe('rejected');
    const motif = (r: PromiseSettledResult<unknown>) => ((r as PromiseRejectedResult).reason as Error).message;
    expect(motif(exporte)).toBe(motif(etat));
    expect(motif(etat)).toBe(MOTIF_EXERCICE_INTROUVABLE);
  });
});
