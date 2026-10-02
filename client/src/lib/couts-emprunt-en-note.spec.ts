import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOTE_INFORMATIONS_OBLIGATOIRES,
  RUBRIQUES_VOISINES,
  etatEncadreCoutsEmprunt,
  justificationsPeriodeCourte,
  type CoutsEmpruntDeLExercice,
} from './couts-emprunt-en-note';

/**
 * DÉCISION D1 · les coûts d'emprunt incorporés MONTRÉS à côté des rubriques
 * libres de la note « Informations obligatoires », jamais écrits à la place
 * du cabinet (AUDCIF Titre VIII ch. 7, § 1.2 et section 3).
 */
const client = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');
const serveur = (chemin: string) => readFileSync(join(__dirname, '../../../src', chemin), 'utf8');

const ligne = (o: Partial<CoutsEmpruntDeLExercice['lignes'][number]> = {}): CoutsEmpruntDeLExercice['lignes'][number] => ({
  id: 'l1',
  immobilisation: { id: 'b1', designation: 'Entrepôt' },
  nature: 'SPECIFIQUE',
  dateDebut: '2026-04-01',
  dateFin: '2026-12-31',
  mois: 9,
  base: 10_000_000,
  tauxPourcent: 12,
  produitsPlacement: 0,
  montant: 900_000,
  justificationPeriodeCourte: null,
  ...o,
});

/** Le bloc d'une note dans sa table · du `code` jusqu'au code suivant. */
function blocDeLaNote(source: string, code: string): string {
  const debut = source.indexOf(`code: '${code}',\n    titre: 'INFORMATIONS OBLIGATOIRES'`);
  expect(debut).toBeGreaterThan(-1);
  const fin = source.indexOf("\n    code: '", debut + 1);
  return source.slice(debut, fin === -1 ? undefined : fin);
}

describe('la note « Informations obligatoires » de chaque jeu', () => {
  it('porte le numéro écrit ici, et les rubriques voisines y existent', () => {
    const tables = {
      SYSCOHADA: serveur('modules/etats-financiers-syscohada/correspondance-notes-syscohada-1.ts'),
      ASSOCIATIONS: serveur('modules/notes-annexes/correspondance-notes-associations.ts'),
      PROJETS: serveur('modules/notes-annexes/correspondance-notes-projets.ts'),
    } as const;
    for (const jeu of Object.keys(tables) as Array<keyof typeof tables>) {
      const bloc = blocDeLaNote(tables[jeu], NOTE_INFORMATIONS_OBLIGATOIRES[jeu]);
      for (const cle of RUBRIQUES_VOISINES[jeu]) {
        expect({ jeu, cle, presente: bloc.includes(`cle: '${cle}'`) }).toEqual({ jeu, cle, presente: true });
      }
    }
    // Un même titre sous deux numéros · NOTE 1 chez les projets.
    expect(NOTE_INFORMATIONS_OBLIGATOIRES.PROJETS).toBe('1');
    expect(NOTE_INFORMATIONS_OBLIGATOIRES.ASSOCIATIONS).toBe('2');
    expect(NOTE_INFORMATIONS_OBLIGATOIRES.SYSCOHADA).toBe('2');
  });
});

describe('etatEncadreCoutsEmprunt · null n’est pas vide, un échec se dit', () => {
  it('chargement, erreur, absent, encadré', () => {
    expect(etatEncadreCoutsEmprunt(null, null)).toEqual({ type: 'chargement' });
    expect(etatEncadreCoutsEmprunt(null, 'Licence suspendue')).toEqual({ type: 'erreur', motif: 'Licence suspendue' });
    // Rien d'incorporé · aucune information à fournir, l'encadré n'apparaît pas.
    expect(etatEncadreCoutsEmprunt({ lignes: [], total: 0, tronque: false }, null)).toEqual({ type: 'absent' });
    const lu = { lignes: [ligne()], total: 900_000, tronque: false };
    expect(etatEncadreCoutsEmprunt(lu, null)).toEqual({ type: 'encadre', lu });
  });

  it('une liste tronquée à vide mais au total non nul reste montrée', () => {
    expect(etatEncadreCoutsEmprunt({ lignes: [], total: 5, tronque: true }, null).type).toBe('encadre');
  });

  it('l’erreur l’emporte sur une liste déjà lue', () => {
    expect(etatEncadreCoutsEmprunt({ lignes: [ligne()], total: 1, tronque: false }, 'refus').type).toBe('erreur');
  });
});

describe('justificationsPeriodeCourte · § 1.2', () => {
  it('rend les justifications écrites, une par bien et par texte, sans les vides', () => {
    const lu: CoutsEmpruntDeLExercice = {
      lignes: [
        ligne({ id: 'a', justificationPeriodeCourte: 'Préparation de huit mois, montant significatif' }),
        ligne({ id: 'b', justificationPeriodeCourte: 'Préparation de huit mois, montant significatif' }),
        ligne({ id: 'c', justificationPeriodeCourte: '   ' }),
        ligne({ id: 'd', immobilisation: { id: 'b2', designation: 'Atelier' } }),
      ],
      total: 3_600_000,
      tronque: false,
    };
    expect(justificationsPeriodeCourte(lu)).toEqual([
      { designation: 'Entrepôt', justification: 'Préparation de huit mois, montant significatif' },
    ]);
  });
});

describe('l’encadré · lecture seule, aux deux référentiels, sur la bonne note', () => {
  const composant = client('components/CoutsEmpruntEnNote.tsx');

  it('lit la route du serveur, qui existe et exige l’exercice', () => {
    expect(composant).toContain('/immobilisations/couts-emprunt-incorpores?exerciceId=');
    const controleur = serveur('modules/immobilisations/immobilisation.controller.ts');
    expect(controleur).toContain("@Controller('immobilisations')");
    const route = controleur.slice(controleur.indexOf("@Get('couts-emprunt-incorpores')"));
    expect(route.slice(0, route.indexOf('}'))).toContain('EXERCICE_REQUIS');
  });

  it('n’écrit rien · aucun appel d’écriture, aucune saisie de note reçue', () => {
    // On gèle les appels et la STRUCTURE des propriétés reçues, jamais
    // l'absence d'un mot (que le commentaire qui explique emploierait).
    const appels = [...composant.matchAll(/\bapi\s*\.\s*(\w+)/g)].map((m) => m[1]);
    expect(appels).toEqual(['get']);
    const signature = /export function CoutsEmpruntEnNote\(\{([^}]*)\}/.exec(composant);
    expect(signature?.[1].split(',').map((s) => s.trim()).filter(Boolean)).toEqual(['exerciceId', 'referentiel']);
  });

  it('chaque écran le montre sous la note « Informations obligatoires » de son jeu', () => {
    const syscohada = client('pages/NotesAnnexesSyscohadaPage.tsx');
    expect(syscohada).toMatch(
      /codeSelectionne === NOTE_INFORMATIONS_OBLIGATOIRES\.SYSCOHADA && \(\s*<CoutsEmpruntEnNote [^>]*referentiel="SYSCOHADA"/,
    );
    const sycebnl = client('pages/NotesAnnexesPage.tsx');
    expect(sycebnl).toMatch(
      /codeSelectionne === \(jeuProjet \? NOTE_INFORMATIONS_OBLIGATOIRES\.PROJETS : NOTE_INFORMATIONS_OBLIGATOIRES\.ASSOCIATIONS\) && \(\s*<CoutsEmpruntEnNote [^>]*referentiel="SYCEBNL"/,
    );
  });

  it('les montants passent par lib/montants.ts', () => {
    expect(composant).toContain("from '../lib/montants'");
    expect(composant).toContain('montant(etat.lu.total)');
  });
});
