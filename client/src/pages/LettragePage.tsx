import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Compte, EtatLettrage, GroupeLettrage } from '../lib/types';
import { Aide } from '../components/chrome/Aide';

/**
 * Interrogation et lettrage · modèle du chapitre 6 des Notes de cours
 * d'organisation comptable du CPCC.
 *
 * Trois choses que l'écran doit rendre visibles, parce qu'elles changent la
 * lecture du compte :
 *
 *  1. Un groupe PARTIEL n'est pas un groupe soldé. Son code s'affiche en
 *     minuscules, ses lignes restent sélectionnables pour être complétées, et
 *     le solde restant est écrit noir sur blanc.
 *  2. L'ORIGINE du rapprochement. Un groupe apparié par référence de pièce
 *     s'appuie sur une donnée saisie ; un groupe apparié par montant est une
 *     présomption du logiciel. Un auditeur doit pouvoir les distinguer.
 *  3. Le VERROU. Un lettrage verrouillé ne se défait plus, ce qui est tout
 *     l'intérêt d'un rapprochement présenté à un tiers.
 */

const LIBELLE_ORIGINE: Record<GroupeLettrage['origine'], string> = {
  MANUEL: 'manuel',
  AUTOMATIQUE_PIECE: 'auto · référence de pièce',
  AUTOMATIQUE_MONTANT: 'auto · montant',
};

const GRILLE = 'grid grid-cols-[26px_70px_46px_1.3fr_96px_96px_100px_78px] gap-2.5';

export function LettragePage({ compteId: compteIdProp }: { compteId?: string } = {}) {
  // `compteId` arrive en propriété quand la page est montée comme FENÊTRE
  // (cas courant depuis le passage au multi-fenêtres : plusieurs
  // interrogations peuvent être ouvertes en même temps, et l'URL ne décrit
  // que la fenêtre active · elle ne peut donc pas servir de source à toutes).
  // Le repli sur `useParams` garde la page utilisable par une route directe.
  const params = useParams<{ compteId: string }>();
  const compteId = compteIdProp ?? params.compteId;
  const navigate = useNavigate();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [etat, setEtat] = useState<EtatLettrage | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [autoriserPartiel, setAutoriserPartiel] = useState(false);
  // Groupe partiel que la sélection viendra compléter · null = créer un
  // nouveau groupe.
  const [completerId, setCompleterId] = useState<string | null>(null);

  const charger = async () => {
    if (!compteId) return;
    try {
      const [tousComptes, resultat] = await Promise.all([
        api.get<Compte[]>('/comptes'),
        api.get<EtatLettrage>(`/comptes/${compteId}/lettrage`),
      ]);
      setComptes(tousComptes.filter((c) => c.typeCompte === 'DETAIL' && c.estActif));
      setEtat(resultat);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger le lettrage');
    }
  };

  useEffect(() => {
    setSelection(new Set());
    setCompleterId(null);
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteId]);

  const lignes = etat?.lignes ?? null;
  const compte = etat?.compte ?? null;
  const groupes = etat?.lettrages ?? [];
  const partiels = groupes.filter((g) => g.statut === 'PARTIEL');

  const basculerSelection = (id: string) => {
    setSelection((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const lignesSelectionnees = (lignes ?? []).filter((l) => selection.has(l.id));
  const soldeSelection = lignesSelectionnees.reduce((s, l) => s + l.debit - l.credit, 0);
  const soldeNul = Math.abs(soldeSelection) < 0.005;
  // Compléter un groupe : une seule ligne suffit. Créer un groupe : deux au
  // moins, et le solde doit être nul sauf si le partiel est demandé.
  const peutValider = completerId
    ? lignesSelectionnees.length >= 1
    : lignesSelectionnees.length >= 2 && (soldeNul || autoriserPartiel);

  const executer = async (action: () => Promise<string>) => {
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setInfo(await action());
      setSelection(new Set());
      setCompleterId(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Opération impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const valider = () =>
    executer(async () => {
      if (completerId) {
        const r = await api.post<{ lettre: string; statut: string; solde: number; nombreLignes: number }>(
          `/comptes/${compteId}/lettrage/${completerId}/completer`,
          { ligneIds: [...selection] },
        );
        return r.statut === 'SOLDE'
          ? `Lettrage ${r.lettre} soldé · ${r.nombreLignes} ligne(s).`
          : `Lettrage ${r.lettre} complété, il reste ${r.solde.toLocaleString('fr-FR')} à solder.`;
      }
      const r = await api.post<{ lettre: string; statut: string; solde: number; ecartChange: number | null; nombreLignes: number }>(
        `/comptes/${compteId}/lettrage`,
        { ligneIds: [...selection], autoriserPartiel },
      );
      const change = r.ecartChange !== null && r.ecartChange !== 0
        ? ` Écart de change réalisé : ${r.ecartChange.toLocaleString('fr-FR')}.`
        : '';
      return r.statut === 'SOLDE'
        ? `${r.nombreLignes} ligne(s) lettrées (${r.lettre}).${change}`
        : `Lettrage partiel ${r.lettre} créé · il reste ${r.solde.toLocaleString('fr-FR')} à solder.`;
    });

  const delettrer = (code: string) =>
    executer(async () => {
      await api.delete(`/comptes/${compteId}/lettrage/${code.toUpperCase()}`);
      return `Lettrage ${code.toUpperCase()} annulé.`;
    });

  const basculerVerrou = (g: GroupeLettrage) =>
    executer(async () => {
      await api.post(`/comptes/${compteId}/lettrage/${g.id}/verrou`, { verrouille: !g.verrouille });
      return g.verrouille ? `Lettrage ${g.code} déverrouillé.` : `Lettrage ${g.code} verrouillé.`;
    });

  const lancerLettrageAuto = () =>
    executer(async () => {
      const r = await api.post<{ groupes: number; parPiece: number; parMontant: number; lettres: string[] }>(
        `/comptes/${compteId}/lettrage/auto`,
        {},
      );
      if (r.groupes === 0) return 'Aucun rapprochement trouvé sur ce compte.';
      return (
        `${r.groupes} groupe(s) lettré(s) : ${r.parPiece} par référence de pièce, ` +
        `${r.parMontant} par montant (${r.lettres.join(', ')}).`
      );
    });

  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-2">
      <div className="flex items-end justify-between max-w-[1040px] mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[9.5px] font-mono text-text-dim leading-none">TRAITEMENT</div>
          <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
            <span>
              Interrogation et lettrage
              {compte && (
                <>
                  {' · '}
                  <span className="font-mono">{compte.numero}</span> {compte.intitule}
                </>
              )}
            </span>
            <Aide sujet="lettrage" />
          </h1>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">COMPTE À CONSULTER</span>
            <select
              value={compteId ?? ''}
              onChange={(e) => e.target.value && navigate(`/comptes/${e.target.value}/lettrage`)}
              className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] font-mono min-w-[280px]"
            >
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} · {c.intitule}
                  {c.lettrable ? '' : ' (non lettrable)'}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={lancerLettrageAuto}
            disabled={envoi || !compte?.lettrable}
            title="Apparie d'abord par référence de pièce, puis par montant"
            className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px] disabled:opacity-50"
          >
            Lettrage automatique
          </button>
        </div>
      </div>

      {compte && !compte.lettrable && (
        <div className="text-[12px] bg-warning-soft border border-warning/40 px-3 py-2 mb-3 max-w-[860px]">
          Ce compte n'est pas ouvert au lettrage. Le référentiel laisse à l'entité « la liberté de définir la liste des
          comptes auxquels s'applique le lettrage » : ouvrez-le depuis le plan comptable si vous souhaitez y rapprocher
          des mouvements.
        </div>
      )}
      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[860px]">{erreur}</div>}
      {info && <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[860px]">{info}</div>}

      {!lignes && <div className="text-[12px] text-text-dim">Chargement…</div>}

      {lignes && (
        <div className="border border-border bg-surface shadow-posee max-w-[1040px]">
          <div className={`${GRILLE} px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim`}>
            <span />
            <span>DATE</span>
            <span>JRN</span>
            <span>LIBELLÉ ÉCRITURE</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span className="text-right">SOLDE PROGR.</span>
            <span>LETTRAGE</span>
          </div>
          {(() => {
            let cumul = 0;
            return lignes.map((l) => {
              cumul += l.debit - l.credit;
              const soldeProgressif = Math.round(cumul * 100) / 100;
              const groupe = groupes.find((g) => g.id === l.lettrageId);
              const soldee = groupe?.statut === 'SOLDE';
              return (
                <div
                  key={l.id}
                  className={`${GRILLE} px-3.5 py-[4px] items-center border-b border-border/50 last:border-b-0 text-[11.5px] ${
                    selection.has(l.id) ? 'bg-sel-soft' : soldee ? 'opacity-60' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    // Une ligne soldée est close. Une ligne d'un groupe
                    // PARTIEL reste ouverte, mais elle est déjà rattachée :
                    // on la solde en complétant son groupe, pas en la
                    // resélectionnant ailleurs.
                    disabled={!!l.lettrageId}
                    checked={selection.has(l.id)}
                    onChange={() => basculerSelection(l.id)}
                  />
                  <span className="font-mono text-[10.5px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
                  <span className="font-mono text-text-dim">{l.journalCode}</span>
                  <span className="truncate" title={l.reference ? `Pièce ${l.reference}` : undefined}>
                    {l.libelle}
                    {l.devise && (
                      <span className="ml-1.5 text-[10px] text-text-dim font-mono">
                        {l.montantDevise?.toLocaleString('fr-FR')} {l.devise}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-right">{l.debit ? montant(l.debit) : ''}</span>
                  <span className="font-mono text-right">{l.credit ? montant(l.credit) : ''}</span>
                  <span className="font-mono text-right font-semibold">{montant(soldeProgressif)}</span>
                  <span className="flex items-center gap-1">
                    {l.codeLettrage && (
                      <>
                        <span
                          className={`font-mono text-[10.5px] font-bold ${soldee ? 'text-sel' : 'text-warning'}`}
                          title={soldee ? 'Lettrage soldé' : 'Lettrage partiel · la ligne reste ouverte pour le solde'}
                        >
                          {l.codeLettrage}
                        </span>
                        {groupe?.verrouille && <span title="Lettrage verrouillé">🔒</span>}
                      </>
                    )}
                  </span>
                </div>
              );
            });
          })()}
          {lignes.length === 0 && <div className="p-3 text-[12px] text-text-dim">Aucun mouvement sur ce compte.</div>}
          {lignes.length > 0 && (
            <div className={`${GRILLE} px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold`}>
              <span className="col-span-3" />
              <span className="text-right text-[10px] text-text-dim self-center">TOTAL MOUVEMENTS · SOLDE</span>
              <span className="font-mono text-right">{montant(lignes.reduce((t, l) => t + l.debit, 0))}</span>
              <span className="font-mono text-right">{montant(lignes.reduce((t, l) => t + l.credit, 0))}</span>
              <span className="font-mono text-right">{montant(lignes.reduce((t, l) => t + l.debit - l.credit, 0))}</span>
              <span />
            </div>
          )}
        </div>
      )}

      {lignes && lignes.length > 0 && compte?.lettrable && (
        <div className="mt-3 max-w-[1040px] border border-border bg-surface px-3.5 py-2.5">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[11.5px] text-text-dim">
              {lignesSelectionnees.length} ligne(s) sélectionnée(s) · solde{' '}
              <span className={soldeNul ? 'text-positive font-semibold' : 'text-warning font-semibold'}>
                {montant(soldeSelection)}
              </span>
            </span>

            {partiels.length > 0 && (
              <label className="flex items-center gap-1.5 text-[11.5px]">
                Compléter
                <select
                  value={completerId ?? ''}
                  onChange={(e) => setCompleterId(e.target.value || null)}
                  className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] font-mono"
                >
                  <option value="">un nouveau lettrage</option>
                  {partiels.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · reste {montant(g.solde)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!completerId && (
              <label className="flex items-center gap-1.5 text-[11.5px]" title="« La somme des montants lettrés au débit peut être égale, supérieure ou inférieure à celle des montants lettrés au crédit » (CPCC, ch. 6)">
                <input type="checkbox" checked={autoriserPartiel} onChange={(e) => setAutoriserPartiel(e.target.checked)} />
                Lettrage partiel (règlement d'acompte)
              </label>
            )}

            <button
              onClick={valider}
              disabled={!peutValider || envoi}
              className="bg-sel text-white text-[12px] font-semibold px-3 py-1.5 disabled:opacity-40"
            >
              {envoi ? 'Lettrage…' : completerId ? 'Compléter le lettrage' : 'Lettrer la sélection'}
            </button>
          </div>
        </div>
      )}

      {groupes.length > 0 && (
        <div className="mt-3 max-w-[1040px] border border-border bg-surface">
          <div className="px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim">
            LETTRAGES DE CE COMPTE
          </div>
          <div className="grid grid-cols-[60px_90px_110px_150px_110px_1fr_130px] gap-2.5 px-3.5 py-1.5 border-b border-border text-[10px] font-bold text-text-dim">
            <span>CODE</span>
            <span>STATUT</span>
            <span className="text-right">RESTE À SOLDER</span>
            <span>ORIGINE</span>
            <span className="text-right">ÉCART DE CHANGE</span>
            <span>POSÉ LE</span>
            <span />
          </div>
          {groupes.map((g) => (
            <div
              key={g.id}
              className="grid grid-cols-[60px_90px_110px_150px_110px_1fr_130px] gap-2.5 px-3.5 py-1 items-center border-b border-border/50 last:border-b-0 text-[11.5px]"
            >
              <span className={`font-mono font-bold ${g.statut === 'SOLDE' ? 'text-sel' : 'text-warning'}`}>{g.code}</span>
              <span className="text-[10.5px]">{g.statut === 'SOLDE' ? 'Soldé' : 'Partiel'}</span>
              <span className="font-mono text-right">{g.statut === 'SOLDE' ? '·' : montant(g.solde)}</span>
              <span className="text-[10.5px] text-text-dim">{LIBELLE_ORIGINE[g.origine]}</span>
              <span className="font-mono text-right text-[10.5px]" title={g.ecartChange === null ? "Aucune ligne en devise, ou position non dénouée en devise · ce n'est pas zéro" : undefined}>
                {g.ecartChange === null ? '·' : montant(g.ecartChange)}
              </span>
              <span className="text-[10.5px] text-text-dim">
                {new Date(g.createdAt).toLocaleDateString('fr-FR')} · {g.createdBy}
              </span>
              <span className="flex items-center gap-2 justify-end">
                <button onClick={() => basculerVerrou(g)} disabled={envoi} className="text-[10.5px] hover:underline">
                  {g.verrouille ? 'Déverrouiller' : 'Verrouiller'}
                </button>
                <button
                  onClick={() => delettrer(g.code)}
                  disabled={envoi || g.verrouille}
                  title={g.verrouille ? 'Lettrage verrouillé' : 'Défaire ce lettrage'}
                  className="text-[10.5px] text-danger hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Délettrer
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
