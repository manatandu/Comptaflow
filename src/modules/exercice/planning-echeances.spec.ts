import { Referentiel, StatutEcriture, StatutExercice } from '@prisma/client';
import { ExerciceService } from './exercice.service';

/**
 * AUDIT FINAL F77 ET F81 · le planning de clôture.
 *
 * F77 · le jalon du brouillard comptait l'écriture de clôture d'un exercice
 * clos et le report à-nouveau provisoire, que personne ne peut valider · un
 * exercice clos gardait à vie « des écritures au brouillard, à valider ».
 *
 * F81 · un jalon passait « en retard » dès minuit UTC du jour limite, et une
 * échéance FISCALE tombant un dimanche n'était pas reportée comme au registre
 * des retenues (LPF art. 110 bis, al. 2).
 *
 * La doublure de `ecriture.count` HONORE les filtres de la requête · une
 * doublure qui rendrait un nombre fixe validerait un planning qui compte tout.
 */

type Ecr = { statut: StatutEcriture; estANouveauProvisoire: boolean; estGenereeParCloture: boolean };

function service(statut: StatutExercice, ecritures: Ecr[], dateFin = new Date('2027-12-31T00:00:00.000Z')) {
  const exercice = { id: 'ex', tenantId: 't', dateDebut: new Date('2027-01-01T00:00:00.000Z'), dateFin, statut };
  const count = jest.fn(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      ecritures.filter((e) =>
        (['statut', 'estANouveauProvisoire', 'estGenereeParCloture'] as const).every(
          (cle) => !(cle in where) || where[cle] === e[cle],
        ),
      ).length,
    ),
  );
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(exercice) },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYSCOHADA,
        formeJuridique: null,
        formeJuridiqueSyscohada: 'SOCIETE_ANONYME',
        droitEtranger: false,
      }),
    },
    ecriture: { count },
    transcriptionInventaire: { count: jest.fn().mockResolvedValue(0) },
    rapportActivite: { count: jest.fn().mockResolvedValue(0) },
    donation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return new ExerciceService(prisma as never, {} as never);
}

const brouillard = (o: Partial<Ecr> = {}): Ecr => ({
  statut: StatutEcriture.BROUILLARD,
  estANouveauProvisoire: false,
  estGenereeParCloture: false,
  ...o,
});

describe('F77 · le brouillard que le planning réclame', () => {
  it('un exercice clos dont seule la clôture est au brouillard n’a rien à valider', async () => {
    const p = await service(StatutExercice.CLOTURE, [brouillard({ estGenereeParCloture: true })]).planningCloture('t', 'ex');
    const j = p.jalons.find((x) => x.observation?.libelle.includes('brouillard'));
    expect(j?.observation).toEqual({ libelle: 'Aucune écriture au brouillard', satisfait: true });
  });

  it('le report provisoire ne se réclame pas non plus, mais une pièce ordinaire si', async () => {
    const p = await service(StatutExercice.OUVERT, [
      brouillard({ estANouveauProvisoire: true, estGenereeParCloture: true }),
      brouillard(),
    ]).planningCloture('t', 'ex');
    const j = p.jalons.find((x) => x.observation?.libelle.includes('brouillard'));
    expect(j?.observation?.libelle).toMatch(/^1 écriture\(s\) encore au brouillard/);
  });

  it('la clôture d’un exercice encore ouvert se valide · elle reste réclamée', async () => {
    const p = await service(StatutExercice.OUVERT, [brouillard({ estGenereeParCloture: true })]).planningCloture('t', 'ex');
    const j = p.jalons.find((x) => x.observation?.libelle.includes('brouillard'));
    expect(j?.observation?.satisfait).toBe(false);
  });
});

describe('F81 · une échéance se lit au jour, et l’échéance fiscale se reporte', () => {
  // Exercice 2027 · les jalons « fin du quatrième mois » tombent le dimanche
  // 30 avril 2028. Le lundi 1er mai est férié (ordonnance n° 23-042) · la
  // déclaration fiscale est donc due le mardi 2 mai.
  const aLInstant = async (iso: string) => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date(iso));
    try {
      return await service(StatutExercice.OUVERT, []).planningCloture('t', 'ex');
    } finally {
      jest.useRealTimers();
    }
  };
  const fiscal = (p: Awaited<ReturnType<typeof aLInstant>>) => p.jalons.find((j) => j.etape === 15)!;
  const nonFiscal = (p: Awaited<ReturnType<typeof aLInstant>>) => p.jalons.find((j) => j.etape === 16)!;

  it('reporte la déclaration fiscale au premier jour ouvrable, et elle seule', async () => {
    const p = await aLInstant('2028-04-20T10:00:00.000Z');
    expect(fiscal(p).echeance.toISOString().slice(0, 10)).toBe('2028-05-02');
    expect(nonFiscal(p).echeance.toISOString().slice(0, 10)).toBe('2028-04-30');
  });

  it('n’est pas en retard le jour même de l’échéance', async () => {
    expect(fiscal(await aLInstant('2028-05-02T10:00:00.000Z')).enRetard).toBe(false);
    expect(nonFiscal(await aLInstant('2028-04-30T12:00:00.000Z')).enRetard).toBe(false);
  });

  it('l’est au lendemain, et le lendemain se lit à Kinshasa', async () => {
    expect(nonFiscal(await aLInstant('2028-05-01T09:00:00.000Z')).enRetard).toBe(true);
    // 23 h 30 UTC le 2 mai, c'est déjà le 3 à Kinshasa (UTC+1).
    expect(fiscal(await aLInstant('2028-05-02T23:30:00.000Z')).enRetard).toBe(true);
    expect(fiscal(await aLInstant('2028-05-02T22:30:00.000Z')).enRetard).toBe(false);
  });
});
