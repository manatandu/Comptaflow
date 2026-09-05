import { adresseAcceptable, normaliserAdresse } from './adresse-courriel';

/**
 * LE PIÈGE QUE CE CONTRÔLE FERME · une adresse fausse acceptée à l'écriture ne
 * se découvre qu'à la troisième tentative, des heures après la relance, quand
 * plus personne ne tient le tiers ni la pièce. Chaque cas refusé ici est un cas
 * qu'aucun serveur de messagerie n'aurait eu l'occasion de signaler.
 */
describe('adresse de destinataire · ce qui est refusé à l’écriture', () => {
  it('refuse le vide et l’espace seule', () => {
    expect(adresseAcceptable(normaliserAdresse(''))).toBe(false);
    expect(adresseAcceptable(normaliserAdresse('   '))).toBe(false);
    expect(adresseAcceptable(normaliserAdresse(null))).toBe(false);
    expect(adresseAcceptable(normaliserAdresse(undefined))).toBe(false);
  });

  it('refuse ce qui n’a pas exactement une arobase', () => {
    expect(adresseAcceptable('comptable.vmg.cd')).toBe(false);
    expect(adresseAcceptable('a@b@vmg.cd')).toBe(false);
    expect(adresseAcceptable('@vmg.cd')).toBe(false);
    expect(adresseAcceptable('comptable@')).toBe(false);
  });

  it('refuse un domaine qu’aucun réseau ne joint', () => {
    // Un domaine sans point ne sort pas du réseau local · le serveur le
    // refusera toujours, autant ne pas ouvrir cinq tentatives pour l'apprendre.
    expect(adresseAcceptable('comptable@intranet')).toBe(false);
    expect(adresseAcceptable('comptable@.cd')).toBe(false);
    expect(adresseAcceptable('comptable@vmg.')).toBe(false);
    expect(adresseAcceptable('comptable@vmg..cd')).toBe(false);
  });

  it('refuse une espace ou un retour à la ligne au milieu', () => {
    expect(adresseAcceptable('comp table@vmg.cd')).toBe(false);
    // Un retour à la ligne dans un en-tête de courriel est le moyen classique
    // d'y glisser un second destinataire.
    expect(adresseAcceptable('comptable@vmg.cd\nBcc: ailleurs@ext.cd')).toBe(false);
  });

  it('refuse une LISTE glissée dans un champ qui n’en attend qu’une', () => {
    expect(adresseAcceptable('a@vmg.cd,b@vmg.cd')).toBe(false);
    expect(adresseAcceptable('a@vmg.cd;b@vmg.cd')).toBe(false);
  });

  it('accepte les formes réelles, y compris celles qu’un filtre trop zélé rejette', () => {
    // Un logiciel qui refuse une adresse valide fait ressaisir une adresse
    // fausse · le plus, le point et le tiret sont d'usage courant.
    expect(adresseAcceptable('jean-pierre.mukendi+omegax@vmg-consulting.cd')).toBe(true);
    expect(adresseAcceptable('contact@ong.example.org')).toBe(true);
    expect(adresseAcceptable(normaliserAdresse('  contact@ong.cd  '))).toBe(true);
  });

  it('refuse au-delà de 254 caractères', () => {
    expect(adresseAcceptable(`${'a'.repeat(250)}@vmg.cd`)).toBe(false);
  });
});
