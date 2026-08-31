import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { LettreRelance, NiveauRelance, PositionRelance, TypeRelance } from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * RAPPEL ET RELEVÉ · Traitement → Rappel/relevé chez Sage 100 i7, qui
 * distingue trois états : la relance préventive avant l'échéance, le rappel
 * gradué après, et le relevé de tout ce qui est dû.
 *
 * La structure est reprise, le vocabulaire non. Une EBNL ne relance pas des
 * clients en retard : elle rappelle à ses ADHÉRENTS (compte 411) une
 * cotisation appelée et non payée, et à ses clients-usagers (412) une facture
 * due. La colonne « Qualité » le dit à chaque ligne, et les modèles de lettre
 * livrés parlent d'une association à ses membres, pas d'un créancier à son
 * débiteur.
 */

const ETATS: { valeur: TypeRelance; titre: string; description: string }[] = [
  {
    valeur: 'PREVENTIVE',
    titre: 'Relance préventive',
    description: "Ce qui n'est pas encore échu · une invitation à régler avant le terme.",
  },
  {
    valeur: 'RAPPEL',
    titre: 'Rappel',
    description: 'Les échéances non lettrées déjà en retard, avec un niveau qui monte.',
  },
  {
    valeur: 'RELEVE',
    titre: 'Relevé',
    description: "Tout ce qui est dû, échu ou non, sans gradation.",
  },
];

function montant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RelancesPage() {
  const { estAdmin, utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const [type, setType] = useState<TypeRelance>('RAPPEL');
  const [positions, setPositions] = useState<PositionRelance[] | null>(null);
  const [niveaux, setNiveaux] = useState<NiveauRelance[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [niveauId, setNiveauId] = useState('');
  const [lettres, setLettres] = useState<LettreRelance[] | null>(null);
  const [deplie, setDeplie] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const peutEcrire = estAdmin || utilisateur?.role === 'COMPTABLE';

  const charger = async () => {
    if (!exerciceCourant) return;
    try {
      setPositions(
        await api.get<PositionRelance[]>(`/relances?exerciceId=${exerciceCourant.id}&type=${type}`),
      );
      setSelection(new Set());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    api.get<NiveauRelance[]>('/relances/niveaux').then(
      (n) => {
        setNiveaux(n);
        setNiveauId((id) => id || n.find((x) => x.type === type)?.id || n[0]?.id || '');
      },
      () => setNiveaux([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    charger();
    setLettres(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, exerciceCourant?.id]);

  const basculer = (id: string) =>
    setSelection((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const emettre = async () => {
    if (!exerciceCourant || selection.size === 0 || !niveauId) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ emises: number; lettres: LettreRelance[] }>('/relances/emettre', {
        exerciceId: exerciceCourant.id,
        compteIds: [...selection],
        niveauId,
      });
      setLettres(r.lettres);
      setInfo(`${r.emises} courrier(s) préparé(s).`);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Émission impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const total = (positions ?? []).reduce((s, p) => s + p.montantDu, 0);
  const grille = 'grid grid-cols-[28px_110px_1fr_110px_140px_90px_140px] gap-2';

  return (
    <div className="p-2">
      <EnteteImpression titre="Rappel et relevé" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">TRAITEMENT</div>
          <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
            Rappel et relevé
            <Aide sujet="relance" />
          </h1>
        </div>
        {peutEcrire && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim">NIVEAU</span>
              <select
                value={niveauId}
                onChange={(e) => setNiveauId(e.target.value)}
                className="border border-border rounded-[6px] bg-surface px-2 py-1 text-[11.5px] min-w-[200px]"
              >
                {niveaux.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.niveau}. {n.libelle}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={emettre}
              disabled={envoi || selection.size === 0}
              className="bg-sel text-white text-[11.5px] font-bold px-3.5 py-1.5 rounded-[6px] hover:brightness-110 disabled:opacity-50"
            >
              Préparer les courriers ({selection.size})
            </button>
          </div>
        )}
      </div>

      {erreur && (
        <div className="mb-2.5 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[12px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="flex bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        {ETATS.map((e) => (
          <button
            key={e.valeur}
            onClick={() => setType(e.valeur)}
            title={e.description}
            className={`px-4 py-1.5 text-[11px] font-bold ${
              type === e.valeur ? 'bg-surface border-x border-border' : 'text-text-dim'
            }`}
          >
            {e.titre.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden">
        <p className="px-3 py-2 text-[11.5px] text-text-dim border-b border-border/40">
          {ETATS.find((e) => e.valeur === type)?.description}
        </p>

        <div className={`${grille} px-3 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim`}>
          <span>
            {peutEcrire && positions && positions.length > 0 && (
              <input
                type="checkbox"
                checked={selection.size > 0 && selection.size === positions.length}
                onChange={(e) => setSelection(e.target.checked ? new Set(positions.map((p) => p.compteId)) : new Set())}
              />
            )}
          </span>
          <span>COMPTE</span>
          <span>TIERS</span>
          <span>QUALITÉ</span>
          <span className="text-right">MONTANT DÛ</span>
          <span className="text-right">RETARD</span>
          <span>DERNIÈRE RELANCE</span>
        </div>

        {!positions && <div className="px-3 py-4 text-[12px] text-text-dim">Chargement…</div>}
        {positions?.map((p) => (
          <div key={p.compteId}>
            <div
              className={`${grille} px-3 py-1 text-[12px] items-center border-b border-border/40 ${
                p.retardMaxJours > 90 ? 'bg-danger-soft' : p.retardMaxJours > 30 ? 'bg-warning-soft' : ''
              }`}
            >
              <span>
                {peutEcrire && (
                  <input type="checkbox" checked={selection.has(p.compteId)} onChange={() => basculer(p.compteId)} />
                )}
              </span>
              <span className="font-mono">{p.numero}</span>
              <button
                onClick={() =>
                  setDeplie((prev) => {
                    const s = new Set(prev);
                    if (s.has(p.compteId)) s.delete(p.compteId);
                    else s.add(p.compteId);
                    return s;
                  })
                }
                className="text-left truncate hover:underline"
              >
                {p.tiersNom ?? (
                  <span className="text-text-dim italic">
                    {p.intitule} · aucun tiers rattaché
                  </span>
                )}
              </button>
              <span className="text-[11px] text-text-dim">{p.qualite}</span>
              <span className="text-right font-mono font-semibold">{montant(p.montantDu)}</span>
              <span
                className={`text-right font-mono text-[11.5px] ${
                  p.retardMaxJours > 90 ? 'text-danger font-bold' : p.retardMaxJours > 0 ? 'text-warning' : 'text-text-dim'
                }`}
              >
                {p.retardMaxJours > 0 ? `${p.retardMaxJours} j` : `dans ${-p.retardMaxJours} j`}
              </span>
              <span className="text-[11px]">
                {p.derniereRelance ? (
                  <span className="text-text-dim">
                    niveau {p.derniereRelance.niveau} le {new Date(p.derniereRelance.date).toLocaleDateString('fr-FR')}
                  </span>
                ) : p.niveauSuggere ? (
                  <span className="text-sel font-semibold">niveau {p.niveauSuggere} conseillé</span>
                ) : (
                  ''
                )}
              </span>
            </div>
            {deplie.has(p.compteId) &&
              p.lignes.map((l, i) => (
                <div key={i} className={`${grille} px-3 py-0.5 text-[11px] bg-chrome-alt/50 border-b border-border/30`}>
                  <span />
                  <span className="font-mono text-text-dim">{l.echeance ?? l.date}</span>
                  <span className="truncate text-text-dim">{l.libelle}</span>
                  <span />
                  <span className="text-right font-mono">{montant(l.montant)}</span>
                  <span className="text-right font-mono text-text-dim">
                    {l.retardJours > 0 ? `${l.retardJours} j` : ''}
                  </span>
                  <span />
                </div>
              ))}
          </div>
        ))}

        {positions && positions.length === 0 && (
          <div className="px-3 py-5 text-[12px] text-text-dim italic">
            {type === 'PREVENTIVE'
              ? "Aucune échéance à venir sur les comptes d'adhérents et de clients-usagers."
              : type === 'RAPPEL'
                ? 'Aucun retard de paiement. Tout ce qui est échu a été lettré.'
                : 'Rien de dû sur cet exercice.'}
          </div>
        )}

        {positions && positions.length > 0 && (
          <div className={`${grille} px-3 py-1.5 bg-chrome border-t border-border text-[12px] font-bold`}>
            <span />
            <span />
            <span>{positions.length} tiers</span>
            <span />
            <span className="text-right font-mono">{montant(total)}</span>
            <span />
            <span />
          </div>
        )}
      </div>

      {lettres && lettres.length > 0 && (
        <section className="mt-2.5 bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <header className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between">
            <span className="text-[11.5px] font-bold">Courriers préparés</span>
            <button
              onClick={() => navigator.clipboard?.writeText(lettres.map((l) => l.texte).join('\n\n\n'))}
              className="border border-border rounded-[6px] bg-surface px-3 py-1 text-[11px] font-semibold hover:bg-chrome"
            >
              Tout copier
            </button>
          </header>
          {lettres.map((l) => (
            <article key={l.compteId} className="border-b border-border/40">
              <div className="px-3 py-1.5 bg-chrome text-[11.5px] font-semibold flex justify-between">
                <span>{l.tiers}</span>
                <span className="font-mono">{montant(l.montant)}</span>
              </div>
              <pre className="px-3 py-2 text-[11.5px] whitespace-pre-wrap font-sans leading-[1.6]">{l.texte}</pre>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
