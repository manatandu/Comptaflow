import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { AnalyseImport, RapportImport, TypeImport } from '../lib/types';

/**
 * IMPORT · Fichier → Importer chez Sage. Aucun des manuels du Drive ne décrit
 * l'import paramétrable : cet écran est conçu à partir de ce qu'une
 * association congolaise a réellement en main quand elle arrive sur OmegaX,
 * c'est-à-dire un tableur ou l'export d'un logiciel précédent.
 *
 * Trois partis pris, expliqués dans ImportService :
 *  1. la correspondance des colonnes est PROPOSÉE, jamais imposée ;
 *  2. tout ce qui est importé atterrit dans le BROUILLARD, où on le relit
 *     avant qu'il n'entre au livre-journal ;
 *  3. une balance s'importe comme une ÉCRITURE D'À-NOUVEAU équilibrée, pas
 *     comme des soldes posés d'autorité sur les comptes.
 */

const TYPES: { valeur: TypeImport; titre: string; description: string }[] = [
  {
    valeur: 'PLAN_COMPTES',
    titre: 'Plan de comptes',
    description:
      'Ajoute au plan du dossier les comptes absents. La classe SYCEBNL se déduit du premier chiffre du numéro.',
  },
  {
    valeur: 'BALANCE',
    titre: 'Balance de reprise',
    description:
      "Crée une écriture d'à-nouveau équilibrée, datée de l'ouverture de l'exercice. Un déséquilibre arrête l'import.",
  },
  {
    valeur: 'ECRITURES',
    titre: 'Écritures',
    description:
      'Regroupe les lignes en pièces par date, journal et numéro de pièce. Chaque pièce doit être équilibrée.',
  },
];

function montant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ImportPage() {
  const { exerciceCourant } = useExercice();
  const [type, setType] = useState<TypeImport>('BALANCE');
  const [nomFichier, setNomFichier] = useState('');
  const [contenuBase64, setContenuBase64] = useState('');
  const [analyse, setAnalyse] = useState<AnalyseImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [creerComptesManquants, setCreerComptesManquants] = useState(false);
  const [rapport, setRapport] = useState<RapportImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const choisirFichier = async (fichier: File) => {
    setErreur(null);
    setAnalyse(null);
    setRapport(null);
    const tampon = await fichier.arrayBuffer();
    // btoa ne prend qu'une chaîne binaire : on convertit par tranches pour ne
    // pas dépasser la limite d'arguments de String.fromCharCode sur un gros
    // fichier.
    const octets = new Uint8Array(tampon);
    let binaire = '';
    for (let i = 0; i < octets.length; i += 8192) {
      binaire += String.fromCharCode(...octets.subarray(i, i + 8192));
    }
    setNomFichier(fichier.name);
    setContenuBase64(btoa(binaire));
  };

  const analyser = async () => {
    if (!contenuBase64) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<AnalyseImport>('/import/analyser', { type, nomFichier, contenuBase64 });
      setAnalyse(r);
      setMapping(
        Object.fromEntries(Object.entries(r.mappingPropose).filter(([, v]) => v).map(([k, v]) => [k, v as string])),
      );
      setRapport(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Analyse impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const executer = async (simulation: boolean) => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<RapportImport>('/import/executer', {
        type,
        nomFichier,
        contenuBase64,
        mapping,
        exerciceId: exerciceCourant?.id,
        creerComptesManquants,
        simulation,
      });
      setRapport(r);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Import impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const champsManquants = (analyse?.champs ?? []).filter((c) => c.obligatoire && !mapping[c.cle]);

  return (
    <div className="p-2">
      <div className="mb-2.5">
        <div className="text-[10px] font-mono text-text-dim leading-none">FICHIER</div>
        <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
          Importer des données
          <Aide sujet="import" />
        </h1>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-2.5 items-start">
        <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
            1. Que voulez-vous importer ?
          </header>
          <div className="p-3 flex flex-col gap-2">
            {TYPES.map((t) => (
              <label
                key={t.valeur}
                className={`flex items-start gap-2.5 rounded-[8px] border p-2.5 cursor-pointer transition-colors ${
                  type === t.valeur ? 'border-sel bg-sel-soft' : 'border-border hover:border-sel/50'
                }`}
              >
                <input
                  type="radio"
                  name="typeImport"
                  className="mt-0.5"
                  checked={type === t.valeur}
                  onChange={() => {
                    setType(t.valeur);
                    setAnalyse(null);
                    setRapport(null);
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{t.titre}</span>
                  <span className="block text-[11.5px] text-text-dim leading-[1.5] mt-0.5">{t.description}</span>
                </span>
              </label>
            ))}

            <div className="border-t border-border pt-3 mt-1">
              <div className="text-[11.5px] font-bold mb-2">2. Le fichier</div>
              <input
                type="file"
                accept=".csv,.txt,.xlsx"
                onChange={(e) => e.target.files?.[0] && choisirFichier(e.target.files[0])}
                className="w-full text-[12px] file:mr-3 file:border-0 file:bg-chrome-alt file:px-3 file:py-1.5 file:text-[12px] file:rounded-[6px] file:cursor-pointer"
              />
              <p className="text-[10.5px] text-text-dim mt-1.5 leading-[1.5]">
                CSV (point-virgule ou virgule, détecté automatiquement) ou classeur .xlsx. Les montants au format
                francophone sont lus tels quels : espaces de milliers, virgule décimale, parenthèses pour le négatif.
              </p>
              {nomFichier && (
                <button
                  onClick={analyser}
                  disabled={envoi}
                  className="mt-2.5 w-full bg-sel text-white text-[12.5px] font-bold py-2 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  {envoi ? 'Lecture…' : 'Analyser le fichier'}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
            3. Correspondance des colonnes
          </header>
          {!analyse ? (
            <p className="p-3 text-[12px] text-text-dim leading-[1.55]">
              Choisissez un fichier et lancez l'analyse. OmegaX proposera une correspondance entre ses colonnes et les
              champs attendus, que vous pourrez corriger avant d'importer quoi que ce soit.
            </p>
          ) : (
            <div className="p-3 flex flex-col gap-3">
              <div className="text-[11.5px] text-text-dim">
                {analyse.nombreLignes} ligne(s), {analyse.colonnes.length} colonne(s)
                {analyse.separateur && ` · séparateur « ${analyse.separateur === '\t' ? 'tabulation' : analyse.separateur} »`}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {analyse.champs.map((c) => (
                  <label key={c.cle} className="text-[11.5px] font-semibold text-text-dim">
                    {c.libelle}
                    {c.obligatoire && <span className="text-danger"> *</span>}
                    <select
                      value={mapping[c.cle] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [c.cle]: e.target.value }))}
                      className={`mt-1 w-full border rounded-[6px] px-2 py-1.5 text-[12px] font-normal ${
                        c.obligatoire && !mapping[c.cle] ? 'border-danger' : 'border-border'
                      }`}
                    >
                      <option value="">(aucune)</option>
                      {analyse.colonnes.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {type !== 'PLAN_COMPTES' && (
                <label className="flex items-start gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={creerComptesManquants}
                    onChange={(e) => setCreerComptesManquants(e.target.checked)}
                  />
                  <span>
                    Créer les comptes absents du plan
                    <span className="block text-[11px] text-text-dim">
                      Décoché, un compte inconnu remonte comme anomalie. C'est le réglage prudent : un fichier dont la
                      moitié des comptes est inconnue révèle un problème de correspondance qu'il vaut mieux voir.
                    </span>
                  </span>
                </label>
              )}

              <div className="border border-border rounded-[6px] overflow-hidden">
                <div className="px-2.5 py-1.5 bg-chrome-alt text-[10px] font-bold text-text-dim">
                  APERÇU DES PREMIÈRES LIGNES
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-chrome">
                        {analyse.colonnes.map((c) => (
                          <th key={c} className="px-2 py-1 text-left font-bold whitespace-nowrap border-b border-border">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analyse.apercu.map((ligne, i) => (
                        <tr key={i} className="border-b border-border/40">
                          {analyse.colonnes.map((_, j) => (
                            <td key={j} className="px-2 py-0.5 whitespace-nowrap font-mono">
                              {ligne[j] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {champsManquants.length > 0 && (
                <div className="text-[11.5px] text-danger">
                  Champs obligatoires sans colonne : {champsManquants.map((c) => c.libelle).join(', ')}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => executer(true)}
                  disabled={envoi || champsManquants.length > 0}
                  className="flex-1 border border-border rounded-[6px] bg-surface text-[12.5px] font-semibold py-2 hover:bg-chrome-alt disabled:opacity-50"
                >
                  Simuler (rien n'est écrit)
                </button>
                <button
                  onClick={() => executer(false)}
                  disabled={envoi || champsManquants.length > 0}
                  className="flex-1 bg-sel text-white text-[12.5px] font-bold py-2 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  {envoi ? 'Import…' : 'Importer'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {rapport && (
        <section className="mt-2.5 bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <header
            className={`px-3 py-2 border-b border-border text-[11.5px] font-bold ${
              rapport.anomalies.length > 0 ? 'bg-warning-soft text-warning' : 'bg-positive-soft text-positive'
            }`}
          >
            {rapport.simulation ? 'Simulation' : 'Import exécuté'} · {rapport.lignesLues} ligne(s) lue(s)
            {rapport.anomalies.length > 0 && ` · ${rapport.anomalies.length} anomalie(s)`}
          </header>
          <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            {[
              ['Comptes créés', rapport.comptesCrees],
              ['Écritures créées', rapport.ecrituresCreees],
              ["Lignes d'écriture", rapport.lignesEcritureCreees],
            ].map(([libelle, valeur]) => (
              <div key={libelle as string}>
                <div className="text-text-dim text-[10.5px]">{libelle}</div>
                <div className="text-[16px] font-bold font-mono">{valeur as number}</div>
              </div>
            ))}
            <div>
              <div className="text-text-dim text-[10.5px]">Débit / crédit</div>
              <div className="text-[13px] font-bold font-mono">
                {montant(rapport.totalDebit)} / {montant(rapport.totalCredit)}
              </div>
            </div>
          </div>

          {rapport.anomalies.length > 0 && (
            <div className="border-t border-border">
              <div className="px-3 py-1.5 bg-chrome text-[10.5px] font-bold text-text-dim">ANOMALIES</div>
              <div className="max-h-[280px] overflow-y-auto">
                {rapport.anomalies.map((a, i) => (
                  <div key={i} className="px-3 py-1 text-[11.5px] border-b border-border/40 flex gap-3">
                    <span className="font-mono text-text-dim w-[70px] shrink-0">
                      {a.ligne > 0 ? `ligne ${a.ligne}` : 'fichier'}
                    </span>
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!rapport.simulation && rapport.ecrituresCreees > 0 && (
            <p className="px-3 py-2 border-t border-border text-[11.5px] text-text-dim leading-[1.55]">
              Les écritures importées sont dans le <strong>brouillard</strong> : relisez-les dans État → Brouillard,
              corrigez ce qui doit l'être, puis validez-les pour qu'elles entrent au livre-journal.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
