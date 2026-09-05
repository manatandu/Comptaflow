import {
  TransportCourriel,
  lireConfigurationSmtp,
  manquesDuTransport,
  texteDErreur,
} from './transport-courriel';

/**
 * LE CAS QUI COMPTE AUJOURD'HUI · aucun transport n'est configuré sur cette
 * installation. Ce qui est éprouvé ici n'est pas l'envoi, c'est la RÉPONSE À
 * LA QUESTION « est-il configuré ? » · un « oui » rendu sur une configuration
 * à moitié posée produit un transport qui échoue à la première connexion, et
 * l'erreur accuse alors le réseau.
 */
const COMPLET: NodeJS.ProcessEnv = {
  SMTP_HOST: 'smtp.vmg-consulting.cd',
  SMTP_PORT: '587',
  SMTP_USER: 'omegax@vmg-consulting.cd',
  SMTP_PASS: 'secret-de-boite-aux-lettres',
  COURRIER_EXPEDITEUR: 'omegax@vmg-consulting.cd',
};

/** Seul l'environnement est remplacé · le reste du transport est le vrai. */
class TransportEprouve extends TransportCourriel {
  constructor(private readonly env: NodeJS.ProcessEnv) {
    super();
  }
  protected environnement(): NodeJS.ProcessEnv {
    return this.env;
  }
}

describe('transport SMTP · tout ou rien', () => {
  it('une configuration complète se lit, et le port 587 reste en STARTTLS', () => {
    expect(manquesDuTransport(COMPLET)).toEqual([]);
    expect(lireConfigurationSmtp(COMPLET)).toEqual({
      hote: 'smtp.vmg-consulting.cd',
      port: 587,
      securise: false,
      identifiant: 'omegax@vmg-consulting.cd',
      motDePasse: 'secret-de-boite-aux-lettres',
      expediteur: 'omegax@vmg-consulting.cd',
    });
  });

  it.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'COURRIER_EXPEDITEUR'])(
    'sans %s, il n’y a PAS de transport à moitié posé',
    (variable) => {
      const env = { ...COMPLET };
      delete env[variable];
      expect(lireConfigurationSmtp(env)).toBeNull();
      expect(manquesDuTransport(env).map((m) => m.variable)).toEqual([variable]);
    },
  );

  it('une variable présente mais VIDE vaut absente', () => {
    // Cloud Run reçoit ses variables par --env-vars-file · une clé laissée
    // sans valeur y est fréquente, et `''` passerait tous les tests de
    // présence tout en produisant une authentification refusée.
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_PASS: '   ' })).toBeNull();
  });

  it('le port n’est jamais DEVINÉ', () => {
    const env = { ...COMPLET };
    delete env.SMTP_PORT;
    // 25, 465 et 587 n'ont pas le même chiffrement · en choisir un produit une
    // connexion qui expire, et la panne est alors imputée au réseau.
    expect(lireConfigurationSmtp(env)).toBeNull();
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_PORT: 'quatre-cent-soixante-cinq' })).toBeNull();
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_PORT: '0' })).toBeNull();
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_PORT: '70000' })).toBeNull();
  });

  it('SMTP_SECURE absent se DÉDUIT du port, illisible se REFUSE', () => {
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_PORT: '465' })?.securise).toBe(true);
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_PORT: '587' })?.securise).toBe(false);
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_SECURE: 'true' })?.securise).toBe(true);
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_SECURE: 'FALSE' })?.securise).toBe(false);
    // « oui » ramené à faux ouvrirait une connexion en clair sur un port
    // chiffré, qui reste à attendre sans jamais rien dire.
    expect(lireConfigurationSmtp({ ...COMPLET, SMTP_SECURE: 'oui' })).toBeNull();
    expect(manquesDuTransport({ ...COMPLET, SMTP_SECURE: 'oui' })[0].variable).toBe('SMTP_SECURE');
  });

  it('un expéditeur inutilisable est refusé une fois, pas à chaque message', () => {
    // Faux, il ferait refuser TOUS les envois du dossier · cinq tentatives par
    // message pour une faute qui se corrige en une variable.
    expect(lireConfigurationSmtp({ ...COMPLET, COURRIER_EXPEDITEUR: 'omegax-chez-vmg' })).toBeNull();
    expect(manquesDuTransport({ ...COMPLET, COURRIER_EXPEDITEUR: 'omegax-chez-vmg' })[0].raison).toContain(
      'expéditeur',
    );
  });

  it('l’état rendu à l’écran ne porte AUCUNE valeur de variable', () => {
    const etat = new TransportEprouve(COMPLET).etat();
    expect(etat.configure).toBe(true);
    // Le mot de passe et l'identifiant ne sortent jamais · seul l'expéditeur,
    // qui figure de toute façon en tête de chaque message envoyé.
    expect(JSON.stringify(etat)).not.toContain('secret-de-boite-aux-lettres');
    expect(JSON.stringify(etat)).not.toContain('smtp.vmg-consulting.cd');
    expect(etat.expediteur).toBe('omegax@vmg-consulting.cd');
  });

  it('sans rien dans l’environnement, l’état DIT ce qui manque', () => {
    const etat = new TransportEprouve({}).etat();
    expect(etat.configure).toBe(false);
    expect(etat.expediteur).toBeNull();
    expect(etat.manques.map((m) => m.variable)).toEqual([
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'COURRIER_EXPEDITEUR',
    ]);
  });

  it('l’environnement est relu à CHAQUE appel, jamais capté au démarrage', () => {
    // Capté au boot, l'état dirait « non configuré » pendant toute la vie du
    // processus, y compris après la pose des identifiants.
    const env: NodeJS.ProcessEnv = {};
    const transport = new TransportEprouve(env);
    expect(transport.etat().configure).toBe(false);
    Object.assign(env, COMPLET);
    expect(transport.etat().configure).toBe(true);
  });

  it('une erreur trop longue est coupée EN LE DISANT', () => {
    expect(texteDErreur(new Error('550 boîte inconnue'))).toBe('Error · 550 boîte inconnue');
    const coupee = texteDErreur(new Error('x'.repeat(5_000)));
    expect(coupee).toContain('(erreur tronquée à 1000 caractères)');
    expect(texteDErreur({ code: 'ECONNRESET' })).toBe('Erreur sans message rendue par le transport');
  });
});
