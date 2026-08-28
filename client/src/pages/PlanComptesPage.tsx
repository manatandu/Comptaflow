import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconNew, IconFilter, IconPrint } from '../components/chrome/icons';
import type { ClasseCompte, Compte } from '../lib/types';

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
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [recherche, setRecherche] = useState('');

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
    { titre: 'GESTION', boutons: [{ label: 'Nouveau', Icon: IconNew }] },
    { titre: 'RECHERCHE', boutons: [{ label: 'Filtrer', Icon: IconFilter }] },
    { titre: 'IMPRESSION', boutons: [{ label: 'Imprimer', Icon: IconPrint }] },
  ]);

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
              <div className="grid grid-cols-[70px_1fr_90px_60px] gap-3 px-4 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
                <span>N°</span>
                <span>LIBELLÉ</span>
                <span>STATUT</span>
                <span />
              </div>
              {liste.map((c, i) => (
                <div
                  key={c.id}
                  className={`grid grid-cols-[70px_1fr_90px_60px] gap-3 items-center px-4 py-1.5 border-b border-border last:border-b-0 ${
                    i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                  }`}
                >
                  <span className="font-mono text-[12px]">{c.numero}</span>
                  <span className="text-[12.5px]">{c.intitule}</span>
                  <span
                    className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${
                      c.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
                    }`}
                  >
                    {c.estActif ? 'ACTIF' : 'INACTIF'}
                  </span>
                  <button
                    onClick={() => navigate(`/comptes/${c.id}/lettrage`)}
                    title="Interroger et lettrer ce compte"
                    className="text-[10.5px] text-sel hover:underline text-left"
                  >
                    Lettrer
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
