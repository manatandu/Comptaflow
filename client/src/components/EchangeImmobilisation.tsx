import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Compte, Journal } from '../lib/types';
import { comptesParDivision, type CompteDuBien, type ContrepartieAdmise } from '../lib/compte-du-bien';
import { Aide } from './chrome/Aide';

/**
 * L'ÉCHANGE D'UN BIEN · le serveur enchaîne la vente de l'ancien au prix de
 * reprise et l'acquisition du nouveau à « prix de reprise + soulte » (Guide
 * d'application SYSCOHADA, Partie 1 ch. 5 § 4.5 ; `ImmobilisationService.echanger`).
 * L'écran ne compose que la saisie ; la valeur d'entrée affichée est celle
 * que le serveur retiendra.
 */
const champ = 'mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal';
const etiquette = 'text-[11.5px] font-semibold text-text-dim';

export function EchangeImmobilisation({
  immobilisationId,
  designationAncien,
  comptesBien,
  comptesDetail,
  exerciceId,
  journal,
  onFait,
  onAnnuler,
  syscohada,
}: {
  immobilisationId: string;
  designationAncien: string;
  comptesBien: CompteDuBien[];
  comptesDetail: Compte[];
  exerciceId: string | undefined;
  journal: Journal | undefined;
  onFait: () => void;
  onAnnuler: () => void;
  /** La cession courante (654 / 754) n'existe qu'au SYSCOHADA · le serveur la refuse ailleurs. */
  syscohada: boolean;
}) {
  const { peutEcrire } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reprise, setReprise] = useState('');
  const [soulte, setSoulte] = useState('0');
  const [compteBienId, setCompteBienId] = useState('');
  const [designation, setDesignation] = useState('');
  const [duree, setDuree] = useState('');
  const [fournisseurId, setFournisseurId] = useState('');
  const [creanceId, setCreanceId] = useState('');
  const [courante, setCourante] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<ContrepartieAdmise[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Les fournisseurs d'investissement admis pour le compte du bien reçu · la
  // liste fermée du serveur, mode « achat à crédit » seul (481, 404).
  useEffect(() => {
    setFournisseurs([]);
    setFournisseurId('');
    if (!compteBienId) return;
    let vivant = true;
    api
      .get<ContrepartieAdmise[]>(`/immobilisations/contreparties-acquisition?compteImmobilisationId=${compteBienId}`)
      .then((c) => vivant && setFournisseurs(c.filter((x) => x.mode === 'ACHAT_A_CREDIT')))
      .catch((err) => {
        if (!vivant) return;
        setFournisseurs([]);
        setErreur(err instanceof ApiError ? err.message : "Fournisseurs d'investissement illisibles");
      });
    return () => {
      vivant = false;
    };
  }, [compteBienId]);

  const racineCreance = courante ? '414' : '485';
  const creances = comptesDetail.filter((c) => c.numero.startsWith(racineCreance));
  const valeur = Math.round(((Number(reprise) || 0) + (Number(soulte) || 0)) * 100) / 100;

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceId || !journal) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/immobilisations/${immobilisationId}/echange`, {
        dateEchange: date,
        exerciceId,
        journalId: journal.id,
        prixDeReprise: Number(reprise),
        soulte: Number(soulte || 0),
        compteCreanceId: creanceId,
        compteFournisseurId: fournisseurId,
        cessionCourante: courante || undefined,
        compteImmobilisationId: compteBienId,
        designation,
        dureeAmortissementAns: duree ? Number(duree) : undefined,
      });
      onFait();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Échange refusé');
    } finally {
      setEnvoi(false);
    }
  };

  if (!peutEcrire) return null;
  return (
    <form onSubmit={(e) => void envoyer(e)} className="bg-chrome border-b border-border px-4 py-3">
      <div className="font-mono text-[11.5px] font-semibold text-text-dim mb-2 flex items-center gap-1.5">
        Échange de « {designationAncien} »
        <Aide
          titre="Échange"
          texte="Le bien reçu entre à sa valeur actuelle, ou à celle du bien donné si elle ne peut être estimée de façon fiable. L'ancien bien est vendu au prix de reprise (créance au 485, produit au 82, après la dotation complémentaire) et le nouveau acheté à prix de reprise plus soulte (fournisseur d'investissement au 481). Une soulte reçue se retranche. Le règlement entre le 481, le 485 et la trésorerie reste à saisir. Un immeuble de placement reçu en échange suit une autre règle et ne passe pas ici."
          source="AUDCIF art. 36 et Titre VII, classe 2 · SYCEBNL Partie 2 ch. 3, classe 2 · Guide d'application SYSCOHADA, Partie 1 ch. 5 § 4.5"
        />
      </div>
      <div className="grid grid-cols-4 gap-3 items-end">
        <label className={etiquette}>
          Date de l'échange
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          Prix de reprise
          <input required type="number" step="0.01" min={0} value={reprise} onChange={(e) => setReprise(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={etiquette}>
          Soulte versée (négative si reçue)
          <input required type="number" step="0.01" value={soulte} onChange={(e) => setSoulte(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <span className="text-[11.5px] pb-2">Valeur d'entrée {montant(valeur)}</span>
        <label className={`${etiquette} col-span-2`}>
          Compte du bien reçu
          <select required value={compteBienId} onChange={(e) => setCompteBienId(e.target.value)} className={champ}>
            <option value="" />
            {comptesParDivision(comptesBien.filter((c) => !c.locationAcquisition)).map((g) => (
              <optgroup key={g.numero} label={`${g.numero} · ${g.intitule}`}>
                {g.comptes.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          Désignation du bien reçu
          <input required value={designation} onChange={(e) => setDesignation(e.target.value)} className={champ} />
        </label>
        <label className={etiquette}>
          Durée (années)
          <input type="number" min={1} value={duree} onChange={(e) => setDuree(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={`${etiquette} col-span-2`}>
          Fournisseur d'investissement
          <select required disabled={!compteBienId} value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className={champ}>
            <option value="" />
            {fournisseurs.map((c) => (
              <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
            ))}
          </select>
        </label>
        <label className={etiquette}>
          Créance de reprise
          <select required value={creanceId} onChange={(e) => setCreanceId(e.target.value)} className={champ}>
            <option value="" />
            {creances.map((c) => (
              <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
            ))}
          </select>
        </label>
        {syscohada && (
        <label className={`${etiquette} flex items-center gap-1.5 pb-2`}>
          <input
            type="checkbox"
            checked={courante}
            onChange={(e) => {
              setCourante(e.target.checked);
              setCreanceId('');
            }}
          />
          Cession courante
        </label>
        )}
      </div>
      {erreur && <div className="text-[11.5px] text-danger mt-2">{erreur}</div>}
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={envoi || !journal} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
          {envoi ? '…' : "Enregistrer l'échange"}
        </button>
        <button type="button" onClick={onAnnuler} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">
          Annuler
        </button>
      </div>
    </form>
  );
}
