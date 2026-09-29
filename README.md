# Projetview

Suivi de projets entrepreneuriaux, sans installation ni build.

- **Tableau de bord** : avancement de chaque projet, tâches en retard / urgentes, et liste « Où avancer en priorité ».
- **Page projet** : avancement par domaine (plan d'action, acquisition, marketing, équipe, finance), tâches avec deadline et priorité (Urgent / Non urgent / À voir), indicateur clé par domaine.
- **Finance** : prévisions vs réel par mois, totaux, écart et graphique.

## Lancer

```
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000 (ou ouvrir `index.html` directement).

Les données sont enregistrées dans le navigateur (localStorage). Utilisez **Exporter** / **Importer** pour les sauvegarder ou les déplacer.
