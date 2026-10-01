import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Compte, Immobilisation, Journal } from '../lib/types';
import { Aide } from './chrome/Aide';

/**
 * LA REPRISE AU 799 DES SUBVENTIONS EN NATURE, dans la fenêtre
 * Immobilisations · le serveur propose et rejoue (`reprise-subvention.service.ts`),
 * l'écran ne calcule rien. Rien n'est passé sans clic (décision de Manasse).
 */
interface BienSubventionne {
  id: string;
  designation?: string;
  subvention: number;
  cumulRepris: number;
  montant: number;
  nature: 'EXERCICE' | 'SORTIE';
  motif: string | null;
  reserve?: string | null;
}

/** Lot 5 · une subvention en numéraire rattachée à un bien (`subvention-rattachee.service.ts`). */
interface SubventionRattachee {
  id: string;
  montant: number;
  dateOctroi: string;
  reference: string;
  dureeInalienabiliteAns: number | null;
  motifSansVentilation: string | null;
  immobilisation: { id: string; numeroInventaire: string | null; designation: string };
  compteSubvention: { id: string; numero: string; intitule: string };
  reductions: { id: string; nature: 'REMBOURSEMENT' | 'NON_VERSEE'; montant: number; motif: string }[];
}
interface ListeRattachees {
  subventions: SubventionRattachee[];
  tronque: boolean;
  methodeDepreciation: 'VNC_MINOREE_DES_SUBVENTIONS' | 'VNC_ENTIERE' | null;
  contrepartieRemboursementProposee: string | null;
}
/** Les octrois inscrits au 14 choisi (`GET /immobilisations/subventions-rattachees/octrois`). */
interface OctroisDuCompte {
  octrois: { ligneId: string; date: string; numeroPiece: string | null; reference: string | null; libelle: string; montant: number }[];
  tronque: boolean;
  credite: number;
  dejaRattache: number;
  resteARattacher: number;
  contrepartiesProposees: { id: string; numero: string; intitule: string }[];
  autresTiersAdmis: boolean;
}
const LIBELLES_METHODE = {
  VNC_MINOREE_DES_SUBVENTIONS: 'Valeur nette minorée des subventions non reprises',
  VNC_ENTIERE: 'Valeur nette entière, subvention reprise à hauteur de la dépréciation',
} as const;

export function RepriseSubventionImmobilisations({
  exerciceId,
  journaux,
  biens = [],
  comptes = [],
}: {
  exerciceId: string | undefined;
  journaux: Journal[];
  biens?: Immobilisation[];
  comptes?: Compte[];
}) {
  const { peutEcrire, estAdmin } = useAuth();
  const [rattachees, setRattachees] = useState<ListeRattachees | null>(null);
  const [formRattacher, setFormRattacher] = useState(false);
  const [reductionPour, setReductionPour] = useState<string | null>(null);
  const [liste, setListe] = useState<{ biens: BienSubventionne[]; tronque: boolean } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const journalOd = journaux.find((j) => j.code === 'OD') ?? journaux[0];

  const charger = useCallback(async () => {
    if (!exerciceId) return;
    setErreur(null);
    try {
      const [l, r] = await Promise.all([
        api.get<{ biens: BienSubventionne[]; tronque: boolean }>(`/immobilisations/reprises-subvention?exerciceId=${exerciceId}`),
        api.get<ListeRattachees>('/immobilisations/subventions-rattachees'),
      ]);
      setListe(l);
      setRattachees(r);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Reprises des fonds illisibles');
    }
  }, [exerciceId]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const passer = async (id: string) => {
    if (!exerciceId || !journalOd) return;
    setEnvoi(id);
    setErreur(null);
    try {
      await api.post(`/immobilisations/${id}/reprise-subvention`, { exerciceId, journalId: journalOd.id });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Reprise refusée');
    } finally {
      setEnvoi(null);
    }
  };

  const declarerMethode = async (methode: string) => {
    setErreur(null);
    try {
      await api.put('/immobilisations/subventions-rattachees-methode', { methode });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Méthode refusée');
    }
  };

  // Rien à reprendre ni à rattacher, et personne pour rattacher · le cadre
  // ne s'affiche pas (listes LUES).
  if (!erreur && (liste === null || rattachees === null)) return null;
  if (!erreur && liste!.biens.length === 0 && rattachees!.subventions.length === 0 && !peutEcrire) return null;

  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3">
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Reprises des fonds liés aux biens
        <Aide
          titre="Reprise des fonds"
          texte="Subvention d'investissement (14), reçue en nature ou en numéraire rattachée au bien · reprise au 799 au rythme de la dotation aux amortissements ; pour un bien non amortissable, sur la durée d'inaliénabilité ou, à défaut, par dixièmes ; à la cession, pour le solde. Au SYCEBNL seulement · dons et legs à conserver (167) repris au 7923 pour la quote-part (167 du bien ÷ sa valeur) de la dotation aux amortissements et aux dépréciations de l'exercice ; donation temporaire d'usufruit (171) reprise au 7961 dans la même quotité que l'amortissement ; dons et legs destinés à la vente (172) repris pour solde au 7962 à la cession. Seules les reprises passées ici sont comptées."
          source="Fiche du compte 14 (AUDCIF Titre VII · SYCEBNL Partie 2 ch. 3) · AUDCIF Titre VIII ch. 17 § 3.2 · SYCEBNL Partie 3 ch. 2 § 1.2.2, § 2.2.3 et § 2.3 · Guide d'application, Applications 5 à 7"
        />
      </div>
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      <div className="px-3.5 py-1.5 border-b border-border flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="font-semibold">Méthode de dépréciation des biens subventionnés</span>
        {rattachees?.methodeDepreciation ? (
          <span>{LIBELLES_METHODE[rattachees.methodeDepreciation]}</span>
        ) : estAdmin ? (
          <select
            aria-label="Méthode de dépréciation des biens subventionnés"
            defaultValue=""
            onChange={(e) => e.target.value && void declarerMethode(e.target.value)}
            className="border border-border px-1.5 py-0.5 text-[11.5px]"
          >
            <option value="">Non déclarée</option>
            <option value="VNC_MINOREE_DES_SUBVENTIONS">{LIBELLES_METHODE.VNC_MINOREE_DES_SUBVENTIONS}</option>
            <option value="VNC_ENTIERE">{LIBELLES_METHODE.VNC_ENTIERE}</option>
          </select>
        ) : (
          <span className="text-warning">Non déclarée</span>
        )}
        <Aide
          titre="Dépréciation d'un bien subventionné"
          texte="Deux méthodes au même effet sur le résultat · comparer la valeur actuelle à la valeur nette minorée des subventions non encore reprises (le rythme de reprise n'est pas modifié), ou à la valeur nette entière, la subvention restant en capitaux propres étant alors reprise à hauteur de la dépréciation. La méthode suivie est dite aux Notes annexes ; elle se déclare une fois pour le dossier."
          source="AUDCIF Titre VIII ch. 17 § 4.6"
        />
      </div>
      <SubventionsRattachees
        liste={rattachees}
        biens={biens}
        comptes={comptes}
        exerciceId={exerciceId}
        journalOd={journalOd}
        peutEcrire={peutEcrire}
        formOuvert={formRattacher}
        setFormOuvert={setFormRattacher}
        reductionPour={reductionPour}
        setReductionPour={setReductionPour}
        onErreur={setErreur}
        onChange={charger}
      />
      {liste?.tronque && <div className="px-3.5 py-1.5 text-[11.5px] text-warning">Liste limitée aux 200 premiers biens.</div>}
      <div className="grid grid-cols-[1.4fr_120px_120px_130px_1.2fr] gap-2.5 px-3.5 py-1 border-b border-border text-[11px] font-bold text-text-dim">
        <span>Bien</span>
        <span className="text-right">Fonds</span>
        <span className="text-right">Déjà reprise</span>
        <span className="text-right">Reprise proposée</span>
        <span />
      </div>
      {(liste?.biens ?? []).map((b) => (
        <div key={b.id} className="grid grid-cols-[1.4fr_120px_120px_130px_1.2fr] gap-2.5 px-3.5 py-1.5 items-center text-[11.5px] border-b border-border last:border-0">
          <span>{b.designation}</span>
          <span className="text-right">{montant(b.subvention)}</span>
          <span className="text-right">{montant(b.cumulRepris)}</span>
          <span className="text-right">{b.montant > 0 ? montant(b.montant) : '·'}</span>
          <span>
            {b.reserve && <span className="block text-warning">{b.reserve}</span>}
            {b.motif ? (
              <span className="text-text-dim">{b.motif}</span>
            ) : (
              peutEcrire && (
                <button
                  type="button"
                  disabled={envoi === b.id || !journalOd}
                  onClick={() => void passer(b.id)}
                  className="bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5 disabled:opacity-50"
                >
                  {envoi === b.id ? '…' : b.nature === 'SORTIE' ? 'Reprendre le solde' : 'Passer la reprise'}
                </button>
              )
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * LES SUBVENTIONS EN NUMÉRAIRE RATTACHÉES (lot 5) · liste, rattachement avec
 * ventilation proposée par le serveur (§ 4.4), remboursement (§ 4.3.1) et
 * subvention non versée (§ 4.7). L'écran ne calcule rien.
 */
function SubventionsRattachees(p: {
  liste: ListeRattachees | null;
  biens: Immobilisation[];
  comptes: Compte[];
  exerciceId: string | undefined;
  journalOd: Journal | undefined;
  peutEcrire: boolean;
  formOuvert: boolean;
  setFormOuvert: (v: boolean) => void;
  reductionPour: string | null;
  setReductionPour: (v: string | null) => void;
  onErreur: (m: string | null) => void;
  onChange: () => Promise<void>;
}) {
  const comptes14 = p.comptes.filter((c) => c.numero.startsWith('14'));
  const comptesTiers = p.comptes.filter((c) => c.numero.startsWith('4'));
  const principaux = p.biens.filter((b) => b.statut === 'EN_SERVICE' && !b.immobilisationPrincipaleId);
  const [compte, setCompte] = useState('');
  const [bien, setBien] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [duree, setDuree] = useState('');
  const [motifStructure, setMotifStructure] = useState('');
  const [lignes, setLignes] = useState<{ id: string; designation: string; montant: string }[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [red, setRed] = useState({ nature: 'REMBOURSEMENT', montant: '', date: '', contrepartie: '', motif: '' });
  // LE CHOIX DU 14 PROPOSE CE QUI S'Y TROUVE · les octrois inscrits, le reste à
  // rattacher et, s'il n'y a rien, l'écriture d'octroi elle-même (fiche du
  // compte 14). null tant que rien n'est lu · « aucun octroi » ne se dit que
  // sur une liste lue.
  const [octrois, setOctrois] = useState<OctroisDuCompte | null>(null);
  const [erreurOctrois, setErreurOctrois] = useState<string | null>(null);
  const [octroiChoisi, setOctroiChoisi] = useState('');
  const [nouvelOctroi, setNouvelOctroi] = useState(false);
  const [oct, setOct] = useState({ contrepartie: '', montant: '', date: '', reference: '' });

  const lireOctrois = useCallback(async (compteId: string) => {
    setOctrois(null);
    setErreurOctrois(null);
    setOctroiChoisi('');
    if (!compteId) return;
    try {
      const o = await api.get<OctroisDuCompte>(`/immobilisations/subventions-rattachees/octrois?compteSubventionId=${compteId}`);
      setOctrois(o);
      setNouvelOctroi(o.octrois.length === 0);
      setOct((v) => ({ ...v, contrepartie: v.contrepartie || o.contrepartiesProposees[0]?.id || '' }));
    } catch (err) {
      setErreurOctrois(err instanceof ApiError ? err.message : 'Octrois illisibles');
    }
  }, []);

  const choisirOctroi = (ligneId: string) => {
    setOctroiChoisi(ligneId);
    const o = octrois?.octrois.find((x) => x.ligneId === ligneId);
    if (!o || !octrois) return;
    // Le montant proposé ne dépasse pas ce qui reste à rattacher sur le compte.
    setTotal(String(Math.min(o.montant, octrois.resteARattacher)));
    setDate(o.date.slice(0, 10));
    setReference(o.reference || o.libelle);
    setLignes(null);
  };

  const enregistrerOctroi = async () => {
    if (!p.exerciceId || !p.journalOd) return;
    setEnvoi(true);
    p.onErreur(null);
    try {
      await api.post('/immobilisations/subventions-rattachees/octrois', {
        compteSubventionId: compte,
        compteContrepartieId: oct.contrepartie,
        exerciceId: p.exerciceId,
        journalId: p.journalOd.id,
        date: oct.date,
        montant: Number(oct.montant),
        reference: oct.reference,
      });
      setTotal(oct.montant);
      setDate(oct.date);
      setReference(oct.reference);
      setNouvelOctroi(false);
      await lireOctrois(compte);
    } catch (err) {
      p.onErreur(err instanceof ApiError ? err.message : 'Octroi refusé');
    } finally {
      setEnvoi(false);
    }
  };

  const proposer = async () => {
    p.onErreur(null);
    if (!bien || !(Number(total) > 0)) return;
    try {
      const v = await api.get<{ lignes: { id: string; designation: string; montant: number }[]; aDesComposants: boolean }>(
        `/immobilisations/${bien}/ventilation-subvention?montant=${Number(total)}`,
      );
      setLignes(v.lignes.map((l) => ({ id: l.id, designation: l.designation, montant: String(l.montant) })));
    } catch (err) {
      p.onErreur(err instanceof ApiError ? err.message : 'Ventilation illisible');
    }
  };

  const rattacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lignes) return;
    setEnvoi(true);
    p.onErreur(null);
    try {
      await api.post('/immobilisations/subventions-rattachees', {
        compteSubventionId: compte,
        dateOctroi: date,
        reference,
        ...(duree ? { dureeInalienabiliteAns: Number(duree) } : {}),
        ...(motifStructure.trim() ? { motifSansVentilation: motifStructure } : {}),
        lignes: lignes.filter((l) => Number(l.montant) > 0).map((l) => ({ immobilisationId: l.id, montant: Number(l.montant) })),
      });
      p.setFormOuvert(false);
      setLignes(null);
      await p.onChange();
    } catch (err) {
      p.onErreur(err instanceof ApiError ? err.message : 'Rattachement refusé');
    } finally {
      setEnvoi(false);
    }
  };

  const reduire = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!p.exerciceId || !p.journalOd) return;
    setEnvoi(true);
    p.onErreur(null);
    try {
      await api.post(`/immobilisations/subventions-rattachees/${id}/reductions`, {
        nature: red.nature,
        exerciceId: p.exerciceId,
        journalId: p.journalOd.id,
        date: red.date,
        montant: Number(red.montant),
        compteContrepartieId: red.contrepartie,
        motif: red.motif,
      });
      p.setReductionPour(null);
      await p.onChange();
    } catch (err) {
      p.onErreur(err instanceof ApiError ? err.message : 'Réduction refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const ouvrirReduction = (id: string) => {
    const propose = p.liste?.contrepartieRemboursementProposee;
    setRed({ nature: 'REMBOURSEMENT', montant: '', date: '', contrepartie: comptesTiers.find((c) => c.numero === propose)?.id ?? '', motif: '' });
    p.setReductionPour(id);
  };

  const champ = 'border border-border px-1.5 py-0.5 text-[11.5px]';
  return (
    <div className="border-b border-border">
      <div className="px-3.5 py-1.5 flex items-center gap-2 text-[11.5px]">
        <span className="font-semibold">Subventions en numéraire rattachées</span>
        <Aide
          titre="Subvention rattachée"
          texte="Le 14 crédité à la notification n'est lié à aucun bien · le rattachement déclare le bien financé et le montant, pièce à l'appui. Un bien à composants voit la subvention ventilée entre eux au prorata, sauf motif écrit (non significative, ventilation impossible). Remboursable, elle réduit le 14 ; non versée, la créance passe au 6515 et le 14 est repris au 799. La reprise suit ensuite le solde non repris sur ce qui reste à amortir."
          source="AUDCIF Titre VIII ch. 17 § 3.2, § 4.3.1, § 4.4, § 4.7 · SYCEBNL Partie 3 ch. 1 § 2.5 · Guide d'application, Application 3"
        />
        {p.peutEcrire && !p.formOuvert && (
          <button type="button" onClick={() => p.setFormOuvert(true)} className="ml-auto bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5">
            Rattacher une subvention
          </button>
        )}
      </div>
      {p.peutEcrire && p.formOuvert && (
        <form onSubmit={(e) => void rattacher(e)} className="px-3.5 py-2 flex flex-wrap items-end gap-2 text-[11.5px] bg-chrome">
          <label className="flex flex-col">
            Compte de subvention
            <select
              required
              value={compte}
              onChange={(e) => {
                setCompte(e.target.value);
                void lireOctrois(e.target.value);
              }}
              className={champ}
            >
              <option value="">·</option>
              {comptes14.map((c) => (
                <option key={c.id} value={c.id}>{c.numero} {c.intitule}</option>
              ))}
            </select>
          </label>
          {compte && (
            <div className="basis-full flex flex-col gap-1" data-octrois-du-compte>
              {erreurOctrois && <span className="text-danger">{erreurOctrois}</span>}
              {!erreurOctrois && octrois === null && <span className="text-text-dim">…</span>}
              {octrois && octrois.octrois.length > 0 && (
                <label className="flex items-center gap-2">
                  <span>Octroi inscrit</span>
                  <select value={octroiChoisi} onChange={(e) => choisirOctroi(e.target.value)} className={`${champ} w-[28rem]`}>
                    <option value="">·</option>
                    {octrois.octrois.map((o) => (
                      <option key={o.ligneId} value={o.ligneId}>
                        {new Date(o.date).toLocaleDateString('fr-FR')} · {o.numeroPiece ?? 's.n.'} · {o.libelle} · {montant(o.montant)}
                      </option>
                    ))}
                  </select>
                  <span className={octrois.resteARattacher > 0 ? 'text-text-dim' : 'text-warning'}>
                    Reste à rattacher · {montant(octrois.resteARattacher)}
                  </span>
                  {!nouvelOctroi && (
                    <button type="button" onClick={() => setNouvelOctroi(true)} className="text-[11px] font-semibold text-sel">
                      Enregistrer un autre octroi
                    </button>
                  )}
                </label>
              )}
              {octrois && octrois.octrois.length === 0 && (
                <span className="text-warning">Aucun octroi inscrit à ce compte · enregistrez d'abord l'octroi de la subvention.</span>
              )}
              {octrois && nouvelOctroi && (
                <div className="flex flex-wrap items-end gap-2" data-nouvel-octroi>
                  <label className="flex flex-col">
                    <span className="flex items-center gap-1">
                      Subvention à recevoir
                      <Aide
                        titre="Octroi de la subvention"
                        texte="L'octroi crédite le compte 14 du montant obtenu, par le débit de la subvention à recevoir · 4731 au SYCEBNL ; au SYSCOHADA, un compte de tiers tel que 4494 (État) ou 4582 (organismes internationaux). L'encaissement solde ensuite ce compte par la banque. Une subvention en nature s'enregistre avec le bien, par « Nouvelle immobilisation »."
                        source="Fiche du compte 14 (SYCEBNL Partie 2 ch. 3 · AUDCIF Titre VII) · Guide d'application, Application 3"
                      />
                    </span>
                    <select required value={oct.contrepartie} onChange={(e) => setOct({ ...oct, contrepartie: e.target.value })} className={champ}>
                      <option value="">·</option>
                      {octrois.contrepartiesProposees.map((c) => (
                        <option key={c.id} value={c.id}>{c.numero} {c.intitule}</option>
                      ))}
                      {(octrois.autresTiersAdmis ? comptesTiers : [])
                        .filter((c) => !c.numero.startsWith('473') && !octrois.contrepartiesProposees.some((x) => x.id === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.numero} {c.intitule}</option>
                        ))}
                    </select>
                  </label>
                  <label className="flex flex-col">
                    Montant octroyé
                    <input type="number" min="0.01" step="0.01" value={oct.montant} onChange={(e) => setOct({ ...oct, montant: e.target.value })} className={`${champ} w-32`} />
                  </label>
                  <label className="flex flex-col">
                    Date d'octroi
                    <input type="date" value={oct.date} onChange={(e) => setOct({ ...oct, date: e.target.value })} className={champ} />
                  </label>
                  <label className="flex flex-col">
                    Acte d'octroi
                    <input value={oct.reference} onChange={(e) => setOct({ ...oct, reference: e.target.value })} className={`${champ} w-44`} />
                  </label>
                  <button
                    type="button"
                    disabled={envoi || !p.exerciceId || !p.journalOd || !oct.contrepartie || !(Number(oct.montant) > 0) || !oct.date || !oct.reference.trim()}
                    onClick={() => void enregistrerOctroi()}
                    className="bg-sel text-white text-[11px] font-semibold px-2.5 py-1 disabled:opacity-50"
                  >
                    {envoi ? '…' : "Enregistrer l'octroi"}
                  </button>
                  {!p.journalOd && <span className="text-warning">Aucun journal d'opérations diverses · l'octroi ne peut pas être passé.</span>}
                </div>
              )}
            </div>
          )}
          <label className="flex flex-col">
            Bien financé
            <select required value={bien} onChange={(e) => { setBien(e.target.value); setLignes(null); }} className={champ}>
              <option value="">·</option>
              {principaux.map((b) => (
                <option key={b.id} value={b.id}>{b.designation}</option>
              ))}
            </select>
            {principaux.length === 0 && (
              <span className="text-warning">Aucun bien en service à financer · créez d'abord le bien (Nouvelle immobilisation).</span>
            )}
          </label>
          <label className="flex flex-col">
            Montant
            <input required type="number" min="0.01" step="0.01" value={total} onChange={(e) => { setTotal(e.target.value); setLignes(null); }} className={`${champ} w-32`} />
          </label>
          <label className="flex flex-col">
            Date d'octroi
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ} />
          </label>
          <label className="flex flex-col">
            Acte d'octroi
            <input required value={reference} onChange={(e) => setReference(e.target.value)} className={`${champ} w-44`} />
          </label>
          <label className="flex flex-col">
            Inaliénabilité (ans)
            <input type="number" min="1" max="100" value={duree} onChange={(e) => setDuree(e.target.value)} className={`${champ} w-20`} />
          </label>
          {!lignes && (
            <button type="button" onClick={() => void proposer()} className="bg-sel text-white text-[11px] font-semibold px-2.5 py-1">
              Proposer la ventilation
            </button>
          )}
          {lignes && (
            <div className="basis-full flex flex-col gap-1">
              {lignes.map((l, i) => (
                <label key={l.id} className="flex items-center gap-2">
                  <span className="w-64">{l.designation}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`Montant rattaché à ${l.designation}`}
                    value={l.montant}
                    onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))}
                    className={`${champ} w-32`}
                  />
                </label>
              ))}
              {lignes.length > 1 && (
                <label className="flex items-center gap-2">
                  <span className="w-64">Motif si tout reste sur la structure</span>
                  <input value={motifStructure} onChange={(e) => setMotifStructure(e.target.value)} className={`${champ} w-80`} />
                </label>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={envoi} className="bg-sel text-white text-[11px] font-semibold px-2.5 py-1 disabled:opacity-50">
                  {envoi ? '…' : 'Rattacher'}
                </button>
                <button type="button" onClick={() => { p.setFormOuvert(false); setLignes(null); setCompte(''); setOctrois(null); setNouvelOctroi(false); }} className="text-[11px] font-semibold text-text-dim px-2.5 py-1">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </form>
      )}
      {p.liste?.tronque && <div className="px-3.5 py-1 text-[11.5px] text-warning">Liste limitée aux 500 premiers rattachements.</div>}
      {(p.liste?.subventions ?? []).map((s) => {
        const reduit = s.reductions.reduce((t, r) => t + Number(r.montant), 0);
        return (
          <div key={s.id} className="px-3.5 py-1 border-t border-border text-[11.5px]">
            <div className="grid grid-cols-[1.4fr_1fr_120px_120px_1fr] gap-2.5 items-center">
              <span>{s.immobilisation.designation}</span>
              <span>{s.compteSubvention.numero} · {s.reference}</span>
              <span className="text-right">{montant(Number(s.montant))}</span>
              <span className="text-right">{reduit > 0 ? `réduite de ${montant(reduit)}` : '·'}</span>
              <span>
                {p.peutEcrire && p.reductionPour !== s.id && (
                  <button type="button" onClick={() => ouvrirReduction(s.id)} className="text-[11px] font-semibold text-sel">
                    Remboursement ou non-versement
                  </button>
                )}
              </span>
            </div>
            {s.motifSansVentilation && <div className="text-text-dim">Laissée sur la structure · {s.motifSansVentilation}</div>}
            {p.peutEcrire && p.reductionPour === s.id && (
              <form onSubmit={(e) => void reduire(e, s.id)} className="mt-1 flex flex-wrap items-end gap-2 bg-chrome px-2 py-1.5">
                <label className="flex flex-col">
                  Nature
                  <select value={red.nature} onChange={(e) => setRed({ ...red, nature: e.target.value })} className={champ}>
                    <option value="REMBOURSEMENT">Subvention remboursable</option>
                    <option value="NON_VERSEE">Subvention non versée</option>
                  </select>
                </label>
                <label className="flex flex-col">
                  Montant
                  <input required type="number" min="0.01" step="0.01" value={red.montant} onChange={(e) => setRed({ ...red, montant: e.target.value })} className={`${champ} w-32`} />
                </label>
                <label className="flex flex-col">
                  Date
                  <input required type="date" value={red.date} onChange={(e) => setRed({ ...red, date: e.target.value })} className={champ} />
                </label>
                <label className="flex flex-col">
                  {red.nature === 'REMBOURSEMENT' ? 'Tiers concédant' : 'Créance annulée'}
                  <select required value={red.contrepartie} onChange={(e) => setRed({ ...red, contrepartie: e.target.value })} className={champ}>
                    <option value="">·</option>
                    {comptesTiers.map((c) => (
                      <option key={c.id} value={c.id}>{c.numero} {c.intitule}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col">
                  Motif
                  <input required value={red.motif} onChange={(e) => setRed({ ...red, motif: e.target.value })} className={`${champ} w-56`} />
                </label>
                <button type="submit" disabled={envoi || !p.journalOd} className="bg-sel text-white text-[11px] font-semibold px-2.5 py-1 disabled:opacity-50">
                  {envoi ? '…' : 'Passer'}
                </button>
                <button type="button" onClick={() => p.setReductionPour(null)} className="text-[11px] font-semibold text-text-dim px-2.5 py-1">
                  Annuler
                </button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
