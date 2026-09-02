import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { sessionRevoquee } from './jwt.strategy';
import { dureeVerrouMinutes, instantDeverrouillage, SEUIL_VERROUILLAGE } from './verrouillage';
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
 *     sessions ouvertes · un jeton vit jusqu'à huit heures.
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
    // Une quatrième sortie ajoutée par confort rouvrirait le trou.
    const controleur = require('fs').readFileSync(
      require('path').join(__dirname, 'auth.controller.ts'),
      'utf8',
    ) as string;
    const marquees = [...controleur.matchAll(/@SortieMotDePasseProvisoire\(\)[\s\S]{0,220}?@(?:Get|Post|Patch)\('([\w-]+)'\)/g)].map(
      (m) => m[1],
    );
    expect(marquees.sort()).toEqual(['changer-mot-de-passe', 'deconnecter-partout', 'me']);
    expect(CLE_SORTIE_MOT_DE_PASSE).toBe('sortie-mot-de-passe-provisoire');
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
    const user = { id: 'u1', motDePasse: hash, estActif: true, tentativesEchouees: 4, verrouilleJusqua: null };
    await expect(authService(user, capture).login({ email: 'a@b.cd', motDePasse: 'faux' } as never)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(capture.data).toMatchObject({ tentativesEchouees: 5 });
    expect(capture.data!.verrouilleJusqua).toBeInstanceOf(Date);
  });

  it('refuse un compte verrouillé SANS faire tourner bcrypt', async () => {
    // Le verrou se vérifie avant le hachage · sinon le verrou lui-même
    // devient le levier d'un épuisement du processeur.
    const capture: { data?: Record<string, unknown> } = {};
    const compare = jest.spyOn(bcrypt, 'compare');
    const user = {
      id: 'u1',
      motDePasse: 'peu-importe',
      estActif: true,
      tentativesEchouees: 5,
      verrouilleJusqua: new Date(Date.now() + 60_000),
    };
    await expect(
      authService(user, capture).login({ email: 'a@b.cd', motDePasse: 'faux' } as never),
    ).rejects.toThrow(/verrouillé/);
    expect(compare).not.toHaveBeenCalled();
    compare.mockRestore();
  });

  it('repart de zéro si le verrou précédent est ÉCHU', async () => {
    // Sinon une faute de frappe six mois plus tard hériterait de la sévérité
    // d'un incident oublié.
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    const user = {
      id: 'u1',
      motDePasse: hash,
      estActif: true,
      tentativesEchouees: 9,
      verrouilleJusqua: new Date(Date.now() - 60_000),
    };
    await expect(
      authService(user, capture).login({ email: 'a@b.cd', motDePasse: 'faux' } as never),
    ).rejects.toThrow(UnauthorizedException);
    expect(capture.data).toMatchObject({ tentativesEchouees: 1 });
  });

  it('remet le compteur à zéro à la connexion réussie', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('le-bon', 4);
    const user = { id: 'u1', motDePasse: hash, estActif: true, tentativesEchouees: 3, verrouilleJusqua: null };
    await authService(user, capture).login({ email: 'a@b.cd', motDePasse: 'le-bon' } as never);
    expect(capture.data).toEqual({ tentativesEchouees: 0, verrouilleJusqua: null });
  });

  it('dit « identifiants invalides » dans les deux cas · le message n’apprend rien', async () => {
    // Distinguer « compte inconnu » de « mot de passe faux » apprendrait
    // quelles adresses existent.
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
    ]) {
      await service.login({ email: 'a@b.cd', motDePasse: 'faux' } as never).catch((e) => messages.push(e.message));
    }
    expect(messages).toEqual(['Identifiants invalides', 'Identifiants invalides']);
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
