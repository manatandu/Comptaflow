import { useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * ÉTATS CONSOLIDÉS · tranches 3a et 3b, sous le cumul. Bilan et compte de
 * résultat au modèle du D4C (ch. XII-8 § 2 et § 3), tableau des flux (§ 4),
 * variation des capitaux propres (§ 5) et note du périmètre (§ 6).
 *
 * Le tableau des flux REFUSÉ n'est pas un tableau vide · il rend ses motifs
 * (une entité sans mouvements, un périmètre qui a bougé) à la place des
 * lignes. Des lignes à zéro se liraient comme un groupe sans trésorerie.
 *
 * L'écran ne calcule rien et le dit à trois endroits. Un montant NON CALCULÉ
 * s'affiche comme tel, jamais comme un zéro · les écarts de conversion d'un
 * groupe ne valent pas zéro parce qu'OmegaX ne les calcule pas encore, et des
 * impôts différés INCOMPLETS le disent sur leur ligne. Une ligne À
 * RETRAITER est montrée et comptée, pour que le bilan boucle et que rien ne
 * disparaisse, mais l'état porte alors la mention « non publiable » avec ses
 * motifs. Et une colonne N-1 vide dit pourquoi elle l'est.
 */
type Ligne = {
  cle: string;
  libelle: string;
  nature: 'POSTE' | 'DETAIL' | 'TOTAL' | 'A_RETRAITER';
  brut?: number | null;
  amortissement?: number | null;
  net: number | null;
  netN1?: number | null;
  lecture?: string;
  reserve?: string;
};
type Methode = 'IG' | 'IP' | 'ME' | 'NC';
type ColonneCp = 'capital' | 'primes' | 'reserves' | 'resultat' | 'conversion' | 'reevaluation' | 'groupe' | 'minoritaires' | 'total';
const COLONNES_CP: [ColonneCp, string][] = [
  ['capital', 'Capital'],
  ['primes', 'Primes'],
  ['reserves', 'Réserves consolidées'],
  ['resultat', 'Résultat'],
  ['conversion', 'Écarts de conversion'],
  ['reevaluation', 'Écarts de réévaluation'],
  ['groupe', 'Part du groupe'],
  ['minoritaires', 'Minoritaires'],
  ['total', 'Total'],
];
type Etats = {
  bilan: { actif: Ligne[]; passif: Ligne[] };
  compteDeResultat: Ligne[];
  controles: { cle: string; libelle: string; ecart: number; ok: boolean }[];
  publiable: boolean;
  motifsNonPubliable: string[];
  comparatif: { disponible: boolean; motif: string | null };
  tableauDesFlux: {
    lignes: Ligne[] | null;
    obstacles: string[];
    controle: { tresorerieParLesFlux: number; tresorerieParLeBilan: number; ecart: number; ok: boolean } | null;
  };
  variationCapitauxPropres: {
    lignes: { cle: string; libelle: string; montants: Record<ColonneCp, number | null>; lecture?: string }[];
    reserves: string[];
  } | null;
  notePerimetre: {
    lignes: {
      denomination: string;
      estConsolidante: boolean;
      secteurActivite: string | null;
      pctControleN: number;
      pctControleN1: number | null;
      methodeN: Methode;
      methodeN1: Methode | null;
      pctInteretN: number;
      pctInteretN1: number | null;
      entree: boolean;
    }[];
    sorties: string[];
    justifications: { denomination: string; fondement: string; aJustifier: string[]; exclusion: { libelle: string; justification: string } | null }[];
    comparatifDisponible: boolean;
  };
  avertissements: string[];
  reserves: string[];
};

const fc = (v: number | null | undefined) =>
  v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number | null) => (v == null ? '' : v.toFixed(2));
const classeLigne = (l: Ligne) =>
  l.nature === 'TOTAL' ? 'font-bold border-t border-border' : l.nature === 'A_RETRAITER' ? 'text-warning' : l.nature === 'DETAIL' ? 'text-text-dim' : '';

function Montant({ v, n1 }: { v: number | null | undefined; n1?: boolean }) {
  if (v === null) return <span className="text-text-dim italic">{n1 ? '' : 'non calculé'}</span>;
  return <>{fc(v)}</>;
}

function Libelle({ l }: { l: Ligne }) {
  return (
    <td className={`py-0.5 pr-2 ${l.nature === 'DETAIL' ? 'pl-3' : ''}`} title={[l.lecture, l.reserve].filter(Boolean).join(' · ') || undefined}>
      {l.libelle}
      {l.reserve && <div className="text-[11px] text-text-dim">{l.reserve}</div>}
    </td>
  );
}

export function EtatsConsolidesVue({ exerciceId }: { exerciceId: string }) {
  const [etats, setEtats] = useState<Etats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function produire() {
    setErreur(null);
    setChargement(true);
    try {
      setEtats(await api.get<Etats>(`/consolidation/etats?exerciceId=${exerciceId}`));
    } catch (e) {
      setEtats(null);
      setErreur(e instanceof ApiError ? e.message : 'Les états consolidés n’ont pas pu être produits.');
    } finally {
      setChargement(false);
    }
  }

  const n1 = etats?.comparatif.disponible ?? false;
  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
      <div className="flex flex-wrap gap-2 items-center mb-2">
        <button className="border border-border px-2.5 py-1 text-[12px]" disabled={chargement} onClick={() => void produire()}>
          {chargement ? 'Production…' : 'Produire les états consolidés'}
        </button>
      </div>
      {erreur && <p className="text-[12px] text-danger mb-2">{erreur}</p>}
      {etats && (
        <>
          <div className={`text-[12px] mb-2 border px-2 py-1.5 ${etats.publiable ? 'border-border' : 'border-warning'}`}>
            <strong>{etats.publiable ? 'Publiable.' : 'Non publiable en l’état.'}</strong>
            <ul className="list-disc pl-5">
              {etats.motifsNonPubliable.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          {!etats.comparatif.disponible && etats.comparatif.motif && (
            <p className="text-[12px] text-text-dim mb-2">Colonne N-1 vide · {etats.comparatif.motif}</p>
          )}
          {etats.controles.some((c) => !c.ok) && (
            <ul className="text-[12px] text-danger mb-2">
              {etats.controles
                .filter((c) => !c.ok)
                .map((c) => (
                  <li key={c.cle}>
                    {c.libelle} · écart {fc(c.ecart)}
                  </li>
                ))}
            </ul>
          )}

          <h3 className="text-[12.5px] font-bold mt-2 mb-1">Bilan consolidé · actif</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Actif</th>
                  <th className="py-1 pr-2 text-right">Brut</th>
                  <th className="py-1 pr-2 text-right">Amort. et dépréc.</th>
                  <th className="py-1 pr-2 text-right">Net N</th>
                  <th className="py-1 text-right">Net N-1</th>
                </tr>
              </thead>
              <tbody>
                {etats.bilan.actif.map((l) => (
                  <tr key={l.cle} className={`align-top ${classeLigne(l)}`}>
                    <Libelle l={l} />
                    <td className="py-0.5 pr-2 text-right">{l.net === null ? '' : fc(l.brut)}</td>
                    <td className="py-0.5 pr-2 text-right">{l.net === null ? '' : fc(l.amortissement)}</td>
                    <td className="py-0.5 pr-2 text-right"><Montant v={l.net} /></td>
                    <td className="py-0.5 text-right">{n1 ? <Montant v={l.netN1} n1 /> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-[12.5px] font-bold mt-3 mb-1">Bilan consolidé · passif</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Passif</th>
                  <th className="py-1 pr-2 text-right">Net N</th>
                  <th className="py-1 text-right">Net N-1</th>
                </tr>
              </thead>
              <tbody>
                {etats.bilan.passif.map((l) => (
                  <tr key={l.cle} className={`align-top ${classeLigne(l)}`}>
                    <Libelle l={l} />
                    <td className="py-0.5 pr-2 text-right"><Montant v={l.net} /></td>
                    <td className="py-0.5 text-right">{n1 ? <Montant v={l.netN1} n1 /> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-[12.5px] font-bold mt-3 mb-1">Compte de résultat consolidé · charges en négatif</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Libellé</th>
                  <th className="py-1 pr-2 text-right">N</th>
                  <th className="py-1 text-right">N-1</th>
                </tr>
              </thead>
              <tbody>
                {etats.compteDeResultat.map((l) => (
                  <tr key={l.cle} className={`align-top ${classeLigne(l)}`}>
                    <Libelle l={l} />
                    <td className="py-0.5 pr-2 text-right"><Montant v={l.net} /></td>
                    <td className="py-0.5 text-right">{n1 ? <Montant v={l.netN1} n1 /> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-[12.5px] font-bold mt-3 mb-1">Tableau des flux de trésorerie consolidé</h3>
          {etats.tableauDesFlux.lignes === null ? (
            <div className="text-[12px] border border-warning px-2 py-1.5">
              <strong>Tableau non établi.</strong>
              <ul className="list-disc pl-5">
                {etats.tableauDesFlux.obstacles.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {etats.tableauDesFlux.controle && !etats.tableauDesFlux.controle.ok && (
                <p className="text-[12px] text-danger mb-1">
                  La trésorerie de clôture par les flux ({fc(etats.tableauDesFlux.controle.tresorerieParLesFlux)}) ne rejoint pas celle du
                  bilan ({fc(etats.tableauDesFlux.controle.tresorerieParLeBilan)}) · écart {fc(etats.tableauDesFlux.controle.ecart)}.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <th className="py-1 pr-2">Libellé</th>
                      <th className="py-1 text-right">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etats.tableauDesFlux.lignes.map((l) => (
                      <tr key={l.cle} className={`align-top ${classeLigne(l)}`}>
                        <Libelle l={l} />
                        <td className="py-0.5 text-right"><Montant v={l.net} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3 className="text-[12.5px] font-bold mt-3 mb-1">Variation des capitaux propres consolidés · exercice N</h3>
          {etats.variationCapitauxPropres === null ? (
            <p className="text-[12px] text-text-dim">Non établie · elle part des capitaux propres consolidés de clôture N-1, que seule la consolidation de l’exercice précédent donne.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <th className="py-1 pr-2">Libellé</th>
                      {COLONNES_CP.map(([k, t]) => (
                        <th key={k} className="py-1 pr-2 text-right">{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {etats.variationCapitauxPropres.lignes.map((l) => (
                      <tr key={l.cle} className={`align-top ${l.cle.startsWith('CLOTURE') ? 'font-bold border-t border-border' : ''}`}>
                        <td className="py-0.5 pr-2" title={l.lecture}>{l.libelle}</td>
                        {COLONNES_CP.map(([k]) => (
                          <td key={k} className="py-0.5 pr-2 text-right"><Montant v={l.montants[k]} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {etats.variationCapitauxPropres.reserves.length > 0 && (
                <ul className="text-[11px] text-text-dim mt-1 list-disc pl-5 leading-[1.6]">
                  {etats.variationCapitauxPropres.reserves.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </>
          )}

          <h3 className="text-[12.5px] font-bold mt-3 mb-1">Note annexe · informations sur le périmètre</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Dénomination</th>
                  <th className="py-1 pr-2">Secteur d’activité</th>
                  <th className="py-1 pr-2 text-right">% contrôle N</th>
                  <th className="py-1 pr-2 text-right">N-1</th>
                  <th className="py-1 pr-2">Méthode N</th>
                  <th className="py-1 pr-2">N-1</th>
                  <th className="py-1 pr-2 text-right">% intérêt N</th>
                  <th className="py-1 text-right">N-1</th>
                </tr>
              </thead>
              <tbody>
                {etats.notePerimetre.lignes.map((l) => (
                  <tr key={l.denomination} className="border-b border-border/60">
                    <td className="py-0.5 pr-2">
                      {l.denomination}
                      {l.estConsolidante && <span className="text-text-dim"> (consolidante)</span>}
                      {l.entree && <span className="text-text-dim"> · entrée</span>}
                    </td>
                    <td className="py-0.5 pr-2">{l.secteurActivite ?? <span className="text-text-dim italic">à déclarer</span>}</td>
                    <td className="py-0.5 pr-2 text-right">{pct(l.pctControleN)}</td>
                    <td className="py-0.5 pr-2 text-right">{pct(l.pctControleN1)}</td>
                    <td className="py-0.5 pr-2">{l.methodeN}</td>
                    <td className="py-0.5 pr-2">{l.methodeN1 ?? ''}</td>
                    <td className="py-0.5 pr-2 text-right">{pct(l.pctInteretN)}</td>
                    <td className="py-0.5 text-right">{pct(l.pctInteretN1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {etats.notePerimetre.sorties.length > 0 && (
            <p className="text-[12px] mt-1">Sorties du périmètre depuis N-1 · {etats.notePerimetre.sorties.join(', ')}.</p>
          )}
          <div className="text-[12px] mt-2">
            {etats.notePerimetre.justifications.map((j) => (
              <div key={j.denomination} className="mb-1">
                <strong>{j.denomination}</strong> · {j.fondement}
                {j.exclusion && (
                  <div>
                    Exclusion · {j.exclusion.libelle} · {j.exclusion.justification}
                  </div>
                )}
                {j.aJustifier.map((a) => (
                  <div key={a} className="text-warning">{a}</div>
                ))}
              </div>
            ))}
          </div>

          {(etats.avertissements.length > 0 || etats.reserves.length > 0) && (
            <ul className="text-[11px] text-text-dim mt-2 list-disc pl-5 leading-[1.6]">
              {[...etats.avertissements, ...etats.reserves].map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
