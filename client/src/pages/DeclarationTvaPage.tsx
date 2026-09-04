import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { IconCheck } from '../components/chrome/icons';
import type { DeclarationTva, ProrataDefinitifTva } from '../lib/types';

function premierJourDuMois(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function DeclarationTvaPage() {
  const { exerciceCourant } = useExercice();
  const [dateDebut, setDateDebut] = useState(premierJourDuMois());
  const [dateFin, setDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [declaration, setDeclaration] = useState<DeclarationTva | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [comptabilisation, setComptabilisation] = useState(false);
  const [annee, setAnnee] = useState(new Date().getFullYear() - 1);
  const [definitif, setDefinitif] = useState<ProrataDefinitifTva | null>(null);

  const calculer = async (e?: FormEvent) => {
    e?.preventDefault();
    setChargement(true);
    setErreur(null);
    setInfo(null);
    try {
      setDeclaration(await api.get<DeclarationTva>(`/taux-tva/declaration?dateDebut=${dateDebut}&dateFin=${dateFin}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de calculer la déclaration');
    } finally {
      setChargement(false);
    }
  };

  const comptabiliserLiquidation = async () => {
    if (!exerciceCourant || !declaration) return;
    if (
      !confirm(
        `Comptabiliser la liquidation TVA du ${dateDebut} au ${dateFin} ?\n\nPose une écriture qui solde la TVA collectée et déductible admise sur le compte 444 (${
          declaration.sens === 'A_PAYER' ? `TVA due : ${declaration.net.toLocaleString('fr-FR')} CDF` : `crédit de TVA à reporter : ${Math.abs(declaration.net).toLocaleString('fr-FR')} CDF`
        }). Action irréversible comme n'importe quelle écriture comptabilisée.`,
      )
    ) {
      return;
    }
    setComptabilisation(true);
    setErreur(null);
    setInfo(null);
    try {
      const resultat = await api.post<{ ecriture: { numeroPiece: number | null } }>('/taux-tva/declaration/comptabiliser', {
        exerciceId: exerciceCourant.id,
        dateDebut,
        dateFin,
      });
      setInfo(`Liquidation comptabilisée (pièce n°${resultat.ecriture.numeroPiece ?? '·'}).`);
      await calculer();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de comptabiliser la liquidation');
    } finally {
      setComptabilisation(false);
    }
  };

  const annulerLiquidation = async () => {
    if (!declaration?.liquidation.faite) return;
    if (
      !confirm(
        `Annuler la liquidation du ${declaration.liquidation.dateDebut} au ${declaration.liquidation.dateFin} ?\n\n` +
          "Son écriture est supprimée, et la période redevient liquidable. C'est la marche arrière d'une " +
          "erreur de période · sans elle, une liquidation posée sur les mauvaises bornes bloquerait " +
          'définitivement les mois qu\'elle recouvre.',
      )
    ) {
      return;
    }
    setComptabilisation(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.delete(`/taux-tva/liquidations/${declaration.liquidation.id}`);
      setInfo('Liquidation annulée · la période est de nouveau liquidable.');
      await calculer();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible d'annuler la liquidation");
    } finally {
      setComptabilisation(false);
    }
  };

  const arreterProrataDefinitif = async () => {
    setErreur(null);
    try {
      setDefinitif(await api.get<ProrataDefinitifTva>(`/taux-tva/prorata-definitif?annee=${annee}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de calculer le prorata définitif');
    }
  };

  return (
    <div className="p-2">
      <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
      <h1 className="text-[12px] font-bold leading-tight mb-1.5">Déclaration de TVA</h1>
      <p className="text-[10.5px] text-text-dim mb-3 max-w-[720px]">
        Registre de suivi par taux sur une période : TVA collectée (443) et TVA déductible (445), à partir des
        lignes d'écriture posées par la saisie « Achat/Vente avec TVA ». Le prorata de déduction (art. 43 O.-L.
        10/001, rapport recettes taxables / recettes totales, arrondi à l'unité supérieure) est appliqué à la TVA
        déductible brute.
      </p>

      <form onSubmit={calculer} className="flex items-end gap-3 mb-4 max-w-[560px]">
        <label className="text-[10.5px] font-semibold text-text-dim">
          Du
          <input
            required
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="mt-1 block border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
          />
        </label>
        <label className="text-[10.5px] font-semibold text-text-dim">
          Au
          <input
            required
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="mt-1 block border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
          />
        </label>
        <button type="submit" disabled={chargement} className="bg-sel text-white text-[11px] font-semibold px-4 py-1.5 disabled:opacity-50">
          {chargement ? 'Calcul…' : 'Calculer'}
        </button>
      </form>

      {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[780px]">{erreur}</div>}
      {info && <div className="text-[11px] text-positive bg-positive-soft border border-positive/30 px-2.5 py-1.5 mb-3 max-w-[780px]">{info}</div>}

      {declaration && (
        <>
          {/* RÉGIME D'EXIGIBILITÉ · un total de TVA ne se vérifie pas sans lui.
              Le même chiffre d'affaires donne deux déclarations différentes
              selon que la taxe est due à la facture ou au règlement. */}
          <div className="border border-border bg-surface-alt max-w-[780px] mb-3 px-3.5 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] font-bold text-text-dim">EXIGIBILITÉ</span>
              <span
                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 ${
                  declaration.regimeExigibilite === 'ENCAISSEMENTS'
                    ? 'bg-positive-soft text-positive'
                    : 'bg-chrome text-text-dim'
                }`}
              >
                {declaration.regimeExigibilite === 'ENCAISSEMENTS'
                  ? 'ENCAISSEMENTS'
                  : declaration.regimeExigibilite === 'DEBITS'
                    ? 'DÉBITS'
                    : 'LIVRAISONS'}
              </span>
            </div>
            <div className="text-[10.5px] text-text-dim leading-[1.45]">{declaration.mentionExigibilite}</div>
            {declaration.tvaEnAttenteEncaissement > 0 && (
              <div className="mt-2 pt-2 border-t border-border font-mono text-[10.5px]">
                TVA facturée sur la période et pas encore encaissée :{' '}
                <span className="font-semibold text-warning">
                  {declaration.tvaEnAttenteEncaissement.toLocaleString('fr-FR')} CDF
                </span>
                <div className="text-[10px] text-text-dim mt-0.5">
                  Elle n’est pas due tant que le client n’a pas réglé, et deviendra exigible sur la période de
                  l’encaissement. Elle explique l’écart entre le chiffre d’affaires de la période et la taxe déclarée.
                </div>
              </div>
            )}
          </div>

          <div className="border border-border bg-surface shadow-posee max-w-[780px] mb-4">
            <div className="grid grid-cols-[80px_1fr_70px_140px_140px_140px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
              <span>CODE</span><span>INTITULÉ</span><span>TAUX</span><span className="text-right">COLLECTÉE</span><span className="text-right">DÉDUCTIBLE</span><span className="text-right">NET</span>
            </div>
            {declaration.lignes.length === 0 && (
              <div className="p-3 text-[11px] text-text-dim">Aucun mouvement de TVA sur cette période.</div>
            )}
            {declaration.lignes.map((l, i) => (
              <div
                key={l.tauxId}
                className={`grid grid-cols-[80px_1fr_70px_140px_140px_140px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 text-[10.5px] font-mono ${
                  i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                <span className="font-semibold">{l.code}</span>
                <span className="truncate">{l.intitule}</span>
                <span className="text-right">{l.taux} %</span>
                <span className="text-right">{l.totalCollecte.toLocaleString('fr-FR')}</span>
                <span className="text-right">{l.totalDeductible.toLocaleString('fr-FR')}</span>
                <span className="text-right">{l.net.toLocaleString('fr-FR')}</span>
              </div>
            ))}
          </div>

          <div className="border border-border max-w-[780px] p-4 mb-4 bg-surface-alt">
            <div className="font-mono text-[10px] font-semibold text-text-dim mb-2">PRORATA DE DÉDUCTION (art. 43 O.-L. 10/001)</div>
            <div className="grid grid-cols-3 gap-3 font-mono text-[10.5px]">
              <div>
                Recettes taxables (numérateur)
                <div className="font-semibold text-[12px]">{declaration.prorata.numerateur.toLocaleString('fr-FR')} CDF</div>
              </div>
              <div>
                Recettes totales (dénominateur)
                <div className="font-semibold text-[12px]">{declaration.prorata.denominateur.toLocaleString('fr-FR')} CDF</div>
              </div>
              <div>
                Prorata (arrondi ↑)
                <div className="font-semibold text-[12px]">{declaration.prorata.pourcentage} %</div>
              </div>
            </div>
            <div className="mt-2 font-mono text-[10.5px] text-text-dim">
              TVA déductible brute {declaration.totalDeductible.toLocaleString('fr-FR')} × {declaration.prorata.pourcentage} % ={' '}
              <span className="font-semibold text-text">TVA déductible admise {declaration.totalDeductibleAdmise.toLocaleString('fr-FR')} CDF</span>
            </div>
          </div>

          <div className="border border-border max-w-[780px] p-4 bg-surface flex items-center justify-between">
            {/* L'IMPUTATION DU CRÉDIT REPORTÉ · art. 63 O.-L. 10/001. Le net
                affiché à droite est celui d'APRÈS imputation ; sans ces trois
                lignes, l'écart entre la taxe de la période et le montant à
                payer ne s'explique nulle part, et le crédit du mois précédent
                semble s'être évaporé. Elles ne s'affichent que lorsqu'un
                crédit existe : une déclaration ordinaire garde ses deux
                lignes d'origine. */}
            <div className="font-mono text-[10.5px] text-text-dim">
              <div>Total TVA collectée : <span className="font-semibold text-text">{declaration.totalCollecte.toLocaleString('fr-FR')} CDF</span></div>
              <div>Total TVA déductible admise : <span className="font-semibold text-text">{declaration.totalDeductibleAdmise.toLocaleString('fr-FR')} CDF</span></div>
              {declaration.creditAnterieur > 0 && (
                <>
                  <div className="mt-1 pt-1 border-t border-border">
                    Taxe de la période, avant report :{' '}
                    <span className="font-semibold text-text">
                      {declaration.netAvantImputation.toLocaleString('fr-FR')} CDF
                    </span>
                  </div>
                  <div>
                    Crédit de TVA reporté (art. 63) :{' '}
                    <span className="font-semibold text-text">
                      {declaration.creditAnterieur.toLocaleString('fr-FR')} CDF
                    </span>
                    {declaration.creditAnterieurOrigine && (
                      <span className="text-text-dim">
                        {' '}· liquidation du {declaration.creditAnterieurOrigine.dateDebut} au{' '}
                        {declaration.creditAnterieurOrigine.dateFin}
                      </span>
                    )}
                  </div>
                  <div>
                    Imputé sur la taxe de la période :{' '}
                    <span className="font-semibold text-positive">
                      {declaration.creditImpute.toLocaleString('fr-FR')} CDF
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold text-text-dim mb-1">
                {declaration.sens === 'A_PAYER' ? 'TVA NETTE À DÉCAISSER' : 'CRÉDIT DE TVA À REPORTER'}
              </div>
              <div className={`text-[16px] font-bold ${declaration.sens === 'A_PAYER' ? 'text-danger' : 'text-positive'}`}>
                {Math.abs(declaration.net).toLocaleString('fr-FR')} CDF
              </div>
            </div>
          </div>

          {declaration.liquidation.faite ? (
            <div className="mt-4 border border-border bg-surface-alt max-w-[780px] px-4 py-3 text-[10.5px]">
              <div className="font-semibold mb-1">Période déjà liquidée</div>
              <p className="text-text-dim">
                {declaration.liquidation.memePeriode
                  ? 'Cette période a été liquidée : '
                  : 'Une liquidation recouvre cette période sans lui correspondre exactement (du ' +
                    `${declaration.liquidation.dateDebut} au ${declaration.liquidation.dateFin}) : `}
                « {declaration.liquidation.libelleEcriture} ». La comptabiliser une seconde fois porterait le
                double de la dette sur le compte 444, sans que rien ne le signale.
              </p>
              <button
                onClick={annulerLiquidation}
                disabled={comptabilisation}
                className="mt-2 border border-border-dark bg-surface px-3 py-1 text-[10.5px] font-semibold disabled:opacity-50"
              >
                {comptabilisation ? 'Annulation…' : 'Annuler cette liquidation'}
              </button>
            </div>
          ) : (
            (declaration.totalCollecte > 0 || declaration.totalDeductibleAdmise > 0) && (
              <button
                onClick={comptabiliserLiquidation}
                disabled={comptabilisation || !exerciceCourant}
                className="mt-4 bg-sel text-white text-[11px] font-semibold px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
              >
                <IconCheck width={14} height={14} />
                {comptabilisation ? 'Comptabilisation…' : 'Comptabiliser la liquidation'}
              </button>
            )
          )}

          {/*
            PRORATA DÉFINITIF · le calcul existait, complet et testé, et aucune
            route ne l'appelait : il était rigoureusement inaccessible depuis le
            logiciel. Une obligation annuelle que le produit sait calculer mais
            ne montre pas est une obligation que le cabinet oublie.
          */}
          <div className="mt-5 border border-border max-w-[780px] p-4 bg-surface">
            <div className="text-[11px] font-bold mb-1">Arrêté du prorata définitif</div>
            <p className="text-[10.5px] text-text-dim mb-2">
              L'article 45 impose un prorata provisoire, calculé sur les recettes de l'année précédente et
              appliqué à toutes les déclarations de l'année, puis un prorata définitif arrêté au plus tard le
              31 mars suivant, qui donne lieu à régularisation des déductions déjà opérées.
            </p>
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-text-dim">ANNÉE CIVILE</span>
                <input
                  type="number"
                  value={annee}
                  onChange={(e) => setAnnee(Number(e.target.value))}
                  className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] font-mono w-[110px]"
                />
              </label>
              <button
                onClick={arreterProrataDefinitif}
                className="border border-border-dark bg-surface-alt px-3 py-1 text-[10.5px] font-semibold"
              >
                Arrêter le prorata définitif
              </button>
            </div>

            {definitif && (
              <div className="mt-3 font-mono text-[10.5px] text-text-dim space-y-0.5">
                <div>
                  Prorata définitif {definitif.annee} :{' '}
                  <span className="font-semibold text-text">{definitif.definitif.pourcentage} %</span> · prorata
                  provisoire appliqué : <span className="font-semibold text-text">{definitif.pourcentageApplique} %</span>
                </div>
                <div>
                  TVA déductible brute : {definitif.tvaDeductibleBrute.toLocaleString('fr-FR')} CDF · admise au
                  définitif : {definitif.admiseDefinitive.toLocaleString('fr-FR')} CDF · déjà déduite :{' '}
                  {definitif.admiseAppliquee.toLocaleString('fr-FR')} CDF
                </div>
                {/* « AUCUNE RÉGULARISATION » NE VEUT PAS DIRE LA MÊME CHOSE
                    DANS LES DEUX CAS. Quand une déduction a été opérée et que
                    le définitif rejoint le provisoire, il n'y a rien à
                    régulariser · c'est le premier message. Quand AUCUNE
                    liquidation ne porte de prorata appliqué, l'assiette
                    régularisable est nulle par construction, et l'écrire
                    « le définitif rejoint le provisoire » est faux : il n'y a
                    pas de provisoire. C'est exactement le cas du nouvel
                    assujetti. */}
                <div className="pt-1 text-[11px] text-text font-semibold">
                  {definitif.tvaDeductibleBrute <= 0
                    ? 'Rien à régulariser · aucune liquidation de l’année ne porte de prorata appliqué, donc aucune déduction n’a été opérée.'
                    : definitif.sens === 'AUCUNE'
                      ? 'Aucune régularisation · le définitif rejoint le provisoire.'
                      : definitif.sens === 'DEDUCTION_COMPLEMENTAIRE'
                        ? `Déduction complémentaire de ${Math.abs(definitif.regularisation).toLocaleString('fr-FR')} CDF.`
                        : `Reversement de ${Math.abs(definitif.regularisation).toLocaleString('fr-FR')} CDF.`}
                </div>
                {definitif.tvaDeductibleNonLiquidee > 0 && (
                  <div className="text-warning">
                    {definitif.tvaDeductibleNonLiquidee.toLocaleString('fr-FR')} CDF de TVA d’amont de l’année ne
                    sont couverts par aucune liquidation et restent hors de cette régularisation.
                  </div>
                )}
                {definitif.periodes.length > 0 && (
                  <div className="pt-1 text-text-dim">
                    Prorata réellement appliqué, période par période :{' '}
                    {definitif.periodes
                      .map((x) => `${x.pourcentageApplique} % du ${x.dateDebut} au ${x.dateFin}`)
                      .join(' · ')}
                    .
                  </div>
                )}
                <div className="text-text-dim">{definitif.echeance}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
