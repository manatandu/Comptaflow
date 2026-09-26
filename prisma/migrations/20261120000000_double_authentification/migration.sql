-- Double authentification (TOTP) par utilisateur.
ALTER TABLE "users" ADD COLUMN "secretDoubleAuth" TEXT;
ALTER TABLE "users" ADD COLUMN "doubleAuthActiveDepuis" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "dernierPasDoubleAuth" INTEGER;
ALTER TABLE "users" ADD COLUMN "codesSecoursDoubleAuth" TEXT[] DEFAULT ARRAY[]::TEXT[];
