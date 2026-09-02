import { SetMetadata } from '@nestjs/common';

export const CLE_SORTIE_MOT_DE_PASSE = 'sortie-mot-de-passe-provisoire';

/**
 * Route encore atteignable par un compte dont le mot de passe est PROVISOIRE.
 *
 * La liste doit rester minuscule : ce sont les seuls gestes qui permettent de
 * SORTIR de cet état (se voir, changer son mot de passe, se déconnecter).
 * Toute autre route est fermée · voir MotDePasseAChangerGuard.
 */
export const SortieMotDePasseProvisoire = () => SetMetadata(CLE_SORTIE_MOT_DE_PASSE, true);
