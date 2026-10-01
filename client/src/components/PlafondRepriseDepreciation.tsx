import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { montant } from '../lib/montants';
import { Aide } from './chrome/Aide';

interface Plafond {
  cumulDepreciation: number;
  valeurNette: number;
  valeurSansDepreciation: number;
  plafond: number;
}

/**
 * LOT 12 · le plafond d'une reprise de dépréciation (AUDCIF Titre VIII ch. 12
 * § 2.4.2), lu au serveur avant la saisie. Le serveur refuse seul ce qui le
 * dépasse (`motifRefusRepriseDepreciation`) · l'écran ne fait que le dire.
 */
export function PlafondRepriseDepreciation({ immobilisationId, exerciceId }: { immobilisationId: string; exerciceId: string }) {
  // null tant que rien n'est lu · un plafond inconnu ne se montre pas à zéro.
  const [plafond, setPlafond] = useState<Plafond | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setPlafond(null);
    setErreur(null);
    api
      .get<Plafond>(`/immobilisations/${immobilisationId}/plafond-reprise-depreciation?exerciceId=${exerciceId}`)
      .then(setPlafond)
      .catch((err) => setErreur(err instanceof ApiError ? err.message : 'Plafond de reprise illisible'));
  }, [immobilisationId, exerciceId]);

  if (erreur) return <div className="mt-2 text-[11.5px] text-danger">{erreur}</div>;
  if (!plafond) return <div className="mt-2 text-[11.5px] text-text-dim">…</div>;
  return (
    <div className="mt-2 flex items-center gap-1 text-[11.5px]" data-plafond-reprise>
      <span className="font-semibold">Reprise au plus · {montant(plafond.plafond)}</span>
      <span className="text-text-dim">
        (valeur nette en fin d’exercice {montant(plafond.valeurNette)}, sans dépréciation {montant(plafond.valeurSansDepreciation)}, dépréciation inscrite {montant(plafond.cumulDepreciation)})
      </span>
      <Aide
        titre="Plafond de reprise"
        texte="Après la reprise, la valeur nette du bien ne peut pas dépasser celle qu’il aurait eue si aucune perte de valeur n’avait été constatée : le plan d’amortissement d’origine est rejoué exercice par exercice, sans dépréciation. Les deux valeurs se comparent en fin d’exercice, dotation de l’exercice comprise. La reprise ne dépasse jamais non plus la dépréciation encore inscrite."
        source="AUDCIF Titre VIII ch. 12 § 2.4.2"
      />
    </div>
  );
}
