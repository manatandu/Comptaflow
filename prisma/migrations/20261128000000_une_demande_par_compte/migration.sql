-- AUDIT FINAL F71 · un compte, une lettre par campagne de circularisation.
-- Deux lettres sur le même solde compteraient deux fois la même confirmation
-- dans le taux de couverture. Le service refuse le doublon en le nommant ;
-- l'index le tient contre deux ajouts simultanés.
CREATE UNIQUE INDEX "demandes_confirmation_campagneId_compteId_key" ON "demandes_confirmation"("campagneId", "compteId");
