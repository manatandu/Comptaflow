import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type {
  CompteDormant,
  ControleCaisse,
  EvolutionMensuelle,
  GraviteControle,
  RapportControles,
} from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

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

type Onglet = 'controles' | 'caisse' | 'evolution' | 'dormants';

export function ControlesPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<Onglet>('controles');
  const [rapport, setRapport] = useState<RapportControles | null>(null);
  const [caisses, setCaisses] = useState<ControleCaisse[] | null>(null);
  const [deplie, setDeplie] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [evolution, setEvolution] = useState<EvolutionMensuelle | null>(null);
  const [dormants, setDormants] = useState<CompteDormant[] | null>(null);
  // Le total d'une colonne mensuelle n'a de sens que filtré sur une classe :
  // sur tout le plan, la partie double le ramène à zéro. Vide = pas de total.
  const [classeEvolution, setClasseEvolution] = useState<string>('');

  useEffect(() => {
    if (!exerciceCourant) return;
    setErreur(null);
    const echec = (e: unknown) => setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    if (onglet === 'controles') {
      api.get<RapportControles>(`/controles?exerciceId=${exerciceCourant.id}`).then(setRapport, echec);
    } else if (onglet === 'caisse') {
      api.get<ControleCaisse[]>(`/controles/caisse?exerciceId=${exerciceCourant.id}`).then(setCaisses, echec);
    } else if (onglet === 'evolution') {
      setEvolution(null);
      api
        .get<EvolutionMensuelle>(
          `/controles/evolution-mensuelle?exerciceId=${exerciceCourant.id}` +
            (classeEvolution ? `&classe=${classeEvolution}` : ''),
        )
        .then(setEvolution, echec);
    } else {
      api.get<CompteDormant[]>('/controles/comptes-dormants').then(setDormants, echec);
    }
  }, [onglet, exerciceCourant?.id, classeEvolution]);

  const basculer = (code: string) =>
    setDeplie((prev) => {
      const s = new Set(prev);
      if (s.has(code)) s.delete(code);
      else s.add(code);
      return s;
    });

  const ongletClasse = (o: Onglet) =>
    `px-4 py-1.5 text-[11px] font-bold ${onglet === o ? 'bg-surface border-x border-border' : 'text-text-dim'}`;

  return (
    <div className="p-2">
      <EnteteImpression titre="Analyse et contrôles" />
      <div className="mb-2.5">
        <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
        <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
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
        <button onClick={() => setOnglet('evolution')} className={ongletClasse('evolution')}>
          ÉVOLUTION MENSUELLE
        </button>
        <button onClick={() => setOnglet('dormants')} className={ongletClasse('dormants')}>
          COMPTES DORMANTS
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

      {/*
        ÉVOLUTION MENSUELLE · un compte par ligne, un mois par colonne.
        Vue tirée d'un reporting réel (CARRIGRES) où c'est la seule lecture
        qui fasse ressortir une charge qui double en juillet. Le cumul de
        l'exercice et la comparaison N/N-1 ne le montrent pas.
      */}
      {onglet === 'evolution' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-auto">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <label className="text-[11.5px] text-text-dim">Classe</label>
            <select
              value={classeEvolution}
              onChange={(e) => setClasseEvolution(e.target.value)}
              className="border border-border-dark px-2 py-1 text-[11.5px]"
            >
              <option value="">Toutes (sans ligne de totaux)</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={`CLASSE_${n}`}>
                  Classe {n}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-text-dim">
              Le total d’une colonne n’a de sens que sur une classe : sur tout le plan, la partie double le ramène
              à zéro.
            </span>
          </div>
          {!evolution && <div className="px-4 py-4 text-[12px] text-text-dim">Calcul en cours…</div>}
          {evolution && evolution.comptes.length === 0 && (
            <div className="px-4 py-6 text-[12px] text-text-dim text-center">
              Aucun compte mouvementé sur cet exercice.
            </div>
          )}
          {evolution && evolution.comptes.length > 0 && (
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.04em] text-text-dim">
                  <th className="text-left px-2.5 py-2 border-b border-border-dark">Compte</th>
                  <th className="text-right px-2 py-2 border-b border-border-dark" title="Report à-nouveau, exclu des colonnes mensuelles">
                    Ouverture
                  </th>
                  {evolution.mois.map((m) => (
                    <th key={m.cle} className="text-right px-2 py-2 border-b border-border-dark whitespace-nowrap">
                      {m.libelle}
                    </th>
                  ))}
                  <th className="text-right px-2.5 py-2 border-b border-border-dark">Cumul</th>
                  <th className="text-right px-2.5 py-2 border-b border-border-dark">Solde</th>
                </tr>
              </thead>
              <tbody>
                {evolution.comptes.map((c) => (
                  <tr key={c.compteId} className="border-b border-border/60 hover:bg-sel-soft">
                    <td className="px-2.5 py-1">
                      <span className="font-mono text-text-dim">{c.numero}</span>
                      <span className="ml-2">{c.intitule}</span>
                    </td>
                    <td className="text-right px-2 py-1 font-mono text-text-dim">
                      {c.report === 0 ? '·' : montant(c.report)}
                    </td>
                    {c.valeurs.map((v, i) => (
                      <td
                        key={evolution.mois[i].cle}
                        title={
                          c.moisAberrant === evolution.mois[i].cle
                            ? 'Mois le plus éloigné de la moyenne des mois mouvementés de ce compte'
                            : undefined
                        }
                        className={`text-right px-2 py-1 font-mono ${
                          v === 0
                            ? 'text-text-dim/50'
                            : c.moisAberrant === evolution.mois[i].cle
                              ? 'bg-warning-soft font-semibold text-warning'
                              : ''
                        }`}
                      >
                        {v === 0 ? '·' : montant(v)}
                      </td>
                    ))}
                    <td className="text-right px-2.5 py-1 font-mono font-semibold">{montant(c.cumul)}</td>
                    <td className="text-right px-2.5 py-1 font-mono text-text-dim">{montant(c.soldeFinal)}</td>
                  </tr>
                ))}
                {evolution.totaux && (
                  <tr className="bg-surface-alt font-semibold">
                    <td className="px-2.5 py-1.5">TOTAL classe {evolution.classe?.replace('CLASSE_', '')}</td>
                    <td />
                    {evolution.totaux.map((t, i) => (
                      <td key={evolution.mois[i].cle} className="text-right px-2 py-1.5 font-mono">
                        {montant(t)}
                      </td>
                    ))}
                    <td className="text-right px-2.5 py-1.5 font-mono">
                      {montant(evolution.totaux.reduce((s, t) => s + t, 0))}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/*
        COMPTES DORMANTS · le grand livre CARRIGRES porte la date du dernier
        mouvement de chaque compte, et l'on y lit des comptes ouverts en 1963
        dont rien n'a bougé depuis 2012. OmegaX savait mettre un compte en
        sommeil sans jamais dire lesquels le méritaient.
      */}
      {onglet === 'dormants' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-auto">
          {!dormants && <div className="px-4 py-4 text-[12px] text-text-dim">Analyse en cours…</div>}
          {dormants && dormants.length === 0 && (
            <div className="px-4 py-6 text-center">
              <div className="text-[14px] font-bold text-positive">Aucun compte dormant</div>
              <div className="text-[11.5px] text-text-dim mt-1">
                Tous les comptes actifs ont été mouvementés dans les douze derniers mois.
              </div>
            </div>
          )}
          {dormants && dormants.length > 0 && (
            <>
              <p className="px-3 py-2 text-[11px] text-text-dim border-b border-border">
                Comptes actifs sans mouvement depuis plus de douze mois. Ceux qui portent encore un solde sont
                listés en premier : un compte dormant à solde non nul est une question à poser avant l’arrêté.
              </p>
              <table className="w-full text-[11.5px] border-collapse">
                <thead>
                  <tr className="bg-surface-alt text-[10px] font-semibold uppercase tracking-[0.04em] text-text-dim">
                    <th className="text-left px-3 py-2 border-b border-border-dark">Compte</th>
                    <th className="text-left px-3 py-2 border-b border-border-dark">Dernier mouvement</th>
                    <th className="text-right px-3 py-2 border-b border-border-dark">Écritures</th>
                    <th className="text-right px-3 py-2 border-b border-border-dark">Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {dormants.map((c) => (
                    <tr key={c.compteId} className="border-b border-border/60 hover:bg-sel-soft">
                      <td className="px-3 py-1.5">
                        <span className="font-mono text-text-dim">{c.numero}</span>
                        <span className="ml-2">{c.intitule}</span>
                      </td>
                      <td className="px-3 py-1.5 text-text-dim">
                        {c.jamaisMouvemente
                          ? 'Jamais mouvementé'
                          : new Date(c.dernierMouvement!).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="text-right px-3 py-1.5 font-mono text-text-dim">{c.nombreEcritures}</td>
                      <td
                        className={`text-right px-3 py-1.5 font-mono ${
                          Math.abs(c.solde) > 0.005 ? 'font-semibold text-warning' : 'text-text-dim'
                        }`}
                      >
                        {montant(c.solde)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
