# Clain Prototype — estructura de módulos

El antiguo `Prototype.tsx` monolítico (71k líneas) está dividido en módulos por capas.
La regla de dependencias es **estrictamente descendente** (una capa solo importa de capas
inferiores); los dominios **nunca** se importan entre sí — todo lo que comparten vive en
`sharedUi.tsx` / `types.ts` / `icons.tsx` / `assets.ts`.

```
L4  Prototype.tsx            shell: PrototypeApp + routing (?view=) + LeftNav
L3  views/InboxViews.tsx     bandeja de entrada + panel de conversación
    views/ContactsViews.tsx  contactos / personas / empresas
    views/ChannelsViews.tsx  ajustes de canales (Messenger, Email, WhatsApp, …)
    views/SettingsViews.tsx  ajustes y administración del workspace
    views/FinViews.tsx       Fin AI Agent
    views/KnowledgeViews.tsx Knowledge Hub
    views/ReportsViews.tsx   informes
    views/OutboundViews.tsx  outbound
    views/AgentViews.tsx     chat de agente
    webanalytics/WebAnalytics.tsx  app Web Analytics (APARCADA: sin puntos de entrada)
L2  sharedUi.tsx             componentes/helpers/datos usados por 2+ dominios
L1  icons.tsx                constantes ICON_* (SVG inline autocontenidas)
L0  assets.ts                FIGMA_CDN + constantes IMG_* (URLs de assets)
    types.ts                 tipos compartidos (View, …)
```

Reglas al añadir código:

1. **Una vista nueva** va al módulo de su dominio en `views/`. Si no existe el dominio,
   crea `views/<Dominio>Views.tsx` y regístralo en el switch de `Prototype.tsx`.
2. **Nada de imports entre dominios.** Si dos dominios necesitan lo mismo, muévelo a
   `sharedUi.tsx` (componentes/datos/helpers) o `types.ts` (tipos) y expórtalo.
3. `assets.ts` solo contiene constantes de cadena; `icons.tsx` solo JSX autocontenido.
4. El union `View` (en `types.ts`) es la fuente de verdad del enrutado. El whitelist de
   `readInitialViewFromUrl` en `Prototype.tsx` decide qué vistas son alcanzables por URL
   (`clainHub`/`webAnalytics` están fuera a propósito — módulo aparcado).
5. Directorios hermanos preexistentes (`charts/`, `shared/`, `web-analytics/`,
   `error-tracking/`, …) pertenecen a la infraestructura de charts/analytics importada
   de PostHog y no forman parte de este grafo por capas.

La división original se hizo con un script AST (TypeScript compiler API) que preservó el
orden de declaraciones y el comportamiento: el multiset de errores de `tsc` quedó idéntico
al del monolito y todas las vistas se verificaron en runtime.
