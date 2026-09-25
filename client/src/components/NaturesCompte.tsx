import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';
import { fourchettesEnTexte, texteEnFourchettes } from '../lib/natures-compte';

/**
 * NATURES DE COMPTE (point 14, comptes/natures-compte.ts côté serveur) · Sage,
 * « Paramètres société / comptes généraux / nature de compte ». Une fourchette
 * de racines par nature, et les défauts qu'elle donne aux comptes créés
 * ensuite. Les comptes dont le report à-nouveau contredit leur nature sont
 * listés, et s'alignent à la demande · jamais d'office.
 */

type Mode = 'AUCUN' | 'SOLDE' | 'DETAIL';
interface Nature {
  nature: string;
  libelle: string;
  fourchettes: { du: string; au: string }[];
  modeReportANouveau: Mode;
  lettrable: boolean;
}
interface Incoherence {
  id: string;
  numero: string;
  intitule: string;
  modeReportANouveau: Mode;
  modeAttendu: Mode;
}
interface Reponse {
  natures: Nature[];
  incoherences: Incoherence[];
}

const LIBELLE_MODE: Record<Mode, string> = { AUCUN: 'Aucun', SOLDE: 'Solde', DETAIL: 'Détail' };

export function NaturesCompte() {
  // Le paramétrage est réservé à l'administrateur, comme le plan comptable.
  const { estAdmin } = useAuth();
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const appliquer = (r: Reponse) => {
    setDonnees(r);
    setSaisies(Object.fromEntries(r.natures.map((n) => [n.nature, fourchettesEnTexte(n.fourchettes)])));
  };

  useEffect(() => {
    api.get<Reponse>('/natures-compte').then(appliquer, (e) => setErreur(e.message));
  }, []);

  const modifier = async (nature: string, corps: Record<string, unknown>) => {
    setErreur(null);
    setInfo(null);
    try {
      appliquer(await api.patch<Reponse>(`/natures-compte/${nature}`, corps));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Modification impossible');
    }
  };

  const aligner = async () => {
    setErreur(null);
    try {
      const r = await api.post<Reponse & { alignes: number }>('/natures-compte/aligner', {});
      appliquer(r);
      setInfo(`${r.alignes} compte(s) aligné(s) sur le mode de report de leur nature.`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Alignement impossible');
    }
  };

  if (!donnees) return <div className="text-[11.5px] text-text-dim p-3">{erreur ?? 'Chargement…'}</div>;

  return (
    <div className="p-3 space-y-3 text-[11.5px]">
      <div className="flex items-center gap-1.5 font-semibold">
        Natures de compte
        <Aide
          titre="Natures de compte"
          texte="Chaque nature couvre une ou plusieurs fourchettes de racines (« 40 », « 311-315 »). Un compte créé dans une fourchette reçoit le mode de report à-nouveau et le lettrage de sa nature ; il reste modifiable. Les états financiers ne lisent pas ce paramétrage, ils lisent les numéros du plan officiel."
          source="Sage 100 i7, Paramètres société · nature de compte"
        />
      </div>
      {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
      {info && <div className="text-positive bg-positive-soft border border-positive/30 px-3 py-2">{info}</div>}
      <table className="w-full max-w-[640px]">
        <thead>
          <tr>
            <th className="text-left px-2 py-1">Nature</th>
            <th className="text-left px-2 py-1">Fourchettes</th>
            <th className="text-left px-2 py-1">Report à-nouveau</th>
            <th className="text-left px-2 py-1">Lettrable</th>
          </tr>
        </thead>
        <tbody>
          {donnees.natures.map((n) => (
            <tr key={n.nature}>
              <td className="px-2 py-1">{n.libelle}</td>
              <td className="px-2 py-1">
                <input
                  aria-label={`Fourchettes ${n.libelle}`}
                  value={saisies[n.nature] ?? ''}
                  disabled={!estAdmin}
                  onChange={(e) => setSaisies((s) => ({ ...s, [n.nature]: e.target.value }))}
                  onBlur={() => {
                    if ((saisies[n.nature] ?? '') !== fourchettesEnTexte(n.fourchettes)) {
                      void modifier(n.nature, { fourchettes: texteEnFourchettes(saisies[n.nature] ?? '') });
                    }
                  }}
                  className="border border-border px-2 py-[2px] w-[160px]"
                />
              </td>
              <td className="px-2 py-1">
                <select
                  value={n.modeReportANouveau}
                  disabled={!estAdmin}
                  onChange={(e) => void modifier(n.nature, { modeReportANouveau: e.target.value })}
                  className="border border-border px-2 py-[2px] bg-surface"
                >
                  {(Object.keys(LIBELLE_MODE) as Mode[]).map((m) => (
                    <option key={m} value={m}>
                      {LIBELLE_MODE[m]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1">
                <input
                  type="checkbox"
                  aria-label={`Lettrable ${n.libelle}`}
                  checked={n.lettrable}
                  disabled={!estAdmin}
                  onChange={(e) => void modifier(n.nature, { lettrable: e.target.checked })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-1.5 font-semibold pt-2">
        Comptes dont le report contredit leur nature
        <Aide
          titre="Cohérence du report à-nouveau"
          texte="Sage confronte à la clôture le code de report de chaque compte à celui de sa nature. OmegaX liste les écarts ; « Aligner » donne à ces comptes le mode de leur nature. Seuls les à-nouveaux à venir en dépendent : aucune écriture passée ne bouge."
          source="Sage 100 i7, fin d'exercice · incohérence du code report à nouveau"
        />
      </div>
      {donnees.incoherences.length === 0 ? (
        <div className="text-text-dim">Aucun écart.</div>
      ) : (
        <>
          <table className="w-full max-w-[640px]">
            <thead>
              <tr>
                <th className="text-left px-2 py-1">Compte</th>
                <th className="text-left px-2 py-1">Intitulé</th>
                <th className="text-left px-2 py-1">Report actuel</th>
                <th className="text-left px-2 py-1">Report de la nature</th>
              </tr>
            </thead>
            <tbody>
              {donnees.incoherences.map((c) => (
                <tr key={c.id}>
                  <td className="px-2 py-1">{c.numero}</td>
                  <td className="px-2 py-1">{c.intitule}</td>
                  <td className="px-2 py-1">{LIBELLE_MODE[c.modeReportANouveau]}</td>
                  <td className="px-2 py-1">{LIBELLE_MODE[c.modeAttendu]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {estAdmin && (
            <button onClick={aligner} className="bg-sel text-white font-semibold px-4 py-1.5">
              Aligner sur leur nature
            </button>
          )}
        </>
      )}
    </div>
  );
}
