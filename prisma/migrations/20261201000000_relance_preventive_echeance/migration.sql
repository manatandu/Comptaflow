-- Audit final F166 · la relance préventive annonçait « arrive à terme le {date} »,
-- c'est-à-dire le jour du courrier. Les modèles livrés par défaut portent
-- désormais {echeance}. Seuls les modèles restés EXACTEMENT ceux livrés sont
-- réécrits · un texte que le cabinet a retouché lui appartient, et le jeton
-- {date} y garde le sens qu'il lui donne.

UPDATE "niveaux_relance" SET "modeleTexte" = E'Cher {tiers},\n\nNous vous rappelons amicalement que votre échéance de {montant} arrive à terme le {echeance}.\n\n{detail}\n\nNous vous remercions par avance de votre règlement, qui permet à notre entité de poursuivre ses activités.\n\n{entite}'
WHERE "type" = 'PREVENTIVE' AND "modeleTexte" = E'Cher {tiers},\n\nNous vous rappelons amicalement que votre échéance de {montant} arrive à terme le {date}.\n\n{detail}\n\nNous vous remercions par avance de votre règlement, qui permet à notre entité de poursuivre ses activités.\n\n{entite}';

UPDATE "niveaux_relance" SET "modeleTexte" = E'Madame, Monsieur,\n\nNous vous informons que la somme de {montant} viendra à échéance le {echeance}.\n\n{detail}\n\nNous vous remercions de bien vouloir procéder au règlement à cette date.\n\n{entite}'
WHERE "type" = 'PREVENTIVE' AND "modeleTexte" = E'Madame, Monsieur,\n\nNous vous informons que la somme de {montant} viendra à échéance le {date}.\n\n{detail}\n\nNous vous remercions de bien vouloir procéder au règlement à cette date.\n\n{entite}';
