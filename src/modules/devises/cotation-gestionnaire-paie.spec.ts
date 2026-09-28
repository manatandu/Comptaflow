import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleUtilisateur } from '@prisma/client';
import { DevisesController } from './devises.controller';
import type { DevisesService } from './devises.service';
import { CLE_ACCES_ROLES_CANTONNES } from '../../common/decorators/acces-roles-cantonnes.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  DEVISE_DE_LA_PAIE,
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
 * paie lit · l'USD, à la date exacte du jour de Kinshasa, et seulement tant
 * qu'il n'est pas coté (relecture adverse · la cotation est un upsert, et un
 * cours n'est pas au journal d'audit).
 */

const { ADMIN_CABINET, COMPTABLE, AIDE_COMPTABLE, GESTIONNAIRE_PAIE } = RoleUtilisateur;

// 28 septembre 2026, 9 h UTC · 10 h à Kinshasa, le même jour.
const MATIN_DU_28 = new Date('2026-09-28T09:00:00Z');
// 27 septembre 2026, 23 h 30 UTC · il est déjà 0 h 30 le 28 à Kinshasa.
const TARD_LE_27_UTC = new Date('2026-09-27T23:30:00Z');

describe('la règle · le gestionnaire de paie ne cote que le cours que sa paie lit', () => {
  it('admet le cours de l’USD à la date du jour, celle que la paie cherche', () => {
    expect(DEVISE_DE_LA_PAIE).toBe('USD');
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28', MATIN_DU_28, [])).toBeNull();
  });

  it('refuse une autre devise, même au jour dit · aucune paie ne la convertit', () => {
    expect(motifRefusCotationGestionnairePaie('EUR', '2026-09-28', MATIN_DU_28, [])).toMatch(/que le dollar américain \(USD\)/);
  });

  it('refuse la veille et le lendemain, en nommant le jour qu’il peut coter', () => {
    for (const autreJour of ['2026-09-27', '2026-09-29']) {
      expect(motifRefusCotationGestionnairePaie('USD', autreJour, MATIN_DU_28, [])).toMatch(/cours du jour.*le 28\/09\/2026/);
    }
  });

  it('refuse le bon jour posé à une autre heure · la paie le cherche par égalité sur minuit UTC', () => {
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28T10:00:00Z', MATIN_DU_28, [])).not.toBeNull();
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28T00:00:00.000Z', MATIN_DU_28, [])).toBeNull();
  });

  it('le jour est celui de Kinshasa · à 23 h 30 UTC le 27, c’est déjà le 28', () => {
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28', TARD_LE_27_UTC, [])).toBeNull();
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-27', TARD_LE_27_UTC, [])).not.toBeNull();
  });

  it('un cours du jour déjà coté ne se réécrit pas par lui · la correction se demande au comptable (relecture adverse)', () => {
    // La cotation est un upsert, et CoursDevise n'est pas au journal d'audit ·
    // réécrit par le gestionnaire, le cours posé par le comptable changerait
    // sans trace, alors que la facture d'abonnement le lit le jour même.
    const coteLe28 = [new Date('2026-09-28T00:00:00.000Z')];
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28', MATIN_DU_28, coteLe28)).toMatch(
      /déjà coté.*correction se demande au comptable/,
    );
  });

  it('un cours d’un autre jour ne l’empêche pas de coter celui du jour · la clé est (devise, date) à l’instant', () => {
    const autres = [new Date('2026-09-27T00:00:00.000Z'), new Date('2026-09-28T10:00:00.000Z'), new Date('2026-09-29T00:00:00.000Z')];
    expect(motifRefusCotationGestionnairePaie('USD', '2026-09-28', MATIN_DU_28, autres)).toBeNull();
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
    const controleur = new DevisesController({ lister, poserCours } as unknown as DevisesService);
    return { controleur, lister, poserCours };
  }
  const utilisateur = (role: RoleUtilisateur, tenantId = 't-1') =>
    ({ userId: 'u-1', tenantId, email: 'paie@exemple.cd', role }) as never;

  beforeEach(() => {
    jest.useFakeTimers({ now: MATIN_DU_28, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('cote l’USD du jour, dans le dossier de la session', async () => {
    const { controleur, lister, poserCours } = monter();
    const dto = { date: '2026-09-28', cours: 2850.5, source: 'BCC' };
    await controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', dto);
    expect(lister).toHaveBeenCalledWith('t-1');
    expect(poserCours).toHaveBeenCalledWith('t-1', 'usd', dto);
  });

  it('refuse une autre devise sans rien écrire', async () => {
    const { controleur, poserCours } = monter();
    await expect(
      controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'eur', { date: '2026-09-28', cours: 3100 }),
    ).rejects.toThrow(ForbiddenException);
    expect(poserCours).not.toHaveBeenCalled();
  });

  it('refuse un autre jour sans rien écrire', async () => {
    const { controleur, poserCours } = monter();
    await expect(
      controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), 'usd', { date: '2026-09-27', cours: 2850 }),
    ).rejects.toThrow(/le 28\/09\/2026/);
    expect(poserCours).not.toHaveBeenCalled();
  });

  it('une devise que la liste du dossier ne porte pas est refusée ici, sans rien écrire', async () => {
    // Même une devise d'un autre dossier · le contrôleur ne s'en remet plus
    // au service, que la borne ne couvrirait pas (relecture adverse de F247).
    const { controleur, poserCours } = monter();
    for (const id of ['inconnue', 'usd-2']) {
      await expect(
        controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE), id, { date: '2026-09-28', cours: 1 }),
      ).rejects.toThrow(NotFoundException);
    }
    expect(poserCours).not.toHaveBeenCalled();
  });

  it('refuse de réécrire le cours du jour déjà coté, sans rien écrire', async () => {
    const { controleur, lister, poserCours } = monter();
    await expect(
      controleur.poserCours(utilisateur(GESTIONNAIRE_PAIE, 't-2'), 'usd-2', { date: '2026-09-28', cours: 9999 }),
    ).rejects.toThrow(/déjà coté/);
    expect(lister).toHaveBeenCalledWith('t-2');
    expect(poserCours).not.toHaveBeenCalled();
  });

  it('la borne ne vise que lui · le comptable et l’administrateur cotent toute devise à toute date', async () => {
    for (const role of [COMPTABLE, ADMIN_CABINET, AIDE_COMPTABLE]) {
      const { controleur, lister, poserCours } = monter();
      await controleur.poserCours(utilisateur(role), 'eur', { date: '2026-01-15', cours: 3100 });
      expect(poserCours).toHaveBeenCalledTimes(1);
      expect(lister).not.toHaveBeenCalled();
    }
  });
});
