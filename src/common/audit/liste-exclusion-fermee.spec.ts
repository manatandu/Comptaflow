import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLONNES_EXCLUES_PAR_MODELE,
  MARQUEUR_MASQUE,
  colonnesExclues,
  estChampSensible,
  masquer,
} from './champs-audites';

/**
 * LE JOURNAL D'AUDIT NE RECOPIE PAS CE QUE L'API N'EXPOSE PAS.
 *
 * `masquer()` décidait par le NOM du champ · neuf fragments (`motdepasse`,
 * `token`, `secret`…). L'heuristique attrape ce qui s'annonce, et rien
 * d'autre.
 *
 * `User.estOperateurPlateforme` ne s'annonce pas. Le schéma dit de lui
 * « aucun DTO n'expose ce champ, il est donc inatteignable par l'API » et
 * « jamais renvoyé par /utilisateurs ». Pourtant `User` est un modèle audité,
 * la charge `apres` recopie la ligne entière, et `/journal-audit` la rend à
 * tout utilisateur du dossier. Le drapeau désigne le compte de l'exploitant
 * du logiciel présent chez le client · exactement celui qu'on cherche quand
 * on cherche.
 *
 * D'où une liste par colonne, et le test qui la tient FERMÉE.
 */

const RACINE = join(__dirname, '..', '..', '..');

function colonnesDuModele(nom: string): string[] {
  const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
  const bloc = new RegExp(`^model ${nom} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
  if (!bloc) throw new Error(`Modèle ${nom} introuvable dans le schéma.`);
  return bloc[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'))
    .map((l) => l.split(/\s+/)[0]);
}

describe('la liste d’exclusion est fermée sur User', () => {
  // Toute colonne de `User` doit être classée · admise au journal, ou exclue.
  // Une colonne ajoutée demain fait tomber ce test tant que personne ne l'a
  // tranchée. C'est ce qui distingue une liste fermée d'une liste oubliée.
  const ADMISES = [
    'id',
    'tenantId',
    'tenant',
    'email',
    'role',
    'estActif',
    // Attrapé par le fragment `motdepasse` · un sur-masquage sans conséquence,
    // le journal n'a pas besoin de dire si le drapeau valait vrai ou faux.
    'doitChangerMotDePasse',
    'sessionsInvalidesAvant',
    'tentativesEchouees',
    'verrouilleJusqua',
    'createdAt',
  ];

  it('classe chaque colonne de User, sans exception ni oubli', () => {
    const exclues = COLONNES_EXCLUES_PAR_MODELE.User;
    expect([...colonnesDuModele('User')].sort()).toEqual([...ADMISES, ...exclues].sort());
  });

  it('masque estOperateurPlateforme dans la charge d’un événement User', () => {
    const ligne = {
      id: 'u-1',
      email: 'jean@asbl.cd',
      motDePasse: '$2b$10$empreinteBcrypt',
      role: 'COMPTABLE',
      estOperateurPlateforme: true,
    };
    const masque = masquer(ligne, colonnesExclues('User')) as Record<string, unknown>;
    expect(masque.estOperateurPlateforme).toBe(MARQUEUR_MASQUE);
    expect(masque.motDePasse).toBe(MARQUEUR_MASQUE);
    // Ce qui n'est pas sensible reste lisible · un journal qui masque tout ne
    // sert plus de chemin de révision (AUDCIF art. 22, 6°).
    expect(masque.email).toBe('jean@asbl.cd');
    expect(masque.role).toBe('COMPTABLE');
  });

  it('masque à toute profondeur, filtre d’une opération de masse compris', () => {
    const masse = {
      operation: 'updateMany',
      filtre: { tenantId: 'd-1', estOperateurPlateforme: false },
      resultat: { count: 3 },
    };
    const masque = masquer(masse, colonnesExclues('User')) as {
      filtre: Record<string, unknown>;
    };
    expect(masque.filtre.estOperateurPlateforme).toBe(MARQUEUR_MASQUE);
    expect(masque.filtre.tenantId).toBe('d-1');
  });

  // ══════════════════════════════════════════════════════════════════════
  // LE REGISTRE DU PERSONNEL · les premières données personnelles du dépôt
  // ══════════════════════════════════════════════════════════════════════
  //
  // La liste fermée valait pour `User` seul. Trois modèles s'y ajoutent, et
  // ils posent un problème d'une autre nature : sur `User`, l'exclusion
  // protège le LOGICIEL (le compte de l'exploitant) ; ici elle protège une
  // PERSONNE. Le même mécanisme, et la même exigence · toute colonne doit
  // être classée, et une colonne ajoutée demain fait tomber le test.

  const ADMISES_PAR_MODELE: Record<string, string[]> = {
    Salarie: [
      'id',
      'tenantId',
      'tenant',
      'matricule',
      'nom',
      'postNom',
      'prenoms',
      'sexe',
      // Faits de GESTION, pas données de la personne · ce sont eux qu'un
      // inspecteur du travail vient vérifier.
      'aptitudeConstateeLe',
      'aptitudeConstateePar',
      'aptitudeProvisoire',
      'declarationEngagementLe',
      'declarationDepartLe',
      'actif',
      'contrats',
      'enfants',
      'createdAt',
      'createdBy',
      'updatedAt',
    ],
    EnfantACharge: ['id', 'tenantId', 'tenant', 'salarieId', 'salarie', 'createdAt', 'updatedAt'],
    ContratTravail: [
      'id',
      'tenantId',
      'tenant',
      'salarieId',
      'salarie',
      'type',
      'constateParEcrit',
      'dateEntreeEnVigueur',
      'dateConclusion',
      'lieuConclusion',
      'dateFinPrevue',
      'separeDeSaFamille',
      'ouvrageDetermine',
      'motifRemplacement',
      'emploiPermanent',
      'natureTravail',
      'lieuExecution',
      'categorieProfessionnelle',
      // LA CLASSE RESTE LISIBLE, ET C'EST DÉLIBÉRÉ. Elle commande le MINIMUM
      // légal de la rémunération : rétrograder quelqu'un d'une classe après
      // coup abaisse le minimum qui lui est opposable, et c'est exactement la
      // retouche qu'un journal d'audit existe pour rendre visible. La masquer
      // protégerait la manipulation, pas la personne.
      'classeProfessionnelle',
      // L'UNITÉ, PAS LE MONTANT. Savoir qu'une rémunération est stipulée au
      // mois ne dit rien de ce qu'elle vaut · le montant, lui, est masqué.
      // Et sans l'unité, un changement de classe au journal se lirait sans
      // qu'on puisse voir s'il s'accompagne d'un changement de base.
      'periodiciteRemuneration',
      'manoeuvreSansSpecialite',
      'clauseEssai',
      'essaiConstateParEcrit',
      'essaiDureeJours',
      'dureePreavisJours',
      'viseParOnem',
      'dateVisaOnem',
      'renouvelleDeId',
      'renouvelleDe',
      'renouvellement',
      'dateFin',
      'motifFin',
      'createdAt',
      'createdBy',
      'updatedAt',
    ],
  };

  it.each(Object.keys(ADMISES_PAR_MODELE))(
    'classe chaque colonne de %s, sans exception ni oubli',
    (modele) => {
      const exclues = COLONNES_EXCLUES_PAR_MODELE[modele] ?? [];
      expect([...colonnesDuModele(modele)].sort()).toEqual(
        [...ADMISES_PAR_MODELE[modele], ...exclues].sort(),
      );
    },
  );

  it('LE JOURNAL DIT QUI, PAS QUOI · un salarié reste identifiable, sa vie non', () => {
    // Les deux moitiés de l'exigence, dans un seul test, parce qu'elles se
    // contredisent si on les tient séparément : tout masquer rend le journal
    // inutile comme chemin de révision, ne rien masquer en fait un fichier de
    // personnel ouvert à tout le dossier et conservé bien plus longtemps que
    // la fiche.
    const ligne = {
      id: 's-1',
      matricule: 'M-014',
      nom: 'Mukendi',
      sexe: 'FEMININ',
      nationalite: 'Congolaise',
      dateNaissance: new Date('1990-04-12'),
      nomConjoint: 'Kabeya Marie',
      numeroAffiliationCnss: 'CNSS-0099',
      lieuNaissance: 'Mbuji-Mayi',
      actif: true,
    };
    const m = masquer(ligne, colonnesExclues('Salarie')) as Record<string, unknown>;
    // QUI · la ligne reste désignable.
    expect(m.nom).toBe('Mukendi');
    expect(m.matricule).toBe('M-014');
    expect(m.sexe).toBe('FEMININ');
    expect(m.actif).toBe(true);
    // QUOI · rien de ce qui décrit la personne.
    for (const champ of [
      'nationalite',
      'dateNaissance',
      'nomConjoint',
      'numeroAffiliationCnss',
      'lieuNaissance',
    ]) {
      expect(m[champ]).toBe(MARQUEUR_MASQUE);
    }
    // La CLÉ survit au masquage · savoir QUE la date de naissance a changé
    // fait partie de la trace.
    expect(Object.keys(m)).toContain('dateNaissance');
  });

  it('LA RÉMUNÉRATION EST MASQUÉE, le reste du contrat non', () => {
    const ligne = {
      id: 'c-1',
      type: 'DUREE_DETERMINEE',
      dateEntreeEnVigueur: new Date('2026-01-05'),
      remunerationBase: 1_200_000,
      avantagesConvenus: 'Logement de fonction',
      emploiPermanent: false,
    };
    const m = masquer(ligne, colonnesExclues('ContratTravail')) as Record<string, unknown>;
    expect(m.remunerationBase).toBe(MARQUEUR_MASQUE);
    expect(m.avantagesConvenus).toBe(MARQUEUR_MASQUE);
    // Le type et la date font la requalification · les masquer viderait le
    // journal de ce qu'on vient précisément y chercher.
    expect(m.type).toBe('DUREE_DETERMINEE');
    expect(m.emploiPermanent).toBe(false);
  });

  it('UN ENFANT NE SE NOMME PAS AU JOURNAL · seul son rattachement y reste', () => {
    const m = masquer(
      { id: 'e-1', salarieId: 's-1', nom: 'Mukendi', prenoms: 'Grace', dateNaissance: new Date('2019-02-01') },
      colonnesExclues('EnfantACharge'),
    ) as Record<string, unknown>;
    expect(m.salarieId).toBe('s-1');
    expect(m.nom).toBe(MARQUEUR_MASQUE);
    expect(m.prenoms).toBe(MARQUEUR_MASQUE);
    expect(m.dateNaissance).toBe(MARQUEUR_MASQUE);
  });

  it('L’EXCLUSION EST PAR MODÈLE · « nom » reste lisible ailleurs', () => {
    // `nom` est exclu sur `EnfantACharge` et ADMIS sur `Salarie`. Une
    // exclusion par NOM DE CHAMP, et non par modèle, effacerait le nom du
    // salarié lui-même, et le journal ne dirait plus de qui il parle.
    expect(estChampSensible('nom', colonnesExclues('EnfantACharge'))).toBe(true);
    expect(estChampSensible('nom', colonnesExclues('Salarie'))).toBe(false);
    expect(estChampSensible('nom', colonnesExclues('Tiers'))).toBe(false);
  });

  it('n’exclut rien sur un modèle qui n’a pas de liste', () => {
    // La liste est nommée modèle par modèle · `estOperateurPlateforme` n'est
    // pas un nom réservé, c'est une colonne de `User`.
    expect(colonnesExclues('Compte').size).toBe(0);
    expect(estChampSensible('estOperateurPlateforme')).toBe(false);
    expect(estChampSensible('estOperateurPlateforme', colonnesExclues('User'))).toBe(true);
  });
});
