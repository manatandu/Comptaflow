import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';

type Statut = 'A_IMPRIMER' | 'IMPRIME' | 'ANNULE';

interface OrdreResume {
  id: string;
  numero: number;
  date: string;
  total: string | number;
  statut: Statut;
  nombreImpressions: number;
  journal: { code: string; intitule: string };
  _count: { lignes: number };
}

interface LigneOrdre {
  id: string;
  beneficiaire: string;
  banque: string;
  coordonnees: string;
  codeBic: string | null;
  montant: string | number;
  reference: string | null;
  pieceReglement: string;
  ecritureId: string | null;
}

interface Ordre extends Omit<OrdreResume, '_count'> {
  donneurBanque: string;
  donneurCoordonnees: string;
  donneurBic: string | null;
  premiereImpressionLe: string | null;
  premiereImpressionPar: string | null;
  annuleLe: string | null;
  annulePar: string | null;
  motifAnnulation: string | null;
  lignes: LigneOrdre[];
}

const fmt = (n: string | number) =>
  Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jour = (d: string) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' });

export const LIBELLE_STATUT: Record<Statut, string> = {
  A_IMPRIMER: "En attente d'impression",
  IMPRIME: 'Imprimé',
  ANNULE: 'Annulé',
};

/**
 * ORDRES DE VIREMENT · onglet de la fenêtre Règlement des tiers. L'ordre naît
 * avec ses pièces, « en attente d'impression » (Sage : « le règlement n'est
 * effectif qu'après impression »). L'impression est ENREGISTRÉE au serveur
 * avant d'ouvrir la boîte d'impression · c'est la première qui compte, les
 * suivantes sortent en duplicata. La maquette est celle d'OmegaX, aucune source
 * lue n'en décrivant une.
 */
export function OrdresVirement({ ordreInitial, onSelection }: { ordreInitial?: string | null; onSelection: (ouvert: boolean) => void }) {
  const { peutEcrire, utilisateur } = useAuth();
  const [ordres, setOrdres] = useState<OrdreResume[]>([]);
  const [ordre, setOrdre] = useState<Ordre | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = () =>
    api
      .get<OrdreResume[]>('/ordres-virement')
      .then(setOrdres)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Ordres illisibles'));

  const ouvrir = async (id: string) => {
    setErreur(null);
    try {
      setOrdre(await api.get<Ordre>(`/ordres-virement/${id}`));
      onSelection(true);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Ordre illisible');
    }
  };

  useEffect(() => {
    recharger();
    if (ordreInitial) ouvrir(ordreInitial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordreInitial]);

  const imprimer = async () => {
    if (!ordre) return;
    setErreur(null);
    try {
      const o = await api.post<Ordre>(`/ordres-virement/${ordre.id}/impression`, {});
      setOrdre(o);
      await recharger();
      // Le document à jour (mention « duplicata ») doit être rendu avant que
      // la boîte d'impression ne fige la page.
      window.setTimeout(() => window.print(), 50);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Impression non enregistrée');
    }
  };

  const annuler = async () => {
    if (!ordre) return;
    const motif = window.prompt(`Motif d'annulation de l'ordre n° ${ordre.numero} (obligatoire) :`);
    if (motif === null) return;
    setErreur(null);
    try {
      setOrdre(await api.post<Ordre>(`/ordres-virement/${ordre.id}/annulation`, { motif }));
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Annulation refusée');
    }
  };

  const fermer = () => {
    setOrdre(null);
    onSelection(false);
  };

  const tenant = utilisateur?.tenant;

  return (
    <>
      <div className="space-y-3">
        {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
        {!ordre && (
          <>
            {ordres.length === 0 ? (
              <p className="text-[11.5px] text-text-dim">
                Aucun ordre de virement. Cochez « Préparer un ordre de virement » en enregistrant des règlements fournisseurs.
              </p>
            ) : (
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1 w-[70px]">N°</th>
                    <th className="text-left px-2 py-1 w-[90px]">Date</th>
                    <th className="text-left px-2 py-1">Journal</th>
                    <th className="text-right px-2 py-1 w-[90px]">Virements</th>
                    <th className="text-right px-2 py-1 w-[130px]">Total</th>
                    <th className="text-left px-2 py-1 w-[170px]">État</th>
                  </tr>
                </thead>
                <tbody>
                  {ordres.map((o) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-[var(--a-50)]" onClick={() => ouvrir(o.id)}>
                      <td className="px-2 py-1">{o.numero}</td>
                      <td className="px-2 py-1">{jour(o.date)}</td>
                      <td className="px-2 py-1">
                        {o.journal.code} · {o.journal.intitule}
                      </td>
                      <td className="px-2 py-1 text-right">{o._count.lignes}</td>
                      <td className="px-2 py-1 text-right">{fmt(o.total)}</td>
                      <td className={`px-2 py-1 ${o.statut === 'A_IMPRIMER' ? 'text-warning font-semibold' : o.statut === 'ANNULE' ? 'text-text-dim' : ''}`}>
                        {LIBELLE_STATUT[o.statut]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {ordre && (
          <div className="space-y-2 text-[11.5px]">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={fermer} className="text-sel hover:underline">
                ← Tous les ordres
              </button>
              <span className="font-semibold">
                Ordre n° {ordre.numero} du {jour(ordre.date)} · {LIBELLE_STATUT[ordre.statut]}
              </span>
              {ordre.premiereImpressionLe && (
                <span className="text-text-dim">
                  imprimé le {new Date(ordre.premiereImpressionLe).toLocaleDateString('fr-FR')} par {ordre.premiereImpressionPar}
                  {ordre.nombreImpressions > 1 && ` · ${ordre.nombreImpressions} impressions`}
                </span>
              )}
              <Aide
                titre="Ordre de virement"
                texte="L'ordre reprend le RIB du journal de banque (donneur d'ordre) et le RIB principal de chaque fournisseur, recopiés à sa date. Il naît « en attente d'impression » ; la première impression est enregistrée avec sa date et son auteur, les suivantes sortent en duplicata. L'annuler exige un motif et libère les pièces de règlement, qui restent au journal. Montants en CDF, monnaie de tenue."
                source="Sage, Moyens de paiement · édition des ordres de paiement · maquette d'OmegaX"
              />
            </div>
            {ordre.statut === 'ANNULE' && (
              <div className="text-text-dim">
                Annulé le {ordre.annuleLe && new Date(ordre.annuleLe).toLocaleDateString('fr-FR')} par {ordre.annulePar} · {ordre.motifAnnulation}
              </div>
            )}
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1">Bénéficiaire</th>
                  <th className="text-left px-2 py-1">Banque et coordonnées</th>
                  <th className="text-left px-2 py-1 w-[110px]">Pièce</th>
                  <th className="text-right px-2 py-1 w-[130px]">Montant</th>
                </tr>
              </thead>
              <tbody>
                {ordre.lignes.map((l) => (
                  <tr key={l.id}>
                    <td className="px-2 py-1">{l.beneficiaire}</td>
                    <td className="px-2 py-1">
                      {l.banque} · {l.coordonnees}
                    </td>
                    <td className="px-2 py-1 text-text-dim">{l.pieceReglement}</td>
                    <td className="px-2 py-1 text-right">{fmt(l.montant)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={3} className="px-2 py-1">
                    Total
                  </td>
                  <td className="px-2 py-1 text-right">{fmt(ordre.total)}</td>
                </tr>
              </tbody>
            </table>
            {peutEcrire && ordre.statut !== 'ANNULE' && (
              <div className="flex gap-3">
                <button type="button" onClick={imprimer} className="bg-sel text-white font-semibold px-4 py-1.5">
                  {ordre.statut === 'A_IMPRIMER' ? 'Imprimer' : 'Réimprimer (duplicata)'}
                </button>
                <button type="button" onClick={annuler} className="text-danger hover:underline">
                  Annuler l'ordre
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* LE DOCUMENT REMIS À LA BANQUE · seul imprimé (le parent porte
          `avec-edition` tant qu'un ordre est ouvert). */}
      {ordre && ordre.statut !== 'ANNULE' && (
        <div className="impression-seul ordre-virement text-[12px] text-black">
          <div className="flex justify-between gap-6 mb-6">
            <div>
              <div className="font-bold uppercase">{tenant?.nom}</div>
              {tenant?.mentionsSociete && <div>{tenant.mentionsSociete}</div>}
              <div className="mt-2">Compte à débiter · {ordre.donneurBanque}</div>
              <div>{ordre.donneurCoordonnees}</div>
              {ordre.donneurBic && <div>BIC {ordre.donneurBic}</div>}
            </div>
            <div className="text-right">
              <div className="font-bold">À l'attention de {ordre.donneurBanque}</div>
            </div>
          </div>
          <div className="text-[15px] font-bold mb-1">
            ORDRE DE VIREMENT N° {ordre.numero}
            {ordre.nombreImpressions > 1 && ' · DUPLICATA'}
          </div>
          <div className="mb-4">du {jour(ordre.date)}</div>
          <p className="mb-3">
            Nous vous prions de bien vouloir effectuer, par le débit du compte ci-dessus, les virements suivants :
          </p>
          <table className="w-full border-collapse mb-3">
            <thead>
              <tr>
                <th className="border border-black text-left px-1.5 py-1">Bénéficiaire</th>
                <th className="border border-black text-left px-1.5 py-1">Banque</th>
                <th className="border border-black text-left px-1.5 py-1">Coordonnées bancaires</th>
                <th className="border border-black text-left px-1.5 py-1">Référence</th>
                <th className="border border-black text-right px-1.5 py-1">Montant</th>
              </tr>
            </thead>
            <tbody>
              {ordre.lignes.map((l) => (
                <tr key={l.id}>
                  <td className="border border-black px-1.5 py-1">{l.beneficiaire}</td>
                  <td className="border border-black px-1.5 py-1">{l.banque}</td>
                  <td className="border border-black px-1.5 py-1">
                    {l.coordonnees}
                    {l.codeBic && ` · BIC ${l.codeBic}`}
                  </td>
                  <td className="border border-black px-1.5 py-1">{l.reference ?? ''}</td>
                  <td className="border border-black px-1.5 py-1 text-right">{fmt(l.montant)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td colSpan={4} className="border border-black px-1.5 py-1">
                  Total ({ordre.lignes.length} virement{ordre.lignes.length > 1 ? 's' : ''})
                </td>
                <td className="border border-black px-1.5 py-1 text-right">{fmt(ordre.total)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mb-10">Montants exprimés en francs congolais (CDF).</div>
          <div className="flex justify-end">
            <div className="text-center w-[260px]">
              <div>Fait le ...................................</div>
              <div className="mt-2">Signature(s) autorisée(s)</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
