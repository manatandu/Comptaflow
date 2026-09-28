import { randomBytes } from 'crypto';
import type { JwtService } from '@nestjs/jwt';

/**
 * « RESTER CONNECTÉ SUR CET APPAREIL » (audit final F270, décision de Manasse
 * du 2026-09-27). Deux régimes de session, et c'est ce fichier qui dit leurs
 * durées, jamais un écran ni un contrôleur.
 *
 * COURTE, par défaut, case décochée · le cookie est un cookie DE SESSION, sans
 * `maxAge` ni `expires`, fermé avec le navigateur, et le jeton vit la durée du
 * module (JWT_EXPIRES_IN, huit heures). Avant F270, toute session durait huit
 * heures ET survivait à la fermeture du navigateur, y compris sur un poste
 * partagé · le suivant qui ouvrait le navigateur trouvait le dossier ouvert.
 *
 * LONGUE, case cochée · trente jours au plus depuis la connexion d'ORIGINE, et
 * sept jours sans utilisation. Chaque usage prolonge, sans jamais dépasser les
 * trente jours · le jeton porte donc son origine (`origine`, en secondes), et
 * toute réémission la recopie au lieu de la repousser. Une session qui se
 * prolongerait en repartant de la dernière réémission vivrait indéfiniment
 * pour qui s'en sert une fois par semaine.
 *
 * JAMAIS POUR LA CONSOLE DE L'ÉDITEUR · un opérateur de la plateforme tient
 * les licences et les administrateurs de tous les cabinets. Refusé au
 * serveur à la connexion (`AuthService.login`) ET à chaque requête
 * (`JwtStrategy.validate`), jamais seulement à l'écran.
 */

export const SECONDES_PAR_JOUR = 86_400;

/** Trente jours au plus depuis la connexion d'origine. */
export const DUREE_MAXIMALE_SESSION_LONGUE_S = 30 * SECONDES_PAR_JOUR;

/** Sept jours sans utilisation · au-delà, la session longue est fermée. */
export const DUREE_INACTIVITE_SESSION_LONGUE_S = 7 * SECONDES_PAR_JOUR;

/**
 * UNE PROLONGATION PAR JOUR AU PLUS, et c'est une convention d'OmegaX. Réémettre
 * à chaque requête changerait le cookie sur chaque appel (des dizaines par
 * écran) pour ne rien gagner. Le prix est dit · un jeton prolongé vaut sept
 * jours depuis sa réémission, et la réémission n'a lieu qu'une fois par jour,
 * si bien que l'inactivité tolérée va de six à sept jours, JAMAIS plus de sept.
 * Le sens retenu est celui de la sécurité · la borne annoncée est un plafond.
 */
export const INTERVALLE_PROLONGATION_S = SECONDES_PAR_JOUR;

export const MOTIF_CONSOLE_SANS_SESSION_LONGUE =
  "La console de l'éditeur n'admet pas « Rester connecté sur cet appareil » · la session se ferme avec le navigateur.";

/** Ce que le jeton porte de sa session. */
export interface ChargeJeton {
  sub: string;
  /** Jeton CSRF apparié · absent des jetons émis avant la migration cookie. */
  csrf?: string;
  /** Émission et échéance, en SECONDES depuis l'époque · posées par jsonwebtoken. */
  iat?: number;
  exp?: number;
  /** « Rester connecté » · absent ou faux : session courte. */
  longue?: boolean;
  /** Connexion d'origine, en secondes · absente des jetons d'avant F270. */
  origine?: number;
  /**
   * Dernière authentification EXPLICITE, en secondes · la connexion, ou la
   * réémission qui suit un acte présentant le mot de passe ou le code. C'est
   * ELLE, et non l'émission, que la révocation lit (`JwtStrategy`), et la
   * prolongation la RECOPIE (audit final F270, relecture adverse). Sans elle,
   * un jeton prolongé dans la même seconde qu'une révocation portait une
   * émission que la comparaison à la seconde ne tient pas pour antérieure · il
   * échappait à la révocation, puis se prolongeait jusqu'aux trente jours,
   * sans mot de passe. Absente des jetons d'avant, l'émission en tient lieu.
   */
  authentification?: number;
}

/** La session d'une requête, lue dans son jeton par `JwtStrategy`. */
export interface SessionEnCours {
  longue: boolean;
  origine: number;
  iat: number | null;
  exp: number | null;
  csrf: string | null;
  /** Voir `ChargeJeton.authentification` · la prolongation la recopie. */
  authentification?: number | null;
}

export function sessionDuJeton(charge: ChargeJeton, instantS: number): SessionEnCours {
  return {
    longue: charge.longue === true,
    // Un jeton d'avant F270 ne porte pas son origine · son émission en tient
    // lieu, c'est la date la plus ancienne qu'il prouve.
    origine: charge.origine ?? charge.iat ?? instantS,
    iat: charge.iat ?? null,
    exp: charge.exp ?? null,
    csrf: charge.csrf ?? null,
    authentification: charge.authentification ?? charge.iat ?? null,
  };
}

/** Échéance d'un jeton long émis à `instantS` · sept jours, bornés aux trente de l'origine. */
export function echeanceSessionLongue(origine: number, instantS: number): number {
  return Math.min(instantS + DUREE_INACTIVITE_SESSION_LONGUE_S, origine + DUREE_MAXIMALE_SESSION_LONGUE_S);
}

/**
 * La session doit-elle être prolongée à cette requête ? Longue, émise depuis
 * au moins un jour, et la prolongation RECULE réellement l'échéance · passé le
 * vingt-troisième jour, l'échéance est déjà la borne des trente jours et une
 * réémission ne changerait rien.
 */
export function prolongationDue(session: SessionEnCours, instantS: number): boolean {
  if (!session.longue || session.iat === null) return false;
  if (instantS - session.iat < INTERVALLE_PROLONGATION_S) return false;
  return echeanceSessionLongue(session.origine, instantS) > (session.exp ?? 0);
}

export interface DemandeSession {
  longue: boolean;
  /** Connexion d'origine à RECOPIER · absente, la session naît à cet instant. */
  origine?: number;
  /**
   * Échéance à GARDER pour une session courte réémise (changement de mot de
   * passe, autres appareils déconnectés) · une réémission ne doit pas rendre
   * huit heures neuves à une session qui en a déjà vécu sept. Absente, la
   * durée du module (JWT_EXPIRES_IN).
   */
  expCourte?: number | null;
  /**
   * Jeton CSRF à RECOPIER · la prolongation le garde, sans quoi la session
   * survivrait et le jeton CSRF que tient l'écran mourrait avec l'ancien
   * cookie · chaque écriture suivante serait refusée en 403.
   */
  csrf?: string | null;
  /**
   * Dernière authentification explicite à RECOPIER · la prolongation seule la
   * passe. Absente, la session est authentifiée à cet instant (connexion,
   * réémission après un acte), ce qui lui fait passer sa propre révocation.
   */
  authentification?: number | null;
}

export interface SessionEmise {
  accessToken: string;
  csrfToken: string;
  sessionLongue: boolean;
  /** Durée du cookie · `null` pour un cookie de session, fermé avec le navigateur. */
  maxAgeMs: number | null;
}

/**
 * ÉMET LE JETON D'UNE SESSION · la seule écriture de la charge et de la durée,
 * appelée par la connexion, par les réémissions d'`AuthService` et par la
 * prolongation de `JwtStrategy`. Deux écritures auraient divergé au premier
 * correctif, et c'est l'origine qu'on oublie de recopier.
 *
 * L'ÉMISSION EST POSÉE DANS LA CHARGE (`iat`) · jsonwebtoken compte alors
 * l'échéance depuis elle, si bien que la borne des trente jours tombe à la
 * seconde et non à la seconde suivante. Et c'est l'instant fourni, pas
 * l'horloge du moment de la signature · la réémission qui suit une révocation
 * (`sessionsInvalidesAvant`) porte ainsi une authentification que la
 * comparaison à la seconde de `sessionRevoquee` ne tient pas pour antérieure.
 * La prolongation, elle, recopie l'authentification du jeton qu'elle remplace ·
 * elle n'est pas un acte, et une révocation qui a frappé l'ancien jeton
 * frappe le nouveau.
 */
export function emettreSession(
  jwt: Pick<JwtService, 'sign'>,
  userId: string,
  demande: DemandeSession,
  instantMs = Date.now(),
): SessionEmise {
  const instantS = Math.floor(instantMs / 1000);
  const origine = demande.origine ?? instantS;
  const csrfToken = demande.csrf ?? randomBytes(16).toString('hex');
  const authentification = demande.authentification ?? instantS;
  const charge: ChargeJeton = { sub: userId, csrf: csrfToken, origine, authentification, iat: instantS };
  if (demande.longue) {
    const duree = Math.max(1, echeanceSessionLongue(origine, instantS) - instantS);
    return {
      accessToken: jwt.sign({ ...charge, longue: true }, { expiresIn: duree }),
      csrfToken,
      sessionLongue: true,
      maxAgeMs: duree * 1000,
    };
  }
  const garder = demande.expCourte ? { expiresIn: Math.max(1, demande.expCourte - instantS) } : undefined;
  return { accessToken: jwt.sign(charge, garder), csrfToken, sessionLongue: false, maxAgeMs: null };
}

/**
 * LA SESSION DE LA REQUÊTE · posée par `JwtStrategy.validate` à côté de
 * `request.user`, et non dans lui · `AuthenticatedUser` décrit QUI appelle,
 * ceci dit PAR QUELLE SESSION, et seuls le contrôleur d'authentification et
 * `JwtAuthGuard` en ont l'usage.
 */
export const CLE_SESSION_REQUETE = 'sessionOmegax';

export interface SessionDeRequete extends SessionEnCours {
  /** Jeton prolongé, que `JwtAuthGuard` pose en cookie une fois la requête admise. */
  prolongation?: { accessToken: string; maxAgeMs: number };
}

export function sessionDeLaRequete(requete: unknown): SessionDeRequete | null {
  const s = (requete as Record<string, unknown> | null | undefined)?.[CLE_SESSION_REQUETE];
  return (s as SessionDeRequete | undefined) ?? null;
}

/**
 * Ce qu'une réémission garde de la session en cours · son régime, son origine
 * et, courte, son échéance. Sans session connue (appel direct au service), une
 * session courte neuve, comme avant F270.
 */
export function demandeDeReemission(session: SessionEnCours | null): DemandeSession {
  if (!session) return { longue: false };
  return session.longue
    ? { longue: true, origine: session.origine }
    : { longue: false, origine: session.origine, expCourte: session.exp };
}
