/**
 * LA RETENUE D'IRPP LUE AU MOIS · l'écran de simulation et le bulletin émis
 * affichent le même tableau.
 *
 * Le serveur calcule sur l'année, comme l'article 118 l'écrit (arrondi au
 * millier compris), puis relit son verdict avec les tranches divisées par
 * douze. Ce composant ne calcule rien : il montre ce que le serveur a rendu,
 * sans quoi l'écran et le bulletin pourraient dire deux impôts différents.
 */
import { Aide } from '../components/chrome/Aide';
import { montant as fc } from '../lib/montants';

export type DetailMensuelIrpp = {
  revenuRetenuFc: number;
  parTranche: { tauxPourCent: number; deFc: number; aFc: number | null; baseFc: number; impotFc: number }[];
  impotDuBaremeFc: number;
  plafondFc: number;
  plafondApplique: boolean;
  impotArticle118Fc: number;
  quotitePourCent: number;
  reductionFc: number;
  /**
   * L'arrondi de l'art. 150 (audit final F111). Absent d'un bulletin émis
   * avant, qui se relit sans lui · un bulletin ne se modifie pas.
   */
  retenueAvantArrondiFc?: number;
  arrondiArticle150Fc?: number;
  retenueFc: number;
};

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
            <td className="py-1" colSpan={3} title="Loi n° 23/053, art. 118">
              Impôt selon le barème
            </td>
            <td className="py-1 text-right font-mono">{fc(mensuel.impotDuBaremeFc)}</td>
          </tr>
          {mensuel.plafondApplique && (
            <tr className="border-b border-border/40">
              <td className="py-1" colSpan={3} title="Loi n° 23/053, art. 118, al. 2">
                Ramené au plafond de 30 % du revenu imposable
              </td>
              <td className="py-1 text-right font-mono">{fc(mensuel.impotArticle118Fc)}</td>
            </tr>
          )}
          {mensuel.quotitePourCent > 0 && (
            <tr className="border-b border-border/40">
              <td className="py-1" colSpan={3} title="Loi n° 23/053, art. 123">
                Réduction pour charges de famille, {mensuel.quotitePourCent} %
              </td>
              <td className="py-1 text-right font-mono">− {fc(mensuel.reductionFc)}</td>
            </tr>
          )}
          {mensuel.arrondiArticle150Fc !== undefined && Math.abs(mensuel.arrondiArticle150Fc) > 0.005 && (
            <tr className="border-b border-border/40">
              <td className="py-1" colSpan={3} title="Loi n° 23/053, art. 150">
                Arrondi à la centaine
              </td>
              <td className="py-1 text-right font-mono">
                {mensuel.arrondiArticle150Fc > 0 ? '+ ' : '− '}
                {fc(Math.abs(mensuel.arrondiArticle150Fc))}
              </td>
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
      <div className="text-text-dim mt-1 flex items-center gap-1.5 flex-wrap">
        <span>
          Revenu imposable retenu : {fc(mensuel.revenuRetenuFc)} FC par mois
          {revenuAnnualiseFc !== undefined && <> ({fc(revenuAnnualiseFc)} FC sur l’année)</>}
        </span>
        <Aide
          titre="Barème mensuel de l’IRPP"
          texte="L’impôt est calculé sur l’année, revenu arrondi au millier inférieur comme l’écrit l’art. 118, puis relu avec les tranches de l’article 118 divisées par douze. La retenue du mois est arrondie à la centaine de francs selon l’art. 150, supérieure dès 50 FC."
          source="Art. 118, 119 et 150"
        />
      </div>
    </div>
  );
}
