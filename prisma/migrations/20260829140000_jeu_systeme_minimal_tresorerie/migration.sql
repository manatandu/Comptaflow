-- Troisième jeu d'états financiers SYCEBNL : le Système Minimal de Trésorerie
-- (Acte uniforme, art. 5 et 6 ; Partie 4, ch. 4). Les deux premiers jeux
-- (associations/ordres professionnels, projets de développement) existaient
-- déjà ; celui-ci était annoncé dans l'assistant de création mais désactivé,
-- faute d'états construits. Il l'est désormais.
--
-- Ajout de valeur seulement : aucun dossier existant n'est touché, le défaut
-- (ASSOCIATIONS_ORDRES_PROFESSIONNELS) reste celui de la colonne.
ALTER TYPE "JeuEtatsFinanciersSycebnl" ADD VALUE IF NOT EXISTS 'SYSTEME_MINIMAL_TRESORERIE';
