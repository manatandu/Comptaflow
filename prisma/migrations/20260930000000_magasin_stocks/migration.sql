-- LE MAGASIN · l'inventaire permanent, article par article.
--
-- Les deux textes ouvrent le même choix dans les mêmes mots (AUDCIF Titre VII
-- ch. 3 section 3 · SYCEBNL Partie 2 ch. 3 section 3) : « la comptabilisation
-- des stocks repose sur la tenue SOIT d'un inventaire PERMANENT, SOIT d'un
-- inventaire INTERMITTENT ». Le module ne servait que le second.
--
-- MethodeValorisationStock reprend EXACTEMENT les trois méthodes que le
-- glossaire (Titre VI) retient sur cinq. Le coût moyen pondéré ANNUEL et le
-- D.E.P.S. n'y sont pas, et le premier est la forme la plus répandue dans les
-- logiciels de la place.
--
-- PAS D'exerciceId SUR UN MOUVEMENT, À DESSEIN · une fiche de stock est
-- CONTINUE, et les couches du P.E.P.S. traversent la clôture avec leur coût
-- d'origine.
--
-- `cout` EST NULLABLE, ET C'EST LA RÈGLE CENTRALE DU MODULE : une sortie ne
-- porte jamais son coût, elle le calcule. « L'axiomatique comptable impose une
-- égalité systématique, dans tout compte, des sorties et des entrées EN
-- VALEURS, dès lors que toutes les unités entrées sont sorties » (Titre VI).

-- CreateEnum
CREATE TYPE "MethodeValorisationStock" AS ENUM ('PEPS', 'CMPACE', 'CMP_PERIODE_STOCKAGE');

-- CreateEnum
CREATE TYPE "SensMouvementStock" AS ENUM ('ENTREE', 'SORTIE');

-- CreateTable
CREATE TABLE "articles_stock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "uniteMesure" TEXT NOT NULL,
    "methodeValorisation" "MethodeValorisationStock" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvements_stock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ordre" INTEGER NOT NULL,
    "sens" "SensMouvementStock" NOT NULL,
    "quantite" DECIMAL(18,3) NOT NULL,
    "cout" DECIMAL(18,2),
    "piece" TEXT NOT NULL,
    "libelle" TEXT,
    "ecritureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "mouvements_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articles_stock_tenantId_compteId_idx" ON "articles_stock"("tenantId", "compteId");

-- CreateIndex
CREATE UNIQUE INDEX "articles_stock_tenantId_code_key" ON "articles_stock"("tenantId", "code");

-- CreateIndex
CREATE INDEX "mouvements_stock_tenantId_articleId_date_idx" ON "mouvements_stock"("tenantId", "articleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mouvements_stock_articleId_ordre_key" ON "mouvements_stock"("articleId", "ordre");

-- AddForeignKey
ALTER TABLE "articles_stock" ADD CONSTRAINT "articles_stock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles_stock" ADD CONSTRAINT "articles_stock_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles_stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
