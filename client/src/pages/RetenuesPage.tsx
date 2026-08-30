import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { EcheancierFiscal, RegistreRetenues } from '../lib/types';

/**
 * REGISTRE DES RETENUES À LA SOURCE et ÉCHÉANCIER FISCAL ET SOCIAL.
 *
 * Une ASBL régulièrement constituée est exemptée d'impôt sur les sociétés,
 * mais d'aucun impôt qu'elle retient pour le compte d'autrui, ni d'aucune
 * cotisation sociale, ni de l'obligation de déclarer. C'est là qu'elle se met
 * en défaut, précisément parce qu'elle croit que « ne rien payer » vaut
 * « ne rien devoir ».
 *
 * L'écran ne calcule aucun impôt. Il recense ce que la comptabilité porte,
 * en regard de l'échéance légale, avec la base citée et la date à laquelle
 * elle a été vérifiée.
 */
type Onglet = 'echeancier' | 'registre';

/**
 * Rythme de l'obligation · le registre ne connaissait que le mensuel, alors
 * que les obligations créées par la loi de finances n° 25/060 sont
 * trimestrielles et annuelles. Afficher le rythme évite de lire une échéance
 * annuelle comme si elle revenait chaque mois.
 */
const RYTHME: Record<'MENSUELLE' | 'TRIMESTRIELLE' | 'ANNUELLE', string> = {
  MENSUELLE: 'Mensuel',
  TRIMESTRIELLE: 'Trimestriel',
  ANNUELLE: 'Annuel',
};

export function RetenuesPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<Onglet>('echeancier');
  const [dateReference, setDateReference] = useState(() => new Date().toISOString().slice(0, 10));
  const [registre, setRegistre] = useState<RegistreRetenues | null>(null);
  const [echeancier, setEcheancier] = useState<EcheancierFiscal | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [natureOuverte, setNatureOuverte] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    const q = `?exerciceId=${exerciceCourant.id}&dateReference=${dateReference}`;
    const echec = (e: Error) => !annule && setErreur(e.message);
    api.get<RegistreRetenues>(`/retenues/registre${q}`).then((r) => !annule && setRegistre(r), echec);
    api.get<EcheancierFiscal>(`/retenues/echeancier${q}`).then((r) => !annule && setEcheancier(r), echec);
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, dateReference]);

  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const jour = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  const moisLong = (m: string) => {
    const [a, mo] = m.split('-').map(Number);
    return new Date(a, mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="p-2">
      <EnteteImpression titre="Retenues à la source et échéancier fiscal" />
      <div className="ecran-seul flex items-end justify-between mb-1.5 gap-3 flex-wrap max-w-[1100px]">
        <div>
          <div className="text-[9.5px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[13px] font-bold leading-tight">Retenues à la source et échéancier fiscal</h1>
          <div className="text-[10.5px] text-text-dim mt-0.5">
            Ce que vous retenez pour le compte de l'État et des organismes sociaux, et quand il faut le reverser.
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-dim">DATE DE RÉFÉRENCE</span>
          <input
            type="date"
            value={dateReference}
            onChange={(e) => setDateReference(e.target.value)}
            className="border border-border-dark bg-surface px-2 py-1 text-[12px] font-mono"
          />
        </label>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[11.5px] max-w-[1000px]">{erreur}</div>
      )}

      <div className="ecran-seul flex bg-chrome border border-border border-b-0 max-w-[1100px]">
        {(
          [
            ['echeancier', 'ÉCHÉANCIER'],
            ['registre', 'REGISTRE DÉTAILLÉ'],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            onClick={() => setOnglet(cle)}
            className={`px-4 py-1.5 text-[11px] font-bold ${onglet === cle ? 'bg-surface border-x border-border' : 'text-text-dim'}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === 'echeancier' && echeancier && (
        <div className="max-w-[1100px]">
          <div className="border border-border bg-surface mb-3">
            <div className="grid grid-cols-[100px_86px_1fr_130px_150px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
              <span>PROCHAINE</span>
              <span>RYTHME</span>
              <span>NATURE</span>
              <span>BÉNÉFICIAIRE</span>
              <span className="text-right">RESTE À REVERSER</span>
              <span className="text-right">MOIS EN RETARD</span>
            </div>
            {echeancier.echeances.map((e) => (
              <div
                key={e.cle}
                title={e.echeance}
                className={`grid grid-cols-[100px_86px_1fr_130px_150px_110px] gap-2 px-4 py-1.5 items-start border-b border-border/50 last:border-b-0 text-[12px] ${
                  e.moisEnRetard > 0 ? 'bg-danger-soft' : ''
                }`}
              >
                <span className="font-mono text-[11px]">{jour(e.date)}</span>
                <span className="text-[10px] text-text-dim uppercase tracking-[0.04em] pt-[1px]">
                  {RYTHME[e.periodicite]}
                </span>
                <span>
                  {e.libelle}
                  <span className="block text-[10px] text-text-dim leading-[1.5]">{e.baseLegale}</span>
                  {/*
                    Une DÉCLARATION ne porte aucun montant : sans son contenu,
                    la ligne ne dirait pas ce qu'il y a à produire, et une
                    échéance dont on ignore l'objet ne sert à rien.
                  */}
                  {e.contenu && (
                    <span className="block text-[10.5px] leading-[1.5] mt-0.5">{e.contenu}</span>
                  )}
                  {e.sanction && (
                    <span className="block text-[10px] text-danger leading-[1.5] mt-0.5">{e.sanction}</span>
                  )}
                  {e.sourceDonnees && (
                    <span className="block text-[10px] text-text-dim italic leading-[1.5] mt-0.5">
                      Où trouver la matière : {e.sourceDonnees}
                    </span>
                  )}
                  {e.reserve && <span className="block text-[10px] text-warning leading-[1.5] mt-0.5">{e.reserve}</span>}
                </span>
                <span className="text-[10.5px] text-text-dim">
                  {e.beneficiaire === 'ETAT' ? 'État (DGI)' : 'Organisme social'}
                </span>
                <span className={`font-mono text-right ${e.montantDu > 0.005 ? 'font-semibold' : 'text-text-dim'}`}>
                  {e.genre === 'DECLARATION' ? (
                    <span className="text-[10.5px] text-text-dim not-italic">Déclaration</span>
                  ) : (
                    montant(e.montantDu)
                  )}
                </span>
                <span className={`font-mono text-right ${e.moisEnRetard > 0 ? 'text-danger font-bold' : 'text-text-dim'}`}>
                  {e.moisEnRetard > 0 ? e.moisEnRetard : '·'}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[100px_86px_1fr_130px_150px_110px] gap-2 px-4 py-1.5 bg-surface-alt border-t border-border text-[12px] font-bold">
              <span />
              <span />
              <span>TOTAL RESTANT À REVERSER</span>
              <span />
              <span className="font-mono text-right">{montant(echeancier.totalDu)}</span>
              <span />
            </div>
          </div>

          {echeancier.avertissements.map((a) => (
            <p key={a} className="text-[10.5px] text-text-dim mb-1.5 max-w-[900px]">
              {a}
            </p>
          ))}
          <p className="text-[10.5px] text-text-dim">
            Échéances confrontées aux textes le {jour(echeancier.derniereVerificationEcheances)}. Elles changent : la
            loi de finances n° 25/060 du 29 décembre 2025 a par exemple déplacé les acomptes provisionnels du 1er août
            au 25 juillet. Vérifiez avant de vous y fier.
          </p>
        </div>
      )}

      {onglet === 'registre' && registre && (
        <div className="max-w-[1100px]">
          <div className="border border-border bg-surface mb-3">
            <div className="grid grid-cols-[1fr_140px_140px_140px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
              <span>NATURE</span>
              <span className="text-right">RETENU</span>
              <span className="text-right">REVERSÉ</span>
              <span className="text-right">RESTE DÛ</span>
            </div>
            {registre.natures.map((n) => (
              <div key={n.cle}>
                <button
                  type="button"
                  onClick={() => setNatureOuverte(natureOuverte === n.cle ? null : n.cle)}
                  disabled={n.mois.length === 0}
                  className={`w-full text-left grid grid-cols-[1fr_140px_140px_140px] gap-2 px-4 py-1.5 text-[12px] border-b border-border/50 ${
                    n.mois.length === 0 ? 'text-text-dim cursor-default' : 'hover:bg-sel-soft'
                  } ${natureOuverte === n.cle ? 'bg-sel-soft' : ''}`}
                >
                  <span>
                    {n.libelle}
                    {n.mois.length > 0 && <span className="ml-1.5 text-[10px] text-text-dim">détail par mois</span>}
                    {n.moisEnRetard > 0 && (
                      <span className="ml-1.5 text-[10px] text-danger font-bold">{n.moisEnRetard} mois en retard</span>
                    )}
                  </span>
                  <span className="font-mono text-right">{n.retenu ? montant(n.retenu) : ''}</span>
                  <span className="font-mono text-right">{n.reverse ? montant(n.reverse) : ''}</span>
                  <span className={`font-mono text-right ${n.solde > 0.005 ? 'font-semibold' : ''}`}>
                    {n.solde ? montant(n.solde) : ''}
                  </span>
                </button>

                {natureOuverte === n.cle && (
                  <div className="bg-chrome-alt border-b border-border">
                    <div className="grid grid-cols-[150px_120px_130px_130px_130px] gap-2 px-6 py-1 text-[10px] font-bold text-text-dim">
                      <span>MOIS DE LA RETENUE</span>
                      <span>À REVERSER LE</span>
                      <span className="text-right">RETENU</span>
                      <span className="text-right">REVERSÉ</span>
                      <span className="text-right">RESTE DÛ</span>
                    </div>
                    {n.mois.map((m) => (
                      <div
                        key={m.mois}
                        className={`grid grid-cols-[150px_120px_130px_130px_130px] gap-2 px-6 py-[3px] text-[11.5px] ${
                          m.enRetard ? 'text-danger font-semibold' : ''
                        }`}
                      >
                        <span>{moisLong(m.mois)}</span>
                        <span className="font-mono text-[10.5px]">{jour(m.echeance)}</span>
                        <span className="font-mono text-right">{montant(m.retenu)}</span>
                        <span className="font-mono text-right">{montant(m.reverse)}</span>
                        <span className="font-mono text-right">{montant(m.solde)}</span>
                      </div>
                    ))}
                    <div className="px-6 py-1.5 text-[10px] text-text-dim">
                      Comptes : {n.comptes.map((c) => `${c.numero} ${c.intitule}`).join(' · ') || 'aucun mouvementé'}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="grid grid-cols-[1fr_140px_140px_140px] gap-2 px-4 py-1.5 bg-surface-alt border-t border-border text-[12px] font-bold">
              <span>TOTAL</span>
              <span className="font-mono text-right">{montant(registre.totalRetenu)}</span>
              <span className="font-mono text-right">{montant(registre.totalReverse)}</span>
              <span className="font-mono text-right">{montant(registre.totalDu)}</span>
            </div>
          </div>

          {registre.comptesNonRattaches.length > 0 && (
            <div className="border border-warning/40 bg-warning-soft px-3.5 py-2.5 mb-2.5">
              <div className="text-[11.5px] font-bold mb-1">
                Comptes 43 et 44 mouvementés qu'aucune nature de retenue ne réclame
              </div>
              <p className="text-[10.5px] mb-1.5">
                Leur montant n'entre dans aucun total de cet état. Ce sont souvent des impôts dont l'entité est
                elle-même redevable (compte 442), qui ne sont pas des retenues à la source · vérifiez qu'ils sont bien
                à leur place.
              </p>
              {registre.comptesNonRattaches.map((c) => (
                <div key={c.numero} className="text-[11px] font-mono">
                  {c.numero} · {c.intitule}
                </div>
              ))}
            </div>
          )}

          {registre.avertissements.map((a) => (
            <p key={a} className="text-[10.5px] text-text-dim mb-1.5 max-w-[900px]">
              {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
