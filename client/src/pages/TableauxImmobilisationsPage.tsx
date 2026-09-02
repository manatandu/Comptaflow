import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

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
  net: number;
}

interface TableauImmo {
  dateArret: string | null;
  groupes: GroupeImmo[];
  totaux: { brut: number; amortissements: number; net: number };
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
  valeurNette: number;
  dotationPassee: boolean;
}

interface GroupeAmort {
  numero: string;
  intitule: string;
  lignes: LigneAmort[];
  parMois: number[];
  dotation: number;
  cumulN1: number;
  cumulN: number;
  net: number;
}

interface TableauAmort {
  exercice: { dateDebut: string; dateFin: string };
  mois: Array<{ cle: string; libelle: string }>;
  groupes: GroupeAmort[];
  totaux: { parMois: number[]; dotation: number; cumulN1: number; cumulN: number; net: number };
}

function montant(n: number): string {
  return n !== 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function TableauxImmobilisationsPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<'immobilisations' | 'amortissements'>('immobilisations');
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
      void api.telecharger(
        `/exports/tableau-immobilisations${dateArret ? `?dateArret=${dateArret}` : ''}`,
        'tableau-immobilisations.xlsx',
      );
    } else if (exerciceCourant) {
      void api.telecharger(
        `/exports/tableau-amortissements?exerciceId=${exerciceCourant.id}`,
        'tableau-amortissements.xlsx',
      );
    }
  };

  const grilleImmo = 'grid grid-cols-[1fr_112px_64px_130px_130px_130px_150px] gap-2.5';
  const nbMois = amort?.mois.length ?? 12;
  const grilleAmort = {
    display: 'grid',
    gridTemplateColumns: `minmax(220px,1fr) 100px 96px repeat(${nbMois}, 92px) 116px 116px 116px 116px`,
    gap: '8px',
  } as const;

  return (
    <div className="p-2">
      <EnteteImpression titre="Tableaux des immobilisations" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">RÉVISION</div>
          <h1 className="text-[12px] font-bold leading-tight">Immobilisations et amortissements</h1>
        </div>
        <div className="flex items-end gap-3">
          {onglet === 'immobilisations' && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim">ARRÊTÉ AU</span>
              <input
                type="date"
                value={dateArret}
                onChange={(e) => setDateArret(e.target.value)}
                className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] font-mono"
              />
            </label>
          )}
          <button
            type="button"
            onClick={exporter}
            className="border border-border-dark bg-surface-alt px-3 py-1 text-[10.5px] font-semibold"
          >
            Exporter en Excel
          </button>
        </div>
      </div>

      <div className="flex gap-0 mb-2 border-b border-border-dark">
        {(['immobilisations', 'amortissements'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            className={`px-3 py-1 text-[10.5px] font-semibold border border-b-0 -mb-px ${
              onglet === o ? 'bg-surface border-border-dark' : 'bg-surface-alt border-transparent text-text-dim'
            }`}
          >
            {o === 'immobilisations' ? 'Tableau des immobilisations' : 'Tableau des amortissements'}
          </button>
        ))}
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      {onglet === 'immobilisations' && immo && (
        <div className="border border-border bg-surface shadow-posee overflow-x-auto">
          <div
            className={`${grilleImmo} px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark`}
          >
            <span>LIBELLÉ</span>
            <span>ACQUISITION</span>
            <span className="text-right">DURÉE</span>
            <span className="text-right">VAL. BRUTE</span>
            <span className="text-right">AMORT. CUMULÉS</span>
            <span className="text-right">VAL. NETTE</span>
            <span>OBSERVATIONS</span>
          </div>

          {immo.groupes.length === 0 && (
            <div className="px-3.5 py-4 text-[10.5px] text-text-dim">Aucune immobilisation à cette date.</div>
          )}

          {immo.groupes.map((g) => (
            <div key={g.numero}>
              <div className="px-3.5 py-1 text-[10.5px] font-bold bg-surface-alt/60 border-y border-border/60">
                ({g.numero}) {g.intitule}
              </div>
              {g.lignes.map((l) => (
                <div
                  key={l.id}
                  className={`${grilleImmo} px-3.5 py-[4px] items-center border-b border-border/50 text-[10.5px]`}
                >
                  <span className="truncate" title={l.designation}>
                    {l.designation}
                  </span>
                  <span className="font-mono">{new Date(l.dateAcquisition).toLocaleDateString('fr-FR')}</span>
                  <span className="font-mono text-right">{l.dureeAns}</span>
                  <span className="font-mono text-right">{montant(l.valeurBrute)}</span>
                  <span className="font-mono text-right">{montant(l.amortissements)}</span>
                  <span className="font-mono text-right font-semibold">{montant(l.valeurNette)}</span>
                  <span className="text-text-dim truncate">
                    {l.dateSortie ? `Sorti le ${new Date(l.dateSortie).toLocaleDateString('fr-FR')}` : ''}
                  </span>
                </div>
              ))}
              <div className={`${grilleImmo} px-3.5 py-1 text-[10.5px] font-bold border-b border-border`}>
                <span>S/TOTAL</span>
                <span />
                <span />
                <span className="font-mono text-right">{montant(g.brut)}</span>
                <span className="font-mono text-right">{montant(g.amortissements)}</span>
                <span className="font-mono text-right">{montant(g.net)}</span>
                <span />
              </div>
            </div>
          ))}

          {immo.groupes.length > 0 && (
            <div
              className={`${grilleImmo} px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold`}
            >
              <span>TOTAL GÉNÉRAL</span>
              <span />
              <span />
              <span className="font-mono text-right">{montant(immo.totaux.brut)}</span>
              <span className="font-mono text-right">{montant(immo.totaux.amortissements)}</span>
              <span className="font-mono text-right">{montant(immo.totaux.net)}</span>
              <span />
            </div>
          )}
        </div>
      )}

      {onglet === 'amortissements' && amort && (
        <div className="border border-border bg-surface shadow-posee overflow-x-auto">
          <div
            style={grilleAmort}
            className="px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark"
          >
            <span>LIBELLÉ</span>
            <span>ACQUIS.</span>
            <span className="text-right">TAUX</span>
            {amort.mois.map((m) => (
              <span key={m.cle} className="text-right">
                {m.libelle}
              </span>
            ))}
            <span className="text-right">DOTATION N</span>
            <span className="text-right">CUM. N-1</span>
            <span className="text-right">CUM. N</span>
            <span className="text-right">VAL. NETTE</span>
          </div>

          {amort.groupes.length === 0 && (
            <div className="px-3.5 py-4 text-[10.5px] text-text-dim">Aucune immobilisation sur cet exercice.</div>
          )}

          {amort.groupes.map((g) => (
            <div key={g.numero}>
              <div className="px-3.5 py-1 text-[10.5px] font-bold bg-surface-alt/60 border-y border-border/60">
                ({g.numero}) {g.intitule}
              </div>
              {g.lignes.map((l) => (
                <div
                  key={l.id}
                  style={grilleAmort}
                  className="px-3.5 py-[4px] items-center border-b border-border/50 text-[10.5px]"
                >
                  <span className="truncate" title={l.designation}>
                    {l.designation}
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
                  <span className="font-mono text-right font-semibold">{montant(l.valeurNette)}</span>
                </div>
              ))}
              <div style={grilleAmort} className="px-3.5 py-1 text-[10.5px] font-bold border-b border-border">
                <span>S/TOTAL</span>
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
                <span className="font-mono text-right">{montant(g.net)}</span>
              </div>
            </div>
          ))}

          {amort.groupes.length > 0 && (
            <div
              style={grilleAmort}
              className="px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold"
            >
              <span>TOTAL GÉNÉRAL</span>
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
              <span className="font-mono text-right">{montant(amort.totaux.net)}</span>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-text-dim mt-2 max-w-[900px]">
        {onglet === 'immobilisations'
          ? "Les amortissements cumulés incluent l'amortissement antérieur des biens repris d'un dossier précédent : sans lui, un matériel de vingt ans afficherait une valeur nette égale à son brut. Les dotations postérieures à la date d'arrêté sont écartées."
          : "La dotation retenue est celle DÉJÀ COMPTABILISÉE quand elle l'a été ; sinon elle est calculée, et la ligne est marquée « à passer » · un tableau qui mêlerait sans le dire du comptabilisé et du prévisionnel ne se recouperait avec aucun compte. La somme des douze colonnes est exactement la dotation, au centime : le reliquat d'arrondi tombe sur le dernier mois servi."}
      </p>
    </div>
  );
}
