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
    { id: 'f1', compteId: 'c401', debit: 0, credit: 600, lettrageId: null, compte: { numero: '40110000', intitule: 'Fournisseur A', lettrable: true }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } } },
    { id: 'f2', compteId: 'c401', debit: 0, credit: 400, lettrageId: null, compte: { numero: '40110000', intitule: 'Fournisseur A', lettrable: true }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } } },
    { id: 'k1', compteId: 'c411', debit: 500, credit: 0, lettrageId: null, compte: { numero: '41110000', intitule: 'Client K', lettrable: true }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jVEN', journal: { code: 'VEN' }, exercice: { statut: 'OUVERT' } } },
    { id: 'g1', compteId: 'c402', debit: 0, credit: 300, lettrageId: null, compte: { numero: '40120000', intitule: 'Fournisseur B', lettrable: true }, ecriture: { exerciceId: 'ex', date: new Date('2026-03-01'), journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } } },
  ];
  const prisma = {
    journal: { findFirst: jest.fn(async () => ({ id: 'bq', code: 'BQ', type: 'TRESORERIE', compteTresorerieId: 'c521' })) },
    ligneEcriture: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => lignes.filter((l) => where.id.in.includes(l.id))),
    },
    cloture: { findMany: jest.fn(async () => clotures) },
    // Le RIB du journal se lit à chaque règlement (A6 bis, B3) · aucun ici.
    ribBanque: { findFirst: jest.fn(async () => null) },
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
  const retirerCompensation = jest.fn(async () => undefined);
  const service = new ReglementsService(
    prisma,
    { creer, retirerCompensation } as unknown as EcritureService,
    { lettrerManuel } as unknown as LettrageService,
    ordres as unknown as OrdresVirementService,
  );
  return { service, creer, lettrerManuel, lignes, ordres, ordre, retirerCompensation };
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

  // AUDIT FINAL F56 · le caractère lettrable n'était lu que par le lettrage,
  // APRÈS la pièce · un règlement passait sans lettrage, les factures
  // restaient dues, et un second clic payait deux fois.
  it('refuse un compte non lettrable AVANT toute pièce', async () => {
    const { service, creer, lignes } = monter();
    lignes.filter((l) => l.compteId === 'c402').forEach((l) => (l.compte.lettrable = false));
    await expect(
      service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }, { compteId: 'c402', ligneIds: ['g1'] }] }),
    ).rejects.toThrow(/40120000 n'est pas déclaré lettrable/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('un lettrage refusé malgré tout retire la pièce qu’il devait accompagner', async () => {
    const { service, lettrerManuel, retirerCompensation } = monter();
    lettrerManuel.mockRejectedValueOnce(new Error('Une des lignes a été lettrée entre-temps'));
    await expect(service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }] })).rejects.toThrow(
      /entre-temps/,
    );
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'e1');
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

// ---------------------------------------------------------------------------
// A6 bis, second tour, m6 · l'à-nouveau PROVISOIRE ne se règle pas ici ·
// lettré, il ferait refuser la clôture de l'exercice précédent, qui remplace
// le report provisoire et refuse de le faire s'il est lettré.
// ---------------------------------------------------------------------------

type LigneEcheance = {
  id: string;
  compteId: string;
  debit: number;
  credit: number;
  lettrageId: string | null;
  dateEcheance: Date | null;
  deviseId: string | null;
  montantDevise: number | null;
  coursApplique: number | null;
  libelle: string | null;
  compte: { id: string; numero: string; intitule: string; lettrable: boolean; tiersCompte: null };
  ecriture: Record<string, unknown> & { exerciceId: string; date: Date };
};

/** Une doublure qui HONORE la requête des échéances (F4b) · exercice, compte, sens, lettrage. */
function echeancier(lignes: LigneEcheance[]) {
  const prisma = {
    exercice: { findFirst: jest.fn(async () => ({ id: 'ex', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') })) },
    ligneEcriture: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        lignes.filter((l) => {
          if (where.id?.in) return where.id.in.includes(l.id);
          if (where.ecriture?.exerciceId && l.ecriture.exerciceId !== where.ecriture.exerciceId) return false;
          if (where.lettrageId === null && l.lettrageId !== null) return false;
          if (where.lettrageId?.not === null && l.lettrageId === null) return false;
          if (where.compte?.numero?.startsWith && !l.compte.numero.startsWith(where.compte.numero.startsWith)) return false;
          if (where.credit?.gt !== undefined && !(l.credit > where.credit.gt)) return false;
          if (where.debit?.gt !== undefined && !(l.debit > where.debit.gt)) return false;
          return true;
        }),
      ),
    },
    cloture: { findMany: jest.fn(async () => []) },
    ribBanque: { findFirst: jest.fn(async () => null) },
    journal: { findFirst: jest.fn(async () => ({ id: 'bq', code: 'BQ', type: 'TRESORERIE', compteTresorerieId: 'c521' })) },
  } as unknown as PrismaService;
  const creer = jest.fn();
  const service = new ReglementsService(
    prisma,
    { creer, retirerCompensation: jest.fn() } as unknown as EcritureService,
    { lettrerManuel: jest.fn() } as unknown as LettrageService,
    {} as unknown as OrdresVirementService,
  );
  return { service, creer, prisma };
}

function ligneEcheance(id: string, credit: number, ecriture: Partial<LigneEcheance['ecriture']> = {}, enPlus: Partial<LigneEcheance> = {}): LigneEcheance {
  return {
    id,
    compteId: 'c401',
    debit: 0,
    credit,
    lettrageId: null,
    dateEcheance: null,
    deviseId: null,
    montantDevise: null,
    coursApplique: null,
    libelle: null,
    compte: { id: 'c401', numero: '40110000', intitule: 'Fournisseur A', lettrable: true, tiersCompte: null },
    ecriture: {
      exerciceId: 'ex',
      date: new Date('2027-01-01'),
      libelle: 'Facture',
      reference: null,
      numeroPiece: 1,
      journal: { code: 'AN' },
      journalId: 'jAN',
      exercice: { statut: 'OUVERT' },
      estANouveauProvisoire: false,
      ...ecriture,
    },
    ...enPlus,
  };
}

describe('les échéances · l’à-nouveau provisoire écarté et dit (A6 bis, second tour, m6)', () => {
  it('écartées de la liste, comptées sur leur compte · un compte qui n’a qu’elles reste nommé', async () => {
    const { service } = echeancier([
      ligneEcheance('ranP', 600, { estANouveauProvisoire: true }),
      ligneEcheance('fx', 400, { date: new Date('2027-02-01'), journal: { code: 'ACH' } }),
      { ...ligneEcheance('ranQ', 300, { estANouveauProvisoire: true }), compteId: 'c402', compte: { id: 'c402', numero: '40120000', intitule: 'Fournisseur B', lettrable: true, tiersCompte: null } },
    ]);
    const r = await service.echeances('t', 'ex', 'FOURNISSEUR');
    expect(r.map((g) => [g.numero, g.lignes.map((l) => l.id), g.aNouveauProvisoireEcartees])).toEqual([
      ['40110000', ['fx'], 1],
      ['40120000', [], 1],
    ]);
  });

  it('un à-nouveau définitif reste dû, et rien n’est écarté', async () => {
    const { service } = echeancier([ligneEcheance('ranD', 600, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false })]);
    const r = await service.echeances('t', 'ex', 'FOURNISSEUR');
    expect(r).toEqual([expect.objectContaining({ numero: '40110000', aNouveauProvisoireEcartees: 0, lignes: [expect.objectContaining({ id: 'ranD', montant: 600 })] })]);
  });

  it('choisi malgré tout · refusé avant toute pièce, l’issue nommée', async () => {
    const { service, creer } = echeancier([ligneEcheance('ranP', 600, { estANouveauProvisoire: true })]);
    await expect(service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['ranP'] }] })).rejects.toThrow(
      /40110000 · la ligne d'à-nouveau choisie est PROVISOIRE[\s\S]*Attendez sa clôture, ou saisissez le règlement au journal de trésorerie/,
    );
    expect(creer).not.toHaveBeenCalled();
  });
});
