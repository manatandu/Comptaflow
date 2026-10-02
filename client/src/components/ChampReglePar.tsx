import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { ContrepartieAdmise } from '../lib/compte-du-bien';
import { modesPresents } from '../lib/compte-du-bien';
import { adresseContrepartiesAdmises, etatReglePar, type CibleReglePar } from '../lib/regle-par';

/**
 * LA LISTE « CONTREPARTIE » DES OPÉRATIONS SUR UN BIEN (ex-« Réglé par »,
 * décision D2) · la liste fermée que le
 * serveur admet pour chaque bien visé, leur intersection s'il y en a
 * plusieurs (`lib/regle-par.ts`). Le champ ne propose jamais ce que le
 * serveur refuserait, dit pourquoi il est vide, et présélectionne le seul
 * compte admis.
 */
export function ChampReglePar({
  cibles,
  value,
  onChange,
  className,
  vide = '',
}: {
  cibles: CibleReglePar[];
  value: string;
  onChange: (id: string) => void;
  className: string;
  /** Le texte de l'option vide, selon la convention du formulaire hôte. */
  vide?: string;
}) {
  // La clé des cibles · les tableaux se recréent à chaque rendu, la lecture
  // ne se relance que si un bien ou un type change.
  const adresses = cibles.map(adresseContrepartiesAdmises);
  const cle = adresses.join('|');
  const [listes, setListes] = useState<(ContrepartieAdmise[] | null)[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setListes(adresses.map(() => null));
    setErreur(null);
    if (adresses.some((a) => a === null)) return;
    let vivant = true;
    // Les lectures partent ensemble · une adresse répétée n'est lue qu'une fois.
    const uniques = [...new Set(adresses as string[])];
    Promise.all(uniques.map((a) => api.get<ContrepartieAdmise[]>(a)))
      .then((lues) => {
        if (!vivant) return;
        const parAdresse = new Map(uniques.map((a, i) => [a, lues[i]]));
        setListes(adresses.map((a) => parAdresse.get(a as string) ?? null));
      })
      .catch((err) => {
        if (vivant) setErreur(err instanceof ApiError ? err.message : 'lecture refusée');
      });
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const etat = useMemo(() => etatReglePar(cibles, listes, erreur), [cle, listes, erreur]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un compte choisi qui n'est plus admis (un bien changé) se retire · un
  // seul compte admis se présélectionne, modifiable.
  useEffect(() => {
    if (etat.enLecture) return;
    if (value && !etat.options.some((c) => c.id === value)) onChange(etat.preselection ?? '');
    else if (!value && etat.preselection) onChange(etat.preselection);
  }, [etat, value, onChange]);

  const modes = modesPresents(etat.options);
  const option = (c: ContrepartieAdmise) => (
    <option key={c.id} value={c.id}>
      {c.numero} · {c.intitule}
    </option>
  );
  return (
    <>
      <select required value={value} onChange={(e) => onChange(e.target.value)} disabled={etat.options.length === 0} className={className}>
        <option value="">{etat.enLecture ? '…' : vide}</option>
        {modes.length > 0
          ? [
              ...modes.map((m) => (
                <optgroup key={m.mode} label={m.libelle}>
                  {etat.options.filter((c) => c.mode === m.mode).map(option)}
                </optgroup>
              )),
              ...etat.options.filter((c) => !c.mode).map(option),
            ]
          : etat.options.map(option)}
      </select>
      {etat.motif && <span className="block text-warning font-normal text-[11px]">{etat.motif}</span>}
    </>
  );
}
