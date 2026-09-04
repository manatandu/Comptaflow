// Les décorateurs de class-validator lisent les métadonnées de conception ·
// hors du contexte Nest, personne ne charge ce polyfill à notre place.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreerEcritureDto, LigneEcritureDto } from './creer-ecriture.dto';
import { ModifierEcritureDto } from './brouillard.dto';

/**
 * LA DATE DE VERSEMENT DOIT POUVOIR ENTRER, ET UN CHAMP NON DÉCLARÉ NE LE PEUT
 * PAS · le serveur valide avec `whitelist: true, forbidNonWhitelisted: true`
 * (voir bootstrap.ts). Un champ absent du DTO n'est donc pas ignoré : il fait
 * REJETER toute la requête. Tant que `LigneEcritureDto` ne le porte pas, une
 * pièce qui transporte la date du versement est refusée en bloc, et l'écran
 * qui la propose ne peut rien enregistrer.
 *
 * POURQUOI CETTE DATE EXISTE · les textes rattachent la retenue au mois du
 * VERSEMENT, jamais à celui de l'écriture qui la constate. Loi n° 004/2003,
 * art. 18 (rédaction de la loi n° 23/052 du 30 novembre 2023) : « Les retenues
 * effectuées au titre d'Impôt sur le Revenu des Personnes Physiques par toute
 * personne physique ou morale qui paye des revenus salariaux et revenus
 * assimilés doivent être versées au plus tard le 15 du mois qui suit celui du
 * versement de ces revenus aux bénéficiaires ou de leur mise à disposition. »
 *
 * ABSENTE = la date de l'écriture fait foi, et c'est le cas ordinaire. Le
 * dernier test le fige : une ligne qui ne la porte pas doit rester valide et
 * ne rien apporter, sans quoi toute la saisie existante deviendrait fautive.
 */

const MEMES_OPTIONS_QUE_LE_SERVEUR = { whitelist: true, forbidNonWhitelisted: true };

const ligne = (extra: Record<string, unknown>) => ({
  compteId: '11111111-1111-4111-8111-111111111111',
  libelle: 'Rémunérations du personnel',
  credit: 250000,
  ...extra,
});

const piece = (l: Record<string, unknown>) => ({
  exerciceId: '22222222-2222-4222-8222-222222222222',
  journalId: '33333333-3333-4333-8333-333333333333',
  date: '2026-12-31',
  libelle: 'Paie de décembre',
  lignes: [l],
});

describe('ligne d’écriture · date du versement', () => {
  it('accepte une date de versement à la CRÉATION', async () => {
    // Paie de décembre passée au 31 décembre, versée le 5 janvier · les deux
    // dates divergent, et c'est le mois du versement qui commande l'échéance.
    const dto = plainToInstance(CreerEcritureDto, piece(ligne({ dateVersement: '2027-01-05' })));
    expect(await validate(dto, MEMES_OPTIONS_QUE_LE_SERVEUR)).toEqual([]);
    expect(dto.lignes[0].dateVersement).toBe('2027-01-05');
  });

  it('accepte une date de versement à la CORRECTION d’une pièce en brouillard', async () => {
    // Les lignes du brouillard sont remplacées en bloc par le même
    // LigneEcritureDto · la date doit y entrer aussi, sinon une pièce
    // corrigée perdrait ce que la pièce créée portait.
    const dto = plainToInstance(ModifierEcritureDto, {
      lignes: [ligne({ dateVersement: '2027-01-05' }), ligne({ debit: 250000, credit: undefined })],
    });
    expect(await validate(dto, MEMES_OPTIONS_QUE_LE_SERVEUR)).toEqual([]);
    expect(dto.lignes![0].dateVersement).toBe('2027-01-05');
  });

  it('refuse une date qui n’en est pas une', async () => {
    const dto = plainToInstance(CreerEcritureDto, piece(ligne({ dateVersement: 'janvier' })));
    const erreurs = await validate(dto, MEMES_OPTIONS_QUE_LE_SERVEUR);
    expect(JSON.stringify(erreurs)).toContain('dateVersement');
  });

  it('reste FACULTATIVE · une ligne sans elle est valide et ne porte rien', async () => {
    // Le comportement d'aujourd'hui, et celui de toutes les lignes déjà en
    // base : NULL = la date de l'écriture fait foi. Une ligne muette ne doit
    // ni échouer ni se voir attribuer une date d'office.
    const dto = plainToInstance(LigneEcritureDto, ligne({}));
    expect(await validate(dto, MEMES_OPTIONS_QUE_LE_SERVEUR)).toEqual([]);
    expect(dto.dateVersement).toBeUndefined();
  });
});

/**
 * ACCEPTER N'EST PAS RANGER · le trou que ce bloc ferme.
 *
 * Les tests ci-dessus prouvent que le DTO laisse entrer la date. Ils ne
 * prouvent rien de ce qu'il en advient. Or `ecriture.service.ts` construit
 * lui-même l'objet remis à Prisma, champ par champ : une colonne absente de ce
 * mappage est SILENCIEUSEMENT jetée. Le DTO acceptait, l'écran envoyait,
 * Prisma laissait tomber, et la colonne serait restée nulle à jamais.
 *
 * Rien ne pouvait le voir. Le type compile (le DTO porte le champ), la requête
 * passe (la validation l'accepte), l'écriture s'enregistre (les autres champs
 * sont là), et aucun test d'un module CONSOMMATEUR ne le détecte : le registre
 * des retenues lit une base où la date est nulle, ce qui est précisément son
 * cas par défaut. Un défaut de persistance se confond avec le cas ordinaire.
 *
 * D'où une lecture de la SOURCE du service : la donnée doit être rangée aux
 * TROIS endroits où une ligne naît. Le troisième est le moins évident et c'est
 * le plus important pour la justesse du registre · une contre-passation annule
 * une opération, elle ne la redate pas. Si la ligne inversée perdait sa date de
 * versement, elle sortirait du registre par le mois de l'écriture alors qu'elle
 * y est entrée par le mois du versement : un mois se creuserait, un autre
 * gonflerait, et le total resterait juste. Invisible.
 */
describe('La date de versement est PERSISTÉE, pas seulement acceptée', () => {
  const source = () =>
    readFileSync(join(__dirname, '..', 'ecriture.service.ts'), 'utf8');

  it('range la date aux trois endroits où une ligne d’écriture naît', () => {
    const s = source();
    // Création, remplacement des lignes du brouillard, contre-passation.
    const occurrences = s.split('dateVersement:').length - 1;
    expect(`dateVersement rangé ${occurrences} fois`).toBe('dateVersement rangé 3 fois');
  });

  it('la range PARTOUT où elle range déjà la date d’échéance, et pas moins', () => {
    const s = source();
    const echeances = s.split('dateEcheance:').length - 1;
    const versements = s.split('dateVersement:').length - 1;
    // `dateEcheance` apparaît aux mêmes trois points de création. Les deux
    // dates naissent ensemble : un écart entre ces deux comptes signale une
    // ligne oubliée.
    expect(`échéance ${echeances} / versement ${versements}`).toBe(`échéance ${echeances} / versement ${echeances}`);
  });

  it('la contre-passation reprend la date de l’origine, elle ne la redate pas', () => {
    const s = source();
    // Le site de contre-passation reprend les champs BRUTS de l'origine (des
    // objets Date déjà lus en base), sans reconstruction.
    expect(s).toContain('dateVersement: l.dateVersement,');
  });
});
