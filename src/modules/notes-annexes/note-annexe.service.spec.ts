import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { NoteAnnexeService } from './note-annexe.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';

function ligne(numero: string, classe: ClasseCompte, d: number, c: number) {
  return {
    compteId: `id-${numero}`, numero, intitule: `Compte ${numero}`, classe,
    typeCompte: TypeCompteDetailTotal.DETAIL, totalDebit: d, totalCredit: c, solde: d - c,
  };
}
function service(
  lignesParExercice: Record<string, ReturnType<typeof ligne>[]>,
  exercices: Array<{ id: string; dateDebut: Date }> = [],
) {
  const ecriture = {
    balance: jest.fn().mockImplementation((_t: string, e: string) =>
      Promise.resolve({ lignes: lignesParExercice[e] ?? [], totaux: { debit: 0, credit: 0 } })),
  } as unknown as EcritureService;
  const exercice = {
    lister: jest.fn().mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;
  return new NoteAnnexeService(ecriture, exercice);
}
const note = (r: { notes: any[] }, code: string) => r.notes.find((n) => n.code === code)!;
const ligneDe = (n: any, libelle: string) => n.lignes.find((l: any) => l.libelle === libelle);

describe('correspondance des notes (intégrité des spécifications)', () => {
  it('aucun code de note en double', () => {
    const codes = NOTES_ASSOCIATIONS.map((n) => n.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('un total ne référence jamais une rubrique qui vient APRÈS lui — sinon le calcul en une passe lirait 0', () => {
    for (const spec of NOTES_ASSOCIATIONS) {
      spec.rubriques.forEach((r, i) => {
        for (const idx of r.totalDeRubriques ?? []) {
          expect(idx).toBeLessThan(i);
        }
      });
    }
  });

  it('une rubrique porte soit des comptes, soit un total, soit une subdivision attendue — jamais rien', () => {
    for (const spec of NOTES_ASSOCIATIONS) {
      for (const r of spec.rubriques) {
        const definie = (r.comptes?.length ?? 0) > 0 || r.totalDeRubriques !== undefined || r.subdivisionAttendue !== undefined;
        expect({ note: spec.code, rubrique: r.libelle, definie }).toEqual({ note: spec.code, rubrique: r.libelle, definie: true });
      }
    }
  });

  it('chaque note déclare ses colonnes et un titre non vide', () => {
    for (const spec of NOTES_ASSOCIATIONS) {
      expect(spec.colonnes.length).toBeGreaterThan(0);
      expect(spec.titre.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('NoteAnnexeService', () => {
  it('calcule une note simple, ses totaux, et déduit la dépréciation', async () => {
    const s = service({ e1: [
      ligne('52110000', ClasseCompte.CLASSE_5, 8000, 0),   // Banques locales
      ligne('57100000', ClasseCompte.CLASSE_5, 1200, 0),   // Caisse
      ligne('59200000', ClasseCompte.CLASSE_5, 0, 300),    // Dépréciation banques
    ]});
    const n13 = note(await s.notesAssociations('t', 'e1'), '13');
    expect(ligneDe(n13, 'Banques locales').montantN).toBe(8000);
    expect(ligneDe(n13, 'Caisse').montantN).toBe(1200);
    expect(ligneDe(n13, 'TOTAL BRUT').montantN).toBe(9200);
    expect(ligneDe(n13, 'Dépréciations').montantN).toBe(-300);
    expect(ligneDe(n13, 'TOTAL NET DE DEPRECIATIONS').montantN).toBe(8900);
  });

  it('§1.4 : les lignes non chiffrées ne sont pas présentées', async () => {
    const s = service({ e1: [ligne('52110000', ClasseCompte.CLASSE_5, 8000, 0)] });
    const n13 = note(await s.notesAssociations('t', 'e1'), '13');
    expect(ligneDe(n13, 'Banques locales')).toBeDefined();
    expect(ligneDe(n13, 'Caisse')).toBeUndefined();          // à zéro -> retirée
    expect(ligneDe(n13, 'TOTAL BRUT')).toBeDefined();        // les totaux restent
  });

  it('§1.4 : une note dont aucune rubrique n’est chiffrée est déclarée NON APPLICABLE et ne présente rien', async () => {
    const s = service({ e1: [ligne('52110000', ClasseCompte.CLASSE_5, 8000, 0)] });
    const r = await s.notesAssociations('t', 'e1');
    const n11 = note(r, '11'); // titres de placement : aucun mouvement
    expect(n11.applicable).toBe(false);
    expect(n11.lignes).toEqual([]);
    expect(r.ficheRecapitulative.find((f) => f.code === '11')!.applicable).toBe(false);
  });

  it('la fiche récapitulative couvre toutes les notes transcrites', async () => {
    const s = service({ e1: [] });
    const r = await s.notesAssociations('t', 'e1');
    expect(r.ficheRecapitulative).toHaveLength(NOTES_ASSOCIATIONS.length);
    expect(r.couverture).toEqual({ transcrites: NOTES_ASSOCIATIONS.length, attendues: 45 });
  });

  it('comparatif N-1 : montants, variation en valeur et en pourcentage', async () => {
    const s = service(
      {
        e1: [ligne('52110000', ClasseCompte.CLASSE_5, 1250, 0)],
        e0: [ligne('52110000', ClasseCompte.CLASSE_5, 1000, 0)],
      },
      [{ id: 'e1', dateDebut: new Date('2026-01-01') }, { id: 'e0', dateDebut: new Date('2025-01-01') }],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '13'), 'Banques locales');
    expect(l.montantN).toBe(1250);
    expect(l.montantN1).toBe(1000);
    expect(l.variationValeur).toBe(250);
    expect(l.variationPourcent).toBeCloseTo(25, 6);
  });

  it('sans exercice antérieur, N-1 et les variations restent undefined — jamais un faux zéro', async () => {
    const s = service({ e1: [ligne('52110000', ClasseCompte.CLASSE_5, 1250, 0)] });
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '13'), 'Banques locales');
    expect(l.montantN1).toBeUndefined();
    expect(l.variationValeur).toBeUndefined();
    expect(l.variationPourcent).toBeUndefined();
  });

  it('une variation en % sur base N-1 nulle reste vide plutôt qu’infinie', async () => {
    const s = service(
      { e1: [ligne('52110000', ClasseCompte.CLASSE_5, 500, 0)], e0: [] },
      [{ id: 'e1', dateDebut: new Date('2026-01-01') }, { id: 'e0', dateDebut: new Date('2025-01-01') }],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '13'), 'Banques locales');
    expect(l.montantN1).toBe(0);
    expect(l.variationValeur).toBe(500);
    expect(l.variationPourcent).toBeUndefined();
  });

  it('distingue les tiers polyvalents par le sens du solde (note 9 : créances vs clients créditeurs)', async () => {
    const s = service({ e1: [
      ligne('41100000', ClasseCompte.CLASSE_4, 3000, 0),  // adhérents débiteurs
      ligne('41910000', ClasseCompte.CLASSE_4, 0, 700),   // avances reçues (créditeur)
    ]});
    const n9 = note(await s.notesAssociations('t', 'e1'), '9');
    expect(ligneDe(n9, 'Adhérents').montantN).toBe(3000);
    expect(ligneDe(n9, 'TOTAL BRUT ADHERENTS, CLIENTS-USAGERS').montantN).toBe(3000);
    expect(ligneDe(n9, 'Adhérents, avances reçues').montantN).toBe(700);
  });

  it('porte les renvois croisés de l’article 15 (poste d’état -> note)', async () => {
    const s = service({ e1: [] });
    const r = await s.notesAssociations('t', 'e1');
    expect(note(r, '13').renvoyeeDepuis).toEqual(['BW']);
    expect(note(r, '9').renvoyeeDepuis).toEqual(['BD', 'DG']);
  });
});
