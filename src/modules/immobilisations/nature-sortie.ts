/**
 * LIGNE A14 · LA NATURE DE LA SORTIE ET SA PIÈCE (relevé CPCC C11).
 *
 * Jusqu'ici une sortie ne disait que « cession » ou « mise hors service ». Un
 * bien volé, un bien détruit et un bien mis au rebut sortaient sous le même
 * libellé, sans la pièce qui les justifie · le réviseur qui lit le 81 ne
 * pouvait ni distinguer les cas ni remonter au procès-verbal.
 *
 * LA LISTE EST FERMÉE ET CHAQUE NATURE A SON TEXTE.
 *   - VENTE, ÉCHANGE, MISE AU REBUT, DESTRUCTION · fiche du COMPTE 81 des deux
 *     plans, « Par cession, il faut entendre : vente, échange, mise au rebut
 *     ou destruction » (AUDCIF Titre VII ; SYCEBNL Partie 2 ch. 3).
 *   - VOL, DISPARITION · règles de décomptabilisation, « mise au rebut,
 *     cession, destruction, vol, disparition » (AUDCIF Titre V ch. 5 § 5.8 ;
 *     SYCEBNL cadre conceptuel § 5.5, « de vol ou de disparition ») ; les
 *     fiches des comptes 21, 23 et 24 créditent le bien « en cas de cession,
 *     disparition, destruction ou mise au rebut ».
 *   - REMISE GRATUITE, RESTITUTION · SYCEBNL Partie 3 ch. 3 § 2.5.2 (« le
 *     bailleur remet gratuitement l'immobilisation à l'entité à la fin du
 *     projet ») et § 2.5.3 (« restitution des immobilisations au bailleur »),
 *     propres au jeu « projets de développement » ; la restitution vaut aussi
 *     pour l'usufruit temporaire rétrocédé au donateur (Partie 3 ch. 2
 *     § 2.3.2).
 *
 * LE PILLAGE N'EST NOMMÉ PAR AUCUN TEXTE LU · c'est une soustraction, il se
 * déclare en VOL et la pièce (procès-verbal de constat) le décrit. Le texte
 * ne lui donne aucun traitement propre, OmegaX ne lui en invente pas.
 *
 * L'ÉCHANGE NE PASSE PAS PAR LA SORTIE SEULE · il a son geste
 * (`ImmobilisationService.echanger`), qui fait entrer le bien reçu dans la
 * même opération ; déclaré ici, le bien remis sortirait sans contrepartie.
 *
 * LA PIÈCE · AUDCIF art. 17, 3° (« la justification des écritures par des
 * pièces datées […] portant les références de leur enregistrement ») et 5°
 * (« les références de la pièce justificative qui l'appuie »). La fiche du
 * compte 81 nomme les documents de contrôle · « procès-verbal de mise au
 * rebut ; factures de vente ; procès-verbal de destruction » · OmegaX exige
 * une référence et une date, il ne type pas le document (une décision de
 * l'organe compétent, une plainte, un acte de remise y entrent aussi).
 */
import { NatureSortieImmobilisation } from '@prisma/client';

export const NATURES_SORTIE: readonly NatureSortieImmobilisation[] = [
  'VENTE',
  'ECHANGE',
  'MISE_AU_REBUT',
  'DESTRUCTION',
  'VOL',
  'DISPARITION',
  'REMISE_GRATUITE',
  'RESTITUTION',
] as const;

export const LIBELLES_NATURE_SORTIE: Record<NatureSortieImmobilisation, string> = {
  VENTE: 'vente',
  ECHANGE: 'échange',
  MISE_AU_REBUT: 'mise au rebut',
  DESTRUCTION: 'destruction',
  VOL: 'vol',
  DISPARITION: 'disparition',
  REMISE_GRATUITE: 'remise gratuite',
  RESTITUTION: 'restitution',
};

export interface ContexteNatureSortie {
  nature: NatureSortieImmobilisation;
  /** `CESSION` ou `MISE_HORS_SERVICE`, le type du DTO. */
  type: 'CESSION' | 'MISE_HORS_SERVICE';
  /** Jeu « projets de développement » du SYCEBNL. */
  projetDeveloppement: boolean;
  /** Usufruit temporaire (division 20 du SYCEBNL). */
  usufruit: boolean;
  /** Vrai seulement pour l'appel interne de `echanger`. */
  depuisEchange?: boolean;
}

/** Le motif du refus, ou `null` si la nature convient à la sortie. */
export function motifRefusNatureSortie(c: ContexteNatureSortie): string | null {
  if (!NATURES_SORTIE.includes(c.nature)) return 'Nature de sortie inconnue.';
  if (c.nature === 'ECHANGE') {
    return c.depuisEchange
      ? null
      : "Un échange se passe par le geste « Échanger », qui fait entrer le bien reçu dans la même opération · " +
          'déclaré en sortie seule, le bien remis sortirait sans contrepartie.';
  }
  if (c.type === 'CESSION') {
    // La cession porte un prix (compte 82) · seule la vente en a un ici.
    return c.nature === 'VENTE'
      ? null
      : `Une cession avec prix est une vente · la ${LIBELLES_NATURE_SORTIE[c.nature]} se déclare en mise hors service, sans prix.`;
  }
  if (c.nature === 'VENTE') {
    return 'Une vente porte un prix de cession (compte 82) · déclarez-la en cession.';
  }
  if (c.nature === 'REMISE_GRATUITE' && !c.projetDeveloppement) {
    return "La remise gratuite par le bailleur est propre à la fin d'un projet de développement (SYCEBNL Partie 3 ch. 3 § 2.5.2).";
  }
  if (c.nature === 'RESTITUTION' && !c.projetDeveloppement && !c.usufruit) {
    return (
      "La restitution vise le bien rendu au bailleur à la fin d'un projet de développement (SYCEBNL Partie 3 ch. 3 " +
      "§ 2.5.3) ou l'usufruit temporaire rétrocédé au donateur (Partie 3 ch. 2 § 2.3.2)."
    );
  }
  return null;
}

/** Le refus de la pièce, ou `null` · référence et date, toutes deux exigées (art. 17, 3°). */
export function motifRefusPieceSortie(reference: string | null | undefined, date: Date | null): string | null {
  if (!reference || reference.trim().length === 0) {
    return 'La sortie exige la référence de sa pièce justificative · procès-verbal, facture de vente ou décision (AUDCIF art. 17, 3° et 5°).';
  }
  if (!date || Number.isNaN(date.getTime())) {
    return 'La pièce justificative de la sortie doit être datée (AUDCIF art. 17, 3°).';
  }
  return null;
}

/** Libellé de l'écriture de sortie · la nature y est lisible au journal. */
export function libelleSortie(opts: {
  projet: boolean;
  type: 'CESSION' | 'MISE_HORS_SERVICE';
  nature: NatureSortieImmobilisation | null | undefined;
  designation: string;
}): string {
  const base = opts.type === 'CESSION' ? 'Cession' : 'Mise hors service';
  const nature = opts.nature ? ` (${LIBELLES_NATURE_SORTIE[opts.nature]})` : '';
  return `${opts.projet ? 'Fin de projet · ' : ''}${base}${nature} · ${opts.designation}`;
}
