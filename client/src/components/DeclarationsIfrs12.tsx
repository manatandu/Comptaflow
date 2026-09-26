import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * LES RÉPONSES D'IFRS 12 que le périmètre ne porte pas · jugements (§ 7 à 9),
 * restrictions (§ 13, § 22 a), raison des dates de clôture (§ 11 b), entités
 * structurées, et par entité l'établissement principal, la part des
 * minoritaires (§ 12 e et f, B10 a) ou la relation avec un partenariat
 * (§ 21 a, IFRS 11 § 14). Un champ vide vaut « pas de réponse », jamais zéro.
 */
type Filiale = { etablissement: string | null; resultatMinoritaires: number | null; cumulMinoritaires: number | null; dividendesMinoritaires: number | null };
type Partenaire = { etablissement: string | null; natureRelation: string | null; typePartenariat: 'ENTREPRISE_COMMUNE' | 'COENTREPRISE' | null; dividendesRecus: number | null };
export type DeclarationsIfrs12 = {
  jugements: string | null;
  restrictions: string | null;
  datesCloture: string | null;
  entitesStructurees: boolean | null;
  filiales: Record<string, Filiale>;
  partenaires: Record<string, Partenaire>;
};
export type EntiteIfrs12 = { nom: string; methode: string; estConsolidante: boolean; pctInteret: number; natureControle: string; exclue: boolean };

const champ = 'w-full border border-border px-1.5 py-1 text-[11.5px]';
const versTexte = (v: number | null) => (v == null ? '' : String(v));
const versNombre = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

export function DeclarationsIfrs12Form({
  exerciceId,
  declarations,
  entites,
  apresEnregistrement,
}: {
  exerciceId: string;
  declarations: DeclarationsIfrs12;
  entites: EntiteIfrs12[];
  apresEnregistrement: () => Promise<void>;
}) {
  const { peutEcrire } = useAuth();
  const [d, setD] = useState<DeclarationsIfrs12>(declarations);
  const [erreur, setErreur] = useState<string | null>(null);
  const filiales = entites.filter((e) => !e.estConsolidante && !e.exclue && e.methode === 'IG' && e.pctInteret < 100);
  const partenaires = entites.filter((e) => !e.estConsolidante && !e.exclue && (e.methode === 'ME' || e.methode === 'IP'));
  const filiale = (nom: string): Filiale => d.filiales[nom] ?? { etablissement: null, resultatMinoritaires: null, cumulMinoritaires: null, dividendesMinoritaires: null };
  const partenaire = (nom: string): Partenaire => d.partenaires[nom] ?? { etablissement: null, natureRelation: null, typePartenariat: null, dividendesRecus: null };
  const majFiliale = (nom: string, x: Partial<Filiale>) => setD({ ...d, filiales: { ...d.filiales, [nom]: { ...filiale(nom), ...x } } });
  const majPartenaire = (nom: string, x: Partial<Partenaire>) => setD({ ...d, partenaires: { ...d.partenaires, [nom]: { ...partenaire(nom), ...x } } });
  const texte = (v: string) => (v.trim() ? v : null);

  async function enregistrer() {
    setErreur(null);
    try {
      await api.put('/ifrs/notes-ifrs12', { exerciceId, contenu: d });
      await apresEnregistrement();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Les réponses IFRS 12 n’ont pas pu être enregistrées.');
    }
  }

  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
      <h2 className="text-[11.5px] font-bold mb-1.5">Intérêts détenus dans d’autres entités · réponses IFRS 12</h2>
      <fieldset disabled={!peutEcrire} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <label className="text-[11.5px] sm:col-span-2">
          Hypothèses et jugements importants sur le contrôle et l’influence (§ 7 à 9)
          <textarea className={champ} rows={2} value={d.jugements ?? ''} onChange={(e) => setD({ ...d, jugements: texte(e.target.value) })} />
        </label>
        <label className="text-[11.5px]">
          Restrictions importantes (§ 13, § 22 a), « aucune » compris
          <textarea className={champ} rows={2} value={d.restrictions ?? ''} onChange={(e) => setD({ ...d, restrictions: texte(e.target.value) })} />
        </label>
        <label className="text-[11.5px]">
          Raison des dates de clôture différentes (§ 11 b, § 22 b ii)
          <textarea className={champ} rows={2} value={d.datesCloture ?? ''} onChange={(e) => setD({ ...d, datesCloture: texte(e.target.value) })} />
        </label>
        <label className="text-[11.5px]">
          Intérêts dans des entités structurées (§ 14 à 17, § 24 à 31)
          <select
            className={champ}
            value={d.entitesStructurees == null ? '' : d.entitesStructurees ? 'OUI' : 'NON'}
            onChange={(e) => setD({ ...d, entitesStructurees: e.target.value === '' ? null : e.target.value === 'OUI' })}
          >
            <option value="">Pas encore dit</option>
            <option value="OUI">Oui</option>
            <option value="NON">Non</option>
          </select>
        </label>
      </fieldset>

      {filiales.length > 0 && (
        <div className="mt-2">
          <p className="text-[11.5px] font-semibold mb-1">Filiales dont des participations ne donnent pas le contrôle (§ 12, B10 a)</p>
          {filiales.map((e) => {
            const x = filiale(e.nom);
            return (
              <fieldset key={e.nom} disabled={!peutEcrire} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr_1fr_1fr] gap-1.5 mb-1 items-center">
                <span className="text-[11.5px]">{e.nom}</span>
                <input className={champ} placeholder="Établissement principal" value={x.etablissement ?? ''} onChange={(ev) => majFiliale(e.nom, { etablissement: texte(ev.target.value) })} />
                <input className={champ} placeholder="Résultat des minoritaires" value={versTexte(x.resultatMinoritaires)} onChange={(ev) => majFiliale(e.nom, { resultatMinoritaires: versNombre(ev.target.value) })} />
                <input className={champ} placeholder="Cumul des minoritaires" value={versTexte(x.cumulMinoritaires)} onChange={(ev) => majFiliale(e.nom, { cumulMinoritaires: versNombre(ev.target.value) })} />
                <input className={champ} placeholder="Dividendes versés" value={versTexte(x.dividendesMinoritaires)} onChange={(ev) => majFiliale(e.nom, { dividendesMinoritaires: versNombre(ev.target.value) })} />
              </fieldset>
            );
          })}
        </div>
      )}

      {partenaires.length > 0 && (
        <div className="mt-2">
          <p className="text-[11.5px] font-semibold mb-1">Partenariats et entreprises associées (§ 21 a, B12 a)</p>
          {partenaires.map((e) => {
            const x = partenaire(e.nom);
            return (
              <fieldset key={e.nom} disabled={!peutEcrire} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr_1fr_1fr] gap-1.5 mb-1 items-center">
                <span className="text-[11.5px]">{e.nom}</span>
                <input className={champ} placeholder="Établissement principal" value={x.etablissement ?? ''} onChange={(ev) => majPartenaire(e.nom, { etablissement: texte(ev.target.value) })} />
                <input className={champ} placeholder="Nature de la relation" value={x.natureRelation ?? ''} onChange={(ev) => majPartenaire(e.nom, { natureRelation: texte(ev.target.value) })} />
                <select
                  className={champ}
                  value={x.typePartenariat ?? ''}
                  onChange={(ev) => majPartenaire(e.nom, { typePartenariat: (ev.target.value || null) as Partenaire['typePartenariat'] })}
                >
                  <option value="">{e.natureControle === 'CONJOINT' ? 'Type de partenariat à déclarer' : 'Sans objet (influence notable)'}</option>
                  <option value="ENTREPRISE_COMMUNE">Entreprise commune (IFRS 11 § 15)</option>
                  <option value="COENTREPRISE">Coentreprise (IFRS 11 § 16)</option>
                </select>
                <input className={champ} placeholder="Dividendes reçus" value={versTexte(x.dividendesRecus)} onChange={(ev) => majPartenaire(e.nom, { dividendesRecus: versNombre(ev.target.value) })} />
              </fieldset>
            );
          })}
        </div>
      )}

      {peutEcrire && (
        <button className="mt-2 border border-border px-2.5 py-1 text-[11.5px]" onClick={() => void enregistrer()}>
          Enregistrer les réponses IFRS 12
        </button>
      )}
      {erreur && <p className="text-[11.5px] text-danger mt-1.5">{erreur}</p>}
    </section>
  );
}
