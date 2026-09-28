import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupeService } from './groupe.service';

/**
 * BALANCE AGRÉGÉE D'UN GROUPE D'ÉTABLISSEMENTS · les garanties qui rendent
 * l'agrégat digne de confiance :
 *  · l'agrégation se fait par NUMÉRO de compte, comptes Détail seulement
 *    (une ligne Total agrégée compterait deux fois ses enfants) ;
 *  · les virements internes 58 se neutralisent quand chaque transfert est
 *    enregistré des deux côtés, et l'écart est dénoncé sinon ;
 *  · une cellule sans exercice sur la période est NOMMÉE (ses chiffres
 *    manquent), jamais passée sous silence ;
 *  · un exercice étranger au dossier appelant est refusé (le tenantId de
 *    l'appelant borne tout).
 */

const EX_MERE = { id: 'ex-m', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

// La mère encaisse 1000 de cotisations puis envoie 300 à la cellule C1 ·
// C1 reçoit les 300 et en dépense 100. Chaque livre est équilibré, et les
// 58 des deux livres se font face (débit 300 chez l'émetteur, crédit 300
// chez le receveur).
const BALANCES: Record<string, { lignes: unknown[]; totaux: { debit: number; credit: number } }> = {
  mere: {
    lignes: [
      { numero: '52', intitule: 'BANQUES', typeCompte: 'TOTAL', totalDebit: 1000, totalCredit: 300, solde: 700 },
      { numero: '521000', intitule: 'Banque', typeCompte: 'DETAIL', totalDebit: 1000, totalCredit: 300, solde: 700 },
      { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 300, totalCredit: 0, solde: 300 },
      { numero: '701000', intitule: 'Cotisations', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 1000, solde: -1000 },
    ],
    totaux: { debit: 1300, credit: 1300 },
  },
  c1: {
    lignes: [
      { numero: '571000', intitule: 'Caisse', typeCompte: 'DETAIL', totalDebit: 300, totalCredit: 100, solde: 200 },
      { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 300, solde: -300 },
      { numero: '601000', intitule: 'Achats', typeCompte: 'DETAIL', totalDebit: 100, totalCredit: 0, solde: 100 },
    ],
    totaux: { debit: 400, credit: 400 },
  },
};

type LigneFixture = { numero: string; intitule: string; typeCompte: string; totalDebit: number; totalCredit: number };
type Couples = { OR: Array<{ tenantId: string; exerciceId: string }> };

/**
 * LA LECTURE DES BALANCES PAR TRANCHES (audit final F190) · le service ne
 * demande plus une balance par dossier : il lit les comptes des dossiers et
 * leurs sommes par compte, pour les seuls couples (dossier, exercice) retenus.
 * La doublure rend ce que la base rendrait · un couple absent de la requête ne
 * rend rien, et ces jeux d'essai ne portent que des mouvements, ni à-nouveau
 * ni clôture.
 */
function lectureDesBalances(parDossier: Record<string, { exerciceId: string; lignes: LigneFixture[] }>) {
  const comptes = Object.entries(parDossier).flatMap(([tenantId, { lignes }]) =>
    lignes.map((l) => ({
      id: `${tenantId}:${l.numero}`,
      tenantId,
      numero: l.numero,
      intitule: l.intitule,
      classe: `CLASSE_${l.numero[0]}`,
      typeCompte: l.typeCompte,
      sommes: { debit: l.totalDebit, credit: l.totalCredit },
    })),
  );
  return {
    compte: {
      findMany: async ({ where }: { where: { tenantId: { in: string[] } } }) =>
        comptes.filter((c) => where.tenantId.in.includes(c.tenantId)).sort((a, b) => (a.numero < b.numero ? -1 : 1)),
    },
    ligneEcriture: {
      groupBy: async ({ where }: { where: { ecriture: Couples & { estGenereeParCloture?: boolean } } }) =>
        where.ecriture.estGenereeParCloture !== false
          ? []
          : comptes
              .filter((c) => where.ecriture.OR.some((o) => o.tenantId === c.tenantId && o.exerciceId === parDossier[c.tenantId].exerciceId))
              .map((c) => ({ compteId: c.id, _sum: c.sommes })),
    },
  };
}

const lectureDuGroupe = (balanceC1: (typeof BALANCES)['c1'] = BALANCES.c1) =>
  lectureDesBalances({
    mere: { exerciceId: 'ex-m', lignes: BALANCES.mere.lignes as LigneFixture[] },
    c1: { exerciceId: 'ex-c1', lignes: balanceC1.lignes as LigneFixture[] },
  });

const service = (surcharges?: { balanceC1?: (typeof BALANCES)['c1'] }) =>
  new GroupeService(
    {
      ...lectureDuGroupe(surcharges?.balanceC1),
      exercice: { findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => (where.id === 'ex-m' && where.tenantId === 'mere' ? EX_MERE : null) },
      // AUCUN TIERS N'EST UNE CELLULE DU GROUPE · c'est l'état de tous les
      // dossiers existants, aucune reprise de données n'ayant eu lieu. Les
      // chiffres attendus plus bas sont donc EXACTEMENT ceux d'avant
      // l'élimination des opérations réciproques : ce fichier est le garde-fou
      // qui le vérifie.
      tiersCompte: { findMany: async () => [] },
      tenant: {
        findUnique: async () => ({ id: 'mere', nom: 'Église centrale' }),
        findMany: async ({ where }: { where: { dossierMereId: string } }) =>
          where.dossierMereId === 'mere'
            ? [
                { id: 'c1', nom: 'Cellule A', exercices: [{ id: 'ex-c1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }] },
                // C2 n'a qu'un exercice 2024 · aucun recouvrement avec 2026.
                { id: 'c2', nom: 'Cellule B', exercices: [{ id: 'ex-c2', dateDebut: new Date('2024-01-01'), dateFin: new Date('2024-12-31') }] },
              ]
            : [],
      },
    } as never,
    // Aucune balance par dossier n'est plus demandée au service des écritures.
    {} as never,
    undefined as never,
    undefined as never,
  );

describe('GroupeService · balance agrégée', () => {
  it('agrège par numéro, comptes Détail seulement, et neutralise les 58 enregistrés des deux côtés', async () => {
    const a = await service().balanceAgregee('mere', 'ex-m');

    // La ligne Total « 52 » de la mère n'entre pas dans l'agrégat.
    expect(a.lignes.find((l) => l.numero === '52')).toBeUndefined();
    // 58 des deux livres réunis sur une seule ligne, débit 300 / crédit 300.
    const l58 = a.lignes.find((l) => l.numero === '581000')!;
    expect(l58.totalDebit).toBe(300);
    expect(l58.totalCredit).toBe(300);
    expect(a.controles.liaisonNeutralisee).toBe(true);
    // Totaux agrégés : 1300 + 400 de part et d'autre.
    expect(a.totaux.debit).toBe(1700);
    expect(a.totaux.credit).toBe(1700);
    expect(a.controles.tousEquilibres).toBe(true);
    // C2 est nommée · ses chiffres manquent, l'agrégat le dit.
    expect(a.cellulesSansExercice).toEqual([{ id: 'c2', nom: 'Cellule B' }]);
    // Le détail par dossier permet de retrouver qui porte quoi.
    expect(a.detailParDossier.filter((d) => d.dossier === 'Cellule A')).toHaveLength(3);
  });

  it('un transfert enregistré d’un seul côté laisse un écart sur les 58, et il est dénoncé', async () => {
    const a = await service({
      balanceC1: {
        lignes: [
          { numero: '571000', intitule: 'Caisse', typeCompte: 'DETAIL', totalDebit: 200, totalCredit: 100, solde: 100 },
          // Le receveur n'a passé que 200 des 300 reçus par le 58.
          { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 200, solde: -200 },
          { numero: '601000', intitule: 'Achats', typeCompte: 'DETAIL', totalDebit: 100, totalCredit: 0, solde: 100 },
        ],
        totaux: { debit: 300, credit: 300 },
      },
    }).balanceAgregee('mere', 'ex-m');
    expect(a.controles.liaisonNeutralisee).toBe(false);
    expect(a.controles.ecartLiaison).toBe(100);
  });

  it("refuse un exercice qui n'appartient pas au dossier appelant", async () => {
    await expect(service().balanceAgregee('mere', 'ex-etranger')).rejects.toThrow(NotFoundException);
  });

  it('refuse un dossier sans cellule · la fenêtre ne doit pas afficher un agrégat vide trompeur', async () => {
    const s = new GroupeService(
      {
        exercice: { findFirst: async () => EX_MERE },
        tenant: { findUnique: async () => ({ id: 'seul', nom: 'Dossier seul' }), findMany: async () => [] },
        tiersCompte: { findMany: async () => [] },
      } as never,
      {} as never,
      undefined as never,
      undefined as never,
    );
    await expect(s.balanceAgregee('seul', 'ex-m')).rejects.toThrow(BadRequestException);
  });

  it("l'export Excel garde la feuille « Balance agrégée » réimportable : quatre colonnes, pas de ligne de total", async () => {
    const classeur = await service().balanceAgregeeExcel('mere', 'ex-m');
    expect(classeur.nomFichier).toBe('balance-agregee-groupe-2026.xlsx');
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(classeur.buffer as never);
    const feuille = wb.getWorksheet('Balance agrégée')!;
    expect([feuille.getCell('A1').value, feuille.getCell('B1').value, feuille.getCell('C1').value, feuille.getCell('D1').value]).toEqual([
      'Numéro',
      'Intitulé',
      'Débit',
      'Crédit',
    ]);
    // Aucune ligne TOTAL sur la feuille de données · les totaux vivent sur
    // « Contrôles ». La dernière ligne est un compte, pas un agrégat.
    const derniere = feuille.getRow(feuille.rowCount);
    expect(String(derniere.getCell(1).value)).toMatch(/^\d/);
    expect(wb.getWorksheet('Contrôles')).toBeDefined();
    expect(wb.getWorksheet('Par dossier')).toBeDefined();
  });
});

describe('GroupeService · création de cellules par le siège', () => {
  const service = (mere: {
    dossierMereId?: string | null;
    plafondCellules?: number | null;
    cellules?: number;
    referentiel?: string;
    licence?: { type: string; dateExpiration: Date | null } | null;
  }) => {
    const traces: Record<string, unknown[]> = { register: [], majTenant: [], majLicence: [], majUser: [] };
    const s = new GroupeService(
      {
        tenant: {
          findUnique: async () => ({
            id: 'mere',
            dossierMereId: mere.dossierMereId ?? null,
            plafondCellules: mere.plafondCellules ?? null,
            // La cellule naît dans le référentiel du siège (voir creerCellule).
            referentiel: mere.referentiel ?? 'SYCEBNL',
            licence: mere.licence ?? null,
            _count: { cellules: mere.cellules ?? 0 },
          }),
          update: async (args: unknown) => {
            traces.majTenant.push(args);
            return {};
          },
        },
        licence: {
          update: async (args: unknown) => {
            traces.majLicence.push(args);
            return {};
          },
        },
        user: {
          update: async (args: unknown) => {
            traces.majUser.push(args);
            return {};
          },
        },
      } as never,
      undefined as never,
      {
        register: async (dto: Record<string, unknown>) => {
          traces.register.push(dto);
          return { tenant: { id: 't-cellule', nom: dto.nomEntite }, exercice: null, accessToken: 'jeton' };
        },
      } as never,
      undefined as never,
    );
    return { s, traces };
  };

  it('rattachement forcé, licence héritée, jamais le jeton · les trois verrous en un seul appel', async () => {
    const echeance = new Date('2027-06-30');
    const { s, traces } = service({
      plafondCellules: 10,
      cellules: 3,
      licence: { type: 'ABONNEMENT', dateExpiration: echeance },
    });
    const resultat = await s.creerCellule('mere', { nom: 'Cellule Ngaliema 12', emailAdmin: 'tresorier@eglise.cd' });

    // Le pipeline d'inscription reçoit le type de licence de la mère, jamais
    // un choix du client.
    expect((traces.register[0] as { typeLicence: string }).typeLicence).toBe('ABONNEMENT');
    // Rattachement IMPOSÉ au tenant appelant.
    expect(traces.majTenant[0]).toEqual({ where: { id: 't-cellule' }, data: { dossierMereId: 'mere' } });
    // Échéance héritée de la mère.
    expect((traces.majLicence[0] as { data: { dateExpiration: Date } }).data.dateExpiration).toBe(echeance);
    expect(resultat.motDePasseTemporaire.length).toBeGreaterThanOrEqual(16);
    expect(resultat).not.toHaveProperty('accessToken');
    // Mot de passe transité par le siège · changement forcé à la première connexion.
    expect(traces.majUser[0]).toEqual({ where: { email: 'tresorier@eglise.cd' }, data: { doitChangerMotDePasse: true } });
  });

  it('plafond nul = création désactivée · plafond atteint = refus · une cellule ne crée pas de cellules', async () => {
    await expect(
      service({ plafondCellules: null }).s.creerCellule('mere', { nom: 'X', emailAdmin: 'x@x.cd' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service({ plafondCellules: 5, cellules: 5 }).s.creerCellule('mere', { nom: 'X', emailAdmin: 'x@x.cd' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service({ dossierMereId: 'grand-mere', plafondCellules: 5 }).s.creerCellule('mere', { nom: 'X', emailAdmin: 'x@x.cd' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('sous un siège SYSCOHADA, la succursale naît SYSCOHADA, au système du siège, sans jeu SYCEBNL', async () => {
    const { s, traces } = service({ plafondCellules: 5, referentiel: 'SYSCOHADA' });
    await s.creerCellule('mere', {
      nom: 'Succursale Lubumbashi',
      emailAdmin: 'x@x.cd',
      // Un jeu SYCEBNL envoyé par erreur ne doit pas passer sur une société.
      jeuEtatsFinanciersSycebnl: 'PROJETS_DEVELOPPEMENT' as never,
    });
    const envoye = traces.register[0] as Record<string, unknown>;
    expect(envoye.referentiel).toBe('SYSCOHADA');
    // Le siège n'a pas de système renseigné dans ce faux · Système normal,
    // régime de droit commun de l'art. 11 de l'AUDCIF.
    expect(envoye.systemeComptableSyscohada).toBe('NORMAL');
    expect(envoye.jeuEtatsFinanciersSycebnl).toBeUndefined();
  });

  it('sous un siège SYCEBNL, la cellule naît SYCEBNL avec son jeu, sans système SYSCOHADA', async () => {
    const { s, traces } = service({ plafondCellules: 5 });
    await s.creerCellule('mere', {
      nom: 'Cellule Matete',
      emailAdmin: 'x@x.cd',
      jeuEtatsFinanciersSycebnl: 'SYSTEME_MINIMAL_TRESORERIE' as never,
    });
    const envoye = traces.register[0] as Record<string, unknown>;
    expect(envoye.referentiel).toBe('SYCEBNL');
    expect(envoye.jeuEtatsFinanciersSycebnl).toBe('SYSTEME_MINIMAL_TRESORERIE');
    expect(envoye.systemeComptableSyscohada).toBeUndefined();
  });
});

describe('GroupeService · canevas de trésorerie', () => {
  const EX = { id: 'ex-c', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

  const prismaCanevas = (creees: unknown[]) =>
    ({
      tenant: {
        findFirst: async () => ({ id: 'c1', nom: 'Cellule A' }),
        // Le périmètre du groupe, relu à l'entrée · voir dansLeGroupe.
        findMany: async () => [{ id: 'c1' }],
        findUnique: async () => ({ dossierCombinaisonId: null }),
      },
      exercice: { findFirst: async () => EX },
      ecriture: { findFirst: async () => null },
      compte: {
        findMany: async ({ where }: { where: { numero: { in: string[] } } }) =>
          where.numero.in.map((n) => ({ id: `cpt-${n}`, numero: n })),
      },
      journal: {
        findMany: async () => [
          { id: 'j-ca', code: 'CA' },
          { id: 'j-bq', code: 'BQ' },
        ],
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          ecriture: {
            create: async (args: unknown) => {
              creees.push(args);
              return {};
            },
          },
        }),
    }) as never;

  // Les contrôles d'entrée de la saisie · ils laissent passer par défaut, et
  // le test « journal en sommeil » plus bas les fait refuser.
  const ecritureCanevas = (refus?: Error) => ({
    controlesDEntree: jest.fn().mockImplementation(async () => {
      if (refus) throw refus;
      return {};
    }),
  });

  const remplir = async (
    buffer: Buffer,
    lignes: Array<[string, string, string, number | '', number | '', string]>,
  ) => {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Journal de trésorerie')!;
    lignes.forEach((l, i) => {
      const row = ws.getRow(6 + i);
      row.getCell(1).value = new Date(l[0]);
      row.getCell(2).value = l[1];
      row.getCell(3).value = l[2];
      if (l[3] !== '') row.getCell(4).value = l[3];
      if (l[4] !== '') row.getCell(5).value = l[4];
      row.getCell(6).value = l[5];
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  };

  it('aller-retour complet : le canevas généré, rempli, s’importe en écritures équilibrées de brouillard', async () => {
    const creees: Array<{ data: { libelle: string; reference: string; journalId: string; lignes: { create: Array<{ debit: number; credit: number }> } } }> = [];
    const s = new GroupeService(prismaCanevas(creees), ecritureCanevas() as never, undefined as never, undefined as never);

    const canevas = await s.canevas('mere', 'c1');
    expect(canevas.nomFichier).toBe('canevas-cellule-a-2026.xlsx');

    const rempli = await remplir(canevas.buffer, [
      ['2026-03-01', 'Quête du dimanche', 'Dîmes, quêtes et assimilées', 500, '', 'Caisse'],
      ['2026-03-04', 'Transport réunion', 'Transports et déplacements', '', 30, 'Caisse'],
      ['2026-03-10', '', 'Transfert reçu du siège ou d’une cellule', 200, '', 'Banque'],
    ]);
    const rapport = await s.importerCanevas('mere', 'c1', 'user-siege', {
      nomFichier: 'canevas.xlsx',
      contenuBase64: rempli.toString('base64'),
    });

    expect(rapport.importe).toBe(true);
    expect(rapport.lignesImportees).toBe(3);
    expect(creees).toHaveLength(3);
    // Chaque écriture est équilibrée, et la recette débite la trésorerie.
    for (const e of creees) {
      const [l1, l2] = e.data.lignes.create;
      expect(l1.debit + l2.debit).toBeCloseTo(l1.credit + l2.credit);
    }
    // Le transfert du siège passe en banque, journal BQ · le 58 vit sa vie.
    expect(creees[2].data.journalId).toBe('j-bq');
    // Libellé vide = libellé de la rubrique.
    expect(creees[2].data.libelle).toBe('Transfert reçu du siège ou d’une cellule');
    // La référence porte l'empreinte du fichier · rejouer le même dépôt se refuse.
    expect(creees[0].data.reference).toMatch(/^CANEVAS [0-9a-f]{10}$/);
  });

  it('tout ou rien : une seule ligne fausse fait tout refuser, anomalies nommées ligne par ligne', async () => {
    const creees: unknown[] = [];
    const s = new GroupeService(prismaCanevas(creees), ecritureCanevas() as never, undefined as never, undefined as never);
    const canevas = await s.canevas('mere', 'c1');
    const rempli = await remplir(canevas.buffer, [
      ['2026-03-01', 'Bonne ligne', 'Dons et offrandes', 100, '', 'Caisse'],
      // Recette saisie en décaissement · sens contraire à la rubrique.
      ['2026-03-02', 'Sens inversé', 'Dons et offrandes', '', 100, 'Caisse'],
      // Hors exercice.
      ['2025-01-15', 'Trop tôt', 'Dons et offrandes', 50, '', 'Caisse'],
    ]);
    const rapport = await s.importerCanevas('mere', 'c1', 'user-siege', {
      nomFichier: 'canevas.xlsx',
      contenuBase64: rempli.toString('base64'),
    });
    expect(rapport.importe).toBe(false);
    expect(creees).toHaveLength(0);
    expect(rapport.anomalies.map((a) => a.ligne)).toEqual([7, 8]);
  });

  it('les contrôles de la saisie sont joués AVANT la première pièce · un refus n’en laisse passer aucune (audit F3)', async () => {
    // Journal BQ de la cellule en sommeil · le refus vient de
    // EcritureService.controlesDEntree, la même liste que la saisie.
    const creees: unknown[] = [];
    const ecriture = ecritureCanevas(new BadRequestException('Le journal BQ est en sommeil'));
    const s = new GroupeService(prismaCanevas(creees), ecriture as never, undefined as never, undefined as never);
    const canevas = await s.canevas('mere', 'c1');
    const rempli = await remplir(canevas.buffer, [
      ['2026-03-01', 'Quête', 'Dîmes, quêtes et assimilées', 500, '', 'Caisse'],
      ['2026-03-10', '', 'Transfert reçu du siège ou d’une cellule', 200, '', 'Banque'],
    ]);
    await expect(
      s.importerCanevas('mere', 'c1', 'u', { nomFichier: 'c.xlsx', contenuBase64: rempli.toString('base64') }),
    ).rejects.toThrow(/en sommeil/);
    expect(creees).toHaveLength(0);
    // Appelé dans le dossier de la CELLULE, avec son exercice et une pièce
    // équilibrée sur deux lignes.
    const [dossier, piece] = ecriture.controlesDEntree.mock.calls[0];
    expect([dossier, piece.exerciceId, piece.lignes.length]).toEqual(['c1', 'ex-c', 2]);
  });

  it('un fichier qui n’est pas le canevas officiel est refusé net', async () => {
    const s = new GroupeService(prismaCanevas([]), ecritureCanevas() as never, undefined as never, undefined as never);
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    wb.addWorksheet('Feuille1').getCell('A1').value = 'bonjour';
    const etranger = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(
      s.importerCanevas('mere', 'c1', 'u', { nomFichier: 'x.xlsx', contenuBase64: etranger.toString('base64') }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('GroupeService · liasse du groupe en un clic', () => {
  const prismaCombinaison = (
    journalDeAppels: Array<{ nom: string; args?: unknown }>,
    brouillard: Record<string, number> = {},
    balanceC1: (typeof BALANCES)['c1'] = BALANCES.c1,
  ) => {
    const lecture = lectureDuGroupe(balanceC1);
    return {
      ligneEcriture: {
        groupBy: lecture.ligneEcriture.groupBy,
        deleteMany: async () => {
          journalDeAppels.push({ nom: 'lignes.deleteMany' });
          return { count: 0 };
        },
      },
      exercice: {
        findFirst: async ({ where }: { where: { id?: string; tenantId: string } }) => {
          // L'exercice de la mère existe · celui de la combinaison, pas encore.
          if (where.id === 'ex-m' && where.tenantId === 'mere') return EX_MERE;
          return null;
        },
        create: async ({ data }: { data: unknown }) => {
          journalDeAppels.push({ nom: 'exercice.create', args: data });
          return { id: 'ex-comb' };
        },
      },
      // AUCUN TIERS N'EST UNE CELLULE DU GROUPE · c'est l'état de tous les
      // dossiers existants, aucune reprise de données n'ayant eu lieu. Les
      // chiffres attendus plus bas sont donc EXACTEMENT ceux d'avant
      // l'élimination des opérations réciproques : ce fichier est le garde-fou
      // qui le vérifie.
      tiersCompte: { findMany: async () => [] },
      tenant: {
        findUnique: async () => ({ id: 'mere', nom: 'Église centrale', dossierCombinaisonId: null }),
        findMany: async () => [
          { id: 'c1', nom: 'Cellule A', exercices: [{ id: 'ex-c1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }] },
        ],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          journalDeAppels.push({ nom: 'tenant.create', args: data });
          return { id: 't-comb' };
        },
        update: async ({ data }: { data: unknown }) => {
          journalDeAppels.push({ nom: 'tenant.update', args: data });
          return {};
        },
      },
      ecriture: {
        // Le brouillard restant, par couple (dossier, exercice) · aucun par
        // défaut. La doublure ne répond qu'aux couples DEMANDÉS, comme la base
        // (audit final F190) · un exercice mal choisi ne trouverait rien.
        groupBy: async ({ where }: { where: Couples }) => {
          journalDeAppels.push({ nom: 'ecriture.groupBy', args: where });
          return where.OR.filter((c) => (brouillard[`${c.tenantId}|${c.exerciceId}`] ?? 0) > 0).map((c) => ({
            tenantId: c.tenantId,
            exerciceId: c.exerciceId,
            statut: 'BROUILLARD',
            estANouveauProvisoire: false,
            _count: { _all: brouillard[`${c.tenantId}|${c.exerciceId}`] },
            _max: { date: EX_MERE.dateFin },
          }));
        },
        deleteMany: async () => {
          journalDeAppels.push({ nom: 'ecritures.deleteMany' });
          return { count: 0 };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          journalDeAppels.push({ nom: 'ecriture.create', args: data });
          return {};
        },
      },
      compte: {
        createMany: async ({ data }: { data: unknown[] }) => {
          journalDeAppels.push({ nom: 'compte.createMany', args: data });
          return { count: data.length };
        },
        // Deux lectures · les comptes des dossiers pour la balance, ceux du
        // dossier de combinaison, par numéro, pour le reversement.
        findMany: async (args: { where: { numero?: { in: string[] }; tenantId: { in: string[] } } }) =>
          args.where.numero
            ? args.where.numero.in.map((n) => ({ id: `cpt-${n}`, numero: n }))
            : lecture.compte.findMany(args),
      },
      journal: {
        findFirst: async () => null,
        create: async () => ({ id: 'j-od' }),
      },
    } as never;
  };

  it('reverse la balance agrégée dans le dossier de combinaison, régénéré, puis fait produire la liasse aux moteurs existants', async () => {
    const appels: Array<{ nom: string; args?: unknown }> = [];
    let liasseDemandee: { tenantId: string; exerciceId: string } | undefined;
    const s = new GroupeService(
      prismaCombinaison(appels),
      {} as never,
      undefined as never,
      {
        liasseCompleteExcel: async (tenantId: string, exerciceId: string) => {
          liasseDemandee = { tenantId, exerciceId };
          return { buffer: Buffer.from('xlsx'), nomFichier: 'liasse-sycebnl-2026.xlsx' };
        },
      } as never,
    );

    const classeur = await s.liasseGroupe('mere', 'ex-m', 'user-siege');

    // La liasse est produite par les moteurs existants, sur le dossier de
    // combinaison et son exercice miroir.
    expect(liasseDemandee).toEqual({ tenantId: 't-comb', exerciceId: 'ex-comb' });
    expect(classeur.nomFichier).toBe('groupe-liasse-sycebnl-2026.xlsx');

    // Le dossier technique naît SANS dossierMereId · sinon l'agrégat le
    // compterait et doublerait tout.
    const creation = appels.find((a) => a.nom === 'tenant.create')!.args as Record<string, unknown>;
    expect(creation.dossierMereId).toBeUndefined();
    expect(creation.jeuEtatsFinanciersSycebnl).toBe('ASSOCIATIONS_ORDRES_PROFESSIONNELS');

    // Régénération complète AVANT le reversement · l'ordre des gestes compte.
    const noms = appels.map((a) => a.nom);
    expect(noms.indexOf('lignes.deleteMany')).toBeLessThan(noms.indexOf('ecriture.create'));
    expect(noms.indexOf('ecritures.deleteMany')).toBeLessThan(noms.indexOf('ecriture.create'));

    // L'écriture unique porte la balance agrégée en brut, équilibrée.
    const ecriture = appels.find((a) => a.nom === 'ecriture.create')!.args as {
      lignes: { create: Array<{ debit: number; credit: number }> };
    };
    const debits = ecriture.lignes.create.reduce((s2, l) => s2 + l.debit, 0);
    const credits = ecriture.lignes.create.reduce((s2, l) => s2 + l.credit, 0);
    expect(debits).toBeCloseTo(credits);
    expect(debits).toBeCloseTo(1700);
  });

  it('refuse tant qu’un contrôle est rouge · une liasse fausse à l’apparence officielle serait le pire des livrables', async () => {
    // Le 58 de C1 ne fait pas face à celui de la mère · écart de liaison.
    const s = new GroupeService(
      prismaCombinaison([], {}, {
        lignes: [
          { numero: '571000', intitule: 'Caisse', typeCompte: 'DETAIL', totalDebit: 200, totalCredit: 0, solde: 200 },
          { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 200, solde: -200 },
        ],
        totaux: { debit: 200, credit: 200 },
      }),
      {} as never,
      undefined as never,
      {
        liasseCompleteExcel: async () => {
          throw new Error('ne doit jamais être appelé');
        },
      } as never,
    );
    await expect(s.liasseGroupe('mere', 'ex-m', 'u')).rejects.toThrow(/58/);
  });

  it('refuse tant qu’une cellule a du brouillard · il ne devient pas livre-journal par l’écriture de combinaison (audit F7)', async () => {
    // L'agrégat lit le brouillard, et l'écriture de combinaison est posée
    // VALIDÉE · une pièce jamais validée dans sa cellule entrait ainsi dans
    // une liasse déposable. Tout est équilibré, seul le brouillard bloque.
    const appels: Array<{ nom: string; args?: unknown }> = [];
    const s = new GroupeService(
      prismaCombinaison(appels, { 'c1|ex-c1': 2 }),
      {} as never,
      undefined as never,
      {
        liasseCompleteExcel: async () => {
          throw new Error('ne doit jamais être appelé');
        },
      } as never,
    );
    await expect(s.liasseGroupe('mere', 'ex-m', 'u')).rejects.toThrow(/brouillard : Cellule A \(2 pièce\(s\)\)/);
    expect(appels.some((a) => a.nom === 'ecriture.create')).toBe(false);
    // Compté dans l'exercice RETENU de chaque dossier, pas dans tout le
    // dossier · la doublure ne répond qu'au couple demandé, et une seule
    // requête sert tout le groupe (audit final F190).
    const comptages = appels.filter((a) => a.nom === 'ecriture.groupBy').map((a) => a.args as Couples);
    expect(comptages).toHaveLength(1);
    expect(comptages[0].OR).toEqual([
      { tenantId: 'mere', exerciceId: 'ex-m' },
      { tenantId: 'c1', exerciceId: 'ex-c1' },
    ]);
  });
});
