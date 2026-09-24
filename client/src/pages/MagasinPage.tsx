import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import type { Journal } from '../lib/types';

/**
 * LE MAGASIN · la fiche de stock, article par article, et la confrontation au
 * comptage physique.
 *
 * CE QUE LA FICHE VEUT DIRE DÉPEND DU MODE DE TENUE, et l'écran le dit en
 * tête. En inventaire PERMANENT, elle est l'inventaire COMPTABLE : son stock
 * doit égaler le solde du compte, et l'écart avec le comptage est un boni ou
 * un mali. En inventaire INTERMITTENT, elle est EXTRA-COMPTABLE : aucune
 * écriture ne la suit, et ce qu'elle produit à la clôture est le stock final
 * de l'écriture de variation.
 *
 * UNE SORTIE NE PORTE JAMAIS SON PRIX · la colonne est calculée, jamais
 * saisissable. C'est la règle qui fonde les trois méthodes admises, et le
 * serveur la refuse aussi (§ 6 · le cloisonnement se pose aux deux bouts).
 */

type Methode = 'PEPS' | 'CMPACE' | 'CMP_PERIODE_STOCKAGE';
type Mode = 'PERMANENT' | 'INTERMITTENT' | null;

interface ArticleResume {
  id: string;
  code: string;
  designation: string;
  uniteMesure: string;
  methodeValorisation: Methode;
  actif: boolean;
  compte: { numero: string; intitule: string };
  nombreMouvements: number;
}

interface ListeArticles {
  referentiel: 'SYCEBNL' | 'SYSCOHADA';
  modeInventaire: Mode;
  reserve: string | null;
  articles: ArticleResume[];
}

interface LigneFiche {
  id: string;
  date: string;
  ordre: number;
  sens: 'ENTREE' | 'SORTIE';
  piece: string;
  libelle: string | null;
  quantite: number;
  valeur: number | null;
  coutUnitaire: number | null;
  quantiteApres: number | null;
  valeurApres: number | null;
  ecritureId: string | null;
  ecritureManquante: boolean;
}

interface Fiche {
  article: ArticleResume;
  modeInventaire: Mode;
  lignes: LigneFiche[];
  totaux: {
    quantiteFinale: number;
    valeurFinale: number;
    totalEntrees: number;
    totalSorties: number;
    quantiteEntree: number;
    quantiteSortie: number;
  };
  refus: { ordre: number | null; motif: string; explication: string }[];
}

interface Difference {
  articleId: string;
  code: string;
  designation: string;
  uniteMesure: string;
  compteNumero: string;
  sens: 'BONI' | 'MALI';
  quantiteComptable: number;
  quantitePhysique: number;
  ecartQuantite: number;
  coutUnitaireRetenu: number;
  montant: number;
  fondementDuCout: string;
  compteVariation: string;
}

interface Confrontation {
  modeInventaire: Mode;
  reserve: string | null;
  confrontation: {
    differences: Difference[];
    sansDifference: { articleId: string; code: string; quantite: number }[];
    refus: { articleId: string | null; code: string | null; motif: string; explication: string }[];
    totalBoni: number;
    totalMali: number;
    lignes: { compte: string; sens: 'DEBIT' | 'CREDIT'; montant: number; libelle: string }[];
  } | null;
}

interface CompteStock {
  id: string;
  numero: string;
  intitule: string;
  classe: string;
  typeCompte: string;
}

const mt = (n: number | null) =>
  n === null ? '' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qt = (n: number | null) =>
  n === null ? '' : n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const LIBELLE_METHODE: Record<Methode, string> = {
  PEPS: 'Premier entré, premier sorti (P.E.P.S.)',
  CMPACE: 'Coût moyen pondéré après chaque entrée (C.M.P.A.C.E.)',
  CMP_PERIODE_STOCKAGE: 'Coût moyen de période de stockage',
};

export function MagasinPage() {
  const { exerciceCourant } = useExercice();
  // La confrontation au comptage reste offerte à la lecture seule : le serveur
  // la lui ouvre (elle calcule, n'écrit rien), et c'est précisément ce qu'un
  // auditeur vient vérifier. Seules la création d'article, la saisie de
  // mouvement et la régularisation lui sont retirées.
  const { peutEcrire } = useAuth();
  const [liste, setListe] = useState<ListeArticles | null>(null);
  const [comptes, setComptes] = useState<CompteStock[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [selection, setSelection] = useState<string>('');
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [onglet, setOnglet] = useState<'fiche' | 'inventaire'>('fiche');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Création d'article
  const [nouveau, setNouveau] = useState({
    compteId: '',
    code: '',
    designation: '',
    uniteMesure: '',
    methodeValorisation: '' as '' | Methode,
  });

  // Saisie de mouvement
  const [mvt, setMvt] = useState({
    date: '',
    sens: 'ENTREE' as 'ENTREE' | 'SORTIE',
    quantite: '',
    cout: '',
    piece: '',
    libelle: '',
  });

  // Comptage physique
  const [comptages, setComptages] = useState<Record<string, string>>({});
  const [coutsBoni, setCoutsBoni] = useState<Record<string, { cout: string; source: string }>>({});
  const [confrontation, setConfrontation] = useState<Confrontation | null>(null);
  const [regul, setRegul] = useState({ journalId: '', date: '', reference: '' });

  const chargerListe = useCallback(() => {
    api.get<ListeArticles>('/magasin/articles').then(setListe, (e: ApiError) => setErreur(e.message));
  }, []);

  useEffect(chargerListe, [chargerListe]);

  useEffect(() => {
    api
      .get<CompteStock[]>('/comptes')
      .then(
        (tous) => setComptes(tous.filter((c) => c.classe === 'CLASSE_3' && c.typeCompte === 'DETAIL')),
        () => undefined,
      );
    api.get<Journal[]>('/journaux').then(setJournaux, () => undefined);
  }, []);

  useEffect(() => {
    if (exerciceCourant) {
      if (!mvt.date) setMvt((m) => ({ ...m, date: exerciceCourant.dateFin.slice(0, 10) }));
      if (!regul.date) setRegul((r) => ({ ...r, date: exerciceCourant.dateFin.slice(0, 10) }));
    }
  }, [exerciceCourant, mvt.date, regul.date]);

  const chargerFiche = useCallback((articleId: string) => {
    if (!articleId) {
      setFiche(null);
      return;
    }
    api
      .get<Fiche>(`/magasin/articles/${articleId}/fiche`)
      .then(setFiche, (e: ApiError) => setErreur(e.message));
  }, []);

  useEffect(() => chargerFiche(selection), [selection, chargerFiche]);

  const creerArticle = async () => {
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      const cree = await api.post<{ id: string }>('/magasin/articles', {
        compteId: nouveau.compteId,
        code: nouveau.code.trim(),
        designation: nouveau.designation.trim(),
        uniteMesure: nouveau.uniteMesure.trim(),
        methodeValorisation: nouveau.methodeValorisation,
      });
      setSucces(`Article ${nouveau.code} créé.`);
      setNouveau({ compteId: '', code: '', designation: '', uniteMesure: '', methodeValorisation: '' });
      chargerListe();
      setSelection(cree.id);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Création impossible');
    } finally {
      setEnCours(false);
    }
  };

  const ajouterMouvement = async () => {
    if (!selection) return;
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      await api.post(`/magasin/articles/${selection}/mouvements`, {
        date: mvt.date,
        sens: mvt.sens,
        quantite: Number(mvt.quantite),
        // LE COÛT N'EST ENVOYÉ QUE SUR UNE ENTRÉE · sur une sortie, le serveur
        // le REFUSE, et c'est voulu : un coût stocké puis ignoré ferait
        // cohabiter sur la fiche un montant saisi et un montant calculé sans
        // dire lequel fait foi.
        ...(mvt.sens === 'ENTREE' ? { cout: Number(mvt.cout) } : {}),
        piece: mvt.piece.trim(),
        libelle: mvt.libelle.trim() || undefined,
      });
      setSucces('Mouvement enregistré.');
      setMvt((m) => ({ ...m, quantite: '', cout: '', piece: '', libelle: '' }));
      chargerFiche(selection);
      chargerListe();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const corpsComptages = useMemo(
    () =>
      Object.entries(comptages)
        .filter(([, v]) => v.trim() !== '')
        .map(([articleId, v]) => ({
          articleId,
          quantitePhysique: Number(v),
          ...(coutsBoni[articleId]?.cout
            ? {
                coutUnitaireBoni: Number(coutsBoni[articleId].cout),
                sourceCoutBoni: coutsBoni[articleId].source || undefined,
              }
            : {}),
        })),
    [comptages, coutsBoni],
  );

  const confronter = async () => {
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      setConfrontation(
        await api.post<Confrontation>('/magasin/inventaire/confrontation', {
          comptages: corpsComptages,
        }),
      );
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Confrontation impossible');
    } finally {
      setEnCours(false);
    }
  };

  const enregistrerRegularisation = async () => {
    if (!exerciceCourant || !regul.journalId) return;
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      const ecriture = await api.post<{ numeroPiece: string }>('/magasin/inventaire/regularisation', {
        comptages: corpsComptages,
        exerciceId: exerciceCourant.id,
        journalId: regul.journalId,
        date: regul.date,
        reference: regul.reference.trim() || undefined,
      });
      setSucces(`Écriture ${ecriture.numeroPiece} enregistrée.`);
      setConfrontation(null);
      setComptages({});
      chargerListe();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const c = confrontation?.confrontation;
  const champ =
    'border border-border bg-surface px-1.5 py-1 text-[12px] w-full focus:outline-none focus:border-accent';
  const cell = 'px-2 py-1 border border-border';

  return (
    <div className="p-2">
      <EnteteImpression titre="Magasin · fiches de stock" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[11px] font-mono text-text-dim leading-none">
          {liste?.modeInventaire === 'PERMANENT'
            ? 'INVENTAIRE PERMANENT'
            : liste?.modeInventaire === 'INTERMITTENT'
              ? 'INVENTAIRE INTERMITTENT'
              : 'MODE DE TENUE NON DÉCLARÉ'}
        </div>
        <h1 className="text-[13px] font-bold leading-tight">Magasin</h1>
        <div className="text-[11px] text-text-dim mt-0.5">
          {liste?.modeInventaire === 'PERMANENT'
            ? "Les fiches sont l'inventaire COMPTABLE du dossier : leur stock doit égaler le solde du compte, et l'écart avec le comptage physique est un boni ou un mali d'inventaire."
            : "Les fiches sont EXTRA-COMPTABLES : aucune écriture ne les suit, et ce qu'elles produisent à la clôture est le stock final de l'écriture de variation."}
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {erreur}
        </div>
      )}
      {succes && (
        <div className="border border-ok/30 bg-ok-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {succes}
        </div>
      )}
      {liste?.reserve && (
        <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5 text-[12px] max-w-[1240px]">
          {liste.reserve}
        </div>
      )}

      <div className="ecran-seul flex gap-1 mb-2 max-w-[1240px]">
        {(
          [
            ['fiche', 'Articles et fiche de stock'],
            ['inventaire', "Comptage et différences d'inventaire"],
          ] as const
        ).map(([id, titre]) => (
          <button
            key={id}
            type="button"
            onClick={() => setOnglet(id)}
            className={`px-3 py-1 text-[12px] border ${
              onglet === id
                ? 'border-accent bg-accent/10 font-semibold'
                : 'border-border bg-surface-2 text-text-dim'
            }`}
          >
            {titre}
          </button>
        ))}
      </div>

      {onglet === 'fiche' && (
        <div className="max-w-[1240px]">
          {peutEcrire && (
            <div className="ecran-seul border border-border bg-surface-2 px-3 py-2.5 mb-2.5">
              <div className="text-[12px] font-semibold mb-1.5">Nouvel article</div>
              <div className="grid grid-cols-5 gap-2">
                <select
                  className={champ}
                  value={nouveau.compteId}
                  onChange={(e) => setNouveau({ ...nouveau, compteId: e.target.value })}
                >
                  <option value="">Compte de stock…</option>
                  {comptes.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.numero} {k.intitule}
                    </option>
                  ))}
                </select>
                <input
                  className={champ}
                  placeholder="Code"
                  value={nouveau.code}
                  onChange={(e) => setNouveau({ ...nouveau, code: e.target.value })}
                />
                <input
                  className={champ}
                  placeholder="Désignation"
                  value={nouveau.designation}
                  onChange={(e) => setNouveau({ ...nouveau, designation: e.target.value })}
                />
                <input
                  className={champ}
                  placeholder="Unité (sac, litre…)"
                  value={nouveau.uniteMesure}
                  onChange={(e) => setNouveau({ ...nouveau, uniteMesure: e.target.value })}
                />
                <select
                  className={champ}
                  value={nouveau.methodeValorisation}
                  onChange={(e) =>
                    setNouveau({ ...nouveau, methodeValorisation: e.target.value as Methode })
                  }
                >
                  {/* AUCUNE VALEUR PAR DÉFAUT · le glossaire exige que « celle
                      qui est retenue » soit mentionnée en Notes annexes, et une
                      méthode posée d'office ferait publier une mention que
                      personne n'a décidée. */}
                  <option value="">Méthode de valorisation…</option>
                  <option value="PEPS">P.E.P.S.</option>
                  <option value="CMPACE">C.M.P.A.C.E.</option>
                  <option value="CMP_PERIODE_STOCKAGE">c.M.P. de période de stockage</option>
                </select>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={
                    enCours ||
                    !nouveau.compteId ||
                    !nouveau.code.trim() ||
                    !nouveau.designation.trim() ||
                    !nouveau.uniteMesure.trim() ||
                    !nouveau.methodeValorisation
                  }
                  onClick={creerArticle}
                  className="px-3 py-1 text-[12px] border border-accent bg-accent/10 disabled:opacity-40"
                >
                  Créer l'article
                </button>
                <span className="text-[10.5px] text-text-dim">
                  Trois méthodes seulement sont admises (AUDCIF Titre VI). Le coût moyen pondéré ANNUEL
                  et le D.E.P.S. n'en font pas partie.
                </span>
              </div>
            </div>
          )}

          <table className="w-full border-collapse text-[12px] mb-2.5">
            <thead>
              <tr className="bg-surface-2 text-text-dim">
                <th className={`${cell} text-left font-semibold`}>Code</th>
                <th className={`${cell} text-left font-semibold`}>Désignation</th>
                <th className={`${cell} text-left font-semibold`}>Unité</th>
                <th className={`${cell} text-left font-semibold`}>Compte</th>
                <th className={`${cell} text-left font-semibold`}>Méthode</th>
                <th className={`${cell} text-right font-semibold`}>Mouvements</th>
              </tr>
            </thead>
            <tbody>
              {liste?.articles.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelection(a.id)}
                  className={`cursor-pointer ${selection === a.id ? 'bg-accent/10' : ''}`}
                >
                  <td className={`${cell} font-mono`}>{a.code}</td>
                  <td className={cell}>{a.designation}</td>
                  <td className={cell}>{a.uniteMesure}</td>
                  <td className={`${cell} font-mono`}>{a.compte.numero}</td>
                  <td className={cell}>{LIBELLE_METHODE[a.methodeValorisation]}</td>
                  <td className={`${cell} text-right font-mono`}>{a.nombreMouvements}</td>
                </tr>
              ))}
              {liste?.articles.length === 0 && (
                <tr>
                  <td className={`${cell} text-text-dim`} colSpan={6}>
                    Aucun article. Une fiche de stock est tenue PAR ARTICLE.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {fiche && (
            <>
              <div className="text-[12.5px] font-bold mb-1">
                Fiche de stock · {fiche.article.code} {fiche.article.designation} (
                {fiche.article.uniteMesure})
              </div>
              <div className="text-[10.5px] text-text-dim mb-1.5">
                {LIBELLE_METHODE[fiche.article.methodeValorisation]} · compte{' '}
                {fiche.article.compte.numero} {fiche.article.compte.intitule}
              </div>

              {fiche.refus.map((r) => (
                <div
                  key={`${r.motif}-${r.ordre}`}
                  className="border border-danger/30 bg-danger-soft px-3 py-2 mb-2 text-[11px]"
                >
                  {r.explication}
                </div>
              ))}

              <table className="w-full border-collapse text-[12px] mb-2.5">
                <thead>
                  <tr className="bg-surface-2 text-text-dim">
                    <th className={`${cell} text-left font-semibold`} rowSpan={2}>
                      Date
                    </th>
                    <th className={`${cell} text-left font-semibold`} rowSpan={2}>
                      Mouvement
                    </th>
                    <th className={`${cell} text-center font-semibold`} colSpan={3}>
                      Entrées
                    </th>
                    <th className={`${cell} text-center font-semibold`} colSpan={3}>
                      Sorties
                    </th>
                    <th className={`${cell} text-center font-semibold`} colSpan={3}>
                      Stock
                    </th>
                  </tr>
                  <tr className="bg-surface-2 text-text-dim">
                    {['Qté', 'P.U.', 'Montant', 'Qté', 'P.U.', 'Montant', 'Qté', 'P.U.M.', 'Valeur'].map(
                      (t, i) => (
                        <th key={`${t}-${i}`} className={`${cell} text-right font-semibold`}>
                          {t}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {fiche.lignes.map((l) => (
                    <tr key={l.id}>
                      <td className={`${cell} font-mono`}>{l.date}</td>
                      <td className={cell}>
                        {l.piece}
                        {l.libelle ? ` · ${l.libelle}` : ''}
                        {l.ecritureManquante && (
                          <span className="ml-1 text-warning" title="Inventaire permanent · aucune écriture ne porte ce mouvement">
                            (sans écriture)
                          </span>
                        )}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'ENTREE' ? qt(l.quantite) : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'ENTREE' ? mt(l.coutUnitaire) : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'ENTREE' ? mt(l.valeur) : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'SORTIE' ? qt(l.quantite) : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'SORTIE' ? mt(l.coutUnitaire) : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.sens === 'SORTIE' ? mt(l.valeur) : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>{qt(l.quantiteApres)}</td>
                      <td className={`${cell} text-right font-mono`}>
                        {l.quantiteApres && l.valeurApres !== null
                          ? mt(l.valeurApres / l.quantiteApres)
                          : ''}
                      </td>
                      <td className={`${cell} text-right font-mono`}>{mt(l.valeurApres)}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-2 font-semibold">
                    <td className={cell} colSpan={2}>
                      Totaux de la période
                    </td>
                    <td className={`${cell} text-right font-mono`}>
                      {qt(fiche.totaux.quantiteEntree)}
                    </td>
                    <td className={cell} />
                    <td className={`${cell} text-right font-mono`}>{mt(fiche.totaux.totalEntrees)}</td>
                    <td className={`${cell} text-right font-mono`}>
                      {qt(fiche.totaux.quantiteSortie)}
                    </td>
                    <td className={cell} />
                    <td className={`${cell} text-right font-mono`}>{mt(fiche.totaux.totalSorties)}</td>
                    <td className={`${cell} text-right font-mono`}>{qt(fiche.totaux.quantiteFinale)}</td>
                    <td className={cell} />
                    <td className={`${cell} text-right font-mono`}>{mt(fiche.totaux.valeurFinale)}</td>
                  </tr>
                </tbody>
              </table>

              {/* LA VÉRIFICATION SE FAIT EN DEUX DIMENSIONS · un stock est une
                  quantité ET une valeur, et une fiche dont la valeur boucle sur
                  une quantité fausse est une fiche fausse. */}
              <div className="border border-border bg-surface-2 px-3 py-2 mb-2.5 text-[11px]">
                <span className="font-semibold">Vérification · </span>
                en quantité, {qt(fiche.totaux.quantiteEntree)} entrées moins{' '}
                {qt(fiche.totaux.quantiteSortie)} sorties = {qt(fiche.totaux.quantiteFinale)} en stock.
                En valeur, {mt(fiche.totaux.totalEntrees)} moins {mt(fiche.totaux.totalSorties)} ={' '}
                {mt(fiche.totaux.valeurFinale)}.
              </div>

              {peutEcrire && (
                <div className="ecran-seul border border-border bg-surface-2 px-3 py-2.5 mb-2.5">
                  <div className="text-[12px] font-semibold mb-1.5">Nouveau mouvement</div>
                  <div className="grid grid-cols-6 gap-2">
                    <input
                      type="date"
                      className={champ}
                      value={mvt.date}
                      onChange={(e) => setMvt({ ...mvt, date: e.target.value })}
                    />
                    <select
                      className={champ}
                      value={mvt.sens}
                      onChange={(e) => setMvt({ ...mvt, sens: e.target.value as 'ENTREE' | 'SORTIE' })}
                    >
                      <option value="ENTREE">Entrée</option>
                      <option value="SORTIE">Sortie</option>
                    </select>
                    <input
                      className={champ}
                      placeholder="Quantité"
                      value={mvt.quantite}
                      onChange={(e) => setMvt({ ...mvt, quantite: e.target.value })}
                    />
                    <input
                      className={champ}
                      placeholder={mvt.sens === 'ENTREE' ? "Coût total d'entrée" : 'calculé'}
                      disabled={mvt.sens === 'SORTIE'}
                      value={mvt.sens === 'SORTIE' ? '' : mvt.cout}
                      onChange={(e) => setMvt({ ...mvt, cout: e.target.value })}
                    />
                    <input
                      className={champ}
                      placeholder="Pièce (bon, facture)"
                      value={mvt.piece}
                      onChange={(e) => setMvt({ ...mvt, piece: e.target.value })}
                    />
                    <input
                      className={champ}
                      placeholder="Libellé"
                      value={mvt.libelle}
                      onChange={(e) => setMvt({ ...mvt, libelle: e.target.value })}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={
                        enCours ||
                        !mvt.date ||
                        !mvt.quantite ||
                        !mvt.piece.trim() ||
                        (mvt.sens === 'ENTREE' && !mvt.cout)
                      }
                      onClick={ajouterMouvement}
                      className="px-3 py-1 text-[12px] border border-accent bg-accent/10 disabled:opacity-40"
                    >
                      Enregistrer le mouvement
                    </button>
                    <span className="text-[10.5px] text-text-dim">
                      Une SORTIE ne porte jamais son prix · il se calcule. « L'axiomatique comptable
                      impose une égalité systématique, dans tout compte, des sorties et des entrées en
                      valeurs » (AUDCIF Titre VI).
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {onglet === 'inventaire' && (
        <div className="max-w-[1240px]">
          <div className="text-[11px] text-text-dim mb-2">
            Saisissez la quantité RÉELLEMENT COMPTÉE. Un article laissé vide n'est pas compté à zéro ·
            il est simplement hors du rapprochement, et zéro est une information, pas une absence.
          </div>

          <table className="w-full border-collapse text-[12px] mb-2.5">
            <thead>
              <tr className="bg-surface-2 text-text-dim">
                <th className={`${cell} text-left font-semibold`}>Code</th>
                <th className={`${cell} text-left font-semibold`}>Désignation</th>
                <th className={`${cell} text-left font-semibold`}>Méthode</th>
                <th className={`${cell} text-right font-semibold`}>Quantité comptée</th>
                <th className={`${cell} text-right font-semibold`}>Coût unitaire d'un boni</th>
                <th className={`${cell} text-left font-semibold`}>Source du coût</th>
              </tr>
            </thead>
            <tbody>
              {liste?.articles
                .filter((a) => a.actif)
                .map((a) => (
                  <tr key={a.id}>
                    <td className={`${cell} font-mono`}>{a.code}</td>
                    <td className={cell}>{a.designation}</td>
                    <td className={cell}>{a.methodeValorisation}</td>
                    <td className={cell}>
                      <input
                        className={`${champ} text-right`}
                        value={comptages[a.id] ?? ''}
                        onChange={(e) => setComptages({ ...comptages, [a.id]: e.target.value })}
                      />
                    </td>
                    {/* LE COÛT D'UN BONI N'EST DEMANDÉ QU'EN P.E.P.S. · en
                        C.M.P.A.C.E. le magasin ne détient qu'une seule valeur
                        unitaire, et c'est la méthode qui la fixe. */}
                    <td className={cell}>
                      <input
                        className={`${champ} text-right`}
                        disabled={a.methodeValorisation !== 'PEPS'}
                        value={coutsBoni[a.id]?.cout ?? ''}
                        onChange={(e) =>
                          setCoutsBoni({
                            ...coutsBoni,
                            [a.id]: { cout: e.target.value, source: coutsBoni[a.id]?.source ?? '' },
                          })
                        }
                      />
                    </td>
                    <td className={cell}>
                      <input
                        className={champ}
                        disabled={a.methodeValorisation !== 'PEPS'}
                        placeholder="facture, bon d'entrée…"
                        value={coutsBoni[a.id]?.source ?? ''}
                        onChange={(e) =>
                          setCoutsBoni({
                            ...coutsBoni,
                            [a.id]: { cout: coutsBoni[a.id]?.cout ?? '', source: e.target.value },
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          <button
            type="button"
            disabled={enCours || corpsComptages.length === 0}
            onClick={confronter}
            className="px-3 py-1 text-[12px] border border-accent bg-accent/10 disabled:opacity-40 mb-2.5"
          >
            Confronter au magasin
          </button>

          {confrontation?.reserve && (
            <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5 text-[12px]">
              {confrontation.reserve}
            </div>
          )}

          {c?.refus.map((r, i) => (
            <div
              key={`${r.motif}-${r.code ?? i}`}
              className="border border-warning/40 bg-warning/5 px-3.5 py-2 mb-2 text-[11px]"
            >
              {r.code ? <span className="font-mono font-semibold">{r.code} · </span> : null}
              {r.explication}
            </div>
          ))}

          {c && c.differences.length > 0 && (
            <>
              <table className="w-full border-collapse text-[12px] mb-2.5">
                <thead>
                  <tr className="bg-surface-2 text-text-dim">
                    <th className={`${cell} text-left font-semibold`}>Article</th>
                    <th className={`${cell} text-left font-semibold`}>Sens</th>
                    <th className={`${cell} text-right font-semibold`}>Livres</th>
                    <th className={`${cell} text-right font-semibold`}>Compté</th>
                    <th className={`${cell} text-right font-semibold`}>Écart</th>
                    <th className={`${cell} text-right font-semibold`}>Coût unitaire</th>
                    <th className={`${cell} text-right font-semibold`}>Montant</th>
                    <th className={`${cell} text-left font-semibold`}>Contrepartie</th>
                  </tr>
                </thead>
                <tbody>
                  {c.differences.map((d) => (
                    <tr key={d.articleId}>
                      <td className={cell}>
                        <span className="font-mono">{d.code}</span> {d.designation}
                      </td>
                      <td className={`${cell} font-semibold`}>{d.sens}</td>
                      <td className={`${cell} text-right font-mono`}>{qt(d.quantiteComptable)}</td>
                      <td className={`${cell} text-right font-mono`}>{qt(d.quantitePhysique)}</td>
                      <td className={`${cell} text-right font-mono`}>{qt(d.ecartQuantite)}</td>
                      <td className={`${cell} text-right font-mono`} title={d.fondementDuCout}>
                        {mt(d.coutUnitaireRetenu)}
                      </td>
                      <td className={`${cell} text-right font-mono`}>{mt(d.montant)}</td>
                      <td className={`${cell} font-mono`}>{d.compteVariation}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-2 font-semibold">
                    <td className={cell} colSpan={6}>
                      TOTAUX
                    </td>
                    <td className={`${cell} text-right font-mono`}>
                      boni {mt(c.totalBoni)} · mali {mt(c.totalMali)}
                    </td>
                    <td className={cell} />
                  </tr>
                </tbody>
              </table>

              <div className="text-[10.5px] text-text-dim mb-2">
                La contrepartie est le compte de VARIATION du stock, et les deux textes la désignent ·
                AUDCIF Titre VII (compte 603) et SYCEBNL Partie 2 ch. 3 (comptes 31 à 36). Un boni
                débite le stock, un mali le crédite.
              </div>

              {peutEcrire && (
                <div className="ecran-seul border border-border bg-surface-2 px-3 py-2.5">
                  <div className="grid grid-cols-4 gap-2">
                    <select
                      className={champ}
                      value={regul.journalId}
                      onChange={(e) => setRegul({ ...regul, journalId: e.target.value })}
                    >
                      <option value="">Journal…</option>
                      {journaux.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.code} {j.intitule}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className={champ}
                      value={regul.date}
                      onChange={(e) => setRegul({ ...regul, date: e.target.value })}
                    />
                    <input
                      className={champ}
                      placeholder="Référence (PV d'inventaire)"
                      value={regul.reference}
                      onChange={(e) => setRegul({ ...regul, reference: e.target.value })}
                    />
                    <button
                      type="button"
                      disabled={enCours || !regul.journalId || !regul.date}
                      onClick={enregistrerRegularisation}
                      className="px-3 py-1 text-[12px] border border-accent bg-accent/10 disabled:opacity-40"
                    >
                      Passer la régularisation
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {c && c.differences.length === 0 && c.refus.length === 0 && (
            <div className="border border-ok/30 bg-ok-soft px-3.5 py-2 text-[12px]">
              Aucune différence d'inventaire : le magasin et le comptage concordent sur les{' '}
              {c.sansDifference.length} article(s) comptés.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
