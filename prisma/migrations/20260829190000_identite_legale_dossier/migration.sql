-- IDENTITÉ LÉGALE DU DOSSIER
--
-- Le CPCC (SHEKOMBO SHUNGU John, « Notes de cours d'organisation comptable »,
-- novembre 2020, § 7.4 règle 7-a) exige que figurent en tête de CHAQUE page
-- d'un état financier déposé : « Dénomination sociale de l'entreprise ;
-- N° d'identification fiscale ; Exercice clos le ; Durée (en mois) ».
--
-- OmegaX imprimait la dénomination et la période, jamais le numéro d'impôt :
-- le dossier ne le connaissait pas. Les trois identifiants ajoutés ici sont
-- ceux d'une entité congolaise (numéro impôt de la DGI, identification
-- nationale, RCCM), tous trois exigés au dossier d'enregistrement d'une ASBL
-- par la note circulaire n° 003/CAB/MIN/PL.SMRM/COFAF/2013.
--
-- Nullables : une association crée son dossier avant d'avoir ses numéros, et
-- l'en-tête d'impression omet alors la mention au lieu de bloquer.
-- Voir docs/organisation-comptable-cpcc.md § 2.1.
ALTER TABLE "tenants" ADD COLUMN "numeroImpot" TEXT;
ALTER TABLE "tenants" ADD COLUMN "idNat" TEXT;
ALTER TABLE "tenants" ADD COLUMN "rccm" TEXT;
