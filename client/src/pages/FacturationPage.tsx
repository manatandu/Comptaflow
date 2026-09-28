import { useEffect, useMemo, useRef, useState } from 'react';
import { PasserEcritureFacture } from '../components/PasserEcritureFacture';
import { api, ApiError } from '../lib/api';
import { montant } from '../lib/montants';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import {
  horsPeriode,
  libellePeriode,
  libelleTranche,
  periodeParDefaut,
  requetePeriode,
  type OriginePeriode,
  type PeriodeListe,
} from '../lib/periode-liste-travail';
import { Aide } from '../components/chrome/Aide';
import { BlocEmetteur, montantImprime, TableauLignes } from '../components/PieceImprimable';
import { avertissementArticle17, manquesDeLaPiece, mentionDebitsProposee, type MentionsRecopiees } from '../lib/mentions-piece';
import type { TauxTva, Tiers } from '../lib/types';

/**
 * FACTURATION · la pièce que la loi exige pour chaque transaction.
 *
 * LA FENÊTRE DIT D'ABORD CE QU'ELLE N'EST PAS, et c'est sa première raison
 * d'exister. L'art. 58 de l'O.-L. n° 10/001 veut une facture NORMALISÉE
 * produite par un dispositif électronique fiscal, et l'art. 59 quater exige
 * qu'un système de facturation propre soit HOMOLOGUÉ avant toute utilisation.
 * OmegaX ne l'est pas. Un écran qui imprimerait une pièce d'allure officielle
 * sans le dire ferait croire à un cabinet qu'il est en règle · c'est
 * exactement le § 10 bis, dans le sens le plus coûteux.
 */
type Mention = { cle: string; libelle: string };

type PieceLiee = { id: string; numeroSerie: string; dateFacture: string };

type Facture = {
  id: string;
  sens: 'VENTE' | 'ACHAT';
  /** Décret n° 011/42, art. 127 · une note de crédit annule et remplace une facture. */
  nature: 'FACTURE' | 'NOTE_DE_CREDIT';
  factureAnnulee: PieceLiee | null;
  noteDeCredit: PieceLiee | null;
  /** Calculé par le serveur de l'existence de la note, jamais saisi. */
  barree: boolean;
  numeroSerie: string;
  dateFacture: string;
  tiers: { id: string; code: string; nom: string } | null;
  emetteurNom: string;
  emetteurAdresse: string | null;
  emetteurNumeroImpot: string | null;
  contrepartieNom: string;
  contrepartieAdresse: string | null;
  contrepartieNumeroImpot: string | null;
  mentionTvaDebits: boolean;
  /** AUSCGIE art. 17, recopiée à l'établissement d'une vente · null sur un achat ou une pièce antérieure. */
  mentionsSocieteEmetteur: MentionsRecopiees | null;
  ecritureId: string | null;
  lignes: {
    id: string;
    ordre: number;
    designation: string;
    quantite: number | null;
    prixUnitaire: number | null;
    montantHT: number | null;
    imposable: boolean;
    tauxApplique: number | null;
    montantTva: number | null;
  }[];
  totaux: {
    montantHT: number;
    montantNonTaxable: number;
    montantImposable: number;
    montantTva: number;
    montantTTC: number;
  };
  autresImpotsEtTaxes: number | null;
  mentions: {
    conforme: boolean;
    texteApplicable: { texte: string; source: string };
    manquantes: Mention[];
    mentionDebitsManquante?: boolean;
    mentionDebits?: { texte: string; article: string; reserveSanction: string };
    horsDePortee: Mention[];
    amendeUnitaire: number;
    reserveAmende: string;
    source: string;
  };
};

type Etat = {
  homologation: {
    omegaxHomologue: boolean;
    source: string;
    qualification: string;
    procedure: string;
    consequence: string;
    qualificationHypothetique: string;
  };
  obligationDAcceptation: {
    source: string;
    mention: string;
    supportsDeDeduction: { cas: string; support: string; tenuParOmegaX: boolean }[];
    reserveSupports: string;
  };
  regimeExigibiliteTva?: string | null;
  /** La période lue et la tranche rendue (audit final F188) · le total est celui de la période entière. */
  periode: PeriodeListe;
  total: number;
  plafond: number;
  tronque: boolean;
  factures: Facture[];
};

type EtatDetaille = {
  periode: string;
  lignes: {
    fournisseurNom: string | null;
    fournisseurNumeroImpot: string | null;
    numeroFacture: string;
    dateFacture: string;
    designation: string;
    quantite: number;
    prixHT: number;
    tvaFacturee: number;
    montantTTC: number;
  }[];
  totalHT: number;
  totalTva: number;
  totalTTC: number;
  /** Factures barrées par une note de crédit (audit final F117), montrées à part. */
  facturesAnnulees?: {
    numeroFacture: string;
    dateFacture: string;
    fournisseurNom: string | null;
    noteDeCredit: string;
    dateNote: string;
    tvaFacturee: number;
    ecarteeDesTotaux: boolean;
    motif: string;
  }[];
  incompletudes: { numeroFacture: string; designation: string; manques: string[] }[];
  complet: boolean;
  voletImportations: { couvert: boolean; motif: string };
  source: string;
  consequenceDuDefaut: string;
};

/** Les listes stables servies tant que rien n'est lu · une référence neuve relancerait les effets. */
const AUCUN_TIERS: Tiers[] = [];
const AUCUN_TAUX: TauxTva[] = [];

/** Une quantité n'est pas un montant · elle garde les quatre décimales de sa colonne (audit final F256). */
const enQuantite = (n: number | null | undefined) =>
  typeof n === 'number' ? n.toLocaleString('fr-FR', { maximumFractionDigits: 4 }) : '·';

export function FacturationPage() {
  const { peutEcrire, utilisateur } = useAuth();
  // Le serveur refuse l'écriture à la lecture seule ; l'écran ne la propose pas.
  const [noteSur, setNoteSur] = useState<string | null>(null);
  const [noteNumero, setNoteNumero] = useState('');
  const [noteDate, setNoteDate] = useState('');
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sens, setSens] = useState<'VENTE' | 'ACHAT'>('VENTE');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [dateFacture, setDateFacture] = useState('');
  const [contrepartieNom, setContrepartieNom] = useState('');
  const [contrepartieAdresse, setContrepartieAdresse] = useState('');
  const [contrepartieNumeroImpot, setContrepartieNumeroImpot] = useState('');
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState<number | ''>('');
  const [prixUnitaire, setPrixUnitaire] = useState<number | ''>('');
  const [montantHT, setMontantHT] = useState<number | ''>('');
  const [imposable, setImposable] = useState(true);
  const [tauxApplique, setTauxApplique] = useState<number | ''>('');
  const [montantTva, setMontantTva] = useState<number | ''>('');
  const [autresImpots, setAutresImpots] = useState<number | ''>('');
  // LE TIERS ET LE TAUX SE CHOISISSENT (audit final F23) · sans eux la
  // passation n'a ni compte de tiers ni compte de TVA, et « Passer
  // l'écriture » refusait toute pièce saisie ici.
  const [tiersId, setTiersId] = useState('');
  const [tauxTvaId, setTauxTvaId] = useState('');
  // LES DEUX LISTES PARTENT DE null ET LEUR REFUS SE DIT (audit final F255) ·
  // lu comme une liste vide, un refus laissait croire que le dossier n'a ni
  // tiers ni taux, et la pièce partait sans l'un ni l'autre.
  const [tiersLus, setTiersLus] = useState<Tiers[] | null>(null);
  const [erreurTiers, setErreurTiers] = useState<string | null>(null);
  const tiersListe = tiersLus ?? AUCUN_TIERS;
  const [tauxLus, setTauxLus] = useState<TauxTva[] | null>(null);
  const [erreurTaux, setErreurTaux] = useState<string | null>(null);
  const tauxListe = tauxLus ?? AUCUN_TAUX;
  // `null` tant que personne n'a touché la case · elle suit alors le régime.
  const [mentionDebits, setMentionDebits] = useState<boolean | null>(null);
  const [periode, setPeriode] = useState('');
  const [detaille, setDetaille] = useState<EtatDetaille | null>(null);
  // La pièce remise au client · seule imprimée tant qu'elle est ouverte.
  const [aImprimer, setAImprimer] = useState<Facture | null>(null);
  const dossierEstUneSociete = !!utilisateur?.tenant?.mentionsSociete;
  useEffect(() => {
    const fermer = () => setAImprimer(null);
    window.addEventListener('afterprint', fermer);
    return () => window.removeEventListener('afterprint', fermer);
  }, []);
  const imprimer = (f: Facture) => {
    setAImprimer(f);
    // La pièce doit être rendue avant que la boîte d'impression ne fige la page.
    window.setTimeout(() => window.print(), 50);
  };

  // LA LISTE SE LIT SUR UNE PÉRIODE (audit final F188) · l'exercice courant
  // du sélecteur par défaut, les douze derniers mois sans exercice, et l'écran
  // dit laquelle. Un échec de lecture se dit, il ne laisse pas « Chargement… ».
  const { exerciceCourant, chargement: chargementExercice, erreur: erreurExercices } = useExercice();
  const [periodeChoisie, setPeriodeChoisie] = useState<PeriodeListe | null>(null);
  const periodeDefaut = useMemo(() => periodeParDefaut(exerciceCourant, new Date()), [exerciceCourant]);
  const periodeListe: PeriodeListe = periodeChoisie ?? periodeDefaut;
  const originePeriode: OriginePeriode = periodeChoisie ? 'CHOISIE' : periodeDefaut.origine;
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [avisListe, setAvisListe] = useState<string | null>(null);
  // DEUX LECTURES SE CROISENT (relecture audit final F188) · le sélecteur
  // d'exercice se résout en deux temps (défaut, puis choix mémorisé), et un
  // champ de date se tape chiffre par chiffre. Seule la DERNIÈRE demandée
  // s'affiche · une réponse arrivée en retard poserait la liste d'une période
  // sous le libellé d'une autre.
  const lectureListe = useRef(0);
  const recharger = () => {
    const numero = ++lectureListe.current;
    return api.get<Etat>(`/facturation${requetePeriode(periodeListe)}`).then(
      (e) => {
        if (numero !== lectureListe.current) return;
        setEtat(e);
        setErreurListe(null);
      },
      (e) => {
        if (numero !== lectureListe.current) return;
        setErreurListe(e instanceof ApiError ? e.message : "La liste des factures n'a pas pu être lue.");
      },
    );
  };
  useEffect(() => {
    if (chargementExercice) return;
    // L'avis d'une pièce hors période vaut pour la période où il a été donné.
    setAvisListe(null);
    void recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargementExercice, periodeListe.du, periodeListe.au]);
  useEffect(() => {
    let annule = false;
    const motif = (e: unknown, defaut: string) => (e instanceof Error ? e.message : defaut);
    api.get<Tiers[]>('/tiers?actifsSeuls=true').then(
      (t) => {
        if (annule) return;
        setTiersLus(t);
        setErreurTiers(null);
      },
      (e) => {
        if (annule) return;
        setTiersLus(null);
        setErreurTiers(motif(e, "Le plan des tiers n'a pas pu être lu."));
      },
    );
    api.get<TauxTva[]>('/taux-tva?actifsSeuls=true').then(
      (t) => {
        if (annule) return;
        setTauxLus(t);
        setErreurTaux(null);
      },
      (e) => {
        if (annule) return;
        setTauxLus(null);
        setErreurTaux(motif(e, "Les taux de TVA n'ont pas pu être lus."));
      },
    );
    return () => {
      annule = true;
    };
  }, []);
  const tiersDuSens = tiersListe.filter((t) => (sens === 'VENTE' ? t.type === 'CLIENT' || t.type === 'ADHERENT' : t.type === 'FOURNISSEUR'));
  const mentionDebitsCochee = mentionDebits ?? mentionDebitsProposee(sens, etat?.regimeExigibiliteTva);

  async function enregistrer() {
    setErreur(null);
    try {
      await api.post('/facturation', {
        sens,
        numeroSerie,
        dateFacture,
        tiersId: tiersId || undefined,
        // Décret n° 011/42, art. 60 · DUE par celui qui délivre, sur une vente ;
        // LUE sur la pièce du fournisseur, sur un achat, où la déclaration de
        // TVA la confronte à la fiche du tiers (audit final F228). Envoyée sur
        // la vente seule, elle restait fausse sur tout achat, quoi que porte
        // la pièce reçue.
        mentionTvaDebits: mentionDebitsCochee,
        // « Le cas échéant » veut dire « s'il y en a », pas « si vous voulez » ·
        // laisser vide n'est pas répondre, et la mention manque.
        autresImpotsEtTaxes: autresImpots === '' ? undefined : Number(autresImpots),
        contrepartieNom: contrepartieNom || undefined,
        contrepartieAdresse: contrepartieAdresse || undefined,
        contrepartieNumeroImpot: contrepartieNumeroImpot || undefined,
        lignes: [
          {
            designation,
            quantite: Number(quantite),
            prixUnitaire: Number(prixUnitaire),
            montantHT: Number(montantHT),
            imposable,
            tauxTvaId: tauxTvaId || undefined,
            tauxApplique: tauxApplique === '' ? undefined : Number(tauxApplique),
            montantTva: montantTva === '' ? undefined : Number(montantTva),
          },
        ],
      });
      setNumeroSerie('');
      setDesignation('');
      setMentionDebits(null);
      // Une pièce datée hors de la période affichée ne s'y verra pas · le dire.
      setAvisListe(horsPeriode(dateFacture, periodeListe) ? 'Pièce enregistrée · datée hors de la période affichée.' : null);
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'enregistrement n'a pas abouti.");
    }
  }

  /**
   * Supprimer une pièce saisie par erreur (audit de l'interface du
   * 2026-09-27, I11). Seulement tant qu'aucune écriture ne la porte, qu'elle
   * n'est pas barrée et qu'elle n'est pas une note de crédit · une facture
   * annulée et la note qui l'annule se CONSERVENT (décret n° 011/42,
   * art. 127), et le serveur le refuse aussi, avec ce motif (audit final F119).
   */
  async function supprimer(factureId: string, numero: string) {
    if (!window.confirm(`Supprimer la pièce « ${numero} » ?`)) return;
    setErreur(null);
    try {
      await api.delete(`/facturation/${factureId}`);
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "La pièce n'a pas pu être supprimée.");
    }
  }

  async function emettreNoteDeCredit(factureId: string) {
    setErreur(null);
    try {
      await api.post(`/facturation/${encodeURIComponent(factureId)}/note-de-credit`, {
        numeroSerie: noteNumero,
        dateNote: noteDate,
      });
      // La note est une pièce du facturier · datée hors de la période, elle ne s'y verra pas.
      setAvisListe(horsPeriode(noteDate, periodeListe) ? 'Note de crédit émise · datée hors de la période affichée.' : null);
      setNoteSur(null);
      setNoteNumero('');
      setNoteDate('');
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "La note de crédit n'a pas pu être émise.");
    }
  }

  async function produireEtatDetaille() {
    setErreur(null);
    try {
      setDetaille(await api.get<EtatDetaille>(`/facturation/etat-detaille?periode=${encodeURIComponent(periode)}`));
    } catch (e) {
      setDetaille(null);
      setErreur(e instanceof ApiError ? e.message : "L'état détaillé n'a pas pu être produit.");
    }
  }

  if (!etat) {
    return erreurListe ? (
      <div className="p-3 text-[11.5px] text-danger">{erreurListe}</div>
    ) : (
      <div className="p-3 text-[11.5px] text-text-dim">Chargement…</div>
    );
  }

  return (
    <div className={`p-2 max-w-[1100px] ${aImprimer ? 'avec-edition' : ''}`}>
      {aImprimer && <FactureImprimee f={aImprimer} />}
      {/* CE QUE CETTE FENÊTRE N'EST PAS · en tête et non en note de bas de
          page, comme le second jeu en monnaie fonctionnelle : un document qui
          ressemble à une facture normalisée et qui n'en est pas une doit dire
          lequel des deux il est AVANT qu'on en lise les chiffres. */}
      <div className="border border-warning/30 bg-warning-soft px-3.5 py-1.5 mb-2.5 text-[11.5px] flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* LA PROCÉDURE EXISTE · cet écran a dit le contraire pendant un jour.
            Une lacune déclarée à tort dispense d'une démarche qui est due. La
            seconde lacune (passe F1) · la catégorie dont le module tire sa
            dispense est elle aussi définie par un arrêté non lu. */}
        <span className="flex items-center gap-1.5 font-semibold">
          Ce n'est pas une facture normalisée
          <Aide
            titre="Ce n'est pas une facture normalisée"
            texte={[
              etat.homologation.qualification,
              etat.homologation.procedure,
              etat.homologation.consequence,
              etat.homologation.qualificationHypothetique,
            ].join(' ')}
            source={etat.homologation.source}
          />
        </span>
        {/* TROIS SUPPORTS, ET NON UN SEUL · ce panneau disait « la TVA n'est
            déductible QUE SI elle figure sur une facture normalisée », ce qui
            aurait dissuadé un cabinet d'une déduction d'importation que le
            texte lui accorde. L'art. 25 dit « de façon générale ». */}
        <span className="flex items-center gap-1.5">
          Factures à refuser de vos fournisseurs
          <Aide
            titre="Ce que vous devez refuser de vos fournisseurs"
            texte={[
              etat.obligationDAcceptation.mention,
              'Pour être admise en déduction, la TVA doit figurer (art. 25) :',
              ...etat.obligationDAcceptation.supportsDeDeduction.map(
                (s) => `${s.cas} · ${s.support}${s.tenuParOmegaX ? '' : ' · non tenu par OmegaX'}.`,
              ),
              etat.obligationDAcceptation.reserveSupports,
            ].join(' ')}
            source={etat.obligationDAcceptation.source}
          />
        </span>
      </div>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          Enregistrer une facture
          <Aide
            titre="Mentions obligatoires"
            texte="L’art. 23 de la loi de procédures fiscales impose aux redevables de l’impôt sur les sociétés, de l’IRPP (bénéfices industriels, commerciaux, immobiliers, artisanaux et agricoles) et de la TVA une facture normalisée ou un document en tenant lieu « pour chaque transaction effectuée », sous réserve du régime des entreprises de petite taille. Ses mentions sont celles de l'art. 26 du décret n° 23/10 du 3 mars 2023 · douze groupes, dont deux ne s'obtiennent que d'un dispositif électronique fiscal et que le dernier alinéa retire du document en tenant lieu. Dix restent dues, et l'art. 97 bis sanctionne chaque omission. La fenêtre confronte chaque pièce à ces mentions ; elle ne les complète jamais d'office."
            source="Loi de procédures fiscales, art. 23 · décret n° 23/10 du 3 mars 2023, art. 26"
          />
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="text-[11.5px]">
            Sens
            <select
              className="w-full border border-border px-1.5 py-1 text-[11.5px]"
              value={sens}
              onChange={(e) => {
                setSens(e.target.value as 'VENTE' | 'ACHAT');
                setTiersId('');
                setMentionDebits(null);
              }}
            >
              <option value="VENTE">Vente (facture émise)</option>
              <option value="ACHAT">Achat (facture reçue)</option>
            </select>
          </label>
          <label className="text-[11.5px]">
            Tiers au plan
            <select className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={tiersId} onChange={(e) => setTiersId(e.target.value)}>
              <option value="">Aucun · saisir l’identité</option>
              {tiersDuSens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.nom}
                </option>
              ))}
            </select>
            {erreurTiers && <span className="block text-danger">Tiers illisibles · {erreurTiers}</span>}
          </label>
          <label className="text-[11.5px]">
            N° de série
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Date
            <input type="date" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={dateFacture} onChange={(e) => setDateFacture(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            {sens === 'VENTE' ? 'Client' : 'Fournisseur'}
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={contrepartieNom} onChange={(e) => setContrepartieNom(e.target.value)} />
          </label>
          <label className="text-[11.5px]" title="Décret n° 23/10 du 3 mars 2023, art. 26 a) et b)">
            Adresse exacte de la contrepartie
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={contrepartieAdresse} onChange={(e) => setContrepartieAdresse(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            N° impôt de la contrepartie
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={contrepartieNumeroImpot} onChange={(e) => setContrepartieNumeroImpot(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Désignation
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </label>
          <label className="text-[11.5px]">
            Quantité
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={quantite} onChange={(e) => setQuantite(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px]">
            Prix unitaire
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px]">
            Montant HT
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={montantHT} onChange={(e) => setMontantHT(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px]">
            Taux de taxe
            <select
              className="w-full border border-border px-1.5 py-1 text-[11.5px]"
              value={tauxTvaId}
              onChange={(e) => {
                setTauxTvaId(e.target.value);
                const t = tauxListe.find((x) => x.id === e.target.value);
                if (t) setTauxApplique(Number(t.taux));
              }}
            >
              <option value="">Aucun</option>
              {tauxListe.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.intitule}
                </option>
              ))}
            </select>
            {erreurTaux && <span className="block text-danger">Taux de TVA illisibles · {erreurTaux}</span>}
          </label>
          <label className="text-[11.5px]">
            Taux de TVA (%)
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={tauxApplique} onChange={(e) => setTauxApplique(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          <label className="text-[11.5px]">
            Montant de TVA
            <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={montantTva} onChange={(e) => setMontantTva(e.target.value === '' ? '' : Number(e.target.value))} />
          </label>
          {sens === 'VENTE' ? (
            <label className="text-[11.5px] flex items-center gap-1.5 mt-4">
              <input type="checkbox" checked={mentionDebitsCochee} onChange={(e) => setMentionDebits(e.target.checked)} />
              Autorisation d’acquitter la TVA d’après les débits
              <Aide
                titre="Mention d’autorisation aux débits"
                texte="La mention « Autorisation d’acquitter la TVA d’après les débits » doit figurer sur toutes les factures délivrées par le prestataire de services ou l’entrepreneur de travaux autorisé. Elle est proposée cochée quand le dossier est au régime des débits."
                source="Décret n° 011/42, art. 60"
              />
            </label>
          ) : (
            // SUR UN ACHAT, LA MENTION SE LIT (audit final F228) · jamais
            // cochée d'office, elle appartient au fournisseur.
            <label className="text-[11.5px] flex items-center gap-1.5 mt-4">
              <input type="checkbox" checked={mentionDebitsCochee} onChange={(e) => setMentionDebits(e.target.checked)} />
              La pièce porte « Autorisation d’acquitter la TVA d’après les débits »
              <Aide
                titre="Mention d’autorisation aux débits"
                texte="Cochez si la facture reçue porte cette mention. La déclaration de TVA la confronte à la fiche du fournisseur, qui porte l’autorisation et date la déduction."
                source="Décret n° 011/42, art. 60 et 61"
              />
            </label>
          )}
          <label className="text-[11.5px] flex items-center gap-1.5 mt-4">
            <input type="checkbox" checked={imposable} onChange={(e) => setImposable(e.target.checked)} />
            Ligne imposable
            <Aide
              titre="Ligne imposable"
              texte="Décochez « imposable » pour une opération exonérée. Une opération au taux zéro (exportation) reste imposable : les deux zéros ne se confondent pas."
              source="Décret n° 23/10 du 3 mars 2023, art. 26 e) · décret n° 011/42, art. 100"
            />
          </label>
          <label className="text-[11.5px]">
            <span className="flex items-center gap-1.5">
              Autres impôts et taxes
              <Aide
                titre="Autres impôts et taxes"
                texte="Portez 0 s'il n'y en a pas : un champ vide n'est pas une réponse, et la mention manque."
                source="Décret n° 23/10 du 3 mars 2023, art. 26 j)"
              />
            </span>
            <input
              type="number"
              className="w-full border border-border px-1.5 py-1 text-[11.5px]"
              value={autresImpots}
              onChange={(e) => setAutresImpots(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0 s'il n'y en a pas"
            />
          </label>
        </div>
        {/* La distinction imposable / non imposable est demandée par l'art. 26 e)
            du décret n° 23/10, comme par l'art. 100 avant lui · elle ne se
            déduit pas d'un taux nul, une opération au taux zéro (exportation)
            étant imposable. */}
        {erreur && <p className="text-[11.5px] text-danger mt-2">{erreur}</p>}
        {peutEcrire && (
          <button className="mt-2 border border-border px-2.5 py-1 text-[11.5px]" onClick={() => void enregistrer()}>
            Enregistrer
          </button>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          État détaillé de la déclaration mensuelle
          <Aide
            titre="État détaillé"
            texte="L'état détaillé n'est pas une pièce de confort, c'est la condition du droit à déduction. Son défaut entraîne la réintégration d'office des déductions opérées."
            source="O.-L. n° 10/001, art. 56"
          />
        </h2>
        <div className="flex items-end gap-2">
          <label className="text-[11.5px]">
            Période (AAAA-MM)
            <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="2026-09" />
          </label>
          <button className="border border-border px-2.5 py-1 text-[11.5px]" onClick={() => void produireEtatDetaille()}>
            Produire
          </button>
        </div>

        {detaille && (
          <div className="mt-2.5">
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-1 pr-2">Fournisseur</th>
                    <th className="py-1 pr-2">N° impôt</th>
                    <th className="py-1 pr-2">Facture</th>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Désignation</th>
                    <th className="py-1 pr-2 text-right">Quantité</th>
                    <th className="py-1 pr-2 text-right">Prix HT</th>
                    <th className="py-1 pr-2 text-right">TVA facturée</th>
                    <th className="py-1 text-right">TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {detaille.lignes.map((l, i) => (
                    <tr key={`${l.numeroFacture}-${i}`} className="border-b border-border/50">
                      <td className="py-1 pr-2">{l.fournisseurNom ?? '·'}</td>
                      <td className="py-1 pr-2">{l.fournisseurNumeroImpot ?? '·'}</td>
                      <td className="py-1 pr-2">{l.numeroFacture}</td>
                      <td className="py-1 pr-2">{l.dateFacture}</td>
                      <td className="py-1 pr-2">{l.designation}</td>
                      <td className="py-1 pr-2 text-right">{enQuantite(l.quantite)}</td>
                      <td className="py-1 pr-2 text-right">{montant(l.prixHT)}</td>
                      <td className="py-1 pr-2 text-right">{montant(l.tvaFacturee)}</td>
                      <td className="py-1 text-right">{montant(l.montantTTC)}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="py-1 pr-2" colSpan={6}>
                      Totaux
                    </td>
                    <td className="py-1 pr-2 text-right">{montant(detaille.totalHT)}</td>
                    <td className="py-1 pr-2 text-right">{montant(detaille.totalTva)}</td>
                    <td className="py-1 text-right">{montant(detaille.totalTTC)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {(detaille.facturesAnnulees ?? []).length > 0 && (
              <div className="mt-2 border border-border px-2.5 py-1.5">
                <p className="text-[11.5px] font-bold">Factures barrées par une note de crédit</p>
                <ul className="text-[11.5px] text-text-dim mt-1">
                  {(detaille.facturesAnnulees ?? []).map((a) => (
                    <li key={a.numeroFacture}>
                      Facture {a.numeroFacture} du {a.dateFacture} · TVA {montant(a.tvaFacturee)} ·{' '}
                      {a.ecarteeDesTotaux ? 'hors des totaux' : 'comprise dans les totaux'} · {a.motif}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detaille.incompletudes.length > 0 && (
              <div className="mt-2 border border-border px-2.5 py-1.5">
                <p className="text-[11.5px] font-bold" title="Décret n° 011/42, art. 134">Lignes incomplètes de l’état détaillé</p>
                <ul className="text-[11.5px] text-text-dim mt-1">
                  {detaille.incompletudes.map((i, r) => (
                    <li key={`${i.numeroFacture}-${r}`}>
                      Facture {i.numeroFacture} · {i.designation} · manque {i.manques.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* LA LACUNE DÉCLARÉE PLUTÔT QUE COMBLÉE · OmegaX ne tient aucune
                déclaration en douane, et déduire une valeur en douane d'un
                compte d'achat l'inventerait. */}
            <p className="text-[11px] text-text-dim mt-2 leading-[1.6] flex items-start gap-1.5">
              <span>{detaille.voletImportations.motif}</span>
              <Aide titre="Défaut de l'état détaillé" texte={detaille.consequenceDuDefaut} source={detaille.source} />
            </p>
          </div>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          Factures enregistrées
          <Aide
            titre="Période de la liste"
            texte="La liste se lit sur la date de la pièce, bornes comprises. Par défaut, l'exercice courant du sélecteur, ou les douze derniers mois sans exercice. Au-delà du plafond, les pièces les plus récentes sont affichées et le total de la période est dit. L'état détaillé se produit toujours sur le mois entier."
            source="Audit final F188"
          />
        </h2>
        <div className="flex flex-wrap items-end gap-2 mb-1.5 text-[11.5px]">
          <label>
            Du
            <input
              type="date"
              className="block border border-border px-1.5 py-0.5 text-[11.5px]"
              value={periodeListe.du ?? ''}
              onChange={(e) => setPeriodeChoisie({ ...periodeListe, du: e.target.value || null })}
            />
          </label>
          <label>
            Au
            <input
              type="date"
              className="block border border-border px-1.5 py-0.5 text-[11.5px]"
              value={periodeListe.au ?? ''}
              onChange={(e) => setPeriodeChoisie({ ...periodeListe, au: e.target.value || null })}
            />
          </label>
          <span className="text-text-dim">{libellePeriode(periodeListe, originePeriode)}</span>
          {/* LA PÉRIODE PAR DÉFAUT VIENT DES EXERCICES, ET LEUR ÉCHEC SE DIT ICI (audit
              final F248) · sans exercice lu, elle retombe sur les douze derniers mois
              comme sur un dossier qui n'en a aucun ; relue sans succès, elle garde
              l'exercice d'avant. Même geste que la barre d'état. */}
          {!chargementExercice && erreurExercices && (
            <span className="text-danger">
              {exerciceCourant ? 'Exercices non relus' : 'Exercices illisibles'} · {erreurExercices}
            </span>
          )}
        </div>
        {erreurListe && <p className="text-[11.5px] text-danger mb-1.5">{erreurListe}</p>}
        {avisListe && <p className="text-[11.5px] text-warning mb-1.5">{avisListe}</p>}
        {/* UNE LECTURE REFUSÉE NE LAISSE PAS LES LIGNES D'AVANT sous le libellé de
            la période demandée · elles se liraient comme sa réponse. */}
        {!erreurListe && libelleTranche(etat, etat.factures.length) && (
          <p className="text-[11.5px] text-warning mb-1.5">{libelleTranche(etat, etat.factures.length)}</p>
        )}
        {erreurListe ? null : etat.factures.length === 0 ? (
          <p className="text-[11.5px] text-text-dim">Aucune facture sur la période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Sens</th>
                  <th className="py-1 pr-2">N° de série</th>
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Contrepartie</th>
                  <th className="py-1 pr-2 text-right">HT</th>
                  <th className="py-1 pr-2 text-right">TVA</th>
                  <th className="py-1 pr-2 text-right">TTC</th>
                  {/* AUDIT FINAL F229 · la liste appliquée dépend de la date
                      de la pièce (art. 26 du décret n° 23/10, ou art. 100 du
                      décret n° 011/42 avant le 3 mars 2023), et la ligne
                      « Texte appliqué » dit laquelle. Titrée « art. 100 »,
                      la colonne nommait le texte des seules pièces
                      antérieures au 3 mars 2023. */}
                  <th className="py-1">Mentions obligatoires</th>
                </tr>
              </thead>
              <tbody>
                {etat.factures.map((f) => (
                  <tr key={f.id} className="border-b border-border/50 align-top">
                    <td className="py-1 pr-2">{f.sens === 'VENTE' ? 'Vente' : 'Achat'}</td>
                    <td className="py-1 pr-2">
                      {/* DÉCRET ART. 127 · la facture annulée « doit être
                          barrée et conservée ». Elle reste dans la liste,
                          barrée, avec la note qui l'annule. */}
                      <span className={f.barree ? 'line-through' : undefined}>{f.numeroSerie}</span>
                      {f.nature === 'NOTE_DE_CREDIT' && (
                        <p className="text-[11px] text-text-dim">
                          Note de crédit · annule {f.factureAnnulee?.numeroSerie ?? '·'}
                        </p>
                      )}
                      {f.barree && (
                        <p className="text-[11px] text-text-dim">Annulée par {f.noteDeCredit?.numeroSerie}</p>
                      )}
                      {/* SEULE UNE PIÈCE QUE LE DOSSIER ÉMET S'IMPRIME · une facture
                          reçue est le document du fournisseur, pas le nôtre. */}
                      {f.sens === 'VENTE' && (
                        <div className="mt-1">
                          <button className="text-[11px] underline" onClick={() => imprimer(f)}>
                            Imprimer
                          </button>
                          {avertissementArticle17(f.mentionsSocieteEmetteur, dossierEstUneSociete) && (
                            <p className="text-[11px] text-warning">{avertissementArticle17(f.mentionsSocieteEmetteur, dossierEstUneSociete)}</p>
                          )}
                        </div>
                      )}
                      {peutEcrire && !f.ecritureId && <PasserEcritureFacture facture={f} onFait={() => void recharger()} />}
                      {f.ecritureId && <p className="text-[11px] text-text-dim mt-1">Écriture passée</p>}
                      {/* Ni une pièce passée au journal, ni une facture barrée, ni une note de
                          crédit, qui débarrerait la facture qu'elle annule (audit final F119). */}
                      {peutEcrire && !f.ecritureId && !f.barree && f.nature === 'FACTURE' && (
                        <button
                          type="button"
                          className="mt-1 text-[11px] underline text-text-dim block"
                          onClick={() => void supprimer(f.id, f.numeroSerie)}
                        >
                          Supprimer
                        </button>
                      )}
                      {peutEcrire && f.nature === 'FACTURE' && !f.barree && (
                        noteSur === f.id ? (
                          <div className="mt-1 flex flex-wrap gap-1 items-center">
                            <input
                              aria-label="N° de la note de crédit"
                              className="border border-border px-1 py-0.5 w-24"
                              placeholder="N° de série"
                              value={noteNumero}
                              onChange={(e) => setNoteNumero(e.target.value)}
                            />
                            <input
                              aria-label="Date de la note de crédit"
                              type="date"
                              className="border border-border px-1 py-0.5"
                              value={noteDate}
                              onChange={(e) => setNoteDate(e.target.value)}
                            />
                            <button className="border border-border px-1.5 py-0.5" onClick={() => void emettreNoteDeCredit(f.id)}>
                              Émettre
                            </button>
                            <button className="px-1.5 py-0.5 text-text-dim" onClick={() => setNoteSur(null)}>
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button className="mt-1 text-[11px] underline text-text-dim" onClick={() => setNoteSur(f.id)}>
                            Note de crédit
                          </button>
                        )
                      )}
                    </td>
                    <td className="py-1 pr-2">{f.dateFacture.slice(0, 10)}</td>
                    <td className="py-1 pr-2">{f.sens === 'VENTE' ? f.contrepartieNom : f.emetteurNom}</td>
                    <td className="py-1 pr-2 text-right">{montant(f.totaux.montantHT)}</td>
                    <td className="py-1 pr-2 text-right">{montant(f.totaux.montantTva)}</td>
                    <td className="py-1 pr-2 text-right">{montant(f.totaux.montantTTC)}</td>
                    <td className="py-1">
                      {f.mentions.conforme ? (
                        <span>Tous les groupes exigibles sont servis.</span>
                      ) : (
                        <>
                          <span className="text-danger">Manque : {manquesDeLaPiece(f.mentions).join(' · ')}</span>
                          {/* LE TOTAL ENCOURU NE SE CALCULE PAS · l'art. 97 bis
                              sanctionne « par omission » sans définir l'unité
                              de l'omission. Multiplier serait inventer un
                              barème. */}
                          {f.mentions.manquantes.length > 0 && (
                            <p className="text-[11px] text-text-dim mt-0.5 flex items-center gap-1.5">
                              Amende de {f.mentions.amendeUnitaire.toLocaleString('fr-FR')} FC par omission.
                              <Aide titre="Amende par omission" texte={f.mentions.reserveAmende} source={f.mentions.source} />
                            </p>
                          )}
                          {/* ART. 60 · aucune amende n'est chiffrée, et le silence
                              n'est pas une dispense : la réserve le dit. */}
                          {f.mentions.mentionDebitsManquante && f.mentions.mentionDebits && (
                            <p className="text-[11px] text-text-dim mt-0.5 flex items-center gap-1.5">
                              Sanction non chiffrée.
                              <Aide titre="Mention d’autorisation aux débits" texte={f.mentions.mentionDebits.reserveSanction} source={f.mentions.mentionDebits.article} />
                            </p>
                          )}
                        </>
                      )}
                      {/* LES DEUX MENTIONS HORS DE PORTÉE SONT NOMMÉES, sur
                          chaque pièce · les taire laisserait croire que le
                          document est complet au sens de l'art. 26. */}
                      <p className="text-[11px] text-text-dim mt-1 leading-[1.6]">
                        Hors de portée sans dispositif électronique fiscal :{' '}
                        {f.mentions.horsDePortee.map((m) => m.libelle).join(' · ')}.
                      </p>
                      {/* SUR UN ACHAT, LA MENTION DE L'ART. 60 EST CE QUE LA
                          DÉCLARATION DE TVA LIT (audit final F228) · elle se
                          voit sur la ligne de la pièce qui la porte. */}
                      {f.sens === 'ACHAT' && f.mentionTvaDebits && (
                        <p className="text-[11px] text-text-dim mt-1" title="Décret n° 011/42, art. 60">Porte la mention d’autorisation aux débits.</p>
                      )}
                      {/* LE TEXTE APPLIQUÉ EST CELUI DE LA DATE DE LA PIÈCE ·
                          sans cette ligne, une facture de 2022 se verrait
                          reprocher une mention au nom d'un décret de 2023. */}
                      <p className="text-[11px] text-text-dim mt-1 leading-[1.6]">
                        Texte appliqué : {f.mentions.texteApplicable.texte}. {f.mentions.texteApplicable.source}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * La facture de vente telle qu'elle part chez le client. L'avertissement de
 * l'homologation est IMPRIMÉ, pas seulement affiché · une pièce d'allure
 * officielle qui ne le dit pas ferait croire au client qu'il tient une
 * facture normalisée (décret n° 23/10, art. 22).
 */
function FactureImprimee({ f }: { f: Facture }) {
  const titre = f.nature === 'NOTE_DE_CREDIT' ? 'NOTE DE CRÉDIT' : 'FACTURE';
  return (
    <div className="impression-seul text-[12px] text-black">
      <div className="flex justify-between gap-6 mb-6">
        <BlocEmetteur
          mentions={f.mentionsSocieteEmetteur}
          nomRepli={f.emetteurNom}
          complement={
            <>
              {/* La ligne de l'art. 17 porte déjà le siège · l'adresse de
                  l'art. 26 a) ne se répète que là où cette ligne manque. */}
              {f.emetteurAdresse && !f.mentionsSocieteEmetteur?.ligne && <div>{f.emetteurAdresse}</div>}
              {f.emetteurNumeroImpot && <div>N° impôt {f.emetteurNumeroImpot}</div>}
            </>
          }
        />
        <div className="text-right">
          <div className="font-bold">{f.contrepartieNom}</div>
          {f.contrepartieAdresse && <div>{f.contrepartieAdresse}</div>}
          {f.contrepartieNumeroImpot && <div>N° impôt {f.contrepartieNumeroImpot}</div>}
        </div>
      </div>
      <div className="text-[15px] font-bold mb-1">
        {titre} N° {f.numeroSerie}
      </div>
      <div className="mb-4">
        du {new Date(f.dateFacture).toLocaleDateString('fr-FR')}
        {f.nature === 'NOTE_DE_CREDIT' && f.factureAnnulee && ` · annule et remplace la facture n° ${f.factureAnnulee.numeroSerie}`}
      </div>
      <TableauLignes lignes={f.lignes} avecTva />
      <table className="ml-auto mb-4 border-collapse">
        <tbody>
          <tr><td className="pr-4">Montant non taxable</td><td className="text-right">{montantImprime(f.totaux.montantNonTaxable)}</td></tr>
          <tr><td className="pr-4">Montant hors TVA</td><td className="text-right">{montantImprime(f.totaux.montantHT)}</td></tr>
          <tr><td className="pr-4">TVA</td><td className="text-right">{montantImprime(f.totaux.montantTva)}</td></tr>
          {f.autresImpotsEtTaxes !== null && (
            <tr><td className="pr-4">Autres impôts et taxes</td><td className="text-right">{montantImprime(f.autresImpotsEtTaxes)}</td></tr>
          )}
          <tr className="font-bold"><td className="pr-4">Montant TTC</td><td className="text-right">{montantImprime(f.totaux.montantTTC)}</td></tr>
        </tbody>
      </table>
      {f.mentionTvaDebits && <div className="mb-2">Autorisation d'acquitter la TVA d'après les débits.</div>}
      <div className="text-[10.5px] mt-6 border-t border-black pt-1">
        Pièce établie par un système de facturation non homologué (décret n° 23/10 du 3 mars 2023, art. 22) · ce
        n'est pas une facture normalisée.
      </div>
    </div>
  );
}
