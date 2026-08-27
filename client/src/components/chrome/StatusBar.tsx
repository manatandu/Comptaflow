import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';

export function StatusBar({ gauche }: { gauche?: string }) {
  const { utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();

  return (
    <div className="h-5 bg-chrome border-t border-border flex items-center justify-between px-2.5 text-[10px] text-text-dim">
      <span>{gauche ?? 'Prêt'}</span>
      <span>
        {utilisateur?.tenant.nom} · {utilisateur?.tenant.referentiel}
        {exerciceCourant && ` · Exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}`}
      </span>
    </div>
  );
}
