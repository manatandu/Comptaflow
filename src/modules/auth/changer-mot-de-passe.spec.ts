import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

/**
 * MOT DE PASSE PROVISOIRE · deux garanties. Le changement exige le mot de
 * passe ACTUEL (un poste laissé ouvert ne permet pas d'évincer le
 * titulaire), et il efface doitChangerMotDePasse · c'est le geste qui clôt
 * la période où un tiers (console VMG, siège d'un groupe, admin du dossier)
 * connaissait le mot de passe.
 */
describe('AuthService · changement de mot de passe', () => {
  const service = (capture: { data?: Record<string, unknown> }, motDePasseStocke: string) =>
    new AuthService(
      {
        user: {
          findUnique: async () => ({ id: 'u1', motDePasse: motDePasseStocke }),
          update: async ({ data }: { data: Record<string, unknown> }) => {
            capture.data = data;
            return {};
          },
        },
      } as never,
      // Le changement RESIGNE une session · il révoque toutes les sessions du
      // compte, celle du titulaire comprise.
      { sign: () => 'jeton-neuf' } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );

  it('refuse sans le mot de passe actuel correct, et ne touche à rien', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('bon-mot-de-passe', 4);
    await expect(service(capture, hash).changerMotDePasse('u1', 'mauvais', 'nouveau-tres-long')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(capture.data).toBeUndefined();
  });

  it('hache le nouveau mot de passe et efface le drapeau de première connexion', async () => {
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('bon-mot-de-passe', 4);
    await service(capture, hash).changerMotDePasse('u1', 'bon-mot-de-passe', 'nouveau-tres-long');
    expect(capture.data!.doitChangerMotDePasse).toBe(false);
    // Jamais stocké en clair, et vérifiable par bcrypt.
    expect(capture.data!.motDePasse).not.toBe('nouveau-tres-long');
    expect(await bcrypt.compare('nouveau-tres-long', capture.data!.motDePasse as string)).toBe(true);
  });

  it('RÉVOQUE les sessions ouvertes · un mot de passe change souvent parce qu’il a fuité', async () => {
    // Sans cette révocation, celui qui détenait le mot de passe gardait sa
    // session jusqu'à huit heures, et le changement ne servait à rien pendant
    // la seule période où il aurait servi.
    const capture: { data?: Record<string, unknown> } = {};
    const hash = await bcrypt.hash('bon-mot-de-passe', 4);
    const resultat = await service(capture, hash).changerMotDePasse('u1', 'bon-mot-de-passe', 'nouveau-tres-long');

    expect(capture.data!.sessionsInvalidesAvant).toBeInstanceOf(Date);
    // Le verrou de force brute tombe aussi · le titulaire vient de prouver
    // qui il est en donnant l'ancien mot de passe.
    expect(capture.data!.tentativesEchouees).toBe(0);
    expect(capture.data!.verrouilleJusqua).toBeNull();
    // Une session neuve est rendue, sans quoi le titulaire serait éjecté par
    // son propre geste.
    expect(resultat).toMatchObject({ change: true, accessToken: 'jeton-neuf' });
  });
});
