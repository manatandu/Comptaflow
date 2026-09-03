import { Referentiel } from '@prisma/client';
import { ControlesService } from './controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * L'ÉCART DE RÉÉVALUATION QUE LE MODULE D'IMMOBILISATIONS NE CONNAÎT PAS.
 *
 * Même mécanisme que la dépréciation (contrôle 15) : le module range la valeur
 * d'entrée dans `valeurOrigine`, et rien d'extérieur ne peut la mettre à jour.
 * Une réévaluation passée à la main augmente la valeur au bilan sans que le
 * module en sache rien · il continue d'amortir et de sortir le bien au coût
 * historique. Aucune écriture ne se déséquilibre.
 *
 * CE QUE CHAQUE TEXTE DIT, ET SEULEMENT LUI · c'est le point délicat de ce
 * contrôle, et la raison du dernier test.
 *
 *  · SYCEBNL · cadre conceptuel § 3.3.1.2.1 (réévaluation libre ou légale,
 *    portant exclusivement sur les immobilisations corporelles et financières)
 *    et fiche du COMPTE 106 (contrepartie au passif des augmentations de
 *    valeur).
 *  · AUDCIF · art. 62 à 65 et Titre VIII ch. 28, qui ajoutent DEUX règles que
 *    le texte SYCEBNL n'écrit pas : la valeur réévaluée sert de base aux
 *    amortissements sur la durée restant à courir (art. 64), et l'écart d'un
 *    bien cédé se transfère à une réserve non distribuable (ch. 28 § 6).
 *
 * Les prêter au SYCEBNL serait exactement la transposition que le dépôt
 * s'interdit.
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
    // Le contrôle 15 retranche du solde des comptes 29 ce que le module
    // d'immobilisations y a lui-même posté · sans ce faux, il croirait la
    // table absente.
    depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(nombreImmobilisations),
    },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

const signale = async (
  lignes: ReturnType<typeof ligne>[],
  nombreImmobilisations = 4,
  referentiel: Referentiel = Referentiel.SYCEBNL,
) => {
  const rapport = await service(lignes, nombreImmobilisations, referentiel).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'REEVALUATION_IMMO_HORS_MODULE');
};

describe('écart de réévaluation hors module', () => {
  it('signale un écart porté alors que le module tient des biens', async () => {
    const a = await signale([ligne('10610000', 'Écarts de réévaluation légale', 12_000_000)]);
    expect(a).toBeDefined();
    expect(a!.gravite).toBe('AVERTISSEMENT');
    expect(a!.occurrences[0].montant).toBe(12_000_000);
    // La conséquence doit dire que rien ne se déséquilibre · c'est ce qui rend
    // l'écart invisible, et donc ce qu'il faut nommer.
    expect(a!.consequence).toContain('valeur d’origine historique');
    expect(a!.consequence).toContain('balance boucle');
    // L'action rappelle l'interdiction de la réévaluation partielle, qui est
    // le piège le plus courant du chapitre.
    expect(a!.action).toContain('partielle est');
  });

  it('se tait quand le dossier ne tient aucune immobilisation dans le module', async () => {
    expect(await signale([ligne('10610000', 'Écarts de réévaluation', 5_000_000)], 0)).toBeUndefined();
  });

  it('ne confond pas un solde débiteur avec un écart de réévaluation', async () => {
    // L'écart est CRÉDITEUR · c'est une contrepartie de passif.
    expect(await signale([ligne('10610000', 'Écarts de réévaluation', 0, 4_000_000)])).toBeUndefined();
  });

  it('ne prête pas au SYCEBNL les deux règles que seul l’AUDCIF écrit', async () => {
    const sycebnl = await signale([ligne('10610000', 'Écarts', 1)], 4, Referentiel.SYCEBNL);
    expect(sycebnl!.consequence).toContain('SYCEBNL');
    // Ni l'art. 64 ni le transfert en réserve non distribuable ne figurent au
    // texte SYCEBNL : les citer à un dossier SYCEBNL serait une transposition.
    expect(sycebnl!.consequence).not.toContain('art. 64');
    expect(sycebnl!.consequence).not.toContain('réserve non distribuable');

    const syscohada = await signale([ligne('10610000', 'Écarts', 1)], 4, Referentiel.SYSCOHADA);
    expect(syscohada!.consequence).toContain('art. 64');
    expect(syscohada!.consequence).toContain('réserve non distribuable');
    expect(syscohada!.consequence).not.toContain('SYCEBNL');
  });
});
