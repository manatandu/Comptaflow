import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type {
  Compte,
  Exercice,
  Journal,
  ModeleAbonnement,
  PeriodiciteAbonnement,
  Regularisation,
  SimulationRegularisation,
  TypeRegularisation,
} from '../lib/types';

/**
 * RÉGULARISATIONS ET ABONNEMENTS · Traitement → Écritures de régularisation
 * des charges et produits, et Traitement → Écritures d'abonnement chez Sage
 * 100 i7, réunis dans une fenêtre à deux onglets.
 *
 * Le premier onglet repose sur le report au compte 476 des charges constatées
 * d'avance et au 477 des produits constatés d'avance · deux comptes que les
 * DEUX plans portent aux mêmes numéros, l'indépendance des exercices étant
 * commune aux deux référentiels (AUDCIF art. 59 ; SYCEBNL, postulat de
 * spécialisation des exercices).
 *
 * Le modèle SUBVENTION PLURIANNUELLE, lui, est propre au SYCEBNL : c'est sa
 * Partie 3 ch. 6, section 1 qui traite nommément le cas, de très loin le plus
 * fréquent chez une association financée par convention. Deux détails y
 * comptent : le report va au compte 477 et non à un compte d'attente, que le
 * texte interdit ; et la reprise se fait À LA FIN de l'exercice concerné, non
 * par contre-passation à son ouverture comme le ferait un progiciel français.
 *
 * LA DATE DE REPRISE, ELLE, DÉPEND DU RÉFÉRENTIEL, et le service la calcule
 * (voir `dateReprise`). Le SYCEBNL impose la clôture de l'exercice concerné ;
 * le SYSCOHADA permet les deux et RECOMMANDE VIVEMENT l'ouverture (§ 5.5 pour
 * les charges, § 6.5 pour les produits), parce qu'une part différée reprise
 * seulement à la clôture reste au bilan douze mois de plus et fausse toutes
 * les situations intermédiaires de l'année. La subvention pluriannuelle reste
 * à la clôture des deux côtés · le § 5.5 tolère expressément cette date.
 */

const TYPES: { valeur: TypeRegularisation; titre: string; aide: string }[] = [
  {
    valeur: 'CHARGE_CONSTATEE_AVANCE',
    titre: "Charge constatée d'avance (476)",
    aide: "Une charge payée sur cet exercice qui couvre en partie le suivant : assurance, loyer d'avance, abonnement.",
  },
  {
    valeur: 'PRODUIT_CONSTATE_AVANCE',
    titre: "Produit constaté d'avance (477)",
    aide: "Un produit encaissé sur cet exercice qui se rapporte au suivant : cotisation appelée d'avance, location perçue.",
  },
  {
    valeur: 'SUBVENTION_PLURIANNUELLE',
    titre: 'Subvention pluriannuelle (477 / 71)',
    // Mécanique valable dans les deux référentiels · les comptes 477 et 71
    // portent les mêmes intitulés dans les deux plans. Seule la SOURCE qui la
    // traite nommément est propre au SYCEBNL, et elle est citée plus bas, où
    // le référentiel du dossier est connu.
    aide: "Une convention accordée pour toute la durée d'un projet à cheval sur plusieurs exercices.",
  },
];

const PERIODICITES: { valeur: PeriodiciteAbonnement; libelle: string }[] = [
  { valeur: 'MENSUELLE', libelle: 'Mensuelle' },
  { valeur: 'TRIMESTRIELLE', libelle: 'Trimestrielle' },
  { valeur: 'SEMESTRIELLE', libelle: 'Semestrielle' },
  { valeur: 'ANNUELLE', libelle: 'Annuelle' },
];

function montant(n: number | string): string {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function RegularisationPage() {
  const { estAdmin, utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<'regularisation' | 'abonnement'>('regularisation');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [comptes, setComptes] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);

  const [regularisations, setRegularisations] = useState<Regularisation[]>([]);
  const [type, setType] = useState<TypeRegularisation>('SUBVENTION_PLURIANNUELLE');
  const [libelle, setLibelle] = useState('');
  const [compteId, setCompteId] = useState('');
  const [montantTotal, setMontantTotal] = useState('');
  const [periodeDebut, setPeriodeDebut] = useState('');
  const [periodeFin, setPeriodeFin] = useState('');
  const [simulation, setSimulation] = useState<SimulationRegularisation | null>(null);

  const [abonnements, setAbonnements] = useState<ModeleAbonnement[]>([]);
  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [journalId, setJournalId] = useState('');
  const [compteDebitId, setCompteDebitId] = useState('');
  const [compteCreditId, setCompteCreditId] = useState('');
  const [periodicite, setPeriodicite] = useState<PeriodiciteAbonnement>('MENSUELLE');
  const [aboDebut, setAboDebut] = useState('');
  const [aboFin, setAboFin] = useState('');
  const [aboMontant, setAboMontant] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const peutEcrire = estAdmin || utilisateur?.role === 'COMPTABLE';

  useEffect(() => {
    api.get<Compte[]>('/comptes?actifsSeuls=true&typeCompte=DETAIL').then(setComptes, () => setComptes([]));
    api.get<Journal[]>('/journaux').then(setJournaux, () => setJournaux([]));
    api.get<Exercice[]>('/exercices').then(setExercices, () => setExercices([]));
  }, []);

  const chargerRegularisations = async () => {
    if (!exerciceCourant) return;
    try {
      setRegularisations(await api.get<Regularisation[]>(`/regularisations?exerciceId=${exerciceCourant.id}`));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };
  const chargerAbonnements = async () => {
    try {
      setAbonnements(await api.get<ModeleAbonnement[]>('/regularisations/abonnements/liste'));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    if (onglet === 'regularisation') chargerRegularisations();
    else chargerAbonnements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet, exerciceCourant?.id]);

  useEffect(() => {
    if (exerciceCourant && !periodeDebut) {
      setPeriodeDebut(exerciceCourant.dateDebut.slice(0, 10));
      setPeriodeFin(exerciceCourant.dateFin.slice(0, 10));
      setAboDebut(exerciceCourant.dateDebut.slice(0, 10));
      setAboFin(exerciceCourant.dateFin.slice(0, 10));
    }
  }, [exerciceCourant, periodeDebut]);

  const corps = () => ({
    exerciceId: exerciceCourant!.id,
    type,
    libelle,
    compteChargeProduitId: compteId,
    montantTotal: Number(montantTotal || 0),
    periodeDebut,
    periodeFin,
  });

  const simuler = async () => {
    if (!exerciceCourant || !compteId || !montantTotal) return;
    setErreur(null);
    try {
      setSimulation(await api.post<SimulationRegularisation>('/regularisations/simuler', corps()));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Simulation impossible');
      setSimulation(null);
    }
  };

  const creerRegularisation = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/regularisations', corps());
      setInfo('Régularisation enregistrée · son écriture est dans le brouillard.');
      setLibelle('');
      setMontantTotal('');
      setSimulation(null);
      await chargerRegularisations();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const reprendre = async (id: string, exerciceCibleId: string) => {
    setErreur(null);
    try {
      await api.post(`/regularisations/${id}/reprise`, { exerciceCibleId });
      setInfo(
        utilisateur?.tenant.referentiel === 'SYSCOHADA'
          ? "Reprise passée à l'ouverture de l'exercice concerné."
          : "Reprise passée à la clôture de l'exercice concerné.",
      );
      await chargerRegularisations();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Reprise impossible');
    }
  };

  const creerAbonnement = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post('/regularisations/abonnements', {
        code,
        intitule,
        journalId,
        compteDebitId,
        compteCreditId,
        periodicite,
        dateDebut: aboDebut,
        dateFin: aboFin,
        montant: Number(aboMontant || 0),
      });
      setInfo('Abonnement créé · son échéancier est prêt.');
      setCode('');
      setIntitule('');
      setAboMontant('');
      await chargerAbonnements();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const genererAbonnement = async (id: string) => {
    if (!exerciceCourant) return;
    setErreur(null);
    try {
      const r = await api.post<{ generees: number; restantes: number }>(
        `/regularisations/abonnements/${id}/generer`,
        { exerciceId: exerciceCourant.id, jusquA: new Date().toISOString().slice(0, 10) },
      );
      setInfo(
        r.generees === 0
          ? 'Aucune échéance due à ce jour sur cet exercice.'
          : `${r.generees} écriture(s) passée(s) dans le brouillard.`,
      );
      await chargerAbonnements();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Génération impossible');
    }
  };

  const champ = 'mt-1 w-full border border-border rounded-[6px] px-2.5 py-1.5 text-[11px] font-normal';
  const ongletClasse = (o: 'regularisation' | 'abonnement') =>
    `px-4 py-1.5 text-[10.5px] font-bold ${onglet === o ? 'bg-surface border-x border-border' : 'text-text-dim'}`;

  return (
    <div className="p-2">
      <div className="mb-1.5">
        <div className="text-[10px] font-mono text-text-dim leading-none">TRAITEMENT</div>
        <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
          Régularisations et abonnements
          <Aide sujet="regularisation" />
        </h1>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[11px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="flex bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        <button onClick={() => setOnglet('regularisation')} className={ongletClasse('regularisation')}>
          RÉGULARISATION DES CHARGES ET PRODUITS
        </button>
        <button onClick={() => setOnglet('abonnement')} className={ongletClasse('abonnement')}>
          ÉCRITURES D'ABONNEMENT
        </button>
      </div>

      {onglet === 'regularisation' && (
        <div className="border border-border bg-surface rounded-b-[10px] p-3 grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-3 items-start">
          {peutEcrire && (
            <form onSubmit={creerRegularisation} className="border border-border rounded-[8px] overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[10.5px] font-bold">
                Nouvelle régularisation
              </div>
              <div className="p-3 flex flex-col gap-2.5">
                <div className="flex flex-col gap-1.5">
                  {TYPES.map((t) => (
                    <label
                      key={t.valeur}
                      className={`flex items-start gap-2 rounded-[6px] border p-2 cursor-pointer text-[11px] ${
                        type === t.valeur ? 'border-sel bg-sel-soft' : 'border-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name="typeRegul"
                        className="mt-0.5"
                        checked={type === t.valeur}
                        onChange={() => {
                          setType(t.valeur);
                          setSimulation(null);
                        }}
                      />
                      <span>
                        <span className="font-semibold block">{t.titre}</span>
                        <span className="text-[10.5px] text-text-dim leading-[1.45] block">{t.aide}</span>
                      </span>
                    </label>
                  ))}
                </div>

                <label className="text-[10.5px] font-semibold text-text-dim">
                  Libellé
                  <input required value={libelle} onChange={(e) => setLibelle(e.target.value)} className={champ} />
                </label>

                <label className="text-[10.5px] font-semibold text-text-dim">
                  Compte de {type === 'CHARGE_CONSTATEE_AVANCE' ? 'charge (classe 6)' : 'produit (classe 7)'}
                  <select required value={compteId} onChange={(e) => setCompteId(e.target.value)} className={champ}>
                    <option value="">Choisir…</option>
                    {comptes
                      .filter((c) =>
                        type === 'CHARGE_CONSTATEE_AVANCE' ? c.numero.startsWith('6') : c.numero.startsWith('7'),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.numero} · {c.intitule}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="text-[10.5px] font-semibold text-text-dim">
                  Montant total comptabilisé
                  <input
                    required
                    value={montantTotal}
                    onChange={(e) => {
                      setMontantTotal(e.target.value);
                      setSimulation(null);
                    }}
                    className={`${champ} font-mono`}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10.5px] font-semibold text-text-dim">
                    Période du
                    <input
                      type="date"
                      required
                      value={periodeDebut}
                      onChange={(e) => {
                        setPeriodeDebut(e.target.value);
                        setSimulation(null);
                      }}
                      className={`${champ} font-mono`}
                    />
                  </label>
                  <label className="text-[10.5px] font-semibold text-text-dim">
                    au
                    <input
                      type="date"
                      required
                      value={periodeFin}
                      onChange={(e) => {
                        setPeriodeFin(e.target.value);
                        setSimulation(null);
                      }}
                      className={`${champ} font-mono`}
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={simuler}
                  className="border border-border rounded-[6px] py-1.5 text-[11px] font-semibold hover:bg-chrome-alt"
                >
                  Calculer le prorata
                </button>

                {simulation && (
                  <div className="border border-sel/30 bg-sel-soft rounded-[6px] p-2.5 text-[11px]">
                    <div className="flex justify-between">
                      <span>Rattaché à cet exercice</span>
                      <span className="font-mono font-bold">{montant(simulation.montantExercice)}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Différé aux exercices ultérieurs</span>
                      <span className="font-mono font-bold text-sel">{montant(simulation.montantDiffere)}</span>
                    </div>
                    <div className="text-[10px] text-text-dim mt-1.5 leading-[1.5]">
                      {simulation.joursApresCloture} jour(s) sur {simulation.joursTotal} tombent après la clôture du{' '}
                      {jour(simulation.finExercice)}. Le prorata se compte en jours, pas en mois entiers.
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={envoi || !simulation || simulation.montantDiffere <= 0}
                  className="bg-sel text-white text-[11px] font-bold py-2 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  {envoi ? 'Enregistrement…' : 'Enregistrer et passer l’écriture'}
                </button>
              </div>
            </form>
          )}

          <div className="border border-border rounded-[8px] overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_120px_150px_150px] gap-2 px-3 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
              <span>LIBELLÉ</span>
              <span className="text-right">TOTAL</span>
              <span className="text-right">DIFFÉRÉ</span>
              <span>PÉRIODE</span>
              <span>REPRISE</span>
            </div>
            {regularisations.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_120px_120px_150px_150px] gap-2 px-3 py-1.5 text-[11px] items-center border-b border-border/40"
              >
                <span>
                  {r.libelle}
                  <span className="block text-[10px] text-text-dim font-mono">
                    {r.compteChargeProduit.numero} → {r.compteDiffere.numero}
                  </span>
                </span>
                <span className="text-right font-mono">{montant(r.montantTotal)}</span>
                <span className="text-right font-mono font-bold">{montant(r.montantDiffere)}</span>
                <span className="font-mono text-[10px]">
                  {jour(r.periodeDebut)} au {jour(r.periodeFin)}
                </span>
                <span>
                  {r.ecritureReprise ? (
                    <span className="text-[10.5px] text-positive font-semibold">
                      Reprise le {jour(r.ecritureReprise.date)}
                    </span>
                  ) : peutEcrire ? (
                    <select
                      defaultValue=""
                      onChange={(e) => e.target.value && reprendre(r.id, e.target.value)}
                      className="w-full border border-border rounded-[4px] px-1 py-0.5 text-[10.5px]"
                    >
                      <option value="">Reprendre sur…</option>
                      {exercices
                        .filter((ex) => ex.id !== r.exerciceId && ex.statut === 'OUVERT')
                        .map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            Exercice {new Date(ex.dateDebut).getFullYear()}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <span className="text-[10.5px] text-text-dim">à reprendre</span>
                  )}
                </span>
              </div>
            ))}
            {regularisations.length === 0 && (
              <div className="px-3 py-4 text-[11px] text-text-dim italic">
                Aucune régularisation sur cet exercice.
              </div>
            )}
            <p className="px-3 py-2 border-t border-border text-[10px] text-text-dim leading-[1.55]">
              {utilisateur?.tenant.referentiel === 'SYSCOHADA'
                ? "La reprise se passe À L'OUVERTURE de l'exercice concerné : le référentiel permet les deux dates, mais recommande vivement la contre-passation à l'ouverture · reprise seulement à la clôture, la part différée reste au bilan douze mois de plus et fausse toutes les situations intermédiaires de l'année."
                : "La reprise se passe À LA FIN de l'exercice concerné, comme le veut la Partie 3 ch. 6 du SYCEBNL, et non par contre-passation à son ouverture."}
            </p>
          </div>
        </div>
      )}

      {onglet === 'abonnement' && (
        <div className="border border-border bg-surface rounded-b-[10px] p-3 grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-3 items-start">
          {peutEcrire && (
            <form onSubmit={creerAbonnement} className="border border-border rounded-[8px] overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[10.5px] font-bold">
                Nouvel abonnement
              </div>
              <div className="p-3 grid grid-cols-2 gap-2.5">
                <label className="text-[10.5px] font-semibold text-text-dim">
                  Code
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="LOYER"
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim">
                  Périodicité
                  <select
                    value={periodicite}
                    onChange={(e) => setPeriodicite(e.target.value as PeriodiciteAbonnement)}
                    className={champ}
                  >
                    {PERIODICITES.map((p) => (
                      <option key={p.valeur} value={p.valeur}>
                        {p.libelle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Intitulé
                  <input
                    required
                    value={intitule}
                    onChange={(e) => setIntitule(e.target.value)}
                    placeholder="Loyer du bureau de Goma"
                    className={champ}
                  />
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Journal
                  <select required value={journalId} onChange={(e) => setJournalId(e.target.value)} className={champ}>
                    <option value="">Choisir…</option>
                    {journaux.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.code} · {j.intitule}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Compte débité
                  <select
                    required
                    value={compteDebitId}
                    onChange={(e) => setCompteDebitId(e.target.value)}
                    className={champ}
                  >
                    <option value="">Choisir…</option>
                    {comptes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Compte crédité
                  <select
                    required
                    value={compteCreditId}
                    onChange={(e) => setCompteCreditId(e.target.value)}
                    className={champ}
                  >
                    <option value="">Choisir…</option>
                    {comptes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim">
                  Du
                  <input
                    type="date"
                    required
                    value={aboDebut}
                    onChange={(e) => setAboDebut(e.target.value)}
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim">
                  Au
                  <input
                    type="date"
                    required
                    value={aboFin}
                    onChange={(e) => setAboFin(e.target.value)}
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Montant de chaque échéance
                  <input
                    required
                    value={aboMontant}
                    onChange={(e) => setAboMontant(e.target.value)}
                    className={`${champ} font-mono`}
                  />
                </label>
                <button
                  type="submit"
                  disabled={envoi}
                  className="col-span-2 bg-sel text-white text-[11px] font-bold py-2 rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  {envoi ? 'Création…' : "Créer l'abonnement"}
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-col gap-2.5">
            {abonnements.map((a) => {
              const generees = a.echeances.filter((e) => e.ecritureId).length;
              return (
                <section key={a.id} className="border border-border rounded-[8px] overflow-hidden">
                  <header className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between">
                    <span className="text-[11px] font-semibold">
                      <span className="font-mono">{a.code}</span> {a.intitule}
                      <span className="text-[10.5px] text-text-dim">
                        {' '}
                        · {PERIODICITES.find((p) => p.valeur === a.periodicite)?.libelle.toLowerCase()} ·{' '}
                        {montant(a.montant)} par échéance
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-[10.5px] text-text-dim">
                        {generees} / {a.echeances.length} passée(s)
                      </span>
                      {peutEcrire && generees < a.echeances.length && (
                        <button
                          onClick={() => genererAbonnement(a.id)}
                          className="bg-sel text-white text-[10.5px] font-bold px-2.5 py-1 rounded-[6px] hover:brightness-110"
                        >
                          Générer les échues
                        </button>
                      )}
                    </span>
                  </header>
                  <div className="px-3 py-1.5 text-[10.5px] text-text-dim border-b border-border/40 font-mono">
                    {a.compteDebit.numero} au débit · {a.compteCredit.numero} au crédit · journal {a.journal.code}
                  </div>
                  <div className="flex flex-wrap gap-1 p-2">
                    {a.echeances.map((e) => (
                      <span
                        key={e.id}
                        title={e.ecritureId ? 'Écriture passée' : 'En attente'}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[4px] border ${
                          e.ecritureId
                            ? 'bg-positive-soft border-positive/30 text-positive'
                            : 'bg-chrome-alt border-border text-text-dim'
                        }`}
                      >
                        {jour(e.date)}
                      </span>
                    ))}
                  </div>
                </section>
              );
            })}
            {abonnements.length === 0 && (
              <div className="border border-border rounded-[8px] px-3 py-4 text-[11px] text-text-dim italic">
                Aucun abonnement. Un abonnement automatise une écriture répétitive : loyer, assurance, versement
                périodique d'une convention de financement.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
