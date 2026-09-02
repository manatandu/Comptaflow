-- LIQUIDATION DE TVA · le marqueur qui interdit de liquider deux fois la même
-- période.
--
-- Le bouton « Comptabiliser » posait une écriture de solde des comptes 443 et
-- 445 sans laisser aucune trace de la période traitée. Le presser deux fois
-- posait DEUX écritures identiques : la première solde les comptes de taxe, la
-- seconde les rend débiteurs ou créditeurs du même montant en sens inverse, et
-- le compte 444 porte le double de la dette réelle. Rien ne le signalait · ni à
-- l'écran, ni au contrôle, ni dans la déclaration suivante, dont les comptes de
-- taxe repartent alors d'un solde faux. Le code lui-même le disait : « Aucun
-- verrou anti-double-liquidation pour l'instant ».
--
-- Le marqueur porte les DEUX bornes de la période, pas seulement son libellé :
-- c'est le CHEVAUCHEMENT qu'il faut interdire, pas la répétition à l'identique.
-- Liquider janvier, puis liquider le premier trimestre, est le même double
-- comptage qu'une double liquidation de janvier. L'index porte donc sur le
-- couple de bornes, et le contrôle de recouvrement se fait dans le service ·
-- aucune contrainte SQL ne sait exprimer « pas de chevauchement » sans une
-- extension d'intervalles.
--
-- La suppression est possible et emporte l'écriture (ON DELETE CASCADE depuis
-- l'écriture) · un verrou sans marche arrière transforme une erreur de date en
-- impasse.

CREATE TABLE "liquidations_tva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "net" DECIMAL(18,2) NOT NULL,
    "prorataApplique" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "liquidations_tva_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "liquidations_tva_ecritureId_key" ON "liquidations_tva"("ecritureId");

CREATE INDEX "liquidations_tva_tenantId_dateDebut_dateFin_idx"
    ON "liquidations_tva"("tenantId", "dateDebut", "dateFin");

ALTER TABLE "liquidations_tva"
    ADD CONSTRAINT "liquidations_tva_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "liquidations_tva"
    ADD CONSTRAINT "liquidations_tva_ecritureId_fkey"
    FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
