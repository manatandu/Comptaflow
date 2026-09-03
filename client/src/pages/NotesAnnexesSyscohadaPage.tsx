import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport } from '../components/chrome/icons';
import type { Compte, JeuNotesAnnexes, ResultatNotesJeu } from '../lib/types';
import { Aide } from '../components/chrome/Aide';
import { BlocCertification, EnteteImpression } from '../components/chrome/EnteteImpression';
import {
  BlocTableauNote,
  FicheRecapitulativeNotes,
  compareCodesNotes,
  type RattachementNotes,
  type SaisieNotes,
} from '../components/NotesAnnexesRendu';

/**
 * NOTES ANNEXES DU SYSCOHADA RÉVISÉ · Système normal, les 36 notes de la
 * liste officielle de l'AUDCIF Titre IX ch. 6 section 2.
 *
 * ÉCRAN SÉPARÉ, ET NON UNE PAGE PARAMÉTRÉE PAR RÉFÉRENTIEL · décision prise
 * ici et écrite pour ne pas être défaite par simplification. Un seul écran
 * qui aurait branché sur `tenant.referentiel` aurait dû porter, dans le même
 * fichier, les phrases des deux textes (jeux SYCEBNL et liste du Titre IX),
 * les deux routes de chargement, les deux routes d'export et les deux jeux
 * de rattachement · c'est exactement la forme où une phrase SYCEBNL finit
 * par s'afficher sur un état SYSCOHADA. Deux écrans, deux vocabulaires,
 * aucun croisement possible ; le seul partage est le RENDU
 * (`components/NotesAnnexesRendu.tsx`), qui ne connaît ni note ni compte,
 * comme `etats-financiers.communs.ts` côté serveur (CLAUDE.md §6).
 *
 * L'écran est le JUMEAU de `NotesAnnexesPage` par la disposition, pour qu'un
 * cabinet qui tient les deux sortes de dossiers ne réapprenne pas l'écran :
 * fiche récapitulative à gauche, tableaux de la note choisie à droite,
 * rattachement des sous-comptes en pied de note.
 *
 * LISIBLE À 360 px · sous le point de rupture, la fiche récapitulative passe
 * pleine largeur au lieu de garder ses 360 px en face du détail (les deux
 * côte à côte réclamaient 700 px et poussaient les tableaux hors de
 * l'écran), et chaque tableau défile horizontalement dans sa propre boîte,
 * jamais la page entière.
 */

/** Jeu visé par un rattachement de sous-compte · pendant client de l'enum
 *  Prisma `JeuNotesAnnexes`. Le serveur refuse un jeu étranger au
 *  référentiel du dossier (`NoteAnnexeService.verifierJeuDuDossier`) : la
 *  constante est nommée pour qu'aucun des deux appels ne parte avec l'autre. */
const JEU_SYSCOHADA: JeuNotesAnnexes = 'SYSCOHADA_SYSTEME_NORMAL';

/**
 * Ce que l'écran dit d'une note que l'exercice ne chiffre pas.
 *
 * Le ch. 6 § 1.2 pose que « les modèles de Notes non documentés ne doivent
 * pas être joints aux états financiers », et la fiche R4 le répète en
 * renvoi (1). Le logiciel les joint quand même, avec la mention NEANT :
 * écart ASSUMÉ, décidé par le cabinet et porté côté serveur par
 * `ExportService.construireClasseurNotes`, au motif qu'une liasse à laquelle
 * il manque des notes ne dit pas au lecteur si elles étaient sans objet ou
 * si on les a oubliées. L'écran répète l'écart plutôt que de le taire · il
 * doit dire la même chose que le classeur produit, sans quoi l'un des deux
 * ment.
 */
const MENTION_NEANT_SYSCOHADA = (
  <>
    Néant cet exercice · aucune rubrique chiffrée. La note est cochée « N/A » sur la fiche récapitulative et reste
    jointe à la liasse, où elle porte la mention NEANT. Écart assumé avec le ch. 6 § 1.2 (« les modèles de Notes non
    documentés ne doivent pas être joints aux états financiers ») : une liasse à laquelle il manque des notes ne dit
    pas si elles étaient sans objet ou si elles ont été oubliées.
  </>
);

function NotesSyscohadaSystemeNormal() {
  const { exerciceCourant } = useExercice();
  const { utilisateur, estAdmin } = useAuth();

  const [resultat, setResultat] = useState<ResultatNotesJeu | null>(null);
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [codeSelectionne, setCodeSelectionne] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  // Compte sélectionné dans le formulaire de rattachement, par clé de rubrique.
  const [compteChoisi, setCompteChoisi] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null); // "codeNote::cle::compteId" en cours d'envoi

  const charger = () => {
    if (!exerciceCourant) return;
    api
      .get<ResultatNotesJeu>(`/etats-financiers-syscohada/notes?exerciceId=${exerciceCourant.id}`)
      .then(setResultat, (e) => setErreur(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    charger();
    api.get<Compte[]>('/comptes').then(setComptes, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id]);

  const exporter = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers-syscohada/notes-annexes?exerciceId=${exerciceCourant.id}`,
        'notes-annexes-syscohada.xlsx',
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  // Comptes DÉTAIL seulement : un compte TOTAL est refusé par le serveur (il
  // n'a jamais de mouvement propre, la rubrique resterait vide) · inutile de
  // le proposer et de laisser l'utilisateur essuyer un 400.
  const comptesDetail = useMemo(() => (comptes ?? []).filter((c) => c.typeCompte === 'DETAIL' && c.estActif), [comptes]);
  const compteParNumero = useMemo(() => new Map((comptes ?? []).map((c) => [c.numero, c])), [comptes]);

  // Tableaux du code affiché · un code peut en porter plusieurs (la note 1
  // aligne dettes garanties et engagements financiers) : `sousTableau` les
  // distingue.
  const tableaux = resultat?.notes.filter((n) => n.code === codeSelectionne) ?? [];

  // Ordre officiel des codes · le serveur ne le garantit pas (il rend les
  // codes dans l'ordre de déclaration de la table). Le tri gère le code
  // « 16B bis » du ch. 6, qu'un suffixe purement alphabétique rejetterait en
  // fin de liste (voir compareCodesNotes).
  const ficheTriee = useMemo(
    () => [...(resultat?.ficheRecapitulative ?? [])].sort((a, b) => compareCodesNotes(a.code, b.code)),
    [resultat],
  );

  // Sélection par défaut : la première note applicable, pour ne pas ouvrir
  // l'écran sur un tableau vide.
  useEffect(() => {
    if (!resultat || codeSelectionne) return;
    const premiereApplicable = ficheTriee.find((f) => f.applicable);
    setCodeSelectionne(premiereApplicable?.code ?? ficheTriee[0]?.code ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultat]);

  const rattacher = async (codeNote: string, cleRubrique: string) => {
    const numero = compteChoisi[`${codeNote}::${cleRubrique}`];
    const compte = numero ? compteParNumero.get(numero) : undefined;
    if (!compte) return;
    setErreur(null);
    setEnCours(`${codeNote}::${cleRubrique}::${compte.id}`);
    try {
      await api.post('/notes-annexes/rattachements', {
        jeu: JEU_SYSCOHADA,
        codeNote,
        cleRubrique,
        compteId: compte.id,
      });
      setCompteChoisi((v) => ({ ...v, [`${codeNote}::${cleRubrique}`]: '' }));
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Impossible d'enregistrer ce rattachement");
    } finally {
      setEnCours(null);
    }
  };

  const detacher = async (codeNote: string, cleRubrique: string, compteId: string) => {
    setErreur(null);
    setEnCours(`${codeNote}::${cleRubrique}::${compteId}`);
    try {
      await api.delete('/notes-annexes/rattachements', {
        jeu: JEU_SYSCOHADA,
        codeNote,
        cleRubrique,
        compteId,
      });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Impossible de retirer ce rattachement');
    } finally {
      setEnCours(null);
    }
  };

  /**
   * Écrit une cellule d'une rubrique renseignée hors comptabilité. Les notes
   * 2, 16C, 27B, 31, 32, 34, 35 et 36 du Titre IX ch. 6 ne vivent que de
   * cela · aucune balance ne les porte.
   *
   * Recharge après coup : l'applicabilité de la note (§ 1.4) est décidée par
   * le serveur, une cellule remplie peut la faire basculer.
   */
  const enregistrerSaisie = async (codeNote: string, cleRubrique: string, colonne: number, valeur: string) => {
    if (!exerciceCourant) return;
    setErreur(null);
    setEnCours(`${codeNote}::${cleRubrique}::${colonne}`);
    try {
      await api.post('/notes-annexes/saisies', {
        exerciceId: exerciceCourant.id,
        jeu: 'SYSCOHADA_SYSTEME_NORMAL',
        codeNote,
        cleRubrique,
        colonne,
        valeur,
      });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Impossible d'enregistrer cette saisie");
    } finally {
      setEnCours(null);
    }
  };

  // LECTURE_SEULE n'écrit rien · le serveur le refuserait (`@Roles`), et un
  // champ ouvert qui rend un 403 est une promesse fausse.
  const saisie: SaisieNotes | undefined = utilisateur?.role === 'LECTURE_SEULE'
    ? undefined
    : { enCours, enregistrer: enregistrerSaisie };

  const rattachement: RattachementNotes = {
    estAdmin,
    comptesDetail,
    compteParNumero,
    compteChoisi,
    setCompteChoisi,
    enCours,
    rattacher,
    detacher,
  };

  return (
    <div className="p-2">
      <EnteteImpression titre="Notes annexes" sousTitre="SYSCOHADA révisé · Système normal" />
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            Notes annexes
            {/* Entrée SYSCOHADA du lexique · surtout PAS « notesAnnexes »,
                qui définit les notes du SYCEBNL et compte ses jeux (35, 24,
                5 notes) : la servir ici afficherait la règle d'un autre
                référentiel sur un état déposable. */}
            <Aide sujet="notesSyscohada" />
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[10.5px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          <button
            onClick={exporter}
            disabled={exportEnCours}
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter Excel'}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-text-dim mb-2">
        Liste officielle des Notes annexes du Système normal · AUDCIF Titre IX ch. 6 section 2 (NOTE 1 à NOTE 36) ·{' '}
        {resultat ? `${resultat.couverture.transcrites} notes sur ${resultat.couverture.attendues} attendues.` : 'chargement…'}{' '}
        Chaque poste du bilan, du compte de résultat et du tableau des flux porte le numéro de sa note : la référence
        croisée entre l'état et la note est obligatoire (§ 1.2).
      </p>

      {/* La liste compte 46 CODES pour 36 NOTES, et le dire évite qu'on
          prenne l'écart pour un doublon ou un oubli de transcription. */}
      <p className="text-[10px] text-text-dim mb-2">
        Les notes ne sont pas numérotées de façon continue : la note 3 se subdivise de 3A à 3F (pas de 3G), la 15 en
        15A et 15B (pas de 15C), la 16 en 16A, 16B, 16B bis et 16C (pas de 16D), la 27 en 27A et 27B · 46 codes pour
        36 numéros de note. <span className="font-semibold">[texte officiel]</span> les NOTE 16B et NOTE 16B bis
        portent le même intitulé au ch. 6 ; elles ne se distinguent que par leur contenu, la 16B portant les
        hypothèses actuarielles, la variation de l'engagement et l'analyse de sensibilité, la 16B bis l'actif ou
        passif net des régimes financés et la valeur actuelle des actifs du régime. Transcrit tel quel, non corrigé.
      </p>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[10.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[10.5px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      {!resultat && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}

      {resultat && (
        <div className="flex flex-col lg:flex-row gap-3 items-start">
          {/* --- Fiche récapitulative : NOTE | INTITULÉ | A / N-A --- */}
          <FicheRecapitulativeNotes
            fiche={ficheTriee}
            codeSelectionne={codeSelectionne}
            onSelectionner={setCodeSelectionne}
            className="w-full lg:w-[360px] lg:shrink-0"
          />

          {/* --- Détail du/des tableau(x) du code sélectionné --- */}
          <div className="w-full lg:flex-1 min-w-0">
            {tableaux.length === 0 && (
              <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Sélectionnez une note.</div>
            )}
            {tableaux.map((n) => (
              <BlocTableauNote
                key={n.sousTableau ?? n.code}
                note={n}
                rattachement={rattachement}
                saisie={saisie}
                mentionNonApplicable={MENTION_NEANT_SYSCOHADA}
                afficherHorsBalance
              />
            ))}
          </div>
        </div>
      )}

      {/* Encadré de signature · CPCC § 7.4 règle 7-b, imprimé uniquement. */}
      <BlocCertification />
    </div>
  );
}

/**
 * Composant exporté. Les deux garde-fous sont ici, au-dessus des hooks de
 * l'écran :
 *
 *  · RÉFÉRENTIEL · un dossier SYCEBNL n'a rien à faire dans les notes du
 *    Titre IX, et le contrôleur serveur le refuse déjà
 *    (`@ReferentielsAutorises(SYSCOHADA)` sur `EtatsFinanciersSyscohadaController`).
 *    Masquer sans refuser, ou refuser sans masquer, laisserait inopérant
 *    l'un des deux verrous qu'exige CLAUDE.md §6 · celui-ci est le verrou
 *    client ;
 *  · SYSTÈME · le jeu de 36 notes est celui du SYSTÈME NORMAL. Un dossier au
 *    Système minimal de trésorerie (AUDCIF art. 11 et 13) ne le dépose pas :
 *    le Titre X lui donne ses propres notes, servies avec ses états. Lui
 *    afficher les 36 notes d'un jeu dont il ne relève pas serait lui
 *    proposer de déposer autre chose que ses états.
 */
export function NotesAnnexesSyscohadaPage() {
  const { utilisateur, chargement } = useAuth();

  // Tant que le profil n'est pas chargé, l'écran ne part pas : le référentiel
  // n'est pas encore connu, et interroger la route SYSCOHADA depuis un
  // dossier SYCEBNL ne produirait qu'un 403 affiché en rouge.
  if (chargement || !utilisateur) {
    return <div className="p-2.5 text-[11px] text-text-dim">Chargement…</div>;
  }

  if (utilisateur.tenant.referentiel !== 'SYSCOHADA') {
    return (
      <div className="p-2.5">
        <div className="border border-border bg-surface px-4 py-3 text-[11px] max-w-[640px]">
          Cette fenêtre présente les Notes annexes de l'AUDCIF (Titre IX ch. 6), réservées aux dossiers tenus en
          SYSCOHADA. Ce dossier est tenu en {utilisateur.tenant.referentiel} : ses notes annexes ont leur propre
          fenêtre, avec d'autres rubriques et d'autres renvois.
        </div>
      </div>
    );
  }

  if (utilisateur.tenant.systemeComptableSyscohada === 'MINIMAL_TRESORERIE') {
    return (
      <div className="p-2">
        <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
        <h1 className="text-[12px] font-bold leading-tight mb-2">Notes annexes</h1>
        <div className="border border-border bg-surface px-3.5 py-3 max-w-[620px]">
          <p className="text-[11px] mb-2">
            Ce dossier est tenu au Système minimal de trésorerie. L'AUDCIF ne lui demande pas les 36 notes du Système
            normal : le Titre X ch. 3 lui donne les siennes · tableau de suivi du matériel, du mobilier et des
            cautions (NOTE 1), état des stocks (NOTE 2), état des créances et des dettes non échues (NOTE 3). Le
            journal de trésorerie (NOTE 4) y figure aussi, mais le ch. 1 § 2 ne le range pas parmi les composantes des
            Notes annexes : c'est l'une des trois pièces de base de la tenue.
          </p>
          <p className="text-[11px] text-text-dim">
            Elles sont servies dans la fenêtre <span className="font-semibold">États financiers</span>, onglets
            « Journal de trésorerie » et « Notes annexes ».
          </p>
        </div>
      </div>
    );
  }

  return <NotesSyscohadaSystemeNormal />;
}
