-- CHARGES À PAYER ET PRODUITS À RECEVOIR · l'autre moitié du rattachement des
-- charges et des produits à l'exercice. Les trois valeurs existantes traitent
-- ce qui est comptabilisé et déborde (476/477, au prorata) ; ces deux-ci
-- traitent ce qui n'est pas comptabilisé et appartient entièrement à
-- l'exercice (comptes de tiers rattachés, sans prorata, contre-passé à
-- l'ouverture).

ALTER TYPE "TypeRegularisation" ADD VALUE 'CHARGE_A_PAYER';
ALTER TYPE "TypeRegularisation" ADD VALUE 'PRODUIT_A_RECEVOIR';
