import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA POLITIQUE DE CONFIDENTIALITÉ FACE AU CODE DU NUMÉRIQUE CONGOLAIS.
 *
 * Ordonnance-loi n° 23/10 du 13 mars 2023, Livre III. Trois articles la
 * commandent, et la page les nommait tous les trois par leur absence :
 *
 *  · art. 201 · « Les données personnelles sont stockées et/ou hébergées en
 *    République Démocratique du Congo. » OmegaX héberge chez Neon et Google
 *    Cloud, hors RDC. La page le disait déjà · elle ne disait pas SUR QUELLE
 *    BASE, ce qui laissait le lecteur devant un fait sans règle.
 *  · art. 202 · les cas où le transfert reste possible. La page invoquait le
 *    2° (« un contrat entre la personne concernée et le responsable du
 *    traitement »), que le contrat de VMG avec un cabinet ne remplit pas ·
 *    passe D4 (D4-C1), la base est dite en cours de qualification.
 *  · art. 244 · deux obligations · le RESPONSABLE notifie l'Autorité et la
 *    personne (al. 1er), le SOUS-TRAITANT avertit le responsable (al. 2).
 *    Passe D4 (D4-C2) · la page les confondait.
 *
 * Ce que la page NE DIT PAS, et c'est délibéré · que l'autorisation préalable
 * de l'art. 201 n'a pas été obtenue. Publier un aveu de non-conformité est une
 * décision de VMG, pas un geste de développement. Voir
 * docs/code-du-numerique-et-omegax.md, qui l'écrit en interne.
 */

const page = readFileSync(join(__dirname, '..', '..', 'src/pages/ConfidentialitePage.tsx'), 'utf8');
const serveur = (f: string) => readFileSync(join(__dirname, '..', '..', '..', f), 'utf8');
const deplie = page.replace(/\s+/g, ' ');

describe('la politique cite le Code du numérique', () => {
  it('nomme le texte, son numéro et sa date', () => {
    expect(deplie).toContain('ordonnance-loi n° 23/10 du 13 mars 2023');
  });

  it('dit la règle de localisation, et la base du transfert comme une question ouverte', () => {
    // Passe D4 (D4-C1) · le 2° de l'art. 202 vise un contrat entre la
    // personne concernée et le responsable ; le contrat de VMG lie un cabinet.
    // Pour les dossiers, l'instruction du transfert revient à l'entité
    // responsable (art. 229). Rien n'est tranché avant le juriste.
    expect(deplie).toContain('hébergées hors de la République démocratique du Congo');
    expect(deplie).toContain('article 201');
    expect(deplie).toContain('article 202');
    expect(deplie).toContain('l’autorisation préalable de l’Autorité de protection des données');
    expect(deplie).toContain('La base juridique du transfert opéré ici est en cours de qualification.');
    expect(deplie).toContain('VMG Consulting agissant pour son compte (article 229)');
  });

  it('distingue les deux obligations de l’article 244 · responsable et sous-traitant', () => {
    // Passe D4 (D4-C2) · al. 1er au responsable (Autorité ET personne),
    // al. 2 au sous-traitant (avertir le responsable).
    expect(deplie).toContain('article 244');
    expect(deplie).toContain('dont VMG Consulting est responsable, nous notifierons <strong>sans délai</strong>, à l’Autorité de protection des données et à vous-même');
    expect(deplie).toContain('VMG Consulting, sous-traitant, vous avertira <strong>sans délai</strong>');
    expect(deplie).toContain('il revient alors à votre entité de notifier l’Autorité et les personnes concernées');
  });

  it('renvoie à la restitution complète pour le droit de portabilité', () => {
    // Elle existe depuis G2b · une politique qui promet un export sans dire
    // par où passer promet à moitié.
    expect(deplie).toContain('Restituer le dossier complet');
  });

  it('n’affirme aucune conformité qu’OmegaX ne tient pas', () => {
    // Ni « conforme au Code du numérique », ni « autorisé par l'Autorité ».
    expect(page).not.toMatch(/conforme au Code du numérique|autorisation de l’Autorité a été/i);
  });

  it('laisse les deux adresses en blanc plutôt que d’en inventer', () => {
    expect(deplie).toContain('doivent être arrêtées par VMG Consulting');
    expect(deplie).toContain('adresse inventée dirigerait vos demandes vers le vide');
  });

  it('numérote ses sections sans doublon', () => {
    // Deux « 7. » se suivaient après l'insertion · un document juridique qui
    // se renvoie à lui-même par numéro ne peut pas en avoir deux.
    const numeros = [...page.matchAll(/<Titre>(\d+)\./g)].map(([, n]) => Number(n));
    expect(numeros).toEqual([...Array(numeros.length).keys()].map((i) => i + 1));
  });
});

describe('la politique nomme tous ceux qui reçoivent des données, et dit l’installation sur site (audit final F176)', () => {
  it('nomme l’archive des sauvegardes et la messagerie, sans inventer le nom du prestataire SMTP', () => {
    expect(deplie).toContain('<strong>GitHub</strong> (service GitHub Actions) produit chaque nuit la sauvegarde');
    expect(deplie).toContain('<strong>Le prestataire de messagerie</strong> (SMTP)');
    expect(deplie).toContain('Son nom doit être arrêté par VMG Consulting et porté ici avant toute publication');
  });

  it('écrit le cloisonnement là où il vit · aucune règle de la base ne le porte', () => {
    expect(deplie).toContain('cloisonné des autres au niveau de chaque requête du serveur');
  });

  it('sur site, dit que rien ne part chez un hébergeur, d’après l’état public du poste', () => {
    expect(page).toContain(".get<EtatSurSite>('/sur-site/etat')");
    expect(deplie).toContain('{surSite ? (');
    expect(deplie).toContain('installée sur un ordinateur de votre entité');
    expect(deplie).toContain('ne sont confiés à aucun hébergeur');
    expect(deplie).toContain('chiffrée</strong> par une phrase secrète que choisit l’administrateur');
  });
});

describe('la politique décrit le logiciel tel qu’il est (passe D4)', () => {
  it('donne les deux durées de session que tient session-longue.ts (D4-A2, B2, C5, D2)', () => {
    // Lues dans le serveur, jamais recopiées · la phrase « expire au bout de
    // huit heures » avait survécu à F270 parce que rien ne la reliait au code.
    const session = serveur('src/modules/auth/session-longue.ts');
    const jours = (nom: string) => Number(new RegExp(`${nom} = (\\d+) \\* SECONDES_PAR_JOUR`).exec(session)?.[1]);
    const enLettres: Record<number, string> = { 7: 'sept', 30: 'trente' };
    expect(deplie).toContain(`dure ${enLettres[jours('DUREE_MAXIMALE_SESSION_LONGUE_S')]} jours au plus depuis la connexion`);
    expect(deplie).toContain(`se ferme après ${enLettres[jours('DUREE_INACTIVITE_SESSION_LONGUE_S')]} jours sans utilisation`);
    // Session courte · cookie de session, et l'échéance du jeton.
    expect(serveur('src/modules/auth/auth.module.ts')).toContain("config.get<string>('JWT_EXPIRES_IN', '8h')");
    expect(deplie).toContain('il se ferme avec le navigateur, et la session prend fin au plus tard huit heures après la connexion');
  });

  it('dit « chiffrés en transit », et le http du réseau local sur site (D4-A3, C7, D1)', () => {
    // La section 5 suit la même branche `surSite` que les sections 3 et 4.
    const section5 = deplie.slice(deplie.indexOf('<Titre>5.'), deplie.indexOf('<Titre>6.'));
    expect(section5).toContain('{surSite ? (');
    expect(section5).toContain('<strong>http, sur le réseau local</strong> de votre entité : OmegaX ne les chiffre pas');
    expect(section5).toContain('<strong>chiffrés en transit (HTTPS)</strong>');
    expect(section5).toContain('Ce n’est pas un chiffrement de bout en bout');
    // Le relais est bien celui que firebase.json déclare.
    expect(readFileSync(join(__dirname, '..', '..', 'firebase.json'), 'utf8')).toContain('"source": "/api/**"');
  });

  it('borne les quatre-vingt-dix jours à GitHub et nomme la copie Cloud Storage (D4-B3, C6)', () => {
    const flux = serveur('.github/workflows/sauvegarde-base.yml');
    expect(flux).toContain('retention-days: 90');
    expect(flux).toContain('gcloud storage cp');
    expect(deplie).toContain('conservé quatre-vingt-dix jours par GitHub');
    expect(deplie).toContain('Une copie de ce fichier chiffré est déposée chaque nuit dans');
    expect(deplie).toContain('<strong>europe-west1</strong> (Belgique)');
    expect(deplie).toContain('La durée de conservation de cette copie doit être arrêtée par VMG Consulting');
  });

  it('nomme l’adresse IP et le second facteur, et dit leur conservation (D4-B5, C8)', () => {
    expect(deplie).toContain('<strong>adresse réseau (adresse IP)</strong> d’où chaque acte a été fait');
    expect(deplie).toContain('le secret de l’application d’authentification et l’empreinte des codes de secours');
    expect(deplie).toContain('ne sont soumis à aucune purge');
    expect(deplie).toContain('Leur durée de conservation doit être arrêtée par VMG Consulting');
    // Et la limite de l'effacement, art. 216, al. 4, 2°.
    expect(deplie).toContain('L’effacement cède devant une obligation légale qui impose de conserver les données (article 216)');
  });

  it('informe du droit de réclamation et des directives après la mort (D4-C9)', () => {
    expect(deplie).toContain('introduire une réclamation auprès de l’autorité chargée de la protection des données à caractère personnel et de former un recours juridictionnel (articles 220 et 239)');
    expect(deplie).toContain('les modalités de la gestion de vos données personnelles après votre mort (article 208)');
  });
});
