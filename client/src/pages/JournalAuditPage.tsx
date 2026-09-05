import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * JOURNAL D'AUDIT · AUDCIF art. 22, 6° : « l'organisation garantisse toutes
 * les possibilités de contrôle en permettant la reconstitution du chemin de
 * révision ».
 *
 * La fenêtre ne propose AUCUNE action d'écriture, et ce n'est pas un oubli ·
 * un journal que l'on peut corriger depuis le logiciel ne prouve plus rien.
 * Le seul bouton est celui de la vérification d'intégrité.
 */

interface Evenement {
  id: string;
  rang: number;
  horodatage: string;
  acteurEmail: string;
  adresseIp: string | null;
  action: 'CREATION' | 'MODIFICATION' | 'SUPPRESSION';
  entite: string;
  entiteId: string | null;
  avant: unknown;
  apres: unknown;
}

interface Page {
  total: number;
  page: number;
  taille: number;
  evenements: Evenement[];
}

interface Verdict {
  evenements: number;
  intacte: boolean;
  ruptures: Array<{ rang: number; id: string; motif: string }>;
}

/** Les libellés que lit un comptable, pas les noms de tables. */
const LIBELLES_ENTITE: Record<string, string> = {
  Tenant: 'Dossier',
  User: 'Utilisateur',
  Licence: 'Licence',
  Compte: 'Compte du plan',
  Journal: 'Code journal',
  TauxTva: 'Taux de taxe',
  Devise: 'Devise',
  PlanAnalytique: 'Plan analytique',
  SectionAnalytique: 'Section analytique',
  FamilleImmobilisation: "Famille d'immobilisation",
  Tiers: 'Tiers',
  Bailleur: 'Bailleur',
  Exercice: 'Exercice',
  Cloture: 'Clôture',
  AffectationResultat: 'Affectation du résultat',
  Ecriture: 'Écriture',
  Lettrage: 'Lettrage',
  Regularisation: 'Régularisation',
  Reevaluation: 'Réévaluation',
  RapprochementBancaire: 'Rapprochement bancaire',
  Immobilisation: 'Immobilisation',
  Donation: 'Donation',
  TranscriptionInventaire: "Livre d'inventaire",
  Exoneration: 'Exonération',
  LiquidationTva: 'Liquidation de TVA',
  RetraitementFiscal: 'Retraitement fiscal',
};

const COULEUR_ACTION: Record<string, string> = {
  CREATION: 'text-success',
  MODIFICATION: 'text-text',
  SUPPRESSION: 'text-danger',
};

const MOTIFS: Record<string, string> = {
  RANG_MANQUANT: 'un événement a été SUPPRIMÉ de la table',
  CHAINAGE_ROMPU: 'un événement a été INSÉRÉ ou remplacé',
  EMPREINTE_INVALIDE: 'le contenu d’un événement a été RETOUCHÉ',
};

function horodatage(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR');
}

/** Les champs qui ont réellement changé entre l'avant et l'après. */
function differences(avant: unknown, apres: unknown): string {
  const a = (avant ?? {}) as Record<string, unknown>;
  const b = (apres ?? {}) as Record<string, unknown>;
  if (!avant) return Object.keys(b).length ? 'création' : '';
  if (!apres) return 'suppression';
  const changes = Object.keys(b).filter((c) => JSON.stringify(a[c]) !== JSON.stringify(b[c]));
  return changes.length ? changes.join(', ') : 'aucun champ suivi';
}

export function JournalAuditPage() {
  const [page, setPage] = useState(1);
  const [entite, setEntite] = useState('');
  const [acteurEmail, setActeurEmail] = useState('');
  const [donnees, setDonnees] = useState<Page | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setErreur(null);
    const parametres = new URLSearchParams({ page: String(page), taille: '50' });
    if (entite) parametres.set('entite', entite);
    if (acteurEmail) parametres.set('acteurEmail', acteurEmail);
    api.get<Page>(`/journal-audit?${parametres}`).then(
      (r) => !annule && setDonnees(r),
      (e) => !annule && setErreur(e instanceof ApiError ? e.message : 'Chargement impossible'),
    );
    return () => {
      annule = true;
    };
  }, [page, entite, acteurEmail]);

  const verifier = () => {
    setVerdict(null);
    api.get<Verdict>('/journal-audit/verification').then(
      setVerdict,
      (e) => setErreur(e instanceof ApiError ? e.message : 'Vérification impossible'),
    );
  };

  // 444 px de colonnes fixes + 5 gouttières de 10 px + 28 px de marges =
  // 522 px incompressibles, pour ~326 px utiles à 360 px · même remède que
  // les autres grilles à colonnes fixes du logiciel.
  const grille = 'grid grid-cols-[54px_140px_1fr_120px_130px_1fr] min-w-[522px] gap-2.5';
  const pages = donnees ? Math.max(1, Math.ceil(donnees.total / donnees.taille)) : 1;

  return (
    <div className="p-2">
      <EnteteImpression titre="Journal d'audit" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">CHEMIN DE RÉVISION</div>
          <h1 className="text-[12px] font-bold leading-tight">Journal d'audit</h1>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">OBJET</span>
            <select
              value={entite}
              onChange={(e) => {
                setEntite(e.target.value);
                setPage(1);
              }}
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] min-w-[190px]"
            >
              <option value="">Tous les objets</option>
              {Object.entries(LIBELLES_ENTITE).map(([cle, texte]) => (
                <option key={cle} value={cle}>
                  {texte}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">AUTEUR</span>
            <input
              value={acteurEmail}
              onChange={(e) => {
                setActeurEmail(e.target.value);
                setPage(1);
              }}
              placeholder="courriel"
              className="border border-border-dark bg-surface px-2 py-1 text-[10.5px] min-w-[180px]"
            />
          </label>
          <button
            type="button"
            onClick={verifier}
            className="border border-border-dark bg-surface-alt px-3 py-1 text-[10.5px] font-semibold"
          >
            Vérifier l'intégrité
          </button>
        </div>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2.5">{erreur}</div>
      )}

      {verdict && (
        <div
          className={`text-[11px] px-3 py-2 mb-2.5 border ${
            verdict.intacte ? 'bg-success-soft border-success/30 text-success' : 'bg-danger-soft border-danger/30 text-danger'
          }`}
        >
          {verdict.intacte ? (
            <>
              Chaîne INTACTE sur {verdict.evenements} événement{verdict.evenements > 1 ? 's' : ''} · chaque événement
              porte l'empreinte du précédent, aucun n'a été retiré, inséré ni retouché.
            </>
          ) : (
            <>
              <div className="font-bold">
                Chaîne ROMPUE · {verdict.ruptures.length} anomalie{verdict.ruptures.length > 1 ? 's' : ''} sur{' '}
                {verdict.evenements} événements.
              </div>
              <ul className="mt-1 list-disc pl-4">
                {verdict.ruptures.slice(0, 20).map((r) => (
                  <li key={`${r.id}-${r.motif}`}>
                    événement n° {r.rang} · {MOTIFS[r.motif] ?? r.motif}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="border border-border bg-surface shadow-posee overflow-x-auto">
        <div
          className={`${grille} px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark`}
        >
          <div>N°</div>
          <div>DATE ET HEURE</div>
          <div>AUTEUR</div>
          <div>ACTION</div>
          <div>OBJET</div>
          <div>CHAMPS TOUCHÉS</div>
        </div>

        {donnees?.evenements.length === 0 && (
          <div className="px-3.5 py-3 text-[11px] text-text-dim">Aucun événement pour ce filtre.</div>
        )}

        {donnees?.evenements.map((e) => (
          <div key={e.id}>
            <button
              type="button"
              onClick={() => setOuvert(ouvert === e.id ? null : e.id)}
              className={`${grille} w-full text-left px-3.5 py-1 text-[10.5px] border-b border-border hover:bg-surface-alt`}
            >
              <div className="font-mono text-text-dim">{e.rang}</div>
              <div className="font-mono">{horodatage(e.horodatage)}</div>
              <div className="truncate">{e.acteurEmail}</div>
              <div className={`font-semibold ${COULEUR_ACTION[e.action] ?? ''}`}>{e.action.toLowerCase()}</div>
              <div>{LIBELLES_ENTITE[e.entite] ?? e.entite}</div>
              <div className="truncate text-text-dim">{differences(e.avant, e.apres)}</div>
            </button>
            {ouvert === e.id && (
              <div className="px-3.5 py-2 bg-surface-alt border-b border-border-dark grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-bold text-text-dim mb-1">AVANT</div>
                  <pre className="text-[10px] whitespace-pre-wrap break-all">
                    {e.avant ? JSON.stringify(e.avant, null, 1) : 'rien · création'}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-text-dim mb-1">APRÈS</div>
                  <pre className="text-[10px] whitespace-pre-wrap break-all">
                    {e.apres ? JSON.stringify(e.apres, null, 1) : 'rien · suppression'}
                  </pre>
                </div>
                {e.adresseIp && (
                  <div className="col-span-2 text-[10px] text-text-dim">Adresse d'origine · {e.adresseIp}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {donnees && donnees.total > donnees.taille && (
        <div className="flex items-center gap-3 mt-2 text-[10.5px]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="border border-border-dark bg-surface-alt px-3 py-1 disabled:opacity-40"
          >
            Précédent
          </button>
          <span className="text-text-dim">
            page {donnees.page} sur {pages} · {donnees.total} événements
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="border border-border-dark bg-surface-alt px-3 py-1 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
