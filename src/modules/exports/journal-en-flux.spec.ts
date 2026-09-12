import { Writable } from 'stream';
import * as ExcelJS from 'exceljs';
import { ExportService } from './export.service';
import { PrismaService } from '../../common/prisma.service';
import { PLAFOND_ECRITURES_PAR_FENETRE, perimetreJournal } from '../comptabilite/ecriture.service';
import { LIGNE_ENTETE, PREMIERE_LIGNE_DONNEES, OPTIONS_CLASSEUR_EN_FLUX } from './classeur-en-flux';

/**
 * LE JOURNAL EXPORTÉ SORTAIT FAUX, ET RIEN NE LE DISAIT.
 *
 * `journalExcel` appelait `EcritureService.lister()` sans limite. Or `lister`
 * n'en rend jamais plus de `PLAFOND_ECRITURES_PAR_FENETRE`, soit 2 000 · le
 * plafond d'une FENÊTRE, posé pour qu'un écran ne tue pas le serveur. Un
 * fichier n'est pas une fenêtre : le journal d'un dossier de trois mille
 * écritures s'exportait amputé du tiers, sans un mot.
 *
 * Et la ligne TOTAUX aggravait l'amputation au lieu de la révéler. Elle porte
 * une formule `SUM` sur les lignes écrites ET, en valeur jointe, l'agrégat SQL
 * de la période ENTIÈRE. Le même classeur annonçait donc deux totaux : Excel
 * recalcule et montre le tronqué, tout ce qui lit sans moteur de calcul (un
 * import, un convertisseur, un aperçu) lit le complet.
 *
 * Le livre-journal est un livre obligatoire (AUDCIF art. 22, 6°). Le grand
 * livre porte déjà, en toutes lettres, qu'« un livre amputé en silence est un
 * document FAUX » · le journal n'avait pas eu droit à la même phrase.
 */

const EXERCICE = { id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

/** Une écriture à deux lignes, équilibrée · le grain de l'export. */
const ecriture = (i: number) => ({
  id: `e-${String(i).padStart(6, '0')}`,
  date: new Date('2026-03-01'),
  numeroPiece: i,
  reference: `FAC-${i}`,
  libelle: `Écriture ${i}`,
  statut: 'VALIDEE',
  motifCorrection: null,
  createdAt: new Date('2026-03-02'),
  createdBy: 'u-1',
  valideeAt: new Date('2026-03-03'),
  valideeBy: 'u-1',
  journal: { code: 'ACH' },
  correction: null,
  corrigeEcriture: null,
  lignes: [
    { debit: 100, credit: 0, lettre: null, libelle: 'débit', compte: { numero: '60410000', intitule: 'Achats' } },
    { debit: 0, credit: 100, lettre: null, libelle: 'crédit', compte: { numero: '40100000', intitule: 'Fournisseurs' } },
  ],
});

/**
 * Un faux Prisma qui PAGINE VRAIMENT · il honore `take`, `cursor` et `skip`.
 * Une doublure qui rendrait tout d'un coup validerait un service qui ne lit
 * pas par lots, et une doublure qui rendrait toujours la même chose bouclerait
 * sans fin.
 */
function service(nbEcritures: number) {
  const toutes = Array.from({ length: nbEcritures }, (_, i) => ecriture(i + 1));
  const findMany = jest.fn(async ({ take, cursor, skip }: { take: number; cursor?: { id: string }; skip?: number }) => {
    const depart = cursor ? toutes.findIndex((e) => e.id === cursor.id) + (skip ?? 0) : 0;
    return toutes.slice(depart, depart + take);
  });
  const prisma = {
    ligneEcriture: { count: jest.fn().mockResolvedValue(nbEcritures * 2) },
    ecriture: { findMany },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u-1', email: 'comptable@vmg.cd' }]) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ nom: 'Dossier', numeroImpot: 'A1', devise: 'CDF' }) },
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE), findUnique: jest.fn().mockResolvedValue(EXERCICE) },
  };
  const svc = new ExportService(
    prisma as unknown as PrismaService,
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
  );
  return { svc, findMany };
}

/** Exécute l'export et relit le classeur produit. */
async function exporter(nbEcritures: number) {
  const { svc, findMany } = service(nbEcritures);
  const morceaux: Buffer[] = [];
  const sortie = new Writable({
    write(m, _e, cb) {
      morceaux.push(Buffer.from(m));
      cb();
    },
  });
  let nomFichier = '';
  await svc.journalExcelEnFlux('t1', { exerciceId: 'ex' }, (nom) => {
    nomFichier = nom;
    return sortie;
  });
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(Buffer.concat(morceaux) as never);
  return { feuille: classeur.worksheets[0], nomFichier, findMany };
}

describe('Journal exporté en flux', () => {
  it('N’EST PLUS AMPUTÉ au plafond de la fenêtre', async () => {
    // 2 500 écritures, soit au-delà des 2 000 que `lister` rendait. Deux
    // lignes par écriture : 5 000 lignes attendues, pas 4 000.
    expect(PLAFOND_ECRITURES_PAR_FENETRE).toBe(2000);
    const { feuille } = await exporter(2500);
    // La coiffe (3) + l'en-tête (1) + les données + la ligne de totaux.
    expect(feuille.rowCount).toBe(PREMIERE_LIGNE_DONNEES + 5000);
    // Le classeur RELU n'a plus de clés de colonne · elles ne se rangent pas
    // dans le fichier, ce sont des noms d'écriture. On lit donc par rang :
    // libellé écriture = 5, débit = 9 (I), crédit = 10.
    expect(feuille.getRow(PREMIERE_LIGNE_DONNEES + 5000).getCell(5).value).toBe('TOTAUX DE LA PÉRIODE');
  });

  it('les DEUX totaux sont le même · la formule et la valeur jointe', async () => {
    // C'est ici que l'amputation devenait un mensonge : la valeur jointe
    // venait d'un agrégat sur la période entière, la formule ne couvrait que
    // les lignes écrites. Le classeur disait deux chiffres selon son lecteur.
    const { feuille } = await exporter(2500);
    const ligneTotal = feuille.getRow(PREMIERE_LIGNE_DONNEES + 5000);
    const debit = ligneTotal.getCell(9).value as ExcelJS.CellFormulaValue;
    expect(debit.result).toBe(2500 * 100);
    expect(debit.formula).toBe(`I${PREMIERE_LIGNE_DONNEES}:I${PREMIERE_LIGNE_DONNEES + 4999}`.replace(/^/, 'SUM(') + ')');
  });

  it('lit PAR LOTS · la mémoire ne dépend plus de la taille du dossier', async () => {
    // Un seul appel pour tout charger, c'est le classeur en mémoire qui
    // revient par la porte de la lecture.
    const { findMany } = await exporter(2500);
    expect(findMany.mock.calls.length).toBeGreaterThan(1);
    for (const [args] of findMany.mock.calls) {
      expect((args as { take: number }).take).toBeLessThanOrEqual(500);
    }
  });

  it('avance le curseur sur la DERNIÈRE écriture rendue, et saute la ligne du curseur', async () => {
    // Sans `skip: 1`, Prisma rend de nouveau la ligne du curseur à chaque lot
    // et l'écriture est exportée DEUX FOIS · un journal qui double des pièces
    // est aussi faux qu'un journal qui en perd.
    const { findMany } = await exporter(1200);
    const suivants = findMany.mock.calls.slice(1).map(([a]) => a as { cursor?: { id: string }; skip?: number });
    expect(suivants.length).toBeGreaterThan(0);
    for (const [rang, appel] of suivants.entries()) {
      expect(appel.skip).toBe(1);
      // LE CURSEUR EST L'IDENTIFIANT DE LA DERNIÈRE ÉCRITURE RENDUE, et le
      // vérifier PRÉSENT ne prouve rien · première rédaction de ce test, qui
      // laissait passer un curseur posé sur n'importe quelle ligne du lot. Un
      // curseur en arrière rejoue une partie du lot précédent (des pièces en
      // double), un curseur en avant en saute. Les deux rendent un journal
      // faux, et le lot suivant a toujours l'air normal.
      const lotPrecedent = (await findMany.mock.results[rang].value) as { id: string }[];
      expect(appel.cursor).toEqual({ id: lotPrecedent[lotPrecedent.length - 1].id });
    }
  });

  it('coiffe et en-tête restent en place · le flux ne les écrit qu’AVANT', async () => {
    // Une feuille en flux ne se relit pas : on ne revient pas insérer trois
    // lignes en tête d'une feuille déjà partie sur le réseau.
    const { feuille } = await exporter(3);
    expect(String(feuille.getRow(1).getCell(1).value)).toContain('JOURNAL · Dossier');
    expect(feuille.getRow(LIGNE_ENTETE).getCell(1).value).toBe('Date');
    expect(feuille.views[0]).toMatchObject({ state: 'frozen', ySplit: LIGNE_ENTETE });
  });

  it('garde les formats de cellule · sans eux une date sort en numéro de série', async () => {
    // `useStyles: true` est ce qui coûte le plus de temps au flux, et c'est
    // pourtant non négociable · un export comptable illisible n'est pas un
    // export.
    expect(OPTIONS_CLASSEUR_EN_FLUX.useStyles).toBe(true);
    // `useSharedStrings` doit rester FAUX · mesuré à 1 195 Mo contre 450 Mo
    // pour un demi-million de lignes, il défait tout le bénéfice du flux.
    expect(OPTIONS_CLASSEUR_EN_FLUX.useSharedStrings).toBe(false);
    // Le format se lit sur la CELLULE du classeur relu · c'est ce que verra
    // Excel. Le poser sur la colonne après coup n'aurait rien changé aux
    // lignes déjà commises, et ce test-là l'a prouvé avant de le corriger.
    //
    // LA VALEUR EXACTE EST EXIGÉE, JAMAIS `toBeTruthy()`. Première rédaction de
    // ce test, et elle ne prouvait RIEN : retirer le `numFmt` de la colonne
    // Date la laissait passer, parce qu'ExcelJS donne d'office un format de
    // date intégré à toute cellule dont la valeur est une `Date`. Ce format
    // par défaut est AMÉRICAIN · une date du 3 avril sortirait « 4/3 », qui se
    // lit comme le 4 mars sur un état comptable congolais. Le défaut même que
    // le test annonce combattre lui échappait, et il a fallu réinjecter la
    // panne pour s'en apercevoir.
    //
    // Les littéraux sont RÉÉCRITS ici plutôt qu'importés : importer la
    // constante rendrait le test d'accord avec n'importe quelle valeur, y
    // compris fausse.
    const { feuille } = await exporter(3);
    const premiere = feuille.getRow(PREMIERE_LIGNE_DONNEES);
    // Rangs de colonne du journal · 1 Date, 9 Débit, 10 Crédit, 15 Saisie le.
    expect(premiere.getCell(1).numFmt).toBe('DD/MM/YYYY');
    expect(premiere.getCell(9).numFmt).toBe('#,##0.00');
    expect(premiere.getCell(10).numFmt).toBe('#,##0.00');
    expect(premiere.getCell(15).numFmt).toBe('DD/MM/YYYY HH:mm');
  });

  it('le périmètre du journal est celui de la fenêtre · une seule écriture du filtre', () => {
    // Deux filtres écrits séparément auraient donné deux journaux plausibles
    // et différents pour les mêmes critères.
    const filtres = { exerciceId: 'ex', journalId: 'j', dateDebut: '2026-01-01', recherche: 'vente' };
    expect(perimetreJournal('t1', filtres)).toEqual({
      tenantId: 't1',
      exerciceId: 'ex',
      journalId: 'j',
      date: { gte: new Date('2026-01-01') },
      libelle: { contains: 'vente', mode: 'insensitive' },
    });
  });
});
