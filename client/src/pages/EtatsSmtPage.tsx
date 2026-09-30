import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { lacuneEcheancesNote3 } from '../lib/note3-echeances-smt';
import { useExercice } from '../lib/exercice';
import { IconCheck, IconExport } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import { BlocCertification, EnteteImpression } from '../components/chrome/EnteteImpression';
import type {
  BilanSmt,
  CompteDeResultatSmt,
  EligibiliteSmt,
  Note4Smt,
  NotesSmt,
  PosteBilanSmt,
  PosteFluxSmt,
} from '../lib/types';
import { montant } from '../lib/montants';
import { libelleExercice } from '../lib/libelle-exercice';

/**
 * États financiers du SYSTÈME MINIMAL DE TRÉSORERIE · troisième jeu SYCEBNL
 * (Partie 4, ch. 4). Écran distinct de `EtatsFinanciersPage` parce que les
 * maquettes le sont : cinq lignes d'actif au lieu de vingt, un compte de
 * résultat de caisse avec quatre lignes de retraitement, et un journal de
 * trésorerie qui n'existe dans aucun des deux autres jeux.
 *
 * Un onglet de plus qu'ailleurs : ÉLIGIBILITÉ. Le S.M.T n'est pas un choix
 * de présentation mais une exception liée à la taille (art. 5 et 6) · un
 * dossier qui dépasse les seuils doit revenir au Système normal, et c'est
 * l'écran qui doit le dire.
 */
type Onglet = 'bilan' | 'compte-de-resultat' | 'journal' | 'notes' | 'eligibilite';

const LIBELLE_ONGLET: Record<Onglet, string> = {
  bilan: 'Bilan',
  'compte-de-resultat': 'Compte de résultat',
  journal: 'Note 4 · Journal unique de trésorerie',
  notes: 'Notes annexes',
  eligibilite: "Éligibilité au Système Minimal de Trésorerie",
};

/** Nom du fichier téléchargé · le serveur y ajoute le suffixe d'exercice. */
const FICHIER_ONGLET: Record<Onglet, string> = {
  bilan: 'bilan-smt',
  'compte-de-resultat': 'compte-de-resultat-smt',
  journal: 'note4-journal-tresorerie-smt',
  notes: 'notes-annexes-smt',
  eligibilite: 'eligibilite-smt',
};

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'bilan', libelle: 'BILAN' },
  { cle: 'compte-de-resultat', libelle: 'COMPTE DE RÉSULTAT' },
  { cle: 'journal', libelle: 'JOURNAL DE TRÉSORERIE' },
  { cle: 'notes', libelle: 'NOTES ANNEXES' },
  { cle: 'eligibilite', libelle: 'ÉLIGIBILITÉ' },
];

export function EtatsSmtPage() {
  const { exerciceCourant } = useExercice();
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState<Onglet>('bilan');

  const [bilan, setBilan] = useState<BilanSmt | null>(null);
  const [cr, setCr] = useState<CompteDeResultatSmt | null>(null);
  // NOTE 4 · lue à l'ouverture de SON onglet, jamais au montage de l'écran
  // (jumeau de l'audit final F258, déjà posé sur le S.M.T SYSCOHADA). C'est la
  // pièce qui parcourt, tranche par tranche, les écritures de trésorerie de
  // l'exercice ; la lire pour qui vient voir le bilan faisait payer au serveur
  // le livre entier à chaque ouverture. Elle garde l'exercice pour lequel elle
  // a été lue · en changer la relit.
  const [note4, setNote4] = useState<{ exerciceId: string; journal: Note4Smt } | null>(null);
  const [erreurNote4, setErreurNote4] = useState<string | null>(null);
  const [notes, setNotes] = useState<NotesSmt | null>(null);
  const [eligibilite, setEligibilite] = useState<EligibiliteSmt | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  // Ce que la Note 3 ne sait pas dater · null quand la ventilation est
  // complète, auquel cas l'écran est exactement celui d'avant.
  const lacuneEcheances = notes ? lacuneEcheancesNote3(notes.note3) : null;

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    // Le refus du journal d'un autre exercice ne se lit pas sur celui-ci.
    setErreurNote4(null);
    const echec = (e: Error) => !annule && setErreur(e.message);
    const q = `?exerciceId=${exerciceCourant.id}`;
    api.get<BilanSmt>(`/etats-financiers/smt/bilan${q}`).then((r) => !annule && setBilan(r), echec);
    api.get<CompteDeResultatSmt>(`/etats-financiers/smt/compte-de-resultat${q}`).then((r) => !annule && setCr(r), echec);
    api.get<NotesSmt>(`/etats-financiers/smt/notes${q}`).then((r) => !annule && setNotes(r), echec);
    api.get<EligibiliteSmt>(`/etats-financiers/smt/eligibilite${q}`).then((r) => !annule && setEligibilite(r), echec);
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

  useEffect(() => {
    if (!exerciceCourant || onglet !== 'journal' || note4?.exerciceId === exerciceCourant.id) return;
    let annule = false;
    const exerciceId = exerciceCourant.id;
    setErreurNote4(null);
    api.get<Note4Smt>(`/etats-financiers/smt/journal-tresorerie?exerciceId=${exerciceId}`).then(
      (journal) => !annule && setNote4({ exerciceId, journal }),
      // Un refus se lit sur l'onglet · au-delà de son plafond, le journal est
      // refusé par le serveur avec le chemin de rechange (le grand livre de
      // chaque compte de trésorerie).
      (e: Error) => !annule && setErreurNote4(e.message),
    );
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id, onglet]);

  // Le journal lu pour l'exercice AFFICHÉ, et pour lui seul.
  const journalNote4 = note4 && exerciceCourant && note4.exerciceId === exerciceCourant.id ? note4.journal : null;

  /**
   * Export Excel de l'onglet affiché · même mécanique que les deux autres
   * jeux (voir EtatsFinanciersPage) : un classeur par état, servi par
   * ExportService, avec ses feuilles de détail, de contrôles et de méthode.
   * Le chemin de l'export est celui de l'onglet, à un préfixe près.
   */
  /**
   * La liasse complète : tous les états du jeu retenu par le dossier dans un
   * seul classeur. C'est ce fichier qui se dépose au CPCC ou s'envoie à un
   * bailleur.
   */
  const exporterLiasse = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers/liasse-complete?exerciceId=${exerciceCourant.id}`,
        `liasse-complete-${libelleExercice(exerciceCourant)}.xlsx`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export de la liasse");
    } finally {
      setExportEnCours(false);
    }
  };

  const exporter = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers/smt/${onglet === 'journal' ? 'journal-tresorerie' : onglet}?exerciceId=${exerciceCourant.id}`,
        `${FICHIER_ONGLET[onglet]}.xlsx`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  // Une quantité se compte en kilogrammes comme en pièces · jamais arrondie
  // au centime comme un montant.
  const quantite = (v: number | null) => (v === null ? '·' : v.toLocaleString('fr-FR', { maximumFractionDigits: 3 }));
  const jour = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

  // Une ligne de la Note 1 · une caution (origine BALANCE) n'a ni mise en
  // service ni durée, et ne se dit pas « non mise en service ».
  const ligneNote1 = (l: NotesSmt['note1']['lignes'][number], i: number) => (
    <div key={`${l.origine}-${i}`} className="grid grid-cols-[86px_1fr_110px_100px_78px_86px_110px] gap-2 px-4 py-1 text-[11.5px]">
      <span className="font-mono text-[11.5px]">
        {l.dateMiseEnService ? jour(l.dateMiseEnService) : l.origine === 'REGISTRE' ? 'Non mis en service' : '·'}
      </span>
      <span>{l.designation}</span>
      <span className="font-mono text-right">{montant(l.montant)}</span>
      <span className="font-mono text-[11.5px]">{jour(l.dateAcquisition)}</span>
      <span className="font-mono text-right">{l.dureeUtiliteAns === null ? '·' : `${l.dureeUtiliteAns} ans`}</span>
      <span className="font-mono text-[11.5px]">{jour(l.dateSortie)}</span>
      <span className="font-mono text-right">{montant(l.prixCession)}</span>
    </div>
  );

  // --- Bilan : REF | Libellé | Note | Montant (N) | Montant (N-1) ---
  const ligneBilan = (p: PosteBilanSmt) => (
    <div
      key={p.ref}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[40px_1fr_44px_120px_120px] min-w-[540px] gap-2 px-4 py-1 text-[11.5px] ${
        p.estTotal ? 'font-bold bg-surface-alt border-y border-border' : p.montant === 0 ? 'text-text-dim' : ''
      }`}
    >
      <span className="font-mono text-[11px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-[11px] text-text-dim text-center">{p.note ?? ''}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(p.montantN1)}</span>
    </div>
  );

  // --- Compte de résultat : REF | Libellé | Note | Montant (N) | Montant (N-1) ---
  // Les colonnes de la maquette (Partie 4, ch. 4, section 2), comme au bilan.
  // Le renvoi de note est celui que la table porte (« 4 » de KA à JF), rien
  // sur les totaux ni sur VA à JG · la transcription n'en porte pas.
  const GRILLE_CR = 'grid-cols-[40px_1fr_44px_120px_120px] min-w-[540px]';
  const ligneFlux = (p: PosteFluxSmt) => (
    <div
      key={p.ref}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid ${GRILLE_CR} gap-2 px-4 py-1 text-[11.5px] ${p.montant === 0 ? 'text-text-dim' : ''}`}
    >
      <span className="font-mono text-[11px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-[11px] text-text-dim text-center">{p.note ?? ''}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
      <span className="font-mono text-right text-text-dim">{montant(p.montantN1)}</span>
    </div>
  );

  const ligneTotal = (ref: string, libelle: string, valeur: number, valeurN1: number | undefined) => (
    <div className={`grid ${GRILLE_CR} gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[11.5px] font-bold`}>
      <span className="font-mono text-[11px]">{ref}</span>
      <span>{libelle}</span>
      <span />
      <span className="font-mono text-right">{montant(valeur)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(valeurN1)}</span>
    </div>
  );

  const entete = (colonnes: string[], grille: string) => (
    <div className={`grid ${grille} gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim`}>
      {colonnes.map((c, i) => (
        <span key={c + i} className={i === 0 || i === 1 ? '' : 'text-right'}>
          {c}
        </span>
      ))}
    </div>
  );

  return (
    <div className="p-2">
      <EnteteImpression titre="États financiers" sousTitre={LIBELLE_ONGLET[onglet]} />
      <div className="ecran-seul flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-text-dim">
          <span>
            Jeu du Système Minimal de Trésorerie ·{' '}
            <button onClick={() => navigate('/parametres-dossier')} className="underline hover:text-sel">
              paramètres du dossier
            </button>
          </span>
          <Aide sujet="jeuEtats" />
        </div>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[11.5px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {libelleExercice(exerciceCourant)}
            </span>
          )}
          {/*
            DEUX boutons, et l'ordre compte. Un bouton par onglet suffit pour
            retravailler un état ; il ne suffit pas pour DÉPOSER. Une liasse,
            c'est cinq à sept états plus les notes : les télécharger un par un
            puis les recoller à la main, c'est la manipulation où l'on oublie
            une pièce. La liasse complète est donc l'action principale, et
            l'export de l'onglet courant l'action secondaire.
          */}
          <button
            onClick={exporterLiasse}
            disabled={exportEnCours}
            title="Tous les états du jeu dans un seul classeur, précédés d’un sommaire"
            className="flex items-center gap-1.5 border border-sel bg-sel text-white px-3 py-1.5 text-[11.5px] font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter la liasse complète'}
          </button>
          <button
            onClick={exporter}
            disabled={exportEnCours}
            title="Seulement l’état affiché dans cet onglet"
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11.5px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            Cet onglet
          </button>
        </div>
      </div>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[11.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[11.5px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="ecran-seul flex bg-chrome border border-border border-b-0">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`px-4 py-1.5 text-[11.5px] font-bold ${
              onglet === o.cle ? 'bg-surface border-x border-border' : 'text-text-dim'
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- */}
      {onglet === 'bilan' && bilan && (
        <div className="max-w-[900px]">
          <div
            // `overflow-x-auto` ici, `min-w` sur les lignes · les 388 px de colonnes
            // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
            // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
            // qui emportait alors titre, onglets et boutons hors de l'écran.
            className="border border-border bg-surface mb-3 overflow-x-auto"
          >
            {entete(['REF', 'ACTIF', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], 'grid-cols-[40px_1fr_44px_120px_120px] min-w-[540px]')}
            {bilan.actif.map(ligneBilan)}
          </div>
          <p className="text-[11px] text-text-dim mb-3">{bilan.renvoiImmobilisations}</p>

          <div className="border border-border bg-surface mb-3 overflow-x-auto">
            {entete(['REF', 'PASSIF', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], 'grid-cols-[40px_1fr_44px_120px_120px] min-w-[540px]')}
            {bilan.passif.map(ligneBilan)}
          </div>

          <div
            className={`flex items-center gap-2 px-3.5 py-2.5 border ${
              bilan.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
            }`}
          >
            <IconCheck width={14} height={14} className={bilan.equilibre ? 'text-positive' : 'text-danger'} />
            <span className="font-mono text-[11.5px] font-medium">
              {bilan.equilibre
                ? `LE BILAN EST ÉQUILIBRÉ · GZ = HZ = ${montant(bilan.totalActif)}`
                : 'DÉSÉQUILIBRE DÉTECTÉ · vérifier les écritures de l’exercice'}
            </span>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {onglet === 'compte-de-resultat' && cr && (
        <div className="max-w-[900px]">
          <div className="border border-border bg-surface mb-3 overflow-x-auto">
            {entete(['REF', 'LIBELLÉ', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], GRILLE_CR)}
            {cr.recettes.map(ligneFlux)}
            {ligneTotal('KX', 'TOTAL DES REVENUS ENCAISSÉS (A)', cr.totalRecettes, cr.totalRecettesN1)}
            {cr.depenses.map(ligneFlux)}
            {ligneTotal('JX', 'TOTAL DÉPENSES SUR CHARGES (B)', cr.totalDepenses, cr.totalDepensesN1)}
            {ligneTotal('KZ', 'SOLDE : excédent (+) ou insuffisance (-) de recettes (C = A-B)', cr.soldeCaisse, cr.soldeCaisseN1)}
            {cr.retraitements.map((r) => (
              <div
                key={r.ref}
                title={r.comptes.length > 0 ? `Comptes : ${r.comptes.map((c) => c.numero).join(', ')}` : undefined}
                className={`grid ${GRILLE_CR} gap-2 px-4 py-1 text-[11.5px]`}
              >
                <span className="font-mono text-[11px] text-text-dim">{r.ref}</span>
                <span>{r.libelle}</span>
                <span />
                <span className="font-mono text-right">{montant(r.montant)}</span>
                <span className="font-mono text-right text-text-dim">{montant(r.montantN1)}</span>
              </div>
            ))}
            {ligneTotal('KZC', "RÉSULTAT NET DE L'EXERCICE", cr.resultatNet, cr.resultatNetN1)}
          </div>

          {/* Les deux chemins vers le résultat doivent coïncider, une fois
              retirés les flux que la maquette officielle ne reprend nulle
              part. C'est le seul contrôle qui atteste que la reconstruction
              de trésorerie est complète. */}
          {Math.abs(cr.controle.fluxHorsExploitation) > 0.005 && (
            <div className="border border-border bg-surface px-3.5 py-2.5 mb-2">
              <div className="text-[11.5px] font-bold mb-1 flex items-center gap-1.5">
                Flux de trésorerie hors exploitation : {montant(cr.controle.fluxHorsExploitation)}
                <Aide
                  titre="Flux de trésorerie hors exploitation"
                  texte="Encaissements et décaissements qui ne sont ni un produit ni une charge (apport en dotation, emprunt, acquisition ou cession d'immobilisation, règlement d'un fournisseur d'investissements 481, que la variation des dettes d'exploitation VC ne reprend pas). Ils entrent dans le solde de caisse KZ mais pas dans le résultat, et la maquette officielle du Système minimal de trésorerie n'ouvre aucune ligne pour les reprendre. Le montant est donc calculé ici plutôt que laissé en écart inexpliqué."
                  source="SYCEBNL · maquette du Système minimal de trésorerie"
                />
              </div>
              {cr.controle.comptesHorsExploitation.map((c) => (
                <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                  <span>
                    {c.numero} · {c.intitule}
                  </span>
                  <span>{montant(c.montant)}</span>
                </div>
              ))}
            </div>
          )}

          <div
            className={`flex items-start gap-2 px-3.5 py-2.5 border ${
              cr.controle.concordant ? 'border-positive/30 bg-positive-soft' : 'border-warning/40 bg-warning-soft'
            }`}
          >
            <span className="text-[11.5px]">
              {cr.controle.concordant
                ? `Résultat net (KZC ${montant(cr.resultatNet)}), une fois retirés les flux hors exploitation, concorde avec le résultat du bilan (HB ${montant(cr.controle.resultatBilan)}).`
                : `Écart de ${montant(cr.controle.ecart)} entre le résultat reconstitué et le résultat du bilan (HB ${montant(
                    cr.controle.resultatBilan,
                  )}), flux hors exploitation déjà retirés. Une opération de trésorerie a une contrepartie qu'aucun poste ne capte, ou une charge sans décaissement n'est pas une dotation aux amortissements.`}
            </span>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {onglet === 'journal' && erreurNote4 && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[11.5px]">
          Journal de trésorerie indisponible · {erreurNote4}
        </div>
      )}
      {onglet === 'journal' && !journalNote4 && !erreurNote4 && (
        <div className="border border-border px-4 py-4 text-[11.5px] text-text-dim">Chargement du journal de trésorerie…</div>
      )}
      {onglet === 'journal' && journalNote4 && (
        <div className="overflow-x-auto">
          {journalNote4.journaux.length === 0 && (
            <div className="border border-border px-4 py-4 text-[11.5px] text-text-dim">
              Aucun compte de trésorerie mouvementé sur cet exercice.
            </div>
          )}
          {journalNote4.journaux.map((j) => (
            <div key={j.compteId} className="border border-border bg-surface mb-3 min-w-[900px]">
              <div className="flex items-center justify-between bg-surface-alt border-b border-border px-4 py-1.5">
                <span className="text-[11.5px] font-bold font-mono">
                  {j.numero} · {j.intitule}
                </span>
                <span
                  className={`text-[11px] font-mono ${j.boucle ? 'text-text-dim' : 'text-danger font-bold'}`}
                  title={
                    j.boucle
                      ? 'Le journal boucle : son solde final est celui du compte à la balance.'
                      : `Le solde du journal (${montant(j.soldeAReporter)}) diffère du solde du compte à la balance (${montant(j.soldeBalance)}).`
                  }
                >
                  Report à nouveau {montant(j.reportANouveau)} · Solde à reporter {montant(j.soldeAReporter)}
                  {!j.boucle && ` · balance ${montant(j.soldeBalance)}`}
                </span>
              </div>
              <div className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim">
                <span>DATE</span>
                <span>LIBELLÉ</span>
                <span className="text-right">RECETTES</span>
                <span className="text-right">DÉPENSES</span>
                <span className="text-right">SOLDE</span>
              </div>
              <div className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1 text-[11.5px] text-text-dim">
                <span>·</span>
                <span>Report à nouveau</span>
                <span className="text-right">·</span>
                <span className="text-right">·</span>
                <span className="font-mono text-right">{montant(j.reportANouveau)}</span>
              </div>
              {j.operations.map((o, i) => (
                <div
                  key={`${j.compteId}-${i}`}
                  title={
                    o.virementInterne
                      ? "Déplacement entre deux comptes de l'entité : ni recette ni dépense, donc absent du compte de résultat, mais bien un mouvement de ce compte."
                      : o.ventile
                        ? // Les LIBELLÉS de la maquette, lus du côté de l'opération ·
                          // recettes et dépenses ont chacune leur « Autres », sous la
                          // même clé, et la clé seule ne dit rien au lecteur.
                          (o.sens === 'RECETTE' ? journalNote4.colonnesRecettes : journalNote4.colonnesDepenses)
                            .filter((c) => Math.abs(o.ventilation[c.cle] ?? 0) > 0.005)
                            .map((c) => `${c.libelle} : ${montant(o.ventilation[c.cle])}`)
                            .join(' · ')
                        : 'Écriture partagée entre plusieurs comptes de trésorerie : ventilation non attribuée'
                  }
                  className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1 text-[11.5px]"
                >
                  <span className="font-mono text-[11.5px]">{jour(o.date)}</span>
                  <span>
                    {o.libelle}
                    {o.virementInterne && <span className="ml-1.5 text-[11px] text-text-dim">virement interne</span>}
                    {!o.virementInterne && !o.ventile && (
                      <span className="ml-1.5 text-[11px] text-warning">non ventilé</span>
                    )}
                  </span>
                  <span className="font-mono text-right">{o.recette ? montant(o.recette) : ''}</span>
                  <span className="font-mono text-right">{o.depense ? montant(o.depense) : ''}</span>
                  <span className="font-mono text-right text-text-dim">{montant(o.solde)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-t border-border text-[11.5px] font-bold">
                <span>·</span>
                {/* La maquette officielle nomme cette ligne « Solde à reporter ».
                    Les deux colonnes de totaux sont un ajout : les nommer évite
                    de laisser croire que le solde vaut 1 200 000 quand c'est le
                    cumul des recettes. */}
                <span>Totaux · solde à reporter</span>
                <span className="font-mono text-right">{montant(j.totalRecettes)}</span>
                <span className="font-mono text-right">{montant(j.totalDepenses)}</span>
                <span className="font-mono text-right">{montant(j.soldeAReporter)}</span>
              </div>
            </div>
          ))}
          {/* Les colonnes de ventilation de la maquette, listées telles quelles ·
              même présentation que le jumeau SYSCOHADA. */}
          <div className="border border-border bg-surface mb-3 px-3.5 py-2.5 max-w-[900px]">
            <div className="text-[11.5px] font-bold mb-1">Ventilation de la NOTE 4</div>
            <div className="text-[11.5px] mb-0.5">
              <span className="text-text-dim">Recettes : </span>
              {journalNote4.colonnesRecettes.map((c) => c.libelle).join(' · ')}
            </div>
            <div className="text-[11.5px]">
              <span className="text-text-dim">Dépenses : </span>
              {journalNote4.colonnesDepenses.map((c) => c.libelle).join(' · ')}
            </div>
          </div>
          <p className="text-[11px] text-text-dim max-w-[900px]">{journalNote4.nb}</p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {onglet === 'notes' && notes && (
        <div className="max-w-[1000px] overflow-x-auto">
          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              FICHE RÉCAPITULATIVE DES NOTES ANNEXES PRÉSENTÉES
            </div>
            {/* Colonnes « A (Applicable) | N/A (Non applicable) » de la fiche
                (Partie 4, ch. 4, section 3), servies par le serveur. */}
            <div className="grid grid-cols-[70px_1fr_180px_40px_40px] gap-2 px-4 py-1 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim">
              <span>NOTES</span>
              <span>INTITULÉS</span>
              <span />
              <span className="text-center" title="Applicable">A</span>
              <span className="text-center" title="Non applicable">N/A</span>
            </div>
            {notes.fiche.map((n) => {
              const applicable = notes.applicables.includes(n.numero);
              return (
                <div key={n.numero} className="grid grid-cols-[70px_1fr_180px_40px_40px] gap-2 px-4 py-1 text-[11.5px]">
                  <span className="font-mono text-[11.5px] text-text-dim">Note {n.numero}</span>
                  <span>{n.intitule}</span>
                  <span className="text-[11px] text-text-dim">
                    {n.partie === 'BILAN' ? 'Notes sur le bilan' : 'Notes sur compte de résultat'}
                  </span>
                  <span className="text-center font-bold">{applicable ? 'X' : ''}</span>
                  <span className="text-center font-bold">{applicable ? '' : 'X'}</span>
                </div>
              );
            })}
          </div>

          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 1 · TABLEAU D'ACQUISITION ET DE SUIVI DU MATÉRIEL, DU MOBILIER ET AUTRES IMMOBILISATIONS
            </div>
            <div className="grid grid-cols-[86px_1fr_110px_100px_78px_86px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim">
              <span>MISE EN SERVICE</span>
              <span>DÉSIGNATION</span>
              <span className="text-right">MONTANT</span>
              <span>ACQUISITION</span>
              <span className="text-right">DURÉE</span>
              <span>SORTIE</span>
              <span className="text-right">PRIX DE CESSION</span>
            </div>
            {/* « Aucune immobilisation » seulement si la classe 2 n'a rien à
                dire · un compte soldé hors fiches est nommé plus bas. */}
            {notes.note1.lignes.length === 0 &&
              notes.note1.sortiesDeLExercice.length === 0 &&
              notes.note1.ecartsGA.length === 0 && (
                <div className="px-4 py-2 text-[11.5px] text-text-dim">Aucune immobilisation enregistrée.</div>
              )}
            {notes.note1.lignes.map(ligneNote1)}
            <div className="grid grid-cols-[86px_1fr_110px_100px_78px_86px_110px] gap-2 px-4 py-1.5 border-t border-border text-[11.5px] font-bold">
              <span />
              <span title="Biens détenus à la clôture et cautions · un bien sorti n'est plus au bilan">TOTAL</span>
              <span className="font-mono text-right">{montant(notes.note1.total)}</span>
            </div>
            {notes.note1.sortiesDeLExercice.length > 0 && (
              <>
                <div className="px-4 py-1 bg-surface-alt border-y border-border text-[11px] font-bold text-text-dim">
                  BIENS SORTIS PENDANT L'EXERCICE · HORS DU TOTAL
                </div>
                {notes.note1.sortiesDeLExercice.map(ligneNote1)}
              </>
            )}
            {(notes.note1.motifCautions || notes.note1.motifEcartsGA) && (
              <div className="px-4 py-2 text-[11px] border-t border-border">
                {notes.note1.ecartsGA.map((e) => (
                  <div key={e.numero} className="text-warning">
                    {e.numero} {e.intitule} · solde {montant(e.soldeBalance)}, fiches {montant(e.valeurFiches)}, écart{' '}
                    {montant(e.ecart)}
                  </div>
                ))}
                {notes.note1.fichesSansSolde.map((f, i) => (
                  <div key={i} className="text-warning">
                    Fiche sans solde au compte · {f.designation} ({montant(f.montant)})
                  </div>
                ))}
                <span className="inline-flex items-center gap-1 text-text-dim">
                  {notes.note1.ecartsGA.length + notes.note1.fichesSansSolde.length > 0 ? 'Rapprochement avec le poste GA' : 'Cautions'}
                  <Aide
                    titre="Note 1 et poste GA"
                    texte={[notes.note1.motifEcartsGA, notes.note1.motifCautions].filter(Boolean).join(' ')}
                    source="SYCEBNL · Partie 4, ch. 4, section 3"
                  />
                </span>
              </div>
            )}
          </div>

          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 2 · ÉTAT DES STOCKS
            </div>
            <div className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim">
              <span>RÉFÉRENCE</span>
              <span>DÉSIGNATION</span>
              <span className="text-right">QUANTITÉ</span>
              <span className="text-right">PRIX UNITAIRE</span>
              <span className="text-right">MONTANT</span>
            </div>
            {/* Un compte compté porte une ligne PAR FICHE · la clé est le rang. */}
            {notes.note2.lignes.map((l, i) => (
              <div key={`${l.reference}-${i}`} className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1 text-[11.5px]">
                <span className="font-mono text-[11.5px]">{l.reference}</span>
                <span>{l.designation}</span>
                <span className="text-right text-text-dim">{quantite(l.quantite)}</span>
                <span className="text-right text-text-dim">{montant(l.prixUnitaire)}</span>
                <span className="font-mono text-right">{montant(l.montant)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1.5 border-t border-border text-[11.5px] font-bold">
              <span>·</span>
              <span>VALEUR DU STOCK FINAL</span>
              <span />
              <span />
              <span className="font-mono text-right">{montant(notes.note2.valeurStockFinal)}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1 text-[11.5px] font-bold">
              <span>·</span>
              <span>VALEUR DU STOCK INITIAL</span>
              <span />
              <span />
              <span className="font-mono text-right">{montant(notes.note2.valeurStockInitial)}</span>
            </div>
            {(notes.note2.sourceQuantites || !notes.note2.quantitesTenues) && (
              <p className="px-4 py-2 text-[11px] text-text-dim border-t border-border">
                {[notes.note2.sourceQuantites, notes.note2.quantitesTenues ? '' : notes.note2.motifQuantites]
                  .filter(Boolean)
                  .join(' ')}
              </p>
            )}
          </div>

          <div className="border border-border bg-surface mb-3 overflow-x-auto">
            <div className="min-w-[960px]">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 3 · ÉTAT DES CRÉANCES ET DES DETTES NON ÉCHUES
            </div>
            {/* LA PART QUE LA NOTE NE SAIT PAS DATER · elle n'est pas une
                catégorie de plus, c'est une lacune de tenue, et sur un dossier
                qui n'a jamais saisi d'échéance elle porte la totalité du
                solde. Elle passe donc avant les tableaux, jamais après. Le
                texte est monté par `lacuneEcheancesNote3`. */}
            {lacuneEcheances && (
              <div className="bg-warning-soft border-b border-warning/30 px-4 py-2 text-[11.5px]">
                <div className="font-bold">ÉCHÉANCES NON RENSEIGNÉES</div>
                <p className="mt-1">{lacuneEcheances.phrase}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
                  <span>
                    Créances non datées : <span className="font-mono font-bold">{montant(lacuneEcheances.creances)}</span>
                  </span>
                  <span>
                    Dettes non datées : <span className="font-mono font-bold">{montant(lacuneEcheances.dettes)}</span>
                  </span>
                </div>
                {lacuneEcheances.resteNegatif && <p className="mt-1.5">{lacuneEcheances.resteNegatif}</p>}
                <p className="mt-1.5">{lacuneEcheances.geste}</p>
              </div>
            )}
            {(
              [
                [
                  'CRÉANCES',
                  notes.note3.creances,
                  notes.note3.totalCreances,
                  notes.note3.totalCreancesNonEchues,
                  notes.note3.totalCreancesEchues,
                  notes.note3.totalCreancesNonVentilees,
                ],
                [
                  'DETTES',
                  notes.note3.dettes,
                  notes.note3.totalDettes,
                  notes.note3.totalDettesNonEchues,
                  notes.note3.totalDettesEchues,
                  notes.note3.totalDettesNonVentilees,
                ],
              ] as const
            ).map(([titre, lignes, total, totalNonEchu, totalEchu, totalNonDate]) => (
              <div key={titre}>
                <div className="grid grid-cols-[minmax(170px,1fr)_105px_105px_105px_105px_105px_105px_74px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[11px] font-bold text-text-dim">
                  <span>{titre}</span>
                  <span className="text-right">AU 31/12/N</span>
                  <span className="text-right">DONT NON ÉCHU</span>
                  <span className="text-right">DONT ÉCHU</span>
                  <span className="text-right text-warning">NON DATÉ</span>
                  <span className="text-right">AU 01/01/N</span>
                  <span className="text-right">VARIATION</span>
                  <span className="text-right">VAR. %</span>
                </div>
                {lignes.length === 0 && <div className="px-4 py-1.5 text-[11.5px] text-text-dim">Aucune ligne.</div>}
                {lignes.map((l) => (
                  <div key={l.numero} className="grid grid-cols-[minmax(170px,1fr)_105px_105px_105px_105px_105px_105px_74px] gap-2 px-4 py-1 text-[11.5px]">
                    <span>
                      <span className="font-mono text-[11.5px] text-text-dim">{l.numero}</span> {l.nom}
                    </span>
                    <span className="font-mono text-right">{montant(l.montantCloture)}</span>
                    <span className="font-mono text-right">{montant(l.montantNonEchu)}</span>
                    <span className="font-mono text-right">{montant(l.montantEchu)}</span>
                    <span className={`font-mono text-right ${Math.abs(l.montantNonVentile) >= 0.005 ? 'text-warning' : 'text-text-dim'}`}>
                      {montant(l.montantNonVentile)}
                    </span>
                    <span className="font-mono text-right">{montant(l.montantOuverture)}</span>
                    <span className="font-mono text-right">{montant(l.variationValeur)}</span>
                    <span className="font-mono text-right text-text-dim">
                      {l.variationPourcent === null ? '·' : `${l.variationPourcent.toFixed(1)} %`}
                    </span>
                  </div>
                ))}
                <div className="grid grid-cols-[minmax(170px,1fr)_105px_105px_105px_105px_105px_105px_74px] gap-2 px-4 py-1.5 text-[11.5px] font-bold">
                  <span>TOTAL DES {titre}</span>
                  <span className="font-mono text-right">{montant(total)}</span>
                  <span className="font-mono text-right">{montant(totalNonEchu)}</span>
                  <span className="font-mono text-right">{montant(totalEchu)}</span>
                  <span className={`font-mono text-right ${Math.abs(totalNonDate) >= 0.005 ? 'text-warning' : 'text-text-dim'}`}>
                    {montant(totalNonDate)}
                  </span>
                  <span />
                  <span />
                  <span />
                </div>
                {/* Les dépréciations 490 à 498 en déduction des créances, puis
                    les créances nettes, qui sont le poste GC (fiche du COMPTE 49).
                    Hors ventilation : une dépréciation n'a pas d'échéance. */}
                {titre === 'CRÉANCES' && notes.note3.depreciationsCreances.length > 0 && (
                  <>
                    {notes.note3.depreciationsCreances.map((d) => (
                      <div key={d.numero} className="grid grid-cols-[minmax(170px,1fr)_105px_105px_105px_105px_105px_105px_74px] gap-2 px-4 py-1 text-[11.5px]">
                        <span title="Dépréciation, en déduction des créances">
                          <span className="font-mono text-[11.5px] text-text-dim">{d.numero}</span> {d.intitule}
                        </span>
                        <span className="font-mono text-right">{montant(d.montantCloture)}</span>
                        <span />
                        <span />
                        <span />
                        <span className="font-mono text-right">{montant(d.montantOuverture)}</span>
                        <span className="font-mono text-right">{montant(d.variationValeur)}</span>
                        <span />
                      </div>
                    ))}
                    <div className="grid grid-cols-[minmax(170px,1fr)_105px_105px_105px_105px_105px_105px_74px] gap-2 px-4 py-1.5 text-[11.5px] font-bold">
                      <span>CRÉANCES NETTES (poste GC)</span>
                      <span className="font-mono text-right">{montant(notes.note3.totalCreancesNettes)}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {/* La ventilation S'AJOUTE à la maquette, elle ne l'ampute pas :
                la colonne officielle « Montant au 31 décembre N » reste le
                solde entier, faute de quoi la note cesserait de justifier les
                postes GC et HD du bilan qu'elle accompagne. */}
            <p className="px-4 py-2 text-[11px] text-text-dim border-t border-border">
              La colonne « au 31/12/N » porte le solde ENTIER du compte, comme la maquette officielle · c'est « dont non
              échu » qui répond au titre de la note. Les trois parts la totalisent toujours.
              {notes.note3.motifEcheances ? ` ${notes.note3.motifEcheances}` : ''}
            </p>
            </div>
          </div>

          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 5 · DOTATION
            </div>
            {notes.note5.rubriques.map((r) => (
              <div key={r.cle} className="grid grid-cols-[1fr_140px] gap-2 px-4 py-1 text-[11.5px]">
                <span>{r.libelle}</span>
                <span className="font-mono text-right">{montant(r.montant)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_140px] gap-2 px-4 py-1.5 border-t border-border text-[11.5px] font-bold">
              <span>TOTAL</span>
              <span className="font-mono text-right">{montant(notes.note5.total)}</span>
            </div>
            {/* Ce que le poste HA reprend et qu'aucune rubrique n'ouvre (106) ·
                sous le TOTAL de la maquette, qui ne bouge pas. */}
            {notes.note5.horsRubriques.length > 0 && (
              <>
                {notes.note5.horsRubriques.map((c) => (
                  <div key={c.numero} className="grid grid-cols-[1fr_140px] gap-2 px-4 py-1 text-[11.5px] text-warning">
                    <span>
                      <span className="font-mono text-[11.5px]">{c.numero}</span> {c.intitule} · hors rubriques
                    </span>
                    <span className="font-mono text-right">{montant(c.montant)}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_140px] gap-2 px-4 py-1.5 border-t border-border text-[11.5px] font-bold">
                  <span className="inline-flex items-center gap-1">
                    POSTE HA DU BILAN
                    <Aide
                      titre="Note 5 et poste HA"
                      texte={notes.note5.motifHorsRubriques ?? ''}
                      source="SYCEBNL · Partie 4, ch. 4, section 3 ; Partie 2, ch. 2"
                    />
                  </span>
                  <span className="font-mono text-right">{montant(notes.note5.totalPosteHA)}</span>
                </div>
              </>
            )}
            {notes.note5.membres.length > 0 && (
              <>
                <div className="grid grid-cols-[1fr_120px_120px_170px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[11px] font-bold text-text-dim">
                  <span className="inline-flex items-center gap-1">
                    MEMBRE APPORTEUR
                    <Aide titre="Membres apporteurs" texte={notes.note5.motifMembres} source="SYCEBNL · Partie 2, ch. 3, COMPTE 45" />
                  </span>
                  <span>NATIONALITÉ</span>
                  <span className="text-right">MONTANT</span>
                  <span title="Préciser avec droit d'entrée ou sans droit d'entrée">DROIT D'ENTRÉE</span>
                </div>
                {notes.note5.membres.map((m) => (
                  <div key={m.numero} className="grid grid-cols-[1fr_120px_120px_170px] gap-2 px-4 py-1 text-[11.5px]">
                    <span>{m.nom}</span>
                    <span className="text-text-dim">·</span>
                    <span className="font-mono text-right">{montant(m.montant)}</span>
                    <span className="text-text-dim">·</span>
                  </div>
                ))}
              </>
            )}
            <p className="px-4 py-2 text-[11px] text-text-dim border-t border-border">{notes.note5.motifColonnesNonTenues}</p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {onglet === 'eligibilite' && eligibilite && (
        <div className="max-w-[760px]">
          <div className="border border-border bg-surface mb-3">
            <div className="grid grid-cols-[1fr_150px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim">
              <span title="SYCEBNL, art. 6">CATÉGORIE DE RESSOURCES</span>
              <span className="text-right">EXERCICE N</span>
            </div>
            {eligibilite.categories.map((c) => (
              <div
                key={c.cle}
                title={c.comptes.length > 0 ? `Comptes : ${c.comptes.map((x) => x.numero).join(', ')}` : undefined}
                className="grid grid-cols-[1fr_150px] gap-2 px-4 py-1 text-[11.5px]"
              >
                <span>{c.libelle}</span>
                <span className="font-mono text-right">{montant(c.montant)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_150px] gap-2 px-4 py-1.5 border-t border-border text-[11.5px] font-bold">
              <span>TOTAL DES RESSOURCES</span>
              <span className="font-mono text-right">{montant(eligibilite.totalRessources)}</span>
            </div>
          </div>
          <div className="border border-border bg-surface px-3.5 py-2.5">
            <div className="text-[11.5px] font-bold mb-1">
              Seuil légal : {eligibilite.seuilParCategorieFcfa.toLocaleString('fr-FR')} FCFA par catégorie
            </div>
            <p className="text-[11.5px] text-text-dim">
              Montants exprimés en {eligibilite.deviseDossier ?? 'monnaie de tenue du dossier'}.{' '}
              {eligibilite.avertissement}
            </p>
          </div>
        </div>
      )}

      {/* Encadré de signature · CPCC § 7.4 règle 7-b, imprimé uniquement. */}
      <BlocCertification />
    </div>
  );
}
