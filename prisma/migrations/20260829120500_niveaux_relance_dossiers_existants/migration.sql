-- Les trois niveaux de relance sont créés à l'inscription depuis l'ajout du
-- module. Les dossiers ouverts AVANT n'en ont aucun, et sans niveau la
-- fenêtre de rappel ne peut rien émettre. On les rattrape ici, une fois.
INSERT INTO "niveaux_relance" ("id", "tenantId", "niveau", "libelle", "type", "joursApresEcheance", "modeleTexte", "estActif")
SELECT gen_random_uuid(), t."id", 1, 'Invitation à régler', 'PREVENTIVE', -7,
  E'Cher {tiers},\n\nNous vous rappelons amicalement que votre échéance de {montant} arrive à terme le {date}.\n\n{detail}\n\nNous vous remercions par avance de votre règlement, qui permet à notre entité de poursuivre ses activités.\n\n{entite}',
  true
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "niveaux_relance" n WHERE n."tenantId" = t."id");

INSERT INTO "niveaux_relance" ("id", "tenantId", "niveau", "libelle", "type", "joursApresEcheance", "modeleTexte", "estActif")
SELECT gen_random_uuid(), t."id", 2, 'Premier rappel', 'RAPPEL', 15,
  E'Cher {tiers},\n\nSauf erreur de notre part, la somme de {montant} demeure due à ce jour, {date}.\n\n{detail}\n\nSi votre règlement a été effectué entre-temps, nous vous prions de ne pas tenir compte de ce rappel.\n\n{entite}',
  true
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "niveaux_relance" n WHERE n."tenantId" = t."id" AND n."niveau" = 2);

INSERT INTO "niveaux_relance" ("id", "tenantId", "niveau", "libelle", "type", "joursApresEcheance", "modeleTexte", "estActif")
SELECT gen_random_uuid(), t."id", 3, 'Second rappel', 'RAPPEL', 45,
  E'Cher {tiers},\n\nMalgré notre précédent courrier, la somme de {montant} reste impayée au {date}.\n\n{detail}\n\nNous vous serions reconnaissants de bien vouloir régulariser votre situation, ou de prendre contact avec nous pour convenir d''un échelonnement.\n\n{entite}',
  true
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "niveaux_relance" n WHERE n."tenantId" = t."id" AND n."niveau" = 3);
