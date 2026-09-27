import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EtatSurSite } from '../lib/sur-site';
import { Aide } from './chrome/Aide';
import { NouveauFichierWizard } from './NouveauFichierWizard';

interface CopieExterne {
  dossier: string | null;
  derniere: string | null;
  le: string | null;
  erreur: string | null;
  chiffree: boolean;
}

/** Douze caractères, la même borne que le serveur (chiffrement-sauvegarde.ts). */
const LONGUEUR_PHRASE_MIN = 12;

interface Copie {
  nom: string;
  taille: number;
  date: string;
}

/**
 * LES SAUVEGARDES D'UNE INSTALLATION SUR SITE · en ligne, c'est la
 * plateforme qui sauvegarde et ce cadre ne s'affiche pas. Sur site, la copie
 * quotidienne part seule ; ce cadre montre les copies et en déclenche une,
 * avant une opération lourde par exemple. Réservé à l'administrateur du
 * DOSSIER D'INSTALLATION (audit final F44), comme la route · une sauvegarde
 * est la base de tous les dossiers du poste. Un autre administrateur reçoit
 * un refus, et le cadre ne s'affiche pas. C'est aussi d'ici que naissent les
 * dossiers suivants de l'installation.
 */
export function SauvegardesSurSite() {
  const { estAdmin } = useAuth();
  const [surSite, setSurSite] = useState(false);
  const [dossier, setDossier] = useState('');
  // `null` tant que la liste n'a pas été LUE (audit final F179) · une liste
  // vide est un constat, une lecture échouée n'en est pas un.
  const [copies, setCopies] = useState<Copie[] | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [externe, setExterne] = useState<CopieExterne | null>(null);
  const [cheminExterne, setCheminExterne] = useState('');
  const [phrase, setPhrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [creation, setCreation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () =>
    api.get<{ dossier: string; copies: Copie[]; copieExterne: CopieExterne }>('/sur-site/sauvegardes').then((r) => {
      setDossier(r.dossier);
      setCopies(r.copies);
      setExterne(r.copieExterne);
      setCheminExterne(r.copieExterne.dossier ?? '');
      setErreurLecture(null);
    });

  /** Relit la liste · un refus de lecture se DIT, il ne devient pas « aucune copie ». */
  const relire = () =>
    charger().catch((e) => setErreurLecture(e instanceof ApiError ? e.message : 'La liste des sauvegardes n’a pas pu être lue.'));

  useEffect(() => {
    if (!estAdmin) return;
    api
      .get<EtatSurSite>('/sur-site/etat')
      .then((e) => {
        if (!e.surSite) return;
        return charger().then(
          () => setSurSite(true),
          (err) => {
            // Un REFUS (autre dossier que celui d'installation) laisse le cadre
            // masqué · ce n'est pas une panne. Toute autre erreur s'affiche.
            if (err instanceof ApiError && err.status === 403) return;
            setSurSite(true);
            setErreurLecture(err instanceof ApiError ? err.message : 'La liste des sauvegardes n’a pas pu être lue.');
          },
        );
      })
      // En ligne, un serveur d'avant cette route répond 404 · rien à montrer.
      .catch(() => undefined);
  }, [estAdmin]);

  if (!estAdmin || !surSite) return null;

  const sauvegarder = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await api.post('/sur-site/sauvegardes');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La sauvegarde n’a pas abouti.');
      setEnCours(false);
      return;
    }
    // La sauvegarde est faite · un échec de relecture n'en fait pas un échec.
    await relire();
    setEnCours(false);
  };

  const definirExterne = async () => {
    setErreur(null);
    const dossierExterne = cheminExterne.trim() || null;
    if (dossierExterne) {
      if (phrase.length < LONGUEUR_PHRASE_MIN) {
        setErreur(`La phrase de chiffrement doit compter au moins ${LONGUEUR_PHRASE_MIN} caractères.`);
        return;
      }
      if (phrase !== confirmation) {
        setErreur('Les deux saisies de la phrase diffèrent.');
        return;
      }
    }
    try {
      await api.post('/sur-site/sauvegardes/copie-externe', { dossier: dossierExterne, phrase: dossierExterne ? phrase : null });
      setPhrase('');
      setConfirmation('');
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le dossier externe n’a pas pu être enregistré.');
      return;
    }
    await relire();
  };

  // Aucune copie hors du poste, ou une copie en échec, ou plus vieille que la
  // dernière sauvegarde locale · le disque du poste reste alors le seul
  // endroit où vit la comptabilité, et l'écran le dit.
  // Rien ne s'en conclut tant que la liste n'a pas été lue (audit final F179).
  const externeEnRetard =
    copies !== null && (!externe?.dossier || !!externe.erreur || (copies[0] && externe.derniere !== copies[0].nom));

  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mt-2.5">
      <h2 className="text-[11.5px] font-bold mb-1.5">Sauvegardes de cette installation</h2>
      <p className="text-[11.5px] text-text-dim mb-2">Dossier · {dossier}</p>
      {externeEnRetard && (
        <p role="alert" className="border border-warning/30 bg-warning-soft px-3.5 py-2 mb-2 text-[11.5px]">
          {!externe?.dossier
            ? 'Aucune copie hors de ce poste · une panne de son disque emporterait la base et toutes ses sauvegardes.'
            : externe.erreur
              ? `La dernière copie vers ${externe.dossier} a échoué · ${externe.erreur}`
              : `La copie externe n’a pas reçu la dernière sauvegarde (dernière recopiée : ${externe.derniere ?? 'aucune'}).`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-2 text-[11.5px]">
        <span className="text-text-dim">Copie hors du poste</span>
        <input
          className="border border-border px-2 py-1 bg-surface min-w-[240px]"
          value={cheminExterne}
          onChange={(e) => setCheminExterne(e.target.value)}
          placeholder="E:\SauvegardesOmegaX ou \\SERVEUR\partage"
        />
        <input
          type="password"
          className="border border-border px-2 py-1 bg-surface min-w-[160px]"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="Phrase de chiffrement"
          autoComplete="new-password"
        />
        <input
          type="password"
          className="border border-border px-2 py-1 bg-surface min-w-[160px]"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Confirmer la phrase"
          autoComplete="new-password"
        />
        <button type="button" className="underline" onClick={definirExterne}>
          Enregistrer
        </button>
        <Aide
          titre="Copie chiffrée"
          texte="La copie hors du poste est chiffrée par cette phrase. Elle n'est rangée nulle part en clair, et c'est elle seule qui relira la copie si le disque de ce poste lâche · perdue, la copie externe est illisible. Pour la relire, l'outil dechiffrer-sauvegarde.cjs du dossier du programme."
          source="Décision d'OmegaX · fiche d'installation sur site, § 5"
        />
        {externe?.chiffree && <span className="text-text-dim">chiffrée</span>}
        {externe?.le && <span className="text-text-dim">dernière copie le {new Date(externe.le).toLocaleString('fr-FR')}</span>}
      </div>
      {erreur && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2 text-[11.5px]">
          {erreur}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          type="button"
          onClick={sauvegarder}
          disabled={enCours}
          className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          {enCours ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
        </button>
        <button type="button" className="text-[11.5px] underline" onClick={() => setCreation(true)}>
          Créer un dossier sur cette installation
        </button>
      </div>
      {creation && <NouveauFichierWizard surInstallation onClose={() => setCreation(false)} />}
      {erreurLecture && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2 text-[11.5px]">
          Liste des sauvegardes illisible · {erreurLecture}
        </p>
      )}
      {copies === null ? (
        !erreurLecture && <p className="text-[11.5px] text-text-dim">Lecture des sauvegardes…</p>
      ) : copies.length === 0 ? (
        <p className="text-[11.5px] text-danger">Aucune copie dans ce dossier.</p>
      ) : (
        <table className="w-full text-[11.5px]">
          <thead>
            <tr>
              <th className="text-left">Copie</th>
              <th className="text-left">Date</th>
              <th className="text-right">Taille</th>
            </tr>
          </thead>
          <tbody>
            {copies.map((c) => (
              <tr key={c.nom}>
                <td>{c.nom}</td>
                <td>{new Date(c.date).toLocaleString('fr-FR')}</td>
                <td className="text-right">{(c.taille / 1_048_576).toFixed(1)} Mo</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
