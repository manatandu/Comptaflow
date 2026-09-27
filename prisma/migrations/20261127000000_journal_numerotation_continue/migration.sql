-- AUDIT FINAL F59 · un journal créé sans choix de numérotation naît en
-- continue par journal. En MANUELLE, OmegaX n'attribue aucun numéro et la
-- saisie n'en porte aucun · les pièces restaient sans numéro (AUDCIF art. 17,
-- 3°). Seul le défaut change · les journaux existants gardent leur mode, qui
-- est le choix du cabinet.
ALTER TABLE "journaux" ALTER COLUMN "numerotation" SET DEFAULT 'CONTINUE_JOURNAL';
