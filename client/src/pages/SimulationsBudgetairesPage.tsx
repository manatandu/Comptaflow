import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import { BoutonImprimer, EnteteImpression } from '../components/chrome/EnteteImpression';
import { titreColonne } from '../lib/etats-personnalises';
import {
  CLASSE_JAUGE,
  ecrireVariations,
  lireVariations,
  type CalculSimulation,
  type Jauge,
  type SimulationBudgetaire,
} from '../lib/simulations-budgetaires';

/**
 * SIMULATEUR BUDGÉTAIRE (priorité 6 de la comparaison avec les autres produits
 * Sage). Sage NOMME le simulateur de l'Édition pilotée sans en décrire la
 * méthode · la définition est celle d'OmegaX, et l'aide le dit. Seules les
 * hypothèses sont enregistrées · les montants se relisent à chaque calcul, et
 * rien n'est passé au journal.
 */
const montant = (n: number | null) => (n === null ? '' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pc = (n: number | null) => (n === null ? '' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`);
const nombre = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
const champ = 'border border-border-dark px-1.5 py-0.5 text-[11.5px]';
const LIBELLE_JAUGE: Record<Jauge, string> = { VERT: 'Vert', ORANGE: 'Orange', ROUGE: 'Rouge' };

const VIDE = { nom: '', referenceId: '', cibleId: '', croissance: '0', variations: '', orange: '5', rouge: '15' };

export function SimulationsBudgetairesPage() {
  const { peutValider } = useAuth();
  const { exercices } = useExercice();
  const [simulations, setSimulations] = useState<SimulationBudgetaire[]>([]);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [f, setF] = useState(VIDE);
  const [arreteAu, setArreteAu] = useState('');
  const [brouillard, setBrouillard] = useState(true);
  const [calcul, setCalcul] = useState<CalculSimulation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = async () => setSimulations(await api.get<SimulationBudgetaire[]>('/simulations-budgetaires'));
  useEffect(() => {
    charger().catch(() => setSimulations([]));
  }, []);

  const ouvrir = (s: SimulationBudgetaire | null) => {
    setChoisi(s?.id ?? 'nouveau');
    setF(
      s
        ? {
            nom: s.nom,
            referenceId: s.exerciceReferenceId,
            cibleId: s.exerciceCibleId,
            croissance: String(s.hypotheses.croissanceProduitsPct),
            variations: ecrireVariations(s.hypotheses.variations ?? {}),
            orange: String(Number(s.seuilOrangePct)),
            rouge: String(Number(s.seuilRougePct)),
          }
        : VIDE,
    );
    setCalcul(null);
    setErreur(null);
    setInfo(null);
  };

  const enregistrer = async () => {
    setErreur(null);
    setInfo(null);
    const lecture = lireVariations(f.variations);
    if ('motif' in lecture) {
      setErreur(lecture.motif);
      return;
    }
    const corps = {
      nom: f.nom,
      exerciceReferenceId: f.referenceId,
      exerciceCibleId: f.cibleId,
      croissanceProduitsPct: nombre(f.croissance),
      variations: lecture.variations,
      seuilOrangePct: nombre(f.orange),
      seuilRougePct: nombre(f.rouge),
    };
    try {
      const s =
        choisi && choisi !== 'nouveau'
          ? await api.patch<SimulationBudgetaire>(`/simulations-budgetaires/${choisi}`, corps)
          : await api.post<SimulationBudgetaire>('/simulations-budgetaires', corps);
      await charger();
      setChoisi(s.id);
      setInfo('Simulation enregistrée.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    }
  };

  const supprimer = async () => {
    if (!choisi || choisi === 'nouveau' || !window.confirm(`Supprimer la simulation « ${f.nom} » ?`)) return;
    try {
      await api.delete(`/simulations-budgetaires/${choisi}`);
      setChoisi(null);
      setCalcul(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Suppression impossible');
    }
  };

  const calculer = async () => {
    if (!choisi || choisi === 'nouveau') return;
    setErreur(null);
    try {
      const q = new URLSearchParams({ inclureBrouillard: String(brouillard) });
      if (arreteAu) q.set('arreteAu', arreteAu);
      setCalcul(await api.get<CalculSimulation>(`/simulations-budgetaires/${choisi}/calcul?${q}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Calcul impossible');
    }
  };

  const choixExercice = (valeur: string, cle: 'referenceId' | 'cibleId', libelle: string) => (
    <select aria-label={libelle} value={valeur} onChange={(e) => setF({ ...f, [cle]: e.target.value })} disabled={!peutValider} className={champ}>
      <option value="">·</option>
      {exercices.map((ex) => (
        <option key={ex.id} value={ex.id}>
          {titreColonne(ex.dateDebut, ex.dateFin)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="p-2 avec-edition">
      <EnteteImpression titre={calcul ? `Simulation · ${f.nom}` : 'Simulateur budgétaire'} sousTitre={calcul?.arreteAu ? `Arrêté au ${calcul.arreteAu}` : undefined} />
      {calcul && (
        <div className="impression-seul">
          <TableauSimulation calcul={calcul} />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 mb-2">
        <Aide
          titre="Simulateur budgétaire"
          texte="Définition d'OmegaX. Le prévu part du réalisé d'un exercice de référence, compte à deux chiffres des classes 6 et 7, auquel s'applique un taux · les produits suivent par défaut la croissance du chiffre d'affaires, les charges restent au réalisé tant qu'aucun taux ne leur est donné. Le réalisé est un mouvement de l'exercice, écritures de clôture exclues. Le prévu à date est le prévu annuel au prorata des jours écoulés, convention de lecture qui suppose une activité régulière. Seul l'écart défavorable colore la jauge (un produit en retard, une charge en dépassement), aux seuils de la simulation · aucun texte n'en fixe. Le résultat est celui des activités ordinaires, hors H.A.O. et impôt. Seules les hypothèses sont enregistrées, et rien n'est passé au journal."
          source="Sage Édition pilotée · simulateur (nommé, méthode non décrite)"
        />
        {peutValider && (
          <button type="button" onClick={() => ouvrir(null)} className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
            Nouvelle simulation
          </button>
        )}
      </div>
      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">{erreur}</div>}
      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-1.5 mb-2">{info}</div>}
      <div className="grid gap-3 md:grid-cols-[220px_1fr]">
        <ul className="text-[11.5px] border border-border bg-surface">
          {simulations.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => ouvrir(s)}
                className={`w-full text-left px-2.5 py-1 border-b border-border/50 ${s.id === choisi ? 'bg-sel-soft font-semibold' : 'hover:bg-chrome-alt'}`}
              >
                {s.nom}
              </button>
            </li>
          ))}
          {simulations.length === 0 && <li className="px-2.5 py-1 italic text-text-dim">Aucune simulation.</li>}
        </ul>
        {choisi && (
          <div className="min-w-0 text-[11.5px]">
            <div className="grid gap-x-3 gap-y-1.5 grid-cols-[auto_1fr] items-center max-w-[640px]">
              <span>Nom</span>
              <input aria-label="Nom de la simulation" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} disabled={!peutValider} className={champ} />
              <span>Exercice de référence</span>
              {choixExercice(f.referenceId, 'referenceId', 'Exercice de référence')}
              <span>Exercice simulé</span>
              {choixExercice(f.cibleId, 'cibleId', 'Exercice simulé')}
              <span>Croissance du chiffre d’affaires %</span>
              <input aria-label="Croissance du chiffre d'affaires" value={f.croissance} onChange={(e) => setF({ ...f, croissance: e.target.value })} disabled={!peutValider} className={`${champ} w-[90px] text-right`} />
              <span>Taux par ligne</span>
              <input
                aria-label="Taux par ligne"
                value={f.variations}
                onChange={(e) => setF({ ...f, variations: e.target.value })}
                disabled={!peutValider}
                placeholder="66 = 5 ; 62 = -10"
                className={champ}
              />
              <span>Jauge · orange au-delà de %</span>
              <input aria-label="Seuil orange" value={f.orange} onChange={(e) => setF({ ...f, orange: e.target.value })} disabled={!peutValider} className={`${champ} w-[90px] text-right`} />
              <span>Jauge · rouge au-delà de %</span>
              <input aria-label="Seuil rouge" value={f.rouge} onChange={(e) => setF({ ...f, rouge: e.target.value })} disabled={!peutValider} className={`${champ} w-[90px] text-right`} />
            </div>
            {peutValider && (
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => void enregistrer()} className="bg-sel text-white px-3.5 py-1 font-semibold">
                  Enregistrer
                </button>
                {choisi !== 'nouveau' && (
                  <button type="button" onClick={() => void supprimer()} className="text-danger hover:underline">
                    Supprimer
                  </button>
                )}
              </div>
            )}
            {choisi !== 'nouveau' && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <label className="flex items-center gap-1">
                    Arrêté au
                    <input aria-label="Arrêté au" type="date" value={arreteAu} onChange={(e) => setArreteAu(e.target.value)} className={champ} />
                  </label>
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
                  <>
                    {calcul.reserves.map((r) => (
                      <div key={r} className="text-warning bg-warning-soft border border-warning/30 px-3 py-1.5 mb-2">
                        {r}
                      </div>
                    ))}
                    <div className="text-text-dim mb-1">
                      {calcul.arreteAu ? `Arrêté au ${calcul.arreteAu} · prévu à date au prorata de ${pc(Math.round(calcul.prorata * 10000) / 100)}` : "La date d'arrêté précède l'exercice simulé · aucun réalisé."}
                    </div>
                    <div className="overflow-x-auto">
                      <TableauSimulation calcul={calcul} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CelluleJauge({ jauge }: { jauge: Jauge | null }) {
  if (!jauge) return <td />;
  return <td className={`text-center font-semibold ${CLASSE_JAUGE[jauge]}`}>{LIBELLE_JAUGE[jauge]}</td>;
}

/** Le tableau seul · l'appelant le pose dans un conteneur qui défile. */
function TableauSimulation({ calcul }: { calcul: CalculSimulation }) {
  const { totaux } = calcul;
  const ligneTotal = (libelle: string, cle: 'produits' | 'charges' | 'resultatActivitesOrdinaires', jauge?: Jauge | null, ecart?: number | null) => (
    <tr className="total">
      <td className="font-semibold" colSpan={2}>
        {libelle}
      </td>
      <td className="text-right">{montant(totaux.reference[cle])}</td>
      <td />
      <td className="text-right">{montant(totaux.prevuAnnuel[cle])}</td>
      <td className="text-right">{montant(totaux.prevuADate[cle])}</td>
      <td className="text-right">{montant(totaux.realise ? totaux.realise[cle] : null)}</td>
      <td className="text-right">{pc(ecart ?? null)}</td>
      {jauge === undefined ? <td /> : <CelluleJauge jauge={jauge} />}
    </tr>
  );
  return (
    <table className="w-full text-[11.5px] min-w-[860px]">
      <thead>
        <tr>
          <th className="text-left w-[50px]">Compte</th>
          <th className="text-left">Intitulé</th>
          <th className="text-right">Référence</th>
          <th className="text-right w-[70px]">Taux</th>
          <th className="text-right">Prévu annuel</th>
          <th className="text-right">Prévu à date</th>
          <th className="text-right">Réalisé</th>
          <th className="text-right w-[90px]">Écart défav.</th>
          <th className="w-[70px]">Jauge</th>
        </tr>
      </thead>
      <tbody>
        {calcul.lignes.map((l) => (
          <tr key={l.racine}>
            <td>{l.racine}</td>
            <td>{l.intitule}</td>
            <td className="text-right">{montant(l.reference)}</td>
            <td className="text-right">{pc(l.tauxPct)}</td>
            <td className="text-right">{montant(l.prevuAnnuel)}</td>
            <td className="text-right">{montant(l.prevuADate)}</td>
            <td className="text-right">{montant(l.realise)}</td>
            <td className="text-right">{pc(l.ecartDefavorablePct)}</td>
            <CelluleJauge jauge={l.jauge} />
          </tr>
        ))}
        {ligneTotal('Produits des activités ordinaires', 'produits')}
        {ligneTotal('Charges des activités ordinaires', 'charges')}
        {ligneTotal('Résultat des activités ordinaires', 'resultatActivitesOrdinaires', totaux.jaugeResultat, totaux.ecartResultatPct)}
      </tbody>
    </table>
  );
}
