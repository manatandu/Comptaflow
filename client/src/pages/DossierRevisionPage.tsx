import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';

/**
 * DOSSIER DE RÉVISION · ce que le référentiel dit de chaque compte, appliqué
 * au dossier réel.
 *
 * Le SYCEBNL décrit chaque compte par une fiche dont une rubrique dit à
 * partir de QUOI son solde se contrôle : « le compte 40 peut être contrôlé à
 * partir des factures, chèques de règlement, effets… ». Rapprochée des
 * comptes réellement mouvementés, cette rubrique fait le dossier de révision
 * du cabinet · compte par compte, son solde et les pièces à demander.
 *
 * Le texte est cité, jamais reformulé.
 */

interface LigneRevision {
  compteId: string;
  numero: string;
  intitule: string;
  debit: number;
  credit: number;
  solde: number;
  ficheNumero: string | null;
  elementsDeControle: string | null;
  exclusions: string | null;
}

export function DossierRevisionPage() {
  const { utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const [lignes, setLignes] = useState<LigneRevision[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [sansFicheSeulement, setSansFicheSeulement] = useState(false);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    api.get<{ comptes: LigneRevision[] }>(`/controles/dossier-revision?exerciceId=${exerciceCourant.id}`).then(
      (r) => !annule && setLignes(r.comptes),
      (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
    );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const affichees = (lignes ?? []).filter((l) => {
    if (sansFicheSeulement && l.elementsDeControle) return false;
    if (!recherche.trim()) return true;
    const q = recherche.trim().toLowerCase();
    return l.numero.startsWith(q) || l.intitule.toLowerCase().includes(q);
  });

  return (
    <div className="p-2">
      <div className="mb-2">
        <div className="text-[10px] font-mono text-text-dim leading-none">RÉVISION</div>
        <h1 className="text-[12px] font-bold leading-tight">Dossier de révision</h1>
        <p className="text-[10.5px] text-text-dim mt-1 max-w-[980px] leading-[1.5]">
          Un bloc par compte mouvementé de l'exercice, avec son solde et les pièces à partir desquelles le référentiel
          dit qu'il se contrôle. Les comptes sans mouvement n'y figurent pas : la révision ne porte que sur ce qui a
          bougé. Les fiches sont celles du texte de CE dossier
          {utilisateur?.tenant.referentiel === 'SYSCOHADA'
            ? ' (AUDCIF, Titre VII)'
            : ' (SYCEBNL, Partie 2 chapitre 3)'}
          , jamais transposées de l'autre.
        </p>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2 max-w-[980px]">
          {erreur}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Numéro ou intitulé de compte"
          className="border border-border bg-surface px-2 py-1 text-[11px] w-[260px]"
        />
        <label className="flex items-center gap-1.5 text-[10.5px] text-text-dim">
          <input
            type="checkbox"
            checked={sansFicheSeulement}
            onChange={(e) => setSansFicheSeulement(e.target.checked)}
          />
          Seulement les comptes sans fiche
        </label>
        <span className="text-[10.5px] text-text-dim ml-auto">
          {affichees.length} compte{affichees.length > 1 ? 's' : ''}
        </span>
      </div>

      {!lignes && !erreur && <div className="text-[11px] text-text-dim">Chargement…</div>}

      <div className="flex flex-col gap-1.5 max-w-[980px]">
        {affichees.map((l) => (
          <div key={l.compteId} className="border border-border bg-surface shadow-posee">
            <div className="flex items-baseline gap-2 px-3 py-1.5 bg-surface-alt border-b border-border">
              <span className="font-mono text-[11px] font-bold">{l.numero}</span>
              <span className="text-[11px] truncate">{l.intitule}</span>
              <span className="ml-auto font-mono text-[11px] whitespace-nowrap">
                {montant(l.solde)}
                <span className="text-text-dim text-[10px]"> {l.solde >= 0 ? 'débiteur' : 'créditeur'}</span>
              </span>
            </div>
            <div className="px-3 py-1.5 text-[10.5px] leading-[1.55]">
              {l.elementsDeControle ? (
                <>
                  <span className="font-bold">Éléments de contrôle (fiche {l.ficheNumero}) · </span>
                  {l.elementsDeControle}
                </>
              ) : (
                <span className="text-text-dim">
                  Le référentiel ne donne pas d'éléments de contrôle pour ce compte.
                </span>
              )}
            </div>
            {l.exclusions && (
              <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-text-dim leading-[1.5]">
                <span className="font-bold">Exclusions · </span>
                {l.exclusions}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
