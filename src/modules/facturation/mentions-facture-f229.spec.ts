import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AMENDE_PAR_OMISSION,
  FactureVerifiable,
  MENTIONS_ARTICLE_100,
  MENTIONS_ARTICLE_26,
  MENTIONS_DOCUMENT_EN_TENANT_LIEU,
  verifierMentions,
} from './mentions-facture';

/**
 * AUDIT FINAL F229 · `mentions-facture.ts` resté à neuf groupes.
 *
 * Le décret n° 23/10 du 3 mars 2023, art. 26, porte DOUZE mentions (a à l), et
 * son dernier alinéa en retire deux (k et l) au « document tenant lieu de
 * facture normalisée » · dix sont dues. Le tableau les portait déjà ; le
 * commentaire qui le présente annonçait encore « LES NEUF GROUPES », celui de
 * `verifierMentions` « les neuf groupes sont les mêmes pour tous », et la
 * réserve de l'amende ne nommait que l'art. 26, quand une pièce antérieure au
 * 3 mars 2023 se juge sur l'art. 100 du décret n° 011/42.
 *
 * UN COMMENTAIRE QUI COMPTE SE CONFRONTE À CE QU'IL COMPTE · le nombre écrit
 * au-dessus du tableau est relu contre la longueur du tableau lui-même, pas
 * contre un chiffre recopié dans le test.
 */

const source = readFileSync(join(__dirname, 'mentions-facture.ts'), 'utf8');

/**
 * Le commentaire de documentation qui précède immédiatement une déclaration,
 * mis à plat · les astérisques de marge et les retours à la ligne retirés,
 * pour qu'un commentaire recomposé autrement ne fasse pas tomber le test.
 */
function documentationDe(declaration: string): string {
  const i = source.indexOf(declaration);
  expect(i).toBeGreaterThan(0);
  const avant = source.slice(0, i);
  const fin = avant.lastIndexOf('*/');
  // Rien d'autre que des blancs entre le commentaire et la déclaration.
  expect(avant.slice(fin + 2).trim()).toBe('');
  return avant
    .slice(avant.lastIndexOf('/**', fin) + 3, fin)
    .replace(/\n\s*\*\s?/g, ' ')
    .replace(/\s+/g, ' ');
}

const MOTS = ['ZÉRO', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF', 'DIX', 'ONZE', 'DOUZE'];
const mot = (n: number) => MOTS[n];

const facture = (sur: Partial<FactureVerifiable> = {}): FactureVerifiable => ({
  emetteurNom: 'VMG Consulting',
  emetteurAdresse: '12, avenue de la Justice, Kinshasa/Gombe',
  emetteurNumeroImpot: 'A1234567X',
  contrepartieNom: 'Client SARL',
  contrepartieAdresse: '4, boulevard du 30 Juin, Kinshasa',
  contrepartieNumeroImpot: 'B7654321Y',
  dateFacture: new Date('2026-09-10'),
  mentionTvaDebits: false,
  numeroSerie: 'FV-2026-0001',
  autresImpotsEtTaxes: 0,
  lignes: [],
  ...sur,
});

describe('F229 · le commentaire du tableau dit ce que le tableau porte', () => {
  it('il annonce les groupes de l’art. 26 et ceux qui sont dus, au nombre exact', () => {
    const doc = documentationDe('export const MENTIONS_ARTICLE_26');
    expect(doc).toContain(`LES ${mot(MENTIONS_ARTICLE_26.length)} GROUPES DE L'ART. 26`);
    expect(doc).toContain(`DONT ${mot(MENTIONS_DOCUMENT_EN_TENANT_LIEU.length)} SONT DUS`);
  });

  it('il compte les groupes qu’une pièce sans lignes manque, sur les groupes dus', () => {
    const manquent = verifierMentions(facture({ lignes: [] }), true).manquantes.length;
    const doc = documentationDe('export const MENTIONS_ARTICLE_26');
    expect(doc).toContain(
      `manque donc ${mot(manquent)} groupes sur les ${mot(MENTIONS_DOCUMENT_EN_TENANT_LIEU.length).toLowerCase()} dus`,
    );
  });

  it('il renvoie au choix du texte par la date de la pièce, et nomme les neuf de l’art. 100', () => {
    const doc = documentationDe('export const MENTIONS_ARTICLE_26');
    expect(doc).toContain('`texteApplicable`');
    expect(doc).toContain(`les ${mot(MENTIONS_ARTICLE_100.length).toLowerCase()} de l'art. 100 avant le 3 mars 2023`);
  });
});

describe('F229 · `verifierMentions` dit la liste qu’il applique', () => {
  it('sa documentation renvoie au texte en vigueur à la date de la pièce', () => {
    const doc = documentationDe('export function verifierMentions(');
    expect(doc).toContain('`texteApplicable`');
    expect(doc).toContain(`les ${mot(MENTIONS_DOCUMENT_EN_TENANT_LIEU.length).toLowerCase()} groupes dus de l'art. 26`);
  });

  it('le commentaire de la mention de l’art. 60 rend l’art. 100 à son décret', () => {
    const corps = source.slice(source.indexOf('export function verifierMentions('));
    expect(corps.replace(/\s+/g, ' ')).toContain(
      "Elle ne vient ni de l'art. 26 du décret n° 23/10 ni de l'art. 100 du décret n° 011/42",
    );
  });
});

describe('F229 · la réserve de l’amende nomme les deux textes', () => {
  it('l’unité de l’omission se cherche dans le texte applicable à la pièce, art. 26 ou art. 100', () => {
    expect(AMENDE_PAR_OMISSION.reserve).toContain('décret n° 23/10, art. 26');
    expect(AMENDE_PAR_OMISSION.reserve).toContain('décret n° 011/42, art. 100, avant le 3 mars 2023');
    // Le barème reste unitaire · la phrase qui l'interdit de multiplier est gardée.
    expect(AMENDE_PAR_OMISSION.reserve).toContain('ne se déduit donc pas du nombre de groupes manquants');
  });
});
