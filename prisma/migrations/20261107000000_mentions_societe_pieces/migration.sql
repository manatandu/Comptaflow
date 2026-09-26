-- AUSCGIE art. 17 · mentions de la société recopiées sur la facture et le devis émis.
ALTER TABLE "factures" ADD COLUMN "mentionsSocieteEmetteur" JSONB;
ALTER TABLE "devis" ADD COLUMN "mentionsSocieteEmetteur" JSONB;
