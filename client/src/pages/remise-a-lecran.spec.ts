import { readFileSync } from 'fs';
import { join } from 'path';
import {
  libelleRemise,
  phraseAvisAcces,
  phraseEmission,
  tonRemise,
} from '../lib/remise-courriel';

/**
 * CE QUE LE SERVEUR DIT DOIT ATTEINDRE UN ÉCRAN.
 *
 * Le défaut que ces tests gèlent n'est pas une erreur de calcul : c'est une
 * correction qui vit dans la charge utile de l'API et n'arrive jamais devant
 * le comptable. POST /relances/emettre rend `misesEnFile` et `nonRemises`,
 * POST /utilisateurs rend `avis` · tant que les écrans les ignoraient,
 * l'ancienne phrase (« 20 courrier(s) préparé(s) ») restait la seule chose
 * qu'un utilisateur pouvait lire, et elle laissait croire que vingt tiers
 * avaient été touchés.
 *
 * Aucun import de « vitest » (globales) : les deux lanceurs exécutent ce
 * fichier.
 */

const lire = (chemin: string) => readFileSync(join(__dirname, chemin), 'utf8');
const relances = lire('RelancesPage.tsx');
const utilisateurs = lire('UtilisateursPage.tsx');
const brouillard = lire('BrouillardPage.tsx');
const audit = lire('JournalAuditPage.tsx');

describe("Le compte rendu d'émission des relances", () => {
  it("ne dit plus « préparés » sans dire combien sont partis à quelqu'un", () => {
    const phrase = phraseEmission({ emises: 20, misesEnFile: 3, nonRemises: 17 });
    expect(phrase).toContain('20 courriers préparés');
    expect(phrase).toContain('3 mis en file de départ');
    expect(phrase).toContain("17 n'ont pas de destinataire");
  });

  it("dit en toutes lettres quand AUCUNE lettre n'a de destinataire", () => {
    const phrase = phraseEmission({ emises: 4, misesEnFile: 0, nonRemises: 4 });
    expect(phrase).toContain('AUCUN');
    expect(phrase).toContain("ils ne sont partis à personne");
    // Ce qui serait faux : laisser croire à une remise.
    expect(phrase).not.toContain('mis en file de départ,');
  });

  it("ne fabrique pas de réserve quand tout est parti", () => {
    expect(phraseEmission({ emises: 2, misesEnFile: 2, nonRemises: 0 })).toBe(
      '2 courriers préparés · tous mis en file de départ.',
    );
  });

  it('accorde le singulier et ne prétend rien sur un lot vide', () => {
    expect(phraseEmission({ emises: 1, misesEnFile: 1, nonRemises: 0 })).toContain('1 courrier préparé');
    expect(phraseEmission({ emises: 0, misesEnFile: 0, nonRemises: 0 })).toBe('Aucun courrier préparé.');
  });

  it("est bien la phrase que l'écran affiche, et non un texte oublié dans un module", () => {
    expect(relances).toContain('phraseEmission(r)');
    expect(relances).not.toContain('courrier(s) préparé(s)');
  });
});

describe("L'état d'une remise, à l'écran", () => {
  it("ne dit JAMAIS « envoyée » d'un message que rien n'a transporté", () => {
    expect(libelleRemise({ destinataire: 'a@b.cd', statut: 'SANS_TRANSPORT', motif: null })).toBe(
      'Gardée, pas de messagerie',
    );
    expect(libelleRemise({ destinataire: null, statut: null, motif: 'x' })).toBe('Non remise');
    expect(libelleRemise({ destinataire: 'a@b.cd', statut: 'ENVOYE', motif: null })).toBe('Envoyée');
  });

  it("ne montre AUCUN nom d'énumération au comptable", () => {
    const statuts = ['EN_ATTENTE', 'SANS_TRANSPORT', 'ENVOYE', 'ECHEC', 'ABANDONNE'] as const;
    for (const statut of statuts) {
      const libelle = libelleRemise({ destinataire: 'a@b.cd', statut, motif: null });
      expect(libelle).not.toContain('_');
      expect(libelle.length).toBeGreaterThan(6);
    }
  });

  it("ne peint pas en faute ce qui est simplement gardé, ni en succès ce qui n'est parti nulle part", () => {
    expect(tonRemise({ destinataire: 'a@b.cd', statut: 'SANS_TRANSPORT', motif: null })).toBe('garde');
    expect(tonRemise({ destinataire: 'a@b.cd', statut: 'ENVOYE', motif: null })).toBe('remis');
    expect(tonRemise({ destinataire: null, statut: null, motif: 'aucune adresse' })).toBe('manque');
  });

  it("affiche le motif du serveur MOT POUR MOT, et l'état de chaque lettre", () => {
    expect(relances).toContain('libelleRemise(l.remise)');
    expect(relances).toContain('{l.remise.motif}');
  });

  it("montre la lacune d'adresse AVANT le clic, pas seulement au compte rendu", () => {
    expect(relances).toContain('!p.tiersEmail');
    expect(relances).toContain('sans adresse');
  });
});

describe("L'avis d'accès, rendu à l'administrateur qui a agi", () => {
  it("rappelle que le mot de passe n'est PAS dans l'avis, et que c'est lui qui le remet", () => {
    const phrase = phraseAvisAcces({
      avise: true,
      destinataire: 'jean@vmg.cd',
      statut: 'SANS_TRANSPORT',
      motif: null,
    });
    expect(phrase).toContain("n'y figure pas");
    expect(phrase).toContain('vous qui le remettez');
    expect(phrase).toContain("il n'est pas encore parti");
  });

  it("dit que le titulaire n'a pas été averti, avec le motif du serveur", () => {
    const phrase = phraseAvisAcces({
      avise: false,
      destinataire: 'x@@y',
      statut: null,
      motif: 'adresse inutilisable',
    });
    expect(phrase).toContain("n'a pas été averti");
    expect(phrase).toContain('adresse inutilisable');
  });

  it("ne dit rien quand le serveur ne rend pas d'avis (ancienne réponse)", () => {
    expect(phraseAvisAcces(null)).toBe('');
    expect(phraseAvisAcces(undefined)).toBe('');
  });

  it("est bien lu par la fenêtre des autorisations d'accès, sur les DEUX gestes", () => {
    expect(utilisateurs).toContain('phraseAvisAcces(cree.avis)');
    expect(utilisateurs).toContain('phraseAvisAcces(r.avis)');
    expect(utilisateurs).toContain('{avisRemis}');
  });
});

describe('Les trois grilles qui rognaient leurs dernières colonnes', () => {
  // Le garde-fou général (grilles-fixes-etroites.spec.ts) lit les attributs
  // JSX et NE SUIT PAS les variables : une grille rangée dans une constante
  // lui échappait. Ces trois pages étaient dans ce cas, sans aucun conteneur
  // défilant · la colonne de droite était coupée, sans barre pour l'atteindre.
  const pages: [string, string, string][] = [
    ['RelancesPage.tsx', relances, 'min-w-[690px]'],
    ['BrouillardPage.tsx', brouillard, 'min-w-[744px]'],
    ['JournalAuditPage.tsx', audit, 'min-w-[522px]'],
  ];

  it.each(pages)('%s porte une largeur minimale sur sa grille', (_nom, source, largeur) => {
    expect(source).toContain(largeur);
  });

  it.each(pages)('%s enferme sa grille dans un conteneur qui défile', (_nom, source) => {
    expect(source).toContain('overflow-x-auto');
  });

  it.each(pages)("%s ne laisse plus le panneau qui PORTE la grille couper au lieu de faire défiler", (_nom, source) => {
    // `overflow-hidden` sur le panneau qui porte la grille est exactement ce
    // qui rognait : la largeur minimale déborde alors sans barre. On remonte
    // du premier usage de la grille jusqu'au panneau qui l'enferme, plutôt
    // que de balayer tout le fichier · d'autres panneaux de ces pages sont
    // légitimement en `overflow-hidden` (ils ne portent aucune grille fixe).
    const lignes = source.split('\n');
    const premierUsage = lignes.findIndex((l) => l.includes('${grille}'));
    expect(premierUsage).toBeGreaterThan(0);
    const panneau = lignes
      .slice(0, premierUsage)
      .reverse()
      .find((l) => l.includes('className=') && (l.includes('bg-surface') || l.includes('border border-border')));
    expect(panneau).toBeDefined();
    expect(panneau).not.toContain('overflow-hidden');
    expect(panneau).toContain('overflow-x-auto');
  });
});
