-- Système comptable d'un dossier SYSCOHADA · AUDCIF art. 11 (« les
-- présentations admises sont le Système normal et le Système minimal de
-- trésorerie ») et art. 13 (seuils du SMT par nature d'activité : 60 M FCFA
-- négoce, 40 M artisanat, 30 M services). L'ancien Système allégé de
-- l'art. 12 est abrogé depuis la révision de 2017.
--
-- Colonne NULLABLE, sans valeur par défaut : null signifie « sans objet »,
-- l'état d'un dossier SYCEBNL. Les dossiers SYSCOHADA existants (aucun en
-- production à la date de cette migration, le référentiel venant d'ouvrir)
-- sont lus comme relevant du Système normal, qui est le régime de droit
-- commun de l'art. 11.
CREATE TYPE "SystemeComptableSyscohada" AS ENUM ('NORMAL', 'MINIMAL_TRESORERIE');

ALTER TABLE "tenants" ADD COLUMN "systemeComptableSyscohada" "SystemeComptableSyscohada";
