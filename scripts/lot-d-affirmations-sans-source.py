"""LOT D · les lignes qui NOMMENT un texte sans citer d'article.

Il n'y a là aucune référence à contrôler : la question change. Ce qui se
vérifie est l'inverse · une AFFIRMATION DE DROIT qui n'a pas de source.

Le § 9 du règlement l'exige : « Toute règle comptable codée cite sa source en
commentaire : l'article, la partie, le chapitre. » Une ligne qui écrit « le
SYCEBNL impose X » sans dire OÙ est exactement ce que cette règle interdit, et
c'est indétectable autrement qu'en la cherchant.

Trois populations, et une seule est à risque :

  TECHNIQUE · `Referentiel.SYCEBNL`, un nom de fichier, un type, une clé de
  traduction. Le sigle y est une valeur, pas une assertion.

  SOURCÉE · le texte est nommé et un article, un chapitre, une partie ou un
  paragraphe l'accompagne à portée de lecture.

  AFFIRMATION NON SOURCÉE · un verbe normatif, un texte nommé, aucune source.
  C'est le seul cas où le lecteur doit croire le logiciel sur parole.
"""
import csv, re, json, collections

SIGLES = r'AUDCIF|SYCEBNL|SYSCOHADA|AUSCGIE|AUSCOOP|AUDCG|CPCC|ISA|LPF'
# Verbes par lesquels un texte COMMANDE quelque chose. La forme négative
# compte double : « le SYCEBNL ne connaît pas » est une assertion aussi forte.
NORMATIF = re.compile(
    r"\b(?:" + SIGLES + r")\b[^.]{0,90}?\b(?:impose|exige|interdit|oblige|prévoit|veut|"
    r"admet|autorise|refuse|permet|impose|commande|réserve|écarte|exclut|dit|écrit|pose|"
    r"n'exige|ne connaît|ne prévoit|n'autorise|n'impose|ne dit|ne permet|ne vise)", re.I)
# Une source, sous n'importe laquelle de ses formes dans ce dépôt.
SOURCE = re.compile(r"art(?:icle)?s?\.?\s*(?:premier|\d)|\bTitre\s+[IVXL]+|\bch\.\s?\d|"
                    r"chapitre\s+\d|§\s?\d|Partie\s+\d|Application\s+\d|App\.\s?\d|"
                    r"cadre conceptuel|glossaire|fiche du compte|Note\s+\d", re.I)
# Le sigle employé comme VALEUR de code, jamais comme sujet d'une phrase.
TECHNIQUE = re.compile(r"Referentiel\.|referentiel\s*[:=]|'(?:" + SIGLES + r")'|"
                       r'"(?:' + SIGLES + r')"|`(?:' + SIGLES + r')`|'
                       r"\b(?:" + SIGLES + r")\b\s*[,\]\}]|import |from '|\.spec|/\*\* @|"
                       r"enum |type |interface ")

L = list(csv.DictReader(open('/tmp/claude-0/-home-user/ac8187b8-6ad7-5085-a3b1-d7551f9bf74d/scratchpad/citations.tsv',
                             encoding='utf-8'), delimiter='\t'))
ART = re.compile(r'\bart(?:icles?)?\.?\s*(?:premier|\d+)', re.I)

cache = {}
def voisinage(f, no, n=6):
    if f not in cache:
        cache[f] = open(f, encoding='utf-8').read().split('\n')
    l = cache[f]
    return '\n'.join(l[max(0, no - 1 - n): no + n])

technique = sourcee = 0
suspectes = []
for x in L:
    t, f, no = x['texte'], x['fichier'], int(x['ligne'])
    if ART.search(t):                    # porte un article : lots A/B/C
        continue
    if not re.search(r'\b(?:' + SIGLES + r')\b', t):
        continue
    if not NORMATIF.search(t):
        technique += 1
        continue
    if SOURCE.search(voisinage(f, no)):
        sourcee += 1
        continue
    suspectes.append((f, no, t[:200]))

print(f"Lignes nommant un texte sans citer d'article : {technique + sourcee + len(suspectes)}")
print(f"  {technique:5}  aucune formule normative · le sigle est une valeur, un type, un nom")
print(f"  {sourcee:5}  formule normative, mais une SOURCE est à portée de lecture")
print(f"  {len(suspectes):5}  formule normative SANS aucune source · À LIRE\n")
for f, n in collections.Counter(s[0] for s in suspectes).most_common(15):
    print(f"  {n:4}  {f}")
json.dump(suspectes, open('/tmp/claude-0/-home-user/ac8187b8-6ad7-5085-a3b1-d7551f9bf74d/scratchpad/lotD.json', 'w'),
          ensure_ascii=False, indent=1)
