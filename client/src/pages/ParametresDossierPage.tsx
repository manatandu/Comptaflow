import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import type { JeuEtatsFinanciersSycebnl, ParametresDossier } from '../lib/types';

/**
 * PARAMÈTRES DU DOSSIER · Structure → Paramètres société chez Sage 100 i7.
 *
 * L'écran existe d'abord pour une raison : rendre visible et modifiable le
 * JEU D'ÉTATS FINANCIERS SYCEBNL. Il était jusqu'ici figé sur les
 * associations et ordres professionnels par simple valeur par défaut du
 * schéma, sans qu'aucun écran ne permette de le voir ni de le changer · un
 * projet de développement se serait donc vu servir un compte de résultat et
 * 35 notes annexes là où l'article 4 lui impose un compte d'exploitation, un
 * tableau emplois-ressources, un tableau d'exécution budgétaire, un tableau
 * de réconciliation de trésorerie et 24 notes.
 *
 * Le changement est refusé côté serveur dès qu'une écriture existe : les
 * rattachements de comptes aux notes annexes et les états déjà arrêtés
 * dépendent du jeu retenu.
 */

const CHOIX: {
  valeur: JeuEtatsFinanciersSycebnl;
  titre: string;
  etats: string[];
}[] = [
  {
    valeur: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
    titre: 'Associations, ordres professionnels et fondations',
    etats: ['Bilan', 'Compte de résultat', 'Tableau de flux de trésorerie', '35 notes annexes'],
  },
  {
    valeur: 'PROJETS_DEVELOPPEMENT',
    titre: 'Projets de développement et assimilés',
    etats: [
      'Bilan',
      "Compte d'exploitation",
      'Tableau emplois-ressources',
      "Tableau d'exécution budgétaire",
      'Tableau de réconciliation de trésorerie',
      '24 notes annexes',
    ],
  },
  {
    valeur: 'SYSTEME_MINIMAL_TRESORERIE',
    titre: 'Système minimal de trésorerie · petites entités (art. 5 et 6)',
    etats: [
      'Bilan (5 lignes d’actif, 4 de passif)',
      'Compte de résultat de trésorerie',
      'Journal unique de trésorerie',
      '5 notes annexes',
      'Réservé aux ressources annuelles sous 30 000 000 FCFA par catégorie',
    ],
  },
];

export function ParametresDossierPage() {
  const { estAdmin, rafraichir } = useAuth();
  const [params, setParams] = useState<ParametresDossier | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    try {
      setParams(await api.get<ParametresDossier>('/dossier/parametres'));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const changerJeu = async (jeu: JeuEtatsFinanciersSycebnl) => {
    if (!params || params.jeuEtatsFinanciersSycebnl === jeu) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      setParams(await api.patch<ParametresDossier>('/dossier/jeu-etats-financiers', { jeuEtatsFinanciersSycebnl: jeu }));
      // Le jeu d'états est lu depuis /auth/me par les fenêtres d'états
      // financiers et de notes annexes : sans ce rafraîchissement elles
      // continueraient d'afficher l'ancien jeu jusqu'à la prochaine session.
      await rafraichir();
      setInfo("Jeu d'états financiers enregistré.");
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const verrouille = !!params && params.nombreEcritures > 0;

  return (
    <div className="p-2.5">
      <div className="mb-2.5">
        <div className="text-[10.5px] font-mono text-text-dim">STRUCTURE</div>
        <h1 className="text-[15px] font-bold">Paramètres du dossier</h1>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[12px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5">
          {info}
        </div>
      )}

      {!params ? (
        <div className="text-[12px] text-text-dim">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-2.5 items-start">
          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
            <header className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center gap-1.5">
              <span className="text-[11.5px] font-bold">Jeu d'états financiers SYCEBNL</span>
              <Aide sujet="jeuEtats" />
            </header>
            <div className="p-3 flex flex-col gap-2">
              {CHOIX.map((c) => {
                const actif = params.jeuEtatsFinanciersSycebnl === c.valeur;
                const modifiable = estAdmin && !verrouille && !envoi;
                return (
                  <label
                    key={c.valeur}
                    className={`flex items-start gap-2.5 rounded-[8px] border p-3 transition-colors ${
                      actif ? 'border-sel bg-sel-soft' : 'border-border'
                    } ${modifiable ? 'cursor-pointer hover:border-sel/50' : 'cursor-default'}`}
                  >
                    <input
                      type="radio"
                      name="jeuEtats"
                      className="mt-0.5"
                      checked={actif}
                      disabled={!modifiable}
                      onChange={() => changerJeu(c.valeur)}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{c.titre}</span>
                      <span className="block text-[11.5px] text-text-dim mt-1">{c.etats.join(' · ')}</span>
                    </span>
                  </label>
                );
              })}

              <label className="flex items-start gap-2.5 rounded-[8px] border border-border bg-chrome-alt p-3 opacity-60 cursor-not-allowed">
                <input type="radio" className="mt-0.5" disabled />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold flex items-center gap-1.5">
                    Système Minimal de Trésorerie
                    <span className="text-[10px] font-semibold text-warning">bientôt</span>
                    <Aide sujet="smt" />
                  </span>
                  <span className="block text-[11.5px] text-text-dim mt-1">
                    Recettes annuelles jusqu'à 30 millions de FCFA · journal unique de trésorerie, 5 notes annexes
                  </span>
                </span>
              </label>

              <p className="text-[11.5px] text-text-dim mt-1 leading-[1.55]">
                {verrouille
                  ? `Ce dossier porte ${params.nombreEcritures} écriture(s) : le jeu d'états financiers est désormais figé. Pour tenir une entité de l'autre type, créez un dossier distinct.`
                  : estAdmin
                    ? "Le choix reste modifiable tant qu'aucune écriture n'est saisie. Passé la première écriture, il sera figé."
                    : "Seul un administrateur peut modifier le jeu d'états financiers."}
              </p>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
            <header className="px-3 py-2 bg-chrome-alt border-b border-border text-[11.5px] font-bold">
              Identification
            </header>
            <dl className="p-3 text-[12px] flex flex-col gap-2">
              {(
                [
                  ['Raison sociale', params.nom],
                  ['Référentiel', params.referentiel],
                  ['Activité', params.activite],
                  ['Adresse', params.adresse],
                  ['Ville', params.ville],
                  ['Pays', params.pays],
                  ['Téléphone', params.telephone],
                  ['Monnaie de tenue', params.devise],
                  ['Longueur des comptes', `${params.longueurCompte} caractères`],
                  ['Écritures enregistrées', String(params.nombreEcritures)],
                ] as [string, string | null][]
              ).map(([cle, valeur]) => (
                <div key={cle} className="flex justify-between gap-3">
                  <dt className="text-text-dim">{cle}</dt>
                  <dd className="text-right font-medium">{valeur || '·'}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
