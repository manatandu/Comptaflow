/**
 * L'AVIS HORS BANDE D'UN CHANGEMENT DU SECOND FACTEUR.
 *
 * NIST SP 800-63B-4 (gestion du cycle de vie des authentificateurs) veut que
 * le titulaire soit averti, par un canal distinct de la session, quand un
 * authentificateur est lié à son compte ou en est retiré. La raison est celle
 * qui justifie d'exiger le mot de passe à l'activation · une session volée
 * qui installe SA propre application ferme la porte au titulaire, et ce
 * courriel est le seul signal qui lui parvienne hors de cette session.
 *
 * Le corps ne porte AUCUN secret · ni la clé, ni un code de secours, ni un
 * lien d'action. Il est écrit en clair dans la table `messages`, part dans la
 * sauvegarde de chaque nuit et se rend entier à tout utilisateur du dossier
 * (même raison qu'avis-acces.service.ts). Il dit ce qui a changé, quand, et
 * quoi faire si le titulaire n'en est pas l'auteur.
 */

export type EvenementDoubleAuth = 'ACTIVEE' | 'RETIREE' | 'CODES_SECOURS_REGENERES';

const CE_QUI_A_CHANGE: Record<EvenementDoubleAuth, { sujet: string; phrase: string }> = {
  ACTIVEE: {
    sujet: 'Double authentification activée',
    phrase: 'La double authentification vient d’être activée sur votre compte · une application d’authentification y est désormais liée.',
  },
  RETIREE: {
    sujet: 'Double authentification retirée',
    phrase: 'La double authentification vient d’être retirée de votre compte · le mot de passe suffit de nouveau pour vous connecter.',
  },
  CODES_SECOURS_REGENERES: {
    sujet: 'Nouveaux codes de secours',
    phrase: 'De nouveaux codes de secours viennent d’être engendrés pour votre compte · les précédents ne valent plus.',
  },
};

/** Date et heure au calendrier de Kinshasa, comme le reste du logiciel. */
function horodatage(instant: Date): string {
  return instant.toLocaleString('fr-FR', { timeZone: 'Africa/Kinshasa', dateStyle: 'long', timeStyle: 'short' });
}

export function avisDoubleAuth(evenement: EvenementDoubleAuth, compte: { email: string; instant: Date }): { sujet: string; corps: string } {
  const { sujet, phrase } = CE_QUI_A_CHANGE[evenement];
  return {
    sujet: `OmegaX · ${sujet}`,
    corps: [
      'Bonjour,',
      '',
      phrase,
      '',
      `Compte · ${compte.email}`,
      `Le · ${horodatage(compte.instant)} (heure de Kinshasa)`,
      '',
      'Si vous êtes l’auteur de ce changement, ce message ne demande rien.',
      'Sinon, changez sans attendre votre mot de passe et prévenez l’administrateur de votre dossier · il peut réinitialiser votre accès.',
    ].join('\n'),
  };
}
