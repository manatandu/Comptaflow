import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { Devise, Exercice, RapportReevaluation, Reevaluation } from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * DEVISES ET RÉÉVALUATION · Structure → devises et Traitement → Réévaluation
 * des dettes et créances en devise chez Sage 100 i7, calés sur la RDC.
 *
 * L'écran affiche séparément ce que le SYCEBNL sépare, et qu'un progiciel
 * généraliste écrase : l'écart LATENT d'une créance ou d'une dette, qui va au
 * 478 ou au 479 et appelle une provision s'il est défavorable, et l'écart
 * RÉALISÉ d'une disponibilité en devise, qui va droit au résultat en 676 ou
 * 776. Cette distinction commande deux postes du bilan, BY et DY, que le
 * logiciel affichait jusqu'ici à zéro faute de mécanisme.
 */

function montant(n: number | string): string {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function DevisesPage() {
  const { estAdmin, utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const [devises, setDevises] = useState<Devise[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [reevaluations, setReevaluations] = useState<Reevaluation[]>([]);
  const [rapport, setRapport] = useState<RapportReevaluation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [deviseCours, setDeviseCours] = useState('');
  const [dateCours, setDateCours] = useState('');
  const [valeurCours, setValeurCours] = useState('');
  const [dateReeval, setDateReeval] = useState('');

  const peutEcrire = estAdmin || utilisateur?.role === 'COMPTABLE';

  const charger = async () => {
    try {
      setDevises(await api.get<Devise[]>('/devises'));
      if (exerciceCourant) {
        setReevaluations(await api.get<Reevaluation[]>(`/devises/reevaluation/liste?exerciceId=${exerciceCourant.id}`));
      }
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    charger();
    api.get<Exercice[]>('/exercices').then(setExercices, () => setExercices([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id]);

  useEffect(() => {
    if (exerciceCourant && !dateReeval) {
      setDateReeval(exerciceCourant.dateFin.slice(0, 10));
      setDateCours(exerciceCourant.dateFin.slice(0, 10));
    }
  }, [exerciceCourant, dateReeval]);

  const creerDevise = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/devises', { code, intitule });
      setCode('');
      setIntitule('');
      setInfo('Devise ajoutée.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const poserCours = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/devises/${deviseCours}/cours`, {
        date: dateCours,
        cours: Number(valeurCours),
        source: 'BCC',
      });
      setValeurCours('');
      setInfo('Cours enregistré.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Cotation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const calculer = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    try {
      setRapport(
        await api.post<RapportReevaluation>('/devises/reevaluation/calcul', {
          exerciceId: exerciceCourant.id,
          dateReevaluation: dateReeval,
        }),
      );
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Calcul impossible');
      setRapport(null);
    }
  };

  const reevaluer = async () => {
    if (!exerciceCourant) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/devises/reevaluation', {
        exerciceId: exerciceCourant.id,
        dateReevaluation: dateReeval,
      });
      setInfo('Réévaluation passée · ses écritures sont dans le brouillard.');
      setRapport(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Réévaluation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const extourner = async (id: string, exerciceSuivantId: string) => {
    setErreur(null);
    try {
      await api.post(`/devises/reevaluation/${id}/extourne`, { exerciceSuivantId });
      setInfo("Écarts contre-passés à l'ouverture de l'exercice suivant.");
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Contre-passation impossible');
    }
  };

  const champ = 'mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[12.5px] font-normal';

  return (
    <div className="p-2">
      <EnteteImpression titre="Devises et réévaluation" />
      <div className="mb-1.5">
        <div className="text-[9.5px] font-mono text-text-dim leading-none">TRAITEMENT</div>
        <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
          Devises et réévaluation
          <Aide sujet="devises" />
        </h1>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[12px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-2.5 items-start">
        <div className="flex flex-col gap-2.5">
          {estAdmin && (
            <form onSubmit={creerDevise} className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                Ajouter une devise
              </div>
              <div className="p-3 grid grid-cols-[90px_1fr] gap-2">
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Code
                  <input
                    required
                    maxLength={3}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="USD"
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Intitulé
                  <input
                    required
                    value={intitule}
                    onChange={(e) => setIntitule(e.target.value)}
                    placeholder="Dollar américain"
                    className={champ}
                  />
                </label>
                <button
                  type="submit"
                  disabled={envoi}
                  className="col-span-2 bg-sel text-white text-[12.5px] font-bold py-1.5 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  Ajouter
                </button>
              </div>
            </form>
          )}

          {peutEcrire && devises.length > 0 && (
            <form onSubmit={poserCours} className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                Coter un cours
              </div>
              <div className="p-3 flex flex-col gap-2">
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Devise
                  <select required value={deviseCours} onChange={(e) => setDeviseCours(e.target.value)} className={champ}>
                    <option value="">Choisir…</option>
                    {devises.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.intitule}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Date
                    <input
                      type="date"
                      required
                      value={dateCours}
                      onChange={(e) => setDateCours(e.target.value)}
                      className={`${champ} font-mono`}
                    />
                  </label>
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Cours
                    <input
                      required
                      value={valeurCours}
                      onChange={(e) => setValeurCours(e.target.value)}
                      placeholder="2800"
                      className={`${champ} font-mono`}
                    />
                  </label>
                </div>
                <p className="text-[10.5px] text-text-dim leading-[1.5]">
                  Combien vaut UNE unité de la devise dans la monnaie de tenue du dossier. En RDC, le cours de
                  référence est celui publié par la Banque Centrale du Congo.
                </p>
                <button
                  type="submit"
                  disabled={envoi}
                  className="bg-sel text-white text-[12.5px] font-bold py-1.5 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  Coter
                </button>
              </div>
            </form>
          )}

          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
            <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
              Devises du dossier
            </div>
            {devises.map((d) => (
              <div key={d.id} className="px-3 py-2 border-b border-border/40">
                <div className="text-[12.5px] font-semibold">
                  <span className="font-mono">{d.code}</span> {d.intitule}
                </div>
                {d.cours.length > 0 ? (
                  <div className="text-[11px] text-text-dim mt-0.5 font-mono">
                    dernier cours {montant(d.cours[0].cours)} au {jour(d.cours[0].date)}
                  </div>
                ) : (
                  <div className="text-[11px] text-warning mt-0.5">aucun cours coté</div>
                )}
              </div>
            ))}
            {devises.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-text-dim italic">
                Aucune devise. Une association qui encaisse en dollars et paie en francs en a besoin pour justifier
                ses écarts de change.
              </div>
            )}
          </section>
        </div>

        <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
          <div className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between">
            <span className="text-[11.5px] font-bold">Réévaluation à la clôture</span>
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={dateReeval}
                onChange={(e) => {
                  setDateReeval(e.target.value);
                  setRapport(null);
                }}
                className="border border-border rounded-[6px] px-2 py-1 text-[11.5px] font-mono"
              />
              <button
                onClick={calculer}
                className="border border-border rounded-[6px] bg-surface px-3 py-1 text-[11.5px] font-semibold hover:bg-chrome"
              >
                Calculer
              </button>
              {peutEcrire && rapport && rapport.positions.length > 0 && (
                <button
                  onClick={reevaluer}
                  disabled={envoi}
                  className="bg-sel text-white text-[11.5px] font-bold px-3 py-1 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  Passer les écritures
                </button>
              )}
            </span>
          </div>

          {!rapport && (
            <p className="p-3 text-[12px] text-text-dim leading-[1.55]">
              Le calcul reprend chaque position non lettrée portant une devise, la convertit au cours de la date
              retenue, et sépare ce que le SYCEBNL sépare : l'écart d'une créance ou d'une dette est LATENT et va au
              478 ou au 479, celui d'une disponibilité est RÉALISÉ et va droit au résultat en 676 ou 776.
            </p>
          )}

          {rapport && (
            <>
              {rapport.coursManquants.length > 0 && (
                <div className="mx-3 mt-3 text-[12px] text-warning bg-warning-soft border border-warning/30 rounded-[6px] px-2.5 py-1.5">
                  Aucun cours coté au {jour(rapport.dateReevaluation)} ou avant pour :{' '}
                  {rapport.coursManquants.join(', ')}. Ces positions ne sont pas réévaluées.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 border-b border-border">
                {[
                  ['Perte latente (478)', rapport.perteLatente, 'text-danger'],
                  ['Gain latent (479)', rapport.gainLatent, 'text-positive'],
                  ['Perte réalisée (676)', rapport.perteRealisee, 'text-danger'],
                  ['Gain réalisé (776)', rapport.gainRealise, 'text-positive'],
                  ['Provision (194)', rapport.provision, 'text-warning'],
                ].map(([libelle, valeur, couleur]) => (
                  <div key={libelle as string}>
                    <div className="text-[10.5px] text-text-dim">{libelle}</div>
                    <div className={`text-[14px] font-bold font-mono ${valeur ? (couleur as string) : 'text-text-dim'}`}>
                      {montant(valeur as number)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[110px_1fr_60px_110px_90px_130px_130px_120px] gap-2 px-3 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>COMPTE</span>
                <span>INTITULÉ</span>
                <span>DEV.</span>
                <span className="text-right">EN DEVISE</span>
                <span className="text-right">COURS</span>
                <span className="text-right">COMPTABILISÉ</span>
                <span className="text-right">RÉÉVALUÉ</span>
                <span className="text-right">ÉCART</span>
              </div>
              {rapport.positions.map((p) => (
                <div
                  key={`${p.compteId}-${p.deviseId}`}
                  className="grid grid-cols-[110px_1fr_60px_110px_90px_130px_130px_120px] gap-2 px-3 py-1 text-[12px] border-b border-border/40"
                >
                  <span className="font-mono">{p.numero}</span>
                  <span className="truncate">
                    {p.intitule}
                    <span className="ml-1.5 text-[9.5px] font-bold text-text-dim">
                      {p.estTresorerie ? 'RÉALISÉ' : 'LATENT'}
                    </span>
                  </span>
                  <span className="font-mono">{p.deviseCode}</span>
                  <span className="text-right font-mono">{montant(p.montantDevise)}</span>
                  <span className="text-right font-mono">{montant(p.coursCloture)}</span>
                  <span className="text-right font-mono">{montant(p.valeurComptable)}</span>
                  <span className="text-right font-mono">{montant(p.valeurReevaluee)}</span>
                  <span className={`text-right font-mono font-bold ${p.ecart < 0 ? 'text-danger' : 'text-positive'}`}>
                    {montant(p.ecart)}
                  </span>
                </div>
              ))}
              {rapport.positions.length === 0 && (
                <div className="px-3 py-4 text-[12px] text-text-dim italic">
                  Aucune position en devise à réévaluer à cette date.
                </div>
              )}
            </>
          )}

          {reevaluations.length > 0 && (
            <div className="border-t border-border">
              <div className="px-3 py-1.5 bg-chrome text-[10.5px] font-bold text-text-dim">
                RÉÉVALUATIONS PASSÉES SUR CET EXERCICE
              </div>
              {reevaluations.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[130px_1fr_200px] gap-2 px-3 py-1.5 text-[12px] items-center border-b border-border/40"
                >
                  <span className="font-mono">{jour(r.dateReevaluation)}</span>
                  <span className="text-text-dim">
                    Écarts pièce {r.ecritureEcarts?.numeroPiece ?? '·'}
                    {r.ecritureProvision && ` · provision pièce ${r.ecritureProvision.numeroPiece ?? '·'}`}
                  </span>
                  <span>
                    {r.ecritureExtourne ? (
                      <span className="text-[11px] text-positive font-semibold">
                        Contre-passée le {jour(r.ecritureExtourne.date)}
                      </span>
                    ) : peutEcrire ? (
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && extourner(r.id, e.target.value)}
                        className="w-full border border-border rounded-[4px] px-1 py-0.5 text-[11px]"
                      >
                        <option value="">Contre-passer sur…</option>
                        {exercices
                          .filter((ex) => ex.statut === 'OUVERT' && ex.id !== exerciceCourant?.id)
                          .map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              Exercice {new Date(ex.dateDebut).getFullYear()}
                            </option>
                          ))}
                      </select>
                    ) : null}
                  </span>
                </div>
              ))}
              <p className="px-3 py-2 text-[10.5px] text-text-dim leading-[1.55]">
                Les écarts de conversion se contre-passent à l'OUVERTURE de l'exercice suivant : ils décrivent une
                situation à une date d'arrêté, pas une charge rattachée à une période. C'est l'inverse de la reprise
                d'une régularisation, qui se fait à la fin de l'exercice concerné.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
