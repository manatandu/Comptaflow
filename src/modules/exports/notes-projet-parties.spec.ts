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

function exportService(): ExportService {
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
    exercice: {
      findFirstOrThrow: jest.fn().mockResolvedValue(EXERCICE),
      findFirst: jest.fn().mockResolvedValue(EXERCICE),
    },
  } as unknown as PrismaService;
  const notes = {
    notesProjet: jest.fn().mockResolvedValue({
      // Aucune feuille de note · seule la fiche récapitulative est lue ici.
      notes: [],
      ficheRecapitulative: FICHE,
      couverture: { transcrites: FICHE.length, attendues: 26 },
    }),
  } as unknown as NoteAnnexeService;
  return new ExportService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
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
