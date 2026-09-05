import { Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { adresseAcceptable, normaliserAdresse } from './adresse-courriel';

/**
 * LE TRANSPORT SMTP · LU DANS L'ENVIRONNEMENT, JAMAIS EN BASE NI DANS LE DÉPÔT.
 *
 * Serveur, port, identifiant, mot de passe et adresse d'expéditeur viennent des
 * variables d'environnement, comme DATABASE_URL. Une base se sauvegarde chaque
 * nuit, s'exporte, se restaure sur un poste de test et se lit : un mot de passe
 * de boîte aux lettres n'y a pas sa place, et la sauvegarde nocturne le
 * recopierait indéfiniment. Conséquence voulue · il n'y a AUCUN formulaire de
 * configuration dans le logiciel, poser le courriel se fait en posant des
 * secrets sur le service.
 *
 * ------------------------------------------------------------------------
 * TOUT OU RIEN · POURQUOI UNE CONFIGURATION INCOMPLÈTE N'EN EST PAS UNE
 * ------------------------------------------------------------------------
 * Un transport construit avec la moitié des variables se connecte quand même,
 * et échoue au premier envoi. L'erreur qui remonte alors parle de connexion
 * refusée ou de délai dépassé · c'est-à-dire qu'elle accuse LE RÉSEAU, et
 * personne n'ira chercher une variable absente. Le message part en file avec
 * une erreur qui ment sur sa cause, puis en ABANDONNE au bout de cinq essais.
 *
 * D'où la règle : il manque une seule variable nécessaire, et il n'y a pas de
 * transport du tout. `etat()` dit alors LAQUELLE, ce qui est la seule
 * information qui fasse avancer quelqu'un.
 *
 * Aucune VALEUR n'est jamais rendue par `etat()`, seulement des NOMS de
 * variables · la règle est uniforme plutôt que jugée variable par variable,
 * parce qu'une exception (« le port n'est pas un secret ») est exactement ce
 * qui finit par laisser passer le mot de passe.
 */

export interface ConfigurationSmtp {
  hote: string;
  port: number;
  /** Connexion chiffrée dès l'ouverture (port 465) plutôt que par STARTTLS. */
  securise: boolean;
  identifiant: string;
  motDePasse: string;
  /** Adresse portée en expéditeur de chaque message. */
  expediteur: string;
}

/** Une variable nécessaire absente ou inutilisable, et ce qui lui manque. */
export interface ManqueTransport {
  variable: string;
  raison: string;
}

export interface EtatTransport {
  configure: boolean;
  manques: ManqueTransport[];
  /** Rendu pour que l'écran dise SOUS QUELLE adresse le courrier partira. */
  expediteur: string | null;
}

export interface EnvoiCourriel {
  destinataire: string;
  destinataireNom?: string | null;
  sujet: string;
  corps: string;
}

/**
 * SMTP_SECURE EST LA SEULE VARIABLE FACULTATIVE, ET SEULEMENT PARCE QUE LE
 * PORT LA DIT. Le port 465 est le port du SMTP chiffré dès l'ouverture, tout
 * autre port passe par STARTTLS · c'est la convention que nodemailer applique
 * lui-même. La déduire n'est donc pas une devinette. Mais posée à une valeur
 * qui ne se lit ni comme vrai ni comme faux, elle est REFUSÉE plutôt que
 * ramenée à faux : « SMTP_SECURE=oui » lu comme faux ouvrirait une connexion
 * en clair sur le port 465, qui reste à attendre sans jamais rien dire.
 */
const PORT_SMTP_CHIFFRE = 465;
const VRAI = ['true', '1'];
const FAUX = ['false', '0'];

const ABSENTE = 'variable absente de l’environnement';

function lireTexte(env: NodeJS.ProcessEnv, nom: string): string {
  return (env[nom] ?? '').trim();
}

/**
 * Ce qui empêche de construire un transport, variable par variable. Liste vide
 * = configuration complète.
 */
export function manquesDuTransport(env: NodeJS.ProcessEnv): ManqueTransport[] {
  const manques: ManqueTransport[] = [];

  if (lireTexte(env, 'SMTP_HOST').length === 0) manques.push({ variable: 'SMTP_HOST', raison: ABSENTE });

  const port = lireTexte(env, 'SMTP_PORT');
  if (port.length === 0) {
    // Le port n'est PAS déduit. 25, 465 et 587 ne se valent pas et n'ont pas
    // le même chiffrement · en choisir un à la place de l'exploitant produit
    // une connexion qui expire, imputée au réseau.
    manques.push({ variable: 'SMTP_PORT', raison: ABSENTE });
  } else if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    manques.push({ variable: 'SMTP_PORT', raison: 'valeur illisible · un nombre de 1 à 65535 est attendu' });
  }

  if (lireTexte(env, 'SMTP_USER').length === 0) manques.push({ variable: 'SMTP_USER', raison: ABSENTE });
  if (lireTexte(env, 'SMTP_PASS').length === 0) manques.push({ variable: 'SMTP_PASS', raison: ABSENTE });

  const securise = lireTexte(env, 'SMTP_SECURE').toLowerCase();
  if (securise.length > 0 && !VRAI.includes(securise) && !FAUX.includes(securise)) {
    manques.push({
      variable: 'SMTP_SECURE',
      raison: 'valeur illisible · true ou false sont attendus, sinon retirer la variable (le port décide)',
    });
  }

  const expediteur = normaliserAdresse(lireTexte(env, 'COURRIER_EXPEDITEUR'));
  if (expediteur.length === 0) {
    manques.push({ variable: 'COURRIER_EXPEDITEUR', raison: ABSENTE });
  } else if (!adresseAcceptable(expediteur)) {
    // Une adresse d'expéditeur fausse fait refuser TOUS les envois du dossier,
    // pas un seul · la contrôler ici évite cinq tentatives par message pour
    // une faute qui se corrige en une variable.
    manques.push({ variable: 'COURRIER_EXPEDITEUR', raison: 'adresse inutilisable comme expéditeur' });
  }

  return manques;
}

/** La configuration complète, ou `null` s'il manque quoi que ce soit. */
export function lireConfigurationSmtp(env: NodeJS.ProcessEnv): ConfigurationSmtp | null {
  if (manquesDuTransport(env).length > 0) return null;

  const port = Number(lireTexte(env, 'SMTP_PORT'));
  const declare = lireTexte(env, 'SMTP_SECURE').toLowerCase();
  return {
    hote: lireTexte(env, 'SMTP_HOST'),
    port,
    securise: declare.length > 0 ? VRAI.includes(declare) : port === PORT_SMTP_CHIFFRE,
    identifiant: lireTexte(env, 'SMTP_USER'),
    motDePasse: lireTexte(env, 'SMTP_PASS'),
    expediteur: normaliserAdresse(lireTexte(env, 'COURRIER_EXPEDITEUR')),
  };
}

/** Longueur au-delà de laquelle une erreur de transport est coupée, EN LE DISANT. */
const LONGUEUR_ERREUR = 1_000;

/**
 * L'erreur du transport, rendue lisible sans être interprétée · le texte du
 * serveur est ce qui permet de distinguer un refus d'authentification d'un
 * domaine inexistant, et le reformuler ferait perdre cette distinction.
 */
export function texteDErreur(erreur: unknown): string {
  const brut =
    erreur instanceof Error
      ? `${erreur.name} · ${erreur.message}`
      : typeof erreur === 'string'
        ? erreur
        : 'Erreur sans message rendue par le transport';
  if (brut.length <= LONGUEUR_ERREUR) return brut;
  // Coupée, mais JAMAIS en silence · une erreur qui s'arrête au milieu d'une
  // phrase se lit comme une erreur différente de celle qui a eu lieu.
  return `${brut.slice(0, LONGUEUR_ERREUR)} […] (erreur tronquée à ${LONGUEUR_ERREUR} caractères)`;
}

/** Levée quand un envoi est demandé alors qu'aucun transport n'est posé. */
export class TransportAbsent extends Error {
  constructor(manques: ManqueTransport[]) {
    super(
      'Aucun transport de courriel configuré · ' +
        manques.map((m) => `${m.variable} (${m.raison})`).join(', '),
    );
    this.name = 'TransportAbsent';
  }
}

@Injectable()
export class TransportCourriel {
  private transporteur: ReturnType<typeof createTransport> | null = null;
  private signature: string | null = null;

  /**
   * L'environnement est relu à CHAQUE appel plutôt que capté au démarrage · un
   * état figé au boot dirait « non configuré » pendant toute la vie du
   * processus, y compris après la pose des identifiants, et la seule façon de
   * s'en apercevoir serait de redémarrer sans savoir pourquoi.
   */
  protected environnement(): NodeJS.ProcessEnv {
    return process.env;
  }

  etat(): EtatTransport {
    const manques = manquesDuTransport(this.environnement());
    const config = manques.length === 0 ? lireConfigurationSmtp(this.environnement()) : null;
    return { configure: config !== null, manques, expediteur: config?.expediteur ?? null };
  }

  async envoyer(envoi: EnvoiCourriel): Promise<void> {
    const config = lireConfigurationSmtp(this.environnement());
    if (!config) throw new TransportAbsent(manquesDuTransport(this.environnement()));

    const transporteur = this.transporteurPour(config);
    await transporteur.sendMail({
      from: config.expediteur,
      to: envoi.destinataireNom
        ? { name: envoi.destinataireNom, address: envoi.destinataire }
        : envoi.destinataire,
      subject: envoi.sujet,
      // LE CORPS PART ENTIER. Un rappel porte le détail des pièces impayées :
      // coupé, il devient un décompte faux remis à un tiers, et c'est le
      // logiciel qui l'aura signé.
      text: envoi.corps,
    });
  }

  /**
   * Le transporteur est gardé d'un envoi à l'autre · rouvrir une session SMTP
   * par message coûte une poignée de main TLS à chaque relance d'un lot.
   * La signature ne porte PAS le mot de passe (elle vivrait alors en mémoire à
   * côté de lui, sans raison) : une rotation de secret prend effet au
   * processus suivant, ce qui est de toute façon la façon dont Cloud Run
   * délivre une variable changée.
   */
  private transporteurPour(config: ConfigurationSmtp): ReturnType<typeof createTransport> {
    const signature = `${config.hote}|${config.port}|${config.securise}|${config.identifiant}|${config.expediteur}`;
    if (this.transporteur && this.signature === signature) return this.transporteur;
    this.transporteur = createTransport({
      host: config.hote,
      port: config.port,
      secure: config.securise,
      auth: { user: config.identifiant, pass: config.motDePasse },
    });
    this.signature = signature;
    return this.transporteur;
  }
}
