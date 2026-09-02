import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// AUCUN import de « vitest » ici, volontairement · convention du dépôt (voir
// chrome-etroit.spec.ts) : describe/it/expect arrivent par les globales, ce
// qui rend le fichier exécutable par les DEUX lanceurs. Le `.tsx` n'étant ni
// transformé ni résolu par le Jest de la racine, l'écran se vérifie sur sa
// SOURCE · c'est aussi ce que fait chrome-etroit.spec.ts, et pour la même
// raison : aucun de ces défauts ne lève d'erreur ni n'échoue à la
// compilation, ils ne se voient qu'à l'usage, sur un état déjà déposé.

const lireClient = (chemin: string) => readFileSync(join(__dirname, '..', chemin), 'utf8');
const lireServeur = (chemin: string) => readFileSync(join(__dirname, '../../../src', chemin), 'utf8');

const page = lireClient('pages/NotesAnnexesSyscohadaPage.tsx');
const pageSycebnl = lireClient('pages/NotesAnnexesPage.tsx');
const rendu = lireClient('components/NotesAnnexesRendu.tsx');

describe('écran des notes annexes SYSCOHADA', () => {
  it('charge la route SYSCOHADA des notes, et cette route existe côté serveur', () => {
    expect(page).toContain('/etats-financiers-syscohada/notes?exerciceId=');
    const controleur = lireServeur('modules/etats-financiers-syscohada/etats-financiers-syscohada.controller.ts');
    expect(controleur).toContain("@Controller('etats-financiers-syscohada')");
    expect(controleur).toContain("@Get('notes')");
  });

  it("envoie le jeu SYSCOHADA_SYSTEME_NORMAL au rattachement, valeur admise par l'enum des deux côtés", () => {
    // Le serveur refuse un jeu étranger au référentiel du dossier
    // (`NoteAnnexeService.verifierJeuDuDossier`) : un littéral fautif ne se
    // verrait qu'au premier rattachement tenté par un cabinet.
    expect(page).toContain("const JEU_SYSCOHADA: JeuNotesAnnexes = 'SYSCOHADA_SYSTEME_NORMAL';");
    expect(page).toContain('jeu: JEU_SYSCOHADA');
    expect(lireClient('lib/types.ts')).toContain("| 'SYSCOHADA_SYSTEME_NORMAL'");
    const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    const enumJeu = /enum JeuNotesAnnexes \{([\s\S]*?)\}/.exec(schema);
    expect(enumJeu?.[1]).toContain('SYSCOHADA_SYSTEME_NORMAL');
  });

  it("appelle la route d'export qui existe, préfixe `exports` compris", () => {
    expect(page).toContain('/exports/etats-financiers-syscohada/notes-annexes?exerciceId=');
    const exportControleur = lireServeur('modules/exports/export.controller.ts');
    expect(exportControleur).toContain("@Controller('exports')");
    expect(exportControleur).toContain("@Get('etats-financiers-syscohada/notes-annexes')");
  });

  it('ne touche à aucune route, aucun jeu ni aucun libellé SYCEBNL', () => {
    // CLAUDE.md §6 : les deux référentiels ne partagent ni états financiers
    // ni vocabulaire. Une phrase SYCEBNL affichée sur un état SYSCOHADA ne
    // casse rien · elle se dépose.
    for (const interdit of [
      '/notes-annexes/associations',
      '/notes-annexes/projet',
      '/exports/notes-annexes/',
      'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
      'PROJETS_DEVELOPPEMENT',
      'jeuEtatsFinanciersSycebnl',
      'adhérent',
      'fonds affecté',
      'bailleur',
    ]) {
      expect({ interdit, present: page.includes(interdit) }).toEqual({ interdit, present: false });
    }
  });

  it('porte le verrou client de référentiel, doublé du verrou serveur', () => {
    // Masquer sans refuser laisserait la route ouverte à un appel direct ;
    // refuser sans masquer afficherait un 403 rouge à un dossier SYCEBNL.
    expect(page).toContain("utilisateur.tenant.referentiel !== 'SYSCOHADA'");
    const controleur = lireServeur('modules/etats-financiers-syscohada/etats-financiers-syscohada.controller.ts');
    expect(controleur).toContain('@ReferentielsAutorises(Referentiel.SYSCOHADA)');
  });

  it("ne sert pas les 36 notes du Système normal à un dossier au Système minimal de trésorerie", () => {
    // AUDCIF art. 11 et 13 : le SMT est un jeu d'états entier, avec ses
    // propres notes (Titre X ch. 3). Lui montrer celles du Titre IX serait
    // lui proposer de déposer autre chose que ses états.
    expect(page).toContain("utilisateur.tenant.systemeComptableSyscohada === 'MINIMAL_TRESORERIE'");
  });

  it('reste lisible à 360 px · la fiche récapitulative ne garde ses 360 px que sur écran large', () => {
    // Mesuré sur l'écran SYCEBNL : 360 px de fiche + le détail côte à côte
    // réclament près de 700 px, et le détail sortait de l'écran.
    expect(page).toContain('flex flex-col lg:flex-row');
    expect(page).toContain('className="w-full lg:w-[360px] lg:shrink-0"');
    // Les tableaux défilent dans leur propre boîte, jamais la page entière.
    expect(rendu).toContain('overflow-x-auto');
  });

  it("dit de la note vide ce que le classeur produit en dit, écart officiel compris", () => {
    // L'export JOINT toutes les notes avec la mention NEANT · écart assumé
    // avec le ch. 6 § 1.2, porté par ExportService.construireClasseurNotes.
    // Si l'écran se taisait, l'un des deux mentirait.
    expect(page).toContain('mention NEANT');
    expect(page).toContain('ch. 6 § 1.2');
    // Le fragment est court à dessein : la phrase est coupée par le
    // retour à la ligne du commentaire serveur, et un test qui exigerait la
    // phrase entière casserait au premier reformatage.
    expect(lireServeur('modules/exports/export.service.ts')).toContain(
      'ne doivent pas être joints aux états financiers',
    );
  });

  it("signale l'anomalie du texte officiel sur les NOTE 16B et 16B bis au lieu de la corriger", () => {
    // CLAUDE.md §9 : toute anomalie du texte officiel est signalée sur
    // place, jamais corrigée en silence. Les deux notes portent le même
    // intitulé au ch. 6 et ne se distinguent que par leur contenu.
    expect(page).toContain('[texte officiel]');
    expect(page).toContain('16B bis');
  });

  it("cite le texte qui fonde l'écran, et lui seul", () => {
    expect(page).toContain('AUDCIF Titre IX ch. 6');
    // La bulle d'aide est propre à l'écran : l'entrée « notesAnnexes » du
    // lexique définit les notes du SYCEBNL et compte ses jeux.
    expect(page).not.toContain('sujet="notesAnnexes"');
  });
});

describe('rendu partagé des notes annexes', () => {
  it("est le SEUL rendu : l'écran SYCEBNL en dépend au lieu d'en garder une copie", () => {
    // Deux copies d'un même écran divergent en silence, l'une corrigée et
    // pas l'autre. C'est la raison d'être de l'extraction.
    for (const src of [page, pageSycebnl]) {
      expect(src).toContain("from '../components/NotesAnnexesRendu'");
      expect(src).toContain('BlocTableauNote');
      expect(src).toContain('FicheRecapitulativeNotes');
    }
    // Plus aucune fabrique de tableau locale dans l'écran SYCEBNL.
    expect(pageSycebnl).not.toContain('const blocTableau =');
    expect(pageSycebnl).not.toContain('const ligneTableau =');
  });

  it("ne connaît aucune note, aucun compte ni aucun texte officiel", () => {
    // Le partage autorisé par CLAUDE.md §6 porte sur le MOTEUR, pas sur les
    // notes : une table de correspondance qui remonterait ici mélangerait
    // les deux référentiels.
    // Le nom des deux référentiels apparaît dans la PROSE du fichier, qui
    // explique justement ce qu'il ne fait pas · ce sont les routes, les jeux
    // et les citations de texte officiel qui n'ont rien à y faire.
    for (const interdit of [
      'api.',
      '/notes-annexes',
      'SYSCOHADA_SYSTEME_NORMAL',
      'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
      'Titre IX',
      'Partie 4',
    ]) {
      expect({ interdit, present: rendu.includes(interdit) }).toEqual({ interdit, present: false });
    }
  });

  it("laisse l'écran SYCEBNL sur son texte par défaut", () => {
    // La mention NEANT par défaut est mot pour mot celle qu'affichait
    // l'écran SYCEBNL avant l'extraction : son comportement ne bouge pas.
    expect(rendu).toContain('Néant cet exercice · aucune rubrique chiffrée.');
    expect(pageSycebnl).not.toContain('mentionNonApplicable');
    expect(pageSycebnl).not.toContain('afficherHorsBalance');
  });

  it("n'introduit aucun tiret cadratin", () => {
    // CLAUDE.md §4. Le caractère n'est pas écrit dans ce fichier · le
    // chercher en clair l'y ferait entrer par la porte du test.
    const cadratin = String.fromCharCode(0x2014);
    for (const [nom, src] of [
      ['NotesAnnexesSyscohadaPage.tsx', page],
      ['NotesAnnexesRendu.tsx', rendu],
      ['NotesAnnexesPage.tsx', pageSycebnl],
      ['tri-notes.ts', lireClient('lib/tri-notes.ts')],
    ] as const) {
      expect({ nom, cadratin: src.includes(cadratin) }).toEqual({ nom, cadratin: false });
    }
  });
});
