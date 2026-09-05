#!/usr/bin/env python3
"""
LA MARQUE OMEGAX · une seule geometrie, tous les formats.

Ce script est la SOURCE unique du logo. Il produit le signe, le logotype, le
bloc horizontal, le bloc vertical, l'icone et les images matricielles de la
PWA depuis un seul jeu de constantes. Deux fichiers dessines separement
divergent toujours, et c'est le genre d'ecart qu'on ne voit qu'une fois la
marque imprimee.

    pip install fonttools brotli pillow
    python3 scripts/engendrer-marque.py

Les dependances ne sont demandees qu'ICI, a la regeneration. Le logiciel, lui,
ne charge que les SVG et les PNG produits : aucun poste client n'a besoin de
Python ni de fontTools pour afficher la marque.


## LE PARTI

OmegaX tient la comptabilite d'entites qui rendent des comptes. La marque dit
donc ce que fait le logiciel, pas ce que veut dire son nom.

L'omega est la derniere lettre : en comptabilite, c'est la CLOTURE. Sa forme
est une arche posee sur deux pieds, separes par un vide. En partie double, ces
deux pieds sont le DEBIT et le CREDIT, et le vide entre eux est la ligne de
partage du journal. L'arche est l'equilibre qui les referme.


## POURQUOI LE SIGNE EST RECOUPE, ET NON DESSINE

Une premiere version tracait l'omega au compas : une arche d'epaisseur
constante sur deux barres. Elle etait juste geometriquement et fausse
typographiquement, parce qu'un trace au compas ignore les corrections
optiques qu'un dessinateur de caracteres applique sans y penser.

Le signe est donc l'omega capital d'IBM Plex Sans SemiBold, RECOUPE : ses
pieds sont allonges vers l'exterieur de 75/1000 d'em de chaque cote, et RIEN
D'AUTRE n'est touche. L'allongement suffit a faire passer la lettre au rang de
signe · elle prend une assise que la lettre n'a pas, et cesse d'etre lisible
comme un omega dans un mot grec.

Ce qu'on a essaye et rejete, parce que le rendu l'a montre :

  · EPAISSIR LES PIEDS a l'epaisseur du fut (140 unites contre 116). L'idee
    etait seduisante · « tout dans le signe vaut un trait ». Elle est fausse :
    les 116 unites des pieds contre 140 du fut sont la compensation optique
    horizontale/verticale du dessinateur. Une barre horizontale a la meme
    epaisseur qu'un fut vertical parait plus lourde que lui. Epaissir alourdit
    la base et fait apparaitre un ressaut la ou la jambe rejoint le pied.
  · ELARGIR LA PARTITION a une epaisseur de fut. Meme verdict : deplacer le
    bord interieur du pied sans deplacer la courbe de la jambe qui le surmonte
    ouvre une encoche a l'angle rentrant.

La licence le permet sans reserve. IBM Plex est sous SIL Open Font License
1.1, dont la FAQ traite le cas nommement : creer un logo a partir des contours
d'une fonte OFL est autorise, et le logo qui en resulte n'est PAS lui-meme
soumis a l'OFL. La seule obligation subsiste sur le FICHIER de fonte
redistribue · d'ou `public/polices/OFL.txt` et `scripts/fontes/OFL.txt`.


## POURQUOI LE MOT EST FIGE EN COURBES

Les quatorze chartes depouillees FIXENT toutes leur logotype. Aucune ne le
laisse dependre des polices installees sur le poste du lecteur : une police
absente ferait rendre la marque dans une autre, et une marque qui change de
police n'est plus une marque. Le mot est donc converti en contours ici, une
fois, et le logiciel n'affiche plus que ces contours.


## CE QUE LE DESSIN DOIT SUPPORTER

  · 16 px · l'onglet du navigateur. Verifie a la generation : voir la planche
    de controle que ce script imprime en fin de course.
  · UNE SEULE COULEUR · telecopie, tampon, gravure, etat imprime en noir.
    D'ou la variante noire, et le `currentColor` pour l'interface.
  · LE MASQUE D'ANDROID · l'icone « maskable », dont le dessin tient dans les
    80 % centraux, le systeme rognant le reste.
"""

import struct
import zlib
from pathlib import Path

try:
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover · outil de generation, pas de production
    raise SystemExit(
        "fontTools est requis pour regenerer la marque :\n"
        "    pip install fonttools brotli pillow"
    )

ICI = Path(__file__).resolve().parent
PUBLIC = ICI.parent / 'public'
FONTES = ICI / 'fontes'
GEOMETRIE_TS = ICI.parent / 'src' / 'components' / 'chrome' / 'marque-geometrie.ts'

# ---------------------------------------------------------------------------
# LES CONSTANTES DE LA MARQUE · tout le reste en decoule.
# ---------------------------------------------------------------------------

CAP = 698           # hauteur de capitale d'IBM Plex Sans SemiBold, en unites/em
FUT = 140           # epaisseur du fut, mesuree sur le O capital
EM = 1000           # unites par em

ALLONGE = 75.0      # ce dont chaque pied du signe sort vers l'exterieur
APPROCHE = -15      # approche du logotype, en millieme d'em · resserree
ECHELLE_SIGNE = 1.12  # hauteur du signe rapportee a la hauteur de capitale
ECART_BLOC = 0.42   # blanc signe/mot, en part de la hauteur de capitale
ECART_VERTICAL = 0.34  # blanc signe/mot du bloc vertical, meme unite
# Le bloc vertical ne peut pas garder l'echelle du bloc horizontal. Empile
# au-dessus de six lettres, le signe a 1,12 hauteur de capitale ne fait plus
# que 22 % de la largeur du mot : il se lit comme un accent, pas comme un
# signe. A 2,2 il en fait 44 %, et l'empilement tient.
ECHELLE_SIGNE_VERTICAL = 2.2

ENCRE_HEX = '#142f6b'           # le bleu de la marque · 12,74:1 sur blanc
ENCRE_RVB = (0x14, 0x2F, 0x6B)

# L'icone · le signe en reserve dans un carre a coins arrondis.
MARGE_ICONE = 0.155   # blanc autour du signe, en part du cote
RAYON_ICONE = 0.22    # rayon des coins, en part du cote
# Le masque d'Android rogne jusqu'a 20 % du cote : le dessin se replie dans
# les 80 % centraux, et le fond deborde jusqu'aux bords.
MARGE_MASQUABLE = 0.28

MOT = 'OmegaX'


# ---------------------------------------------------------------------------
# EXTRACTION · les contours, depuis les fontes versionnees dans scripts/fontes.
# ---------------------------------------------------------------------------

def _fonte(nom: str) -> TTFont:
    chemin = FONTES / nom
    if not chemin.exists():
        raise SystemExit(f"fonte absente : {chemin}\nvoir scripts/fontes/README.md")
    f = TTFont(chemin)
    if f.flavor:                      # woff2 -> on retire la compression
        import io
        f.flavor = None
        tampon = io.BytesIO()
        f.save(tampon)
        tampon.seek(0)
        f = TTFont(tampon)
    return f


def _trace(font: TTFont, code: int) -> list:
    gs = font.getGlyphSet()
    plume = DecomposingRecordingPen(gs)
    gs[font.getBestCmap()[code]].draw(plume)
    return plume.value


def signe_trace() -> list:
    """L'omega de Plex, pieds allonges · le seul ecart au dessin d'origine."""
    brut = _trace(_fonte('ibm-plex-sans-greek-600-normal.woff2'), 0x03A9)
    BORD_G, BORD_D = 52.0, 669.0      # bords exterieurs des pieds, dans la lettre

    def deplacer(p):
        x, y = p
        if abs(x - BORD_G) < 0.5:
            x -= ALLONGE
        elif abs(x - BORD_D) < 0.5:
            x += ALLONGE
        return (x, y)

    return [(op, tuple(deplacer(p) for p in args)) for op, args in brut]


def mot_traces() -> tuple[list, float]:
    """Les six lettres du logotype, deja decalees, plus la chasse totale."""
    font = _fonte('ibm-plex-sans-latin-600-normal.woff2')
    cmap, hmtx = font.getBestCmap(), font['hmtx']
    delta = APPROCHE / 1000 * EM
    sortie, x = [], 0.0
    for lettre in MOT:
        trace = _trace(font, ord(lettre))
        sortie.append([(op, tuple((px + x, py) for px, py in args)) for op, args in trace])
        x += hmtx[cmap[ord(lettre)]][0] + delta
    return sortie, x - delta


# ---------------------------------------------------------------------------
# TRANSFORMATIONS ET MESURES
# ---------------------------------------------------------------------------

def transformer(trace: list, echelle: float = 1.0, dx: float = 0.0, dy: float = 0.0,
                miroir_y: bool = False) -> list:
    def f(p):
        x, y = p[0] * echelle + dx, p[1] * echelle + dy
        return (x, -y) if miroir_y else (x, y)
    return [(op, tuple(f(p) for p in args)) for op, args in trace]


def contours(trace: list, pas: int = 24) -> list:
    """Aplatit un trace en polylignes · sert aux mesures et au matriciel."""
    cs, c, cur = [], [], (0.0, 0.0)
    for op, args in trace:
        if op == 'moveTo':
            if len(c) > 2:
                cs.append(c)
            c, cur = [args[0]], args[0]
        elif op == 'lineTo':
            c.append(args[0])
            cur = args[0]
        elif op == 'qCurveTo':
            pts = list(args)
            fin, ctrl = pts[-1], pts[:-1]
            p0 = cur
            for i, q in enumerate(ctrl):
                p2 = fin if i + 1 == len(ctrl) else (
                    (q[0] + ctrl[i + 1][0]) / 2, (q[1] + ctrl[i + 1][1]) / 2)
                for k in range(1, pas + 1):
                    t = k / pas
                    u = 1 - t
                    c.append((u * u * p0[0] + 2 * u * t * q[0] + t * t * p2[0],
                              u * u * p0[1] + 2 * u * t * q[1] + t * t * p2[1]))
                p0 = p2
            cur = fin
        elif op == 'curveTo':
            p1, p2, p3 = args
            p0 = cur
            for k in range(1, pas + 1):
                t = k / pas
                u = 1 - t
                c.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                          u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
            cur = p3
        elif op in ('closePath', 'endPath'):
            if len(c) > 2:
                cs.append(c)
            c = []
    if len(c) > 2:
        cs.append(c)
    return cs


def bornes(traces: list) -> tuple[float, float, float, float]:
    """Le rectangle englobant reel · calcule sur les courbes aplaties, jamais
    sur les points de controle, qui debordent toujours de la courbe."""
    pts = [p for t in traces for c in contours(t) for p in c]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


# ---------------------------------------------------------------------------
# LES TROIS COMPOSITIONS FIGEES
# ---------------------------------------------------------------------------

def signe_pose() -> list:
    """Le signe seul, cale sur (0, 0) en bas a gauche, repere SVG (y descend)."""
    t = signe_trace()
    x0, y0, _, y1 = bornes([t])
    return transformer(t, 1.0, -x0, -y1, miroir_y=True)


def bloc_horizontal() -> list:
    """Signe et mot alignes sur la ligne de pied · la composition principale.

    Deux decisions, et chacune se voit si on l'ignore :
     · le signe est aligne sur la LIGNE DE PIED du mot. Ses pieds SONT une
       ligne de pied ; les poser ailleurs ferait flotter la marque.
     · le signe monte a 1,12 fois la hauteur de capitale. A 1,00 il se lit
       comme une septieme lettre ; a 1,25 il ecrase le mot."""
    s = signe_trace()
    sx0, sy0, sx1, sy1 = bornes([s])
    k = (CAP * ECHELLE_SIGNE) / (sy1 - sy0)
    signe = transformer(s, k, -sx0 * k, 0.0)
    decalage = (sx1 - sx0) * k + ECART_BLOC * CAP
    mot, _ = mot_traces()
    return [transformer(t, 1.0, decalage, 0.0) for t in mot] + [signe]


def logotype() -> list:
    """Le mot seul, cale a l'origine · la declinaison des espaces etroits."""
    mot, _ = mot_traces()
    x0, _, _, _ = bornes(mot)
    return [transformer(t, 1.0, -x0, 0.0) for t in mot]


def bloc_vertical() -> list:
    """Signe au-dessus du mot, tous deux centres · pour les formats etroits."""
    s = signe_trace()
    sx0, sy0, sx1, sy1 = bornes([s])
    k = (CAP * ECHELLE_SIGNE_VERTICAL) / (sy1 - sy0)
    larg_signe = (sx1 - sx0) * k
    mot, _ = mot_traces()
    mx0, _, mx1, _ = bornes(mot)
    larg_mot = mx1 - mx0
    centre = max(larg_signe, larg_mot) / 2
    signe = transformer(s, k, centre - larg_signe / 2 - sx0 * k, CAP + ECART_VERTICAL * CAP)
    return [transformer(t, 1.0, centre - larg_mot / 2 - mx0, 0.0) for t in mot] + [signe]


# ---------------------------------------------------------------------------
# RENDU SVG · les traces convertis en `d`, dans le repere SVG (y descend).
# ---------------------------------------------------------------------------

def chemin_svg(trace: list, dy: float) -> str:
    """`d` d'un trace, retourne verticalement autour de dy."""
    def n(v):
        return f'{v:.1f}'.rstrip('0').rstrip('.')

    out = []
    for op, args in trace:
        pts = [(p[0], dy - p[1]) for p in args]
        if op == 'moveTo':
            out.append(f'M{n(pts[0][0])} {n(pts[0][1])}')
        elif op == 'lineTo':
            out.append(f'L{n(pts[0][0])} {n(pts[0][1])}')
        elif op == 'qCurveTo':
            fin, ctrl = pts[-1], pts[:-1]
            for i, q in enumerate(ctrl):
                p2 = fin if i + 1 == len(ctrl) else (
                    (q[0] + ctrl[i + 1][0]) / 2, (q[1] + ctrl[i + 1][1]) / 2)
                out.append(f'Q{n(q[0])} {n(q[1])} {n(p2[0])} {n(p2[1])}')
        elif op == 'curveTo':
            a, b, c = pts
            out.append(f'C{n(a[0])} {n(a[1])} {n(b[0])} {n(b[1])} {n(c[0])} {n(c[1])}')
        elif op in ('closePath', 'endPath'):
            out.append('Z')
    return ''.join(out)


def svg(traces: list, couleur: str, titre: str, marge: float = 0.0) -> str:
    x0, y0, x1, y1 = bornes(traces)
    x0 -= marge
    x1 += marge
    y0 -= marge
    y1 += marge
    d = ''.join(chemin_svg(t, y1) for t in traces)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="{x0:.1f} 0 {x1 - x0:.1f} {y1 - y0:.1f}" '
            f'role="img" aria-label="{titre}">'
            f'<path d="{d}" fill="{couleur}" fill-rule="nonzero"/></svg>')


def svg_icone(masquable: bool = False) -> str:
    """Le signe en reserve dans un carre a coins arrondis."""
    cote = 1000.0
    marge = MARGE_MASQUABLE if masquable else MARGE_ICONE
    s = signe_trace()
    x0, y0, x1, y1 = bornes([s])
    dispo = cote * (1 - 2 * marge)
    k = min(dispo / (x1 - x0), dispo / (y1 - y0))
    # On amene le signe dans un repere 0..1000 Y VERS LE HAUT, centre, puis on
    # retourne autour de y = 1000 · le repere SVG descend. Composer les deux en
    # une seule expression, comme la premiere version le faisait, place le
    # signe hors du carre : le retournement doit se faire APRES le centrage.
    place = transformer(s, k, (cote - (x1 - x0) * k) / 2 - x0 * k,
                        (cote - (y1 - y0) * k) / 2 - y0 * k)
    d = chemin_svg(place, cote)
    r = 0 if masquable else RAYON_ICONE * cote
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" '
            f'role="img" aria-label="OmegaX">'
            f'<rect width="1000" height="1000" rx="{r:.0f}" fill="{ENCRE_HEX}"/>'
            f'<path d="{d}" fill="#ffffff" fill-rule="nonzero"/></svg>')


# ---------------------------------------------------------------------------
# RENDU MATRICIEL · PNG ecrits a la main, sans dependance d'encodage.
# ---------------------------------------------------------------------------

def _png(chemin: Path, largeur: int, hauteur: int, pixels: bytes) -> None:
    def bloc(nom: bytes, donnees: bytes) -> bytes:
        return (struct.pack('>I', len(donnees)) + nom + donnees
                + struct.pack('>I', zlib.crc32(nom + donnees) & 0xFFFFFFFF))

    lignes = b''.join(b'\x00' + pixels[y * largeur * 3:(y + 1) * largeur * 3]
                      for y in range(hauteur))
    chemin.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + bloc(b'IHDR', struct.pack('>IIBBBBB', largeur, hauteur, 8, 2, 0, 0, 0))
        + bloc(b'IDAT', zlib.compress(lignes, 9))
        + bloc(b'IEND', b''))


def _masque(traces: list, boite: tuple, taille: int, ss: int = 4):
    """Un masque de couverture, par la regle NON NULLE approchee : les contours
    d'un sens font la matiere, ceux du sens inverse la creusent. Deux traits
    qui se croisent s'unissent, la ou le pair-impair les annulerait."""
    from PIL import Image, ImageChops, ImageDraw
    x0, y0, x1, y1 = boite
    k = taille / max(x1 - x0, y1 - y0)
    W = H = taille * ss
    plein = Image.new('L', (W, H), 0)
    creux = Image.new('L', (W, H), 0)
    for t in traces:
        for c in contours(t):
            pts = [((px - x0) * k * ss, (y1 - py) * k * ss) for px, py in c]
            aire = sum(pts[i][0] * pts[(i + 1) % len(pts)][1]
                       - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
            un = Image.new('L', (W, H), 0)
            ImageDraw.Draw(un).polygon(pts, fill=255)
            if aire >= 0:
                plein = ImageChops.lighter(plein, un)
            else:
                creux = ImageChops.lighter(creux, un)
    return ImageChops.subtract(plein, creux).resize((taille, taille), Image.LANCZOS)


def png_icone(chemin: Path, taille: int, masquable: bool = False) -> None:
    from PIL import Image, ImageDraw
    marge = MARGE_MASQUABLE if masquable else MARGE_ICONE
    s = signe_trace()
    x0, y0, x1, y1 = bornes([s])
    cote = max(x1 - x0, y1 - y0) / (1 - 2 * marge)
    boite = ((x0 + x1) / 2 - cote / 2, (y0 + y1) / 2 - cote / 2,
             (x0 + x1) / 2 + cote / 2, (y0 + y1) / 2 + cote / 2)
    masque = _masque([s], boite, taille)
    fond = Image.new('RGB', (taille, taille), ENCRE_RVB)
    if not masquable:
        coins = Image.new('L', (taille * 4, taille * 4), 0)
        ImageDraw.Draw(coins).rounded_rectangle(
            [0, 0, taille * 4 - 1, taille * 4 - 1], radius=int(RAYON_ICONE * taille * 4), fill=255)
        coins = coins.resize((taille, taille), Image.LANCZOS)
        blanc = Image.new('RGB', (taille, taille), (255, 255, 255))
        fond = Image.composite(fond, blanc, coins)
    image = Image.composite(Image.new('RGB', (taille, taille), (255, 255, 255)), fond, masque)
    _png(chemin, taille, taille, image.tobytes())


# ---------------------------------------------------------------------------
# LA GEOMETRIE POUR L'INTERFACE
# ---------------------------------------------------------------------------

def geometrie_ts() -> str:
    signe = signe_pose()
    sx0, sy0, sx1, sy1 = bornes([signe])
    bloc = bloc_horizontal()
    bx0, by0, bx1, by1 = bornes(bloc)
    vert = bloc_vertical()
    vx0, vy0, vx1, vy1 = bornes(vert)

    def paquet(traces, boite):
        x0, y0, x1, y1 = boite
        return (''.join(chemin_svg(t, y1) for t in traces),
                f'{x0:.1f} 0 {x1 - x0:.1f} {y1 - y0:.1f}')

    d_signe, vb_signe = paquet([signe_trace()], bornes([signe_trace()]))
    d_bloc, vb_bloc = paquet(bloc, (bx0, by0, bx1, by1))
    d_vert, vb_vert = paquet(vert, (vx0, vy0, vx1, vy1))
    lg = logotype()
    d_mot, vb_mot = paquet(lg, bornes(lg))
    return f'''// ENGENDRE PAR scripts/engendrer-marque.py · NE PAS MODIFIER A LA MAIN.
//
// Le signe et le logotype sont figes en COURBES : une marque qui dependrait
// d'une police installee sur le poste du lecteur changerait de dessin d'un
// poste a l'autre. Les tracer ici les rend identiques partout, et nets a
// toute taille.
//
// Pour les regenerer : pip install fonttools brotli pillow
//                      python3 scripts/engendrer-marque.py

/** Le signe seul · l'omega recoupe. */
export const SIGNE = '{d_signe}';
export const SIGNE_BOITE = '{vb_signe}';

/** Le bloc horizontal · signe et mot sur la meme ligne de pied. */
export const BLOC = '{d_bloc}';
export const BLOC_BOITE = '{vb_bloc}';

/** Le bloc vertical · signe au-dessus du mot, tous deux centres. */
export const BLOC_VERTICAL = '{d_vert}';
export const BLOC_VERTICAL_BOITE = '{vb_vert}';

/** Le logotype seul · le mot, sans le signe. */
export const LOGOTYPE = '{d_mot}';
export const LOGOTYPE_BOITE = '{vb_mot}';

/** Le bleu de la marque. Contraste 12,74:1 sur blanc · AAA dans les deux sens. */
export const ENCRE = '{ENCRE_HEX}';

/** Rayon des coins de l'icone, en part du cote. */
export const RAYON_ICONE = {RAYON_ICONE};

/** Air de respiration minimal autour de la marque, en part de sa hauteur.
 *  Rien ne penetre ce rectangle · ni texte, ni filet, ni bord de page. */
export const AIR = 0.5;
'''


# ---------------------------------------------------------------------------

def main() -> None:
    import sys

    # `--geometrie-seule` · le fichier TS s'ecrit instantanement, la
    # rasterisation des icones suréchantillonne 1024 x 1024 x 16 points et
    # dépasse le délai d'un test. Le test de non-régression n'a besoin que du
    # premier.
    geometrie_seule = '--geometrie-seule' in sys.argv

    PUBLIC.mkdir(parents=True, exist_ok=True)

    bloc = bloc_horizontal()
    vert = bloc_vertical()
    signe = [signe_trace()]

    fichiers = {
        'logo-omegax.svg': svg(bloc, ENCRE_HEX, 'OmegaX'),
        'logo-omegax-blanc.svg': svg(bloc, '#ffffff', 'OmegaX'),
        'logo-omegax-noir.svg': svg(bloc, '#000000', 'OmegaX'),
        'logo-omegax-courant.svg': svg(bloc, 'currentColor', 'OmegaX'),
        'logo-omegax-vertical.svg': svg(vert, ENCRE_HEX, 'OmegaX'),
        'logo-omegax-mot.svg': svg(logotype(), ENCRE_HEX, 'OmegaX'),
        'logo-omegax-mot-courant.svg': svg(logotype(), 'currentColor', 'OmegaX'),
        'logo-omegax-signe.svg': svg(signe, ENCRE_HEX, 'OmegaX'),
        'logo-omegax-signe-blanc.svg': svg(signe, '#ffffff', 'OmegaX'),
        'logo-omegax-signe-courant.svg': svg(signe, 'currentColor', 'OmegaX'),
        'icone.svg': svg_icone(),
    }
    GEOMETRIE_TS.write_text(geometrie_ts(), encoding='utf-8')
    if geometrie_seule:
        return

    for nom, contenu in fichiers.items():
        (PUBLIC / nom).write_text(contenu, encoding='utf-8')

    png_icone(PUBLIC / 'icone-192.png', 192)
    png_icone(PUBLIC / 'icone-512.png', 512)
    png_icone(PUBLIC / 'icone-maskable-512.png', 512, masquable=True)
    png_icone(PUBLIC / 'avatar-omegax-1024.png', 1024)

    for nom in list(fichiers) + ['icone-192.png', 'icone-512.png',
                                 'icone-maskable-512.png', 'avatar-omegax-1024.png']:
        chemin = PUBLIC / nom
        print(f'  {nom:34s} {chemin.stat().st_size / 1024:6.1f} ko')
    print(f'  {GEOMETRIE_TS.name:34s} '
          f'{GEOMETRIE_TS.stat().st_size / 1024:6.1f} ko')


if __name__ == '__main__':
    main()
