import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { demarrageInacheve, etapesDemarrage, ouvrirAuChargement, type EtatDemarrage } from './demarrage-guide';

// Aucun import de « vitest » · convention du dépôt.

const NEUF: EtatDemarrage = { exercices: 0, journaux: 6, tiers: 0, ecritures: 0, modulesActives: [] };

describe('démarrage guidé', () => {
  it('l’état de chaque étape se lit dans le dossier', () => {
    const etapes = etapesDemarrage(NEUF);
    expect(etapes.map((e) => e.cle)).toEqual(['referentiel', 'exercice', 'journaux', 'modules', 'tiers', 'ecriture']);
    const faite = (cle: string) => etapes.find((e) => e.cle === cle)!.faite;
    expect(faite('exercice')).toBe(false);
    expect(faite('journaux')).toBe(true);
    expect(faite('modules')).toBeNull();
    expect(demarrageInacheve(NEUF)).toBe(true);
    expect(demarrageInacheve({ exercices: 1, journaux: 6, tiers: 3, ecritures: 1, modulesActives: [] })).toBe(false);
  });

  it('s’ouvre seul à l’administrateur d’un dossier sans écriture, jamais une fois passé', () => {
    expect(ouvrirAuChargement(NEUF, true, false)).toBe(true);
    expect(ouvrirAuChargement(NEUF, false, false)).toBe(false);
    expect(ouvrirAuChargement(NEUF, true, true)).toBe(false);
    expect(ouvrirAuChargement({ ...NEUF, ecritures: 4 }, true, false)).toBe(false);
    expect(ouvrirAuChargement(null, true, false)).toBe(false);
  });

  it('les étapes ouvrent des fenêtres du registre', () => {
    const registre = readFileSync(join(__dirname, 'registre-fenetres.tsx'), 'utf8');
    for (const e of etapesDemarrage(NEUF).filter((x) => x.chemin)) {
      expect(registre).toContain(`motif: /^\\${e.chemin}$/`);
    }
  });

  it('l’assistant est lu et ouvert par l’accueil, et choisit les modules par la route de Paramètres', () => {
    const accueil = readFileSync(join(__dirname, '../pages/AccueilPage.tsx'), 'utf8');
    expect(accueil).toContain("api\n      .get<EtatDemarrage>('/dossier/demarrage')");
    expect(accueil).toContain('ouvrirAuChargement(e, estAdmin, lirePasse(tenantId))');
    const composant = readFileSync(join(__dirname, '../components/DemarrageGuide.tsx'), 'utf8');
    expect(composant).toContain("api.patch<{ modulesActives: ModuleOptionnel[] }>('/dossier/modules'");
    expect(composant).toContain('<PortailModale>');
  });
});
