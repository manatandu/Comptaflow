import { SensDepreciation } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LA DÉPRÉCIATION DANS LE MODULE · ce qui divergeait en silence.
 *
 * Les comptes 29 étaient semés et mouvementables à la main, mais le module
 * tenait le bien au coût historique. Deux conséquences, invisibles toutes les
 * deux parce qu'aucune écriture ne se déséquilibrait :
 *
 *  1. LA BASE AMORTISSABLE. AUDCIF, Titre VIII ch. 12 § 2.4.1 · « après la
 *     comptabilisation d'une perte de valeur, le plan d'amortissement de
 *     l'actif doit être ajusté pour les exercices suivants, afin que la valeur
 *     comptable révisée, diminuée de sa valeur résiduelle, puisse être répartie
 *     de façon systématique sur sa durée d'utilité restant à courir ». Le
 *     § 2.3.2 le chiffre, et c'est le premier cas ci-dessous.
 *  2. LA SORTIE. Les deux textes inscrivent la dépréciation « distinctement à
 *     l'actif, EN DIMINUTION DE LA VALEUR BRUTE des biens correspondants pour
 *     donner leur valeur comptable nette » (SYCEBNL, fiche du COMPTE 29 ·
 *     AUDCIF art. 46). Ne pas la solder à la sortie laissait au bilan une
 *     correction d'actif sans actif, et surévaluait la VCN portée au 81.
 *
 * La règle vaut des DEUX côtés : l'art. 46 n'est pas dans la liste d'exclusion
 * de l'art. 3 du SYCEBNL, et la fiche du COMPTE 29 dit la même chose.
 */

type Faux = Record<string, unknown>;

type Depreciation = { sens: SensDepreciation; montant: number; dateFin: string };

interface Bien {
  valeurOrigine: number;
  valeurResiduelle?: number;
  dureeAns: number;
  dateMiseEnService: string;
  dotations?: number[];
  amortissementAnterieur?: number;
  depreciations?: Depreciation[];
  exercice?: { dateDebut: string; dateFin: string };
}

/** Les lignes réellement postées au grand livre, dans l'ordre. */
type Ligne = { compteId: string; debit: number; credit: number };

function harnais(b: Bien, options: { compte29?: string } = {}) {
  const exercice = b.exercice ?? { dateDebut: '2026-01-01', dateFin: '2026-12-31' };
  const ecrituresPostees: Array<{ libelle: string; lignes: Ligne[] }> = [];
  const creations: Faux[] = [];

  const immo = {
    id: 'i1',
    designation: 'Matériel industriel',
    statut: 'EN_SERVICE',
    valeurOrigine: b.valeurOrigine,
    valeurResiduelle: b.valeurResiduelle ?? 0,
    dureeAmortissementAns: b.dureeAns,
    dateMiseEnService: new Date(b.dateMiseEnService),
    amortissementAnterieur: b.amortissementAnterieur ?? 0,
    compteImmobilisationId: 'cimmo',
    compteImmobilisation: { id: 'cimmo', numero: '24110000', intitule: 'Matériel industriel' },
    compteDotationId: 'cd',
    compteAmortissementId: 'ca',
    dotations: (b.dotations ?? []).map((m, i) => ({ montant: m, exerciceId: `exAnt${i}` })),
    depreciations: (b.depreciations ?? []).map((d) => ({
      sens: d.sens,
      montant: d.montant,
      compteDepreciationId: 'c29',
      exercice: { dateFin: new Date(d.dateFin) },
    })),
  };

  const prisma = {
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue(immo),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ ...immo, dotations: immo.dotations }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'exN',
        dateDebut: new Date(exercice.dateDebut),
        dateFin: new Date(exercice.dateFin),
      }),
    },
    compte: {
      // `sortir` résout les comptes de classe 8 par leur NUMÉRO (findUnique
      // sur la clé tenant+numéro), pas par leur identifiant.
      findUnique: jest.fn().mockResolvedValue({ id: 'c812', numero: '81200000', intitule: 'Valeur comptable des cessions' }),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'c29'
            ? { id: 'c29', numero: options.compte29 ?? '29410000', intitule: 'Dépréciations du matériel' }
            : where.id === 'c69'
              ? { id: 'c69', numero: '69130000', intitule: 'Dotations pour dépréciation' }
              : { id: where.id, numero: '81200000', intitule: 'Valeur comptable des cessions' },
        ),
      ),
    },
    dotationAmortissement: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'd1' }),
    },
    depreciationImmobilisation: {
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        creations.push(data);
        return Promise.resolve({ id: 'dep1', ...data });
      }),
    },
  } as Faux;

  const ecritures = {
    creer: jest
      .fn()
      .mockImplementation((_t: string, _u: string, dto: { libelle: string; lignes: Ligne[] }) => {
        ecrituresPostees.push({ libelle: dto.libelle, lignes: dto.lignes });
        return Promise.resolve({ id: `e${ecrituresPostees.length}` });
      }),
  } as unknown as EcritureService;

  return {
    svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures),
    ecrituresPostees,
    creations,
  };
}

const DEPRECIATION = {
  exerciceId: 'exN',
  journalId: 'j1',
  sens: SensDepreciation.DOTATION,
  montant: 1_600_000,
  compteDepreciationId: 'c29',
  compteContrepartieId: 'c69',
  indice: 'Baisse du prix du marché du matériel neuf, de 10 000 000 à 6 000 000',
};

describe('la base amortissable se ré-étale après la perte de valeur', () => {
  /*
    Le cas chiffré du ch. 12 § 2.3.2, repris tel quel. Matériel de 10 000 000,
    linéaire sur 5 ans, valeur résiduelle nulle. À la fin de la 3e année la VNC
    est de 4 000 000 ; le même matériel neuf ne vaut plus que 6 000 000, donc la
    valeur actuelle est de 6 000 000 × 0,40 = 2 400 000, et la dépréciation de
    1 600 000. Le texte conclut : « la VNC du matériel après cette dépréciation
    s'élève à 2 400 000 et constitue la NOUVELLE BASE AMORTISSABLE, qui sera
    amortie sur la DURÉE RESTANT À COURIR (deux ans) ».
  */
  const materiel = {
    valeurOrigine: 10_000_000,
    dureeAns: 5,
    dateMiseEnService: '2023-01-15',
    dotations: [2_000_000, 2_000_000, 2_000_000],
    exercice: { dateDebut: '2026-01-01', dateFin: '2026-12-31' },
  };

  it('1 200 000 par an sur les deux années restantes, et non 2 000 000', async () => {
    const { svc, ecrituresPostees } = harnais({
      ...materiel,
      depreciations: [{ sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31' }],
    });
    await svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never);
    expect(ecrituresPostees[0].lignes[0].debit).toBe(1_200_000);
  });

  it('sans dépréciation, l’annuité ne bouge pas · le plan ne se ré-étale que là', async () => {
    // Garde-fou de non-régression : ré-étaler partout modifierait le plan de
    // tous les biens du parc, ce que ni l'un ni l'autre texte ne demande.
    const { svc, ecrituresPostees } = harnais(materiel);
    await svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never);
    expect(ecrituresPostees[0].lignes[0].debit).toBe(2_000_000);
  });

  it('la dernière annuité absorbe exactement ce qui reste', async () => {
    // Cinquième et dernier exercice du plan · 10 000 000 amortis de 8 000 000
    // et dépréciés de 1 600 000, il ne reste que 400 000, à répartir sur la
    // seule année restante. Le bien ne s'amortit jamais au-delà de sa valeur.
    const { svc, ecrituresPostees } = harnais({
      ...materiel,
      dotations: [2_000_000, 2_000_000, 2_000_000, 2_000_000],
      depreciations: [{ sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31' }],
      exercice: { dateDebut: '2027-01-01', dateFin: '2027-12-31' },
    });
    await svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never);
    expect(ecrituresPostees[0].lignes[0].debit).toBe(400_000);
  });
});

describe('l’écriture de dépréciation, dans le sens que la fiche du COMPTE 29 écrit', () => {
  const bien = { valeurOrigine: 10_000_000, dureeAns: 5, dateMiseEnService: '2023-01-15', dotations: [6_000_000] };

  it('la dotation CRÉDITE le 29 par le débit du 69', async () => {
    const { svc, ecrituresPostees, creations } = harnais(bien);
    await svc.enregistrerDepreciation('t1', 'u1', 'i1', DEPRECIATION as never);
    expect(ecrituresPostees[0].lignes).toEqual([
      { compteId: 'c69', debit: 1_600_000, credit: 0 },
      { compteId: 'c29', debit: 0, credit: 1_600_000 },
    ]);
    // L'indice est conservé · sans indice, aucun test n'est requis (§ 2.1),
    // donc aucune dotation n'est justifiable devant un réviseur.
    expect(creations[0].indice).toContain('Baisse du prix du marché');
  });

  it('la reprise DÉBITE le 29 par le crédit du 79', async () => {
    const { svc, ecrituresPostees } = harnais({
      ...bien,
      depreciations: [{ sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31' }],
    });
    await svc.enregistrerDepreciation('t1', 'u1', 'i1', {
      ...DEPRECIATION,
      sens: SensDepreciation.REPRISE,
      montant: 600_000,
    } as never);
    expect(ecrituresPostees[0].lignes).toEqual([
      { compteId: 'c29', debit: 600_000, credit: 0 },
      { compteId: 'c69', debit: 0, credit: 600_000 },
    ]);
  });

  it('refuse une reprise supérieure à la dépréciation encore inscrite', async () => {
    // Sinon le compte 29 deviendrait DÉBITEUR, et la correction d'actif « de
    // sens négatif » (fiche du COMPTE 29) se retournerait en majoration.
    const { svc } = harnais({
      ...bien,
      depreciations: [{ sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31' }],
    });
    await expect(
      svc.enregistrerDepreciation('t1', 'u1', 'i1', {
        ...DEPRECIATION,
        sens: SensDepreciation.REPRISE,
        montant: 2_000_000,
      } as never),
    ).rejects.toThrow(/reprise ne peut pas dépasser/i);
  });

  it('refuse une dépréciation qui ferait descendre la valeur nette sous zéro', async () => {
    const { svc } = harnais(bien);
    await expect(
      svc.enregistrerDepreciation('t1', 'u1', 'i1', { ...DEPRECIATION, montant: 5_000_000 } as never),
    ).rejects.toThrow(/valeur comptable nette/i);
  });

  it('refuse un compte qui n’est pas un 29 · le 39, le 49 et le 59 sont exclus', async () => {
    // Fiche du COMPTE 29, « exclusions » : 39 pour les stocks, 49 pour les
    // tiers, 59 pour la trésorerie. Le sous-compte de 29 reste libre.
    for (const numero of ['39310000', '49100000', '59100000', '68110000']) {
      const { svc } = harnais(bien, { compte29: numero });
      await expect(svc.enregistrerDepreciation('t1', 'u1', 'i1', DEPRECIATION as never)).rejects.toThrow(
        /compte 29/i,
      );
    }
  });
});

describe('la sortie solde le compte 29 et retranche la dépréciation de la VCN', () => {
  const sortie = {
    dateSortie: '2026-06-30',
    type: 'MISE_HORS_SERVICE',
    exerciceId: 'exN',
    journalId: 'j1',
  };

  it('le 29 est débité pour solde, et la valeur comptable nette en tient compte', async () => {
    /*
      Brut 10 000 000, trois annuités passées (6 000 000) et une dépréciation
      de 1 600 000. La sortie passe d'abord la DOTATION COMPLÉMENTAIRE de
      l'exercice, et elle se calcule déjà sur le plan ré-étalé : 1 200 000, pas
      2 000 000. Le cumul amorti devient donc 7 200 000, et la valeur comptable
      nette 10 000 000 - 7 200 000 - 1 600 000 = 1 200 000.

      Sans le 29 soldé, cette VCN aurait valu 1 600 000 de plus et serait partie
      telle quelle au 81 · l'écriture serait restée équilibrée, la ligne 81
      absorbant l'écart, et une moins-value se serait présentée en plus-value.
    */
    const { svc, ecrituresPostees } = harnais({
      valeurOrigine: 10_000_000,
      dureeAns: 5,
      dateMiseEnService: '2023-01-15',
      dotations: [2_000_000, 2_000_000, 2_000_000],
      depreciations: [{ sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31' }],
    });
    await svc.sortir('t1', 'u1', 'i1', sortie as never);

    const ecritureSortie = ecrituresPostees.find((e) => e.libelle.startsWith('Mise hors service'))!;
    const ligne = (compteId: string) => ecritureSortie.lignes.find((l) => l.compteId === compteId);
    // Le brut au crédit, les amortissements et la dépréciation au débit.
    expect(ligne('cimmo')!.credit).toBe(10_000_000);
    expect(ligne('c29')).toBeDefined();
    expect(ligne('c29')!.debit).toBe(1_600_000);

    // Ce qui reste est la VCN · c'est elle qui part au 81. Sans le 29 soldé,
    // elle aurait valu 1 600 000 de plus, sans qu'aucune écriture ne se
    // déséquilibre : la ligne 81 aurait simplement absorbé l'écart.
    const debitsHorsAmortEtDepr = ecritureSortie.lignes.filter(
      (l) => l.compteId !== 'cimmo' && l.compteId !== 'ca' && l.compteId !== 'c29',
    );
    expect(debitsHorsAmortEtDepr).toHaveLength(1);
    expect(debitsHorsAmortEtDepr[0].debit).toBe(1_200_000);
  });

  it('un bien jamais déprécié sort exactement comme avant', async () => {
    const { svc, ecrituresPostees } = harnais({
      valeurOrigine: 10_000_000,
      dureeAns: 5,
      dateMiseEnService: '2023-01-15',
      dotations: [2_000_000, 2_000_000, 2_000_000],
    });
    await svc.sortir('t1', 'u1', 'i1', sortie as never);
    const ecritureSortie = ecrituresPostees.find((e) => e.libelle.startsWith('Mise hors service'))!;
    expect(ecritureSortie.lignes.some((l) => l.compteId === 'c29')).toBe(false);
  });
});
