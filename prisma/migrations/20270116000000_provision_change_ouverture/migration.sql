-- LIGNE A5 · provision pour pertes de change existant à l'ouverture, déclarée
-- par le cabinet (décision de Manasse du 2026-10-02). Fiche du compte 19 de
-- l'AUDCIF (« réajusté à la clôture de chaque exercice ») et fiche du compte
-- 77 (reprise des provisions « existant au début de l'exercice ») · un dossier
-- repris porte déjà sa provision, que l'ajustement doit lire. Des VERSIONS
-- datées par compte de la famille (194, 4991, 4997) · une version utilisée ne
-- se réécrit pas (AUDCIF art. 22, 2° ; art. 20), une nouvelle la suit, datée
-- au début d'un exercice plus tard, avec son motif.
CREATE TABLE "provisions_change_ouverture" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compteProvision" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "dateReference" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "motif" TEXT,
    "provisionModuleContestee" BOOLEAN NOT NULL DEFAULT false,
    "motifContestation" TEXT,
    "provisionModuleContesteeMontant" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "modifiedBy" TEXT,

    CONSTRAINT "provisions_change_ouverture_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provisions_change_ouverture_tenantId_compteProvision_dateRe_key" ON "provisions_change_ouverture"("tenantId", "compteProvision", "dateReference");

ALTER TABLE "provisions_change_ouverture" ADD CONSTRAINT "provisions_change_ouverture_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Verrou d'un geste sur la provision pour pertes de change (quatrième
-- relecture) · une ligne par dossier, insérée sur la clé unique et retirée à
-- la fin du geste ; aucun verrou ne retient de connexion.
CREATE TABLE "verrous_provision_change" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "geste" TEXT NOT NULL,
    "echeance" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verrous_provision_change_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "verrous_provision_change_tenantId_key" ON "verrous_provision_change"("tenantId");

ALTER TABLE "verrous_provision_change" ADD CONSTRAINT "verrous_provision_change_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
