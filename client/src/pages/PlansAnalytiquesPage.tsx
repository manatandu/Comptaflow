import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { Bailleur, BudgetSection, PlanAnalytique, SectionAnalytique } from '../lib/types';

/**
 * PLANS ANALYTIQUES · Structure → Plan analytique de Sage 100 i7, dans la
 * disposition à trois volets déjà retenue pour le plan comptable et le plan
 * des tiers : les axes à gauche, les sections au centre, la fiche de la
 * section à droite.
 *
 * Le guide Sage écrit pour une ONG paramètre UN axe, « PROJETS », qui sert en
 * même temps de plan budgétaire. OmegaX en livre deux, Projets et Bailleurs,
 * parce qu'une EBNL pose deux questions distinctes à sa comptabilité : quel
 * projet a consommé la dépense, et quel financeur la couvre. Le budget ne se
 * tient que sur le premier · un projet cofinancé n'a pas un budget par
 * bailleur, il a un budget et plusieurs financeurs.
 *
 * Voir docs/analytique-et-budget.md.
 */

const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Une date ISO renvoyée par l'API, en jour/mois/année. */
function jour(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '…';
}

function montant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PlansAnalytiquesPage() {
  const { estAdmin } = useAuth();
  const { exerciceCourant } = useExercice();

  const [plans, setPlans] = useState<PlanAnalytique[] | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionAnalytique[]>([]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [bailleurs, setBailleurs] = useState<Bailleur[]>([]);
  const [budget, setBudget] = useState<BudgetSection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  const [nouvelleOuverte, setNouvelleOuverte] = useState(false);
  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [type, setType] = useState<'DETAIL' | 'TOTAL'>('DETAIL');
  const [bailleurId, setBailleurId] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const [dotation, setDotation] = useState('');

  const plan = plans?.find((p) => p.id === planId) ?? null;
  const section = sections.find((s) => s.id === sectionId) ?? null;

  useEffect(() => {
    api.get<PlanAnalytique[]>('/analytique/plans').then(
      (r) => {
        setPlans(r);
        setPlanId((id) => id ?? r[0]?.id ?? null);
      },
      (e) => setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
    );
    api.get<Bailleur[]>('/bailleurs').then(setBailleurs, () => setBailleurs([]));
  }, []);

  const chargerSections = async (id: string) => {
    try {
      const r = await api.get<SectionAnalytique[]>(`/analytique/plans/${id}/sections`);
      // Le compteur de l'axe vient de la liste des plans : sans ce
      // rafraîchissement il resterait à zéro après la création d'une section.
      api.get<PlanAnalytique[]>('/analytique/plans').then(setPlans, () => undefined);
      setSections(r);
      setSectionId((s) => (r.some((x) => x.id === s) ? s : null));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement des sections impossible');
    }
  };

  useEffect(() => {
    if (planId) chargerSections(planId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  useEffect(() => {
    if (!sectionId || !exerciceCourant || !plan?.gererBudgets) {
      setBudget(null);
      return;
    }
    api
      .get<BudgetSection>(`/analytique/sections/${sectionId}/budget?exerciceId=${exerciceCourant.id}`)
      .then(setBudget, () => setBudget(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, exerciceCourant?.id, plan?.gererBudgets]);

  const listeFiltree = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) => s.code.toLowerCase().includes(q) || s.intitule.toLowerCase().includes(q));
  }, [sections, recherche]);

  const creerSection = async (e: FormEvent) => {
    e.preventDefault();
    if (!planId) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const creee = await api.post<SectionAnalytique>(`/analytique/plans/${planId}/sections`, {
        code,
        intitule,
        type,
        bailleurId: bailleurId || undefined,
        dateDebut: dateDebut || undefined,
        dateFin: dateFin || undefined,
      });
      await chargerSections(planId);
      setSectionId(creee.id);
      setNouvelleOuverte(false);
      setCode('');
      setIntitule('');
      setBailleurId('');
      setDateDebut('');
      setDateFin('');
      setInfo(`Section ${creee.code} créée`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const doter = async () => {
    if (!sectionId || !exerciceCourant) return;
    setErreur(null);
    try {
      setBudget(
        await api.post<BudgetSection>(`/analytique/sections/${sectionId}/budget`, {
          exerciceId: exerciceCourant.id,
          montantAnnuel: Number(dotation),
        }),
      );
      setInfo('Dotation répartie sur les mois couverts par la convention.');
      setDotation('');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Dotation impossible');
    }
  };

  const modifierMois = async (mois: number, valeur: string) => {
    if (!sectionId || !exerciceCourant) return;
    try {
      setBudget(
        await api.patch<BudgetSection>(`/analytique/sections/${sectionId}/budget`, {
          exerciceId: exerciceCourant.id,
          mois,
          montant: Number(valeur || 0),
        }),
      );
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  const basculerSommeil = async () => {
    if (!section) return;
    try {
      await api.patch(`/analytique/sections/${section.id}`, { estActive: !section.estActive });
      if (planId) await chargerSections(planId);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[9.5px] font-mono text-text-dim leading-none">STRUCTURE</div>
          <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
            Plans analytiques
            <Aide sujet="analytique" />
          </h1>
        </div>
        <div className="flex items-end gap-2">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (code, intitulé)…"
            className="border border-border rounded-[6px] bg-surface px-2.5 py-1.5 text-[12px] min-w-[240px]"
          />
          {estAdmin && (
            <button
              onClick={() => setNouvelleOuverte(true)}
              disabled={!planId}
              className="bg-sel text-white text-[12px] font-bold px-3.5 py-1.5 rounded-[6px] hover:brightness-110 disabled:opacity-50"
            >
              Nouvelle section
            </button>
          )}
        </div>
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

      <div className="grid grid-cols-[210px_1fr_330px] gap-2.5 items-start">
        {/* Axes */}
        <aside className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
            AXES D'ANALYSE
          </header>
          <div className="p-1">
            {(plans ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => setPlanId(p.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[12px] rounded-[6px] ${
                  planId === p.id ? 'bg-sel text-white' : 'hover:bg-chrome-alt'
                }`}
              >
                <span className="flex items-baseline gap-1.5">
                  {p.intitule}
                  <span className={`font-mono text-[10px] ${planId === p.id ? 'text-white/60' : 'text-text-dim'}`}>
                    {p.code}
                  </span>
                </span>
                <span className={planId === p.id ? 'text-white/70' : 'text-text-dim'}>{p._count?.sections ?? 0}</span>
              </button>
            ))}
            {plans?.length === 0 && <div className="px-2.5 py-2 text-[11.5px] text-text-dim">Aucun axe</div>}
          </div>
          {plan && (
            <div className="px-3 py-2.5 border-t border-border text-[10.5px] text-text-dim leading-[1.5]">
              Ventilation attendue sur les classes{' '}
              <span className="font-mono">{plan.classesVentilees.split(',').join(', ')}</span>
              {plan.ventilationObligatoire ? ' · obligatoire en saisie' : ' · signalée, non bloquante'}
              {plan.gererBudgets && ' · porte le budget'}
            </div>
          )}
        </aside>

        {/* Sections */}
        <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <div className="grid grid-cols-[100px_1fr_130px_90px] gap-2 px-3 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
            <span>CODE</span>
            <span>INTITULÉ</span>
            <span>BAILLEUR</span>
            <span>CONVENTION</span>
          </div>
          <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
            {listeFiltree.map((s) => (
              <button
                key={s.id}
                onClick={() => setSectionId(s.id)}
                className={`w-full grid grid-cols-[100px_1fr_130px_90px] gap-2 px-3 py-1.5 text-[12px] text-left border-b border-border/50 ${
                  sectionId === s.id ? 'bg-sel text-white' : 'hover:bg-chrome-alt'
                } ${!s.estActive ? 'opacity-50' : ''}`}
              >
                <span className={`font-mono ${s.type === 'TOTAL' ? 'font-bold' : ''}`}>{s.code}</span>
                <span className={s.type === 'TOTAL' ? 'font-bold' : ''}>{s.intitule}</span>
                <span className={`truncate ${sectionId === s.id ? 'text-white/80' : 'text-text-dim'}`}>
                  {s.bailleur?.nom ?? ''}
                </span>
                <span className={`font-mono text-[10.5px] ${sectionId === s.id ? 'text-white/80' : 'text-text-dim'}`}>
                  {s.dateDebut ? `${jour(s.dateDebut).slice(3)} → ${s.dateFin ? jour(s.dateFin).slice(3) : '…'}` : ''}
                </span>
              </button>
            ))}
            {listeFiltree.length === 0 && (
              <div className="px-3 py-4 text-[12px] text-text-dim italic">
                Aucune section. Un axe sans section ne ventile rien : créez vos projets ou vos bailleurs.
              </div>
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-border bg-chrome text-[10.5px] text-text-dim">
            {listeFiltree.length} section{listeFiltree.length > 1 ? 's' : ''}
          </div>
        </section>

        {/* Fiche */}
        <aside className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
            FICHE DE LA SECTION
          </header>
          {!section ? (
            <p className="p-3 text-[12px] text-text-dim leading-[1.55]">
              Sélectionnez une section pour voir sa fiche : identification, convention de financement et dotation
              budgétaire de l'exercice.
            </p>
          ) : (
            <div className="p-3 flex flex-col gap-3">
              <div>
                <div className="font-mono text-[13px] font-bold">{section.code}</div>
                <div className="text-[12.5px]">{section.intitule}</div>
                <div className="text-[10.5px] text-text-dim mt-1">
                  {section.type === 'TOTAL' ? 'Section Total · regroupe ses sections Détail' : 'Section Détail'}
                  {!section.estActive && ' · en sommeil'}
                </div>
              </div>

              {section.bailleur && (
                <div className="text-[12px]">
                  <span className="text-text-dim">Bailleur </span>
                  <span className="font-medium">{section.bailleur.nom}</span>
                </div>
              )}

              {(section.dateDebut || section.dateFin) && (
                <div className="text-[12px]">
                  <span className="text-text-dim">Convention </span>
                  <span className="font-mono">
                    {jour(section.dateDebut)} au {jour(section.dateFin)}
                  </span>
                </div>
              )}

              {plan?.gererBudgets && section.type === 'DETAIL' && (
                <div className="border-t border-border pt-3">
                  <div className="text-[10px] font-bold text-text-dim mb-2 flex items-center gap-1.5">
                    DOTATION BUDGÉTAIRE
                    <Aide sujet="budget" />
                  </div>
                  {estAdmin && (
                    <div className="flex gap-1.5 mb-2">
                      <input
                        value={dotation}
                        onChange={(e) => setDotation(e.target.value)}
                        placeholder="Montant annuel"
                        className="flex-1 min-w-0 border border-border rounded-[6px] px-2 py-1 text-[12px] font-mono"
                      />
                      <button
                        onClick={doter}
                        disabled={!dotation}
                        className="bg-sel text-white text-[11.5px] font-semibold px-2.5 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                      >
                        Répartir
                      </button>
                    </div>
                  )}
                  {budget && budget.mensuel.length > 0 ? (
                    <>
                      <div className="flex justify-between text-[12px] font-bold mb-1.5">
                        <span>Exercice</span>
                        <span className="font-mono">{montant(budget.annuel)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {budget.mensuel.map((m) => (
                          <div key={m.mois} className="flex items-center justify-between text-[11.5px]">
                            <span className="text-text-dim">{MOIS[m.mois - 1]}</span>
                            {estAdmin ? (
                              <input
                                defaultValue={m.montant}
                                onBlur={(e) => modifierMois(m.mois, e.target.value)}
                                className="w-[86px] text-right font-mono border border-transparent hover:border-border focus:border-sel rounded-[4px] px-1 bg-transparent focus:outline-none"
                              />
                            ) : (
                              <span className="font-mono">{montant(m.montant)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10.5px] text-text-dim mt-2 leading-[1.5]">
                        Répartie sur les mois que la convention couvre réellement, et non sur douze : un financement
                        de huit mois étalé sur l'année fausserait tous les écarts.
                      </p>
                    </>
                  ) : (
                    <p className="text-[11.5px] text-text-dim">Aucune dotation sur cet exercice.</p>
                  )}
                </div>
              )}

              {estAdmin && (
                <div className="border-t border-border pt-3">
                  <button
                    onClick={basculerSommeil}
                    className="w-full border border-border rounded-[6px] px-3 py-1.5 text-[11.5px] hover:bg-chrome-alt"
                  >
                    {section.estActive ? 'Mettre en sommeil' : 'Réactiver'}
                  </button>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {nouvelleOuverte && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 anim-voile">
          <form
            onSubmit={creerSection}
            className="w-full max-w-[520px] bg-surface border border-border rounded-[10px] overflow-hidden shadow-flottante anim-modale"
          >
            <div
              className="h-[34px] flex items-center px-3 text-white text-[12px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              Nouvelle section de l'axe {plan?.intitule}
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <label className="text-[11.5px] font-semibold text-text-dim">
                Code
                <input
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="EAU-KIVU"
                  className="mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[13px] font-mono font-normal"
                />
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim">
                Type
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'DETAIL' | 'TOTAL')}
                  className="mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[13px] font-normal"
                >
                  <option value="DETAIL">Détail · reçoit les imputations</option>
                  <option value="TOTAL">Total · regroupe dans les états</option>
                </select>
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                Intitulé
                <input
                  required
                  value={intitule}
                  onChange={(e) => setIntitule(e.target.value)}
                  placeholder="Accès à l'eau potable · Nord-Kivu"
                  className="mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[13px] font-normal"
                />
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                Bailleur (facultatif)
                <select
                  value={bailleurId}
                  onChange={(e) => setBailleurId(e.target.value)}
                  className="mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[13px] font-normal"
                >
                  <option value="">Aucun</option>
                  {bailleurs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim">
                Début de convention
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[13px] font-mono font-normal"
                />
              </label>
              <label className="text-[11.5px] font-semibold text-text-dim">
                Fin de convention
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[13px] font-mono font-normal"
                />
              </label>
              <p className="col-span-2 text-[11px] text-text-dim leading-[1.5]">
                Les dates de convention commandent la répartition du budget : seuls les mois qu'elles couvrent
                reçoivent une dotation.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-chrome">
              <button
                type="button"
                onClick={() => setNouvelleOuverte(false)}
                className="px-4 py-1.5 border border-border rounded-[6px] bg-surface text-[12.5px] hover:bg-chrome-alt"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={envoi}
                className="px-5 py-1.5 bg-sel text-white text-[12.5px] font-semibold rounded-[6px] hover:brightness-110 disabled:opacity-50"
              >
                {envoi ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
