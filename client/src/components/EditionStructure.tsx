import type { Edition } from '../lib/editions-structures';

/**
 * L'édition d'une liste de structure · invisible à l'écran, seule imprimée
 * (voir `.avec-edition` dans index.css). Le périmètre est dit en tête, pour
 * qu'une liste filtrée ne se lise jamais comme la liste entière.
 */
export function EditionStructure({ edition, perimetre }: { edition: Edition; perimetre: string }) {
  return (
    <div className="impression-seul edition-structure">
      <div className="text-[11px] mb-2 font-semibold">{perimetre}</div>
      <table className="w-full text-[10.5px]">
        <thead>
          <tr>
            {edition.colonnes.map((c) => (
              <th key={c} className="text-left">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {edition.lignes.map((l, i) => (
            <tr key={i}>
              {l.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
