-- MANUEL DES PROCÉDURES ET DE L'ORGANISATION COMPTABLES · AUDCIF art. 16 al. 1.
--
-- « Pour maintenir la continuité dans le temps de l'accès à l'information,
-- TOUTE ENTITÉ ÉTABLIT UN MANUEL décrivant les procédures et l'organisation
-- comptables. Ce manuel, MIS À JOUR PÉRIODIQUEMENT, est destiné à garantir le
-- caractère définitif de l'enregistrement des mouvements. Il est CONSERVÉ
-- AUSSI LONGTEMPS qu'est exigée la présentation des états financiers
-- successifs auxquels il se rapporte. »
--
-- L'art. 17, 3° en fait la référence du classement des pièces : elles sont
-- « conservées, classées dans un ordre défini dans le manuel décrivant les
-- procédures et l'organisation comptables ». Sans manuel, cet ordre n'existe
-- nulle part, et la justification des écritures perd son point d'appui.
--
-- COLLISION DE NUMÉROS, à ne pas confondre · l'article 16 visé ici est celui de
-- l'AUDCIF. Le SYCEBNL a aussi un article 16, qui porte sur les règles de
-- présentation des états financiers, et dont le 2) exige de son côté « la mise
-- en place de PROCÉDURES nécessaires à une organisation comptable permettant un
-- contrôle interne fiable et le contrôle externe ». L'article 16 de l'AUDCIF
-- n'est PAS dans la liste d'exclusion de l'art. 3 du SYCEBNL : il s'applique
-- aux deux, mais chacun par son chemin.
--
-- PAS DE RATTACHEMENT À UN EXERCICE, contrairement au livre d'inventaire et au
-- rapport d'activité. Le manuel vit avec l'entité et se met à jour quand
-- l'organisation change, pas à chaque clôture. D'où une VERSION par mise à
-- jour, jamais un écrasement : le manuel en vigueur au moment d'un exercice
-- donné doit rester lisible aussi longtemps que cet exercice est opposable.
--
-- SECTIONS LIBRES, en JSON. Le CPCC est formel (« Notes de cours d'organisation
-- comptable », § 0.1.4) : « la législation OHADA ne définit ni la forme ni le
-- contenu du manuel ». Un gabarit rigide en colonnes ajouterait une exigence
-- que ni l'AUDCIF ni le SYCEBNL n'écrivent.
CREATE TABLE "manuels_procedures" (
  "id"              TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  "version"         INTEGER NOT NULL,
  "dateApplication" TIMESTAMP(3) NOT NULL,
  "sections"        JSONB NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"       TEXT NOT NULL,

  CONSTRAINT "manuels_procedures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "manuels_procedures_tenantId_version_key"
  ON "manuels_procedures"("tenantId", "version");
CREATE INDEX "manuels_procedures_tenantId_idx" ON "manuels_procedures"("tenantId");

ALTER TABLE "manuels_procedures"
  ADD CONSTRAINT "manuels_procedures_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
