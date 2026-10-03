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

- SECONDE RELECTURE, BLOQUANT (`lettrage/paires-a-cheval.ts`, `imputer`) · le
  reste d'une ligne d'à-nouveau en devise réglée en partie par un groupe à
  cheval est son COÛT HISTORIQUE au prorata de la devise restante (AUDCIF
  art. 54, 55), au Solde comme au Détail, jamais « francs reportés moins
  francs payés ». D3 et `lectureDesGroupes` ne lisent pas ce reste (la
  réévaluation retire le réalisé du groupe dénoué, `denouesACheval`).
  Rejeu p1 du vérificateur sur vraie base (base `a6ter_2`) · échéance de H
  1 400 000 pour 500 USD (au lieu de 1 500 000), règlement de H avant l'écart
  de G · écart 50 000 (au lieu de 150 000), écart de G 100 000, clôture N+1 ·
  656 150 000, 411 0, 52 4 050 000, 478 0, 4991 0, 7591 -75 000 ; N+2 ouvre
  411 0.
- SECONDE RELECTURE, mineur b (`lignes-de-reevaluation.ts`) · les lignes
  d'à-nouveau déjà lettrées consomment leur ligne de réévaluation, la ligne
  lettrée avec une écriture de réévaluation d'abord, la ligne ouverte en
  dernier. Rejeu p4 · après le lettrage automatique de la contre-passation,
  la facture H de 50 000 FC est bien due.

## Reste (au suivi, non traité)

- Mineur a de la seconde relecture · l'écart réalisé PARTIEL d'un groupe à
  cheval sur trois exercices se date dans le mauvais exercice. Non traité.
- Limite du mineur b · AVANT tout lettrage, deux lignes d'à-nouveau ouvertes
  de même montant (la ligne reportée de l'écart, une vraie facture en francs)
  ne se distinguent pas sans lien en base · la première lue est prise pour
  l'écart (rejeu p4 · avant le lettrage, H est masquée et l'écart montré dû).
  Le total dû reste juste ; un lien d'origine sur la ligne d'à-nouveau le
  lèverait (schéma).

- En Solde, N clôturé, la perte réalisée d'une facture payée en N+1 SANS
  lettrage reste dans la position et se provisionne (rien ne dit à D3 son
  dénouement) · le calcul de la réévaluation la nomme seulement.
- Contrôle qui nomme les réévaluations déjà passées que B-3 change.
- Le groupe à cheval dont la seule ligne de l'exercice est en francs est lu
  désormais en entier par D3 (m-1) ; pas de rejeu dédié.

## Décisions

- Le refus de la clôture n'enferme plus · `passerEcartChange` complète un
  groupe figé de sa seule ligne (`groupeTolere`, B2 du second tour d'A6 bis).

## Vérification

```bash
npx jest src/modules/reglements src/modules/exercice src/modules/controles
```
