import { fusionnerCumuls, motifRefusOd, SectionConnue } from './od-analytique';

const sections: SectionConnue[] = [
  { id: 'a', planId: 'P', code: '11', estTotal: false },
  { id: 'b', planId: 'P', code: '12', estTotal: false },
  { id: 't', planId: 'P', code: '1', estTotal: true },
  { id: 'x', planId: 'Q', code: '11', estTotal: false },
];
const base = { planId: 'P', sections, classeCompte: '6', classesVentilees: '2,6,7' };

describe('OD analytiques · un reclassement qui se solde', () => {
  it('accepte un reclassement équilibré entre deux sections du plan', () => {
    expect(
      motifRefusOd({ ...base, lignes: [{ sectionId: 'a', credit: 500 }, { sectionId: 'b', debit: 500 }] }),
    ).toBeNull();
  });

  it("refuse une OD qui ne s'équilibre pas, l'écart avec Sage est voulu", () => {
    expect(
      motifRefusOd({ ...base, lignes: [{ sectionId: 'a', credit: 500 }, { sectionId: 'b', debit: 400 }] }),
    ).toMatch(/ne s'équilibre pas/);
  });

  it("refuse un compte d'une classe que le plan ne ventile pas", () => {
    expect(
      motifRefusOd({ ...base, classeCompte: '5', lignes: [{ sectionId: 'a', credit: 1 }, { sectionId: 'b', debit: 1 }] }),
    ).toMatch(/ne ventile pas la classe 5/);
  });

  it("refuse une rubrique, une section d'un autre plan, une ligne sans sens ou à deux sens", () => {
    const deux = (l: object) => motifRefusOd({ ...base, lignes: [l as never, { sectionId: 'a', credit: 1 }] });
    expect(deux({ sectionId: 't', debit: 1 })).toMatch(/rubrique/);
    expect(deux({ sectionId: 'x', debit: 1 })).toMatch(/n'appartient pas au plan/);
    expect(deux({ sectionId: 'b' })).toMatch(/débit OU au crédit/);
    expect(deux({ sectionId: 'b', debit: 1, credit: 1 })).toMatch(/débit OU au crédit/);
    expect(motifRefusOd({ ...base, lignes: [{ sectionId: 'a', debit: 1 }] })).toMatch(/au moins deux lignes/);
  });

  it('additionne les OD aux ventilations section par section, sans perdre une section de l’un ou de l’autre', () => {
    const r = fusionnerCumuls(
      new Map([['a', { debit: 1000, credit: 0 }]]),
      new Map([
        ['a', { debit: 0, credit: 300 }],
        ['b', { debit: 300, credit: 0 }],
      ]),
    );
    expect(r.get('a')).toEqual({ debit: 1000, credit: 300 });
    expect(r.get('b')).toEqual({ debit: 300, credit: 0 });
  });
});
