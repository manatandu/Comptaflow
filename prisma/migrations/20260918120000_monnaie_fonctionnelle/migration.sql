-- LA MONNAIE DE TENUE CESSE D'ÊTRE UN CHOIX.
--
-- CE QUI ÉTAIT CASSÉ. `tenants.devise` ne convertissait rien · elle
-- ÉTIQUETAIT le cartouche de chaque état exporté (« montants en X », voir
-- ExportService.cartouche). Un dossier basculé en USD depuis l'écran des
-- paramètres imprimait donc « montants en USD » sur sa balance, son bilan,
-- son compte de résultat et sa liasse entière, alors qu'aucun montant n'était
-- touché. Une falsification de tous les états publiés, en trois clics, sans
-- un mot d'avertissement.
--
-- CE QUE DIT LE TEXTE, ET IL NE PRÉVOIT PAS D'OPTION.
-- Loi n° 23/053 du 5 décembre 2023, art. 141, 1° : les redevables sont dans
-- l'obligation « de tenir leur comptabilité en français à leur siège ou au
-- siège de leurs établissements situés en République Démocratique du Congo.
-- Cette comptabilité est exprimée en Franc congolais ».
-- AUDCIF, art. 17, 1° : « la tenue de la comptabilité dans la langue
-- officielle et dans l'unité monétaire ayant cours légal dans l'État partie ».
--
-- CE QUE LE TEXTE NE DIT PAS. Rien n'interdit de produire, À CÔTÉ, un jeu de
-- documents dans la monnaie où l'entité vit réellement · beaucoup d'ASBL
-- encaissent et rendent compte à leur bailleur en dollars. Ce second jeu n'a
-- aucune valeur légale et aucun texte ne le régit : c'est une décision
-- d'OmegaX, et le document doit le dire lui-même.
--
-- LA REPRISE NE DÉTRUIT PAS L'INTENTION. Un dossier qui portait « USD »
-- voulait dire quelque chose · on ne l'écrase pas, on le DÉPLACE vers la
-- monnaie fonctionnelle, puis on remet la tenue à sa valeur légale. Le
-- cabinet retrouve donc son choix, à la bonne place, au lieu de le perdre.
ALTER TABLE "tenants" ADD COLUMN "deviseFonctionnelle" TEXT;

UPDATE "tenants"
   SET "deviseFonctionnelle" = "devise"
 WHERE "devise" IS NOT NULL
   AND "devise" <> ''
   AND "devise" <> 'CDF'
   AND "deviseFonctionnelle" IS NULL;

-- `NULL` et la chaîne vide reviennent aussi à 'CDF' · le cartouche lisait
-- `devise ?? 'CDF'`, la colonne dit maintenant ce que le cartouche imprimait.
UPDATE "tenants"
   SET "devise" = 'CDF'
 WHERE "devise" IS DISTINCT FROM 'CDF';
