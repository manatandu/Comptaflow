-- Retire tous les tirets cadratins (—) des textes visibles déjà en base :
-- « A — B » devient « A · B », les cadratins résiduels deviennent « · ».
-- Les instantanés FIGÉS (livre d'inventaire, rapport d'activité — colonnes
-- Json) ne sont volontairement PAS réécrits : un document de clôture arrêté
-- ne se retouche pas.

UPDATE comptes SET intitule = replace(replace(intitule, ' — ', ' · '), '—', '·') WHERE intitule LIKE '%—%';
UPDATE journaux SET intitule = replace(replace(intitule, ' — ', ' · '), '—', '·') WHERE intitule LIKE '%—%';
UPDATE ecritures SET libelle = replace(replace(libelle, ' — ', ' · '), '—', '·') WHERE libelle LIKE '%—%';
UPDATE ecritures SET reference = replace(replace(reference, ' — ', ' · '), '—', '·') WHERE reference LIKE '%—%';
UPDATE ecritures SET "motifCorrection" = replace(replace("motifCorrection", ' — ', ' · '), '—', '·') WHERE "motifCorrection" LIKE '%—%';
UPDATE lignes_ecriture SET libelle = replace(replace(libelle, ' — ', ' · '), '—', '·') WHERE libelle LIKE '%—%';
UPDATE taux_tva SET intitule = replace(replace(intitule, ' — ', ' · '), '—', '·') WHERE intitule LIKE '%—%';
UPDATE tiers SET nom = replace(replace(nom, ' — ', ' · '), '—', '·') WHERE nom LIKE '%—%';
UPDATE modeles_reglement SET intitule = replace(replace(intitule, ' — ', ' · '), '—', '·') WHERE intitule LIKE '%—%';
UPDATE bailleurs SET nom = replace(replace(nom, ' — ', ' · '), '—', '·') WHERE nom LIKE '%—%';
UPDATE familles_immobilisation SET intitule = replace(replace(intitule, ' — ', ' · '), '—', '·') WHERE intitule LIKE '%—%';
UPDATE immobilisations SET designation = replace(replace(designation, ' — ', ' · '), '—', '·') WHERE designation LIKE '%—%';
