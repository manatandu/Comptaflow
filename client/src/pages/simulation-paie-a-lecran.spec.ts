import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'PersonnelPage.tsx'), 'utf8');

/**
 * L'ÉCRAN DE SIMULATION · ce qui se gèle est ce que le code FAIT, jamais la
 * forme qu'il a.
 */
describe("La simulation ne recalcule rien côté client", () => {
  it("demande la simulation au serveur", () => {
    expect(SOURCE).toContain('/personnel/simulation');
  });

  it("n'écrit AUCUN seuil ni taux du barème dans la page", () => {
    // Le défaut visé : recopier les tranches de l'article 118 ou le plafond
    // de 30 % pour « éviter un aller-retour ». Deux calculs écrits séparément
    // divergent au premier correctif, et les deux restent plausibles.
    // Depuis P8 le corps est construit par `corpsSimulation`, que la simulation
    // ET l'émission du bulletin appellent · c'est là qu'on le lit.
    const corps = SOURCE.slice(SOURCE.indexOf('const corpsSimulation ='));
    expect(corps).not.toMatch(/1[_ .]?944[_ .]?000/);
    expect(corps).not.toMatch(/21[_ .]?600[_ .]?000/);
    expect(corps).not.toMatch(/43[_ .]?200[_ .]?000/);
  });

  it("n'additionne aucune assiette dans la page", () => {
    // Les deux totaux viennent du serveur. Une somme locale sur `lignes`
    // produirait un troisième chiffre, sans les exclusions ni les immunités.
    const debut = SOURCE.indexOf('const simuler =');
    const fin = SOURCE.indexOf('const corpsSalarie', debut);
    const corps = SOURCE.slice(debut, fin);
    expect(corps).not.toContain('.reduce(');
  });
});

describe("L'attestation de l'article 69, 8 n'est envoyée que si elle a été donnée", () => {
  it("laisse le champ ABSENT quand rien n'est renseigné", () => {
    // `false` transformerait un silence en refus, et imposerait une indemnité
    // que personne n'a examinée. Le serveur, lui, s'abstient sur l'absence.
    expect(SOURCE).toContain(
      "...(l.attestee === '' ? {} : { conditionArticle69Attestee: l.attestee === 'oui' }),",
    );
  });

  it("ne propose le champ que sur le transport et les frais médicaux", () => {
    // Les deux seules conditions de l'article 69 qu'aucun livre comptable ne
    // porte. L'offrir sur le logement laisserait croire que le cabinet peut
    // attester un plafond que le serveur calcule.
    expect(SOURCE).toContain(
      "l.nature === 'INDEMNITE_DE_TRANSPORT' || l.nature === 'SOINS_DE_SANTE'",
    );
  });
});

describe("Ce que la fenêtre annonce avant tout chiffre", () => {
  it("dit que ce n'est pas un bulletin de paie", () => {
    // LA PHRASE A CHANGÉ EN P5, PAS SA FONCTION · elle ne s'arrête plus au
    // point, elle enchaîne sur le livre de paie des articles 213 à 215.
    expect(SOURCE).toContain('Ceci n’est pas un bulletin de paie');
  });

  it("ne déclare plus que le moteur attend des textes absents du corpus", () => {
    // Lacune déclarée à tort · le barème de l'article 118, les immunités de
    // l'article 69 et la déductibilité de l'article 71 sont tous au corpus.
    // La phrase a vécu de P1 à P2a, et elle faisait renoncer à une démarche
    // possible.
    expect(SOURCE).not.toContain('attend des textes qui ne sont pas encore au corpus');
  });

  it('nomme les DEUX assiettes et la raison pour laquelle elles diffèrent', () => {
    expect(SOURCE).toContain('Assiette sociale');
    expect(SOURCE).toContain('Assiette fiscale nette (art. 70)');
    expect(SOURCE).toContain('sans aucune condition');
    expect(SOURCE).toContain('sous condition');
  });

  it("rend l'abstention visible au lieu d'afficher un zéro", () => {
    expect(SOURCE).toContain("'Indéterminée'");
    expect(SOURCE).toContain("'indéterminé'");
    expect(SOURCE).toContain('La simulation s’abstient plutôt que de supposer');
  });
});

describe('Le garde-fou des 360 px', () => {
  it('enferme chaque grille large dans un conteneur qui défile', () => {
    // Une grille de 320 px tient dans 360 · elle n'a rien à envelopper.
    // Ce qui est surveillé est la grille qui DÉPASSE, et elle seule.
    const larges = [...SOURCE.matchAll(/min-w-\[(\d+)px\]/g)]
      .map((m) => Number(m[1]))
      .filter((l) => l > 360);
    expect(larges.length).toBeGreaterThan(0);
    const conteneurs = [...SOURCE.matchAll(/overflow-x-auto/g)].length;
    expect(conteneurs).toBeGreaterThanOrEqual(larges.length);
  });
});

describe('P2b · les cotisations et le net à payer', () => {
  it("n'écrit aucun taux de cotisation dans la page", () => {
    // Les taux vivent dans `cotisations-paie.ts` avec leur date d'effet. Les
    // recopier ici les figerait au prochain arrêté, et l'écran servirait un
    // taux périmé sur un tableau parfaitement additionné.
    const debut = SOURCE.indexOf("{onglet === 'simulation'");
    const panneau = SOURCE.slice(debut);
    expect(panneau).not.toMatch(/6[.,]5\s*%/);
    expect(panneau).not.toMatch(/1[.,]5\s*%/);
    expect(panneau).not.toMatch(/0[.,]5\s*%/);
    // Le taux affiché vient toujours de la ligne rendue par le serveur.
    expect(panneau).toContain('{c.tauxPourCent} %');
  });

  it('affiche la charge de chaque ligne, employeur ou travailleur', () => {
    // Sans la colonne, un cabinet lit le total comme une retenue sur la paie.
    expect(SOURCE).toContain("c.charge === 'TRAVAILLEUR' ? 'Travailleur' : 'Employeur'");
    expect(SOURCE).toContain('Total retenu sur la paie');
  });

  it("dit que le net part du total VERSÉ, pas de l'assiette", () => {
    expect(SOURCE).toContain('Le net part du total VERSÉ');
  });

  it("laisse la nature INPP ABSENTE quand elle n'est pas renseignée", () => {
    // `''` enverrait une valeur que le DTO refuse, et surtout la présumer
    // ferait servir un taux public à un employeur privé, ou l'inverse.
    expect(SOURCE).toContain(
      "...(natureInpp === '' ? {} : { natureEmployeurInpp: natureInpp }),",
    );
  });
});

describe('P3 · la passation comptable à l\'écran', () => {
  it("n'écrit AUCUN numéro de compte dans la page", () => {
    // Quatrième fois que la règle se pose : aucun numéro de compte de paie
    // hors de `passation-paie.ts`, et aucun sans son référentiel. Le recopier
    // ici servirait le numéro d'un plan au dossier de l'autre.
    const debut = SOURCE.indexOf("{onglet === 'simulation'");
    const panneau = SOURCE.slice(debut);
    expect(panneau).not.toMatch(/\b4[2-4]\d{6}\b/);
    expect(panneau).not.toMatch(/\b66\d{6}\b/);
    expect(panneau).toContain('{l.compte}');
  });

  it("affiche le plan sur lequel l'écriture est proposée", () => {
    expect(SOURCE).toContain('Passation comptable · plan {simulation.passation.referentiel}');
  });

  it("montre le refus plutôt qu'une écriture partielle", () => {
    expect(SOURCE).toContain('Aucune écriture n’est proposée');
    expect(SOURCE).toContain('simulation.passation.refus.length > 0');
  });

  it("dit qu'il n'enregistre ni ne poste rien", () => {
    expect(SOURCE).toContain('sans rien conserver ni poster');
    expect(SOURCE).toContain('<strong>proposée</strong>');
  });
});

describe("P4 · le décompte final à l'écran", () => {
  it("n'écrit AUCUNE durée du Code du travail dans la page", () => {
    // Le défaut visé : recopier « 14 jours », « 7 par année », « 1 jour par
    // mois » pour éviter un aller-retour. Deux calculs écrits séparément
    // divergent au premier correctif, et les deux restent plausibles.
    const debut = SOURCE.indexOf("{onglet === 'decompte'");
    const panneau = SOURCE.slice(debut);
    expect(panneau).not.toMatch(/14\s*jours/);
    expect(panneau).not.toMatch(/\b1,5\s*jour/);
    expect(panneau).not.toMatch(/\b18\s*jours\b/);
    expect(panneau).toContain('{decompte.preavis.joursOuvrables} jours ouvrables');
  });

  it("dit que le Code ne définit PAS le décompte final", () => {
    expect(SOURCE).toContain('Le Code du travail ne définit pas le « décompte final ».');
    expect(SOURCE).toContain('deux jours ouvrables');
  });

  it("rend l'indétermination visible plutôt qu'un zéro", () => {
    expect(SOURCE).toContain("r.montantFc === null ? 'indéterminé'");
    expect(SOURCE).toContain("decompte.totalBrutFc === null");
  });

  it("explique pourquoi les mois de service sont SAISIS", () => {
    expect(SOURCE).toContain('article 141, alinéa 2');
    expect(SOURCE).toContain('plausible et faux');
  });
});

/**
 * P5 · LA QUOTITÉ ET LE LIVRE DE PAIE À L'ÉCRAN. Même règle qu'au-dessus :
 * on gèle ce que la page FAIT, et surtout ce qu'elle refuse de faire.
 */
describe("L'article 114 à l'écran", () => {
  it('ne recalcule aucune fraction dans la page', () => {
    // Le défaut visé : diviser par cinq ou par trois « pour afficher tout de
    // suite ». Le seuil et les deux fractions vivent au serveur.
    const debut = SOURCE.indexOf("Article 114 · quotité");
    const fin = SOURCE.indexOf('Réserves de lecture', debut);
    const panneau = SOURCE.slice(debut, fin);
    expect(panneau).not.toMatch(/\/\s*5\b/);
    expect(panneau).not.toMatch(/\/\s*3\b/);
    expect(panneau).toContain('simulation.quotite.quotiteOrdinaireFc');
    expect(panneau).toContain('simulation.quotite.partInsaisissableFc');
  });

  it("affiche les abstentions plutôt qu'un zéro", () => {
    const debut = SOURCE.indexOf("Article 114 · quotité");
    const panneau = SOURCE.slice(debut, debut + 2600);
    expect(panneau).toContain('simulation.quotite.abstentions.length > 0');
  });

  it("envoie la classe et les deux cases, et laisse vide ce qui est vide", () => {
    // Depuis P8 le corps est construit par `corpsSimulation`, que la simulation
    // ET l'émission du bulletin appellent · c'est là qu'on le lit.
    const corps = SOURCE.slice(SOURCE.indexOf('const corpsSimulation ='));
    expect(corps).toContain('classeProfessionnelle: nombre(classePro)');
    expect(corps).toContain('logementFourniEnNature: true');
    expect(corps).toContain('obligationAlimentaireLegale: true');
    expect(corps).toContain('enfantsBeneficiairesAllocations: nombre(enfantsAllocations)');
  });

  it("ne recopie AUCUN taux de la grille de tension dans la page", () => {
    expect(SOURCE).not.toMatch(/21[_ .]?500/);
    expect(SOURCE).not.toMatch(/14[_ .]?500/);
    expect(SOURCE).not.toMatch(/796[.,]3/);
  });
});

describe("Le livre de paie à l'écran", () => {
  it('demande le verdict au serveur et ne recopie pas les trente mentions', () => {
    expect(SOURCE).toContain('/personnel/livre-de-paie');
    expect(SOURCE).toContain('livre.mentions.map');
    // Le défaut visé : une deuxième liste, qui aurait divergé au premier
    // correctif de l'arrêté n° 146/2018.
    expect(SOURCE).not.toMatch(/numéro d’immatriculation attribué par la Caisse/);
    expect(SOURCE).not.toMatch(/montant pris en considération pour le calcul des cotisations/);
  });

  it("n'affirme JAMAIS une conformité au modèle, et le motif a changé", () => {
    // CE TEST GELAIT « identifié mais non lu ». L'arrêté est arrivé le 19/09 ·
    // la retenue demeure, sa raison est autre : le modèle annexé est une MISE
    // EN FORME, qu'une liste de mentions ne prouve pas.
    const debut = SOURCE.indexOf("{onglet === 'livre' &&");
    const panneau = SOURCE.slice(debut);
    expect(panneau).not.toMatch(/identifié mais non lu/i);
    expect(panneau).toContain('12/CAB.MIN/ETPS/042');
    expect(panneau).toMatch(/au modèle annexé/i);
    expect(panneau).toMatch(/rien ici ne certifie cette conformité/i);
    expect(panneau).toContain('livre.conformiteAuModeleCertifiee');
    expect(panneau).not.toMatch(/livre de paie conforme/i);
  });

  it("dit que le fichier informatisé ne demande AUCUNE autorisation", () => {
    const debut = SOURCE.indexOf("{onglet === 'livre' &&");
    const panneau = SOURCE.slice(debut);
    expect(panneau).toMatch(/ou fichier informatisé/i);
    expect(panneau).toMatch(/aucune autorisation/i);
    expect(panneau).toMatch(/tout autre document/i);
  });

  it("laisse la FORME du document absente quand elle n'est pas déclarée", () => {
    const corps = SOURCE.slice(SOURCE.indexOf('const verifierLivre ='));
    expect(corps).toContain("livreSaisie.forme === ''");
    expect(corps).toContain('formeDuDocument: livreSaisie.forme');
  });

  it('rend les formules du modèle telles que le serveur les donne', () => {
    const debut = SOURCE.indexOf("{onglet === 'livre' &&");
    const panneau = SOURCE.slice(debut);
    expect(panneau).toContain('livre.formules.brut.composantes');
    expect(panneau).toContain('livre.destinationDesDoubles');
    // Et surtout, la page ne recopie pas la liste des composantes.
    expect(panneau).not.toMatch(/\[7,\s*10,\s*11/);
  });

  it("laisse l'autorisation ABSENTE tant qu'elle n'est pas renseignée", () => {
    const corps = SOURCE.slice(SOURCE.indexOf('const verifierLivre ='));
    expect(corps).toContain("livreSaisie.autorisation === ''");
    expect(corps).toMatch(/\?\s*\{\}/);
  });

  it("porte la sanction de l'article 103 telle que le serveur la rend", () => {
    const debut = SOURCE.indexOf("{onglet === 'livre' &&");
    const panneau = SOURCE.slice(debut);
    expect(panneau).toContain('livre.sanctionArticle103');
    expect(panneau).toContain('livre.reserveArticle104');
  });
});

describe("L'avertissement de la simulation ne ment plus", () => {
  it('ne dit plus « ne liquide aucune cotisation patronale »', () => {
    expect(SOURCE).not.toMatch(/ne liquide aucune cotisation patronale/i);
    expect(SOURCE).not.toMatch(/ne propose aucune écriture/i);
  });

  it('dit ce que la fenêtre fait vraiment', () => {
    expect(SOURCE).toMatch(/ne tient pas lieu de/i);
    expect(SOURCE).toMatch(/livre de paie/i);
    expect(SOURCE).toMatch(/aucun décompte écrit/i);
  });

  it("dit que les 8 100 FC ne sont pas le taux légal", () => {
    expect(SOURCE).toContain('8 100 FC');
    expect(SOURCE).toMatch(/servie directement par la Caisse/i);
    expect(SOURCE).toMatch(/colonne\s*\n?\s*19/i);
  });
});

describe("L'article 112 à l'écran · la liste fermée", () => {
  it('rend les sept litterae du serveur, sans les recopier', () => {
    expect(SOURCE).toContain('simulation.retenuesAutorisees.liste.map');
    // Le défaut visé : une huitième ligne « cotisation syndicale » ajoutée
    // à la main dans la page, là où le serveur n'en rend que sept.
    // On borne au TABLEAU seul · les réserves qui suivent parlent, elles,
    // de la cotisation syndicale, et c'est leur rôle.
    const debut = SOURCE.indexOf('Article 112 · les sept seules retenues');
    const panneau = SOURCE.slice(debut, SOURCE.indexOf('</table>', debut));
    expect(panneau).not.toMatch(/syndic/i);
    expect(panneau).not.toContain('saisie-arrêt');
    expect(panneau).not.toContain('taxe professionnelle');
  });

  it('porte la sanction et les trois réserves telles que le serveur les rend', () => {
    expect(SOURCE).toContain('simulation.retenuesAutorisees.sanction');
    expect(SOURCE).toContain('simulation.retenuesAutorisees.cotisationSyndicale');
    expect(SOURCE).toContain('simulation.retenuesAutorisees.cessionSyndicale');
    expect(SOURCE).toContain('simulation.retenuesAutorisees.litteraeDatees');
  });
});

describe('Salaire stipulé en USD · le serveur convertit, l’écran ne calcule aucun cours', () => {
  const corps = SOURCE.slice(SOURCE.indexOf('const corpsSimulation ='), SOURCE.indexOf('const simuler ='));

  it('envoie les montants en dollars et la stipulation, sans cours', () => {
    expect(corps).toContain("{ montantUsd: nombre(l.montantFc) as number }");
    expect(corps).toContain("...(deviseStipulation === 'USD' ? { deviseStipulation } : {})");
  });

  it('affiche le cours du jour appliqué et le rappel de l’article 89', () => {
    expect(SOURCE).toContain('simulation.conversion.avertissement');
    expect(SOURCE).toContain('1 USD = {simulation.conversion.cours.toLocaleString');
  });
});
