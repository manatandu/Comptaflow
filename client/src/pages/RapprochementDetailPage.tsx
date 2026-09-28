import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { DetailRapprochement, PropositionsRapprochement } from '../lib/types';
import { Aide } from '../components/chrome/Aide';
import { PortailModale } from '../components/PortailModale';
import {
  mentionANouveauxEcartes,
  mentionFonduesDansLeDepart,
  motifOuvertureBloquante,
} from '../lib/rapprochement-a-nouveau';
import { montant as fmt, montantOuVide } from '../lib/montants';

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
  const { peutEcrire, estAdmin } = useAuth();
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
  const mentionANouveau = detail ? mentionANouveauxEcartes(detail.aNouveauEcartes) : null;
  const mentionFondues = detail ? mentionFonduesDansLeDepart(detail.fonduesDansLeDepart) : null;
  const ouvertureBloquante = detail ? motifOuvertureBloquante(detail) : null;
  const encours = detail?.encours ?? [];

  // --- Réouverture d'un rapprochement clos (administrateur, motif) --------
  const [reouverture, setReouverture] = useState<string | null>(null);

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
  // Les en-cours d'ouverture se choisissent à part · le serveur les reçoit
  // dans `encoursIds`, jamais mêlés aux lignes d'écriture.
  const [choixEncours, setChoixEncours] = useState<Set<string>>(new Set());

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
      .map((p) => ({ ligneReleveId: p.ligneReleveId, ligneEcritureIds: p.ligneEcritureIds, encoursIds: p.encoursIds ?? [] }));
    if (correspondances.length === 0) return;
    await executer(() => api.post(`/rapprochements/${id}/correspondances`, { correspondances }), `${correspondances.length} correspondance(s) confirmée(s).`);
    setPropositions(null);
  };

  const validerAssociation = async () => {
    if (!associationPour || choixEcritures.size + choixEncours.size === 0) return;
    await executer(
      () =>
        api.post(`/rapprochements/${id}/correspondances`, {
          correspondances: [{ ligneReleveId: associationPour, ligneEcritureIds: [...choixEcritures], encoursIds: [...choixEncours] }],
        }),
      'Correspondance confirmée.',
    );
    setAssociationPour(null);
    setChoixEcritures(new Set());
    setChoixEncours(new Set());
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

  const basculerEncours = async (encoursId: string, pointee: boolean) => {
    if (!id || !enCours) return;
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/rapprochements/${id}/encours/${pointee ? 'depointer' : 'pointer'}`, { encoursIds: [encoursId] });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de modifier le pointage de cet en-cours");
    }
  };

  const rouvrir = async () => {
    if (!id || reouverture === null) return;
    await executer(() => api.post(`/rapprochements/${id}/rouvrir`, { motif: reouverture }), 'Rapprochement rouvert.');
    setReouverture(null);
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
            <span className="font-mono font-semibold">{fmt(detail.rapprochement.soldeReleve)}</span>{' '}
            {detail.rapprochement.statut === 'CLOTURE' && <span className="font-mono font-bold text-text-dim">(Clôturé)</span>}
            {estAdmin && detail.rapprochement.statut === 'CLOTURE' && (
              <button onClick={() => setReouverture('')} className="ml-3 border border-border px-2.5 py-[2px] text-[11.5px] hover:bg-chrome-alt">
                Rouvrir
              </button>
            )}
          </div>
          {/* La réouverture reste sur la ligne · un état arrêté puis rouvert ne se lit pas comme un état jamais clos. */}
          {detail.rapprochement.rouvertAt && (
            <div className="text-[11.5px] text-warning mb-3 max-w-[900px]">
              Rouvert le {new Date(detail.rapprochement.rouvertAt).toLocaleDateString('fr-FR')} · {detail.rapprochement.motifReouverture}
            </div>
          )}

          {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[900px]">{info}</div>}

          <div className="flex items-center gap-5 mb-3 max-w-[900px] bg-surface border border-border px-4 py-2.5">
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Solde de départ</div>
              <div className="font-mono text-[12px]">{fmt(detail.soldeDepart)}</div>
            </div>
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Solde pointé</div>
              <div className="font-mono text-[12px]">{fmt(detail.soldePointe)}</div>
            </div>
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Solde du relevé</div>
              <div className="font-mono text-[12px]">{fmt(detail.rapprochement.soldeReleve)}</div>
            </div>
            <div>
              <div className="text-[11px] text-text-dim font-semibold">Écart</div>
              <div className={`font-mono text-[12px] font-bold ${detail.equilibre ? 'text-positive' : 'text-danger'}`}>
                {fmt(detail.ecart)}
              </div>
            </div>
          </div>

          {detail.premier && (
            <BlocOuverture
              detail={detail}
              modifiable={!!peutEcrire && !!enCours}
              envoi={envoi}
              onDeclarer={(soldeDepart, dateDepart) =>
                executer(() => api.patch(`/rapprochements/${id}/depart`, { soldeDepart, dateDepart }), 'Solde de départ enregistré.')
              }
              onAjouterEncours={(corps) => executer(() => api.post(`/rapprochements/${id}/encours`, corps), 'En-cours déclaré.')}
              onRetirerEncours={(encoursId) => executer(() => api.delete(`/rapprochements/${id}/encours/${encoursId}`), 'En-cours retiré.')}
            />
          )}

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
            choixEncours={choixEncours}
            onImporter={importerReleve}
            onRetirer={() => executer(() => api.delete(`/rapprochements/${id}/releve`), 'Relevé retiré.')}
            onProposer={proposer}
            onConfirmer={confirmerRetenues}
            onDissocier={(rid) => executer(() => api.post(`/rapprochements/${id}/releve/${rid}/dissocier`, {}), 'Correspondance défaite.')}
            onAssocier={(rid) => {
              setAssociationPour(rid);
              setChoixEcritures(new Set());
              setChoixEncours(new Set());
            }}
            onValiderAssociation={validerAssociation}
            onAbandonnerAssociation={() => {
              setAssociationPour(null);
              setChoixEcritures(new Set());
              setChoixEncours(new Set());
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
                <span className="font-mono text-right">{montantOuVide(l.debit)}</span>
                <span className="font-mono text-right">{montantOuVide(l.credit)}</span>
              </div>
            ))}
            {/* Les en-cours d'ouverture se pointent comme des lignes du compte · aucune écriture ne les porte. */}
            {encours.map((e) => (
              <div
                key={e.id}
                className={`grid grid-cols-[26px_70px_46px_1.4fr_100px_100px] min-w-[570px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border last:border-b-0 text-[11.5px] ${
                  e.pointee ? 'bg-positive-soft' : 'bg-surface'
                }`}
              >
                {associationPour ? (
                  <input
                    type="checkbox"
                    aria-label="Choisir pour la correspondance"
                    disabled={e.pointee}
                    checked={choixEncours.has(e.id)}
                    onChange={() =>
                      setChoixEncours((prev) => {
                        const n = new Set(prev);
                        if (n.has(e.id)) n.delete(e.id);
                        else n.add(e.id);
                        return n;
                      })
                    }
                  />
                ) : (
                  <input
                    type="checkbox"
                    aria-label="Pointer l'en-cours"
                    disabled={!enCours || !peutEcrire}
                    checked={e.pointee}
                    onChange={() => basculerEncours(e.id, e.pointee)}
                  />
                )}
                <span className="font-mono text-[11px] text-text-dim">{new Date(e.date).toLocaleDateString('fr-FR')}</span>
                <span className="text-text-dim">En-cours</span>
                <span className="truncate">{e.libelle}</span>
                <span className="font-mono text-right">{montantOuVide(e.debit)}</span>
                <span className="font-mono text-right">{montantOuVide(e.credit)}</span>
              </div>
            ))}
            {detail.lignes.length === 0 && encours.length === 0 && (
              <div className="p-3 text-[11.5px] text-text-dim">Aucun mouvement pointable sur ce compte.</div>
            )}
            {/* Une tranche se dit (audit final F185) · les soldes ci-dessus
                portent tout le compte, la liste seulement ses premières lignes. */}
            {detail.tronque && detail.totalLignes !== undefined && (
              <div className="px-3 py-1 text-[11px] text-text-dim">
                {detail.lignes.length} premières lignes sur {detail.totalLignes.toLocaleString('fr-FR')} · les soldes
                portent tout le compte.
              </div>
            )}
            {/* Les reports à-nouveau que le serveur n'offre pas au pointage se
                comptent (audit final F205) · écartés sans un mot, ils se
                liraient comme des lignes perdues. */}
            {mentionANouveau && (
              <div className="px-3 py-1 text-[11px] text-text-dim flex items-center gap-1.5">
                <span>{mentionANouveau}</span>
                <Aide
                  titre="Report à-nouveau écarté"
                  texte="Le report à-nouveau recopie le solde de clôture de l'exercice précédent · ce n'est pas une opération de la banque. Après un rapprochement clos, le solde de départ le contient déjà. Sur le premier rapprochement du compte, c'est le solde de départ lu sur le relevé qui le remplace. Pointé, il compterait l'ouverture deux fois."
                  source="AUDCIF Titre VI, Rapprochement (État de) · AUDCIF art. 34, SYCEBNL art. 16, 4°"
                />
              </div>
            )}
            {mentionFondues && <div className="px-3 py-1 text-[11px] text-text-dim">{mentionFondues}</div>}
          </div>

          {peutEcrire && enCours && (
            <div className="mt-3 flex items-center gap-2 max-w-[900px]">
              <button
                onClick={cloturer}
                disabled={!detail.equilibre || ouvertureBloquante !== null || envoi}
                title={ouvertureBloquante ?? (detail.equilibre ? undefined : "L'écart doit être nul pour clôturer")}
                className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-40"
              >
                {envoi ? '…' : 'Clôturer le rapprochement'}
              </button>
              {/* Un rapprochement rouvert se reclôt · le serveur refuse de l'annuler. */}
              {!detail.rapprochement.rouvertAt && (
                <button onClick={annuler} disabled={envoi} className="text-[11.5px] font-semibold text-danger px-4 py-1.5 disabled:opacity-40">
                  Annuler ce rapprochement
                </button>
              )}
            </div>
          )}
        </>
      )}

      {reouverture !== null && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                rouvrir();
              }}
              className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span className="flex items-center gap-1.5">
                  Rouvrir le rapprochement
                  <Aide
                    titre="Réouverture"
                    texte="Seul le dernier rapprochement clos du compte se rouvre, par l'administrateur, et jamais sur un exercice ou une période clôturés · un rapprochement plus ancien changerait le solde de départ des suivants. Le motif reste sur le rapprochement et au journal d'audit. Une fois rouvert, une ligne pointée à tort se dépointe, puis le rapprochement se reclôt."
                    source="OmegaX"
                  />
                </span>
                <button type="button" onClick={() => setReouverture(null)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                  ✕
                </button>
              </div>
              <div className="p-4">
                <label className="text-[11.5px] font-semibold text-text-dim block">
                  Motif
                  <textarea
                    required
                    value={reouverture}
                    onChange={(e) => setReouverture(e.target.value)}
                    maxLength={500}
                    className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal min-h-[70px]"
                  />
                </label>
                <div className="flex gap-2 mt-3">
                  <button type="submit" disabled={envoi || reouverture.trim() === ''} className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-40">
                    Rouvrir
                  </button>
                  <button type="button" onClick={() => setReouverture(null)} className="text-[11.5px] font-semibold text-text-dim px-4 py-1.5">
                    Annuler
                  </button>
                </div>
              </div>
            </form>
          </div>
        </PortailModale>
      )}
    </div>
  );
}

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
  choixEncours: Set<string>;
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
  const encoursCompte = new Map((detail.encours ?? []).map((e) => [e.id, e]));
  const rapprochee = (r: { ligneEcritureIds: string[]; encoursIds?: string[] }) =>
    r.ligneEcritureIds.length + (r.encoursIds ?? []).length > 0;
  const aComptabiliser = detail.releve.filter((r) => !rapprochee(r) && !parReleve.has(r.id));
  const ligneAssociee = detail.releve.find((r) => r.id === props.associationPour);
  const sommeChoix =
    [...props.choixEcritures].reduce((acc, lid) => {
      const l = lignesCompte.get(lid);
      return l ? acc + l.debit - l.credit : acc;
    }, 0) +
    [...props.choixEncours].reduce((acc, eid) => {
      const e = encoursCompte.get(eid);
      return e ? acc + e.debit - e.credit : acc;
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
              <button onClick={props.onValiderAssociation} disabled={props.envoi || props.choixEcritures.size + props.choixEncours.size === 0} className="bg-sel text-white px-3 py-[3px] font-semibold disabled:opacity-40">
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
                        {rapprochee(r) ? (
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

/**
 * L'OUVERTURE DU PREMIER RAPPROCHEMENT · le solde de départ lu sur le relevé,
 * les en-cours que la banque n'avait pas encore passés, et l'écart d'ouverture
 * que le serveur calcule (livre à la veille moins départ et en-cours). Rien ne
 * se déduit de l'à-nouveau · c'est un solde comptable, pas un solde de banque.
 */
function BlocOuverture(props: {
  detail: DetailRapprochement;
  modifiable: boolean;
  envoi: boolean;
  onDeclarer: (soldeDepart: number, dateDepart: string) => void;
  onAjouterEncours: (corps: { libelle: string; date: string; montant: number; sens: 'DEBIT' | 'CREDIT' }) => void;
  onRetirerEncours: (encoursId: string) => void;
}) {
  const { detail, modifiable } = props;
  const o = detail.ouverture ?? null;
  const [solde, setSolde] = useState(() =>
    detail.rapprochement.soldeDepartDeclare == null ? '' : String(detail.rapprochement.soldeDepartDeclare),
  );
  const [date, setDate] = useState(() => detail.rapprochement.dateDepart?.slice(0, 10) ?? '');
  const [libelle, setLibelle] = useState('');
  const [dateEncours, setDateEncours] = useState('');
  const [montantEncours, setMontantEncours] = useState('');
  const [sens, setSens] = useState<'DEBIT' | 'CREDIT'>('CREDIT');
  // Un champ vide n'est pas zéro · le bouton reste désactivé au lieu d'envoyer 0.
  const soldeLu = solde.trim() === '' ? NaN : Number(solde.replace(',', '.'));
  const montantLu = montantEncours.trim() === '' ? NaN : Number(montantEncours.replace(',', '.'));
  const declares = (detail.encours ?? []).filter((e) => e.declareIci);
  const ecartNul = o !== null && o.ecart !== null && Math.abs(o.ecart) < 0.005;

  return (
    <div className="max-w-[900px] mb-3 border border-border bg-surface shadow-posee">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-[12px] font-semibold">Ouverture</span>
        <Aide
          titre="Solde de départ et en-cours"
          texte="Premier rapprochement du compte · il part du solde que la banque portait à l'ouverture de la date de départ, lu sur le relevé (positif quand le compte est créditeur à la banque). Les lignes du compte datées avant cette date y sont comprises et ne se pointent pas. Les opérations du livre antérieures à cette date que la banque n'avait pas encore passées (chèque émis non présenté, remise non créditée) se déclarent en en-cours, dans le sens du compte, et se pointent quand la banque les passe · aucune écriture n'est créée. Le solde du compte au livre-journal à la veille doit égaler le solde de départ plus les en-cours, sans quoi la clôture est refusée."
          source="OmegaX · pratique d'Odoo, Xero, Sage 100 et Sage 50"
        />
      </div>

      {modifiable && (
        <div className="flex flex-wrap items-end gap-2 px-3 pt-2 text-[11.5px]">
          <label className="text-text-dim">
            Date de départ
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="block mt-0.5 border border-border px-1.5 py-[2px]" />
          </label>
          <label className="text-text-dim">
            Solde de départ
            <input
              type="number"
              step="0.01"
              value={solde}
              onChange={(e) => setSolde(e.target.value)}
              className="block mt-0.5 w-[140px] border border-border px-1.5 py-[2px] text-right"
            />
          </label>
          <button
            onClick={() => props.onDeclarer(soldeLu, date)}
            disabled={props.envoi || !date || !Number.isFinite(soldeLu)}
            className="border border-border px-2.5 py-[3px] disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-5 px-3 py-2 text-[11.5px]">
        <div>
          <div className="text-[11px] text-text-dim font-semibold">Livre à la veille</div>
          <div className="font-mono">{fmt(o?.soldeLivre)}</div>
        </div>
        <div>
          <div className="text-[11px] text-text-dim font-semibold">Solde de départ</div>
          <div className="font-mono">{fmt(o?.soldeDepart)}</div>
        </div>
        <div>
          <div className="text-[11px] text-text-dim font-semibold">En-cours</div>
          <div className="font-mono">{fmt(o?.encours)}</div>
        </div>
        <div>
          <div className="text-[11px] text-text-dim font-semibold">Écart d'ouverture</div>
          <div className={`font-mono font-bold ${ecartNul ? 'text-positive' : 'text-danger'}`}>{fmt(o?.ecart)}</div>
        </div>
        {o?.motif && <span className="text-warning">{o.motif}</span>}
      </div>

      {(declares.length > 0 || modifiable) && (
        <div className="overflow-x-auto px-3 pb-2">
          <table className="w-full min-w-[560px] text-[11.5px]">
            <thead>
              <tr>
                <th className="text-left px-2 py-1 w-[110px]">Date</th>
                <th className="text-left px-2 py-1">En-cours d'ouverture</th>
                <th className="text-right px-2 py-1 w-[100px]">Débit</th>
                <th className="text-right px-2 py-1 w-[100px]">Crédit</th>
                <th className="px-2 py-1 w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {declares.map((e) => (
                <tr key={e.id}>
                  <td className="px-2 py-1">{new Date(e.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-2 py-1 truncate max-w-[280px]">{e.libelle}</td>
                  <td className="px-2 py-1 text-right">{montantOuVide(e.debit)}</td>
                  <td className="px-2 py-1 text-right">{montantOuVide(e.credit)}</td>
                  <td className="px-2 py-1 text-right">
                    {modifiable && !e.pointee && (
                      <button onClick={() => props.onRetirerEncours(e.id)} disabled={props.envoi} className="text-text-dim underline">
                        retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {modifiable && (
                <tr>
                  <td className="px-2 py-1">
                    <input
                      type="date"
                      aria-label="Date de l'en-cours"
                      value={dateEncours}
                      onChange={(e) => setDateEncours(e.target.value)}
                      className="w-full border border-border px-1 py-[1px]"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      aria-label="Libellé de l'en-cours"
                      value={libelle}
                      onChange={(e) => setLibelle(e.target.value)}
                      maxLength={200}
                      className="w-full border border-border px-1.5 py-[1px]"
                    />
                  </td>
                  <td className="px-2 py-1" colSpan={2}>
                    <div className="flex gap-1">
                      <select
                        aria-label="Sens de l'en-cours"
                        value={sens}
                        onChange={(e) => setSens(e.target.value as 'DEBIT' | 'CREDIT')}
                        className="border border-border px-1 py-[1px]"
                      >
                        <option value="CREDIT">Sortie</option>
                        <option value="DEBIT">Entrée</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        aria-label="Montant de l'en-cours"
                        value={montantEncours}
                        onChange={(e) => setMontantEncours(e.target.value)}
                        className="w-full border border-border px-1.5 py-[1px] text-right"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => {
                        props.onAjouterEncours({ libelle, date: dateEncours, montant: montantLu, sens });
                        setLibelle('');
                        setMontantEncours('');
                      }}
                      disabled={props.envoi || !libelle.trim() || !dateEncours || !(montantLu > 0)}
                      className="border border-border px-2 py-[2px] disabled:opacity-40"
                    >
                      Ajouter
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
