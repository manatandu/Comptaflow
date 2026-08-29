-- SYCEBNL, compte 41 « Adhérents, clients-usagers et comptes rattachés » :
-- le texte officiel subdivise 411 Adhérents et 412 Clients-usagers. Le plan
-- des tiers doit donc distinguer les deux populations, là où le plan français
-- de Sage ne connaît que le « Client ».
ALTER TYPE "TypeTiers" ADD VALUE IF NOT EXISTS 'ADHERENT' BEFORE 'CLIENT';
