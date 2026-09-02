import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * BALANCE ÂGÉE · l'antériorité des créances et dettes non lettrées, tiers par
 * tiers, dans la présentation des dossiers de révision réels.
 *
 * L'écran ventilait en tranches glissantes de trente jours (1 à 30, 31 à 60,
 * 61 à 90, + 90) depuis une date de référence. Un réviseur qui veut retrouver
 * la facture derrière un montant doit alors refaire les dates de tête. Les
 * colonnes sont désormais des PÉRIODES CALENDAIRES, avec l'âge rappelé
 * au-dessus · cinq mois entiers un par un, le reste de l'exercice en un bloc,
 * et l'antérieur à l'ouverture à part.
 *
 * Les tiers dont le solde est à l'envers ne sont pas ventilés : un client
 * créditeur n'a pas d'antériorité de créance. Ils sont rendus à part, et le
 * solde net des deux populations recoupe la balance auxiliaire.
 */

interface TrancheAgee {
  cle: string;
  libellePeriode: string;
  libelleAge: string;
}

interface LigneAgee {
  cle: string;
  libelle: string;
  codeTiers: string;
  numero: string;
  montants: number[];
  solde: number;
}

interface BalanceAgee {
  dateReference: string;
  debutExercice: string;
  type: string;
  tranches: TrancheAgee[];
  debiteurs: LigneAgee[];
  crediteurs: LigneAgee[];
  totaux: { parTranche: number[]; debiteurs: number; crediteurs: number; net: number };
}

type TypeTiers = 'TOUS' | 'CLIENTS_41' | 'FOURNISSEURS';

/**
 * Le compte 41 porte le même NUMÉRO dans les deux plans et pas le même
 * INTITULÉ · « Adhérents, clients-usagers et comptes rattachés » au SYCEBNL,
 * « Clients et comptes rattachés » à l'AUDCIF.
 */
const LIBELLE_TYPE_SYCEBNL: Record<TypeTiers, string> = {
  TOUS: 'Tous les tiers (40 et 41)',
  CLIENTS_41: 'Adhérents, clients-usagers (41)',
  FOURNISSEURS: 'Fournisseurs (40)',
};

const LIBELLE_TYPE_SYSCOHADA: Record<TypeTiers, string> = {
  TOUS: 'Tous les tiers (40 et 41)',
  CLIENTS_41: 'Clients et comptes rattachés (41)',
  FOURNISSEURS: 'Fournisseurs (40)',
};

function montant(n: number): string {
  return n !== 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function BalanceAgeePage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const libelleType =
    utilisateur?.tenant.referentiel === 'SYSCOHADA' ? LIBELLE_TYPE_SYSCOHADA : LIBELLE_TYPE_SYCEBNL;
  const [type, setType] = useState<TypeTiers>('TOUS');
  const [dateReference, setDateReference] = useState(new Date().toISOString().slice(0, 10));
  const [donnees, setDonnees] = useState<BalanceAgee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    setErreur(null);
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

  const exporter = () => {
    if (!exerciceCourant) return;
    void api.telecharger(
      `/exports/balance-agee?exerciceId=${exerciceCourant.id}&dateReference=${dateReference}&type=${type}`,
      'balance-agee.xlsx',
    );
  };

  // La grille suit le NOMBRE de tranches renvoyé · il varie avec la longueur
  // de l'exercice (un exercice de moins de cinq mois n'a pas de bloc « reste
  // de l'exercice »), et le figer casserait l'alignement en silence.
  const nbTranches = donnees?.tranches.length ?? 0;
  const grille = {
    display: 'grid',
    gridTemplateColumns: `minmax(220px,1fr) repeat(${nbTranches + 1}, 116px)`,
    gap: '10px',
  } as const;

  const ligne = (l: LigneAgee, ventile: boolean) => (
    <div
      key={l.cle}
      style={grille}
      className="px-3.5 py-[4px] items-center border-b border-border/50 text-[10.5px]"
    >
      <span className="truncate" title={l.libelle}>
        {l.libelle}
      </span>
      {donnees!.tranches.map((t, i) => (
        <span key={t.cle} className="font-mono text-right">
          {ventile ? montant(l.montants[i] ?? 0) : ''}
        </span>
      ))}
      <span className="font-mono text-right font-semibold">{montant(l.solde)}</span>
    </div>
  );

  return (
    <div className="p-2">
      <EnteteImpression titre="Balance âgée" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            Balance âgée
            <Aide sujet="balanceAgee" />
          </h1>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">TYPE DE TIERS</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TypeTiers)}
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] min-w-[190px]"
            >
              {(Object.keys(libelleType) as TypeTiers[]).map((t) => (
                <option key={t} value={t}>
                  {libelleType[t]}
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
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] font-mono"
            />
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
        {donnees && (
          <>
            <div
              style={grille}
              className="px-3.5 pt-1.5 text-[9.5px] italic text-text-dim border-b border-border/40"
            >
              <span />
              {donnees.tranches.map((t) => (
                <span key={t.cle} className="text-right">
                  {t.libelleAge}
                </span>
              ))}
              <span />
            </div>
            <div
              style={grille}
              className="px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark"
            >
              <span>TIERS</span>
              {donnees.tranches.map((t) => (
                <span key={t.cle} className="text-right">
                  {t.libellePeriode}
                </span>
              ))}
              <span className="text-right">SOLDE</span>
            </div>
          </>
        )}

        {donnees && donnees.debiteurs.length === 0 && donnees.crediteurs.length === 0 && (
          <div className="px-3.5 py-4 text-[10.5px] text-text-dim">
            Aucune échéance non lettrée sur les comptes de tiers de cet exercice · soit rien n'est dû, soit
            tout est lettré. Les créances et dettes lettrées sont soldées, donc hors balance âgée.
          </div>
        )}

        {donnees?.debiteurs.map((l) => ligne(l, true))}

        {donnees && donnees.crediteurs.length > 0 && (
          <div className="px-3.5 py-1 text-[9.5px] italic text-text-dim bg-surface-alt border-y border-border/60">
            Soldes en sens inverse · non ventilés par antériorité
          </div>
        )}
        {donnees?.crediteurs.map((l) => ligne(l, false))}

        {donnees && (donnees.debiteurs.length > 0 || donnees.crediteurs.length > 0) && (
          <>
            <div
              style={grille}
              className="px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold"
            >
              <span>TOTAL DÉBITEURS</span>
              {donnees.tranches.map((t, i) => (
                <span key={t.cle} className="font-mono text-right">
                  {montant(donnees.totaux.parTranche[i] ?? 0)}
                </span>
              ))}
              <span className="font-mono text-right">{montant(donnees.totaux.debiteurs)}</span>
            </div>
            <div style={grille} className="px-3.5 py-1 text-[10.5px] font-bold">
              <span>TOTAL SOLDES EN SENS INVERSE</span>
              {donnees.tranches.map((t) => (
                <span key={t.cle} />
              ))}
              <span className="font-mono text-right">{montant(donnees.totaux.crediteurs)}</span>
            </div>
            <div
              style={grille}
              className="px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold"
            >
              <span>SOLDE NET</span>
              {donnees.tranches.map((t) => (
                <span key={t.cle} />
              ))}
              <span className="font-mono text-right">{montant(donnees.totaux.net)}</span>
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] text-text-dim mt-2 max-w-[900px]">
        Une ligne par tiers, pas par compte : un tiers qui porte plusieurs comptes rattachés (un compte
        d'exploitation et un compte douteux, par exemple) présente ici son exposition entière. Une échéance
        non renseignée en saisie est rattachée à la date de l'écriture. Les lignes lettrées, soldées par
        définition, n'apparaissent pas. Le solde net doit recouper celui de la balance auxiliaire des mêmes
        comptes.
      </p>
    </div>
  );
}
