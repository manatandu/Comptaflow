import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type {
  DossierExoneration,
  ReferentielExonerations,
  RegistreExonerations,
  StatutExoneration,
  TypeDemandeExoneration,
} from '../lib/types';

/**
 * REGISTRE DES EXONÉRATIONS DOUANIÈRES ET FISCALES.
 *
 * L'article 39 de la loi n° 004/2001 accorde aux ONG « l'exonération de droits
 * sur l'importation des biens et équipements liés à leur mission ». Le titre
 * n'est pas la loi : c'est un ARRÊTÉ INTERMINISTÉRIEL des Ministres du Plan et
 * des Finances, et le code des douanes est catégorique · « il ne peut être
 * accordé de franchise des droits et taxes qu'en application des conventions
 * internationales ou que par la loi ou en vertu de celle-ci » (art. 338).
 *
 * Cet écran ne calcule aucun droit et n'accorde aucune franchise. Il tient les
 * deux choses qui, manquées, laissent la marchandise au port aux frais de
 * l'entité : les PIÈCES que la note circulaire n° 003/2013 exige, et la DATE à
 * laquelle l'arrêté prévisionnel tombe.
 */

const LIBELLE_STATUT: Record<StatutExoneration, string> = {
  EN_PREPARATION: 'En préparation',
  DEPOSE: 'Déposé',
  ACCORDE: 'Accordé',
  REJETE: 'Rejeté',
  EXPIRE: 'Expiré',
};

const COULEUR_STATUT: Record<StatutExoneration, string> = {
  EN_PREPARATION: 'bg-chrome text-text-dim',
  DEPOSE: 'bg-sel-soft text-sel',
  ACCORDE: 'bg-positive-soft text-positive',
  REJETE: 'bg-danger-soft text-danger',
  EXPIRE: 'bg-danger-soft text-danger',
};

export function ExonerationsPage() {
  const [registre, setRegistre] = useState<RegistreExonerations | null>(null);
  const [referentiel, setReferentiel] = useState<ReferentielExonerations | null>(null);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [creation, setCreation] = useState<TypeDemandeExoneration | null>(null);
  const [objet, setObjet] = useState('');
  const [debutValidite, setDebutValidite] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () => {
    api.get<RegistreExonerations>('/exonerations').then(setRegistre, (e: Error) => setErreur(e.message));
  };

  useEffect(() => {
    charger();
    api.get<ReferentielExonerations>('/exonerations/referentiel').then(setReferentiel, () => undefined);
  }, []);

  const selection = registre?.dossiers.find((d) => d.id === selectionId) ?? null;

  // La barre d'outils agit sur la fenêtre active · « Ajouter » ouvre un
  // dossier, « Supprimer » retire celui qui est sélectionné.

  const creer = async () => {
    if (!creation || !objet.trim()) return;
    setErreur(null);
    try {
      await api.post('/exonerations', {
        type: creation,
        objet: objet.trim(),
        ...(debutValidite ? { dateDebutValidite: debutValidite } : {}),
      });
      setCreation(null);
      setObjet('');
      setDebutValidite('');
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Création impossible');
    }
  };

  const basculerPiece = async (dossier: DossierExoneration, cle: string) => {
    const fournies = dossier.pieces.find((p) => p.cle === cle)?.fournie
      ? dossier.piecesFournies.filter((c) => c !== cle)
      : [...dossier.piecesFournies, cle];
    await api.patch(`/exonerations/${dossier.id}`, { piecesFournies: fournies });
    charger();
  };

  const changerStatut = async (dossier: DossierExoneration, statut: StatutExoneration) => {
    await api.patch(`/exonerations/${dossier.id}`, { statut });
    charger();
  };

  const jour = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

  return (
    <div className="p-2">
      <EnteteImpression titre="Exonérations douanières et fiscales" />
      <div className="ecran-seul mb-1.5 max-w-[1100px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">REGISTRE</div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[12px] font-bold leading-tight">Exonérations douanières et fiscales</h1>
          <button
            type="button"
            onClick={() => setCreation('PONCTUEL')}
            className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90"
          >
            Nouvelle demande
          </button>
        </div>
        <div className="text-[10px] text-text-dim mt-0.5">
          Les facilités de l’article 39 de la loi n° 004/2001, constatées par arrêté interministériel des Ministres du
          Plan et des Finances.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1100px]">
          {erreur}
        </div>
      )}

      {registre && (registre.expires > 0 || registre.aRenouveler > 0) && (
        <div
          className={`border px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1100px] ${
            registre.expires > 0 ? 'border-danger/30 bg-danger-soft' : 'border-warning/30 bg-warning-soft'
          }`}
        >
          {registre.expires > 0 && (
            <div className="font-semibold">
              {registre.expires} arrêté{registre.expires > 1 ? 's' : ''} EXPIRÉ{registre.expires > 1 ? 'S' : ''} · sans
              titre en cours de validité, les droits sont dus à l’importation.
            </div>
          )}
          {registre.aRenouveler > 0 && (
            <div>
              {registre.aRenouveler} arrêté{registre.aRenouveler > 1 ? 's' : ''} à renouveler sous soixante jours. Le
              dossier de renouvellement exige un rapport d’évaluation sur terrain, donc une descente à organiser.
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1240px] items-start">
        {/* --- Liste des dossiers ------------------------------------------ */}
        <div
          // `overflow-x-auto` ici, `min-w` sur les lignes · les 490 px de colonnes
          // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
          // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
          // qui emportait alors titre, onglets et boutons hors de l'écran.
          className="flex-1 min-w-0 bg-surface border border-border shadow-posee overflow-x-auto"
        >
          <div className="grid grid-cols-[110px_1fr_120px_100px_92px] min-w-[640px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim">
            <span>TYPE</span>
            <span>OBJET</span>
            <span>ARRÊTÉ</span>
            <span>ÉCHÉANCE</span>
            <span>PIÈCES</span>
          </div>
          {!registre && <div className="px-3.5 py-3 text-[11px] text-text-dim">Chargement…</div>}
          {registre?.dossiers.length === 0 && (
            <div className="px-3.5 py-3 text-[11px] text-text-dim italic">
              Aucun dossier. Utilisez « Ajouter » dans la barre d’outils pour en ouvrir un.
            </div>
          )}
          {registre?.dossiers.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectionId(d.id)}
              className={`w-full grid grid-cols-[110px_1fr_120px_100px_92px] min-w-[640px] gap-2.5 px-3.5 py-[5px] items-center text-left border-b border-border/50 text-[10.5px] ${
                selectionId === d.id ? 'bg-sel text-white' : 'hover:bg-sel-soft'
              }`}
            >
              <span className="font-mono text-[10px]">{d.type}</span>
              <span className="truncate">{d.objet}</span>
              <span className="font-mono text-[10px] truncate">{d.referenceArrete ?? '·'}</span>
              <span
                className={`text-[10px] ${
                  selectionId === d.id
                    ? 'text-white/90'
                    : d.alerte === 'EXPIRE'
                      ? 'text-danger font-semibold'
                      : d.alerte === 'A_RENOUVELER'
                        ? 'text-warning font-semibold'
                        : 'text-text-dim'
                }`}
              >
                {d.joursAvantExpiration === null
                  ? jour(d.dateFinValidite)
                  : d.joursAvantExpiration < 0
                    ? `Expiré (${-d.joursAvantExpiration} j)`
                    : `${d.joursAvantExpiration} j`}
              </span>
              <span
                className={`text-[10px] font-mono ${
                  selectionId === d.id ? 'text-white/90' : d.complet ? 'text-positive' : 'text-warning'
                }`}
              >
                {d.nombrePiecesFournies}/{d.nombrePiecesRequises}
              </span>
            </button>
          ))}
        </div>

        {/* --- Dossier sélectionné ------------------------------------------ */}
        <div className="w-[400px] shrink-0 bg-surface border border-border shadow-posee">
          <div className="px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
            DOSSIER
          </div>
          {!selection && (
            <div className="p-3 text-[10.5px] text-text-dim">
              Sélectionnez un dossier pour cocher ses pièces et suivre son échéance.
            </div>
          )}
          {selection && (
            <div className="p-3 space-y-3 text-[10.5px]">
              <div>
                <div className="font-semibold text-[11px]">{selection.objet}</div>
                <div className="text-[10px] text-text-dim mt-0.5">{selection.modele.libelle}</div>
              </div>

              <label className="block">
                Statut
                <select
                  value={selection.statut}
                  onChange={(e) => changerStatut(selection, e.target.value as StatutExoneration)}
                  className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[10.5px]"
                >
                  {(Object.keys(LIBELLE_STATUT) as StatutExoneration[]).map((s) => (
                    <option key={s} value={s}>
                      {LIBELLE_STATUT[s]}
                    </option>
                  ))}
                </select>
                <span
                  className={`inline-block mt-1 font-mono text-[10px] font-bold px-1.5 py-0.5 ${COULEUR_STATUT[selection.statut]}`}
                >
                  {LIBELLE_STATUT[selection.statut].toUpperCase()}
                </span>
                {selection.statut !== 'ACCORDE' && (
                  <span className="block text-[10px] text-text-dim leading-[1.5] mt-1">
                    Tant que l’arrêté n’est pas accordé, il n’existe aucun titre : une importation faite « en
                    attendant » est une importation taxable.
                  </span>
                )}
              </label>

              <div className="border-t border-border pt-2.5">
                <div className="text-[10px] font-bold text-text-dim mb-1.5">
                  PIÈCES · {selection.nombrePiecesFournies}/{selection.nombrePiecesRequises}
                </div>
                {selection.pieces.map((p) => (
                  <label key={p.cle} className="flex items-start gap-1.5 py-[3px] text-[10.5px]">
                    <input
                      type="checkbox"
                      className="mt-[3px]"
                      checked={p.fournie}
                      onChange={() => basculerPiece(selection, p.cle)}
                    />
                    <span className={p.fournie ? 'text-text-dim line-through' : ''}>
                      {p.libelle}
                      {p.conditionnelle && (
                        <span className="block text-[10.5px] text-sel italic">Seulement si : {p.conditionnelle}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              <div className="border-t border-border pt-2.5 text-[10px] text-text-dim leading-[1.5]">
                <div className="font-semibold text-text mb-1">Base légale</div>
                {selection.modele.baseLegale}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- Rappel de droit, en bas · il vaut pour tout le registre -------- */}
      {registre && (
        <div className="mt-2.5 border border-border bg-surface-alt px-3.5 py-2 text-[10px] text-text-dim leading-[1.5] max-w-[1240px]">
          {registre.avertissement}
        </div>
      )}

      {/* --- Cas de franchise du code des douanes --------------------------- */}
      {referentiel && (
        <div className="mt-2.5 border border-border bg-surface max-w-[1240px]">
          <div className="px-3.5 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
            CAS DE FRANCHISE INVOCABLES PAR UNE EBNL · CODE DES DOUANES, ART. 339, 1°
          </div>
          {referentiel.franchisesDouanieres.map((f) => (
            <div key={f.lettre} className="px-3.5 py-1.5 border-b border-border/50 last:border-b-0 text-[10.5px]">
              <span className="font-mono font-bold mr-1.5">{f.lettre})</span>
              <span className="font-semibold">{f.libelle}</span>
              <div className="text-[10px] text-text-dim mt-0.5 leading-[1.45]">{f.texte}</div>
            </div>
          ))}
          <div className="px-3.5 py-1.5 bg-surface-alt text-[10px] text-text-dim leading-[1.5] border-t border-border">
            Chaque cas reste soumis aux conditions déterminées par le ministre des Finances : le Code pose le principe
            et l’énumération, pas la procédure.
          </div>
        </div>
      )}

      {/* --- Création ------------------------------------------------------- */}
      {creation && (
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50" onClick={() => setCreation(null)}>
          <div className="bg-surface border border-border-dark shadow-dominante w-[520px] p-4 max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="text-[12px] font-bold mb-2.5">Nouveau dossier d’exonération</div>
            <label className="block text-[10.5px] mb-2">
              Type de demande
              <select
                value={creation}
                onChange={(e) => setCreation(e.target.value as TypeDemandeExoneration)}
                className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[10.5px]"
              >
                <option value="PONCTUEL">Arrêté ponctuel · une opération d’importation isolée</option>
                <option value="PREVISIONNEL">Arrêté prévisionnel · flux récurrent, deux ans</option>
                <option value="RENOUVELLEMENT">Renouvellement d’un arrêté prévisionnel</option>
              </select>
              <span className="block text-[10px] text-text-dim leading-[1.5] mt-1">
                {referentiel?.modeles.find((m) => m.type === creation)?.objet}
              </span>
            </label>
            <label className="block text-[10.5px] mb-2">
              Objet
              <input
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                placeholder="Lot de médicaments Kinshasa, don MSF"
                className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[10.5px]"
              />
            </label>
            {creation !== 'PONCTUEL' && (
              <label className="block text-[10.5px] mb-3">
                Début de validité
                <input
                  type="date"
                  value={debutValidite}
                  onChange={(e) => setDebutValidite(e.target.value)}
                  className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[10.5px] font-mono"
                />
                <span className="block text-[10px] text-text-dim leading-[1.5] mt-1">
                  L’échéance se déduit toute seule : deux ans. Une date de fin saisie à la main est la faute la plus
                  coûteuse de ce registre.
                </span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreation(null)} className="px-3 py-1.5 text-[10.5px] border border-border">
                Annuler
              </button>
              <button
                onClick={creer}
                disabled={!objet.trim()}
                className="px-3 py-1.5 text-[10.5px] bg-sel text-white font-semibold disabled:opacity-50"
              >
                Créer le dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
