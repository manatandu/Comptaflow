import { BadRequestException } from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import { jourDeKinshasa, usdEnFc } from './conversion-usd';
import type { SimulationPaieDto } from './dto/personnel.dto';

/**
 * LE SALAIRE STIPULÉ EN DOLLARS · règle du cabinet (Manasse, 2026-09-24) :
 * « le taux est le taux actuel, donc il faudra toujours renseigner le taux
 * chaque jour ». Aucun texte du corpus ne fixe ce cours pour la paie
 * (plan item 11) · le Code du travail, art. 89, veut même la rémunération
 * stipulée en monnaie ayant cours légal, ce que le calcul rappelle.
 *
 * Quatre garanties :
 *  · le cours lu est celui du JOUR du calcul, au calendrier de Kinshasa ;
 *  · un jour sans cours saisi REFUSE le calcul, jamais le cours d'hier ;
 *  · le calcul en dollars donne exactement celui en francs convertis ;
 *  · un salaire en francs ne lit aucun cours.
 */

// 24 septembre 2026, 23 h 30 UTC · il est déjà 00 h 30 le 25 à Kinshasa.
const TARD_LE_24_UTC = new Date('2026-09-24T23:30:00Z');
const MIDI_LE_24_UTC = new Date('2026-09-24T12:00:00Z');

function service(cours: Record<string, number>) {
  const lectures: unknown[] = [];
  const prisma = {
    salarie: { findFirst: jest.fn().mockResolvedValue(null) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
    coursDevise: {
      findFirst: jest.fn(async (args: { where: { date: Date; devise: { tenantId: string; code: string } } }) => {
        lectures.push(args.where);
        const cle = args.where.date.toISOString().slice(0, 10);
        return cle in cours ? { cours: cours[cle], source: 'BCC' } : null;
      }),
    },
  } as unknown as PrismaService;
  return { svc: new PersonnelService(prisma), lectures };
}

const enUsd = (montantUsd: number): SimulationPaieDto =>
  ({
    moisDePaie: '2026-09',
    deviseStipulation: 'USD',
    elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantUsd }],
  }) as SimulationPaieDto;

const enFc = (montantFc: number): SimulationPaieDto =>
  ({
    moisDePaie: '2026-09',
    elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc }],
  }) as SimulationPaieDto;

describe('salaire en USD · le cours du jour, et lui seul', () => {
  it('convertit au centime, sans arrondir au franc', () => {
    expect(usdEnFc(1234.57, 2850.33)).toBe(3518931.91);
  });

  it('le jour de Kinshasa bascule à 23 h UTC', () => {
    expect(jourDeKinshasa(TARD_LE_24_UTC).toISOString()).toBe('2026-09-25T00:00:00.000Z');
    expect(jourDeKinshasa(MIDI_LE_24_UTC).toISOString()).toBe('2026-09-24T00:00:00.000Z');
  });

  it('convertit au cours du jour, élément par élément, et le rend', async () => {
    const { svc, lectures } = service({ '2026-09-24': 2850.5 });
    const res = await svc.simulerPaie('t-1', null, enUsd(1200), MIDI_LE_24_UTC);

    // Le cours est cherché dans CE dossier, pour USD, à la date exacte.
    expect(lectures[0]).toEqual({ date: new Date('2026-09-24T00:00:00Z'), devise: { tenantId: 't-1', code: 'USD' } });
    expect(res.conversion).toMatchObject({
      devise: 'USD',
      cours: 2850.5,
      dateCours: '2026-09-24',
      sourceCours: 'BCC',
      elements: [{ libelle: 'Salaire', montantUsd: 1200, montantFc: 3_420_600 }],
    });
    expect(res.conversion!.avertissement).toContain('art. 89');
    expect(res.net.totalVerseFc).toBe(3_420_600);
  });

  it('donne exactement le calcul du même salaire saisi en francs', async () => {
    const { svc } = service({ '2026-09-24': 2850.5 });
    const usd = await svc.simulerPaie('t-1', null, enUsd(1200), MIDI_LE_24_UTC);
    const fc = await svc.simulerPaie('t-1', null, enFc(usdEnFc(1200, 2850.5)), MIDI_LE_24_UTC);
    const { conversion, ...resteUsd } = usd;
    const { conversion: aucune, ...resteFc } = fc;
    expect(conversion).not.toBeNull();
    expect(aucune).toBeNull();
    expect(resteUsd).toEqual(resteFc);
  });

  it('refuse sans cours du jour, même si le cours de la veille existe', async () => {
    const { svc } = service({ '2026-09-24': 2850.5 });
    const echec = svc.simulerPaie('t-1', null, enUsd(1200), TARD_LE_24_UTC);
    await expect(echec).rejects.toThrow(BadRequestException);
    await expect(svc.simulerPaie('t-1', null, enUsd(1200), TARD_LE_24_UTC)).rejects.toThrow(
      /Aucun cours du dollar américain \(USD\) n'est renseigné pour aujourd'hui, 25\/09\/2026/,
    );
  });

  it('refuse un élément sans montant en dollars, et un montant en dollars hors stipulation USD', async () => {
    const { svc } = service({ '2026-09-24': 2850.5 });
    await expect(
      svc.simulerPaie(
        't-1',
        null,
        { ...enUsd(1200), elements: [{ nature: 'PRIME', libelle: 'Prime', montantFc: 10 }] } as SimulationPaieDto,
        MIDI_LE_24_UTC,
      ),
    ).rejects.toThrow(/élément\(s\) sans montant en dollars : Prime/);
    await expect(
      svc.simulerPaie('t-1', null, { ...enUsd(1200), deviseStipulation: undefined }, MIDI_LE_24_UTC),
    ).rejects.toThrow(/sans montant en francs : Salaire/);
  });

  it('un salaire en francs ne lit aucun cours', async () => {
    const { svc, lectures } = service({});
    const res = await svc.simulerPaie('t-1', null, enFc(1_000_000), MIDI_LE_24_UTC);
    expect(lectures).toEqual([]);
    expect(res.conversion).toBeNull();
  });
});
