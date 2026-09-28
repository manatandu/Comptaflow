import { BadRequestException } from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import { PrismaService } from '../../common/prisma.service';
import { BAREMES_SERVIS, type LigneVersion } from './baremes-dossier';
import { BAREMES_ONEM } from './cotisations-paie';
import { MULTIPLICATEURS_ARTICLE_7 } from './bareme-smig';
import type { SimulationPaieDto } from './dto/personnel.dto';

/**
 * LA SIMULATION NE LIT QUE LES VERSIONS DU CABINET QUE SON MOIS PEUT APPLIQUER
 * (audit final F259, suite), ET ELLE REND EXACTEMENT CE QU'ELLE RENDAIT EN
 * LES LISANT TOUTES.
 *
 * `simulerPaie` lisait toutes les versions de barème du dossier, sans borne.
 * Chaque moteur n'en retient pourtant qu'une par barème, la plus récente dont
 * le MOIS d'effet est atteint, après fusion avec les versions livrées. La
 * lecture bornée (`versionsBaremesDuMois`) prend donc, par barème, la plus
 * récente au plus tard du mois. Ce spec ne croit pas ce raisonnement · il
 * REJOUE la simulation deux fois sur le même dossier, une fois par la lecture
 * bornée, une fois sur toutes les versions du dossier (l'ancienne lecture,
 * rétablie en remplaçant la méthode privée), et exige le même résultat au
 * centime, mois par mois.
 *
 * LE JEU D'ESSAI PORTE LES CAS OÙ UNE BORNE FAUSSE SE VERRAIT, et chacun est
 * nommé pour qu'on ne le « simplifie » pas :
 *  · deux versions CNSS du cabinet avant juillet 2026, la seconde datée du 15 ·
 *    un tri croissant rendrait la plus ancienne, une borne au premier jour du
 *    mois perdrait celle du 15, que le moteur applique déjà (il compare des
 *    mois) ;
 *  · une INPP du 31 août et une du 1er septembre · une borne d'un mois de trop
 *    rendrait pour août celle de septembre, que le moteur écarte, et la
 *    version d'août ne serait plus lue ;
 *  · une CNSS du 1er janvier 2027 · décembre passe à l'année suivante ;
 *  · une ONEM et une grille SMIG du cabinet PLUS ANCIENNES qu'un texte livré
 *    depuis · la version livrée doit l'emporter dans les deux lectures, la
 *    fusion se faisant après la lecture ;
 *  · un autre dossier, dont aucune version ne doit jamais être lue.
 *
 * Les taux et les références ci-dessous sont des DONNÉES D'ESSAI, saisies
 * comme le ferait un cabinet · aucun n'est présenté comme un texte en vigueur.
 */

type Version = LigneVersion & { tenantId: string };

const cnss = (tenantId: string, aPartirDu: string, pension: number): Version => ({
  tenantId,
  bareme: 'CNSS',
  aPartirDu,
  reference: `Référence d'essai CNSS du ${aPartirDu}`,
  valeurs: {
    prestationsAuxFamilles: 7,
    pensionsEmployeur: pension,
    pensionsTravailleur: pension,
    risquesProfessionnels: 2,
  },
});

const inpp = (tenantId: string, aPartirDu: string, prive: number): Version => ({
  tenantId,
  bareme: 'INPP',
  aPartirDu,
  reference: `Référence d'essai INPP du ${aPartirDu}`,
  valeurs: {
    publicPourCent: 4.5,
    priveParTranche: [
      { jusqua: 50, tauxPourCent: prive },
      { jusqua: null, tauxPourCent: prive / 2 },
    ],
  },
});

const onem = (tenantId: string, aPartirDu: string, taux: number): Version => ({
  tenantId,
  bareme: 'ONEM',
  aPartirDu,
  reference: `Référence d'essai ONEM du ${aPartirDu}`,
  valeurs: { tauxPourCent: taux },
});

const smig = (tenantId: string, aPartirDu: string, smigJournalierFc: number): Version => ({
  tenantId,
  bareme: 'SMIG',
  aPartirDu,
  reference: `Référence d'essai SMIG du ${aPartirDu}`,
  valeurs: { smigJournalierFc },
});

// Volontairement dans le désordre · l'ancienne lecture n'ordonnait rien.
const VERSIONS: Version[] = [
  cnss('t-1', '2026-07-15', 6),
  onem('t-1', '2024-03-01', 0.3),
  cnss('t-2', '2026-05-01', 9),
  inpp('t-1', '2026-09-01', 4),
  smig('t-1', '2025-08-01', 15_000),
  cnss('t-1', '2027-01-01', 7),
  onem('t-2', '2026-01-01', 0.9),
  cnss('t-1', '2026-03-01', 5.5),
  inpp('t-1', '2026-08-31', 3.8),
  smig('t-1', '2026-06-01', 23_000),
  onem('t-1', '2026-11-01', 0.6),
  smig('t-2', '2026-02-01', 30_000),
];

const MOIS = ['2024-06', '2025-10', '2026-02', '2026-03', '2026-07', '2026-08', '2026-09', '2026-12', '2027-01'];

/**
 * La doublure de `findFirst` HONORE ce que la requête demande · le dossier, le
 * barème, la borne de date et le tri. Elle refuse tout filtre ou opérateur
 * qu'elle ne connaît pas, plutôt que de l'ignorer · une doublure qui ignore un
 * filtre valide un code qui ne charge pas ce qu'il croit charger. Un champ
 * absent du filtre n'en restreint rien, comme chez Prisma.
 */
function lectureBornee(versions: readonly Version[]) {
  const findFirst = jest.fn(
    async (args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => {
      const { tenantId, bareme, aPartirDu, ...reste } = args.where;
      if (Object.keys(reste).length > 0) {
        throw new Error(`Filtre inconnu de la doublure : ${Object.keys(reste).join(', ')}`);
      }
      let lignes = versions.filter(
        (v) => (tenantId === undefined || v.tenantId === tenantId) && (bareme === undefined || v.bareme === bareme),
      );
      for (const [op, borne] of Object.entries((aPartirDu ?? {}) as Record<string, string>)) {
        if (op === 'lt') lignes = lignes.filter((v) => v.aPartirDu < borne);
        else if (op === 'lte') lignes = lignes.filter((v) => v.aPartirDu <= borne);
        else if (op === 'gt') lignes = lignes.filter((v) => v.aPartirDu > borne);
        else if (op === 'gte') lignes = lignes.filter((v) => v.aPartirDu >= borne);
        else throw new Error(`Opérateur inconnu de la doublure : ${op}`);
      }
      if (args.orderBy) {
        const { aPartirDu: sens, ...autres } = args.orderBy;
        if (Object.keys(autres).length > 0 || (sens !== 'asc' && sens !== 'desc')) {
          throw new Error(`Tri inconnu de la doublure : ${JSON.stringify(args.orderBy)}`);
        }
        lignes = [...lignes].sort((a, b) =>
          sens === 'asc' ? a.aPartirDu.localeCompare(b.aPartirDu) : b.aPartirDu.localeCompare(a.aPartirDu),
        );
      }
      const trouvee = lignes[0];
      if (!trouvee) return null;
      return { bareme: trouvee.bareme, aPartirDu: trouvee.aPartirDu, reference: trouvee.reference, valeurs: trouvee.valeurs };
    },
  );
  return findFirst;
}

function service(versions: readonly Version[]) {
  const findFirst = lectureBornee(versions);
  const salarie = { findFirst: jest.fn().mockResolvedValue(null) };
  const tenant = { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) };
  // Aucun `findMany` · la simulation ne lit plus les versions en liste.
  const prisma = { salarie, tenant, versionBaremePaie: { findFirst } } as unknown as PrismaService;
  return { svc: new PersonnelService(prisma), findFirst, salarie, tenant };
}

/**
 * L'ANCIENNE LECTURE, rétablie · toutes les versions du dossier, dans l'ordre
 * du stockage. On remplace la méthode privée plutôt que d'écrire un second
 * calcul · tout le reste de la simulation reste celui du service.
 */
function serviceSurToutesLesVersions(versions: readonly Version[], tenantId: string) {
  const { svc } = service(versions);
  const toutes: LigneVersion[] = versions
    .filter((v) => v.tenantId === tenantId)
    .map(({ bareme, aPartirDu, reference, valeurs }) => ({ bareme, aPartirDu, reference, valeurs }));
  jest
    .spyOn(svc as unknown as { versionsBaremesDuMois: () => Promise<LigneVersion[]> }, 'versionsBaremesDuMois')
    .mockResolvedValue(toutes);
  return svc;
}

// Un salaire sous le plancher de la CNSS, pour que la grille SMIG retenue se
// lise sur l'assiette · la classe et les enfants font passer la quotité et le
// taux légal des allocations familiales par la même grille.
const saisie = (moisDePaie: string): SimulationPaieDto =>
  ({
    moisDePaie,
    elements: [{ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire', montantFc: 300_000 }],
    natureEmployeurInpp: 'PRIVE',
    effectif: 30,
    joursPayes: MULTIPLICATEURS_ARTICLE_7.MOIS,
    classeProfessionnelle: 5,
    enfantsBeneficiairesAllocations: 2,
  }) as SimulationPaieDto;

type Resultat = Awaited<ReturnType<PersonnelService['simulerPaie']>>;
const ligne = (r: Resultat, organisme: 'CNSS' | 'INPP' | 'ONEM') => {
  const l = r.cotisations.lignes.find((x) => x.organisme === organisme);
  if (!l) throw new Error(`Aucune ligne ${organisme} pour ${r.moisDePaie}`);
  return l;
};

describe('simulerPaie · les barèmes du cabinet lus pour le seul mois simulé', () => {
  it.each(MOIS)('%s · le même résultat, au centime, que sur toutes les versions du dossier', async (mois) => {
    const { svc } = service(VERSIONS);
    const bornee = await svc.simulerPaie('t-1', null, saisie(mois));
    const complete = await serviceSurToutesLesVersions(VERSIONS, 't-1').simulerPaie('t-1', null, saisie(mois));
    expect(bornee).toEqual(complete);
  });

  // Sans ces contrôles, l'égalité pourrait tenir parce que ni l'une ni l'autre
  // lecture n'atteint une version du cabinet · elle ne prouverait rien.
  it('le jeu d\'essai atteint bien les versions du cabinet, et les versions livrées plus récentes', async () => {
    const { svc } = service(VERSIONS);
    const [octobre25, mars, juillet, aout, septembre, decembre, janvier27] = await Promise.all(
      ['2025-10', '2026-03', '2026-07', '2026-08', '2026-09', '2026-12', '2027-01'].map((m) =>
        svc.simulerPaie('t-1', null, saisie(m)),
      ),
    );
    // Une ONEM du cabinet plus ancienne qu'un texte livré depuis · le livré l'emporte.
    expect(ligne(octobre25, 'ONEM').source).toContain(BAREMES_ONEM[BAREMES_ONEM.length - 1].reference);
    expect(ligne(octobre25, 'ONEM').source).not.toContain("Référence d'essai ONEM du 2024-03-01");
    // Deux CNSS du cabinet, la seconde datée du 15 · c'est elle qui régit juillet.
    expect(ligne(mars, 'CNSS').source).toContain("Référence d'essai CNSS du 2026-03-01");
    expect(ligne(juillet, 'CNSS').source).toContain("Référence d'essai CNSS du 2026-07-15");
    // Le 31 août régit août, le 1er septembre septembre.
    expect(ligne(aout, 'INPP').source).toContain("Référence d'essai INPP du 2026-08-31");
    expect(ligne(septembre, 'INPP').source).toContain("Référence d'essai INPP du 2026-09-01");
    // Décembre ne lit pas la version de janvier suivant, janvier la lit.
    expect(ligne(decembre, 'CNSS').source).toContain("Référence d'essai CNSS du 2026-07-15");
    expect(ligne(decembre, 'ONEM').source).toContain("Référence d'essai ONEM du 2026-11-01");
    expect(ligne(janvier27, 'CNSS').source).toContain("Référence d'essai CNSS du 2027-01-01");
    // La grille SMIG relève l'assiette de la CNSS · la grille livrée de janvier
    // 2026 l'emporte en mars sur celle du cabinet d'août 2025, celle du cabinet
    // de juin 2026 régit juillet.
    expect(ligne(octobre25, 'CNSS').assietteFc).toBe(15_000 * MULTIPLICATEURS_ARTICLE_7.MOIS);
    expect(ligne(mars, 'CNSS').assietteFc).not.toBe(15_000 * MULTIPLICATEURS_ARTICLE_7.MOIS);
    expect(ligne(juillet, 'CNSS').assietteFc).toBe(23_000 * MULTIPLICATEURS_ARTICLE_7.MOIS);
    // Rien de l'autre dossier.
    for (const r of [octobre25, mars, juillet, aout, septembre, decembre, janvier27]) {
      expect(JSON.stringify(r)).not.toContain('2026-05-01');
    }
  });

  it('une lecture par barème servi, bornée au dossier et au premier jour du mois suivant, la plus récente d\'abord', async () => {
    for (const [mois, borne] of [
      ['2026-07', '2026-08-01'],
      ['2026-12', '2027-01-01'],
    ] as const) {
      const { svc, findFirst } = service(VERSIONS);
      await svc.simulerPaie('t-1', null, saisie(mois));
      expect(findFirst).toHaveBeenCalledTimes(BAREMES_SERVIS.length);
      expect(findFirst.mock.calls.map(([a]) => a.where.bareme).sort()).toEqual([...BAREMES_SERVIS].sort());
      for (const [args] of findFirst.mock.calls) {
        expect(args.where).toEqual({ tenantId: 't-1', bareme: args.where.bareme, aPartirDu: { lt: borne } });
        expect(args.orderBy).toEqual({ aPartirDu: 'desc' });
      }
    }
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-01', ''])(
    'un mois illisible (« %s ») est refusé avant toute lecture',
    async (mois) => {
      const { svc, findFirst, salarie, tenant } = service(VERSIONS);
      await expect(svc.simulerPaie('t-1', null, saisie(mois))).rejects.toThrow(BadRequestException);
      await expect(svc.simulerPaie('t-1', null, saisie(mois))).rejects.toThrow(
        'Mois de paie illisible · la forme attendue est AAAA-MM.',
      );
      expect(findFirst).not.toHaveBeenCalled();
      expect(salarie.findFirst).not.toHaveBeenCalled();
      expect(tenant.findUniqueOrThrow).not.toHaveBeenCalled();
    },
  );
});
