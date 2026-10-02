import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Aide } from './chrome/Aide';

interface ComptesLus {
  racine: string;
  intitule: string;
  source: string;
  comptes: { id: string; numero: string; intitule: string }[];
}

/**
 * LE MATÉRIEL RÉCUPÉRÉ À LA MISE HORS SERVICE (lot 15) · repris en stock au
 * 388 (SYSCOHADA) ou au 378 (SYCEBNL), par le crédit du compte du bien. Le
 * numéro vient du serveur (nomenclature des stocks), jamais d'ici ; le seul
 * compte du plan se présélectionne, et un plan qui n'en ouvre aucun le dit.
 */
export function ChampsMaterielRecupere({
  valeur,
  setValeur,
  compte,
  setCompte,
  source,
  setSource,
}: {
  valeur: string;
  setValeur: (v: string) => void;
  compte: string;
  setCompte: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
}) {
  const [lus, setLus] = useState<ComptesLus | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ComptesLus>('/immobilisations/materiel-recupere/comptes')
      .then((r) => {
        setLus(r);
        if (r.comptes.length === 1) setCompte(r.comptes[0].id);
      })
      .catch((err) => setErreur(err instanceof ApiError ? err.message : 'Comptes illisibles'));
    // La lecture ne dépend que du dossier · une fois à l'ouverture du formulaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recupere = Number(valeur) > 0;
  const libelle = 'text-[11.5px] font-semibold text-text-dim';
  const champ = 'mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]';
  return (
    <>
      <label className={libelle}>
        <span className="flex items-center gap-1">
          Matériel récupéré
          <Aide
            titre="Matériel récupéré"
            texte="Les matières et matériaux récupérés d'une immobilisation corporelle mise hors service peuvent être repris en stock, pour une valeur que vous estimez, par le crédit du compte du bien · le reste de la valeur nette va au 81. La valeur ne peut pas dépasser la valeur nette du bien. Au SYSCOHADA, le 388 se solde en fin d'exercice par le 603."
            source={lus?.source ?? 'AUDCIF, Titre VIII ch. 14 § 2.8'}
          />
        </span>
        <input type="number" min={0} step="0.01" value={valeur} onChange={(e) => setValeur(e.target.value)} className={`${champ} font-mono`} />
      </label>
      {recupere && (
        <>
          <label className={libelle}>
            Repris au stock
            {erreur ? (
              <span className="block text-danger font-normal">{erreur}</span>
            ) : lus === null ? (
              <span className="block font-normal">…</span>
            ) : lus.comptes.length === 0 ? (
              <span className="block text-warning font-normal">
                Le plan du dossier n'ouvre aucun compte sous le {lus.racine} · ouvrez-le dans le plan comptable.
              </span>
            ) : (
              <select required value={compte} onChange={(e) => setCompte(e.target.value)} className={champ}>
                <option value="" />
                {lus.comptes.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            )}
          </label>
          <label className={libelle}>
            Source de la valeur
            <input required value={source} onChange={(e) => setSource(e.target.value)} className={champ} />
          </label>
        </>
      )}
    </>
  );
}
