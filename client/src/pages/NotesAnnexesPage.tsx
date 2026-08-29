import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport } from '../components/chrome/icons';
import type { Compte, LigneNoteCalculee, NoteCalculee, ResultatNotesJeu } from '../lib/types';

/**
 * Notes annexes SYCEBNL — les deux jeux (45 notes « associations et ordres
 * professionnels », 26 notes « projets de développement »), plus le
 * rattachement des sous-comptes du dossier aux rubriques que le plan de
 * comptes normalisé ne permet pas de déterminer seul (voir
 * `NoteAnnexeService`, `note-annexe.types.ts`).
 *
 * Deux garde-fous côté serveur que cet écran RESPECTE plutôt que contourne :
 *
 * 1. Une rubrique n'est proposée au rattachement QUE si elle porte
 *    `subdivisionAttendue` (donc une `cle`) — le back refuse explicitement
 *    toute tentative sur une rubrique que le plan officiel détermine déjà
 *    (`NoteAnnexeService.rubriqueRattachable`). Cet écran ne propose donc un
 *    sélecteur QUE pour les rubriques qui portent une `cle` : les autres
 *    n'en ont pas les moyens, il n'y a rien à choisir.
 * 2. § 1.4 : une note non applicable ne présente aucune ligne. Ses rubriques
 *    en attente restent néanmoins visibles et rattachables — sans quoi une
 *    note entièrement vide serait un cul-de-sac (voir `RubriqueEnAttente`
 *    dans note-annexe.types.ts). D'où l'usage de `note.rubriquesEnAttente`
 *    (calculé indépendamment de `applicable`) plutôt que de dériver la liste
 *    depuis `note.lignes`, qui peut être vide.
 */
export function NotesAnnexesPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur, estAdmin } = useAuth();
  const jeuProjet = utilisateur?.tenant.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT';
  const chemin = jeuProjet ? 'projet' : 'associations';

  const [resultat, setResultat] = useState<ResultatNotesJeu | null>(null);
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [codeSelectionne, setCodeSelectionne] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);
  // Compte sélectionné dans le formulaire de rattachement, par clé de rubrique.
  const [compteChoisi, setCompteChoisi] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null); // "codeNote::cle::compteId" en cours d'envoi

  const charger = () => {
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

  const montant = (v: number | undefined) =>
    v === undefined ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Comptes DÉTAIL seulement : un compte Total est refusé par le back (il n'a
  // jamais de mouvement propre, la rubrique resterait vide) — inutile de le
  // proposer et de laisser l'utilisateur essuyer un 400.
  const comptesDetail = useMemo(() => (comptes ?? []).filter((c) => c.typeCompte === 'DETAIL' && c.estActif), [comptes]);
  const compteParNumero = useMemo(() => new Map((comptes ?? []).map((c) => [c.numero, c])), [comptes]);

  // Tableaux du code actuellement affiché — un code peut en porter plusieurs
  // (note 1, ses trois grilles) : `sousTableau` les distingue.
  const tableaux = resultat?.notes.filter((n) => n.code === codeSelectionne) ?? [];

  // Sélection par défaut : la première note applicable, pour ne pas ouvrir
  // l'écran sur un tableau vide.
  useEffect(() => {
    if (!resultat || codeSelectionne) return;
    const premiereApplicable = resultat.ficheRecapitulative.find((f) => f.applicable);
    setCodeSelectionne(premiereApplicable?.code ?? resultat.ficheRecapitulative[0]?.code ?? null);
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
        jeu: jeuProjet ? 'PROJETS_DEVELOPPEMENT' : 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
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
        jeu: jeuProjet ? 'PROJETS_DEVELOPPEMENT' : 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
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

  // --- Une ligne de tableau, colonnes dynamiques selon `note.colonnes` ---
  const valeurColonne = (l: LigneNoteCalculee, type: string): number | undefined => {
    switch (type) {
      case 'EXERCICE_N':
        return l.montantN;
      case 'EXERCICE_N1':
        return l.montantN1;
      case 'VARIATION_VALEUR':
        return l.variationValeur;
      case 'VARIATION_POURCENT':
        return l.variationPourcent;
      case 'LIBRE':
        return undefined;
      default:
        return l.valeurs?.[type as keyof typeof l.valeurs];
    }
  };

  const ligneTableau = (note: NoteCalculee, l: LigneNoteCalculee, i: number) => (
    <div
      key={`${l.cle ?? l.libelle}-${i}`}
      title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid gap-2 px-4 py-1 text-[12px] ${l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''}`}
      style={{ gridTemplateColumns: `1.6fr repeat(${note.colonnes.length}, 108px)` }}
    >
      <span className={l.enAttenteDeRattachement ? 'text-danger italic' : ''}>
        {l.libelle}
        {l.enAttenteDeRattachement && ' ⚠'}
      </span>
      {note.colonnes.map((c, ci) => {
        const v = valeurColonne(l, c.type);
        return (
          <span key={ci} className="font-mono text-right text-text-dim">
            {c.type === 'LIBRE' ? '—' : c.type === 'VARIATION_POURCENT' ? (v === undefined ? '—' : `${montant(v)} %`) : montant(v)}
          </span>
        );
      })}
    </div>
  );

  // --- Un tableau complet (une note ou l'un des sous-tableaux d'une note) ---
  const blocTableau = (note: NoteCalculee) => {
    // Rubriques déjà rattachées par le dossier : lues sur les LIGNES (pas la
    // fiche récapitulative, qui ne porte que ce qui reste EN ATTENTE) — pour
    // une rubrique `subdivisionAttendue`, le plan officiel ne lui donne
    // aucun compte propre, donc tout `l.comptes` vient du rattachement.
    const rattachees = note.lignes.filter((l) => l.cle && l.rattachementDuDossier);

    return (
      <div key={note.sousTableau ?? note.code} className="border border-border bg-surface mb-4">
        <div className="px-4 py-2 border-b border-border bg-chrome">
          <div className="text-[12.5px] font-bold">
            NOTE {note.code}
            {note.sousTableau ? ` — ${note.sousTableau}` : ''} — {note.titre}
          </div>
          {note.renvoyeeDepuis && note.renvoyeeDepuis.length > 0 && (
            <div className="text-[10px] text-text-dim mt-0.5">Renvoyée depuis les postes : {note.renvoyeeDepuis.join(', ')}</div>
          )}
        </div>

        {!note.applicable && (
          <div className="px-4 py-3 text-[11.5px] text-text-dim italic">
            Non applicable cet exercice — aucune rubrique chiffrée. « les Notes non documentées ne doivent pas être
            jointes aux états financiers » (texte officiel).
          </div>
        )}

        {note.applicable && note.lignes.length > 0 && (
          <div className="overflow-x-auto">
            <div
              className="grid gap-2 px-4 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim"
              style={{ gridTemplateColumns: `1.6fr repeat(${note.colonnes.length}, 108px)` }}
            >
              <span>LIBELLÉ</span>
              {note.colonnes.map((c, i) => (
                <span key={i} className="text-right">
                  {c.libelle}
                </span>
              ))}
            </div>
            {note.lignes.map((l, i) => ligneTableau(note, l, i))}
          </div>
        )}

        {(note.commentaire || note.renvoiOfficiel) && (
          <div className="px-4 py-2 text-[10.5px] text-text-dim border-t border-border italic">
            {note.renvoiOfficiel && <div className="mb-1">{note.renvoiOfficiel}</div>}
            {note.commentaire && <div>Commentaire officiel : {note.commentaire}</div>}
          </div>
        )}

        {/* --- Rattachement : rubriques en attente + comptes déjà rattachés --- */}
        {(note.rubriquesEnAttente.length > 0 || rattachees.length > 0) && (
          <div className="border-t border-border px-4 py-3 bg-surface-alt">
            <div className="text-[10px] font-bold text-text-dim mb-2">RATTACHEMENT DES SOUS-COMPTES DU DOSSIER</div>

            {rattachees.map((l) => (
              <div key={l.cle} className="mb-2 text-[11.5px]">
                <span className="font-semibold">{l.libelle}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {l.comptes.map((c) => (
                    <span
                      key={c.numero}
                      className="inline-flex items-center gap-1.5 border border-border bg-surface px-2 py-0.5 font-mono text-[10.5px]"
                    >
                      {c.numero} — {c.intitule}
                      {estAdmin && (
                        <button
                          onClick={() => {
                            const compte = compteParNumero.get(c.numero);
                            if (compte) detacher(note.code, l.cle!, compte.id);
                          }}
                          disabled={enCours !== null}
                          className="text-danger hover:underline disabled:opacity-50"
                          title="Détacher"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {note.rubriquesEnAttente.map((r) => {
              const cleForm = `${note.code}::${r.cle}`;
              return (
                <div key={r.cle} className="mb-2.5 pb-2.5 border-b border-border last:border-b-0 last:pb-0 last:mb-0">
                  <div className="text-[11.5px] font-semibold text-danger">{r.libelle}</div>
                  <div className="text-[10.5px] text-text-dim mb-1.5">{r.attendu}</div>
                  {estAdmin ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={compteChoisi[cleForm] ?? ''}
                        onChange={(e) => setCompteChoisi((v) => ({ ...v, [cleForm]: e.target.value }))}
                        className="border border-border-dark px-2 py-1 text-[11px] max-w-[360px]"
                      >
                        <option value="">— choisir un sous-compte —</option>
                        {comptesDetail.map((c) => (
                          <option key={c.id} value={c.numero}>
                            {c.numero} — {c.intitule}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => rattacher(note.code, r.cle)}
                        disabled={!compteChoisi[cleForm] || enCours !== null}
                        className="bg-sel text-white text-[11px] font-semibold px-3 py-1 disabled:opacity-50"
                      >
                        Rattacher
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10.5px] text-text-dim italic">Réservé à l'administrateur du cabinet.</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="text-[10.5px] font-mono text-text-dim">ÉTAT</div>
          <h1 className="text-[15px] font-bold">Notes annexes</h1>
        </div>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[11px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          <button
            onClick={exporter}
            disabled={exportEnCours}
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter Excel'}
          </button>
        </div>
      </div>

      <p className="text-[10.5px] text-text-dim mb-2">
        Jeu «{' '}
        {jeuProjet ? 'Projets de développement et assimilés' : 'Associations et ordres professionnels'} » (SYCEBNL) —{' '}
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
          <span className="text-[11.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[11px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      {!resultat && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}

      {resultat && (
        <div className="flex gap-3 items-start">
          {/* --- Fiche récapitulative : NOTES | INTITULES | A / N-A --- */}
          <div className="w-[360px] shrink-0 border border-border bg-surface max-h-[calc(100vh-220px)] overflow-y-auto">
            <div className="grid grid-cols-[52px_1fr_28px] gap-2 px-3 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim sticky top-0">
              <span>NOTE</span>
              <span>INTITULÉ</span>
              <span />
            </div>
            {resultat.ficheRecapitulative.map((f) => (
              <button
                key={f.code}
                onClick={() => setCodeSelectionne(f.code)}
                className={`w-full text-left grid grid-cols-[52px_1fr_28px] gap-2 px-3 py-1.5 border-b border-border last:border-b-0 text-[11.5px] ${
                  codeSelectionne === f.code ? 'bg-sel-soft' : f.applicable ? 'hover:bg-surface-alt' : 'text-text-dim'
                }`}
              >
                <span className="font-mono">{f.code}</span>
                <span className="truncate">{f.titre}</span>
                <span
                  className={`font-mono text-[9px] font-bold text-center px-1 py-0.5 w-fit justify-self-end ${
                    f.applicable ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
                  }`}
                >
                  {f.applicable ? 'A' : 'N/A'}
                </span>
              </button>
            ))}
          </div>

          {/* --- Détail du/des tableau(x) du code sélectionné --- */}
          <div className="flex-1 min-w-0">
            {tableaux.length === 0 && (
              <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Sélectionnez une note.</div>
            )}
            {tableaux.map(blocTableau)}
          </div>
        </div>
      )}
    </div>
  );
}
