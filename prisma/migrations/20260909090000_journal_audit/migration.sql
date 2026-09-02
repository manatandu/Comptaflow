-- Journal d'audit technique · AUDCIF art. 22, 6° (reconstitution du chemin de
-- révision) et 5° (transcription indélébile). Écrite à la main comme toutes
-- les migrations de ce dépôt.

CREATE TYPE "ActionAudit" AS ENUM ('CREATION', 'MODIFICATION', 'SUPPRESSION');

CREATE TABLE "evenements_audit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "rang" INTEGER NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acteurId" TEXT,
    "acteurEmail" TEXT NOT NULL,
    "adresseIp" TEXT,
    "action" "ActionAudit" NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT,
    "avant" JSONB,
    "apres" JSONB,
    "empreintePrecedente" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,

    CONSTRAINT "evenements_audit_pkey" PRIMARY KEY ("id")
);

-- L'unicité de l'empreinte interdit le rejeu d'un événement identique ·
-- l'empreinte porte le rang et le précédent, deux événements légitimes ne
-- peuvent donc pas la partager.
CREATE UNIQUE INDEX "evenements_audit_empreinte_key" ON "evenements_audit"("empreinte");

-- Le rang est unique PAR CHAÎNE. C'est cette contrainte qui rend une insertion
-- intercalaire impossible en base, sans même vérifier les empreintes.
--
-- NULLS NOT DISTINCT est indispensable et non décoratif : par défaut Postgres
-- tient deux NULL pour distincts, et la chaîne de la PLATEFORME (tenantId nul,
-- les actes de la console VMG) n'aurait alors aucune protection contre
-- l'insertion intercalaire · exactement la chaîne où elle importe le plus.
-- Disponible depuis PostgreSQL 15 ; la base est en 18.
CREATE UNIQUE INDEX "evenements_audit_tenantId_rang_key"
    ON "evenements_audit"("tenantId", "rang") NULLS NOT DISTINCT;

CREATE INDEX "evenements_audit_tenantId_horodatage_idx" ON "evenements_audit"("tenantId", "horodatage");
CREATE INDEX "evenements_audit_tenantId_entite_entiteId_idx" ON "evenements_audit"("tenantId", "entite", "entiteId");

ALTER TABLE "evenements_audit" ADD CONSTRAINT "evenements_audit_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
