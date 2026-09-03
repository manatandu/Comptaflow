import { lireEtatDuPooling, messageDePooling } from './pooling-base';

/**
 * CE QUE LE SERVEUR DIT DE SA BASE · et surtout ce qu'il n'en dit pas.
 *
 * Ces deux fonctions existent pour qu'une question d'exploitation (« sommes-
 * nous bien passés par l'endpoint poolé ? ») trouve sa réponse dans le
 * journal SANS que la chaîne de connexion y figure. Le test qui compte est
 * donc autant celui du contenu que celui de l'absence.
 */
const POOLEE =
  'postgresql://utilisateur:MOTDEPASSE@ep-exemple-123-pooler.us-east-1.aws.neon.tech/base?sslmode=require&pgbouncer=true&connection_limit=10';
const DIRECTE = 'postgresql://utilisateur:MOTDEPASSE@ep-exemple-123.us-east-1.aws.neon.tech/base?sslmode=require';

describe('état du pooling · lecture de la chaîne de connexion', () => {
  it('reconnaît un endpoint poolé, son pgbouncer et son plafond', () => {
    expect(lireEtatDuPooling(POOLEE)).toEqual({ poole: true, pgbouncerDeclare: true, plafondConnexions: 10 });
  });

  it('reconnaît un endpoint direct et l’absence de plafond', () => {
    expect(lireEtatDuPooling(DIRECTE)).toEqual({ poole: false, pgbouncerDeclare: false, plafondConnexions: null });
  });

  it('rend null sur une chaîne absente ou illisible · ce n’est pas à elle de faire échouer un démarrage', () => {
    expect(lireEtatDuPooling(undefined)).toBeNull();
    expect(lireEtatDuPooling('')).toBeNull();
    expect(lireEtatDuPooling('pas une url')).toBeNull();
  });
});

describe('message de démarrage · il informe sans rien divulguer', () => {
  // LE TEST QUI COMPTE. Un journal Cloud Run se lit par toute personne ayant
  // accès au projet ; une chaîne de connexion n'a rien à y faire (CLAUDE.md
  // §4). Ce test échouerait si quelqu'un ajoutait « pour aider au
  // diagnostic » l'hôte, la base ou l'utilisateur.
  it.each([POOLEE, DIRECTE])('ne laisse fuir ni mot de passe, ni hôte, ni utilisateur', (chaine) => {
    const message = messageDePooling(lireEtatDuPooling(chaine));
    for (const secret of ['MOTDEPASSE', 'utilisateur', 'neon.tech', 'ep-exemple-123', '/base']) {
      expect(message).not.toContain(secret);
    }
  });

  it('dit le régime de connexion et le plafond', () => {
    expect(messageDePooling(lireEtatDuPooling(POOLEE))).toBe('Base · endpoint POOLÉ, plafond de connexions 10 par instance');
    expect(messageDePooling(lireEtatDuPooling(DIRECTE))).toBe(
      'Base · endpoint DIRECT (non poolé), plafond de connexions défaut Prisma',
    );
  });

  it('AVERTIT quand un endpoint poolé n’a pas pgbouncer=true', () => {
    // Sans lui, Prisma garde ses requêtes préparées d'une transaction à
    // l'autre, et PgBouncer en mode transaction les rejette · l'erreur ne
    // tombe qu'à la deuxième requête, donc en production et pas au premier
    // essai.
    const sansPgbouncer = POOLEE.replace('&pgbouncer=true', '');
    expect(messageDePooling(lireEtatDuPooling(sansPgbouncer))).toContain('ATTENTION : pgbouncer=true absent');
  });

  it('le dit quand la chaîne manque, plutôt que de se taire', () => {
    expect(messageDePooling(null)).toBe('Base · chaîne de connexion absente ou illisible');
  });
});
