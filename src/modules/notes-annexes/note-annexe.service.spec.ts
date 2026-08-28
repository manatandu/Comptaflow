import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { NoteAnnexeService } from './note-annexe.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { PrismaService } from '../../common/prisma.service';

function ligne(numero: string, classe: ClasseCompte, d: number, c: number) {
  return {
    compteId: `id-${numero}`, numero, intitule: `Compte ${numero}`, classe,
    typeCompte: TypeCompteDetailTotal.DETAIL, totalDebit: d, totalCredit: c, solde: d - c,
  };
}
/** Rattachements du dossier tels que la base les renverrait. */
type Rattachement = { codeNote: string; cleRubrique: string; compte: { numero: string } };

function prismaAvec(rattachements: Rattachement[] = [], comptes: any[] = []) {
  return {
    rattachementNote: {
      findMany: jest.fn().mockResolvedValue(rattachements),
      upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve({ id: 'r1', ...create })),
      deleteMany: jest.fn().mockResolvedValue({ count: rattachements.length }),
    },
    compte: { findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(comptes.find((c) => c.id === where.id) ?? null)) },
  } as unknown as PrismaService;
}

function service(
  lignesParExercice: Record<string, ReturnType<typeof ligne>[]>,
  exercices: Array<{ id: string; dateDebut: Date }> = [],
  prisma: PrismaService = prismaAvec(),
) {
  const ecriture = {
    balance: jest.fn().mockImplementation((_t: string, e: string) =>
      Promise.resolve({ lignes: lignesParExercice[e] ?? [], totaux: { debit: 0, credit: 0 } })),
  } as unknown as EcritureService;
  const exercice = {
    lister: jest.fn().mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;
  return new NoteAnnexeService(ecriture, exercice, prisma);
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

  it('toute rubrique en attente de rattachement porte une clé stable — c’est elle qui ancre le rattachement', () => {
    for (const spec of NOTES_ASSOCIATIONS) {
      for (const r of spec.rubriques) {
        if (r.subdivisionAttendue) {
          expect({ note: spec.code, libelle: r.libelle, cle: r.cle ?? null }).toEqual(
            expect.objectContaining({ cle: expect.any(String) }),
          );
        }
      }
    }
  });

  it('les clés de rubrique sont uniques à l’intérieur d’une note', () => {
    for (const spec of NOTES_ASSOCIATIONS) {
      const cles = spec.rubriques.map((r) => r.cle).filter(Boolean);
      expect(new Set(cles).size).toBe(cles.length);
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

describe('rattachement des comptes du dossier aux rubriques', () => {
  const JEU = 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' as any;

  it('REFUSE un rattachement sur une rubrique que le plan officiel détermine déjà', async () => {
    // Garde-fou central : laisser modifier ces rubriques permettrait de défaire
    // en silence la fidélité au texte officiel.
    //
    // Ces rubriques ne portant pas de clé, le refus passe par le message
    // « pas de rubrique rattachable ». On l'assert MOT POUR MOT : une première
    // version de ce test se contentait de /rubrique/i et passait sur un message
    // qui parlait, à tort, d'une note sans cette rubrique.
    const s = service({ e1: [] }, [], prismaAvec([], [{ id: 'c1', typeCompte: 'DETAIL', numero: '52110000' }]));
    await expect(s.rattacher('t', 'u', JEU, '13', 'banques-locales', 'c1')).rejects.toThrow(
      /pas de rubrique rattachable .* le plan de comptes officiel détermine déjà/s,
    );
  });

  it('le message de refus explique le garde-fou plutôt que de laisser croire à une faute de frappe', async () => {
    const s = service({ e1: [] }, [], prismaAvec([], [{ id: 'c1', typeCompte: 'DETAIL', numero: '52110000' }]));
    await expect(s.rattacher('t', 'u', JEU, '13', 'banques-locales', 'c1')).rejects.toThrow(/ne sont donc|pas modifiables/);
  });

  it('ACCEPTE un rattachement sur une rubrique déclarée en attente', async () => {
    const s = service({ e1: [] }, [], prismaAvec([], [{ id: 'c1', typeCompte: 'DETAIL', numero: '60410000' }]));
    const r = await s.rattacher('t', 'u', JEU, '24', 'matieres-consommables', 'c1');
    expect(r).toMatchObject({ codeNote: '24', cleRubrique: 'matieres-consommables', compteId: 'c1' });
  });

  it('refuse un compte Total : il n’a pas de mouvement propre et laisserait la rubrique vide', async () => {
    const s = service({ e1: [] }, [], prismaAvec([], [{ id: 'c1', typeCompte: 'TOTAL', numero: '604' }]));
    await expect(s.rattacher('t', 'u', JEU, '24', 'matieres-consommables', 'c1')).rejects.toThrow(/Total/);
  });

  it('refuse un compte d’un autre dossier', async () => {
    const s = service({ e1: [] }, [], prismaAvec([], []));
    await expect(s.rattacher('t', 'u', JEU, '24', 'matieres-consommables', 'c-ailleurs')).rejects.toThrow(/introuvable/i);
  });

  it('refuse une note ou une rubrique inexistante', async () => {
    const s = service({ e1: [] }, [], prismaAvec([], [{ id: 'c1', typeCompte: 'DETAIL', numero: '60410000' }]));
    await expect(s.rattacher('t', 'u', JEU, '999', 'x', 'c1')).rejects.toThrow(/Aucune note/i);
    await expect(s.rattacher('t', 'u', JEU, '24', 'rubrique-inexistante', 'c1')).rejects.toThrow(
      /pas de rubrique rattachable/,
    );
  });

  it('une rubrique en attente reste NON chiffrée et signalée tant que rien n’est rattaché', async () => {
    const s = service({ e1: [ligne('60410000', ClasseCompte.CLASSE_6, 5000, 0)] });
    const r = await s.notesAssociations('t', 'e1');
    // Aucune rubrique chiffrée -> la note entière est non applicable (§1.4),
    // mais la fiche récapitulative porte les rubriques en attente.
    expect(note(r, '24').applicable).toBe(false);
    const fiche = r.ficheRecapitulative.find((f) => f.code === '24')!;
    expect(fiche.rubriquesEnAttente.map((x) => x.libelle)).toContain('Matières consommables');
  });

  it('une note NON applicable expose quand même les clés de ses rubriques en attente', async () => {
    // Sans cela, le cas le plus courant serait un cul-de-sac : la note n'a rien
    // à présenter (§1.4), donc aucune ligne, donc aucune clé — et l'utilisateur
    // n'aurait jamais de quoi rattacher ses sous-comptes pour l'alimenter.
    const s = service({ e1: [] });
    const r = await s.notesAssociations('t', 'e1');
    const fiche = r.ficheRecapitulative.find((f) => f.code === '24')!;
    expect(note(r, '24').lignes).toEqual([]);
    expect(fiche.rubriquesEnAttente.length).toBeGreaterThan(0);
    for (const x of fiche.rubriquesEnAttente) {
      expect(typeof x.cle).toBe('string');
      expect(x.cle.length).toBeGreaterThan(0);
      expect(x.attendu.length).toBeGreaterThan(0);
    }
  });

  it('une fois le compte rattaché, la rubrique se chiffre et cesse d’être en attente', async () => {
    const s = service(
      { e1: [ligne('60410000', ClasseCompte.CLASSE_6, 5000, 0)] },
      [],
      prismaAvec([{ codeNote: '24', cleRubrique: 'matieres-consommables', compte: { numero: '60410000' } }]),
    );
    const n24 = note(await s.notesAssociations('t', 'e1'), '24');
    const l = ligneDe(n24, 'Matières consommables');
    expect(n24.applicable).toBe(true);
    expect(l.montantN).toBe(5000);
    expect(l.enAttenteDeRattachement).toBeUndefined();
    expect(l.rattachementDuDossier).toBe(true);
    expect(ligneDe(n24, 'TOTAL AUTRES ACHATS').montantN).toBe(5000);
    // et elle disparaît des rubriques en attente de la fiche récapitulative
    const fiche = (await s.notesAssociations('t', 'e1')).ficheRecapitulative.find((f) => f.code === '24')!;
    expect(fiche.rubriquesEnAttente.map((x) => x.cle)).not.toContain('matieres-consommables');
  });

  it('le rattachement du dossier S’AJOUTE aux préfixes officiels, il ne les remplace pas', async () => {
    // 606 est officiellement rattaché à « Achats autres activités » ; un
    // rattachement ailleurs ne doit pas le faire disparaître de sa rubrique.
    const s = service(
      {
        e1: [
          ligne('60600000', ClasseCompte.CLASSE_6, 700, 0),
          ligne('60410000', ClasseCompte.CLASSE_6, 300, 0),
        ],
      },
      [],
      prismaAvec([{ codeNote: '24', cleRubrique: 'matieres-consommables', compte: { numero: '60410000' } }]),
    );
    const n24 = note(await s.notesAssociations('t', 'e1'), '24');
    expect(ligneDe(n24, 'Achats autres activités').montantN).toBe(700);
    expect(ligneDe(n24, 'Matières consommables').montantN).toBe(300);
  });
});
