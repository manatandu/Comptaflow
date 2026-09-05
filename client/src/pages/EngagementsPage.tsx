import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type {
  EcritureRattachable,
  EngagementDepense,
  NatureEngagement,
  PlanAnalytique,
  SectionAnalytique,
} from '../lib/types';

/**
 * REGISTRE DES ENGAGEMENTS DE DÉPENSE.
 *
 * SYCEBNL, Guide d'application, ch. 7, APPLICATION 22, règle de remplissage
 * (d) : la colonne Engagement du tableau d'exécution budgétaire réunit le
 * solde créditeur des comptes fournisseurs (40 et 481), les « bons de commande
 * de biens et services remis aux fournisseurs au cours de l'exercice
 * budgétaire, NON EXÉCUTÉS », et les « contrats signés par les parties
 * prenantes au cours de l'exercice budgétaire, NON EXÉCUTÉS ».
 *
 * Les deux derniers ne sont pas des écritures : c'est cette fenêtre qui les
 * tient. Ce qui pèse sur le tableau est le RESTE À EXÉCUTER de chacun · d'où
 * la colonne du même nom, et le rattachement des écritures qui les exécutent.
 * Rattacher n'est pas un agrément : sans lui, une commande déjà facturée
 * serait comptée une fois par les comptes et une seconde fois ici.
 */

const NATURES: { valeur: NatureEngagement; libelle: string }[] = [
  { valeur: 'BON_DE_COMMANDE', libelle: 'Bon de commande' },
  { valeur: 'CONTRAT', libelle: 'Contrat' },
];

function montant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function EngagementsPage() {
  const { estAdmin, utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const peutSaisir = estAdmin || utilisateur?.role === 'COMPTABLE';

  const [engagements, setEngagements] = useState<EngagementDepense[] | null>(null);
  const [sections, setSections] = useState<SectionAnalytique[]>([]);
  const [ecritures, setEcritures] = useState<EcritureRattachable[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Formulaire de création.
  const [nature, setNature] = useState<NatureEngagement>('BON_DE_COMMANDE');
  const [sectionId, setSectionId] = useState('');
  const [reference, setReference] = useState('');
  const [objet, setObjet] = useState('');
  const [beneficiaire, setBeneficiaire] = useState('');
  const [date, setDate] = useState('');
  const [mnt, setMnt] = useState('');

  // Rattachement, ouvert sur un engagement à la fois.
  const [rattachementPour, setRattachementPour] = useState<string | null>(null);
  const [rEcritureId, setREcritureId] = useState('');
  const [rMontant, setRMontant] = useState('');

  const exerciceId = exerciceCourant?.id;

  const charger = useCallback(async () => {
    if (!exerciceId) return;
    try {
      const [liste, ecrs] = await Promise.all([
        api.get<EngagementDepense[]>(`/analytique/engagements?exerciceId=${exerciceId}`),
        api.get<EcritureRattachable[]>(`/analytique/engagements/ecritures-rattachables?exerciceId=${exerciceId}`),
      ]);
      setEngagements(liste);
      setEcritures(ecrs);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible.');
    }
  }, [exerciceId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    // Les sections BUDGÉTAIRES seulement · un engagement ne peut peser que sur
    // une ligne du tableau d'exécution budgétaire.
    (async () => {
      try {
        const plans = await api.get<PlanAnalytique[]>('/analytique/plans');
        const budgetaires = plans.filter((p) => p.gererBudgets && p.estActif);
        const listes = await Promise.all(
          budgetaires.map((p) => api.get<SectionAnalytique[]>(`/analytique/plans/${p.id}/sections`)),
        );
        setSections(listes.flat().filter((s) => s.estActive && s.type === 'DETAIL'));
      } catch {
        setSections([]);
      }
    })();
  }, []);

  async function onCreer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    try {
      await api.post('/analytique/engagements', {
        exerciceId,
        sectionId,
        nature,
        reference,
        objet,
        beneficiaire,
        date,
        montant: Number(mnt),
      });
      setReference('');
      setObjet('');
      setBeneficiaire('');
      setMnt('');
      setInfo("Engagement enregistré · il pèse désormais sur le tableau d'exécution budgétaire.");
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Enregistrement impossible.");
    }
  }

  async function onRattacher(e: FormEvent, engagementId: string) {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/analytique/engagements/${engagementId}/executions`, {
        ecritureId: rEcritureId,
        montant: Number(rMontant),
      });
      setRattachementPour(null);
      setREcritureId('');
      setRMontant('');
      setInfo("Écriture rattachée · le reste à exécuter de l'engagement a baissé d'autant.");
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Rattachement impossible.');
    }
  }

  async function onDetacher(engagementId: string, executionId: string) {
    setErreur(null);
    try {
      await api.delete(`/analytique/engagements/${engagementId}/executions/${executionId}`);
      setInfo("Rattachement retiré · le reste à exécuter remonte d'autant.");
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Retrait impossible.');
    }
  }

  async function onClore(engagementId: string) {
    const motif = window.prompt(
      "Motif de clôture (commande annulée, contrat résilié) · il libère du crédit disponible sur le projet, le bailleur doit pouvoir savoir pourquoi :",
    );
    if (motif === null) return;
    setErreur(null);
    try {
      await api.patch(`/analytique/engagements/${engagementId}/cloture`, { motif });
      setInfo("Engagement clos · il ne pèse plus sur le tableau d'exécution budgétaire.");
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Clôture impossible.');
    }
  }

  async function onRouvrir(engagementId: string) {
    setErreur(null);
    try {
      await api.patch(`/analytique/engagements/${engagementId}/reouverture`);
      setInfo('Engagement rouvert · il repèse sur le budget.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Réouverture impossible.');
    }
  }

  async function onSupprimer(engagementId: string) {
    setErreur(null);
    try {
      await api.delete(`/analytique/engagements/${engagementId}`);
      setInfo('Engagement supprimé.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Suppression impossible.');
    }
  }

  const totalReste = (engagements ?? []).reduce((s, e) => s + e.resteAExecuter, 0);

  return (
    <div className="flex flex-col gap-3 p-3">
      <EnteteImpression
        titre="Registre des engagements de dépense"
        sousTitre="Bons de commande remis et contrats signés, non exécutés · colonne Engagement du tableau d'exécution budgétaire"
      />

      <div className="ecran-seul flex items-center gap-2">
        <h1 className="text-[13px] font-bold">Engagements de dépense</h1>
        <Aide
          titre="Ce que ce registre porte"
          texte={
            "La colonne Engagement du tableau d'exécution budgétaire réunit trois termes : le solde créditeur des comptes " +
            'fournisseurs (40 et 481), que la comptabilité fournit seule, puis les bons de commande remis aux fournisseurs ' +
            "et les contrats signés, NON EXÉCUTÉS. Ces deux derniers ne sont pas des écritures : ils vivent ici. Ce qui pèse " +
            "sur le tableau est le RESTE À EXÉCUTER de chacun, et c'est le rattachement de l'écriture qui exécute un " +
            'engagement qui le fait baisser. Sans ce rattachement, une commande déjà facturée serait comptée deux fois.'
          }
          source="SYCEBNL, Guide d'application, ch. 7, APPLICATION 22, règle de remplissage (d)"
        />
      </div>

      {erreur && <div className="ecran-seul border border-danger bg-danger/10 px-3 py-1.5 text-[11px]">{erreur}</div>}
      {info && <div className="ecran-seul border border-border bg-surface-alt px-3 py-1.5 text-[11px]">{info}</div>}

      {peutSaisir && (
        <form
          onSubmit={onCreer}
          className="ecran-seul flex flex-wrap items-end gap-2 border border-border bg-surface px-3 py-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">NATURE</span>
            <select
              value={nature}
              onChange={(e) => setNature(e.target.value as NatureEngagement)}
              className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[150px]"
            >
              {NATURES.map((n) => (
                <option key={n.valeur} value={n.valeur}>
                  {n.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">LIGNE BUDGÉTAIRE</span>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              required
              className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[240px]"
            >
              <option value="">Choisir une section…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.intitule}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">RÉFÉRENCE</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
              placeholder="BC-2026-014"
              className="border border-border-dark bg-surface px-2 py-1 text-[11px] font-mono w-[140px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">OBJET</span>
            <input
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              required
              className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[220px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">BÉNÉFICIAIRE</span>
            <input
              value={beneficiaire}
              onChange={(e) => setBeneficiaire(e.target.value)}
              required
              className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[200px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span
              className="text-[10px] font-bold text-text-dim"
              title="Remise du bon au fournisseur, ou signature du contrat · le guide ne retient que les engagements pris au cours de l'exercice budgétaire"
            >
              DATE
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              min={exerciceCourant?.dateDebut?.slice(0, 10)}
              max={exerciceCourant?.dateFin?.slice(0, 10)}
              className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[140px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">MONTANT</span>
            <input
              type="number"
              step="0.01"
              value={mnt}
              onChange={(e) => setMnt(e.target.value)}
              required
              className="border border-border-dark bg-surface px-2 py-1 text-[11px] font-mono text-right w-[140px]"
            />
          </label>
          <button type="submit" className="border border-border-dark bg-surface-alt px-3 py-1 text-[11px] font-bold">
            Enregistrer
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[1080px] border border-border">
          <div className="grid grid-cols-[110px_130px_1fr_170px_120px_120px_120px_150px] gap-2 bg-surface-alt px-3 py-1.5 text-[10px] font-bold border-b border-border">
            <span>NATURE</span>
            <span>RÉFÉRENCE</span>
            <span>OBJET · LIGNE BUDGÉTAIRE</span>
            <span>BÉNÉFICIAIRE</span>
            <span className="text-right">MONTANT</span>
            <span className="text-right">EXÉCUTÉ</span>
            <span className="text-right" title="Ce qui pèse encore sur la colonne Engagement du tableau">
              RESTE À EXÉCUTER
            </span>
            <span className="ecran-seul">ACTIONS</span>
          </div>

          {engagements?.map((e) => (
            <div key={e.id} className="border-b border-border last:border-b-0">
              <div className="grid grid-cols-[110px_130px_1fr_170px_120px_120px_120px_150px] gap-2 px-3 py-1 text-[11px] items-center">
                <span className="text-[10.5px]">
                  {NATURES.find((n) => n.valeur === e.nature)?.libelle ?? e.nature}
                </span>
                <span className="font-mono text-[10.5px]">{e.reference}</span>
                <span className="truncate">
                  {e.objet}
                  <span className="text-text-dim"> · {e.section.code} {e.section.intitule}</span>
                  <span className="text-text-dim"> · {jour(e.date)}</span>
                </span>
                <span className="truncate">{e.beneficiaire}</span>
                <span className="font-mono text-right">{montant(e.montant)}</span>
                <span className="font-mono text-right text-text-dim">{montant(e.montantExecute)}</span>
                <span className={`font-mono text-right ${e.statut === 'CLOS' ? 'text-text-dim line-through' : 'font-semibold'}`}>
                  {montant(e.resteAExecuter)}
                </span>
                <span className="ecran-seul flex gap-1.5 text-[10px]">
                  {peutSaisir && e.statut === 'OUVERT' && (
                    <button
                      type="button"
                      onClick={() => setRattachementPour(rattachementPour === e.id ? null : e.id)}
                      className="border border-border-dark px-1.5 py-0.5"
                    >
                      Rattacher
                    </button>
                  )}
                  {peutSaisir && e.statut === 'OUVERT' && (
                    <button type="button" onClick={() => void onClore(e.id)} className="border border-border-dark px-1.5 py-0.5">
                      Clore
                    </button>
                  )}
                  {peutSaisir && e.statut === 'CLOS' && (
                    <button type="button" onClick={() => void onRouvrir(e.id)} className="border border-border-dark px-1.5 py-0.5">
                      Rouvrir
                    </button>
                  )}
                  {peutSaisir && e.executions.length === 0 && (
                    <button type="button" onClick={() => void onSupprimer(e.id)} className="border border-border-dark px-1.5 py-0.5">
                      Supprimer
                    </button>
                  )}
                </span>
              </div>

              {e.statut === 'CLOS' && e.motifCloture && (
                <div className="px-3 pb-1 text-[10px] text-text-dim">Clos · {e.motifCloture}</div>
              )}

              {e.executions.length > 0 && (
                <div className="px-3 pb-1">
                  {e.executions.map((x) => (
                    <div key={x.id} className="flex items-center gap-2 text-[10px] text-text-dim">
                      <span className="font-mono">
                        {jour(x.ecriture.date)} · pièce {x.ecriture.numeroPiece ?? '·'} · {x.ecriture.libelle}
                      </span>
                      <span className="font-mono">{montant(x.montant)}</span>
                      {peutSaisir && (
                        <button
                          type="button"
                          onClick={() => void onDetacher(e.id, x.id)}
                          className="ecran-seul border border-border px-1"
                        >
                          Détacher
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {rattachementPour === e.id && (
                <form onSubmit={(ev) => void onRattacher(ev, e.id)} className="ecran-seul flex flex-wrap items-end gap-2 bg-surface-alt px-3 py-2">
                  <label className="flex flex-col gap-1">
                    <span
                      className="text-[10px] font-bold text-text-dim"
                      title="Seules les écritures VALIDÉES sont proposées · le tableau d'exécution budgétaire ne lit que le validé"
                    >
                      ÉCRITURE QUI EXÉCUTE
                    </span>
                    <select
                      value={rEcritureId}
                      onChange={(ev) => setREcritureId(ev.target.value)}
                      required
                      className="border border-border-dark bg-surface px-2 py-1 text-[11px] w-[380px]"
                    >
                      <option value="">Choisir une écriture validée…</option>
                      {ecritures.map((ec) => (
                        <option key={ec.id} value={ec.id}>
                          {jour(ec.date)} · pièce {ec.numeroPiece ?? '·'} · {ec.libelle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span
                      className="text-[10px] font-bold text-text-dim"
                      title="Saisi, et non déduit de l'écriture : une facture peut solder deux bons de commande, et une commande être livrée en deux fois"
                    >
                      MONTANT EXÉCUTÉ
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={rMontant}
                      onChange={(ev) => setRMontant(ev.target.value)}
                      required
                      className="border border-border-dark bg-surface px-2 py-1 text-[11px] font-mono text-right w-[140px]"
                    />
                  </label>
                  <button type="submit" className="border border-border-dark bg-surface px-3 py-1 text-[11px] font-bold">
                    Rattacher
                  </button>
                </form>
              )}
            </div>
          ))}

          {engagements?.length === 0 && (
            <div className="px-3 py-2 text-[10.5px] text-text-dim">
              Aucun engagement saisi sur cet exercice. Tant que ce registre est vide, la colonne Engagement du tableau
              d'exécution budgétaire ne porte que les dettes fournisseurs déjà comptabilisées.
            </div>
          )}

          {engagements && engagements.length > 0 && (
            <div className="grid grid-cols-[110px_130px_1fr_170px_120px_120px_120px_150px] gap-2 bg-surface-alt px-3 py-1.5 text-[11px] font-bold border-t border-border">
              <span>TOTAL</span>
              <span />
              <span />
              <span />
              <span />
              <span />
              <span className="font-mono text-right">{montant(totalReste)}</span>
              <span className="ecran-seul" />
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-text-dim max-w-[900px]">
        Ce registre alimente la colonne Engagement (3) du tableau d'exécution budgétaire, pour le RESTE À EXÉCUTER de
        chaque ligne. Un engagement qui n'y est pas saisi ne pèse pas sur le tableau, et un engagement dont la facture
        est arrivée cesse d'y peser dès que l'écriture lui est rattachée.
      </p>
    </div>
  );
}
