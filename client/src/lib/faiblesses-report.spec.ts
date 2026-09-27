import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ciblesDeReport } from './faiblesses-report';
import type { RegistreFaiblesses } from './types';

const reg = (id: string, exerciceId: string, origine: RegistreFaiblesses['origine'], statut: RegistreFaiblesses['statut'] = 'OUVERT') =>
  ({ id, exerciceId, origine, statut, libelle: id, emetteur: null, dateLettre: null, referenceLettre: null, closLe: null }) as RegistreFaiblesses;

const EXERCICES = [
  { id: 'ex25', dateDebut: '2025-01-01T00:00:00.000Z' },
  { id: 'ex26', dateDebut: '2026-01-01T00:00:00.000Z' },
  { id: 'ex27', dateDebut: '2027-01-01T00:00:00.000Z' },
];

describe('F74 · les cibles d’un report', () => {
  const source = reg('src', 'ex26', 'REVISION_INTERNE');
  const registres = [
    source,
    reg('suivant', 'ex27', 'REVISION_INTERNE'),
    reg('lettre', 'ex27', 'RECOMMANDATION_EXTERNE'),
    reg('ancien', 'ex25', 'REVISION_INTERNE'),
    reg('meme', 'ex26', 'REVISION_INTERNE'),
    reg('clos', 'ex27', 'REVISION_INTERNE', 'CLOS'),
  ];

  it('ne propose que la même origine, un exercice postérieur, un registre ouvert', () => {
    expect(ciblesDeReport(registres, source, EXERCICES).map((r) => r.id)).toEqual(['suivant']);
  });

  it('sans l’exercice de la source, ne propose rien', () => {
    expect(ciblesDeReport(registres, reg('src', 'inconnu', 'REVISION_INTERNE'), EXERCICES)).toEqual([]);
  });
});

it('la fenêtre propose ses cibles par cette règle et aucune autre', () => {
  const page = readFileSync(join(__dirname, '../pages/FaiblessesPage.tsx'), 'utf8');
  const i = page.indexOf('const reporter = ');
  expect(i).toBeGreaterThan(0);
  const corps = page.slice(i, page.indexOf('window.prompt', i));
  expect(corps).toContain('ciblesDeReport(registres ?? [], detail, exercices)');
});
