import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  CLASSES_TON,
  EVENEMENT_FILE_COURRIER,
  PHRASE_OU_SE_POSE_LE_COURRIEL,
  PHRASE_SANS_TRANSPORT,
  TITRE_SANS_TRANSPORT,
  etatMessage,
  filtresFile,
  libelleOrigine,
  resumeReprise,
} from '../lib/courrier-file';
import type {
  BilanRepriseCourrier,
  CompteursCourrier,
  EtatTransportCourriel,
  FileMessages,
  MessageComplet,
  MessageEnFile,
  StatutMessage,
} from '../lib/types';

/**
 * COURRIERS SORTANTS · la file des courriels du dossier.
 *
 * Le module de relances compose des lettres de rappel et la sécurité produit
 * des mots de passe provisoires ; jusqu'à cette fenêtre, personne ne pouvait
 * savoir ce que ces textes étaient devenus. Ils sont désormais ÉCRITS avant
 * toute tentative d'envoi (voir la migration
 * 20260914180000_file_des_courriels), et cette fenêtre est l'endroit où on les
 * lit.
 *
 * CE QUE CET ÉCRAN DOIT FAIRE COMPRENDRE AVANT TOUT LE RESTE. Aucun transport
 * n'est configuré sur cette installation : tous les messages y sont donc
 * marqués « Gardé, pas de messagerie ». Le logiciel ne prétend pas les avoir
 * envoyés, ne les perd pas, et n'a pas refusé le geste du comptable · il les
 * garde, et ils repartiront tels quels le jour où les identifiants du serveur
 * d'envoi seront posés. Les phrases qui le disent vivent dans
 * `lib/courrier-file.ts`, où un spec peut les relire · elles seront lues plus
 * souvent que tout le reste de la fenêtre.
 *
 * IL N'Y A AUCUN FORMULAIRE DE CONFIGURATION ICI, et ce n'est pas un manque :
 * serveur, port, identifiant et mot de passe viennent de l'environnement du
 * service (variables SMTP_*), jamais de la base · une base se sauvegarde
 * chaque nuit et se restaure sur un poste de test.
 *
 * LECTURE OUVERTE, REPRISE RÉSERVÉE · le contrôleur laisse tout utilisateur du
 * dossier voir la file (c'est le comptable qui voit sa relance en attente, lui
 * refuser l'explication le laisserait devant un logiciel qui a l'air cassé),
 * mais réserve `POST /courrier/reprendre` à l'administrateur et au comptable :
 * ce qui part sous la signature du dossier n'est pas une consultation.
 */

/** Plafond de la liste, aligné sur LISTE_PAR_DEFAUT du serveur. */
const PAR_PAGE = 200;

function quand(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function Pastille({ statut }: { statut: StatutMessage }) {
  const etat = etatMessage(statut);
  return (
    <span
      title={etat.explication}
      className={`inline-block rounded-[5px] px-1.5 py-[1px] text-[10px] font-semibold truncate ${CLASSES_TON[etat.ton]}`}
    >
      {etat.libelle}
    </span>
  );
}

export function CourrierPage() {
  const { estAdmin, utilisateur } = useAuth();
  const [transport, setTransport] = useState<EtatTransportCourriel | null>(null);
  const [compteurs, setCompteurs] = useState<CompteursCourrier | null>(null);
  const [file, setFile] = useState<FileMessages | null>(null);
  const [filtre, setFiltre] = useState<StatutMessage | null>(null);
  const [ouvert, setOuvert] = useState<MessageComplet | null>(null);
  const [bilan, setBilan] = useState<BilanRepriseCourrier | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reprise, setReprise] = useState(false);

  const peutEcrire = estAdmin || utilisateur?.role === 'COMPTABLE';

  const chargerEntete = async () => {
    try {
      const [t, c] = await Promise.all([
        api.get<EtatTransportCourriel>('/courrier/transport'),
        api.get<CompteursCourrier>('/courrier/compteurs'),
      ]);
      setTransport(t);
      setCompteurs(c);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  const chargerFile = async (statut: StatutMessage | null) => {
    try {
      const requete = `/courrier?limite=${PAR_PAGE}${statut ? `&statut=${statut}` : ''}`;
      setFile(await api.get<FileMessages>(requete));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    chargerEntete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFile(null);
    chargerFile(filtre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre]);

  const ouvrirMessage = async (message: MessageEnFile) => {
    if (ouvert?.id === message.id) {
      setOuvert(null);
      return;
    }
    try {
      // Le corps n'est PAS dans la liste · il est entier ici, jamais coupé
      // pour l'aperçu (voir CHAMPS_LISTE, courrier.service.ts).
      setOuvert(await api.get<MessageComplet>(`/courrier/${message.id}`));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Message illisible');
    }
  };

  /**
   * LE BOUTON RESTE CLIQUABLE MÊME SANS TRANSPORT, et c'est voulu · l'état de
   * la messagerie est lu dans l'environnement du service à CHAQUE appel. Le
   * griser sur la foi d'une lecture faite à l'ouverture de la fenêtre
   * refuserait le premier envoi de la journée où les identifiants viennent
   * d'être posés. Le bilan rendu par le serveur fait autorité · il DIT quand
   * rien n'a été tenté, et nomme ce qui manque.
   */
  const relancer = async () => {
    setReprise(true);
    setErreur(null);
    try {
      setBilan(await api.post<BilanRepriseCourrier>('/courrier/reprendre', {}));
      // Le bandeau est REDEMANDÉ au serveur plutôt que déduit du bilan · lui
      // seul relit l'environnement, et c'est ainsi que la fenêtre apprend,
      // sans être rouverte, que la messagerie vient d'être posée.
      await chargerEntete();
      await chargerFile(filtre);
      // La cloche du chrome relit son compte tout de suite · sans ce signal
      // elle garderait jusqu'à une minute la pastille d'AVANT la reprise,
      // c'est-à-dire un chiffre faux, juste après le geste qui l'a corrigé.
      window.dispatchEvent(new Event(EVENEMENT_FILE_COURRIER));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Reprise impossible');
    } finally {
      setReprise(false);
    }
  };

  const filtres = filtresFile(compteurs);
  const aRelancer = compteurs?.aRelancer ?? 0;

  return (
    <div className="p-2">
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">DOSSIER</div>
          <h1 className="text-[12px] font-bold leading-tight">Courriers sortants</h1>
        </div>
        {peutEcrire && (
          <button
            onClick={relancer}
            disabled={reprise}
            title="Reprend les messages qui attendent un envoi · ceux qui ont échoué, et ceux écrits pendant que la messagerie n’était pas posée. Les envoyés et les abandonnés ne sont pas retentés."
            className="bg-sel text-white text-[10.5px] font-bold px-3.5 py-1.5 rounded-[6px] hover:brightness-110 disabled:opacity-50"
          >
            {reprise ? 'Reprise en cours…' : `Relancer les envois (${aRelancer})`}
          </button>
        )}
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}

      {/*
        LE BANDEAU DE L'ÉTAT DE LA MESSAGERIE · la première chose lue, et
        aujourd'hui la seule qui explique une file entière marquée « Gardé ».
        Bleu d'information et non rouge : rien n'est cassé, et une bordure
        rouge démentirait la phrase qu'elle encadre.
      */}
      {transport && !transport.configure && (
        <section className="mb-2.5 rounded-[8px] border border-sel/30 bg-sel-soft px-3 py-2.5">
          <div className="text-[11px] font-bold text-sel">{TITRE_SANS_TRANSPORT}</div>
          <p className="mt-1 text-[10.5px] leading-[1.55] text-text">{PHRASE_SANS_TRANSPORT}</p>
          {transport.manques.length > 0 && (
            <div className="mt-1.5 text-[10.5px] text-text">
              <span className="font-semibold">Ce qui manque au service :</span>
              <ul className="mt-0.5 space-y-[1px]">
                {transport.manques.map((m) => (
                  <li key={m.variable} className="font-mono text-[10px]">
                    {m.variable} <span className="font-sans text-text-dim">· {m.raison}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-1.5 text-[10px] leading-[1.5] text-text-dim">{PHRASE_OU_SE_POSE_LE_COURRIEL}</p>
        </section>
      )}
      {transport?.configure && (
        <div className="mb-2.5 rounded-[8px] border border-positive/30 bg-positive-soft px-3 py-1.5 text-[10.5px] text-text">
          Messagerie posée · le courrier part sous l’adresse{' '}
          <span className="font-mono font-semibold">{transport.expediteur}</span>.
        </div>
      )}

      {bilan && (
        <div className="mb-2.5 flex items-start justify-between gap-3 rounded-[6px] border border-border bg-chrome-alt px-2.5 py-1.5 text-[11px]">
          <span>{resumeReprise(bilan)}</span>
          <button onClick={() => setBilan(null)} className="font-bold text-text-dim hover:text-text">
            Fermer
          </button>
        </div>
      )}

      {/* Filtres · les six, toujours les six, même à zéro (voir filtresFile). */}
      <div className="flex flex-wrap bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        {filtres.map((f) => (
          <button
            key={f.statut ?? 'TOUS'}
            onClick={() => setFiltre(f.statut)}
            className={`px-3 py-1.5 text-[10.5px] font-bold ${
              filtre === f.statut ? 'bg-surface border-x border-border' : 'text-text-dim'
            }`}
          >
            {f.libelle.toUpperCase()} <span className="font-mono font-normal">{f.compte}</span>
          </button>
        ))}
      </div>

      <div className="border border-border bg-surface rounded-b-[10px] overflow-hidden">
        {filtre && (
          <p className="px-3 py-2 text-[10.5px] text-text-dim border-b border-border/40">
            {etatMessage(filtre).explication}
          </p>
        )}

        {/*
          `overflow-x-auto` ici, `min-w` sur les lignes · les 1002 px de
          colonnes incompressibles ne tiennent pas dans les ~326 px utiles
          d'une fenêtre à 360 px, et sans conteneur le débordement remonterait
          à la fenêtre, qui emporterait le bandeau d'explication et le bouton
          de reprise hors de l'écran (grilles-fixes-etroites.spec.ts).

          La grille est écrite EN TOUTES LETTRES dans chaque `className`, et
          non rangée dans une constante : le garde-fou lit les attributs JSX
          et ne suit pas les variables · une grille rangée dans une constante
          sort du relevé et n'est plus protégée par personne.
        */}
        <div className="overflow-x-auto">
          <div className="grid grid-cols-[86px_120px_minmax(160px,1fr)_minmax(190px,1.3fr)_140px_54px_minmax(180px,1.2fr)] min-w-[1010px] gap-2 px-3 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim">
            <span>ÉCRIT LE</span>
            <span>ORIGINE</span>
            <span>DESTINATAIRE</span>
            <span>SUJET</span>
            <span>ÉTAT</span>
            <span className="text-right">ESSAIS</span>
            <span>DERNIÈRE ERREUR</span>
          </div>

          {!file && <div className="px-3 py-4 text-[11px] text-text-dim">Chargement…</div>}

          {file?.messages.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => ouvrirMessage(m)}
              title="Ouvrir le message · son texte entier"
              className={`grid grid-cols-[86px_120px_minmax(160px,1fr)_minmax(190px,1.3fr)_140px_54px_minmax(180px,1.2fr)] min-w-[1010px] gap-2 px-3 w-full text-left py-1 items-center border-b border-border/40 text-[11px] hover:bg-sel-soft ${
                ouvert?.id === m.id ? 'bg-sel-soft' : ''
              }`}
            >
              <span className="font-mono text-[10px] text-text-dim">
                {new Date(m.createdAt).toLocaleDateString('fr-FR')}
              </span>
              <span className="text-[10.5px] truncate">{libelleOrigine(m.origine)}</span>
              <span className="truncate">
                {m.destinataireNom ? (
                  <>
                    {m.destinataireNom} <span className="text-text-dim font-mono text-[10px]">{m.destinataire}</span>
                  </>
                ) : (
                  <span className="font-mono text-[10.5px]">{m.destinataire}</span>
                )}
              </span>
              <span className="truncate">{m.sujet}</span>
              <span className="min-w-0">
                <Pastille statut={m.statut} />
              </span>
              <span className="text-right font-mono text-[10.5px]">{m.tentatives}</span>
              {/*
                L'erreur est rendue TELLE QUELLE par le transport · c'est elle
                qui distingue un refus d'authentification d'un domaine
                inexistant. Coupée à l'affichage seulement · le texte entier
                est dans la fiche, sous la liste.
              */}
              <span className="truncate text-[10px] text-danger">{m.erreur ?? ''}</span>
            </button>
          ))}
        </div>

        {file && file.messages.length === 0 && (
          <div className="px-3 py-5 text-[11px] text-text-dim italic">
            {filtre
              ? 'Aucun message dans cet état.'
              : 'Aucun courrier n’a encore été préparé sur ce dossier. Les rappels émis depuis « Rappel et relevé » viendront s’inscrire ici.'}
          </div>
        )}

        {/*
          UNE TRANCHE QUI SE DIT · un écran de travail peut ne montrer qu'une
          partie de la file, à condition de l'écrire (CLAUDE.md § 8 bis). Le
          total est pris sur le périmètre entier, pas sur la tranche rendue.
        */}
        {file && file.messages.length > 0 && (
          <div className="px-3 py-1.5 bg-chrome border-t border-border text-[10.5px] text-text-dim">
            {file.tronque ? (
              <>
                {file.messages.length} message(s) affiché(s) sur {file.total} · seuls les {file.plafond} plus récents
                sont montrés. Filtrez par état pour atteindre les autres.
              </>
            ) : (
              <>{file.total} message(s)</>
            )}
          </div>
        )}
      </div>

      {ouvert && <FicheMessage message={ouvert} onFermer={() => setOuvert(null)} />}
    </div>
  );
}

/**
 * LE MESSAGE ENTIER · sujet, destinataire, dates, et le CORPS tel qu'il a été
 * composé. C'est ce qui permet de défendre un dossier de recouvrement avec ce
 * qu'on a tenté : la lettre exacte, la date, et l'erreur qui l'a arrêtée.
 */
function FicheMessage({ message, onFermer }: { message: MessageComplet; onFermer: () => void }) {
  const etat = etatMessage(message.statut);
  return (
    <section className="mt-2.5 bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
      <header className="px-3 py-2 bg-chrome-alt border-b border-border flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-bold truncate">{message.sujet}</span>
        <div className="flex items-center gap-2 shrink-0">
          <Pastille statut={message.statut} />
          <button
            onClick={onFermer}
            className="border border-border rounded-[6px] bg-surface px-2.5 py-[3px] text-[10.5px] font-semibold hover:bg-chrome"
          >
            Fermer
          </button>
        </div>
      </header>

      <dl className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[10.5px]">
        <Ligne libelle="Destinataire">
          {message.destinataireNom ? `${message.destinataireNom} · ` : ''}
          <span className="font-mono">{message.destinataire}</span>
        </Ligne>
        <Ligne libelle="Origine">
          {libelleOrigine(message.origine)}
          {message.origineId && <span className="font-mono text-[10px] text-text-dim"> · {message.origineId}</span>}
        </Ligne>
        <Ligne libelle="Écrit le">{quand(message.createdAt)}</Ligne>
        <Ligne libelle="Tentatives">{message.tentatives}</Ligne>
        {message.dernierEssaiAt && <Ligne libelle="Dernier essai">{quand(message.dernierEssaiAt)}</Ligne>}
        {message.prochainEssaiAt && <Ligne libelle="Prochain essai au plus tôt">{quand(message.prochainEssaiAt)}</Ligne>}
        {message.envoyeAt && <Ligne libelle="Envoyé le">{quand(message.envoyeAt)}</Ligne>}
      </dl>

      <p className="px-3 pb-2 text-[10.5px] text-text-dim">{etat.explication}</p>

      {message.erreur && (
        <div className="mx-3 mb-2 rounded-[6px] border border-danger/30 bg-danger-soft px-2.5 py-1.5">
          {/*
            L'erreur du serveur de messagerie, MOT POUR MOT · la reformuler
            ferait perdre la seule chose qu'elle apprend, la différence entre
            un refus d'authentification et un domaine qui n'existe pas.
          */}
          <div className="text-[10px] font-bold text-danger">DERNIÈRE ERREUR RENDUE PAR LE SERVEUR DE MESSAGERIE</div>
          <pre className="mt-0.5 whitespace-pre-wrap font-mono text-[10px] leading-[1.5]">{message.erreur}</pre>
        </div>
      )}

      <div className="border-t border-border/40">
        <div className="px-3 pt-1.5 text-[10px] font-bold text-text-dim">TEXTE DU MESSAGE</div>
        {/* Entier, jamais coupé · un texte tronqué se lit comme le message et
            n'en est pas un. */}
        <pre className="px-3 pb-2.5 text-[10.5px] whitespace-pre-wrap font-sans leading-[1.6]">{message.corps}</pre>
      </div>
    </section>
  );
}

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[150px] shrink-0 text-text-dim">{libelle}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </div>
  );
}
