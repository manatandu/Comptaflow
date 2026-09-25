import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { ModelesSaisieModale, type LigneInseree } from '../components/ModelesSaisie';
import { Calculette } from '../components/Calculette';
import { ordonnerLignes } from '../lib/ordre-ecriture';
import type { Compte, Ecriture, Journal, PlanAnalytique, SectionAnalytique, TauxTva } from '../lib/types';
import { useAuth } from '../lib/auth';
import { construireLigneTva, modeCalculTva, montantTva, netAPayer, sensDeLaLigne } from '../lib/tva-saisie';
import { contrepartieDeLigne } from '../lib/contrepartie-tresorerie';
import { deroulerModele, lignesASaisir } from '../lib/derouler-modele';
import { dateDeLaPiece, fenetreDeSaisie, rangBorne } from '../lib/saisie-par-piece';
import { ETATS_JOURNAL, bulleCase, moisCourt, sigleCase, type LigneGrilleSaisie } from '../lib/etat-journal-saisie';

/**
 * SAISIE DES JOURNAUX · l'écran central du logiciel, calqué sur
 * Traitement → Journaux de saisie de Sage 100 i7 :
 *
 *  1. on choisit un CODE JOURNAL et une PÉRIODE (mois de l'exercice) ;
 *  2. le journal du mois s'ouvre : ses écritures existantes en grille
 *     (Jour · Pièce · Référence · N° compte · Libellé · Débit · Crédit),
 *     totalisées en pied ;
 *  3. la pièce se saisit LIGNE À LIGNE, sur N'IMPORTE QUEL compte du plan :
 *     Tab passe de zone en zone, Entrée valide la ligne, F4 (ou la frappe
 *     d'un préfixe) ouvre la liste des comptes filtrée · exactement le
 *     comportement décrit par les guides Sage. Le bouton Équilibrer complète
 *     le montant manquant ; dans un journal de trésorerie, la contrepartie
 *     s'enregistre en un clic sur le compte rattaché au journal.
 *
 * Les modèles de saisie (opérations courantes, TVA, et les écritures-types du
 * référentiel du dossier)
 * s'appellent DEPUIS cette fenêtre et ne font que pré-remplir la pièce ·
 * jamais l'inverse : la saisie libre est la règle, le modèle un accélérateur.
 */

interface LignePiece {
  compteId: string;
  numero: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  tauxTvaId?: string;
  dateEcheance?: string;
  /**
   * Date du versement ou de la mise à disposition, quand elle tombe dans un
   * autre mois que l'écriture · exception, laissée vide dans le cas ordinaire.
   * Loi n° 004/2003, art. 18 : les retenues « doivent être versées au plus
   * tard le 15 du mois qui suit celui du versement de ces revenus aux
   * bénéficiaires ou de leur mise à disposition ».
   */
  dateVersement?: string;
  /**
   * Ventilation analytique de la ligne, une section par axe · c'est la
   * « colonne ligne budgétaire » du guide Sage écrit pour une ONG, active
   * seulement sur les classes que l'axe déclare ventiler. La grille impute la
   * ligne en totalité sur une section ; un partage entre deux projets sur une
   * même ligne reste possible par l'écran des états analytiques.
   */
  sections?: Record<string, string>;
}

/** Une fiche du référentiel, servie par /controles/regles-comptes. */
interface RegleCompte {
  numero: string;
  intitule: string;
  exclusions: string | null;
  comptesAUtiliser: string[];
  elementsDeControle: string | null;
}

/** Un modèle de saisie du dossier, servi par /modeles-saisie. */
interface ModeleSaisie {
  id: string;
  intitule: string;
  journalId: string | null;
  journalCode: string | null;
  /** Modèle rattaché à un TYPE de journal (Sage : « modèles de saisie de type ACHATS »). */
  typeJournal?: string | null;
  lignes: Array<{
    ordre: number;
    compteId: string;
    compteNumero: string;
    compteIntitule: string;
    sens: 'DEBIT' | 'CREDIT';
    libelle: string | null;
    montant: number | null;
    fonction?: 'SAISIR' | 'REPETER' | 'CALCULER' | 'EQUILIBRER';
    tauxTvaId?: string | null;
  }>;
  /** Servi par /modeles-saisie · vide quand il n'y a rien à dire. */
  avertissements: string[];
}

interface Periode {
  annee: number;
  mois: number; // 0-11
  libelle: string;
}

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function periodesDeLExercice(dateDebut: string, dateFin: string): Periode[] {
  const debut = new Date(dateDebut);
  const fin = new Date(dateFin);
  const periodes: Periode[] = [];
  const curseur = new Date(debut.getFullYear(), debut.getMonth(), 1);
  while (curseur <= fin) {
    periodes.push({
      annee: curseur.getFullYear(),
      mois: curseur.getMonth(),
      libelle: `${MOIS_FR[curseur.getMonth()]} ${curseur.getFullYear()}`,
    });
    curseur.setMonth(curseur.getMonth() + 1);
  }
  return periodes;
}

function joursDansMois(annee: number, mois: number): number {
  return new Date(annee, mois + 1, 0).getDate();
}

/**
 * Pré-positionnement du curseur en débit ou crédit selon le type de journal
 * et la racine du compte · la règle exacte des codes journaux Sage (« Achats :
 * le curseur se place dans la colonne crédit si le compte mouvementé est de
 * nature Fournisseur…, débit s'il est de nature Charges », etc.), transposée
 * aux racines COMMUNES AUX DEUX PLANS (40 fournisseurs, 41 clients · adhérents
 * et clients-usagers en SYCEBNL, 42 personnel).
 */
function sensConseille(typeJournal: Journal['type'], numero: string): 'debit' | 'credit' | null {
  const deux = numero.slice(0, 2);
  const classe = numero[0];
  switch (typeJournal) {
    case 'ACHATS':
      if (deux === '40' || deux === '42') return 'credit';
      if (classe === '6' || classe === '2') return 'debit';
      return null;
    case 'VENTES':
      if (classe === '7') return 'credit';
      if (deux === '41') return 'debit';
      return null;
    case 'TRESORERIE':
      if (deux === '41' || classe === '7') return 'credit';
      if (deux === '40' || deux === '42' || classe === '6') return 'debit';
      return null;
    case 'GENERAL':
    case 'SITUATION':
      if (deux === '28' || deux === '29' || classe === '7') return 'credit';
      return null;
    default:
      return null;
  }
}

const LIBELLE_TYPE_JOURNAL: Record<Journal['type'], string> = {
  ACHATS: 'Achats',
  VENTES: 'Ventes',
  TRESORERIE: 'Trésorerie',
  GENERAL: 'Général',
  SITUATION: 'Situation',
};

export function SaisiePage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur, peutEcrire } = useAuth();
  const [journaux, setJournaux] = useState<Journal[]>([]);
  // État de chaque journal, mois par mois (fenêtre des journaux de saisie).
  const [grilleSaisie, setGrilleSaisie] = useState<LigneGrilleSaisie[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);

  // Sélection du journal et de la période (étape 1)
  const [journalId, setJournalId] = useState('');
  const [indexPeriode, setIndexPeriode] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  // SAISIE PAR PIÈCE (Sage i7) · le journal s'ouvre sur l'exercice entier, la
  // date se saisit en entier, et les pièces existantes défilent une à une.
  const [parPiece, setParPiece] = useState(false);
  const [datePiece, setDatePiece] = useState('');
  const [rangPiece, setRangPiece] = useState(0);

  // Journal ouvert (étape 2)
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [rechargement, setRechargement] = useState(0);
  const [plans, setPlans] = useState<PlanAnalytique[]>([]);
  const [sectionsParPlan, setSectionsParPlan] = useState<Record<string, SectionAnalytique[]>>({});
  const [sectionsSaisie, setSectionsSaisie] = useState<Record<string, string>>({});

  // Pièce en cours de composition
  const [jour, setJour] = useState(1);
  const [reference, setReference] = useState('');
  const [libellePiece, setLibellePiece] = useState('');
  const [lignes, setLignes] = useState<LignePiece[]>([]);

  // Ligne en cours de saisie
  const [compteSaisie, setCompteSaisie] = useState('');
  const [compteChoisi, setCompteChoisi] = useState<Compte | null>(null);
  const [libelleLigne, setLibelleLigne] = useState('');
  const [echeance, setEcheance] = useState('');
  const [versement, setVersement] = useState('');
  const [debitSaisie, setDebitSaisie] = useState('');
  const [creditSaisie, setCreditSaisie] = useState('');
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);

  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [modaleModeles, setModaleModeles] = useState(false);
  // LES MODÈLES DU JOURNAL OUVERT · la barre « Appeler un modèle » de Sage.
  // Le serveur rend ceux du journal PLUS ceux qui ne visent aucun journal.
  const [modeles, setModeles] = useState<ModeleSaisie[]>([]);
  const [modeleChoisi, setModeleChoisi] = useState('');
  // Montants des lignes « Saisir » demandés à l'appel du modèle, par ordre.
  const [saisiesModele, setSaisiesModele] = useState<Record<number, string>>({});
  // LES FICHES DU RÉFÉRENTIEL · chargées une fois par ouverture de la
  // fenêtre, pas à chaque ligne saisie (78 entrées, quelques dizaines de Ko).
  const [regles, setRegles] = useState<RegleCompte[]>([]);
  const [calculetteOuverte, setCalculetteOuverte] = useState(false);
  // LES TAUX DE TAXE · chargés une fois, pour proposer la ligne de TVA d'un
  // compte qui porte un code taxe par défaut.
  const [tauxTvaListe, setTauxTvaListe] = useState<TauxTva[]>([]);
  /**
   * LA PROPOSITION DE TVA EN ATTENTE · elle vise la ligne HT qui vient d'être
   * posée, par son INDICE, et se vide dès qu'on y touche.
   *
   * Rien n'est inséré tout seul. Sage propose le code taxe du compte dès qu'il
   * est saisi ; proposer n'est pas imputer, et une ligne de taxe qui
   * s'ajouterait d'office serait une imputation que personne n'a voulue · sur
   * une facture d'association exonérée, elle passerait inaperçue jusqu'à la
   * déclaration.
   */
  const [propositionTva, setPropositionTva] = useState<{ index: number; compteId: string; tauxTvaId: string } | null>(null);
  // Assujettissement du dossier · décide si la TVA s'ajoute d'office (voir
  // modeCalculTva). `null` tant qu'il n'est pas lu : on ne présume rien.
  const [assujettiTva, setAssujettiTva] = useState<boolean | null>(null);
  // Annonce de la ligne de TVA ajoutée d'office · une taxe posée sans un mot
  // passerait inaperçue jusqu'à la déclaration.
  const [tvaAjoutee, setTvaAjoutee] = useState<{ message: string; compteId: string; tauxTvaId: string } | null>(null);

  const compteRef = useRef<HTMLInputElement>(null);
  const libelleRef = useRef<HTMLInputElement>(null);
  const debitRef = useRef<HTMLInputElement>(null);
  const creditRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Journal[]>('/journaux').then((js) => {
      setJournaux(js);
      const premierActif = js.find((j) => j.estActif);
      if (premierActif) setJournalId((prev) => prev || premierActif.id);
    });
    api.get<Compte[]>('/comptes?actifsSeuls=true&typeCompte=DETAIL').then(setComptes);
    // Axes analytiques et leurs sections · chargés une fois, la grille en fait
    // une colonne par axe (voir docs/analytique-et-budget.md).
    api.get<PlanAnalytique[]>('/analytique/plans').then(
      async (ps) => {
        const actifs = ps.filter((p) => p.estActif);
        setPlans(actifs);
        const paires = await Promise.all(
          actifs.map(async (p) => {
            try {
              const sections = await api.get<SectionAnalytique[]>(`/analytique/plans/${p.id}/sections`);
              return [p.id, sections.filter((sc) => sc.type === 'DETAIL' && sc.estActive)] as const;
            } catch {
              return [p.id, [] as SectionAnalytique[]] as const;
            }
          }),
        );
        setSectionsParPlan(Object.fromEntries(paires));
      },
      () => setPlans([]),
    );
  }, []);

  /**
   * Un axe ne ventile que certaines classes du plan de comptes, les mêmes dans
   * les deux référentiels · la colonne reste
   * grisée sur une ligne de trésorerie ou de tiers, exactement comme la zone
   * « ligne budgétaire » du guide Sage, active « seulement lorsqu'un compte
   * d'immobilisation, de charges ou de produits est utilisé ».
   */
  const axeConcerne = (plan: PlanAnalytique, compte: Compte | null) =>
    !!compte && plan.classesVentilees.split(',').includes(compte.classe.replace('CLASSE_', ''));

  /** Axes visibles dans la grille : ceux qui ont au moins une section. */
  const axesGrille = useMemo(
    () => plans.filter((p) => (sectionsParPlan[p.id] ?? []).length > 0),
    [plans, sectionsParPlan],
  );

  /**
   * Raccourcis de la grille · repris des manuels Sage, où ils sont ce qui
   * distingue une saisie fluide d'une saisie pénible : Ctrl+D duplique la
   * dernière ligne, Ctrl+K ouvre la calculette, F5 recharge le journal.
   *
   * `capture: false` et le test sur la cible : un raccourci ne doit pas
   * partir pendant que l'utilisateur tape dans un champ de recherche ailleurs
   * dans l'écran.
   */
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        setRechargement((n) => n + 1);
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      const touche = e.key.toLowerCase();
      if (touche === 'd') {
        e.preventDefault();
        setLignes((prev) => {
          if (prev.length === 0) return prev;
          const derniere = prev[prev.length - 1];
          return [...prev, { ...derniere, debit: 0, credit: 0, sections: { ...(derniere.sections ?? {}) } }];
        });
      } else if (touche === 'k') {
        e.preventDefault();
        setCalculetteOuverte(true);
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  const periodes = useMemo(
    () => (exerciceCourant ? periodesDeLExercice(exerciceCourant.dateDebut, exerciceCourant.dateFin) : []),
    [exerciceCourant],
  );

  // La grille se relit à chaque retour à l'étape 1 · une pièce validée ou
  // saisie entre-temps change l'état de sa case.
  useEffect(() => {
    if (ouvert || !exerciceCourant) return;
    api
      .get<{ journaux: LigneGrilleSaisie[] }>(`/journaux/saisie?exerciceId=${exerciceCourant.id}`)
      .then((r) => setGrilleSaisie(r.journaux))
      .catch(() => setGrilleSaisie([]));
  }, [ouvert, exerciceCourant?.id]);

  // Période par défaut : le mois courant s'il appartient à l'exercice.
  useEffect(() => {
    if (!periodes.length) return;
    const maintenant = new Date();
    const i = periodes.findIndex((p) => p.annee === maintenant.getFullYear() && p.mois === maintenant.getMonth());
    if (i >= 0) setIndexPeriode(i);
  }, [periodes]);

  const journal = journaux.find((j) => j.id === journalId) ?? null;
  const periode = periodes[indexPeriode] ?? null;
  // « AAAA-MM » de la période ouverte · sert à dire au comptable qu'une date
  // de versement tombant dans ce mois-là n'a rien à apporter, la date de
  // l'écriture faisant déjà foi.
  const moisDeLaPeriode = parPiece
    ? datePiece.slice(0, 7) || null
    : periode
      ? `${periode.annee}-${String(periode.mois + 1).padStart(2, '0')}`
      : null;

  // Chargement des écritures du journal ouvert, sur la période.
  useEffect(() => {
    if (!ouvert || !exerciceCourant || !journal) return;
    const fenetre = fenetreDeSaisie(parPiece, periode, exerciceCourant);
    if (!fenetre) return;
    let annule = false;
    const { debut, fin } = fenetre;
    api
      .get<{ ecritures: Ecriture[] }>(
        `/ecritures?exerciceId=${exerciceCourant.id}&journalId=${journal.id}&dateDebut=${debut}&dateFin=${fin}`,
      )
      .then((r) => {
        if (annule) return;
        setEcritures(r.ecritures);
        // Par pièce, la dernière pièce s'affiche · celle qu'on vient
        // d'enregistrer, ou la plus récente à l'ouverture.
        setRangPiece(r.ecritures.length - 1);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, journalId, indexPeriode, parPiece, exerciceCourant?.id, rechargement]);

  // ------- Pièce en cours -------
  const totalDebitPiece = lignes.reduce((s, l) => s + l.debit, 0);
  const totalCreditPiece = lignes.reduce((s, l) => s + l.credit, 0);
  const soldePiece = Math.round((totalDebitPiece - totalCreditPiece) * 100) / 100;
  const equilibree = Math.abs(soldePiece) < 0.005 && lignes.length >= 2;

  const numerosDuPlan = useMemo(() => new Set(comptes.map((c) => c.numero)), [comptes]);

  const comptesFiltres = useMemo(() => {
    const q = compteSaisie.trim().toLowerCase();
    if (!q) return comptes.slice(0, 14);
    return comptes
      .filter((c) => c.numero.startsWith(q) || c.intitule.toLowerCase().includes(q))
      .slice(0, 14);
  }, [comptes, compteSaisie]);

  const choisirCompte = (c: Compte) => {
    setCompteChoisi(c);
    setCompteSaisie(c.numero);
    // NET À PAYER · le compte de tiers d'un journal d'achats ou de ventes
    // reçoit d'office le montant qui équilibre la pièce, modifiable.
    if (!debitSaisie && !creditSaisie) {
      const nap = netAPayer({ typeJournal: journal?.type, numeroCompte: c.numero, soldePiece });
      if (nap) {
        setDebitSaisie(nap.debit ? String(nap.debit) : '');
        setCreditSaisie(nap.credit ? String(nap.credit) : '');
      }
    }
    setPickerOuvert(false);
    libelleRef.current?.focus();
  };

  const focusMontantConseille = () => {
    if (!journal || !compteChoisi) {
      debitRef.current?.focus();
      return;
    }
    const sens = sensConseille(journal.type, compteChoisi.numero);
    (sens === 'credit' ? creditRef : debitRef).current?.focus();
  };

  const validerLigne = () => {
    setErreur(null);
    if (!compteChoisi) {
      setErreur('Choisissez un compte (tapez son préfixe, ou F4 pour la liste).');
      compteRef.current?.focus();
      return;
    }
    const d = Number(debitSaisie) || 0;
    const c = Number(creditSaisie) || 0;
    if (d <= 0 && c <= 0) {
      setErreur('Saisissez un montant au débit ou au crédit.');
      focusMontantConseille();
      return;
    }
    if (d > 0 && c > 0) {
      setErreur('Une ligne porte un montant au débit OU au crédit, pas les deux.');
      return;
    }
    setLignes((prev) => [
      ...prev,
      {
        compteId: compteChoisi.id,
        numero: compteChoisi.numero,
        intitule: compteChoisi.intitule,
        libelle: libelleLigne || libellePiece,
        debit: d,
        credit: c,
        dateEcheance: echeance || undefined,
        dateVersement: versement || undefined,
        // On ne retient que les axes qui ventilent la classe du compte : une
        // section restée sélectionnée d'une ligne précédente ne doit pas
        // suivre sur une ligne de trésorerie.
        sections: Object.fromEntries(
          axesGrille
            .filter((p) => axeConcerne(p, compteChoisi) && sectionsSaisie[p.id])
            .map((p) => [p.id, sectionsSaisie[p.id]]),
        ),
      },
    ]);
    // CODE TAXE PAR DÉFAUT · Sage porte un taux sur la fiche compte et le
    // PROPOSE dès que ce compte est saisi. La grille ne le faisait pas : seule
    // la modale « Achat / Vente avec TVA » le lisait, et le comptable qui
    // saisit sa facture ligne à ligne devait connaître de tête le compte de
    // taxe et calculer ses 16 %.
    //
    // La proposition vise la ligne qu'on vient de poser (son indice est
    // `prev.length` avant l'ajout, donc `lignes.length` ici) et attend un
    // geste · rien ne s'insère seul.
    // CONTREPARTIE À CHAQUE LIGNE · option du journal de trésorerie (Sage i7,
    // « Générer une contrepartie à chaque ligne »). La ligne saisie reçoit
    // aussitôt sa ligne sur le compte de trésorerie du journal, même libellé,
    // sens inverse · jamais sur la ligne de trésorerie elle-même, qui se
    // solderait contre elle-même.
    const contrepartie = contrepartieDeLigne({
      journal,
      compteLigneId: compteChoisi.id,
      comptes,
      debit: d,
      credit: c,
      libelle: libelleLigne || libellePiece,
    });
    if (contrepartie) setLignes((prev) => [...prev, contrepartie]);

    // Trois régimes (lib/tva-saisie.ts, modeCalculTva) · rien hors achats et
    // ventes, d'office pour un dossier déclaré assujetti, proposé sinon.
    // L'annonce d'une taxe ajoutée d'office RESTE jusqu'à l'enregistrement de
    // la pièce · effacée à la ligne suivante, elle ne se lirait pas.
    const mode = modeCalculTva(journal?.type, assujettiTva);
    const tauxDefaut = compteChoisi.tauxTvaDefautId
      ? tauxTvaListe.find((t) => t.id === compteChoisi.tauxTvaDefautId)
      : undefined;
    const sensHt = sensDeLaLigne({ debit: d, credit: c });
    const auto =
      mode === 'AUTO' && tauxDefaut && sensHt
        ? construireLigneTva({
            referentiel: utilisateur?.tenant.referentiel,
            sens: sensHt,
            contrepartie: { id: compteChoisi.id, numero: compteChoisi.numero, intitule: compteChoisi.intitule },
            ht: d || c,
            taux: tauxDefaut,
            comptes,
            numerosDuPlan,
          })
        : null;
    if (auto?.ligne) {
      const l = auto.ligne;
      setLignes((prev) => [
        ...prev,
        {
          compteId: l.compteId,
          numero: l.numero,
          intitule: l.intitule,
          libelle: l.libelle,
          debit: l.debit,
          credit: l.credit,
          tauxTvaId: l.tauxTvaId,
        },
      ]);
      setTvaAjoutee({
        message: `TVA ajoutée d'office : ${l.numero} · ${tauxDefaut!.code} ${Number(tauxDefaut!.taux)} % de ${(d || c).toLocaleString('fr-FR')} = ${(l.debit || l.credit).toLocaleString('fr-FR')}.`,
        compteId: l.compteId,
        tauxTvaId: l.tauxTvaId!,
      });
      setPropositionTva(null);
    } else if (mode !== 'AUCUN' && compteChoisi.tauxTvaDefautId) {
      // PROPOSE, ou AUTO impossible (compte de taxe non rattaché) · la bande
      // s'affiche avec son motif plutôt qu'un silence.
      setPropositionTva({ index: lignes.length, compteId: compteChoisi.id, tauxTvaId: compteChoisi.tauxTvaDefautId });
    } else {
      setPropositionTva(null);
    }
    // « Répéter » façon modèle Sage : le libellé reste, le compte et les
    // montants se vident, le curseur revient au compte.
    setCompteChoisi(null);
    setCompteSaisie('');
    setDebitSaisie('');
    setCreditSaisie('');
    setEcheance('');
    setVersement('');
    compteRef.current?.focus();
  };

  const retirerLigne = (i: number) => {
    setLignes((prev) => prev.filter((_, idx) => idx !== i));
    setPropositionTva(null);
  };

  /**
   * DUPLIQUER (Ctrl+D) · la commande la plus utilisée d'un comptable qui
   * saisit quarante cotisations identiques. La copie reprend tout SAUF le
   * montant, qu'on remet à zéro : dupliquer une ligne en gardant son montant
   * déséquilibrerait la pièce sans que rien ne le signale, et l'erreur la plus
   * coûteuse est celle qu'un automatisme commet à notre place.
   */
  const dupliquerLigne = (i: number) => {
    setLignes((prev) => {
      const source = prev[i];
      if (!source) return prev;
      const copie = [...prev];
      copie.splice(i + 1, 0, { ...source, debit: 0, credit: 0, sections: { ...(source.sections ?? {}) } });
      return copie;
    });
  };

  /**
   * INVERSEUR · bascule le montant d'une ligne du débit au crédit et
   * réciproquement.
   *
   * Attention à ne pas le confondre avec l'extourne des progiciels français,
   * que les deux référentiels proscrivent comme mode de CORRECTION : l'article
   * 20 de l'AUDCIF, repris par le SYCEBNL, n'admet que l'inscription en négatif. Ici, rien n'est corrigé ·
   * on redresse le sens d'une ligne d'une pièce EN COURS DE COMPOSITION, qui
   * n'est pas encore enregistrée et n'existe donc pour personne.
   */
  const inverserLigne = (i: number) => {
    setLignes((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, debit: l.credit, credit: l.debit } : l)),
    );
  };

  /** Bascule le sens de la ligne en cours de frappe, avant sa validation. */
  const inverserSaisie = () => {
    const d = debitSaisie;
    setDebitSaisie(creditSaisie);
    setCreditSaisie(d);
  };

  /*
    Saisie des journaux · c'est la fenêtre où les verbes de Sage sont les plus
    littéraux. « Inverseur » bascule le sens de la ligne en cours de frappe,
    exactement comme le bouton Inverseur de la barre de Sage. La calculette
    reste, elle, à demeure dans la barre : elle ne dépend d'aucune fenêtre.
  */

  /**
   * CE QUE LA PROPOSITION POSERAIT · recalculé à chaque rendu, jamais rangé.
   *
   * La ligne visée est retrouvée par son indice ET son compte : une
   * suppression ou un déplacement invalide la proposition au lieu de la
   * reporter sur la ligne voisine, ce qui poserait une taxe sur une opération
   * qui ne la porte pas.
   *
   * Le SENS vient de la ligne elle-même, pas de la classe du compte · un
   * compte de charge peut être crédité (avoir fournisseur), et lire la classe
   * ferait déduire une taxe là où elle se reverse.
   */
  const apercuTva = useMemo(() => {
    if (!propositionTva) return null;
    const ligneHt = lignes[propositionTva.index];
    if (!ligneHt || ligneHt.compteId !== propositionTva.compteId) return null;
    const taux = tauxTvaListe.find((t) => t.id === propositionTva.tauxTvaId);
    if (!taux) return null;
    const sens = sensDeLaLigne(ligneHt);
    if (!sens) return null;
    const ht = ligneHt.debit || ligneHt.credit;
    const resultat = construireLigneTva({
      referentiel: utilisateur?.tenant.referentiel,
      sens,
      contrepartie: { id: ligneHt.compteId, numero: ligneHt.numero, intitule: ligneHt.intitule },
      ht,
      taux,
      comptes,
      numerosDuPlan,
    });
    return { ligneHt, taux, sens, ht, montant: montantTva(ht, taux), resultat };
  }, [propositionTva, lignes, tauxTvaListe, comptes, numerosDuPlan, utilisateur?.tenant.referentiel]);

  const retirerTvaAjoutee = () => {
    if (!tvaAjoutee) return;
    setLignes((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].compteId === tvaAjoutee.compteId && prev[i].tauxTvaId === tvaAjoutee.tauxTvaId) {
          return [...prev.slice(0, i), ...prev.slice(i + 1)];
        }
      }
      return prev;
    });
    setTvaAjoutee(null);
  };

  const poserLigneTva = () => {
    if (!apercuTva?.resultat.ligne) return;
    const l = apercuTva.resultat.ligne;
    setLignes((prev) => [
      ...prev,
      {
        compteId: l.compteId,
        numero: l.numero,
        intitule: l.intitule,
        libelle: l.libelle,
        debit: l.debit,
        credit: l.credit,
        // Le taux est porté par la LIGNE DE TVA, jamais par la ligne HT · voir
        // lib/tva-saisie.ts et le commentaire de LigneEcriture.tauxTvaId.
        tauxTvaId: l.tauxTvaId,
      },
    ]);
    setPropositionTva(null);
  };

  const equilibrer = () => {
    if (Math.abs(soldePiece) < 0.005) return;
    if (soldePiece > 0) {
      setCreditSaisie(String(Math.abs(soldePiece)));
      setDebitSaisie('');
      creditRef.current?.focus();
    } else {
      setDebitSaisie(String(Math.abs(soldePiece)));
      setCreditSaisie('');
      debitRef.current?.focus();
    }
  };

  const contrepartieTresorerie = () => {
    if (!journal?.compteTresorerieId || Math.abs(soldePiece) < 0.005) return;
    const compteTreso = comptes.find((c) => c.id === journal.compteTresorerieId);
    if (!compteTreso) {
      setErreur('Le compte de trésorerie du journal est introuvable dans le plan comptable.');
      return;
    }
    setLignes((prev) => [
      ...prev,
      {
        compteId: compteTreso.id,
        numero: compteTreso.numero,
        intitule: compteTreso.intitule,
        libelle: libellePiece || 'Contrepartie trésorerie',
        debit: soldePiece < 0 ? Math.abs(soldePiece) : 0,
        credit: soldePiece > 0 ? soldePiece : 0,
      },
    ]);
  };

  useEffect(() => {
    let annule = false;
    api
      .get<RegleCompte[]>('/controles/regles-comptes')
      .then((r) => !annule && setRegles(r), () => !annule && setRegles([]));
    api
      .get<TauxTva[]>('/taux-tva?actifsSeuls=true')
      .then((t) => !annule && setTauxTvaListe(t), () => !annule && setTauxTvaListe([]));
    api
      .get<{ assujettiTva: boolean }>('/dossier/parametres')
      .then((p) => !annule && setAssujettiTva(p.assujettiTva), () => !annule && setAssujettiTva(null));
    return () => {
      annule = true;
    };
  }, []);

  /**
   * LA FICHE QUI GOUVERNE LE COMPTE CHOISI · la PLUS PRÉCISE qui le préfixe.
   *
   * Les fiches sont à deux chiffres, sauf trois qui descendent à trois (603,
   * 659, 759) parce que le texte y descend. Un compte 65910000 relève de la
   * fiche 659 et non de la fiche 65, qui dit autre chose · prendre la
   * première trouvée afficherait l'avertissement du compte père.
   */
  const regleDuCompte = compteChoisi
    ? regles
        .filter((r) => compteChoisi.numero.startsWith(r.numero))
        .sort((a, b) => b.numero.length - a.numero.length)[0]
    : undefined;

  useEffect(() => {
    if (!journal) {
      setModeles([]);
      return;
    }
    let annule = false;
    api
      .get<ModeleSaisie[]>(`/modeles-saisie?journalId=${journal.id}`)
      .then((r) => !annule && setModeles(r), () => !annule && setModeles([]));
    return () => {
      annule = true;
    };
  }, [journal?.id]);

  /**
   * APPLIQUER UN MODÈLE · on ajoute ses lignes à la pièce en cours, on ne la
   * remplace pas. Chez Sage, appliquer un modèle sur une grille déjà commencée
   * complète la pièce · écraser ferait perdre une saisie en cours sans
   * confirmation.
   *
   * Les montants du modèle sont facultatifs : une ligne sans montant arrive à
   * zéro, le comptable la chiffre. C'est le cas le plus fréquent, et c'est
   * pour cela que le modèle sert.
   */
  const appliquerModele = () => {
    const modele = modeles.find((m) => m.id === modeleChoisi);
    if (!modele) return;
    /*
      L'ORDRE CONVENTIONNEL S'APPLIQUE À L'INSERTION, JAMAIS AU STOCKAGE.

      Le champ `ordre` du modèle reste tel que le cabinet l'a posé · rien
      n'est réécrit en base, et rouvrir le modèle le montre inchangé. Ce qui
      est ordonné, c'est la PIÈCE qu'on vient de remplir, pour qu'elle se lise
      comme le Guide d'application présente ses écritures : les débits, puis
      les crédits, la TVA après les comptes de nature (Partie 1 ch. 2,
      Applications 1 et 2).
    */
    // FONCTIONS DE LIGNE (Sage i7) · Saisir, Répéter, Calculer, Équilibrer,
    // déroulées par lib/derouler-modele.ts. Seules les lignes « Saisir » sans
    // montant figé ont été demandées ; le reste se calcule.
    const saisies = Object.fromEntries(
      Object.entries(saisiesModele).map(([k, v]) => [Number(k), Number(v.replace(',', '.')) || 0]),
    );
    const deroule = deroulerModele(modele.lignes, saisies, tauxTvaListe);
    setLignes((prev) => [...prev, ...ordonnerLignes(deroule.lignes)]);
    if (deroule.motif) setErreur(deroule.motif);
    setSaisiesModele({});
    if (!libellePiece) setLibellePiece(modele.intitule);
  };

  const insererModele = (nouvelles: LigneInseree[], libelleSuggere: string) => {
    setLignes((prev) => [
      ...prev,
      ...nouvelles.map((l) => ({
        compteId: l.compteId,
        numero: l.numero,
        intitule: l.intitule,
        libelle: l.libelle,
        debit: l.debit,
        credit: l.credit,
        tauxTvaId: l.tauxTvaId,
      })),
    ]);
    if (!libellePiece) setLibellePiece(libelleSuggere);
    setModaleModeles(false);
  };

  const abandonnerPiece = () => {
    setLignes([]);
    setTvaAjoutee(null);
    setReference('');
    setLibellePiece('');
    setErreur(null);
  };

  // AUDCIF art. 22, 4° · le serveur refuse une pièce datée d'une période
  // clôturée et dit que le texte permet de la reporter au premier jour ouvert.
  // Le report n'est JAMAIS fait d'office : il se demande par ce second envoi.
  // Même chemin pour le COMPTE EN SOMMEIL · la saisie se confirme (règle de
  // Sage, voir EcritureService.verifierComptesEnSommeil). Un objet d'options,
  // jamais un booléen positionnel : `onClick={enregistrerPiece}` passerait
  // l'événement du clic comme demande.
  const enregistrerPiece = async (
    { reporterAuPremierJourOuvert = false, confirmerComptesEnSommeil = false } = {} as {
      reporterAuPremierJourOuvert?: boolean;
      confirmerComptesEnSommeil?: boolean;
    },
  ) => {
    if (!exerciceCourant || !journal) return;
    setErreur(null);
    setSucces(null);
    const datee = dateDeLaPiece({ parPiece, datePiece, periode, jour, exercice: exerciceCourant });
    if ('motif' in datee) {
      setErreur(datee.motif);
      return;
    }
    if (!journal.estActif) {
      setErreur(`Le journal ${journal.code} est en sommeil · réactivez-le dans Codes journaux avant de saisir.`);
      return;
    }
    if (!equilibree) {
      setErreur('La pièce doit comporter au moins deux lignes et être équilibrée (débit = crédit).');
      return;
    }
    setEnvoi(true);
    try {
      const { date } = datee;
      await api.post('/ecritures', {
        exerciceId: exerciceCourant.id,
        journalId: journal.id,
        date,
        libelle:
          libellePiece || `Pièce du ${date.slice(8, 10)}/${date.slice(5, 7)}`,
        reference: reference || undefined,
        ...(reporterAuPremierJourOuvert ? { reporterAuPremierJourOuvert: true } : {}),
        ...(confirmerComptesEnSommeil ? { confirmerComptesEnSommeil: true } : {}),
        lignes: lignes.map((l) => ({
          compteId: l.compteId,
          libelle: l.libelle || undefined,
          debit: l.debit || undefined,
          credit: l.credit || undefined,
          tauxTvaId: l.tauxTvaId,
          dateEcheance: l.dateEcheance,
          dateVersement: l.dateVersement,
          // Une section par axe, imputée pour la totalité de la ligne · le
          // serveur vérifie cet équilibre axe par axe.
          ventilations: Object.values(l.sections ?? {})
            .filter(Boolean)
            .map((sectionId) => ({ sectionId, debit: l.debit || undefined, credit: l.credit || undefined })),
        })),
      });
      setSucces(
        reporterAuPremierJourOuvert
          ? 'Pièce enregistrée au premier jour de la période ouverte, sa date réelle gardée comme date de valeur (AUDCIF art. 22, 4°).'
          : 'Pièce enregistrée au journal.',
      );
      setLignes([]);
      setTvaAjoutee(null);
      setReference('');
      setLibellePiece('');
      setRechargement((n) => n + 1);
      compteRef.current?.focus();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setEnvoi(false);
    }
  };

  // Totaux du journal (écritures existantes de la période) · mémoïsés : le
  // double reduce parcourait toutes les lignes à CHAQUE frappe dans la grille.
  const { totalDebitJournal, totalCreditJournal } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const e of ecritures)
      for (const l of e.lignes) {
        d += Number(l.debit);
        c += Number(l.credit);
      }
    return { totalDebitJournal: d, totalCreditJournal: c };
  }, [ecritures]);

  // Par pièce, la grille ne montre qu'UNE pièce à la fois, que [Précédent] et
  // [Suivant] font défiler · le manuel i7 décrit exactement cette navigation.
  const rangAffiche = rangBorne(rangPiece, ecritures.length);
  const ecrituresAffichees = parPiece ? ecritures.slice(rangAffiche, rangAffiche + 1) : ecritures;

  // La grille gagne une colonne par axe analytique doté de sections · sans
  // axe, elle retrouve exactement sa largeur d'origine.
  const grille = 'grid gap-2';
  const grilleStyle = {
    gridTemplateColumns: `44px 58px 92px 108px ${axesGrille.map(() => '104px ').join('')}1fr 112px 112px 30px`,
  } as const;

  // ============ ÉTAPE 1 · choix du journal et de la période ============
  if (!ouvert) {
    return (
      <div className="p-3 flex justify-center">
        <div className="w-full max-w-[980px]">
          <div className="bg-surface border border-border shadow-posee">
            <div className="px-4 py-2 bg-surface-alt border-b border-border text-[11.5px] font-semibold text-text-dim">
              Sélectionnez le journal et la période de saisie
            </div>
            <div className="p-4">
              {/* LA FENÊTRE DES JOURNAUX DE SAISIE (Sage i7, point 17) ·
                  chaque journal, chaque mois, et l'état de la case. Un clic
                  choisit le journal ET le mois, un double clic ouvre. */}
              <div className="border border-border mb-2 max-h-[340px] overflow-auto">
                <table className="text-[11.5px] min-w-full">
                  <thead>
                    <tr>
                      <th className="text-left sticky left-0 bg-surface-alt">Code</th>
                      <th className="text-left">Intitulé</th>
                      {periodes.map((p) => (
                        <th key={p.libelle} className="text-center px-1" title={p.libelle}>
                          {moisCourt(p.mois)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {journaux.map((j) => {
                      const ligne = grilleSaisie.find((l) => l.id === j.id);
                      return (
                        <tr key={j.id} className={journalId === j.id ? 'font-semibold' : ''}>
                          <td className="sticky left-0 bg-surface">
                            <button type="button" onClick={() => setJournalId(j.id)} className="font-semibold">
                              {j.code}
                            </button>
                          </td>
                          <td title={LIBELLE_TYPE_JOURNAL[j.type]} className={j.estActif ? '' : 'text-warning'}>
                            {j.intitule}
                            {!j.estActif && ' (en sommeil)'}
                          </td>
                          {periodes.map((p, i) => {
                            const c = ligne?.cases.find((x) => x.mois === `${p.annee}-${String(p.mois + 1).padStart(2, '0')}`);
                            const choisie = journalId === j.id && indexPeriode === i && !parPiece;
                            return (
                              <td key={p.libelle} className="p-0 text-center">
                                <button
                                  type="button"
                                  aria-label={`${j.code} ${p.libelle}`}
                                  title={c ? `${p.libelle} · ${bulleCase(c)}` : p.libelle}
                                  onClick={() => {
                                    setJournalId(j.id);
                                    setIndexPeriode(i);
                                    setParPiece(false);
                                  }}
                                  onDoubleClick={() => {
                                    setJournalId(j.id);
                                    setIndexPeriode(i);
                                    setParPiece(false);
                                    setOuvert(true);
                                    setSucces(null);
                                    setErreur(null);
                                  }}
                                  className={`w-full min-w-[30px] h-[22px] text-[10.5px] font-bold ${c ? ETATS_JOURNAL[c.etat].classe : ''} ${
                                    choisie ? 'outline outline-2 outline-sel -outline-offset-2' : ''
                                  }`}
                                >
                                  {c ? sigleCase(c) : ''}
                                  {c?.figeJusquau ? '·' : ''}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {journaux.length === 0 && (
                      <tr>
                        <td colSpan={2 + periodes.length} className="italic text-text-dim">
                          Aucun journal · créez-les dans Structure → Codes journaux.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3 mb-3 text-[10.5px] text-text-dim">
                {(['BROUILLARD', 'JOURNAL', 'CLOTURE'] as const).map((e) => (
                  <span key={e} className="flex items-center gap-1">
                    <span className={`inline-block w-[16px] text-center font-bold ${ETATS_JOURNAL[e].classe}`}>{ETATS_JOURNAL[e].sigle}</span>
                    {ETATS_JOURNAL[e].libelle}
                  </span>
                ))}
                <span>· figé en cours de mois</span>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[11.5px]">Période :</label>
                <select
                  disabled={parPiece}
                  value={indexPeriode}
                  onChange={(e) => setIndexPeriode(Number(e.target.value))}
                  className="border border-border-dark px-2 py-1 text-[11.5px]"
                >
                  {periodes.map((p, i) => (
                    <option key={p.libelle} value={i}>
                      {p.libelle}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-[11.5px]" title="Sage i7 · Saisie par pièce">
                  <input type="checkbox" checked={parPiece} onChange={(e) => setParPiece(e.target.checked)} />
                  Saisie par pièce
                </label>
                <div className="flex-1" />
                <button
                  type="button"
                  disabled={!journalId || (!parPiece && !periode)}
                  onClick={() => {
                    setOuvert(true);
                    setSucces(null);
                    setErreur(null);
                  }}
                  className="bg-sel text-white px-5 py-1.5 text-[11.5px] font-semibold disabled:opacity-50"
                >
                  Ouvrir le journal
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ ÉTAPE 2 · le journal du mois, grille de saisie ============
  return (
    <div className="p-2">
      {/* En-tête du journal ouvert */}
      <div className="flex items-center justify-between mb-2">
        {/* Le journal et la période ouverts sont une donnée, pas le titre de
            la fenêtre · Sage les porte aussi dans sa barre de titre. */}
        <div className="text-[12px] font-bold leading-tight">
          Journal {journal?.code} · {journal?.intitule} · {parPiece ? 'saisie par pièce' : periode?.libelle}
        </div>
        <button
          type="button"
          onClick={() => {
            setOuvert(false);
            abandonnerPiece();
          }}
          className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px]"
        >
          Changer de journal / période
        </button>
      </div>

      {/* APPELER UN MODÈLE · la barre de Sage, DANS la fenêtre du journal et
          non dans une boîte de dialogue à part : on ne quitte pas la grille.
          Absente tant que le dossier n'a défini aucun modèle · une liste vide
          n'apprend rien et prend une ligne. */}
      {peutEcrire && modeles.length > 0 && (
        <div className="flex items-center gap-2 mb-2 bg-chrome border border-border px-2.5 py-1.5">
          <span className="text-[11.5px] text-text-dim flex-shrink-0">Appeler un modèle</span>
          <select
            value={modeleChoisi}
            onChange={(e) => {
              setModeleChoisi(e.target.value);
              setSaisiesModele({});
            }}
            // F4 ouvre la liste, comme chez Sage (« appuyer sur la touche F4
            // pour afficher la liste des modèles de saisie »).
            onKeyDown={(e) => {
              if (e.key === 'F4') {
                e.preventDefault();
                (e.currentTarget as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
              }
            }}
            title="F4 : liste des modèles"
            className="flex-1 min-w-0 border border-border bg-surface px-2 py-1 text-[11.5px]"
          >
            <option value="">Modèle de saisie…</option>
            {modeles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.intitule}
                {m.journalCode || m.typeJournal ? '' : ' · tous journaux'}
              </option>
            ))}
          </select>
          {(() => {
            const m = modeles.find((x) => x.id === modeleChoisi);
            return m
              ? lignesASaisir(m.lignes).map((l) => (
                  <label key={l.ordre} className="flex items-center gap-1 text-[11.5px] flex-shrink-0">
                    <span className="text-text-dim">{l.compteNumero}</span>
                    <input
                      inputMode="decimal"
                      value={saisiesModele[l.ordre] ?? ''}
                      onChange={(e) => setSaisiesModele((s) => ({ ...s, [l.ordre]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') appliquerModele();
                      }}
                      placeholder="montant"
                      className="w-[110px] border border-border bg-surface px-2 py-1 text-right"
                    />
                  </label>
                ))
              : null;
          })()}
          <button
            type="button"
            onClick={appliquerModele}
            disabled={!modeleChoisi}
            className="flex-shrink-0 border border-border-dark bg-chrome-alt hover:bg-sel-soft disabled:opacity-40 px-3 py-1 text-[11.5px]"
          >
            Appliquer
          </button>
        </div>
      )}

      {/*
        LA RÉSERVE SE LIT AVANT D'APPLIQUER, PAS APRÈS.

        Le serveur diagnostique chaque modèle du dossier (voir
        `modeles-saisie/diagnostic-tiers.ts`) · un modèle qui solde une charge
        ou un produit directement sur la trésorerie est signalé, avec le texte
        des deux référentiels. On l'affiche ici, sur le modèle CHOISI, parce
        que c'est la seconde d'avant le clic qui décide.
      */}
      {modeleChoisi &&
        (modeles.find((m) => m.id === modeleChoisi)?.avertissements ?? []).map((a, i) => (
          <p
            key={i}
            className="mb-2 border border-warning/50 bg-warning/5 px-2.5 py-2 text-[11px] leading-[1.55]"
          >
            {a}
          </p>
        ))}

      <div className="bg-surface border border-border shadow-posee">
        {/* En-tête de colonnes · la grille Sage : Jour · Pièce · Référence · Compte · Libellé · Débit · Crédit */}
        <div
          style={grilleStyle} className={`${grille} px-3 py-1.5 bg-surface-alt border-b border-border-dark text-[11px] font-bold text-text-dim`}
        >
          <span>JOUR</span>
          <span>Pièce</span>
          <span>Référence</span>
          <span>N° compte</span>
          {axesGrille.map((p) => (
            <span key={p.id} title={p.intitule}>
              {p.code}
            </span>
          ))}
          <span>Libellé écriture</span>
          <span className="text-right">Débit</span>
          <span className="text-right">Crédit</span>
          <span />
        </div>

        {/* Écritures existantes de la période */}
        {parPiece && ecritures.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1 border-b border-border text-[11.5px]">
            <button
              type="button"
              disabled={rangAffiche === 0}
              onClick={() => setRangPiece(rangAffiche - 1)}
              className="border border-border-dark bg-chrome px-2 py-[1px] disabled:opacity-40"
            >
              ◀ Précédent
            </button>
            <span className="text-text-dim">
              Pièce {rangAffiche + 1} / {ecritures.length}
            </span>
            <button
              type="button"
              disabled={rangAffiche >= ecritures.length - 1}
              onClick={() => setRangPiece(rangAffiche + 1)}
              className="border border-border-dark bg-chrome px-2 py-[1px] disabled:opacity-40"
            >
              Suivant ▶
            </button>
          </div>
        )}
        <div className="max-h-[34vh] overflow-auto">
          {ecrituresAffichees.map((e) => {
            const jourE = new Date(e.date).getDate();
            const annulee = !!e.correction;
            return e.lignes.map((l, i) => (
              <div
                key={l.id}
                style={grilleStyle} className={`${grille} px-3 py-[3px] border-b border-border/60 text-[11.5px] items-center ${
                  annulee ? 'opacity-50 line-through decoration-danger/60' : ''
                } ${i === 0 ? 'border-t border-border' : ''}`}
              >
                <span
                  className="font-mono text-text-dim"
                  title={
                    i === 0 && e.dateValeur
                      ? `Date de valeur ${new Date(e.dateValeur).toLocaleDateString('fr-FR')} · reportée d'une période clôturée (AUDCIF art. 22, 4°)`
                      : undefined
                  }
                >
                  {i === 0 ? String(jourE).padStart(2, '0') : ''}
                  {i === 0 && e.dateValeur && <span className="ml-0.5 text-[10px] font-bold text-warning">V</span>}
                </span>
                <span className="font-mono text-text-dim">
                  {i === 0 ? (e.numeroPiece ?? '·') : ''}
                  {i === 0 && e.statut === 'BROUILLARD' && (
                    <span className="ml-1 text-[11px] font-bold text-warning" title="En brouillard · pas encore au livre-journal">
                      B
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-text-dim truncate">
                  {i === 0 ? (e.reference ?? '') : ''}
                </span>
                <span className="font-mono">{l.compte?.numero ?? ''}</span>
                {axesGrille.map((p) => (
                  <span key={p.id} />
                ))}
                <span className="truncate" title={l.libelle ?? e.libelle}>
                  {l.libelle ?? e.libelle}
                </span>
                <span className="font-mono text-right">
                  {Number(l.debit) !== 0 ? Number(l.debit).toLocaleString('fr-FR') : ''}
                </span>
                <span className="font-mono text-right">
                  {Number(l.credit) !== 0 ? Number(l.credit).toLocaleString('fr-FR') : ''}
                </span>
                <span />
              </div>
            ));
          })}
          {ecritures.length === 0 && (
            <div className="px-3 py-2.5 text-[11.5px] text-text-dim italic">
              Aucune écriture sur ce journal pour {parPiece ? "l'exercice" : periode?.libelle}.
            </div>
          )}
        </div>

        {/* AVERTISSEMENT D'IMPUTATION · le bloc « Exclusions » de la fiche du
            compte choisi, CITÉ et non reformulé. C'est une règle du texte,
            pas un conseil du logiciel : sa citation est ce qui la rend
            opposable devant un réviseur.

            Il n'EMPÊCHE PAS la saisie, et c'est voulu. Le logiciel ne connaît
            pas la nature de l'opération : « le compte 40 ne doit pas servir à
            enregistrer les fournisseurs d'immobilisations » ne se vérifie
            qu'en sachant ce qu'on achète. Refuser sur cette base bloquerait
            des écritures correctes ; avertir laisse le comptable trancher. */}
        {regleDuCompte?.exclusions && (
          <div className="border-t border-warning/40 bg-warning-soft px-3 py-1.5 text-[11px] leading-[1.5]">
            <span className="font-bold">Compte {regleDuCompte.numero} · exclusions du référentiel : </span>
            {regleDuCompte.exclusions}
            {regleDuCompte.comptesAUtiliser.length > 0 && (
              <span className="text-text-dim">
                {' '}
                (comptes à utiliser à la place : {regleDuCompte.comptesAUtiliser.join(', ')})
              </span>
            )}
          </div>
        )}

        {/* Totaux du journal */}
        <div style={grilleStyle} className={`${grille} px-3 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold`}>
          <span style={{ gridColumn: `span ${4 + axesGrille.length}` }} />
          <span className="text-right text-[11px] text-text-dim self-center">Totaux journal</span>
          <span className="font-mono text-right">{totalDebitJournal.toLocaleString('fr-FR')}</span>
          <span className="font-mono text-right">{totalCreditJournal.toLocaleString('fr-FR')}</span>
          <span />
        </div>
      </div>

      {/* ------- Pièce en cours ------- */}
      {/*
        LA LECTURE SEULE CONSULTE LE JOURNAL, ELLE NE COMPOSE PAS DE PIÈCE.
        Le serveur refuse POST /ecritures à ce rôle : lui montrer la grille
        de saisie, c'était la laisser taper une pièce entière pour découvrir
        le refus à l'enregistrement. Les écritures de la période et les
        totaux du journal, au-dessus, restent affichés.
      */}
      {peutEcrire ? (
        <div className="bg-surface border border-border-dark mt-2.5 rounded-[4px]">
          <div className="flex items-center justify-between px-3 py-1.5 bg-chrome border-b border-border rounded-t-[10px]">
            <span className="text-[11.5px] font-bold text-text-dim">Pièce en cours de saisie</span>
            <div className="flex items-center gap-2.5 text-[11.5px]">
              {parPiece ? (
                <label className="flex items-center gap-1.5">
                  <span className="text-text-dim">Date :</span>
                  <input
                    type="date"
                    aria-label="Date de la pièce"
                    value={datePiece}
                    min={exerciceCourant?.dateDebut.slice(0, 10)}
                    max={exerciceCourant?.dateFin.slice(0, 10)}
                    onChange={(e) => setDatePiece(e.target.value)}
                    className="border border-border-dark px-1.5 py-0.5 font-mono"
                  />
                </label>
              ) : (
              <label className="flex items-center gap-1.5">
                <span className="text-text-dim">Jour :</span>
                <input
                  type="number"
                  min={1}
                  max={periode ? joursDansMois(periode.annee, periode.mois) : 31}
                  value={jour}
                  onChange={(e) => setJour(Number(e.target.value))}
                  className="w-[52px] border border-border-dark px-1.5 py-0.5 font-mono text-right"
                />
              </label>
              )}
              <label className="flex items-center gap-1.5">
                <span className="text-text-dim">Référence :</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="n° facture, chèque…"
                  className="w-[140px] border border-border-dark px-1.5 py-0.5 font-mono"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-text-dim">Libellé pièce :</span>
                <input
                  value={libellePiece}
                  onChange={(e) => setLibellePiece(e.target.value)}
                  className="w-[240px] border border-border-dark px-1.5 py-0.5"
                />
              </label>
            </div>
          </div>

          {/* Lignes déjà validées de la pièce */}
          {lignes.map((l, i) => (
            <div
              key={i}
              style={grilleStyle} className={`${grille} px-3 py-[3px] border-b border-border/60 text-[11.5px] items-center bg-positive-soft/40`}
            >
              <span className="font-mono text-text-dim">
                {i === 0 ? (parPiece ? datePiece.slice(8, 10) : String(jour).padStart(2, '0')) : ''}
              </span>
              <span className="font-mono text-text-dim">{i === 0 ? '(auto)' : ''}</span>
              <span className="font-mono text-[11px] text-text-dim truncate">{i === 0 ? reference : ''}</span>
              <span className="font-mono" title={l.intitule}>
                {l.numero}
              </span>
              {axesGrille.map((p) => {
                const section = (sectionsParPlan[p.id] ?? []).find((sc) => sc.id === l.sections?.[p.id]);
                return (
                  <span key={p.id} className="font-mono text-[11px] text-text-dim truncate" title={section?.intitule}>
                    {section?.code ?? ''}
                  </span>
                );
              })}
              <span className="truncate" title={`${l.intitule} · ${l.libelle}`}>
                {l.libelle}
                {l.dateVersement && (
                  <span className="ml-1 font-mono text-[10.5px] text-text-dim" title="Date du versement · l'échéance de la retenue se compte sur ce mois (loi n° 004/2003, art. 18)">
                    versé le {l.dateVersement.split('-').reverse().join('/')}
                  </span>
                )}
              </span>
              <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
              <span className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => dupliquerLigne(i)}
                  title="Dupliquer cette ligne sans son montant (Ctrl+D)"
                  className="text-text-dim hover:text-sel text-[11px] leading-none"
                >
                  ⧉
                </button>
                <button
                  type="button"
                  onClick={() => inverserLigne(i)}
                  title="Inverser débit et crédit sur cette ligne"
                  className="text-text-dim hover:text-sel text-[11px] leading-none"
                >
                  ⇅
                </button>
                <button
                  type="button"
                  onClick={() => retirerLigne(i)}
                  title="Retirer cette ligne"
                  className="text-danger/70 hover:text-danger text-[11.5px] leading-none"
                >
                  ✕
                </button>
              </span>
            </div>
          ))}

          {/* AU-DESSUS de la zone de saisie · la liste des comptes s'ouvre EN
              DESSOUS après chaque ligne, et couvrait l'annonce et son bouton. */}
          {tvaAjoutee && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-sel-soft text-[11.5px] text-sel">
              <span>{tvaAjoutee.message}</span>
              {/* UN ASSUJETTI A AUSSI DES OPÉRATIONS EXONÉRÉES (O.-L. n° 10/001,
                  art. 15 et suivants) · le taux par défaut du compte ne dit pas
                  la nature de CETTE opération. Le retrait se fait en un clic,
                  sur la dernière ligne de taxe posée d'office, et seulement
                  elle. */}
              <button type="button" onClick={retirerTvaAjoutee} className="border border-sel/40 bg-surface px-2 py-[1px] font-semibold">
                Opération exonérée · retirer la TVA
              </button>
            </div>
          )}
          {/* Zone de saisie de la ligne · Tab de zone en zone, Entrée valide. */}
          <div style={grilleStyle} className={`${grille} px-3 py-1.5 items-center border-b border-border bg-surface`}>
            <span className="font-mono text-[11.5px] text-text-dim text-center">·</span>
            <span className="font-mono text-[11.5px] text-text-dim">(auto)</span>
            <span />
            <div className="relative">
              <input
                ref={compteRef}
                value={compteSaisie}
                onChange={(e) => {
                  setCompteSaisie(e.target.value);
                  setCompteChoisi(null);
                  setPickerOuvert(true);
                  setPickerIndex(0);
                }}
                onFocus={() => setPickerOuvert(true)}
                onKeyDown={(e) => {
                  if (e.key === 'F4') {
                    e.preventDefault();
                    setPickerOuvert(true);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setPickerOuvert(true);
                    setPickerIndex((i) => Math.min(i + 1, comptesFiltres.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPickerIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (pickerOuvert && comptesFiltres[pickerIndex]) choisirCompte(comptesFiltres[pickerIndex]);
                  } else if (e.key === 'Escape') {
                    setPickerOuvert(false);
                  } else if (e.key === 'Tab' && pickerOuvert && comptesFiltres[pickerIndex] && !compteChoisi) {
                    choisirCompte(comptesFiltres[pickerIndex]);
                  }
                }}
                onBlur={() => setTimeout(() => setPickerOuvert(false), 150)}
                placeholder="n° ou F4"
                className="w-full border border-border-dark px-1.5 py-1 font-mono text-[11.5px]"
              />
              {pickerOuvert && comptesFiltres.length > 0 && (
                <div className="anim-menu absolute left-0 top-full z-20 w-[380px] max-h-[240px] overflow-auto bg-surface border border-border-dark shadow-flottante">
                  {comptesFiltres.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choisirCompte(c);
                      }}
                      className={`w-full text-left px-2.5 py-1 text-[11.5px] flex gap-2 ${
                        i === pickerIndex ? 'bg-sel text-white' : 'hover:bg-chrome-alt'
                      }`}
                    >
                      <span className="font-mono font-semibold w-[86px] shrink-0">{c.numero}</span>
                      <span className="truncate">{c.intitule}</span>
                    </button>
                  ))}
                </div>
              )}
              {compteChoisi && !pickerOuvert && (
                <div className="absolute left-0 top-full text-[11px] text-positive bg-surface px-1 border border-border border-t-0 truncate max-w-full z-10">
                  {compteChoisi.intitule}
                </div>
              )}
            </div>
            {axesGrille.map((p) => {
              const actif = axeConcerne(p, compteChoisi);
              return (
                <select
                  key={p.id}
                  value={sectionsSaisie[p.id] ?? ''}
                  disabled={!actif}
                  title={
                    actif
                      ? p.intitule
                      : `${p.intitule} · ne ventile que les classes ${p.classesVentilees.split(',').join(', ')}`
                  }
                  onChange={(e) => setSectionsSaisie((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="w-full border border-border-dark px-1 py-1 text-[11.5px] font-mono disabled:opacity-40 disabled:bg-chrome-alt"
                >
                  <option value="">{actif ? '·' : ''}</option>
                  {(sectionsParPlan[p.id] ?? []).map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.code}
                    </option>
                  ))}
                </select>
              );
            })}
            <input
              ref={libelleRef}
              value={libelleLigne}
              onChange={(e) => setLibelleLigne(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  focusMontantConseille();
                }
              }}
              placeholder={libellePiece || 'libellé de la ligne'}
              className="w-full border border-border-dark px-1.5 py-1 text-[11.5px]"
            />
            <input
              ref={debitRef}
              type="number"
              min={0}
              step="0.01"
              value={debitSaisie}
              onChange={(e) => {
                setDebitSaisie(e.target.value);
                if (e.target.value) setCreditSaisie('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  validerLigne();
                }
              }}
              className={`w-full border border-border-dark px-1.5 py-1 font-mono text-[11.5px] text-right ${
                journal && compteChoisi && sensConseille(journal.type, compteChoisi.numero) === 'debit'
                  ? 'bg-positive-soft'
                  : ''
              }`}
            />
            <input
              ref={creditRef}
              type="number"
              min={0}
              step="0.01"
              value={creditSaisie}
              onChange={(e) => {
                setCreditSaisie(e.target.value);
                if (e.target.value) setDebitSaisie('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  validerLigne();
                }
              }}
              className={`w-full border border-border-dark px-1.5 py-1 font-mono text-[11.5px] text-right ${
                journal && compteChoisi && sensConseille(journal.type, compteChoisi.numero) === 'credit'
                  ? 'bg-positive-soft'
                  : ''
              }`}
            />
            <button
              type="button"
              onClick={validerLigne}
              title="Valider la ligne (Entrée)"
              className="text-sel hover:text-text text-[12px] font-bold text-center"
            >
              ↵
            </button>
          </div>

          {/*
            DATE DE VERSEMENT · UNE EXCEPTION, ET ELLE EST PRÉSENTÉE COMME TELLE.

            Elle n'est PAS une colonne de la grille : la remplir à chaque ligne
            ferait ressaisir une date que l'écriture porte déjà. Les textes
            rattachent la retenue au mois du VERSEMENT, jamais à celui de
            l'écriture qui la constate · loi n° 004/2003, art. 18 : les retenues
            « doivent être versées au plus tard le 15 du mois qui suit celui du
            versement de ces revenus aux bénéficiaires ou de leur mise à
            disposition ». Les deux dates coïncident presque toujours ; elles
            divergent quand la paie de décembre est passée au 31 décembre et
            versée le 5 janvier.

            Vide = la date de l'écriture fait foi, ce qui est le comportement
            d'aujourd'hui et celui de toutes les lignes déjà en base.
          */}
          <div className="px-3 py-1.5 border-b border-border bg-surface-alt/60 flex items-baseline gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[11.5px]">
              <span className="text-text-dim">Date de versement (exception) :</span>
              <input
                type="date"
                value={versement}
                onChange={(e) => setVersement(e.target.value)}
                className="border border-border-dark px-1.5 py-0.5 font-mono text-[11.5px]"
              />
            </label>
            <span className="text-[11px] text-text-dim leading-[1.5] flex-1 min-w-[260px]">
              {versement && periode && versement.slice(0, 7) === moisDeLaPeriode
                ? 'Ce versement tombe dans le mois de l’écriture · laissez le champ vide, la date de l’écriture fait foi.'
                : 'À ne remplir que si le versement, ou la mise à disposition, tombe dans un autre mois que l’écriture · l’échéance de la retenue se compte sur le mois du versement (loi n° 004/2003, art. 18).'}
            </span>
          </div>

          {/* Pied de la pièce : totaux, équilibre, boutons de bas d'écran Sage */}
          <div style={grilleStyle} className={`${grille} px-3 py-1.5 bg-surface-alt text-[11.5px] font-bold border-b border-border`}>
            <span className="col-span-4" />
            <span className="text-right text-[11px] text-text-dim self-center">Totaux pièce</span>
            <span className="font-mono text-right">{totalDebitPiece.toLocaleString('fr-FR')}</span>
            <span className="font-mono text-right">{totalCreditPiece.toLocaleString('fr-FR')}</span>
            <span />
          </div>

          {/* ------------------------------------------------------------------
              CODE TAXE PAR DÉFAUT · la bande est la voie du régime PROPOSE
              (dossier non déclaré assujetti) et du régime AUTO quand la taxe ne
              peut pas se calculer seule (compte de taxe non rattaché). Le taux
              reste modifiable, la proposition s'abandonne. En régime AUTO la
              ligne s'ajoute d'office et l'annonce au-dessus le dit · voir
              modeCalculTva dans lib/tva-saisie.ts.

              LA PIÈCE SE DÉSÉQUILIBRE EN AJOUTANT LA TAXE, et c'est normal : la
              contrepartie de tiers porte le TTC. Le bouton Équilibrer, juste en
              dessous, complète le montant manquant.
              ------------------------------------------------------------------ */}
          {apercuTva && (
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap border-b border-border/50 bg-chrome-alt/60">
              <span className="text-[11px] font-bold text-text-dim">Code taxe</span>
              <span className="text-[11.5px]">
                <span className="font-mono">{apercuTva.ligneHt.numero}</span> ·{' '}
                {apercuTva.sens === 'depense' ? 'TVA déductible' : 'TVA collectée'} sur{' '}
                <span className="font-mono">{apercuTva.ht.toLocaleString('fr-FR')}</span>
              </span>
              <select
                value={propositionTva?.tauxTvaId ?? ''}
                onChange={(e) =>
                  setPropositionTva((p) => (p ? { ...p, tauxTvaId: e.target.value } : p))
                }
                className="border border-border-dark bg-surface px-2 py-1 text-[11.5px]"
              >
                {tauxTvaListe.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} · {Number(t.taux)} %
                  </option>
                ))}
              </select>
              {apercuTva.resultat.ligne ? (
                <span className="text-[11.5px]">
                  → <span className="font-mono">{apercuTva.resultat.ligne.numero}</span>{' '}
                  <span className="font-mono font-semibold">
                    {apercuTva.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                  </span>{' '}
                  au {apercuTva.sens === 'depense' ? 'débit' : 'crédit'}
                </span>
              ) : (
                // Le motif est écrit en toutes lettres · un bouton grisé sans
                // raison renvoie le comptable à la fenêtre des taux sans lui
                // dire ce qui manque.
                <span className="text-[11.5px] text-warning">{apercuTva.resultat.motif}</span>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={poserLigneTva}
                disabled={!apercuTva.resultat.ligne}
                className="border border-border-dark bg-chrome hover:bg-surface px-3 py-1 text-[11.5px] disabled:opacity-40"
              >
                Ajouter la ligne de TVA
              </button>
              <button
                type="button"
                onClick={() => setPropositionTva(null)}
                className="text-[11.5px] text-text-dim hover:underline px-1"
              >
                Sans TVA
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
            <span
              className={`text-[11.5px] font-mono px-2 py-0.5 border ${
                equilibree
                  ? 'text-positive border-positive/40 bg-positive-soft'
                  : 'text-warning border-warning/40 bg-warning-soft'
              }`}
            >
              {equilibree
                ? 'Pièce équilibrée'
                : lignes.length === 0
                  ? 'Pièce vide'
                  : `Solde : ${Math.abs(soldePiece).toLocaleString('fr-FR')} ${
                      soldePiece > 0 ? 'à créditer' : 'à débiter'
                    }`}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setModaleModeles(true)}
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px]"
            >
              Modèle de saisie…
            </button>
            <button
              type="button"
              onClick={() => setCalculetteOuverte(true)}
              title="Calculette · son résultat se reporte dans la zone de montant (Ctrl+K)"
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px]"
            >
              Calculette
            </button>
            <button
              type="button"
              onClick={inverserSaisie}
              disabled={!debitSaisie && !creditSaisie}
              title="Inverse débit et crédit sur la ligne en cours de frappe"
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px] disabled:opacity-45"
            >
              Inverseur
            </button>
            <button
              type="button"
              onClick={equilibrer}
              disabled={Math.abs(soldePiece) < 0.005}
              title="Reporte le montant manquant dans la zone débit ou crédit de la ligne en cours"
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px] disabled:opacity-45"
            >
              Équilibrer
            </button>
            {journal?.type === 'TRESORERIE' && journal.compteTresorerieId && (
              <button
                type="button"
                onClick={contrepartieTresorerie}
                disabled={Math.abs(soldePiece) < 0.005}
                title="Ajoute la ligne de contrepartie sur le compte de trésorerie rattaché au journal"
                className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px] disabled:opacity-45"
              >
                Contrepartie trésorerie
              </button>
            )}
            <button
              type="button"
              onClick={abandonnerPiece}
              disabled={lignes.length === 0 && !libellePiece && !reference}
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px] disabled:opacity-45"
            >
              Abandonner
            </button>
            <button
              type="button"
              onClick={() => enregistrerPiece()}
              disabled={envoi || !equilibree}
              className="bg-sel text-white px-4 py-1 text-[11.5px] font-semibold disabled:opacity-50"
            >
              {envoi ? 'Enregistrement…' : 'Enregistrer la pièce'}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[11.5px] text-text-dim italic border border-border bg-surface px-3 py-2 mt-2.5">
          Consultation seule · la saisie est réservée aux comptables du dossier.
        </div>
      )}

      {erreur && (
        <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mt-2.5">
          {erreur}
          {peutEcrire && erreur.includes('art. 22, 4°') && (
            <div className="mt-2">
              <button
                type="button"
                disabled={envoi}
                onClick={() => enregistrerPiece({ reporterAuPremierJourOuvert: true })}
                className="px-2.5 py-1 border border-border bg-surface text-text"
              >
                Reporter au premier jour de la période ouverte
              </button>
            </div>
          )}
          {peutEcrire && erreur.startsWith('Compte en sommeil') && (
            <div className="mt-2">
              <button
                type="button"
                disabled={envoi}
                onClick={() => enregistrerPiece({ confirmerComptesEnSommeil: true })}
                className="px-2.5 py-1 border border-border bg-surface text-text"
              >
                Confirmer la saisie sur le compte en sommeil
              </button>
            </div>
          )}
        </div>
      )}
      {succes && !erreur && (
        <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mt-2.5">
          {succes}
        </div>
      )}

      {peutEcrire && calculetteOuverte && (
        <Calculette
          onFermer={() => setCalculetteOuverte(false)}
          onReporter={(valeur) => {
            // Le résultat va du côté qui manque à l'équilibre · c'est ce que
            // fait la calculette de Sage, et cela évite de choisir soi-même
            // entre débit et crédit à chaque report.
            if (soldePiece > 0) {
              setCreditSaisie(String(valeur));
              setDebitSaisie('');
            } else {
              setDebitSaisie(String(valeur));
              setCreditSaisie('');
            }
            setCalculetteOuverte(false);
          }}
        />
      )}

      {peutEcrire && modaleModeles && (
        <ModelesSaisieModale comptes={comptes} onInserer={insererModele} onFermer={() => setModaleModeles(false)} />
      )}
    </div>
  );
}
