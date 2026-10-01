-- La levée de l'option d'un contrat de location-acquisition (AUDCIF Titre
-- VIII ch. 8 § 2.1.9) · nulle tant que le cabinet n'a rien déclaré.
ALTER TABLE "contrats_location_acquisition" ADD COLUMN "optionLevee" BOOLEAN;
ALTER TABLE "contrats_location_acquisition" ADD COLUMN "dateDecisionOption" TIMESTAMP(3);
