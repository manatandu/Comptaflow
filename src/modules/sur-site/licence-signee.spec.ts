import { generateKeyPairSync } from 'crypto';
import { ContenuLicence, empreinteDe, FORMAT_LICENCE, motifRefusContenu, serialiser, signerLicence, verifierLicence } from './licence-signee';

/**
 * LA LICENCE SIGNÉE · chaque statut sur un fichier réellement signé par une
 * paire Ed25519 fabriquée pour le test. Aucun statut n'est obtenu en
 * trafiquant le moteur : on trafique le FICHIER, comme le ferait un client.
 */
const paire = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { prive: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), public: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
};
const VMG = paire();
const PIRATE = paire();
const POSTE = empreinteDe('3f1c2b7a-0000-4b5e-9a1d-poste-du-client');
const CONTENU: ContenuLicence = {
  format: FORMAT_LICENCE,
  numero: 'OMX-2026-0001',
  titulaire: 'ASBL Lumière du Kasaï',
  empreinteMachine: POSTE,
  emiseLe: '2026-09-26',
  finMaintenance: '2027-09-26',
  expiration: null,
  dossiersMax: 3,
};
const texte = (c: ContenuLicence = CONTENU, cle = VMG.prive) => JSON.stringify(signerLicence(c, cle));
const ctx = (p: Partial<Parameters<typeof verifierLicence>[1]> = {}) => ({
  clePubliquePem: VMG.public,
  empreinte: POSTE,
  aujourdhui: '2026-10-01',
  horlogeMax: '2026-09-30',
  dateVersion: '2026-09-26',
  ...p,
});

describe('licence sur site · signée par VMG, vérifiée sans internet', () => {
  it('une licence authentique, pour ce poste, dans ses dates, vaut', () => {
    const v = verifierLicence(texte(), ctx());
    expect(v).toMatchObject({ statut: 'VALIDE', motif: null });
    expect(v.contenu).toEqual(CONTENU);
  });

  it('modifier une seule valeur du fichier casse la signature · le plafond de dossiers comme la date', () => {
    const f = JSON.parse(texte());
    f.contenu.dossiersMax = 50;
    expect(verifierLicence(JSON.stringify(f), ctx()).statut).toBe('SIGNATURE_INVALIDE');
    const g = JSON.parse(texte());
    g.contenu.finMaintenance = '2099-12-31';
    expect(verifierLicence(JSON.stringify(g), ctx()).statut).toBe('SIGNATURE_INVALIDE');
  });

  it('une licence signée par une AUTRE clé ne vaut pas · on ne se signe pas sa licence', () => {
    expect(verifierLicence(texte(CONTENU, PIRATE.prive), ctx()).statut).toBe('SIGNATURE_INVALIDE');
  });

  it('l’ordre des clés du fichier ne compte pas · un fichier réécrit par un éditeur reste authentique', () => {
    const f = JSON.parse(texte());
    const inverse = Object.fromEntries(Object.entries(f.contenu).reverse());
    expect(verifierLicence(JSON.stringify({ signature: f.signature, contenu: inverse }), ctx()).statut).toBe('VALIDE');
  });

  it('copiée sur un autre poste, elle ne vaut rien · mais dit à qui elle appartient', () => {
    const v = verifierLicence(texte(), ctx({ empreinte: empreinteDe('autre-poste') }));
    expect(v.statut).toBe('AUTRE_MACHINE');
    expect(v.contenu?.numero).toBe('OMX-2026-0001');
  });

  it('l’horloge remontée de plus d’un jour est dénoncée ; un jour de dérive est toléré', () => {
    expect(verifierLicence(texte(), ctx({ aujourdhui: '2026-09-28', horlogeMax: '2026-09-30' })).statut).toBe('HORLOGE_RECULEE');
    expect(verifierLicence(texte(), ctx({ aujourdhui: '2026-09-29', horlogeMax: '2026-09-30' })).statut).toBe('VALIDE');
  });

  it('une licence à expiration vaut jusqu’à son dernier jour inclus', () => {
    const c = { ...CONTENU, expiration: '2026-10-31' };
    expect(verifierLicence(texte(c), ctx({ aujourdhui: '2026-10-31' })).statut).toBe('VALIDE');
    expect(verifierLicence(texte(c), ctx({ aujourdhui: '2026-11-01', horlogeMax: '2026-10-31' })).statut).toBe('EXPIREE');
  });

  it('la maintenance borne les VERSIONS, pas l’usage · une version publiée après sa fin ne tourne pas', () => {
    expect(verifierLicence(texte(), ctx({ dateVersion: '2027-09-26' })).statut).toBe('VALIDE');
    const v = verifierLicence(texte(), ctx({ dateVersion: '2027-09-27' }));
    expect(v.statut).toBe('VERSION_NON_COUVERTE');
    expect(v.motif).toContain('2027-09-26');
    // Et une licence perpétuelle reste valable des années plus tard sur une version couverte.
    expect(verifierLicence(texte(), ctx({ aujourdhui: '2031-01-01', horlogeMax: '2031-01-01' })).statut).toBe('VALIDE');
  });

  it('sans date de version, la couverture ne se vérifie pas · refus plutôt que présomption', () => {
    expect(verifierLicence(texte(), ctx({ dateVersion: null })).statut).toBe('VERSION_INCONNUE');
  });

  it('sans clé publique dans le code, rien ne vaut · et sans fichier, on le dit', () => {
    expect(verifierLicence(texte(), ctx({ clePubliquePem: null })).statut).toBe('CLE_EDITEUR_ABSENTE');
    expect(verifierLicence(null, ctx()).statut).toBe('ABSENTE');
    expect(verifierLicence('pas du json', ctx()).statut).toBe('ILLISIBLE');
  });

  it('un contenu irrecevable ne se signe pas', () => {
    expect(() => signerLicence({ ...CONTENU, dossiersMax: 0 }, VMG.prive)).toThrow(/dossiers/);
    expect(motifRefusContenu({ ...CONTENU, empreinteMachine: 'abc' })).toMatch(/empreinte/);
    expect(motifRefusContenu({ ...CONTENU, finMaintenance: '2026-01-01' })).toMatch(/fin de maintenance antérieure/);
    expect(motifRefusContenu({ ...CONTENU, expiration: '2026-01-01' })).toMatch(/expiration antérieure/);
    expect(motifRefusContenu(CONTENU)).toBeNull();
  });

  it('l’empreinte est propre à OmegaX, stable, et insensible à la casse de l’identifiant', () => {
    expect(empreinteDe('ABC-def')).toBe(empreinteDe(' abc-DEF '));
    expect(empreinteDe('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(serialiser(CONTENU)).not.toContain('{');
  });
});
