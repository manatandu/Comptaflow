import { CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, UseGuards } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RoleUtilisateur } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthGuard } from '@nestjs/passport';
import { rolesSatisfaits, routeOuverteAuRoleCantonne } from './roles-cantonnes';
import { CLE_ACCES_ROLES_CANTONNES } from '../decorators/acces-roles-cantonnes.decorator';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { MotDePasseAChangerGuard } from './mot-de-passe-a-changer.guard';
import { PersonnelController } from '../../modules/personnel/personnel.controller';
import { EcritureController } from '../../modules/comptabilite/ecriture.controller';
import { AffectationController } from '../../modules/affectation/affectation.controller';
import { GroupeController } from '../../modules/groupe/groupe.controller';
import { ExerciceController } from '../../modules/exercice/exercice.controller';
import { AuthController } from '../../modules/auth/auth.controller';

/**
 * LES DEUX RÔLES CANTONNÉS (décision du 2026-09-24, plan item 13), et la garde
 * qui les tient. Trois choses à ne pas défaire :
 *  · l'aide-comptable hérite du comptable PARTOUT où une route ne le refuse ;
 *  · le gestionnaire de paie n'a RIEN tant qu'une route ne l'ouvre pas ;
 *  · les contrôles qui ont besoin de l'utilisateur vivent dans JwtAuthGuard,
 *    parce qu'une garde globale passe AVANT lui et ne le voit jamais.
 */
const { ADMIN_CABINET, COMPTABLE, LECTURE_SEULE, AIDE_COMPTABLE, GESTIONNAIRE_PAIE } = RoleUtilisateur;

describe('rolesSatisfaits · la règle', () => {
  it('l’aide-comptable passe là où passe le comptable ou la lecture seule, sauf refus', () => {
    expect(rolesSatisfaits(AIDE_COMPTABLE, [ADMIN_CABINET, COMPTABLE], undefined)).toBe(true);
    expect(rolesSatisfaits(AIDE_COMPTABLE, [ADMIN_CABINET, COMPTABLE, LECTURE_SEULE], undefined)).toBe(true);
    expect(rolesSatisfaits(AIDE_COMPTABLE, [ADMIN_CABINET], undefined)).toBe(false);
    expect(rolesSatisfaits(AIDE_COMPTABLE, [ADMIN_CABINET, COMPTABLE], { aideComptable: false })).toBe(false);
  });

  it('le gestionnaire de paie ne passe que là où la route l’ouvre', () => {
    expect(rolesSatisfaits(GESTIONNAIRE_PAIE, [ADMIN_CABINET, COMPTABLE], undefined)).toBe(false);
    expect(rolesSatisfaits(GESTIONNAIRE_PAIE, [ADMIN_CABINET, COMPTABLE], { gestionnairePaie: true })).toBe(true);
    expect(rolesSatisfaits(GESTIONNAIRE_PAIE, [ADMIN_CABINET], { gestionnairePaie: true })).toBe(false);
    expect(routeOuverteAuRoleCantonne(GESTIONNAIRE_PAIE, undefined)).toBe(false);
    expect(routeOuverteAuRoleCantonne(AIDE_COMPTABLE, undefined)).toBe(true);
  });

  it('les trois rôles d’origine ne sont pas touchés', () => {
    expect(rolesSatisfaits(COMPTABLE, [ADMIN_CABINET, COMPTABLE], { aideComptable: false, gestionnairePaie: false })).toBe(true);
    expect(rolesSatisfaits(LECTURE_SEULE, [ADMIN_CABINET, COMPTABLE], undefined)).toBe(false);
    expect(routeOuverteAuRoleCantonne(COMPTABLE, { aideComptable: false, gestionnairePaie: false })).toBe(true);
  });
});

describe('JwtAuthGuard · les contrôles qui ont besoin de l’utilisateur', () => {
  const garde = new JwtAuthGuard(new Reflector());
  const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => Promise<boolean> };
  const contexte = (user: unknown, handler: object, classe: object = class {}) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => handler,
      getClass: () => classe,
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.spyOn(parent, 'canActivate').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());

  it('refuse le gestionnaire de paie sur une lecture sans @Roles, l’ouvre au personnel', async () => {
    const lectureOrdinaire = () => undefined;
    await expect(garde.canActivate(contexte({ role: GESTIONNAIRE_PAIE }, lectureOrdinaire))).rejects.toThrow(
      /cantonné au personnel et à la paie/,
    );
    const lister = PersonnelController.prototype.lister;
    await expect(garde.canActivate(contexte({ role: GESTIONNAIRE_PAIE }, lister, PersonnelController))).resolves.toBe(true);
  });

  it('refuse l’aide-comptable sur la validation, la laisse saisir', async () => {
    await expect(
      garde.canActivate(contexte({ role: AIDE_COMPTABLE }, EcritureController.prototype.valider, EcritureController)),
    ).rejects.toThrow(/réservée au comptable/);
    await expect(
      garde.canActivate(contexte({ role: AIDE_COMPTABLE }, EcritureController.prototype.creer, EcritureController)),
    ).resolves.toBe(true);
  });

  it('ferme le logiciel au mot de passe provisoire, sauf les routes de sortie', async () => {
    const quelconque = () => undefined;
    await expect(garde.canActivate(contexte({ role: COMPTABLE, doitChangerMotDePasse: true }, quelconque))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      garde.canActivate(contexte({ role: COMPTABLE, doitChangerMotDePasse: true }, AuthController.prototype.me, AuthController)),
    ).resolves.toBe(true);
  });
});

describe('POURQUOI JwtAuthGuard · une garde globale ne voit jamais l’utilisateur', () => {
  @Injectable()
  class AuthDeControleur implements CanActivate {
    canActivate(ctx: ExecutionContext) {
      ctx.switchToHttp().getRequest().user = { doitChangerMotDePasse: true };
      return true;
    }
  }
  @UseGuards(AuthDeControleur)
  @Controller('preuve')
  class PreuveController {
    @Get() lire() {
      return { ok: true };
    }
  }

  it('Nest passe la garde globale AVANT celle du contrôleur · elle laisse donc tout passer', async () => {
    // C'est l'état dans lequel MotDePasseAChangerGuard a vécu, global, de la
    // phase 1a au 2026-09-24 · le test fige le fait qui l'a sorti de là.
    const mod = await Test.createTestingModule({
      controllers: [PreuveController],
      providers: [{ provide: APP_GUARD, useClass: MotDePasseAChangerGuard }],
    }).compile();
    const app = mod.createNestApplication();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as { port: number };
    const reponse = await fetch(`http://127.0.0.1:${port}/preuve`);
    await app.close();
    expect(reponse.status).toBe(200);
  });

  it('le module ne pose plus de garde globale qui lirait l’utilisateur', () => {
    const module = readFileSync(join(__dirname, '../../app.module.ts'), 'utf8');
    const gardes = [...module.matchAll(/provide: APP_GUARD, useClass: (\w+)/g)].map((m) => m[1]);
    expect(gardes).toEqual(['ThrottlerGuard']);
  });

  it('JwtAuthGuard est bien une AuthGuard passport', () => {
    expect(JwtAuthGuard.prototype).toBeInstanceOf(AuthGuard('jwt'));
  });
});

describe('les routes marquées', () => {
  const acces = (cible: object) => Reflect.getMetadata(CLE_ACCES_ROLES_CANTONNES, cible);

  it('le personnel est au gestionnaire de paie, pas à l’aide ; la comptabilisation au comptable seul', () => {
    expect(acces(PersonnelController)).toEqual({ aideComptable: false, gestionnairePaie: true });
    expect(acces(PersonnelController.prototype.comptabiliserPaieDuMois)).toEqual({ aideComptable: false, gestionnairePaie: false });
    expect(acces(PersonnelController.prototype.annulerComptabilisationPaie)).toEqual({ aideComptable: false, gestionnairePaie: false });
  });

  it('valider, corriger, affecter et produire la liasse du groupe sont réservés au comptable', () => {
    for (const cible of [
      EcritureController.prototype.valider,
      EcritureController.prototype.validerJusqua,
      EcritureController.prototype.corriger,
      AffectationController.prototype.enregistrer,
      AffectationController.prototype.supprimer,
      GroupeController.prototype.liasseGroupe,
    ]) {
      expect(acces(cible)).toEqual({ aideComptable: false, gestionnairePaie: false });
    }
  });

  it('le gestionnaire de paie peut entrer · se voir, changer son mot de passe, lister les exercices', () => {
    for (const cible of [AuthController.prototype.me, AuthController.prototype.changerMotDePasse, ExerciceController.prototype.lister]) {
      expect(acces(cible)).toEqual({ gestionnairePaie: true });
    }
  });
});

describe('toute route authentifiée traverse JwtAuthGuard', () => {
  it('chaque contrôleur la pose, hors la santé qui n’authentifie personne', () => {
    const { globSync } = require('node:fs') as { globSync?: (p: string, o: object) => string[] };
    const racine = join(__dirname, '../..');
    const fichiers: string[] = globSync
      ? globSync('**/*.controller.ts', { cwd: racine })
      : (require('child_process').execSync('find . -name "*.controller.ts"', { cwd: racine }).toString().trim().split('\n') as string[]);
    const sans = fichiers.filter((f) => !f.endsWith('sante.controller.ts') && !readFileSync(join(racine, f), 'utf8').includes('JwtAuthGuard'));
    expect(fichiers.length).toBeGreaterThan(40);
    expect(sans).toEqual([]);
  });
});
