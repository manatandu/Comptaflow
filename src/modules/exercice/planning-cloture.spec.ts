import { FormeJuridiqueEbnl, FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import { JALONS_CLOTURE, dateJalon, jalonsApplicables , obligationsEvenementiellesApplicables, OBLIGATIONS_EVENEMENTIELLES } from './planning-cloture';

/**
 * PLANNING DE CLÔTURE · trois choses doivent tenir.
 *
 * 1. Les dates se calculent SUR LA CLÔTURE DE L'EXERCICE, pas sur l'année
 *    civile : le cours du CPCC raisonne sur un 31 décembre (« au plus tard
 *    fin avril de l'année prochaine »), OmegaX autorise un exercice décalé.
 * 2. Le calcul de fin de mois doit tomber juste, y compris en février bissextile.
 * 3. La table ne porte AUCUN MONTANT : ni taux d'astreinte, ni pénalité.
 *    Même règle que correspondance-retenues.ts, et pour la même raison :
 *    les taux cités par les textes de 2010 et 2013 n'ont pas été revérifiés.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('planning de clôture', () => {
  const finExerciceCivil = new Date(Date.UTC(2026, 11, 31));

  // Les jalons se visent par LIBELLÉ, jamais par numéro d'étape : le numéro
  // n'est qu'un rang dans la liste, et insérer un jalon au milieu décale tous
  // les suivants · un test ancré au numéro mesurerait la renumérotation
  // plutôt que la date qu'il prétend vérifier.
  const parLibelle = (fragment: string) =>
    JALONS_CLOTURE.find((j) => j.libelle.includes(fragment))!;

  it('cale les dépôts congolais sur les mois annoncés par le cours, pour un exercice civil', () => {
    const echeance = (fragment: string) =>
      iso(dateJalon(finExerciceCivil, parLibelle(fragment).echeance));

    // « au courant du mois de janvier » (compte annuel au Ministère de la Justice)
    expect(echeance('Ministère de la Justice')).toBe('2027-01-31');
    expect(echeance('Déclarations fiscales')).toBe('2027-04-30');
    // « au plus tard 15 juin » (Ministère de l'Économie)
    expect(echeance('Économie nationale')).toBe('2027-06-15');
    // « au plus tard fin juin » (approbation des comptes, puis dépôt au CPCC)
    expect(echeance('approbation des comptes')).toBe('2027-06-30');
    expect(echeance('CPCC')).toBe('2027-06-30');
    // « au plus tard fin juillet » (RCCM, dossiers SYSCOHADA seulement)
    expect(echeance('RCCM')).toBe('2027-07-31');
  });

  it("décale tout le planning quand l'exercice ne se clôt pas au 31 décembre", () => {
    // Exercice clos au 30 juin : le dépôt DGI n'est plus en avril mais en
    // octobre. Coder « fin avril » en dur aurait donné une échéance déjà
    // passée le jour de la clôture.
    const finJuin = new Date(Date.UTC(2026, 5, 30));
    expect(iso(dateJalon(finJuin, parLibelle('Déclarations fiscales').echeance))).toBe('2026-10-31');
  });

  it('tombe sur le bon dernier jour de février, bissextile compris', () => {
    // Clôture au 31 octobre 2027 : quatre mois après, c'est février 2028,
    // année bissextile. Le 29, pas le 28, et pas le 1er mars.
    const finOctobre = new Date(Date.UTC(2027, 9, 31));
    expect(iso(dateJalon(finOctobre, { moisApres: 4, jour: 'FIN' }))).toBe('2028-02-29');
    expect(iso(dateJalon(new Date(Date.UTC(2026, 9, 31)), { moisApres: 4, jour: 'FIN' }))).toBe('2027-02-28');
  });

  it('classe les jalons par échéance croissante, comme un planning se lit', () => {
    const echeances = JALONS_CLOTURE.map((j) => dateJalon(finExerciceCivil, j.echeance).getTime());
    expect(echeances).toEqual([...echeances].sort((a, b) => a - b));
  });

  it('ordonne les jalons et fait tenir chaque échéance après son début', () => {
    const etapes = JALONS_CLOTURE.map((j) => j.etape);
    expect(etapes).toEqual([...etapes].sort((a, b) => a - b));
    // L'unicité du numéro d'étape ne vaut plus sur la table entière : sept
    // étapes portent deux jalons, un par référentiel, sous le même numéro.
    // Elle est vérifiée référentiel par référentiel plus bas.
    for (const j of JALONS_CLOTURE) {
      expect(dateJalon(finExerciceCivil, j.echeance).getTime()).toBeGreaterThanOrEqual(
        dateJalon(finExerciceCivil, j.debut).getTime(),
      );
    }
  });

  it('cite une source pour chaque jalon', () => {
    for (const j of JALONS_CLOTURE) {
      expect(j.source.length).toBeGreaterThan(10);
    }
  });

  it("ne contient aucun taux ni montant d'astreinte", () => {
    // Les deux arrêtés d'astreinte sont NOMMÉS (c'est utile au comptable),
    // mais aucun chiffre MONÉTAIRE ne doit apparaître : un taux d'astreinte
    // de 2013 non revérifié n'a rien à faire dans un logiciel de 2026.
    //
    // Le pourcentage est admis à UNE condition, et le test la vérifie : que
    // le jalon cite l'article qui le fixe. La distinction n'est pas de
    // confort · un quota légal invariable et sourcé (la proportion de
    // main-d'œuvre nationale de l'article 37) n'est pas de même nature qu'un
    // taux financier susceptible de changer à chaque loi de finances. Sans
    // cette nuance, la règle interdirait de citer la loi elle-même.
    const texte = JALONS_CLOTURE.map((j) => `${j.libelle} ${j.detail} ${j.source}`).join(' ');
    expect(texte).not.toMatch(/\bFC\b|FCFA|\bCDF\b|franc/i);
    expect(texte).not.toMatch(/\d[\d\s.]*,\d{2}\b/);
    for (const j of JALONS_CLOTURE) {
      if (/%/.test(`${j.libelle} ${j.detail}`)) {
        expect(j.source).toMatch(/art\.|article/i);
      }
    }
  });

  it('marque comme LEGALE toute échéance opposable à un tiers', () => {
    const legaux = JALONS_CLOTURE.filter((j) => j.nature === 'LEGALE').map((j) => j.libelle);
    // Visés par LIBELLÉ et non par numéro d'étape : le numéro n'est qu'un
    // rang dans la liste, et insérer un jalon au milieu décalait tous les
    // suivants · le test mesurait alors la renumérotation, pas la nature.
    expect(legaux).toEqual([
      'Compte annuel et liste des membres effectifs au Ministère de la Justice',
      'Déclaration semestrielle relative aux ressources',
      // Deux fois : l'AUDCIF art. 19 impose lui aussi le livre d'inventaire.
      'Livre d’inventaire',
      'Livre d’inventaire',
      'Budget et comptes annuels au ministre du secteur (établissement d’utilité publique)',
      'Accord-cadre et main-d’œuvre nationale (ONG de droit étranger)',
      'Registre des donateurs arrêté',
      // Deux fois : la déclaration de l'IS et ses états joints n'ont rien de
      // commun avec la déclaration d'une association exemptée.
      'Déclarations fiscales annuelles',
      'Déclarations fiscales annuelles',
      'Rapport de gestion',
      'États financiers et rapport de gestion aux commissaires aux comptes',
      // AJOUTÉ le 2026-09-03 · ce jalon était classé INTERNE, sur le
      // calendrier du CPCC. L'article 19 al. 4 du SYCEBNL en fait une
      // obligation (« quarante-cinq jours au moins »), au même titre que
      // l'art. 140 de l'AUSCGIE pour la ligne précédente.
      'Mise à disposition de l’auditeur',
      'Rapport d’activité au Ministère du Plan et au ministère du secteur',
      'Dépôt au Ministère de l’Économie nationale',
      'Dépôt au Ministère de l’Économie nationale',
      'Approbation des états financiers et du rapport de gestion',
      'Dépôt des états financiers SYCEBNL au CPCC',
      'Dépôt des états financiers au CPCC',
      'Assemblée générale statuant sur les états financiers',
      'Dépôt des états financiers au RCCM',
      // Deux fois : l'AUSCGIE impose une réserve légale à la société, le
      // SYCEBNL renvoie aux statuts d'une association · même geste, deux
      // sources, et rien de commun entre un dividende et une dotation.
      'Affectation du résultat',
      'Affectation du résultat',
    ]);
  });
});

/**
 * APPLICABILITÉ · le point de la correction du 29/08/2026. Servir à une
 * association le dépôt au RCCM, ou à une entreprise le dépôt du compte annuel
 * au Ministère de la Justice, c'est afficher une obligation qui n'existe pas.
 */
describe('jalons applicables selon la forme juridique', () => {
  const libelles = (c: Parameters<typeof jalonsApplicables>[0]) =>
    jalonsApplicables(c).map((j) => j.libelle);

  const asbl = {
    referentiel: Referentiel.SYCEBNL,
    formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
    droitEtranger: false,
  };

  it("ne propose jamais le RCCM à une ASBL : elle n'est pas commerçante", () => {
    expect(libelles(asbl).some((l) => l.includes('RCCM'))).toBe(false);
  });

  it('donne à une ASBL le dépôt du compte annuel au Ministère de la Justice', () => {
    expect(libelles(asbl).some((l) => l.includes('Ministère de la Justice'))).toBe(true);
  });

  it("ne présente aucun jalon comme un dépôt d'états financiers à la DGI", () => {
    // Le seul jalon fiscal parle de DÉCLARATIONS, jamais d'un dépôt de liasse.
    const fiscal = JALONS_CLOTURE.find((j) => j.libelle.includes('Déclarations fiscales'))!;
    expect(fiscal.libelle).toBe('Déclarations fiscales annuelles');
    expect(fiscal.detail).toContain('N’EST PAS un dépôt d’états financiers');
    const depots = JALONS_CLOTURE.filter((j) => j.libelle.toLowerCase().startsWith('dépôt'));
    expect(depots.some((j) => /DGI|fiscal|impôts/i.test(j.libelle))).toBe(false);
  });

  it('réserve le rapport au Ministère du Plan aux ONG', () => {
    expect(libelles(asbl).some((l) => l.includes('Ministère du Plan'))).toBe(false);
    const ong = { ...asbl, formeJuridique: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE };
    expect(libelles(ong).some((l) => l.includes('Ministère du Plan'))).toBe(true);
  });

  it('bascule sur le circuit commercial pour un dossier SYSCOHADA', () => {
    const entreprise = {
      ...asbl,
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE,
    };
    const l = libelles(entreprise);
    expect(l.some((x) => x.includes('RCCM'))).toBe(true);
    // Ni compte annuel à la Justice, ni livre d'inventaire ou registre des
    // donateurs SYCEBNL : ce sont des obligations d'EBNL.
    expect(l.some((x) => x.includes('Ministère de la Justice'))).toBe(false);
    expect(l.some((x) => x.includes('donateurs'))).toBe(false);
  });

  /*
    FORME OHADA · le pendant SYSCOHADA du test précédent. Trois règles se
    jouent ici, et chacune répond à une exclusion de texte, pas à un choix
    d'ergonomie : l'entreprenant est DISPENSÉ d'immatriculation au RCCM
    (AUDCG art. 30), la coopérative s'immatricule au Registre des Sociétés
    Coopératives et non au RCCM (AUSCOOP art. 206), et le circuit des
    assemblées de l'AUSCGIE art. 140 suppose des organes qu'une entreprise
    individuelle n'a pas.
  */
  const syscohada = (forme?: FormeJuridiqueSyscohada) => ({
    referentiel: Referentiel.SYSCOHADA,
    formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
    formeJuridiqueSyscohada: forme ?? null,
    droitEtranger: false,
  });

  it('ne propose le dépôt au RCCM ni à un entreprenant ni à une coopérative', () => {
    expect(libelles(syscohada(FormeJuridiqueSyscohada.ENTREPRENANT)).some((l) => l.includes('RCCM'))).toBe(false);
    expect(libelles(syscohada(FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE)).some((l) => l.includes('RCCM'))).toBe(
      false,
    );
    expect(libelles(syscohada(FormeJuridiqueSyscohada.SOCIETE_ANONYME)).some((l) => l.includes('RCCM'))).toBe(true);
  });

  it('réserve le circuit des assemblées aux SA, SAS et SARL (art. 140)', () => {
    const avec = libelles(syscohada(FormeJuridiqueSyscohada.SOCIETE_ANONYME));
    expect(avec.some((l) => l.includes('commissaires aux comptes'))).toBe(true);
    expect(avec.some((l) => l.includes('Assemblée générale'))).toBe(true);
    const sans = libelles(syscohada(FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE));
    expect(sans.some((l) => l.includes('commissaires aux comptes'))).toBe(false);
    expect(sans.some((l) => l.includes('Assemblée générale'))).toBe(false);
  });

  it('n’affiche aucun jalon de forme tant que la forme OHADA n’est pas renseignée', () => {
    // Le silence vaut mieux qu'une obligation servie à une forme qui n'y est
    // pas tenue · la forme se lit dans les statuts, elle ne se devine pas.
    const l = libelles(syscohada());
    expect(l.some((x) => x.includes('RCCM'))).toBe(false);
    expect(l.some((x) => x.includes('Assemblée générale'))).toBe(false);
    // Le tronc commun reste, lui, servi.
    expect(l).toContain('Clôture et réouverture des livres');
    expect(l.some((x) => x.includes('Rapport de gestion'))).toBe(true);
  });

  it('garde les jalons internes pour toutes les formes', () => {
    for (const forme of Object.values(FormeJuridiqueEbnl)) {
      const l = libelles({ ...asbl, formeJuridique: forme });
      expect(l).toContain('Balance de vérification');
      expect(l).toContain('Clôture et réouverture des livres');
    }
  });
});

/**
 * LES MANQUES COMBLÉS PAR L'AUDIT DU 29/08/2026 · trois obligations de la loi
 * 004/2001 que le planning ignorait, dont celle dont la sanction est la
 * dissolution de l'association.
 */
describe('obligations de la loi 004/2001 réintégrées', () => {
  const asbl = {
    referentiel: Referentiel.SYCEBNL,
    formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
    droitEtranger: false,
  };
  const eup = { ...asbl, formeJuridique: FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE };
  const ongEtrangere = {
    ...asbl,
    formeJuridique: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
    droitEtranger: true,
  };
  const libelles = (c: Parameters<typeof jalonsApplicables>[0]) => jalonsApplicables(c).map((j) => j.libelle);

  it('donne enfin un jalon à l’établissement d’utilité publique (art. 66)', () => {
    // Le défaut corrigé : FORMES_ASBL omettait cette forme, si bien que la
    // SEULE que la loi vise explicitement n'affichait AUCUN dépôt.
    expect(libelles(eup).some((l) => l.includes('ministre du secteur'))).toBe(true);
  });

  it('ne sert pas le jalon EUP à une association ordinaire', () => {
    expect(libelles(asbl).some((l) => l.includes('ministre du secteur'))).toBe(false);
  });

  it('porte la déclaration SEMESTRIELLE des ressources, sanctionnée par la dissolution', () => {
    const jalon = jalonsApplicables(asbl).find((j) => j.libelle.includes('semestrielle'))!;
    expect(jalon).toBeDefined();
    expect(jalon.detail).toContain('chaque semestre');
    expect(jalon.source).toContain('art. 4, e');
  });

  it('n’active le jalon des ONG étrangères que pour un dossier de droit étranger', () => {
    expect(libelles(ongEtrangere).some((l) => l.includes('Accord-cadre'))).toBe(true);
    expect(libelles(asbl).some((l) => l.includes('Accord-cadre'))).toBe(false);
  });
});

/**
 * OBLIGATIONS ÉVÉNEMENTIELLES · elles ne suivent aucun calendrier de clôture,
 * et c'est pour cela qu'elles échappaient au logiciel. Les ranger parmi les
 * jalons annuels leur aurait donné une échéance fausse.
 */
describe('obligations déclenchées par un événement', () => {
  it('porte le changement d’administrateur (art. 11) et le mouvement d’immeuble (art. 15)', () => {
    const cles = OBLIGATIONS_EVENEMENTIELLES.map((o) => o.cle);
    expect(cles).toContain('changementAdministrateur');
    expect(cles).toContain('mouvementImmeuble');
  });

  it('rattache le mouvement d’immeuble à l’écran qui le constate', () => {
    const o = OBLIGATIONS_EVENEMENTIELLES.find((x) => x.cle === 'mouvementImmeuble')!;
    expect(o.ecranDeclencheur).toContain('Immobilisations');
    // La copie au Ministre des Finances est la moitié oubliée de l'article 15.
    expect(o.destinataire).toContain('FINANCES');
  });

  it('cite une source et un délai pour chaque obligation', () => {
    for (const o of OBLIGATIONS_EVENEMENTIELLES) {
      expect(o.source.length).toBeGreaterThan(10);
      expect(o.delai.length).toBeGreaterThan(5);
    }
  });

  it('filtre selon la forme juridique, comme les jalons', () => {
    const cles = obligationsEvenementiellesApplicables({
      referentiel: Referentiel.SYCEBNL,
      formeJuridique: FormeJuridiqueEbnl.UNITE_GESTION_PROJET,
      droitEtranger: false,
    }).map((o) => o.cle);
    // Une unité de gestion de projet n'est pas une ASBL au sens de la loi
    // 004/2001 : ses articles 11 et 15 ne la visent pas.
    expect(cles).not.toContain('changementAdministrateur');
    expect(cles).toContain('numeroImpot');
  });
});

/**
 * CLOISONNEMENT DES DEUX RÉFÉRENTIELS · le test qui aurait attrapé le bug.
 *
 * Le planning avait un « tronc commun » qui n'en était pas un : sept jalons
 * partagés portaient dans leur `detail` et dans leur `source` le vocabulaire,
 * les comptes et les articles du SYCEBNL, et étaient servis tels quels à une
 * société commerciale. Rien ne cassait : un texte faux compile.
 *
 * Les assertions ci-dessous sont donc écrites sur le TEXTE, seul endroit où le
 * défaut était visible.
 */
describe('planning de clôture · cloisonnement des référentiels', () => {
  const syscohada = JALONS_CLOTURE.filter((j) => !j.referentiels || j.referentiels.includes(Referentiel.SYSCOHADA));
  const sycebnl = JALONS_CLOTURE.filter((j) => !j.referentiels || j.referentiels.includes(Referentiel.SYCEBNL));

  it('donne à chaque référentiel un numéro d’étape par jalon, jamais deux', () => {
    // Les paires SYCEBNL/SYSCOHADA partagent volontairement leur numéro
    // d'étape · elles ne peuvent jamais coexister, et ExercicePage s'en sert
    // comme clé de ligne React.
    for (const [nom, jalons] of [
      ['SYCEBNL', sycebnl],
      ['SYSCOHADA', syscohada],
    ] as const) {
      const etapes = jalons.map((j) => j.etape);
      expect(`${nom}: ${etapes.length}`).toBe(`${nom}: ${new Set(etapes).size}`);
    }
  });

  it('ne sert aucun compte, article ou mot du SYCEBNL à un dossier SYSCOHADA', () => {
    // Chaque motif ci-dessous a été lu dans un jalon réellement servi au
    // mauvais référentiel avant correction.
    const motifsSycebnl = [
      /fonds affectés/i,
      /fonds reportés/i,
      /emplois-ressources/i,
      /compte d’exploitation/i,
      /excédent ou déficit/i,
      /dons en nature/i,
      /projet de développement/i,
      /rapport d’activité/i,
      /impôt sur les sociétés ne paie pas/i,
    ];
    for (const j of syscohada) {
      for (const motif of motifsSycebnl) {
        // Le libellé sert de repère dans le message d'échec, et il ne peut
        // pas contenir le motif lui-même (sinon l'assertion se mordrait la
        // queue, ce qu'une première rédaction de ce test faisait).
        const fautif = motif.test(j.detail) ? `étape ${j.etape} « ${j.libelle} » : ${j.detail}` : 'aucun';
        expect(fautif).toBe('aucun');
      }
    }
  });

  it('ne fonde aucun jalon SYSCOHADA sur un texte propre aux entités à but non lucratif', () => {
    for (const j of syscohada) {
      // Étape 23 exceptée : le dépôt au RCCM cite la loi n° 004/2001 pour dire
      // qu'elle en EXCLUT les associations, ce qui est le contraire d'un
      // fondement emprunté.
      if (j.etape === 23) continue;
      // Même logique pour un jalon COMMUN aux deux référentiels dont la source
      // explique pourquoi il l'est : l'art. 3 du SYCEBNL énumère les articles
      // de l'AUDCIF qu'il écarte, et les art. 23 et 24 n'y sont pas. Nommer le
      // SYCEBNL pour dire qu'il n'exclut pas cet article est un raisonnement,
      // pas un emprunt · la formule exacte est exigée, un simple « SYCEBNL »
      // dans la source ne suffit pas à passer.
      const source = j.source.replace(/, non exclu par l’art\. 3 du SYCEBNL/g, '');
      expect(`${j.etape} ${source}`).not.toMatch(/SYCEBNL|004\/2001/);
    }
  });

  it('ne pose sur aucun jalon SYSCOHADA une observation que seul le SYCEBNL peut satisfaire', () => {
    // INVENTAIRE, RAPPORT_ACTIVITE et DONATEURS comptent des tables servies
    // par le module documents-obligatoires, @ReferentielsAutorises(SYCEBNL).
    // Un jalon SYSCOHADA qui les porterait passerait « en retard » sans
    // pouvoir jamais être satisfait.
    const reserveesSycebnl = ['INVENTAIRE', 'RAPPORT_ACTIVITE', 'DONATEURS'];
    for (const j of syscohada) {
      expect(`${j.etape} ${j.observation ?? 'aucune'}`).not.toMatch(new RegExp(reserveesSycebnl.join('|')));
    }
  });

  it('rend au SYSCOHADA les deux jalons dont l’AUDCIF et le cours le rendent débiteur', () => {
    const libelles = syscohada.map((j) => j.libelle);
    // AUDCIF art. 19 : le livre d'inventaire n'est pas propre au SYCEBNL.
    expect(libelles).toContain('Livre d’inventaire');
    // CPCC § 7.3 : « toute entité astreinte à tenir une comptabilité financière ».
    expect(libelles.some((l) => l.includes('CPCC'))).toBe(true);
  });

  it('vise le bon compte de fonds affectés au jalon d’écritures d’inventaire', () => {
    const inventaireSycebnl = sycebnl.find((j) => j.etape === 6)!;
    // SYCEBNL Partie 2 ch. 3 : les fonds affectés à un projet spécifique sont
    // au compte 165, le 17 étant « Fonds reportés ». La première rédaction
    // donnait 17 aux deux.
    expect(inventaireSycebnl.detail).toContain('compte 165');
    expect(inventaireSycebnl.detail).toContain('fonds reportés (compte 17)');

    const inventaireSyscohada = syscohada.find((j) => j.etape === 6)!;
    // SYSCOHADA : le compte 17 est « Dettes de location acquisition ».
    expect(inventaireSyscohada.detail).toContain('compte 14');
    expect(inventaireSyscohada.detail).toContain('799');
  });

  it('refuse à une entreprise le rapport d’activité de la loi n° 004/2001, même sous forme d’ONG', () => {
    // Tout dossier porte une forme EBNL (ASSOCIATION par défaut en base), y
    // compris tenu en SYSCOHADA : `formes` seul ne protégeait rien.
    const jalons = jalonsApplicables({
      referentiel: Referentiel.SYSCOHADA,
      formeJuridique: FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME,
      droitEtranger: false,
    });
    expect(jalons.some((j) => j.source.includes('004/2001, art. 44'))).toBe(false);
  });

  it('donne un jalon de remise au contrôleur à toute forme SYSCOHADA, pas seulement aux sociétés à assemblée', () => {
    // Le jalon 16 (envoi à quarante-cinq jours) est filtré par forme ; une SNC
    // se serait retrouvée sans aucun jalon de remise si le jalon 17 avait été
    // simplement retiré au SYSCOHADA.
    const snc = jalonsApplicables({
      referentiel: Referentiel.SYSCOHADA,
      formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
      droitEtranger: false,
    });
    expect(snc.some((j) => j.libelle.includes('commissaire aux comptes'))).toBe(true);
    expect(snc.some((j) => j.libelle === 'Mise à disposition de l’auditeur')).toBe(false);
  });

  it('ne sert aucune obligation événementielle de la loi n° 004/2001 à un dossier SYSCOHADA', () => {
    const cles = obligationsEvenementiellesApplicables({
      referentiel: Referentiel.SYSCOHADA,
      formeJuridique: FormeJuridiqueEbnl.ASSOCIATION,
      droitEtranger: false,
    }).map((o) => o.cle);
    expect(cles).not.toContain('changementAdministrateur');
    expect(cles).not.toContain('mouvementImmeuble');
    expect(cles).not.toContain('renouvellementFacilites');
    // Les obligations fiscales et sociales, elles, visent tout le monde.
    expect(cles).toContain('numeroImpot');
    expect(cles).toContain('engagementTravailleur');
  });

  it('ne porte toujours aucun montant, dans les jalons ajoutés comme dans les autres', () => {
    for (const j of JALONS_CLOTURE) {
      // Les numéros d'arrêtés et d'articles restent permis, et le quota de
      // main-d'œuvre nationale de l'art. 37 non plus n'est pas un montant :
      // ce que la règle vise, ce sont les taux d'astreinte et les sommes.
      expect(`${j.etape} ${j.detail}`).not.toMatch(/\d[\d\s.]*\s?(FC|francs congolais|FCFA)/i);
    }
  });
});

describe('SYCEBNL art. 19 al. 4 · le délai de quarante-cinq jours', () => {
  /*
    L'ASYMÉTRIE QUE CE TEST FIGE. Le jalon SYSCOHADA de l'envoi aux
    commissaires aux comptes portait « QUARANTE-CINQ JOURS AU MOINS » depuis
    toujours ; son pendant SYCEBNL vivait sur le calendrier du CPCC et était
    classé INTERNE. Or les deux textes disent la même chose : l'article 19,
    alinéa 4 du SYCEBNL pose le délai dans les mêmes termes que l'AUSCGIE
    art. 140. Une association lisait donc un jalon plus tiède que celui d'une
    SARL, sur une obligation que son propre Acte uniforme énonce.
  */
  const jalon = (referentiel: Referentiel, etape: number) =>
    JALONS_CLOTURE.find((j) => j.etape === etape && (j.referentiels ?? []).includes(referentiel))!;

  it('le jalon SYCEBNL de mise à disposition de l’auditeur porte le délai et le dit LÉGAL', () => {
    const j = jalon(Referentiel.SYCEBNL, 17);
    expect(j.detail).toContain('QUARANTE-CINQ JOURS AU MOINS');
    // Le délai se compte à rebours de l'assemblée · un jalon qui ne le dit
    // pas laisse croire qu'il part de la clôture.
    expect(j.detail).toContain('À REBOURS');
    // Un projet de développement ne tient pas d'assemblée · l'article prévoit
    // pour lui la date de transmission du rapport au bailleur.
    expect(j.detail).toContain('bailleurs de fonds');
    expect(j.nature).toBe('LEGALE');
    expect(j.source).toContain('art. 19 al. 4');
  });

  it('les DEUX référentiels portent le délai · c’est la même règle sous deux textes', () => {
    for (const [referentiel, etape] of [
      [Referentiel.SYCEBNL, 17],
      [Referentiel.SYSCOHADA, 16],
    ] as const) {
      expect({ referentiel, delai: jalon(referentiel, etape).detail.includes('QUARANTE-CINQ JOURS AU MOINS') }).toEqual({
        referentiel,
        delai: true,
      });
    }
  });
});
