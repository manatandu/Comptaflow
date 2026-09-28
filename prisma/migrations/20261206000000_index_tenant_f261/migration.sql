-- Audit final F261 · six tables multi-dossiers n'avaient aucun index qui
-- commence par "tenantId". La garde de cloisonnement borne chaque lecture par
-- le dossier, et chacune de ces lectures balayait donc la table entière, tous
-- cabinets confondus. Les colonnes suivent les requêtes réelles du serveur ·
-- le dossier d'abord, puis le filtre qui l'accompagne le plus souvent.
-- Aucune de ces tables ne portait d'unique commençant par "tenantId" qui
-- aurait déjà servi d'index.

-- Utilisateurs d'un dossier, décompte des administrateurs actifs (F157).
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- Gel de clôture, relu à chaque saisie, lettrage et ventilation.
CREATE INDEX "clotures_tenantId_exerciceId_idx" ON "clotures"("tenantId", "exerciceId");

-- Rapprochement en cours ou dernier clos d'un compte de trésorerie.
CREATE INDEX "rapprochements_bancaires_tenantId_compteId_idx" ON "rapprochements_bancaires"("tenantId", "compteId");

-- Lignes d'OD analytique par dossier et par section · les index de "odId" et
-- de "sectionId" existent déjà, sans le dossier.
CREATE INDEX "lignes_od_analytique_tenantId_sectionId_idx" ON "lignes_od_analytique"("tenantId", "sectionId");

-- Biens du dossier, le plus souvent EN_SERVICE.
CREATE INDEX "immobilisations_tenantId_statut_idx" ON "immobilisations"("tenantId", "statut");

-- Lignes de retraitement IFRS bornées par le dossier (restitution) · l'index
-- de "retraitementId" existe déjà, sans le dossier.
CREATE INDEX "lignes_retraitement_ifrs_tenantId_idx" ON "lignes_retraitement_ifrs"("tenantId");
