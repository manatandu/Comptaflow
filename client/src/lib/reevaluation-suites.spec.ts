import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOTE_DES_REEVALUATIONS,
  etatEncadreReevaluations,
  natureDeLaReevaluation,
  reserveExigee,
  reservePreselectionnee,
  sortsDuType,
  type EcartALaSortie,
  type NoteReevaluations,
} from './reevaluation-suites';

/**
 * LIGNE A15 · les suites d'une réévaluation à l'écran · aucune règle n'y est
 * refaite, l'écran lit ce que le serveur sert (AUDCIF Titre VIII ch. 28 § 6 et
 * § 8 ; loi n° 23/053, art. 133, 135 à 137).
 */
const client = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');
const serveur = (chemin: string) => readFileSync(join(__dirname, '../../../src', chemin), 'utf8');

const note = (o: Partial<NoteReevaluations> = {}): NoteReevaluations => ({
  referentiel: 'SYSCOHADA',
  codeNote: '3E',
  motifSansObjet: null,
  reevaluations: [
    {
      id: 'r1',
      type: 'LEGALE',
      methodeLibre: null,
      neutraliteFiscale: false,
      dateReevaluation: '2025-12-31',
      decision: 'CA',
      traitementFiscal: 'non imposé',
      methodeEvaluation: 'indiciaire',
      totalEcart: 70,
    },
  ],
  postes: [],
  sortis: [],
  total: null,
  tronque: false,
  ...o,
});

describe('l’encadré des réévaluations · null n’est pas vide, un échec se dit', () => {
  it('chargement, erreur, sans objet, absent, encadré', () => {
    expect(etatEncadreReevaluations(null, null)).toEqual({ type: 'chargement' });
    expect(etatEncadreReevaluations(null, 'refus')).toEqual({ type: 'erreur', motif: 'refus' });
    expect(etatEncadreReevaluations(note({ codeNote: null, motifSansObjet: 'Titre X' }), null)).toEqual({ type: 'sansObjet', motif: 'Titre X' });
    // Aucune réévaluation · rien à dire, l'encadré n'apparaît pas.
    expect(etatEncadreReevaluations(note({ reevaluations: [] }), null)).toEqual({ type: 'absent' });
    const lu = note();
    expect(etatEncadreReevaluations(lu, null)).toEqual({ type: 'encadre', lu });
  });
  it('l’erreur l’emporte sur une note déjà lue', () => {
    expect(etatEncadreReevaluations(note(), 'refus').type).toBe('erreur');
  });
});

describe('la nature de la réévaluation, telle que la décision la nomme', () => {
  it('légale, légale avec provision spéciale, libre par ajustement ou par élimination', () => {
    expect(natureDeLaReevaluation({ type: 'LEGALE', methodeLibre: null, neutraliteFiscale: false })).toBe('Réévaluation légale');
    expect(natureDeLaReevaluation({ type: 'LEGALE', methodeLibre: null, neutraliteFiscale: true })).toMatch(/provision spéciale/);
    expect(natureDeLaReevaluation({ type: 'LIBRE', methodeLibre: 'ELIMINATION', neutraliteFiscale: false })).toMatch(/élimination/);
    expect(natureDeLaReevaluation({ type: 'LIBRE', methodeLibre: 'AJUSTEMENT', neutraliteFiscale: false })).toMatch(/ajustement/);
  });
});

describe('la réserve à la sortie · demandée quand le serveur l’exige, jamais devinée', () => {
  const lu: EcartALaSortie = {
    cession: [{ ligneId: 'a', compteEcart: '10610000', montant: 10, traitement: 'RESERVE', motif: null }],
    miseHorsService: [{ ligneId: 'b', compteEcart: '15400000', montant: 5, traitement: 'NON_PASSE', motif: 'ne tranchent pas' }],
  };
  it('selon le type de sortie choisi', () => {
    expect(reserveExigee(sortsDuType(lu, 'CESSION'))).toBe(true);
    expect(reserveExigee(sortsDuType(lu, 'MISE_HORS_SERVICE'))).toBe(false);
    expect(sortsDuType(null, 'CESSION')).toBeNull();
    expect(reserveExigee(null)).toBe(false);
  });
  it('un choix unique se présélectionne, jamais plusieurs', () => {
    expect(reservePreselectionnee([{ id: 'x' }])).toBe('x');
    expect(reservePreselectionnee([{ id: 'x' }, { id: 'y' }])).toBeNull();
    expect(reservePreselectionnee(null)).toBeNull();
  });
});

describe('câblage', () => {
  it('l’encadré vit sur la NOTE 3E au SYSCOHADA et la NOTE 5H des associations, dont les tables portent bien ces codes', () => {
    expect(NOTE_DES_REEVALUATIONS).toEqual({ SYSCOHADA: '3E', ASSOCIATIONS: '5H' });
    expect(serveur('modules/etats-financiers-syscohada/correspondance-notes-syscohada-1.ts')).toMatch(/code: '3E',\n\s+titre: "INFORMATIONS SUR LES RÉÉVALUATIONS/);
    expect(serveur('modules/notes-annexes/correspondance-notes-associations.ts')).toMatch(/code: '5H',\n\s+titre: "INFORMATIONS SUR LES REEVALUATIONS/);
    expect(client('pages/NotesAnnexesSyscohadaPage.tsx')).toMatch(/codeSelectionne === NOTE_DES_REEVALUATIONS\.SYSCOHADA && \(\s*<ReevaluationsEnNote/);
    expect(client('pages/NotesAnnexesPage.tsx')).toMatch(/!jeuProjet && codeSelectionne === NOTE_DES_REEVALUATIONS\.ASSOCIATIONS && \(\s*<ReevaluationsEnNote/);
  });
  it('l’encadré ne fait que lire · aucun appel d’écriture', () => {
    const source = client('components/ReevaluationsEnNote.tsx');
    expect(source).toMatch(/api\.get</);
    expect(source).not.toMatch(/api\.(post|put|patch|delete)\b/);
  });
  it('la sortie, l’échange et le renouvellement envoient la réserve choisie', () => {
    const page = client('pages/ImmobilisationsPage.tsx');
    expect(page.match(/compteReserveEcartId: sCompteReserve/g)?.length).toBe(2);
    expect(client('components/EchangeImmobilisation.tsx')).toMatch(/compteReserveEcartId: compteReserve/);
  });
});
