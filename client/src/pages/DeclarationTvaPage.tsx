import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { IconCheck } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import type { DeclarationTva, ProrataDefinitifTva } from '../lib/types';
import { montant } from '../lib/montants';

/** Une liquidation déjà comptabilisée, telle que `GET /taux-tva/liquidations` la rend. */
interface LiquidationTvaListee {
  id: string;
  dateDebut: string;
  dateFin: string;
  net: number;
  prorataApplique: number;
  ecriture: { id: string; libelle: string; date: string; numeroPiece: number | null } | null;
}

function premierJourDuMois(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function DeclarationTvaPage() {
  const { peutEcrire } = useAuth();
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
  const [liquidations, setLiquidations] = useState<LiquidationTvaListee[] | null>(null);

  /**
   * Le registre des liquidations (audit de l'interface du 2026-09-27, I12) ·
   * la route le servait et aucun écran ne le lisait. Une liquidation posée sur
   * de mauvaises bornes ne se retrouvait qu'en recalculant EXACTEMENT sa
   * période, alors que c'est justement la période qu'on ignore quand on s'est
   * trompé. La liste les rend toutes, chacune annulable.
   */
  const chargerLiquidations = () =>
    api.get<LiquidationTvaListee[]>('/taux-tva/liquidations').then(setLiquidations, () => setLiquidations(null));

  useEffect(() => {
    void chargerLiquidations();
  }, []);

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
          declaration.sens === 'A_PAYER' ? `TVA due : ${montant(declaration.net)} CDF` : `crédit de TVA à reporter : ${montant(Math.abs(declaration.net))} CDF`
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
      await chargerLiquidations();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de comptabiliser la liquidation');
    } finally {
      setComptabilisation(false);
    }
  };

  const annulerLiquidation = async (l: { id: string; dateDebut: string; dateFin: string }) => {
    if (
      !confirm(
        `Annuler la liquidation du ${l.dateDebut} au ${l.dateFin} ?\n\n` +
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
      await api.delete(`/taux-tva/liquidations/${l.id}`);
      setInfo('Liquidation annulée · la période est de nouveau liquidable.');
      await chargerLiquidations();
      if (declaration) await calculer();
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
      <form onSubmit={calculer} className="flex items-end gap-3 mb-4 max-w-[560px]">
        <label className="text-[11.5px] font-semibold text-text-dim">
          Du
          <input
            required
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="mt-1 block border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
          />
        </label>
        <label className="text-[11.5px] font-semibold text-text-dim">
          Au
          <input
            required
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="mt-1 block border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
          />
        </label>
        <button type="submit" disabled={chargement} className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
          {chargement ? 'Calcul…' : 'Calculer'}
        </button>
        <span className="pb-1.5">
          <Aide
            titre="Déclaration de TVA"
            texte="Registre de suivi par taux sur une période : TVA collectée (443) et TVA déductible (445), à partir des lignes d'écriture posées par la saisie « Achat/Vente avec TVA ». Le prorata de déduction (rapport recettes taxables / recettes totales, arrondi à l'unité supérieure) est appliqué à la TVA déductible brute."
            source="O.-L. n° 10/001, art. 43"
          />
        </span>
      </form>

      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[780px]">{erreur}</div>}
      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-2.5 py-1.5 mb-3 max-w-[780px]">{info}</div>}

      {declaration && (
        <>
          {/* LE BROUILLARD N'EST PAS DÉCLARÉ (audit F25) · une facture oubliée
              au brouillard sortirait de la taxe sans rien dire. L'alerte porte
              sur une donnée du dossier, elle reste donc à l'écran. */}
          {declaration.tvaAuBrouillard?.ecritures > 0 && (
            <div className="text-[11.5px] text-warning bg-warning-soft border border-warning/30 px-2.5 py-1.5 mb-3 max-w-[780px]">
              TVA au brouillard, hors de cette déclaration · {declaration.tvaAuBrouillard.ecritures} écriture(s),{' '}
              {montant(declaration.tvaAuBrouillard.collecte)} CDF facturée,{' '}
              {montant(declaration.tvaAuBrouillard.deductible)} CDF récupérable. Validez-les avant de
              déclarer.
            </div>
          )}
          {/* RÉGIME D'EXIGIBILITÉ · un total de TVA ne se vérifie pas sans lui.
              Le même chiffre d'affaires donne deux déclarations différentes
              selon que la taxe est due à la facture ou au règlement. */}
          <div className="border border-border bg-surface-alt max-w-[780px] mb-3 px-3.5 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[11px] font-bold text-text-dim">Exigibilité</span>
              <span
                className={`font-mono text-[11px] font-bold px-1.5 py-0.5 ${
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
            <div className="text-[11.5px] text-text-dim leading-[1.45]">{declaration.mentionExigibilite}</div>
            {declaration.tvaEnAttenteEncaissement > 0 && (
              <div className="mt-2 pt-2 border-t border-border font-mono text-[11.5px]">
                TVA facturée sur la période et pas encore encaissée :{' '}
                <span className="font-semibold text-warning">
                  {montant(declaration.tvaEnAttenteEncaissement)} CDF
                </span>{' '}
                <Aide
                  titre="TVA pas encore encaissée"
                  texte="Elle n’est pas due tant que le client n’a pas réglé, et deviendra exigible sur la période de l’encaissement. Elle explique l’écart entre le chiffre d’affaires de la période et la taxe déclarée."
                  source="Régime d’exigibilité · encaissements"
                />
              </div>
            )}
          </div>

          <div
            // `overflow-x-auto` ici, `min-w` sur les lignes · les 638 px de colonnes
            // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
            // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
            // qui emportait alors titre, onglets et boutons hors de l'écran.
            className="border border-border bg-surface shadow-posee max-w-[780px] mb-4 overflow-x-auto"
          >
            <div className="grid grid-cols-[80px_1fr_70px_140px_140px_140px] min-w-[790px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[11px] font-bold text-text-dim">
              <span>CODE</span><span>Intitulé</span><span>TAUX</span><span className="text-right">Collectée</span><span className="text-right">Déductible</span><span className="text-right">NET</span>
            </div>
            {declaration.lignes.length === 0 && (
              <div className="p-3 text-[11.5px] text-text-dim">Aucun mouvement de TVA sur cette période.</div>
            )}
            {declaration.lignes.map((l, i) => (
              <div
                key={l.tauxId}
                className={`grid grid-cols-[80px_1fr_70px_140px_140px_140px] min-w-[790px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 text-[11.5px] font-mono ${
                  i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                <span className="font-semibold">{l.code}</span>
                <span className="truncate">{l.intitule}</span>
                <span className="text-right">{l.taux} %</span>
                <span className="text-right">{montant(l.totalCollecte)}</span>
                <span className="text-right">{montant(l.totalDeductible)}</span>
                <span className="text-right">{montant(l.net)}</span>
              </div>
            ))}
          </div>

          <div className="border border-border max-w-[780px] p-4 mb-4 bg-surface-alt">
            <div className="font-mono text-[11px] font-semibold text-text-dim mb-2" title="O.-L. n° 10/001, art. 43">PRORATA DE DÉDUCTION</div>
            <div className="grid grid-cols-3 gap-3 font-mono text-[11.5px]">
              <div>
                Recettes taxables (numérateur)
                <div className="font-semibold text-[12px]">{montant(declaration.prorata.numerateur)} CDF</div>
              </div>
              <div>
                Recettes totales (dénominateur)
                <div className="font-semibold text-[12px]">{montant(declaration.prorata.denominateur)} CDF</div>
              </div>
              <div>
                Prorata (arrondi ↑)
                <div className="font-semibold text-[12px]">{declaration.prorata.pourcentage} %</div>
              </div>
            </div>
            <div className="mt-2 font-mono text-[11.5px] text-text-dim">
              TVA déductible brute {montant(declaration.totalDeductible)} × {declaration.prorata.pourcentage} % ={' '}
              <span className="font-semibold text-text">TVA déductible admise {montant(declaration.totalDeductibleAdmise)} CDF</span>
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
            <div className="font-mono text-[11.5px] text-text-dim">
              <div>Total TVA collectée : <span className="font-semibold text-text">{montant(declaration.totalCollecte)} CDF</span></div>
              <div>Total TVA déductible admise : <span className="font-semibold text-text">{montant(declaration.totalDeductibleAdmise)} CDF</span></div>
              {/* CE QUI MODIFIE LE NET, LIGNE À LIGNE · trois de ces montants
                  entrent dans le calcul et n'étaient lisibles que noyés dans le
                  paragraphe d'exigibilité. Un net qu'on ne peut pas recomposer
                  de l'écran ne se vérifie pas. */}
              {declaration.recuperationArt52 > 0 && (
                <div title="O.-L. n° 10/001, art. 52">
                  Avoirs antérieurs récupérés :{' '}
                  <span className="font-semibold text-positive">
                    {montant(declaration.recuperationArt52)} CDF
                  </span>
                </div>
              )}
              {/* LIGNE A7, E2 · la TVA d'une créance irrécouvrable, sur sa propre
                  ligne · déduite le mois qui suit sa constatation (décret
                  n° 011/42, art. 126), jamais retranchée de la collecte du mois
                  de la perte. */}
              {declaration.recuperationCreancesIrrecouvrables > 0 && (
                <div title="O.-L. n° 10/001, art. 52 ; décret n° 011/42, art. 126 et 127">
                  Récupération sur créance irrécouvrable, art. 52 :{' '}
                  <span className="font-semibold text-positive">
                    {montant(declaration.recuperationCreancesIrrecouvrables)} CDF
                  </span>
                </div>
              )}
              {declaration.creancesIrrecouvrablesConstatees > 0 && (
                <div>
                  TVA de créances irrécouvrables constatée ce mois :{' '}
                  <span className="font-semibold text-text">
                    {montant(declaration.creancesIrrecouvrablesConstatees)} CDF
                  </span>
                  <span className="text-text-dim" title="Décret n° 011/42, art. 126"> · déduite sur la déclaration du mois suivant</span>
                </div>
              )}
              {declaration.avoirsCollecteConstates > 0 && (
                <div>
                  Avoirs sur ventes constatés ce mois :{' '}
                  <span className="font-semibold text-text">
                    {montant(declaration.avoirsCollecteConstates)} CDF
                  </span>
                  <span className="text-text-dim" title="Décret n° 011/42, art. 126"> · imputables sur la déclaration suivante</span>
                </div>
              )}
              {declaration.avoirsCollecteNonImputes > 0 && (
                <div className="text-warning">
                  Avoirs qu’aucune liquidation ne permet de situer :{' '}
                  {montant(declaration.avoirsCollecteNonImputes)} CDF
                </div>
              )}
              {declaration.tvaExclueArt41 > 0 && (
                <div title="O.-L. n° 10/001, art. 41">
                  TVA exclue du droit à déduction :{' '}
                  <span className="font-semibold text-danger">
                    {montant(declaration.tvaExclueArt41)} CDF
                  </span>
                  <span className="text-text-dim"> · jamais déductible</span>
                </div>
              )}
              {declaration.tvaAVerifierArt41 > 0 && (
                <div className="text-warning" title="O.-L. n° 10/001, art. 41">
                  TVA sur des postes exclus SOUS CONDITION, à vérifier :{' '}
                  {montant(declaration.tvaAVerifierArt41)} CDF
                </div>
              )}
              {declaration.tvaDeductibleDechue > 0 && (
                <div className="text-danger" title="O.-L. n° 10/001, art. 37, al. 2">
                  TVA dont le délai de déduction est expiré :{' '}
                  {montant(declaration.tvaDeductibleDechue)} CDF
                </div>
              )}
              {declaration.tvaNatureDepenseIllisible > 0 && (
                <div className="text-warning">
                  TVA dont l’écriture ne porte aucune charge lisible :{' '}
                  {montant(declaration.tvaNatureDepenseIllisible)} CDF
                </div>
              )}
              {declaration.creditAnterieur > 0 && (
                <>
                  <div className="mt-1 pt-1 border-t border-border">
                    Taxe de la période, avant report :{' '}
                    <span className="font-semibold text-text">
                      {montant(declaration.netAvantImputation)} CDF
                    </span>
                  </div>
                  <div title="O.-L. n° 10/001, art. 63">
                    Crédit de TVA reporté :{' '}
                    <span className="font-semibold text-text">
                      {montant(declaration.creditAnterieur)} CDF
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
                      {montant(declaration.creditImpute)} CDF
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="font-mono text-[11px] font-semibold text-text-dim mb-1">
                {declaration.sens === 'A_PAYER' ? 'TVA NETTE À DÉCAISSER' : 'CRÉDIT DE TVA À REPORTER'}
              </div>
              <div className={`text-[14px] font-bold ${declaration.sens === 'A_PAYER' ? 'text-danger' : 'text-positive'}`}>
                {montant(Math.abs(declaration.net))} CDF
              </div>
            </div>
          </div>

          {declaration.liquidation.faite ? (
            <div className="mt-4 border border-border bg-surface-alt max-w-[780px] px-4 py-3 text-[11.5px]">
              <div className="font-semibold mb-1 flex items-center gap-1.5">
                Période déjà liquidée
                <Aide
                  titre="Période déjà liquidée"
                  texte="La comptabiliser une seconde fois porterait le double de la dette sur le compte 444, sans que rien ne le signale."
                  source="Compte 444"
                />
              </div>
              <p className="text-text-dim">
                {declaration.liquidation.memePeriode
                  ? 'Cette période a été liquidée : '
                  : 'Une liquidation recouvre cette période sans lui correspondre exactement (du ' +
                    `${declaration.liquidation.dateDebut} au ${declaration.liquidation.dateFin}) : `}
                « {declaration.liquidation.libelleEcriture} ».
              </p>
              {/* Liquider et annuler sont réservés à ADMIN_CABINET et COMPTABLE
                  côté serveur · la lecture seule garde le calcul et l'avertissement. */}
              {peutEcrire && (
                <button
                  onClick={() => {
                    const l = declaration.liquidation;
                    if (l.faite) void annulerLiquidation(l);
                  }}
                  disabled={comptabilisation}
                  className="mt-2 border border-border-dark bg-surface px-3 py-1 text-[11.5px] font-semibold disabled:opacity-50"
                >
                  {comptabilisation ? 'Annulation…' : 'Annuler cette liquidation'}
                </button>
              )}
            </div>
          ) : (
            /*
              CE QUE CETTE CONDITION CACHAIT. Le serveur liquide désormais deux
              périodes que ces deux seuls totaux ne décrivent plus.

              · Une période dont le SEUL mouvement est la récupération d'un
                avoir antérieur (art. 52) : collecte nulle, déduction nulle,
                `recuperationArt52` positive. Elle est bel et bien à liquider.
              · Une période dont la déduction admise est NÉGATIVE, parce qu'un
                avoir fournisseur dépasse la déduction du mois (décret art. 127,
                al. 2 · c'est un reversement). Le test `> 0` la rejetait.

              D'où la valeur absolue sur la déduction, et le troisième terme.
            */
            peutEcrire &&
            (declaration.totalCollecte > 0 ||
              Math.abs(declaration.totalDeductibleAdmise) > 0 ||
              declaration.recuperationArt52 > 0 ||
              declaration.recuperationCreancesIrrecouvrables > 0) && (
              <button
                onClick={comptabiliserLiquidation}
                disabled={comptabilisation || !exerciceCourant}
                className="mt-4 bg-sel text-white text-[11.5px] font-semibold px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
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
            <div className="text-[11.5px] font-bold mb-2 flex items-center gap-1.5">
              Arrêté du prorata définitif
              <Aide
                titre="Prorata définitif"
                texte="Un prorata provisoire, calculé sur les recettes de l'année précédente, s'applique à toutes les déclarations de l'année ; le prorata définitif est arrêté au plus tard le 31 mars suivant et donne lieu à régularisation des déductions déjà opérées."
                source="O.-L. n° 10/001, art. 45"
              />
            </div>
            <div className="text-[11px] text-text-dim mb-2">
              Deux proratas, article 45 · provisoire toute l'année, définitif au plus tard le 31 mars suivant.
            </div>
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-text-dim">Année civile</span>
                <input
                  type="number"
                  value={annee}
                  onChange={(e) => setAnnee(Number(e.target.value))}
                  className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] font-mono w-[110px]"
                />
              </label>
              <button
                onClick={arreterProrataDefinitif}
                className="border border-border-dark bg-surface-alt px-3 py-1 text-[11.5px] font-semibold"
              >
                Arrêter le prorata définitif
              </button>
            </div>

            {definitif && (
              <div className="mt-3 font-mono text-[11.5px] text-text-dim space-y-0.5">
                <div>
                  Prorata définitif {definitif.annee} :{' '}
                  <span className="font-semibold text-text">{definitif.definitif.pourcentage} %</span> · prorata
                  provisoire appliqué : <span className="font-semibold text-text">{definitif.pourcentageApplique} %</span>
                </div>
                <div>
                  TVA déductible brute : {montant(definitif.tvaDeductibleBrute)} CDF · admise au
                  définitif : {montant(definitif.admiseDefinitive)} CDF · déjà déduite :{' '}
                  {montant(definitif.admiseAppliquee)} CDF
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
                <div className="pt-1 text-[11.5px] text-text font-semibold">
                  {definitif.tvaDeductibleBrute <= 0
                    ? 'Rien à régulariser · aucune liquidation de l’année ne porte de prorata appliqué, donc aucune déduction n’a été opérée.'
                    : definitif.sens === 'AUCUNE'
                      ? 'Aucune régularisation · le définitif rejoint le provisoire.'
                      : definitif.sens === 'DEDUCTION_COMPLEMENTAIRE'
                        ? `Déduction complémentaire de ${montant(Math.abs(definitif.regularisation))} CDF.`
                        : `Reversement de ${montant(Math.abs(definitif.regularisation))} CDF.`}
                </div>
                {definitif.tvaDeductibleNonLiquidee > 0 && (
                  <div className="text-warning">
                    {montant(definitif.tvaDeductibleNonLiquidee)} CDF de TVA d’amont de l’année ne
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

      {liquidations && liquidations.length > 0 && (
        <section className="mt-5 max-w-[780px]">
          <div className="text-[11.5px] font-bold mb-1">Liquidations comptabilisées</div>
          <table className="w-full text-[11.5px]">
            <thead>
              <tr>
                <th className="text-left">Période</th>
                <th className="text-left">Pièce</th>
                <th className="text-right">Net</th>
                <th className="text-right">Prorata</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liquidations.map((l) => (
                <tr key={l.id}>
                  <td>
                    du {l.dateDebut} au {l.dateFin}
                  </td>
                  <td>{l.ecriture ? `n° ${l.ecriture.numeroPiece ?? '·'} · ${l.ecriture.libelle}` : '·'}</td>
                  <td className="text-right">{montant(l.net)} CDF</td>
                  <td className="text-right">{l.prorataApplique.toLocaleString('fr-FR')} %</td>
                  <td className="text-right">
                    {peutEcrire && (
                      <button
                        type="button"
                        disabled={comptabilisation}
                        onClick={() => void annulerLiquidation(l)}
                        className="text-danger/80 hover:text-danger disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
