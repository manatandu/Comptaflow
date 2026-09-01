import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { Echeancier } from '../lib/types';

/**
 * ÉCHÉANCIER DE TRÉSORERIE.
 *
 * La balance âgée dit ce qui aurait dû être réglé ; l'échéancier dit ce qui
 * va devoir l'être, et si la caisse suivra. C'est la question que se pose
 * chaque mois le trésorier d'une association qui vit sur des tranches de
 * subvention, et elle n'avait pas d'écran.
 *
 * L'assiette couvre les classes 40 à 44, pas seulement les fournisseurs et
 * les clients : une ASBL congolaise doit aussi à son personnel (42), aux
 * organismes sociaux (43) et à l'État (44), avec des dates de reversement
 * strictes. C'est précisément là qu'elle se met en défaut.
 */
export function EcheancierPage() {
  const { exerciceCourant } = useExercice();
  const [dateReference, setDateReference] = useState(() => new Date().toISOString().slice(0, 10));
  const [etat, setEtat] = useState<Echeancier | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [trancheOuverte, setTrancheOuverte] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    api
      .get<Echeancier>(`/ecritures/echeancier?exerciceId=${exerciceCourant.id}&dateReference=${dateReference}`)
      .then(
        (r) => !annule && setEtat(r),
        (e) => !annule && setErreur(e.message),
      );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, dateReference]);

  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const jour = (d: string) => new Date(d).toLocaleDateString('fr-FR');

  return (
    <div className="p-2">
      <EnteteImpression titre="Échéancier de trésorerie" />
      <div className="ecran-seul flex items-end justify-between mb-1.5 gap-3 flex-wrap max-w-[1100px]">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight">Échéancier de trésorerie</h1>
          <div className="text-[10px] text-text-dim mt-0.5">
            Ce qui vient à échéance et ce qu'il restera en caisse · distinct de la balance âgée, qui recense le retard.
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-dim">DATE DE RÉFÉRENCE</span>
          <input
            type="date"
            value={dateReference}
            onChange={(e) => setDateReference(e.target.value)}
            className="border border-border-dark bg-surface px-2 py-1 text-[11px] font-mono"
          />
        </label>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[900px]">{erreur}</div>
      )}
      {!etat && !erreur && <div className="text-[11px] text-text-dim">Chargement…</div>}

      {etat && (
        <div className="max-w-[1100px]">
          <div className="flex items-center gap-2 mb-2.5 border border-border bg-surface px-3.5 py-2">
            <span className="text-[10.5px] text-text-dim">Trésorerie disponible à la date de référence</span>
            <span className="font-mono text-[13px] font-bold">{montant(etat.tresorerieActuelle)}</span>
          </div>

          {etat.alerte && (
            <div className="border border-danger/40 bg-danger-soft px-3.5 py-2.5 mb-2.5 text-[10.5px]">
              {etat.alerte.message}
            </div>
          )}

          <div className="border border-border bg-surface mb-3">
            <div className="grid grid-cols-[1fr_130px_130px_130px_150px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
              <span>TRANCHE</span>
              <span className="text-right">ENCAISSEMENTS</span>
              <span className="text-right">DÉCAISSEMENTS</span>
              <span className="text-right">NET</span>
              <span className="text-right">TRÉSORERIE PROJETÉE</span>
            </div>
            {etat.tranches.map((t) => {
              const vide = t.encaissements === 0 && t.decaissements === 0;
              return (
                <div key={t.cle}>
                  <button
                    type="button"
                    onClick={() => setTrancheOuverte(trancheOuverte === t.cle ? null : t.cle)}
                    disabled={vide}
                    className={`w-full text-left grid grid-cols-[1fr_130px_130px_130px_150px] gap-2 px-4 py-1.5 text-[11px] border-b border-border/50 ${
                      vide ? 'text-text-dim cursor-default' : 'hover:bg-sel-soft'
                    } ${trancheOuverte === t.cle ? 'bg-sel-soft' : ''}`}
                  >
                    <span className={t.cle === 'echu' && !vide ? 'font-semibold text-danger' : ''}>
                      {t.libelle}
                      {!vide && <span className="ml-1.5 text-[10px] text-text-dim">détail</span>}
                    </span>
                    <span className="font-mono text-right">{t.encaissements ? montant(t.encaissements) : ''}</span>
                    <span className="font-mono text-right">{t.decaissements ? montant(t.decaissements) : ''}</span>
                    <span className={`font-mono text-right ${t.net < 0 ? 'text-danger' : ''}`}>
                      {t.net ? montant(t.net) : ''}
                    </span>
                    <span
                      className={`font-mono text-right font-semibold ${t.tresorerieProjetee < 0 ? 'text-danger' : ''}`}
                    >
                      {montant(t.tresorerieProjetee)}
                    </span>
                  </button>

                  {trancheOuverte === t.cle && (
                    <div className="bg-chrome-alt border-b border-border">
                      <div className="grid grid-cols-[80px_1fr_120px_120px_130px] gap-2 px-6 py-1 text-[10px] font-bold text-text-dim">
                        <span>ÉCHÉANCE</span>
                        <span>TIERS ET LIBELLÉ</span>
                        <span>COMPTE</span>
                        <span>PIÈCE</span>
                        <span className="text-right">MONTANT</span>
                      </div>
                      {etat.details
                        .filter((d) => d.tranche === t.cle)
                        .map((d) => (
                          <div
                            key={d.ligneId}
                            className="grid grid-cols-[80px_1fr_120px_120px_130px] gap-2 px-6 py-[3px] text-[10.5px]"
                          >
                            <span className="font-mono text-[10px]">{jour(d.date)}</span>
                            <span className="truncate">
                              {d.tiers && <span className="font-semibold">{d.tiers} · </span>}
                              {d.libelle}
                            </span>
                            <span className="font-mono text-[10px] text-text-dim">{d.compteNumero}</span>
                            <span className="font-mono text-[10px] text-text-dim">{d.reference ?? ''}</span>
                            <span
                              className={`font-mono text-right ${d.sens === 'DECAISSEMENT' ? 'text-danger' : 'text-positive'}`}
                            >
                              {d.sens === 'DECAISSEMENT' ? '-' : '+'}
                              {montant(d.montant)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {etat.details.length === 0 && (
            <p className="text-[10.5px] text-text-dim">
              Aucune échéance en cours : tous les comptes de tiers sont soldés ou lettrés.
            </p>
          )}
          {etat.lignesSansEcheance > 0 && (
            <p className="text-[10px] text-text-dim">
              {etat.lignesSansEcheance} ligne(s) sans date d'échéance saisie : la date de l'écriture leur tient lieu
              d'échéance. Renseignez l'échéance en saisie pour que la projection soit fidèle.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
