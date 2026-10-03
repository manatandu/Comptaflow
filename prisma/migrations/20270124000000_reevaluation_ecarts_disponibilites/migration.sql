-- Ligne A5 bis (2026-10-03) · l'écart de chaque disponibilité, par compte et
-- par devise, est gardé sur la réévaluation · AUDCIF art. 57, il est réalisé
-- et ne se contre-passe plus ; la réévaluation suivante le relit. Nul sur les
-- réévaluations déjà passées.
ALTER TABLE "reevaluations" ADD COLUMN "ecartsDisponibilites" JSONB;

-- Relecture adverse d'A5 bis · la ventilation déclarée d'un écart passé sans
-- devise sur une banque à plusieurs devises (B1), la contre-passation
-- intégrale par exception nommée (B2, M2), et la trace des contre-passations
-- annulées pour être repassées dans l'exercice qui suit (M1).
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilites" JSONB;
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilitesSource" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilitesLe" TIMESTAMP(3);
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilitesPar" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "contrePassationIntegrale" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "annulationsContrePassation" JSONB;

-- Troisième tour d'A5 bis · la contre-passation faite à la main, hors du
-- module, se DÉCLARE · l'écriture désignée, son motif, sa date et son auteur.
-- RESTRICT · l'écriture est retenue par la réévaluation, une suppression qui
-- passerait la garde est refusée par la base, jamais dénouée en silence.
ALTER TABLE "reevaluations" ADD COLUMN "contrePassationDeclareeId" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "motifContrePassationDeclaree" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "contrePassationDeclareeLe" TIMESTAMP(3);
ALTER TABLE "reevaluations" ADD COLUMN "contrePassationDeclareePar" TEXT;
CREATE UNIQUE INDEX "reevaluations_contrePassationDeclareeId_key" ON "reevaluations"("contrePassationDeclareeId");
ALTER TABLE "reevaluations" ADD CONSTRAINT "reevaluations_contrePassationDeclareeId_fkey" FOREIGN KEY ("contrePassationDeclareeId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Quatrième tour · la trace des déclarations retirées, avec le motif du retrait.
ALTER TABLE "reevaluations" ADD COLUMN "retraitsContrePassationDeclaree" JSONB;
