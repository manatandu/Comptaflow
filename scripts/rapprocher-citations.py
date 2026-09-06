"""Pour chaque couple (corpus, article) du lot B, extraire l'OBJET de l'article
dans la compétence, et le mettre en regard de la ligne du code qui le cite.

Le but n'est pas de trancher automatiquement · c'est de rendre les 197 couples
lisibles d'un coup d'œil, pour que la lecture porte sur le RAPPROCHEMENT et non
sur la recherche.
"""
import json, re, os, glob

B = '/root/.claude/skills/synced/80921ba8-2ca0-4a8a-b7c1-4d4972fcb762_a1cd7539-5871-4b3d-820b-8de8737ca38b'
CORPUS = {
    'AUDCIF':       (f'{B}/audcif-acte-uniforme/references/*.md',        r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'SYCEBNL':      (f'{B}/sycebnl/references/acte-uniforme-articles-1-28.md', r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'AUSCGIE':      (f'{B}/auscgie-acte-uniforme/references/*.md',       r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'AUSCOOP':      (f'{B}/auscoop-acte-uniforme/references/*.md',       r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'AUDCG':        (f'{B}/audcg-acte-uniforme/references/*.md',         r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'loi 23/053':   (f'{B}/fiscalite-rdc/code-general-2026/references/0[3-6]*.md', r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'LPF':          (f'{B}/fiscalite-rdc/code-general-2026/references/1[789]*.md {B}/fiscalite-rdc/code-general-2026/references/20*.md', r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'TVA 10/001':   (f'{B}/fiscalite-rdc/tva/references/0[1-7]*.md',     r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
    'loi 004/2001': (f'{B}/droit-asbl-ong-rdc/references/loi-004-2001*.md', r'^\s*[#*]*\s*\**Article\s+{a}(\s*(?:bis|ter|quater|quinquies))?(er)?\b'),
}

d = json.load(open('/tmp/claude-0/-home-user/ac8187b8-6ad7-5085-a3b1-d7551f9bf74d/scratchpad/lotB_index.json'))['couples']
sortie = []
for corpus, art, n, ex in sorted(d):
    if corpus not in CORPUS:
        sortie.append((corpus, art, n, ex, '(corpus non indexé)'))
        continue
    motif_fichiers, motif_art = CORPUS[corpus]
    fichiers = []
    for p in motif_fichiers.split(' '):
        fichiers += glob.glob(p)
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
with io.open('/tmp/claude-0/-home-user/ac8187b8-6ad7-5085-a3b1-d7551f9bf74d/scratchpad/rapprochement.txt', 'w', encoding='utf-8') as fh:
    for corpus, art, n, ex, objet in sortie:
        fh.write(f"\n=== {corpus} art. {art}  ({n} occurrence(s))\n  CODE   : {ex[:230]}\n  TEXTE  : {objet}\n")
introuv = [s for s in sortie if 'INTROUVABLE' in s[4]]
print(f"{len(sortie)} couples rapprochés · {len(introuv)} article(s) INTROUVABLE(S) dans la compétence :")
for c, a, n, ex, _ in introuv:
    print(f"  {c} art. {a}  ({n})  {ex[:150]}")
