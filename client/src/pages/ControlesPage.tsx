import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { ControleCaisse, GraviteControle, RapportControles } from '../lib/types';

/**
 * ANALYSE ET CONTRÔLES · État → Analyse et contrôles, et État → Contrôle de
 * caisse de Sage 100 i7, réunis en une fenêtre à deux onglets.
 *
 * Chaque anomalie dit trois choses : ce qu'elle est, ce qu'elle RISQUE, et ce
 * qu'il faut FAIRE. Une liste d'anomalies sans conséquence ni remède ne fait
 * que déplacer le travail de diagnostic sur l'utilisateur · c'est la
 * différence entre un logiciel qui enregistre et un logiciel qui surveille.
 */

const COULEUR: Record<GraviteControle, { fond: string; texte: string; libelle: string }> = {
  BLOQUANT: { fond: 'bg-danger-soft', texte: 'text-danger', libelle: 'Bloquant' },
  AVERTISSEMENT: { fond: 'bg-warning-soft', texte: 'text-warning', libelle: 'À corriger' },
  INFORMATION: { fond: 'bg-sel-soft', texte: 'text-sel', libelle: 'Pour information' },
};

function montant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ControlesPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<'controles' | 'caisse'>('controles');
  const [rapport, setRapport] = useState<RapportControles | null>(null);
  const [caisses, setCaisses] = useState<ControleCaisse[] | null>(null);
  const [deplie, setDeplie] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    setErreur(null);
    const echec = (e: unknown) => setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    if (onglet === 'controles') {
      api.get<RapportControles>(`/controles?exerciceId=${exerciceCourant.id}`).then(setRapport, echec);
    } else {
      api.get<ControleCaisse[]>(`/controles/caisse?exerciceId=${exerciceCourant.id}`).then(setCaisses, echec);
    }
  }, [onglet, exerciceCourant?.id]);

  const basculer = (code: string) =>
    setDeplie((prev) => {
      const s = new Set(prev);
      if (s.has(code)) s.delete(code);
      else s.add(code);
      return s;
    });

  const ongletClasse = (o: 'controles' | 'caisse') =>
    `px-4 py-1.5 text-[11px] font-bold ${onglet === o ? 'bg-surface border-x border-border' : 'text-text-dim'}`;

  return (
    <div className="p-2.5">
      <div className="mb-2.5">
        <div className="text-[10.5px] font-mono text-text-dim">ÉTAT</div>
        <h1 className="text-[15px] font-bold flex items-center gap-1.5">
          Analyse et contrôles
          <Aide sujet="controles" />
        </h1>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}

      <div className="flex bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        <button onClick={() => setOnglet('controles')} className={ongletClasse('controles')}>
          CONTRÔLES DE COHÉRENCE
        </button>
        <button onClick={() => setOnglet('caisse')} className={ongletClasse('caisse')}>
          CONTRÔLE DE CAISSE
        </button>
      </div>

      {onglet === 'controles' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden">
          {!rapport && <div className="px-4 py-4 text-[12px] text-text-dim">Analyse en cours…</div>}

          {rapport && rapport.anomalies.length === 0 && (
            <div className="px-4 py-6 text-center">
              <div className="text-[14px] font-bold text-positive">Aucune anomalie</div>
              <p className="text-[12px] text-text-dim mt-1">
                Les contrôles de cohérence ne relèvent rien sur cet exercice.
              </p>
            </div>
          )}

          {rapport && rapport.anomalies.length > 0 && (
            <>
              <div className="px-4 py-2 bg-chrome-alt border-b border-border flex gap-4 text-[11.5px]">
                <span className="text-danger font-bold">{rapport.totaux.bloquants} bloquant(s)</span>
                <span className="text-warning font-bold">{rapport.totaux.avertissements} à corriger</span>
                <span className="text-sel font-bold">{rapport.totaux.informations} pour information</span>
              </div>
              {rapport.anomalies.map((a) => {
                const c = COULEUR[a.gravite];
                const ouvert = deplie.has(a.code);
                return (
                  <section key={a.code} className="border-b border-border">
                    <button
                      onClick={() => basculer(a.code)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left ${c.fond}`}
                    >
                      <span className="flex items-baseline gap-2.5 min-w-0">
                        <span className={`text-[10px] font-bold uppercase ${c.texte} shrink-0`}>{c.libelle}</span>
                        <span className="text-[13px] font-semibold truncate">{a.libelle}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`text-[12px] font-mono font-bold ${c.texte}`}>{a.occurrences.length}</span>
                        <span className="text-[10px] text-text-dim">{ouvert ? '▲' : '▼'}</span>
                      </span>
                    </button>
                    <div className="px-4 py-2 text-[11.5px] leading-[1.55] border-t border-border/40">
                      <p className="text-text-dim">{a.consequence}</p>
                      <p className="mt-1">
                        <span className="font-semibold">À faire : </span>
                        {a.action}
                      </p>
                    </div>
                    {ouvert && (
                      <div className="max-h-[300px] overflow-y-auto border-t border-border">
                        {a.occurrences.map((o, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-[180px_1fr_100px_130px] gap-2 px-4 py-1 text-[11.5px] border-b border-border/30"
                          >
                            <span className="font-mono">{o.reference}</span>
                            <span className="truncate">{o.detail}</span>
                            <span className="font-mono text-text-dim">{o.date ?? ''}</span>
                            <span className="text-right font-mono">
                              {o.montant !== undefined ? montant(o.montant) : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </div>
      )}

      {onglet === 'caisse' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden">
          {!caisses && <div className="px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {caisses && caisses.length === 0 && (
            <div className="px-4 py-5 text-[12px] text-text-dim italic">
              Aucun compte de caisse dans ce dossier. Un compte de caisse est un compte 57, ou le compte rattaché à un
              journal de trésorerie nommé « caisse ».
            </div>
          )}
          {caisses?.map((c) => (
            <section key={c.compteId} className="border-b border-border">
              <header
                className={`px-4 py-2 flex items-center justify-between ${
                  c.nombreJoursNegatifs > 0 ? 'bg-danger-soft' : 'bg-positive-soft'
                }`}
              >
                <span className="text-[13px] font-semibold">
                  <span className="font-mono">{c.numero}</span> {c.intitule}
                  {c.journal && <span className="text-text-dim text-[11px]"> · journal {c.journal}</span>}
                </span>
                <span
                  className={`text-[11.5px] font-bold ${c.nombreJoursNegatifs > 0 ? 'text-danger' : 'text-positive'}`}
                >
                  {c.nombreJoursNegatifs > 0
                    ? `Créditrice ${c.nombreJoursNegatifs} jour(s) · première fois le ${c.premierJourNegatif}`
                    : 'Jamais créditrice'}
                </span>
              </header>

              {c.nombreJoursNegatifs > 0 && (
                <p className="px-4 py-2 text-[11.5px] text-text-dim leading-[1.55] border-b border-border/40">
                  Une caisse ne peut pas être créditrice : on aurait décaissé de l'argent qu'on n'avait pas. Enregistrez
                  les approvisionnements avant les dépenses du même jour, ou retrouvez la pièce manquante.
                </p>
              )}

              <div className="grid grid-cols-[110px_1fr_140px_140px_150px] gap-2 px-4 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>DATE</span>
                <span />
                <span className="text-right">ENTRÉES</span>
                <span className="text-right">SORTIES</span>
                <span className="text-right">SOLDE AU SOIR</span>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {c.journees.map((j) => (
                  <div
                    key={j.date}
                    className={`grid grid-cols-[110px_1fr_140px_140px_150px] gap-2 px-4 py-1 text-[12px] border-b border-border/30 ${
                      j.negatif ? 'bg-danger-soft' : ''
                    }`}
                  >
                    <span className="font-mono">{j.date}</span>
                    <span className="text-[11px] text-danger font-bold">{j.negatif ? 'caisse créditrice' : ''}</span>
                    <span className="text-right font-mono">
                      {j.mouvementDebit ? montant(j.mouvementDebit) : ''}
                    </span>
                    <span className="text-right font-mono">
                      {j.mouvementCredit ? montant(j.mouvementCredit) : ''}
                    </span>
                    <span className={`text-right font-mono ${j.negatif ? 'text-danger font-bold' : ''}`}>
                      {montant(j.soldeFinJournee)}
                    </span>
                  </div>
                ))}
                {c.journees.length === 0 && (
                  <div className="px-4 py-3 text-[12px] text-text-dim italic">Aucun mouvement sur cet exercice.</div>
                )}
              </div>
              <div className="grid grid-cols-[110px_1fr_140px_140px_150px] gap-2 px-4 py-1.5 bg-chrome border-t border-border text-[12px] font-bold">
                <span />
                <span>Solde de clôture</span>
                <span />
                <span />
                <span className="text-right font-mono">{montant(c.soldeFinal)}</span>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
