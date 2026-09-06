import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { Exercice, FaiblesseControleInterne, RegistreFaiblesses } from '../lib/types';

/**
 * REGISTRE DES FAIBLESSES DU CONTRÔLE INTERNE · ISA 265.
 *
 * « Faire le suivi des faiblesses relevées lors de l'audit précédent » · le
 * CPCC pose la phrase et s'arrête là. L'écran en fait deux registres, parce
 * que le cabinet occupe deux places distinctes : il constate sur son propre
 * travail de tenue (révision interne), ou il range une lettre reçue d'un
 * réviseur (porte-documents). Dans le second cas il ne requalifie rien.
 *
 * DEUX CHIFFRES SONT MIS EN AVANT, et aucun autre écran ne les porte :
 *  · les significatives JAMAIS SORTIES PAR ÉCRIT (§ 9, « shall communicate in
 *    writing ») ;
 *  · les significatives NON REMÉDIÉES ET NON ENCORE REPORTÉES (§ A17), dont le
 *    silence de l'exercice suivant serait la faute.
 */

const LIBELLE_ORIGINE: Record<string, string> = {
  REVISION_INTERNE: 'Révision interne du cabinet',
  RECOMMANDATION_EXTERNE: 'Recommandation reçue d’un tiers',
};

const LIBELLE_QUALIFICATION: Record<string, string> = {
  SIGNIFICATIVE: 'Significative',
  AUTRE: 'Autre faiblesse',
  NON_QUALIFIEE: 'Non qualifiée',
};

const LIBELLE_STATUT: Record<string, string> = {
  OUVERTE: 'Ouverte',
  EN_COURS_DE_REMEDIATION: 'En cours de remédiation',
  REMEDIEE: 'Remédiée',
  NON_REMEDIEE_ASSUMEE: 'Non remédiée, assumée',
  SANS_OBJET: 'Sans objet',
};

const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function FaiblessesPage() {
  const [registres, setRegistres] = useState<RegistreFaiblesses[] | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RegistreFaiblesses | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [creation, setCreation] = useState(false);
  const [origine, setOrigine] = useState('REVISION_INTERNE');
  const [libelle, setLibelle] = useState('');
  const [exerciceId, setExerciceId] = useState('');
  const [emetteur, setEmetteur] = useState('');
  const [dateLettre, setDateLettre] = useState('');
  const [referenceLettre, setReferenceLettre] = useState('');

  const [ajout, setAjout] = useState(false);
  const [reference, setReference] = useState('');
  const [intitule, setIntitule] = useState('');
  const [description, setDescription] = useState('');
  const [effetPotentiel, setEffetPotentiel] = useState('');
  const [recommandation, setRecommandation] = useState('');
  const [qualificationLettre, setQualificationLettre] = useState('NON_QUALIFIEE');

  const charger = () =>
    api.get<RegistreFaiblesses[]>('/faiblesses').then(setRegistres, (e: Error) => setErreur(e.message));

  useEffect(() => {
    charger();
    api.get<Exercice[]>('/exercices').then(setExercices, () => undefined);
  }, []);

  useEffect(() => {
    if (!selectionId) {
      setDetail(null);
      return;
    }
    api.get<RegistreFaiblesses>(`/faiblesses/${selectionId}`).then(setDetail, (e: Error) => setErreur(e.message));
  }, [selectionId]);

  const rafraichir = () => {
    charger();
    if (selectionId) api.get<RegistreFaiblesses>(`/faiblesses/${selectionId}`).then(setDetail, () => undefined);
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

  const externe = origine === 'RECOMMANDATION_EXTERNE';
  const detailExterne = detail?.origine === 'RECOMMANDATION_EXTERNE';

  const creer = () =>
    agir(async () => {
      await api.post('/faiblesses', {
        exerciceId,
        origine,
        libelle: libelle.trim(),
        ...(externe
          ? { emetteur: emetteur.trim(), dateLettre, referenceLettre: referenceLettre.trim() || undefined }
          : {}),
      });
      setCreation(false);
      setLibelle('');
      setEmetteur('');
      setDateLettre('');
      setReferenceLettre('');
    });

  const ajouter = () =>
    agir(async () => {
      await api.post(`/faiblesses/${selectionId}/faiblesses`, {
        reference: reference.trim(),
        intitule: intitule.trim(),
        description: description.trim(),
        effetPotentiel: effetPotentiel.trim(),
        recommandation: recommandation.trim() || undefined,
        ...(detailExterne && qualificationLettre !== 'NON_QUALIFIEE' ? { qualification: qualificationLettre } : {}),
      });
      setAjout(false);
      setReference('');
      setIntitule('');
      setDescription('');
      setEffetPotentiel('');
      setRecommandation('');
    });

  const qualifier = (f: FaiblesseControleInterne, qualification: 'SIGNIFICATIVE' | 'AUTRE') => {
    const justification = window.prompt(
      `Qualifier ${f.reference} en « ${LIBELLE_QUALIFICATION[qualification]} ».\n\n` +
        'ISA 265 § 8 · la détermination se fait « on the basis of the audit work performed ». Écrire le jugement :',
    );
    if (!justification?.trim()) return;
    agir(() =>
      api.patch(`/faiblesses/faiblesses/${f.id}/qualification`, { qualification, justification: justification.trim() }),
    );
  };

  const communiquer = (f: FaiblesseControleInterne) => {
    const destinataire = window.prompt(
      f.qualification === 'SIGNIFICATIVE'
        ? 'ISA 265 § 9 · la communication écrite va aux organes de gouvernance. À qui ?'
        : 'ISA 265 § 10 b) · les autres faiblesses vont à la direction. À qui ?',
    );
    if (!destinataire?.trim()) return;
    agir(() =>
      api.patch(`/faiblesses/faiblesses/${f.id}/communication`, {
        communiqueeLe: new Date().toISOString(),
        communiqueeA: destinataire.trim(),
      }),
    );
  };

  const marquerRemediee = (f: FaiblesseControleInterne) => {
    const verificationCabinet = window.prompt(
      'ISA 265 § A28 · dire si le cabinet a vérifié, ou non, que la remédiation a bien été mise en œuvre.\n\n' +
        '« Non vérifiée par le cabinet, déclaration de la direction » est une réponse recevable ; le silence n’en est pas une.',
    );
    if (!verificationCabinet?.trim()) return;
    agir(() =>
      api.patch(`/faiblesses/faiblesses/${f.id}/suivi`, {
        statut: 'REMEDIEE',
        verificationCabinet: verificationCabinet.trim(),
      }),
    );
  };

  const escalader = (f: FaiblesseControleInterne) => {
    const motif = window.prompt(
      'ISA 265 § A24 · « the failure of management to remedy other deficiencies […] MAY BECOME a significant deficiency ».\n\n' +
        '« May », et cela « depends on the auditor’s judgment ». Écrire le jugement :',
    );
    if (!motif?.trim()) return;
    agir(() => api.post(`/faiblesses/faiblesses/${f.id}/escalade`, { motif: motif.trim() }));
  };

  const reporter = (f: FaiblesseControleInterne) => {
    const cibles = (registres ?? []).filter((r) => r.id !== detail?.id && r.statut === 'OUVERT');
    if (cibles.length === 0) {
      setErreur('Aucun registre ouvert sur un autre exercice · en ouvrir un avant de reporter.');
      return;
    }
    const choix = window.prompt(
      'Reporter vers quel registre ?\n\n' + cibles.map((r, i) => `${i + 1}. ${r.libelle}`).join('\n'),
    );
    const index = Number(choix) - 1;
    const cible = cibles[index];
    if (!cible) return;
    let communicationReconduite: string | undefined;
    if (f.qualification === 'SIGNIFICATIVE' && f.statut !== 'REMEDIEE' && f.statut !== 'SANS_OBJET') {
      const texte = window.prompt(
        'ISA 265 § A17 · une significative non remédiée se REPÈTE ou se RÉFÉRENCE, elle ne se reporte pas en silence.\n\n' +
          'Répéter la description, ou citer la communication antérieure :',
      );
      if (!texte?.trim()) return;
      communicationReconduite = texte.trim();
    }
    agir(() =>
      api.post(`/faiblesses/faiblesses/${f.id}/report`, { registreCibleId: cible.id, communicationReconduite }),
    );
  };

  const s = detail?.synthese;

  return (
    <div className="p-2">
      <EnteteImpression titre="Registre des faiblesses du contrôle interne" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">CONTRÔLE ET RÉVISION</div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[12px] font-bold leading-tight">Registre des faiblesses</h1>
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90"
          >
            Nouveau registre
          </button>
        </div>
        <div className="text-[10px] text-text-dim mt-0.5">
          « Faire le suivi des faiblesses relevées lors de l’audit précédent » (CPCC), conduit selon la méthode de
          l’ISA 265. Ce n’est pas un audit et aucune opinion sur les états financiers n’en sort.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1240px]">
          {erreur}
        </div>
      )}

      {creation && (
        <div className="border border-border bg-surface px-3.5 py-2.5 mb-2.5 max-w-[1240px]">
          <div className="text-[10.5px] font-semibold mb-1.5">Ouvrir un registre</div>
          <div className="flex flex-wrap gap-2 items-end">
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
            <label className="text-[10px] text-text-dim">
              Origine
              <select
                value={origine}
                onChange={(e) => setOrigine(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[10.5px] min-w-[220px]"
              >
                {Object.entries(LIBELLE_ORIGINE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-text-dim flex-1 min-w-[200px]">
              Libellé
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder={externe ? 'Lettre de recommandations 2026' : 'Révision 2026'}
                className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
              />
            </label>
            {externe && (
              <>
                <label className="text-[10px] text-text-dim">
                  Émetteur
                  <input
                    value={emetteur}
                    onChange={(e) => setEmetteur(e.target.value)}
                    placeholder="Commissaire aux comptes"
                    className="block border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                  />
                </label>
                <label className="text-[10px] text-text-dim">
                  Date de la lettre
                  <input
                    type="date"
                    value={dateLettre}
                    onChange={(e) => setDateLettre(e.target.value)}
                    className="block border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                  />
                </label>
                <label className="text-[10px] text-text-dim">
                  Référence
                  <input
                    value={referenceLettre}
                    onChange={(e) => setReferenceLettre(e.target.value)}
                    className="block border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                  />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={creer}
              disabled={!exerciceId || !libelle.trim() || (externe && (!emetteur.trim() || !dateLettre))}
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
          <div className="text-[9.5px] text-text-dim mt-1.5">
            {externe
              ? 'En mode « recommandation reçue », OmegaX est le porte-documents de la direction : il range et il suit. La qualification portée dans la lettre est recopiée telle quelle, et le cabinet ne la refait pas.'
              : 'En révision interne, le cabinet constate sur son propre travail de tenue. La qualification en « significative » est un acte de jugement séparé (§ 6 b), jamais une conséquence d’un montant.'}
          </div>
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1400px] items-start">
        <div className="border border-border bg-surface min-w-[240px] max-w-[280px]">
          <div className="px-2.5 py-1.5 border-b border-border text-[10px] font-mono text-text-dim">REGISTRES</div>
          {registres?.length === 0 && (
            <div className="px-2.5 py-3 text-[10.5px] text-text-dim">
              Aucun registre. Le CPCC réclame le suivi des faiblesses de l’exercice précédent parmi les travaux de
              l’inventaire documentaire.
            </div>
          )}
          {registres?.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectionId(r.id)}
              className={`block w-full text-left px-2.5 py-1.5 border-b border-border/60 ${
                r.id === selectionId ? 'bg-sel-soft' : 'hover:bg-chrome'
              }`}
            >
              <div className="text-[10.5px] font-semibold leading-tight">{r.libelle}</div>
              <div className="text-[9.5px] text-text-dim mt-0.5">
                {LIBELLE_ORIGINE[r.origine]} · {r._count?.faiblesses ?? 0} faiblesse(s)
                {r.statut === 'CLOS' && ' · clos'}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {!detail && (
            <div className="border border-border bg-surface px-3.5 py-3 text-[10.5px] text-text-dim">
              Choisir un registre pour en voir les faiblesses et leur suivi.
            </div>
          )}

          {detail && (
            <>
              <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[11px] font-bold">{detail.libelle}</div>
                    <div className="text-[10px] text-text-dim">
                      {LIBELLE_ORIGINE[detail.origine]}
                      {detail.emetteur && ` · ${detail.emetteur}, lettre du ${jour(detail.dateLettre)}`}
                      {detail.statut === 'CLOS' && ` · clos le ${jour(detail.closLe)}`}
                    </div>
                  </div>
                  {detail.statut === 'OUVERT' && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAjout(true)}
                        className="border border-border rounded-[6px] px-2.5 py-[3px] text-[10.5px]"
                      >
                        Ajouter une faiblesse
                      </button>
                      <button
                        type="button"
                        onClick={() => agir(() => api.post(`/faiblesses/${detail.id}/clore`, {}))}
                        className="bg-sel text-white rounded-[6px] px-2.5 py-[3px] text-[10.5px] font-semibold"
                      >
                        Clore
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {s && s.total > 0 && (
                <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10.5px]">
                    <span>
                      <span className="text-text-dim">Significatives </span>
                      <span className="font-semibold tabular-nums">{s.significatives}</span>
                    </span>
                    <span>
                      <span className="text-text-dim">Autres </span>
                      <span className="font-semibold tabular-nums">{s.autres}</span>
                    </span>
                    <span>
                      <span className="text-text-dim">Remédiées </span>
                      <span className="font-semibold tabular-nums">{s.remediees}</span>
                    </span>
                    <span>
                      <span className="text-text-dim">Reconduites </span>
                      <span className="font-semibold tabular-nums">{s.reconduites}</span>
                    </span>
                    {s.nonQualifiees > 0 && (
                      <span className="text-warning">{s.nonQualifiees} non qualifiée(s)</span>
                    )}
                  </div>
                  {s.significativesSansEcrit > 0 && (
                    <div className="text-[10px] text-danger mt-1">
                      {s.significativesSansEcrit} faiblesse(s) significative(s) jamais communiquée(s) par écrit ·
                      ISA 265 § 9 : « the auditor shall communicate IN WRITING significant deficiencies […] on a timely
                      basis ».
                    </div>
                  )}
                  {s.significativesAReporter > 0 && (
                    <div className="text-[10px] text-warning mt-1">
                      {s.significativesAReporter} significative(s) non remédiée(s) et non encore reportée(s)
                      {s.referencesAReporter.length > 0 && ` (${s.referencesAReporter.join(', ')})`} · § A17 : les avoir
                      déjà communiquées « does NOT eliminate the need to repeat the communication if remedial action has
                      not yet been taken ».
                    </div>
                  )}
                </div>
              )}

              {ajout && detail.statut === 'OUVERT' && (
                <div className="border border-border bg-surface px-3.5 py-2.5 mb-2">
                  <div className="text-[10.5px] font-semibold mb-1.5">Ajouter une faiblesse</div>
                  <div className="flex flex-wrap gap-2 items-end mb-1.5">
                    <label className="text-[10px] text-text-dim">
                      Référence
                      <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="F-01"
                        className="block border border-border bg-surface px-2 py-[3px] text-[10.5px] w-[90px]"
                      />
                    </label>
                    <label className="text-[10px] text-text-dim flex-1 min-w-[220px]">
                      Intitulé
                      <input
                        value={intitule}
                        onChange={(e) => setIntitule(e.target.value)}
                        className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                      />
                    </label>
                    {detailExterne && (
                      <label className="text-[10px] text-text-dim">
                        Qualification portée par la lettre
                        <select
                          value={qualificationLettre}
                          onChange={(e) => setQualificationLettre(e.target.value)}
                          className="block border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                        >
                          {Object.entries(LIBELLE_QUALIFICATION).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <label className="text-[10px] text-text-dim block mb-1.5">
                    Description · § 11 a)
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                      className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                    />
                  </label>
                  <label className="text-[10px] text-text-dim block mb-1.5">
                    Effet potentiel · § 11 a), et § A28 : « the auditor need not QUANTIFY those effects »
                    <textarea
                      value={effetPotentiel}
                      onChange={(e) => setEffetPotentiel(e.target.value)}
                      rows={2}
                      className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                    />
                  </label>
                  <label className="text-[10px] text-text-dim block mb-1.5">
                    Recommandation
                    <textarea
                      value={recommandation}
                      onChange={(e) => setRecommandation(e.target.value)}
                      rows={2}
                      className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
                    />
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={ajouter}
                      disabled={!reference.trim() || !intitule.trim() || !description.trim() || !effetPotentiel.trim()}
                      className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold disabled:opacity-40"
                    >
                      Ajouter
                    </button>
                    <button
                      type="button"
                      onClick={() => setAjout(false)}
                      className="border border-border rounded-[6px] px-3 py-[3px] text-[10.5px]"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {(detail.faiblesses ?? []).map((f) => (
                <div key={f.id} className="border border-border bg-surface px-3.5 py-2 mb-1.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10.5px] font-semibold">
                        {f.reference} · {f.intitule}
                      </div>
                      <div className="text-[10px] text-text-dim mt-0.5">
                        {LIBELLE_QUALIFICATION[f.qualification]} · {LIBELLE_STATUT[f.statut]}
                        {f.communiqueeLe && ` · communiquée le ${jour(f.communiqueeLe)} à ${f.communiqueeA}`}
                        {f.faiblesseAnterieure && ` · reconduite de ${f.faiblesseAnterieure.reference}`}
                        {f.reconduction && ` · reportée sous ${f.reconduction.reference}`}
                        {f.escaladeeLe && ` · escaladée le ${jour(f.escaladeeLe)}`}
                      </div>
                      <div className="text-[10px] mt-1">{f.description}</div>
                      <div className="text-[10px] text-text-dim mt-0.5">Effet potentiel · {f.effetPotentiel}</div>
                      {f.recommandation && (
                        <div className="text-[10px] text-text-dim mt-0.5">Recommandation · {f.recommandation}</div>
                      )}
                      {f.verificationCabinet && (
                        <div className="text-[10px] text-text-dim mt-0.5">
                          Vérification · {f.verificationCabinet}
                        </div>
                      )}
                      {f.motifNonRemediation && (
                        <div className="text-[10px] text-text-dim mt-0.5">
                          Non remédiée · {f.motifNonRemediation}
                        </div>
                      )}
                      {f.qualification === 'SIGNIFICATIVE' && !f.communiqueeLe && (
                        <div className="text-[10px] text-danger mt-0.5">
                          Jamais sortie par écrit · ISA 265 § 9.
                        </div>
                      )}
                    </div>
                    {detail.statut === 'OUVERT' && (
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {!detailExterne && f.qualification === 'NON_QUALIFIEE' && (
                          <>
                            <button
                              type="button"
                              onClick={() => qualifier(f, 'SIGNIFICATIVE')}
                              className="border border-border rounded-[6px] px-2 py-[2px] text-[10px]"
                            >
                              Significative
                            </button>
                            <button
                              type="button"
                              onClick={() => qualifier(f, 'AUTRE')}
                              className="border border-border rounded-[6px] px-2 py-[2px] text-[10px]"
                            >
                              Autre faiblesse
                            </button>
                          </>
                        )}
                        {f.qualification !== 'NON_QUALIFIEE' && !f.communiqueeLe && (
                          <button
                            type="button"
                            onClick={() => communiquer(f)}
                            className="border border-border rounded-[6px] px-2 py-[2px] text-[10px]"
                          >
                            Communiquer
                          </button>
                        )}
                        {f.statut !== 'REMEDIEE' && f.statut !== 'SANS_OBJET' && (
                          <button
                            type="button"
                            onClick={() => marquerRemediee(f)}
                            className="border border-border rounded-[6px] px-2 py-[2px] text-[10px]"
                          >
                            Remédiée
                          </button>
                        )}
                        {!detailExterne &&
                          f.qualification === 'AUTRE' &&
                          f.statut !== 'REMEDIEE' &&
                          f.statut !== 'SANS_OBJET' && (
                            <button
                              type="button"
                              onClick={() => escalader(f)}
                              className="border border-border rounded-[6px] px-2 py-[2px] text-[10px]"
                            >
                              Escalader
                            </button>
                          )}
                        {!f.reconduction && (
                          <button
                            type="button"
                            onClick={() => reporter(f)}
                            className="border border-border rounded-[6px] px-2 py-[2px] text-[10px]"
                          >
                            Reporter
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {(detail.motifsRefusCloture ?? []).length > 0 && (
                <div className="border border-warning/30 bg-warning-soft px-3.5 py-2 text-[10px]">
                  <div className="font-semibold mb-0.5">Ce registre ne peut pas être clos en l’état</div>
                  {(detail.motifsRefusCloture ?? []).map((m) => (
                    <div key={m} className="mt-0.5">
                      {m}
                    </div>
                  ))}
                </div>
              )}

              {(detail.mentionsContexte ?? []).length > 0 && (
                <div className="border border-border bg-chrome px-3.5 py-2 mt-2 text-[9.5px] text-text-dim">
                  <div className="font-mono mb-0.5">CONTEXTE DE LA COMMUNICATION · ISA 265 § 11 b)</div>
                  {(detail.mentionsContexte ?? []).map((m) => (
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
