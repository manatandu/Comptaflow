-- Une pièce jointe en texte sur un courriel de la file (licence sur site).
ALTER TABLE "messages" ADD COLUMN "pieceJointeNom" TEXT;
ALTER TABLE "messages" ADD COLUMN "pieceJointeTexte" TEXT;
