import { PLAN_COMPTES_SYCEBNL } from './compte-seed';

/**
 * COMPTES PRINCIPAUX (2 chiffres) · trois choses doivent tenir, sans quoi
 * l'agrégation par racine (EcritureService.balance()) casse en silence.
 */
describe('comptes principaux (2 chiffres)', () => {
  const totaux = PLAN_COMPTES_SYCEBNL.filter((c) => c.numero.length === 2);
  const detail = PLAN_COMPTES_SYCEBNL.filter((c) => c.numero.length > 2);

  it('sème un en-tête de division par regroupement officiel, tous en type Total', () => {
    // Une entrée par division réellement détaillée plus bas (10 à 19, 20 à
    // 29, 31 à 39, 40 à 49, 50 à 59 hors 54, 60 à 69, 70 à 79 hors 74/76,
    // 81 à 88, 90-91) · 92 à 99 volontairement absentes (§ compte-seed.ts).
    expect(totaux).toHaveLength(76);
    expect(totaux.every((c) => c.typeCompte === 'TOTAL')).toBe(true);
  });

  it("n'entre jamais en collision avec le numéro d'un compte Détail", () => {
    const numerosDetail = new Set(detail.map((c) => c.numero));
    for (const t of totaux) {
      expect(numerosDetail.has(t.numero)).toBe(false);
    }
  });

  it('confirme la raison du non-complètement à 8 chiffres : ça collisionnerait', () => {
    // "90" complété à 8 chiffres donnerait "90000000", déjà pris par le
    // compte 900 « secours en nature ». Ce test documente le contre-exemple
    // qui a tranché le choix fait dans total() · voir son commentaire.
    const numerosDetail = new Set(detail.map((c) => c.numero));
    const auraitCollisionne = totaux.some((t) => numerosDetail.has(`${t.numero}000000`.slice(0, 8)));
    expect(auraitCollisionne).toBe(true);
  });

  it('regroupe au moins un compte Détail réel, sans quoi l’en-tête serait orphelin', () => {
    for (const t of totaux) {
      const enfants = detail.filter((d) => d.numero.startsWith(t.numero) && d.classe === t.classe);
      expect(enfants.length).toBeGreaterThan(0);
    }
  });

  it('ne regroupe jamais un compte Détail d’une autre division', () => {
    // Ex. le total "10" ne doit rien agréger de la division "11".
    const dix = totaux.find((t) => t.numero === '10')!;
    const onze = detail.filter((d) => d.numero.startsWith('11'));
    expect(onze.some((d) => d.numero.startsWith(dix.numero) && d.numero[1] !== '0')).toBe(false);
  });

  it('un compte à 2 chiffres ne peut pas naître autrement que de ce semis', () => {
    // CreerCompteDto borne le numéro à 3-13 chiffres (voir son commentaire) :
    // c'est cette propriété que PlanComptesPage utilise pour verrouiller ces
    // lignes en édition.
    expect(totaux.every((c) => !/^\d{3,13}$/.test(c.numero))).toBe(true);
  });
});
