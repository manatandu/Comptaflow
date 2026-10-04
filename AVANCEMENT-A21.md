# AVANCEMENT A21 · facture d'achat datée à sa réception

Branche de sauvegarde · `travail/a21` (base `f46165b`).

## Textes lus

- AUDCIF art. 16, al. 2 (non exclu par l'art. 3 du SYCEBNL) · « Les mouvements
  affectant le patrimoine de l'entité sont enregistrés en comptabilité, opération
  par opération, dans l'ordre de leur date de valeur comptable. Cette date est
  celle de l'émission par l'entité de la pièce justificative de l'opération, ou
  celle de la réception des pièces d'origine externe. »
- AUDCIF art. 17, 3° et 5° (pièces datées, références de la pièce) ; art. 22.
- O.-L. n° 10/001, art. 25 (exigibilité), 26 (débits), 36, 37 (« Le droit à
  déduction prend naissance lorsque la taxe devient exigible chez l'assujetti. Le
  droit à déduction est exercé jusqu'au 31 décembre de l'année qui suit celle au
  cours de laquelle la taxe est devenue exigible. »), 38, 1° (TVA « doit figurer
  [...] sur une facture normalisée »), 56 (état détaillé « pour exercer le droit
  à déduction »).
- Décret n° 011/42, art. 52, 57, 61, 62, 96 (« L'assujetti visé [...] s'entend
  du fournisseur de biens ou du prestataire de services »), 97, 102 (imputation
  sur le mois des taxes « pour lesquelles le droit à déduction a pris
  naissance »), 133, 134.
- Fiche du compte 60, deux plans, mot pour mot · « À la clôture de l'exercice,
  les biens reçus par l'entité avant réception de la facture correspondante sont
  néanmoins inscrits dans les achats, par le crédit d'un compte divisionnaire de
  fournisseurs (408 · Factures non parvenues). » Fiche 40 · contre-passation à
  l'ouverture.

## Décisions (par le texte)

1. `Facture.dateReception` NULLABLE SANS DÉFAUT · art. 16 al. 2 fixe la date de
   valeur d'une pièce externe à sa réception ; une facture d'avant n'en a pas, et
   ni la date de facture ni le jour de saisie ne la remplacent. Refusée sur une
   vente (pièce émise · date d'émission), avant la date de facture, et future
   (jour de Kinshasa). CHECK en base.
2. L'écriture d'une facture d'ACHAT (et d'une note reçue) se date à la réception,
   dans l'exercice de la réception ; la date de facture reste au libellé
   (« Facture FA-12 du 28/12/2025 · … ») et en référence. Sans réception · refus
   nommé, la date se déclare au passage (`dateReception` du DTO), une fois, posée
   avec le lien. Une vente reste datée à son émission.
3. Facture d'un exercice reçue dans le suivant · AVERTISSEMENT (fiche 60, 408),
   rien passé.
4. TVA, mois de déduction · la taxe se déduit au mois de l'écriture (réception) ·
   art. 38, 1° (la pièce est exigée), décret art. 102 (droits nés imputés), délai
   art. 37 al. 2 non dépassé. Comportement du moteur inchangé (il lit déjà la date
   de l'écriture).
5. TVA, délai de déchéance · court de l'exigibilité CHEZ LE FOURNISSEUR (décret
   art. 96), jamais de la réception · pour une facture reçue datée au fait
   générateur ou au débit, la date de FACTURE borne le délai, et une taxe déchue
   n'entre plus dans la déduction. À l'encaissement (services), rien ne change.
   Sans `dateReception`, rien ne change.
6. État détaillé (art. 56, 134) · au mois de la réception, à défaut de la
   facture · il accompagne la déclaration où la déduction est exercée.

## Non tranché par le texte (comportement laissé)

- La date d'exigibilité d'une livraison de biens (transfert du pouvoir de
  disposer, décret art. 52) n'est pas tenue · la date de facture sert de jalon
  le plus ancien connu pour le délai.
- Le texte ne dit pas que la déduction DOIT se faire au mois de la naissance du
  droit plutôt qu'au mois de la réception · art. 37 al. 2 permet l'exercice
  jusqu'au 31 décembre N+1.
- La saisie générale d'une écriture d'achat (hors facturation) ne connaît pas la
  pièce · inchangée.

## Fait

- Schéma + migration `20270130000000_facture_date_reception`.
- `facturation/date-reception.ts` (règle pure), service, DTO, contrôleur, état
  détaillé, moteur TVA (déchéance).
- Client · champ « Reçue le » (achat), demande au passage, avertissement.
- Specs · `facture-date-reception.spec.ts`, `tva-facture-recue-a21.spec.ts`,
  `client/src/lib/reception-facture.spec.ts`.

## Rejeu sur vraie base (2026-10-04, base `a21_1`, serveur compilé, port 8102)

Dossier SYSCOHADA assujetti, exercices 2025 et 2026. FA-12 datée 28/12/2025
reçue 05/01/2026 (HT 1 000 000, TVA 160 000) ; FA-13 datée 10/12/2025
enregistrée sans réception (HT 500 000, TVA 80 000), refusée au passage puis
déclarée reçue le 15/12/2025. Résultats, tous conformes au calcul à la main ·
écriture FA-12 au 05/01/2026 dans 2026, libellé « Facture FA-12 du 28/12/2025 ·
Fournisseur Kin SARL », avertissement 408 ; déclaration décembre 2025 = 80 000,
janvier 2026 = 160 000 ; état détaillé décembre = FA-13, janvier = FA-12 ;
clôture 2025 faite ; 2026 · 445 report 80 000 + mouvement 160 000 = 240 000,
401 report 580 000 + mouvement 1 160 000 ; 601 · 500 000 en 2025, 1 000 000 en
2026 ; janvier 2026 inchangé après clôture ; janvier 2027 · 240 000 hors délai
(jalon de la facture). Défaut trouvé et corrigé · le libellé d'un achat
nommait le dossier (contrepartie) au lieu du fournisseur (émetteur), gelé par
un test. Drift `prisma migrate diff` · aucune différence.

## Reste

- Bloc § 3 complet.

## Vérification

```bash
npx tsc --noEmit && npx jest --maxWorkers=2 && npm run build
cd client && npx tsc --noEmit && npm test && npm run build
```
