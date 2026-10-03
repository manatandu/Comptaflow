import { montant } from './montants';
import type { ProvisionChangeOuvertureLigne } from './types';

/**
 * Le message d'une version hors de ses bornes (ligne A5, huitième et neuvième
 * relectures), tiré des seuls champs que le serveur sert · l'écran ne juge
 * rien. Sous le plancher, la conséquence est la double dotation ; une
 * contestation dont la provision du module a changé depuis le dit, avec les
 * deux montants. Au-dessus du plafond, une reprise rendrait le compte débiteur.
 * `null` quand la version est dans ses bornes.
 */
export function messageVersionHorsBornes(
  l: Pick<
    ProvisionChangeOuvertureLigne,
    'horsBornes' | 'provisionModuleOuverture' | 'ouvertureFiable' | 'plancherVersion' | 'plafondVersion' | 'enVigueur'
  >,
): string | null {
  if (!l.horsBornes) return null;
  const bornes = `Admis entre ${montant(l.plancherVersion)} et ${montant(l.plafondVersion)}.`;
  if (l.horsBornes === 'PLAFOND') {
    return (
      `La provision déclarée dépasse le solde ${l.ouvertureFiable ? 'créditeur d’ouverture' : 'reconstitué à la clôture précédente'} · ` +
      `une reprise rendrait le compte débiteur. ${bornes}`
    );
  }
  const conteste = l.enVigueur?.provisionModuleContestee ? l.enVigueur.provisionModuleContesteeMontant : null;
  if (conteste !== null && conteste !== undefined) {
    return (
      `La provision passée par OmegaX a changé depuis la contestation (${montant(conteste)} contestés, ` +
      `${montant(l.provisionModuleOuverture)} aujourd’hui) · la perte provisionnée depuis serait dotée une seconde fois. ${bornes}`
    );
  }
  return (
    `La provision déclarée est sous celle du module (${montant(l.provisionModuleOuverture)}) · ` +
    `la perte déjà provisionnée serait dotée une seconde fois. ${bornes}`
  );
}
