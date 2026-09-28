import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import * as bcrypt from 'bcryptjs';
import { AuthService, EMPREINTE_FACTICE, SALT_ROUNDS } from './auth.service';
import { sessionRevoquee } from './jwt.strategy';
import { dureeVerrouMinutes, instantDeverrouillage, MOTIF_IDENTIFIANTS_INVALIDES, SEUIL_VERROUILLAGE } from './verrouillage';
import { MotDePasseAChangerGuard } from '../../common/guards/mot-de-passe-a-changer.guard';
import { CLE_SORTIE_MOT_DE_PASSE } from '../../common/decorators/sortie-mot-de-passe.decorator';
import { UtilisateurService } from '../utilisateurs/utilisateur.service';

/**
 * CYCLE DE VIE DES ACCÈS · les quatre garanties de B5, chacune capable de
 * tomber en silence.
 *
 *  1. Un mot de passe PROVISOIRE ferme le logiciel · côté SERVEUR, pas
 *     seulement côté écran. C'était le trou : le client affichait bien
 *     l'écran de changement, le serveur ne refusait rien, et un appel direct
 *     à l'API travaillait normalement.
 *  2. Un mot de passe changé, réinitialisé ou un compte rétrogradé FERME les
 *     sessions ouvertes · un jeton vit jusqu'à huit heures, et trente jours
 *     pour une session « Rester connecté » (audit final F270).
 *  3. Un compte se VERROUILLE après des échecs répétés, mais TEMPORAIREMENT ·
 *     un verrou définitif se retourne en refus de service.
 *  4. L'administrateur du dossier peut RÉINITIALISER un mot de passe · sans
 *     quoi un oubli se règle par un UPDATE SQL en production.
 */

describe('1 · le mot de passe provisoire ferme le logiciel côté serveur', () => {
  const garde = (sortie: boolean) =>
    new MotDePasseAChangerGuard({ getAllAndOverride: () => sortie } as never);
  const requete = (utilisateur: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user: utilisateur }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as never;

  it('refuse toute route ordinaire tant que le mot de passe est provisoire', () => {
    expect(() => garde(false).canActivate(requete({ doitChangerMotDePasse: true }))).toThrow(ForbiddenException);
  });

  it('laisse passer les routes qui permettent d’en SORTIR', () => {
    // /auth/me, /auth/changer-mot-de-passe, /auth/deconnecter-partout · sans
    // elles, le compte serait enfermé sans issue.
    expect(garde(true).canActivate(requete({ doitChangerMotDePasse: true }))).toBe(true);
  });

  it('ne gêne pas un compte ordinaire ni une route non authentifiée', () => {
    expect(garde(false).canActivate(requete({ doitChangerMotDePasse: false }))).toBe(true);
    expect(garde(false).canActivate(requete(undefined))).toBe(true);
  });

  it('les trois sorties sont marquées dans le contrôleur, et elles seules', () => {
    // Une quatrième sortie ajoutée par confort rouvrirait le trou. LUE SUR LA
    // MÉTADONNÉE QUE LA GARDE LIT, route par route, et non plus sur une
    // distance dans la source (audit de cohérence du lot F270) · l'ancienne
    // lecture cherchait le verbe à moins de 220 caractères du décorateur, si
    // bien qu'un commentaire posé entre les deux suffisait à cacher une
    // quatrième sortie, et la route nouvelle `deconnecter-autres-appareils`
    // en porte un de plusieurs lignes.
    const { AuthController } = require('./auth.controller') as { AuthController: { prototype: Record<string, unknown> } };
    const proto = AuthController.prototype;
    const sorties = Object.getOwnPropertyNames(proto)
      .filter((m) => m !== 'constructor' && Reflect.getMetadata(CLE_SORTIE_MOT_DE_PASSE, proto[m] as object) === true)
      .map((m) => Reflect.getMetadata(PATH_METADATA, proto[m] as object) as string);
    expect(sorties.sort()).toEqual(['changer-mot-de-passe', 'deconnecter-partout', 'me']);
    // Posée sur la CLASSE, elle ouvrirait toutes les routes du contrôleur · la
    // garde lit la classe aussi (`getAllAndOverride`).
    expect(Reflect.getMetadata(CLE_SORTIE_MOT_DE_PASSE, AuthController)).toBeUndefined();
    expect(CLE_SORTIE_MOT_DE_PASSE).toBe('sortie-mot-de-passe-provisoire');
  });

  it('aucun autre fichier du serveur ne pose une sortie, sous le décorateur ou sous sa clé', () => {
    // Le test précédent ne lit que l'AuthController · une sortie posée dans un
    // autre contrôleur, ou par `SetMetadata` sur la clé, lui échapperait. On
    // gèle la PRÉSENCE : les fichiers qui nomment le décorateur ou sa clé sont
    // ceux-ci, et eux seuls.
    const { readdirSync, readFileSync, statSync } = require('fs') as typeof import('fs');
    const { join, relative } = require('path') as typeof import('path');
    const racine = join(__dirname, '..', '..');
    const sources = (dossier: string): string[] =>
      readdirSync(dossier).flatMap((nom) => {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) return sources(chemin);
        return nom.endsWith('.ts') && !nom.endsWith('.spec.ts') ? [chemin] : [];
      });
    const nomment = (motif: RegExp) =>
      sources(racine)
        .filter((f) => motif.test(readFileSync(f, 'utf8')))
        .map((f) => relative(racine, f).split('\\').join('/'))
        .sort();
    expect(nomment(/\bSortieMotDePasseProvisoire\b/)).toEqual([
      'common/decorators/sortie-mot-de-passe.decorator.ts',
      'modules/auth/auth.controller.ts',
    ]);
    expect(nomment(/\bCLE_SORTIE_MOT_DE_PASSE\b|sortie-mot-de-passe-provisoire/)).toEqual([
      'common/decorators/sortie-mot-de-passe.decorator.ts',
      'common/guards/mot-de-passe-a-changer.guard.ts',
    ]);
  });
});

describe('2 · la révocation de session', () => {
  it('rejette un jeton émis AVANT la révocation', () => {
    const revocation = new Date('2026-09-02T10:00:00.000Z');
    const avant = Math.floor(new Date('2026-09-02T09:59:59.000Z').getTime() / 1000);
    expect(sessionRevoquee(avant, revocation)).toBe(true);
  });

  it('accepte un jeton signé dans la MÊME seconde que la révocation', () => {
    // Le piège de précision · `iat` est en secondes, la révocation en
    // millisecondes. Comparer sans tronquer éjecterait le titulaire par son
    // propre changement de mot de passe : révocation à 10:00:00.400, jeton
    // resigné à 10:00:00.401, mais d'iat 10:00:00.
    const revocation = new Date('2026-09-02T10:00:00.400Z');
    const memeSeconde = Math.floor(new Date('2026-09-02T10:00:00.000Z').getTime() / 1000);
    expect(sessionRevoquee(memeSeconde, revocation)).toBe(false);
  });

  it('accepte tout jeton quand rien n’a jamais été révoqué', () => {
    expect(sessionRevoquee(1_756_800_000, null)).toBe(false);
  });

  it('rejette un jeton sans date d’émission · il ne peut pas prouver son antériorité', () => {
    expect(sessionRevoquee(undefined, new Date())).toBe(true);
  });
});

describe('3 · le verrouillage par compte', () => {
  it('ne verrouille pas avant le seuil', () => {
    for (let n = 0; n < SEUIL_VERROUILLAGE; n++) {
      expect([n, dureeVerrouMinutes(n)]).toEqual([n, 0]);
    }
  });

  it('verrouille au seuil, puis de plus en plus longtemps', () => {
    const durees = [0, 1, 2, 3, 4, 5, 6].map((i) => dureeVerrouMinutes(SEUIL_VERROUILLAGE + i));
    expect(durees).toEqual([1, 5, 15, 30, 60, 60, 60]);
  });

  it('reste TEMPORAIRE · un verrou définitif se retourne en refus de service', () => {
    // L'adresse d'un comptable figure sur ses courriels · un verrou définitif
    // suffirait à l'empêcher de travailler en se trompant exprès cinq fois.
    const maintenant = new Date('2026-09-02T10:00:00.000Z');
    for (const echecs of [5, 20, 500]) {
      const jusqua = instantDeverrouillage(echecs, maintenant)!;
      expect([echecs, jusqua.getTime() - maintenant.getTime() <= 60 * 60_000]).toEqual([echecs, true]);
    }
  });

  const authService = (user: Record<string, unknown>, capture: { data?: Record<string, unknown> }) =>
    new AuthService(
      {
        user: {
          findUnique: async () => user,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            capture.data = data;
            return {};
          },
        },
      } as never,
      { sign: () => 'jeton' } as never,
      ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
    );

  it('compte les échecs et pose le verrou au cinquième', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    // Quatre échecs dont le dernier date d'une minute · dans le délai d'oubli.
    const user = { id: 'u1', motDePasse: hash, estActif: true, tentativesEchouees: 4, verrouilleJusqua: null, dernierEchecLe: new Date(Date.now() - 60_000) };
    await expect(authService(user, capture).login({ email: 'a@b.cd', motDePasse: 'faux' } as never)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(capture.data).toMatchObject({ tentativesEchouees: 5 });
    expect(capture.data!.dernierEchecLe).toBeInstanceOf(Date);
    expect(capture.data!.verrouilleJusqua).toBeInstanceOf(Date);
  });

  it('un compte verrouillé répond comme un mot de passe faux, APRÈS le même hachage (audit final F238)', async () => {
    // Le verrou répondait sans bcrypt, donc plus vite qu'une adresse inconnue
    // (qui compare à l'empreinte factice) · sa rapidité disait « ce compte
    // existe ». Et son message le disait en toutes lettres.
    const compare = jest.spyOn(bcrypt, 'compare');
    const hash = await bcrypt.hash('le-bon', 4);
    for (const essai of ['faux', 'le-bon']) {
      compare.mockClear();
      const capture: { data?: Record<string, unknown> } = {};
      const user = {
        id: 'u1',
        motDePasse: hash,
        estActif: true,
        tentativesEchouees: 5,
        verrouilleJusqua: new Date(Date.now() + 60_000),
      };
      await expect(authService(user, capture).login({ email: 'a@b.cd', motDePasse: essai } as never)).rejects.toThrow(
        MOTIF_IDENTIFIANTS_INVALIDES,
      );
      expect([essai, compare.mock.calls.length]).toEqual([essai, 1]);
      // Le verrou tient, même sur le bon mot de passe · et un essai pendant le
      // verrou ne le prolonge pas, sans quoi qui connaît l'adresse le tiendrait
      // fermé à volonté.
      expect([essai, capture.data]).toEqual([essai, undefined]);
    }
    compare.mockRestore();
  });

  it('le bon mot de passe pendant le verrou ne se distingue pas d’un faux · le verrou n’est pas un oracle', async () => {
    const hash = await bcrypt.hash('le-bon', 4);
    const verrouille = (motDePasse: string) =>
      authService(
        { id: 'u1', motDePasse: hash, estActif: true, tentativesEchouees: 5, verrouilleJusqua: new Date(Date.now() + 60_000) },
        {},
      )
        .login({ email: 'a@b.cd', motDePasse } as never)
        .catch((e: Error) => e.message);
    expect(await verrouille('le-bon')).toBe(await verrouille('faux'));
  });

  it('NE repart PLUS de zéro à l’échéance du verrou · seul le délai d’oubli efface le compteur (verrouillage.ts)', async () => {
    // Remis à zéro à l'échéance, le compteur laissait l'attaquant patient au
    // palier d'une minute pour toujours. Neuf échecs, le dernier il y a une
    // heure, verrou échu · le dixième échec pose le palier d'une heure.
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    const user = {
      id: 'u1',
      motDePasse: hash,
      estActif: true,
      tentativesEchouees: 9,
      verrouilleJusqua: new Date(Date.now() - 60_000),
      dernierEchecLe: new Date(Date.now() - 61 * 60_000),
    };
    await expect(
      authService(user, capture).login({ email: 'a@b.cd', motDePasse: 'faux' } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(capture.data).toMatchObject({ tentativesEchouees: 10 });
    expect(dureeVerrouMinutes(capture.data!.tentativesEchouees as number)).toBe(60);
  });

  it('remet le compteur à zéro à la connexion réussie', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    const user = { id: 'u1', motDePasse: hash, estActif: true, tentativesEchouees: 3, verrouilleJusqua: null, dernierEchecLe: new Date() };
    await authService(user, capture).login({ email: 'a@b.cd', motDePasse: 'le-bon' } as never);
    // NIST SP 800-63B-4 · « the verifier SHOULD disregard any previous failed
    // attempts » après une authentification réussie · la date du dernier
    // échec tombe avec le compteur.
    expect(capture.data).toEqual({ tentativesEchouees: 0, verrouilleJusqua: null, dernierEchecLe: null });
  });

  it('dit la même chose dans les trois cas · adresse inconnue, mot de passe faux, compte verrouillé (F238)', async () => {
    // Distinguer « compte inconnu » de « mot de passe faux » apprendrait
    // quelles adresses existent · et le message du verrou le disait aussi,
    // une adresse inconnue ne se verrouillant jamais.
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    const inconnu = new AuthService(
      { user: { findUnique: async () => null } } as never,
      { sign: () => 'j' } as never,
      ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
    );
    const messages: string[] = [];
    for (const service of [
      inconnu,
      authService({ id: 'u1', motDePasse: hash, estActif: true, tentativesEchouees: 0, verrouilleJusqua: null }, capture),
      authService({ id: 'u1', motDePasse: hash, estActif: true, tentativesEchouees: 5, verrouilleJusqua: new Date(Date.now() + 60_000) }, {}),
    ]) {
      await service.login({ email: 'a@b.cd', motDePasse: 'faux' } as never).catch((e) => messages.push(e.message));
    }
    expect(messages).toEqual([MOTIF_IDENTIFIANTS_INVALIDES, MOTIF_IDENTIFIANTS_INVALIDES, MOTIF_IDENTIFIANTS_INVALIDES]);
    // Le message nomme la suspension pour tous · le titulaire bloqué sait
    // quoi attendre sans que l'inconnu apprenne rien.
    expect(MOTIF_IDENTIFIANTS_INVALIDES).toMatch(/^Identifiants invalides · après plusieurs essais manqués/);
  });

  it('une adresse inconnue fait tourner bcrypt comme une adresse connue · la durée ne trahit rien (F238)', async () => {
    const compare = jest.spyOn(bcrypt, 'compare');
    const inconnu = new AuthService(
      { user: { findUnique: async () => null } } as never,
      { sign: () => 'j' } as never,
      ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
    );
    await expect(inconnu.login({ email: 'personne@b.cd', motDePasse: 'essai' } as never)).rejects.toThrow(MOTIF_IDENTIFIANTS_INVALIDES);
    expect(compare.mock.calls).toEqual([['essai', EMPREINTE_FACTICE]]);
    compare.mockRestore();
  });

  it('l’empreinte factice est du même coût que les vraies, et son résultat est jeté', async () => {
    // Un coût plus faible rendrait la réponse d'une adresse inconnue plus
    // rapide · exactement la différence qu'elle existe pour effacer.
    expect(bcrypt.getRounds(EMPREINTE_FACTICE)).toBe(SALT_ROUNDS);
    // Et quand bien même elle dirait oui · une adresse inconnue est refusée
    // quel que soit le résultat, que le service jette.
    const inconnu = new AuthService(
      { user: { findUnique: async () => null } } as never,
      { sign: () => 'j' } as never,
      ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as [never, never, never, never, never, never, never, never]),
    );
    const compare = jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
    await expect(inconnu.login({ email: 'personne@b.cd', motDePasse: 'x' } as never)).rejects.toThrow(MOTIF_IDENTIFIANTS_INVALIDES);
    compare.mockRestore();
  });
});

describe('4 · la réinitialisation par l’administrateur du dossier', () => {
  const prismaFactice = (capture: { data?: Record<string, unknown> }) =>
    ({
      user: {
        findFirst: async () => ({ id: 'u2', email: 'comptable@cabinet.cd', tenantId: 'd-1' }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          capture.data = data;
          return { id: 'u2' };
        },
      },
    }) as never;

  it('pose un mot de passe PROVISOIRE, ferme les sessions et lève le verrou', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const resultat = await new UtilisateurService(prismaFactice(capture)).reinitialiserMotDePasse(
      'd-1',
      'u2',
      'provisoire-tres-long',
    );

    expect(resultat).toEqual({ reinitialise: true, email: 'comptable@cabinet.cd' });
    // Provisoire · il a transité par l'administrateur, le titulaire doit le
    // remplacer avant de travailler (garde 1 ci-dessus).
    expect(capture.data!.doitChangerMotDePasse).toBe(true);
    // Fermé · « perdu » peut vouloir dire « trouvé par quelqu'un d'autre ».
    expect(capture.data!.sessionsInvalidesAvant).toBeInstanceOf(Date);
    // Déverrouillé · c'est aussi la sortie de secours d'un comptable bloqué.
    expect(capture.data!.tentativesEchouees).toBe(0);
    expect(capture.data!.dernierEchecLe).toBeNull();
    // Et le second facteur tombe · le titulaire le réactivera lui-même.
    expect(capture.data).toMatchObject({ secretDoubleAuth: null, doubleAuthActiveDepuis: null, codesSecoursDoubleAuth: [] });
    expect(capture.data!.verrouilleJusqua).toBeNull();
    // Jamais en clair.
    expect(capture.data!.motDePasse).not.toBe('provisoire-tres-long');
    expect(await bcrypt.compare('provisoire-tres-long', capture.data!.motDePasse as string)).toBe(true);
  });

  it('rétrograder un rôle ferme les sessions du compte', async () => {
    // JwtStrategy relit `estActif` à chaque requête, mais pas le rôle en
    // vigueur au moment de l'émission · sans fermeture, un ADMIN_CABINET
    // rétrogradé restait administrateur pendant huit heures.
    const capture: { data?: Record<string, unknown> } = {};
    await new UtilisateurService(prismaFactice(capture)).modifier('d-1', 'u2', 'u1', { role: 'COMPTABLE' } as never);
    expect(capture.data!.sessionsInvalidesAvant).toBeInstanceOf(Date);
  });

  it('un simple changement sans effet sur les droits ne ferme rien', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    await new UtilisateurService(prismaFactice(capture)).modifier('d-1', 'u2', 'u1', { estActif: true } as never);
    expect(capture.data!.sessionsInvalidesAvant).toBeUndefined();
  });
});

describe('5 · la chaîne de recours va jusqu’au bout', () => {
  /**
   * Trouvé en répondant à une question de l'exploitant sur les courriels de
   * confirmation : la chaîne s'arrêtait trop tôt. Un comptable qui oublie son
   * mot de passe est réinitialisé par SON administrateur · mais
   * l'ADMINISTRATEUR qui oublie le sien n'avait personne au-dessus, et on
   * retombait sur un UPDATE SQL en production, c'est-à-dire exactement ce que
   * B5 devait supprimer, remonté d'un cran.
   */
  const service = (admin: unknown, capture: { data?: Record<string, unknown> }) =>
    new (require('../plateforme/plateforme.service').PlateformeService)(
      {
        user: {
          findFirst: async () => admin,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            capture.data = data;
            return {};
          },
        },
      } as never,
      { get: () => undefined } as never,
      undefined as never,
    );

  it('l’opérateur réinitialise l’administrateur d’un cabinet, avec les trois mêmes effets', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const resultat = await service({ id: 'u1', email: 'chef@cabinet.cd' }, capture).reinitialiserAdmin('d-1', {
      email: 'chef@cabinet.cd',
      motDePasseProvisoire: 'provisoire-tres-long',
    });
    expect(resultat).toEqual({ reinitialise: true, email: 'chef@cabinet.cd' });
    expect(capture.data!.doitChangerMotDePasse).toBe(true);
    expect(capture.data!.sessionsInvalidesAvant).toBeInstanceOf(Date);
    expect(capture.data!.verrouilleJusqua).toBeNull();
    expect(capture.data).toMatchObject({ tentativesEchouees: 0, dernierEchecLe: null });
    expect(await bcrypt.compare('provisoire-tres-long', capture.data!.motDePasse as string)).toBe(true);
    // Le second facteur tombe avec le mot de passe · sinon un administrateur
    // qui a perdu son téléphone et ses codes resterait dehors pour de bon.
    expect(capture.data).toMatchObject({ secretDoubleAuth: null, doubleAuthActiveDepuis: null, codesSecoursDoubleAuth: [] });
  });

  it('refuse un compte qui n’est PAS administrateur du dossier visé', async () => {
    // Sans cette borne, la console deviendrait un passe-partout sur tous les
    // comptes de tous les cabinets · réinitialiser un comptable est l'affaire
    // de l'administrateur de son cabinet, pas de l'exploitant.
    const capture: { data?: Record<string, unknown> } = {};
    await expect(
      service(null, capture).reinitialiserAdmin('d-1', {
        email: 'comptable@cabinet.cd',
        motDePasseProvisoire: 'provisoire-tres-long',
      }),
    ).rejects.toThrow(/administrateur/);
    expect(capture.data).toBeUndefined();
  });
});
