import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { Aide } from '../components/chrome/Aide';
import { montantOuVide as montant } from '../lib/montants';

/**
 * LES DEUX TABLEAUX DU CYCLE IMMOBILISATIONS · le tableau des immobilisations
 * et le tableau des amortissements, à la présentation des dossiers de révision.
 *
 * Le logiciel tenait la fiche de chaque bien et savait passer sa dotation ; il
 * ne produisait NI l'un NI l'autre de ces deux états, qui sont pourtant les
 * deux premières pièces du cycle chez un réviseur.
 *
 * Le groupement par compte d'imputation, avec sous-total, n'est pas de la
 * mise en forme : c'est lui qui permet de recouper l'état avec la balance,
 * compte par compte. Une liste à plat ne se recoupe avec rien.
 *
 * Les douze colonnes mensuelles du second montrent ce qu'un total annuel
 * cache : le mois d'ENTRÉE du bien, celui de sa SORTIE, et celui où il ACHÈVE
 * de s'amortir.
 */

interface LigneImmo {
  id: string;
  designation: string;
  numeroInventaire: string;
  dateAcquisition: string;
  dureeAns: number;
  valeurBrute: number;
  amortissements: number;
  /** Cumul des 29 à la date d'arrêté · la valeur nette les retranche (audit F131). */
  depreciations: number;
  valeurNette: number;
  statut: string;
  dateSortie: string | null;
}

interface GroupeImmo {
  numero: string;
  intitule: string;
  lignes: LigneImmo[];
  brut: number;
  amortissements: number;
  depreciations: number;
  net: number;
}

interface TableauImmo {
  dateArret: string | null;
  groupes: GroupeImmo[];
  /** Biens sortis à la date d'arrêté · à part, hors des totaux (audit F31). */
  sortis: Array<LigneImmo & { compte: string }>;
  totaux: { brut: number; amortissements: number; depreciations: number; net: number };
}

interface LigneAmort {
  id: string;
  designation: string;
  dateAcquisition: string;
  valeurBrute: number;
  taux: number;
  base: number;
  parMois: number[];
  dotation: number;
  cumulN1: number;
  cumulN: number;
  /** Cumul des 29 à la clôture (audit F131). */
  depreciations: number;
  valeurNette: number;
  dotationPassee: boolean;
  /** Sorti dans l'exercice · sa dotation est celle que la sortie a passée (audit F30). */
  sortiLe: string | null;
  /** Ligne A15 · la hausse du cumul par la réévaluation de l'exercice, passée à sa clôture. */
  ajustementReevaluation?: number;
  /** Ligne A15 · ce que la réévaluation laisse à l'annuité, servi par le serveur (null sans réévaluation). */
  reevaluation?: { produitAnterieur: number; supplement: number; repriseEcart: number } | null;
}

interface GroupeAmort {
  numero: string;
  intitule: string;
  lignes: LigneAmort[];
  parMois: number[];
  dotation: number;
  cumulN1: number;
  cumulN: number;
  depreciations: number;
  net: number;
}

interface TableauAmort {
  exercice: { dateDebut: string; dateFin: string };
  mois: Array<{ cle: string; libelle: string }>;
  groupes: GroupeAmort[];
  totaux: {
    parMois: number[];
    dotation: number;
    cumulN1: number;
    cumulN: number;
    depreciations: number;
    net: number;
    ajustementReevaluation?: number;
    supplementReevaluation?: number;
    repriseEcart?: number;
  };
}

/**
 * `ongletPilote` · quand la fenêtre Immobilisations héberge ces tableaux, c'est
 * elle qui porte les onglets : ils ne sont alors pas redessinés ici.
 */
export function TableauxImmobilisationsPage({ ongletPilote }: { ongletPilote?: 'immobilisations' | 'amortissements' } = {}) {
  const { exerciceCourant } = useExercice();
  const [ongletLocal, setOnglet] = useState<'immobilisations' | 'amortissements'>('immobilisations');
  const onglet = ongletPilote ?? ongletLocal;
  const [dateArret, setDateArret] = useState('');
  const [immo, setImmo] = useState<TableauImmo | null>(null);
  const [amort, setAmort] = useState<TableauAmort | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setErreur(null);
    const q = dateArret ? `?dateArret=${dateArret}` : '';
    api
      .get<TableauImmo>(`/immobilisations/tableau${q}`)
      .then(
        (r) => !annule && setImmo(r),
        (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
      );
    return () => {
      annule = true;
    };
  }, [dateArret]);

  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    api
      .get<TableauAmort>(`/immobilisations/tableau-amortissements?exerciceId=${exerciceCourant.id}`)
      .then(
        (r) => !annule && setAmort(r),
        (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
      );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id]);

  const exporter = () => {
    if (onglet === 'immobilisations') {
      void api.telechargerOuSignaler(
        `/exports/tableau-immobilisations${dateArret ? `?dateArret=${dateArret}` : ''}`,
        'tableau-immobilisations.xlsx',
        setErreur,
      );
    } else if (exerciceCourant) {
      void api.telechargerOuSignaler(
        `/exports/tableau-amortissements?exerciceId=${exerciceCourant.id}`,
        'tableau-amortissements.xlsx',
        setErreur,
      );
    }
  };

  const grilleImmo = 'grid grid-cols-[1fr_112px_64px_130px_130px_130px_130px_150px] gap-2.5';
  const nbMois = amort?.mois.length ?? 12;
  const grilleAmort = {
    display: 'grid',
    gridTemplateColumns: `minmax(220px,1fr) 100px 96px repeat(${nbMois}, 92px) 116px 116px 116px 116px 116px`,
    gap: '8px',
  } as const;

  return (
    <div className="p-2">
      <EnteteImpression titre="Tableaux des immobilisations" />
      <div className="flex items-end justify-end mb-1.5 gap-3 flex-wrap">
        <div className="flex items-end gap-3">
          {onglet === 'immobilisations' && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-text-dim">Arrêté au</span>
              <input
                type="date"
                value={dateArret}
                onChange={(e) => setDateArret(e.target.value)}
                className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] font-mono"
              />
            </label>
          )}
          <button
            type="button"
            onClick={exporter}
            className="border border-border-dark bg-surface-alt px-3 py-1 text-[11.5px] font-semibold"
          >
            Exporter en Excel
          </button>
          <Aide
            className="mb-1"
            titre={onglet === 'immobilisations' ? 'Tableau des immobilisations' : 'Tableau des amortissements'}
            texte={
              onglet === 'immobilisations'
                ? "Les amortissements cumulés incluent l'amortissement antérieur des biens repris d'un dossier précédent : sans lui, un matériel de vingt ans afficherait une valeur nette égale à son brut. Les dotations postérieures à la date d'arrêté sont écartées."
                : "La dotation retenue est celle DÉJÀ COMPTABILISÉE quand elle l'a été ; sinon elle est calculée, et la ligne est marquée « à passer ». La somme des douze colonnes est exactement la dotation, au centime : le reliquat d'arrondi tombe sur le dernier mois servi."
            }
            source="Immobilisations et amortissements"
          />
        </div>
      </div>

      {!ongletPilote && (
      <div className="flex gap-0 mb-2 border-b border-border-dark">
        {(['immobilisations', 'amortissements'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            className={`px-3 py-1 text-[11.5px] font-semibold border border-b-0 -mb-px ${
              onglet === o ? 'bg-surface border-border-dark' : 'bg-surface-alt border-transparent text-text-dim'
            }`}
          >
            {o === 'immobilisations' ? 'Tableau des immobilisations' : 'Tableau des amortissements'}
          </button>
        ))}
      </div>
      )}

      {erreur && (
        <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      {onglet === 'immobilisations' && immo && (
        <div className="border border-border bg-surface shadow-posee overflow-x-auto">
          <div
            className={`${grilleImmo} px-3.5 py-1.5 bg-surface-alt text-[11px] font-bold text-text-dim border-b border-border-dark`}
          >
            <span>Libellé</span>
            <span>Acquisition</span>
            <span className="text-right">Durée</span>
            <span className="text-right">Val. brute</span>
            <span className="text-right">Amort. cumulés</span>
            <span className="text-right">Dépréciations</span>
            <span className="text-right">Val. nette</span>
            <span>Observations</span>
          </div>

          {immo.groupes.length === 0 && (
            <div className="px-3.5 py-4 text-[11.5px] text-text-dim">Aucune immobilisation à cette date.</div>
          )}

          {immo.groupes.map((g) => (
            <div key={g.numero}>
              <div className="px-3.5 py-1 text-[11.5px] font-bold bg-surface-alt/60 border-y border-border/60">
                ({g.numero}) {g.intitule}
              </div>
              {g.lignes.map((l) => (
                <div
                  key={l.id}
                  className={`${grilleImmo} px-3.5 py-[4px] items-center border-b border-border/50 text-[11.5px]`}
                >
                  <span className="truncate" title={l.designation}>
                    {l.designation}
                  </span>
                  <span className="font-mono">{new Date(l.dateAcquisition).toLocaleDateString('fr-FR')}</span>
                  <span className="font-mono text-right">{l.dureeAns}</span>
                  <span className="font-mono text-right">{montant(l.valeurBrute)}</span>
                  <span className="font-mono text-right">{montant(l.amortissements)}</span>
                  <span className="font-mono text-right">{montant(l.depreciations)}</span>
                  <span className="font-mono text-right font-semibold">{montant(l.valeurNette)}</span>
                  <span className="text-text-dim truncate">
                    {l.dateSortie ? `Sorti le ${new Date(l.dateSortie).toLocaleDateString('fr-FR')}` : ''}
                  </span>
                </div>
              ))}
              <div className={`${grilleImmo} px-3.5 py-1 text-[11.5px] font-bold border-b border-border`}>
                <span>S/total</span>
                <span />
                <span />
                <span className="font-mono text-right">{montant(g.brut)}</span>
                <span className="font-mono text-right">{montant(g.amortissements)}</span>
                <span className="font-mono text-right">{montant(g.depreciations)}</span>
                <span className="font-mono text-right">{montant(g.net)}</span>
                <span />
              </div>
            </div>
          ))}

          {immo.groupes.length > 0 && (
            <div
              className={`${grilleImmo} px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold`}
            >
              <span>Total général</span>
              <span />
              <span />
              <span className="font-mono text-right">{montant(immo.totaux.brut)}</span>
              <span className="font-mono text-right">{montant(immo.totaux.amortissements)}</span>
              <span className="font-mono text-right">{montant(immo.totaux.depreciations)}</span>
              <span className="font-mono text-right">{montant(immo.totaux.net)}</span>
              <span />
            </div>
          )}

          {/* HORS TOTAL · leurs comptes ont été soldés par la sortie, et les
              additionner ferait tomber faux le recoupement avec la balance. */}
          {immo.sortis.length > 0 && (
            <>
              <div className="px-3.5 py-1 text-[11.5px] font-bold bg-surface-alt/60 border-y border-border/60">
                Biens sortis à cette date · hors total
              </div>
              {immo.sortis.map((l) => (
                <div
                  key={l.id}
                  className={`${grilleImmo} px-3.5 py-[4px] items-center border-b border-border/50 text-[11.5px] text-text-dim`}
                >
                  <span className="truncate" title={l.designation}>
                    ({l.compte}) {l.designation}
                  </span>
                  <span className="font-mono">{new Date(l.dateAcquisition).toLocaleDateString('fr-FR')}</span>
                  <span className="font-mono text-right">{l.dureeAns}</span>
                  <span className="font-mono text-right">{montant(l.valeurBrute)}</span>
                  <span className="font-mono text-right">{montant(l.amortissements)}</span>
                  <span className="font-mono text-right">{montant(l.depreciations)}</span>
                  <span className="font-mono text-right">{montant(l.valeurNette)}</span>
                  <span className="truncate">
                    {l.dateSortie ? `Sorti le ${new Date(l.dateSortie).toLocaleDateString('fr-FR')}` : ''}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {onglet === 'amortissements' && amort && (
        <div className="border border-border bg-surface shadow-posee overflow-x-auto">
          <div
            style={grilleAmort}
            className="px-3.5 py-1.5 bg-surface-alt text-[11px] font-bold text-text-dim border-b border-border-dark"
          >
            <span>Libellé</span>
            <span>Acquis.</span>
            <span className="text-right">TAUX</span>
            {amort.mois.map((m) => (
              <span key={m.cle} className="text-right">
                {m.libelle}
              </span>
            ))}
            <span className="text-right">Dotation N</span>
            <span className="text-right">Cum. N-1</span>
            <span className="text-right">Cum. N</span>
            <span className="text-right">Dépréc.</span>
            <span className="text-right">Val. nette</span>
          </div>

          {amort.groupes.length === 0 && (
            <div className="px-3.5 py-4 text-[11.5px] text-text-dim">Aucune immobilisation sur cet exercice.</div>
          )}

          {amort.groupes.map((g) => (
            <div key={g.numero}>
              <div className="px-3.5 py-1 text-[11.5px] font-bold bg-surface-alt/60 border-y border-border/60">
                ({g.numero}) {g.intitule}
              </div>
              {g.lignes.map((l) => (
                <div
                  key={l.id}
                  style={grilleAmort}
                  className="px-3.5 py-[4px] items-center border-b border-border/50 text-[11.5px]"
                >
                  <span className="truncate" title={l.designation}>
                    {l.designation}
                    {l.sortiLe && (
                      <span className="text-text-dim italic"> · sorti le {new Date(l.sortiLe).toLocaleDateString('fr-FR')}</span>
                    )}
                    {l.reevaluation && (
                      <span className="text-text-dim italic" title="Bien réévalué · voir le cadre sous le tableau">
                        {' '}
                        · réévalué
                      </span>
                    )}
                    {!l.dotationPassee && (
                      <span className="text-warning italic" title="Dotation calculée, pas encore comptabilisée">
                        {' '}
                        · à passer
                      </span>
                    )}
                  </span>
                  <span className="font-mono">{new Date(l.dateAcquisition).toLocaleDateString('fr-FR')}</span>
                  <span className="font-mono text-right">{l.taux ? `${l.taux} %` : ''}</span>
                  {l.parMois.map((m, i) => (
                    <span key={amort.mois[i].cle} className="font-mono text-right">
                      {montant(m)}
                    </span>
                  ))}
                  <span className="font-mono text-right font-semibold">{montant(l.dotation)}</span>
                  <span className="font-mono text-right text-text-dim">{montant(l.cumulN1)}</span>
                  <span className="font-mono text-right">{montant(l.cumulN)}</span>
                  <span className="font-mono text-right">{montant(l.depreciations)}</span>
                  <span className="font-mono text-right font-semibold">{montant(l.valeurNette)}</span>
                </div>
              ))}
              <div style={grilleAmort} className="px-3.5 py-1 text-[11.5px] font-bold border-b border-border">
                <span>S/total</span>
                <span />
                <span />
                {g.parMois.map((m, i) => (
                  <span key={amort.mois[i].cle} className="font-mono text-right">
                    {montant(m)}
                  </span>
                ))}
                <span className="font-mono text-right">{montant(g.dotation)}</span>
                <span className="font-mono text-right">{montant(g.cumulN1)}</span>
                <span className="font-mono text-right">{montant(g.cumulN)}</span>
                <span className="font-mono text-right">{montant(g.depreciations)}</span>
                <span className="font-mono text-right">{montant(g.net)}</span>
              </div>
            </div>
          ))}

          {amort.groupes.length > 0 && (
            <div
              style={grilleAmort}
              className="px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold"
            >
              <span>Total général</span>
              <span />
              <span />
              {amort.totaux.parMois.map((m, i) => (
                <span key={amort.mois[i].cle} className="font-mono text-right">
                  {montant(m)}
                </span>
              ))}
              <span className="font-mono text-right">{montant(amort.totaux.dotation)}</span>
              <span className="font-mono text-right">{montant(amort.totaux.cumulN1)}</span>
              <span className="font-mono text-right">{montant(amort.totaux.cumulN)}</span>
              <span className="font-mono text-right">{montant(amort.totaux.depreciations)}</span>
              <span className="font-mono text-right">{montant(amort.totaux.net)}</span>
            </div>
          )}
        </div>
      )}

      {onglet === 'amortissements' && amort && <AmortissementsApresReevaluation amort={amort} />}

    </div>
  );
}

/**
 * LIGNE A15 · LES AMORTISSEMENTS APRÈS RÉÉVALUATION, sous le tableau · loi
 * n° 23/053, art. 135 (« Les amortissements pratiqués après la réévaluation
 * doivent figurer au tableau des amortissements […] Ces tableaux doivent faire
 * apparaître les reprises de l'exercice opérées sur l'écart de réévaluation ») ;
 * AUDCIF Titre VIII ch. 28 § 4.2.2. Chaque montant est SERVI par le serveur,
 * aucun n'est recalculé ici. Rien n'apparaît sans bien réévalué.
 */
function AmortissementsApresReevaluation({ amort }: { amort: TableauAmort }) {
  const lignes = amort.groupes.flatMap((g) => g.lignes.filter((l) => l.reevaluation));
  if (lignes.length === 0) return null;
  return (
    <div className="border border-border bg-surface shadow-posee mt-3">
      <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-surface-alt text-[11.5px] font-bold border-b border-border-dark">
        Amortissements après réévaluation
        <Aide
          titre="Amortissements après réévaluation"
          texte={
            "À compter de la réévaluation, l'annuité se calcule sur les valeurs réévaluées, au plan initialement retenu · elle " +
            'est égale à l’annuité prévue multipliée par le coefficient retenu. La part due à la réévaluation et les reprises ' +
            'de l’exercice opérées sur l’écart (provision spéciale reprise au 861, à la clôture ou à la sortie du bien) ' +
            'figurent au tableau des amortissements. La hausse du cumul de l’exercice de réévaluation est passée à sa ' +
            'clôture · le cumul N la comprend, le cumul N-1 non.'
          }
          source="Loi n° 23/053, art. 133 et 135 · AUDCIF Titre VIII ch. 28 § 4.2.2 et § 4.2.4.2"
        />
      </div>
      {/* Le défilement se pose autour du TABLEAU, jamais sur la racine. */}
      <div className="overflow-x-auto">
      <table className="w-full text-[11.5px]">
        <thead>
          <tr>
            <th className="text-left px-3.5 py-1.5">Bien</th>
            <th className="text-right px-2 py-1.5">Coefficient retenu</th>
            <th className="text-right px-2 py-1.5">Dotation N</th>
            <th className="text-right px-2 py-1.5">Dont réévaluation</th>
            <th className="text-right px-2 py-1.5">Hausse du cumul à la clôture</th>
            <th className="text-right px-3.5 py-1.5">Reprise sur l’écart</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-3.5 py-1">{l.designation}</td>
              {/* Un coefficient n'est pas un montant · il garde sa précision (§ 9 ter). */}
              <td className="px-2 py-1 text-right">{l.reevaluation!.produitAnterieur.toLocaleString('fr-FR', { maximumFractionDigits: 6 })}</td>
              <td className="px-2 py-1 text-right">{montant(l.dotation)}</td>
              <td className="px-2 py-1 text-right">{montant(l.reevaluation!.supplement)}</td>
              <td className="px-2 py-1 text-right">{montant(l.ajustementReevaluation ?? null)}</td>
              <td className="px-3.5 py-1 text-right">{montant(l.reevaluation!.repriseEcart)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-bold">
            <td className="px-3.5 py-1">Total</td>
            <td />
            <td />
            <td className="px-2 py-1 text-right">{montant(amort.totaux.supplementReevaluation ?? null)}</td>
            <td className="px-2 py-1 text-right">{montant(amort.totaux.ajustementReevaluation ?? null)}</td>
            <td className="px-3.5 py-1 text-right">{montant(amort.totaux.repriseEcart ?? null)}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}
