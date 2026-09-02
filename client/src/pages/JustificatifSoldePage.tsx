import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * JUSTIFICATIF DE SOLDE · le détail qui compose le solde d'un compte à une
 * date, et son recoupement avec la balance.
 *
 * C'est la pièce maîtresse d'un dossier de révision, et le logiciel n'en
 * produisait aucune : il fallait sortir le grand livre du compte et le
 * retravailler à la main. Le dossier de cabinet relevé sur le Drive la répète
 * pour une dizaine de comptes (factures à recevoir, provision fiscale,
 * charges constatées d'avance, débiteurs divers, immos en cours, stock à
 * l'extérieur, clients douteux…).
 *
 * Ce n'est PAS le grand livre du compte. Le grand livre est borné à
 * l'exercice ; le justificatif remonte aussi loin que le solde le demande ·
 * une créance ouverte il y a cinq ans compose encore le solde d'aujourd'hui.
 */

interface LigneJustificatif {
  ligneId: string;
  date: string;
  journal: string;
  numeroPiece: number | null;
  reference: string;
  libelle: string;
  debit: number;
  credit: number;
  deviseTransaction: string;
  montantDevise: number | null;
  lettre: string;
  estANouveau: boolean;
}

interface Justificatif {
  compte: { id: string; numero: string; intitule: string };
  dateArret: string;
  masquerLettrees: boolean;
  lignes: LigneJustificatif[];
  totaux: { debit: number; credit: number; solde: number };
  recoupement: { applicable: boolean; soldeBalance: number; ecart: number; concordant: boolean };
}

interface LigneBalance {
  compteId: string;
  numero: string;
  intitule: string;
}

function montant(n: number | null): string {
  return n !== null && n !== 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function JustificatifSoldePage() {
  const { exerciceCourant } = useExercice();
  const [comptes, setComptes] = useState<LigneBalance[]>([]);
  const [compteId, setCompteId] = useState('');
  const [dateArret, setDateArret] = useState('');
  const [masquerLettrees, setMasquerLettrees] = useState(false);
  const [donnees, setDonnees] = useState<Justificatif | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Les comptes proposés sont ceux qui ONT un solde · justifier un compte
  // jamais mouvementé n'a pas d'objet, et la liste complète du plan noierait
  // les quelques comptes qu'on vient réellement justifier.
  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    api
      .get<{ lignes: LigneBalance[] }>(`/ecritures/balance?exerciceId=${exerciceCourant.id}`)
      .then(
        (r) => !annule && setComptes(r.lignes),
        () => undefined,
      );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

  useEffect(() => {
    if (!exerciceCourant || !compteId) {
      setDonnees(null);
      return;
    }
    let annule = false;
    setErreur(null);
    const q = new URLSearchParams({ exerciceId: exerciceCourant.id });
    if (dateArret) q.set('dateArret', dateArret);
    if (masquerLettrees) q.set('masquerLettrees', 'true');
    api
      .get<Justificatif>(`/ecritures/justificatif-solde/${compteId}?${q}`)
      .then(
        (r) => !annule && setDonnees(r),
        (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
      );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, compteId, dateArret, masquerLettrees]);

  const exporter = () => {
    if (!exerciceCourant || !compteId) return;
    const q = new URLSearchParams({ exerciceId: exerciceCourant.id });
    if (dateArret) q.set('dateArret', dateArret);
    if (masquerLettrees) q.set('masquerLettrees', 'true');
    void api.telecharger(`/exports/justificatif-solde/${compteId}?${q}`, 'justificatif.xlsx');
  };

  const options = useMemo(
    () => [...comptes].sort((a, b) => a.numero.localeCompare(b.numero)),
    [comptes],
  );

  const grille =
    'grid grid-cols-[86px_64px_92px_120px_1fr_70px_100px_112px_112px_72px] gap-2.5';

  return (
    <div className="p-2">
      <EnteteImpression titre="Justificatif de solde" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">RÉVISION</div>
          <h1 className="text-[12px] font-bold leading-tight">Justificatif de solde</h1>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">COMPTE À JUSTIFIER</span>
            <select
              value={compteId}
              onChange={(e) => setCompteId(e.target.value)}
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] min-w-[320px]"
            >
              <option value="">Choisir un compte…</option>
              {options.map((c) => (
                <option key={c.compteId} value={c.compteId}>
                  {c.numero} · {c.intitule}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">ARRÊTÉ AU</span>
            <input
              type="date"
              value={dateArret}
              onChange={(e) => setDateArret(e.target.value)}
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] font-mono"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[10.5px] pb-1">
            <input
              type="checkbox"
              checked={masquerLettrees}
              onChange={(e) => setMasquerLettrees(e.target.checked)}
            />
            Masquer les lignes lettrées
          </label>
          <button
            type="button"
            onClick={exporter}
            disabled={!compteId}
            className="border border-border-dark bg-surface-alt px-3 py-1 text-[10.5px] font-semibold disabled:opacity-40"
          >
            Exporter en Excel
          </button>
        </div>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      {!compteId && (
        <div className="border border-border bg-surface shadow-posee px-3.5 py-4 text-[10.5px] text-text-dim">
          Choisissez le compte dont vous voulez justifier le solde. À la différence du grand livre, borné à
          l'exercice, le justificatif remonte aussi loin que le solde le demande : une opération ouverte il y
          a plusieurs exercices y figure encore si elle n'a pas été soldée.
        </div>
      )}

      {donnees && (
        <>
          {donnees.recoupement.applicable && (
            <div
              className={`text-[10.5px] border px-3 py-2 mb-2.5 ${
                donnees.recoupement.concordant
                  ? 'text-text-dim bg-surface-alt border-border'
                  : 'text-danger bg-danger-soft border-danger/30 font-semibold'
              }`}
            >
              {donnees.recoupement.concordant
                ? `Recoupement avec la balance · concordant (${montant(donnees.recoupement.soldeBalance)}).`
                : `Écart avec la balance de ${montant(donnees.recoupement.ecart)} · le justificatif ne couvre pas tout le solde du compte (balance : ${montant(donnees.recoupement.soldeBalance)}).`}
            </div>
          )}

          <div className="border border-border bg-surface shadow-posee overflow-x-auto">
            <div className="px-3.5 py-1.5 text-[11px] font-bold border-b border-border-dark">
              {donnees.compte.numero} · {donnees.compte.intitule}
              <span className="font-normal text-text-dim"> · arrêté au {donnees.dateArret}</span>
            </div>
            <div
              className={`${grille} px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark`}
            >
              <span>DATE</span>
              <span>JOURNAL</span>
              <span>N° PIÈCE</span>
              <span>RÉF. PIÈCE</span>
              <span>LIBELLÉ ÉCRITURE</span>
              <span>DEV. TR</span>
              <span className="text-right">MT DEVISE</span>
              <span className="text-right">DÉBIT</span>
              <span className="text-right">CRÉDIT</span>
              <span>LETTRE</span>
            </div>

            {donnees.lignes.length === 0 && (
              <div className="px-3.5 py-4 text-[10.5px] text-text-dim">
                Aucune ligne ne compose ce solde à la date retenue.
              </div>
            )}

            {donnees.lignes.map((l) => (
              <div
                key={l.ligneId}
                className={`${grille} px-3.5 py-[4px] items-center border-b border-border/50 text-[10.5px] ${
                  l.estANouveau ? 'italic text-text-dim' : ''
                }`}
              >
                <span className="font-mono">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
                <span className="font-mono">{l.journal}</span>
                <span className="font-mono">{l.numeroPiece ?? ''}</span>
                <span className="truncate" title={l.reference}>
                  {l.reference}
                </span>
                <span className="truncate" title={l.libelle}>
                  {l.libelle}
                  {l.estANouveau && ' · à-nouveau'}
                </span>
                <span className="font-mono">{l.deviseTransaction}</span>
                <span className="font-mono text-right">{montant(l.montantDevise)}</span>
                <span className="font-mono text-right">{montant(l.debit)}</span>
                <span className="font-mono text-right">{montant(l.credit)}</span>
                <span className="font-mono">{l.lettre}</span>
              </div>
            ))}

            {donnees.lignes.length > 0 && (
              <div
                className={`${grille} px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold`}
              >
                <span>TOTAL</span>
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span className="font-mono text-right">{montant(donnees.totaux.debit)}</span>
                <span className="font-mono text-right">{montant(donnees.totaux.credit)}</span>
                <span />
              </div>
            )}
            {donnees.lignes.length > 0 && (
              <div className={`${grille} px-3.5 py-1.5 text-[10.5px] font-bold`}>
                <span>SOLDE</span>
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span className="font-mono text-right">{montant(donnees.totaux.solde)}</span>
                <span />
                <span />
              </div>
            )}
          </div>

          <p className="text-[10px] text-text-dim mt-2 max-w-[900px]">
            Les écritures d'à-nouveau de clôture sont écartées : elles reprennent le cumul des exercices
            antérieurs, que cet état liste déjà ligne à ligne, et les garder doublerait le solde. Celles du
            premier exercice du dossier restent, en italique · elles ne reprennent rien, elles portent le
            bilan d'ouverture. Le recoupement avec la balance n'est annoncé qu'à la date de clôture et sur
            l'état complet · à une date intermédiaire, ou en masquant les lignes lettrées, un écart serait
            attendu et non une anomalie.
          </p>
        </>
      )}
    </div>
  );
}
