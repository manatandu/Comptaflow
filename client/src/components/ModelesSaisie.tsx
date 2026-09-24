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
import { ordonnerLignes } from '../lib/ordre-ecriture';
import { construireLigneTva, montantTva } from '../lib/tva-saisie';

/*
  UNE FACTURE AVEC TVA PASSE PAR UN TIERS, ELLE AUSSI. Ces deux modèles
  soldaient leur écriture sur un compte de trésorerie choisi à l'écran : un
  achat avec TVA créditait la banque du TTC, et le fournisseur n'apparaissait
  nulle part. Le Guide d'application ne présente aucune facture ainsi
  (Partie 1 ch. 2, Applications 1 et 2), et sa recommandation est expresse :
  « contrepartie systématique = 401 pour les achats de biens/services ».

  Chaque modèle porte donc la RACINE de son tiers · l'écran propose les comptes
  ouverts sous cette racine dans le plan du dossier, et le premier d'entre eux
  par défaut.
*/
type ModeleTva = {
  code: 'vente_tva' | 'achat_tva';
  libelle: string;
  sens: 'recette' | 'depense';
  /** 411 pour un client, 401 pour un fournisseur. */
  racineTiers: string;
  suite: string;
};
const MODELES_TVA: ModeleTva[] = [
  {
    code: 'vente_tva',
    libelle: 'Vente avec TVA (facture)',
    sens: 'recette',
    racineTiers: '411',
    suite:
      "La facture crée la CRÉANCE sur le client, TTC. L'encaissement est une seconde écriture, trésorerie au " +
      'débit par le crédit du 411.',
  },
  {
    code: 'achat_tva',
    libelle: 'Achat avec TVA (facture)',
    sens: 'depense',
    racineTiers: '401',
    suite:
      "La facture crée la DETTE envers le fournisseur, TTC. Le règlement est une seconde écriture, 401 au débit " +
      'par le crédit de la trésorerie.',
  },
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
  // Le compte de tiers effectivement choisi · vide tant que l'écran n'a rien
  // proposé, auquel cas le numéro par défaut du modèle s'applique.
  const [compteTiersId, setCompteTiersId] = useState('');
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

  /**
   * UN MODÈLE SIMPLE N'EST PLUS DEUX LIGNES CÂBLÉES · il déroule les lignes
   * que le modèle déclare, chacune avec son rôle. La trésorerie n'apparaît
   * plus que là où le modèle en pose une, c'est-à-dire dans les règlements et
   * dans le don manuel.
   */
  const insererSimple = (m: ModeleSimple) => {
    const montantN = Number(montant);
    if (!(montantN > 0)) {
      setErreur('Saisissez le montant.');
      return;
    }
    const lignes: LigneInseree[] = [];
    for (const l of m.lignes) {
      let compte: Compte | undefined;
      if (l.role === 'TRESORERIE') {
        compte = comptes.find((c) => c.id === compteTresorerieId);
        if (!compte) {
          setErreur('Choisissez le compte de trésorerie.');
          return;
        }
      } else if (l.role === 'TIERS') {
        // Le modèle PROPOSE un numéro, l'écran laisse en choisir un autre sous
        // la même racine · un dossier tient rarement un seul fournisseur.
        compte = comptes.find((c) => c.id === compteTiersId) ?? comptes.find((c) => c.numero === l.numero);
        if (!compte) {
          setErreur(`Compte de tiers ${l.numero} introuvable dans le plan comptable.`);
          return;
        }
      } else {
        compte = comptes.find((c) => c.numero === l.numero);
        if (!compte) {
          setErreur(`Compte ${l.numero} introuvable dans le plan comptable.`);
          return;
        }
      }
      lignes.push({
        compteId: compte.id,
        numero: compte.numero,
        intitule: compte.intitule,
        libelle: m.libelle,
        debit: l.sens === 'DEBIT' ? montantN : 0,
        credit: l.sens === 'CREDIT' ? montantN : 0,
      });
    }
    onInserer(ordonnerLignes(lignes), m.libelle);
  };

  const insererTva = (m: ModeleTva) => {
    const ht = Number(montant);
    if (!(ht > 0)) {
      setErreur('Saisissez le montant HT.');
      return;
    }
    // LE TIERS, PAS LA TRÉSORERIE · une facture avec TVA crée une dette ou une
    // créance. Le guide met « 401 Fournisseurs » au crédit d'un achat
    // (Partie 1 ch. 2 § 1.1) et « 4111 Client » au débit d'une vente
    // (Application 2), la trésorerie n'y figurant ni dans un cas ni dans
    // l'autre. Le règlement est une écriture distincte.
    const tiers = comptes.find((c) => c.id === compteTiersId) ?? comptes.find((c) => c.numero === numeroTiersDefaut);
    const contrepartie = comptes.find((c) => c.id === compteContrepartieTvaId);
    const taux = tauxTvaListe.find((t) => t.id === tauxTvaId);
    if (!tiers || !contrepartie || !taux) {
      setErreur('Choisissez le compte de tiers, le compte de contrepartie et le taux.');
      return;
    }
    const recette = m.sens === 'recette';
    // LA RÈGLE VIT DANS `lib/tva-saisie.ts` · routage du compte de taxe selon
    // la nature de la contrepartie, arrondi, ligne au taux zéro. La grille de
    // saisie appelle la même, et c'est ce qui les empêche de proposer deux TVA
    // différentes sur la même facture.
    const resultat = construireLigneTva({
      referentiel: utilisateur?.tenant.referentiel,
      sens: recette ? 'recette' : 'depense',
      contrepartie,
      ht,
      taux,
      comptes,
      numerosDuPlan,
    });
    // Une taxe nulle ne rend pas de ligne, et ce n'est PAS une erreur : les
    // deux lignes de l'opération restent justes. Seul un compte de taxe
    // manquant arrête la modale · c'est un paramétrage à faire, pas un
    // résultat.
    if (resultat.raison === 'SANS_COMPTE') {
      setErreur(resultat.motif);
      return;
    }
    const tva = montantTva(ht, taux);
    const ttc = arrondi2(ht + tva);
    const lignes: LigneInseree[] = [
      {
        compteId: tiers.id,
        numero: tiers.numero,
        intitule: tiers.intitule,
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
    /*
      LA LIGNE DE TVA AU TAUX ZÉRO DOIT EXISTER, ET C'EST TOUT L'ENJEU DU
      PRORATA D'UN EXPORTATEUR.

      L'article 43 de l'O.-L. n° 10/001 met au numérateur « le montant annuel
      des recettes afférentes aux opérations ouvrant droit à déduction de la
      taxe sur la valeur ajoutée, Y COMPRIS LES EXPORTATIONS ET OPÉRATIONS
      ASSIMILÉES ». Une exportation est taxée au taux zéro : elle ouvre donc
      le droit à déduction comme une vente taxée à 16 %.

      Côté serveur, `calculerProrata` reconnaît une opération au taux zéro par
      la LIGNE DE TVA qui porte ce taux, puis reprend au numérateur le crédit
      de classe 7 de l'écriture. Sans cette ligne, il ne voit qu'un crédit de
      produit nu, et il ne PEUT pas distinguer une exportation d'une recette
      exonérée · il ne devine donc pas, il compte cette recette comme non
      qualifiée et le dit.

      Le montant nul ne dérange rien : l'écriture reste équilibrée, et aucune
      règle n'interdit une ligne à zéro. Ce qu'elle porte, c'est le
      `tauxTvaId`, c'est-à-dire la QUALIFICATION de l'opération.

      La condition distingue deux zéros que l'ancienne rédaction confondait :
      un taux nul, qui qualifie l'opération et doit laisser une trace, et une
      taxe nulle faute de base, qui ne qualifie rien.
    */
    if (resultat.ligne) lignes.push(resultat.ligne);
    // L'ORDRE DE LECTURE · débits puis crédits, la TVA après le compte de
    // nature. Sans ce tri, un achat sortait tiers d'abord, puis charge, puis
    // taxe · l'inverse de l'Application 1 du guide.
    onInserer(ordonnerLignes(lignes), m.libelle);
  };

  /*
    CE QUE LE MODÈLE CHOISI RÉCLAME À L'ÉCRAN · un tiers, une trésorerie, ou
    les deux. Poser la question de la trésorerie sur une facture d'achat était
    la trace visible du défaut : l'écran demandait une banque pour une écriture
    où aucune banque ne joue.
  */
  const ligneTiers =
    selection?.genre === 'simple' ? selection.modele.lignes.find((l) => l.role === 'TIERS') : undefined;
  const racineTiers =
    selection?.genre === 'tva'
      ? selection.modele.racineTiers
      : ligneTiers?.numero
        ? ligneTiers.numero.replace(/0+$/, '').slice(0, 3)
        : null;
  const numeroTiersDefaut = selection?.genre === 'simple' ? (ligneTiers?.numero ?? null) : null;
  const comptesTiers = useMemo(
    () => (racineTiers ? comptes.filter((c) => c.numero.startsWith(racineTiers)) : []),
    [comptes, racineTiers],
  );
  const utiliseTresorerie =
    selection?.genre === 'simple' && selection.modele.lignes.some((l) => l.role === 'TRESORERIE');

  // Le premier compte ouvert sous la racine, dès qu'un modèle à tiers est
  // choisi · on ne laisse pas un sélecteur vide bloquer l'insertion.
  useEffect(() => {
    if (comptesTiers.length > 0 && !comptesTiers.some((c) => c.id === compteTiersId)) {
      setCompteTiersId(comptesTiers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comptesTiers]);

  const tauxDisponibles =
    selection?.genre === 'tva'
      ? tauxTvaListe.filter((t) => (selection.modele.code === 'vente_tva' ? t.compteCollecteId : t.compteDeductibleId))
      : [];

  return (
    <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
      <div className="anim-modale w-full max-w-[900px] max-h-[88vh] flex flex-col bg-surface border border-border-dark shadow-flottante">
        <div
          className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[12px] shrink-0"
        >
          <span>Appel d'un modèle de saisie</span>
          <button onClick={onFermer} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* Liste des modèles */}
          <div className="w-[300px] shrink-0 border-r border-border overflow-auto bg-surface-alt">
            <div className="px-3 pt-2.5 pb-1 text-[11px] font-bold text-text-dim">Opérations courantes</div>
            {modelesSimples.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => {
                  setSelection({ genre: 'simple', modele: m });
                  setErreur(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-[12.5px] ${
                  selection?.genre === 'simple' && selection.modele.code === m.code
                    ? 'bg-sel text-white'
                    : 'hover:bg-chrome-alt'
                }`}
              >
                {m.libelle}
              </button>
            ))}
            <div className="px-3 pt-2.5 pb-1 text-[11px] font-bold text-text-dim">Avec TVA</div>
            {MODELES_TVA.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => {
                  setSelection({ genre: 'tva', modele: m });
                  setErreur(null);
                }}
                className={`w-full text-left px-3 py-1.5 text-[12.5px] ${
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
              <div className="px-3 pt-2.5 pb-1 text-[11px] font-bold text-text-dim">
                Écritures-types SYCEBNL (partie 3 · guide)
              </div>
            )}
            {!estSyscohada && !catalogue && (
              <div className="px-3 py-1.5 text-[12px] text-text-dim italic">Chargement…</div>
            )}
            {catalogue &&
              [...catalogue.operations, ...catalogue.operationsAutreJeu].map((op) => (
                <div key={op.code}>
                  <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold text-text-dim">
                    {op.code} · {op.libelle}
                  </div>
                  {op.modeles.map((mo) => (
                    <button
                      key={mo.code}
                      type="button"
                      onClick={() => choisirEbnl(op, mo)}
                      className={`w-full text-left pl-5 pr-3 py-1 text-[12px] ${
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
              <div className="text-[12.5px] text-text-dim">
                Sélectionnez un modèle à gauche. Le modèle pré-remplit la pièce en cours de saisie · toutes
                les lignes générées restent modifiables avant enregistrement.
              </div>
            )}

            {selection && (selection.genre === 'simple' || selection.genre === 'tva') && (
              <div className="max-w-[440px]">
                <h3 className="text-[13px] font-bold mb-0.5">{selection.modele.libelle}</h3>
                {selection.genre === 'simple' && (
                  <p className="text-[12px] text-text-dim mb-3">
                    Se saisit au journal des {selection.modele.journal.toLowerCase()}.
                  </p>
                )}
                {selection.genre === 'tva' && <p className="text-[12px] text-text-dim mb-3">Facture.</p>}
                <div className="grid grid-cols-[150px_1fr] items-center gap-x-3 gap-y-2.5">
                  <label className="text-[12.5px] text-right">
                    {selection.genre === 'tva' ? 'Montant HT :' : 'Montant :'}
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    className="border border-border-dark px-2 py-1 text-[13px] font-mono text-right"
                  />

                  {selection.genre === 'tva' && (
                    <>
                      <label className="text-[12.5px] text-right">
                        {selection.modele.code === 'vente_tva' ? 'Compte de produit :' : 'Compte de charge :'}
                      </label>
                      <select
                        value={compteContrepartieTvaId}
                        onChange={(e) => setCompteContrepartieTvaId(e.target.value)}
                        className="border border-border-dark px-2 py-1 text-[12.5px]"
                      >
                        <option value="">Sélectionner</option>
                        {(selection.modele.code === 'vente_tva' ? comptesProduits : comptesCharges).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.intitule}
                          </option>
                        ))}
                      </select>
                      <label className="text-[12.5px] text-right">Taux de TVA :</label>
                      <select
                        value={tauxTvaId}
                        onChange={(e) => setTauxTvaId(e.target.value)}
                        className="border border-border-dark px-2 py-1 text-[12.5px]"
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

                  {comptesTiers.length > 0 && (
                    <>
                      <label className="text-[12.5px] text-right">
                        {racineTiers === '401'
                          ? 'Fournisseur :'
                          : racineTiers === '411'
                            ? 'Client ou adhérent :'
                            : racineTiers === '422'
                              ? 'Compte de personnel :'
                              : 'Compte de tiers :'}
                      </label>
                      <select
                        value={compteTiersId}
                        onChange={(e) => setCompteTiersId(e.target.value)}
                        className="border border-border-dark px-2 py-1 text-[12.5px]"
                      >
                        {comptesTiers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.intitule}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {racineTiers && comptesTiers.length === 0 && (
                    <div className="col-span-2 border border-danger/50 bg-danger/5 px-2.5 py-2 text-[12px] leading-[1.5]">
                      Aucun compte n'est ouvert sous la racine {racineTiers} dans le plan de ce dossier. Cette
                      opération passe OBLIGATOIREMENT par un compte de tiers · ouvrez-le au plan comptable avant
                      d'employer ce modèle.
                    </div>
                  )}

                  {utiliseTresorerie && (
                    <>
                      <label className="text-[12.5px] text-right">Compte de trésorerie :</label>
                      <select
                        value={compteTresorerieId}
                        onChange={(e) => setCompteTresorerieId(e.target.value)}
                        className="border border-border-dark px-2 py-1 text-[12.5px]"
                      >
                        {comptesTresorerie.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.numero} · {c.intitule}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>

                {/*
                  CE QUE LE MODÈLE NE FAIT PAS, DIT AVANT L'INSERTION. Une
                  facture n'est que la première moitié de l'opération, et le
                  logiciel ne devine pas la seconde · il la nomme.
                */}
                {selection.modele.suite && (
                  <div className="mt-3 border border-border bg-surface-alt px-2.5 py-2 text-[12px] leading-[1.55]">
                    {selection.modele.suite}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() =>
                    selection.genre === 'simple' ? insererSimple(selection.modele) : insererTva(selection.modele)
                  }
                  className="mt-4 bg-sel text-white px-4 py-1.5 text-[12.5px] font-semibold"
                >
                  Insérer dans la pièce
                </button>
              </div>
            )}

            {selection && selection.genre === 'ebnl' && (
              <div>
                <h3 className="text-[13px] font-bold mb-0.5">{selection.modele.libelle}</h3>
                <p className="text-[12px] text-text-dim mb-1">{selection.modele.objet}</p>
                <p className="text-[11px] font-mono text-text-dim mb-3">
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
                    className={`mb-3 px-2.5 py-2 text-[12px] leading-[1.5] border ${
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
                        <label className="text-[12.5px] text-right" title={p.aide}>
                          {p.libelle} :
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={parametres[p.nom] ?? ''}
                          onChange={(e) => setParametres((prev) => ({ ...prev, [p.nom]: e.target.value }))}
                          className="border border-border-dark px-2 py-1 text-[13px] font-mono text-right"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  disabled={calcul}
                  onClick={() => calculerEbnl(selection.modele, comptesChoisis)}
                  className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3.5 py-1 text-[12.5px] disabled:opacity-50"
                >
                  {calcul ? 'Calcul…' : "Calculer l'écriture"}
                </button>

                {proposition && (
                  <div className="mt-3 border border-border">
                    <div className="entete-colonnes grid grid-cols-[110px_1fr_110px_110px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border text-[11px] font-bold text-text-dim">
                      <span>Compte</span>
                      <span>Libellé</span>
                      <span className="text-right">Débit</span>
                      <span className="text-right">Crédit</span>
                    </div>
                    {proposition.lignes.map((l, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[110px_1fr_110px_110px] gap-2 px-3 py-1 border-b border-border text-[12px] items-center"
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
                              className="border border-border-dark px-1 py-0.5 text-[12px] w-full"
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
                    <div className="grid grid-cols-[110px_1fr_110px_110px] gap-2 px-3 py-1.5 bg-surface-alt text-[12px] font-bold">
                      <span />
                      <span className="text-right text-[11px] text-text-dim">Totaux</span>
                      <span className="font-mono text-right">{proposition.totalDebit.toLocaleString('fr-FR')}</span>
                      <span className="font-mono text-right">{proposition.totalCredit.toLocaleString('fr-FR')}</span>
                    </div>
                  </div>
                )}

                {proposition && (
                  <button
                    type="button"
                    onClick={insererEbnl}
                    className="mt-3 bg-sel text-white px-4 py-1.5 text-[12.5px] font-semibold"
                  >
                    Insérer dans la pièce
                  </button>
                )}
              </div>
            )}

            {erreur && (
              <div className="mt-3 text-[12.5px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 max-w-[560px]">
                {erreur}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
