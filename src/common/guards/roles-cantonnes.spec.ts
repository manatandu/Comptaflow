import { CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, UseGuards } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RoleUtilisateur } from '@prisma/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AuthGuard } from '@nestjs/passport';
import { rolesSatisfaits, routeOuverteAuRoleCantonne } from './roles-cantonnes';
import { CLE_ACCES_ROLES_CANTONNES } from '../decorators/acces-roles-cantonnes.decorator';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { MotDePasseAChangerGuard } from './mot-de-passe-a-changer.guard';
import { PersonnelController } from '../../modules/personnel/personnel.controller';
import { AvancesRubriquesController } from '../../modules/personnel/avances-rubriques.controller';
import { BaremesPaieController } from '../../modules/personnel/baremes-paie.controller';
import { EcritureController } from '../../modules/comptabilite/ecriture.controller';
import { AffectationController } from '../../modules/affectation/affectation.controller';
import { GroupeController } from '../../modules/groupe/groupe.controller';
import { ExerciceController } from '../../modules/exercice/exercice.controller';
import { AuthController } from '../../modules/auth/auth.controller';
import { DevisesController } from '../../modules/devises/devises.controller';

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

  it('le gestionnaire de paie lit les devises et cote le cours du jour que sa paie lit (audit final F247)', () => {
    // La borne de la cotation (USD, jour de Kinshasa) et la fermeture du reste
    // du module sont tenues par devises/cotation-gestionnaire-paie.spec.ts.
    for (const cible of [DevisesController.prototype.lister, DevisesController.prototype.poserCours]) {
      expect(acces(cible)).toEqual({ gestionnairePaie: true });
    }
    expect(acces(DevisesController.prototype.reevaluer)).toBeUndefined();
  });
});

describe('les portes du gestionnaire de paie · une liste FERMÉE (audit de cohérence du lot F247, F270)', () => {
  /**
   * Son défaut est de n'avoir RIEN · chaque porte ouverte est donc une
   * décision, et elle se prend ici, pas au détour d'un contrôleur. Les tests
   * d'au-dessus vérifient que CERTAINES routes lui sont ouvertes ; aucun ne
   * disait que ce sont LES SEULES, si bien que F247 (les devises) et F270
   * (déconnecter ses autres appareils) ont élargi son périmètre sans qu'une
   * liste le constate. Deux lectures, et il faut les deux · la métadonnée
   * que la garde lit, sur les contrôleurs qui l'ouvrent, et les SOURCES de
   * tout le serveur, pour qu'un contrôleur nouveau ne s'ajoute pas en silence.
   */
  const acces = (cible: object) => Reflect.getMetadata(CLE_ACCES_ROLES_CANTONNES, cible) as { gestionnairePaie?: boolean } | undefined;
  const methodesOuvertes = (classe: { prototype: object; name: string }) => {
    const proto = classe.prototype as Record<string, object>;
    return Object.getOwnPropertyNames(proto)
      .filter((m) => m !== 'constructor' && acces(proto[m])?.gestionnairePaie === true)
      .map((m) => `${classe.name}.${m}`);
  };

  it('le module du personnel lui est ouvert en entier, par la classe · et lui seul', () => {
    for (const classe of [PersonnelController, AvancesRubriquesController, BaremesPaieController]) {
      expect([classe.name, acces(classe)?.gestionnairePaie]).toEqual([classe.name, true]);
    }
    for (const classe of [AuthController, ExerciceController, DevisesController]) {
      expect([classe.name, acces(classe)]).toEqual([classe.name, undefined]);
    }
  });

  it('hors du personnel, route par route · se voir, son propre compte, les exercices, le cours du jour', () => {
    expect([AuthController, ExerciceController, DevisesController].flatMap(methodesOuvertes).sort()).toEqual(
      [
        // Entrer, et tenir son propre compte · CLAUDE.md § 8.
        'AuthController.me',
        'AuthController.changerMotDePasse',
        'AuthController.changerAdresse',
        'AuthController.etatDoubleAuth',
        'AuthController.initierDoubleAuth',
        'AuthController.activerDoubleAuth',
        'AuthController.desactiverDoubleAuth',
        'AuthController.regenererCodesSecours',
        'AuthController.deconnecterPartout',
        // audit final F270
        'AuthController.deconnecterAutresAppareils',
        // Le sélecteur d'exercice, sans aucun chiffre comptable.
        'ExerciceController.lister',
        // audit final F247 · la cotation est bornée au cours de l'USD du jour.
        'DevisesController.lister',
        'DevisesController.poserCours',
      ].sort(),
    );
  });

  it('aucun autre fichier du serveur ne lui ouvre une porte', () => {
    const racine = join(__dirname, '../..');
    const sources = (dossier: string): string[] =>
      readdirSync(dossier).flatMap((nom) => {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) return sources(chemin);
        return nom.endsWith('.ts') && !nom.endsWith('.spec.ts') ? [chemin] : [];
      });
    const ouvrent = sources(racine)
      .filter((f) => /gestionnairePaie\s*:\s*true/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(racine, f).split('\\').join('/'))
      .sort();
    expect(ouvrent).toEqual([
      'modules/auth/auth.controller.ts',
      'modules/devises/devises.controller.ts',
      'modules/exercice/exercice.controller.ts',
      'modules/personnel/avances-rubriques.controller.ts',
      'modules/personnel/baremes-paie.controller.ts',
      'modules/personnel/personnel.controller.ts',
    ]);
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
