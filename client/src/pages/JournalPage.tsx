import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconFilter, IconExport } from '../components/chrome/icons';
import type { Compte, Ecriture, Journal, LigneBalance, LigneGrandLivre } from '../lib/types';

type Onglet = 'journal' | 'grand-livre' | 'balance';

interface Filtres {
  journalId: string;
  dateDebut: string;
  dateFin: string;
  recherche: string;
}

const FILTRES_VIDES: Filtres = { journalId: '', dateDebut: '', dateFin: '', recherche: '' };

/** Construit la query string commune à la consultation et à l'export. */
function versQuery(exerciceId: string, filtres: Filtres): string {
  const params = new URLSearchParams({ exerciceId });
  if (filtres.journalId) params.set('journalId', filtres.journalId);
  if (filtres.dateDebut) params.set('dateDebut', filtres.dateDebut);
  if (filtres.dateFin) params.set('dateFin', filtres.dateFin);
  if (filtres.recherche) params.set('recherche', filtres.recherche);
  return params.toString();
}

export function JournalPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<Onglet>('journal');
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [totaux, setTotaux] = useState({ debit: 0, credit: 0 });
  const [balance, setBalance] = useState<LigneBalance[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [compteGrandLivreId, setCompteGrandLivreId] = useState('');
  const [grandLivre, setGrandLivre] = useState<{ lignes: LigneGrandLivre[]; soldeFinal: number } | null>(null);

  // `filtres` est l'état des champs ; `filtresAppliques` ce qui a réellement
  // été envoyé au serveur. Les séparer évite de relancer une requête à
  // chaque frappe dans le champ de recherche.
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [filtresAppliques, setFiltresAppliques] = useState<Filtres>(FILTRES_VIDES);
  const [filtresOuverts, setFiltresOuverts] = useState(false);

  useEffect(() => {
    api.get<Compte[]>('/comptes').then(setComptes);
    api.get<Journal[]>('/journaux').then(setJournaux);
  }, []);

  useEffect(() => {
    if (!exerciceCourant) return;
    const query = versQuery(exerciceCourant.id, filtresAppliques);
    api
      .get<{ ecritures: Ecriture[]; totaux: { debit: number; credit: number } }>(`/ecritures?${query}`)
      .then((r) => {
        setEcritures(r.ecritures);
        setTotaux(r.totaux);
      });
  }, [exerciceCourant?.id, filtresAppliques]);

  useEffect(() => {
    if (!exerciceCourant) return;
    api
      .get<{ lignes: LigneBalance[] }>(`/ecritures/balance?exerciceId=${exerciceCourant.id}`)
      .then((r) => setBalance(r.lignes));
  }, [exerciceCourant?.id]);

  useEffect(() => {
    if (!exerciceCourant || !compteGrandLivreId) {
      setGrandLivre(null);
      return;
    }
    api
      .get<{ lignes: LigneGrandLivre[]; soldeFinal: number }>(
        `/ecritures/grand-livre/${compteGrandLivreId}?exerciceId=${exerciceCourant.id}`,
      )
      .then(setGrandLivre);
  }, [exerciceCourant?.id, compteGrandLivreId]);

  const filtreActif = useMemo(
    () => Object.values(filtresAppliques).some((v) => v !== ''),
    [filtresAppliques],
  );

  const exporterJournal = () => {
    if (!exerciceCourant) return;
    // Le journal exporté est exactement celui affiché, filtres compris.
    api.telecharger(`/exports/journal?${versQuery(exerciceCourant.id, filtresAppliques)}`, 'journal.xlsx');
  };
  const exporterBalance = () => {
    if (!exerciceCourant) return;
    api.telecharger(`/exports/balance?exerciceId=${exerciceCourant.id}`, 'balance.xlsx');
  };
  const exporterGrandLivreDuCompte = () => {
    if (!exerciceCourant || !compteGrandLivreId) return;
    api.telecharger(`/exports/grand-livre/${compteGrandLivreId}?exerciceId=${exerciceCourant.id}`, 'grand-livre.xlsx');
  };
  const exporterGrandLivreComplet = () => {
    if (!exerciceCourant) return;
    api.telecharger(`/exports/grand-livre?exerciceId=${exerciceCourant.id}`, 'grand-livre-complet.xlsx');
  };

  // useRibbon n'enregistre les boutons qu'au montage (voir sa doc) : un
  // onClick ici capterait l'onglet initial pour toujours. Les boutons
  // réellement fonctionnels (réactifs à l'onglet actif) vivent dans
  // l'en-tête de page ci-dessous, pas dans ce ruban contextuel.
  useRibbon([
    { titre: 'AFFICHAGE', boutons: [{ label: 'Filtrer', Icon: IconFilter }] },
    { titre: 'IMPRESSION', boutons: [{ label: 'Exporter Excel', Icon: IconExport }] },
  ]);

  const lignesJournal = ecritures.flatMap((e) =>
    e.lignes.map((l) => ({
      date: e.date,
      journal: e.journal?.code ?? '',
      libelle: e.libelle,
      compte: l.compte ? `${l.compte.numero} — ${l.compte.intitule}` : l.compteId,
      debit: Number(l.debit),
      credit: Number(l.credit),
      piece: e.reference,
      key: l.id,
    })),
  );

  const boutonExport = (label: string, onClick: () => void, principal = true) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt ${
        principal ? 'bg-surface' : 'bg-chrome'
      }`}
    >
      <IconExport width={13} height={13} />
      {label}
    </button>
  );

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <h1 className="text-[15px] font-bold">Journal &amp; grand livre</h1>
        <div className="flex items-center gap-2">
          {onglet === 'journal' && (
            <button
              onClick={() => setFiltresOuverts((v) => !v)}
              className={`flex items-center gap-1.5 border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt ${
                filtreActif ? 'bg-warning-soft border-warning/40' : 'bg-surface'
              }`}
            >
              <IconFilter width={13} height={13} />
              Filtrer{filtreActif ? ' (actif)' : ''}
            </button>
          )}
          {onglet === 'journal' && boutonExport('Exporter Excel', exporterJournal)}
          {onglet === 'balance' && boutonExport('Exporter Excel', exporterBalance)}
          {onglet === 'grand-livre' && (
            <>
              {compteGrandLivreId && boutonExport('Exporter ce compte', exporterGrandLivreDuCompte, false)}
              {boutonExport('Exporter tout le grand livre', exporterGrandLivreComplet)}
            </>
          )}
        </div>
      </div>

      {onglet === 'journal' && filtresOuverts && (
        <div className="border border-border bg-surface-alt p-3 mb-2.5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">JOURNAL</span>
            <select
              value={filtres.journalId}
              onChange={(e) => setFiltres({ ...filtres, journalId: e.target.value })}
              className="border border-border bg-surface px-2 py-1 text-[11.5px] font-mono min-w-[150px]"
            >
              <option value="">Tous</option>
              {journaux.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.intitule}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">DU</span>
            <input
              type="date"
              value={filtres.dateDebut}
              onChange={(e) => setFiltres({ ...filtres, dateDebut: e.target.value })}
              className="border border-border bg-surface px-2 py-1 text-[11.5px] font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">AU</span>
            <input
              type="date"
              value={filtres.dateFin}
              onChange={(e) => setFiltres({ ...filtres, dateFin: e.target.value })}
              className="border border-border bg-surface px-2 py-1 text-[11.5px] font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[10px] font-bold text-text-dim">LIBELLÉ CONTIENT</span>
            <input
              type="text"
              value={filtres.recherche}
              onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && setFiltresAppliques(filtres)}
              placeholder="ex. cotisation"
              className="border border-border bg-surface px-2 py-1 text-[11.5px]"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setFiltresAppliques(filtres)}
              className="border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-chrome"
            >
              Appliquer
            </button>
            <button
              onClick={() => {
                setFiltres(FILTRES_VIDES);
                setFiltresAppliques(FILTRES_VIDES);
              }}
              className="border border-border bg-chrome px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      <div className="flex bg-chrome border border-border border-b-0">
        <button
          onClick={() => setOnglet('journal')}
          className={`px-4 py-1.5 text-[11px] font-bold ${onglet === 'journal' ? 'bg-surface border-r border-border' : 'text-text-dim'}`}
        >
          JOURNAL
        </button>
        <button
          onClick={() => setOnglet('grand-livre')}
          className={`px-4 py-1.5 text-[11px] font-bold ${onglet === 'grand-livre' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'}`}
        >
          GRAND LIVRE
        </button>
        <button
          onClick={() => setOnglet('balance')}
          className={`px-4 py-1.5 text-[11px] font-bold ${onglet === 'balance' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'}`}
        >
          BALANCE
        </button>
      </div>

      {onglet === 'journal' && (
        <div className="border border-border">
          <div className="grid grid-cols-[62px_46px_1.6fr_1.3fr_100px_100px_74px] gap-2.5 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border">
            <span>DATE</span>
            <span>JRN</span>
            <span>LIBELLÉ</span>
            <span>COMPTE</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span>PIÈCE</span>
          </div>
          {lignesJournal.length === 0 && (
            <div className="px-3.5 py-4 text-[11.5px] text-text-dim">
              {filtreActif ? 'Aucune écriture ne correspond au filtre.' : 'Aucune écriture sur cet exercice.'}
            </div>
          )}
          {lignesJournal.map((l, i) => (
            <div
              key={l.key}
              className={`grid grid-cols-[62px_46px_1.6fr_1.3fr_100px_100px_74px] gap-2.5 px-3.5 py-1 items-center border-b border-border text-[11.5px] ${
                i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
              }`}
            >
              <span className="font-mono text-[10.5px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
              <span className="font-mono text-text-dim">{l.journal}</span>
              <span>{l.libelle}</span>
              <span className="font-mono text-text-dim">{l.compte}</span>
              <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-[10px] text-text-dim">{l.piece}</span>
            </div>
          ))}
          <div className="grid grid-cols-[62px_46px_1.6fr_1.3fr_100px_100px_74px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold">
            <span />
            <span />
            <span>TOTAUX DE LA PÉRIODE</span>
            <span />
            <span className="font-mono text-right">{totaux.debit.toLocaleString('fr-FR')}</span>
            <span className="font-mono text-right">{totaux.credit.toLocaleString('fr-FR')}</span>
            <span />
          </div>
        </div>
      )}

      {onglet === 'grand-livre' && (
        <div className="border border-border">
          <div className="px-3.5 py-2 bg-surface-alt border-b border-border flex items-center gap-2">
            <label className="text-[11px] font-bold text-text-dim">COMPTE</label>
            <select
              value={compteGrandLivreId}
              onChange={(e) => setCompteGrandLivreId(e.target.value)}
              className="border border-border bg-surface px-2 py-1 text-[11.5px] font-mono"
            >
              <option value="">— sélectionner un compte —</option>
              {comptes
                .filter((c) => c.estActif)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} — {c.intitule}
                  </option>
                ))}
            </select>
            <span className="text-[10.5px] text-text-dim">
              L'export « tout le grand livre » ne dépend pas de ce choix : il reprend tous les comptes mouvementés.
            </span>
          </div>

          {!compteGrandLivreId && (
            <div className="px-3.5 py-4 text-[11.5px] text-text-dim">Choisissez un compte pour afficher son grand livre.</div>
          )}

          {compteGrandLivreId && grandLivre && (
            <>
              <div className="grid grid-cols-[62px_46px_1.8fr_90px_90px_100px_74px_1.2fr] gap-2.5 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border">
                <span>DATE</span>
                <span>JRN</span>
                <span>LIBELLÉ</span>
                <span className="text-right">DÉBIT</span>
                <span className="text-right">CRÉDIT</span>
                <span className="text-right">SOLDE</span>
                <span>LETTRE</span>
                <span title="Comptes de sens opposé dans la même écriture. Plusieurs comptes = écriture N débits/M crédits, répartition non déterminable sans information de saisie supplémentaire.">
                  CONTREPARTIE
                </span>
              </div>
              {grandLivre.lignes.map((l, i) => (
                <div
                  key={l.id}
                  className={`grid grid-cols-[62px_46px_1.8fr_90px_90px_100px_74px_1.2fr] gap-2.5 px-3.5 py-1 items-center border-b border-border text-[11.5px] ${
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                  }`}
                >
                  <span className="font-mono text-[10.5px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
                  <span className="font-mono text-text-dim">{l.journalCode}</span>
                  <span>{l.libelle}</span>
                  <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
                  <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
                  <span className="font-mono text-right font-semibold">{l.soldeProgressif.toLocaleString('fr-FR')}</span>
                  <span className="font-mono text-text-dim">{l.lettre ?? ''}</span>
                  <span className="font-mono text-[10.5px] text-text-dim">
                    {l.contrepartie.length > 0 ? l.contrepartie.join(' + ') : '—'}
                  </span>
                </div>
              ))}
              <div className="grid grid-cols-[62px_46px_1.8fr_90px_90px_100px_74px_1.2fr] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold">
                <span />
                <span />
                <span>SOLDE FINAL</span>
                <span />
                <span />
                <span className="font-mono text-right">{grandLivre.soldeFinal.toLocaleString('fr-FR')}</span>
                <span />
                <span />
              </div>
            </>
          )}
        </div>
      )}

      {onglet === 'balance' && (
        <div className="border border-border">
          <div className="grid grid-cols-[70px_1fr_110px_110px_110px] gap-2.5 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border">
            <span>N°</span>
            <span>LIBELLÉ</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span className="text-right">SOLDE</span>
          </div>
          {balance.map((l, i) => (
            <div
              key={l.compteId}
              title={l.typeCompte === 'TOTAL' ? 'Compte Total — agrège les comptes Détail de même racine' : undefined}
              className={`grid grid-cols-[70px_1fr_110px_110px_110px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border text-[12px] ${
                l.typeCompte === 'TOTAL' ? 'bg-chrome font-semibold' : i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
              }`}
            >
              <span className="font-mono">{l.numero}</span>
              <span>{l.intitule}</span>
              <span className="font-mono text-right">{l.totalDebit.toLocaleString('fr-FR')}</span>
              <span className="font-mono text-right">{l.totalCredit.toLocaleString('fr-FR')}</span>
              <span className="font-mono text-right font-semibold">{l.solde.toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
