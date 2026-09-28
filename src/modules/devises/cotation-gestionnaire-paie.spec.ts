import { ConflictException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma, RoleUtilisateur } from '@prisma/client';
import { DevisesController } from './devises.controller';
import { DevisesService } from './devises.service';
import type { PrismaService } from '../../common/prisma.service';
import type { EcritureService } from '../comptabilite/ecriture.service';
import { CLE_ACCES_ROLES_CANTONNES } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  DEVISE_DE_LA_PAIE,
  messageCoursDejaCote,
  messageCoursManquant,
  motifRefusCotationGestionnairePaie,
} from '../personnel/conversion-usd';

/**
 * LE GESTIONNAIRE DE PAIE COTE LE COURS DU JOUR (audit final F247).
 *
 * Sa paie stipulée en dollars exige le cours de l'USD du jour, et la fenêtre
 * Devises lui était fermée · chaque jour de paie attendait un comptable, et le
 * refus du calcul renvoyait à une fenêtre qu'il ne pouvait pas ouvrir.
 * L'ouverture est ÉTROITE · lire les devises et coter, rien d'autre du module
 * (ni création, ni réévaluation), et la cotation elle-même bornée à ce que la
 * paie lit · l'USD, à la date exacte du jour de Kinshasa. Et il ne fait que
 * CRÉER (2026-09-28) · un cours n'est pas au journal d'audit, et l'`upsert`
 * du comptable réécrivait sans trace un cours déjà coté, que la vérification
 * lue avant d'écrire ne voyait pas toujours (douze cours lus, et une course
 * entre la lecture et l'écriture). La clé unique de la base refuse en 409.
 */

const { ADMIN_CABINET, COMPTABLE, AIDE_COMPTABLE, GESTIONNAIRE_PAIE } = RoleUtilisateur;

// 28 septembre 2026, 9 h UTC · 10 h à Kinshasa, le même jour.
const MATIN_DU_28 = new Date('2026-09-28T09:00:00Z');
// 27 septembre 2026, 23 h 30 UTC · il est déjà 0 h 30 le 28 à Kinshasa.
const TARD_LE_27_UTC = new Date('2026-09-27T23:30:00Z');

describe('la règle · le gestionnaire de paie ne cote que le cours que sa paie lit', () => {
  it('admet le cours de l’USD à la date du jour, celle que la paie cherche', () => {
    expect(DEVISE_DE_LA_PAIE).toBe('USD');
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28', MATIN_DU_28)).toBeNull();
  });

  it('refuse une autre devise, même au jour dit · aucune paie ne la convertit', () => {
    expect(motifRefusCotationGestionnairePaie('EUR', '2026-09-28', MATIN_DU_28)).toMatch(/que le dollar américain \(USD\)/);
  });

  it('refuse la veille et le lendemain, en nommant le jour qu’il peut coter', () => {
    for (const autreJour of ['2026-09-27', '2026-09-29']) {
      expect(motifRefusCotationGestionnairePaie('USD', autreJour, MATIN_DU_28)).toMatch(/cours du jour.*le 28\/09\/2026/);
    }
  });

  it('refuse le bon jour posé à une autre heure · la paie le cherche par égalité sur minuit UTC', () => {
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28T10:00:00Z', MATIN_DU_28)).not.toBeNull();
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28T00:00:00.000Z', MATIN_DU_28)).toBeNull();
  });

  it('le jour est celui de Kinshasa · à 23 h 30 UTC le 27, c’est déjà le 28', () => {
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28', TARD_LE_27_UTC)).toBeNull();
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-27', TARD_LE_27_UTC)).not.toBeNull();
  });

  it('le refus du cours déjà coté nomme le jour et renvoie au comptable', () => {
    expect(messageCoursDejaCote(new Date('2026-09-28T00:00:00.000Z'))).toMatch(
      /cours de l'USD du 28\/09\/2026 est déjà coté.*correction se demande au comptable/,
    );
  });

  it('le refus du calcul de paie dit où coter et qui peut le faire', () => {
    const message = messageCoursManquant(new Date('2026-09-28T00:00:00Z'));
    expect(message).toContain('fenêtre Devises');
    expect(message).toContain('ouverte au gestionnaire de paie pour ce seul cours');
    expect(message).toContain("l'administrateur l'ajoute d'abord");
  });
});

describe('les routes du module ouvertes au gestionnaire de paie, et elles seules', () => {
  const proto = DevisesController.prototype as unknown as Record<string, object>;
  const routes = Object.getOwnPropertyNames(DevisesController.prototype).filter((n) => n !== 'constructor');
  const OUVERTES = ['lister', 'poserCours'];
  const garde = new JwtAuthGuard(new Reflector());
  const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => Promise<boolean> };
  const contexte = (role: RoleUtilisateur, methode: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: { role }, method: 'POST' }), getResponse: () => ({}) }),
      getHandler: () => proto[methode],
      getClass: () => DevisesController,
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.spyOn(parent, 'canActivate').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());

  it('le recensement trouve encore les routes fermées · un garde-fou vide ne vérifie rien', () => {
    expect(routes).toEqual(expect.arrayContaining(['creer', 'modifier', 'calculer', 'reevaluer', 'listerReevaluations', 'extourner']));
  });

  it('lire les devises et coter un cours portent l’ouverture', () => {
    for (const methode of OUVERTES) {
      expect([methode, Reflect.getMetadata(CLE_ACCES_ROLES_CANTONNES, proto[methode])]).toEqual([methode, { gestionnairePaie: true }]);
    }
  });

  it('JwtAuthGuard laisse le gestionnaire lire et coter', async () => {
    for (const methode of OUVERTES) {
      await expect(garde.canActivate(contexte(GESTIONNAIRE_PAIE, methode))).resolves.toBe(true);
    }
  });

  it('JwtAuthGuard lui ferme tout le reste · création, réévaluation, contre-passation', async () => {
    for (const methode of routes.filter((r) => !OUVERTES.includes(r))) {
      await expect(garde.canActivate(contexte(GESTIONNAIRE_PAIE, methode))).rejects.toThrow(/cantonné au personnel et à la paie/);
    }
  });

  it('RolesGuard le lit comme le comptable sur la cotation, jamais sur la création réservée à l’administrateur', () => {
    const roles = new RolesGuard(new Reflector());
    expect(roles.canActivate(contexte(GESTIONNAIRE_PAIE, 'poserCours'))).toBe(true);
    expect(() => roles.canActivate(contexte(GESTIONNAIRE_PAIE, 'creer'))).toThrow(ForbiddenException);
    expect(() => roles.canActivate(contexte(GESTIONNAIRE_PAIE, 'reevaluer'))).toThrow(ForbiddenException);
  });

  it('l’aide-comptable garde ce qu’il avait · il cote et réévalue comme avant', async () => {
    await expect(garde.canActivate(contexte(AIDE_COMPTABLE, 'poserCours'))).resolves.toBe(true);
    await expect(garde.canActivate(contexte(AIDE_COMPTABLE, 'reevaluer'))).resolves.toBe(true);
    expect(new RolesGuard(new Reflector()).canActivate(contexte(AIDE_COMPTABLE, 'poserCours'))).toBe(true);
  });
});

describe('le contrôleur borne la cotation du gestionnaire de paie', () => {
  const DEVISES_DU_DOSSIER: Record<string, { id: string; code: string; cours: { date: Date }[] }[]> = {
    't-1': [
      { id: 'usd', code: 'USD', cours: [{ date: new Date('2026-09-27T00:00:00.000Z') }] },
      { id: 'eur', code: 'EUR', cours: [] },
    ],
    't-2': [{ id: 'usd-2', code: 'USD', cours: [{ date: new Date('2026-09-28T00:00:00.000Z') }] }],
  };

  function monter() {
    // La doublure honore le dossier demandé · une devise d'un autre dossier
    // n'y est pas, comme dans la base.
    const lister = jest.fn(async (tenantId: string) => DEVISES_DU_DOSSIER[tenantId] ?? []);
    const poserCours = jest.fn(async () => ({ ok: true }));
    const ajouterCours = jest.fn(async () => ({ ok: true }));
    const controleur = new DevisesController({ lister, poserCours, ajouterCours } as unknown as DevisesService);
    return { controleur, lister, poserCours, ajouterCours };
  }
  const utilisateur = (role: RoleUtilisateur, tenantId = 't-1') =>
    ({ userId: 'u-1', tenantId, email: 'paie@exemple.cd', role }) as never;

  beforeEach(() => {
    jest.useFakeTimers({ now: MATIN_DU_28, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('cote l’USD du jour par la CRÉATION seule, jamais par l’upsert du comptable', async () => {
    const { controleur, lister, poserCours, ajouterCours } = monter();
    const dto = { date: '2026-09-28', cours: 2850.5, source: 'BCC' };
    await controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', dto);
    expect(lister).toHaveBeenCalledWith('t-1');
    expect(ajouterCours).toHaveBeenCalledWith('t-1', 'usd', dto, messageCoursDejaCote(new Date('2026-09-28T00:00:00.000Z')));
    expect(poserCours).not.toHaveBeenCalled();
  });

  it('le jour déjà coté part aussi à la création · c’est la base qui refuse, pas une liste de douze cours', async () => {
    // Le cours du 28 figure dans la liste de t-2 · l'ancien refus le lisait
    // là. Il part désormais à la création, dont la clé unique tranche à
    // l'instant de l'écriture (preuve plus bas, sur la base simulée).
    const { controleur, lister, poserCours, ajouterCours } = monter();
    await controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE, 't-2'), 'usd-2', { date: '2026-09-28', cours: 9999 });
    expect(lister).toHaveBeenCalledWith('t-2');
    expect(ajouterCours).toHaveBeenCalledTimes(1);
    expect(poserCours).not.toHaveBeenCalled();
  });

  it('refuse une autre devise sans rien écrire', async () => {
    const { controleur, poserCours, ajouterCours } = monter();
    await expect(
      controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'eur', { date: '2026-09-28', cours: 3100 }),
    ).rejects.toThrow(ForbiddenException);
    expect(poserCours).not.toHaveBeenCalled();
    expect(ajouterCours).not.toHaveBeenCalled();
  });

  it('refuse un autre jour sans rien écrire', async () => {
    const { controleur, poserCours, ajouterCours } = monter();
    await expect(
      controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', { date: '2026-09-27', cours: 2850 }),
    ).rejects.toThrow(/le 28\/09\/2026/);
    expect(poserCours).not.toHaveBeenCalled();
    expect(ajouterCours).not.toHaveBeenCalled();
  });

  it('une devise que la liste du dossier ne porte pas est refusée ici, sans rien écrire', async () => {
    // Même une devise d'un autre dossier · le contrôleur ne s'en remet plus
    // au service, que la borne ne couvrirait pas (relecture adverse de F247).
    const { controleur, poserCours, ajouterCours } = monter();
    for (const id of ['inconnue', 'usd-2']) {
      await expect(
        controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), id, { date: '2026-09-28', cours: 1 }),
      ).rejects.toThrow(NotFoundException);
    }
    expect(poserCours).not.toHaveBeenCalled();
    expect(ajouterCours).not.toHaveBeenCalled();
  });

  it('la borne ne vise que lui · le comptable et l’administrateur cotent toute devise à toute date, et corrigent', async () => {
    for (const role of [COMPTABLE, ADMIN_CABINET, AIDE_COMPTABLE]) {
      const { controleur, lister, poserCours, ajouterCours } = monter();
      await controleur.poserCours(utilisateur(role), 'eur', { date: '2026-01-15', cours: 3100 });
      expect(poserCours).toHaveBeenCalledTimes(1);
      expect(ajouterCours).not.toHaveBeenCalled();
      expect(lister).not.toHaveBeenCalled();
    }
  });
});

/**
 * LA PREUVE SUR LA BASE · un cours existant n'est pas réécrit par le
 * gestionnaire de paie. La doublure tient la clé unique (devise, date) comme
 * la base, et la liste ne rend que les douze cours les plus récents, comme
 * `DevisesService.lister`. Le vrai service et le vrai contrôleur y jouent.
 */
describe('un cours déjà coté ne se réécrit pas par le gestionnaire de paie', () => {
  type Cours = { deviseId: string; date: Date; cours: Prisma.Decimal; source?: string | null };

  function baseSimulee(coursInitiaux: Cours[] = []) {
    const devises = [{ id: 'usd', tenantId: 't-1', code: 'USD', intitule: 'Dollar' }];
    const cours: Cours[] = [...coursInitiaux];
    const cle = (deviseId: string, date: Date) => `${deviseId}|${date.toISOString()}`;
    const doublon = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const prisma = {
      devise: {
        findMany: jest.fn(async ({ where }: { where: { tenantId: string } }) =>
          devises
            .filter((d) => d.tenantId === where.tenantId)
            .map((d) => ({
              ...d,
              cours: cours
                .filter((c) => c.deviseId === d.id)
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .slice(0, 12),
            })),
        ),
        findFirst: jest.fn(
          async ({ where }: { where: { id: string; tenantId: string } }) =>
            devises.find((d) => d.id === where.id && d.tenantId === where.tenantId) ?? null,
        ),
      },
      coursDevise: {
        create: jest.fn(async ({ data }: { data: Cours }) => {
          if (cours.some((c) => cle(c.deviseId, c.date) === cle(data.deviseId, data.date))) throw doublon();
          cours.push({ ...data });
          return data;
        }),
        upsert: jest.fn(
          async (args: {
            where: { deviseId_date: { deviseId: string; date: Date } };
            create: Cours;
            update: Partial<Cours>;
          }) => {
            const k = cle(args.where.deviseId_date.deviseId, args.where.deviseId_date.date);
            const existant = cours.find((c) => cle(c.deviseId, c.date) === k);
            if (existant) return Object.assign(existant, args.update);
            cours.push({ ...args.create });
            return args.create;
          },
        ),
      },
    };
    const service = new DevisesService(prisma as unknown as PrismaService, {} as EcritureService);
    const controleur = new DevisesController(service);
    const coursDu = (iso: string) =>
      cours.find((c) => c.date.toISOString() === new Date(iso).toISOString())?.cours.toString() ?? null;
    return { prisma, controleur, coursDu };
  }
  const utilisateur = (role: RoleUtilisateur) =>
    ({ userId: 'u-1', tenantId: 't-1', email: 'x@exemple.cd', role }) as never;
  const JOUR = '2026-09-28T00:00:00.000Z';

  beforeEach(() => {
    jest.useFakeTimers({ now: MATIN_DU_28, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('le comptable a coté le jour · le gestionnaire est refusé en 409 nommé, et le cours reste celui du comptable', async () => {
    const { prisma, controleur, coursDu } = baseSimulee();
    await controleur.poserCours(utilisateur(COMPTABLE), 'usd', { date: '2026-09-28', cours: 2850 });
    const refus = controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', { date: '2026-09-28', cours: 9999 });
    await expect(refus).rejects.toThrow(ConflictException);
    await expect(refus).rejects.toMatchObject({ status: 409 });
    await expect(refus).rejects.toThrow(messageCoursDejaCote(new Date(JOUR)));
    expect(coursDu(JOUR)).toBe('2850');
    // Le comptable seul est passé par l'upsert.
    expect(prisma.coursDevise.upsert).toHaveBeenCalledTimes(1);
  });

  it('même quand la liste ne montre plus le cours du jour · douze cours postérieurs le cachent, la base refuse quand même', async () => {
    // Des cours datés après le 28 (saisis d'avance par le comptable) poussent
    // celui du jour hors des douze que rend la liste · une vérification lue
    // dans la liste l'aurait laissé réécrire.
    const plusTard = Array.from({ length: 12 }, (_, i) => ({
      deviseId: 'usd',
      date: new Date(Date.UTC(2026, 9, 1 + i)),
      cours: new Prisma.Decimal(2900 + i),
    }));
    const { controleur, coursDu } = baseSimulee([
      { deviseId: 'usd', date: new Date(JOUR), cours: new Prisma.Decimal(2850) },
      ...plusTard,
    ]);
    await expect(
      controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', { date: '2026-09-28', cours: 9999 }),
    ).rejects.toThrow(ConflictException);
    expect(coursDu(JOUR)).toBe('2850');
  });

  it('le jour encore vide · le gestionnaire le cote', async () => {
    const { controleur, coursDu } = baseSimulee([
      { deviseId: 'usd', date: new Date('2026-09-27T00:00:00.000Z'), cours: new Prisma.Decimal(2840) },
    ]);
    await controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', { date: '2026-09-28', cours: 2850 });
    expect(coursDu(JOUR)).toBe('2850');
    expect(coursDu('2026-09-27T00:00:00.000Z')).toBe('2840');
  });

  it('le comptable garde la correction · son upsert réécrit le cours du jour', async () => {
    const { controleur, coursDu } = baseSimulee([
      { deviseId: 'usd', date: new Date(JOUR), cours: new Prisma.Decimal(2850) },
    ]);
    await controleur.poserCours(utilisateur(COMPTABLE), 'usd', { date: '2026-09-28', cours: 2855 });
    expect(coursDu(JOUR)).toBe('2855');
  });

  it('une autre panne de la base remonte telle quelle, jamais déguisée en « déjà coté »', async () => {
    const { prisma, controleur } = baseSimulee();
    const panne = new Error('connexion perdue');
    prisma.coursDevise.create.mockRejectedValueOnce(panne);
    await expect(
      controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', { date: '2026-09-28', cours: 2850 }),
    ).rejects.toBe(panne);
  });
});
