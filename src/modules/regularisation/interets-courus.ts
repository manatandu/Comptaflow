/**
 * LIGNE A12 · LES INTÉRÊTS COURUS SUR EMPRUNTS (relevé CPCC C8).
 *
 * AUDCIF, Titre VII, fiche du COMPTE 16 · « Le compte 16 est crédité, à la
 * clôture de l'exercice, des intérêts courus jusqu'au jour de la clôture, par
 * le débit du compte 671 (Intérêts des emprunts) » et « débité, à l'ouverture
 * de l'exercice, du montant des intérêts courus pris en compte à la clôture
 * de l'exercice précédent, par le crédit du 671 ». C'est un RATTACHEMENT,
 * comme la charge à payer · la charge de N, entière, au crédit d'un compte de
 * dette, contre-passée à l'ouverture de N+1. Le module des régularisations le
 * porte déjà (`CHARGE_A_PAYER`, `reprendre`) · seule la nature du tiers
 * « prêteurs » s'y ajoute, et son compte de rattachement se lit sur
 * l'EMPRUNT, non sur une table de tiers.
 *
 * UN NUMÉRO, DEUX PLANS (CLAUDE.md, ligne A6). Au SYSCOHADA les emprunts
 * sont au 16 et leurs intérêts courus au 166 (« 1661 sur emprunts
 * obligataires · 1662 sur emprunts et dettes auprès des établissements de
 * crédit · 1663 sur avances reçues de l'État · 1664 sur avances reçues et
 * comptes courants bloqués · 1665 sur dépôts et cautionnements reçus · 1667
 * sur avances assorties de conditions particulières · 1668 sur autres
 * emprunts et dettes »). Au SYCEBNL le 16 est un FONDS (« Fonds affectés »)
 * et les emprunts sont au 18, avec la même phrase à la fiche du COMPTE 18 et
 * leurs intérêts au 186 (« 1861 sur emprunts obligataires, 1862 sur emprunts
 * et dettes auprès des établissements de crédit, 1863 sur avances reçues de
 * l'Etat, 1865 sur dépôts et cautionnements reçus, 1868 sur autres emprunts
 * et dettes »). Le chiffre qui suit la racine se reprend au 166 ou au 186.
 *
 * TROIS REFUS ÉCRITS.
 *   - SYCEBNL 184 « Avances reçues et comptes courants bloqués » · sa fiche
 *     n'ouvre AUCUN 1864 · anomalie du texte, non comblée ; l'écriture se
 *     passe à la main sur le compte que le dossier ouvre pour ce cas.
 *   - SYSCOHADA 1681 « Rentes viagères capitalisées » · aucune distinction
 *     intérêts et capital, « la totalité de chaque versement débite le
 *     1681 » (Titre VIII ch. 11).
 *   - Dettes de location acquisition (17 au SYSCOHADA, 187 au SYCEBNL) et
 *     dettes liées à des participations (18 au SYSCOHADA) · hors du compte 16
 *     (fiche du compte 16, exclusions), hors de cette ligne.
 *
 * LE COMPTE DE CHARGE · la fiche du 16 nomme le 671, que les deux plans
 * subdivisent en 6711 (emprunts obligataires) et 6712 (établissements de
 * crédit) ; la fiche du COMPTE 67 range les intérêts des avances reçues,
 * dépôts et comptes courants bloqués au 674 (« 6741 avances reçues et dépôts
 * créditeurs · 6742 comptes courants bloqués · 6748 intérêts sur dettes
 * diverses »). Admis · 6711, 6712, 6741, 6742, 6748. Refusés · 6713 et 6714
 * (primes de remboursement, et au SYSCOHADA dettes liées à des
 * participations), 6743 à 6745 (obligations cautionnées, dettes
 * commerciales, opérations bancaires), qui ne rémunèrent pas un emprunt du
 * 16 ou du 18. Le compte PROPOSÉ ne l'est que là où l'intitulé du plan
 * nomme la même dette ; ailleurs, le cabinet choisit.
 *
 * AUCUN TAUX · le montant est celui que le cabinet DÉCLARE d'après le
 * tableau d'amortissement ou le décompte du prêteur (fiche du compte 16,
 * éléments de contrôle, « calcul des intérêts courus »).
 */
import { Referentiel } from '@prisma/client';

/** Le chiffre de la catégorie d'emprunt, lu sur son numéro, et le compte d'intérêts courus. */
export function compteInteretsCourus(
  referentiel: Referentiel,
  numeroEmprunt: string,
): { racine: string } | { refus: string } {
  if (referentiel === Referentiel.SYSCOHADA) {
    if (!numeroEmprunt.startsWith('16')) {
      return {
        refus:
          `Le compte ${numeroEmprunt} n'est pas un emprunt du compte 16 · les dettes de location acquisition (17) et ` +
          'les dettes liées à des participations (18) en sont exclues (AUDCIF, Titre VII, fiche du compte 16).',
      };
    }
    if (numeroEmprunt.startsWith('166')) return { refus: 'Le 166 porte les intérêts courus eux-mêmes · désignez l’emprunt.' };
    // Les subdivisions de la fiche · 161 à 165, 167, 168 ; aucun 160 ni 169.
    if (!/^16[1-578]/.test(numeroEmprunt)) return { refus: `Le compte ${numeroEmprunt} n'est pas un emprunt du compte 16.` };
    if (numeroEmprunt.startsWith('1681')) {
      return {
        refus:
          'Une rente viagère capitalisée ne distingue ni intérêts ni capital · « la totalité de chaque versement débite ' +
          'le 1681 » (AUDCIF, Titre VIII ch. 11) ; elle ne porte pas d’intérêts courus.',
      };
    }
    return { racine: `166${numeroEmprunt[2]}` };
  }
  // SYCEBNL · les emprunts au 18, le 16 étant un fonds.
  if (numeroEmprunt.startsWith('16')) {
    return {
      refus:
        `Au SYCEBNL le compte ${numeroEmprunt} est un fonds affecté, pas un emprunt · les emprunts et leurs intérêts ` +
        'courus sont au 18 (SYCEBNL, Partie 2 ch. 3, fiche du compte 18).',
    };
  }
  if (!/^18[1-58]/.test(numeroEmprunt)) {
    return {
      refus:
        `Le compte ${numeroEmprunt} n'est pas un emprunt dont la fiche du compte 18 ouvre les intérêts courus · ` +
        '181, 182, 183, 185 ou 188 (SYCEBNL, Partie 2 ch. 3) ; les dettes de location acquisition (187) sont hors de ce geste.',
    };
  }
  if (numeroEmprunt.startsWith('184')) {
    return {
      refus:
        'La fiche du compte 18 du SYCEBNL n’ouvre aucun intérêt couru sur avances reçues et comptes courants bloqués · ' +
        'le 186 ne porte que 1861, 1862, 1863, 1865 et 1868. OmegaX ne comble pas ce silence · passez l’écriture à la ' +
        'main sur le compte que votre plan ouvre pour ce cas.',
    };
  }
  return { racine: `186${numeroEmprunt[2]}` };
}

/** Racines de charge admises pour les intérêts d'un emprunt (fiches des comptes 16, 18 et 67). */
export const CHARGES_INTERETS_ADMISES = ['6711', '6712', '6741', '6742', '6748'] as const;

export function motifRefusChargeInterets(numeroCharge: string): string | null {
  if (CHARGES_INTERETS_ADMISES.some((r) => numeroCharge.startsWith(r))) return null;
  return (
    `Les intérêts courus d'un emprunt se portent au 671 (fiche du compte 16) ou, pour les avances, dépôts et comptes ` +
    `courants, au 674 (fiche du compte 67) · 6711, 6712, 6741, 6742 ou 6748, pas ${numeroCharge}.`
  );
}

/**
 * Le compte de charge PROPOSÉ · seulement là où l'intitulé du plan nomme la
 * même dette. Mêmes numéros aux deux plans pour ces cinq comptes.
 */
export function chargeInteretsProposee(referentiel: Referentiel, numeroEmprunt: string): string | null {
  const categorie = numeroEmprunt[2];
  const prefixe = referentiel === Referentiel.SYSCOHADA ? '16' : '18';
  if (!numeroEmprunt.startsWith(prefixe)) return null;
  if (categorie === '1') return '6711';
  if (categorie === '2') return '6712';
  if (categorie === '3' || categorie === '5') return '6741';
  if (categorie === '4' && referentiel === Referentiel.SYSCOHADA) return '6742';
  return null;
}
