import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { sousFonctionServie } from '../lib/profil-dossier';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import { PlanFiscalDegressif } from '../components/PlanFiscalDegressif';
import type { Compte, FamilleImmobilisation, Immobilisation, Journal, LieuBien, TypeComposant } from '../lib/types';
import { montant } from '../lib/montants';
import { libelleExercice } from '../lib/libelle-exercice';
import {
  avertissementEcartBareme,
  avertissementPlancherLocationAcquisition,
  sectionsDuBareme,
  SOURCE_AIDE_SEUIL_IMMOBILISATION,
  texteAideSeuilImmobilisation,
  type NatureBaremeFiscal,
} from '../lib/bareme-fiscal';
import { contrepartieCessionProposee } from '../lib/contrepartie-cession';

/**
 * Immobilisations (§3.3) : familles (gabarits, comptes + durée par défaut ·
 * voir famille-immobilisation-seed.ts pour les 6 familles seedées, ancrées
 * à l'arrêté RDC n° 013/2025), instances, dotation périodique (linéaire,
 * prorata temporis) et sortie (cession/mise hors service). Pas de gestion
 * de composants ni d'amortissement dégressif dans ce MVP (skill sycebnl :
 * la décomposition n'est de toute façon autorisée que pour des catégories
 * de biens limitées).
 */
/**
 * LA CONTREPARTIE D'UNE DÉPRÉCIATION · la liste que le serveur admet
 * (`immobilisations/comptes-du-bien.ts`). SYSCOHADA, fiche du compte 29 :
 * dotation au 691, 697 ou 853, reprise au 791, 797 ou 863 · la voie H.A.O.,
 * que le serveur sait reprendre, était inatteignable depuis l'écran (passe
 * R1, A5). Le SYCEBNL garde les 69 et 79, sa fiche n'étant pas transposée.
 */
function racinesContrepartieDepreciation(syscohada: boolean, sens: string): string[] {
  if (syscohada) return sens === 'DOTATION' ? ['691', '697', '853'] : ['791', '797', '863'];
  return sens === 'DOTATION' ? ['69'] : ['79'];
}

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
  // Lieux des biens · référentiel du dossier (Sage Immobilisations).
  const [lieux, setLieux] = useState<LieuBien[]>([]);
  const [afficherLieux, setAfficherLieux] = useState(false);
  const [iLieuId, setILieuId] = useState('');
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
  // Vide, le bien est acquis et pas encore en état de fonctionner (AUDCIF
  // art. 45) · aucune dotation tant que la mise en service n'est pas posée.
  const [iDateMiseEnService, setIDateMiseEnService] = useState(() => new Date().toISOString().slice(0, 10));
  // Nature du barème fiscal (arrêté n° 013/2025, art. 2) · elle PROPOSE la
  // durée, ne l'impose jamais, et l'écart se signale sans refuser.
  const [iNatureFiscale, setINatureFiscale] = useState('');
  const [bareme, setBareme] = useState<NatureBaremeFiscal[]>([]);
  // Le cadre « composant » se replie derrière sa case · un bien sur dix en
  // est un, et les champs ouverts d'office se lisaient comme obligatoires.
  const [estComposant, setEstComposant] = useState(false);
  const [iValeurOrigine, setIValeurOrigine] = useState('');
  const [iValeurResiduelle, setIValeurResiduelle] = useState('0');
  // Bien REPRIS · ce qui a été amorti avant l'entrée dans le logiciel. Zéro
  // pour un bien acquis ici, ce qui est le cas courant · d'où le champ en
  // dernier et non en évidence.
  const [iAmortissementAnterieur, setIAmortissementAnterieur] = useState('0');
  // Bien déjà au bilan d'ouverture (audit final F32) · sa fiche naît sans
  // écriture d'acquisition, le report à-nouveau portant déjà son 2x et son 28.
  const [iRepris, setIRepris] = useState(false);
  // Durée propre du bien (audit final F33) · vide, celle de la famille. Une
  // révision majeure s'amortit sur l'intervalle entre deux révisions, et
  // l'écran n'avait aucun moyen de le dire.
  const [iDuree, setIDuree] = useState('');
  // MODE ET UNITÉS D'ŒUVRE (audit final F128) · vide, le bien prend le mode
  // de sa famille. Le SMT SYSCOHADA ne connaît que le linéaire (Titre X) · le
  // choix n'y est pas proposé, et le serveur le refuse aussi.
  const [iMode, setIMode] = useState<'' | 'LINEAIRE' | 'UNITES_DOEUVRE'>('');
  const [iUnites, setIUnites] = useState('');
  const [iUniteLibelle, setIUniteLibelle] = useState('');
  const [iCompteContrepartie, setICompteContrepartie] = useState('');
  const [iJournalId, setIJournalId] = useState('');

  // --- formulaire sortie (par immobilisation) ---
  const [sDateSortie, setSDateSortie] = useState(() => new Date().toISOString().slice(0, 10));
  const [sType, setSType] = useState<'CESSION' | 'MISE_HORS_SERVICE'>('MISE_HORS_SERVICE');
  const [sPrixCession, setSPrixCession] = useState('');
  const [sCompteContrepartie, setSCompteContrepartie] = useState('');
  // AUDCIF, Titre VII, compte 81, Exclusions · une cession « fréquente et
  // récurrente » est courante (654 / 754), une qualification de fait que le
  // logiciel demande. SYSCOHADA seul, comme au serveur.
  const [sCessionCourante, setSCessionCourante] = useState(false);
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
    const [f, i, c2, ctrésorerie, jrn, lx, bf] = await Promise.all([
      api.get<FamilleImmobilisation[]>('/immobilisations/familles'),
      api.get<Immobilisation[]>('/immobilisations'),
      api.get<Compte[]>('/comptes?classe=CLASSE_2&typeCompte=DETAIL'),
      api.get<Compte[]>('/comptes?typeCompte=DETAIL'),
      api.get<Journal[]>('/journaux'),
      api.get<LieuBien[]>('/immobilisations/lieux'),
      // Le barème ne conditionne rien · illisible, le choix de nature
      // disparaît et la saisie reste entière.
      api.get<NatureBaremeFiscal[]>('/immobilisations/bareme-fiscal').catch(() => [] as NatureBaremeFiscal[]),
    ]);
    setBareme(bf);
    setLieux(lx);
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

  /**
   * Modifier une famille (audit de l'interface du 2026-09-27, I11) · la route
   * existait sans geste, réservée à l'administrateur comme la création. Elle
   * ne porte que l'intitulé, la durée par défaut et la mise en sommeil : les
   * comptes d'une famille ne se changent pas, un bien déjà porté changeant de
   * famille par le reclassement.
   */
  const modifierFamille = async (f: FamilleImmobilisation, corps: { intitule?: string; dureeAmortissementAns?: number; estActif?: boolean }) => {
    setErreur(null);
    try {
      await api.patch(`/immobilisations/familles/${f.id}`, corps);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de modifier cette famille');
    }
  };

  const renommerFamille = (f: FamilleImmobilisation) => {
    const intitule = window.prompt('Intitulé de la famille', f.intitule);
    if (intitule === null) return;
    const duree = window.prompt("Durée d'amortissement par défaut (années)", String(f.dureeAmortissementAns));
    if (duree === null) return;
    const ans = Number(duree);
    if (!Number.isFinite(ans) || ans <= 0) {
      setErreur("Durée d'amortissement illisible ou nulle.");
      return;
    }
    void modifierFamille(f, { intitule: intitule.trim() || f.intitule, dureeAmortissementAns: ans });
  };

  const familleChoisie = (familles ?? []).find((x) => x.id === iFamilleId);

  // LA CONTREPARTIE SE LIT DANS LA FICHE DES COMPTES 21 À 24 · liste fermée,
  // servie par le serveur pour la famille choisie
  // (`immobilisations/contrepartie-acquisition.ts`), la même règle que son refus.
  // Le type d'un composant ouvre sa propre contrepartie (1984 pour un
  // démantèlement, AUDCIF Titre VII, classe 2) · la même règle que le serveur.
  const typeComposantServi = estComposant && iPrincipal ? iTypeComposant : '';
  const [contrepartiesAdmises, setContrepartiesAdmises] = useState<Compte[] | null>(null);
  useEffect(() => {
    setContrepartiesAdmises(null);
    if (!iFamilleId) return;
    let vivant = true;
    const type = typeComposantServi ? `&typeComposant=${typeComposantServi}` : '';
    api
      .get<Compte[]>(`/immobilisations/contreparties-acquisition?familleId=${iFamilleId}${type}`)
      .then((c) => vivant && setContrepartiesAdmises(c))
      .catch(() => vivant && setContrepartiesAdmises([]));
    return () => {
      vivant = false;
    };
  }, [iFamilleId, typeComposantServi]);
  const modeRetenu = iMode || familleChoisie?.modeAmortissement || 'LINEAIRE';
  const unitesServies = !(utilisateur?.tenant?.referentiel === 'SYSCOHADA' && utilisateur?.tenant?.systemeComptableSyscohada === 'MINIMAL_TRESORERIE');

  const onCreerImmo = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/immobilisations', {
        familleId: iFamilleId,
        designation: iDesignation,
        numeroInventaire: iNumeroInventaire || undefined,
        lieuId: iLieuId || undefined,
        dateAcquisition: iDateAcquisition,
        // Vide · bien non encore mis en service, la date se pose plus tard.
        dateMiseEnService: iDateMiseEnService || undefined,
        natureFiscaleCle: iNatureFiscale || undefined,
        valeurOrigine: Number(iValeurOrigine),
        valeurResiduelle: Number(iValeurResiduelle || 0),
        dureeAmortissementAns: iDuree ? Number(iDuree) : undefined,
        ...(iMode ? { modeAmortissement: iMode } : {}),
        ...(modeRetenu === 'UNITES_DOEUVRE' ? { unitesOeuvrePrevues: Number(iUnites), uniteOeuvreLibelle: iUniteLibelle } : {}),
        amortissementAnterieur: iRepris ? Number(iAmortissementAnterieur || 0) : 0,
        repris: iRepris || undefined,
        compteContrepartieId: iRepris ? undefined : iCompteContrepartie,
        exerciceId: exerciceCourant?.id,
        journalId: iRepris ? undefined : iJournalId,
        immobilisationPrincipaleId: estComposant && iPrincipal ? iPrincipal : undefined,
        typeComposant: estComposant && iPrincipal ? iTypeComposant : undefined,
        justificationDecomposition: estComposant && iPrincipal ? iJustification : undefined,
      });
      setIDesignation('');
      setIPrincipal('');
      setIJustification('');
      setINumeroInventaire('');
      setILieuId('');
      setIValeurOrigine('');
      setIValeurResiduelle('0');
      setIRepris(false);
      setIAmortissementAnterieur('0');
      setIDuree('');
      setIMode('');
      setINatureFiscale('');
      setEstComposant(false);
      setIUnites('');
      setIUniteLibelle('');
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
      setInfo(`Dotation de ${montant(resultat.montant)} passée pour l'exercice ${libelleExercice(exerciceCourant)}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de passer la dotation');
    }
  };

  /**
   * Mise en service d'un bien acquis et pas encore en état de fonctionner
   * (AUDCIF art. 45) · la date se pose une fois, jamais avant l'acquisition,
   * et c'est le serveur qui le refuse. Aucune écriture n'est passée.
   */
  const mettreEnService = async (immo: Immobilisation) => {
    const saisie = window.prompt(
      `${immo.designation} · date de mise en service (AAAA-MM-JJ). Elle se pose une fois et ne précède pas l'acquisition.`,
      new Date().toISOString().slice(0, 10),
    );
    if (saisie === null) return;
    const date = saisie.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setErreur('Date de mise en service illisible · attendue au format AAAA-MM-JJ.');
      return;
    }
    setErreur(null);
    setInfo(null);
    try {
      await api.patch(`/immobilisations/${immo.id}/mise-en-service`, { date });
      setInfo(`${immo.designation} mis en service au ${date.split('-').reverse().join('/')}.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de poser la mise en service');
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
        ...(sType === 'CESSION' && syscohada ? { cessionCourante: sCessionCourante } : {}),
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

  const creerLieu = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const donnees = new FormData(form);
    setErreur(null);
    try {
      await api.post('/immobilisations/lieux', { code: String(donnees.get('code') ?? ''), intitule: String(donnees.get('intitule') ?? '') });
      form.reset();
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’ajouter ce lieu');
    }
  };

  const supprimerLieu = async (l: LieuBien) => {
    if (!window.confirm(`Supprimer le lieu ${l.code} ?`)) return;
    setErreur(null);
    try {
      await api.delete(`/immobilisations/lieux/${l.id}`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de supprimer ce lieu');
    }
  };

  const deplacer = async (immo: Immobilisation, lieuId: string) => {
    setErreur(null);
    try {
      await api.patch(`/immobilisations/${immo.id}/lieu`, { lieuId: lieuId || null });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de déplacer ce bien');
    }
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
                onClick={() => setAfficherLieux((v) => !v)}
                className="border border-border rounded-[3px] bg-surface px-3 py-[3px] text-[11.5px] font-semibold hover:bg-surface-alt"
              >
                Lieux
              </button>
            )}
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
                {montant(reconstitution.valeurNetteEstimee)}
              </span>{' '}
              · amortissement fictif déjà couru{' '}
              <span className="font-mono">{montant(reconstitution.amortissementEstime)}</span>
            </div>
          ) : (
            <div className="mt-1 text-warning">{reconstitution.motif}</div>
          )}
          <div className="mt-1.5 text-[11px] text-text-dim">{reconstitution.suite}</div>
        </div>
      )}
      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[1100px]">{info}</div>}

      {estAdmin && afficherLieux && (
        <div className="border border-border bg-surface p-3 mb-4 max-w-[640px] text-[11.5px]">
          <div className="flex items-center gap-1.5 font-semibold mb-2">
            Lieux des biens
            <Aide
              titre="Lieux des biens"
              texte="Où se trouve physiquement chaque bien · pour le retrouver le jour de l’inventaire. Sans effet comptable. Un lieu qui porte des biens ne se supprime pas : déplacez-les d’abord. Définition d’OmegaX."
              source="Sage Immobilisations, « Lieux des biens » (nommés, non décrits)"
            />
          </div>
          <table className="w-full mb-2">
            <tbody>
              {lieux.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="py-1 font-semibold w-24">{l.code}</td>
                  <td className="py-1">{l.intitule}</td>
                  <td className="py-1 text-right text-text-dim">{l._count.immobilisations} bien(s)</td>
                  <td className="py-1 text-right w-20">
                    <button type="button" onClick={() => void supprimerLieu(l)} className="text-danger hover:underline">
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={(e) => void creerLieu(e)} className="flex items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Code</span>
              <input name="code" required maxLength={20} className="border border-border-dark px-2 py-[3px] w-28" />
            </label>
            <label className="flex flex-col gap-0.5 flex-1">
              <span className="text-text-dim">Intitulé</span>
              <input name="intitule" required maxLength={120} className="border border-border-dark px-2 py-[3px]" />
            </label>
            <button type="submit" className="bg-sel text-white px-3 py-[4px] font-semibold">Ajouter</button>
          </form>
        </div>
      )}

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
          {(familles ?? []).length > 0 && (
            <table className="w-full text-[11.5px] mt-4">
              <thead>
                <tr>
                  <th className="text-left">Code</th>
                  <th className="text-left">Intitulé</th>
                  <th className="text-left">Compte</th>
                  <th className="text-right">Durée</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(familles ?? []).map((f) => (
                  <tr key={f.id} className={f.estActif ? '' : 'text-text-dim'}>
                    <td>{f.code}</td>
                    <td>
                      {f.intitule}
                      {!f.estActif && ' · en sommeil'}
                    </td>
                    <td>{f.compteImmobilisation?.numero ?? ''}</td>
                    <td className="text-right">{f.dureeAmortissementAns} ans</td>
                    <td className="text-right whitespace-nowrap">
                      <button type="button" onClick={() => renommerFamille(f)} className="text-sel hover:underline mr-2">
                        Modifier
                      </button>
                      <button type="button" onClick={() => void modifierFamille(f, { estActif: !f.estActif })} className="hover:underline">
                        {f.estActif ? 'Mettre en sommeil' : 'Réactiver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </form>
      )}

      {peutEcrire && afficherFormImmo && (
        <form onSubmit={onCreerImmo} className="bg-surface border border-border p-4 mb-4 max-w-[900px]">
          <div className="font-mono text-[11.5px] font-semibold text-text-dim mb-3 flex items-center gap-1.5">
            Nouvelle immobilisation
            <Aide
              titre="Seuil d'immobilisation"
              texte={texteAideSeuilImmobilisation(exerciceCourant?.dateFin)}
              source={SOURCE_AIDE_SEUIL_IMMOBILISATION}
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
              <span className="flex items-center gap-1">
                Lieu
                <Aide
                  titre="Lieu du bien"
                  texte="Emplacement physique du bien, pris dans le référentiel des lieux du dossier. Il sert à retrouver le bien lors de l'inventaire physique. Sans aucun effet comptable : déplacer un bien ne passe aucune écriture."
                  source="Référentiel des lieux du dossier"
                />
              </span>
              <select value={iLieuId} onChange={(e) => setILieuId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="">Non placé</option>
                {lieux.map((l) => (
                  <option key={l.id} value={l.id}>{l.code} · {l.intitule}</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              <span className="flex items-center gap-1">
                Famille
                <Aide
                  titre="Famille d'immobilisations"
                  texte="Gabarit qui donne au bien ses comptes (immobilisation 2x, amortissements 28, dotations 681) ainsi que la durée et le mode d'amortissement proposés. La durée et le mode se changent sur le bien ; les comptes ne changent que par un reclassement."
                  source="Structure > Familles d'immobilisations"
                />
              </span>
              <select required value={iFamilleId} onChange={(e) => setIFamilleId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                <option value="" />
                {/* Une famille en sommeil ne reçoit plus de bien (audit final F129). */}
                {(familles ?? []).filter((f) => f.estActif).map((f) => (
                  <option key={f.id} value={f.id}>{f.intitule} ({f.dureeAmortissementAns} ans)</option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Date d'acquisition
              <input required type="date" value={iDateAcquisition} onChange={(e) => setIDateAcquisition(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              <span className="flex items-center gap-1">
                Date de mise en service
                <Aide
                  titre="Mise en service"
                  texte="Vide, le bien est acquis mais pas encore en état de fonctionner : aucune dotation n'est passée. La date se pose ensuite depuis la liste (« Mettre en service »), une fois, et jamais avant l'acquisition."
                  source="AUDCIF art. 45"
                />
              </span>
              <input type="date" value={iDateMiseEnService} onChange={(e) => setIDateMiseEnService(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Valeur d'origine
              <input required type="number" step="0.01" min={0} value={iValeurOrigine} onChange={(e) => setIValeurOrigine(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Valeur résiduelle
              <input type="number" step="0.01" min={0} value={iValeurResiduelle} onChange={(e) => setIValeurResiduelle(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
            </label>
            {bareme.length > 0 && (
              <label className="text-[11.5px] font-semibold text-text-dim">
                <span className="flex items-center gap-1">
                  Nature du bien (barème fiscal)
                  <Aide
                    titre="Barème fiscal"
                    texte="Choisir la nature propose sa durée d'amortissement. La durée saisie reste libre : un écart au barème est signalé, jamais refusé. Un taux supérieur au barème n'est admis que si l'entreprise en justifie les circonstances lors du contrôle, sous peine de rejet. Un bien en location-acquisition a une durée plancher : 7 ans pour les constructions, 4 ans pour les équipements, 3 ans pour le matériel de transport. Barème en vigueur depuis le 1er janvier 2026."
                    source="Arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2, 4, 5 et 6 · loi n° 23/053, art. 28"
                  />
                </span>
                <select
                  value={iNatureFiscale}
                  onChange={(e) => {
                    setINatureFiscale(e.target.value);
                    const n = bareme.find((x) => x.cle === e.target.value);
                    if (n) setIDuree(String(n.dureeAns));
                  }}
                  className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
                >
                  <option value="">Non précisée</option>
                  {sectionsDuBareme(bareme).map((g) => (
                    <optgroup key={g.section} label={`${g.section} · ${g.intitule}`}>
                      {g.lignes.map((n) => (
                        <option key={n.cle} value={n.cle}>{n.designation} · {n.dureeAns} ans</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <label className="text-[11.5px] font-semibold text-text-dim">
              <span className="flex items-center gap-1">
                Durée d'amortissement (années)
                <Aide
                  titre="Durée propre"
                  texte="Vide, le bien prend la durée de sa famille. Une révision majeure s'amortit sur l'intervalle qui sépare deux révisions, plus court que la durée du bien principal."
                  source="AUDCIF Titre VIII ch. 5 § 1"
                />
              </span>
              <input
                type="number"
                min={1}
                value={iDuree}
                onChange={(e) => setIDuree(e.target.value)}
                placeholder={(() => {
                  const f = (familles ?? []).find((x) => x.id === iFamilleId);
                  return f ? `${f.dureeAmortissementAns} (famille)` : '';
                })()}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
              />
              {/* Écart au barème fiscal · signalé, jamais refusé (arrêté
                  n° 013/2025, art. 4). Vide, la durée est celle de la famille.
                  Le plancher de la location-acquisition (art. 5) se lit sur le
                  compte de la famille, indépendamment de la nature choisie. */}
              {(() => {
                const duree = iDuree ? Number(iDuree) : familleChoisie?.dureeAmortissementAns ?? null;
                const alertes = [
                  avertissementEcartBareme(
                    duree,
                    bareme.find((n) => n.cle === iNatureFiscale),
                    exerciceCourant?.dateFin,
                  ),
                  avertissementPlancherLocationAcquisition(
                    duree,
                    utilisateur?.tenant?.referentiel,
                    familleChoisie?.compteImmobilisation?.numero
                      ?? comptesClasse2.find((c) => c.id === familleChoisie?.compteImmobilisationId)?.numero,
                    exerciceCourant?.dateFin,
                  ),
                ].filter((a): a is string => !!a);
                return alertes.map((a) => (
                  <span key={a} className="block mt-1 text-[11px] font-normal text-warning">{a}</span>
                ));
              })()}
            </label>
            {unitesServies && (
              <label className="text-[11.5px] font-semibold text-text-dim">
                <span className="flex items-center gap-1">
                  Mode d'amortissement
                  <Aide
                    titre="Mode d'amortissement"
                    texte="Vide, le bien prend le mode de sa famille. Aux unités d'œuvre, la dotation suit l'usage : base amortissable × unités consommées / total d'unités prévues, sans prorata temporis."
                    source="AUDCIF art. 45 et Titre VI"
                  />
                </span>
                <select value={iMode} onChange={(e) => setIMode(e.target.value as typeof iMode)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                  <option value="">{familleChoisie ? `Celui de la famille (${familleChoisie.modeAmortissement === 'UNITES_DOEUVRE' ? "unités d'œuvre" : 'linéaire'})` : 'Celui de la famille'}</option>
                  <option value="LINEAIRE">Linéaire</option>
                  <option value="UNITES_DOEUVRE">Unités d'œuvre</option>
                </select>
              </label>
            )}
            {unitesServies && modeRetenu === 'UNITES_DOEUVRE' && (
              <>
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Total d'unités prévues
                  <input required type="number" min={1} value={iUnites} onChange={(e) => setIUnites(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono" />
                </label>
                <label className="text-[11.5px] font-semibold text-text-dim">
                  Unité (km, heures, pièces…)
                  <input required value={iUniteLibelle} onChange={(e) => setIUniteLibelle(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal" />
                </label>
              </>
            )}
            <label className="text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5 self-end pb-1.5">
              <input type="checkbox" checked={iRepris} onChange={(e) => setIRepris(e.target.checked)} />
              Bien repris (déjà au bilan d'ouverture)
              <Aide
                titre="Bien repris"
                texte="Un bien acquis avant l'ouverture de l'exercice est déjà porté au bilan d'ouverture, compte 2x et compte 28 compris. Sa fiche est créée sans écriture d'acquisition, qui doublerait sa valeur brute. Un bien acquis dans l'exercice n'est pas repris : son écriture d'acquisition est passée à la création."
                source="Immobilisations"
              />
            </label>
            {iRepris ? (
              <label className="text-[11.5px] font-semibold text-text-dim">
                <span className="flex items-center gap-1">
                  Amortissement déjà pratiqué
                  <Aide
                    titre="Amortissement déjà pratiqué"
                    texte="Le cumul déjà porté au compte 28 pour ce bien à l'ouverture de l'exercice. Sans lui, le bien s'amortirait sa durée entière une seconde fois."
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
            ) : (
              <label className="text-[11.5px] font-semibold text-text-dim">
                Financement (contrepartie)
                <select required disabled={!iFamilleId} value={iCompteContrepartie} onChange={(e) => setICompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal">
                  <option value="">{iFamilleId ? '' : 'Choisissez d’abord la famille'}</option>
                  {(contrepartiesAdmises ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {/* APPROCHE PAR COMPOSANTS · facultative. Laisser le principal vide crée
              une immobilisation ordinaire, c'est-à-dire une STRUCTURE au sens du
              ch. 4 § 1. Le renseigner rattache le bien et lui garde son PROPRE
              plan d'amortissement, ce qui est tout l'objet du chapitre. */}
{composantsServis && (
          <div className="border-t border-border pt-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim mb-2 flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={estComposant}
                onChange={(e) => {
                  setEstComposant(e.target.checked);
                  if (!e.target.checked) setIPrincipal('');
                }}
              />
              Ce bien est un composant d’un autre bien
              <Aide
                titre="Approche par composants"
                texte="Un composant est une immobilisation à part entière, rattachée à son bien principal, avec son propre plan d’amortissement. Une pièce de SÉCURITÉ s’amortit dès l’acquisition du bien principal, qu’elle serve ou non ; une pièce de RECHANGE seulement à partir du jour où elle y est intégrée. Un composant ne porte pas de valeur résiduelle, sauf s’il s’agit du dernier renouvellement avant la fin d’utilisation du bien."
                source="AUDCIF Titre VIII ch. 4 § 1, § 3.3 et § 4.3"
              />
            </label>
            {estComposant && (
            <>
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
                  {/* Le lieu se change ici · un déplacement n'a aucun effet comptable. */}
                  {peutEcrire && lieux.length > 0 && immo.statut === 'EN_SERVICE' ? (
                    <select
                      aria-label={`Lieu de ${immo.designation}`}
                      value={immo.lieuId ?? ''}
                      onChange={(e) => void deplacer(immo, e.target.value)}
                      className="block mt-0.5 text-[11px] text-text-dim bg-transparent border-0 p-0"
                    >
                      <option value="">Non placé</option>
                      {lieux.map((l) => (
                        <option key={l.id} value={l.id}>{l.code} · {l.intitule}</option>
                      ))}
                    </select>
                  ) : (
                    immo.lieu && <span className="block text-[11px] text-text-dim">{immo.lieu.code} · {immo.lieu.intitule}</span>
                  )}
                </span>
                {/* Sans date, le bien est acquis et pas encore en service
                    (AUDCIF art. 45) · jamais new Date(null), qui rendrait 1970. */}
                <span className="font-mono text-[11px] text-text-dim">
                  {immo.dateMiseEnService ? new Date(immo.dateMiseEnService).toLocaleDateString('fr-FR') : 'Non mis en service'}
                </span>
                <span className="font-mono text-right">{montant(immo.valeurOrigine)}</span>
                <span className="font-mono text-right">{montant(cumulAmorti(immo))}</span>
                <span className="font-mono text-right font-semibold">{montant(vcn(immo))}</span>
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
                      {!immo.dateMiseEnService && (
                        <button
                          onClick={() => void mettreEnService(immo)}
                          title="Poser la date de mise en service · une fois, jamais avant l'acquisition (AUDCIF art. 45)"
                          className="text-[11px] text-sel hover:underline"
                        >
                          Mettre en service
                        </button>
                      )}
                      <button
                        onClick={() => passerDotation(immo.id)}
                        disabled={!immo.dateMiseEnService || dejaDoteeCetExercice(immo)}
                        title={
                          !immo.dateMiseEnService
                            ? 'Aucune dotation avant la mise en service (AUDCIF art. 45)'
                            : dejaDoteeCetExercice(immo)
                              ? 'Déjà dotée pour cet exercice'
                              : 'Passer la dotation de cet exercice'
                        }
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
                    {/* Le libellé reste un intitulé métier · la raison de
                        l'obligation, avec ses paragraphes, est une aide posée
                        sous le champ, hors du libellé (titres formels). */}
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-text-dim">Motif du changement d’utilisation</span>
                        <input
                          value={rcMotif}
                          onChange={(e) => setRcMotif(e.target.value)}
                          required
                          placeholder="Ce que le bien sert désormais, et depuis quand"
                          className="border border-border rounded-[3px] bg-surface px-2 py-1 text-[11.5px]"
                        />
                      </label>
                      <span className="text-[11px] text-text-dim leading-[1.5]">
                        Obligatoire · le § 1.2 qualifie un immeuble de placement par l’USAGE, que nul solde ne
                        porte, et le § 4.2 en fait une information de Notes annexes.
                      </span>
                    </div>
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
                      Contrepartie ({racinesContrepartieDepreciation(syscohada, dSens).join(', ')})
                      <select required value={dContrepartie} onChange={(e) => setDContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        <option value="" />
                        {comptesFinancement
                          .filter((c) => racinesContrepartieDepreciation(syscohada, dSens).some((r) => c.numero.startsWith(r)))
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
                            {comptesFinancement
                              .filter((c) =>
                                contrepartieCessionProposee(utilisateur?.tenant.referentiel, sCessionCourante, c.numero),
                              )
                              .map((c) => (
                                <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                              ))}
                          </select>
                        </label>
                        {syscohada && (
                          <label
                            className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-dim"
                            title="AUDCIF, Titre VII, compte 81, Exclusions · cession fréquente et récurrente, imputée en exploitation (654 / 754) ; sa créance va au 414, jamais au 485 (fiche du compte 48). Hors activités ordinaires, la créance va au 485, jamais sur un client (fiche du compte 41)."
                          >
                            <input
                              type="checkbox"
                              checked={sCessionCourante}
                              onChange={(e) => {
                                setSCessionCourante(e.target.checked);
                                setSCompteContrepartie('');
                              }}
                            />
                            Cession courante
                          </label>
                        )}
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
