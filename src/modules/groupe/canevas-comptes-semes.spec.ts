import { TypeCompteDetailTotal } from '@prisma/client';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { RUBRIQUES_CANEVAS, TRESORERIES_CANEVAS } from './canevas-tresorerie';

/**
 * LE CANEVAS DE TRÉSORERIE NE VISE QUE DES COMPTES D'IMPUTATION SEMÉS.
 *
 * Audit du serveur du 2026-09-27, B2 · huit rubriques de dépenses visaient
 * des racines complétées à huit chiffres (60100000, 61800000…), que le semis
 * n'ouvre pas puisqu'elles sont des comptes TOTAL. L'import refusait tout
 * canevas de dépenses, en accusant à tort la cellule de n'avoir pas le plan.
 * `groupe.spec.ts` ne le voyait pas, ses comptes étant factices : celui-ci
 * relit le semis lui-même.
 */

const parNumero = new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c]));

describe('comptes du canevas et plan SYCEBNL semé', () => {
  const comptes = [
    ...RUBRIQUES_CANEVAS.map((r) => [r.libelle, r.compte] as const),
    ...Object.entries(TRESORERIES_CANEVAS).map(([l, t]) => [l, t.compte] as const),
  ];

  it.each(comptes)('%s · %s existe au semis, en compte de DÉTAIL', (_libelle, numero) => {
    const c = parNumero.get(numero);
    expect([numero, c ? 'semé' : 'absent']).toEqual([numero, 'semé']);
    // Absent au semis, le type vaut DÉTAIL (défaut du schéma).
    expect([numero, c?.typeCompte ?? TypeCompteDetailTotal.DETAIL]).toEqual([numero, TypeCompteDetailTotal.DETAIL]);
  });

  it('une dépense vise une charge ou une immobilisation, une recette un produit, hors transferts', () => {
    for (const r of RUBRIQUES_CANEVAS) {
      if (r.compte.startsWith('58')) continue;
      const classe = r.compte[0];
      expect([r.libelle, r.sens === 'recette' ? classe === '7' : classe === '6' || classe === '2']).toEqual([r.libelle, true]);
    }
  });
});
