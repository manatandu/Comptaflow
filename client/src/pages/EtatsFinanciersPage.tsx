import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconExport, IconCheck } from '../components/chrome/icons';
import type { Bilan, CompteDeResultat, PosteCalcule } from '../lib/types';

type Onglet = 'bilan' | 'compte-de-resultat';

export function EtatsFinanciersPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<Onglet>('bilan');
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [cr, setCr] = useState<CompteDeResultat | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    api.get<Bilan>(`/etats-financiers/bilan?exerciceId=${exerciceCourant.id}`).then(setBilan);
    api
      .get<CompteDeResultat>(`/etats-financiers/compte-de-resultat?exerciceId=${exerciceCourant.id}`)
      .then(setCr);
  }, [exerciceCourant?.id]);

  useRibbon([{ titre: 'IMPRESSION', boutons: [{ label: 'Exporter Excel', Icon: IconExport }] }]);

  const exporter = () => {
    if (!exerciceCourant) return;
    const chemin = onglet === 'bilan' ? 'bilan' : 'compte-de-resultat';
    api.telecharger(
      `/exports/etats-financiers/${chemin}?exerciceId=${exerciceCourant.id}`,
      `${chemin}.xlsx`,
    );
  };

  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lignePoste = (p: PosteCalcule) => (
    <div
      key={p.ref}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : 'Aucun compte mouvementé'}
      className={`grid grid-cols-[46px_1fr_130px] gap-2 px-4 py-1 text-[12px] ${
        p.montant === 0 ? 'text-text-dim' : ''
      }`}
    >
      <span className="font-mono text-[11px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
    </div>
  );

  const ligneTotal = (ref: string, libelle: string, valeur: number) => (
    <div className="grid grid-cols-[46px_1fr_130px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[12px] font-bold">
      <span className="font-mono text-[11px]">{ref}</span>
      <span>{libelle}</span>
      <span className="font-mono text-right">{montant(valeur)}</span>
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
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt"
          >
            <IconExport width={13} height={13} />
            Exporter Excel
          </button>
        </div>
      </div>

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
            <>
              <div className="grid grid-cols-2 gap-px bg-border border border-border max-w-[1180px]">
                <div className="bg-surface">
                  <div className="px-4 py-2 bg-surface-alt border-b border-border text-[11.5px] font-bold">ACTIF</div>
                  {bilan.actif.map((l) => (
                    <div key={l.numero} className="flex justify-between px-4 py-1 text-[12px]">
                      <span>{l.intitule}</span>
                      <span className="font-mono">{montant(l.montant)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-4 py-2 bg-surface-alt border-t border-border-dark text-[12.5px] font-bold mt-2">
                    <span>TOTAL ACTIF</span>
                    <span className="font-mono">{montant(bilan.totalActif)}</span>
                  </div>
                </div>
                <div className="bg-surface">
                  <div className="px-4 py-2 bg-surface-alt border-b border-border text-[11.5px] font-bold">PASSIF</div>
                  {bilan.passif.map((l) => (
                    <div key={l.numero} className="flex justify-between px-4 py-1 text-[12px]">
                      <span>{l.intitule}</span>
                      <span className="font-mono">{montant(l.montant)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-4 py-2 bg-surface-alt border-t border-border-dark text-[12.5px] font-bold mt-2">
                    <span>TOTAL PASSIF</span>
                    <span className="font-mono">{montant(bilan.totalPassif)}</span>
                  </div>
                </div>
              </div>

              <div
                className={`flex items-center gap-2 mt-3 px-3.5 py-2.5 border max-w-[1180px] ${
                  bilan.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck width={14} height={14} className={bilan.equilibre ? 'text-positive' : 'text-danger'} />
                <span className="font-mono text-[11.5px] font-medium">
                  {bilan.equilibre ? 'LE BILAN EST ÉQUILIBRÉ — ACTIF = PASSIF' : 'DÉSÉQUILIBRE DÉTECTÉ — vérifier les écritures'}
                </span>
              </div>

              <p className="text-[11px] text-text-dim mt-3 max-w-[1180px]">
                ⚠ Bilan : regroupement simplifié classe → poste (MVP) — voir le commentaire de{' '}
                <code>etats-financiers.service.ts</code> côté API avant toute utilisation en production. Le compte de
                résultat, lui, suit le tableau de correspondance officiel SYCEBNL.
              </p>
            </>
          )}
        </>
      )}

      {onglet === 'compte-de-resultat' && (
        <>
          {!cr && <div className="border border-border px-4 py-4 text-[12px] text-text-dim">Chargement…</div>}
          {cr && (
            <>
              <div className="border border-border bg-surface max-w-[860px]">
                <div className="grid grid-cols-[46px_1fr_130px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">MONTANT</span>
                </div>
                {cr.produits.map(lignePoste)}
                {ligneTotal('XA', 'REVENUS DES ACTIVITÉS ORDINAIRES', cr.totalProduits)}
                {cr.charges.map(lignePoste)}
                {ligneTotal('XB', 'CHARGES DES ACTIVITÉS ORDINAIRES', cr.totalCharges)}
                {ligneTotal('XC', 'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XA − XB)', cr.resultatActivitesOrdinaires)}
                {lignePoste(cr.produitsHao)}
                {lignePoste(cr.chargesHao)}
                {ligneTotal('XD', 'RÉSULTAT H.A.O. (TM − TN)', cr.resultatHao)}
                <div className="grid grid-cols-[46px_1fr_130px] gap-2 px-4 py-2 bg-chrome border-t border-border-dark text-[12.5px] font-bold">
                  <span className="font-mono text-[11px]">XE</span>
                  <span>RÉSULTAT NET DE L'EXERCICE (+excédent, −déficit)</span>
                  <span className="font-mono text-right">{montant(cr.resultatNet)}</span>
                </div>
              </div>

              <div
                className={`flex items-start gap-2 mt-3 px-3.5 py-2.5 border max-w-[860px] ${
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
                <div className="border border-danger/30 bg-danger-soft mt-2 max-w-[860px] px-3.5 py-2.5">
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

              <p className="text-[11px] text-text-dim mt-3 max-w-[860px]">
                Postes et rattachements conformes au tableau de correspondance officiel SYCEBNL (Journal officiel OHADA,
                Partie 4 ch. 2). Charges présentées en positif, de sorte que XC = XA − XB. XA inclut RH : le libellé
                officiel dit « Somme RA à RG », ce qui romprait l'égalité entre le résultat et le bilan dès qu'il y a
                des reprises.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
