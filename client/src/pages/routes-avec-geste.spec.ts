import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CHAQUE ROUTE D'ÉCRITURE A SON GESTE À L'ÉCRAN.
 *
 * Audit de l'interface du 2026-09-27, I11 · une vingtaine de routes POST,
 * PATCH et DELETE n'étaient appelées par aucun écran : le besoin existait, le
 * service et sa règle aussi, et l'utilisateur n'avait aucun moyen de s'en
 * servir. Chaque ligne ci-dessous nomme la route au CONTRÔLEUR et l'appel
 * dans la PAGE ; les deux doivent exister. La liste grandit à chaque geste
 * ajouté.
 */

const client = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const serveur = (f: string) => readFileSync(join(__dirname, '../../../src/modules', f), 'utf8');

const GESTES: Array<{ route: string; controleur: string; decorateur: string; page: string; appel: string }> = [
  {
    route: 'DELETE /facturation/:id',
    controleur: 'facturation/facturation.controller.ts',
    decorateur: "@Delete(':id')",
    page: 'FacturationPage.tsx',
    appel: 'api.delete(`/facturation/${factureId}`)',
  },
  {
    route: 'DELETE /exonerations/:id',
    controleur: 'exonerations/exonerations.controller.ts',
    decorateur: "@Delete(':id')",
    page: 'ExonerationsPage.tsx',
    appel: 'api.delete(`/exonerations/${dossier.id}`)',
  },
  {
    route: 'PATCH /commercial/devis/:id/revocation',
    controleur: 'commercial/commercial.controller.ts',
    decorateur: "@Patch(':id/revocation')",
    page: 'DevisPage.tsx',
    appel: "api.patch(`/commercial/devis/${id}/revocation`, { revoqueLe, motifRevocation: motifRevocation.trim() })",
  },
  {
    route: 'PATCH /faiblesses/faiblesses/:id/reponse-direction',
    controleur: 'faiblesses/faiblesses.controller.ts',
    decorateur: "@Patch('faiblesses/:faiblesseId/reponse-direction')",
    page: 'FaiblessesPage.tsx',
    appel: 'api.patch(`/faiblesses/faiblesses/${f.id}/reponse-direction`, {',
  },
  {
    route: 'PATCH /mandat-auditeur/:id/prorogation',
    controleur: 'mandat-auditeur/mandat-auditeur.controller.ts',
    decorateur: "@Patch(':id/prorogation')",
    page: 'MandatAuditeurPage.tsx',
    appel: 'api.patch(`/mandat-auditeur/${m.id}/prorogation`, { refus: !m.refusDeProrogation })',
  },
  {
    route: 'PATCH /mandat-auditeur/:id/fin',
    controleur: 'mandat-auditeur/mandat-auditeur.controller.ts',
    decorateur: "@Patch(':id/fin')",
    page: 'MandatAuditeurPage.tsx',
    appel: 'api.patch(`/mandat-auditeur/${m.id}/fin`, { finAnticipeeLe, motifFin: motifFin.trim() })',
  },
  {
    route: 'PATCH /accord-cadre/:id/main-oeuvre',
    controleur: 'accord-cadre/accord-cadre.controller.ts',
    decorateur: "@Patch(':id/main-oeuvre')",
    page: 'AccordCadrePage.tsx',
    appel: "api.patch(`/accord-cadre/${id}/main-oeuvre`, { part: Number(part.replace(',', '.')), source: source.trim(), date })",
  },
  {
    route: 'PATCH /accord-cadre/:id/denonciation',
    controleur: 'accord-cadre/accord-cadre.controller.ts',
    decorateur: "@Patch(':id/denonciation')",
    page: 'AccordCadrePage.tsx',
    appel: 'api.patch(`/accord-cadre/${id}/denonciation`, { denonceLe, motif: motif.trim() })',
  },
  {
    route: 'PATCH /regularisations/abonnements/:id',
    controleur: 'regularisation/regularisation.controller.ts',
    decorateur: "@Patch('abonnements/:id')",
    page: 'RegularisationPage.tsx',
    appel: 'api.patch(`/regularisations/abonnements/${id}`, { intitule: nouveau.trim() })',
  },
  {
    route: 'DELETE /regularisations/abonnements/:id',
    controleur: 'regularisation/regularisation.controller.ts',
    decorateur: "@Delete('abonnements/:id')",
    page: 'RegularisationPage.tsx',
    appel: 'api.delete(`/regularisations/abonnements/${id}`)',
  },
  {
    route: 'PATCH /conventions-financement/:id',
    controleur: 'bailleurs/convention-financement.controller.ts',
    decorateur: "@Patch(':id')",
    page: 'ConventionsFinancementPage.tsx',
    appel: 'api.patch(`/conventions-financement/${c.id}`, {',
  },
  {
    route: 'DELETE /conventions-financement/:id/tranches/:trancheId',
    controleur: 'bailleurs/convention-financement.controller.ts',
    decorateur: "@Delete(':id/tranches/:trancheId')",
    page: 'ConventionsFinancementPage.tsx',
    appel: 'api.delete(`/conventions-financement/${conventionId}/tranches/${trancheId}`)',
  },
  {
    route: 'DELETE /conventions-financement/:id/rapports/:rapportId',
    controleur: 'bailleurs/convention-financement.controller.ts',
    decorateur: "@Delete(':id/rapports/:rapportId')",
    page: 'ConventionsFinancementPage.tsx',
    appel: 'api.delete(`/conventions-financement/${conventionId}/rapports/${rapportId}`)',
  },
  {
    route: 'PATCH /registre-donateurs/:id',
    controleur: 'registre-donateurs/donation.controller.ts',
    decorateur: "@Patch(':id')",
    page: 'RegistreDonateursPage.tsx',
    appel: 'api.patch(`/registre-donateurs/${modif.id}`, corps)',
  },
];

describe('routes d’écriture et leur geste', () => {
  it.each(GESTES.map((g) => [g.route, g] as const))('%s', (_route, g) => {
    expect([g.route, serveur(g.controleur).includes(g.decorateur)]).toEqual([g.route, true]);
    expect([g.route, client(g.page).includes(g.appel)]).toEqual([g.route, true]);
  });
});
