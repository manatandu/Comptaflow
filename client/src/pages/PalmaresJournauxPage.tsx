import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { useExercice } from '../lib/exercice';

/**
 * PALMARÈS DES COMPTES ET ANALYSE DES JOURNAUX · deux états de relecture
 * d'exercice, dans une seule fenêtre à deux onglets.
 *
 * Ils viennent du catalogue Sage, qui les NOMME et rien de plus · ni colonnes,
 * ni tri, ni périmètre. Leur définition est donc celle d'OmegaX, et la fenêtre
 * le dit en toutes lettres plutôt que de laisser croire à une maquette reprise.
 * Aucun texte comptable ne les régit : ce ne sont pas des états financiers, ils
 * ne se déposent nulle part.
 */

interface LignePalmares {
  compteId: string;
  numero: string;
  intitule: string;
  classe: string;
  mouvement: number;
  debit: number;
  credit: number;
  solde: number;
  nombreLignes: number;
  part: number;
  partCumulee: number;
}

interface Palmares {
  lignes: LignePalmares[];
  total: { mouvement: number; comptes: number };
  tronque: boolean;
}

interface LigneJournal {
  journalId: string;
  code: string;
  intitule: string;
  type: string;
  numerotation: string;
  nombreEcritures: number;
  nombreLignes: number;
  debit: number;
  credit: number;
  enBrouillard: number;
  deCloture: number;
  premiereDate: string | null;
  derniereDate: string | null;
  sequence: {
    perimetre: string;
    explication: string;
    manquants: number | null;
    trous: Array<{ de: number; a: number }>;
  };
}

interface Analyse {
  lignes: LigneJournal[];
  sequenceDuDossier: {
    applicable: boolean;
    explication: string;
    manquants: number;
    trous: Array<{ de: number; a: number }>;
  };
}

const montant = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pourcent = (n: number) => `${n.toFixed(1)} %`;
const listerTrous = (trous: Array<{ de: number; a: number }>) =>
  trous.map((t) => (t.de === t.a ? `${t.de}` : `${t.de} à ${t.a}`)).join(', ');

export function PalmaresJournauxPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<'palmares' | 'journaux'>('palmares');
  const [classe, setClasse] = useState('');
  const [limite, setLimite] = useState(25);
  const [palmares, setPalmares] = useState<Palmares | null>(null);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    setErreur(null);
    const echec = (e: unknown) =>
      !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    if (onglet === 'palmares') {
      api
        .get<Palmares>(
          `/journaux/palmares-comptes?exerciceId=${exerciceCourant.id}&limite=${limite}${classe ? `&classe=${classe}` : ''}`,
        )
        .then((r) => !annule && setPalmares(r), echec);
    } else {
      api
        .get<Analyse>(`/journaux/analyse?exerciceId=${exerciceCourant.id}`)
        .then((r) => !annule && setAnalyse(r), echec);
    }
    return () => {
      annule = true;
    };
  }, [exerciceCourant, onglet, classe, limite]);

  const ongletClasse = (o: typeof onglet) =>
    `px-3 py-1 text-[10.5px] font-semibold border-t border-x ${
      onglet === o ? 'bg-surface border-border' : 'bg-surface-alt border-transparent text-text-dim'
    }`;

  return (
    <div className="p-2">
      <EnteteImpression titre={onglet === 'palmares' ? 'Palmarès des comptes' : 'Analyse des journaux'} />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">RÉVISION</div>
          <h1 className="text-[12px] font-bold leading-tight">Palmarès et analyse des journaux</h1>
        </div>
        {onglet === 'palmares' && (
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim">CLASSE</span>
              <input
                value={classe}
                onChange={(e) => setClasse(e.target.value.replace(/\D/g, ''))}
                placeholder="toutes"
                className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] font-mono w-[90px]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim">RANGS</span>
              <select
                value={limite}
                onChange={(e) => setLimite(Number(e.target.value))}
                className="border border-border-dark bg-surface px-2 py-1 text-[10.5px]"
              >
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n} premiers
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="flex gap-1">
        <button type="button" onClick={() => setOnglet('palmares')} className={ongletClasse('palmares')}>
          Palmarès des comptes
        </button>
        <button type="button" onClick={() => setOnglet('journaux')} className={ongletClasse('journaux')}>
          Analyse des journaux
        </button>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      {onglet === 'palmares' && palmares && (
        <div className="border border-border bg-surface shadow-posee overflow-x-auto">
          <div className="grid grid-cols-[100px_minmax(180px,1fr)_70px_120px_120px_120px_80px_80px] min-w-[900px] gap-2 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark">
            <span>N° COMPTE</span>
            <span>INTITULÉ</span>
            <span>CLASSE</span>
            <span className="text-right">MOUVEMENT</span>
            <span className="text-right">SOLDE</span>
            <span className="text-right">LIGNES</span>
            <span className="text-right">PART</span>
            <span className="text-right">CUMUL</span>
          </div>
          {palmares.lignes.map((l, i) => (
            <div
              key={l.compteId}
              className="grid grid-cols-[100px_minmax(180px,1fr)_70px_120px_120px_120px_80px_80px] min-w-[900px] gap-2 px-3.5 py-1 text-[11px] border-b border-border/40"
            >
              <span className="font-mono">{l.numero}</span>
              <span className="truncate">{l.intitule}</span>
              {/*
                LA CLASSE EST TOUJOURS AFFICHÉE. Un compte de trésorerie et un
                compte de charge ne se comparent pas vraiment : ranger en
                silence un stock et un flux dans le même classement serait une
                comparaison que rien ne fonde. La colonne oblige le lecteur à
                voir ce qu'il compare.
              */}
              <span className="font-mono text-text-dim">{l.classe.replace('CLASSE_', '')}</span>
              <span className="text-right font-mono">{montant(l.mouvement)}</span>
              <span className="text-right font-mono text-text-dim">{montant(l.solde)}</span>
              <span className="text-right font-mono text-text-dim">{l.nombreLignes}</span>
              <span className="text-right font-mono text-text-dim">{pourcent(l.part)}</span>
              {/*
                Le cumul passe en gras au franchissement des 80 % · c'est le
                rang à partir duquel le reste du dossier ne pèse presque plus,
                et donc l'endroit où une revue peut s'arrêter.
              */}
              <span
                className={`text-right font-mono ${
                  l.partCumulee >= 80 && (i === 0 || palmares.lignes[i - 1].partCumulee < 80)
                    ? 'font-bold'
                    : 'text-text-dim'
                }`}
              >
                {pourcent(l.partCumulee)}
              </span>
            </div>
          ))}
          <div className="px-3.5 py-2 text-[10px] text-text-dim border-t border-border">
            Mouvement total du périmètre : {montant(palmares.total.mouvement)} sur {palmares.total.comptes} comptes
            mouvementés.
            {palmares.tronque && ` Seuls les ${palmares.lignes.length} premiers rangs sont montrés · la part cumulée reste calculée sur le périmètre entier.`}
          </div>
        </div>
      )}

      {onglet === 'journaux' && analyse && (
        <div className="border border-border bg-surface shadow-posee overflow-x-auto">
          <div className="grid grid-cols-[70px_minmax(160px,1fr)_90px_90px_90px_90px_130px_1fr] min-w-[1000px] gap-2 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark">
            <span>CODE</span>
            <span>INTITULÉ</span>
            <span className="text-right">ÉCRITURES</span>
            <span className="text-right">LIGNES</span>
            <span className="text-right">BROUILLARD</span>
            <span className="text-right">CLÔTURE</span>
            <span className="text-right">DÉBIT</span>
            <span>SÉQUENCE DES PIÈCES</span>
          </div>
          {analyse.lignes.map((l) => (
            <div
              key={l.journalId}
              className="grid grid-cols-[70px_minmax(160px,1fr)_90px_90px_90px_90px_130px_1fr] min-w-[1000px] gap-2 px-3.5 py-1 text-[11px] border-b border-border/40"
            >
              <span className="font-mono">{l.code}</span>
              <span className="truncate">{l.intitule}</span>
              <span className="text-right font-mono">{l.nombreEcritures}</span>
              <span className="text-right font-mono text-text-dim">{l.nombreLignes}</span>
              <span className={`text-right font-mono ${l.enBrouillard > 0 ? 'text-warning font-bold' : 'text-text-dim'}`}>
                {l.enBrouillard}
              </span>
              <span className="text-right font-mono text-text-dim">{l.deCloture}</span>
              <span className="text-right font-mono">{montant(l.debit)}</span>
              <span className="text-[10.5px]" title={l.sequence.explication}>
                {l.sequence.manquants === null ? (
                  <span className="text-text-dim">non applicable</span>
                ) : l.sequence.manquants === 0 ? (
                  <span className="text-text-dim">continue</span>
                ) : (
                  <span className="text-danger font-semibold">
                    {l.sequence.manquants} numéro{l.sequence.manquants > 1 ? 's' : ''} manquant
                    {l.sequence.manquants > 1 ? 's' : ''} · {listerTrous(l.sequence.trous)}
                  </span>
                )}
              </span>
            </div>
          ))}

          {/*
            LA SÉQUENCE DU DOSSIER n'apparaît que si un journal est en
            numérotation continue sur le fichier · c'est le seul niveau où ses
            trous ont un sens, et l'afficher ailleurs laisserait croire à un
            contrôle qui n'a pas eu lieu.
          */}
          {analyse.sequenceDuDossier.applicable && (
            <div
              className={`px-3.5 py-2 text-[10.5px] border-t border-border ${
                analyse.sequenceDuDossier.manquants > 0 ? 'bg-danger-soft' : ''
              }`}
            >
              <strong>Séquence du dossier · </strong>
              {analyse.sequenceDuDossier.manquants === 0
                ? 'continue, aucun numéro manquant.'
                : `${analyse.sequenceDuDossier.manquants} numéro(s) manquant(s) : ${listerTrous(analyse.sequenceDuDossier.trous)}.`}{' '}
              <span className="text-text-dim">{analyse.sequenceDuDossier.explication}</span>
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-text-dim">
        Ces deux états sont des outils de RELECTURE d'OmegaX. Aucun texte comptable ne les régit et ils ne se déposent
        nulle part. Le palmarès classe sur le MOUVEMENT de l'exercice, report à-nouveau exclu · un compte de trésorerie
        soldé à zéro peut y être premier. L'analyse des journaux ne rend aucun contrôle d'équilibre : chaque écriture
        étant équilibrée et rattachée à un seul journal, débit égale crédit y est vrai par construction.
      </p>
    </div>
  );
}
