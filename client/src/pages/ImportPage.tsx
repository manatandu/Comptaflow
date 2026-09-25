import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
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
      'Ajoute au plan du dossier les comptes absents. La classe se déduit du premier chiffre du numéro, dans les deux plans.',
  },
  {
    valeur: 'BALANCE',
    titre: "Bilan d'ouverture · balance de reprise",
    description:
      "C'est ainsi qu'entre dans le logiciel un dossier qui existait avant lui : une écriture d'à-nouveau équilibrée, datée de l'ouverture de l'exercice, qui se range dans la colonne « solde d'ouverture » de la balance. Un déséquilibre arrête l'import.",
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
  const { estAdmin } = useAuth();
  const { exerciceCourant } = useExercice();
  const [type, setType] = useState<TypeImport>('BALANCE');
  const [nomFichier, setNomFichier] = useState('');
  const [contenuBase64, setContenuBase64] = useState('');
  const [analyse, setAnalyse] = useState<AnalyseImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [creerComptesManquants, setCreerComptesManquants] = useState(false);
  // Défaut : la balance importée est le bilan d'ouverture · le cas de très
  // loin le plus fréquent, et le seul qui justifie d'ouvrir cette fenêtre
  // plutôt que de saisir une pièce.
  const [bilanDOuverture, setBilanDOuverture] = useState(true);
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
        bilanDOuverture,
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
      <div className="mb-1.5 flex items-center justify-end">
        <Aide sujet="import" />
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11.5px] text-danger bg-danger-soft border border-danger/30 rounded-[3px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}

      {/* Analyse et exécution sont réservées à l'administrateur
          (@Roles ADMIN_CABINET) · le menu masque déjà l'entrée, ceci couvre
          l'adresse saisie à la main. */}
      {!estAdmin ? (
        <p className="text-[11.5px] text-text-dim">Réservé aux administrateurs du dossier.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-2.5 items-start">
            <section className="bg-surface border border-border rounded-[4px] shadow-posee overflow-hidden">
              <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                1. Que voulez-vous importer ?
              </header>
              <div className="p-3 flex flex-col gap-2">
                {TYPES.map((t) => (
                  <label
                    key={t.valeur}
                    className={`flex items-start gap-2.5 rounded-[4px] border p-2.5 cursor-pointer transition-colors ${
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
                      <span className="block text-[12px] font-semibold">{t.titre}</span>
                      <span className="block text-[11.5px] text-text-dim leading-[1.5] mt-0.5">{t.description}</span>
                    </span>
                  </label>
                ))}

                <div className="border-t border-border pt-3 mt-1">
                  <div className="text-[11.5px] font-bold mb-2 flex items-center gap-1.5">
                    2. Le fichier
                    <Aide
                      titre="Format du fichier"
                      texte="CSV (point-virgule ou virgule, détecté automatiquement) ou classeur .xlsx. Les montants au format francophone sont lus tels quels : espaces de milliers, virgule décimale, parenthèses pour le négatif."
                      source="Importer des données"
                    />
                  </div>
                  <input
                    type="file"
                    accept=".csv,.txt,.xlsx"
                    onChange={(e) => e.target.files?.[0] && choisirFichier(e.target.files[0])}
                    className="w-full text-[11.5px] file:mr-3 file:border-0 file:bg-chrome-alt file:px-3 file:py-1.5 file:text-[11.5px] file:rounded-[3px] file:cursor-pointer"
                  />
                  {nomFichier && (
                    <button
                      onClick={analyser}
                      disabled={envoi}
                      className="mt-2.5 w-full bg-sel text-white text-[11.5px] font-bold py-2 rounded-[3px] hover:brightness-110 disabled:opacity-50"
                    >
                      {envoi ? 'Lecture…' : 'Analyser le fichier'}
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="bg-surface border border-border rounded-[4px] shadow-posee overflow-hidden">
              <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                3. Correspondance des colonnes
              </header>
              {!analyse ? (
                <p className="p-3 text-[11.5px] text-text-dim">Aucun fichier analysé.</p>
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
                          className={`mt-1 w-full border rounded-[3px] px-2 py-1.5 text-[11.5px] font-normal ${
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

                  {type === 'BALANCE' && (
                    <label className="flex items-start gap-2 text-[11.5px]">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={bilanDOuverture}
                        onChange={(e) => setBilanDOuverture(e.target.checked)}
                      />
                      <span className="flex items-center gap-1.5">
                        Bilan d'ouverture
                        <Aide
                          titre="Bilan d'ouverture"
                          texte="Coché, l'écriture est un à-nouveau : elle alimente la colonne « solde d'ouverture » de la balance et reste hors des mouvements de l'exercice. Elle ne peut alors porter que des comptes de bilan · un bilan d'ouverture correspond au bilan de clôture précédent, où les classes 6, 7 et 8 ont déjà été soldées sur le résultat. Décochez pour une reprise en cours d'exercice, où les charges et les produits déjà courus sont légitimes."
                          source="AUDCIF art. 34"
                        />
                      </span>
                    </label>
                  )}

                  {type !== 'PLAN_COMPTES' && (
                    <label className="flex items-start gap-2 text-[11.5px]">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={creerComptesManquants}
                        onChange={(e) => setCreerComptesManquants(e.target.checked)}
                      />
                      <span className="flex items-center gap-1.5">
                        Créer les comptes absents du plan
                        <Aide
                          titre="Comptes absents du plan"
                          texte="Décoché, un compte inconnu remonte comme anomalie. C'est le réglage prudent : un fichier dont la moitié des comptes est inconnue révèle un problème de correspondance qu'il vaut mieux voir."
                          source="Importer des données"
                        />
                      </span>
                    </label>
                  )}

                  <div className="border border-border rounded-[3px] overflow-hidden">
                    <div className="px-2.5 py-1.5 bg-chrome-alt text-[11px] font-bold text-text-dim">
                      Aperçu des premières lignes
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11.5px]">
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
                      className="flex-1 border border-border rounded-[3px] bg-surface text-[11.5px] font-semibold py-2 hover:bg-chrome-alt disabled:opacity-50"
                    >
                      Simuler (rien n'est écrit)
                    </button>
                    <button
                      onClick={() => executer(false)}
                      disabled={envoi || champsManquants.length > 0}
                      className="flex-1 bg-sel text-white text-[11.5px] font-bold py-2 rounded-[3px] hover:brightness-110 disabled:opacity-50"
                    >
                      {envoi ? 'Import…' : 'Importer'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          {rapport && (
            <section className="mt-2.5 bg-surface border border-border rounded-[4px] shadow-posee overflow-hidden">
              <header
                className={`px-3 py-2 border-b border-border text-[11.5px] font-bold ${
                  rapport.anomalies.length > 0 ? 'bg-warning-soft text-warning' : 'bg-positive-soft text-positive'
                }`}
              >
                {rapport.simulation ? 'Simulation' : 'Import exécuté'} · {rapport.lignesLues} ligne(s) lue(s)
                {rapport.anomalies.length > 0 && ` · ${rapport.anomalies.length} anomalie(s)`}
              </header>
              <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11.5px]">
                {[
                  ['Comptes créés', rapport.comptesCrees],
                  ['Écritures créées', rapport.ecrituresCreees],
                  ["Lignes d'écriture", rapport.lignesEcritureCreees],
                ].map(([libelle, valeur]) => (
                  <div key={libelle as string}>
                    <div className="text-text-dim text-[11px]">{libelle}</div>
                    <div className="text-[13px] font-bold font-mono">{valeur as number}</div>
                  </div>
                ))}
                <div>
                  <div className="text-text-dim text-[11px]">Débit / crédit</div>
                  <div className="text-[12px] font-bold font-mono">
                    {montant(rapport.totalDebit)} / {montant(rapport.totalCredit)}
                  </div>
                </div>
              </div>

              {rapport.anomalies.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-3 py-1.5 bg-chrome text-[11px] font-bold text-text-dim">Anomalies</div>
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
                <p className="px-3 py-2 border-t border-border text-[11.5px] text-text-dim">
                  Écritures importées au <strong>brouillard</strong> · à valider pour entrer au livre-journal.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
