-- Comptes principaux à deux chiffres · rattrapage des dossiers EXISTANTS.
--
-- Les 76 en-têtes de division du plan SYCEBNL (Partie 2, ch. 2, section 3 :
-- « les comptes principaux à deux (02) chiffres ») ont été ajoutés au semis le
-- 29 août 2026. Or le semis ne s'exécute qu'à la CRÉATION du dossier : tout
-- dossier ouvert avant cette date ne les a jamais reçus, et son plan comptable
-- n'en montre aucun. Le verrouillage et la mise en gras de ces lignes,
-- développés le même jour, n'avaient donc rien à afficher.
--
-- Le numéro reste à DEUX chiffres, non complété à huit comme les autres, pour
-- les deux raisons documentées dans compte-seed.ts : « 90 » complété donnerait
-- « 90000000 », déjà pris par le compte 900 ; et l'agrégation des comptes
-- Total se fait par startsWith, que le numéro complété romprait.
--
-- ON CONFLICT DO NOTHING : la migration est rejouable, et un dossier créé
-- après le changement de semis (qui les a donc déjà) n'est pas touché.
INSERT INTO "comptes" ("id", "tenantId", "numero", "intitule", "classe", "typeCompte", "estActif", "modeReportANouveau", "lettrable")
SELECT
  gen_random_uuid(),
  t."id",
  p."numero",
  p."intitule",
  p."classe",
  'TOTAL'::"TypeCompteDetailTotal",
  true,
  p."mode",
  -- Un compte Total ne reçoit jamais d'écriture, donc jamais de lettrage.
  false
FROM "tenants" t
CROSS JOIN (VALUES
    ('10', 'Dotation', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('11', 'Réserves', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('12', 'Report à nouveau', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('13', 'Résultat net de l''exercice', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('14', 'Subventions d''investissement', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('15', 'Provisions réglementées et fonds assimilés', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('16', 'Fonds affectés', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('17', 'Fonds reportés', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('18', 'Emprunts et dettes assimilées', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('19', 'Provisions pour risques et charges', 'CLASSE_1'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('20', 'Immobilisations destinées à la vente (dons/legs non reçus) et usufruit temporaire', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('21', 'Immobilisations incorporelles', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('22', 'Terrains', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('23', 'Bâtiments, installations techniques et agencements', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('24', 'Matériel, mobilier et actifs biologiques', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('25', 'Avances et acomptes versés sur immobilisations', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('26', 'Titres de participation', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('27', 'Autres immobilisations financières', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('28', 'Amortissements', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('29', 'Dépréciations des immobilisations', 'CLASSE_2'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('31', 'Biens liés à l''activité', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('32', 'Marchandises, matières premières et fournitures liées', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('33', 'Autres approvisionnements', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('34', 'Dons en nature', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('35', 'Produits et services en cours', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('36', 'Produits finis, produits intermédiaires et résiduels', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('37', 'Stocks en cours de route, en consignation ou en dépôt', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('38', 'Dons en nature H.A.O.', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('39', 'Dépréciations des stocks et des productions en cours', 'CLASSE_3'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('40', 'Fournisseurs et comptes rattachés', 'CLASSE_4'::"ClasseCompte", 'DETAIL'::"ModeReportANouveau"),
    ('41', 'Adhérents, clients-usagers et comptes rattachés', 'CLASSE_4'::"ClasseCompte", 'DETAIL'::"ModeReportANouveau"),
    ('42', 'Personnel', 'CLASSE_4'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('43', 'Organismes sociaux', 'CLASSE_4'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('44', 'État et collectivités publiques', 'CLASSE_4'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('45', 'Fondateurs, apporteurs et comptes courants', 'CLASSE_4'::"ClasseCompte", 'DETAIL'::"ModeReportANouveau"),
    ('46', 'Bailleurs, État et autres organismes, fonds d''administration', 'CLASSE_4'::"ClasseCompte", 'DETAIL'::"ModeReportANouveau"),
    ('47', 'Débiteurs et créditeurs divers', 'CLASSE_4'::"ClasseCompte", 'DETAIL'::"ModeReportANouveau"),
    ('48', 'Créances et dettes H.A.O.', 'CLASSE_4'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('49', 'Dépréciations et provisions pour risques à court terme (tiers)', 'CLASSE_4'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('50', 'Titres de placement', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('51', 'Valeurs à encaisser', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('52', 'Banques', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('53', 'Établissements financiers et assimilés', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('55', 'Instruments de monnaie électronique', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('56', 'Banques, crédits de trésorerie et d''escompte', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('57', 'Caisse', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('58', 'Virements internes', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('59', 'Dépréciations et provisions pour risques à court terme', 'CLASSE_5'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('60', 'Achats et variations de stocks', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('61', 'Transports', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('62', 'Services extérieurs', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('63', 'Autres services extérieurs', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('64', 'Impôts et taxes', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('65', 'Autres charges', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('66', 'Charges de personnel', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('67', 'Frais financiers et charges assimilées', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('68', 'Dotations aux amortissements', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('69', 'Dotations aux provisions et aux dépréciations', 'CLASSE_6'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('70', 'Revenus', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('71', 'Subventions d''exploitation', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('72', 'Production immobilisée', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('73', 'Variations des stocks de biens produits', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('75', 'Autres produits', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('77', 'Revenus financiers et produits assimilés', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('78', 'Transferts de charges', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('79', 'Reprises de provisions, de dépréciations et autres', 'CLASSE_7'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('81', 'Valeurs comptables des cessions d''immobilisations', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('82', 'Produits des cessions d''immobilisations', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('83', 'Charges hors activités ordinaires', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('84', 'Revenus hors activités ordinaires', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('85', 'Dotations hors activités ordinaires', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('86', 'Reprises d''amortissements, provisions et dépréciations H.A.O.', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('87', 'Variations de stocks de dons en nature H.A.O.', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('88', 'Subventions d''équilibre', 'CLASSE_8'::"ClasseCompte", 'AUCUN'::"ModeReportANouveau"),
    ('90', 'Emplois des contributions volontaires en nature', 'CLASSE_9'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau"),
    ('91', 'Contributions volontaires en nature', 'CLASSE_9'::"ClasseCompte", 'SOLDE'::"ModeReportANouveau")
) AS p("numero", "intitule", "classe", "mode")
ON CONFLICT ("tenantId", "numero") DO NOTHING;
