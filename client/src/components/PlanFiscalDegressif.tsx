import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Aide } from './chrome/Aide';

interface LignePlan {
  exerciceId: string;
  dateDebut: string;
  dateFin: string;
  valeurResiduelleDebut: number;
  annuiteFiscale: number;
  mode: 'DEGRESSIF' | 'LINEAIRE_ART_35';
  dotationComptable: number | null;
  derogatoire: { dotation: number; reprise: number; excedentAReintegrer: number } | null;
}

interface PlanFiscal {
  degressifFiscal: boolean;
  categorie?: string | null;
  dureeFiscaleAns?: number | null;
  coefficient?: number | null;
  categories: readonly { cle: string; libelle: string }[];
  lignes: LignePlan[];
  cumulDerogatoire: number;
}

const fc = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * DÉGRESSIF FISCAL ET DÉROGATOIRE d'un bien · le plan fiscal (loi n° 23/053,
 * art. 31 à 35) confronté à la dotation comptable, et l'écart passé au
 * 851/151 ou au 151/861 (AUDCIF, fiche du compte 68). Le plan comptable du
 * bien ne change jamais.
 */
export function PlanFiscalDegressif({
  immoId,
  journalId,
  exerciceId,
  peutEcrire,
}: {
  immoId: string;
  journalId: string | undefined;
  exerciceId: string | undefined;
  peutEcrire: boolean;
}) {
  const [plan, setPlan] = useState<PlanFiscal | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [option, setOption] = useState({ categorie: '', dureeFiscaleAns: '', bienNeuf: false });

  const charger = () =>
    api.get<PlanFiscal>(`/immobilisations/${immoId}/plan-fiscal`).then(setPlan, (e: ApiError) => setErreur(e.message));
  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immoId]);

  const agir = async (fn: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await fn();
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Opération refusée');
    }
  };

  const opter = (e: FormEvent) => {
    e.preventDefault();
    agir(() =>
      api.post(`/immobilisations/${immoId}/option-degressif`, {
        categorie: option.categorie,
        bienNeuf: option.bienNeuf,
        dureeFiscaleAns: Number(option.dureeFiscaleAns),
      }),
    );
  };

  if (!plan) return <div className="px-4 py-2 text-[11.5px] text-text-dim">{erreur ?? '…'}</div>;

  return (
    <div className="bg-chrome border-b border-border px-4 py-3 text-[11.5px] space-y-2">
      <div className="font-semibold flex items-center gap-1.5">
        Dégressif fiscal et amortissement dérogatoire
        <Aide
          titre="Dégressif fiscal"
          texte="Option de l'impôt sur les sociétés pour un bien neuf d'une des dix catégories de l'art. 31, d'une durée fiscale de quatre à vingt ans (arrêté n° 013/2025). Annuité = taux linéaire × coefficient (1,5 pour quatre ans, 2 pour cinq et six ans, 2,5 au-delà), au prorata du mois de mise en service la première année, puis sur la valeur résiduelle, avec bascule en linéaire (art. 35). Le plan comptable du bien reste au 68 ; l'écart se passe au 851 contre 151, ou se reprend au 861. Un excédent comptable au-delà du 151 n'est pas du dérogatoire : il se réintègre (art. 28). Avant la sortie du bien, le solde du 151 se reprend."
          source="Loi n° 23/053, art. 28 et 31 à 35 · AUDCIF, Titre VII, fiche du compte 68 · Titre VIII ch. 18 § 4.5.1.3"
        />
      </div>
      {erreur && <div className="text-danger">{erreur}</div>}

      {!plan.degressifFiscal && peutEcrire && (
        <form onSubmit={opter} className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Catégorie de l'art. 31"
            value={option.categorie}
            onChange={(e) => setOption({ ...option, categorie: e.target.value })}
            className="border border-border px-1.5 py-0.5 max-w-[420px]"
          >
            <option value="">Catégorie de l’art. 31…</option>
            {plan.categories.map((c) => (
              <option key={c.cle} value={c.cle}>
                {c.libelle}
              </option>
            ))}
          </select>
          <input
            aria-label="Durée fiscale (années)"
            placeholder="Durée fiscale (ans)"
            value={option.dureeFiscaleAns}
            onChange={(e) => setOption({ ...option, dureeFiscaleAns: e.target.value })}
            className="border border-border px-1.5 py-0.5 w-[130px]"
          />
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={option.bienNeuf} onChange={(e) => setOption({ ...option, bienNeuf: e.target.checked })} />
            Bien neuf
          </label>
          <button type="submit" className="bg-sel text-white font-semibold px-3 py-1">
            Opter pour le dégressif
          </button>
        </form>
      )}
      {!plan.degressifFiscal && !peutEcrire && <div className="text-text-dim">Aucune option dégressive.</div>}

      {plan.degressifFiscal && (
        <>
          <div>
            Durée fiscale {plan.dureeFiscaleAns} ans · coefficient {plan.coefficient} · dérogatoire au 151 :{' '}
            <strong>{fc(plan.cumulDerogatoire)}</strong>
            {peutEcrire && plan.cumulDerogatoire > 0 && journalId && exerciceId && (
              <button
                type="button"
                className="ml-3 text-sel hover:underline"
                onClick={() =>
                  window.confirm('Reprendre tout le dérogatoire de ce bien (D/151, C/861) sur l’exercice courant, avant sa sortie ?') &&
                  agir(() => api.post(`/immobilisations/${immoId}/derogatoire/solde`, { exerciceId, journalId }))
                }
              >
                Reprendre le solde avant la sortie
              </button>
            )}
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left px-2 py-1">Exercice</th>
                <th className="text-right px-2 py-1">Valeur résiduelle</th>
                <th className="text-right px-2 py-1">Annuité fiscale</th>
                <th className="text-right px-2 py-1">Dotation comptable</th>
                <th className="text-right px-2 py-1">Dérogatoire</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {plan.lignes.map((l) => (
                <tr key={l.exerciceId}>
                  <td className="px-2 py-1">
                    {new Date(l.dateFin).getUTCFullYear()}
                    {l.mode === 'LINEAIRE_ART_35' && <span className="text-text-dim"> · linéaire (art. 35)</span>}
                  </td>
                  <td className="px-2 py-1 text-right">{fc(l.valeurResiduelleDebut)}</td>
                  <td className="px-2 py-1 text-right">{fc(l.annuiteFiscale)}</td>
                  <td className="px-2 py-1 text-right">{l.dotationComptable === null ? '·' : fc(l.dotationComptable)}</td>
                  <td className="px-2 py-1 text-right">
                    {l.derogatoire
                      ? l.derogatoire.dotation > 0
                        ? `+${fc(l.derogatoire.dotation)}`
                        : l.derogatoire.reprise > 0
                          ? `-${fc(l.derogatoire.reprise)}`
                          : '0,00'
                      : ''}
                    {l.derogatoire && l.derogatoire.excedentAReintegrer > 0 && (
                      <div className="text-warning">à réintégrer {fc(l.derogatoire.excedentAReintegrer)}</div>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {peutEcrire && !l.derogatoire && l.dotationComptable !== null && journalId && (
                      <button
                        type="button"
                        className="text-sel hover:underline"
                        onClick={() => agir(() => api.post(`/immobilisations/${immoId}/derogatoire`, { exerciceId: l.exerciceId, journalId }))}
                      >
                        Passer le dérogatoire
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
