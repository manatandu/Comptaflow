-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "activite" TEXT,
ADD COLUMN     "adresse" TEXT,
ADD COLUMN     "devise" TEXT DEFAULT 'CDF',
ADD COLUMN     "pays" TEXT DEFAULT 'RD Congo',
ADD COLUMN     "telephone" TEXT,
ADD COLUMN     "ville" TEXT;
