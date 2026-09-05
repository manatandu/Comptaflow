import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * BALANCE AUXILIAIRE · la balance des comptes de tiers, tiers par tiers.
 *
 * À ne pas confondre avec la balance âgée, qui existait déjà : l'âgée ventile
 * un solde par tranche de retard et sert à apprécier le risque de
 * non-recouvrement ; l'auxiliaire porte les MOUVEMENTS de la période et le
 * solde qui en résulte, et c'est elle qu'un réviseur rapproche des
 * circularisations et de la balance générale. Tout dossier de révision réel
 * porte les deux.
 *
 * Un compte de tiers sans tiers rattaché n'est pas masqué · c'est la ligne
 * qui échappera à la circularisation, elle est signalée en clair.
 */

interface LigneAuxiliaire {
  compteId: string;
  numero: string;
  intitule: string;
  codeTiers: string;
  nomTiers: string;
  sansTiers: boolean;
  reportDebit: number;
  reportCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  soldeDebit: number;
  soldeCredit: number;
  solde: number;
}

interface BalanceAuxiliaire {
  type: string;
  comptes: LigneAuxiliaire[];
  totaux: Omit<LigneAuxiliaire, 'compteId' | 'numero' | 'intitule' | 'codeTiers' | 'nomTiers' | 'sansTiers'>;
}

type TypeTiers = 'TOUS' | 'CLIENTS' | 'FOURNISSEURS';

/**
 * Le compte 41 porte le même NUMÉRO dans les deux plans et pas le même
 * INTITULÉ · « Adhérents, clients-usagers et comptes rattachés » au SYCEBNL,
 * « Clients et comptes rattachés » à l'AUDCIF.
 */
const LIBELLE_SYCEBNL: Record<TypeTiers, string> = {
  TOUS: 'Tous les tiers (40 et 41)',
  CLIENTS: 'Adhérents, clients-usagers (41)',
  FOURNISSEURS: 'Fournisseurs (40)',
};

const LIBELLE_SYSCOHADA: Record<TypeTiers, string> = {
  TOUS: 'Tous les tiers (40 et 41)',
  CLIENTS: 'Clients et comptes rattachés (41)',
  FOURNISSEURS: 'Fournisseurs (40)',
};

function montant(n: number): string {
  return n !== 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function BalanceAuxiliairePage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const libelle = utilisateur?.tenant.referentiel === 'SYSCOHADA' ? LIBELLE_SYSCOHADA : LIBELLE_SYCEBNL;
  const [type, setType] = useState<TypeTiers>('TOUS');
  const [donnees, setDonnees] = useState<BalanceAuxiliaire | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    setErreur(null);
    api
      .get<BalanceAuxiliaire>(`/ecritures/balance-auxiliaire?exerciceId=${exerciceCourant.id}&type=${type}`)
      .then(
        (r) => !annule && setDonnees(r),
        (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
      );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, type]);

  const exporter = () => {
    if (!exerciceCourant) return;
    void api.telecharger(
      `/exports/balance-auxiliaire?exerciceId=${exerciceCourant.id}&type=${type}`,
      `balance-auxiliaire-${type.toLowerCase()}.xlsx`,
    );
  };

  // 814 px de colonnes fixes + 8 gouttières de 10 px + 28 px de marges =
  // 922 px incompressibles, pour ~326 px utiles à 360 px · c'est la grille la
  // plus large du logiciel après le journal général, et ses six colonnes de
  // montants étaient purement inatteignables. Le `min-w` va de pair avec le
  // conteneur défilant posé sur le panneau.
  const grille =
    'grid grid-cols-[92px_86px_1fr_106px_106px_106px_106px_106px_106px] min-w-[922px] gap-2.5';

  return (
    <div className="p-2">
      <EnteteImpression titre="Balance auxiliaire" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight">Balance auxiliaire</h1>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">TYPE DE TIERS</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TypeTiers)}
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] min-w-[190px]"
            >
              {(Object.keys(libelle) as TypeTiers[]).map((t) => (
                <option key={t} value={t}>
                  {libelle[t]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exporter}
            className="border border-border-dark bg-surface-alt px-3 py-1 text-[10.5px] font-semibold"
          >
            Exporter en Excel
          </button>
        </div>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      <div className="border border-border bg-surface shadow-posee overflow-x-auto">
        <div
          className={`${grille} px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark`}
        >
          <span>CODE COMPTE</span>
          <span>CODE TIERS</span>
          <span>LIBELLÉ TIERS</span>
          <span className="text-right">SOLDE DÉBIT AV. PÉR.</span>
          <span className="text-right">SOLDE CRÉDIT AV. PÉR.</span>
          <span className="text-right">DÉBIT PÉRIODE</span>
          <span className="text-right">CRÉDIT PÉRIODE</span>
          <span className="text-right">SOLDE DÉBIT</span>
          <span className="text-right">SOLDE CRÉDIT</span>
        </div>

        {donnees && donnees.comptes.length === 0 && (
          <div className="px-3.5 py-4 text-[10.5px] text-text-dim">
            Aucun compte de tiers mouvementé sur cet exercice.
          </div>
        )}

        {donnees?.comptes.map((c) => (
          <div
            key={c.compteId}
            className={`${grille} px-3.5 py-[4px] items-center border-b border-border/50 text-[10.5px]`}
          >
            <span className="font-mono">{c.numero}</span>
            <span className="font-mono text-text-dim">{c.codeTiers}</span>
            <span className={`truncate ${c.sansTiers ? 'text-warning italic' : ''}`}>
              {c.sansTiers ? `${c.intitule} · aucun tiers rattaché` : c.nomTiers}
            </span>
            <span className="font-mono text-right text-text-dim">{montant(c.reportDebit)}</span>
            <span className="font-mono text-right text-text-dim">{montant(c.reportCredit)}</span>
            <span className="font-mono text-right">{montant(c.mouvementDebit)}</span>
            <span className="font-mono text-right">{montant(c.mouvementCredit)}</span>
            <span className="font-mono text-right font-semibold">{montant(c.soldeDebit)}</span>
            <span className="font-mono text-right font-semibold">{montant(c.soldeCredit)}</span>
          </div>
        ))}

        {donnees && donnees.comptes.length > 0 && (
          <div className={`${grille} px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold`}>
            <span>SOLDE</span>
            <span />
            <span />
            <span className="font-mono text-right">{montant(donnees.totaux.reportDebit)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.reportCredit)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.mouvementDebit)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.mouvementCredit)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.soldeDebit)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.soldeCredit)}</span>
          </div>
        )}
      </div>

      <p className="text-[10px] text-text-dim mt-2 max-w-[860px]">
        Les colonnes « solde débit » et « solde crédit » s'excluent : un compte est débiteur ou créditeur,
        jamais les deux. Leur somme se rapproche de la balance générale. Un compte de tiers sans tiers
        rattaché reste affiché · c'est lui qui échappera à la circularisation.
      </p>
    </div>
  );
}
