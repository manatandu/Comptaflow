# Immobilisations · modèle Sage Immobilisations i7

Sources principales : document #3 (support de formation complet, 6 séances) et #18
(manuel de référence, section gestion des composants et CRC 2002/IFRS).

Module séparé chez Sage (fichier `.IMO` propre), lié au fichier comptable `.MAE`.

## Structure de configuration

- **Paramètres société** : Identification, Comptes généraux (longueur variable
  3-13 caractères), Tiers (codification manuelle, modes de règlement), Paramètres
  fiscaux (régime : Impôt sur les sociétés...), Immobilisations (options de
  traitement/sortie), Comptabilisation (annuelle ou autre périodicité).
- **Lieux des biens** : référentiel séparé de localisation physique des actifs.
- **Familles d'immobilisations** = gabarit/template dont hérite chaque immobilisation :
  Identification, Amortissement (méthode/durée par défaut), Comptabilité (comptes de
  dotation économique), Comptabilité fiscale (dérogatoire).

## Immobilisation (fiche)

- Identification : type "Bien", rattachement à une famille.
- **Nature d'acquisition** : Acquisition / Production / Échange / Reprise.
- **Nature de bien** (5 catégories) : Immobilisations Incorporelles Amortissables,
  Incorporelles Non Amortissables, Corporelles Amortissables, Corporelles Non
  Amortissables, Financières.
- Amortissement : méthode, durée, **coefficient dégressif par tranche de durée**
  (3-4 ans ×1,5 ; 5-6 ans ×2 ; plus de 6 ans ×3).
- **Valeur résiduelle** déduite par défaut de la base d'amortissement du plan
  économique.
- Base de prorata configurable (360 jours dans l'exemple observé).
- Lieu du bien (localisation physique).

## Gestion des composants (important, absent du support de formation, trouvé dans le
manuel de référence)

- Un bien **"Composé"/"Nomenclature"** peut être décomposé en plusieurs
  **"Composants"**, chacun avec son propre plan d'amortissement (durée, méthode) ·
  recommandé pour les ensembles hétérogènes : un bâtiment décomposé en toiture,
  chauffage, étanchéité, ravalement ; un avion en structure, moteurs, sièges.
- Un "Composé" intègre au moins un bien de type Composant associé à une immobilisation
  de type Bien.
- **Renouvellement d'un composant** = sortie partielle (avec calcul de dotation
  exceptionnelle) + nouvelle entrée sur le même bien composé.

## Amortissement dérogatoire (fiscal vs comptable)

- Quand l'amortissement fiscal (dégressif) est supérieur à l'amortissement comptable
  (linéaire), l'excédent doit être porté en "provisions réglementées" · c'est
  l'amortissement dérogatoire.
- Quand l'amortissement fiscal est inférieur au comptable, ce dernier reste en
  écritures et la différence fait l'objet d'une réintégration fiscale extra-comptable.
- **Plan d'amortissement "natif"** : un plan de référence distinct des plans
  National/IFRS, non affecté par les cessions partielles (sauf fractionnement/fusion),
  utilisé comme **plafond de contrôle** pour la reprise des amortissements
  dérogatoires · empêche la survalorisation fiscale.
- Probablement hors scope SYCEBNL immédiat (associations à but non lucratif) ; plus
  pertinent pour un futur volet SYSCOHADA entreprises.

## Sortie d'immobilisation

- **Nature de sortie** : Cession / Mise hors service (cocher "calculer la dotation aux
  amortissements exceptionnels") / Renouvellement de composant (cocher les deux cases
  "calculer la dotation aux amort. exceptionnels" ET "renouveler le composant").

## Gestion IFRS native (CRC 2002 / normes internationales)

- Traitements comptables distincts pour les plans nationaux et IFRS.
- Annulation des traitements par type de plan (National, IFRS, les deux).
- Mise à jour comptable : distinction des journaux nationaux et IFRS, génération des
  ventilations d'un plan IFRS définies sur la fiche immobilisation, génération des
  écritures spécifiques IFRS, marquage du type de norme sur les écritures.
- Édition des états à la norme Nationale ou IFRS séparément.
- **Enseignement clé pour Compta Flow** : une gestion IFRS sérieuse se conçoit
  **nativement multi-plans dès la conception du module**, pas comme une couche de
  conversion ajoutée après coup. Directement lié à l'item "passage OHADA→IFRS" de la
  vision long terme.

## Modèle de données minimal proposé pour Compta Flow

```
FamilleImmobilisation (gabarit)
  → Immobilisation (instance, hérite de la famille)
      → plan d'amortissement calculé (natif, + national, + IFRS si activé)
      → écritures de dotation générées périodiquement
      → gestion de sortie (Cession / Mise hors service / Renouvellement de composant)
      → Composants (0..n, chacun avec son propre plan d'amortissement)
```
