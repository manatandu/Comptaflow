import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Compte, Journal } from '../lib/types';
import { useAuth } from '../lib/auth';

/**
 * PASSER L'ÉCRITURE D'UNE FACTURE · le comptable choisit le journal et le
 * compte de produit ou de charge, le serveur compose l'écriture (tiers, TVA
 * par taux) et la pose au brouillard. Rien n'est deviné à l'écran.
 */
export function PasserEcritureFacture({ facture, onFait }: { facture: { id: string; sens: 'VENTE' | 'ACHAT' }; onFait: () => void }) {
  // Passer l'écriture d'une facture la pose AU BROUILLARD, comme la saisie
  // que l'aide-comptable fait déjà à la main · la route ne la lui refuse pas
  // (`@Roles` sans `@ReserveAuComptable`), l'écran la lui ouvre donc aussi.
  // L'ancien commentaire le disait « refusé » : c'était faux (audit I7).
  const { peutEcrire } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  // Null tant que rien n'est lu (audit final F255) · un refus laissait deux
  // listes vides, sans un mot, et le comptable ne savait pas si le dossier
  // n'avait aucun journal de ventes ou si la lecture avait échoué.
  const [journaux, setJournaux] = useState<Journal[] | null>(null);
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [journalId, setJournalId] = useState('');
  const [compteId, setCompteId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    const type = facture.sens === 'VENTE' ? 'VENTES' : 'ACHATS';
    const echec = (e: unknown) => setErreurLecture(e instanceof Error ? e.message : 'Journaux et comptes illisibles.');
    setErreurLecture(null);
    api.get<Journal[]>('/journaux').then((js) => {
      const ok = js.filter((j) => j.type === type && j.estActif);
      setJournaux(ok);
      if (ok.length === 1) setJournalId(ok[0].id);
    }, echec);
    api.get<Compte[]>('/comptes').then(
      (cs) =>
        setComptes(
          cs.filter(
            (c) => c.typeCompte === 'DETAIL' && c.estActif && (facture.sens === 'VENTE' ? c.numero.startsWith('7') : c.numero.startsWith('6') || c.numero.startsWith('2')),
          ),
        ),
      echec,
    );
  }, [ouvert, facture.sens]);

  const passer = async () => {
    setErreur(null);
    try {
      await api.post(`/facturation/${facture.id}/comptabiliser`, { journalId, compteGestionId: compteId || null });
      setOuvert(false);
      onFait();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’écriture n’a pas pu être passée.');
    }
  };

  if (!peutEcrire) return null;
  if (!ouvert) {
    return (
      <button className="mt-1 text-[11px] underline text-text-dim block" onClick={() => setOuvert(true)}>
        Passer l’écriture
      </button>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap gap-1 items-center text-[11px]">
      <select aria-label="Journal" className="border border-border px-1 py-0.5" value={journalId} onChange={(e) => setJournalId(e.target.value)}>
        <option value="">Journal…</option>
        {(journaux ?? []).map((j) => (
          <option key={j.id} value={j.id}>
            {j.code} · {j.intitule}
          </option>
        ))}
      </select>
      <select aria-label="Compte" className="border border-border px-1 py-0.5 max-w-[220px]" value={compteId} onChange={(e) => setCompteId(e.target.value)}>
        <option value="">{facture.sens === 'VENTE' ? 'Compte de produit…' : 'Compte de charge…'}</option>
        {(comptes ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.numero} · {c.intitule}
          </option>
        ))}
      </select>
      <button className="border border-border px-1.5 py-0.5" disabled={!journalId || !compteId} onClick={() => void passer()}>
        Passer au brouillard
      </button>
      <button className="px-1.5 py-0.5 text-text-dim" onClick={() => setOuvert(false)}>
        Annuler
      </button>
      {erreurLecture && <p className="text-danger w-full">Lecture impossible · {erreurLecture}</p>}
      {!erreurLecture && journaux?.length === 0 && (
        <p className="text-warning w-full">Aucun journal {facture.sens === 'VENTE' ? 'de ventes' : "d'achats"} actif.</p>
      )}
      {erreur && <p className="text-danger w-full">{erreur}</p>}
    </div>
  );
}
