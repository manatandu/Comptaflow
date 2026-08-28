import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconExport, IconCheck } from '../components/chrome/icons';
import type { Bilan, CompteDeResultat, LigneBilan, PosteCalcule } from '../lib/types';

type Onglet = 'bilan' | 'compte-de-resultat';

export function EtatsFinanciersPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<Onglet>('bilan');
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [cr, setCr] = useState<CompteDeResultat | null>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  // Drapeau `annule` : une réponse lente ne doit pas écraser un état plus
  // récent après un changement d'exercice.
  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    api.get<Bilan>(`/etats-financiers/bilan?exerciceId=${exerciceCourant.id}`).then(
      (r) => !annule && setBilan(r),
      (e) => !annule && setErreur(e.message),
    );
    api.get<CompteDeResultat>(`/etats-financiers/compte-de-resultat?exerciceId=${exerciceCourant.id}`).then(
      (r) => !annule && setCr(r),
      (e) => !annule && setErreur(e.message),
    );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

  // Bouton du ruban désactivé : useRibbon fige les gestionnaires au montage,
  // il agirait donc toujours sur l'onglet initial. Le bouton fonctionnel est
  // dans l'en-tête de page.
  useRibbon([{ titre: 'IMPRESSION', boutons: [{ label: 'Exporter Excel', Icon: IconExport, disabled: true }] }]);

  const exporter = async () => {
    if (!exerciceCourant) return;
    const chemin = onglet === 'bilan' ? 'bilan' : 'compte-de-resultat';
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(`/exports/etats-financiers/${chemin}?exerciceId=${exerciceCourant.id}`, `${chemin}.xlsx`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  const montant = (v: number | undefined) =>
    v === undefined ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // --- Compte de résultat : REF | Libellé | Montant (N) | Montant (N-1) ---
  const lignePoste = (p: PosteCalcule) => (
    <div
      key={p.ref}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : 'Aucun compte mouvementé'}
      className={`grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1 text-[12px] ${p.montant === 0 ? 'text-text-dim' : ''}`}
    >
      <span className="font-mono text-[11px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
      <span className="font-mono text-right text-text-dim">{montant(p.montantN1)}</span>
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

  // --- Bilan passif : REF | Libellé | Net (N) | Net (N-1) — pas de colonne Brut/Amort côté passif (le texte officiel n'en prévoit pas) ---
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
        <h1 className="text-[15px] font-bold">États financiers</h1>
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

      <div className="flex bg-chrome border border-border border-b-0">
        <button
          onClick={() => setOnglet('bilan')}
          className={`px-4 py-1.5 text-[11px] font-bold ${onglet === 'bilan' ? 'bg-surface border-r border-border' : 'text-text-dim'}`}
        >
          BILAN
        </button>
        <button
          onClick={() => setOnglet('compte-de-resultat')}
          className={`px-4 py-1.5 text-[11px] font-bold ${
            onglet === 'compte-de-resultat' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
          }`}
        >
          COMPTE DE RÉSULTAT
        </button>
      </div>

      {onglet === 'bilan' && (
        <>
          {!bilan && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {bilan && (
            <div className="max-w-[1180px] overflow-x-auto">
              {!bilan.exerciceN1Disponible && (
                <p className="text-[10.5px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier — la colonne N-1 affiche « — », pas un faux zéro.
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
                    ? `LE BILAN EST ÉQUILIBRÉ — ACTIF = PASSIF = ${montant(bilan.totalActif)}`
                    : 'DÉSÉQUILIBRE DÉTECTÉ — vérifier les écritures et les comptes non rattachés ci-dessous'}
                </span>
              </div>

              {bilan.controle.doubleComptageProbable && (
                <div className="flex items-start gap-2 mt-2 px-3.5 py-2.5 border border-warning/40 bg-warning-soft">
                  <span className="text-[11.5px]">
                    ⚠ Les classes 6/7/8 ({montant(bilan.controle.resultatClasses678)}) ET le compte 13 (
                    {montant(bilan.controle.resultatCompte13)}) sont tous deux mouvementés — risque de double comptage
                    du résultat. Fournir une balance avant OU après clôture, pas un état intermédiaire.
                  </span>
                </div>
              )}

              {bilan.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[11.5px] font-bold mb-1.5">
                    Comptes de bilan rattachés à aucun poste officiel — leur montant n'entre dans aucun total
                  </div>
                  {bilan.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                      <span>
                        {c.numero} — {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-text-dim mt-3">
                Postes et rattachements conformes au tableau de correspondance officiel SYCEBNL (Journal officiel
                OHADA, Partie 4 ch. 2) — 3 colonnes Brut/Amort./Net côté actif et comparatif N-1 des deux côtés,
                comme l'exige le texte officiel. Comme au compte de résultat, les anomalies du texte officiel sont
                corrigées explicitement (comptes de tiers polyvalents 42-47 distingués par le sens du solde,
                provisions réglementées en poste 15) plutôt que devinées — voir <code>correspondance-bilan.ts</code>.
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
                  Aucun exercice antérieur dans ce dossier — la colonne N-1 affiche « — », pas un faux zéro.
                </p>
              )}

              <div className="border border-border bg-surface">
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">MONTANT (N)</span>
                  <span className="text-right">MONTANT (N-1)</span>
                </div>
                {cr.produits.map(lignePoste)}
                {ligneTotal('XA', 'REVENUS DES ACTIVITÉS ORDINAIRES', cr.totalProduits, cr.totalProduitsN1)}
                {cr.charges.map(lignePoste)}
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
                    ? "L'ÉTAT BOUCLE — le résultat des postes est identique au résultat logé au bilan"
                    : `ÉCART DE ${montant(cr.controle.ecart)} — l'état ne boucle pas avec le bilan`}
                </span>
              </div>

              {cr.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[11.5px] font-bold mb-1.5">
                    Comptes de gestion rattachés à aucun poste officiel — leur montant n'entre dans aucun total
                  </div>
                  {cr.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[11.5px] font-mono">
                      <span>
                        {c.numero} — {c.intitule}
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
    </div>
  );
}
