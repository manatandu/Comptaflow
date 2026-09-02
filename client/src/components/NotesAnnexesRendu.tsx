import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { Compte, LigneFicheRecapitulative, LigneNoteCalculee, NoteCalculee } from '../lib/types';

/**
 * RENDU DES NOTES ANNEXES · pièces d'affichage communes aux deux écrans de
 * notes, le SYCEBNL (`NotesAnnexesPage`) et le SYSCOHADA
 * (`NotesAnnexesSyscohadaPage`).
 *
 * CE QUI EST COMMUN, ET POURQUOI CE N'EST PAS UN MÉLANGE DES DEUX
 * RÉFÉRENTIELS · rien ici ne connaît un poste, un compte, une note ni un
 * libellé officiel. Ce fichier ne sait qu'une chose : comment se dessine une
 * `NoteCalculee`, structure rendue par le moteur déclaratif commun
 * (`note-annexe.types.ts`, seul partage autorisé par CLAUDE.md §6). Les
 * NOTES, elles, restent chacune dans leur table · `NOTES_ASSOCIATIONS` et
 * `NOTES_PROJETS` d'un côté, `NOTES_SYSCOHADA` de l'autre, et le serveur
 * refuse un jeu étranger au référentiel du dossier.
 *
 * L'extraction évite la seule chose qu'une copie d'écran garantit : deux
 * rendus qui divergent en silence, l'un corrigé et pas l'autre. Les DEUX
 * garde-fous que l'écran SYCEBNL respectait sont conservés tels quels :
 *
 * 1. une rubrique n'est proposée au rattachement QUE si elle porte
 *    `subdivisionAttendue` (donc une `cle`) · le serveur refuse toute
 *    tentative sur une rubrique que le plan officiel détermine déjà
 *    (`NoteAnnexeService.rubriqueRattachable`) ;
 * 2. une note non applicable ne présente aucune ligne, mais ses rubriques en
 *    attente restent visibles et rattachables · sans quoi une note vide
 *    serait un cul-de-sac. D'où l'usage de `note.rubriquesEnAttente`
 *    (calculé indépendamment d'`applicable`) plutôt qu'une liste dérivée de
 *    `note.lignes`, qui peut être vide.
 *
 * Ce que chaque écran garde pour lui : le chargement, la route d'export, le
 * jeu visé par un rattachement, et les phrases qui citent SON texte.
 */

/**
 * Tri croissant des codes de note. Les deux référentiels numérotent leurs
 * notes dans l'ordre officiel, mais rien côté serveur ne garantit que
 * `ficheRecapitulative` sorte déjà ainsi (l'ordre de déclaration de la table
 * est libre). Numéro d'abord, puis suffixe.
 *
 * Le suffixe admet des ESPACES, et ce n'est pas de la coquetterie : la liste
 * de l'AUDCIF Titre IX ch. 6 section 2 contient un code « 16B bis ». Avec un
 * suffixe restreint aux lettres, il ne serait reconnu par aucune des deux
 * branches et se retrouverait rejeté en fin de liste, entre la note 36 et
 * rien. Les codes SYCEBNL (« 5A », « 17B », « 29B ») n'ont pas d'espace : ce
 * tri leur rend exactement l'ordre qu'ils avaient.
 */
export function compareCodesNotes(a: string, b: string): number {
  const decouper = (s: string) => {
    const m = /^(\d+)\s*([A-Za-z ]*)$/.exec(s);
    return m ? { num: Number(m[1]), suffixe: m[2].trim() } : { num: Number.MAX_SAFE_INTEGER, suffixe: s };
  };
  const pa = decouper(a);
  const pb = decouper(b);
  return pa.num !== pb.num ? pa.num - pb.num : pa.suffixe.localeCompare(pb.suffixe);
}

/** Montant d'une cellule de note · « · » quand la colonne n'a pas de valeur,
 *  ce qui ne se confond pas avec un zéro comptable. */
export function montantNote(v: number | undefined): string {
  return v === undefined ? '·' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Tout ce dont le bloc d'une note a besoin pour offrir le rattachement des
 * sous-comptes du dossier. Regroupé en un objet plutôt qu'en huit props :
 * les deux écrans passent le même état, et un paramètre oublié à l'appel se
 * verrait alors comme un simple `undefined` au lieu d'une erreur de type.
 */
export interface RattachementNotes {
  estAdmin: boolean;
  /** Comptes DÉTAIL actifs · un compte TOTAL n'a jamais de mouvement propre
   *  et le serveur le refuse : le proposer ferait essuyer un 400. */
  comptesDetail: Compte[];
  compteParNumero: Map<string, Compte>;
  /** Compte choisi dans le sélecteur, par clé « codeNote::cleRubrique ». */
  compteChoisi: Record<string, string>;
  setCompteChoisi: Dispatch<SetStateAction<Record<string, string>>>;
  /** « codeNote::cle::compteId » en cours d'envoi, ou null. */
  enCours: string | null;
  rattacher: (codeNote: string, cleRubrique: string) => void;
  detacher: (codeNote: string, cleRubrique: string, compteId: string) => void;
}

/**
 * Ce que l'écran dit d'une note que l'exercice ne chiffre pas. Le texte par
 * défaut est celui de l'écran SYCEBNL, et il vaut aussi pour le SYSCOHADA :
 * dans les deux cas l'export JOINT la note, avec la mention NEANT
 * (`ExportService.construireClasseurNotes`, qui porte la décision du cabinet
 * et l'écart assumé avec le renvoi officiel). Un écran qui dirait autre
 * chose que le fichier produit ferait mentir l'un des deux.
 */
const MENTION_NEANT_PAR_DEFAUT =
  'Néant cet exercice · aucune rubrique chiffrée. La note est cochée « N/A » sur la fiche récapitulative et ' +
  'reste jointe à la liasse, où elle porte la mention NEANT.';

function valeurColonne(l: LigneNoteCalculee, type: string): number | undefined {
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
}

/** Une ligne de tableau · colonnes dynamiques selon `note.colonnes`. */
function LigneTableauNote({ note, ligne }: { note: NoteCalculee; ligne: LigneNoteCalculee }) {
  return (
    <div
      title={ligne.comptes.length > 0 ? `Comptes : ${ligne.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid gap-2 px-4 py-1 text-[11px] ${ligne.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''}`}
      style={{ gridTemplateColumns: `1.6fr repeat(${note.colonnes.length}, 108px)` }}
    >
      <span className={ligne.enAttenteDeRattachement ? 'text-danger italic' : ''}>
        {ligne.libelle}
        {ligne.enAttenteDeRattachement && ' ⚠'}
      </span>
      {note.colonnes.map((c, ci) => {
        const v = valeurColonne(ligne, c.type);
        return (
          <span key={ci} className="font-mono text-right text-text-dim">
            {c.type === 'LIBRE'
              ? ''
              : c.type === 'VARIATION_POURCENT'
                ? v === undefined
                  ? ''
                  : `${montantNote(v)} %`
                : montantNote(v)}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Un tableau complet · une note, ou l'un des sous-tableaux d'une note qui en
 * porte plusieurs. La clé de rendu appartient à l'appelant
 * (`note.sousTableau ?? note.code`), un composant ne pouvant pas se donner
 * sa propre clé.
 */
export function BlocTableauNote({
  note,
  rattachement,
  mentionNonApplicable = MENTION_NEANT_PAR_DEFAUT,
  afficherHorsBalance = false,
}: {
  note: NoteCalculee;
  rattachement: RattachementNotes;
  mentionNonApplicable?: ReactNode;
  /**
   * Annonce qu'une note `horsBalance` ne se calcule pas depuis la comptabilité.
   * Optionnel, et par défaut ÉTEINT : l'écran SYCEBNL ne l'affichait pas, et
   * l'allumer pour lui changerait un écran en service sans qu'on l'ait
   * demandé. L'écran SYSCOHADA l'allume · ses notes 2, 16C, 27B et 35 sont
   * entièrement en saisie, et un zéro y signifie « pas encore renseigné »,
   * jamais « nul ».
   */
  afficherHorsBalance?: boolean;
}) {
  const { estAdmin, comptesDetail, compteParNumero, compteChoisi, setCompteChoisi, enCours, rattacher, detacher } =
    rattachement;

  // Rubriques déjà rattachées par le dossier : lues sur les LIGNES (pas la
  // fiche récapitulative, qui ne porte que ce qui reste EN ATTENTE) · pour
  // une rubrique `subdivisionAttendue`, le plan officiel ne lui donne aucun
  // compte propre, donc tout `l.comptes` vient du rattachement.
  const rattachees = note.lignes.filter((l) => l.cle && l.rattachementDuDossier);

  return (
    <div className="border border-border bg-surface mb-4">
      <div className="px-4 py-2 border-b border-border bg-chrome">
        <div className="text-[11px] font-bold">
          NOTE {note.code}
          {note.sousTableau ? ` ${note.sousTableau}` : ''} {note.titre}
        </div>
        {note.renvoyeeDepuis && note.renvoyeeDepuis.length > 0 && (
          <div className="text-[10px] text-text-dim mt-0.5">Renvoyée depuis les postes : {note.renvoyeeDepuis.join(', ')}</div>
        )}
      </div>

      {/* Le logiciel JOINT toutes les notes à la liasse, les vides portant
          la mention NEANT · l'écran doit dire la même chose que le fichier
          produit, sans quoi l'un des deux ment. */}
      {!note.applicable && <div className="px-4 py-3 text-[10.5px] text-text-dim italic">{mentionNonApplicable}</div>}

      {afficherHorsBalance && note.horsBalance && (
        <div className="px-4 py-2 text-[10px] text-text-dim italic border-b border-border">
          Note renseignée hors comptabilité · aucune balance ne porte ces rubriques. Un montant à zéro signifie
          qu'elles n'ont pas encore été renseignées, non qu'elles soient nulles.
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
          {note.lignes.map((l, i) => (
            <LigneTableauNote key={`${l.cle ?? l.libelle}-${i}`} note={note} ligne={l} />
          ))}
        </div>
      )}

      {(note.commentaire || note.renvoiOfficiel) && (
        <div className="px-4 py-2 text-[10px] text-text-dim border-t border-border italic">
          {note.renvoiOfficiel && <div className="mb-1">{note.renvoiOfficiel}</div>}
          {note.commentaire && <div>Commentaire officiel : {note.commentaire}</div>}
        </div>
      )}

      {/* --- Rattachement : rubriques en attente + comptes déjà rattachés --- */}
      {(note.rubriquesEnAttente.length > 0 || rattachees.length > 0) && (
        <div className="border-t border-border px-4 py-3 bg-surface-alt">
          <div className="text-[10px] font-bold text-text-dim mb-2">RATTACHEMENT DES SOUS-COMPTES DU DOSSIER</div>

          {rattachees.map((l) => (
            <div key={l.cle} className="mb-2 text-[10.5px]">
              <span className="font-semibold">{l.libelle}</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {l.comptes.map((c) => (
                  <span
                    key={c.numero}
                    className="inline-flex items-center gap-1.5 border border-border bg-surface px-2 py-0.5 font-mono text-[10px]"
                  >
                    {c.numero} · {c.intitule}
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
                <div className="text-[10.5px] font-semibold text-danger">{r.libelle}</div>
                <div className="text-[10px] text-text-dim mb-1.5">{r.attendu}</div>
                {estAdmin ? (
                  // `flex-wrap` et `min-w-0` sont la SEULE différence de rendu
                  // avec l'écran SYCEBNL d'origine, et elle ne se voit qu'en
                  // dessous de ~420 px : sans eux, le sélecteur de compte
                  // refuse de descendre sous la largeur de son plus long
                  // intitulé et pousse le bouton « Rattacher » hors de
                  // l'écran (même défaut que ceux relevés dans
                  // chrome-etroit.spec.ts). À la largeur d'un bureau, le
                  // rendu est identique au précédent.
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={compteChoisi[cleForm] ?? ''}
                      onChange={(e) => setCompteChoisi((v) => ({ ...v, [cleForm]: e.target.value }))}
                      className="border border-border-dark px-2 py-1 text-[10.5px] max-w-[360px] min-w-0"
                    >
                      <option value="">choisir un sous-compte</option>
                      {comptesDetail.map((c) => (
                        <option key={c.id} value={c.numero}>
                          {c.numero} · {c.intitule}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => rattacher(note.code, r.cle)}
                      disabled={!compteChoisi[cleForm] || enCours !== null}
                      className="bg-sel text-white text-[10.5px] font-semibold px-3 py-1 disabled:opacity-50"
                    >
                      Rattacher
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-text-dim italic">Réservé à l'administrateur du cabinet.</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * FICHE RÉCAPITULATIVE · la colonne NOTE | INTITULÉ | A / N-A. Elle fait
 * partie de la liasse dans les deux référentiels : elle déclare, note par
 * note, si elle est applicable ou non.
 *
 * `className` reste à l'appelant · l'écran SYCEBNL la fige à 360 px de large
 * comme il le faisait, l'écran SYSCOHADA la laisse passer pleine largeur
 * sous le point de rupture pour rester lisible sur un écran de 360 px.
 */
export function FicheRecapitulativeNotes({
  fiche,
  codeSelectionne,
  onSelectionner,
  className = 'w-[360px] shrink-0',
}: {
  fiche: LigneFicheRecapitulative[];
  codeSelectionne: string | null;
  onSelectionner: (code: string) => void;
  className?: string;
}) {
  return (
    <div className={`${className} border border-border bg-surface`}>
      <div className="grid grid-cols-[52px_1fr_28px] gap-2 px-3 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim sticky top-0">
        <span>NOTE</span>
        <span>INTITULÉ</span>
        <span />
      </div>
      {fiche.map((f) => (
        <button
          key={f.code}
          onClick={() => onSelectionner(f.code)}
          className={`w-full text-left grid grid-cols-[52px_1fr_28px] gap-2 px-3 py-1.5 border-b border-border last:border-b-0 text-[10.5px] ${
            codeSelectionne === f.code ? 'bg-sel-soft' : f.applicable ? 'hover:bg-surface-alt' : 'text-text-dim'
          }`}
        >
          <span className="font-mono">{f.code}</span>
          <span className="truncate">{f.titre}</span>
          <span
            className={`font-mono text-[10px] font-bold text-center px-1 py-0.5 w-fit justify-self-end ${
              f.applicable ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
            }`}
          >
            {f.applicable ? 'A' : 'N/A'}
          </span>
        </button>
      ))}
    </div>
  );
}
