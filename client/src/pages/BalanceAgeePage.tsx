import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';

/**
 * BALANCE ÂGÉE · État → Balance âgée de Sage 100 i7 : « état prévisionnel
 * des échéances à venir, ventilées par tranches de dates, en fonction d'une
 * date de référence saisie ». Assiette : les échéances NON LETTRÉES des
 * comptes de tiers (40 fournisseurs, 41 adhérents/clients · SYCEBNL) ; une
 * ligne sans échéance saisie est rattachée à sa date d'écriture, comme chez
 * Sage. Les tranches en retard s'assombrissent à mesure que le retard
 * grandit · la colonne « + de 90 jours » est celle qui doit faire réagir.
 */

interface LigneAgee {
  compteId: string;
  numero: string;
  intitule: string;
  nonEchu: number;
  j1a30: number;
  j31a60: number;
  j61a90: number;
  plus90: number;
  total: number;
}

interface BalanceAgee {
  dateReference: string;
  type: string;
  comptes: LigneAgee[];
  totaux: LigneAgee;
}

type TypeTiers = 'TOUS' | 'CLIENTS' | 'FOURNISSEURS';

const LIBELLE_TYPE: Record<TypeTiers, string> = {
  TOUS: 'Tous les tiers (40 et 41)',
  CLIENTS: 'Adhérents / clients (41)',
  FOURNISSEURS: 'Fournisseurs (40)',
};

function montant(n: number): string {
  return n !== 0 ? n.toLocaleString('fr-FR') : '';
}

export function BalanceAgeePage() {
  const { exerciceCourant } = useExercice();
  const [type, setType] = useState<TypeTiers>('TOUS');
  const [dateReference, setDateReference] = useState(new Date().toISOString().slice(0, 10));
  const [donnees, setDonnees] = useState<BalanceAgee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    api
      .get<BalanceAgee>(
        `/ecritures/balance-agee?exerciceId=${exerciceCourant.id}&dateReference=${dateReference}&type=${type}`,
      )
      .then(
        (r) => !annule && setDonnees(r),
        (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
      );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, dateReference, type]);

  const grille = 'grid grid-cols-[92px_1fr_110px_110px_110px_110px_110px_120px] gap-2.5';

  return (
    <div className="p-2.5">
      <div className="flex items-end justify-between mb-2.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] font-mono text-text-dim">ÉTAT</div>
          <h1 className="text-[15px] font-bold">Balance âgée</h1>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">TYPE DE TIERS</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TypeTiers)}
              className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] min-w-[190px]"
            >
              {(Object.keys(LIBELLE_TYPE) as TypeTiers[]).map((t) => (
                <option key={t} value={t}>
                  {LIBELLE_TYPE[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">DATE DE RÉFÉRENCE</span>
            <input
              type="date"
              value={dateReference}
              onChange={(e) => setDateReference(e.target.value)}
              className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] font-mono"
            />
          </label>
        </div>
      </div>

      {erreur && (
        <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      <div className="border border-border bg-surface shadow-posee">
        <div className={`${grille} px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark`}>
          <span>N° COMPTE</span>
          <span>INTITULÉ DU COMPTE</span>
          <span className="text-right">NON ÉCHU</span>
          <span className="text-right">1 À 30 J</span>
          <span className="text-right">31 À 60 J</span>
          <span className="text-right">61 À 90 J</span>
          <span className="text-right text-danger">+ DE 90 J</span>
          <span className="text-right">TOTAL</span>
        </div>

        {donnees && donnees.comptes.length === 0 && (
          <div className="px-3.5 py-4 text-[11.5px] text-text-dim">
            Aucune échéance non lettrée sur les comptes de tiers de cet exercice · soit rien n'est dû, soit
            tout est lettré. Les créances et dettes lettrées sont soldées, donc hors balance âgée.
          </div>
        )}

        {donnees?.comptes.map((c) => (
          <div
            key={c.compteId}
            className={`${grille} px-3.5 py-[4px] items-center border-b border-border/50 text-[11.5px]`}
          >
            <span className="font-mono">{c.numero}</span>
            <span className="truncate" title={c.intitule}>
              {c.intitule}
            </span>
            <span className="font-mono text-right text-text-dim">{montant(c.nonEchu)}</span>
            <span className="font-mono text-right">{montant(c.j1a30)}</span>
            <span className={`font-mono text-right ${c.j31a60 !== 0 ? 'bg-warning-soft' : ''}`}>{montant(c.j31a60)}</span>
            <span className={`font-mono text-right ${c.j61a90 !== 0 ? 'bg-warning-soft font-semibold' : ''}`}>
              {montant(c.j61a90)}
            </span>
            <span className={`font-mono text-right ${c.plus90 !== 0 ? 'bg-danger-soft text-danger font-bold' : ''}`}>
              {montant(c.plus90)}
            </span>
            <span className="font-mono text-right font-semibold">{montant(c.total)}</span>
          </div>
        ))}

        {donnees && donnees.comptes.length > 0 && (
          <div className={`${grille} px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold`}>
            <span />
            <span className="text-right text-[10px] text-text-dim self-center">TOTAUX</span>
            <span className="font-mono text-right">{montant(donnees.totaux.nonEchu)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.j1a30)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.j31a60)}</span>
            <span className="font-mono text-right">{montant(donnees.totaux.j61a90)}</span>
            <span className={`font-mono text-right ${donnees.totaux.plus90 !== 0 ? 'text-danger' : ''}`}>
              {montant(donnees.totaux.plus90)}
            </span>
            <span className="font-mono text-right">{montant(donnees.totaux.total)}</span>
          </div>
        )}
      </div>

      <p className="text-[10.5px] text-text-dim mt-2 max-w-[860px]">
        Montants signés vus du compte : créances des adhérents/clients au débit (positives), dettes
        fournisseurs au crédit (négatives). Une échéance non renseignée en saisie est rattachée à la date de
        l'écriture. Les lignes lettrées, soldées par définition, n'apparaissent pas.
      </p>
    </div>
  );
}
