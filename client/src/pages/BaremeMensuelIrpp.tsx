/**
 * LA RETENUE D'IRPP LUE AU MOIS · l'écran de simulation et le bulletin émis
 * affichent le même tableau.
 *
 * Le serveur calcule sur l'année, comme l'article 118 l'écrit (arrondi au
 * millier compris), puis relit son verdict avec les tranches divisées par
 * douze. Ce composant ne calcule rien : il montre ce que le serveur a rendu,
 * sans quoi l'écran et le bulletin pourraient dire deux impôts différents.
 */

export type DetailMensuelIrpp = {
  revenuRetenuFc: number;
  parTranche: { tauxPourCent: number; deFc: number; aFc: number | null; baseFc: number; impotFc: number }[];
  impotDuBaremeFc: number;
  plafondFc: number;
  plafondApplique: boolean;
  impotArticle118Fc: number;
  quotitePourCent: number;
  reductionFc: number;
  retenueFc: number;
};

const fc = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entier = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

export function BaremeMensuelIrpp({
  mensuel,
  revenuAnnualiseFc,
}: {
  mensuel: DetailMensuelIrpp;
  revenuAnnualiseFc?: number;
}) {
  return (
    <div className="text-[11px] mt-1.5">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-1">Tranche mensuelle</th>
            <th className="py-1 text-right">Taux</th>
            <th className="py-1 text-right">Base du mois</th>
            <th className="py-1 text-right">Impôt</th>
          </tr>
        </thead>
        <tbody>
          {mensuel.parTranche.map((t) => (
            <tr key={t.tauxPourCent} className="border-b border-border/40">
              <td className="py-1">
                {t.aFc === null ? `Au-delà de ${entier(t.deFc)}` : `${entier(t.deFc)} à ${entier(t.aFc)}`}
              </td>
              <td className="py-1 text-right">{t.tauxPourCent} %</td>
              <td className="py-1 text-right font-mono">{fc(t.baseFc)}</td>
              <td className="py-1 text-right font-mono">{fc(t.impotFc)}</td>
            </tr>
          ))}
          <tr className="border-b border-border/40">
            <td className="py-1" colSpan={3}>
              Barème (art. 118)
            </td>
            <td className="py-1 text-right font-mono">{fc(mensuel.impotDuBaremeFc)}</td>
          </tr>
          {mensuel.plafondApplique && (
            <tr className="border-b border-border/40">
              <td className="py-1" colSpan={3}>
                Ramené au plafond de 30 % du revenu imposable (art. 118, al. 2)
              </td>
              <td className="py-1 text-right font-mono">{fc(mensuel.impotArticle118Fc)}</td>
            </tr>
          )}
          {mensuel.quotitePourCent > 0 && (
            <tr className="border-b border-border/40">
              <td className="py-1" colSpan={3}>
                Charges de famille, {mensuel.quotitePourCent} % (art. 123)
              </td>
              <td className="py-1 text-right font-mono">− {fc(mensuel.reductionFc)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="py-1" colSpan={3}>
              Retenue du mois
            </td>
            <td className="py-1 text-right font-mono">{fc(mensuel.retenueFc)}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <div className="text-text-dim mt-1">
        Revenu imposable retenu : {fc(mensuel.revenuRetenuFc)} FC par mois
        {revenuAnnualiseFc !== undefined && (
          <> ({fc(revenuAnnualiseFc)} FC sur l’année, arrondis au millier inférieur comme l’écrit l’art. 118)</>
        )}
        . Tranches de l’article 118 divisées par douze.
      </div>
    </div>
  );
}
