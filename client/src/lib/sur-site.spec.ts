import { readFileSync } from 'fs';
import { join } from 'path';
import { creationPremierDossierProposee, licenceABloquer, porteInscription, resumeLicence, type EtatSurSite } from './sur-site';

const L = { numero: 'OMX-1', titulaire: 'ASBL X', emiseLe: '2026-09-26', finMaintenance: '2027-09-26', expiration: null, dossiersMax: 3 };

describe('installation sur site · écran d’ouverture', () => {
  it('dit perpétuelle ou la date d’expiration, et toujours la fin de maintenance', () => {
    expect(resumeLicence(L)).toContain('perpétuelle');
    expect(resumeLicence(L)).toContain("mises à jour jusqu'au 2027-09-26");
    expect(resumeLicence({ ...L, expiration: '2027-01-31' })).toContain("valable jusqu'au 2027-01-31");
  });

  it('bloque tout statut autre que VALIDE, et rien en ligne', () => {
    expect(licenceABloquer({ surSite: true, statut: 'ABSENTE' })).toBe(true);
    expect(licenceABloquer({ surSite: true, statut: 'EXPIREE' })).toBe(true);
    expect(licenceABloquer({ surSite: true, statut: 'VALIDE' })).toBe(false);
    expect(licenceABloquer({ surSite: false })).toBe(false);
  });

  it('ne propose la création qu’au poste sans dossier, licence valide (audit final F44)', () => {
    expect(creationPremierDossierProposee({ surSite: true, statut: 'VALIDE', premierDossierAttendu: true })).toBe(true);
    expect(creationPremierDossierProposee({ surSite: true, statut: 'VALIDE', premierDossierAttendu: false })).toBe(false);
    // Un serveur d'avant F44 ne rend pas le champ · pas de lien vers une porte qu'on ne connaît pas.
    expect(creationPremierDossierProposee({ surSite: true, statut: 'VALIDE' })).toBe(false);
    expect(creationPremierDossierProposee({ surSite: true, statut: 'ABSENTE', premierDossierAttendu: true })).toBe(false);
  });
});

/**
 * /inscription DISTINGUE LES DEUX INSTALLATIONS (audit final F251). La page se
 * disait reliée à aucun bouton · vrai en ligne, faux sur site, où l'écran
 * d'ouverture y renvoie tant que le poste n'a aucun dossier.
 */
describe('la porte /inscription, en ligne et sur site', () => {
  it('en ligne, la porte de service · le serveur tranche', () => {
    expect(porteInscription({ surSite: false })).toEqual({ mode: 'EN_LIGNE' });
  });

  it('sur site, la porte du premier dossier tant que le poste n’en a aucun', () => {
    expect(porteInscription({ surSite: true, statut: 'VALIDE', premierDossierAttendu: true })).toEqual({
      mode: 'SUR_SITE_PREMIER_DOSSIER',
    });
  });

  it('sur site, fermée une fois le premier dossier né, et la voie est nommée', () => {
    const p = porteInscription({ surSite: true, statut: 'VALIDE', premierDossierAttendu: false });
    expect(p.mode).toBe('SUR_SITE_FERMEE');
    expect(p.mode === 'SUR_SITE_FERMEE' && p.motif).toContain('fenêtre Restitution');
  });

  it('sur site, fermée tant que la licence ne vaut pas ici, et la voie est nommée', () => {
    const p = porteInscription({ surSite: true, statut: 'ABSENTE', premierDossierAttendu: true });
    expect(p.mode).toBe('SUR_SITE_FERMEE');
    expect(p.mode === 'SUR_SITE_FERMEE' && p.motif).toContain("écran d'ouverture");
  });

  it('la page s’ouvre exactement là où l’écran d’ouverture propose le lien', () => {
    const etats: EtatSurSite[] = [
      { surSite: true, statut: 'VALIDE', premierDossierAttendu: true },
      { surSite: true, statut: 'VALIDE', premierDossierAttendu: false },
      { surSite: true, statut: 'VALIDE' },
      { surSite: true, statut: 'ABSENTE', premierDossierAttendu: true },
      { surSite: true, statut: 'EXPIREE', premierDossierAttendu: false },
    ];
    for (const e of etats) {
      expect(porteInscription(e).mode === 'SUR_SITE_PREMIER_DOSSIER').toBe(creationPremierDossierProposee(e));
    }
  });

  it('la page lit l’état, et la porte fermée rend son motif AVANT l’assistant', () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'RegisterPage.tsx'), 'utf8');
    expect(page).toContain(".get<EtatSurSite>('/sur-site/etat')");
    expect(page).toContain('setPorte(porteInscription(e))');
    const branche = page.indexOf("if (porte.mode === 'SUR_SITE_FERMEE') {");
    const assistant = page.indexOf('<NouveauFichierWizard');
    expect(branche).toBeGreaterThan(-1);
    expect(assistant).toBeGreaterThan(branche);
    const fermee = page.slice(branche, assistant);
    expect(fermee).toContain('{porte.motif}');
    expect(fermee).toContain('href="#/connexion"');
  });
});
