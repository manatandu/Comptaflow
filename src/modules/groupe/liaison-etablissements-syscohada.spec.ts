import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { GroupeService } from './groupe.service';

/**
 * LE GROUPE SOUS LE SYSCOHADA · un siège et ses succursales, une seule
 * société. La fiche du COMPTE 18 (AUDCIF, Titre VII, classe 1) : « il
 * convient donc de créer, au siège, un compte de liaison au nom de chaque
 * établissement ou succursale, et, dans l'établissement ou la succursale, un
 * compte réfléchi au nom du siège […] les comptes de liaison sont égaux et de
 * sens contraire dans les deux comptabilités », et « celle des comptes 184 à
 * 187 est réservée aux opérations entre établissements d'une même entité ».
 *
 * Trois garanties :
 *  · liaison neutralisée · les 184 à 187 sortent de l'agrégat, rendus ligne à
 *    ligne comme toute élimination ;
 *  · liaison boiteuse · RIEN ne sort, l'écart est chiffré, la liasse refuse en
 *    citant la fiche du COMPTE 18 ;
 *  · un groupe SYCEBNL n'est pas touché · son 185 est un dépôt reçu, pas une
 *    liaison, et il reste dans l'agrégat.
 */

const EX = { id: 'ex-m', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

type Ligne = { numero: string; intitule: string; typeCompte: string; totalDebit: number; totalCredit: number; solde: number };
const l = (numero: string, intitule: string, totalDebit: number, totalCredit: number): Ligne => ({
  numero,
  intitule,
  typeCompte: 'DETAIL',
  totalDebit,
  totalCredit,
  solde: totalDebit - totalCredit,
});

// Le siège encaisse 2 000 de ventes, puis envoie 500 à la succursale de
// Lubumbashi · il débite le compte de liaison ouvert AU NOM de la succursale.
const SIEGE = {
  lignes: [
    l('18510001', 'Liaison succursale Lubumbashi', 500, 0),
    l('52110000', 'Banque', 2000, 500),
    l('70110000', 'Ventes de marchandises', 0, 2000),
  ],
  totaux: { debit: 2500, credit: 2500 },
};
// La succursale reçoit les 500 et crédite le compte réfléchi AU NOM du siège,
// puis achète pour 200.
const SUCCURSALE = {
  lignes: [
    l('18510000', 'Liaison siège', 0, 500),
    l('57110000', 'Caisse', 500, 200),
    l('60110000', 'Achats de marchandises', 200, 0),
  ],
  totaux: { debit: 700, credit: 700 },
};
// La même succursale, qui n'a pas enregistré la réception des 500.
const SUCCURSALE_BOITEUSE = {
  lignes: [l('57110000', 'Caisse', 300, 200), l('10100000', 'Capital', 0, 300), l('60110000', 'Achats de marchandises', 200, 0)],
  totaux: { debit: 500, credit: 500 },
};

const service = (options: {
  referentiel: 'SYSCOHADA' | 'SYCEBNL';
  succursale?: typeof SUCCURSALE;
  siege?: typeof SIEGE;
}) => {
  const majTenant: unknown[] = [];
  const s = new GroupeService(
    {
      exercice: {
        findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
          where.id === 'ex-m' && where.tenantId === 'siege' ? EX : null,
      },
      tiersCompte: { findMany: async () => [] },
      tenant: {
        findUnique: async () => ({
          id: 'siege',
          nom: 'Société Kivu Trading',
          referentiel: options.referentiel,
          systemeComptableSyscohada: null,
          dossierCombinaisonId: 't-comb',
        }),
        findMany: async ({ where }: { where: { dossierMereId: string } }) =>
          where.dossierMereId === 'siege'
            ? [{ id: 'succ', nom: 'Succursale Lubumbashi', jeuEtatsFinanciersSycebnl: null, exercices: [{ ...EX, id: 'ex-s' }] }]
            : [],
        update: async (args: unknown) => {
          majTenant.push(args);
          return {};
        },
      },
      ecriture: { findFirst: async () => ({ date: new Date('2026-06-30') }), count: async () => 3 },
    } as never,
    {
      balance: async (tenantId: string) =>
        tenantId === 'siege' ? (options.siege ?? SIEGE) : (options.succursale ?? SUCCURSALE),
    } as never,
    undefined as never,
    undefined as never,
  );
  return { s, majTenant };
};

describe('groupe SYSCOHADA · la liaison siège / succursales se neutralise, et sort', () => {
  it('retire les 184 à 187 des deux dossiers, et l’agrégat reste équilibré', async () => {
    const a = await service({ referentiel: 'SYSCOHADA' }).s.balanceAgregee('siege', 'ex-m');

    expect(a.controles.ecartLiaison18).toBe(0);
    expect(a.controles.liaison18Neutralisee).toBe(true);
    // Ni le compte de liaison du siège, ni le compte réfléchi de la succursale.
    expect(a.lignes.map((x) => x.numero)).toEqual(['52110000', '57110000', '60110000', '70110000']);
    expect(a.totaux).toEqual({ debit: 2700, credit: 2700 });
    // Le détail par dossier, lui, garde le brut · agrégat = détail − éliminations.
    expect(a.detailParDossier.filter((d) => d.numero.startsWith('185'))).toHaveLength(2);
  });

  it('rend chaque ligne retirée, avec son motif, et l’élimination est symétrique', async () => {
    const a = await service({ referentiel: 'SYSCOHADA' }).s.balanceAgregee('siege', 'ex-m');

    const liaison = a.eliminations.filter((e) => e.motif === 'Compte de liaison siège / établissement');
    expect(liaison).toEqual([
      expect.objectContaining({ dossier: 'Société Kivu Trading', numero: '18510001', debit: 500, credit: 0, contrepartie: 'établissements et succursales' }),
      expect.objectContaining({ dossier: 'Succursale Lubumbashi', numero: '18510000', debit: 0, credit: 500, contrepartie: 'siège' }),
    ]);
    expect(a.totauxEliminations).toEqual({ debit: 500, credit: 500 });
    expect(a.controles.eliminationsSymetriques).toBe(true);
    // Le solde de liaison de chaque dossier est rendu · miroir l'un de l'autre.
    expect(a.dossiers.map((d) => d.soldeLiaison18)).toEqual([500, -500]);
  });
});

describe('groupe SYSCOHADA · une liaison boiteuse ne sort pas, et bloque la liasse', () => {
  it('ne retire rien et chiffre l’écart', async () => {
    const a = await service({ referentiel: 'SYSCOHADA', succursale: SUCCURSALE_BOITEUSE }).s.balanceAgregee('siege', 'ex-m');

    expect(a.controles.ecartLiaison18).toBe(500);
    expect(a.controles.liaison18Neutralisee).toBe(false);
    // Le compte de liaison du siège reste · le retirer effacerait l'écart.
    expect(a.lignes.find((x) => x.numero === '18510001')?.solde).toBe(500);
    expect(a.eliminations).toEqual([]);
  });

  it('la liasse refuse et cite la fiche du COMPTE 18', async () => {
    const { s } = service({ referentiel: 'SYSCOHADA', succursale: SUCCURSALE_BOITEUSE });
    const echec = s.liasseGroupe('siege', 'ex-m', 'u1');
    await expect(echec).rejects.toThrow(BadRequestException);
    await expect(s.liasseGroupe('siege', 'ex-m', 'u1')).rejects.toThrow(
      /comptes de liaison siège \/ établissements \(184 à 187\) non neutralisés \(écart 500\.00 · Société Kivu Trading 500\.00, Succursale Lubumbashi 0\.00\).*égaux et de sens contraire dans les deux comptabilités.*fiche du COMPTE 18/,
    );
  });

  it('le dossier de combinaison est réaligné sur le référentiel du siège avant tout', async () => {
    const { s, majTenant } = service({ referentiel: 'SYSCOHADA', succursale: SUCCURSALE_BOITEUSE });
    await expect(s.liasseGroupe('siege', 'ex-m', 'u1')).rejects.toThrow(BadRequestException);
    expect(majTenant[0]).toEqual({
      where: { id: 't-comb' },
      data: { referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' },
    });
  });
});

describe('groupe SYCEBNL · le 185 est un dépôt reçu, pas une liaison', () => {
  it('reste dans l’agrégat, et le contrôle de liaison n’existe pas', async () => {
    const siegeSycebnl = {
      lignes: [l('18510000', 'Dépôts et cautionnements reçus · dépôts', 0, 300), l('52110000', 'Banque', 300, 0)],
      totaux: { debit: 300, credit: 300 },
    };
    const celluleSycebnl = { lignes: [l('57110000', 'Caisse', 100, 0), l('70100000', 'Cotisations', 0, 100)], totaux: { debit: 100, credit: 100 } };
    const a = await service({ referentiel: 'SYCEBNL', siege: siegeSycebnl, succursale: celluleSycebnl }).s.balanceAgregee('siege', 'ex-m');

    expect(a.lignes.find((x) => x.numero === '18510000')?.solde).toBe(-300);
    expect(a.controles.ecartLiaison18).toBeNull();
    expect(a.controles.liaison18Neutralisee).toBeNull();
    expect(a.dossiers.map((d) => d.soldeLiaison18)).toEqual([null, null]);
    expect(a.eliminations).toEqual([]);
  });
});

describe('classeur et supervision · la liaison se montre là où elle existe', () => {
  const entetes = async (referentiel: 'SYSCOHADA' | 'SYCEBNL') => {
    const { buffer } = await service({ referentiel }).s.balanceAgregeeExcel('siege', 'ex-m');
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    return (wb.getWorksheet('Contrôles')!.getRow(1).values as unknown[]).filter(Boolean);
  };

  it('la feuille « Contrôles » porte la colonne de liaison en SYSCOHADA, et seulement là', async () => {
    expect(await entetes('SYSCOHADA')).toContain('Solde 184 à 187 (liaison siège / établissements)');
    expect(await entetes('SYCEBNL')).toEqual(['Dossier', 'Débit', 'Crédit', 'Solde 58 (virements internes)', 'Équilibre']);
  });

  it('la supervision rend le solde du compte réfléchi de la succursale', async () => {
    const sup = await service({ referentiel: 'SYSCOHADA' }).s.supervision('siege', 'ex-m');
    expect(sup.cellules[0].soldeLiaison18).toBe(-500);
    const supSycebnl = await service({ referentiel: 'SYCEBNL' }).s.supervision('siege', 'ex-m');
    expect(supSycebnl.cellules[0].soldeLiaison18).toBeNull();
  });
});

describe('caracteresCombinaison · le dossier de combinaison porte le référentiel du siège', () => {
  it('SYSCOHADA au système du siège, SYCEBNL en jeu ASSOCIATIONS', () => {
    expect(GroupeService.caracteresCombinaison({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'MINIMAL_TRESORERIE' } as never)).toEqual({
      referentiel: 'SYSCOHADA',
      systemeComptableSyscohada: 'MINIMAL_TRESORERIE',
    });
    expect(GroupeService.caracteresCombinaison({ referentiel: 'SYCEBNL', systemeComptableSyscohada: null } as never)).toEqual({
      referentiel: 'SYCEBNL',
      jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
      systemeComptableSyscohada: null,
    });
  });
});
