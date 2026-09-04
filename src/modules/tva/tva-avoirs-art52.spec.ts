import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * VENTES ANNULÉES, RÉSILIÉES, ET AVOIRS FOURNISSEURS · article 52.
 *
 * La déclaration lisait chaque famille À SENS UNIQUE : le CRÉDIT des comptes
 * 443 pour la collecte, le DÉBIT des comptes 445 pour la déduction. Un avoir
 * sur vente, qui DÉBITE le 443, ne venait donc jamais en diminution ; un avoir
 * fournisseur, qui CRÉDITE le 445, laissait la déduction d'origine intacte. Le
 * comptable pouvait passer l'écriture juste, la déclaration ne la voyait pas :
 * le dossier versait la taxe d'une vente qui n'existe plus, et conservait une
 * déduction qu'il devait reverser.
 *
 * LE TEXTE, ET IL COMMANDE DEUX TRAITEMENTS DIFFÉRENTS.
 *
 * O.-L. n° 10/001, art. 52 (fichier
 * `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * l. 1234-1239) : « La taxe sur la valeur ajoutée acquittée à l'occasion des
 * ventes ou des services qui sont par la suite résiliés, annulés ou restent
 * impayés peut être récupérée par voie d'imputation sur l'impôt dû pour les
 * opérations faites ultérieurement. / Pour les opérations annulées ou
 * résiliées, la récupération de la taxe acquittée est subordonnée à
 * l'établissement et à l'envoi au client d'une facture nouvelle ou note de
 * crédit annulant et remplaçant la facture initiale. »
 *
 * Décret n° 011/42, art. 126 (fichier
 * `code-general-2026/references/12-tva-decret-application-ch5-8.md`,
 * l. 700-705) : « […] peut être récupérée par voie d'imputation sur la taxe
 * due pour les opérations faites ultérieurement. Dans ce cas, elle est
 * inscrite dans les déductions afférentes à la déclaration du ou des mois
 * suivants celui de la constatation de la résiliation, de l'annulation ou de
 * non-paiement, dans les conditions prévues pour exercer le droit à
 * déduction. » L'avoir sur vente ne minore donc PAS la collecte du mois où il
 * est constaté : il est INSCRIT EN DÉDUCTION DE LA DÉCLARATION SUIVANTE.
 *
 * Décret n° 011/42, art. 127, l. 724-725, pour l'autre sens : « A la réception
 * du duplicata de la facture, le client est tenu de reverser la taxe déduite. »
 * La reprise de déduction, elle, se fait à la constatation.
 *
 * Article NON modifié par la L.F. n° 25/060 du 29 décembre 2025, qui ne touche
 * en TVA que les art. 10, 35, 42 point 4, 60, 62 et 74
 * (`lois-de-finances-annuelles/references/lf-2026-mesures-fiscales.md`,
 * l. 84-91).
 */

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'TVA 16 %',
  taux: 16,
  compteCollecteId: 'c443',
  compteDeductibleId: 'c445',
};

interface LigneFausse {
  numero: string;
  date: string;
  debit?: number;
  credit?: number;
}

interface Liquidation {
  dateDebut: Date;
  dateFin: Date;
  net: number;
}

function service(lignes: LigneFausse[], derniere: Liquidation | null = null) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        // Seule la requête de la DÉCLARATION porte les deux racines · celle du
        // prorata n'en porte qu'une, et ce spec ne l'observe pas.
        const compte = where.compte as { OR?: unknown } | undefined;
        if (!compte?.OR) return Promise.resolve([]);
        return Promise.resolve(
          lignes.map((l) => ({
            id: `l-${l.numero}-${l.date}`,
            tauxTvaId: TAUX.id,
            compte: { numero: l.numero },
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            ecriture: { date: new Date(l.date), lignes: [] },
          })),
        );
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        // Deux lectures distinctes : le VERROU cherche une liquidation qui
        // chevauche la période (`dateFin: { gte }`), le report des avoirs et le
        // crédit de l'art. 63 cherchent la dernière ANTÉRIEURE (`dateFin: { lt }`).
        const dateFin = where.dateFin as { lt?: Date; gte?: Date } | undefined;
        if (dateFin?.lt === undefined) return Promise.resolve(null);
        return Promise.resolve(
          derniere
            ? { id: 'liq1', dateDebut: derniere.dateDebut, dateFin: derniere.dateFin, net: derniere.net, ecritureId: 'e-liq1' }
            : null,
        );
      }),
    },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const MARS = new Date('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');
const AVRIL = new Date('2026-04-01');
const FIN_AVRIL = new Date('2026-04-30T23:59:59.999Z');
const LIQUIDATION_DE_MARS: Liquidation = { dateDebut: MARS, dateFin: FIN_MARS, net: 0 };

describe('Avoir sur VENTE · reporté sur la déclaration suivante (art. 52, décret art. 126)', () => {
  it('ne minore PAS la collecte du mois de sa constatation, et le montant est rendu', async () => {
    // 3 200 000 de TVA facturée, et une vente de 10 000 000 HT annulée le mois
    // même : la note de crédit débite 1 600 000 au 443. Le décret art. 126 la
    // renvoie aux déductions du mois SUIVANT · la collecte de mars reste
    // entière, mais l'avoir n'est plus invisible.
    const s = service([
      { numero: '44310000', date: '2026-03-10', credit: 3_200_000 },
      { numero: '44310000', date: '2026-03-20', debit: 1_600_000 },
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(3_200_000);
    expect(d.avoirsCollecteConstates).toBe(1_600_000);
    expect(d.mentionExigibilite).toContain('AVOIRS SUR VENTES CONSTATÉS');
    expect(d.mentionExigibilite).toContain('art. 126');
    // La condition de l'article 127 · le logiciel ne peut pas la vérifier, il
    // la nomme.
    expect(d.mentionExigibilite).toContain('ENVOYÉE au client');
  });

  it('s’inscrit en DÉDUCTION de la déclaration suivante et diminue le net d’autant', async () => {
    // Mars liquidé, avoir constaté le 20 mars, avril déclaré : 2 000 000 de
    // taxe collectée moins 1 600 000 récupérés = 400 000 dus. Sans imputation,
    // le dossier versait 2 000 000 sur une vente dont une part n'existe plus.
    const s = service(
      [
        { numero: '44310000', date: '2026-03-20', debit: 1_600_000 },
        { numero: '44310000', date: '2026-04-15', credit: 2_000_000 },
      ],
      LIQUIDATION_DE_MARS,
    );
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.totalCollecte).toBe(2_000_000);
    expect(d.recuperationArt52).toBe(1_600_000);
    expect(d.netAvantImputation).toBe(400_000);
    expect(d.mentionExigibilite).toContain('RÉCUPÉRATION SUR VENTES ANNULÉES');
  });

  it('n’est PAS amputée par le prorata de l’article 43', async () => {
    // Le prorata limite la déduction de la taxe ayant grevé les ACHATS ·
    // l'article 43 ne parle que de celle-là. La récupération de l'article 52
    // est la propre taxe du redevable, qui lui revient en entier.
    const s = service(
      [
        { numero: '44310000', date: '2026-03-20', debit: 100_000 },
        { numero: '44310000', date: '2026-04-15', credit: 1_000_000 },
        { numero: '44520000', date: '2026-04-16', debit: 400_000 },
      ],
      LIQUIDATION_DE_MARS,
    );
    jest.spyOn(s, 'prorataApplicable').mockResolvedValue({ pourcentage: 50, recettesNonQualifiees: 0 } as never);
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.totalDeductibleAdmise).toBe(200_000);
    // 1 000 000 - 200 000 - 100 000 · et non 1 000 000 - 200 000 - 50 000.
    expect(d.netAvantImputation).toBe(700_000);
  });

  it('un avoir plus ancien que la dernière période liquidée n’est ni réimputé, ni signalé', async () => {
    // Il a été imputé par la déclaration qui a suivi sa constatation, par
    // cette même règle. L'imputer une seconde fois serait une déduction en
    // double ; le signaler serait une fausse alerte tous les mois.
    const s = service(
      [
        { numero: '44310000', date: '2026-01-20', debit: 900_000 },
        { numero: '44310000', date: '2026-04-15', credit: 2_000_000 },
      ],
      LIQUIDATION_DE_MARS,
    );
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.recuperationArt52).toBe(0);
    expect(d.avoirsCollecteNonImputes).toBe(0);
    expect(d.netAvantImputation).toBe(2_000_000);
  });

  it('sans aucune liquidation antérieure, rien n’est imputé d’office · le montant est NOMMÉ', async () => {
    // Le logiciel ne sait pas quelles déclarations ont déjà été déposées :
    // imputer d'office risquerait une déduction en double, sanctionnable. Il
    // s'abstient et rend le chiffre au comptable.
    const s = service(
      [
        { numero: '44310000', date: '2026-03-20', debit: 1_600_000 },
        { numero: '44310000', date: '2026-04-15', credit: 2_000_000 },
      ],
      null,
    );
    const d = await s.declaration('t1', AVRIL, FIN_AVRIL);
    expect(d.recuperationArt52).toBe(0);
    expect(d.avoirsCollecteNonImputes).toBe(1_600_000);
    expect(d.netAvantImputation).toBe(2_000_000);
    expect(d.mentionExigibilite).toContain('AVOIRS ANTÉRIEURS NON IMPUTÉS');
  });
});

describe('Avoir FOURNISSEUR · la déduction est reprise à la constatation (décret art. 127)', () => {
  it('vient en diminution de la TVA déductible de la période', async () => {
    // 800 000 de TVA d'amont, dont 300 000 annulés par un avoir du
    // fournisseur : la déduction n'est plus que de 500 000. La laisser à
    // 800 000 est une déduction indue, et celle-là se sanctionne.
    const s = service([
      { numero: '44520000', date: '2026-03-10', debit: 800_000 },
      { numero: '44520000', date: '2026-03-25', credit: 300_000 },
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(500_000);
  });

  it('peut rendre la déduction de la période NÉGATIVE · c’est un reversement, pas un zéro', async () => {
    // Un avoir peut porter sur une facture d'un mois antérieur et dépasser la
    // déduction du mois. Le reversement est dû, et le net s'en trouve accru.
    const s = service([
      { numero: '44310000', date: '2026-03-10', credit: 1_000_000 },
      { numero: '44520000', date: '2026-03-11', debit: 100_000 },
      { numero: '44520000', date: '2026-03-25', credit: 400_000 },
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(-300_000);
    expect(d.netAvantImputation).toBe(1_300_000);
  });
});

/**
 * L'écriture de liquidation doit SOLDER le débit que l'avoir a laissé sur le
 * compte de TVA facturée. Sans cette ligne, le 443 resterait débiteur
 * indéfiniment · et l'écriture ne s'équilibrerait pas, puisque le net porté au
 * 444 tient compte de la récupération.
 */
describe('Comptabilisation · la récupération solde le 443 et l’écriture reste équilibrée', () => {
  function liquidation(recuperation: number, totalDeductible: number) {
    const ecrites: { compteId: string; debit?: number; credit?: number; libelle?: string }[][] = [];
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      compte: { findFirst: jest.fn(({ where }: { where: { numero: string } }) => Promise.resolve({ id: `c-${where.numero}`, numero: where.numero })) },
      journal: { findFirst: jest.fn().mockResolvedValue({ id: 'j-od', code: 'OD' }) },
      liquidationTva: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const ecritureService = {
      creer: jest.fn((_t: string, _u: string, dto: { lignes: typeof ecrites[number] }) => {
        ecrites.push(dto.lignes);
        return Promise.resolve({ id: 'e1' });
      }),
    } as unknown as EcritureService;
    const svc = new TauxTvaService(prisma, ecritureService);
    const collecte = 2_000_000;
    jest.spyOn(svc, 'declaration').mockResolvedValue({
      totalCollecte: collecte,
      totalDeductibleAdmise: totalDeductible,
      recuperationArt52: recuperation,
      netAvantImputation: collecte - totalDeductible - recuperation,
      creditAnterieur: 0,
      creditImpute: 0,
      net: collecte - totalDeductible - recuperation,
      prorata: { pourcentage: 100 },
      lignes: [
        {
          compteCollecteId: 'c-443',
          totalCollecte: collecte,
          compteDeductibleId: 'c-445',
          totalDeductible,
          recuperationArt52: recuperation,
        },
      ],
    } as never);
    return { svc, ecrites };
  }

  const equilibre = (lignes: { debit?: number; credit?: number }[]) => {
    const d = lignes.reduce((s, l) => s + (l.debit ?? 0), 0);
    const c = lignes.reduce((s, l) => s + (l.credit ?? 0), 0);
    return Math.round((d - c) * 100) / 100;
  };

  it('crédite le compte de TVA facturée du montant récupéré, et reste équilibrée', async () => {
    const { svc, ecrites } = liquidation(600_000, 500_000);
    await svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex1', dateDebut: '2026-04-01', dateFin: '2026-04-30' });
    const ligne = ecrites[0].find((l) => l.libelle?.includes('art. 52'));
    expect(ligne?.compteId).toBe('c-443');
    expect(ligne?.credit).toBe(600_000);
    expect(equilibre(ecrites[0])).toBe(0);
  });

  it('porte au DÉBIT du 445 une déduction devenue négative, au lieu de l’omettre', async () => {
    // La condition « > 0 » qui filtrait les comptes de déduction laissait
    // tomber la ligne : l'écriture partait déséquilibrée, ou son net ne
    // correspondait plus à la déclaration.
    const { svc, ecrites } = liquidation(0, -300_000);
    await svc.comptabiliserLiquidation('t1', 'u1', { exerciceId: 'ex1', dateDebut: '2026-03-01', dateFin: '2026-03-31' });
    const ligne = ecrites[0].find((l) => l.compteId === 'c-445');
    expect(ligne?.debit).toBe(300_000);
    expect(equilibre(ecrites[0])).toBe(0);
  });
});
