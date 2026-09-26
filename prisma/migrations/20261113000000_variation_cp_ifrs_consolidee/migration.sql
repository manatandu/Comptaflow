-- Variation des capitaux propres IFRS consolidée (IFRS 18 § 107 a et c iii) ·
-- la colonne des minoritaires et les variations de parts d'intérêts.

-- AlterEnum
ALTER TYPE "ComposanteCpIfrs" ADD VALUE 'MINORITAIRES';

-- AlterEnum
ALTER TYPE "TypeMouvementCpIfrs" ADD VALUE 'VARIATION_PARTS_INTERETS';

-- AlterTable
ALTER TABLE "mouvements_capitaux_propres_ifrs" ADD COLUMN     "consolide" BOOLEAN NOT NULL DEFAULT false;

