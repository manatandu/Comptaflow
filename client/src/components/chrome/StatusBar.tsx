import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN_CABINET: 'Administrateur',
  COMPTABLE: 'Comptable',
  LECTURE_SEULE: 'Lecture seule',
};

/** Nom de la fenêtre active, affiché à gauche de la barre d'état. */
const TITRES: Array<[RegExp, string]> = [
  [/^\/$/, 'Accueil'],
  [/^\/tableau-de-bord/, 'Tableau de bord'],
  [/^\/saisie/, 'Saisie des journaux'],
  [/^\/comptes\/.+\/lettrage/, 'Interrogation et lettrage'],
  [/^\/comptes/, 'Plan comptable'],
  [/^\/journaux/, 'Codes journaux'],
  [/^\/journal/, 'Journal · Grand livre · Balance'],
  [/^\/balance-agee/, 'Balance âgée'],
  [/^\/rapprochement/, 'Rapprochement bancaire'],
  [/^\/immobilisations/, 'Immobilisations'],
  [/^\/exercice/, "Fin d'exercice"],
  [/^\/tiers/, 'Plan des tiers'],
  [/^\/taux-tva/, 'Taux de taxes'],
  [/^\/declaration-tva/, 'Déclaration de TVA'],
  [/^\/etats-financiers/, 'États financiers'],
  [/^\/notes-annexes/, 'Notes annexes'],
  [/^\/registre-donateurs/, 'Registre des donateurs'],
  [/^\/documents-obligatoires/, 'Documents obligatoires'],
  [/^\/bailleurs/, 'Bailleurs de fonds'],
  [/^\/utilisateurs/, "Autorisations d'accès"],
  [/^\/parametres-dossier/, "Paramètres du dossier"],
  [/^\/plans-analytiques/, 'Plans analytiques'],
  [/^\/brouillard/, 'Brouillard'],
  [/^\/import/, 'Importer des données'],
  [/^\/controles/, 'Analyse et contrôles'],
  [/^\/regularisations/, 'Régularisations et abonnements'],
  [/^\/etats-analytiques/, 'États analytiques'],
];

export function StatusBar() {
  const { utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const location = useLocation();

  const titreFenetre = TITRES.find(([re]) => re.test(location.pathname))?.[1] ?? 'Prêt';

  return (
    <div className="h-5 bg-chrome border-t border-border flex items-center justify-between px-2.5 text-[10px] text-text-dim shrink-0">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-positive" />
        <span>{titreFenetre}</span>
      </span>
      <span>
        {utilisateur?.tenant.nom} · {utilisateur?.tenant.referentiel}
        {utilisateur && ` · ${LIBELLE_ROLE[utilisateur.role]}`}
        {exerciceCourant && ` · Exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}`}
      </span>
    </div>
  );
}
