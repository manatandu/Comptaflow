-- A8 · le décompte final émis et figé dans la séquence des bulletins.
-- Arrêté n° 12/CAB.MIN/ETPS/042 du 8 août 2008, art. 2 · le décompte écrit
-- remis à la résiliation est un double du livre de paie, numéroté avec les
-- autres (Code du travail, art. 214). Les lignes existantes sont des bulletins
-- du mois · la valeur par défaut les décrit exactement.
CREATE TYPE "NatureBulletinPaie" AS ENUM ('MOIS', 'DECOMPTE_FINAL');

ALTER TABLE "bulletins_paie" ADD COLUMN "nature" "NatureBulletinPaie" NOT NULL DEFAULT 'MOIS';
