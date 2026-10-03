-- LIGNE A7, E2 · la perte sur créance irrécouvrable avec récupération de la
-- TVA (O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127) · la
-- TVA récupérée au 443 choisi, la TVA facturée que portait la créance, et le
-- duplicata surchargé envoyé au client. Nuls sans récupération.
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "tvaRecuperee" DECIMAL(18,2);
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "tvaFactureeCreance" DECIMAL(18,2);
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "compteTvaId" TEXT;
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "duplicataReference" TEXT;
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "duplicataDateEnvoi" DATE;

ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_compteTvaId_fkey" FOREIGN KEY ("compteTvaId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
