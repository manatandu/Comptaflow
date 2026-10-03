# Ligne A5 bis · la contre-passation ne touche pas les disponibilités

Branche de sauvegarde · `travail/a5bis`. Part de `main` (8e15ce7).

## Défaut

`DevisesService.extourner` contre-passait à l'ouverture de l'exercice suivant
TOUTES les lignes de l'écriture des écarts, y compris celles des
disponibilités en devise (52, 53, 55, 57, 58) et de leur contrepartie
676 / 776.

## Lu (règle n° 1)

- AUDCIF art. 54 · créances et dettes, écarts au 478 / 479, latents.
- AUDCIF art. 57 · disponibilités, « les écarts constatés sont inscrits
  directement dans les produits et charges de l'exercice comme gains ou
  pertes de change ».
- Titre VIII ch. 22 § 2.2 · disponibilités exclues de la position globale,
  « les écarts de change étant comptabilisés immédiatement en résultat » ;
  section 4 · « inscrit directement dans les produits et charges financiers
  de l'exercice clos ».
- Fiche du compte 676 (AUDCIF Titre VII et SYCEBNL Partie 2 ch. 3) · écarts
  négatifs sur disponibilités = « pertes de change supportées », 676 « ne
  doit pas être confondu avec le compte 478 ».
- Fiche des comptes 478 / 479 (AUDCIF et SYCEBNL) · « pertes et gains
  latents », « entre créances et dettes en devises ».
- Guide SYSCOHADA, Partie 2 ch. 22 · Application 85 (contre-passation au
  01/01/N+1 : 411 · 4781, 4791 · 411), Application 86 (disponibilités · 676
  / 5215, « sans écart de conversion », aucune contre-passation).

Décision · ne se contre-passent que l'écart de conversion (478, 479 et le
compte de tiers qu'il ajuste) ; rien des disponibilités.

## Fait

(au fil des commits)

## Reste

(au fil des commits)

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/devises
```
