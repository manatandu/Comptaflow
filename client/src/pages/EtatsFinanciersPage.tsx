import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport, IconCheck } from '../components/chrome/icons';
import type {
  Bilan,
  BilanProjet,
  CompteDeResultat,
  CompteExploitationProjet,
  LigneBilan,
  LigneFluxTresorerie,
  NoteBailleur,
  PosteCalcule,
  TableauFluxTresorerie,
} from '../lib/types';

/**
 * Onglets du jeu « associations et ordres professionnels » (Partie 4, ch. 2)
 * vs du jeu « projets de développement et assimilés » (Partie 4, ch. 3) ·
 * jamais les deux à la fois : `useAuth().utilisateur.tenant.jeuEtatsFinanciersSycebnl`
 * décide lequel des deux jeux ce dossier affiche (voir
 * docs/plan-de-construction.md, item 13). Le Système Minimal de Trésorerie
 * (3ᵉ jeu) n'est pas construit et n'a pas d'onglet ici.
 */
type OngletAssociations = 'bilan' | 'compte-de-resultat' | 'flux-tresorerie';
type OngletProjet = 'bilan-projet' | 'compte-exploitation-projet' | 'note-bailleur';

export function EtatsFinanciersPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const jeuProjet = utilisateur?.tenant.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT';

  const [ongletAssociations, setOngletAssociations] = useState<OngletAssociations>('bilan');
  const [ongletProjet, setOngletProjet] = useState<OngletProjet>('bilan-projet');
  const onglet = jeuProjet ? ongletProjet : ongletAssociations;

  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [cr, setCr] = useState<CompteDeResultat | null>(null);
  const [tft, setTft] = useState<TableauFluxTresorerie | null>(null);
  const [bilanProjet, setBilanProjet] = useState<BilanProjet | null>(null);
  const [ceProjet, setCeProjet] = useState<CompteExploitationProjet | null>(null);
  const [noteBailleur, setNoteBailleur] = useState<NoteBailleur | null>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  // Drapeau `annule` : une réponse lente ne doit pas écraser un état plus
  // récent après un changement d'exercice. Un seul des deux jeux est
  // interrogé, selon le dossier · pas les deux à chaque fois.
  useEffect(() => {
    // `utilisateur` est null au tout premier rendu : sans cette garde, un
    // dossier « projets de développement » interrogerait d'abord les
    // endpoints du jeu ASSOCIATIONS (jeuProjet valant false par défaut),
    // puis rebasculerait · requêtes inutiles et onglets qui changent sous
    // l'œil. Corrigé à l'audit du 2026-08-28.
    if (!exerciceCourant || !utilisateur) return;
    let annule = false;
    if (jeuProjet) {
      api.get<BilanProjet>(`/etats-financiers/projet/bilan?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setBilanProjet(r),
        (e) => !annule && setErreur(e.message),
      );
      api.get<CompteExploitationProjet>(`/etats-financiers/projet/compte-exploitation?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setCeProjet(r),
        (e) => !annule && setErreur(e.message),
      );
      api.get<NoteBailleur>(`/etats-financiers/projet/note-bailleur?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setNoteBailleur(r),
        (e) => !annule && setErreur(e.message),
      );
    } else {
      api.get<Bilan>(`/etats-financiers/bilan?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setBilan(r),
        (e) => !annule && setErreur(e.message),
      );
      api.get<CompteDeResultat>(`/etats-financiers/compte-de-resultat?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setCr(r),
        (e) => !annule && setErreur(e.message),
      );
      // Le TFT est spécifique au jeu associations (Partie 4, ch. 1 § 4 : « un
      // état financier spécifique aux associations et ordres professionnels »).
      api.get<TableauFluxTresorerie>(`/etats-financiers/tableau-flux-tresorerie?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setTft(r),
        (e) => !annule && setErreur(e.message),
      );
    }
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, jeuProjet, utilisateur]);

  // Bouton du ruban désactivé : useRibbon fige les gestionnaires au montage,
  // il agirait donc toujours sur l'onglet initial. Le bouton fonctionnel est
  // dans l'en-tête de page.
  const exporter = async () => {
    if (!exerciceCourant) return;
    const chemin =
      onglet === 'bilan'
        ? 'bilan'
        : onglet === 'compte-de-resultat'
          ? 'compte-de-resultat'
          : onglet === 'flux-tresorerie'
            ? 'tableau-flux-tresorerie'
            : onglet === 'bilan-projet'
              ? 'projet/bilan'
              : onglet === 'compte-exploitation-projet'
                ? 'projet/compte-exploitation'
                : 'projet/note-bailleur';
    const nomFichier = chemin.includes('/') ? chemin.split('/')[1] + '-projet' : chemin;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(`/exports/etats-financiers/${chemin}?exerciceId=${exerciceCourant.id}`, `${nomFichier}.xlsx`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  const montant = (v: number | undefined) =>
    v === undefined ? '·' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // --- Compte de résultat : REF | Libellé | Montant (N) | Montant (N-1) ---
  // `cle` : par défaut `p.ref`, mais explicite côté compte d'exploitation
  // projet · TJ et TK y apparaissent deux fois (doublon officiel, voir
  // correspondance-projet-compte-exploitation.ts), une clé React sur le
  // seul `ref` y collisionnerait.
  const lignePoste = (p: PosteCalcule, cle: string = p.ref) => (
    <div
      key={cle}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : 'Aucun compte mouvementé'}
      className={`grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1 text-[12px] ${p.montant === 0 ? 'text-text-dim' : ''}`}
    >
      <span className="font-mono text-[11px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
      <span className="font-mono text-right text-text-dim">{montant(p.montantN1)}</span>
    </div>
  );

  // --- Tableau de flux de trésorerie : REF | Libellé | Montant (N) | Montant (N-1) ---
  const ligneFlux = (l: LigneFluxTresorerie) => (
    <div
      key={l.ref || l.libelle}
      title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1 text-[12px] ${
        l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
      }`}
    >
      <span className="font-mono text-[11px] text-text-dim">{l.ref}</span>
      <span>{l.libelle}</span>
      <span className="font-mono text-right">{montant(l.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
    </div>
  );

  const ligneTotal = (ref: string, libelle: string, valeur: number, valeurN1?: number) => (
    <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[12px] font-bold">
      <span className="font-mono text-[11px]">{ref}</span>
      <span>{libelle}</span>
      <span className="font-mono text-right">{montant(valeur)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(valeurN1)}</span>
    </div>
  );

  // --- Bilan actif : REF | Libellé | Brut (N) | Amort./dépréc. (N) | Net (N) | Net (N-1) ---
  const ligneActif = (l: LigneBilan) => (
    <div
      key={l.ref}
      title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[42px_1.4fr_100px_120px_100px_100px] gap-2 px-4 py-1 text-[12px] items-baseline ${
        l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
      }`}
    >
      <span className="font-mono text-[10px] text-text-dim">{l.ref}</span>
      <span>{l.libelle}</span>
      <span className="font-mono text-right">{montant(l.brut)}</span>
      <span className="font-mono text-right text-text-dim">{l.amortissement ? `(${montant(l.amortissement)})` : montant(l.amortissement)}</span>
      <span className="font-mono text-right">{montant(l.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
    </div>
  );

  // --- Bilan passif : REF | Libellé | Net (N) | Net (N-1) · pas de colonne Brut/Amort côté passif (le texte officiel n'en prévoit pas) ---
  const lignePassif = (l: LigneBilan) => (
    <div
      key={l.ref}
      title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1 text-[12px] items-baseline ${
        l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
      }`}
    >
      <span className="font-mono text-[10px] text-text-dim">{l.ref}</span>
      <span>{l.libelle}</span>
      <span className="font-mono text-right">{montant(l.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
    </div>
  );

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="text-[10.5px] font-mono text-text-dim">ÉTAT</div>
          <h1 className="text-[15px] font-bold">États financiers</h1>
        </div>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[11px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          <button
            onClick={exporter}
            disabled={exportEnCours}
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter Excel'}
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

      {jeuProjet && (
        <p className="text-[10.5px] text-text-dim mb-1.5">
          Jeu « Projets de développement et assimilés » (SYCEBNL, Partie 4 ch. 3) · Tableau emplois-ressources,
          Tableau d'exécution budgétaire et Tableau de réconciliation de trésorerie non construits (voir{' '}
          <code>EtatsFinanciersProjetService</code>) : seuls Bilan et Compte d'exploitation sont disponibles ici.
        </p>
      )}

      {jeuProjet ? (
        <div className="flex bg-chrome border border-border border-b-0">
          <button
            onClick={() => setOngletProjet('bilan-projet')}
            className={`px-4 py-1.5 text-[11px] font-bold ${
              onglet === 'bilan-projet' ? 'bg-surface border-r border-border' : 'text-text-dim'
            }`}
          >
            BILAN
          </button>
          <button
            onClick={() => setOngletProjet('compte-exploitation-projet')}
            className={`px-4 py-1.5 text-[11px] font-bold ${
              onglet === 'compte-exploitation-projet' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            COMPTE D'EXPLOITATION
          </button>
          <button
            onClick={() => setOngletProjet('note-bailleur')}
            className={`px-4 py-1.5 text-[11px] font-bold ${
              onglet === 'note-bailleur' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            NOTE 9 · FONDS DU BAILLEUR
          </button>
        </div>
      ) : (
        <div className="flex bg-chrome border border-border border-b-0">
          <button
            onClick={() => setOngletAssociations('bilan')}
            className={`px-4 py-1.5 text-[11px] font-bold ${onglet === 'bilan' ? 'bg-surface border-r border-border' : 'text-text-dim'}`}
          >
            BILAN
          </button>
          <button
            onClick={() => setOngletAssociations('compte-de-resultat')}
            className={`px-4 py-1.5 text-[11px] font-bold ${
              onglet === 'compte-de-resultat' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            COMPTE DE RÉSULTAT
          </button>
          <button
            onClick={() => setOngletAssociations('flux-tresorerie')}
            className={`px-4 py-1.5 text-[11px] font-bold ${
              onglet === 'flux-tresorerie' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            FLUX DE TRÉSORERIE
          </button>
        </div>
      )}

      {onglet === 'bilan' && (
        <>
          {!bilan && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {bilan && (
            <div className="max-w-[1180px] overflow-x-auto">
              {!bilan.exerciceN1Disponible && (
                <p className="text-[10.5px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier la colonne N-1 affiche « », pas un faux zéro.
                </p>
              )}

              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_120px_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>ACTIF</span>
                  <span className="text-right">BRUT (N)</span>
                  <span className="text-right">AMORT./DÉPRÉC. (N)</span>
                  <span className="text-right">NET (N)</span>
                  <span className="text-right">NET (N-1)</span>
                </div>
                {bilan.actif.map(ligneActif)}
              </div>

              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>PASSIF</span>
                  <span className="text-right">NET (N)</span>
                  <span className="text-right">NET (N-1)</span>
                </div>
                {bilan.passif.map(lignePassif)}
              </div>

              <div
                className={`flex items-center gap-2 px-3.5 py-2.5 border ${
                  bilan.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck width={14} height={14} className={bilan.equilibre ? 'text-positive' : 'text-danger'} />
                <span className="font-mono text-[11.5px] font-medium">
                  {bilan.equilibre
                    ? `LE BILAN EST ÉQUILIBRÉ · ACTIF = PASSIF = ${montant(bilan.totalActif)}`
                    : 'DÉSÉQUILIBRE DÉTECTÉ · vérifier les écritures et les comptes non rattachés ci-dessous'}
                </span>
              </div>

              {bilan.controle.doubleComptageProbable && (
                <div className="flex items-start gap-2 mt-2 px-3.5 py-2.5 border border-warning/40 bg-warning-soft">
                  <span className="text-[11.5px]">
                    ⚠ Les classes 6/7/8 ({montant(bilan.controle.resultatClasses678)}) ET le compte 13 (
                    {montant(bilan.controle.resultatCompte13)}) sont tous deux mouvementés · risque de double comptage
                    du résultat. Fournir une balance avant OU après clôture, pas un état intermédiaire.
                  </span>
                </div>
              )}

              {bilan.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[11.5px] font-bold mb-1.5">
                    Comptes de bilan rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {bilan.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-text-dim mt-3">
                Postes et rattachements conformes au tableau de correspondance officiel SYCEBNL (Journal officiel
                OHADA, Partie 4 ch. 2) · 3 colonnes Brut/Amort./Net côté actif et comparatif N-1 des deux côtés,
                comme l'exige le texte officiel. Comme au compte de résultat, les anomalies du texte officiel sont
                corrigées explicitement (comptes de tiers polyvalents 42-47 distingués par le sens du solde,
                provisions réglementées en poste 15) plutôt que devinées · voir <code>correspondance-bilan.ts</code>.
              </p>
            </div>
          )}
        </>
      )}

      {onglet === 'compte-de-resultat' && (
        <>
          {!cr && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {cr && (
            <div className="max-w-[900px]">
              {!cr.exerciceN1Disponible && (
                <p className="text-[10.5px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier la colonne N-1 affiche « », pas un faux zéro.
                </p>
              )}

              <div className="border border-border bg-surface shadow-posee">
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">MONTANT (N)</span>
                  <span className="text-right">MONTANT (N-1)</span>
                </div>
                {cr.produits.map((p) => lignePoste(p))}
                {ligneTotal('XA', 'REVENUS DES ACTIVITÉS ORDINAIRES', cr.totalProduits, cr.totalProduitsN1)}
                {cr.charges.map((p) => lignePoste(p))}
                {ligneTotal('XB', 'CHARGES DES ACTIVITÉS ORDINAIRES', cr.totalCharges, cr.totalChargesN1)}
                {ligneTotal(
                  'XC',
                  'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XA − XB)',
                  cr.resultatActivitesOrdinaires,
                  cr.resultatActivitesOrdinairesN1,
                )}
                {lignePoste(cr.produitsHao)}
                {lignePoste(cr.chargesHao)}
                {ligneTotal('XD', 'RÉSULTAT H.A.O. (TM − TN)', cr.resultatHao, cr.resultatHaoN1)}
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-2 bg-chrome border-t border-border-dark text-[12.5px] font-bold">
                  <span className="font-mono text-[11px]">XE</span>
                  <span>RÉSULTAT NET DE L'EXERCICE (+excédent, −déficit)</span>
                  <span className="font-mono text-right">{montant(cr.resultatNet)}</span>
                  <span className="font-mono text-right text-text-dim font-normal">{montant(cr.resultatNetN1)}</span>
                </div>
              </div>

              <div
                className={`flex items-start gap-2 mt-3 px-3.5 py-2.5 border ${
                  cr.controle.coherent ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck
                  width={14}
                  height={14}
                  className={`mt-0.5 shrink-0 ${cr.controle.coherent ? 'text-positive' : 'text-danger'}`}
                />
                <span className="font-mono text-[11.5px] font-medium">
                  {cr.controle.coherent
                    ? "L'ÉTAT BOUCLE · le résultat des postes est identique au résultat logé au bilan"
                    : `ÉCART DE ${montant(cr.controle.ecart)} · l'état ne boucle pas avec le bilan`}
                </span>
              </div>

              {cr.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[11.5px] font-bold mb-1.5">
                    Comptes de gestion rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {cr.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                  <p className="text-[10.5px] text-text-dim mt-1.5 font-sans">
                    Saisir sur la subdivision prévue par le plan officiel (ex. 7051/7052/7053 plutôt que 705), ou
                    vérifier le numéro de compte.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-text-dim mt-3">
                Postes et rattachements conformes au tableau de correspondance officiel SYCEBNL (Journal officiel OHADA,
                Partie 4 ch. 2). Charges présentées en positif, de sorte que XC = XA − XB. XA inclut RH : le libellé
                officiel dit « Somme RA à RG », ce qui romprait l'égalité entre le résultat et le bilan dès qu'il y a
                des reprises.
              </p>
            </div>
          )}
        </>
      )}

      {onglet === 'flux-tresorerie' && (
        <>
          {!tft && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {tft && (
            <div className="max-w-[900px]">
              {!tft.exerciceN1Disponible && (
                <p className="text-[10.5px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier la colonne N-1 affiche « », pas un faux zéro.
                </p>
              )}

              <div className="border border-border bg-surface shadow-posee">
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">EXERCICE N</span>
                  <span className="text-right">EXERCICE N-1</span>
                </div>
                {tft.lignes.map((l, i) =>
                  'section' in l ? (
                    <div key={`s${i}`} className="px-4 py-1 bg-chrome border-b border-border text-[10.5px] font-bold italic">
                      {l.section}
                    </div>
                  ) : (
                    ligneFlux(l)
                  ),
                )}
              </div>

              <div
                className={`flex flex-col gap-1 mt-3 px-3.5 py-2.5 border ${
                  tft.controle.coherent ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <div className="flex items-start gap-2">
                  <IconCheck
                    width={14}
                    height={14}
                    className={`mt-0.5 shrink-0 ${tft.controle.coherent ? 'text-positive' : 'text-danger'}`}
                  />
                  <span className="font-mono text-[11.5px] font-medium">
                    {tft.controle.coherent
                      ? "L'ÉTAT BOUCLE · trésorerie de clôture identique par cumul des flux et par lecture du bilan"
                      : `ÉCART DE ${montant(tft.controle.ecart)} · la ventilation FA-FQ ne couvre pas tout le mouvement de trésorerie`}
                  </span>
                </div>
                <div className="pl-[22px] font-mono text-[10.5px] text-text-dim">
                  Trésorerie ouverture {montant(tft.controle.tresorerieOuverture)} + variation{' '}
                  {montant(tft.controle.variation)} = {montant(tft.controle.tresorerieClotureParFlux)} (par les flux) ·
                  bilan : {montant(tft.controle.tresorerieClotureParBilan)}
                </div>
              </div>

              {tft.comptesNonVentiles.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[11.5px] font-bold mb-1.5">
                    Comptes encaissables/décaissables rattachés à aucun poste de flux · cause probable de l'écart
                  </div>
                  {tft.comptesNonVentiles.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-text-dim mt-3">
                Méthode directe imposée par le texte officiel (Partie 4, ch. 1 § 4) : Encaissements N = Revenus (N) +
                Créances (N-1) − Créances (N) ; Décaissements N = Achats (N) + Dettes (N-1) − Dettes (N). État
                spécifique au jeu associations et ordres professionnels.
              </p>
            </div>
          )}
        </>
      )}

      {onglet === 'bilan-projet' && (
        <>
          {!bilanProjet && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {bilanProjet && (
            <div className="max-w-[1180px] overflow-x-auto">
              {!bilanProjet.exerciceN1Disponible && (
                <p className="text-[10.5px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier la colonne N-1 affiche « », pas un faux zéro.
                </p>
              )}

              {/* DEUX colonnes de valeur, pas quatre : le texte officiel de ce
                  jeu ne prévoit ni Brut ni Amortissements côté actif · voir
                  correspondance-projet-bilan.ts. Le rendu passif convient donc
                  aux deux volets. */}
              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>ACTIF</span>
                  <span className="text-right">EXERCICE AU 31/12/N</span>
                  <span className="text-right">EXERCICE AU 31/12/N-1</span>
                </div>
                {bilanProjet.actif.map(lignePassif)}
              </div>

              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>PASSIF</span>
                  <span className="text-right">EXERCICE AU 31/12/N</span>
                  <span className="text-right">EXERCICE AU 31/12/N-1</span>
                </div>
                {bilanProjet.passif.map(lignePassif)}
              </div>

              <div
                className={`flex items-center gap-2 px-3.5 py-2.5 border ${
                  bilanProjet.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck width={14} height={14} className={bilanProjet.equilibre ? 'text-positive' : 'text-danger'} />
                <span className="font-mono text-[11.5px] font-medium">
                  {bilanProjet.equilibre
                    ? `LE BILAN EST ÉQUILIBRÉ · ACTIF = PASSIF = ${montant(bilanProjet.totalActif)}`
                    : 'DÉSÉQUILIBRE DÉTECTÉ · vérifier les écritures et les comptes non rattachés ci-dessous'}
                </span>
              </div>

              {bilanProjet.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[11.5px] font-bold mb-1.5">
                    Comptes de bilan rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {bilanProjet.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-text-dim mt-3">
                Postes et rattachements conformes au tableau de correspondance officiel SYCEBNL, jeu « projets de
                développement et assimilés » (Journal officiel OHADA, Partie 4 ch. 3) · voir{' '}
                <code>correspondance-projet-bilan.ts</code>. Deux colonnes de valeur seulement : contrairement au
                bilan des associations, le texte de ce jeu ne prévoit ni Brut ni Amortissements, et son tableau de
                correspondance ne cite aucun compte 28x/29x. CC (solde des opérations de l'exercice) vient
                uniquement du compte 13. Le poste DI reprend le compte 20 tel que l'écrit le texte officiel, bien
                qu'il s'agisse d'un compte d'actif · anomalie signalée, jamais corrigée en silence.
              </p>
            </div>
          )}
        </>
      )}

      {onglet === 'compte-exploitation-projet' && (
        <>
          {!ceProjet && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {ceProjet && (
            <div className="max-w-[900px]">
              {!ceProjet.exerciceN1Disponible && (
                <p className="text-[10.5px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier la colonne N-1 affiche « », pas un faux zéro.
                </p>
              )}

              <div className="border border-border bg-surface shadow-posee">
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">MONTANT (N)</span>
                  <span className="text-right">MONTANT (N-1)</span>
                </div>
                {ceProjet.revenus.map((p, i) => lignePoste(p, `revenu-${i}`))}
                {ligneTotal('XA', 'REVENUS (Somme RA à RE)', ceProjet.totalRevenus, ceProjet.totalRevenusN1)}
                {ceProjet.charges.map((p, i) => lignePoste(p, `charge-${i}`))}
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-2 bg-chrome border-t border-border-dark text-[12.5px] font-bold">
                  <span className="font-mono text-[11px]">XB</span>
                  <span>CHARGES DE FONCTIONNEMENT (Somme TA à TL)</span>
                  <span className="font-mono text-right">{montant(ceProjet.totalCharges)}</span>
                  <span className="font-mono text-right text-text-dim font-normal">{montant(ceProjet.totalChargesN1)}</span>
                </div>
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-2 bg-chrome border-t border-border-dark text-[12.5px] font-bold">
                  <span className="font-mono text-[11px]">XC</span>
                  <span>SOLDE DES OPÉRATIONS DE L'EXERCICE (XA − XB)</span>
                  <span className="font-mono text-right">{montant(ceProjet.solde)}</span>
                  <span className="font-mono text-right text-text-dim font-normal">{montant(ceProjet.soldeN1)}</span>
                </div>
              </div>

              <div
                className={`flex items-start gap-2 mt-3 px-3.5 py-2.5 border ${
                  ceProjet.controle.boucleAZero ? 'border-positive/30 bg-positive-soft' : 'border-warning/40 bg-warning-soft'
                }`}
              >
                <IconCheck
                  width={14}
                  height={14}
                  className={`mt-0.5 shrink-0 ${ceProjet.controle.boucleAZero ? 'text-positive' : 'text-warning'}`}
                />
                <span className="font-mono text-[11.5px] font-medium">
                  {ceProjet.controle.boucleAZero
                    ? `XC = ${montant(ceProjet.solde)} (≈ 0) · régime normal pour ce jeu`
                    : `XC = ${montant(ceProjet.solde)} (≠ 0) · pas nécessairement une erreur, vérifier le compte 13 et les comptes non rattachés ci-dessous`}
                </span>
              </div>

              {ceProjet.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[11.5px] font-bold mb-1.5">
                    Comptes de gestion rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {ceProjet.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-text-dim mt-3">
                Postes conformes au tableau de correspondance officiel SYCEBNL, jeu « projets de développement et
                assimilés » (Journal officiel OHADA, Partie 4 ch. 3) · voir{' '}
                <code>correspondance-projet-compte-exploitation.ts</code>. RC (subventions) et RE (reprises) dans XA :
                deux anomalies du texte officiel corrigées. TJ et TK apparaissent deux fois chacun : doublon du texte
                officiel, reproduit tel quel.
              </p>
            </div>
          )}
        </>
      )}

      {onglet === 'note-bailleur' && (
        <>
          {!noteBailleur && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {noteBailleur && (
            <div className="max-w-[1000px] overflow-x-auto">
              <p className="text-[10.5px] text-text-dim mb-2">
                Un bailleur n'apparaît ici que si des comptes 162-164/462-464 lui sont rattachés · voir la page{' '}
                <a href="#/bailleurs" className="text-sel hover:underline">
                  Bailleurs
                </a>
                .
              </p>

              {(['Fonds d’investissement (162-164)', 'Fonds d’administration (462-464)'] as const).map((titre, idx) => {
                const lignes = idx === 0 ? noteBailleur.investissement : noteBailleur.administration;
                const nonAffecte = idx === 0 ? noteBailleur.investissementNonAffecte : noteBailleur.administrationNonAffecte;
                const total = idx === 0 ? noteBailleur.totalInvestissement : noteBailleur.totalAdministration;
                return (
                  <div key={titre} className="border border-border bg-surface mb-3">
                    <div className="px-4 py-1.5 bg-chrome border-b border-border text-[11px] font-bold">{titre}</div>
                    <div className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                      <span>BAILLEUR</span>
                      <span className="text-right">DÉCAISSÉ</span>
                      <span className="text-right">CONSOMMÉ</span>
                      <span className="text-right">SOLDE RESTANT</span>
                    </div>
                    {lignes.length === 0 && (
                      <div className="px-4 py-3 text-[12px] text-text-dim">Aucun bailleur rattaché à ce type de fonds.</div>
                    )}
                    {lignes.map((l) => (
                      <div key={l.bailleur.id} className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1 text-[12px]">
                        <span>
                          {l.bailleur.code} · {l.bailleur.nom}
                        </span>
                        <span className="font-mono text-right">{montant(l.decaisse)}</span>
                        <span className="font-mono text-right">{montant(l.consomme)}</span>
                        <span className="font-mono text-right">{montant(l.soldeRestant)}</span>
                      </div>
                    ))}
                    {(nonAffecte.decaisse !== 0 || nonAffecte.consomme !== 0 || nonAffecte.soldeRestant !== 0) && (
                      <div className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1 text-[12px] text-danger bg-danger-soft italic">
                        <span>NON AFFECTÉ (comptes sans bailleur rattaché)</span>
                        <span className="font-mono text-right">{montant(nonAffecte.decaisse)}</span>
                        <span className="font-mono text-right">{montant(nonAffecte.consomme)}</span>
                        <span className="font-mono text-right">{montant(nonAffecte.soldeRestant)}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1.5 bg-surface-alt border-t border-border text-[12px] font-bold">
                      <span>TOTAL</span>
                      <span className="font-mono text-right">{montant(total.decaisse)}</span>
                      <span className="font-mono text-right">{montant(total.consomme)}</span>
                      <span className="font-mono text-right">{montant(total.soldeRestant)}</span>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center gap-2 px-3.5 py-2.5 border border-border bg-chrome">
                <span className="font-mono text-[11.5px] font-medium">
                  TOTAL DES FONDS DU BAILLEUR · Décaissé {montant(noteBailleur.totalFondsDuBailleur.decaisse)} · Consommé{' '}
                  {montant(noteBailleur.totalFondsDuBailleur.consomme)} · Solde restant{' '}
                  {montant(noteBailleur.totalFondsDuBailleur.soldeRestant)}
                </span>
              </div>

              <p className="text-[11px] text-text-dim mt-3">
                NOTE 9 · Fonds du bailleur (SYCEBNL, Partie 4 ch. 3, Section 6). Montants <strong>cumulés depuis
                l'origine du projet</strong>, toutes périodes confondues : cette note suit le cycle de vie du projet,
                pas l'exercice comptable. Décaissé = mouvements crédit (hors report à-nouveau) ; Consommé =
                mouvements débit ; Solde restant = Décaissé − Consommé. Le texte officiel ne précise le compte
                source que pour « Consommé » côté Fonds d'administration (compte 702) · convention retenue pour le
                reste détaillée dans <code>EtatsFinanciersProjetService.noteBailleur</code>.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
