import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';

interface DocumentTiers {
  id: string;
  nomFichier: string;
  typeMime: string;
  taille: number;
  commentaire: string | null;
  deposePar: string | null;
  createdAt: string;
}

/** Sage i7 : « un commentaire de 69 caractères » · même borne qu'au serveur. */
const LONGUEUR_COMMENTAIRE = 69;
const TAILLE_MAX = 5 * 1024 * 1024;
const FORMATS = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.doc,.xls';

function taille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

/**
 * Volet « Documents » de la fiche tiers (point 21 de la comparaison Sage i7).
 * La pièce est rangée en base, 5 Mo au plus, et ne se rend qu'en
 * téléchargement · jamais affichée dans la page. La consultation est ouverte
 * à tous ; le dépôt, le commentaire et le retrait suivent `peutEcrire`.
 */
export function VoletDocumentsTiers({ tiersId }: { tiersId: string }) {
  const { peutEcrire } = useAuth();
  const [documents, setDocuments] = useState<DocumentTiers[]>([]);
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [edition, setEdition] = useState<{ id: string; texte: string } | null>(null);
  const champFichier = useRef<HTMLInputElement>(null);

  const recharger = () =>
    api
      .get<DocumentTiers[]>(`/tiers/${tiersId}/documents`)
      .then(setDocuments)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Documents illisibles'));

  // UNE RÉPONSE ARRIVÉE APRÈS UN CHANGEMENT DE TIERS EST IGNORÉE · sans ce
  // drapeau, la liste de A lente à venir s'afficherait sous la fiche de B, et
  // « Retirer » y supprimerait une pièce de A en croyant agir sur B. Le parent
  // pose aussi `key={tiersId}`, qui remonte le volet et vide le champ fichier.
  useEffect(() => {
    let actuel = true;
    api
      .get<DocumentTiers[]>(`/tiers/${tiersId}/documents`)
      .then((l) => actuel && setDocuments(l))
      .catch((e) => actuel && setErreur(e instanceof ApiError ? e.message : 'Documents illisibles'));
    return () => {
      actuel = false;
    };
  }, [tiersId]);

  const deposer = async (e: FormEvent) => {
    e.preventDefault();
    const fichier = champFichier.current?.files?.[0];
    if (!fichier) return;
    // Refus immédiat · envoyer 40 Mo pour se les voir refuser coûte une
    // minute de liaison. Le serveur refuse de toute façon au-delà.
    if (fichier.size > TAILLE_MAX) {
      setErreur('Le fichier dépasse 5 Mo · réduisez-le ou numérisez-le en plus basse définition.');
      return;
    }
    const corps = new FormData();
    corps.append('fichier', fichier);
    if (commentaire.trim()) corps.append('commentaire', commentaire.trim());
    setEnvoi(true);
    setErreur(null);
    try {
      await api.envoyerFichier(`/tiers/${tiersId}/documents`, corps);
      setCommentaire('');
      if (champFichier.current) champFichier.current.value = '';
      await recharger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Dépôt impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const telecharger = async (d: DocumentTiers) => {
    setErreur(null);
    try {
      await api.telecharger(`/documents-tiers/${d.id}/fichier`, d.nomFichier);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Téléchargement impossible');
    }
  };

  const enregistrerCommentaire = async () => {
    if (!edition) return;
    setErreur(null);
    try {
      await api.patch(`/documents-tiers/${edition.id}`, { commentaire: edition.texte });
      setEdition(null);
      await recharger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Commentaire non enregistré');
    }
  };

  const retirer = async (d: DocumentTiers) => {
    if (!window.confirm(`Retirer « ${d.nomFichier} » de la fiche ? La pièce est supprimée.`)) return;
    setErreur(null);
    try {
      await api.delete(`/documents-tiers/${d.id}`);
      await recharger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Retrait impossible');
    }
  };

  return (
    <div className="border-t border-border pt-2.5 mt-3">
      <div className="text-[11px] font-bold text-text-dim mb-1.5 flex items-center gap-1.5">
        Documents
        <Aide
          titre="Documents du tiers"
          texte="Pièces attachées au tiers (statuts, RCCM, contrat, attestation) · PDF, image, Word ou Excel, 5 Mo au plus, avec un commentaire de 69 caractères. Le format est vérifié sur le contenu du fichier, pas sur son nom. La pièce est conservée dans le dossier, suit la sauvegarde et sort dans l'archive de restitution."
          source="Sage i7, fiche tiers, sous-volet Documents · bornes d'OmegaX"
        />
      </div>
      {erreur && <div className="text-[11px] text-danger mb-1.5">{erreur}</div>}
      {documents.length === 0 && <div className="text-[11.5px] text-text-dim mb-2">Aucun document.</div>}
      {documents.map((d) => (
        <div key={d.id} className="border border-border mb-1.5 px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => telecharger(d)}
              className="text-sel hover:underline truncate text-left"
              title="Télécharger"
            >
              {d.nomFichier}
            </button>
            <span className="text-[11px] text-text-dim shrink-0">{taille(d.taille)}</span>
          </div>
          {edition?.id === d.id ? (
            <div className="flex gap-1.5 mt-1">
              <input
                autoFocus
                maxLength={LONGUEUR_COMMENTAIRE}
                value={edition.texte}
                onChange={(e) => setEdition({ id: d.id, texte: e.target.value })}
                className="flex-1 min-w-0 border border-border-dark px-1.5 py-0.5 text-[11.5px]"
              />
              <button type="button" onClick={enregistrerCommentaire} className="text-[11px] text-sel hover:underline">
                OK
              </button>
              <button type="button" onClick={() => setEdition(null)} className="text-[11px] text-text-dim hover:underline">
                Annuler
              </button>
            </div>
          ) : (
            d.commentaire && <div className="text-[11px] mt-0.5">{d.commentaire}</div>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-text-dim truncate">
              {new Date(d.createdAt).toLocaleDateString('fr-FR')}
              {d.deposePar && ` · ${d.deposePar}`}
            </span>
            {peutEcrire && edition?.id !== d.id && (
              <span className="flex gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEdition({ id: d.id, texte: d.commentaire ?? '' })}
                  className="text-[11px] text-sel hover:underline"
                >
                  Commentaire
                </button>
                <button type="button" onClick={() => retirer(d)} className="text-[11px] text-danger hover:underline">
                  Retirer
                </button>
              </span>
            )}
          </div>
        </div>
      ))}

      {peutEcrire && (
        <form onSubmit={deposer} className="mt-2">
          <input
            ref={champFichier}
            type="file"
            required
            accept={FORMATS}
            className="w-full text-[11px] mb-1.5"
            aria-label="Fichier à attacher"
          />
          <div className="flex gap-1.5">
            <input
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              maxLength={LONGUEUR_COMMENTAIRE}
              placeholder="Commentaire (69 caractères)"
              className="flex-1 min-w-0 border border-border-dark px-2 py-1 text-[11.5px]"
            />
            <button
              type="submit"
              disabled={envoi}
              className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1 disabled:opacity-60"
            >
              {envoi ? 'Envoi…' : 'Attacher'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
