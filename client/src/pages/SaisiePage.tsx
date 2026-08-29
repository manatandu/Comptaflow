import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useActionsFenetre } from '../lib/actions-fenetre';
import { useExercice } from '../lib/exercice';
import { ModelesSaisieModale, type LigneInseree } from '../components/ModelesSaisie';
import { Calculette } from '../components/Calculette';
import type { Compte, Ecriture, Journal, PlanAnalytique, SectionAnalytique } from '../lib/types';

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
 * Les modèles de saisie (opérations courantes, TVA, écritures-types SYCEBNL)
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
   * Ventilation analytique de la ligne, une section par axe · c'est la
   * « colonne ligne budgétaire » du guide Sage écrit pour une ONG, active
   * seulement sur les classes que l'axe déclare ventiler. La grille impute la
   * ligne en totalité sur une section ; un partage entre deux projets sur une
   * même ligne reste possible par l'écran des états analytiques.
   */
  sections?: Record<string, string>;
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
 * aux racines SYCEBNL (40 fournisseurs, 41 adhérents/clients, 42 personnel).
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
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);

  // Sélection du journal et de la période (étape 1)
  const [journalId, setJournalId] = useState('');
  const [indexPeriode, setIndexPeriode] = useState(0);
  const [ouvert, setOuvert] = useState(false);

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
  const [debitSaisie, setDebitSaisie] = useState('');
  const [creditSaisie, setCreditSaisie] = useState('');
  const [pickerOuvert, setPickerOuvert] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);

  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [modaleModeles, setModaleModeles] = useState(false);
  const [calculetteOuverte, setCalculetteOuverte] = useState(false);

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
   * Un axe ne ventile que certaines classes du plan SYCEBNL · la colonne reste
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

  // Période par défaut : le mois courant s'il appartient à l'exercice.
  useEffect(() => {
    if (!periodes.length) return;
    const maintenant = new Date();
    const i = periodes.findIndex((p) => p.annee === maintenant.getFullYear() && p.mois === maintenant.getMonth());
    if (i >= 0) setIndexPeriode(i);
  }, [periodes]);

  const journal = journaux.find((j) => j.id === journalId) ?? null;
  const periode = periodes[indexPeriode] ?? null;

  // Chargement des écritures du journal ouvert, sur la période.
  useEffect(() => {
    if (!ouvert || !exerciceCourant || !journal || !periode) return;
    let annule = false;
    const debut = `${periode.annee}-${String(periode.mois + 1).padStart(2, '0')}-01`;
    const fin = `${periode.annee}-${String(periode.mois + 1).padStart(2, '0')}-${String(
      joursDansMois(periode.annee, periode.mois),
    ).padStart(2, '0')}`;
    api
      .get<{ ecritures: Ecriture[] }>(
        `/ecritures?exerciceId=${exerciceCourant.id}&journalId=${journal.id}&dateDebut=${debut}&dateFin=${fin}`,
      )
      .then((r) => {
        if (!annule) setEcritures(r.ecritures);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, journalId, indexPeriode, exerciceCourant?.id, rechargement]);

  // ------- Pièce en cours -------
  const totalDebitPiece = lignes.reduce((s, l) => s + l.debit, 0);
  const totalCreditPiece = lignes.reduce((s, l) => s + l.credit, 0);
  const soldePiece = Math.round((totalDebitPiece - totalCreditPiece) * 100) / 100;
  const equilibree = Math.abs(soldePiece) < 0.005 && lignes.length >= 2;

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
    // « Répéter » façon modèle Sage : le libellé reste, le compte et les
    // montants se vident, le curseur revient au compte.
    setCompteChoisi(null);
    setCompteSaisie('');
    setDebitSaisie('');
    setCreditSaisie('');
    setEcheance('');
    compteRef.current?.focus();
  };

  const retirerLigne = (i: number) => {
    setLignes((prev) => prev.filter((_, idx) => idx !== i));
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
   * que le SYCEBNL proscrit comme mode de CORRECTION : l'article 20 de
   * l'AUDCIF n'admet que l'inscription en négatif. Ici, rien n'est corrigé ·
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
  useActionsFenetre({
    inverseur: { titre: 'Inverser débit et crédit sur la ligne en cours', executer: inverserSaisie },
  });

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
    setReference('');
    setLibellePiece('');
    setErreur(null);
  };

  const enregistrerPiece = async () => {
    if (!exerciceCourant || !journal || !periode) return;
    setErreur(null);
    setSucces(null);
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
      const jourBorne = Math.min(Math.max(1, jour), joursDansMois(periode.annee, periode.mois));
      const date = `${periode.annee}-${String(periode.mois + 1).padStart(2, '0')}-${String(jourBorne).padStart(2, '0')}`;
      await api.post('/ecritures', {
        exerciceId: exerciceCourant.id,
        journalId: journal.id,
        date,
        libelle:
          libellePiece || `Pièce du ${String(jourBorne).padStart(2, '0')}/${String(periode.mois + 1).padStart(2, '0')}`,
        reference: reference || undefined,
        lignes: lignes.map((l) => ({
          compteId: l.compteId,
          libelle: l.libelle || undefined,
          debit: l.debit || undefined,
          credit: l.credit || undefined,
          tauxTvaId: l.tauxTvaId,
          dateEcheance: l.dateEcheance,
          // Une section par axe, imputée pour la totalité de la ligne · le
          // serveur vérifie cet équilibre axe par axe.
          ventilations: Object.values(l.sections ?? {})
            .filter(Boolean)
            .map((sectionId) => ({ sectionId, debit: l.debit || undefined, credit: l.credit || undefined })),
        })),
      });
      setSucces('Pièce enregistrée au journal.');
      setLignes([]);
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

  // Totaux du journal (écritures existantes de la période)
  const totalDebitJournal = ecritures.reduce(
    (s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.debit), 0),
    0,
  );
  const totalCreditJournal = ecritures.reduce(
    (s, e) => s + e.lignes.reduce((s2, l) => s2 + Number(l.credit), 0),
    0,
  );

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
        <div className="w-full max-w-[640px]">
          <div className="text-[10.5px] font-mono text-text-dim mb-1">TRAITEMENT</div>
          <h1 className="text-[15px] font-bold mb-3">Saisie des journaux</h1>

          <div className="bg-surface border border-border shadow-posee">
            <div className="px-4 py-2 bg-surface-alt border-b border-border text-[11px] font-semibold text-text-dim">
              Sélectionnez le journal et la période de saisie
            </div>
            <div className="p-4">
              <div className="border border-border mb-3 max-h-[300px] overflow-auto">
                <div className="grid grid-cols-[80px_1fr_110px_90px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim sticky top-0">
                  <span>CODE</span>
                  <span>INTITULÉ</span>
                  <span>TYPE</span>
                  <span>ÉTAT</span>
                </div>
                {journaux.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setJournalId(j.id)}
                    className={`w-full grid grid-cols-[80px_1fr_110px_90px] gap-2 px-3 py-1.5 border-b border-border text-left text-[12px] items-center ${
                      journalId === j.id ? 'bg-sel text-white' : 'hover:bg-chrome-alt'
                    }`}
                  >
                    <span className="font-mono font-semibold">{j.code}</span>
                    <span>{j.intitule}</span>
                    <span className={journalId === j.id ? '' : 'text-text-dim'}>{LIBELLE_TYPE_JOURNAL[j.type]}</span>
                    <span
                      className={`text-[11px] ${journalId === j.id ? '' : j.estActif ? 'text-positive' : 'text-warning'}`}
                    >
                      {j.estActif ? 'Actif' : 'En sommeil'}
                    </span>
                  </button>
                ))}
                {journaux.length === 0 && (
                  <div className="px-3 py-2 text-[12px] text-text-dim italic">
                    Aucun journal · créez-les dans Structure → Codes journaux.
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="text-[12px]">Période :</label>
                <select
                  value={indexPeriode}
                  onChange={(e) => setIndexPeriode(Number(e.target.value))}
                  className="border border-border-dark px-2 py-1 text-[12.5px]"
                >
                  {periodes.map((p, i) => (
                    <option key={p.libelle} value={i}>
                      {p.libelle}
                    </option>
                  ))}
                </select>
                <div className="flex-1" />
                <button
                  type="button"
                  disabled={!journalId || !periode}
                  onClick={() => {
                    setOuvert(true);
                    setSucces(null);
                    setErreur(null);
                  }}
                  className="bg-sel text-white px-5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
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
    <div className="p-2.5">
      {/* En-tête du journal ouvert */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10.5px] font-mono text-text-dim">SAISIE DES JOURNAUX</div>
          <h1 className="text-[15px] font-bold">
            Journal {journal?.code} · {journal?.intitule} · {periode?.libelle}
          </h1>
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

      <div className="bg-surface border border-border shadow-posee">
        {/* En-tête de colonnes · la grille Sage : Jour · Pièce · Référence · Compte · Libellé · Débit · Crédit */}
        <div
          style={grilleStyle} className={`${grille} px-3 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim`}
        >
          <span>JOUR</span>
          <span>PIÈCE</span>
          <span>RÉFÉRENCE</span>
          <span>N° COMPTE</span>
          {axesGrille.map((p) => (
            <span key={p.id} title={p.intitule}>
              {p.code}
            </span>
          ))}
          <span>LIBELLÉ ÉCRITURE</span>
          <span className="text-right">DÉBIT</span>
          <span className="text-right">CRÉDIT</span>
          <span />
        </div>

        {/* Écritures existantes de la période */}
        <div className="max-h-[34vh] overflow-auto">
          {ecritures.map((e) => {
            const jourE = new Date(e.date).getDate();
            const annulee = !!e.correction;
            return e.lignes.map((l, i) => (
              <div
                key={l.id}
                style={grilleStyle} className={`${grille} px-3 py-[3px] border-b border-border/60 text-[11.5px] items-center ${
                  annulee ? 'opacity-50 line-through decoration-danger/60' : ''
                } ${i === 0 ? 'border-t border-border' : ''}`}
              >
                <span className="font-mono text-text-dim">{i === 0 ? String(jourE).padStart(2, '0') : ''}</span>
                <span className="font-mono text-text-dim">
                  {i === 0 ? (e.numeroPiece ?? '·') : ''}
                  {i === 0 && e.statut === 'BROUILLARD' && (
                    <span className="ml-1 text-[9px] font-bold text-warning" title="En brouillard · pas encore au livre-journal">
                      B
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10.5px] text-text-dim truncate">
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
              Aucune écriture sur ce journal pour {periode?.libelle}.
            </div>
          )}
        </div>

        {/* Totaux du journal */}
        <div style={grilleStyle} className={`${grille} px-3 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold`}>
          <span style={{ gridColumn: `span ${4 + axesGrille.length}` }} />
          <span className="text-right text-[10px] text-text-dim self-center">TOTAUX JOURNAL</span>
          <span className="font-mono text-right">{totalDebitJournal.toLocaleString('fr-FR')}</span>
          <span className="font-mono text-right">{totalCreditJournal.toLocaleString('fr-FR')}</span>
          <span />
        </div>
      </div>

      {/* ------- Pièce en cours ------- */}
      <div className="bg-surface border border-border-dark mt-2.5 rounded-[10px]">
        <div className="flex items-center justify-between px-3 py-1.5 bg-chrome border-b border-border rounded-t-[10px]">
          <span className="text-[11px] font-bold text-text-dim">PIÈCE EN COURS DE SAISIE</span>
          <div className="flex items-center gap-2.5 text-[11.5px]">
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
            <span className="font-mono text-text-dim">{i === 0 ? String(jour).padStart(2, '0') : ''}</span>
            <span className="font-mono text-text-dim">{i === 0 ? '(auto)' : ''}</span>
            <span className="font-mono text-[10.5px] text-text-dim truncate">{i === 0 ? reference : ''}</span>
            <span className="font-mono" title={l.intitule}>
              {l.numero}
            </span>
            {axesGrille.map((p) => {
              const section = (sectionsParPlan[p.id] ?? []).find((sc) => sc.id === l.sections?.[p.id]);
              return (
                <span key={p.id} className="font-mono text-[10.5px] text-text-dim truncate" title={section?.intitule}>
                  {section?.code ?? ''}
                </span>
              );
            })}
            <span className="truncate" title={`${l.intitule} · ${l.libelle}`}>
              {l.libelle}
            </span>
            <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
            <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
            <span className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => dupliquerLigne(i)}
                title="Dupliquer cette ligne sans son montant (Ctrl+D)"
                className="text-text-dim hover:text-sel text-[10px] leading-none"
              >
                ⧉
              </button>
              <button
                type="button"
                onClick={() => inverserLigne(i)}
                title="Inverser débit et crédit sur cette ligne"
                className="text-text-dim hover:text-sel text-[10px] leading-none"
              >
                ⇅
              </button>
              <button
                type="button"
                onClick={() => retirerLigne(i)}
                title="Retirer cette ligne"
                className="text-danger/70 hover:text-danger text-[11px] leading-none"
              >
                ✕
              </button>
            </span>
          </div>
        ))}

        {/* Zone de saisie de la ligne · Tab de zone en zone, Entrée valide. */}
        <div style={grilleStyle} className={`${grille} px-3 py-1.5 items-center border-b border-border bg-surface`}>
          <span className="font-mono text-[11px] text-text-dim text-center">·</span>
          <span className="font-mono text-[11px] text-text-dim">(auto)</span>
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
              className="w-full border border-border-dark px-1.5 py-1 font-mono text-[12px]"
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
              <div className="absolute left-0 top-full text-[10px] text-positive bg-surface px-1 border border-border border-t-0 truncate max-w-full z-10">
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
                className="w-full border border-border-dark px-1 py-1 text-[11px] font-mono disabled:opacity-40 disabled:bg-chrome-alt"
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
            className="w-full border border-border-dark px-1.5 py-1 text-[12px]"
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
            className={`w-full border border-border-dark px-1.5 py-1 font-mono text-[12px] text-right ${
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
            className={`w-full border border-border-dark px-1.5 py-1 font-mono text-[12px] text-right ${
              journal && compteChoisi && sensConseille(journal.type, compteChoisi.numero) === 'credit'
                ? 'bg-positive-soft'
                : ''
            }`}
          />
          <button
            type="button"
            onClick={validerLigne}
            title="Valider la ligne (Entrée)"
            className="text-sel hover:text-text text-[13px] font-bold text-center"
          >
            ↵
          </button>
        </div>

        {/* Pied de la pièce : totaux, équilibre, boutons de bas d'écran Sage */}
        <div style={grilleStyle} className={`${grille} px-3 py-1.5 bg-surface-alt text-[11.5px] font-bold border-b border-border`}>
          <span className="col-span-4" />
          <span className="text-right text-[10px] text-text-dim self-center">TOTAUX PIÈCE</span>
          <span className="font-mono text-right">{totalDebitPiece.toLocaleString('fr-FR')}</span>
          <span className="font-mono text-right">{totalCreditPiece.toLocaleString('fr-FR')}</span>
          <span />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
          <span
            className={`text-[11px] font-mono px-2 py-0.5 border ${
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
            onClick={enregistrerPiece}
            disabled={envoi || !equilibree}
            className="bg-sel text-white px-4 py-1 text-[11.5px] font-semibold disabled:opacity-50"
          >
            {envoi ? 'Enregistrement…' : 'Enregistrer la pièce'}
          </button>
        </div>
      </div>

      {erreur && (
        <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mt-2.5">{erreur}</div>
      )}
      {succes && !erreur && (
        <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mt-2.5">
          {succes}
        </div>
      )}

      {calculetteOuverte && (
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

      {modaleModeles && (
        <ModelesSaisieModale comptes={comptes} onInserer={insererModele} onFermer={() => setModaleModeles(false)} />
      )}
    </div>
  );
}
