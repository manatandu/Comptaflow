import { Aide } from './chrome/Aide';
import { CRITERES, type SaisieCriteres } from '../lib/criteres-frais-developpement';

/**
 * LES SIX CRITÈRES DES FRAIS DE DÉVELOPPEMENT (lot 15) · montrés dans la fiche
 * « Nouvelle immobilisation » quand le compte du bien est un 211 d'un dossier
 * SYSCOHADA. Le serveur tient le refus (`frais-developpement.ts`) · l'écran
 * ne fait que poser chaque question, dans l'ordre du texte.
 */
export function CriteresFraisDeveloppement({
  saisie,
  dateReunion,
  onChange,
}: {
  saisie: SaisieCriteres;
  dateReunion: string;
  onChange: (saisie: SaisieCriteres, dateReunion: string) => void;
}) {
  const champ = 'mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal';
  return (
    <div className="col-span-3 border-t border-border pt-3" data-criteres-developpement>
      <div className="text-[11.5px] font-semibold text-text-dim mb-2 flex items-center gap-1.5">
        Conditions d'inscription des frais de développement
        <Aide
          titre="Six critères des frais de développement"
          texte="Les dépenses de développement ne s'inscrivent à l'actif que si l'entité démontre les six critères simultanément ; à défaut, elles restent en charges. Les dépenses de recherche vont toujours en charges, comme tout ce qui précède la date où les six critères sont réunis, y compris dans l'exercice même : aucune activation rétroactive. Un prototype ou un autre bien corporel issu de la recherche va à son compte d'immobilisation ou de stock, jamais au 211. Le montant inscrit vient de l'analytique ou d'un calcul statistique, par le crédit du 721 ; le logiciel ne le vérifie pas."
          source="AUDCIF Titre VIII ch. 1 § 2.1, § 3.1, § 5.2 ; fiche du compte 211"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {CRITERES.map((c, i) => (
          <label key={c.cle} className="text-[11.5px] font-semibold text-text-dim">
            {i + 1}. {c.libelle}
            <input
              required
              maxLength={1000}
              value={saisie[c.cle]}
              onChange={(e) => onChange({ ...saisie, [c.cle]: e.target.value }, dateReunion)}
              placeholder="Ce qui le démontre"
              className={champ}
            />
          </label>
        ))}
        <label className="text-[11.5px] font-semibold text-text-dim">
          Critères réunis depuis le
          <input required type="date" value={dateReunion} onChange={(e) => onChange(saisie, e.target.value)} className={`${champ} font-mono`} />
        </label>
      </div>
    </div>
  );
}
