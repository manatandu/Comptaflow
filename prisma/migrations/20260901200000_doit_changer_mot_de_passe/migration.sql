-- Mot de passe à changer à la prochaine connexion · posé sur tout compte
-- dont le mot de passe a transité par un tiers (console plateforme, siège
-- d'un groupe, admin du dossier), effacé par /auth/changer-mot-de-passe.
ALTER TABLE "users" ADD COLUMN "doitChangerMotDePasse" BOOLEAN NOT NULL DEFAULT false;
