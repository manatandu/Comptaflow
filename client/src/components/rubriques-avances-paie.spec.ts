import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA RUBRIQUE ET L'AVANCE À L'ÉCRAN · le client n'envoie que ce qu'il sait.
 * La nature d'une rubrique et le type d'une avance sont relus au serveur ; ce
 * test gèle que le corps de la simulation porte l'identifiant (sans quoi le
 * serveur ne relirait rien) et que la retenue ne transporte que son montant.
 */
const page = readFileSync(join(__dirname, '..', 'pages', 'PersonnelPage.tsx'), 'utf8');

function corps(source: string, nom: string): string {
  const debut = source.indexOf(`const ${nom} = () => {`);
  expect(debut).toBeGreaterThan(-1);
  const ouverture = source.indexOf('{', source.indexOf('=>', debut));
  let profondeur = 0;
  for (let i = ouverture; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    if (source[i] === '}' && --profondeur === 0) return source.slice(ouverture, i + 1);
  }
  throw new Error('corps introuvable');
}

describe('rubriques et avances dans la simulation', () => {
  const simulation = corps(page, 'corpsSimulation');

  it("l'élément tiré d'une rubrique porte son identifiant", () => {
    expect(simulation).toContain('...(l.rubriqueId ? { rubriqueId: l.rubriqueId } : {})');
  });

  it("une retenue d'avance n'envoie que l'avance et le montant", () => {
    expect(simulation).toContain('.map(([avanceId, v]) => ({ avanceId, montantFc: nombre(v) as number }))');
  });

  it("l'onglet Rubriques et avances est branché", () => {
    expect(page).toContain("{onglet === 'rubriques' && <OngletRubriquesAvances");
  });
});

describe('barèmes de paie datés', () => {
  const onglet = readFileSync(join(__dirname, 'BaremesPaie.tsx'), 'utf8');

  it("l'onglet Barèmes est branché et reçoit peutEcrire", () => {
    expect(page).toContain("{onglet === 'baremes' && <OngletBaremesPaie peutEcrire={peutEcrire} />}");
  });

  it("l'ajout et le retrait ne s'affichent qu'à qui peut écrire", () => {
    expect(onglet).toMatch(/\{peutEcrire && \(\s*<form onSubmit=\{ajouter\}/);
    expect(onglet).toMatch(/\{peutEcrire && \(\s*<button[^>]*onClick=\{\(\) => retirer\(v\)\}/);
  });

  it("l'ajout envoie la date, le texte et les valeurs, jamais un taux livré", () => {
    expect(onglet).toContain("api.post<{ bulletinsDejaEmis: { numero: number; moisDePaie: string }[] }>('/personnel/baremes', {");
    expect(onglet).toContain('reference: f.reference,');
  });
});

/**
 * PASSE O4-C2 · la saisie-arrêt notifiée s'inscrit au registre avec son acte,
 * et sa mainlevée se déclare. Le corps envoyé porte les trois champs de
 * l'acte sur une saisie SEULEMENT, le serveur les refusant ailleurs.
 */
describe('la saisie-arrêt notifiée à l’écran', () => {
  const onglet = readFileSync(join(__dirname, 'RubriquesAvancesPaie.tsx'), 'utf8');

  it('propose la saisie-arrêt, et envoie l’acte, le greffe et le destinataire sur elle seule', () => {
    expect(onglet).toContain('<option value="SAISIE_ARRET">Saisie-arrêt notifiée</option>');
    expect(onglet).toContain(
      "...(avance.type === 'SAISIE_ARRET'\n        ? { referenceActe: avance.referenceActe, greffe: avance.greffe, destinataire: avance.destinataire }\n        : {}),",
    );
  });

  it('déclare la mainlevée par la route du serveur', () => {
    expect(onglet).toContain('api.patch(`/personnel/avances/${a.id}/fin`, { dateFin: finSaisie[a.id] })');
  });

  it('la simulation montre la confrontation à la quotité (art. 188)', () => {
    expect(page).toContain('{simulation.reserveSaisies && <li className="text-warning">{simulation.reserveSaisies}</li>}');
  });
});
