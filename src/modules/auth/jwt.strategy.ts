import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ANCIEN_COOKIE_SESSION, COOKIE_SESSION, ENTETE_CSRF } from './session.constants';
import {
  ChargeJeton,
  CLE_SESSION_REQUETE,
  emettreSession,
  MOTIF_CONSOLE_SANS_SESSION_LONGUE,
  prolongationDue,
  SessionDeRequete,
  sessionDuJeton,
} from './session-longue';

type JwtPayload = ChargeJeton;

/**
 * Le jeton a-t-il été AUTHENTIFIÉ avant la révocation des sessions du compte ?
 * L'appelant passe la dernière authentification explicite du jeton (claim
 * `authentification`, que la prolongation recopie), et son émission à défaut
 * pour un jeton d'avant F270 · voir `ChargeJeton` (session-longue.ts). Le
 * paramètre garde son nom d'origine, c'est le même instant en secondes.
 *
 * `iat` est en SECONDES, `sessionsInvalidesAvant` en millisecondes. Comparer
 * directement rejetterait un jeton fraîchement signé : un changement de mot de
 * passe qui révoque à 10:00:00.400 et resigne à 10:00:00.401 produit un jeton
 * d'iat 10:00:00, donc « antérieur » de 400 ms à sa propre révocation · le
 * titulaire serait éjecté par son propre geste. On tronque donc la révocation
 * à la seconde. La précision perdue est sans effet : un jeton volé date de
 * bien plus d'une seconde.
 */
export function sessionRevoquee(iat: number | undefined, sessionsInvalidesAvant: Date | null): boolean {
  if (!sessionsInvalidesAvant) return false;
  // Un jeton sans `iat` ne peut pas prouver qu'il est postérieur · révoqué.
  if (iat === undefined) return true;
  return iat < Math.floor(sessionsInvalidesAvant.getTime() / 1000);
}

/** Lit le jeton de session dans le cookie httpOnly (voir session.constants.ts). */
export function extraireJetonDuCookie(req: Request): string | null {
  return ((req.cookies?.[COOKIE_SESSION] ?? req.cookies?.[ANCIEN_COOKIE_SESSION]) as string | undefined) ?? null;
}

const METHODES_MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * `jwt` signe la PROLONGATION d'une session longue (audit final F270) · la
   * stratégie vit dans AuthModule, qui importe JwtModule, et Nest l'injecte.
   * Facultatif au typage seulement, pour les specs qui construisent la
   * stratégie à la main · sans lui, rien n'est prolongé, rien n'est refusé.
   */
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt?: JwtService,
  ) {
    super({
      // Le cookie d'abord (le chemin normal du navigateur), l'en-tête
      // Authorization ensuite (tests, outils, période de transition).
      jwtFromRequest: ExtractJwt.fromExtractors([extraireJetonDuCookie, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      // Pas de repli sur une valeur littérale : `validateEnv` (app.module.ts)
      // fait déjà échouer le démarrage si JWT_SECRET est absent · un repli
      // silencieux ici aurait permis de vérifier des jetons forgés avec une
      // chaîne connue si la validation était un jour contournée ou retirée par
      // erreur (défense en profondeur : la garantie doit tenir même sans
      // relire tout l'historique du projet).
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      // La requête est passée à validate() : c'est là que se joue le contrôle
      // CSRF, qui a besoin de la méthode HTTP et des en-têtes.
      passReqToCallback: true,
    });
  }

  /**
   * Le retour de validate() devient request.user (voir CurrentUser decorator).
   * On ne fait PAS confiance à `email`/`role` du payload : ils sont relus en
   * base à chaque requête, pour qu'une désactivation ou un changement de
   * rôle prenne effet immédiatement, sans attendre l'expiration du token
   * (huit heures, trente jours pour une session longue · voir session-longue.ts).
   *
   * CONTRÔLE CSRF · un cookie part avec TOUTE requête vers l'API, y compris
   * une requête forgée par un site tiers (formulaire auto-soumis). Toute
   * requête MUTANTE portée par le cookie doit donc prouver qu'elle vient du
   * client légitime : l'en-tête X-CSRF-Token doit égaler le claim `csrf` du
   * JWT · un site tiers ne peut ni lire ce claim (cookie httpOnly, réponse
   * protégée par CORS) ni poser un en-tête personnalisé en soumission
   * inter-site. Une requête authentifiée par l'en-tête Authorization est
   * exemptée : un en-tête personnalisé ne peut pas être forgé inter-site,
   * c'est sa présence même qui prouve l'origine.
   */
  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    // L'émission d'une éventuelle prolongation (plus bas) · une révocation
    // postérieure l'atteint par l'authentification recopiée, pas par elle.
    const maintenant = Date.now();
    const porteParCookie = !req.headers.authorization && !!extraireJetonDuCookie(req);
    if (porteParCookie && METHODES_MUTANTES.has(req.method)) {
      const jetonRecu = req.headers[ENTETE_CSRF];
      // Un jeton d'avant la migration (sans claim csrf) ne peut pas prouver
      // son origine sur une mutation · reconnexion demandée.
      if (!payload.csrf || jetonRecu !== payload.csrf) {
        throw new ForbiddenException('Jeton CSRF absent ou invalide · reconnectez-vous');
      }
    }

    // UNE requête, jointures comprises : le référentiel et la licence du
    // tenant voyagent avec l'utilisateur, si bien que LicenceGuard et
    // ReferentielGuard n'ont plus rien à demander à la base.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: { select: { referentiel: true, licence: true } } },
    });
    if (!user || !user.estActif) {
      throw new UnauthorizedException('Compte désactivé ou introuvable');
    }
    // RÉVOCATION DE SESSION · un jeton vit jusqu'à huit heures, et une session
    // « Rester connecté » jusqu'à trente jours (audit final F270). Sans ce
    // contrôle, changer un mot de passe volé, réinitialiser un compte ou
    // fermer ses sessions ne prenait effet qu'à l'expiration, c'est-à-dire
    // pas pendant la seule période où cela comptait. La comparaison porte sur
    // la dernière AUTHENTIFICATION du jeton, que la prolongation recopie, et
    // non sur son émission (audit final F270, relecture adverse) · un jeton
    // prolongé dans la seconde d'une révocation lui échappait sinon.
    if (sessionRevoquee(payload.authentification ?? payload.iat, user.sessionsInvalidesAvant)) {
      throw new UnauthorizedException('Session close · reconnectez-vous');
    }
    // LA CONSOLE DE L'ÉDITEUR N'A JAMAIS DE SESSION LONGUE (audit final F270) ·
    // la connexion la refuse déjà, mais le drapeau d'opérateur s'accorde au
    // démarrage (OPERATEURS_PLATEFORME) · un compte promu APRÈS s'être connecté
    // « sur cet appareil » garderait sinon trente jours d'accès à la console.
    // Relu ici comme le rôle, à chaque requête.
    if (payload.longue === true && user.estOperateurPlateforme) {
      throw new UnauthorizedException(MOTIF_CONSOLE_SANS_SESSION_LONGUE);
    }

    // LA SESSION DE LA REQUÊTE, posée à côté de l'utilisateur · le contrôleur
    // d'authentification y lit ce qu'une réémission doit garder, et
    // `JwtAuthGuard` la prolongation à poser en cookie.
    const session: SessionDeRequete = sessionDuJeton(payload, Math.floor(maintenant / 1000));
    // CHAQUE USAGE PROLONGE (au plus une fois par jour, `prolongationDue`),
    // seulement quand le jeton voyage en cookie · un jeton porté par
    // l'en-tête Authorization n'a pas de cookie à remplacer. Le jeton neuf
    // RECOPIE l'origine et le jeton CSRF · l'origine borne les trente jours,
    // et un CSRF neuf que l'écran ne recevrait pas ferait refuser chaque
    // écriture suivante. Il recopie aussi l'AUTHENTIFICATION du jeton qu'il
    // remplace · une révocation posée pendant cette requête, après la lecture
    // du compte, le frappe donc comme elle frappe l'ancien, même dans la même
    // seconde (audit final F270, relecture adverse).
    if (porteParCookie && this.jwt && prolongationDue(session, Math.floor(maintenant / 1000))) {
      const prolonge = emettreSession(
        this.jwt,
        user.id,
        { longue: true, origine: session.origine, csrf: session.csrf, authentification: session.authentification },
        maintenant,
      );
      session.prolongation = { accessToken: prolonge.accessToken, maxAgeMs: prolonge.maxAgeMs ?? 0 };
    }
    (req as unknown as Record<string, unknown>)[CLE_SESSION_REQUETE] = session;

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      doitChangerMotDePasse: user.doitChangerMotDePasse,
      referentiel: user.tenant.referentiel,
      licence: user.tenant.licence,
      estOperateurPlateforme: user.estOperateurPlateforme,
      doubleAuthentificationActive: user.doubleAuthActiveDepuis !== null,
      restreindreFonctions: user.restreindreFonctions,
      fonctionsAutorisees: user.fonctionsAutorisees,
      restreindreJournaux: user.restreindreJournaux,
      journauxAutorises: user.journauxAutorises,
    };
  }
}
