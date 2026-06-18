// SourceCreateModal — minimal new-source wizard. Mirrors the entry-point step
// of PostHog's `frontend/src/scenes/data-warehouse/new/NewSourceWizard.tsx`.
//
// Turn 2 ships the entry-point only: pick connector + minimum credentials,
// POST to `/api/projects/{pid}/external_data_sources/`. Per-connector OAuth /
// schema-pick steps land in a follow-up.

import React from 'react';

interface SourceCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type ConnectorKey = 'Postgres' | 'MySQL' | 'Stripe' | 'BigQuery' | 'Snowflake' | 'MongoDB' | 'Hubspot' | 'Salesforce';

const CONNECTORS: { key: ConnectorKey; label: string; fields: Field[] }[] = [
  {
    key: 'Postgres', label: 'PostgreSQL', fields: [
      { name: 'prefix',   label: 'Prefijo de tablas', placeholder: 'stripe_',        required: true },
      { name: 'host',     label: 'Host',              placeholder: 'db.example.com', required: true },
      { name: 'port',     label: 'Puerto',            placeholder: '5432',           required: true, type: 'number' },
      { name: 'dbname',   label: 'Base de datos',     placeholder: 'production',     required: true },
      { name: 'user',     label: 'Usuario',           placeholder: 'readonly_user',  required: true },
      { name: 'password', label: 'Contraseña',        type: 'password',              required: true },
      { name: 'schema',   label: 'Esquema',           placeholder: 'public',         required: false },
    ],
  },
  {
    key: 'MySQL', label: 'MySQL', fields: [
      { name: 'prefix',   label: 'Prefijo de tablas', required: true },
      { name: 'host',     label: 'Host',              required: true },
      { name: 'port',     label: 'Puerto',            placeholder: '3306', required: true, type: 'number' },
      { name: 'dbname',   label: 'Base de datos',     required: true },
      { name: 'user',     label: 'Usuario',           required: true },
      { name: 'password', label: 'Contraseña',        type: 'password', required: true },
    ],
  },
  { key: 'Stripe',     label: 'Stripe',     fields: [ { name: 'prefix', label: 'Prefijo de tablas', placeholder: 'stripe_', required: true }, { name: 'stripe_account', label: 'Account ID', placeholder: 'acct_…', required: false }, { name: 'access_token', label: 'API key (rk_*)', type: 'password', required: true } ] },
  { key: 'BigQuery',   label: 'BigQuery',   fields: [ { name: 'prefix', label: 'Prefijo de tablas', required: true }, { name: 'key_file', label: 'Service-account JSON', type: 'textarea', required: true }, { name: 'dataset_id', label: 'Dataset ID', required: true } ] },
  { key: 'Snowflake',  label: 'Snowflake',  fields: [ { name: 'prefix', label: 'Prefijo', required: true }, { name: 'account_id', label: 'Account', required: true }, { name: 'user', label: 'Usuario', required: true }, { name: 'password', label: 'Contraseña', type: 'password', required: true }, { name: 'database', label: 'Database', required: true }, { name: 'warehouse', label: 'Warehouse', required: true } ] },
  { key: 'MongoDB',    label: 'MongoDB',    fields: [ { name: 'prefix', label: 'Prefijo', required: true }, { name: 'connection_string', label: 'Connection string', type: 'password', required: true } ] },
  { key: 'Hubspot',    label: 'HubSpot',    fields: [ { name: 'prefix', label: 'Prefijo', required: true }, { name: 'hubspot_secret_key', label: 'Private app token', type: 'password', required: true } ] },
  { key: 'Salesforce', label: 'Salesforce', fields: [ { name: 'prefix', label: 'Prefijo', required: true }, { name: 'integration_id', label: 'Integration ID', required: true } ] },
];

interface Field {
  name: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'number' | 'textarea';
  required?: boolean;
}

export function SourceCreateModal({ open, onClose, onCreated }: SourceCreateModalProps): React.ReactElement | null {
  const [picked, setPicked] = React.useState<ConnectorKey | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) { setPicked(null); setValues({}); setError(null); }
  }, [open]);

  if (!open) return null;

  const picker = CONNECTORS.find(c => c.key === picked);

  async function submit(): Promise<void> {
    if (!picker) return;
    const missing = picker.fields.filter(f => f.required && !values[f.name]?.trim()).map(f => f.label);
    if (missing.length) { setError(`Faltan campos: ${missing.join(', ')}`); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { prefix, ...payload_job_inputs } = values;
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      await ph.posthog.warehouse.sources.create({
        source_type: picker.key,
        prefix: prefix || picker.key.toLowerCase() + '_',
        payload: { job_inputs: payload_job_inputs },
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Error creando la fuente');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[92vw] max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">
              {picker ? `Configurar ${picker.label}` : 'Añadir fuente de datos'}
            </h2>
            <p className="text-xs text-[#646462] mt-0.5">
              {picker
                ? 'Las credenciales viajan cifradas. PostHog las usa solo para sincronizar.'
                : 'Elige el conector. La sincronización empieza tras guardar.'}
            </p>
          </div>
          {picker && (
            <button
              onClick={() => { setPicked(null); setValues({}); setError(null); }}
              className="text-[#646462] hover:text-[#1a1a18] text-xs"
            >
              ← Cambiar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!picker ? (
            <div className="grid grid-cols-2 gap-2">
              {CONNECTORS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setPicked(c.key)}
                  className="flex items-center gap-2 p-3 rounded-lg border border-[#e9eae6] hover:border-[#e8572a] hover:bg-[#fff5f2] text-left"
                >
                  <div className="w-8 h-8 rounded bg-[#fafaf9] border border-[#e9eae6] flex items-center justify-center text-[10px] font-mono text-[#646462]">
                    {c.key.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[#1a1a18]">{c.label}</div>
                    <div className="text-[10px] text-[#9ca3af]">{c.fields.length} campos</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {picker.fields.map(f => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-[#1a1a18] mb-1">
                    {f.label}{f.required && <span className="text-[#dc2626] ml-0.5">*</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      value={values[f.name] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      rows={4}
                      className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm font-mono focus:outline-none focus:border-[#3b59f6]"
                    />
                  ) : (
                    <input
                      value={values[f.name] ?? ''}
                      onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      type={f.type ?? 'text'}
                      className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]"
                    />
                  )}
                </div>
              ))}
              {error && <p className="text-xs text-[#dc2626]">{error}</p>}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-[#f9f9f7] border-t border-[#e9eae6] flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-[#1a1a18] hover:bg-white rounded-lg">
            Cancelar
          </button>
          {picker && (
            <button
              onClick={submit}
              disabled={submitting}
              className="px-3 py-1.5 bg-[#e8572a] text-white text-sm rounded-lg disabled:opacity-50 hover:bg-[#c4471f]"
            >
              {submitting ? 'Conectando…' : 'Conectar fuente'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SourceCreateModal;
