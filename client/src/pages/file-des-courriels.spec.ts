import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLASSES_TON,
  ETATS_MESSAGE,
  PHRASE_OU_SE_POSE_LE_COURRIEL,
  PHRASE_SANS_TRANSPORT,
  TITRE_SANS_TRANSPORT,
  compteCloche,
  etatMessage,
  filtresFile,
  libelleCompteCloche,
  libelleOrigine,
  resumeReprise,
  titreCloche,
} from '../lib/courrier-file';
import type { BilanRepriseCourrier, CompteursCourrier } from '../lib/types';

// AUCUN import de « vitest » ici, volontairement · c'est la convention du
// dépôt (voir client/vitest.config.ts et chrome-etroit.spec.ts) :
// describe/it/expect arrivent par les globales, ce qui rend le fichier
// exécutable par les DEUX lanceurs. Le jest de la racine ramasse aussi
// client/src (clé `roots` de package.json).

/**
 * LA FENÊTRE DES COURRIERS SORTANTS ET LA CLOCHE.
 *
 * Trois choses casseraient ici en silence, sans lever d'erreur ni faire
 * échouer une compilation :
 *
 *  1. LE TEXTE DE L'ÉTAT SANS_TRANSPORT. Aucun transport n'est configuré sur
 *     cette installation : toute la file est dans cet état, et c'est le
 *     premier écrit que verra tout utilisateur. Une phrase qui laisserait
 *     croire à un envoi, à une perte ou à une panne s'afficherait, s'
 *     imprimerait et se recopierait sans que rien ne tombe.
 *  2. LE COMPTE DE LA CLOCHE. Une pastille qui compterait les messages GARDÉS
 *     afficherait dès la première relance un nombre à trois chiffres sur
 *     lequel personne ne peut agir · on apprend en une semaine à l'ignorer,
 *     et le jour où elle dit vrai plus personne ne la regarde. Un chiffre faux
 *     est pire qu'une cloche absente.
 *  3. LES CHAMPS SERVIS. Le client ne partage aucun type avec le serveur : une
 *     colonne renommée là-bas ne se voit ici que par une cellule vide.
 *
 * Le rendu n'est PAS testé · le dépôt n'embarque ni jsdom ni navigateur. Ce
 * qui peut s'exécuter vit dans `lib/courrier-file.ts` et s'exécute ici ; le
 * reste se relit dans la source, à la manière de chrome-etroit.spec.ts.
 */

const CLIENT = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const lireServeur = (p: string) => readFileSync(join(CLIENT, '../../src', p), 'utf8');

const COMPTEURS: CompteursCourrier = {
  EN_ATTENTE: 3,
  // La file entière est dans cet état tant qu'aucune messagerie n'est posée.
  SANS_TRANSPORT: 214,
  ENVOYE: 40,
  ECHEC: 2,
  ABANDONNE: 1,
  aRelancer: 217,
};

const BILAN = (partiel: Partial<BilanRepriseCourrier> = {}): BilanRepriseCourrier => ({
  transportConfigure: true,
  manques: [],
  examines: 0,
  envoyes: 0,
  echoues: 0,
  abandonnes: 0,
  ignores: 0,
  restants: 0,
  ...partiel,
});

describe('la cloche du chrome', () => {
  it('ne compte QUE les échecs et les abandons', () => {
    // 2 + 1. Les 214 messages gardés faute de messagerie n'y sont pas : ils ne
    // sont pas en faute, et le comptable ne peut rien en faire depuis le
    // logiciel · les compter reviendrait à afficher « 217 » en permanence.
    expect(compteCloche(COMPTEURS)).toBe(3);
    // Les états de passage et les envois réussis non plus.
    expect(compteCloche({ ...COMPTEURS, EN_ATTENTE: 900, ENVOYE: 900 })).toBe(3);
    // Une file entièrement gardée laisse la cloche muette · c'est l'état
    // d'aujourd'hui, et il ne doit pas produire de pastille.
    expect(compteCloche({ ...COMPTEURS, ECHEC: 0, ABANDONNE: 0 })).toBe(0);
  });

  it('abrège au-delà de 99 et n’écrit rien à zéro', () => {
    // Quatre chiffres élargiraient la pastille dans la ligne des menus, qui se
    // replie déjà sur deux rangs à 360 px (MenuBar.tsx).
    expect(libelleCompteCloche(0)).toBe('');
    expect(libelleCompteCloche(3)).toBe('3');
    expect(libelleCompteCloche(99)).toBe('99');
    expect(libelleCompteCloche(1200)).toBe('99+');
  });

  it('dit dans son infobulle CE QU’ELLE compte', () => {
    // Sans cela, « 3 » se lit « trois messages en attente », alors que la file
    // en porte 217 qui, eux, vont bien.
    expect(titreCloche(COMPTEURS)).toContain('en échec ou abandonné');
    expect(titreCloche({ ...COMPTEURS, ECHEC: 0, ABANDONNE: 0 })).toContain('aucun envoi en échec');
  });

  it('ne montre AUCUN nombre quand le compte n’a pas pu être lu', () => {
    // Un « 0 » de repli affirmerait « rien en échec » alors que la réponse
    // n'est jamais arrivée (licence expirée, session refusée, réseau coupé).
    expect(titreCloche(null)).toContain('n’a pas pu être lu');
    const src = lire('components/chrome/OutilsChrome.tsx');
    expect(src).toMatch(/\(\) => vivant && setCompteurs\(null\)/);
    // La pastille n'est posée que si `libelleCompteCloche` a rendu un texte.
    expect(src).toMatch(/\{pastille && \(/);
  });

  it('vit dans le chrome, reste visible à zéro, et ouvre la fenêtre', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    expect(shell).toContain('<ClocheChrome />');
    const outils = lire('components/chrome/OutilsChrome.tsx');
    // C'est le seul chemin d'un clic vers la file · la faire disparaître à
    // zéro rendrait la fenêtre introuvable le jour où elle est le plus utile,
    // puisque l'état d'aujourd'hui (« gardé ») n'est justement pas compté.
    expect(outils).toContain("navigate('/courrier')");
    expect(outils).not.toMatch(/compte === 0 \? null/);
  });

  it('relit son compte au lieu de le figer à l’ouverture de la session', () => {
    const src = lire('components/chrome/OutilsChrome.tsx');
    // Lu une seule fois, le nombre resterait celui de ce matin : un échec
    // survenu depuis ne se verrait jamais, un échec repris resterait affiché.
    expect(src).toContain('RYTHME_CLOCHE_MS');
    expect(src).toContain('EVENEMENT_FILE_COURRIER');
    // L'onglet caché n'interroge rien.
    expect(src).toMatch(/visibilityState === 'hidden'/);
    // Et la fenêtre émet bien le signal après une reprise, sans quoi la
    // pastille resterait fausse jusqu'à une minute APRÈS le geste qui l'a
    // corrigée.
    expect(lire('pages/CourrierPage.tsx')).toContain('window.dispatchEvent(new Event(EVENEMENT_FILE_COURRIER))');
  });
});

describe('l’état SANS_TRANSPORT, le seul que verra tout le monde aujourd’hui', () => {
  it('se dit en clair, et non par le nom de l’énumération', () => {
    // « SANS_TRANSPORT » ne dit rien à un comptable, et « sans transport » se
    // lit comme une panne de réseau.
    for (const etat of ETATS_MESSAGE) {
      expect([etat.statut, etat.libelle === etat.statut]).toEqual([etat.statut, false]);
      expect(etat.explication.length).toBeGreaterThan(30);
    }
    expect(etatMessage('SANS_TRANSPORT').libelle).toBe('Gardé, pas de messagerie');
  });

  it('n’est peint NI en rouge NI en ambre · ce n’est pas une faute', () => {
    // Le rouge ferait lire « échec » à un message intact et démentirait, dans
    // la même fenêtre, la phrase qui l'accompagne.
    const ton = CLASSES_TON[etatMessage('SANS_TRANSPORT').ton];
    expect(ton).not.toMatch(/danger|warning/);
    // Les deux vrais états d'anomalie gardent, eux, leur couleur · et ils ne
    // se confondent pas : l'un sera repris, l'autre non.
    expect(CLASSES_TON[etatMessage('ECHEC').ton]).toMatch(/warning/);
    expect(CLASSES_TON[etatMessage('ABANDONNE').ton]).toMatch(/danger/);
  });

  it('dit les quatre choses qui doivent passer du premier coup', () => {
    const phrase = `${TITRE_SANS_TRANSPORT} ${PHRASE_SANS_TRANSPORT} ${PHRASE_OU_SE_POSE_LE_COURRIEL}`;
    // 1 · le message est GARDÉ, il n'est pas perdu ;
    expect(phrase).toMatch(/gardés[^.]*aucun n’est perdu/);
    // 2 · il n'est PAS parti · le logiciel ne prétend rien ;
    expect(phrase).toContain('aucun n’est parti');
    // 3 · il repartira tel quel · il n'y a rien à ressaisir ;
    expect(phrase).toContain('repartiront tels quels');
    expect(phrase).toContain('aucun ne sera à refaire');
    // 4 · ce n'est pas une panne, et il n'y a AUCUN formulaire à remplir ·
    // sans cela, l'utilisateur cherche un écran de configuration qui n'existe
    // pas et rouvre une décision déjà prise (les secrets vivent dans
    // l'environnement du service, jamais en base).
    expect(phrase).toContain('Ce n’est pas une panne');
    expect(phrase).toContain('rien à remplir ici');
    expect(phrase).toMatch(/jamais dans une fenêtre du logiciel/);
  });

  it('est bien ce que la fenêtre affiche, et non un texte oublié dans un module', () => {
    const page = lire('pages/CourrierPage.tsx');
    for (const nom of ['TITRE_SANS_TRANSPORT', 'PHRASE_SANS_TRANSPORT', 'PHRASE_OU_SE_POSE_LE_COURRIEL']) {
      expect([nom, page.includes(`{${nom}}`)]).toEqual([nom, true]);
    }
    // Le bandeau nomme les variables manquantes rendues par le serveur · elles
    // sont la seule information qui fasse avancer quelqu'un.
    expect(page).toContain('transport.manques.map');
  });
});

describe('le bilan d’une reprise', () => {
  it('ne se lit JAMAIS comme un succès quand rien n’a été tenté', () => {
    // « 0 envoyé, 0 en échec » est une phrase de succès, et c'est exactement
    // ce qu'un comptable lirait après avoir cliqué sur un service sans
    // messagerie.
    const phrase = resumeReprise(
      BILAN({
        transportConfigure: false,
        manques: [{ variable: 'SMTP_HOST', raison: 'variable absente de l’environnement' }],
        restants: 214,
      }),
    );
    expect(phrase).toContain('Rien n’a été tenté');
    expect(phrase).toContain('SMTP_HOST');
    expect(phrase).toContain('restent gardés');
    expect(phrase).not.toMatch(/envoyé/);
  });

  it('dit ce qu’il RESTE · la reprise est bornée à un lot', () => {
    // Un bilan muet sur ce point laisse croire la file vidée alors qu'elle
    // attend un second clic (REPRISE_PAR_APPEL, côté serveur).
    const phrase = resumeReprise(BILAN({ examines: 25, envoyes: 24, echoues: 1, restants: 12 }));
    expect(phrase).toContain('25 messages repris');
    expect(phrase).toContain('24 envoyés');
    expect(phrase).toContain('reste 12');
  });

  it('nomme les messages laissés à un autre passage', () => {
    // Deux onglets, deux instances · une ligne revendiquée ailleurs n'est pas
    // une ligne perdue, et le taire ferait chercher une disparition.
    expect(resumeReprise(BILAN({ examines: 2, envoyes: 2, ignores: 3 }))).toContain('3 laissés à un autre passage');
  });

  it('ne prétend pas avoir travaillé quand la file est vide', () => {
    expect(resumeReprise(BILAN())).toBe('Rien à reprendre · aucun message n’attend un envoi.');
  });
});

describe('la fenêtre', () => {
  it('offre les six filtres, même à zéro et même sans compteurs', () => {
    // Un onglet qui disparaît quand son état se vide fait bouger la barre sous
    // le doigt et laisse croire que l'état n'existe pas · c'est le jour où
    // « Échec » revient à 1 qu'on voudrait savoir où le lire.
    expect(filtresFile(COMPTEURS).map((f) => f.statut)).toEqual([
      null,
      'EN_ATTENTE',
      'SANS_TRANSPORT',
      'ENVOYE',
      'ECHEC',
      'ABANDONNE',
    ]);
    expect(filtresFile(COMPTEURS)[0].compte).toBe(260);
    expect(filtresFile(null)).toHaveLength(6);
    expect(filtresFile(null).every((f) => f.compte === 0)).toBe(true);
  });

  it('affiche une origine inconnue TELLE QUELLE plutôt qu’une case vide', () => {
    // Un module qui ajoute une origine sans passer par le tableau des
    // libellés laisse une colonne lisible · sans quoi la file devient
    // illisible au bout d'un mois, on voit partir des messages sans savoir
    // quelle décision comptable les a demandés.
    expect(libelleOrigine('RELANCE')).toBe('Rappel et relevé');
    expect(libelleOrigine('CONVOCATION_ASSEMBLEE')).toBe('CONVOCATION_ASSEMBLEE');
  });

  it('ne laisse pas croire qu’un avis d’accès porte le mot de passe', () => {
    // La constante du serveur s'appelle ORIGINE_MOT_DE_PASSE_TEMPORAIRE
    // parce qu'elle nomme le GESTE ; le message, lui, ne contient PAS le mot
    // de passe, et avis-acces.service.ts s'y refuse expressément · le corps
    // reste lisible en base, part dans la sauvegarde de chaque nuit et se rend
    // entier à tout utilisateur du dossier. Une colonne qui annoncerait
    // « Mot de passe provisoire » démentirait cette précaution et inviterait à
    // faire suivre le message.
    expect(libelleOrigine('MOT_DE_PASSE_TEMPORAIRE')).toBe('Avis d’accès');
    expect(libelleOrigine('MOT_DE_PASSE_TEMPORAIRE').toLowerCase()).not.toContain('mot de passe');
    expect(lireServeur('modules/utilisateurs/avis-acces.service.ts')).toContain(
      "LE MOT DE PASSE PROVISOIRE N'EST PAS DANS LE MESSAGE",
    );
  });

  it('n’invente AUCUN champ · la liste servie fait foi', () => {
    // Le client ne partage pas ses types avec le serveur : une colonne
    // renommée là-bas ne se verrait ici que par une cellule vide.
    const service = lireServeur('modules/courrier/courrier.service.ts');
    const bloc = service.match(/const CHAMPS_LISTE = \{([\s\S]*?)\} satisfies/);
    expect(bloc).not.toBeNull();
    const servis = [...bloc![1].matchAll(/^\s{2}(\w+): true,/gm)].map((m) => m[1]).sort();

    const types = lire('lib/types.ts');
    const interfaceMessage = types.match(/export interface MessageEnFile \{([\s\S]*?)\n\}/);
    expect(interfaceMessage).not.toBeNull();
    const attendus = [...interfaceMessage![1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]).sort();

    expect(attendus).toEqual(servis);
  });

  it('appelle les routes que le contrôleur déclare, et pas d’autres', () => {
    const controleur = lireServeur('modules/courrier/courrier.controller.ts');
    expect(controleur).toContain("@Get('transport')");
    expect(controleur).toContain("@Get('compteurs')");
    expect(controleur).toContain("@Post('reprendre')");
    expect(controleur).toContain("@Get(':id')");

    const page = lire('pages/CourrierPage.tsx');
    expect(page).toContain("api.get<EtatTransportCourriel>('/courrier/transport')");
    expect(page).toContain("api.get<CompteursCourrier>('/courrier/compteurs')");
    expect(page).toContain("api.post<BilanRepriseCourrier>('/courrier/reprendre'");
    expect(page).toContain('api.get<MessageComplet>(`/courrier/${message.id}`)');
    // Aucune route inventée · tout ce que la page appelle commence par
    // /courrier, et le serveur n'en sert pas d'autre.
    const appels = [...page.matchAll(/api\.(get|post|patch|delete)<[^>]*>\((['`])([^'`]+)/g)].map((m) => m[3]);
    expect(appels.every((a) => a.startsWith('/courrier'))).toBe(true);
  });

  it('réserve la reprise, aux DEUX bouts', () => {
    // Ce qui part sous la signature du dossier n'est pas une consultation ·
    // même rôle que l'émission des relances. La lecture, elle, reste ouverte à
    // tous : le comptable en lecture seule doit pouvoir lire pourquoi sa
    // relance n'est pas partie.
    const page = lire('pages/CourrierPage.tsx');
    expect(page).toMatch(/peutEcrire = estAdmin \|\| utilisateur\?\.role === 'COMPTABLE'/);
    expect(page).toMatch(/\{peutEcrire && \(\s*\n\s*<button\s*\n\s*onClick=\{relancer\}/);

    const controleur = lireServeur('modules/courrier/courrier.controller.ts');
    const reprendre = controleur.slice(controleur.indexOf("@Post('reprendre')"));
    expect(reprendre).toContain('@Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)');
  });

  it('laisse le bouton de reprise CLIQUABLE même sans messagerie posée', () => {
    // L'environnement du service est relu à chaque appel côté serveur · griser
    // le bouton sur la foi d'une lecture faite à l'ouverture de la fenêtre
    // refuserait le premier envoi de la journée où les identifiants viennent
    // d'être posés. C'est le bilan rendu qui fait autorité.
    const page = lire('pages/CourrierPage.tsx');
    expect(page).toMatch(/disabled=\{reprise\}/);
    expect(page).not.toMatch(/disabled=\{[^}]*transport[^}]*\}/);
  });

  it('dit qu’elle ne montre qu’une tranche, quand c’en est une', () => {
    // CLAUDE.md § 8 bis · un écran de travail peut ne montrer qu'une partie,
    // à condition de l'écrire, et avec des totaux pris sur le périmètre
    // entier.
    const page = lire('pages/CourrierPage.tsx');
    expect(page).toContain('file.tronque');
    expect(page).toContain('{file.total}');
    expect(page).toContain('{file.plafond}');
  });

  it('tient ses colonnes dans un conteneur qui défile, et les écrit en clair', () => {
    const page = lire('pages/CourrierPage.tsx');
    // 930 px de colonnes + 6 gouttières de 8 px + 24 px de marges = 1002 px,
    // pour ~326 px utiles dans une fenêtre à 360 px. Sans conteneur, le
    // débordement remonte à la fenêtre et emporte le bandeau d'explication et
    // le bouton de reprise hors de l'écran.
    expect(page).toContain('<div className="overflow-x-auto">');
    expect(page).toMatch(/min-w-\[1010px\]/);
    // Écrite en toutes lettres dans chaque `className` · le relevé de
    // grilles-fixes-etroites.spec.ts lit les attributs JSX et NE SUIT PAS les
    // variables : une grille rangée dans une constante sort du relevé et
    // n'est plus protégée par personne (c'est le cas, aujourd'hui, de
    // RelancesPage.tsx).
    expect(page).not.toMatch(/const \w+ = ['"`][^'"`]*grid-cols-\[/);
    expect([...page.matchAll(/grid-cols-\[86px_120px/g)]).toHaveLength(2);
  });

  it('montre le corps ENTIER dans la fiche, et pas un aperçu coupé dans la liste', () => {
    // Un texte coupé se lit comme le message et n'en est pas un · le serveur
    // écarte le corps de la liste pour cette raison (CHAMPS_LISTE), et la
    // fiche le rend tel quel.
    const page = lire('pages/CourrierPage.tsx');
    expect(page).toContain('{message.corps}');
    expect(page).toMatch(/whitespace-pre-wrap[^"]*"\>\{message\.corps\}/);
    expect(page).not.toMatch(/corps\.slice|substring\(0/);
    // L'erreur du serveur de messagerie est rendue mot pour mot · la
    // reformuler ferait perdre la différence entre un refus
    // d'authentification et un domaine qui n'existe pas.
    expect(page).toContain('{message.erreur}');
  });
});

describe('la place de la fenêtre dans le logiciel', () => {
  it('est enregistrée, commune aux deux référentiels', () => {
    const registre = lire('lib/registre-fenetres.tsx');
    const bloc = registre.split(/\n  \{/).find((b) => b.includes('/courrier'));
    expect(bloc).toBeDefined();
    // Une file de courriels n'appartient à aucun référentiel · la cloisonner
    // serait la faute inverse de celle qu'on corrige d'habitude.
    expect(bloc).not.toContain('referentielsApplicables');
    expect(bloc).toContain("titre: 'Courriers sortants'");
  });

  it('entre par le menu Fichier · les outils du dossier, jamais le menu État', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    const fichier = shell.indexOf("titre: 'Fichier',");
    const structure = shell.indexOf("titre: 'Structure',");
    const entree = shell.indexOf("navigate('/courrier')");
    // Le menu État vient d'être replié en six familles pour tenir sur un
    // écran de 360 px, et chrome-etroit.spec.ts en gèle les vingt-deux
    // éditions · y ranger une file d'envois, qui n'édite rien et ne dépend
    // même pas de l'exercice, rouvrirait ce défaut et ferait mentir le repli.
    expect(entree).toBeGreaterThan(fichier);
    expect(entree).toBeLessThan(structure);
    // Une seule entrée de menu pour cette fenêtre · la barre de menus est le
    // seul endroit qui a vocation à être exhaustif, et chaque fenêtre s'y
    // trouve une fois (voir le partage des rôles en tête d'AppShell).
    expect([...shell.matchAll(/navigate\('\/courrier'\)/g)]).toHaveLength(1);
  });

  it('n’est réservée à aucun rôle · seule la reprise l’est', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    const ligne = shell.split('\n').find((l) => l.includes("navigate('/courrier')"))!;
    expect(ligne).not.toContain('estAdmin ?');
    const controleur = lireServeur('modules/courrier/courrier.controller.ts');
    // La route de liste ne porte aucun @Roles · c'est ce qui rend l'entrée de
    // menu ouverte à tous légitime aux deux bouts.
    const liste = controleur.slice(controleur.indexOf('/** La file du dossier'), controleur.indexOf('RELANCER LES ÉCHECS'));
    expect(liste).not.toContain('@Roles(');
  });
});
