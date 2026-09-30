import { Referentiel } from '@prisma/client';

/**
 * LA CLASSE 9 S'ÉQUILIBRE EN ELLE-MÊME · les comptes 90 et 91 ne se soldent
 * jamais contre un compte des classes 1 à 8 (passe R1, C7 et R5, A3 ·
 * 2026-09-30).
 *
 * SYSCOHADA · AUDCIF, Titre VII, classe 9 · les engagements obtenus
 * « s'enregistrent par convention […] au débit des comptes 901 à 904 », les
 * engagements accordés « au crédit des comptes 905 à 908 », et « les comptes
 * de contrepartie des engagements hors bilan […] sont : 911 à 914 ·
 * contreparties des comptes 901 à 904 ; 915 à 918 · contreparties des
 * comptes 905 à 908 ».
 *
 * SYCEBNL · Partie 2 ch. 1 · les contributions volontaires en nature « ne
 * répond[ent] pas à la définition ou aux critères de comptabilisation d'un
 * actif ou d'un passif […]. En conséquence, leur prise en compte en
 * comptabilité financière ne doit pas impacter le bilan et le compte de
 * résultat » ; ch. 3, classe 9 · « Sont débités les comptes 900 à 904 […]
 * Par le crédit des comptes 910 à 914 ».
 *
 * Une pièce D 90 / C 571 s'équilibre, la balance boucle, et le bilan cesse
 * de boucler sans qu'aucune cause ne soit nommée, la classe 9 n'étant lue par
 * aucun état. Ce qui est exigé n'est PAS l'absence de mélange · une même
 * pièce peut porter un bloc hors bilan équilibré à côté d'un bloc de bilan
 * (le tirage partiel d'un crédit confirmé). C'est l'ÉQUILIBRE DES LIGNES 90
 * ET 91 ENTRE ELLES. Les comptes 92 à 99 (analytique) ne sont pas visés.
 */
export const RACINES_HORS_BILAN = ['90', '91'] as const;

export function ecartClasse9(lignes: Array<{ numero: string; debit?: number; credit?: number }>): number {
  const ecart = lignes
    .filter((l) => RACINES_HORS_BILAN.some((r) => l.numero.startsWith(r)))
    .reduce((s, l) => s + (l.debit ?? 0) - (l.credit ?? 0), 0);
  return Math.abs(ecart) > 0.005 ? Math.round(ecart * 100) / 100 : 0;
}

export function motifRefusClasse9(referentiel: Referentiel, ecart: number): string | null {
  if (ecart === 0) return null;
  const texte =
    referentiel === Referentiel.SYSCOHADA
      ? "AUDCIF, Titre VII, classe 9 · les 901 à 904 ont pour contrepartie les 911 à 914, les 905 à 908 les 915 à 918"
      : 'SYCEBNL, Partie 2 ch. 1 et ch. 3, classe 9 · les contributions volontaires en nature « ne doi[vent] pas ' +
        'impacter le bilan et le compte de résultat », les 900 à 904 se débitant par le crédit des 910 à 914';
  return (
    `Les lignes sur les comptes 90 et 91 ne s'équilibrent pas entre elles (écart ${ecart.toFixed(2)}) · la ` +
    `classe 9 ne se solde pas contre un compte des classes 1 à 8. ${texte}.`
  );
}
