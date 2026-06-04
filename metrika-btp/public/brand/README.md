# Visuels de marque

Le fond bleu marine de la connexion et du menu latéral utilise par défaut un
dégradé CSS « marque » (`.bg-metrika-deep`) qui reproduit le visuel Metrika.

## Utiliser votre image exacte (optionnel)

Pour afficher **exactement** votre image de fond :

1. Déposez le fichier ici sous le nom **`auth-bg.jpg`** (ou `.png` en adaptant le chemin).
2. Dans `src/app/(auth)/login/page.tsx` et `src/components/layout/sidebar.tsx`,
   remplacez la classe `bg-metrika-deep` par `bg-metrika-deep--image`.

La règle `.bg-metrika-deep--image` (dans `src/app/globals.css`) pointe vers
`/brand/auth-bg.jpg` et recouvre toute la surface (`cover`, centré).
