/**
 * Ligne A14 · les natures de sortie OFFERTES à l'écran, miroir de
 * `src/modules/immobilisations/nature-sortie.ts` (le serveur refuse le reste).
 * Fiche du compte 81 (vente, échange, mise au rebut, destruction), AUDCIF
 * Titre V § 5.8 et SYCEBNL cadre conceptuel § 5.5 (vol, disparition),
 * SYCEBNL Partie 3 ch. 3 § 2.5 (remise gratuite, restitution). L'échange a
 * son propre geste et n'est jamais offert ici.
 */
export type NatureSortie =
  | 'VENTE'
  | 'ECHANGE'
  | 'MISE_AU_REBUT'
  | 'DESTRUCTION'
  | 'VOL'
  | 'DISPARITION'
  | 'REMISE_GRATUITE'
  | 'RESTITUTION';

export const LIBELLES_NATURE_SORTIE: Record<NatureSortie, string> = {
  VENTE: 'Vente',
  ECHANGE: 'Échange',
  MISE_AU_REBUT: 'Mise au rebut',
  DESTRUCTION: 'Destruction',
  VOL: 'Vol',
  DISPARITION: 'Disparition',
  REMISE_GRATUITE: 'Remise gratuite (fin de projet)',
  RESTITUTION: 'Restitution',
};

export function naturesSortieOffertes(opts: {
  type: 'CESSION' | 'MISE_HORS_SERVICE';
  projetDeveloppement: boolean;
  usufruit: boolean;
}): NatureSortie[] {
  if (opts.type === 'CESSION') return ['VENTE'];
  const natures: NatureSortie[] = ['MISE_AU_REBUT', 'DESTRUCTION', 'VOL', 'DISPARITION'];
  if (opts.projetDeveloppement) natures.push('REMISE_GRATUITE');
  if (opts.projetDeveloppement || opts.usufruit) natures.push('RESTITUTION');
  return natures;
}
