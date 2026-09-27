import { Prisma } from '@prisma/client';

/**
 * UNE LIGNE OUVERTE À LA CLÔTURE (audit final F10).
 *
 * Les notes par échéance (6, 9, 10, 18A, 19 à 21) et l'état des créances et
 * dettes des deux SMT lisaient « non lettrée », sans regarder la date. Or le
 * lettrage entre exercices est permis : une facture ouverte au 31 décembre et
 * réglée en mars, lettrée en mars, sortait des colonnes d'échéance de la
 * liasse de décembre sans entrer nulle part, sur un solde qui la contenait.
 *
 * Est ouverte à la clôture toute ligne sans lettre (un groupe PARTIEL n'en
 * porte pas), et toute ligne dont le groupe contient une ligne datée APRÈS la
 * clôture · c'est ce règlement postérieur qui la soldait, pas un mouvement de
 * l'exercice. La date qui compte est celle des écritures, jamais celle du
 * lettrage : un règlement de décembre lettré en mars était soldé en décembre.
 */
export function ouverteALaCloture(dateFin: Date): Prisma.LigneEcritureWhereInput {
  return {
    OR: [{ lettre: null }, { lettrage: { lignes: { some: { ecriture: { date: { gt: dateFin } } } } } }],
  };
}
