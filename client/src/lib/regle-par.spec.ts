import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ContrepartieAdmise } from './compte-du-bien';
import { adresseContrepartiesAdmises, contrepartiesCommunes, etatReglePar } from './regle-par';

// Aucun import de « vitest » · convention du dépôt, les globals suffisent.

/**
 * LES LISTES « RÉGLÉ PAR » proposaient tout le plan de détail · le serveur
 * refusait ensuite ce que l'écran avait proposé. Elles servent désormais la
 * liste fermée du serveur pour chaque bien, leur intersection s'il y en a
 * plusieurs, et disent pourquoi elles sont vides.
 */
const compte = (id: string, numero: string, mode: string | null = null): ContrepartieAdmise => ({
  id,
  numero,
  intitule: `Compte ${numero}`,
  mode,
  libelleMode: mode,
});

describe('adresseContrepartiesAdmises · la liste fermée que le serveur calcule', () => {
  it('vise le compte du bien en priorité, sinon la famille, avec le type du composant', () => {
    expect(adresseContrepartiesAdmises({ compteImmobilisationId: 'c1' })).toBe(
      '/immobilisations/contreparties-acquisition?compteImmobilisationId=c1',
    );
    expect(adresseContrepartiesAdmises({ familleId: 'f1', typeComposant: 'DEMANTELEMENT' })).toBe(
      '/immobilisations/contreparties-acquisition?familleId=f1&typeComposant=DEMANTELEMENT',
    );
    // Le serveur refuse les deux identifiants ensemble · un seul part.
    expect(adresseContrepartiesAdmises({ compteImmobilisationId: 'c1', familleId: 'f1' })).toBe(
      '/immobilisations/contreparties-acquisition?compteImmobilisationId=c1',
    );
  });

  it("rend null tant que le bien n'est pas désigné", () => {
    expect(adresseContrepartiesAdmises({})).toBeNull();
    expect(adresseContrepartiesAdmises({ compteImmobilisationId: null, typeComposant: 'COMPOSANT' })).toBeNull();
  });
});

describe('contrepartiesCommunes · un même compte crédité pour chaque fiche', () => {
  it("garde les seuls comptes admis pour TOUS les biens, dans l'ordre de la première liste", () => {
    const tresorerie = compte('t', '52110000');
    const fournisseurCorporel = compte('fc', '48120000');
    const fournisseurIncorporel = compte('fi', '48110000');
    expect(
      contrepartiesCommunes([
        [tresorerie, fournisseurCorporel],
        [fournisseurIncorporel, tresorerie],
      ]),
    ).toEqual([tresorerie]);
  });

  it("null tant qu'une liste n'est pas lue · une intersection sur une liste manquante dirait « aucun » à tort", () => {
    expect(contrepartiesCommunes([[compte('t', '52110000')], null])).toBeNull();
    expect(contrepartiesCommunes([])).toBeNull();
  });
});

describe('etatReglePar · une liste qui dépend d’un choix dit pourquoi elle est vide', () => {
  const cible = { compteImmobilisationId: 'c1' };

  it('le bien non désigné · la liste est vide et dit quoi faire d’abord', () => {
    const e = etatReglePar([{ compteImmobilisationId: null }], [null], null);
    expect(e.options).toEqual([]);
    expect(e.enLecture).toBe(false);
    expect(e.motif).toMatch(/^Choisissez d'abord le compte du bien/);
    expect(etatReglePar([cible, { compteImmobilisationId: '' }], [null, null], null).motif).toMatch(
      /^Choisissez d'abord le compte de chaque bien/,
    );
  });

  it('pendant la lecture · rien proposé, rien affirmé', () => {
    const e = etatReglePar([cible], [null], null);
    expect(e).toEqual({ options: [], preselection: null, enLecture: true, motif: null });
  });

  it("un échec de lecture se dit, il n'est jamais lu comme une liste vide", () => {
    const e = etatReglePar([cible], [null], 'Compte du bien introuvable pour ce dossier');
    expect(e.options).toEqual([]);
    expect(e.motif).toBe('Comptes de règlement illisibles · Compte du bien introuvable pour ce dossier');
  });

  it("aucun compte admis · la raison et ce qu'il faut ouvrir d'abord", () => {
    expect(etatReglePar([cible], [[]], null).motif).toMatch(/aucun compte que la fiche du compte du bien admet/);
    expect(etatReglePar([cible, { compteImmobilisationId: 'c2' }], [[compte('a', '48110000')], [compte('b', '48120000')]], null).motif).toMatch(
      /admis à la fois pour tous ces biens/,
    );
  });

  it('un seul compte admis se présélectionne ; plusieurs, aucun', () => {
    const t = compte('t', '52110000');
    expect(etatReglePar([cible], [[t]], null)).toEqual({ options: [t], preselection: 't', enLecture: false, motif: null });
    const deux = etatReglePar([cible], [[t, compte('f', '48120000')]], null);
    expect(deux.preselection).toBeNull();
    expect(deux.options).toHaveLength(2);
  });
});

describe('les écrans · aucune liste « Réglé par » ne sert le plan entier', () => {
  const racine = join(__dirname, '..');
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) return fichiers(chemin);
      return /\.tsx$/.test(nom) && !/\.spec\./.test(nom) ? [chemin] : [];
    });

  it('chaque champ « Réglé par » est le ChampReglePar, dans son propre élément label', () => {
    const occurrences: string[] = [];
    for (const f of fichiers(racine)) {
      const src = readFileSync(f, 'utf8');
      let i = src.indexOf('Réglé par\n');
      while (i !== -1) {
        // Le champ est l'élément label qui porte le libellé · on lit son
        // contenu jusqu'à sa fermeture, jamais une distance en caractères.
        const ouverture = src.lastIndexOf('<label', i);
        const fermeture = src.indexOf('</label>', i);
        const element = src.slice(ouverture, fermeture);
        occurrences.push(f);
        expect({ fichier: f, champ: /<ChampReglePar\b/.test(element) }).toEqual({ fichier: f, champ: true });
        i = src.indexOf('Réglé par\n', i + 1);
      }
    }
    // Le recensement trouve encore quelque chose · trois opérations sur un bien.
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });

  it('les trois opérations passent par la garde dont le serveur sert la liste', () => {
    const service = readFileSync(join(__dirname, '../../../src/modules/immobilisations/immobilisation.service.ts'), 'utf8');
    const corps = (nom: string) => {
      const debut = service.indexOf(`  async ${nom}(`);
      expect(debut).toBeGreaterThan(-1);
      const suite = service.indexOf('\n  async ', debut + 1);
      return service.slice(debut, suite === -1 ? undefined : suite);
    };
    // La liste servie et le refus lisent la même règle.
    expect(corps('contrepartiesAcquisition')).toMatch(/racinesContrepartieAcquisition\(/);
    expect(corps('creer')).toMatch(/motifRefusContrepartie\(/);
    // Le renouvellement passe par `creer`, le remplacement par le renouvellement.
    expect(corps('renouveler')).toMatch(/this\.creer\(/);
    expect(corps('remplacerPartieNonIdentifiee')).toMatch(/this\.renouveler\(/);
    // Le prix global vérifie la contrepartie bien par bien.
    expect(corps('acquerirAPrixGlobal')).toMatch(/motifRefusContrepartie\(referentiel, b\.numero, contrepartie\.numero\)/);
  });
});
