-- Cycle de vie des accès · révocation de session et verrouillage par compte.
-- Écrite à la main comme toutes les migrations de ce dépôt.

-- Toute session émise avant cet instant cesse d'être valable. NULL = aucune
-- révocation, l'état de tous les comptes existants.
ALTER TABLE "users" ADD COLUMN "sessionsInvalidesAvant" TIMESTAMP(3);

-- Verrouillage par compte · le limiteur global est par adresse IP et ne voit
-- pas une attaque distribuée contre un seul compte.
ALTER TABLE "users" ADD COLUMN "tentativesEchouees" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "verrouilleJusqua" TIMESTAMP(3);
