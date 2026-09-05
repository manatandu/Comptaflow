import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconExport } from '../components/chrome/icons';

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
  const { utilisateur } = useAuth();
  const peutExtraire = utilisateur?.role === 'ADMIN_CABINET';
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
      <p className="text-[10.5px] text-text-dim mb-2.5 leading-[1.6]">
        Une archive ZIP contenant une table par fichier CSV, plus un manifeste qui décrit
        précisément ce qu'elle contient et ce qu'elle ne contient pas. L'extraction est inscrite
        dans le journal d'audit du dossier · qui l'a demandée, quand, et sur quel volume.
      </p>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11px] font-bold mb-1.5">Ce que cette archive n'est pas</h2>
        <ul className="text-[10.5px] text-text-dim list-disc pl-4 space-y-1.5 leading-[1.6]">
          <li>
            <strong>Elle ne remplace pas la conservation.</strong> OmegaX ne détient aucune pièce
            justificative numérisée. L'AUDCIF art. 24 vise « les livres comptables ou les documents
            qui en tiennent lieu, ainsi que les pièces justificatives » · les classeurs papier
            restent la conservation.
          </li>
          <li>
            <strong>Elle n'a pas la valeur probante du papier en RDC.</strong> Les écrits
            électroniques ne sont pas encore admis en preuve au même titre que l'écrit papier
            (notes d'organisation comptable du CPCC, § 1.5.3 b).
          </li>
          <li>
            <strong>Ce n'est pas une réversibilité.</strong> Trois imports existent aujourd'hui ·
            plan de comptes, balance, écritures. Les autres tables se lisent, elles ne se
            rechargent pas.
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
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px]">
          {erreur}
        </p>
      )}

      {peutExtraire ? (
        <button
          type="button"
          onClick={extraire}
          disabled={enCours}
          className="inline-flex items-center gap-1.5 bg-sel text-white text-[10.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          <IconExport />
          {enCours ? 'Extraction en cours…' : 'Extraire le dossier complet'}
        </button>
      ) : (
        <p className="text-[10.5px] text-text-dim">
          Seul l'administrateur du cabinet peut extraire le dossier complet.
        </p>
      )}

      {enCours && (
        <p className="text-[10.5px] text-text-dim mt-2">
          Sur un dossier chargé, l'extraction prend plusieurs minutes · le fichier ne s'ouvre
          qu'une fois complet, ne fermez pas la fenêtre.
        </p>
      )}
    </div>
  );
}
