/**
 * Rattachements du dossier que plus aucune rubrique rattachable ne lit.
 *
 * La confrontation des notes au plan (passe R6) a fait lire par le texte des
 * rubriques qui attendaient un rattachement, et en a retiré d'autres. Le
 * rattachement reste en base sans rien chiffrer · sans cette liste, son
 * compte sortait de la note sans un mot. Il se retire d'ici.
 */
export function RattachementsSansRubrique({
  liste,
  peutRetirer,
  enCours,
  retirer,
}: {
  liste: { codeNote: string; cleRubrique: string; compteId: string; numero: string }[] | undefined;
  peutRetirer: boolean;
  enCours: string | null;
  retirer: (codeNote: string, cleRubrique: string, compteId: string) => void;
}) {
  if (!liste || liste.length === 0) return null;
  return (
    <div className="border border-warning/40 bg-warning/5 px-3.5 py-2 mb-2.5 text-[11.5px]">
      <div className="font-bold mb-1">Rattachements qui ne sont plus lus</div>
      <ul>
        {liste.map((r) => (
          <li key={`${r.codeNote}::${r.cleRubrique}::${r.compteId}`} className="flex items-center gap-3">
            <span>
              Note {r.codeNote} · {r.cleRubrique} · compte {r.numero}
            </span>
            {peutRetirer && (
              <button
                onClick={() => retirer(r.codeNote, r.cleRubrique, r.compteId)}
                disabled={enCours !== null}
                className="font-bold hover:underline"
              >
                Retirer
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
