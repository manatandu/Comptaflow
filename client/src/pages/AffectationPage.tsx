import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { AffectationResultat, Exercice, PreparationAffectation } from '../lib/types';

/**
 * AFFECTATION DU RÉSULTAT · Traitement → Affectation du résultat.
 *
 * L'écran d'un geste annuel, décidé par un organe et non par le comptable :
 * il présente donc d'abord CE QUI EST DÉJÀ DÉCIDÉ par le texte (le montant à
 * affecter, la dotation minimale à la réserve légale), puis laisse répartir le
 * reste librement entre les destinations que le référentiel du dossier admet.
 *
 * Le montant affiché est le résultat PROPRE de l'exercice · le mouvement du
 * compte 13, pas son solde. Dans un dossier dont les exercices précédents
 * n'ont jamais été affectés, les deux diffèrent, et c'est le mouvement qui est
 * juste (voir AffectationService).
 */

function montant(n: number | string): string {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

interface LigneSaisie {
  compteId: string;
  montant: string;
  libelle: string;
}

export function AffectationPage() {
  const { estAdmin, utilisateur } = useAuth();
  const peutEcrire = estAdmin || utilisateur?.role === 'COMPTABLE';

  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [exerciceId, setExerciceId] = useState('');
  const [prep, setPrep] = useState<PreparationAffectation | null>(null);
  const [historique, setHistorique] = useState<AffectationResultat[]>([]);
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [dateDecision, setDateDecision] = useState('');
  const [organe, setOrgane] = useState('');
  const [reference, setReference] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    const [exs, hist] = await Promise.all([
      api.get<Exercice[]>('/exercices'),
      api.get<AffectationResultat[]>('/affectation-resultat'),
    ]);
    setExercices(exs);
    setHistorique(hist);
    // Les exercices CLÔTURÉS sont les seuls affectables · c'est la clôture qui
    // porte le résultat au compte 13.
    const clos = exs.filter((e) => e.statut === 'CLOTURE').sort((a, b) => b.dateFin.localeCompare(a.dateFin));
    setExerciceId((actuel) => actuel || clos[0]?.id || '');
  }, []);

  useEffect(() => {
    charger().catch((e) => setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'));
  }, [charger]);

  useEffect(() => {
    if (!exerciceId) return;
    setErreur(null);
    api
      .get<PreparationAffectation>(`/affectation-resultat/exercice/${exerciceId}`)
      .then((p) => {
        setPrep(p);
        // La dotation minimale à la réserve légale est PRÉ-REMPLIE : c'est une
        // obligation légale, pas un choix, et la faire saisir à la main revient
        // à espérer que l'utilisateur l'ait lue.
        const reserve = p.reserveLegale.dotation;
        const compteReserve = reserve ? p.destinations.find((d) => d.numero.startsWith('111')) : undefined;
        const compteReport = p.destinations.find((d) =>
          p.estBenefice ? d.numero.startsWith('121') : d.numero.startsWith('129'),
        );
        const debut: LigneSaisie[] = [];
        if (reserve && compteReserve) {
          debut.push({ compteId: compteReserve.id, montant: String(reserve), libelle: 'Dotation à la réserve légale' });
        }
        if (compteReport) {
          const reste = Math.round((p.montant - (reserve ?? 0)) * 100) / 100;
          if (reste > 0) debut.push({ compteId: compteReport.id, montant: String(reste), libelle: '' });
        }
        setLignes(debut.length > 0 ? debut : [{ compteId: '', montant: '', libelle: '' }]);
      })
      .catch((e) => {
        setPrep(null);
        setErreur(e instanceof ApiError ? e.message : 'Préparation impossible');
      });
  }, [exerciceId]);

  const totalSaisi = useMemo(
    () => Math.round(lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0) * 100) / 100,
    [lignes],
  );
  const reste = prep ? Math.round((prep.montant - totalSaisi) * 100) / 100 : 0;

  const majLigne = (i: number, champ: keyof LigneSaisie, valeur: string) =>
    setLignes((ls) => ls.map((l, j) => (i === j ? { ...l, [champ]: valeur } : l)));

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    if (!prep) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/affectation-resultat', {
        exerciceId,
        dateDecision,
        organe,
        reference: reference || undefined,
        lignes: lignes
          .filter((l) => l.compteId && Number(l.montant) > 0)
          .map((l) => ({ compteId: l.compteId, montant: Number(l.montant), libelle: l.libelle || undefined })),
      });
      setInfo("Affectation enregistrée · son écriture est au brouillard de l'exercice suivant.");
      await charger();
      const p = await api.get<PreparationAffectation>(`/affectation-resultat/exercice/${exerciceId}`);
      setPrep(p);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Enregistrement impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    setErreur(null);
    try {
      await api.delete(`/affectation-resultat/${id}`);
      setInfo('Affectation supprimée · son écriture aussi.');
      await charger();
      if (exerciceId) setPrep(await api.get<PreparationAffectation>(`/affectation-resultat/exercice/${exerciceId}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Suppression impossible');
    }
  };

  const exercicesClos = exercices.filter((e) => e.statut === 'CLOTURE');

  return (
    <div className="p-3 max-w-[1100px]">
      <EnteteImpression titre="Affectation du résultat" />

      <div className="flex items-center gap-2 mb-2.5 no-impression">
        <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
          Affectation du résultat
          <Aide
            titre="Affectation du résultat"
            texte={
              "La clôture porte le résultat au compte 13 ; elle ne le répartit pas. « L'affectation du résultat d'un " +
              "exercice est décidée par les organes compétents au cours de l'exercice suivant ; le compte 13 est donc " +
              'SOLDÉ lors de la comptabilisation de cette affectation. » Sans ce geste, le résultat reste sur 131 ou ' +
              "139 et s'y empile d'exercice en exercice : le total du passif reste juste, sa décomposition non."
            }
            source="AUDCIF, Titre VII, compte 13 · SYCEBNL, Partie 2 ch. 3, compte 13"
          />
        </h1>
        <select
          value={exerciceId}
          onChange={(e) => {
            setExerciceId(e.target.value);
            setPrep(null);
          }}
          className="border border-border rounded-[6px] px-2 py-1 text-[10.5px] ml-auto"
        >
          {exercicesClos.length === 0 && <option value="">Aucun exercice clôturé</option>}
          {exercicesClos.map((e) => (
            <option key={e.id} value={e.id}>
              Exercice clos le {jour(e.dateFin)}
            </option>
          ))}
        </select>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5 leading-[1.5]">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[11px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      {exercicesClos.length === 0 && (
        <div className="text-[11px] text-text-dim italic border border-border rounded-[8px] px-3 py-4">
          Aucun exercice clôturé. Le résultat ne s'affecte qu'après la clôture · c'est elle qui le porte au compte 13.
        </div>
      )}

      {prep && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 mb-3 bg-surface border border-border rounded-[10px]">
            <div>
              <div className="text-[10px] text-text-dim">
                {prep.estBenefice ? 'Résultat à affecter' : 'Perte à imputer'}
              </div>
              <div className={`text-[15px] font-bold font-mono ${prep.estBenefice ? 'text-positive' : 'text-danger'}`}>
                {montant(prep.montant)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim">Pertes antérieures (12 débiteur)</div>
              <div className="text-[13px] font-mono">{montant(prep.pertesAnterieures)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim">Réserve légale constituée</div>
              <div className="text-[13px] font-mono">{montant(prep.reserveLegaleExistante)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim">Capital social (101)</div>
              <div className="text-[13px] font-mono">{montant(prep.capitalSocial)}</div>
            </div>
          </div>

          <div className="mb-3 text-[10.5px] text-text-dim bg-chrome-alt border border-border rounded-[6px] px-2.5 py-1.5 leading-[1.55]">
            {prep.reserveLegale.motif}
          </div>

          {prep.existante ? (
            <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between">
                <span className="text-[10.5px] font-bold">
                  Décidée le {jour(prep.existante.dateDecision)} · {prep.existante.organe}
                  {prep.existante.reference ? ` · ${prep.existante.reference}` : ''}
                </span>
                {peutEcrire && (
                  <button
                    onClick={() => supprimer(prep.existante!.id)}
                    className="text-[10px] text-danger hover:underline no-impression"
                  >
                    Supprimer
                  </button>
                )}
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  {prep.existante.lignes.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-mono w-[110px]">{l.compte.numero}</td>
                      <td className="px-3 py-1.5">{l.libelle || l.compte.intitule}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{montant(l.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-1.5 text-[10.5px] text-text-dim border-t border-border">
                Écriture{' '}
                {prep.existante.ecriture
                  ? `pièce n° ${prep.existante.ecriture.numeroPiece ?? '·'} (${prep.existante.ecriture.statut === 'BROUILLARD' ? 'au brouillard' : 'validée'})`
                  : 'absente'}
              </div>
            </div>
          ) : (
            <form onSubmit={enregistrer} className="bg-surface border border-border rounded-[10px] overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[10.5px] font-bold">
                Décision de l'organe compétent
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <label className="text-[10.5px] font-semibold text-text-dim flex flex-col gap-1">
                  Date de la décision
                  <input
                    type="date"
                    value={dateDecision}
                    onChange={(e) => setDateDecision(e.target.value)}
                    required
                    className="border border-border-dark px-2 py-1 text-[11px] font-mono font-normal"
                  />
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim flex flex-col gap-1">
                  Organe
                  <input
                    value={organe}
                    onChange={(e) => setOrgane(e.target.value)}
                    required
                    placeholder={
                      prep.referentiel === 'SYSCOHADA'
                        ? 'Assemblée générale ordinaire'
                        : 'Assemblée générale des membres'
                    }
                    className="border border-border-dark px-2 py-1 text-[11px] font-normal"
                  />
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim flex flex-col gap-1">
                  Procès-verbal
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="PV n° …"
                    className="border border-border-dark px-2 py-1 text-[11px] font-normal"
                  />
                </label>
              </div>

              <div className="px-3 pb-2 flex flex-col gap-1.5">
                {lignes.map((l, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <select
                      value={l.compteId}
                      onChange={(e) => majLigne(i, 'compteId', e.target.value)}
                      className="border border-border-dark px-2 py-1 text-[11px] flex-1 min-w-0"
                    >
                      <option value="">Destination…</option>
                      {prep.destinations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.numero} · {d.intitule}
                        </option>
                      ))}
                    </select>
                    <input
                      value={l.libelle}
                      onChange={(e) => majLigne(i, 'libelle', e.target.value)}
                      placeholder="Libellé"
                      className="border border-border-dark px-2 py-1 text-[11px] w-[190px]"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={l.montant}
                      onChange={(e) => majLigne(i, 'montant', e.target.value)}
                      className="border border-border-dark px-2 py-1 text-[11px] font-mono text-right w-[130px]"
                    />
                    <button
                      type="button"
                      onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
                      className="text-[11px] text-text-dim hover:text-danger px-1"
                      title="Retirer cette ligne"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setLignes((ls) => [...ls, { compteId: '', montant: '', libelle: '' }])}
                  className="self-start text-[10.5px] text-sel hover:underline"
                >
                  + Ajouter une destination
                </button>
              </div>

              <div className="px-3 py-2 border-t border-border flex items-center justify-between text-[11px]">
                <span className={Math.abs(reste) < 0.005 ? 'text-positive' : 'text-warning'}>
                  {Math.abs(reste) < 0.005
                    ? 'Le compte 13 est soldé.'
                    : `Reste à affecter : ${montant(reste)} · le compte 13 doit être soldé.`}
                </span>
                <button
                  type="submit"
                  disabled={envoi || !peutEcrire || Math.abs(reste) >= 0.005}
                  className="bg-sel text-white text-[10.5px] font-bold px-3 py-1 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  Enregistrer et passer l'écriture
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {historique.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold text-text-dim mb-1">AFFECTATIONS PRÉCÉDENTES</div>
          <div className="bg-surface border border-border rounded-[8px] overflow-hidden">
            {historique.map((a) => (
              <div
                key={a.id}
                className="px-3 py-1.5 border-b border-border last:border-0 flex justify-between text-[11px]"
              >
                <span>
                  Exercice clos le {a.exercice ? jour(a.exercice.dateFin) : '·'} · {a.organe} du{' '}
                  {jour(a.dateDecision)}
                </span>
                <span className="font-mono tabular-nums">
                  {a.estBenefice ? '' : '('}
                  {montant(a.montant)}
                  {a.estBenefice ? '' : ')'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
