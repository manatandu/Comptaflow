-- CreateTable
CREATE TABLE "notes_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "contenu" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notes_ifrs_tenantId_exerciceId_key" ON "notes_ifrs"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "notes_ifrs" ADD CONSTRAINT "notes_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes_ifrs" ADD CONSTRAINT "notes_ifrs_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

