import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estEcheanceAReglerSur, lignesDuReglement, montantDu, motifRefusMontant } from './reglement-tiers';
import { ReglementsService } from './reglements.service';
import type { OrdresVirementService } from './ordres-virement.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { LettrageService } from '../lettrage/lettrage.service';

/**
 * RÈGLEMENT DES TIERS · ce qui casserait en silence. Un règlement passé dans
 * le mauvais sens double la dette au lieu de l'éteindre, et la balance boucle.
 */

describe('ce qui se règle', () => {
  it('une dette fournisseur au 40, une créance client au 41', () => {
    expect(estEcheanceAReglerSur('40110000', 'FOURNISSEUR')).toBe(true);
    expect(estEcheanceAReglerSur('41110000', 'CLIENT')).toBe(true);
    expect(estEcheanceAReglerSur('41110000', 'FOURNISSEUR')).toBe(false);
  });

  it('ni estimations de clôture ni avances · 408, 409, 418, 419', () => {
    for (const n of ['40800000', '40910000', '41810000', '41900000']) {
      expect(estEcheanceAReglerSur(n, n.startsWith('40') ? 'FOURNISSEUR' : 'CLIENT')).toBe(false);
    }
  });

  it('le dû se lit dans le sens de l’échéance', () => {
    expect(montantDu({ debit: 0, credit: 1180 }, 'FOURNISSEUR')).toBe(1180);
    expect(montantDu({ debit: 500, credit: 0 }, 'CLIENT')).toBe(500);
  });
});

describe('l’écriture du règlement', () => {
  it('fournisseur · débit du 40, crédit de la trésorerie', () => {
    expect(
      lignesDuReglement({ sens: 'FOURNISSEUR', compteTiersId: '401', compteTresorerieId: '521', montant: 100, libelle: 'x' }),
    ).toEqual([
      { compteId: '401', debit: 100, libelle: 'x' },
      { compteId: '521', credit: 100, libelle: 'x' },
    ]);
  });

  it('client · débit de la trésorerie, crédit du 41', () => {
    expect(
      lignesDuReglement({ sens: 'CLIENT', compteTiersId: '411', compteTresorerieId: '521', montant: 100, libelle: 'x' }),
    ).toEqual([
      { compteId: '521', debit: 100, libelle: 'x' },
      { compteId: '411', credit: 100, libelle: 'x' },
    ]);
  });

  it('partiel admis, excédent refusé, zéro refusé', () => {
    expect(motifRefusMontant(40, 100)).toBeNull();
    expect(motifRefusMontant(100, 100)).toBeNull();
    expect(motifRefusMontant(100.01, 100)).toMatch(/avance ou un trop-perçu/);
    expect(motifRefusMontant(0, 100)).toMatch(/positif/);
  });
});

function monter(clotures: { granularite: string; journalId: string | null; dateLimite: Date }[] = []) {
  const lignes = [
    { id: 'f1', compteId: 'c401', debit: 0, credit: 600, lettrageId: null, compte: { numero: '40110000', intitule: 'Fournisseur A' }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } } },
    { id: 'f2', compteId: 'c401', debit: 0, credit: 400, lettrageId: null, compte: { numero: '40110000', intitule: 'Fournisseur A' }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } } },
    { id: 'k1', compteId: 'c411', debit: 500, credit: 0, lettrageId: null, compte: { numero: '41110000', intitule: 'Client K' }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jVEN', journal: { code: 'VEN' }, exercice: { statut: 'OUVERT' } } },
    { id: 'g1', compteId: 'c402', debit: 0, credit: 300, lettrageId: null, compte: { numero: '40120000', intitule: 'Fournisseur B' }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } } },
  ];
  const prisma = {
    journal: { findFirst: jest.fn(async () => ({ id: 'bq', code: 'BQ', type: 'TRESORERIE', compteTresorerieId: 'c521' })) },
    ligneEcriture: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => lignes.filter((l) => where.id.in.includes(l.id))),
    },
    cloture: { findMany: jest.fn(async () => clotures) },
  } as unknown as PrismaService;
  let n = 0;
  type Piece = { id: string; lignes: { compteId: string; id: string }[] };
  const creer = jest.fn(async (_t: string, _u: string, dto: { lignes: { compteId: string }[] }): Promise<Piece> => {
    n += 1;
    return { id: 'e' + n, lignes: dto.lignes.map((l, i) => ({ ...l, id: `p${n}-${i}` })) };
  });
  const lettrerManuel = jest.fn(async () => ({ lettre: 'A' }));
  const ordre = jest.fn();
  const ordres = {
    preparer: jest.fn(async () => {
      ordre('preparer');
      return { donneur: { banque: 'B', coordonnees: 'X', codeBic: null }, beneficiaires: new Map() };
    }),
    creer: jest.fn(async () => ({ id: 'o1', numero: 1, total: 0 })),
  };
  creer.mockImplementation(async (_t: string, _u: string, dto: { lignes: { compteId: string }[] }): Promise<Piece> => {
    ordre('piece');
    n += 1;
    return { id: 'e' + n, lignes: dto.lignes.map((l, i) => ({ ...l, id: `p${n}-${i}` })) };
  });
  const service = new ReglementsService(
    prisma,
    { creer } as unknown as EcritureService,
    { lettrerManuel } as unknown as LettrageService,
    ordres as unknown as OrdresVirementService,
  );
  return { service, creer, lettrerManuel, lignes, ordres, ordre };
}

const base = { sens: 'FOURNISSEUR' as const, exerciceId: 'ex', journalId: 'bq', date: '2026-09-25' };

describe('enregistrer', () => {
  it('une pièce par tiers, et le lettrage des factures avec leur règlement', async () => {
    const { service, creer, lettrerManuel } = monter();
    await service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1', 'f2'] }, { compteId: 'c402', ligneIds: ['g1'] }] });
    expect(creer).toHaveBeenCalledTimes(2);
    expect(creer.mock.calls[0][2].lignes).toEqual([
      expect.objectContaining({ compteId: 'c401', debit: 1000 }),
      expect.objectContaining({ compteId: 'c521', credit: 1000 }),
    ]);
    expect(lettrerManuel).toHaveBeenCalledWith('t', 'c401', ['f1', 'f2', 'p1-0'], 'u', { autoriserPartiel: false });
  });

  it('un règlement partiel pose un lettrage partiel', async () => {
    const { service, lettrerManuel } = monter();
    await service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'], montant: 250 }] });
    expect(lettrerManuel).toHaveBeenCalledWith('t', 'c401', ['f1', 'p1-0'], 'u', { autoriserPartiel: true });
  });

  it('un seul refus arrête le lot AVANT toute écriture', async () => {
    const { service, creer } = monter();
    await expect(
      service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }, { compteId: 'c402', ligneIds: ['g1'], montant: 999 }] }),
    ).rejects.toThrow(/trop-perçu/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('refuse une facture figée par une clôture totale AVANT toute pièce · le lettrage suivrait la pièce et la refuserait', async () => {
    const { service, creer } = monter([{ granularite: 'TOTALE', journalId: 'jACH', dateLimite: new Date('2026-12-31') }]);
    await expect(service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }] })).rejects.toThrow(
      /régler.*clôturé totalement/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('refuse une facture déjà lettrée, ou sur un autre compte', async () => {
    const { service, lignes } = monter();
    await expect(service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['g1'] }] })).rejects.toThrow(/compte du tiers/);
    (lignes[0] as { lettrageId: string | null }).lettrageId = 'L';
    await expect(service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }] })).rejects.toThrow(/déjà lettrée/);
  });

  it('le contrôleur réserve l’enregistrement aux rôles qui écrivent', () => {
    const src = readFileSync(join(__dirname, 'reglements.controller.ts'), 'utf8');
    expect(src).toContain('@Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)\n  @Post()');
  });
});

describe('ordre de virement préparé avec les règlements', () => {
  it('se vérifie AVANT la première pièce, puis naît sur les pièces passées', async () => {
    const { service, ordres, ordre } = monter();
    const r = await service.enregistrer(
      't',
      'u',
      { ...base, ordreVirement: true, reglements: [{ compteId: 'c401', ligneIds: ['f1', 'f2'], reference: 'VIR 12' }, { compteId: 'c402', ligneIds: ['g1'] }] },
      'compta@exemple.cd',
    );
    expect(ordre.mock.calls.map((c) => c[0])).toEqual(['preparer', 'piece', 'piece']);
    expect(ordres.preparer).toHaveBeenCalledWith('t', 'bq', ['c401', 'c402']);
    expect(ordres.creer).toHaveBeenCalledWith('t', 'compta@exemple.cd', 'bq', '2026-09-25', expect.anything(), [
      { compteId: 'c401', montant: 1000, reference: 'VIR 12', ecritureId: 'e1', pieceReglement: 'BQ' },
      { compteId: 'c402', montant: 300, reference: null, ecritureId: 'e2', pieceReglement: 'BQ' },
    ]);
    expect(r.ordre).toEqual({ id: 'o1', numero: 1, total: 0 });
  });

  it('un tiers sans RIB refuse le lot entier · aucune pièce passée', async () => {
    const { service, ordres, creer } = monter();
    ordres.preparer.mockRejectedValueOnce(new Error('pas de RIB'));
    await expect(
      service.enregistrer('t', 'u', { ...base, ordreVirement: true, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }] }),
    ).rejects.toThrow('pas de RIB');
    expect(creer).not.toHaveBeenCalled();
  });

  it("l'encaissement d'un client ne s'ordonne pas", async () => {
    const { service, creer, ordres } = monter();
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'CLIENT', ordreVirement: true, reglements: [{ compteId: 'c411', ligneIds: ['k1'] }] }),
    ).rejects.toThrow(/paie un fournisseur/);
    expect(ordres.preparer).not.toHaveBeenCalled();
    expect(creer).not.toHaveBeenCalled();
  });

  it("sans la case, aucun ordre n'est préparé", async () => {
    const { service, ordres } = monter();
    const r = await service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }] });
    expect(ordres.preparer).not.toHaveBeenCalled();
    expect(ordres.creer).not.toHaveBeenCalled();
    expect(r.ordre).toBeNull();
  });
});
