import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconNew } from '../components/chrome/icons';
import type { Ecriture, LigneBalance } from '../lib/types';

/**
 * TABLEAU DE BORD · l'esprit « Édition pilotée » de Sage : quelques
 * indicateurs sûrs calculés depuis la BALANCE de l'exercice (jamais des
 * chiffres parallèles : la balance est la seule source), et les dernières
 * écritures. Indicateurs :
 *  - trésorerie disponible = soldes des comptes Détail de la classe 5,
 *    hors 59 (dépréciations, sans impact trésorerie) ;
 *  - produits (classe 7, soldes créditeurs) et charges (classe 6) des
 *    activités ordinaires ;
 *  - résultat provisoire = −(soldes des classes 6+7+8 Détail) : produits
 *    moins charges, H.A.O. compris · « provisoire » car avant écritures
 *    d'inventaire et de clôture.
 */
export function DashboardPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const [ecritures, setEcritures] = useState<Ecriture[] | null>(null);
  const [balance, setBalance] = useState<LigneBalance[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    // limite=8 : le serveur renvoie les 8 plus récentes, au lieu de faire
    // télécharger (puis jeter) l'exercice entier · premier poste de lenteur
    // du tableau de bord relevé à l'audit.
    api.get<{ ecritures: Ecriture[] }>(`/ecritures?exerciceId=${exerciceCourant.id}&limite=8`).then((r) => {
      if (!annule) setEcritures(r.ecritures);
    });
    api.get<{ lignes: LigneBalance[] }>(`/ecritures/balance?exerciceId=${exerciceCourant.id}`).then((r) => {
      if (!annule) setBalance(r.lignes);
    });
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

  // Une seule passe sur la balance, mémoïsée : les quatre agrégats se
  // recalculaient à chaque rendu, chacun refiltrant toute la liste.
  const { tresorerie, produits, charges, resultat } = useMemo(() => {
    let tres = 0;
    let prod = 0;
    let chg = 0;
    let res = 0;
    for (const l of balance ?? []) {
      if (l.typeCompte === 'TOTAL') continue;
      const c = l.numero[0];
      if (c === '5' && !l.numero.startsWith('59')) tres += l.solde;
      if (c === '7') prod -= l.solde;
      if (c === '6') chg += l.solde;
      if (c === '6' || c === '7' || c === '8') res -= l.solde;
    }
    return { tresorerie: tres, produits: prod, charges: chg, resultat: res };
  }, [balance]);

  const indicateurs: Array<{ label: string; valeur: number; note: string; teinte?: 'auto' }> = [
    { label: 'TRÉSORERIE DISPONIBLE', valeur: tresorerie, note: 'classe 5, hors dépréciations (59)' },
    { label: 'PRODUITS', valeur: produits, note: 'classe 7 · activités ordinaires' },
    { label: 'CHARGES', valeur: charges, note: 'classe 6 · activités ordinaires' },
    { label: 'RÉSULTAT PROVISOIRE', valeur: resultat, note: 'produits − charges, H.A.O. compris', teinte: 'auto' },
  ];

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">FENÊTRE</div>
          <h1 className="text-[12px] font-bold leading-tight">
            Tableau de bord{exerciceCourant && ` · Exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}`}
          </h1>
        </div>
        <button
          onClick={() => navigate('/saisie')}
          className="flex items-center gap-2 px-4 py-1.5 bg-sel text-white text-[11px] font-semibold"
        >
          <IconNew width={15} height={15} />
          Saisie des journaux
        </button>
      </div>

      {/* Indicateurs · calculés depuis la balance, seule source de vérité. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-2.5">
        {indicateurs.map((ind) => {
          const teinte =
            ind.teinte === 'auto' ? (ind.valeur >= 0 ? 'text-positive' : 'text-danger') : 'text-text';
          return (
            <div key={ind.label} className="bg-surface border border-border shadow-posee px-3.5 py-2.5">
              <div className="text-[10px] font-bold text-text-dim tracking-wide">{ind.label}</div>
              <div className={`font-mono text-[17px] font-bold leading-tight mt-0.5 ${teinte}`}>
                {balance ? ind.valeur.toLocaleString('fr-FR') : '…'}
                <span className="text-[10px] font-normal text-text-dim ml-1">CDF</span>
              </div>
              <div className="text-[10px] text-text-dim mt-0.5">{ind.note}</div>
            </div>
          );
        })}
      </div>

      <div
        // `overflow-x-auto` ici, `min-w` sur les lignes · les 382 px de colonnes
        // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
        // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
        // qui emportait alors titre, onglets et boutons hors de l'écran.
        className="bg-surface border border-border shadow-posee overflow-x-auto"
      >
        <div className="px-3.5 py-1.5 bg-surface-alt border-b border-border-dark flex items-center justify-between">
          <span className="text-[10px] font-bold text-text-dim">DERNIÈRES ÉCRITURES</span>
          <a href="#/journal" className="text-[10px] text-sel hover:underline">
            Ouvrir le journal
          </a>
        </div>
        {!ecritures && <div className="p-3 text-[11px] text-text-dim">Chargement…</div>}
        {ecritures?.length === 0 && (
          <div className="p-3 text-[11px] text-text-dim">
            Aucune écriture sur cet exercice · commencez par la saisie des journaux.
          </div>
        )}
        {ecritures?.map((e) => {
          const totalDebit = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
          return (
            <div
              key={e.id}
              className="grid grid-cols-[76px_52px_56px_1fr_130px] min-w-[540px] gap-2.5 items-center px-3.5 py-[4px] border-b border-border/50 last:border-b-0 text-[10.5px]"
            >
              <span className="font-mono text-[10px] text-text-dim">
                {new Date(e.date).toLocaleDateString('fr-FR')}
              </span>
              <span className="font-mono text-text-dim">{e.journal?.code ?? ''}</span>
              <span className="font-mono text-[10px] text-text-dim text-right">{e.numeroPiece ?? '·'}</span>
              <span className="truncate">{e.libelle}</span>
              <span className="font-mono font-semibold text-right">{totalDebit.toLocaleString('fr-FR')}</span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-text-dim mt-2 max-w-[860px]">
        Indicateurs calculés en direct depuis la balance de l'exercice · aucune donnée parallèle. Le résultat
        est provisoire tant que les écritures d'inventaire et de clôture ne sont pas passées ; les états
        financiers {utilisateur?.tenant.referentiel === 'SYSCOHADA' ? 'SYSCOHADA' : 'SYCEBNL'} restent la
        référence (menu État).
      </p>
    </div>
  );
}
