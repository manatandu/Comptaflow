import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import type {
  ConformiteInventaire,
  ConformiteRapportActivite,
  RapportActivite,
  TranscriptionInventaire,
} from '../lib/types';

/**
 * DOCUMENTS OBLIGATOIRES DE CLÔTURE · livre d'inventaire (art. 14) et rapport
 * d'activité (art. 16-3). L'article 24 sanctionne PÉNALEMENT les dirigeants
 * « qui n'ont pas, pour un exercice, dressé l'inventaire et établi les états
 * financiers annuels, ainsi que le rapport d'activité ».
 *
 * L'écran ne rédige à la place de personne : les contenus narratifs relèvent
 * des organes de direction, et le résumé de l'opération d'inventaire n'est
 * défini nulle part par le référentiel. Ce qu'il fait, c'est montrer
 * exactement ce que le texte exige, ce qui est fait, et ce qui manque.
 */
export function DocumentsObligatoiresPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const peutEtablir = utilisateur?.role === 'ADMIN_CABINET' || utilisateur?.role === 'COMPTABLE';

  const [onglet, setOnglet] = useState<'inventaire' | 'rapport'>('inventaire');
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState<string | null>(null);

  const [confInv, setConfInv] = useState<ConformiteInventaire | null>(null);
  const [transcriptions, setTranscriptions] = useState<TranscriptionInventaire[]>([]);
  const [resume, setResume] = useState('');
  const [enCours, setEnCours] = useState(false);

  const [confRap, setConfRap] = useState<ConformiteRapportActivite | null>(null);
  const [rapport, setRapport] = useState<RapportActivite | null>(null);
  const [form, setForm] = useState({
    etabliLe: '',
    situationExerciceEcoule: '',
    perspectivesDeveloppement: '',
    evolutionTresorerie: '',
    evenementsPosterieurs: '',
    entiteAvecAuditeur: false,
    declarationDirigeants: '',
  });

  const charger = () => {
    if (!exerciceCourant) return;
    const q = `exerciceId=${exerciceCourant.id}`;
    api.get<ConformiteInventaire>(`/documents-obligatoires/livre-inventaire/conformite?${q}`).then(setConfInv, () => {});
    api
      .get<TranscriptionInventaire[]>(`/documents-obligatoires/livre-inventaire?${q}`)
      .then((t) => {
        setTranscriptions(t);
        setResume(t[0]?.resumeOperationInventaire ?? '');
      }, () => {});
    api
      .get<ConformiteRapportActivite>(`/documents-obligatoires/rapport-activite/conformite?${q}`)
      .then(setConfRap, () => {});
    api.get<RapportActivite[]>(`/documents-obligatoires/rapport-activite?${q}`).then((r) => {
      const dernier = r[0] ?? null;
      setRapport(dernier);
      if (dernier) {
        // Une nouvelle version repart du dernier rapport établi : un rapport
        // d'activité se reprend, il ne se réécrit pas de zéro chaque année.
        setForm({
          etabliLe: dernier.etabliLe.slice(0, 10),
          situationExerciceEcoule: dernier.situationExerciceEcoule ?? '',
          perspectivesDeveloppement: dernier.perspectivesDeveloppement ?? '',
          evolutionTresorerie: dernier.evolutionTresorerie ?? '',
          evenementsPosterieurs: dernier.evenementsPosterieurs ?? '',
          entiteAvecAuditeur: dernier.entiteAvecAuditeur,
          declarationDirigeants: dernier.declarationDirigeants ?? '',
        });
      }
    }, () => {});
  };

  useEffect(charger, [exerciceCourant?.id]);

  const date = (v: string) => new Date(v).toLocaleDateString('fr-FR');
  const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const exporter = async (chemin: string, fichier: string) => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(chemin);
    try {
      await api.telecharger(`/exports/${chemin}?exerciceId=${exerciceCourant.id}`, fichier);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(null);
    }
  };

  const transcrire = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setEnCours(true);
    try {
      await api.post('/documents-obligatoires/livre-inventaire', {
        exerciceId: exerciceCourant.id,
        resumeOperationInventaire: resume || undefined,
      });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Transcription impossible');
    } finally {
      setEnCours(false);
    }
  };

  const enregistrerResume = async () => {
    const derniere = transcriptions[0];
    if (!derniere || !resume.trim()) return;
    setErreur(null);
    try {
      await api.patch(`/documents-obligatoires/livre-inventaire/${derniere.id}/resume`, {
        resumeOperationInventaire: resume.trim(),
      });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  const etablirRapport = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setEnCours(true);
    try {
      await api.post('/documents-obligatoires/rapport-activite', {
        exerciceId: exerciceCourant.id,
        etabliLe: form.etabliLe,
        situationExerciceEcoule: form.situationExerciceEcoule || undefined,
        perspectivesDeveloppement: form.perspectivesDeveloppement || undefined,
        evolutionTresorerie: form.evolutionTresorerie || undefined,
        evenementsPosterieurs: form.evenementsPosterieurs || undefined,
        entiteAvecAuditeur: form.entiteAvecAuditeur,
        declarationDirigeants: form.declarationDirigeants || undefined,
      });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Établissement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const pastille = (ok: boolean, libelleOk: string, libelleKo: string) => (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 ${ok ? 'text-positive bg-positive-soft' : 'text-danger bg-danger-soft'}`}>
      {ok ? libelleOk : libelleKo}
    </span>
  );

  const zone = (
    titre: string,
    exigence: string,
    cle: keyof typeof form,
    renseignee: boolean | undefined,
  ) => (
    <div key={cle} className="border border-border bg-surface mb-2 px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-[12px] font-bold">{titre}</span>
        {renseignee !== undefined && pastille(renseignee, 'RENSEIGNÉE', 'VIDE')}
      </div>
      <div className="text-[10px] text-text-dim italic mb-1.5">{exigence}</div>
      <textarea
        value={form[cle] as string}
        onChange={(e) => setForm((f) => ({ ...f, [cle]: e.target.value }))}
        disabled={!peutEtablir}
        rows={3}
        className="w-full border border-border-dark px-2 py-1 text-[11.5px] disabled:bg-surface-alt"
      />
    </div>
  );

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="text-[10.5px] font-mono text-text-dim">ÉTAT</div>
          <h1 className="text-[15px] font-bold flex items-center gap-1.5">
            Documents obligatoires de clôture
            <Aide sujet="livreInventaire" />
          </h1>
        </div>
        {exerciceCourant && (
          <span className="font-mono text-[11px] border border-border bg-surface px-2.5 py-1.5">
            Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
          </span>
        )}
      </div>

      <p className="text-[10.5px] text-text-dim mb-2">
        Article 24 : encourent une <strong>sanction pénale</strong> les dirigeants qui « n’ont pas, pour un exercice,
        dressé l’inventaire et établi les états financiers annuels, ainsi que le rapport d’activité ».
      </p>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[11.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[11px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      <div className="flex gap-0 mb-2.5 border-b border-border">
        {(
          [
            ['inventaire', "LIVRE D'INVENTAIRE (ART. 14)", confInv?.complete],
            ['rapport', "RAPPORT D'ACTIVITÉ (ART. 16-3)", confRap?.complet],
          ] as const
        ).map(([cle, libelle, complet]) => (
          <button
            key={cle}
            onClick={() => setOnglet(cle)}
            className={`px-3.5 py-1.5 text-[11px] font-bold border border-b-0 ${
              onglet === cle ? 'bg-surface border-border' : 'bg-chrome border-transparent text-text-dim hover:bg-surface-alt'
            }`}
          >
            {libelle}
            {complet === false && <span className="text-danger"> ⚠</span>}
          </button>
        ))}
      </div>

      {/* ------------------------- LIVRE D'INVENTAIRE ------------------------- */}
      {onglet === 'inventaire' && confInv && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            {peutEtablir && (
              <button
                onClick={transcrire}
                disabled={enCours}
                className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50"
              >
                {confInv.transcrit ? 'Re-transcrire (nouvelle version)' : 'Transcrire les états financiers'}
              </button>
            )}
            <button
              onClick={() => exporter('livre-inventaire', 'livre-inventaire.xlsx')}
              disabled={exportEnCours !== null || !confInv.transcrit}
              className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt disabled:opacity-50"
            >
              <IconExport width={13} height={13} />
              Exporter Excel
            </button>
            {confInv.transcrit && (
              <span className="text-[10.5px] text-text-dim">
                Version {confInv.version} du {date(confInv.transcritLe!)} · {transcriptions.length} version(s)
              </span>
            )}
          </div>

          <div className="border border-border bg-surface px-3.5 py-3 mb-2.5">
            <div className="text-[10px] font-bold text-text-dim mb-1.5">
              ÉTATS EXIGÉS ·{' '}
              {confInv.jeu === 'PROJETS_DEVELOPPEMENT' ? 'article 14, point 2' : 'article 14, point 1'}
            </div>
            {confInv.etatsExiges.map((e) => (
              <div key={e.cle} className="grid grid-cols-[1fr_110px] gap-2 py-1 border-b border-border last:border-b-0">
                <div>
                  <span className="text-[11.5px]">{e.libelle}</span>
                  {e.motifIndisponibilite && (
                    <div className="text-[10px] text-danger italic mt-0.5">{e.motifIndisponibilite}</div>
                  )}
                </div>
                <span className="justify-self-end">{pastille(e.transcrit, 'TRANSCRIT', 'MANQUANT')}</span>
              </div>
            ))}
            <div className="text-[10px] text-text-dim italic mt-2 border-t border-border pt-2">{confInv.exigence}</div>
          </div>

          <div className="border border-border bg-surface px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[12px] font-bold">Résumé de l’opération d’inventaire</span>
              {pastille(confInv.resume.renseigne, 'RENSEIGNÉ', 'MANQUANT')}
            </div>
            <div className="text-[10px] text-text-dim italic mb-1.5">
              {confInv.resume.exigence} {confInv.resume.remarque}
            </div>
            <textarea
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              disabled={!peutEtablir || !confInv.transcrit}
              rows={4}
              className="w-full border border-border-dark px-2 py-1 text-[11.5px] disabled:bg-surface-alt"
            />
            {peutEtablir && confInv.transcrit && (
              <button
                onClick={enregistrerResume}
                disabled={!resume.trim()}
                className="mt-1.5 bg-sel text-white text-[11px] font-semibold px-3 py-1 disabled:opacity-50"
              >
                Enregistrer le résumé
              </button>
            )}
          </div>

          <div className="text-[10px] text-text-dim italic mt-2.5 border border-border bg-surface-alt px-3.5 py-2">
            Les états transcrits sont <strong>figés</strong> : ils sont relus tels quels, jamais recalculés · c’est le
            sens du mot « transcrits » de l’article 14. Un exercice rouvert et corrigé se re-transcrit en version
            suivante, sans effacer ce qui avait été arrêté.
          </div>
        </div>
      )}

      {/* ------------------------- RAPPORT D'ACTIVITÉ ------------------------- */}
      {onglet === 'rapport' && confRap && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <label className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[10px] font-bold text-text-dim">Date d’établissement</span>
              <input
                type="date"
                value={form.etabliLe}
                onChange={(e) => setForm((f) => ({ ...f, etabliLe: e.target.value }))}
                disabled={!peutEtablir}
                className="border border-border-dark px-2 py-1 text-[11.5px]"
              />
            </label>
            {peutEtablir && (
              <button
                onClick={etablirRapport}
                disabled={enCours || !form.etabliLe}
                className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50"
              >
                {confRap.etabli ? 'Établir une nouvelle version' : 'Établir le rapport'}
              </button>
            )}
            <button
              onClick={() => exporter('rapport-activite', 'rapport-activite.xlsx')}
              disabled={exportEnCours !== null || !confRap.etabli}
              className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt disabled:opacity-50"
            >
              <IconExport width={13} height={13} />
              Exporter Excel
            </button>
            {confRap.etabli && <span className="text-[10.5px] text-text-dim">Version {confRap.version}</span>}
          </div>

          {confRap.fenetreEvenementsPosterieurs && (
            <div className="text-[10.5px] text-text-dim border border-border bg-surface-alt px-3.5 py-2 mb-2.5">
              Fenêtre des événements postérieurs à mentionner :{' '}
              <strong>
                du {date(confRap.fenetreEvenementsPosterieurs.du)} au {date(confRap.fenetreEvenementsPosterieurs.au)}
              </strong>{' '}
              · c’est la date d’établissement qui la ferme (art. 16-3).
            </div>
          )}

          {confRap.tresorerie && (
            <div
              className={`border px-3.5 py-2.5 mb-2.5 ${
                confRap.tresorerie.boucle ? 'border-border bg-surface' : 'border-danger/30 bg-danger-soft'
              }`}
            >
              <div className="text-[10px] font-bold text-text-dim mb-1">
                ÉVOLUTION DE LA TRÉSORERIE · figée du Tableau des flux à l’établissement du rapport
              </div>
              <div className="grid grid-cols-4 gap-4 text-[11.5px]">
                <span>
                  Ouverture : <span className="font-mono font-bold">{montant(confRap.tresorerie.ouverture)}</span>
                </span>
                <span>
                  Variation : <span className="font-mono font-bold">{montant(confRap.tresorerie.variation)}</span>
                </span>
                <span>
                  Clôture : <span className="font-mono font-bold">{montant(confRap.tresorerie.cloture)}</span>
                </span>
                <span className={confRap.tresorerie.boucle ? 'text-positive' : 'text-danger font-bold'}>
                  {confRap.tresorerie.boucle ? 'Tableau bouclé' : '⚠ Tableau NON bouclé à cette date'}
                </span>
              </div>
            </div>
          )}

          {confRap.sections.map((s, i) =>
            zone(
              s.titre,
              s.exigence,
              (['situationExerciceEcoule', 'perspectivesDeveloppement', 'evolutionTresorerie', 'evenementsPosterieurs'] as const)[i],
              confRap.etabli ? s.renseignee : undefined,
            ),
          )}

          <div className="border border-border bg-surface px-3.5 py-2.5">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[12px] font-bold">Déclaration des dirigeants · registre des donateurs</span>
              {confRap.etabli &&
                (confRap.declarationRegistreDonateurs.attendue
                  ? pastille(confRap.declarationRegistreDonateurs.renseignee, 'ANNEXÉE', 'ATTENDUE')
                  : pastille(true, 'NON ATTENDUE', ''))}
            </div>
            <div className="text-[10px] text-text-dim italic mb-1.5">
              {confRap.declarationRegistreDonateurs.exigence}
            </div>
            <label className="flex items-center gap-1.5 text-[11.5px] mb-1.5">
              <input
                type="checkbox"
                checked={form.entiteAvecAuditeur}
                onChange={(e) => setForm((f) => ({ ...f, entiteAvecAuditeur: e.target.checked }))}
                disabled={!peutEtablir}
              />
              L’entité a un auditeur · il produit alors son propre rapport et la déclaration n’est pas attendue.
            </label>
            {!form.entiteAvecAuditeur && (
              <>
                <textarea
                  value={form.declarationDirigeants}
                  onChange={(e) => setForm((f) => ({ ...f, declarationDirigeants: e.target.value }))}
                  disabled={!peutEtablir}
                  rows={3}
                  className="w-full border border-border-dark px-2 py-1 text-[11.5px] disabled:bg-surface-alt"
                />
                {confRap.etabli && !confRap.declarationRegistreDonateurs.registreConforme && (
                  <div className="text-[10.5px] text-danger mt-1.5">
                    ⚠ Le rapport de conformité du{' '}
                    <a href="#/registre-donateurs" className="underline">
                      registre des donateurs
                    </a>{' '}
                    relève des manquements. Attester d’une « tenue conforme » démentie par ce rapport exposerait les
                    dirigeants au deuxième tiret de l’article 24 (états sciemment non fidèles) en plus du troisième.
                  </div>
                )}
              </>
            )}
            <div className="text-[10px] text-text-dim italic mt-1.5">
              {confRap.declarationRegistreDonateurs.remarque}
            </div>
          </div>

          {rapport && (
            <div className="text-[10px] text-text-dim italic mt-2.5">
              Dernière version établie le {date(rapport.etabliLe)}. Une nouvelle version ne l’efface pas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
