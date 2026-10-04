import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { PlanAnalytique, SectionAnalytique } from '../lib/types';
import { montant as fmt } from '../lib/montants';
import {
  comportementsAdmis,
  lireNombre,
  LIBELLES_COMPORTEMENT,
  soldesMontres,
  totalCle,
  type Comportement,
} from '../lib/comptabilite-gestion';

/**
 * COMPTABILITÉ DE GESTION (ligne A20, relevé CPCC C17) · une fenêtre, quatre
 * onglets · le comportement des comptes (déclaré), les clés de répartition
 * (qui passent des OD analytiques, jamais une écriture), le coût de
 * production avec imputation rationnelle (AUDCIF Titre VIII ch. 14 § 2.3.2)
 * et le seuil de rentabilité (définition d'OmegaX). Le serveur calcule tout ;
 * l'écran lit, déclare et confirme.
 */

type Vue = 'comportements' | 'cles' | 'cout' | 'seuil';

interface CompteGestion {
  compteId: string;
  numero: string;
  intitule: string;
  classe: string;
  comportement: Comportement | null;
  partVariablePct: number | null;
  mouvementDebit: number;
  mouvementCredit: number;
}

interface Cle {
  id: string;
  plan: { code: string; intitule: string };
  sectionSource: { code: string; intitule: string };
  libelle: string;
  mode: 'POURCENTAGE' | 'UNITES';
  unite: string | null;
  source: string;
  odsProduites: number;
  lignes: { sectionCibleId: string; code: string; intitule: string; valeur: number }[];
}

interface Proposition {
  date: string;
  exerciceClos: boolean;
  total: number;
  ods: { compteId: string; numero: string; intitule: string; solde: number; lignes: { code: string | null; debit: number; credit: number }[] }[];
}

interface LigneMontant {
  numero: string;
  intitule: string;
  montant: number;
}

interface DeclarationCout {
  id: string;
  sectionId: string;
  section: { code: string; intitule: string };
  unite: string;
  source: string;
  capaciteNormale: number;
  activiteReelle: number;
  quantiteProduite: number | null;
  calcul: {
    chargesVariables: number;
    chargesFixes: number;
    coefficient: number;
    suractivite: boolean;
    chargesFixesImputees: number;
    sousActivite: number;
    coutProduction: number | null;
    coutUnitaire: number | null;
    horsCalcul: LigneMontant[];
    nonDeclares: LigneMontant[];
  };
}

interface Seuil {
  exercice: { mois: number };
  brouillardCompris: boolean;
  comportementsFigesLe: string | null;
  produits: number;
  chargesVariables: number;
  chargesFixes: number;
  marge: number;
  tauxMarge: number | null;
  seuil: number | null;
  margeSecurite: number | null;
  indiceSecurite: number | null;
  pointMortMois: number | null;
  motif: string | null;
  horsCalcul: LigneMontant[];
  nonDeclares: LigneMontant[];
}

const message = (err: unknown, defaut: string) => (err instanceof ApiError ? err.message : defaut);

export function ComptabiliteGestionPage() {
  const { peutEcrire } = useAuth();
  const { exerciceCourant } = useExercice();
  const [vue, setVue] = useState<Vue>('comportements');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const exerciceId = exerciceCourant?.id ?? null;
  // Stables · les onglets les mettent dans les dépendances de leurs lectures,
  // une fonction neuve à chaque rendu relancerait la lecture sans fin.
  const notifier = useCallback((texte: string) => {
    setErreur(null);
    setInfo(texte);
  }, []);
  const echouer = useCallback((err: unknown, defaut: string) => {
    setInfo(null);
    setErreur(message(err, defaut));
  }, []);

  return (
    <div className="text-[11.5px]">
      <div className="ecran-seul flex gap-1 px-2 pt-2 items-end" role="tablist">
        {(
          [
            ['comportements', 'Comportement des comptes'],
            ['cles', 'Clés de répartition'],
            ['cout', 'Coût de production'],
            ['seuil', 'Seuil de rentabilité'],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={vue === cle}
            onClick={() => setVue(cle)}
            className={`px-3 py-1 text-[11.5px] border-b-2 ${vue === cle ? 'border-sel font-semibold' : 'border-transparent text-text-dim'}`}
          >
            {libelle}
          </button>
        ))}
        <Aide
          titre="Comptabilité de gestion"
          texte="Définitions d'OmegaX. La comptabilité analytique de gestion n'est ni normalisée ni obligatoire, et les comptes 92 à 99 sont laissés à l'initiative de l'entité, au SYSCOHADA comme au SYCEBNL · une association peut s'en servir. Rien de ce qui se calcule ici n'entre au grand livre : la répartition passe par des OD analytiques équilibrées, le coût de production et le seuil se lisent et ne se postent pas. Le comportement d'un compte (fixe, variable, semi-variable, produit d'activité, hors calcul) se déclare, il ne se déduit jamais de son numéro ; un compte mouvementé non déclaré rend le calcul incomplet. Changer un comportement ne récrit pas un exercice clos · ses comportements sont figés avant la première déclaration qui suit sa clôture."
          source="AUDCIF Titre VI, « Comptabilité analytique de gestion », « Charges fixes et variables », « Répartition » ; Titre VII classe 9 ; SYCEBNL Partie 2 ch. 3, section 9"
        />
      </div>
      <div className="p-3 space-y-3">
        {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
        {info && <div className="text-positive bg-positive-soft border border-positive/30 px-3 py-2">{info}</div>}
        {!exerciceId && <p className="text-text-dim">Choisissez un exercice.</p>}
        {exerciceId && vue === 'comportements' && (
          <Comportements exerciceId={exerciceId} peutEcrire={peutEcrire} notifier={notifier} echouer={echouer} />
        )}
        {exerciceId && vue === 'cles' && <Cles exerciceId={exerciceId} peutEcrire={peutEcrire} notifier={notifier} echouer={echouer} />}
        {exerciceId && vue === 'cout' && <Couts exerciceId={exerciceId} peutEcrire={peutEcrire} notifier={notifier} echouer={echouer} />}
        {exerciceId && vue === 'seuil' && <SeuilVue exerciceId={exerciceId} echouer={echouer} />}
      </div>
    </div>
  );
}

interface PropsOnglet {
  exerciceId: string;
  peutEcrire: boolean;
  notifier: (t: string) => void;
  echouer: (e: unknown, d: string) => void;
}

function Comportements({ exerciceId, peutEcrire, notifier, echouer }: PropsOnglet) {
  const [lus, setLus] = useState<{ comptes: CompteGestion[]; total: number; tronque: boolean } | null>(null);
  const [saisie, setSaisie] = useState<Record<string, { comportement: Comportement | ''; part: string }>>({});
  const [envoi, setEnvoi] = useState(false);

  // RÉPONSES PÉRIMÉES JETÉES · un changement d'exercice relance la lecture ;
  // la réponse de l'ancien, arrivée après, ne doit pas s'afficher sous le nouveau.
  const jeton = useRef(0);
  const charger = useCallback(async () => {
    const j = ++jeton.current;
    try {
      const r = await api.get<{ comptes: CompteGestion[]; total: number; tronque: boolean }>(`/comptabilite-gestion/comportements?exerciceId=${exerciceId}`);
      if (jeton.current !== j) return;
      setLus(r);
      setSaisie(
        Object.fromEntries(r.comptes.map((c) => [c.compteId, { comportement: c.comportement ?? '', part: c.partVariablePct === null ? '' : String(c.partVariablePct) }])),
      );
    } catch (err) {
      if (jeton.current !== j) return;
      setLus(null);
      echouer(err, 'Comptes de gestion illisibles');
    }
  }, [exerciceId, echouer]);

  useEffect(() => {
    charger();
  }, [charger]);

  const modifies = (lus?.comptes ?? []).filter((c) => {
    const s = saisie[c.compteId];
    if (!s) return false;
    const part = s.comportement === 'CHARGE_SEMI_VARIABLE' ? lireNombre(s.part) : null;
    return (s.comportement || null) !== c.comportement || part !== c.partVariablePct;
  });

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      await api.put('/comptabilite-gestion/comportements', {
        declarations: modifies.map((c) => {
          const s = saisie[c.compteId];
          return {
            compteId: c.compteId,
            comportement: s.comportement || null,
            partVariablePct: s.comportement === 'CHARGE_SEMI_VARIABLE' ? lireNombre(s.part) : null,
          };
        }),
      });
      notifier(`${modifies.length} compte(s) déclaré(s).`);
      await charger();
    } catch (err) {
      echouer(err, 'Déclaration non enregistrée');
    } finally {
      setEnvoi(false);
    }
  };

  if (lus === null) return null;
  if (lus.comptes.length === 0) return <p className="text-text-dim">Aucun compte de charges ou de produits mouvementé sur cet exercice.</p>;
  return (
    <div className="space-y-2">
      {lus.tronque && <div className="text-warning">{lus.comptes.length} comptes montrés sur {lus.total}.</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="text-left px-2 py-1">Compte</th>
              <th className="text-right px-2 py-1 w-[130px]">Mouvement net</th>
              <th className="text-left px-2 py-1 w-[200px]">Comportement</th>
              <th className="text-right px-2 py-1 w-[110px]">Part variable %</th>
            </tr>
          </thead>
          <tbody>
            {lus.comptes.map((c) => {
              const s = saisie[c.compteId] ?? { comportement: '', part: '' };
              const net = c.classe === '6' ? c.mouvementDebit - c.mouvementCredit : c.mouvementCredit - c.mouvementDebit;
              return (
                <tr key={c.compteId}>
                  <td className="px-2 py-1">
                    {c.numero} · {c.intitule}
                  </td>
                  <td className="px-2 py-1 text-right">{fmt(net)}</td>
                  <td className="px-2 py-1">
                    <select
                      aria-label={`Comportement du compte ${c.numero}`}
                      disabled={!peutEcrire}
                      value={s.comportement}
                      onChange={(e) => setSaisie((x) => ({ ...x, [c.compteId]: { ...s, comportement: e.target.value as Comportement | '' } }))}
                      className={`w-full border px-2 py-[2px] bg-surface ${s.comportement ? 'border-border' : 'border-warning'}`}
                    >
                      <option value="">Non déclaré</option>
                      {comportementsAdmis(c.classe).map((k) => (
                        <option key={k} value={k}>
                          {LIBELLES_COMPORTEMENT[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    {s.comportement === 'CHARGE_SEMI_VARIABLE' && (
                      <input
                        aria-label={`Part variable du compte ${c.numero}`}
                        inputMode="decimal"
                        disabled={!peutEcrire}
                        value={s.part}
                        onChange={(e) => setSaisie((x) => ({ ...x, [c.compteId]: { ...s, part: e.target.value } }))}
                        className="w-full border border-border px-1.5 py-[1px] text-right"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {peutEcrire && (
        <div className="flex">
          <button
            onClick={enregistrer}
            disabled={envoi || modifies.length === 0}
            className="ml-auto bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40"
          >
            {envoi ? '…' : `Enregistrer (${modifies.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

function Cles({ exerciceId, peutEcrire, notifier, echouer }: PropsOnglet) {
  const [cles, setCles] = useState<Cle[] | null>(null);
  const [plans, setPlans] = useState<PlanAnalytique[] | null>(null);
  const [planId, setPlanId] = useState('');
  const [sections, setSections] = useState<SectionAnalytique[] | null>(null);
  const [source, setSource] = useState('');
  const [sectionSourceId, setSectionSourceId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [mode, setMode] = useState<'POURCENTAGE' | 'UNITES'>('POURCENTAGE');
  const [unite, setUnite] = useState('');
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [proposition, setProposition] = useState<{ cleId: string; p: Proposition } | null>(null);
  const [date, setDate] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const jeton = useRef(0);
  const jetonSections = useRef(0);
  const jetonProposition = useRef(0);
  const charger = useCallback(async () => {
    const j = ++jeton.current;
    try {
      const r = await api.get<Cle[]>(`/comptabilite-gestion/cles?exerciceId=${exerciceId}`);
      if (jeton.current === j) setCles(r);
    } catch (err) {
      if (jeton.current === j) echouer(err, 'Clés de répartition illisibles');
    }
  }, [exerciceId, echouer]);

  useEffect(() => {
    charger();
    api
      .get<PlanAnalytique[]>('/analytique/plans')
      .then((p) => {
        setPlans(p);
        setPlanId((id) => id || (p.length === 1 ? p[0].id : ''));
      })
      .catch((err) => echouer(err, 'Plans analytiques illisibles'));
  }, [charger, echouer]);

  useEffect(() => {
    if (!planId) return;
    const j = ++jetonSections.current;
    setSections(null);
    api.get<SectionAnalytique[]>(`/analytique/plans/${planId}/sections`).then(
      (r) => {
        if (jetonSections.current === j) setSections(r);
      },
      (err) => {
        if (jetonSections.current === j) echouer(err, 'Sections du plan illisibles');
      },
    );
  }, [planId, echouer]);

  const feuilles = (sections ?? []).filter((s) => s.type === 'DETAIL' && s.id !== sectionSourceId);
  const lignes = feuilles.map((s) => ({ sectionCibleId: s.id, valeur: lireNombre(valeurs[s.id] ?? '') })).filter((l) => l.valeur !== null && l.valeur > 0);
  const total = totalCle(lignes.map((l) => l.valeur));

  const creer = async () => {
    setEnvoi(true);
    try {
      await api.post('/comptabilite-gestion/cles', {
        exerciceId,
        planId,
        sectionSourceId,
        libelle,
        mode,
        ...(mode === 'UNITES' ? { unite } : {}),
        source,
        lignes,
      });
      notifier('Clé enregistrée.');
      setValeurs({});
      setLibelle('');
      await charger();
    } catch (err) {
      echouer(err, 'Clé non enregistrée');
    } finally {
      setEnvoi(false);
    }
  };

  const reprendre = async () => {
    try {
      const r = await api.post<{ reprises: number; ecartees: { section: string; motif: string }[] }>('/comptabilite-gestion/cles/reprendre', { exerciceId });
      notifier(
        `${r.reprises} clé(s) reprise(s).` + (r.ecartees.length ? ` Écartées · ${r.ecartees.map((e) => `${e.section} (${e.motif})`).join(' ; ')}` : ''),
      );
      await charger();
    } catch (err) {
      echouer(err, 'Reprise impossible');
    }
  };

  const proposer = async (cleId: string) => {
    // Deux « Proposer » d'affilée · seule la dernière proposition s'affiche, et
    // c'est elle que « Passer » envoie.
    const j = ++jetonProposition.current;
    try {
      const p = await api.get<Proposition>(`/comptabilite-gestion/cles/${cleId}/proposition${date ? `?date=${date}` : ''}`);
      if (jetonProposition.current === j) setProposition({ cleId, p });
    } catch (err) {
      if (jetonProposition.current === j) echouer(err, 'Proposition impossible');
    }
  };

  const repartir = async () => {
    if (!proposition) return;
    setEnvoi(true);
    try {
      const r = await api.post<{ ods: number; total: number }>(`/comptabilite-gestion/cles/${proposition.cleId}/repartir`, {
        date: proposition.p.date,
        soldes: soldesMontres(proposition.p.ods),
      });
      notifier(`${r.ods} OD analytique(s) passée(s), ${fmt(r.total)} réparti(s).`);
      setProposition(null);
      await charger();
    } catch (err) {
      echouer(err, 'Répartition non passée');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    try {
      await api.delete(`/comptabilite-gestion/cles/${id}`);
      await charger();
    } catch (err) {
      echouer(err, 'Clé non retirée');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-text-dim">Date de la répartition</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-border px-2 py-[2px]" />
        </label>
        {peutEcrire && (
          <button onClick={reprendre} className="border border-border px-3 py-1">
            Reprendre les clés de l'exercice précédent
          </button>
        )}
        <Aide
          titre="Clés de répartition"
          texte="Une clé vide une section (auxiliaire) sur d'autres sections du même plan, en pourcentages (somme de cent) ou en unités (surfaces, heures, effectifs), avec sa source. La répartition propose une OD analytique par compte général, équilibrée, au centime par le plus fort reste ; elle ne passe qu'au clic, et le serveur rejoue le calcul. Aucune prestation réciproque n'est résolue : une section cible qui est elle-même auxiliaire se répartit ensuite par sa propre clé (méthode en escalier). Une clé vaut pour un exercice ; l'exercice suivant la reprend ou la redéclare. Sans date, la répartition se fait au dernier jour de l'exercice."
          source="AUDCIF Titre VI, « Répartition », « Unité d'œuvre » · définition d'OmegaX"
        />
      </div>

      {cles !== null && cles.length === 0 && <p className="text-text-dim">Aucune clé sur cet exercice.</p>}
      {cles !== null && cles.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="text-left px-2 py-1">Section répartie</th>
                <th className="text-left px-2 py-1">Clé</th>
                <th className="text-left px-2 py-1">Sections receveuses</th>
                <th className="text-right px-2 py-1 w-[70px]">OD</th>
                <th className="w-[160px]" />
              </tr>
            </thead>
            <tbody>
              {cles.map((k) => (
                <tr key={k.id}>
                  <td className="px-2 py-1">
                    {k.plan.code} · {k.sectionSource.code}
                  </td>
                  <td className="px-2 py-1" title={k.source}>
                    {k.libelle} · {k.mode === 'POURCENTAGE' ? '%' : k.unite}
                  </td>
                  <td className="px-2 py-1 text-text-dim">{k.lignes.map((l) => `${l.code} ${l.valeur}`).join(' · ')}</td>
                  <td className="px-2 py-1 text-right">{k.odsProduites}</td>
                  <td className="px-2 py-1 text-right space-x-2">
                    <button onClick={() => proposer(k.id)} className="text-sel">
                      Proposer
                    </button>
                    {peutEcrire && k.odsProduites === 0 && (
                      <button onClick={() => supprimer(k.id)} title="Retirer la clé">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {proposition && (
        <div className="border border-border bg-surface p-3 space-y-2">
          <div className="font-semibold">Répartition au {new Date(proposition.p.date).toLocaleDateString('fr-FR')}</div>
          {proposition.p.ods.length === 0 && <p className="text-text-dim">La section ne porte aucun solde à cette date.</p>}
          {proposition.p.ods.map((o) => (
            <div key={o.compteId}>
              {o.numero} · {o.intitule} · {fmt(o.solde)} ·{' '}
              <span className="text-text-dim">{o.lignes.map((l) => `${l.code ?? '?'} ${l.debit ? '+' : '−'}${fmt(l.debit || l.credit)}`).join(' · ')}</span>
            </div>
          ))}
          {peutEcrire && !proposition.p.exerciceClos && proposition.p.ods.length > 0 && (
            <div className="flex">
              <button onClick={repartir} disabled={envoi} className="ml-auto bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40">
                {envoi ? '…' : 'Passer les OD analytiques'}
              </button>
            </div>
          )}
        </div>
      )}

      {peutEcrire && plans !== null && (
        <div className="border border-border bg-surface p-3 space-y-2">
          <div className="font-semibold">Nouvelle clé</div>
          {plans.length === 0 && <p className="text-warning">Aucun plan analytique · créez-en un dans Structure › Plans analytiques.</p>}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Plan</span>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                <option value="">Choisir…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Section à répartir</span>
              <select value={sectionSourceId} onChange={(e) => setSectionSourceId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                <option value="">{planId ? 'Choisir…' : "Choisissez d'abord un plan"}</option>
                {(sections ?? [])
                  .filter((s) => s.type === 'DETAIL')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.intitule}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 min-w-[180px] flex-1">
              <span className="text-text-dim">Libellé</span>
              <input value={libelle} onChange={(e) => setLibelle(e.target.value)} className="border border-border px-2 py-[2px]" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as 'POURCENTAGE' | 'UNITES')} className="border border-border px-2 py-[3px] bg-surface">
                <option value="POURCENTAGE">Pourcentages</option>
                <option value="UNITES">Unités</option>
              </select>
            </label>
            {mode === 'UNITES' && (
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Unité</span>
                <input value={unite} onChange={(e) => setUnite(e.target.value)} className="w-[100px] border border-border px-2 py-[2px]" />
              </label>
            )}
            <label className="flex flex-col gap-0.5 min-w-[200px] flex-1">
              <span className="text-text-dim">Source</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} className="border border-border px-2 py-[2px]" />
            </label>
          </div>
          {sectionSourceId && sections !== null && feuilles.length === 0 && (
            <div className="text-warning">Le plan n'a pas d'autre section de détail · créez-en dans Structure › Plans analytiques.</div>
          )}
          {sectionSourceId && feuilles.length > 0 && (
            <table className="w-full min-w-[420px]">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1">Section receveuse</th>
                  <th className="text-right px-2 py-1 w-[140px]">{mode === 'POURCENTAGE' ? '%' : unite || 'Unités'}</th>
                </tr>
              </thead>
              <tbody>
                {feuilles.map((s) => (
                  <tr key={s.id}>
                    <td className="px-2 py-1">
                      {s.code} · {s.intitule}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Valeur de la clé pour ${s.code}`}
                        inputMode="decimal"
                        value={valeurs[s.id] ?? ''}
                        onChange={(e) => setValeurs((v) => ({ ...v, [s.id]: e.target.value }))}
                        className="w-full border border-border px-1.5 py-[1px] text-right"
                      />
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1">Total</td>
                  <td className={`px-2 py-1 text-right ${mode === 'POURCENTAGE' && total !== 100 ? 'text-warning' : ''}`}>{total}</td>
                </tr>
              </tbody>
            </table>
          )}
          <div className="flex">
            <button
              onClick={creer}
              disabled={envoi || !planId || !sectionSourceId || !libelle || source.trim().length < 3 || lignes.length === 0}
              className="ml-auto bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40"
            >
              {envoi ? '…' : 'Enregistrer la clé'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Couts({ exerciceId, peutEcrire, notifier, echouer }: PropsOnglet) {
  const [lus, setLus] = useState<DeclarationCout[] | null>(null);
  const [plans, setPlans] = useState<PlanAnalytique[] | null>(null);
  const [planId, setPlanId] = useState('');
  const [sections, setSections] = useState<SectionAnalytique[] | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [unite, setUnite] = useState('');
  const [capacite, setCapacite] = useState('');
  const [activite, setActivite] = useState('');
  const [quantite, setQuantite] = useState('');
  const [source, setSource] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const jeton = useRef(0);
  const jetonSections = useRef(0);
  const [figeLe, setFigeLe] = useState<string | null>(null);
  const charger = useCallback(async () => {
    const j = ++jeton.current;
    try {
      const r = await api.get<{ declarations: DeclarationCout[]; comportementsFigesLe: string | null }>(
        `/comptabilite-gestion/couts-production?exerciceId=${exerciceId}`,
      );
      if (jeton.current !== j) return;
      setLus(r.declarations);
      setFigeLe(r.comportementsFigesLe);
    } catch (err) {
      if (jeton.current === j) echouer(err, 'Coûts de production illisibles');
    }
  }, [exerciceId, echouer]);

  useEffect(() => {
    charger();
    api
      .get<PlanAnalytique[]>('/analytique/plans')
      .then((p) => {
        setPlans(p);
        setPlanId((id) => id || (p.length === 1 ? p[0].id : ''));
      })
      .catch((err) => echouer(err, 'Plans analytiques illisibles'));
  }, [charger, echouer]);

  useEffect(() => {
    if (!planId) return;
    const j = ++jetonSections.current;
    setSections(null);
    api.get<SectionAnalytique[]>(`/analytique/plans/${planId}/sections`).then(
      (r) => {
        if (jetonSections.current === j) setSections(r);
      },
      (err) => {
        if (jetonSections.current === j) echouer(err, 'Sections du plan illisibles');
      },
    );
  }, [planId, echouer]);

  const declarer = async () => {
    setEnvoi(true);
    try {
      await api.post('/comptabilite-gestion/couts-production', {
        exerciceId,
        sectionId,
        unite,
        capaciteNormale: lireNombre(capacite),
        activiteReelle: lireNombre(activite),
        ...(lireNombre(quantite) !== null ? { quantiteProduite: lireNombre(quantite) } : {}),
        source,
      });
      notifier('Données enregistrées.');
      await charger();
    } catch (err) {
      echouer(err, 'Données non enregistrées');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    try {
      await api.delete(`/comptabilite-gestion/couts-production/${id}`);
      await charger();
    } catch (err) {
      echouer(err, 'Déclaration non retirée');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Aide
          titre="Coût de production"
          texte="Les frais fixes de production s'affectent au coût sur la base de la capacité normale des installations : la quote-part qui correspond à la sous-activité n'entre pas dans le coût, elle reste une charge de l'exercice (imputation rationnelle). Capacité normale et activité réelle se déclarent, dans la même unité, avec leur source. En suractivité, OmegaX n'impute pas plus que les charges fixes réellement encourues (coefficient borné à un). Les charges de la section se rangent par le comportement déclaré de leur compte ; un compte non déclaré rend le coût incomplet. Rien n'est posté au grand livre ni au magasin : la valorisation des stocks reste celle du module des stocks, et le coût unitaire peut y être porté par le cabinet comme coût d'entrée."
          source="AUDCIF Titre VIII ch. 14 § 2.3.1 et § 2.3.2 ; art. 37 ; SYCEBNL Partie 2 ch. 3, section 3"
        />
      </div>
      {figeLe && <div className="text-text-dim">Comportements figés le {new Date(figeLe).toLocaleDateString('fr-FR')} (exercice clos).</div>}
      {lus !== null && lus.length === 0 && <p className="text-text-dim">Aucune section déclarée sur cet exercice.</p>}
      {(lus ?? []).map((d) => (
        <div key={d.id} className="border border-border bg-surface p-3 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {d.section.code} · {d.section.intitule}
            </span>
            <span className="text-text-dim" title={d.source}>
              capacité {d.capaciteNormale} · activité {d.activiteReelle} {d.unite}
            </span>
            {peutEcrire && (
              <button onClick={() => supprimer(d.id)} className="ml-auto" title="Retirer la déclaration">
                ✕
              </button>
            )}
          </div>
          <table className="w-full min-w-[420px]">
            <tbody>
              <tr>
                <td className="px-2 py-0.5">Charges variables</td>
                <td className="px-2 py-0.5 text-right">{fmt(d.calcul.chargesVariables)}</td>
              </tr>
              <tr>
                <td className="px-2 py-0.5">Charges fixes</td>
                <td className="px-2 py-0.5 text-right">{fmt(d.calcul.chargesFixes)}</td>
              </tr>
              <tr>
                <td className="px-2 py-0.5">Coefficient d'imputation{d.calcul.suractivite ? ' (suractivité, borné à 1)' : ''}</td>
                <td className="px-2 py-0.5 text-right">{d.calcul.coefficient}</td>
              </tr>
              <tr>
                <td className="px-2 py-0.5">Charges fixes imputées</td>
                <td className="px-2 py-0.5 text-right">{fmt(d.calcul.chargesFixesImputees)}</td>
              </tr>
              <tr>
                <td className="px-2 py-0.5">Coût de la sous-activité · charge de l'exercice</td>
                <td className="px-2 py-0.5 text-right">{fmt(d.calcul.sousActivite)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="px-2 py-0.5">Coût de production</td>
                <td className="px-2 py-0.5 text-right">{fmt(d.calcul.coutProduction)}</td>
              </tr>
              {d.quantiteProduite !== null && (
                <tr>
                  <td className="px-2 py-0.5">Coût unitaire ({d.quantiteProduite} produites)</td>
                  <td className="px-2 py-0.5 text-right">{d.calcul.coutUnitaire ?? '·'}</td>
                </tr>
              )}
            </tbody>
          </table>
          {d.calcul.nonDeclares.length > 0 && (
            <div className="text-warning">
              Comptes sans comportement déclaré · {d.calcul.nonDeclares.map((n) => `${n.numero} (${fmt(n.montant)})`).join(' · ')}
            </div>
          )}
        </div>
      ))}

      {peutEcrire && plans !== null && (
        <div className="border border-border bg-surface p-3 space-y-2">
          <div className="font-semibold">Déclarer une section de production</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Plan</span>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                <option value="">Choisir…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Section</span>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                <option value="">{planId ? 'Choisir…' : "Choisissez d'abord un plan"}</option>
                {(sections ?? [])
                  .filter((s) => s.type === 'DETAIL')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.intitule}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Unité</span>
              <input value={unite} onChange={(e) => setUnite(e.target.value)} className="w-[110px] border border-border px-2 py-[2px]" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Capacité normale</span>
              <input inputMode="decimal" value={capacite} onChange={(e) => setCapacite(e.target.value)} className="w-[110px] border border-border px-2 py-[2px] text-right" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Activité réelle</span>
              <input inputMode="decimal" value={activite} onChange={(e) => setActivite(e.target.value)} className="w-[110px] border border-border px-2 py-[2px] text-right" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Quantité produite</span>
              <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} className="w-[110px] border border-border px-2 py-[2px] text-right" />
            </label>
            <label className="flex flex-col gap-0.5 min-w-[200px] flex-1">
              <span className="text-text-dim">Source</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} className="border border-border px-2 py-[2px]" />
            </label>
          </div>
          <div className="flex">
            <button
              onClick={declarer}
              disabled={envoi || !sectionId || !unite || lireNombre(capacite) === null || lireNombre(activite) === null || source.trim().length < 3}
              className="ml-auto bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40"
            >
              {envoi ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SeuilVue({ exerciceId, echouer }: { exerciceId: string; echouer: (e: unknown, d: string) => void }) {
  const [s, setS] = useState<Seuil | null>(null);
  const jeton = useRef(0);
  useEffect(() => {
    const j = ++jeton.current;
    setS(null);
    api.get<Seuil>(`/comptabilite-gestion/seuil-rentabilite?exerciceId=${exerciceId}`).then(
      (r) => {
        if (jeton.current === j) setS(r);
      },
      (err) => {
        if (jeton.current === j) echouer(err, 'Seuil de rentabilité illisible');
      },
    );
  }, [exerciceId, echouer]);
  if (s === null) return null;
  const lignes: [string, string][] = [
    ["Produits d'activité", fmt(s.produits)],
    ['Charges variables', fmt(s.chargesVariables)],
    ['Marge sur coûts variables', fmt(s.marge)],
    ['Taux de marge', s.tauxMarge === null ? '·' : `${s.tauxMarge} %`],
    ['Charges fixes', fmt(s.chargesFixes)],
    ['Seuil de rentabilité', fmt(s.seuil)],
    ['Marge de sécurité', fmt(s.margeSecurite)],
    ['Indice de sécurité', s.indiceSecurite === null ? '·' : `${s.indiceSecurite} %`],
    ['Point mort', s.pointMortMois === null ? '·' : `${s.pointMortMois} mois sur ${s.exercice.mois}`],
  ];
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Aide
          titre="Seuil de rentabilité"
          texte="Définition d'OmegaX : produits d'activité (comptes de classe 7 déclarés tels), charges variables et fixes (comptes de classe 6 selon leur comportement déclaré, la semi-variable à sa part variable), marge sur coûts variables, puis seuil = charges fixes divisées par le taux de marge. Le point mort suppose une activité régulière sur l'exercice. Les activités ordinaires seules ; le hors activités ordinaires et l'impôt n'y entrent pas. Mouvements de l'exercice, brouillard compris, écriture de clôture exclue."
          source="AUDCIF Titre VI, « Charges fixes et variables », « Marge » · définition d'OmegaX"
        />
      </div>
      {s.brouillardCompris && <div className="text-text-dim">Brouillard compris.</div>}
      {s.comportementsFigesLe && (
        <div className="text-text-dim">Comportements figés le {new Date(s.comportementsFigesLe).toLocaleDateString('fr-FR')} (exercice clos).</div>
      )}
      {s.motif && <div className="text-warning">{s.motif}</div>}
      <table className="w-full max-w-[520px]">
        <tbody>
          {lignes.map(([l, v]) => (
            <tr key={l}>
              <td className="px-2 py-0.5">{l}</td>
              <td className="px-2 py-0.5 text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.nonDeclares.length > 0 && (
        <div className="text-warning">Comptes sans comportement déclaré · {s.nonDeclares.map((n) => `${n.numero} (${fmt(n.montant)})`).join(' · ')}</div>
      )}
      {s.horsCalcul.length > 0 && (
        <div className="text-text-dim">Hors calcul · {s.horsCalcul.map((n) => `${n.numero} (${fmt(n.montant)})`).join(' · ')}</div>
      )}
    </div>
  );
}
