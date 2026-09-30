import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { NOTES_PROJETS } from '../notes-annexes/correspondance-notes-projets';
import { ExportService } from './export.service';

/**
 * LES NOTES DU JEU PROJETS, EXPORTÉES SEULES, PORTENT LES PARTIES OFFICIELLES
 * (audit final F224).
 *
 * La liasse du jeu projets rangeait sa fiche récapitulative sous les quatre
 * parties du texte ; l'export des notes seules, lui, les rangeait toutes sous
 * une bande unique « NOTES ANNEXES ». Le même document sortait donc sous deux
 * présentations selon la porte. Le spec relit le classeur PRODUIT, pas
 * l'appel · un appel juste qui n'atteindrait pas la feuille ne prouverait rien.
 */

const TENANT = {
  id: 't1',
  nom: 'PROJET EAU POTABLE',
  numeroImpot: 'A1234567B',
  adresse: '12 av. de la Justice',
  ville: 'Kinshasa',
  pays: 'RD Congo',
};
const EXERCICE = {
  id: 'e1',
  tenantId: 't1',
  dateDebut: new Date('2026-01-01T00:00:00Z'),
  dateFin: new Date('2026-12-31T00:00:00Z'),
  dateArreteComptes: null,
};

/** Une ligne de fiche par NOTE officielle du jeu, comme le service la rend. */
const FICHE = [...new Map(NOTES_PROJETS.map((n) => [n.code, n.titre])).entries()].map(([code, titre]) => ({
  code,
  titre,
  applicable: false,
  rubriquesEnAttente: [],
}));

function exportService(notesCalculees: unknown[] = []): ExportService {
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
    exercice: {
      findFirstOrThrow: jest.fn().mockResolvedValue(EXERCICE),
      findFirst: jest.fn().mockResolvedValue(EXERCICE),
    },
  } as unknown as PrismaService;
  const notes = {
    notesProjet: jest.fn().mockResolvedValue({
      // Par défaut aucune feuille de note · seule la fiche est lue.
      notes: notesCalculees,
      ficheRecapitulative: FICHE,
      couverture: { transcrites: FICHE.length, attendues: 26 },
    }),
  } as unknown as NoteAnnexeService;
  // La note 9 se lit au service des états du projet (passe R6, D13) · aucun
  // bailleur ici.
  const vide = { decaisse: 0, consomme: 0, soldeRestant: 0 };
  const projet = {
    noteBailleur: jest.fn().mockResolvedValue({
      investissement: [],
      investissementNonAffecte: vide,
      totalInvestissement: vide,
      administration: [],
      administrationNonAffecte: vide,
      totalAdministration: vide,
      totalFondsDuBailleur: vide,
    }),
  };
  return new ExportService(
    prisma,
    {} as never,
    {} as never,
    projet as never,
    {} as never,
    {} as never,
    notes,
    {} as never,
    {} as never,
    {} as never,
  );
}

/** La colonne A de la fiche, sous la ligne d'en-têtes, jusqu'au premier vide. */
async function colonneAFiche(buffer: Buffer): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const fiche = wb.getWorksheet('NOTES ANNEXES');
  if (!fiche) throw new Error('Feuille « NOTES ANNEXES » absente du classeur.');
  const valeurs: string[] = [];
  for (let r = 9; r <= fiche.rowCount; r++) {
    const v = fiche.getCell(r, 1).value;
    if (v === null || v === undefined || v === '') break;
    valeurs.push(String(v));
  }
  return valeurs;
}

describe('notes du jeu projets exportées seules (audit final F224)', () => {
  it('la fiche récapitulative suit les quatre parties officielles, dans leur ordre', async () => {
    const { buffer } = await exportService().notesProjetExcel('t1', 'e1');
    const parties = ExportService['PARTIES_NOTES_PROJETS'];
    const attendu = parties.flatMap(([titre, codes]) => [titre, ...codes.map((c) => `NOTE ${c}`)]);
    expect(await colonneAFiche(buffer)).toEqual(attendu);
  });

  it('aucune note du jeu ne sort de la fiche · les parties les rangent toutes', async () => {
    // `feuilleFicheRecapitulative` ne garde, partie par partie, que les codes
    // que la partie nomme · une note du jeu qu'aucune partie ne nommerait
    // disparaîtrait de la fiche sans un mot. La comparaison précédente part
    // des parties, elle ne le verrait pas · celle-ci part des notes du jeu.
    const { buffer } = await exportService().notesProjetExcel('t1', 'e1');
    const lues = await colonneAFiche(buffer);
    const notesLues = lues.filter((v) => v.startsWith('NOTE ')).sort();
    expect(notesLues).toEqual(FICHE.map((n) => `NOTE ${n.code}`).sort());
  });

  it('aucune bande générique ne remplace les parties', async () => {
    const { buffer } = await exportService().notesProjetExcel('t1', 'e1');
    const lues = await colonneAFiche(buffer);
    // Les bandes sont les lignes qui ne portent pas une note · ce sont
    // EXACTEMENT les titres des parties, et il y en a quatre.
    const bandes = lues.filter((v) => !v.startsWith('NOTE '));
    expect(bandes).toEqual(ExportService['PARTIES_NOTES_PROJETS'].map(([titre]) => titre));
  });
});

describe('la feuille d’une note à deux tableaux porte le titre de la NOTE (passe R6)', () => {
  it('NOTE 4 : ACTIF CIRCULANT ET DETTES CIRCULANTES HAO, et non le nom de son premier tableau', async () => {
    const tableau = (sousTableau: string) => ({
      code: '4',
      sousTableau,
      titre: sousTableau,
      titreNote: 'ACTIF CIRCULANT ET DETTES CIRCULANTES HAO',
      colonnes: [{ type: 'EXERCICE_N', libelle: 'Année N' }],
      lignes: [],
      horsBalance: false,
      exerciceN1Disponible: false,
      applicable: false,
      rubriquesEnAttente: [],
    });
    const { buffer } = await exportService([tableau('ACTIF CIRCULANT HAO'), tableau('DETTES CIRCULANTES HAO')]).notesProjetExcel(
      't1',
      'e1',
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('NOTE 4')!;
    const textes: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => textes.push(String(c.value))));
    expect(textes).toContain('NOTE 4 : ACTIF CIRCULANT ET DETTES CIRCULANTES HAO');
    expect(textes).not.toContain('NOTE 4 : ACTIF CIRCULANT HAO');
  });
});

describe('la colonne « Note » imprime le renvoi de la ligne (passe R6)', () => {
  it('le renvoi est dans la cellule de la colonne, pas en commentaire de la dernière', async () => {
    const note1 = {
      code: '1',
      sousTableau: 'DETTES GARANTIES PAR DES SURETES REELLES',
      titre: 'DETTES GARANTIES PAR DES SURETES REELLES',
      colonnes: [
        { type: 'LIBRE', libelle: 'Note', porteLeRenvoi: true },
        { type: 'EXERCICE_N', libelle: 'Montant brut (1)' },
        { type: 'LIBRE', libelle: 'SURETES REELLES (2) : Gages/Autres', saisieSurLigneChiffree: true },
      ],
      lignes: [{ libelle: 'Emprunts obligataires', montantN: 1000, comptes: [], renvoi: '18A' }],
      horsBalance: false,
      exerciceN1Disponible: false,
      applicable: true,
      rubriquesEnAttente: [],
    };
    const { buffer } = await exportService([note1]).notesProjetExcel('t1', 'e1');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('NOTE 1')!;
    let ligne = 0;
    ws.eachRow((row, r) => {
      if (row.getCell(1).value === 'Emprunts obligataires') ligne = r;
    });
    expect(ligne).toBeGreaterThan(0);
    expect(ws.getCell(ligne, 2).value).toBe('18A');
    expect(ws.getCell(ligne, 4).note).toBeUndefined();
  });
});

describe('le classeur des notes porte le tableau de la note 9 (passe R6, D13)', () => {
  it('la feuille NOTE 9 porte les trois lignes de total de la maquette, pas un renvoi', async () => {
    const note9 = {
      code: '9',
      titre: 'FONDS DU BAILLEUR',
      titreNote: 'FONDS DU BAILLEUR',
      colonnes: [{ type: 'LIBRE', libelle: 'Fonds du bailleur' }],
      lignes: [],
      horsBalance: true,
      exerciceN1Disponible: false,
      applicable: true,
      rubriquesEnAttente: [],
    };
    const { buffer } = await exportService([note9]).notesProjetExcel('t1', 'e1');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('NOTE 9')!;
    const colonneA: string[] = [];
    ws.eachRow((row) => typeof row.getCell(1).value === 'string' && colonneA.push(row.getCell(1).value as string));
    expect(colonneA).toEqual(
      expect.arrayContaining(["TOTAL FONDS D'INVESTISSEMENT", "TOTAL FONDS D'ADMINISTRATION", 'TOTAL DES FONDS DU BAILLEUR']),
    );
  });
});
