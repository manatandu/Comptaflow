import { BadRequestException } from '@nestjs/common';
import { GroupeService } from './groupe.service';

/**
 * LES OPÉRATIONS RÉCIPROQUES AU-DELÀ DU COMPTE 58 · ce que ce fichier gèle.
 *
 * L'agrégation ne neutralisait QUE les comptes 58 « Virements internes », donc
 * les seuls transferts de TRÉSORERIE · le SYCEBNL les réserve d'ailleurs aux
 * « comptes de passage utiles à la comptabilisation d'opérations internes à
 * l'entité » dans les comptabilités à journaux auxiliaires (Partie 2, ch. 3,
 * fiche du COMPTE 58). Tout le reste des opérations réciproques restait dans
 * l'agrégat : une vente du siège à une antenne y comptait un chiffre
 * d'affaires que l'entité n'a jamais réalisé avec un tiers, et la créance comme
 * la dette y figuraient des deux côtés. Le défaut ne lève rien · chaque livre
 * est équilibré, l'agrégat boucle, et la liasse sort sans réserve sur un total
 * gonflé des deux côtés.
 *
 * Ce qui fonde l'exigence (lu avant d'être écrit) :
 *  · les comptes réunis d'un ensemble d'entités liées sont ceux de cet ensemble
 *    « COMME SI ELLES FORMAIENT UNE SEULE ENTITÉ », et la combinaison est un
 *    « cumul des comptes des entités du périmètre […] ; ÉLIMINATION DES COMPTES
 *    RÉCIPROQUES (actifs/passifs, charges/produits) ; neutralisation des
 *    résultats provenant d'opérations entre entités du périmètre » ·
 *    D4C, ch. XIII-4 § 1 ;
 *  · lesquels : « Comptes réciproques (sans effet sur le résultat) : bilan
 *    (clients/fournisseurs, effets à recevoir/à payer, prêts/emprunts),
 *    charges/produits (achats/ventes, charges/produits financiers) » ·
 *    D4C, ch. XII-5 § 4 ;
 *  · et le préalable, qui commande de NOMMER un écart plutôt que de le
 *    corriger : « Éliminations intra-groupe : procédure de CONFIRMATION DE
 *    SOLDE pour toutes les opérations » · D4C, ch. XII-5 § 2.
 */

const EX = { id: 'ex-m', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const EX_C1 = { id: 'ex-c1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

interface LigneFixture {
  ecritureId: string;
  tenantId: string;
  exerciceId: string;
  compteId: string;
  numero: string;
  intitule: string;
  debit: number;
  credit: number;
}

/** Un compte réciproque : le compte, chez qui, ouvert au nom de qui. */
interface RattachementFixture {
  compteId: string;
  tenantId: string;
  code: string;
  nom: string;
  celluleGroupeId: string;
}

/**
 * LA BALANCE EST DÉDUITE DES MÊMES LIGNES QUE L'ÉLIMINATION · si le jeu
 * d'essai posait les deux à la main, un chiffre pourrait s'y contredire sans
 * que rien ne le dise, et le test prouverait alors le contraire de ce qu'il
 * annonce.
 */
function balanceDe(lignes: LigneFixture[], tenantId: string, exerciceId: string) {
  const par = new Map<string, { compteId: string; numero: string; intitule: string; typeCompte: string; totalDebit: number; totalCredit: number }>();
  for (const l of lignes) {
    if (l.tenantId !== tenantId || l.exerciceId !== exerciceId) continue;
    const c = par.get(l.compteId) ?? {
      compteId: l.compteId,
      numero: l.numero,
      intitule: l.intitule,
      typeCompte: 'DETAIL',
      totalDebit: 0,
      totalCredit: 0,
    };
    c.totalDebit += l.debit;
    c.totalCredit += l.credit;
    par.set(l.compteId, c);
  }
  const sorties = [...par.values()].map((c) => ({ ...c, solde: c.totalDebit - c.totalCredit }));
  return {
    lignes: sorties,
    totaux: {
      debit: sorties.reduce((s, c) => s + c.totalDebit, 0),
      credit: sorties.reduce((s, c) => s + c.totalCredit, 0),
    },
  };
}

function service(
  lignes: LigneFixture[],
  rattachements: RattachementFixture[],
  options?: { exercicesCellule?: Array<{ id: string; dateDebut: Date; dateFin: Date }> },
) {
  return new GroupeService(
    {
      exercice: {
        findFirst: async ({ where }: { where: { id?: string; tenantId: string } }) =>
          where.id === 'ex-m' && where.tenantId === 'mere' ? EX : null,
      },
      tenant: {
        findUnique: async () => ({ id: 'mere', nom: 'Siège', dossierCombinaisonId: 't-comb' }),
        findMany: async ({ where }: { where: { dossierMereId: string } }) =>
          where.dossierMereId === 'mere'
            ? [{ id: 'c1', nom: 'Antenne Matete', exercices: options?.exercicesCellule ?? [EX_C1] }]
            : [],
      },
      tiersCompte: {
        findMany: async ({ where }: { where: { tiers: { tenantId: { in: string[] } } } }) =>
          rattachements
            .filter((r) => where.tiers.tenantId.in.includes(r.tenantId))
            .map((r) => ({
              compteId: r.compteId,
              tiers: { tenantId: r.tenantId, code: r.code, nom: r.nom, celluleGroupeId: r.celluleGroupeId },
            })),
      },
      ligneEcriture: {
        // Le faux Prisma applique VRAIMENT le filtre du service · borne
        // d'exercice, borne de dossier, et « écritures qui touchent un compte
        // réciproque ». Un filtre ignoré ferait passer un test que la vraie
        // requête ne passerait pas.
        findMany: async ({
          where,
        }: {
          where: {
            ecriture: {
              tenantId: { in: string[] };
              exerciceId: { in: string[] };
              lignes: { some: { compteId: { in: string[] } } };
            };
          };
        }) => {
          const f = where.ecriture;
          const retenues = lignes.filter(
            (l) => f.tenantId.in.includes(l.tenantId) && f.exerciceId.in.includes(l.exerciceId),
          );
          const internes = new Set(
            retenues.filter((l) => f.lignes.some.compteId.in.includes(l.compteId)).map((l) => l.ecritureId),
          );
          return retenues
            .filter((l) => internes.has(l.ecritureId))
            .map((l) => ({
              ecritureId: l.ecritureId,
              compteId: l.compteId,
              debit: l.debit,
              credit: l.credit,
              ecriture: { tenantId: l.tenantId },
              compte: { numero: l.numero, intitule: l.intitule },
            }));
        },
      },
    } as never,
    {
      balance: async (tenantId: string, exerciceId: string) => balanceDe(lignes, tenantId, exerciceId),
    } as never,
    undefined as never,
    {
      liasseCompleteExcel: async () => {
        throw new Error("la liasse ne doit pas être produite sur un agrégat dont l'élimination ne boucle pas");
      },
    } as never,
  );
}

const ligne = (
  ecritureId: string,
  tenantId: string,
  exerciceId: string,
  compteId: string,
  numero: string,
  intitule: string,
  debit: number,
  credit: number,
): LigneFixture => ({ ecritureId, tenantId, exerciceId, compteId, numero, intitule, debit, credit });

// --------------------------------------------------------------------------
// LE JEU D'ESSAI · le siège facture 1 000 000 de prestations à son antenne, et
// l'antenne ne l'a pas encore réglé à la clôture. À côté, chacun a une
// activité RÉELLE avec des tiers : 2 000 000 de cotisations encaissées au
// siège, 500 000 de dons reçus en caisse à l'antenne.
// --------------------------------------------------------------------------
const VENTE_INTERNE: LigneFixture[] = [
  ligne('e-cotis', 'mere', 'ex-m', 'cpt-521', '52110000', 'Banque', 2_000_000, 0),
  ligne('e-cotis', 'mere', 'ex-m', 'cpt-701', '70100000', 'Cotisations', 0, 2_000_000),
  ligne('e-fact', 'mere', 'ex-m', 'cpt-411ant', '41110000', 'Antenne Matete', 1_000_000, 0),
  ligne('e-fact', 'mere', 'ex-m', 'cpt-706', '70600000', 'Prestations de services', 0, 1_000_000),
  ligne('e-dons', 'c1', 'ex-c1', 'cpt-571', '57100000', 'Caisse', 500_000, 0),
  ligne('e-dons', 'c1', 'ex-c1', 'cpt-758', '75800000', 'Dons', 0, 500_000),
  ligne('e-achat', 'c1', 'ex-c1', 'cpt-605', '60500000', 'Autres achats', 1_000_000, 0),
  ligne('e-achat', 'c1', 'ex-c1', 'cpt-401sie', '40110000', 'Siège', 0, 1_000_000),
];

const DEUX_COTES: RattachementFixture[] = [
  { compteId: 'cpt-411ant', tenantId: 'mere', code: 'CLI-ANT', nom: 'Antenne Matete', celluleGroupeId: 'c1' },
  { compteId: 'cpt-401sie', tenantId: 'c1', code: 'FRS-SIE', nom: 'Siège', celluleGroupeId: 'mere' },
];

describe('agrégat du groupe · les opérations réciproques sortent, et on voit ce qui sort', () => {
  it('la vente du siège à son antenne ne fait plus de chiffre d’affaires au groupe', async () => {
    const a = await service(VENTE_INTERNE, DEUX_COTES).balanceAgregee('mere', 'ex-m');

    // AVANT : 4 500 000 de part et d'autre, dont 1 000 000 de produit interne
    // et 1 000 000 de charge interne, plus la créance et la dette en regard.
    expect(a.totaux.debit).toBe(2_500_000);
    expect(a.totaux.credit).toBe(2_500_000);

    // Le produit interne a disparu · les produits réels sont restés.
    expect(a.lignes.find((l) => l.numero === '70600000')).toBeUndefined();
    expect(a.lignes.find((l) => l.numero === '60500000')).toBeUndefined();
    expect(a.lignes.find((l) => l.numero === '70100000')!.totalCredit).toBe(2_000_000);
    expect(a.lignes.find((l) => l.numero === '75800000')!.totalCredit).toBe(500_000);

    // La créance chez l'un et la dette chez l'autre sont parties ensemble.
    expect(a.lignes.find((l) => l.numero === '41110000')).toBeUndefined();
    expect(a.lignes.find((l) => l.numero === '40110000')).toBeUndefined();

    // La trésorerie, elle, N'EST PAS éliminée · la banque du siège et la
    // caisse de l'antenne sont deux avoirs réels de la même entité.
    expect(a.lignes.find((l) => l.numero === '52110000')!.totalDebit).toBe(2_000_000);
    expect(a.lignes.find((l) => l.numero === '57100000')!.totalDebit).toBe(500_000);
  });

  it('rend ce qu’il a retiré · sinon l’agrégat ne se rapproche plus des balances', async () => {
    const a = await service(VENTE_INTERNE, DEUX_COTES).balanceAgregee('mere', 'ex-m');

    expect(a.totauxEliminations).toEqual({ debit: 2_000_000, credit: 2_000_000 });
    expect(a.controles.eliminationsSymetriques).toBe(true);
    expect(a.controles.ecartElimination).toBe(0);
    expect(
      a.eliminations.map((e) => `${e.dossier} ${e.numero} ${e.motif} ${e.debit}/${e.credit} vs ${e.contrepartie}`),
    ).toEqual([
      'Antenne Matete 40110000 Créance ou dette réciproque 0/1000000 vs Siège',
      'Antenne Matete 60500000 Charge ou produit réciproque 1000000/0 vs Siège',
      'Siège 41110000 Créance ou dette réciproque 1000000/0 vs Antenne Matete',
      'Siège 70600000 Charge ou produit réciproque 0/1000000 vs Antenne Matete',
    ]);

    // Agrégat = détail par dossier − éliminations · la soustraction se refait.
    const brut = a.detailParDossier.reduce(
      (s, l) => ({ debit: s.debit + l.totalDebit, credit: s.credit + l.totalCredit }),
      { debit: 0, credit: 0 },
    );
    expect(brut.debit - a.totauxEliminations.debit).toBe(a.totaux.debit);
    expect(brut.credit - a.totauxEliminations.credit).toBe(a.totaux.credit);
  });

  it('la réciprocité se boucle · la créance chez l’un est la dette chez l’autre', async () => {
    const a = await service(VENTE_INTERNE, DEUX_COTES).balanceAgregee('mere', 'ex-m');
    expect(a.ecartsReciprocite).toEqual([]);
    expect(a.controles.reciprocitesEquilibrees).toBe(true);
    expect(a.avertissements).toEqual([]);
  });
});

describe('agrégat du groupe · le règlement interne déplace la trésorerie, il ne l’efface pas', () => {
  // L'antenne règle 400 000 de sa facture par la caisse. L'écriture de
  // règlement touche un compte réciproque des deux côtés · elle entre donc
  // dans le champ de l'élimination, et c'est là que la classe 5 doit résister :
  // la banque du siège et la caisse de l'antenne sont deux avoirs RÉELS de la
  // même entité, qu'un règlement interne déplace sans en créer ni en détruire.
  const AVEC_REGLEMENT: LigneFixture[] = [
    ...VENTE_INTERNE,
    ligne('e-regl', 'mere', 'ex-m', 'cpt-521', '52110000', 'Banque', 400_000, 0),
    ligne('e-regl', 'mere', 'ex-m', 'cpt-411ant', '41110000', 'Antenne Matete', 0, 400_000),
    ligne('e-regl2', 'c1', 'ex-c1', 'cpt-401sie', '40110000', 'Siège', 400_000, 0),
    ligne('e-regl2', 'c1', 'ex-c1', 'cpt-571', '57100000', 'Caisse', 0, 400_000),
  ];

  it('la classe 5 reste dans l’agrégat, et les deux mouvements s’y compensent', async () => {
    const a = await service(AVEC_REGLEMENT, DEUX_COTES).balanceAgregee('mere', 'ex-m');

    // 2 000 000 encaissés + 400 000 reçus de l'antenne au siège ; 500 000
    // reçus en dons − 400 000 versés au siège à l'antenne. Le mouvement
    // interne se compense de lui-même dans le cumul, sans élimination.
    expect(a.lignes.find((l) => l.numero === '52110000')!.totalDebit).toBe(2_400_000);
    expect(a.lignes.find((l) => l.numero === '57100000')!.totalCredit).toBe(400_000);
    expect(a.eliminations.some((e) => e.numero.startsWith('5'))).toBe(false);

    // La créance et la dette sortent en entier, mouvements compris.
    expect(a.eliminations.find((e) => e.numero === '41110000')).toMatchObject({
      debit: 1_000_000,
      credit: 400_000,
    });
    expect(a.eliminations.find((e) => e.numero === '40110000')).toMatchObject({
      debit: 400_000,
      credit: 1_000_000,
    });
    expect(a.controles.eliminationsSymetriques).toBe(true);
    expect(a.controles.reciprocitesEquilibrees).toBe(true);
    expect(a.totaux.debit).toBe(a.totaux.credit);
  });
});

describe('agrégat du groupe · l’écart de réciprocité est NOMMÉ, jamais corrigé', () => {
  // L'antenne n'a pas passé la facture reçue · aucun compte ouvert au nom du
  // siège, aucune charge, aucune dette. Le siège, lui, a bien sa créance.
  const UN_SEUL_COTE = VENTE_INTERNE.filter((l) => l.ecritureId !== 'e-achat');
  const RATTACHEMENT_SIEGE = [DEUX_COTES[0]];

  it('dit les deux soldes en présence et leur écart, sans en réécrire aucun', async () => {
    const a = await service(UN_SEUL_COTE, RATTACHEMENT_SIEGE).balanceAgregee('mere', 'ex-m');

    expect(a.controles.reciprocitesEquilibrees).toBe(false);
    // Les deux dossiers sont nommés dans l'ordre de leurs noms, avec CHACUN
    // son solde · le lecteur voit lequel des deux n'a rien enregistré.
    expect(a.ecartsReciprocite).toEqual([
      {
        dossier: 'Antenne Matete',
        contrepartie: 'Siège',
        solde: 0,
        soldeContrepartie: 1_000_000,
        ecart: 1_000_000,
      },
    ]);
    // Aucun des deux montants n'a été rapproché de l'autre · la créance du
    // siège reste ce que son livre dit, et rien n'a été inventé à l'antenne.
    const chezLeSiege = a.detailParDossier.find((d) => d.dossier === 'Siège' && d.numero === '41110000')!;
    expect(chezLeSiege.totalDebit).toBe(1_000_000);
    expect(a.detailParDossier.some((d) => d.dossier === 'Antenne Matete' && d.numero === '40110000')).toBe(false);
  });

  it('la liasse du groupe refuse, nomme les deux dossiers et cite les deux soldes', async () => {
    const promesse = service(UN_SEUL_COTE, RATTACHEMENT_SIEGE).liasseGroupe('mere', 'ex-m', 'u-1');
    await expect(promesse).rejects.toThrow(BadRequestException);
    const message = await promesse.catch((e: Error) => e.message);

    expect(message).toContain('Siège');
    expect(message).toContain('Antenne Matete');
    expect(message).toContain('1000000.00');
    expect(message).toContain('0.00');
    expect(message).toMatch(/ne choisit pas lequel des deux dossiers a raison/);
  });
});

describe('agrégat du groupe · une élimination boiteuse ne passe pas en liasse', () => {
  // Le siège facture 1 000 000 de travaux à l'antenne, qui les IMMOBILISE.
  // Chacun a raison de son côté : le siège a un produit, l'antenne un actif.
  // Mais alors ce qui sort au débit n'égale plus ce qui sort au crédit · la
  // dette et le produit s'en vont, la valeur d'entrée reste, et l'agrégat
  // cesserait d'être équilibré. La réciprocité, elle, se boucle : c'est la
  // preuve que les deux contrôles ne disent pas la même chose.
  const TRAVAUX_IMMOBILISES: LigneFixture[] = [
    ligne('e-fact', 'mere', 'ex-m', 'cpt-411ant', '41110000', 'Antenne Matete', 1_000_000, 0),
    ligne('e-fact', 'mere', 'ex-m', 'cpt-706', '70600000', 'Prestations de services', 0, 1_000_000),
    ligne('e-immo', 'c1', 'ex-c1', 'cpt-239', '23900000', 'Bâtiments en cours', 1_000_000, 0),
    ligne('e-immo', 'c1', 'ex-c1', 'cpt-401sie', '40110000', 'Siège', 0, 1_000_000),
  ];

  it('nomme l’écart d’élimination alors même que la réciprocité se boucle', async () => {
    const a = await service(TRAVAUX_IMMOBILISES, DEUX_COTES).balanceAgregee('mere', 'ex-m');

    expect(a.controles.reciprocitesEquilibrees).toBe(true);
    expect(a.controles.eliminationsSymetriques).toBe(false);
    expect(a.totauxEliminations).toEqual({ debit: 1_000_000, credit: 2_000_000 });
    expect(a.controles.ecartElimination).toBe(-1_000_000);
  });

  it('la liasse du groupe refuse et renvoie à la feuille des éliminations', async () => {
    const promesse = service(TRAVAUX_IMMOBILISES, DEUX_COTES).liasseGroupe('mere', 'ex-m', 'u-1');
    await expect(promesse).rejects.toThrow(BadRequestException);
    const message = await promesse.catch((e: Error) => e.message);
    expect(message).toContain('non symétrique');
    expect(message).toContain('-1000000.00');
    expect(message).toContain('Éliminations');
  });
});

describe('agrégat du groupe · un rattachement hors groupe n’élimine rien', () => {
  // Le tiers du siège désigne un dossier qui n'est PAS une cellule de ce
  // groupe. La clé étrangère vise `tenants` et ne peut pas exiger « même
  // dossier mère » · c'est ici que la condition se vérifie.
  const HORS_GROUPE: RattachementFixture[] = [
    { compteId: 'cpt-411ant', tenantId: 'mere', code: 'CLI-X', nom: 'Société X', celluleGroupeId: 'autre-dossier' },
  ];

  it('laisse la vente dans l’agrégat et nomme le rattachement', async () => {
    const a = await service(VENTE_INTERNE, HORS_GROUPE).balanceAgregee('mere', 'ex-m');

    // Rien n'a bougé · retirer une vente faite à une entité extérieure serait
    // le contraire de l'élimination.
    expect(a.totaux.debit).toBe(4_500_000);
    expect(a.totaux.credit).toBe(4_500_000);
    expect(a.eliminations).toEqual([]);
    expect(a.controles.rattachementsValides).toBe(false);
    expect(a.rattachementsRefuses).toEqual([
      {
        dossier: 'Siège',
        codeTiers: 'CLI-X',
        nomTiers: 'Société X',
        motif: 'le dossier désigné n’appartient pas à ce groupe',
      },
    ]);
  });

  it('refuse aussi un tiers qui désigne son propre dossier', async () => {
    const a = await service(VENTE_INTERNE, [
      { compteId: 'cpt-411ant', tenantId: 'mere', code: 'CLI-Y', nom: 'Nous-mêmes', celluleGroupeId: 'mere' },
    ]).balanceAgregee('mere', 'ex-m');
    expect(a.rattachementsRefuses[0].motif).toBe('le tiers désigne son propre dossier');
    expect(a.eliminations).toEqual([]);
  });

  it('la liasse du groupe refuse et dit quel tiers corriger', async () => {
    const promesse = service(VENTE_INTERNE, HORS_GROUPE).liasseGroupe('mere', 'ex-m', 'u-1');
    await expect(promesse).rejects.toThrow(BadRequestException);
    const message = await promesse.catch((e: Error) => e.message);
    expect(message).toContain('CLI-X');
    expect(message).toContain('Société X');
  });
});

describe('agrégat du groupe · ce que l’élimination ne sait pas faire, elle le dit', () => {
  // Cession interne d'immobilisation · le siège cède un véhicule à l'antenne.
  // Le produit de cession est en classe 8 (SYCEBNL, Partie 2 ch. 3, COMPTE 82
  // « Produits des cessions d'immobilisations »).
  const CESSION_INTERNE: LigneFixture[] = [
    ligne('e-cess', 'mere', 'ex-m', 'cpt-411ant', '41110000', 'Antenne Matete', 3_000_000, 0),
    ligne('e-cess', 'mere', 'ex-m', 'cpt-82', '82000000', 'Produits des cessions d’immobilisations', 0, 3_000_000),
    ligne('e-acq', 'c1', 'ex-c1', 'cpt-245', '24500000', 'Matériel de transport', 3_000_000, 0),
    ligne('e-acq', 'c1', 'ex-c1', 'cpt-401sie', '40110000', 'Siège', 0, 3_000_000),
  ];

  it('avertit sur la cession interne d’immobilisation au lieu d’inventer sa neutralisation', async () => {
    const a = await service(CESSION_INTERNE, DEUX_COTES).balanceAgregee('mere', 'ex-m');

    // La créance et la dette sortent · le produit de cession et la valeur
    // d'entrée restent, faute de la valeur brute et des amortissements
    // cumulés du cédant, qui vivent dans le registre du dossier.
    expect(a.lignes.find((l) => l.numero === '82000000')!.totalCredit).toBe(3_000_000);
    expect(a.lignes.find((l) => l.numero === '24500000')!.totalDebit).toBe(3_000_000);
    expect(a.lignes.find((l) => l.numero === '41110000')).toBeUndefined();

    expect(a.avertissements).toHaveLength(1);
    expect(a.avertissements[0]).toContain('82000000');
    expect(a.avertissements[0]).toContain('valeur brute et amortissements');
    expect(a.avertissements[0]).toContain('ch. XII-5');
  });

  it('avertit sur la marge interne restée dans les stocks', async () => {
    // Le siège vend 1 000 000 de fournitures à l'antenne, qui les a encore en
    // stock à la clôture · sa valeur de stock porte la marge du siège.
    const AVEC_STOCK: LigneFixture[] = [
      ...VENTE_INTERNE,
      ligne('e-stock', 'c1', 'ex-c1', 'cpt-32', '32000000', 'Stocks de fournitures', 800_000, 0),
      ligne('e-stock', 'c1', 'ex-c1', 'cpt-603', '60300000', 'Variation de stocks', 0, 800_000),
    ];
    const a = await service(AVEC_STOCK, DEUX_COTES).balanceAgregee('mere', 'ex-m');

    expect(a.avertissements).toHaveLength(1);
    expect(a.avertissements[0]).toContain('800000.00');
    expect(a.avertissements[0]).toContain('ch. XIII-4');
    expect(a.avertissements[0]).toContain('stock de clôture');
  });

  it('ne dit rien quand il n’y a rien à dire · un avertissement qui s’affiche toujours ne se lit plus', async () => {
    const a = await service(VENTE_INTERNE, DEUX_COTES).balanceAgregee('mere', 'ex-m');
    expect(a.avertissements).toEqual([]);
  });
});

describe('agrégat du groupe · aucun tiers-cellule, aucun changement', () => {
  it('rend au centime l’agrégat d’avant · c’est l’état de tous les dossiers existants', async () => {
    const a = await service(VENTE_INTERNE, []).balanceAgregee('mere', 'ex-m');

    expect(a.totaux.debit).toBe(4_500_000);
    expect(a.totaux.credit).toBe(4_500_000);
    expect(a.lignes.find((l) => l.numero === '70600000')!.totalCredit).toBe(1_000_000);
    expect(a.lignes.find((l) => l.numero === '41110000')!.totalDebit).toBe(1_000_000);
    expect(a.eliminations).toEqual([]);
    expect(a.totauxEliminations).toEqual({ debit: 0, credit: 0 });
    expect(a.ecartsReciprocite).toEqual([]);
    expect(a.rattachementsRefuses).toEqual([]);
    expect(a.avertissements).toEqual([]);
    expect(a.controles.reciprocitesEquilibrees).toBe(true);
    expect(a.controles.eliminationsSymetriques).toBe(true);
    expect(a.controles.rattachementsValides).toBe(true);
  });

  it('le classeur n’a alors PAS de feuille « Éliminations » · rien à montrer, rien de montré', async () => {
    const classeur = await service(VENTE_INTERNE, []).balanceAgregeeExcel('mere', 'ex-m');
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(classeur.buffer as never);
    expect(wb.getWorksheet('Éliminations')).toBeUndefined();
  });
});

describe('classeur de la balance agrégée · la feuille « Éliminations »', () => {
  it('porte chaque ligne retirée et un total qui boucle avec les deux autres feuilles', async () => {
    const classeur = await service(VENTE_INTERNE, DEUX_COTES).balanceAgregeeExcel('mere', 'ex-m');
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(classeur.buffer as never);

    const elim = wb.getWorksheet('Éliminations')!;
    // Un en-tête, quatre lignes retirées, un total.
    expect(elim.rowCount).toBe(1 + 4 + 1);
    const total = elim.getRow(elim.rowCount);
    expect(total.getCell(1).value).toBe('TOTAL ÉLIMINÉ');
    expect(total.getCell(6).value).toBe(2_000_000);
    expect(total.getCell(7).value).toBe(2_000_000);

    // La feuille « Contrôles » s'additionne encore · ses lignes par dossier
    // sont brutes, son total est net, et la ligne d'élimination fait le pont.
    const controles = wb.getWorksheet('Contrôles')!;
    let pont: unknown[] = [];
    let totalControles: unknown[] = [];
    controles.eachRow((row) => {
      if (String(row.getCell(1).value) === 'Éliminations des opérations réciproques') {
        pont = [row.getCell(2).value, row.getCell(3).value];
      }
      if (String(row.getCell(1).value) === 'TOTAL AGRÉGÉ') {
        totalControles = [row.getCell(2).value, row.getCell(3).value];
      }
    });
    expect(pont).toEqual([-2_000_000, -2_000_000]);
    expect(totalControles).toEqual([2_500_000, 2_500_000]);

    // La feuille réimportable ne porte plus les comptes internes.
    const agregee = wb.getWorksheet('Balance agrégée')!;
    const numeros: string[] = [];
    agregee.eachRow((row, i) => {
      if (i > 1) numeros.push(String(row.getCell(1).value));
    });
    expect(numeros.sort()).toEqual(['52110000', '57100000', '70100000', '75800000']);
  });

  it('la feuille « Contrôles » ne tait ni l’écart de réciprocité ni le rattachement refusé', async () => {
    const UN_SEUL_COTE = VENTE_INTERNE.filter((l) => l.ecritureId !== 'e-achat');
    const classeur = await service(UN_SEUL_COTE, [DEUX_COTES[0]]).balanceAgregeeExcel('mere', 'ex-m');
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(classeur.buffer as never);
    const controles = wb.getWorksheet('Contrôles')!;

    let dit = '';
    controles.eachRow((row) => {
      const v = String(row.getCell(5).value ?? '');
      if (!v.includes('ÉCART DE RÉCIPROCITÉ')) return;
      dit = `${String(row.getCell(1).value)} | ${row.getCell(2).value} | ${row.getCell(3).value} | ${v}`;
    });
    expect(dit).toContain('Antenne Matete');
    expect(dit).toContain('Siège');
    expect(dit).toContain('1000000.00');
    // Les deux soldes en présence sont portés, pas seulement leur écart.
    expect(dit).toContain('| 0 | 1000000 |');
  });
});
