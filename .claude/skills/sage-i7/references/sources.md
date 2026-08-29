# Inventaire des sources (dossier "Sage" · Google Drive de l'utilisateur)

19 documents au total. Statut de lecture à la clôture de l'analyse (27/08/2026) :

| # | Fichier | Statut | Profondeur |
|---|---|---|---|
| 1 | 687389247-formation-sage.pdf | ✅ analysé | Intégrale (30 pages) |
| 2 | 667678819-Sage-100-Comptabilite-i7-Guide.pdf | ✅ analysé | Intégrale (44 pages) |
| 3 | 694424296-Sage-Immobilisations-i7-Seances-1-2-3-4-5-Et-6.pdf | ✅ analysé | Intégrale (support diapositives) |
| 4 | 342285752-Formation-SAGE-Comptabilite.pdf | ❌ échec d'extraction | 62 Mo, hors limite technique (`read_file_content` retourne vide au-delà d'un certain seuil ; `download_file_content` refuse tout fichier > 10 Mo) · probable forte redondance avec #5/#6/#8 (même famille "SAARI Comptabilité 100/i7") |
| 5 | 744696676-Sage-Comptabilite-100.pdf | ✅ analysé | Intégrale |
| 6 | 667067001-Sage-comptabilite-i7.pdf | ✅ analysé | Intégrale |
| 7 | 771175338-MANUEL-SAGE-COMPTABILITE-i7-EDM.pdf | 🟡 catalogué (TOC + intro) | Forte redondance présumée avec #2 |
| 8 | 184929657-Support-compta-formation-sage-comptabilite.pdf | ✅ analysé | Intégrale |
| 9 | 782841905-Manuel-de-Prise-en-Main-Rapide.pdf (Édition Pilotée) | ✅ analysé | Intégrale |
| 10 | 864010939-Sage-100-i7-50-Structure-des-fichiers.pdf | 🟡 catalogué (TOC) | Dictionnaire de tables techniques (.MAE/.GCM/.IMO/.MDP/.PAR/.PAI) · utile seulement pour une éventuelle migration de données Sage, pas pour l'architecture cible |
| 11 | 795639306-sommaimp.pdf (= manuel de référence Moyens de Paiement) | 🟡 catalogué (TOC + lecture partielle) | Redondant avec #17, en plus exhaustif |
| 12 | 451053356-Paie-Sage.pdf | 🟡 catalogué (TOC) | Paie · hors périmètre SYCEBNL actuel |
| 13 | 714830626-Livre-de-Gestion-Complete-de-La-Paie-Sur-Sage-i7.pdf | ✅ analysé | Intégrale · Paie |
| 14 | 606261375-SAGE-PAIE.pdf | ✅ analysé | Intégrale · Paie |
| 15 | 190413987-Sage-Paie-Manuel-pedagogique.pdf | 🟡 catalogué (échec extraction complète, sauvegardé) | Paie |
| 16 | 557444686-MANUEL-DE-PROCEDURE-SAGE-PAIE-I7-V8.pdf | ✅ analysé | Intégrale · Paie |
| 17 | 659068070-Sage-Moyens-de-Paiement-Banque.pdf | ✅ analysé | Intégrale |
| 18 | 138224421-les-fonctions-de-sage-100-immobilisation-pdf.pdf | ✅ analysé (lecture ciblée) | Section gestion des composants + CRC 2002/IFRS |
| 19 | 801381659-Sage-X3-Support.pdf | ✅ analysé (lecture ciblée) | ERP low-code générique, hors périmètre i7 ; section RBAC (§4) notée |

**Méthode d'extraction** : accès direct au Google Drive de l'utilisateur (`search_files`,
`get_file_metadata` pour le sommaire/contenu résumé, `read_file_content` pour le texte
intégral). `read_file_content` fonctionne pour des PDF jusqu'à plusieurs dizaines de Mo
mais échoue silencieusement (contenu vide) au-delà d'un certain seuil non documenté ;
`download_file_content` refuse tout fichier de plus de 10 Mo.

**Document non résolu** : #4 (62 Mo). Si un doute précis apparaît sur un point non
couvert par les autres sources SAARI/Comptabilité 100 (#5, #6, #8), redemander ce
fichier en le faisant scinder par l'utilisateur, plutôt que de retenter l'extraction
directe (déjà en échec).
