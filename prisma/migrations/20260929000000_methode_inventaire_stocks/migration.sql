-- LE MODE DE TENUE DES STOCKS, que les deux textes laissent à l'entité.
--
-- AUDCIF Titre VII ch. 3 section 3 et SYCEBNL Partie 2 ch. 3 section 3, dans
-- les mêmes mots : « La comptabilisation des stocks repose sur la tenue SOIT
-- d'un inventaire PERMANENT, SOIT d'un inventaire INTERMITTENT. »
--
-- NULLABLE ET SANS DÉFAUT, à dessein. Présumer l'INTERMITTENT ferait proposer
-- une écriture de variation à un dossier qui tient le permanent, où chaque
-- entrée et chaque sortie sont DÉJÀ passées par le compte de variation : la
-- variation serait comptée deux fois, et l'écriture s'équilibrerait. Présumer
-- le PERMANENT priverait de la proposition le dossier qui en a le plus besoin.
-- Les dossiers existants restent donc à NULL, ce qui est l'état vrai : la
-- question ne leur a jamais été posée.

-- CreateEnum
CREATE TYPE "MethodeInventaireStocks" AS ENUM ('PERMANENT', 'INTERMITTENT');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "methodeInventaireStocks" "MethodeInventaireStocks";
