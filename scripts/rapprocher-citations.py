"""Pour chaque couple (corpus, article) du lot B, extraire l'OBJET de l'article
dans la compétence, et le mettre en regard de la ligne du code qui le cite.

Le but n'est pas de trancher automatiquement · c'est de rendre les 197 couples
lisibles d'un coup d'œil, pour que la lecture porte sur le RAPPROCHEMENT et non
sur la recherche.
"""
import json, re, os, glob, sys
from citations_commun import repertoire_de_travail

# Le répertoire de travail ET la racine des compétences se passent en argument
# (audit final F263) · les deux étaient écrits en dur, l'un sur le répertoire
# temporaire de la session d'origine, l'autre sur le chemin de synchronisation
# des compétences propre à ce poste. La racine est le dossier qui contient
# `audcif-acte-uniforme/`, `sycebnl/`, `fiscalite-rdc/`... ; à défaut
# d'argument, la variable OMEGAX_COMPETENCES.
TRAVAIL = repertoire_de_travail('rapprocher-citations.py', ' <racine des compétences>')
B = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('OMEGAX_COMPETENCES')
if not B or not os.path.isdir(os.path.join(B, 'audcif-acte-uniforme')):
    sys.exit('racine des compétences introuvable · second argument, ou variable OMEGAX_COMPETENCES, '
             'vers le dossier qui contient audcif-acte-uniforme/.')
CORPUS = {
    'AUDCIF':       (f'{B}/audcif-acte-uniforme/references/*.md',        r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'SYCEBNL':      (f'{B}/sycebnl/references/acte-uniforme-articles-1-28.md', r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'AUSCGIE':      (f'{B}/auscgie-acte-uniforme/references/*.md',       r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'AUSCOOP':      (f'{B}/auscoop-acte-uniforme/references/*.md',       r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'AUDCG':        (f'{B}/audcg-acte-uniforme/references/*.md',         r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'loi 23/053':   (f'{B}/fiscalite-rdc/code-general-2026/references/0[3-6]*.md', r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'LPF':          ([f'{B}/fiscalite-rdc/code-general-2026/references/1[789]*.md', f'{B}/fiscalite-rdc/code-general-2026/references/20*.md'], r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'TVA 10/001':   (f'{B}/fiscalite-rdc/tva/references/0[1-7]*.md',     r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'loi 004/2001': (f'{B}/droit-asbl-ong-rdc/references/loi-004-2001*.md', r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
}

chemin_lot_b = os.path.join(TRAVAIL, 'lotB_index.json')
if not os.path.exists(chemin_lot_b):
    sys.exit(f'{chemin_lot_b} absent · lancer d’abord scripts/index-citations-lot-b.py.')
d = json.load(open(chemin_lot_b, encoding='utf-8'))['couples']
sortie = []
for corpus, art, n, ex in sorted(d):
    if corpus not in CORPUS:
        sortie.append((corpus, art, n, ex, '(corpus non indexé)'))
        continue
    motif_fichiers, motif_art = CORPUS[corpus]
    fichiers = []
    # Une LISTE de motifs, jamais une chaîne coupée aux espaces · la racine des
    # compétences est désormais un argument, et un chemin qui porte une espace
    # aurait été coupé en deux motifs qui ne trouvent rien.
    for p in (motif_fichiers if isinstance(motif_fichiers, list) else [motif_fichiers]):
        fichiers += glob.glob(p)
    if not fichiers:
        # Aucun fichier sous le motif n'est pas un article introuvable · le
        # compter comme tel accuserait le code d'une citation fausse quand
        # c'est la compétence qui a changé de place.
        sortie.append((corpus, art, n, ex, '(aucun fichier de compétence sous ce motif)'))
        continue
    rx = re.compile(motif_art.format(a=re.escape(art)), re.M)
    objet = ''
    for f in fichiers:
        t = open(f, encoding='utf-8').read()
        m = rx.search(t)
        if m:
            suite = t[m.end():m.end() + 900]
            objet = ' '.join(suite.split())[:260]
            break
    sortie.append((corpus, art, n, ex, objet or '*** ARTICLE INTROUVABLE DANS LA COMPÉTENCE ***'))

import io
with io.open(os.path.join(TRAVAIL, 'rapprochement.txt'), 'w', encoding='utf-8') as fh:
    for corpus, art, n, ex, objet in sortie:
        fh.write(f"\n=== {corpus} art. {art}  ({n} occurrence(s))\n  CODE   : {ex[:230]}\n  TEXTE  : {objet}\n")
introuv = [s for s in sortie if 'INTROUVABLE' in s[4]]
print(f"{len(sortie)} couples rapprochés · {len(introuv)} article(s) INTROUVABLE(S) dans la compétence :")
for c, a, n, ex, _ in introuv:
    print(f"  {c} art. {a}  ({n})  {ex[:150]}")
