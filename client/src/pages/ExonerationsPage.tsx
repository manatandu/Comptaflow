import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  horsPeriode,
  jourDuPoste,
  libellePeriode,
  libelleTranche,
  periodeParDefaut,
  requetePeriode,
  type OriginePeriode,
  type PeriodeListe,
} from '../lib/periode-liste-travail';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { Aide } from '../components/chrome/Aide';
import type {
  DossierExoneration,
  ReferentielExonerations,
  RegistreExonerations,
  StatutExoneration,
  TypeDemandeExoneration,
} from '../lib/types';
import { PortailModale } from '../components/PortailModale';

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
  const { peutEcrire } = useAuth();
  const [registre, setRegistre] = useState<RegistreExonerations | null>(null);
  const [referentiel, setReferentiel] = useState<ReferentielExonerations | null>(null);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [creation, setCreation] = useState<TypeDemandeExoneration | null>(null);
  const [objet, setObjet] = useState('');
  const [debutValidite, setDebutValidite] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  // LE PASSAGE À « ACCORDÉ » DEMANDE L'ARRÊTÉ (audit final F123) · sa
  // référence, sa date et, à durée, son début de validité, dont le serveur
  // déduit la fin et arme l'alerte de renouvellement.
  const [accordPour, setAccordPour] = useState<string | null>(null);
  const [refArrete, setRefArrete] = useState('');
  const [dateArrete, setDateArrete] = useState('');
  const [debutArrete, setDebutArrete] = useState('');

  // LE REGISTRE SE LIT SUR UNE PÉRIODE (audit final F188) · l'ouverture du
  // dossier, les douze derniers mois par défaut, un registre n'étant pas tenu
  // par exercice. Un titre en alerte reste listé hors de la période, et les
  // compteurs du bandeau portent sur tout le registre.
  const [periodeChoisie, setPeriodeChoisie] = useState<PeriodeListe | null>(null);
  const periodeDefaut = useMemo(() => periodeParDefaut(null, new Date()), []);
  const periodeListe: PeriodeListe = periodeChoisie ?? periodeDefaut;
  const originePeriode: OriginePeriode = periodeChoisie ? 'CHOISIE' : periodeDefaut.origine;
  // L'échec de LECTURE se dit à côté de la période, et s'efface à la lecture
  // suivante · une période refusée puis corrigée ne laisse pas son refus affiché.
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [avisListe, setAvisListe] = useState<string | null>(null);

  // DEUX LECTURES SE CROISENT (relecture audit final F188) · un champ de date
  // se tape chiffre par chiffre. Seule la DERNIÈRE demandée s'affiche · une
  // réponse arrivée en retard poserait le registre d'une période sous le
  // libellé d'une autre.
  const lectureListe = useRef(0);
  const charger = () => {
    const numero = ++lectureListe.current;
    api.get<RegistreExonerations>(`/exonerations${requetePeriode(periodeListe)}`).then(
      (r) => {
        if (numero !== lectureListe.current) return;
        setRegistre(r);
        setErreurListe(null);
      },
      (e: Error) => {
        if (numero !== lectureListe.current) return;
        setErreurListe(e.message);
      },
    );
  };

  useEffect(() => {
    // L'avis d'un dossier hors période vaut pour la période où il a été donné.
    setAvisListe(null);
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodeListe.du, periodeListe.au]);

  useEffect(() => {
    api.get<ReferentielExonerations>('/exonerations/referentiel').then(setReferentiel, () => undefined);
  }, []);

  const selection = registre?.dossiers.find((d) => d.id === selectionId) ?? null;

  // La barre d'outils agit sur la fenêtre active · « Ajouter » ouvre un
  // dossier, « Supprimer » retire celui qui est sélectionné. Le second
  // n'avait pas de bouton (audit de l'interface du 2026-09-27, I11).
  const supprimer = async (dossier: DossierExoneration) => {
    if (!window.confirm(`Supprimer le dossier « ${dossier.objet} » ?`)) return;
    setErreur(null);
    try {
      await api.delete(`/exonerations/${dossier.id}`);
      setSelectionId(null);
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Suppression impossible');
    }
  };

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
      // Un dossier s'ouvre aujourd'hui · hors de la période affichée, il ne s'y verra pas.
      setAvisListe(horsPeriode(jourDuPoste(new Date()), periodeListe) ? 'Dossier créé · ouvert hors de la période affichée.' : null);
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
    if (statut === 'ACCORDE') {
      setAccordPour(dossier.id);
      setRefArrete(dossier.referenceArrete ?? '');
      setDateArrete(dossier.dateArrete?.slice(0, 10) ?? '');
      setDebutArrete(dossier.dateDebutValidite?.slice(0, 10) ?? '');
      return;
    }
    setErreur(null);
    try {
      await api.patch(`/exonerations/${dossier.id}`, { statut });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  const enregistrerAccord = async (dossier: DossierExoneration) => {
    setErreur(null);
    try {
      await api.patch(`/exonerations/${dossier.id}`, {
        statut: 'ACCORDE',
        referenceArrete: refArrete.trim(),
        dateArrete: dateArrete || undefined,
        ...(dossier.modele.validiteMois && debutArrete ? { dateDebutValidite: debutArrete } : {}),
      });
      setAccordPour(null);
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  const jour = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

  return (
    <div className="p-2">
      <EnteteImpression titre="Exonérations douanières et fiscales" />
      <div className="ecran-seul mb-1.5 max-w-[1100px]">
        <div className="flex items-center justify-end gap-2">
          {peutEcrire && (
            <button
              type="button"
              onClick={() => setCreation('PONCTUEL')}
              className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold hover:opacity-90"
            >
              Nouvelle demande
            </button>
          )}
          {peutEcrire && selection && (
            <button
              type="button"
              onClick={() => void supprimer(selection)}
              className="border border-border rounded-[3px] px-3 py-[3px] text-[11.5px]"
            >
              Supprimer
            </button>
          )}
          <Aide
            titre="Exonérations douanières et fiscales"
            texte={
              'Les facilités de l’article 39 de la loi n° 004/2001, constatées par arrêté interministériel des Ministres du Plan et des Finances.' +
              (registre?.avertissement ? ` ${registre.avertissement}` : '')
            }
            source="Loi n° 004/2001, art. 39"
          />
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[11.5px] max-w-[1100px]">
          {erreur}
        </div>
      )}

      {registre && (registre.expires > 0 || registre.aRenouveler > 0) && (
        <div
          className={`border px-3.5 py-2 mb-2.5 text-[11.5px] max-w-[1100px] ${
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
            <div className="flex items-center gap-1.5">
              {registre.aRenouveler} arrêté{registre.aRenouveler > 1 ? 's' : ''} à renouveler sous soixante jours.
              <Aide
                titre="Renouvellement"
                texte="Le dossier de renouvellement exige un rapport d’évaluation sur terrain, donc une descente à organiser."
                source="Registre des exonérations"
              />
            </div>
          )}
        </div>
      )}

      {/* La période s'imprime avec le registre · une liste bornée qui ne dirait
          pas sa borne se lirait comme le registre entier. Seuls les champs
          restent à l'écran. */}
      <div className="flex flex-wrap items-end gap-2 mb-1.5 text-[11.5px] max-w-[1240px]">
        <label className="ecran-seul">
          Ouverts du
          <input
            type="date"
            className="block border border-border px-1.5 py-0.5 text-[11.5px]"
            value={periodeListe.du ?? ''}
            onChange={(e) => setPeriodeChoisie({ ...periodeListe, du: e.target.value || null })}
          />
        </label>
        <label className="ecran-seul">
          Au
          <input
            type="date"
            className="block border border-border px-1.5 py-0.5 text-[11.5px]"
            value={periodeListe.au ?? ''}
            onChange={(e) => setPeriodeChoisie({ ...periodeListe, au: e.target.value || null })}
          />
        </label>
        <span className="text-text-dim">
          Dossiers ouverts · {libellePeriode(periodeListe, originePeriode)}
          {/* Le libellé s'imprime · il dit aussi les titres en alerte, listés hors de la période. */}
          {(periodeListe.du || periodeListe.au) && ' · arrêtés en alerte compris'}
        </span>
        <Aide
          className="ecran-seul"
          titre="Période du registre"
          texte="La liste se lit sur la date d'ouverture du dossier, bornes comprises, les douze derniers mois par défaut. Un arrêté expiré ou à renouveler reste listé quelle que soit la période, et les compteurs du bandeau portent sur tout le registre. Au-delà du plafond, le total de la période est dit."
          source="Audit final F188"
        />
        {!erreurListe && registre && libelleTranche(registre, registre.dossiers.length) && (
          <span className="text-warning">{libelleTranche(registre, registre.dossiers.length)}</span>
        )}
        {erreurListe && <span className="text-danger">{erreurListe}</span>}
        {avisListe && <span className="text-warning">{avisListe}</span>}
      </div>

      <div className="flex gap-2.5 max-w-[1240px] items-start">
        {/* --- Liste des dossiers ------------------------------------------ */}
        <div
          // `overflow-x-auto` ici, `min-w` sur les lignes · les 490 px de colonnes
          // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
          // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
          // qui emportait alors titre, onglets et boutons hors de l'écran.
          className="flex-1 min-w-0 bg-surface border border-border shadow-posee overflow-x-auto"
        >
          <div className="entete-colonnes grid grid-cols-[110px_1fr_120px_100px_92px] min-w-[640px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[11px] font-bold text-text-dim">
            <span>Type</span>
            <span>Objet</span>
            <span>Arrêté</span>
            <span>Échéance</span>
            <span>Pièces</span>
          </div>
          {!registre && !erreurListe && <div className="px-3.5 py-3 text-[11.5px] text-text-dim">Chargement…</div>}
          {/* Une lecture refusée ne laisse pas les dossiers d'avant sous le
              libellé de la période demandée · ils se liraient comme sa réponse. */}
          {!erreurListe && registre?.dossiers.length === 0 && (
            <div className="px-3.5 py-3 text-[11.5px] text-text-dim italic">
              Aucun dossier sur la période.
            </div>
          )}
          {!erreurListe && registre?.dossiers.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectionId(d.id)}
              className={`w-full grid grid-cols-[110px_1fr_120px_100px_92px] min-w-[640px] gap-2.5 px-3.5 py-[5px] items-center text-left border-b border-border/50 text-[11.5px] ${
                selectionId === d.id ? 'bg-sel text-white' : 'hover:bg-sel-soft'
              }`}
            >
              <span className="font-mono text-[11px]">{d.type}</span>
              <span className="truncate">{d.objet}</span>
              <span className="font-mono text-[11px] truncate">{d.referenceArrete ?? '·'}</span>
              <span
                className={`text-[11px] ${
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
                className={`text-[11px] font-mono ${
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
          <div className="px-3 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim">
            Dossier
          </div>
          {!selection && (
            <div className="p-3 text-[11.5px] text-text-dim">
              Aucun dossier sélectionné.
            </div>
          )}
          {selection && (
            <div className="p-3 space-y-3 text-[11.5px]">
              <div>
                <div className="font-semibold text-[11.5px]">{selection.objet}</div>
                <div className="text-[11px] text-text-dim mt-0.5">{selection.modele.libelle}</div>
              </div>

              <label className="block">
                Statut
                {/* Statut et pièces s'enregistrent au changement · la lecture
                    seule les voit, sans pouvoir les modifier. */}
                <select
                  value={selection.statut}
                  disabled={!peutEcrire}
                  onChange={(e) => changerStatut(selection, e.target.value as StatutExoneration)}
                  className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[11.5px]"
                >
                  {(Object.keys(LIBELLE_STATUT) as StatutExoneration[]).map((s) => (
                    <option key={s} value={s}>
                      {LIBELLE_STATUT[s]}
                    </option>
                  ))}
                </select>
                <span className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`inline-block font-mono text-[11px] font-bold px-1.5 py-0.5 ${COULEUR_STATUT[selection.statut]}`}
                  >
                    {LIBELLE_STATUT[selection.statut].toUpperCase()}
                  </span>
                  {selection.statut !== 'ACCORDE' && accordPour !== selection.id && (
                    <Aide
                      titre="Arrêté non accordé"
                      texte="Tant que l’arrêté n’est pas accordé, il n’existe aucun titre : une importation faite « en attendant » est une importation taxable."
                      source="Code des douanes, art. 338"
                    />
                  )}
                </span>
              </label>

              {peutEcrire && accordPour === selection.id && (
                <div className="border border-border px-2 py-1.5 space-y-1.5">
                  <div className="text-[11px] font-bold text-text-dim">ARRÊTÉ ACCORDÉ</div>
                  <input
                    value={refArrete}
                    onChange={(e) => setRefArrete(e.target.value)}
                    placeholder="Référence de l’arrêté"
                    className="block w-full border border-border-dark bg-bg px-2 py-1 text-[11.5px]"
                  />
                  <label className="block text-[11px]">
                    Date de l’arrêté
                    <input type="date" value={dateArrete} onChange={(e) => setDateArrete(e.target.value)} className="mt-0.5 block w-full border border-border-dark bg-bg px-2 py-1 text-[11.5px]" />
                  </label>
                  {selection.modele.validiteMois && (
                    <label className="block text-[11px]">
                      Début de validité ({selection.modele.validiteMois} mois)
                      <input type="date" value={debutArrete} onChange={(e) => setDebutArrete(e.target.value)} className="mt-0.5 block w-full border border-border-dark bg-bg px-2 py-1 text-[11.5px]" />
                    </label>
                  )}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => void enregistrerAccord(selection)} className="bg-sel text-white px-2.5 py-[3px] text-[11.5px] font-semibold">
                      Enregistrer l’accord
                    </button>
                    <button type="button" onClick={() => setAccordPour(null)} className="border border-border-dark px-2.5 py-[3px] text-[11.5px]">
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-2.5">
                <div className="text-[11px] font-bold text-text-dim mb-1.5">
                  PIÈCES · {selection.nombrePiecesFournies}/{selection.nombrePiecesRequises}
                </div>
                {selection.pieces.map((p) => (
                  <label key={p.cle} className="flex items-start gap-1.5 py-[3px] text-[11.5px]">
                    <input
                      type="checkbox"
                      className="mt-[3px]"
                      checked={p.fournie}
                      disabled={!peutEcrire}
                      onChange={() => basculerPiece(selection, p.cle)}
                    />
                    <span className={p.fournie ? 'text-text-dim line-through' : ''}>
                      {p.libelle}
                      {p.conditionnelle && (
                        <span className="block text-[11.5px] text-sel italic">Seulement si : {p.conditionnelle}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              <div className="border-t border-border pt-2.5 text-[11px] text-text-dim leading-[1.5]">
                <div className="font-semibold text-text mb-1">Base légale</div>
                {selection.modele.baseLegale}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- Cas de franchise du code des douanes --------------------------- */}
      {referentiel && (
        <div className="mt-2.5 border border-border bg-surface max-w-[1240px]">
          <div className="px-3.5 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim flex items-center gap-1.5">
            FRANCHISES DOUANIÈRES INVOCABLES PAR UNE EBNL
            <Aide
              titre="Cas de franchise"
              texte="Chaque cas reste soumis aux conditions déterminées par le ministre des Finances : le Code pose le principe et l’énumération, pas la procédure."
              source="Code des douanes, art. 339, 1°"
            />
          </div>
          {referentiel.franchisesDouanieres.map((f) => (
            <div key={f.lettre} className="px-3.5 py-1.5 border-b border-border/50 last:border-b-0 text-[11.5px]">
              <span className="font-mono font-bold mr-1.5">{f.lettre})</span>
              <span className="font-semibold">{f.libelle}</span>
              <div className="text-[11px] text-text-dim mt-0.5 leading-[1.45]">{f.texte}</div>
            </div>
          ))}
        </div>
      )}

      {/* --- Création ------------------------------------------------------- */}
      {creation && (
        <PortailModale>
          <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50" onClick={() => setCreation(null)}>
            <div className="bg-surface border border-border-dark shadow-dominante w-[520px] p-4 modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="text-[12px] font-bold mb-2.5">Nouveau dossier d’exonération</div>
              <label className="block text-[11.5px] mb-2">
                Type de demande
                <select
                  value={creation}
                  onChange={(e) => setCreation(e.target.value as TypeDemandeExoneration)}
                  className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[11.5px]"
                >
                  <option value="PONCTUEL">Arrêté ponctuel · une opération d’importation isolée</option>
                  <option value="PREVISIONNEL">Arrêté prévisionnel · flux récurrent, deux ans</option>
                  <option value="RENOUVELLEMENT">Renouvellement d’un arrêté prévisionnel</option>
                </select>
                <span className="block text-[11px] text-text-dim leading-[1.5] mt-1">
                  {referentiel?.modeles.find((m) => m.type === creation)?.objet}
                </span>
              </label>
              <label className="block text-[11.5px] mb-2">
                Objet
                <input
                  value={objet}
                  onChange={(e) => setObjet(e.target.value)}
                  placeholder="Lot de médicaments Kinshasa, don MSF"
                  className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[11.5px]"
                />
              </label>
              {creation !== 'PONCTUEL' && (
                <label className="block text-[11.5px] mb-3">
                  <span className="flex items-center gap-1.5">
                    Début de validité
                    <Aide
                      titre="Début de validité"
                      texte="L’échéance se déduit toute seule : deux ans. Une date de fin saisie à la main est la faute la plus coûteuse de ce registre."
                      source="Registre des exonérations"
                    />
                  </span>
                  <input
                    type="date"
                    value={debutValidite}
                    onChange={(e) => setDebutValidite(e.target.value)}
                    className="mt-1 block w-full border border-border-dark bg-bg px-2 py-1 text-[11.5px] font-mono"
                  />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreation(null)} className="px-3 py-1.5 text-[11.5px] border border-border">
                  Annuler
                </button>
                <button
                  onClick={creer}
                  disabled={!objet.trim()}
                  className="px-3 py-1.5 text-[11.5px] bg-sel text-white font-semibold disabled:opacity-50"
                >
                  Créer le dossier
                </button>
              </div>
            </div>
          </div>
        </PortailModale>
      )}
    </div>
  );
}
