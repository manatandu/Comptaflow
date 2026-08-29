import { Navigate, Route, HashRouter, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ExerciceProvider } from './lib/exercice';
import { AppShell } from './components/chrome/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AccueilPage } from './pages/AccueilPage';
import { DashboardPage } from './pages/DashboardPage';
import { SaisiePage } from './pages/SaisiePage';
import { PlanComptesPage } from './pages/PlanComptesPage';
import { JournauxPage } from './pages/JournauxPage';
import { JournalPage } from './pages/JournalPage';
import { BalanceAgeePage } from './pages/BalanceAgeePage';
import { LettragePage } from './pages/LettragePage';
import { RapprochementPage } from './pages/RapprochementPage';
import { RapprochementDetailPage } from './pages/RapprochementDetailPage';
import { ImmobilisationsPage } from './pages/ImmobilisationsPage';
import { ExercicePage } from './pages/ExercicePage';
import { TiersPage } from './pages/TiersPage';
import { TauxTvaPage } from './pages/TauxTvaPage';
import { DeclarationTvaPage } from './pages/DeclarationTvaPage';
import { EtatsFinanciersPage } from './pages/EtatsFinanciersPage';
import { NotesAnnexesPage } from './pages/NotesAnnexesPage';
import { RegistreDonateursPage } from './pages/RegistreDonateursPage';
import { DocumentsObligatoiresPage } from './pages/DocumentsObligatoiresPage';
import { UtilisateursPage } from './pages/UtilisateursPage';
import { ParametresDossierPage } from './pages/ParametresDossierPage';
import { BailleursPage } from './pages/BailleursPage';

function ZoneProtegee({ children }: { children: JSX.Element }) {
  const { chargement, connecte } = useAuth();
  if (chargement) {
    return <div className="min-h-screen flex items-center justify-center text-[13px] text-text-dim">Chargement…</div>;
  }
  if (!connecte) return <Navigate to="/connexion" replace />;
  return children;
}

function Routage() {
  return (
    <Routes>
      <Route path="/connexion" element={<LoginPage />} />
      <Route path="/inscription" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ZoneProtegee>
            <ExerciceProvider>
              <AppShell />
            </ExerciceProvider>
          </ZoneProtegee>
        }
      >
        <Route index element={<AccueilPage />} />
        <Route path="tableau-de-bord" element={<DashboardPage />} />
        <Route path="saisie" element={<SaisiePage />} />
        <Route path="comptes" element={<PlanComptesPage />} />
        <Route path="comptes/:compteId/lettrage" element={<LettragePage />} />
        <Route path="rapprochement" element={<RapprochementPage />} />
        <Route path="rapprochement/:id" element={<RapprochementDetailPage />} />
        <Route path="immobilisations" element={<ImmobilisationsPage />} />
        <Route path="journaux" element={<JournauxPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="balance-agee" element={<BalanceAgeePage />} />
        <Route path="exercice" element={<ExercicePage />} />
        <Route path="tiers" element={<TiersPage />} />
        <Route path="taux-tva" element={<TauxTvaPage />} />
        <Route path="declaration-tva" element={<DeclarationTvaPage />} />
        <Route path="etats-financiers" element={<EtatsFinanciersPage />} />
        <Route path="notes-annexes" element={<NotesAnnexesPage />} />
        <Route path="registre-donateurs" element={<RegistreDonateursPage />} />
        <Route path="documents-obligatoires" element={<DocumentsObligatoiresPage />} />
        <Route path="bailleurs" element={<BailleursPage />} />
        <Route path="utilisateurs" element={<UtilisateursPage />} />
        <Route path="parametres-dossier" element={<ParametresDossierPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routage />
      </AuthProvider>
    </HashRouter>
  );
}
