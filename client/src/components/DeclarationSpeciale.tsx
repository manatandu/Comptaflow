import { montant } from '../lib/montants';
import { natureDeLaReevaluation, type DeclarationSpeciale } from '../lib/reevaluation-suites';

/**
 * LES ÉLÉMENTS DE LA DÉCLARATION SPÉCIALE, imprimés (ligne A15) · loi
 * n° 23/053, art. 136 et 137. Tout est SERVI par le serveur
 * (`declarationSpeciale`), rien n'est recalculé. Le modèle des imprimés du CPCC
 * n'est pas au corpus · l'édition le dit en tête, et ne dit jamais la
 * déclaration déposée.
 */
export function DeclarationSpecialeImprimee({ d }: { d: DeclarationSpeciale }) {
  if (!d.reevaluation) return null;
  const r = d.reevaluation;
  // Un coefficient n'est pas un montant · il garde sa précision (§ 9 ter).
  const coef = (c: number | null) => (c === null ? '·' : c.toLocaleString('fr-FR', { maximumFractionDigits: 6 }));
  return (
    <div className="impression-seul edition-structure text-[11px] text-black" data-edition="declaration-speciale">
      <p className="mb-1">{d.mentions.modele}</p>
      <p className="mb-1">{d.mentions.echeance} {d.mentions.depot}</p>
      <p className="mb-1">
        {natureDeLaReevaluation(r)} au {new Date(r.dateReevaluation).toLocaleDateString('fr-FR')} · décision : {r.decision}
      </p>
      <p className="mb-1">Méthode : {r.methodeEvaluation}</p>
      <p className="mb-2">Traitement fiscal de l’écart : {r.traitementFiscal}</p>
      {d.categories.map((c) => (
        <table key={c.cle} className="w-full mb-3 border-collapse">
          <thead>
            <tr>
              <th colSpan={11} className="text-left">
                {c.libelle}
                {c.coefficient !== null ? ` · coefficient ${coef(c.coefficient)}` : ''}
                {c.source ? ` · ${c.source}` : ''}
              </th>
            </tr>
            <tr>
              <th className="text-left">Bien</th>
              <th className="text-left">Compte</th>
              <th className="text-left">Acquis le</th>
              <th className="text-right">Brut avant</th>
              <th className="text-right">Amort. avant</th>
              <th className="text-right">Valeur nette</th>
              <th className="text-right">Coefficient retenu</th>
              <th className="text-right">Valeur réévaluée</th>
              <th className="text-right">Brut après</th>
              <th className="text-right">Amort. après</th>
              <th className="text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {c.lignes.map((l) => (
              <tr key={l.immobilisationId}>
                <td>
                  {l.designation}
                  {l.motifNonReevalue ? ` (${l.motifNonReevalue})` : ''}
                </td>
                <td>{l.compte}</td>
                <td>{new Date(l.dateAcquisition).toLocaleDateString('fr-FR')}</td>
                <td className="text-right">{montant(l.brutAvant)}</td>
                <td className="text-right">{montant(l.amortissementsAvant)}</td>
                <td className="text-right">{montant(l.valeurNetteAvant)}</td>
                <td className="text-right">{coef(l.coefficientRetenu)}</td>
                <td className="text-right">{montant(l.valeurReevaluee)}</td>
                <td className="text-right">{montant(l.brutApres)}</td>
                <td className="text-right">{montant(l.amortissementsApres)}</td>
                <td className="text-right">{montant(l.ecart)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td colSpan={3}>Total de la catégorie</td>
              <td className="text-right">{montant(c.total.brutAvant)}</td>
              <td className="text-right">{montant(c.total.amortissementsAvant)}</td>
              <td className="text-right">{montant(c.total.valeurNetteAvant)}</td>
              <td />
              <td className="text-right">{montant(c.total.valeurReevaluee)}</td>
              <td className="text-right">{montant(c.total.brutApres)}</td>
              <td className="text-right">{montant(c.total.amortissementsApres)}</td>
              <td className="text-right">{montant(c.total.ecart)}</td>
            </tr>
          </tbody>
        </table>
      ))}
      {d.total && (
        <p className="font-bold">
          Total général · valeur nette avant {montant(d.total.valeurNetteAvant)} · valeur réévaluée {montant(d.total.valeurReevaluee)} · écart{' '}
          {montant(d.total.ecart)}
        </p>
      )}
    </div>
  );
}
