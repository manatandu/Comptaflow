import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
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
  const { estAdmin } = useAuth();
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
      <div className="text-[10px] font-mono text-text-dim leading-none">STRUCTURE</div>
      <div className="flex items-center justify-between mb-1.5 max-w-[1100px]">
        <h1 className="text-[12px] font-bold leading-tight">Immobilisations</h1>
        {estAdmin && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAfficherFormFamille((v) => !v)}
              className="border border-border rounded-[6px] bg-surface px-3 py-[3px] text-[10.5px] font-semibold hover:bg-surface-alt"
            >
              Nouvelle famille
            </button>
            <button type="button" onClick={() => setAfficherFormImmo((v) => !v)} className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90">
              Nouvelle immobilisation
            </button>
          </div>
        )}
      </div>

      {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[1100px]">{erreur}</div>}
      {info && <div className="text-[11px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[1100px]">{info}</div>}

      {estAdmin && afficherFormFamille && (
        <form onSubmit={onCreerFamille} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
          <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-3">NOUVELLE FAMILLE</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="text-[10.5px] font-semibold text-text-dim">
              Code
              <input required value={fCode} onChange={(e) => setFCode(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
              Intitulé
              <input required value={fIntitule} onChange={(e) => setFIntitule(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Compte d'immobilisation (classe 2)
              <select required value={fCompteImmo} onChange={(e) => setFCompteImmo(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {comptesClasse2.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Compte d'amortissement (classe 28)
              <select required value={fCompteAmort} onChange={(e) => setFCompteAmort(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {comptesFinancement.filter((c) => c.numero.startsWith('28')).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Compte de dotation (classe 68)
              <select required value={fCompteDotation} onChange={(e) => setFCompteDotation(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {comptesFinancement.filter((c) => c.numero.startsWith('68')).map((c) => (
                  <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Durée d'amortissement (années)
              <input required type="number" min={1} value={fDuree} onChange={(e) => setFDuree(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[11px] font-semibold px-4 py-1.5 disabled:opacity-50">{envoi ? 'Création…' : 'Ajouter'}</button>
            <button type="button" onClick={() => setAfficherFormFamille(false)} className="text-[11px] font-semibold text-text-dim px-4 py-1.5">Annuler</button>
          </div>
        </form>
      )}

      {afficherFormImmo && (
        <form onSubmit={onCreerImmo} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
          <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-3">NOUVELLE IMMOBILISATION</div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
              Désignation
              <input required value={iDesignation} onChange={(e) => setIDesignation(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              N° inventaire
              <input value={iNumeroInventaire} onChange={(e) => setINumeroInventaire(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Famille
              <select required value={iFamilleId} onChange={(e) => setIFamilleId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {(familles ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.intitule} ({f.dureeAmortissementAns} ans)</option>
                ))}
              </select>
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Date d'acquisition
              <input required type="date" value={iDateAcquisition} onChange={(e) => setIDateAcquisition(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Date de mise en service
              <input required type="date" value={iDateMiseEnService} onChange={(e) => setIDateMiseEnService(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Valeur d'origine
              <input required type="number" step="0.01" min={0} value={iValeurOrigine} onChange={(e) => setIValeurOrigine(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Valeur résiduelle
              <input type="number" step="0.01" min={0} value={iValeurResiduelle} onChange={(e) => setIValeurResiduelle(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Amortissement déjà pratiqué
              <input
                type="number"
                step="0.01"
                min={0}
                value={iAmortissementAnterieur}
                onChange={(e) => setIAmortissementAnterieur(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
              />
              <span className="block mt-1 text-[10px] font-normal text-text-dim leading-[1.45]">
                Pour un bien REPRIS, mis en service avant l'ouverture du dossier : le cumul déjà porté au compte 28
                à la date de reprise. Sans lui, le bien s'amortirait sa durée entière une seconde fois. Zéro pour un
                bien acquis dans le logiciel.
              </span>
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
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
          <div className="border-t border-border pt-3 mb-3">
            <div className="font-mono text-[10px] font-semibold text-text-dim mb-2">
              COMPOSANT D’UNE AUTRE IMMOBILISATION (facultatif)
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-[10.5px] font-semibold text-text-dim">
                Immobilisation principale
                <select value={iPrincipal} onChange={(e) => setIPrincipal(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                  <option value="">Aucune · bien autonome</option>
                  {principaux.map((i) => (
                    <option key={i.id} value={i.id}>{i.designation}</option>
                  ))}
                </select>
              </label>
              {iPrincipal && (
                <label className="text-[10.5px] font-semibold text-text-dim">
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
                <label className="block text-[10.5px] font-semibold text-text-dim mt-3">
                  Pourquoi ce bien est décomposable
                  <input
                    maxLength={500}
                    value={iJustification}
                    onChange={(e) => setIJustification(e.target.value)}
                    placeholder="Durées d’utilité distinctes, coût significatif, informations disponibles sur chaque élément…"
                    className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                  />
                </label>
                <p className="text-[10px] text-text-dim mt-1.5 leading-[1.55]">
                  Une pièce de SÉCURITÉ s’amortit dès l’acquisition du bien principal, qu’elle serve ou non ; une
                  pièce de RECHANGE seulement à partir du jour où elle y est intégrée. Un composant ne porte pas de
                  valeur résiduelle, sauf s’il s’agit du dernier renouvellement avant la fin d’utilisation du bien.
                </p>
              </>
            )}
          </div>
          <p className="text-[10.5px] text-text-dim mb-3">
            En dessous de l'équivalent de 500 USD (arrêté RDC n° 014/2025), le bien peut être passé
            directement en charge plutôt qu'immobilisé · à votre appréciation, non vérifié automatiquement ici.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={envoi || !exerciceCourant} className="bg-sel text-white text-[11px] font-semibold px-4 py-1.5 disabled:opacity-50">{envoi ? 'Création…' : 'Ajouter'}</button>
            <button type="button" onClick={() => setAfficherFormImmo(false)} className="text-[11px] font-semibold text-text-dim px-4 py-1.5">Annuler</button>
          </div>
        </form>
      )}

      {!immobilisations && <div className="text-[11px] text-text-dim">Chargement…</div>}

      {immobilisations && (
        <div
          // `overflow-x-auto` ici, `min-w` sur les lignes · les 868 px de colonnes
          // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
          // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
          // qui emportait alors titre, onglets et boutons hors de l'écran.
          className="border border-border bg-surface shadow-posee max-w-[1180px] overflow-x-auto"
        >
          <div className="grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] min-w-[1020px] gap-2.5 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            <span>DÉSIGNATION</span>
            <span>MISE EN SERVICE</span>
            <span className="text-right">V. ORIGINE</span>
            <span className="text-right">CUMUL AMORTI</span>
            <span className="text-right">V.N.C.</span>
            <span>DURÉE</span>
            <span>STATUT</span>
            <span />
          </div>
          {immobilisations.map((immo, i) => (
            <div key={immo.id}>
              <div
                className={`grid grid-cols-[1.4fr_110px_100px_100px_100px_100px_90px_170px] min-w-[1020px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border text-[10.5px] ${
                  i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                <span className="truncate">
                  {immo.designation}{immo.numeroInventaire ? ` (${immo.numeroInventaire})` : ''}
                  {/* Le rattachement est ce qui manquait · le montrer sur la ligne
                      évite qu'un composant se lise comme un bien autonome. */}
                  {immo.immobilisationPrincipaleId && (
                    <span className="block text-[10px] text-text-dim">
                      composant de {nomPrincipal(immo.immobilisationPrincipaleId) ?? '…'}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[10px] text-text-dim">{new Date(immo.dateMiseEnService).toLocaleDateString('fr-FR')}</span>
                <span className="font-mono text-right">{immo.valeurOrigine.toLocaleString('fr-FR')}</span>
                <span className="font-mono text-right">{cumulAmorti(immo).toLocaleString('fr-FR')}</span>
                <span className="font-mono text-right font-semibold">{vcn(immo).toLocaleString('fr-FR')}</span>
                <span className="font-mono text-[10px] text-text-dim">{immo.dureeAmortissementAns} ans</span>
                <span
                  className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${
                    immo.statut === 'EN_SERVICE' ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'
                  }`}
                >
                  {LIBELLE_STATUT[immo.statut]}
                </span>
                <span className="flex gap-2">
                  {immo.statut === 'EN_SERVICE' && (
                    <>
                      <button
                        onClick={() => passerDotation(immo.id)}
                        disabled={dejaDoteeCetExercice(immo)}
                        title={dejaDoteeCetExercice(immo) ? 'Déjà dotée pour cet exercice' : 'Passer la dotation de cet exercice'}
                        className="text-[10px] text-sel hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        Doter
                      </button>
                      {immo.immobilisationPrincipaleId && (
                        <button
                          onClick={() =>
                            setRenouvellementOuvertPour(renouvellementOuvertPour === immo.id ? null : immo.id)
                          }
                          title="Sortir ce composant de l’actif et porter son remplaçant"
                          className="text-[10px] text-sel hover:underline"
                        >
                          Renouveler
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setDepreciationOuvertePour(depreciationOuvertePour === immo.id ? null : immo.id)
                        }
                        title="Constater une perte de valeur, ou en reprendre une"
                        className="text-[10px] text-sel hover:underline"
                      >
                        Déprécier
                      </button>
                      <button
                        onClick={() => setSortieOuvertePour(sortieOuvertePour === immo.id ? null : immo.id)}
                        className="text-[10px] text-sel hover:underline"
                      >
                        Sortir
                      </button>
                    </>
                  )}
                </span>
              </div>
              {renouvellementOuvertPour === immo.id && (
                <form onSubmit={(e) => onRenouveler(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  {/* Les deux mouvements vont ensemble · AUDCIF ch. 4 § 4.1. Porter le
                      nouveau sans sortir l'ancien laisse deux ascenseurs au bilan pour
                      une seule cage, et l'écriture reste pourtant équilibrée. */}
                  <p className="text-[10px] text-text-dim leading-[1.55] mb-2">
                    La valeur nette comptable de « {immo.designation} » sort de l’actif, et le remplaçant est porté
                    au même bien principal avec son propre plan. La durée est saisie : elle court jusqu’au prochain
                    remplacement, ou jusqu’à la fin d’utilisation de la structure si celui-ci est le dernier.
                  </p>
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Désignation du remplaçant
                      <input required value={rDesignation} onChange={(e) => setRDesignation(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Coût
                      <input required type="number" step="0.01" min={0.01} value={rCout} onChange={(e) => setRCout(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-mono" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Durée (ans)
                      <input required type="number" min={1} value={rDuree} onChange={(e) => setRDuree(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-mono" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Date
                      <input required type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-mono" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                      Réglé par
                      <select required value={rContrepartie} onChange={(e) => setRContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                        <option value="" />
                        {comptesFinancement.map((c) => (
                          <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={envoi} className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Renouveler'}</button>
                    <button type="button" onClick={() => setRenouvellementOuvertPour(null)} className="text-[11px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                  </div>
                </form>
              )}
              {depreciationOuvertePour === immo.id && (
                <form onSubmit={(e) => onDeprecier(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  <p className="text-[10px] text-text-dim leading-[1.55] mb-2">
                    L’actif se déprécie lorsque sa valeur nette comptable dépasse sa valeur actuelle. Le montant et
                    l’indice sont saisis : le logiciel ne connaît ni le marché, ni l’usage du bien. Une dotation
                    ré-étale le plan d’amortissement sur la durée restant à courir.
                  </p>
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Sens
                      <select value={dSens} onChange={(e) => setDSens(e.target.value as 'DOTATION' | 'REPRISE')} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                        <option value="DOTATION">Dotation</option>
                        <option value="REPRISE">Reprise</option>
                      </select>
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Montant
                      <input required type="number" step="0.01" min={0.01} value={dMontant} onChange={(e) => setDMontant(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-mono" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Compte de dépréciation (29)
                      <select required value={dCompte29} onChange={(e) => setDCompte29(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                        <option value="" />
                        {comptesFinancement.filter((c) => c.numero.startsWith('29')).map((c) => (
                          <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Contrepartie ({dSens === 'DOTATION' ? '69' : '79'})
                      <select required value={dContrepartie} onChange={(e) => setDContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                        <option value="" />
                        {comptesFinancement
                          .filter((c) => c.numero.startsWith(dSens === 'DOTATION' ? '69' : '79'))
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-[10.5px] font-semibold text-text-dim mt-3">
                    Indice de perte de valeur
                    <input
                      required
                      maxLength={500}
                      value={dIndice}
                      onChange={(e) => setDIndice(e.target.value)}
                      placeholder="Baisse du prix du marché, obsolescence, dégradation physique, mise hors service prévue…"
                      className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]"
                    />
                  </label>
                  <div className="flex gap-2 mt-3">
                    <button type="submit" disabled={envoi} className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Enregistrer'}</button>
                    <button type="button" onClick={() => setDepreciationOuvertePour(null)} className="text-[11px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                  </div>
                </form>
              )}
              {sortieOuvertePour === immo.id && (
                <form onSubmit={(e) => onSortir(e, immo.id)} className="bg-chrome border-b border-border px-4 py-3">
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Type
                      <select value={sType} onChange={(e) => setSType(e.target.value as 'CESSION' | 'MISE_HORS_SERVICE')} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                        <option value="MISE_HORS_SERVICE">Mise hors service</option>
                        <option value="CESSION">Cession</option>
                      </select>
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Date
                      <input required type="date" value={sDateSortie} onChange={(e) => setSDateSortie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-mono" />
                    </label>
                    {sType === 'CESSION' && (
                      <>
                        <label className="text-[10.5px] font-semibold text-text-dim">
                          Prix de cession
                          <input required type="number" step="0.01" min={0} value={sPrixCession} onChange={(e) => setSPrixCession(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-mono" />
                        </label>
                        <label className="text-[10.5px] font-semibold text-text-dim">
                          Encaissé sur
                          <select required value={sCompteContrepartie} onChange={(e) => setSCompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
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
                    <button type="submit" disabled={envoi} className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Confirmer la sortie'}</button>
                    <button type="button" onClick={() => setSortieOuvertePour(null)} className="text-[11px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
                  </div>
                </form>
              )}
            </div>
          ))}
          {immobilisations.length === 0 && <div className="p-3 text-[11px] text-text-dim">Aucune immobilisation pour l'instant.</div>}
        </div>
      )}
    </div>
  );
}
