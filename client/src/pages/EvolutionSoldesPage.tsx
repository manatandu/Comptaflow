import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * ÉVOLUTION PLURIANNUELLE DES SOLDES · le même compte sur plusieurs
 * exercices, côte à côte.
 *
 * Le logiciel ne comparait jamais que N et N-1, parce que c'est ce que les
 * états financiers publient. Un réviseur regarde plus loin : le fichier de
 * préparation de liasse relevé sur le Drive aligne huit exercices. C'est ce
 * qui fait voir une provision qui ne bouge plus depuis quatre ans, une créance
 * douteuse jamais apurée, un compte d'attente qui gonfle d'année en année ·
 * aucune de ces trois anomalies n'est visible sur deux colonnes.
 *
 * Une case VIDE n'est pas un zéro : elle dit que le compte n'était pas
 * mouvementé cet exercice-là. Les confondre ferait lire une extinction là où
 * il n'y a qu'une création.
 */

interface ColonneExercice {
  id: string;
  libelle: string;
  dateFin: string;
  statut: string;
}

interface LigneEvolution {
  compteId: string;
  numero: string;
  intitule: string;
  classe: number;
  soldes: Array<number | null>;
}

interface Evolution {
  exercices: ColonneExercice[];
  lignes: LigneEvolution[];
}

function montant(n: number | null): string {
  if (n === null) return '';
  return n === 0 ? '0,00' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function EvolutionSoldesPage() {
  const [nbExercices, setNbExercices] = useState(8);
  const [racine, setRacine] = useState('');
  const [donnees, setDonnees] = useState<Evolution | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setErreur(null);
    api
      .get<Evolution>(`/ecritures/evolution-soldes?nbExercices=${nbExercices}`)
      .then(
        (r) => !annule && setDonnees(r),
        (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
      );
    return () => {
      annule = true;
    };
  }, [nbExercices]);

  const exporter = () => {
    void api.telecharger(`/exports/evolution-soldes?nbExercices=${nbExercices}`, 'evolution-soldes.xlsx');
  };

  const lignes = (donnees?.lignes ?? []).filter((l) => !racine || l.numero.startsWith(racine));
  const nbColonnes = donnees?.exercices.length ?? 0;
  const grille = {
    display: 'grid',
    gridTemplateColumns: `100px minmax(200px,1fr) repeat(${nbColonnes}, 124px)`,
    gap: '10px',
  } as const;

  return (
    <div className="p-2">
      <EnteteImpression titre="Évolution des soldes" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">RÉVISION</div>
          <h1 className="text-[12px] font-bold leading-tight">Évolution pluriannuelle des soldes</h1>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">RACINE DE COMPTE</span>
            <input
              value={racine}
              onChange={(e) => setRacine(e.target.value.replace(/\D/g, ''))}
              placeholder="ex. 47"
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] font-mono w-[110px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">EXERCICES</span>
            <select
              value={nbExercices}
              onChange={(e) => setNbExercices(Number(e.target.value))}
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px]"
            >
              {[3, 5, 8, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n} derniers
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exporter}
            className="border border-border-dark bg-surface-alt px-3 py-1 text-[10.5px] font-semibold"
          >
            Exporter en Excel
          </button>
        </div>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      <div className="border border-border bg-surface shadow-posee overflow-x-auto">
        {donnees && (
          <div
            style={grille}
            className="px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark"
          >
            <span>N° COMPTE</span>
            <span>INTITULÉ</span>
            {donnees.exercices.map((e) => (
              <span key={e.id} className="text-right">
                {e.libelle}
              </span>
            ))}
          </div>
        )}

        {donnees && lignes.length === 0 && (
          <div className="px-3.5 py-4 text-[10.5px] text-text-dim">
            {donnees.lignes.length === 0
              ? "Aucun compte mouvementé sur la fenêtre retenue."
              : `Aucun compte ne commence par « ${racine} ».`}
          </div>
        )}

        {lignes.map((l) => (
          <div
            key={l.compteId}
            style={grille}
            className="px-3.5 py-[4px] items-center border-b border-border/50 text-[10.5px]"
          >
            <span className="font-mono">{l.numero}</span>
            <span className="truncate" title={l.intitule}>
              {l.intitule}
            </span>
            {l.soldes.map((s, i) => (
              <span
                key={donnees!.exercices[i].id}
                className={`font-mono text-right ${s === null ? 'text-text-dim' : ''}`}
                title={s === null ? 'Compte non mouvementé sur cet exercice' : undefined}
              >
                {montant(s)}
              </span>
            ))}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-text-dim mt-2 max-w-[900px]">
        Solde de clôture de chaque exercice, à-nouveaux compris · c'est la définition de la balance, et c'est
        ce qui rend chaque colonne comparable à la balance de l'année. Une case vide signifie que le compte
        n'était pas mouvementé cet exercice-là, ce qui n'est pas la même chose qu'un solde nul. Les montants
        sont signés : débiteur positif, créditeur négatif.
      </p>
    </div>
  );
}
