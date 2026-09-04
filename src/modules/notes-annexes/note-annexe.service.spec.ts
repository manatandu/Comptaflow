import { ClasseCompte, JeuNotesAnnexes, Referentiel, TypeCompteDetailTotal } from '@prisma/client';
import { NoteAnnexeService } from './note-annexe.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';

/**
 * Trois états à zéro · le strict nécessaire pour que la note 33 se calcule
 * sans rien affirmer. `etatsAvec` sert aux tests qui la regardent vraiment.
 */
function etatsVides(): EtatsFinanciersService {
  return etatsAvec({});
}

function etatsAvec(postes: Record<string, { montant: number; montantN1?: number }>): EtatsFinanciersService {
  const poste = (ref: string) => ({ ref, montant: postes[ref]?.montant ?? 0, montantN1: postes[ref]?.montantN1 ?? 0 });
  const refsBilan = ['AZ', 'BA', 'BC', 'BD', 'BE', 'BT', 'BX'];
  const refsPassif = ['CZ', 'DD', 'DF', 'DV', 'DX'];
  return {
    bilan: jest.fn().mockResolvedValue({
      actif: refsBilan.map(poste),
      passif: refsPassif.map(poste),
    }),
    compteDeResultat: jest.fn().mockResolvedValue({
      produits: ['RA', 'RH'].map(poste),
      charges: ['TL'].map(poste),
      totalCharges: postes.XB?.montant ?? 0,
      totalChargesN1: postes.XB?.montantN1 ?? 0,
      resultatActivitesOrdinaires: postes.XC?.montant ?? 0,
      resultatActivitesOrdinairesN1: postes.XC?.montantN1 ?? 0,
      resultatHao: postes.XD?.montant ?? 0,
      resultatHaoN1: postes.XD?.montantN1 ?? 0,
      resultatNet: postes.XE?.montant ?? 0,
      resultatNetN1: postes.XE?.montantN1 ?? 0,
    }),
    tableauFluxTresorerie: jest.fn().mockResolvedValue({
      // Le vrai tableau intercale des lignes de SECTION sans code REF · les
      // reproduire ici, c'est vérifier que le lecteur les ignore.
      lignes: [{ section: 'Flux opérationnels' }, ...['ZB', 'ZC', 'ZD', 'ZE', 'ZF'].map(poste)],
    }),
  } as unknown as EtatsFinanciersService;
}
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { NOTES_PROJETS } from './correspondance-notes-projets';
import { PrismaService } from '../../common/prisma.service';
import { NOTES_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-notes-syscohada';

/**
 * Une ligne de balance. `report` porte le report à-nouveau (débit, crédit) ·
 * ce que `EcritureService.balance` isole depuis les écritures générées par la
 * clôture ; `d`/`c` sont alors les mouvements PROPRES de l'exercice, et les
 * totaux la somme des deux, exactement comme le fait le service.
 */
function ligne(
  numero: string, classe: ClasseCompte, d: number, c: number,
  report: [number, number] = [0, 0],
) {
  const [rd, rc] = report;
  return {
    compteId: `id-${numero}`, numero, intitule: `Compte ${numero}`, classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    totalDebit: d + rd, totalCredit: c + rc,
    reportDebit: rd, reportCredit: rc,
    mouvementDebit: d, mouvementCredit: c,
    solde: d + rd - c - rc,
  };
}
/** Rattachements du dossier tels que la base les renverrait. */
type Rattachement = { codeNote: string; cleRubrique: string; compte: { numero: string } };

/** Une ligne d'écriture telle que la ventilation par échéance la lit. */
type LigneEch = { numero: string; debit: number; credit: number; dateEcheance: Date | null; lettre?: string | null };

/** Une écriture telle que la ventilation par nature la lit : n lignes, deux sens. */
type EcritureFixture = { lignes: Array<{ compte: { numero: string }; debit: number; credit: number }> };
const ecr = (...lignes: Array<[string, number, number]>): EcritureFixture => ({
  lignes: lignes.map(([numero, debit, credit]) => ({ compte: { numero }, debit, credit })),
});

function prismaAvec(
  rattachements: Rattachement[] = [],
  comptes: any[] = [],
  lignesEch: LigneEch[] = [],
  ecritures: EcritureFixture[] = [],
  // Référentiel du dossier · le rattachement le lit pour refuser un jeu de
  // notes étranger au référentiel (NoteAnnexeService.verifierJeuDuDossier).
  referentiel: Referentiel = Referentiel.SYCEBNL,
  // Cellules déjà saisies dans les rubriques renseignées hors comptabilité.
  saisies: Array<{ codeNote: string; cleRubrique: string; colonne: number; valeurTexte?: string | null; valeurNombre?: unknown }> = [],
) {
  return {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel }) },
    saisieNote: {
      findMany: jest.fn().mockResolvedValue(
        saisies.map((s) => ({ valeurTexte: null, valeurNombre: null, ...s })),
      ),
      upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve({ id: 's1', ...create })),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    rattachementNote: {
      findMany: jest.fn().mockResolvedValue(rattachements),
      upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve({ id: 'r1', ...create })),
      deleteMany: jest.fn().mockResolvedValue({ count: rattachements.length }),
    },
    compte: { findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(comptes.find((c) => c.id === where.id) ?? null)) },
    // Exercice clos au 31/12/2026 : les bornes d'échéance en découlent.
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'e1', dateFin: new Date('2026-12-31T00:00:00Z') }) },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          lignesEch
            // le service ne demande que les lignes NON lettrées
            .filter((l) => (where?.lettre === null ? !l.lettre : true))
            .map((l) => ({ debit: l.debit, credit: l.credit, dateEcheance: l.dateEcheance, compte: { numero: l.numero } })),
        ),
      ),
    },
  } as unknown as PrismaService;
}

function service(
  lignesParExercice: Record<string, ReturnType<typeof ligne>[]>,
  exercices: Array<{ id: string; dateDebut: Date }> = [],
  prisma: PrismaService = prismaAvec(),
  // Tableau d'exécution budgétaire des notes 35 et 24. Par DÉFAUT il lève,
  // comme le vrai service sur un dossier sans plan analytique à budgets · la
  // note reste alors en saisie, et c'est le cas de tous les tests qui ne
  // s'intéressent pas au budget.
  budget: { executionBudgetaire: jest.Mock } = {
    executionBudgetaire: jest.fn().mockRejectedValue(new Error('aucun plan à budgets')),
  },
  // Bilan, compte de résultat et tableau de flux · la note 33 les résume.
  // Par DÉFAUT ils sont vides : la fiche de synthèse sort alors à zéro, sans
  // rien changer pour les tests qui ne s'y intéressent pas.
  etats: EtatsFinanciersService = etatsVides(),
) {
  const ecriture = {
    balance: jest.fn().mockImplementation((_t: string, e: string) =>
      Promise.resolve({ lignes: lignesParExercice[e] ?? [], totaux: { debit: 0, credit: 0 } })),
  } as unknown as EcritureService;
  const exercice = {
    lister: jest.fn().mockResolvedValue([...exercices].sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime())),
  } as unknown as ExerciceService;
  return new NoteAnnexeService(ecriture, exercice, prisma, budget as unknown as EtatsFinanciersProjetBudgetService, etats);
}
const note = (r: { notes: any[] }, code: string, sousTableau?: string) =>
  r.notes.find((n) => n.code === code && (sousTableau === undefined || n.sousTableau === sousTableau))!;
const ligneDe = (n: any, libelle: string) => n.lignes.find((l: any) => l.libelle === libelle);

describe.each([
  { label: 'associations', specs: NOTES_ASSOCIATIONS, officielles: ['1', '2', '3', '4', '5A', '5B', '5C', '5D', '5E', '5F', '5G', '5H', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17A', '17B', '18A', '18B', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29A', '29B', '30', '31', '32', '33', '34', '35'] },
  { label: 'projets de développement', specs: NOTES_PROJETS, officielles: ['1', '2', '3A', '3B', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20A', '20B', '21', '22', '23', '24'] },
])('correspondance des notes (intégrité des spécifications) · jeu $label', ({ specs, officielles }) => {
  it('aucun tableau en double · un code seul, ou un code et son sous-tableau', () => {
    const cles = specs.map((n) => `${n.code}::${n.sousTableau ?? ''}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('une note à plusieurs tableaux les nomme TOUS · sinon deux tableaux se confondent', () => {
    const parCode = new Map<string, number>();
    for (const n of specs) parCode.set(n.code, (parCode.get(n.code) ?? 0) + 1);
    for (const n of specs) {
      const multiple = (parCode.get(n.code) ?? 0) > 1;
      expect({ code: n.code, nomme: !multiple || !!n.sousTableau }).toEqual({ code: n.code, nomme: true });
    }
  });

  it('un total ne référence jamais une rubrique qui vient APRÈS lui · sinon le calcul en une passe lirait 0', () => {
    for (const spec of specs) {
      spec.rubriques.forEach((r, i) => {
        for (const idx of [...(r.totalDeRubriques ?? []), ...(r.moinsRubriques ?? [])]) {
          expect({ note: spec.code, rubrique: r.libelle, avant: idx < i }).toEqual(
            { note: spec.code, rubrique: r.libelle, avant: true },
          );
        }
      });
    }
  });

  it('une rubrique retranchée n’apparaît que dans une ligne de total', () => {
    for (const spec of specs) {
      for (const r of spec.rubriques) {
        if (r.moinsRubriques) expect({ note: spec.code, r: r.libelle, ok: !!r.totalDeRubriques }).toEqual(
          { note: spec.code, r: r.libelle, ok: true },
        );
      }
    }
  });

  it('sens et natureCreditrice ne se cumulent jamais : l’un filtre, l’autre non', () => {
    for (const spec of specs) {
      for (const r of spec.rubriques) {
        expect({ note: spec.code, r: r.libelle, cumul: !!(r.sens && r.natureCreditrice) }).toEqual(
          { note: spec.code, r: r.libelle, cumul: false },
        );
      }
    }
  });

  it('toute colonne déclarée est effectivement calculée par le moteur', () => {
    // Garde contre le défaut relevé sur la note 9 avant la ventilation par
    // échéance : trois colonnes officielles déclarées, rendues vides, et rien
    // pour le signaler. Une colonne LIBRE est une saisie assumée, pas un oubli.
    const CALCULEES = [
      'EXERCICE_N', 'EXERCICE_N1', 'VARIATION_VALEUR', 'VARIATION_POURCENT', 'VARIATION_VALEUR_ABSOLUE',
      'OUVERTURE', 'AUGMENTATIONS', 'DIMINUTIONS', 'CLOTURE',
      'AUGMENTATION_EXPLOITATION', 'AUGMENTATION_FINANCIERE', 'AUGMENTATION_HAO',
      'DIMINUTION_EXPLOITATION', 'DIMINUTION_FINANCIERE', 'DIMINUTION_HAO',
      'ECHEANCE_1AN', 'ECHEANCE_2ANS', 'ECHEANCE_PLUS_2ANS', 'LIBRE',
    ];
    for (const spec of specs) {
      for (const c of spec.colonnes) {
        expect({ note: spec.code, colonne: c.libelle, connue: CALCULEES.includes(c.type) }).toEqual(
          { note: spec.code, colonne: c.libelle, connue: true },
        );
      }
    }
  });

  it('une rubrique porte soit des comptes, soit un total, soit une subdivision attendue, soit une saisie · jamais rien', () => {
    for (const spec of specs) {
      for (const r of spec.rubriques) {
        const definie =
          (r.comptes?.length ?? 0) > 0 ||
          r.totalDeRubriques !== undefined ||
          r.subdivisionAttendue !== undefined ||
          r.saisie === true;
        expect({ note: spec.code, rubrique: r.libelle, definie }).toEqual({ note: spec.code, rubrique: r.libelle, definie: true });
      }
    }
  });

  it('toute rubrique en attente de rattachement porte une clé stable · c’est elle qui ancre le rattachement', () => {
    for (const spec of specs) {
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
    for (const spec of specs) {
      const cles = spec.rubriques.map((r) => r.cle).filter(Boolean);
      expect(new Set(cles).size).toBe(cles.length);
    }
  });

  it('toutes les notes officielles du jeu sont transcrites, ni une de plus ni une de moins', () => {
    // Liste arrêtée sur la FICHE RECAPITULATIVE DES NOTES ANNEXES PRESENTEES
    // propre à ce jeu · c'est elle qui fait foi sur le nombre et le code des
    // notes, pas la numérotation apparente, qui saute d'un jeu à l'autre.
    const transcrites = [...new Set(specs.map((n) => n.code))];
    expect([...transcrites].sort()).toEqual([...officielles].sort());
  });

  it('une rubrique en SAISIE n’est jamais confondue avec une rubrique en attente de rattachement', () => {
    // La distinction porte l'information : « à renseigner » (rien à
    // rattacher, la donnée n'est pas comptable) contre « en attente de
    // rattachement » (le plan manque de finesse, le dossier doit subdiviser).
    // Les confondre ferait réclamer un sous-compte pour un effectif.
    for (const spec of specs) {
      for (const r of spec.rubriques) {
        expect({ note: spec.code, r: r.libelle, cumul: !!(r.saisie && r.subdivisionAttendue) }).toEqual(
          { note: spec.code, r: r.libelle, cumul: false },
        );
        // Une rubrique en saisie ne porte pas de comptes : elle serait alors
        // calculée, et la mention « à renseigner » serait fausse.
        expect({ note: spec.code, r: r.libelle, comptes: !!(r.saisie && r.comptes?.length) }).toEqual(
          { note: spec.code, r: r.libelle, comptes: false },
        );
      }
    }
  });

  it('chaque note déclare ses colonnes et un titre non vide', () => {
    for (const spec of specs) {
      expect(spec.colonnes.length).toBeGreaterThan(0);
      expect(spec.titre.trim().length).toBeGreaterThan(0);
    }
  });
});describe('NoteAnnexeService', () => {
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
    // Une note à plusieurs tableaux (note 1) tient UNE ligne à la fiche.
    const codes = new Set(NOTES_ASSOCIATIONS.map((n) => n.code));
    expect(r.ficheRecapitulative).toHaveLength(codes.size);
    expect(r.couverture).toEqual({ transcrites: codes.size, attendues: 45 });
    expect(r.notes.length).toBeGreaterThan(codes.size); // la note 1 en apporte trois
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

  it('sans exercice antérieur, N-1 et les variations restent undefined · jamais un faux zéro', async () => {
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

describe('note 30 · ventilation des mouvements par nature de contrepartie', () => {
  const serviceVent = (ecritures: EcritureFixture[], balance: ReturnType<typeof ligne>[]) =>
    service({ e1: balance }, [], prismaAvec([], [], [], ecritures));
  const val = (n: any, libelle: string) => ligneDe(n, libelle).valeurs;

  it('la NATURE se lit sur la contrepartie, pas sur le compte de provision', async () => {
    // Le même compte 191 reçoit trois dotations d'origines différentes. Rien
    // dans 191 ne les distingue : seule la contrepartie le fait.
    const s = serviceVent(
      [
        ecr(['69110000', 1000, 0], ['19100000', 0, 1000]), // dotation d'exploitation
        ecr(['69710000', 400, 0], ['19100000', 0, 400]),   // dotation financière
        ecr(['85400000', 250, 0], ['19100000', 0, 250]),   // dotation H.A.O.
        ecr(['19100000', 300, 0], ['79110000', 0, 300]),   // reprise d'exploitation
      ],
      [ligne('19100000', ClasseCompte.CLASSE_1, 300, 1650)],
    );
    const n30 = note(await s.notesAssociations('t', 'e1'), '30');
    expect(val(n30, 'Provisions pour risques et charges')).toEqual({
      OUVERTURE: 0,
      AUGMENTATION_EXPLOITATION: 1000,
      AUGMENTATION_FINANCIERE: 400,
      AUGMENTATION_HAO: 250,
      DIMINUTION_EXPLOITATION: 300,
      DIMINUTION_FINANCIERE: 0,
      DIMINUTION_HAO: 0,
      // La note déclarant aussi OUVERTURE et CLOTURE, le moteur émet les
      // mouvements BRUTS à côté des ventilés. Loin d'être redondants, ils
      // donnent un contrôle gratuit : la ventilation doit les recouper.
      AUGMENTATIONS: 1650,
      DIMINUTIONS: 300,
      CLOTURE: 1350, // 0 + 1650 - 300
    });
  });

  it('la ventilation se recoupe TOUJOURS avec le mouvement brut', async () => {
    // Invariant : la somme des trois natures, plus le non ventilé, redonne
    // exactement le mouvement de l'exercice. Une ventilation qui perdrait ou
    // dupliquerait un montant se verrait ici, sur n'importe quelle rubrique.
    const s = serviceVent(
      [
        ecr(['69110000', 1000, 0], ['19100000', 0, 1000]),
        ecr(['69710000', 400, 0], ['19100000', 0, 400]),
        ecr(['19100000', 700, 0], ['19800000', 0, 700]), // sans nature
      ],
      [ligne('19100000', ClasseCompte.CLASSE_1, 700, 1400), ligne('19800000', ClasseCompte.CLASSE_1, 0, 700)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '30'), 'Provisions pour risques et charges');
    const v = l.valeurs!;
    const augVentilees =
      v.AUGMENTATION_EXPLOITATION! + v.AUGMENTATION_FINANCIERE! + v.AUGMENTATION_HAO! +
      (l.natureNonVentilee?.augmentation ?? 0);
    const dimVentilees =
      v.DIMINUTION_EXPLOITATION! + v.DIMINUTION_FINANCIERE! + v.DIMINUTION_HAO! +
      (l.natureNonVentilee?.diminution ?? 0);
    expect(augVentilees).toBeCloseTo(v.AUGMENTATIONS!, 6);
    expect(dimVentilees).toBeCloseTo(v.DIMINUTIONS!, 6);
  });

  it('697 et 85 ne sont pas rangés en exploitation par leur seule classe', async () => {
    // Le test d'ordre : 697 commence par « 6 », 85 par « 8 ». Un classement
    // qui replierait d'abord sur les classes 6 et 7 les rangerait tous deux
    // en exploitation.
    const s = serviceVent(
      [ecr(['69710000', 500, 0], ['29100000', 0, 500]), ecr(['85300000', 700, 0], ['29100000', 0, 700])],
      [ligne('29100000', ClasseCompte.CLASSE_2, 0, 1200)],
    );
    const v = val(note(await s.notesAssociations('t', 'e1'), '30'), 'Dépréciations des immobilisations');
    expect(v!.AUGMENTATION_EXPLOITATION).toBe(0);
    expect(v!.AUGMENTATION_FINANCIERE).toBe(500);
    expect(v!.AUGMENTATION_HAO).toBe(700);
  });

  it('une écriture multi-lignes est répartie au prorata de ses contreparties', async () => {
    const s = serviceVent(
      [ecr(['69110000', 600, 0], ['69710000', 400, 0], ['19100000', 0, 1000])],
      [ligne('19100000', ClasseCompte.CLASSE_1, 0, 1000)],
    );
    const v = val(note(await s.notesAssociations('t', 'e1'), '30'), 'Provisions pour risques et charges');
    expect(v!.AUGMENTATION_EXPLOITATION).toBe(600);
    expect(v!.AUGMENTATION_FINANCIERE).toBe(400);
  });

  it('un mouvement sans contrepartie de nature connue est DIT, pas rangé en exploitation', async () => {
    // Virement de provision à provision : aucune des deux contreparties n'est
    // un compte de dotation ou de reprise.
    const s = serviceVent(
      [ecr(['19100000', 800, 0], ['19800000', 0, 800])],
      [ligne('19100000', ClasseCompte.CLASSE_1, 800, 0), ligne('19800000', ClasseCompte.CLASSE_1, 0, 800)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '30'), 'Provisions pour risques et charges');
    expect(l.valeurs!.DIMINUTION_EXPLOITATION).toBe(0);
    expect(l.valeurs!.AUGMENTATION_EXPLOITATION).toBe(0);
    expect(l.natureNonVentilee).toEqual({ augmentation: 800, diminution: 800 });
  });

  it('les totaux cumulent les six colonnes ventilées', async () => {
    const s = serviceVent(
      [ecr(['69110000', 1000, 0], ['19100000', 0, 1000]), ecr(['69110000', 500, 0], ['39100000', 0, 500])],
      [ligne('19100000', ClasseCompte.CLASSE_1, 0, 1000), ligne('39100000', ClasseCompte.CLASSE_3, 0, 500)],
    );
    const n30 = note(await s.notesAssociations('t', 'e1'), '30');
    expect(val(n30, 'TOTAL : DOTATIONS')!.AUGMENTATION_EXPLOITATION).toBe(1000);
    expect(val(n30, 'TOTAL : CHARGES POUR DEPRECIATIONS ET PROVISIONS A COURT TERME')!.AUGMENTATION_EXPLOITATION).toBe(500);
    expect(val(n30, 'TOTAL')!.AUGMENTATION_EXPLOITATION).toBe(1500);
  });

  it('une note sans colonnes ventilées ne porte aucune valeur de nature', async () => {
    const s = serviceVent([], [ligne('52110000', ClasseCompte.CLASSE_5, 8000, 0)]);
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '13'), 'Banques locales');
    expect(l.natureNonVentilee).toBeUndefined();
    expect(l.valeurs).toBeUndefined();
  });
});

describe('DÉFAUT CORRIGÉ : les notes hors balance présentent leurs rubriques en saisie', () => {
  // Une note `horsBalance` (informations obligatoires, effectifs, note 9 des
  // projets…) ne porte QUE des rubriques en saisie, jamais « chiffrées » ·
  // le filtre § 1.4 les retirait TOUTES malgré `applicable: true` : la note
  // se déclarait applicable et ne présentait rien. Relevé en vérifiant de
  // bout en bout une note hors balance dont les lignes n'avaient jamais été
  // lues jusque-là.
  it('une note horsBalance affiche TOUTES ses rubriques, jamais une liste vide', async () => {
    const s = service({ e1: [] });
    const r = await s.notesAssociations('t', 'e1');
    const n2 = note(r, '2'); // INFORMATIONS OBLIGATOIRES
    expect(n2.applicable).toBe(true);
    expect(n2.lignes.length).toBeGreaterThan(0);
    expect(n2.lignes.map((l: any) => l.libelle)).toContain('A - IDENTITE, ORGANISATION');
  });

  it('même garde sur le jeu projets · note 9 (fonds du bailleur, renvoi) et note 22 (lacune officielle)', async () => {
    const s = service({ e1: [] });
    const r = await s.notesProjet('t', 'e1');
    for (const code of ['1', '2', '9', '22', '24']) {
      const n = note(r, code);
      expect({ code, applicable: n.applicable, lignes: n.lignes.length > 0 }).toEqual(
        { code, applicable: true, lignes: true },
      );
    }
  });

  it('toutes les notes horsBalance des deux jeux présentent au moins une ligne', async () => {
    const sA = service({ e1: [] });
    const rA = await sA.notesAssociations('t', 'e1');
    const sP = service({ e1: [] });
    const rP = await sP.notesProjet('t', 'e1');
    for (const n of [...rA.notes, ...rP.notes]) {
      if (n.horsBalance) {
        expect({ code: n.code, sousTableau: n.sousTableau, lignes: n.lignes.length }).toEqual(
          expect.objectContaining({ lignes: expect.any(Number) }),
        );
        expect(n.lignes.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('recoupement croisé des notes (anti double comptage)', () => {
  it('la note 1 récapitule, et le déclare : chaque rubrique reprise renvoie à sa note d’origine', async () => {
    const s = service({ e1: [ligne('40110000', ClasseCompte.CLASSE_4, 0, 600)] });
    const r = await s.notesAssociations('t', 'e1');
    const n1 = note(r, '1', 'DETTES GARANTIES PAR DES SURETES REELLES');
    const reprise = ligneDe(n1, 'Fournisseurs et comptes rattachés');
    expect(reprise.montantN).toBe(600);
    expect(reprise.renvoi).toBe('19');
    // ... et le même montant figure bien, de plein droit, à la note 19.
    expect(ligneDe(note(r, '19'), 'Fournisseurs, dettes en compte').montantN).toBe(600);
  });

  // Deux fois déjà, le même montant s'est retrouvé dans deux notes à la fois :
  // le découvert bancaire entre les notes 13 et 22, puis les comptes de tiers
  // polyvalents entre la note 10 et les notes 19 à 21. Ces tests ferment la
  // classe entière de défaut plutôt que ses deux occurrences.

  /** Somme d'un compte à travers TOUTES les notes, hors lignes de total. */
  // La note 1 est écartée : elle RÉCAPITULE les dettes déjà présentées aux
  // notes 9 et 19 à 21, sous l'angle des sûretés qui les garantissent. Le
  // modèle officiel le dit lui-même · sa colonne « Note » renvoie, rubrique
  // par rubrique, à la note d'origine. Une récapitulation assumée n'est pas
  // un double comptage ; c'est la SOMME de deux notes de même rang qui en
  // serait un.
  const sommeParNote = (r: any, numero: string) =>
    r.notes.filter((n: any) => n.code !== '1').flatMap((n: any) =>
      n.lignes
        .filter((l: any) => !l.estTotal && l.comptes.some((c: any) => c.numero === numero))
        .map((l: any) => ({ note: n.code, libelle: l.libelle, montant: l.montantN })),
    );

  it('un compte de tiers DÉBITEUR ne figure que dans la note des créances', async () => {
    const s = service({ e1: [
      ligne('43100000', ClasseCompte.CLASSE_4, 900, 0),   // organismes sociaux, débiteur
      ligne('47170000', ClasseCompte.CLASSE_4, 400, 0),   // débiteurs divers, débiteur
    ]});
    const r = await s.notesAssociations('t', 'e1');
    expect(sommeParNote(r, '43100000').map((x: any) => x.note)).toEqual(['10']);
    expect(sommeParNote(r, '47170000').map((x: any) => x.note)).toEqual(['10']);
  });

  it('un compte de tiers CRÉDITEUR ne figure que dans la note des dettes', async () => {
    const s = service({ e1: [
      ligne('43100000', ClasseCompte.CLASSE_4, 0, 900),   // organismes sociaux, créditeur
      ligne('47170000', ClasseCompte.CLASSE_4, 0, 400),   // créditeurs divers
      ligne('40110000', ClasseCompte.CLASSE_4, 0, 600),   // fournisseurs
    ]});
    const r = await s.notesAssociations('t', 'e1');
    expect(sommeParNote(r, '43100000').map((x: any) => x.note)).toEqual(['20']);
    expect(sommeParNote(r, '47170000').map((x: any) => x.note)).toEqual(['21']);
    expect(sommeParNote(r, '40110000').map((x: any) => x.note)).toEqual(['19']);
  });

  it('475 « Générosités financières à recevoir » n’appartient qu’à la note 21', async () => {
    // Le modèle officiel lui donne une ligne propre dans la note 21 ; le
    // ranger AUSSI dans « Autres débiteurs divers » de la note 10 le
    // compterait deux fois.
    const s = service({ e1: [ligne('47500000', ClasseCompte.CLASSE_4, 250, 0)] });
    const r = await s.notesAssociations('t', 'e1');
    expect(sommeParNote(r, '47500000').map((x: any) => x.note)).toEqual(['21']);
  });

  it('DÉFAUT CORRIGÉ : le compte 619 (achats ET transports) n’est plus rattaché en dur aux deux notes', async () => {
    // Le plan officiel liste 619 sous les classes 60 ET 61 sans le ventiler
    // entre elles. Une version antérieure des notes 24 et 25 le rattachait
    // en dur toutes les deux : un solde sur 619 était donc compté deux fois.
    const s = service({ e1: [ligne('61900000', ClasseCompte.CLASSE_6, 0, 500)] });
    const r = await s.notesAssociations('t', 'e1');
    // Par défaut sans rattachement du dossier 619 ne contribue à AUCUNE
    // des deux notes : il est en attente des deux côtés, jamais compté.
    expect(sommeParNote(r, '61900000')).toEqual([]);
    const fiche24 = r.ficheRecapitulative.find((f: any) => f.code === '24')!;
    const fiche25 = r.ficheRecapitulative.find((f: any) => f.code === '25')!;
    expect(fiche24.rubriquesEnAttente.map((x: any) => x.cle)).toContain('rabais-remises-ristournes');
    expect(fiche25.rubriquesEnAttente.map((x: any) => x.cle)).toContain('rabais-remises-ristournes');
  });

  it('619 subdivisé par le dossier alimente chaque note séparément, sans double compte', async () => {
    const s = service(
      { e1: [
        ligne('61901000', ClasseCompte.CLASSE_6, 0, 300), // sous-compte achats
        ligne('61902000', ClasseCompte.CLASSE_6, 0, 200), // sous-compte transports
      ] },
      [],
      prismaAvec([
        { codeNote: '24', cleRubrique: 'rabais-remises-ristournes', compte: { numero: '61901000' } },
        { codeNote: '25', cleRubrique: 'rabais-remises-ristournes', compte: { numero: '61902000' } },
      ]),
    );
    const r = await s.notesAssociations('t', 'e1');
    const n24 = note(r, '24');
    const n25 = note(r, '25');
    expect(ligneDe(n24, 'Rabais, remises et ristournes obtenus').montantN).toBe(-300);
    expect(ligneDe(n25, 'Rabais, remises et ristournes obtenus').montantN).toBe(-200);
  });

  it('AUCUN compte du plan de tiers n’est réclamé au même sens par deux notes', async () => {
    // Balayage systématique : un compte représentatif par divisionnaire des
    // classes 40 à 47, testé au débit puis au crédit.
    const DIVISIONNAIRES = [
      '40110000', '40910000', '41100000', '41910000', '42100000', '42200000',
      '43100000', '43200000', '44200000', '44700000', '45110000', '46200000',
      '47110000', '47170000', '47600000',
    ];
    for (const numero of DIVISIONNAIRES) {
      for (const [d, c] of [[1000, 0], [0, 1000]] as const) {
        const s = service({ e1: [ligne(numero, ClasseCompte.CLASSE_4, d, c)] });
        const notes: string[] = sommeParNote(await s.notesAssociations('t', 'e1'), numero).map(
          (x: any) => `${x.note} / ${x.libelle}`,
        );
        // Au plus UNE note réclame ce compte dans ce sens. Zéro est possible
        // et signalerait un trou de couverture · question distincte, traitée
        // par le dossier de révision (phase 5), pas ici.
        expect({ numero, sens: d ? 'débit' : 'crédit', notes }).toEqual({
          numero,
          sens: d ? 'débit' : 'crédit',
          notes: notes.slice(0, 1),
        });
      }
    }
  });
});

describe('jeu projets de développement · recoupement croisé (anti double comptage)', () => {
  const sommeParNoteProjet = (r: any, numero: string) =>
    r.notes.flatMap((n: any) =>
      n.lignes
        .filter((l: any) => !l.estTotal && l.comptes.some((c: any) => c.numero === numero))
        .map((l: any) => ({ note: n.code, libelle: l.libelle, montant: l.montantN })),
    );

  it('un compte de tiers DÉBITEUR (note 6) ne figure pas aussi dans les dettes (note 12)', async () => {
    const s = service({ e1: [ligne('42100000', ClasseCompte.CLASSE_4, 900, 0)] });
    const r = await s.notesProjet('t', 'e1');
    expect(sommeParNoteProjet(r, '42100000').map((x: any) => x.note)).toEqual(['6']);
  });

  it('un compte de tiers CRÉDITEUR (note 12) ne figure pas aussi dans les créances (note 6)', async () => {
    const s = service({ e1: [ligne('42200000', ClasseCompte.CLASSE_4, 0, 900)] });
    const r = await s.notesProjet('t', 'e1');
    expect(sommeParNoteProjet(r, '42200000').map((x: any) => x.note)).toEqual(['12']);
  });

  it('une banque DÉBITEUR (note 7, disponibilités) ne figure pas aussi au découvert (note 13)', async () => {
    const s = service({ e1: [ligne('52100000', ClasseCompte.CLASSE_5, 5000, 0)] });
    const r = await s.notesProjet('t', 'e1');
    expect(sommeParNoteProjet(r, '52100000').map((x: any) => x.note)).toEqual(['7']);
  });

  it('une banque CRÉDITEUR (note 13, découvert) ne figure pas aussi aux disponibilités (note 7)', async () => {
    const s = service({ e1: [ligne('52100000', ClasseCompte.CLASSE_5, 0, 5000)] });
    const r = await s.notesProjet('t', 'e1');
    expect(sommeParNoteProjet(r, '52100000').map((x: any) => x.note)).toEqual(['13']);
  });

  it('balayage systématique : aucun compte n’est réclamé au même sens par deux notes du jeu projets', async () => {
    const DIVISIONNAIRES = [
      '40110000', '40910000', '41200000', '41900000', '42100000', '42200000',
      '43100000', '43200000', '44200000', '44700000', '48100000', '48400000',
      '52100000', '52200000', '56100000',
    ];
    for (const numero of DIVISIONNAIRES) {
      for (const [d, c] of [[1000, 0], [0, 1000]] as const) {
        const classe = numero.startsWith('5') ? ClasseCompte.CLASSE_5 : ClasseCompte.CLASSE_4;
        const s = service({ e1: [ligne(numero, classe, d, c)] });
        const notes: string[] = sommeParNoteProjet(await s.notesProjet('t', 'e1'), numero).map(
          (x: any) => `${x.note} / ${x.libelle}`,
        );
        expect({ numero, sens: d ? 'débit' : 'crédit', notes }).toEqual({
          numero,
          sens: d ? 'débit' : 'crédit',
          notes: notes.slice(0, 1),
        });
      }
    }
  });

  it('619 (achats/transports) reste en attente des deux côtés dans le jeu projets aussi', async () => {
    const s = service({ e1: [ligne('61900000', ClasseCompte.CLASSE_6, 0, 500)] });
    const r = await s.notesProjet('t', 'e1');
    expect(sommeParNoteProjet(r, '61900000')).toEqual([]);
    const fiche15 = r.ficheRecapitulative.find((f: any) => f.code === '15')!;
    const fiche16 = r.ficheRecapitulative.find((f: any) => f.code === '16')!;
    expect(fiche15.rubriquesEnAttente.map((x: any) => x.cle)).toContain('rabais-remises-ristournes');
    expect(fiche16.rubriquesEnAttente.map((x: any) => x.cle)).toContain('rabais-remises-ristournes');
  });

  it('couverture : 26 notes transcrites, comme attendu par le texte officiel', async () => {
    const s = service({ e1: [] });
    const r = await s.notesProjet('t', 'e1');
    expect(r.couverture).toEqual({ transcrites: 26, attendues: 26 });
  });
});

describe('notes de charges et de produits', () => {
  it('un produit se lit au crédit et s’affiche en positif, sans être filtré sur le signe', async () => {
    const s = service({ e1: [
      ligne('70100000', ClasseCompte.CLASSE_7, 0, 5000),   // cotisations, créditeur
      ligne('70500000', ClasseCompte.CLASSE_7, 200, 0),    // ventes, débiteur (rabais > ventes)
    ]});
    const n23 = note(await s.notesAssociations('t', 'e1'), '23');
    expect(ligneDe(n23, 'Cotisations des adhérents').montantN).toBe(5000);
    // Le compte débiteur reste présenté, en négatif : `sens: 'CREDITEUR'`
    // l'aurait fait disparaître de la note.
    expect(ligneDe(n23, 'Ventes de marchandises, services et produits finis').montantN).toBe(-200);
    expect(ligneDe(n23, 'TOTAL : REVENUS').montantN).toBe(4800);
  });

  it('une charge se lit au débit ; un dégrèvement créditeur est présenté en négatif', async () => {
    const s = service({ e1: [
      ligne('64100000', ClasseCompte.CLASSE_6, 3000, 0),   // impôts directs
      ligne('64900000', ClasseCompte.CLASSE_6, 0, 500),    // dégrèvements, créditeur
    ]});
    const n27 = note(await s.notesAssociations('t', 'e1'), '27');
    expect(ligneDe(n27, 'Impôts et taxes directs').montantN).toBe(3000);
    expect(ligneDe(n27, 'Dégrèvements et annulations des impôts et taxes').montantN).toBe(-500);
    expect(ligneDe(n27, 'TOTAL').montantN).toBe(2500);
  });

  it('le TOTAL des notes 31 et 32 retranche les charges des produits', async () => {
    const s = service({ e1: [
      ligne('67100000', ClasseCompte.CLASSE_6, 800, 0),    // intérêts des emprunts
      ligne('77400000', ClasseCompte.CLASSE_7, 0, 2000),   // revenus de placement
    ]});
    const n31 = note(await s.notesAssociations('t', 'e1'), '31');
    expect(ligneDe(n31, 'TOTAL : FRAIS FINANCIERS').montantN).toBe(800);
    expect(ligneDe(n31, 'TOTAL : REVENUS FINANCIERS').montantN).toBe(2000);
    expect(ligneDe(n31, 'TOTAL').montantN).toBe(1200); // 2000 - 800, le résultat financier
  });

  it('les dons en nature HAO vont à leur rubrique malgré leur numérotation en 831x', async () => {
    // [texte officiel] Le plan numérote les subdivisions du compte 832 en
    // 8311/8315. Sans l'exclusion, elles tomberaient dans « Charges H.A.O.
    // constatées » et la rubrique des dons resterait vide.
    const s = service({ e1: [
      ligne('83100000', ClasseCompte.CLASSE_8, 400, 0),
      ligne('83150000', ClasseCompte.CLASSE_8, 900, 0),
    ]});
    const n32 = note(await s.notesAssociations('t', 'e1'), '32');
    expect(ligneDe(n32, 'Charges H.A.O. constatées (compte 831)').montantN).toBe(400);
    expect(ligneDe(n32, 'Dons en nature (compte 832) à détailler : non affectés / affectés').montantN).toBe(900);
    expect(ligneDe(n32, 'TOTAL : AUTRES CHARGES HAO').montantN).toBe(1300);
  });

  it('note 8 : la variation en valeur absolue est calculée, pas laissée vide', async () => {
    const s = service(
      {
        e1: [ligne('32100000', ClasseCompte.CLASSE_3, 800, 0)],
        e0: [ligne('32100000', ClasseCompte.CLASSE_3, 1000, 0)],
      },
      [{ id: 'e1', dateDebut: new Date('2026-01-01') }, { id: 'e0', dateDebut: new Date('2025-01-01') }],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '8'), 'Marchandises, Matières premières');
    expect(l.variationValeur).toBe(-200);
    expect(l.valeurs).toEqual({ VARIATION_VALEUR_ABSOLUE: 200 });
  });

  it('note 22 : un compte bancaire DÉBITEUR est une disponibilité, il ne figure pas ici', async () => {
    const s = service({ e1: [
      ligne('52110000', ClasseCompte.CLASSE_5, 8000, 0),   // débiteur -> note 13
      ligne('52120000', ClasseCompte.CLASSE_5, 0, 300),    // créditeur -> note 22
    ]});
    const r = await s.notesAssociations('t', 'e1');
    expect(ligneDe(note(r, '22'), 'Banques locales').montantN).toBe(300);
    expect(ligneDe(note(r, '13'), 'Banques locales').montantN).toBe(8000);
  });
});

describe('ventilation par échéance (notes 6, 9, 10, 18A, 19 à 21)', () => {
  const ech = (numero: string, debit: number, credit: number, date: string | null, lettre?: string): LigneEch => ({
    numero, debit, credit, dateEcheance: date ? new Date(date) : null, lettre,
  });
  // Clôture au 31/12/2026 : ≤ 31/12/2027 = 1 an ; ≤ 31/12/2028 = 2 ans ; au-delà = plus de 2 ans.
  const serviceEch = (lignesEch: LigneEch[], balance: ReturnType<typeof ligne>[]) =>
    service({ e1: balance }, [], prismaAvec([], [], lignesEch));

  it('ventile le solde des adhérents dans les trois tranches officielles', async () => {
    const s = serviceEch(
      [
        ech('41100000', 1000, 0, '2027-06-30'),  // à un an au plus
        ech('41100000', 2000, 0, '2028-06-30'),  // à plus d'un an et deux ans au plus
        ech('41100000', 3000, 0, '2030-06-30'),  // à plus de deux ans
      ],
      [ligne('41100000', ClasseCompte.CLASSE_4, 6000, 0)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '9'), 'Adhérents');
    expect(l.valeurs).toEqual({ ECHEANCE_1AN: 1000, ECHEANCE_2ANS: 2000, ECHEANCE_PLUS_2ANS: 3000 });
    expect(l.montantN).toBe(6000); // la somme des tranches recoupe le solde
    expect(l.echeanceNonVentilee).toBeUndefined();
  });

  it('les bornes se comptent depuis la CLÔTURE, pas depuis la saisie', async () => {
    // 31/12/2027 est la borne exacte : inclus dans « à un an au plus ».
    // 01/01/2028 bascule dans la tranche suivante.
    const s = serviceEch(
      [ech('41100000', 100, 0, '2027-12-31'), ech('41100000', 50, 0, '2028-01-01')],
      [ligne('41100000', ClasseCompte.CLASSE_4, 150, 0)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '9'), 'Adhérents');
    expect(l.valeurs).toEqual({ ECHEANCE_1AN: 100, ECHEANCE_2ANS: 50, ECHEANCE_PLUS_2ANS: 0 });
  });

  it('une créance sans échéance saisie est signalée NON VENTILÉE, jamais rangée en « à un an au plus »', async () => {
    // C'est le défaut que cette colonne existe pour empêcher : une ventilation
    // qui a l'air complète alors que la donnée manque.
    const s = serviceEch(
      [ech('41100000', 1000, 0, '2027-06-30'), ech('41100000', 4000, 0, null)],
      [ligne('41100000', ClasseCompte.CLASSE_4, 5000, 0)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '9'), 'Adhérents');
    expect(l.valeurs!.ECHEANCE_1AN).toBe(1000);
    expect(l.echeanceNonVentilee).toBe(4000);
  });

  it('une ligne lettrée est soldée : elle sort de la ventilation', async () => {
    const s = serviceEch(
      [ech('41100000', 1000, 0, '2027-06-30'), ech('41100000', 9000, 0, '2027-06-30', 'A')],
      [ligne('41100000', ClasseCompte.CLASSE_4, 1000, 0)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '9'), 'Adhérents');
    expect(l.valeurs!.ECHEANCE_1AN).toBe(1000);
  });

  it('sur une rubrique créditrice, les échéances suivent le sens de lecture', async () => {
    const s = serviceEch(
      [ech('41910000', 0, 700, '2027-03-31')],
      [ligne('41910000', ClasseCompte.CLASSE_4, 0, 700)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '9'), 'Adhérents, avances reçues');
    expect(l.montantN).toBe(700);
    expect(l.valeurs!.ECHEANCE_1AN).toBe(700); // et non -700
  });

  it('les totaux cumulent les échéances de leurs rubriques', async () => {
    const s = serviceEch(
      [ech('41100000', 1000, 0, '2027-06-30'), ech('41600000', 500, 0, '2030-06-30')],
      [
        ligne('41100000', ClasseCompte.CLASSE_4, 1000, 0),
        ligne('41600000', ClasseCompte.CLASSE_4, 500, 0),
      ],
    );
    const t = ligneDe(note(await s.notesAssociations('t', 'e1'), '9'), 'TOTAL BRUT ADHERENTS, CLIENTS-USAGERS');
    expect(t.valeurs!.ECHEANCE_1AN).toBe(1000);
    expect(t.valeurs!.ECHEANCE_PLUS_2ANS).toBe(500);
  });

  it('une note sans colonnes d’échéance n’en porte aucune', async () => {
    const s = serviceEch(
      [ech('52110000', 8000, 0, '2027-06-30')],
      [ligne('52110000', ClasseCompte.CLASSE_5, 8000, 0)],
    );
    const l = ligneDe(note(await s.notesAssociations('t', 'e1'), '13'), 'Banques locales');
    expect(l.valeurs).toBeUndefined();
    expect(l.echeanceNonVentilee).toBeUndefined();
  });
});

describe('tableaux de situations et mouvements (notes 5A-5F, 30)', () => {
  const val = (n: any, libelle: string) => ligneDe(n, libelle).valeurs;

  it('sens DÉBIT : le report à-nouveau est l’OUVERTURE, jamais une acquisition de l’exercice', async () => {
    // LE défaut que cette colonne existe pour empêcher : un bâtiment détenu
    // depuis un exercice antérieur (report 9000) plus une acquisition de
    // l'exercice (1000) et une cession (400).
    const s = service({ e1: [
      ligne('23110000', ClasseCompte.CLASSE_2, 1000, 400, [9000, 0]),
    ]});
    const n5b = note(await s.notesAssociations('t', 'e1'), '5B');
    expect(val(n5b, 'Bâtiments hors immeuble de placement')).toEqual({
      OUVERTURE: 9000, AUGMENTATIONS: 1000, DIMINUTIONS: 400, CLOTURE: 9600,
    });
    // et le solde réel de la balance confirme : 9000 + 1000 - 400 = 9600
    expect(ligneDe(n5b, 'Bâtiments hors immeuble de placement').ecartCloture).toBeUndefined();
  });

  it('sens CRÉDIT : sur un amortissement, la dotation est une AUGMENTATION', async () => {
    // Amortissement : ouverture au crédit 2000, dotation de l'exercice 500
    // (crédit), reprise sur sortie d'actif 300 (débit).
    const s = service({ e1: [
      ligne('28440000', ClasseCompte.CLASSE_2, 300, 500, [0, 2000]),
    ]});
    const n5e = note(await s.notesAssociations('t', 'e1'), '5E');
    expect(val(n5e, 'Matériel, mobilier et actifs biologiques')).toEqual({
      OUVERTURE: 2000, AUGMENTATIONS: 500, DIMINUTIONS: 300, CLOTURE: 2200,
    });
    expect(ligneDe(n5e, 'Matériel, mobilier et actifs biologiques').ecartCloture).toBeUndefined();
  });

  it('les totaux cumulent les colonnes A/B/C/D, pas seulement le solde', async () => {
    const s = service({ e1: [
      ligne('21200000', ClasseCompte.CLASSE_2, 100, 0, [700, 0]),   // Brevets
      ligne('21300000', ClasseCompte.CLASSE_2, 50, 20, [300, 0]),   // Logiciels
    ]});
    const n5b = note(await s.notesAssociations('t', 'e1'), '5B');
    expect(val(n5b, 'SOUS TOTAL : IMMOBILISATIONS INCORPORELLES')).toEqual({
      OUVERTURE: 1000, AUGMENTATIONS: 150, DIMINUTIONS: 20, CLOTURE: 1130,
    });
    expect(val(n5b, 'TOTAL GENERAL')).toEqual({
      OUVERTURE: 1000, AUGMENTATIONS: 150, DIMINUTIONS: 20, CLOTURE: 1130,
    });
  });

  it('§1.4 : un poste entré ET sorti dans l’exercice reste présenté, malgré une clôture nulle', async () => {
    // Sans la règle « chiffrée = une colonne au moins », cette ligne
    // disparaîtrait · alors que c'est précisément le mouvement que le tableau
    // a pour objet de montrer.
    const s = service({ e1: [ligne('24500000', ClasseCompte.CLASSE_2, 500, 500)] });
    const n5b = note(await s.notesAssociations('t', 'e1'), '5B');
    const l = ligneDe(n5b, 'Matériel de transport');
    expect(l).toBeDefined();
    expect(l.valeurs).toEqual({ OUVERTURE: 0, AUGMENTATIONS: 500, DIMINUTIONS: 500, CLOTURE: 0 });
  });

  it('signale un écart entre la clôture recalculée et le solde de la balance', async () => {
    // Report à-nouveau manquant : la balance porte un solde de 9600 mais
    // aucune ouverture. D = 0 + 1000 - 400 = 600, contre 600 réel... on force
    // donc l'incohérence en déclarant un solde qui ne suit pas ses agrégats.
    const bancal = { ...ligne('23110000', ClasseCompte.CLASSE_2, 1000, 400), solde: 9600 };
    const s = service({ e1: [bancal] });
    const n5b = note(await s.notesAssociations('t', 'e1'), '5B');
    expect(ligneDe(n5b, 'Bâtiments hors immeuble de placement').ecartCloture).toBeCloseTo(-9000, 6);
  });

  it('les rubriques « immeuble de placement » des notes 5E et 5F sont en attente, pas rattachées au jugé', async () => {
    // Le plan ne subdivise « immeuble de placement » qu'à l'actif brut
    // (2281, 2315, 2325, 2396) · jamais en 28 ni en 29.
    const s = service({ e1: [] });
    const r = await s.notesAssociations('t', 'e1');
    for (const code of ['5E', '5F']) {
      const cles = r.ficheRecapitulative.find((f) => f.code === code)!.rubriquesEnAttente.map((x) => x.cle);
      expect(cles).toEqual(['terrains-immeuble-placement', 'batiments-immeuble-placement']);
    }
    // ... alors que la 5B, elle, les détermine sans jugement.
    expect(r.ficheRecapitulative.find((f) => f.code === '5B')!.rubriquesEnAttente).toEqual([]);
  });

  it('une note SANS colonnes de mouvement ne porte aucune valeur A/B/C/D', async () => {
    const s = service({ e1: [ligne('52110000', ClasseCompte.CLASSE_5, 8000, 0)] });
    const n13 = note(await s.notesAssociations('t', 'e1'), '13');
    expect(ligneDe(n13, 'Banques locales').valeurs).toBeUndefined();
  });
});

describe('rattachement des comptes du dossier aux rubriques', () => {
  const JEU = JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS;

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
    // à présenter (§1.4), donc aucune ligne, donc aucune clé · et l'utilisateur
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


/**
 * GÉNÉRALISATION AU SYSCOHADA (2026-09-02) · le moteur de notes était indexé
 * par `JeuEtatsFinanciersSycebnl`, ce qui interdisait matériellement d'y loger
 * les 36 notes de l'AUDCIF Titre IX ch. 6. Il l'est désormais par
 * `JeuNotesAnnexes`, un enum propre au rattachement.
 *
 * Ce que ces tests protègent, et qui casserait en silence :
 *  · le cloisonnement des deux référentiels (CLAUDE.md §6) sur des routes de
 *    rattachement volontairement ouvertes aux deux ;
 *  · le décompte de couverture, que la subdivision des codes SYSCOHADA
 *    (3A à 3F, 16A à 16C…) fausserait de dix notes.
 */
describe('jeu de notes SYSCOHADA · Système normal', () => {
  const dossier = (referentiel: Referentiel, rattachements: Rattachement[] = [], comptes: any[] = []) =>
    service({ e1: [] }, [], prismaAvec(rattachements, comptes, [], [], referentiel));

  it('les 36 notes officielles sont servies, et la couverture les compte comme 36 et non 46', async () => {
    // AUDCIF Titre IX ch. 6 section 2 : la liste va de NOTE 1 à NOTE 36, mais
    // subdivise plusieurs numéros en codes distincts (3A à 3F, 15A/15B, 16A à
    // 16C, 27A/27B). Compter les CODES donnerait 46 transcrites pour 36
    // attendues · un jeu complet passerait pour un jeu en excédent.
    const r = await dossier(Referentiel.SYSCOHADA).notesSyscohada('t', 'e1');
    expect(r.couverture).toEqual({ transcrites: 36, attendues: 36 });
    expect(new Set(NOTES_SYSCOHADA.map((n) => n.code)).size).toBe(46);
  });

  it('sert les notes SYSCOHADA et AUCUNE note SYCEBNL · les deux jeux ne se recopient pas', async () => {
    const r = await dossier(Referentiel.SYSCOHADA).notesSyscohada('t', 'e1');
    const titresServis = new Set(r.notes.map((n) => `${n.code}::${n.titre}`));
    expect(titresServis).toEqual(new Set(NOTES_SYSCOHADA.map((n) => `${n.code}::${n.titre}`)));
    // Un titre propre au SYCEBNL ne doit jamais apparaître ici. « Fonds du
    // bailleur » et « Générosités » n'existent que dans son texte.
    for (const n of r.notes) {
      expect(n.titre.toUpperCase()).not.toContain('BAILLEUR');
      expect(n.titre.toUpperCase()).not.toContain('GÉNÉROSIT');
    }
  });

  it('un dossier SYSCOHADA rattache un de ses sous-comptes à une rubrique SYSCOHADA en attente', async () => {
    // Note 15B « AUTRES FONDS PROPRES », rubrique « Titres participatifs » :
    // le plan SYSCOHADA n'isole pas ces titres, le dossier doit subdiviser.
    const s = dossier(Referentiel.SYSCOHADA, [], [{ id: 'c1', typeCompte: 'DETAIL', numero: '16610000' }]);
    const r = await s.rattacher('t', 'u', JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL, '15B', 'titres-participatifs', 'c1');
    expect(r).toMatchObject({ codeNote: '15B', cleRubrique: 'titres-participatifs', compteId: 'c1' });
  });

  it('le garde-fou des rubriques officielles vaut aussi pour le SYSCOHADA', async () => {
    // « Avances conditionnées » est rattachée au compte 167 par l'AUDCIF :
    // elle ne porte pas de clé et n'est pas modifiable.
    const s = dossier(Referentiel.SYSCOHADA, [], [{ id: 'c1', typeCompte: 'DETAIL', numero: '16700000' }]);
    await expect(
      s.rattacher('t', 'u', JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL, '15B', 'avances-conditionnees', 'c1'),
    ).rejects.toThrow(/pas de rubrique rattachable/);
  });

  it('CLOISONNEMENT · un dossier SYSCOHADA ne rattache pas à un jeu SYCEBNL', async () => {
    const s = dossier(Referentiel.SYSCOHADA, [], [{ id: 'c1', typeCompte: 'DETAIL', numero: '60410000' }]);
    await expect(
      s.rattacher('t', 'u', JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS, '24', 'matieres-consommables', 'c1'),
    ).rejects.toThrow(/relève du référentiel SYCEBNL.*ce dossier est en SYSCOHADA/s);
  });

  it('CLOISONNEMENT · un dossier SYCEBNL ne rattache pas au jeu SYSCOHADA', async () => {
    const s = dossier(Referentiel.SYCEBNL, [], [{ id: 'c1', typeCompte: 'DETAIL', numero: '16610000' }]);
    await expect(
      s.rattacher('t', 'u', JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL, '15B', 'titres-participatifs', 'c1'),
    ).rejects.toThrow(/relève du référentiel SYSCOHADA.*ce dossier est en SYCEBNL/s);
  });

  it('CLOISONNEMENT · le détachement est gardé comme le rattachement', async () => {
    // Sans ce contrôle, un dossier pourrait supprimer les rattachements d'un
    // jeu qui n'est pas le sien · sans effet visible chez lui, bien réel en base.
    const s = dossier(Referentiel.SYCEBNL);
    await expect(
      s.detacher('t', JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL, '15B', 'titres-participatifs', 'c1'),
    ).rejects.toThrow(/relève du référentiel SYSCOHADA/);
  });

  it('le rattachement du dossier chiffre bien la rubrique SYSCOHADA', async () => {
    const s = service(
      { e1: [ligne('16610000', ClasseCompte.CLASSE_1, 0, 4000)] },
      [],
      prismaAvec(
        [{ codeNote: '15B', cleRubrique: 'titres-participatifs', compte: { numero: '16610000' } }],
        [],
        [],
        [],
        Referentiel.SYSCOHADA,
      ),
    );
    const n15b = note(await s.notesSyscohada('t', 'e1'), '15B');
    const l = ligneDe(n15b, 'Titres participatifs');
    expect(l.enAttenteDeRattachement).toBeUndefined();
    expect(l.rattachementDuDossier).toBe(true);
    expect(Math.abs(l.montantN)).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// SAISIE DES RUBRIQUES RENSEIGNÉES HORS COMPTABILITÉ
// ---------------------------------------------------------------------------
describe('rubriques en saisie · ce que le dossier écrit lui-même', () => {
  const JEU_ASSO = JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS;

  it('rend la valeur saisie, colonne par colonne, et `null` là où rien n’a été écrit', async () => {
    // Note 18B « Actifs et passifs éventuels » · deux colonnes chiffrées, quatre
    // rubriques entièrement en saisie.
    const s = service({ e1: [] }, [], prismaAvec([], [], [], [], Referentiel.SYCEBNL, [
      { codeNote: '18B', cleRubrique: 'actif-eventuel-litiges', colonne: 0, valeurNombre: 4_500 },
      { codeNote: '18B', cleRubrique: 'passif-eventuel-autres', colonne: 1, valeurNombre: 900 },
    ]));
    const r = await s.notesAssociations('t', 'e1');
    const n = note(r, '18B');
    expect(ligneDe(n, 'Actif éventuel · Litiges').saisie).toEqual([4500, null]);
    expect(ligneDe(n, 'Passif éventuel · Autres').saisie).toEqual([null, 900]);
    // Une cellule jamais renseignée n'est PAS un zéro · la note doit pouvoir
    // laisser la case vide dans la liasse.
    expect(ligneDe(n, 'Actif éventuel · Autres').saisie).toEqual([null, null]);
  });

  it('une note que rien ne chiffre devient APPLICABLE dès qu’une cellule est renseignée', async () => {
    // Les notes en saisie des DEUX jeux SYCEBNL sont toutes `horsBalance` et
    // donc toujours présentées ; c'est le SYSCOHADA qui mêle les deux, et sa
    // note 13 « Apporteurs » le montre : une seule rubrique en saisie au
    // milieu de rubriques chiffrées. Sans le signal de saisie, une note dont
    // la seule information est saisie resterait « non applicable », donc
    // cochée N/A sur la fiche récapitulative alors qu'elle porte un contenu.
    const vide = service({ e1: [] }, [], prismaAvec([], [], [], [], Referentiel.SYSCOHADA));
    expect(note(await vide.notesSyscohada('t', 'e1'), '13').applicable).toBe(false);

    const remplie = service({ e1: [] }, [], prismaAvec([], [], [], [], Referentiel.SYSCOHADA, [
      { codeNote: '13', cleRubrique: 'apporteurs-une-ligne-par-apporteur-nom-et-prenom', colonne: 0, valeurTexte: 'MUKENDI Jean' },
    ]));
    expect(note(await remplie.notesSyscohada('t', 'e1'), '13').applicable).toBe(true);
  });

  it('les lignes en saisie sont présentées MÊME quand la note n’est pas applicable', async () => {
    // Le § 1.4 retire les lignes non chiffrées. Appliqué aux rubriques en
    // saisie, il laissait une note SANS AUCUNE ligne à remplir : un
    // cul-de-sac, la note ne pouvait plus être alimentée depuis le logiciel.
    const s = service({ e1: [] }, [], prismaAvec([], [], [], [], Referentiel.SYSCOHADA));
    const n = note(await s.notesSyscohada('t', 'e1'), '13');
    expect(n.applicable).toBe(false);
    expect(n.lignes.map((l: any) => l.saisie !== undefined)).toEqual([true]);
    expect(n.lignes[0].saisie).toEqual([null, null, null, null, null, null]);
  });

  it('enregistre une colonne LIBRE en texte et une colonne chiffrée en montant', async () => {
    const prisma = prismaAvec();
    const s = service({ e1: [] }, [], prisma);
    // Note 2 · une seule colonne, de type LIBRE.
    const texte = await s.enregistrerSaisie('t', 'u', 'e1', JEU_ASSO, '2', 'a-identite-organisation', 0, 'ASBL VMG, Kinshasa');
    expect(texte).toMatchObject({ valeurTexte: 'ASBL VMG, Kinshasa' });
    const montant = await s.enregistrerSaisie('t', 'u', 'e1', JEU_ASSO, '18B', 'actif-eventuel-litiges', 0, '12 500,50');
    expect(montant).toMatchObject({ valeurNombre: 12500.5 });
  });

  it('REFUSE un texte dans une colonne de montant · il sortirait tel quel dans une cellule qu’on additionne', async () => {
    const s = service({ e1: [] }, [], prismaAvec());
    await expect(
      s.enregistrerSaisie('t', 'u', 'e1', JEU_ASSO, '18B', 'actif-eventuel-litiges', 0, 'environ 3 000'),
    ).rejects.toThrow(/attend un montant/);
  });

  it('REFUSE d’écrire dans une rubrique que la comptabilité chiffre', async () => {
    const s = service({ e1: [] }, [], prismaAvec());
    // Note 24 « Achats » · rubrique en ATTENTE DE RATTACHEMENT, donc chiffrée
    // dès qu'un compte lui est rattaché. Deux sources pour une même cellule,
    // c'est exactement ce que le garde-fou empêche.
    await expect(
      s.enregistrerSaisie('t', 'u', 'e1', JEU_ASSO, '24', 'matieres-consommables', 0, '10'),
    ).rejects.toThrow(/chiffrée par la comptabilité/);
  });

  it('REFUSE une colonne qui n’existe pas · le rang est l’ancre du stockage', async () => {
    const s = service({ e1: [] }, [], prismaAvec());
    await expect(
      s.enregistrerSaisie('t', 'u', 'e1', JEU_ASSO, '18B', 'actif-eventuel-litiges', 7, '10'),
    ).rejects.toThrow(/pas de colonne/);
  });

  it('une valeur vide EFFACE la cellule au lieu de l’enregistrer à blanc', async () => {
    const prisma = prismaAvec();
    const s = service({ e1: [] }, [], prisma);
    expect(await s.enregistrerSaisie('t', 'u', 'e1', JEU_ASSO, '2', 'a-identite-organisation', 0, '   ')).toEqual({ efface: true });
    expect((prisma as any).saisieNote.deleteMany).toHaveBeenCalled();
    expect((prisma as any).saisieNote.upsert).not.toHaveBeenCalled();
  });

  it('CLOISONNEMENT · un dossier SYSCOHADA ne saisit pas dans un jeu SYCEBNL', async () => {
    const s = service({ e1: [] }, [], prismaAvec([], [], [], [], Referentiel.SYSCOHADA));
    await expect(
      s.enregistrerSaisie('t', 'u', 'e1', JEU_ASSO, '2', 'a-identite-organisation', 0, 'x'),
    ).rejects.toThrow(/relève du référentiel/);
  });

  it('REFUSE un exercice qui n’est pas celui du dossier', async () => {
    const prisma = prismaAvec();
    (prisma as any).exercice.findFirst = jest.fn().mockResolvedValue(null);
    const s = service({ e1: [] }, [], prisma);
    await expect(
      s.enregistrerSaisie('t', 'u', 'e-ailleurs', JEU_ASSO, '2', 'a-identite-organisation', 0, 'x'),
    ).rejects.toThrow(/Exercice introuvable/);
  });
});

// ---------------------------------------------------------------------------
// TABLEAU D'EXÉCUTION BUDGÉTAIRE · notes 35 (associations) et 24 (projets)
// ---------------------------------------------------------------------------
describe('tableau d’exécution budgétaire · la note reprend l’état, elle ne le ressaisit pas', () => {
  const TABLEAU = {
    lignes: [
      {
        code: 'A1', libelle: 'Formation des animateurs', budget: 10_000, decaissement: 4_000,
        engagement: 1_000, realisation: 5_000, creditDisponible: 5_000, executionPourcent: 50,
      },
      {
        code: 'A2', libelle: 'Équipement', budget: 30_000, decaissement: 6_000,
        engagement: 0, realisation: 6_000, creditDisponible: 24_000, executionPourcent: 20,
      },
    ],
    total: { budget: 40_000, decaissement: 10_000, engagement: 1_000, realisation: 11_000, creditDisponible: 29_000 },
  };
  const budget = () => ({ executionBudgetaire: jest.fn().mockResolvedValue(TABLEAU) });

  it('remplit la note 35 du jeu associations, TOTAL compris', async () => {
    const s = service({ e1: [] }, [], prismaAvec(), budget());
    const n = note(await s.notesAssociations('t', 'e1'), '35');
    expect(n.applicable).toBe(true);
    expect(n.lignes.map((l: any) => l.libelle)).toEqual([
      'A1 · Formation des animateurs',
      'A2 · Équipement',
      'TOTAL',
    ]);
    // Les huit colonnes de la maquette, dans leur ordre.
    expect(n.lignes[0].saisie).toEqual(['A1', 'Formation des animateurs', 10_000, 4_000, 1_000, 5_000, 5_000, 50]);
    // Le pourcentage du TOTAL se recalcule sur les totaux · 11 000 / 40 000.
    // La moyenne des pourcentages de ligne (35 %) serait un autre nombre, et
    // un nombre faux.
    expect(n.lignes[2].saisie?.[7]).toBeCloseTo(27.5, 6);
    // Cellules VERROUILLÉES : elles viennent d'un calcul, pas du clavier.
    expect(n.lignes.every((l: any) => l.saisieVerrouillee)).toBe(true);
  });

  it('remplit la note 24 du jeu projets · même tableau, autre numéro', async () => {
    const s = service({ e1: [] }, [], prismaAvec(), budget());
    const n = note(await s.notesProjet('t', 'e1'), '24');
    expect(n.lignes).toHaveLength(3);
    expect(n.lignes[1].saisie?.[0]).toBe('A2');
  });

  it('LAISSE la note en saisie quand le dossier n’a pas de nomenclature budgétaire', async () => {
    // Le service budgétaire lève quand aucun plan analytique à budgets
    // n'existe. Ce n'est pas une erreur à remonter : une association qui ne
    // suit aucun budget n'a rien à exécuter, et la note reste telle que le
    // texte la donne.
    const s = service({ e1: [] }, [], prismaAvec());
    const n = note(await s.notesAssociations('t', 'e1'), '35');
    expect(n.lignes.map((l: any) => l.libelle)).toEqual([
      'Lignes de la nomenclature budgétaire du projet',
      'TOTAL',
    ]);
    expect(n.lignes.every((l: any) => l.saisieVerrouillee)).toBe(false);
  });

  it('un tableau entièrement à zéro ne rend PAS la note applicable', async () => {
    const vide = {
      executionBudgetaire: jest.fn().mockResolvedValue({
        lignes: [
          {
            code: 'A1', libelle: 'Formation', budget: 0, decaissement: 0, engagement: 0,
            realisation: 0, creditDisponible: 0, executionPourcent: null,
          },
        ],
        total: { budget: 0, decaissement: 0, engagement: 0, realisation: 0, creditDisponible: 0 },
      }),
    };
    const s = service({ e1: [] }, [], prismaAvec(), vide);
    expect(note(await s.notesAssociations('t', 'e1'), '35').applicable).toBe(false);
  });

  it('AUCUNE note d’exécution budgétaire pour un dossier SYSCOHADA · l’AUDCIF n’en demande pas', async () => {
    const appele = budget();
    const s = service({ e1: [] }, [], prismaAvec([], [], [], [], Referentiel.SYSCOHADA), appele);
    await s.notesSyscohada('t', 'e1');
    expect(appele.executionBudgetaire).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NOTE 33 · FICHE DE SYNTHESE DES PRINCIPAUX INDICATEURS FINANCIERS
// ---------------------------------------------------------------------------
describe('note 33 · la fiche de synthèse résume les trois états, elle ne les ressaisit pas', () => {
  /*
    Un dossier lisible à l'œil nu, choisi pour que chaque agrégat de la note
    tombe rond et que la ligne CONTRÔLE puisse être vérifiée à la main.

    LES POSTES SONT EN FRANCS, LA NOTE EN MILLIERS. Le bilan, le compte de
    résultat et le tableau de flux n'ont aucune échelle de présentation dans
    le texte : ils sortent en unités. La note 33, elle, porte en tête « (EN
    MILLIERS DE FRANCS) » (Partie 4, ch. 2, NOTE 33) · c'est la seule du
    chapitre. Le facteur mille entre les deux colonnes ci-dessous n'est donc
    pas un ornement du test : c'est la conversion elle-même, et si elle
    disparaissait, les attentes en francs ci-dessous tomberaient d'un coup.

      ACTIF        immobilisé AZ 600 000 · circulant BT 300 000 (dont HAO
                   BA 50 000, créances BC+BD+BE 250 000) ·
                   trésorerie BX 200 000                        = 1 100 000
      PASSIF       ressources propres CZ 700 000 · dettes fin. DD 100 000 ·
                   circulant DV 250 000 (dont HAO DF 40 000) ·
                   trésorerie DX 50 000                         = 1 100 000

      Ressources stables = 700 + 100 = 800 milliers
      Fonds de roulement = 800 - 600 = 200 milliers
      BF exploitation    = (300 - 50) - (250 - 40) = 250 - 210 = 40 milliers
      BF H.A.O.          = 50 - 40 = 10 milliers
      BF global          = 50 milliers
      Trésorerie nette   = 200 - 50 = 150 milliers
      CONTRÔLE           = 200 - 50 = 150 milliers  (les deux concordent)
  */
  const DOSSIER = {
    AZ: { montant: 600_000 }, BT: { montant: 300_000 }, BA: { montant: 50_000 },
    BC: { montant: 100_000 }, BD: { montant: 100_000 }, BE: { montant: 50_000 },
    BX: { montant: 200_000 },
    CZ: { montant: 700_000 }, DD: { montant: 100_000 }, DV: { montant: 250_000 }, DF: { montant: 40_000 },
    DX: { montant: 50_000 },
    XC: { montant: 120_000 }, XD: { montant: -20_000 }, XE: { montant: 100_000 },
    XB: { montant: 400_000 }, RA: { montant: 80_000 },
    TL: { montant: 60_000 }, RH: { montant: 10_000 },
    ZB: { montant: 90_000 }, ZC: { montant: -40_000 }, ZD: { montant: 30_000 }, ZE: { montant: 20_000 },
    ZF: { montant: 100_000 },
  };
  const valeurs = (n: any) => new Map(n.lignes.map((l: any) => [l.cle, l.saisie]));

  it('calcule les vingt-quatre indicateurs, et la ligne CONTRÔLE concorde', async () => {
    const s = service({ e1: [] }, [], prismaAvec(), undefined, etatsAvec(DOSSIER));
    const n = note(await s.notesAssociations('t', 'e1'), '33');
    const v = valeurs(n) as Map<string, any[]>;

    expect(v.get('resultat-des-activites-ordinaires')![0]).toBe(120);
    expect(v.get('resultat-hors-activites-ordinaires')![0]).toBe(-20);
    expect(v.get('resultat-net')![0]).toBe(100);
    expect(v.get('ressources-stables')![0]).toBe(800);
    expect(v.get('fonds-de-roulement-1')![0]).toBe(200);
    expect(v.get('actif-circulant-d-exploitation')![0]).toBe(250);
    expect(v.get('passif-circulant-d-exploitation')![0]).toBe(210);
    expect(v.get('besoin-de-financement-d-exploitation-2')![0]).toBe(40);
    expect(v.get('besoin-de-financement-hao-3')![0]).toBe(10);
    expect(v.get('besoin-de-financement-global-4-2-3')![0]).toBe(50);
    expect(v.get('tresorerie-nette-5-1-4')![0]).toBe(150);
    // La ligne que le texte prescrit comme CONTRÔLE : elle est calculée
    // autrement (trésorerie actif - trésorerie passif) et doit tomber pareil.
    expect(v.get('controle-tresorerie-nette-tresorerie-actif-treso')![0]).toBe(150);
    expect(v.get('flux-de-tresorerie-des-activites-operationnelles')![0]).toBe(90);
    // « Activités de financement (D + E) » · la maquette du TFT n'en fait
    // qu'un intitulé de section, les deux totaux ZD et ZE le composent.
    expect(v.get('flux-de-tresorerie-des-activites-de-financement')![0]).toBe(50);
    expect(v.get('variation-de-la-tresorerie-nette-de-la-periode')![0]).toBe(100);
  });

  it('applique le renvoi (a) pour la CAFG, cessions d’immobilisations comprises', async () => {
    // CAFG = résultat net + dotations - reprises + valeur comptable des
    // cessions - produits des cessions, en francs :
    // 100 000 + 60 000 - 10 000 + 35 000 - 50 000 = 135 000, soit 135 milliers.
    // Les comptes 81 et 82 ne sont pas des postes : le compte de résultat les
    // fond dans TN et TM avec le reste du H.A.O., d'où leur lecture directe.
    const lignes81et82 = [
      ligne('81100000', ClasseCompte.CLASSE_8, 35_000, 0),
      ligne('82100000', ClasseCompte.CLASSE_8, 0, 50_000),
    ];
    const s = service({ e1: lignes81et82 }, [], prismaAvec(), undefined, etatsAvec(DOSSIER));
    const n = note(await s.notesAssociations('t', 'e1'), '33');
    expect((valeurs(n) as Map<string, any[]>).get('capacite-d-autofinancement-globale-cafg')![0]).toBe(135);
  });

  it('rend les ratios en POURCENTAGE et leur variation en POINTS, jamais en pourcentage de pourcentage', async () => {
    // Renvoi (b) : « Les variations des ratios doivent être exprimées en
    // nombre de points (par exemple de 2% à 5% = 3 points). »
    // Cotisations 80 000 / charges 400 000 = 20 % en N ;
    // 50 000 / 500 000 = 10 % en N-1.
    const avecN1 = {
      ...DOSSIER,
      RA: { montant: 80_000, montantN1: 50_000 },
      XB: { montant: 400_000, montantN1: 500_000 },
    };
    const s = service({ e1: [], e0: [] }, [
      { id: 'e1', dateDebut: new Date('2026-01-01') },
      { id: 'e0', dateDebut: new Date('2025-01-01') },
    ], prismaAvec(), undefined, etatsAvec(avecN1));
    const n = note(await s.notesAssociations('t', 'e1'), '33');
    const ratio = (valeurs(n) as Map<string, any[]>).get('ratio-de-cotisations-acquises-cotisations-charge')!;
    expect(ratio[0]).toBeCloseTo(20, 6);
    expect(ratio[1]).toBeCloseTo(10, 6);
    // Variation en valeur = 10 POINTS. Et la colonne « variation en % » reste
    // VIDE : 10 points valent aussi « + 100 % du ratio », et c'est exactement
    // le nombre que le renvoi (b) interdit d'afficher là.
    expect(ratio[2]).toBeCloseTo(10, 6);
    expect(ratio[3]).toBeNull();
  });

  it('un ratio sans dénominateur n’est pas zéro · il n’a pas de valeur', async () => {
    const sansCharges = { ...DOSSIER, XB: { montant: 0 }, DV: { montant: 0 } };
    const s = service({ e1: [] }, [], prismaAvec(), undefined, etatsAvec(sansCharges));
    const v = valeurs(note(await s.notesAssociations('t', 'e1'), '33')) as Map<string, any[]>;
    expect(v.get('ratio-de-cotisations-acquises-cotisations-charge')![0]).toBeNull();
    expect(v.get('ratio-de-liquidite-generale-creances-tresorerie')![0]).toBeNull();
  });

  it('l’en-tête « (EN MILLIERS DE FRANCS) » et les montants disent la MÊME unité', async () => {
    // LE DÉFAUT QUI NE LÈVE RIEN. La maquette de la note 33 est la seule du
    // chapitre à porter une échelle de présentation (Partie 4, ch. 2, NOTE 33 :
    // FICHE DE SYNTHESE DES PRINCIPAUX INDICATEURS FINANCIERS · « (EN MILLIERS
    // DE FRANCS) »), et cette mention est transcrite telle quelle dans le
    // `renvoiOfficiel`, imprimée à l'écran comme au classeur Excel. Servir les
    // agrégats en unités sous cet en-tête ne faussait AUCUN calcul : ni un
    // total, ni la ligne CONTRÔLE, ni le recoupement avec les trois états ne
    // pouvaient le révéler. Cela publiait seulement chaque montant de la fiche
    // mille fois trop grand pour qui lit l'unité annoncée.
    const s = service({ e1: [] }, [], prismaAvec(), undefined, etatsAvec(DOSSIER));
    const n = note(await s.notesAssociations('t', 'e1'), '33');
    expect(String(n.renvoiOfficiel).startsWith('(EN MILLIERS DE FRANCS)')).toBe(true);

    const v = valeurs(n) as Map<string, any[]>;
    // Le poste XE « Résultat net » vaut 100 000 francs au compte de résultat ·
    // la note en dit 100, la même somme dans l'unité qu'elle annonce.
    expect(DOSSIER.XE.montant).toBe(100_000);
    expect(v.get('resultat-net')![0]).toBe(DOSSIER.XE.montant / 1000);
    expect(v.get('actif-immobilise')![0]).toBe(DOSSIER.AZ.montant / 1000);
    expect(v.get('flux-de-tresorerie-des-activites-operationnelles')![0]).toBe(DOSSIER.ZB.montant / 1000);

    // Un RATIO n'a pas de dimension : lui appliquer l'échelle le rendrait faux.
    // Cotisations RA 80 000 / charges XB 400 000 = 20 %, en milliers comme en
    // unités · le renvoi (b), qui veut leurs variations « en nombre de points »,
    // suppose justement que le ratio reste un pourcentage.
    expect(v.get('ratio-de-cotisations-acquises-cotisations-charge')![0]).toBeCloseTo(20, 6);
    // Créances (BC + BD + BE = 250 000) + trésorerie-actif (BX 200 000) sur
    // passif circulant (DV 250 000) = 180 %.
    expect(v.get('ratio-de-liquidite-generale-creances-tresorerie')![0]).toBeCloseTo(180, 6);
  });

  it('LAISSE en saisie le seul ratio que le texte ne rattache à aucun compte', async () => {
    const s = service({ e1: [] }, [], prismaAvec(), undefined, etatsAvec(DOSSIER));
    const n = note(await s.notesAssociations('t', 'e1'), '33');
    const enSaisie = n.lignes.filter((l: any) => !l.saisieVerrouillee).map((l: any) => l.cle);
    // « Sommes versées directement aux bénéficiaires / Sommes collectées
    // brutes » ne correspond à aucun poste ni à aucun compte du plan · le
    // calculer publierait un ratio d'efficacité que personne n'a défini.
    expect(enSaisie).toEqual(['ratio-d-utilisation-des-dons-sommes-versees-dire']);
    expect(n.lignes.filter((l: any) => l.saisieVerrouillee)).toHaveLength(24);
  });

  it('AUCUNE colonne N-1 quand le dossier n’a pas d’exercice précédent', async () => {
    const s = service({ e1: [] }, [], prismaAvec(), undefined, etatsAvec(DOSSIER));
    const n = note(await s.notesAssociations('t', 'e1'), '33');
    const v = (valeurs(n) as Map<string, any[]>).get('resultat-net')!;
    // Un premier exercice n'a pas de comparatif · un zéro y serait une
    // affirmation fausse, et la variation qui en découlerait aussi.
    expect(v[1]).toBeNull();
    expect(v[2]).toBeNull();
    expect(v[3]).toBeNull();
  });

  it('le jeu PROJETS n’a pas de note 33 · les trois états ne sont même pas demandés', async () => {
    const etats = etatsAvec(DOSSIER);
    const s = service({ e1: [] }, [], prismaAvec(), undefined, etats);
    const r = await s.notesProjet('t', 'e1');
    expect(r.notes.find((n: any) => n.code === '33')).toBeUndefined();
    expect((etats.bilan as unknown as jest.Mock)).not.toHaveBeenCalled();
  });
});
