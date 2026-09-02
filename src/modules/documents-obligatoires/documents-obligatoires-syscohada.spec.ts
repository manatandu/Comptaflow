import { FormeJuridiqueSyscohada, SystemeComptableSyscohada } from '@prisma/client';
import {
  ETATS_INVENTAIRE_SMT_SYSCOHADA,
  ETATS_INVENTAIRE_SYSTEME_NORMAL,
  SECTIONS_RAPPORT_GESTION_AUSCGIE,
  SECTIONS_RAPPORT_GESTION_AUSCOOP,
  etatsExigesParSysteme,
  regleRapportGestion,
} from './correspondance-inventaire-syscohada';
import { SECTIONS_RAPPORT_ACTIVITE } from './correspondance-inventaire';

/**
 * DOCUMENTS OBLIGATOIRES DU CHEMIN SYSCOHADA.
 *
 * La fenêtre était fermée au SYSCOHADA, non parce que l'AUDCIF n'exige rien
 * (son art. 19 impose le livre d'inventaire à toute entité) mais parce
 * qu'elle était montée sur les seuls articles du SYCEBNL.
 *
 * Le risque de cette ouverture n'est pas l'absence : c'est la TRANSPOSITION.
 * Les trois textes se ressemblent assez pour qu'on soit tenté de servir l'un
 * à la place de l'autre, et assez peu pour que ce soit faux. Ces tests
 * verrouillent précisément ce qui les sépare.
 */

describe('livre d’inventaire · AUDCIF art. 19', () => {
  it('transcrit les trois états que l’article nomme, dans son ordre', () => {
    expect(ETATS_INVENTAIRE_SYSTEME_NORMAL.map((e) => e.libelle)).toEqual([
      'Bilan',
      'Compte de résultat',
      'Tableau des flux de trésorerie',
    ]);
  });

  it('écarte le tableau des flux au Système minimal de trésorerie', () => {
    // LECTURE, pas transcription · l'article 19 nomme le TFT sans prévoir
    // d'exception, mais le jeu du SMT n'en comporte pas : il repose sur une
    // comptabilité de TRÉSORERIE (art. 13, Titre X), et un tableau des flux
    // de trésorerie dressé là-dessus n'aurait rien à expliquer. La lacune est
    // celle du texte, qui n'a pas articulé son art. 19 avec son art. 13.
    expect(ETATS_INVENTAIRE_SMT_SYSCOHADA.map((e) => e.cle)).toEqual(['bilan', 'compteDeResultat']);
    expect(etatsExigesParSysteme(SystemeComptableSyscohada.MINIMAL_TRESORERIE)).toBe(ETATS_INVENTAIRE_SMT_SYSCOHADA);
    expect(etatsExigesParSysteme(SystemeComptableSyscohada.NORMAL)).toBe(ETATS_INVENTAIRE_SYSTEME_NORMAL);
    // Un dossier sans système renseigné retombe sur le Système normal, qui
    // est le régime de droit commun (art. 11) · jamais sur le SMT, qui
    // suppose de passer sous les seuils de l'art. 13.
    expect(etatsExigesParSysteme(null)).toBe(ETATS_INVENTAIRE_SYSTEME_NORMAL);
  });
});

describe('rapport de gestion · ce que les trois textes ne partagent PAS', () => {
  it('l’AUSCOOP ne demande PAS les événements postérieurs à la clôture', () => {
    // C'est l'écart le plus facile à effacer en transposant. L'art. 138 les
    // exige, l'art. 108 ne les nomme nulle part.
    expect(SECTIONS_RAPPORT_GESTION_AUSCGIE.map((s) => s.cle)).toContain('evenementsPosterieurs');
    expect(SECTIONS_RAPPORT_GESTION_AUSCOOP.map((s) => s.cle)).not.toContain('evenementsPosterieurs');
  });

  it('l’AUSCOOP demande EN PLUS l’état de promotion des coopérateurs', () => {
    // Aucun équivalent en société commerciale · le taire aurait amputé le
    // rapport d'une coopérative d'une exigence que son texte formule seul.
    expect(SECTIONS_RAPPORT_GESTION_AUSCOOP.map((s) => s.cle)).toContain('promotionCooperateurs');
    expect(SECTIONS_RAPPORT_GESTION_AUSCGIE.map((s) => s.cle)).not.toContain('promotionCooperateurs');
  });

  it('l’AUSCGIE nomme six choses, transcrites en six sections', () => {
    // Trois que le rapport « expose », puis trois que le texte détache par
    // « en particulier » · le « en particulier » n'atténue pas l'exigence.
    expect(SECTIONS_RAPPORT_GESTION_AUSCGIE).toHaveLength(6);
    expect(SECTIONS_RAPPORT_GESTION_AUSCGIE.map((s) => s.cle)).toEqual([
      'situationExerciceEcoule',
      'evolutionPrevisible',
      'evenementsPosterieurs',
      'continuationActivite',
      'evolutionTresorerie',
      'planFinancement',
    ]);
  });

  it('le rapport d’activité SYCEBNL reste à QUATRE sections, distinctes', () => {
    // Il n'a pas bougé, et il ne doit pas : l'art. 16-3 en nomme quatre.
    expect(SECTIONS_RAPPORT_ACTIVITE).toHaveLength(4);
    // La « perspectives de développement » du SYCEBNL et la « continuation de
    // l'activité » de l'AUSCGIE ne sont pas la même chose · aucune clé n'est
    // partagée entre les deux tables au-delà des trois qui le sont vraiment.
    const sycebnl = new Set(SECTIONS_RAPPORT_ACTIVITE.map((s) => s.cle));
    const communes = SECTIONS_RAPPORT_GESTION_AUSCGIE.filter((s) => sycebnl.has(s.cle as never)).map((s) => s.cle);
    expect(communes.sort()).toEqual(['evenementsPosterieurs', 'evolutionTresorerie', 'situationExerciceEcoule']);
  });

  it('chaque section cite le texte qui la fonde, et le BON', () => {
    // Une section sans citation est une section qu'on ne peut plus vérifier.
    for (const s of SECTIONS_RAPPORT_GESTION_AUSCGIE) {
      expect([s.cle, s.exigence.startsWith('AUSCGIE art. 138')]).toEqual([s.cle, true]);
    }
    for (const s of SECTIONS_RAPPORT_GESTION_AUSCOOP) {
      expect([s.cle, s.exigence.startsWith('AUSCOOP art. 108')]).toEqual([s.cle, true]);
    }
  });
});

describe('qui doit établir un rapport de gestion', () => {
  it('les cinq sociétés commerciales · AUSCGIE art. 138', () => {
    for (const forme of [
      FormeJuridiqueSyscohada.SOCIETE_ANONYME,
      FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE,
      FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
      FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
      FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE,
    ]) {
      const regle = regleRapportGestion(forme);
      expect([forme, regle.genre]).toEqual([forme, 'EXIGE']);
      expect(regle.genre === 'EXIGE' && regle.sections).toBe(SECTIONS_RAPPORT_GESTION_AUSCGIE);
    }
  });

  it('la coopérative relève de son PROPRE texte, pas de l’AUSCGIE', () => {
    const regle = regleRapportGestion(FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE);
    expect(regle.genre).toBe('EXIGE');
    expect(regle.genre === 'EXIGE' && regle.source).toContain('AUSCOOP');
    expect(regle.genre === 'EXIGE' && regle.sections).toBe(SECTIONS_RAPPORT_GESTION_AUSCOOP);
  });

  it('le GIE · AUCUNE règle lue, et on le dit', () => {
    // L'AUSCGIE y renvoie au contrat constitutif : « le contrôle de la
    // gestion et le contrôle des états financiers de synthèse sont exercés
    // dans les conditions prévues par le contrat ». Servir l'art. 138 au GIE
    // lui inventerait une obligation légale.
    const regle = regleRapportGestion(FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE);
    expect(regle.genre).toBe('AUCUNE_REGLE_LUE');
    expect(regle.genre === 'AUCUNE_REGLE_LUE' && regle.motif).toContain('contrat');
  });

  it('le commerçant personne physique et l’entreprenant · AUCUNE règle lue', () => {
    // L'art. 138 nomme « le gérant, le conseil d'administration ou
    // l'administrateur général » · un commerçant personne physique n'est
    // aucun des trois, et ne rend compte devant aucune assemblée.
    for (const forme of [FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE, null]) {
      const regle = regleRapportGestion(forme);
      expect([String(forme), regle.genre]).toEqual([String(forme), 'AUCUNE_REGLE_LUE']);
      // Mais le livre d'inventaire, lui, reste dû · l'AUDCIF s'applique à
      // raison de l'activité, pas de la forme juridique.
      expect(regle.genre === 'AUCUNE_REGLE_LUE' && regle.motif).toContain("livre d'inventaire");
    }
  });
});
