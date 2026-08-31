import { Fragment, FormEvent, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useActionsFenetre } from '../lib/actions-fenetre';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { IconCheck } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type {
  Compte,
  ConditionEcheance,
  EcheanceCalculee,
  LigneBalance,
  ModeleReglement,
  Tiers,
  TypeEcheance,
  TypeTiers,
} from '../lib/types';

/**
 * PLAN DES TIERS · la fenêtre Structure → Plan tiers de Sage 100 i7 :
 * « Dans la partie gauche de la fenêtre, un filtre permet de sélectionner le
 * type de tiers » ; au centre
 * la liste dense ; à droite la FICHE du tiers sélectionné, en volets
 * Identification (code, type, nom, modèle de règlement, état) et Comptes
 * rattachés (avec compte Principal, comme chez Sage : « un des comptes
 * généraux sélectionnés doit être défini comme Principal »).
 * Les modèles de règlement Structure → Modèles chez Sage s'ouvrent dans
 * leur propre boîte de dialogue, avec le simulateur d'échéancier.
 *
 * DIFFÉRENCE ASSUMÉE AVEC SAGE. Le plan français de Sage ne connaît que le
 * « Client ». Le SYCEBNL, lui, loge au compte 41 « Adhérents, clients-usagers
 * et comptes rattachés » DEUX populations qu'il subdivise explicitement :
 * 411 Adhérents (les membres qui doivent leur cotisation conformément aux
 * statuts) et 412 Clients-usagers (les tiers auxquels l'entité vend biens et
 * services). Les fondre en un seul type ferait perdre le suivi des appels de
 * cotisations, qui est l'activité même d'une EBNL · d'où un type ADHERENT à
 * part entière, et le rappel du compte de rattachement sur chaque type.
 */

const LIBELLE_TYPE: Record<TypeTiers, string> = {
  ADHERENT: 'Adhérent',
  CLIENT: 'Client-usager',
  FOURNISSEUR: 'Fournisseur',
  SALARIE: 'Salarié',
  AUTRE: 'Autre',
};
const PLURIEL_TYPE: Record<TypeTiers, string> = {
  ADHERENT: 'Adhérents',
  CLIENT: 'Clients-usagers',
  FOURNISSEUR: 'Fournisseurs',
  SALARIE: 'Salariés',
  AUTRE: 'Autres',
};
/** Compte de rattachement SYCEBNL, rappelé à côté de chaque type. */
const COMPTE_TYPE: Record<TypeTiers, string> = {
  ADHERENT: '411',
  CLIENT: '412',
  FOURNISSEUR: '40',
  SALARIE: '42',
  AUTRE: '47',
};
/** Bulle d'aide « ? » du lexique SYCEBNL, par type de tiers. */
const AIDE_TYPE: Partial<Record<TypeTiers, 'adherent' | 'clientUsager'>> = {
  ADHERENT: 'adherent',
  CLIENT: 'clientUsager',
};

const LIBELLE_ECHEANCE: Record<ConditionEcheance, string> = {
  NET: 'Net (date facture + délai)',
  FIN_DE_MOIS: 'Fin de mois + délai',
};

const LIBELLE_TYPE_ECHEANCE: Record<TypeEcheance, string> = {
  POURCENTAGE: 'Pourcentage',
  MONTANT: 'Montant fixe',
  EQUILIBRE: 'Équilibre (le reste)',
};

/**
 * Les huit coordonnées de la fiche · l'ordre est celui dans lequel on les
 * lit sur une enveloppe, puis les moyens de contact, puis l'identifiant
 * fiscal qu'exige la liste annuelle des fournisseurs.
 */
const CHAMPS_COORDONNEES: Array<{
  cle: 'contact' | 'adresse' | 'boitePostale' | 'ville' | 'pays' | 'telephone' | 'email' | 'numeroImpot';
  libelle: string;
  exemple: string;
}> = [
  { cle: 'contact', libelle: 'Contact', exemple: 'personne à qui écrire' },
  { cle: 'adresse', libelle: 'Adresse', exemple: 'avenue, numéro, quartier' },
  { cle: 'boitePostale', libelle: 'Boîte postale', exemple: 'B.P. 1234' },
  { cle: 'ville', libelle: 'Ville', exemple: 'Kinshasa' },
  { cle: 'pays', libelle: 'Pays', exemple: 'RD Congo' },
  { cle: 'telephone', libelle: 'Téléphone', exemple: '+243 …' },
  { cle: 'email', libelle: 'Courriel', exemple: 'nom@exemple.cd' },
  { cle: 'numeroImpot', libelle: 'Numéro Impôt', exemple: 'exigé par la liste des fournisseurs' },
];

export function TiersPage() {
  const { estAdmin } = useAuth();
  const { exerciceCourant } = useExercice();
  const navigate = useNavigate();
  const [liste, setListe] = useState<Tiers[] | null>(null);
  const [modeles, setModeles] = useState<ModeleReglement[]>([]);
  const [comptesClasse4, setComptesClasse4] = useState<Compte[]>([]);
  const [soldes, setSoldes] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [recherche, setRecherche] = useState('');
  const [filtreType, setFiltreType] = useState<TypeTiers | ''>('');
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const champRecherche = useRef<HTMLInputElement>(null);
  const [modelesOuverts, setModelesOuverts] = useState(false);

  // Formulaire de création d'un tiers
  const [type, setType] = useState<TypeTiers>('CLIENT');
  const [code, setCode] = useState('');
  const [nom, setNom] = useState('');
  const [modeleReglementId, setModeleReglementId] = useState('');
  const [envoi, setEnvoi] = useState(false);

  // Formulaire de rattachement de compte
  const [compteARattacher, setCompteARattacher] = useState('');
  const [estPrincipal, setEstPrincipal] = useState(false);

  // Formulaire modèle de règlement
  const [intituleModele, setIntituleModele] = useState('');
  const [delaiJours, setDelaiJours] = useState(30);
  const [echeance, setEcheance] = useState<ConditionEcheance>('NET');
  const [modeleSelectionneId, setModeleSelectionneId] = useState<string | null>(null);

  // Formulaire d'ajout d'une échéance (fractionnement)
  const [ordreEch, setOrdreEch] = useState(1);
  const [typeEch, setTypeEch] = useState<TypeEcheance>('POURCENTAGE');
  const [valeurEch, setValeurEch] = useState('');
  const [delaiJoursEch, setDelaiJoursEch] = useState(30);
  const [echeanceEch, setEcheanceEch] = useState<ConditionEcheance>('NET');

  // Simulateur d'échéancier
  const [dateFactureCalc, setDateFactureCalc] = useState(new Date().toISOString().slice(0, 10));
  const [montantCalc, setMontantCalc] = useState('1000');
  const [resultatCalc, setResultatCalc] = useState<EcheanceCalculee[] | null>(null);

  // La liste est chargée SANS filtre de type : le filtre de gauche (façon
  // Sage) se fait localement, ce qui permet d'afficher les compteurs par
  // type sans requêtes supplémentaires.
  const charger = async () => {
    try {
      const params = new URLSearchParams();
      if (recherche) params.set('recherche', recherche);
      setListe(await api.get<Tiers[]>(`/tiers?${params.toString()}`));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les tiers');
    }
  };

  useEffect(() => {
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  useEffect(() => {
    api.get<ModeleReglement[]>('/modeles-reglement').then(setModeles);
    api.get<Compte[]>('/comptes?classe=CLASSE_4&actifsSeuls=true&typeCompte=DETAIL').then(setComptesClasse4);
  }, []);

  // Solde des comptes rattachés (balance de l'exercice courant) · affiché
  // dans le volet Comptes rattachés de la fiche.
  useEffect(() => {
    if (!exerciceCourant) return;
    api.get<{ lignes: LigneBalance[] }>(`/ecritures/balance?exerciceId=${exerciceCourant.id}`).then((r) => {
      // `?? []` · une balance qui revient sans lignes ne doit pas emporter la
      // fenêtre. Le solde affiché à côté de chaque compte rattaché est un
      // CONFORT : son absence doit dégrader la fiche, pas l'abattre.
      setSoldes(Object.fromEntries((r.lignes ?? []).map((l) => [l.compteId, l.solde])));
    });
  }, [exerciceCourant]);

  const listeFiltree = useMemo(
    () => (liste ?? []).filter((t) => !filtreType || t.type === filtreType),
    [liste, filtreType],
  );
  const nombresParType = useMemo(() => {
    const m = new Map<TypeTiers, number>();
    for (const t of liste ?? []) m.set(t.type, (m.get(t.type) ?? 0) + 1);
    return m;
  }, [liste]);

  const tiersSelectionne = liste?.find((t) => t.id === selectionId) ?? null;

  // Voir PlanComptesPage : les verbes de la barre d'outils prennent leur sens
  // ici. « Consulter » ouvre l'interrogation du compte de rattachement du
  // tiers, seul endroit où l'on voit ce qu'il doit et ce qu'il a réglé.
  useActionsFenetre({
    ajouter: { titre: 'Nouveau tiers', executer: () => setNouveauOuvert(true) },
    rechercher: { titre: 'Rechercher un tiers (code, nom)', executer: () => champRecherche.current?.focus() },
    consulter: tiersSelectionne?.comptesRattaches?.[0]
      ? {
          titre: `Interroger le compte de ${tiersSelectionne.nom}`,
          executer: () => navigate(`/comptes/${tiersSelectionne.comptesRattaches[0].compteId}/lettrage`),
        }
      : undefined,
  });
  const comptesDisponibles = comptesClasse4.filter(
    (c) => !tiersSelectionne?.comptesRattaches.some((tc) => tc.compteId === c.id),
  );

  const onCreerTiers = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await api.post('/tiers', { type, code, nom, ...(modeleReglementId ? { modeleReglementId } : {}) });
      setInfo(`Tiers ${code} créé.`);
      setCode('');
      setNom('');
      setModeleReglementId('');
      setNouveauOuvert(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce tiers');
    } finally {
      setEnvoi(false);
    }
  };

  const onRattacherCompte = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectionId || !compteARattacher) return;
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/tiers/${selectionId}/comptes`, { compteId: compteARattacher, estPrincipal });
      setCompteARattacher('');
      setEstPrincipal(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de rattacher ce compte');
    }
  };

  const definirPrincipal = async (compteId: string) => {
    if (!selectionId) return;
    setErreur(null);
    try {
      await api.put(`/tiers/${selectionId}/comptes/${compteId}/principal`, {});
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de définir ce compte comme principal');
    }
  };

  const detacherCompte = async (compteId: string) => {
    if (!selectionId) return;
    setErreur(null);
    try {
      await api.delete(`/tiers/${selectionId}/comptes/${compteId}`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de détacher ce compte');
    }
  };

  /**
   * Enregistre UNE coordonnée, à la sortie du champ et seulement si elle a
   * changé · sans ce test, quitter un champ sans l'avoir touché déclencherait
   * une requête pour rien.
   */
  const enregistrerCoordonnee = async (
    t: Tiers,
    cle: (typeof CHAMPS_COORDONNEES)[number]['cle'],
    valeur: string,
  ) => {
    const propre = valeur.trim();
    if (propre === (t[cle] ?? '')) return;
    setErreur(null);
    try {
      await api.patch(`/tiers/${t.id}`, { [cle]: propre });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    }
  };

  const basculerActif = async (t: Tiers) => {
    try {
      await api.patch(`/tiers/${t.id}`, { estActif: !t.estActif });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  const rechargerModeles = async () => setModeles(await api.get<ModeleReglement[]>('/modeles-reglement'));

  const onCreerModele = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    try {
      await api.post('/modeles-reglement', { intitule: intituleModele, delaiJours, echeance });
      setIntituleModele('');
      setDelaiJours(30);
      await rechargerModeles();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce modèle de règlement');
    }
  };

  const modeleSelectionne = modeles.find((m) => m.id === modeleSelectionneId) ?? null;

  const onAjouterEcheance = async (e: FormEvent) => {
    e.preventDefault();
    if (!modeleSelectionneId) return;
    setErreur(null);
    try {
      await api.post(`/modeles-reglement/${modeleSelectionneId}/echeances`, {
        ordre: ordreEch,
        type: typeEch,
        ...(typeEch !== 'EQUILIBRE' ? { valeur: Number(valeurEch) } : {}),
        delaiJours: delaiJoursEch,
        echeance: echeanceEch,
      });
      setOrdreEch((n) => n + 1);
      setValeurEch('');
      await rechargerModeles();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’ajouter cette échéance');
    }
  };

  const onSupprimerEcheance = async (echeanceId: string) => {
    if (!modeleSelectionneId) return;
    setErreur(null);
    try {
      await api.delete(`/modeles-reglement/${modeleSelectionneId}/echeances/${echeanceId}`);
      await rechargerModeles();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de supprimer cette échéance');
    }
  };

  const onCalculer = async (e: FormEvent) => {
    e.preventDefault();
    if (!modeleSelectionneId) return;
    setErreur(null);
    try {
      setResultatCalc(
        await api.post<EcheanceCalculee[]>(`/modeles-reglement/${modeleSelectionneId}/calculer`, {
          dateFacture: dateFactureCalc,
          montantTotal: Number(montantCalc),
        }),
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de calculer l’échéancier');
    }
  };

  if (!estAdmin) {
    return (
      <div className="p-2">
      <EnteteImpression titre="Plan des tiers" />
        <h1 className="text-[13px] font-bold leading-tight mb-1.5">Plan des tiers</h1>
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[12.5px] max-w-[480px]">
          La gestion des tiers est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">STRUCTURE</div>
          <h1 className="text-[13px] font-bold leading-tight flex items-center gap-1.5">
            Plan des tiers
            <Aide sujet="compte41" />
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={champRecherche}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (code, nom)…"
            className="border border-border-dark bg-surface px-2.5 py-1 text-[12px] w-64"
          />
          <button
            type="button"
            onClick={() => setModelesOuverts(true)}
            className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px]"
          >
            Modèles de règlement…
          </button>
          <button
            type="button"
            onClick={() => setNouveauOuvert(true)}
            className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold"
          >
            Nouveau tiers
          </button>
        </div>
      </div>

      {erreur && (
        <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2 shrink-0">{erreur}</div>
      )}
      {info && !erreur && (
        <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-3 py-1.5 mb-2 shrink-0">{info}</div>
      )}

      <div className="flex-1 min-h-0 flex gap-2.5">
        {/* Filtre par type · la partie gauche de la fenêtre Sage */}
        <div className="w-[190px] shrink-0 bg-surface border border-border shadow-posee overflow-auto">
          <div className="px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
            TYPE DE TIERS
          </div>
          <button
            type="button"
            onClick={() => setFiltreType('')}
            className={`w-full text-left px-3 py-1.5 text-[11.5px] flex justify-between ${
              filtreType === '' ? 'bg-sel text-white' : 'hover:bg-chrome-alt'
            }`}
          >
            <span>Tous les tiers</span>
            <span className={filtreType === '' ? 'text-white/70' : 'text-text-dim'}>{liste?.length ?? '…'}</span>
          </button>
          {(Object.keys(PLURIEL_TYPE) as TypeTiers[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFiltreType(t)}
              className={`w-full text-left px-3 py-1.5 text-[11.5px] flex justify-between ${
                filtreType === t ? 'bg-sel text-white' : 'hover:bg-chrome-alt'
              }`}
            >
              {/*
                Le compte de rattachement (411, 412, 40…) N'EST PLUS rappelé
                ici : cette colonne sert à choisir une famille de tiers, pas à
                réviser le plan comptable. Le numéro reste là où il sert
                vraiment · sur la fiche du tiers sélectionné, et dans le
                sélecteur de type au moment de la création, où il éclaire le
                choix qu'on est en train de faire.
              */}
              <span>{PLURIEL_TYPE[t]}</span>
              <span className={filtreType === t ? 'text-white/70' : 'text-text-dim'}>{nombresParType.get(t) ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Liste des tiers */}
        <div className="flex-1 min-w-0 bg-surface border border-border shadow-posee flex flex-col">
          <div className="grid grid-cols-[96px_1fr_150px_86px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim shrink-0">
            <span>CODE</span>
            <span>NOM</span>
            <span>MODÈLE DE RÈGLEMENT</span>
            <span>ÉTAT</span>
          </div>
          <div className="flex-1 overflow-auto">
            {!liste && <div className="px-3.5 py-3 text-[12px] text-text-dim">Chargement…</div>}
            {listeFiltree.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectionId(t.id)}
                className={`w-full grid grid-cols-[96px_1fr_150px_86px] gap-2.5 px-3.5 py-[4px] items-center text-left border-b border-border/50 text-[11.5px] ${
                  selectionId === t.id ? 'bg-sel text-white' : 'hover:bg-sel-soft'
                } ${!t.estActif && selectionId !== t.id ? 'opacity-55' : ''}`}
              >
                <span className="font-mono font-semibold">{t.code}</span>
                <span className="truncate">{t.nom}</span>
                <span className={`text-[10.5px] truncate ${selectionId === t.id ? 'text-white/80' : 'text-text-dim'}`}>
                  {t.modeleReglement?.intitule ?? '·'}
                </span>
                <span className={`text-[10.5px] ${selectionId === t.id ? 'text-white/90' : t.estActif ? 'text-positive' : 'text-warning'}`}>
                  {t.estActif ? 'Actif' : 'Sommeil'}
                </span>
              </button>
            ))}
            {liste && listeFiltree.length === 0 && (
              <div className="px-3.5 py-3 text-[12px] text-text-dim italic">Aucun tiers de ce type.</div>
            )}
          </div>
          <div className="px-3.5 py-1 bg-surface-alt border-t border-border text-[10px] text-text-dim shrink-0">
            {listeFiltree.length} tiers{filtreType && ` · ${PLURIEL_TYPE[filtreType].toLowerCase()}`}
          </div>
        </div>

        {/* Fiche du tiers sélectionné */}
        <div className="w-[340px] shrink-0 bg-surface border border-border shadow-posee overflow-auto">
          <div className="px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
            FICHE DU TIERS
          </div>
          {!tiersSelectionne && (
            <div className="px-3 py-3 text-[11.5px] text-text-dim">
              Sélectionnez un tiers dans la liste pour afficher sa fiche : identification, modèle de
              règlement, comptes généraux rattachés (avec le compte Principal proposé en saisie).
            </div>
          )}
          {tiersSelectionne && (
            <div className="p-3 text-[11.5px]">
              {/* Volet Identification */}
              <div className="font-mono text-[13px] font-bold leading-tight">{tiersSelectionne.code}</div>
              <div className="text-[12.5px] mb-2.5">{tiersSelectionne.nom}</div>
              <div className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1.5 items-center mb-3">
                <span className="text-text-dim text-right">Type :</span>
                <span className="flex items-center gap-1.5">
                  {LIBELLE_TYPE[tiersSelectionne.type]}
                  <span className="font-mono text-[10.5px] text-text-dim">
                    compte {COMPTE_TYPE[tiersSelectionne.type]}
                  </span>
                  {AIDE_TYPE[tiersSelectionne.type] && <Aide sujet={AIDE_TYPE[tiersSelectionne.type]!} />}
                </span>
                <span className="text-text-dim text-right">Règlement :</span>
                <span>{tiersSelectionne.modeleReglement?.intitule ?? 'aucun modèle'}</span>
                <span className="text-text-dim text-right">État :</span>
                <span className={tiersSelectionne.estActif ? 'text-positive' : 'text-warning'}>
                  {tiersSelectionne.estActif ? 'Actif' : 'En sommeil'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => basculerActif(tiersSelectionne)}
                className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11px] mb-3"
              >
                {tiersSelectionne.estActif ? 'Mettre en sommeil' : 'Réactiver'}
              </button>

              {/*
                VOLET COORDONNÉES · il manquait, et son absence rendait
                inutilisable une brique déjà construite : les lettres de rappel
                et les relevés que le logiciel compose n'avaient aucun
                destinataire. Le Numéro Impôt s'y trouve aussi parce que la
                liste annuelle des fournisseurs (loi de procédures fiscales,
                art. 47 ter, au plus tard le 31 mars) l'exige pour chacun.

                Enregistrement à la SORTIE du champ, pas à chaque frappe : une
                requête par caractère saturerait le serveur pour rien.
              */}
              <div className="border-t border-border pt-2.5 mb-3">
                <div className="text-[10px] font-bold text-text-dim mb-1.5">COORDONNÉES</div>
                <div className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1 items-center">
                  {CHAMPS_COORDONNEES.map((champ) => (
                    <Fragment key={champ.cle}>
                      <label className="text-text-dim text-right text-[11px]" htmlFor={`tiers-${champ.cle}`}>
                        {champ.libelle} :
                      </label>
                      <input
                        id={`tiers-${champ.cle}`}
                        type={champ.cle === 'email' ? 'email' : 'text'}
                        defaultValue={tiersSelectionne[champ.cle] ?? ''}
                        placeholder={champ.exemple}
                        // La clé force le remontage quand on change de tiers ·
                        // sans elle, un champ non contrôlé garderait la valeur
                        // du tiers précédent.
                        key={`${tiersSelectionne.id}-${champ.cle}`}
                        onBlur={(e) => enregistrerCoordonnee(tiersSelectionne, champ.cle, e.target.value)}
                        className="border border-border rounded-[6px] bg-bg px-2 py-[3px] text-[11.5px] focus:outline-none focus:border-sel"
                      />
                    </Fragment>
                  ))}
                </div>
                {!tiersSelectionne.adresse && !tiersSelectionne.email && (
                  <div className="text-[10px] text-warning leading-[1.5] mt-1.5">
                    Sans adresse ni courriel, aucune lettre de rappel ni aucun relevé ne peut être adressé à ce tiers.
                  </div>
                )}
              </div>

              {/* Volet Comptes rattachés */}
              <div className="border-t border-border pt-2.5">
                <div className="text-[10px] font-bold text-text-dim mb-1.5">COMPTES GÉNÉRAUX RATTACHÉS</div>
                {tiersSelectionne.comptesRattaches.length === 0 && (
                  <div className="text-[11px] text-text-dim mb-2">Aucun compte rattaché.</div>
                )}
                {tiersSelectionne.comptesRattaches.map((tc) => (
                  <div key={tc.id} className="border border-border mb-1.5 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{tc.compte.numero}</span>
                      {tc.estPrincipal ? (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-positive-soft text-positive flex items-center gap-1">
                          <IconCheck width={9} height={9} /> PRINCIPAL
                        </span>
                      ) : (
                        <button
                          onClick={() => definirPrincipal(tc.compteId)}
                          className="text-[10px] text-sel hover:underline"
                        >
                          Définir principal
                        </button>
                      )}
                    </div>
                    <div className="text-[10.5px] text-text-dim truncate">{tc.compte.intitule}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono text-[10.5px]">
                        Solde : {tc.compteId in soldes ? soldes[tc.compteId].toLocaleString('fr-FR') : '·'}
                      </span>
                      <span className="flex gap-2.5">
                        <button
                          onClick={() => navigate(`/comptes/${tc.compteId}/lettrage`)}
                          className="text-[10px] text-sel hover:underline"
                        >
                          Interroger / lettrer
                        </button>
                        <button
                          onClick={() => detacherCompte(tc.compteId)}
                          className="text-[10px] text-danger hover:underline"
                        >
                          Détacher
                        </button>
                      </span>
                    </div>
                  </div>
                ))}

                <form onSubmit={onRattacherCompte} className="mt-2">
                  <select
                    required
                    value={compteARattacher}
                    onChange={(e) => setCompteARattacher(e.target.value)}
                    className="w-full border border-border-dark px-2 py-1 text-[11.5px] mb-1.5"
                  >
                    <option value="">Rattacher un compte de classe 4</option>
                    {comptesDisponibles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px]">
                      <input type="checkbox" checked={estPrincipal} onChange={(e) => setEstPrincipal(e.target.checked)} />
                      Principal
                    </label>
                    <button type="submit" className="bg-sel text-white text-[11px] font-semibold px-3 py-1">
                      Rattacher
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Boîte de dialogue · Nouveau tiers */}
      {nouveauOuvert && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onCreerTiers} className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[11.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Nouveau tiers</span>
              <button type="button" onClick={() => setNouveauOuvert(false)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[12px] text-right">Type :</label>
                <select value={type} onChange={(e) => setType(e.target.value as TypeTiers)} className="border border-border-dark px-2.5 py-1.5 text-[12.5px]">
                  {(Object.keys(LIBELLE_TYPE) as TypeTiers[]).map((t) => (
                    <option key={t} value={t}>{`${LIBELLE_TYPE[t]} · compte ${COMPTE_TYPE[t]}`}</option>
                  ))}
                </select>
                <label className="text-[12px] text-right">Code :</label>
                <input required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex. CLI-0001" className="border border-border-dark px-2.5 py-1.5 text-[13px] font-mono" />
                <label className="text-[12px] text-right">Nom :</label>
                <input required value={nom} onChange={(e) => setNom(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[13px]" />
                <label className="text-[12px] text-right">Règlement :</label>
                <select value={modeleReglementId} onChange={(e) => setModeleReglementId(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12.5px]">
                  <option value="">Aucun modèle</option>
                  {modeles.map((m) => (
                    <option key={m.id} value={m.id}>{m.intitule}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setNouveauOuvert(false)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[12px]">
                  Annuler
                </button>
                <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[12px] font-semibold disabled:opacity-50">
                  {envoi ? 'Création…' : 'Créer le tiers'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Boîte de dialogue · Modèles de règlement (Structure → Modèles chez Sage) */}
      {modelesOuverts && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <div className="anim-modale w-full max-w-[720px] max-h-[86vh] flex flex-col bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[11.5px] shrink-0"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Modèles de règlement</span>
              <button type="button" onClick={() => setModelesOuverts(false)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">
              <div className="border border-border mb-3">
                {modeles.length === 0 && <div className="p-2.5 text-[11.5px] text-text-dim">Aucun modèle de règlement.</div>}
                {modeles.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => setModeleSelectionneId(m.id === modeleSelectionneId ? null : m.id)}
                    className={`grid grid-cols-[1fr_100px_180px_80px] gap-2 items-center px-3 py-1.5 border-b border-border last:border-b-0 text-[11.5px] cursor-pointer ${
                      m.id === modeleSelectionneId ? 'bg-sel-soft' : 'hover:bg-chrome-alt'
                    }`}
                  >
                    <span>{m.intitule}</span>
                    <span className="text-text-dim">
                      {m.echeances.length > 0 ? `${m.echeances.length} échéances` : `${m.delaiJours} j.`}
                    </span>
                    <span className="text-[10.5px] text-text-dim">
                      {m.echeances.length > 0 ? 'Fractionné' : LIBELLE_ECHEANCE[m.echeance]}
                    </span>
                    <span className="text-[10.5px] text-sel">{m.id === modeleSelectionneId ? '▾ fermer' : '▸ détail'}</span>
                  </div>
                ))}
              </div>

              {modeleSelectionne && (
                <div className="border border-border mb-3 p-3 bg-surface-alt">
                  <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-2">
                    ÉCHÉANCES · {modeleSelectionne.intitule}
                  </div>
                  {modeleSelectionne.echeances.length === 0 && (
                    <div className="text-[11px] text-text-dim mb-2">
                      Mono-échéance : 100 % à {modeleSelectionne.delaiJours} j. ({LIBELLE_ECHEANCE[modeleSelectionne.echeance]}).
                      Ajoutez une échéance ci-dessous pour fractionner.
                    </div>
                  )}
                  {modeleSelectionne.echeances.length > 0 && (
                    <div className="border border-border mb-3 bg-surface">
                      {modeleSelectionne.echeances.map((ech) => (
                        <div
                          key={ech.id}
                          className="grid grid-cols-[40px_130px_90px_70px_150px_70px] gap-2 items-center px-2.5 py-1 border-b border-border last:border-b-0 text-[11px]"
                        >
                          <span className="font-mono">#{ech.ordre}</span>
                          <span>{LIBELLE_TYPE_ECHEANCE[ech.type]}</span>
                          <span className="text-right font-mono">{ech.valeur ?? '·'}</span>
                          <span className="text-text-dim">{ech.delaiJours} j.</span>
                          <span className="text-[10px] text-text-dim">{LIBELLE_ECHEANCE[ech.echeance]}</span>
                          <button onClick={() => onSupprimerEcheance(ech.id)} className="text-danger text-[10px] font-semibold hover:underline w-fit">
                            Supprimer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={onAjouterEcheance} className="grid grid-cols-6 gap-2 items-end mb-4">
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Ordre
                      <input required type="number" min={1} value={ordreEch} onChange={(e) => setOrdreEch(Number(e.target.value))} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Type
                      <select value={typeEch} onChange={(e) => setTypeEch(e.target.value as TypeEcheance)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        {(Object.keys(LIBELLE_TYPE_ECHEANCE) as TypeEcheance[]).map((t) => (
                          <option key={t} value={t}>{LIBELLE_TYPE_ECHEANCE[t]}</option>
                        ))}
                      </select>
                    </label>
                    {typeEch !== 'EQUILIBRE' && (
                      <label className="text-[10.5px] font-semibold text-text-dim">
                        {typeEch === 'POURCENTAGE' ? 'Valeur (%)' : 'Valeur (montant)'}
                        <input required type="number" min={0} step="0.01" value={valeurEch} onChange={(e) => setValeurEch(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]" />
                      </label>
                    )}
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Délai (j.)
                      <input required type="number" min={0} value={delaiJoursEch} onChange={(e) => setDelaiJoursEch(Number(e.target.value))} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Condition
                      <select value={echeanceEch} onChange={(e) => setEcheanceEch(e.target.value as ConditionEcheance)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]">
                        {(Object.keys(LIBELLE_ECHEANCE) as ConditionEcheance[]).map((c) => (
                          <option key={c} value={c}>{LIBELLE_ECHEANCE[c]}</option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 h-fit">
                      Ajouter
                    </button>
                  </form>

                  <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-2">SIMULATEUR D'ÉCHÉANCIER</div>
                  <form onSubmit={onCalculer} className="flex items-end gap-2 mb-3">
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Date facture
                      <input required type="date" value={dateFactureCalc} onChange={(e) => setDateFactureCalc(e.target.value)} className="mt-1 block border border-border-dark px-2 py-1 text-[11.5px]" />
                    </label>
                    <label className="text-[10.5px] font-semibold text-text-dim">
                      Montant
                      <input required type="number" min={0.01} step="0.01" value={montantCalc} onChange={(e) => setMontantCalc(e.target.value)} className="mt-1 block border border-border-dark px-2 py-1 text-[11.5px]" />
                    </label>
                    <button type="submit" className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5">
                      Calculer
                    </button>
                  </form>
                  {resultatCalc && (
                    <div className="border border-border bg-surface shadow-posee">
                      {resultatCalc.map((r) => (
                        <div key={r.ordre} className="grid grid-cols-3 gap-2 px-2.5 py-1 border-b border-border last:border-b-0 text-[11px] font-mono">
                          <span>#{r.ordre}</span>
                          <span className="text-right">{r.montant.toLocaleString('fr-FR')}</span>
                          <span className="text-text-dim">{new Date(r.dateEcheance).toLocaleDateString('fr-FR')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={onCreerModele} className="grid grid-cols-4 gap-2 items-end border-t border-border pt-3">
                <label className="text-[11px] font-semibold text-text-dim col-span-2">
                  Nouveau modèle · intitulé
                  <input required value={intituleModele} onChange={(e) => setIntituleModele(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal" />
                </label>
                <label className="text-[11px] font-semibold text-text-dim">
                  Délai (j.)
                  <input required type="number" min={0} value={delaiJours} onChange={(e) => setDelaiJours(Number(e.target.value))} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal" />
                </label>
                <label className="text-[11px] font-semibold text-text-dim">
                  Échéance
                  <select value={echeance} onChange={(e) => setEcheance(e.target.value as ConditionEcheance)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal">
                    {(Object.keys(LIBELLE_ECHEANCE) as ConditionEcheance[]).map((c) => (
                      <option key={c} value={c}>{LIBELLE_ECHEANCE[c]}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 col-span-4 w-fit">
                  Ajouter le modèle
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
