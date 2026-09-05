import { analyserCsv, ecrireCsv, ecrireCelluleCsv, lireFichier, lireMontant } from './lecture-fichier';

/**
 * UN CSV SE RELIT D'UN SEUL TENANT, ET CE QU'ON ÉCRIT SE RELIT.
 *
 * `lireCsv` découpait le texte sur les retours à la ligne AVANT de traiter les
 * guillemets. Un champ protégé contenant un retour à la ligne · un libellé de
 * cotisation sur deux lignes, une adresse de tiers, une observation de
 * révision · était donc coupé en deux. L'écriture devenait deux lignes, dont
 * l'une portait `annee 2026;1500` en une seule cellule.
 *
 * C'est la panne silencieuse type : les deux moitiés sont des textes
 * parfaitement lisibles, aucune anomalie ne remonte, et le montant a disparu.
 * Les tests existants ne portaient que sur des fichiers d'une ligne par
 * enregistrement, où découper avant ou après les guillemets donne le même
 * résultat.
 */

const lire = (csv: string, nom = 'balance.csv') =>
  lireFichier(nom, Buffer.from(csv, 'utf8').toString('base64'));

describe('le retour à la ligne ne coupe pas un champ protégé', () => {
  it('garde l’enregistrement entier, montant compris', async () => {
    const t = await lire('Numero;Intitule;Debit\n41100000;"Cotisations\nannee 2026";1500\n');
    expect(t.lignes).toEqual([['41100000', 'Cotisations\nannee 2026', '1500']]);
  });

  it('lit les trois conventions de fin de ligne', () => {
    expect(analyserCsv('a;b\r\nc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(analyserCsv('a;b\nc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    // Un vieux tableur Mac · `\r` seul.
    expect(analyserCsv('a;b\rc;d', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('ne perd pas le dernier enregistrement faute de retour final', () => {
    expect(analyserCsv('a;b\nc;d', ';')).toHaveLength(2);
    expect(analyserCsv('a;b\nc;d\n', ';')).toHaveLength(2);
  });

  it('rend un guillemet doublé comme un guillemet', () => {
    expect(analyserCsv('a;"il a dit ""oui""";c', ';')).toEqual([['a', 'il a dit "oui"', 'c']]);
  });

  it('détecte encore le séparateur malgré un retour à la ligne protégé', async () => {
    // La détection analysait des lignes de texte · elle voyait donc, elle
    // aussi, l'enregistrement coupé en deux.
    const t = await lire('Numero,Intitule,Debit\n411,"Cotisations\n2026",1500\n');
    expect(t.separateur).toBe(',');
    expect(t.lignes).toEqual([['411', 'Cotisations\n2026', '1500']]);
  });
});

describe('ce qu’on écrit se relit à l’identique', () => {
  const COLONNES = ['numero', 'intitule', 'observation'];
  const LIGNES = [
    ['41100000', 'Cotisations annee 2026', ''],
    ['52110000', 'Banque; compte principal', 'il a dit "oui"'],
    ['60100000', 'Achats\nsur deux lignes', '  bordé d’espaces  '],
    ['70100000', 'Rien de particulier', 'virgule, et tabulation\tcomprises'],
  ];

  it('l’aller-retour rend exactement ce qui est parti', () => {
    for (const separateur of [';', ',', '\t']) {
      const texte = ecrireCsv(COLONNES, LIGNES, separateur);
      expect(analyserCsv(texte, separateur)).toEqual([COLONNES, ...LIGNES]);
    }
  });

  it('l’aller-retour passe aussi par le lecteur de fichier, élagage compris', async () => {
    // `lireCsv` élague chaque cellule · les espaces de bord sont donc protégés
    // à l'écriture, sans quoi le tour ne serait pas complet.
    const t = await lire(ecrireCsv(COLONNES, LIGNES, ';'));
    expect(t.colonnes).toEqual(COLONNES);
    expect(t.lignes).toEqual(LIGNES);
  });

  it('ne protège que ce qui l’exige', () => {
    expect(ecrireCelluleCsv('41100000', ';')).toBe('41100000');
    expect(ecrireCelluleCsv('a;b', ';')).toBe('"a;b"');
    expect(ecrireCelluleCsv('a;b', ',')).toBe('a;b');
    expect(ecrireCelluleCsv('a"b', ';')).toBe('"a""b"');
    expect(ecrireCelluleCsv('a\nb', ';')).toBe('"a\nb"');
    expect(ecrireCelluleCsv(' a ', ';')).toBe('" a "');
  });
});

describe('une cellule vide de balance vaut zéro, et le reste', () => {
  it('rend 0 sur une cellule vide, null sur ce qui n’est pas un montant', () => {
    // Ce contrat ne change pas · les quatre appelants de `lireMontant` sont
    // les colonnes débit et crédit d'une balance ou d'un journal, où une
    // cellule laissée blanche SIGNIFIE zéro. Rendre `null` refuserait des
    // fichiers parfaitement valides. C'est `null` qui porte l'anomalie, et il
    // est réservé à ce qui n'est pas lisible comme un montant.
    expect(lireMontant('')).toBe(0);
    expect(lireMontant('   ')).toBe(0);
    expect(lireMontant('-')).toBe(0);
    expect(lireMontant('douze')).toBeNull();
    expect(lireMontant('1 234,56')).toBe(1234.56);
    expect(lireMontant('(1234.56)')).toBe(-1234.56);
  });
});
