import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';
import type { Compte, Ecriture } from '../lib/types';

/**
 * RÉIMPUTATION · déplacer des lignes vers un autre compte, depuis le résultat
 * d'une recherche d'écritures filtrée sur un compte.
 *
 * Le serveur tranche selon le statut (src/modules/comptabilite/reimputation.ts) :
 * une ligne au brouillard change de compte, une ligne validée ne bouge jamais
 * et reçoit une inscription en négatif puis l'enregistrement exact (AUDCIF
 * art. 20 et 22, 2°). L'écran le dit AVANT le clic, ligne par ligne.
 *
 * Les cases arrivent DÉCOCHÉES · réimputer est une décision, pas un défaut.
 */

interface LigneProposee {
  id: string;
  date: string;
  piece: string;
  compteNumero: string;
  libelle: string;
  debit: number;
  credit: number;
  validee: boolean;
}

const fmt = (n: number) => (n ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

export function ModaleReimputation({
  ecritures,
  racineCompte,
  onFermer,
  onTermine,
}: {
  ecritures: Ecriture[];
  /** Le compte (ou la racine) sur lequel la recherche est filtrée. */
  racineCompte: string;
  onFermer: () => void;
  onTermine: (message: string) => void;
}) {
  // Le serveur réserve la route au comptable et à l'administrateur
  // (@ReserveAuComptable) · la modale le lit elle-même, pas seulement le bouton
  // qui l'ouvre, et le bouton « Réimputer » ne sert rien à qui ne peut pas.
  const { peutValider } = useAuth();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [cibleId, setCibleId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    api
      .get<Compte[]>('/comptes')
      .then((c) => setComptes(c.filter((x) => x.typeCompte === 'DETAIL' && x.estActif)))
      .catch(() => setComptes([]));
  }, []);

  const lignes: LigneProposee[] = useMemo(
    () =>
      ecritures.flatMap((e) =>
        e.lignes
          .filter((l) => l.compte?.numero.startsWith(racineCompte))
          .map((l) => ({
            id: l.id,
            date: new Date(e.date).toLocaleDateString('fr-FR'),
            piece: `${e.journal?.code ?? ''} ${e.numeroPiece ?? ''}`.trim(),
            compteNumero: l.compte?.numero ?? '',
            libelle: l.libelle ?? e.libelle,
            debit: Number(l.debit),
            credit: Number(l.credit),
            validee: e.statut === 'VALIDEE',
          })),
      ),
    [ecritures, racineCompte],
  );

  const choisies = lignes.filter((l) => cochees.has(l.id));
  const nbValidees = choisies.filter((l) => l.validee).length;

  const basculer = (id: string) =>
    setCochees((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const reimputer = async () => {
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await api.post<{ auBrouillard: number; validees: number; ecrituresPassees: { numeroPiece: number | null; journal: string }[] }>(
        '/ecritures/reimputation',
        { ligneIds: [...cochees], compteCibleId: cibleId, date, motif },
      );
      const cible = comptes.find((c) => c.id === cibleId)?.numero ?? '';
      const parties = [
        r.auBrouillard ? `${r.auBrouillard} ligne(s) au brouillard déplacée(s)` : '',
        r.validees
          ? `${r.validees} ligne(s) validée(s) corrigée(s) par inscription en négatif (${r.ecrituresPassees
              .map((p) => `${p.journal} ${p.numeroPiece ?? ''}`.trim())
              .join(', ')}, au brouillard)`
          : '',
      ].filter(Boolean);
      onTermine(`Réimputation vers ${cible} · ${parties.join(' ; ')}.`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Réimputation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
      <div
        className="anim-modale w-[760px] max-h-full overflow-auto rounded-[4px] bg-surface border border-border-dark shadow-dominante text-[11.5px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3.5 h-[32px] border-b border-border">
          <span className="font-bold">Réimputer des lignes du {racineCompte}</span>
          <div className="flex items-center gap-2">
            <Aide
              titre="Réimputation"
              texte="Une ligne au brouillard change simplement de compte : elle n'est pas encore au livre-journal. Une ligne validée ne se modifie jamais ; OmegaX passe dans son journal l'inscription en négatif sur le compte erroné puis l'enregistrement exact sur le bon, même sens, même montant, analytique comprise. Lettrage, pointage, TVA, immobilisation et exercice clôturé sont refusés en le disant."
              source="AUDCIF art. 20 et art. 22, 2°"
            />
            <button onClick={onFermer} aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
          <div className="max-h-[40vh] overflow-auto border border-border">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-[28px]" />
                  <th className="text-left px-2 py-1">Date</th>
                  <th className="text-left px-2 py-1">Pièce</th>
                  <th className="text-left px-2 py-1">Compte</th>
                  <th className="text-left px-2 py-1">Libellé</th>
                  <th className="text-right px-2 py-1">Débit</th>
                  <th className="text-right px-2 py-1">Crédit</th>
                  <th className="text-left px-2 py-1">Effet</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td className="px-2">
                      <input type="checkbox" aria-label="Réimputer cette ligne" checked={cochees.has(l.id)} onChange={() => basculer(l.id)} />
                    </td>
                    <td className="px-2 py-1">{l.date}</td>
                    <td className="px-2 py-1">{l.piece}</td>
                    <td className="px-2 py-1">{l.compteNumero}</td>
                    <td className="px-2 py-1 truncate max-w-[200px]">{l.libelle}</td>
                    <td className="px-2 py-1 text-right">{fmt(l.debit)}</td>
                    <td className="px-2 py-1 text-right">{fmt(l.credit)}</td>
                    <td className="px-2 py-1 text-text-dim">{l.validee ? 'négatif + exact' : 'compte changé'}</td>
                  </tr>
                ))}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-2 text-text-dim">
                      Aucune ligne de ce compte dans le résultat affiché.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5 min-w-[240px] flex-1">
              <span className="text-text-dim">Compte cible</span>
              <select value={cibleId} onChange={(e) => setCibleId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                <option value="">Choisir…</option>
                {comptes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.intitule}
                  </option>
                ))}
              </select>
            </label>
            {nbValidees > 0 && (
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Date de la correction</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-border px-2 py-[2px]" />
              </label>
            )}
            <label className="flex flex-col gap-0.5 min-w-[240px] flex-1">
              <span className="text-text-dim">Motif</span>
              <input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="ex. loyer imputé à l'entretien"
                className="border border-border px-2 py-[2px]"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-text-dim">
              {choisies.length} ligne(s) choisie(s){nbValidees ? `, dont ${nbValidees} validée(s)` : ''}
            </span>
            <button
              onClick={reimputer}
              disabled={!peutValider || envoi || choisies.length === 0 || !cibleId || !motif.trim()}
              className="ml-auto bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40"
            >
              {envoi ? '…' : 'Réimputer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
