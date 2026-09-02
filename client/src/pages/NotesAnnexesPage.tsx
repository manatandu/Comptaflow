import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport } from '../components/chrome/icons';
import type { Compte, JeuNotesAnnexes, ResultatNotesJeu } from '../lib/types';
import { Aide } from '../components/chrome/Aide';
import { BlocCertification, EnteteImpression } from '../components/chrome/EnteteImpression';
import { EnConstructionSyscohada } from '../components/chrome/EnConstructionSyscohada';
// Rendu partagé avec l'écran SYSCOHADA · voir NotesAnnexesRendu.tsx : seule
// la forme d'une NoteCalculee y est connue, aucune note ni aucun compte.
import {
  BlocTableauNote,
  FicheRecapitulativeNotes,
  compareCodesNotes,
  type RattachementNotes,
} from '../components/NotesAnnexesRendu';

/**
 * Notes annexes SYCEBNL · les deux jeux (45 notes « associations et ordres
 * professionnels », 26 notes « projets de développement »), plus le
 * rattachement des sous-comptes du dossier aux rubriques que le plan de
 * comptes normalisé ne permet pas de déterminer seul (voir
 * `NoteAnnexeService`, `note-annexe.types.ts`).
 *
 * Deux garde-fous côté serveur que cet écran RESPECTE plutôt que contourne :
 *
 * 1. Une rubrique n'est proposée au rattachement QUE si elle porte
 *    `subdivisionAttendue` (donc une `cle`) · le back refuse explicitement
 *    toute tentative sur une rubrique que le plan officiel détermine déjà
 *    (`NoteAnnexeService.rubriqueRattachable`). Cet écran ne propose donc un
 *    sélecteur QUE pour les rubriques qui portent une `cle` : les autres
 *    n'en ont pas les moyens, il n'y a rien à choisir.
 * 2. § 1.4 : une note non applicable ne présente aucune ligne. Ses rubriques
 *    en attente restent néanmoins visibles et rattachables · sans quoi une
 *    note entièrement vide serait un cul-de-sac (voir `RubriqueEnAttente`
 *    dans note-annexe.types.ts). D'où l'usage de `note.rubriquesEnAttente`
 *    (calculé indépendamment de `applicable`) plutôt que de dériver la liste
 *    depuis `note.lignes`, qui peut être vide.
 */
export function NotesAnnexesPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur, estAdmin } = useAuth();
  const jeuProjet = utilisateur?.tenant.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT';
  // Les 35 et 24 notes catalogués ici sont celles du Système normal. Le
  // Système minimal de trésorerie n'en a que cinq, servies directement par
  // l'écran des états financiers (Partie 4, ch. 4) · cette fenêtre n'a rien
  // à lui montrer, et le lui dire vaut mieux que lui afficher les 35 notes
  // d'un jeu dont il ne relève pas.
  const jeuSmt = utilisateur?.tenant.jeuEtatsFinanciersSycebnl === 'SYSTEME_MINIMAL_TRESORERIE';
  const chemin = jeuProjet ? 'projet' : 'associations';

  const [resultat, setResultat] = useState<ResultatNotesJeu | null>(null);
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [codeSelectionne, setCodeSelectionne] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  // Compte sélectionné dans le formulaire de rattachement, par clé de rubrique.
  const [compteChoisi, setCompteChoisi] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null); // "codeNote::cle::compteId" en cours d'envoi

  // Dossier SYSCOHADA : rien à charger, le serveur refuse de toute façon ces
  // routes (ReferentielGuard) · voir l'écran « en construction » ci-dessous.
  const referentielSyscohada = utilisateur?.tenant.referentiel === 'SYSCOHADA';

  // Jeu de notes visé par un rattachement · distinct du jeu d'états du
  // dossier (voir `JeuNotesAnnexes`). Le serveur refuse un jeu étranger au
  // référentiel : le calculer ici plutôt que de répéter deux littéraux
  // évite qu'un des deux appels parte avec le mauvais.
  const jeuRattachement: JeuNotesAnnexes = referentielSyscohada
    ? 'SYSCOHADA_SYSTEME_NORMAL'
    : jeuProjet
      ? 'PROJETS_DEVELOPPEMENT'
      : 'ASSOCIATIONS_ORDRES_PROFESSIONNELS';

  const charger = () => {
    if (jeuSmt || referentielSyscohada) return; // aucun catalogue de notes du Système normal à charger
    if (!exerciceCourant || !utilisateur) return; // même garde qu'EtatsFinanciersPage : utilisateur null au tout premier rendu.
    api
      .get<ResultatNotesJeu>(`/notes-annexes/${chemin}?exerciceId=${exerciceCourant.id}`)
      .then(setResultat, (e) => setErreur(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    charger();
    api.get<Compte[]>('/comptes').then(setComptes, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id, chemin, utilisateur]);

  const exporter = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(`/exports/notes-annexes/${chemin}?exerciceId=${exerciceCourant.id}`, `notes-annexes-${chemin}.xlsx`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  // Comptes DÉTAIL seulement : un compte Total est refusé par le back (il n'a
  // jamais de mouvement propre, la rubrique resterait vide) · inutile de le
  // proposer et de laisser l'utilisateur essuyer un 400.
  const comptesDetail = useMemo(() => (comptes ?? []).filter((c) => c.typeCompte === 'DETAIL' && c.estActif), [comptes]);
  const compteParNumero = useMemo(() => new Map((comptes ?? []).map((c) => [c.numero, c])), [comptes]);

  // Tableaux du code actuellement affiché · un code peut en porter plusieurs
  // (note 1, ses trois grilles) : `sousTableau` les distingue.
  const tableaux = resultat?.notes.filter((n) => n.code === codeSelectionne) ?? [];

  // Ordre croissant des numéros de note (1, 2, 3… 5A…5H… 35) · le back ne
  // le garantit pas (voir compareCodesNotes ci-dessus).
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
        jeu: jeuRattachement,
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
        jeu: jeuRattachement,
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

  // Rattachement des sous-comptes du dossier · l'état vit ici (c'est cet
  // écran qui appelle le serveur), le rendu est celui de NotesAnnexesRendu.
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

  if (referentielSyscohada) {
    return <EnConstructionSyscohada fenetre="Notes annexes" />;
  }

  // Dossier au Système minimal de trésorerie : cette fenêtre n'a pas de
  // catalogue à lui présenter. Ses cinq notes sont dans l'écran des états
  // financiers, où elles sont servies directement (Partie 4, ch. 4, Section 3).
  if (jeuSmt) {
    return (
      <div className="p-2">
        <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
        <h1 className="text-[12px] font-bold leading-tight mb-2">Notes annexes</h1>
        <div className="border border-border bg-surface px-3.5 py-3 max-w-[620px]">
          <p className="text-[11px] mb-2">
            Ce dossier est tenu au Système minimal de trésorerie. Le SYCEBNL ne lui demande pas les 35 notes des
            associations ni les 24 des projets de développement, mais cinq notes propres : acquisition et suivi des
            immobilisations, état des stocks, état des créances et des dettes non échues, journal unique de
            trésorerie et dotation.
          </p>
          <p className="text-[11px] text-text-dim">
            Elles sont servies dans l'écran <span className="font-semibold">États financiers</span>, onglets
            « Journal de trésorerie » et « Notes annexes ».
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-2">
      <EnteteImpression titre="Notes annexes" />
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            Notes annexes
            <Aide sujet="notesAnnexes" />
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
        Jeu «{' '}
        {jeuProjet ? 'Projets de développement et assimilés' : 'Associations et ordres professionnels'} » (SYCEBNL) ·{' '}
        {resultat ? `${resultat.couverture.transcrites} notes sur ${resultat.couverture.attendues} attendues.` : 'chargement…'}
        {jeuProjet && (
          <>
            {' '}
            La NOTE 9 « Fonds du bailleur » a des colonnes dynamiques par bailleur : voir l'onglet dédié des{' '}
            <a href="#/etats-financiers" className="text-sel hover:underline">
              États financiers
            </a>
            .
          </>
        )}
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
        <div className="flex gap-3 items-start">
          {/* --- Fiche récapitulative : NOTES | INTITULES | A / N-A --- */}
          <FicheRecapitulativeNotes
            fiche={ficheTriee}
            codeSelectionne={codeSelectionne}
            onSelectionner={setCodeSelectionne}
          />

          {/* --- Détail du/des tableau(x) du code sélectionné --- */}
          <div className="flex-1 min-w-0">
            {tableaux.length === 0 && (
              <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Sélectionnez une note.</div>
            )}
            {tableaux.map((n) => (
              <BlocTableauNote key={n.sousTableau ?? n.code} note={n} rattachement={rattachement} />
            ))}
          </div>
        </div>
      )}

      {/* Encadré de signature · CPCC § 7.4 règle 7-b, imprimé uniquement. */}
      <BlocCertification />
    </div>
  );
}
