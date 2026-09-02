import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AIGUILLAGE DES FENÊTRES COMMUNES AUX DEUX RÉFÉRENTIELS · États financiers
 * et Notes annexes sont deux fenêtres pour quatre jeux d'états : SYCEBNL
 * (Système normal, Système Minimal de Trésorerie) et SYSCOHADA (Système
 * normal du Titre IX, Système minimal de trésorerie du Titre X, AUDCIF
 * art. 11).
 *
 * Ce que ce fichier protège est exactement ce qui ne lève AUCUNE erreur :
 * un aiguillage qui repart vers l'écran SYCEBNL ne plante pas, il imprime à
 * une entreprise le bilan d'une association, et cela se découvre au dépôt.
 * De même, une bulle d'aide qui servirait l'entrée SYCEBNL du lexique sur un
 * état SYSCOHADA compile parfaitement et se dépose telle quelle.
 *
 * AUCUN import de « vitest » ici, volontairement · convention du dépôt (voir
 * chrome-etroit.spec.ts et NotesAnnexesSyscohadaPage.spec.ts) : describe/it/
 * expect arrivent par les globales, ce qui rend le fichier exécutable par
 * les DEUX lanceurs. Les `.tsx` n'étant ni transformés ni résolus par le
 * Jest de la racine, les écrans se vérifient sur leur SOURCE.
 */

const racineClient = join(__dirname, '..');
const lireClient = (chemin: string) => readFileSync(join(racineClient, chemin), 'utf8');
const lireServeur = (chemin: string) => readFileSync(join(__dirname, '../../../src', chemin), 'utf8');

const etatsFinanciers = lireClient('pages/EtatsFinanciersPage.tsx');
const notesAnnexes = lireClient('pages/NotesAnnexesPage.tsx');
const lexique = lireClient('lib/lexique.ts');
const entete = lireClient('components/chrome/EnteteImpression.tsx');
const appShell = lireClient('components/chrome/AppShell.tsx');

/**
 * Toutes les sources du client, pour les contrôles « nulle part ailleurs ».
 * Les fichiers de test en sont exclus · ils CITENT les noms qu'ils
 * interdisent, celui-ci le premier, et se dénonceraient eux-mêmes.
 */
function sourcesClient(dossier = racineClient): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (entree.name === 'node_modules') continue;
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...sourcesClient(chemin));
    else if (/\.tsx?$/.test(entree.name) && !/\.spec\.tsx?$/.test(entree.name)) trouves.push(chemin);
  }
  return trouves;
}

describe('aiguillage de la fenêtre « États financiers »', () => {
  it('envoie un dossier SYSCOHADA vers SES écrans, selon son système', () => {
    // AUDCIF art. 11 : Système normal (Titre IX) ou Système minimal de
    // trésorerie (Titre X). Deux jeux d'états entiers, pas deux mises en page.
    expect(etatsFinanciers).toContain("utilisateur.tenant.referentiel === 'SYSCOHADA'");
    expect(etatsFinanciers).toContain("utilisateur.tenant.systemeComptableSyscohada === 'MINIMAL_TRESORERIE'");
    expect(etatsFinanciers).toContain("import('./EtatsFinanciersSyscohadaPage')");
    expect(etatsFinanciers).toContain("import('./EtatsSmtSyscohadaPage')");
    // En chargement à la demande, comme les autres écrans du registre.
    expect(etatsFinanciers).toContain('const EtatsSmtSyscohadaPage = lazy(');
    expect(etatsFinanciers).toContain('const EtatsFinanciersSyscohadaPage = lazy(');
  });

  it('laisse intact l\'aiguillage des trois jeux SYCEBNL', () => {
    expect(etatsFinanciers).toContain("utilisateur.tenant.jeuEtatsFinanciersSycebnl === 'SYSTEME_MINIMAL_TRESORERIE'");
    expect(etatsFinanciers).toContain("import('./EtatsSmtPage')");
  });
});

describe('aiguillage de la fenêtre « Notes annexes »', () => {
  it('envoie un dossier SYSCOHADA vers les 36 notes du Titre IX', () => {
    expect(notesAnnexes).toContain("utilisateur.tenant.referentiel === 'SYSCOHADA'");
    expect(notesAnnexes).toContain("import('./NotesAnnexesSyscohadaPage')");
  });

  it("n'envoie plus le jeu SYSCOHADA au rattachement depuis l'écran SYCEBNL", () => {
    // Le jeu SYSCOHADA_SYSTEME_NORMAL appartient à l'écran SYSCOHADA, qui
    // seul le sert · le serveur refuse un jeu étranger au référentiel du
    // dossier (NoteAnnexeService.verifierJeuDuDossier).
    expect(notesAnnexes).not.toContain('SYSCOHADA_SYSTEME_NORMAL');
  });
});

describe('plus rien n\'est « en construction » côté SYSCOHADA', () => {
  it("l'écran EnConstructionSyscohada est supprimé, et plus rien ne l'appelle", () => {
    // CLAUDE.md §4 : pas de « bientôt disponible » qui soit faux. Les états
    // SYSCOHADA existent, l'écran d'attente n'a plus d'objet.
    expect(existsSync(join(racineClient, 'components/chrome/EnConstructionSyscohada.tsx'))).toBe(false);
    for (const fichier of sourcesClient()) {
      const contenu = readFileSync(fichier, 'utf8');
      expect({ fichier, appel: contenu.includes('EnConstructionSyscohada') }).toEqual({ fichier, appel: false });
    }
  });

  it('le menu État annonce les deux fenêtres sans réserve, et garde les documents obligatoires en SYCEBNL', () => {
    // Les deux entrées ne sont PAS gardées par `estSycebnl` : elles servent
    // les deux référentiels, chacune aiguillant derrière elle. Les gater
    // ferait disparaître du menu les états d'un dossier SYSCOHADA, qui
    // existent.
    expect(appShell).toContain("{ label: 'États financiers', separateurAvant: true,");
    expect(appShell).toContain("{ label: 'Notes annexes', onClick:");
    expect(appShell).not.toMatch(/estSycebnl[\s\S]{0,40}label: '(États financiers|Notes annexes)'/);
    expect(appShell).not.toContain('à venir');
    // Fenêtre montée sur les états et les textes du SYCEBNL (art. 14 et
    // 16-3) · son pendant SYSCOHADA reste à écrire, la montrer imprimerait à
    // une entreprise les documents d'une ASBL.
    expect(appShell).toMatch(/\.\.\.\(estSycebnl\s*\?\s*\[\{ label: 'Documents obligatoires'/);
    const registre = lireClient('lib/registre-fenetres.tsx');
    const bloc = /motif: \/\^\\\/documents-obligatoires\$\/,[\s\S]*?\},/.exec(registre);
    expect(bloc?.[0]).toContain("referentielsApplicables: ['SYCEBNL']");
  });
});

describe('un seul fichier de types côté client', () => {
  it('les fichiers temporaires types-syscohada*.ts ont disparu', () => {
    expect(existsSync(join(racineClient, 'lib/types-syscohada.ts'))).toBe(false);
    expect(existsSync(join(racineClient, 'lib/types-smt-syscohada.ts'))).toBe(false);
    for (const fichier of sourcesClient()) {
      const contenu = readFileSync(fichier, 'utf8');
      expect({ fichier, import: contenu.includes('types-syscohada') || contenu.includes('types-smt-syscohada') }).toEqual({
        fichier,
        import: false,
      });
    }
  });

  it('types.ts porte les formes des deux référentiels, sous des noms qui ne se confondent pas', () => {
    const types = lireClient('lib/types.ts');
    // Système normal (Titre IX) et SMT (Titre X) du SYSCOHADA.
    for (const nom of [
      'BilanSyscohada',
      'CompteResultatSyscohada',
      'TableauFluxTresorerieSyscohada',
      'BilanSmtSyscohada',
      'CompteDeResultatSmtSyscohada',
      'NotesSmtSyscohada',
      'EligibiliteSmtSyscohada',
    ]) {
      expect({ nom, present: types.includes(`export interface ${nom} {`) }).toEqual({ nom, present: true });
    }
    // Le suffixe est ce qui tient le cloisonnement dans un fichier unique
    // (CLAUDE.md §6) : aucun homonyme entre les deux référentiels.
    expect(types).toContain('export interface Bilan {');
    expect(types).toContain('export interface BilanSmt {');
  });
});

describe('le système comptable SYSCOHADA voyage jusqu\'au client', () => {
  it('/auth/me le sert, et le client le déclare · sans quoi l\'aiguillage est aveugle', () => {
    // Un champ absent du DTO ne casse rien : `undefined` ne vaut jamais
    // 'MINIMAL_TRESORERIE', et TOUS les dossiers SYSCOHADA recevraient le
    // Système normal, y compris ceux qui n'y ont pas droit (art. 13).
    const service = lireServeur('modules/auth/auth.service.ts');
    expect(service).toContain('systemeComptableSyscohada: user.tenant.systemeComptableSyscohada,');
    const auth = lireClient('lib/auth.tsx');
    expect(auth).toContain('systemeComptableSyscohada: SystemeComptableSyscohada | null;');
  });
});

describe('en-tête des états imprimés', () => {
  it('porte les quatre mentions de l\'en-tête officiel et l\'unité monétaire', () => {
    // « Désignation entité … / Numéro d'identification … / Exercice clos le
    // 31-12-… / Durée (en mois) … » (AUDCIF Titre IX ch. 3 section 2 pour le
    // bilan, ch. 4 section 2 pour le compte de résultat, Titre X ch. 2 pour
    // le SMT, fiche R1 du ch. 2) · plus l'unité monétaire, exigée « dans
    // chacune des pages des états financiers publiés » (ch. 1 § 2.4).
    expect(entete).toContain('{tenant?.nom}');
    expect(entete).toContain('tenant?.numeroImpot');
    expect(entete).toContain('clos le');
    expect(entete).toContain('dureeMois');
    expect(entete).toContain('tenant?.devise');
    const service = lireServeur('modules/auth/auth.service.ts');
    expect(service).toContain('devise: user.tenant.devise,');
  });

  it('nomme le système d\'un dossier SYSCOHADA, pas seulement son référentiel', () => {
    // La page de garde du ch. 2 porte la mention « SYSTÈME NORMAL » : les
    // deux systèmes de l'art. 11 n'ont ni les mêmes états ni les mêmes
    // maquettes, et un état déposé doit dire duquel il relève.
    expect(entete).toContain('LIBELLE_SYSTEME');
    expect(entete).toContain("tenant?.referentiel === 'SYSCOHADA' && systeme");
  });
});

describe('lexique des bulles d\'aide', () => {
  const ecransSyscohada = [
    ['EtatsFinanciersSyscohadaPage.tsx', lireClient('pages/EtatsFinanciersSyscohadaPage.tsx')],
    ['EtatsSmtSyscohadaPage.tsx', lireClient('pages/EtatsSmtSyscohadaPage.tsx')],
    ['NotesAnnexesSyscohadaPage.tsx', lireClient('pages/NotesAnnexesSyscohadaPage.tsx')],
  ] as const;

  it('porte les entrées SYSCOHADA, chacune avec sa source AUDCIF', () => {
    for (const cle of [
      'jeuEtatsSyscohada',
      'bilanSyscohada',
      'compteResultatSyscohada',
      'tftSyscohada',
      'notesSyscohada',
      'smtSyscohada',
    ]) {
      expect({ cle, present: lexique.includes(`  ${cle}: {`) }).toEqual({ cle, present: true });
    }
    // Chaque règle codée cite sa source (CLAUDE.md §9) · aucune entrée
    // SYSCOHADA ne doit renvoyer au texte SYCEBNL.
    const entrees = lexique.split(/\n  (?=[a-zA-Z0-9]+: \{)/).filter((b) => /^[a-zA-Z0-9]+Syscohada: \{/.test(b));
    expect(entrees.length).toBeGreaterThanOrEqual(6);
    // Une entrée ne code AUCUNE règle du référentiel · elle décrit un outil du
    // logiciel, le rapprochement général / analytique. Lui imposer une
    // citation de l'AUDCIF reviendrait à en inventer une, ce que la règle §1
    // interdit avant tout.
    const SANS_TEXTE_LEGAL = ['controleCumulsSyscohada'];
    for (const bloc of entrees) {
      const source = /source: '([^']*)'/.exec(bloc)?.[1] ?? '';
      const cle = /^([a-zA-Z0-9]+)Syscohada: \{/.exec(bloc)![1] + 'Syscohada';
      const attendu = !SANS_TEXTE_LEGAL.includes(cle);
      expect({ cle, source, ohada: /AUDCIF/.test(source) }).toEqual({ cle, source, ohada: attendu });
      expect(source).not.toContain('SYCEBNL');
    }
  });

  it('est utilisé par les écrans SYSCOHADA, et jamais avec une clé SYCEBNL', () => {
    expect(ecransSyscohada[0][1]).toContain("bilan: 'bilanSyscohada'");
    expect(ecransSyscohada[0][1]).toContain("'compte-de-resultat': 'compteResultatSyscohada'");
    expect(ecransSyscohada[0][1]).toContain("'flux-tresorerie': 'tftSyscohada'");
    expect(ecransSyscohada[1][1]).toContain('sujet="smtSyscohada"');
    expect(ecransSyscohada[2][1]).toContain('sujet="notesSyscohada"');
    // Les clés du SYCEBNL, dont le libellé compte SES jeux et SES seuils :
    // servies ici, elles afficheraient la règle d'un autre référentiel sur
    // un état déposable (CLAUDE.md §6).
    for (const [nom, source] of ecransSyscohada) {
      for (const cleSycebnl of ['bilan', 'compteResultat', 'tft', 'notesAnnexes', 'smt', 'jeuEtats']) {
        const usage = `sujet="${cleSycebnl}"`;
        expect({ nom, usage, present: source.includes(usage) }).toEqual({ nom, usage, present: false });
      }
    }
  });
});
