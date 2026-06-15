# Exemple de sortie DPGF — fiabilité & traçabilité

Principe appliqué : **FIABILITÉ > COMPLÉTUDE**. Aucune quantité n'est inventée ;
toute quantité non sourcée est marquée **À métrer**. Chaque ligne porte un statut,
une source et un niveau de confiance.

| N° | Lot | Désignation | U. | Qté | P.U. | Statut | Source (extrait) | Confiance |
|----|-----|-------------|----|-----|------|--------|------------------|-----------|
| 1 | Gros Œuvre | Béton de propreté sous semelles | m³ | 18 | À renseigner | **Confirmé** | plan STR-02 « ... ép. 0,05 m sous semelles » | high |
| 2 | Gros Œuvre | Voiles béton armé porteurs RDC/R+1/R+2 | m² | **0 → À métrer** | À renseigner | **À métrer** | cctp §5.4 (aucune quantité indiquée) | — |
| 3 | Gros Œuvre | Dalle pleine plancher RDC | m² | **0 → À métrer** | À renseigner | **À métrer** | cctp §5.7 (surface non chiffrée) | — |
| 4 | Gros Œuvre | Aciers HA (ratio) | kg | **0 → À métrer** | À renseigner | **À métrer** | Non trouvé dans les pièces fournies | — |
| 5 | Gros Œuvre | Béton C25/30 fondations | m³ | 55 | À renseigner | **À arbitrer** | CCTP §5.1 = 55 m³ / plan STR-02 = 60 m³ — contradiction | low |
| 6 | Gros Œuvre | Installation de chantier | forfait | 1 | À renseigner | **Confirmé** | cctp §2.1 « installation complète » | high |

Statuts possibles :
- **Confirmé** (`confirmed`) — quantité présente dans une source (CDPGF/DPGF, CCTP, plan, métré).
- **À métrer** (`to_measure`) — quantité absente des pièces : à mesurer/chiffrer, jamais inventée.
- **Déduit** (`inferred`) — déduction non contractuelle, signalée comme telle.
- **À arbitrer** (`conflict`) — contradiction entre deux sources, les deux sont citées.

Règles de remplissage :
- **Prix unitaire** non fourni → « À renseigner » (jamais 0, sauf si la source indique 0).
- **Devise / unités** = celles de la source officielle.
- Le garde-fou code (`src/lib/dpgf-fidelity.ts`) force « À métrer » pour toute
  quantité > 0 non sourcée, même si le modèle a proposé une valeur.
