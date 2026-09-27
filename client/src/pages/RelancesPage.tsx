import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { BilanEmissionRelances, LettreRelance, NiveauRelance, PositionRelance, TypeRelance } from '../lib/types';
import { libelleRemise, phraseEmission, tonRemise } from '../lib/remise-courriel';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { HistoriqueRappels } from '../components/HistoriqueRappels';

/**
 * RAPPEL ET RELEVÉ · Traitement → Rappel/relevé chez Sage 100 i7, qui
 * distingue trois états : la relance préventive avant l'échéance, le rappel
 * gradué après, et le relevé de tout ce qui est dû.
 *
 * La structure est reprise, LE VOCABULAIRE DÉPEND DU RÉFÉRENTIEL · c'est ce
 * que cet écran ne faisait pas. Une EBNL ne relance pas des clients en retard :
 * elle rappelle à ses ADHÉRENTS (compte 411) une cotisation appelée et non
 * payée, et à ses clients-usagers (412) une facture due. Une entreprise, elle,
 * relance des CLIENTS (411 du plan SYSCOHADA), et son 412 ne porte pas des
 * clients-usagers mais des effets à recevoir en portefeuille · un effet en
 * portefeuille n'est pas un impayé.
 *
 * La colonne « Qualité » vient du serveur, qui la nomme selon le plan du
 * dossier (`qualiteDuCompte`, relances.service.ts). Les modèles de lettre
 * livrés, eux, sont volontairement NEUTRES et servent aux deux : ils
 * s'adressent au « cher {tiers} » et ne nomment ni cotisation ni facture.
 */

const ETATS: { valeur: TypeRelance; titre: string; description: string }[] = [
  {
    valeur: 'PREVENTIVE',
    titre: 'Relance préventive',
    description: "Ce qui n'est pas encore échu · une invitation à régler avant le terme.",
  },
  {
    valeur: 'RAPPEL',
    titre: 'Rappel',
    description: 'Les échéances non lettrées déjà en retard, avec un niveau qui monte.',
  },
  {
    valeur: 'RELEVE',
    titre: 'Relevé',
    description: "Tout ce qui est dû, échu ou non, sans gradation.",
  },
];

function montant(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PositionsRelances() {
  const { peutEcrire, utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const [type, setType] = useState<TypeRelance>('RAPPEL');
  const [positions, setPositions] = useState<PositionRelance[] | null>(null);
  const [niveaux, setNiveaux] = useState<NiveauRelance[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [niveauId, setNiveauId] = useState('');
  const [lettres, setLettres] = useState<LettreRelance[] | null>(null);
  const [deplie, setDeplie] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // RELEVÉ DE COMPTE (audit de l'interface du 2026-09-27, I12) · la fenêtre
  // s'intitule « Rappel et relevé » et la route du relevé n'était appelée
  // par rien. Rendu dans la fenêtre, pour que « Imprimer la fenêtre » le
  // sorte avec l'en-tête du dossier.
  const [releve, setReleve] = useState<(PositionRelance & { entite: string }) | null>(null);
  const ouvrirReleve = async (compteId: string) => {
    if (!exerciceCourant) return;
    setErreur(null);
    try {
      setReleve(
        await api.get<PositionRelance & { entite: string }>(
          `/relances/releve/${compteId}?exerciceId=${exerciceCourant.id}`,
        ),
      );
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Relevé indisponible');
    }
  };
  // Le motif saisi pour l'exclusion en cours, par compte · un seul champ
  // partagé mêlerait le motif d'un tiers à celui d'un autre.
  const [motifs, setMotifs] = useState<Record<string, string>>({});


  const charger = async () => {
    if (!exerciceCourant) return;
    try {
      setPositions(
        await api.get<PositionRelance[]>(`/relances?exerciceId=${exerciceCourant.id}&type=${type}`),
      );
      setSelection(new Set());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    api.get<NiveauRelance[]>('/relances/niveaux').then(
      (n) => {
        setNiveaux(n);
        setNiveauId((id) => id || n.find((x) => x.type === type)?.id || n[0]?.id || '');
      },
      () => setNiveaux([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    charger();
    setLettres(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, exerciceCourant?.id]);

  // LE NIVEAU SUIT L'ÉTAT AFFICHÉ (audit final F167) · un niveau préventif
  // choisi sur l'écran des rappels faisait recalculer l'émission sur l'état
  // préventif, où les comptes échus n'ont rien à réclamer.
  const niveauxDeLEtat = niveaux.filter((n) => n.type === type && n.estActif);
  useEffect(() => {
    setNiveauId((id) => (niveauxDeLEtat.some((n) => n.id === id) ? id : niveauxDeLEtat[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, niveaux]);

  const basculer = (id: string) =>
    setSelection((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const emettre = async () => {
    if (!exerciceCourant || selection.size === 0 || !niveauId) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<BilanEmissionRelances>('/relances/emettre', {
        exerciceId: exerciceCourant.id,
        compteIds: [...selection],
        niveauId,
      });
      setLettres(r.lettres);
      // LE SERVEUR DIT DEUX NOMBRES, L'ÉCRAN LES DIT AUSSI · « 20 courriers
      // préparés » laissait croire que vingt tiers avaient été touchés alors
      // que ceux qui n'ont pas d'adresse ne sont partis à personne.
      setInfo(phraseEmission(r));
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Émission impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const definirHorsRelance = async (tiersId: string, horsRelance: boolean, motif?: string) => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.patch(`/relances/tiers/${tiersId}/hors-relance`, { horsRelance, motif });
      setInfo(
        horsRelance
          ? "Tiers sorti du circuit de relance · sa créance reste due, et elle reste dans tous les états qui recensent l'ouvert."
          : 'Tiers remis dans le circuit de relance.',
      );
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const total = (positions ?? []).reduce((s, p) => s + p.montantDu, 0);
  // La grille est écrite EN TOUTES LETTRES dans chaque className plus bas ·
  // grilles-fixes-etroites.spec.ts lit les attributs JSX et NE SUIT PAS les
  // variables, si bien qu'une grille rangée dans une constante sortait du
  // relevé. C'est ce qui a laissé cette page rogner sa dernière colonne.
  const grille =
    'grid grid-cols-[28px_110px_1fr_110px_140px_90px_140px] min-w-[690px] gap-2';

  return (
    <div className="p-2">
      <EnteteImpression titre="Rappel et relevé" />
      <div className="flex items-end justify-end mb-1.5 gap-3 flex-wrap">
        {/* Le lexique s'aiguille tout seul sur le référentiel du dossier
            (`entreeLexique`) · l'entrée `relanceSyscohada` existe. */}
        <Aide sujet="relance" />
        {peutEcrire && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text-dim">NIVEAU</span>
              <select
                value={niveauId}
                onChange={(e) => setNiveauId(e.target.value)}
                className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px] min-w-[200px]"
              >
                {niveauxDeLEtat.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.niveau}. {n.libelle}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={emettre}
              disabled={envoi || selection.size === 0}
              className="bg-sel text-white text-[11.5px] font-bold px-3.5 py-1.5 rounded-[3px] hover:brightness-110 disabled:opacity-50"
            >
              Préparer les courriers ({selection.size})
            </button>
          </div>
        )}
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

      <div className="flex bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        {ETATS.map((e) => (
          <button
            key={e.valeur}
            onClick={() => setType(e.valeur)}
            title={e.description}
            className={`px-4 py-1.5 text-[11.5px] font-bold ${
              type === e.valeur ? 'bg-surface border-x border-border' : 'text-text-dim'
            }`}
          >
            {e.titre.toUpperCase()}
          </button>
        ))}
        <span className="ml-auto flex items-center px-2">
          <Aide
            titre={ETATS.find((e) => e.valeur === type)?.titre ?? ''}
            texte={ETATS.find((e) => e.valeur === type)?.description ?? ''}
            source="OmegaX"
          />
        </span>
      </div>

      {/* 618 px de colonnes + 6 gouttières de 8 px + 24 px de marges = 690 px
          incompressibles, pour ~326 px utiles à 360 px · sans ce conteneur, la
          colonne DERNIÈRE RELANCE était ROGNÉE et aucune barre ne permettait
          d'aller la chercher. */}
      <div className="border border-border bg-surface rounded-b-[10px] overflow-x-auto">
        <div className={`${grille} px-3 py-1.5 bg-chrome-alt border-b border-border text-[11px] font-bold text-text-dim`}>
          <span>
            {peutEcrire && positions && positions.length > 0 && (
              <input
                type="checkbox"
                // « Tout sélectionner » NE PREND JAMAIS un tiers hors
                // circuit · le cocher pour se le voir refuser à l'émission
                // serait proposer d'une main ce qu'on retire de l'autre.
                checked={
                  selection.size > 0 && selection.size === positions.filter((p) => !p.horsRelance).length
                }
                onChange={(e) =>
                  setSelection(
                    e.target.checked
                      ? new Set(positions.filter((p) => !p.horsRelance).map((p) => p.compteId))
                      : new Set(),
                  )
                }
              />
            )}
          </span>
          <span>COMPTE</span>
          <span>TIERS</span>
          <span>Qualité</span>
          <span className="text-right">Montant dû</span>
          <span className="text-right">RETARD</span>
          <span>Dernière relance</span>
        </div>

        {!positions && <div className="px-3 py-4 text-[11.5px] text-text-dim">Chargement…</div>}
        {positions?.map((p) => (
          <div key={p.compteId}>
            <div
              className={`${grille} px-3 py-1 text-[11.5px] items-center border-b border-border/40 ${
                p.retardMaxJours > 90 ? 'bg-danger-soft' : p.retardMaxJours > 30 ? 'bg-warning-soft' : ''
              }`}
            >
              <span>
                {peutEcrire && (
                  <input
                    type="checkbox"
                    disabled={p.horsRelance}
                    title={p.horsRelance ? 'Tiers hors du circuit de relance' : undefined}
                    checked={selection.has(p.compteId)}
                    onChange={() => basculer(p.compteId)}
                  />
                )}
              </span>
              <span className="font-mono">{p.numero}</span>
              <button
                onClick={() =>
                  setDeplie((prev) => {
                    const s = new Set(prev);
                    if (s.has(p.compteId)) s.delete(p.compteId);
                    else s.add(p.compteId);
                    return s;
                  })
                }
                className="text-left truncate hover:underline"
              >
                {p.tiersNom ?? (
                  <span className="text-text-dim italic">
                    {p.intitule} · aucun tiers rattaché
                  </span>
                )}
                {/* La lacune se voit AVANT le clic · le serveur sert
                    `tiersEmail` pour cela, et une lettre composée pour un
                    tiers sans adresse ne partira à personne. */}
                {p.tiersId && !p.tiersEmail && (
                  <span className="ml-1 text-[10.5px] text-warning font-semibold">sans adresse</span>
                )}
                {/* L'EXCLUSION SE VOIT, elle ne fait pas disparaître la ligne ·
                    un tiers hors circuit doit toujours, et une liste qui le
                    cacherait laisserait croire le poste apuré. */}
                {p.horsRelance && (
                  <span
                    className="ml-1 text-[10.5px] text-text-dim font-semibold border border-border px-1"
                    title={`Hors circuit de relance${p.horsRelanceDepuis ? ` depuis le ${new Date(p.horsRelanceDepuis).toLocaleDateString('fr-FR')}` : ''} · ${p.motifHorsRelance ?? ''}`}
                  >
                    hors circuit
                  </span>
                )}
              </button>
              <span className="text-[11.5px] text-text-dim">{p.qualite}</span>
              <span className="text-right font-mono font-semibold">{montant(p.montantDu)}</span>
              <span
                className={`text-right font-mono text-[11.5px] ${
                  p.retardMaxJours > 90 ? 'text-danger font-bold' : p.retardMaxJours > 0 ? 'text-warning' : 'text-text-dim'
                }`}
              >
                {p.retardMaxJours > 0 ? `${p.retardMaxJours} j` : `dans ${-p.retardMaxJours} j`}
              </span>
              <span className="text-[11.5px]">
                {p.derniereRelance ? (
                  <span className="text-text-dim">
                    niveau {p.derniereRelance.niveau} le {new Date(p.derniereRelance.date).toLocaleDateString('fr-FR')}
                  </span>
                ) : p.niveauSuggere ? (
                  <span className="text-sel font-semibold">niveau {p.niveauSuggere} conseillé</span>
                ) : (
                  ''
                )}
              </span>
            </div>
            {deplie.has(p.compteId) &&
              p.lignes.map((l, i) => (
                <div key={i} className={`${grille} px-3 py-0.5 text-[11.5px] bg-chrome-alt/50 border-b border-border/30`}>
                  <span />
                  <span className="font-mono text-text-dim">{l.echeance ?? l.date}</span>
                  <span className="truncate text-text-dim">{l.libelle}</span>
                  <span />
                  <span className="text-right font-mono">{montant(l.montant)}</span>
                  <span className="text-right font-mono text-text-dim">
                    {l.retardJours > 0 ? `${l.retardJours} j` : ''}
                  </span>
                  <span />
                </div>
              ))}
            {/* ----------------------------------------------------------------
                EXCLURE DU CIRCUIT, OU Y REMETTRE · l'action vit dans le détail
                déplié et non dans la ligne : c'est une décision de gestion, pas
                un tri d'affichage, et elle demande d'avoir lu ce que le tiers
                doit avant de renoncer à le lui rappeler.
                ---------------------------------------------------------------- */}
            {deplie.has(p.compteId) && (
              <div className="px-3 py-1.5 border-b border-border/30">
                <button
                  type="button"
                  onClick={() => (releve?.compteId === p.compteId ? setReleve(null) : void ouvrirReleve(p.compteId))}
                  className="border border-border-dark bg-chrome hover:bg-surface px-2 py-1 text-[11.5px]"
                >
                  {releve?.compteId === p.compteId ? 'Fermer le relevé' : 'Relevé de compte'}
                </button>
                {releve?.compteId === p.compteId && (
                  <table className="mt-2 w-full max-w-[640px] text-[11.5px] border-collapse">
                    <caption className="text-left font-semibold pb-1">
                      Relevé · {releve.tiersNom ?? releve.intitule} ({releve.numero})
                    </caption>
                    <thead>
                      <tr>
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">Échéance</th>
                        <th className="text-left px-2 py-1">Libellé</th>
                        <th className="text-right px-2 py-1">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {releve.lignes.map((l, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1">{l.date}</td>
                          <td className="px-2 py-1">{l.echeance ?? ''}</td>
                          <td className="px-2 py-1">{l.libelle}</td>
                          <td className="px-2 py-1 text-right">{montant(l.montant)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="px-2 py-1" colSpan={3}>
                          Total dû
                        </td>
                        <td className="px-2 py-1 text-right">{montant(releve.montantDu)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {deplie.has(p.compteId) && peutEcrire && p.tiersId && (
              <div className="px-3 py-2 bg-chrome-alt/50 border-b border-border/30 flex items-center gap-2 flex-wrap">
                {p.horsRelance ? (
                  <>
                    <span className="text-[11.5px] text-text-dim">
                      Hors circuit
                      {p.horsRelanceDepuis
                        ? ` depuis le ${new Date(p.horsRelanceDepuis).toLocaleDateString('fr-FR')}`
                        : ''}
                      {' · '}
                      <span className="italic">{p.motifHorsRelance}</span>
                    </span>
                    <button
                      type="button"
                      disabled={envoi}
                      onClick={() => definirHorsRelance(p.tiersId!, false)}
                      className="border border-border-dark bg-chrome hover:bg-surface px-2 py-1 text-[11.5px] disabled:opacity-50"
                    >
                      Remettre dans le circuit
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      value={motifs[p.compteId] ?? ''}
                      onChange={(e) => setMotifs((m) => ({ ...m, [p.compteId]: e.target.value }))}
                      placeholder="Pourquoi ce tiers sort du circuit (litige, échéancier convenu…)"
                      className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] flex-1 min-w-[220px]"
                    />
                    {/* LE MOTIF EST EXIGÉ, ici comme au serveur · une case
                        seule ne se relit pas, et au prochain examen personne
                        ne saura lever ni maintenir l'exclusion. */}
                    <button
                      type="button"
                      disabled={envoi || (motifs[p.compteId] ?? '').trim().length === 0}
                      onClick={() => definirHorsRelance(p.tiersId!, true, motifs[p.compteId])}
                      className="border border-border-dark bg-chrome hover:bg-surface px-2 py-1 text-[11.5px] disabled:opacity-40"
                    >
                      Exclure du circuit
                    </button>
                  </>
                )}
                <span className="text-[11px] text-text-dim">
                  L'exclusion ne porte que sur le COURRIER · la créance reste due et visible partout ailleurs.
                </span>
              </div>
            )}
          </div>
        ))}

        {positions && positions.length === 0 && (
          <div className="px-3 py-5 text-[11.5px] text-text-dim italic">
            {type === 'PREVENTIVE'
              ? utilisateur?.tenant.referentiel === 'SYSCOHADA'
                ? 'Aucune échéance à venir sur les comptes clients (41).'
                : "Aucune échéance à venir sur les comptes d'adhérents et de clients-usagers."
              : type === 'RAPPEL'
                ? 'Aucun retard de paiement. Tout ce qui est échu a été lettré.'
                : 'Rien de dû sur cet exercice.'}
          </div>
        )}

        {positions && positions.length > 0 && (
          <div className={`${grille} px-3 py-1.5 bg-chrome border-t border-border text-[11.5px] font-bold`}>
            <span />
            <span />
            <span>{positions.length} tiers</span>
            <span />
            <span className="text-right font-mono">{montant(total)}</span>
            <span />
            <span />
          </div>
        )}
      </div>

      {lettres && lettres.length > 0 && (
        <section className="mt-2.5 bg-surface border border-border rounded-[4px] shadow-posee overflow-hidden">
          <header className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between">
            <span className="text-[11.5px] font-bold">Courriers préparés</span>
            <button
              onClick={() => navigator.clipboard?.writeText(lettres.map((l) => l.texte).join('\n\n\n'))}
              className="border border-border rounded-[3px] bg-surface px-3 py-1 text-[11.5px] font-semibold hover:bg-chrome"
            >
              Tout copier
            </button>
          </header>
          {lettres.map((l) => (
            <article key={l.compteId} className="border-b border-border/40">
              <div className="px-3 py-1.5 bg-chrome text-[11.5px] font-semibold flex justify-between gap-2 flex-wrap">
                <span>{l.tiers}</span>
                <span className="font-mono">{montant(l.montant)}</span>
              </div>
              {/* CE QU'IL EST ADVENU DE CETTE LETTRE-LÀ · une lettre sans
                  destinataire reste une lettre juste, elle s'imprime et se
                  remet en main propre ; ce qui serait faux, c'est de laisser
                  croire qu'elle est partie. */}
              <div
                className={`px-3 py-1 text-[11px] border-b border-border/30 ${
                  tonRemise(l.remise) === 'manque'
                    ? 'bg-warning-soft text-warning'
                    : tonRemise(l.remise) === 'remis'
                      ? 'text-positive'
                      : 'text-text-dim'
                }`}
              >
                <span className="font-bold">{libelleRemise(l.remise)}</span>
                {l.remise.destinataire && <span> · {l.remise.destinataire}</span>}
                {l.remise.motif && <span> · {l.remise.motif}</span>}
              </div>
              <pre className="px-3 py-2 text-[11.5px] whitespace-pre-wrap font-sans leading-[1.6]">{l.texte}</pre>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * Les jetons que `RelancesService.composer` remplace · une seule liste, dite
 * dans la bulle du formulaire. `{date}` est le jour du courrier, `{echeance}`
 * l'échéance (audit final F166) · les confondre annonçait à un tiers une
 * échéance au jour même où la lettre partait.
 */
const AIDE_JETONS =
  '{tiers} le destinataire · {montant} le total réclamé · {date} le jour du courrier · ' +
  "{echeance} l'échéance la plus ancienne des lignes réclamées · {detail} les lignes, une par ligne · {entite} le nom du dossier.";

/**
 * NIVEAUX DE RELANCE (audit de l'interface du 2026-09-27, I11) · la page lisait
 * les niveaux semés sans pouvoir en créer ni en modifier, alors que les deux
 * routes existent, réservées à l'administrateur. Le numéro et le type ne se
 * changent pas après création (ModifierNiveauDto ne les porte pas) ; un niveau
 * se met en sommeil plutôt qu'il ne se supprime, aucune route ne supprimant.
 */
function NiveauxRelance() {
  const { estAdmin } = useAuth();
  const [niveaux, setNiveaux] = useState<NiveauRelance[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState({ libelle: '', joursApresEcheance: '', modeleTexte: '' });
  const [nouveau, setNouveau] = useState({
    niveau: '',
    libelle: '',
    type: 'RAPPEL' as TypeRelance,
    joursApresEcheance: '',
    modeleTexte: '',
  });

  const charger = async () => {
    try {
      setNiveaux(await api.get<NiveauRelance[]>('/relances/niveaux'));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };
  useEffect(() => {
    void charger();
  }, []);

  const creer = async () => {
    setErreur(null);
    try {
      await api.post('/relances/niveaux', {
        niveau: Number(nouveau.niveau),
        libelle: nouveau.libelle.trim(),
        type: nouveau.type,
        joursApresEcheance: Number(nouveau.joursApresEcheance),
        modeleTexte: nouveau.modeleTexte,
      });
      setNouveau({ niveau: '', libelle: '', type: 'RAPPEL', joursApresEcheance: '', modeleTexte: '' });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Création impossible');
    }
  };

  const modifier = async (id: string, corps: Record<string, unknown>) => {
    setErreur(null);
    try {
      await api.patch(`/relances/niveaux/${id}`, corps);
      setEdition(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  const champ = 'border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]';
  return (
    <div className="p-2 flex flex-col gap-2">
      {erreur && (
        <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 rounded-[3px] px-2.5 py-1.5">{erreur}</div>
      )}
      <table className="w-full text-[11.5px]">
        <thead>
          <tr>
            <th className="text-left">N°</th>
            <th className="text-left">Libellé</th>
            <th className="text-left">Type</th>
            <th className="text-right">Jours après échéance</th>
            <th className="text-left">État</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {niveaux?.map((n) => (
            <tr key={n.id} className={n.estActif ? '' : 'text-text-dim'}>
              <td>{n.niveau}</td>
              <td>
                {edition === n.id ? (
                  <div className="flex flex-col gap-1">
                    <input
                      value={brouillon.libelle}
                      onChange={(e) => setBrouillon((b) => ({ ...b, libelle: e.target.value }))}
                      className={champ}
                    />
                    <textarea
                      value={brouillon.modeleTexte}
                      onChange={(e) => setBrouillon((b) => ({ ...b, modeleTexte: e.target.value }))}
                      rows={4}
                      className={champ}
                    />
                  </div>
                ) : (
                  n.libelle
                )}
              </td>
              <td>{ETATS.find((e) => e.valeur === n.type)?.titre ?? n.type}</td>
              <td className="text-right">
                {edition === n.id ? (
                  <input
                    type="number"
                    value={brouillon.joursApresEcheance}
                    onChange={(e) => setBrouillon((b) => ({ ...b, joursApresEcheance: e.target.value }))}
                    className={`${champ} w-[80px] text-right`}
                  />
                ) : (
                  n.joursApresEcheance
                )}
              </td>
              <td>{n.estActif ? 'Actif' : 'En sommeil'}</td>
              <td className="text-right whitespace-nowrap">
                {estAdmin && edition === n.id && (
                  <>
                    <button
                      onClick={() =>
                        void modifier(n.id, {
                          libelle: brouillon.libelle.trim(),
                          joursApresEcheance: Number(brouillon.joursApresEcheance),
                          modeleTexte: brouillon.modeleTexte,
                        })
                      }
                      className="text-sel text-[11px] font-semibold hover:underline mr-2"
                    >
                      Enregistrer
                    </button>
                    <button onClick={() => setEdition(null)} className="text-[11px] hover:underline">
                      Annuler
                    </button>
                  </>
                )}
                {estAdmin && edition !== n.id && (
                  <>
                    <button
                      onClick={() => {
                        setEdition(n.id);
                        setBrouillon({
                          libelle: n.libelle,
                          joursApresEcheance: String(n.joursApresEcheance),
                          modeleTexte: n.modeleTexte,
                        });
                      }}
                      className="text-sel text-[11px] hover:underline mr-2"
                    >
                      Modifier
                    </button>
                    <button onClick={() => void modifier(n.id, { estActif: !n.estActif })} className="text-[11px] hover:underline">
                      {n.estActif ? 'Mettre en sommeil' : 'Réactiver'}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {estAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-text-dim">N°</span>
            <input
              type="number"
              value={nouveau.niveau}
              onChange={(e) => setNouveau((v) => ({ ...v, niveau: e.target.value }))}
              className={`${champ} w-[60px]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-text-dim">Libellé</span>
            <input
              value={nouveau.libelle}
              onChange={(e) => setNouveau((v) => ({ ...v, libelle: e.target.value }))}
              className={`${champ} w-[200px]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-text-dim">Type</span>
            <select
              value={nouveau.type}
              onChange={(e) => setNouveau((v) => ({ ...v, type: e.target.value as TypeRelance }))}
              className={champ}
            >
              {ETATS.map((e) => (
                <option key={e.valeur} value={e.valeur}>
                  {e.titre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-text-dim" title="Négatif pour une relance préventive">
              Jours après échéance
            </span>
            <input
              type="number"
              value={nouveau.joursApresEcheance}
              onChange={(e) => setNouveau((v) => ({ ...v, joursApresEcheance: e.target.value }))}
              className={`${champ} w-[90px]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-text-dim flex items-center gap-1">
              Modèle de lettre
              <Aide titre="Jetons du modèle" texte={AIDE_JETONS} source="OmegaX" />
            </span>
            <textarea
              value={nouveau.modeleTexte}
              onChange={(e) => setNouveau((v) => ({ ...v, modeleTexte: e.target.value }))}
              rows={2}
              className={`${champ} w-[320px]`}
            />
          </label>
          <button
            onClick={() => void creer()}
            disabled={!nouveau.niveau || !nouveau.libelle.trim() || nouveau.joursApresEcheance === '' || !nouveau.modeleTexte.trim()}
            className="bg-sel text-white text-[11.5px] font-bold px-3.5 py-1.5 rounded-[3px] hover:brightness-110 disabled:opacity-50"
          >
            Ajouter le niveau
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * DEUX VUES, UNE FENÊTRE · les positions à relancer, et l'historique de ce
 * qui a été émis (Sage, Historique des rappels · point 17). L'historique vit
 * ici plutôt qu'en entrée de menu propre : c'est la même matière, et le menu
 * Traitement est tenu sous son plafond à 360 px (chrome-etroit.spec.ts).
 */
export function RelancesPage() {
  const [vue, setVue] = useState<'positions' | 'historique' | 'niveaux'>('positions');
  return (
    <div>
      <div className="ecran-seul flex gap-1 px-2 pt-2" role="tablist">
        {(
          [
            ['positions', 'À relancer'],
            ['historique', 'Historique des rappels'],
            ['niveaux', 'Niveaux de relance'],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={vue === cle}
            onClick={() => setVue(cle)}
            className={`px-3 py-1 text-[11.5px] border-b-2 ${vue === cle ? 'border-sel font-semibold' : 'border-transparent text-text-dim'}`}
          >
            {libelle}
          </button>
        ))}
      </div>
      {vue === 'positions' && <PositionsRelances />}
      {vue === 'historique' && <div className="p-2"><HistoriqueRappels /></div>}
      {vue === 'niveaux' && <NiveauxRelance />}
    </div>
  );
}
