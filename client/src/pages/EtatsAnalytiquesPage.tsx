import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type {
  BalanceAnalytique,
  ControleCumuls,
  EtatBudgetaire,
  GrandLivreAnalytique,
  PlanAnalytique,
  SectionAnalytique,
} from '../lib/types';

/**
 * ÉTATS ANALYTIQUES ET BUDGÉTAIRES · État → États analytiques et État →
 * États budgétaires de Sage 100 i7, réunis dans une seule fenêtre à quatre
 * onglets parce qu'ils répondent à une même question posée sous quatre angles.
 *
 * L'onglet CONTRÔLE mérite un mot : c'est lui qui prouve que le total ventilé
 * par projet égale le total comptable, et qui liste les écritures restées sans
 * répartition. Un rapport d'exécution adressé à un bailleur sans cette preuve
 * ne tient pas devant un auditeur.
 *
 * Voir docs/analytique-et-budget.md.
 */

type Onglet = 'balance' | 'grand-livre' | 'controle' | 'budgetaire';

const MOIS = ['Tous', 'janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function montant(n: number): string {
  return n !== 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function EtatsAnalytiquesPage() {
  const { exerciceCourant } = useExercice();
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState<Onglet>('balance');
  const [plans, setPlans] = useState<PlanAnalytique[]>([]);
  const [planId, setPlanId] = useState('');
  const [sections, setSections] = useState<SectionAnalytique[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [mois, setMois] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);

  const [balance, setBalance] = useState<BalanceAnalytique | null>(null);
  const [grandLivre, setGrandLivre] = useState<GrandLivreAnalytique | null>(null);
  const [controle, setControle] = useState<ControleCumuls[] | null>(null);
  const [budgetaire, setBudgetaire] = useState<EtatBudgetaire | null>(null);

  const plan = plans.find((p) => p.id === planId) ?? null;

  useEffect(() => {
    api.get<PlanAnalytique[]>('/analytique/plans').then(
      (r) => {
        setPlans(r);
        setPlanId((id) => id || r[0]?.id || '');
      },
      (e) => setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
    );
  }, []);

  useEffect(() => {
    if (!planId) return;
    api.get<SectionAnalytique[]>(`/analytique/plans/${planId}/sections`).then((r) => {
      setSections(r);
      setSectionId((id) => (r.some((s) => s.id === id) ? id : (r.find((s) => s.type === 'DETAIL')?.id ?? '')));
    }, () => setSections([]));
  }, [planId]);

  useEffect(() => {
    if (!exerciceCourant || !planId) return;
    setErreur(null);
    const ex = exerciceCourant.id;
    const echec = (e: unknown) => setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');

    if (onglet === 'balance') {
      api.get<BalanceAnalytique>(`/analytique/etats/balance?planId=${planId}&exerciceId=${ex}`).then(setBalance, echec);
    } else if (onglet === 'grand-livre' && sectionId) {
      api
        .get<GrandLivreAnalytique>(`/analytique/etats/grand-livre?sectionId=${sectionId}&exerciceId=${ex}`)
        .then(setGrandLivre, echec);
    } else if (onglet === 'controle') {
      api.get<ControleCumuls[]>(`/analytique/etats/controle-cumuls?exerciceId=${ex}`).then(setControle, echec);
    } else if (onglet === 'budgetaire') {
      api
        .get<EtatBudgetaire>(
          `/analytique/etats/budgetaire?planId=${planId}&exerciceId=${ex}${mois ? `&mois=${mois}` : ''}`,
        )
        .then(setBudgetaire, echec);
    }
  }, [onglet, planId, sectionId, mois, exerciceCourant?.id]);

  const ongletClasse = (o: Onglet) =>
    `px-4 py-1.5 text-[11px] font-bold ${onglet === o ? 'bg-surface border-x border-border' : 'text-text-dim'}`;

  return (
    <div className="p-2.5">
      <div className="flex items-end justify-between mb-2.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] font-mono text-text-dim">ÉTAT</div>
          <h1 className="text-[15px] font-bold flex items-center gap-1.5">
            États analytiques
            <Aide sujet="analytique" />
          </h1>
        </div>
        <div className="flex items-end gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">AXE</span>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="border border-border rounded-[6px] bg-surface px-2 py-1 text-[11.5px] min-w-[180px]"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.intitule}
                </option>
              ))}
            </select>
          </label>
          {onglet === 'grand-livre' && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim">SECTION</span>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="border border-border rounded-[6px] bg-surface px-2 py-1 text-[11.5px] min-w-[220px]"
              >
                {sections
                  .filter((s) => s.type === 'DETAIL')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.intitule}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {onglet === 'budgetaire' && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim">PÉRIODE</span>
              <select
                value={mois}
                onChange={(e) => setMois(Number(e.target.value))}
                className="border border-border rounded-[6px] bg-surface px-2 py-1 text-[11.5px]"
              >
                {MOIS.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}

      <div className="flex bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        <button onClick={() => setOnglet('balance')} className={ongletClasse('balance')}>
          BALANCE
        </button>
        <button onClick={() => setOnglet('grand-livre')} className={ongletClasse('grand-livre')}>
          GRAND LIVRE
        </button>
        <button onClick={() => setOnglet('controle')} className={ongletClasse('controle')}>
          CONTRÔLE DES CUMULS
        </button>
        <button onClick={() => setOnglet('budgetaire')} className={ongletClasse('budgetaire')}>
          BUDGÉTAIRE
        </button>
      </div>

      {onglet === 'balance' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden">
          <div className="grid grid-cols-[120px_1fr_140px_140px_150px] gap-2 px-4 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
            <span>SECTION</span>
            <span>INTITULÉ</span>
            <span className="text-right">MOUVEMENT DÉBIT</span>
            <span className="text-right">MOUVEMENT CRÉDIT</span>
            <span className="text-right">SOLDE</span>
          </div>
          {!balance && <div className="px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {balance?.lignes.map((l) => (
            <div
              key={l.sectionId}
              className={`grid grid-cols-[120px_1fr_140px_140px_150px] gap-2 px-4 py-1 text-[12px] border-b border-border/40 ${
                l.type === 'TOTAL' ? 'bg-chrome-alt font-bold' : ''
              }`}
            >
              <span className="font-mono">{l.code}</span>
              <span>{l.intitule}</span>
              <span className="text-right font-mono">{montant(l.debit)}</span>
              <span className="text-right font-mono">{montant(l.credit)}</span>
              <span className="text-right font-mono">{montant(l.solde)}</span>
            </div>
          ))}
          {balance && balance.lignes.length === 0 && (
            <div className="px-4 py-4 text-[12px] text-text-dim italic">
              Aucune section sur cet axe. Créez vos projets dans Structure → Plans analytiques.
            </div>
          )}
          {balance && (
            <div className="grid grid-cols-[120px_1fr_140px_140px_150px] gap-2 px-4 py-1.5 bg-chrome border-t border-border text-[12px] font-bold">
              <span />
              <span>Total des sections Détail</span>
              <span className="text-right font-mono">{montant(balance.totaux.debit)}</span>
              <span className="text-right font-mono">{montant(balance.totaux.credit)}</span>
              <span className="text-right font-mono">{montant(balance.totaux.solde)}</span>
            </div>
          )}
        </div>
      )}

      {onglet === 'grand-livre' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden">
          {grandLivre && (
            <div className="px-4 py-2 bg-chrome-alt border-b border-border text-[11.5px]">
              <span className="font-mono font-bold">{grandLivre.section.code}</span> {grandLivre.section.intitule}
              {grandLivre.section.dateDebut && (
                <span className="text-text-dim">
                  {' '}
                  · convention du {new Date(grandLivre.section.dateDebut).toLocaleDateString('fr-FR')} au{' '}
                  {grandLivre.section.dateFin ? new Date(grandLivre.section.dateFin).toLocaleDateString('fr-FR') : '…'}
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-[90px_60px_70px_110px_1fr_120px_120px_130px] gap-2 px-4 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
            <span>DATE</span>
            <span>JAL</span>
            <span>PIÈCE</span>
            <span>COMPTE</span>
            <span>LIBELLÉ</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span className="text-right">SOLDE</span>
          </div>
          {!grandLivre && <div className="px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {grandLivre?.lignes.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[90px_60px_70px_110px_1fr_120px_120px_130px] gap-2 px-4 py-1 text-[12px] border-b border-border/40"
            >
              <span className="font-mono">{l.date}</span>
              <span className="font-mono">{l.journal}</span>
              <span className="font-mono text-text-dim">{l.numeroPiece ?? ''}</span>
              <span className="font-mono">{l.compteNumero}</span>
              <span className="truncate">{l.libelle}</span>
              <span className="text-right font-mono">{montant(l.debit)}</span>
              <span className="text-right font-mono">{montant(l.credit)}</span>
              <span className="text-right font-mono text-text-dim">{montant(l.soldeProgressif)}</span>
            </div>
          ))}
          {grandLivre && grandLivre.lignes.length === 0 && (
            <div className="px-4 py-4 text-[12px] text-text-dim italic">Aucun mouvement ventilé sur cette section.</div>
          )}
        </div>
      )}

      {onglet === 'controle' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden p-3 flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-text-dim">
            <span>Ce que cet état prouve</span>
            <Aide sujet="controleCumuls" />
          </div>
          {!controle && <div className="text-[12px] text-text-dim">Chargement…</div>}
          {controle?.map((c) => {
            const equilibre = Math.abs(c.ecartDebit) < 0.005 && Math.abs(c.ecartCredit) < 0.005;
            return (
              <section key={c.planId} className="border border-border rounded-[8px] overflow-hidden">
                <header
                  className={`px-3 py-2 text-[12px] font-bold flex items-center justify-between ${
                    equilibre ? 'bg-positive-soft text-positive' : 'bg-warning-soft text-warning'
                  }`}
                >
                  <span>
                    {c.planIntitule} <span className="font-mono text-[10.5px] opacity-70">{c.planCode}</span>
                  </span>
                  <span>{equilibre ? 'Cumuls concordants' : 'Écart à ventiler'}</span>
                </header>
                <div className="grid grid-cols-[1fr_140px_140px] gap-2 px-3 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span />
                  <span className="text-right">DÉBIT</span>
                  <span className="text-right">CRÉDIT</span>
                </div>
                {[
                  ['Mouvements généraux', c.mouvementsGenerauxDebit, c.mouvementsGenerauxCredit],
                  ['Mouvements ventilés', c.mouvementsAnalytiquesDebit, c.mouvementsAnalytiquesCredit],
                  ['Écart', c.ecartDebit, c.ecartCredit],
                ].map(([libelle, d, cr], i) => (
                  <div
                    key={libelle as string}
                    className={`grid grid-cols-[1fr_140px_140px] gap-2 px-3 py-1 text-[12px] ${
                      i === 2 ? 'font-bold border-t border-border' : 'border-b border-border/40'
                    }`}
                  >
                    <span>{libelle}</span>
                    <span className="text-right font-mono">{montant(d as number)}</span>
                    <span className="text-right font-mono">{montant(cr as number)}</span>
                  </div>
                ))}
                {c.lignesSansRepartition.length > 0 && (
                  <div className="border-t border-border">
                    <div className="px-3 py-1.5 bg-chrome text-[10.5px] font-bold text-text-dim">
                      {c.lignesSansRepartition.length} écriture(s) sans répartition
                    </div>
                    <div className="max-h-[240px] overflow-y-auto">
                      {c.lignesSansRepartition.map((l, i) => (
                        <button
                          key={i}
                          onClick={() => navigate('/journal')}
                          className="w-full grid grid-cols-[90px_60px_110px_1fr_110px_110px] gap-2 px-3 py-1 text-[11.5px] text-left border-b border-border/40 hover:bg-chrome-alt"
                        >
                          <span className="font-mono">{l.date}</span>
                          <span className="font-mono">{l.journal}</span>
                          <span className="font-mono">{l.compteNumero}</span>
                          <span className="truncate">{l.libelle}</span>
                          <span className="text-right font-mono">{montant(l.debit)}</span>
                          <span className="text-right font-mono">{montant(l.credit)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {onglet === 'budgetaire' && (
        <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden">
          {plan && !plan.gererBudgets ? (
            <div className="px-4 py-4 text-[12px] text-text-dim">
              L'axe {plan.intitule} ne porte pas de budget. Le budget se tient sur l'axe des projets : un projet
              cofinancé n'a pas un budget par bailleur, il a un budget et plusieurs financeurs.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[120px_1fr_140px_140px_140px_100px] gap-2 px-4 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>SECTION</span>
                <span>INTITULÉ</span>
                <span className="text-right">BUDGET</span>
                <span className="text-right">RÉALISÉ</span>
                <span className="text-right">ÉCART</span>
                <span className="text-right">CONSOMMÉ</span>
              </div>
              {!budgetaire && <div className="px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
              {budgetaire?.lignes.map((l) => (
                <div
                  key={l.sectionId}
                  className={`grid grid-cols-[120px_1fr_140px_140px_140px_100px] gap-2 px-4 py-1 text-[12px] border-b border-border/40 ${
                    l.horsBudget ? 'bg-danger-soft' : l.ecart < 0 ? 'bg-warning-soft' : ''
                  }`}
                >
                  <span className="font-mono">{l.code}</span>
                  <span>
                    {l.intitule}
                    {l.horsBudget && <span className="ml-2 text-[10px] font-bold text-danger">hors budget</span>}
                  </span>
                  <span className="text-right font-mono">{montant(l.budget)}</span>
                  <span className="text-right font-mono">{montant(l.realise)}</span>
                  <span className={`text-right font-mono ${l.ecart < 0 ? 'text-danger font-bold' : ''}`}>
                    {montant(l.ecart)}
                  </span>
                  <span className="text-right font-mono text-text-dim">
                    {l.tauxConsommation !== null ? `${l.tauxConsommation.toFixed(0)} %` : ''}
                  </span>
                </div>
              ))}
              {budgetaire && (
                <div className="grid grid-cols-[120px_1fr_140px_140px_140px_100px] gap-2 px-4 py-1.5 bg-chrome border-t border-border text-[12px] font-bold">
                  <span />
                  <span>Total</span>
                  <span className="text-right font-mono">{montant(budgetaire.totaux.budget)}</span>
                  <span className="text-right font-mono">{montant(budgetaire.totaux.realise)}</span>
                  <span className="text-right font-mono">{montant(budgetaire.totaux.ecart)}</span>
                  <span className="text-right font-mono">
                    {budgetaire.totaux.tauxConsommation !== null
                      ? `${budgetaire.totaux.tauxConsommation.toFixed(0)} %`
                      : ''}
                  </span>
                </div>
              )}
              <p className="px-4 py-2 text-[10.5px] text-text-dim border-t border-border leading-[1.5]">
                Une section mouvementée sans dotation apparaît en rouge, marquée « hors budget » : pour un financeur,
                c'est la ligne la plus importante de l'état. Un écart négatif signale un dépassement.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
