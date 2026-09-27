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
  {
    route: 'POST /relances/niveaux',
    controleur: 'relances/relances.controller.ts',
    decorateur: "@Post('niveaux')",
    page: 'RelancesPage.tsx',
    appel: "api.post('/relances/niveaux', {",
  },
  {
    route: 'PATCH /relances/niveaux/:id',
    controleur: 'relances/relances.controller.ts',
    decorateur: "@Patch('niveaux/:id')",
    page: 'RelancesPage.tsx',
    appel: 'api.patch(`/relances/niveaux/${id}`, corps)',
  },
  {
    route: 'POST /analytique/plans',
    controleur: 'analytique/analytique.controller.ts',
    decorateur: "@Post('plans')",
    page: 'PlansAnalytiquesPage.tsx',
    appel: "api.post<PlanAnalytique>('/analytique/plans', { code: axe.code.trim(), ...reglages })",
  },
  {
    route: 'PATCH /analytique/plans/:planId',
    controleur: 'analytique/analytique.controller.ts',
    decorateur: "@Patch('plans/:planId')",
    page: 'PlansAnalytiquesPage.tsx',
    appel: 'api.patch(`/analytique/plans/${axe.id}`, reglages)',
  },
  {
    route: 'DELETE /analytique/plans/:planId',
    controleur: 'analytique/analytique.controller.ts',
    decorateur: "@Delete('plans/:planId')",
    page: 'PlansAnalytiquesPage.tsx',
    appel: 'api.delete(`/analytique/plans/${plan.id}`)',
  },
  {
    route: 'DELETE /analytique/sections/:sectionId',
    controleur: 'analytique/analytique.controller.ts',
    decorateur: "@Delete('sections/:sectionId')",
    page: 'PlansAnalytiquesPage.tsx',
    appel: 'api.delete(`/analytique/sections/${section.id}`)',
  },
  {
    route: 'PATCH /fiscalite/retraitements/:id',
    controleur: 'fiscalite/fiscalite.controller.ts',
    decorateur: "@Patch('retraitements/:id')",
    page: 'FiscalitePage.tsx',
    appel: 'api.patch<ResultatFiscal>(`/fiscalite/retraitements/${r.id}`, { montant, commentaire })',
  },
  {
    route: 'PATCH /devises/:id',
    controleur: 'devises/devises.controller.ts',
    decorateur: "@Patch(':id')",
    page: 'DevisesPage.tsx',
    appel: 'api.patch(`/devises/${id}`, corps)',
  },
  {
    route: 'PATCH /ribs-banque/:id',
    controleur: 'banques/banques.controller.ts',
    decorateur: "@Patch('ribs-banque/:id')",
    page: 'BanquesPage.tsx',
    appel: 'api.patch(`/ribs-banque/${id}`, rib)',
  },
  {
    route: 'PATCH /immobilisations/familles/:id',
    controleur: 'immobilisations/immobilisation.controller.ts',
    decorateur: "@Patch('familles/:id')",
    page: 'ImmobilisationsPage.tsx',
    appel: 'api.patch(`/immobilisations/familles/${f.id}`, corps)',
  },
  {
    route: 'PATCH /modeles-reglement/:id',
    controleur: 'tiers/tiers.controller.ts',
    decorateur: "@Patch(':id')",
    page: 'TiersPage.tsx',
    appel: 'api.patch(`/modeles-reglement/${m.id}`, corps)',
  },
  {
    route: 'PATCH /ecritures/:id',
    controleur: 'comptabilite/ecriture.controller.ts',
    decorateur: "@Patch(':id')",
    page: 'BrouillardPage.tsx',
    appel: 'api.patch(`/ecritures/${edition.id}`, corps)',
  },
  {
    route: 'POST /plateforme/cabinets/:tenantId/dossier-editeur',
    controleur: 'plateforme/plateforme.controller.ts',
    decorateur: "@Post('cabinets/:tenantId/dossier-editeur')",
    page: 'PlateformePage.tsx',
    appel: 'api.post(`/plateforme/cabinets/${c.id}/dossier-editeur`, {})',
  },
  {
    route: 'POST /analytique/lignes/:ligneId/ventilations',
    controleur: 'analytique/analytique.controller.ts',
    decorateur: "@Post('lignes/:ligneId/ventilations')",
    page: 'EtatsAnalytiquesPage.tsx',
    appel: 'api.post(`/analytique/lignes/${aVentiler.ligneId}/ventilations`, {',
  },
  {
    route: 'DELETE /analytique/lignes/:ligneId/ventilations',
    controleur: 'analytique/analytique.controller.ts',
    decorateur: "@Delete('lignes/:ligneId/ventilations')",
    page: 'EtatsAnalytiquesPage.tsx',
    appel: 'api.delete(`/analytique/lignes/${ligneEcritureId}/ventilations`)',
  },
  // Audit du serveur de 2026-09, I2 · le lien d'une consignation et d'un écart
  // d'inventaire à l'écriture passée au journal n'avait aucun chemin.
  {
    route: 'POST /emballages/consignations/:id/ecritures/:role',
    controleur: 'emballages/emballages.controller.ts',
    decorateur: "@Post('consignations/:id/ecritures/:role')",
    page: 'EmballagesPage.tsx',
    appel: 'api.post(`/emballages/consignations/${consignationId}/ecritures/${role}`, { ecritureId: choix })',
  },
  {
    route: 'DELETE /emballages/consignations/:id/ecritures/:role',
    controleur: 'emballages/emballages.controller.ts',
    decorateur: "@Delete('consignations/:id/ecritures/:role')",
    page: 'EmballagesPage.tsx',
    appel: 'api.delete(`/emballages/consignations/${consignationId}/ecritures/${role}`)',
  },
  {
    route: 'DELETE /emballages/consignations/:id',
    controleur: 'emballages/emballages.controller.ts',
    decorateur: "@Delete('consignations/:id')",
    page: 'EmballagesPage.tsx',
    appel: 'api.delete(`/emballages/consignations/${c.id}`)',
  },
  {
    route: 'POST /magasin/articles/:articleId/mouvements/:mouvementId/annulation',
    controleur: 'stocks/magasin.controller.ts',
    decorateur: "@Post('articles/:articleId/mouvements/:mouvementId/annulation')",
    page: 'MagasinPage.tsx',
    appel: '`/magasin/articles/${selection}/mouvements/${aAnnuler.id}/annulation`',
  },
  {
    route: 'DELETE /inventaire/fiches/:ficheId',
    controleur: 'inventaire/inventaire.controller.ts',
    decorateur: "@Delete('fiches/:ficheId')",
    page: 'InventairePage.tsx',
    appel: 'api.delete(`/inventaire/fiches/${fiche.id}`)',
  },
  {
    route: 'POST /inventaire/ecarts/:ecartId/ecriture',
    controleur: 'inventaire/inventaire.controller.ts',
    decorateur: "@Post('ecarts/:ecartId/ecriture')",
    page: 'InventairePage.tsx',
    appel: 'api.post(`/inventaire/ecarts/${ecart.id}/ecriture`, { ecritureId: choix })',
  },
  {
    route: 'DELETE /inventaire/ecarts/:ecartId/ecriture',
    controleur: 'inventaire/inventaire.controller.ts',
    decorateur: "@Delete('ecarts/:ecartId/ecriture')",
    page: 'InventairePage.tsx',
    appel: 'api.delete(`/inventaire/ecarts/${ecart.id}/ecriture`)',
  },
];

describe('routes d’écriture et leur geste', () => {
  it.each(GESTES.map((g) => [g.route, g] as const))('%s', (_route, g) => {
    expect([g.route, serveur(g.controleur).includes(g.decorateur)]).toEqual([g.route, true]);
    expect([g.route, client(g.page).includes(g.appel)]).toEqual([g.route, true]);
  });
});
