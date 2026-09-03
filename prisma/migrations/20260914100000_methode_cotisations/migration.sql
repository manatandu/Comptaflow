-- FAIT GÉNÉRATEUR DES COTISATIONS ET DU DROIT D'ENTRÉE.
--
-- Cadre conceptuel SYCEBNL § 5.4.2.1 : le fait générateur est l'APPEL,
-- « toutefois, si l'entité ne peut justifier d'un droit d'agir en
-- recouvrement, les cotisations et le droit d'entrée sont comptabilisés lors
-- de leur encaissement effectif ». Le même paragraphe impose de « préciser
-- dans les notes annexes, la méthode retenue ».
--
-- NULLABLE et SANS DÉFAUT : la réponse se lit dans les statuts du dossier.
-- Poser APPEL d'office ferait constater des créances sur des adhérents que
-- l'entité n'a aucun moyen de poursuivre.
CREATE TYPE "MethodeCotisations" AS ENUM ('APPEL', 'ENCAISSEMENT');

ALTER TABLE "tenants" ADD COLUMN "methodeCotisations" "MethodeCotisations";
