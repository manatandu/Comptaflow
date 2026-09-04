import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE NUMÉRATEUR DU PRORATA ET LES EXPORTATIONS · article 43.
 *
 * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * art. 43, l. 1115-1117 : la fraction est le rapport entre « le montant annuel
 * des recettes afférentes aux opérations ouvrant droit à déduction de la taxe
 * sur la valeur ajoutée, Y COMPRIS LES EXPORTATIONS ET OPÉRATIONS ASSIMILÉES »
 * et le montant annuel des recettes de toute nature. Article modifié par la
 * L.F. n° 14/002 du 31 janvier 2014, NON retouché par la L.F. n° 25/060.
 *
 * LE SERVEUR NE PEUT PAS RECONNAÎTRE UNE EXPORTATION DANS UN CRÉDIT DE CLASSE 7
 * NU. Le numérateur compte les recettes au taux zéro à condition qu'une ligne
 * de TVA taguée à ce taux existe · or la saisie guidée n'en pose AUCUNE quand
 * la taxe est nulle (`client/src/components/ModelesSaisie.tsx`,
 * `if (tva > 0.005)`). Une vente à l'export saisie par le chemin ordinaire ne
 * crée donc jamais de ligne de TVA : elle pèse au dénominateur, sans jamais
 * entrer au numérateur, et le prorata sort minoré.
 *
 * Rien, côté serveur, ne distingue cette recette d'une recette EXONÉRÉE, qui
 * elle n'ouvre aucun droit et doit bien rester au seul dénominateur. Deviner
 * serait ici gonfler un prorata sans texte, et une déduction excessive se
 * sanctionne. Le logiciel compte donc ce qu'il ne peut pas qualifier, et le
 * NOMME avec son article · c'est la seule chose honnête qu'il puisse faire
 * tant que la saisie ne pose pas la ligne au taux zéro.
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };

/**
 * @param taxees Base HT des ventes taxées · reconstituée par le numérateur à
 *   partir de la taxe et du taux.
 * @param nonQualifiees Recettes de classe 7 dont l'écriture ne porte aucune
 *   ligne de TVA collectée · exportations et exonérées confondues.
 */
function service(taxees: number, nonQualifiees: number) {
  const recettesTotales = taxees + nonQualifiees;
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel: 'SYSCOHADA' }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { OR?: unknown; numero?: { startsWith?: string } } | undefined;
        // Requête de la DÉCLARATION · deux racines. Ce spec n'observe que le
        // prorata, elle ne rend rien.
        if (compte?.OR) return Promise.resolve([]);
        // Numérateur du prorata · les lignes de TVA collectée taguées.
        if (compte?.numero?.startsWith !== '443') return Promise.resolve([]);
        return Promise.resolve(
          taxees > 0
            ? [{ credit: (taxees * 16) / 100, ecritureId: 'e-taxee', compte: { numero: '44310000' }, tauxTva: { taux: 16 } }]
            : [],
        );
      }),
      aggregate: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { OR?: unknown } | undefined;
        const ecriture = where.ecriture as { lignes?: { none?: unknown } } | undefined;
        // Recettes que rien ne qualifie · l'écriture ne porte AUCUNE ligne de
        // TVA collectée. C'est le `none` qui identifie cette requête.
        if (ecriture?.lignes?.none) return Promise.resolve({ _sum: { credit: nonQualifiees } });
        // Recettes exclues du dénominateur (art. 43) · aucune ici.
        if (compte?.OR) return Promise.resolve({ _sum: { credit: 0 } });
        return Promise.resolve({ _sum: { credit: recettesTotales } });
      }),
    },
    liquidationTva: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const DEBUT = new Date('2026-01-01');
const FIN = new Date('2026-12-31T23:59:59.999Z');

describe('Prorata · les recettes que rien ne qualifie sont comptées et NOMMÉES', () => {
  it('rend le montant des recettes sans ligne de TVA, et cite les exportations', async () => {
    // Le cas de l'exportateur : 40 000 000 de ventes locales taxées et
    // 60 000 000 à l'export. Le prorata sort à 40 % au lieu de 100 %, et
    // 4 800 000 de déduction sont perdus sur 8 000 000 de TVA d'amont.
    // Le logiciel ne peut pas requalifier ces 60 000 000 · il les montre.
    const s = service(40_000_000, 60_000_000);
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.numerateur).toBe(40_000_000);
    expect(p.denominateur).toBe(100_000_000);
    expect(p.pourcentage).toBe(40);
    expect(p.recettesNonQualifiees).toBe(60_000_000);
    expect(p.mentionDenominateur).toContain('EXPORTATIONS');
    expect(p.mentionDenominateur).toContain('sous-évalué');
  });

  it('ne dit rien quand toutes les recettes portent leur ligne de TVA', async () => {
    // Le garde-fou : un avertissement qui s'affiche toujours ne se lit plus.
    const s = service(40_000_000, 0);
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.recettesNonQualifiees).toBe(0);
    expect(p.pourcentage).toBe(100);
    expect(p.mentionDenominateur).not.toContain('EXPORTATIONS');
  });

  it('la déclaration porte l’avertissement, avec son montant et son article', async () => {
    // La mention d'exigibilité est le seul texte libre que la fenêtre rende ·
    // sans elle, le chiffre du prorata resterait invérifiable à l'écran.
    const s = service(40_000_000, 60_000_000);
    const d = await s.declaration('t1', DEBUT, FIN);
    // `toLocaleString('fr-FR')` sépare les milliers par une espace fine
    // insécable · on la normalise plutôt que de la coder en dur.
    const mention = d.mentionExigibilite.replace(/[\u202f\u00a0]/g, ' ');
    expect(mention).toContain('60 000 000');
    expect(d.mentionExigibilite).toContain('SOUS-ÉVALUÉ');
    expect(d.mentionExigibilite).toContain('Y COMPRIS LES EXPORTATIONS');
  });
});
