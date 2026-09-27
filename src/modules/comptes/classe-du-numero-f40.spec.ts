import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompteService } from './compte.service';
import { CreerCompteDto } from './dto/creer-compte.dto';
import { classeDuNumero } from './classe-du-numero';
import { PLAN_COMPTES_SYCEBNL } from './compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from './compte-seed-syscohada';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDIT FINAL F40 · LA CLASSE D'UN COMPTE CRÉÉ SE LIT DANS SON NUMÉRO.
 *
 * L'écran partait de la classe 1 et le serveur recopiait ce qu'il recevait ·
 * un 6xxx créé sans toucher la liste était rangé en classe 1. Le bilan, qui
 * lit la classe, et le compte de résultat, qui lit le numéro, divergeaient
 * sur une balance qui bouclait.
 */

function harnais() {
  const crees: Record<string, unknown>[] = [];
  const p = {
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ longueurCompte: 8 })) },
    natureCompte: {
      findMany: jest.fn(async () => [{ nature: 'CHARGES', fourchettes: [], modeReportANouveau: 'AUCUN', lettrable: false }]),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    compte: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        crees.push(data);
        return data;
      }),
    },
  };
  return { svc: new CompteService(p as unknown as PrismaService), crees };
}

describe('F40 · la règle, écrite une fois', () => {
  it('le premier chiffre du numéro donne la classe', () => {
    expect(classeDuNumero('60110000')).toBe('CLASSE_6');
    expect(classeDuNumero('9')).toBe('CLASSE_9');
    expect(classeDuNumero('0123')).toBeNull();
    expect(classeDuNumero('')).toBeNull();
  });

  it('les deux plans semés la respectent sans exception', () => {
    for (const plan of [PLAN_COMPTES_SYCEBNL, PLAN_COMPTES_SYSCOHADA]) {
      const ecarts = plan.filter((c) => c.classe !== classeDuNumero(c.numero)).map((c) => c.numero);
      expect(ecarts).toEqual([]);
    }
  });
});

describe('F40 · la création range le compte dans la classe de son numéro', () => {
  it('sans classe envoyée, un 6xxx est en classe 6', async () => {
    const { svc, crees } = harnais();
    await svc.creer('t1', { numero: '60110010', intitule: 'Achats de riz' });
    expect(crees).toEqual([expect.objectContaining({ numero: '60110010', classe: 'CLASSE_6' })]);
  });

  it('une classe envoyée qui contredit le numéro est refusée, rien n’est créé', async () => {
    const { svc, crees } = harnais();
    await expect(svc.creer('t1', { numero: '60110010', intitule: 'x', classe: 'CLASSE_1' })).rejects.toThrow(
      /est de la classe 6/,
    );
    expect(crees).toEqual([]);
  });

  it('une classe envoyée qui concorde est acceptée', async () => {
    const { svc, crees } = harnais();
    await svc.creer('t1', { numero: '41110010', intitule: 'Client A', classe: 'CLASSE_4' });
    expect(crees[0]).toMatchObject({ classe: 'CLASSE_4' });
  });

  it('un numéro qui commence par 0 n’a pas de classe · refusé', async () => {
    const { svc, crees } = harnais();
    await expect(svc.creer('t1', { numero: '0123', intitule: 'x' })).rejects.toThrow(/chiffre de classe/);
    expect(crees).toEqual([]);
  });
});

describe('F40 · la porte n’exige plus la classe', () => {
  it('le DTO valide sans classe, et refuse une classe inconnue', async () => {
    const sans = plainToInstance(CreerCompteDto, { numero: '601', intitule: 'x' });
    const inconnue = plainToInstance(CreerCompteDto, { numero: '601', intitule: 'x', classe: 'CLASSE_0' });
    expect(await validate(sans)).toEqual([]);
    expect((await validate(inconnue)).map((e) => e.property)).toEqual(['classe']);
  });
});
