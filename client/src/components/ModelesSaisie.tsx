import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type {
  CatalogueOperations,
  Compte,
  EcritureProposee,
  ModeleEcriture,
  OperationSpecifique,
  TauxTva,
} from '../lib/types';

/** Une ligne prête à être insérée dans la pièce en cours de saisie. */
export interface LigneInseree {
  compteId: string;
  numero: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  tauxTvaId?: string;
}

/**
 * Modèles de saisie · appelés DEPUIS la fenêtre de saisie des journaux,
 * exactement comme chez Sage (« En saisie des journaux, pour faire appel à un
 * modèle de saisie, sélectionner le modèle dans la zone prévue à cet effet »).
 * Un modèle ne fait que PRÉ-REMPLIR la pièce en cours : les lignes générées
 * restent modifiables ligne à ligne avant enregistrement · le modèle
 * accélère la saisie, il ne l'enferme jamais.
 *
 * Trois familles :
 *  - opérations courantes (don, cotisation, achat, salaire) ;
 *  - opérations avec TVA (vente, achat) · TVA calculée, jamais saisie ;
 *  - écritures-types SYCEBNL (Partie 3 · Guide d'application), servies par
 *    l'API /operations-specifiques qui les chiffre contre le référentiel.
 */

import { MODELES_SIMPLES_SYCEBNL, MODELES_SIMPLES_SYSCOHADA, type ModeleSimple } from '../lib/modeles-saisie';
import { compteTvaPourContrepartie } from '../lib/tva-syscohada';

type ModeleTva = { code: 'vente_tva' | 'achat_tva'; libelle: string; sens: 'recette' | 'depense' };
const MODELES_TVA: ModeleTva[] = [
  { code: 'vente_tva', libelle: 'Vente avec TVA', sens: 'recette' },
  { code: 'achat_tva', libelle: 'Achat avec TVA', sens: 'depense' },
];

function arrondi2(n: number): number {
  return Math.round(n * 100) / 100;
}

type Selection =
  | { genre: 'simple'; modele: ModeleSimple }
  | { genre: 'tva'; modele: ModeleTva }
  | { genre: 'ebnl'; operation: OperationSpecifique; modele: ModeleEcriture };

export function ModelesSaisieModale({
  comptes,
  onInserer,
  onFermer,
}: {
  comptes: Compte[];
  onInserer: (lignes: LigneInseree[], libelleSuggere: string) => void;
  onFermer: () => void;
}) {
  const { utilisateur } = useAuth();
  const estSyscohada = utilisateur?.tenant.referentiel === 'SYSCOHADA';
  const modelesSimples = estSyscohada ? MODELES_SIMPLES_SYSCOHADA : MODELES_SIMPLES_SYCEBNL;
  const [catalogue, setCatalogue] = useState<CatalogueOperations | null>(null);
  const [tauxTvaListe, setTauxTvaListe] = useState<TauxTva[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Paramètres communs aux modèles simples/TVA
  const [montant, setMontant] = useState('');
  const [compteTresorerieId, setCompteTresorerieId] = useState('');
  const [compteContrepartieTvaId, setCompteContrepartieTvaId] = useState('');
  const [tauxTvaId, setTauxTvaId] = useState('');

  // Paramètres + choix de comptes des écritures-types SYCEBNL
  const [parametres, setParametres] = useState<Record<string, string>>({});
  const [comptesChoisis, setComptesChoisis] = useState<Record<string, string>>({});
  const [proposition, setProposition] = useState<EcritureProposee | null>(null);
  const [calcul, setCalcul] = useState(false);

  const comptesTresorerie = useMemo(
    () => comptes.filter((c) => c.numero.startsWith('5')),
    [comptes],
  );
  const comptesCharges = useMemo(() => comptes.filter((c) => c.numero.startsWith('6')), [comptes]);
  const comptesProduits = useMemo(() => comptes.filter((c) => c.numero.startsWith('7')), [comptes]);
  // Le routage de TVA ne vise un compte que s'il est OUVERT dans le plan du
  // dossier · un plan élagué doit retomber sur le compte du taux, pas échouer.
  const numerosDuPlan = useMemo(() => new Set(comptes.map((c) => c.numero)), [comptes]);

  useEffect(() => {
    // Les écritures-types de la Partie 3 sont PROPRES au SYCEBNL, et leur
    // route est gardée côté serveur. On ne l'appelait quand même, pour
    // avaler le 403 en silence · un dossier d'entreprise voyait alors une
    // famille « ÉCRITURES-TYPES SYCEBNL » qui restait éternellement en
    // « Chargement… ». On ne la demande plus, et on ne l'affiche plus.
    if (!estSyscohada) {
      api.get<CatalogueOperations>('/operations-specifiques').then(setCatalogue).catch(() => setCatalogue(null));
    }
    api.get<TauxTva[]>('/taux-tva?actifsSeuls=true').then(setTauxTvaListe).catch(() => setTauxTvaListe([]));
  }, [estSyscohada]);

  useEffect(() => {
    if (comptesTresorerie[0] && !compteTresorerieId) setCompteTresorerieId(comptesTresorerie[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comptesTresorerie]);

  /**
   * CODE TAXE PAR DÉFAUT · Sage porte un taux sur la fiche compte et le
   * propose dès que ce compte est choisi (skill sage-i7,
   * `comptabilite-generale.md`). Le taux reste modifiable : c'est une
   * proposition, pas une contrainte, et une opération exonérée doit rester
   * saisissable sur un compte qui porte habituellement un taux.
   */
  useEffect(() => {
    if (!compteContrepartieTvaId) return;
    const compte = comptes.find((c) => c.id === compteContrepartieTvaId);
    if (compte?.tauxTvaDefautId) setTauxTvaId(compte.tauxTvaDefautId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteContrepartieTvaId, comptes]);

  const choisirEbnl = (operation: OperationSpecifique, modele: ModeleEcriture) => {
    setSelection({ genre: 'ebnl', operation, modele });
    setErreur(null);
    setProposition(null);
    setComptesChoisis({});
    const defauts: Record<string, string> = {};
    for (const p of modele.parametres) {
      if (p.defaut !== undefined) defauts[p.nom] = String(p.defaut);
    }
    setParametres(defauts);
  };

  const calculerEbnl = async (modele: ModeleEcriture, choix: Record<string, string>) => {
    setCalcul(true);
    setErreur(null);
    try {
      const params: Record<string, number> = {};
      for (const p of modele.parametres) {
        const v = Number(parametres[p.nom]);
        if (!Number.isFinite(v)) {
          setErreur(`Le paramètre « ${p.libelle} » doit être renseigné.`);
          setCalcul(false);
          return;
        }
        params[p.nom] = v;
      }
      const prop = await api.post<EcritureProposee>('/operations-specifiques/proposition', {
        codeModele: modele.code,
        parametres: params,
        comptesChoisis: choix,
      });
      setProposition(prop);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Calcul impossible');
    } finally {
      setCalcul(false);
    }
  };

  const insererEbnl = () => {
    if (!proposition) return;
    if (proposition.lignes.some((l) => !l.compteId)) {
      setErreur('Choisissez un compte pour chaque ligne marquée « à choisir », puis recalculez.');
      return;
    }
    onInserer(
      proposition.lignes.map((l) => ({
        compteId: l.compteId!,
        numero: l.numero,
        intitule: l.intitule,
        libelle: l.libelle,
        debit: l.debit,
        credit: l.credit,
      })),
      proposition.libelle,
    );
  };

  const insererSimple = (m: ModeleSimple) => {
    const montantN = Number(montant);
    if (!(montantN > 0)) {
      setErreur('Saisissez le montant.');
      return;
    }
    const tresorerie = comptes.find((c) => c.id === compteTresorerieId);
    const contrepartie = comptes.find((c) => c.numero === m.numeroContrepartie);
    if (!tresorerie) {
      setErreur('Choisissez le compte de trésorerie.');
      return;
    }
    if (!contrepartie) {
      setErreur(`Compte ${m.numeroContrepartie} introuvable dans le plan comptable.`);
      return;
    }
    const recette = m.sens === 'recette';
    onInserer(
      [
        {
          compteId: tresorerie.id,
          numero: tresorerie.numero,
          intitule: tresorerie.intitule,
          libelle: m.libelle,
          debit: recette ? montantN : 0,
          credit: recette ? 0 : montantN,
        },
        {
          compteId: contrepartie.id,
          numero: contrepartie.numero,
          intitule: contrepartie.intitule,
          libelle: m.libelle,
          debit: recette ? 0 : montantN,
          credit: recette ? montantN : 0,
        },
      ],
      m.libelle,
    );
  };

  const insererTva = (m: ModeleTva) => {
    const ht = Number(montant);
    if (!(ht > 0)) {
      setErreur('Saisissez le montant HT.');
      return;
    }
    const tresorerie = comptes.find((c) => c.id === compteTresorerieId);
    const contrepartie = comptes.find((c) => c.id === compteContrepartieTvaId);
    const taux = tauxTvaListe.find((t) => t.id === tauxTvaId);
    if (!tresorerie || !contrepartie || !taux) {
      setErreur('Choisissez le compte de contrepartie, le taux et le compte de trésorerie.');
      return;
    }
    const recette = m.sens === 'recette';
    // ROUTAGE PAR NATURE D'OPÉRATION · le plan SYSCOHADA subdivise 443 et 445,
    // et la modale imputait le compte générique du taux quelle qu'ait été la
    // contrepartie : une prestation vendue collectait en « TVA facturée sur
    // VENTES », un service extérieur déduisait en « TVA récupérable sur
    // ACHATS ». Voir lib/tva-syscohada.ts pour la table et ses sources.
    // `null` = rien à router, le compte du taux fait foi.
    const numeroRoute = compteTvaPourContrepartie(
      utilisateur?.tenant.referentiel,
      recette ? 'recette' : 'depense',
      contrepartie.numero,
      numerosDuPlan,
    );
    const compteRoute = numeroRoute ? comptes.find((c) => c.numero === numeroRoute) : undefined;
    const compteTaxeId = compteRoute?.id ?? (recette ? taux.compteCollecteId : taux.compteDeductibleId);
    const compteTaxe = comptes.find((c) => c.id === compteTaxeId);
    if (!compteTaxeId || !compteTaxe) {
      setErreur(`Le taux ${taux.code} n'a pas de compte de TVA rattaché pour ce sens.`);
      return;
    }
    const tva = arrondi2(ht * (Number(taux.taux) / 100));
    const ttc = arrondi2(ht + tva);
    const lignes: LigneInseree[] = [
      {
        compteId: tresorerie.id,
        numero: tresorerie.numero,
        intitule: tresorerie.intitule,
        libelle: m.libelle,
        debit: recette ? ttc : 0,
        credit: recette ? 0 : ttc,
      },
      {
        compteId: contrepartie.id,
        numero: contrepartie.numero,
        intitule: contrepartie.intitule,
        libelle: m.libelle,
        debit: recette ? 0 : ht,
        credit: recette ? ht : 0,
      },
    ];
    if (tva > 0.005) {
      lignes.push({
        compteId: compteTaxe.id,
        numero: compteTaxe.numero,
        intitule: compteTaxe.intitule,
        libelle: `TVA ${Number(taux.taux)} %`,
        debit: recette ? 0 : tva,
        credit: recette ? tva : 0,
        tauxTvaId: taux.id,
      });
    }
    onInserer(lignes, m.libelle);
  };

  const tauxDisponibles =
    selection?.genre === 'tva'
      ? tauxTvaListe.filter((t) => (selection.modele.code === 'vente_tva' ? t.compteCollecteId : t.compteDeductibleId))
      : [];

  return (
    <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
      <div className="anim-modale w-full max-w-[900px] max-h-[88vh] flex flex-col bg-surface border border-border-dark shadow-flottante">
        <div
          className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px] shrink-0"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <span>Appel d'un modèle de saisie</span>
          <button onClick={onFermer} className="text-white/85 hover:text-white px-1.5">
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Liste des modèles */}
          <div className="w-[300px] shrink-0 border-r border-border overflow-auto bg-surface-alt">
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-text-dim">OPÉRATIONS COURANTES</div>
            {modelesSimples.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => {
                  setSelection({ genre: 'simple', modele: m });
                  setErreur(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-[11px] ${
                  selection?.genre === 'simple' && selection.modele.code === m.code
                    ? 'bg-sel text-white'
                    : 'hover:bg-chrome-alt'
                }`}
              >
                {m.libelle}
              </button>
            ))}
            <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-text-dim">AVEC TVA</div>
            {MODELES_TVA.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => {
                  setSelection({ genre: 'tva', modele: m });
                  setErreur(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-[11px] ${
                  selection?.genre === 'tva' && selection.modele.code === m.code
                    ? 'bg-sel text-white'
                    : 'hover:bg-chrome-alt'
                }`}
              >
                {m.libelle}
              </button>
            ))}
            {/* Famille propre au SYCEBNL · sa route serveur l'est aussi. */}
            {!estSyscohada && (
              <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-text-dim">
                ÉCRITURES-TYPES SYCEBNL (PARTIE 3 · GUIDE)
              </div>
            )}
            {!estSyscohada && !catalogue && (
              <div className="px-3 py-1.5 text-[10.5px] text-text-dim italic">Chargement…</div>
            )}
            {catalogue &&
              [...catalogue.operations, ...catalogue.operationsAutreJeu].map((op) => (
                <div key={op.code}>
                  <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-text-dim">
                    {op.code} · {op.libelle}
                  </div>
                  {op.modeles.map((mo) => (
                    <button
                      key={mo.code}
                      type="button"
                      onClick={() => choisirEbnl(op, mo)}
                      className={`w-full text-left pl-5 pr-3 py-1 text-[10.5px] ${
                        selection?.genre === 'ebnl' && selection.modele.code === mo.code
                          ? 'bg-sel text-white'
                          : 'hover:bg-chrome-alt'
                      }`}
                    >
                      {mo.libelle}
                    </button>
                  ))}
                </div>
              ))}
          </div>

          {/* Paramètres du modèle sélectionné */}
          <div className="flex-1 min-w-0 overflow-auto p-4">
            {!selection && (
              <div className="text-[11px] text-text-dim">
                Sélectionnez un modèle à gauche. Le modèle pré-remplit la pièce en cours de saisie · toutes
                les lignes générées restent modifiables avant enregistrement.
              </div>
            )}

            {selection && (selection.genre === 'simple' || selection.genre === 'tva') && (
              <div className="max-w-[440px]">
                <h3 className="text-[12px] font-bold mb-3">{selection.modele.libelle}</h3>
                <div className="grid grid-cols-[150px_1fr] items-center gap-x-3 gap-y-2.5">
                  <label className="text-[11px] text-right">
                    {selection.genre === 'tva' ? 'Montant HT :' : 'Montant :'}
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    className="border border-border-dark px-2 py-1 text-[12px] font-mono text-right"
                  />

                  {selection.genre === 'tva' && (
                    <>
                      <label className="text-[11px] text-right">
                        {selection.modele.code === 'vente_tva' ? 'Compte de produit :' : 'Compte de charge :'}
                      </label>
                      <select
                        value={compteContrepartieTvaId}
                        onChange={(e) => setCompteContrepartieTvaId(e.target.value)}
                        className="border border-border-dark px-2 py-1 text-[11px]"
                      >
                        <option value="">Sélectionner</option>
                        {(selection.modele.code === 'vente_tva' ? comptesProduits : comptesCharges).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.intitule}
                          </option>
                        ))}
                      </select>
                      <label className="text-[11px] text-right">Taux de TVA :</label>
                      <select
                        value={tauxTvaId}
                        onChange={(e) => setTauxTvaId(e.target.value)}
                        className="border border-border-dark px-2 py-1 text-[11px]"
                      >
                        <option value="">Sélectionner</option>
                        {tauxDisponibles.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} · {t.intitule}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  <label className="text-[11px] text-right">Compte de trésorerie :</label>
                  <select
                    value={compteTresorerieId}
                    onChange={(e) => setCompteTresorerieId(e.target.value)}
                    className="border border-border-dark px-2 py-1 text-[11px]"
                  >
                    {comptesTresorerie.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    selection.genre === 'simple' ? insererSimple(selection.modele) : insererTva(selection.modele)
                  }
                  className="mt-4 bg-sel text-white px-4 py-1.5 text-[11px] font-semibold"
                >
                  Insérer dans la pièce
                </button>
              </div>
            )}

            {selection && selection.genre === 'ebnl' && (
              <div>
                <h3 className="text-[12px] font-bold mb-0.5">{selection.modele.libelle}</h3>
                <p className="text-[10.5px] text-text-dim mb-1">{selection.modele.objet}</p>
                <p className="text-[10px] font-mono text-text-dim mb-3">
                  {selection.modele.source}
                  {selection.modele.applicationGuide && ` · ${selection.modele.applicationGuide}`}
                </p>

                {/* MODÈLE D'APPEL · il débite le 411 Adhérents, ce que le
                    § 5.4.2.1 réserve au dossier qui justifie d'un droit d'agir
                    en recouvrement. Le serveur refuse un dossier à
                    l'encaissement ; le dire AVANT la saisie vaut mieux que de
                    laisser essuyer un 400 après avoir rempli les montants. */}
                {selection.modele.exigeDroitDAgir && catalogue?.methodeCotisations !== 'APPEL' && (
                  <div
                    className={`mb-3 px-2.5 py-2 text-[10.5px] leading-[1.5] border ${
                      catalogue?.methodeCotisations === 'ENCAISSEMENT'
                        ? 'border-danger text-danger'
                        : 'border-border text-text-dim'
                    }`}
                  >
                    {catalogue?.methodeCotisations === 'ENCAISSEMENT' ? (
                      <>
                        Ce dossier constate ses cotisations à l’ENCAISSEMENT · ce modèle sera refusé. Il inscrirait
                        au 411 Adhérents une créance que l’entité n’a aucun moyen de poursuivre (cadre conceptuel
                        § 5.4.2.1).
                      </>
                    ) : (
                      <>
                        Ce modèle constate la créance dès l’appel. Le § 5.4.2.1 le réserve à l’entité qui justifie
                        d’un droit d’agir en recouvrement · la méthode du dossier n’est pas encore renseignée
                        (Structure &gt; Paramètres du dossier).
                      </>
                    )}
                  </div>
                )}

                {selection.modele.parametres.length > 0 && (
                  <div className="grid grid-cols-[220px_180px] items-center gap-x-3 gap-y-2 mb-3">
                    {selection.modele.parametres.map((p) => (
                      <div key={p.nom} className="contents">
                        <label className="text-[11px] text-right" title={p.aide}>
                          {p.libelle} :
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={parametres[p.nom] ?? ''}
                          onChange={(e) => setParametres((prev) => ({ ...prev, [p.nom]: e.target.value }))}
                          className="border border-border-dark px-2 py-1 text-[12px] font-mono text-right"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  disabled={calcul}
                  onClick={() => calculerEbnl(selection.modele, comptesChoisis)}
                  className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3.5 py-1 text-[11px] disabled:opacity-50"
                >
                  {calcul ? 'Calcul…' : "Calculer l'écriture"}
                </button>

                {proposition && (
                  <div className="mt-3 border border-border">
                    <div className="grid grid-cols-[110px_1fr_110px_110px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                      <span>COMPTE</span>
                      <span>LIBELLÉ</span>
                      <span className="text-right">DÉBIT</span>
                      <span className="text-right">CRÉDIT</span>
                    </div>
                    {proposition.lignes.map((l, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[110px_1fr_110px_110px] gap-2 px-3 py-1 border-b border-border text-[10.5px] items-center"
                      >
                        <span className="font-mono">
                          {l.choixRequis ? (
                            <select
                              value={comptesChoisis[l.choixRequis.racine] ?? ''}
                              onChange={(e) => {
                                const choix = { ...comptesChoisis, [l.choixRequis!.racine]: e.target.value };
                                setComptesChoisis(choix);
                                calculerEbnl(selection.modele, choix);
                              }}
                              className="border border-border-dark px-1 py-0.5 text-[10.5px] w-full"
                            >
                              <option value="">{l.numero}… à choisir</option>
                              {l.choixRequis.candidats.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.numero} · {c.intitule}
                                </option>
                              ))}
                            </select>
                          ) : (
                            l.numero
                          )}
                        </span>
                        <span className="truncate" title={`${l.intitule} · ${l.libelle}`}>
                          {l.libelle}
                        </span>
                        <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
                        <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[110px_1fr_110px_110px] gap-2 px-3 py-1.5 bg-surface-alt text-[10.5px] font-bold">
                      <span />
                      <span className="text-right text-[10px] text-text-dim">TOTAUX</span>
                      <span className="font-mono text-right">{proposition.totalDebit.toLocaleString('fr-FR')}</span>
                      <span className="font-mono text-right">{proposition.totalCredit.toLocaleString('fr-FR')}</span>
                    </div>
                  </div>
                )}

                {proposition && (
                  <button
                    type="button"
                    onClick={insererEbnl}
                    className="mt-3 bg-sel text-white px-4 py-1.5 text-[11px] font-semibold"
                  >
                    Insérer dans la pièce
                  </button>
                )}
              </div>
            )}

            {erreur && (
              <div className="mt-3 text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 max-w-[560px]">
                {erreur}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
