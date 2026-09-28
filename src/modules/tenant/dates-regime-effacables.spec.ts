import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ModifierRegimeDto } from './dto/parametres-dossier.dto';
import { dateSaisieOuEffacement } from './date-effacable';
import { TenantService } from './tenant.service';

/**
 * DATES DU RÉGIME DE TVA · audit final F237.
 *
 * La date d'option (ou de franchissement du seuil) et la date de
 * l'autorisation aux débits ne pouvaient pas être effacées : la chaîne vide,
 * qui vaut effacement partout ailleurs dans les paramètres du dossier, était
 * refusée par `@IsDateString`, et le service passait toute valeur à
 * `new Date`. Une date saisie par erreur restait donc au dossier pour de bon.
 */

const CHAMPS = ['dateOptionTva', 'dateAutorisationDebitsTva'] as const;

const erreursSur = async (corps: Record<string, unknown>, champ: string) =>
  (await validate(plainToInstance(ModifierRegimeDto, corps))).filter((e) => e.property === champ);

describe('F237 · la validation laisse passer l’effacement', () => {
  for (const champ of CHAMPS) {
    it(`${champ} · la chaîne vide passe, une date ISO aussi, un texte libre non`, async () => {
      expect(await erreursSur({ [champ]: '' }, champ)).toHaveLength(0);
      expect(await erreursSur({ [champ]: '2026-03-01' }, champ)).toHaveLength(0);
      // La garde n'ouvre que la chaîne VIDE · une valeur qui n'est pas une
      // date reste refusée, espaces compris.
      expect(await erreursSur({ [champ]: '1er mars' }, champ)).not.toHaveLength(0);
      expect(await erreursSur({ [champ]: '   ' }, champ)).not.toHaveLength(0);
    });
  }
});

describe('F237 · la conversion au service', () => {
  it('absent = inchangé, vide ou null = effacé, sinon la date saisie', () => {
    expect(dateSaisieOuEffacement(undefined)).toBeUndefined();
    expect(dateSaisieOuEffacement('')).toBeNull();
    expect(dateSaisieOuEffacement('  ')).toBeNull();
    // `new Date(null)` rendait le 1er janvier 1970 · une date inventée.
    expect(dateSaisieOuEffacement(null)).toBeNull();
    expect((dateSaisieOuEffacement('2026-03-01') as Date).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  // Relecture adverse d'audit final F237 · ces formes passent `@IsDateString`
  // (vérifié ci-dessous sur le DTO), et `new Date` ne les lit pas : la date
  // invalide partait à Prisma, qui répondait 500.
  it('une date que `new Date` ne lit pas est refusée en 400, jamais transmise', () => {
    for (const illisible of ['2026-W05', '2026-032', '20260101']) {
      expect(() => dateSaisieOuEffacement(illisible)).toThrow(BadRequestException);
    }
  });

  it('un jour absent du calendrier est refusé, jamais reporté au mois suivant', () => {
    // `new Date('2026-02-30')` rend le 2 mars, sans erreur.
    expect(() => dateSaisieOuEffacement('2026-02-30')).toThrow(BadRequestException);
    expect(() => dateSaisieOuEffacement('2026-04-31T00:00:00.000Z')).toThrow(BadRequestException);
    expect(() => dateSaisieOuEffacement('2025-02-29')).toThrow(BadRequestException);
    // Un vrai 29 février, et un instant à fuseau dont le jour écrit existe.
    expect((dateSaisieOuEffacement('2028-02-29') as Date).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect((dateSaisieOuEffacement('2026-03-01T00:30:00+01:00') as Date).toISOString()).toBe(
      '2026-02-28T23:30:00.000Z',
    );
  });
});

describe('F237 · ce que le DTO laisse passer, le service doit le lire', () => {
  for (const champ of CHAMPS) {
    it(`${champ} · les formes que new Date ne lit pas franchissent la validation`, async () => {
      // Prémisse du refus au service : si le DTO les arrêtait, le refus serait
      // inutile ; il ne les arrête pas.
      for (const forme of ['2026-W05', '2026-02-30']) {
        expect(await erreursSur({ [champ]: forme }, champ)).toHaveLength(0);
      }
    });
  }
});

describe('F237 · câblage de modifierRegime', () => {
  const service = () => {
    const appels: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
    const prisma = {
      tenant: {
        // La doublure honore son filtre · un autre dossier est introuvable.
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === 't1' ? { id: 't1' } : null),
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          appels.push(args);
          return { id: 't1' };
        },
      },
    };
    const s = new TenantService(prisma as never);
    // Seul le `data` écrit nous intéresse · la relecture des paramètres est
    // couverte ailleurs (identifiants-legaux.spec.ts).
    (s as unknown as { parametres: () => Promise<null> }).parametres = async () => null;
    return { s, appels };
  };

  it('la chaîne vide écrit null sur les deux dates', async () => {
    const { s, appels } = service();
    await s.modifierRegime('t1', { dateOptionTva: '', dateAutorisationDebitsTva: '' });
    expect(appels).toHaveLength(1);
    expect(appels[0].where).toEqual({ id: 't1' });
    expect(appels[0].data.dateOptionTva).toBeNull();
    expect(appels[0].data.dateAutorisationDebitsTva).toBeNull();
  });

  it('null écrit null, jamais le 1er janvier 1970', async () => {
    const { s, appels } = service();
    await s.modifierRegime('t1', { dateOptionTva: null as never, dateAutorisationDebitsTva: null as never });
    expect(appels[0].data.dateOptionTva).toBeNull();
    expect(appels[0].data.dateAutorisationDebitsTva).toBeNull();
  });

  it('une date ISO est posée telle quelle', async () => {
    const { s, appels } = service();
    await s.modifierRegime('t1', { dateOptionTva: '2025-07-01', dateAutorisationDebitsTva: '2026-02-16' });
    expect((appels[0].data.dateOptionTva as Date).toISOString().slice(0, 10)).toBe('2025-07-01');
    expect((appels[0].data.dateAutorisationDebitsTva as Date).toISOString().slice(0, 10)).toBe('2026-02-16');
  });

  it('une date non transmise n’est pas touchée', async () => {
    const { s, appels } = service();
    await s.modifierRegime('t1', { effectifPermanent: 12 });
    expect(appels[0].data).not.toHaveProperty('dateOptionTva');
    expect(appels[0].data).not.toHaveProperty('dateAutorisationDebitsTva');
    expect(appels[0].data.effectifPermanent).toBe(12);
  });

  it('une date illisible est refusée en 400 avant toute écriture', async () => {
    const { s, appels } = service();
    await expect(s.modifierRegime('t1', { dateOptionTva: '2026-W05' })).rejects.toThrow(BadRequestException);
    await expect(s.modifierRegime('t1', { dateAutorisationDebitsTva: '2026-02-30' })).rejects.toThrow(
      BadRequestException,
    );
    expect(appels).toHaveLength(0);
  });

  it('un autre dossier est introuvable, rien n’est écrit', async () => {
    const { s, appels } = service();
    await expect(s.modifierRegime('t2', { dateOptionTva: '' })).rejects.toThrow('Dossier introuvable');
    expect(appels).toHaveLength(0);
  });
});

describe('F237 · le jumeau · les deux dates de l’identité (audit de cohérence du lot)', () => {
  /**
   * La date de l'arrêté de personnalité juridique et celle de l'attestation
   * d'exemption suivaient la même convention que les dates du régime, et
   * gardaient le défaut que F237 a fermé sur celles-ci · `new Date` sur une
   * forme ISO illisible (500) et un jour absent du calendrier reporté au mois
   * suivant. Une correction n'est finie que quand on a cherché son jumeau.
   */
  const service = (referentiel: 'SYCEBNL' | 'SYSCOHADA' = 'SYCEBNL') => {
    const appels: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
    const prisma = {
      tenant: {
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === 't1' ? { id: 't1', referentiel } : null),
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          appels.push(args);
          return { id: 't1' };
        },
      },
    };
    const s = new TenantService(prisma as never);
    (s as unknown as { parametres: () => Promise<null> }).parametres = async () => null;
    return { s, appels };
  };

  it('une date illisible ou absente du calendrier est refusée en 400, avant toute écriture', async () => {
    const { s, appels } = service();
    await expect(s.modifierIdentite('t1', { dateActePersonnalite: '2026-W05' })).rejects.toThrow(BadRequestException);
    await expect(s.modifierIdentite('t1', { dateAttestationExemptionIs: '2026-02-30' })).rejects.toThrow(BadRequestException);
    expect(appels).toHaveLength(0);
  });

  it('vide ou null efface, une date ISO se pose, absente ne touche à rien', async () => {
    const { s, appels } = service();
    await s.modifierIdentite('t1', { dateActePersonnalite: '', dateAttestationExemptionIs: null as never });
    expect(appels[0].data.dateActePersonnalite).toBeNull();
    expect(appels[0].data.dateAttestationExemptionIs).toBeNull();
    await s.modifierIdentite('t1', { dateActePersonnalite: '2025-06-30' });
    expect((appels[1].data.dateActePersonnalite as Date).toISOString()).toBe('2025-06-30T00:00:00.000Z');
    expect(appels[1].data.dateAttestationExemptionIs).toBeUndefined();
  });

  it('un identifiant à null s’efface au lieu de lever une TypeError, et ne passe pas pour renseigné', async () => {
    // `@IsOptional` laisse passer null · `.trim()` sur lui rendait un 500.
    const { s, appels } = service('SYSCOHADA');
    await s.modifierIdentite('t1', { numeroImpot: null as never, dateActePersonnalite: null as never });
    expect(appels[0].data.numeroImpot).toBeNull();
    expect(appels[0].data.dateActePersonnalite).toBeNull();
  });
});
