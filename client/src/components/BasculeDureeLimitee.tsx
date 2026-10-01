import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';

/**
 * LA DURÉE D'UN INCORPOREL DEVIENT LIMITÉE (lot 10) · bascule prospective de
 * l'AUDCIF Titre VIII ch. 2 § 4.2.2. Le serveur refuse sans motif, sans test
 * de dépréciation ou dans un exercice clos (`declarerDureeLimitee`) · aucune
 * écriture, le plan part de la date de la décision.
 */
export function BasculeDureeLimitee({
  bien,
  fondsCommercial,
  onFait,
  onFermer,
}: {
  bien: { id: string; designation: string };
  fondsCommercial: boolean;
  onFait: (message: string) => void;
  onFermer: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [duree, setDuree] = useState('');
  const [motif, setMotif] = useState('');
  const [test, setTest] = useState('');
  const [dixAns, setDixAns] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!peutEcrire) return null;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/immobilisations/${bien.id}/duree-limitee`, {
        dateDecision: date,
        dureeResiduelleAns: dixAns ? 10 : Number(duree),
        motif,
        testDepreciation: test,
        ...(dixAns ? { fondementDureeDixAns: 'NON_ESTIMABLE' } : {}),
      });
      onFait(`« ${bien.designation} » s'amortit désormais à compter du ${new Date(date).toLocaleDateString('fr-FR')}.`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Déclaration refusée');
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
            Date de la décision
            <Aide
              titre="Durée devenue limitée"
              texte="La valeur à la date du changement s'amortit sur la durée d'utilité résiduelle, à compter de la décision, sans revenir sur le passé. Un test de dépréciation est réalisé d'abord ; s'il fait apparaître une perte, passez la dépréciation avant de déclarer la durée. Un fonds commercial dont la durée est limitée mais ne peut être estimée de manière fiable s'amortit sur dix ans."
              source="AUDCIF Titre VIII ch. 2 § 4.2.2 et § 7.2.2.1"
            />
          </span>
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${champ} font-mono`} />
        </label>
        {fondsCommercial && (
          <label className={`${libelle} flex items-center gap-1.5 self-end pb-1.5`}>
            <input type="checkbox" checked={dixAns} onChange={(e) => setDixAns(e.target.checked)} />
            Durée non estimable · dix ans
          </label>
        )}
        {!dixAns && (
          <label className={libelle}>
            Durée résiduelle (ans)
            <input required type="number" min={1} max={100} value={duree} onChange={(e) => setDuree(e.target.value)} className={`${champ} font-mono`} />
          </label>
        )}
        <label className={`${libelle} col-span-2`}>
          Ce qui rend la durée limitée
          <input required value={motif} onChange={(e) => setMotif(e.target.value)} className={champ} />
        </label>
        <label className={`${libelle} col-span-2`}>
          Résultat du test de dépréciation
          <input required value={test} onChange={(e) => setTest(e.target.value)} className={champ} />
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Déclarer'}</button>
        <button type="button" onClick={onFermer} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
      </div>
    </form>
  );
}
