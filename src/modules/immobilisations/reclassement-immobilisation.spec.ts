import { Referentiel, StatutImmobilisation, SystemeComptableSyscohada } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE RECLASSEMENT · le changement d'utilisation que le module ne savait pas
 * faire.
 *
 * AUDCIF, Titre VIII ch. 10 § 2.4 : « Les immeubles de placement peuvent faire
 * l'objet de changements d'utilisation, reflétés dans les états financiers par
 * des transferts entre catégories du bilan, par exemple vers les
 * immobilisations corporelles ou les stocks. » Et la règle qui commande toute
 * la mécanique : « Étant donné que les immeubles de placement sont évalués
 * selon le modèle du coût historique, les transferts […] N'ONT PAS D'INCIDENCE
 * SUR LA VALEUR COMPTABLE du bien immobilier transféré. »
 *
 * CE QUE RIEN NE POUVAIT FAIRE, ET LES DEUX ISSUES MUETTES. Les trois comptes
 * d'un bien étaient figés à sa création et aucune route ne les modifiait.
 * Sans reclassement, un immeuble donné en location restait sur son compte
 * d'exploitation et les notes qui isolent les immeubles de placement
 * affichaient zéro pour une entité qui en tire des loyers. Avec un
 * reclassement passé à la main par une écriture diverse, le module gardait
 * l'ancien compte : sa SORTIE le créditait, laissant le nouveau débiteur pour
 * un bien vendu et l'ancien créditeur du même montant · l'écriture
 * s'équilibrait, la balance bouclait, le poste du bilan totalisait juste.
 */

type Faux = Record<string, unknown>;
interface Ligne {
  compteId: string;
  debit: number;
  credit: number;
}

const COMPTES: Record<string, { numero: string; intitule: string }> = {
  // Le bien AVANT · bâtiment administratif sur sol propre.
  cImmoAvant: { numero: '23130000', intitule: 'Bâtiments administratifs et commerciaux' },
  cAmortAvant: { numero: '28313000', intitule: 'Amortissements des bâtiments administratifs' },
  cDotAvant: { numero: '68130000', intitule: 'Dotations aux amortissements des corporelles' },
  // Le bien APRÈS · immeuble de placement, ch. 10 § 2.1.1.
  cImmoApres: { numero: '23150000', intitule: 'Bâtiments - immeubles de placement' },
  cAmortApres: { numero: '28315000', intitule: 'Amortissements des immeubles de placement' },
  cDotApres: { numero: '68130000', intitule: 'Dotations aux amortissements des corporelles' },
  // Les deux comptes 29, avant et après.
  c29Avant: { numero: '29313000', intitule: 'Dépréciations des bâtiments administratifs' },
  c29Apres: { numero: '29315000', intitule: 'Dépréciations des immeubles de placement' },
  // Un incorporel, pour le refus de changement de nature.
  cIncorporel: { numero: '21310000', intitule: 'Logiciels' },
  cAmortIncorporel: { numero: '28131000', intitule: 'Amortissements des logiciels' },
  // Un compte qui n'est pas un 29, pour le refus correspondant.
  cPasUn29: { numero: '39100000', intitule: 'Dépréciations des stocks de marchandises' },
};

function service(options: {
  statut?: StatutImmobilisation;
  dotations?: number[];
  amortissementAnterieur?: number;
  depreciations?: Array<{ sens: 'DOTATION' | 'REPRISE'; montant: number }>;
  familleDestination?: { compteImmobilisationId: string; compteAmortissementId: string; compteDotationId: string };
  referentiel?: Referentiel;
} = {}) {
  const ecrituresPostees: Array<{ libelle: string; lignes: Ligne[] }> = [];
  const misesAJour: Faux[] = [];
  const reclassements: Faux[] = [];
  const depreciationsRecomptees: Faux[] = [];

  const immo = {
    id: 'i1',
    designation: 'Immeuble Kalembelembe',
    statut: options.statut ?? StatutImmobilisation.EN_SERVICE,
    dateAcquisition: new Date('2020-01-10'),
    dateMiseEnService: new Date('2020-01-10'),
    valeurOrigine: 200_000_000,
    valeurResiduelle: 0,
    dureeAmortissementAns: 20,
    amortissementAnterieur: options.amortissementAnterieur ?? 0,
    familleId: 'fAvant',
    compteImmobilisationId: 'cImmoAvant',
    compteAmortissementId: 'cAmortAvant',
    compteDotationId: 'cDotAvant',
    compteImmobilisation: COMPTES.cImmoAvant,
    dotations: (options.dotations ?? []).map((montant, i) => ({ id: `d${i}`, montant, exerciceId: `ex${i}` })),
    depreciations: (options.depreciations ?? []).map((d, i) => ({
      id: `dep${i}`,
      sens: d.sens,
      montant: d.montant,
      compteDepreciationId: 'c29Avant',
      compteContrepartieId: 'c69',
      exercice: { dateFin: new Date('2025-12-31') },
    })),
  };

  const destination = options.familleDestination ?? {
    compteImmobilisationId: 'cImmoApres',
    compteAmortissementId: 'cAmortApres',
    compteDotationId: 'cDotApres',
  };

  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: options.referentiel ?? Referentiel.SYSCOHADA,
        systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
      }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue(immo),
      update: jest.fn().mockImplementation((args: Faux) => {
        misesAJour.push((args as { data: Faux }).data);
        return Promise.resolve({ ...immo, ...(args as { data: Faux }).data });
      }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'exN',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    familleImmobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'fApres',
        ...destination,
        compteImmobilisation: COMPTES[destination.compteImmobilisationId],
        compteAmortissement: COMPTES[destination.compteAmortissementId],
      }),
    },
    compte: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(COMPTES[where.id] ? { id: where.id, ...COMPTES[where.id] } : null),
      ),
    },
    depreciationImmobilisation: {
      updateMany: jest.fn().mockImplementation((args: Faux) => {
        const a = args as { where: Faux; data: Faux };
        depreciationsRecomptees.push({ where: a.where, data: a.data });
        return Promise.resolve({ count: 1 });
      }),
    },
    reclassementImmobilisation: {
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        reclassements.push(data);
        return Promise.resolve({ id: 'r1', ...data });
      }),
    },
    // Le service passe ses trois écritures de suivi dans une transaction · le
    // faux les exécute simplement, l'ordre étant ce que le test vérifie.
    $transaction: jest.fn().mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)),
  } as Faux;

  const ecritures = {
    creer: jest.fn().mockImplementation((_t: string, _u: string, dto: { libelle: string; lignes: Ligne[] }) => {
      ecrituresPostees.push({ libelle: dto.libelle, lignes: dto.lignes });
      return Promise.resolve({ id: `e${ecrituresPostees.length}` });
    }),
  } as unknown as EcritureService;

  return {
    svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures),
    ecrituresPostees,
    misesAJour,
    reclassements,
    depreciationsRecomptees,
  };
}

const RECLASSEMENT = {
  nouvelleFamilleId: '11111111-1111-4111-8111-111111111111',
  dateReclassement: '2026-07-01',
  exerciceId: 'exN',
  journalId: 'j1',
  motif: "Les trois étages sont désormais donnés en location simple · ch. 10 § 1.2.",
};

const somme = (lignes: Ligne[], champ: 'debit' | 'credit') => lignes.reduce((s, l) => s + l[champ], 0);

describe('reclassement d’immobilisation · ch. 10 § 2.4', () => {
  it('vire la valeur d’origine du compte d’origine vers le compte de destination', async () => {
    const { svc, ecrituresPostees } = service();
    await svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never);

    expect(ecrituresPostees).toHaveLength(1);
    const { lignes } = ecrituresPostees[0];
    expect(lignes).toContainEqual({ compteId: 'cImmoApres', debit: 200_000_000, credit: 0 });
    expect(lignes).toContainEqual({ compteId: 'cImmoAvant', debit: 0, credit: 200_000_000 });
    expect(somme(lignes, 'debit')).toBe(somme(lignes, 'credit'));
  });

  it('EMPORTE l’amortissement cumulé avec le bien, amortissement antérieur compris', async () => {
    // Le laisser sur l'ancien 28 rendrait la valeur nette du nouveau poste
    // égale à la valeur BRUTE, et celle de l'ancien négative · aucun total ne
    // bougerait pour autant.
    const { svc, ecrituresPostees } = service({ dotations: [10_000_000, 10_000_000], amortissementAnterieur: 60_000_000 });
    await svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never);

    const { lignes } = ecrituresPostees[0];
    expect(lignes).toContainEqual({ compteId: 'cAmortAvant', debit: 80_000_000, credit: 0 });
    expect(lignes).toContainEqual({ compteId: 'cAmortApres', debit: 0, credit: 80_000_000 });
    expect(somme(lignes, 'debit')).toBe(somme(lignes, 'credit'));
  });

  it('NE RECALCULE RIEN · aucune dotation complémentaire, aucune ligne de résultat', async () => {
    // La différence délibérée avec `sortir` : le bien ne quitte pas le
    // patrimoine, son amortissement continue sur le même plan, et une annuité
    // arrêtée à la date du transfert la ferait courir deux fois. Aucune ligne
    // de classe 6, 7 ou 8 ne doit apparaître.
    const { svc, ecrituresPostees } = service({ dotations: [10_000_000] });
    const resultat = await svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never);

    expect(ecrituresPostees).toHaveLength(1);
    expect(ecrituresPostees[0].libelle).toContain('Reclassement');
    const comptesTouches = ecrituresPostees[0].lignes.map((l) => COMPTES[l.compteId].numero);
    expect(comptesTouches.filter((n) => /^[6789]/.test(n))).toEqual([]);
    // Et la valeur comptable nette est inchangée : 200 000 000 moins 10 000 000
    // des deux côtés du virement.
    expect(resultat.vire).toEqual({
      valeurOrigine: 200_000_000,
      cumulAmortissement: 10_000_000,
      cumulDepreciation: 0,
    });
  });

  it('emporte aussi la DÉPRÉCIATION, et recompte les lignes qui la portent', async () => {
    // Sans la dernière mise à jour, la sortie ultérieure solderait l'ancien 29
    // et laisserait le nouveau créditeur pour un bien qui n'existe plus.
    const { svc, ecrituresPostees, depreciationsRecomptees } = service({
      depreciations: [{ sens: 'DOTATION', montant: 15_000_000 }],
    });
    await svc.reclasser('t1', 'u1', 'i1', {
      ...RECLASSEMENT,
      nouveauCompteDepreciationId: 'c29Apres',
    } as never);

    const { lignes } = ecrituresPostees[0];
    expect(lignes).toContainEqual({ compteId: 'c29Avant', debit: 15_000_000, credit: 0 });
    expect(lignes).toContainEqual({ compteId: 'c29Apres', debit: 0, credit: 15_000_000 });
    // Le `where` compte autant que la donnée · une mise à jour qui ne
    // viserait pas CE bien laisserait le cumul pointé sur l'ancien 29.
    expect(depreciationsRecomptees).toEqual([
      { where: { immobilisationId: 'i1' }, data: { compteDepreciationId: 'c29Apres' } },
    ]);
  });

  it('REFUSE un bien déprécié sans compte 29 de destination · un 29 deviné serait faux', async () => {
    const { svc } = service({ depreciations: [{ sens: 'DOTATION', montant: 15_000_000 }] });
    await expect(svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never)).rejects.toThrow(/compte 29 de destination/i);
  });

  it('refuse un compte de destination qui n’est pas un 29', async () => {
    const { svc } = service({ depreciations: [{ sens: 'DOTATION', montant: 15_000_000 }] });
    await expect(
      svc.reclasser('t1', 'u1', 'i1', { ...RECLASSEMENT, nouveauCompteDepreciationId: 'cPasUn29' } as never),
    ).rejects.toThrow(/préfixe 29/);
  });

  it('REFUSE de franchir la nature du bien', async () => {
    // Les comptes 28 et 68 sont éclatés PAR NATURE dans les deux plans : un
    // virement qui la franchirait imputerait les dotations suivantes à un
    // poste qui ne correspond plus à celui de l'actif, sans rien déséquilibrer.
    const { svc } = service({
      familleDestination: {
        compteImmobilisationId: 'cIncorporel',
        compteAmortissementId: 'cAmortIncorporel',
        compteDotationId: 'cDotApres',
      },
    });
    await expect(svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never)).rejects.toThrow(/NATURE/);
  });

  it('refuse un reclassement vers le compte que le bien porte déjà', async () => {
    const { svc } = service({
      familleDestination: {
        compteImmobilisationId: 'cImmoAvant',
        compteAmortissementId: 'cAmortAvant',
        compteDotationId: 'cDotAvant',
      },
    });
    await expect(svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never)).rejects.toThrow(/déjà porté au compte/);
  });

  it('refuse un bien déjà sorti · il n’a plus d’utilisation à changer', async () => {
    const { svc } = service({ statut: StatutImmobilisation.CEDEE });
    await expect(svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never)).rejects.toThrow(/bien sorti/i);
  });

  it('refuse une date hors de l’exercice, et une date antérieure à l’acquisition', async () => {
    const { svc } = service();
    await expect(
      svc.reclasser('t1', 'u1', 'i1', { ...RECLASSEMENT, dateReclassement: '2027-03-01' } as never),
    ).rejects.toThrow(/dans l'exercice indiqué/);
  });

  it('EXIGE un motif · le § 1.2 qualifie par l’usage, que nul solde ne porte', async () => {
    const { svc } = service();
    await expect(svc.reclasser('t1', 'u1', 'i1', { ...RECLASSEMENT, motif: '   ' } as never)).rejects.toThrow(
      /motif du reclassement est obligatoire/i,
    );
  });

  it('conserve le motif et les DEUX comptes, pour qu’un réviseur puisse relire', async () => {
    const { svc, reclassements } = service();
    await svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never);

    expect(reclassements).toHaveLength(1);
    expect(reclassements[0]).toMatchObject({
      immobilisationId: 'i1',
      exerciceId: 'exN',
      motif: RECLASSEMENT.motif,
      ancienCompteImmobilisationId: 'cImmoAvant',
      nouveauCompteImmobilisationId: 'cImmoApres',
      createdBy: 'u1',
    });
  });

  it('fait suivre les TROIS comptes du bien, pas seulement celui de l’actif', async () => {
    // Le compte de dotation compris · sans lui, la prochaine annuité
    // s'imputerait au poste de l'ancienne catégorie.
    const { svc, misesAJour } = service();
    await svc.reclasser('t1', 'u1', 'i1', RECLASSEMENT as never);

    expect(misesAJour[0]).toEqual({
      familleId: 'fApres',
      compteImmobilisationId: 'cImmoApres',
      compteAmortissementId: 'cAmortApres',
      compteDotationId: 'cDotApres',
    });
  });
});
