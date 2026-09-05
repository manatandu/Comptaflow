#!/usr/bin/env python3
"""
LA MARQUE OMEGAX · une seule géométrie, tous les formats.

Ce script est la SOURCE unique du logo. Il produit le symbole en SVG (tracés
vectoriels, nets à toute taille) et les icônes PNG de la PWA, depuis les mêmes
constantes. Deux fichiers dessinés séparément divergent toujours, et c'est le
genre d'écart qu'on ne voit qu'une fois la marque imprimée.

    python3 scripts/engendrer-marque.py

## LE PARTI, ET POURQUOI CE N'EST PAS UN OMÉGA DÉCORATIF

OmegaX tient la comptabilité d'entités qui rendent des comptes. La marque dit
donc ce que fait le logiciel, pas ce que veut dire son nom.

L'oméga est la dernière lettre : en comptabilité, c'est la CLÔTURE. Sa forme
naturelle est une arche posée sur deux pieds, et en partie double ces deux
pieds sont le DÉBIT et le CRÉDIT. L'arche est l'équilibre qui les referme.

D'où les trois éléments, et rien d'autre :

  · une arche d'épaisseur constante, tracée au compas · la précision, qui est
    la seule vertu qu'un comptable demande à un outil ;
  · deux pieds qui s'écartent vers l'extérieur · les deux colonnes ;
  · entre eux, un VIDE calibré · la ligne de partage du journal. Il ne s'agit
    pas d'un espace résiduel : sa largeur est posée, et c'est lui qui fait
    lire les deux pieds comme deux colonnes plutôt que comme deux pattes.

## CE QUE LE DESSIN DOIT SUPPORTER

Une marque de logiciel professionnel n'a pas le droit de tomber dans trois
situations, et chacune a commandé une décision ici :

  · **16 px** (l'onglet du navigateur) · d'où une épaisseur de trait à 13 % du
    côté. En dessous de 10 %, l'oméga se referme en tache à cette taille ;
  · **une seule couleur** (télécopie, tampon, gravure, impression d'un état) ·
    d'où la variante monochrome, où les deux tons se fondent sans rien perdre
    de la forme ;
  · **le masque d'Android** (icône « maskable ») · d'où une variante dont le
    dessin tient dans les 80 % centraux, le système rognant le reste.

## LE MOT « OMEGAX » N'EST PAS DESSINÉ ICI, ET C'EST DÉLIBÉRÉ

Un logotype se trace en courbes, jamais en texte : une police absente du poste
du lecteur ferait rendre la marque dans une autre. Mais tracer six lettres à la
main sans fonderie ni outil de vectorisation donne des lettres approximatives,
et une marque à lettres approximatives est pire qu'une marque sans lettres.

Le parti retenu est celui de beaucoup d'éditeurs : le SYMBOLE est vectoriel et
figé ici ; le MOT est composé par l'interface, en texte véritable
(`components/chrome/Logo.tsx`), avec sa graisse et son interlettrage posés. Il
reste sélectionnable, lisible par un lecteur d'écran, et net sur tout écran.
"""

import struct
import zlib
from math import cos, radians, sin
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent / 'public'

# ---------------------------------------------------------------------------
# GÉOMÉTRIE · repère de 64 unités, celui du viewBox.
# ---------------------------------------------------------------------------

COTE = 64.0
# Le centre de l'arche est DESCENDU pour que la marque entière soit centrée
# dans le carré · calé sur le centre géométrique de l'arche seule, le signe
# paraissait tomber, les pieds mangeant tout le bas.
CX, CY = 32.0, 32.2          # centre de l'arche
RAYON = 16.8                 # rayon de la ligne MOYENNE de l'arche
TRAIT = 8.4                  # épaisseur · 13,1 % du côté, lisible à 16 px

# Ouverture de l'arche, en degrés, mesurée depuis l'axe horizontal, sens
# trigonométrique. L'arche court de -60° à 240° : il reste 60° d'ouverture en
# bas, juste assez pour que les deux pieds s'y logent sans que la forme cesse
# de se lire comme un oméga.
ANGLE_DEBUT, ANGLE_FIN = -55.0, 235.0

# Les pieds sont des BARRES à extrémités franches, l'arche un trait à bouts
# ronds. Ce n'est pas une inconséquence : les bouts ronds de l'arche
# disparaissent sous les pieds, tandis que les arêtes vives des pieds donnent
# au vide central deux bords nets. C'est ce vide qui porte le sens, et un vide
# aux bords arrondis se lit comme un intervalle, pas comme une ligne de
# partage.
PIED_TRAIT = 9.2             # les pieds portent, ils sont un peu plus épais
PIED_CY = 48.2               # axe des pieds
# Le bord INTÉRIEUR du pied tombe sous l'extrémité de l'arche · c'est ce qui
# fait tourner la jambe vers l'extérieur au lieu de la poser sur un socle.
PIED_ECART = 5.2             # demi-largeur du VIDE central · la ligne de partage
PIED_DEMI = 9.9              # demi-longueur d'un pied · l'empattement assied la lettre

# Le pied intérieur commence au bord du vide, l'extérieur s'en écarte.
PIED_INT = PIED_ECART
PIED_EXT = PIED_ECART + 2 * PIED_DEMI


def point(angle: float, rayon: float) -> tuple[float, float]:
    """Un point de l'arche · l'axe des y descend, comme en SVG."""
    return CX + rayon * cos(radians(angle)), CY - rayon * sin(radians(angle))


# ---------------------------------------------------------------------------
# RENDU SVG
# ---------------------------------------------------------------------------

def arche_svg() -> str:
    x1, y1 = point(ANGLE_DEBUT, RAYON)
    x2, y2 = point(ANGLE_FIN, RAYON)
    # `large-arc-flag` à 1 · l'arche couvre 300°, donc plus d'un demi-tour.
    # `sweep-flag` à 0 · sens trigonométrique, celui du calcul ci-dessus.
    return (
        f'<path d="M {x1:.2f} {y1:.2f} A {RAYON:.2f} {RAYON:.2f} 0 1 0 {x2:.2f} {y2:.2f}" '
        f'fill="none" stroke-width="{TRAIT:.2f}" stroke-linecap="round"'
    )


def pied_svg(signe: int) -> str:
    """Un pied · une barre à arêtes vives, pas un segment à bouts ronds."""
    x = CX + (PIED_INT if signe > 0 else -PIED_EXT)
    return (
        f'<rect x="{x:.2f}" y="{PIED_CY - PIED_TRAIT / 2:.2f}" '
        f'width="{PIED_EXT - PIED_INT:.2f}" height="{PIED_TRAIT:.2f}"'
    )


def symbole_svg(couleur_arche: str, couleur_pieds: str, fond: str | None) -> str:
    fond_svg = f'<rect width="64" height="64" rx="14" fill="{fond}"/>' if fond else ''
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" '
        'aria-label="OmegaX">'
        + fond_svg
        + f'<g stroke="{couleur_arche}">{arche_svg()}/></g>'
        + f'<g fill="{couleur_pieds}">{pied_svg(-1)}/>{pied_svg(1)}/></g>'
        + '</svg>\n'
    )


# ---------------------------------------------------------------------------
# RENDU PNG · même géométrie, résolue au pixel.
# ---------------------------------------------------------------------------

def dans_la_marque(ux: float, uy: float) -> str | None:
    """Rend 'arche', 'pieds' ou None · le dessin, en coordonnées du repère 64."""
    demi = TRAIT / 2
    dx, dy = ux - CX, CY - uy
    rayon = (dx * dx + dy * dy) ** 0.5
    if abs(rayon - RAYON) <= demi:
        # Dans l'anneau · reste à savoir si l'angle tombe dans l'arche.
        from math import atan2, degrees
        angle = degrees(atan2(dy, dx))
        if angle < ANGLE_DEBUT:
            angle += 360.0
        if ANGLE_DEBUT <= angle <= ANGLE_FIN:
            return 'arche'
    # Bouts arrondis de l'arche.
    for extremite in (ANGLE_DEBUT, ANGLE_FIN):
        ex, ey = point(extremite, RAYON)
        if ((ux - ex) ** 2 + (uy - ey) ** 2) ** 0.5 <= demi:
            return 'arche'
    if abs(uy - PIED_CY) <= PIED_TRAIT / 2:
        ecart = abs(ux - CX)
        if PIED_INT <= ecart <= PIED_EXT:
            return 'pieds'
    return None


def png(chemin: Path, taille: int, fond, arche, pieds, echelle: float, rayon_coin: float) -> None:
    """
    Écrit un PNG. `echelle` est la part du carré qu'occupe le dessin · 1.0 pour
    une icône ordinaire, 0.78 pour la version « maskable », dont le dessin doit
    tenir dans la zone sûre que le masque d'Android ne rogne pas.

    Chaque pixel est échantillonné 3 x 3 · sans cela, l'arche présente un
    escalier visible dès 192 px, et une icône crénelée se remarque au premier
    coup d'œil dans une barre de tâches.
    """
    marge = (1 - echelle) * taille / 2
    lignes = bytearray()
    for y in range(taille):
        lignes.append(0)
        for x in range(taille):
            compte = {'arche': 0, 'pieds': 0}
            for sy in range(3):
                for sx in range(3):
                    px = x + (sx + 0.5) / 3
                    py = y + (sy + 0.5) / 3
                    # Coin arrondi du carré de fond.
                    ux = (px - marge) / (echelle * taille) * COTE
                    uy = (py - marge) / (echelle * taille) * COTE
                    trait = dans_la_marque(ux, uy)
                    if trait:
                        compte[trait] += 1
            total = compte['arche'] + compte['pieds']
            if total == 0:
                lignes.extend(fond)
            else:
                # Un pixel partagé prend la couleur dominante, puis se fond
                # avec le fond au prorata · c'est ce qui donne le bord lisse.
                couleur = arche if compte['arche'] >= compte['pieds'] else pieds
                part = total / 9
                lignes.extend(
                    bytes(round(fond[i] + (couleur[i] - fond[i]) * part) for i in range(3))
                )
    _ = rayon_coin  # le masque du système arrondit lui-même les coins

    def bloc(nom: bytes, donnees: bytes) -> bytes:
        return (
            struct.pack('>I', len(donnees))
            + nom
            + donnees
            + struct.pack('>I', zlib.crc32(nom + donnees) & 0xFFFFFFFF)
        )

    chemin.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + bloc(b'IHDR', struct.pack('>2I5B', taille, taille, 8, 2, 0, 0, 0))
        + bloc(b'IDAT', zlib.compress(bytes(lignes), 9))
        + bloc(b'IEND', b'')
    )


# ---------------------------------------------------------------------------
# PALETTE · celle de l'interface (src/index.css), pas une seconde charte.
# ---------------------------------------------------------------------------

# UNE SEULE COULEUR POUR LE SIGNE. Un premier jet donnait aux pieds un ton
# plus clair, pour dire les deux colonnes : ils se détachaient en étagère sous
# l'arche, et la lettre cessait de se lire. Le sens passe par le VIDE central,
# qui ne coûte pas de seconde couleur et survit au tampon comme au télécopieur.
ENCRE = (0x14, 0x2F, 0x6B)      # bleu d'encre profond, fond du carré
BLANC = (0xFF, 0xFF, 0xFF)      # le signe, d'un seul tenant
CIEL = BLANC

HEX = lambda c: '#%02x%02x%02x' % c


def geometrie_ts() -> str:
    """
    La géométrie, en TypeScript · l'interface dessine le symbole en SVG EN
    LIGNE plutôt qu'en `<img>`, pour qu'il hérite de la couleur du texte et
    reste net au mode sombre comme à l'impression.

    Ce fichier est ENGENDRÉ. Le modifier à la main ferait diverger le symbole
    de l'interface de celui des icônes, et l'écart ne se verrait qu'une fois la
    marque imprimée · un spec le compare au script.
    """
    x1, y1 = point(ANGLE_DEBUT, RAYON)
    x2, y2 = point(ANGLE_FIN, RAYON)
    return (
        "// FICHIER ENGENDRÉ par client/scripts/engendrer-marque.py · ne pas modifier à la main.\n"
        "//\n"
        "// La géométrie de la marque OmegaX, partagée par l'interface et par les\n"
        "// icônes de la PWA. Deux dessins tenus séparément divergent toujours.\n"
        "\n"
        "export const MARQUE = {\n"
        "  /** Le repère du tracé · toutes les valeurs ci-dessous y sont exprimées. */\n"
        "  viewBox: '0 0 64 64',\n"
        "  /** L'arche · un trait d'épaisseur constante, à bouts ronds. */\n"
        f"  arche: 'M {x1:.2f} {y1:.2f} A {RAYON:.2f} {RAYON:.2f} 0 1 0 {x2:.2f} {y2:.2f}',\n"
        f"  archeTrait: {TRAIT:.2f},\n"
        "  /** Les deux pieds · des barres à arêtes vives, séparées par le vide central. */\n"
        "  pieds: [\n"
        f"    {{ x: {CX - PIED_EXT:.2f}, y: {PIED_CY - PIED_TRAIT / 2:.2f}, largeur: {PIED_EXT - PIED_INT:.2f}, hauteur: {PIED_TRAIT:.2f} }},\n"
        f"    {{ x: {CX + PIED_INT:.2f}, y: {PIED_CY - PIED_TRAIT / 2:.2f}, largeur: {PIED_EXT - PIED_INT:.2f}, hauteur: {PIED_TRAIT:.2f} }},\n"
        "  ],\n"
        "  /** Le carré d'encre, quand la marque est posée sur son fond. */\n"
        f"  encre: '{HEX(ENCRE)}',\n"
        "  /** Rayon des coins du carré, dans le même repère. */\n"
        "  rayonCarre: 14,\n"
        "} as const;\n"
    )


def main() -> None:
    import sys

    RACINE.mkdir(parents=True, exist_ok=True)
    (Path(__file__).resolve().parent.parent / 'src' / 'components' / 'chrome' / 'marque-geometrie.ts').write_text(
        geometrie_ts(), encoding='utf-8'
    )
    print('écrit src/components/chrome/marque-geometrie.ts')
    if '--geometrie-seule' in sys.argv:
        return

    # Le symbole sur son carré · usage courant.
    (RACINE / 'logo-omegax.svg').write_text(
        symbole_svg(HEX(BLANC), HEX(CIEL), HEX(ENCRE)), encoding='utf-8'
    )
    # Le symbole SEUL, à la couleur du texte · pour un en-tête, un document
    # imprimé, ou tout support où le carré ferait tache. `currentColor` le fait
    # suivre la couleur héritée, donc le mode sombre sans seconde version.
    (RACINE / 'logo-omegax-symbole.svg').write_text(
        symbole_svg('currentColor', 'currentColor', None), encoding='utf-8'
    )
    # Variante MONOCHROME sur fond · télécopie, tampon, gravure.
    (RACINE / 'logo-omegax-mono.svg').write_text(
        symbole_svg(HEX(BLANC), HEX(BLANC), HEX(ENCRE)), encoding='utf-8'
    )
    # La favicon reprend le symbole sur son carré.
    (RACINE / 'icone.svg').write_text(
        symbole_svg(HEX(BLANC), HEX(CIEL), HEX(ENCRE)), encoding='utf-8'
    )

    for nom, taille, echelle in [
        ('icone-192.png', 192, 0.80),
        ('icone-512.png', 512, 0.80),
        # Zone sûre du masque d'Android · le dessin tient dans les 80 %
        # centraux, avec de la marge.
        ('icone-maskable-512.png', 512, 0.62),
    ]:
        png(RACINE / nom, taille, ENCRE, BLANC, CIEL, echelle, 0.0)
        print('écrit', nom)
    print('écrit logo-omegax.svg, logo-omegax-symbole.svg, logo-omegax-mono.svg, icone.svg')


if __name__ == '__main__':
    main()
