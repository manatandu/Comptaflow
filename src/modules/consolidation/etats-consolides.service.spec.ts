import { BadRequestException } from '@nestjs/common';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { cumulerConsolidation, EntiteACumuler, LigneBalanceEntree } from './cumul-consolidation';
import { EtatsConsolidesService } from './etats-consolides.service';
import { noteDuPerimetre } from './note-perimetre';
import { ResultatEntite } from './perimetre-consolidation';

/**
 * Le CÂBLAGE des états consolidés · quel exercice sert de N-1, et ce que la
 * colonne devient quand il ne se consolide pas. Le moteur est testé à part.
 */
const T = 'dossier';
const b = (l: [string, number][]): LigneBalanceEntree[] => l.map(([numero, solde]) => ({ numero, intitule: numero, solde }));
const mere = (actif: number): EntiteACumuler => ({
  id: T,
  nom: 'Mère',
  estConsolidante: true,
  methode: 'IG',
  pctInteret: 100,
  balance: b([['24100000', actif], ['10100000', -actif]]),
});
const EX = { dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const cumul = (actif: number) => ({ ...cumulerConsolidation(EX, [mere(actif)], [], []), reserves: [] });
const res = (nom: string, methode: ResultatEntite['methode'], pct: number, estConsolidante = false): ResultatEntite => ({
  id: nom,
  nom,
  estConsolidante,
  pctControle: pct,
  pctInteret: pct,
  natureControle: 'EXCLUSIF_DE_DROIT',
  methode,
  fondement: 'art. 78',
  aJustifierEnNotes: [],
  exclusion: null,
  dateCloture: null,
});

function monter(opts: { precedent: string | null; entitesN1: number; cumulN1?: 'ok' | 'refus' }) {
  const prisma: any = {
    exercice: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.id) return { dateDebut: EX.dateDebut };
        return opts.precedent ? { id: opts.precedent } : null;
      }),
    },
  };
  const cumuls: any = {
    cumul: jest.fn(async (_t: string, ex: string) => {
      if (ex === 'N') return cumul(1000);
      if (opts.cumulN1 === 'refus') throw new BadRequestException('Coût d’acquisition non déclaré');
      return cumul(800);
    }),
  };
  const perimetre: any = {
    etat: jest.fn(async (_t: string, ex: string) =>
      ex === 'N'
        ? { entites: [{ id: 'F', secteurActivite: 'Ciment' }], resultats: [res('Mère', 'IG', 100, true), res('F', 'IG', 80)] }
        : { entites: Array.from({ length: opts.entitesN1 }, () => ({ id: 'x' })), resultats: [res('Mère', 'IG', 100, true), res('F', 'IG', 60)] },
    ),
  };
  const svc = new EtatsConsolidesService(prisma, cumuls, perimetre, new EtatsFinanciersSyscohadaService(null as never, null as never));
  return { svc, cumuls, prisma };
}

describe('EtatsConsolidesService · la colonne N-1', () => {
  it('N-1 est l’exercice qui commence juste avant, lu par date décroissante', async () => {
    const { svc, prisma, cumuls } = monter({ precedent: 'P', entitesN1: 1 });
    const r = await svc.etats(T, 'N');
    const appel = prisma.exercice.findFirst.mock.calls.find((c: any[]) => !c[0].where.id)[0];
    expect(appel).toMatchObject({ where: { tenantId: T, dateDebut: { lt: EX.dateDebut } }, orderBy: { dateDebut: 'desc' } });
    expect(cumuls.cumul).toHaveBeenCalledWith(T, 'P');
    expect(r.comparatif.disponible).toBe(true);
    expect(r.bilan.actif.find((l) => l.cle === 'TOTAL_GENERAL_ACTIF')).toMatchObject({ net: 1000, netN1: 800 });
  });

  it('premier exercice · colonne vide et motif, jamais des zéros', async () => {
    const { svc } = monter({ precedent: null, entitesN1: 0 });
    const r = await svc.etats(T, 'N');
    expect(r.comparatif).toEqual({ disponible: false, motif: expect.stringMatching(/Premier exercice/) });
    expect(r.bilan.actif.every((l) => l.netN1 === null)).toBe(true);
  });

  it('un exercice précédent sans périmètre ne se consolide pas sur la seule mère', async () => {
    const { svc, cumuls } = monter({ precedent: 'P', entitesN1: 0 });
    const r = await svc.etats(T, 'N');
    expect(cumuls.cumul).not.toHaveBeenCalledWith(T, 'P');
    expect(r.comparatif.motif).toMatch(/Aucun périmètre déclaré/);
  });

  it('un refus du moteur sur N-1 vide la colonne et dit pourquoi, sans faire tomber N', async () => {
    const { svc } = monter({ precedent: 'P', entitesN1: 1, cumulN1: 'refus' });
    const r = await svc.etats(T, 'N');
    expect(r.comparatif.motif).toMatch(/ne se consolide pas · Coût d’acquisition non déclaré/);
    expect(r.compteDeResultat.every((l) => l.netN1 === null)).toBe(true);
  });

  it('la note du périmètre reçoit le secteur déclaré et les pourcentages de N-1', async () => {
    const { svc } = monter({ precedent: 'P', entitesN1: 1 });
    const r = await svc.etats(T, 'N');
    expect(r.notePerimetre.lignes.find((l) => l.denomination === 'F')).toMatchObject({ secteurActivite: 'Ciment', pctControleN: 80, pctControleN1: 60 });
  });
});

describe('noteDuPerimetre', () => {
  const n = [res('Mère', 'IG', 100, true), res('A', 'IG', 80), res('B', 'EXCLUE', 70), res('C', 'ME', 30)];
  const n1 = [res('Mère', 'IG', 100, true), res('A', 'IP', 50), res('D', 'ME', 25)];

  it('une entité exclue est « NC », le seul code que le D4C connaisse pour elle', () => {
    expect(noteDuPerimetre(n, new Map(), n1).lignes.find((l) => l.denomination === 'B')?.methodeN).toBe('NC');
  });

  it('N et N-1 s’apparient par la dénomination · entrées et sorties nommées', () => {
    const note = noteDuPerimetre(n, new Map(), n1);
    expect(note.lignes.find((l) => l.denomination === 'A')).toMatchObject({ methodeN: 'IG', methodeN1: 'IP', pctInteretN1: 50, entree: false });
    expect(note.lignes.find((l) => l.denomination === 'C')).toMatchObject({ methodeN1: null, pctControleN1: null, entree: true });
    expect(note.sorties).toEqual(['D']);
  });

  it('sans périmètre N-1, rien n’est une entrée', () => {
    const note = noteDuPerimetre(n, new Map(), null);
    expect(note.comparatifDisponible).toBe(false);
    expect(note.lignes.some((l) => l.entree)).toBe(false);
  });

  it('la consolidante n’a rien à justifier', () => {
    expect(noteDuPerimetre(n, new Map(), null).justifications.map((j) => j.denomination)).toEqual(['A', 'B', 'C']);
  });
});
