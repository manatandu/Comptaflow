import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { sousFonctionServie } from '../lib/profil-dossier';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import { PlanFiscalDegressif } from '../components/PlanFiscalDegressif';
import type { Compte, FamilleImmobilisation, Immobilisation, Journal, TypeComposant } from '../lib/types';

/**
 * Immobilisations (§3.3) : familles (gabarits, comptes + durée par défaut ·
 * voir famille-immobilisation-seed.ts pour les 6 familles seedées, ancrées
 * à l'arrêté RDC n° 013/2025), instances, dotation périodique (linéaire,
 * prorata temporis) et sortie (cession/mise hors service). Pas de gestion
 * de composants ni d'amortissement dégressif dans ce MVP (skill sycebnl :
 * la décomposition n'est de toute façon autorisée que pour des catégories
 * de biens limitées).
 */
export function ImmobilisationsPage() {
  const { estAdmin, peutEcrire, utilisateur } = useAuth();
  // Au SMT, la Note 1 ne connaît que le bien · ni composant ni révision
  // majeure reconstituée (lib/profil-dossier.ts). Un composant déjà porté
  // garde son bouton Renouveler.
  const composantsServis = sousFonctionServie('composants', utilisateur?.tenant);
  const revisionServie = sousFonctionServie('revision-majeure', utilisateur?.tenant);
  // Le dégressif est une option de l'impôt sur les sociétés · SYSCOHADA seul.
  const syscohada = utilisateur?.tenant.referentiel === 'SYSCOHADA';
  const [fiscalOuvertPour, setFiscalOuvertPour] = useState<string | null>(null);
  const { exerciceCourant } = useExercice();
  const [familles, setFamilles] = useState<FamilleImmobilisation[] | null>(null);
  const [immobilisations, setImmobilisations] = useState<Immobilisation[] | null>(null);
  const [comptesClasse2, setComptesClasse2] = useState<Compte[]>([]);
  const [comptesFinancement, setComptesFinancement] = useState<Compte[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);

  const [afficherFormFamille, setAfficherFormFamille] = useState(false);
  const [afficherFormImmo, setAfficherFormImmo] = useState(false);

  const [sortieOuvertePour, setSortieOuvertePour] = useState<string | null>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [reconstitution, setReconstitution] = useState<{
    immobilisation: string;
    possible: boolean;
    motif?: string;
    valeurNetteEstimee?: number;
    amortissementEstime?: number;
    suite: string;
  } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // --- formulaire famille ---
  const [fCode, setFCode] = useState('');
  const [fIntitule, setFIntitule] = useState('');
  const [fCompteImmo, setFCompteImmo] = useState('');
  const [fCompteAmort, setFCompteAmort] = useState('');
  const [fCompteDotation, setFCompteDotation] = useState('');
  const [fDuree, setFDuree] = useState('5');

  // --- formulaire immobilisation ---
  const [iFamilleId, setIFamilleId] = useState('');
  const [iDesignation, setIDesignation] = useState('');
  const [iNumeroInventaire, setINumeroInventaire] = useState('');
  const [iDateAcquisition, setIDateAcquisition] = useState(() => new Date().toISOString().slice(0, 10));
  const [iDateMiseEnService, setIDateMiseEnService] = useState(() => new Date().toISOString().slice(0, 10));
  const [iValeurOrigine, setIValeurOrigine] = useState('');
  const [iValeurResiduelle, setIValeurResiduelle] = useState('0');
  // Bien REPRIS · ce qui a été amorti avant l'entrée dans le logiciel. Zéro
  // pour un bien acquis ici, ce qui est le cas courant · d'où le champ en
  // dernier et non en évidence.
  const [iAmortissementAnterieur, setIAmortissementAnterieur] = useState('0');
  const [iCompteContrepartie, setICompteContrepartie] = useState('');
  const [iJournalId, setIJournalId] = useState('');

  // --- formulaire sortie (par immobilisation) ---
  const [sDateSortie, setSDateSortie] = useState(() => new Date().toISOString().slice(0, 10));
  const [sType, setSType] = useState<'CESSION' | 'MISE_HORS_SERVICE'>('MISE_HORS_SERVICE');
  const [sPrixCession, setSPrixCession] = useState('');
  const [sCompteContrepartie, setSCompteContrepartie] = useState('');
  const [sJournalId, setSJournalId] = useState('');

  // Dépréciation · AUDCIF art. 46 et Titre VIII ch. 12 ; SYCEBNL, fiche du
  // COMPTE 29. Rien n'est prérempli : ni le montant, qui suppose une valeur
  // actuelle estimée hors du logiciel, ni l'indice, sans lequel aucun test
  // n'est requis et donc aucune dotation n'est justifiable (ch. 12 § 2.1).
  const [depreciationOuvertePour, setDepreciationOuvertePour] = useState<string | null>(null);
  const [dSens, setDSens] = useState<'DOTATION' | 'REPRISE'>('DOTATION');
  const [dMontant, setDMontant] = useState('');
  const [dCompte29, setDCompte29] = useState('');
  const [dContrepartie, setDContrepartie] = useState('');
  const [dIndice, setDIndice] = useState('');

  // Approche par composants · AUDCIF Titre VIII ch. 4 ; SYCEBNL, Partie 2
  // ch. 3, classe 2. Tout est facultatif : sans principal désigné, le bien
  // créé est une structure ordinaire, exactement comme avant.
  const [iPrincipal, setIPrincipal] = useState('');
  const [iTypeComposant, setITypeComposant] = useState<TypeComposant>('COMPOSANT');
  const [iJustification, setIJustification] = useState('');
  // Reclassement · AUDCIF Titre VIII ch. 10 § 2.4. Rien n'est prérempli et
  // aucun montant n'est demandé : le transfert « n'a pas d'incidence sur la
  // valeur comptable du bien immobilier transféré », le serveur vire ce que le
  // bien porte déjà. Le motif, lui, est exigé · le § 1.2 qualifie un immeuble
  // de placement par l'USAGE, que nul solde ne porte.
  const [reclassementOuvertPour, setReclassementOuvertPour] = useState<string | null>(null);
  const [rcFamille, setRcFamille] = useState('');
  const [rcDate, setRcDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rcMotif, setRcMotif] = useState('');
  const [rcCompte29, setRcCompte29] = useState('');

  const [renouvellementOuvertPour, setRenouvellementOuvertPour] = useState<string | null>(null);
  const [rDesignation, setRDesignation] = useState('');
  const [rCout, setRCout] = useState('');
  const [rDuree, setRDuree] = useState('');
  const [rDate, setRDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rContrepartie, setRContrepartie] = useState('');

  const charger = async () => {
    const [f, i, c2, ctrésorerie, jrn] = await Promise.all([
      api.get<FamilleImmobilisation[]>('/immobilisations/familles'),
      api.get<Immobilisation[]>('/immobilisations'),
      api.get<Compte[]>('/comptes?classe=CLASSE_2&typeCompte=DETAIL'),
      api.get<Compte[]>('/comptes?typeCompte=DETAIL'),
      api.get<Journal[]>('/journaux'),
    ]);
    setFamilles(f);
    setImmobilisations(i);
    setComptesClasse2(c2);
    setComptesFinancement(ctrésorerie);
    setJournaux(jrn);
    const od = jrn.find((j) => j.code === 'OD');
    if (od) {
      setIJournalId((v) => v || od.id);
      setSJournalId((v) => v || od.id);
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreerFamille = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/immobilisations/familles', {
        code: fCode,
        intitule: fIntitule,
        compteImmobilisationId: fCompteImmo,
        compteAmortissementId: fCompteAmort,
        compteDotationId: fCompteDotation,
        dureeAmortissementAns: Number(fDuree),
      });
      setFCode('');
      setFIntitule('');
      setFCompteImmo('');
      setFCompteAmort('');
      setFCompteDotation('');
      setFDuree('5');
      setAfficherFormFamille(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer cette famille');
    } finally {
      setEnvoi(false);
    }
  };

  const onCreerImmo = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/immobilisations', {
        familleId: iFamilleId,
        designation: iDesignation,
        numeroInventaire: iNumeroInventaire || undefined,
        dateAcquisition: iDateAcquisition,
        dateMiseEnService: iDateMiseEnService,
        valeurOrigine: Number(iValeurOrigine),
        valeurResiduelle: Number(iValeurResiduelle || 0),
        amortissementAnterieur: Number(iAmortissementAnterieur || 0),
        compteContrepartieId: iCompteContrepartie,
        exerciceId: exerciceCourant?.id,
        journalId: iJournalId,
        immobilisationPrincipaleId: iPrincipal || undefined,
        typeComposant: iPrincipal ? iTypeComposant : undefined,
        justificationDecomposition: iPrincipal ? iJustification : undefined,
      });
      setIDesignation('');
      setIPrincipal('');
      setIJustification('');
      setINumeroInventaire('');
      setIValeurOrigine('');
      setIValeurResiduelle('0');
      setAfficherFormImmo(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de créer cette immobilisation");
    } finally {
      setEnvoi(false);
    }
  };

  const passerDotation = async (immoId: string) => {
    if (!exerciceCourant) return;
    setErreur(null);
    setInfo(null);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      const resultat = await api.post<{ montant: number }>(`/immobilisations/${immoId}/dotation`, {
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
      });
      setInfo(`Dotation de ${resultat.montant.toLocaleString('fr-FR')} passée pour l'exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de passer la dotation');
    }
  };

  const onSortir = async (e: FormEvent, immoId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post(`/immobilisations/${immoId}/sortie`, {
        dateSortie: sDateSortie,
        type: sType,
        exerciceId: exerciceCourant.id,
        journalId: sJournalId,
        prixCession: sType === 'CESSION' ? Number(sPrixCession) : undefined,
        compteContrepartieId: sType === 'CESSION' ? sCompteContrepartie : undefined,
      });
      setSortieOuvertePour(null);
      setSPrixCession('');
      setInfo('Sortie enregistrée.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de sortir cette immobilisation');
    } finally {
      setEnvoi(false);
    }
  };

  const onDeprecier = async (e: FormEvent, immoId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      await api.post(`/immobilisations/${immoId}/depreciation`, {
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
        sens: dSens,
        montant: Number(dMontant),
        compteDepreciationId: dCompte29,
        compteContrepartieId: dContrepartie,
        indice: dIndice,
      });
      setDepreciationOuvertePour(null);
      setDMontant('');
      setDIndice('');
      setInfo(
        dSens === 'DOTATION'
          ? 'Dépréciation enregistrée · le plan d’amortissement se ré-étale sur la durée restant à courir.'
          : 'Reprise enregistrée.',
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer cette dépréciation');
    } finally {
      setEnvoi(false);
    }
  };

  const onReclasser = async (e: FormEvent, immoId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      await api.post(`/immobilisations/${immoId}/reclassement`, {
        nouvelleFamilleId: rcFamille,
        dateReclassement: rcDate,
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
        motif: rcMotif,
        ...(rcCompte29 ? { nouveauCompteDepreciationId: rcCompte29 } : {}),
      });
      setReclassementOuvertPour(null);
      setRcMotif('');
      setRcCompte29('');
      setInfo(
        'Bien reclassé · la valeur d’origine, l’amortissement cumulé et la dépréciation ont été virés tels ' +
          'quels. Aucun montant n’a été recalculé, la valeur comptable nette est inchangée.',
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de reclasser ce bien');
    } finally {
      setEnvoi(false);
    }
  };

  const onRenouveler = async (e: FormEvent, composantId: string) => {
    e.preventDefault();
    if (!exerciceCourant) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      await api.post(`/immobilisations/${composantId}/renouvellement`, {
        dateRenouvellement: rDate,
        exerciceId: exerciceCourant.id,
        journalId: od?.id ?? journaux[0]?.id,
        designation: rDesignation,
        coutRenouvellement: Number(rCout),
        dureeAmortissementAns: Number(rDuree),
        compteContrepartieId: rContrepartie,
      });
      setRenouvellementOuvertPour(null);
      setRDesignation('');
      setRCout('');
      setInfo('Composant renouvelé · l’ancien est sorti de l’actif et le nouveau porté au même principal.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de renouveler ce composant');
    } finally {
      setEnvoi(false);
    }
  };

  const principaux = (immobilisations ?? []).filter(
    (i) => !i.immobilisationPrincipaleId && i.statut === 'EN_SERVICE',
  );
  const nomPrincipal = (id: string | null) =>
    (immobilisations ?? []).find((i) => i.id === id)?.designation ?? null;

  /**
   * RECONSTITUER UN COMPOSANT « RÉVISIONS MAJEURES » JAMAIS IDENTIFIÉ · AUDCIF
   * Titre VIII ch. 5 § 1. Le calcul est rendu, rien n'est posté : la
   * ventilation de la valeur brute entre la structure et le composant est une
   * décision du cabinet, et le texte n'écrit qu'une possibilité.
   */
  const reconstituerRevision = async (immo: Immobilisation) => {
    const cout = window.prompt(
      `${immo.designation} · coût de révision ACTUEL, celui d’aujourd’hui et non celui de l’acquisition.\n\n` +
        'AUDCIF ch. 5 § 1 : la valeur nette du composant jamais identifié « peut être estimée par référence au ' +
        'coût de révision actuel amorti ».',
    );
    if (!cout?.trim()) return;
    const intervalle = window.prompt('Intervalle entre deux révisions, en années.');
    if (!intervalle?.trim()) return;
    const derniere = window.prompt(
      'Date de la dernière révision RÉELLEMENT réalisée, au format AAAA-MM-JJ.\n\n' +
        'Laisser vide si aucune révision n’a encore eu lieu · l’estimation se place alors à la date d’acquisition, ' +
        'comme le texte le prévoit.',
    );
    setErreur(null);
    try {
      const params = new URLSearchParams({
        coutRevisionActuel: cout.trim(),
        intervalleRevisionsAns: intervalle.trim(),
        dateReconstitution: new Date().toISOString().slice(0, 10),
        ...(derniere?.trim() ? { derniereRevisionRealiseeLe: derniere.trim() } : {}),
      });
      const r = await api.get<{
        possible: boolean;
        motif?: string;
        valeurNetteEstimee?: number;
        amortissementEstime?: number;
        suite: string;
      }>(`/immobilisations/${immo.id}/reconstitution-revision-majeure?${params}`);
      setReconstitution({ immobilisation: immo.designation, ...r });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Estimation impossible');
    }
  };

  /**
   * LE RELEVÉ D'UNITÉS D'ŒUVRE · le seul chiffre du plan d'amortissement
   * qu'aucune comptabilité ne porte. Il se saisit avec sa source · c'est la
   * source que le réviseur demandera, pas le nombre.
   */
  const saisirConsommation = async (immo: Immobilisation) => {
    const unites = window.prompt(
      `${immo.designation} · unités d’œuvre consommées sur cet exercice (${immo.uniteOeuvreLibelle ?? 'unités'}).\n\n` +
        'Celles de l’exercice, jamais un cumul.',
    );
    if (!unites?.trim()) return;
    const source = window.prompt(
      'D’où vient ce chiffre ? Relevé de compteur, carnet de bord, fiche de production.\n\n' +
        'La provenance est exigée : c’est elle que le réviseur demandera, pas le nombre.',
    );
    if (!source?.trim()) return;
    setErreur(null);
    try {
      await api.post(`/immobilisations/${immo.id}/consommation`, {
        exerciceId: exerciceCourant?.id,
        unitesConsommees: Number(unites),
        source: source.trim(),
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer le relevé');
    }
  };

  const cumulAmorti = (immo: Immobilisation) => immo.dotations.reduce((s, d) => s + d.montant, 0);
  // Les deux textes inscrivent la dépréciation EN DIMINUTION DE LA VALEUR
  // BRUTE · l'omettre ici afficherait une valeur nette que le bilan ne porte
  // pas (SYCEBNL, fiche du COMPTE 29 · AUDCIF art. 46).
  const cumulDeprecie = (immo: Immobilisation) =>
    immo.depreciations.reduce((s, d) => s + (d.sens === 'DOTATION' ? d.montant : -d.montant), 0);
  const vcn = (immo: Immobilisation) => immo.valeurOrigine - cumulAmorti(immo) - cumulDeprecie(immo);
  const dejaDoteeCetExercice = (immo: Immobilisation) =>
    !!exerciceCourant && immo.dotations.some((d) => d.exerciceId === exerciceCourant.id);

  const LIBELLE_STATUT: Record<Immobilisation['statut'], string> = {
    EN_SERVICE: 'En service',
    CEDEE: 'Cédée',
    MISE_HORS_SERVICE: 'Hors service',
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-end mb-1.5 max-w-[1100px]">
        {/* Les familles sont réservées à l'administrateur (@Roles ADMIN_CABINET),
            les immobilisations s'ouvrent aussi au comptable. */}
        {peutEcrire && (
          <div className="flex items-center gap-1.5">
            {estAdmin && (
              <button
                type="button"
                onClick={() => setAfficherFormFamille((v) => !v)}
                className="border border-border rounded-[3px] bg-surface px-3 py-[3px] text-[11.5px] font-semibold hover:bg-surface-alt"
              >
                Nouvelle famille
              </button>
            )}
            <button type="button" onClick={() => setAfficherFormImmo((v) => !v)} className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold hover:opacity-90">
              Nouvelle immobilisation
            </button>
          </div>
        )}
      </div>

      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[1100px]">{erreur}</div>}

      {reconstitution && (
        <div className="border border-border bg-surface px-3.5 py-2.5 mb-3 max-w-[1100px] text-[11.5px]">
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold">
              Composant « révisions majeures » · {reconstitution.immobilisation}
            </div>
            <button
              type="button"
              onClick={() => setReconstitution(null)}
              className="text-[11px] text-text-dim hover:underline"
            >
              Fermer
            </button>
          </div>
          {reconstitution.possible ? (
            <div className="mt-1">
              Valeur nette estimée{' '}
              <span className="font-mono font-semibold">
                {(reconstitution.valeurNetteEstimee ?? 0).toLocaleString('fr-FR')}
              </span>{' '}
              · amortissement fictif déjà couru{' '}
              <span className="font-mono">{(reconstitution.amortissementEstime ?? 0).toLocaleString('fr-FR')}</span>
            </div>
          ) : (
            <div className="mt-1 text-warning">{reconstitution.motif}</div>
          )}
          <div className="mt-1.5 text-[11px] text-text-dim">{reconstitution.suite}</div>
        </div>
      )}
      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[1100px]">{info}</div>}

      {estAdmin && afficherFormFamille && (
        <form onSubmit={onCreerFamille} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
          <div className="font-mono text-[11.5px] font-semibold text-text-dim mb-3">Nouvelle famille</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim">
              Code
              <input required value={fCode} onChange={(e) => setFCode(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
              Intitulé
              <input required value={fIntitule} onChange={(e) => setFIntitule(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Compte d'immobilisation (classe 2)
              <select required value={fCompteImmo} onChange={(e) => setFCompteImmo(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {comptesClasse2.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Compte d'amortissement (classe 28)
              <select required value={fCompteAmort} onChange={(e) => setFCompteAmort(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {comptesFinancement.filter((c) => c.numero.startsWith('28')).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Compte de dotation (classe 68)
              <select required value={fCompteDotation} onChange={(e) => setFCompteDotation(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {comptesFinancement.filter((c) => c.numero.startsWith('68')).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Durée d'amortissement (années)
              <input required type="number" min={1} value={fDuree} onChange={(e) => setFDuree(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-50">{envoi ? 'Création…' : 'Ajouter'}</button>
            <button type="button" onClick={() => setAfficherFormFamille(false)} className="text-[11.5px] font-semibold text-text-dim px-4 py-1.5">Annuler</button>
          </div>
        </form>
      )}

      {peutEcrire && afficherFormImmo && (
        <form onSubmit={onCreerImmo} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
          <div className="font-mono text-[11.5px] font-semibold text-text-dim mb-3 flex items-center gap-1.5">
            Nouvelle immobilisation
            <Aide
              titre="Seuil d'immobilisation"
              texte="En dessous de l'équivalent de 500 USD, le bien peut être passé directement en charge plutôt qu'immobilisé · à votre appréciation, non vérifié automatiquement ici."
              source="Arrêté RDC n° 014/2025"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
              Désignation
              <input required value={iDesignation} onChange={(e) => setIDesignation(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              N° inventaire
              <input value={iNumeroInventaire} onChange={(e) => setINumeroInventaire(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Famille
              <select required value={iFamilleId} onChange={(e) => setIFamilleId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {(familles ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.intitule} ({f.dureeAmortissementAns} ans)</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Date d'acquisition
              <input required type="date" value={iDateAcquisition} onChange={(e) => setIDateAcquisition(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Date de mise en service
              <input required type="date" value={iDateMiseEnService} onChange={(e) => setIDateMiseEnService(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Valeur d'origine
              <input required type="number" step="0.01" min={0} value={iValeurOrigine} onChange={(e) => setIValeurOrigine(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Valeur résiduelle
              <input type="number" step="0.01" min={0} value={iValeurResiduelle} onChange={(e) => setIValeurResiduelle(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              <span className="flex items-center gap-1">
                Amortissement déjà pratiqué
                <Aide
                  titre="Amortissement déjà pratiqué"
                  texte="Pour un bien REPRIS, mis en service avant l'ouverture du dossier : le cumul déjà porté au compte 28 à la date de reprise. Sans lui, le bien s'amortirait sa durée entière une seconde fois. Zéro pour un bien acquis dans le logiciel."
                  source="Immobilisations"
                />
              </span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={iAmortissementAnterieur}
                onChange={(e) => setIAmortissementAnterieur(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
              />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Financement (contrepartie)
              <select required value={iCompteContrepartie} onChange={(e) => setICompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {comptesFinancement.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
          </div>
          {/* APPROCHE PAR COMPOSANTS · facultative. Laisser le principal vide crée
              une immobilisation ordinaire, c'est-à-dire une STRUCTURE au sens du
              ch. 4 § 1. Le renseigner rattache le bien et lui garde son PROPRE
              plan d'amortissement, ce qui est tout l'objet du chapitre. */}
{composantsServis && (
          <div className="border-t border-border pt-3 mb-3">
            <div className="font-mono text-[11px] font-semibold text-text-dim mb-2 flex items-center gap-1.5">
              COMPOSANT D’UNE AUTRE IMMOBILISATION (facultatif)
              <Aide
                titre="Approche par composants"
                texte="Une pièce de SÉCURITÉ s’amortit dès l’acquisition du bien principal, qu’elle serve ou non ; une pièce de RECHANGE seulement à partir du jour où elle y est intégrée. Un composant ne porte pas de valeur résiduelle, sauf s’il s’agit du dernier renouvellement avant la fin d’utilisation du bien."
                source="AUDCIF Titre VIII ch. 4 § 3.3 et § 4.3"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-[11.5px] font-semibold text-text-dim">
                Immobilisation principale
                <select value={iPrincipal} onChange={(e) => setIPrincipal(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                  <option value="">Aucune · bien autonome</option>
                  {principaux.map((i) => (
                    <option key={i.id} value={i.id}>{i.designation}</option>
                  ))}
                </select>
              </label>
              {iPrincipal && (
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Nature
                  <select value={iTypeComposant} onChange={(e) => setITypeComposant(e.target.value as TypeComposant)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                    <option value="COMPOSANT">Composant</option>
                    <option value="DEMANTELEMENT">Démantèlement et remise en état du site</option>
                    <option value="REVISION_MAJEURE">Révision majeure</option>
                    <option value="PIECE_DE_RECHANGE">Pièce de rechange</option>
                    <option value="PIECE_DE_SECURITE">Pièce de sécurité</option>
                  </select>
                </label>
              )}
            </div>
            {iPrincipal && (
              <>
                <label className="block text-[11.5px] font-semibold text-text-dim mt-3">
                  Pourquoi ce bien est décomposable
                  <input
                    maxLength={500}
                    value={iJustification}
                    onChange={(e) => setIJustification(e.target.value)}
                    placeholder="Durées d’utilité distinctes, coût significatif, informations disponibles sur chaque élément…"
                    className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                  />
                </label>
              </>
            )}
          </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={envoi || !exerciceCourant} className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-50">{envoi ? 'Création…' : 'Ajouter'}</button>
            <button type="button" onClick={() => setAfficherFormImmo(false)} className="text-[11.5px] font-semibold text-text-dim px-4 py-1.5">Annuler</button>
          </div>
        </form>
      )}

      {!immobilisations && <div className="text-[11.5px] text-text-dim">Chargement…</div>}

      {immobilisations && (
        <div
          // `overflow-x-auto` ici, `min-w` sur les lignes · les 868 px de colonnes
          // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
          // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
          // qui emportait alors titre, onglets et boutons hors de l'écran.
          className="border border-border bg-surface shadow-posee max-w-[1180px] overflow-x-auto"
        >
          <div className="grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] min-w-[1020px] gap-2.5 px-3.5 py-1.5 bg-chrome border-b border-border text-[11px] font-bold text-text-dim">
            <span>Désignation</span>
            <span>Mise en service</span>
            <span className="text-right">v. origine</span>
            <span className="text-right">Cumul amorti</span>
            <span className="text-right">V.N.C.</span>
            <span>Durée</span>
            <span>STATUT</span>
            <span />
          </div>
          {immobilisations.map((immo, i) => (
            <div key={immo.id}>
              <div
                className={`grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] min-w-[1020px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border text-[11.5px] ${
                  i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                <span className="truncate">
                  {immo.designation}{immo.numeroInventaire ? ` (${immo.numeroInventaire})` : ''}
                  {/* Le rattachement est ce qui manquait · le montrer sur la ligne
                      évite qu'un composant se lise comme un bien autonome. */}
                  {immo.immobilisationPrincipaleId && (
                    <span className="block text-[11px] text-text-dim">
                      composant de {nomPrincipal(immo.immobilisationPrincipaleId) ?? '…'}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-text-dim">{new Date(immo.dateMiseEnService).toLocaleDateString('fr-FR')}</span>
                <span className="font-mono text-right">{immo.valeurOrigine.toLocaleString('fr-FR')}</span>
                <span className="font-mono text-right">{cumulAmorti(immo).toLocaleString('fr-FR')}</span>
                <span className="font-mono text-right font-semibold">{vcn(immo).toLocaleString('fr-FR')}</span>
                <span className="font-mono text-[11px] text-text-dim">
                  {immo.modeAmortissement === 'UNITES_DOEUVRE'
                    ? `${(immo.unitesOeuvrePrevues ?? 0).toLocaleString('fr-FR')} ${immo.uniteOeuvreLibelle ?? ''}`
                    : `${immo.dureeAmortissementAns} ans`}
                </span>
                <span
                  className={`font-mono text-[11px] font-bold px-1.5 py-0.5 w-fit ${
                    immo.statut === 'EN_SERVICE' ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
                  }`}
                >
                  {LIBELLE_STATUT[immo.statut]}
                </span>
                <span className="flex gap-2">
                  {immo.statut === 'EN_SERVICE' && (
                    <>
                      {/* L'estimation est un GET qui n'écrit rien · elle reste
                          offerte à la lecture seule. */}
                      {revisionServie && !immo.immobilisationPrincipaleId && (
                        <button
                          onClick={() => reconstituerRevision(immo)}
                          title="Estimer un composant « révisions majeures » jamais identifié (AUDCIF ch. 5 § 1)"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Révision
                        </button>
                      )}
                    </>
                  )}
                  {peutEcrire && immo.statut === 'EN_SERVICE' && (
                    <>
                      {immo.modeAmortissement === 'UNITES_DOEUVRE' && (
                        <button
                          onClick={() => saisirConsommation(immo)}
                          title="Saisir les unités d’œuvre consommées sur cet exercice"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Relevé
                        </button>
                      )}
                      <button
                        onClick={() => passerDotation(immo.id)}
                        disabled={dejaDoteeCetExercice(immo)}
                        title={dejaDoteeCetExercice(immo) ? 'Déjà dotée pour cet exercice' : 'Passer la dotation de cet exercice'}
                        className="text-[11px] text-sel hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        Doter
                      </button>
                      {immo.immobilisationPrincipaleId && (
                        <button
                          onClick={() =>
                            setRenouvellementOuvertPour(renouvellementOuvertPour === immo.id ? null : immo.id)
                          }
                          title="Sortir ce composant de l’actif et porter son remplaçant"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Renouveler
                        </button>
                      )}
                      {syscohada && (
                        <button
                          onClick={() => setFiscalOuvertPour(fiscalOuvertPour === immo.id ? null : immo.id)}
                          title="Dégressif fiscal et amortissement dérogatoire"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Fiscal
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setReclassementOuvertPour(reclassementOuvertPour === immo.id ? null : immo.id)
                        }
                        title="Changer la catégorie du bien sans toucher à sa valeur comptable"
                        className="text-[11px] text-sel hover:underline"
                      >
                        Reclasser
                      </button>
                      <button
                        onClick={() =>
                          setDepreciationOuvertePour(depreciationOuvertePour === immo.id ? null : immo.id)
                        }
                        title="Constater une perte de valeur, ou en reprendre une"
                        className="text-[11px] text-sel hover:underline"
                      >
                        Déprécier
                      </button>
                      <button
                        onClick={() => setSortieOuvertePour(sortieOuvertePour === immo.id ? null : immo.id)}
                        className="text-[11px] text-sel hover:underline"
                      >
                        Sortir
                      </button>
                    </>
                  )}
                </span>
              </div>
              {fiscalOuvertPour === immo.id && (
                <PlanFiscalDegressif
                  immoId={immo.id}
                  journalId={(journaux.find((j) => j.code === 'OD') ?? journaux[0])?.id}
                  exerciceId={exerciceCourant?.id}
                  peutEcrire={peutEcrire}
                />
              )}
              {reclassementOuvertPour === immo.id && (
                <form onSubmit={(e) => onReclasser(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  {/* Ch. 10 § 2.4 · « Étant donné que les immeubles de placement sont
                      évalués selon le modèle du coût historique, les transferts […]
                      n'ont pas d'incidence sur la valeur comptable du bien immobilier
                      transféré. » D'où l'absence de tout champ de montant : le laisser
                      saisir inviterait à recalculer ce que le texte veut inchangé. */}
                  <p className="text-[11px] text-text-dim leading-[1.55] mb-2">
                    Le bien prend les comptes de sa nouvelle famille. Sa valeur d’origine, son amortissement cumulé
                    et sa dépréciation sont VIRÉS tels quels, sans être recalculés : la valeur comptable nette ne
                    bouge pas et aucune ligne de résultat n’est touchée. Un reclassement n’est ni une cession, ni une
                    dépréciation.
                  </p>
                  <p className="text-[11px] text-text-dim leading-[1.55] mb-2">
                    Le transfert vers les STOCKS, que le texte nomme aussi, ne passe pas par ici : un bien qui passe
                    en stock quitte le module · sortez-le, puis composez l’écriture de stock.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-text-dim">Nouvelle famille</span>
                      <select
                        value={rcFamille}
                        onChange={(e) => setRcFamille(e.target.value)}
                        required
                        className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                      >
                        <option value="">Choisir…</option>
                        {(familles ?? [])
                          .filter((f) => f.id !== immo.familleId)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.code} · {f.intitule}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-text-dim">DATE</span>
                      <input
                        type="date"
                        value={rcDate}
                        onChange={(e) => setRcDate(e.target.value)}
                        required
                        className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                      />
                    </label>
                    {cumulDeprecie(immo) > 0 && (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[11px] font-bold text-text-dim">
                          Compte 29 de destination
                        </span>
                        <select
                          value={rcCompte29}
                          onChange={(e) => setRcCompte29(e.target.value)}
                          required
                          className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                        >
                          <option value="">Choisir…</option>
                          {(comptesClasse2 ?? [])
                            .filter((c) => c.numero.startsWith('29'))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.numero} · {c.intitule}
                              </option>
                            ))}
                        </select>
                        <span className="text-[11px] text-text-dim leading-[1.5]">
                          Ce bien porte une dépréciation. Le compte n’est pas déduit du nouveau compte
                          d’immobilisation : le logiciel ne connaît pas la subdivision que votre dossier a ouverte,
                          et un 29 deviné serait un compte faux dans une balance juste.
                        </span>
                      </label>
                    )}
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-[11px] font-bold text-text-dim">Motif du changement d’utilisation</span>
                      <input
                        value={rcMotif}
                        onChange={(e) => setRcMotif(e.target.value)}
                        required
                        placeholder="Ce que le bien sert désormais, et depuis quand"
                        className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                      />
                      <span className="text-[11px] text-text-dim leading-[1.5]">
                        Obligatoire · le § 1.2 qualifie un immeuble de placement par l’USAGE, que nul solde ne
                        porte, et le § 4.2 en fait une information de Notes annexes.
                      </span>
                    </label>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="submit"
                      disabled={envoi}
                      className="bg-sel text-white text-[11.5px] font-bold px-3.5 py-1.5 rounded-[3px] disabled:opacity-50"
                    >
                      Reclasser
                    </button>
                    <button
                      type="button"
                      onClick={() => setReclassementOuvertPour(null)}
                      className="border border-border rounded-[3px] bg-surface px-3 py-1.5 text-[11.5px]"
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}

              {renouvellementOuvertPour === immo.id && (
                <form onSubmit={(e) => onRenouveler(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  {/* Les deux mouvements vont ensemble · AUDCIF ch. 4 § 4.1. Porter le
                      nouveau sans sortir l'ancien laisse deux ascenseurs au bilan pour
                      une seule cage, et l'écriture reste pourtant équilibrée. */}
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      <span className="flex items-center gap-1">
                        Désignation du remplaçant
                        <Aide
                          titre="Renouvellement"
                          texte={`La valeur nette comptable de « ${immo.designation} » sort de l’actif, et le remplaçant est porté au même bien principal avec son propre plan. La durée est saisie : elle court jusqu’au prochain remplacement, ou jusqu’à la fin d’utilisation de la structure si celui-ci est le dernier.`}
                          source="AUDCIF Titre VIII ch. 4 § 4.1"
                        />
                      </span>
                      <input required value={rDesignation} onChange={(e) => setRDesignation(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]" />
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Coût
                      <input required type="number" step="0.01" min={0.01} value={rCout} onChange={(e) => setRCout(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Durée (ans)
                      <input required type="number" min={1} value={rDuree} onChange={(e) => setRDuree(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Date
                      <input required type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                      Réglé par
                      <select required value={rContrepartie} onChange={(e) => setRContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        <option value="" />
                        {comptesFinancement.map((c) => (
                          <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Renouveler'}</button>
                    <button type="button" onClick={() => setRenouvellementOuvertPour(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                  </div>
                </form>
              )}
              {depreciationOuvertePour === immo.id && (
                <form onSubmit={(e) => onDeprecier(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      <span className="flex items-center gap-1">
                        Sens
                        <Aide
                          titre="Dépréciation"
                          texte="L’actif se déprécie lorsque sa valeur nette comptable dépasse sa valeur actuelle. Le montant et l’indice sont saisis : le logiciel ne connaît ni le marché, ni l’usage du bien. Une dotation ré-étale le plan d’amortissement sur la durée restant à courir."
                          source="AUDCIF art. 46 et Titre VIII ch. 12"
                        />
                      </span>
                      <select value={dSens} onChange={(e) => setDSens(e.target.value as 'DOTATION' | 'REPRISE')} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        <option value="DOTATION">Dotation</option>
                        <option value="REPRISE">Reprise</option>
                      </select>
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Montant
                      <input required type="number" step="0.01" min={0.01} value={dMontant} onChange={(e) => setDMontant(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Compte de dépréciation (29)
                      <select required value={dCompte29} onChange={(e) => setDCompte29(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        <option value="" />
                        {comptesFinancement.filter((c) => c.numero.startsWith('29')).map((c) => (
                          <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Contrepartie ({dSens === 'DOTATION' ? '69' : '79'})
                      <select required value={dContrepartie} onChange={(e) => setDContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        <option value="" />
                        {comptesFinancement
                          .filter((c) => c.numero.startsWith(dSens === 'DOTATION' ? '69' : '79'))
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-[11.5px] font-semibold text-text-dim mt-3">
                    Indice de perte de valeur
                    <input
                      required
                      maxLength={500}
                      value={dIndice}
                      onChange={(e) => setDIndice(e.target.value)}
                      placeholder="Baisse du prix du marché, obsolescence, dégradation physique, mise hors service prévue…"
                      className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]"
                    />
                  </label>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Enregistrer'}</button>
                    <button type="button" onClick={() => setDepreciationOuvertePour(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                  </div>
                </form>
              )}
              {sortieOuvertePour === immo.id && (
                <form onSubmit={(e) => onSortir(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Type
                      <select value={sType} onChange={(e) => setSType(e.target.value as 'CESSION' | 'MISE_HORS_SERVICE')} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        <option value="MISE_HORS_SERVICE">Mise hors service</option>
                        <option value="CESSION">Cession</option>
                      </select>
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim">
                      Date
                      <input required type="date" value={sDateSortie} onChange={(e) => setSDateSortie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                    </label>
                    {sType === 'CESSION' && (
                      <>
                        <label className="text-[11.5px] font-semibold text-text-dim">
                          Prix de cession
                          <input required type="number" step="0.01" min={0} value={sPrixCession} onChange={(e) => setSPrixCession(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px] font-mono" />
                        </label>
                        <label className="text-[11.5px] font-semibold text-text-dim">
                          Encaissé sur
                          <select required value={sCompteContrepartie} onChange={(e) => setSCompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                            <option value="" />
                            {comptesFinancement.map((c) => (
                              <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Confirmer la sortie'}</button>
                    <button type="button" onClick={() => setSortieOuvertePour(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {immobilisations.length === 0 && <div className="p-3 text-[11.5px] text-text-dim">Aucune immobilisation.</div>}
        </div>
      )}
    </div>
  );
}
