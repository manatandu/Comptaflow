import { Navigate, Route, HashRouter, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ExerciceProvider } from './lib/exercice';
import { FenetresProvider } from './lib/fenetres';
import { AppShell } from './components/chrome/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ChangerMotDePassePage } from './pages/ChangerMotDePassePage';

function ZoneProtegee({ children }: { children: JSX.Element }) {
  const { chargement, connecte, utilisateur } = useAuth();
  if (chargement) {
    return <div className="min-h-screen flex items-center justify-center text-[12px] text-text-dim">Chargement…</div>;
  }
  if (!connecte) return <Navigate to="/connexion" replace />;
  // Mot de passe provisoire (remis par la console VMG, le siège d'un groupe
  // ou l'admin du dossier) : l'écran de changement s'impose À LA PLACE de
  // l'espace de travail, il n'y a rien d'autre à voir avant.
  if (utilisateur?.doitChangerMotDePasse) return <ChangerMotDePassePage />;
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
                <AppShell />
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
