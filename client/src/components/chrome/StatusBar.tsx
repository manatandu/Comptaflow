import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';

// Libellés de rôle repris tels quels de l'ancienne navigation latérale
// (TreeNav, retirée) — le rôle et le statut d'abonnement qu'elle affichait
// vivent maintenant ici, seul repère de contexte permanent à l'écran.
const LIBELLE_ROLE: Record<string, string> = {
  ADMIN_CABINET: 'Administrateur',
  COMPTABLE: 'Comptable',
  LECTURE_SEULE: 'Lecture seule',
};

export function StatusBar({ gauche }: { gauche?: string }) {
  const { utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();

  return (
    <div className="h-5 bg-chrome border-t border-border flex items-center justify-between px-2.5 text-[10px] text-text-dim">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-positive" />
        <span>Abonnement actif</span>
        <span className="text-border-dark">·</span>
        <span>{gauche ?? 'Prêt'}</span>
      </span>
      <span>
        {utilisateur?.tenant.nom} · {utilisateur?.tenant.referentiel}
        {utilisateur && ` · ${LIBELLE_ROLE[utilisateur.role]}`}
        {exerciceCourant && ` · Exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}`}
      </span>
    </div>
  );
}
