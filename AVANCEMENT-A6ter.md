# Avancement · ligne A6 ter

Branche de sauvegarde `travail/a6ter`, partie de `main` 0dbc315.

## Fait

- (m-1) D3 lit le groupe à cheval de deux exercices dénoué dans l'exercice
  (`reglements/ecarts-non-constates.ts`) · lu sur toutes ses lignes, retenu si
  sa dernière ligne est de l'exercice ; la clôture le refuse, groupe, compte,
  montant, date du dénouement et issue nommés (passer l'écart, même figé,
  report au premier jour non clôturé, AUDCIF art. 22, 4°). AUDCIF art. 55.

- (m-4) `lireLaReevaluation` reconstitue le compte par la règle B1 de
  `lectureDesGroupes` (groupe à cheval lu ouvert, ses lignes en francs dans
  sa devise, le dénoué à cheval écarté et son écart admis) · plus
  d'avertissement « des lettrages ou des écritures ont changé » à tort.

- (m-3) la borne M6 dit « lettrez-les d'abord avec leur facture » avant
  « réglez au plus ».

- (m-2) et échéances · la ligne d'écart d'une réévaluation sur le compte
  d'un tiers, dans l'exercice (liaison directe) ou reportée à l'à-nouveau
  (liaison des réévaluations antérieures, une ligne d'écart pour une ligne
  d'à-nouveau au Détail, le reste d'un seul tenant au Solde), n'est plus ni
  une facture à payer (`/reglements/echeances`) ni un règlement en francs
  (avertissement du règlement en devise) · `reglements/lignes-de-reevaluation.ts`.

## Reste

- Rejeu sur vraie base à travers la clôture (§ 10).

## Décisions

- Le refus de la clôture n'enferme plus · `passerEcartChange` complète un
  groupe figé de sa seule ligne (`groupeTolere`, B2 du second tour d'A6 bis).

## Vérification

```bash
npx jest src/modules/reglements src/modules/exercice src/modules/controles
```
