import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { motifAucunCompteRetenu } from '../lib/comptes-proposes';
import { montant } from '../lib/montants';
import type { Compte, Journal } from '../lib/types';
import { Aide } from './chrome/Aide';

/**
 * L'ACQUISITION À PRIX ALÉATOIRE (lot 15, SYSCOHADA seul) · rente viagère
 * (AUDCIF Titre VIII ch. 11 § 2, dette au 1681) ou incorporel acquis contre
 * redevances (ch. 2 § 11, dette au 4811). Le serveur tient les refus
 * (`acquisition-prix-aleatoire.ts`) et la route est cloisonnée au SYSCOHADA ·
 * l'écran ne se montre qu'à un dossier SYSCOHADA.
 */
type Nature = 'RENTE_VIAGERE' | 'REDEVANCES';
type Fondement = 'PRIX_STIPULE' | 'ESTIMATION_VALEUR_ACTUELLE' | 'REDEVANCES_ACTUALISEES' | 'VALEUR_DROITS_ENREGISTREMENT';

const FONDEMENTS: Record<Nature, { valeur: Fondement; libelle: string }[]> = {
  RENTE_VIAGERE: [
    { valeur: 'PRIX_STIPULE', libelle: 'Prix stipulé au contrat' },
    { valeur: 'ESTIMATION_VALEUR_ACTUELLE', libelle: 'Estimation de la valeur actuelle' },
  ],
  REDEVANCES: [
    { valeur: 'REDEVANCES_ACTUALISEES', libelle: 'Valeur actualisée des redevances probables' },
    { valeur: 'VALEUR_DROITS_ENREGISTREMENT', libelle: "Valeur retenue pour les droits d'enregistrement" },
  ],
};
/** La racine de la dette que le texte nomme pour chaque nature. */
const DETTE: Record<Nature, string> = { RENTE_VIAGERE: '1681', REDEVANCES: '4811' };
const TRESORERIE = ['52', '53', '55', '57'];

export function AcquisitionPrixAleatoire({
  exerciceId,
  journaux,
  comptesBien,
  comptes,
  onCree,
}: {
  exerciceId: string | undefined;
  journaux: Journal[];
  comptesBien: { id: string; numero: string; intitule: string }[] | null;
  /** Comptes retenus ou utilisés (`retenus=true`) · null tant que la liste n'est pas lue. */
  comptes: Compte[] | null;
  onCree: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const [nature, setNature] = useState<Nature>('RENTE_VIAGERE');
  const [compteBien, setCompteBien] = useState('');
  const [designation, setDesignation] = useState('');
  const [dateAcquisition, setDateAcquisition] = useState('');
  const [dateMiseEnService, setDateMiseEnService] = useState('');
  const [valeur, setValeur] = useState('');
  const [duree, setDuree] = useState('');
  const [fondement, setFondement] = useState<Fondement>('PRIX_STIPULE');
  const [source, setSource] = useState('');
  const [compteDette, setCompteDette] = useState('');
  const [comptant, setComptant] = useState('');
  const [compteComptant, setCompteComptant] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  const journalOd = journaux.find((j) => j.code === 'OD') ?? journaux[0];
  /*
    LA DETTE EST PRESCRITE · 1681 « rentes viagères capitalisées » (AUDCIF
    Titre VIII ch. 11 § 2.3.1) ou 4811 (ch. 2 § 11), seuls admis par le
    serveur (`acquisition-prix-aleatoire.ts`). L'acquisition en est presque
    toujours le PREMIER mouvement · la règle des comptes retenus viderait la
    liste dans un dossier qui n'a jamais acquis en viager. Elle se lit donc
    dans TOUT le plan, comme le 167 et le 4861 du legs (critère écrit dans
    `listes-de-comptes.ts`) ; le bouquet, lui, se paie par un compte de
    trésorerie au choix, lu sur les comptes retenus.
  */
  const [planPrescrit, setPlanPrescrit] = useState<Compte[] | null>(null);
  useEffect(() => {
    if (!ouvert || planPrescrit) return;
    let vivant = true;
    api
      .get<Compte[]>('/comptes?typeCompte=DETAIL')
      .then((c) => vivant && setPlanPrescrit(c))
      .catch((err) => vivant && setErreur(`Plan de comptes illisible · ${err instanceof ApiError ? err.message : 'serveur injoignable'}`));
    return () => {
      vivant = false;
    };
  }, [ouvert, planPrescrit]);

  if (!peutEcrire) return null;

  // null n'est pas vide (§ 9 ter) · une liste non lue ne dit pas « aucun compte ».
  const biens = comptesBien ? comptesBien.filter((c) => (nature === 'REDEVANCES' ? c.numero.startsWith('21') : true)) : null;
  const dettes = planPrescrit ? planPrescrit.filter((c) => c.numero.startsWith(DETTE[nature])) : null;
  const tresorerie = comptes ? comptes.filter((c) => TRESORERIE.some((r) => c.numero.startsWith(r))) : null;
  // Un choix unique se présélectionne (§ 9 ter) · le seul 1681 ou le seul 4811 du plan.
  const detteRetenue = compteDette || (dettes && dettes.length === 1 ? dettes[0].id : '');
  const compteBienRetenu = compteBien || (biens && biens.length === 1 ? biens[0].id : '');
  const tresorerieRetenue = compteComptant || (tresorerie && tresorerie.length === 1 ? tresorerie[0].id : '');

  const changerNature = (n: Nature) => {
    setNature(n);
    setFondement(FONDEMENTS[n][0].valeur);
    setCompteDette('');
    setCompteBien('');
  };

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciceId || !journalOd) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/immobilisations/prix-aleatoire', {
        nature,
        compteImmobilisationId: compteBienRetenu,
        designation,
        dateAcquisition,
        ...(dateMiseEnService ? { dateMiseEnService } : {}),
        valeurOrigine: Number(valeur),
        ...(duree ? { dureeAmortissementAns: Number(duree) } : {}),
        fondement,
        sourceValeur: source,
        compteDetteId: detteRetenue,
        ...(Number(comptant) > 0 ? { comptant: Number(comptant), compteComptantId: tresorerieRetenue } : {}),
        exerciceId,
        journalId: journalOd.id,
      });
      setResultat(`« ${designation} » entré pour ${montant(Number(valeur))}, dette ${montant(Number(valeur) - (Number(comptant) || 0))}.`);
      setDesignation('');
      setValeur('');
      setComptant('');
      setSource('');
      setOuvert(false);
      onCree();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Acquisition refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'border border-border px-1.5 py-0.5 text-[11.5px]';
  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3" data-prix-aleatoire>
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Acquisition en viager ou contre redevances
        <Aide
          titre="Acquisition à prix aléatoire"
          texte={
            "Rente viagère · le bien entre pour le prix stipulé ou, à défaut, sa valeur actuelle ; le bouquet est payé en trésorerie, le reste va au 1681. Chaque rente versée débite le 1681 en entier ; au décès du crédirentier, le reste du 1681 passe au 841 ; les rentes versées au-delà du terme sont des charges au 831. " +
            "Redevances sur chiffre d'affaires · l'incorporel entre à sa valeur actuelle à la signature (redevances probables actualisées, ou valeur retenue pour les droits d'enregistrement), par le crédit du 4811 ; à la fin, l'écart entre les redevances versées et le montant estimé va au 831 ou au 841. Si les redevances ne s'estiment pas de façon fiable, elles sont des charges (634) et seule la partie fixe s'immobilise."
          }
          source="AUDCIF, Titre VIII ch. 11 § 2 et ch. 2 § 11 · Guide d'application, Applications 26 et 43"
        />
        {!ouvert && (
          <button type="button" onClick={() => setOuvert(true)} className="ml-auto bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5">
            Acquérir
          </button>
        )}
      </div>
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      {resultat && <div className="px-3.5 py-1.5 text-[11.5px]">{resultat}</div>}
      {ouvert && (
        <form onSubmit={(e) => void envoyer(e)} className="px-3.5 py-2 flex flex-col gap-2 text-[11.5px]">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              Nature
              <select value={nature} onChange={(e) => changerNature(e.target.value as Nature)} className={champ}>
                <option value="RENTE_VIAGERE">Rente viagère</option>
                <option value="REDEVANCES">Redevances sur chiffre d'affaires</option>
              </select>
            </label>
            <label className="flex flex-col">
              Compte du bien
              <select required value={compteBienRetenu} onChange={(e) => setCompteBien(e.target.value)} className={champ}>
                <option value="">·</option>
                {(biens ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
              {motifAucunCompteRetenu(biens, nature === 'REDEVANCES' ? "d'immobilisation incorporelle (21)" : "d'immobilisation") && (
                <span className="text-warning">{motifAucunCompteRetenu(biens, nature === 'REDEVANCES' ? "d'immobilisation incorporelle (21)" : "d'immobilisation")}</span>
              )}
            </label>
            <label className="flex flex-col">
              Désignation
              <input required value={designation} onChange={(e) => setDesignation(e.target.value)} className={`${champ} w-48`} />
            </label>
            <label className="flex flex-col">
              Date de l'acte
              <input required type="date" value={dateAcquisition} onChange={(e) => setDateAcquisition(e.target.value)} className={champ} />
            </label>
            <label className="flex flex-col">
              Mise en service
              <input type="date" value={dateMiseEnService} onChange={(e) => setDateMiseEnService(e.target.value)} className={champ} />
            </label>
            <label className="flex flex-col">
              Durée (ans)
              <input type="number" min="1" max="100" value={duree} onChange={(e) => setDuree(e.target.value)} className={`${champ} w-20`} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              Valeur d'entrée
              <input required type="number" min="0.01" step="0.01" value={valeur} onChange={(e) => setValeur(e.target.value)} className={`${champ} w-36`} />
            </label>
            <label className="flex flex-col">
              Fondement de la valeur
              <select value={fondement} onChange={(e) => setFondement(e.target.value as Fondement)} className={champ}>
                {FONDEMENTS[nature].map((f) => (
                  <option key={f.valeur} value={f.valeur}>{f.libelle}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              Source de la valeur
              <input required value={source} onChange={(e) => setSource(e.target.value)} className={`${champ} w-56`} />
            </label>
            <label className="flex flex-col">
              Dette
              <select required value={detteRetenue} onChange={(e) => setCompteDette(e.target.value)} className={champ}>
                <option value="">·</option>
                {(dettes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
              {dettes && dettes.length === 0 && (
                <span className="text-warning">Le plan du dossier n'ouvre aucun {DETTE[nature]} · ouvrez-le dans Plan comptable.</span>
              )}
            </label>
            <label className="flex flex-col">
              {nature === 'RENTE_VIAGERE' ? 'Bouquet' : 'Versement immédiat'}
              <input type="number" min="0" step="0.01" value={comptant} onChange={(e) => setComptant(e.target.value)} className={`${champ} w-32`} />
            </label>
            {Number(comptant) > 0 && (
              <label className="flex flex-col">
                Payé par
                <select required value={tresorerieRetenue} onChange={(e) => setCompteComptant(e.target.value)} className={champ}>
                  <option value="">·</option>
                  {(tresorerie ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                  ))}
                </select>
                {motifAucunCompteRetenu(tresorerie, 'de trésorerie') && <span className="text-warning">{motifAucunCompteRetenu(tresorerie, 'de trésorerie')}</span>}
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi || !journalOd || !exerciceId} className="bg-sel text-white text-[11px] font-semibold px-2.5 py-1 disabled:opacity-50">
              {envoi ? '…' : 'Enregistrer l’acquisition'}
            </button>
            <button type="button" onClick={() => setOuvert(false)} className="text-[11px] font-semibold text-text-dim px-2.5 py-1">
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * LE SOLDE DE LA DETTE (lot 15) · décès du crédirentier (D 1681 / C 841) ou
 * fin des redevances (écart au 831 ou au 841). Les versements cumulés se
 * déclarent avec leur source · le serveur calcule l'écart et passe la pièce.
 */
export function SoldeDetteAleatoire({
  bien,
  exerciceId,
  journaux,
  onFait,
  onFermer,
}: {
  bien: { id: string; designation: string; natureAcquisitionAleatoire?: Nature | null; detteAleatoireInitiale?: number | null };
  exerciceId: string | null;
  journaux: Journal[];
  onFait: (message: string) => void;
  onFermer: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [date, setDate] = useState('');
  const [versements, setVersements] = useState('');
  const [source, setSource] = useState('');
  const [journalId, setJournalId] = useState(() => journaux.find((j) => j.code === 'OD')?.id ?? journaux[0]?.id ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!peutEcrire) return null;
  const rente = bien.natureAcquisitionAleatoire === 'RENTE_VIAGERE';

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciceId) {
      setErreur('Choisissez d’abord un exercice.');
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ solde: { cas: string; montant: number } }>(`/immobilisations/${bien.id}/solde-dette-aleatoire`, {
        exerciceId,
        journalId,
        date,
        versementsCumules: Number(versements),
        sourceVersements: source,
      });
      onFait(`${montant(r.solde.montant)} ${r.solde.cas === 'EXCEDENT' ? 'porté au 831' : 'porté au 841'} · « ${bien.designation} ».`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Solde refusé');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]';
  const libelle = 'text-[11.5px] font-semibold text-text-dim';
  return (
    <form onSubmit={(e) => void envoyer(e)} className="bg-chrome border-b border-border px-4 py-3" data-solde-dette>
      {erreur && <div className="mb-2 text-[11.5px] text-danger">{erreur}</div>}
      <div className="grid grid-cols-4 gap-3 items-end">
        <label className={libelle}>
          <span className="flex items-center gap-1">
            {rente ? 'Date du décès' : 'Fin du contrat'}
            <Aide
              titre={rente ? 'Extinction de la rente viagère' : 'Écart sur redevances'}
              texte={
                rente
                  ? "Au décès du crédirentier, l'obligation disparaît · le reste de la dette capitalisée (dette d'origine moins les rentes versées, bouquet exclu) passe du 1681 au 841. Si les rentes versées ont déjà éteint la dette, il n'y a rien à solder."
                  : "À la fin du contrat, l'excédent des redevances versées sur le montant estimé va au 831, l'insuffisance au 841, contre le 4811."
              }
              source={rente ? 'AUDCIF, Titre VIII ch. 11 § 2.3.3 et § 2.4' : 'AUDCIF, Titre VIII ch. 2 § 11'}
            />
          </span>
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          {rente ? 'Rentes versées depuis la signature' : 'Redevances versées en tout'}
          <input required type="number" min={0} step="0.01" value={versements} onChange={(e) => setVersements(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          Source du cumul
          <input required value={source} onChange={(e) => setSource(e.target.value)} className={champ} />
        </label>
        <label className={libelle}>
          Journal
          <select required value={journalId} onChange={(e) => setJournalId(e.target.value)} className={champ}>
            {journaux.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} · {j.intitule}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bien.detteAleatoireInitiale != null && (
        <div className="mt-2 text-[11.5px] text-text-dim">Dette d'origine · {montant(bien.detteAleatoireInitiale)}</div>
      )}
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
          {envoi ? '…' : 'Solder la dette'}
        </button>
        <button type="button" onClick={onFermer} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">
          Annuler
        </button>
      </div>
    </form>
  );
}
