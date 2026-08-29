import { Navigate, Route, HashRouter, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ExerciceProvider } from './lib/exercice';
import { FenetresProvider } from './lib/fenetres';
import { ActionsFenetreProvider } from './lib/actions-fenetre';
import { AppShell } from './components/chrome/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

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
              <FenetresProvider>
                <ActionsFenetreProvider>
                  <AppShell />
                </ActionsFenetreProvider>
              </FenetresProvider>
            </ExerciceProvider>
          </ZoneProtegee>
        }
      >
        {/*
          Les routes filles ne rendent plus rien : depuis le passage à
          l'espace de travail multi-fenêtres, c'est `AppShell` qui monte les
          fenêtres, à partir du registre (`lib/registre-fenetres.tsx`). Ce
          `path="*"` reste néanmoins nécessaire · sans lui, `navigate('/comptes')`
          ne correspondrait à aucune route, React Router avertirait, et
          l'adresse ne serait plus une adresse. La liste des écrans, elle, est
          tenue à UN SEUL endroit désormais : le registre.
        */}
        <Route index element={null} />
        <Route path="*" element={null} />
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
