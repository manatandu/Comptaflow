import type { Exercice, RegistreFaiblesses } from './types';

/**
 * LES REGISTRES VERS LESQUELS UNE FAIBLESSE SE REPORTE (audit final F74) ·
 * ouverts, de la MÊME origine et d'un exercice POSTÉRIEUR, la règle que le
 * serveur oppose (`FaiblessesService.motifRefusReport`). Proposer les autres
 * ferait choisir une cible que le serveur refuserait après coup.
 */
export function ciblesDeReport(
  registres: RegistreFaiblesses[],
  source: Pick<RegistreFaiblesses, 'id' | 'origine' | 'exerciceId'>,
  exercices: Pick<Exercice, 'id' | 'dateDebut'>[],
): RegistreFaiblesses[] {
  const debut = new Map(exercices.map((e) => [e.id, new Date(e.dateDebut).getTime()]));
  const debutSource = debut.get(source.exerciceId);
  if (debutSource === undefined) return [];
  return registres.filter((r) => {
    const debutCible = debut.get(r.exerciceId);
    return (
      r.id !== source.id &&
      r.statut === 'OUVERT' &&
      r.origine === source.origine &&
      debutCible !== undefined &&
      debutCible > debutSource
    );
  });
}
