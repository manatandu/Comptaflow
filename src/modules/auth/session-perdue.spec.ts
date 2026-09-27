import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard, MOTIF_SESSION_ABSENTE, SIGNAL_SESSION_PERDUE } from './jwt-auth.guard';

/**
 * AUDIT FINAL F164 · une session expirée en cours de travail rendait
 * « Unauthorized » sur chaque fenêtre ouverte, et rien ne ramenait à la
 * connexion. Le serveur dit désormais la chose en français, avec un drapeau
 * que l'interface lit pour fermer la session.
 */
const garde = new JwtAuthGuard(new Reflector());

function refus(fn: () => unknown): { statut: number; corps: Record<string, unknown> } {
  try {
    fn();
  } catch (e) {
    if (e instanceof UnauthorizedException) return { statut: 401, corps: e.getResponse() as Record<string, unknown> };
    throw e;
  }
  throw new Error('aucun refus');
}

describe('F164 · la session perdue se dit et se reconnaît', () => {
  it('sans jeton, ou jeton expiré · 401 en français, marqué session perdue', () => {
    const { statut, corps } = refus(() => garde.handleRequest(null, false));
    expect(statut).toBe(401);
    expect(corps).toMatchObject({ message: MOTIF_SESSION_ABSENTE, session: SIGNAL_SESSION_PERDUE });
    expect(String(corps.message)).not.toBe('Unauthorized');
  });

  it('un refus de la stratégie garde son motif, et porte le même drapeau', () => {
    const { corps } = refus(() => garde.handleRequest(new UnauthorizedException('Session close · reconnectez-vous'), false));
    expect(corps).toMatchObject({ message: 'Session close · reconnectez-vous', session: SIGNAL_SESSION_PERDUE });
  });

  it('une autre panne n’est pas une session perdue · elle remonte telle quelle', () => {
    const panne = new Error('base injoignable');
    expect(() => garde.handleRequest(panne, false)).toThrow(panne);
    const csrf = new ForbiddenException('Jeton CSRF absent ou invalide · reconnectez-vous');
    expect(() => garde.handleRequest(csrf, false)).toThrow(csrf);
  });

  it('une session valide passe', () => {
    const user = { userId: 'u1' };
    expect(garde.handleRequest(null, user)).toBe(user);
  });
});
