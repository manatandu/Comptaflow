import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconNew, IconFilter, IconPrint } from '../components/chrome/icons';
import type { ClasseCompte, Compte, TypeCompteDetailTotal } from '../lib/types';

const LIBELLE_CLASSE: Record<ClasseCompte, string> = {
  CLASSE_1: 'Fonds propres et ressources durables',
  CLASSE_2: 'Immobilisations',
  CLASSE_3: 'Stocks',
  CLASSE_4: 'Tiers',
  CLASSE_5: 'Trésorerie',
  CLASSE_6: 'Charges',
  CLASSE_7: 'Produits',
  CLASSE_8: 'Autres charges/produits',
  CLASSE_9: 'Comptabilité analytique',
};

export function PlanComptesPage() {
  const navigate = useNavigate();
  const { estAdmin } = useAuth();
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [numero, setNumero] = useState('');
  const [intitule, setIntitule] = useState('');
  const [classe, setClasse] = useState<ClasseCompte>('CLASSE_1');
  const [typeCompte, setTypeCompte] = useState<TypeCompteDetailTotal>('DETAIL');

  const charger = async () => {
    const params = recherche ? `?recherche=${encodeURIComponent(recherche)}` : '';
    setComptes(await api.get<Compte[]>(`/comptes${params}`));
  };

  useEffect(() => {
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  useRibbon([
    { titre: 'GESTION', boutons: [{ label: 'Nouveau', Icon: IconNew, onClick: () => setAfficherFormulaire((v) => !v) }] },
    { titre: 'RECHERCHE', boutons: [{ label: 'Filtrer', Icon: IconFilter }] },
    { titre: 'IMPRESSION', boutons: [{ label: 'Imprimer', Icon: IconPrint }] },
  ]);

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/comptes', { numero, intitule, classe, typeCompte });
      setNumero('');
      setIntitule('');
      setTypeCompte('DETAIL');
      setAfficherFormulaire(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce compte');
    } finally {
      setEnvoi(false);
    }
  };

  const groupes = (comptes ?? []).reduce<Record<string, Compte[]>>((acc, c) => {
    (acc[c.classe] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <h1 className="text-[15px] font-bold">Plan de comptes</h1>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un compte…"
          className="border border-border-dark bg-surface px-2.5 py-1 text-[12.5px] w-64"
        />
      </div>

      {estAdmin && afficherFormulaire && (
        <form onSubmit={onCreer} className="bg-surface border border-border p-4 mb-4 max-w-[720px]">
          <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">NOUVEAU COMPTE</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim">
              Numéro
              <input
                required
                pattern="\d{3,8}"
                title="3 à 8 chiffres"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono"
              />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Intitulé
              <input
                required
                value={intitule}
                onChange={(e) => setIntitule(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
              />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Classe
              <select value={classe} onChange={(e) => setClasse(e.target.value as ClasseCompte)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
                {(Object.keys(LIBELLE_CLASSE) as ClasseCompte[]).map((cl) => (
                  <option key={cl} value={cl}>
                    {cl.replace('CLASSE_', 'Classe ')} — {LIBELLE_CLASSE[cl]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Type
              <select value={typeCompte} onChange={(e) => setTypeCompte(e.target.value as TypeCompteDetailTotal)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
                <option value="DETAIL">Détail (mouvementable)</option>
                <option value="TOTAL">Total (regroupement par racine)</option>
              </select>
            </label>
          </div>
          {typeCompte === 'TOTAL' && (
            <p className="text-[11px] text-text-dim mb-3 max-w-[600px]">
              Un compte Total ne reçoit jamais d'écriture directement — son solde agrège automatiquement tous les
              comptes Détail dont le numéro commence par celui-ci — au sens strict d'un préfixe de caractères,
              sans tenir compte des zéros de fin (ex. la racine "411" agrège "411001", "411002"… mais pas
              "411000" : le numéro complet ne serait pas un préfixe littéral de "411001").
            </p>
          )}
          {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3">{erreur}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
              {envoi ? 'Création…' : 'Ajouter'}
            </button>
            <button type="button" onClick={() => setAfficherFormulaire(false)} className="text-[12.5px] font-semibold text-text-dim px-4 py-1.5">
              Annuler
            </button>
          </div>
        </form>
      )}

      {!comptes && <div className="text-[12px] text-text-dim">Chargement…</div>}

      {Object.entries(groupes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([classe, liste]) => (
          <div key={classe} className="mb-4">
            <div className="flex items-center gap-2 px-0.5 mb-0.5">
              <span className="font-mono text-[10.5px] font-bold text-sel">
                CLASSE {classe.replace('CLASSE_', '')}
              </span>
              <span className="text-[12px] font-semibold text-text-dim">{LIBELLE_CLASSE[classe as ClasseCompte]}</span>
            </div>
            <div className="border border-border">
              <div className="grid grid-cols-[70px_1fr_70px_90px_60px] gap-3 px-4 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
                <span>N°</span>
                <span>LIBELLÉ</span>
                <span>TYPE</span>
                <span>STATUT</span>
                <span />
              </div>
              {liste.map((c, i) => (
                <div
                  key={c.id}
                  title={c.typeCompte === 'TOTAL' ? 'Compte Total — agrège les comptes Détail de même racine' : undefined}
                  className={`grid grid-cols-[70px_1fr_70px_90px_60px] gap-3 items-center px-4 py-1.5 border-b border-border last:border-b-0 ${
                    c.typeCompte === 'TOTAL' ? 'bg-chrome font-semibold' : i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                  }`}
                >
                  <span className="font-mono text-[12px]">{c.numero}</span>
                  <span className="text-[12.5px]">{c.intitule}</span>
                  <span className="font-mono text-[10px] text-text-dim">{c.typeCompte === 'TOTAL' ? 'Total' : 'Détail'}</span>
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${
                      c.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
                    }`}
                  >
                    {c.estActif ? 'ACTIF' : 'INACTIF'}
                  </span>
                  {c.typeCompte === 'DETAIL' && (
                    <button
                      onClick={() => navigate(`/comptes/${c.id}/lettrage`)}
                      title="Interroger et lettrer ce compte"
                      className="text-[10.5px] text-sel hover:underline text-left"
                    >
                      Lettrer
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
