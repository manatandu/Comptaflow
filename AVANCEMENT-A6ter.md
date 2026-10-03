# Avancement · ligne A6 ter

Branche de sauvegarde `travail/a6ter`, partie de `main` 0dbc315.

## Fait

- (m-1) D3 lit le groupe à cheval de deux exercices dénoué dans l'exercice
  (`reglements/ecarts-non-constates.ts`) · lu sur toutes ses lignes, retenu si
  sa dernière ligne est de l'exercice ; la clôture le refuse, groupe, compte,
  montant, date du dénouement et issue nommés (passer l'écart, même figé,
  report au premier jour non clôturé, AUDCIF art. 22, 4°). AUDCIF art. 55.

## Reste

- (m-2) faux avertissement « en francs, sans devise » sur la ligne reportée
  d'une réévaluation (`reglesEnFrancs`).
- (m-3) ordre du message de la borne M6.
- (m-4) concordance de `lireLaReevaluation` sur la règle B1.
- Ligne reportée d'une réévaluation dans les échéances fournisseurs.
- Rejeu sur vraie base à travers la clôture (§ 10).

## Décisions

- Le refus de la clôture n'enferme plus · `passerEcartChange` complète un
  groupe figé de sa seule ligne (`groupeTolere`, B2 du second tour d'A6 bis).

## Vérification

```bash
npx jest src/modules/reglements src/modules/exercice src/modules/controles
```
