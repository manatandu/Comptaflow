import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * LE REGISTRE DU PERSONNEL · l'état civil, les engagements, et ce que
 * l'article 212 du Code du travail réclame de chaque contrat.
 *
 * CE QUE CET ÉCRAN NE FAIT PAS, ET LE DIT : aucun bulletin, aucune assiette,
 * aucun montant de paie. P0 a établi que le moteur bute sur des textes qui ne
 * sont pas au corpus, et l'écran ne promet pas ce qui n'est pas là.
 *
 * LA CONFRONTATION EST L'OBJET DE LA FENÊTRE, pas un accessoire. Un registre
 * qui liste sans confronter se lit comme « tout va bien » ; c'est le manque
 * de la quatorzième énonciation, ou la requalification de plein droit d'un
 * CDD en CDI, qu'un inspecteur du travail viendra chercher.
 *
 * DONNÉES PERSONNELLES · c'est la première fenêtre du logiciel à en afficher.
 * Le journal d'audit, lui, en masque la valeur · l'écran la montre à qui
 * tient le dossier, le journal ne la recopie pas pour tout le monde.
 */

type Sexe = 'MASCULIN' | 'FEMININ';
type TypeContrat = 'DUREE_DETERMINEE' | 'DUREE_INDETERMINEE' | 'JOUR_LE_JOUR' | 'APPRENTISSAGE';

const LIBELLE_TYPE: Record<TypeContrat, string> = {
  DUREE_INDETERMINEE: 'Durée indéterminée',
  DUREE_DETERMINEE: 'Durée déterminée',
  JOUR_LE_JOUR: 'Engagement au jour le jour',
  APPRENTISSAGE: "Contrat d'apprentissage (Titre III)",
};

interface Enfant {
  id?: string;
  nom: string;
  postNom: string | null;
  prenoms: string | null;
  dateNaissance: string | null;
}

interface Contrat {
  id: string;
  type: TypeContrat;
  dateEntreeEnVigueur: string;
  dateFinPrevue: string | null;
  dateFin: string | null;
  motifFin: string | null;
  emploiPermanent: boolean;
  constateParEcrit: boolean;
  viseParOnem: boolean;
  remunerationBase: string | number | null;
  categorieProfessionnelle: string | null;
  classeProfessionnelle: number | null;
  periodiciteRemuneration: 'JOUR' | 'SEMAINE' | 'MOIS' | 'ANNEE' | null;
}

interface Salarie {
  id: string;
  matricule: string | null;
  nom: string;
  postNom: string | null;
  prenoms: string | null;
  sexe: Sexe;
  numeroAffiliationCnss: string | null;
  dateNaissance: string | null;
  millesimeNaissance: number | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  nomConjoint: string | null;
  aptitudeConstateeLe: string | null;
  aptitudeConstateePar: string | null;
  aptitudeProvisoire: boolean;
  declarationEngagementLe: string | null;
  declarationDepartLe: string | null;
  actif: boolean;
  enfants: Enfant[];
  contrats: Contrat[];
  contratEnCours: Contrat | null;
  nombreContrats: number;
}

interface Mention {
  numero: number;
  texte: string;
  ou: string;
  motif: string;
}

interface Requal {
  motif: string;
  article: string;
  formule: string;
  explication: string;
}

interface Declaration {
  objet: 'ENGAGEMENT' | 'DEPART';
  echeance: string;
  faite: boolean;
  enRetard: boolean;
  destinataires: string;
  article: string;
}

interface RemunerationMinimale {
  conforme: boolean | null;
  minimumFc: number | null;
  convenueFc: number | null;
  manqueFc: number | null;
  abstention: string | null;
  explication: string;
}

interface FicheConfrontee {
  salarieId: string;
  salarie: string;
  contratId: string;
  type: TypeContrat;
  dateEntreeEnVigueur: string;
  dateFin: string | null;
  mentionsManquantes: Mention[];
  requalifications: Requal[];
  essai: {
    dureeOpposableJours: number | null;
    plafondJours: number;
    reduiteDePleinDroit: boolean;
    ecritManquant: boolean;
    reserve: string | null;
  };
  declarations: Declaration[];
  aptitudeProvisoirePerimee: boolean;
  visaOnemManquant: boolean;
  moisDeReference: string;
  remunerationMinimale: RemunerationMinimale;
}

interface Confrontation {
  employeur: { nom: string; numeroAffiliationCnssEmployeur: string | null };
  manqueEmployeur: boolean;
  fiches: FicheConfrontee[];
  totalSignalements: number;
}

interface Effectif {
  effectif: number;
  hommes: number;
  femmes: number;
  permanents: number;
  nationaux: number;
  sansNationalite: number;
  partMainOeuvreNationale: number | null;
  source: string;
  reserve: string | null;
}

const NOUVEAU_SALARIE = {
  matricule: '',
  nom: '',
  postNom: '',
  prenoms: '',
  sexe: '' as '' | Sexe,
  numeroAffiliationCnss: '',
  dateNaissance: '',
  millesimeNaissance: '',
  lieuNaissance: '',
  nationalite: '',
  nomConjoint: '',
  aptitudeConstateeLe: '',
  aptitudeConstateePar: '',
  aptitudeProvisoire: false,
  declarationEngagementLe: '',
  declarationDepartLe: '',
};

const NOUVEAU_CONTRAT = {
  type: 'DUREE_INDETERMINEE' as TypeContrat,
  constateParEcrit: true,
  dateEntreeEnVigueur: '',
  dateConclusion: '',
  lieuConclusion: '',
  dateFinPrevue: '',
  separeDeSaFamille: false,
  ouvrageDetermine: '',
  motifRemplacement: '',
  emploiPermanent: false,
  natureTravail: '',
  lieuExecution: '',
  categorieProfessionnelle: '',
  classeProfessionnelle: '',
  periodiciteRemuneration: '' as '' | 'JOUR' | 'SEMAINE' | 'MOIS' | 'ANNEE',
  manoeuvreSansSpecialite: false,
  remunerationBase: '',
  avantagesConvenus: '',
  clauseEssai: false,
  essaiConstateParEcrit: false,
  essaiDureeJours: '',
  dureePreavisJours: '',
  viseParOnem: false,
  dateVisaOnem: '',
};

/**
 * LES DIX-SEPT CLASSES DE LA TENSION SALARIALE, décret n° 25/22, annexes.
 *
 * Recopiées ici pour l'affichage seul · le MINIMUM associé à chacune vient
 * toujours du serveur, qui seul lit le barème avec son mois d'effet. Un
 * montant calculé côté client se périmerait au prochain ajustement de
 * janvier sans que personne ne le voie.
 */
const CLASSES: { classe: number; libelle: string }[] = [
  { classe: 1, libelle: 'Manœuvre ordinaire' },
  { classe: 2, libelle: 'Manœuvre lourd' },
  { classe: 3, libelle: 'Travailleur spécialisé' },
  { classe: 4, libelle: 'Travailleur semi qualifié, échelon 1' },
  { classe: 5, libelle: 'Travailleur semi qualifié, échelon 2' },
  { classe: 6, libelle: 'Travailleur semi qualifié, échelon 3' },
  { classe: 7, libelle: 'Travailleur qualifié, échelon 1' },
  { classe: 8, libelle: 'Travailleur qualifié, échelon 2' },
  { classe: 9, libelle: 'Travailleur hautement qualifié' },
  { classe: 10, libelle: 'Maîtrise, échelon 1' },
  { classe: 11, libelle: 'Maîtrise, échelon 2' },
  { classe: 12, libelle: 'Maîtrise, échelon 3' },
  { classe: 13, libelle: 'Maîtrise, échelon 4' },
  { classe: 14, libelle: 'Cadre de collaboration, échelon 1' },
  { classe: 15, libelle: 'Cadre de collaboration, échelon 2' },
  { classe: 16, libelle: 'Cadre de collaboration, échelon 3' },
  { classe: 17, libelle: 'Cadre de collaboration, échelon 4' },
];

const nomComplet = (s: Salarie) => [s.nom, s.postNom, s.prenoms].filter(Boolean).join(' ');
const jour = (d: string | null) => (d ? d.slice(0, 10) : '');

export function PersonnelPage() {
  const [salaries, setSalaries] = useState<Salarie[]>([]);
  const [confrontation, setConfrontation] = useState<Confrontation | null>(null);
  const [effectif, setEffectif] = useState<Effectif | null>(null);
  const [onglet, setOnglet] = useState<'registre' | 'confrontation' | 'effectif'>('registre');
  const [tous, setTous] = useState(false);
  const [selection, setSelection] = useState<string>('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [salarie, setSalarie] = useState({ ...NOUVEAU_SALARIE });
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [contrat, setContrat] = useState({ ...NOUVEAU_CONTRAT });
  const [aLa, setALa] = useState('');

  const charger = useCallback(() => {
    api.get<Salarie[]>(`/personnel/salaries${tous ? '?tous=true' : ''}`).then(
      setSalaries,
      (e: ApiError) => setErreur(e.message),
    );
  }, [tous]);

  useEffect(charger, [charger]);

  useEffect(() => {
    if (onglet === 'confrontation') {
      api.get<Confrontation>('/personnel/confrontation').then(setConfrontation, (e: ApiError) =>
        setErreur(e.message),
      );
    }
    if (onglet === 'effectif') {
      api
        .get<Effectif>(`/personnel/effectif${aLa ? `?ala=${aLa}` : ''}`)
        .then(setEffectif, (e: ApiError) => setErreur(e.message));
    }
  }, [onglet, aLa]);

  const corpsSalarie = () => ({
    matricule: salarie.matricule.trim() || undefined,
    nom: salarie.nom.trim(),
    postNom: salarie.postNom.trim() || undefined,
    prenoms: salarie.prenoms.trim() || undefined,
    sexe: salarie.sexe,
    numeroAffiliationCnss: salarie.numeroAffiliationCnss.trim() || undefined,
    dateNaissance: salarie.dateNaissance || undefined,
    millesimeNaissance: salarie.millesimeNaissance ? Number(salarie.millesimeNaissance) : undefined,
    lieuNaissance: salarie.lieuNaissance.trim() || undefined,
    nationalite: salarie.nationalite.trim() || undefined,
    nomConjoint: salarie.nomConjoint.trim() || undefined,
    aptitudeConstateeLe: salarie.aptitudeConstateeLe || undefined,
    aptitudeConstateePar: salarie.aptitudeConstateePar.trim() || undefined,
    aptitudeProvisoire: salarie.aptitudeProvisoire,
    declarationEngagementLe: salarie.declarationEngagementLe || undefined,
    declarationDepartLe: salarie.declarationDepartLe || undefined,
    enfants: enfants
      .filter((e) => e.nom.trim() !== '')
      .map((e) => ({
        nom: e.nom.trim(),
        postNom: e.postNom?.trim() || undefined,
        prenoms: e.prenoms?.trim() || undefined,
        dateNaissance: e.dateNaissance || undefined,
      })),
  });

  const enregistrerSalarie = async () => {
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      if (selection) {
        await api.put(`/personnel/salaries/${selection}`, corpsSalarie());
        setSucces(`${salarie.nom} mis à jour.`);
      } else {
        const cree = await api.post<{ id: string }>('/personnel/salaries', corpsSalarie());
        setSucces(`${salarie.nom} inscrit au registre.`);
        setSelection(cree.id);
      }
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const choisir = (s: Salarie) => {
    setSelection(s.id);
    setSalarie({
      matricule: s.matricule ?? '',
      nom: s.nom,
      postNom: s.postNom ?? '',
      prenoms: s.prenoms ?? '',
      sexe: s.sexe,
      numeroAffiliationCnss: s.numeroAffiliationCnss ?? '',
      dateNaissance: jour(s.dateNaissance),
      millesimeNaissance: s.millesimeNaissance ? String(s.millesimeNaissance) : '',
      lieuNaissance: s.lieuNaissance ?? '',
      nationalite: s.nationalite ?? '',
      nomConjoint: s.nomConjoint ?? '',
      aptitudeConstateeLe: jour(s.aptitudeConstateeLe),
      aptitudeConstateePar: s.aptitudeConstateePar ?? '',
      aptitudeProvisoire: s.aptitudeProvisoire,
      declarationEngagementLe: jour(s.declarationEngagementLe),
      declarationDepartLe: jour(s.declarationDepartLe),
    });
    setEnfants(s.enfants.map((e) => ({ ...e, dateNaissance: jour(e.dateNaissance) })));
  };

  const nouveau = () => {
    setSelection('');
    setSalarie({ ...NOUVEAU_SALARIE });
    setEnfants([]);
  };

  const creerContrat = async () => {
    if (!selection) return;
    setErreur('');
    setSucces('');
    setEnCours(true);
    try {
      await api.post(`/personnel/salaries/${selection}/contrats`, {
        type: contrat.type,
        constateParEcrit: contrat.constateParEcrit,
        dateEntreeEnVigueur: contrat.dateEntreeEnVigueur,
        dateConclusion: contrat.dateConclusion || undefined,
        lieuConclusion: contrat.lieuConclusion.trim() || undefined,
        dateFinPrevue: contrat.dateFinPrevue || undefined,
        separeDeSaFamille: contrat.separeDeSaFamille,
        ouvrageDetermine: contrat.ouvrageDetermine.trim() || undefined,
        motifRemplacement: contrat.motifRemplacement.trim() || undefined,
        emploiPermanent: contrat.emploiPermanent,
        natureTravail: contrat.natureTravail.trim() || undefined,
        lieuExecution: contrat.lieuExecution.trim() || undefined,
        categorieProfessionnelle: contrat.categorieProfessionnelle.trim() || undefined,
        classeProfessionnelle: contrat.classeProfessionnelle ? Number(contrat.classeProfessionnelle) : undefined,
        periodiciteRemuneration: contrat.periodiciteRemuneration || undefined,
        manoeuvreSansSpecialite: contrat.manoeuvreSansSpecialite,
        remunerationBase: contrat.remunerationBase ? Number(contrat.remunerationBase) : undefined,
        avantagesConvenus: contrat.avantagesConvenus.trim() || undefined,
        clauseEssai: contrat.clauseEssai,
        essaiConstateParEcrit: contrat.essaiConstateParEcrit,
        essaiDureeJours: contrat.essaiDureeJours ? Number(contrat.essaiDureeJours) : undefined,
        dureePreavisJours: contrat.dureePreavisJours ? Number(contrat.dureePreavisJours) : undefined,
        viseParOnem: contrat.viseParOnem,
        dateVisaOnem: contrat.dateVisaOnem || undefined,
      });
      setSucces('Contrat enregistré.');
      setContrat({ ...NOUVEAU_CONTRAT });
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const champ =
    'border border-border bg-surface px-1.5 py-1 text-[10.5px] w-full focus:outline-none focus:border-accent';
  const cell = 'px-2 py-1 border border-border';
  const etiquette = 'text-[9.5px] text-text-dim uppercase tracking-wide';
  const choisi = salaries.find((s) => s.id === selection) ?? null;

  return (
    <div className="p-2">
      <EnteteImpression titre="Registre du personnel" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">
          CODE DU TRAVAIL · LOI N° 015/2002, ARTICLE 212
        </div>
        <h1 className="text-[12px] font-bold leading-tight">Registre du personnel</h1>
        <div className="text-[10px] text-text-dim mt-0.5">
          Le registre tient l’état civil et les engagements, et confronte chaque contrat aux quinze
          énonciations obligatoires de l’article 212 ainsi qu’aux requalifications de plein droit des
          articles 40 à 45. <strong>Il ne calcule aucun bulletin de paie</strong> : le moteur de
          rémunération attend des textes qui ne sont pas encore au corpus du logiciel.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1240px]">
          {erreur}
        </div>
      )}
      {succes && (
        <div className="border border-ok/30 bg-ok-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1240px]">
          {succes}
        </div>
      )}

      <div className="ecran-seul flex gap-1 mb-2 text-[10.5px]">
        {(['registre', 'confrontation', 'effectif'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            className={`px-3 py-1 border ${
              onglet === o ? 'border-accent text-accent' : 'border-border text-text-dim'
            }`}
          >
            {o === 'registre' ? 'Registre' : o === 'confrontation' ? 'Article 212' : 'Effectif'}
          </button>
        ))}
      </div>

      {onglet === 'registre' && (
        // LE CONTENEUR QUI DÉFILE, et il n'est pas décoratif · la grille
        // ci-dessous fait 748 px au minimum, et sur un écran de 360 px elle
        // pousserait la fenêtre entière, emportant l'en-tête et les onglets
        // hors de vue. Le défilement reste dans la grille.
        <div className="overflow-x-auto max-w-[1240px]">
        <div className="grid grid-cols-[minmax(320px,1fr)_minmax(420px,1.4fr)] gap-2">
          <div className="border border-border">
            <div className="flex items-center justify-between px-2 py-1 border-b border-border">
              <div className="text-[10.5px] font-bold">Salariés ({salaries.length})</div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] flex items-center gap-1">
                  <input type="checkbox" checked={tous} onChange={(e) => setTous(e.target.checked)} />
                  Inclure les inactifs
                </label>
                <button type="button" onClick={nouveau} className="text-[10px] text-accent">
                  Nouveau
                </button>
              </div>
            </div>
            <table className="w-full text-[10.5px] border-collapse">
              <thead>
                <tr className="text-text-dim">
                  <th className={`${cell} text-left`}>Matricule</th>
                  <th className={`${cell} text-left`}>Nom</th>
                  <th className={`${cell} text-left`}>Contrat en cours</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => choisir(s)}
                    className={`cursor-pointer ${s.id === selection ? 'bg-accent/10' : ''}`}
                  >
                    <td className={cell}>{s.matricule ?? ''}</td>
                    <td className={cell}>
                      {nomComplet(s)}
                      {!s.actif && <span className="text-text-dim"> (inactif)</span>}
                    </td>
                    <td className={cell}>
                      {s.contratEnCours ? LIBELLE_TYPE[s.contratEnCours.type] : 'aucun'}
                    </td>
                  </tr>
                ))}
                {salaries.length === 0 && (
                  <tr>
                    <td className={cell} colSpan={3}>
                      Aucun salarié au registre. Un dossier sans salarié est le cas le plus fréquent ·
                      ce n’est pas une anomalie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-border p-2">
            <div className="text-[10.5px] font-bold mb-1.5">
              {selection ? `Fiche · ${salarie.nom}` : 'Nouvelle fiche'}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <label>
                <span className={etiquette}>Matricule (point 4, éventuel)</span>
                <input
                  className={champ}
                  value={salarie.matricule}
                  onChange={(e) => setSalarie({ ...salarie, matricule: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>Nom (point 3)</span>
                <input
                  className={champ}
                  value={salarie.nom}
                  onChange={(e) => setSalarie({ ...salarie, nom: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>Post-nom</span>
                <input
                  className={champ}
                  value={salarie.postNom}
                  onChange={(e) => setSalarie({ ...salarie, postNom: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>Prénoms</span>
                <input
                  className={champ}
                  value={salarie.prenoms}
                  onChange={(e) => setSalarie({ ...salarie, prenoms: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>Sexe (point 3)</span>
                <select
                  className={champ}
                  value={salarie.sexe}
                  onChange={(e) => setSalarie({ ...salarie, sexe: e.target.value as Sexe })}
                >
                  <option value="">choisir…</option>
                  <option value="MASCULIN">Masculin</option>
                  <option value="FEMININ">Féminin</option>
                </select>
              </label>
              <label>
                <span className={etiquette}>N° CNSS du travailleur (point 4)</span>
                <input
                  className={champ}
                  value={salarie.numeroAffiliationCnss}
                  onChange={(e) =>
                    setSalarie({ ...salarie, numeroAffiliationCnss: e.target.value })
                  }
                />
              </label>
              <label>
                <span className={etiquette}>Date de naissance (point 5)</span>
                <input
                  type="date"
                  className={champ}
                  value={salarie.dateNaissance}
                  onChange={(e) => setSalarie({ ...salarie, dateNaissance: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>ou millésime présumé</span>
                <input
                  className={champ}
                  value={salarie.millesimeNaissance}
                  onChange={(e) => setSalarie({ ...salarie, millesimeNaissance: e.target.value })}
                  placeholder="1990"
                />
              </label>
              <label>
                <span className={etiquette}>Lieu de naissance (point 6)</span>
                <input
                  className={champ}
                  value={salarie.lieuNaissance}
                  onChange={(e) => setSalarie({ ...salarie, lieuNaissance: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>Nationalité (point 6)</span>
                <input
                  className={champ}
                  value={salarie.nationalite}
                  onChange={(e) => setSalarie({ ...salarie, nationalite: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>Conjoint (point 7)</span>
                <input
                  className={champ}
                  value={salarie.nomConjoint}
                  onChange={(e) => setSalarie({ ...salarie, nomConjoint: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>Aptitude constatée le (point 15)</span>
                <input
                  type="date"
                  className={champ}
                  value={salarie.aptitudeConstateeLe}
                  onChange={(e) => setSalarie({ ...salarie, aptitudeConstateeLe: e.target.value })}
                />
              </label>
              <label>
                <span className={etiquette}>par</span>
                <input
                  className={champ}
                  value={salarie.aptitudeConstateePar}
                  onChange={(e) => setSalarie({ ...salarie, aptitudeConstateePar: e.target.value })}
                />
              </label>
              <label className="text-[10px] flex items-end gap-1 pb-1">
                <input
                  type="checkbox"
                  checked={salarie.aptitudeProvisoire}
                  onChange={(e) => setSalarie({ ...salarie, aptitudeProvisoire: e.target.checked })}
                />
                Certificat provisoire (art. 38 · à confirmer sous trois mois)
              </label>
              <label>
                <span className={etiquette}>Déclaration d’engagement (art. 217)</span>
                <input
                  type="date"
                  className={champ}
                  value={salarie.declarationEngagementLe}
                  onChange={(e) =>
                    setSalarie({ ...salarie, declarationEngagementLe: e.target.value })
                  }
                />
              </label>
              <label>
                <span className={etiquette}>Déclaration de départ (art. 217)</span>
                <input
                  type="date"
                  className={champ}
                  value={salarie.declarationDepartLe}
                  onChange={(e) => setSalarie({ ...salarie, declarationDepartLe: e.target.value })}
                />
              </label>
            </div>

            <div className="mt-2">
              <div className="flex items-center justify-between">
                <div className={etiquette}>
                  Enfants à charge (point 7 · la date de naissance de chacun est exigée)
                </div>
                <button
                  type="button"
                  className="text-[10px] text-accent"
                  onClick={() =>
                    setEnfants([...enfants, { nom: '', postNom: '', prenoms: '', dateNaissance: '' }])
                  }
                >
                  Ajouter
                </button>
              </div>
              {enfants.map((e, i) => (
                <div key={i} className="grid grid-cols-4 gap-1 mt-1">
                  <input
                    className={champ}
                    placeholder="Nom"
                    value={e.nom}
                    onChange={(ev) =>
                      setEnfants(enfants.map((x, j) => (j === i ? { ...x, nom: ev.target.value } : x)))
                    }
                  />
                  <input
                    className={champ}
                    placeholder="Post-nom"
                    value={e.postNom ?? ''}
                    onChange={(ev) =>
                      setEnfants(
                        enfants.map((x, j) => (j === i ? { ...x, postNom: ev.target.value } : x)),
                      )
                    }
                  />
                  <input
                    className={champ}
                    placeholder="Prénoms"
                    value={e.prenoms ?? ''}
                    onChange={(ev) =>
                      setEnfants(
                        enfants.map((x, j) => (j === i ? { ...x, prenoms: ev.target.value } : x)),
                      )
                    }
                  />
                  <input
                    type="date"
                    className={champ}
                    value={e.dateNaissance ?? ''}
                    onChange={(ev) =>
                      setEnfants(
                        enfants.map((x, j) =>
                          j === i ? { ...x, dateNaissance: ev.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={enCours || !salarie.nom.trim() || !salarie.sexe}
              onClick={enregistrerSalarie}
              className="mt-2 px-3 py-1 border border-accent text-accent text-[10.5px] disabled:opacity-40"
            >
              {selection ? 'Mettre à jour' : 'Inscrire au registre'}
            </button>

            {choisi && (
              <div className="mt-3 border-t border-border pt-2">
                <div className="text-[10.5px] font-bold mb-1">
                  Contrats de {nomComplet(choisi)} ({choisi.nombreContrats})
                </div>
                <table className="w-full text-[10.5px] border-collapse mb-2">
                  <thead>
                    <tr className="text-text-dim">
                      <th className={`${cell} text-left`}>Type</th>
                      <th className={`${cell} text-left`}>Entrée en vigueur</th>
                      <th className={`${cell} text-left`}>Terme prévu</th>
                      <th className={`${cell} text-left`}>Fin réelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {choisi.contrats.map((c) => (
                      <tr key={c.id}>
                        <td className={cell}>{LIBELLE_TYPE[c.type]}</td>
                        <td className={cell}>{jour(c.dateEntreeEnVigueur)}</td>
                        <td className={cell}>{jour(c.dateFinPrevue)}</td>
                        <td className={cell}>{jour(c.dateFin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className={etiquette}>Nouveau contrat</div>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  <label>
                    <span className={etiquette}>Type (art. 39)</span>
                    <select
                      className={champ}
                      value={contrat.type}
                      onChange={(e) =>
                        setContrat({ ...contrat, type: e.target.value as TypeContrat })
                      }
                    >
                      {(Object.keys(LIBELLE_TYPE) as TypeContrat[]).map((t) => (
                        <option key={t} value={t}>
                          {LIBELLE_TYPE[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={etiquette}>Entrée en vigueur (point 13)</span>
                    <input
                      type="date"
                      className={champ}
                      value={contrat.dateEntreeEnVigueur}
                      onChange={(e) =>
                        setContrat({ ...contrat, dateEntreeEnVigueur: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Terme prévu (art. 41)</span>
                    <input
                      type="date"
                      className={champ}
                      value={contrat.dateFinPrevue}
                      onChange={(e) => setContrat({ ...contrat, dateFinPrevue: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Conclu le (point 14)</span>
                    <input
                      type="date"
                      className={champ}
                      value={contrat.dateConclusion}
                      onChange={(e) => setContrat({ ...contrat, dateConclusion: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>à (point 14)</span>
                    <input
                      className={champ}
                      value={contrat.lieuConclusion}
                      onChange={(e) => setContrat({ ...contrat, lieuConclusion: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Nature du travail (point 8)</span>
                    <input
                      className={champ}
                      value={contrat.natureTravail}
                      onChange={(e) => setContrat({ ...contrat, natureTravail: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Lieu d’exécution (point 10)</span>
                    <input
                      className={champ}
                      value={contrat.lieuExecution}
                      onChange={(e) => setContrat({ ...contrat, lieuExecution: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Rémunération convenue (point 9)</span>
                    <input
                      className={champ}
                      value={contrat.remunerationBase}
                      onChange={(e) => setContrat({ ...contrat, remunerationBase: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Préavis stipulé, en jours (point 12)</span>
                    <input
                      className={champ}
                      value={contrat.dureePreavisJours}
                      onChange={(e) => setContrat({ ...contrat, dureePreavisJours: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Catégorie (convention collective)</span>
                    <input
                      className={champ}
                      value={contrat.categorieProfessionnelle}
                      onChange={(e) =>
                        setContrat({ ...contrat, categorieProfessionnelle: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Classe de la tension salariale (1 à 17)</span>
                    <select
                      className={champ}
                      value={contrat.classeProfessionnelle}
                      onChange={(e) =>
                        setContrat({ ...contrat, classeProfessionnelle: e.target.value })
                      }
                    >
                      <option value="">non tranchée</option>
                      {CLASSES.map((c) => (
                        <option key={c.classe} value={c.classe}>
                          {c.classe} · {c.libelle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={etiquette}>Périodicité de la rémunération</span>
                    <select
                      className={champ}
                      value={contrat.periodiciteRemuneration}
                      onChange={(e) =>
                        setContrat({
                          ...contrat,
                          periodiciteRemuneration: e.target.value as typeof contrat.periodiciteRemuneration,
                        })
                      }
                    >
                      <option value="">non renseignée</option>
                      <option value="JOUR">par jour</option>
                      <option value="SEMAINE">par semaine</option>
                      <option value="MOIS">par mois</option>
                      <option value="ANNEE">par an</option>
                    </select>
                  </label>
                  <label>
                    <span className={etiquette}>Ouvrage déterminé (art. 40)</span>
                    <input
                      className={champ}
                      value={contrat.ouvrageDetermine}
                      onChange={(e) => setContrat({ ...contrat, ouvrageDetermine: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Motif de remplacement (art. 45)</span>
                    <input
                      className={champ}
                      value={contrat.motifRemplacement}
                      onChange={(e) => setContrat({ ...contrat, motifRemplacement: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={etiquette}>Essai, en jours (art. 43)</span>
                    <input
                      className={champ}
                      value={contrat.essaiDureeJours}
                      onChange={(e) => setContrat({ ...contrat, essaiDureeJours: e.target.value })}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1.5 text-[10px]">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={contrat.constateParEcrit}
                      onChange={(e) =>
                        setContrat({ ...contrat, constateParEcrit: e.target.checked })
                      }
                    />
                    Constaté par écrit (art. 44)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={contrat.emploiPermanent}
                      onChange={(e) => setContrat({ ...contrat, emploiPermanent: e.target.checked })}
                    />
                    Emploi permanent (art. 42)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={contrat.separeDeSaFamille}
                      onChange={(e) =>
                        setContrat({ ...contrat, separeDeSaFamille: e.target.checked })
                      }
                    />
                    Travailleur séparé de sa famille (art. 41 · plafond ramené à un an)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={contrat.manoeuvreSansSpecialite}
                      onChange={(e) =>
                        setContrat({ ...contrat, manoeuvreSansSpecialite: e.target.checked })
                      }
                    />
                    Manœuvre sans spécialité (art. 43 · essai plafonné à un mois)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={contrat.clauseEssai}
                      onChange={(e) => setContrat({ ...contrat, clauseEssai: e.target.checked })}
                    />
                    Clause d’essai
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={contrat.essaiConstateParEcrit}
                      onChange={(e) =>
                        setContrat({ ...contrat, essaiConstateParEcrit: e.target.checked })
                      }
                    />
                    Clause d’essai constatée par écrit (art. 43)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={contrat.viseParOnem}
                      onChange={(e) => setContrat({ ...contrat, viseParOnem: e.target.checked })}
                    />
                    Visé par l’Office national de l’emploi (art. 47)
                  </label>
                </div>
                <button
                  type="button"
                  disabled={enCours || !contrat.dateEntreeEnVigueur}
                  onClick={creerContrat}
                  className="mt-2 px-3 py-1 border border-accent text-accent text-[10.5px] disabled:opacity-40"
                >
                  Enregistrer le contrat
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {onglet === 'confrontation' && confrontation && (
        <div className="max-w-[1240px]">
          {confrontation.manqueEmployeur && (
            <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5 text-[10.5px]">
              <strong>Le numéro d’immatriculation de l’employeur à la CNSS n’est pas renseigné.</strong>{' '}
              C’est la deuxième des quinze énonciations de l’article 212, et elle est du côté de
              l’employeur : tant qu’elle manque, <em>aucun</em> contrat de ce dossier n’est complet,
              quel que soit le soin mis aux fiches. Renseignez-la dans Structure &gt; Paramètres du
              dossier.
            </div>
          )}
          <div className="text-[10.5px] mb-1.5">
            {confrontation.totalSignalements === 0
              ? 'Aucun signalement. Chaque contrat porte les quinze énonciations, et aucune requalification de plein droit ne s’applique.'
              : `${confrontation.totalSignalements} signalement(s) sur ${confrontation.fiches.length} contrat(s).`}
          </div>
          {confrontation.fiches.map((f) => (
            <div key={f.contratId} className="border border-border mb-2 p-2 text-[10.5px]">
              <div className="font-bold">
                {f.salarie} · {LIBELLE_TYPE[f.type]} du {jour(f.dateEntreeEnVigueur)}
                {f.dateFin ? ` au ${jour(f.dateFin)}` : ''}
              </div>
              {f.requalifications.map((r) => (
                <div key={r.motif} className="mt-1 border-l-2 border-danger pl-2">
                  <div className="font-bold text-danger">
                    Requalifié en contrat à durée indéterminée · {r.article}
                  </div>
                  <div className="italic text-text-dim">« {r.formule} »</div>
                  <div>{r.explication}</div>
                </div>
              ))}
              {f.mentionsManquantes.length > 0 && (
                <div className="mt-1">
                  <div className="font-bold">
                    Énonciations manquantes de l’article 212 ({f.mentionsManquantes.length})
                  </div>
                  <ul className="list-disc ml-4">
                    {f.mentionsManquantes.map((m) => (
                      <li key={m.numero}>
                        <strong>Point {m.numero}</strong> · {m.motif}{' '}
                        <span className="text-text-dim">({m.ou})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {f.remunerationMinimale.conforme === false && (
                <div className="mt-1 border-l-2 border-danger pl-2">
                  <div className="font-bold text-danger">
                    Rémunération convenue en deçà du minimum légal
                  </div>
                  <div>{f.remunerationMinimale.explication}</div>
                  {f.remunerationMinimale.manqueFc !== null && (
                    <div>
                      Manque : <strong>{f.remunerationMinimale.manqueFc.toLocaleString('fr-FR')} FC</strong>.
                    </div>
                  )}
                </div>
              )}
              {f.remunerationMinimale.abstention !== null && (
                <div className="mt-1 text-text-dim">
                  Minimum légal non contrôlé · {f.remunerationMinimale.explication}
                </div>
              )}
              {f.essai.reduiteDePleinDroit && (
                <div className="mt-1">
                  Clause d’essai <strong>réduite de plein droit</strong> à {f.essai.plafondJours}{' '}
                  jours (art. 43). <span className="text-text-dim">{f.essai.reserve}</span>
                </div>
              )}
              {f.essai.ecritManquant && (
                <div className="mt-1">
                  La clause d’essai n’est pas constatée par écrit, que l’article 43 exige.
                </div>
              )}
              {f.visaOnemManquant && (
                <div className="mt-1">
                  Contrat écrit non visé par l’Office national de l’emploi (art. 47) · le défaut
                  ouvre au travailleur la résiliation sans préavis.
                </div>
              )}
              {f.aptitudeProvisoirePerimee && (
                <div className="mt-1">
                  Certificat d’aptitude <strong>provisoire</strong> non confirmé au-delà des trois
                  mois de l’article 38.
                </div>
              )}
              {f.declarations
                .filter((d) => d.enRetard)
                .map((d) => (
                  <div key={d.objet} className="mt-1">
                    Déclaration d’{d.objet === 'ENGAGEMENT' ? 'engagement' : 'un départ'} en retard ·
                    elle était due le {jour(d.echeance)} {d.destinataires} ({d.article}).
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      {onglet === 'effectif' && (
        <div className="max-w-[1240px] text-[10.5px]">
          <label className="block mb-2">
            <span className={etiquette}>Effectif à la date du</span>
            <input
              type="date"
              className={`${champ} max-w-[180px]`}
              value={aLa}
              onChange={(e) => setALa(e.target.value)}
            />
          </label>
          {effectif && (
            <table className="border-collapse">
              <tbody>
                <tr>
                  <td className={cell}>Effectif</td>
                  <td className={cell}>{effectif.effectif}</td>
                </tr>
                <tr>
                  <td className={cell}>Hommes / Femmes</td>
                  <td className={cell}>
                    {effectif.hommes} / {effectif.femmes}
                  </td>
                </tr>
                <tr>
                  <td className={cell}>Permanents (contrats à durée indéterminée)</td>
                  <td className={cell}>{effectif.permanents}</td>
                </tr>
                <tr>
                  <td className={cell}>Main-d’œuvre nationale</td>
                  <td className={cell}>
                    {effectif.partMainOeuvreNationale === null
                      ? 'non calculée'
                      : `${effectif.nationaux} / ${effectif.effectif} · ${effectif.partMainOeuvreNationale.toFixed(1)} %`}
                  </td>
                </tr>
                <tr>
                  <td className={cell}>Source</td>
                  <td className={cell}>{effectif.source}</td>
                </tr>
              </tbody>
            </table>
          )}
          {effectif?.reserve && (
            <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mt-2">
              {effectif.reserve}
            </div>
          )}
          <div className="text-text-dim mt-2">
            Ces nombres sont une <strong>proposition</strong>. L’effectif des notes annexes (27B en
            SYSCOHADA, 29B en SYCEBNL) et la part de main-d’œuvre locale de l’accord-cadre restent
            des valeurs <strong>saisies</strong>, avec leur source et leur date : un registre
            incomplet produirait un pourcentage faux sous une apparence de calcul, sur un engagement
            dont le manquement se sanctionne.
          </div>
        </div>
      )}
    </div>
  );
}
