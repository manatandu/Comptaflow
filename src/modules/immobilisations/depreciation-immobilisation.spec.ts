import { Referentiel, SensDepreciation, SystemeComptableSyscohada } from '@prisma/client';
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

type Depreciation = {
  sens: SensDepreciation;
  montant: number;
  dateFin: string;
  /** Compte de contrepartie de la DOTATION · 69 par défaut, 853 en H.A.O. */
  contrepartie?: string;
};

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

function harnais(
  b: Bien,
  options: { compte29?: string; compteImmobilisation?: string; referentiel?: Referentiel } = {},
) {
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
    compteImmobilisation: {
      id: 'cimmo',
      numero: options.compteImmobilisation ?? '24110000',
      intitule: 'Matériel industriel',
    },
    compteDotationId: 'cd',
    compteAmortissementId: 'ca',
    dotations: (b.dotations ?? []).map((m, i) => ({ montant: m, exerciceId: `exAnt${i}` })),
    depreciations: (b.depreciations ?? []).map((d) => ({
      sens: d.sens,
      montant: d.montant,
      compteDepreciationId: 'c29',
      compteContrepartieId: d.contrepartie ?? 'c69',
      exercice: { dateFin: new Date(d.dateFin) },
    })),
  };

  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: options.referentiel ?? Referentiel.SYSCOHADA,
        systemeComptableSyscohada:
          (options.referentiel ?? Referentiel.SYSCOHADA) === Referentiel.SYSCOHADA
            ? SystemeComptableSyscohada.NORMAL
            : null,
      }),
    },
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
      // `sortir` résout par NUMÉRO (findUnique sur la clé tenant+numéro) le
      // compte de classe 8 de la sortie ET le compte de reprise de
      // dépréciation · le faux rend donc un compte dont l'identifiant porte
      // le numéro demandé, pour que les assertions puissent le nommer.
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { tenantId_numero: { numero: string } } }) =>
          Promise.resolve({
            id: `n${where.tenantId_numero.numero}`,
            numero: where.tenantId_numero.numero,
            intitule: where.tenantId_numero.numero,
          }),
        ),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'c29'
            ? { id: 'c29', numero: options.compte29 ?? '29410000', intitule: 'Dépréciations du matériel' }
            : where.id === 'c69'
              ? { id: 'c69', numero: '69130000', intitule: 'Dotations pour dépréciation' }
              : where.id === 'c853'
                ? { id: 'c853', numero: '85300000', intitule: 'Dotations H.A.O. aux dépréciations' }
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

/**
 * CE QUE LE COMPTE 81 PORTE À LA SORTIE · ET CE QU'IL NE PORTE PAS.
 *
 * Le module soldait bien le 29 (correction d'actif sans actif, sinon), mais
 * SANS REPRISE : c'est la ligne 81, réduite du cumul de dépréciation, qui
 * équilibrait l'écriture. Or les DEUX fiches du COMPTE 81 l'excluent
 * nommément · « ne doit pas servir à enregistrer les DÉPRÉCIATIONS AFFÉRENTES
 * AUX ÉLÉMENTS D'ACTIF IMMOBILISÉ CÉDÉS · utiliser le compte 29 » (skill
 * `sycebnl`, COMPTE 81, Exclusions · skill `audcif-acte-uniforme`, Titre VII,
 * COMPTE 81, Exclusions), et leur « Contenu » ne retranche de la valeur
 * d'entrée que « le cumul des AMORTISSEMENTS pratiqués ».
 *
 * C'EST LE TYPE MÊME DU DÉFAUT MUET : l'écriture restait équilibrée et le
 * résultat NET exact. Seule la VENTILATION était fausse · charge H.A.O.
 * minorée, produit de reprise absent. Aucun contrôle d'équilibre ne pouvait
 * le voir, et le test qui existait ici GELAIT le comportement fautif.
 *
 * Le modèle complet est écrit dans l'AUDCIF, Titre VIII ch. 13 § 4.1 (cession
 * de titres, H.A.O.) : valeur comptable au 816 « égale au coût d'acquisition,
 * NON DIMINUÉ PAR UNE ÉVENTUELLE DÉPRÉCIATION », et dépréciation « REPRISE
 * par le crédit du compte 7972 ».
 */
describe('la sortie solde le compte 29 par une REPRISE, sans toucher au compte 81', () => {
  const sortie = {
    dateSortie: '2026-06-30',
    type: 'MISE_HORS_SERVICE',
    exerciceId: 'exN',
    journalId: 'j1',
  };

  /*
    Brut 10 000 000, trois annuités passées (6 000 000) et une dépréciation de
    1 600 000. La sortie passe d'abord la DOTATION COMPLÉMENTAIRE, calculée
    sur le plan ré-étalé : 1 200 000 (et non 2 000 000). Le cumul amorti
    devient 7 200 000.

    Le compte 81 porte donc 10 000 000 - 7 200 000 = 2 800 000, et NON
    1 200 000. Les 1 600 000 sortent par leurs deux lignes propres : le 29 au
    débit pour solde, le 7914 au crédit pour la reprise.
  */
  const BIEN_DEPRECIE = {
    valeurOrigine: 10_000_000,
    dureeAns: 5,
    dateMiseEnService: '2023-01-15',
    dotations: [2_000_000, 2_000_000, 2_000_000],
    depreciations: [{ sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31' }],
  };

  async function lignesDeSortie(bien: Parameters<typeof harnais>[0], options: Parameters<typeof harnais>[1] = {}) {
    const { svc, ecrituresPostees } = harnais(bien, options);
    await svc.sortir('t1', 'u1', 'i1', sortie as never);
    return ecrituresPostees.find((e) => e.libelle.startsWith('Mise hors service'))!.lignes;
  }

  it('porte au 81 la valeur d’entrée diminuée des SEULS amortissements', async () => {
    const lignes = await lignesDeSortie(BIEN_DEPRECIE);
    // C'est LA valeur que le défaut minorait : 1 200 000 au lieu de 2 800 000.
    expect(lignes.find((l) => l.compteId === 'n81200000')).toEqual({
      compteId: 'n81200000',
      debit: 2_800_000,
      credit: 0,
    });
  });

  it('débite le 29 pour solde ET crédite sa reprise · jamais l’un sans l’autre', async () => {
    const lignes = await lignesDeSortie(BIEN_DEPRECIE);
    expect(lignes.find((l) => l.compteId === 'c29')).toEqual({ compteId: 'c29', debit: 1_600_000, credit: 0 });
    // 7914 « Reprises de dépréciations des immobilisations corporelles »
    // (COMPTE 79, Subdivisions) · le bien est sur un compte 241.
    expect(lignes.find((l) => l.compteId === 'n79140000')).toEqual({
      compteId: 'n79140000',
      debit: 0,
      credit: 1_600_000,
    });
  });

  it('l’écriture reste équilibrée · c’est pourquoi le défaut ne se voyait pas', async () => {
    const lignes = await lignesDeSortie(BIEN_DEPRECIE);
    const total = (cle: 'debit' | 'credit') => lignes.reduce((t, l) => t + (l[cle] ?? 0), 0);
    expect(total('debit')).toBe(total('credit'));
    expect(total('debit')).toBe(11_600_000);
  });

  it('un bien jamais déprécié sort exactement comme avant', async () => {
    const lignes = await lignesDeSortie({
      valeurOrigine: 10_000_000,
      dureeAns: 5,
      dateMiseEnService: '2023-01-15',
      dotations: [2_000_000, 2_000_000, 2_000_000],
    });
    expect(lignes.some((l) => l.compteId === 'c29')).toBe(false);
    expect(lignes.some((l) => l.compteId.startsWith('n79'))).toBe(false);
    // Brut 10 000 000, cumul 8 000 000 (2 000 000 de complément) · VCN 2 000 000.
    expect(lignes.find((l) => l.compteId === 'n81200000')!.debit).toBe(2_000_000);
  });

  it('une dépréciation dotée en H.A.O. se reprend en 863, pas en 79', async () => {
    // Fiche du COMPTE 29 : reprise « par le crédit du compte 79 … ou du
    // compte 863 – Reprises de dépréciations H.A.O. », et fiche du COMPTE 79,
    // Exclusions : « les reprises HAO → 86 ». Le critère est le niveau de la
    // DOTATION, conservé sur la dépréciation.
    const lignes = await lignesDeSortie({
      ...BIEN_DEPRECIE,
      depreciations: [
        { sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31', contrepartie: 'c853' },
      ],
    });
    expect(lignes.find((l) => l.compteId === 'n86300000')).toEqual({
      compteId: 'n86300000',
      debit: 0,
      credit: 1_600_000,
    });
    expect(lignes.some((l) => l.compteId === 'n79140000')).toBe(false);
  });

  it('au SYCEBNL, un bien légué destiné à la vente sort en 818 et se reprend en 795', async () => {
    // 20300000 « Bâtiments destinés à la vente (dons et legs non encore
    // reçus) » · COMPTE 81 SYCEBNL, subdivision 818, et COMPTE 79, subdivision
    // 795 « Reprises des dépréciations d'immobilisations reçues provenant des
    // dons et legs et d'usufruit temporaire ».
    const lignes = await lignesDeSortie(BIEN_DEPRECIE, {
      compteImmobilisation: '20300000',
      referentiel: Referentiel.SYCEBNL,
    });
    expect(lignes.find((l) => l.compteId === 'n81800000')!.debit).toBe(2_800_000);
    expect(lignes.find((l) => l.compteId === 'n79500000')!.credit).toBe(1_600_000);
  });
});
