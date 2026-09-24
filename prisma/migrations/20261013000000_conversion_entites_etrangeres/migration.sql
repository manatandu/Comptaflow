-- AlterTable
ALTER TABLE "entites_perimetre_consolidation" ADD COLUMN     "capitauxPropresHistoriques" DECIMAL(18,2),
ADD COLUMN     "coursCloture" DECIMAL(20,8),
ADD COLUMN     "coursEntree" DECIMAL(20,8),
ADD COLUMN     "coursProduitsCharges" DECIMAL(20,8),
ADD COLUMN     "hyperinflation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "justificationMonnaie" TEXT,
ADD COLUMN     "monnaieBalance" VARCHAR(3);

