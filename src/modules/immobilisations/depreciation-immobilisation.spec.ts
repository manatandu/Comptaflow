import { Referentiel, SensDepreciation, SystemeComptableSyscohada } from '@prisma/client';
import { ImmobilisationService, natureImmobilisation, REPRISE_DEPRECIATION_SORTIE } from './immobilisation.service';
import { motifRefusContrepartieUsufruit, motifRefusSortieProjet } from './comptes-du-bien';
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
  options: {
    compte29?: string;
    compteImmobilisation?: string;
    referentiel?: Referentiel;
    /** Système minimal de trésorerie, au référentiel choisi. */
    smt?: boolean;
    /** Jeu « projets de développement » (SYCEBNL). */
    projets?: boolean;
  } = {},
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
    // Une dotation par exercice civil depuis l'année de mise en service · le
    // plafond de reprise (lot 12) lit leur date de clôture.
    dotations: (b.dotations ?? []).map((m, i) => ({
      montant: m,
      exerciceId:
        new Date(b.dateMiseEnService).getUTCFullYear() + i === new Date(exercice.dateFin).getUTCFullYear()
          ? 'exN'
          : `exAnt${i}`,
      exercice: { dateFin: new Date(`${new Date(b.dateMiseEnService).getUTCFullYear() + i}-12-31`) },
    })),
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
            ? options.smt
              ? SystemeComptableSyscohada.MINIMAL_TRESORERIE
              : SystemeComptableSyscohada.NORMAL
            : null,
        jeuEtatsFinanciersSycebnl:
          options.referentiel === Referentiel.SYCEBNL
            ? options.smt
              ? 'SYSTEME_MINIMAL_TRESORERIE'
              : options.projets
                ? 'PROJETS_DEVELOPPEMENT'
                : 'ASSOCIATIONS_ORDRES_PROFESSIONNELS'
            : null,
      }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue(immo),
      // Composants du bien (audit final F127) · ce jeu d'essai n'en porte aucun.
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ ...immo, dotations: immo.dotations }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'exN',
        dateDebut: new Date(exercice.dateDebut),
        dateFin: new Date(exercice.dateFin),
      }),
      // Les exercices du dossier, civils, de l'année de mise en service à
      // celui de la saisie · le plafond de reprise (lot 12) y rejoue le plan.
      findMany: jest.fn().mockImplementation(({ where }: { where: { dateFin: { lte: Date } } }) => {
        const premiere = new Date(b.dateMiseEnService).getUTCFullYear();
        const derniere = new Date(exercice.dateFin).getUTCFullYear();
        return Promise.resolve(
          Array.from({ length: derniere - premiere + 1 }, (_, i) => premiere + i)
            .map((a) => ({
              id: a === derniere ? 'exN' : `ex${a}`,
              dateDebut: new Date(`${a}-01-01`),
              dateFin: new Date(`${a}-12-31`),
            }))
            .filter((e) => e.dateFin <= where.dateFin.lte),
        );
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
              : where.id === 'c79'
                ? { id: 'c79', numero: '79140000', intitule: 'Reprises de dépréciations des immobilisations corporelles' }
              : where.id === 'c681'
                ? { id: 'c681', numero: '68130000', intitule: 'Dotations aux amortissements' }
              : where.id === 'c853'
                ? { id: 'c853', numero: '85300000', intitule: 'Dotations H.A.O. aux dépréciations' }
              : where.id === 'c162'
                ? { id: 'c162', numero: '16200000', intitule: 'Fonds affectés aux investissements · bailleurs' }
              : where.id === 'c165'
                ? { id: 'c165', numero: '16500000', intitule: 'Fonds non consommés' }
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
      compteContrepartieId: 'c79',
    } as never);
    expect(ecrituresPostees[0].lignes).toEqual([
      { compteId: 'c29', debit: 600_000, credit: 0 },
      { compteId: 'c79', debit: 0, credit: 600_000 },
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
        compteContrepartieId: 'c79',
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
    sur le plan ré-étalé (1 200 000 l'an, et non 2 000 000) et arrêtée à la
    date de sortie, le 30 juin · 6 mois, soit 600 000 (audit final F27, fiche
    du COMPTE 81). Le cumul amorti devient 6 600 000.

    Le compte 81 porte donc 10 000 000 - 6 600 000 = 3 400 000, et NON
    1 800 000. Les 1 600 000 sortent par leurs deux lignes propres : le 29 au
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
    // C'est LA valeur que le défaut minorait : 1 800 000 au lieu de 3 400 000.
    expect(lignes.find((l) => l.compteId === 'n81200000')).toEqual({
      compteId: 'n81200000',
      debit: 3_400_000,
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
    // Brut 10 000 000, cumul 7 000 000 (1 000 000 de complément, six mois sur
    // douze, audit final F27) · VCN 3 000 000.
    expect(lignes.find((l) => l.compteId === 'n81200000')!.debit).toBe(3_000_000);
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

  it('au SYCEBNL, un bien légué destiné à la vente sort en 818 et se reprend en 7952', async () => {
    // 20300000 « Bâtiments destinés à la vente (dons et legs non encore
    // reçus) » · COMPTE 81 SYCEBNL, subdivision 818, et COMPTE 79, subdivision
    // 7952 « Reprises des dépréciations d'immobilisations reçues destinées à
    // la vente provenant des dons et legs » · le 795 se subdivise en 7951
    // (usufruit temporaire) et 7952 (destinées à la vente), et c'est bien le
    // second que vise un legs destiné à la vente.
    // Un bien reçu en don destiné à la vente « ne doit pas être amorti »
    // (SYCEBNL, classe 2) · il n'a aucune dotation, et la fiche du compte 81
    // porte alors « la valeur d'entrée, sans déduction des éventuelles
    // dépréciations ».
    const lignes = await lignesDeSortie({ ...BIEN_DEPRECIE, dotations: [] }, {
      compteImmobilisation: '20300000',
      referentiel: Referentiel.SYCEBNL,
    });
    expect(lignes.find((l) => l.compteId === 'n81800000')!.debit).toBe(10_000_000);
    expect(lignes.find((l) => l.compteId === 'n79520000')!.credit).toBe(1_600_000);
  });
});

describe('le Système minimal de trésorerie n’a pas de poste de dépréciation', () => {
  const bien = { valeurOrigine: 10_000_000, dureeAns: 5, dateMiseEnService: '2023-01-15', dotations: [6_000_000] };

  it.each([Referentiel.SYSCOHADA, Referentiel.SYCEBNL])('%s · la dotation est refusée, rien n’est posté', async (referentiel) => {
    const { svc, ecrituresPostees } = harnais(bien, { referentiel, smt: true });
    await expect(svc.enregistrerDepreciation('t1', 'u1', 'i1', DEPRECIATION as never)).rejects.toThrow(
      referentiel === Referentiel.SYCEBNL ? /Partie 4 ch\. 4/ : /Titre X ch\. 2/,
    );
    expect(ecrituresPostees).toHaveLength(0);
  });

  it('la reprise d’une dépréciation antérieure au passage au SMT reste ouverte', async () => {
    const { svc, ecrituresPostees } = harnais(
      { ...bien, depreciations: [{ sens: SensDepreciation.DOTATION, montant: 1_600_000, dateFin: '2025-12-31' }] },
      { smt: true },
    );
    await svc.enregistrerDepreciation('t1', 'u1', 'i1', {
      ...DEPRECIATION,
      sens: SensDepreciation.REPRISE,
      montant: 500_000,
      compteContrepartieId: 'c79',
    } as never);
    expect(ecrituresPostees).toHaveLength(1);
  });
});

describe('les comptes du bien · passe R1 (A1, A4, A5) et R5 (B1)', () => {
  const bien = { valeurOrigine: 10_000_000, dureeAns: 5, dateMiseEnService: '2023-01-15', dotations: [6_000_000] };

  it('SYSCOHADA · le 29 suit la division du bien (Titre VII ch. 2)', async () => {
    // Un matériel (24) déprécié au 293 (bâtiments) est refusé, rien n'est posté.
    const { svc, ecrituresPostees } = harnais(bien, { compte29: '29310000' });
    await expect(svc.enregistrerDepreciation('t1', 'u1', 'i1', DEPRECIATION as never)).rejects.toThrow(
      /attendu un 294/,
    );
    expect(ecrituresPostees).toHaveLength(0);
  });

  it('SYSCOHADA · la contrepartie est celle que la fiche du compte 29 nomme', async () => {
    const { svc, ecrituresPostees } = harnais(bien);
    await expect(
      svc.enregistrerDepreciation('t1', 'u1', 'i1', { ...DEPRECIATION, compteContrepartieId: 'c681' } as never),
    ).rejects.toThrow(/nomme 691, 697, 853/);
    expect(ecrituresPostees).toHaveLength(0);
    // La voie H.A.O. est ouverte, comme la fiche l'écrit.
    const h = harnais(bien);
    await h.svc.enregistrerDepreciation('t1', 'u1', 'i1', { ...DEPRECIATION, compteContrepartieId: 'c853' } as never);
    expect(h.ecrituresPostees).toHaveLength(1);
  });

  it('SYCEBNL · un bien reçu en don destiné à la vente ne se dote pas, il se déprécie', async () => {
    const { svc, ecrituresPostees } = harnais(bien, {
      compteImmobilisation: '20300000',
      referentiel: Referentiel.SYCEBNL,
      compte29: '29020000',
    });
    await expect(svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never)).rejects.toThrow(
      /ne doivent pas être amortis/,
    );
    expect(ecrituresPostees).toHaveLength(0);
  });

  it('SYSCOHADA · un terrain nu ne se dote pas', async () => {
    const { svc, ecrituresPostees } = harnais(bien, { compteImmobilisation: '22210000', compte29: '29220000' });
    await expect(svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never)).rejects.toThrow(
      /2824 travaux de mise en valeur/,
    );
    expect(ecrituresPostees).toHaveLength(0);
  });
});


/**
 * L'USUFRUIT TEMPORAIRE · SYCEBNL Partie 3 ch. 2 § 2.3.2. Il se RÉTROCÈDE au
 * donateur au terme de la donation (D 280 / C 2011, aucun 81), sa
 * dépréciation se dote au 6951 et se reprend au 7951. La division 20 lui
 * prêtait le 818 et le 7952 des biens reçus destinés à la vente.
 */
describe('usufruit temporaire (2011) · rétrocession sans 818, reprise au 7951', () => {
  const USUFRUIT = { compteImmobilisation: '20110000', referentiel: Referentiel.SYCEBNL, compte29: '29010000' };
  const AU_TERME = {
    valeurOrigine: 5_000_000,
    dureeAns: 5,
    dateMiseEnService: '2022-01-01',
    dotations: [1_000_000, 1_000_000, 1_000_000, 1_000_000],
  };
  const retrocession = (date: string, type = 'MISE_HORS_SERVICE') => ({
    dateSortie: date,
    type,
    exerciceId: 'exN',
    journalId: 'j1',
    ...(type === 'CESSION' ? { prixCession: 1, compteContrepartieId: 'c52' } : {}),
  });

  it('au terme, la sortie solde le 280 contre le 2011, sans aucun compte 81', async () => {
    const { svc, ecrituresPostees } = harnais(AU_TERME, USUFRUIT);
    await svc.sortir('t1', 'u1', 'i1', retrocession('2026-12-31') as never);
    const lignes = ecrituresPostees.find((e) => e.libelle.startsWith('Mise hors service'))!.lignes;
    expect(lignes).toEqual([
      { compteId: 'cimmo', debit: 0, credit: 5_000_000 },
      { compteId: 'ca', debit: 5_000_000, credit: 0 },
    ]);
    expect(lignes.some((l) => l.compteId.startsWith('n81'))).toBe(false);
  });

  it('une cession est refusée · l’usufruit se rétrocède', async () => {
    const { svc, ecrituresPostees } = harnais(AU_TERME, USUFRUIT);
    await expect(svc.sortir('t1', 'u1', 'i1', retrocession('2026-12-31', 'CESSION') as never)).rejects.toThrow(
      /rétrocédé au donateur/,
    );
    expect(ecrituresPostees).toEqual([]);
  });

  it('avant le terme, la valeur nette qui subsiste est refusée, aucune écriture', async () => {
    const { svc, ecrituresPostees } = harnais(AU_TERME, USUFRUIT);
    await expect(svc.sortir('t1', 'u1', 'i1', retrocession('2026-06-30') as never)).rejects.toThrow(
      /valeur nette de 500000\.00/,
    );
    expect(ecrituresPostees).toEqual([]);
  });

  it('un bien destiné à la vente (20300000) garde le 818', () => {
    expect(natureImmobilisation('20300000', Referentiel.SYCEBNL)).toBe('DONS_LEGS_VENTE');
    expect(natureImmobilisation('20110000', Referentiel.SYCEBNL)).toBe('USUFRUIT');
  });

  it('la dépréciation d’un usufruit au 6913 est refusée · le texte écrit 6951', async () => {
    const { svc, ecrituresPostees } = harnais(AU_TERME, USUFRUIT);
    await expect(svc.enregistrerDepreciation('t1', 'u1', 'i1', DEPRECIATION as never)).rejects.toThrow(/6951/);
    expect(ecrituresPostees).toEqual([]);
  });

  it('6951 et 7951 seuls, et rien n’est imposé hors du 2011 ni au SYSCOHADA', () => {
    expect(motifRefusContrepartieUsufruit(Referentiel.SYCEBNL, '20110000', SensDepreciation.DOTATION, '69510000')).toBeNull();
    expect(motifRefusContrepartieUsufruit(Referentiel.SYCEBNL, '20110000', SensDepreciation.REPRISE, '79510000')).toBeNull();
    expect(motifRefusContrepartieUsufruit(Referentiel.SYCEBNL, '20110000', SensDepreciation.REPRISE, '79520000')).toContain('7951');
    expect(motifRefusContrepartieUsufruit(Referentiel.SYCEBNL, '20300000', SensDepreciation.REPRISE, '79520000')).toBeNull();
    expect(motifRefusContrepartieUsufruit(Referentiel.SYSCOHADA, '20110000', SensDepreciation.REPRISE, '79140000')).toBeNull();
    expect(REPRISE_DEPRECIATION_SORTIE[Referentiel.SYCEBNL].USUFRUIT).toBe('79510000');
  });
});

/**
 * UN PROJET DE DÉVELOPPEMENT NE SE DOTE PAS · Acte uniforme SYCEBNL, art. 7
 * et 9, décision D-1. Ni dotation de l'exercice, ni complément à la sortie.
 */
describe('projet de développement · aucune dotation', () => {
  const BIEN = { valeurOrigine: 5_000_000, dureeAns: 5, dateMiseEnService: '2025-01-01', dotations: [] as number[] };
  const OPTIONS = { referentiel: Referentiel.SYCEBNL, projets: true, compteImmobilisation: '24410000' };

  it('la dotation est refusée, motif nommé, aucune écriture', async () => {
    const { svc, ecrituresPostees } = harnais(BIEN, OPTIONS);
    await expect(svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never)).rejects.toThrow(
      /art\. 7 et 9/,
    );
    expect(ecrituresPostees).toEqual([]);
  });

  it('une association du même référentiel se dote toujours', async () => {
    const { svc, ecrituresPostees } = harnais(BIEN, { ...OPTIONS, projets: false });
    await svc.passerDotation('t1', 'u1', 'i1', { exerciceId: 'exN', journalId: 'j1' } as never);
    expect(ecrituresPostees).toHaveLength(1);
  });

  it('la sortie ne passe aucun complément de dotation', async () => {
    const { svc, ecrituresPostees } = harnais(BIEN, OPTIONS);
    await svc.sortir('t1', 'u1', 'i1', { dateSortie: '2026-06-30', type: 'MISE_HORS_SERVICE', exerciceId: 'exN', journalId: 'j1', compteFondsProjetId: 'c162' } as never);
    expect(ecrituresPostees.some((e) => e.libelle.startsWith('Dotation complémentaire'))).toBe(false);
  });
});

/**
 * LA FIN D'UN PROJET DE DÉVELOPPEMENT · SYCEBNL Partie 3 ch. 3 § 2.5. Le
 * fonds affecté (162 à 164) reprend le bien, sans 28 ni 81 ; la cession garde
 * son prix au 82.
 */
describe('fin de projet de développement · le fonds reprend le bien', () => {
  const BIEN = { valeurOrigine: 8_000_000, dureeAns: 5, dateMiseEnService: '2025-01-01', dotations: [] as number[] };
  const OPTIONS = { referentiel: Referentiel.SYCEBNL, projets: true, compteImmobilisation: '24410000' };
  const sortie = (type: string, extra: Record<string, unknown> = {}) => ({
    dateSortie: '2026-06-30', type, exerciceId: 'exN', journalId: 'j1', compteFondsProjetId: 'c162', ...extra,
  });

  it('restitution, vol ou remise gratuite · D 162 / C 2, rien d’autre', async () => {
    const { svc, ecrituresPostees } = harnais(BIEN, OPTIONS);
    await svc.sortir('t1', 'u1', 'i1', sortie('MISE_HORS_SERVICE') as never);
    expect(ecrituresPostees).toHaveLength(1);
    expect(ecrituresPostees[0].libelle).toMatch(/^Fin de projet/);
    expect(ecrituresPostees[0].lignes).toEqual([
      { compteId: 'cimmo', debit: 0, credit: 8_000_000 },
      { compteId: 'c162', debit: 8_000_000, credit: 0 },
    ]);
  });

  it('cession · la même sortie, et le prix au 82 par la contrepartie', async () => {
    const { svc, ecrituresPostees } = harnais(BIEN, OPTIONS);
    await svc.sortir('t1', 'u1', 'i1', sortie('CESSION', { prixCession: 1_500_000, compteContrepartieId: 'c485' }) as never);
    expect(ecrituresPostees[0].lignes.some((l) => l.compteId.startsWith('n81'))).toBe(false);
    expect(ecrituresPostees[1].lignes).toEqual([
      { compteId: 'c485', debit: 1_500_000, credit: 0 },
      { compteId: 'n82200000', debit: 0, credit: 1_500_000 },
    ]);
  });

  it('sans compte de fonds, ou avec un autre que 162 à 164, refusé sans écriture', async () => {
    for (const fonds of [undefined, 'c165']) {
      const { svc, ecrituresPostees } = harnais(BIEN, OPTIONS);
      await expect(svc.sortir('t1', 'u1', 'i1', sortie('MISE_HORS_SERVICE', { compteFondsProjetId: fonds }) as never)).rejects.toThrow(/162, 163/);
      expect(ecrituresPostees).toEqual([]);
    }
  });

  it('une association ne reçoit pas de compte de fonds, et sort toujours par le 81', async () => {
    const { svc } = harnais(BIEN, { ...OPTIONS, projets: false });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie('MISE_HORS_SERVICE') as never)).rejects.toThrow(/projet de développement/);
  });

  it('un bien de projet déjà amorti est refusé · art. 7 et 9', () => {
    expect(motifRefusSortieProjet({ projet: true, numeroCompteFonds: '16200000', cumulAmorti: 100, cumulDepreciation: 0 })).toContain('art. 7 et 9');
    expect(motifRefusSortieProjet({ projet: true, numeroCompteFonds: '16300000', cumulAmorti: 0, cumulDepreciation: 0 })).toBeNull();
    expect(motifRefusSortieProjet({ projet: false, numeroCompteFonds: null, cumulAmorti: 5, cumulDepreciation: 0 })).toBeNull();
  });
});

describe('lot 12 · le plafond de reprise, plan d’origine rejoué (ch. 12 § 2.4.2)', () => {
  /*
    L'exemple du texte, repris tel quel. Matériel de 30 000 000 acquis le
    02 janvier N-1 (ici 2024), dix ans · 3 000 000 par an. Fin N (2025),
    valeur actuelle 20 000 000, perte de valeur de 4 000 000, puis 2 500 000
    par an sur les huit années restantes. Fin N+2 (2027), valeur nette
    15 000 000, valeur sans dépréciation 18 000 000 · « l'entité peut reprendre
    la perte de valeur à hauteur de 2 000 000 » si la valeur actuelle est de
    17 000 000, et « limitera la reprise à 3 000 000 » si elle est de
    19 000 000.
  */
  const pont = {
    valeurOrigine: 30_000_000,
    dureeAns: 10,
    dateMiseEnService: '2024-01-02',
    dotations: [3_000_000, 3_000_000, 2_500_000, 2_500_000],
    depreciations: [{ sens: SensDepreciation.DOTATION, montant: 4_000_000, dateFin: '2025-12-31' }],
    exercice: { dateDebut: '2027-01-01', dateFin: '2027-12-31' },
  };
  const reprise = (montant: number) =>
    ({ ...DEPRECIATION, sens: SensDepreciation.REPRISE, montant, compteContrepartieId: 'c79' }) as never;

  it('les trois valeurs du texte · 15 000 000, 18 000 000, 3 000 000 au plus', async () => {
    const { svc } = harnais(pont);
    await expect(svc.plafondReprise('t1', 'i1', 'exN')).resolves.toEqual({
      cumulDepreciation: 4_000_000,
      valeurNette: 15_000_000,
      valeurSansDepreciation: 18_000_000,
      plafond: 3_000_000,
    });
  });

  it('2 000 000 et 3 000 000 passent, 3 000 001 est refusé · le cumul du 29 (4 000 000) ne suffit plus', async () => {
    for (const montant of [2_000_000, 3_000_000]) {
      const { svc, ecrituresPostees } = harnais(pont);
      await svc.enregistrerDepreciation('t1', 'u1', 'i1', reprise(montant));
      expect(ecrituresPostees[0].lignes[0]).toEqual({ compteId: 'c29', debit: montant, credit: 0 });
    }
    const { svc, ecrituresPostees } = harnais(pont);
    await expect(svc.enregistrerDepreciation('t1', 'u1', 'i1', reprise(3_000_001))).rejects.toThrow(
      /plafonnée à 3000000\.00.*18000000\.00.*15000000\.00.*§ 2\.4\.2/,
    );
    expect(ecrituresPostees).toHaveLength(0);
  });

  it('la dotation de l’exercice non encore passée compte comme le texte l’écrit (« après amortissement et reprise »)', async () => {
    const { svc } = harnais({ ...pont, dotations: [3_000_000, 3_000_000, 2_500_000] });
    const v = await svc.plafondReprise('t1', 'i1', 'exN');
    expect(v.valeurNette).toBeCloseTo(15_000_000, 2);
    expect(v.plafond).toBeCloseTo(3_000_000, 2);
  });

  it('l’année même de la perte, rien ne se reprend au-delà de ce que le plan d’origine aurait laissé', async () => {
    // Fin 2025 · valeur nette 20 000 000, sans dépréciation 24 000 000 · le
    // plafond est le cumul, 4 000 000, l'écart lui étant égal.
    const { svc } = harnais({ ...pont, dotations: [3_000_000, 3_000_000], exercice: { dateDebut: '2025-01-01', dateFin: '2025-12-31' } });
    await expect(svc.plafondReprise('t1', 'i1', 'exN')).resolves.toMatchObject({ valeurNette: 20_000_000, valeurSansDepreciation: 24_000_000, plafond: 4_000_000 });
  });

  it('un terrain ne s’amortit pas · son plafond est le cumul du 29', async () => {
    const { svc } = harnais(
      // Une durée saisie par erreur n'y change rien · le plan ne l'amortit pas.
      { valeurOrigine: 50_000_000, dureeAns: 20, dateMiseEnService: '2024-01-02', depreciations: [{ sens: SensDepreciation.DOTATION, montant: 8_000_000, dateFin: '2025-12-31' }] },
      { compteImmobilisation: '22310000', compte29: '29230000' },
    );
    await expect(svc.plafondReprise('t1', 'i1', 'exN')).resolves.toMatchObject({ valeurSansDepreciation: 50_000_000, plafond: 8_000_000 });
  });

  it('une durée nulle ne divise pas par zéro · le bien garde sa valeur, le plafond est le cumul', async () => {
    const { svc } = harnais(
      { valeurOrigine: 50_000_000, dureeAns: 0, dateMiseEnService: '2024-01-02', depreciations: [{ sens: SensDepreciation.DOTATION, montant: 8_000_000, dateFin: '2025-12-31' }] },
      { compteImmobilisation: '22110000', compte29: '29210000' },
    );
    await expect(svc.plafondReprise('t1', 'i1', 'exN')).resolves.toMatchObject({ valeurSansDepreciation: 50_000_000, plafond: 8_000_000 });
  });
});
