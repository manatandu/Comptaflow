-- Ligne A21 · date de réception d'une facture reçue (AUDCIF art. 16, al. 2).
-- Nullable et sans défaut · les factures déjà enregistrées n'en ont pas, et
-- aucune ne se déduit.
ALTER TABLE "factures" ADD COLUMN "dateReception" TIMESTAMP(3);

CREATE INDEX "factures_tenantId_sens_dateReception_idx" ON "factures"("tenantId", "sens", "dateReception");

-- Une pièce émise par le dossier (vente) se date à son émission · seule une
-- pièce d'origine externe porte une date de réception, jamais antérieure à
-- la pièce elle-même.
ALTER TABLE "factures" ADD CONSTRAINT "factures_date_reception_achat"
  CHECK ("dateReception" IS NULL OR ("sens" = 'ACHAT' AND "dateReception" >= "dateFacture"));
