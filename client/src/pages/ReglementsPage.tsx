import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import type { Journal } from '../lib/types';
import { Aide } from '../components/chrome/Aide';
import { OrdresVirement } from '../components/OrdresVirement';
import { lignesDepuisSelection, rappelerLot, type LotVirement } from '../lib/lots-virement';

type Sens = 'FOURNISSEUR' | 'CLIENT';

interface LigneEcheance {
  id: string;
  echeance: string;
  date: string;
  journalCode: string;
  numeroPiece: number | null;
  reference: string | null;
  libelle: string;
  montant: number;
}

interface GroupeTiers {
  compteId: string;
  numero: string;
  intitule: string;
  tiers: string | null;
  lignes: LigneEcheance[];
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/**
 * RÈGLEMENT DES TIERS · le « règlement tiers » de Sage i7. On choisit les
 * échéances dues, OmegaX passe une pièce de trésorerie par tiers et lettre
 * aussitôt chaque facture avec son règlement. Les cases arrivent DÉCOCHÉES :
 * payer est une décision, pas un défaut.
 */
export function ReglementsPage() {
  const { peutEcrire } = useAuth();
  const { exerciceCourant } = useExercice();
  const [sens, setSens] = useState<Sens>('FOURNISSEUR');
  const [jusquau, setJusquau] = useState(aujourdhui());
  const [dateReglement, setDateReglement] = useState(aujourdhui());
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState('');
  const [groupes, setGroupes] = useState<GroupeTiers[] | null>(null);
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [montants, setMontants] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [onglet, setOnglet] = useState<'reglements' | 'ordres'>('reglements');
  const [avecOrdre, setAvecOrdre] = useState(false);
  const [ordreCree, setOrdreCree] = useState<string | null>(null);
  const [ordreOuvert, setOrdreOuvert] = useState(false);
  // Lots de virements récurrents · un lot PRÉSÉLECTIONNE, il ne paie rien.
  const [lots, setLots] = useState<LotVirement[]>([]);
  const [lotId, setLotId] = useState('');
  const [constatsLot, setConstatsLot] = useState<string[]>([]);
  const chargerLots = () => api.get<LotVirement[]>('/lots-virement').then(setLots).catch(() => setLots([]));
  useEffect(() => {
    void chargerLots();
  }, []);

  useEffect(() => {
    api
      .get<Journal[]>('/journaux')
      .then((js) => {
        const tresorerie = js.filter((j) => j.type === 'TRESORERIE' && j.estActif && j.compteTresorerieId);
        setJournaux(tresorerie);
        setJournalId((id) => id || tresorerie[0]?.id || '');
      })
      .catch(() => setJournaux([]));
  }, []);

  const charger = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    try {
      const g = await api.get<GroupeTiers[]>(
        `/reglements/echeances?exerciceId=${exerciceCourant.id}&sens=${sens}&jusquau=${jusquau}`,
      );
      setGroupes(g);
      setConstatsLot([]);
      setCochees(new Set());
      setMontants({});
      setReferences({});
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de lire les échéances');
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id, sens, jusquau]);

  const duParCompte = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groupes ?? []) {
      m.set(g.compteId, g.lignes.filter((l) => cochees.has(l.id)).reduce((s, l) => s + l.montant, 0));
    }
    return m;
  }, [groupes, cochees]);

  const basculer = (id: string) =>
    setCochees((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const aRegler = (groupes ?? []).filter((g) => (duParCompte.get(g.compteId) ?? 0) > 0);
  const total = aRegler.reduce((s, g) => {
    const saisi = montants[g.compteId];
    return s + (saisi ? Number(saisi.replace(',', '.')) || 0 : duParCompte.get(g.compteId) ?? 0);
  }, 0);

  const enregistrer = async () => {
    if (!exerciceCourant || !journalId || aRegler.length === 0) return;
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      const ordreVirement = avecOrdre && sens === 'FOURNISSEUR';
      const r = await api.post<{
        reglements: { compte: string; montant: number; partiel: boolean; lettre: string }[];
        ordre: { id: string; numero: number } | null;
      }>(
        '/reglements',
        {
          sens,
          ...(ordreVirement ? { ordreVirement: true } : {}),
          exerciceId: exerciceCourant.id,
          journalId,
          date: dateReglement,
          reglements: aRegler.map((g) => {
            const saisi = montants[g.compteId];
            return {
              compteId: g.compteId,
              ligneIds: g.lignes.filter((l) => cochees.has(l.id)).map((l) => l.id),
              ...(saisi ? { montant: Number(saisi.replace(',', '.')) } : {}),
              ...(references[g.compteId] ? { reference: references[g.compteId] } : {}),
            };
          }),
        },
      );
      const partiels = r.reglements.filter((x) => x.partiel).length;
      setInfo(
        `${r.reglements.length} règlement(s) passé(s) au brouillard et lettré(s)` +
          (partiels ? `, dont ${partiels} partiel(s) en lettrage partiel.` : '.') +
          (r.ordre ? ` Ordre de virement n° ${r.ordre.numero} préparé, en attente d'impression.` : ''),
      );
      await charger();
      if (r.ordre) {
        setOrdreCree(r.ordre.id);
        setOnglet('ordres');
      }
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Règlements non enregistrés');
    } finally {
      setEnvoi(false);
    }
  };

  const rappeler = () => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot || !groupes) return;
    const r = rappelerLot(lot, groupes);
    setCochees(new Set(r.cochees));
    setMontants(r.montants);
    setConstatsLot(r.constats);
    setAvecOrdre(true);
    if (lot.journalId && journaux.some((j) => j.id === lot.journalId)) setJournalId(lot.journalId);
  };

  const enregistrerLot = async () => {
    const lignes = lignesDepuisSelection(groupes ?? [], cochees, montants);
    const existant = lots.find((l) => l.id === lotId);
    const nom = window.prompt('Nom du lot', existant?.nom ?? '');
    if (!nom) return;
    setErreur(null);
    try {
      const corps = { nom, journalId: journalId || null, lignes };
      const remplacer = existant && existant.nom === nom.trim();
      const r = remplacer
        ? await api.patch<{ id: string }>(`/lots-virement/${existant.id}`, corps)
        : await api.post<{ id: string }>('/lots-virement', corps);
      await chargerLots();
      setLotId(r.id);
      setInfo(`Lot « ${nom.trim()} » enregistré · ${lignes.length} fournisseur(s).`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Lot non enregistré');
    }
  };

  const supprimerLot = async () => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot || !window.confirm(`Supprimer le lot « ${lot.nom} » ?`)) return;
    try {
      await api.delete(`/lots-virement/${lot.id}`);
      setLotId('');
      await chargerLots();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Suppression impossible');
    }
  };

  const ongletActif = (o: typeof onglet) =>
    `px-3 py-1 text-[11.5px] border-b-2 ${onglet === o ? 'border-sel font-semibold' : 'border-transparent text-text-dim hover:text-text'}`;
  const barreOnglets = (
    <div className="flex gap-1 border-b border-border" role="tablist">
      <button type="button" role="tab" aria-selected={onglet === 'reglements'} className={ongletActif('reglements')} onClick={() => setOnglet('reglements')}>
        Règlements
      </button>
      <button type="button" role="tab" aria-selected={onglet === 'ordres'} className={ongletActif('ordres')} onClick={() => setOnglet('ordres')}>
        Ordres de virement
      </button>
    </div>
  );

  if (onglet === 'ordres') {
    return (
      <div className={`p-3 space-y-3 ${ordreOuvert ? 'avec-edition' : ''}`}>
        {barreOnglets}
        <OrdresVirement
          ordreInitial={ordreCree}
          onSelection={(ouvert) => {
            setOrdreOuvert(ouvert);
            if (!ouvert) setOrdreCree(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {barreOnglets}
      <div className="flex flex-wrap items-end gap-3 text-[11.5px]">
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim">Règlement</span>
          <select value={sens} onChange={(e) => setSens(e.target.value as Sens)} className="border border-border px-2 py-[3px] bg-surface">
            <option value="FOURNISSEUR">Fournisseurs à payer</option>
            <option value="CLIENT">Clients et adhérents à encaisser</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim">Échéances jusqu'au</span>
          <input type="date" value={jusquau} onChange={(e) => setJusquau(e.target.value)} className="border border-border px-2 py-[2px]" />
        </label>
        {peutEcrire && (
          <>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Journal de trésorerie</span>
              <select value={journalId} onChange={(e) => setJournalId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                {journaux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Date du règlement</span>
              <input type="date" value={dateReglement} onChange={(e) => setDateReglement(e.target.value)} className="border border-border px-2 py-[2px]" />
            </label>
            {sens === 'FOURNISSEUR' && (
              <label className="flex items-center gap-1.5 pb-[3px]">
                <input type="checkbox" checked={avecOrdre} onChange={(e) => setAvecOrdre(e.target.checked)} />
                Préparer un ordre de virement
              </label>
            )}
          </>
        )}
        {sens === 'FOURNISSEUR' && (lots.length > 0 || peutEcrire) && (
          <span className="flex items-end gap-1.5">
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Lot de virements</span>
              <select aria-label="Lot de virements" value={lotId} onChange={(e) => setLotId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                <option value="">·</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nom}
                  </option>
                ))}
              </select>
            </label>
            {peutEcrire && lotId && (
              <button type="button" onClick={rappeler} className="border border-border px-2 py-[3px]">
                Rappeler
              </button>
            )}
            {peutEcrire && aRegler.length > 0 && (
              <button type="button" onClick={() => void enregistrerLot()} className="border border-border px-2 py-[3px]">
                Enregistrer comme lot
              </button>
            )}
            {peutEcrire && lotId && (
              <button type="button" onClick={() => void supprimerLot()} className="text-danger px-1 py-[3px]">
                Supprimer
              </button>
            )}
            <Aide
              titre="Lots de virements"
              texte="Un lot retient des fournisseurs et un montant habituel (loyers, abonnements). Rappelé, il coche leurs factures ouvertes, les plus anciennes d'abord, jusqu'au montant habituel, et prépare l'ordre de virement · rien n'est passé avant que vous n'enregistriez. Au-delà du dû, seul le dû est proposé ; un fournisseur sans facture ouverte n'est pas payé, un paiement sans facture étant une avance. Définition d'OmegaX."
              source="Sage Moyens de Paiement · lots préétablis de virements récurrents (nommés, non décrits)"
            />
          </span>
        )}
        <Aide
          titre="Règlement des tiers"
          texte="Cochez les factures à régler. OmegaX passe une pièce par tiers au journal de trésorerie choisi (40 contre 52 pour un fournisseur, 52 contre 41 pour un client) et lettre aussitôt chaque facture avec son règlement. Un montant inférieur au dû donne un règlement partiel et un lettrage partiel ; un montant supérieur est refusé, l'excédent étant une avance ou un trop-perçu. Les factures non parvenues, produits à recevoir et avances (408, 409, 418, 419) ne se règlent pas ici."
          source="Guide d'application SYSCOHADA, Partie 1 ch. 4 · SYCEBNL, fiches des comptes 40 et 41 · Sage 100 i7, règlement des tiers"
        />
      </div>

      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
      {constatsLot.length > 0 && (
        <div className="text-[11.5px] text-warning bg-warning-soft border border-warning/30 px-3 py-2 space-y-0.5">
          {constatsLot.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
      )}
      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-2">{info}</div>}
      {peutEcrire && journaux.length === 0 && (
        <div className="text-[11.5px] text-warning bg-warning-soft border border-warning/30 px-3 py-2">
          Aucun journal de trésorerie rattaché à un compte de banque ou de caisse · créez-en un dans Codes journaux.
        </div>
      )}

      {groupes && groupes.length === 0 && (
        <p className="text-[11.5px] text-text-dim">Aucune échéance non lettrée à cette date.</p>
      )}

      {groupes && groupes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[11.5px]">
            <thead>
              <tr>
                <th className="w-[28px] px-2 py-1" />
                <th className="text-left px-2 py-1 w-[90px]">Échéance</th>
                <th className="text-left px-2 py-1 w-[90px]">Pièce</th>
                <th className="text-left px-2 py-1">Libellé</th>
                <th className="text-right px-2 py-1 w-[120px]">Dû</th>
              </tr>
            </thead>
            {groupes.map((g) => {
              const du = duParCompte.get(g.compteId) ?? 0;
              return (
                <tbody key={g.compteId}>
                  <tr className="bg-[var(--a-50)]">
                    <td colSpan={3} className="px-2 py-1 font-semibold">
                      {g.numero} · {g.tiers ?? g.intitule}
                    </td>
                    <td className="px-2 py-1">
                      {peutEcrire && du > 0 && (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="text-text-dim">Réglé</span>
                          <input
                            inputMode="decimal"
                            placeholder={fmt(du)}
                            value={montants[g.compteId] ?? ''}
                            onChange={(e) => setMontants((m) => ({ ...m, [g.compteId]: e.target.value }))}
                            className="w-[110px] border border-border px-1.5 py-[1px] text-right"
                          />
                          <span className="text-text-dim">N° chèque ou virement</span>
                          <input
                            value={references[g.compteId] ?? ''}
                            onChange={(e) => setReferences((r) => ({ ...r, [g.compteId]: e.target.value }))}
                            className="w-[110px] border border-border px-1.5 py-[1px]"
                          />
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right font-semibold">{du > 0 ? fmt(du) : ''}</td>
                  </tr>
                  {g.lignes.map((l) => (
                    <tr key={l.id}>
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          aria-label="Régler cette facture"
                          disabled={!peutEcrire}
                          checked={cochees.has(l.id)}
                          onChange={() => basculer(l.id)}
                        />
                      </td>
                      <td className="px-2 py-1">{new Date(l.echeance).toLocaleDateString('fr-FR')}</td>
                      <td className="px-2 py-1 text-text-dim">
                        {l.journalCode} {l.numeroPiece ?? ''}
                      </td>
                      <td className="px-2 py-1 truncate max-w-[320px]">
                        {l.libelle}
                        {l.reference ? <span className="text-text-dim"> · {l.reference}</span> : null}
                      </td>
                      <td className="px-2 py-1 text-right">{fmt(l.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {peutEcrire && aRegler.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={enregistrer}
            disabled={envoi || !journalId}
            className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-40"
          >
            {envoi ? '…' : `Enregistrer ${aRegler.length} règlement(s) · ${fmt(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}
