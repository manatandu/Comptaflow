"""Ce que les scripts de l'audit des citations partagent · le RÉPERTOIRE DE
TRAVAIL, le relevé brut et le lot A (docs/audit-citations-2026-09-06.md).

POURQUOI CE FICHIER EXISTE (audit final F263). Les scripts des lots B, C et D
lisaient et écrivaient dans le répertoire temporaire de la session qui a mené
l'audit, écrit en dur, et le rapprochement lisait les compétences sous un
chemin de synchronisation propre à ce poste. Hors de cette session, tous
tombaient au premier `open`. Le répertoire se passe désormais en argument, et
sa lecture vit ici une seule fois, pour que les quatre scripts ne divergent
pas sur ce qu'est « le lot A » ou sur la façon de relire une ligne citée.

Le déroulé, depuis n'importe quel dossier :

    python3 scripts/extraire-citations.py <travail>/citations.tsv   (à la racine du dépôt)
    python3 scripts/index-citations-lot-b.py <travail>
    python3 scripts/lot-c-citations-sans-texte.py <travail>
    python3 scripts/lot-d-affirmations-sans-source.py <travail>
    python3 scripts/rapprocher-citations.py <travail> <racine des compétences>

`extraire-citations.py` ratisse `src/`, `client/src/` et `prisma/` relatifs au
dossier courant · il se lance donc à la racine du dépôt. Les autres relisent
les fichiers cités à partir de la racine du dépôt, où qu'on les lance.
"""
import csv
import json
import os
import sys

RACINE_DEPOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def repertoire_de_travail(script, suite=''):
    """Le répertoire passé en premier argument, ou l'arrêt avec le mode d'emploi.

    On s'arrête plutôt que de retomber sur un répertoire par défaut · un
    défaut muet ferait relire un relevé d'une autre passe, et le comptage
    publié ne correspondrait plus au code du jour.
    """
    if len(sys.argv) < 2 or not os.path.isdir(sys.argv[1]):
        sys.exit(
            f'usage : python3 scripts/{script} <répertoire de travail>{suite}\n'
            '  le répertoire porte citations.tsv, produit par\n'
            '  python3 scripts/extraire-citations.py <répertoire de travail>/citations.tsv'
        )
    return sys.argv[1]


def lire_citations(travail):
    """Le relevé brut de `extraire-citations.py`, une ligne par citation."""
    chemin = os.path.join(travail, 'citations.tsv')
    if not os.path.exists(chemin):
        sys.exit(f'{chemin} absent · lancer d’abord scripts/extraire-citations.py à la racine du dépôt.')
    with open(chemin, encoding='utf-8') as fh:
        return list(csv.DictReader(fh, delimiter='\t'))


def lire_lot_a(travail):
    """Les lignes du lot A, en couples (fichier, ligne).

    LE LOT A N'EST PRODUIT PAR AUCUN SCRIPT DU DÉPÔT · c'est la sélection des
    citations qui portent un chiffre opposable (taux, seuil, délai, montant,
    docs/audit-citations-2026-09-06.md, « LOT A »), rangée dans `lotA.json`
    sous la forme d'une liste `[{"fichier": ..., "ligne": ...}]`. Absent,
    rien n'est retiré, et le script le DIT · les comptages des lots B et C
    comprennent alors les lignes du lot A, ce qui n'est plus le découpage
    publié.
    """
    chemin = os.path.join(travail, 'lotA.json')
    if not os.path.exists(chemin):
        print(f'AVERTISSEMENT · {chemin} absent : aucune ligne n’est rangée au lot A, '
              'les comptages qui suivent la comprennent.\n', file=sys.stderr)
        return set()
    with open(chemin, encoding='utf-8') as fh:
        # La ligne se compare en TEXTE, comme le TSV la rend · un lot A écrit
        # avec des entiers ne retrancherait sinon rien, sans un mot.
        return {(l['fichier'], str(l['ligne'])) for l in json.load(fh)}


def chemin_cite(fichier):
    """Le fichier cité, relu depuis la racine du dépôt et non depuis le dossier courant."""
    return fichier if os.path.isabs(fichier) else os.path.join(RACINE_DEPOT, fichier)


def ecrire_json(travail, nom, donnees):
    """Écrit une sortie dans le répertoire de travail et dit où."""
    chemin = os.path.join(travail, nom)
    with open(chemin, 'w', encoding='utf-8') as fh:
        json.dump(donnees, fh, ensure_ascii=False, indent=1)
    print(f'\n· écrit : {chemin}')
