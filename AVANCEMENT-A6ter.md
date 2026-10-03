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
  La CONTRE-PASSATION aussi (trouvé au rejeu · chez un client elle débite le
  411 en N+1 et se présentait comme une créance à encaisser).

- Rejeu sur vraie base (§ 10), API du serveur compilé, PostgreSQL 16 jetable,
  SYSCOHADA, client 411 au SOLDE, USD 2 800 (01/10/2026), 2 750 (31/12/2026),
  2 700 (10/02/2027), 2 650 (31/12/2027). Facture G 1 000 USD et H 500 USD en
  N ; encaissement de G en N+1 à 2 700 lettré à cheval AVANT la clôture de N.
  Réévaluation N · 1 500 USD lus (G subsiste, B-3), perte 75 000 · 411
  4 125 000, 478 75 000, 4991 -75 000, 6591 75 000. Clôture N, contre-passation
  en N+1. Échéances N+1 · seule la ligne d'à-nouveau en devise (la
  contre-passation n'y est plus). Clôture N+1 REFUSÉE · « 41110000 lettrage a ·
  perte de 100 000,00, à cheval de deux exercices, dénoué le 2027-02-10 ».
  Écart passé sur le groupe figé (656, 100 000, groupe SOLDE). Règlement de H
  500 USD à 2 700 · aucun avertissement « en francs, sans devise » (le reste
  au Solde de -75 000 est reconnu), écart 50 000. Réévaluation N+1 · aucune
  position, reprise 75 000. Clôture N+1 passe. Soldes N+1 lus contre la main ·
  411 0, 52 4 050 000, 656 150 000, 478 0, 4991 0, 7591 -75 000 ; N+2 ouvre
  411 0, 52 4 050 000. Scripts · scratchpad `a6ter/s2.mjs`, `s3.mjs`.

## Reste (au suivi, non traité)

- En Solde, N clôturé, la perte réalisée d'une facture payée en N+1 SANS
  lettrage reste dans la position et se provisionne (rien ne dit à D3 son
  dénouement) · le calcul de la réévaluation la nomme seulement.
- Contrôle qui nomme les réévaluations déjà passées que B-3 change.
- Relevé du rejeu · avant le passage de l'écart d'un groupe à cheval, la
  ligne d'à-nouveau qui reporte sa facture se lit due du reste EN FRANCS du
  paiement (1 500 000 pour 500 USD, au lieu de 1 400 000) · le règlement de
  l'autre facture passé AVANT l'écart chiffrerait son réalisé sur ce reste.
  Après l'écart, 1 400 000. À vérifier (`paires-a-cheval.ts`).
- Le groupe à cheval dont la seule ligne de l'exercice est en francs est lu
  désormais en entier par D3 (m-1) ; pas de rejeu dédié.

## Décisions

- Le refus de la clôture n'enferme plus · `passerEcartChange` complète un
  groupe figé de sa seule ligne (`groupeTolere`, B2 du second tour d'A6 bis).

## Vérification

```bash
npx jest src/modules/reglements src/modules/exercice src/modules/controles
```
