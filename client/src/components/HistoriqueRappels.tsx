import { Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Aide } from './chrome/Aide';
import { EnteteImpression, BoutonImprimer } from './chrome/EnteteImpression';
import type { Compte } from '../lib/types';
import { montant } from '../lib/montants';
import { motifAucunCompteRetenu, RETENUS } from '../lib/comptes-proposes';

/**
 * HISTORIQUE DES RAPPELS (point 17 de la comparaison Sage i7) · État / États
 * tiers / Historique des rappels chez Sage, « l'historique des rappels des
 * clients pour une période donnée », par comptes tiers. La route existait
 * depuis l'émission des relances ; aucun écran ne la lisait.
 *
 * Le montant est celui FIGÉ à l'émission · une relance réglée depuis garde ce
 * qu'elle réclamait. Une tranche se DIT (`tronque`), et le total vient du
 * périmètre entier.
 */
interface RelanceHistorique {
  id: string;
  dateRelance: string;
  montant: string | number;
  texte: string;
  compte: { numero: string; intitule: string };
  tiers: { nom: string } | null;
  niveauRelance: { niveau: number; libelle: string };
}

interface ReponseHistorique {
  relances: RelanceHistorique[];
  total: number;
  tronque: boolean;
  montantTotal: number;
}

export function HistoriqueRappels() {
  // Liste de choix (comptes retenus ou utilisés) · null tant qu'elle n'est pas lue.
  const [comptesLus, setComptesLus] = useState<Compte[] | null>(null);
  const [erreurComptes, setErreurComptes] = useState<string | null>(null);
  const comptes = comptesLus ?? [];
  const [compteId, setCompteId] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState<ReponseHistorique | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // Les comptes de tiers seulement · une relance ne vise qu'un compte de la classe 4.
    api
      .get<Compte[]>(`/comptes?typeCompte=DETAIL&${RETENUS}`)
      .then((cs) => setComptesLus(cs.filter((c) => c.numero.startsWith('4'))))
      // Un échec de lecture se dit · la liste « Tous » seule le taisait.
      .catch((e) => setErreurComptes(e instanceof ApiError ? e.message : 'serveur injoignable'));
  }, []);

  const charger = async () => {
    setErreur(null);
    const q = new URLSearchParams();
    if (compteId) q.set('compteId', compteId);
    if (du) q.set('du', du);
    if (au) q.set('au', au);
    try {
      setDonnees(await api.get<ReponseHistorique>(`/relances/historique?${q.toString()}`));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Lecture impossible');
    }
  };

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <EnteteImpression
        titre="Historique des rappels"
        sousTitre={du || au ? `Du ${du || '…'} au ${au || '…'}` : undefined}
      />
      <div className="ecran-seul flex items-end gap-2 flex-wrap mb-1.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-text-dim">COMPTE DE TIERS</span>
          <select
            value={compteId}
            onChange={(e) => setCompteId(e.target.value)}
            aria-label="Compte de tiers"
            className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px] min-w-[220px]"
          >
            <option value="">Tous</option>
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero} · {c.intitule}
              </option>
            ))}
          </select>
          {erreurComptes && <span className="text-[11px] text-danger">Comptes de tiers illisibles · {erreurComptes}</span>}
          {comptesLus && comptesLus.length === 0 && (
            <span className="text-[11px] text-warning">{motifAucunCompteRetenu(comptesLus, 'de tiers (classe 4)')}</span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-text-dim">DU</span>
          <input type="date" value={du} onChange={(e) => setDu(e.target.value)} aria-label="Du" className="border border-border px-2 py-1 text-[11.5px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-text-dim">AU</span>
          <input type="date" value={au} onChange={(e) => setAu(e.target.value)} aria-label="Au" className="border border-border px-2 py-1 text-[11.5px]" />
        </label>
        <button type="button" onClick={() => void charger()} className="bg-sel text-white px-4 py-1.5 text-[11.5px] font-semibold rounded-full">
          Afficher
        </button>
        <Aide
          titre="Historique des rappels"
          texte="Chaque relance émise, avec le montant qu'elle réclamait à la date de son émission · une relance réglée depuis garde ce montant. Sage y porte aussi frais d'impayé et pénalités de retard ; OmegaX n'en calcule aucun."
          source="Sage 100 i7 · État / États tiers / Historique des rappels"
        />
        <div className="flex-1" />
        <BoutonImprimer />
      </div>
      {erreur && <div className="mb-1.5 px-3 py-1.5 bg-danger-soft text-danger text-[11.5px]">{erreur}</div>}
      {donnees && (
        <div className="overflow-auto">
          <table className="w-full text-[11.5px] min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Compte</th>
                <th className="text-left">Tiers</th>
                <th className="text-left">Niveau</th>
                <th className="text-right">Montant réclamé</th>
              </tr>
            </thead>
            <tbody>
              {donnees.relances.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setOuvert((o) => (o === r.id ? null : r.id))}
                    className="cursor-pointer"
                    title="Afficher la lettre"
                  >
                    <td>{new Date(r.dateRelance).toLocaleDateString('fr-FR')}</td>
                    <td>{r.compte.numero}</td>
                    <td>{r.tiers?.nom ?? r.compte.intitule}</td>
                    <td>
                      {r.niveauRelance.niveau}. {r.niveauRelance.libelle}
                    </td>
                    <td className="text-right">{montant(Number(r.montant))}</td>
                  </tr>
                  {ouvert === r.id && (
                    <tr>
                      <td colSpan={5}>
                        <pre className="whitespace-pre-wrap font-sans text-[11.5px] leading-[1.6]">{r.texte}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {donnees.relances.length === 0 && (
                <tr>
                  <td colSpan={5} className="italic text-text-dim">
                    Aucune relance émise sur ce périmètre.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="total">
                <td colSpan={4}>
                  {donnees.total} relance{donnees.total > 1 ? 's' : ''}
                  {donnees.tronque && ` · les ${donnees.relances.length} plus récentes affichées, resserrez la période`}
                </td>
                <td className="text-right">{montant(donnees.montantTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
