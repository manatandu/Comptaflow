import * as ExcelJS from 'exceljs';
import { ExportService } from './export.service';

/**
 * AUDIT FINAL F102 · la Note 9, le registre des donateurs, le livre
 * d'inventaire et le rapport sortaient sans aucune identification · ni
 * l'entité, ni son NIF, ni l'exercice, ni le pied numéroté et daté de
 * l'AUDCIF art. 22, 7°. Ce sont les documents qu'on REMET à un bailleur, un
 * réviseur ou une assemblée. Chaque feuille se nomme maintenant elle-même, et
 * le test relit le classeur produit.
 */

const EXERCICE = { id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const ZERO = { decaisse: 0, consomme: 0, soldeRestant: 0 };

function service() {
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        nom: 'ASBL Espoir',
        numeroImpot: 'A1234567B',
        devise: 'CDF',
        referentiel: 'SYCEBNL',
        formeJuridiqueSyscohada: null,
      }),
    },
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
  };
  const projet = {
    noteBailleur: jest.fn().mockResolvedValue({
      investissement: [],
      administration: [],
      investissementNonAffecte: ZERO,
      administrationNonAffecte: ZERO,
      totalInvestissement: ZERO,
      totalAdministration: ZERO,
      // Le total général que le service calcule · la ligne de total de la
      // Note 9 le porte (passe R6, D13).
      totalFondsDuBailleur: { decaisse: 1100, consomme: 450, soldeRestant: 650 },
    }),
  };
  const donations = {
    lister: jest.fn().mockResolvedValue([]),
    rapportConformite: jest.fn().mockResolvedValue({
      existence: { registreOuvert: true, lignesTotalRegistre: 0, lignesSurExercice: 0, lignesAnnuleesSurExercice: 0 },
      numerotation: { continue: true, exigence: 'Art. 17.', premier: null, dernier: null, trous: [], doublons: [] },
      signature: { lignesNonSignees: [], exigence: 'Art. 17.' },
      completude: { lignesIncompletes: [] },
      rapprochement: {
        rapproche: true,
        ecart: 0,
        lecture: 'Rapproché.',
        comptesLiberalite: [],
        comptesFrontiere: [],
        comptesHorsPerimetre: [],
        totalComptable: 0,
        totalRegistre: 0,
        avertissement: 'Avertissement.',
      },
    }),
  };
  const livre = {
    courante: jest.fn().mockResolvedValue(null),
    conformite: jest.fn().mockResolvedValue({
      exigence: 'Art. 14.',
      etatsExiges: [],
      resume: { renseigne: false, exigence: '', remarque: '' },
      fondement: { article: 'Art. 14, point 1', perimetre: 'Associations.', sanction: 'Acte uniforme SYCEBNL, art. 24' },
    }),
  };
  const rapport = {
    courant: jest.fn().mockResolvedValue(null),
    conformite: jest.fn().mockResolvedValue({
      fenetreEvenementsPosterieurs: null,
      tresorerie: null,
      declarationRegistreDonateurs: { attendue: false, renseignee: false, registreConforme: true },
    }),
  };
  return new ExportService(
    prisma as never,
    {} as never,
    {} as never,
    projet as never,
    {} as never,
    {} as never,
    {} as never,
    donations as never,
    livre as never,
    rapport as never,
  );
}

async function relire(buffer: unknown) {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(buffer as never);
  return classeur;
}

describe('F102 · chaque feuille remise se nomme elle-même', () => {
  it.each([
    ['la Note 9', (s: ExportService) => s.noteBailleurExcel('t1', 'ex'), 1],
    ['le registre des donateurs', (s: ExportService) => s.registreDonateursExcel('t1', 'ex'), 3],
    ['le livre d’inventaire', (s: ExportService) => s.livreInventaireExcel('t1', 'ex'), 1],
    ['le rapport', (s: ExportService) => s.rapportActiviteExcel('t1', 'ex'), 1],
  ])('%s · entité, NIF, exercice en tête, pied numéroté et daté', async (_nom, exporter, nbFeuilles) => {
    const classeur = await relire((await exporter(service())).buffer);
    expect(classeur.worksheets).toHaveLength(nbFeuilles);
    for (const feuille of classeur.worksheets) {
      expect(String(feuille.getCell('A1').value)).toContain('· ASBL Espoir');
      const identite = String(feuille.getCell('A2').value);
      expect(identite).toContain('NIF A1234567B');
      expect(identite).toContain('Exercice du 01/01/2026 au 31/12/2026');
      expect(feuille.headerFooter.oddFooter).toContain('Page &P / &N');
      // Les en-têtes des colonnes descendent sous la coiffe.
      expect(feuille.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
    }
  });

  it('une fusion posée après la coiffe reste sur sa ligne', async () => {
    // `spliceRows` ne décale pas les fusions · une coiffe posée APRÈS le pied
    // du livre aurait laissé sa fusion trois lignes plus haut que son texte.
    const [garde] = (await relire((await service().livreInventaireExcel('t1', 'ex')).buffer)).worksheets;
    let ligneDuPied = 0;
    garde.eachRow((r, n) => {
      if (String(r.getCell(1).value ?? '').startsWith('Aucune transcription')) ligneDuPied = n;
    });
    expect(ligneDuPied).toBeGreaterThan(4);
    expect(garde.model.merges).toContain(`A${ligneDuPied}:C${ligneDuPied}`);
  });
});

describe('Note 9 · la ligne de total porte le total des fonds du bailleur (passe R6, D13)', () => {
  it('les trois dernières colonnes de TOTAL DES FONDS DU BAILLEUR sont totalFondsDuBailleur', async () => {
    const [feuille] = (await relire((await service().noteBailleurExcel('t1', 'ex')).buffer)).worksheets;
    let rang = 0;
    feuille.eachRow((r, n) => {
      if (r.getCell(1).value === 'TOTAL DES FONDS DU BAILLEUR') rang = n;
    });
    expect(rang).toBeGreaterThan(0);
    expect([8, 9, 10].map((c) => feuille.getCell(rang, c).value)).toEqual([1100, 450, 650]);
  });
});
