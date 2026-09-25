import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import { BoutonImprimer, EnteteImpression } from '../components/chrome/EnteteImpression';
import { MODELE_ETAT, ligneNeuve, titreColonne, type CalculEtat, type EtatPersonnalise, type LigneEtat } from '../lib/etats-personnalises';

/**
 * ÉTATS PERSONNALISÉS (point 20 de la comparaison Sage i7). Le catalogue Sage
 * nomme les « états libres » sans les décrire · la définition est celle
 * d'OmegaX. Rubriques de comptes et totaux, calculés sur un à cinq exercices
 * côte à côte. Ni état financier ni document déposé.
 */
const PLAFOND_EXERCICES = 5;
const montant = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const champ = 'border border-border-dark px-1.5 py-0.5 text-[11.5px] w-full';

export function EtatsPersonnalisesPage() {
  const { peutValider } = useAuth();
  const { exercices, exerciceCourant } = useExercice();
  const [etats, setEtats] = useState<EtatPersonnalise[]>([]);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [lignes, setLignes] = useState<LigneEtat[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [brouillard, setBrouillard] = useState(false);
  const [calcul, setCalcul] = useState<CalculEtat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = async () => setEtats(await api.get<EtatPersonnalise[]>('/etats-personnalises'));
  useEffect(() => {
    charger().catch(() => setEtats([]));
  }, []);
  useEffect(() => {
    if (exerciceCourant && selection.length === 0) setSelection([exerciceCourant.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id]);

  const ouvrir = (e: EtatPersonnalise | null) => {
    setChoisi(e?.id ?? 'nouveau');
    setNom(e?.nom ?? '');
    setLignes(e ? e.lignes.map((l) => ({ ...l })) : MODELE_ETAT.map((l) => ({ ...l })));
    setCalcul(null);
    setErreur(null);
    setInfo(null);
  };

  const majLigne = (i: number, patch: Partial<LigneEtat>) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const enregistrer = async () => {
    setErreur(null);
    setInfo(null);
    try {
      const corps = { nom, lignes };
      const e =
        choisi && choisi !== 'nouveau'
          ? await api.patch<EtatPersonnalise>(`/etats-personnalises/${choisi}`, corps)
          : await api.post<EtatPersonnalise>('/etats-personnalises', corps);
      await charger();
      setChoisi(e.id);
      setInfo('État enregistré.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    }
  };

  const supprimer = async () => {
    if (!choisi || choisi === 'nouveau' || !window.confirm(`Supprimer l'état « ${nom} » ?`)) return;
    try {
      await api.delete(`/etats-personnalises/${choisi}`);
      setChoisi(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Suppression impossible');
    }
  };

  const calculer = async () => {
    if (!choisi || choisi === 'nouveau') return;
    setErreur(null);
    try {
      setCalcul(
        await api.get<CalculEtat>(
          `/etats-personnalises/${choisi}/calcul?exercices=${selection.join(',')}&inclureBrouillard=${brouillard}`,
        ),
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Calcul impossible');
    }
  };

  const basculerExercice = (id: string) =>
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= PLAFOND_EXERCICES ? s : [...s, id]));

  return (
    <div className="p-2 avec-edition">
      <EnteteImpression titre={calcul ? calcul.etat.nom : 'État personnalisé'} sousTitre={calcul?.inclureBrouillard ? 'Brouillard compris' : 'Livre-journal seul'} />
      {calcul && (
        <div className="impression-seul">
          <TableauCalcul calcul={calcul} />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 mb-2">
        <Aide
          titre="États personnalisés"
          texte="Un état se compose de rubriques et de totaux. Une rubrique cite des racines de comptes (« 70 71 -709 » : le moins exclut) et une mesure · SOLDE pour un compte de bilan, MOUVEMENT pour une charge ou un produit, dont la clôture remet le solde à zéro. Le sens dit dans quel sens le montant se lit positif. Un total combine des lignes précédentes par leur clé (« A+B-C »). Jusqu'à cinq exercices côte à côte. Ce n'est ni un état financier ni un document déposé."
          source="Sage 100 i7 · états libres (nommés) ; Édition pilotée · historique des indicateurs sur 5 ans"
        />
        {peutValider && (
          <button type="button" onClick={() => ouvrir(null)} className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
            Nouvel état
          </button>
        )}
      </div>
      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">{erreur}</div>}
      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-1.5 mb-2">{info}</div>}
      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        <ul className="text-[11.5px] border border-border bg-surface">
          {etats.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => ouvrir(e)}
                className={`w-full text-left px-2.5 py-1 border-b border-border/50 ${e.id === choisi ? 'bg-sel-soft font-semibold' : 'hover:bg-chrome-alt'}`}
              >
                {e.nom}
              </button>
            </li>
          ))}
          {etats.length === 0 && <li className="px-2.5 py-1 italic text-text-dim">Aucun état.</li>}
        </ul>
        {choisi && (
          <div className="min-w-0">
            <label className="flex items-center gap-2 mb-2 text-[11.5px]">
              Nom
              <input aria-label="Nom de l'état" value={nom} onChange={(e) => setNom(e.target.value)} disabled={!peutValider} className={`${champ} max-w-[360px]`} />
            </label>
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px] min-w-[760px]">
                <thead>
                  <tr>
                    <th className="text-left w-[90px]">Clé</th>
                    <th className="text-left">Libellé</th>
                    <th className="text-left w-[170px]">Racines</th>
                    <th className="text-left w-[110px]">Mesure</th>
                    <th className="text-left w-[80px]">Sens</th>
                    <th className="text-left w-[150px]">Total</th>
                    <th className="w-[30px]" />
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => {
                    const estTotal = !!l.total?.trim();
                    return (
                      <tr key={i}>
                        <td><input aria-label={`Clé ${i + 1}`} value={l.cle} onChange={(e) => majLigne(i, { cle: e.target.value.toUpperCase() })} disabled={!peutValider} className={champ} /></td>
                        <td><input aria-label={`Libellé ${i + 1}`} value={l.libelle} onChange={(e) => majLigne(i, { libelle: e.target.value })} disabled={!peutValider} className={champ} /></td>
                        <td><input aria-label={`Racines ${i + 1}`} value={l.racines ?? ''} onChange={(e) => majLigne(i, { racines: e.target.value })} disabled={!peutValider || estTotal} placeholder="70 71 -709" className={champ} /></td>
                        <td>
                          <select aria-label={`Mesure ${i + 1}`} value={l.mesure ?? 'MOUVEMENT'} onChange={(e) => majLigne(i, { mesure: e.target.value as LigneEtat['mesure'] })} disabled={!peutValider || estTotal} className={champ}>
                            <option value="MOUVEMENT">Mouvement</option>
                            <option value="SOLDE">Solde</option>
                          </select>
                        </td>
                        <td>
                          <select aria-label={`Sens ${i + 1}`} value={l.sens ?? 'DEBIT'} onChange={(e) => majLigne(i, { sens: e.target.value as LigneEtat['sens'] })} disabled={!peutValider || estTotal} className={champ}>
                            <option value="DEBIT">Débit</option>
                            <option value="CREDIT">Crédit</option>
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={`Total ${i + 1}`}
                            value={l.total ?? ''}
                            onChange={(e) => majLigne(i, e.target.value.trim() ? { total: e.target.value.toUpperCase(), racines: '' } : { total: '' })}
                            disabled={!peutValider}
                            placeholder="A+B-C"
                            className={champ}
                          />
                        </td>
                        <td>
                          {peutValider && (
                            <button type="button" aria-label={`Retirer la ligne ${i + 1}`} onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))} className="text-danger">
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {peutValider && (
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setLignes((ls) => [...ls, ligneNeuve(ls)])} className="border border-border-dark bg-chrome px-3 py-1 text-[11.5px]">
                  Ajouter une ligne
                </button>
                <button type="button" onClick={() => void enregistrer()} className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
                  Enregistrer
                </button>
                {choisi !== 'nouveau' && (
                  <button type="button" onClick={() => void supprimer()} className="text-[11.5px] text-danger hover:underline">
                    Supprimer
                  </button>
                )}
              </div>
            )}
            {choisi !== 'nouveau' && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="flex flex-wrap items-center gap-3 text-[11.5px] mb-2">
                  <span className="text-text-dim">Exercices (cinq au plus) :</span>
                  {exercices.map((ex) => (
                    <label key={ex.id} className="flex items-center gap-1">
                      <input type="checkbox" checked={selection.includes(ex.id)} onChange={() => basculerExercice(ex.id)} />
                      {titreColonne(ex.dateDebut, ex.dateFin)}
                    </label>
                  ))}
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={brouillard} onChange={(e) => setBrouillard(e.target.checked)} />
                    Brouillard compris
                  </label>
                  <button type="button" onClick={() => void calculer()} className="bg-sel text-white px-3.5 py-1 font-semibold rounded-full">
                    Calculer
                  </button>
                  {calcul && <BoutonImprimer />}
                </div>
                {calcul && (
                  <div className="overflow-x-auto">
                    <TableauCalcul calcul={calcul} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Le tableau seul · l'appelant le pose dans un conteneur qui défile, au plus près du débordement. */
function TableauCalcul({ calcul }: { calcul: CalculEtat }) {
  return (
    <table className="w-full text-[11.5px]">
        <thead>
          <tr>
            <th className="text-left">Rubrique</th>
            {calcul.colonnes.map((c) => (
              <th key={c.exerciceId} className="text-right">
                {titreColonne(c.dateDebut, c.dateFin)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calcul.etat.lignes.map((l) => (
            <tr key={l.cle} className={l.total ? 'total' : ''}>
              <td className={l.total ? 'font-semibold' : ''}>{l.libelle}</td>
              {calcul.colonnes.map((c) => (
                <td key={c.exerciceId} className="text-right">
                  {montant(c.valeurs[l.cle] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
      </tbody>
    </table>
  );
}
