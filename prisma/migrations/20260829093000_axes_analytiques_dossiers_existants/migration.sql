-- Les deux axes analytiques (Projets, Bailleurs) sont créés à l'inscription
-- depuis l'ajout de la comptabilité analytique. Les dossiers ouverts AVANT
-- n'en ont aucun, et un axe ne se devine pas : sans lui, la colonne de
-- ventilation de la grille de saisie reste invisible et les états analytiques
-- sont vides. On les rattrape ici, une fois, pour tout dossier qui n'a encore
-- aucun plan.
INSERT INTO "plans_analytiques" ("id", "tenantId", "code", "intitule", "classesVentilees", "ventilationObligatoire", "gererBudgets", "ordre", "estActif", "createdAt")
SELECT gen_random_uuid(), t."id", 'PROJ', 'Projets et programmes', '2,6,7,9', false, true, 1, true, NOW()
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "plans_analytiques" p WHERE p."tenantId" = t."id");

INSERT INTO "plans_analytiques" ("id", "tenantId", "code", "intitule", "classesVentilees", "ventilationObligatoire", "gererBudgets", "ordre", "estActif", "createdAt")
SELECT gen_random_uuid(), t."id", 'BAIL', 'Bailleurs et financements', '2,6,7,9', false, false, 2, true, NOW()
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "plans_analytiques" p WHERE p."tenantId" = t."id" AND p."code" = 'BAIL');
