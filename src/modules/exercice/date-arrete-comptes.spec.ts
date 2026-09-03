import { Referentiel } from '@prisma/client';
import { ExerciceService } from './exercice.service';
import { ControlesService } from '../controles/controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LA QUATRIÈME MENTION OBLIGATOIRE DE CHAQUE PAGE PUBLIÉE.
 *
 * AUDCIF, Titre IX ch. 1 § 2.4 · « les états financiers doivent comporter
 * OBLIGATOIREMENT les mentions suivantes : le nom de l'entité […] ; LA DATE
 * D'ARRÊTÉ et la période couverte […] ; l'unité monétaire […]. Ces
 * informations doivent être indiquées DANS CHACUNE DES PAGES des états
 * financiers publiés. » Le logiciel en servait trois.
 *
 * CE N'EST PAS « EXERCICE CLOS LE ». Le § 2.4 les énumère séparément, et le
 * Titre VIII ch. 31 § 1.3 est explicite : « l'arrêté par les organes
 * dirigeants, légalement responsables, ne peut être que POSTÉRIEUR de
 * plusieurs semaines, voire plusieurs mois, à la date de clôture. La limite
 * fixée par l'Acte uniforme est de quatre mois après la clôture. »
 *
 * ELLE VAUT DES DEUX CÔTÉS, MAIS PAS PAR LE MÊME CHEMIN · l'article 23, qui
 * exige la mention « dans toute publication des états financiers », n'est PAS
 * dans la liste d'exclusion de l'art. 3 du SYCEBNL (5, 8, 10 à 13, 17 al. 7
 * et 8, 18, 19 quatrième tiret, 21, 25 à 34, 49, 69, 70, 71, 73 à 113). En
 * revanche la règle « dans chacune des pages » du Titre IX n'est pas reprise
 * par le § 1.4 de la Partie 4 du SYCEBNL, qui reprend pourtant le reste du
 * même paragraphe. C'est une lacune du TEXTE, pas du logiciel, et le message
 * du contrôle la reflète · c'est l'objet du dernier bloc.
 *
 * CE QUE RIEN NE VOYAIT. Un état sans date d'arrêté s'imprime, s'exporte et se
 * dépose exactement comme un autre : tous les totaux sont justes, la balance
 * boucle, et il manque seulement une mention que le texte dit obligatoire. Le
 * défaut ne se découvre qu'au dépôt, ou devant l'auditeur.
 */

type Faux = Record<string, unknown>;

const CLOTURE = new Date('2026-12-31');

function serviceExercice() {
  const misAJour: Faux[] = [];
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: CLOTURE }),
      update: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        misAJour.push(data);
        return Promise.resolve({ id: 'ex', ...data });
      }),
    },
  } as Faux;
  return {
    svc: new ExerciceService(prisma as unknown as PrismaService, {} as never),
    misAJour,
  };
}

describe('enregistrement de la date d’arrêté', () => {
  it('accepte une date postérieure à la clôture', async () => {
    const { svc, misAJour } = serviceExercice();
    await svc.arreterComptes('t1', 'ex', { dateArreteComptes: '2027-04-28' });
    expect((misAJour[0].dateArreteComptes as Date).toISOString().slice(0, 10)).toBe('2027-04-28');
  });

  it('refuse une date antérieure à la clôture', async () => {
    // Arrêter des comptes avant la fin de la période qu'ils couvrent n'a pas
    // de sens · c'est le seul refus que le texte permet de poser.
    const { svc } = serviceExercice();
    await expect(svc.arreterComptes('t1', 'ex', { dateArreteComptes: '2026-11-30' })).rejects.toThrow(
      /ne peut pas précéder la clôture/i,
    );
  });

  it('n’interdit PAS un arrêté au-delà des quatre mois', async () => {
    // Le délai de quatre mois est une limite légale, mais un dossier réel
    // arrête parfois en retard. Bloquer la saisie EFFACERAIT le retard au lieu
    // de le montrer : c'est le jalon de clôture qui le signale, et la date
    // vraie reste la date vraie.
    const { svc, misAJour } = serviceExercice();
    await svc.arreterComptes('t1', 'ex', { dateArreteComptes: '2027-09-15' });
    expect(misAJour[0].dateArreteComptes).toBeInstanceOf(Date);
  });

  it('accepte l’effacement · le texte prévoit un nouvel arrêté', async () => {
    // Titre VIII ch. 31 § 1.6 · « il appartiendrait aux dirigeants de procéder
    // à un NOUVEL ARRÊTÉ des comptes modifiés, dans le délai légal des quatre
    // mois de la clôture ».
    const { svc, misAJour } = serviceExercice();
    await svc.arreterComptes('t1', 'ex', { dateArreteComptes: null });
    expect(misAJour[0].dateArreteComptes).toBeNull();
  });
});

function serviceControles(referentiel: Referentiel, dateArreteComptes: Date | null) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: CLOTURE,
        dateArreteComptes,
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService);
}

const anomalie = async (referentiel: Referentiel, dateArreteComptes: Date | null) => {
  const rapport = await serviceControles(referentiel, dateArreteComptes).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'DATE_ARRETE_NON_RENSEIGNEE');
};

describe('le contrôle qui signale la mention manquante', () => {
  for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA] as const) {
    it(`${referentiel} · signale l’absence de date d’arrêté`, async () => {
      const a = await anomalie(referentiel, null);
      expect(a).toBeDefined();
      // AVERTISSEMENT et non BLOQUANT · la date n'existe qu'une fois les
      // comptes arrêtés ; bloquer l'analyse d'un exercice en cours de travaux
      // reviendrait à refuser le brouillon parce qu'il n'est pas définitif.
      expect(a!.gravite).toBe('AVERTISSEMENT');
      // Le message doit dire que ce n'est PAS la clôture · c'est la confusion
      // qui a fait passer le manque inaperçu jusqu'ici.
      expect(a!.consequence).toContain('Ce n’est pas la date de clôture');
    });

    it(`${referentiel} · se tait dès que la date est renseignée`, async () => {
      expect(await anomalie(referentiel, new Date('2027-04-28'))).toBeUndefined();
    });
  }

  it('chaque référentiel cite le chemin par lequel l’obligation lui parvient', async () => {
    // Côté SYCEBNL, l'obligation vient du RENVOI de l'art. 3 à l'AUDCIF, qui
    // n'exclut pas l'art. 23 · le dire est ce qui rend l'avertissement
    // opposable, plutôt que de citer un Titre IX que le SYCEBNL ne reprend pas.
    const sycebnl = await anomalie(Referentiel.SYCEBNL, null);
    expect(sycebnl!.consequence).toContain('art. 3 du SYCEBNL');
    expect(sycebnl!.consequence).not.toContain('Titre IX');

    const syscohada = await anomalie(Referentiel.SYSCOHADA, null);
    expect(syscohada!.consequence).toContain('Titre IX ch. 1 § 2.4');
    expect(syscohada!.consequence).not.toContain('SYCEBNL');
  });
});
