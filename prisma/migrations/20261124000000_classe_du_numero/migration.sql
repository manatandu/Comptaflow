-- AUDIT FINAL F40 · la classe d'un compte est le premier chiffre de son numéro.
--
-- La création laissait la classe libre et l'écran partait de la classe 1 · un
-- 6xxx créé sans toucher la liste était rangé en classe 1. Le bilan, qui lit la
-- classe, et le compte de résultat, qui lit le numéro, divergeaient sur une
-- balance qui bouclait. Le serveur déduit désormais la classe du numéro ; les
-- comptes déjà créés à tort sont remis dans la classe de leur numéro. Les deux
-- plans semés la respectent déjà, ils ne sont pas touchés. Un numéro qui ne
-- commence pas par un chiffre de 1 à 9 n'a pas de classe et reste tel quel.
UPDATE "comptes"
SET "classe" = ('CLASSE_' || substr("numero", 1, 1))::"ClasseCompte"
WHERE substr("numero", 1, 1) BETWEEN '1' AND '9'
  AND "classe"::text <> 'CLASSE_' || substr("numero", 1, 1);
