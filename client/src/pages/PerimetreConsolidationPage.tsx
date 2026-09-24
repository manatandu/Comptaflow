import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { CumulConsolidation, EntiteCumul, LienCumul } from './CumulConsolidation';
import { EtatsConsolidesVue } from './EtatsConsolidesVue';

/**
 * PÉRIMÈTRE DE CONSOLIDATION · tranche 1 de la consolidation SYSCOHADA (AUDCIF
 * Titre II, art. 74 à 98, et D4C ch. XII). L'écran ne calcule rien : il saisit
 * ce que le cabinet sait (les entités, les participations, les faits hors des
 * livres) et affiche ce que le serveur en tire. Les montants se consolident
 * dans `CumulConsolidation`, sous le périmètre (tranche 2), et les états
 * consolidés se produisent dans `EtatsConsolidesVue`, sous le cumul (tranche 3a).
 *
 * DEUX POURCENTAGES PAR PARTICIPATION, JAMAIS UN · les droits de vote font le
 * CONTRÔLE, le capital fait l'INTÉRÊT (D4C, ch. XII-5 § 3). Un seul champ ferait
 * servir l'un pour l'autre dès qu'il existe des actions sans droit de vote ou à
 * vote double.
 */
type Entite = {
  id: string;
  nom: string;
  designationMajoriteDeuxExercices: boolean;
  aucunAutreAssocieSuperieur: boolean;
  controleContractuel: boolean;
  accordControleConjoint: boolean;
  influenceNotableDeclaree: boolean;
  motifExclusion: string | null;
  justificationExclusion: string | null;
  dateCloture: string | null;
  secteurActivite: string | null;
};
type Lien = { id: string; detentriceId: string | null; detenueId: string; pctDroitsVote: number; pctCapital: number };
type Resultat = {
  id: string;
  nom: string;
  estConsolidante: boolean;
  pctControle: number;
  pctInteret: number;
  methode: 'IG' | 'IP' | 'ME' | 'NC' | 'EXCLUE';
  fondement: string;
  aJustifierEnNotes: string[];
  dateCloture: { verdict: string; message: string } | null;
};
type Faits = {
  sousControleEntiteOhadaConsolidante: boolean;
  siegesDansDeuxRegions: boolean;
  appelPublicEpargne: boolean;
  demandeAssociesDixieme: boolean;
  chiffreAffairesN: number | null;
  chiffreAffairesN1: number | null;
  seuilEquivalentFc: number | null;
  sourceSeuil: string | null;
};
type Etat = {
  consolidante: { id: string; nom: string };
  entites: (Entite & EntiteCumul)[];
  liens: (Lien & LienCumul)[];
  reciproques: Parameters<typeof CumulConsolidation>[0]['reciproques'];
  resultatsInternes: Parameters<typeof CumulConsolidation>[0]['resultatsInternes'];
  faits: Faits | null;
  resultats: Resultat[];
  obligation: { obligation: string; motifs: string[]; normesIfrsRequises: boolean };
  motifsExclusion: Record<string, string>;
};

const LIBELLE_METHODE: Record<Resultat['methode'], string> = {
  IG: 'Intégration globale',
  IP: 'Intégration proportionnelle',
  ME: 'Mise en équivalence',
  NC: 'Non consolidée',
  EXCLUE: 'Exclue (art. 96)',
};

const LIBELLE_OBLIGATION: Record<string, string> = {
  OBLIGATOIRE: 'Comptes consolidés obligatoires',
  DISPENSEE: 'Dispensée',
  NON_REQUISE: 'Non requise',
  A_EXAMINER: 'À examiner',
};

const FAITS_ENTITE: { cle: keyof Entite; libelle: string }[] = [
  { cle: 'designationMajoriteDeuxExercices', libelle: 'A désigné la majorité des organes pendant deux exercices successifs (art. 78)' },
  { cle: 'aucunAutreAssocieSuperieur', libelle: 'Aucun autre associé ne détenait une fraction supérieure (art. 78)' },
  { cle: 'controleContractuel', libelle: 'Influence dominante par contrat ou clauses statutaires (art. 78)' },
  { cle: 'accordControleConjoint', libelle: 'Accord contractuel de contrôle conjoint (art. 78)' },
  { cle: 'influenceNotableDeclaree', libelle: 'Influence notable par d’autres éléments que les droits de vote (art. 78)' },
];

const champ = 'w-full border border-border px-1.5 py-1 text-[12px]';

export function PerimetreConsolidationPage() {
  const { peutEcrire } = useAuth();
  const { exerciceCourant } = useExercice();
  const exerciceId = exerciceCourant?.id;
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [dateCloture, setDateCloture] = useState('');
  const [detentrice, setDetentrice] = useState('');
  const [detenue, setDetenue] = useState('');
  const [vote, setVote] = useState('');
  const [capital, setCapital] = useState('');

  const recharger = useCallback(async () => {
    if (!exerciceId) return;
    try {
      setEtat(await api.get<Etat>(`/consolidation/perimetre?exerciceId=${exerciceId}`));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le périmètre n’a pas pu être lu.');
    }
  }, [exerciceId]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  async function agir(action: () => Promise<unknown>) {
    setErreur(null);
    try {
      await action();
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'opération n'a pas abouti.");
    }
  }

  if (!exerciceId) return <p className="p-2 text-[12px] text-text-dim">Aucun exercice sélectionné.</p>;
  if (!etat) return <p className="p-2 text-[12px] text-text-dim">{erreur ?? 'Chargement…'}</p>;

  const nomDe = (id: string | null) => (id === null ? etat.consolidante.nom : (etat.entites.find((e) => e.id === id)?.nom ?? '?'));
  const faits: Faits = etat.faits ?? {
    sousControleEntiteOhadaConsolidante: false,
    siegesDansDeuxRegions: false,
    appelPublicEpargne: false,
    demandeAssociesDixieme: false,
    chiffreAffairesN: null,
    chiffreAffairesN1: null,
    seuilEquivalentFc: null,
    sourceSeuil: null,
  };
  const enregistrerFaits = (modif: Partial<Faits>) => agir(() => api.put('/consolidation/faits', { exerciceId, ...modif }));
  const nombre = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  return (
    <div className="p-2 max-w-[1100px]">
      <p className="text-[12px] text-text-dim mb-2.5 leading-[1.6]">
        Le périmètre de consolidation de <strong>{etat.consolidante.nom}</strong>, entité consolidante, pour
        l’exercice {exerciceCourant?.dateFin?.slice(0, 4)} · AUDCIF art. 74 à 98. OmegaX calcule les pourcentages de
        contrôle et d’intérêt et en déduit la méthode (art. 80). Les faits qui ne sont dans aucun livre se{' '}
        <strong>déclarent</strong> : la désignation des organes, les accords, l’influence notable, les motifs
        d’exclusion. Les montants se consolident plus bas, une fois les balances importées et les acquisitions déclarées.
      </p>

      {erreur && <p className="text-[12px] text-danger mb-2">{erreur}</p>}

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">
          Obligation de consolider · {LIBELLE_OBLIGATION[etat.obligation.obligation] ?? etat.obligation.obligation}
        </h2>
        <ul className="text-[12px] list-disc pl-5 leading-[1.6]">
          {etat.obligation.motifs.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        {peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {(
              [
                ['sousControleEntiteOhadaConsolidante', 'Sous le contrôle d’une entité OHADA qui consolide (art. 77)'],
                ['siegesDansDeuxRegions', 'Sièges dans deux régions différentes de l’espace OHADA (art. 77)'],
                ['appelPublicEpargne', 'Appel public à l’épargne ou titres cotés (art. 75 et 77)'],
                ['demandeAssociesDixieme', 'Consolidation demandée par des associés détenant au moins le dixième (art. 77)'],
              ] as [keyof Faits, string][]
            ).map(([cle, libelle]) => (
              <label key={cle} className="text-[12px] flex gap-1.5 items-start">
                <input type="checkbox" checked={faits[cle] === true} onChange={(e) => void enregistrerFaits({ [cle]: e.target.checked })} />
                <span>{libelle}</span>
              </label>
            ))}
            <label className="text-[12px]">
              Chiffre d’affaires HT de l’ensemble, exercice N (FC)
              <input className={champ} defaultValue={faits.chiffreAffairesN ?? ''} onBlur={(e) => void enregistrerFaits({ chiffreAffairesN: nombre(e.target.value) })} />
            </label>
            <label className="text-[12px]">
              Chiffre d’affaires HT de l’ensemble, exercice N-1 (FC)
              <input className={champ} defaultValue={faits.chiffreAffairesN1 ?? ''} onBlur={(e) => void enregistrerFaits({ chiffreAffairesN1: nombre(e.target.value) })} />
            </label>
            <label className="text-[12px]">
              Source de l’équivalent (texte, cours, date)
              <input className={champ} defaultValue={faits.sourceSeuil ?? ''} onBlur={(e) => void enregistrerFaits({ sourceSeuil: e.target.value || null })} />
            </label>
            <label className="text-[12px]">
              Équivalent en FC de 500 000 000 FCFA (art. 95)
              <input className={champ} defaultValue={faits.seuilEquivalentFc ?? ''} onBlur={(e) => void enregistrerFaits({ seuilEquivalentFc: nombre(e.target.value) })} />
            </label>
          </div>
        )}
        <p className="text-[11px] text-text-dim mt-2 leading-[1.6]">
          Le seuil de l’art. 95 est écrit en francs CFA, « ou l’équivalent dans l’unité monétaire ayant cours légal ».
          Aucune source lue ne fixe cet équivalent en francs congolais · il se déclare avec sa source, et sans lui la
          dispense n’est pas examinée.
        </p>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Périmètre calculé</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Entité</th>
                <th className="py-1 pr-2 text-right">% contrôle</th>
                <th className="py-1 pr-2 text-right">% intérêt</th>
                <th className="py-1 pr-2">Méthode</th>
                <th className="py-1">Fondement et notes</th>
              </tr>
            </thead>
            <tbody>
              {etat.resultats.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="py-1 pr-2">
                    {r.nom}
                    {r.estConsolidante && <span className="text-text-dim"> (consolidante)</span>}
                  </td>
                  <td className="py-1 pr-2 text-right">{r.pctControle.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right">{r.pctInteret.toFixed(2)}</td>
                  <td className="py-1 pr-2">{LIBELLE_METHODE[r.methode]}</td>
                  <td className="py-1">
                    {r.fondement}
                    {r.dateCloture && r.dateCloture.verdict !== 'MEME_DATE' && <div className="text-text-dim">{r.dateCloture.message}</div>}
                    {r.aJustifierEnNotes.map((j) => (
                      <div key={j} className="text-warning">{j}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Entités</h2>
        {peutEcrire && (
          <div className="flex flex-wrap gap-2 items-end mb-2">
            <label className="text-[12px]">
              Nom
              <input className={champ} value={nom} onChange={(e) => setNom(e.target.value)} />
            </label>
            <label className="text-[12px]">
              Date de clôture (art. 97)
              <input type="date" className={champ} value={dateCloture} onChange={(e) => setDateCloture(e.target.value)} />
            </label>
            <button
              className="border border-border px-2.5 py-1 text-[12px]"
              disabled={!nom.trim()}
              onClick={() =>
                void agir(async () => {
                  await api.post('/consolidation/entites', { exerciceId, nom, dateCloture: dateCloture || null });
                  setNom('');
                  setDateCloture('');
                })
              }
            >
              Ajouter
            </button>
          </div>
        )}
        {etat.entites.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucune entité saisie.</p>
        ) : (
          etat.entites.map((e) => (
            <details key={e.id} className="border-b border-border/60 py-1">
              <summary className="text-[12px] cursor-pointer">
                {e.nom}
                {e.motifExclusion && <span className="text-text-dim"> · exclue</span>}
              </summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 py-1.5">
                {FAITS_ENTITE.map((f) => (
                  <label key={f.cle} className="text-[12px] flex gap-1.5 items-start">
                    <input
                      type="checkbox"
                      disabled={!peutEcrire}
                      checked={e[f.cle] === true}
                      onChange={(ev) => void agir(() => api.patch(`/consolidation/entites/${e.id}`, { [f.cle]: ev.target.checked }))}
                    />
                    <span>{f.libelle}</span>
                  </label>
                ))}
                <label className="text-[12px]">
                  Motif d’exclusion (art. 96)
                  <select
                    className={champ}
                    disabled={!peutEcrire}
                    defaultValue={e.motifExclusion ?? ''}
                    id={`motif-${e.id}`}
                  >
                    <option value="">Aucune exclusion</option>
                    {Object.entries(etat.motifsExclusion).map(([cle, libelle]) => (
                      <option key={cle} value={cle}>
                        {libelle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[12px]">
                  Secteur d’activité (note du périmètre)
                  <input
                    className={champ}
                    disabled={!peutEcrire}
                    defaultValue={e.secteurActivite ?? ''}
                    onBlur={(ev) => {
                      const v = ev.target.value.trim() || null;
                      if (v !== (e.secteurActivite ?? null)) void agir(() => api.patch(`/consolidation/entites/${e.id}`, { secteurActivite: v }));
                    }}
                  />
                </label>
                <label className="text-[12px]">
                  Justification reprise en Notes annexes
                  <input className={champ} disabled={!peutEcrire} defaultValue={e.justificationExclusion ?? ''} id={`justif-${e.id}`} />
                </label>
              </div>
              {peutEcrire && (
                <div className="flex gap-2 pb-1">
                  <button
                    className="border border-border px-2.5 py-1 text-[12px]"
                    onClick={() => {
                      const motif = (document.getElementById(`motif-${e.id}`) as HTMLSelectElement).value || null;
                      const justif = (document.getElementById(`justif-${e.id}`) as HTMLInputElement).value || null;
                      void agir(() => api.patch(`/consolidation/entites/${e.id}`, { motifExclusion: motif, justificationExclusion: justif }));
                    }}
                  >
                    Enregistrer l’exclusion
                  </button>
                  <button
                    className="border border-border px-2.5 py-1 text-[12px]"
                    onClick={() => void agir(() => api.delete(`/consolidation/entites/${e.id}`))}
                  >
                    Retirer l’entité
                  </button>
                </div>
              )}
            </details>
          ))
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Participations</h2>
        {peutEcrire && etat.entites.length > 0 && (
          <div className="flex flex-wrap gap-2 items-end mb-2">
            <label className="text-[12px]">
              Détentrice
              <select className={champ} value={detentrice} onChange={(e) => setDetentrice(e.target.value)}>
                <option value="">{etat.consolidante.nom} (consolidante)</option>
                {etat.entites.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]">
              Détenue
              <select className={champ} value={detenue} onChange={(e) => setDetenue(e.target.value)}>
                <option value="">Choisir</option>
                {etat.entites.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]">
              % droits de vote
              <input className={champ} value={vote} onChange={(e) => setVote(e.target.value)} />
            </label>
            <label className="text-[12px]">
              % capital
              <input className={champ} value={capital} onChange={(e) => setCapital(e.target.value)} />
            </label>
            <button
              className="border border-border px-2.5 py-1 text-[12px]"
              disabled={!detenue || vote === '' || capital === ''}
              onClick={() =>
                void agir(async () => {
                  await api.post('/consolidation/liens', {
                    exerciceId,
                    detentriceId: detentrice || null,
                    detenueId: detenue,
                    pctDroitsVote: Number(vote.replace(',', '.')),
                    pctCapital: Number(capital.replace(',', '.')),
                  });
                  setVote('');
                  setCapital('');
                })
              }
            >
              Ajouter
            </button>
          </div>
        )}
        {etat.liens.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucune participation saisie.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Détentrice</th>
                <th className="py-1 pr-2">Détenue</th>
                <th className="py-1 pr-2 text-right">% vote</th>
                <th className="py-1 pr-2 text-right">% capital</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {etat.liens.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-1 pr-2">{nomDe(l.detentriceId)}</td>
                  <td className="py-1 pr-2">{nomDe(l.detenueId)}</td>
                  <td className="py-1 pr-2 text-right">{l.pctDroitsVote.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right">{l.pctCapital.toFixed(2)}</td>
                  <td className="py-1 text-right">
                    {peutEcrire && (
                      <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/consolidation/liens/${l.id}`))}>
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-text-dim mt-2 leading-[1.6]">
          Les droits de vote font le pourcentage de <strong>contrôle</strong>, le capital le pourcentage d’
          <strong>intérêt</strong> (D4C, ch. XII-5 § 3). Le contrôle indirect ne passe que par une entité contrôlée
          exclusivement ; l’intérêt ne remonte que par des entités retenues dans le périmètre. Les titres d’autocontrôle
          (une filiale qui détient la consolidante) sont ignorés et ne se saisissent pas.
        </p>
      </section>

      <h2 className="text-[13px] font-bold mt-4 mb-2">Cumul et éliminations</h2>
      <CumulConsolidation
        exerciceId={exerciceId}
        consolidante={etat.consolidante}
        entites={etat.entites}
        liens={etat.liens}
        reciproques={etat.reciproques}
        resultatsInternes={etat.resultatsInternes}
        peutEcrire={peutEcrire}
        recharger={recharger}
      />

      <h2 className="text-[13px] font-bold mt-4 mb-2">États consolidés</h2>
      <EtatsConsolidesVue exerciceId={exerciceId} />
    </div>
  );
}
