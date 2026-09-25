-- Point 19 de la comparaison Sage i7 · banques (établissement et RIB) et libellés pré-enregistrés.
-- CreateTable
CREATE TABLE "banques" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "adresse" TEXT,
    "codePostal" TEXT,
    "ville" TEXT,
    "pays" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "contact" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ribs_banque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "banqueId" TEXT NOT NULL,
    "abrege" TEXT NOT NULL,
    "devise" TEXT,
    "codeBic" TEXT,
    "codeBanque" TEXT,
    "codeGuichet" TEXT,
    "numeroCompte" TEXT,
    "cle" TEXT,
    "iban" TEXT,
    "commentaire" TEXT,
    "journalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ribs_banque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "libelles_ecriture" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "libelles_ecriture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banques_tenantId_intitule_key" ON "banques"("tenantId", "intitule");

-- CreateIndex
CREATE UNIQUE INDEX "ribs_banque_journalId_key" ON "ribs_banque"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "ribs_banque_tenantId_abrege_key" ON "ribs_banque"("tenantId", "abrege");

-- CreateIndex
CREATE UNIQUE INDEX "libelles_ecriture_tenantId_code_key" ON "libelles_ecriture"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "banques" ADD CONSTRAINT "banques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ribs_banque" ADD CONSTRAINT "ribs_banque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ribs_banque" ADD CONSTRAINT "ribs_banque_banqueId_fkey" FOREIGN KEY ("banqueId") REFERENCES "banques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ribs_banque" ADD CONSTRAINT "ribs_banque_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "libelles_ecriture" ADD CONSTRAINT "libelles_ecriture_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

