"""LOT B · réduire 7 872 lignes à l'ensemble des RÉFÉRENCES DISTINCTES.

Une même citation (« AUDCIF art. 22 ») répétée quarante fois ne se vérifie
qu'une fois. Le rattachement texte <-> article se lit sur la ligne quand un
seul texte y est nommé ; sinon la référence est mise de côté comme AMBIGUË,
et le comptage le dit plutôt que de deviner.
"""
import re, collections
from citations_commun import repertoire_de_travail, lire_citations, lire_lot_a, ecrire_json

# Le répertoire de travail se passe en argument (audit final F263) · il était
# écrit en dur sur le répertoire temporaire de la session d'origine, et le
# script tombait partout ailleurs. Voir citations_commun.py pour le déroulé.
TRAVAIL = repertoire_de_travail('index-citations-lot-b.py')
L = lire_citations(TRAVAIL)
A = lire_lot_a(TRAVAIL)
B = [l for l in L if (l['fichier'], l['ligne']) not in A]

# Les corpus que le dépôt peut citer. L'ordre ne compte pas : ce qui compte est
# qu'un seul d'entre eux soit nommé sur la ligne pour que le couple soit sûr.
TEXTES = {
    'AUDCIF': r'\bAUDCIF\b',
    'SYCEBNL': r'\bSYCEBNL\b',
    'SYSCOHADA': r'\bSYSCOHADA\b',
    'AUSCGIE': r'\bAUSCGIE\b',
    'AUSCOOP': r'\bAUSCOOP\b',
    'AUDCG': r'\bAUDCG\b',
    'LPF': r'\bLPF\b|procédures? fiscales',
    'loi 23/053': r'23/053',
    'loi 004/2001': r'004/2001',
    'TVA 10/001': r'10/001',
    'douanes 10/002': r'10/002',
    'ISA': r'\bISA\s?\d+',
    'ISQM': r'\bISQM\s?\d+',
    'CPCC': r'\bCPCC\b',
    'Code du numérique': r'23/10\b|[Cc]ode du numérique',
}
ART = re.compile(r'\b(?:art(?:icles?)?\.?)\s*((?:premier|\d+)(?:\s*(?:bis|ter|quater|quinquies))?)', re.I)

couples, ambigus, sans_article = collections.Counter(), collections.Counter(), collections.Counter()
exemple = {}
for l in B:
    t = [n for n, m in TEXTES.items() if re.search(m, l['texte'])]
    a = ART.findall(l['texte'])
    if not a:
        for n in t:
            sans_article[n] += 1
        continue
    if len(t) == 1:
        for x in a:
            cle = (t[0], x.lower().replace(' ', ' ').strip())
            couples[cle] += 1
            exemple.setdefault(cle, f"{l['fichier']}:{l['ligne']}  {l['texte'][:200]}")
    elif len(t) == 0:
        ambigus['(aucun texte nommé sur la ligne)'] += 1
    else:
        ambigus[' + '.join(t)] += 1

print(f"Lot B : {len(B)} lignes")
print(f"  couples (texte, article) DISTINCTS et non ambigus : {len(couples)}")
print(f"  lignes où l'article n'a pas de texte nommé      : {sum(ambigus.values())}")
print(f"  lignes citant un texte sans article             : {sum(sans_article.values())}")
print()
print("Références distinctes par corpus :")
for corpus, n in collections.Counter(c[0] for c in couples).most_common():
    print(f"  {n:4}  {corpus}")
ecrire_json(TRAVAIL, 'lotB_index.json',
            {'couples': [[k[0], k[1], v, exemple[k]] for k, v in couples.items()]})
