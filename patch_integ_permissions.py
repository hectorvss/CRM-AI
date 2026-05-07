"""
patch_integ_permissions.py
· Add specific permissions[] to each integration in STORE_INTEGRATIONS
· Update ConnectModal to render integ.permissions instead of hardcoded list
"""

PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Replace STORE_INTEGRATIONS with enriched version ──────────────────────
OLD_SI = "const STORE_INTEGRATIONS = ["
OLD_SI_END = "];\n\nconst STORE_CATS"

start = src.index(OLD_SI)
end   = src.index(OLD_SI_END) + len(OLD_SI_END)

NEW_SI = """const STORE_INTEGRATIONS = [
  // CRM
  {
    id: 'salesforce', name: 'Salesforce', category: 'CRM',
    desc: 'Sincroniza contactos, oportunidades y casos con Salesforce.',
    domain: 'salesforce.com', connected: false, auth: 'oauth', color: '#00A1E0',
    permissions: [
      'Leer y escribir contactos, cuentas y oportunidades',
      'Crear y actualizar casos de soporte (Salesforce Cases)',
      'Registrar actividades y tareas desde conversaciones',
      'Acceder a campos personalizados del objeto Contact',
    ],
  },
  {
    id: 'hubspot', name: 'HubSpot', category: 'CRM',
    desc: 'Sincroniza contactos y deals de HubSpot con el inbox.',
    domain: 'hubspot.com', connected: true, auth: 'apikey', color: '#FF7A59',
    permissions: [
      'Leer y escribir contactos, empresas y deals',
      'Sincronizar pipelines de ventas y etapas de negocio',
      'Crear notas y tareas vinculadas a contactos',
      'Acceder al historial de actividad del contacto',
    ],
  },
  {
    id: 'zendesk', name: 'Zendesk', category: 'CRM',
    desc: 'Importa tickets de Zendesk y gestiona todo desde Clain.',
    domain: 'zendesk.com', connected: false, auth: 'apikey', color: '#03363D',
    permissions: [
      'Leer y crear tickets de soporte',
      'Actualizar estado, prioridad y asignatario de tickets',
      'Acceder a datos del usuario y organización',
      'Sincronizar comentarios entre Zendesk y Clain',
    ],
  },
  {
    id: 'freshdesk', name: 'Freshdesk', category: 'CRM',
    desc: 'Centraliza tickets de Freshdesk en la bandeja de Clain.',
    domain: 'freshdesk.com', connected: false, auth: 'apikey', color: '#2DC26B',
    permissions: [
      'Leer y crear tickets de Freshdesk',
      'Actualizar estado, prioridad y agente asignado',
      'Acceder a datos de contacto y empresa del cliente',
      'Ver el historial de conversaciones previas',
    ],
  },
  // Canales
  {
    id: 'whatsapp', name: 'WhatsApp Business', category: 'Canales',
    desc: 'Recibe y responde mensajes de WhatsApp desde el inbox.',
    domain: 'whatsapp.com', connected: true, auth: 'oauth', color: '#25D366',
    permissions: [
      'Enviar y recibir mensajes desde tu número de negocio',
      'Gestionar plantillas de mensajes aprobadas por Meta',
      'Acceder al perfil de contacto del cliente en WhatsApp',
      'Ver estado de entrega y lectura de mensajes',
    ],
  },
  {
    id: 'instagram', name: 'Instagram', category: 'Canales',
    desc: 'Gestiona DMs de Instagram desde tu bandeja de entrada.',
    domain: 'instagram.com', connected: true, auth: 'oauth', color: '#E1306C',
    permissions: [
      'Leer y responder mensajes directos de la cuenta de negocio',
      'Acceder al perfil público del remitente',
      'Ver menciones y comentarios en publicaciones (solo lectura)',
      'Recibir notificaciones de nuevos mensajes en tiempo real',
    ],
  },
  {
    id: 'slack', name: 'Slack', category: 'Canales',
    desc: 'Notificaciones de conversaciones y escalados en Slack.',
    domain: 'slack.com', connected: true, auth: 'oauth', color: '#4A154B',
    permissions: [
      'Enviar notificaciones a canales y usuarios seleccionados',
      'Crear canales de escalado automático por equipo',
      'Leer mensajes en canales de Slack conectados',
      'Acceder al directorio de miembros del workspace',
    ],
  },
  {
    id: 'twilio', name: 'SMS · Twilio', category: 'Canales',
    desc: 'Envía y recibe SMS a través de Twilio en el workspace.',
    domain: 'twilio.com', connected: false, auth: 'apikey', color: '#F22F46',
    permissions: [
      'Enviar y recibir SMS desde números Twilio asignados',
      'Acceder al historial de mensajes de la cuenta',
      'Gestionar números de teléfono y rutas de entrada',
      'Ver estado de entrega de cada mensaje enviado',
    ],
  },
  // Pagos
  {
    id: 'stripe', name: 'Stripe', category: 'Pagos',
    desc: 'Consulta suscripciones, pagos y facturas desde cada caso.',
    domain: 'stripe.com', connected: true, auth: 'apikey', color: '#635BFF',
    permissions: [
      'Leer datos de clientes, suscripciones y planes (solo lectura)',
      'Consultar historial de pagos, facturas y reembolsos',
      'Ver estado de disputas y chargebacks activos',
      'Acceder a metadatos de productos y precios configurados',
    ],
  },
  {
    id: 'shopify', name: 'Shopify', category: 'Comercio',
    desc: 'Accede a pedidos y clientes de Shopify en conversaciones.',
    domain: 'shopify.com', connected: false, auth: 'oauth', color: '#96BF48',
    permissions: [
      'Leer pedidos, estado de envío y devoluciones',
      'Acceder al catálogo de productos y variantes',
      'Consultar datos del cliente y su historial de compras',
      'Ver inventario y estado de stock por producto',
    ],
  },
  // Productividad
  {
    id: 'jira', name: 'Jira', category: 'Productividad',
    desc: 'Crea issues de Jira desde conversaciones y sincroniza estado.',
    domain: 'atlassian.com', connected: false, auth: 'oauth', color: '#0052CC',
    permissions: [
      'Crear y actualizar issues en proyectos seleccionados',
      'Leer estado, prioridad y asignatario de issues',
      'Adjuntar conversaciones de Clain a issues existentes',
      'Sincronizar cambios de estado entre Jira y Clain',
    ],
  },
  {
    id: 'linear', name: 'Linear', category: 'Productividad',
    desc: 'Crea y enlaza issues de Linear desde el inbox de soporte.',
    domain: 'linear.app', connected: true, auth: 'oauth', color: '#5E6AD2',
    permissions: [
      'Crear y actualizar issues en equipos seleccionados',
      'Leer proyectos, ciclos y estados del workspace',
      'Vincular conversaciones de soporte a issues de Linear',
      'Sincronizar resolución de issues con cierre de conversación',
    ],
  },
  {
    id: 'notion', name: 'Notion', category: 'Productividad',
    desc: 'Guarda notas de conversaciones y crea páginas de Notion.',
    domain: 'notion.so', connected: false, auth: 'oauth', color: '#000000',
    permissions: [
      'Crear páginas en bases de datos seleccionadas',
      'Leer y escribir bloques en páginas compartidas contigo',
      'Guardar transcripciones y resúmenes de conversaciones',
      'Acceder a bases de datos del workspace compartidas',
    ],
  },
  {
    id: 'github', name: 'GitHub', category: 'Productividad',
    desc: 'Vincula issues de GitHub a conversaciones para bugs.',
    domain: 'github.com', connected: false, auth: 'oauth', color: '#24292E',
    permissions: [
      'Crear issues en repositorios seleccionados',
      'Leer título, estado, etiquetas y comentarios de issues',
      'Vincular conversaciones de soporte a issues existentes',
      'Ver pull requests relacionados con issues abiertos',
    ],
  },
  // Analítica
  {
    id: 'ga', name: 'Google Analytics', category: 'Analítica',
    desc: 'Mide el impacto del widget de chat en las conversiones.',
    domain: 'google.com', connected: false, auth: 'oauth', color: '#E37400',
    permissions: [
      'Leer métricas de sesiones y eventos del sitio web',
      'Acceder a datos de conversión vinculados al widget de chat',
      'Ver informes de tráfico y fuentes de adquisición',
      'Leer objetivos y embudos de conversión configurados',
    ],
  },
  {
    id: 'delighted', name: 'Delighted', category: 'Analítica',
    desc: 'Dispara encuestas CSAT y NPS basadas en conversaciones.',
    domain: 'delighted.com', connected: false, auth: 'apikey', color: '#FF6E6E',
    permissions: [
      'Enviar encuestas CSAT y NPS al cerrar conversaciones',
      'Leer respuestas y puntuaciones de encuestas enviadas',
      'Acceder a datos de personas encuestadas',
      'Crear y gestionar campañas de encuesta por segmento',
    ],
  },
  // IA
  {
    id: 'openai', name: 'OpenAI', category: 'IA',
    desc: 'Conecta GPT-4o para respuestas generativas en el workspace.',
    domain: 'openai.com', connected: true, auth: 'apikey', color: '#10A37F',
    permissions: [
      'Llamar a modelos GPT-4o y GPT-4o mini vía API',
      'Enviar el contexto de la conversación como prompt',
      'Usar function calling para automatizaciones del agente',
      'Procesar imágenes adjuntas en conversaciones (visión)',
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', category: 'IA',
    desc: 'Usa Claude como modelo base para el agente AI de Clain.',
    domain: 'anthropic.com', connected: true, auth: 'apikey', color: '#D97706',
    permissions: [
      'Llamar a Claude 3.5 Sonnet y Claude 3 Haiku vía API',
      'Enviar historial de conversación como contexto del modelo',
      'Ejecutar herramientas personalizadas del agente AI',
      'Procesar documentos y archivos adjuntos en conversaciones',
    ],
  },
  {
    id: 'zapier', name: 'Zapier', category: 'IA',
    desc: 'Conecta Clain con miles de apps a través de Zaps automáticos.',
    domain: 'zapier.com', connected: false, auth: 'oauth', color: '#FF4A00',
    permissions: [
      'Activar Zaps desde eventos de conversaciones (trigger)',
      'Enviar datos de contacto, caso y etiquetas a Zapier',
      'Recibir acciones de Zapier en el inbox de Clain',
      'Acceder a la lista de Zaps activos en tu cuenta',
    ],
  },
];

const STORE_CATS"""

src = src[:start] + NEW_SI + src[end:]

# ── 2. Update ConnectModal to use integ.permissions ───────────────────────────
OLD_PERMS = """              {/* Permissions */}
              <div className="bg-[#f8f8f7] rounded-[12px] p-4">
                <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Permisos solicitados</p>
                <div className="flex flex-col gap-2">
                  {[
                    isOAuth ? 'Leer y escribir datos de contactos' : 'Acceso de lectura a tus datos',
                    'Ver conversaciones y tickets asociados',
                    'Sincronización automática en tiempo real',
                  ].map(p => (
                    <div key={p} className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded-full bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5"><path d="M2 5l2 2 4-4" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                      </div>
                      <span className="text-[13px] text-[#1a1a1a]">{p}</span>
                    </div>
                  ))}
                </div>
              </div>"""

NEW_PERMS = """              {/* Permissions */}
              <div className="bg-[#f8f8f7] rounded-[12px] p-4">
                <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Acceso solicitado</p>
                <div className="flex flex-col gap-2">
                  {integ.permissions.map(p => (
                    <div key={p} className="flex items-start gap-2.5">
                      <div className="w-4 h-4 rounded-full bg-[#dcfce7] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5"><path d="M2 5l2 2 4-4" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                      </div>
                      <span className="text-[13px] text-[#1a1a1a] leading-[1.45]">{p}</span>
                    </div>
                  ))}
                </div>
              </div>"""

src = src.replace(OLD_PERMS, NEW_PERMS, 1)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: specific permissions per integration")
print(f"File size: {len(src)} chars")
