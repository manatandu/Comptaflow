import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';

/**
 * En-tête officiel des états imprimés · invisible à l'écran, présent sur
 * chaque impression.
 *
 * Un état déposé chez un bailleur, un auditeur ou au greffe doit dire de
 * lui-même de qui il émane, sur quel exercice il porte, selon quel
 * référentiel, et à quelle date il a été édité. Sans ces quatre mentions,
 * une feuille de chiffres imprimée n'est pas un document comptable.
 */
export function EnteteImpression({ titre, sousTitre }: { titre: string; sousTitre?: string }) {
  const { utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const tenant = utilisateur?.tenant;

  const periode = exerciceCourant
    ? `du ${new Date(exerciceCourant.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(
        exerciceCourant.dateFin,
      ).toLocaleDateString('fr-FR')}`
    : null;

  const jeu =
    tenant?.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT'
      ? 'Projets de développement et assimilés'
      : 'Associations et ordres professionnels';

  return (
    <header className="impression-seul mb-4 pb-2 border-b-2 border-black">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[15px] font-bold uppercase">{tenant?.nom}</div>
          <div className="text-[10.5px]">
            Référentiel {tenant?.referentiel}
            {tenant?.referentiel === 'SYCEBNL' && ` · ${jeu}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[14px] font-bold">{titre}</div>
          {sousTitre && <div className="text-[11px]">{sousTitre}</div>}
          {periode && <div className="text-[10.5px]">Exercice {periode}</div>}
          <div className="text-[10px] text-neutral-600">
            Édité le {new Date().toLocaleDateString('fr-FR')} à{' '}
            {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Bouton d'impression · ouvre la boîte du navigateur, où « Enregistrer au
 * format PDF » produit le fichier à déposer. Pas de moteur de rendu
 * supplémentaire côté serveur : ce qui s'imprime est exactement ce qui est à
 * l'écran, sans risque de divergence entre les deux.
 */
export function BoutonImprimer({ libelle = 'Imprimer' }: { libelle?: string }) {
  return (
    <button
      onClick={() => window.print()}
      title="Ouvre la boîte d'impression · « Enregistrer au format PDF » y produit le fichier à déposer"
      className="ecran-seul flex items-center gap-1.5 border border-border rounded-[6px] bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt"
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </svg>
      {libelle}
    </button>
  );
}
