import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Compte, Journal } from '../lib/types';
import { useAuth } from '../lib/auth';
import { compteUnique, motifAucunCompteRetenu, RETENUS } from '../lib/comptes-proposes';
import { corpsComptabilisation, passageComplet, receptionADeclarer } from '../lib/reception-facture';

/**
 * PASSER L'ÉCRITURE D'UNE FACTURE · le comptable choisit le journal et le
 * compte de produit ou de charge, le serveur compose l'écriture (tiers, TVA
 * par taux) et la pose au brouillard. Rien n'est deviné à l'écran.
 */
export function PasserEcritureFacture({
  facture,
  onFait,
}: {
  facture: { id: string; sens: 'VENTE' | 'ACHAT'; dateReception?: string | null };
  /** `avis` · l'avertissement du serveur (facture d'un exercice reçue dans le suivant). */
  onFait: (avis?: string) => void;
}) {
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
  // Réception d'une facture reçue qui ne la porte pas (ligne A21) · vide,
  // jamais préremplie de la date de facture ni d'aujourd'hui.
  const [dateReception, setDateReception] = useState('');
  const aDeclarer = receptionADeclarer(facture);
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
    // Liste de choix · comptes retenus ou utilisés (`lib/comptes-proposes.ts`) ;
    // un seul compte proposé se présélectionne (§ 9 ter).
    api.get<Compte[]>(`/comptes?${RETENUS}`).then((cs) => {
      const proposes = cs.filter(
        (c) => c.typeCompte === 'DETAIL' && c.estActif && (facture.sens === 'VENTE' ? c.numero.startsWith('7') : c.numero.startsWith('6') || c.numero.startsWith('2')),
      );
      setComptes(proposes);
      setCompteId((v) => v || compteUnique(proposes));
    }, echec);
  }, [ouvert, facture.sens]);

  const passer = async () => {
    setErreur(null);
    try {
      const r = await api.post<{ avertissement?: string }>(
        `/facturation/${facture.id}/comptabiliser`,
        corpsComptabilisation(facture, journalId, compteId, dateReception),
      );
      setOuvert(false);
      onFait(r?.avertissement);
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
      {aDeclarer && (
        <label className="inline-flex items-center gap-1" title="AUDCIF art. 16, al. 2 · l’écriture d’une facture reçue se date à sa réception">
          Reçue le
          <input
            type="date"
            aria-label="Date de réception"
            className="border border-border px-1 py-0.5"
            value={dateReception}
            onChange={(e) => setDateReception(e.target.value)}
          />
        </label>
      )}
      <button
        className="border border-border px-1.5 py-0.5"
        disabled={!passageComplet(facture, journalId, compteId, dateReception)}
        onClick={() => void passer()}
      >
        Passer au brouillard
      </button>
      <button className="px-1.5 py-0.5 text-text-dim" onClick={() => setOuvert(false)}>
        Annuler
      </button>
      {erreurLecture && <p className="text-danger w-full">Lecture impossible · {erreurLecture}</p>}
      {!erreurLecture && journaux?.length === 0 && (
        <p className="text-warning w-full">Aucun journal {facture.sens === 'VENTE' ? 'de ventes' : "d'achats"} actif.</p>
      )}
      {!erreurLecture && comptes?.length === 0 && (
        <p className="text-warning w-full">
          {motifAucunCompteRetenu(comptes, facture.sens === 'VENTE' ? 'de produit (classe 7)' : "de charge ou d'immobilisation (classes 6 et 2)")}
        </p>
      )}
      {erreur && <p className="text-danger w-full">{erreur}</p>}
    </div>
  );
}
