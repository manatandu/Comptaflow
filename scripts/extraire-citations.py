"""Inventaire MÉCANIQUE des citations juridiques du logiciel.

Le périmètre ne doit dépendre d'aucun souvenir : on ratisse tous les fichiers
source, on extrait chaque motif de citation, et on rend un TSV. Ce qui n'est pas
extrait ici ne sera pas vérifié, donc le motif est volontairement large.
"""
import os, re, csv, sys

RACINES = ['src', 'client/src', 'prisma']
EXT = ('.ts', '.tsx', '.prisma', '.sql')

# Un motif par famille de citation. Large plutôt que fin : un faux positif se
# jette à la lecture, un oubli ne se voit jamais.
MOTIFS = [
    ('ARTICLE',   re.compile(r"\b(?:art(?:icle)?s?\.?)\s*(?:premier|\d+(?:\s*(?:bis|ter|quater|quinquies))?)(?:\s*[,:]?\s*\d+°)?", re.I)),
    ('TEXTE',     re.compile(r"n°\s?\d{2,3}[/-]\d{3,4}")),
    ('NORME',     re.compile(r"\b(?:ISA|ISQM|IAS|IFRS)\s?\d+")),
    ('REFERENTIEL', re.compile(r"\b(?:AUDCIF|SYCEBNL|SYSCOHADA|AUSCGIE|AUSCOOP|CPCC)\b")),
    ('TAUX',      re.compile(r"\b\d{1,3}(?:[.,]\d+)?\s?%")),
    ('CHAPITRE',  re.compile(r"\b(?:Titre|titre)\s+[IVXL]+|\bch\.\s?\d+|\bchapitre\s+\d+", re.I)),
]

lignes = []
for racine in RACINES:
    for dossier, _, fichiers in os.walk(racine):
        if 'node_modules' in dossier or '/dist/' in dossier:
            continue
        for f in sorted(fichiers):
            if not f.endswith(EXT):
                continue
            chemin = os.path.join(dossier, f)
            with open(chemin, encoding='utf-8') as fh:
                for no, texte in enumerate(fh, 1):
                    trouves = []
                    for nom, motif in MOTIFS:
                        for m in motif.findall(texte):
                            trouves.append((nom, m.strip()))
                    if trouves:
                        lignes.append((chemin, no, texte.strip()[:400],
                                       ' | '.join(f'{n}:{v}' for n, v in trouves)))

sortie = sys.argv[1]
with open(sortie, 'w', newline='', encoding='utf-8') as fh:
    w = csv.writer(fh, delimiter='\t')
    w.writerow(['fichier', 'ligne', 'texte', 'motifs'])
    w.writerows(lignes)

print(f'{len(lignes)} lignes portant au moins une citation')
fichiers = sorted({l[0] for l in lignes})
print(f'{len(fichiers)} fichiers concernés')
