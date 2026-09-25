import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DetailRapprochement, PropositionsRapprochement } from '../lib/types';
import { Aide } from '../components/chrome/Aide';

/**
 * Pointage écriture par écriture d'un rapprochement bancaire (§3.4) : chaque
 * ligne se pointe/dépointe individuellement d'un clic (comme sur un relevé
 * papier qu'on coche ligne à ligne), pas par sélection groupée · l'écart
 * (solde pointé - solde du relevé) se recalcule à chaque pointage. Clôture
 * bloquée tant que l'écart n'est pas nul.
 */
export function RapprochementDetailPage({ id: idProp }: { id?: string } = {}) {
  // Voir LettragePage : en fenêtre, l'identifiant vient en propriété.
  const params = useParams<{ id: string }>();
  const id = idProp ?? params.id;
  const navigate = useNavigate();
  const { peutEcrire } = useAuth();
  const [detail, setDetail] = useState<DetailRapprochement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    if (!id) return;
    try {
      setDetail(await api.get<DetailRapprochement>(`/rapprochements/${id}`));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger ce rapprochement');
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const enCours = detail?.rapprochement.statut === 'EN_COURS';

  // --- Relevé importé et correspondances ---------------------------------
  const [propositions, setPropositions] = useState<PropositionsRapprochement | null>(null);
  // Cases DÉCOCHÉES à l'arrivée · un panneau pré-coché ferait de la
  // confirmation un acquiescement, alors que c'est l'examen qui est demandé.
  const [retenues, setRetenues] = useState<Set<string>>(new Set());
  const [fenetreJours, setFenetreJours] = useState(15);
  // Association MANUELLE · une ligne du relevé choisie, puis les lignes du
  // compte qui la composent (une remise de chèques en compte plusieurs).
  const [associationPour, setAssociationPour] = useState<string | null>(null);
  const [choixEcritures, setChoixEcritures] = useState<Set<string>>(new Set());

  const executer = async (action: () => Promise<unknown>, succes?: string) => {
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await action();
      if (succes) setInfo(succes);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Opération impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const importerReleve = async (fichier: File) => {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    let binaire = '';
    for (let i = 0; i < octets.length; i += 8192) binaire += String.fromCharCode(...octets.subarray(i, i + 8192));
    setPropositions(null);
    await executer(
      () => api.post(`/rapprochements/${id}/releve`, { nomFichier: fichier.name, contenuBase64: btoa(binaire) }),
      'Relevé importé.',
    );
  };

  const proposer = async () => {
    setErreur(null);
    try {
      const p = await api.get<PropositionsRapprochement>(`/rapprochements/${id}/propositions?fenetreJours=${fenetreJours}`);
      setPropositions(p);
      setRetenues(new Set());
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de calculer les propositions');
    }
  };

  const confirmerRetenues = async () => {
    if (!propositions) return;
    const correspondances = propositions.propositions
      .filter((p) => retenues.has(p.ligneReleveId))
      .map((p) => ({ ligneReleveId: p.ligneReleveId, ligneEcritureIds: p.ligneEcritureIds }));
    if (correspondances.length === 0) return;
    await executer(() => api.post(`/rapprochements/${id}/correspondances`, { correspondances }), `${correspondances.length} correspondance(s) confirmée(s).`);
    setPropositions(null);
  };

  const validerAssociation = async () => {
    if (!associationPour || choixEcritures.size === 0) return;
    await executer(
      () =>
        api.post(`/rapprochements/${id}/correspondances`, {
          correspondances: [{ ligneReleveId: associationPour, ligneEcritureIds: [...choixEcritures] }],
        }),
      'Correspondance confirmée.',
    );
    setAssociationPour(null);
    setChoixEcritures(new Set());
  };

  const basculerPointage = async (ligneId: string, pointee: boolean) => {
    if (!id || !enCours) return;
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/rapprochements/${id}/${pointee ? 'depointer' : 'pointer'}`, { ligneIds: [ligneId] });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de modifier le pointage de cette ligne');
    }
  };

  const cloturer = async () => {
    if (!id) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/rapprochements/${id}/cloturer`, {});
      setInfo('Rapprochement clôturé.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de clôturer ce rapprochement');
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async () => {
    if (!id) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.delete(`/rapprochements/${id}`);
      navigate('/rapprochement');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d\'annuler ce rapprochement');
      setEnvoi(false);
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-end mb-1 max-w-[900px]">
        <button
          onClick={() => navigate('/rapprochement')}
          className="border border-border px-2.5 py-[2px] text-[11.5px] hover:bg-chrome-alt"
        >
          Liste des rapprochements
        </button>
      </div>

      {!detail && !erreur && <div className="text-[11.5px] text-text-dim">Chargement…</div>}
      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[900px]">{erreur}</div>}

      {detail && (
        <>
          <h1 className="text-[12px] font-bold leading-tight mb-1">
            {detail.rapprochement.compte ? `${detail.rapprochement.compte.numero} · ${detail.rapprochement.compte.intitule}` : 'Rapprochement'}
          </h1>
          <div className="text-[11.5px] text-text-dim mb-3">
            Relevé du {new Date(detail.rapprochement.dateReleve).toLocaleDateString('fr-FR')} · solde{' '}
            <span className="font-mono font-semibold">{detail.rapprochement.soldeReleve.toLocaleString('fr-FR')}</span>{' '}
            {detail.rapprochement.statut === 'CLOTURE' && <span className="font-mono font-bold text-text-dim">(Clôturé)</span>}
          </div>

          {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[900px]">{info}</div>}

          <div className="flex items-center gap-5 mb-3 max-w-[900px] bg-surface border border-border px-4 py-2.5">
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Solde de départ</div>
              <div className="font-mono text-[12px]">{detail.soldeDepart.toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Solde pointé</div>
              <div className="font-mono text-[12px]">{detail.soldePointe.toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Solde du relevé</div>
              <div className="font-mono text-[12px]">{detail.rapprochement.soldeReleve.toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Écart</div>
              <div className={`font-mono text-[12px] font-bold ${detail.equilibre ? 'text-positive' : 'text-danger'}`}>
                {detail.ecart.toLocaleString('fr-FR')}
              </div>
            </div>
          </div>

          <BlocReleve
            detail={detail}
            modifiable={!!peutEcrire && !!enCours}
            envoi={envoi}
            propositions={propositions}
            retenues={retenues}
            setRetenues={setRetenues}
            fenetreJours={fenetreJours}
            setFenetreJours={setFenetreJours}
            associationPour={associationPour}
            choixEcritures={choixEcritures}
            onImporter={importerReleve}
            onRetirer={() => executer(() => api.delete(`/rapprochements/${id}/releve`), 'Relevé retiré.')}
            onProposer={proposer}
            onConfirmer={confirmerRetenues}
            onDissocier={(rid) => executer(() => api.post(`/rapprochements/${id}/releve/${rid}/dissocier`, {}), 'Correspondance défaite.')}
            onAssocier={(rid) => {
              setAssociationPour(rid);
              setChoixEcritures(new Set());
            }}
            onValiderAssociation={validerAssociation}
            onAbandonnerAssociation={() => {
              setAssociationPour(null);
              setChoixEcritures(new Set());
            }}
          />

          <div
            // `overflow-x-auto` ici, `min-w` sur les lignes · les 420 px de colonnes
            // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
            // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
            // qui emportait alors titre, onglets et boutons hors de l'écran.
            className="border border-border bg-surface shadow-posee max-w-[900px] overflow-x-auto"
          >
            <div className="grid grid-cols-[26px_70px_46px_1.4fr_100px_100px] min-w-[570px] gap-2.5 px-3.5 py-1.5 bg-chrome border-b border-border text-[11px] font-bold text-text-dim">
              <span />
              <span>DATE</span>
              <span>JRN</span>
              <span>Libellé</span>
              <span className="text-right">Débit</span>
              <span className="text-right">Crédit</span>
            </div>
            {detail.lignes.map((l, i) => (
              <div
                key={l.id}
                className={`grid grid-cols-[26px_70px_46px_1.4fr_100px_100px] min-w-[570px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border last:border-b-0 text-[11.5px] ${
                  l.pointee ? 'bg-positive-soft' : i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                {/* La case reste affichée à la lecture seule : cochée, elle DIT qu'une ligne est pointée. */}
                {associationPour ? (
                  <input
                    type="checkbox"
                    aria-label="Choisir pour la correspondance"
                    disabled={l.pointee}
                    checked={choixEcritures.has(l.id)}
                    onChange={() =>
                      setChoixEcritures((prev) => {
                        const n = new Set(prev);
                        if (n.has(l.id)) n.delete(l.id);
                        else n.add(l.id);
                        return n;
                      })
                    }
                  />
                ) : (
                  <input
                    type="checkbox"
                    disabled={!enCours || !peutEcrire}
                    checked={l.pointee}
                    onChange={() => basculerPointage(l.id, l.pointee)}
                  />
                )}
                <span className="font-mono text-[11px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
                <span className="font-mono text-text-dim">{l.journalCode}</span>
                <span className="truncate">{l.libelle}</span>
                <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
                <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
              </div>
            ))}
            {detail.lignes.length === 0 && (
              <div className="p-3 text-[11.5px] text-text-dim">Aucun mouvement pointable sur ce compte.</div>
            )}
          </div>

          {peutEcrire && enCours && (
            <div className="mt-3 flex items-center gap-2 max-w-[900px]">
              <button
                onClick={cloturer}
                disabled={!detail.equilibre || envoi}
                title={detail.equilibre ? undefined : "L'écart doit être nul pour clôturer"}
                className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-40"
              >
                {envoi ? '…' : 'Clôturer le rapprochement'}
              </button>
              <button onClick={annuler} disabled={envoi} className="text-[11.5px] font-semibold text-danger px-4 py-1.5 disabled:opacity-40">
                Annuler ce rapprochement
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * LE RELEVÉ IMPORTÉ · chaque ligne dit son état : rapprochée, proposée, ou À
 * COMPTABILISER. Cette dernière est la moitié de l'état de rapprochement que le
 * CPCC range parmi les états de sortie de la trésorerie (organisation
 * comptable, ch. 4) · l'autre moitié, les écritures absentes du relevé, se lit
 * dans le tableau du compte, sur les lignes non pointées.
 */
function BlocReleve(props: {
  detail: DetailRapprochement;
  modifiable: boolean;
  envoi: boolean;
  propositions: PropositionsRapprochement | null;
  retenues: Set<string>;
  setRetenues: (s: Set<string>) => void;
  fenetreJours: number;
  setFenetreJours: (n: number) => void;
  associationPour: string | null;
  choixEcritures: Set<string>;
  onImporter: (f: File) => void;
  onRetirer: () => void;
  onProposer: () => void;
  onConfirmer: () => void;
  onDissocier: (ligneReleveId: string) => void;
  onAssocier: (ligneReleveId: string) => void;
  onValiderAssociation: () => void;
  onAbandonnerAssociation: () => void;
}) {
  const { detail, modifiable, propositions, retenues } = props;
  const parReleve = new Map((propositions?.propositions ?? []).map((p) => [p.ligneReleveId, p]));
  const lignesCompte = new Map(detail.lignes.map((l) => [l.id, l]));
  const aComptabiliser = detail.releve.filter((r) => r.ligneEcritureIds.length === 0 && !parReleve.has(r.id));
  const ligneAssociee = detail.releve.find((r) => r.id === props.associationPour);
  const sommeChoix = [...props.choixEcritures].reduce((acc, lid) => {
    const l = lignesCompte.get(lid);
    return l ? acc + l.debit - l.credit : acc;
  }, 0);

  return (
    <div className="max-w-[900px] mb-3 border border-border bg-surface shadow-posee">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-[12px] font-semibold">Relevé bancaire</span>
        <Aide
          titre="Relevé importé"
          texte="Fichier CSV ou Excel de la banque, colonnes Date, Libellé, Débit et Crédit (ou un Montant signé, négatif pour une sortie). Débit et crédit sont ceux de la banque : un crédit du relevé est un débit du compte 52. Les correspondances sont proposées au montant exact et au bon sens, dans une fenêtre de dates que vous réglez ; plusieurs écritures candidates, rien n'est proposé. Rien n'est pointé sans votre confirmation, et une ligne du relevé sans écriture est à comptabiliser, jamais passée d'office."
          source="Sage 100 i7, rapprochement bancaire · CPCC, organisation comptable, ch. 4"
        />
        <span className="flex-1" />
        {modifiable && (
          <>
            <label className="border border-border px-2.5 py-[3px] text-[11.5px] cursor-pointer hover:bg-chrome-alt">
              {detail.releve.length ? 'Réimporter' : 'Importer le relevé'}
              <input
                type="file"
                accept=".csv,.txt,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) props.onImporter(f);
                  e.target.value = '';
                }}
              />
            </label>
            {detail.releve.length > 0 && (
              <button onClick={props.onRetirer} disabled={props.envoi} className="border border-border px-2.5 py-[3px] text-[11.5px]">
                Retirer
              </button>
            )}
          </>
        )}
      </div>

      {detail.releve.length === 0 ? (
        <p className="px-3 py-2 text-[11.5px] text-text-dim">Aucun relevé importé · le pointage manuel reste possible ci-dessous.</p>
      ) : (
        <>
          {detail.ecartReleve !== null && Math.abs(detail.ecartReleve) >= 0.005 && (
            <p className="mx-3 mt-2 text-[11.5px] text-warning bg-warning-soft border border-warning/30 px-2.5 py-1.5">
              Le relevé ne boucle pas : solde de départ plus ses opérations diffèrent du solde imprimé de {fmt(detail.ecartReleve)}.
              Fichier incomplet ou solde de départ différent de celui de la banque.
            </p>
          )}

          {modifiable && (
            <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[11.5px]">
              <span className="text-text-dim">Fenêtre</span>
              <input
                type="number"
                min={0}
                max={120}
                value={props.fenetreJours}
                onChange={(e) => props.setFenetreJours(Math.max(0, Number(e.target.value) || 0))}
                className="w-[56px] border border-border px-1.5 py-[2px] text-right"
              />
              <span className="text-text-dim">jours</span>
              <button onClick={props.onProposer} disabled={props.envoi} className="border border-border px-2.5 py-[3px]">
                Proposer les correspondances
              </button>
              {propositions && (
                <>
                  <span className="text-text-dim">
                    {propositions.propositions.length} proposée(s) · {propositions.lignesReleveSansProposition} sans proposition
                  </span>
                  <button
                    onClick={props.onConfirmer}
                    disabled={props.envoi || retenues.size === 0}
                    className="bg-sel text-white px-3 py-[3px] font-semibold disabled:opacity-40"
                  >
                    Confirmer la sélection ({retenues.size})
                  </button>
                </>
              )}
            </div>
          )}

          {ligneAssociee && (
            <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 text-[11.5px] bg-sel-soft border border-sel/30 px-2.5 py-1.5">
              <span>
                Associer « {ligneAssociee.libelle} » ({fmt(ligneAssociee.credit - ligneAssociee.debit)} vu du compte) · cochez les écritures ci-dessous.
                Sélection : <b>{fmt(sommeChoix)}</b>
              </span>
              <button onClick={props.onValiderAssociation} disabled={props.envoi || props.choixEcritures.size === 0} className="bg-sel text-white px-3 py-[3px] font-semibold disabled:opacity-40">
                Valider
              </button>
              <button onClick={props.onAbandonnerAssociation} className="border border-border px-2.5 py-[3px]">
                Abandonner
              </button>
            </div>
          )}

          <div className="overflow-x-auto p-3">
            <table className="w-full min-w-[640px] text-[11.5px]">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1 w-[80px]">Date</th>
                  <th className="text-left px-2 py-1">Libellé</th>
                  <th className="text-left px-2 py-1 w-[90px]">Référence</th>
                  <th className="text-right px-2 py-1 w-[100px]">Débit</th>
                  <th className="text-right px-2 py-1 w-[100px]">Crédit</th>
                  <th className="text-left px-2 py-1 w-[190px]">État</th>
                </tr>
              </thead>
              <tbody>
                {detail.releve.map((r) => {
                  const p = parReleve.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td className="px-2 py-1">{new Date(r.date).toLocaleDateString('fr-FR')}</td>
                      <td className="px-2 py-1 truncate max-w-[260px]">{r.libelle}</td>
                      <td className="px-2 py-1 text-text-dim">{r.reference ?? ''}</td>
                      <td className="px-2 py-1 text-right">{r.debit ? fmt(r.debit) : ''}</td>
                      <td className="px-2 py-1 text-right">{r.credit ? fmt(r.credit) : ''}</td>
                      <td className="px-2 py-1">
                        {r.ligneEcritureIds.length > 0 ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="rounded-full bg-positive-soft text-positive px-2 py-[1px] font-semibold">Rapprochée</span>
                            {modifiable && (
                              <button onClick={() => props.onDissocier(r.id)} className="text-text-dim underline">
                                défaire
                              </button>
                            )}
                          </span>
                        ) : p ? (
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              disabled={!modifiable}
                              checked={retenues.has(r.id)}
                              onChange={() => {
                                const n = new Set(retenues);
                                if (n.has(r.id)) n.delete(r.id);
                                else n.add(r.id);
                                props.setRetenues(n);
                              }}
                            />
                            <span className="rounded-full bg-sel-soft text-sel px-2 py-[1px] font-semibold">
                              Proposée · {p.motif === 'REFERENCE' ? 'référence' : 'montant et date'}
                            </span>
                          </label>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="rounded-full bg-warning-soft text-warning px-2 py-[1px] font-semibold">À comptabiliser</span>
                            {modifiable && (
                              <button onClick={() => props.onAssocier(r.id)} className="text-text-dim underline">
                                associer
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {aComptabiliser.length > 0 && (
              <p className="mt-2 text-[11.5px] text-text-dim">
                {aComptabiliser.length} opération(s) du relevé sans écriture au compte · frais, agios ou virements à comptabiliser, ou à associer à la main.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
