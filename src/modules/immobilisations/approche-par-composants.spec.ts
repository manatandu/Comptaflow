import { Referentiel, TypeComposant } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * APPROCHE PAR COMPOSANTS · AUDCIF Titre VIII ch. 4 ; SYCEBNL, Partie 2 ch. 3,
 * règles générales de la classe 2.
 *
 * « Lorsqu'un ou plusieurs éléments constitutifs d'un actif ont chacun des
 * utilisations différentes […] chaque élément peut être comptabilisé
 * séparément dans un sous-compte de l'immobilisation principale et UN PLAN
 * D'AMORTISSEMENT PROPRE À CHACUN de ces éléments est retenu. »
 *
 * CE QUE RIEN NE VOYAIT. Le module savait déjà tenir un ascenseur sur dix ans
 * et un immeuble sur quarante ; ce qui manquait est le LIEN. Sans lui, le
 * renouvellement de l'ascenseur créait un second bien sans sortir le premier :
 * le bilan portait deux ascenseurs pour une seule cage, l'écriture
 * d'acquisition restait équilibrée, la balance bouclait, et le parc continuait
 * d'amortir un composant qui n'existait plus.
 *
 * LES DEUX TEXTES NE FERMENT PAS LA LISTE DE LA MÊME FAÇON, et c'est le point
 * qu'il ne faut pas harmoniser :
 *  · le SYCEBNL écrit « la décomposition N'EST AUTORISÉE QUE POUR … » · liste
 *    fermée ;
 *  · l'AUDCIF donne la même énumération « par exemple » puis exclut nommément
 *    les matériels informatiques, les véhicules de tourisme et les matériels et
 *    mobiliers · liste ouverte, bornée par le bas.
 * Les messages de refus citent donc chacun SON texte, ce que vérifie le dernier
 * bloc.
 */

type Faux = Record<string, unknown>;

const IMMEUBLE = {
  id: 'immeuble',
  dateAcquisition: new Date('2020-01-10'),
  compteImmobilisation: { numero: '23110000', intitule: 'Bâtiments industriels' },
};
const ORDINATEURS = {
  id: 'parc-info',
  dateAcquisition: new Date('2024-03-01'),
  compteImmobilisation: { numero: '24420000', intitule: 'Matériel informatique' },
};

function harnais(options: { referentiel?: Referentiel; principal?: typeof IMMEUBLE } = {}) {
  const creations: Faux[] = [];
  const prisma = {
    familleImmobilisation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'f1',
        compteImmobilisationId: 'cimmo',
        compteAmortissementId: 'camort',
        compteDotationId: 'cdot',
        dureeAmortissementAns: 10,
      }),
    },
    compte: { findFirst: jest.fn().mockResolvedValue({ id: 'ctreso', numero: '52110000' }) },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: options.referentiel ?? Referentiel.SYSCOHADA }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue(options.principal ?? IMMEUBLE),
      create: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        creations.push(data);
        return Promise.resolve({ ...data, valeurOrigine: 0, valeurResiduelle: 0, prixCession: null, dotations: [] });
      }),
    },
  } as Faux;
  const ecritures = { creer: jest.fn().mockResolvedValue({ id: 'e1' }) } as unknown as EcritureService;
  return { svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures), creations };
}

const ASCENSEUR = {
  familleId: 'f1',
  designation: 'Ascenseur',
  dateAcquisition: '2020-01-10',
  dateMiseEnService: '2020-01-10',
  valeurOrigine: 40_000_000,
  dureeAmortissementAns: 10,
  compteContrepartieId: 'ctreso',
  exerciceId: 'exN',
  journalId: 'j1',
  immobilisationPrincipaleId: 'immeuble',
  justificationDecomposition:
    'Immeuble amorti sur 40 ans, ascenseur remplacé tous les 10 ans · durées d’utilité distinctes et coût significatif',
};

describe('un composant se rattache à son immobilisation principale', () => {
  it('enregistre le lien, la nature et la justification', async () => {
    const { svc, creations } = harnais();
    await svc.creer('t1', 'u1', ASCENSEUR as never);
    expect(creations[0].immobilisationPrincipaleId).toBe('immeuble');
    // Le type par défaut est le cas général du ch. 4 § 1.
    expect(creations[0].typeComposant).toBe(TypeComposant.COMPOSANT);
    expect(creations[0].justificationDecomposition).toContain('durées d’utilité distinctes');
  });

  it('une immobilisation ordinaire reste une structure · rien ne change', async () => {
    const { svc, creations } = harnais();
    const { immobilisationPrincipaleId: _p, justificationDecomposition: _j, ...structure } = ASCENSEUR;
    await svc.creer('t1', 'u1', structure as never);
    expect(creations[0].immobilisationPrincipaleId).toBeNull();
    expect(creations[0].typeComposant).toBeNull();
  });

  it('refuse un composant sans justification · le texte pose des conditions, pas le logiciel', async () => {
    // Éléments dissociables, utilisations différentes, durées d'utilité
    // différentes, coût fiable ET significatif · aucune n'est vérifiable par
    // un programme. Il les fait donc écrire plutôt que de les deviner.
    const { svc } = harnais();
    const { justificationDecomposition: _j, ...sansMotif } = ASCENSEUR;
    await expect(svc.creer('t1', 'u1', sansMotif as never)).rejects.toThrow(/décomposable/i);
  });

  it('refuse une nature de composant sans principal · le rattachement va d’un bloc', async () => {
    const { svc } = harnais();
    const { immobilisationPrincipaleId: _p, ...orphelin } = ASCENSEUR;
    await expect(
      svc.creer('t1', 'u1', { ...orphelin, typeComposant: TypeComposant.REVISION_MAJEURE } as never),
    ).rejects.toThrow(/immobilisation principale/i);
  });
});

describe('la valeur résiduelle d’un composant', () => {
  it('est refusée par défaut · il est prévu qu’il soit remplacé avant la fin de la structure', async () => {
    // AUDCIF ch. 4 § 3.3 · « sa base amortissable ne peut être diminuée d'une
    // valeur résiduelle, puisque, par définition, il est prévu qu'il soit
    // remplacé avant la fin de l'utilisation de la structure ».
    const { svc } = harnais();
    await expect(
      svc.creer('t1', 'u1', { ...ASCENSEUR, valeurResiduelle: 2_000_000 } as never),
    ).rejects.toThrow(/valeur résiduelle/i);
  });

  it('est admise sur le DERNIER renouvellement · § 4.3', async () => {
    const { svc, creations } = harnais();
    await svc.creer('t1', 'u1', {
      ...ASCENSEUR,
      valeurResiduelle: 2_000_000,
      dernierRenouvellement: true,
    } as never);
    expect(creations[0].valeurResiduelle).toBe(2_000_000);
  });
});

describe('les deux pièces, et leurs deux dates de départ opposées', () => {
  /*
    SYCEBNL, Partie 2 ch. 3, classe 2 · « pour les PIÈCES DE SÉCURITÉ,
    l'amortissement doit démarrer dès l'acquisition de l'immobilisation
    principale. Pour les PIÈCES DE RECHANGE destinées à remplacer totalement ou
    partiellement un composant, l'amortissement ne débute qu'à la date
    d'utilisation de la pièce, c'est-à-dire au moment où elle est intégrée dans
    l'immobilisation principale. »

    Deux règles inverses sur des objets voisins · les confondre amortit une
    pièce des années trop tôt, ou des années trop tard, sans que rien ne le
    signale.
  */
  it('la pièce de sécurité démarre à l’acquisition du principal, et pas ailleurs', async () => {
    const { svc } = harnais();
    await expect(
      svc.creer('t1', 'u1', {
        ...ASCENSEUR,
        typeComposant: TypeComposant.PIECE_DE_SECURITE,
        dateMiseEnService: '2021-06-01',
      } as never),
    ).rejects.toThrow(/pièce de sécurité/i);
  });

  it('acceptée quand elle démarre bien à cette date', async () => {
    const { svc, creations } = harnais();
    await svc.creer('t1', 'u1', {
      ...ASCENSEUR,
      typeComposant: TypeComposant.PIECE_DE_SECURITE,
      dateAcquisition: '2020-01-10',
      dateMiseEnService: '2020-01-10',
    } as never);
    expect(creations[0].typeComposant).toBe(TypeComposant.PIECE_DE_SECURITE);
  });

  it('la pièce de rechange, elle, démarre à son intégration · aucune date imposée', async () => {
    // La date d'intégration n'est connue de personne d'autre que du comptable ;
    // aucun contrôle ne peut la contredire, et ce test dit que c'est voulu.
    const { svc, creations } = harnais();
    await svc.creer('t1', 'u1', {
      ...ASCENSEUR,
      typeComposant: TypeComposant.PIECE_DE_RECHANGE,
      dateAcquisition: '2020-01-10',
      dateMiseEnService: '2024-09-15',
    } as never);
    expect(creations[0].typeComposant).toBe(TypeComposant.PIECE_DE_RECHANGE);
  });
});

describe('ce qui n’est pas décomposable, et le texte que chacun cite', () => {
  const composantInformatique = { ...ASCENSEUR, immobilisationPrincipaleId: 'parc-info' };

  it('le SYCEBNL refuse en citant SA liste fermée', async () => {
    const { svc } = harnais({ referentiel: Referentiel.SYCEBNL, principal: ORDINATEURS });
    await expect(svc.creer('t1', 'u1', composantInformatique as never)).rejects.toThrow(
      /n’autorise la décomposition que pour/i,
    );
  });

  it('le SYSCOHADA refuse en citant SA liste négative', async () => {
    const { svc } = harnais({ referentiel: Referentiel.SYSCOHADA, principal: ORDINATEURS });
    await expect(svc.creer('t1', 'u1', composantInformatique as never)).rejects.toThrow(
      /exclut nommément le matériel informatique/i,
    );
  });

  it('aucun des deux messages ne cite le texte de l’autre', async () => {
    const message = async (referentiel: Referentiel) => {
      const { svc } = harnais({ referentiel, principal: ORDINATEURS });
      return svc.creer('t1', 'u1', composantInformatique as never).then(
        () => '',
        (e: Error) => e.message,
      );
    };
    const sycebnl = await message(Referentiel.SYCEBNL);
    const syscohada = await message(Referentiel.SYSCOHADA);
    expect(sycebnl).toContain('SYCEBNL');
    expect(sycebnl).not.toContain('AUDCIF');
    expect(syscohada).toContain('AUDCIF');
    expect(syscohada).not.toContain('SYCEBNL');
    // Chaque texte porte des éléments que l'autre n'a pas · la liste fermée
    // d'un côté, les véhicules de tourisme de l'autre.
    expect(sycebnl).toContain('véhicules blindés');
    expect(syscohada).toContain('véhicules de tourisme');
  });

  it('un bâtiment reste décomposable dans les deux référentiels', async () => {
    for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA] as const) {
      const { svc, creations } = harnais({ referentiel });
      await svc.creer('t1', 'u1', ASCENSEUR as never);
      expect(creations[0].immobilisationPrincipaleId).toBe('immeuble');
    }
  });
});
