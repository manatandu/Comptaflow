-- AUDCIF art. 22, 4° · date de valeur d'une opération reportée au premier jour
-- de la période non encore clôturée. Null partout ailleurs.
ALTER TABLE "ecritures" ADD COLUMN "dateValeur" TIMESTAMP(3);
