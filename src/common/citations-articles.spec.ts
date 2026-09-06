/**
 * BALAYAGE DES CITATIONS D'ARTICLES · le contrôle né de l'audit du 6 septembre
 * 2026 (docs/audit-citations-2026-09-06.md).
 *
 * Ce que ce test ferme n'est PAS une erreur de calcul · aucune des citations
 * auditées ne portait un chiffre faux. C'est la classe de défaut d'à côté, et
 * elle est plus difficile à voir : un article cité SOUS LE MAUVAIS TEXTE, ou
 * cité sans texte du tout. Le montant reste juste, l'écran reste crédible, et
 * le relecteur envoyé vérifier lit un article qui parle d'autre chose.
 *
 * TROIS DÉFAUTS RÉELS l'ont motivé, tous trouvés dans le même audit :
 *
 *  · « L'article 138 nomme le gérant… » suivi de « (AUDCIF art. 19) » dans le
 *    MÊME message · l'art. 138 est celui de l'AUSCGIE, et l'AUDCIF s'arrête à
 *    113. La lecture naturelle attribuait le 138 à l'AUDCIF ;
 *  · « c'est ce qui la définit (SYCEBNL, art. premier) » · l'art. premier
 *    institue le système comptable, c'est l'art. 2 qui définit l'EBNL ;
 *  · « sanctionné par l'article 19, c'est-à-dire par la dissolution » · le
 *    renvoi était exact (l'art. 4, e le porte) mais l'art. 19 organise la
 *    dissolution VOLONTAIRE, la dissolution-sanction étant à l'art. 20.
 *
 * LE CONTRÔLE PORTE SUR LA PLAGE, parce que c'est la seule chose qu'une
 * machine peut vérifier sans lire le droit : un corpus a un dernier article,
 * et un numéro au-delà trahit un rattachement fautif. Les bornes sont LUES
 * dans les compétences, jamais estimées.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

/**
 * Dernier article de chaque corpus. Relevé dans les compétences installées,
 * pas de mémoire · une borne trop haute rendrait le test aveugle, une borne
 * trop basse le rendrait bruyant.
 */
const DERNIER_ARTICLE: Record<string, number> = {
  AUDCIF: 113,
  SYCEBNL: 28,
  AUSCGIE: 920,
  AUSCOOP: 397,
  AUDCG: 307,
};

/**
 * PORTÉE EXACTE DU BALAYAGE, et elle est étroite · le dire plutôt que de
 * laisser croire à une garantie générale.
 *
 * Trois familles de lignes sont HORS périmètre, parce que le rattachement s'y
 * lit à la phrase et non au motif, et que les compter ferait crier le test sur
 * le code le plus rigoureux du dépôt :
 *
 *  · DEUX corpus nommés · « l'art. 3 du SYCEBNL exclut les art. 73 à 113 de
 *    l'AUDCIF » oppose volontairement un texte à l'autre ;
 *  · une LOI NUMÉROTÉE nommée à côté · « loi n° 23/053 art. 141, 1° · AUDCIF
 *    art. 17, 1° » cite deux textes, dont un seul porte un sigle ;
 *  · un marqueur d'EXCLUSION · « écarté », « exclu », « n'écarte pas » ·
 *    l'article y est nommé pour dire qu'il ne s'applique PAS.
 *
 * Reste couvert : l'article cité sous un sigle unique, sans autre texte à
 * proximité · c'est-à-dire le cas où rien, dans la ligne, ne rattrape un
 * rattachement fautif. Les deux tests ciblés qui suivent ferment le reste des
 * défauts trouvés par l'audit, un par un et par leur libellé.
 */
const HORS_PERIMETRE = /n°\s?\d{2,3}[/-]\d{3,4}|écart[ée]|exclu|n'écarte pas|liste d'exclusion/i;
const CORPUS = Object.keys(DERNIER_ARTICLE);

function lignesDuDepot(): { fichier: string; no: number; texte: string }[] {
  const sortie = execSync(
    "grep -rn --include=*.ts --include=*.tsx --include=*.prisma " +
      "-E '(AUDCIF|SYCEBNL|AUSCGIE|AUSCOOP|AUDCG)' src client/src prisma || true",
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return sortie
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:]+):(\d+):(.*)$/s);
      return m ? { fichier: m[1], no: Number(m[2]), texte: m[3] } : null;
    })
    .filter((x): x is { fichier: string; no: number; texte: string } => x !== null);
}

describe('Citations d’articles · le corpus nommé porte-t-il l’article cité ?', () => {
  it('aucun article cité ne dépasse le dernier article de son corpus', () => {
    const fautifs: string[] = [];
    const cache = new Map<string, string[]>();
    /**
     * LE CONTEXTE COMPTE, parce qu'un humain lit avec lui · une citation
     * s'étale souvent sur trois lignes (« l'AUSCGIE art. 6, le GIE (art. 869),
     * la société coopérative (AUSCOOP) »), et juger la ligne seule ferait
     * signaler six passages parfaitement corrects. La fenêtre est étroite :
     * quatre lignes de part et d'autre, soit le paragraphe de commentaire ou
     * la phrase, jamais le fichier entier.
     */
    const voisinage = (fichier: string, no: number): string => {
      if (!cache.has(fichier)) cache.set(fichier, readFileSync(fichier, 'utf8').split('\n'));
      const l = cache.get(fichier)!;
      return l.slice(Math.max(0, no - 5), no + 4).join(' ');
    };
    for (const { fichier, no, texte } of lignesDuDepot()) {
      const presents = CORPUS.filter((c) => new RegExp(`\\b${c}\\b`).test(texte));
      // Deux corpus sur la ligne : c'est une opposition volontaire, pas un
      // rattachement. Le fichier de ce test en est lui-même plein.
      if (presents.length !== 1) continue;
      if (HORS_PERIMETRE.test(texte)) continue;
      if (fichier.endsWith('citations-articles.spec.ts')) continue;
      const autour = voisinage(fichier, no);
      if (CORPUS.filter((c) => new RegExp(`\\b${c}\\b`).test(autour)).length > 1) continue;
      if (HORS_PERIMETRE.test(autour)) continue;
      const corpus = presents[0];
      const articles = [...texte.matchAll(/\bart(?:icles?)?\.?\s*(\d+)/gi)].map((m) => Number(m[1]));
      for (const a of articles) {
        if (a > DERNIER_ARTICLE[corpus]) {
          fautifs.push(`${fichier}:${no} · « ${corpus} art. ${a} » (ce corpus s’arrête à ${DERNIER_ARTICLE[corpus]})`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('la définition de l’entité à but non lucratif renvoie à l’art. 2, jamais à l’art. premier', () => {
    // L'art. premier du SYCEBNL institue le système comptable ; c'est l'art. 2
    // qui définit l'EBNL par son « but désintéressé ».
    const texte = readFileSync('src/modules/affectation/regles-affectation.ts', 'utf8');
    expect(texte).toContain('but désintéressé');
    expect(texte).toContain('SYCEBNL, art. 2');
    expect(texte).not.toContain('c’est ce qui la définit (SYCEBNL, art. premier)');
  });

  it('le renvoi de l’art. 4, e) de la loi 004/2001 porte sa réserve, et ne conclut pas à la sanction', () => {
    // Le texte officiel renvoie bien à l'art. 19, mais celui-ci organise la
    // dissolution VOLONTAIRE. Reproduire le renvoi sans dire cela faisait dire
    // au logiciel ce que la loi n'écrit pas.
    const texte = readFileSync('src/modules/exercice/planning-cloture.ts', 'utf8');
    expect(texte).toContain('sous peine d’application de l’article 19');
    expect(texte).toContain('dissolution VOLONTAIRE');
    expect(texte).toContain('c’est l’article 20 qui porte la dissolution JUDICIAIRE');
    expect(texte).not.toContain('sanctionné par l’article 19, c’est-à-dire par la dissolution');
  });
});
