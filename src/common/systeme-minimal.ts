import { JeuEtatsFinanciersSycebnl, Referentiel, SystemeComptableSyscohada } from '@prisma/client';

/**
 * CE QUE LE SYSTÈME MINIMAL DE TRÉSORERIE N'ADMET PAS · la seule règle, lue
 * au serveur par chaque module qui refuse. Voir docs/audit-modules-par-profil.md.
 *
 * Le SMT est une comptabilité de trésorerie (SYCEBNL Partie 4 ch. 1 § 1.3 ;
 * AUDCIF art. 21 et Titre X ch. 1 § 1). Ses deux modèles d'états n'ouvrent
 * AUCUN poste de dépréciation ni de provision réglementée, et leur seule
 * ligne de charge calculée est celle des DOTATIONS AUX AMORTISSEMENTS
 * (SYCEBNL Partie 4 ch. 4, bilan GA à HZ et ligne JG ; AUDCIF Titre X ch. 2,
 * lettre F). Une dotation que le modèle ne sait pas présenter se range sous
 * les amortissements, et le compte de résultat publie sous ce nom ce qui
 * n'en est pas un · c'est ce que ces refus empêchent à la source.
 *
 * DEUX RÈGLES DE PORTÉE, à ne pas harmoniser.
 *  - La DÉPRÉCIATION est refusée aux DEUX SMT · aucun des deux modèles n'a
 *    de poste pour elle.
 *  - Le MODE D'AMORTISSEMENT n'est borné qu'au SMT SYSCOHADA · le Titre X
 *    écrit « mode linéaire sans prorata temporis ». Le SYCEBNL ne prescrit
 *    aucun mode à son SMT (la Note 1 ne demande que la « durée d'utilité »),
 *    et transposer la règle de l'AUDCIF serait le premier piège du dépôt.
 *
 * On ne refuse que les CRÉATIONS · un dossier passé du Système normal au SMT
 * garde son historique, et ce qui solde une opération antérieure (une reprise
 * de dérogatoire, par exemple) reste ouvert.
 */
export interface RegimeDossier {
  referentiel: Referentiel;
  jeuEtatsFinanciersSycebnl?: JeuEtatsFinanciersSycebnl | null;
  systemeComptableSyscohada?: SystemeComptableSyscohada | null;
}

export function estSystemeMinimal(t: RegimeDossier): boolean {
  return t.referentiel === Referentiel.SYCEBNL
    ? t.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE
    : t.systemeComptableSyscohada === SystemeComptableSyscohada.MINIMAL_TRESORERIE;
}

/** Le chemin par lequel chaque texte ferme la porte · jamais l'un pour l'autre. */
function sourceModele(referentiel: Referentiel): string {
  return referentiel === Referentiel.SYCEBNL
    ? 'SYCEBNL, Partie 4 ch. 4 (bilan GA à HZ, ligne JG « Dotations aux amortissements »)'
    : 'AUDCIF, Titre X ch. 2 (bilan et compte de résultat du SMT, lettre F « Dotations amortissements »)';
}

export function motifRefusDepreciationSmt(t: RegimeDossier): string | null {
  if (!estSystemeMinimal(t)) return null;
  return (
    "Ce dossier tient le Système minimal de trésorerie : son modèle d'états n'ouvre aucun poste de dépréciation, " +
    `et la seule charge calculée qu'il présente est l'amortissement (${sourceModele(t.referentiel)}). ` +
    'Une dépréciation y serait publiée comme un amortissement.'
  );
}

export function motifRefusAmortissementNonLineaireSmt(t: RegimeDossier, objet: string): string | null {
  if (t.referentiel !== Referentiel.SYSCOHADA || !estSystemeMinimal(t)) return null;
  return (
    `${objet} est refusé à un dossier au Système minimal de trésorerie · AUDCIF Titre X ch. 1 § 1, « chaque ` +
    "immobilisation doit faire l'objet d'un tableau d'amortissement basé sur le mode linéaire sans prorata temporis »."
  );
}
