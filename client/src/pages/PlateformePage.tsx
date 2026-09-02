import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { JeuEtatsFinanciersSycebnl, SystemeComptableSyscohada } from '../lib/types';

/**
 * CONSOLE DE L'OPÉRATEUR DE PLATEFORME · vue transversale des cabinets
 * clients (tenants), gestion de leurs licences, création de dossiers.
 * Fenêtre invisible pour un utilisateur ordinaire (menu Fichier gated sur
 * estOperateurPlateforme) et de toute façon inaccessible : le serveur relit
 * le drapeau en base à chaque requête (OperateurPlateformeGuard).
 */

type TypeLicence = 'ABONNEMENT' | 'PERPETUEL_SAAS' | 'PERPETUEL_ONPREMISE';
type StatutLicence = 'ACTIVE' | 'EXPIREE' | 'SUSPENDUE';

interface LicenceCabinet {
  type: TypeLicence;
  statut: StatutLicence;
  dateDebut: string;
  dateExpiration: string | null;
  dernierHeartbeatAt: string | null;
}

interface CabinetClient {
  id: string;
  nom: string;
  referentiel: string;
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl | null;
  /** Pendant SYSCOHADA · null pour un dossier SYCEBNL. */
  systemeComptableSyscohada: SystemeComptableSyscohada | null;
  ville: string | null;
  pays: string | null;
  numeroImpot: string | null;
  createdAt: string;
  licence: LicenceCabinet | null;
  /** Groupe d'établissements · présent = ce dossier est une CELLULE. */
  dossierMere: { id: string; nom: string } | null;
  /** > 0 = ce dossier est une MÈRE de groupe. */
  nbCellules: number;
  /** Nombre de cellules que le dossier peut créer LUI-MÊME · null = désactivé. */
  plafondCellules: number | null;
  nbUtilisateurs: number;
  nbEcritures: number;
}

interface CabinetCree {
  tenant: { id: string; nom: string };
  adminEmail: string;
  motDePasseTemporaire: string;
}

const LIBELLE_JEU: Record<JeuEtatsFinanciersSycebnl, string> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'Associations',
  PROJETS_DEVELOPPEMENT: 'Projets',
  SYSTEME_MINIMAL_TRESORERIE: 'SMT',
};

const LIBELLE_LICENCE: Record<TypeLicence, string> = {
  ABONNEMENT: 'Abonnement',
  PERPETUEL_SAAS: 'Perpétuelle (SaaS)',
  PERPETUEL_ONPREMISE: 'Perpétuelle (sur site)',
};

const JOUR_MS = 24 * 60 * 60 * 1000;

/** État réel de la licence, échéance comprise · miroir de l'évaluation
 *  serveur (LicenceService.evaluerLicence), à titre indicatif seulement. */
function etatLicence(l: LicenceCabinet | null): { libelle: string; classe: string } {
  if (!l) return { libelle: 'SANS LICENCE', classe: 'text-text-dim bg-surface-alt' };
  if (l.statut === 'SUSPENDUE') return { libelle: 'SUSPENDUE', classe: 'text-danger bg-danger-soft' };
  if (l.type === 'ABONNEMENT' && l.dateExpiration && new Date(l.dateExpiration).getTime() < Date.now()) {
    return { libelle: 'EXPIRÉE', classe: 'text-danger bg-danger-soft' };
  }
  return { libelle: 'ACTIVE', classe: 'text-positive bg-positive-soft' };
}

function dateCourte(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '·';
}

export function PlateformePage() {
  const { utilisateur } = useAuth();
  const [liste, setListe] = useState<CabinetClient[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Modale « licence » d'un cabinet
  const [licenceEnCours, setLicenceEnCours] = useState<CabinetClient | null>(null);
  const [licType, setLicType] = useState<TypeLicence>('ABONNEMENT');
  const [licExpiration, setLicExpiration] = useState('');
  const [licEnvoi, setLicEnvoi] = useState(false);
  const [licErreur, setLicErreur] = useState<string | null>(null);

  // Modale « groupe » d'un cabinet (rattachement à un dossier mère, plafond)
  const [groupeEnCours, setGroupeEnCours] = useState<CabinetClient | null>(null);
  const [groupeMereId, setGroupeMereId] = useState('');
  const [groupePlafond, setGroupePlafond] = useState('');
  const [groupeEnvoi, setGroupeEnvoi] = useState(false);
  const [groupeErreur, setGroupeErreur] = useState<string | null>(null);

  // Modale « nouveau cabinet client »
  // Dernier recours · quand c'est l'ADMINISTRATEUR d'un cabinet qui a oublié
  // son mot de passe, plus personne dans son dossier ne peut le réinitialiser.
  // Sans cet écran on retombait sur un UPDATE SQL en production.
  const [reinitEnCours, setReinitEnCours] = useState<CabinetClient | null>(null);
  const [reinitEmail, setReinitEmail] = useState('');
  const [reinitMotDePasse, setReinitMotDePasse] = useState('');
  const [reinitErreur, setReinitErreur] = useState<string | null>(null);
  const [reinitFait, setReinitFait] = useState<string | null>(null);

  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const [creationMereId, setCreationMereId] = useState('');
  const [nomEntite, setNomEntite] = useState('');
  const [emailAdmin, setEmailAdmin] = useState('');
  const [referentielChoisi, setReferentielChoisi] = useState<'SYCEBNL' | 'SYSCOHADA'>('SYCEBNL');
  const [systemeChoisi, setSystemeChoisi] = useState<SystemeComptableSyscohada>('NORMAL');
  const [jeu, setJeu] = useState<JeuEtatsFinanciersSycebnl>('ASSOCIATIONS_ORDRES_PROFESSIONNELS');
  const [typeLicence, setTypeLicence] = useState<TypeLicence>('ABONNEMENT');
  const [dateExpiration, setDateExpiration] = useState('');
  const [ville, setVille] = useState('');
  const [pays, setPays] = useState('RD Congo');
  const [creationEnvoi, setCreationEnvoi] = useState(false);
  const [creationErreur, setCreationErreur] = useState<string | null>(null);

  // Résultat de création · le mot de passe temporaire n'est montré qu'ICI,
  // une seule fois (le serveur ne le stocke que haché).
  const [cree, setCree] = useState<CabinetCree | null>(null);

  const charger = async () => {
    try {
      setListe(await api.get<CabinetClient[]>('/plateforme/cabinets'));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les cabinets');
    }
  };

  useEffect(() => {
    if (utilisateur?.estOperateurPlateforme) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utilisateur?.estOperateurPlateforme]);

  if (!utilisateur?.estOperateurPlateforme) {
    return (
      <div className="p-4">
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[11px] max-w-[480px]">
          Cette console est réservée à l'opérateur de la plateforme.
        </div>
      </div>
    );
  }

  const basculerSuspension = async (c: CabinetClient) => {
    if (!c.licence) return;
    try {
      await api.patch(`/plateforme/cabinets/${c.id}/licence`, {
        statut: c.licence.statut === 'SUSPENDUE' ? 'ACTIVE' : 'SUSPENDUE',
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  const onReinitialiserAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (!reinitEnCours) return;
    setReinitErreur(null);
    try {
      const r = await api.post<{ reinitialise: boolean; email: string }>(
        `/plateforme/cabinets/${reinitEnCours.id}/reinitialiser-admin`,
        { email: reinitEmail, motDePasseProvisoire: reinitMotDePasse },
      );
      setReinitFait(r.email);
      setReinitEnCours(null);
      setReinitEmail('');
      setReinitMotDePasse('');
    } catch (err) {
      setReinitErreur(err instanceof ApiError ? err.message : 'Réinitialisation impossible');
    }
  };

  const ouvrirLicence = (c: CabinetClient) => {
    setLicenceEnCours(c);
    setLicType(c.licence?.type ?? 'ABONNEMENT');
    setLicExpiration(c.licence?.dateExpiration ? c.licence.dateExpiration.slice(0, 10) : '');
    setLicErreur(null);
  };

  const onEnregistrerLicence = async (e: FormEvent) => {
    e.preventDefault();
    if (!licenceEnCours) return;
    setLicEnvoi(true);
    setLicErreur(null);
    try {
      await api.patch(`/plateforme/cabinets/${licenceEnCours.id}/licence`, {
        type: licType,
        // '' efface l'échéance (licence perpétuelle) · convention serveur.
        dateExpiration: licExpiration,
        // Poser une nouvelle échéance réactive au passage une licence
        // suspendue serait un effet caché : le statut ne bouge que par le
        // bouton Suspendre/Réactiver, jamais d'ici.
      });
      setLicenceEnCours(null);
      await charger();
    } catch (err) {
      setLicErreur(err instanceof ApiError ? err.message : 'Modification impossible');
    } finally {
      setLicEnvoi(false);
    }
  };

  // Mères possibles pour un rattachement : un dossier qui n'est pas déjà une
  // cellule (un groupe n'a qu'un niveau · même règle que le serveur).
  const meresPossibles = (saufId?: string) => (liste ?? []).filter((c) => !c.dossierMere && c.id !== saufId);

  const ouvrirGroupe = (c: CabinetClient) => {
    setGroupeEnCours(c);
    setGroupeMereId(c.dossierMere?.id ?? '');
    setGroupePlafond(c.plafondCellules === null ? '' : String(c.plafondCellules));
    setGroupeErreur(null);
  };

  const onEnregistrerGroupe = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupeEnCours) return;
    setGroupeEnvoi(true);
    setGroupeErreur(null);
    try {
      await api.patch(`/plateforme/cabinets/${groupeEnCours.id}/groupe`, {
        // Une cellule ne peut pas porter de plafond · le champ n'est envoyé
        // que pour un dossier qui n'est pas rattaché.
        ...(groupeEnCours.nbCellules > 0
          ? { plafondCellules: groupePlafond === '' ? null : Number(groupePlafond) }
          : {
              dossierMereId: groupeMereId === '' ? null : groupeMereId,
              ...(groupeMereId === '' ? { plafondCellules: groupePlafond === '' ? null : Number(groupePlafond) } : {}),
            }),
      });
      setGroupeEnCours(null);
      await charger();
    } catch (err) {
      setGroupeErreur(err instanceof ApiError ? err.message : 'Rattachement impossible');
    } finally {
      setGroupeEnvoi(false);
    }
  };

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setCreationEnvoi(true);
    setCreationErreur(null);
    try {
      const resultat = await api.post<CabinetCree>('/plateforme/cabinets', {
        nomEntite,
        emailAdmin,
        referentiel: referentielChoisi,
        // Le jeu d'états est un concept SYCEBNL · le serveur l'ignorerait de
        // toute façon pour un dossier SYSCOHADA (AuthService.register).
        ...(referentielChoisi === 'SYCEBNL'
          ? { jeuEtatsFinanciersSycebnl: jeu }
          : { systemeComptableSyscohada: systemeChoisi }),
        typeLicence,
        ...(typeLicence === 'ABONNEMENT' && dateExpiration ? { dateExpiration } : {}),
        ...(ville ? { ville } : {}),
        ...(pays ? { pays } : {}),
        ...(creationMereId ? { dossierMereId: creationMereId } : {}),
      });
      setNouveauOuvert(false);
      setNomEntite('');
      setEmailAdmin('');
      setDateExpiration('');
      setVille('');
      setCreationMereId('');
      setCree(resultat);
      await charger();
    } catch (err) {
      setCreationErreur(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setCreationEnvoi(false);
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">VMG CONSULTING</div>
          <h1 className="text-[12px] font-bold leading-tight">Cabinets clients · licences et dossiers</h1>
        </div>
        <button type="button" onClick={() => setNouveauOuvert(true)} className="bg-sel text-white px-3.5 py-1 text-[10.5px] font-semibold">
          Nouveau cabinet client
        </button>
      </div>

      {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2 max-w-[980px]">{erreur}</div>}

      <div className="border border-border bg-surface shadow-posee max-w-[1080px] overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-[1.4fr_100px_1fr_60px_70px_130px_90px_90px_190px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            <span>CABINET</span>
            <span>JEU</span>
            <span>NIF</span>
            <span className="text-right">UTIL.</span>
            <span className="text-right">ÉCRIT.</span>
            <span>LICENCE</span>
            <span>ÉCHÉANCE</span>
            <span>ÉTAT</span>
            <span></span>
          </div>
          {!liste && <div className="p-3 text-[11px] text-text-dim">Chargement…</div>}
          {liste?.length === 0 && <div className="p-3 text-[11px] text-text-dim">Aucun cabinet client.</div>}
          {liste?.map((c, i) => {
            const etat = etatLicence(c.licence);
            const expiration = c.licence?.dateExpiration ? new Date(c.licence.dateExpiration).getTime() : null;
            const expireBientot = expiration !== null && expiration >= Date.now() && expiration - Date.now() < 30 * JOUR_MS;
            const expiree = expiration !== null && expiration < Date.now();
            return (
              <div
                key={c.id}
                className={`grid grid-cols-[1.4fr_100px_1fr_60px_70px_130px_90px_90px_190px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}
              >
                <span className="text-[11px] truncate">
                  <span className="font-semibold">{c.nom}</span>
                  {(c.ville || c.pays) && <span className="text-text-dim"> · {[c.ville, c.pays].filter(Boolean).join(', ')}</span>}
                  {c.nbCellules > 0 && <span className="text-sel"> · mère de {c.nbCellules} cellule{c.nbCellules > 1 ? 's' : ''}</span>}
                  {c.dossierMere && <span className="text-text-dim"> · cellule de {c.dossierMere.nom}</span>}
                </span>
                <span className="text-[10.5px]">
                  {/* Le jeu d'états n'a de sens qu'en SYCEBNL · un dossier
                      SYSCOHADA garde le défaut du schéma, qu'il ne faut pas
                      afficher comme s'il était une association. */}
                  {c.referentiel === 'SYSCOHADA'
                    ? c.systemeComptableSyscohada === 'MINIMAL_TRESORERIE'
                      ? 'SYSCOHADA · SMT'
                      : 'SYSCOHADA · Système normal'
                    : (c.jeuEtatsFinanciersSycebnl
                        ? LIBELLE_JEU[c.jeuEtatsFinanciersSycebnl]
                        : c.referentiel)}
                </span>
                <span className="text-[10.5px] font-mono truncate">{c.numeroImpot ?? '·'}</span>
                <span className="text-[10.5px] text-right tabular-nums">{c.nbUtilisateurs}</span>
                <span className="text-[10.5px] text-right tabular-nums">{c.nbEcritures}</span>
                <span className="text-[10.5px]">{c.licence ? LIBELLE_LICENCE[c.licence.type] : '·'}</span>
                <span className={`text-[10.5px] tabular-nums ${expiree ? 'text-danger font-semibold' : expireBientot ? 'text-warning font-semibold' : ''}`}>
                  {dateCourte(c.licence?.dateExpiration ?? null)}
                </span>
                <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${etat.classe}`}>{etat.libelle}</span>
                <span className="flex gap-2.5">
                  <button type="button" onClick={() => ouvrirLicence(c)} className="text-[10.5px] text-sel">
                    Licence
                  </button>
                  <button type="button" onClick={() => ouvrirGroupe(c)} className="text-[10.5px] text-sel">
                    Groupe
                  </button>
                  {c.licence && (
                    <button type="button" onClick={() => basculerSuspension(c)} className="text-[10.5px] text-sel">
                      {c.licence.statut === 'SUSPENDUE' ? 'Réactiver' : 'Suspendre'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setReinitEnCours(c);
                      setReinitEmail('');
                      setReinitMotDePasse('');
                      setReinitErreur(null);
                      setReinitFait(null);
                    }}
                    className="text-[10.5px] text-sel"
                  >
                    Mot de passe admin
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10.5px] text-text-dim mt-2 max-w-[980px]">
        L'échéance en orange expire sous 30 jours, en rouge elle est dépassée. Suspendre coupe immédiatement l'accès du
        cabinet · réactiver le rétablit. « Licence » change le type ou pose une nouvelle échéance (renouvellement).
      </p>

      {reinitFait && (
        <div className="border border-positive/30 bg-positive-soft px-3.5 py-2 text-[11px] mb-2">
          Mot de passe administrateur réinitialisé pour <strong>{reinitFait}</strong>. Remettez-le en main propre · il
          est PROVISOIRE, les sessions ouvertes du compte sont fermées, et le logiciel lui restera fermé tant qu'il ne
          l'aura pas remplacé.
        </div>
      )}

      {reinitEnCours && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form
            onSubmit={onReinitialiserAdmin}
            className="anim-fenetre bg-surface border border-border-dark shadow-flottant w-[460px] max-w-full"
          >
            <div className="px-3.5 py-2 bg-chrome border-b border-border-dark text-[11px] font-bold">
              Mot de passe administrateur · {reinitEnCours.nom}
            </div>
            <div className="p-3.5 flex flex-col gap-2.5">
              <p className="text-[10.5px] text-text-dim">
                Dernier recours, quand l'administrateur du cabinet a perdu son mot de passe et que personne dans son
                dossier ne peut le lui rendre. Vous ne pouvez réinitialiser QUE des administrateurs · un comptable
                relève de l'administrateur de son cabinet. Le geste est inscrit au journal d'audit.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-text-dim">ADRESSE DE L'ADMINISTRATEUR</span>
                <input
                  type="email"
                  value={reinitEmail}
                  onChange={(e) => setReinitEmail(e.target.value)}
                  required
                  autoFocus
                  className="border border-border-dark px-2.5 py-1.5 text-[11px]"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-text-dim">MOT DE PASSE PROVISOIRE</span>
                <input
                  value={reinitMotDePasse}
                  onChange={(e) => setReinitMotDePasse(e.target.value)}
                  minLength={10}
                  required
                  className="border border-border-dark px-2.5 py-1.5 text-[11px]"
                />
                <span className="text-[10px] text-text-dim">Dix caractères au minimum.</span>
              </label>
              {reinitErreur && (
                <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5">
                  {reinitErreur}
                </div>
              )}
            </div>
            <div className="px-3.5 py-2 bg-surface-alt border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReinitEnCours(null)}
                className="border border-border-dark px-3 py-1 text-[10.5px]"
              >
                Annuler
              </button>
              <button type="submit" className="border border-border-dark bg-chrome px-3 py-1 text-[10.5px] font-semibold">
                Réinitialiser
              </button>
            </div>
          </form>
        </div>
      )}

      {licenceEnCours && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onEnregistrerLicence} className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Licence · {licenceEnCours.nom}</span>
              <button type="button" onClick={() => setLicenceEnCours(null)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[130px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[11px] text-right">Type :</label>
                <select value={licType} onChange={(e) => setLicType(e.target.value as TypeLicence)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                  <option value="ABONNEMENT">Abonnement</option>
                  <option value="PERPETUEL_SAAS">Perpétuelle (SaaS)</option>
                  <option value="PERPETUEL_ONPREMISE">Perpétuelle (sur site)</option>
                </select>
                <label className="text-[11px] text-right">Échéance :</label>
                <input type="date" value={licExpiration} onChange={(e) => setLicExpiration(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
              </div>
              <p className="text-[10.5px] text-text-dim mt-2.5">
                Laisser l'échéance vide pour une licence sans date de fin. L'expiration se constate à l'échéance ·
                renouveler, c'est poser une nouvelle date.
              </p>
              {licErreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">{licErreur}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setLicenceEnCours(null)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11px]">
                  Annuler
                </button>
                <button type="submit" disabled={licEnvoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  {licEnvoi ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {groupeEnCours && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onEnregistrerGroupe} className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Groupe · {groupeEnCours.nom}</span>
              <button type="button" onClick={() => setGroupeEnCours(null)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              {groupeEnCours.nbCellules > 0 ? (
                <p className="text-[11px]">
                  Ce dossier est la mère de {groupeEnCours.nbCellules} cellule{groupeEnCours.nbCellules > 1 ? 's' : ''} ·
                  il ne peut pas devenir lui-même une cellule.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5">
                    <label className="text-[11px] text-right">Dossier mère :</label>
                    <select value={groupeMereId} onChange={(e) => setGroupeMereId(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                      <option value="">Aucun (dossier indépendant)</option>
                      {meresPossibles(groupeEnCours.id).map((m) => (
                        <option key={m.id} value={m.id}>{m.nom}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10.5px] text-text-dim mt-2.5">
                    Rattacher ce dossier comme cellule autorise le dossier mère à lire sa balance pour la balance
                    agrégée du groupe (une même personne morale en plusieurs dossiers). Un groupe n'a qu'un niveau.
                  </p>
                </>
              )}
              {groupeErreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">{groupeErreur}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setGroupeEnCours(null)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11px]">
                  Annuler
                </button>
                {groupeEnCours.nbCellules === 0 && (
                  <button type="submit" disabled={groupeEnvoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                    {groupeEnvoi ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      )}

      {nouveauOuvert && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onCreer} className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Nouveau cabinet client</span>
              <button type="button" onClick={() => setNouveauOuvert(false)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[140px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[11px] text-right">Nom de l'entité :</label>
                <input required autoFocus value={nomEntite} onChange={(e) => setNomEntite(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">E-mail de l'admin :</label>
                <input type="email" required value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">Référentiel :</label>
                <select
                  value={referentielChoisi}
                  onChange={(e) => setReferentielChoisi(e.target.value as 'SYCEBNL' | 'SYSCOHADA')}
                  className="border border-border-dark px-2.5 py-1.5 text-[11px]"
                >
                  <option value="SYCEBNL">SYCEBNL · entité à but non lucratif</option>
                  <option value="SYSCOHADA">SYSCOHADA révisé · entreprise</option>
                </select>
                {referentielChoisi === 'SYCEBNL' ? (
                  <>
                    <label className="text-[11px] text-right">Type d'entité :</label>
                    <select value={jeu} onChange={(e) => setJeu(e.target.value as JeuEtatsFinanciersSycebnl)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                      <option value="ASSOCIATIONS_ORDRES_PROFESSIONNELS">Association / ordre professionnel</option>
                      <option value="PROJETS_DEVELOPPEMENT">Projet de développement</option>
                      <option value="SYSTEME_MINIMAL_TRESORERIE">Système minimal de trésorerie</option>
                    </select>
                  </>
                ) : (
                  <>
                    {/* AUDCIF art. 11 : deux systèmes, pas un · le SMT de
                        l'art. 13 est réservé aux entités sous seuil de
                        chiffre d'affaires (60 M négoce, 40 M artisanat,
                        30 M services). Même question que côté assistant. */}
                    <label className="text-[11px] text-right">Système comptable :</label>
                    <select
                      value={systemeChoisi}
                      onChange={(e) => setSystemeChoisi(e.target.value as SystemeComptableSyscohada)}
                      className="border border-border-dark px-2.5 py-1.5 text-[11px]"
                    >
                      <option value="NORMAL">Système normal</option>
                      <option value="MINIMAL_TRESORERIE">Système minimal de trésorerie (sous seuil)</option>
                    </select>
                  </>
                )}
                <label className="text-[11px] text-right">Licence :</label>
                <select value={typeLicence} onChange={(e) => setTypeLicence(e.target.value as TypeLicence)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                  <option value="ABONNEMENT">Abonnement</option>
                  <option value="PERPETUEL_SAAS">Perpétuelle (SaaS)</option>
                  <option value="PERPETUEL_ONPREMISE">Perpétuelle (sur site)</option>
                </select>
                {typeLicence === 'ABONNEMENT' && (
                  <>
                    <label className="text-[11px] text-right">Échéance :</label>
                    <input type="date" value={dateExpiration} onChange={(e) => setDateExpiration(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                  </>
                )}
                <label className="text-[11px] text-right">Ville :</label>
                <input value={ville} onChange={(e) => setVille(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">Pays :</label>
                <input value={pays} onChange={(e) => setPays(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">Dossier mère :</label>
                <select value={creationMereId} onChange={(e) => setCreationMereId(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                  <option value="">Aucun (dossier indépendant)</option>
                  {meresPossibles().map((m) => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10.5px] text-text-dim mt-2.5">
                Le dossier est créé complet (plan de comptes {referentielChoisi}, journaux, taxes, exercice
                courant). Le mot de passe de l'administrateur est généré et affiché une seule fois à l'étape
                suivante.
              </p>
              {creationErreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">{creationErreur}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setNouveauOuvert(false)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11px]">
                  Annuler
                </button>
                <button type="submit" disabled={creationEnvoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  {creationEnvoi ? 'Création…' : 'Créer le cabinet'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {cree && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <div className="anim-modale w-full max-w-[460px] bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Cabinet créé · {cree.tenant.nom}</span>
            </div>
            <div className="p-4">
              <p className="text-[11px]">Remettez ces identifiants à l'administrateur du cabinet :</p>
              <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 mt-2.5 text-[11px]">
                <span className="text-right text-text-dim">E-mail :</span>
                <span className="font-mono select-all">{cree.adminEmail}</span>
                <span className="text-right text-text-dim">Mot de passe :</span>
                <span className="font-mono select-all font-bold">{cree.motDePasseTemporaire}</span>
              </div>
              <div className="border border-warning/30 bg-warning-soft px-3 py-2 text-[10.5px] mt-3">
                Ce mot de passe n'est affiché qu'UNE SEULE FOIS · le serveur n'en garde qu'une empreinte. Notez-le
                maintenant, puis invitez le client à le changer à sa première connexion.
              </div>
              <div className="flex justify-end mt-4">
                <button type="button" onClick={() => setCree(null)} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold">
                  J'ai noté le mot de passe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
