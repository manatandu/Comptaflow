# Sage Paie/RH et Sage X3 — hors périmètre SYCEBNL actuel, analysés pour la vision

Sources principales : documents #13, #14, #16 (Paie, lecture intégrale) et #19
(Sage X3, lecture ciblée). Hors périmètre immédiat — analysés en profondeur à la
demande explicite de l'utilisateur, pour nourrir la vision, pas pour être construits
maintenant.

## Sage Paie/RH — patterns transposables

- **Fiche salarié** = master record complet : état civil, coordonnées bancaires,
  contrat (type CDI/CDD, ancienneté calculée automatiquement à partir de la date
  d'embauche), poste (département/service/unité/catégorie), congés, compétences/
  diplômes.
- **Moteur de constantes** (le point le plus réutilisable, au-delà du strict métier
  paie) : système de variables calculées avec 4 modes de définition :
  - *Prédéfini* : constante fournie nativement par le logiciel.
  - *Test* : condition simple (si/alors).
  - *Tranche* : barème progressif (ex. impôt calculé par palier de revenu — la
    Contribution Nationale et l'Impôt Général sur le Revenu ivoiriens sont entièrement
    paramétrés comme des cascades de tranches, jamais codés en dur).
  - *Calcul libre* : formule référençant d'autres constantes.
  - C'est un vrai **moteur de règles/formules**, dans le même esprit que ce qu'il
    faudra pour le futur moteur de mapping et pour toute logique de calcul
    paramétrable (taxes, barèmes, primes) — un moteur générique serait mutualisable
    entre TVA, immobilisations fiscales et paie plutôt que réinventé trois fois.
- **Rubriques de bulletin** : Type (Brut/Cotisation/Non-soumise) + formule de calcul
  (montant fixe / nombre×base×taux / calcul par constante) + **associations** vers des
  totaux multiples (Brut, cotisations salariales/patronales, avantage en nature, brut
  imposable, net à payer, soumis social, base horaire, coût total salarial/patronal) —
  un système de propagation vers plusieurs totaux, plus riche qu'un simple
  débit/crédit.
- **Bulletins modèles** : gabarits de rubriques pré-activées par catégorie de salarié
  (cadre/employé) — même *pattern* de "modèle" que les modèles de saisie comptable et
  les familles d'immobilisations.
- **Flux événement → calcul → clôture**, répété pour absences/heures supplémentaires/
  prêts/avances : toujours en 2-3 étapes (saisie de l'événement → calcul qui alimente
  une constante → enregistrement/validation qui verrouille). Pattern transposable à
  d'autres processus différés (ex. les écritures de régularisation comptable).
- **Clôture mensuelle irréversible** (bloque toute modification de bulletin) suivie de
  la **passation comptable** : génère un fichier plat (.PNM/.txt) représentant le
  "journal des écritures de paie", à importer manuellement dans le logiciel de
  comptabilité. **Chez Compta Flow, ce pont devrait être une vraie intégration
  interne au moteur d'écritures existant (`Ecriture`/`LigneEcriture`)**, pas un
  export de fichier à réimporter à la main.
- **États GA** (rapports utilisateur) : générateur simple à 3 types (Formulaire/
  Document/Liste) avec sélecteur de champs + "Sélections" réutilisables (critères de
  filtre nommés et sauvegardés) — encore une occurrence du même pattern de
  bibliothèque de rapports personnalisables que les "États libres" et le "Guide
  Interactif".
- **Fiscalité paramétrée par pays, jamais en dur** : les barèmes IGR/Contribution
  Nationale/quotient familial observés sont spécifiques à la Côte d'Ivoire. Point
  d'architecture capital pour une future brique Paie multi-pays OHADA : chaque taxe/
  cotisation sociale doit être un barème configurable, car chaque État membre a son
  propre code du travail et sa propre fiscalité sur salaires.

## Sage X3 — ERP low-code générique (non retenu comme référence structurelle)

Sage X3 est un framework low-code générique (tables/écrans/objets/formules propres,
éditeur de requêtes graphique et "formulé"), fondamentalement différent de
l'architecture "logiciel métier" de la gamme i7 — non retenu comme modèle
d'architecture pour Compta Flow dans son ensemble.

Un seul élément mérite d'être conservé, pertinent pour la brique "Utilisateurs et
rôles" déjà construite chez Compta Flow : le modèle RBAC de X3 est nettement plus fin
que le nôtre (3 rôles fixes), organisé en 4 couches :

```
Fiche utilisateur
  → Profils fonctions (quelles fonctions/menus accessibles)
      → Habilitation fonctionnelle + Codes d'accès (contrôles fins par écran/champ)
          → Profils menus (navigation)
              → Rôles (filtrage des DONNÉES, pas seulement des actions)
```

Utile comme référence si Compta Flow doit un jour enrichir son RBAC au-delà de 3 rôles
globaux (ex. restreindre l'accès à certains comptes ou certaines données, pas
seulement à des actions) — explicitement hors de portée immédiate.
