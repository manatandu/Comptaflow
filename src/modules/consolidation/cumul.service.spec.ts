import 'reflect-metadata';
import { RoleUtilisateur } from '@prisma/client';
import { CumulService } from './cumul.service';
import { PerimetreService } from './perimetre.service';
import { ConsolidationController } from './consolidation.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

/**
 * Le câblage du cumul · ce qui est en base arrive au moteur, sous la bonne
 * forme, et ce qui manque est refusé avant tout calcul. Le cas chiffré est
 * celui de `cumul-consolidation.spec.ts`, pour que les deux se répondent.
 */
const T = 'dossier-1';
const EX = 'ex-2026';

function doublure(balanceDossier: [string, number][]) {
  const tables: Record<string, any[]> = { entites: [], liens: [], lignes: [], reciproques: [], internes: [], faits: [], ecarts: [], provisionsChange: [] };
  let seq = 0;
  const correspond = (r: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => (v && typeof v === 'object' && 'in' in (v as any) ? (v as any).in.includes(r[k]) : r[k] === v));
  const table = (nom: string, defauts: Record<string, unknown> = {}) => ({
    findMany: jest.fn(async ({ where }: any = {}) => tables[nom].filter((r) => correspond(r, where))),
    findFirst: jest.fn(async ({ where }: any = {}) => tables[nom].find((r) => correspond(r, where)) ?? null),
    create: jest.fn(async ({ data }: any) => {
      const r = { id: `${nom}-${++seq}`, createdAt: new Date(), ...defauts, ...data };
      tables[nom].push(r);
      return r;
    }),
    createMany: jest.fn(async ({ data }: any) => {
      for (const d of data) tables[nom].push({ id: `${nom}-${++seq}`, ...d });
      return { count: data.length };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const r = tables[nom].find((x) => x.id === where.id);
      for (const [k, v] of Object.entries(data)) if (v !== undefined) r[k] = v;
      return r;
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      tables[nom] = tables[nom].filter((r) => !correspond(r, where));
      return {};
    }),
    delete: jest.fn(async ({ where }: any) => {
      tables[nom] = tables[nom].filter((r) => r.id !== where.id);
      return {};
    }),
  });
  const prisma: any = {
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ id: T, nom: 'Mère SA' })) },
    exercice: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === EX && where.tenantId === T ? { id: EX, dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') } : null,
      ),
    },
    entitePerimetreConsolidation: table('entites', {
      designationMajoriteDeuxExercices: false,
      aucunAutreAssocieSuperieur: false,
      controleContractuel: false,
      accordControleConjoint: false,
      influenceNotableDeclaree: false,
      motifExclusion: null,
      justificationExclusion: null,
      dateCloture: null,
    }),
    lienParticipationConsolidation: table('liens', { coutAcquisition: null, depreciationEcartOuverture: 0, depreciationEcartCloture: 0, dividendesExercice: 0 }),
    ligneBalanceConsolidation: table('lignes'),
    operationReciproqueConsolidation: table('reciproques'),
    resultatInterneConsolidation: table('internes'),
    ecartEvaluationConsolidation: table('ecarts'),
    provisionChangeConsolidation: table('provisionsChange'),
    faitsConsolidationExercice: table('faits'),
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const ecritures: any = {
    balance: jest.fn(async () => ({ lignes: balanceDossier.map(([numero, solde]) => ({ numero, intitule: numero, solde })) })),
  };
  const perimetre = new PerimetreService(prisma);
  return { prisma, tables, ecritures, perimetre, service: new CumulService(prisma, ecritures, perimetre) };
}

const csv = (lignes: [string, string, number, number][]) =>
  Buffer.from(['Numéro;Intitulé;Débit;Crédit', ...lignes.map((l) => l.join(';'))].join('\n')).toString('base64');

const BALANCE_MERE: [string, number][] = [['26100000', 800], ['24100000', 1200], ['10100000', -1000], ['11800000', -500], ['70100000', -700], ['60100000', 200]];
const BALANCE_FILIALE = csv([
  ['24500000', 'Matériel', 2000, 0],
  ['10100000', 'Capital', 0, 1000],
  ['11800000', 'Réserves', 0, 600],
  ['70100000', 'Ventes', 0, 1000],
  ['60100000', 'Achats', 600, 0],
]);

async function groupe(balanceFiliale = BALANCE_FILIALE) {
  const d = doublure(BALANCE_MERE);
  const f = await d.perimetre.creerEntite(T, { exerciceId: EX, nom: 'Filiale' } as any);
  const lien = await d.perimetre.ajouterLien(T, { exerciceId: EX, detenueId: f.id, pctDroitsVote: 80, pctCapital: 80 });
  await d.service.importerBalance(T, f.id, { nomFichier: 'filiale.csv', contenuBase64: balanceFiliale });
  return { ...d, f, lien };
}

describe('CumulService · import de la balance au canevas de la balance agrégée', () => {
  it('lit Numéro, Intitulé, Débit, Crédit et range les soldes', async () => {
    const { tables } = await groupe();
    expect(tables.lignes.map((l) => [l.numero, l.solde])).toContainEqual(['11800000', -600]);
    expect(tables.lignes).toHaveLength(5);
  });

  it('une balance déséquilibrée est refusée, et rien n’est écrit', async () => {
    const d = doublure(BALANCE_MERE);
    const f = await d.perimetre.creerEntite(T, { exerciceId: EX, nom: 'F' } as any);
    await expect(
      d.service.importerBalance(T, f.id, { nomFichier: 'f.csv', contenuBase64: csv([['24500000', 'x', 100, 0], ['10100000', 'y', 0, 90]]) }),
    ).rejects.toThrow(/pas équilibrée/);
    expect(d.tables.lignes).toHaveLength(0);
  });

  it('un compte de classe 9 est refusé · c’est l’analytique au SYSCOHADA', async () => {
    const d = doublure(BALANCE_MERE);
    const f = await d.perimetre.creerEntite(T, { exerciceId: EX, nom: 'F' } as any);
    await expect(
      d.service.importerBalance(T, f.id, { nomFichier: 'f.csv', contenuBase64: csv([['92100000', 'x', 100, 0], ['10100000', 'y', 0, 100]]) }),
    ).rejects.toThrow(/classe 9/);
  });

  const six = (lignes: (string | number)[][]) =>
    Buffer.from(
      ['Numéro;Intitulé;Report débit;Report crédit;Mouvement débit;Mouvement crédit;Solde débit;Solde crédit', ...lignes.map((l) => l.join(';'))].join('\n'),
    ).toString('base64');

  it('une balance à six colonnes garde ses mouvements · un emprunt remboursé en entier reste visible', async () => {
    const d = doublure(BALANCE_MERE);
    const f = await d.perimetre.creerEntite(T, { exerciceId: EX, nom: 'F' } as any);
    const r = await d.service.importerBalance(T, f.id, {
      nomFichier: 'f.csv',
      contenuBase64: six([
        ['16200000', 'Emprunt', 0, 300, 300, 0, 0, 0],
        ['52100000', 'Banque', 500, 0, 100, 300, 300, 0],
        ['10100000', 'Capital', 0, 200, 0, 0, 0, 200],
        ['24500000', 'Matériel', 0, 0, 200, 0, 200, 300 - 300],
        ['12000000', 'Report', 0, 0, 0, 300, 0, 300],
      ]),
    });
    expect(r).toEqual({ lignes: 5, avecMouvements: true });
    expect(d.tables.lignes.find((l) => l.numero === '16200000')).toMatchObject({ solde: 0, mouvementDebit: 300, mouvementCredit: 0 });
    expect(d.tables.lignes.find((l) => l.numero === '52100000')).toMatchObject({ solde: 300, mouvementDebit: 100, mouvementCredit: 300 });
  });

  it('report + mouvements qui ne donnent pas le solde · la ligne est refusée, rien n’est écrit', async () => {
    const d = doublure(BALANCE_MERE);
    const f = await d.perimetre.creerEntite(T, { exerciceId: EX, nom: 'F' } as any);
    await expect(
      d.service.importerBalance(T, f.id, {
        nomFichier: 'f.csv',
        contenuBase64: six([
          ['52100000', 'Banque', 500, 0, 100, 300, 350, 0],
          ['10100000', 'Capital', 0, 500, 0, 0, 0, 350],
        ]),
      }),
    ).rejects.toThrow(/compte 52100000, report \+ mouvements ne donnent pas le solde/);
    expect(d.tables.lignes).toHaveLength(0);
  });

  it('une balance à quatre colonnes n’a pas de mouvements · null, jamais zéro', async () => {
    const { tables } = await groupe();
    expect(tables.lignes.every((l) => l.mouvementDebit === null && l.mouvementCredit === null)).toBe(true);
  });

  it('un nouvel import remplace le précédent au lieu de s’y ajouter', async () => {
    const { service, tables, f } = await groupe();
    await service.importerBalance(T, f.id, { nomFichier: 'v2.csv', contenuBase64: csv([['24500000', 'x', 50, 0], ['10100000', 'y', 0, 50]]) });
    expect(tables.lignes).toHaveLength(2);
  });
});

describe('CumulService · le cumul de bout en bout', () => {
  it('rend le cas chiffré du moteur · réserves groupe 1 044, minoritaires 320, résultat groupe 812', async () => {
    const { service, lien } = await groupe();
    await service.declarerAcquisition(T, lien.id, {
      coutAcquisition: 800,
      compteTitres: '26100000',
      dateEntree: '2024-01-01',
      capitauxPropresEntree: 900,
      modeDureeEcart: 'NON_DETERMINABLE',
    });
    const r = await service.cumul(T, EX);
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1044, interetsMinoritairesHorsResultat: 320, resultatGroupe: 812 });
    expect(r.equilibre).toBe(0);
    expect(r.reserves.join(' ')).toContain('art. 86, 4°');
  });

  it('la consolidante est lue au livre-journal seul, comme ses états individuels', async () => {
    const { service, lien, ecritures } = await groupe();
    await service.declarerAcquisition(T, lien.id, {
      coutAcquisition: 800,
      compteTitres: '26100000',
      dateEntree: '2024-01-01',
      capitauxPropresEntree: 900,
      modeDureeEcart: 'NON_DETERMINABLE',
    });
    await service.cumul(T, EX);
    expect(ecritures.balance).toHaveBeenCalledWith(T, EX, false);
  });

  it('une participation retenue sans coût d’acquisition arrête le cumul et la nomme', async () => {
    const { service } = await groupe();
    await expect(service.cumul(T, EX)).rejects.toThrow(/Mère SA → Filiale/);
  });

  it('une opération réciproque sans entité vise la consolidante', async () => {
    const { service, lien, f, ecritures } = await groupe(
      csv([
        ['24500000', 'Matériel', 2100, 0],
        ['40100000', 'Fournisseur M', 0, 100],
        ['10100000', 'Capital', 0, 1000],
        ['11800000', 'Réserves', 0, 600],
        ['70100000', 'Ventes', 0, 1000],
        ['60100000', 'Achats', 600, 0],
      ]),
    );
    ecritures.balance.mockResolvedValue({
      lignes: [['26100000', 800], ['41100000', 100], ['24100000', 1100], ['10100000', -1000], ['11800000', -500], ['70100000', -700], ['60100000', 200]].map(
        ([numero, solde]) => ({ numero, intitule: numero, solde }),
      ),
    });
    await service.declarerAcquisition(T, lien.id, {
      coutAcquisition: 800,
      compteTitres: '26100000',
      dateEntree: '2024-01-01',
      capitauxPropresEntree: 900,
      modeDureeEcart: 'NON_DETERMINABLE',
    });
    await service.ajouterReciproque(T, { exerciceId: EX, compteA: '41100000', entiteBId: f.id, compteB: '40100000', montant: 100, libelle: 'Créance' });
    const r = await service.cumul(T, EX);
    expect(r.lignes.find((l) => l.cle === '41100000')).toBeUndefined();
    expect(r.lignes.find((l) => l.cle === '40100000')).toBeUndefined();
  });

  it('une opération réciproque d’une entité avec elle-même est refusée', async () => {
    const { service } = await groupe();
    await expect(service.ajouterReciproque(T, { exerciceId: EX, compteA: '41', compteB: '40', montant: 1, libelle: 'x' })).rejects.toThrow(
      /DIFFÉRENTES/,
    );
  });

  it('une entité retenue détenue par une entité exclue est refusée', async () => {
    const d = doublure(BALANCE_MERE);
    const a = await d.perimetre.creerEntite(T, {
      exerciceId: EX,
      nom: 'A',
      motifExclusion: 'IMPORTANCE_NEGLIGEABLE',
      justificationExclusion: 'marginale',
    } as any);
    const b = await d.perimetre.creerEntite(T, { exerciceId: EX, nom: 'B' } as any);
    await d.perimetre.ajouterLien(T, { exerciceId: EX, detenueId: a.id, pctDroitsVote: 70, pctCapital: 70 });
    await d.perimetre.ajouterLien(T, { exerciceId: EX, detentriceId: a.id, detenueId: b.id, pctDroitsVote: 60, pctCapital: 60 });
    await expect(d.service.cumul(T, EX)).rejects.toThrow(/exclue \(art\. 96\)/);
  });

  it('un refus du moteur remonte en 400, avec son message', async () => {
    const { service, lien } = await groupe();
    await service.declarerAcquisition(T, lien.id, {
      coutAcquisition: 800,
      compteTitres: '26100000',
      dateEntree: '2026-04-01',
      capitauxPropresEntree: 900,
      modeDureeEcart: 'NON_DETERMINABLE',
    });
    await expect(service.cumul(T, EX)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/en cours d’exercice/) });
  });

  it('un résultat interne déclaré sans vendeuse vise la consolidante, et arrive au moteur', async () => {
    const { service, lien, f } = await groupe();
    await service.declarerAcquisition(T, lien.id, {
      coutAcquisition: 800,
      compteTitres: '26100000',
      dateEntree: '2024-01-01',
      capitauxPropresEntree: 900,
      modeDureeEcart: 'NON_DETERMINABLE',
    });
    await service.ajouterResultatInterne(T, {
      exerciceId: EX,
      acheteuseId: f.id,
      nature: 'IMMOBILISATION',
      compteActif: '24500000',
      margeOuverture: 0,
      margeCloture: 100,
      libelle: 'Matériel vendu par la mère',
    });
    const r = await service.cumul(T, EX);
    // La mère vend · 812 − 100 au groupe, rien aux minoritaires ; le matériel perd 100.
    expect(r.capitauxPropres).toMatchObject({ resultatGroupe: 712, resultatMinoritaires: 80 });
    expect(r.lignes.find((l) => l.cle === '24500000')?.solde).toBe(1900);
  });

  it('un résultat interne d’une entité avec elle-même, ou sur la mauvaise classe, est refusé avant d’être écrit', async () => {
    const { service, f, tables } = await groupe();
    const base = { exerciceId: EX, nature: 'STOCK' as const, compteActif: '31100000', margeOuverture: 0, margeCloture: 10, libelle: 'x' };
    await expect(service.ajouterResultatInterne(T, base)).rejects.toThrow(/DIFFÉRENTES/);
    await expect(service.ajouterResultatInterne(T, { ...base, acheteuseId: f.id, compteActif: '24500000' })).rejects.toThrow(/classe 3/);
    expect(tables.internes).toHaveLength(0);
  });

  it('une durée limitée sans durée est refusée à la déclaration', async () => {
    const { service, lien } = await groupe();
    await expect(
      service.declarerAcquisition(T, lien.id, {
        coutAcquisition: 800,
        compteTitres: '26100000',
        dateEntree: '2024-01-01',
        capitauxPropresEntree: 900,
        modeDureeEcart: 'LIMITEE',
      }),
    ).rejects.toThrow(/durée d’utilité limitée/);
  });
});

describe('CumulService · tranche 4a, écarts d’évaluation et fiscalité déclarés', () => {
  const ACQ = { coutAcquisition: 800, compteTitres: '26100000', dateEntree: '2024-01-01', capitauxPropresEntree: 900, modeDureeEcart: 'NON_DETERMINABLE' as const };
  const BATIMENT = { compte: '23100000', compteAmortissement: '28310000', libelle: 'Bâtiment', montant: 100, mode: 'AMORTISSABLE' as const, dureeAnnees: 5 };
  const ZEROS = { idaOuverture: 0, idaCloture: 0, idpOuverture: 0, idpCloture: 0 };

  it('un écart déclaré et les taux déclarés arrivent au moteur · le cas chiffré du moteur, au franc', async () => {
    const { service, lien, f } = await groupe();
    await service.declarerAcquisition(T, lien.id, ACQ);
    await service.ajouterEcartEvaluation(T, lien.id, BATIMENT);
    await service.enregistrerFiscalite(T, { exerciceId: EX, tauxImpotDiffere: 30, sourceTauxImpot: 'loi de finances', ...ZEROS });
    await service.enregistrerFiscalite(T, { exerciceId: EX, entiteId: f.id, tauxImpotDiffere: 30, sourceTauxImpot: 'loi de finances', ...ZEROS });
    const r = await service.cumul(T, EX);
    expect(r.ecarts[0]).toMatchObject({ quotePartCapitauxPropresEntree: 776, ecart: 24 });
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1032.8, resultatGroupe: 806.4 });
    expect(r.lignes.find((l) => l.cle === 'IMPOTS_DIFFERES_PASSIF')?.solde).toBe(-12);
    expect(r.impotsDifferesIncomplets).toEqual([]);
  });

  it('la consolidante déclare dans les faits de l’exercice, une entité sur sa ligne · sans déclaration, les deux sont nommées', async () => {
    const { service, lien } = await groupe();
    await service.declarerAcquisition(T, lien.id, ACQ);
    const r = await service.cumul(T, EX);
    expect(r.impotsDifferesIncomplets.join(' ')).toMatch(/« Mère SA » n’a pas déclaré.*« Filiale » n’a pas déclaré/);
  });

  it('refus à la porte · un taux sans source, un IDA sans motif, un écart sur les capitaux propres', async () => {
    const { service, lien, f, tables } = await groupe();
    await service.declarerAcquisition(T, lien.id, ACQ);
    await expect(service.enregistrerFiscalite(T, { exerciceId: EX, tauxImpotDiffere: 30 })).rejects.toThrow(/AVEC sa source/);
    await expect(service.enregistrerFiscalite(T, { exerciceId: EX, entiteId: f.id, idaCloture: 10 })).rejects.toThrow(/probable/);
    await expect(service.ajouterEcartEvaluation(T, lien.id, { ...BATIMENT, compte: '11800000' })).rejects.toThrow(/jamais aux capitaux propres/);
    expect(tables.ecarts).toHaveLength(0);
    expect(tables.faits).toHaveLength(0);
  });
});

describe('CumulService · tranche 4b, écarts de conversion individuels déclarés', () => {
  const ACQ = { coutAcquisition: 800, compteTitres: '26100000', dateEntree: '2024-01-01', capitauxPropresEntree: 900, modeDureeEcart: 'NON_DETERMINABLE' as const };
  // La filiale porte une perte latente de 50 au 478, couverte au 4991 par une dotation de 50 au 6591.
  const FILIALE_478 = csv([
    ['24500000', 'Matériel', 2000, 0],
    ['47800000', 'Écarts de conversion actif', 50, 0],
    ['65910000', 'Dotation provision change', 50, 0],
    ['10100000', 'Capital', 0, 1000],
    ['11800000', 'Réserves', 0, 600],
    ['49910000', 'Provision pour pertes de change', 0, 50],
    ['70100000', 'Ventes', 0, 1050],
    ['60100000', 'Achats', 600, 0],
  ]);
  const solde = (r: any, cle: string) => r.lignes.find((l: any) => l.cle === cle)?.solde;

  it('la déclaration N-1 et la provision déclarée retirent 478, 4991 et 6591 · la perte latente passe au résultat, au franc', async () => {
    const { service, lien, f } = await groupe(FILIALE_478);
    await service.declarerAcquisition(T, lien.id, ACQ);
    await service.enregistrerFiscalite(T, { exerciceId: EX, entiteId: f.id, ecartConversionActifN1: 0, ecartConversionPassifN1: 0 });
    await service.ajouterProvisionChange(T, { exerciceId: EX, entiteId: f.id, compteProvision: '49910000', cloture: 50, dotation: 50, reprise: 0 });
    const r = await service.cumul(T, EX);
    expect(r.lignes.filter((l) => /^(478|4991|6591)/.test(l.cle)).filter((l) => Math.abs(l.solde) > 0.005)).toEqual([]);
    expect(solde(r, 'ECARTS_CONVERSION_INDIVIDUELS_RESULTAT')).toBe(50);
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1044, resultatGroupe: 812 });
    expect(r.equilibre).toBe(0);
  });

  it('sans déclaration N-1, les 478 et 4991 restent en l’état · une provision de la consolidante ne touche pas la filiale', async () => {
    const { service, lien, f } = await groupe(FILIALE_478);
    await service.declarerAcquisition(T, lien.id, ACQ);
    await service.ajouterProvisionChange(T, { exerciceId: EX, entiteId: null, compteProvision: '49910000', cloture: 50, dotation: 50, reprise: 0 });
    const sans = await service.cumul(T, EX);
    expect(sans.lignes.find((l) => l.cle.startsWith('478'))?.solde).toBe(50);
    expect(solde(sans, 'ECARTS_CONVERSION_INDIVIDUELS_RESULTAT') ?? 0).toBe(0);
    await service.enregistrerFiscalite(T, { exerciceId: EX, entiteId: f.id, ecartConversionActifN1: 0, ecartConversionPassifN1: 0 });
    const avec = await service.cumul(T, EX);
    expect(avec.lignes.find((l) => l.cle.startsWith('478'))?.solde ?? 0).toBe(0);
    expect(avec.lignes.find((l) => l.cle.startsWith('4991'))?.solde).toBe(-50);
  });

  it('refus à la porte · une provision hors 194, 4991, 4997, et une ouverture négative', async () => {
    const { service, f, tables } = await groupe(FILIALE_478);
    await expect(service.ajouterProvisionChange(T, { exerciceId: EX, entiteId: f.id, compteProvision: '15100000', cloture: 50, dotation: 0, reprise: 0 })).rejects.toThrow(/194, au 4991 ou au 4997/);
    await expect(service.ajouterProvisionChange(T, { exerciceId: EX, entiteId: f.id, compteProvision: '49910000', cloture: 10, dotation: 50, reprise: 0 })).rejects.toThrow(/ouverture négative/);
    expect(tables.provisionsChange).toHaveLength(0);
    const p = await service.ajouterProvisionChange(T, { exerciceId: EX, entiteId: f.id, compteProvision: '49910000', cloture: 50, dotation: 50, reprise: 0 });
    await service.supprimerProvisionChange(T, p.id);
    expect(tables.provisionsChange).toHaveLength(0);
  });
});

describe('CumulService · tranche 4c, monnaie déclarée et conversion au cours de clôture', () => {
  const ACQ = { coutAcquisition: 800, compteTitres: '26100000', dateEntree: '2024-01-01', capitauxPropresEntree: 900, modeDureeEcart: 'NON_DETERMINABLE' as const };

  it('une filiale en USD déclarée avec ses cours est convertie · la présentation est la monnaie du dossier (CDF par défaut)', async () => {
    const { service, lien, f } = await groupe();
    await service.declarerAcquisition(T, lien.id, ACQ);
    await service.enregistrerMonnaie(T, f.id, {
      monnaieBalance: 'usd',
      justificationMonnaie: 'Prix de vente et coûts en dollars',
      coursCloture: 2,
      coursProduitsCharges: 1.5,
      coursEntree: 1,
      capitauxPropresHistoriques: 3000,
    });
    const r = await service.cumul(T, EX);
    // Actifs 2 000 × 2 = 4 000 ; capitaux propres historiques 3 000 ; résultat (1 000 − 600) × 1,5 = 600 ; écart 400.
    expect(r.conversions).toEqual([{ entite: 'Filiale', monnaie: 'USD', coursCloture: 2, coursProduitsCharges: 1.5, ecartConversion: 400 }]);
    expect(r.conversionsIncompletes).toEqual([]);
    expect(r.reserves.join(' ')).toContain('COURS DE CLÔTURE vers la monnaie de présentation (CDF)');
  });

  it('sans monnaie déclarée, l’entité est nommée · en CDF, elle n’est pas convertie', async () => {
    const { service, lien, f } = await groupe();
    await service.declarerAcquisition(T, lien.id, ACQ);
    expect((await service.cumul(T, EX)).conversionsIncompletes.join(' ')).toMatch(/« Filiale » n’a pas déclaré la monnaie/);
    await service.enregistrerMonnaie(T, f.id, { monnaieBalance: 'CDF' });
    const r = await service.cumul(T, EX);
    expect(r.conversionsIncompletes).toEqual([]);
    expect(r.capitauxPropres).toMatchObject({ reservesGroupe: 1044, resultatGroupe: 812, ecartsConversion: 0 });
  });

  it('refus à la porte · une monnaie étrangère sans justification, un cours nul', async () => {
    const { service, f, tables } = await groupe();
    await expect(service.enregistrerMonnaie(T, f.id, { monnaieBalance: 'USD' })).rejects.toThrow(/monnaie FONCTIONNELLE/);
    await expect(service.enregistrerMonnaie(T, f.id, { monnaieBalance: 'USD', justificationMonnaie: 'x', coursCloture: 0 })).rejects.toThrow(/strictement positif/);
    expect(tables.entites[0].monnaieBalance).toBeUndefined();
  });
});

describe('ConsolidationController · tranche 2', () => {
  it('toute route qui écrit porte @Roles', () => {
    const proto = ConsolidationController.prototype as any;
    for (const m of ['importerBalance', 'declarerAcquisition', 'ajouterReciproque', 'supprimerReciproque', 'ajouterResultatInterne', 'supprimerResultatInterne']) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[m])).toEqual([RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE]);
    }
  });
});
