import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compteApresChangementDeNature, compteInitial, comptesDeLaNature, motifListeComptesVide } from './provisions-compte';

/**
 * Le compte d'une provision au changement de nature. Les racines ci-dessous
 * sont des DONNÉES DE TEST recopiées de `ProvisionsService.naturesDuReferentiel`
 * (serveur), qui seul les sert à l'écran · contrat déficitaire et divers
 * risques tombent au même 1988, c'est le cas qui perdait un compte valable.
 */
const natures = [
  { nature: 'LITIGE', compte: '191', intitule: 'Provisions pour litiges' },
  { nature: 'DIVERS_RISQUES_ET_CHARGES', compte: '1988', intitule: 'Provisions pour divers risques et charges' },
  { nature: 'CONTRAT_DEFICITAIRE', compte: '1988', intitule: 'Provisions pour divers risques et charges' },
  { nature: 'IMPOTS', compte: '195', intitule: 'Provisions pour impôts' },
];
const comptes = [
  { id: 'c191a', numero: '19110000', intitule: 'Litiges A' },
  { id: 'c191b', numero: '19120000', intitule: 'Litiges B' },
  { id: 'c1988', numero: '19880000', intitule: 'Divers' },
];

describe('compte au changement de nature', () => {
  it("garde le compte quand la nouvelle nature l'admet encore, sans avis", () => {
    expect(compteApresChangementDeNature(comptes, natures, 'CONTRAT_DEFICITAIRE', 'c1988')).toEqual({ compteId: 'c1988', avis: null });
  });

  it('retire un compte devenu incompatible, en le disant', () => {
    const r = compteApresChangementDeNature(comptes, natures, 'LITIGE', 'c1988');
    expect(r.compteId).toBe('');
    expect(r.avis).toContain('19880000');
    expect(r.avis).toContain('191');
  });

  it("présélectionne le seul compte admis et dit le retrait de l'ancien", () => {
    const r = compteApresChangementDeNature(comptes, natures, 'DIVERS_RISQUES_ET_CHARGES', 'c191a');
    expect(r.compteId).toBe('c1988');
    expect(r.avis).toContain('19110000');
    expect(r.avis).toContain('présélectionné');
  });

  it("présélectionne sans parler de retrait quand aucun compte n'était choisi", () => {
    const r = compteApresChangementDeNature(comptes, natures, 'DIVERS_RISQUES_ET_CHARGES', '');
    expect(r.compteId).toBe('c1988');
    expect(r.avis).not.toContain('retiré');
  });

  it('ne présélectionne rien quand plusieurs comptes conviennent', () => {
    expect(compteApresChangementDeNature(comptes, natures, 'LITIGE', '')).toEqual({ compteId: '', avis: null });
  });

  it('une nature interdite (non servie) retire le compte en disant pourquoi', () => {
    const r = compteApresChangementDeNature(comptes, natures, 'GROSSES_REPARATIONS', 'c191a');
    expect(r.compteId).toBe('');
    expect(r.avis).toContain('ne se comptabilise pas');
  });

  it('un plan non lu ne retire rien', () => {
    expect(compteApresChangementDeNature(null, natures, 'LITIGE', 'c1988')).toEqual({ compteId: 'c1988', avis: null });
  });
});

describe('création et liste', () => {
  it("présélectionne à l'ouverture le seul compte admis, jamais un parmi plusieurs", () => {
    expect(compteInitial(comptes, natures, 'DIVERS_RISQUES_ET_CHARGES')).toBe('c1988');
    expect(compteInitial(comptes, natures, 'LITIGE')).toBe('');
    expect(compteInitial(null, natures, 'DIVERS_RISQUES_ET_CHARGES')).toBe('');
  });

  it('garde le compte courant lisible même hors racine', () => {
    expect(comptesDeLaNature(comptes, natures, 'LITIGE', 'c1988').map((c) => c.id)).toEqual(['c191a', 'c191b', 'c1988']);
  });

  it('dit pourquoi la liste est vide et quoi faire, et ne confond pas non lu et vide', () => {
    expect(motifListeComptesVide(comptes, null, natures, 'LITIGE')).toBeNull();
    expect(motifListeComptesVide(comptes, null, natures, 'IMPOTS')).toContain('195');
    expect(motifListeComptesVide(comptes, null, natures, 'IMPOTS')).toContain('plan de comptes');
    expect(motifListeComptesVide(null, 'Erreur réseau', natures, 'IMPOTS')).toContain('Erreur réseau');
    expect(motifListeComptesVide(null, null, natures, 'IMPOTS')).not.toContain('Aucun');
    expect(motifListeComptesVide([], null, natures, 'PERTES_OPERATIONNELLES_FUTURES')).toContain('ne se comptabilise pas');
  });
});

describe('câblage de la fenêtre', () => {
  const page = readFileSync(join(__dirname, '../pages/ProvisionsPage.tsx'), 'utf8');
  it("le changement de nature passe par la règle, et ne vide plus le compte d'office", () => {
    expect(page).toContain('compteApresChangementDeNature(comptes, naturesServies, e.target.value, edition.f.compteId)');
    expect(page).toContain('motifListeComptesVide(comptes, erreurComptes, naturesServies, edition.f.nature)');
    expect(page).toContain('compteInitial(comptes, naturesServies, nature)');
    // Le résultat de la règle est POSÉ · remettre `champ('compteId', '')` à côté
    // de l'appel rétablirait le défaut sans faire tomber les tests de la règle.
    expect(page).toContain("champ('compteId', choix.compteId)");
    expect(page).not.toContain("champ('compteId', '')");
  });

  it('le formulaire relit le plan à son ouverture et présélectionne une fois le plan arrivé', () => {
    const corps = (nom: string) => {
      const debut = page.indexOf(`function ${nom}(`);
      const fin = page.indexOf('\n  }\n', debut);
      return page.slice(debut, fin);
    };
    expect(corps('ouvrirCreation')).toContain('lireComptes()');
    expect(corps('ouvrirCreation')).toContain('compteInitial(l, naturesServies, ed.f.nature)');
    expect(corps('ouvrirModification')).toContain('lireComptes()');
  });
});
