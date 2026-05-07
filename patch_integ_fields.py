"""
patch_integ_fields.py
· Add exact backend-required fields[] to each integration (from tenant interfaces)
· Rebuild ConnectModal to render those fields dynamically:
    - oauth (no fields)  → pure OAuth button
    - oauth (with fields) → pre-OAuth inputs then OAuth button
    - apikey             → fill all fields then save
· Show backend status badge (live / coming soon)
"""

PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Replace STORE_INTEGRATIONS with fields + backendLive flag ──────────────
OLD_SI_START = "const STORE_INTEGRATIONS = ["
OLD_SI_END   = "];\n\nconst STORE_CATS"

si_start = src.index(OLD_SI_START)
si_end   = src.index(OLD_SI_END) + len(OLD_SI_END)

NEW_SI = r"""const STORE_INTEGRATIONS = [
  // ── CRM ────────────────────────────────────────────────────────────────────
  {
    id: 'salesforce', name: 'Salesforce', category: 'CRM',
    desc: 'Sincroniza contactos, oportunidades y casos con Salesforce.',
    domain: 'salesforce.com', connected: false, auth: 'oauth', color: '#00A1E0', backendLive: true,
    permissions: ['Leer y escribir contactos, cuentas y oportunidades','Crear y actualizar casos de soporte (Salesforce Cases)','Registrar actividades y tareas desde conversaciones','Acceder a campos personalizados del objeto Contact'],
    fields: [],  // pure OAuth — se gestiona vía SALESFORCE_CLIENT_ID / SECRET en .env
  },
  {
    id: 'hubspot', name: 'HubSpot', category: 'CRM',
    desc: 'Sincroniza contactos y deals de HubSpot con el inbox.',
    domain: 'hubspot.com', connected: true, auth: 'apikey', color: '#FF7A59', backendLive: true,
    permissions: ['Leer y escribir contactos, empresas y deals','Sincronizar pipelines de ventas y etapas de negocio','Crear notas y tareas vinculadas a contactos','Acceder al historial de actividad del contacto'],
    fields: [
      { key: 'access_token', label: 'Private App Token', placeholder: 'pat-na1-••••••••-••••-••••-••••-••••••••••••', type: 'password', hint: 'En HubSpot → Settings → Integrations → Private Apps → Create a private app', required: true },
    ],
  },
  {
    id: 'zendesk', name: 'Zendesk', category: 'CRM',
    desc: 'Importa tickets de Zendesk y gestiona todo desde Clain.',
    domain: 'zendesk.com', connected: false, auth: 'oauth', color: '#03363D', backendLive: true,
    permissions: ['Leer y crear tickets de soporte','Actualizar estado, prioridad y asignatario de tickets','Acceder a datos del usuario y organización','Sincronizar comentarios entre Zendesk y Clain'],
    fields: [
      { key: 'subdomain', label: 'Subdominio de Zendesk', placeholder: 'mi-empresa  (de mi-empresa.zendesk.com)', type: 'text', hint: 'Solo el prefijo, sin .zendesk.com', required: true },
    ],
  },
  {
    id: 'freshdesk', name: 'Freshdesk', category: 'CRM',
    desc: 'Centraliza tickets de Freshdesk en la bandeja de Clain.',
    domain: 'freshdesk.com', connected: false, auth: 'apikey', color: '#2DC26B', backendLive: false,
    permissions: ['Leer y crear tickets de Freshdesk','Actualizar estado, prioridad y agente asignado','Acceder a datos de contacto y empresa del cliente','Ver el historial de conversaciones previas'],
    fields: [
      { key: 'subdomain', label: 'Subdominio de Freshdesk', placeholder: 'mi-empresa  (de mi-empresa.freshdesk.com)', type: 'text', hint: 'Solo el prefijo, sin .freshdesk.com', required: true },
      { key: 'api_key',   label: 'API Key',                 placeholder: 'Pega tu API key de Freshdesk…',            type: 'password', hint: 'Profile Settings → Your API Key (esquina inferior izquierda)', required: true },
    ],
  },
  // ── Canales ─────────────────────────────────────────────────────────────────
  {
    id: 'whatsapp', name: 'WhatsApp Business', category: 'Canales',
    desc: 'Recibe y responde mensajes de WhatsApp desde el inbox.',
    domain: 'whatsapp.com', connected: true, auth: 'apikey', color: '#25D366', backendLive: true,
    permissions: ['Enviar y recibir mensajes desde tu número de negocio','Gestionar plantillas de mensajes aprobadas por Meta','Acceder al perfil de contacto del cliente en WhatsApp','Ver estado de entrega y lectura de mensajes'],
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID',         placeholder: '102938475610293',          type: 'text',     hint: 'Meta for Developers → Tu App → WhatsApp → Configuración del teléfono', required: true },
      { key: 'waba_id',         label: 'WhatsApp Business Account ID (WABA)', placeholder: '109283746150293', type: 'text',hint: 'Meta Business Manager → Cuentas de WhatsApp → ID de cuenta', required: true },
      { key: 'access_token',    label: 'System User Access Token', placeholder: 'EAAxxxxx…',               type: 'password', hint: 'Meta Business Manager → Usuarios del sistema → Token permanente (60 días o permanente)', required: true },
      { key: 'app_secret',      label: 'App Secret',              placeholder: 'Desde configuración de la App Meta', type: 'password', hint: 'Meta for Developers → Tu App → Configuración → App Secret', required: true },
      { key: 'verify_token',    label: 'Verify Token (webhook)',  placeholder: 'Elige una cadena secreta personalizada', type: 'text', hint: 'Cadena que configuras tú — se enviará en cada ping de verificación de webhook', required: true },
    ],
  },
  {
    id: 'instagram', name: 'Instagram', category: 'Canales',
    desc: 'Gestiona DMs de Instagram desde tu bandeja de entrada.',
    domain: 'instagram.com', connected: true, auth: 'oauth', color: '#E1306C', backendLive: true,
    permissions: ['Leer y responder mensajes directos de la cuenta de negocio','Acceder al perfil público del remitente','Ver menciones y comentarios en publicaciones (solo lectura)','Recibir notificaciones de nuevos mensajes en tiempo real'],
    fields: [
      { key: 'page_id', label: 'Facebook Page ID', placeholder: '123456789012345', type: 'text', hint: 'La cuenta de Instagram de negocio debe estar vinculada a una Facebook Page. Encuéntralo en Configuración de la Page → Información de la página', required: true },
    ],
  },
  {
    id: 'slack', name: 'Slack', category: 'Canales',
    desc: 'Notificaciones de conversaciones y escalados en Slack.',
    domain: 'slack.com', connected: true, auth: 'oauth', color: '#4A154B', backendLive: true,
    permissions: ['Enviar notificaciones a canales y usuarios seleccionados','Crear canales de escalado automático por equipo','Leer mensajes en canales de Slack conectados','Acceder al directorio de miembros del workspace'],
    fields: [],  // pure OAuth — no pre-inputs needed
  },
  {
    id: 'twilio', name: 'SMS · Twilio', category: 'Canales',
    desc: 'Envía y recibe SMS a través de Twilio en el workspace.',
    domain: 'twilio.com', connected: false, auth: 'apikey', color: '#F22F46', backendLive: true,
    permissions: ['Enviar y recibir SMS desde números Twilio asignados','Acceder al historial de mensajes de la cuenta','Gestionar números de teléfono y rutas de entrada','Ver estado de entrega de cada mensaje enviado'],
    fields: [
      { key: 'account_sid',      label: 'Account SID',          placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'text',     hint: 'Twilio Console → Dashboard → Account SID (empieza por AC)', required: true },
      { key: 'auth_token',       label: 'Auth Token',           placeholder: '••••••••••••••••••••••••••••••••',   type: 'password', hint: 'Twilio Console → Dashboard → Auth Token (junto al Account SID)', required: true },
      { key: 'default_sms_from', label: 'Número SMS por defecto', placeholder: '+34600000000',                    type: 'text',     hint: 'Twilio Console → Phone Numbers → Tu número comprado (formato E.164)', required: true },
    ],
  },
  // ── Pagos ───────────────────────────────────────────────────────────────────
  {
    id: 'stripe', name: 'Stripe', category: 'Pagos',
    desc: 'Consulta suscripciones, pagos y facturas desde cada caso.',
    domain: 'stripe.com', connected: true, auth: 'apikey', color: '#635BFF', backendLive: true,
    permissions: ['Leer datos de clientes, suscripciones y planes (solo lectura)','Consultar historial de pagos, facturas y reembolsos','Ver estado de disputas y chargebacks activos','Acceder a metadatos de productos y precios configurados'],
    fields: [
      { key: 'access_token',    label: 'Secret Key',       placeholder: 'sk_live_••••••••••••••••••',   type: 'password', hint: 'Stripe Dashboard → Developers → API keys → Secret key (sk_live_ o sk_test_)', required: true },
      { key: 'webhook_secret',  label: 'Webhook Secret',   placeholder: 'whsec_••••••••••••••••••••',   type: 'password', hint: 'Stripe Dashboard → Developers → Webhooks → Signing secret (whsec_)', required: true },
      { key: 'publishable_key', label: 'Publishable Key',  placeholder: 'pk_live_••••••••••••••••••',   type: 'text',     hint: 'Opcional. Stripe Dashboard → Developers → API keys → Publishable key', required: false },
    ],
  },
  {
    id: 'shopify', name: 'Shopify', category: 'Comercio',
    desc: 'Accede a pedidos y clientes de Shopify en conversaciones.',
    domain: 'shopify.com', connected: false, auth: 'oauth', color: '#96BF48', backendLive: true,
    permissions: ['Leer pedidos, estado de envío y devoluciones','Acceder al catálogo de productos y variantes','Consultar datos del cliente y su historial de compras','Ver inventario y estado de stock por producto'],
    fields: [
      { key: 'shop_domain', label: 'Dominio de tu tienda Shopify', placeholder: 'mi-tienda.myshopify.com', type: 'text', hint: 'El dominio .myshopify.com de tu tienda (Shopify Admin → Settings → Domains)', required: true },
    ],
  },
  // ── Productividad ───────────────────────────────────────────────────────────
  {
    id: 'jira', name: 'Jira', category: 'Productividad',
    desc: 'Crea issues de Jira desde conversaciones y sincroniza estado.',
    domain: 'atlassian.com', connected: false, auth: 'oauth', color: '#0052CC', backendLive: true,
    permissions: ['Crear y actualizar issues en proyectos seleccionados','Leer estado, prioridad y asignatario de issues','Adjuntar conversaciones de Clain a issues existentes','Sincronizar cambios de estado entre Jira y Clain'],
    fields: [],  // pure OAuth via Atlassian — no pre-inputs
  },
  {
    id: 'linear', name: 'Linear', category: 'Productividad',
    desc: 'Crea y enlaza issues de Linear desde el inbox de soporte.',
    domain: 'linear.app', connected: true, auth: 'oauth', color: '#5E6AD2', backendLive: true,
    permissions: ['Crear y actualizar issues en equipos seleccionados','Leer proyectos, ciclos y estados del workspace','Vincular conversaciones de soporte a issues de Linear','Sincronizar resolución de issues con cierre de conversación'],
    fields: [],  // pure OAuth via Linear
  },
  {
    id: 'notion', name: 'Notion', category: 'Productividad',
    desc: 'Guarda notas de conversaciones y crea páginas de Notion.',
    domain: 'notion.so', connected: false, auth: 'oauth', color: '#000000', backendLive: true,
    permissions: ['Crear páginas en bases de datos seleccionadas','Leer y escribir bloques en páginas compartidas contigo','Guardar transcripciones y resúmenes de conversaciones','Acceder a bases de datos del workspace compartidas'],
    fields: [],  // pure OAuth via Notion
  },
  {
    id: 'github', name: 'GitHub', category: 'Productividad',
    desc: 'Vincula issues de GitHub a conversaciones para bugs.',
    domain: 'github.com', connected: false, auth: 'oauth', color: '#24292E', backendLive: true,
    permissions: ['Crear issues en repositorios seleccionados','Leer título, estado, etiquetas y comentarios de issues','Vincular conversaciones de soporte a issues existentes','Ver pull requests relacionados con issues abiertos'],
    fields: [],  // pure OAuth via GitHub
  },
  // ── Analítica ───────────────────────────────────────────────────────────────
  {
    id: 'ga', name: 'Google Analytics', category: 'Analítica',
    desc: 'Mide el impacto del widget de chat en las conversiones.',
    domain: 'google.com', connected: false, auth: 'oauth', color: '#E37400', backendLive: false,
    permissions: ['Leer métricas de sesiones y eventos del sitio web','Acceder a datos de conversión vinculados al widget de chat','Ver informes de tráfico y fuentes de adquisición','Leer objetivos y embudos de conversión configurados'],
    fields: [
      { key: 'measurement_id', label: 'Measurement ID (GA4)', placeholder: 'G-XXXXXXXXXX', type: 'text', hint: 'Google Analytics → Admin → Data Streams → Tu stream → Measurement ID', required: true },
    ],
  },
  {
    id: 'delighted', name: 'Delighted', category: 'Analítica',
    desc: 'Dispara encuestas CSAT y NPS basadas en conversaciones.',
    domain: 'delighted.com', connected: false, auth: 'apikey', color: '#FF6E6E', backendLive: false,
    permissions: ['Enviar encuestas CSAT y NPS al cerrar conversaciones','Leer respuestas y puntuaciones de encuestas enviadas','Acceder a datos de personas encuestadas','Crear y gestionar campañas de encuesta por segmento'],
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Pega tu API key de Delighted…', type: 'password', hint: 'Delighted → Settings → API → Your API Key', required: true },
    ],
  },
  // ── IA ──────────────────────────────────────────────────────────────────────
  {
    id: 'openai', name: 'OpenAI', category: 'IA',
    desc: 'Conecta GPT-4o para respuestas generativas en el workspace.',
    domain: 'openai.com', connected: true, auth: 'apikey', color: '#10A37F', backendLive: false,
    permissions: ['Llamar a modelos GPT-4o y GPT-4o mini vía API','Enviar el contexto de la conversación como prompt','Usar function calling para automatizaciones del agente','Procesar imágenes adjuntas en conversaciones (visión)'],
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'sk-proj-••••••••••••••••••••••••••••••••', type: 'password', hint: 'platform.openai.com → API keys → Create new secret key', required: true },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', category: 'IA',
    desc: 'Usa Claude como modelo base para el agente AI de Clain.',
    domain: 'anthropic.com', connected: true, auth: 'apikey', color: '#D97706', backendLive: false,
    permissions: ['Llamar a Claude 3.5 Sonnet y Claude 3 Haiku vía API','Enviar historial de conversación como contexto del modelo','Ejecutar herramientas personalizadas del agente AI','Procesar documentos y archivos adjuntos en conversaciones'],
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'sk-ant-api03-••••••••••••••••••••••••••••••', type: 'password', hint: 'console.anthropic.com → API Keys → Create Key', required: true },
    ],
  },
  {
    id: 'zapier', name: 'Zapier', category: 'IA',
    desc: 'Conecta Clain con miles de apps a través de Zaps automáticos.',
    domain: 'zapier.com', connected: false, auth: 'oauth', color: '#FF4A00', backendLive: false,
    permissions: ['Activar Zaps desde eventos de conversaciones (trigger)','Enviar datos de contacto, caso y etiquetas a Zapier','Recibir acciones de Zapier en el inbox de Clain','Acceder a la lista de Zaps activos en tu cuenta'],
    fields: [],  // pure OAuth via Zapier
  },
];

const STORE_CATS"""

src = src[:si_start] + NEW_SI + src[si_end:]

# ── 2. Replace ConnectModal with dynamic field renderer ───────────────────────
OLD_MODAL_START = "// ── Connect Modal — Fin AI Agent design language ──────────────────────────────"
OLD_MODAL_END   = "\nfunction AppStoreView"

modal_start = src.index(OLD_MODAL_START)
modal_end   = src.index(OLD_MODAL_END)

NEW_MODAL = r"""// ── Connect Modal — Fin AI Agent design language ──────────────────────────────
type IntegField = { key: string; label: string; placeholder: string; type: 'text' | 'password' | 'url'; hint?: string; required: boolean };

function ConnectModal({ integ, onClose, onConnected }: {
  integ: typeof STORE_INTEGRATIONS[0];
  onClose: () => void;
  onConnected: () => void;
}) {
  const isOAuth     = integ.auth === 'oauth';
  const hasPreInputs = integ.fields.length > 0;
  const [vals, setVals]     = useState<Record<string, string>>({});
  const [step, setStep]     = useState<'form' | 'done'>('form');
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const setVal = (key: string, v: string) => {
    setVals(prev => ({ ...prev, [key]: v }));
    setErrors(prev => ({ ...prev, [key]: false }));
  };

  const canSubmit = (integ.fields as IntegField[]).filter(f => f.required).every(f => (vals[f.key] ?? '').trim() !== '');

  const handleConnect = () => {
    const newErrors: Record<string, boolean> = {};
    let ok = true;
    (integ.fields as IntegField[]).forEach(f => {
      if (f.required && !(vals[f.key] ?? '').trim()) {
        newErrors[f.key] = true;
        ok = false;
      }
    });
    if (!ok) { setErrors(newErrors); return; }
    setStep('done');
    onConnected();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[20px] shadow-2xl overflow-hidden flex flex-col"
        style={{ width: 520, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {step === 'form' ? (
          <>
            {/* ── Header ── */}
            <div className="flex items-center gap-4 px-7 pt-6 pb-5 border-b border-[#e9eae6] flex-shrink-0">
              <div className="w-[52px] h-[52px] rounded-[14px] bg-[#f3f3f1] border border-[#e9eae6] flex items-center justify-center overflow-hidden flex-shrink-0">
                <AppLogoImg id={integ.id} domain={integ.domain} name={integ.name} color={integ.color} size={36} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[18px] font-bold text-[#1a1a1a] leading-tight">{integ.name}</p>
                  {integ.backendLive ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-[#15803d] bg-[#dcfce7] px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" /> Disponible
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded-full">Próximamente</span>
                  )}
                </div>
                <p className="text-[12px] text-[#646462] mt-0.5">{integ.category} · {isOAuth ? 'OAuth 2.0' : 'API Key'}</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#f3f3f1] hover:bg-[#e9e9e7] flex items-center justify-center flex-shrink-0 transition-colors"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="#646462" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* ── Scrollable body ── */}
            <div className="overflow-y-auto flex-1 min-h-0">
              <div className="px-7 py-5 flex flex-col gap-5">

                <p className="text-[13.5px] text-[#646462] leading-[1.65]">{integ.desc}</p>

                {/* Permissions */}
                <div className="bg-[#f8f8f7] rounded-[12px] p-4">
                  <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Acceso que se concede</p>
                  <div className="flex flex-col gap-2">
                    {(integ.permissions as string[]).map(p => (
                      <div key={p} className="flex items-start gap-2.5">
                        <div className="w-4 h-4 rounded-full bg-[#dcfce7] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none">
                            <path d="M2 5l2 2 4-4" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <span className="text-[13px] text-[#1a1a1a] leading-[1.45]">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fields */}
                {(integ.fields as IntegField[]).length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider -mb-1">
                      {isOAuth ? 'Datos previos a la autorización' : 'Credenciales de acceso'}
                    </p>
                    {(integ.fields as IntegField[]).map(f => (
                      <div key={f.key} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[13px] font-semibold text-[#1a1a1a]">
                            {f.label}
                            {f.required && <span className="text-[#e53e3e] ml-0.5">*</span>}
                          </label>
                          {!f.required && <span className="text-[11px] text-[#646462]">Opcional</span>}
                        </div>
                        <input
                          type={f.type === 'password' ? 'password' : 'text'}
                          value={vals[f.key] ?? ''}
                          onChange={e => setVal(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className={`w-full border rounded-[10px] px-3.5 py-2.5 text-[13px] text-[#1a1a1a] focus:outline-none bg-[#fafaf9] ${
                            errors[f.key]
                              ? 'border-[#e53e3e] focus:border-[#e53e3e]'
                              : 'border-[#e9eae6] focus:border-[#222]'
                          } ${f.type === 'password' ? 'font-mono' : ''}`}
                        />
                        {f.hint && (
                          <p className="text-[11.5px] text-[#646462] leading-[1.5]">
                            <span className="font-semibold">Dónde encontrarlo: </span>{f.hint}
                          </p>
                        )}
                        {errors[f.key] && (
                          <p className="text-[11.5px] text-[#e53e3e]">Este campo es obligatorio</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : isOAuth ? (
                  /* Pure OAuth — explain the flow */
                  <div className="flex items-center gap-3 bg-[#f8f8f7] rounded-[12px] px-4 py-3.5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[14px]" style={{ background: integ.color }}>
                      {integ.name[0]}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">Autenticación OAuth 2.0</p>
                      <p className="text-[12px] text-[#646462] mt-0.5">
                        Se abrirá una ventana segura de {integ.name} para que autorices el acceso. No almacenamos tu contraseña.
                      </p>
                    </div>
                  </div>
                ) : null}

              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-7 pb-6 pt-4 border-t border-[#e9eae6] flex gap-2.5 flex-shrink-0">
              <button
                onClick={handleConnect}
                disabled={!integ.backendLive ? false : ((integ.fields as IntegField[]).length > 0 && !canSubmit)}
                className={`flex-1 h-10 rounded-full text-[13px] font-semibold transition-colors ${
                  (!integ.backendLive ? false : ((integ.fields as IntegField[]).length > 0 && !canSubmit))
                    ? 'bg-[#d1d1cf] text-white cursor-not-allowed'
                    : 'bg-[#222] text-white hover:bg-black cursor-pointer'
                }`}
              >
                {isOAuth
                  ? (integ.fields.length > 0 ? `Continuar y conectar con ${integ.name}` : `Conectar con ${integ.name}`)
                  : 'Guardar y conectar'
                }
              </button>
              <button
                onClick={onClose}
                className="h-10 px-5 rounded-full border border-[#e9eae6] text-[13px] font-semibold text-[#646462] hover:border-[#c8c9c4] hover:text-[#1a1a1a] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          /* ── Success ── */
          <div className="flex flex-col items-center gap-4 px-10 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#dcfce7] flex items-center justify-center mb-1">
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                <path d="M5 12l5 5L19 7" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[20px] font-bold text-[#1a1a1a]">{integ.name} conectado</p>
            <p className="text-[13.5px] text-[#646462] leading-[1.65] max-w-[320px]">
              La integración está activa. Los datos comenzarán a sincronizarse en los próximos minutos.
            </p>
            <button
              onClick={onClose}
              className="mt-3 h-10 px-8 rounded-full bg-[#222] text-white text-[13px] font-semibold hover:bg-black transition-colors"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
"""

src = src[:modal_start] + NEW_MODAL + src[modal_end:]

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: exact backend fields per integration + ConnectModal redesigned")
print(f"File size: {len(src)} chars")
