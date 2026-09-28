import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { Aide } from '../components/chrome/Aide';
import { PortailModale } from '../components/PortailModale';
import type { Compte, Exercice, ProvisionRisqueCharge, TableauVariationProvisions } from '../lib/types';
import { useExercice } from '../lib/exercice';
import { montant } from '../lib/montants';

/**
 * REGISTRE DES PROVISIONS POUR RISQUES ET CHARGES.
 *
 * L'écran est bâti autour de trois choses que personne ne tient à la main :
 *
 *  - LE TABLEAU DES MOUVEMENTS, dans l'ordre exact du ch. 18 § 5.3, celui que
 *    le CPCC demande à l'auditeur d'obtenir. Les utilisations et les reprises
 *    y restent SÉPARÉES : une provision utilisée était justifiée, une
 *    provision reprise ne l'était pas, et les additionner effacerait la seule
 *    information que la ligne portait sur la qualité de l'estimation ;
 *  - LE RAPPROCHEMENT avec le solde du compte. Un registre qui ne se compare
 *    à rien est une feuille de calcul de plus ;
 *  - LES PASSIFS ÉVENTUELS, listés à part et avec la condition qui manque.
 *    Ce sont les risques que le bilan ne porte pas et que l'annexe doit dire.
 *
 * LA SAISIE EST ICI, ET NULLE PART AILLEURS (audit du 2026-09-26, B3). Jusque
 * là, ce commentaire affirmait qu'elle se faisait « ligne par ligne » ailleurs,
 * et aucune fenêtre ne l'offrait : le tableau restait vide pour tout dossier,
 * et son rapprochement ne rapprochait rien. Création, modification,
 * changement de statut, suppression et report à l'ouverture de l'exercice
 * suivant sont désormais servis, sous `peutEcrire`.
 *
 * LE SERVEUR PORTE LES TROIS REFUS (nature interdite, condition manquante,
 * remboursement compensé) et l'écran les affiche TELS QUELS · il ne les
 * redouble pas, un contrôle recopié côté client finit toujours par diverger de
 * celui qui compte. D'où deux choix qui pourraient passer pour des oublis :
 *
 *  - les NATURES proposées sont celles que le serveur sert pour le référentiel
 *    du dossier (`naturesDuReferentiel()`, lues dans le tableau de variation),
 *    jamais une liste de numéros écrite ici · au 192, les deux plans ne logent
 *    pas la même chose ;
 *  - les deux natures INTERDITES du § 4.11 sont proposées quand même, à part.
 *    Les retirer ne les empêcherait pas : elles seraient saisies sous « divers
 *    risques et charges », et plus personne ne saurait ce qu'il y a dedans.
 *    Proposées, elles s'examinent, et le serveur refuse de les comptabiliser
 *    avec l'article et la voie de rechange.
 */

const LIBELLE_STATUT: Record<string, string> = {
  EN_EXAMEN: 'En examen',
  COMPTABILISEE: 'Comptabilisée',
  PASSIF_EVENTUEL: 'Passif éventuel',
  ECARTEE: 'Écartée',
  SOLDEE: 'Soldée',
};

const LIBELLE_NATURE: Record<string, string> = {
  LITIGE: 'Litiges',
  GARANTIE_CLIENTS: 'Garanties données aux clients',
  PERTES_MARCHES_ACHEVEMENT_FUTUR: 'Pertes sur marchés à achèvement futur',
  CHARGES_DONATIONS_LEGS: 'Charges sur donations et legs',
  PERTES_DE_CHANGE: 'Pertes de change',
  IMPOTS: 'Impôts',
  PENSIONS_ET_OBLIGATIONS_SIMILAIRES: 'Pensions et obligations similaires',
  RESTRUCTURATION: 'Restructurations',
  AMENDES_ET_PENALITES: 'Amendes et pénalités',
  DEMANTELEMENT_ET_REMISE_EN_ETAT: 'Démantèlement et remise en état',
  PROPRE_ASSUREUR: 'Propre assureur',
  DROITS_A_REDUCTION: 'Droits à réduction ou avantage en nature',
  CONTRAT_DEFICITAIRE: 'Contrat déficitaire',
  DEMENAGEMENT: 'Déménagement',
  DIVERS_RISQUES_ET_CHARGES: 'Divers risques et charges',
  PERTES_OPERATIONNELLES_FUTURES: 'Pertes opérationnelles futures (interdite)',
  GROSSES_REPARATIONS: 'Grosses réparations (interdite)',
};

/**
 * Les deux natures que le ch. 18 § 4.11 interdit NOMMÉMENT. Elles n'ont aucun
 * compte dans aucun plan, et le serveur ne les sert donc pas parmi les natures
 * du dossier · elles sont ajoutées ici pour être examinées et refusées, pas
 * pour être comptabilisées (voir l'en-tête).
 */
const NATURES_INTERDITES = ['PERTES_OPERATIONNELLES_FUTURES', 'GROSSES_REPARATIONS'];

const CONDITIONS: { cle: 'obligationExiste' | 'resulteEvenementPasse' | 'sortieProbable' | 'estimationFiable'; libelle: string }[] = [
  { cle: 'obligationExiste', libelle: 'Obligation juridique ou implicite à la clôture' },
  { cle: 'resulteEvenementPasse', libelle: "Résulte d'un événement passé" },
  { cle: 'sortieProbable', libelle: 'Sortie de ressources probable' },
  { cle: 'estimationFiable', libelle: 'Estimation fiable du montant' },
];

type Formulaire = {
  objet: string;
  nature: string;
  compteId: string;
  statut: string;
  obligationExiste: boolean;
  resulteEvenementPasse: boolean;
  sortieProbable: boolean;
  estimationFiable: boolean;
  justificationObligation: string;
  echeanceAttendue: string;
  incertitudes: string;
  montantOuverture: string;
  dotationsExercice: string;
  montantsUtilises: string;
  reprisesNonUtilisees: string;
  effetActualisation: string;
  remboursementAttendu: string;
  remboursementCertain: boolean;
  remboursementTiers: string;
  motifNonComptabilisation: string;
};

const texte = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function formulaireVide(nature: string): Formulaire {
  return {
    objet: '',
    nature,
    compteId: '',
    statut: 'EN_EXAMEN',
    obligationExiste: false,
    resulteEvenementPasse: false,
    sortieProbable: false,
    estimationFiable: false,
    justificationObligation: '',
    echeanceAttendue: '',
    incertitudes: '',
    montantOuverture: '',
    dotationsExercice: '',
    montantsUtilises: '',
    reprisesNonUtilisees: '',
    effetActualisation: '',
    remboursementAttendu: '',
    remboursementCertain: false,
    remboursementTiers: '',
    motifNonComptabilisation: '',
  };
}

function formulaireDe(p: ProvisionRisqueCharge): Formulaire {
  return {
    objet: p.objet,
    nature: p.nature,
    compteId: p.compteId ?? '',
    statut: p.statut,
    obligationExiste: p.obligationExiste,
    resulteEvenementPasse: p.resulteEvenementPasse,
    sortieProbable: p.sortieProbable,
    estimationFiable: p.estimationFiable,
    justificationObligation: p.justificationObligation,
    echeanceAttendue: p.echeanceAttendue ? p.echeanceAttendue.slice(0, 10) : '',
    incertitudes: texte(p.incertitudes),
    montantOuverture: texte(p.montantOuverture),
    dotationsExercice: texte(p.dotationsExercice),
    montantsUtilises: texte(p.montantsUtilises),
    reprisesNonUtilisees: texte(p.reprisesNonUtilisees),
    effetActualisation: texte(p.effetActualisation),
    remboursementAttendu: texte(p.remboursementAttendu),
    remboursementCertain: p.remboursementCertain,
    remboursementTiers: texte(p.remboursementTiers),
    motifNonComptabilisation: texte(p.motifNonComptabilisation),
  };
}

/**
 * Un champ numérique vide n'est pas zéro pour la création (le serveur pose
 * son propre défaut) · `undefined` le fait disparaître du corps JSON. Une
 * saisie illisible est rendue telle quelle, en NaN, pour que le serveur la
 * refuse plutôt qu'elle ne devienne zéro en silence.
 */
const nombre = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v.replace(/\s/g, '').replace(',', '.')));

/**
 * À la MODIFICATION, un montant de mouvement vidé vaut zéro · la colonne n'est
 * pas nullable, et `undefined` laisserait l'ancien montant en place alors que
 * le champ affiché est vide.
 */
const nombreOuZero = (v: string): number => nombre(v) ?? 0;

const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');
const messageDe = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

export function ProvisionsPage() {
  const { peutEcrire } = useAuth();
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [exerciceId, setExerciceId] = useState('');
  const [tableau, setTableau] = useState<TableauVariationProvisions | null>(null);
  const [liste, setListe] = useState<ProvisionRisqueCharge[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Chaque écriture réussie fait monter ce compteur, qui relit la liste ET le
  // tableau de variation · les deux doivent dire la même chose du registre.
  const [version, setVersion] = useState(0);

  // Une seule modale pour la création et la modification, deux routes
  // derrière · `id` nul veut dire « créer ».
  const [edition, setEdition] = useState<{ id: string | null; f: Formulaire } | null>(null);
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Le statut a sa propre route, parce que le serveur y exige le motif dès
  // que la ligne sort du bilan (passif éventuel, écartée, soldée).
  const [statutCible, setStatutCible] = useState<{ ligne: ProvisionRisqueCharge; statut: string; motif: string } | null>(null);
  const [erreurStatut, setErreurStatut] = useState<string | null>(null);

  // L'EXERCICE DU CONTEXTE (audit final F154) · le plus récent n'est qu'un
  // repli, voir `resoudreExercice`.
  const { exerciceCourant } = useExercice();

  useEffect(() => {
    if (exerciceCourant) setExerciceId(exerciceCourant.id);
  }, [exerciceCourant?.id]);

  useEffect(() => {
    api.get<Exercice[]>('/exercices').then((l) => {
      setExercices(l);
      if (l.length > 0) setExerciceId((choisi) => choisi || l[0].id);
    }, (e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    if (!peutEcrire) return;
    api.get<Compte[]>('/comptes?actifsSeuls=true&typeCompte=DETAIL&retenus=true').then(setComptes, () => setComptes([]));
  }, [peutEcrire]);

  useEffect(() => {
    if (!exerciceId) return;
    setErreur(null);
    // Deux lectures indépendantes, parties ensemble (§ temps de chargement).
    Promise.all([
      api.get<TableauVariationProvisions>(`/provisions/variation/${exerciceId}`),
      api.get<ProvisionRisqueCharge[]>(`/provisions?exerciceId=${encodeURIComponent(exerciceId)}`),
    ]).then(
      ([tab, l]) => {
        setTableau(tab);
        setListe(l);
      },
      (e) => setErreur(messageDe(e)),
    );
  }, [exerciceId, version]);

  const t = tableau;
  const ecartsSignales = (t?.rapprochement ?? []).filter((r) => Math.abs(r.ecart) >= 0.01);
  const naturesServies = t?.natures ?? [];

  /**
   * L'exercice qui SUIT celui qui est affiché · le premier qui commence après
   * sa fin. Aucun, et le report n'a nulle part où aller : le bouton le dit.
   */
  const courant = exercices.find((e) => e.id === exerciceId);
  const suivant = courant
    ? exercices
        .filter((e) => new Date(e.dateDebut).getTime() > new Date(courant.dateFin).getTime())
        .sort((x, y) => new Date(x.dateDebut).getTime() - new Date(y.dateDebut).getTime())[0]
    : undefined;

  /**
   * Les comptes proposés pour une nature sont ceux du plan du dossier qui
   * commencent par le numéro que le SERVEUR associe à cette nature · aucun
   * numéro n'est écrit ici. Une nature interdite n'en a aucun, ce qui est
   * juste : elle ne se comptabilise pas.
   */
  function comptesDeLaNature(nature: string, compteIdCourant: string): Compte[] {
    const servie = naturesServies.find((n) => n.nature === nature);
    return comptes.filter((c) => (servie !== undefined && c.numero.startsWith(servie.compte)) || c.id === compteIdCourant);
  }

  function ouvrirCreation() {
    setErreurEdition(null);
    setEdition({ id: null, f: formulaireVide(naturesServies[0]?.nature ?? '') });
  }

  function ouvrirModification(p: ProvisionRisqueCharge) {
    setErreurEdition(null);
    setEdition({ id: p.id, f: formulaireDe(p) });
  }

  function champ<K extends keyof Formulaire>(cle: K, valeur: Formulaire[K]) {
    setEdition((ed) => (ed ? { ...ed, f: { ...ed.f, [cle]: valeur } } : ed));
  }

  async function enregistrer(ev: React.FormEvent) {
    ev.preventDefault();
    if (!edition) return;
    const f = edition.f;
    setEnvoi(true);
    setErreurEdition(null);
    try {
      if (edition.id === null) {
        await api.post<ProvisionRisqueCharge>(`/provisions/${exerciceId}`, {
          objet: f.objet,
          nature: f.nature,
          compteId: f.compteId || undefined,
          statut: f.statut,
          obligationExiste: f.obligationExiste,
          resulteEvenementPasse: f.resulteEvenementPasse,
          sortieProbable: f.sortieProbable,
          estimationFiable: f.estimationFiable,
          justificationObligation: f.justificationObligation,
          echeanceAttendue: f.echeanceAttendue || undefined,
          incertitudes: f.incertitudes || undefined,
          montantOuverture: nombre(f.montantOuverture),
          dotationsExercice: nombre(f.dotationsExercice),
          montantsUtilises: nombre(f.montantsUtilises),
          reprisesNonUtilisees: nombre(f.reprisesNonUtilisees),
          effetActualisation: nombre(f.effetActualisation),
          remboursementAttendu: nombre(f.remboursementAttendu),
          remboursementCertain: f.remboursementCertain,
          remboursementTiers: f.remboursementTiers || undefined,
          motifNonComptabilisation: f.motifNonComptabilisation || undefined,
        });
      } else {
        // Le statut ne passe PAS par ici · il a sa route, qui porte le motif.
        // Un champ vidé part à null pour être effacé, sans quoi l'ancien
        // contenu survivrait sous un champ affiché vide.
        await api.patch<ProvisionRisqueCharge>(`/provisions/${edition.id}`, {
          objet: f.objet,
          nature: f.nature,
          compteId: f.compteId || null,
          obligationExiste: f.obligationExiste,
          resulteEvenementPasse: f.resulteEvenementPasse,
          sortieProbable: f.sortieProbable,
          estimationFiable: f.estimationFiable,
          justificationObligation: f.justificationObligation,
          echeanceAttendue: f.echeanceAttendue || null,
          incertitudes: f.incertitudes || null,
          montantOuverture: nombreOuZero(f.montantOuverture),
          dotationsExercice: nombreOuZero(f.dotationsExercice),
          montantsUtilises: nombreOuZero(f.montantsUtilises),
          reprisesNonUtilisees: nombreOuZero(f.reprisesNonUtilisees),
          effetActualisation: nombreOuZero(f.effetActualisation),
          remboursementAttendu: nombre(f.remboursementAttendu) ?? null,
          remboursementCertain: f.remboursementCertain,
          remboursementTiers: f.remboursementTiers || null,
          motifNonComptabilisation: f.motifNonComptabilisation || null,
        });
      }
      setEdition(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreurEdition(messageDe(e));
    } finally {
      setEnvoi(false);
    }
  }

  async function statuer(ev: React.FormEvent) {
    ev.preventDefault();
    if (!statutCible) return;
    setEnvoi(true);
    setErreurStatut(null);
    try {
      await api.patch<ProvisionRisqueCharge>(`/provisions/${statutCible.ligne.id}/statut`, {
        statut: statutCible.statut,
        motifNonComptabilisation: statutCible.motif || undefined,
      });
      setStatutCible(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreurStatut(messageDe(e));
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(p: ProvisionRisqueCharge) {
    if (!window.confirm(`Supprimer « ${p.objet} » du registre ? Cette suppression est définitive.`)) return;
    setErreur(null);
    try {
      await api.delete<{ supprimee: boolean }>(`/provisions/${p.id}`);
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(messageDe(e));
    }
  }

  async function reporter() {
    if (!courant || !suivant) return;
    setErreur(null);
    setMessage(null);
    try {
      const r = await api.post<{ reportees: number; examinees: number; ignorees: number }>('/provisions/reporter/ouverture', {
        exerciceSourceId: courant.id,
        exerciceCibleId: suivant.id,
      });
      setMessage(
        `${r.reportees} ligne(s) reportée(s) à l'ouverture de l'exercice commençant le ${jour(suivant.dateDebut)} · ` +
          `${r.ignorees} non reportée(s) sur ${r.examinees}.`,
      );
    } catch (e) {
      setErreur(messageDe(e));
    }
  }

  return (
    <div className="p-2">
      <EnteteImpression titre="Registre des provisions pour risques et charges" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="flex items-center justify-end gap-2">
          {peutEcrire && (
            <>
              <button
                type="button"
                onClick={ouvrirCreation}
                disabled={!exerciceId || !t}
                className="bg-sel text-white rounded-full px-3 py-[3px] text-[11.5px] font-semibold disabled:opacity-50"
              >
                + Nouvelle provision
              </button>
              <button
                type="button"
                onClick={reporter}
                disabled={!suivant}
                title={suivant ? undefined : "Aucun exercice ne suit celui-ci"}
                className="border border-bord rounded-[3px] px-2 py-[2px] text-[11.5px] disabled:opacity-50"
              >
                Reporter à l'ouverture de l'exercice suivant
              </button>
            </>
          )}
          <Aide
            titre="Provisions, passifs et actifs éventuels"
            texte="Le registre suit le tableau des mouvements du ch. 18 § 5.3 : utilisations et reprises restent séparées, et chaque provision est rapprochée du solde de son compte."
            source="AUDCIF Titre VIII ch. 18"
          />
          <select
            value={exerciceId}
            onChange={(e) => setExerciceId(e.target.value)}
            className="border border-bord rounded-[3px] px-2 py-[2px] text-[11.5px]"
          >
            {exercices.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {new Date(ex.dateDebut).toLocaleDateString('fr-FR')} au{' '}
                {new Date(ex.dateFin).toLocaleDateString('fr-FR')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {erreur && (
        <div className="mb-1.5 max-w-[1240px] border border-rouge/40 bg-rouge/5 text-rouge rounded-[3px] px-2 py-1 text-[11.5px]">
          {erreur}
        </div>
      )}
      {message && (
        <div className="ecran-seul mb-1.5 max-w-[1240px] border border-bord rounded-[3px] px-2 py-1 text-[11.5px]">{message}</div>
      )}

      {t && (
        <div className="max-w-[1240px] space-y-2">
          {/*
            LE RAPPROCHEMENT PASSE EN PREMIER, et en rouge. C'est le seul
            chiffre de cet écran qui dit qu'une écriture manque : un écart
            entre le registre et le solde du compte ne déséquilibre rien, ne
            fait tomber aucun contrôle, et ne se voit nulle part ailleurs.
          */}
          {ecartsSignales.length > 0 && (
            <div className="border border-rouge/40 bg-rouge/5 rounded-[3px] px-2 py-1.5">
              <div className="text-[11.5px] font-semibold text-rouge mb-1 flex items-center gap-1.5">
                {ecartsSignales.length} compte(s) où le registre et la balance ne disent pas la même chose
                <Aide
                  titre="Écart registre / balance"
                  texte="Une dotation passée sans être documentée, ou documentée sans être passée. Ni l'une ni l'autre ne déséquilibre la balance."
                  source="AUDCIF Titre VIII ch. 18 § 5.3"
                />
              </div>
              <table className="w-full text-[11.5px]">
                <thead className="text-text-dim">
                  <tr>
                    <th className="text-left font-normal">Compte</th>
                    <th className="text-right font-normal">Registre</th>
                    <th className="text-right font-normal">Solde comptable</th>
                    <th className="text-right font-normal">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {ecartsSignales.map((r) => (
                    <tr key={r.numero}>
                      <td className="font-mono">{r.numero}</td>
                      <td className="text-right tabular-nums">{montant(r.montantRegistre)}</td>
                      <td className="text-right tabular-nums">{montant(r.soldeComptable)}</td>
                      <td className="text-right tabular-nums font-semibold text-rouge">{montant(r.ecart)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border border-bord rounded-[3px] overflow-x-auto">
            <table className="w-full text-[11.5px] whitespace-nowrap">
              <thead className="bg-fond-2 text-text-dim">
                <tr>
                  <th className="text-left font-normal px-1.5 py-1">Objet</th>
                  <th className="text-left font-normal px-1.5">Nature</th>
                  <th className="text-left font-normal px-1.5">Compte</th>
                  <th className="text-left font-normal px-1.5">Statut</th>
                  <th className="text-right font-normal px-1.5">Ouverture</th>
                  <th className="text-right font-normal px-1.5">Dotations</th>
                  <th className="text-right font-normal px-1.5">Utilisations</th>
                  <th className="text-right font-normal px-1.5">Reprises</th>
                  <th className="text-right font-normal px-1.5">Actualisation</th>
                  <th className="text-right font-normal px-1.5">Clôture</th>
                  <th className="text-left font-normal px-1.5">Échéance</th>
                </tr>
              </thead>
              <tbody>
                {t.detail.map((l) => (
                  <tr key={l.id} className="border-t border-bord/50">
                    <td className="px-1.5 py-[3px] max-w-[240px] truncate" title={l.objet}>
                      {l.objet}
                    </td>
                    <td className="px-1.5">{LIBELLE_NATURE[l.nature] ?? l.nature}</td>
                    <td className="px-1.5 font-mono">{l.compte?.numero ?? '·'}</td>
                    <td className="px-1.5">{LIBELLE_STATUT[l.statut] ?? l.statut}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.montantOuverture)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.dotationsExercice)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.montantsUtilises)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.reprisesNonUtilisees)}</td>
                    <td className="px-1.5 text-right tabular-nums">{montant(l.effetActualisation)}</td>
                    <td className="px-1.5 text-right tabular-nums font-semibold">{montant(l.montantCloture)}</td>
                    <td className="px-1.5">{jour(l.echeanceAttendue)}</td>
                  </tr>
                ))}
                {t.detail.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-1.5 py-2 text-text-dim">
                      Aucune provision inscrite au registre pour cet exercice.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-fond-2 font-semibold">
                <tr>
                  <td className="px-1.5 py-1" colSpan={4}>
                    Total
                  </td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.montantOuverture)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.dotationsExercice)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.montantsUtilises)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.reprisesNonUtilisees)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.effetActualisation)}</td>
                  <td className="px-1.5 text-right tabular-nums">{montant(t.totaux.montantCloture)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/*
            LA LISTE DES LIGNES, avec ce que le tableau des mouvements ne
            montre pas · les quatre conditions et le motif. Les actions n'y
            sont proposées qu'à qui peut écrire : le serveur refuserait
            sinon, et l'écran mentirait sur ce que l'utilisateur peut faire.
          */}
          <div className="ecran-seul border border-bord rounded-[3px] overflow-x-auto">
            <div className="px-2 py-1 text-[11.5px] font-semibold">Lignes du registre</div>
            <table className="w-full text-[11.5px] whitespace-nowrap">
              <thead className="bg-fond-2 text-text-dim">
                <tr>
                  <th className="text-left font-normal px-1.5 py-1">Objet</th>
                  <th className="text-left font-normal px-1.5">Nature</th>
                  <th className="text-left font-normal px-1.5">Statut</th>
                  <th className="text-left font-normal px-1.5">Conditions</th>
                  <th className="text-left font-normal px-1.5">Motif</th>
                  {peutEcrire && <th className="text-left font-normal px-1.5">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {liste.map((p) => (
                  <tr key={p.id} className="border-t border-bord/50">
                    <td className="px-1.5 py-[3px] max-w-[240px] truncate" title={p.objet}>
                      {p.objet}
                    </td>
                    <td className="px-1.5">{LIBELLE_NATURE[p.nature] ?? p.nature}</td>
                    <td className="px-1.5">{LIBELLE_STATUT[p.statut] ?? p.statut}</td>
                    <td className="px-1.5">
                      {CONDITIONS.filter((c) => p[c.cle]).length} / {CONDITIONS.length}
                    </td>
                    <td className="px-1.5 max-w-[240px] truncate" title={p.motifNonComptabilisation ?? ''}>
                      {p.motifNonComptabilisation ?? '·'}
                    </td>
                    {peutEcrire && (
                      <td className="px-1.5 space-x-2">
                        <button type="button" onClick={() => ouvrirModification(p)} className="text-sel hover:underline">
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErreurStatut(null);
                            setStatutCible({ ligne: p, statut: p.statut, motif: p.motifNonComptabilisation ?? '' });
                          }}
                          className="text-sel hover:underline"
                        >
                          Statut
                        </button>
                        <button type="button" onClick={() => supprimer(p)} className="text-rouge hover:underline">
                          Supprimer
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {liste.length === 0 && (
                  <tr>
                    <td colSpan={peutEcrire ? 6 : 5} className="px-1.5 py-2 text-text-dim">
                      Aucune ligne pour cet exercice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/*
            LES PASSIFS ÉVENTUELS SONT LISTÉS À PART, avec la condition qui
            manque. Ils ne sont dans aucun compte et n'apparaissent sur aucun
            total : sans cette liste, un risque examiné puis écarté ne se
            verrait nulle part, et l'annexe resterait muette · le texte veut
            exactement l'inverse.
          */}
          {t.passifsEventuels.length > 0 && (
            <div className="border border-bord rounded-[3px] px-2 py-1.5">
              <div className="text-[11.5px] font-semibold mb-1">
                Passifs éventuels · à mentionner aux Notes annexes, rien au bilan
              </div>
              <ul className="text-[11.5px] space-y-[3px]">
                {t.passifsEventuels.map((l) => (
                  <li key={l.id}>
                    <span className="font-medium">{l.objet}</span>
                    <span className="text-text-dim"> · condition non réunie : {l.conditionsManquantes.join(' ; ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-bord rounded-[3px] px-2 py-1.5">
            <div className="text-[11.5px] font-semibold mb-1 flex items-center gap-1.5">
              Natures admises dans le plan de ce dossier
              <Aide
                titre="Natures par référentiel"
                texte="Les deux référentiels emploient les mêmes numéros pour des natures différentes · au 192, le SYSCOHADA loge les garanties données aux clients, le SYCEBNL les charges sur donations et legs."
                source="Plans de comptes SYSCOHADA et SYCEBNL"
              />
            </div>
            <ul className="text-[11.5px] grid grid-cols-2 gap-x-4">
              {t.natures.map((n) => (
                <li key={n.nature}>
                  <span className="font-mono">{n.compte}</span> · {n.intitule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {peutEcrire && edition && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form onSubmit={enregistrer} className="anim-modale w-full max-w-[640px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span>{edition.id === null ? 'Nouvelle provision' : 'Modifier la provision'}</span>
                <button type="button" onClick={() => setEdition(null)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                  ✕
                </button>
              </div>
              <div className="p-4 text-[11.5px]">
                {/* Le refus du serveur, tel quel · il porte l'article et la voie de rechange. */}
                {erreurEdition && (
                  <div className="mb-2 border border-rouge/40 bg-rouge/5 text-rouge rounded-[3px] px-2 py-1 whitespace-pre-wrap">{erreurEdition}</div>
                )}
                <div className="grid grid-cols-[170px_1fr] items-center gap-x-3 gap-y-2">
                  <label className="text-right">Objet :</label>
                  <input required maxLength={500} value={edition.f.objet} onChange={(e) => champ('objet', e.target.value)} className="border border-border-dark px-2 py-1" />
                  <label className="text-right">Nature :</label>
                  <select
                    required
                    value={edition.f.nature}
                    onChange={(e) => {
                      champ('nature', e.target.value);
                      champ('compteId', '');
                    }}
                    className="border border-border-dark px-2 py-1"
                  >
                    {naturesServies.map((n) => (
                      <option key={n.nature} value={n.nature}>
                        {n.compte} · {LIBELLE_NATURE[n.nature] ?? n.intitule}
                      </option>
                    ))}
                    <optgroup label="Provisions interdites" title="AUDCIF Titre VIII ch. 18 § 4.11">
                      {NATURES_INTERDITES.map((n) => (
                        <option key={n} value={n}>
                          {LIBELLE_NATURE[n] ?? n}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <label className="text-right">Compte :</label>
                  <select value={edition.f.compteId} onChange={(e) => champ('compteId', e.target.value)} className="border border-border-dark px-2 py-1">
                    <option value="">Aucun (non comptabilisée)</option>
                    {comptesDeLaNature(edition.f.nature, edition.f.compteId).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} · {c.intitule}
                      </option>
                    ))}
                  </select>
                  {edition.id === null && (
                    <>
                      <label className="text-right">Statut :</label>
                      <select value={edition.f.statut} onChange={(e) => champ('statut', e.target.value)} className="border border-border-dark px-2 py-1">
                        {Object.entries(LIBELLE_STATUT).map(([cle, libelle]) => (
                          <option key={cle} value={cle}>
                            {libelle}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <span className="text-right self-start pt-1 flex items-center justify-end gap-1">
                    Conditions :
                    <Aide
                      titre="Les quatre conditions"
                      texte="Une provision ne se comptabilise que si les quatre sont réunies. Une condition qui manque bascule la ligne en passif éventuel, avec son motif écrit."
                      source="AUDCIF Titre VIII ch. 18 § 2.1"
                    />
                  </span>
                  <div className="space-y-[2px]">
                    {CONDITIONS.map((c) => (
                      <label key={c.cle} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={edition.f[c.cle]} onChange={(e) => champ(c.cle, e.target.checked)} />
                        {c.libelle}
                      </label>
                    ))}
                  </div>
                  <label className="text-right self-start pt-1">Source de l'obligation :</label>
                  <textarea required rows={2} value={edition.f.justificationObligation} onChange={(e) => champ('justificationObligation', e.target.value)} className="border border-border-dark px-2 py-1" />
                  <label className="text-right">Échéance attendue :</label>
                  <input type="date" value={edition.f.echeanceAttendue} onChange={(e) => champ('echeanceAttendue', e.target.value)} className="border border-border-dark px-2 py-1" />
                  <label className="text-right self-start pt-1">Incertitudes :</label>
                  <textarea rows={2} value={edition.f.incertitudes} onChange={(e) => champ('incertitudes', e.target.value)} className="border border-border-dark px-2 py-1" />
                  {(
                    [
                      ['montantOuverture', 'Ouverture'],
                      ['dotationsExercice', 'Dotations'],
                      ['montantsUtilises', 'Utilisations'],
                      ['reprisesNonUtilisees', 'Reprises non utilisées'],
                      ['effetActualisation', 'Actualisation'],
                    ] as const
                  ).map(([cle, libelle]) => (
                    <FragmentMontant key={cle} libelle={libelle} valeur={edition.f[cle]} onChange={(v) => champ(cle, v)} />
                  ))}
                  <span className="text-right flex items-center justify-end gap-1">
                    Remboursement attendu :
                    <Aide
                      titre="Remboursement attendu"
                      texte="Un actif distinct, jamais porté en diminution de la provision, et seulement s'il est certain."
                      source="AUDCIF Titre VIII ch. 18 § 3.1.4"
                    />
                  </span>
                  <input inputMode="decimal" value={edition.f.remboursementAttendu} onChange={(e) => champ('remboursementAttendu', e.target.value)} className="border border-border-dark px-2 py-1 text-right" />
                  <span />
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={edition.f.remboursementCertain} onChange={(e) => champ('remboursementCertain', e.target.checked)} />
                    Remboursement certain
                  </label>
                  <label className="text-right">Tiers qui rembourse :</label>
                  <input maxLength={300} value={edition.f.remboursementTiers} onChange={(e) => champ('remboursementTiers', e.target.value)} className="border border-border-dark px-2 py-1" />
                  <label className="text-right self-start pt-1">Motif hors bilan :</label>
                  <textarea rows={2} value={edition.f.motifNonComptabilisation} onChange={(e) => champ('motifNonComptabilisation', e.target.value)} className="border border-border-dark px-2 py-1" />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setEdition(null)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5">
                    Annuler
                  </button>
                  <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 font-semibold disabled:opacity-50">
                    {envoi ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </PortailModale>
      )}

      {peutEcrire && statutCible && (
        <PortailModale>
          <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
            <form onSubmit={statuer} className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <div className="h-[32px] flex items-center justify-between px-2.5 bg-surface text-text border-b border-border text-[11.5px]">
                <span className="truncate">Statut · {statutCible.ligne.objet}</span>
                <button type="button" onClick={() => setStatutCible(null)} className="-mr-2 self-stretch w-[46px] flex items-center justify-center text-text-dim hover:text-white hover:bg-[#c42b1c]">
                  ✕
                </button>
              </div>
              <div className="p-4 text-[11.5px]">
                {erreurStatut && (
                  <div className="mb-2 border border-rouge/40 bg-rouge/5 text-rouge rounded-[3px] px-2 py-1 whitespace-pre-wrap">{erreurStatut}</div>
                )}
                <div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2">
                  <label className="text-right">Statut :</label>
                  <select value={statutCible.statut} onChange={(e) => setStatutCible({ ...statutCible, statut: e.target.value })} className="border border-border-dark px-2 py-1">
                    {Object.entries(LIBELLE_STATUT).map(([cle, libelle]) => (
                      <option key={cle} value={cle}>
                        {libelle}
                      </option>
                    ))}
                  </select>
                  <label className="text-right self-start pt-1">Motif :</label>
                  <textarea rows={3} value={statutCible.motif} onChange={(e) => setStatutCible({ ...statutCible, motif: e.target.value })} className="border border-border-dark px-2 py-1" />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setStatutCible(null)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5">
                    Annuler
                  </button>
                  <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 font-semibold disabled:opacity-50">
                    {envoi ? 'Enregistrement…' : 'Changer le statut'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </PortailModale>
      )}
    </div>
  );
}

/** Une ligne libellé + montant du formulaire · cinq colonnes du § 5.3, même rendu. */
function FragmentMontant({ libelle, valeur, onChange }: { libelle: string; valeur: string; onChange: (v: string) => void }) {
  return (
    <>
      <label className="text-right">{libelle} :</label>
      <input inputMode="decimal" value={valeur} onChange={(e) => onChange(e.target.value)} className="border border-border-dark px-2 py-1 text-right" />
    </>
  );
}
