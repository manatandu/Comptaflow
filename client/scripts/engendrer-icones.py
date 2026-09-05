#!/usr/bin/env python3
"""
ENGENDRE LES ICÔNES DE LA PWA · public/icone-192.png, icone-512.png,
icone-maskable-512.png et icone.svg.

Pourquoi un script plutôt que quatre fichiers binaires posés une fois : une
icône est la seule ressource du dépôt qu'on ne peut ni relire ni corriger dans
un éditeur de texte. Le script la rend REPRODUCTIBLE · changer la couleur de
marque, c'est changer une constante ici et relancer, pas redessiner à la main.

Aucune dépendance : l'encodeur PNG tient en vingt lignes de zlib et struct.
Ajouter Pillow au dépôt pour quatre carrés de couleur ne se justifiait pas.

    python3 scripts/engendrer-icones.py

CONTRAINTE DES ICÔNES « MASKABLE » : le système d'exploitation découpe l'icône
selon sa propre forme (cercle, goutte, carré arrondi). Le fond doit donc être à
FOND PERDU, et le dessin tenir dans la zone sûre · le cercle central de 80 % du
côté. Un logo qui touche les bords se fait rogner sur Android, et c'est le
défaut le plus courant des PWA installables.
"""

import struct
import zlib
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent / 'public'

# Bleu d'encre de la charte · --a-600 de src/index.css.
FOND = (0x23, 0x59, 0xC4)
TRAIT = (0xFF, 0xFF, 0xFF)


def png(chemin: Path, taille: int, pixel) -> None:
    """Écrit un PNG RVB sans compression perceptible de qualité, filtre 0."""
    lignes = bytearray()
    for y in range(taille):
        lignes.append(0)  # type de filtre « None » pour cette ligne
        for x in range(taille):
            lignes.extend(pixel(x, y, taille))

    def bloc(nom: bytes, donnees: bytes) -> bytes:
        return (
            struct.pack('>I', len(donnees))
            + nom
            + donnees
            + struct.pack('>I', zlib.crc32(nom + donnees) & 0xFFFFFFFF)
        )

    entete = struct.pack('>2I5B', taille, taille, 8, 2, 0, 0, 0)
    chemin.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + bloc(b'IHDR', entete)
        + bloc(b'IDAT', zlib.compress(bytes(lignes), 9))
        + bloc(b'IEND', b'')
    )


def omega(x: int, y: int, taille: int, echelle: float):
    """
    Un oméga blanc sur fond bleu · l'anneau ouvert par le bas, plus ses deux
    pieds. `echelle` règle la part du carré qu'occupe le dessin : 0.62 pour
    l'icône ordinaire, 0.50 pour la version maskable, dont le dessin doit
    tenir dans la zone sûre.
    """
    c = taille / 2
    r_ext = taille * echelle / 2
    epaisseur = r_ext * 0.30
    r_int = r_ext - epaisseur

    dx = x - c
    # L'anneau est remonté d'un dixième de rayon · les pieds occupent le bas,
    # et un oméga centré géométriquement paraît tomber.
    dy = y - (c - r_ext * 0.12)
    d = (dx * dx + dy * dy) ** 0.5

    # LE RACCORD SE CALCULE, IL NE SE CHOISIT PAS. Sous la ligne d'ouverture,
    # l'anneau n'est plus dessiné du tout : seuls les pieds peignent. Leur bord
    # intérieur doit donc tomber EXACTEMENT sur le bord intérieur de l'anneau à
    # la hauteur de cette ligne, sinon il reste entre les deux une bande que ni
    # l'un ni l'autre ne couvre · c'est elle qui se voyait comme une encoche
    # sombre au coin de chaque pied.
    hauteur_ouverture = r_int * 0.55
    bord_interieur_pied = (r_int * r_int - hauteur_ouverture * hauteur_ouverture) ** 0.5

    haut_pied = c - r_ext * 0.12 + hauteur_ouverture
    bas_pied = haut_pied + epaisseur

    if dy <= hauteur_ouverture:
        return TRAIT if r_int <= d <= r_ext else FOND

    sur_pied = haut_pied <= y <= bas_pied and bord_interieur_pied <= abs(dx) <= r_ext
    # Entre la ligne d'ouverture et le haut des pieds, les deux montants de
    # l'anneau se prolongent tels quels · sans eux l'oméga serait coupé net.
    entre_deux = y < haut_pied and r_int <= d <= r_ext

    return TRAIT if sur_pied or entre_deux else FOND


def main() -> None:
    RACINE.mkdir(parents=True, exist_ok=True)
    for nom, taille, echelle in [
        ('icone-192.png', 192, 0.62),
        ('icone-512.png', 512, 0.62),
        # Zone sûre des icônes maskable · le dessin tient dans les 80 %
        # centraux, avec de la marge.
        ('icone-maskable-512.png', 512, 0.50),
    ]:
        png(RACINE / nom, taille, lambda x, y, t, e=echelle: omega(x, y, t, e))
        print('écrit', nom)

    # La favicon, en SVG · nette à toute taille, et c'est le seul format que
    # l'onglet du navigateur redimensionne sans bavure.
    (RACINE / 'icone.svg').write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" fill="#{FOND[0]:02x}{FOND[1]:02x}{FOND[2]:02x}"/>'
        '<path d="M32 12c-8.8 0-16 7-16 15.6 0 5.6 3 10.5 7.6 13.3H16v6h16v-6h-1.4'
        'c-5.4-1.6-9.2-6.4-9.2-12 0-6.9 5.6-12.5 12.6-12.5s12.6 5.6 12.6 12.5'
        'c0 5.6-3.8 10.4-9.2 12H36v6h16v-6h-7.6C48.9 38.1 52 33.2 52 27.6'
        'C52 19 44.8 12 36 12z" fill="#ffffff" transform="translate(-4 0)"/>'
        '</svg>\n',
        encoding='utf-8',
    )
    print('écrit icone.svg')


if __name__ == '__main__':
    main()
