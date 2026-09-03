import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LA DÉPRÉCIATION QUE LE MODULE D'IMMOBILISATIONS NE CONNAÎT PAS.
 *
 * Les deux textes l'imposent, chacun dans le sien :
 *
 *  · SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29 · « l'actif doit être déprécié
 *    lorsque la valeur nette comptable est supérieure à la valeur actuelle […]
 *    même en cas d'absence ou d'insuffisance d'excédent, il doit être procédé
 *    aux dotations nécessaires » ; et « les dépréciations sont inscrites
 *    distinctement à l'actif, EN DIMINUTION DE LA VALEUR BRUTE des biens
 *    correspondants pour donner leur valeur comptable nette ».
 *  · AUDCIF art. 46 et Titre VIII ch. 12, en termes identiques, avec la règle
 *    de recalcul du plan d'amortissement après dépréciation.
 *
 * CE QUE RIEN NE VOYAIT. Le schéma déclare la dépréciation hors périmètre du
 * module, ce qui est un choix assumé. Mais les comptes 29 sont semés et
 * mouvementables, et le texte OBLIGE à doter dès qu'un indice existe. Le
 * dossier qui le fait installe alors deux divergences muettes : la base
 * amortissable du module ignore la dépréciation, et sa sortie de bien ne solde
 * pas le 29, ce qui surévalue la valeur comptable nette portée au 81 et fausse
 * la plus ou moins-value de cession. Aucune écriture ne se déséquilibre.
 */

const ligne = (numero: string, intitule: string, credit: number, debit = 0) => ({
  debit,
  credit,
  compte: { numero, intitule },
});

function service(
  lignes: ReturnType<typeof ligne>[],
  nombreImmobilisations: number,
  referentiel: Referentiel = Referentiel.SYCEBNL,
) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(nombreImmobilisations),
    },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const signale = async (
  lignes: ReturnType<typeof ligne>[],
  nombreImmobilisations = 3,
  referentiel: Referentiel = Referentiel.SYCEBNL,
) => {
  const rapport = await service(lignes, nombreImmobilisations, referentiel).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'DEPRECIATION_IMMO_HORS_MODULE');
};

describe('dépréciation d’immobilisation hors module', () => {
  it('signale une dépréciation portée alors que le module tient des biens', async () => {
    const a = await signale([ligne('29310000', 'Dépréciations des bâtiments', 8_000_000)]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences[0].montant).toBe(8_000_000);
    // La conséquence doit nommer les DEUX divergences · la base amortissable
    // et la sortie qui ne solde pas le 29. Dire seulement « non couvert »
    // laisserait croire à un simple confort manquant.
    expect(a!.consequence).toContain('base');
    expect(a!.consequence).toContain('ne solde pas le compte 29');
    expect(a!.consequence).toContain('surévaluée');
  });

  it('se tait quand le dossier ne tient aucune immobilisation dans le module', async () => {
    // Une dépréciation de titres dans un dossier sans module ne diverge de rien.
    expect(await signale([ligne('29610000', 'Dépréciations des titres', 5_000_000)], 0)).toBeUndefined();
  });

  it('se tait quand la dépréciation a été entièrement reprise', async () => {
    const a = await signale([
      ligne('29310000', 'Dépréciations des bâtiments', 8_000_000),
      ligne('29310000', 'Dépréciations des bâtiments', 0, 8_000_000),
    ]);
    expect(a).toBeUndefined();
  });

  it('ne confond pas un solde débiteur avec une dépréciation', async () => {
    // Une dépréciation est créditrice · un solde débiteur n'en est pas une.
    expect(await signale([ligne('29310000', 'Dépréciations des bâtiments', 0, 3_000_000)])).toBeUndefined();
  });

  it('cite le texte du référentiel du dossier, jamais celui de l’autre', async () => {
    const sycebnl = await signale([ligne('29310000', 'Dépréciations', 1)], 3, Referentiel.SYCEBNL);
    expect(sycebnl!.consequence).toContain('SYCEBNL, Partie 2 ch. 3');
    expect(sycebnl!.consequence).not.toContain('art. 46');

    const syscohada = await signale([ligne('29310000', 'Dépréciations', 1)], 3, Referentiel.SYSCOHADA);
    expect(syscohada!.consequence).toContain('AUDCIF art. 46');
    expect(syscohada!.consequence).not.toContain('SYCEBNL');
  });
});
