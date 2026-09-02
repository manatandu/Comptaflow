import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { IconCheck, IconExport } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import { BlocCertification, EnteteImpression } from '../components/chrome/EnteteImpression';
import type { CompteDuPoste } from '../lib/types';
import type {
  BilanSmtSyscohada,
  CompteDeResultatSmtSyscohada,
  EligibiliteSmtSyscohada,
  JournalTresorerieSmtSyscohada,
  Note4SmtSyscohada,
  NotesSmtSyscohada,
  PosteSmtSyscohada,
} from '../lib/types-smt-syscohada';

/**
 * ÉTATS FINANCIERS DU SYSTÈME MINIMAL DE TRÉSORERIE · SYSCOHADA RÉVISÉ
 * (AUDCIF art. 11 et 13, maquettes du Titre X ch. 1 à 3).
 *
 * Écran distinct de celui du Système normal parce que le SMT est un JEU
 * d'états entier et non une variante de présentation : autre base (une
 * comptabilité de trésorerie, où le fait générateur est l'encaissement ou
 * le décaissement), autres postes, autres notes. Le Titre X le dit en tête :
 * « les deux ne se transposent pas ».
 *
 * Écran distinct, aussi, de `EtatsSmtPage`, qui sert le S.M.T du SYCEBNL.
 * Même déroulé à l'écran, aucune ligne comptable commune : les postes, les
 * notes, les seuils et le vocabulaire viennent tous du Titre X et de
 * l'article 13, jamais de l'autre référentiel (CLAUDE.md §6).
 *
 * CINQ onglets, dont un que le Système normal n'a pas · ÉLIGIBILITÉ. Le SMT
 * n'est pas un choix de présentation : l'art. 11 pose que « toute entité
 * est, sauf exception liée à sa taille, soumise au Système normal », et
 * l'art. 13 réserve le SMT aux entités sous trois seuils de chiffre
 * d'affaires. L'écran doit donc pouvoir dire à un dossier qu'il n'y a plus
 * sa place.
 *
 * Ce que cet écran ne masque JAMAIS, parce que c'est ce qui fait foi :
 * les comptes qu'aucun poste ne capte, l'écart de concordance entre les
 * deux chemins vers le résultat, les journaux qui ne bouclent pas, et les
 * colonnes de la maquette officielle qu'aucune donnée comptable ne sert.
 *
 * Lisible à 360 px : chaque tableau est un bloc qui défile horizontalement
 * dans sa propre boîte, jamais la page entière.
 */
type Onglet = 'bilan' | 'compte-de-resultat' | 'journal' | 'notes' | 'eligibilite';

const LIBELLE_ONGLET: Record<Onglet, string> = {
  bilan: 'Bilan SMT au 31 décembre N',
  'compte-de-resultat': 'Compte de résultat SMT au 31 décembre N',
  journal: 'NOTE 4 · Journal de trésorerie SMT',
  notes: 'Notes annexes · NOTES 1 à 3',
  eligibilite: 'Éligibilité au Système minimal de trésorerie',
};

/** Nom du fichier téléchargé · le serveur y ajoute le suffixe d'exercice. */
const FICHIER_ONGLET: Record<Onglet, string> = {
  bilan: 'bilan-smt-syscohada',
  'compte-de-resultat': 'compte-de-resultat-smt-syscohada',
  journal: 'note4-journal-tresorerie-smt-syscohada',
  notes: 'notes-annexes-smt-syscohada',
  eligibilite: 'eligibilite-smt-syscohada',
};

/**
 * Segment de route d'export, quand il existe. L'ÉLIGIBILITÉ n'en a pas :
 * ce n'est pas un état financier mais un contrôle d'assujettissement, et le
 * ch. 1 § 2 n'énumère que trois documents (Bilan, Compte de résultat, Notes
 * annexes). Le bouton est donc désactivé sur cet onglet plutôt que de
 * promettre un classeur qu'aucune route ne sert.
 */
const EXPORT_ONGLET: Record<Onglet, string | null> = {
  bilan: 'bilan',
  'compte-de-resultat': 'compte-de-resultat',
  journal: 'journal-tresorerie',
  notes: 'notes',
  eligibilite: null,
};

/**
 * Les trois documents du jeu, tels que le Titre X ch. 1 § 2 les nomme :
 * « le Bilan ; le Compte de résultat ; et les Notes annexes ». Le serveur
 * renvoie des clés techniques ; les afficher en les décapitalisant leur
 * ôterait leurs accents, et un état financier se nomme comme le texte le
 * nomme. Une clé inconnue reste affichée telle quelle plutôt que masquée.
 */
const NOM_DOCUMENT_SMT: Record<string, string> = {
  BILAN: 'le Bilan',
  COMPTE_DE_RESULTAT: 'le Compte de résultat',
  NOTES_ANNEXES: 'les Notes annexes',
};

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'bilan', libelle: 'BILAN' },
  { cle: 'compte-de-resultat', libelle: 'COMPTE DE RÉSULTAT' },
  { cle: 'journal', libelle: 'JOURNAL DE TRÉSORERIE' },
  { cle: 'notes', libelle: 'NOTES ANNEXES' },
  { cle: 'eligibilite', libelle: 'ÉLIGIBILITÉ' },
];

export function EtatsSmtSyscohadaPage() {
  const { exerciceCourant } = useExercice();
  const navigate = useNavigate();
  const [onglet, setOnglet] = useState<Onglet>('bilan');

  const [bilan, setBilan] = useState<BilanSmtSyscohada | null>(null);
  const [cr, setCr] = useState<CompteDeResultatSmtSyscohada | null>(null);
  const [note4, setNote4] = useState<Note4SmtSyscohada | null>(null);
  const [notes, setNotes] = useState<NotesSmtSyscohada | null>(null);
  const [eligibilite, setEligibilite] = useState<EligibiliteSmtSyscohada | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    const echec = (e: Error) => !annule && setErreur(e.message);
    const q = `?exerciceId=${exerciceCourant.id}`;
    const base = '/etats-financiers-syscohada/smt';
    api.get<BilanSmtSyscohada>(`${base}/bilan${q}`).then((r) => !annule && setBilan(r), echec);
    api.get<CompteDeResultatSmtSyscohada>(`${base}/compte-de-resultat${q}`).then((r) => !annule && setCr(r), echec);
    api.get<Note4SmtSyscohada>(`${base}/journal-tresorerie${q}`).then((r) => !annule && setNote4(r), echec);
    api.get<NotesSmtSyscohada>(`${base}/notes${q}`).then((r) => !annule && setNotes(r), echec);
    api.get<EligibiliteSmtSyscohada>(`${base}/eligibilite${q}`).then((r) => !annule && setEligibilite(r), echec);
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

  /**
   * La liasse complète : tous les états du système retenu par le dossier
   * dans un seul classeur. C'est le SERVICE qui tranche entre Système normal
   * et SMT d'après `systemeComptableSyscohada`, jamais le client · un
   * dossier ne doit pas pouvoir déposer un jeu d'états qui n'est pas le sien.
   */
  const exporterLiasse = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers-syscohada/liasse-complete?exerciceId=${exerciceCourant.id}`,
        `liasse-complete-syscohada-${new Date(exerciceCourant.dateDebut).getFullYear()}.xlsx`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export de la liasse");
    } finally {
      setExportEnCours(false);
    }
  };

  const exporter = async () => {
    const segment = EXPORT_ONGLET[onglet];
    if (!exerciceCourant || segment === null) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers-syscohada/smt/${segment}?exerciceId=${exerciceCourant.id}`,
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
  /** Infobulle de traçabilité · quels comptes composent le montant affiché. */
  const infoComptes = (comptes: CompteDuPoste[]) =>
    comptes.length > 0 ? `Comptes : ${comptes.map((c) => c.numero).join(', ')}` : undefined;

  // --- Bilan : REF | Libellé | Note | Exercice N | Exercice N-1 -------------
  // Les quatre colonnes de la maquette du ch. 2 § 1, plus le repère de poste
  // en tête de ligne · il n'est pas dans la maquette officielle du SMT, qui
  // ne code pas ses postes comme le Système normal (AD à DZ), mais c'est lui
  // qui permet de rapprocher un montant de sa règle de composition.
  const GRILLE_BILAN = 'grid-cols-[40px_minmax(160px,1fr)_38px_106px_106px] min-w-[540px]';
  const ligneBilan = (p: PosteSmtSyscohada) => (
    <div
      key={p.ref}
      title={infoComptes(p.comptes)}
      className={`grid ${GRILLE_BILAN} gap-2 px-3 py-1 text-[11px] ${
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

  // --- Compte de résultat : REF | Lettre | Libellé | Note | N | N-1 ---------
  const GRILLE_RESULTAT = 'grid-cols-[40px_26px_minmax(170px,1fr)_38px_106px_106px] min-w-[580px]';
  const ligneResultat = (p: PosteSmtSyscohada) => (
    <div
      key={p.ref}
      title={infoComptes(p.comptes)}
      className={`grid ${GRILLE_RESULTAT} gap-2 px-3 py-1 text-[11px] ${
        p.estTotal ? 'font-bold bg-surface-alt border-y border-border' : p.montant === 0 ? 'text-text-dim' : ''
      }`}
    >
      <span className="font-mono text-[10px] text-text-dim">{p.ref}</span>
      {/* Lettre de la maquette (A, B, C, F, G) · c'est elle que la formule
          officielle G = C - D + E - F invoque, pas le repère de poste. */}
      <span className="font-mono text-[10px] font-bold text-center">{p.lettre ?? ''}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-[10px] text-text-dim text-center">{p.note ?? ''}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(p.montantN1)}</span>
    </div>
  );

  const entete = (colonnes: string[], grille: string) => (
    <div
      className={`grid ${grille} gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim`}
    >
      {colonnes.map((c, i) => (
        <span key={c + i} className={i >= colonnes.length - 2 ? 'text-right' : ''}>
          {c}
        </span>
      ))}
    </div>
  );

  /**
   * Bloc titré · les maquettes du Titre X impriment chaque état sous son
   * intitulé. Le défilement horizontal est porté par le bloc lui-même : à
   * 360 px, une colonne de plus ne doit jamais faire défiler la PAGE, sans
   * quoi les onglets et les boutons d'export sortent de l'écran.
   */
  const bloc = (titre: string, contenu: React.ReactNode) => (
    <div className="border border-border bg-surface mb-3 overflow-x-auto">
      <div className="bg-surface-alt border-b border-border px-3 py-1.5 text-[10.5px] font-bold">{titre}</div>
      {contenu}
    </div>
  );

  /** Liste de comptes sous un encadré de contrôle · numéro, intitulé, montant. */
  const listeComptes = (comptes: CompteDuPoste[]) => (
    <div className="mt-1">
      {comptes.map((c) => (
        <div key={c.numero} className="flex justify-between gap-3 text-[10.5px] font-mono">
          <span className="min-w-0 break-words">
            {c.numero} · {c.intitule}
          </span>
          <span className="shrink-0">{montant(c.montant)}</span>
        </div>
      ))}
    </div>
  );

  const journalNonBoucle = (j: JournalTresorerieSmtSyscohada) =>
    `Le solde du journal (${montant(j.soldeAReporter)}) diffère du solde du compte à la balance (${montant(
      j.soldeBalance,
    )}).`;

  const segmentExport = EXPORT_ONGLET[onglet];

  return (
    <div className="p-2">
      <EnteteImpression titre="États financiers · Système minimal de trésorerie" sousTitre={LIBELLE_ONGLET[onglet]} />
      <div className="ecran-seul flex items-start justify-between gap-3 flex-wrap mb-1.5">
        <div className="min-w-0">
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            États financiers SYSCOHADA
            <Aide sujet="systemeSyscohada" />
          </h1>
          <div className="text-[10px] text-text-dim mt-0.5">
            Système minimal de trésorerie ·{' '}
            <button onClick={() => navigate('/parametres-dossier')} className="underline hover:text-sel">
              paramètres du dossier
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {exerciceCourant && (
            <span className="font-mono text-[10.5px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          {/*
            DEUX boutons, et l'ordre compte · même raison qu'ailleurs : un
            export par onglet suffit pour retravailler un état, il ne suffit
            pas pour DÉPOSER. Le jeu SMT est « un tout indissociable »
            (art. 8) de trois documents (Titre X ch. 1 § 2) : les télécharger
            un par un puis les recoller à la main est la manipulation où l'on
            oublie une pièce.
          */}
          <button
            onClick={exporterLiasse}
            disabled={exportEnCours}
            title="Tous les états du jeu dans un seul classeur, précédés d’un sommaire"
            className="flex items-center gap-1.5 border border-sel bg-sel text-white px-3 py-1.5 text-[10.5px] font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter la liasse complète'}
          </button>
          <button
            onClick={exporter}
            disabled={exportEnCours || segmentExport === null}
            title={
              segmentExport === null
                ? "L’éligibilité est un contrôle d’assujettissement (art. 11 et 13), pas un état financier : le jeu SMT du Titre X ch. 1 § 2 ne compte que le bilan, le compte de résultat et les notes annexes."
                : 'Seulement l’état affiché dans cet onglet'
            }
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconExport width={13} height={13} />
            Cet onglet
          </button>
        </div>
      </div>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[10.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[10.5px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="ecran-seul flex flex-wrap bg-chrome border border-border border-b-0">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`px-3 py-1.5 text-[10.5px] font-bold ${
              onglet === o.cle ? 'bg-surface border-x border-border' : 'text-text-dim'
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {onglet === 'bilan' && bilan && (
        <div className="max-w-[900px]">
          <div className="border border-border bg-surface mb-3 overflow-x-auto">
            {entete(['REF', 'ACTIF', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], GRILLE_BILAN)}
            {bilan.actif.map(ligneBilan)}
          </div>
          {/* Renvoi (1) du modèle officiel, imprimé sous l'actif · transcrit
              par la table de correspondance, jamais reformulé ici. */}
          <p className="text-[10px] text-text-dim mb-3">{bilan.renvoiImmobilisations}</p>

          <div className="border border-border bg-surface mb-3 overflow-x-auto">
            {entete(['REF', 'PASSIF', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], GRILLE_BILAN)}
            {bilan.passif.map(ligneBilan)}
          </div>

          {!bilan.exerciceN1Disponible && (
            <p className="text-[10px] text-text-dim mb-3">
              Premier exercice du dossier : la colonne « Exercice N-1 » de la maquette officielle reste vide, elle n'est
              pas servie à zéro.
            </p>
          )}

          <div
            className={`flex items-start gap-2 px-3.5 py-2.5 border mb-2 ${
              bilan.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
            }`}
          >
            <IconCheck
              width={14}
              height={14}
              className={`shrink-0 mt-0.5 ${bilan.equilibre ? 'text-positive' : 'text-danger'}`}
            />
            <span className="font-mono text-[10.5px] font-medium break-words">
              {bilan.equilibre
                ? `LE BILAN EST ÉQUILIBRÉ · Total actif = Total passif = ${montant(bilan.totalActif)}`
                : `DÉSÉQUILIBRE DÉTECTÉ · Total actif ${montant(bilan.totalActif)} contre Total passif ${montant(
                    bilan.totalPassif,
                  )}`}
            </span>
          </div>

          {/* JAMAIS MASQUÉS · un compte de bilan qu'aucun poste ne capte est
              exactement ce qui explique un déséquilibre. Le rattacher d'office
              au poste voisin le ferait disparaître de l'écran sans le faire
              disparaître de la comptabilité. */}
          {bilan.comptesNonRattaches.length > 0 && (
            <div className="border border-warning/40 bg-warning-soft px-3.5 py-2.5 mb-2">
              <div className="text-[10.5px] font-bold mb-1">
                {bilan.comptesNonRattaches.length} compte(s) de bilan hors maquette
              </div>
              <p className="text-[10.5px] mb-1">
                Ces comptes ne correspondent à aucun des postes du modèle officiel du Titre X ch. 2 § 1. Ils ne sont pas
                rattachés d'office : leur montant manque au total, et c'est ce qui explique un écart.
              </p>
              {listeComptes(bilan.comptesNonRattaches)}
            </div>
          )}

          {/* Le résultat a deux sources exclusives : les classes 6, 7 et 8
              avant l'écriture de clôture, le compte de report du résultat
              après. Les deux servies en même temps, il est compté deux fois. */}
          {bilan.controle.doubleComptageProbable && (
            <div className="border border-warning/40 bg-warning-soft px-3.5 py-2.5 mb-2">
              <div className="text-[10.5px] font-bold mb-1">Double comptage probable du résultat</div>
              <p className="text-[10.5px]">
                Le résultat ressort à la fois des comptes de charges et de produits ({montant(
                  bilan.controle.resultatClasses678,
                )}
                ) et du compte de résultat de l'exercice ({montant(bilan.controle.resultatCompte13)}). Avant clôture,
                seule la première source doit être servie ; après clôture, seule la seconde.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {onglet === 'compte-de-resultat' && cr && (
        <div className="max-w-[900px]">
          <div className="border border-border bg-surface mb-3 overflow-x-auto">
            {entete(['REF', '', 'RUBRIQUES', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'], GRILLE_RESULTAT)}
            {cr.lignes.map(ligneResultat)}
          </div>

          {/*
            LES LETTRES D ET E · anomalie du texte officiel, signalée et non
            corrigée. La maquette du ch. 2 § 2 étiquette A, B, C, F et G,
            invoque D et E dans la formule G = C - D + E - F, mais ne les
            attribue à aucune ligne. La lecture retenue est celle de la table
            de correspondance : D regroupe les variations soustraites, E la
            variation ajoutée. Elle est affichée pour que le lecteur puisse la
            contredire, pas cachée dans un calcul.
          */}
          <div className="border border-border bg-surface px-3.5 py-2.5 mb-2">
            <div className="text-[10.5px] font-bold mb-1">Formule officielle · G = C - D + E - F</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px] font-mono">
              <span>C</span>
              <span>{montant(cr.soldeCaisse)}</span>
              <span>D ({cr.lettresDE.D.join(' + ')})</span>
              <span>{montant(cr.lettres.D)}</span>
              <span>E ({cr.lettresDE.E.join(' + ')})</span>
              <span>{montant(cr.lettres.E)}</span>
              <span>F</span>
              <span>{montant(cr.lettres.F)}</span>
              <span className="font-bold">G</span>
              <span className="font-bold">{montant(cr.resultatExercice)}</span>
            </div>
            <p className="text-[10px] text-text-dim mt-1.5">
              La maquette officielle étiquette A, B, C, F et G, mais n'attribue D et E à aucune ligne alors que la
              formule les invoque : D regroupe les variations retranchées (stocks, créances), E la variation ajoutée
              (dettes d'exploitation). Anomalie du texte officiel, signalée et non corrigée.
              {cr.definitionVariation === 'N1_MOINS_N' && (
                <>
                  {' '}
                  Les variations sont prises dans le sens N-1 moins N, celui du compte de variation des stocks (stock
                  initial moins stock final) : c'est la seule lecture qui rende exacts à la fois les opérateurs imprimés
                  devant les lignes et la formule.
                </>
              )}
            </p>
          </div>

          {/*
            FLUX HORS RÉSULTAT · encaissements et décaissements de financement
            et d'investissement. Ils ne corrigent PAS le résultat, qui est
            juste sans eux ; ils sont montrés parce que le ch. 1 § 1 range
            « les immobilisations acquises ou cédées » et « les emprunts
            souscrits ou remboursés » parmi les quatre éléments de
            l'inventaire extra-comptable de fin d'exercice.
          */}
          {cr.fluxHorsResultat.some((r) => Math.abs(r.montant) > 0.005) && (
            <div className="border border-border bg-surface px-3.5 py-2.5 mb-2">
              <div className="text-[10.5px] font-bold mb-1">Flux de trésorerie hors résultat</div>
              <p className="text-[10.5px] text-text-dim mb-1.5">
                Encaissements et décaissements qui ne sont ni une recette sur produits ni une dépense sur charges :
                apport ou prélèvement de l'exploitant, emprunt souscrit ou remboursé, immobilisation acquise ou cédée.
                Ils entrent dans le solde de trésorerie de la période mais pas dans le résultat, et la maquette du Titre
                X n'ouvre aucune ligne pour les reprendre. Signe positif pour un encaissement.
              </p>
              {cr.fluxHorsResultat
                .filter((r) => Math.abs(r.montant) > 0.005)
                .map((r) => (
                  <div key={r.cle} className="mb-1">
                    <div className="flex justify-between gap-3 text-[10.5px] font-bold">
                      <span className="min-w-0 break-words">{r.intitule}</span>
                      <span className="font-mono shrink-0">{montant(r.montant)}</span>
                    </div>
                    {listeComptes(r.comptes)}
                  </div>
                ))}
            </div>
          )}

          {cr.contrepartiesNonRattachees.length > 0 && (
            <div className="border border-warning/40 bg-warning-soft px-3.5 py-2.5 mb-2">
              <div className="text-[10.5px] font-bold mb-1">Contreparties de trésorerie non rattachées</div>
              <p className="text-[10.5px] mb-1">
                Ces comptes font face à un mouvement de trésorerie sans appartenir ni aux recettes, ni aux dépenses, ni
                au financement, ni à l'investissement. Ils ne sont rattachés à aucun poste voisin d'office.
              </p>
              {listeComptes(cr.contrepartiesNonRattachees)}
            </div>
          )}

          {/*
            LE CONTRÔLE QUI ATTESTE LA RECONSTRUCTION · le résultat se lit par
            deux chemins, la trésorerie corrigée (G) et le poste « Résultat
            exercice » du passif. L'écart entre les deux n'est pas toujours un
            défaut : c'est parfois la limite du modèle officiel, qui n'ouvre
            aucune ligne pour une valeur comptable de cession. Ce qui n'est
            pas expliqué reste affiché, jamais absorbé.
          */}
          <div
            className={`px-3.5 py-2.5 border ${
              cr.controle.concordant ? 'border-positive/30 bg-positive-soft' : 'border-warning/40 bg-warning-soft'
            }`}
          >
            <span className="text-[10.5px] break-words">
              {cr.controle.concordant
                ? `Le résultat reconstitué (G ${montant(cr.resultatExercice)}) concorde avec le poste « Résultat exercice » du bilan (${montant(
                    cr.controle.resultatBilan,
                  )}).`
                : `Écart de ${montant(cr.controle.ecart)} entre le résultat reconstitué (G ${montant(
                    cr.resultatExercice,
                  )}) et le poste « Résultat exercice » du bilan (${montant(cr.controle.resultatBilan)}).`}
            </span>
            {!cr.controle.concordant && (
              <div className="mt-1.5 text-[10.5px]">
                <div className="font-bold mb-0.5">Décomposition attendue de l'écart</div>
                <div className="grid grid-cols-[1fr_auto] gap-x-3 font-mono">
                  <span>Financement enregistré sans passer par la trésorerie</span>
                  <span className="text-right">{montant(cr.controle.composantesEcart.classe1)}</span>
                  <span>Investissement enregistré sans passer par la trésorerie</span>
                  <span className="text-right">{montant(cr.controle.composantesEcart.classe2)}</span>
                  <span>Dépréciations des comptes de trésorerie</span>
                  <span className="text-right">{montant(cr.controle.composantesEcart.depreciationsTresorerie)}</span>
                  <span>Autres comptes</span>
                  <span className="text-right">{montant(cr.controle.composantesEcart.autresComptes)}</span>
                  <span>Dotations reprises en F</span>
                  <span className="text-right">{montant(-cr.controle.composantesEcart.dotations)}</span>
                  <span className="font-bold">Total expliqué</span>
                  <span className="text-right font-bold">{montant(cr.controle.composantesEcart.total)}</span>
                </div>
                {Math.abs(cr.controle.residuel) > 0.01 ? (
                  <p className="mt-1">
                    Reste inexpliqué : {montant(cr.controle.residuel)}. Un résiduel non nul signale un vrai défaut
                    (compte hors plan, écriture déséquilibrée, contrepartie non rattachée), pas une limite du modèle.
                  </p>
                ) : (
                  <p className="mt-1 text-text-dim">
                    Résiduel nul : l'écart est entièrement expliqué par des opérations que la maquette officielle du SMT
                    n'a aucune ligne pour recevoir, typiquement la valeur comptable d'une immobilisation cédée saisie en
                    deux écritures.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {onglet === 'journal' && note4 && (
        <div>
          {note4.journaux.length === 0 && (
            <div className="border border-border px-4 py-4 text-[11px] text-text-dim">
              Aucun compte de trésorerie mouvementé sur cet exercice.
            </div>
          )}
          {note4.journaux.map((j) => (
            <div key={j.compteId} className="border border-border bg-surface mb-3 overflow-x-auto">
              <div className="flex items-center justify-between gap-2 flex-wrap bg-surface-alt border-b border-border px-3 py-1.5">
                <span className="text-[10.5px] font-bold font-mono">
                  {j.numero} · {j.intitule}
                </span>
                <span
                  className={`text-[10px] font-mono ${j.boucle ? 'text-text-dim' : 'text-danger font-bold'}`}
                  title={
                    j.boucle
                      ? 'Le journal boucle : son solde final est celui du compte à la balance.'
                      : journalNonBoucle(j)
                  }
                >
                  Report à nouveau {montant(j.reportANouveau)} · Solde à reporter {montant(j.soldeAReporter)}
                  {!j.boucle && ` · balance ${montant(j.soldeBalance)}`}
                </span>
              </div>
              {/* Colonnes de la maquette du ch. 3 : Date, Libellés, Recettes,
                  Dépenses, Solde. La ventilation analytique des recettes et
                  des dépenses est en infobulle plutôt qu'en colonnes : à neuf
                  colonnes de ventilation, le tableau devient illisible sur un
                  écran étroit et le journal cesse d'être consultable. */}
              <div className="grid grid-cols-[80px_minmax(140px,1fr)_100px_100px_100px] min-w-[560px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>DATE</span>
                <span>LIBELLÉS</span>
                <span className="text-right">RECETTES</span>
                <span className="text-right">DÉPENSES</span>
                <span className="text-right">SOLDE</span>
              </div>
              <div className="grid grid-cols-[80px_minmax(140px,1fr)_100px_100px_100px] min-w-[560px] gap-2 px-3 py-1 text-[11px] text-text-dim">
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
                      ? "Déplacement entre deux comptes de trésorerie de l'entité : ni recette ni dépense, donc absent du compte de résultat, mais bien un mouvement de ce compte."
                      : o.ventile
                        ? Object.entries(o.ventilation)
                            .filter(([, v]) => Math.abs(v) > 0.005)
                            .map(([k, v]) => `${k} : ${montant(v)}`)
                            .join(' · ')
                        : 'Écriture partagée entre plusieurs comptes de trésorerie : ventilation non attribuée'
                  }
                  className="grid grid-cols-[80px_minmax(140px,1fr)_100px_100px_100px] min-w-[560px] gap-2 px-3 py-1 text-[11px]"
                >
                  <span className="font-mono text-[10.5px]">{jour(o.date)}</span>
                  <span className="break-words">
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
              <div className="grid grid-cols-[80px_minmax(140px,1fr)_100px_100px_100px] min-w-[560px] gap-2 px-3 py-1.5 bg-surface-alt border-t border-border text-[11px] font-bold">
                <span>·</span>
                {/* La maquette nomme cette ligne « solde à reporter ». Les
                    deux colonnes de totaux sont un ajout : les nommer évite de
                    laisser croire que le solde vaut le cumul des recettes. */}
                <span>Totaux · solde à reporter</span>
                <span className="font-mono text-right">{montant(j.totalRecettes)}</span>
                <span className="font-mono text-right">{montant(j.totalDepenses)}</span>
                <span className="font-mono text-right">{montant(j.soldeAReporter)}</span>
              </div>
              {j.lignesNonVentilees > 0 && (
                <p className="px-3 py-1.5 text-[10px] text-warning border-t border-border">
                  {j.lignesNonVentilees} écriture(s) touchent plusieurs comptes de trésorerie à la fois : leur montant
                  est bien porté au journal, mais sa ventilation entre les colonnes analytiques n'est pas attribuable
                  sans clé de répartition, et aucune n'est inventée.
                </p>
              )}
            </div>
          ))}

          {/* Les colonnes de ventilation de la maquette, listées telles quelles
              avec ce que le NB officiel autorise à y rajouter. */}
          <div className="border border-border bg-surface mb-3 px-3.5 py-2.5 max-w-[900px]">
            <div className="text-[10.5px] font-bold mb-1">Ventilation de la NOTE 4</div>
            <div className="text-[10.5px] mb-0.5">
              <span className="text-text-dim">Recettes : </span>
              {note4.colonnesRecettes.map((c) => `${c.libelle}${c.rajoutAutorise ? ' (rajout)' : ''}`).join(' · ')}
            </div>
            <div className="text-[10.5px]">
              <span className="text-text-dim">Dépenses : </span>
              {note4.colonnesDepenses.map((c) => `${c.libelle}${c.rajoutAutorise ? ' (rajout)' : ''}`).join(' · ')}
            </div>
            <p className="text-[10px] text-text-dim mt-1.5">{note4.nb}</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {onglet === 'notes' && notes && (
        <div className="max-w-[1000px]">
          {bloc(
            'STRUCTURE OFFICIELLE DU JEU · TITRE X CH. 1 ET CH. 3',
            <>
              <div className="px-3 py-1.5 text-[10.5px]">
                <span className="text-text-dim">États financiers annuels du S.M.T : </span>
                {notes.fiche.documents.map((d) => NOM_DOCUMENT_SMT[d] ?? d).join(' · ')}
                {/* Pas de tableau des flux de trésorerie · le ch. 1 § 2
                    n'énumère que trois documents et le Titre X ne donne
                    aucune maquette de TFT. */}
              </div>
              {notes.fiche.notes.map((n) => (
                <div
                  key={n.numero}
                  className="grid grid-cols-[62px_minmax(120px,1fr)_150px] gap-2 px-3 py-1 text-[11px] min-w-[420px]"
                >
                  <span className="font-mono text-[10.5px] text-text-dim">NOTE {n.numero}</span>
                  <span className="break-words">{n.intitule}</span>
                  <span className="text-[10px] text-text-dim">
                    {n.partie === 'BILAN' ? 'Note sur le bilan' : 'Note sur le compte de résultat'}
                  </span>
                </div>
              ))}
              <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-dim">
                Pièces de suivi non numérotées comme notes, dont l'existence conditionne la fiabilité du système avec le
                journal de trésorerie (ch. 1 § 1) : {notes.fiche.journauxDeSuivi.map((j) => j.intitule).join(' · ')}.
              </div>
              <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-dim">
                Inventaire extra-comptable de fin d'exercice, à la charge du responsable de l'entité, dont les états
                récapitulatifs se conservent en pièce justificative :
                <ul className="list-disc ml-4 mt-0.5">
                  {notes.fiche.inventaireExtraComptable.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
              <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-dim">
                Amortissement : mode {notes.fiche.amortissement.mode.toLowerCase()}
                {!notes.fiche.amortissement.prorataTemporis && ' sans prorata temporis'} · règle propre au SMT (ch. 1
                § 1), distincte de celle du Système normal.
              </div>
            </>,
          )}

          {bloc(
            'NOTE 1 · TABLEAU SMT DE SUIVI DU MATÉRIEL, DU MOBILIER ET DES CAUTIONS',
            <div>
              <div className="grid grid-cols-[86px_minmax(150px,1fr)_110px_92px_110px] min-w-[560px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>DATE</span>
                <span>DÉSIGNATION</span>
                <span className="text-right">MONTANT</span>
                <span>DATE DE SORTIE</span>
                <span className="text-right">PRIX DE CESSION</span>
              </div>
              {notes.note1.lignes.length === 0 && (
                <div className="px-3 py-2 text-[10.5px] text-text-dim">
                  Aucune immobilisation ni caution enregistrée.
                </div>
              )}
              {notes.note1.lignes.map((l, i) => (
                <div
                  key={`${l.designation}-${i}`}
                  title={
                    l.origine === 'BALANCE'
                      ? "Repris depuis le solde du compte de dépôts et cautionnements versés : une caution n'est pas un bien amortissable et ne figure pas au registre des immobilisations."
                      : undefined
                  }
                  className="grid grid-cols-[86px_minmax(150px,1fr)_110px_92px_110px] min-w-[560px] gap-2 px-3 py-1 text-[11px]"
                >
                  <span className="font-mono text-[10.5px]">{jour(l.date)}</span>
                  <span className="break-words">
                    {l.designation}
                    {l.origine === 'BALANCE' && <span className="ml-1.5 text-[10px] text-text-dim">caution</span>}
                  </span>
                  <span className="font-mono text-right">{montant(l.montant)}</span>
                  <span className="font-mono text-[10.5px]">{jour(l.dateSortie)}</span>
                  <span className="font-mono text-right">{montant(l.prixCession)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[86px_minmax(150px,1fr)_110px_92px_110px] min-w-[560px] gap-2 px-3 py-1.5 border-t border-border text-[11px] font-bold">
                <span>·</span>
                <span>TOTAL</span>
                <span className="font-mono text-right">{montant(notes.note1.total)}</span>
                <span />
                <span />
              </div>
              {notes.note1.totalCautions !== 0 && (
                <p className="px-3 py-2 text-[10px] text-text-dim border-t border-border">
                  Dont registre des immobilisations {montant(notes.note1.totalRegistre)} et cautions{' '}
                  {montant(notes.note1.totalCautions)}. {notes.note1.motifCautions}
                </p>
              )}
            </div>,
          )}

          {bloc(
            'NOTE 2 · ÉTAT DES STOCKS',
            <div>
              <div className="grid grid-cols-[110px_minmax(140px,1fr)_86px_96px_110px] min-w-[540px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>RÉFÉRENCE</span>
                <span>DÉSIGNATION</span>
                <span className="text-right">QUANTITÉ</span>
                <span className="text-right">PRIX UNITAIRE</span>
                <span className="text-right">MONTANT</span>
              </div>
              {notes.note2.lignes.length === 0 && (
                <div className="px-3 py-2 text-[10.5px] text-text-dim">Aucun compte de stock mouvementé.</div>
              )}
              {notes.note2.lignes.map((l) => (
                <div
                  key={l.reference}
                  className="grid grid-cols-[110px_minmax(140px,1fr)_86px_96px_110px] min-w-[540px] gap-2 px-3 py-1 text-[11px]"
                >
                  <span className="font-mono text-[10.5px]">{l.reference}</span>
                  <span className="break-words">{l.designation}</span>
                  <span className="text-right text-text-dim">{montant(l.quantite)}</span>
                  <span className="text-right text-text-dim">{montant(l.prixUnitaire)}</span>
                  <span className="font-mono text-right">{montant(l.montant)}</span>
                </div>
              ))}
              {/* Les deux lignes de synthèse du bas de tableau, dans l'ordre du
                  texte · c'est leur différence qui alimente la variation des
                  stocks du compte de résultat. */}
              <div className="grid grid-cols-[110px_minmax(140px,1fr)_86px_96px_110px] min-w-[540px] gap-2 px-3 py-1.5 border-t border-border text-[11px] font-bold">
                <span>·</span>
                <span>{notes.note2.lignesSynthese[0]}</span>
                <span />
                <span />
                <span className="font-mono text-right">{montant(notes.note2.valeurStockFinal)}</span>
              </div>
              <div className="grid grid-cols-[110px_minmax(140px,1fr)_86px_96px_110px] min-w-[540px] gap-2 px-3 py-1 text-[11px] font-bold">
                <span>·</span>
                <span>{notes.note2.lignesSynthese[1]}</span>
                <span />
                <span />
                <span className="font-mono text-right">{montant(notes.note2.valeurStockInitial)}</span>
              </div>
              <p className="px-3 py-2 text-[10px] text-text-dim border-t border-border">
                Variation portée au compte de résultat : {montant(notes.note2.variationSv1)}.
                {!notes.note2.quantitesTenues && ` ${notes.note2.motifQuantites}`}
              </p>
            </div>,
          )}

          {bloc(
            'NOTE 3 · ÉTAT DES CRÉANCES ET DES DETTES NON ÉCHUES AU 31 DÉCEMBRE',
            <div>
              {/* DEUX tableaux, comme le ch. 3 les imprime : « Nom du client »
                  d'un côté, « Nom du fournisseur » de l'autre, chacun avec sa
                  ligne de total. Les fusionner aurait inventé un libellé que
                  le texte ne porte pas. */}
              {(
                [
                  ['CRÉANCES', 'NOM DU CLIENT', notes.note3.creances, notes.note3.totalCreances, 'TOTAL DES CRÉANCES'],
                  ['DETTES', 'NOM DU FOURNISSEUR', notes.note3.dettes, notes.note3.totalDettes, 'TOTAL DES DETTES'],
                ] as const
              ).map(([titre, colonneNom, lignes, total, libelleTotal]) => (
                <div key={titre}>
                  <div className="grid grid-cols-[minmax(150px,1fr)_110px_110px_110px_80px] min-w-[600px] gap-2 px-3 py-1.5 bg-surface-alt border-y border-border text-[10px] font-bold text-text-dim">
                    <span>{colonneNom}</span>
                    <span className="text-right">AU 31 DÉCEMBRE</span>
                    <span className="text-right">AU 1ER JANVIER</span>
                    <span className="text-right">VARIATION</span>
                    <span className="text-right">VARIATION %</span>
                  </div>
                  {lignes.length === 0 && (
                    <div className="px-3 py-1.5 text-[10.5px] text-text-dim">Aucune ligne.</div>
                  )}
                  {lignes.map((l) => (
                    <div
                      key={l.numero}
                      className="grid grid-cols-[minmax(150px,1fr)_110px_110px_110px_80px] min-w-[600px] gap-2 px-3 py-1 text-[11px]"
                    >
                      <span className="break-words">
                        <span className="font-mono text-[10.5px] text-text-dim">{l.numero}</span> {l.nom}
                      </span>
                      <span className="font-mono text-right">{montant(l.montantCloture)}</span>
                      <span className="font-mono text-right">{montant(l.montantOuverture)}</span>
                      <span className="font-mono text-right">{montant(l.variationValeur)}</span>
                      <span className="font-mono text-right text-text-dim">
                        {l.variationPourcent === null ? '·' : `${l.variationPourcent.toFixed(1)} %`}
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[minmax(150px,1fr)_110px_110px_110px_80px] min-w-[600px] gap-2 px-3 py-1.5 text-[11px] font-bold">
                    <span>{libelleTotal}</span>
                    <span className="font-mono text-right">{montant(total)}</span>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ))}
              <p className="px-3 py-2 text-[10px] text-text-dim border-t border-border">
                Variations portées au compte de résultat : créances {montant(notes.note3.variationSv2)}, dettes
                d'exploitation {montant(notes.note3.variationSv3)}. {notes.note3.reserveVariationPourcent}
              </p>
            </div>,
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {onglet === 'eligibilite' && eligibilite && (
        <div className="max-w-[860px]">
          {/*
            L'écran ne TRANCHE pas, et ce n'est pas une prudence de façade :
            l'art. 13 fait dépendre le seuil de la QUALIFICATION de l'activité
            (négoce, artisanat, services), que le dossier ne porte pas et que
            le texte confie à l'entité. La déduire du plan de comptes serait
            écrire une règle qui n'existe pas.
          */}
          {bloc(
            "CHIFFRE D'AFFAIRES HORS TAXES DE L'EXERCICE",
            <>
              <div className="grid grid-cols-[42px_minmax(140px,1fr)_130px] min-w-[420px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>REF</span>
                <span>POSTE</span>
                <span className="text-right">EXERCICE N</span>
              </div>
              {eligibilite.ventilation.map((v) => (
                <div
                  key={v.ref}
                  title={infoComptes(v.comptes)}
                  className={`grid grid-cols-[42px_minmax(140px,1fr)_130px] min-w-[420px] gap-2 px-3 py-1 text-[11px] ${
                    v.montant === 0 ? 'text-text-dim' : ''
                  }`}
                >
                  <span className="font-mono text-[10px] text-text-dim">{v.ref}</span>
                  <span className="break-words">{v.libelle}</span>
                  <span className="font-mono text-right">{montant(v.montant)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[42px_minmax(140px,1fr)_130px] min-w-[420px] gap-2 px-3 py-1.5 border-t border-border text-[11px] font-bold">
                <span>·</span>
                <span>CHIFFRE D'AFFAIRES</span>
                <span className="font-mono text-right">{montant(eligibilite.chiffreAffaires)}</span>
              </div>
              <p className="px-3 py-2 text-[10px] text-text-dim border-t border-border">
                Lu en solde des comptes de ventes, c'est-à-dire en montant facturé et non en encaissements : l'article 13
                parle de chiffre d'affaires, pas de recettes. Une entité qui facture beaucoup et encaisse peu n'échappe
                pas au Système normal. Montants exprimés en {eligibilite.deviseDossier ?? 'monnaie de tenue du dossier'}.
              </p>
              {eligibilite.comptesHorsVentilation.length > 0 && (
                <div className="px-3 py-2 border-t border-border">
                  <div className="text-[10.5px] font-bold mb-0.5">Comptes de ventes hors ventilation</div>
                  <p className="text-[10.5px] text-text-dim mb-1">
                    Ces comptes entrent dans le chiffre d'affaires sans se rattacher à l'un des quatre postes du modèle :
                    signalés plutôt que perdus.
                  </p>
                  {listeComptes(eligibilite.comptesHorsVentilation)}
                </div>
              )}
            </>,
          )}

          {bloc(
            "LES TROIS SEUILS DE L'ARTICLE 13",
            <>
              <div className="grid grid-cols-[minmax(150px,1fr)_130px_120px] min-w-[440px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                <span>CATÉGORIE D'ACTIVITÉ</span>
                <span className="text-right">SEUIL (F CFA)</span>
                <span className="text-right">COMPARAISON BRUTE</span>
              </div>
              {eligibilite.seuils.map((s) => (
                <div
                  key={s.cle}
                  title={s.clause}
                  className="grid grid-cols-[minmax(150px,1fr)_130px_120px] min-w-[440px] gap-2 px-3 py-1 text-[11px]"
                >
                  <span className="break-words">{s.categorie}</span>
                  <span className="font-mono text-right">{s.montantFcfa.toLocaleString('fr-FR')}</span>
                  <span className={`text-right text-[10.5px] ${s.souSeuilSiMemeMonnaie ? 'text-positive' : 'text-warning'}`}>
                    {s.souSeuilSiMemeMonnaie ? 'sous le seuil' : 'au-dessus du seuil'}
                  </span>
                </div>
              ))}
              <p className="px-3 py-2 text-[10px] text-text-dim border-t border-border">
                {eligibilite.seuils[0]?.clause}. La colonne « comparaison brute » oppose le chiffre d'affaires du
                dossier au montant en F CFA sans aucune conversion : elle n'a de sens que si le dossier est tenu en
                F CFA, et n'est jamais une conclusion.
              </p>
            </>,
          )}

          <div className="border border-border bg-surface px-3.5 py-2.5 mb-3">
            <div className="text-[10.5px] font-bold mb-1">Ce que l'écran ne décide pas</div>
            <p className="text-[10.5px] mb-1.5">{eligibilite.qualificationParLEntite}</p>
            <p className="text-[10.5px] mb-1.5">{eligibilite.rappelArticle11}</p>
            <p className="text-[10.5px]">{eligibilite.avertissementConversion}</p>
          </div>

          <div className="border border-border bg-surface px-3.5 py-2.5">
            <div className="text-[10.5px]">
              <span className="text-text-dim">Système retenu par le dossier : </span>
              <span className="font-bold">
                {eligibilite.systemeActuel === 'MINIMAL_TRESORERIE'
                  ? 'Système minimal de trésorerie'
                  : eligibilite.systemeActuel === 'NORMAL'
                    ? 'Système normal'
                    : 'non renseigné'}
              </span>
              {' · '}
              <button onClick={() => navigate('/parametres-dossier')} className="underline hover:text-sel">
                paramètres du dossier
              </button>
            </div>
            <p className="text-[10px] text-text-dim mt-1">
              Exercice du {jour(eligibilite.exercice.dateDebut)} au {jour(eligibilite.exercice.dateFin)}.
            </p>
          </div>
        </div>
      )}

      {/* Encadré de signature · CPCC § 7.4 règle 7-b, imprimé uniquement. */}
      <BlocCertification />
    </div>
  );
}
