# Invites de revue

Ces invites servent à me faire relever ce qui manque, ce qui est faux, ou ce
qui attend une décision. Elles sont ici parce qu'une invite perdue dans un fil
de conversation est une invite perdue.

Les donner telles quelles. Chacune vaut pour une passe · les enchaîner dans la
même session dilue la lecture des sources.

---

## 1. Le relevé de manques, référentiel par référentiel

> Relis le référentiel officiel dans les skills, chapitre par chapitre, et
> compare à ce que le logiciel fait réellement. Pour chaque écart : ce que le
> texte exige, ce que le logiciel fait, le fichier concerné, et si c'est une
> lacune du logiciel ou une lacune du texte officiel. Ne me propose rien tant
> que tu n'as pas lu la source. Classe par gravité : ce qui produit un état
> faux, ce qui produit un état incomplet, ce qui n'est qu'un confort.

Préciser le périmètre pour éviter une passe trop large : « sur le jeu
associations », « sur le SMT SYSCOHADA », « sur les notes annexes ».

## 2. Le relevé de ce qui casserait en silence

> Cherche dans le logiciel tout ce qui peut être faux sans lever d'erreur ni
> casser un test : un compte mal rattaché, un état qui ne boucle plus, un
> cloisonnement qui saute, une donnée qui se dégrade à chaque clôture. Pour
> chaque trouvaille, écris le test qui l'aurait attrapée. Ne me dis pas que
> c'est bon sans l'avoir mesuré.

C'est celle qui a trouvé les vingt-cinq renvois de notes faux, l'export de
sauvegarde en clair et l'absence de tests avant déploiement.

## 3. La parité entre les deux référentiels

> Prends une garantie qui existe côté SYSCOHADA et vérifie qu'elle existe côté
> SYCEBNL, et l'inverse. Liste ce qui n'est protégé que d'un seul côté.

## 4. Le regard du réviseur

> Mets-toi à la place d'un auditeur qui ouvre ce dossier pour la première
> fois. Qu'est-ce qu'il demande le premier jour et que le logiciel ne sait pas
> produire ?

## 5. Ce que je te dois, moi

> Liste tout ce qui attend une action de ma part et pas de la tienne : une
> variable à poser, une clé à générer, une décision de politique comptable, un
> accès à ouvrir. Dis-moi ce qui bloque quoi.

---

## Comment lire une réponse à ces invites

Trois questions à me poser si la réponse paraît trop lisse :

- **« Tu l'as lu où ? »** · toute règle comptable citée doit venir d'un
  fichier de skill lu à l'instant, pas de ma mémoire (CLAUDE.md §1).
- **« Tu l'as mesuré ou tu le supposes ? »** · un chiffre annoncé sans
  balayage est une impression.
- **« Et le test ? »** · une correction sans le test qui l'aurait attrapée
  reviendra (CLAUDE.md §10).
