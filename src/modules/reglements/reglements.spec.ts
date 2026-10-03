import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estEcheanceAReglerSur, lignesDuReglement, montantDu, motifRefusMontant, motifHorsEcheance, avertissementCreanceReclassee } from './reglement-tiers';
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

  it('A7 ter, mineur 1 · le 416 ne se règle pas ici · le refus renvoie au « Recouvrement » du module', () => {
    expect(estEcheanceAReglerSur('41620000', 'CLIENT')).toBe(false);
    expect(estEcheanceAReglerSur('41610000', 'CLIENT')).toBe(false);
    expect(motifHorsEcheance('41620000')).toMatch(/41620000 \(créance litigieuse ou douteuse\) se règle par « Recouvrement » dans « Créances douteuses ou litigieuses »/);
    expect(motifHorsEcheance('40910000')).toMatch(/ne porte pas d'échéance à régler/);
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

function monter(
  clotures: { granularite: string; journalId: string | null; dateLimite: Date }[] = [],
  creancesReclassees: Array<{ compteCreanceId: string; dateReclassement: Date; compte416: { numero: string } }> = [],
  /** m-d · les crédits de reclassement au compte du client, ouverts (la facture reste, sa valeur est au 416). */
  reclassements: Record<string, number> = {},
) {
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
      // m-d · le solde net du compte, toutes ses lignes de l'exercice (la doublure honore le compte).
      aggregate: jest.fn(async ({ where }: { where: { compteId: string } }) => {
        const siennes = lignes.filter((l) => l.compteId === where.compteId);
        return {
          _sum: {
            debit: siennes.reduce((t, l) => t + l.debit, 0),
            credit: siennes.reduce((t, l) => t + l.credit, 0) + (reclassements[where.compteId] ?? 0),
          },
        };
      }),
    },
    cloture: { findMany: jest.fn(async () => clotures) },
    // Le RIB du journal se lit à chaque règlement (A6 bis, B3) · aucun ici.
    ribBanque: { findFirst: jest.fn(async () => null) },
    // A7 ter, mineur 1 · les créances reclassées en vigueur des comptes réglés (la doublure honore les comptes).
    creanceDouteuse: {
      findMany: jest.fn(async ({ where }: { where: { compteCreanceId: { in: string[] } } }) =>
        creancesReclassees.filter((c) => where.compteCreanceId.in.includes(c.compteCreanceId)),
      ),
    },
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

  // A7 TER, MINEUR 1 · la facture d'un client dont une créance est reclassée
  // au 416 se règle encore ici (une vente postérieure en est une autre), mais
  // le règlement le DIT et renvoie au « Recouvrement » du module.
  it('A7 ter, mineur 1 · le règlement d’un compte qui porte une créance reclassée avertit, sans refuser', async () => {
    const { service, creer } = monter([], [{ compteCreanceId: 'c411', dateReclassement: new Date('2026-11-15'), compte416: { numero: '41620000' } }]);
    const r = await service.enregistrer('t', 'u', { ...base, sens: 'CLIENT', reglements: [{ compteId: 'c411', ligneIds: ['k1'] }] });
    expect(creer).toHaveBeenCalledTimes(1);
    expect(r.avertissements).toEqual([
      expect.stringMatching(/41110000 porte une créance reclassée au 41620000 le 2026-11-15.*passez-le par « Recouvrement » dans ce module.*une autre facture du client paraît impayée/),
    ]);
    // Un fournisseur ne lit aucune créance.
    const f = monter([], [{ compteCreanceId: 'c401', dateReclassement: new Date('2026-11-15'), compte416: { numero: '41620000' } }]);
    const rf = await f.service.enregistrer('t', 'u', { ...base, reglements: [{ compteId: 'c401', ligneIds: ['f1'] }] });
    expect(rf.avertissements).toEqual([]);
  });

  // SECOND TOUR, m-d · la facture reclassée réglée ici en entier laissait le
  // client créditeur, le 416 plein et la dépréciation sur une créance
  // encaissée · le règlement se borne au solde NET du compte.
  it('m-d · au-delà du solde net d’un compte qui porte une créance reclassée, refus nommé AVANT toute pièce', async () => {
    const reclassee = [{ compteCreanceId: 'c411', dateReclassement: new Date('2026-11-15'), compte416: { numero: '41620000' } }];
    // La facture de 500 est reclassée · net 0.
    const { service, creer } = monter([], reclassee, { c411: 500 });
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'CLIENT', reglements: [{ compteId: 'c411', ligneIds: ['k1'] }] }),
    ).rejects.toThrow(/41110000 porte une créance reclassée au 41620000 le 2026-11-15 · son solde net n'est que de 0\.00.*Réglez ici au plus 0\.00.*« Recouvrement ».*pièce au journal/);
    expect(creer).not.toHaveBeenCalled();
    // Une part reclassée seulement · 300 restent dus, 300 se règlent, 301 non.
    const partiel = monter([], reclassee, { c411: 200 });
    await expect(
      partiel.service.enregistrer('t', 'u', { ...base, sens: 'CLIENT', reglements: [{ compteId: 'c411', ligneIds: ['k1'], montant: 301 }] }),
    ).rejects.toThrow(/solde net n'est que de 300\.00.*Réglez ici au plus 300\.00/);
    // m3 (troisième passage) · l'issue réelle, jamais « ne réglez que les autres factures ».
    await expect(
      partiel.service.enregistrer('t', 'u', { ...base, sens: 'CLIENT', reglements: [{ compteId: 'c411', ligneIds: ['k1'], montant: 301 }] }),
    ).rejects.not.toThrow(/ne réglez que les autres factures/);
    // m4 · le compte ne devient plus créditeur · l'avertissement ne le dit plus.
    expect(avertissementCreanceReclassee('41110000', '41620000', '2026-11-15')).not.toMatch(/devient créditeur/);
    await partiel.service.enregistrer('t', 'u', { ...base, sens: 'CLIENT', reglements: [{ compteId: 'c411', ligneIds: ['k1'], montant: 300 }] });
    expect(partiel.creer).toHaveBeenCalledTimes(1);
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
  compte: { id: string; numero: string; intitule: string; lettrable: boolean; tiersCompte: null; modeReportANouveau?: string };
  ecriture: Record<string, unknown> & { exerciceId: string; date: Date };
};

/** Une doublure qui HONORE la requête des échéances (F4b) · exercice, compte, sens, lettrage. */
function echeancier(lignes: LigneEcheance[], reevaluations: Array<{ ecritureEcartsId?: string; ecritureExtourneId?: string }> = []) {
  const prisma = {
    // Aucune créance reclassée (A7 ter, mineur 1).
    creanceDouteuse: { findMany: jest.fn(async () => []) },
    // Les réévaluations du dossier (A6 ter) · leur écriture d'écarts et leur contre-passation.
    reevaluation: {
      findMany: jest.fn(async ({ where }: { where: any }) =>
        where.tenantId === 't' ? reevaluations.map((r) => ({ ecritureEcartsId: r.ecritureEcartsId ?? null, ecritureExtourneId: r.ecritureExtourneId ?? null })) : [],
      ),
    },
    exercice: { findFirst: jest.fn(async () => ({ id: 'ex', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') })) },
    ligneEcriture: {
      findMany: jest.fn(async ({ where, cursor, take }: { where: any; cursor?: { id: string }; take?: number }) => {
        const toutes = lignes
          .filter((l) => {
            if (where.id?.in) return where.id.in.includes(l.id);
            // A6 ter · les lignes d'une écriture d'écarts nommée, et la liaison directe.
            if (where.ecritureId?.in && !where.ecritureId.in.includes((l as any).ecritureId)) return false;
            if (where.deviseId === null && l.deviseId !== null) return false;
            if (where.lettre === null && ((l as any).lettre ?? null) !== null) return false;
            if (where.compteId?.in && !where.compteId.in.includes(l.compteId)) return false;
            const e = where.ecriture;
            if (e?.exerciceId && l.ecriture.exerciceId !== e.exerciceId) return false;
            if (e?.date?.lt && !(l.ecriture.date < e.date.lt)) return false;
            if (e?.OR && !e.OR.some((c: Record<string, boolean>) => Object.entries(c).every(([k, v]) => ((l.ecriture as any)[k] ?? false) === v))) return false;
            if (where.lettrageId === null && l.lettrageId !== null) return false;
            if (where.lettrageId?.not === null && l.lettrageId === null) return false;
            if (where.lettrageId?.in && !where.lettrageId.in.includes(l.lettrageId)) return false;
            if (where.compte?.numero?.startsWith && !l.compte.numero.startsWith(where.compte.numero.startsWith)) return false;
            if (where.compte?.id?.in && !where.compte.id.in.includes(l.compteId)) return false;
            const anterieure = where.lettrage?.lignes?.some?.ecriture?.date?.lt;
            if (anterieure && !lignes.some((x) => x.lettrageId !== null && x.lettrageId === l.lettrageId && x.ecriture.date < anterieure)) return false;
            if (where.credit?.gt !== undefined && !(l.credit > where.credit.gt)) return false;
            if (where.debit?.gt !== undefined && !(l.debit > where.debit.gt)) return false;
            return true;
          })
          .map((l) => ({ ...l, lettre: (l as any).lettre ?? null, lettrage: l.lettrageId ? { code: 'A' } : null }));
        const depart = cursor ? toutes.findIndex((l) => l.id === cursor.id) + 1 : 0;
        return take ? toutes.slice(depart, depart + take) : toutes.slice(depart);
      }),
    },
    cloture: { findMany: jest.fn(async () => []) },
    ribBanque: { findFirst: jest.fn(async () => null) },
    journal: { findFirst: jest.fn(async () => ({ id: 'bq', code: 'BQ', type: 'TRESORERIE', compteTresorerieId: 'c521' })) },
  } as unknown as PrismaService;
  const creer = jest.fn(async (_t: string, _u: string, dto: { lignes: { compteId: string }[] }) => ({
    id: 'e1',
    lignes: dto.lignes.map((l, i) => ({ ...l, id: `p-${i}` })),
  }));
  const lettrerManuel = jest.fn(async () => ({ lettre: 'b' }));
  const service = new ReglementsService(
    prisma,
    { creer, retirerCompensation: jest.fn() } as unknown as EcritureService,
    { lettrerManuel } as unknown as LettrageService,
    {} as unknown as OrdresVirementService,
  );
  return { service, creer, lettrerManuel, prisma };
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
    compte: { id: 'c401', numero: '40110000', intitule: 'Fournisseur A', lettrable: true, tiersCompte: null, modeReportANouveau: 'DETAIL' },
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

// A6 TER · L'ÉCART D'UNE RÉÉVALUATION N'EST PAS UNE FACTURE. Une perte de
// change latente crédite le 401 sans devise · dans l'exercice (liaison
// directe) et reportée à l'à-nouveau (liaison de la réévaluation antérieure),
// elle ne se présente plus comme une échéance à payer.
describe('les échéances · l’écart d’une réévaluation n’est pas une facture (A6 ter)', () => {
  const ecartAnterieur = { ...ligneEcheance('eR1', 50_000, { exerciceId: 'n0', date: new Date('2026-12-31') }), ecritureId: 'eR' } as LigneEcheance;
  // Chez un client, la contre-passation de N débite le 411 en N+1 · elle n'est pas une créance.
  it('la contre-passation d’une réévaluation chez un client · écartée', async () => {
    const extourne = { ...ligneEcheance('ext', 0, { date: new Date('2027-01-01'), journal: { code: 'OD' } }), ecritureId: 'eX', debit: 50_000, compteId: 'c411', compte: { id: 'c411', numero: '41110000', intitule: 'Client', lettrable: true, tiersCompte: null } } as LigneEcheance;
    const facture = { ...ligneEcheance('fc', 0), debit: 2_800_000, compteId: 'c411', compte: { id: 'c411', numero: '41110000', intitule: 'Client', lettrable: true, tiersCompte: null } } as LigneEcheance;
    const { service } = echeancier([extourne, facture], [{ ecritureExtourneId: 'eX' }]);
    const r = await service.echeances('t', 'ex', 'CLIENT');
    expect(r.map((g) => g.lignes.map((l) => l.id))).toEqual([['fc']]);
  });
  it('reportée à l’à-nouveau ou passée dans l’exercice · écartée, la vraie facture reportée reste due', async () => {
    const { service } = echeancier(
      [
        ecartAnterieur,
        ligneEcheance('ranR', 50_000, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }),
        ligneEcheance('ranF', 600, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }),
        { ...ligneEcheance('reev', 30_000, { date: new Date('2027-12-31'), journal: { code: 'OD' } }), ecritureId: 'eR27' } as LigneEcheance,
      ],
      [{ ecritureEcartsId: 'eR' }, { ecritureEcartsId: 'eR27' }],
    );
    const r = await service.echeances('t', 'ex', 'FOURNISSEUR');
    expect(r.map((g) => [g.numero, g.lignes.map((l) => l.id)])).toEqual([['40110000', ['ranF']]]);
  });

  it('sans réévaluation antérieure, un à-nouveau en francs du même montant reste dû', async () => {
    const { service } = echeancier([ecartAnterieur, ligneEcheance('ranR', 50_000, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false })]);
    const r = await service.echeances('t', 'ex', 'FOURNISSEUR');
    expect(r.map((g) => g.lignes.map((l) => l.id))).toEqual([['ranR']]);
  });
});

// ---------------------------------------------------------------------------
// A6 bis, second tour, m1 · la paire à cheval se compense au règlement des
// tiers · la ligne d'à-nouveau qui reporte une facture de N lettrée avec un
// règlement de cet exercice n'est plus due, ou seulement de son reste
// (lettrage/paires-a-cheval.ts). Sans elle, 1 160 USD se payaient deux fois.
// ---------------------------------------------------------------------------

describe('les échéances et le règlement · la paire à cheval se compense (A6 bis, second tour, m1)', () => {
  const N = { exerciceId: 'n', date: new Date('2026-12-15'), journal: { code: 'ACH' } };
  const CLOTURE = { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false };
  const scene = (reglementUsd: number, reglementFrancs: number) => [
    // La facture de N, 1 160 USD à 1 680, lettrée avec le règlement de cet exercice.
    ligneEcheance('f0', 1_948_800, N, { lettrageId: 'G', deviseId: 'usd', montantDevise: 1160, libelle: 'Facture NZUZI' }),
    // Sa ligne d'à-nouveau, reportée ouverte (règle 1).
    ligneEcheance('ran', 1_948_800, CLOTURE, { deviseId: 'usd', montantDevise: 1160, libelle: 'RAN détail 40110000 · Facture NZUZI' }),
    // Le règlement de cet exercice, au coût historique.
    { ...ligneEcheance('p1', 0, { date: new Date('2027-02-10'), journal: { code: 'BQ' } }, { lettrageId: 'G', deviseId: 'usd', montantDevise: reglementUsd }), debit: reglementFrancs },
  ];

  it('soldée par le groupe · absente des échéances, refusée si choisie, l’issue nommée', async () => {
    const { service, creer } = echeancier(scene(1160, 1_948_800));
    expect(await service.echeances('t', 'ex', 'FOURNISSEUR')).toEqual([]);
    await expect(
      service.enregistrer('t', 'u', { ...base, exerciceId: 'ex', reglements: [{ compteId: 'c401', ligneIds: ['ran'], montantDevise: 1160, coursReglement: 1750 }] }),
    ).rejects.toThrow(/40110000 · la ligne d'à-nouveau choisie est déjà réglée par le lettrage A à cheval de deux exercices[\s\S]*Elle n'est plus due/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('réglée en partie, en francs · le règlement ne paie que le reste, son lettrage reste partiel, et c’est dit', async () => {
    const { service, creer, lettrerManuel } = echeancier([
      ligneEcheance('f0', 1_000_000, N, { lettrageId: 'G', libelle: 'Facture NZUZI' }),
      ligneEcheance('ran', 1_000_000, CLOTURE, { libelle: 'RAN détail 40110000 · Facture NZUZI' }),
      { ...ligneEcheance('p1', 0, { date: new Date('2027-02-10'), journal: { code: 'BQ' } }, { lettrageId: 'G' }), debit: 600_000 },
    ]);
    const r = await service.enregistrer('t', 'u', { ...base, exerciceId: 'ex', reglements: [{ compteId: 'c401', ligneIds: ['ran'] }] });
    expect(creer.mock.calls[0]![2].lignes).toEqual([
      expect.objectContaining({ compteId: 'c401', debit: 400_000 }),
      expect.objectContaining({ compteId: 'c521', credit: 400_000 }),
    ]);
    expect(lettrerManuel).toHaveBeenCalledWith('t', 'c401', ['ran', 'p-0'], 'u', { autoriserPartiel: true });
    expect(r.avertissements).toEqual([expect.stringMatching(/réglée en partie par le lettrage A à cheval de deux exercices · seul son reste est dû/)]);
    // Plus que le reste · refusé comme tout excédent.
    await expect(
      service.enregistrer('t', 'u', { ...base, exerciceId: 'ex', reglements: [{ compteId: 'c401', ligneIds: ['ran'], montant: 400_000.01 }] }),
    ).rejects.toThrow(/40110000 ·/);
  });

  it('réglée en partie · seul son reste est dû, en francs et en devise, et le groupe qui la règle est dit', async () => {
    const { service } = echeancier(scene(600, 1_008_000));
    const [g] = await service.echeances('t', 'ex', 'FOURNISSEUR');
    expect(g!.lignes).toEqual([
      expect.objectContaining({ id: 'ran', montant: 940_800, montantDevise: 560, regleParLettrageACheval: { groupe: 'A', montant: 1_008_000 } }),
    ]);
  });
});
