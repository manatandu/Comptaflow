import { creationPremierDossierProposee, licenceABloquer, resumeLicence } from './sur-site';

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
