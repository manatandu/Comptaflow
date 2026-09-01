-- Plafond de cellules qu'un dossier mère peut créer lui-même · paramètre
-- commercial de la licence de groupe, fixé depuis la console plateforme.
-- null = pas de création par le siège, tout passe par la console.
ALTER TABLE "tenants" ADD COLUMN "plafondCellules" INTEGER;
