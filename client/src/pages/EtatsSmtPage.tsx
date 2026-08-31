import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
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
  PosteCalcule,
} from '../lib/types';

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
  const [note4, setNote4] = useState<Note4Smt | null>(null);
  const [notes, setNotes] = useState<NotesSmt | null>(null);
  const [eligibilite, setEligibilite] = useState<EligibiliteSmt | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    const echec = (e: Error) => !annule && setErreur(e.message);
    const q = `?exerciceId=${exerciceCourant.id}`;
    api.get<BilanSmt>(`/etats-financiers/smt/bilan${q}`).then((r) => !annule && setBilan(r), echec);
    api.get<CompteDeResultatSmt>(`/etats-financiers/smt/compte-de-resultat${q}`).then((r) => !annule && setCr(r), echec);
    api.get<Note4Smt>(`/etats-financiers/smt/journal-tresorerie${q}`).then((r) => !annule && setNote4(r), echec);
    api.get<NotesSmt>(`/etats-financiers/smt/notes${q}`).then((r) => !annule && setNotes(r), echec);
    api.get<EligibiliteSmt>(`/etats-financiers/smt/eligibilite${q}`).then((r) => !annule && setEligibilite(r), echec);
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

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
        `liasse-complete-${new Date(exerciceCourant.dateDebut).getFullYear()}.xlsx`,
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

  const montant = (v: number | null | undefined) =>
    v === null || v === undefined ? '·' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const jour = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

  // --- Bilan : REF | Libellé | Note | Montant (N) | Montant (N-1) ---
  const ligneBilan = (p: PosteBilanSmt) => (
    <div
      key={p.ref}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[40px_1fr_44px_120px_120px] gap-2 px-4 py-1 text-[12px] ${
        p.estTotal ? 'font-bold bg-surface-alt border-y border-border' : p.montant === 0 ? 'text-text-dim' : ''
      }`}
    >
      <span className="font-mono text-[10px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-[10px] text-text-dim text-center">{p.note ?? ''}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(p.montantN1)}</span>
    </div>
  );

  const ligneFlux = (p: PosteCalcule) => (
    <div
      key={p.ref}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[40px_1fr_130px] gap-2 px-4 py-1 text-[12px] ${p.montant === 0 ? 'text-text-dim' : ''}`}
    >
      <span className="font-mono text-[10px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
    </div>
  );

  const ligneTotal = (ref: string, libelle: string, valeur: number) => (
    <div className="grid grid-cols-[40px_1fr_130px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[12px] font-bold">
      <span className="font-mono text-[10px]">{ref}</span>
      <span>{libelle}</span>
      <span className="font-mono text-right">{montant(valeur)}</span>
    </div>
  );

  const entete = (colonnes: string[], grille: string) => (
    <div className={`grid ${grille} gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim`}>
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
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
            États financiers
            <Aide sujet="jeuEtats" />
          </h1>
          <div className="text-[10.5px] text-text-dim mt-0.5">
            Jeu du Système Minimal de Trésorerie ·{' '}
            <button onClick={() => navigate('/parametres-dossier')} className="underline hover:text-sel">
              paramètres du dossier
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[11px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
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
            className="flex items-center gap-1.5 border border-sel bg-sel text-white px-3 py-1.5 text-[11px] font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter la liasse complète'}
          </button>
          <button
            onClick={exporter}
            disabled={exportEnCours}
            title="Seulement l’état affiché dans cet onglet"
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            Cet onglet
          </button>
        </div>
      </div>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[11.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[11px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="ecran-seul flex bg-chrome border border-border border-b-0">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`px-4 py-1.5 text-[11px] font-bold ${
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
          <div className="border border-border bg-surface mb-3">
            {entete(['REF', 'ACTIF', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], 'grid-cols-[40px_1fr_44px_120px_120px]')}
            {bilan.actif.map(ligneBilan)}
          </div>
          <p className="text-[10px] text-text-dim mb-3">{bilan.renvoiImmobilisations}</p>

          <div className="border border-border bg-surface mb-3">
            {entete(['REF', 'PASSIF', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], 'grid-cols-[40px_1fr_44px_120px_120px]')}
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
        <div className="max-w-[760px]">
          <div className="border border-border bg-surface mb-3">
            {entete(['REF', 'LIBELLÉ', 'EXERCICE N'], 'grid-cols-[40px_1fr_130px]')}
            {cr.recettes.map(ligneFlux)}
            {ligneTotal('KX', 'TOTAL DES REVENUS ENCAISSÉS (A)', cr.totalRecettes)}
            {cr.depenses.map(ligneFlux)}
            {ligneTotal('JX', 'TOTAL DÉPENSES SUR CHARGES (B)', cr.totalDepenses)}
            {ligneTotal('KZ', 'SOLDE : excédent (+) ou insuffisance (-) de recettes (C = A-B)', cr.soldeCaisse)}
            {cr.retraitements.map((r) => (
              <div
                key={r.ref}
                title={r.comptes.length > 0 ? `Comptes : ${r.comptes.map((c) => c.numero).join(', ')}` : undefined}
                className="grid grid-cols-[40px_1fr_130px] gap-2 px-4 py-1 text-[12px]"
              >
                <span className="font-mono text-[10px] text-text-dim">{r.ref}</span>
                <span>{r.libelle}</span>
                <span className="font-mono text-right">{montant(r.montant)}</span>
              </div>
            ))}
            {ligneTotal('KZC', "RÉSULTAT NET DE L'EXERCICE", cr.resultatNet)}
          </div>

          {/* Les deux chemins vers le résultat doivent coïncider, une fois
              retirés les flux que la maquette officielle ne reprend nulle
              part. C'est le seul contrôle qui atteste que la reconstruction
              de trésorerie est complète. */}
          {Math.abs(cr.controle.fluxHorsExploitation) > 0.005 && (
            <div className="border border-border bg-surface px-3.5 py-2.5 mb-2">
              <div className="text-[11.5px] font-bold mb-1">
                Flux de trésorerie hors exploitation : {montant(cr.controle.fluxHorsExploitation)}
              </div>
              <p className="text-[11px] text-text-dim mb-1.5">
                Encaissements et décaissements qui ne sont ni un produit ni une charge (apport en dotation, emprunt,
                acquisition ou cession d'immobilisation). Ils entrent dans le solde de caisse KZ mais pas dans le
                résultat, et la maquette officielle du Système minimal de trésorerie n'ouvre aucune ligne pour les
                reprendre. Le montant est donc calculé ici plutôt que laissé en écart inexpliqué.
              </p>
              {cr.controle.comptesHorsExploitation.map((c) => (
                <div key={c.numero} className="flex justify-between text-[11px] font-mono">
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
      {onglet === 'journal' && note4 && (
        <div className="overflow-x-auto">
          {note4.journaux.length === 0 && (
            <div className="border border-border px-4 py-4 text-[12px] text-text-dim">
              Aucun compte de trésorerie mouvementé sur cet exercice.
            </div>
          )}
          {note4.journaux.map((j) => (
            <div key={j.compteId} className="border border-border bg-surface mb-3 min-w-[900px]">
              <div className="flex items-center justify-between bg-surface-alt border-b border-border px-4 py-1.5">
                <span className="text-[11.5px] font-bold font-mono">
                  {j.numero} · {j.intitule}
                </span>
                <span
                  className={`text-[10.5px] font-mono ${j.boucle ? 'text-text-dim' : 'text-danger font-bold'}`}
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
              <div className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>DATE</span>
                <span>LIBELLÉ</span>
                <span className="text-right">RECETTES</span>
                <span className="text-right">DÉPENSES</span>
                <span className="text-right">SOLDE</span>
              </div>
              <div className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1 text-[12px] text-text-dim">
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
                        ? Object.entries(o.ventilation)
                            .filter(([, v]) => Math.abs(v) > 0.005)
                            .map(([k, v]) => `${k} : ${montant(v)}`)
                            .join(' · ')
                        : 'Écriture partagée entre plusieurs comptes de trésorerie : ventilation non attribuée'
                  }
                  className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1 text-[12px]"
                >
                  <span className="font-mono text-[11px]">{jour(o.date)}</span>
                  <span>
                    {o.libelle}
                    {o.virementInterne && <span className="ml-1.5 text-[10px] text-text-dim">virement interne</span>}
                    {!o.virementInterne && !o.ventile && (
                      <span className="ml-1.5 text-[10px] text-warning">non ventilé</span>
                    )}
                  </span>
                  <span className="font-mono text-right">{o.recette ? montant(o.recette) : ''}</span>
                  <span className="font-mono text-right">{o.depense ? montant(o.depense) : ''}</span>
                  <span className="font-mono text-right text-text-dim">{montant(o.solde)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[86px_1fr_110px_110px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-t border-border text-[12px] font-bold">
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
          <p className="text-[10px] text-text-dim max-w-[900px]">{note4.nb}</p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {onglet === 'notes' && notes && (
        <div className="max-w-[1000px] overflow-x-auto">
          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              FICHE RÉCAPITULATIVE DES NOTES ANNEXES PRÉSENTÉES
            </div>
            {notes.fiche.map((n) => (
              <div key={n.numero} className="grid grid-cols-[70px_1fr_180px] gap-2 px-4 py-1 text-[12px]">
                <span className="font-mono text-[11px] text-text-dim">Note {n.numero}</span>
                <span>{n.intitule}</span>
                <span className="text-[10.5px] text-text-dim">
                  {n.partie === 'BILAN' ? 'Notes sur le bilan' : 'Notes sur compte de résultat'}
                </span>
              </div>
            ))}
          </div>

          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 1 · TABLEAU D'ACQUISITION ET DE SUIVI DU MATÉRIEL, DU MOBILIER ET AUTRES IMMOBILISATIONS
            </div>
            <div className="grid grid-cols-[86px_1fr_110px_100px_78px_86px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
              <span>MISE EN SERVICE</span>
              <span>DÉSIGNATION</span>
              <span className="text-right">MONTANT</span>
              <span>ACQUISITION</span>
              <span className="text-right">DURÉE</span>
              <span>SORTIE</span>
              <span className="text-right">PRIX DE CESSION</span>
            </div>
            {notes.note1.lignes.length === 0 && (
              <div className="px-4 py-2 text-[11.5px] text-text-dim">Aucune immobilisation enregistrée.</div>
            )}
            {notes.note1.lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-[86px_1fr_110px_100px_78px_86px_110px] gap-2 px-4 py-1 text-[12px]">
                <span className="font-mono text-[11px]">{jour(l.dateMiseEnService)}</span>
                <span>{l.designation}</span>
                <span className="font-mono text-right">{montant(l.montant)}</span>
                <span className="font-mono text-[11px]">{jour(l.dateAcquisition)}</span>
                <span className="font-mono text-right">{l.dureeUtiliteAns} ans</span>
                <span className="font-mono text-[11px]">{jour(l.dateSortie)}</span>
                <span className="font-mono text-right">{montant(l.prixCession)}</span>
              </div>
            ))}
          </div>

          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 2 · ÉTAT DES STOCKS
            </div>
            <div className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
              <span>RÉFÉRENCE</span>
              <span>DÉSIGNATION</span>
              <span className="text-right">QUANTITÉ</span>
              <span className="text-right">PRIX UNITAIRE</span>
              <span className="text-right">MONTANT</span>
            </div>
            {notes.note2.lignes.map((l) => (
              <div key={l.reference} className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1 text-[12px]">
                <span className="font-mono text-[11px]">{l.reference}</span>
                <span>{l.designation}</span>
                <span className="text-right text-text-dim">·</span>
                <span className="text-right text-text-dim">·</span>
                <span className="font-mono text-right">{montant(l.montant)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1.5 border-t border-border text-[12px] font-bold">
              <span>·</span>
              <span>VALEUR DU STOCK FINAL</span>
              <span />
              <span />
              <span className="font-mono text-right">{montant(notes.note2.valeurStockFinal)}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr_90px_100px_120px] gap-2 px-4 py-1 text-[12px] font-bold">
              <span>·</span>
              <span>VALEUR DU STOCK INITIAL</span>
              <span />
              <span />
              <span className="font-mono text-right">{montant(notes.note2.valeurStockInitial)}</span>
            </div>
            {!notes.note2.quantitesTenues && (
              <p className="px-4 py-2 text-[10px] text-text-dim border-t border-border">{notes.note2.motifQuantites}</p>
            )}
          </div>

          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 3 · ÉTAT DES CRÉANCES ET DES DETTES NON ÉCHUES
            </div>
            {(
              [
                ['CRÉANCES', notes.note3.creances, notes.note3.totalCreances],
                ['DETTES', notes.note3.dettes, notes.note3.totalDettes],
              ] as const
            ).map(([titre, lignes, total]) => (
              <div key={titre}>
                <div className="grid grid-cols-[1fr_120px_120px_120px_90px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[10px] font-bold text-text-dim">
                  <span>{titre}</span>
                  <span className="text-right">AU 31/12/N</span>
                  <span className="text-right">AU 01/01/N</span>
                  <span className="text-right">VARIATION</span>
                  <span className="text-right">VAR. %</span>
                </div>
                {lignes.length === 0 && <div className="px-4 py-1.5 text-[11.5px] text-text-dim">Aucune ligne.</div>}
                {lignes.map((l) => (
                  <div key={l.numero} className="grid grid-cols-[1fr_120px_120px_120px_90px] gap-2 px-4 py-1 text-[12px]">
                    <span>
                      <span className="font-mono text-[11px] text-text-dim">{l.numero}</span> {l.nom}
                    </span>
                    <span className="font-mono text-right">{montant(l.montantCloture)}</span>
                    <span className="font-mono text-right">{montant(l.montantOuverture)}</span>
                    <span className="font-mono text-right">{montant(l.variationValeur)}</span>
                    <span className="font-mono text-right text-text-dim">
                      {l.variationPourcent === null ? '·' : `${l.variationPourcent.toFixed(1)} %`}
                    </span>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_120px_120px_120px_90px] gap-2 px-4 py-1.5 text-[12px] font-bold">
                  <span>TOTAL DES {titre}</span>
                  <span className="font-mono text-right">{montant(total)}</span>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>

          <div className="border border-border bg-surface mb-3">
            <div className="bg-surface-alt border-b border-border px-4 py-1.5 text-[11.5px] font-bold">
              NOTE 5 · DOTATION
            </div>
            {notes.note5.rubriques.map((r) => (
              <div key={r.cle} className="grid grid-cols-[1fr_140px] gap-2 px-4 py-1 text-[12px]">
                <span>{r.libelle}</span>
                <span className="font-mono text-right">{montant(r.montant)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_140px] gap-2 px-4 py-1.5 border-t border-border text-[12px] font-bold">
              <span>TOTAL</span>
              <span className="font-mono text-right">{montant(notes.note5.total)}</span>
            </div>
            {notes.note5.membres.length > 0 && (
              <>
                <div className="grid grid-cols-[1fr_140px_140px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[10px] font-bold text-text-dim">
                  <span>MEMBRE APPORTEUR</span>
                  <span>NATIONALITÉ</span>
                  <span className="text-right">MONTANT</span>
                </div>
                {notes.note5.membres.map((m) => (
                  <div key={m.numero} className="grid grid-cols-[1fr_140px_140px] gap-2 px-4 py-1 text-[12px]">
                    <span>{m.nom}</span>
                    <span className="text-text-dim">·</span>
                    <span className="font-mono text-right">{montant(m.montant)}</span>
                  </div>
                ))}
              </>
            )}
            <p className="px-4 py-2 text-[10px] text-text-dim border-t border-border">{notes.note5.motifNationalite}</p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {onglet === 'eligibilite' && eligibilite && (
        <div className="max-w-[760px]">
          <div className="border border-border bg-surface mb-3">
            <div className="grid grid-cols-[1fr_150px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
              <span>CATÉGORIE DE RESSOURCES (ART. 6)</span>
              <span className="text-right">EXERCICE N</span>
            </div>
            {eligibilite.categories.map((c) => (
              <div
                key={c.cle}
                title={c.comptes.length > 0 ? `Comptes : ${c.comptes.map((x) => x.numero).join(', ')}` : undefined}
                className="grid grid-cols-[1fr_150px] gap-2 px-4 py-1 text-[12px]"
              >
                <span>{c.libelle}</span>
                <span className="font-mono text-right">{montant(c.montant)}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_150px] gap-2 px-4 py-1.5 border-t border-border text-[12px] font-bold">
              <span>TOTAL DES RESSOURCES</span>
              <span className="font-mono text-right">{montant(eligibilite.totalRessources)}</span>
            </div>
          </div>
          <div className="border border-border bg-surface px-3.5 py-2.5">
            <div className="text-[11.5px] font-bold mb-1">
              Seuil légal : {eligibilite.seuilParCategorieFcfa.toLocaleString('fr-FR')} FCFA par catégorie
            </div>
            <p className="text-[11px] text-text-dim">
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
