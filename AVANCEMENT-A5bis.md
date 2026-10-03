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

1. `extourner` ne contre-passe que l'écart de conversion · partage par la
   RACINE (`ecarts-disponibilites.ts`, `partagerLignesDEcarts` · 52, 53,
   55, 57, 58 et 676 / 776 restent), deux parts équilibrées sinon refus
   nommé ; réévaluation des seules disponibilités · refus nommé (rien à
   contre-passer).
2. La banque part en N+1 de sa valeur de clôture de N · l'écart de chaque
   disponibilité est gardé (`Reevaluation.ecartsDisponibilites`, migration
   `20270124000000`) et `calculer` l'ajoute à la valeur comptable par
   `ecartsReportesDesDisponibilites`, en remontant les reports d'OmegaX
   (SOLDE et DÉTAIL), jamais par libellé. Réévaluation antérieure sans
   écart gardé · relu sur son écriture (une seule devise sur le compte, ou
   cours gardé D5 et somme au centime), sinon réserve et passage refusé.
   À-nouveau provisoire antérieur à la validation de l'écart · réserve.
   Ancien régime (contre-passation qui a inversé la banque) · rien reporté,
   total juste (gain N+1 net de la contre-passation).
3. `reevaluerSousVerrou` refuse tant que la réévaluation de l'exercice
   précédent porte un 478 / 479 non contre-passé (Application 85),
   issue nommée.
4. Contrôle 34 (A13 tient le 32 et le 33) `CONTRE_PASSATION_DE_DISPONIBILITE` (INFORMATION) · les
   anciennes contre-passations qui ont inversé une banque ou une caisse,
   issue selon l'exercice de la réévaluation (D6 si ouvert ; sinon au
   cabinet, sans repasser la ligne de la banque à la main).
5. Commentaire de `report-a-nouveau.ts` mis à jour.

Décision non tranchée par le texte, retenue · la valeur de la banque en
N+1 se lit par la chaîne des réévaluations, l'à-nouveau ne portant pas
l'écart sur la ligne de sa devise (écart passé sans devise, F55).

6. Rattachée à main 5d388c0 (A11, A13, A10) par un merge · doublures
   `reevaluation.findMany` posées aussi dans les specs d'A13 ; migration
   renumérotée `20270124000000` ; `prisma migrate diff` sur base jetable ·
   « No difference detected ». A13 reconnaît la contre-passation par
   liaison, elle ne porte simplement plus de ligne de banque.

## Reste

- Relectures (silent-failure-hunter, typescript-reviewer) à l'intégration.
- A10 (`uniteDeLaCaisse`) écarte les écritures d'écarts de réévaluation,
  pas la part reportée en francs par l'à-nouveau · une caisse en devise
  réévaluée en N se lit « mêlée » en N+1 (déjà le cas avant A5 bis, la
  contre-passation étant elle aussi en francs). Non traité ici.

## Vérification

```bash
npx tsc --noEmit
npx jest src/modules/devises
```
