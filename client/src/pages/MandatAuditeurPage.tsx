import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';

/**
 * MANDAT DU CONTRÔLEUR DES COMPTES · auditeur au SYCEBNL, commissaire aux
 * comptes à l'AUSCGIE.
 *
 * L'écran existe parce que le contrôle 6 réclamait déjà de « vérifier que le
 * mandat est en cours » sans qu'aucune table ne le détienne. Il enregistre un
 * acte qui a eu lieu devant une assemblée · il ne désigne personne.
 *
 * LA DURÉE EST PROPOSÉE AVANT LA SAISIE, par la même fonction que le serveur
 * oppose au refus. Deux calculs auraient divergé, et le cabinet aurait
 * découvert le refus après le clic · c'est ce que la longueur de compte a déjà
 * appris.
 */
type Mandat = {
  id: string;
  nom: string;
  inscriptionOrdre: string;
  organeDesignation: string;
  dateDesignation: string;
  premierExercice: number;
  nombreExercices: number;
  dernierExerciceCouvert: number;
  rang: number;
  refusDeProrogation: boolean;
  finAnticipeeLe: string | null;
  motifFin: string | null;
};

type Duree = {
  exercices: number | null;
  mandatsMaximum: number | null;
  source: string;
  /** SYCEBNL art. 21, seconde phrase · la durée se ramène, elle se saisit (audit final F18). */
  reductionPossible: boolean;
};

const ORGANES: { valeur: string; libelle: string }[] = [
  { valeur: 'ASSEMBLEE_GENERALE_ORDINAIRE', libelle: 'Assemblée générale ordinaire' },
  { valeur: 'STATUTS_OU_AG_CONSTITUTIVE', libelle: 'Statuts ou assemblée générale constitutive' },
  { valeur: 'ASSOCIES', libelle: 'Associés (SARL)' },
  { valeur: 'BAILLEUR_OU_ETAT', libelle: 'Bailleur de fonds ou État bénéficiaire' },
  { valeur: 'JURIDICTION', libelle: 'Juridiction compétente' },
];

/**
 * La règle que le serveur tient pour le dossier (`regles-auditeur.ts`) · le
 * client ne la recalcule pas, il la montre. Un genre « aucune règle lue » est
 * rendu avec son motif plutôt qu'un seuil emprunté à une autre forme.
 */
type Obligation =
  | {
      genre: 'ALTERNATIF' | 'DEUX_SUR_TROIS';
      source: string;
      seuilBilan: number;
      seuilProduits: number;
      libelleProduits: string;
      seuilEffectif: number;
    }
  | { genre: 'TOUJOURS'; source: string; motif: string }
  | { genre: 'AUCUNE_REGLE_LUE'; motif: string };

// Les seuils sont libellés en FCFA dans les Actes uniformes, et le contrôle 6 les cite ainsi.
const fc = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

export function MandatAuditeurPage() {
  // L'enregistrement est réservé (`@Roles` ADMIN_CABINET, COMPTABLE) · la
  // lecture seule, souvent l'auditeur lui-même, consulte les mandats sans
  // voir un formulaire que le serveur lui refuserait.
  const { peutEcrire } = useAuth();
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [duree, setDuree] = useState<Duree | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [organe, setOrgane] = useState(ORGANES[0].valeur);
  const [nom, setNom] = useState('');
  const [inscription, setInscription] = useState('');
  const [dateDesignation, setDateDesignation] = useState('');
  const [premierExercice, setPremierExercice] = useState(new Date().getFullYear());
  const [nombreExercices, setNombreExercices] = useState(3);
  const [obligation, setObligation] = useState<Obligation | null>(null);

  const recharger = () =>
    api.get<{ mandats: Mandat[] }>('/mandat-auditeur').then((r) => setMandats(r.mandats));

  useEffect(() => {
    void recharger();
    // L'obligation elle-même (audit de l'interface du 2026-09-27, I12) · la
    // route la servait et aucun écran ne la lisait, si bien que la fenêtre
    // tenait des mandats sans dire si le dossier était tenu d'en avoir un.
    api.get<Obligation>('/mandat-auditeur/obligation').then(setObligation, () => setObligation(null));
  }, []);

  useEffect(() => {
    api
      .get<Duree>(`/mandat-auditeur/duree?organe=${organe}`)
      .then((d) => {
        setDuree(d);
        // La durée du texte est PROPOSÉE, pas imposée à l'écran · pour les
        // formes qu'aucun article ne chiffre, elle vaut null et la saisie reste
        // la seule source.
        if (d.exercices !== null) setNombreExercices(d.exercices);
      })
      .catch(() => setDuree(null));
  }, [organe]);

  async function enregistrer() {
    setErreur(null);
    try {
      await api.post('/mandat-auditeur', {
        nom,
        inscriptionOrdre: inscription,
        organeDesignation: organe,
        dateDesignation,
        premierExercice: Number(premierExercice),
        nombreExercices: Number(nombreExercices),
        rang: mandats.filter((m) => m.nom.trim() === nom.trim()).length + 1,
      });
      setNom('');
      setInscription('');
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'enregistrement n'a pas abouti.");
    }
  }

  /**
   * Les deux gestes d'un mandat en cours (audit de l'interface du
   * 2026-09-27, I11) · les routes existaient sans geste. Le refus de
   * prorogation est le SEUL fait que l'art. 22 du SYCEBNL oppose à la
   * prorogation de plein droit ; la fin anticipée porte sa date et son motif.
   */
  async function basculerRefusProrogation(m: Mandat) {
    setErreur(null);
    try {
      await api.patch(`/mandat-auditeur/${m.id}/prorogation`, { refus: !m.refusDeProrogation });
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'enregistrement n'a pas abouti.");
    }
  }

  async function clore(m: Mandat) {
    setErreur(null);
    const finAnticipeeLe = window.prompt('Date de fin du mandat (AAAA-MM-JJ)');
    if (!finAnticipeeLe) return;
    const motifFin = window.prompt('Motif de la fin du mandat');
    if (!motifFin?.trim()) return;
    try {
      await api.patch(`/mandat-auditeur/${m.id}/fin`, { finAnticipeeLe, motifFin: motifFin.trim() });
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'enregistrement n'a pas abouti.");
    }
  }

  return (
    <div className="p-2 max-w-[980px]">
      {obligation && (
        <section className="border border-border bg-surface px-3.5 py-2 mb-2.5 text-[11.5px]">
          <span className="font-bold">Obligation de désigner · </span>
          {obligation.genre === 'TOUJOURS' && <span>sans condition de taille</span>}
          {(obligation.genre === 'ALTERNATIF' || obligation.genre === 'DEUX_SUR_TROIS') && (
            <span>
              {obligation.genre === 'ALTERNATIF' ? 'un seul critère suffit' : 'deux critères sur trois'} · total du
              bilan au-delà de {fc(obligation.seuilBilan)}, {obligation.libelleProduits.toLowerCase()} au-delà de{' '}
              {fc(obligation.seuilProduits)}, effectif au-delà de {obligation.seuilEffectif}
            </span>
          )}
          {obligation.genre === 'AUCUNE_REGLE_LUE' && <span className="text-text-dim">{obligation.motif}</span>}
          {obligation.genre !== 'AUCUNE_REGLE_LUE' && (
            <span className="inline-flex ml-1.5 align-middle">
              <Aide
                titre="Obligation de désigner"
                texte={
                  obligation.genre === 'TOUJOURS'
                    ? obligation.motif
                    : 'Les seuils sont ceux du texte applicable au dossier. La sortie de l\'obligation (deux exercices consécutifs sous les seuils) n\'est pas mesurée ici.'
                }
                source={obligation.source}
              />
            </span>
          )}
        </section>
      )}
      {peutEcrire && (
        <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
          <h2 className="text-[11.5px] font-bold mb-1.5">Enregistrer un mandat</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-[11.5px]">
              Contrôleur ou cabinet
              <input className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={nom} onChange={(e) => setNom(e.target.value)} />
            </label>
            <label className="text-[11.5px]">
              <span className="inline-flex items-center gap-1">
                Inscription au tableau de l'ordre
                <Aide
                  titre="Inscription au tableau de l'ordre"
                  texte="La référence d'inscription est exigée et jamais vérifiée · le texte veut un expert-comptable inscrit au tableau de l'ordre, mais OmegaX ne consulte aucun tableau. Il conserve la référence, parce que c'est elle qu'un réviseur demandera."
                  source="SYCEBNL art. 20"
                />
              </span>
              <input
                className="w-full border border-border px-1.5 py-1 text-[11.5px]"
                value={inscription}
                onChange={(e) => setInscription(e.target.value)}
                placeholder="ONEC/EC/…"
              />
            </label>
            <label className="text-[11.5px]">
              Organe qui a désigné
              <select className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={organe} onChange={(e) => setOrgane(e.target.value)}>
                {ORGANES.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11.5px]">
              Date de désignation
              <input type="date" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={dateDesignation} onChange={(e) => setDateDesignation(e.target.value)} />
            </label>
            <label className="text-[11.5px]">
              Premier exercice couvert
              <input type="number" className="w-full border border-border px-1.5 py-1 text-[11.5px]" value={premierExercice} onChange={(e) => setPremierExercice(Number(e.target.value))} />
            </label>
            <label className="text-[11.5px]">
              Nombre d'exercices
              <input
                type="number"
                className="w-full border border-border px-1.5 py-1 text-[11.5px]"
                value={nombreExercices}
                onChange={(e) => setNombreExercices(Number(e.target.value))}
                min={1}
                max={duree?.reductionPossible ? (duree.exercices ?? undefined) : undefined}
                disabled={duree?.exercices !== null && duree?.exercices !== undefined && !duree.reductionPossible}
              />
            </label>
          </div>

          {duree && (
            <p className="text-[11px] text-text-dim mt-2 leading-[1.6]">
              {duree.exercices === null ? (
                <>Aucune durée n'est chiffrée pour cette forme · {duree.source} Elle se saisit.</>
              ) : (
                <>
                  Durée : <strong>{duree.exercices} exercice(s)</strong> · {duree.source}.
                  {duree.reductionPossible && (
                    <>
                      {' '}Moins si l'entité existe depuis moins longtemps{' '}
                      <Aide
                        titre="Durée ramenée"
                        texte="« Si l'entité a une existence inférieure à trois exercices, son mandat est ramené à cette durée. » OmegaX ne mesure pas cette existence : les exercices ouverts dans le logiciel ne la disent pas. Saisissez la durée ramenée, jamais plus de trois."
                        source="SYCEBNL art. 21, seconde phrase"
                      />
                    </>
                  )}
                  {duree.mandatsMaximum !== null && (
                    <> Renouvelable {duree.mandatsMaximum - 1} fois, pas davantage.</>
                  )}
                </>
              )}
            </p>
          )}

          {erreur && <p className="text-[11.5px] text-danger mt-2">{erreur}</p>}
          <button className="mt-2 border border-border px-2.5 py-1 text-[11.5px]" onClick={() => void enregistrer()}>
            Enregistrer
          </button>
        </section>
      )}

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          Mandats enregistrés
          <Aide
            titre="Mandat du contrôleur des comptes"
            texte="Auditeur au SYCEBNL, commissaire aux comptes à l'AUSCGIE. OmegaX enregistre un acte qui a eu lieu devant une assemblée : il ne désigne personne et ne proroge rien de lui-même."
            source="SYCEBNL art. 19 à 22 · AUSCGIE art. 379, 703 à 705"
          />
        </h2>
        {mandats.length === 0 ? (
          <p className="text-[11.5px] text-text-dim">Aucun mandat enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Contrôleur</th>
                  <th className="py-1 pr-2">Inscription</th>
                  <th className="py-1 pr-2">Désigné le</th>
                  <th className="py-1 pr-2">Exercices couverts</th>
                  <th className="py-1 pr-2">Rang</th>
                  <th className="py-1">
                    <span className="inline-flex items-center gap-1">
                      État
                      <Aide
                        titre="Prorogation du mandat"
                        texte="Un mandat dont le dernier exercice est passé n'est pas un trou · la mission est prorogée de plein droit « sauf refus exprès » du contrôleur, jusqu'à la prochaine assemblée statuant sur les comptes. Seul ce refus laisse l'entité sans contrôleur, et c'est lui que la colonne « État » enregistre."
                        source="SYCEBNL art. 22"
                      />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mandats.map((m) => (
                  <tr key={m.id} className="border-b border-border/60">
                    <td className="py-1 pr-2">{m.nom}</td>
                    <td className="py-1 pr-2">{m.inscriptionOrdre}</td>
                    <td className="py-1 pr-2">{m.dateDesignation.slice(0, 10)}</td>
                    <td className="py-1 pr-2">
                      {m.premierExercice} à {m.dernierExerciceCouvert}
                    </td>
                    <td className="py-1 pr-2">{m.rang}</td>
                    <td className="py-1">
                      {m.finAnticipeeLe
                        ? `Clos le ${m.finAnticipeeLe.slice(0, 10)} · ${m.motifFin ?? ''}`
                        : m.refusDeProrogation
                          ? 'Prorogation refusée'
                          : 'En cours'}
                      {peutEcrire && !m.finAnticipeeLe && (
                        <span className="ml-2 inline-flex gap-1">
                          <button
                            type="button"
                            className="border border-border px-1.5 py-0.5 text-[11px]"
                            onClick={() => void basculerRefusProrogation(m)}
                          >
                            {m.refusDeProrogation ? 'Lever le refus de prorogation' : 'Refus de prorogation'}
                          </button>
                          <button type="button" className="border border-border px-1.5 py-0.5 text-[11px]" onClick={() => void clore(m)}>
                            Mettre fin au mandat
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
