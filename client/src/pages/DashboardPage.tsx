import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconNew } from '../components/chrome/icons';
import type { EcheancierFiscal, Ecriture, LigneBalance } from '../lib/types';
import { echeancesAVenir } from '../lib/echeances-a-venir';

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
  const [echeancier, setEcheancier] = useState<EcheancierFiscal | null>(null);
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
    // L'ÉCHÉANCIER VIENT DU SERVEUR, DATE DE RÉFÉRENCE COMPRISE · les dates
    // sont calculées là-bas, et deux postes mal réglés afficheraient sinon
    // deux calendriers différents pour le même dossier. L'échec est absorbé :
    // le panneau disparaît, le reste du tableau de bord ne dépend pas de lui.
    api
      .get<EcheancierFiscal>(`/retenues/echeancier?exerciceId=${exerciceCourant.id}`)
      .then((r) => {
        if (!annule) setEcheancier(r);
      })
      .catch(() => {
        if (!annule) setEcheancier(null);
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

  const aVenir = useMemo(() => (echeancier ? echeancesAVenir(echeancier) : null), [echeancier]);

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

      {/*
        PROCHAINES ÉCHÉANCES · l'échéancier existait, complet et sourcé, mais
        seulement dans la fenêtre Retenues, c'est-à-dire là où l'on va quand on
        y pense déjà. Une échéance qu'il faut aller chercher n'avertit personne.

        CE PANNEAU NE DIT JAMAIS « VOUS ÊTES À JOUR ». Une liste vide veut dire
        « rien dans les trente jours », pas « tout est déposé et payé » · le
        logiciel n'a aucun moyen de savoir si une déclaration a été déposée, et
        l'affirmer serait exactement ce qu'un cabinet croirait.
      */}
      {aVenir && (
        <div className="bg-surface border border-border shadow-posee mb-2.5 overflow-x-auto">
          <div className="px-3.5 py-1.5 bg-surface-alt border-b border-border-dark flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-dim">
              PROCHAINES ÉCHÉANCES · {aVenir.horizonJours} JOURS
            </span>
            <a href="#/retenues" className="text-[10px] text-sel hover:underline">
              Ouvrir l'échéancier
            </a>
          </div>
          {aVenir.proches.length === 0 ? (
            <div className="p-3 text-[10.5px] text-text-dim">
              Aucune échéance dans les {aVenir.horizonJours} prochains jours. Cela ne veut pas dire que les
              déclarations antérieures ont été déposées · OmegaX ne détient pas cette information.
            </div>
          ) : (
            aVenir.proches.map((e) => (
              <div
                key={e.cle}
                className="grid grid-cols-[78px_1fr_92px_120px] min-w-[520px] gap-2.5 items-center px-3.5 py-[4px] border-b border-border/50 last:border-b-0 text-[10.5px]"
              >
                <span className="font-mono text-[10px] text-text-dim">
                  {new Date(e.date).toLocaleDateString('fr-FR')}
                </span>
                <span className="truncate" title={e.baseLegale}>
                  {e.libelle}
                  <span className="ml-1.5 text-[10px] text-text-dim">
                    {e.genre === 'DECLARATION' ? 'déclaration' : 'reversement'}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-right">
                  {/* LE RETARD N'EST MONTRÉ QUE S'IL EST CONSTATÉ DANS LES
                      LIVRES · une somme retenue et non versée. Une déclaration
                      n'a pas de retard visible d'ici : le serveur ne rend que
                      sa prochaine occurrence, et rien ne dit si la précédente a
                      été déposée. */}
                  {e.retardConstate ? (
                    <span className="text-danger font-bold">{e.moisEnRetard} mois de retard</span>
                  ) : e.joursRestants <= 0 ? (
                    <span className="text-text-dim">aujourd'hui</span>
                  ) : (
                    <span className="text-text-dim">dans {e.joursRestants} j</span>
                  )}
                </span>
                <span className="font-mono font-semibold text-right">
                  {e.genre === 'DECLARATION' ? (
                    <span className="text-[10px] font-normal text-text-dim">sans montant</span>
                  ) : (
                    `${e.montantDu.toLocaleString('fr-FR')} CDF`
                  )}
                </span>
              </div>
            ))
          )}
          {aVenir.auDela > 0 && (
            <div className="px-3.5 py-1.5 text-[10px] text-text-dim border-t border-border/50">
              {aVenir.auDela} autre(s) échéance(s) au-delà de {aVenir.horizonJours} jours · elles sont dans la
              fenêtre Retenues.
            </div>
          )}
        </div>
      )}

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
