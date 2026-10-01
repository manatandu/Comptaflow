import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Compte, Journal } from '../lib/types';
import { Aide } from './chrome/Aide';

/**
 * LE REMPLACEMENT IMPRÉVU D'UNE PARTIE NON IDENTIFIÉE À L'ORIGINE (lot 8,
 * décision D-19) · la partie remplacée se détache de la structure à sa valeur
 * d'origine ESTIMÉE (§ 3.1.2), puis se renouvelle comme un composant (§ 4.1).
 * Le serveur calcule la part des amortissements et refuse ce qui ne se
 * répartit pas d'office (`remplacerPartieNonIdentifiee`).
 */
const METHODES = [
  { cle: 'COUT_ACTUEL_A_NEUF', libelle: 'Coût actuel à neuf, données techniques' },
  { cle: 'POURCENTAGE_IMMOBILISATIONS_RECENTES', libelle: 'Pourcentage sur immobilisations récentes' },
  { cle: 'INFORMATIONS_FOURNISSEURS', libelle: 'Informations des fournisseurs' },
  { cle: 'DEPENSES_DE_RENOUVELLEMENT', libelle: 'Dépense de renouvellement' },
] as const;

export function RemplacementImprevu({
  structure,
  exerciceId,
  journaux,
  comptes,
  onFait,
  onFermer,
}: {
  structure: { id: string; designation: string };
  exerciceId: string | undefined;
  journaux: Journal[];
  comptes: Compte[];
  onFait: (message: string) => void;
  onFermer: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [partie, setPartie] = useState('');
  const [valeur, setValeur] = useState('');
  const [methode, setMethode] = useState<(typeof METHODES)[number]['cle']>('COUT_ACTUEL_A_NEUF');
  const [source, setSource] = useState('');
  const [justification, setJustification] = useState('');
  const [designation, setDesignation] = useState('');
  const [cout, setCout] = useState('');
  const [duree, setDuree] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contrepartie, setContrepartie] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const od = journaux.find((j) => j.code === 'OD') ?? journaux[0];

  if (!peutEcrire) return null;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciceId || !od) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ avertissement: string | null }>(`/immobilisations/${structure.id}/remplacement-imprevu`, {
        exerciceId,
        journalId: od.id,
        dateRenouvellement: date,
        designation,
        coutRenouvellement: Number(cout),
        dureeAmortissementAns: Number(duree),
        compteContrepartieId: contrepartie,
        designationPartie: partie,
        valeurOrigineEstimee: Number(valeur),
        methodeEstimation: methode,
        sourceEstimation: source,
        justificationDecomposition: justification,
      });
      onFait(r.avertissement ?? 'Partie remplacée sortie de la structure, nouvel élément porté en composant.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Remplacement refusé');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]';
  const libelle = 'text-[11.5px] font-semibold text-text-dim';
  return (
    <form onSubmit={(e) => void envoyer(e)} className="bg-chrome border-b border-border px-4 py-3">
      {erreur && <div className="mb-2 text-[11.5px] text-danger">{erreur}</div>}
      <div className="grid grid-cols-4 gap-3 items-end">
        <label className={libelle}>
          <span className="flex items-center gap-1">
            Partie remplacée
            <Aide
              titre="Remplacement imprévu"
              texte={`Aucun composant n'avait été identifié dans « ${structure.designation} » · la décomposition se revoit. La partie remplacée sort de la structure à sa valeur d'origine estimée, avec la part des amortissements qui lui revient, et le nouvel élément entre comme composant avec son propre plan. Estimée sur la dépense de renouvellement, la partie risque d'être surévaluée.`}
              source="AUDCIF Titre VIII ch. 4 § 3.1.2 et § 4.2"
            />
          </span>
          <input required value={partie} onChange={(e) => setPartie(e.target.value)} className={champ} />
        </label>
        <label className={libelle}>
          Valeur d'origine estimée
          <input required type="number" step="0.01" min={0.01} value={valeur} onChange={(e) => setValeur(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          Méthode d'estimation
          <select value={methode} onChange={(e) => setMethode(e.target.value as typeof methode)} className={champ}>
            {METHODES.map((m) => (
              <option key={m.cle} value={m.cle}>{m.libelle}</option>
            ))}
          </select>
        </label>
        <label className={libelle}>
          Source
          <input required value={source} onChange={(e) => setSource(e.target.value)} className={champ} />
        </label>
        <label className={`${libelle} col-span-4`}>
          Décomposition revue
          <input required value={justification} onChange={(e) => setJustification(e.target.value)} className={champ} />
        </label>
        <label className={libelle}>
          Nouvel élément
          <input required value={designation} onChange={(e) => setDesignation(e.target.value)} className={champ} />
        </label>
        <label className={libelle}>
          Coût
          <input required type="number" step="0.01" min={0.01} value={cout} onChange={(e) => setCout(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          Durée (ans)
          <input required type="number" min={1} value={duree} onChange={(e) => setDuree(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          Date
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={`${libelle} col-span-2`}>
          Réglé par
          <select required value={contrepartie} onChange={(e) => setContrepartie(e.target.value)} className={champ}>
            <option value="" />
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Remplacer'}</button>
        <button type="button" onClick={onFermer} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
      </div>
    </form>
  );
}
