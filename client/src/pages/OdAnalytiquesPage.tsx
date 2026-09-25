import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { Compte, PlanAnalytique, SectionAnalytique } from '../lib/types';

/**
 * SAISIE DES OD ANALYTIQUES · la commande de Sage i7 du même nom.
 *
 * Une OD analytique est « une écriture analytique pure, totalement
 * extra-comptable » qui corrige une ventilation sans toucher la ventilation
 * d'origine (manuel i7). OmegaX la veut ÉQUILIBRÉE : c'est un reclassement
 * entre sections d'un même plan, sur un même compte général (voir
 * src/modules/analytique/od-analytique.ts). Elle entre dans la balance, le
 * grand livre et l'état budgétaire analytiques, jamais au grand livre général.
 */

interface LigneSaisie {
  sectionId: string;
  debit: string;
  credit: string;
}

interface OdServie {
  id: string;
  date: string;
  reference: string | null;
  libelle: string;
  plan: { code: string; intitule: string };
  compte: { numero: string; intitule: string };
  montant: number;
  lignes: Array<{ sectionCode: string; sectionIntitule: string; debit: number; credit: number }>;
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nombre = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.')) || 0;
const ligneVide = (): LigneSaisie => ({ sectionId: '', debit: '', credit: '' });

export function OdAnalytiquesPage() {
  const { peutEcrire } = useAuth();
  const { exerciceCourant } = useExercice();
  const [plans, setPlans] = useState<PlanAnalytique[]>([]);
  const [planId, setPlanId] = useState('');
  const [sections, setSections] = useState<SectionAnalytique[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [ods, setOds] = useState<OdServie[] | null>(null);

  const [compteId, setCompteId] = useState('');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [libelle, setLibelle] = useState('');
  const [lignes, setLignes] = useState<LigneSaisie[]>([ligneVide(), ligneVide()]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    Promise.all([api.get<PlanAnalytique[]>('/analytique/plans'), api.get<Compte[]>('/comptes')])
      .then(([p, c]) => {
        setPlans(p);
        setPlanId((id) => id || p[0]?.id || '');
        setComptes(c);
      })
      .catch(() => setErreur('Impossible de lire les plans analytiques'));
  }, []);

  useEffect(() => {
    if (!planId) return;
    api
      .get<SectionAnalytique[]>(`/analytique/plans/${planId}/sections`)
      .then(setSections)
      .catch(() => setSections([]));
  }, [planId]);

  const charger = useCallback(async () => {
    if (!exerciceCourant) return;
    try {
      setOds(await api.get<OdServie[]>(`/analytique/od?exerciceId=${exerciceCourant.id}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de lire les OD analytiques');
    }
  }, [exerciceCourant]);

  useEffect(() => {
    charger();
  }, [charger]);

  const plan = plans.find((p) => p.id === planId) ?? null;
  // Seuls les comptes Détail des classes que le plan ventile · le serveur
  // refuse les autres, l'écran ne les propose pas.
  const comptesDuPlan = useMemo(() => {
    const classes = (plan?.classesVentilees ?? '').split(',').map((c) => `CLASSE_${c.trim()}`);
    return comptes.filter((c) => c.typeCompte === 'DETAIL' && classes.includes(c.classe));
  }, [comptes, plan]);
  const feuilles = sections.filter((s) => s.type === 'DETAIL');

  const totalDebit = lignes.reduce((t, l) => t + nombre(l.debit), 0);
  const totalCredit = lignes.reduce((t, l) => t + nombre(l.credit), 0);
  const equilibree = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  const majLigne = (i: number, champ: keyof LigneSaisie, v: string) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [champ]: v } : l)));

  const enregistrer = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await api.post('/analytique/od', {
        exerciceId: exerciceCourant.id,
        planId,
        compteId,
        date,
        reference: reference || undefined,
        libelle,
        lignes: lignes
          .filter((l) => l.sectionId)
          .map((l) => ({
            sectionId: l.sectionId,
            ...(nombre(l.debit) ? { debit: nombre(l.debit) } : {}),
            ...(nombre(l.credit) ? { credit: nombre(l.credit) } : {}),
          })),
      });
      setInfo('OD analytique enregistrée · elle apparaît dans les états analytiques.');
      setLignes([ligneVide(), ligneVide()]);
      setReference('');
      setLibelle('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'OD analytique non enregistrée');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    setErreur(null);
    try {
      await api.delete(`/analytique/od/${id}`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'OD analytique non supprimée');
    }
  };

  return (
    <div className="p-3 space-y-3 text-[11.5px]">
      {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
      {info && <div className="text-positive bg-positive-soft border border-positive/30 px-3 py-2">{info}</div>}
      {plans.length === 0 && <p className="text-text-dim">Aucun plan analytique · créez-en un dans Structure.</p>}

      {peutEcrire && plans.length > 0 && (
        <div className="border border-border bg-surface p-3 space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Plan analytique</span>
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 min-w-[220px] flex-1">
              <span className="text-text-dim">Compte général</span>
              <select value={compteId} onChange={(e) => setCompteId(e.target.value)} className="border border-border px-2 py-[3px] bg-surface">
                <option value="">Choisir…</option>
                {comptesDuPlan.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Date</span>
              <input
                type="date"
                value={date}
                min={exerciceCourant?.dateDebut.slice(0, 10)}
                max={exerciceCourant?.dateFin.slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="border border-border px-2 py-[2px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">N° pièce</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} className="w-[110px] border border-border px-2 py-[2px]" />
            </label>
            <label className="flex flex-col gap-0.5 min-w-[200px] flex-1">
              <span className="text-text-dim">Libellé</span>
              <input value={libelle} onChange={(e) => setLibelle(e.target.value)} className="border border-border px-2 py-[2px]" />
            </label>
            <Aide
              titre="OD analytiques"
              texte="Une OD analytique corrige une ventilation sans toucher la comptabilité générale ni la ventilation d'origine. OmegaX la veut équilibrée : ce qui sort d'une section entre dans une autre, sur le même compte, et le total du plan ne bouge pas. Elle apparaît dans la balance, le grand livre et l'état budgétaire analytiques ; le tableau d'exécution budgétaire du SYCEBNL, établi sur la comptabilité, ne la reprend pas et le signale."
              source="Sage 100 i7, manuel de formation, « Saisie des OD analytiques »"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1">Section</th>
                  <th className="text-right px-2 py-1 w-[140px]">Débit</th>
                  <th className="text-right px-2 py-1 w-[140px]">Crédit</th>
                  <th className="w-[28px]" />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1">
                      <select
                        aria-label="Section"
                        value={l.sectionId}
                        onChange={(e) => majLigne(i, 'sectionId', e.target.value)}
                        className="w-full border border-border px-2 py-[2px] bg-surface"
                      >
                        <option value="">Choisir…</option>
                        {feuilles.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code} · {s.intitule}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label="Débit"
                        inputMode="decimal"
                        value={l.debit}
                        onChange={(e) => majLigne(i, 'debit', e.target.value)}
                        className="w-full border border-border px-1.5 py-[1px] text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label="Crédit"
                        inputMode="decimal"
                        value={l.credit}
                        onChange={(e) => majLigne(i, 'credit', e.target.value)}
                        className="w-full border border-border px-1.5 py-[1px] text-right"
                      />
                    </td>
                    <td className="px-1">
                      {lignes.length > 2 && (
                        <button onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))} title="Retirer la ligne">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1">
                    <button onClick={() => setLignes((ls) => [...ls, ligneVide()])} className="text-sel font-normal">
                      + Ajouter une ligne
                    </button>
                  </td>
                  <td className="px-2 py-1 text-right">{fmt(totalDebit)}</td>
                  <td className="px-2 py-1 text-right">{fmt(totalCredit)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <span className={equilibree ? 'text-positive' : 'text-warning'}>
              {equilibree ? 'OD équilibrée' : `Écart ${fmt(totalDebit - totalCredit)}`}
            </span>
            <button
              onClick={enregistrer}
              disabled={envoi || !equilibree || !compteId || !date || !libelle}
              className="ml-auto bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40"
            >
              {envoi ? '…' : "Enregistrer l'OD"}
            </button>
          </div>
        </div>
      )}

      {ods && ods.length === 0 && <p className="text-text-dim">Aucune OD analytique sur cet exercice.</p>}
      {ods && ods.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="text-left px-2 py-1 w-[90px]">Date</th>
                <th className="text-left px-2 py-1 w-[80px]">Plan</th>
                <th className="text-left px-2 py-1">Compte · libellé</th>
                <th className="text-left px-2 py-1">Sections</th>
                <th className="text-right px-2 py-1 w-[120px]">Montant</th>
                <th className="w-[28px]" />
              </tr>
            </thead>
            <tbody>
              {ods.map((o) => (
                <tr key={o.id}>
                  <td className="px-2 py-1">{new Date(o.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-2 py-1">{o.plan.code}</td>
                  <td className="px-2 py-1">
                    {o.compte.numero} · {o.libelle}
                    {o.reference ? <span className="text-text-dim"> · {o.reference}</span> : null}
                  </td>
                  <td className="px-2 py-1 text-text-dim">
                    {o.lignes.map((l) => `${l.sectionCode} ${l.debit ? '+' : '−'}${fmt(l.debit || l.credit)}`).join(' · ')}
                  </td>
                  <td className="px-2 py-1 text-right">{fmt(o.montant)}</td>
                  <td className="px-1">
                    {peutEcrire && (
                      <button onClick={() => supprimer(o.id)} title="Supprimer l'OD">
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
    </div>
  );
}
