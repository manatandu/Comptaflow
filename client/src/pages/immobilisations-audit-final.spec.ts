import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL · la fenêtre Immobilisations. Chaque test découpe le bloc qui
 * porte la propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'ImmobilisationsPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F128 · mode et unités d’œuvre se choisissent à la création', () => {
  it('l’envoi porte le mode choisi et, aux unités d’œuvre, le total et l’unité', () => {
    const envoi = bloc('const onCreerImmo = async', 'setIDesignation(');
    expect(envoi).toContain("...(iMode ? { modeAmortissement: iMode } : {})");
    // Le mode part toujours · une famille reprise pour le compte ne l'impose plus.
    // Lot 11 · le dégressif de la loi n° 23/053 s'ajoute, au SYCEBNL seul.
    expect(page).toContain("useState<'LINEAIRE' | 'UNITES_DOEUVRE' | 'DEGRESSIF'>('LINEAIRE')");
    expect(page).toContain(`{!syscohada && <option value="DEGRESSIF">Dégressif</option>}`);
    expect(envoi).toContain("modeRetenu === 'UNITES_DOEUVRE' ? { unitesOeuvrePrevues: Number(iUnites), uniteOeuvreLibelle: iUniteLibelle } : {}");
  });

  it('le mode retenu à l’écran est celui choisi, linéaire par défaut', () => {
    expect(page).toContain('const modeRetenu = iMode;');
  });

  it('le choix n’est pas proposé au SMT SYSCOHADA, que le Titre X borne au linéaire', () => {
    expect(page).toContain(
      "const unitesServies = !(utilisateur?.tenant?.referentiel === 'SYSCOHADA' && utilisateur?.tenant?.systemeComptableSyscohada === 'MINIMAL_TRESORERIE');",
    );
    expect(bloc('{unitesServies && (', "Mode d'amortissement")).toContain('<label');
  });
});

describe('F129 · une famille en sommeil ne reçoit plus de bien', () => {
  it('la famille se lit sur le compte du bien · le serveur ne reprend qu’une famille ACTIVE (compte-du-bien.spec.ts)', () => {
    expect(page).toContain('compteImmobilisationId: iCompteBienId,');
  });
});

describe('F131 · les deux tableaux montrent les dépréciations que la valeur nette retranche', () => {
  const tableaux = readFileSync(join(__dirname, 'TableauxImmobilisationsPage.tsx'), 'utf8');
  const blocDe = (debut: string, fin: string) => {
    const i = tableaux.indexOf(debut);
    expect(i).toBeGreaterThan(0);
    return tableaux.slice(i, tableaux.indexOf(fin, i));
  };

  it('le tableau des immobilisations porte la colonne, par bien, par groupe et au total', () => {
    const t = blocDe("{onglet === 'immobilisations' && immo && (", "{onglet === 'amortissements' && amort && (");
    expect(t).toContain('<span className="text-right">Dépréciations</span>');
    expect(t).toContain('{montant(l.depreciations)}');
    expect(t).toContain('{montant(g.depreciations)}');
    expect(t).toContain('{montant(immo.totaux.depreciations)}');
  });

  it('le tableau des amortissements aussi', () => {
    const t = blocDe("{onglet === 'amortissements' && amort && (", '</div>\n  );\n}');
    expect(t).toContain('<span className="text-right">Dépréc.</span>');
    expect(t).toContain('{montant(l.depreciations)}');
    expect(t).toContain('{montant(g.depreciations)}');
    expect(t).toContain('{montant(amort.totaux.depreciations)}');
  });
});
