import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * MARQUEURS POSÉS APRÈS `creer` · SUR UNE LIGNE ENCORE LIBRE, ET LE PERDANT
 * RETIRE SON ÉCRITURE.
 *
 * Audit du serveur du 2026-09-27, F10 · `creer` commet sa propre
 * transaction, et le marqueur s'écrivait ensuite sans condition. Deux
 * demandes simultanées passaient toutes deux le test « déjà fait ? » : deux
 * écritures au journal, le second lien écrasant le premier, ou une
 * contrainte d'unicité tombant après que l'écriture était commise. Chaque
 * site pose désormais le lien par `updateMany` conditionné à un marqueur
 * nul, et retire l'écriture créée quand il perd (`retirerCompensation`,
 * testée dans compensation-ecriture.spec.ts).
 *
 * Lecture de source ancrée sur la structure · le bloc qui suit le lien.
 */
const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

/** Du `updateMany({` du lien jusqu'à la fin de son `if (count === 0) {`. */
function blocApres(source: string, debut: string | number): string {
  const i = typeof debut === 'number' ? debut : source.indexOf(debut);
  expect(['ancre trouvée', i >= 0]).toEqual(['ancre trouvée', true]);
  const siPerdu = source.indexOf('if (count === 0) {', i);
  return source.slice(i, source.indexOf('}', source.indexOf(';\n', source.indexOf('retirerCompensation', siPerdu))) + 1);
}

describe('marqueurs posés après creer', () => {
  it.each([
    ['regularisation/regularisation.service.ts', 'data: { ecritureRepriseId: ecriture.id },', 'ecritureRepriseId: null'],
    ['regularisation/regularisation.service.ts', 'await this.prisma.echeanceAbonnement.updateMany({', 'ecritureId: null'],
  ])('%s · %s', (fichier, ancre, condition) => {
    const source = lire(fichier);
    const debut = source.lastIndexOf('updateMany({', source.indexOf(ancre) + ancre.length);
    const bloc = blocApres(source, debut);
    expect(bloc).toContain(condition);
    expect(bloc).toContain('if (count === 0) {');
    expect(bloc).toContain('this.ecritureService.retirerCompensation(tenantId, ecriture.id)');
  });

  // La contre-passation d'une réévaluation pose son lien par un `update`
  // UNITAIRE (relecture adverse d'A5 bis, M6) · le journal d'audit en garde
  // l'avant et l'après, ce qu'un `updateMany` ne laisse pas. Même garde ·
  // conditionné au lien encore nul, et le perdant (P2025) retire sa pièce.
  it('la contre-passation d’une réévaluation · update unitaire conditionné au lien nul, le perdant retire sa pièce', () => {
    const source = lire('devises/devises.service.ts');
    const debut = source.indexOf('private async extournerSousVerrou(');
    expect(['ancre trouvée', debut >= 0]).toEqual(['ancre trouvée', true]);
    const corps = source.slice(debut, source.indexOf('\n  }\n', debut));
    const lien = corps.slice(corps.indexOf('await this.prisma.reevaluation.update({'));
    expect(lien).toContain('AND: [{ ecritureExtourneId: null }, { contrePassationDeclareeId: null }]');
    const perdu = lien.slice(lien.indexOf('} catch (e) {'));
    expect(perdu).toContain('this.ecritureService.retirerCompensation(tenantId, ecriture.id)');
    expect(perdu).toContain("e.code === 'P2025'");
  });

  it('la réévaluation retire ses deux écritures si son marqueur ne s’écrit pas', () => {
    const source = lire('devises/devises.service.ts');
    const i = source.indexOf('reevaluation = await this.prisma.reevaluation.create({');
    const capture = source.slice(source.indexOf('} catch (e) {', i), source.indexOf('throw e;', i));
    expect(capture).toContain('retirerCompensation(tenantId, ecritureEcarts.id)');
    expect(capture).toContain('retirerCompensation(tenantId, ecritureProvision.id)');
  });
});
