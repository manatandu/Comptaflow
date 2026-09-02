-- Jeu de notes annexes d'un rattachement · généralisation au SYSCOHADA.
--
-- Jusqu'ici « rattachements_notes »."jeu" portait le type
-- "JeuEtatsFinanciersSycebnl", ce qui interdisait matériellement d'y loger
-- les 36 notes annexes du SYSCOHADA (AUDCIF Titre IX ch. 6). Or le besoin y
-- est identique : l'AUDCIF ne fournit de tableau de correspondance
-- poste/comptes que pour le bilan et le compte de résultat (Titre IX ch. 7),
-- ses notes n'énumérant que des libellés de rubriques, dont plusieurs
-- réclament une finesse que le plan de comptes normalisé n'a pas.
--
-- Le nouveau type est DISTINCT de "JeuEtatsFinanciersSycebnl", qui reste en
-- place pour « tenants »."jeuEtatsFinanciersSycebnl" et les transcriptions
-- d'inventaire : les deux listes ne coïncident pas.
--
--  · SYSTEME_MINIMAL_TRESORERIE n'est pas repris · ni le SMT SYCEBNL
--    (5 notes) ni le SMT SYSCOHADA (notes 1 à 4, AUDCIF Titre X) ne sont
--    transcrits dans le moteur déclaratif de notes, donc aucune ligne de
--    cette table ne peut porter cette valeur : NoteAnnexeService.rattacher
--    refuse depuis toujours un jeu absent de NOTES_PAR_JEU. Si une telle
--    ligne existait malgré tout, le CAST ci-dessous ÉCHOUERAIT bruyamment,
--    et c'est voulu · mieux vaut une migration qui s'arrête qu'un
--    rattachement effacé en silence.
--  · SYSCOHADA_SYSTEME_NORMAL est ajouté pour les 36 notes du Système
--    normal SYSCOHADA.
--
-- Le cloisonnement jeu/référentiel du dossier ne s'exprime pas en SQL (il
-- dépend de « tenants »."referentiel") : il est vérifié par
-- NoteAnnexeService.rattacher et .detacher, qui refusent explicitement un
-- jeu étranger au référentiel du dossier.

CREATE TYPE "JeuNotesAnnexes" AS ENUM ('ASSOCIATIONS_ORDRES_PROFESSIONNELS', 'PROJETS_DEVELOPPEMENT', 'SYSCOHADA_SYSTEME_NORMAL');

-- Le passage par ::text est obligatoire : PostgreSQL ne convertit pas
-- directement un enum vers un autre. Les index (dont l'unique
-- « rattachements_notes_tenantId_jeu_codeNote_cleRubrique_compt_key ») sont
-- reconstruits par PostgreSQL au changement de type · ils ne sont donc ni
-- supprimés ni recréés ici, et l'unicité reste posée sans interruption.
ALTER TABLE "rattachements_notes"
  ALTER COLUMN "jeu" TYPE "JeuNotesAnnexes" USING ("jeu"::text::"JeuNotesAnnexes");
