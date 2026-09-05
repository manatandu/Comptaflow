import { Referentiel } from '@prisma/client';
import { RelancesService } from './relances.service';
import { PrismaService } from '../../common/prisma.service';
import { CourrierService } from '../courrier/courrier.service';

/** Le semis ne met rien en file · la file n'est là que pour construire le service. */
const sansCourrier = () => ({ mettreEnFile: jest.fn() }) as unknown as CourrierService;

/**
 * LES SEULES PHRASES DU LOGICIEL QUI SORTENT DE L'ÉCRAN.
 *
 * Les niveaux de relance portent des modèles de lettre qui partent VRAIMENT,
 * sous la signature du dossier, à un adhérent ou à un client. Un jeu unique
 * pour les deux référentiels ne tenait que par un accident de rédaction :
 * à force de chercher des mots qui conviennent aux deux, on obtient une lettre
 * qui ne convient bien à personne.
 *
 * Ce que ces tests figent : le semis reçoit le référentiel comme les cinq
 * autres, les deux jeux existent, ils diffèrent, et aucun ne parle la langue
 * de l'autre. Le dernier point est le seul qui compte pour le destinataire.
 */

function service() {
  const createMany = jest.fn().mockResolvedValue({ count: 3 });
  const prisma = {
    niveauRelance: { count: jest.fn().mockResolvedValue(0), createMany },
  } as unknown as PrismaService;
  return { svc: new RelancesService(prisma, sansCourrier()), createMany };
}

async function modeles(referentiel: Referentiel) {
  const { svc, createMany } = service();
  await svc.seedNiveauxDefaut('t1', referentiel);
  const data = createMany.mock.calls[0][0].data as { niveau: number; libelle: string; modeleTexte: string }[];
  return data;
}

describe('Niveaux de relance semés à la création du dossier', () => {
  it('sème trois niveaux dans les deux référentiels', async () => {
    for (const r of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      const d = await modeles(r);
      expect(d.map((n) => n.niveau)).toEqual([1, 2, 3]);
      expect(d.every((n) => n.modeleTexte.includes('{tiers}') || n.modeleTexte.includes('Madame'))).toBe(true);
      // Les quatre marqueurs que la fusion remplace doivent être présents,
      // sinon la lettre part avec un trou.
      for (const n of d) {
        for (const marqueur of ['{montant}', '{date}', '{detail}', '{entite}']) {
          expect(n.modeleTexte).toContain(marqueur);
        }
      }
    }
  });

  it('ne sert pas la même lettre aux deux référentiels', async () => {
    const sycebnl = (await modeles(Referentiel.SYCEBNL)).map((n) => n.modeleTexte);
    const syscohada = (await modeles(Referentiel.SYSCOHADA)).map((n) => n.modeleTexte);
    expect(syscohada).not.toEqual(sycebnl);
  });

  it('la lettre d’une entreprise ne parle pas comme une association', async () => {
    const textes = (await modeles(Referentiel.SYSCOHADA)).map((n) => n.modeleTexte).join('\n');
    expect(textes).not.toMatch(/adhérent|cotisation|membre|notre entité de poursuivre/i);
  });

  it('n’annonce d’intérêts de retard dans aucun des deux jeux', async () => {
    // Ils ne sont dus que si une convention les prévoit · une lettre type qui
    // les annonce ferait dire au logiciel ce que le contrat ne dit pas.
    for (const r of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      const textes = (await modeles(r)).map((n) => n.modeleTexte).join('\n');
      expect(textes).not.toMatch(/intérêt|pénalit/i);
    }
  });

  it('ne sème rien si le dossier porte déjà des niveaux', async () => {
    const createMany = jest.fn();
    const prisma = {
      niveauRelance: { count: jest.fn().mockResolvedValue(3), createMany },
    } as unknown as PrismaService;
    await new RelancesService(prisma, sansCourrier()).seedNiveauxDefaut('t1', Referentiel.SYSCOHADA);
    expect(createMany).not.toHaveBeenCalled();
  });
});
