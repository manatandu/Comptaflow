-- AUDIT FINAL F43 · l'adresse de connexion est normalisée (espaces retirés,
-- minuscules). L'unicité de "users"."email" est sensible à la casse, et la
-- promotion d'un opérateur ne l'était pas : un compte « ADMIN@… » créé dans
-- n'importe quel dossier recevait la console au déploiement suivant. Les
-- portes normalisent désormais toutes l'adresse ; cette migration aligne
-- l'existant et interdit ce qui passerait à côté.

-- 1 · Les adresses existantes sont normalisées, SAUF quand deux comptes ne
-- diffèrent que par la casse · les fondre choisirait un titulaire à la place
-- de l'opérateur. Ces comptes-là gardent leur adresse telle quelle, et la
-- contrainte ci-dessous, posée NOT VALID, ne les rejette pas.
UPDATE "users" AS u
SET "email" = lower(btrim(u."email"))
WHERE u."email" <> lower(btrim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "users" AS v
    WHERE v."id" <> u."id" AND lower(btrim(v."email")) = lower(btrim(u."email"))
  );

-- 2 · Toute adresse écrite ensuite est normalisée · avec l'unicité existante,
-- deux comptes ne peuvent plus différer par la seule casse.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalise" CHECK ("email" = lower(btrim("email"))) NOT VALID;
