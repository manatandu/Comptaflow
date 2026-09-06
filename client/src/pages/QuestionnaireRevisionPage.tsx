import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { Exercice, LigneQuestionnaire, QuestionnaireRevision } from '../lib/types';

/**
 * QUESTIONNAIRE DE RÉVISION PAR CYCLE.
 *
 * L'écran affiche l'ORIGINE de chaque item, et c'est sa garantie centrale :
 * « CPCC » veut dire que le libellé est celui du séminaire, « VMG » qu'il est
 * du cabinet. Les confondre ferait passer une question de l'éditeur pour une
 * exigence, et c'est exactement le défaut que le § 10 bis interdit.
 *
 * Deux chiffres, jamais un seul · le taux de réponse ne compte QUE les
 * questions, les impératifs sont comptés à part. Les mélanger ferait monter un
 * pourcentage que personne ne pourrait plus lire.
 *
 * Et une ligne rouge que rien d'autre ne porte : les EXCEPTIONS, calculées
 * item par item sur la polarité du catalogue. Un questionnaire où tout est
 * « Oui » n'est pas forcément vert · « Y a-t-il un chevauchement avec
 * l'exercice en cours sur le solde d'ouverture ? » est le seul item du CPCC
 * dont le « Oui » est l'anomalie.
 */

const LIBELLE_CYCLE: Record<string, string> = {
  IMMOBILISATIONS: 'Immobilisations',
  STOCKS: 'Stocks',
  CAISSES: 'Caisses',
  BANQUES: 'Banques',
  DETTES_FOURNISSEURS: 'Dettes fournisseurs',
  PROVISIONS: 'Provisions',
  CREANCES: 'Créances',
  VENTES_CLIENTS: 'Ventes et clients',
  ACHATS: 'Achats',
  PAIE_ET_CHARGES_SOCIALES: 'Paie et charges sociales',
  ETAT_ET_COLLECTIVITES: 'État et collectivités publiques',
  CAPITAUX_PROPRES: 'Capitaux propres',
  REGULARISATIONS: 'Régularisations',
  ENGAGEMENTS_HORS_BILAN: 'Engagements hors bilan',
};

const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function QuestionnaireRevisionPage() {
  const [liste, setListe] = useState<QuestionnaireRevision[] | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuestionnaireRevision | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [exerciceId, setExerciceId] = useState('');
  const [cyclesChoisis, setCyclesChoisis] = useState<string[]>([]);
  const [cycleAffiche, setCycleAffiche] = useState<string | null>(null);

  const charger = () =>
    api.get<QuestionnaireRevision[]>('/questionnaire-revision').then(setListe, (e: Error) => setErreur(e.message));

  useEffect(() => {
    charger();
    api.get<Exercice[]>('/exercices').then(setExercices, () => undefined);
  }, []);

  useEffect(() => {
    if (!selectionId) {
      setDetail(null);
      return;
    }
    api
      .get<QuestionnaireRevision>(`/questionnaire-revision/${selectionId}`)
      .then(setDetail, (e: Error) => setErreur(e.message));
  }, [selectionId]);

  const rafraichir = () => {
    charger();
    if (selectionId) {
      api.get<QuestionnaireRevision>(`/questionnaire-revision/${selectionId}`).then(setDetail, () => undefined);
    }
  };

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await action();
      rafraichir();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Opération impossible');
    }
  };

  const creer = () =>
    agir(async () => {
      await api.post('/questionnaire-revision', {
        exerciceId,
        libelle: libelle.trim(),
        cycles: cyclesChoisis,
      });
      setCreation(false);
      setLibelle('');
      setCyclesChoisis([]);
    });

  const repondreFerme = (l: LigneQuestionnaire, reponse: 'OUI' | 'NON' | 'SANS_OBJET') => {
    // L'exception se calcule côté serveur, sur la polarité du catalogue. Le
    // commentaire n'est demandé que lorsque la réponse en ouvre une.
    const polarite = l.polariteException ?? 'NON';
    const seraException = polarite === reponse;
    let commentaire: string | undefined;
    if (seraException) {
      const saisi = window.prompt(
        `${l.code} · cette réponse ouvre une exception.\n\nUne case rouge sans phrase ne dit rien à celui qui reprendra le dossier. Commenter :`,
      );
      if (!saisi?.trim()) return;
      commentaire = saisi.trim();
    }
    agir(() => api.post(`/questionnaire-revision/${detail?.id}/reponses`, { code: l.code, reponse, commentaire }));
  };

  const repondreEcrit = (l: LigneQuestionnaire) => {
    const invite =
      l.forme === 'DONNEE'
        ? `${l.code} · cet item appelle une donnée (une date, un nombre).\n\n${l.libelle}`
        : l.forme === 'TRAVAIL'
          ? `${l.code} · travail à conduire. Indiquer le renvoi au papier de travail.\n\n${l.libelle}`
          : `${l.code} · cet item appelle une description.\n\n${l.libelle}`;
    const saisi = window.prompt(invite, l.reponse?.valeur ?? l.reponse?.renvoiTravaux ?? '');
    if (!saisi?.trim()) return;
    agir(() =>
      api.post(`/questionnaire-revision/${detail?.id}/reponses`, {
        code: l.code,
        ...(l.forme === 'TRAVAIL' ? { renvoiTravaux: saisi.trim() } : { valeur: saisi.trim() }),
      }),
    );
  };

  const s = detail?.synthese;
  const lignes = detail?.lignes ?? [];
  const cyclesPresents = [...new Set(lignes.map((l) => l.cycle))];
  const lignesAffichees = cycleAffiche ? lignes.filter((l) => l.cycle === cycleAffiche) : lignes;

  return (
    <div className="p-2">
      <EnteteImpression titre="Questionnaire de révision" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">CONTRÔLE ET RÉVISION</div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[12px] font-bold leading-tight">Questionnaire de révision</h1>
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90"
          >
            Nouveau questionnaire
          </button>
        </div>
        <div className="text-[10px] text-text-dim mt-0.5">
          Les deux checklists du CPCC (§ VI inventaire physique, § VII inventaire documentaire) reprises mot pour mot,
          et les cycles que le séminaire ne couvre pas, ajoutés par le cabinet. Chaque item porte son origine.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1240px]">
          {erreur}
        </div>
      )}

      {creation && (
        <div className="border border-border bg-surface px-3.5 py-2.5 mb-2.5 max-w-[1240px]">
          <div className="text-[10.5px] font-semibold mb-1.5">Ouvrir un questionnaire</div>
          <div className="flex flex-wrap gap-2 items-end mb-1.5">
            <label className="text-[10px] text-text-dim">
              Exercice
              <select
                value={exerciceId}
                onChange={(e) => setExerciceId(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[10.5px] min-w-[180px]"
              >
                <option value="">Choisir…</option>
                {exercices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {jour(x.dateDebut)} au {jour(x.dateFin)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-text-dim flex-1 min-w-[220px]">
              Libellé
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Révision de clôture 2026"
                className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
              />
            </label>
          </div>
          <div className="text-[10px] text-text-dim mb-1">Cycles · aucun coché = tous</div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {Object.entries(LIBELLE_CYCLE).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setCyclesChoisis((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))
                }
                className={`border rounded-[6px] px-2 py-[2px] text-[10px] ${
                  cyclesChoisis.includes(k) ? 'bg-sel text-white border-sel' : 'border-border'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={creer}
              disabled={!exerciceId || !libelle.trim()}
              className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold disabled:opacity-40"
            >
              Ouvrir
            </button>
            <button
              type="button"
              onClick={() => setCreation(false)}
              className="border border-border rounded-[6px] px-3 py-[3px] text-[10.5px]"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1400px] items-start">
        <div className="border border-border bg-surface min-w-[220px] max-w-[260px]">
          <div className="px-2.5 py-1.5 border-b border-border text-[10px] font-mono text-text-dim">QUESTIONNAIRES</div>
          {liste?.length === 0 && (
            <div className="px-2.5 py-3 text-[10.5px] text-text-dim">
              Aucun questionnaire. Le CPCC ouvre l’inventaire par deux checklists.
            </div>
          )}
          {liste?.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                setSelectionId(q.id);
                setCycleAffiche(null);
              }}
              className={`block w-full text-left px-2.5 py-1.5 border-b border-border/60 ${
                q.id === selectionId ? 'bg-sel-soft' : 'hover:bg-chrome'
              }`}
            >
              <div className="text-[10.5px] font-semibold leading-tight">{q.libelle}</div>
              <div className="text-[9.5px] text-text-dim mt-0.5">
                {q.cycles.length === 0 ? 'Tous les cycles' : `${q.cycles.length} cycle(s)`}
                {q.statut === 'CLOS' && ' · clos'}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {!detail && (
            <div className="border border-border bg-surface px-3.5 py-3 text-[10.5px] text-text-dim">
              Choisir un questionnaire pour le remplir.
            </div>
          )}

          {detail && s && (
            <>
              <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[11px] font-bold">{detail.libelle}</div>
                    <div className="text-[10px] text-text-dim">
                      {s.itemsCpcc} item(s) du CPCC · {s.itemsVmg} du cabinet
                      {detail.statut === 'CLOS' && ` · clos le ${jour(detail.closLe)}`}
                    </div>
                  </div>
                  {detail.statut === 'OUVERT' && (
                    <button
                      type="button"
                      onClick={() => agir(() => api.post(`/questionnaire-revision/${detail.id}/clore`, {}))}
                      className="bg-sel text-white rounded-[6px] px-2.5 py-[3px] text-[10.5px] font-semibold"
                    >
                      Clore
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10.5px] mt-1.5">
                  <span>
                    <span className="text-text-dim">Questions </span>
                    <span className="font-semibold tabular-nums">
                      {s.repondues}/{s.questions}
                    </span>
                    <span className="text-text-dim"> ({s.tauxReponse} %)</span>
                  </span>
                  <span>
                    <span className="text-text-dim">Travaux </span>
                    <span className="font-semibold tabular-nums">
                      {s.travauxFaits}/{s.travaux}
                    </span>
                  </span>
                  <span>
                    <span className="text-text-dim">Exceptions </span>
                    <span className={`font-semibold tabular-nums ${s.exceptions > 0 ? 'text-danger' : ''}`}>
                      {s.exceptions}
                    </span>
                    {s.exceptionsSansCommentaire > 0 && (
                      <span className="text-danger"> dont {s.exceptionsSansCommentaire} sans commentaire</span>
                    )}
                  </span>
                </div>
              </div>

              {cyclesPresents.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setCycleAffiche(null)}
                    className={`border rounded-[6px] px-2 py-[2px] text-[10px] ${
                      cycleAffiche === null ? 'bg-sel text-white border-sel' : 'border-border'
                    }`}
                  >
                    Tous
                  </button>
                  {cyclesPresents.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCycleAffiche(c)}
                      className={`border rounded-[6px] px-2 py-[2px] text-[10px] ${
                        cycleAffiche === c ? 'bg-sel text-white border-sel' : 'border-border'
                      }`}
                    >
                      {LIBELLE_CYCLE[c] ?? c}
                    </button>
                  ))}
                </div>
              )}

              {lignesAffichees.map((l) => (
                <div
                  key={l.code}
                  className={`border px-3.5 py-1.5 mb-1 ${
                    l.reponse?.estException ? 'border-danger/40 bg-danger-soft' : 'border-border bg-surface'
                  } ${l.ouvert ? '' : 'opacity-45'}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-[9.5px] font-mono text-text-dim">
                        {l.code} · {LIBELLE_CYCLE[l.cycle] ?? l.cycle} ·{' '}
                        {l.origine === 'CPCC' ? `CPCC ${l.source ?? ''}` : 'Ajout du cabinet'}
                        {l.polariteException === 'OUI' && ' · « Oui » est l’anomalie'}
                        {!l.ouvert && l.ouvertPar && ` · ouvert si ${l.ouvertPar.code} = ${l.ouvertPar.reponse}`}
                      </div>
                      <div className="text-[10.5px] mt-0.5">{l.libelle}</div>
                      {l.objets && (
                        <div className="text-[9.5px] text-text-dim mt-0.5">
                          À couvrir un par un · {l.objets.join(', ')}
                        </div>
                      )}
                      {l.origine === 'VMG' && l.fondement && (
                        <div className="text-[9.5px] text-text-dim mt-0.5">Fondement · {l.fondement}</div>
                      )}
                      {l.reponse?.valeur && <div className="text-[10px] mt-0.5">{l.reponse.valeur}</div>}
                      {l.reponse?.renvoiTravaux && (
                        <div className="text-[10px] mt-0.5">Renvoi · {l.reponse.renvoiTravaux}</div>
                      )}
                      {l.reponse?.commentaire && (
                        <div className="text-[10px] mt-0.5">Commentaire · {l.reponse.commentaire}</div>
                      )}
                    </div>
                    {detail.statut === 'OUVERT' && l.ouvert && (
                      <div className="flex gap-1 shrink-0">
                        {l.forme === 'OUI_NON' ? (
                          (['OUI', 'NON', 'SANS_OBJET'] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => repondreFerme(l, r)}
                              className={`border rounded-[6px] px-2 py-[2px] text-[10px] ${
                                l.reponse?.reponse === r ? 'bg-sel text-white border-sel' : 'border-border'
                              }`}
                            >
                              {r === 'SANS_OBJET' ? 'N/A' : r === 'OUI' ? 'Oui' : 'Non'}
                            </button>
                          ))
                        ) : (
                          <button
                            type="button"
                            onClick={() => repondreEcrit(l)}
                            className="border border-border rounded-[6px] px-2 py-[2px] text-[10px]"
                          >
                            {l.forme === 'TRAVAIL' ? 'Renvoi' : 'Répondre'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {(detail.motifsRefusCloture ?? []).length > 0 && (
                <div className="border border-warning/30 bg-warning-soft px-3.5 py-2 mt-2 text-[10px]">
                  <div className="font-semibold mb-0.5">Ce questionnaire ne peut pas être clos en l’état</div>
                  {(detail.motifsRefusCloture ?? []).map((m) => (
                    <div key={m} className="mt-0.5">
                      {m}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
