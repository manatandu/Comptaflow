import { FormEvent, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ClasseCompte, Compte, ModeReportANouveau, TauxTva, TypeCompteDetailTotal } from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * PLAN COMPTABLE · la fenêtre Structure → Plan comptable de Sage 100 i7 :
 * à gauche le classement par classe (1 à 9), au centre la liste
 * dense des comptes (numéro · intitulé · type · report à-nouveau · état),
 * à droite la FICHE du compte sélectionné, en volet « Identification »
 * (numéro, type Détail/Total, intitulé, classe, report à-nouveau à trois
 * modes, mise en sommeil) avec le bouton « Gérer » qui ouvre l'interrogation
 * et le lettrage du compte · exactement le bouton Gérer de la fiche Sage.
 */

/**
 * LES NEUF CLASSES N'ONT PAS LE MÊME NOM DANS LES DEUX PLANS, et la fenêtre
 * n'en connaissait qu'un jeu. Deux écarts sur neuf, mais ils portent sur les
 * deux classes les plus caractéristiques de chaque référentiel :
 *
 *  · classe 1 · « Fonds propres » est le vocabulaire des EBNL. Les deux
 *    cadres comptables l'intitulent en réalité « comptes de ressources
 *    durables » ; c'est leur CONTENU qui diffère · « ressources propres et
 *    dettes financières » au SYCEBNL (Partie 2 ch. 1), « capitaux propres et
 *    dettes financières » à l'AUDCIF (Titre VII ch. 2, section 1) ;
 *  · classe 9 · « comptes des contributions volontaires en nature et comptes
 *    de la comptabilité analytique » au SYCEBNL (Partie 2 ch. 1), « comptes
 *    des engagements hors bilan et comptabilité analytique de gestion » à
 *    l'AUDCIF (Titre VII ch. 1). Une entreprise lisait donc, sur sa propre
 *    classe 9, le nom d'une notion qui n'existe pas chez elle.
 *
 * Les sept autres portent le même intitulé de part et d'autre, et le tableau
 * SYSCOHADA les reprend explicitement plutôt que d'hériter : un libellé qui
 * changerait d'un seul côté doit se voir.
 */
const LIBELLE_CLASSE_SYCEBNL: Record<ClasseCompte, string> = {
  CLASSE_1: 'Ressources durables (fonds propres et dettes financières)',
  CLASSE_2: 'Immobilisations',
  CLASSE_3: 'Stocks',
  CLASSE_4: 'Tiers',
  CLASSE_5: 'Trésorerie',
  CLASSE_6: 'Charges',
  CLASSE_7: 'Produits',
  CLASSE_8: 'Autres charges/produits (H.A.O.)',
  CLASSE_9: 'Contributions volontaires · analytique',
};

const LIBELLE_CLASSE_SYSCOHADA: Record<ClasseCompte, string> = {
  CLASSE_1: 'Ressources durables (capitaux propres et dettes financières)',
  CLASSE_2: 'Immobilisations',
  CLASSE_3: 'Stocks',
  CLASSE_4: 'Tiers',
  CLASSE_5: 'Trésorerie',
  CLASSE_6: 'Charges',
  CLASSE_7: 'Produits',
  CLASSE_8: 'Autres charges/produits (H.A.O.)',
  CLASSE_9: 'Engagements hors bilan · analytique',
};

const LIBELLE_RAN: Record<ModeReportANouveau, string> = {
  AUCUN: 'Aucun',
  SOLDE: 'Solde',
  DETAIL: 'Détail',
};

/**
 * Compte principal officiel (2 chiffres) · les en-têtes de division du plan,
 * 84 semés par compte-seed.ts (SYCEBNL, total()) ou 85 par
 * compte-seed-syscohada.ts (SYSCOHADA, t()). Un numéro à 2 chiffres est
 * structurellement impossible à obtenir autrement : CreerCompteDto exige
 * 3 à 13 chiffres. Cette propriété sert ici à verrouiller ces lignes en
 * édition, sans marqueur ni champ supplémentaire côté base.
 */
const estComptePrincipalOfficiel = (c: Pick<Compte, 'typeCompte' | 'numero'>) =>
  c.typeCompte === 'TOTAL' && c.numero.length === 2;

export function PlanComptesPage() {
  const [tauxTva, setTauxTva] = useState<TauxTva[]>([]);
  // CATALOGUE FISCAL · chargé seulement pour un dossier SYSCOHADA · une
  // entité à but non lucratif est exemptée d'impôt sur les sociétés (loi
  // n° 23/053, art. 5), la question du retraitement ne s'y pose pas.
  const [catalogueFiscal, setCatalogueFiscal] = useState<Array<{ code: string; libelle: string; source: string }>>([]);
  const navigate = useNavigate();
  const { estAdmin, utilisateur } = useAuth();
  const libelleClasse =
    utilisateur?.tenant.referentiel === 'SYSCOHADA' ? LIBELLE_CLASSE_SYSCOHADA : LIBELLE_CLASSE_SYCEBNL;
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [classeFiltre, setClasseFiltre] = useState<ClasseCompte>('CLASSE_1');
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);
  const champRecherche = useRef<HTMLInputElement>(null);
  const champIntitule = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Champs du formulaire « Nouveau compte »
  const [numero, setNumero] = useState('');
  const [intitule, setIntitule] = useState('');
  const [classe, setClasse] = useState<ClasseCompte>('CLASSE_1');
  const [typeCompte, setTypeCompte] = useState<TypeCompteDetailTotal>('DETAIL');

  // Fiche : intitulé éditable
  const [intituleEdit, setIntituleEdit] = useState('');

  const charger = async () => {
    const params = recherche ? `?recherche=${encodeURIComponent(recherche)}` : '';
    setComptes(await api.get<Compte[]>(`/comptes${params}`));
  };

  useEffect(() => {
    // Montage (recherche vide) : chargement immédiat · attendre 250 ms
    // n'amortit rien quand personne n'a encore tapé.
    if (recherche === '') {
      charger();
      return;
    }
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  // Taux de TVA du dossier · alimentent le sélecteur « code taxe par défaut »
  // de la fiche compte. Chargés une fois, ils changent rarement.
  useEffect(() => {
    api.get<TauxTva[]>('/taux-tva?actifsSeuls=true').then(setTauxTva).catch(() => setTauxTva([]));
    api
      .get<{ retraitements: Array<{ code: string; libelle: string; source: string }> }>('/fiscalite/catalogue')
      .then((r) => setCatalogueFiscal(r.retraitements), () => setCatalogueFiscal([]));
  }, []);

  // Une recherche en cours affiche ses résultats toutes classes confondues ·
  // le classement par classe ne s'applique qu'en navigation libre, sans recherche.
  const liste = useMemo(
    () => (comptes ?? []).filter((c) => recherche.trim() !== '' || c.classe === classeFiltre),
    [comptes, classeFiltre, recherche],
  );
  const selection = liste.find((c) => c.id === selectionId) ?? (comptes ?? []).find((c) => c.id === selectionId) ?? null;

  /*
    Ce que cette fenêtre sait faire, annoncé à la barre d'outils · les verbes
    de Sage prennent ici leur sens concret. « Consulter » ouvre l'interrogation
    du compte (son grand livre et son lettrage), qui est exactement ce que
    « Gérer » fait depuis la fiche compte de Sage. Ce qui n'est pas déclaré
    reste grisé dans la barre : le plan comptable ne trie pas et n'inverse
    rien, ces boutons doivent donc rester éteints ici.
  */

  useEffect(() => {
    setIntituleEdit(selection?.intitule ?? '');
  }, [selection?.id, selection?.intitule]);

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/comptes', { numero, intitule, classe, typeCompte });
      setNumero('');
      setIntitule('');
      setTypeCompte('DETAIL');
      setNouveauOuvert(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce compte');
    } finally {
      setEnvoi(false);
    }
  };

  const modifier = async (
    id: string,
    corps: {
      intitule?: string;
      estActif?: boolean;
      modeReportANouveau?: ModeReportANouveau;
      lettrable?: boolean;
      tauxTvaDefautId?: string | null;
      codeRetraitementFiscal?: string | null;
    },
  ) => {
    setErreur(null);
    try {
      await api.patch(`/comptes/${id}`, corps);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Modification impossible');
    }
  };

  return (
    <div className="p-2 flex flex-col h-full">
      <EnteteImpression titre="Plan comptable" />
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">STRUCTURE</div>
          <h1 className="text-[12px] font-bold leading-tight">Plan comptable</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={champRecherche}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (numéro ou intitulé)…"
            className="border border-border-dark bg-surface px-2.5 py-1 text-[11px] w-72"
          />
          {estAdmin && (
            <button
              type="button"
              onClick={() => setNouveauOuvert((v) => !v)}
              className="bg-sel text-white px-3.5 py-1 text-[10.5px] font-semibold"
            >
              Nouveau compte
            </button>
          )}
        </div>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2 shrink-0">
          {erreur}
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-2.5">
        {/* Classement par classe · la barre de gauche de la fenêtre Sage */}
        <div className="w-[230px] shrink-0 bg-surface border border-border shadow-posee overflow-auto">
          <div className="px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
            CLASSEMENT
          </div>
          {(Object.keys(libelleClasse) as ClasseCompte[]).map((cl) => (
            <button
              key={cl}
              type="button"
              onClick={() => setClasseFiltre(cl)}
              className={`w-full text-left px-3 py-1.5 text-[10.5px] ${
                classeFiltre === cl ? 'bg-sel text-white' : 'hover:bg-chrome-alt'
              }`}
            >
              <span className="font-mono font-semibold">Classe {cl.replace('CLASSE_', '')}</span>
              <span className={`block text-[10px] leading-tight truncate ${classeFiltre === cl ? 'text-white/75' : 'text-text-dim'}`}>
                {libelleClasse[cl]}
              </span>
            </button>
          ))}
        </div>

        {/* Liste des comptes */}
        <div
          // `overflow-x-auto` ici, `min-w` sur les lignes · les 364 px de colonnes
          // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
          // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
          // qui emportait alors titre, onglets et boutons hors de l'écran.
          className="flex-1 min-w-0 bg-surface border border-border shadow-posee flex flex-col overflow-x-auto"
        >
          <div className="grid grid-cols-[92px_1fr_58px_72px_74px] min-w-[520px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim shrink-0">
            <span>N° COMPTE</span>
            <span>INTITULÉ</span>
            <span>TYPE</span>
            <span title="Mode de report à-nouveau en fin d'exercice">À-NOUVEAU</span>
            <span>ÉTAT</span>
          </div>
          <div className="flex-1 overflow-auto min-w-[520px]">
            {!comptes && <div className="px-3.5 py-3 text-[11px] text-text-dim">Chargement…</div>}
            {liste.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectionId(c.id)}
                onDoubleClick={() => c.typeCompte === 'DETAIL' && navigate(`/comptes/${c.id}/lettrage`)}
                title={c.typeCompte === 'TOTAL' ? 'Compte Total · agrège les comptes Détail de même racine' : 'Double-clic : interroger le compte'}
                /*
                  TROIS NIVEAUX DE LECTURE, et non deux · le compte principal
                  officiel à deux chiffres (10 Dotation, 40 Fournisseurs…) est
                  la TÊTE d'une division du plan. Il portait la même
                  graisse qu'un compte Total ordinaire créé à la main, ce qui
                  noyait l'ossature du plan dans les regroupements de confort.
                  Il s'écrit donc en GRAS franc, un cran plus grand, sur un
                  fond plus soutenu · on doit reconnaître la charpente du plan
                  en le parcourant, sans lire les numéros.
                */
                className={`w-full grid grid-cols-[92px_1fr_58px_72px_74px] min-w-[520px] gap-2.5 px-3.5 items-center text-left border-b border-border/50 ${
                  estComptePrincipalOfficiel(c) ? 'py-[5px] text-[11px]' : 'py-[3.5px] text-[10.5px]'
                } ${
                  selectionId === c.id
                    ? 'bg-sel text-white'
                    : estComptePrincipalOfficiel(c)
                      ? 'bg-chrome-alt font-bold hover:brightness-[0.97]'
                      : c.typeCompte === 'TOTAL'
                        ? 'bg-chrome font-semibold hover:bg-chrome-alt'
                        : 'hover:bg-sel-soft'
                } ${!c.estActif && selectionId !== c.id ? 'opacity-55' : ''}`}
              >
                <span className={`font-mono ${estComptePrincipalOfficiel(c) ? 'font-bold' : ''}`}>{c.numero}</span>
                <span className="truncate">{c.intitule}</span>
                <span className={`text-[10px] font-normal ${selectionId === c.id ? 'text-white/80' : 'text-text-dim'}`}>
                  {estComptePrincipalOfficiel(c) ? 'Principal' : c.typeCompte === 'TOTAL' ? 'Total' : 'Détail'}
                </span>
                <span className={`text-[10px] ${selectionId === c.id ? 'text-white/80' : 'text-text-dim'}`}>
                  {LIBELLE_RAN[c.modeReportANouveau] ?? '·'}
                  {c.lettrable && <span title="Compte lettrable"> · L</span>}
                </span>
                <span className={`text-[10px] ${selectionId === c.id ? 'text-white/90' : c.estActif ? 'text-positive' : 'text-warning'}`}>
                  {c.estActif ? 'Actif' : 'Sommeil'}
                </span>
              </button>
            ))}
            {comptes && liste.length === 0 && (
              <div className="px-3.5 py-3 text-[11px] text-text-dim italic">Aucun compte ne correspond.</div>
            )}
          </div>
          <div className="px-3.5 py-1 bg-surface-alt border-t border-border text-[10px] text-text-dim shrink-0">
            {liste.length} compte{liste.length > 1 ? 's' : ''}
            {recherche.trim() === '' && ` · classe ${classeFiltre.replace('CLASSE_', '')}`}
          </div>
        </div>

        {/* Fiche du compte sélectionné · volet Identification */}
        <div className="w-[300px] shrink-0 bg-surface border border-border shadow-posee overflow-auto">
          <div className="px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
            FICHE DU COMPTE · IDENTIFICATION
          </div>
          {!selection && (
            <div className="px-3 py-3 text-[10.5px] text-text-dim">
              Sélectionnez un compte dans la liste pour afficher sa fiche. Double-clic sur un compte Détail :
              interrogation et lettrage.
            </div>
          )}
          {selection && (
            <div className="p-3 text-[10.5px]">
              <div className="font-mono text-[14px] font-bold">{selection.numero}</div>
              <div className="text-[11px] mb-3">{selection.intitule}</div>

              <div className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1.5 items-center mb-3">
                <span className="text-text-dim text-right">Classe :</span>
                <span>
                  {selection.classe.replace('CLASSE_', '')} · {libelleClasse[selection.classe]}
                </span>
                <span className="text-text-dim text-right">Type :</span>
                <span>
                  {estComptePrincipalOfficiel(selection)
                    ? 'Total · compte principal officiel'
                    : selection.typeCompte === 'TOTAL'
                      ? 'Total (regroupement par racine)'
                      : 'Détail (mouvementable)'}
                </span>
                <span className="text-text-dim text-right">État :</span>
                <span className={selection.estActif ? 'text-positive' : 'text-warning'}>
                  {selection.estActif ? 'Actif' : 'En sommeil'}
                </span>
              </div>

              {estComptePrincipalOfficiel(selection) && (
                <p className="mb-3 rounded-[6px] border border-border bg-surface-alt px-2.5 py-2 text-[10.5px] text-text-dim leading-[1.5]">
                  {utilisateur?.tenant.referentiel === 'SYSCOHADA'
                    ? 'Compte principal du plan SYSCOHADA (AUDCIF art. 18 · Titre VII, ch. 1 pour la liste des comptes à deux chiffres, ch. 2 pour le caractère impératif de la codification)'
                    : 'Compte principal du plan SYCEBNL (Partie 2, ch. 2)'}{' '}
                  : son numéro, son intitulé et son rattachement ne se modifient pas. Il regroupe automatiquement les
                  comptes Détail de sa division · aucune écriture ne s'y saisit jamais.
                </p>
              )}

              {estAdmin && !estComptePrincipalOfficiel(selection) && (
                <>
                  <label className="block mb-2">
                    <span className="text-[10px] font-bold text-text-dim">INTITULÉ</span>
                    <div className="flex gap-1.5 mt-0.5">
                      <input
                        ref={champIntitule}
                        value={intituleEdit}
                        onChange={(e) => setIntituleEdit(e.target.value)}
                        className="flex-1 min-w-0 border border-border-dark px-2 py-1 text-[11px]"
                      />
                      <button
                        type="button"
                        disabled={!intituleEdit.trim() || intituleEdit === selection.intitule}
                        onClick={() => modifier(selection.id, { intitule: intituleEdit.trim() })}
                        className="border border-border-dark bg-chrome hover:bg-chrome-alt px-2 text-[10.5px] disabled:opacity-40"
                      >
                        OK
                      </button>
                    </div>
                  </label>

                  <label className="block mb-3">
                    <span className="text-[10px] font-bold text-text-dim" title="Aucun : pas de report (charges/produits). Solde : seul le solde est repris. Détail : les lignes non lettrées sont reprises une à une (comptes de tiers lettrés).">
                      REPORT À-NOUVEAU
                    </span>
                    <select
                      value={selection.modeReportANouveau}
                      onChange={(e) => modifier(selection.id, { modeReportANouveau: e.target.value as ModeReportANouveau })}
                      className="mt-0.5 w-full border border-border-dark px-2 py-1 text-[11px]"
                    >
                      <option value="AUCUN">Aucun · pas de report (charges, produits)</option>
                      <option value="SOLDE">Solde · le solde seul est reporté</option>
                      <option value="DETAIL">Détail · lignes non lettrées reprises</option>
                    </select>
                  </label>

                  {/* « Liberté de définir la liste des comptes auxquels
                      s'applique le lettrage » · CPCC, Notes de cours
                      d'organisation comptable, ch. 6. Le défaut suit le
                      numéro (classes 4 et comptes 58), mais rien n'oblige à
                      s'y tenir : le même chapitre illustre le lettrage sur le
                      compte 585. */}
                  {/* CODE TAXE PAR DÉFAUT · Sage le porte sur la fiche
                      compte et le propose en saisie. Offert sur les charges
                      et les produits seulement : c'est là qu'il a un sens. */}
                  {(selection.numero.startsWith('6') || selection.numero.startsWith('7')) && (
                    <label className="block mb-3">
                      <span className="text-[10px] font-bold text-text-dim" title="Proposé automatiquement en saisie guidée quand ce compte est choisi · modifiable ligne à ligne">
                        CODE TAXE PAR DÉFAUT
                      </span>
                      <select
                        value={selection.tauxTvaDefautId ?? ''}
                        disabled={!estAdmin}
                        onChange={(e) => modifier(selection.id, { tauxTvaDefautId: e.target.value || null })}
                        className="mt-0.5 w-full border border-border-dark px-2 py-1 text-[11px]"
                      >
                        <option value="">Aucun · taux à saisir à chaque ligne</option>
                        {tauxTva.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} · {t.intitule} ({t.taux} %)
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {/* TRAITEMENT FISCAL DÉCLARÉ · le logiciel ne devine PAS la
                      qualification fiscale d'une charge, le catalogue explique
                      pourquoi. Mais un cabinet qui ouvre son propre sous-compte
                      « Amendes fiscales » a déjà tranché : il le déclare ici une
                      fois, et le résultat fiscal le lui repropose chaque
                      exercice avec le montant et l'article. */}
                  {catalogueFiscal.length > 0 && (
                    <label className="block mb-3">
                      <span
                        className="text-[10px] font-bold text-text-dim"
                        title="Ce que TOUT ce qui passe par ce compte devient au résultat fiscal · proposé chaque exercice, jamais inscrit d'office"
                      >
                        TRAITEMENT FISCAL DE CE COMPTE
                      </span>
                      <select
                        value={selection.codeRetraitementFiscal ?? ''}
                        disabled={!estAdmin}
                        onChange={(e) => modifier(selection.id, { codeRetraitementFiscal: e.target.value || null })}
                        className="mt-0.5 w-full border border-border-dark px-2 py-1 text-[11px]"
                      >
                        <option value="">Aucun · rien n'est proposé pour ce compte</option>
                        {catalogueFiscal.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.libelle} · {d.source}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="flex items-start gap-2 mb-3 text-[10.5px]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={!estAdmin}
                      checked={selection.lettrable}
                      onChange={(e) => modifier(selection.id, { lettrable: e.target.checked })}
                    />
                    <span>
                      Compte lettrable
                      <span className="block text-[10px] text-text-dim leading-[1.5]">
                        Autorise le rapprochement débit/crédit sur ce compte. Utile surtout aux comptes de tiers, mais
                        pas réservé à eux : les virements internes (58) s'y prêtent aussi.
                      </span>
                    </span>
                  </label>
                </>
              )}

              <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                {selection.typeCompte === 'DETAIL' && (
                  <button
                    type="button"
                    onClick={() => navigate(`/comptes/${selection.id}/lettrage`)}
                    className="bg-sel text-white px-3 py-1.5 text-[10.5px] font-semibold"
                  >
                    Gérer · interrogation et lettrage
                  </button>
                )}
                {estAdmin && !estComptePrincipalOfficiel(selection) && (
                  <button
                    type="button"
                    onClick={() => modifier(selection.id, { estActif: !selection.estActif })}
                    className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1.5 text-[10.5px]"
                  >
                    {selection.estActif ? 'Mettre en sommeil' : 'Réactiver le compte'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nouveau compte · boîte de dialogue */}
      {estAdmin && nouveauOuvert && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form
            onSubmit={onCreer}
            className="anim-modale w-full max-w-[460px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Nouveau compte général</span>
              <button type="button" onClick={() => setNouveauOuvert(false)} className="text-white/85 hover:text-white px-1.5">
                ✕
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[11px] text-right">Numéro :</label>
                <input
                  required
                  autoFocus
                  pattern="\d{3,8}"
                  title="3 à 8 chiffres"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  className="border border-border-dark px-2.5 py-1.5 text-[12px] font-mono"
                />
                <label className="text-[11px] text-right">Intitulé :</label>
                <input
                  required
                  value={intitule}
                  onChange={(e) => setIntitule(e.target.value)}
                  className="border border-border-dark px-2.5 py-1.5 text-[12px]"
                />
                <label className="text-[11px] text-right">Classe :</label>
                <select
                  value={classe}
                  onChange={(e) => setClasse(e.target.value as ClasseCompte)}
                  className="border border-border-dark px-2.5 py-1.5 text-[11px]"
                >
                  {(Object.keys(libelleClasse) as ClasseCompte[]).map((cl) => (
                    <option key={cl} value={cl}>
                      {cl.replace('CLASSE_', 'Classe ')} · {libelleClasse[cl]}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] text-right">Type :</label>
                <select
                  value={typeCompte}
                  onChange={(e) => setTypeCompte(e.target.value as TypeCompteDetailTotal)}
                  className="border border-border-dark px-2.5 py-1.5 text-[11px]"
                >
                  <option value="DETAIL">Détail (mouvementable)</option>
                  <option value="TOTAL">Total (regroupement par racine)</option>
                </select>
              </div>
              {typeCompte === 'TOTAL' && (
                <p className="text-[10.5px] text-text-dim mt-3">
                  Un compte Total ne reçoit jamais d'écriture : son solde agrège les comptes Détail dont le
                  numéro commence par le sien (préfixe littéral).
                </p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setNouveauOuvert(false)}
                  className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11px]"
                >
                  Annuler
                </button>
                <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  {envoi ? 'Création…' : 'Créer le compte'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
