"""LOT C · les lignes qui citent un article SANS nommer de texte sur la ligne.

Deux populations, et elles n'ont pas le même risque :

  RÉSOLUES · un texte est nommé dans la fenêtre de contexte (le paragraphe de
  commentaire, la constante voisine). Un relecteur retrouve le rattachement,
  et la citation se vérifie comme au lot B.

  ORPHELINES · aucun texte à portée. C'est LA citation dangereuse : « art. 47 »
  ne veut rien dire, et personne ne peut la vérifier sans deviner.

La fenêtre est de douze lignes de part et d'autre · un bloc de commentaire
nomme son texte en tête et cite ses articles ensuite, parfois sur dix lignes.
Plus large, on rattacherait n'importe quoi à n'importe quoi.
"""
import csv, re, json, os, collections

TEXTES = {
    'AUDCIF': r'\bAUDCIF\b', 'SYCEBNL': r'\bSYCEBNL\b', 'SYSCOHADA': r'\bSYSCOHADA\b',
    'AUSCGIE': r'\bAUSCGIE\b', 'AUSCOOP': r'\bAUSCOOP\b', 'AUDCG': r'\bAUDCG\b',
    'AUPSRVE': r'\bAUPSRVE\b', 'AUS': r'\bAUS\b',
    'LPF': r'\bLPF\b|procédures? fiscales', 'loi 23/053': r'23/053', 'loi 23/052': r'23/052',
    'loi 004/2001': r'004/2001', 'TVA 10/001': r'10/001', 'douanes 10/002': r'10/002',
    'ISA': r'\bISA\s?\d+', 'ISQM': r'\bISQM\s?\d+', 'CPCC': r'\bCPCC\b',
    'Code du numérique': r'23/10\b|[Cc]ode du numérique', 'LF 25/060': r'25/060',
    'CNSS 16/009': r'16/009', 'arrêté': r'arrêté n°\s?\d|arrêté ministériel|arrêté interministériel',
    'décret': r'décret n°\s?\d|décret-loi n°\s?\d',
    'IFRS': r'\bIFRS\b|\bIAS\s?\d+', 'Code du travail': r'[Cc]ode du travail',
    'Constitution': r'\bConstitution\b',
}
ART = re.compile(r'\b(?:art(?:icles?)?\.?)\s*((?:premier|\d+)(?:\s*(?:bis|ter|quater|quinquies))?)', re.I)
FENETRE = 12

L = list(csv.DictReader(open('/tmp/claude-0/-home-user/ac8187b8-6ad7-5085-a3b1-d7551f9bf74d/scratchpad/citations.tsv',
                             encoding='utf-8'), delimiter='\t'))
A = {(l['fichier'], l['ligne']) for l in json.load(
    open('/tmp/claude-0/-home-user/ac8187b8-6ad7-5085-a3b1-d7551f9bf74d/scratchpad/lotA.json'))}

def textes(s):
    return [n for n, m in TEXTES.items() if re.search(m, s)]

cache = {}
def contexte(f, no):
    if f not in cache:
        cache[f] = open(f, encoding='utf-8').read().split('\n')
    l = cache[f]
    return '\n'.join(l[max(0, no - 1 - FENETRE): no + FENETRE])

resolues, orphelines = collections.Counter(), []
exemple = {}
for l in L:
    if (l['fichier'], l['ligne']) in A:      # déjà au lot A
        continue
    if not ART.search(l['texte']):           # pas d'article : hors lot C
        continue
    if len(textes(l['texte'])) >= 1:         # texte sur la ligne : lot B
        continue
    no = int(l['ligne'])
    t = textes(contexte(l['fichier'], no))
    arts = ART.findall(l['texte'])
    if not t:
        orphelines.append((l['fichier'], no, l['texte'][:190], arts))
    else:
        for a in arts:
            cle = (' ou '.join(sorted(t)) if len(t) > 1 else t[0], a.lower().strip())
            resolues[cle] += 1
            exemple.setdefault(cle, f"{l['fichier']}:{no}  {l['texte'][:170]}")

print(f"LOT C · {resolues.total() if hasattr(resolues,'total') else sum(resolues.values())} citations rattachées par le contexte")
print(f"        {len(resolues)} couples DISTINCTS")
print(f"        {len(orphelines)} lignes ORPHELINES · aucun texte à {FENETRE} lignes\n")
print("Rattachements par contexte, par corpus :")
for c, n in collections.Counter(k[0] for k in resolues).most_common(14):
    print(f"  {n:4}  {c}")
json.dump({'resolues': [[k[0], k[1], v, exemple[k]] for k, v in resolues.items()],
           'orphelines': orphelines},
          open('/tmp/claude-0/-home-user/ac8187b8-6ad7-5085-a3b1-d7551f9bf74d/scratchpad/lotC.json', 'w'),
          ensure_ascii=False, indent=1)
