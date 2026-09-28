-- Verrouillage par compte · le délai d'oubli. Le compteur d'échecs ne se
-- remet plus à zéro à l'échéance du verrou · il s'oublie douze heures après
-- le DERNIER échec (src/modules/auth/verrouillage.ts). Nulle pour les comptes
-- existants · l'ancienneté d'un compteur écrit avant cette migration est
-- inconnue, et le prochain échec le fait repartir de zéro plutôt que de
-- l'hériter.
ALTER TABLE "users" ADD COLUMN "dernierEchecLe" TIMESTAMP(3);
