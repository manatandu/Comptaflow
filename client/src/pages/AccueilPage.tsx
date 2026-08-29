import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';
import { AProposModale } from '../components/chrome/AProposModale';
import {
  IconFileAdd, IconFolderOpen, IconBook, IconNews,
  IconSaisie, IconComptes, IconJournal, IconEtats,
  IconLifeBuoy, IconInfo, IconLock, } from '../components/chrome/icons';

interface Tuile {
  label: string;
  Icon: (p: { width?: number; height?: number; className?: string }) => JSX.Element;
  degradeDe: string;
  degradeA: string;
  onClick?: () => void;
  bientot?: boolean;
}

function GrilleTuiles({ titre, tuiles }: { titre: string; tuiles: Tuile[] }) {
  return (
    <div className="mb-6">
      <div className="text-[12px] font-bold text-text-dim mb-2 px-0.5">{titre}</div>
      <div className="flex flex-wrap gap-3">
        {tuiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={t.bientot ? undefined : t.onClick}
            disabled={t.bientot}
            title={t.bientot ? `${t.label} — bientôt disponible` : t.label}
            className={`relative w-[104px] h-[104px] flex flex-col items-center justify-center gap-2 text-white text-[11px] font-medium text-center px-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sel ${
              t.bientot ? 'opacity-55 cursor-default' : 'cursor-pointer hover:brightness-110'
            }`}
            style={{ background: `linear-gradient(160deg, ${t.degradeDe}, ${t.degradeA})` }}
          >
            {t.bientot && (
              <span className="absolute top-1.5 right-1.5">
                <IconLock width={11} height={11} />
              </span>
            )}
            <t.Icon width={26} height={26} />
            <span className="leading-tight">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AccueilPage() {
  const navigate = useNavigate();
  const [wizardOuvert, setWizardOuvert] = useState(false);
  const [aProposOuvert, setAProposOuvert] = useState(false);

  const demarrer: Tuile[] = [
    { label: 'Nouveau fichier comptable', Icon: IconFileAdd, degradeDe: 'var(--tile-bleu)', degradeA: 'var(--tile-bleu-fonce)', onClick: () => setWizardOuvert(true) },
    { label: 'Ouvrir un dossier existant', Icon: IconFolderOpen, degradeDe: 'var(--tile-neutre)', degradeA: 'var(--tile-neutre-fonce)', bientot: true },
    { label: 'Guide de démarrage', Icon: IconBook, degradeDe: 'var(--tile-neutre)', degradeA: 'var(--tile-neutre-fonce)', bientot: true },
    { label: 'Nouveautés de la version', Icon: IconNews, degradeDe: 'var(--tile-neutre)', degradeA: 'var(--tile-neutre-fonce)', bientot: true },
  ];

  const travailler: Tuile[] = [
    { label: 'Saisie des journaux', Icon: IconSaisie, degradeDe: 'var(--tile-sarcelle)', degradeA: 'var(--tile-sarcelle-fonce)', onClick: () => navigate('/saisie') },
    { label: 'Plan de comptes', Icon: IconComptes, degradeDe: 'var(--tile-sarcelle)', degradeA: 'var(--tile-sarcelle-fonce)', onClick: () => navigate('/comptes') },
    { label: 'Journal & grand livre', Icon: IconJournal, degradeDe: 'var(--tile-sarcelle)', degradeA: 'var(--tile-sarcelle-fonce)', onClick: () => navigate('/journal') },
    { label: 'États financiers', Icon: IconEtats, degradeDe: 'var(--tile-sarcelle)', degradeA: 'var(--tile-sarcelle-fonce)', onClick: () => navigate('/etats-financiers') },
  ];

  const ressources: Tuile[] = [
    { label: 'Documentation', Icon: IconBook, degradeDe: 'var(--tile-ardoise)', degradeA: 'var(--tile-ardoise-fonce)', bientot: true },
    { label: 'Assistance', Icon: IconLifeBuoy, degradeDe: 'var(--tile-ardoise)', degradeA: 'var(--tile-ardoise-fonce)', bientot: true },
    { label: "À propos d’OmegaX", Icon: IconInfo, degradeDe: 'var(--tile-ardoise)', degradeA: 'var(--tile-ardoise-fonce)', onClick: () => setAProposOuvert(true) },
  ];

  return (
    <div className="p-3">
      <GrilleTuiles titre="DÉMARRER" tuiles={demarrer} />
      <GrilleTuiles titre="TRAVAILLER" tuiles={travailler} />
      <GrilleTuiles titre="RESSOURCES" tuiles={ressources} />

      {wizardOuvert && <NouveauFichierWizard onClose={() => setWizardOuvert(false)} />}
      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}
    </div>
  );
}
