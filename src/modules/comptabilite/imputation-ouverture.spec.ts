import { MotifImputationOuverture, Referentiel } from '@prisma/client';
import { EcritureService } from './ecriture.service';
import { ControlesService } from '../controles/controles.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LA CORRESPONDANCE BILAN DE CLÔTURE / BILAN D'OUVERTURE, ET SES DEUX SEULES
 * EXCEPTIONS.
 *
 * Les deux textes écrivent la convention, chacun dans le sien :
 *
 *  · AUDCIF art. 34 et Titre V · « le bilan d'ouverture d'un exercice doit
 *    correspondre au bilan de clôture de l'exercice précédent ». Conséquence :
 *    « on ne peut imputer directement sur les capitaux propres ni les
 *    incidences des changements de méthode, ni les produits/charges
 *    d'exercices précédents omis (qui transitent par le compte de résultat) ».
 *  · SYCEBNL art. 16, 4) et cadre conceptuel § 3.3.1.2.4, dans les mêmes
 *    termes.
 *
 * DEUX EXCEPTIONS, ET DEUX SEULEMENT, que les deux textes nomment l'une et
 * l'autre :
 *  1. l'incidence d'un CHANGEMENT DE MÉTHODE à impact fort significatif,
 *     « imputé en report à nouveau dès l'ouverture de l'exercice » ;
 *  2. la correction d'une ERREUR SIGNIFICATIVE d'un exercice antérieur,
 *     « opérée par ajustement des capitaux propres d'ouverture ».
 *
 * CE QUE RIEN NE VOYAIT. Le logiciel refusait déjà de laisser modifier une
 * écriture de clôture, et son message citait la convention · mais rien
 * n'empêchait de mouvementer le compte 12 par une écriture ORDINAIRE. Elle
 * s'équilibre comme les autres, la balance boucle, et le bilan d'ouverture
 * cesse de correspondre à la clôture précédente sans qu'aucun total ne bouge.
 * Elle est de surcroît indiscernable d'une erreur d'imputation : c'est ce que
 * le motif déclaré résout.
 */

type Faux = Record<string, unknown>;

const COMPTES: Record<string, { id: string; numero: string; intitule: string }> = {
  ran: { id: 'ran', numero: '12100000', intitule: 'Report à nouveau' },
  capital: { id: 'capital', numero: '10100000', intitule: 'Dotation' },
  amortissements: { id: 'amort', numero: '28410000', intitule: 'Amortissements du matériel' },
  charge: { id: 'charge', numero: '62100000', intitule: 'Transports' },
  reserve: { id: 'reserve', numero: '11100000', intitule: 'Réserve légale' },
};

function service() {
  const creees: Faux[] = [];
  const misAJour: Faux[] = [];
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        statut: 'OUVERT',
      }),
    },
    compte: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(Object.values(COMPTES).find((c) => c.id === where.id) ?? null),
      ),
    },
    ecriture: {
      update: jest.fn().mockImplementation(({ data }: { data: Faux }) => {
        misAJour.push(data);
        return Promise.resolve({ id: 'e1', ...data });
      }),
    },
  } as Faux;

  const svc = new EcritureService(prisma as unknown as PrismaService, {} as never, {} as never, {} as never);
  // `creer` est la voie commune de toute écriture · on l'intercepte pour lire
  // les lignes réellement produites, sans rejouer tout son contrôle de
  // journal, de numérotation et d'équilibre.
  jest.spyOn(svc, 'creer').mockImplementation(((_t: string, _u: string, dto: unknown) => {
    creees.push(dto as Faux);
    return Promise.resolve({ id: 'e1' });
  }) as never);
  return { svc, creees, misAJour };
}

const IMPUTATION = {
  exerciceId: 'ex',
  journalId: 'j1',
  motif: MotifImputationOuverture.CHANGEMENT_METHODE,
  justification: 'Passage de la méthode de l’achèvement à l’avancement, impact fort significatif sur les capitaux propres',
  compteReportANouveauId: 'ran',
  compteContrepartieId: 'amort',
  montant: 4_500_000,
};

describe('l’imputation aux capitaux propres d’ouverture', () => {
  it('débite le report à nouveau quand le montant est positif', async () => {
    const { svc, creees, misAJour } = service();
    await svc.imputerAuxCapitauxPropresDOuverture('t1', 'u1', IMPUTATION as never);
    expect(creees[0].lignes).toEqual([
      { compteId: 'ran', debit: 4_500_000, credit: 0 },
      { compteId: 'amort', debit: 0, credit: 4_500_000 },
    ]);
    // Le motif et la justification sont posés SUR l'écriture · c'est ce qui la
    // distingue d'une erreur d'imputation, et ce que les Notes annexes
    // reprendront.
    expect(misAJour[0].motifImputationOuverture).toBe(MotifImputationOuverture.CHANGEMENT_METHODE);
    expect(misAJour[0].justificationImputationOuverture).toContain('impact fort significatif');
  });

  it('crédite le report à nouveau quand le montant est négatif', async () => {
    const { svc, creees } = service();
    await svc.imputerAuxCapitauxPropresDOuverture('t1', 'u1', { ...IMPUTATION, montant: -1_000_000 } as never);
    expect(creees[0].lignes).toEqual([
      { compteId: 'amort', debit: 1_000_000, credit: 0 },
      { compteId: 'ran', debit: 0, credit: 1_000_000 },
    ]);
  });

  it('date l’écriture à l’OUVERTURE de l’exercice, pas au jour de la saisie', async () => {
    // Les deux textes parlent d'un ajustement des capitaux propres
    // D'OUVERTURE, et l'impact d'un changement de méthode est « déterminé à
    // l'ouverture ». Une imputation datée de juin serait un mouvement de
    // l'exercice, pas une correction de son point de départ.
    const { svc, creees } = service();
    await svc.imputerAuxCapitauxPropresDOuverture('t1', 'u1', IMPUTATION as never);
    expect(creees[0].date).toBe('2026-01-01');
  });

  it('exige une justification · le texte impose l’information en Notes annexes', async () => {
    const { svc } = service();
    await expect(
      svc.imputerAuxCapitauxPropresDOuverture('t1', 'u1', { ...IMPUTATION, justification: '   ' } as never),
    ).rejects.toThrow(/justification est obligatoire/i);
  });

  it('refuse un compte qui n’est pas un report à nouveau', async () => {
    // Le compte 12 est le seul à porter le report à nouveau, dans les deux
    // plans semés. Une imputation sur la réserve légale serait une affectation
    // du résultat, pas une correction du bilan d'ouverture.
    const { svc } = service();
    await expect(
      svc.imputerAuxCapitauxPropresDOuverture('t1', 'u1', {
        ...IMPUTATION,
        compteReportANouveauId: 'reserve',
      } as never),
    ).rejects.toThrow(/compte 12/i);
  });

  it('refuse une contrepartie de charge ou de produit', async () => {
    // Une contrepartie de gestion ferait transiter l'impact par le RÉSULTAT,
    // ce qui est précisément le traitement ORDINAIRE auquel ces deux cas font
    // exception. L'opération serait juste, mais ne serait plus une imputation
    // d'ouverture.
    const { svc } = service();
    await expect(
      svc.imputerAuxCapitauxPropresDOuverture('t1', 'u1', { ...IMPUTATION, compteContrepartieId: 'charge' } as never),
    ).rejects.toThrow(/poste de BILAN/i);
  });

  it('refuse un montant nul', async () => {
    const { svc } = service();
    await expect(
      svc.imputerAuxCapitauxPropresDOuverture('t1', 'u1', { ...IMPUTATION, montant: 0 } as never),
    ).rejects.toThrow(/ne corrige rien/i);
  });

  it('accepte les DEUX motifs, et seulement eux', () => {
    // L'énumération est fermée par le texte · il n'y a pas de troisième
    // exception, et tout le reste transite par le compte de résultat.
    expect(Object.keys(MotifImputationOuverture)).toEqual([
      'CHANGEMENT_METHODE',
      'CORRECTION_ERREUR_SIGNIFICATIVE',
    ]);
  });
});

function serviceControles(referentiel: Referentiel, lignes: Faux[]) {
  const prisma = {
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
        dateArreteComptes: new Date('2027-04-28'),
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', nom: 'Dossier', referentiel }) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
    exoneration: { findMany: jest.fn().mockResolvedValue([]) },
    manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    // Dossiers de subvention · vides ici, ces specs ne les testent pas. Sans
    // cette doublure, le contrôle 24 tomberait sur undefined.
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  } as Faux;
  return new ControlesService(prisma as unknown as PrismaService);
}

const ligne = (numero: string, debit: number, credit = 0) => ({
  debit,
  credit,
  compte: { numero, intitule: 'Report à nouveau' },
  ecriture: { numeroPiece: 'OD-000012', date: new Date('2026-03-04'), libelle: 'Régularisation' },
});

const anomalie = async (referentiel: Referentiel, lignes: Faux[]) => {
  const rapport = await serviceControles(referentiel, lignes).analyser('t', 'ex');
  return rapport.anomalies.find((a) => a.code === 'IMPUTATION_REPORT_A_NOUVEAU_NON_DECLAREE');
};

describe('le contrôle des imputations non déclarées', () => {
  for (const referentiel of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA] as const) {
    it(`${referentiel} · signale un mouvement du 12 hors clôture et hors exception`, async () => {
      const a = await anomalie(referentiel, [ligne('12100000', 3_000_000)]);
      expect(a).toBeDefined();
      expect(a!.gravite).toBe('AVERTISSEMENT');
      expect(a!.occurrences[0].montant).toBe(3_000_000);
      // Le message doit dire pourquoi rien ne le signale par ailleurs.
      expect(a!.consequence).toContain('aucun total ne bouge');
      // Et rappeler qu'il n'y a que DEUX exceptions.
      expect(a!.consequence).toContain('Deux exceptions');
    });
  }

  it('chaque référentiel cite SON article, jamais celui de l’autre', async () => {
    const sycebnl = await anomalie(Referentiel.SYCEBNL, [ligne('12100000', 1)]);
    expect(sycebnl!.consequence).toContain('SYCEBNL art. 16, 4)');
    expect(sycebnl!.consequence).not.toContain('art. 34');

    const syscohada = await anomalie(Referentiel.SYSCOHADA, [ligne('12100000', 1)]);
    expect(syscohada!.consequence).toContain('AUDCIF art. 34');
    expect(syscohada!.consequence).not.toContain('SYCEBNL');
  });

  it('se tait quand aucun compte 12 n’a bougé', async () => {
    expect(await anomalie(Referentiel.SYSCOHADA, [ligne('10100000', 5_000)])).toBeUndefined();
  });

  it('se tait quand rien n’a bougé du tout', async () => {
    expect(await anomalie(Referentiel.SYSCOHADA, [])).toBeUndefined();
  });

  it("EXCLUT l'affectation du résultat, qui est le chemin ORDINAIRE du compte 12", async () => {
    // LE DÉFAUT QUE CE TEST GÈLE · le contrôle relevait toute ligne sur un
    // compte 12 hors clôture et hors motif déclaré. Or l'affectation du
    // résultat passe par le chemin ordinaire (`affectation.service.ts`,
    // appel à `ecritureService.creer` sans drapeau) et vire au 12 dans les
    // DEUX plans. Tout dossier recevait donc l'avertissement dès son premier
    // exercice affecté, et le SYCEBNL rend ce virement obligatoire.
    //
    // Un avertissement présent partout est un avertissement qu'on apprend à
    // ignorer : le contrôle 22 est le seul garde-fou du compte 12, et une OD
    // manuelle qui l'aurait vraiment mouvementé se serait noyée dans la même
    // ligne que l'affectation de l'année.
    //
    // Le faux Prisma de ce fichier rend les mêmes lignes à toutes les
    // lectures et IGNORE le `where` · un test par la donnée ne prouverait
    // donc rien. On vérifie le FILTRE lui-même, comme le balayage du
    // cloisonnement vérifie les bornes de tenant.
    const prisma = {
      exercice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ex',
          dateDebut: new Date('2026-01-01'),
          dateFin: new Date('2026-12-31'),
          dateArreteComptes: new Date('2027-04-28'),
        }),
      },
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', nom: 'D', referentiel: Referentiel.SYSCOHADA }),
      },
      ecriture: { findMany: jest.fn().mockResolvedValue([]) },
      compte: { findMany: jest.fn().mockResolvedValue([]) },
      ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
      exoneration: { findMany: jest.fn().mockResolvedValue([]) },
      manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
    // Dossiers de subvention · vides ici, ces specs ne les testent pas. Sans
    // cette doublure, le contrôle 24 tomberait sur undefined.
    conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
      immobilisation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    } as Faux;
    await new ControlesService(prisma as unknown as PrismaService).analyser('t', 'ex');

    /** La forme du `where` que ce test inspecte, et rien de plus. */
    interface LectureLignes {
      where: {
        compte: { numero: { startsWith: string } };
        ecriture: {
          estGenereeParCloture: boolean;
          motifImputationOuverture: unknown;
          affectationResultat: unknown;
        };
      };
    }
    const lecture = (prisma.ligneEcriture as { findMany: jest.Mock }).findMany;
    const lectures12 = lecture.mock.calls
      .map((appel) => appel[0] as LectureLignes)
      .filter((a) => a?.where?.compte?.numero?.startsWith === '12');
    expect(lectures12).toHaveLength(1);

    // La borne passe par la RELATION, jamais par un drapeau : un drapeau se
    // recopie à la main dans une OD, la relation n'existe que si une décision
    // d'affectation a réellement été enregistrée.
    expect(lectures12[0].where.ecriture.affectationResultat).toBeNull();
    // Et les deux exceptions d'ouverture restent bornées comme avant.
    expect(lectures12[0].where.ecriture.estGenereeParCloture).toBe(false);
    expect(lectures12[0].where.ecriture.motifImputationOuverture).toBeNull();
  });
});
