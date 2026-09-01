/**
 * Écran affiché à la place d'un état financier pour un dossier SYSCOHADA ·
 * le « niveau tenue » du référentiel est complet (plan de comptes, journaux,
 * grand livre, balance, taxes, immobilisations), mais les états financiers
 * SYSCOHADA (bilan, compte de résultat, TFT, liasse, notes) ne sont pas
 * encore montés. Dire « en construction » plutôt que d'imprimer les états
 * SYCEBNL sous une en-tête d'entreprise · le serveur refuse de toute façon
 * ces routes à un dossier SYSCOHADA (ReferentielGuard).
 */
export function EnConstructionSyscohada({ fenetre }: { fenetre: string }) {
  return (
    <div className="p-6 max-w-[560px]">
      <div className="border border-border rounded-[8px] bg-chrome-alt p-4">
        <h2 className="text-[13px] font-bold mb-2">{fenetre} · SYSCOHADA en construction</h2>
        <p className="text-[11px] text-text-dim leading-[1.7] mb-2">
          Ce dossier est tenu selon le SYSCOHADA révisé. Sa tenue est complète dans OmegaX : saisie des journaux,
          grand livre, balance, lettrage, taxes, immobilisations et éditions comptables fonctionnent normalement.
        </p>
        <p className="text-[11px] text-text-dim leading-[1.7]">
          Les états financiers SYSCOHADA (bilan, compte de résultat, tableau des flux, notes annexes et liasse) sont
          en cours de construction et ouvriront dans une prochaine version. En attendant, la balance des comptes
          (menu État) reste la base de travail pour monter les états hors d'OmegaX.
        </p>
      </div>
    </div>
  );
}
