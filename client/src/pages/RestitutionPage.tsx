import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SauvegardesSurSite } from '../components/SauvegardesSurSite';
import { IconExport } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';

/**
 * RESTITUTION DU DOSSIER · la copie intégrale, en un fichier.
 *
 * CE QUE CET ÉCRAN DOIT DIRE AVANT DE PROPOSER LE BOUTON. Une archive qui se
 * présente pour plus qu'elle ne vaut est plus dangereuse que pas d'archive du
 * tout : un successeur ou un bailleur qui la prendrait pour la conservation
 * légale détruirait les classeurs papier. Les mêmes réserves figurent dans le
 * manifeste de l'archive, mot pour mot · elles sont ici parce qu'on décide
 * AVANT de télécharger, pas après.
 *
 * Réservé à l'administrateur du cabinet · une copie intégrale n'est pas une
 * consultation. Aucun texte ne dit qui a qualité pour la demander, c'est une
 * décision d'OmegaX, comme le format et le périmètre.
 */
export function RestitutionPage() {
  const { estAdmin: peutExtraire } = useAuth();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function extraire() {
    setEnCours(true);
    setErreur(null);
    try {
      await api.telecharger('/restitution/archive', 'restitution.zip');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'extraction n'a pas abouti.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="p-2 max-w-[760px]">
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Ce que cette archive n'est pas</h2>
        <ul className="text-[11.5px] text-text-dim list-disc pl-4 space-y-1.5 leading-[1.6]">
          <li>
            <strong>Elle ne remplace pas la conservation.</strong> OmegaX ne tient pas les pièces
            justificatives des écritures · seuls les documents attachés aux tiers sont archivés,
            dans <code>documents-tiers/</code>. L'AUDCIF art. 24 vise « les livres comptables ou
            les documents qui en tiennent lieu, ainsi que les pièces justificatives » · les
            classeurs papier restent la conservation.
          </li>
          <li>
            {/* Passe D4 (D4-A1, D4-B1) · la réserve citait les notes du CPCC de
                novembre 2020, antérieures à l'ordonnance-loi n° 23/10 du 13 mars
                2023 (art. 89, 91, 95). L'histoire reste ici, pas à l'écran (§ 9 ter). */}
            <strong>Elle n'a pas la force probante de l'écrit papier légalisé.</strong> Elle ne
            porte ni signature électronique certifiée ni horodatage au sens de l'art. 91 du Code
            du numérique.{' '}
            <Aide
              titre="Valeur probante de l'archive"
              texte="L'écrit électronique a la même valeur juridique que l'écrit sur papier (art. 89). L'horodatage et la signature électronique certifiée lui confèrent la force probante de l'écrit sur papier légalisé ayant une date certaine (art. 91) · l'archive n'en porte pas. Son admission en preuve (art. 95) suppose que soit identifiée la personne dont elle émane et qu'elle soit conservée dans des conditions qui garantissent son intégrité, selon la législation relative à la conservation des archives. Le décret de l'art. 44 sur l'archivage électronique n'a pas été lu. La qualification de l'archive comme preuve revient à un juriste."
              source="Ordonnance-loi n° 23/10 du 13 mars 2023 portant Code du numérique, art. 89, 91 et 95."
            />
          </li>
          <li>
            <strong>Ce n'est pas une réversibilité.</strong> L'import général recharge un plan de
            comptes, une balance et des écritures ; trois imports ciblés lisent un relevé bancaire,
            la balance d'une entité consolidée et le canevas d'une cellule. Les autres tables se
            lisent, elles ne se rechargent pas.
          </li>
          <li>
            <strong>Ce n'est pas un instantané.</strong> Les tables sont lues l'une après l'autre.
            Extraire un dossier au repos est la seule façon d'obtenir un ensemble cohérent au
            centime · un fichier <code>controles.txt</code> dit, table par table, si l'inventaire
            annoncé et les lignes écrites concordent.
          </li>
          <li>
            <strong>Les CSV ne sont pas le livre-journal.</strong> Chaque table est lue dans
            l'ordre de sa clé, qui n'est pas chronologique. La chronologie est portée par les états
            du menu État.
          </li>
        </ul>
      </section>

      {erreur && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[11.5px]">
          {erreur}
        </p>
      )}

      <div className="flex items-center gap-2">
        {peutExtraire ? (
          <button
            type="button"
            onClick={extraire}
            disabled={enCours}
            className="inline-flex items-center gap-1.5 bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
          >
            <IconExport />
            {enCours ? 'Extraction en cours…' : 'Extraire le dossier complet'}
          </button>
        ) : (
          <p className="text-[11.5px] text-text-dim">
            Seul l'administrateur du cabinet peut extraire le dossier complet.
          </p>
        )}
        <Aide
          titre="Archive de restitution"
          texte="Une archive ZIP contenant une table par fichier CSV, plus un manifeste qui décrit précisément ce qu'elle contient et ce qu'elle ne contient pas. L'extraction est inscrite dans le journal d'audit du dossier · qui l'a demandée, quand, et sur quel volume."
          source="OmegaX"
        />
      </div>

      {enCours && (
        <p className="text-[11.5px] text-text-dim mt-2">
          Sur un dossier chargé, l'extraction prend plusieurs minutes · le fichier ne s'ouvre
          qu'une fois complet, ne fermez pas la fenêtre.
        </p>
      )}
      <SauvegardesSurSite />
    </div>
  );
}
