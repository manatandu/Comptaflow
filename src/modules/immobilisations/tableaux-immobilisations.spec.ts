import { SensDepreciation } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LES DEUX TABLEAUX DU CYCLE IMMOBILISATIONS.
 *
 * Le logiciel tenait la fiche de chaque bien et savait passer sa dotation ; il
 * ne produisait NI le tableau des immobilisations NI celui des amortissements,
 * qui sont les deux premières pièces du cycle chez un réviseur. Modèle relevé
 * sur le dossier ouvert sur le Drive (« Fichier immos et AMORTIS »).
 *
 * Deux points que ces tests gardent, parce qu'ils sont invisibles à la
 * relecture et faux au premier refactoring :
 *
 *  - l'AMORTISSEMENT ANTÉRIEUR entre dans le cumul. Un bien repris d'un
 *    dossier précédent porte un cumul que nos dotations ne contiennent pas ;
 *    l'omettre affiche une valeur nette égale au brut sur un matériel de vingt
 *    ans, chiffre parfaitement plausible à l'œil ;
 *  - la SOMME DES DOUZE COLONNES est exactement la dotation, au centime. Une
 *    mensualité arrondie douze fois ne retombe pas sur son total, et l'écart
 *    apparaîtrait dans un état dont personne ne saurait l'expliquer.
 */

const EXERCICE = { id: 'ex2025', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') };

function bien(opts: {
  id: string;
  designation: string;
  compte?: { id: string; numero: string; intitule: string };
  valeurOrigine: number;
  dureeAns: number;
  dateAcquisition: string;
  dateMiseEnService?: string;
  amortissementAnterieur?: number;
  dotations?: Array<{ montant: number; exerciceId: string; dateFin: string }>;
  depreciations?: Array<{ sens: SensDepreciation; montant: number; dateFin: string }>;
  dateSortie?: string;
}) {
  return {
    id: opts.id,
    designation: opts.designation,
    numeroInventaire: null,
    compteImmobilisation: opts.compte ?? { id: 'c221499', numero: '221499', intitule: "Matériel d'exploitation" },
    dateAcquisition: new Date(opts.dateAcquisition),
    dateMiseEnService: new Date(opts.dateMiseEnService ?? opts.dateAcquisition),
    valeurOrigine: opts.valeurOrigine,
    valeurResiduelle: 0,
    dureeAmortissementAns: opts.dureeAns,
    amortissementAnterieur: opts.amortissementAnterieur ?? 0,
    statut: 'EN_SERVICE',
    dateSortie: opts.dateSortie ? new Date(opts.dateSortie) : null,
    dotations: (opts.dotations ?? []).map((d) => ({
      montant: d.montant,
      exerciceId: d.exerciceId,
      exercice: { dateFin: new Date(d.dateFin) },
    })),
    // Voir amortissement-anterieur.spec.ts · les dépréciations accompagnent
    // désormais le bien partout où l'annuité est calculée.
    depreciations: (opts.depreciations ?? []).map((d) => ({
      sens: d.sens,
      montant: d.montant,
      exercice: { dateFin: new Date(d.dateFin) },
    })),
  };
}

function service(biens: ReturnType<typeof bien>[]) {
  const prisma = {
    immobilisation: { findMany: jest.fn().mockResolvedValue(biens) },
    exercice: { findFirstOrThrow: jest.fn().mockResolvedValue(EXERCICE) },
  } as unknown as PrismaService;
  return new ImmobilisationService(prisma, {} as EcritureService);
}

describe('tableau des immobilisations', () => {
  it('groupe par compte d’imputation, avec sous-total · c’est lui qui recoupe la balance', async () => {
    const s = service([
      bien({ id: 'a', designation: 'Concasseur', valeurOrigine: 100_000, dureeAns: 5, dateAcquisition: '2020-01-01' }),
      bien({
        id: 'b',
        designation: 'Jeep',
        compte: { id: 'c221198', numero: '221198', intitule: 'Matériel roulant' },
        valeurOrigine: 30_000,
        dureeAns: 3,
        dateAcquisition: '2023-01-01',
      }),
    ]);
    const t = await s.tableauImmobilisations('tn');
    expect(t.groupes.map((g) => g.numero)).toEqual(['221198', '221499']);
    expect(t.groupes.find((g) => g.numero === '221499')!.brut).toBe(100_000);
    expect(t.totaux.brut).toBe(130_000);
  });

  it('compte l’AMORTISSEMENT ANTÉRIEUR dans le cumul', async () => {
    // Sans lui, ce bien repris afficherait une valeur nette de 100 000 · le
    // brut entier, sur un matériel amorti à 80 %.
    const s = service([
      bien({
        id: 'a',
        designation: 'Pont bascule repris',
        valeurOrigine: 100_000,
        dureeAns: 5,
        dateAcquisition: '2018-01-01',
        amortissementAnterieur: 80_000,
      }),
    ]);
    const t = await s.tableauImmobilisations('tn');
    expect(t.totaux.amortissements).toBe(80_000);
    expect(t.totaux.net).toBe(20_000);
  });

  it('écarte les dotations POSTÉRIEURES à la date d’arrêté', async () => {
    // Un tableau au 30/09 ne peut pas porter la dotation de décembre.
    const s = service([
      bien({
        id: 'a',
        designation: 'Crible',
        valeurOrigine: 60_000,
        dureeAns: 5,
        dateAcquisition: '2023-01-01',
        dotations: [
          { montant: 12_000, exerciceId: 'ex2023', dateFin: '2023-12-31' },
          { montant: 12_000, exerciceId: 'ex2025', dateFin: '2025-12-31' },
        ],
      }),
    ]);
    const t = await s.tableauImmobilisations('tn', { dateArret: '2025-09-30' });
    expect(t.totaux.amortissements).toBe(12_000);
  });
});

describe('tableau des amortissements · douze colonnes', () => {
  it('ouvre une colonne par mois de l’exercice', async () => {
    const t = await service([]).tableauAmortissements('tn', 'ex2025');
    expect(t.mois).toHaveLength(12);
    expect(t.mois[0].libelle).toBe('Janv.');
    expect(t.mois[11].libelle).toBe('Déc.');
  });

  it('somme des douze colonnes = dotation, AU CENTIME', async () => {
    // 10 000 / 3 ans = 3 333,33 sur douze mois · 277,78 arrondi douze fois
    // donnerait 3 333,36. Le reliquat tombe sur le dernier mois servi.
    const s = service([
      bien({
        id: 'a',
        designation: 'Bien à annuité indivisible',
        valeurOrigine: 10_000,
        dureeAns: 3,
        dateAcquisition: '2023-01-01',
        dotations: [{ montant: 3_333.33, exerciceId: 'ex2023', dateFin: '2023-12-31' }],
      }),
    ]);
    const t = await s.tableauAmortissements('tn', 'ex2025');
    const ligne = t.groupes[0].lignes[0];
    const somme = Math.round(ligne.parMois.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(somme).toBe(ligne.dotation);
  });

  it('ne sert que les mois où le bien est en service · entrée en cours d’exercice', async () => {
    const s = service([
      bien({
        id: 'a',
        designation: 'Acquis en juin',
        valeurOrigine: 12_000,
        dureeAns: 5,
        dateAcquisition: '2025-06-15',
      }),
    ]);
    const t = await s.tableauAmortissements('tn', 'ex2025');
    const l = t.groupes[0].lignes[0];
    // Janvier à mai vides, juin à décembre servis.
    expect(l.parMois.slice(0, 5).every((m) => m === 0)).toBe(true);
    expect(l.parMois.slice(5).every((m) => m > 0)).toBe(true);
  });

  it('s’arrête au mois de SORTIE', async () => {
    const s = service([
      bien({
        id: 'a',
        designation: 'Cédé en septembre',
        valeurOrigine: 12_000,
        dureeAns: 5,
        dateAcquisition: '2022-01-01',
        dateSortie: '2025-09-20',
        dotations: [{ montant: 2_400, exerciceId: 'ex2023', dateFin: '2023-12-31' }],
      }),
    ]);
    const t = await s.tableauAmortissements('tn', 'ex2025');
    const l = t.groupes[0].lignes[0];
    expect(l.parMois.slice(9).every((m) => m === 0)).toBe(true);
    expect(l.parMois[8]).toBeGreaterThan(0);
  });

  it('retient la dotation COMPTABILISÉE plutôt que de la recalculer', async () => {
    // Un tableau qui recalculerait ce qui est passé afficherait autre chose que
    // les comptes · et c'est le tableau qu'on croirait.
    const s = service([
      bien({
        id: 'a',
        designation: 'Bien doté à la main',
        valeurOrigine: 12_000,
        dureeAns: 5,
        dateAcquisition: '2022-01-01',
        dotations: [{ montant: 999.99, exerciceId: 'ex2025', dateFin: '2025-12-31' }],
      }),
    ]);
    const t = await s.tableauAmortissements('tn', 'ex2025');
    const l = t.groupes[0].lignes[0];
    expect(l.dotation).toBe(999.99);
    expect(l.dotationPassee).toBe(true);
  });

  it('marque « à passer » une dotation seulement calculée', async () => {
    const s = service([
      bien({ id: 'a', designation: 'Non doté', valeurOrigine: 12_000, dureeAns: 5, dateAcquisition: '2022-01-01' }),
    ]);
    const t = await s.tableauAmortissements('tn', 'ex2025');
    expect(t.groupes[0].lignes[0].dotationPassee).toBe(false);
  });

  it('porte le TAUX, pas seulement la durée', async () => {
    const s = service([
      bien({ id: 'a', designation: 'Bien', valeurOrigine: 12_000, dureeAns: 3, dateAcquisition: '2022-01-01' }),
    ]);
    const t = await s.tableauAmortissements('tn', 'ex2025');
    expect(t.groupes[0].lignes[0].taux).toBe(33.33);
  });

  it('totalise mois par mois, pas seulement en fin de ligne', async () => {
    const s = service([
      bien({ id: 'a', designation: 'A', valeurOrigine: 12_000, dureeAns: 1, dateAcquisition: '2025-01-01' }),
      bien({ id: 'b', designation: 'B', valeurOrigine: 24_000, dureeAns: 1, dateAcquisition: '2025-01-01' }),
    ]);
    const t = await s.tableauAmortissements('tn', 'ex2025');
    expect(t.totaux.parMois).toHaveLength(12);
    expect(Math.round(t.totaux.parMois.reduce((a, b) => a + b, 0) * 100) / 100).toBe(t.totaux.dotation);
    expect(t.totaux.dotation).toBe(36_000);
  });
});
