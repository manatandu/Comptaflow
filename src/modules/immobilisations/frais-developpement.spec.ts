import { Referentiel } from '@prisma/client';
import {
  CRITERES_FRAIS_DEVELOPPEMENT,
  CriteresDeclares,
  criteresRetenus,
  estFraisDeveloppement,
  motifRefusFraisDeveloppement,
} from './frais-developpement';
import { contrepartieAcquisitionAdmise } from './contrepartie-acquisition';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * LOT 15 · SIX CRITÈRES DE LA R&D · AUDCIF Titre VIII ch. 1 § 2.1.1 et § 3.1,
 * fiche du compte 211. Exemple du texte (§ 3.2) · laboratoire, développement
 * du médicament P1 de 210 000 000, dont 110 000 000 après la réunion des
 * conditions au début de mai · seuls ces 110 000 000 s'inscrivent au 211 par
 * le crédit du 721, à la clôture.
 */
const tous: CriteresDeclares = Object.fromEntries(
  CRITERES_FRAIS_DEVELOPPEMENT.map((c) => [c.cle, `Justification du critère ${c.rang}`]),
);
const base = {
  referentiel: 'SYSCOHADA' as const,
  numeroCompte: '21100000',
  repris: false,
  criteres: tous,
  dateReunion: new Date('2026-05-01'),
  dateInscription: new Date('2026-12-31'),
};

describe('frais de développement · six critères (lot 15)', () => {
  it('les six critères du texte, dans son ordre, et aucun autre', () => {
    expect(CRITERES_FRAIS_DEVELOPPEMENT.map((c) => c.rang)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(CRITERES_FRAIS_DEVELOPPEMENT[0].libelle).toContain('faisabilité technique');
    expect(CRITERES_FRAIS_DEVELOPPEMENT[5].libelle).toContain('évaluer de manière fiable');
  });

  it('exemple du texte · inscrit au 31 décembre, conditions réunies au 1er mai · admis', () => {
    expect(motifRefusFraisDeveloppement(base)).toBeNull();
  });

  it('chaque critère manquant est nommé, et le refus renvoie la dépense aux charges', () => {
    for (const c of CRITERES_FRAIS_DEVELOPPEMENT) {
      const sans = { ...tous, [c.cle]: '   ' };
      const motif = motifRefusFraisDeveloppement({ ...base, criteres: sans });
      expect(motif).toContain(`Critère ${c.rang} non démontré`);
      expect(motif).toContain('constituent des charges');
    }
    expect(motifRefusFraisDeveloppement({ ...base, criteres: null })).toContain('Critère 1');
  });

  it('pas de rétroactivité · ni sans date de réunion, ni inscrit avant elle (§ 3.1)', () => {
    expect(motifRefusFraisDeveloppement({ ...base, dateReunion: null })).toContain('§ 3.1');
    expect(motifRefusFraisDeveloppement({ ...base, dateInscription: new Date('2026-04-30') })).toContain('ne peuvent plus être activées');
  });

  it('un bien repris sans déclaration passe ; une déclaration partielle sur lui est refusée', () => {
    expect(motifRefusFraisDeveloppement({ ...base, repris: true, criteres: null, dateReunion: null })).toBeNull();
    expect(motifRefusFraisDeveloppement({ ...base, repris: true, criteres: { INTENTION: 'x' }, dateReunion: null })).toContain('Critère 1');
  });

  it('SYSCOHADA seul · le SYCEBNL n’ouvre aucun 211, et une déclaration hors du 211 est refusée', () => {
    expect(estFraisDeveloppement('SYSCOHADA', '21100000')).toBe(true);
    expect(estFraisDeveloppement('SYCEBNL', '21100000')).toBe(false);
    expect(estFraisDeveloppement('SYSCOHADA', '21810000')).toBe(false);
    expect(motifRefusFraisDeveloppement({ ...base, numeroCompte: '21310000', criteres: null, dateReunion: null })).toBeNull();
    expect(motifRefusFraisDeveloppement({ ...base, referentiel: 'SYCEBNL', numeroCompte: '21310000' })).toContain('aucun 211');
    expect(PLAN_COMPTES_SYCEBNL.some((c) => c.numero.startsWith('211'))).toBe(false);
    expect(PLAN_COMPTES_SYSCOHADA.find((c) => c.numero === '21100000')?.intitule).toBe('Frais de développement');
  });

  it('le 721 est une contrepartie admise du 211 (§ 2.1.2)', () => {
    expect(PLAN_COMPTES_SYSCOHADA.map((c) => c.numero)).toContain('72100000');
    expect(contrepartieAcquisitionAdmise(Referentiel.SYSCOHADA, '21100000', '72100000')).toBe(true);
  });

  it('les justifications sont gardées nettoyées, dans l’ordre du texte', () => {
    expect(criteresRetenus({ CAPACITE: '  oui  ', INTENTION: '' })).toEqual({ CAPACITE: 'oui' });
    expect(criteresRetenus(null)).toBeNull();
  });
});
