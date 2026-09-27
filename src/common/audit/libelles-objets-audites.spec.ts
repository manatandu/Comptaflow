import { MODELES_AUDITES } from './champs-audites';
import { LIBELLES_OBJETS_AUDITES, objetsAudites } from './libelles-objets-audites';

/**
 * AUDIT FINAL F182 · le filtre du journal d'audit ne proposait que 26 des
 * objets journalisés. La table vit désormais à côté de la liste qu'elle
 * filtre, et elle la couvre exactement.
 */
describe('objets du journal d’audit · le filtre couvre tout ce qui est journalisé', () => {
  it('chaque modèle journalisé a son libellé, et aucun libellé ne nomme un modèle non journalisé', () => {
    expect(Object.keys(LIBELLES_OBJETS_AUDITES).sort()).toEqual([...MODELES_AUDITES].sort());
  });

  it('la route rend tous les objets, chacun avec son libellé de comptable', () => {
    const objets = objetsAudites();
    expect(objets).toHaveLength(MODELES_AUDITES.size);
    // Aucun nom de table (« RibTiers », « OrdreVirement ») ne sort tel quel.
    expect(objets.filter((o) => /[a-z][A-Z]/.test(o.libelle))).toEqual([]);
    for (const cle of ['RibTiers', 'OrdreVirement', 'BulletinPaie', 'MandatAuditeur']) {
      expect(objets.find((o) => o.cle === cle)?.libelle).toBe(LIBELLES_OBJETS_AUDITES[cle]);
    }
  });

  it('la liste est rangée par libellé', () => {
    const libelles = objetsAudites().map((o) => o.libelle);
    expect(libelles).toEqual([...libelles].sort((a, b) => a.localeCompare(b, 'fr')));
  });
});
