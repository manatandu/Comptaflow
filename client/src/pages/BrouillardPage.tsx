import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { Compte, EtatBrouillard, Journal, LigneBrouillard, ResultatValidation } from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { PortailModale } from '../components/PortailModale';

/**
 * BROUILLARD · État → Brouillard de Sage 100 i7 : « un document qui permet de
 * conserver une trace écrite des saisies faites sur une période ou un
 * journal ». Ici, il fait un peu plus que conserver une trace, il donne le
 * bouton qui fait entrer les écritures au livre-journal.
 *
 * La colonne ANCIENNETÉ est la part réglementaire de cet écran, et son délai
 * N'EST PAS LE MÊME DANS LES DEUX RÉFÉRENTIELS · le serveur le calcule et
 * l'écran l'affiche, il n'est écrit en dur nulle part ici :
 *
 *  · SYCEBNL, Partie 2 ch. 2 · « les données des documents auxiliaires sont
 *    centralisées AU MOINS CHAQUE SEMAINE dans le journal ou le grand-livre » ;
 *  · AUDCIF, art. 19 · « les totaux de ces supports sont périodiquement et AU
 *    MOINS UNE FOIS PAR MOIS centralisés dans le livre-journal et le
 *    grand-livre ».
 *
 * Au-delà du délai applicable, une écriture qui séjourne au brouillard n'est
 * plus un document de travail, c'est un retard de centralisation · le logiciel
 * le dit au lieu de le taire.
 *
 * Sage, lui, se contente d'exiger qu'un journal soit imprimé avant d'être
 * clôturé. C'est moins exigeant, et sans rapport avec un délai.
 */

type LigneOrigine = LigneBrouillard['lignes'][number];

/** Une ligne en cours de modification · l'origine garde tout ce que l'écran ne montre pas. */
interface LigneEditee {
  origine: LigneOrigine | null;
  compteId: string;
  numero: string;
  libelle: string;
  debit: string;
  credit: string;
}

interface EcritureEditee {
  id: string;
  numeroPiece: number | null;
  journal: string;
  date: string;
  libelle: string;
  reference: string;
  lignes: LigneEditee[];
}

function lireMontant(s: string): number {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Le corps du PATCH, avec les MÊMES clés que la saisie. Le serveur remplace
 * les lignes en bloc : tout ce que la ligne portait (taux de TVA, échéance,
 * date de versement, devise, ventilation) est renvoyé tel quel, sans quoi la
 * correction d'un libellé effacerait une facture en dollars ou sortirait une
 * dépense de son projet. Une ventilation qui couvrait la ligne entière suit le
 * nouveau montant, comme à la saisie (une section par axe) ; une ventilation
 * partielle reste telle quelle, et le serveur refuse si elle ne boucle plus.
 */
function corpsModification(e: EcritureEditee) {
  return {
    date: e.date,
    libelle: e.libelle,
    reference: e.reference,
    lignes: e.lignes.map((l) => {
      const debit = lireMontant(l.debit);
      const credit = lireMontant(l.credit);
      const o = l.origine;
      const ventilations = (o?.ventilations ?? []).map((v) =>
        v.debit === o!.debit && v.credit === o!.credit
          ? { sectionId: v.sectionId, debit: debit || undefined, credit: credit || undefined }
          : { sectionId: v.sectionId, debit: v.debit || undefined, credit: v.credit || undefined },
      );
      return {
        compteId: l.compteId,
        libelle: l.libelle || undefined,
        debit: debit || undefined,
        credit: credit || undefined,
        tauxTvaId: o?.tauxTvaId ?? undefined,
        dateEcheance: o?.dateEcheance ?? undefined,
        dateVersement: o?.dateVersement ?? undefined,
        deviseId: o?.deviseId ?? undefined,
        montantDevise: o?.montantDevise ?? undefined,
        coursApplique: o?.coursApplique ?? undefined,
        ...(ventilations.length > 0 ? { ventilations } : {}),
      };
    }),
  };
}

function montant(n: number): string {
  return n !== 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function BrouillardPage() {
  // Valider est retiré à l'aide-comptable · il supprime encore ses brouillons.
  const { utilisateur, peutEcrire, peutValider } = useAuth();
  const { exerciceCourant } = useExercice();
  const [etat, setEtat] = useState<EtatBrouillard | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [deplie, setDeplie] = useState<Set<string>>(new Set());
  const [dateLimite, setDateLimite] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [edition, setEdition] = useState<EcritureEditee | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [comptes, setComptes] = useState<Compte[] | null>(null);

  const charger = async () => {
    if (!exerciceCourant) return;
    try {
      const r = await api.get<EtatBrouillard>(
        `/ecritures/brouillard?exerciceId=${exerciceCourant.id}${journalId ? `&journalId=${journalId}` : ''}`,
      );
      setEtat(r);
      setSelection(new Set());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    api.get<Journal[]>('/journaux').then(setJournaux, () => setJournaux([]));
  }, []);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id, journalId]);

  useEffect(() => {
    if (exerciceCourant && !dateLimite) setDateLimite(new Date().toISOString().slice(0, 10));
  }, [exerciceCourant, dateLimite]);

  const basculer = (id: string) =>
    setSelection((prev) => {
      const suivante = new Set(prev);
      if (suivante.has(id)) suivante.delete(id);
      else suivante.add(id);
      return suivante;
    });

  const selectionnables = useMemo(() => (etat?.lignes ?? []).filter((l) => l.equilibree), [etat]);

  /**
   * CE QUE L'ÉCRAN DIT APRÈS UNE VALIDATION, et pourquoi ce n'est pas un
   * simple compteur.
   *
   * L'ancienne phrase de `validerJusqua` annonçait « Rien à valider jusqu'à
   * cette date. » dès que `validees` valait zéro. Avec le double regard, c'est
   * le mensonge le plus exact possible : le brouillard est PLEIN, il vient
   * d'être refusé en entier, et l'écran annonce qu'il est vide. Le comptable
   * croit sa période centralisée, l'AUDCIF art. 22, 2° la veut faite « au
   * terme de chaque période qui ne peut excéder un mois », et rien ne le
   * détrompera avant la clôture.
   *
   * Le compteur des écartées passe donc AVANT le cas vide, et le motif sourcé
   * le suit.
   */
  const phraseValidation = (r: ResultatValidation, siRienAFaire?: string) => {
    if (r.refuseesSecondRegard > 0) {
      return (
        `${r.validees} écriture(s) entrée(s) au livre-journal, ` +
        `${r.refuseesSecondRegard} écartée(s). ${r.motifRefus ?? ''}`
      );
    }
    if (r.validees === 0 && siRienAFaire) return siRienAFaire;
    const visa = r.sousDerogation > 0 ? ' Second regard nominatif porté au journal.' : '';
    return `${r.validees} écriture(s) entrée(s) au livre-journal.${visa}`;
  };

  const validerSelection = async () => {
    if (selection.size === 0) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<ResultatValidation>('/ecritures/valider', {
        ecritureIds: [...selection],
      });
      setInfo(phraseValidation(r));
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Validation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const validerJusqua = async () => {
    if (!exerciceCourant || !dateLimite) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<ResultatValidation>('/ecritures/valider-jusqua', {
        exerciceId: exerciceCourant.id,
        dateLimite,
        journalId: journalId || undefined,
      });
      setInfo(phraseValidation(r, 'Rien à valider jusqu’à cette date.'));
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Validation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * « Modifier » une écriture du brouillard (audit de l'interface du
   * 2026-09-27, I11) · la route existait sans geste, si bien qu'une erreur de
   * compte ou de montant imposait de supprimer la pièce et de la ressaisir, en
   * perdant son numéro. Seul le brouillard se modifie ; une écriture validée
   * passe par la correction (AUDCIF art. 20), et le serveur refuse une pièce
   * lettrée, pointée ou tenue par un module.
   */
  const ouvrirEdition = (l: LigneBrouillard) => {
    setErreurEdition(null);
    if (!comptes) api.get<Compte[]>('/comptes?typeCompte=DETAIL').then(setComptes, () => setComptes([]));
    setEdition({
      id: l.id,
      numeroPiece: l.numeroPiece,
      journal: l.journal,
      date: l.date,
      libelle: l.libelle,
      reference: l.reference ?? '',
      lignes: l.lignes.map((li) => ({
        origine: li,
        compteId: li.compteId,
        numero: li.compteNumero,
        libelle: li.libelle ?? '',
        debit: li.debit ? String(li.debit) : '',
        credit: li.credit ? String(li.credit) : '',
      })),
    });
  };

  const changerLigne = (i: number, champ: 'numero' | 'libelle' | 'debit' | 'credit', valeur: string) =>
    setEdition((e) => {
      if (!e) return e;
      const lignes = e.lignes.map((l, k) => {
        if (k !== i) return l;
        if (champ !== 'numero') return { ...l, [champ]: valeur };
        const trouve = (comptes ?? []).find((c) => c.numero === valeur.trim());
        return { ...l, numero: valeur, compteId: trouve?.id ?? '' };
      });
      return { ...e, lignes };
    });

  const totalEdition = (e: EcritureEditee) => ({
    debit: e.lignes.reduce((s, l) => s + lireMontant(l.debit), 0),
    credit: e.lignes.reduce((s, l) => s + lireMontant(l.credit), 0),
  });

  const enregistrerEdition = async (confirmerComptesEnSommeil = false) => {
    if (!edition) return;
    const inconnue = edition.lignes.findIndex((l) => !l.compteId);
    if (inconnue >= 0) {
      setErreurEdition(`Ligne ${inconnue + 1} : compte ${edition.lignes[inconnue].numero || 'vide'} introuvable au plan.`);
      return;
    }
    setEnvoi(true);
    setErreurEdition(null);
    try {
      const corps = {
        ...corpsModification(edition),
        ...(confirmerComptesEnSommeil ? { confirmerComptesEnSommeil: true } : {}),
      };
      await api.patch(`/ecritures/${edition.id}`, corps);
      setEdition(null);
      setInfo('Écriture du brouillard modifiée.');
      await charger();
    } catch (e) {
      setErreurEdition(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    setErreur(null);
    try {
      await api.delete(`/ecritures/${id}`);
      setInfo('Écriture supprimée du brouillard.');
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Suppression impossible');
    }
  };

  // 656 px de colonnes fixes + 8 gouttières de 8 px + 24 px de marges =
  // 744 px incompressibles, pour ~326 px utiles à 360 px · le `min-w` va de
  // pair avec le conteneur défilant posé plus bas, sans quoi les dernières
  // colonnes étaient ROGNÉES sans barre pour aller les chercher.
  const grille =
    'grid grid-cols-[28px_92px_60px_70px_1fr_120px_120px_96px_70px] min-w-[744px] gap-2';

  return (
    <div className="p-2">
      <EnteteImpression titre="Brouillard" />
      <div className="flex items-end justify-end mb-1.5 gap-3 flex-wrap">
        <div className="flex items-end gap-2.5 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-text-dim">Journal</span>
            <select
              value={journalId}
              onChange={(e) => setJournalId(e.target.value)}
              className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px] min-w-[170px]"
            >
              <option value="">Tous les journaux</option>
              {journaux.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.intitule}
                </option>
              ))}
            </select>
          </label>
          {peutValider && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-text-dim">Valider jusqu'au</span>
                <input
                  type="date"
                  value={dateLimite}
                  onChange={(e) => setDateLimite(e.target.value)}
                  className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px] font-mono"
                />
              </label>
              <button
                onClick={validerJusqua}
                disabled={envoi || !dateLimite}
                className="border border-border rounded-[3px] bg-surface px-3 py-1.5 text-[11.5px] font-semibold hover:bg-chrome-alt disabled:opacity-50"
              >
                Valider la période
              </button>
              <button
                onClick={validerSelection}
                disabled={envoi || selection.size === 0}
                className="bg-sel text-white text-[11.5px] font-bold px-3.5 py-1.5 rounded-[3px] hover:brightness-110 disabled:opacity-50"
              >
                Valider la sélection ({selection.size})
              </button>
            </>
          )}
          <span className="flex items-center gap-1.5 pb-1.5">
            <Aide sujet="brouillard" />
            <Aide
              titre="Brouillard et clôture"
              texte="La clôture de l'exercice refuse de s'exécuter tant qu'il reste quoi que ce soit au brouillard."
              source="Fin d'exercice"
            />
          </span>
        </div>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11.5px] text-danger bg-danger-soft border border-danger/30 rounded-[3px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[11.5px] text-positive bg-positive-soft border border-positive/30 rounded-[3px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      {etat && etat.totaux.enRetard > 0 && (
        <div className="mb-2.5 text-[11.5px] text-warning bg-warning-soft border border-warning/30 rounded-[3px] px-2.5 py-1.5 flex items-center gap-1.5">
          <strong>
            {etat.totaux.enRetard} écriture(s) séjournent au brouillard depuis plus de {etat.delaiCentralisationJours}{' '}
            jours.
          </strong>
          {utilisateur?.tenant.referentiel === 'SYSCOHADA' ? (
            <Aide
              titre="Retard de centralisation"
              texte="L'AUDCIF veut les journaux auxiliaires centralisés au moins une fois par mois dans le livre-journal et le grand-livre : au-delà, ce n'est plus un document de travail, c'est un retard de centralisation."
              source="AUDCIF, art. 19"
            />
          ) : (
            <Aide
              titre="Retard de centralisation"
              texte="Le SYCEBNL veut les journaux auxiliaires centralisés au moins chaque semaine dans le journal ou le grand-livre : au-delà, ce n'est plus un document de travail, c'est un retard de centralisation."
              source="SYCEBNL, Partie 2, ch. 2"
            />
          )}
        </div>
      )}
      {etat && etat.totaux.desequilibrees > 0 && (
        <div className="mb-2.5 text-[11.5px] text-danger bg-danger-soft border border-danger/30 rounded-[3px] px-2.5 py-2">
          {etat.totaux.desequilibrees} écriture(s) sont déséquilibrées et ne peuvent pas être validées. Reprenez-les
          dans la saisie.
        </div>
      )}

      <div className="bg-surface border border-border rounded-[4px] shadow-posee overflow-x-auto">
        <div
          className={`${grille} px-3 py-1.5 bg-chrome-alt border-b border-border text-[11px] font-bold text-text-dim`}
        >
          <span>
            {peutValider && (
              <input
                type="checkbox"
                checked={selection.size > 0 && selection.size === selectionnables.length}
                onChange={(e) =>
                  setSelection(e.target.checked ? new Set(selectionnables.map((l) => l.id)) : new Set())
                }
              />
            )}
          </span>
          <span>DATE</span>
          <span>JAL</span>
          <span>Pièce</span>
          <span>Libellé</span>
          <span className="text-right">Débit</span>
          <span className="text-right">Crédit</span>
          <span className="text-right">Ancienneté</span>
          <span />
        </div>

        {!etat && <div className="px-3 py-4 text-[11.5px] text-text-dim">Chargement…</div>}
        {etat?.lignes.map((l) => (
          <div key={l.id}>
            <div
              className={`${grille} px-3 py-1 text-[11.5px] items-center border-b border-border/40 ${
                !l.equilibree ? 'bg-danger-soft' : l.retardCentralisation ? 'bg-warning-soft' : ''
              }`}
            >
              <span>
                {peutValider && l.equilibree && (
                  <input type="checkbox" checked={selection.has(l.id)} onChange={() => basculer(l.id)} />
                )}
              </span>
              <span className="font-mono">{l.date}</span>
              <span className="font-mono">{l.journal}</span>
              <span className="font-mono text-text-dim">{l.numeroPiece ?? '·'}</span>
              <button
                onClick={() =>
                  setDeplie((prev) => {
                    const s = new Set(prev);
                    if (s.has(l.id)) s.delete(l.id);
                    else s.add(l.id);
                    return s;
                  })
                }
                className="text-left truncate hover:underline"
                title="Voir le détail des lignes"
              >
                {l.libelle}
                {l.reference && <span className="text-text-dim"> · {l.reference}</span>}
              </button>
              <span className="text-right font-mono">{montant(l.debit)}</span>
              <span className="text-right font-mono">{montant(l.credit)}</span>
              <span
                className={`text-right font-mono text-[11.5px] ${
                  l.retardCentralisation ? 'text-warning font-bold' : 'text-text-dim'
                }`}
              >
                {l.ancienneteJours} j
              </span>
              <span className="text-right whitespace-nowrap">
                {peutEcrire && (
                  <button
                    onClick={() => ouvrirEdition(l)}
                    title="Modifier la pièce au brouillard"
                    className="text-[11.5px] text-sel hover:underline mr-2"
                  >
                    Modifier
                  </button>
                )}
                {peutEcrire && (
                  <button
                    onClick={() => supprimer(l.id)}
                    title="Supprimer du brouillard"
                    className="text-[11.5px] text-danger/70 hover:text-danger"
                  >
                    Supprimer
                  </button>
                )}
              </span>
            </div>
            {deplie.has(l.id) &&
              l.lignes.map((li, i) => (
                <div
                  key={i}
                  className={`${grille} px-3 py-0.5 text-[11.5px] border-b border-border/30 bg-chrome-alt/50`}
                >
                  <span />
                  <span />
                  <span />
                  <span className="font-mono text-text-dim">{li.compteNumero}</span>
                  <span className="truncate text-text-dim">{li.libelle ?? li.compteIntitule}</span>
                  <span className="text-right font-mono">{montant(li.debit)}</span>
                  <span className="text-right font-mono">{montant(li.credit)}</span>
                  <span />
                  <span />
                </div>
              ))}
          </div>
        ))}

        {etat && etat.lignes.length === 0 && (
          <div className="px-3 py-5 text-[11.5px] text-text-dim italic">
            Le brouillard est vide : toutes les écritures de cet exercice sont entrées au livre-journal.
          </div>
        )}

        {etat && etat.lignes.length > 0 && (
          <div className={`${grille} px-3 py-1.5 bg-chrome border-t border-border text-[11.5px] font-bold`}>
            <span />
            <span />
            <span />
            <span />
            <span>{etat.totaux.nombre} écriture(s) en brouillard</span>
            <span className="text-right font-mono">{montant(etat.totaux.debit)}</span>
            <span className="text-right font-mono">{montant(etat.totaux.credit)}</span>
            <span />
            <span />
          </div>
        )}
        {/* Une tranche se dit (audit final F185) · les totaux ci-dessus portent
            tout le brouillard, la liste seulement ses premières écritures. */}
        {etat?.tronque && (
          <div className="px-3 py-1 text-[11px] text-text-dim">
            {etat.lignes.length} premières écritures sur {etat.totaux.nombre} · restreignez au journal pour les voir toutes.
          </div>
        )}
      </div>

      {edition && (
        <PortailModale>
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 anim-voile">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enregistrerEdition();
              }}
              className="w-full max-w-[760px] bg-surface border border-border rounded-[4px] overflow-hidden shadow-flottante anim-modale modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto"
            >
              <div className="h-[32px] flex items-center justify-between px-3 bg-surface text-text border-b border-border text-[11.5px]">
                <span>
                  Modifier la pièce {edition.journal} {edition.numeroPiece ?? ''}
                </span>
                <Aide
                  titre="Modifier au brouillard"
                  texte="Tant qu'elle n'est pas validée, une pièce se modifie : date, libellé, référence, comptes et montants. Le taux de TVA, l'échéance, la devise et la ventilation de chaque ligne sont conservés. Une pièce lettrée ou pointée se délettre ou se dépointe d'abord ; une pièce validée se corrige par inscription en négatif."
                  source="AUDCIF, art. 20 et 22"
                />
              </div>
              <div className="p-3 flex flex-col gap-2.5 text-[11.5px]">
                <div className="grid grid-cols-[140px_1fr_160px] gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-text-dim">Date</span>
                    <input
                      type="date"
                      required
                      value={edition.date}
                      onChange={(e) => setEdition({ ...edition, date: e.target.value })}
                      className="border border-border px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-text-dim">Libellé</span>
                    <input
                      required
                      value={edition.libelle}
                      onChange={(e) => setEdition({ ...edition, libelle: e.target.value })}
                      className="border border-border px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-text-dim">Référence</span>
                    <input
                      value={edition.reference}
                      onChange={(e) => setEdition({ ...edition, reference: e.target.value })}
                      className="border border-border px-2 py-1"
                    />
                  </label>
                </div>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left w-[110px]">Compte</th>
                      <th className="text-left">Libellé</th>
                      <th className="text-right w-[110px]">Débit</th>
                      <th className="text-right w-[110px]">Crédit</th>
                      <th className="w-[70px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {edition.lignes.map((l, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            value={l.numero}
                            onChange={(e) => changerLigne(i, 'numero', e.target.value)}
                            title={
                              (comptes ?? []).find((c) => c.id === l.compteId)?.intitule ??
                              l.origine?.compteIntitule ??
                              ''
                            }
                            className={`w-full border px-1.5 py-0.5 ${l.compteId ? 'border-border' : 'border-danger'}`}
                          />
                        </td>
                        <td>
                          <input
                            value={l.libelle}
                            onChange={(e) => changerLigne(i, 'libelle', e.target.value)}
                            className="w-full border border-border px-1.5 py-0.5"
                          />
                        </td>
                        <td>
                          <input
                            value={l.debit}
                            onChange={(e) => changerLigne(i, 'debit', e.target.value)}
                            className="w-full border border-border px-1.5 py-0.5 text-right"
                          />
                        </td>
                        <td>
                          <input
                            value={l.credit}
                            onChange={(e) => changerLigne(i, 'credit', e.target.value)}
                            className="w-full border border-border px-1.5 py-0.5 text-right"
                          />
                        </td>
                        <td className="text-right">
                          {edition.lignes.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setEdition({ ...edition, lignes: edition.lignes.filter((_, k) => k !== i) })}
                              className="text-danger/70 hover:text-danger"
                            >
                              Retirer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2}>
                        <button
                          type="button"
                          onClick={() =>
                            setEdition({
                              ...edition,
                              lignes: [
                                ...edition.lignes,
                                { origine: null, compteId: '', numero: '', libelle: '', debit: '', credit: '' },
                              ],
                            })
                          }
                          className="text-sel hover:underline"
                        >
                          Ajouter une ligne
                        </button>
                      </td>
                      <td className="text-right font-mono font-bold">{montant(totalEdition(edition).debit)}</td>
                      <td className="text-right font-mono font-bold">{montant(totalEdition(edition).credit)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
                {erreurEdition && (
                  <div className="text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5">
                    {erreurEdition}
                    {erreurEdition.startsWith('Compte en sommeil') && (
                      <button
                        type="button"
                        disabled={envoi}
                        onClick={() => void enregistrerEdition(true)}
                        className="ml-2 px-2 py-0.5 border border-border bg-surface text-text"
                      >
                        Confirmer la saisie sur le compte en sommeil
                      </button>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEdition(null)} className="border border-border px-3 py-1">
                    Abandonner
                  </button>
                  <button type="submit" disabled={envoi} className="bg-sel text-white font-semibold px-3.5 py-1 disabled:opacity-50">
                    Enregistrer
                  </button>
                </div>
              </div>
            </form>
          </div>
        </PortailModale>
      )}
    </div>
  );
}
