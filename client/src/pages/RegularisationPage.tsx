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
  Referentiel,
  Regularisation,
  SimulationRegularisation,
  TypeRegularisation,
} from '../lib/types';
import {
  LIBELLE_NATURE_TIERS,
  aideDateReprise,
  compteTvaRattachement,
  estRattachement,
  exercicesDeReprise,
  momentDeReprise,
  naturesTiersProposees,
  porteUneCharge,
  type MomentReprise,
  type NatureTiers,
} from '../lib/regularisation-types';
import { montant } from '../lib/montants';
import { libelleExercice } from '../lib/libelle-exercice';

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
 * LA DATE DE REPRISE, ELLE, DÉPEND DU TYPE, et le service la calcule (voir
 * `dateReprise`) ; l'écran ne fait que la dire (`aideDateReprise`, audit final
 * F208). Tout se reprend à l'OUVERTURE de l'exercice concerné, sauf la
 * subvention pluriannuelle, reprise à la fin. Pour les 476 et 477, le
 * SYSCOHADA permet les deux dates et RECOMMANDE VIVEMENT l'ouverture (§ 5.5
 * pour les charges, § 6.5 pour les produits), une part différée reprise
 * seulement à la clôture restant au bilan douze mois de plus ; le Guide
 * d'application SYCEBNL extourne le 476 au début de l'exercice suivant
 * (Application 10). La charge à payer et le produit à recevoir se
 * contre-passent à l'ouverture (fiches des comptes 40 et 41 des deux plans).
 */

/**
 * `aideSyscohada` : présente uniquement là où l'EXEMPLE change d'un
 * référentiel à l'autre. Le mécanisme, lui, est commun · seuls les cas
 * concrets qui l'illustrent ne se rencontrent pas dans les deux mondes.
 */
const TYPES: { valeur: TypeRegularisation; titre: string; aide: string; aideSyscohada?: string; source?: string }[] = [
  {
    valeur: 'CHARGE_CONSTATEE_AVANCE',
    titre: "Charge constatée d'avance (476)",
    aide: "Une charge payée sur cet exercice qui couvre en partie le suivant : assurance, loyer d'avance, abonnement.",
  },
  {
    valeur: 'PRODUIT_CONSTATE_AVANCE',
    titre: "Produit constaté d'avance (477)",
    // L'exemple est choisi sur le référentiel du dossier · une cotisation
    // appelée d'avance ne se rencontre pas dans une société commerciale.
    aide: "Un produit encaissé sur cet exercice qui se rapporte au suivant : cotisation appelée d'avance, location perçue.",
    aideSyscohada:
      "Un produit encaissé sur cet exercice qui se rapporte au suivant : facture émise avec livraison différée, abonnement facturé au client, loyer perçu d'avance.",
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
  // LE RATTACHEMENT (audit final F67) · servi par le serveur, absent de
  // l'écran. Rien ne se proratise : le service est fait, seule la pièce
  // manque, et le montant entier appartient à cet exercice.
  {
    valeur: 'CHARGE_A_PAYER',
    titre: 'Charge à payer (facture non parvenue)',
    aide: "Un service reçu sur cet exercice dont la facture n'est pas encore parvenue. La charge entière est rattachée à cet exercice, sur le compte du tiers, et contre-passée à l'ouverture du suivant.",
    source: 'Fiche du compte 40, les deux plans',
  },
  {
    valeur: 'PRODUIT_A_RECEVOIR',
    titre: 'Produit à recevoir (facture à établir)',
    aide: "Un produit acquis sur cet exercice dont la facture n'est pas encore établie. Le produit entier est rattaché à cet exercice, sur le compte du tiers, et contre-passé à l'ouverture du suivant.",
    source: 'Fiche du compte 41, les deux plans',
  },
];

/**
 * La bulle de la colonne « Reprise » (audit final F208). La colonne porte des
 * lignes de types différents, et la date de reprise dépend du type autant que
 * du référentiel · la bulle la dit donc type par type, groupée par moment, sur
 * la même règle que la bulle de chaque ligne (`momentDeReprise`).
 */
function resumeDatesDeReprise(referentiel: Referentiel | undefined): { texte: string; source: string } {
  const types = (moment: MomentReprise) =>
    TYPES.filter((t) => momentDeReprise(t.valeur) === moment)
      .map((t) => t.titre)
      .join(', ');
  return {
    texte: `À l'ouverture de l'exercice de reprise : ${types('OUVERTURE')}. À la fin de l'exercice de reprise : ${types('FIN')}.`,
    source:
      referentiel === 'SYSCOHADA'
        ? 'AUDCIF, Titre VII, fiches des comptes 40 et 41 · Guide SYSCOHADA, Partie 1 ch. 6, § 5.5 et § 6.5'
        : "SYCEBNL, Partie 2 ch. 3, fiches des comptes 40 et 41 · Guide d'application, Application 10 · Partie 3 ch. 6",
  };
}

const PERIODICITES: { valeur: PeriodiciteAbonnement; libelle: string }[] = [
  { valeur: 'MENSUELLE', libelle: 'Mensuelle' },
  { valeur: 'TRIMESTRIELLE', libelle: 'Trimestrielle' },
  { valeur: 'SEMESTRIELLE', libelle: 'Semestrielle' },
  { valeur: 'ANNUELLE', libelle: 'Annuelle' },
];

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function RegularisationPage() {
  const { estAdmin, peutEcrire, utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<'regularisation' | 'abonnement'>('regularisation');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [comptes, setComptes] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);

  // La liste part de null, jamais d'une liste vide · « aucune régularisation »
  // ne se dit que sur une liste LUE. Un échec de lecture se dit avec son motif,
  // et ne laisse pas à l'écran la liste d'un autre exercice.
  const [regularisations, setRegularisations] = useState<Regularisation[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [type, setType] = useState<TypeRegularisation>('SUBVENTION_PLURIANNUELLE');
  const [libelle, setLibelle] = useState('');
  const [compteId, setCompteId] = useState('');
  const [natureTiers, setNatureTiers] = useState<NatureTiers | ''>('');
  const [montantTotal, setMontantTotal] = useState('');
  const [montantTva, setMontantTva] = useState('');
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

  const estSycebnl = utilisateur?.tenant.referentiel !== 'SYSCOHADA';

  useEffect(() => {
    api.get<Compte[]>('/comptes?actifsSeuls=true&typeCompte=DETAIL&retenus=true').then(setComptes, () => setComptes([]));
    api.get<Journal[]>('/journaux').then(setJournaux, () => setJournaux([]));
    api.get<Exercice[]>('/exercices').then(setExercices, () => setExercices([]));
  }, []);

  const chargerRegularisations = async () => {
    if (!exerciceCourant) return;
    try {
      setRegularisations(await api.get<Regularisation[]>(`/regularisations?exerciceId=${exerciceCourant.id}`));
      setErreurLecture(null);
    } catch (e) {
      setRegularisations(null);
      setErreurLecture(e instanceof ApiError ? e.message : 'Chargement impossible');
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
    if (onglet === 'regularisation') {
      // L'exercice a pu changer · la liste de l'ancien ne reste pas affichée
      // pendant la lecture du nouveau, ni après son échec.
      setRegularisations(null);
      chargerRegularisations();
    } else chargerAbonnements();
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

  // TVA d'une charge à payer ou d'un produit à recevoir · la règle du serveur.
  const compteTva = compteTvaRattachement(utilisateur?.tenant.referentiel, type, natureTiers);

  const corps = () => ({
    exerciceId: exerciceCourant!.id,
    type,
    libelle,
    compteChargeProduitId: compteId,
    montantTotal: Number(montantTotal || 0),
    periodeDebut,
    periodeFin,
    ...(estRattachement(type) && natureTiers ? { natureTiers } : {}),
    ...(compteTva && Number(montantTva) > 0 ? { montantTva: Number(montantTva) } : {}),
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
      // La date vient du serveur · elle dépend du référentiel ET du type (un
      // rattachement se contre-passe à l'ouverture des deux côtés).
      const r = await api.post<Regularisation>(`/regularisations/${id}/reprise`, { exerciceCibleId });
      setInfo(r.ecritureReprise ? `Reprise passée le ${jour(r.ecritureReprise.date)}.` : 'Reprise passée.');
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

  /**
   * Renommer et supprimer un abonnement (audit de l'interface du
   * 2026-09-27, I11) · les routes existaient sans geste. La suppression est
   * réservée à l'administrateur, comme sa route ; le serveur refuse celle
   * d'un abonnement dont une échéance est déjà passée, et le dit.
   */
  const renommerAbonnement = async (id: string, intitule: string) => {
    const nouveau = window.prompt("Intitulé de l'abonnement", intitule);
    if (!nouveau?.trim() || nouveau.trim() === intitule) return;
    setErreur(null);
    try {
      await api.patch(`/regularisations/abonnements/${id}`, { intitule: nouveau.trim() });
      await chargerAbonnements();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  // Le refus de suppression d'un abonnement déjà passé renvoie à la mise en
  // sommeil · elle doit donc exister à l'écran.
  const basculerSommeil = async (id: string, estActif: boolean) => {
    setErreur(null);
    try {
      await api.patch(`/regularisations/abonnements/${id}`, { estActif: !estActif });
      await chargerAbonnements();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  const supprimerAbonnement = async (id: string, intitule: string) => {
    if (!window.confirm(`Supprimer l'abonnement « ${intitule} » ?`)) return;
    setErreur(null);
    try {
      await api.delete(`/regularisations/abonnements/${id}`);
      await chargerAbonnements();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Suppression impossible');
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

  const champ = 'mt-1 w-full border border-border rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-normal';
  const ongletClasse = (o: 'regularisation' | 'abonnement') =>
    `px-4 py-1.5 text-[11.5px] font-bold ${onglet === o ? 'bg-surface border-x border-border' : 'text-text-dim'}`;

  return (
    <div className="p-2">
      <div className="mb-1.5 flex items-center justify-end">
        <Aide sujet="regularisation" />
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11.5px] text-danger bg-danger-soft border border-danger/30 rounded-[3px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[11.5px] text-positive bg-positive-soft border border-positive/30 rounded-[3px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="flex bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        <button onClick={() => setOnglet('regularisation')} className={ongletClasse('regularisation')}>
          Régularisation des charges et produits
        </button>
        <button onClick={() => setOnglet('abonnement')} className={ongletClasse('abonnement')}>
          Écritures d'abonnement
        </button>
      </div>

      {onglet === 'regularisation' && (
        <div className="border border-border bg-surface rounded-b-[10px] p-3 grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-3 items-start">
          {peutEcrire && (
            <form onSubmit={creerRegularisation} className="border border-border rounded-[4px] overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                Nouvelle régularisation
              </div>
              <div className="p-3 flex flex-col gap-2.5">
                <div className="flex flex-col gap-1.5">
                  {TYPES.map((t) => (
                    <label
                      key={t.valeur}
                      className={`flex items-start gap-2 rounded-[3px] border p-2 cursor-pointer text-[11.5px] ${
                        type === t.valeur ? 'border-sel bg-sel-soft' : 'border-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name="typeRegul"
                        className="mt-0.5"
                        checked={type === t.valeur}
                        onChange={() => {
                          if (porteUneCharge(t.valeur) !== porteUneCharge(type)) setCompteId('');
                          setType(t.valeur);
                          setNatureTiers('');
                          setSimulation(null);
                        }}
                      />
                      <span className="font-semibold">{t.titre}</span>
                      <Aide
                        titre={t.titre}
                        texte={estSycebnl ? t.aide : (t.aideSyscohada ?? t.aide)}
                        source={
                          t.source ??
                          (estSycebnl
                            ? t.valeur === 'SUBVENTION_PLURIANNUELLE'
                              ? 'SYCEBNL, Partie 3 ch. 6, section 1'
                              : 'SYCEBNL, postulat de spécialisation des exercices'
                            : 'AUDCIF art. 59')
                        }
                      />
                    </label>
                  ))}
                </div>

                <label className="text-[11.5px] font-semibold text-text-dim">
                  Libellé
                  <input required value={libelle} onChange={(e) => setLibelle(e.target.value)} className={champ} />
                </label>

                <label className="text-[11.5px] font-semibold text-text-dim">
                  Compte de {porteUneCharge(type) ? 'charge (classe 6)' : 'produit (classe 7)'}
                  <select required value={compteId} onChange={(e) => setCompteId(e.target.value)} className={champ}>
                    <option value="">Choisir…</option>
                    {comptes
                      .filter((c) => (porteUneCharge(type) ? c.numero.startsWith('6') : c.numero.startsWith('7')))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.numero} · {c.intitule}
                        </option>
                      ))}
                  </select>
                </label>

                {estRattachement(type) && (
                  <label className="text-[11.5px] font-semibold text-text-dim">
                    Nature du tiers
                    <select
                      required
                      value={natureTiers}
                      onChange={(e) => {
                        setNatureTiers(e.target.value as NatureTiers);
                        setSimulation(null);
                      }}
                      className={champ}
                    >
                      <option value="">Choisir…</option>
                      {naturesTiersProposees(type).map((n) => (
                        <option key={n} value={n}>
                          {LIBELLE_NATURE_TIERS[n]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="text-[11.5px] font-semibold text-text-dim">
                  {estRattachement(type) ? 'Montant de la charge ou du produit' : 'Montant total comptabilisé'}
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

                {compteTva && (
                  <label className="text-[11.5px] font-semibold text-text-dim" title={`Compte ${compteTva} · AUDCIF, Titre VII, fiches des comptes 40 et 41`}>
                    TVA ({compteTva}), si applicable
                    <input
                      value={montantTva}
                      onChange={(e) => {
                        setMontantTva(e.target.value);
                        setSimulation(null);
                      }}
                      className={`${champ} font-mono`}
                    />
                  </label>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11.5px] font-semibold text-text-dim">
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
                  <label className="text-[11.5px] font-semibold text-text-dim">
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
                  className="border border-border rounded-[3px] py-1.5 text-[11.5px] font-semibold hover:bg-chrome-alt"
                >
                  {estRattachement(type) ? 'Calculer' : 'Calculer le prorata'}
                </button>

                {simulation?.rattachement && (
                  <div className="border border-sel/30 bg-sel-soft rounded-[3px] p-2.5 text-[11.5px]">
                    <div className="flex justify-between">
                      <span>Rattaché entièrement à cet exercice</span>
                      <span className="font-mono font-bold">{montant(simulation.montantExercice)}</span>
                    </div>
                    {simulation.compteRattachement && (
                      <div className="text-[11px] text-text-dim mt-1">
                        Compte du tiers : {simulation.compteRattachement.numero} · {simulation.compteRattachement.intitule}
                      </div>
                    )}
                  </div>
                )}
                {simulation && !simulation.rattachement && (
                  <div className="border border-sel/30 bg-sel-soft rounded-[3px] p-2.5 text-[11.5px]">
                    <div className="flex justify-between">
                      <span>Rattaché à cet exercice</span>
                      <span className="font-mono font-bold">{montant(simulation.montantExercice)}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Différé aux exercices ultérieurs</span>
                      <span className="font-mono font-bold text-sel">{montant(simulation.montantDiffere)}</span>
                    </div>
                    <div className="text-[11px] text-text-dim mt-1.5 leading-[1.5] flex items-center gap-1.5">
                      <span>
                        {simulation.joursApresCloture} jour(s) sur {simulation.joursTotal} tombent après la clôture du{' '}
                        {jour(simulation.finExercice)}.
                      </span>
                      <Aide titre="Prorata" texte="Le prorata se compte en jours, pas en mois entiers." source="OmegaX" />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={envoi || !simulation || simulation.montantDiffere <= 0}
                  className="bg-sel text-white text-[11.5px] font-bold py-2 rounded-[3px] hover:brightness-110 disabled:opacity-50"
                >
                  {envoi ? 'Enregistrement…' : 'Enregistrer et passer l’écriture'}
                </button>
              </div>
            </form>
          )}

          <div
            // `overflow-x-auto` ici, `min-w` sur les lignes · les 596 px de colonnes
            // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
            // fenêtre à 360 px. Le panneau ROGNAIT (`overflow-hidden`) : la page ne
            // partait pas de côté, mais « REPRISE » était simplement invisible, sans
            // barre de défilement pour aller la chercher.
            className="border border-border rounded-[4px] overflow-x-auto"
          >
            <div className="grid grid-cols-[1fr_120px_120px_150px_150px] min-w-[750px] gap-2 px-3 py-1.5 bg-chrome-alt border-b border-border text-[11px] font-bold text-text-dim">
              <span>Libellé</span>
              <span className="text-right">TOTAL</span>
              <span className="text-right">Passé</span>
              <span>Période</span>
              <span className="flex items-center gap-1.5">
                Reprise
                {/* La colonne porte des lignes de types différents (audit final
                    F208) · sa bulle dit la date type par type, et chaque ligne
                    à reprendre porte la sienne avec sa source. */}
                <Aide titre="Date de reprise" {...resumeDatesDeReprise(utilisateur?.tenant.referentiel)} />
              </span>
            </div>
            {regularisations?.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_120px_120px_150px_150px] min-w-[750px] gap-2 px-3 py-1.5 text-[11.5px] items-center border-b border-border/40"
              >
                <span>
                  {r.libelle}
                  <span className="block text-[11px] text-text-dim font-mono">
                    {r.compteChargeProduit.numero} → {r.compteDiffere.numero}
                  </span>
                </span>
                <span className="text-right font-mono">{montant(r.montantTotal)}</span>
                <span className="text-right font-mono font-bold">{montant(r.montantDiffere)}</span>
                <span className="font-mono text-[11px]">
                  {jour(r.periodeDebut)} au {jour(r.periodeFin)}
                </span>
                <span>
                  {r.ecritureReprise ? (
                    <span className="text-[11.5px] text-positive font-semibold">
                      Reprise le {jour(r.ecritureReprise.date)}
                    </span>
                  ) : peutEcrire ? (
                    <span className="flex items-center gap-1">
                      {exercicesDeReprise(exercices, r.exerciceId).length === 0 ? (
                        // Sans exercice ouvert postérieur, la liste n'avait que son
                        // invite · le geste à faire d'abord se dit.
                        <span className="text-[11.5px] text-warning">Ouvrez d'abord l'exercice suivant (Fin d'exercice…)</span>
                      ) : (
                      <select
                        value=""
                        onChange={(e) => {
                          // UNE ÉCRITURE NE PART PAS D'UN SIMPLE CHOIX DANS UNE LISTE
                          // (audit final F79) · elle se confirme.
                          const cible = exercices.find((ex) => ex.id === e.target.value);
                          if (
                            cible &&
                            window.confirm(
                              `Passer la reprise de « ${r.libelle} » sur l’exercice ${libelleExercice(cible)} ?`,
                            )
                          ) {
                            reprendre(r.id, cible.id);
                          }
                        }}
                        className="w-full min-w-0 border border-border rounded-[4px] px-1 py-0.5 text-[11.5px]"
                      >
                        <option value="">Reprendre sur…</option>
                        {exercicesDeReprise(exercices, r.exerciceId)
                          .map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              Exercice {libelleExercice(ex)}
                            </option>
                          ))}
                      </select>
                      )}
                      <Aide titre="Date de reprise" {...aideDateReprise(utilisateur?.tenant.referentiel, r.type)} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11.5px] text-text-dim">
                      à reprendre
                      <Aide titre="Date de reprise" {...aideDateReprise(utilisateur?.tenant.referentiel, r.type)} />
                    </span>
                  )}
                </span>
              </div>
            ))}
            {erreurLecture && (
              <div className="px-3 py-4 text-[11.5px] text-danger">
                Liste des régularisations illisible · {erreurLecture}
              </div>
            )}
            {regularisations?.length === 0 && (
              <div className="px-3 py-4 text-[11.5px] text-text-dim italic">
                Aucune régularisation sur cet exercice.
              </div>
            )}
          </div>
        </div>
      )}

      {onglet === 'abonnement' && (
        <div className="border border-border bg-surface rounded-b-[10px] p-3 grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-3 items-start">
          {peutEcrire && (
            <form onSubmit={creerAbonnement} className="border border-border rounded-[4px] overflow-hidden">
              <div className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
                Nouvel abonnement
              </div>
              <div className="p-3 grid grid-cols-2 gap-2.5">
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Code
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="LOYER"
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[11.5px] font-semibold text-text-dim">
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
                <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                  Intitulé
                  <input
                    required
                    value={intitule}
                    onChange={(e) => setIntitule(e.target.value)}
                    placeholder="Loyer du bureau de Goma"
                    className={champ}
                  />
                </label>
                <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
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
                <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
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
                <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
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
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Du
                  <input
                    type="date"
                    required
                    value={aboDebut}
                    onChange={(e) => setAboDebut(e.target.value)}
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Au
                  <input
                    type="date"
                    required
                    value={aboFin}
                    onChange={(e) => setAboFin(e.target.value)}
                    className={`${champ} font-mono`}
                  />
                </label>
                <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
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
                  className="col-span-2 bg-sel text-white text-[11.5px] font-bold py-2 rounded-[3px] hover:brightness-110 disabled:opacity-50"
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
                <section key={a.id} className="border border-border rounded-[4px] overflow-hidden">
                  <header className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold">
                      <span className="font-mono">{a.code}</span> {a.intitule}
                      <span className="text-[11.5px] text-text-dim">
                        {' '}
                        · {PERIODICITES.find((p) => p.valeur === a.periodicite)?.libelle.toLowerCase()} ·{' '}
                        {montant(a.montant)} par échéance
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11.5px] text-text-dim">
                        {generees} / {a.echeances.length} passée(s)
                      </span>
                      {peutEcrire && generees < a.echeances.length && (
                        <button
                          onClick={() => genererAbonnement(a.id)}
                          className="bg-sel text-white text-[11.5px] font-bold px-2.5 py-1 rounded-[3px] hover:brightness-110"
                        >
                          Générer les échues
                        </button>
                      )}
                      {peutEcrire && (
                        <button onClick={() => void renommerAbonnement(a.id, a.intitule)} className="text-[11px] underline">
                          Renommer
                        </button>
                      )}
                      {peutEcrire && (
                        <button onClick={() => void basculerSommeil(a.id, a.estActif)} className="text-[11px] underline">
                          {a.estActif ? 'Mettre en sommeil' : 'Réactiver'}
                        </button>
                      )}
                      {estAdmin && (
                        <button onClick={() => void supprimerAbonnement(a.id, a.intitule)} className="text-[11px] underline">
                          Supprimer
                        </button>
                      )}
                    </span>
                  </header>
                  <div className="px-3 py-1.5 text-[11.5px] text-text-dim border-b border-border/40 font-mono">
                    {a.compteDebit.numero} au débit · {a.compteCredit.numero} au crédit · journal {a.journal.code}
                  </div>
                  <div className="flex flex-wrap gap-1 p-2">
                    {a.echeances.map((e) => (
                      <span
                        key={e.id}
                        title={e.ecritureId ? 'Écriture passée' : 'En attente'}
                        className={`text-[11px] font-mono px-1.5 py-0.5 rounded-[4px] border ${
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
              <div className="border border-border rounded-[4px] px-3 py-4 text-[11.5px] text-text-dim italic">
                Aucun abonnement. Un abonnement automatise une écriture répétitive : loyer, assurance,{' '}
                {estSycebnl ? "versement périodique d'une convention de financement" : 'redevance ou honoraires mensuels'}.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
