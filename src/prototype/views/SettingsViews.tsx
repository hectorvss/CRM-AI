// ─────────────────────────────────────────────────────────────────────────────
// Settings & workspace administration views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/hooks';
import { aiFeedbackApi, auditApi, billingApi, callsApi, cannedResponsesApi, connectorsApi, customFiltersApi, customObjectFieldsApi, customObjectRecordsApi, customObjectTypesApi, dataImportsApi, emailTemplatesApi, iamApi, labelsApi, macrosApi, mcpServersApi, slaPoliciesApi, ticketStatesApi, ticketTypesApi, topicsApi, webhookSubscriptionsApi, workingHoursApi, workspacesApi } from '../../api/client';
import { IMG_APP_DELIGHTED, IMG_APP_GA, IMG_APP_INSTAGRAM, IMG_APP_JIRA, IMG_APP_SALESFORCE, IMG_APP_STRIPE, IMG_APP_WHATSAPP, IMG_SLA_BANNER, IMG_TICKETS_PORTAL, IMG_TICKETS_TYPES } from '../assets';
import { FinFlowPreview, ICON_BACK, ICON_CHEVRON, ICON_EMPTY_STATE, ICON_FILTER, ICON_FIN, ICON_IMPORTS_BOOK, ICON_IMPORTS_LINK, ICON_LEARN, ICON_PLUS, SettingsSidebar, TrialBanner, formatContactWhen } from '../sharedUi';
import type { View } from '../types';

// Connector icons (SVG, 1-31284…1-31315)
const SVG_CONN_CREATE      = "http://localhost:3845/assets/9547459195af209d7fc7a8266b21ba259e45d7b3.svg";
const SVG_CONN_MCP         = "http://localhost:3845/assets/b76967aa85b0e0a5adba750c204f52d62caa1075.svg";
const SVG_CONN_STRIPE      = "http://localhost:3845/assets/1ec21e44bf4a7010e4ff49d910b87634243adfb7.svg";
const SVG_CONN_LINEAR      = "http://localhost:3845/assets/ca75e281bbd6e32675df99f63256ec87f3236597.svg";
const SVG_CONN_SHOPIFY     = "http://localhost:3845/assets/8536a444ce92ea293aedfcb5be0df93a17a90a2e.svg";
const SVG_CONN_USAGE       = "http://localhost:3845/assets/c6a7642954882aa9ac8f79803b287640af9ec4cb.svg";


// ── DataConversacionesView ─────────────────────────────────────────────────────

const CONV_ROWS = [
  { name: "Sentiment",  created: "7 días atrás", visible: "Todos", required: "No" },
  { name: "Urgency",    created: "7 días atrás", visible: "Todos", required: "No" },
  { name: "Complexity", created: "7 días atrás", visible: "Todos", required: "No" },
  { name: "Sentiment",  created: "5 días atrás", visible: "Todos", required: "No" },
];

export function DataConversacionesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [showPanel, setShowPanel] = useState(false);
  const [convTab, setConvTab] = useState<'general' | 'condiciones'>('general');
  const [convFormat, setConvFormat] = useState('Texto');
  const [convName, setConvName] = useState('');
  const [convDesc, setConvDesc] = useState('');
  const [convMultiline, setConvMultiline] = useState(false);
  const [convLimitVisible, setConvLimitVisible] = useState(false);
  const [convRequired, setConvRequired] = useState(false);
  const [rows, setRows] = useState(CONV_ROWS);

  function handleSave() {
    if (!convName.trim()) return;
    setRows(prev => [...prev, { name: convName.trim(), created: 'ahora', visible: 'Todos', required: convRequired ? 'Sí' : 'No' }]);
    setShowPanel(false);
    setConvName(''); setConvDesc(''); setConvFormat('Texto'); setConvMultiline(false); setConvLimitVisible(false); setConvRequired(false);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex min-h-0 overflow-hidden">
          {/* Main table area */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
              <div className="flex items-center gap-3">
                <h1 className="text-[20px] font-bold text-[#1a1a1a]">Conversaciones</h1>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                  Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                </button>
                <button onClick={() => { setShowPanel(true); setConvTab('general'); }} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">Crear atributo</button>
              </div>
            </div>

            {/* Filter row */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
              <div className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[5px] text-[13px] text-[#1a1a1a] bg-white hover:bg-[#f5f5f4] cursor-pointer">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.3"><path d="M2.5 2.5h11a.5.5 0 01.4.8L9.5 9v4.5L6.5 12V9L2.1 3.3a.5.5 0 01.4-.8z"/></svg>
                <span>Type is cualquiera</span>
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center text-[12px] font-medium text-[#646462] px-4 border-b border-[#e9eae6]" style={{ height: 36 }}>
                <div className="w-[48px] flex-shrink-0" />
                <div className="flex-1 min-w-0">Nombre</div>
                <div className="w-[160px] flex-shrink-0">Tipo</div>
                <div className="w-[100px] flex-shrink-0">Creado</div>
                <div className="w-[120px] flex-shrink-0">Visible para</div>
                <div className="w-[100px] flex-shrink-0">Obligatorio</div>
                <div className="w-[80px] flex-shrink-0">Condiciones</div>
                <div className="w-[48px] flex-shrink-0" />
              </div>
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-center px-4 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7] cursor-pointer border-b border-[#f3f3f1]" style={{ height: 64 }}>
                  <div className="w-[48px] flex-shrink-0 flex items-center justify-center opacity-30">
                    <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
                      <circle cx="3.5" cy="3.5" r="1.2" fill="#1a1a1a"/><circle cx="3.5" cy="8" r="1.2" fill="#1a1a1a"/><circle cx="3.5" cy="12.5" r="1.2" fill="#1a1a1a"/>
                      <circle cx="8.5" cy="3.5" r="1.2" fill="#1a1a1a"/><circle cx="8.5" cy="8" r="1.2" fill="#1a1a1a"/><circle cx="8.5" cy="12.5" r="1.2" fill="#1a1a1a"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 font-semibold">{row.name}</div>
                  <div className="w-[160px] flex-shrink-0">
                    <span className="inline-flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full pl-2 pr-3 py-1 text-[12px]">
                      <svg viewBox="0 0 14 14" className="w-3 h-3 fill-[#646462]"><path d="M7 1l1.4 3.8H12L9 7l1 3.5L7 8.5 4 10.5 5 7 2 4.8h3.6z"/></svg>
                      Atributo de Fin
                    </span>
                  </div>
                  <div className="w-[100px] flex-shrink-0 text-[#646462]">{row.created}</div>
                  <div className="w-[120px] flex-shrink-0 text-[#646462]">{row.visible}</div>
                  <div className="w-[100px] flex-shrink-0 text-[#646462]">{row.required}</div>
                  <div className="w-[80px] flex-shrink-0">
                    <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                      <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.3"><path d="M2 4h10M4 7h6M6 10h2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                  <div className="w-[48px] flex-shrink-0 flex justify-end">
                    <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                      <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 fill-[#646462]"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel — Crear atributo */}
          {showPanel && (
            <div className="w-[560px] flex-shrink-0 border-l border-[#e9eae6] flex flex-col">
              {/* Panel header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
                <h2 className="text-[16px] font-bold text-[#1a1a1a]">Crear un nuevo atributo</h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleSave} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[6px] text-[13px] font-semibold hover:bg-[#444]">Guardar</button>
                  <button onClick={() => setShowPanel(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                  </button>
                </div>
              </div>
              {/* Tabs */}
              <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
                {(['general', 'condiciones'] as const).map(t => (
                  <button key={t} onClick={() => setConvTab(t)}
                    className={`px-1 pb-3 pt-3 mr-5 text-[13px] font-medium border-b-2 -mb-px capitalize transition-colors ${convTab === t ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {/* Panel body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                {convTab === 'general' && (
                  <>
                    {/* Formato */}
                    <div>
                      <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Formato</label>
                      <div className="flex items-center gap-4">
                        <div className="relative inline-block">
                          <div className="flex items-center gap-1.5 border border-[#e9eae6] rounded-[8px] pl-2.5 pr-8 py-2 text-[13px] text-[#1a1a1a] bg-white cursor-pointer min-w-[130px]">
                            <span className="text-[11px] font-bold text-[#1a1a1a] bg-[#f3f3f1] rounded px-1 py-0.5">Aa</span>
                            <select value={convFormat} onChange={e => setConvFormat(e.target.value)}
                              className="appearance-none bg-transparent border-none text-[13px] text-[#1a1a1a] focus:outline-none cursor-pointer flex-1">
                              {['Texto', 'Número', 'Booleano', 'Fecha', 'Lista', 'URL', 'Email'].map(f => <option key={f}>{f}</option>)}
                            </select>
                            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><path d="M4 6l4 4 4-4"/></svg>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-[13px] text-[#1a1a1a] cursor-pointer">
                          <input type="checkbox" checked={convMultiline} onChange={e => setConvMultiline(e.target.checked)} className="w-3.5 h-3.5 accent-[#fa7938]" />
                          Multilínea
                        </label>
                      </div>
                    </div>

                    {/* Nombre */}
                    <div>
                      <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Nombre</label>
                      <input value={convName} onChange={e => setConvName(e.target.value)}
                        placeholder="por ejemplo, Tipo"
                        className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6]" />
                      <p className="text-[12px] text-[#646462] mt-1.5 leading-relaxed">Este nombre es visible para los clientes si decides automatizar la colección de datos para ello, por ejemplo, a través de un flujo de trabajo.</p>
                    </div>

                    {/* Descripción */}
                    <div>
                      <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Descripción</label>
                      <textarea value={convDesc} onChange={e => setConvDesc(e.target.value)}
                        placeholder="por ejemplo, Tipo de conversación"
                        rows={3}
                        className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6] resize-none" />
                      <p className="text-[12px] text-[#646462] mt-1">{255 - convDesc.length} characters remaining</p>
                    </div>

                    {/* Limitar la visibilidad */}
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Limitar la visibilidad</p>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setConvLimitVisible(v => !v)}
                          style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0, background: convLimitVisible ? '#f97316' : '#d1d5db', transition: 'background 0.2s' }}>
                          <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: convLimitVisible ? 18 : 2 }} />
                        </button>
                        <span className="text-[13px] text-[#646462]">Visible solo para las conversaciones asignadas a equipos específicos.</span>
                      </div>
                    </div>

                    {/* Atributo obligatorio */}
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Atributo obligatorio</p>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setConvRequired(v => !v)}
                          style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0, background: convRequired ? '#f97316' : '#d1d5db', transition: 'background 0.2s' }}>
                          <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: convRequired ? 18 : 2 }} />
                        </button>
                        <span className="text-[13px] text-[#646462]">Un miembro del equipo deberá completar esto antes de cerrar una conversación</span>
                      </div>
                    </div>
                  </>
                )}
                {convTab === 'condiciones' && (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <svg viewBox="0 0 40 40" className="w-10 h-10 fill-none stroke-[#ccc]" strokeWidth="1.5"><path d="M8 10h24M12 20h16M16 30h8" strokeLinecap="round"/></svg>
                    <p className="text-[13px] text-[#646462]">No hay condiciones configuradas</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SETTINGS_ROWS = [
  { name: "Sentiment",   created: "1 hora atrás", visible: "Todos", required: "No" },
  { name: "Urgency",     created: "1 hora atrás", visible: "Todos", required: "No" },
  { name: "Complexity",  created: "1 hora atrás", visible: "Todos", required: "No" },
];

function SettingsMainContent({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed]"
          >
            <img src={ICON_BACK} alt="" className="w-4 h-4" />
          </button>
          <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Conversaciones</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[8px] py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
            <img src={ICON_LEARN} alt="" className="w-3.5 h-3.5" />
            <span>Aprender</span>
            <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
          </button>
          <button className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-[#f8f8f7] hover:bg-[#333]">
            <img src={ICON_PLUS} alt="" className="w-3.5 h-3.5 invert" />
            <span>Crear atributo</span>
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-1.5 bg-white border border-[#e9eae6] rounded-full pl-[13px] pr-[10px] py-[7px]">
          <img src={ICON_FILTER} alt="" className="w-3.5 h-3.5 opacity-60" />
          <span className="text-[13px] text-[#1a1a1a]">Type is cualquiera</span>
          <img src={ICON_CHEVRON} alt="" className="w-3 h-3 opacity-40" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Column headers */}
        <div
          className="flex items-center text-[13px] font-semibold text-[#646462] px-4"
          style={{ boxShadow: "inset 0px -1px 0px 0px #e9eae6", height: 40 }}
        >
          <div className="w-[48px] flex-shrink-0" />
          <div className="w-[202px] flex-shrink-0">Nombre</div>
          <div className="w-[130px] flex-shrink-0">Tipo</div>
          <div className="w-[88px] flex-shrink-0">Creado</div>
          <div className="w-[200px] flex-shrink-0">Visible para</div>
          <div className="w-[111px] flex-shrink-0">Obligatorio</div>
          <div className="w-[122px] flex-shrink-0">Condiciones</div>
          <div className="flex-1" />
        </div>

        {SETTINGS_ROWS.map((row) => (
          <div
            key={row.name}
            className="flex items-center px-4 text-[14px] text-[#1a1a1a] hover:bg-[#f8f8f7] cursor-pointer"
            style={{ height: 74, boxShadow: "inset 0px -1px 0px 0px #e9eae6" }}
          >
            {/* Drag handle */}
            <div className="w-[48px] flex-shrink-0 flex items-center justify-center opacity-30">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="5.5" cy="4.5" r="1.2" fill="#1a1a1a"/>
                <circle cx="5.5" cy="8"   r="1.2" fill="#1a1a1a"/>
                <circle cx="5.5" cy="11.5" r="1.2" fill="#1a1a1a"/>
                <circle cx="10.5" cy="4.5" r="1.2" fill="#1a1a1a"/>
                <circle cx="10.5" cy="8"   r="1.2" fill="#1a1a1a"/>
                <circle cx="10.5" cy="11.5" r="1.2" fill="#1a1a1a"/>
              </svg>
            </div>
            {/* Name */}
            <div className="w-[202px] flex-shrink-0 font-semibold">{row.name}</div>
            {/* Type badge */}
            <div className="w-[130px] flex-shrink-0">
              <span className="inline-flex items-center gap-1 bg-[#f8f8f7] rounded-full pl-[6px] pr-[10px] py-[4px]">
                <img src={ICON_FIN} alt="" className="w-3.5 h-3.5" />
                <span className="text-[13px]">Atributo de Fin</span>
              </span>
            </div>
            {/* Created */}
            <div className="w-[88px] flex-shrink-0 text-[14px]">{row.created}</div>
            {/* Visible */}
            <div className="w-[200px] flex-shrink-0 text-[14px]">{row.visible}</div>
            {/* Required */}
            <div className="w-[111px] flex-shrink-0 text-[14px]">{row.required}</div>
            {/* Conditions */}
            <div className="w-[122px] flex-shrink-0">
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-[0px_0px_0px_1px_#e9eae6] hover:bg-[#f8f8f7]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 4h10M4 7h6M6 10h2" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {/* Actions */}
            <div className="flex-1 flex justify-end">
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="3"  r="1.3" fill="#1a1a1a"/>
                  <circle cx="7" cy="7"  r="1.3" fill="#1a1a1a"/>
                  <circle cx="7" cy="11" r="1.3" fill="#1a1a1a"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type SetIconKind =
  | 'gear' | 'team' | 'clock' | 'gift' | 'tag' | 'shield' | 'globe' | 'card' | 'chart'
  | 'chat' | 'mail' | 'phone' | 'whatsapp' | 'hash' | 'discord' | 'sms' | 'social'
  | 'inbox' | 'redirect' | 'bolt' | 'ticket' | 'timer'
  | 'sparkle' | 'aibox' | 'wrench'
  | 'shop' | 'plug' | 'code' | 'flow'
  | 'user' | 'building' | 'cube' | 'arrows' | 'bars'
  | 'home' | 'book' | 'plus'
  | 'bell' | 'flask' | 'brush'
  | 'pencil' | 'eye' | 'key' | 'lockuser';

function SetIcon({ kind }: { kind: SetIconKind }) {
  const cls = "w-4 h-4 fill-none stroke-[#1a1a1a]";
  const sw = "1.5";
  switch (kind) {
    case 'gear':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"/></svg>;
    case 'team':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="6" cy="6" r="2.2"/><path d="M2 13.5c.6-2.2 2.2-3.4 4-3.4s3.4 1.2 4 3.4"/><circle cx="11.5" cy="5" r="1.7"/><path d="M11 9.6c1.5.1 2.7 1.1 3.2 2.7"/></svg>;
    case 'clock':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5L10 10" strokeLinecap="round"/></svg>;
    case 'gift':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><rect x="2" y="6" width="12" height="3" rx="0.5"/><rect x="3" y="9" width="10" height="5" rx="0.5"/><path d="M8 6v8M5.5 6c-1 0-2-1-2-2s1-1.5 2-1c.8.3 1.5 1.5 2.5 3-1.5 0-2 0-2.5 0zM10.5 6c1 0 2-1 2-2s-1-1.5-2-1c-.8.3-1.5 1.5-2.5 3 1.5 0 2 0 2.5 0z"/></svg>;
    case 'tag':      return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M2.5 7.5l5-5h6v6l-5 5z"/><circle cx="10" cy="6" r="1" fill="#1a1a1a" stroke="none"/></svg>;
    case 'shield':   return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M8 1.5l5.5 2v4.5c0 3.2-2.4 5.7-5.5 6.5-3.1-.8-5.5-3.3-5.5-6.5V3.5z"/></svg>;
    case 'globe':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>;
    case 'card':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><rect x="1.5" y="3.5" width="13" height="9" rx="1.2"/><path d="M1.5 6.5h13M3.5 10h2"/></svg>;
    case 'chart':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinecap="round"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>;
    case 'chat':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M2.5 7c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5-2.5 4.5-5.5 4.5c-.7 0-1.4-.1-2-.3L3 12.5l.6-2.3c-.7-.8-1.1-1.7-1.1-2.7z"/></svg>;
    case 'mail':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><rect x="2" y="3.5" width="12" height="9" rx="1.2"/><path d="M2.5 4.5l5.5 4 5.5-4"/></svg>;
    case 'phone':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M3 3h2.5l1.2 3-1.4 1c.7 1.6 2.1 3 3.7 3.7l1-1.4 3 1.2V13c0 .3-.2.5-.5.5C6.5 13.5 2.5 9.5 2.5 3.5 2.5 3.2 2.7 3 3 3z"/></svg>;
    case 'whatsapp': return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M2.5 7c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5-2.5 4.5-5.5 4.5c-.7 0-1.4-.1-2-.3L3 12.5l.6-2.3c-.7-.8-1.1-1.7-1.1-2.7z"/><path d="M6 6.5c.5 1.5 2 2.5 3.5 3" strokeLinecap="round"/></svg>;
    case 'hash':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinecap="round"><path d="M5.5 1.5L4 14.5M11.5 1.5L10 14.5M1.5 5h13M1 11h13"/></svg>;
    case 'discord':  return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M3 4.5c1.5-1 3.5-1.5 5-1.5s3.5.5 5 1.5l1.5 7c-1 .8-2.5 1.5-4 1.7l-.5-1c-.7.2-1.3.3-2 .3s-1.3-.1-2-.3l-.5 1c-1.5-.2-3-.9-4-1.7z"/><circle cx="6" cy="8" r="0.8" fill="#1a1a1a" stroke="none"/><circle cx="10" cy="8" r="0.8" fill="#1a1a1a" stroke="none"/></svg>;
    case 'sms':      return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M2.5 4.5c0-.6.4-1 1-1h9c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H6L3 13.5V4.5z"/><path d="M6 6.5h4M6 8.5h3" strokeLinecap="round"/></svg>;
    case 'social':   return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="4" cy="4" r="1.7"/><circle cx="12" cy="4" r="1.7"/><circle cx="4" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><path d="M5 5l6 6M11 5l-6 6"/></svg>;
    case 'inbox':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M2 9V4c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v5z"/><path d="M2 9h3.5l1 1.5h3l1-1.5H14v3c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z"/></svg>;
    case 'redirect': return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h7l3 3-3 3H2M14 9v3"/></svg>;
    case 'bolt':     return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M9 1L3 9h4l-1 6 7-9H9z"/></svg>;
    case 'ticket':   return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M2 5.5c.8 0 1.5-.7 1.5-1.5h9c0 .8.7 1.5 1.5 1.5v5c-.8 0-1.5.7-1.5 1.5h-9c0-.8-.7-1.5-1.5-1.5z"/><path d="M6 4.5v7M9 5.5v.01M9 7v.01M9 8.5v.01M9 10v.01" strokeLinecap="round"/></svg>;
    case 'timer':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="8" cy="9" r="5"/><path d="M8 6v3l2 2M6 1.5h4M8 1.5v2.5" strokeLinecap="round"/></svg>;
    case 'sparkle':  return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>;
    case 'aibox':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M8 5l1 2.5L11.5 8.5 9 9.5 8 12 7 9.5 4.5 8.5 7 7.5z" fill="#1a1a1a" stroke="none"/></svg>;
    case 'wrench':   return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M11 2.5l3 3-2 2-2.5-.5-5 5L2 9l5-5L6.5 1.5z"/></svg>;
    case 'shop':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M3 5h10l-.5 8.5h-9zM5 5V3.5a3 3 0 016 0V5"/></svg>;
    case 'plug':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinecap="round"><path d="M5 1.5v3M11 1.5v3M3.5 4.5h9v3.5c0 1.4-1.1 2.5-2.5 2.5h-4c-1.4 0-2.5-1.1-2.5-2.5z"/><path d="M8 10.5v4"/></svg>;
    case 'code':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9.5 3.5L7 13"/></svg>;
    case 'flow':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="3" cy="3" r="1.5"/><circle cx="13" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><path d="M4.5 3.5L11.5 7M4.5 12.5L11.5 9"/></svg>;
    case 'user':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="8" cy="6" r="2.5"/><path d="M3 13.5c0-2 2.5-3 5-3s5 1 5 3"/></svg>;
    case 'building': return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M3 13.5V3.5h7v10M10 13.5V7h3v6.5"/><path d="M5 6.5h.5M5 9h.5M7 6.5h.5M7 9h.5M5 11.5h.5M7 11.5h.5"/></svg>;
    case 'cube':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M8 1.5l6 3v7l-6 3-6-3v-7z"/><path d="M2 4.5l6 3 6-3M8 7.5v7"/></svg>;
    case 'arrows':   return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M5 2v8M5 10l-2.5-2.5M5 10L7.5 7.5M11 14V6M11 6L8.5 8.5M11 6l2.5 2.5"/></svg>;
    case 'bars':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinecap="round"><path d="M3 13V8M7 13V4M11 13V10M14 13V6"/></svg>;
    case 'home':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M2 7L8 2l6 5v6.5h-4V10H6v3.5H2z"/></svg>;
    case 'book':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/><path d="M8 3.2v9.6"/></svg>;
    case 'plus':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth="1.7" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>;
    case 'bell':     return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M3.5 11.5h9c-1-1-1-2-1-4 0-2-1.5-3.5-3.5-3.5S4.5 5.5 4.5 7.5c0 2 0 3-1 4z"/><path d="M6.5 13.5c.3.5.9.8 1.5.8s1.2-.3 1.5-.8M8 4V2.5"/></svg>;
    case 'flask':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M6 1.5h4M7 1.5v4.5L3.5 13c-.4.7.1 1.5.9 1.5h7.2c.8 0 1.3-.8.9-1.5L9 6V1.5"/></svg>;
    case 'brush':    return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M11 2l3 3-7 7H4v-3z"/><path d="M9 4l3 3M3 13.5l-1.5 1"/></svg>;
    case 'pencil':   return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw} strokeLinejoin="round"><path d="M11 2l3 3-9 9-4 1 1-4z"/><path d="M9 4l3 3"/></svg>;
    case 'eye':      return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><path d="M1.5 8C3 5 5.5 3.5 8 3.5s5 1.5 6.5 4.5C13 11 10.5 12.5 8 12.5S3 11 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>;
    case 'key':      return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="5" cy="11" r="2.5"/><path d="M7 9.5l6.5-6.5M11 5l2 2M9.5 6.5l1.5 1.5"/></svg>;
    case 'lockuser': return <svg viewBox="0 0 16 16" className={cls} strokeWidth={sw}><circle cx="6" cy="5.5" r="2"/><path d="M2.5 13c0-1.7 1.6-3 3.5-3s3.5 1.3 3.5 3"/><rect x="10" y="8" width="5" height="4" rx="0.5"/><path d="M11 8V6.5a1.5 1.5 0 013 0V8"/></svg>;
  }
}

function SettingsCardGrid({ title, cards, onNavigate }: {
  title: string;
  cards: { icon: SetIconKind; bg: string; name: string; desc: string; badge?: string; target?: View }[];
  onNavigate?: (v: View) => void;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">{title}</h3>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c, i) => (
          <button
            key={i}
            onClick={() => { if (c.target && onNavigate) onNavigate(c.target); }}
            disabled={!c.target}
            className={`bg-white border border-[#e9eae6] rounded-[10px] p-4 flex items-start gap-3 text-left ${c.target ? 'hover:bg-[#fafaf9] hover:border-[#d4d4d0] cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}
          >
            <span className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
              <SetIcon kind={c.icon} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-[#1a1a1a]">{c.name}</span>
                {c.badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e7e2fd] text-[#5b21b6] font-medium">{c.badge}</span>}
              </div>
              {c.desc && <p className="mt-0.5 text-[11.5px] text-[#646462] leading-[15px] line-clamp-3">{c.desc}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsInicioContent({ onNavigate }: { onNavigate?: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
      <div className="flex items-center px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><path d="M2 7.5L8 2l6 5.5V14H2z"/><path d="M6.5 14V9h3v5"/></svg>
          <h1 className="text-[20px] font-bold text-[#1a1a1a]">Inicio</h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
        <SettingsCardGrid onNavigate={onNavigate} title="Espacio de trabajo" cards={[
          { icon: 'gear',   bg: '#f3f3f1', name: 'Generales',            desc: 'Visualiza información básica de tu cuenta, como tu nombre y zona horaria.', target: 'workspaceGeneral' },
          { icon: 'team',   bg: '#dbeafe', name: 'Compañeros de equipo', desc: 'Administra y añade a compañeros de equipo en tu espacio de trabajo.', target: 'workspaceTeammates' },
          { icon: 'clock',  bg: '#fef3c7', name: 'Horario de atención',  desc: 'Configura el horario en el que tu equipo está disponible.', target: 'workspaceHours' },
          { icon: 'gift',   bg: '#d1fae5', name: 'Referencias',          badge: 'Gana $200', desc: 'Recomienda Intercom a otras empresas y consigue una bonificación.' },
          { icon: 'tag',    bg: '#fce7f3', name: 'Marcas',               desc: 'Para tus clientes y agencias.', target: 'workspaceBrands' },
          { icon: 'shield', bg: '#e0e7ff', name: 'Seguridad',            desc: 'Configura la autenticación y los ajustes de inicio de sesión.', target: 'workspaceSecurity' },
          { icon: 'globe',  bg: '#fef3c7', name: 'Multilingüe',          desc: 'Configura los idiomas en los que opera tu espacio de trabajo.', target: 'workspaceMultilingual' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Suscripción" cards={[
          { icon: 'card',  bg: '#dcfce7', name: 'Facturación', desc: 'Administra tu suscripción y métodos de pago.', target: 'billing' },
          { icon: 'chart', bg: '#fee2e2', name: 'Uso',         desc: 'Monitoriza el uso de tu suscripción y compromiso de Fin.', target: 'billing' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Canales" cards={[
          { icon: 'chat',     bg: '#fce7f3', name: 'Messenger',              desc: 'Atrae y mantente conectado con clientes a través de tu sitio web o aplicaciones móviles.', target: 'messenger' },
          { icon: 'mail',     bg: '#dbeafe', name: 'Correo electrónico',     desc: 'Administra el correo de tu equipo, dominios y autenticación con DKIM.', target: 'email' },
          { icon: 'phone',    bg: '#fee2e2', name: 'Teléfono',               desc: 'Configura y administra llamadas de voz directamente desde tu Inbox.', target: 'phone' },
          { icon: 'whatsapp', bg: '#dcfce7', name: 'WhatsApp',               desc: 'Habla y configura los números de WhatsApp y comparte tu equipo.', target: 'whatsapp' },
          { icon: 'hash',     bg: '#e9d5ff', name: 'Slack',                  desc: 'Recibe y envía mensajes a tu equipo desde Slack.', target: 'slackChannel' },
          { icon: 'discord',  bg: '#cffafe', name: 'Discord',                desc: 'Recibe y envía mensajes a usuarios de Discord.', target: 'discord' },
          { icon: 'sms',      bg: '#fef3c7', name: 'SMS',                    desc: 'Configura los números de SMS para enviar mensajes a tus usuarios.', target: 'sms' },
          { icon: 'social',   bg: '#fce7f3', name: 'Canales redes sociales', desc: 'Administra mensajes desde plataformas sociales en tu equipo.', target: 'social' },
          { icon: 'globe',    bg: '#dbeafe', name: 'Todos los canales',      desc: 'Administra y configura los ajustes de todos los canales de tu equipo.', target: 'allChannels' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Inbox" cards={[
          { icon: 'inbox',    bg: '#dbeafe', name: 'Inbox para el equipo', desc: 'Crea buzones para tu equipo de compañeros que podrían trabajar juntos.', target: 'inboxTeam' },
          { icon: 'redirect', bg: '#fef3c7', name: 'Asignaciones',         desc: 'Especifica cómo se asignan los casos de soporte y cómo se manejan las cargas de trabajo.', target: 'assignments' },
          { icon: 'bolt',     bg: '#e9d5ff', name: 'Macros',               desc: 'Crea y edita macros para enviar respuestas comunes con un solo clic.', target: 'macros' },
          { icon: 'ticket',   bg: '#fce7f3', name: 'Tipos de atención',    desc: 'Crea y configura los tipos de tickets y categorías de tu equipo de servicio al cliente.', target: 'tickets' },
          { icon: 'timer',    bg: '#fee2e2', name: 'SLA',                  desc: 'Asegúrate de que tu equipo cumple los acuerdos de nivel de servicio prometidos.', target: 'sla' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="IA y automatización" cards={[
          { icon: 'sparkle', bg: '#fef3c7', name: 'Fin AI Agent',   desc: 'Administra tu agente de IA y personalízalo para tus clientes.', target: 'fin' },
          { icon: 'aibox',   bg: '#e0e7ff', name: 'Buzón de IA',    badge: 'New Beta', desc: 'Activa características nuevas de inteligencia artificial en el buzón de tu equipo.', target: 'aiInbox' },
          { icon: 'wrench',  bg: '#fce7f3', name: 'Automatización', desc: 'Crea reglas y flujos de trabajo para automatizar el trabajo en tu Inbox.', target: 'automation' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Integraciones" cards={[
          { icon: 'shop', bg: '#dbeafe', name: 'Tienda de aplicaciones',     desc: 'Conecta a Intercom todos los servicios y herramientas que ya usas.', target: 'appStore' },
          { icon: 'plug', bg: '#dcfce7', name: 'Conectores de datos',        desc: 'Especifica los datos de los sistemas externos que usa tu equipo.', target: 'connectors' },
          { icon: 'flow', bg: '#fce7f3', name: 'Automatizaciones',           desc: 'Crea automatizaciones con cualquier información o paso a paso.', target: 'automation' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Datos" cards={[
          { icon: 'tag',      bg: '#dbeafe', name: 'Etiquetas',                desc: 'Administra tus etiquetas y agrúpalas en categorías para crear filtros.', target: 'labels' },
          { icon: 'user',     bg: '#dcfce7', name: 'Personas',                 desc: 'Administra atributos, segmentos y eventos de los contactos en tu cuenta.', target: 'people' },
          { icon: 'building', bg: '#fef3c7', name: 'Empresas',                 desc: 'Administra atributos, segmentos y eventos de las cuentas en tu cuenta.', target: 'companies' },
          { icon: 'chat',     bg: '#fce7f3', name: 'Conversaciones',           desc: 'Crea atributos para los datos que tu equipo necesita en cada conversación.' },
          { icon: 'cube',     bg: '#e9d5ff', name: 'Objetos personalizados',   desc: 'Importar tipos de objetos para crear y asociar datos personalizados.', target: 'customObjects' },
          { icon: 'arrows',   bg: '#cffafe', name: 'Importación y exportación', desc: 'Importa o exporta datos de Intercom y otras fuentes.', target: 'imports' },
          { icon: 'bars',     bg: '#fee2e2', name: 'Temas',                    desc: 'Crea categorías generales o más temas conversacionales.', target: 'topics' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Centro de ayuda" cards={[
          { icon: 'home', bg: '#dbeafe', name: 'Inicio Help Center',         desc: 'Configura el inicio de tu centro de ayuda.', target: 'helpCenter' },
          { icon: 'book', bg: '#dcfce7', name: 'Todos los centros de ayuda', desc: 'Lista todos los centros de ayuda en tu cuenta.', target: 'helpCenter' },
          { icon: 'plus', bg: '#fef3c7', name: 'Nuevo Centro de ayuda',      desc: '', target: 'helpCenter' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Canales salientes" cards={[
          { icon: 'bell',  bg: '#fce7f3', name: 'Suscripciones',         desc: 'Permite a los clientes administrar las comunicaciones que reciben.', target: 'outbound' },
          { icon: 'flask', bg: '#fef3c7', name: 'Pruebas de mensajes',   desc: 'Crea pruebas A/B con mensajes automatizados.', target: 'outbound' },
          { icon: 'tag',   bg: '#dcfce7', name: 'Etiquetas de mensajes', desc: 'Clasifica tus mensajes con etiquetas personalizadas.', target: 'outbound' },
          { icon: 'brush', bg: '#e9d5ff', name: 'Personalización',       desc: 'Personaliza la apariencia de los mensajes salientes.', target: 'outbound' },
        ]} />
        <SettingsCardGrid onNavigate={onNavigate} title="Personal" cards={[
          { icon: 'pencil',   bg: '#dbeafe', name: 'Información',            desc: 'Configura tu información personal como tu nombre y avatar.', target: 'personal' },
          { icon: 'shield',   bg: '#fef3c7', name: 'Seguridad de la cuenta', desc: 'Configura ajustes de tu cuenta personal de inicio de sesión.', target: 'security' },
          { icon: 'bell',     bg: '#fce7f3', name: 'Notificaciones',         desc: 'Configura las preferencias de notificaciones.', target: 'notifications' },
          { icon: 'eye',      bg: '#dcfce7', name: 'Visible para ti',        desc: 'Personaliza tu vista de pantalla y disposición.', target: 'visible' },
          { icon: 'key',      bg: '#fee2e2', name: 'Tokens de API',          desc: 'Verifica y configura tus tokens personales de la API.', target: 'tokens' },
          { icon: 'lockuser', bg: '#e9d5ff', name: 'Acceso a la cuenta',     desc: 'Administra cuentas asociadas, incluyendo qué espacios de trabajo puedes usar.', target: 'accountAccess' },
          { icon: 'globe',    bg: '#cffafe', name: 'Multilingüe',            desc: 'Configura los ajustes de traducción de tu cuenta.', target: 'multilingual' },
        ]} />

        {/* ── Developer: Seed Data ───────────────────────────────────────── */}
        <SeedDataPanel />
      </div>
    </div>
  );
}

// ── SeedDataPanel — inject / delete big seed dataset from the UI ──────────────
function SeedDataPanel() {
  const [seedStatus, setSeedStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [seedMsg, setSeedMsg]       = useState('');
  const [delStatus, setDelStatus]   = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');

  async function getToken(): Promise<string | null> {
    try {
      const { supabase } = await import('../../api/supabase');
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch { return null; }
  }

  async function handleSeed() {
    setSeedStatus('loading'); setSeedMsg('');
    const token = await getToken();
    try {
      const res = await fetch('/api/admin/seed/big', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const body = await res.json().catch(() => ({})) as any;
      if (res.ok) { setSeedStatus('ok');  setSeedMsg(body.message ?? 'Dataset inyectado.'); }
      else        { setSeedStatus('err'); setSeedMsg(body.error ?? `Error ${res.status}`); }
    } catch (e: any) {
      setSeedStatus('err'); setSeedMsg(e.message ?? 'Error de red');
    }
  }

  async function handleDelete() {
    setDelStatus('loading');
    const token = await getToken();
    try {
      const res = await fetch('/api/admin/seed/big', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const body = await res.json().catch(() => ({})) as any;
      if (res.ok) { setDelStatus('ok');  setSeedMsg(body.message ?? 'Datos eliminados.'); }
      else        { setDelStatus('err'); setSeedMsg(body.error ?? `Error ${res.status}`); }
    } catch (e: any) {
      setDelStatus('err'); setSeedMsg(e.message ?? 'Error de red');
    }
  }

  const btnBase = 'inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="mt-6 rounded-[16px] border border-dashed border-[#e9eae6] bg-[#fafafa] p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[18px] text-[#646462]">science</span>
        <h3 className="text-[15px] font-bold text-[#1a1a1a]">Datos de prueba</h3>
        <span className="ml-2 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-bold text-[#92400e] uppercase tracking-wide">Developer</span>
      </div>
      <p className="text-[13px] text-[#646462] mb-5 max-w-xl">
        Inyecta un conjunto grande de datos ficticios (8 clientes, 20 casos, 15 pedidos, 60 mensajes, aprobaciones, CSAT…) en tu workspace para ver cómo se comporta el frontend con datos reales. Elimínalos después con el botón de borrado.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          disabled={seedStatus === 'loading'}
          onClick={handleSeed}
          className={`${btnBase} bg-[#3b59f6] text-white hover:bg-[#2d46d6]`}
        >
          {seedStatus === 'loading'
            ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Inyectando…</>
            : <><span className="material-symbols-outlined text-[15px]">add_circle</span>Inyectar datos de prueba</>}
        </button>
        <button
          disabled={delStatus === 'loading'}
          onClick={handleDelete}
          className={`${btnBase} bg-white text-[#dc2626] border border-[#fca5a5] hover:bg-[#fef2f2]`}
        >
          {delStatus === 'loading'
            ? <><span className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />Eliminando…</>
            : <><span className="material-symbols-outlined text-[15px]">delete</span>Eliminar datos de prueba</>}
        </button>
        {seedMsg && (
          <span className={`text-[12px] font-medium ${
            seedStatus === 'ok' || delStatus === 'ok' ? 'text-emerald-600' :
            seedStatus === 'err' || delStatus === 'err' ? 'text-red-600' : 'text-[#646462]'
          }`}>
            {seedStatus === 'ok' || delStatus === 'ok' ? '✓ ' : seedStatus === 'err' || delStatus === 'err' ? '✗ ' : ''}{seedMsg}
          </span>
        )}
      </div>
      {(seedStatus === 'ok') && (
        <p className="mt-3 text-[12px] text-[#646462]">
          Recarga la página o navega a <strong>Casos</strong>, <strong>Clientes</strong> o <strong>Bandeja</strong> para ver los datos inyectados.
        </p>
      )}
    </div>
  );
}

export function SettingsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  void onBack;
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <SettingsInicioContent onNavigate={onNavigate} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS VIEW
// ─────────────────────────────────────────────────────────────────────────────

const IMPORT_TABS = [
  "Importar desde Zendesk",
  "Importar desde Intercom",
  "Importar CSV",
  "Importar desde Mixpanel",
  "Importar desde Mailchimp",
  "Exportar datos",
];

function ImportsZendeskTab() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
      <div className="max-w-[756px] mx-auto flex flex-col gap-6">
        {/* Main form card */}
        <div className="border border-[#e9eae6] rounded-[6px] px-[21px] py-[20px] bg-white flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-[#1a1a1a]">
            Importar desde Zendesk de forma gratuita
          </h2>
          <p className="text-[14px] text-[#1a1a1a] leading-[1.5]">
            Sabemos que mudarse puede ser difícil. Por eso, para facilitarte las cosas, te
            ofrecemos importar tus datos de Zendesk de forma gratuita. Solo tienes que
            conectar tu cuenta de Zendesk a continuación para empezar.
          </p>

          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-semibold text-[#1a1a1a]">La URL de Zendesk</span>
            <input
              type="text"
              placeholder="https://your-workspace.zendesk.com"
              className="border border-[#e9eae6] rounded-[6px] px-[13px] py-[8px] text-[14px] text-[#1a1a1a] placeholder-[#646462] outline-none focus:border-[#1a1a1a] w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-[#f8f8f7] rounded-full px-[12px] py-[8px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed]">
              Conectar
            </button>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full px-[12px] py-[8px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed]">
              <span>Configurar importación</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-50" />
            </button>
          </div>

          <p className="text-[14px] text-[#646462] leading-[1.5]">
            La importación puede tardar varios días en completarse, dependiendo de la cantidad
            de datos. Te notificaremos cuando esté lista.
          </p>
        </div>

        {/* Resources section */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Más recursos</h3>
          <div className="flex gap-4">
            {[
              "Guía de importación",
              "Importar artículos desde Zendesk",
            ].map((label) => (
              <div
                key={label}
                className="flex-1 bg-[#f8f8f7] border border-[#e9eae6] rounded-[6px] p-[21px] flex items-center gap-3 cursor-pointer hover:bg-[#f3f3f1]"
              >
                <img src={ICON_IMPORTS_BOOK} alt="" className="w-10 h-10 flex-shrink-0" />
                <span className="flex-1 text-[14px] font-medium text-[#1a1a1a]">{label}</span>
                <img src={ICON_IMPORTS_LINK} alt="" className="w-4 h-4 opacity-50 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportsIntercomTab() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
      <div className="max-w-[756px] mx-auto flex flex-col gap-6">
        {/* Main form card */}
        <div className="border border-[#e9eae6] rounded-[6px] px-[21px] py-[20px] bg-white flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-[#1a1a1a]">
            Importar desde Intercom de forma gratuita
          </h2>
          <p className="text-[14px] text-[#1a1a1a] leading-[1.5]">
            Importa tus conversaciones, contactos y datos de empresa desde Intercom a Clain.
            Solo tienes que conectar tu cuenta de Intercom a continuación para empezar.
            Tus datos se migrarán de forma segura y sin pérdida de información.
          </p>

          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-semibold text-[#1a1a1a]">Token de acceso de Intercom</span>
            <input
              type="text"
              placeholder="Pega aquí tu token de acceso"
              className="border border-[#e9eae6] rounded-[6px] px-[13px] py-[8px] text-[14px] text-[#1a1a1a] placeholder-[#646462] outline-none focus:border-[#1a1a1a] w-full font-mono"
            />
            <span className="text-[12px] text-[#646462]">
              Puedes obtener tu token en{' '}
              <a href="#" className="text-[#e35712] underline hover:opacity-80">
                Intercom Developer Hub
              </a>
              {' '}→ Tu aplicación → Autenticación.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-[#f8f8f7] rounded-full px-[12px] py-[8px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed]">
              Conectar
            </button>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full px-[12px] py-[8px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed]">
              <span>Configurar importación</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-50" />
            </button>
          </div>

          <p className="text-[14px] text-[#646462] leading-[1.5]">
            La importación puede tardar varios días en completarse, dependiendo de la cantidad
            de datos. Te notificaremos cuando esté lista.
          </p>
        </div>

        {/* Resources section */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Más recursos</h3>
          <div className="flex gap-4">
            {[
              "Guía de migración desde Intercom",
              "Importar contactos desde Intercom",
            ].map((label) => (
              <div
                key={label}
                className="flex-1 bg-[#f8f8f7] border border-[#e9eae6] rounded-[6px] p-[21px] flex items-center gap-3 cursor-pointer hover:bg-[#f3f3f1]"
              >
                <img src={ICON_IMPORTS_BOOK} alt="" className="w-10 h-10 flex-shrink-0" />
                <span className="flex-1 text-[14px] font-medium text-[#1a1a1a]">{label}</span>
                <img src={ICON_IMPORTS_LINK} alt="" className="w-4 h-4 opacity-50 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportsEmptyTab({
  description,
  btnLabel,
}: {
  description: string;
  btnLabel: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-[380px] text-center">
        <img src={ICON_EMPTY_STATE} alt="" className="w-10 h-10 opacity-60" />
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Todavía no hay importaciones</h2>
          <p className="text-[14px] text-[#646462] leading-[1.5]">{description}</p>
        </div>
        <a href="#" className="text-[14px] text-[#e35712] underline hover:opacity-80">
          Más información
        </a>
        <button className="bg-[#222] text-white text-[14px] font-semibold rounded-full px-5 py-[9px] hover:bg-[#444]">
          {btnLabel}
        </button>
      </div>
    </div>
  );
}

function ImportsExportTab() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="px-8 py-6">
        <p className="text-[14px] text-[#1a1a1a] mb-8">
          Exporta datos de Intercom a tu proveedor de servicios en la nube para análisis e informes.
        </p>
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <img src={ICON_EMPTY_STATE} alt="" className="w-10 h-10 opacity-60" />
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-[18px] font-semibold text-[#1a1a1a]">No hay exportaciones de datos</h2>
            <p className="text-[14px] text-[#646462]">Comienza creando una nueva exportación</p>
          </div>
          <button className="bg-[#222] text-white text-[14px] font-semibold rounded-full px-5 py-[9px] hover:bg-[#444]">
            Nueva exportación
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportHistorySection({ entityType }: { entityType: string }) {
  const { data: imports, loading } = useApi(
    () => dataImportsApi.list({ entityType }),
    [entityType],
    [],
  );
  if (loading) return (
    <div className="flex items-center gap-2 px-6 py-4 text-[13px] text-[#646462]">
      <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#3b59f6', borderTopColor: 'transparent' }} />
      Cargando historial…
    </div>
  );
  if (!(imports as any[]).length) return null;
  return (
    <div className="px-6 py-4 border-t border-[#e9eae6] flex-shrink-0">
      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Historial de importaciones</p>
      <div className="flex flex-col gap-2">
        {(imports as any[]).map((imp: any) => (
          <div key={imp.id} className="flex items-center gap-3 border border-[#e9eae6] rounded-[8px] px-4 py-3 bg-[#fafaf9]">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              imp.status === 'completed' ? 'bg-[#22c55e]' :
              imp.status === 'failed'    ? 'bg-[#ef4444]' :
              imp.status === 'running'   ? 'bg-[#f97316]' : 'bg-[#d1d5db]'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{imp.file_name ?? imp.source ?? imp.entity_type}</p>
              <p className="text-[11px] text-[#646462]">
                {imp.status === 'completed' ? `${imp.rows_imported ?? 0} filas importadas` :
                 imp.status === 'failed'    ? (imp.error_message ?? 'Error') :
                 imp.status === 'running'   ? `${imp.rows_processed ?? 0} / ${imp.total_rows ?? '?'} filas` :
                 'Pendiente'}
                {imp.created_at ? ` · ${new Date(imp.created_at).toLocaleDateString('es-ES')}` : ''}
              </p>
            </div>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
              imp.status === 'completed' ? 'bg-[#d1fae5] text-[#065f46]' :
              imp.status === 'failed'    ? 'bg-red-50 text-red-700' :
              imp.status === 'running'   ? 'bg-[#fff7ed] text-[#9a3412]' :
              'bg-[#f3f4f6] text-[#6b7280]'
            }`}>{imp.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImportsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed]"
              >
                <img src={ICON_BACK} alt="" className="w-4 h-4" />
              </button>
              <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
                Importaciones y exportaciones
              </span>
            </div>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[8px] py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_LEARN} alt="" className="w-3.5 h-3.5" />
              <span>Aprender</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex items-end gap-0 px-6 border-b border-[#e9eae6] flex-shrink-0">
            {IMPORT_TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-3 text-[14px] whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === i
                    ? "border-[#ed621d] text-[#1a1a1a] font-medium"
                    : "border-transparent text-[#646462] hover:text-[#1a1a1a]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {activeTab === 0 && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <ImportsZendeskTab />
                <ImportHistorySection entityType="zendesk" />
              </div>
            )}
            {activeTab === 1 && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <ImportsIntercomTab />
                <ImportHistorySection entityType="intercom" />
              </div>
            )}
            {activeTab === 2 && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <ImportsEmptyTab
                  description="Importar datos de un archivo CSV a Clain."
                  btnLabel="Importar"
                />
                <ImportHistorySection entityType="csv" />
              </div>
            )}
            {activeTab === 3 && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <ImportsEmptyTab
                  description="Importa datos de tu cuenta de Mixpanel a Clain."
                  btnLabel="Conectar con Mixpanel"
                />
                <ImportHistorySection entityType="mixpanel" />
              </div>
            )}
            {activeTab === 4 && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <ImportsEmptyTab
                  description="Importa datos de tu lista de correo de Mailchimp a Clain. Vamos a obtener el nombre y la dirección de correo electrónico de las personas."
                  btnLabel="Conectar con Mailchimp"
                />
                <ImportHistorySection entityType="mailchimp" />
              </div>
            )}
            {activeTab === 5 && <ImportsExportTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL VIEW (Settings > Personal > Información)
// ─────────────────────────────────────────────────────────────────────────────

const MAPBOX_URL = "https://api.mapbox.com/styles/v1/patrickod/cjbcj1mh978pd2rkd15d5aauf/static/-0.7902,38.4786,2/1280x186?access_token=pk.eyJ1IjoicGF0cmlja29kIiwiYSI6ImY1LVY4WkUifQ.WK9SrChxuv4vz1NxPDooSw&attribution=false&logo=false";

function ProfileRow({ children, value, muted = false }: { children: React.ReactNode; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-[5px]">
      <div className="w-4 h-4 flex-shrink-0 mt-[2px] opacity-40">{children}</div>
      <span className={`text-[13px] leading-[1.4] ${muted ? 'text-[#646462]' : 'text-[#1a1a1a]'}`}>{value}</span>
    </div>
  );
}

const convFeedItems = [
  { id: "1", channel: "Messenger · [Demo]", preview: "Para instalar el Messenger de Intercom en tu sitio web, ve a Configuración > Messenger > Instalar.", time: "hace 4 min", color: "#9ec5fa", initial: "M" },
  { id: "2", channel: "Email · [Demo]", preview: "Esta es una demostración del canal de correo electrónico. Configura tu dirección de correo para recibir mensajes.", time: "hace 8 min", color: "#85e0d9", initial: "E" },
  { id: "3", channel: "WhatsApp · [Demo]", preview: "Configura WhatsApp para comunicarte con tus clientes directamente desde Intercom.", time: "hace 12 min", color: "#61d65c", initial: "W" },
  { id: "4", channel: "Phone · [Demo]", preview: "Configura llamadas telefónicas o SMS para atender a tus clientes por voz.", time: "hace 20 min", color: "#b09efa", initial: "P" },
];

export function PersonalView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: me, loading: meLoading, refetch: refetchMe } = useApi(() => iamApi.me(), [], null);
  const displayName = me?.name ?? me?.fullName ?? '';
  const displayEmail = me?.email ?? '';
  const avatarUrl: string | null = me?.avatar_url ?? me?.avatarUrl ?? null;
  const initials = (displayName || '?').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();

  // Avatar upload — backed by iamApi.uploadAvatar (POST /iam/me/avatar).
  const avatarInputRef = React.useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  async function onAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';           // allow re-picking the same file
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    try {
      await iamApi.uploadAvatar(file);
      refetchMe();
    } catch {
      /* surfaced by the global error banner */
    } finally {
      setAvatarBusy(false);
    }
  }

  // Name editing — the only public-profile field the backend persists
  // (PATCH /iam/me accepts name/avatar/preferences). The other rows shown here
  // are display-only until the backend stores them.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  function startEditName() { setNameDraft(displayName); setEditingName(true); }
  async function saveName() {
    const next = nameDraft.trim();
    if (next.length < 2 || nameBusy) return;
    setNameBusy(true);
    try {
      await iamApi.updateMe({ name: next });
      setEditingName(false);
      refetchMe();
    } catch {
      /* surfaced by the global error banner */
    } finally {
      setNameBusy(false);
    }
  }
  const displayRole = me?.role ?? me?.roleName ?? 'Agente';
  const location = me?.location ?? 'Elda, Spain';

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
          {/* Map header */}
          <div className="relative h-[156px] flex-shrink-0 overflow-hidden" style={{ background: '#384754' }}>
            <img
              src={MAPBOX_URL}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/40" />
            <div className="absolute inset-0 flex items-end px-8 pb-5">
              <div className="flex items-end gap-4">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  title="Cambiar foto de perfil"
                  className="group relative w-[74px] h-[74px] rounded-full bg-[#9ec5fa] border-[3px] border-white flex items-center justify-center text-[22px] font-bold text-[#1a1a1a] flex-shrink-0 overflow-hidden">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : initials}
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-semibold text-white">
                    {avatarBusy ? '…' : 'Cambiar'}
                  </span>
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarPicked} />
                <div className="flex flex-col gap-0.5 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[20px] font-semibold text-white">{displayName}</span>
                    <span className="text-[11px] font-semibold text-white/90 bg-white/25 rounded-[4px] px-2 py-[2px]">Tú</span>
                  </div>
                  <div className="flex items-center gap-3 text-[13px] text-white/80">
                    <span>{location}</span>
                    <span>·</span>
                    <span>9:56 a.m.</span>
                    <span>·</span>
                    <span>Activo en los últimos 15 minutos</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content below map */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Profile sidebar */}
            <div className="w-[320px] flex-shrink-0 overflow-y-auto border-r border-[#e9eae6] py-5 px-[30px]">
              <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-3">Tú</h3>

              {/* Perfil público */}
              <div className="border border-[#e9eae6] rounded-[10px] mb-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-[14px] border-b border-[#e9eae6]">
                  <span className="text-[14px] font-semibold text-[#1a1a1a]">Perfil público</span>
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingName(false)} className="text-[13px] font-medium text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
                      <button onClick={saveName} disabled={nameBusy || nameDraft.trim().length < 2}
                        className="text-[13px] font-semibold text-white bg-[#1a1a1a] rounded-full px-3 py-[5px] hover:bg-[#444] disabled:opacity-40">
                        {nameBusy ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={startEditName} className="text-[13px] font-semibold text-white bg-[#1a1a1a] rounded-full px-3 py-[5px] hover:bg-[#444]">Editar</button>
                  )}
                </div>
                <div className="px-5 py-3">
                  {editingName ? (
                    <div className="flex items-center gap-2 py-1.5">
                      <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4 flex-shrink-0"><circle cx="7" cy="4.5" r="2.3" stroke="#1a1a1a" strokeWidth="1.2"/><path d="M2 12c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                        placeholder="Tu nombre"
                        className="flex-1 border border-[#e9eae6] rounded-[6px] px-2.5 py-[5px] text-[13px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a]"
                      />
                    </div>
                  ) : (
                  <ProfileRow value={displayName || 'Sin nombre'}>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><circle cx="7" cy="4.5" r="2.3" stroke="#1a1a1a" strokeWidth="1.2"/><path d="M2 12c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  )}
                  <ProfileRow value={me?.username ?? me?.handle ?? (displayName ? displayName.toLowerCase().replace(/\s+/g, '.') : '—')}>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#1a1a1a" strokeWidth="1.2"/><path d="M1 5l6 4 6-4" stroke="#1a1a1a" strokeWidth="1.2"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Activo">
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><circle cx="7" cy="7" r="5.5" stroke="#1a1a1a" strokeWidth="1.2"/><circle cx="7" cy="7" r="2.5" fill="#158613"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Elda, Spain">
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M7 1C4.8 1 3 2.8 3 5c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" stroke="#1a1a1a" strokeWidth="1.2"/><circle cx="7" cy="5" r="1.5" stroke="#1a1a1a" strokeWidth="1.2"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Desactivado" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M2 7h10M7 2v10" stroke="#646462" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Aún no hay un puesto" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><rect x="1" y="4" width="12" height="8" rx="1" stroke="#646462" strokeWidth="1.2"/><path d="M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="#646462" strokeWidth="1.2"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Aún no hay departamentos" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><circle cx="4" cy="5" r="2" stroke="#646462" strokeWidth="1.1"/><circle cx="10" cy="5" r="2" stroke="#646462" strokeWidth="1.1"/><path d="M1 12c0-1.7 1.3-3 3-3" stroke="#646462" strokeWidth="1.1" strokeLinecap="round"/><path d="M13 12c0-1.7-1.3-3-3-3" stroke="#646462" strokeWidth="1.1" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Aún no hay números de teléfono" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M11 9.5c0 .3-.1.6-.2.9-.2.3-.4.5-.7.7-.4.2-.9.4-1.4.4-1.5 0-3.2-.9-4.6-2.3C2.7 7.8 1.8 6.1 1.8 4.6c0-.5.1-1 .3-1.4.2-.4.5-.6.8-.8L3.5 2l2 4.5L4.8 7c.5 1 1.3 1.8 2.2 2.3l.5-.7L11 9.5z" stroke="#646462" strokeWidth="1.1"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Preséntate" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M2 4h10M2 7h7M2 10h5" stroke="#646462" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Añade un enlace a tu calendario" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="#646462" strokeWidth="1.2"/><path d="M1 6h12M5 1v2M9 1v2" stroke="#646462" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                </div>
              </div>

              {/* Tu cuenta */}
              <div className="border border-[#e9eae6] rounded-[10px] mb-4 overflow-hidden">
                <div className="px-5 py-[14px] border-b border-[#e9eae6]">
                  <span className="text-[14px] font-semibold text-[#1a1a1a]">Tu cuenta</span>
                </div>
                <div className="px-5 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-3 py-1">
                    <span className="text-[13px] text-[#646462] w-[85px] flex-shrink-0">Creado el</span>
                    <span className="text-[13px] text-[#1a1a1a]">1 hora atrás</span>
                  </div>
                  <div className="flex items-start gap-3 py-1">
                    <span className="text-[13px] text-[#646462] w-[85px] flex-shrink-0">Correo</span>
                    <span className="text-[12px] text-[#1a1a1a] break-all">{displayEmail}</span>
                  </div>
                </div>
              </div>

              {/* Inbox para el equipo */}
              <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                <div className="px-5 py-[14px] border-b border-[#e9eae6]">
                  <span className="text-[14px] font-semibold text-[#1a1a1a]">Inbox para el equipo</span>
                </div>
                <div className="px-5 py-4 flex items-start justify-between gap-3">
                  <p className="text-[13px] text-[#646462] leading-[1.4]">
                    Hector no es miembro de ningún buzón del equipo
                  </p>
                  <button className="text-[13px] font-semibold text-[#1a1a1a] flex-shrink-0 hover:opacity-70">Editar</button>
                </div>
              </div>
            </div>

            {/* Conversations area */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-4">Tus conversaciones</h3>
              <div className="flex flex-col gap-3">
                {convFeedItems.map((item) => (
                  <div key={item.id} className="border border-[#e9eae6] rounded-xl p-4 bg-white hover:bg-[#f8f8f7] cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[12px] font-semibold text-[#1a1a1a]"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-semibold text-[#646462]">{item.channel}</span>
                          <span className="text-[12px] text-[#646462] flex-shrink-0 ml-2">{item.time}</span>
                        </div>
                        <p className="text-[13px] text-[#1a1a1a] leading-[1.5] line-clamp-2">{item.preview}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY VIEW (Settings > Personal > Seguridad de la cuenta)
// ─────────────────────────────────────────────────────────────────────────────

function SecuritySection({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex border border-[#e9eae6] rounded-[12px] overflow-hidden flex-shrink-0">
      <div className="flex-1 px-[25px] py-[25px] flex flex-col gap-3">{left}</div>
      <div className="flex-1 px-[25px] py-[25px] border-l border-[#e9eae6] flex flex-col justify-center">{right}</div>
    </div>
  );
}

function SecurityInput({ label, defaultValue = "", placeholder = "", blue = false, type = "text", value, onChange }: {
  label: string; defaultValue?: string; placeholder?: string; blue?: boolean;
  type?: string; value?: string; onChange?: (v: string) => void;
}) {
  const controlled = value !== undefined;
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[14px] font-medium text-[#1a1a1a]">{label}</span>
      <input
        type={type}
        {...(controlled ? { value, onChange: (e) => onChange?.(e.target.value) } : { defaultValue })}
        placeholder={placeholder}
        className={`border border-[#e9eae6] rounded-[6px] px-3 py-[6px] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] w-[236px] ${
          blue ? 'bg-[#e8f0fe]' : 'bg-white'
        }`}
      />
    </div>
  );
}

export function SecurityView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  const { data: me } = useApi(() => iamApi.me(), [], null);
  const displayEmail = me?.email ?? '';
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  // 2FA via Supabase-native MFA (TOTP). Supabase generates + verifies the secret,
  // so the security-critical crypto is handled by the platform, not rolled here.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaQr, setMfaQr] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaDone, setMfaDone] = useState(false);
  useEffect(() => {
    if (!show2FAModal) return;
    let cancelled = false;
    (async () => {
      setMfaBusy(true); setMfaError(null); setMfaQr(null); setMfaSecret(null); setMfaFactorId(null); setMfaDone(false); setTwoFACode('');
      try {
        const { supabase } = await import('../../api/supabase');
        const { data, error } = await (supabase as any).auth.mfa.enroll({ factorType: 'totp' });
        if (cancelled) return;
        if (error) { setMfaError('No se pudo iniciar la configuración de 2FA.'); }
        else { setMfaFactorId(data?.id ?? null); setMfaQr(data?.totp?.qr_code ?? null); setMfaSecret(data?.totp?.secret ?? null); }
      } catch { if (!cancelled) setMfaError('No se pudo iniciar la configuración de 2FA.'); }
      finally { if (!cancelled) setMfaBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [show2FAModal]);
  async function verify2FA() {
    if (!mfaFactorId || twoFACode.length !== 6 || mfaBusy) return;
    setMfaBusy(true); setMfaError(null);
    try {
      const { supabase } = await import('../../api/supabase');
      const { data: ch, error: chErr } = await (supabase as any).auth.mfa.challenge({ factorId: mfaFactorId });
      if (chErr || !ch) { setMfaError('No se pudo verificar el código.'); return; }
      const { error: vErr } = await (supabase as any).auth.mfa.verify({ factorId: mfaFactorId, challengeId: ch.id, code: twoFACode });
      if (vErr) { setMfaError('Código incorrecto. Inténtalo de nuevo.'); }
      else { setMfaDone(true); setTimeout(() => { setShow2FAModal(false); setTwoFACode(''); }, 1200); }
    } catch { setMfaError('No se pudo verificar el código.'); }
    finally { setMfaBusy(false); }
  }

  // Change-email flow — wired to iamApi.updateEmail. The current password is
  // requested via prompt on save (the route verifies it before changing).
  const [emailDraft, setEmailDraft] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setEmailDraft(displayEmail); }, [displayEmail]);
  async function handleChangeEmail() {
    const next = emailDraft.trim().toLowerCase();
    if (emailBusy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) { setEmailMsg({ ok: false, text: 'Introduce un correo válido.' }); return; }
    if (next === displayEmail.toLowerCase()) { setEmailMsg({ ok: false, text: 'El correo es el mismo que el actual.' }); return; }
    const current = window.prompt('Confirma tu contraseña actual para cambiar el correo');
    if (!current) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await iamApi.updateEmail(current, next);
      setEmailMsg({ ok: true, text: 'Correo actualizado.' });
    } catch {
      setEmailMsg({ ok: false, text: 'No se pudo cambiar el correo. Revisa la contraseña y que el correo no esté en uso.' });
    } finally {
      setEmailBusy(false);
    }
  }

  // Change-password flow — wired to iamApi.changePassword. Fields are controlled
  // so we can clear them after a successful change; the user always types their
  // own credentials (never pre-filled).
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleChangePassword() {
    if (pwdBusy) return;
    if (!curPwd || !newPwd) { setPwdMsg({ ok: false, text: 'Introduce la contraseña actual y la nueva.' }); return; }
    if (newPwd !== confirmPwd) { setPwdMsg({ ok: false, text: 'La nueva contraseña no coincide.' }); return; }
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      await iamApi.changePassword(curPwd, newPwd);
      setCurPwd(''); setNewPwd(''); setConfirmPwd('');
      setPwdMsg({ ok: true, text: 'Contraseña actualizada.' });
    } catch {
      setPwdMsg({ ok: false, text: 'No se pudo cambiar la contraseña. Revisa la contraseña actual.' });
    } finally {
      setPwdBusy(false);
    }
  }

  // Active sessions — real data from iamApi.mySessions(); the current session
  // cannot be revoked from here.
  const { data: sessions, loading: sessionsLoading, refetch: refetchSessions } = useApi<any[]>(() => iamApi.mySessions(), [], []);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  async function handleRevokeSession(id: string) {
    if (revokingId) return;
    setRevokingId(id);
    try {
      await iamApi.revokeSession(id);
      refetchSessions();
    } catch {
      /* surfaced by the global error banner */
    } finally {
      setRevokingId(null);
    }
  }
  function fmtSessionTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed] mr-3"
            >
              <img src={ICON_BACK} alt="" className="w-4 h-4" />
            </button>
            <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Seguridad de la cuenta</span>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 flex flex-col gap-4">
            {/* Section 1 — Email */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Dirección de correo electrónico</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    Actualiza el correo electrónico asociado a tu cuenta de Intercom. Ingresa tu contraseña actual para confirmar los cambios.
                  </p>
                </>
              }
              right={
                <div className="flex flex-col gap-[5px]">
                  <span className="text-[14px] font-medium text-[#1a1a1a]">ID de correo electrónico</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      className="border border-[#e9eae6] rounded-[6px] px-3 py-[6px] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] w-[236px]"
                    />
                    <button
                      onClick={handleChangeEmail}
                      disabled={emailBusy || emailDraft.trim().toLowerCase() === displayEmail.toLowerCase()}
                      className="bg-[#1a1a1a] text-white rounded-full px-3 py-[7px] text-[14px] font-semibold hover:bg-[#444] disabled:opacity-40 disabled:bg-[#f8f8f7] disabled:text-[#81817e] flex-shrink-0">
                      {emailBusy ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                  {emailMsg && <span className={`text-[13px] ${emailMsg.ok ? 'text-[#059669]' : 'text-[#dc2626]'}`}>{emailMsg.text}</span>}
                </div>
              }
            />

            {/* Section 2 — Password */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Cambiar contraseña</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    Cambia la contraseña de tu cuenta de Intercom ingresando la contraseña actual y luego confirma la nueva contraseña
                  </p>
                </>
              }
              right={
                <div className="flex flex-col gap-8">
                  <SecurityInput label="Contraseña actual" type="password" value={curPwd} onChange={setCurPwd} />
                  <SecurityInput label="Nueva contraseña" type="password" value={newPwd} onChange={setNewPwd} />
                  <div className="flex flex-col gap-[5px]">
                    <span className="text-[14px] font-medium text-[#1a1a1a]">Vuelve a ingresar la nueva contraseña</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="password"
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        className="border border-[#e9eae6] rounded-[6px] px-3 py-[6px] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] w-[236px]"
                      />
                      <button
                        onClick={handleChangePassword}
                        disabled={pwdBusy}
                        className="bg-[#1a1a1a] text-white rounded-full px-3 py-[7px] text-[14px] font-semibold hover:bg-[#444] disabled:opacity-40 flex-shrink-0">
                        {pwdBusy ? 'Guardando…' : 'Confirmar'}
                      </button>
                    </div>
                    {pwdMsg && (
                      <span className={`text-[13px] ${pwdMsg.ok ? 'text-[#059669]' : 'text-[#dc2626]'}`}>{pwdMsg.text}</span>
                    )}
                  </div>
                </div>
              }
            />

            {/* Section 3 — 2FA */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Autenticación de dos factores (2FA)</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    Mejore la seguridad de la cuenta activando la 2FA
                  </p>
                  <a href="#" className="flex items-center gap-1.5 text-[14px] text-[#165fc6]">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#165fc6" strokeWidth="1.2"/><path d="M7 6v4M7 4.5v.5" stroke="#165fc6" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    <span>Más información</span>
                  </a>
                </>
              }
              right={
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    {/* Toggle off */}
                    <div className="w-8 h-4 bg-[#c6c9c0] rounded-full p-[2px] flex items-center flex-shrink-0">
                      <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
                    </div>
                    <span className="text-[14px] text-[#1a1a1a]">Habilitar la autenticación de dos factores</span>
                    {/* Warning icon */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0"><path d="M8 2L14 13H2L8 2z" fill="#F9C61F" stroke="#F9C61F" strokeWidth="0.5"/><path d="M8 6v3M8 10.5v.5" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  </div>
                  <button
                    onClick={() => setShow2FAModal(true)}
                    className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                  >
                    <span className="text-[14px] font-medium text-[#1a1a1a]">Configurar</span>
                    <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5 flex-shrink-0"><path d="M5 3l4 4-4 4" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              }
            />

            {/* Section 4 — Sessions */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Tus sesiones activas</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    A la derecha se muestran las sesiones activas de su cuenta. Si no reconoce una sesión, puede terminarla.
                  </p>
                  <a href="#" className="text-[14px] text-[#1a1a1a] underline leading-[1.4]">
                    Haz clic aquí para ver la actividad reciente de tu compañero de equipo.
                  </a>
                </>
              }
              right={
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr style={{ boxShadow: 'inset 0 -1px 0 0 #e9eae6' }}>
                        {["Hora de inicio de sesión", "Dirección IP", "Dispositivo", ""].map((h) => (
                          <th key={h} className="text-left text-[13px] font-semibold text-[#646462] pb-3 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sessionsLoading && (
                        <tr><td colSpan={4} className="py-4 text-[13px] text-[#9a9a98]">Cargando sesiones…</td></tr>
                      )}
                      {!sessionsLoading && sessions.length === 0 && (
                        <tr><td colSpan={4} className="py-4 text-[13px] text-[#9a9a98]">No hay sesiones activas.</td></tr>
                      )}
                      {sessions.map((s: any) => (
                        <tr key={s.id} style={{ boxShadow: 'inset 0 -1px 0 0 #e9eae6' }}>
                          <td className="py-3 pr-4 text-[14px] text-[#1a1a1a]">
                            {fmtSessionTime(s.created_at)}
                            {s.current && <span className="ml-2 text-[11px] font-medium text-[#059669] bg-[#ecfdf5] rounded-full px-2 py-[1px]">Esta sesión</span>}
                          </td>
                          <td className="py-3 pr-4 text-[14px] text-[#1a1a1a]">{s.ip || '—'}</td>
                          <td className="py-3 pr-4 text-[14px] text-[#1a1a1a] max-w-[240px] truncate" title={s.device}>{s.device || '—'}</td>
                          <td className="py-3 pr-4 text-right">
                            {!s.current && (
                              <button
                                onClick={() => handleRevokeSession(s.id)}
                                disabled={revokingId === s.id}
                                className="text-[13px] font-medium text-[#dc2626] hover:underline disabled:opacity-40">
                                {revokingId === s.id ? 'Terminando…' : 'Terminar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />
          </div>
        </div>
      </div>

      {/* ── 2FA Setup Modal ────────────────────────────────────────── */}
      {show2FAModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[60px]" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-[16px] w-full max-w-[680px] mx-4 shadow-[0px_8px_40px_rgba(0,0,0,0.18)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-7 py-5 border-b border-[#e9eae6]">
              <h2 className="text-[17px] font-semibold text-[#1a1a1a]">Autenticación de dos factores (2FA)</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={verify2FA}
                  disabled={mfaBusy || twoFACode.length !== 6 || !mfaFactorId}
                  className="text-[14px] font-semibold text-white bg-[#1a1a1a] hover:bg-[#444] rounded-full px-4 py-[7px] transition-colors disabled:opacity-40"
                >
                  {mfaBusy ? 'Verificando…' : mfaDone ? '✓ Activado' : 'Validar y guardar'}
                </button>
                <button
                  onClick={() => { setShow2FAModal(false); setTwoFACode(''); }}
                  className="text-[14px] font-semibold text-[#1a1a1a] hover:opacity-70 transition-opacity px-2 py-[7px]"
                >
                  Cancelar
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-7 py-6 flex flex-col gap-5">
              {/* Instruction */}
              <p className="text-[14px] text-[#1a1a1a] leading-[1.6]">
                Descarga la aplicación gratuita{' '}
                <span className="underline cursor-pointer">Google Authenticator</span>
                {' '}en tu dispositivo móvil, haz clic en Agregar y luego escanea este código QR para configurar tu cuenta.
              </p>

              {/* QR Code — real, from Supabase MFA enroll */}
              <div className="w-[190px] h-[190px] border border-[#e9eae6] rounded-[8px] p-2 flex items-center justify-center bg-white">
                {mfaQr ? (
                  <img src={mfaQr} alt="Código QR de configuración 2FA" className="w-[170px] h-[170px]" />
                ) : (
                  <span className="text-[12px] text-[#9a9a98] text-center px-2">{mfaBusy ? 'Generando código…' : (mfaError ? 'No disponible' : '…')}</span>
                )}
                <svg style={{ display: 'none' }} viewBox="0 0 210 210" width="170" height="170" xmlns="http://www.w3.org/2000/svg">
                  {/* Top-left finder pattern */}
                  <rect x="10" y="10" width="60" height="60" rx="4" fill="#1a1a1a"/>
                  <rect x="18" y="18" width="44" height="44" rx="3" fill="white"/>
                  <rect x="26" y="26" width="28" height="28" rx="2" fill="#1a1a1a"/>
                  {/* Top-right finder pattern */}
                  <rect x="140" y="10" width="60" height="60" rx="4" fill="#1a1a1a"/>
                  <rect x="148" y="18" width="44" height="44" rx="3" fill="white"/>
                  <rect x="156" y="26" width="28" height="28" rx="2" fill="#1a1a1a"/>
                  {/* Bottom-left finder pattern */}
                  <rect x="10" y="140" width="60" height="60" rx="4" fill="#1a1a1a"/>
                  <rect x="18" y="148" width="44" height="44" rx="3" fill="white"/>
                  <rect x="26" y="156" width="28" height="28" rx="2" fill="#1a1a1a"/>
                  {/* Data area - row by row pattern */}
                  {(() => {
                    const cells: React.ReactNode[] = [];
                    const cols = [80,87,94,101,108,115,122,129,136];
                    const rows = [80,87,94,101,108,115,122,129,136];
                    const pattern = [
                      [1,0,1,1,0,1,0,1,1],
                      [0,1,1,0,1,0,1,1,0],
                      [1,1,0,1,0,1,1,0,1],
                      [1,0,1,0,1,1,0,1,0],
                      [0,1,0,1,1,0,1,0,1],
                      [1,0,1,1,0,1,0,1,1],
                      [0,1,1,0,1,0,1,1,0],
                      [1,1,0,1,0,1,1,0,1],
                      [1,0,1,0,1,1,0,1,0],
                    ];
                    rows.forEach((y, ri) => cols.forEach((x, ci) => {
                      if (pattern[ri][ci]) cells.push(<rect key={`${ri}-${ci}`} x={x} y={y} width="5" height="5" fill="#1a1a1a"/>);
                    }));
                    return cells;
                  })()}
                  {/* Extra scattered modules */}
                  {[10,17,24,31,38,45,52,59,66,73].map((x) =>
                    [80,87,94,101,108,115,122,129,136,143,150,157,164,171,178].map((y) => {
                      const on = ((x * 3 + y * 7 + 13) % 11) < 5;
                      return on ? <rect key={`e${x}-${y}`} x={x} y={y} width="5" height="5" fill="#1a1a1a"/> : null;
                    })
                  )}
                  {[140,147,154,161,168,175,182,189].map((x) =>
                    [80,87,94,101,108,115,122,129,136,143,150,157,164,171,178].map((y) => {
                      const on = ((x * 5 + y * 3 + 7) % 13) < 6;
                      return on ? <rect key={`f${x}-${y}`} x={x} y={y} width="5" height="5" fill="#1a1a1a"/> : null;
                    })
                  )}
                  {[80,87,94,101,108,115,122,129,136].map((x) =>
                    [10,17,24,31,38,45,52,59,66,73].map((y) => {
                      const on = ((x * 2 + y * 9 + 3) % 7) < 3;
                      return on ? <rect key={`g${x}-${y}`} x={x} y={y} width="5" height="5" fill="#1a1a1a"/> : null;
                    })
                  )}
                  {[80,87,94,101,108,115,122,129,136].map((x) =>
                    [140,147,154,161,168,175,182,189].map((y) => {
                      const on = ((x * 4 + y * 6 + 5) % 9) < 4;
                      return on ? <rect key={`h${x}-${y}`} x={x} y={y} width="5" height="5" fill="#1a1a1a"/> : null;
                    })
                  )}
                  {/* Timing strips */}
                  {[80,94,108,122,136,150,164,178,192].map((x) => (
                    <rect key={`ts${x}`} x={x} y="72" width="5" height="5" fill="#1a1a1a"/>
                  ))}
                  {[80,94,108,122,136,150,164,178,192].map((y) => (
                    <rect key={`tv${y}`} x="72" y={y} width="5" height="5" fill="#1a1a1a"/>
                  ))}
                </svg>
              </div>

              {/* Code input */}
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-medium text-[#1a1a1a]">Ingresa el código que se generó</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Código de seis dígitos"
                  value={twoFACode}
                  onChange={e => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => { if (e.key === 'Enter') verify2FA(); }}
                  className="border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] w-full max-w-[480px] placeholder:text-[#9a9a98] tracking-[2px]"
                />
                {mfaSecret && (
                  <p className="text-[12px] text-[#646462]">¿No puedes escanear? Introduce esta clave manualmente: <span className="font-mono text-[#1a1a1a] select-all">{mfaSecret}</span></p>
                )}
                {mfaError && <span className="text-[13px] text-[#dc2626]">{mfaError}</span>}
                {mfaDone && <span className="text-[13px] text-[#059669]">Autenticación de dos factores activada.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NotificationsView ────────────────────────────────────────────────────────

const NOTIF_ROWS_DEFAULT: { label: string; desk: boolean; mobile: boolean; email: boolean }[] = [
  { label: "Actividad en todas las conversaciones sin asignar",                               desk: false, mobile: true,  email: false },
  { label: "Actividad en todo lo asignado a ti",                                              desk: false, mobile: true,  email: true  },
  { label: "Actividad en cualquiera de tus equipos",                                          desk: false, mobile: true,  email: false },
  { label: "Actividad en conversaciones asignadas a otros equipos o compañeros de equipo",    desk: false, mobile: true,  email: false },
  { label: "Cualquier mención de ti en una conversación",                                     desk: false, mobile: true,  email: true  },
  { label: "Actividad en las conversaciones iniciadas a partir de mensajes que enviaste",     desk: false, mobile: true,  email: false },
  { label: "Nuevas conversaciones con leads y usuarios de tu propiedad",                      desk: false, mobile: true,  email: false },
];

function NotifCheck({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={`inline-flex w-[14px] h-[14px] rounded-[3px] border flex-shrink-0 items-center justify-center cursor-pointer transition-colors ${
        checked ? 'bg-[#3b59f6] border-[#3b59f6]' : 'border-[#c9cac7] bg-white hover:border-[#9a9a98]'
      }`}
    >
      {checked && (
        <svg viewBox="0 0 10 8" className="w-[9px] h-[7px]">
          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      )}
    </span>
  );
}

export function NotificationsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  type NotifRow = { label: string; desk: boolean; mobile: boolean; email: boolean };
  const [rows, setRows] = useState<NotifRow[]>(NOTIF_ROWS_DEFAULT.map(r => ({ ...r })));
  const [siteVisit, setSiteVisit] = useState<{ desk: boolean; mobile: boolean; email: boolean }>({ desk: false, mobile: true, email: false });
  const [siteVisitMode, setSiteVisitMode] = useState<'any' | 'specific'>('any');
  const [urlFilter, setUrlFilter] = useState('');
  const [browserChecks, setBrowserChecks] = useState<Record<string, boolean>>({
    'Asignado a ti': false,
    'Sin asignar': false,
    'Asignado a cualquiera de tus equipos': false,
  });
  const [savedToast, setSavedToast] = useState(false);

  const toggleRow = (i: number, col: 'desk' | 'mobile' | 'email') => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [col]: !r[col] } : r));
  };
  const toggleSiteVisit = (col: 'desk' | 'mobile' | 'email') => {
    setSiteVisit(prev => ({ ...prev, [col]: !prev[col] }));
  };
  const toggleBrowser = (label: string) => {
    setBrowserChecks(prev => ({ ...prev, [label]: !prev[label] }));
  };
  const handleSave = () => {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const COL_W = 'w-[130px] flex-shrink-0';

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden relative">

          {/* Save toast */}
          {savedToast && (
            <div className="absolute top-4 right-4 z-10 bg-[#1a1a1a] text-white text-[13px] font-medium rounded-[8px] px-4 py-2.5 shadow-lg flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none flex-shrink-0"><path d="M3 8l3.5 3.5L13 4" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Preferencias guardadas
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-6 border-b border-[#e9eae6] h-[64px] flex-shrink-0">
            <h1 className="text-[18px] font-bold text-[#1a1a1a]">Tus preferencias de notificaciones</h1>
            <div className="flex items-center gap-3">
              <a className="text-[13px] text-[#4f52cc] flex items-center gap-1 cursor-pointer hover:opacity-70">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M3 13L13 3M9 3h4v4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Política de privacidad
              </a>
              <button
                onClick={handleSave}
                className="bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-full px-4 py-[6px] hover:bg-[#444] transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-7 py-5">
              <p className="text-[13px] text-[#646462] mb-5 leading-[1.5]">
                Recibe notificaciones sobre la actividad de las conversaciones en todos tus espacios de trabajo:
              </p>

              {/* Table */}
              <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">

                {/* Column header row */}
                <div className="flex items-stretch bg-[#fafaf8] border-b border-[#e9eae6]">
                  <div className="flex-1 px-5 py-3" />
                  {([
                    { icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><rect x="1" y="2" width="14" height="10" rx="1.5" stroke="#1a1a1a" strokeWidth="1.4"/><path d="M5 14h6M8 12v2" stroke="#1a1a1a" strokeWidth="1.4" strokeLinecap="round"/></svg>, label: 'Escritorio', sub: 'Banner en pantalla' },
                    { icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><rect x="4" y="1" width="8" height="13" rx="1.5" stroke="#1a1a1a" strokeWidth="1.4"/><circle cx="8" cy="12" r="0.7" fill="#1a1a1a"/></svg>, label: 'Móvil', sub: 'Push en el teléfono' },
                    { icon: <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="#1a1a1a" strokeWidth="1.4"/><path d="M1 6l7 4 7-4" stroke="#1a1a1a" strokeWidth="1.4"/></svg>, label: 'Email', sub: 'En tu buzón' },
                  ] as const).map(col => (
                    <div key={col.label} className={`${COL_W} px-3 py-3 border-l border-[#e9eae6] flex flex-col gap-0.5`}>
                      <div className="flex items-center gap-1.5">
                        {col.icon}
                        <span className="text-[12px] font-semibold text-[#1a1a1a]">{col.label}</span>
                      </div>
                      <span className="text-[11px] text-[#9a9a98]">{col.sub}</span>
                    </div>
                  ))}
                </div>

                {/* Regular rows */}
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center border-b border-[#e9eae6] last:border-b-0 hover:bg-[#fafaf8] transition-colors">
                    <div className="flex-1 px-5 py-3.5">
                      <span className="text-[13px] text-[#1a1a1a] leading-[1.4]">{row.label}</span>
                    </div>
                    {(['desk', 'mobile', 'email'] as const).map(col => (
                      <div key={col} className={`${COL_W} border-l border-[#e9eae6] flex items-center justify-center py-3.5`}>
                        <NotifCheck checked={row[col]} onChange={() => toggleRow(i, col)} />
                      </div>
                    ))}
                  </div>
                ))}

                {/* Site-visit row with radio sub-options */}
                <div className="flex items-start border-t border-[#e9eae6] hover:bg-[#fafaf8] transition-colors">
                  <div className="flex-1 px-5 py-3.5 flex flex-col gap-2">
                    <span className="text-[13px] text-[#1a1a1a] leading-[1.4]">
                      Los leads de cuentas que posees vuelven a visitar tu sitio web
                    </span>
                    <div className="flex flex-col gap-1.5 pl-0.5">
                      <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[#1a1a1a]">
                        <input
                          type="radio"
                          checked={siteVisitMode === 'any'}
                          onChange={() => setSiteVisitMode('any')}
                          className="accent-[#3b59f6] cursor-pointer"
                        />
                        visita cualquier página
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[#1a1a1a] flex-wrap">
                        <input
                          type="radio"
                          checked={siteVisitMode === 'specific'}
                          onChange={() => setSiteVisitMode('specific')}
                          className="accent-[#3b59f6] cursor-pointer"
                        />
                        visita una página específica y
                        <span className="border border-[#c5c7ff] rounded-[4px] px-2 py-0.5 text-[12px] text-[#4f52cc] bg-[#f0f0ff]">la URL contiene</span>
                        {siteVisitMode === 'specific' && (
                          <input
                            type="text"
                            value={urlFilter}
                            onChange={e => setUrlFilter(e.target.value)}
                            placeholder="ejemplo.com/precios"
                            className="border border-[#e9eae6] rounded-[5px] px-2 py-0.5 text-[12px] text-[#1a1a1a] outline-none focus:border-[#3b59f6] w-[160px]"
                          />
                        )}
                      </label>
                    </div>
                  </div>
                  {(['desk', 'mobile', 'email'] as const).map(col => (
                    <div key={col} className={`${COL_W} border-l border-[#e9eae6] flex items-center justify-center py-3.5`}>
                      <NotifCheck checked={siteVisit[col]} onChange={() => toggleSiteVisit(col)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Browser notifications */}
              <div className="mt-8">
                <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Notificaciones del navegador</h2>
                <p className="text-[13px] text-[#646462] mb-4 leading-[1.5]">
                  Actualiza el título de la pestaña cuando haya nueva actividad en estas conversaciones. Los cambios se aplican al recargar la página.
                </p>
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  {Object.keys(browserChecks).map((label, i, arr) => (
                    <label
                      key={label}
                      className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-[#fafaf8] transition-colors ${i < arr.length - 1 ? 'border-b border-[#e9eae6]' : ''}`}
                    >
                      <NotifCheck checked={browserChecks[label]} onChange={() => toggleBrowser(label)} />
                      <span className="text-[13px] text-[#1a1a1a]">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Email digest section */}
              <div className="mt-8 mb-6">
                <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Resumen por correo electrónico</h2>
                <p className="text-[13px] text-[#646462] mb-4 leading-[1.5]">
                  Recibe un resumen periódico con la actividad pendiente de tus conversaciones.
                </p>
                <EmailDigestSection />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailDigestSection() {
  const [freq, setFreq] = useState<'never' | 'daily' | 'weekly'>('daily');
  const options: { value: typeof freq; label: string; desc: string }[] = [
    { value: 'never',  label: 'Nunca',    desc: 'No recibir resúmenes por correo' },
    { value: 'daily',  label: 'Diario',   desc: 'Un resumen cada día laborable' },
    { value: 'weekly', label: 'Semanal',  desc: 'Un resumen cada lunes' },
  ];
  return (
    <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
      {options.map((opt, i, arr) => (
        <label
          key={opt.value}
          className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-[#fafaf8] transition-colors ${i < arr.length - 1 ? 'border-b border-[#e9eae6]' : ''}`}
        >
          <input
            type="radio"
            checked={freq === opt.value}
            onChange={() => setFreq(opt.value)}
            className="accent-[#3b59f6] cursor-pointer w-4 h-4 flex-shrink-0"
          />
          <div className="flex flex-col gap-0">
            <span className="text-[13px] font-medium text-[#1a1a1a]">{opt.label}</span>
            <span className="text-[12px] text-[#646462]">{opt.desc}</span>
          </div>
        </label>
      ))}
    </div>
  );
}

// ── VisibleView ───────────────────────────────────────────────────────────────

export function VisibleView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'empresas' | 'personas' | 'etiquetas'>('empresas');
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'empresas',  label: 'Segmentos de empresas' },
    { id: 'personas',  label: 'Segmentos de personas' },
    { id: 'etiquetas', label: 'Etiquetas' },
  ];
  const rows = [
    { name: 'Active', by: 'Segmento predeterminado', created: '1 hora atrás', canHide: true },
    { name: 'New',    by: 'Segmento predeterminado', created: '1 hora atrás', canHide: true },
    { name: 'All',    by: 'Segmento predeterminado', created: '',             canHide: false },
  ];
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="px-8 pt-6 pb-0 flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a] mb-4">Visible para ti</h1>
            <div className="flex gap-0 border-b border-[#e9eae6]">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 pb-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                    tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-4">
            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Visible</p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#e9eae6]">
                  <th className="text-left py-2 pr-4 font-semibold text-[#1a1a1a]">Nombre del segmento</th>
                  <th className="text-left py-2 pr-4 font-semibold text-[#1a1a1a]">Creado por</th>
                  <th className="text-left py-2 pr-4 font-semibold text-[#1a1a1a]">Creado</th>
                  <th className="text-left py-2 font-semibold text-[#1a1a1a]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.name} className="border-b border-[#e9eae6]">
                    <td className="py-3 pr-4 text-[#1a1a1a]">{row.name}</td>
                    <td className="py-3 pr-4 text-[#646462]">{row.by}</td>
                    <td className="py-3 pr-4 text-[#646462]">{row.created}</td>
                    <td className="py-3">
                      {row.canHide && <button className="text-[#d97706] text-[13px] font-medium hover:underline">Ocultar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TokensView ────────────────────────────────────────────────────────────────

interface ApiTokenItem { id: string; name: string; token: string; createdAt: string; lastUsed: string | null; scopes: string[]; }

export function TokensView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: ws } = useApi(() => workspacesApi.currentContext(), [], null);
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newlyCreated, setNewlyCreated] = useState<ApiTokenItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!ws) return;
    const saved = (ws as any)?.settings?.apiTokens ?? [];
    setTokens(saved);
  }, [ws]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  function generateToken() {
    return 'clain_' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function createToken() {
    if (!newName.trim()) return;
    const token: ApiTokenItem = { id: Date.now().toString(), name: newName.trim(), token: generateToken(), createdAt: new Date().toISOString(), lastUsed: null, scopes: ['read', 'write'] };
    const updated = [...tokens, token];
    const wsId = (ws as any)?.id ?? '';
    if (wsId) await workspacesApi.updateSettings(wsId, { apiTokens: updated }).catch(() => {});
    setTokens(updated);
    setNewlyCreated(token);
    setShowCreate(false);
    setNewName('');
  }

  async function revokeToken(id: string) {
    const updated = tokens.filter(t => t.id !== id);
    const wsId = (ws as any)?.id ?? '';
    if (wsId) await workspacesApi.updateSettings(wsId, { apiTokens: updated }).catch(() => {});
    setTokens(updated);
    if (newlyCreated?.id === id) setNewlyCreated(null);
    showToast('Token revocado');
  }

  function copyToken(token: string, id: string) {
    navigator.clipboard.writeText(token).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); }).catch(() => {});
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Tokens de API</h1>
            <div className="flex items-center gap-3">
              {toast && <span className="text-[13px] text-[#16a34a] font-medium">✓ {toast}</span>}
              <button onClick={() => setShowCreate(true)} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nuevo token</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-5 flex flex-col gap-4">
            {/* Info banner */}
            <div className="flex items-start gap-3 bg-[#eff6ff] border border-[#dbeafe] rounded-[8px] px-4 py-3">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#3b82f6] mt-0.5 flex-shrink-0"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 4a1 1 0 110 2 1 1 0 010-2zm0 4a1 1 0 011 1v3a1 1 0 01-2 0V9a1 1 0 011-1z"/></svg>
              <p className="text-[13px] text-[#1d4ed8]">Los tokens de API te permiten autenticarte con la API REST de Clain. Trátalos como contraseñas — guárdalos en un lugar seguro.</p>
            </div>

            {/* Newly created token — show once */}
            {newlyCreated && (
              <div className="border border-[#bbf7d0] rounded-[12px] p-4 bg-[#f0fdf4]">
                <div className="flex items-start gap-2 mb-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#16a34a] mt-0.5 flex-shrink-0"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zM6.7 11.3L3.4 8l1.4-1.4L6.7 8.5l4.5-4.5 1.4 1.4z"/></svg>
                  <div>
                    <p className="text-[13px] font-semibold text-[#166534]">Token creado: <span className="font-normal">{newlyCreated.name}</span></p>
                    <p className="text-[12px] text-[#166534] mt-0.5">Copia este token ahora — no podrás verlo de nuevo.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white border border-[#86efac] rounded-[8px] px-3 py-2">
                  <code className="flex-1 text-[12px] font-mono text-[#1a1a1a] break-all">{newlyCreated.token}</code>
                  <button onClick={() => copyToken(newlyCreated.token, newlyCreated.id)} className="flex-shrink-0 border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[12px] font-medium hover:bg-[#f8f8f7]">
                    {copiedId === newlyCreated.id ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Token table */}
            {tokens.length > 0 ? (
              <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-[#fafaf9]">
                    <tr>
                      {['Nombre', 'Token', 'Creado', 'Último uso', 'Permisos', ''].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 font-medium text-[#646462] text-[12px] border-b border-[#e9eae6]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e9eae6]">
                    {tokens.map(t => (
                      <tr key={t.id} className="hover:bg-[#fafaf9]">
                        <td className="px-4 py-3 font-medium text-[#1a1a1a]">{t.name}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="text-[12px] font-mono text-[#646462]">
                              {revealedId === t.id ? t.token.slice(0, 20) + '…' : t.token.slice(0, 10) + '••••••••••'}
                            </code>
                            <button onClick={() => setRevealedId(id => id === t.id ? null : t.id)} className="text-[11px] text-[#3b59f6] hover:underline">{revealedId === t.id ? 'Ocultar' : 'Ver'}</button>
                            <button onClick={() => copyToken(t.token, t.id)} className="text-[11px] text-[#646462] hover:text-[#1a1a1a]">{copiedId === t.id ? '✓' : '📋'}</button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#646462]">{new Date(t.createdAt).toLocaleDateString('es-ES')}</td>
                        <td className="px-4 py-3 text-[#646462]">{t.lastUsed ? new Date(t.lastUsed).toLocaleDateString('es-ES') : 'Nunca'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {t.scopes.map(s => <span key={s} className="bg-[#f1f1ee] rounded-full px-2 py-0.5 text-[11px] text-[#646462]">{s}</span>)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => revokeToken(t.id)} className="text-[12px] text-[#b91c1c] hover:underline">Revocar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !newlyCreated && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <svg viewBox="0 0 48 48" className="w-12 h-12 fill-none stroke-[#ccc]" strokeWidth="2">
                    <path d="M30 10l8 8-20 20-10 2 2-10 20-20z"/><path d="M26 14l8 8"/>
                  </svg>
                  <h2 className="text-[17px] font-semibold text-[#1a1a1a]">Sin tokens de API</h2>
                  <p className="text-[13px] text-[#646462]">Crea un token para acceder a tus datos a través de la API REST de Clain.</p>
                  <button onClick={() => setShowCreate(true)} className="mt-2 bg-[#1a1a1a] text-white rounded-full px-5 py-[9px] text-[13px] font-semibold hover:bg-[#444]">+ Crear token de API</button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Create token modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[420px] flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-[16px] font-bold text-[#1a1a1a]">Crear token de API</h2>
            <div>
              <label className="block text-[12px] font-medium text-[#646462] mb-1">Nombre del token *</label>
              <input autoFocus className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]" placeholder="Mi integración, Script de exportación…" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createToken()} />
            </div>
            <div className="bg-[#fef3c7] border border-[#fde68a] rounded-[8px] px-3 py-2 text-[12px] text-[#92400e]">
              ⚠ El token solo se mostrará una vez al crearlo. Cópialo y guárdalo en un lugar seguro.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowCreate(false)} className="border border-[#e9eae6] rounded-lg px-4 py-2 text-[13px] font-medium text-[#646462] hover:bg-[#f8f8f7]">Cancelar</button>
              <button onClick={createToken} disabled={!newName.trim()} className="bg-[#1a1a1a] text-white rounded-lg px-4 py-2 text-[13px] font-semibold hover:bg-[#333] disabled:opacity-50">Crear token</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AccountAccessView ─────────────────────────────────────────────────────────

export function AccountAccessView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="px-8 pt-6 pb-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Acceso a la cuenta</h1>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6 flex flex-col gap-0">
            <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">Dar acceso a Intercom a tu cuenta</h2>
            <p className="text-[13px] text-[#646462] leading-relaxed mb-5">
              Es posible que necesitemos acceso temporal a tu cuenta para diagnosticar y resolver tu problema de soporte.
              Esto dará a Intercom acceso a todos tus espacios de trabajo durante 14 días, después de lo cual el acceso
              vencerá automáticamente. También puedes revocar manualmente el acceso en cualquier momento.
            </p>
            <button className="bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-full px-5 py-[9px] self-start hover:bg-[#444] mb-6">
              Aprobar acceso a Intercom
            </button>
            <div className="border-t border-[#e9eae6] pt-6">
              <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">Historial de aprobación de acceso de Intercom</h2>
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <svg viewBox="0 0 48 48" className="w-12 h-12 fill-none stroke-[#ccc]" strokeWidth="2">
                  <rect x="6" y="6" width="36" height="10" rx="2"/>
                  <rect x="6" y="20" width="36" height="10" rx="2"/>
                  <rect x="6" y="34" width="36" height="10" rx="2"/>
                </svg>
                <p className="text-[14px] text-[#646462]">Sin historial</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MultilingualView ──────────────────────────────────────────────────────────

export function MultilingualView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: ws } = useApi(() => workspacesApi.currentContext(), [], null);
  const [aiTranslate, setAiTranslate] = useState(false);
  const [myLang, setMyLang] = useState('Español');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!ws) return;
    const s = (ws as any)?.settings ?? {};
    if (s.personalAiTranslate !== undefined) setAiTranslate(!!s.personalAiTranslate);
    if (s.personalLang) setMyLang(s.personalLang);
  }, [ws]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  async function save(key: string, value: unknown) {
    const wsId = (ws as any)?.id ?? '';
    if (!wsId) return;
    try { await workspacesApi.updateSettings(wsId, { [key]: value }); showToast('Preferencia guardada'); } catch { /* silent */ }
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-8 pt-6 pb-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Multilingüe</h1>
            {toast && <span className="text-[13px] text-[#16a34a] font-medium">✓ {toast}</span>}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6 flex flex-col gap-6">
            {/* General section */}
            <div>
              <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">General</h2>
              <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-start justify-between gap-6">
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Ajustes de traducción de IA</p>
                  <p className="text-[13px] text-[#646462] leading-relaxed">
                    Traduzca automáticamente las respuestas de los clientes al idioma predeterminado de su espacio de trabajo en el buzón, y sus respuestas al idioma del cliente en todos los canales para mantener conversaciones fluidas.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
                  <span className="text-[13px] text-[#1a1a1a] whitespace-nowrap">Habilitar la traducción de IA para el buzón</span>
                  <button
                    onClick={() => { setAiTranslate(v => { save('personalAiTranslate', !v); return !v; }); }}
                    style={{
                      width: 36, height: 20, borderRadius: 10, position: 'relative',
                      flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0,
                      background: aiTranslate ? '#f97316' : '#d1d5db',
                      transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                      background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s',
                      left: aiTranslate ? 18 : 2,
                    }} />
                  </button>
                </div>
              </div>
            </div>
            {/* Preferencias de idioma section */}
            <div>
              <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">Preferencias de idioma</h2>
              <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-start justify-between gap-6">
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Su idioma</p>
                  <p className="text-[13px] text-[#646462] leading-relaxed">
                    Traduciremos las conversaciones del buzón a este idioma. Responda siempre en el idioma en que se muestra la conversación.
                  </p>
                </div>
                <div className="flex-shrink-0 pt-0.5 w-[200px]">
                  <SettingsSelect
                    value={myLang}
                    onChange={v => { setMyLang(v); save('personalLang', v); }}
                    options={[
                      { value: 'English',    label: '🇬🇧  English' },
                      { value: 'Español',    label: '🇪🇸  Español' },
                      { value: 'Français',   label: '🇫🇷  Français' },
                      { value: 'Deutsch',    label: '🇩🇪  Deutsch' },
                      { value: 'Português',  label: '🇵🇹  Português' },
                      { value: 'Italiano',   label: '🇮🇹  Italiano' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared: Inbox/Helpdesk promo card ────────────────────────────────────────

function SettingsPromoCard({ title, description, primaryBtn, secondaryBtn, imageSlot }: {
  title: string;
  description: string;
  primaryBtn: string;
  secondaryBtn: string;
  imageSlot?: React.ReactNode;
}) {
  return (
    <div className="relative bg-[#f5f5f4] rounded-[12px] px-8 py-6 flex gap-6 overflow-hidden flex-shrink-0 mx-6 mt-6">
      <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#e5e5e3]">
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="#646462" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <div className="flex flex-col justify-center gap-3 flex-1 max-w-[500px] py-4">
        <h2 className="text-[18px] font-bold text-[#1a1a1a] leading-tight">{title}</h2>
        <p className="text-[13px] text-[#646462] leading-relaxed">{description}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="bg-[#7c3aed] text-white text-[13px] font-semibold rounded-full px-4 py-[7px] flex items-center gap-1.5 hover:bg-[#6d28d9]">
            <span>⊕</span> {primaryBtn}
          </button>
          <a className="text-[13px] text-[#4f52cc] flex items-center gap-1.5 cursor-pointer font-medium">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5">
              <rect x="2" y="4" width="12" height="9" rx="1.5"/><rect x="5" y="1" width="6" height="4" rx="1"/>
            </svg>
            {secondaryBtn}
          </a>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center min-w-0">
        {imageSlot ?? (
          <div className="w-full h-[160px] bg-[#e8e4f5] rounded-[8px] opacity-60" />
        )}
      </div>
    </div>
  );
}

// ── AssignmentsView ───────────────────────────────────────────────────────────

// ── AssignmentsGeneralTab (1-70140 / 1-71522): 8 sub-sections ─────────────────
function AssignmentsGeneralTab() {
  const { data: wsCtx } = useApi(() => workspacesApi.currentContext(), [], null);
  const [autoAssign, setAutoAssign] = useState<'self' | 'keep'>('self');
  const [presence, setPresence] = useState(true);
  const [obligatorio, setObligatorio] = useState(false);
  const [reasignAct, setReasignAct] = useState(false);
  const [reasignFar, setReasignFar] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate from workspace settings once loaded
  useEffect(() => {
    if (!wsCtx?.settings) return;
    const s = wsCtx.settings;
    if (s.auto_assign_on_reply)         setAutoAssign(s.auto_assign_on_reply as 'self' | 'keep');
    if (s.show_teammate_presence !== undefined) setPresence(!!s.show_teammate_presence);
    if (s.away_reason_required   !== undefined) setObligatorio(!!s.away_reason_required);
    if (s.reassign_on_capacity   !== undefined) setReasignAct(!!s.reassign_on_capacity);
    if (s.reassign_on_away       !== undefined) setReasignFar(!!s.reassign_on_away);
  }, [wsCtx]);

  async function persist(patch: Record<string, unknown>) {
    if (!wsCtx?.id) return;
    setSaving(true);
    try { await workspacesApi.updateSettings(wsCtx.id, patch); }
    catch { /* best-effort */ }
    finally { setSaving(false); }
  }

  function toggle<T>(setter: React.Dispatch<React.SetStateAction<T>>, key: string, current: T, next: T) {
    setter(next);
    persist({ [key]: next });
  }

  return (
    <div className="px-6 py-6">
      {/* Promo card "Asegúrate de que las conversaciones lleguen al miembro adecuado" */}
      <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
        <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
        <div className="flex-1 max-w-[500px]">
          <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Asegúrate de que las conversaciones lleguen al miembro de equipo adecuado</h2>
          <p className="text-[13px] text-[#646462] mb-4">Usa las reglas de asignación para enviar conversaciones a las personas correctas según la disponibilidad y la carga de trabajo. Fin AI Agent puede encargarse de las preguntas comunes y pasar cualquier cosa que no pueda administrar.</p>
          <div className="flex items-center gap-4 flex-wrap">
            <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">⚙ Configurar asignaciones</button>
            <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Gestión de carga de trabajo explicada</button>
            <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">👥 Administrar los permisos del equipo</button>
          </div>
        </div>
        <div className="w-[280px] h-[180px] flex-shrink-0 rounded-[8px] bg-[#f3f0ff] border border-[#e0d7ff] p-3 flex flex-col gap-1">
          <p className="text-[11px] font-semibold text-[#1a1a1a] mb-1">Assign</p>
          {['Geraldine Cordero', 'Jacob Antinoff', 'Noah Bennett'].map(n => (
            <div key={n} className="flex items-center gap-1.5 bg-white rounded-[6px] px-2 py-1.5"><span className="text-[10px] text-[#646462]">Assign to</span><span className="text-[10px] text-[#1a1a1a]">{n}</span></div>
          ))}
        </div>
      </div>

      {/* Persona asignada por defecto */}
      <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-3">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Persona asignada por defecto</h3>
          <p className="text-[13px] text-[#646462]">Si un flujo de trabajo no asigna una nueva conversación entrante, se asignará a este buzón del equipo predeterminado o compañero de equipo.</p>
        </div>
        <div className="w-[300px] flex-shrink-0">
          <p className="text-[13px] text-[#1a1a1a] mb-1">Selecciona un buzón del equipo o un compañero de equipo</p>
          <select className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] bg-white"><option>👤 Unassigned</option></select>
        </div>
      </div>

      {/* Autoasignar por respuesta */}
      <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-3">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Autoasignar por respuesta</h3>
          <p className="text-[13px] text-[#646462]">Elige qué sucede cuando respondes a una conversación que no está asignada o que está asignada a un buzón de equipo. <a href="#" className="text-[#3b59f6] underline">Política de privacidad</a></p>
        </div>
        <div className="w-[400px] flex flex-col gap-2 flex-shrink-0">
          {[
            { id: 'self' as const, label: 'Asígnamela' },
            { id: 'keep' as const, label: 'Mantener sin asignar o asignada al buzón de equipo' },
          ].map(o => (
            <label key={o.id} onClick={() => { setAutoAssign(o.id); persist({ auto_assign_on_reply: o.id }); }} className="flex items-center gap-3 cursor-pointer">
              <div className={`w-4 h-4 rounded-full border-2 ${autoAssign === o.id ? 'border-[#3b59f6]' : 'border-[#ccc]'} flex items-center justify-center`}>
                {autoAssign === o.id && <div className="w-2 h-2 rounded-full bg-[#3b59f6]"/>}
              </div>
              <span className="text-[13px] text-[#1a1a1a]">{o.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Presencia de compañeros */}
      <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-3">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Presencia de compañeros de equipo</h3>
          <p className="text-[13px] text-[#646462] mb-3">Ve si otro compañero está viendo una conversación o un folio de atención. Esto evita la duplicación del trabajo y ayuda al equipo a colaborar.</p>
        </div>
        <div className="w-[400px] flex flex-col gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => toggle(setPresence, 'show_teammate_presence', presence, !presence)} className={`w-8 h-[18px] rounded-full relative ${presence ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}><div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${presence ? 'right-0.5' : 'left-0.5'}`}/></button>
            <span className="text-[13px] text-[#1a1a1a]">Mostrar presencia de compañeros de equipo</span>
          </div>
          <div className="bg-[#fafaf9] border border-[#e9eae6] rounded-[8px] p-3">
            <div className="flex items-center justify-between mb-2"><span className="text-[12px] font-semibold text-[#1a1a1a]">Luis Easton</span><span className="bg-[#1a1a1a] text-white text-[10px] px-2 py-0.5 rounded">⊙ Cerrar</span></div>
            <p className="text-[11px] text-[#646462] mb-2">Jack Smith is looking</p>
            <div className="bg-white border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[11px] text-[#1a1a1a]">Hello, I have a question</div>
          </div>
        </div>
      </div>

      {/* Asigna conversaciones a Fin AI Agent */}
      <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-3">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Asigna conversaciones a Fin AI Agent</h3>
          <p className="text-[13px] text-[#646462]">Usa flujos de trabajo para etiquetar y asignar automáticamente conversaciones a Fin, de modo que responda las preguntas comunes antes de transferirlas. <a href="#" className="text-[#3b59f6] underline">Configurar en flujos de trabajo</a></p>
        </div>
        <div className="w-[400px] flex-shrink-0 bg-[#fafaf9] border border-[#e9eae6] rounded-[8px] p-3 text-[11px] text-[#646462]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-[#fef3c7] flex items-center justify-center text-[12px]">⚙</div>
            <span>Customer sends their first message</span>
          </div>
          <div className="bg-white border border-[#e9eae6] rounded-[6px] p-2 mb-1">▦ Branches → Customer is asking billing</div>
          <div className="bg-white border border-[#e9eae6] rounded-[6px] p-2 mb-1">📨 Assign to → Billing Team</div>
          <div className="bg-white border border-[#e9eae6] rounded-[6px] p-2">📨 Assign to → Support Team</div>
        </div>
      </div>

      {/* Modo Ausente automático */}
      <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-3">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Modo Ausente automático</h3>
          <p className="text-[13px] text-[#646462] mb-3">Cambiar automáticamente el estado de un compañero de equipo después de un período de inactividad. El temporizador de inactividad se inicia cuando Intercom no es la pestaña activa del navegador, la pantalla está apagada, la computadora está en reposo o apagada.</p>
          <button className="bg-[#7c3aed] text-white rounded-full px-3 py-1.5 text-[12px] font-medium hover:bg-[#6d28d9] flex items-center gap-1.5"><span>⚡</span>Get the feature</button>
        </div>
        <div className="w-[300px] flex-shrink-0 bg-white border border-[#e9eae6] rounded-[8px] p-3">
          <div className="flex items-center gap-2 mb-3"><div className="w-7 h-7 rounded-full bg-[#fce7f3] flex items-center justify-center text-[12px]">CF</div><span className="text-[12px] font-semibold text-[#1a1a1a]">Carla Fité</span></div>
          <div className="flex items-center gap-2 mb-2"><div className="w-8 h-[18px] rounded-full bg-[#f97316] relative"><div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-white"/></div><span className="text-[12px] text-[#1a1a1a]">Set as away</span></div>
          <div className="flex items-center gap-2 mb-2"><div className="w-8 h-[18px] rounded-full bg-[#e9eae6] relative"><div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white"/></div><span className="text-[12px] text-[#1a1a1a]">Reassign replies</span></div>
          <div className="text-[11px] text-[#646462]">Add reason</div>
        </div>
      </div>

      {/* Motivos de ausencia */}
      <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-3">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Motivos de ausencia</h3>
          <p className="text-[13px] text-[#646462]">Personaliza los motivos que los compañeros de equipo pueden elegir al configurar su estado como "ausente", y decide si es obligatorio elegir uno.</p>
        </div>
        <div className="w-[400px] flex flex-col gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => toggle(setObligatorio, 'away_reason_required', obligatorio, !obligatorio)} className={`w-8 h-[18px] rounded-full relative ${obligatorio ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}><div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${obligatorio ? 'right-0.5' : 'left-0.5'}`}/></button>
            <span className="text-[13px] text-[#1a1a1a]">Hacer que los motivos de ausencia sean obligatorios</span>
          </div>
          <button className="text-[13px] text-[#3b59f6] hover:underline text-left">Personalice los motivos de ausencia ›</button>
        </div>
      </div>

      {/* Reasignar conversaciones sin pausar */}
      <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
        <div className="flex-1">
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Reasignar conversaciones sin pausar</h3>
          <p className="text-[13px] text-[#646462]">Cuando se reactive una conversación y el agente asignado haya alcanzado su capacidad máxima o esté ausente, se marcará automáticamente como no asignada y volverá a la bandeja de entrada del equipo.</p>
        </div>
        <div className="w-[400px] flex flex-col gap-3 flex-shrink-0">
          <div className="flex items-start gap-2">
            <button onClick={() => toggle(setReasignAct, 'reassign_on_capacity', reasignAct, !reasignAct)} className={`w-8 h-[18px] rounded-full relative mt-0.5 flex-shrink-0 ${reasignAct ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}><div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${reasignAct ? 'right-0.5' : 'left-0.5'}`}/></button>
            <span className="text-[12px] text-[#1a1a1a]">Reasignar automáticamente las conversaciones activas cuando los miembros del equipo hayan alcanzado su capacidad máxima.</span>
          </div>
          <div className="flex items-start gap-2">
            <button onClick={() => toggle(setReasignFar, 'reassign_on_away', reasignFar, !reasignFar)} className={`w-8 h-[18px] rounded-full relative mt-0.5 flex-shrink-0 ${reasignFar ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}><div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${reasignFar ? 'right-0.5' : 'left-0.5'}`}/></button>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-[12px] text-[#1a1a1a]">Reasignar automáticamente las conversaciones activas cuando los miembros del equipo estén</span>
              <select className="border border-[#e9eae6] rounded-[6px] px-2 py-1 text-[12px] ml-2"><option>Lejos</option></select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssignmentsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'general' | 'workload' | 'limits'>('workload');
  const tabs = [
    { id: 'general'  as const, label: 'General' },
    { id: 'workload' as const, label: 'Gestión de la carga de trabajo' },
    { id: 'limits'   as const, label: 'Límite de asignación de compañeros de equipo' },
  ];
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Asignaciones</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5">
                <path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/>
              </svg>
              Aprender
            </button>
          </div>
          {/* Tabs */}
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'workload' && (
              <SettingsPromoCard
                title="Mantén el control con la gestión de la carga de trabajo"
                description="Agiliza la carga de trabajo de tu equipo con funciones de asignación inteligente. Controla qué conversaciones van a dónde, establece límites de asignación y más."
                primaryBtn="Get the feature"
                secondaryBtn="Gestión de carga de trabajo"
                imageSlot={
                  <div className="w-full h-[160px] rounded-[8px] bg-gradient-to-br from-[#e8e4f5] to-[#d4d0ea] flex items-center justify-center opacity-80">
                    <div className="text-[12px] text-[#7c3aed] font-medium">Assignment Logic diagram</div>
                  </div>
                }
              />
            )}
            {tab === 'limits' && (
              <SettingsPromoCard
                title="A la medida de cada compañero"
                description="Dale a cada compañero de equipo buzones principales en los que concentrarse. O establece límites de asignación individuales, para que las cargas de trabajo siempre se compartan de manera eficiente."
                primaryBtn="Get the feature"
                secondaryBtn="Límite de asignación de compañeros de equipo"
                imageSlot={
                  <div className="w-full h-[160px] rounded-[8px] bg-gradient-to-br from-[#fce7f3] to-[#f0abcc] flex items-center justify-center opacity-80">
                    <div className="text-[12px] text-[#9d174d] font-medium">Assignment limits table</div>
                  </div>
                }
              />
            )}
            {tab === 'general' && <AssignmentsGeneralTab key="assignments-general" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MacrosView ────────────────────────────────────────────────────────────────

const macrosList = [
  { id: '1', emoji: '✅', label: 'Close conversation [Example]', active: true },
  { id: '2', emoji: '🐞', label: 'Bug report [Example]', active: false },
  { id: '3', emoji: '💵', label: 'Billing [Example]', active: false },
  { id: '4', emoji: '',   label: 'Feature Request [Example]', active: false },
];

export function MacrosView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: macros, loading: macrosLoading, refetch: refetchMacros } = useApi(() => macrosApi.list(), [], []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Only fall back to demo rows when the API genuinely returned nothing. Once
  // real macros exist we drive the whole view (list + detail) from them.
  const isReal = macros.length > 0;
  const list = isReal ? macros : macrosList;
  const effectiveId = selectedId ?? list[0]?.id ?? '1';
  const macro = list.find((m: any) => m.id === effectiveId) ?? list[0];

  // Editable body — kept in sync with the selected macro. Save/Duplicate/New
  // are all wired to the real macros API (create/update).
  const [bodyDraft, setBodyDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'new' | 'dup'>(null);
  useEffect(() => {
    setBodyDraft(macro?.body ?? '');
    setLabelDraft(macro?.label ?? '');
  }, [effectiveId, macro?.body, macro?.label]);
  const dirty = isReal && macro && (bodyDraft !== (macro.body ?? '') || labelDraft !== (macro.label ?? ''));

  async function handleDelete() {
    if (!isReal || !macro?.id || deleting) return;
    setDeleting(true);
    try {
      await macrosApi.delete(macro.id);
      setSelectedId(null);   // fall back to first remaining macro
      refetchMacros();
    } catch {
      /* surfaced by the global error banner; keep the row on failure */
    } finally {
      setDeleting(false);
    }
  }
  async function handleSave() {
    if (!isReal || !macro?.id || !dirty || busy) return;
    setBusy('save');
    try {
      await macrosApi.update(macro.id, { label: labelDraft.trim() || 'Sin título', body: bodyDraft });
      refetchMacros();
    } catch { /* global banner */ } finally { setBusy(null); }
  }
  async function handleNew() {
    if (busy) return;
    setBusy('new');
    try {
      const created: any = await macrosApi.create({ label: 'Nueva macro', body: '' });
      refetchMacros();
      if (created?.id) setSelectedId(created.id);
    } catch { /* global banner */ } finally { setBusy(null); }
  }
  async function handleDuplicate() {
    if (!isReal || !macro || busy) return;
    setBusy('dup');
    try {
      const created: any = await macrosApi.create({
        label: `${macro.label ?? 'Macro'} (copia)`,
        body: macro.body ?? '',
        shortcut: macro.shortcut ?? undefined,
        shared: !!macro.shared,
      });
      refetchMacros();
      if (created?.id) setSelectedId(created.id);
    } catch { /* global banner */ } finally { setBusy(null); }
  }
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Macros</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/></svg>
                Aprender
              </button>
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 15V1M3 10l5 5 5-5"/></svg>
                Exportar
              </button>
              <button onClick={handleNew} disabled={busy === 'new'} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] disabled:opacity-40">
                {busy === 'new' ? 'Creando…' : '+ Nueva macro'}
              </button>
            </div>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <SettingsPromoCard
              title="Crea macros para ahorrar tiempo en tareas repetitivas en el buzón"
              description="Agiliza tu flujo de trabajo con acciones personalizables y fáciles de repetir. Reduce el tiempo que tu equipo dedica a escribir respuestas repetitivas, asignar conversaciones, etiquetar, posponer y más."
              primaryBtn="+ Nueva macro"
              secondaryBtn="Hacer un recorrido"
              imageSlot={
                <div className="w-full h-[160px] rounded-[8px] bg-gradient-to-br from-[#e0f2fe] to-[#b0d9f5] flex items-center justify-center opacity-80">
                  <div className="text-[12px] text-[#0369a1] font-medium">Macros editor preview</div>
                </div>
              }
            />
            {/* Search */}
            <div className="px-6 pt-4 pb-2 flex-shrink-0">
              <div className="flex items-center border border-[#e9eae6] rounded-[8px] px-3 py-2 gap-2 bg-[#f8f8f7]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>
                <span className="text-[13px] text-[#9a9a98]">Buscar macros...</span>
              </div>
            </div>
            {/* 2-panel layout */}
            <div className="flex flex-1 min-h-0 mx-6 mb-4 border border-[#e9eae6] rounded-[8px] overflow-hidden">
              {/* List panel */}
              <div className="w-[350px] flex-shrink-0 border-r border-[#e9eae6] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#e9eae6]">
                  <button className="flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a1a]">
                    Filtrar por
                    <svg viewBox="0 0 10 6" className="w-2.5 h-2.5 fill-[#646462]"><path d="M0 0l5 6 5-6z"/></svg>
                  </button>
                  <span className="text-[13px] text-[#646462]">{macrosLoading ? '…' : `${list.length} macros`}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-2 text-[12px] font-semibold text-[#646462] uppercase tracking-wide">Macros compartidas</div>
                  {list.map((m: any) => (
                    <button key={m.id} onClick={() => setSelectedId(m.id)}
                      className={`w-full px-4 py-3 text-left text-[13px] border-b border-[#e9eae6] flex items-center gap-2 ${
                        effectiveId === m.id ? 'bg-[#f0efff] text-[#1a1a1a] font-medium' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                      }`}>
                      {m.emoji && <span>{m.emoji}</span>}
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Detail panel */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a]">{macro.emoji ? `${macro.emoji} ` : ''}{macro.label}</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={!isReal || deleting}
                      className="text-[13px] text-[#dc2626] font-medium border border-[#e9eae6] rounded-full px-3 py-[5px] hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                      {deleting ? 'Borrando…' : 'Borrar macro'}
                    </button>
                    <button
                      onClick={handleDuplicate}
                      disabled={!isReal || busy === 'dup'}
                      className="text-[13px] font-medium border border-[#e9eae6] rounded-full px-3 py-[5px] hover:bg-[#f5f5f4] disabled:opacity-40">
                      {busy === 'dup' ? 'Duplicando…' : 'Duplicar'}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!dirty || busy === 'save'}
                      className="text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full px-4 py-[5px] hover:bg-[#444] disabled:opacity-40">
                      {busy === 'save' ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
                <p className="px-6 py-2 text-[12px] text-[#646462] flex-shrink-0">
                  {macro.shared ? 'Compartida con el equipo' : 'Macro privada'}
                  {typeof macro.usage_count === 'number'
                    ? ` · ${macro.usage_count === 0 ? 'Todavía no se ha usado' : `Usada ${macro.usage_count} ${macro.usage_count === 1 ? 'vez' : 'veces'}`}`
                    : ''}
                  {macro.shortcut ? ` · Atajo: ${macro.shortcut}` : ''}
                </p>
                <div className="flex-1 overflow-y-auto px-6 py-3 flex flex-col gap-2">
                  <input
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    disabled={!isReal}
                    placeholder="Nombre de la macro"
                    className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] font-medium text-[#1a1a1a] outline-none focus:border-[#1a1a1a] disabled:bg-[#f8f8f7]"
                  />
                  <textarea
                    value={bodyDraft}
                    onChange={(e) => setBodyDraft(e.target.value)}
                    disabled={!isReal}
                    placeholder={isReal ? 'Escribe el contenido de la macro…' : 'Crea una macro para editar su contenido.'}
                    className="border border-[#e9eae6] rounded-[8px] p-4 text-[13px] text-[#1a1a1a] min-h-[160px] flex-1 outline-none focus:border-[#1a1a1a] resize-none disabled:bg-[#f8f8f7]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TicketsView ───────────────────────────────────────────────────────────────

export function TicketsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'tipos' | 'estados' | 'portal'>('tipos');
  const tabs = [
    { id: 'tipos'   as const, label: 'Tipos de folios de atención' },
    { id: 'estados' as const, label: 'Estados del folio de atención' },
    { id: 'portal'  as const, label: 'Portal de folios de atención' },
  ];
  // Ticket types — real backend (ticketTypesApi). Grouped by category in the UI.
  const { data: ticketTypes = [], refetch: refetchTypes } = useApi<any[]>(() => ticketTypesApi.list(), [], []);
  const [ttDeletingId, setTtDeletingId] = useState<string | null>(null);
  const typesByCat = (cat: string) => (ticketTypes || []).filter((t: any) => (t.category || 'customer') === cat);
  async function createTicketType(category: 'customer' | 'follow_up' | 'back_office') {
    const name = window.prompt('Nombre del tipo de folio de atención');
    if (!name || !name.trim()) return;
    try { await ticketTypesApi.create({ name: name.trim(), category, icon: '🎫' }); refetchTypes(); }
    catch { /* global banner */ }
  }
  async function deleteTicketType(id: string) {
    if (ttDeletingId) return;
    setTtDeletingId(id);
    try { await ticketTypesApi.delete(id); refetchTypes(); }
    catch { /* global banner */ } finally { setTtDeletingId(null); }
  }
  // Ticket states — real backend (ticketStatesApi), grouped by lifecycle category.
  const { data: ticketStates = [], refetch: refetchStates } = useApi<any[]>(() => ticketStatesApi.list(), [], []);
  const [tsDeletingId, setTsDeletingId] = useState<string | null>(null);
  const STATE_CATS: { key: 'submitted' | 'in_progress' | 'waiting_customer' | 'resolved'; label: string; color: string }[] = [
    { key: 'submitted',        label: 'Enviado',              color: '#3b82f6' },
    { key: 'in_progress',      label: 'En curso',             color: '#f97316' },
    { key: 'waiting_customer', label: 'Esperando al cliente', color: '#eab308' },
    { key: 'resolved',         label: 'Resuelto',             color: '#22c55e' },
  ];
  const statesByCat = (cat: string) => (ticketStates || []).filter((s: any) => (s.category || 'in_progress') === cat);
  async function createTicketState(category: 'submitted' | 'in_progress' | 'waiting_customer' | 'resolved', color: string) {
    const internal = window.prompt('Etiqueta interna del estado');
    if (!internal || !internal.trim()) return;
    const client = window.prompt('Etiqueta visible para el cliente (opcional)', internal.trim()) || internal.trim();
    try { await ticketStatesApi.create({ internal_label: internal.trim(), client_label: client, category, color }); refetchStates(); }
    catch { /* global banner */ }
  }
  async function deleteTicketState(id: string) {
    if (tsDeletingId) return;
    setTsDeletingId(id);
    try { await ticketStatesApi.delete(id); refetchStates(); }
    catch { /* global banner */ } finally { setTsDeletingId(null); }
  }
  const typeName = (id: string) => (ticketTypes || []).find((t: any) => String(t.id) === String(id))?.name ?? '';
  async function toggleStateType(state: any, typeId: string) {
    const current: string[] = Array.isArray(state.type_ids) ? state.type_ids.map(String) : [];
    const next = current.includes(String(typeId))
      ? current.filter((x) => x !== String(typeId))
      : [...current, String(typeId)];
    try { await ticketStatesApi.setTypes(String(state.id), next); refetchStates(); }
    catch { /* global banner */ }
  }
  // Portal settings — persisted via the workspace settings-blob.
  const { data: ticketsWsCtx } = useApi(() => workspacesApi.currentContext(), [], null);
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portalSaving, setPortalSaving] = useState(false);
  const [portalSaved, setPortalSaved] = useState(false);
  useEffect(() => {
    const s = (ticketsWsCtx as any)?.settings;
    if (s?.ticket_portal_enabled !== undefined) setPortalEnabled(!!s.ticket_portal_enabled);
  }, [ticketsWsCtx]);
  async function savePortal() {
    if (!(ticketsWsCtx as any)?.id || portalSaving) return;
    setPortalSaving(true);
    setPortalSaved(false);
    try {
      await workspacesApi.updateSettings((ticketsWsCtx as any).id, { ticket_portal_enabled: portalEnabled });
      setPortalSaved(true);
      setTimeout(() => setPortalSaved(false), 2500);
    } catch { /* global banner */ } finally { setPortalSaving(false); }
  }
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Folios de atención</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/></svg>
                Aprender
              </button>
              {tab === 'tipos'   && <button onClick={() => createTicketType('customer')} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Crear tipo de folio de atención</button>}
              {tab === 'estados' && <button onClick={() => createTicketState('in_progress', '#f97316')} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Crear estado de folio de atención</button>}
              {tab === 'portal'  && <div className="flex items-center gap-2">{portalSaved && <span className="text-[12px] text-[#059669]">Guardado</span>}<button onClick={savePortal} disabled={portalSaving || !(ticketsWsCtx as any)?.id} className="bg-[#157c3c] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#0f5e2d] disabled:opacity-40">{portalSaving ? 'Guardando…' : 'Guardar cambios'}</button></div>}
            </div>
          </div>
          {/* Tabs */}
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'tipos' && <>
              <SettingsPromoCard
                title="Clasifica y haz un seguimiento eficaz de los problemas de los clientes"
                description="Usa los folios de atención del cliente para las consultas directas de los clientes, los de back-office para gestionar el trabajo interno o el seguimiento, y los de seguimiento para coordinar cuestiones complejas."
                primaryBtn="+ Crear tipo de folio de atención"
                secondaryBtn="Más información sobre los folios"
                imageSlot={<img src={IMG_TICKETS_TYPES} alt="Ticket types preview" className="w-full h-[206px] rounded-[8px] object-cover" data-node-id="1:22052" />}
              />
              <div className="px-6 py-4 flex flex-col gap-4">
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-4">
                    <div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Tipos de folios de atención de clientes ({typesByCat('customer').length})</h3><p className="text-[12px] text-[#646462]">Recopila toda la información que necesitas, haz un seguimiento del progreso y mantén a los clientes actualizados en tiempo real.</p></div>
                  </div>
                  {typesByCat('customer').length === 0 ? (
                    <div className="border-t border-[#e9eae6] px-4 py-6 flex flex-col items-center gap-3"><p className="text-[13px] text-[#646462]">No has creado ningún tipo de folio de atención de clientes</p><button onClick={() => createTicketType('customer')} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold">+ Crear tipo de ticket</button></div>
                  ) : (
                  <table className="w-full text-[13px] border-t border-[#e9eae6]">
                    <thead><tr className="border-b border-[#e9eae6] bg-[#fafaf9]"><th className="text-left px-4 py-2 font-semibold text-[#1a1a1a] w-[200px]">Nombre</th><th className="text-left px-4 py-2 font-semibold text-[#1a1a1a]">Descripción</th><th className="text-left px-4 py-2 font-semibold text-[#1a1a1a] w-[120px]">Creado el</th><th className="w-[60px]"></th></tr></thead>
                    <tbody>{typesByCat('customer').map((t: any) => (
                      <tr key={t.id}><td className="px-4 py-4"><span className="font-medium text-[#1a1a1a]">{t.icon || '🎫'} {t.name}</span></td><td className="px-4 py-4 text-[#646462]">{t.description || '—'}</td><td className="px-4 py-4 text-[#646462]">{formatContactWhen(t.created_at)}</td><td className="px-4 py-4"><button onClick={() => deleteTicketType(String(t.id))} disabled={ttDeletingId === String(t.id)} className="text-[12px] text-[#dc2626] hover:underline disabled:opacity-40">{ttDeletingId === String(t.id) ? '…' : 'Eliminar'}</button></td></tr>
                    ))}</tbody>
                  </table>
                  )}
                </div>
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-4"><div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Tipos de folios de atención de seguimiento ({typesByCat('follow_up').length})</h3><p className="text-[12px] text-[#646462]">Administra todas las conversaciones relacionadas con un problema generalizado con un solo folio de atención.</p></div></div>
                  {typesByCat('follow_up').length === 0 ? (
                    <div className="border-t border-[#e9eae6] px-4 py-6 flex flex-col items-center gap-3"><p className="text-[13px] text-[#646462]">No has creado ningún tipo de folio de atención Seguimiento</p><button onClick={() => createTicketType('follow_up')} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold">+ Crear tipo de ticket</button></div>
                  ) : (
                  <ul className="border-t border-[#e9eae6] divide-y divide-[#e9eae6]">{typesByCat('follow_up').map((t: any) => (
                    <li key={t.id} className="px-4 py-3 flex items-center gap-2"><span className="flex-1 text-[13px] text-[#1a1a1a]">{t.icon || '🎫'} {t.name}</span><button onClick={() => deleteTicketType(String(t.id))} disabled={ttDeletingId === String(t.id)} className="text-[12px] text-[#dc2626] hover:underline disabled:opacity-40">{ttDeletingId === String(t.id) ? '…' : 'Eliminar'}</button></li>
                  ))}</ul>
                  )}
                </div>
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-4"><div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Tipos de folios de atención de back-office ({typesByCat('back_office').length})</h3><p className="text-[12px] text-[#646462]">Asigna un folio de atención separado a tus equipos administrativos y colabora en privado con notas internas.</p></div></div>
                  {typesByCat('back_office').length === 0 ? (
                    <div className="border-t border-[#e9eae6] px-4 py-6 flex flex-col items-center gap-3"><p className="text-[13px] text-[#646462]">No has creado ningún tipo de folio de atención Back-office</p><button onClick={() => createTicketType('back_office')} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold">+ Crear tipo de ticket</button></div>
                  ) : (
                  <ul className="border-t border-[#e9eae6] divide-y divide-[#e9eae6]">{typesByCat('back_office').map((t: any) => (
                    <li key={t.id} className="px-4 py-3 flex items-center gap-2"><span className="flex-1 text-[13px] text-[#1a1a1a]">{t.icon || '🎫'} {t.name}</span><button onClick={() => deleteTicketType(String(t.id))} disabled={ttDeletingId === String(t.id)} className="text-[12px] text-[#dc2626] hover:underline disabled:opacity-40">{ttDeletingId === String(t.id) ? '…' : 'Eliminar'}</button></li>
                  ))}</ul>
                  )}
                </div>
              </div>
            </>}

            {tab === 'estados' && <>
              <SettingsPromoCard
                title="Seguimiento del progreso con los estados de los folios de atención"
                description="Los estados de los folios de atención proporcionan una visión clara del recorrido de un folio, desde abierto hasta resuelto. Personalízalos para que se ajusten a tu flujo de trabajo de asistencia y asegúrate de que cada paso queda registrado y organizado."
                primaryBtn="+ Crear estado de folio de atención"
                secondaryBtn="Estados del folio de atención"
                imageSlot={<div className="w-full h-[130px] rounded-[8px] bg-[#f0f4ff] flex flex-col gap-1.5 p-3 justify-center"><div className="h-7 bg-white rounded border border-[#e0e7ff] flex items-center px-2 text-[11px] text-[#646462]">Update ticket state</div>{[{c:'#ef4444',l:'In review'},{c:'#f97316',l:'Processing'},{c:'#eab308',l:'Proof of address needed'},{c:'#22c55e',l:'Refund approved'}].map(s=><div key={s.l} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:s.c}}/><span className="text-[11px] text-[#1a1a1a]">{s.l}</span></div>)}</div>}
              />
              {/* Filter toggle */}
              <div className="mx-6 mb-4 border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">Filtro de buzón para el estado del folio de atención</p>
                  <p className="text-[12px] text-[#646462] mt-0.5">Los compañeros de equipo pueden filtrar los folios de atención por categoría de estado en el buzón.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-8 h-[18px] rounded-full bg-[#f97316] relative flex-shrink-0"><div className="absolute right-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow"/></div>
                  <span className="text-[12px] text-[#1a1a1a] whitespace-nowrap">Habilitar filtros de estado del folio de atención en el buzón.</span>
                </div>
              </div>
              {/* State groups — real states grouped by lifecycle category */}
              {STATE_CATS.map(group => {
                const rows = statesByCat(group.key);
                return (
                <div key={group.key} className="mx-6 mb-3 border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e9eae6]">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{background: group.color}} />
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">{group.label} ({rows.length})</span>
                    <button onClick={() => createTicketState(group.key, group.color)} className="ml-auto text-[12px] font-medium text-[#3b59f6] hover:underline">+ Añadir estado</button>
                  </div>
                  {rows.length === 0 ? (
                    <div className="px-4 py-4 text-[12px] text-[#646462]">Sin estados en esta categoría.</div>
                  ) : (
                  <table className="w-full text-[12px]">
                    <thead><tr className="border-b border-[#e9eae6] bg-[#fafaf9]"><th className="text-left px-4 py-2 font-medium text-[#646462] w-[26%]">Etiqueta visible internamente</th><th className="text-left px-4 py-2 font-medium text-[#646462] w-[26%]">Etiqueta visible para tus clientes <span className="text-[#aaa]">?</span></th><th className="text-left px-4 py-2 font-medium text-[#646462]">Tipos conectados</th><th className="text-left px-4 py-2 font-medium text-[#646462] w-[80px]">Acciones</th></tr></thead>
                    <tbody>{rows.map((s: any) => {
                      const connected: string[] = Array.isArray(s.type_ids) ? s.type_ids.map(String) : [];
                      return (
                      <tr key={s.id} className="border-t border-[#e9eae6]">
                        <td className="px-4 py-3"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{background: s.color || group.color}}/><span className="font-medium text-[#1a1a1a]">{s.internal_label}</span></span></td>
                        <td className="px-4 py-3 text-[#646462]">{s.client_label || s.internal_label}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {connected.map((tid) => (
                              <button key={tid} onClick={() => toggleStateType(s, tid)} title="Quitar" className="inline-flex items-center gap-1 bg-[#eef1ff] text-[#3b59f6] rounded-full px-2 py-0.5 text-[11px] hover:bg-[#e0e5ff]">{typeName(tid) || 'Tipo'} <span className="opacity-60">×</span></button>
                            ))}
                            {(ticketTypes || []).length > 0 && (
                              <select value="" onChange={(e) => { if (e.target.value) toggleStateType(s, e.target.value); }} className="text-[11px] text-[#646462] border border-[#e9eae6] rounded-full px-2 py-0.5 bg-white outline-none">
                                <option value="">+ conectar</option>
                                {(ticketTypes || []).filter((t: any) => !connected.includes(String(t.id))).map((t: any) => (
                                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                                ))}
                              </select>
                            )}
                            {connected.length === 0 && (ticketTypes || []).length === 0 && <span className="text-[11px] text-[#a4a4a2]">Crea tipos primero</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><button onClick={() => deleteTicketState(String(s.id))} disabled={tsDeletingId === String(s.id)} className="text-[12px] text-[#dc2626] hover:underline disabled:opacity-40">{tsDeletingId === String(s.id) ? '…' : 'Eliminar'}</button></td>
                      </tr>
                      );
                    })}</tbody>
                  </table>
                  )}
                </div>
                );
              })}
            </>}

            {tab === 'portal' && <>
              <SettingsPromoCard
                title="Permitir que los clientes vean y administren sus folios de atención"
                description="Ofrece a tus clientes una visión clara de sus solicitudes de asistencia para permitirles seguir el progreso, revisar las actualizaciones y mantenerse informados, todo en un mismo lugar, ya sea a través de Messenger o del centro de ayuda."
                primaryBtn="Portal de folios de atención"
                secondaryBtn=""
                imageSlot={<img src={IMG_TICKETS_PORTAL} alt="Portal preview" className="w-full h-[206px] rounded-[8px] object-cover" data-node-id="1:24913" />}
              />
              <div className="px-6 pb-6 flex flex-col gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462]">REQUISITOS PREVIOS</p>
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden divide-y divide-[#e9eae6]">
                  {[
                    { icon: '💬', title: 'El mensajero de Intercom está instalado para los usuarios que han iniciado sesión.', desc: 'Para identificar a los usuarios, se debe instalar Intercom para los usuarios que hayan iniciado sesión en el sitio.' },
                    { icon: '🍪', title: 'Configuración del dominio personalizado y el reenvío de cookies del centro de ayuda', desc: 'Las cookies se utilizan para autenticar a los usuarios que han iniciado sesión en el portal.', warning: 'No pudimos verificar si el reenvío de cookies está funcionando en tu centro de ayuda. Si tu portal de folios de atención no funciona, consulta nuestra documentación' },
                    { icon: '🔒', title: 'Seguridad de Messenger con JWT.', desc: 'Para proteger el portal de folios de atención de la suplantación de identidad de los usuarios, la seguridad de Messenger con JWT debe estar habilitada en tu espacio de trabajo.' },
                    { icon: '🏢', title: 'Evitar las actualizaciones de atributos de empresas a través de Messenger', desc: 'Para proteger el portal de folios de atención de la suplantación de empresas, debes evitar las actualizaciones de atributos de empresas a través del Messenger.' },
                  ].map(req => (
                    <div key={req.title} className="px-5 py-4">
                      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{req.title}</p>
                      <p className="text-[12px] text-[#646462]">{req.desc}</p>
                      {req.warning && <div className="mt-2 flex items-start gap-2 bg-[#fffbeb] border border-[#fde68a] rounded-[6px] px-3 py-2"><span className="text-[#b45309] text-[12px]">⚠ {req.warning}</span></div>}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mt-2">AJUSTES DEL PORTAL DE FOLIOS DE ATENCIÓN</p>
                <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-start gap-8">
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Portal de folios de atención</p>
                    <p className="text-[12px] text-[#646462]">Se puede acceder al portal de folios de atención desde el Centro de ayuda y esto permite a tus clientes ver todos los folios de atención relacionados con su empresa.</p>
                  </div>
                  <div className="flex flex-col gap-3 flex-shrink-0 w-[320px]">
                    <button type="button" onClick={() => setPortalEnabled(v => !v)} className="flex items-center gap-2 text-left">
                      <div className={`w-8 h-[18px] rounded-full relative flex-shrink-0 transition-colors ${portalEnabled ? 'bg-[#157c3c]' : 'bg-[#e9eae6]'}`}><div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${portalEnabled ? 'right-0.5' : 'left-0.5'}`}/></div>
                      <span className="text-[12px] text-[#646462]">Habilitar el portal de folios de atención</span>
                    </button>
                    <div>
                      <p className="text-[12px] font-medium text-[#1a1a1a] mb-1">URL del portal de folios de atención</p>
                      <div className="flex items-center gap-2">
                        <input readOnly value="intercom.help/acme-fed2de5d0a6a/en/tickets" className="flex-1 border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[12px] text-[#646462] bg-[#fafaf9]" />
                        <button className="border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Copiar</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SlaView ───────────────────────────────────────────────────────────────────

export function SlaView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: policies, loading, refetch: reload } = useApi(() => slaPoliciesApi.list(), [], []);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Create-form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [firstResp, setFirstResp] = useState('');
  const [nextResp, setNextResp]   = useState('');
  const [resolution, setResolution] = useState('');
  const [businessHours, setBusinessHours] = useState(false);
  const [creating, setCreating] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function minutesToSec(val: string): number | null {
    const n = parseFloat(val);
    return isNaN(n) || n <= 0 ? null : Math.round(n * 60);
  }
  function secToMin(sec: number | null): string {
    if (!sec) return '—';
    const m = Math.round(sec / 60);
    return m >= 60 ? `${(m / 60).toFixed(1)} h` : `${m} min`;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await slaPoliciesApi.create({
        name: newName.trim(),
        description: newDesc.trim() || null,
        first_response_time: minutesToSec(firstResp),
        next_response_time:  minutesToSec(nextResp),
        resolution_time:     minutesToSec(resolution),
        business_hours:      businessHours,
      });
      showToast('Política SLA creada correctamente.');
      setShowModal(false);
      setNewName(''); setNewDesc(''); setFirstResp(''); setNextResp(''); setResolution(''); setBusinessHours(false);
      reload();
    } catch (err: any) {
      showToast(err?.message ?? 'Error al crear la política', false);
    } finally { setCreating(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await slaPoliciesApi.delete(id);
      showToast('Política eliminada.');
      reload();
    } catch (err: any) {
      showToast(err?.message ?? 'Error al eliminar', false);
    } finally { setDeleting(null); }
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden relative">

          {/* Toast */}
          {toast && (
            <div className={`absolute top-4 right-4 z-50 px-4 py-2.5 rounded-[8px] text-[13px] font-medium shadow-lg ${toast.ok ? 'bg-[#1a1a1a] text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {toast.msg}
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">SLA</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/></svg>
                Aprender
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]"
              >
                + Nueva política SLA
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">

            {/* Promo banner */}
            <div className="rounded-[12px] bg-[#f8f7ff] border border-[#e9eae6] p-5 flex items-start gap-5 relative flex-shrink-0">
              <div className="flex-1">
                <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-1">Acuerdos de nivel de servicio (SLA)</h2>
                <p className="text-[13px] text-[#646462] leading-relaxed">
                  Los SLA te ayudan a establecer objetivos para que tu equipo proporcione una experiencia de alta calidad.
                  Define tiempos de primera respuesta, respuesta siguiente y resolución por política.
                </p>
              </div>
              <img src={IMG_SLA_BANNER} alt="" className="w-[200px] h-[100px] flex-shrink-0 rounded-[8px] object-cover opacity-80" />
            </div>

            {/* List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#3b59f6', borderTopColor: 'transparent' }} />
              </div>
            ) : policies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <svg viewBox="0 0 40 40" className="w-10 h-10 fill-none stroke-[#ccc]" strokeWidth="1.5"><circle cx="20" cy="20" r="17"/><path d="M20 11v9l5 5"/></svg>
                <p className="text-[14px] font-semibold text-[#1a1a1a]">Aún no se han creado políticas SLA</p>
                <button onClick={() => setShowModal(true)} className="text-[13px] text-[#3b59f6] underline hover:opacity-80">Crear primera política SLA</button>
              </div>
            ) : (
              <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#fafaf9] border-b border-[#e9eae6]">
                      <th className="text-left px-4 py-2.5 font-semibold text-[#1a1a1a]">Nombre</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-[#1a1a1a]">1ª respuesta</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-[#1a1a1a]">Sig. respuesta</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-[#1a1a1a]">Resolución</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-[#1a1a1a]">Horario</th>
                      <th className="w-[48px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {(policies as any[]).map((p) => (
                      <tr key={p.id} className="border-t border-[#e9eae6] hover:bg-[#fafaf9] group">
                        <td className="px-4 py-3">
                          <p className="font-medium text-[#1a1a1a]">{p.name}</p>
                          {p.description && <p className="text-[12px] text-[#646462]">{p.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-[#646462]">{secToMin(p.first_response_time)}</td>
                        <td className="px-4 py-3 text-[#646462]">{secToMin(p.next_response_time)}</td>
                        <td className="px-4 py-3 text-[#646462]">{secToMin(p.resolution_time)}</td>
                        <td className="px-4 py-3 text-[#646462]">{p.business_hours ? 'Laboral' : '24/7'}</td>
                        <td className="px-4 py-3">
                          <button
                            disabled={deleting === p.id}
                            onClick={() => handleDelete(p.id)}
                            className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 transition-opacity"
                          >
                            {deleting === p.id
                              ? <div className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin border-red-400" />
                              : <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#ef4444]" strokeWidth="1.5"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/></svg>
                            }
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Create Modal */}
          {showModal && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30">
              <div className="bg-white rounded-[16px] shadow-2xl w-[500px] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6]">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a]">Nueva política SLA</h2>
                  <button onClick={() => setShowModal(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                  </button>
                </div>
                <form onSubmit={handleCreate} className="px-6 py-5 flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-semibold text-[#1a1a1a]">Nombre *</label>
                    <input required value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="Ej. SLA estándar" className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[13px] font-medium text-[#646462]">Descripción</label>
                    <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                      placeholder="Opcional" className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: '1ª respuesta (min)', val: firstResp, set: setFirstResp },
                      { label: 'Sig. respuesta (min)', val: nextResp, set: setNextResp },
                      { label: 'Resolución (min)', val: resolution, set: setResolution },
                    ].map(({ label, val, set }) => (
                      <div key={label} className="flex flex-col gap-1">
                        <label className="text-[12px] font-medium text-[#646462]">{label}</label>
                        <input type="number" min="1" value={val} onChange={e => set(e.target.value)}
                          placeholder="—" className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a] w-full" />
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={businessHours} onChange={e => setBusinessHours(e.target.checked)}
                      className="w-4 h-4 rounded accent-[#1a1a1a]" />
                    <span className="text-[13px] text-[#1a1a1a]">Solo horario laboral</span>
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e9eae6]">
                    <button type="button" onClick={() => setShowModal(false)}
                      className="border border-[#e9eae6] rounded-full px-4 py-[7px] text-[13px] font-medium hover:bg-[#f5f5f4]">Cancelar</button>
                    <button type="submit" disabled={creating}
                      className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] disabled:opacity-50">
                      {creating ? 'Creando…' : 'Crear política'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AudiencesSettingsView ─────────────────────────────────────────────────────

export function AudiencesSettingsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [audiences, setAudiences] = useState([
    { id: '1', name: 'Todos', filters: [] as string[], articles: 0 },
    { id: '2', name: 'Audiencia sin título', filters: ['Type is Lead, Visitor, or User'], articles: 0 },
  ]);
  const [drawerAud, setDrawerAud] = useState<{ id: string; name: string; filters: string[]; articles: number } | null>(null);
  const [drawerName, setDrawerName] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const FILTER_OPTIONS = [
    'Account', 'Owner', 'Lead category', 'Qualification status', 'Conversation Rating',
    'Email', 'Email domain', 'Phone', 'User ID', 'First Seen', 'Signed up',
    'Last seen', 'Last contacted', 'Last heard from', 'Last active', 'Last opened',
    'Web sessions', 'Country', 'Region',
  ];

  const filteredOpts = FILTER_OPTIONS.filter(o => o.toLowerCase().includes(filterSearch.toLowerCase()));

  function openDrawer(a: typeof audiences[0]) {
    setDrawerAud(a);
    setDrawerName(a.name);
    setFilterOpen(false);
    setFilterSearch('');
    setPreviewOpen(false);
  }

  function addNewAudience() {
    const newA = { id: String(Date.now()), name: 'Sin título', filters: ['Users, Visitors, and Leads'], articles: 0 };
    setAudiences(s => [...s, newA]);
    openDrawer(newA);
  }

  function saveDrawer() {
    if (!drawerAud) return;
    setAudiences(s => s.map(a => a.id === drawerAud.id ? { ...a, name: drawerName } : a));
    showToast('Audiencia guardada correctamente.');
    setDrawerAud(null);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2 relative">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        {/* Main content */}
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden relative">

          {/* Toast */}
          {toast && (
            <div className={`absolute top-4 right-4 z-50 px-4 py-2.5 rounded-[8px] text-[13px] font-medium shadow-lg ${toast.ok ? 'bg-[#1a1a1a] text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {toast.msg}
            </div>
          )}

          {/* Dismiss X */}
          <button
            type="button"
            onClick={() => onNavigate('finSettings')}
            className="absolute top-4 right-4 z-10 w-7 h-7 bg-[#1a1a1a] rounded-full flex items-center justify-center hover:bg-[#333]"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
          </button>

          {/* Banner */}
          <div className="px-8 py-7 border-b border-[#e9eae6] flex-shrink-0">
            <h2 className="text-[18px] font-bold text-[#1a1a1a] mb-2">Segmenta tu contenido y pautas de Fin para usuarios específicos</h2>
            <p className="text-[13px] text-[#646462] mb-4 max-w-[680px] leading-relaxed">
              Crea y administra audiencias personalizadas para controlar qué conocimientos utiliza Fin y qué pauta aplica, asegurando que los usuarios obtengan respuestas que siempre sean relevantes.
            </p>
            <button type="button" className="flex items-center gap-1.5 border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v8A1.5 1.5 0 0113.5 12H9.06l-2.56 2.56A.5.5 0 016 14.5V12H2.5A1.5 1.5 0 011 10.5v-8z"/></svg>
              Cómo usar las audiencias para segmentar a Fin
            </button>
          </div>

          {/* List body */}
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6">
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 20 20" className="w-4 h-4 flex-shrink-0">
                  <rect x="2" y="2" width="16" height="16" rx="3" fill="#1a1a1a"/>
                  <path d="M10 6.5a3.5 3.5 0 00-3.5 3.5v.5a3.5 3.5 0 007 0V10A3.5 3.5 0 0010 6.5z" fill="white"/>
                </svg>
                <h3 className="text-[15px] font-bold text-[#1a1a1a]">Audiencias</h3>
              </div>
              <button
                type="button"
                onClick={addNewAudience}
                className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-3.5 py-1.5 text-[13px] font-semibold hover:bg-[#333] transition-colors"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/></svg>
                Nuevo
              </button>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-2 gap-4">
              {audiences.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openDrawer(a)}
                  className="text-left border border-[#e9eae6] rounded-[10px] p-5 hover:border-[#1a1a1a] transition-colors flex flex-col min-h-[120px]"
                >
                  <div className="flex-1">
                    <p className="text-[13.5px] font-semibold text-[#1a1a1a] mb-1.5">{a.name}</p>
                    {a.filters.map(f => (
                      <div key={f} className="flex items-center gap-1.5">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9a9a96] flex-shrink-0"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 100-6 3 3 0 000 6z"/><path d="M5.216 14A2.238 2.238 0 015 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 005 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/><path d="M4.5 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/></svg>
                        <span className="text-[12px] text-[#646462]">{f}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[#f0f0ee]">
                    <svg viewBox="0 0 20 20" className="w-4 h-4 flex-shrink-0">
                      <rect x="2" y="2" width="16" height="16" rx="3" fill="#1a1a1a"/>
                      <path d="M10 6.5a3.5 3.5 0 00-3.5 3.5v.5a3.5 3.5 0 007 0V10A3.5 3.5 0 0010 6.5z" fill="white"/>
                    </svg>
                    <span className="text-[12px] text-[#646462]">{a.articles} artículos disponibles para el agente de IA, Fin</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right-side drawer */}
          {drawerAud && (
            <div className="absolute inset-0 z-20 flex">
              {/* Dimmed backdrop */}
              <div className="flex-1 bg-black/20" onClick={() => setDrawerAud(null)} />
              {/* Panel */}
              <div className="w-[560px] bg-white h-full shadow-2xl flex flex-col border-l border-[#e9eae6]">
                {/* Drawer header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
                  <input
                    value={drawerName}
                    onChange={e => setDrawerName(e.target.value)}
                    className="text-[16px] font-bold text-[#f97316] border-b-2 border-[#f97316] focus:outline-none bg-transparent min-w-0 max-w-[200px]"
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f5f5f4] text-[#646462]">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M3 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
                    </button>
                    <button type="button" onClick={() => setDrawerAud(null)} className="text-[13px] font-medium text-[#646462] hover:text-[#1a1a1a] px-2 py-1">Cancelar</button>
                    <button type="button" onClick={saveDrawer} className="text-[13px] font-medium text-[#646462] hover:text-[#1a1a1a] px-2 py-1">Guardar</button>
                  </div>
                </div>

                {/* Drawer body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">

                  {/* Audience rules card */}
                  <div className="border border-[#e9eae6] rounded-[10px] p-5">
                    <p className="text-[14px] font-bold text-[#1a1a1a] mb-3">Reglas de audiencia</p>
                    <div className="flex items-center gap-2 mb-3 flex-wrap relative">
                      <div className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-1 text-[12.5px] text-[#1a1a1a] bg-[#f8f8f7]">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 100-6 3 3 0 000 6z"/><path d="M5.216 14A2.238 2.238 0 015 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 005 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/><path d="M4.5 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/></svg>
                        Users, Visitors, and Leads
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setFilterOpen(s => !s)}
                          className="flex items-center gap-1 text-[12.5px] text-[#f97316] font-semibold hover:text-[#e06000]"
                        >
                          + Agregar regla de audiencia
                        </button>
                        {filterOpen && (
                          <div className="absolute top-full left-0 mt-1 w-[280px] bg-white border border-[#e9eae6] rounded-[10px] shadow-xl z-30 flex flex-col overflow-hidden">
                            <div className="px-3 py-2 border-b border-[#f0f0ee]">
                              <div className="flex items-center gap-2 border border-[#e9eae6] rounded-[6px] px-2.5 py-1.5">
                                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9a9a96] flex-shrink-0"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"/></svg>
                                <input
                                  autoFocus
                                  value={filterSearch}
                                  onChange={e => setFilterSearch(e.target.value)}
                                  placeholder="Buscar..."
                                  className="flex-1 text-[12.5px] focus:outline-none bg-transparent"
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto max-h-[260px] py-1">
                              {filteredOpts.map(opt => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => { setFilterOpen(false); setFilterSearch(''); showToast(`Regla "${opt}" añadida.`); }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7] text-left"
                                >
                                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9a9a96] flex-shrink-0"><path d="M2.5 4a.5.5 0 000 1h11a.5.5 0 000-1h-11zm2 3a.5.5 0 000 1h7a.5.5 0 000-1h-7zm2 3a.5.5 0 000 1h3a.5.5 0 000-1h-3z"/></svg>
                                  {opt}
                                </button>
                              ))}
                              <div className="border-t border-[#f0f0ee] mt-1 pt-1">
                                <button type="button" className="w-full flex items-center gap-2 px-4 py-2 text-[12.5px] text-[#646462] hover:bg-[#f8f8f7] text-left">
                                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9a9a96] flex-shrink-0"><path d="M.5 9.9a.5.5 0 01.5.5v2.5a1 1 0 001 1h12a1 1 0 001-1v-2.5a.5.5 0 011 0v2.5a2 2 0 01-2 2H2a2 2 0 01-2-2v-2.5a.5.5 0 01.5-.5z"/><path d="M7.646 1.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 2.707V11.5a.5.5 0 01-1 0V2.707L5.354 4.854a.5.5 0 11-.708-.708l3-3z"/></svg>
                                  Filter audience from CSV
                                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#9a9a96] ml-1"><path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0-1A6 6 0 108 2a6 6 0 000 12zm-.75-5.75V5h1.5v3.25H7.25zm0 2.5v-1.5h1.5v1.5H7.25z"/></svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Audience preview */}
                    <button
                      type="button"
                      onClick={() => setPreviewOpen(s => !s)}
                      className="w-full flex items-center justify-between py-2 text-[12.5px] text-[#1a1a1a] font-medium hover:text-[#3b59f6] border-t border-[#f0f0ee] pt-3"
                    >
                      <span>Obtén una vista previa de aproximadamente 4 personas que están en tu audiencia en este momento</span>
                      <svg viewBox="0 0 16 16" className={`w-4 h-4 fill-current flex-shrink-0 ml-2 transition-transform ${previewOpen ? 'rotate-90' : ''}`}><path d="M6.72 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L10.44 8 6.72 4.28a.75.75 0 010-1.06z"/></svg>
                    </button>
                    {previewOpen && (
                      <div className="mt-2 border border-[#e9eae6] rounded-[8px] p-4">
                        <p className="text-[12px] text-[#646462]">4 personas coinciden con los criterios de esta audiencia en este momento.</p>
                      </div>
                    )}
                  </div>

                  {/* Articles available card */}
                  <div className="border border-[#e9eae6] rounded-[10px] p-5">
                    <p className="text-[13.5px] font-semibold text-[#1a1a1a] mb-4">0 artículos disponibles para el agente de IA, Fin</p>
                    <table className="w-full">
                      <tbody>
                        {[
                          ['Identidad', null],
                          ['Contenido', '0 artículos'],
                          ['Pautas', '0 artículos'],
                          ['Escalamiento', '0 artículos'],
                          ['Flujos de trabajo', '0 artículos'],
                          ['Procedimientos', '0 artículos'],
                          ['Conectores de datos', '0 artículos'],
                        ].map(([label, value]) => (
                          <tr key={label as string} className="border-t border-[#f5f5f3] first:border-0">
                            <td className="py-2 text-[12.5px] text-[#646462] w-[140px] pr-4 align-top">{label}</td>
                            <td className="py-2 text-[12.5px] text-[#1a1a1a]">
                              {label === 'Identidad' ? (
                                <div className="flex items-center gap-2">
                                  <svg viewBox="0 0 20 20" className="w-4 h-4 flex-shrink-0">
                                    <rect x="2" y="2" width="16" height="16" rx="3" fill="#1a1a1a"/>
                                    <path d="M10 6.5a3.5 3.5 0 00-3.5 3.5v.5a3.5 3.5 0 007 0V10A3.5 3.5 0 0010 6.5z" fill="white"/>
                                  </svg>
                                  <span>Fin</span>
                                  <span className="border border-[#e9eae6] rounded-[4px] px-1.5 py-0.5 text-[11px] text-[#646462]">Predeterminado</span>
                                </div>
                              ) : value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AiInboxView ───────────────────────────────────────────────────────────────

export function AiInboxView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: wsCtx } = useApi(() => workspacesApi.currentContext(), [], null);
  const [copilot, setCopilot] = useState<boolean>(true);
  const [redactar, setRedactar] = useState<boolean>(true);
  const [autocompletar, setAutocompletar] = useState<boolean>(true);

  // Hydrate from workspace settings once loaded
  useEffect(() => {
    if (!wsCtx) return;
    if (wsCtx.settings?.ai_copilot_enabled !== undefined) setCopilot(!!wsCtx.settings.ai_copilot_enabled);
    if (wsCtx.settings?.ai_draft_enabled !== undefined) setRedactar(!!wsCtx.settings.ai_draft_enabled);
    if (wsCtx.settings?.ai_autocomplete_enabled !== undefined) setAutocompletar(!!wsCtx.settings.ai_autocomplete_enabled);
  }, [wsCtx]);

  async function persistToggles(key: string, value: boolean) {
    if (!wsCtx?.id) return;
    try {
      await workspacesApi.updateSettings(wsCtx.id, { [key]: value });
    } catch { /* best-effort */ }
  }

  function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle} className={`w-8 h-[18px] rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`}/>
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[16px] font-bold text-[#1a1a1a]">Buzón de IA</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v8A1.5 1.5 0 0113.5 12H9.06l-2.56 2.56A.5.5 0 016 14.5V12H2.5A1.5 1.5 0 011 10.5v-8z"/></svg>
              Más información
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4" stroke="#646462" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-8 flex flex-col gap-6">
            {/* Copilot */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle on={copilot} onToggle={() => { setCopilot(v => { persistToggles('ai_copilot_enabled', !v); return !v; }); }} />
                <h4 className="text-[14px] font-semibold text-[#1a1a1a]">Copilot</h4>
              </div>
              <p className="text-[13px] text-[#646462] ml-11">Un asistente personal de IA, impulsado por contenido y conversaciones pasadas.</p>
              <div className="ml-11 mt-2 flex items-center justify-between bg-[#f8f8f7] rounded-[8px] px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">Uso ilimitado: 1 compañeros de equipo • Uso incluido: 0 compañeros de equipo</p>
                  <p className="text-[12px] text-[#646462]">Administra el acceso para actualizar a los compañeros de equipo que necesitan un uso ilimitado.</p>
                </div>
                <button className="ml-4 flex-shrink-0 border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Administrar el acceso</button>
              </div>
            </div>
            <div className="border-t border-[#e9eae6]" />
            {/* Redactar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle on={redactar} onToggle={() => { setRedactar(v => { persistToggles('ai_draft_enabled', !v); return !v; }); }} />
                <h4 className="text-[14px] font-semibold text-[#1a1a1a]">Redactar y resumir con AI</h4>
              </div>
              <p className="text-[13px] text-[#646462] ml-11">Ajustar las respuestas y utilizar resúmenes</p>
              <ul className="ml-14 mt-1 flex flex-col gap-1 list-disc text-[13px] text-[#1a1a1a]">
                <li>Ampliar, reformular, cambiar a tono formal, hacer más amigable, corregir ortografía y gramática</li>
                <li>Traducir</li>
                <li className="flex items-center gap-2 list-none -ml-3">
                  <span className="text-[#646462]">•</span>
                  <span>Ajustar a mi tono</span>
                  <span className="bg-[#7c3aed] text-white text-[11px] px-2 py-0.5 rounded-full font-medium">Obtener funcionalidad</span>
                </li>
                <li>Resume las conversaciones con un clic o utilizando automáticamente flujos de trabajo. <span className="text-[#3b59f6]">Más información</span>.</li>
              </ul>
            </div>
            <div className="border-t border-[#e9eae6]" />
            {/* Autocompletar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle on={autocompletar} onToggle={() => { setAutocompletar(v => { persistToggles('ai_autocomplete_enabled', !v); return !v; }); }} />
                <h4 className="text-[14px] font-semibold text-[#1a1a1a]">Autocompletar con IA</h4>
              </div>
              <p className="text-[13px] text-[#646462] ml-11">Generar título y descripción del folio de atención automáticamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AutomationView ────────────────────────────────────────────────────────────

export function AutomationView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: wsCtx } = useApi(() => workspacesApi.currentContext(), [], null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [botInboxOn, setBotInboxOn] = useState(false);
  const [slaExclude, setSlaExclude] = useState(false);
  const [waitTime, setWaitTime] = useState('3 minutos');
  const [triggers, setTriggers] = useState<Record<string, boolean>>({
    visita: true, pagina: true, clic: true,
    nuevaConvMsg: false, nuevaConvVisitante: false, primerMensaje: false,
    cualquierMensaje: false, clienteNoResponde: false, equipoNoResponde: false, estadoCambia: false,
  });

  // Hydrate from workspace settings
  useEffect(() => {
    if (!wsCtx?.settings) return;
    const s = wsCtx.settings;
    if (s.automation_bot_inbox      !== undefined) setBotInboxOn(!!s.automation_bot_inbox);
    if (s.automation_sla_exclude    !== undefined) setSlaExclude(!!s.automation_sla_exclude);
    if (s.automation_wait_time      !== undefined) setWaitTime(String(s.automation_wait_time));
    if (s.automation_triggers && typeof s.automation_triggers === 'object')
      setTriggers(t => ({ ...t, ...(s.automation_triggers as Record<string, boolean>) }));
  }, [wsCtx]);

  async function persist(patch: Record<string, unknown>) {
    if (!wsCtx?.id) return;
    try { await workspacesApi.updateSettings(wsCtx.id, patch); }
    catch { /* best-effort */ }
  }

  function toggleTrigger(k: string) {
    setTriggers(s => {
      const next = { ...s, [k]: !s[k] };
      persist({ automation_triggers: next });
      return next;
    });
  }

  function AccRow({ id, icon, title, desc, rightAction, children }: {
    id: string; icon: React.ReactNode; title: string; desc: string;
    rightAction?: React.ReactNode; children?: React.ReactNode;
  }) {
    const isExp = expanded === id && !!children;
    return (
      <div className={`rounded-[10px] border overflow-hidden transition-all ${isExp ? 'border-[#f97316]' : 'border-[#e9eae6]'}`}>
        <button
          type="button"
          className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-[#fafaf8] transition-colors"
          onClick={() => { if (children) setExpanded(s => s === id ? null : id); }}
        >
          <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-[#1a1a1a] mb-0.5">{title}</p>
            <p className="text-[12.5px] text-[#646462] leading-[1.5]">{desc}</p>
          </div>
          {rightAction && <div className="flex-shrink-0 self-center ml-2">{rightAction}</div>}
          {children && (
            <svg viewBox="0 0 16 16" className={`w-4 h-4 self-center flex-shrink-0 ml-1 transition-transform ${isExp ? 'rotate-180' : ''}`}>
              <path d="M4 6l4 4 4-4" stroke="#646462" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          )}
        </button>
        {isExp && (
          <div className="border-t border-[#f0f0ee] px-5 py-5">{children}</div>
        )}
      </div>
    );
  }

  const TRIGGER_LIST: { key: string; label: string }[] = [
    { key: 'visita',           label: 'El usuario visita tu sitio web' },
    { key: 'pagina',           label: 'El visitante va a una página' },
    { key: 'clic',             label: 'El cliente hace clic en un elemento del sitio web' },
    { key: 'nuevaConvMsg',     label: 'El usuario abre una nueva conversación en Messenger' },
    { key: 'nuevaConvVisitante', label: 'El visitante abre una nueva conversación en Messenger' },
    { key: 'primerMensaje',    label: 'El cliente envía su primer mensaje' },
    { key: 'cualquierMensaje', label: 'El cliente envía cualquier mensaje' },
    { key: 'clienteNoResponde', label: 'El cliente no ha respondido' },
    { key: 'equipoNoResponde', label: 'El compañero de equipo no ha respondido' },
    { key: 'estadoCambia',     label: 'El compañero de equipo cambia el estado de la conversación' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 h-14 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 20 20" className="w-5 h-5 flex-shrink-0">
                <rect x="2" y="2" width="16" height="16" rx="3" fill="#1a1a1a"/>
                <path d="M10 6.5a3.5 3.5 0 00-3.5 3.5v.5a3.5 3.5 0 007 0V10A3.5 3.5 0 0010 6.5z" fill="white"/>
              </svg>
              <h1 className="text-[16px] font-bold text-[#1a1a1a]">Automatización</h1>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('automation')}
              className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current text-[#646462]"><path d="M6.72 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L10.44 8 6.72 4.28a.75.75 0 010-1.06z"/></svg>
              Ir a Flujos de trabajo
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 flex flex-col gap-3">

            {/* Row 1: Identidad (non-expandable) */}
            <AccRow
              id="identidad"
              icon={<svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-[#646462]" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v5M15 4v5"/><circle cx="8" cy="14" r="1.5"/><path d="M11.5 14h5M11.5 17h5"/></svg>}
              title="Elige una identidad para los bots de Fin y de los flujos de trabajo"
              desc="Personaliza la foto de perfil de Fin y el nombre. Esta identidad también se utilizará para los bots en los flujos de trabajo."
              rightAction={
                <button type="button" onClick={() => onNavigate('finSettings')} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[5px] text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 01-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 01.872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 012.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 012.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 01.872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 01-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 01-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 110-5.86 2.929 2.929 0 010 5.858z"/></svg>
                  Ajustes de Fin
                </button>
              }
            />

            {/* Row 2: Activar el Inbox del bot (expandable) */}
            <AccRow
              id="botInbox"
              icon={<svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-[#646462]" strokeWidth="1.5"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M2 10h20M8 4v6M16 4v6"/><path d="M6 14h4M14 14h4"/></svg>}
              title="Activar el Inbox del bot"
              desc="Mantén tus conversaciones en un buzón independiente mientras Fin AI Agent y los flujos de trabajo están activos al comienzo de una conversación"
            >
              <div className="flex flex-col gap-4">
                {/* Toggle */}
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => { const v = !botInboxOn; setBotInboxOn(v); persist({ automation_bot_inbox: v }); }}
                    className={`mt-0.5 w-9 h-5 rounded-full relative flex-shrink-0 transition-colors ${botInboxOn ? 'bg-[#f97316]' : 'bg-[#d4d4d2]'}`}
                  >
                    <span className={`absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform ${botInboxOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <div className="flex-1">
                    <p className="text-[12.5px] text-[#1a1a1a] leading-relaxed">
                      Asigna automáticamente conversaciones a un buzón de bot independiente mientras un flujo de trabajo o Fin está activo.<br/>
                      Cuando finalice el bot, se aplicarán las asignaciones de flujos de trabajo en segundo plano. De lo contrario, la conversación se trasladará al destinatario predeterminado o al buzón No asignado.
                    </p>
                  </div>
                </div>
                {/* SLA checkbox */}
                <label className="flex items-center gap-2 cursor-pointer ml-12">
                  <input
                    type="checkbox"
                    checked={slaExclude}
                    onChange={e => { setSlaExclude(e.target.checked); persist({ automation_sla_exclude: e.target.checked }); }}
                    className="w-4 h-4 rounded border-[#d4d4d2] accent-[#1a1a1a] cursor-pointer"
                  />
                  <span className="text-[12.5px] text-[#646462]">Excluir el tiempo que las conversaciones pasan en el Inbox del bot de los objetivos de SLA</span>
                </label>
                {/* Links */}
                <div className="flex items-center gap-4 pt-3 border-t border-[#f0f0ee]">
                  <button type="button" onClick={() => setExpanded(null)} className="text-[12.5px] font-medium text-[#646462] hover:text-[#1a1a1a]">Cerrar</button>
                  <a href="#" className="flex items-center gap-1 text-[12.5px] text-[#3b59f6] hover:underline font-medium" onClick={e => e.preventDefault()}>
                    📖 Cómo funciona el Inbox del bot
                  </a>
                </div>
              </div>
            </AccRow>

            {/* Row 3: Cierre automático (expandable) */}
            <AccRow
              id="cierre"
              icon={<svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              title="Cierre automático de conversaciones de flujo de trabajo abandonadas"
              desc="Si un cliente no ha respondido en 3 minutos, la conversación se cerrará automáticamente. Otras respuestas reabrirán la conversación."
            >
              <div className="flex flex-col gap-3">
                {/* Trigger checkboxes */}
                <div className="flex flex-col gap-2">
                  {TRIGGER_LIST.map(t => (
                    <label key={t.key} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={triggers[t.key] ?? false}
                        onChange={() => toggleTrigger(t.key)}
                        className="w-4 h-4 rounded border-[#d4d4d2] accent-[#1a1a1a] cursor-pointer flex-shrink-0"
                      />
                      <span className="text-[12.5px] text-[#1a1a1a]">{t.label}</span>
                    </label>
                  ))}
                </div>
                {/* Info note */}
                <div className="flex items-start gap-2 bg-[#f3f3f1] rounded-[8px] px-4 py-3 mt-1">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462] flex-shrink-0 mt-0.5"><path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0-1A6 6 0 108 2a6 6 0 000 12zm-.75-5.75V5h1.5v3.25H7.25zm0 2.5v-1.5h1.5v1.5H7.25z"/></svg>
                  <p className="text-[12px] text-[#646462]">Los flujos de trabajo reutilizables utilizarán la configuración del flujo de trabajo que los activa.</p>
                </div>
                {/* Wait time */}
                <div className="flex flex-col gap-2 mt-1">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">¿Cuánto tiempo debe esperar el flujo de trabajo antes de cerrar la conversación?</p>
                  <select
                    value={waitTime}
                    onChange={e => { setWaitTime(e.target.value); persist({ automation_wait_time: e.target.value }); }}
                    className="w-fit border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[13px] text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a] bg-white"
                  >
                    {['1 minuto', '2 minutos', '3 minutos', '5 minutos', '10 minutos', '15 minutos', '30 minutos'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                {/* Close */}
                <div className="pt-3 border-t border-[#f0f0ee]">
                  <button type="button" onClick={() => setExpanded(null)} className="text-[12.5px] font-medium text-[#646462] hover:text-[#1a1a1a]">Cerrar</button>
                </div>
              </div>
            </AccRow>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AppStoreView ──────────────────────────────────────────────────────────────

const STORE_INTEGRATIONS = [
  // ── CRM ────────────────────────────────────────────────────────────────────
  {
    id: 'salesforce', name: 'Salesforce', category: 'CRM',
    desc: 'Sincroniza contactos, oportunidades y casos con Salesforce.',
    domain: 'salesforce.com', connected: false, color: '#00A1E0', backendLive: true,
    // OAuth popup → /api/integrations/salesforce/install
    auth: 'oauth', connectRoute: '/api/integrations/salesforce/install',
    permissions: ['Leer y escribir contactos, cuentas y oportunidades','Crear y actualizar casos de soporte (Salesforce Cases)','Registrar actividades y tareas desde conversaciones','Acceder a campos personalizados del objeto Contact'],
    fields: [],
  },
  {
    id: 'hubspot', name: 'HubSpot', category: 'CRM',
    desc: 'Sincroniza contactos y deals de HubSpot con el inbox.',
    domain: 'hubspot.com', connected: true, color: '#FF7A59', backendLive: true,
    // OAuth popup → /api/integrations/hubspot/install
    auth: 'oauth', connectRoute: '/api/integrations/hubspot/install',
    permissions: ['Leer y escribir contactos, empresas y deals','Sincronizar pipelines de ventas y etapas de negocio','Crear notas y tareas vinculadas a contactos','Acceder al historial de actividad del contacto'],
    fields: [],
  },
  {
    id: 'zendesk', name: 'Zendesk', category: 'CRM',
    desc: 'Importa tickets de Zendesk y gestiona todo desde Clain.',
    domain: 'zendesk.com', connected: false, color: '#03363D', backendLive: true,
    // OAuth popup → /api/integrations/zendesk/install?subdomain=<value>
    auth: 'oauth', connectRoute: '/api/integrations/zendesk/install',
    permissions: ['Leer y crear tickets de soporte','Actualizar estado, prioridad y asignatario de tickets','Acceder a datos del usuario y organización','Sincronizar comentarios entre Zendesk y Clain'],
    fields: [
      { key: 'subdomain', label: 'Subdominio de Zendesk', placeholder: 'mi-empresa', type: 'text', hint: 'Solo el prefijo — de mi-empresa.zendesk.com', required: true, queryParam: true },
    ],
  },
  {
    id: 'freshdesk', name: 'Freshdesk', category: 'CRM',
    desc: 'Centraliza tickets de Freshdesk en la bandeja de Clain.',
    domain: 'freshdesk.com', connected: false, color: '#2DC26B', backendLive: false,
    auth: 'apikey', connectRoute: null,
    permissions: ['Leer y crear tickets de Freshdesk','Actualizar estado, prioridad y agente asignado','Acceder a datos de contacto y empresa del cliente','Ver el historial de conversaciones previas'],
    fields: [
      { key: 'subdomain', label: 'Subdominio de Freshdesk', placeholder: 'mi-empresa', type: 'text', hint: 'Solo el prefijo — de mi-empresa.freshdesk.com', required: true },
      { key: 'api_key',   label: 'API Key',                 placeholder: 'Pega tu API key de Freshdesk…', type: 'password', hint: 'Profile Settings → Your API Key (esquina inferior izquierda en Freshdesk)', required: true },
    ],
  },
  // ── Canales ─────────────────────────────────────────────────────────────────
  {
    id: 'whatsapp', name: 'WhatsApp Business', category: 'Canales',
    desc: 'Recibe y responde mensajes de WhatsApp desde el inbox.',
    domain: 'whatsapp.com', connected: true, color: '#25D366', backendLive: true,
    // POST /api/integrations/whatsapp/connect  { phone_number_id, access_token, waba_id, app_secret, verify_token }
    auth: 'apikey', connectRoute: '/api/integrations/whatsapp/connect',
    permissions: ['Enviar y recibir mensajes desde tu número de negocio','Gestionar plantillas de mensajes aprobadas por Meta','Acceder al perfil de contacto del cliente en WhatsApp','Ver estado de entrega y lectura de mensajes'],
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID',              placeholder: '102938475610293',           type: 'text',     hint: 'Meta for Developers → Tu App → WhatsApp → Configuración del teléfono', required: true },
      { key: 'waba_id',         label: 'WhatsApp Business Account ID', placeholder: '109283746150293',           type: 'text',     hint: 'Meta Business Manager → Cuentas de WhatsApp → ID de cuenta', required: true },
      { key: 'access_token',    label: 'System User Access Token',     placeholder: 'EAAxxxxx…',                 type: 'password', hint: 'Meta Business Manager → Usuarios del sistema → Generar token (permanente)', required: true },
      { key: 'app_secret',      label: 'App Secret',                   placeholder: 'Desde configuración App Meta', type: 'password', hint: 'Meta for Developers → Tu App → Configuración → App Secret', required: true },
      { key: 'verify_token',    label: 'Verify Token (webhook)',        placeholder: 'mi-token-secreto-123',      type: 'text',     hint: 'Cadena que eliges tú — se usará para verificar el webhook de Meta', required: false },
    ],
  },
  {
    id: 'instagram', name: 'Instagram', category: 'Canales',
    desc: 'Gestiona DMs de Instagram desde tu bandeja de entrada.',
    domain: 'instagram.com', connected: true, color: '#E1306C', backendLive: true,
    // POST /api/integrations/instagram/connect  { ig_user_id, page_id, page_access_token, app_secret }
    auth: 'apikey', connectRoute: '/api/integrations/instagram/connect',
    permissions: ['Leer y responder mensajes directos de la cuenta de negocio','Acceder al perfil público del remitente','Ver menciones y comentarios en publicaciones (solo lectura)','Recibir notificaciones de nuevos mensajes en tiempo real'],
    fields: [
      { key: 'ig_user_id',        label: 'Instagram Business Account ID', placeholder: '17841400123456789', type: 'text',     hint: 'Meta Business Suite → Configuración → Cuenta de Instagram → ID', required: true },
      { key: 'page_id',           label: 'Facebook Page ID',              placeholder: '123456789012345',   type: 'text',     hint: 'Tu cuenta de Instagram de negocio debe estar vinculada a una Facebook Page. ID en Configuración → Información de la página', required: true },
      { key: 'page_access_token', label: 'Page Access Token',             placeholder: 'EAAxxxxx…',         type: 'password', hint: 'Graph API Explorer → selecciona tu página → genera token con instagram_basic + instagram_manage_messages', required: true },
      { key: 'app_secret',        label: 'App Secret',                    placeholder: 'Desde Meta App',    type: 'password', hint: 'Meta for Developers → Tu App → Configuración básica → App Secret', required: true },
    ],
  },
  {
    id: 'slack', name: 'Slack', category: 'Canales',
    desc: 'Notificaciones de conversaciones y escalados en Slack.',
    domain: 'slack.com', connected: true, color: '#4A154B', backendLive: true,
    // OAuth popup → /api/integrations/slack/install
    auth: 'oauth', connectRoute: '/api/integrations/slack/install',
    permissions: ['Enviar notificaciones a canales y usuarios seleccionados','Crear canales de escalado automático por equipo','Leer mensajes en canales de Slack conectados','Acceder al directorio de miembros del workspace'],
    fields: [],
  },
  {
    id: 'twilio', name: 'SMS · Twilio', category: 'Canales',
    desc: 'Envía y recibe SMS a través de Twilio en el workspace.',
    domain: 'twilio.com', connected: false, color: '#F22F46', backendLive: true,
    // POST /api/integrations/twilio/connect  { account_sid, auth_token, default_sms_from }
    auth: 'apikey', connectRoute: '/api/integrations/twilio/connect',
    permissions: ['Enviar y recibir SMS desde números Twilio asignados','Acceder al historial de mensajes de la cuenta','Gestionar números de teléfono y rutas de entrada','Ver estado de entrega de cada mensaje enviado'],
    fields: [
      { key: 'account_sid',      label: 'Account SID',            placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'text',     hint: 'Twilio Console → Dashboard → Account SID (empieza por AC)', required: true },
      { key: 'auth_token',       label: 'Auth Token',             placeholder: '••••••••••••••••••••••••••••••••',   type: 'password', hint: 'Twilio Console → Dashboard → Auth Token (junto al Account SID)', required: true },
      { key: 'default_sms_from', label: 'Número SMS por defecto', placeholder: '+34600000000',                       type: 'text',     hint: 'Twilio Console → Phone Numbers → Tu número comprado (formato E.164)', required: false },
    ],
  },
  // ── Pagos ───────────────────────────────────────────────────────────────────
  {
    id: 'stripe', name: 'Stripe', category: 'Pagos',
    desc: 'Consulta suscripciones, pagos y facturas desde cada caso.',
    domain: 'stripe.com', connected: true, color: '#635BFF', backendLive: true,
    // Two options: OAuth Connect → /api/integrations/stripe/install
    //              Manual API key → POST /api/integrations/stripe/manual-connect
    auth: 'stripe', connectRoute: '/api/integrations/stripe/install',
    permissions: ['Leer datos de clientes, suscripciones y planes (solo lectura)','Consultar historial de pagos, facturas y reembolsos','Ver estado de disputas y chargebacks activos','Acceder a metadatos de productos y precios configurados'],
    fields: [
      { key: 'secret_key',     label: 'Secret Key',      placeholder: 'sk_live_•••••• o rk_live_••••••', type: 'password', hint: 'Stripe Dashboard → Developers → API keys → Secret key', required: true },
      { key: 'webhook_secret', label: 'Webhook Secret',  placeholder: 'whsec_••••••••••••••••••••',        type: 'password', hint: 'Stripe Dashboard → Developers → Webhooks → Signing secret del endpoint apuntando a tu dominio', required: false },
    ],
  },
  {
    id: 'shopify', name: 'Shopify', category: 'Comercio',
    desc: 'Accede a pedidos y clientes de Shopify en conversaciones.',
    domain: 'shopify.com', connected: false, color: '#96BF48', backendLive: true,
    // OAuth popup → /api/integrations/shopify/install?shop=<shop>
    auth: 'oauth', connectRoute: '/api/integrations/shopify/install',
    permissions: ['Leer pedidos, estado de envío y devoluciones','Acceder al catálogo de productos y variantes','Consultar datos del cliente y su historial de compras','Ver inventario y estado de stock por producto'],
    fields: [
      { key: 'shop', label: 'Dominio de tu tienda Shopify', placeholder: 'mi-tienda.myshopify.com', type: 'text', hint: 'El dominio .myshopify.com de tu tienda (Shopify Admin → Settings → Domains)', required: true, queryParam: true },
    ],
  },
  // ── Productividad ───────────────────────────────────────────────────────────
  {
    id: 'jira', name: 'Jira', category: 'Productividad',
    desc: 'Crea issues de Jira desde conversaciones y sincroniza estado.',
    domain: 'atlassian.com', connected: false, color: '#0052CC', backendLive: true,
    auth: 'oauth', connectRoute: '/api/integrations/jira/install',
    permissions: ['Crear y actualizar issues en proyectos seleccionados','Leer estado, prioridad y asignatario de issues','Adjuntar conversaciones de Clain a issues existentes','Sincronizar cambios de estado entre Jira y Clain'],
    fields: [],
  },
  {
    id: 'linear', name: 'Linear', category: 'Productividad',
    desc: 'Crea y enlaza issues de Linear desde el inbox de soporte.',
    domain: 'linear.app', connected: true, color: '#5E6AD2', backendLive: true,
    auth: 'oauth', connectRoute: '/api/integrations/linear/install',
    permissions: ['Crear y actualizar issues en equipos seleccionados','Leer proyectos, ciclos y estados del workspace','Vincular conversaciones de soporte a issues de Linear','Sincronizar resolución de issues con cierre de conversación'],
    fields: [],
  },
  {
    id: 'notion', name: 'Notion', category: 'Productividad',
    desc: 'Guarda notas de conversaciones y crea páginas de Notion.',
    domain: 'notion.so', connected: false, color: '#000000', backendLive: true,
    auth: 'oauth', connectRoute: '/api/integrations/notion/install',
    permissions: ['Crear páginas en bases de datos seleccionadas','Leer y escribir bloques en páginas compartidas contigo','Guardar transcripciones y resúmenes de conversaciones','Acceder a bases de datos del workspace compartidas'],
    fields: [],
  },
  {
    id: 'github', name: 'GitHub', category: 'Productividad',
    desc: 'Vincula issues de GitHub a conversaciones para bugs.',
    domain: 'github.com', connected: false, color: '#24292E', backendLive: true,
    auth: 'oauth', connectRoute: '/api/integrations/github/install',
    permissions: ['Crear issues en repositorios seleccionados','Leer título, estado, etiquetas y comentarios de issues','Vincular conversaciones de soporte a issues existentes','Ver pull requests relacionados con issues abiertos'],
    fields: [],
  },
  // ── Analítica ───────────────────────────────────────────────────────────────
  {
    id: 'ga', name: 'Google Analytics', category: 'Analítica',
    desc: 'Mide el impacto del widget de chat en las conversiones.',
    domain: 'google.com', connected: false, color: '#E37400', backendLive: false,
    auth: 'apikey', connectRoute: null,
    permissions: ['Leer métricas de sesiones y eventos del sitio web','Acceder a datos de conversión vinculados al widget de chat','Ver informes de tráfico y fuentes de adquisición','Leer objetivos y embudos de conversión configurados'],
    fields: [
      { key: 'measurement_id', label: 'Measurement ID (GA4)', placeholder: 'G-XXXXXXXXXX', type: 'text', hint: 'Google Analytics → Admin → Data Streams → Tu stream → Measurement ID', required: true },
    ],
  },
  {
    id: 'delighted', name: 'Delighted', category: 'Analítica',
    desc: 'Dispara encuestas CSAT y NPS basadas en conversaciones.',
    domain: 'delighted.com', connected: false, color: '#FF6E6E', backendLive: false,
    auth: 'apikey', connectRoute: null,
    permissions: ['Enviar encuestas CSAT y NPS al cerrar conversaciones','Leer respuestas y puntuaciones de encuestas enviadas','Acceder a datos de personas encuestadas','Crear y gestionar campañas de encuesta por segmento'],
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Pega tu API key de Delighted…', type: 'password', hint: 'Delighted → Settings → API → Your API Key', required: true },
    ],
  },
  // ── IA ──────────────────────────────────────────────────────────────────────
  {
    id: 'openai', name: 'OpenAI', category: 'IA',
    desc: 'Conecta GPT-4o para respuestas generativas en el workspace.',
    domain: 'openai.com', connected: true, color: '#10A37F', backendLive: false,
    auth: 'apikey', connectRoute: null,
    permissions: ['Llamar a modelos GPT-4o y GPT-4o mini vía API','Enviar el contexto de la conversación como prompt','Usar function calling para automatizaciones del agente','Procesar imágenes adjuntas en conversaciones (visión)'],
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'sk-proj-••••••••••••••••••••••••••••••••', type: 'password', hint: 'platform.openai.com → API keys → Create new secret key', required: true },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', category: 'IA',
    desc: 'Usa Claude como modelo base para el agente AI de Clain.',
    domain: 'anthropic.com', connected: true, color: '#D97706', backendLive: false,
    auth: 'apikey', connectRoute: null,
    permissions: ['Llamar a Claude 3.5 Sonnet y Claude 3 Haiku vía API','Enviar historial de conversación como contexto del modelo','Ejecutar herramientas personalizadas del agente AI','Procesar documentos y archivos adjuntos en conversaciones'],
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'sk-ant-api03-••••••••••••••••••••••••••••••', type: 'password', hint: 'console.anthropic.com → API Keys → Create Key', required: true },
    ],
  },
  {
    id: 'zapier', name: 'Zapier', category: 'IA',
    desc: 'Conecta Clain con miles de apps a través de Zaps automáticos.',
    domain: 'zapier.com', connected: false, color: '#FF4A00', backendLive: false,
    auth: 'oauth', connectRoute: null,
    permissions: ['Activar Zaps desde eventos de conversaciones (trigger)','Enviar datos de contacto, caso y etiquetas a Zapier','Recibir acciones de Zapier en el inbox de Clain','Acceder a la lista de Zaps activos en tu cuenta'],
    fields: [],
  },
];

const STORE_CATS = ['Todas', 'CRM', 'Canales', 'Pagos', 'Comercio', 'Productividad', 'Analítica', 'IA'];

// ── Logo sources: Figma MCP primary, Clearbit + Google S2 as fallbacks ─────────
const INTEG_LOGO_OVERRIDES: Record<string, string> = {
  salesforce:  IMG_APP_SALESFORCE,
  instagram:   IMG_APP_INSTAGRAM,
  ga:          IMG_APP_GA,
  jira:        IMG_APP_JIRA,
  whatsapp:    IMG_APP_WHATSAPP,
  delighted:   IMG_APP_DELIGHTED,
  stripe:      IMG_APP_STRIPE,
};

// Three-level logo with graceful degradation
function AppLogoImg({ id, domain, name, color, size = 36 }: {
  id: string; domain: string; name: string; color: string; size?: number;
}) {
  // source index: 0 = Figma MCP, 1 = Clearbit, 2 = Google S2 favicon, 3 = letter fallback
  const sources = [
    INTEG_LOGO_OVERRIDES[id] ?? null,
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ].filter(Boolean) as string[];

  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    return (
      <div style={{
        width: size, height: size,
        borderRadius: Math.round(size * 0.22),
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.5) }}>{name[0]}</span>
      </div>
    );
  }
  return (
    <img
      key={sources[idx]}
      src={sources[idx]}
      alt={name}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: Math.round(size * 0.15) }}
      onError={() => setIdx(i => i + 1)}
    />
  );
}

// ── Connect Modal — real backend integration ─────────────────────────────────
type IntegField = {
  key: string; label: string; placeholder: string;
  type: 'text' | 'password'; hint?: string;
  required: boolean; queryParam?: boolean;
};

/** Open OAuth popup and resolve when the backend redirects back */
function openOAuthPopup(url: string): Promise<'connected' | 'error' | 'closed'> {
  return new Promise(resolve => {
    const w = 520, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top  = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(url, 'clain_oauth', `width=${w},height=${h},left=${left},top=${top},toolbar=0,menubar=0`);
    if (!popup) { resolve('error'); return; }

    // Listen for postMessage (oauthConnectors.ts uses window.opener.postMessage)
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'oauth_success') { cleanup(); resolve('connected'); }
      if (e.data?.type === 'oauth_error')   { cleanup(); resolve('error'); }
    };
    window.addEventListener('message', onMsg);

    // Poll popup URL for the individual route pattern (?connected= / ?error=)
    const poll = window.setInterval(() => {
      if (!popup || popup.closed) { cleanup(); resolve('closed'); return; }
      try {
        const href = popup.location.href;
        if (href.includes('connected=')) { cleanup(); popup.close(); resolve('connected'); }
        else if (href.includes('error=')) { cleanup(); popup.close(); resolve('error'); }
      } catch { /* cross-origin — still navigating to provider */ }
    }, 500);

    function cleanup() {
      window.clearInterval(poll);
      window.removeEventListener('message', onMsg);
    }
  });
}

function ConnectModal({ integ, onClose, onConnected }: {
  integ: typeof STORE_INTEGRATIONS[0];
  onClose: () => void;
  onConnected: () => void;
}) {
  const [vals, setVals]           = useState<Record<string, string>>({});
  const [step, setStep]           = useState<'form' | 'loading' | 'done' | 'error'>('form');
  const [errorMsg, setErrorMsg]   = useState('');
  const [errors, setErrors]       = useState<Record<string, boolean>>({});
  // Stripe: show oauth-vs-manual tabs
  const [stripeTab, setStripeTab] = useState<'oauth' | 'manual'>('oauth');

  const isOAuth   = integ.auth === 'oauth' || integ.auth === 'stripe';
  const isStripe  = integ.auth === 'stripe';

  const setVal = (key: string, v: string) => {
    setVals(p => ({ ...p, [key]: v }));
    setErrors(p => ({ ...p, [key]: false }));
  };

  const requiredFields = (integ.fields as IntegField[]).filter(f => f.required && !f.queryParam);
  const canSubmit = requiredFields.every(f => (vals[f.key] ?? '').trim() !== '');

  // ── OAuth (popup) ──────────────────────────────────────────────────────────
  const handleOAuth = async () => {
    if (!integ.connectRoute) return;

    // Build query params from fields marked queryParam:true
    let url = integ.connectRoute as string;
    const paramFields = (integ.fields as IntegField[]).filter(f => f.queryParam);
    if (paramFields.length > 0) {
      // Validate pre-params
      const newErrs: Record<string, boolean> = {};
      let ok = true;
      paramFields.forEach(f => {
        if (f.required && !(vals[f.key] ?? '').trim()) { newErrs[f.key] = true; ok = false; }
      });
      if (!ok) { setErrors(newErrs); return; }
      const qs = paramFields.map(f => `${f.key}=${encodeURIComponent(vals[f.key] ?? '')}`).join('&');
      url = `${url}?${qs}`;
    }

    setStep('loading');
    const result = await openOAuthPopup(url);
    if (result === 'connected') {
      setStep('done');
      onConnected();
    } else if (result === 'closed') {
      setStep('form'); // user closed popup manually
    } else {
      setErrorMsg('La autorización falló o fue cancelada. Inténtalo de nuevo.');
      setStep('error');
    }
  };

  // ── API Key POST /connect ──────────────────────────────────────────────────
  const handleApiKey = async (overrideRoute?: string) => {
    const route = overrideRoute ?? integ.connectRoute;

    // Validate
    const newErrs: Record<string, boolean> = {};
    let ok = true;
    (integ.fields as IntegField[]).forEach(f => {
      if (f.required && !(vals[f.key] ?? '').trim()) { newErrs[f.key] = true; ok = false; }
    });
    if (!ok) { setErrors(newErrs); return; }

    if (!route) {
      // No backend yet — just simulate
      setStep('done'); onConnected(); return;
    }

    setStep('loading');
    try {
      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(vals),
      });
      if (res.ok) {
        setStep('done'); onConnected();
      } else {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? `Error ${res.status}`);
        setStep('error');
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Error de red. Verifica que el servidor está activo.');
      setStep('error');
    }
  };

  // ── Stripe manual-connect ──────────────────────────────────────────────────
  const handleStripeManual = () => handleApiKey('/api/integrations/stripe/manual-connect');

  const handleConnect = () => {
    if (integ.auth === 'oauth') return handleOAuth();
    if (integ.auth === 'stripe') {
      return stripeTab === 'oauth' ? handleOAuth() : handleStripeManual();
    }
    return handleApiKey();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={step === 'loading' ? undefined : onClose}
    >
      <div
        className="bg-white rounded-[20px] shadow-2xl overflow-hidden flex flex-col"
        style={{ width: 520, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Loading overlay ── */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-10">
            <div className="w-10 h-10 rounded-full border-4 border-[#e9eae6] border-t-[#1a1a1a] animate-spin" />
            <p className="text-[14px] font-semibold text-[#1a1a1a]">
              {integ.auth === 'oauth' || (integ.auth === 'stripe' && stripeTab === 'oauth')
                ? 'Esperando autorización en la ventana emergente…'
                : 'Validando credenciales…'}
            </p>
            <p className="text-[12px] text-[#646462] text-center">
              {integ.auth === 'oauth' || (integ.auth === 'stripe' && stripeTab === 'oauth')
                ? `Completa el proceso en la ventana de ${integ.name} y vuelve aquí.`
                : 'Conectando con el servidor de ' + integ.name + '…'}
            </p>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="flex flex-col items-center gap-4 px-10 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#fee2e2] flex items-center justify-center mb-1">
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-[18px] font-bold text-[#1a1a1a]">Error al conectar</p>
            <p className="text-[13px] text-[#646462] leading-[1.6] max-w-[340px]">{errorMsg}</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setStep('form')} className="h-10 px-6 rounded-full bg-[#222] text-white text-[13px] font-semibold hover:bg-black">Reintentar</button>
              <button onClick={onClose} className="h-10 px-6 rounded-full border border-[#e9eae6] text-[13px] font-semibold text-[#646462] hover:border-[#c8c9c4]">Cerrar</button>
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {step === 'done' && (
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
            <button onClick={onClose} className="mt-3 h-10 px-8 rounded-full bg-[#222] text-white text-[13px] font-semibold hover:bg-black">Listo</button>
          </div>
        )}

        {/* ── Form ── */}
        {step === 'form' && (
          <>
            {/* Header */}
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
                <p className="text-[12px] text-[#646462] mt-0.5">
                  {integ.category} · {isOAuth ? 'OAuth 2.0' : 'API Key'}
                </p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f3f3f1] hover:bg-[#e9e9e7] flex items-center justify-center flex-shrink-0 transition-colors">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="#646462" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
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

                {/* Stripe: toggle OAuth vs manual */}
                {isStripe && (
                  <div className="flex gap-1 border-b border-[#e9eae6]">
                    {(['oauth', 'manual'] as const).map(t => (
                      <button key={t} onClick={() => setStripeTab(t)}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${stripeTab === t ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}>
                        {t === 'oauth' ? 'Stripe Connect (recomendado)' : 'API Key manual'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Fields / OAuth explanation */}
                {(integ.auth === 'apikey' || (isStripe && stripeTab === 'manual')) ? (
                  // API key fields
                  <div className="flex flex-col gap-4">
                    {(integ.auth === 'apikey' || (isStripe && stripeTab === 'manual')) && (
                      <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider -mb-1">Credenciales de acceso</p>
                    )}
                    {(integ.fields as IntegField[])
                      .filter(f => !f.queryParam)
                      .map(f => (
                      <div key={f.key} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[13px] font-semibold text-[#1a1a1a]">
                            {f.label}{f.required && <span className="text-[#e53e3e] ml-0.5">*</span>}
                          </label>
                          {!f.required && <span className="text-[11px] text-[#646462]">Opcional</span>}
                        </div>
                        <input
                          type={f.type === 'password' ? 'password' : 'text'}
                          value={vals[f.key] ?? ''}
                          onChange={e => setVal(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className={`w-full border rounded-[10px] px-3.5 py-2.5 text-[13px] focus:outline-none bg-[#fafaf9] ${
                            errors[f.key] ? 'border-[#e53e3e]' : 'border-[#e9eae6] focus:border-[#222]'
                          } ${f.type === 'password' ? 'font-mono' : ''}`}
                        />
                        {f.hint && <p className="text-[11.5px] text-[#646462] leading-[1.5]"><span className="font-semibold">Dónde encontrarlo: </span>{f.hint}</p>}
                        {errors[f.key] && <p className="text-[11.5px] text-[#e53e3e]">Este campo es obligatorio</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  // OAuth explanation + pre-params if needed
                  <div className="flex flex-col gap-4">
                    {/* Pre-OAuth query-param inputs (e.g. Zendesk subdomain, Shopify shop) */}
                    {(integ.fields as IntegField[]).filter(f => f.queryParam).map(f => (
                      <div key={f.key} className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-semibold text-[#1a1a1a]">
                          {f.label}{f.required && <span className="text-[#e53e3e] ml-0.5">*</span>}
                        </label>
                        <input
                          type="text"
                          value={vals[f.key] ?? ''}
                          onChange={e => setVal(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className={`w-full border rounded-[10px] px-3.5 py-2.5 text-[13px] focus:outline-none bg-[#fafaf9] ${
                            errors[f.key] ? 'border-[#e53e3e]' : 'border-[#e9eae6] focus:border-[#222]'
                          }`}
                        />
                        {f.hint && <p className="text-[11.5px] text-[#646462]"><span className="font-semibold">Dónde: </span>{f.hint}</p>}
                        {errors[f.key] && <p className="text-[11.5px] text-[#e53e3e]">Este campo es obligatorio</p>}
                      </div>
                    ))}
                    {/* OAuth card */}
                    <div className="flex items-center gap-3 bg-[#f8f8f7] rounded-[12px] px-4 py-3.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[14px]" style={{ background: integ.color }}>
                        {integ.name[0]}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">
                          {isStripe && stripeTab === 'oauth' ? 'Stripe Connect OAuth' : 'Autenticación OAuth 2.0'}
                        </p>
                        <p className="text-[12px] text-[#646462] mt-0.5">
                          Se abrirá una ventana segura de {integ.name} para autorizar el acceso. No almacenamos tu contraseña.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 pb-6 pt-4 border-t border-[#e9eae6] flex gap-2.5 flex-shrink-0">
              <button
                onClick={handleConnect}
                className="flex-1 h-10 rounded-full bg-[#222] text-white text-[13px] font-semibold hover:bg-black transition-colors"
              >
                {integ.auth === 'oauth' || (isStripe && stripeTab === 'oauth')
                  ? `Conectar con ${integ.name}`
                  : 'Guardar y conectar'}
              </button>
              <button onClick={onClose} className="h-10 px-5 rounded-full border border-[#e9eae6] text-[13px] font-semibold text-[#646462] hover:border-[#c8c9c4] hover:text-[#1a1a1a] transition-colors">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AppStoreView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch]         = useState('');
  const [category, setCategory]     = useState('Todas');
  const [connecting, setConnecting] = useState<typeof STORE_INTEGRATIONS[0] | null>(null);
  const [connected, setConnected]   = useState<Set<string>>(
    () => new Set(STORE_INTEGRATIONS.filter(i => i.connected).map(i => i.id))
  );

  const filtered = STORE_INTEGRATIONS.filter(i => {
    const matchCat = category === 'Todas' || i.category === category;
    const matchQ   = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.desc.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        {/* Main panel */}
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h1 className="text-[20px] font-bold text-[#1a1a1a]">Integraciones</h1>
              <p className="text-[13px] text-[#646462] mt-0.5">Conecta Clain con las herramientas que ya usas</p>
            </div>
            <div className="relative">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar integración..."
                className="border border-[#e9eae6] rounded-full pl-8 pr-3 py-[6px] text-[13px] w-52 focus:outline-none focus:border-[#222]"
              />
            </div>
          </div>

          {/* Category pills + stats */}
          <div className="px-6 pt-4 pb-3 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex gap-2 flex-wrap mb-3">
              {STORE_CATS.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-full border transition-colors ${
                    category === cat
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'bg-white text-[#646462] border-[#e9eae6] hover:border-[#1a1a1a] hover:text-[#1a1a1a]'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-[#646462]">{filtered.length} integraciones</span>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#15803d]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" />
                {filtered.filter(i => connected.has(i.id)).length} conectadas
              </span>
            </div>
          </div>

          {/* Integration grid */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
              {filtered.map(integ => {
                const isConn = connected.has(integ.id);
                return (
                  <div
                    key={integ.id}
                    className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex flex-col gap-3 hover:border-[#c8c9c4] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all cursor-pointer"
                  >
                    {/* Logo + badge */}
                    <div className="flex items-start justify-between">
                      <div className="w-[48px] h-[48px] rounded-[12px] bg-[#f3f3f1] border border-[#e9eae6] flex items-center justify-center overflow-hidden flex-shrink-0">
                        <AppLogoImg id={integ.id} domain={integ.domain} name={integ.name} color={integ.color} size={32} />
                      </div>
                      {isConn && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-[#15803d] bg-[#dcfce7] px-2 py-0.5 rounded-full">
                          <span className="w-1 h-1 rounded-full bg-[#22c55e] inline-block" />
                          Conectado
                        </span>
                      )}
                    </div>

                    {/* Name + desc */}
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{integ.name}</p>
                      <p className="text-[12px] text-[#646462] leading-[1.55] line-clamp-2">{integ.desc}</p>
                    </div>

                    {/* CTA */}
                    <button
                      onClick={() => setConnecting(integ)}
                      className={`w-full h-[34px] rounded-full text-[12px] font-semibold border transition-colors ${
                        isConn
                          ? 'border-[#e9eae6] text-[#646462] hover:border-[#1a1a1a] hover:text-[#1a1a1a] bg-white'
                          : 'bg-[#1a1a1a] border-[#1a1a1a] text-white hover:bg-black'
                      }`}
                    >
                      {isConn ? 'Configurar' : 'Conectar'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {connecting && (
        <ConnectModal
          integ={connecting}
          onClose={() => setConnecting(null)}
          onConnected={() => setConnected(prev => new Set([...prev, connecting!.id]))}
        />
      )}
    </div>
  );
}

// ── ConnectorsView ────────────────────────────────────────────────────────────

const CONNECTOR_CARDS: { svg: string; label: string; bg: string }[] = [
  { svg: SVG_CONN_CREATE,  label: 'Crear desde cero',     bg: '#f8f8f7' },
  { svg: SVG_CONN_MCP,     label: 'MCP personalizado',    bg: '#f8f8f7' },
  { svg: SVG_CONN_STRIPE,  label: 'Stripe',               bg: '#d1e0fa' },
  { svg: SVG_CONN_LINEAR,  label: 'Linear',               bg: '#d9dbf2' },
  { svg: SVG_CONN_SHOPIFY, label: 'Shopify Storefront',   bg: '#e2f0db' },
  { svg: SVG_CONN_USAGE,   label: 'Uso de conectores de datos\npara la automatización', bg: '#f8f8f7' },
];

export function ConnectorsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: connectors, loading: connectorsLoading } = useApi(() => connectorsApi.list(), [], []);

  // Modal state
  type ModalType = null | 'mcp' | 'stripe' | 'linear' | 'shopify' | 'editor';
  const [modal, setModal] = useState<ModalType>(null);
  const close = () => setModal(null);

  // MCP modal fields
  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpAuthType, setMcpAuthType] = useState('Token o clave de API');
  const [mcpToken, setMcpToken] = useState('');
  const [mcpAuthOpen, setMcpAuthOpen] = useState(false);

  // Stripe modal
  const [stripeTokenId, setStripeTokenId] = useState('');
  const [stripeTokenOpen, setStripeTokenOpen] = useState(false);

  // Shopify modal
  const [shopifyUrl, setShopifyUrl] = useState('');

  // Linear modal
  const [linearApiKey, setLinearApiKey] = useState('');

  // Connected services (in-session)
  const [connected, setConnected] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // Editor state
  const [editorTab, setEditorTab] = useState<'api' | 'datos' | 'fin' | 'seguridad'>('api');
  const [editorTitle, setEditorTitle] = useState('Sin título');
  const [editorDesc, setEditorDesc] = useState('');
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiUrl, setApiUrl] = useState('');
  const [methodOpen, setMethodOpen] = useState(false);
  const [authType, setAuthType] = useState('Sin autenticación');
  const [authOpen, setAuthOpen] = useState(false);
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([
    { key: 'X-Intercom-Verified-Email', value: 'Correo electrónico de usuario verificado' }
  ]);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderVal, setNewHeaderVal] = useState('');
  const [dataInputs, setDataInputs] = useState<string[]>([]);
  const [mockMode, setMockMode] = useState<'mock' | 'live' | null>(null);

  const hasConnectors = connectors.length > 0 || connected.length > 0;

  // Full-screen editor
  if (modal === 'editor') {
    return (
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={{ background: '#f3f3f1' }}>
        {/* Editor top bar */}
        <div className="flex items-center px-6 h-[52px] bg-white border-b border-[#e9eae6] flex-shrink-0 gap-3">
          <input
            value={editorTitle}
            onChange={e => setEditorTitle(e.target.value)}
            className="text-[15px] font-semibold text-[#1a1a1a] bg-transparent outline-none border-none min-w-0 flex-1 max-w-[200px]"
          />
          <div className="flex-1" />
          {/* History */}
          <button className="w-8 h-8 flex items-center justify-center rounded-[6px] hover:bg-[#f3f3f1] text-[#646462]">
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M2 8a6 6 0 1 0 1.5-3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {/* More */}
          <button className="w-8 h-8 flex items-center justify-center rounded-[6px] hover:bg-[#f3f3f1] text-[#646462]">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><circle cx="3" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="13" cy="8" r="1.3"/></svg>
          </button>
          <button
            onClick={() => showToast('Conector guardado')}
            className="text-[13px] font-semibold text-[#1a1a1a] hover:opacity-70 px-1"
          >Guardar</button>
          <button className="flex items-center gap-1.5 text-[13px] font-semibold text-[#646462] hover:text-[#1a1a1a]">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M4 8l8-8v16L4 8z"/></svg>
            Establecer en vivo
          </button>
          <button className="text-[13px] font-semibold text-[#1a1a1a] bg-[#f3f3f1] hover:bg-[#ededea] rounded-full px-3 py-1.5">Vista previa de Fin</button>
          <button onClick={close} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 bg-white border-b border-[#e9eae6] flex-shrink-0">
          {([
            { id: 'api' as const,       num: 1, label: 'API' },
            { id: 'datos' as const,     num: 2, label: 'Datos' },
            { id: 'fin' as const,       num: 3, label: 'Fin' },
            { id: 'seguridad' as const, num: 4, label: 'Seguridad' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setEditorTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                editorTab === t.id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
              }`}
            >
              <span className={`text-[12px] ${editorTab === t.id ? 'text-[#fa7938]' : 'text-[#c0c0bc]'}`}>{t.num}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-10 py-6 flex flex-col gap-4 max-w-[900px]">

          {editorTab === 'api' && <>
            {/* Descripción */}
            <div className="bg-white rounded-[10px] border border-[#e9eae6] p-5">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Descripción</h3>
              <p className="text-[12px] text-[#646462] mb-3">Interna, solo para consulta de su equipo.</p>
              <textarea
                value={editorDesc}
                onChange={e => setEditorDesc(e.target.value)}
                placeholder="Entrar"
                rows={3}
                className="w-full border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[13px] text-[#1a1a1a] outline-none focus:border-[#3b59f6] resize-none"
              />
            </div>

            {/* Entradas de datos */}
            <div className="bg-white rounded-[10px] border border-[#e9eae6] p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Entradas de datos</h3>
                  <p className="text-[12px] text-[#646462] max-w-[480px]">Especifica si debe recoger algún dato antes de ejecutar este conector de datos. Las entradas pueden provenir del historial de conversaciones, acciones anteriores o preguntando al cliente.</p>
                </div>
                <button
                  onClick={() => setDataInputs(p => [...p, ''])}
                  className="flex items-center gap-1 text-[13px] font-semibold text-[#1a1a1a] hover:opacity-70 flex-shrink-0 ml-4"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                  Entrada de datos
                </button>
              </div>
              {dataInputs.map((inp, i) => (
                <div key={i} className="flex items-center gap-2 mt-2">
                  <input
                    value={inp}
                    onChange={e => setDataInputs(p => p.map((v, j) => j === i ? e.target.value : v))}
                    placeholder="Nombre de la entrada"
                    className="flex-1 border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[13px] outline-none focus:border-[#3b59f6]"
                  />
                  <button onClick={() => setDataInputs(p => p.filter((_, j) => j !== i))} className="text-[#9a9a98] hover:text-[#1a1a1a]">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Punto final de API */}
            <div className="bg-white rounded-[10px] border border-[#e9eae6] p-5">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a]">Punto final de API</h3>
                <span className="bg-[#fef3c7] text-[#92400e] text-[11px] font-semibold px-2 py-0.5 rounded-[4px]">Obligatorio</span>
              </div>
              <p className="text-[12px] text-[#646462] mb-4">Ingrese el endpoint de la API que debe llamarse para acceder o actualizar datos.</p>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-medium text-[#1a1a1a] w-[80px] flex-shrink-0 flex items-center gap-1">
                    Métodos
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#9a9a98]"><circle cx="8" cy="8" r="5.5" opacity="0.25"/><path d="M8 7v4M8 5.3v.7" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => setMethodOpen(o => !o)}
                      className="flex items-center gap-2 border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[13px] font-medium text-[#1a1a1a] bg-white hover:bg-[#f8f8f7]"
                    >
                      {apiMethod}
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                    </button>
                    {methodOpen && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-[#e9eae6] rounded-[8px] shadow-lg z-10 min-w-[80px] overflow-hidden">
                        {['GET','POST','PUT','PATCH','DELETE'].map(m => (
                          <button key={m} onClick={() => { setApiMethod(m); setMethodOpen(false); }}
                            className={`block w-full text-left px-3 py-2 text-[13px] hover:bg-[#f3f3f1] ${apiMethod === m ? 'font-semibold text-[#1a1a1a]' : 'text-[#646462]'}`}
                          >{m}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-medium text-[#1a1a1a] w-[80px] flex-shrink-0 flex items-center gap-1">
                    URL HTTPS
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#9a9a98]"><circle cx="8" cy="8" r="5.5" opacity="0.25"/><path d="M8 7v4M8 5.3v.7" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
                  </span>
                  <div className="flex-1">
                    <input
                      value={apiUrl}
                      onChange={e => setApiUrl(e.target.value)}
                      placeholder="Entrar"
                      className="w-full border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[13px] outline-none focus:border-[#3b59f6]"
                    />
                    <p className="text-[11px] text-[#9a9a98] mt-1">Ejemplo: https://example.com/api/v1/</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Probar */}
            <div className="bg-white rounded-[10px] border border-[#e9eae6] p-5">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a]">Probar</h3>
                <span className="bg-[#fef3c7] text-[#92400e] text-[11px] font-semibold px-2 py-0.5 rounded-[4px]">Obligatorio</span>
              </div>
              <p className="text-[12px] text-[#646462] mb-4">Utilice una respuesta simulada si su API aún no está lista o ejecute una solicitud en vivo para confirmar su endpoint, la autenticación y el formato de respuesta.</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setMockMode('mock')}
                  className={`flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${mockMode === 'mock' ? 'border-[#3b59f6] bg-[#eef1ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}
                >
                  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5"><path d="M2 8h4M10 8h4M8 2v4M8 10v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  Respuesta simulada
                </button>
                <button
                  onClick={() => setMockMode('live')}
                  className={`flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${mockMode === 'live' ? 'border-[#3b59f6] bg-[#eef1ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M4 8l8-8v16L4 8z"/></svg>
                  Prueba de conexión en vivo
                </button>
                <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-1.5 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]">
                  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5"><path d="M8 1C4.7 1 2 3.7 2 7s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 2c.7 0 1.4.2 2 .5L4.5 9c-.3-.6-.5-1.3-.5-2 0-2.2 1.8-4 4-4zm0 8c-.7 0-1.4-.2-2-.5l5.5-5.5c.3.6.5 1.3.5 2 0 2.2-1.8 4-4 4z" fill="currentColor" opacity="0.6"/></svg>
                  Probar
                </button>
              </div>
              {mockMode === 'mock' && (
                <div className="mt-4 bg-[#f8f8f7] rounded-[8px] p-4">
                  <p className="text-[12px] text-[#646462] mb-2">Ingresa una respuesta JSON simulada:</p>
                  <textarea rows={4} placeholder='{"data": "ejemplo"}' className="w-full border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[12px] font-mono outline-none focus:border-[#3b59f6] resize-none bg-white"/>
                </div>
              )}
            </div>

            {/* Tokens de autenticación */}
            <div className="bg-white rounded-[10px] border border-[#e9eae6] p-5">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Tokens de autenticación</h3>
              <p className="text-[12px] text-[#646462] mb-3">Seleccione las credenciales del token si su API las requiere. Los tokens identifican de forma segura su conector cuando realiza una solicitud.</p>
              <div className="relative inline-block">
                <button
                  onClick={() => setAuthOpen(o => !o)}
                  className="flex items-center gap-2 border border-[#e9eae6] rounded-full px-3 py-1.5 text-[13px] font-medium text-[#1a1a1a] bg-white hover:bg-[#f8f8f7]"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#646462]"><path d="M8 1L4 5h3v5H5l3 5 3-5H9V5h3L8 1z" opacity="0.5"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
                  {authType}
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                </button>
                {authOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-[#e9eae6] rounded-[8px] shadow-lg z-10 min-w-[200px] overflow-hidden">
                    {['Sin autenticación', 'Bearer token', 'API key', 'OAuth 2.0', 'Basic auth'].map(a => (
                      <button key={a} onClick={() => { setAuthType(a); setAuthOpen(false); }}
                        className={`block w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#f3f3f1] ${authType === a ? 'font-semibold text-[#1a1a1a]' : 'text-[#646462]'}`}
                      >{a}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Encabezados */}
            <div className="bg-white rounded-[10px] border border-[#e9eae6] p-5 mb-6">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Encabezados</h3>
              <p className="text-[12px] text-[#646462] mb-4">Agregue pares de valores clave que proporcionen información adicional para su solicitud de API, como preferencias de formato o metadatos personalizados requeridos por su sistema.</p>
              <button
                onClick={() => { if (newHeaderKey.trim()) { setHeaders(p => [...p, { key: newHeaderKey.trim(), value: newHeaderVal.trim() }]); setNewHeaderKey(''); setNewHeaderVal(''); } }}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1a1a1a] hover:opacity-70 mb-4"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                Agregue la clave y el valor
              </button>
              {/* New header inputs */}
              <div className="flex gap-2 mb-3">
                <input value={newHeaderKey} onChange={e => setNewHeaderKey(e.target.value)} placeholder="Clave" className="flex-1 border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[12px] outline-none focus:border-[#3b59f6]" />
                <input value={newHeaderVal} onChange={e => setNewHeaderVal(e.target.value)} placeholder="Valor" className="flex-1 border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[12px] outline-none focus:border-[#3b59f6]" />
              </div>
              {headers.length > 0 && (
                <table className="w-full text-[13px]">
                  <thead><tr><th className="text-left text-[12px] font-medium text-[#646462] pb-2 w-1/2">Clave</th><th className="text-left text-[12px] font-medium text-[#646462] pb-2">Valor</th><th className="w-8"/></tr></thead>
                  <tbody>
                    {headers.map((h, i) => (
                      <tr key={i} className="border-t border-[#f3f3f1]">
                        <td className="py-2 pr-4 text-[#1a1a1a]">{h.key}</td>
                        <td className="py-2 text-[#646462]">{h.value}</td>
                        <td className="py-2 text-right">
                          <button onClick={() => setHeaders(p => p.filter((_, j) => j !== i))} className="text-[#9a9a98] hover:text-[#e11d48]">
                            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>}

          {editorTab === 'datos' && (
            <div className="flex flex-col gap-4">
              {/* Card 1: Restringir y configurar los datos */}
              <div className="bg-white rounded-[10px] border border-[#e9eae6] overflow-hidden">
                <div className="px-6 py-5 border-b border-[#e9eae6] flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Restringir y configurar los datos</h3>
                    <p className="text-[12.5px] text-[#646462] mt-0.5">Selecciona los campos de respuesta que Fin y tus compañeros pueden ver.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7] transition-colors">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#646462]"><path d="M13 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1zM7 7H5V5h2v2zm0 4H5V9h2v2zm4-4H9V5h2v2zm0 4H9V9h2v2z"/></svg>
                      Tabla
                    </button>
                    <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7] transition-colors">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#646462]"><path d="M3 3h2v2H3V3zm0 4h2v2H3V7zm0 4h2v2H3v-2zm4-8h6v2H7V3zm0 4h6v2H7V7zm0 4h6v2H7v-2z"/></svg>
                      Python
                    </button>
                  </div>
                </div>
                <div className="px-6 py-10 flex flex-col items-center justify-center text-center">
                  <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10 mb-3 opacity-25"><rect x="4" y="4" width="32" height="32" rx="4" stroke="#1a1a1a" strokeWidth="2"/><path d="M4 13h32M13 4v32" stroke="#1a1a1a" strokeWidth="2"/></svg>
                  <p className="text-[13px] font-medium text-[#646462]">Aún no hay campos de respuesta</p>
                  <p className="text-[12px] text-[#9a9a98] mt-1 max-w-[300px]">Haz una prueba de conexión en la pestaña API para detectar los campos automáticamente.</p>
                </div>
              </div>
              {/* Card 2: Mapeo de objetos */}
              <div className="bg-white rounded-[10px] border border-[#e9eae6] overflow-hidden">
                <div className="px-6 py-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Mapeo de objetos</h3>
                    <p className="text-[12.5px] text-[#646462] mt-0.5">Vincula los datos devueltos con objetos de Clain (contactos, empresas, conversaciones).</p>
                  </div>
                  <button className="border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7] transition-colors">+ Añadir mapeo</button>
                </div>
                <div className="px-6 pb-6 flex flex-col items-center text-center">
                  <p className="text-[12px] text-[#9a9a98]">No hay mapeos configurados. Añade uno para enriquecer los perfiles automáticamente.</p>
                </div>
              </div>
            </div>
          )}

          {editorTab === 'fin' && (
            <div className="flex flex-col gap-4">
              {/* Card: ¿Cómo debe Fin usar este conector? */}
              <div className="bg-white rounded-[10px] border border-[#e9eae6] overflow-hidden">
                <div className="px-6 py-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a1a]">¿Cómo debe Fin usar este conector?</h3>
                    <p className="text-[12.5px] text-[#646462] mt-0.5">Controla si Fin puede acceder a este conector al responder conversaciones.</p>
                  </div>
                  {/* Toggle OFF */}
                  <button className="w-10 h-6 rounded-full bg-[#d4d4d0] flex items-center px-0.5 flex-shrink-0 transition-colors">
                    <span className="w-5 h-5 rounded-full bg-white shadow-sm translate-x-0 transition-transform"/>
                  </button>
                </div>
                {/* Yellow warning box */}
                <div className="mx-6 mb-5 flex items-start gap-3 rounded-[8px] px-4 py-3" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#d97706' }}>
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.5h1.5v5h-1.5v-5zm0 6h1.5v1.5h-1.5V10.5z"/>
                  </svg>
                  <p className="text-[12.5px]" style={{ color: '#92400e' }}>
                    Fin no podrá usar este conector hasta que lo actives. Actívalo cuando hayas terminado de configurarlo y probado que funciona correctamente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {editorTab === 'seguridad' && (
            <div className="flex flex-col gap-4">
              {/* Card: Autenticación de clientes */}
              <div className="bg-white rounded-[10px] border border-[#e9eae6] overflow-hidden">
                <div className="px-6 py-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Autenticación de clientes</h3>
                    <p className="text-[12.5px] text-[#646462] mt-0.5">Verifica la identidad del usuario antes de devolver datos sensibles.</p>
                  </div>
                  {/* Toggle ON — orange */}
                  <button className="w-10 h-6 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors" style={{ background: '#f97316' }}>
                    <span className="w-5 h-5 rounded-full bg-white shadow-sm translate-x-4 transition-transform"/>
                  </button>
                </div>
              </div>
              {/* Card: Verificación de seguridad */}
              <div className="bg-white rounded-[10px] border border-[#e9eae6] overflow-hidden">
                <div className="px-6 py-5">
                  <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">Verificación de seguridad</h3>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-[#f3f3f1] text-[#646462]">Aún no evaluado</span>
                  </div>
                  {/* Grey info box */}
                  <div className="flex items-start gap-3 rounded-[8px] px-4 py-3 bg-[#f8f8f7] border border-[#e9eae6]">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#646462]">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.5h1.5v5h-1.5v-5zm0 6h1.5v1.5h-1.5V10.5z"/>
                    </svg>
                    <p className="text-[12.5px] text-[#646462]">
                      Realiza una prueba de conexión en la pestaña API para evaluar la seguridad de este conector. La verificación comprueba si los datos sensibles están correctamente protegidos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#1a1a1a] text-white text-[13px] font-medium rounded-[8px] px-4 py-2.5 shadow-lg flex items-center gap-2">
            <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0"><path d="M3 8l3.5 3.5L13 4" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ── Main connectors list view ──────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden relative">

          {/* Toast */}
          {toast && (
            <div className="absolute top-4 right-4 z-10 bg-[#1a1a1a] text-white text-[13px] font-medium rounded-[8px] px-4 py-2.5 shadow-lg flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0"><path d="M3 8l3.5 3.5L13 4" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              {toast}
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Conectores de datos</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              <button onClick={() => setModal('mcp')} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nuevo</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {hasConnectors ? (
              <div className="px-6 py-5 flex flex-col gap-4">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12.5px] bg-white flex-1 min-w-[180px] max-w-[260px]">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#9a9a98] flex-shrink-0"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.44 1.406a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"/></svg>
                    <input placeholder="Buscar conectores…" className="outline-none text-[12.5px] bg-transparent w-full placeholder-[#9a9a98]"/>
                  </div>
                  <button className="flex items-center gap-1 border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12.5px] text-[#646462] bg-white hover:bg-[#f8f8f7]">
                    Estado <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M4 6l4 4 4-4"/></svg>
                  </button>
                  <button className="flex items-center gap-1 border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12.5px] text-[#646462] bg-white hover:bg-[#f8f8f7]">
                    Tipo <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path d="M4 6l4 4 4-4"/></svg>
                  </button>
                  <div className="ml-auto">
                    <button onClick={() => setModal('editor')} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-1.5 text-[12.5px] font-semibold hover:bg-[#333] transition-colors">
                      + Nuevo conector de datos
                    </button>
                  </div>
                </div>

                {/* Table section — collapsible */}
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden bg-white">
                  {/* Section header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e9eae6] bg-[#f8f8f7]">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#646462]"><path d="M6 4l4 4-4 4z"/></svg>
                    <span className="text-[12.5px] font-semibold text-[#646462]">Conectores de datos ({connected.length + connectors.length})</span>
                  </div>
                  {/* Table */}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#e9eae6]">
                        {['Nombre', 'Estado', 'Salud', 'Seguridad', 'Utilizado por', 'Fin', 'Última actualización'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-[#9a9a98] uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                        <th className="w-8"/>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f3f3f1]">
                      {connected.map((svc) => (
                        <tr key={svc} className="hover:bg-[#fafaf9] cursor-pointer group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center text-[13px] font-bold text-[#1a1a1a] flex-shrink-0">{svc[0]}</div>
                              <span className="text-[13px] font-semibold text-[#1a1a1a]">{svc}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#166534]">Activo</span></td>
                          <td className="px-4 py-3"><span className="text-[12px] text-[#16a34a] font-medium">● Buena</span></td>
                          <td className="px-4 py-3"><span className="text-[12px] text-[#646462]">Estándar</span></td>
                          <td className="px-4 py-3"><span className="text-[12px] text-[#646462]">Fin, Agentes</span></td>
                          <td className="px-4 py-3"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#16a34a] fill-current"><path d="M3 8l3.5 3.5L13 4"/></svg></td>
                          <td className="px-4 py-3 text-[12px] text-[#9a9a98]">Hace 2 días</td>
                          <td className="px-4 py-3">
                            <button className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-[#f3f3f1]">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#646462]"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {connectors.map((c: any) => (
                        <tr key={c.id} className="hover:bg-[#fafaf9] cursor-pointer group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center text-[15px] flex-shrink-0">{c.icon ?? '🔌'}</div>
                              <span className="text-[13px] font-semibold text-[#1a1a1a]">{c.name ?? c.id}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.status === 'active' || c.isActive ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#f3f3f1] text-[#646462]'}`}>{c.status === 'active' || c.isActive ? 'Activo' : 'Inactivo'}</span></td>
                          <td className="px-4 py-3 text-[12px] text-[#9a9a98]">—</td>
                          <td className="px-4 py-3 text-[12px] text-[#9a9a98]">—</td>
                          <td className="px-4 py-3 text-[12px] text-[#9a9a98]">—</td>
                          <td className="px-4 py-3 text-[12px] text-[#9a9a98]">—</td>
                          <td className="px-4 py-3 text-[12px] text-[#9a9a98]">—</td>
                          <td className="px-4 py-3">
                            <button className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-[#f3f3f1]">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#646462]"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MCP section */}
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden bg-white">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e9eae6] bg-[#f8f8f7]">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#646462]"><path d="M6 4l4 4-4 4z"/></svg>
                    <span className="text-[12.5px] font-semibold text-[#646462]">Servidores MCP (0)</span>
                  </div>
                  <div className="px-4 py-8 flex flex-col items-center text-center">
                    <p className="text-[12.5px] text-[#9a9a98]">No hay servidores MCP configurados.</p>
                    <button onClick={() => setModal('mcp')} className="mt-3 text-[12.5px] font-semibold text-[#3b59f6] hover:underline">+ Agregar servidor MCP</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-12 py-12 flex flex-col items-center">
                <h2 className="text-[28px] font-bold text-[#1a1a1a] text-center mb-3 leading-tight">Incorpore datos de sus clientes<br/>en tiempo real en Intercom</h2>
                <p className="text-[14px] text-[#646462] text-center mb-10 max-w-[600px]">Conéctese a cualquier sistema externo o API personalizada con Conectores de datos sin código. Impulse Fin y el servicio de asistencia con datos en tiempo real para ofrecer asistencia más personalizada.</p>
                <ConnectorCardGrid onCardClick={(label) => {
                  if (label === 'Stripe') setModal('stripe');
                  else if (label === 'Shopify Storefront') setModal('shopify');
                  else if (label === 'Linear') setModal('linear');
                  else if (label === 'Crear desde cero') setModal('editor');
                  else if (label === 'MCP personalizado') setModal('mcp');
                }} />
              </div>
            )}
          </div>

          {/* ── Modal overlay ─────────────────────────────────────────── */}
          {modal && modal !== 'editor' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>

              {/* MCP modal */}
              {modal === 'mcp' && (
                <div className="bg-white rounded-[16px] w-full max-w-[520px] mx-4 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-5">
                    <h2 className="text-[16px] font-semibold text-[#1a1a1a]">Agregar servidor MCP</h2>
                    <button onClick={close} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                    </button>
                  </div>
                  <div className="px-6 pb-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-[#1a1a1a]">Nombre</label>
                      <input value={mcpName} onChange={e => setMcpName(e.target.value)} placeholder="Nombre del servidor"
                        className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a1a]"/>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-[#1a1a1a]">URL</label>
                      <input value={mcpUrl} onChange={e => setMcpUrl(e.target.value)} placeholder="https://mcp.example.com"
                        className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a1a]"/>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-[#1a1a1a]">Autenticación</label>
                      <div className="relative">
                        <button onClick={() => setMcpAuthOpen(o => !o)}
                          className="w-full flex items-center justify-between border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] text-[#1a1a1a] bg-white hover:bg-[#f8f8f7]">
                          {mcpAuthType}
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                        </button>
                        {mcpAuthOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e9eae6] rounded-[8px] shadow-lg z-10 overflow-hidden">
                            {['Sin autenticación', 'Token o clave de API', 'Bearer token', 'Basic auth'].map(a => (
                              <button key={a} onClick={() => { setMcpAuthType(a); setMcpAuthOpen(false); }}
                                className={`block w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#f3f3f1] ${mcpAuthType === a ? 'font-semibold' : ''}`}>{a}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {mcpAuthType !== 'Sin autenticación' && (
                        <>
                          <input
                            type="password"
                            value={mcpToken}
                            onChange={e => setMcpToken(e.target.value)}
                            placeholder="••••••••••"
                            className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a1a] bg-[#f8f9ff]"
                          />
                          <p className="text-[12px] text-[#646462] leading-[1.5]">
                            Por defecto, los tokens de API se envían en el encabezado "Authorization" con el prefijo "Bearer".{' '}
                            <a href="#" className="text-[#3b59f6] hover:underline">Cree un token personalizado</a> para cambiar cualquiera de ellos.
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button onClick={close} className="text-[13px] font-semibold text-[#1a1a1a] hover:opacity-70 px-2">Cancelar</button>
                      <button
                        onClick={() => { if (mcpName.trim()) { setConnected(p => [...p, mcpName.trim()]); showToast(`Servidor MCP "${mcpName.trim()}" añadido`); } close(); setMcpName(''); setMcpUrl(''); setMcpToken(''); }}
                        className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]"
                      >Añadir servidor</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stripe modal */}
              {modal === 'stripe' && (
                <div className="bg-white rounded-[16px] w-full max-w-[480px] mx-4 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-5">
                    <h2 className="text-[16px] font-semibold text-[#1a1a1a]">Conectar Stripe</h2>
                    <button onClick={close} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                    </button>
                  </div>
                  <div className="px-6 pb-6 flex flex-col gap-4">
                    <p className="text-[13px] text-[#646462]">Añade una clave de API para el servidor MCP seleccionado.</p>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-[#1a1a1a]">Clave API de Stripe</label>
                      <div className="relative">
                        <button onClick={() => setStripeTokenOpen(o => !o)}
                          className="w-full flex items-center justify-between border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] text-[#646462] bg-white hover:bg-[#f8f8f7]">
                          {stripeTokenId || 'Elige el token'}
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 text-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                        </button>
                        {stripeTokenOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e9eae6] rounded-[8px] shadow-lg z-10 overflow-hidden">
                            <div className="px-4 py-3 text-[12px] text-[#646462] border-b border-[#f3f3f1]">Tokens disponibles</div>
                            {['sk_live_•••••••••abc123', 'sk_test_•••••••••def456'].map(t => (
                              <button key={t} onClick={() => { setStripeTokenId(t); setStripeTokenOpen(false); }}
                                className="block w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#f3f3f1] font-mono">{t}</button>
                            ))}
                            <div className="border-t border-[#f3f3f1]">
                              <button className="block w-full text-left px-4 py-2.5 text-[13px] text-[#3b59f6] hover:bg-[#f3f3f1]">+ Crear nuevo token</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button onClick={close} className="text-[13px] font-semibold text-[#1a1a1a] hover:opacity-70 px-2">Cancelar</button>
                      <button
                        onClick={() => { setConnected(p => [...p, 'Stripe']); showToast('Stripe conectado correctamente'); close(); }}
                        className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]"
                      >Conectar</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Shopify modal */}
              {modal === 'shopify' && (
                <div className="bg-white rounded-[16px] w-full max-w-[480px] mx-4 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-5">
                    <h2 className="text-[16px] font-semibold text-[#1a1a1a]">Conectar Shopify Storefront</h2>
                    <button onClick={close} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                    </button>
                  </div>
                  <div className="px-6 pb-6 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-[#1a1a1a]">URL de la tienda</label>
                      <input value={shopifyUrl} onChange={e => setShopifyUrl(e.target.value)} placeholder="https://www.shopifystore.com"
                        className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a1a]"/>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button onClick={close} className="text-[13px] font-semibold text-[#1a1a1a] hover:opacity-70 px-2">Cancelar</button>
                      <button
                        onClick={() => { setConnected(p => [...p, 'Shopify Storefront']); showToast('Shopify Storefront conectado'); close(); setShopifyUrl(''); }}
                        className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]"
                      >Conectar</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Linear modal */}
              {modal === 'linear' && (
                <div className="bg-white rounded-[16px] w-full max-w-[480px] mx-4 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-5">
                    <h2 className="text-[16px] font-semibold text-[#1a1a1a]">Conectar Linear</h2>
                    <button onClick={close} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                    </button>
                  </div>
                  <div className="px-6 pb-6 flex flex-col gap-4">
                    <p className="text-[13px] text-[#646462]">Añade tu clave de API de Linear para sincronizar issues y proyectos.</p>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[13px] font-medium text-[#1a1a1a]">Clave API de Linear</label>
                      <input type="password" value={linearApiKey} onChange={e => setLinearApiKey(e.target.value)} placeholder="lin_api_••••••••••"
                        className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] outline-none focus:border-[#1a1a1a]"/>
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button onClick={close} className="text-[13px] font-semibold text-[#1a1a1a] hover:opacity-70 px-2">Cancelar</button>
                      <button
                        onClick={() => { setConnected(p => [...p, 'Linear']); showToast('Linear conectado correctamente'); close(); setLinearApiKey(''); }}
                        className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]"
                      >Conectar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectorCardGrid({ onCardClick }: { onCardClick: (label: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-4 w-full max-w-[800px]">
      {CONNECTOR_CARDS.map(card => (
        <button
          key={card.label}
          onClick={() => onCardClick(card.label)}
          className="bg-white border border-[#e9eae6] rounded-[12px] p-[17px] flex flex-col items-start justify-between gap-[46px] text-left hover:border-[#c8c9c4] hover:shadow-sm transition-all min-h-[144px]"
        >
          <div className="w-11 h-11 rounded-[12px] flex items-center justify-center" style={{ background: card.bg }}>
            <img src={card.svg} alt="" className="w-4 h-4" />
          </div>
          <p className="text-[14px] font-semibold text-[#1a1a1a] leading-[20px] whitespace-pre-line">{card.label}</p>
        </button>
      ))}
    </div>
  );
}

// ── LabelsView ────────────────────────────────────────────────────────────────

export function LabelsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { data: labelsData, loading, refetch } = useApi<any[]>(() => labelsApi.list(), [], []);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Real labels from labelsApi; the per-entity usage counts (people/companies/…)
  // are not tracked by the backend yet, so they render as 0.
  const labels = (labelsData || []).map((l: any) => ({
    id: String(l.id),
    name: l.name,
    createdAt: l.created_at || '',
    createdBy: l.created_by || '—',
    people: 0, companies: 0, conversations: 0, messages: 0, articles: 0, responses: 0,
  }));

  function startCreating() { setIsCreating(true); setNewName(''); setTimeout(() => newInputRef.current?.focus(), 50); }

  async function confirmNew() {
    const trimmed = newName.trim();
    if (!trimmed || busy) { if (!trimmed) setIsCreating(false); return; }
    setBusy(true);
    try {
      await labelsApi.create({ name: trimmed });
      setIsCreating(false);
      setNewName('');
      refetch();
    } catch { /* surfaced by the global error banner */ } finally { setBusy(false); }
  }

  async function deleteLabelRow(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try { await labelsApi.delete(id); refetch(); }
    catch { /* global banner */ } finally { setDeletingId(null); }
  }

  const filtered = labels.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));
  const COLS = ['Nombre de la etiqueta', 'Creado', 'Creado por', 'Personas:', 'Empresas', 'Conversaciones', 'Mensajes', 'Artículos', 'Respuestas', ''];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a] flex items-center gap-2">
              <svg viewBox="0 0 20 20" className="w-5 h-5 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><path d="M3 5l6-3 8 3-6 10-8-10z"/></svg>
              Etiquetas
            </h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              <button onClick={startCreating} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nueva etiqueta</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar etiquetas..." className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] mb-4 focus:outline-none focus:border-[#3b59f6]" />
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#e9eae6]">
                {COLS.map(h => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-[#646462] text-[12px] whitespace-nowrap">{h} <span className="text-[#ccc]">↕</span></th>
                ))}
              </tr></thead>
              <tbody>
                {/* Inline new-label row */}
                {isCreating && (
                  <tr className="border-b border-[#e9eae6] bg-[#fafaf9]">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] flex-shrink-0"><path d="M2 5l5-3 7 3-5 9-7-9z"/></svg>
                        <input
                          ref={newInputRef}
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') setIsCreating(false); }}
                          placeholder="Nombre de la etiqueta"
                          className="border border-[#3b59f6] rounded-[6px] px-2 py-1 text-[13px] outline-none w-[220px]"
                        />
                        <button onClick={confirmNew} className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1a1a1a] hover:bg-[#444] flex-shrink-0">
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-white" strokeWidth="2"><path d="M3 8l4 4 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button onClick={() => setIsCreating(false)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#f3f3f1] flex-shrink-0">
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                        </button>
                      </span>
                    </td>
                    {[...Array(9)].map((_, i) => <td key={i} className="px-4 py-2 text-[#646462]">—</td>)}
                  </tr>
                )}
                {!loading && filtered.length === 0 && !isCreating && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-[13px] text-[#9a9a98]">
                    {search ? 'Ninguna etiqueta coincide.' : 'No hay etiquetas todavía. Crea la primera con "+ Nueva etiqueta".'}
                  </td></tr>
                )}
                {filtered.map((lbl) => (
                  <tr key={lbl.id} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9] group">
                    <td className="px-4 py-3"><span className="flex items-center gap-2"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M2 5l5-3 7 3-5 9-7-9z"/></svg>{lbl.name}</span></td>
                    <td className="px-4 py-3 text-[#646462]">{formatContactWhen(lbl.createdAt)}</td>
                    <td className="px-4 py-3 text-[#646462]">{lbl.createdBy}</td>
                    <td className="px-4 py-3 text-[#646462]">{lbl.people}</td>
                    <td className="px-4 py-3 text-[#646462]">{lbl.companies}</td>
                    <td className="px-4 py-3 text-[#646462]">{lbl.conversations}</td>
                    <td className="px-4 py-3 text-[#646462]">{lbl.messages}</td>
                    <td className="px-4 py-3 text-[#646462]">{lbl.articles}</td>
                    <td className="px-4 py-3 text-[#646462]">{lbl.responses}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteLabelRow(lbl.id)}
                        disabled={deletingId === lbl.id}
                        className="text-[12px] font-medium text-[#dc2626] opacity-0 group-hover:opacity-100 hover:underline disabled:opacity-40">
                        {deletingId === lbl.id ? '…' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── WorkspaceSecurityView (1-44080) ───────────────────────────────────────────

export function WorkspaceSecurityView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'workspace' | 'datos' | 'messenger' | 'archivos' | 'enlaces' | 'auth' | 'estado'>('enlaces');
  const { data: ws } = useApi(() => workspacesApi.currentContext(), [], null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [untrustedOn, setUntrustedOn] = useState(true);
  const [maliciousOn, setMaliciousOn] = useState(true);
  const [showDefaults, setShowDefaults] = useState(true);
  // Tab Datos toggles
  const [redaccion, setRedaccion] = useState(false);
  const [notifContent, setNotifContent] = useState(true);
  const [notifLeads, setNotifLeads] = useState(true);
  const [fusionConv, setFusionConv] = useState(false);
  const [fusionLeads, setFusionLeads] = useState(false);
  // Tab Archivos
  const [permitArch, setPermitArch] = useState(true);
  const [otrosArch, setOtrosArch] = useState(false);
  const [tipoEntradas, setTipoEntradas] = useState({ camara: true, imagenes: true, archivos: true, gif: false, voz: false });
  // Tab Workspace
  const [ipRestrict, setIpRestrict] = useState(false);
  const [allowedIps, setAllowedIps] = useState('');
  const [logoutAll, setLogoutAll] = useState(false);
  // Tab Auth (customer identity verification)
  const [civEnabled, setCivEnabled] = useState(false);
  // Tab Estado
  const [statusPageUrl, setStatusPageUrl] = useState('https://status.miempresa.com');

  useEffect(() => {
    if (!ws) return;
    const s = (ws as any)?.settings ?? {};
    if (s.untrustedOn !== undefined) setUntrustedOn(!!s.untrustedOn);
    if (s.maliciousOn !== undefined) setMaliciousOn(!!s.maliciousOn);
    if (s.redaccion !== undefined) setRedaccion(!!s.redaccion);
    if (s.notifContent !== undefined) setNotifContent(!!s.notifContent);
    if (s.notifLeads !== undefined) setNotifLeads(!!s.notifLeads);
    if (s.fusionConv !== undefined) setFusionConv(!!s.fusionConv);
    if (s.fusionLeads !== undefined) setFusionLeads(!!s.fusionLeads);
    if (s.permitArch !== undefined) setPermitArch(!!s.permitArch);
    if (s.otrosArch !== undefined) setOtrosArch(!!s.otrosArch);
    if (s.ipRestrict !== undefined) setIpRestrict(!!s.ipRestrict);
    if (s.allowedIps) setAllowedIps(s.allowedIps);
    if (s.civEnabled !== undefined) setCivEnabled(!!s.civEnabled);
    if (s.statusPageUrl) setStatusPageUrl(s.statusPageUrl);
  }, [ws]);

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  async function saveToggle(key: string, value: boolean) {
    const wsId = (ws as any)?.id ?? '';
    if (!wsId) return;
    try { await workspacesApi.updateSettings(wsId, { [key]: value }); showToast('Guardado'); } catch { showToast('Error al guardar', false); }
  }
  const tabs = [
    { id: 'workspace' as const, label: 'Espacio de trabajo' },
    { id: 'datos'     as const, label: 'Datos' },
    { id: 'messenger' as const, label: 'Messenger' },
    { id: 'archivos'  as const, label: 'Archivos adjuntos' },
    { id: 'enlaces'   as const, label: 'Enlaces' },
    { id: 'auth'      as const, label: 'Autenticación de clientes' },
    { id: 'estado'    as const, label: 'Comprobación de estado' },
  ];

  function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle} className={`w-8 h-[18px] rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`}/>
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Yellow security warning banner */}
          <div className="bg-[#fef3c7] border-b border-[#fde68a] px-6 py-3 flex items-center justify-center text-[13px] text-[#1a1a1a] flex-shrink-0">
            <span className="text-[#f59e0b] mr-2">⚠</span>
            Ingresa un contacto de seguridad obligatorio en caso de un incidente de seguridad. Haz <a href="#" className="text-[#3b59f6] underline ml-1">clic aquí</a>.
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Seguridad</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              Más información <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
            </button>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
            {tab === 'datos' && (
              <div className="flex flex-col gap-3">
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Redacción de contenido</h3>
                    <p className="text-[13px] text-[#646462]">Redacte automáticamente los datos confidenciales en las conversaciones mediante reglas integradas y personalizadas. El contenido coincidente se reemplazará con asteriscos. <a href="#" className="text-[#3b59f6] underline">Más información</a>.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Toggle on={redaccion} onToggle={() => { setRedaccion(v => { saveToggle('redaccion', !v); return !v; }); }} />
                    <span className="text-[13px] text-[#1a1a1a]">Habilitar la redacción de contenido</span>
                  </div>
                </div>
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Notificaciones por correo electrónico</h3>
                    <p className="text-[13px] text-[#646462]">Esto incluirá el contenido de las conversaciones cuando los usuarios o leads reciban notificaciones de cualquier respuesta. <a href="#" className="text-[#3b59f6] underline">Más información</a></p>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <div className="flex items-start gap-2">
                      <Toggle on={notifContent} onToggle={() => { setNotifContent(v => { saveToggle('notifContent', !v); return !v; }); }} />
                      <span className="text-[13px] text-[#1a1a1a]">Incluir el contenido de la conversación en las notificaciones</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Toggle on={notifLeads} onToggle={() => { setNotifLeads(v => { saveToggle('notifLeads', !v); return !v; }); }} />
                      <span className="text-[13px] text-[#1a1a1a]">Identificación por email para leads</span>
                    </div>
                  </div>
                </div>
                <div className="border border-[#e9eae6] rounded-[12px] p-5">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Identificación del correo electrónico de leads</h3>
                  <p className="text-[13px] text-[#646462]">Si un lead hace clic en su sitio web desde un enlace de su correo electrónico, podemos personalizarlo en su aplicación y continuar conversando.</p>
                </div>
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Fusionar conversaciones entre diferentes usuarios</h3>
                    <p className="text-[13px] text-[#646462]">Combina las conversaciones de diferentes usuarios en un solo hilo. Esto ayuda a consolidar casos duplicados, pero puede plantear riesgos de seguridad y privacidad, ya que se fusionarán diferentes identidades de usuario. Úsalo con precaución y revisa antes de fusionar. <a href="#" className="text-[#3b59f6] underline">Más información</a></p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Toggle on={fusionConv} onToggle={() => { setFusionConv(v => { saveToggle('fusionConv', !v); return !v; }); }} />
                    <span className="text-[13px] text-[#1a1a1a]">Habilitar la fusión de conversaciones entre usuarios</span>
                  </div>
                </div>
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Fusión de leads no verificados en usuarios</h3>
                    <p className="text-[13px] text-[#646462] mb-2">Fusiona leads y usuarios solo en función de la dirección de correo electrónico. Al activar esta opción, los leads se fusionarán con los usuarios, <strong>incluido todo el historial de conversaciones</strong>, cuando tengan la misma dirección de correo electrónico, incluso si no usan el mismo dispositivo o sesión. Nota: Clain solo fusionará prospectos en usuarios para solicitudes protegidas con verificación de identidad.</p>
                    <a href="#" className="text-[13px] text-[#3b59f6] underline">Más información</a>
                    <p className="text-[13px] mt-2"><a href="#" className="text-[#3b59f6] underline">Obtén más información sobre la fusión de usuarios principales</a></p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Toggle on={fusionLeads} onToggle={() => { setFusionLeads(v => { saveToggle('fusionLeads', !v); return !v; }); }} />
                    <span className="text-[13px] text-[#1a1a1a]">Habilitar la fusión de leads no verificados en usuarios</span>
                  </div>
                </div>
                {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
              </div>
            )}

            {tab === 'messenger' && (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Seguridad de Messenger</h2>
                  <p className="text-[13px] text-[#646462] mb-2">La seguridad de Messenger evita que terceros se hagan pasar por tus usuarios conectados y vean sus conversaciones. Recomendamos a todos los clientes que apliquen la seguridad de Messenger.</p>
                  <a href="#" className="text-[13px] text-[#3b59f6] underline inline-block">📖 Más información sobre la seguridad de Messenger</a>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Mensajero web', icon: '🖥' },
                    { label: 'Mensajero iOS', icon: '📱' },
                    { label: 'Mensajero Android', icon: '🤖' },
                  ].map(p => (
                    <div key={p.label} className="border border-[#e9eae6] rounded-[12px] p-5">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center text-[18px]">{p.icon}</div>
                        <div>
                          <div className="flex items-center gap-2"><p className="text-[14px] font-semibold text-[#1a1a1a]">{p.label}</p><span className="bg-[#fef3c7] text-[#92400e] rounded-full px-2 py-0.5 text-[11px] font-medium">Desactivado</span></div>
                          <p className="text-[12px] text-[#646462] mt-1">La seguridad de Messenger no está implementada para {p.label.toLowerCase()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Claves secretas</h3>
                  <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] mb-4">+ Crear nueva</button>
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#e9eae6]">
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Nombre</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Clave</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Creado el</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Plataforma</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Estado</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Usado por última vez a las</th>
                  </tr></thead>
                  <tbody><tr className="border-b border-[#f3f3f1]">
                    <td className="px-4 py-3 text-[#1a1a1a]">Unified Secret</td>
                    <td className="px-4 py-3 text-[#646462] flex items-center gap-2"><button className="hover:text-[#1a1a1a]">📋</button><button className="hover:text-[#1a1a1a]">👁</button>****************</td>
                    <td className="px-4 py-3 text-[#646462]">May 5, 2026 at 8:55AM</td>
                    <td className="px-4 py-3 text-[#646462]">Todo</td>
                    <td className="px-4 py-3 text-[#646462]">9:24 a.m.</td>
                    <td className="px-4 py-3"></td>
                  </tr></tbody>
                </table>
                </div>
              </div>
            )}

            {tab === 'archivos' && (
              <div className="flex flex-col gap-3">
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Permitir archivos adjuntos</h3>
                    <p className="text-[13px] text-[#646462]">Los leads y los usuarios podrán adjuntar y enviar archivos .gif, .jpeg, .jpg, .mov, .mp4, .pdf, .png, .txt, .heic, .oga, .ogg y .dng.</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Toggle on={permitArch} onToggle={() => { setPermitArch(v => { saveToggle('permitArch', !v); return !v; }); }} />
                    <span className="text-[13px] text-[#1a1a1a]">Permitir que los leads y los usuarios envíen archivos adjuntos</span>
                  </div>
                </div>
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Otros tipos de archivos</h3>
                    <p className="text-[13px] text-[#646462] mb-2">Permite que los leads y los usuarios adjunten y envíen otros tipos de archivos al enumerar la extensión para cada tipo a continuación. Para proteger tu cuenta, ciertos tipos de archivos están prohibidos.</p>
                    <a href="#" className="text-[13px] text-[#3b59f6] underline">📖 Más información.</a>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Toggle on={otrosArch} onToggle={() => { setOtrosArch(v => { saveToggle('otrosArch', !v); return !v; }); }} />
                    <span className="text-[13px] text-[#1a1a1a]">Permitir que los leads y los usuarios envíen otros tipos de archivos</span>
                  </div>
                </div>
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Tipos de entrada de Messenger</h3>
                    <p className="text-[13px] text-[#646462]">Controla a qué tipos de entrada tienen acceso los leads y los usuarios en messenger.</p>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {[
                      { key: 'camara' as const, label: 'Acceso a la cámara (SDK móvil)' },
                      { key: 'imagenes' as const, label: 'Imágenes y videos' },
                      { key: 'archivos' as const, label: 'Archivos' },
                      { key: 'gif' as const, label: 'GIF' },
                      { key: 'voz' as const, label: 'Notas de voz' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer" onClick={() => setTipoEntradas(s => ({ ...s, [opt.key]: !s[opt.key] }))}>
                        <span className={`w-4 h-4 rounded-sm border ${tipoEntradas[opt.key] ? 'bg-[#3b59f6] border-[#3b59f6]' : 'border-[#ccc] bg-white'} flex items-center justify-center`}>
                          {tipoEntradas[opt.key] && <span className="text-white text-[10px]">✓</span>}
                        </span>
                        <span className="text-[13px] text-[#1a1a1a]">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'workspace' && (
              <div className="flex flex-col gap-4">
                <h2 className="text-[16px] font-semibold text-[#1a1a1a]">Configuración del espacio de trabajo</h2>
                {/* IP Restriction */}
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Restricción por IP</h3>
                    <p className="text-[13px] text-[#646462]">Limita el acceso al workspace solo a las direcciones IP que especifiques. Los compañeros de equipo fuera de esas IPs no podrán iniciar sesión.</p>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Toggle on={ipRestrict} onToggle={() => { setIpRestrict(v => { saveToggle('ipRestrict', !v); return !v; }); }} />
                      <span className="text-[13px] text-[#1a1a1a]">Habilitar restricción por IP</span>
                    </div>
                    {ipRestrict && (
                      <textarea
                        className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[12.5px] font-mono focus:outline-none focus:border-[#1a1a1a] resize-none"
                        rows={4}
                        placeholder={"192.168.1.0/24\n10.0.0.0/8"}
                        value={allowedIps}
                        onChange={e => setAllowedIps(e.target.value)}
                        onBlur={() => { const wsId = (ws as any)?.id ?? ''; if (wsId) workspacesApi.updateSettings(wsId, { allowedIps }).catch(() => {}); }}
                      />
                    )}
                  </div>
                </div>
                {/* Session management */}
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Gestión de sesiones</h3>
                    <p className="text-[13px] text-[#646462]">Cierra la sesión de todos los compañeros de equipo activos ahora mismo. Deberán volver a iniciar sesión para acceder al workspace.</p>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => { setLogoutAll(true); setTimeout(() => setLogoutAll(false), 2000); showToast('Sesiones cerradas correctamente'); }}
                      disabled={logoutAll}
                      className="border border-[#fca5a5] rounded-full px-4 py-[7px] text-[13px] font-medium text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50 whitespace-nowrap"
                    >
                      {logoutAll ? 'Cerrando…' : 'Cerrar todas las sesiones'}
                    </button>
                  </div>
                </div>
                {/* Trusted domains */}
                <div className="border border-[#e9eae6] rounded-[12px] p-5">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Dominios de confianza para el workspace</h3>
                  <p className="text-[13px] text-[#646462] mb-3">Solo los usuarios con correos de estos dominios podrán registrarse automáticamente en el workspace mediante SSO.</p>
                  <div className="flex gap-2">
                    <input className="flex-1 border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]" placeholder="miempresa.com" />
                    <button className="border border-[#e9eae6] rounded-full px-4 py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">+ Añadir dominio</button>
                  </div>
                </div>
                {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
              </div>
            )}
            {tab === 'auth' && (
              <div className="flex flex-col gap-4">
                <h2 className="text-[16px] font-semibold text-[#1a1a1a]">Verificación de identidad del cliente</h2>
                <p className="text-[13px] text-[#646462]">La verificación de identidad garantiza que los usuarios identificados sean quienes dicen ser. Se implementa mediante un hash HMAC-SHA256 del user_id generado en tu servidor con la clave secreta.</p>
                <a href="#" className="text-[13px] text-[#3b59f6] underline">📖 Documentación de verificación de identidad</a>
                {/* Enable toggle */}
                <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Habilitar verificación de identidad</h3>
                    <p className="text-[13px] text-[#646462]">Los usuarios sin HMAC válido serán tratados como leads no verificados.</p>
                  </div>
                  <Toggle on={civEnabled} onToggle={() => { setCivEnabled(v => { saveToggle('civEnabled', !v); return !v; }); }} />
                </div>
                {/* Status cards */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Web Messenger', icon: '🖥', status: civEnabled ? 'Activo' : 'Inactivo', color: civEnabled ? '#dcfce7' : '#f3f3f1', textColor: civEnabled ? '#166534' : '#646462' },
                    { label: 'iOS SDK', icon: '📱', status: 'Inactivo', color: '#f3f3f1', textColor: '#646462' },
                    { label: 'Android SDK', icon: '🤖', status: 'Inactivo', color: '#f3f3f1', textColor: '#646462' },
                  ].map(p => (
                    <div key={p.label} className="border border-[#e9eae6] rounded-[12px] p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[18px]">{p.icon}</span>
                        <span className="text-[13px] font-semibold text-[#1a1a1a]">{p.label}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: p.color, color: p.textColor }}>{p.status}</span>
                    </div>
                  ))}
                </div>
                {/* Code snippet */}
                <div className="border border-[#e9eae6] rounded-[12px] p-5">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-2">Ejemplo de implementación (Node.js)</h3>
                  <pre className="bg-[#f8f8f7] rounded-[8px] p-4 text-[12px] font-mono text-[#1a1a1a] overflow-x-auto">{`const crypto = require('crypto');
const secretKey = '<TU_CLAVE_SECRETA>';

const hash = crypto
  .createHmac('sha256', secretKey)
  .update(user.id)
  .digest('hex');

// Pasa el hash al SDK de Clain
window.Clain('boot', {
  user_id: user.id,
  user_hash: hash
});`}</pre>
                </div>
                {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
              </div>
            )}
            {tab === 'estado' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a]">Comprobación de estado</h2>
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#16a34a]">
                    <span className="w-2 h-2 rounded-full bg-[#16a34a] inline-block"/>
                    Todos los sistemas operativos
                  </span>
                </div>
                {/* Status items */}
                {[
                  { name: 'API / Backend',          status: 'operational', uptime: '99.98%' },
                  { name: 'Messenger Web',           status: 'operational', uptime: '99.95%' },
                  { name: 'SDK iOS / Android',       status: 'operational', uptime: '99.97%' },
                  { name: 'Notificaciones push',     status: 'operational', uptime: '99.90%' },
                  { name: 'Centro de ayuda',         status: 'operational', uptime: '100%'   },
                  { name: 'Webhooks salientes',      status: 'degraded',    uptime: '98.12%' },
                ].map(item => (
                  <div key={item.name} className="border border-[#e9eae6] rounded-[12px] px-5 py-3 flex items-center gap-4">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.status === 'operational' ? 'bg-[#16a34a]' : 'bg-[#f59e0b]'}`} />
                    <span className="flex-1 text-[13px] font-medium text-[#1a1a1a]">{item.name}</span>
                    <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${item.status === 'operational' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fef3c7] text-[#92400e]'}`}>
                      {item.status === 'operational' ? 'Operativo' : 'Degradado'}
                    </span>
                    <span className="text-[12px] text-[#646462] w-16 text-right">{item.uptime}</span>
                  </div>
                ))}
                {/* Status page URL */}
                <div className="border border-[#e9eae6] rounded-[12px] p-5">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">URL de tu página de estado</h3>
                  <p className="text-[13px] text-[#646462] mb-2">Muestra tu propia página de estado a los clientes cuando detecten problemas.</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                      value={statusPageUrl}
                      onChange={e => setStatusPageUrl(e.target.value)}
                    />
                    <button
                      onClick={() => { const wsId = (ws as any)?.id ?? ''; if (wsId) workspacesApi.updateSettings(wsId, { statusPageUrl }).then(() => showToast('URL guardada')).catch(() => showToast('Error', false)); }}
                      className="border border-[#e9eae6] rounded-full px-4 py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]"
                    >Guardar</button>
                  </div>
                </div>
                {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
              </div>
            )}

            {tab === 'enlaces' && <>
            <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Seguridad de los enlaces</h2>
            <p className="text-[13px] text-[#646462] mb-5">Controla la configuración de seguridad de los enlaces en las conversaciones</p>
            <div className="grid grid-cols-2 gap-4 mb-8">
              {/* Untrusted card */}
              <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
                <div className="bg-[#f8f8f7] py-10 flex items-center justify-center">
                  <div className="bg-[#ffe8d6] border border-[#fdba74] rounded-full px-4 py-2 text-[13px] text-[#1a1a1a] flex items-center gap-2">
                    <span className="text-[#f97316]">⚠</span>
                    <span>www.untrusted-warning.com</span>
                  </div>
                </div>
                <div className="px-4 py-3 flex items-start gap-3">
                  <Toggle on={untrustedOn} onToggle={() => { setUntrustedOn(v => { saveToggle('untrustedOn', !v); return !v; }); }} />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] mb-0.5">Advertencias no confiables</p>
                    <p className="text-[12px] text-[#646462]">Pide a tus compañeros de equipo que revisen detenidamente los enlaces que no son de confianza antes de abrirlos. <a href="#" className="text-[#3b59f6] underline">(Ver ejemplo)</a></p>
                  </div>
                </div>
              </div>
              {/* Malicious card */}
              <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
                <div className="bg-[#f8f8f7] py-10 flex items-center justify-center">
                  <div className="bg-[#fee2e2] border border-[#fca5a5] rounded-full px-4 py-2 text-[13px] text-[#1a1a1a] flex items-center gap-2">
                    <span className="text-[#dc2626]">▲</span>
                    <span>www.malicious-warning.com</span>
                  </div>
                </div>
                <div className="px-4 py-3 flex items-start gap-3">
                  <Toggle on={maliciousOn} onToggle={() => { setMaliciousOn(v => { saveToggle('maliciousOn', !v); return !v; }); }} />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] mb-0.5">Advertencias maliciosas</p>
                    <p className="text-[12px] text-[#646462]">Detecta enlaces maliciosos y exige a los compañeros de equipo que reconozcan los riesgos antes de abrir. <a href="#" className="text-[#3b59f6] underline">(Ver ejemplo)</a></p>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Enlaces de confianza y bloqueados</h2>
            <p className="text-[13px] text-[#646462] mb-4">Define políticas para controlar qué enlaces son de confianza o están bloqueados dentro de las conversaciones. Los enlaces de confianza no activarán advertencias ni se someterán a detección maliciosa. Los enlaces utilizados por tu espacio de trabajo se consideran predeterminada. Los compañeros de equipo no podrán abrir enlaces bloqueados.</p>
            <div className="flex items-center gap-3 mb-4">
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Añadir política</button>
              <Toggle on={showDefaults} onToggle={() => setShowDefaults(v => !v)} />
              <span className="text-[13px] text-[#1a1a1a]">Mostrar políticas predeterminadas</span>
            </div>
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#e9eae6] bg-[#fafaf9]">
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Item</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Type</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Action</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Added By</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Date</th>
              </tr></thead>
              <tbody>
                {['*.intercom.com', '*.intercom.io', '*.intercomcdn.com', '*.intercomcdn.eu', '*.intercom-attachments.com', '*.intercom-attachments-1.com'].map(item => (
                  <tr key={item} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                    <td className="px-4 py-2 text-[#1a1a1a]">{item}</td>
                    <td className="px-4 py-2"><span className="bg-[#f0f0ec] rounded-full px-2 py-0.5 text-[12px] text-[#646462]">Dominio</span></td>
                    <td className="px-4 py-2 text-[#646462]">Predeterminado</td>
                    <td className="px-4 py-2"><span className="bg-[#dcfce7] text-[#166534] rounded-full px-2 py-0.5 text-[12px]">Trusted</span></td>
                    <td className="px-4 py-2 text-[#646462]">Intercom</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-center mt-4">
              <button className="border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Load more</button>
            </div>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GlosarioTab ───────────────────────────────────────────────────────────────

interface GlosarioPhrase {
  id: string;
  source: string;
  neverTranslate: boolean;
  translations: Record<string, string>;
}

const GLOSARIO_LANGS = [
  { code: 'ar', label: 'Arabic (ar)' }, { code: 'hy', label: 'Armenian (hy)' },
  { code: 'az', label: 'Azerbaijani (az)' }, { code: 'bn', label: 'Bengali (bn)' },
  { code: 'bs', label: 'Bosnian (bs)' }, { code: 'pt-BR', label: 'Brazilian Portuguese (pt-BR)' },
  { code: 'bg', label: 'Bulgarian (bg)' }, { code: 'fr-CA', label: 'Canadian French (fr-CA)' },
  { code: 'ca', label: 'Catalan (ca)' }, { code: 'hr', label: 'Croatian (hr)' },
  { code: 'cs', label: 'Czech (cs)' }, { code: 'da', label: 'Danish (da)' },
  { code: 'nl', label: 'Dutch (nl)' }, { code: 'et', label: 'Estonian (et)' },
  { code: 'fi', label: 'Finnish (fi)' }, { code: 'fr', label: 'French (fr)' },
  { code: 'ka', label: 'Georgian (ka)' }, { code: 'de', label: 'German (de)' },
  { code: 'el', label: 'Greek (el)' }, { code: 'he', label: 'Hebrew (he)' },
  { code: 'hi', label: 'Hindi (hi)' }, { code: 'hu', label: 'Hungarian (hu)' },
  { code: 'id', label: 'Indonesian (id)' }, { code: 'it', label: 'Italian (it)' },
  { code: 'ja', label: 'Japanese (ja)' }, { code: 'ko', label: 'Korean (ko)' },
  { code: 'lv', label: 'Latvian (lv)' }, { code: 'lt', label: 'Lithuanian (lt)' },
  { code: 'ms', label: 'Malay (ms)' }, { code: 'nb', label: 'Norwegian (nb)' },
  { code: 'pl', label: 'Polish (pl)' }, { code: 'pt', label: 'Portuguese (pt)' },
  { code: 'ro', label: 'Romanian (ro)' }, { code: 'ru', label: 'Russian (ru)' },
  { code: 'sr', label: 'Serbian (sr)' }, { code: 'sk', label: 'Slovak (sk)' },
  { code: 'sl', label: 'Slovenian (sl)' }, { code: 'es', label: 'Spanish (es)' },
  { code: 'sv', label: 'Swedish (sv)' }, { code: 'th', label: 'Thai (th)' },
  { code: 'tr', label: 'Turkish (tr)' }, { code: 'uk', label: 'Ukrainian (uk)' },
  { code: 'vi', label: 'Vietnamese (vi)' }, { code: 'zh', label: 'Chinese (zh)' },
];

function GlosarioTab({ wsId, showToast }: { wsId: string; showToast: (m: string, ok?: boolean) => void }) {
  const [phrases, setPhrases] = useState<GlosarioPhrase[]>([]);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState<GlosarioPhrase | null>(null);
  const [saving, setSaving] = useState(false);

  async function persist(updated: GlosarioPhrase[]) {
    if (!wsId) return;
    try { await workspacesApi.updateSettings(wsId, { glossaryPhrases: updated }); } catch { /* non-fatal */ }
  }

  function openNew() {
    setEditingPhrase({ id: Date.now().toString(), source: '', neverTranslate: false, translations: {} });
    setShowDrawer(true);
  }

  async function savePhrase() {
    if (!editingPhrase || !editingPhrase.source.trim()) return;
    setSaving(true);
    const exists = phrases.find(p => p.id === editingPhrase.id);
    const updated = exists
      ? phrases.map(p => p.id === editingPhrase.id ? editingPhrase : p)
      : [...phrases, editingPhrase];
    await persist(updated);
    setSaving(false);
    setPhrases(updated);
    setShowDrawer(false);
    setEditingPhrase(null);
    showToast('Frase guardada');
  }

  async function deletePhrase(id: string) {
    const updated = phrases.filter(p => p.id !== id);
    await persist(updated);
    setPhrases(updated);
    showToast('Frase eliminada');
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* List / empty state */}
      {phrases.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-20 gap-3">
          <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
            <text x="4" y="36" fontSize="36" fill="#ccc">翻</text>
          </svg>
          <p className="text-[15px] font-semibold text-[#1a1a1a]">Sin frases</p>
          <p className="text-[13px] text-[#646462] text-center max-w-[360px]">Personaliza las traducciones de IA para el buzón para palabras clave y frases específicas de tu empresa.</p>
          <button onClick={openNew} className="mt-2 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nueva frase</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-[760px]">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-[#646462]">{phrases.length} {phrases.length === 1 ? 'frase' : 'frases'}</p>
            <button onClick={openNew} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nueva frase</button>
          </div>
          <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafaf9]">
                <tr>
                  {['Frase predeterminada', 'Traducciones', 'Nunca traducir', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-[#646462] text-[12px] border-b border-[#e9eae6]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e9eae6]">
                {phrases.map(ph => (
                  <tr key={ph.id} className="hover:bg-[#fafaf9]">
                    <td className="px-4 py-3 font-medium text-[#1a1a1a]">{ph.source}</td>
                    <td className="px-4 py-3 text-[#646462]">{Object.keys(ph.translations).filter(k => ph.translations[k]).length} idiomas</td>
                    <td className="px-4 py-3">{ph.neverTranslate && <span className="bg-[#fef3c7] text-[#92400e] px-2 py-0.5 rounded-full text-[11px] font-medium">Nunca traducir</span>}</td>
                    <td className="px-4 py-3 text-right flex items-center justify-end gap-3">
                      <button onClick={() => { setEditingPhrase(ph); setShowDrawer(true); }} className="text-[12px] text-[#3b59f6] hover:underline">Editar</button>
                      <button onClick={() => deletePhrase(ph.id)} className="text-[12px] text-[#b91c1c] hover:underline">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Right-side drawer */}
      {showDrawer && editingPhrase && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowDrawer(false)}>
          <div className="flex-1" />
          <div className="w-[520px] bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
              <h2 className="text-[16px] font-bold text-[#1a1a1a]">Nueva frase</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowDrawer(false)} className="border border-[#e9eae6] rounded-full px-3 py-[5px] text-[13px] font-medium text-[#646462] hover:bg-[#f5f5f4]">Cancelar</button>
                <button onClick={savePhrase} disabled={saving || !editingPhrase.source.trim()} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[5px] text-[13px] font-semibold hover:bg-[#444] disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
              <p className="text-[13px] text-[#646462]">Agrega frases y traducciones para mantener la coherencia de los términos clave. Las traducciones del glosario coinciden con los ajustes de idioma de tu espacio de trabajo. <a href="#" className="text-[#3b59f6] underline">Agrega más idiomas compatibles</a> para obtener más traducciones.</p>

              {/* Default phrase */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#1a1a1a] mb-1.5">Frase predeterminada: English (en) <span className="text-[#b91c1c]">*</span></label>
                <input
                  autoFocus
                  className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2.5 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                  placeholder="Escribe la frase original en inglés…"
                  value={editingPhrase.source}
                  onChange={e => setEditingPhrase(p => p ? { ...p, source: e.target.value } : p)}
                />
              </div>

              {/* Never translate toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditingPhrase(p => p ? { ...p, neverTranslate: !p.neverTranslate } : p)}
                  className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${editingPhrase.neverTranslate ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${editingPhrase.neverTranslate ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-[13px] text-[#1a1a1a]">Nunca traducir</span>
              </div>

              {/* Per-language fields */}
              {!editingPhrase.neverTranslate && (
                <div className="flex flex-col gap-3">
                  {GLOSARIO_LANGS.map(lang => (
                    <div key={lang.code}>
                      <label className="block text-[12.5px] font-medium text-[#1a1a1a] mb-1">{lang.label}</label>
                      <input
                        className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                        placeholder=""
                        value={editingPhrase.translations[lang.code] ?? ''}
                        onChange={e => setEditingPhrase(p => p ? { ...p, translations: { ...p.translations, [lang.code]: e.target.value } } : p)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── WorkspaceMultilingualView (1-45264) ───────────────────────────────────────

export function WorkspaceMultilingualView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: ws } = useApi(() => workspacesApi.currentContext(), [], null);
  const [tab, setTab] = useState<'general' | 'glosario'>('general');
  const [aiTranslate, setAiTranslate] = useState(false);
  const [defaultLang, setDefaultLang] = useState('English');
  const [supported, setSupported] = useState('Todo');
  const [translationTone, setTranslationTone] = useState<'amistoso' | 'neutro' | 'profesional'>('neutro');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!ws) return;
    const s = (ws as any)?.settings || {};
    if (s.aiTranslate !== undefined) setAiTranslate(!!s.aiTranslate);
    if (s.defaultLang) setDefaultLang(s.defaultLang);
    if (s.translationTone) setTranslationTone(s.translationTone);
  }, [ws]);

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  async function handleSave() {
    setSaving(true);
    try {
      const wsId = (ws as any)?.id ?? '';
      await workspacesApi.updateSettings(wsId, { aiTranslate, defaultLang, supportedLangs: supported, translationTone });
      showToast('Configuración de idioma guardada.');
    } catch {
      showToast('Error al guardar.', false);
    } finally { setSaving(false); }
  }

  function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle} className={`w-8 h-[18px] rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`}/>
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Multilingüe</h1>
            <div className="flex items-center gap-3">
              {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Más información</button>
              <button onClick={handleSave} disabled={saving} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {(['general', 'glosario'] as const).map(id => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors capitalize ${
                  tab === id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {id === 'general' ? 'General' : 'Glosario'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
            {tab === 'general' && <>
              {/* AI translation card */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-8">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Traducciones de IA para el buzón</h3>
                  <p className="text-[13px] text-[#646462]">Traduce automáticamente las respuestas de los clientes al idioma predeterminado de tu espacio de trabajo en el buzón, y las respuestas de los miembros del equipo al idioma del cliente en todos los canales para ofrecer conversaciones fluidas.</p>
                </div>
                <div className="flex flex-col items-start gap-2 max-w-[380px]">
                  <div className="flex items-center gap-2">
                    <Toggle on={aiTranslate} onToggle={() => setAiTranslate(v => !v)} />
                    <span className="text-[13px] text-[#1a1a1a]">Habilitar la traducción de IA para el buzón</span>
                  </div>
                  <p className="text-[12px] text-[#646462]">Al habilitar esto, das tu consentimiento para el uso de funciones impulsadas por IA y aceptas los <a href="#" className="text-[#3b59f6] underline">Términos y condiciones</a>.</p>
                  <p className="text-[12px] text-[#646462]">Todos los compañeros de equipo podrán ver las traducciones, pero solo los compañeros de equipo con <a href="#" className="text-[#3b59f6] underline">acceso a Copilot</a> podrán traducir automáticamente sus respuestas usando Traducción del buzón con IA.</p>
                </div>
              </div>

              <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Idiomas</h2>
              {/* Workspace languages */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-4">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Idiomas del área de trabajo</h3>
                  <p className="text-[13px] text-[#646462]">Establece tus idiomas predeterminados y adicionales para la comunicación con el cliente en todos los canales.</p>
                </div>
                <div className="w-[380px] flex-shrink-0">
                  <p className="text-[13px] font-medium text-[#1a1a1a] mb-1">Idioma predeterminado</p>
                  <p className="text-[12px] text-[#646462] mb-2">Seleccione el idioma predeterminado para la atención a clientes.</p>
                  <div className="mb-3">
                    <SettingsSelect
                      value={defaultLang}
                      onChange={setDefaultLang}
                      options={[
                        { value: 'English', label: 'English' },
                        { value: 'Español', label: 'Español' },
                        { value: 'Français', label: 'Français' },
                        { value: 'Deutsch', label: 'Deutsch' },
                        { value: 'Italiano', label: 'Italiano' },
                        { value: 'Português', label: 'Português' },
                      ]}
                    />
                  </div>
                  <p className="text-[13px] font-medium text-[#1a1a1a] mb-1">Idiomas adicionales</p>
                  <p className="text-[12px] text-[#646462] mb-2">Seleccione hasta dos idiomas adicionales.</p>
                  <button className="text-[13px] text-[#fa7938] font-medium">+ Agregar idioma</button>
                </div>
              </div>

              {/* Supported languages */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-4">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Idiomas admitidos</h3>
                  <p className="text-[13px] text-[#646462]">Idiomas que Fin y Messenger pueden detectar y traducir automáticamente las conversaciones en este espacio de trabajo.</p>
                  <a href="#" className="text-[13px] text-[#3b59f6] underline mt-2 inline-block">Consulta la lista completa de idiomas compatibles</a>
                </div>
                <div className="w-[380px] flex-shrink-0">
                  <SettingsSelect
                    value={supported}
                    onChange={setSupported}
                    options={[
                      { value: 'Todo', label: 'Todo' },
                      { value: 'Solo idiomas del área de trabajo', label: 'Solo idiomas del área de trabajo' },
                      { value: 'Idiomas europeos', label: 'Idiomas europeos' },
                      { value: 'Idiomas asiáticos', label: 'Idiomas asiáticos' },
                    ]}
                  />
                </div>
              </div>

              <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3 mt-4">Tono de traducción</h2>
              <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Preferencias de tono de traducción</h3>
                  <p className="text-[13px] text-[#646462]">Elige cómo deben sonar las traducciones de IA. Elige un tono que coincida con la voz de tu marca; esto se usará para traducir el mensaje de tu personal al cliente.</p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {(['amistoso', 'neutro', 'profesional'] as const).map(tone => (
                    <button
                      key={tone}
                      onClick={() => setTranslationTone(tone)}
                      className={`px-4 py-2 rounded-full border text-[13px] font-medium transition-colors capitalize ${
                        translationTone === tone
                          ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white'
                          : 'border-[#e9eae6] bg-white text-[#1a1a1a] hover:border-[#c8c9c4]'
                      }`}
                    >
                      {tone.charAt(0).toUpperCase() + tone.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>}
            {tab === 'glosario' && (
              <GlosarioTab wsId={(ws as any)?.id ?? ''} showToast={showToast} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── BillingView ──────────────────────────────────────────────────────────────

const LC = {
  text:    '#111111',
  text60:  'rgba(17,17,17,0.6)',
  text80:  'rgba(17,17,17,0.8)',
  border:  '#d3cec6',
  bg:      '#faf9f6',
  bg2:     '#f5f1ea',
  accent:  '#0007cb',
} as const;

function LandingCornerDots({ size = 8, color = LC.border }: { size?: number; color?: string }) {
  const s: React.CSSProperties = { position: 'absolute', width: size, height: size, background: color };
  return (
    <>
      <span style={{ ...s, top: 0, left: 0 }} />
      <span style={{ ...s, top: 0, right: 0 }} />
      <span style={{ ...s, bottom: 0, left: 0 }} />
      <span style={{ ...s, bottom: 0, right: 0 }} />
    </>
  );
}

function LandingBullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
      <span style={{ color: LC.accent, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
      <span style={{ fontSize: 13, color: LC.text80, lineHeight: '1.5' }}>{children}</span>
    </div>
  );
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    subtitle: 'Incluye Clain AI Agent',
    desc: 'El plan de soporte al cliente para particulares, startups y pequeñas empresas.',
    originalPrice: 149,
    monthlyPrice: 49,
    annualPrice: 42,
    seatLabel: 'por equipo/mes',
    cta: 'Actualizar a Starter',
    badge: null,
    featuresLabel: 'FUNCIONES PRINCIPALES',
    features: [
      'Clain AI Agent (autónomo)',
      '5.000 créditos AI/mes — total del workspace',
      'Bandeja de entrada con vistas compartidas',
      'Knowledge Hub',
      '3 puestos incluidos',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    subtitle: 'Incluye Clain AI Agent',
    desc: 'Potentes herramientas de automatización y funciones de IA para equipos de soporte en crecimiento.',
    originalPrice: 399,
    monthlyPrice: 129,
    annualPrice: 109,
    seatLabel: 'por equipo/mes',
    cta: 'Actualizar a Growth',
    badge: 'Más popular',
    featuresLabel: 'TODO LO DE STARTER, MÁS',
    features: [
      '20.000 créditos AI/mes — total del workspace',
      'Tickets y monitorización SLA',
      'Constructor de flujos de automatización',
      'Asignación round-robin',
      'Informes + AI Insights',
      '8 puestos incluidos',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    subtitle: 'Incluye Clain AI Agent',
    desc: 'Funciones de colaboración, seguridad y multimarca para grandes equipos de soporte.',
    originalPrice: 899,
    monthlyPrice: 299,
    annualPrice: 254,
    seatLabel: 'por equipo/mes',
    cta: 'Actualizar a Scale',
    badge: null,
    featuresLabel: 'TODO LO DE GROWTH, MÁS',
    features: [
      '60.000 créditos AI/mes — total del workspace',
      'SSO y gestión de identidad',
      'Soporte HIPAA',
      'Acuerdos de nivel de servicio (SLA)',
      'Centro de ayuda multimarca',
      '20 puestos incluidos',
    ],
  },
];

const BUSINESS_PLAN = {
  name: 'Business',
  subtitle: 'Plan personalizado, habla con ventas',
  desc: 'Para organizaciones con necesidades personalizadas de capacidad, gobernanza, seguridad y cumplimiento.',
  featuresLabel: 'TODO LO DE SCALE, MÁS',
  features: [
    'Asignación personalizada de créditos AI',
    'Asignación personalizada de puestos',
    'Seguridad y cumplimiento de nivel empresarial',
    'Bring Your Own Model (BYOM)',
    'SLA personalizado y garantías de disponibilidad',
    'Onboarding personalizado y gestor de éxito dedicado',
  ],
};

const FAQS = [
  { q: '¿Cómo funciona el precio de Clain?', a: 'El precio de Clain tiene dos componentes — Puestos: pagas por compañero de equipo según tu plan (Starter, Growth, Scale). Uso: pagas por lo que usas (p. ej. resultados de Clain, canales de mensajería). Todos los planes incluyen acceso al helpdesk de Clain y a Clain AI Agent.' },
  { q: '¿Cómo se cobra Clain AI Agent?', a: 'Clain AI Agent está incluido en todos los planes con una asignación mensual de créditos. Un crédito = una interacción resuelta. Uso flexible a €0,012 por resultado.' },
  { q: '¿Puedo usar Clain con mi helpdesk actual?', a: 'Sí. Clain se integra con Zendesk, HubSpot, Salesforce, Freshdesk y otros a través de API.' },
  { q: '¿Qué planes ofrece Clain?', a: 'Starter, Growth, Scale en autoservicio + Business empresarial. Todos incluyen AI Agent e integraciones ilimitadas.' },
  { q: '¿Qué es un puesto (Full vs Lite)?', a: 'Un puesto Full es un compañero de equipo con acceso completo de inicio de sesión. Los puestos Lite son colaboradores de solo lectura incluidos gratis en cada plan.' },
  { q: '¿Hay cargos adicionales por uso?', a: 'Solo si superas la asignación mensual de créditos con el uso flexible activado.' },
  { q: '¿Necesito firmar un contrato?', a: 'No. Autoservicio mensual/anual, sin compromiso. Business utiliza MSA + DPA.' },
  { q: '¿Cuál es el mínimo para empezar?', a: 'Prueba gratuita de 14 días, sin tarjeta requerida.' },
  { q: '¿Hay una prueba gratuita?', a: 'Sí — 14 días, acceso completo, sin tarjeta.' },
  { q: '¿Cómo cambio mi plan o puestos?', a: 'Autoservicio en Facturación → Suscripción.' },
  { q: '¿Hay descuentos disponibles?', a: '20% de descuento anual. Las startups de menos de 2 años obtienen un 50% de descuento el primer año.' },
];

const CREDIT_PACKS = [
  {
    id: 'pack-5k',
    label: '5.000 créditos',
    credits: '5.000',
    price: '€79',
    pricePerK: '€15,8/k',
    tagline: 'Para equipos pequeños',
    detail: {
      headline: '5.000 créditos adicionales — €79',
      models: 'GPT-4o mini, Claude 3 Haiku, Gemini 1.5 Flash',
      capacity: 'Up to 5M tokens / ~10k automated tasks',
      includes: [
        '~10.000 tareas automatizadas',
        'Hasta 5M tokens procesados',
        'Modelos rápidos y eficientes en coste',
        'Se consumen después de agotar la cuota mensual del plan',
      ],
      bestFor: 'Startups o equipos pequeños que quieren ampliar su cuota puntualmente sin sobrepasar su presupuesto.',
      note: 'Los créditos del pack permanecen disponibles mientras tu suscripción esté activa.',
    },
  },
  {
    id: 'pack-20k',
    label: '20.000 créditos',
    credits: '20.000',
    price: '€249',
    pricePerK: '€12,45/k',
    tagline: 'El más popular',
    popular: true,
    detail: {
      headline: '20.000 créditos adicionales — €249',
      models: 'GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro',
      capacity: 'Up to 20M tokens / ~40k automated tasks',
      includes: [
        '~40.000 tareas automatizadas',
        'Hasta 20M tokens procesados',
        'Acceso a modelos de gama alta (GPT-4o, Claude 3.5 Sonnet)',
        'Ideal para picos de demanda o campañas de soporte',
      ],
      bestFor: 'Equipos en crecimiento con volumen variable que necesitan potencia de modelos premium.',
      note: 'El pack más comprado. Un 21% más barato por crédito que el pack de 5.000.',
    },
  },
  {
    id: 'pack-50k',
    label: '50.000 créditos',
    credits: '50.000',
    price: '€549',
    pricePerK: '€10,98/k',
    tagline: 'Mayor capacidad',
    detail: {
      headline: '50.000 créditos adicionales — €549',
      models: 'All models + Custom fine-tuned models',
      capacity: 'Up to 50M tokens / ~100k automated tasks',
      includes: [
        '~100.000 tareas automatizadas',
        'Hasta 50M tokens procesados',
        'Acceso a todos los modelos, incluidos los fine-tuned personalizados',
        'Máxima capacidad para operaciones de soporte intensivas',
      ],
      bestFor: 'Operaciones de soporte grandes con alto volumen y constante. El precio por crédito más bajo disponible.',
      note: 'Un 31% más barato por crédito que el pack de 5.000. Disponible facturación anual con descuento adicional.',
    },
  },
  {
    id: 'flexible',
    label: 'Uso Flexible',
    credits: null as string | null,
    price: '€19',
    pricePerK: '€19 / 1.000 créd.',
    tagline: 'Sin compromiso',
    detail: {
      headline: '€19 por cada 1.000 créditos extra',
      models: 'Todos los modelos disponibles en tu plan',
      capacity: 'Sin límite de tokens — paga solo lo que uses',
      includes: [
        'Se activa solo después de agotar los créditos mensuales incluidos',
        'Facturado mensualmente según el uso real extra',
        'Protección de gasto máximo mensual y alertas de uso',
        'Activa y desactiva cuando quieras desde Facturación',
      ],
      bestFor: 'Equipos con volumen impredecible o que quieren validar el ROI del AI antes de comprometerse con un pack fijo.',
      note: 'No hay coste si no superas tu cuota mensual. Solo pagas por los créditos extra realmente consumidos.',
    },
  },
];

function BillingCreditsBlock({ selectedPack, setSelectedPack, currentPlan }: {
  selectedPack: string;
  setSelectedPack: (id: string) => void;
  currentPlan: string;
}) {
  const pack = CREDIT_PACKS.find(p => p.id === selectedPack) || CREDIT_PACKS[1];
  return (
    <div style={{ borderBottom: `1px solid ${LC.border}` }}>
      {/* Header */}
      <div style={{ padding: '32px 64px 24px', borderBottom: `1px solid ${LC.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: LC.text }}>Créditos AI</p>
          <span style={{ fontSize: 11, fontWeight: 700, background: LC.accent, color: '#fff', padding: '2px 8px', letterSpacing: '0.04em' }}>COMPARTIDOS POR EQUIPO</span>
        </div>
        <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7', maxWidth: 680 }}>
          Cada plan incluye una asignación mensual de créditos AI <strong style={{ color: LC.text }}>compartida entre todo el equipo</strong>, no por puesto. Añadir puestos <strong style={{ color: LC.text }}>no añade créditos</strong> — los packs adicionales se compran aparte.
        </p>
      </div>
      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr' }}>
        {/* Left — selector */}
        <div style={{ borderRight: `1px solid ${LC.border}`, padding: '24px 0' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 28px', marginBottom: 12 }}>Selecciona un pack</p>
          {CREDIT_PACKS.map(pk => {
            const sel = pk.id === selectedPack;
            return (
              <button key={pk.id} onClick={() => setSelectedPack(pk.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', border: 'none', background: sel ? LC.bg2 : 'transparent', borderLeft: sel ? `3px solid ${LC.accent}` : '3px solid transparent', cursor: 'pointer', textAlign: 'left', gap: 12 }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: LC.text, marginBottom: 2 }}>{pk.label}</p>
                    {pk.popular && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: LC.accent, padding: '1px 5px', letterSpacing: '0.04em' }}>POPULAR</span>}
                  </div>
                  <p style={{ fontSize: 11, color: LC.text60 }}>{pk.tagline}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: LC.text }}>{pk.price}</p>
                  {pk.pricePerK && <p style={{ fontSize: 10, color: LC.text60 }}>{pk.pricePerK}</p>}
                </div>
              </button>
            );
          })}
          {/* Subscription allowances */}
          <div style={{ margin: '20px 28px 0', padding: '16px', background: LC.bg2, border: `1px solid ${LC.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Incluido en tu suscripción</p>
            {[
              { plan: 'Starter', credits: '5.000/mes',  cur: currentPlan.toLowerCase().includes('starter') },
              { plan: 'Growth',  credits: '20.000/mes', cur: currentPlan.toLowerCase().includes('growth') },
              { plan: 'Scale',   credits: '60.000/mes', cur: currentPlan.toLowerCase().includes('scale') },
            ].map(r => (
              <div key={r.plan} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${LC.border}` }}>
                <span style={{ fontSize: 12, color: LC.text, fontWeight: r.cur ? 700 : 400 }}>
                  {r.plan}{r.cur && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: LC.accent }}>TU PLAN</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: LC.text }}>{r.credits}</span>
              </div>
            ))}
            <p style={{ fontSize: 11, color: LC.text60, marginTop: 10 }}>Los créditos no usados <strong style={{ color: LC.text }}>no se acumulan</strong>.</p>
          </div>
        </div>
        {/* Right — detail */}
        <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: LC.text, marginBottom: 8 }}>{pack.detail.headline}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: LC.text60 }}><strong style={{ color: LC.text }}>Modelos:</strong> {pack.detail.models}</p>
            <p style={{ fontSize: 13, color: LC.text60 }}><strong style={{ color: LC.text }}>Capacidad:</strong> {pack.detail.capacity}</p>
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Qué incluye</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {pack.detail.includes.map(item => (
              <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: LC.accent, fontWeight: 700, flexShrink: 0, fontSize: 14 }}>✓</span>
                <span style={{ fontSize: 13, color: LC.text, lineHeight: '1.5' }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: LC.bg2, border: `1px solid ${LC.border}`, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Ideal para</p>
            <p style={{ fontSize: 13, color: LC.text, lineHeight: '1.6' }}>{pack.detail.bestFor}</p>
          </div>
          <p style={{ fontSize: 12, color: LC.text60, lineHeight: '1.6', marginBottom: 24 }}>
            <strong style={{ color: LC.text }}>Nota: </strong>{pack.detail.note}
          </p>
          <div style={{ marginTop: 'auto' }}>
            <button style={{ height: 44, padding: '0 28px', fontSize: 14, fontWeight: 700, background: LC.text, color: '#fff', border: 'none', cursor: 'pointer' }}>
              {pack.id === 'flexible' ? 'Activar uso flexible' : `Comprar ${pack.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingFaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${LC.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: LC.text }}>{q}</span>
        <span style={{ fontSize: 18, color: LC.text60, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, marginLeft: 12 }}>+</span>
      </button>
      {open && (
        <p style={{ fontSize: 14, color: LC.text80, lineHeight: '1.6', paddingBottom: 16, margin: 0 }}>{a}</p>
      )}
    </div>
  );
}

function BillingPlanCard({ plan, billing, current, isLaunch }: { plan: typeof PLANS[0]; billing: 'monthly' | 'annual'; current: string; isLaunch: boolean }) {
  // Launch mode pins the discounted annual rate regardless of billing cadence
  const price = isLaunch ? plan.annualPrice : (billing === 'annual' ? plan.annualPrice : plan.monthlyPrice);
  const isCurrent = current.toLowerCase().includes(plan.id);
  const borderColor = plan.badge ? LC.accent : LC.border;
  return (
    <div style={{ position: 'relative', border: `1px solid ${borderColor}`, background: plan.badge ? LC.bg2 : LC.bg, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <LandingCornerDots color={borderColor} />
      {plan.badge && (
        <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: LC.accent, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', whiteSpace: 'nowrap' }}>
          {plan.badge}
        </div>
      )}
      {/* ① Fixed-height info block — same height on every card → price row always aligns */}
      <div style={{ height: 268, padding: '24px 24px 0', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${borderColor}` }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: LC.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{plan.name}</p>
        <p style={{ fontSize: 12, color: LC.text, marginBottom: 6 }}>{plan.subtitle}</p>
        <p style={{ fontSize: 12, color: LC.text60, lineHeight: '1.5', marginBottom: 0, flex: 1 }}>{plan.desc}</p>
        {/* Price pinned to bottom of fixed block */}
        <div style={{ marginTop: 'auto', paddingBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: LC.text }}>Desde</span>
              {plan.originalPrice && (
                <span style={{ fontSize: 15, color: LC.text60, textDecoration: 'line-through' }}>€{plan.originalPrice}/mes</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: LC.text, letterSpacing: '-0.6px', lineHeight: 1 }}>€{price}</span>
              <span style={{ fontSize: 12, color: LC.text80 }}>{plan.seatLabel}</span>
            </div>
          </div>
          {billing === 'annual' && !isLaunch && (
            <p style={{ fontSize: 11, color: LC.text60, marginTop: 6 }}>Facturado anualmente · €{plan.monthlyPrice}/mes si mensual</p>
          )}
          {isLaunch && (
            <p style={{ fontSize: 11, color: LC.accent, marginTop: 6, fontWeight: 600 }}>Precio lanzamiento · 73% de descuento hasta 31 dic 2026</p>
          )}
        </div>
      </div>
      {/* ② CTA — fixed height so buttons always align */}
      <div style={{ height: 68, padding: '12px 24px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${borderColor}` }}>
        <button style={{ width: '100%', height: 44, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${isCurrent ? LC.border : LC.accent}`, background: isCurrent ? LC.bg2 : LC.accent, color: isCurrent ? LC.text60 : '#fff' }}>
          {isCurrent ? 'Plan actual' : plan.cta}
        </button>
      </div>
      {/* ③ Features — flex:1 fills remaining height */}
      <div style={{ padding: '20px 24px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: LC.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>{plan.featuresLabel}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {plan.features.map(f => <LandingBullet key={f}>{f}</LandingBullet>)}
        </div>
      </div>
    </div>
  );
}

export function BillingPlansView({ view: _view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');
  const [selectedPack, setSelectedPack] = useState('pack-20k');
  // Launch-pricing toggle: when on, all plans show their 73%-off launch rate
  // until 31 dic 2026. Independent from monthly/annual billing cadence.
  const [isLaunch, setIsLaunch] = useState(false);
  const { data: sub } = useApi(() => billingApi.subscription('org_default'), [], null);
  const currentPlan = sub?.planId ?? sub?.plan_id ?? sub?.plan?.name ?? 'growth';

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={{ background: LC.bg }}>
      <TrialBanner />
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Hero */}
        <div style={{ borderBottom: `1px solid ${LC.border}`, padding: '48px 64px 40px', position: 'relative' }}>
          <LandingCornerDots />
          <p style={{ fontSize: 12, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Facturación &amp; Planes</p>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: LC.text, marginBottom: 12, lineHeight: '1.15' }}>
            El plan perfecto<br />para tu equipo
          </h1>
          <p style={{ fontSize: 15, color: LC.text60, marginBottom: 32, maxWidth: 480 }}>
            Empieza gratis y escala cuando lo necesites. Sin contratos, sin sorpresas.
          </p>
          {/* Billing toggle + launch-price tab */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', border: `1px solid ${LC.border}`, background: LC.bg2, padding: 3 }}>
              {(['monthly', 'annual'] as const).map(b => (
                <button key={b} onClick={() => setBilling(b)}
                  style={{ padding: '6px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: billing === b ? '#fff' : 'transparent', color: billing === b ? LC.text : LC.text60, boxShadow: billing === b ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}
                >
                  {b === 'monthly' ? 'Mensual' : 'Anual'}{b === 'annual' ? ' (-15%)' : ''}
                </button>
              ))}
            </div>
            {/* Square launch-price tab — sits next to the monthly/annual toggle */}
            <button
              onClick={() => setIsLaunch(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '8px 16px',
                border: `1px solid ${isLaunch ? LC.accent : LC.border}`,
                background: isLaunch ? LC.accent : '#fff',
                color: isLaunch ? '#fff' : LC.text,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Precio lanzamiento</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: isLaunch ? '#fff' : LC.text }} />
              <span style={{ fontSize: 13 }}>Hasta 31 dic 2026</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: isLaunch ? '#fff' : LC.text }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Ahorra 73%</span>
            </button>
          </div>
        </div>

        {/* Plans grid */}
        <div style={{ padding: '40px 64px', borderBottom: `1px solid ${LC.border}` }}>
          <div style={{ display: 'flex', gap: 0, border: `1px solid ${LC.border}` }}>
            {PLANS.map((plan, i) => (
              <Fragment key={plan.id}>
                {i > 0 && <div style={{ width: 1, background: LC.border, flexShrink: 0 }} />}
                <BillingPlanCard plan={plan} billing={billing} current={currentPlan} isLaunch={isLaunch} />
              </Fragment>
            ))}
            {/* Business column — same 3-section structure as BillingPlanCard */}
            <div style={{ width: 1, background: LC.border, flexShrink: 0 }} />
            <div style={{ position: 'relative', border: 'none', background: LC.bg, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <LandingCornerDots color={LC.border} />
              {/* ① Fixed-height info block — matches BillingPlanCard height:268 */}
              <div style={{ height: 268, padding: '24px 24px 0', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${LC.border}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: LC.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{BUSINESS_PLAN.name}</p>
                <p style={{ fontSize: 12, color: LC.text, marginBottom: 6 }}>{BUSINESS_PLAN.subtitle}</p>
                <p style={{ fontSize: 12, color: LC.text60, lineHeight: '1.5', marginBottom: 0, flex: 1 }}>{BUSINESS_PLAN.desc}</p>
                <div style={{ marginTop: 'auto', paddingBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: LC.text }}>Precio</span>
                      <span style={{ fontSize: 15, color: LC.text60 }}>por contrato</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontSize: 36, fontWeight: 800, color: LC.text, letterSpacing: '-0.6px', lineHeight: 1 }}>Custom</span>
                      <span style={{ fontSize: 12, color: LC.text80 }}>negociado</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* ② CTA — same fixed height as BillingPlanCard */}
              <div style={{ height: 68, padding: '12px 24px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${LC.border}` }}>
                <button style={{ width: '100%', height: 44, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${LC.accent}`, background: LC.accent, color: '#fff' }}>
                  Hablar con ventas
                </button>
              </div>
              {/* ③ Features */}
              <div style={{ padding: '20px 24px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: LC.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>{BUSINESS_PLAN.featuresLabel}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {BUSINESS_PLAN.features.map(f => <LandingBullet key={f}>{f}</LandingBullet>)}
                </div>
              </div>
            </div>
          </div>

          {/* Features comparison link */}
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button
              onClick={() => onNavigate('featuresComparison')}
              style={{ fontSize: 13, color: LC.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            >
              Ver comparación completa de funciones →
            </button>
          </div>
        </div>

        {/* AI Credits — selector + detail (real packs €79 / €249 / €549 / flexible) */}
        <BillingCreditsBlock selectedPack={selectedPack} setSelectedPack={setSelectedPack} currentPlan={currentPlan} />

        {/* ── Seats — full width ───────────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${LC.border}` }}>
          {/* Section header */}
          <div style={{ padding: '32px 64px 0' }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: LC.text, marginBottom: 6 }}>Puestos adicionales</p>
            <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7', maxWidth: 680, marginBottom: 28 }}>
              Cada plan incluye puestos de base. Añade más en cualquier momento — la facturación <strong style={{ color: LC.text }}>se prorratea automáticamente</strong> hasta tu próxima fecha de renovación. Los puestos Lite (solo lectura) son <strong style={{ color: LC.text }}>gratuitos e ilimitados</strong> en todos los planes.
            </p>
          </div>
          {/* Table */}
          <div style={{ borderTop: `1px solid ${LC.border}` }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr', padding: '0 64px', background: LC.bg2, borderBottom: `1px solid ${LC.border}` }}>
              {['Plan', 'Puestos incluidos', 'Precio / puesto extra', 'Colaboradores Lite', ''].map((h, i) => (
                <div key={h + i} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
              ))}
            </div>
            {[
              { id: 'starter',  name: 'Starter',  seats: 3,    extraPrice: '€25 / mes',     note: 'Empieza desde aquí' },
              { id: 'growth',   name: 'Growth',   seats: 8,    extraPrice: '€22 / mes',     note: 'Más popular' },
              { id: 'scale',    name: 'Scale',    seats: 20,   extraPrice: '€19 / mes',     note: 'Para equipos grandes' },
              { id: 'business', name: 'Business', seats: null, extraPrice: 'Personalizado', note: 'Habla con ventas' },
            ].map(row => {
              const isCurrent = currentPlan.toLowerCase().includes(row.id);
              return (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1.2fr', padding: '0 64px', borderBottom: `1px solid ${LC.border}`, background: isCurrent ? LC.bg2 : 'transparent' }}>
                  <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: isCurrent ? 700 : 500, color: LC.text }}>{row.name}</span>
                    {isCurrent && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: LC.accent, padding: '2px 7px', letterSpacing: '0.04em' }}>ACTUAL</span>}
                  </div>
                  <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: LC.text }}>{row.seats != null ? `${row.seats} puestos` : 'Personalizado'}</span>
                  </div>
                  <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 400, color: isCurrent ? LC.accent : LC.text }}>{row.extraPrice}</span>
                  </div>
                  <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: LC.text }}>Ilimitados · Gratis</span>
                  </div>
                  <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {isCurrent ? (
                      <button style={{ height: 34, padding: '0 16px', fontSize: 12, fontWeight: 600, background: LC.text, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Añadir puesto
                      </button>
                    ) : (
                      <button onClick={() => onNavigate('billing')} style={{ height: 34, padding: '0 16px', fontSize: 12, fontWeight: 600, background: 'transparent', color: LC.text60, border: `1px solid ${LC.border}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        Cambiar a {row.name}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '16px 64px 32px' }}>
            <p style={{ fontSize: 12, color: LC.text60 }}>
              * El precio por puesto extra se aplica al puesto adicional por encima del límite incluido en tu plan. Se prorratea desde el momento de la activación.
            </p>
          </div>
        </div>

        {/* FAQs — full width */}
        <div style={{ padding: '40px 64px', borderBottom: `1px solid ${LC.border}` }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 24 }}>Preguntas frecuentes</p>
          <div>
            {FAQS.map(f => <BillingFaqItem key={f.q} q={f.q} a={f.a} />)}
            <div style={{ borderTop: `1px solid ${LC.border}` }} />
          </div>
        </div>

        {/* Final CTA */}
        <div style={{ padding: '48px 64px', position: 'relative', textAlign: 'center' }}>
          <LandingCornerDots />
          <p style={{ fontSize: 24, fontWeight: 800, color: LC.text, marginBottom: 12 }}>¿Tienes preguntas?</p>
          <p style={{ fontSize: 14, color: LC.text60, marginBottom: 24 }}>Nuestro equipo está disponible para ayudarte a elegir el plan adecuado.</p>
          <button style={{ padding: '12px 32px', fontSize: 14, fontWeight: 700, background: LC.accent, color: '#fff', border: 'none', cursor: 'pointer' }}>
            Hablar con ventas
          </button>
        </div>
      </div>
    </div>
  );
}

export function BillingView({ view: _view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'subscription' | 'invoices' | 'payment'>('subscription');
  const [billingEmail, setBillingEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: sub } = useApi(() => billingApi.subscription('org_default'), [], null);
  const { data: usageRaw } = useApi(() => billingApi.usage(), [], null);
  const { data: ledgerRaw, loading: ledgerLoading } = useApi(() => billingApi.ledger('org_default'), [], null);

  const ledger: any[] = Array.isArray(ledgerRaw) ? ledgerRaw : [];

  const planName: string = sub?.planName ?? sub?.plan_name ?? sub?.plan?.name ?? sub?.planId ?? sub?.plan_id ?? 'Advanced';
  const planStatus: string = sub?.status ?? 'trialing';
  const trialEnd: string | null = sub?.trialEnd ?? sub?.trial_end ?? null;
  const periodEnd: string | null = sub?.currentPeriodEnd ?? sub?.current_period_end ?? null;
  const cancelAtPeriodEnd: boolean = sub?.cancelAtPeriodEnd ?? sub?.cancel_at_period_end ?? false;
  const monthlyAmount: number = sub?.amountCents ?? sub?.amount_cents ?? sub?.amount ?? 0;
  const currency: string = (sub?.currency ?? 'usd').toUpperCase();
  const companyName: string = sub?.companyName ?? sub?.company_name ?? sub?.metadata?.companyName ?? 'Acme';
  const billingEmailFromSub: string = sub?.billingEmail ?? sub?.billing_email ?? usageRaw?.billingEmail ?? '';
  const cardBrand: string = sub?.cardBrand ?? sub?.card_brand ?? sub?.paymentMethod?.brand ?? '';
  const cardLast4: string = sub?.cardLast4 ?? sub?.card_last4 ?? sub?.paymentMethod?.last4 ?? '';
  const billingAddress: string = sub?.billingAddress ?? sub?.billing_address ?? sub?.address ?? '';
  const addons: any[] = Array.isArray(sub?.addons) ? sub.addons : Array.isArray(sub?.add_ons) ? sub.add_ons : [];
  const isTrialing: boolean = planStatus === 'trialing';
  const displayDate: string | null = isTrialing ? trialEnd : periodEnd;

  useEffect(() => {
    if (billingEmailFromSub && !billingEmail) setBillingEmail(billingEmailFromSub);
  }, [billingEmailFromSub]);

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; }
  }
  function fmtAmount(cents: number, cur = currency): string {
    return cur === 'EUR' ? `€${(cents/100).toFixed(2)}` : `${cur} ${(cents/100).toFixed(2)}`;
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const r = await billingApi.portalSession('org_default', { returnUrl: window.location.href });
      if (r?.url) window.open(r.url, '_blank');
    } catch { /* ignore */ } finally { setPortalLoading(false); }
  }

  const ACC = '#f76b1c';

  const TABS = [
    { id: 'subscription', label: 'Suscripción' },
    { id: 'invoices',     label: 'Facturas' },
    { id: 'payment',      label: 'Detalles de pago' },
  ] as const;

  /* ── small icon helpers ── */
  const IcoCard = () => <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#6b7280] flex-shrink-0"><path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2H2V4zM2 8h16v8a1 1 0 01-1 1H3a1 1 0 01-1-1V8z"/></svg>;
  const IcoBuild = () => <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#6b7280] flex-shrink-0"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd"/></svg>;
  const IcoCal = () => <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#6b7280] flex-shrink-0"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 8h12v8H4V8z" clipRule="evenodd"/></svg>;
  const IcoInfo = () => <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#9ca3af] flex-shrink-0 mt-0.5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd"/></svg>;
  const IcoBook = () => <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#6b7280]"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>;

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-white">

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-8 pt-6 pb-0 border-b border-[#e5e7eb]">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[18px] font-bold text-[#111827] flex items-center gap-2">
            <svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="17" height="17" rx="2"/><path d="M1.5 7h17"/></svg>
            Facturación
          </h1>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-1.5 text-[13px] text-[#374151] hover:text-[#111827] transition-colors">
              <IcoBook />
              Aprender
            </button>
            <button className="text-[13px] text-[#374151] hover:text-[#111827] transition-colors">Deja un comentario</button>
          </div>
        </div>
        <div className="flex gap-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors"
              style={{ borderBottomColor: tab === t.id ? ACC : 'transparent', color: tab === t.id ? '#111827' : '#6b7280' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto bg-white" style={{ minHeight: 0 }}>

        {/* ═══ TAB: Suscripción ═══ */}
        {tab === 'subscription' && (
          <div className="px-8 py-7 max-w-[860px] mx-auto w-full">

            {/* Summary row */}
            <div className="flex items-start justify-between pb-6 mb-6 border-b border-[#e5e7eb]">
              <div>
                <h2 className="text-[16px] font-semibold text-[#111827]">
                  {isTrialing ? 'Prueba gratuita' : planName}
                </h2>
                <p className="text-[13px] text-[#6b7280] mt-1">
                  {isTrialing
                    ? `Fecha de finalización de la prueba: ${fmtDate(displayDate)}`
                    : cancelAtPeriodEnd
                      ? `Cancela el: ${fmtDate(displayDate)}`
                      : `Próxima renovación: ${fmtDate(displayDate)}`}
                </p>
              </div>
              <span className="text-[20px] font-bold text-[#111827]">
                {monthlyAmount > 0 ? fmtAmount(monthlyAmount) : `${currency} 0.00`}
              </span>
            </div>

            {/* Plan card */}
            <div className="border border-[#e5e7eb] rounded-lg mb-4">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb]">
                <span className="text-[14px] font-semibold text-[#111827]">Plan</span>
                <button className="flex items-center gap-1.5 text-[13px] text-[#374151] hover:text-[#111827] border border-[#e5e7eb] rounded-md px-3 py-1.5 transition-colors">
                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-[#6b7280]"><path fillRule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h8a1 1 0 100-2H3z" clipRule="evenodd"/></svg>
                  Ver funciones incluidas
                </button>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <span className="text-[14px] font-semibold text-[#111827] capitalize">{planName}</span>
                  {isTrialing && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb]">
                      Prueba De {planName}
                    </span>
                  )}
                  <button onClick={() => onNavigate('featuresComparison')}
                    className="flex items-center gap-1.5 text-[13px] text-[#374151] hover:text-[#111827] transition-colors">
                    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-[#6b7280]"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/></svg>
                    Cambiar plan
                  </button>
                </div>
                <p className="text-[12px] text-[#6b7280] flex items-start gap-1.5">
                  <IcoInfo />
                  Los cambios de plazas pueden tardar hasta 24 horas en reflejarse aquí.
                </p>
              </div>
            </div>

            {/* Complementos */}
            <div className="border border-[#e5e7eb] rounded-lg">
              <div className="px-5 py-3 border-b border-[#e5e7eb]">
                <span className="text-[14px] font-semibold text-[#111827]">Complementos</span>
              </div>
              {(addons.length > 0 ? addons.map((a: any) => ({ name: a.name ?? a.id, status: a.status })) : [
                { name: 'Asistencia proactiva Plus', status: 'trialing' },
                { name: 'Fin AI Copilot',            status: 'trialing' },
                { name: 'Pro',                       status: 'trialing' },
              ]).map((item, i, arr) => (
                <div key={item.name} className={`flex items-center gap-3 px-5 py-3 ${i < arr.length - 1 ? 'border-b border-[#f3f4f6]' : ''}`}>
                  <span className="text-[13px] text-[#111827]">{item.name}</span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb]">
                    {item.status === 'trialing' || isTrialing ? 'Prueba' : 'Activo'}
                  </span>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ═══ TAB: Facturas ═══ */}
        {tab === 'invoices' && (
          <div className="px-8 py-7">
            <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
              <div className="grid bg-[#f9fafb] border-b border-[#e5e7eb] px-5 py-2.5"
                style={{ gridTemplateColumns: '1fr 140px 150px 110px 60px' }}>
                {['Descripción', 'Fecha', 'Importe', 'Estado', ''].map(h => (
                  <div key={h} className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">{h}</div>
                ))}
              </div>
              {ledgerLoading ? (
                <div className="py-12 text-center text-[13px] text-[#9ca3af]">Cargando facturas…</div>
              ) : ledger.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-[14px] font-semibold text-[#111827] mb-1">Sin facturas todavía</p>
                  <p className="text-[13px] text-[#9ca3af]">Las facturas aparecerán aquí cuando se genere la primera.</p>
                </div>
              ) : ledger.map((inv: any, idx: number) => {
                const invStatus = inv.status ?? inv.type ?? 'paid';
                const IS: Record<string, { bg: string; text: string; label: string }> = {
                  paid: { bg: '#f0fdf4', text: '#16a34a', label: 'Pagada' },
                  open: { bg: '#fefce8', text: '#a16207', label: 'Pendiente' },
                  draft:{ bg: '#f9fafb', text: '#6b7280', label: 'Borrador' },
                  void: { bg: '#f9fafb', text: '#6b7280', label: 'Anulada' },
                };
                const is = IS[invStatus] ?? IS.paid;
                const desc = inv.description ?? inv.desc ?? `Factura #${idx + 1}`;
                const invDate = inv.date ?? inv.createdAt ?? inv.created_at ?? null;
                const invAmount = inv.amountCents ?? inv.amount_cents ?? inv.amount ?? 0;
                const invCur = (inv.currency ?? currency).toUpperCase();
                const invUrl = inv.invoicePdf ?? inv.invoice_pdf ?? inv.receiptUrl ?? inv.receipt_url ?? inv.url ?? null;
                return (
                  <div key={inv.id ?? idx}
                    className={`grid items-center px-5 py-3.5 hover:bg-[#f9fafb] transition-colors ${idx > 0 ? 'border-t border-[#e5e7eb]' : ''}`}
                    style={{ gridTemplateColumns: '1fr 140px 150px 110px 60px' }}>
                    <div className="text-[13px] text-[#111827] font-medium truncate pr-4">{desc}</div>
                    <div className="text-[13px] text-[#6b7280]">{fmtDate(invDate)}</div>
                    <div className="text-[13px] font-semibold text-[#111827]">{invAmount ? fmtAmount(invAmount, invCur) : '—'}</div>
                    <div><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: is.bg, color: is.text }}>{is.label}</span></div>
                    <div className="flex justify-end">{invUrl && <a href={invUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold hover:underline" style={{ color: ACC }}>PDF</a>}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ TAB: Detalles de pago ═══ */}
        {tab === 'payment' && (
          <div className="px-8 py-7 max-w-[860px]">

            {/* Pago */}
            <h2 className="text-[15px] font-semibold text-[#111827] mb-4">Pago</h2>
            <div className="flex flex-col gap-3 mb-8">
              <div className="flex items-center gap-2 text-[13px]">
                <IcoCal />
                <span className="font-semibold text-[#111827]">Fecha de facturación:</span>
                <span className="text-[#374151]">5th de cada mes</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] flex-wrap">
                <IcoCard />
                <span className="font-semibold text-[#111827]">Facturado a:</span>
                <span className="text-[#374151]">
                  {cardBrand ? `${cardBrand} terminada en ${cardLast4}` : 'no se agregó una tarjeta de crédito'}
                </span>
                <button onClick={openPortal} className="font-medium hover:underline" style={{ color: ACC }}>
                  {cardBrand ? 'Editar tarjeta' : 'Agregar tarjeta'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-[13px] flex-wrap">
                <IcoBuild />
                <span className="font-semibold text-[#111827]">Ubicación de la empresa:</span>
                <span className="text-[#374151]">
                  {billingAddress || 'no se agregó la dirección de la empresa'}
                </span>
                <button onClick={openPortal} className="font-medium hover:underline" style={{ color: ACC }}>
                  {billingAddress ? 'Editar dirección' : 'Agregar dirección de la empresa'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-[13px] flex-wrap">
                <IcoBuild />
                <span className="font-semibold text-[#111827]">Nombre de la empresa:</span>
                <span className="text-[#374151]">{companyName}</span>
                <button onClick={openPortal} className="font-medium hover:underline" style={{ color: ACC }}>
                  Editar nombre de la empresa
                </button>
              </div>
            </div>

            <div className="border-t border-[#e5e7eb] mb-8" />

            {/* Contactos de facturación */}
            <h2 className="text-[15px] font-semibold text-[#111827] mb-2">Contactos de facturación</h2>
            <p className="text-[13px] text-[#374151] mb-3 flex items-start gap-1.5">
              Envía facturas, excedentes y otros mensajes relacionados con la facturación a la siguiente lista:
              <IcoInfo />
            </p>
            <div className="border border-[#d1d5db] rounded-md p-3 mb-2 flex flex-wrap gap-2 items-start min-h-[80px]">
              {billingEmailFromSub && (
                <span className="bg-[#f3f4f6] text-[#374151] text-[13px] px-2 py-1 rounded">{billingEmailFromSub}</span>
              )}
              <input
                type="email"
                value={billingEmail === billingEmailFromSub ? '' : billingEmail}
                onChange={e => setBillingEmail(e.target.value)}
                placeholder="Ingresa una dirección de correo electrónico"
                className="flex-1 min-w-[220px] text-[13px] outline-none text-[#374151] placeholder-[#9ca3af] bg-transparent"
              />
            </div>
            <p className="text-[12px] text-[#6b7280] mb-4">
              Puedes agregar varias direcciones de correo electrónico separándolas con una coma o un espacio.
            </p>
            <button
              onClick={async () => { setSavingEmail(true); await new Promise(r => setTimeout(r, 700)); setSavingEmail(false); }}
              disabled={savingEmail}
              className="h-9 px-4 text-[13px] font-medium border border-[#d1d5db] rounded-md text-[#374151] hover:bg-[#f9fafb] disabled:opacity-50 transition-colors">
              {savingEmail ? 'Guardando…' : 'Guardar'}
            </button>

          </div>
        )}

      </div>
    </div>
  );
}
// ── FeaturesComparisonView ────────────────────────────────────────────────────

const FEATURE_SECTIONS = [
  {
    title: 'Bandeja de entrada',
    rows: [
      { feature: 'Bandeja de entrada compartida', starter: true, growth: true, scale: true, business: true },
      { feature: 'Reglas de asignación automática', starter: false, growth: true, scale: true, business: true },
      { feature: 'Vistas personalizadas', starter: '3', growth: 'Ilimitadas', scale: 'Ilimitadas', business: 'Ilimitadas' },
      { feature: 'Mención de compañeros', starter: true, growth: true, scale: true, business: true },
      { feature: 'Notas internas', starter: true, growth: true, scale: true, business: true },
    ],
  },
  {
    title: 'AI & Automatización',
    rows: [
      { feature: 'AI Copilot', starter: false, growth: true, scale: true, business: true },
      { feature: 'Fin AI Agent', starter: false, growth: false, scale: true, business: true },
      { feature: 'Créditos AI incluidos', starter: '0', growth: '500/mes', scale: '2.000/mes', business: 'Personalizado' },
      { feature: 'Flujos de trabajo automatizados', starter: '5', growth: 'Ilimitados', scale: 'Ilimitados', business: 'Ilimitados' },
      { feature: 'Resolución automática con AI', starter: false, growth: false, scale: true, business: true },
    ],
  },
  {
    title: 'Centro de ayuda',
    rows: [
      { feature: 'Centro de ayuda público', starter: true, growth: true, scale: true, business: true },
      { feature: 'Múltiples centros de ayuda', starter: false, growth: false, scale: true, business: true },
      { feature: 'Artículos ilimitados', starter: false, growth: true, scale: true, business: true },
      { feature: 'Personalización avanzada', starter: false, growth: false, scale: true, business: true },
      { feature: 'Búsqueda por IA', starter: false, growth: true, scale: true, business: true },
    ],
  },
  {
    title: 'Canales',
    rows: [
      { feature: 'Chat en vivo (web)', starter: true, growth: true, scale: true, business: true },
      { feature: 'Correo electrónico', starter: true, growth: true, scale: true, business: true },
      { feature: 'WhatsApp', starter: false, growth: true, scale: true, business: true },
      { feature: 'Instagram', starter: false, growth: true, scale: true, business: true },
      { feature: 'SMS', starter: false, growth: false, scale: true, business: true },
    ],
  },
  {
    title: 'Informes',
    rows: [
      { feature: 'Informes básicos', starter: true, growth: true, scale: true, business: true },
      { feature: 'Informes personalizados', starter: false, growth: true, scale: true, business: true },
      { feature: 'Exportación de datos (CSV)', starter: false, growth: true, scale: true, business: true },
      { feature: 'Panel de rendimiento de agentes', starter: false, growth: true, scale: true, business: true },
      { feature: 'Informes de CSAT', starter: false, growth: true, scale: true, business: true },
    ],
  },
  {
    title: 'Seguridad & Acceso',
    rows: [
      { feature: 'SSO / SAML', starter: false, growth: false, scale: true, business: true },
      { feature: 'Roles personalizados', starter: false, growth: false, scale: true, business: true },
      { feature: 'Log de auditoría', starter: false, growth: false, scale: false, business: true },
      { feature: '2FA obligatorio', starter: false, growth: false, scale: true, business: true },
      { feature: 'Revisión de seguridad avanzada', starter: false, growth: false, scale: false, business: true },
    ],
  },
  {
    title: 'Integraciones',
    rows: [
      { feature: 'Slack', starter: true, growth: true, scale: true, business: true },
      { feature: 'Salesforce', starter: false, growth: true, scale: true, business: true },
      { feature: 'HubSpot', starter: false, growth: true, scale: true, business: true },
      { feature: 'API pública', starter: true, growth: true, scale: true, business: true },
      { feature: 'Webhooks', starter: false, growth: true, scale: true, business: true },
      { feature: 'Límite de velocidad API', starter: '100/min', growth: '500/min', scale: '2.000/min', business: 'Personalizado' },
    ],
  },
  {
    title: 'Soporte',
    rows: [
      { feature: 'Centro de ayuda', starter: true, growth: true, scale: true, business: true },
      { feature: 'Soporte por chat', starter: false, growth: true, scale: true, business: true },
      { feature: 'Soporte prioritario', starter: false, growth: false, scale: true, business: true },
      { feature: 'Gestor de cuenta dedicado', starter: false, growth: false, scale: false, business: true },
      { feature: 'Implementación guiada', starter: false, growth: false, scale: false, business: true },
    ],
  },
];

function FcCell({ value }: { value: boolean | string }) {
  if (value === true)  return <span style={{ color: LC.accent, fontSize: 16, fontWeight: 700 }}>✓</span>;
  if (value === false) return <span style={{ color: LC.border, fontSize: 16, fontWeight: 700 }}>—</span>;
  return <span style={{ fontSize: 12, color: LC.text80 }}>{value}</span>;
}

export function FeaturesComparisonView({ view: _view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const cols = ['2fr', '1fr', '1fr', '1fr', '1fr'];
  const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: cols.join(' ') };
  const PLANS_FC = ['Starter', 'Growth', 'Scale', 'Business'];
  const planKeys: Array<'starter' | 'growth' | 'scale' | 'business'> = ['starter', 'growth', 'scale', 'business'];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={{ background: LC.bg }}>
      <TrialBanner />
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Header */}
        <div style={{ borderBottom: `1px solid ${LC.border}`, padding: '32px 64px 28px', position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
          <LandingCornerDots />
          <button
            onClick={() => onNavigate('billingPlans')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: LC.text60, background: 'none', border: `1px solid ${LC.border}`, padding: '6px 14px', cursor: 'pointer', flexShrink: 0 }}
          >
            ← Volver a planes
          </button>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Comparativa completa</p>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: LC.text, lineHeight: '1.15' }}>Funciones por plan</h1>
          </div>
        </div>

        {/* Sticky plan header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: LC.bg, borderBottom: `1px solid ${LC.border}` }}>
          <div style={{ ...gridStyle, padding: '0 64px' }}>
            <div style={{ padding: '16px 0' }} />
            {PLANS_FC.map((p, i) => (
              <div key={p} style={{ padding: '16px 12px', textAlign: 'center', borderLeft: `1px solid ${LC.border}`, background: 'transparent' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: LC.text, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{p}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature sections */}
        <div style={{ padding: '0 64px 64px' }}>
          {FEATURE_SECTIONS.map(section => (
            <div key={section.title} style={{ marginTop: 32 }}>
              {/* Section header */}
              <div style={{ ...gridStyle, borderBottom: `2px solid ${LC.text}`, paddingBottom: 8, marginBottom: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: LC.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{section.title}</p>
                {PLANS_FC.map((p, i) => (
                  <div key={p} style={{ borderLeft: `1px solid ${LC.border}`, background: 'transparent' }} />
                ))}
              </div>
              {/* Rows */}
              {section.rows.map((row, ri) => (
                <div key={row.feature} style={{ ...gridStyle, borderBottom: `1px solid ${LC.border}`, background: ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                  <div style={{ padding: '12px 0', fontSize: 13, color: LC.text80 }}>{row.feature}</div>
                  {planKeys.map((k, i) => (
                    <div key={k} style={{ padding: '12px', textAlign: 'center', borderLeft: `1px solid ${LC.border}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FcCell value={row[k]} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {/* Bottom CTA */}
          <div style={{ marginTop: 48, border: `1px solid ${LC.border}`, padding: '40px', position: 'relative', textAlign: 'center' }}>
            <LandingCornerDots />
            <p style={{ fontSize: 20, fontWeight: 800, color: LC.text, marginBottom: 8 }}>¿Listo para empezar?</p>
            <p style={{ fontSize: 14, color: LC.text60, marginBottom: 24 }}>Prueba cualquier plan gratis durante 14 días, sin tarjeta de crédito.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => onNavigate('billingPlans')}
                style={{ padding: '10px 28px', fontSize: 14, fontWeight: 700, background: LC.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Ver planes y precios
              </button>
              <button style={{ padding: '10px 28px', fontSize: 14, fontWeight: 700, background: 'transparent', color: LC.text, border: `1.5px solid ${LC.border}`, cursor: 'pointer' }}>
                Hablar con ventas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HorarioAtencionView ────────────────────────────────────────────────────────

interface DaySchedule { enabled: boolean; start: string; end: string; }
type WeekSchedule = Record<string, DaySchedule>;

const DEFAULT_WEEK_SCHEDULE: WeekSchedule = {
  lunes:     { enabled: true,  start: '09:00', end: '18:00' },
  martes:    { enabled: true,  start: '09:00', end: '18:00' },
  miércoles: { enabled: true,  start: '09:00', end: '18:00' },
  jueves:    { enabled: true,  start: '09:00', end: '18:00' },
  viernes:   { enabled: true,  start: '09:00', end: '18:00' },
  sábado:    { enabled: false, start: '10:00', end: '14:00' },
  domingo:   { enabled: false, start: '10:00', end: '14:00' },
};

interface HolidayEntry { id: string; name: string; date: string; }
interface TeamSchedule { id: string; teamName: string; timezone: string; schedule: WeekSchedule; responseTime: string; }

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const RESPONSE_TIME_OPTIONS = [
  { value: 'asap',    label: 'Respondemos lo antes posible' },
  { value: 'minutes', label: 'En minutos' },
  { value: 'hours',   label: 'En pocas horas' },
  { value: 'day',     label: 'En el mismo día' },
  { value: 'days',    label: 'En 2–3 días hábiles' },
  { value: 'week',    label: 'En una semana' },
];

const TIMEZONES_SHORT = ['Europe/Madrid','Europe/London','America/New_York','America/Los_Angeles','America/Chicago','America/Sao_Paulo','Asia/Tokyo','Asia/Shanghai','Australia/Sydney','UTC'];

function WeekScheduleEditor({ schedule, onChange }: { schedule: WeekSchedule; onChange: (s: WeekSchedule) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {Object.keys(schedule).map(day => {
        const d = schedule[day];
        return (
          <div key={day} className="flex items-center gap-3">
            <button
              onClick={() => onChange({ ...schedule, [day]: { ...d, enabled: !d.enabled } })}
              className="flex items-center gap-2 w-[110px] text-left"
            >
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${d.enabled ? 'bg-[#3b59f6] border-[#3b59f6]' : 'bg-white border-[#d1d1ce]'}`}>
                {d.enabled && <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white"><path d="M1 5l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>}
              </span>
              <span className={`text-[13px] font-medium capitalize ${d.enabled ? 'text-[#1a1a1a]' : 'text-[#bbb]'}`}>
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </span>
            </button>
            {d.enabled ? (
              <div className="flex items-center gap-2">
                <select value={d.start} onChange={e => onChange({ ...schedule, [day]: { ...d, start: e.target.value } })}
                  className="border border-[#e9eae6] rounded-[6px] px-2 py-1 text-[13px] bg-white w-[85px] focus:outline-none focus:border-[#3b59f6]">
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-[13px] text-[#646462]">–</span>
                <select value={d.end} onChange={e => onChange({ ...schedule, [day]: { ...d, end: e.target.value } })}
                  className="border border-[#e9eae6] rounded-[6px] px-2 py-1 text-[13px] bg-white w-[85px] focus:outline-none focus:border-[#3b59f6]">
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ) : (
              <span className="text-[13px] text-[#bbb]">Cerrado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Mini messenger preview for the promo banner
function MessengerPreview() {
  return (
    <div className="bg-white rounded-[12px] shadow-lg overflow-hidden w-[220px] border border-[#e9eae6]">
      <div className="bg-[#6366f1] px-3 py-2 flex items-center gap-2">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M8 1C4.13 1 1 3.91 1 7.5c0 1.99.97 3.77 2.5 4.95V15l2.56-1.41A8.17 8.17 0 008 14c3.87 0 7-2.91 7-6.5S11.87 1 8 1z"/></svg>
        <span className="text-white text-[11px] font-medium">New conversation</span>
      </div>
      <div className="p-3">
        <div className="flex -space-x-1.5 mb-2">
          {['#a78bfa','#60a5fa','#34d399'].map((c,i) => (
            <div key={i} className="w-6 h-6 rounded-full border-2 border-white" style={{ background: c }} />
          ))}
        </div>
        <p className="text-[11px] font-semibold text-[#1a1a1a]">Usual reply time is a few minutes</p>
        <p className="text-[10px] text-[#646462] mt-0.5">Ask us anything, or share your feedback</p>
      </div>
    </div>
  );
}

export function HorarioAtencionView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: ws } = useApi(() => workspacesApi.currentContext(), [], null);
  const { data: hoursData } = useApi(() => workingHoursApi.get(), [], null);

  const [tab, setTab] = useState<'general' | 'personalizado'>('general');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [promoDismissed, setPromoDismissed] = useState(false);

  // General schedule
  const [weekSchedule, setWeekSchedule] = useState<WeekSchedule>(DEFAULT_WEEK_SCHEDULE);
  const [responseTime, setResponseTime] = useState('asap');
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [showScheduleEditor, setShowScheduleEditor] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');

  // Personalizado
  const [teamSchedules, setTeamSchedules] = useState<TeamSchedule[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamSchedule | null>(null);
  const [teamFormName, setTeamFormName] = useState('');
  const [teamFormTz, setTeamFormTz] = useState('Europe/Madrid');
  const [teamFormSchedule, setTeamFormSchedule] = useState<WeekSchedule>(DEFAULT_WEEK_SCHEDULE);
  const [teamFormResponse, setTeamFormResponse] = useState('asap');

  // Load persisted working hours
  useEffect(() => {
    if (!hoursData) return;
    const d = hoursData as any;
    if (d.schedule) setWeekSchedule(d.schedule);
    if (d.response_time) setResponseTime(d.response_time);
    if (d.holidays) setHolidays(d.holidays);
    if (d.team_schedules) setTeamSchedules(d.team_schedules);
  }, [hoursData]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await workingHoursApi.upsert({
        schedule: weekSchedule,
        response_time: responseTime,
        holidays,
        team_schedules: teamSchedules,
      });
      // Also persist to workspace settings as fallback
      const wsId = (ws as any)?.id ?? '';
      if (wsId) {
        await workspacesApi.updateSettings(wsId, {
          officeHours: weekSchedule,
          responseTime,
          holidays,
        } as any).catch(() => {/* non-fatal */});
      }
      showToast('Horario guardado correctamente.');
    } catch {
      showToast('Horario guardado (modo demo).');
    } finally {
      setSaving(false);
    }
  }

  function addHoliday() {
    if (!newHolidayName.trim() || !newHolidayDate) return;
    setHolidays(prev => [...prev, { id: Date.now().toString(), name: newHolidayName.trim(), date: newHolidayDate }]);
    setNewHolidayName(''); setNewHolidayDate('');
    setShowHolidayModal(false);
  }

  function removeHoliday(id: string) {
    setHolidays(prev => prev.filter(h => h.id !== id));
  }

  function openNewTeam() {
    setEditingTeam(null);
    setTeamFormName(''); setTeamFormTz('Europe/Madrid');
    setTeamFormSchedule({ ...DEFAULT_WEEK_SCHEDULE }); setTeamFormResponse('asap');
    setShowTeamModal(true);
  }

  function openEditTeam(ts: TeamSchedule) {
    setEditingTeam(ts);
    setTeamFormName(ts.teamName); setTeamFormTz(ts.timezone ?? 'Europe/Madrid');
    setTeamFormSchedule({ ...ts.schedule }); setTeamFormResponse(ts.responseTime);
    setShowTeamModal(true);
  }

  function saveTeam() {
    if (!teamFormName.trim()) return;
    const updated: TeamSchedule = {
      id: editingTeam?.id ?? Date.now().toString(),
      teamName: teamFormName.trim(),
      timezone: teamFormTz,
      schedule: teamFormSchedule,
      responseTime: teamFormResponse,
    };
    setTeamSchedules(prev =>
      editingTeam ? prev.map(t => t.id === editingTeam.id ? updated : t) : [...prev, updated]
    );
    setShowTeamModal(false);
    showToast(editingTeam ? 'Horario actualizado.' : 'Equipo añadido.');
  }

  function removeTeam(id: string) {
    if (!window.confirm('¿Eliminar este horario de equipo?')) return;
    setTeamSchedules(prev => prev.filter(t => t.id !== id));
    showToast('Equipo eliminado.');
  }

  function scheduleSummary(schedule: WeekSchedule) {
    const enabled = (Object.entries(schedule) as [string, DaySchedule][]).filter(([, d]) => d.enabled);
    if (enabled.length === 0) return 'Disponible 24/7';
    if (enabled.length === 7) return `Todos los días ${enabled[0][1].start}–${enabled[0][1].end}`;
    const grouped = enabled.map(([day]) => day.slice(0, 3)).join(', ');
    return `${grouped} · ${enabled[0][1].start}–${enabled[0][1].end}`;
  }

  const enabledDays = (Object.entries(weekSchedule) as [string, DaySchedule][]).filter(([, d]) => d.enabled);
  const wsTimezone = (ws as any)?.settings?.timezone ?? 'Europe/Madrid';

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white text-[13px] px-4 py-2.5 rounded-[10px] shadow-lg ${toast.ok ? 'bg-[#1a1a1a]' : 'bg-[#b91c1c]'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[18px] font-bold text-[#1a1a1a]">Horario de atención</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 text-[13px] text-[#646462] border border-[#e9eae6] rounded-lg px-3 py-1.5 hover:bg-[#f8f8f7]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M8 2a6 6 0 100 12A6 6 0 008 2zm.75 9H7.25V7h1.5v4zm0-5H7.25V4.5h1.5V6z"/></svg>
                Aprender
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M4 6l4 4 4-4"/></svg>
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-0 px-6 border-b border-[#e9eae6] flex-shrink-0">
            {[
              { id: 'general' as const, label: 'General' },
              { id: 'personalizado' as const, label: 'Horario de atención personalizado' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === t.id ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ══ TAB: General ══ */}
            {tab === 'general' && (
              <div className="p-6 flex flex-col gap-0">

                {/* Promo banner */}
                {!promoDismissed && (
                  <div className="border border-[#e9eae6] rounded-[12px] mb-5 overflow-hidden relative">
                    <button
                      onClick={() => setPromoDismissed(true)}
                      className="absolute top-3 right-3 text-[#a4a4a2] hover:text-[#1a1a1a] z-10"
                    >
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                    <div className="flex gap-6 p-5">
                      <div className="flex-1">
                        <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-2">Establece siempre las expectativas correctas</h2>
                        <p className="text-[13px] text-[#646462] mb-4">
                          <span className="text-[#f97316]">Los horarios de atención y los tiempos de respuesta</span> permiten a los clientes saber cuándo están disponibles tus equipos y con qué rapidez suelen responder.
                        </p>
                        <div className="flex flex-col gap-2">
                          <a href="#" className="flex items-center gap-1.5 text-[12.5px] text-[#1a1a1a] hover:text-[#3b59f6]" onClick={e => e.preventDefault()}>
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current text-[#a4a4a2]"><path d="M2 2h5v2H4v8h8v-3h2v5H2V2zm7 0h5v5h-2V4.41l-5.3 5.3-1.41-1.41L12.59 3H9V1z"/></svg>
                            Horario de atención y tiempo de respuesta
                          </a>
                          <a href="#" className="flex items-center gap-1.5 text-[12.5px] text-[#1a1a1a] hover:text-[#3b59f6]" onClick={e => e.preventDefault()}>
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current text-[#a4a4a2]"><path d="M2 2h5v2H4v8h8v-3h2v5H2V2zm7 0h5v5h-2V4.41l-5.3 5.3-1.41-1.41L12.59 3H9V1z"/></svg>
                            Utiliza Fin AI Agent fuera del horario de oficina
                          </a>
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center">
                        <MessengerPreview />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Horario de oficina predeterminado ── */}
                <div className="border border-[#e9eae6] rounded-[12px] mb-4 overflow-hidden">
                  <div className="flex gap-6 p-5">
                    <div className="flex-1">
                      <h3 className="text-[14px] font-bold text-[#1a1a1a] mb-1">horario de oficina predeterminado</h3>
                      <p className="text-[12.5px] text-[#646462] mb-3">
                        Esto se aplica a todas las conversaciones en tu espacio de trabajo. Si un cliente inicia una conversación fuera de este horario, verá cuándo volverás a su zona horaria. También puedes establecer horarios de atención para equipos específicos.
                      </p>
                      <a href="#" className="text-[12.5px] text-[#f97316] hover:underline" onClick={e => { e.preventDefault(); setTab('personalizado'); }}>
                        Ver el horario de atención personalizado.
                      </a>
                    </div>
                    <div className="w-[320px] flex-shrink-0">
                      <p className="text-[12px] text-[#646462] mb-3">
                        Los horarios se basan en la zona horaria de tu espacio de trabajo (<span className="text-[#f97316] underline cursor-pointer" onClick={() => onNavigate('workspaceGeneral')}>{wsTimezone}</span>). Si no se especifica, la disponibilidad predeterminada es 24 horas al día, los 7 días a la semana (siempre activo).
                      </p>

                      {!showScheduleEditor && (
                        <>
                          {enabledDays.length > 0 ? (
                            <div className="flex flex-col gap-1 mb-3">
                              {enabledDays.map(([day, d]) => (
                                <div key={day} className="flex items-center gap-3 text-[12.5px]">
                                  <span className="w-[90px] capitalize text-[#1a1a1a] font-medium">{day}</span>
                                  <span className="text-[#646462]">{d.start} – {d.end}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[12.5px] text-[#a4a4a2] italic mb-3">Disponible 24/7 (sin restricciones)</p>
                          )}
                          <button
                            onClick={() => setShowScheduleEditor(true)}
                            className="text-[12.5px] text-[#f97316] font-medium hover:underline flex items-center gap-1"
                          >
                            + {enabledDays.length === 0 ? 'Añadir horas' : 'Editar horas'}
                          </button>
                        </>
                      )}

                      {showScheduleEditor && (
                        <div className="flex flex-col gap-3">
                          <WeekScheduleEditor schedule={weekSchedule} onChange={setWeekSchedule} />
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => setShowScheduleEditor(false)}
                              className="text-[12.5px] text-[#646462] border border-[#e9eae6] rounded-lg px-3 py-1.5 hover:bg-[#f8f8f7]"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => { setShowScheduleEditor(false); handleSave(); }}
                              disabled={saving}
                              className="text-[12.5px] font-semibold text-white bg-[#1a1a1a] rounded-lg px-3 py-1.5 hover:bg-[#333] disabled:opacity-50"
                            >
                              {saving ? 'Guardando…' : 'Guardar'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Vacaciones y cierres */}
                      <div className="mt-4 pt-4 border-t border-[#e9eae6]">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Vacaciones y cierres</p>
                        <p className="text-[12px] text-[#646462] mb-2">Agregue fechas específicas en las que su equipo está cerrado o tiene un horario diferente al horario regular.</p>
                        {holidays.map(h => (
                          <div key={h.id} className="flex items-center justify-between py-1.5 text-[12.5px] border-b border-[#f1f1ee] last:border-0">
                            <div>
                              <span className="font-medium text-[#1a1a1a]">{h.name}</span>
                              <span className="text-[#646462] ml-2">{new Date(h.date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}</span>
                            </div>
                            <button onClick={() => removeHoliday(h.id)} className="text-[#ef4444] hover:underline text-[11.5px] ml-2">×</button>
                          </div>
                        ))}
                        <button
                          onClick={() => setShowHolidayModal(true)}
                          className="mt-2 text-[12.5px] text-[#f97316] font-medium hover:underline flex items-center gap-1"
                        >
                          + Agregar día festivo o cierre
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Tiempos de respuesta ── */}
                <div className="border border-[#e9eae6] rounded-[12px] mb-4 overflow-hidden">
                  <div className="flex gap-6 p-5">
                    <div className="flex-1">
                      <h3 className="text-[14px] font-bold text-[#1a1a1a] mb-1">Tiempos de respuesta</h3>
                      <p className="text-[12.5px] text-[#646462] mb-2">
                        Esto se aplica a todas las conversaciones en tu espacio de trabajo. Si un cliente inicia una conversación durante el horario de atención, verá tu tiempo de respuesta habitual. También puedes establecer tiempos de respuesta para equipos específicos.
                        {' '}<a href="#" className="text-[#f97316] hover:underline" onClick={e => e.preventDefault()}>Consulta los ajustes del equipo.</a>
                      </p>
                    </div>
                    <div className="w-[320px] flex-shrink-0 flex flex-col gap-3">
                      <div>
                        <p className="text-[12px] text-[#646462] mb-1.5">El equipo suele responder:</p>
                        <select
                          value={responseTime} onChange={e => setResponseTime(e.target.value)}
                          className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#3b59f6]"
                        >
                          {RESPONSE_TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={handleSave} disabled={saving}
                        className="self-start text-[12.5px] font-semibold text-white bg-[#1a1a1a] rounded-lg px-4 py-1.5 hover:bg-[#333] disabled:opacity-50"
                      >
                        {saving ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Fin AI Agent ── */}
                <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
                  <div className="flex gap-6 p-5">
                    <div className="flex-1">
                      <h3 className="text-[14px] font-bold text-[#1a1a1a] mb-1">Fin AI Agent</h3>
                      <p className="text-[12.5px] text-[#646462]">
                        Cuando tu personal está fuera de línea, Fin puede intervenir y encargarse de las conversaciones de modo que los clientes reciban ayuda oportuna las 24 horas.
                        {' '}<a href="#" className="text-[#f97316] hover:underline" onClick={e => { e.preventDefault(); onNavigate('fin'); }}>Configúralo en los flujos de trabajo.</a>
                      </p>
                    </div>
                    <div className="w-[360px] flex-shrink-0 flex items-center justify-center py-2">
                      <FinFlowPreview />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ══ TAB: Personalizado ══ */}
            {tab === 'personalizado' && (
              <div className="p-6 flex flex-col gap-4">

                {/* Promo card */}
                <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
                  <div className="flex gap-6 p-5">
                    <div className="flex-1">
                      <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-2">Diferentes equipos, diferentes horarios de atención</h2>
                      <p className="text-[12.5px] text-[#646462] mb-4">
                        Puedes <span className="text-[#f97316]">establecer un horario de atención personalizado</span> para cualquier equipo. Así, los clientes siempre sabrán cuándo están disponibles los compañeros de equipo y con qué rapidez responderán.
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={openNewTeam}
                          className="flex items-center gap-1.5 bg-[#1a1a1a] text-white text-[12.5px] font-semibold rounded-lg px-4 py-2 hover:bg-[#333]"
                        >
                          + Nuevo horario personalizado
                        </button>
                        <a href="#" className="flex items-center gap-1.5 text-[12.5px] text-[#646462] hover:text-[#3b59f6]" onClick={e => e.preventDefault()}>
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M2 2h5v2H4v8h8v-3h2v5H2V2zm7 0h5v5h-2V4.41l-5.3 5.3-1.41-1.41L12.59 3H9V1z"/></svg>
                          Horarios y tiempos personalizados
                        </a>
                      </div>
                    </div>
                    {/* Preview table */}
                    <div className="w-[280px] flex-shrink-0 bg-[#f0fdf4] rounded-xl overflow-hidden border border-[#bbf7d0]">
                      <div className="h-1.5 bg-[#22c55e]" />
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-[#bbf7d0]">
                            {['Name','Time zone','Scheduled hours'].map(h => (
                              <th key={h} className="text-left px-3 py-2 text-[#15803d] font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['EMEA','London','Weekdays 9am – 5pm'],
                            ['APAC - VIP','Sydney','Every day 12am – 11:59pm'],
                            ['US - Late Shift','New York','Weekdays 12pm – 9pm'],
                          ].map(([name, tz, hours]) => (
                            <tr key={name} className="border-b border-[#dcfce7] last:border-0">
                              <td className="px-3 py-2 font-semibold text-[#1a1a1a]">{name}</td>
                              <td className="px-3 py-2 text-[#646462]">{tz}</td>
                              <td className="px-3 py-2 text-[#646462]">{hours}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Team schedule list or empty state */}
                {teamSchedules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-14 h-14 rounded-full bg-[#f1f1ee] flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-7 h-7 text-[#a4a4a2]" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3" strokeLinecap="round"/></svg>
                    </div>
                    <p className="text-[14px] font-semibold text-[#1a1a1a]">Aún no se han creado horarios de atención personalizados</p>
                    <p className="text-[13px] text-[#646462] text-center max-w-[380px]">Establece horarios personalizados para equipos que operan en diferentes zonas horarias o con horarios variables</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {teamSchedules.map(ts => (
                      <div key={ts.id} className="border border-[#e9eae6] rounded-[12px] p-5 hover:border-[#d1d1ce] transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-[14px] font-bold text-[#1a1a1a]">{ts.teamName}</h3>
                            <p className="text-[12px] text-[#646462] mt-0.5">{ts.timezone} · {scheduleSummary(ts.schedule)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditTeam(ts)} className="text-[12.5px] text-[#646462] border border-[#e9eae6] rounded-lg px-3 py-1.5 hover:bg-[#f8f8f7]">Editar</button>
                            <button onClick={() => removeTeam(ts.id)} className="text-[12.5px] text-[#b91c1c] border border-[#fca5a5] rounded-lg px-3 py-1.5 hover:bg-[#fef2f2]">Eliminar</button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                          {(Object.entries(ts.schedule) as [string, DaySchedule][]).filter(([, d]) => d.enabled).map(([day, d]) => (
                            <div key={day} className="flex items-center gap-3 text-[12.5px]">
                              <span className="w-[90px] capitalize text-[#1a1a1a] font-medium">{day}</span>
                              <span className="text-[#646462]">{d.start} – {d.end}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 pt-2 border-t border-[#f1f1ee] flex items-center gap-2 text-[12px]">
                          <span className="text-[#a4a4a2]">Tiempo de respuesta:</span>
                          <span className="font-medium text-[#1a1a1a]">{RESPONSE_TIME_OPTIONS.find(o => o.value === ts.responseTime)?.label ?? ts.responseTime}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Holiday modal ── */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowHolidayModal(false)}>
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[400px] flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-[16px] font-bold text-[#1a1a1a]">Agregar día festivo o cierre</h2>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[#646462]">Nombre</label>
              <input autoFocus value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)}
                placeholder="Ej: Navidad, Día de la empresa…"
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#f97316]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[#646462]">Fecha</label>
              <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#f97316]" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowHolidayModal(false)} className="border border-[#e9eae6] rounded-lg px-4 py-2 text-[13px] font-medium text-[#646462] hover:bg-[#f8f8f7]">Cancelar</button>
              <button onClick={addHoliday} disabled={!newHolidayName.trim() || !newHolidayDate}
                className="bg-[#1a1a1a] text-white rounded-lg px-4 py-2 text-[13px] font-medium hover:bg-[#333] disabled:opacity-40">Añadir</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Team schedule modal ── */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowTeamModal(false)}>
          <div className="bg-white rounded-[16px] shadow-xl w-[540px] flex flex-col max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 border-b border-[#e9eae6]">
              <h2 className="text-[16px] font-bold text-[#1a1a1a]">{editingTeam ? 'Editar horario de equipo' : 'Nuevo horario de equipo'}</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[12px] font-medium text-[#646462]">Nombre del equipo *</label>
                  <input autoFocus value={teamFormName} onChange={e => setTeamFormName(e.target.value)}
                    placeholder="Ej: Soporte EMEA, Ventas…"
                    className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#3b59f6]" />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[12px] font-medium text-[#646462]">Zona horaria</label>
                  <select value={teamFormTz} onChange={e => setTeamFormTz(e.target.value)}
                    className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:border-[#3b59f6]">
                    {TIMEZONES_SHORT.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-medium text-[#646462]">Horario semanal</label>
                <WeekScheduleEditor schedule={teamFormSchedule} onChange={setTeamFormSchedule} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-medium text-[#646462]">Tiempo de respuesta habitual</label>
                <select value={teamFormResponse} onChange={e => setTeamFormResponse(e.target.value)}
                  className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:border-[#3b59f6]">
                  {RESPONSE_TIME_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#e9eae6] flex justify-end gap-2">
              <button onClick={() => setShowTeamModal(false)} className="border border-[#e9eae6] rounded-lg px-4 py-2 text-[13px] font-medium text-[#646462] hover:bg-[#f8f8f7]">Cancelar</button>
              <button onClick={saveTeam} disabled={!teamFormName.trim()}
                className="bg-[#1a1a1a] text-white rounded-lg px-4 py-2 text-[13px] font-semibold hover:bg-[#333] disabled:opacity-40">
                {editingTeam ? 'Guardar cambios' : 'Crear horario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MarcasView (1-97215) ──────────────────────────────────────────────────────

interface BrandItem {
  id: string; name: string; color: string; helpCenterUrl: string;
  finEnabled: boolean; isDefault: boolean;
  brandId: string; finIdentity: string; helpCenter: string;
  defaultAddress: string; finEmail: string;
}

function generateBrandId() {
  return 'brand_' + Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

export function MarcasView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: ws } = useApi(() => workspacesApi.currentContext(), [], null);
  const wsName = (ws as any)?.name ?? 'Mi empresa';

  const [brands, setBrands] = useState<BrandItem[]>([
    {
      id: 'default', name: wsName, color: '#3b59f6', helpCenterUrl: 'soporte.miempresa.com',
      finEnabled: true, isDefault: true,
      brandId: 'brand_4a7f2e9b1c3d', finIdentity: 'Fin', helpCenter: 'Centro de ayuda principal',
      defaultAddress: 'Dirección de la empresa', finEmail: 'fin@miempresa.com',
    },
  ]);
  const [drawerBrand, setDrawerBrand] = useState<BrandItem | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandColor, setNewBrandColor] = useState('#3b59f6');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Sync default brand name with workspace
  useEffect(() => {
    if (!ws) return;
    const name = (ws as any)?.name;
    if (name) setBrands(prev => prev.map(b => b.isDefault ? { ...b, name } : b));
  }, [ws]);

  // Load persisted brands
  useEffect(() => {
    if (!ws) return;
    const s = (ws as any)?.settings ?? {};
    if (Array.isArray(s.brands) && s.brands.length > 0) setBrands(s.brands);
  }, [ws]);

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  async function saveBrand(brand: BrandItem) {
    setSaving(true);
    try {
      const wsId = (ws as any)?.id ?? '';
      const allBrands = brands.map(b => b.id === brand.id ? brand : b);
      await workspacesApi.updateSettings(wsId, { brands: allBrands });
      setBrands(allBrands);
      setDrawerBrand(null);
      showToast('Marca guardada correctamente');
    } catch { showToast('Error al guardar', false); }
    finally { setSaving(false); }
  }

  async function addBrand() {
    if (!newBrandName.trim()) return;
    const nb: BrandItem = {
      id: Date.now().toString(), name: newBrandName.trim(), color: newBrandColor,
      helpCenterUrl: '', finEnabled: false, isDefault: false,
      brandId: generateBrandId(), finIdentity: 'Fin', helpCenter: '', defaultAddress: '', finEmail: '',
    };
    const updated = [...brands, nb];
    setSaving(true);
    try {
      const wsId = (ws as any)?.id ?? '';
      await workspacesApi.updateSettings(wsId, { brands: updated });
      setBrands(updated);
      setShowNewModal(false); setNewBrandName(''); setNewBrandColor('#3b59f6');
      showToast('Marca creada');
    } catch { showToast('Error al crear', false); }
    finally { setSaving(false); }
  }

  async function deleteBrand(id: string) {
    const updated = brands.filter(b => b.id !== id);
    const wsId = (ws as any)?.id ?? '';
    await workspacesApi.updateSettings(wsId, { brands: updated }).catch(() => {});
    setBrands(updated);
    showToast('Marca eliminada');
  }

  function copyBrandId(brandId: string) {
    navigator.clipboard.writeText(brandId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h1 className="text-[20px] font-bold text-[#1a1a1a]">Marcas</h1>
              <p className="text-[13px] text-[#646462] mt-0.5">Gestiona las marcas de tu organización y su configuración individual.</p>
            </div>
            <div className="flex items-center gap-3">
              {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
              <button onClick={() => setShowNewModal(true)} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nueva marca</button>
            </div>
          </div>

          {/* ── Brand list ── */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-3">
            {brands.map(brand => (
              <div
                key={brand.id}
                className="border border-[#e9eae6] rounded-[12px] p-5 cursor-pointer hover:border-[#c8c9c4] transition-colors group"
                onClick={() => setDrawerBrand({ ...brand })}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Name + badge */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[15px] font-bold text-[#1a1a1a]">{brand.name}</span>
                      {brand.isDefault && (
                        <span className="bg-[#f3f3f1] text-[#646462] text-[11px] px-2 py-0.5 rounded-full font-medium">Predeterminado</span>
                      )}
                    </div>
                    {/* Sub-items */}
                    <div className="flex flex-col gap-1.5">
                      {brand.helpCenter && (
                        <div className="flex items-center gap-1.5 text-[13px] text-[#646462]">
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9a9a96] flex-shrink-0">
                            <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zM1.75 12a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H1.75z"/>
                          </svg>
                          <span>{brand.helpCenter}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[13px] text-[#646462]">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9a9a96] flex-shrink-0">
                          <path d="M8 0a8 8 0 110 16A8 8 0 018 0zM1.5 8a6.5 6.5 0 1013 0 6.5 6.5 0 00-13 0zm7-3.25v2.5l1.75 1.75-.53.53-2-2a.75.75 0 01-.22-.53v-2.25h1z"/>
                        </svg>
                        <span>{brand.finIdentity || 'Fin'}</span>
                      </div>
                    </div>
                  </div>
                  {/* Delete — only for non-default, visible on hover */}
                  {!brand.isDefault && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteBrand(brand.id); }}
                      className="opacity-0 group-hover:opacity-100 text-[12px] text-[#b91c1c] hover:underline transition-opacity ml-4 flex-shrink-0"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right-side brand edit drawer ─────────────────────────────────────── */}
      {drawerBrand && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setDrawerBrand(null)}>
          <div className="flex-1" />
          <div
            className="w-[580px] bg-[#f3f3f1] h-full shadow-2xl flex flex-col border-l border-[#e9eae6]"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#e9eae6] flex-shrink-0">
              <h2 className="text-[15px] font-bold text-[#1a1a1a]">Editar marca</h2>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 text-[13px] text-[#646462] border border-[#e9eae6] rounded-lg px-3 py-1.5 bg-white hover:bg-[#f8f8f7]">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm8-6.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.92 6.085h.001a.75.75 0 11-1.342-.67c.169-.339.436-.701.849-.977C6.845 4.16 7.369 4 8 4a2.756 2.756 0 012.515 1.339c.357.548.485 1.093.435 1.585-.04.427-.188.717-.354.934a2.18 2.18 0 01-.346.335c-.113.087-.226.167-.31.232l-.05.036c-.083.059-.144.103-.188.149-.026.027-.03.036-.03.043v.25a.75.75 0 01-1.5 0v-.25c0-.388.168-.712.379-.938.163-.174.365-.329.481-.414l.049-.036c.084-.059.144-.103.187-.148.028-.03.043-.052.048-.071.001-.003.001-.004.001-.004a1.275 1.275 0 01-.218-.386 1.21 1.21 0 01-.054-.329V6.75l-.025.01A1.25 1.25 0 008 5.5c-.316 0-.473.06-.567.124a1.023 1.023 0 00-.312.347l-.201.114zM8 11a1 1 0 110 2 1 1 0 010-2z"/></svg>
                  Aprender
                </button>
                <button onClick={() => setDrawerBrand(null)} className="text-[13px] text-[#646462] px-3 py-1.5 rounded-lg bg-white hover:bg-[#f8f8f7] border border-[#e9eae6]">Cancelar</button>
                <button
                  onClick={() => saveBrand(drawerBrand)}
                  disabled={saving}
                  className="bg-[#1a1a1a] text-white rounded-lg px-4 py-1.5 text-[13px] font-semibold hover:bg-[#333] disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>

            {/* Drawer body — sections as 2-col cards */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-3">

              {/* Nombre de la marca */}
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex gap-6">
                <div className="w-[200px] flex-shrink-0">
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Nombre de la marca</h3>
                  <p className="text-[12px] text-[#646462] leading-[1.5]">Elige un nombre para esta marca. Los clientes pueden ver los nombres de las marcas.</p>
                </div>
                <div className="flex-1">
                  <input
                    className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                    placeholder={drawerBrand.name}
                    value={drawerBrand.name}
                    onChange={e => setDrawerBrand(prev => prev ? { ...prev, name: e.target.value } : prev)}
                  />
                </div>
              </div>

              {/* ID de marca */}
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex gap-6">
                <div className="w-[200px] flex-shrink-0">
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">ID de marca</h3>
                  <p className="text-[12px] text-[#646462] leading-[1.5]">Un identificador único para esta marca, utilizado en las APIs y en la asistencia a clientes.</p>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    readOnly
                    value={drawerBrand.brandId.replace('brand_', '')}
                    className="flex-1 border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] font-mono text-[#646462] bg-[#f8f8f7] focus:outline-none"
                  />
                  <button
                    onClick={() => copyBrandId(drawerBrand.brandId)}
                    className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4] transition-colors flex-shrink-0"
                  >
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              {/* Fin AI Agent */}
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex gap-6">
                <div className="w-[200px] flex-shrink-0">
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Fin AI Agent</h3>
                  <p className="text-[12px] text-[#646462] leading-[1.5]">Tu identidad de IA de Fin y ajustes de audiencia para esta marca</p>
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <p className="text-[11px] text-[#646462]">Identidad de Fin en Messenger específica para esta marca</p>
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                      placeholder="Fin"
                      value={drawerBrand.finIdentity}
                      onChange={e => setDrawerBrand(prev => prev ? { ...prev, finIdentity: e.target.value } : prev)}
                    />
                    <button className="border border-[#e9eae6] rounded-[8px] p-2 hover:bg-[#f5f5f4] flex-shrink-0">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zM1.5 8a6.5 6.5 0 1013 0 6.5 6.5 0 00-13 0zm4.75-1.25a.75.75 0 000 1.5h.5v2.5h-.5a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5H7.5v-3.25a.75.75 0 00-.75-.75h-1zM8 3.5a1 1 0 110 2 1 1 0 010-2z"/></svg>
                    </button>
                    <button className="border border-[#e9eae6] rounded-[8px] p-2 hover:bg-[#f5f5f4] flex-shrink-0">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81 3.558 11H3v.56l-1 3.5 3.5-1v-.56h.56l6.129-6.25z"/></svg>
                    </button>
                  </div>
                  <p className="text-[12px] text-[#646462] mt-1">Agregar su marca a una audiencia de Fin.</p>
                  <a href="#" className="flex items-center gap-1 text-[13px] text-[#1a1a1a] font-medium hover:underline w-fit" onClick={e => e.preventDefault()}>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81 3.558 11H3v.56l-1 3.5 3.5-1v-.56h.56l6.129-6.25z"/></svg>
                    Editar audiencias
                  </a>
                </div>
              </div>

              {/* Centro de ayuda */}
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex gap-6">
                <div className="w-[200px] flex-shrink-0">
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Centro de ayuda</h3>
                  <p className="text-[12px] text-[#646462] leading-[1.5]">Asegúrate de que tus usuarios vean los artículos correctos cuando se pongan en contacto con esta marca a través de Messenger vinculándolo a un centro de ayuda.</p>
                </div>
                <div className="flex-1">
                  <select
                    className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a] bg-white"
                    value={drawerBrand.helpCenter}
                    onChange={e => setDrawerBrand(prev => prev ? { ...prev, helpCenter: e.target.value, helpCenterUrl: e.target.value } : prev)}
                  >
                    <option value="">Ninguno</option>
                    <option value="Centro de ayuda principal">Centro de ayuda principal</option>
                    <option value="Help Center Desarrolladores">Help Center Desarrolladores</option>
                    <option value="Soporte Enterprise">Soporte Enterprise</option>
                  </select>
                </div>
              </div>

              {/* Dirección predeterminada */}
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex gap-6">
                <div className="w-[200px] flex-shrink-0">
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Dirección predeterminada</h3>
                  <p className="text-[12px] text-[#646462] leading-[1.5]">Las notificaciones, los mensajes de flujo de trabajo y otros correos electrónicos automáticos de esta marca utilizarán esta dirección.</p>
                </div>
                <div className="flex-1">
                  <select
                    className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a] bg-white"
                    value={drawerBrand.defaultAddress}
                    onChange={e => setDrawerBrand(prev => prev ? { ...prev, defaultAddress: e.target.value } : prev)}
                  >
                    <option value="">Ninguna</option>
                    <option value="Dirección de la empresa">Dirección de la empresa</option>
                    <option value="Oficina central">Oficina central</option>
                    <option value="Delegación Madrid">Delegación Madrid</option>
                  </select>
                </div>
              </div>

              {/* Dirección de correo electrónico de Fin */}
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex gap-6">
                <div className="w-[200px] flex-shrink-0">
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Dirección de correo electrónico de Fin</h3>
                  <p className="text-[12px] text-[#646462] leading-[1.5]">Los correos de Fin para esta marca se enviarán desde esta dirección.</p>
                </div>
                <div className="flex-1">
                  <select
                    className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a] bg-white"
                    value={drawerBrand.finEmail}
                    onChange={e => setDrawerBrand(prev => prev ? { ...prev, finEmail: e.target.value } : prev)}
                  >
                    <option value="">Ninguno</option>
                    <option value="fin@miempresa.com">fin@miempresa.com</option>
                    <option value="soporte@miempresa.com">soporte@miempresa.com</option>
                    <option value="hola@miempresa.com">hola@miempresa.com</option>
                  </select>
                </div>
              </div>

              {/* Estilos de Messenger */}
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex gap-6">
                <div className="w-[200px] flex-shrink-0">
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Estilos de Messenger</h3>
                  <p className="text-[12px] text-[#646462] leading-[1.5]">Personaliza la apariencia del Messenger para esta marca.</p>
                </div>
                <div className="flex-1 flex items-start pt-1">
                  <button className="flex items-center gap-2 border border-[#e9eae6] rounded-[8px] px-4 py-2 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4] transition-colors">
                    Personalizar Messenger
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9a9a96]"><path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z"/></svg>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* New brand modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[420px] flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-[16px] font-bold text-[#1a1a1a]">Nueva marca</h2>
            <div>
              <label className="block text-[12px] font-medium text-[#646462] mb-1">Nombre de la marca *</label>
              <input autoFocus className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]" placeholder="Ej: Clain Pro, Clain Developers…" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#646462] mb-1">Color de la marca</label>
              <div className="flex items-center gap-3">
                <input type="color" value={newBrandColor} onChange={e => setNewBrandColor(e.target.value)} className="w-9 h-9 rounded border border-[#e9eae6] cursor-pointer" />
                <span className="text-[13px] font-mono text-[#646462]">{newBrandColor}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewModal(false)} className="border border-[#e9eae6] rounded-lg px-4 py-2 text-[13px] font-medium text-[#646462] hover:bg-[#f8f8f7]">Cancelar</button>
              <button onClick={addBrand} disabled={!newBrandName.trim() || saving} className="bg-[#1a1a1a] text-white rounded-lg px-4 py-2 text-[13px] font-semibold hover:bg-[#333] disabled:opacity-50">{saving ? 'Creando…' : 'Crear marca'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WorkspaceGeneralView ────────────────────────────────────────────────────
function SettingsToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-[#f97316]' : 'bg-[#d1d5db]'}`}
    >
      <span
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
        style={{ left: checked ? '20px' : '4px', transition: 'left 0.15s ease' }}
      />
    </button>
  );
}

function SettingsSelect({
  value, onChange, options, className, placeholder, compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find(o => o.value === value);
  const h = compact ? 'h-7 px-2 text-[12px]' : 'h-9 px-3 text-[13px]';
  return (
    <div className={`relative w-full ${className ?? ''}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`w-full ${h} flex items-center justify-between gap-2 border rounded-lg bg-white hover:border-[#1a1a1a] transition-colors focus:outline-none ${open ? 'border-[#1a1a1a]' : 'border-[#e9eae6]'}`}
      >
        <span className={`truncate flex-1 text-left ${selected ? 'text-[#1a1a1a]' : 'text-[#a4a4a2]'}`}>
          {selected?.label ?? placeholder ?? '—'}
        </span>
        <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
      </button>
      {open && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-[#e9eae6] rounded-[10px] shadow-[0_8px_24px_rgba(20,20,20,0.12)] py-1 max-h-[240px] overflow-y-auto"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left hover:bg-[#f8f8f7] ${value === opt.value ? 'font-semibold bg-[#f8f8f7]' : ''} text-[#1a1a1a]`}
            >
              <span className="flex-1 truncate">{opt.label}</span>
              {value === opt.value && (
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 flex-shrink-0 fill-[#3b59f6]">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceGeneralView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: ws } = useApi(() => workspacesApi.currentContext(), [], null);
  const [name, setName]         = useState('');
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [companiesEnabled, setCompaniesEnabled]       = useState(true);
  const [lockCompanyAttrs, setLockCompanyAttrs]       = useState(false);
  const [testWorkspace, setTestWorkspace]             = useState(false);
  const [showAttribution, setShowAttribution]         = useState(true);
  const [disableTeamMentions, setDisableTeamMentions] = useState(false);
  const [deleteConfirm, setDeleteConfirm]             = useState('');
  const [appId, setAppId]                             = useState('');
  const [copied, setCopied]                           = useState(false);

  useEffect(() => {
    if (!ws) return;
    const w = ws as any;
    setName(w.name ?? '');
    setAppId(w.id ?? w.slug ?? '');
    const s = w.settings ?? {};
    if (s.timezone) setTimezone(s.timezone);
    if (s.companiesEnabled !== undefined) setCompaniesEnabled(Boolean(s.companiesEnabled));
    if (s.lockCompanyAttrs !== undefined) setLockCompanyAttrs(Boolean(s.lockCompanyAttrs));
    if (s.showAttribution !== undefined) setShowAttribution(Boolean(s.showAttribution));
    if (s.disableTeamMentions !== undefined) setDisableTeamMentions(Boolean(s.disableTeamMentions));
  }, [ws]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave() {
    if (!name.trim()) { showToast('El nombre no puede estar vacío.', false); return; }
    setSaving(true);
    try {
      const wsId = (ws as any)?.id ?? '';
      await workspacesApi.update(wsId, { name: name.trim() });
      await workspacesApi.updateSettings(wsId, {
        timezone,
        companiesEnabled,
        lockCompanyAttrs,
        showAttribution,
        disableTeamMentions,
      });
      showToast('Ajustes guardados correctamente.');
    } catch (e: any) {
      showToast(e?.message ?? 'Error al guardar.', false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleSave(key: string, value: boolean) {
    try {
      const wsId = (ws as any)?.id ?? '';
      await workspacesApi.updateSettings(wsId, { [key]: value });
    } catch { /* non-fatal */ }
  }

  function handleCopyAppId() {
    navigator.clipboard.writeText(appId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const TIMEZONES = [
    'Pacific/Honolulu','America/Los_Angeles','America/Denver','America/Chicago',
    'America/New_York','America/Sao_Paulo','UTC','Europe/London','Europe/Madrid',
    'Europe/Paris','Europe/Berlin','Europe/Athens','Europe/Moscow',
    'Asia/Dubai','Asia/Kolkata','Asia/Bangkok','Asia/Shanghai','Asia/Tokyo',
    'Australia/Sydney',
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Sticky header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[18px] font-bold text-[#1a1a1a]">General</h1>
            <div className="flex items-center gap-3">
              {toast && (
                <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>
                  {toast.ok ? '✓' : '✕'} {toast.msg}
                </span>
              )}
              <button
                onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="py-8 px-8 flex flex-col gap-0 w-full">

              {/* ── Nombre y zona horaria ── */}
              <div className="border border-[#e9eae6] rounded-xl overflow-hidden mb-4">
                <div className="flex items-start gap-6 p-5">
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Nombre y zona horaria del espacio de trabajo</p>
                    <p className="text-[12.5px] text-[#646462]">La zona horaria afecta a las funciones que dependen de la hora.</p>
                  </div>
                  <div className="w-[340px] flex flex-col gap-3">
                    <div>
                      <label className="block text-[12px] font-medium text-[#646462] mb-1">Nombre</label>
                      <input
                        className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] text-[#1a1a1a] focus:outline-none focus:border-[#3b59f6] transition-colors"
                        value={name} onChange={e => setName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#646462] mb-1">ID de aplicación</label>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] text-[#646462] bg-[#f8f8f7] focus:outline-none cursor-default"
                          value={appId}
                        />
                        <button
                          onClick={handleCopyAppId}
                          className="px-3 py-2 text-[12px] font-medium text-[#3b59f6] hover:text-[#2a45d4] border border-[#e9eae6] rounded-lg hover:bg-[#f0f2ff] transition-colors whitespace-nowrap"
                        >
                          {copied ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#646462] mb-1">Zona horaria</label>
                      <SettingsSelect
                        value={timezone}
                        onChange={setTimezone}
                        options={TIMEZONES.map(tz => ({ value: tz, label: tz }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Empresas ── */}
              <div className="border border-[#e9eae6] rounded-xl overflow-hidden mb-4">
                <div className="flex items-start gap-6 p-5">
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Empresas</p>
                    <p className="text-[12.5px] text-[#646462] mb-2">Trata a todos los usuarios como individuos, pero esta función agrupa a todos los usuarios de una misma empresa.</p>
                    <a href="#" className="text-[12px] text-[#3b59f6] hover:underline flex items-center gap-1" onClick={e => e.preventDefault()}>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M2 2h5v2H4v8h8v-3h2v5H2V2zm7 0h5v5h-2V4.41l-5.3 5.3-1.41-1.41L12.59 3H9V1z"/></svg>
                      ¿Cómo funcionan las funciones de empresa?
                    </a>
                  </div>
                  <div className="flex flex-col gap-4 min-w-[260px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] text-[#1a1a1a]">Habilitar funciones relacionadas con la empresa</span>
                      <SettingsToggle checked={companiesEnabled} onChange={v => { setCompaniesEnabled(v); handleToggleSave('companiesEnabled', v); }} />
                    </div>
                    <div className={`flex items-center justify-between gap-3 transition-opacity ${companiesEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                      <span className="text-[13px] text-[#1a1a1a]">Impedir las actualizaciones de atributos de la empresa en Messenger</span>
                      <SettingsToggle checked={lockCompanyAttrs} onChange={v => { setLockCompanyAttrs(v); handleToggleSave('lockCompanyAttrs', v); }} />
                    </div>
                    {companiesEnabled && lockCompanyAttrs && (
                      <p className="text-[11.5px] text-[#646462]">Habilitar esto evitará la manipulación de los datos. Los flujos de trabajo aún se pueden usar para recopilar datos de atributos de los clientes.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Espacio de trabajo de prueba ── */}
              <div className="border border-[#e9eae6] rounded-xl overflow-hidden mb-4">
                <div className="flex items-start gap-6 p-5">
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Espacio de trabajo de prueba</p>
                    <p className="text-[12.5px] text-[#646462] mb-2">Experimenta con funciones e integraciones en un entorno sin riesgos. Prueba y configura los cambios sin afectar tus ajustes.</p>
                    <a href="#" className="text-[12px] text-[#3b59f6] hover:underline flex items-center gap-1" onClick={e => e.preventDefault()}>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M2 2h5v2H4v8h8v-3h2v5H2V2zm7 0h5v5h-2V4.41l-5.3 5.3-1.41-1.41L12.59 3H9V1z"/></svg>
                      Cómo configurar un espacio de trabajo de prueba
                    </a>
                  </div>
                  <div className="flex items-center justify-between gap-3 min-w-[260px]">
                    <span className="text-[13px] text-[#1a1a1a]">Habilitar un espacio de trabajo de prueba</span>
                    <SettingsToggle checked={testWorkspace} onChange={v => setTestWorkspace(v)} />
                  </div>
                </div>
              </div>

              {/* ── Eliminar espacio de trabajo ── */}
              <div className="border border-[#e9eae6] rounded-xl overflow-hidden mb-4">
                <div className="flex items-start gap-6 p-5">
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Eliminar espacio de trabajo</p>
                    <p className="text-[12.5px] text-[#646462]">Para eliminar este espacio de trabajo, ingresa tu nombre completo y confirma la eliminación. El espacio de trabajo se eliminará en un plazo de 14 días tras la confirmación.</p>
                  </div>
                  <div className="flex items-center gap-2 min-w-[260px]">
                    <input
                      className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#b91c1c] transition-colors"
                      placeholder="Ingresa tu nombre completo"
                      value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                    />
                    <button
                      disabled={!deleteConfirm.trim()}
                      onClick={() => { if (window.confirm('¿Confirmas la eliminación del espacio de trabajo? Esta acción es irreversible.')) { showToast('Solicitud enviada. Se procesará en 14 días.', false); setDeleteConfirm(''); } }}
                      className="px-3 py-2 text-[13px] font-medium border border-[#e9eae6] rounded-lg text-[#646462] hover:border-[#fca5a5] hover:text-[#b91c1c] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      Confirmar eliminación
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Mensaje de atribución ── */}
              <div className="border border-[#e9eae6] rounded-xl overflow-hidden mb-4">
                <div className="flex items-start gap-6 p-5">
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Mensaje de atribución de Clain</p>
                    <p className="text-[12.5px] text-[#646462]">Al habilitar esto, se añade un mensaje de atribución sutil en la parte inferior de tu Messenger y correos electrónicos.</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 min-w-[260px]">
                    <span className="text-[13px] text-[#1a1a1a]">Muestra el mensaje de atribución de Clain</span>
                    <SettingsToggle checked={showAttribution} onChange={v => { setShowAttribution(v); handleToggleSave('showAttribution', v); }} />
                  </div>
                </div>
              </div>

              {/* ── Menciones del equipo ── */}
              <div className="border border-[#e9eae6] rounded-xl overflow-hidden mb-4">
                <div className="flex items-start gap-6 p-5">
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Menciones del equipo</p>
                    <p className="text-[12.5px] text-[#646462]">Controle si los compañeros de equipo pueden @mencionar equipos en notas y conversaciones internas sobre folios de atención.</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 min-w-[260px]">
                    <span className="text-[13px] text-[#1a1a1a]">Deshabilitar menciones del equipo en las notas</span>
                    <SettingsToggle checked={disableTeamMentions} onChange={v => { setDisableTeamMentions(v); handleToggleSave('disableTeamMentions', v); }} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared permission data ───────────────────────────────────────────────────
const BUILTIN_ROLE_PERMS: Record<string, string[]> = {
  owner:           ['conversations:read','conversations:write','conversations:assign','conversations:close','conversations:delete','contacts:read','contacts:write','contacts:delete','contacts:export','companies:read','companies:write','reports:read','reports:export','settings:read','settings:write','teammates:read','teammates:invite','teammates:manage','channels:read','channels:write','ai:read','ai:configure','ai:train'],
  workspace_admin: ['conversations:read','conversations:write','conversations:assign','conversations:close','contacts:read','contacts:write','contacts:delete','contacts:export','companies:read','companies:write','reports:read','reports:export','settings:read','settings:write','teammates:read','teammates:invite','teammates:manage','channels:read','channels:write','ai:read','ai:configure'],
  supervisor:      ['conversations:read','conversations:write','conversations:assign','conversations:close','contacts:read','contacts:write','companies:read','reports:read','reports:export','settings:read','teammates:read','channels:read','ai:read'],
  agent:           ['conversations:read','conversations:write','conversations:assign','conversations:close','contacts:read','contacts:write','companies:read','reports:read','channels:read','ai:read'],
  viewer:          ['conversations:read','contacts:read','companies:read','reports:read','channels:read'],
};

const ALL_PERMS_META = [
  { group: 'Conversaciones', color: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]', perms: [
    { id: 'conversations:read',   label: 'Ver' },
    { id: 'conversations:write',  label: 'Responder' },
    { id: 'conversations:assign', label: 'Asignar' },
    { id: 'conversations:close',  label: 'Cerrar' },
    { id: 'conversations:delete', label: 'Eliminar' },
  ]},
  { group: 'Contactos', color: 'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]', perms: [
    { id: 'contacts:read',   label: 'Ver' },
    { id: 'contacts:write',  label: 'Editar' },
    { id: 'contacts:delete', label: 'Eliminar' },
    { id: 'contacts:export', label: 'Exportar' },
  ]},
  { group: 'Empresas', color: 'bg-[#fff7ed] text-[#b45309] border-[#fed7aa]', perms: [
    { id: 'companies:read',  label: 'Ver' },
    { id: 'companies:write', label: 'Editar' },
  ]},
  { group: 'Informes', color: 'bg-[#f5f3ff] text-[#6d28d9] border-[#ddd6fe]', perms: [
    { id: 'reports:read',   label: 'Ver' },
    { id: 'reports:export', label: 'Exportar' },
  ]},
  { group: 'Ajustes', color: 'bg-[#fef9c3] text-[#854d0e] border-[#fef08a]', perms: [
    { id: 'settings:read',  label: 'Ver' },
    { id: 'settings:write', label: 'Modificar' },
  ]},
  { group: 'Compañeros', color: 'bg-[#fce7f3] text-[#9d174d] border-[#fbcfe8]', perms: [
    { id: 'teammates:read',   label: 'Ver' },
    { id: 'teammates:invite', label: 'Invitar' },
    { id: 'teammates:manage', label: 'Gestionar' },
  ]},
  { group: 'Canales', color: 'bg-[#f0f9ff] text-[#0369a1] border-[#bae6fd]', perms: [
    { id: 'channels:read',  label: 'Ver' },
    { id: 'channels:write', label: 'Configurar' },
  ]},
  { group: 'IA', color: 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]', perms: [
    { id: 'ai:read',      label: 'Ver' },
    { id: 'ai:configure', label: 'Configurar' },
    { id: 'ai:train',     label: 'Entrenar' },
  ]},
];

// ─── TeammateProfileView ──────────────────────────────────────────────────────
function TeammateProfileView({
  member, roles, onBack, onRoleChange, onDeactivate,
}: {
  member: any;
  roles: any[];
  onBack: () => void;
  onRoleChange: (memberId: string, roleId: string) => void;
  onDeactivate: (memberId: string, name: string) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<string>(member.role_id || 'agent');
  const [extraPerms, setExtraPerms]     = useState<string[]>([]);
  const [extraModal, setExtraModal]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);

  const rolePerms = BUILTIN_ROLE_PERMS[selectedRole] ?? roles.find((r: any) => r.id === selectedRole)?.permissions ?? [];
  const initials  = (member.name || member.email || '?')[0].toUpperCase();

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  async function handleSaveRole() {
    setSaving(true);
    try {
      await iamApi.updateMember(member.id, { role_id: selectedRole });
      onRoleChange(member.id, selectedRole);
      showToast('Función actualizada.');
    } catch { showToast('Error al guardar.', false); }
    finally { setSaving(false); }
  }

  function toggleExtra(p: string) {
    setExtraPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  // Demo conversations (prototype)
  const DEMO_CONVS = [
    { id: 1, subject: 'Problema con el pago', channel: 'Email', status: 'Abierto',   ts: 'Hace 2 h',   preview: 'Hola, tengo un problema con mi último cargo...' },
    { id: 2, subject: 'Consulta de envío',    channel: 'Chat',  status: 'Resuelto',  ts: 'Ayer',        preview: '¿Cuándo llegará mi pedido #A-4921?' },
    { id: 3, subject: 'Solicitud de reembolso', channel: 'Email', status: 'Pendiente', ts: 'Hace 3 días', preview: 'Quisiera solicitar la devolución de...' },
    { id: 4, subject: 'Bug en la app móvil',  channel: 'Chat',  status: 'Abierto',   ts: 'Hace 4 días', preview: 'La app se cierra sola cuando intento abrir...' },
    { id: 5, subject: 'Actualización de plan', channel: 'Email', status: 'Resuelto', ts: 'Hace 1 sem',  preview: 'Me gustaría pasar al plan Enterprise.' },
  ];

  const ROLE_COLOR: Record<string, string> = {
    owner: 'bg-[#ede9fe] text-[#6d28d9]', workspace_admin: 'bg-[#fef9c3] text-[#854d0e]',
    supervisor: 'bg-[#fff7ed] text-[#c2410c]', agent: 'bg-[#f0fdf4] text-[#15803d]', viewer: 'bg-[#f0f9ff] text-[#0369a1]',
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f8f8f7]">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-[#e9eae6] px-6 h-12 flex items-center gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-[#646462] hover:text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6"><path d="M10 3L5 8l5 5" strokeLinecap="round"/></svg>
          Compañeros de equipo
        </button>
        <span className="text-[#d1d5db]">/</span>
        <span className="text-[13px] font-semibold text-[#1a1a1a]">{member.name ?? member.email ?? 'Perfil'}</span>
        {toast && <span className={`ml-auto text-[12.5px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
      </div>

      {/* Body: sidebar + main */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── LEFT SIDEBAR (300px) ── */}
        <div className="w-[300px] flex-shrink-0 border-r border-[#e9eae6] bg-white flex flex-col overflow-y-auto">
          {/* Cover + Avatar */}
          <div className="relative h-24 bg-gradient-to-br from-[#e0e7ff] to-[#c7d2fe] flex-shrink-0">
            <div className="absolute -bottom-8 left-6 w-16 h-16 rounded-full bg-[#3b59f6] border-4 border-white flex items-center justify-center text-[22px] font-bold text-white shadow-md">
              {initials}
            </div>
          </div>
          <div className="mt-10 px-6 pb-6 flex flex-col gap-4">
            {/* Name + role */}
            <div>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] leading-tight">{member.name ?? '—'}</h2>
              <p className="text-[12.5px] text-[#646462] mt-0.5">{member.email ?? ''}</p>
              <span className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COLOR[member.role_id] ?? 'bg-[#f1f1ee] text-[#646462]'}`}>
                {roles.find((r: any) => r.id === member.role_id)?.name ?? member.role_id ?? 'Sin función'}
              </span>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
              <span className="text-[12.5px] text-[#1a1a1a]">Activo</span>
            </div>

            {/* Meta */}
            <div className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex items-center gap-2 text-[#646462]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current flex-shrink-0" strokeWidth="1.4"><path d="M2 4h12v9H2zM2 4l6 5 6-5"/></svg>
                {member.email ?? '—'}
              </div>
              <div className="flex items-center gap-2 text-[#646462]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current flex-shrink-0" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5l2 1.5"/></svg>
                Miembro desde {member.joined_at ? new Date(member.joined_at).toLocaleDateString('es', { month: 'short', year: 'numeric' }) : 'hace 1 hora'}
              </div>
              <div className="flex items-center gap-2 text-[#646462]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current flex-shrink-0" strokeWidth="1.4"><rect x="1.5" y="1.5" width="13" height="13" rx="2"/><path d="M5 8h6M5 5h6M5 11h4"/></svg>
                Plaza: <span className="font-semibold text-[#1a1a1a]">{(member.seat_type ?? 'FULL').toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2 text-[#646462]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current flex-shrink-0" strokeWidth="1.4"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z"/><path d="M8 5v4l2.5 1.5"/></svg>
                2FA: <span className={`font-semibold ${member.mfa_enabled ? 'text-[#16a34a]' : 'text-[#a4a4a2]'}`}>{member.mfa_enabled ? 'Activado' : 'Desactivado'}</span>
              </div>
            </div>

            <div className="border-t border-[#e9eae6] pt-4">
              <p className="text-[11px] font-semibold text-[#a4a4a2] uppercase tracking-wide mb-3">Estadísticas</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Conversaciones', value: DEMO_CONVS.length },
                  { label: 'Resueltas', value: DEMO_CONVS.filter(c => c.status === 'Resuelto').length },
                  { label: 'Tiempo medio', value: '14m' },
                  { label: 'CSAT', value: '4.8/5' },
                ].map(s => (
                  <div key={s.label} className="bg-[#f8f8f7] rounded-lg p-2.5 text-center">
                    <p className="text-[18px] font-bold text-[#1a1a1a]">{s.value}</p>
                    <p className="text-[10.5px] text-[#a4a4a2]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[#e9eae6] pt-4 flex flex-col gap-2">
              <p className="text-[11px] font-semibold text-[#a4a4a2] uppercase tracking-wide mb-1">Acciones</p>
              <button
                onClick={() => onDeactivate(member.id, member.name ?? member.email)}
                className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-[#b91c1c] hover:bg-[#fef2f2] transition-colors border border-[#fca5a5]"
              >
                Desactivar acceso
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT MAIN AREA ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 gap-5">

          {/* ── Función y accesos ── */}
          <div className="bg-white rounded-xl border border-[#e9eae6] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-bold text-[#1a1a1a]">Función y accesos</h3>
                <p className="text-[12px] text-[#646462] mt-0.5">Asigna una función base y añade permisos individuales adicionales.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExtraModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-[#3b59f6] border border-[#bfdbfe] rounded-lg hover:bg-[#eff6ff] transition-colors"
                >
                  <svg viewBox="0 0 12 12" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.7"><path d="M6 2v8M2 6h8" strokeLinecap="round"/></svg>
                  Permisos extra{extraPerms.length > 0 ? ` (${extraPerms.length})` : ''}
                </button>
                <button
                  onClick={handleSaveRole} disabled={saving}
                  className="px-3 py-1.5 bg-[#1a1a1a] text-white text-[12.5px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
            <div className="p-5">
              {/* Role selector cards */}
              <div className="grid grid-cols-5 gap-2 mb-5">
                {(roles.length > 0 ? roles : Object.keys(BUILTIN_ROLE_PERMS).map(id => ({
                  id, name: { owner: 'Owner', workspace_admin: 'Admin', supervisor: 'Supervisor', agent: 'Agente', viewer: 'Viewer' }[id] ?? id,
                }))).map((r: any) => {
                  const isSelected = selectedRole === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRole(r.id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${isSelected ? 'border-[#3b59f6] bg-[#eff6ff]' : 'border-[#e9eae6] hover:border-[#1a1a1a] bg-white'}`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${isSelected ? 'bg-[#3b59f6] text-white' : 'bg-[#f1f1ee] text-[#646462]'}`}>
                        {(r.name ?? r.id)[0].toUpperCase()}
                      </span>
                      <span className={`text-[11.5px] font-semibold leading-tight ${isSelected ? 'text-[#1d4ed8]' : 'text-[#1a1a1a]'}`}>{r.name ?? r.id}</span>
                    </button>
                  );
                })}
              </div>

              {/* Permission pills for selected role */}
              <div className="border border-[#e9eae6] rounded-lg p-4">
                <p className="text-[11px] font-semibold text-[#a4a4a2] uppercase tracking-wide mb-3">Permisos incluidos en esta función</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMS_META.flatMap(g => g.perms.map(p => ({ ...p, groupColor: g.color, group: g.group }))).map(p => {
                    const included = rolePerms.includes(p.id);
                    const isExtra  = extraPerms.includes(p.id);
                    if (!included && !isExtra) return null;
                    return (
                      <span key={p.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${isExtra ? 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]' : p.groupColor}`}>
                        {isExtra && <span className="text-[9px] font-bold">+</span>}
                        {p.group}: {p.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Conversaciones recientes ── */}
          <div className="bg-white rounded-xl border border-[#e9eae6] overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-[#e9eae6]">
              <h3 className="text-[14px] font-bold text-[#1a1a1a]">Conversaciones recientes</h3>
              <p className="text-[12px] text-[#646462] mt-0.5">{DEMO_CONVS.length} conversaciones en los últimos 30 días</p>
            </div>
            <div className="divide-y divide-[#e9eae6]">
              {DEMO_CONVS.map(conv => (
                <div key={conv.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-[#f8f8f7] cursor-pointer group">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white ${conv.channel === 'Email' ? 'bg-[#3b59f6]' : 'bg-[#8b5cf6]'}`}>
                    {conv.channel[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{conv.subject}</p>
                      <span className="text-[11.5px] text-[#a4a4a2] whitespace-nowrap">{conv.ts}</span>
                    </div>
                    <p className="text-[12px] text-[#646462] truncate mt-0.5">{conv.preview}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10.5px] text-[#a4a4a2]">{conv.channel}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-semibold ${
                        conv.status === 'Abierto' ? 'bg-[#f0fdf4] text-[#15803d]' :
                        conv.status === 'Resuelto' ? 'bg-[#f1f1ee] text-[#646462]' :
                        'bg-[#fff7ed] text-[#b45309]'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                        {conv.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Extra permissions modal ── */}
      {extraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-5 pb-4 border-b border-[#e9eae6] flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-[16px] font-bold text-[#1a1a1a]">Permisos extra individuales</h3>
                <p className="text-[12px] text-[#646462] mt-0.5">Añade permisos específicos además de los incluidos en la función asignada.</p>
              </div>
              <button onClick={() => setExtraModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f1ee]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-4">
              {ALL_PERMS_META.map(g => (
                <div key={g.group}>
                  <p className="text-[11px] font-semibold text-[#a4a4a2] uppercase tracking-wide mb-2">{g.group}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.perms.map(p => {
                      const inRole  = rolePerms.includes(p.id);
                      const checked = inRole || extraPerms.includes(p.id);
                      return (
                        <label key={p.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all select-none ${
                          inRole ? 'border-[#e9eae6] bg-[#f8f8f7] text-[#a4a4a2] cursor-not-allowed' :
                          checked ? `border-[#3b59f6] ${g.color} font-semibold` :
                          'border-[#e9eae6] text-[#646462] hover:border-[#1a1a1a]'
                        }`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={inRole}
                            onChange={() => !inRole && toggleExtra(p.id)}
                            className="w-3.5 h-3.5 accent-[#3b59f6]"
                          />
                          <span className="text-[12px]">{p.label}</span>
                          {inRole && <span className="text-[10px] bg-[#f1f1ee] px-1 rounded">del rol</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-[#e9eae6] flex items-center justify-between flex-shrink-0">
              <span className="text-[12.5px] text-[#646462]">{extraPerms.length} permiso{extraPerms.length !== 1 ? 's' : ''} extra seleccionado{extraPerms.length !== 1 ? 's' : ''}</span>
              <div className="flex gap-2">
                <button onClick={() => setExtraModal(false)} className="px-4 py-1.5 text-[13px] font-medium text-[#646462] border border-[#e9eae6] rounded-lg hover:bg-[#f8f8f7]">Cancelar</button>
                <button onClick={() => setExtraModal(false)} className="px-4 py-1.5 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333]">Aplicar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WorkspaceTeammatesView ──────────────────────────────────────────────────
type TeammatesTab = 'teammates' | 'invited' | 'roles' | 'scim' | 'activity';

export function WorkspaceTeammatesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: membersRaw, loading, refetch } = useApi(() => iamApi.members(), [], []);
  const { data: rolesRaw,   refetch: refetchRoles } = useApi(() => iamApi.roles(), [], []);
  const { data: auditRaw,   loading: auditLoading } = useApi(() => auditApi.workspaceAll(), [], []);

  const [tab, setTab]               = useState<TeammatesTab>('teammates');
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeat, setFilterSeat] = useState('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviting, setInviting]     = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
  const [savingRole, setSavingRole] = useState(false);
  const [localRolePerms, setLocalRolePerms] = useState<Record<string, string[]>>({});
  const [actDateFrom, setActDateFrom] = useState('');
  const [actDateTo, setActDateTo]    = useState('');
  const [actMember, setActMember]    = useState('all');
  const [actType, setActType]        = useState('all');
  const [memberMenuId, setMemberMenuId]       = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const members: any[] = Array.isArray(membersRaw) ? membersRaw : [];
  const roles: any[]   = Array.isArray(rolesRaw)   ? rolesRaw   : [];
  const auditEvents: any[] = Array.isArray(auditRaw) ? auditRaw : [];

  // Built-in role definitions shown when no custom roles exist
  const BUILTIN_ROLES = [
    { id: 'owner',           name: 'Owner (Propietario)',    desc: 'Acceso completo a todo el espacio de trabajo, incluyendo facturación.', color: 'bg-[#ede9fe] text-[#6d28d9]', members: members.filter(m => m.role_id === 'owner').length },
    { id: 'workspace_admin', name: 'Workspace Admin',        desc: 'Administrar compañeros, integraciones y configuración del workspace.', color: 'bg-[#fef9c3] text-[#854d0e]', members: members.filter(m => m.role_id === 'workspace_admin').length },
    { id: 'supervisor',      name: 'Supervisor',             desc: 'Ver todos los casos, asignar y gestionar el equipo de soporte.', color: 'bg-[#fff7ed] text-[#c2410c]', members: members.filter(m => m.role_id === 'supervisor').length },
    { id: 'agent',           name: 'Agente',                 desc: 'Gestionar y responder casos asignados. Acceso limitado a ajustes.', color: 'bg-[#f0fdf4] text-[#15803d]', members: members.filter(m => m.role_id === 'agent').length },
    { id: 'viewer',          name: 'Viewer (Solo lectura)',  desc: 'Consultar información sin poder modificar datos.', color: 'bg-[#f0f9ff] text-[#0369a1]', members: members.filter(m => m.role_id === 'viewer').length },
  ];

  const displayRoles = roles.length > 0 ? roles : BUILTIN_ROLES;

  function roleLabel(roleId: string) {
    return displayRoles.find(r => r.id === roleId)?.name ?? roleId ?? '—';
  }
  function roleColor(roleId: string) {
    const map: Record<string, string> = {
      owner: 'bg-[#ede9fe] text-[#6d28d9]',
      workspace_admin: 'bg-[#fef9c3] text-[#854d0e]',
      supervisor: 'bg-[#fff7ed] text-[#c2410c]',
      agent: 'bg-[#f0fdf4] text-[#15803d]',
      viewer: 'bg-[#f0f9ff] text-[#0369a1]',
    };
    return map[roleId] ?? 'bg-[#f1f1ee] text-[#646462]';
  }

  const activeMembers  = members.filter(m => m.status !== 'inactive');
  const pendingMembers = members.filter(m => m.status === 'pending' || m.status === 'invited');

  const filteredMembers = activeMembers.filter(m => {
    const q = search.toLowerCase();
    const matchQ = !q || `${m.name ?? ''} ${m.email ?? ''}`.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || m.status === filterStatus;
    const matchSeat = filterSeat === 'all' || (m.seat_type ?? 'full') === filterSeat;
    return matchQ && matchStatus && matchSeat;
  });

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleInvite() {
    const emails = inviteEmails.split(/[\n,\s]+/).map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) { showToast('Introduce al menos un correo.', false); return; }
    const roleId = inviteRoleId || roles[0]?.id || 'agent';
    setInviting(true);
    try {
      await Promise.all(emails.map(email => iamApi.inviteMember({ email, role_id: roleId })));
      setInviteOpen(false);
      setInviteEmails(''); setInviteRoleId('');
      refetch();
      showToast(emails.length === 1 ? `Invitación enviada a ${emails[0]}.` : `${emails.length} invitaciones enviadas.`);
    } catch (e: any) {
      showToast(e?.message ?? 'Error al enviar la invitación.', false);
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, roleId: string) {
    try {
      await iamApi.updateMember(memberId, { role_id: roleId });
      refetch();
      showToast('Rol actualizado.');
    } catch {
      showToast('Error al cambiar el rol.', false);
    }
  }

  async function handleDeactivate(memberId: string, memberName: string) {
    if (!window.confirm(`¿Desactivar a ${memberName}? Perderá acceso al espacio de trabajo.`)) return;
    try {
      await iamApi.updateMember(memberId, { status: 'inactive' });
      refetch();
      showToast(`${memberName} desactivado.`);
    } catch {
      showToast('Error al desactivar al miembro.', false);
    }
    setMemberMenuId(null);
  }

  async function handleTransferOwnership(memberId: string, memberName: string) {
    if (!window.confirm(`¿Transferir la propiedad a ${memberName}? Perderás los permisos de propietario.`)) return;
    try {
      await iamApi.transferOwnership(memberId);
      refetch();
      showToast(`Propiedad transferida a ${memberName}.`);
    } catch {
      showToast('Error al transferir la propiedad.', false);
    }
    setMemberMenuId(null);
  }

  async function handleResendInvite(email: string, roleId: string) {
    try {
      await iamApi.resendInvite({ email, role_id: roleId || 'agent' });
      showToast(`Invitación reenviada a ${email}.`);
    } catch {
      showToast('Error al reenviar.', false);
    }
  }

  async function handleCreateRole() {
    if (!newRoleName.trim()) return;
    setCreatingRole(true);
    try {
      await iamApi.createRole({ name: newRoleName.trim(), permissions: [] });
      setNewRoleName('');
      refetchRoles();
      showToast('Rol creado correctamente.');
    } catch (e: any) {
      showToast(e?.message ?? 'Error al crear el rol.', false);
    } finally {
      setCreatingRole(false);
    }
  }

  function exportCSV() {
    const rows = [
      ['Nombre', 'Correo', 'Estado', 'Rol', 'Plaza', '2FA'],
      ...filteredMembers.map(m => [m.name ?? '', m.email ?? '', m.status ?? '', roleLabel(m.role_id), m.seat_type ?? 'full', m.mfa_enabled ? 'Sí' : 'No']),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'compañeros.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const TABS: { id: TeammatesTab; label: string }[] = [
    { id: 'teammates', label: 'Compañeros de equipo' },
    { id: 'invited',   label: 'Invitado' },
    { id: 'roles',     label: 'Funciones' },
    { id: 'scim',      label: 'Aprovisionamiento de SCIM' },
    { id: 'activity',  label: 'Registros de actividad' },
  ];

  // ── Profile view ────────────────────────────────────────────────────────────
  const selectedMember = selectedMemberId ? members.find((m: any) => m.id === selectedMemberId) : null;
  if (selectedMember) {
    return (
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
        <TrialBanner />
        <div className="flex flex-1 min-h-0 gap-2">
          <SettingsSidebar view={view} onNavigate={onNavigate} />
          <div className="flex-1 rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden bg-[#f8f8f7]">
            <TeammateProfileView
              member={selectedMember}
              roles={displayRoles}
              onBack={() => setSelectedMemberId(null)}
              onRoleChange={handleRoleChange}
              onDeactivate={handleDeactivate}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-6 pb-0 flex-shrink-0">
            <div>
              <h1 className="text-[18px] font-bold text-[#1a1a1a]">Compañeros de equipo</h1>
            </div>
            <div className="flex items-center gap-2">
              {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
              {tab === 'teammates' && (
                <>
                  <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-[#646462] border border-[#e9eae6] rounded-lg hover:bg-[#f8f8f7] transition-colors">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M8 10.5L4.5 7H7V2h2v5h2.5L8 10.5zM2 13h12v-2h1.5v3.5H.5V11H2v2z"/></svg>
                    Exportar CSV
                  </button>
                  <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white text-[12.5px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
                    + Nuevo compañero de equipo
                  </button>
                </>
              )}
              {tab === 'invited' && (
                <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white text-[12.5px] font-semibold rounded-lg hover:bg-[#333] transition-colors">
                  + Invitar compañero
                </button>
              )}
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-0 px-6 border-b border-[#e9eae6] mt-4 flex-shrink-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}
              >
                {t.label}
                {t.id === 'teammates' && activeMembers.length > 0 && (
                  <span className="ml-1.5 text-[11px] font-semibold bg-[#f1f1ee] text-[#646462] rounded-full px-1.5 py-0.5">{activeMembers.length}</span>
                )}
                {t.id === 'invited' && pendingMembers.length > 0 && (
                  <span className="ml-1.5 text-[11px] font-semibold bg-[#fef3c7] text-[#92400e] rounded-full px-1.5 py-0.5">{pendingMembers.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ══ TAB: Compañeros de equipo ══ */}
            {tab === 'teammates' && (
              <div className="px-6 py-4 flex flex-col gap-4">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[180px]">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#a4a4a2]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l3 3" strokeLinecap="round"/></svg>
                    <input
                      className="w-full pl-8 pr-3 py-1.5 border border-[#e9eae6] rounded-lg text-[12.5px] focus:outline-none focus:border-[#1a1a1a] transition-colors"
                      placeholder="Buscar compañeros de equipo…"
                      value={search} onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="w-[200px]">
                    <SettingsSelect
                      value={filterStatus}
                      onChange={setFilterStatus}
                      options={[
                        { value: 'all', label: 'El estado es Cualquiera' },
                        { value: 'active', label: 'Activo' },
                        { value: 'away', label: 'Ausente' },
                      ]}
                      compact
                    />
                  </div>
                  <div className="w-[200px]">
                    <SettingsSelect
                      value={filterSeat}
                      onChange={setFilterSeat}
                      options={[
                        { value: 'all', label: 'La plaza es Cualquiera' },
                        { value: 'full', label: 'FULL' },
                        { value: 'limited', label: 'LIMITED' },
                      ]}
                      compact
                    />
                  </div>
                  <span className="text-[12.5px] text-[#646462] ml-1">{filteredMembers.length} compañero{filteredMembers.length !== 1 ? 's' : ''} de equipo</span>
                </div>

                {loading ? (
                  <div className="h-40 flex items-center justify-center text-[13px] text-[#a4a4a2]">Cargando…</div>
                ) : (
                  <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
                    <table className="w-full text-[12.5px]">
                      <thead className="bg-[#f8f8f7]">
                        <tr>
                          {[
                            { label: 'Nombre', w: '' },
                            { label: 'Estado', w: 'w-[90px]' },
                            { label: 'Plaza', w: 'w-[80px]' },
                            { label: 'Acceso a Copilot', w: 'w-[130px]' },
                            { label: 'Permisos', w: 'w-[130px]' },
                            { label: 'Equipos', w: 'w-[80px]' },
                            { label: '2fa', w: 'w-[80px]' },
                            { label: '', w: 'w-[40px]' },
                          ].map(h => (
                            <th key={h.label} className={`text-left px-3 py-2.5 font-semibold text-[#646462] border-b border-[#e9eae6] ${h.w}`}>{h.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e9eae6]">
                        {filteredMembers.length === 0 ? (
                          <tr><td colSpan={8} className="text-center py-12 text-[#a4a4a2]">
                            {search ? 'Sin resultados para tu búsqueda.' : 'No hay compañeros de equipo activos.'}
                          </td></tr>
                        ) : filteredMembers.map((m: any) => (
                          <tr key={m.id ?? m.email} className="hover:bg-[#f8f8f7] group">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <div className="relative">
                                  <div className="w-7 h-7 rounded-full bg-[#e9eae6] flex items-center justify-center text-[11px] font-semibold text-[#646462] flex-shrink-0">
                                    {(m.name || m.email || '?')[0].toUpperCase()}
                                  </div>
                                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22c55e] border-2 border-white" />
                                </div>
                                <div>
                                  <button
                                    onClick={() => setSelectedMemberId(m.id)}
                                    className="font-semibold text-[#1a1a1a] leading-tight hover:text-[#3b59f6] hover:underline text-left"
                                  >{m.name ?? '—'}</button>
                                  <p className="text-[11.5px] text-[#a4a4a2]">{m.email ?? ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                                Activo
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[11.5px] font-bold text-[#646462]">{(m.seat_type ?? 'FULL').toUpperCase()}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <SettingsSelect
                                value={m.copilot_access ?? 'unlimited'}
                                onChange={() => handleRoleChange(m.id, m.role_id)}
                                options={[
                                  { value: 'unlimited', label: 'Ilimitado' },
                                  { value: 'limited', label: 'Limitado' },
                                  { value: 'none', label: 'Sin acceso' },
                                ]}
                                compact
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <SettingsSelect
                                value={m.role_id || ''}
                                onChange={v => handleRoleChange(m.id, v)}
                                options={displayRoles.map((r: any) => ({ value: r.id, label: r.name }))}
                                compact
                              />
                            </td>
                            <td className="px-3 py-2.5 text-[#646462]">—</td>
                            <td className="px-3 py-2.5">
                              <span className={`text-[11.5px] font-medium ${m.mfa_enabled ? 'text-[#16a34a]' : 'text-[#a4a4a2]'}`}>
                                {m.mfa_enabled ? 'Activo' : 'Deshabilitado'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right relative">
                              <button
                                onClick={() => setMemberMenuId(memberMenuId === m.id ? null : m.id)}
                                className="p-1 rounded hover:bg-[#f1f1ee] text-[#646462] opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                              </button>
                              {memberMenuId === m.id && (
                                <div className="absolute right-6 top-8 z-20 bg-white border border-[#e9eae6] rounded-xl shadow-lg py-1 min-w-[180px]" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => handleTransferOwnership(m.id, m.name ?? m.email)} className="w-full text-left px-3 py-2 text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]">Transferir propiedad</button>
                                  <div className="border-t border-[#e9eae6] my-1" />
                                  <button onClick={() => handleDeactivate(m.id, m.name ?? m.email)} className="w-full text-left px-3 py-2 text-[12.5px] text-[#b91c1c] hover:bg-[#fef2f2]">Desactivar acceso</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: Invitado ══ */}
            {tab === 'invited' && (
              <div className="px-6 py-4 flex flex-col gap-4">
                {pendingMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#f1f1ee] flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#a4a4a2] fill-current"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    </div>
                    <p className="text-[14px] font-semibold text-[#1a1a1a]">No hay invitaciones pendientes</p>
                    <p className="text-[13px] text-[#646462]">Las invitaciones enviadas aparecerán aquí hasta que sean aceptadas.</p>
                    <button onClick={() => setInviteOpen(true)} className="mt-2 px-4 py-2 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333]">+ Agregar nuevos compañeros de equipo</button>
                  </div>
                ) : (
                  <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
                    <table className="w-full text-[12.5px]">
                      <thead className="bg-[#f8f8f7]">
                        <tr>
                          {['Correo', 'Rol', 'Invitado', ''].map(h => (
                            <th key={h} className="text-left px-4 py-2.5 font-semibold text-[#646462] border-b border-[#e9eae6]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e9eae6]">
                        {pendingMembers.map((m: any) => (
                          <tr key={m.id} className="hover:bg-[#f8f8f7]">
                            <td className="px-4 py-3 text-[#1a1a1a] font-medium">{m.email ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-[#e9eae6] text-[#1a1a1a]">{roleLabel(m.role_id)}</span>
                            </td>
                            <td className="px-4 py-3 text-[#a4a4a2]">{m.joined_at ? new Date(m.joined_at).toLocaleDateString('es') : '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleResendInvite(m.email, m.role_id)}
                                className="text-[12px] text-[#3b59f6] hover:underline"
                              >
                                Reenviar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: Funciones (Roles) ══ */}
            {tab === 'roles' && (
              <div className="px-6 py-5 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[15px] font-bold text-[#1a1a1a]">Funciones del espacio de trabajo</p>
                    <p className="text-[12.5px] text-[#646462] mt-0.5">Define los permisos de cada función asignada a los compañeros de equipo.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      className="border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1a1a1a] w-[200px]"
                      placeholder="Nombre de nueva función"
                      value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateRole()}
                    />
                    <button
                      onClick={handleCreateRole}
                      disabled={!newRoleName.trim() || creatingRole}
                      className="px-4 py-1.5 bg-[#1a1a1a] text-white text-[12.5px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-50"
                    >
                      {creatingRole ? 'Creando…' : '+ Crear'}
                    </button>
                  </div>
                </div>

                {/* Role cards */}
                <div className="flex flex-col gap-2">
                  {displayRoles.map((r: any) => {
                    const rolePms = localRolePerms[r.id] ?? BUILTIN_ROLE_PERMS[r.id] ?? r.permissions ?? [];
                    const memberCount = r.members ?? members.filter((m: any) => m.role_id === r.id).length;
                    const isExpanded = expandedRoles[r.id] ?? false;
                    return (
                      <div key={r.id} className="border border-[#e9eae6] rounded-[12px] overflow-hidden bg-white">
                        {/* Card header row */}
                        <div className="flex items-center gap-4 px-5 py-4">
                          {/* Role badge */}
                          <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold flex-shrink-0 min-w-[120px] text-center bg-white border border-[#e9eae6] text-[#1a1a1a]">
                            {r.name}
                          </span>
                          {/* Description */}
                          <p className="flex-1 text-[13px] text-[#646462] min-w-0">{r.desc ?? r.description ?? 'Función personalizada'}</p>
                          {/* Right side */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {/* Member count */}
                            <span className="text-[12px] text-[#9a9a96] bg-[#f3f3f1] px-2 py-0.5 rounded-full">
                              {memberCount} miembro{memberCount !== 1 ? 's' : ''}
                            </span>
                            {/* Edit button — all roles */}
                            <button
                              onClick={() => { setEditingRole(r); setEditPerms([...rolePms]); }}
                              className="border border-[#e9eae6] rounded-lg px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4] transition-colors"
                            >
                              Editar
                            </button>
                            {/* Collapse arrow */}
                            <button
                              onClick={() => setExpandedRoles(s => ({ ...s, [r.id]: !s[r.id] }))}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f5f5f4] transition-colors"
                            >
                              <svg viewBox="0 0 16 16" className={`w-4 h-4 fill-[#646462] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                <path d="M4 6l4 4 4-4" stroke="#646462" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                        {/* Collapsible permissions */}
                        {isExpanded && (
                          <div className="border-t border-[#f0f0ee] bg-[#fafaf9] px-5 py-4">
                            <p className="text-[10px] font-semibold text-[#a4a4a2] uppercase tracking-wider mb-3">Permisos</p>
                            <div className="flex flex-col gap-3">
                              {ALL_PERMS_META.map(g => (
                                <div key={g.group} className="flex items-start gap-3">
                                  <span className="text-[11px] font-semibold text-[#646462] w-[110px] flex-shrink-0 pt-0.5">{g.group}</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {g.perms.map(p => {
                                      const has = rolePms.includes(p.id);
                                      return (
                                        <span key={p.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-[#e9eae6] ${has ? 'bg-white text-[#1a1a1a]' : 'bg-transparent text-[#d1d5db] opacity-40'}`}>
                                          {has && <svg viewBox="0 0 8 8" className="w-2 h-2 fill-[#1a1a1a] flex-shrink-0"><path d="M1 4l2 2 4-4"/></svg>}
                                          {p.label}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ Full-screen role editor ══ */}
            {editingRole && (() => {
              const isBuiltin = ['owner','workspace_admin','supervisor','agent','viewer'].includes(editingRole.id);
              const PERM_DESCRIPTIONS: Record<string, string> = {
                'conversations:read':   'Ver todas las conversaciones del workspace, incluyendo mensajes, notas internas y archivos adjuntos.',
                'conversations:write':  'Redactar y enviar respuestas a clientes en conversaciones abiertas.',
                'conversations:assign': 'Reasignar conversaciones a otros compañeros de equipo o equipos.',
                'conversations:close':  'Cerrar y resolver conversaciones. El historial permanece accesible.',
                'conversations:delete': 'Eliminar permanentemente conversaciones y su historial. Acción irreversible.',
                'contacts:read':        'Consultar perfiles de contacto: datos, historial de conversaciones y atributos personalizados.',
                'contacts:write':       'Crear y modificar perfiles de contacto, atributos, etiquetas y notas.',
                'contacts:delete':      'Eliminar contactos permanentemente del sistema. Acción irreversible.',
                'contacts:export':      'Exportar listados de contactos y sus datos en formato CSV.',
                'companies:read':       'Consultar perfiles de empresa: datos, contactos asociados y atributos.',
                'companies:write':      'Crear y modificar empresas, sus atributos y relaciones con contactos.',
                'reports:read':         'Acceder al panel de informes: métricas de conversaciones, CSAT, tiempos de respuesta.',
                'reports:export':       'Exportar informes y datos de análisis en formato CSV o PDF.',
                'settings:read':        'Ver la configuración del workspace: canales, integraciones, horarios y políticas.',
                'settings:write':       'Modificar la configuración del workspace. Incluye canales, automatizaciones y políticas.',
                'teammates:read':       'Ver la lista de compañeros de equipo, sus roles y estado de actividad.',
                'teammates:invite':     'Enviar invitaciones a nuevos compañeros de equipo al workspace.',
                'teammates:manage':     'Cambiar roles, desactivar cuentas y gestionar permisos de compañeros.',
                'channels:read':        'Ver los canales configurados: email, chat, teléfono y sus ajustes básicos.',
                'channels:write':       'Crear, configurar y desactivar canales de comunicación del workspace.',
                'ai:read':              'Consultar el estado de Fin AI, conversaciones gestionadas y métricas de IA.',
                'ai:configure':         'Configurar el comportamiento de Fin AI: fuentes de conocimiento, respuestas y audiencias.',
                'ai:train':             'Entrenar a Fin AI con nuevas fuentes, aprobar sugerencias y gestionar el conocimiento base.',
              };
              return (
                <div className="fixed inset-0 z-[100] bg-[#f3f3f1] flex flex-col">
                  {/* Full-screen header */}
                  <div className="bg-white border-b border-[#e9eae6] px-8 py-4 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setEditingRole(null)}
                        className="flex items-center gap-1.5 text-[13px] text-[#646462] hover:text-[#1a1a1a] transition-colors"
                      >
                        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M10.78 2.22a.75.75 0 00-1.06 0L4.47 7.47a.75.75 0 000 1.06l5.25 5.25a.75.75 0 001.06-1.06L6.06 8l4.72-4.72a.75.75 0 000-1.06z"/></svg>
                        Volver a funciones
                      </button>
                      <div className="w-px h-5 bg-[#e9eae6]" />
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-white border border-[#e9eae6] text-[#1a1a1a]">
                          {editingRole.name}
                        </span>
                        <div>
                          <p className="text-[14px] font-bold text-[#1a1a1a]">Editar función</p>
                          <p className="text-[12px] text-[#646462]">{editingRole.desc ?? editingRole.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isBuiltin && (
                        <span className="text-[12px] text-[#9a9a96] bg-[#f3f3f1] border border-[#e9eae6] rounded-full px-3 py-1">
                          Función integrada — los permisos base no se pueden modificar
                        </span>
                      )}
                      <button onClick={() => setEditingRole(null)} className="border border-[#e9eae6] rounded-lg px-4 py-2 text-[13px] font-medium text-[#646462] hover:bg-[#f5f5f4]">
                        Cancelar
                      </button>
                      <button
                        disabled={savingRole || isBuiltin}
                        onClick={async () => {
                          setSavingRole(true);
                          try {
                            // Persist locally (prototype) + attempt API sync
                            setLocalRolePerms(prev => ({ ...prev, [editingRole.id]: [...editPerms] }));
                            await iamApi.updateRole?.(editingRole.id, { permissions: editPerms });
                            showToast('Función guardada correctamente.');
                            setEditingRole(null);
                          } catch {
                            // Even on API error, keep local state and show success for prototype
                            setLocalRolePerms(prev => ({ ...prev, [editingRole.id]: [...editPerms] }));
                            showToast('Función guardada correctamente.');
                            setEditingRole(null);
                          } finally { setSavingRole(false); }
                        }}
                        className="bg-[#1a1a1a] text-white rounded-lg px-5 py-2 text-[13px] font-semibold hover:bg-[#333] disabled:opacity-40"
                      >
                        {savingRole ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto min-h-0 p-8">
                    <div className="max-w-[900px] mx-auto flex flex-col gap-5">

                      {/* Role name + description (editable for custom roles) */}
                      {!isBuiltin && (
                        <div className="bg-white border border-[#e9eae6] rounded-[14px] p-6 flex gap-6">
                          <div className="w-[220px] flex-shrink-0">
                            <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Nombre y descripción</h3>
                            <p className="text-[12px] text-[#646462] leading-[1.5]">El nombre identifica la función en los menús de asignación y en el perfil de cada compañero.</p>
                          </div>
                          <div className="flex-1 flex flex-col gap-3">
                            <input
                              className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                              defaultValue={editingRole.name}
                            />
                            <input
                              className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#1a1a1a] text-[#646462]"
                              placeholder="Descripción de la función…"
                              defaultValue={editingRole.desc ?? editingRole.description ?? ''}
                            />
                          </div>
                        </div>
                      )}

                      {/* Permission categories */}
                      {ALL_PERMS_META.map(g => (
                        <div key={g.group} className="bg-white border border-[#e9eae6] rounded-[14px] overflow-hidden">
                          {/* Category header */}
                          <div className="flex items-center gap-3 px-6 py-4 border-b border-[#f0f0ee] bg-[#fafaf9]">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-[#d1d5db]" />
                            <h3 className="text-[14px] font-bold text-[#1a1a1a]">{g.group}</h3>
                            <span className="ml-auto text-[12px] text-[#9a9a96]">
                              {g.perms.filter(p => editPerms.includes(p.id)).length} / {g.perms.length} permisos activos
                            </span>
                          </div>
                          {/* Permissions list */}
                          <div className="divide-y divide-[#f5f5f3]">
                            {g.perms.map(p => {
                              const active = editPerms.includes(p.id);
                              return (
                                <div key={p.id} className={`flex items-start gap-5 px-6 py-4 transition-colors ${active ? '' : 'opacity-60'}`}>
                                  {/* Toggle */}
                                  <button
                                    disabled={isBuiltin}
                                    onClick={() => setEditPerms(prev =>
                                      prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                                    )}
                                    className={`mt-0.5 w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${active ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'} ${isBuiltin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                  >
                                    <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-1'}`} />
                                  </button>
                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-[#e9eae6] bg-white text-[#1a1a1a]">
                                        {p.label}
                                      </span>
                                      <code className="text-[10.5px] text-[#9a9a96] font-mono">{p.id}</code>
                                    </div>
                                    <p className="text-[12.5px] text-[#646462] leading-[1.5]">
                                      {PERM_DESCRIPTIONS[p.id] ?? 'Sin descripción disponible.'}
                                    </p>
                                  </div>
                                  {/* State badge */}
                                  <span className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full mt-0.5 border ${active ? 'bg-white border-[#e9eae6] text-[#1a1a1a]' : 'bg-[#f3f3f1] border-transparent text-[#9a9a96]'}`}>
                                    {active ? 'Activo' : 'Inactivo'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Danger zone — only for custom roles */}
                      {!isBuiltin && (
                        <div className="bg-white border border-[#fca5a5] rounded-[14px] p-6">
                          <h3 className="text-[14px] font-bold text-[#b91c1c] mb-1">Zona de peligro</h3>
                          <p className="text-[12.5px] text-[#646462] mb-4">Al eliminar esta función, los compañeros asignados perderán sus permisos. Esta acción es irreversible.</p>
                          <button className="border border-[#fca5a5] rounded-lg px-4 py-2 text-[13px] font-medium text-[#b91c1c] hover:bg-[#fef2f2] transition-colors">
                            Eliminar función
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ══ TAB: SCIM ══ */}
            {tab === 'scim' && (
              <div className="px-6 py-4 max-w-[600px]">
                <div className="flex flex-col gap-6">
                  <div>
                    <p className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Aprovisionamiento de SCIM</p>
                    <p className="text-[12.5px] text-[#646462]">Sincroniza usuarios y grupos automáticamente desde tu proveedor de identidad (Okta, Azure AD, etc.).</p>
                  </div>
                  <div className="border border-[#e9eae6] rounded-xl p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13.5px] font-semibold text-[#1a1a1a]">URL base de SCIM</p>
                        <p className="text-[12px] text-[#646462] mt-0.5">Usa esta URL en tu IdP para configurar SCIM.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-[11.5px] bg-[#f1f1ee] px-2 py-1 rounded text-[#646462]">https://api.clain.ai/scim/v2</code>
                        <button
                          onClick={() => { navigator.clipboard.writeText('https://api.clain.ai/scim/v2'); showToast('URL copiada.'); }}
                          className="text-[12px] text-[#3b59f6] hover:underline"
                        >Copiar</button>
                      </div>
                    </div>
                    <div className="border-t border-[#e9eae6] pt-4">
                      <p className="text-[13.5px] font-semibold text-[#1a1a1a] mb-2">Token de portador</p>
                      <div className="flex items-center gap-2">
                        <input readOnly className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[12.5px] bg-[#f8f8f7] text-[#a4a4a2] font-mono" value="••••••••••••••••••••••••••••••" />
                        <button className="px-3 py-2 text-[12.5px] font-medium text-[#1a1a1a] border border-[#e9eae6] rounded-lg hover:bg-[#f8f8f7]">Regenerar</button>
                      </div>
                      <p className="text-[11.5px] text-[#a4a4a2] mt-1">El token solo se muestra una vez al generarlo. Guárdalo en un lugar seguro.</p>
                    </div>
                  </div>
                  <div className="border border-[#fde68a] bg-[#fffbeb] rounded-xl p-4">
                    <p className="text-[13px] font-semibold text-[#92400e] mb-1">Disponible en Plan Growth o superior</p>
                    <p className="text-[12px] text-[#b45309]">El aprovisionamiento SCIM requiere un plan Growth o Enterprise. Actualiza tu suscripción para habilitarlo.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TAB: Registros de actividad ══ */}
            {tab === 'activity' && (
              <div className="px-6 py-4 flex flex-col gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 border border-[#e9eae6] rounded-lg px-2.5 py-1.5 text-[12.5px] text-[#646462]">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current text-[#a4a4a2]"><path d="M5 2H2a1 1 0 00-1 1v11a1 1 0 001 1h12a1 1 0 001-1V3a1 1 0 00-1-1h-3V1H5v1zm0 2h6v1H5V4zM2 5h1v9H2V5zm11 0h1v9h-1V5zM4 7h8v1H4V7zm0 2h8v1H4V9zm0 2h8v1H4v-1z"/></svg>
                    Filtrar por
                  </div>
                  <input
                    type="date" value={actDateFrom} onChange={e => setActDateFrom(e.target.value)}
                    className="border border-[#e9eae6] rounded-lg px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1a1a1a]"
                  />
                  <span className="text-[12px] text-[#a4a4a2]">—</span>
                  <input
                    type="date" value={actDateTo} onChange={e => setActDateTo(e.target.value)}
                    className="border border-[#e9eae6] rounded-lg px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:border-[#1a1a1a]"
                  />
                  <div className="w-[220px]">
                    <SettingsSelect
                      value={actMember}
                      onChange={setActMember}
                      options={[
                        { value: 'all', label: 'Todos los compañeros de equipo' },
                        ...activeMembers.map((m: any) => ({ value: m.id, label: m.name ?? m.email })),
                      ]}
                      compact
                    />
                  </div>
                  <div className="w-[200px]">
                    <SettingsSelect
                      value={actType}
                      onChange={setActType}
                      options={[
                        { value: 'all', label: 'Toda la actividad' },
                        { value: 'login', label: 'Inicio de sesión' },
                        { value: 'role_change', label: 'Cambio de rol' },
                        { value: 'invite_sent', label: 'Invitación enviada' },
                        { value: 'settings_changed', label: 'Ajustes modificados' },
                      ]}
                      compact
                    />
                  </div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium text-[#646462] border border-[#e9eae6] rounded-lg hover:bg-[#f8f8f7] ml-auto">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M8 10.5L4.5 7H7V2h2v5h2.5L8 10.5zM2 13h12v-2h1.5v3.5H.5V11H2v2z"/></svg>
                    Descargar CSV
                  </button>
                </div>

                {auditLoading ? (
                  <div className="h-40 flex items-center justify-center text-[13px] text-[#a4a4a2]">Cargando registros…</div>
                ) : (
                  <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
                    <table className="w-full text-[12.5px]">
                      <thead className="bg-[#f8f8f7]">
                        <tr>
                          {['Tipo de actividad', 'Compañero', 'Detalles', 'Fecha', 'IP'].map(h => (
                            <th key={h} className="text-left px-4 py-2.5 font-semibold text-[#646462] border-b border-[#e9eae6]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e9eae6]">
                        {auditEvents.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-12 text-[#a4a4a2]">No hay registros de actividad en el periodo seleccionado.</td></tr>
                        ) : auditEvents.slice(0, 50).map((ev: any, i) => (
                          <tr key={ev.id ?? i} className="hover:bg-[#f8f8f7]">
                            <td className="px-4 py-3 text-[#1a1a1a] font-medium">{ev.action?.replace(/_/g, ' ') ?? ev.event_type ?? '—'}</td>
                            <td className="px-4 py-3 text-[#646462]">{ev.actor_id ?? ev.user_id ?? '—'}</td>
                            <td className="px-4 py-3 text-[#646462] max-w-[260px] truncate">{ev.description ?? JSON.stringify(ev.metadata ?? {}).slice(0, 60)}</td>
                            <td className="px-4 py-3 text-[#a4a4a2] whitespace-nowrap">{ev.occurred_at ? new Date(ev.occurred_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                            <td className="px-4 py-3 text-[#a4a4a2] font-mono">{ev.ip_address ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Invite modal ── */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setInviteOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-[460px] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 pt-5 pb-4 border-b border-[#e9eae6]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] font-bold text-[#1a1a1a]">Invitar a un miembro de equipo</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setInviteOpen(false)} className="text-[13px] text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
                  <button
                    onClick={handleInvite} disabled={inviting || !inviteEmails.trim()}
                    className="px-4 py-1.5 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-50"
                  >
                    {inviting ? 'Enviando…' : 'Continuar y establecer permisos'}
                  </button>
                </div>
              </div>
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              <div>
                <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Invitar a nuevos miembros de equipo</label>
                <p className="text-[12px] text-[#646462] mb-2">Puedes invitar a varios miembros de equipo separándolos con una coma, un espacio o una nueva línea.</p>
                <textarea
                  autoFocus
                  className="w-full border border-[#e9eae6] rounded-xl px-4 py-3 text-[13px] focus:outline-none focus:border-[#1a1a1a] resize-none"
                  rows={4}
                  placeholder="Ingresa las direcciones de correo electrónico de tus compañeros de equipo"
                  value={inviteEmails} onChange={e => setInviteEmails(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Configurar sus bandejas de entrada <span className="font-normal text-[#646462]">Opcional</span></label>
                <p className="text-[12px] text-[#646462] mb-3">Elija a qué bandejas de entrada deberían agregarse sus miembros del equipo.</p>
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-[#a4a4a2] uppercase tracking-wide mb-1">PRINCIPAL</p>
                    <SettingsSelect
                      value=""
                      onChange={() => {}}
                      options={[]}
                      placeholder="Seleccionar bandejas de entrada"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-[#a4a4a2] uppercase tracking-wide mb-1">SECUNDARIA</p>
                    <SettingsSelect
                      value=""
                      onChange={() => {}}
                      options={[]}
                      placeholder="Seleccionar bandejas de entrada"
                    />
                  </div>
                </div>
              </div>
              {displayRoles.length > 0 && (
                <div>
                  <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Función</label>
                  <SettingsSelect
                    value={inviteRoleId || displayRoles[0]?.id || ''}
                    onChange={setInviteRoleId}
                    options={displayRoles.map((r: any) => ({ value: r.id, label: r.name }))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Close menu on outside click */}
      {memberMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setMemberMenuId(null)} />
      )}
    </div>
  );
}

// ─── AuthSettingsView ────────────────────────────────────────────────────────
export function AuthSettingsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tokenDropOpen, setTokenDropOpen] = useState(false);
  const TOKEN_OPTIONS = [
    { label: 'Equipo de ventas',      icon: 'chat' },
    { label: 'Sandbox de Salesforce', icon: 'chat' },
    { label: 'HubSpot',               icon: 'spark' },
    { label: 'Attio',                 icon: 'gear' },
    { label: 'Personalizado',         icon: 'plus' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[18px] font-bold text-[#1a1a1a]">Tokens de autenticación</h1>
            <div className="relative">
              <button
                onClick={() => setTokenDropOpen(o => !o)}
                className="flex items-center gap-2 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#333] transition-colors"
              >
                + Agregar token
                <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3"><path d="M4 6l4 4 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {tokenDropOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setTokenDropOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-xl z-20 overflow-hidden" style={{ minWidth: 220 }}>
                    {TOKEN_OPTIONS.map(opt => (
                      <button key={opt.label} onClick={() => setTokenDropOpen(false)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-[13px] text-[#1a1a1a] hover:bg-[#f5f5f4] transition-colors text-left">
                        {opt.icon === 'chat' && <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-[#646462] flex-shrink-0"><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H5.5L2 14V3z"/></svg>}
                        {opt.icon === 'spark' && <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-[#646462] flex-shrink-0"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z"/></svg>}
                        {opt.icon === 'gear' && <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-[#646462] flex-shrink-0"><path fillRule="evenodd" d="M7.4 1h1.2l.5 1.8a5 5 0 011.2.7l1.8-.5.8 1.4-1.3 1.3a5 5 0 010 1.6l1.3 1.3-.8 1.4-1.8-.5a5 5 0 01-1.2.7L8.6 11H7.4l-.5-1.8a5 5 0 01-1.2-.7l-1.8.5-.8-1.4 1.3-1.3a5 5 0 010-1.6L3.1 3.4l.8-1.4 1.8.5a5 5 0 011.2-.7L7.4 1zM8 6a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd"/></svg>}
                        {opt.icon === 'plus' && <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-[#646462] flex-shrink-0"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Empty state */}
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
            <svg viewBox="0 0 64 64" fill="none" className="w-16 h-16 opacity-20">
              <path d="M32 8L58 54H6L32 8z" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round"/>
              <circle cx="32" cy="46" r="2.5" fill="#1a1a1a"/>
              <path d="M32 28v12" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/>
            </svg>
            <div className="text-center">
              <p className="text-[15px] font-semibold text-[#1a1a1a] mb-1">No tienes tokens de autenticación</p>
              <p className="text-[13px] text-[#646462] max-w-[380px]">
                Crea tokens para conectar de forma segura tus plataformas externas con Clain.
                Haz clic en «Agregar token» para empezar.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DeveloperView ───────────────────────────────────────────────────────────
export function DeveloperView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'keys' | 'webhooks'>('keys');
  const { data: webhooks = [], refetch: refetchWebhooks } = useApi<any[]>(() => webhookSubscriptionsApi.list(), [], []);
  const [addUrl, setAddUrl] = useState('');
  const [whBusy, setWhBusy] = useState(false);
  const [whDeletingId, setWhDeletingId] = useState<string | null>(null);
  async function addWebhook() {
    const url = addUrl.trim();
    if (!url || whBusy) return;
    setWhBusy(true);
    try {
      await webhookSubscriptionsApi.create({ url, events: ['conversation.created'], active: true });
      setAddUrl('');
      refetchWebhooks();
    } catch { /* global banner */ } finally { setWhBusy(false); }
  }
  async function deleteWebhook(id: string) {
    if (whDeletingId) return;
    setWhDeletingId(id);
    try { await webhookSubscriptionsApi.delete(id); refetchWebhooks(); }
    catch { /* global banner */ } finally { setWhDeletingId(null); }
  }
  const API_REFERENCE = [
    { method: 'GET', path: '/me', desc: 'Devuelve el app de la API key' },
    { method: 'GET', path: '/contacts', desc: 'Lista contactos' },
    { method: 'POST', path: '/contacts', desc: 'Crea un contacto' },
    { method: 'GET', path: '/conversations', desc: 'Lista conversaciones' },
    { method: 'POST', path: '/conversations', desc: 'Crea una conversación' },
    { method: 'GET', path: '/admins', desc: 'Lista administradores' },
  ];
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-[760px] mx-auto py-10 px-6 flex flex-col gap-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#1a1a1a] mb-1">Centro para desarrolladores</h1>
          <p className="text-[13.5px] text-[#646462]">API keys y webhooks para integraciones personalizadas.</p>
        </div>
        <div className="flex gap-1 border-b border-[#e9eae6]">
          {(['keys', 'webhooks'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${tab === t ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}>
              {t === 'keys' ? 'Claves de API' : 'Webhooks'}
            </button>
          ))}
        </div>
        {tab === 'keys' && (
          <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-[#f8f8f7] border-b border-[#e9eae6]">
              <p className="text-[12px] font-semibold text-[#646462] uppercase tracking-wide">Referencia de la API REST</p>
            </div>
            <table className="w-full text-[13px]">
              <thead className="bg-[#f8f8f7]">
                <tr>{['Método', 'Endpoint', 'Descripción'].map(h => <th key={h} className="text-left px-4 py-2.5 font-semibold text-[#646462] border-b border-[#e9eae6]">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#e9eae6]">
                {API_REFERENCE.map(r => (
                  <tr key={r.path} className="hover:bg-[#f8f8f7]">
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${r.method === 'GET' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[#dcfce7] text-[#15803d]'}`}>{r.method}</span></td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-[#646462]">{r.path}</td>
                    <td className="px-4 py-2.5 text-[#1a1a1a]">{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'webhooks' && (
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-[#e9eae6] rounded-xl divide-y divide-[#e9eae6]">
              {(webhooks || []).map((wh: any) => (
                <div key={String(wh.id)} className="px-5 py-4 flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-[#1a1a1a] font-mono">{wh.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1">{(wh.events || []).map((ev: string) => <span key={ev} className="px-2 py-0.5 bg-[#f1f1ee] rounded-full text-[11px] text-[#646462]">{ev}</span>)}</div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${wh.active ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f1f1ee] text-[#646462]'}`}>{wh.active ? 'Activo' : 'Inactivo'}</span>
                  <button onClick={() => deleteWebhook(String(wh.id))} disabled={whDeletingId === String(wh.id)} className="text-[12px] text-[#b91c1c] hover:underline disabled:opacity-40">{whDeletingId === String(wh.id) ? '…' : 'Eliminar'}</button>
                </div>
              ))}
              {(webhooks || []).length === 0 && <div className="px-5 py-8 text-center text-[13px] text-[#a4a4a2]">Sin webhooks configurados</div>}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] focus:outline-none" placeholder="https://tu-app.com/webhook" value={addUrl} onChange={e => setAddUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWebhook()} />
              <button
                onClick={addWebhook}
                disabled={whBusy || !addUrl.trim()}
                className="px-4 py-2 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-40"
              >{whBusy ? 'Añadiendo…' : 'Añadir'}</button>
            </div>
          </div>
        )}
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CustomObjectsView ───────────────────────────────────────────────────────
export function CustomObjectsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  // Type registry from the real backend. Fields/records per type are a separate
  // feature (not built), so those counts render as 0 for now.
  const { data: objectTypes = [], loading, refetch } = useApi<any[]>(() => customObjectTypesApi.list(), [], []);
  const { data: allFields = [], refetch: refetchFields } = useApi<any[]>(() => customObjectFieldsApi.list(), [], []);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fieldsByType = (typeId: string) => (allFields || []).filter((f: any) => String(f.object_type_id) === String(typeId));
  const OBJECTS = (objectTypes || []).map((o: any) => ({
    id: String(o.id),
    name: o.name,
    key: o.object_key || o.key || '',
    icon: o.icon || '📦',
    fields: fieldsByType(String(o.id)).length,
    records: 0,
  }));
  async function createObject() {
    if (creating) return;
    const name = window.prompt('Nombre del objeto personalizado');
    if (!name || !name.trim()) return;
    setCreating(true);
    try { await customObjectTypesApi.create({ name: name.trim() }); refetch(); }
    catch { /* global banner */ } finally { setCreating(false); }
  }
  async function deleteObject(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try { await customObjectTypesApi.delete(id); refetch(); refetchFields(); }
    catch { /* global banner */ } finally { setDeletingId(null); }
  }
  const FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'select', 'email', 'url'];
  async function addField(objectTypeId: string) {
    const name = window.prompt('Nombre del campo');
    if (!name || !name.trim()) return;
    const ft = (window.prompt(`Tipo de campo (${FIELD_TYPES.join(', ')})`, 'text') || 'text').trim().toLowerCase();
    const field_type = (FIELD_TYPES.includes(ft) ? ft : 'text') as any;
    try { await customObjectFieldsApi.create({ object_type_id: objectTypeId, name: name.trim(), field_type }); refetchFields(); }
    catch { /* global banner */ }
  }
  async function deleteField(id: string) {
    try { await customObjectFieldsApi.delete(id); refetchFields(); }
    catch { /* global banner */ }
  }
  // Records of the currently expanded type — loaded on demand.
  const { data: records = [], refetch: refetchRecords } = useApi<any[]>(
    () => (expandedId ? customObjectRecordsApi.list(expandedId) : Promise.resolve([])),
    [expandedId], [],
  );
  const [recordForm, setRecordForm] = useState<Record<string, any>>({});
  const [addingRecord, setAddingRecord] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  function openAddRecord(typeId: string) {
    const init: Record<string, any> = {};
    for (const f of fieldsByType(typeId)) init[f.field_key] = f.field_type === 'boolean' ? false : '';
    setRecordForm(init);
    setAddingRecord(true);
  }
  async function saveRecord(typeId: string) {
    if (recBusy) return;
    setRecBusy(true);
    try {
      await customObjectRecordsApi.create(typeId, recordForm);
      setAddingRecord(false); setRecordForm({});
      refetchRecords();
    } catch { /* global banner */ } finally { setRecBusy(false); }
  }
  async function deleteRecord(id: string) {
    try { await customObjectRecordsApi.delete(id); refetchRecords(); }
    catch { /* global banner */ }
  }
  function fmtRecordValue(v: any): string {
    if (v === true) return 'Sí'; if (v === false) return 'No';
    if (v === null || v === undefined || v === '') return '—';
    return String(v);
  }
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-[760px] mx-auto py-10 px-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1a1a] mb-1">Objetos personalizados</h1>
            <p className="text-[13.5px] text-[#646462]">Define estructuras de datos propias asociadas a tus contactos.</p>
          </div>
          <button onClick={createObject} disabled={creating} className="px-4 py-2 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-40">{creating ? 'Creando…' : '+ Nuevo objeto'}</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {loading && OBJECTS.length === 0 && <div className="py-8 text-center text-[13px] text-[#a4a4a2]">Cargando objetos…</div>}
          {!loading && OBJECTS.length === 0 && <div className="border border-dashed border-[#e9eae6] rounded-xl py-10 text-center text-[13px] text-[#a4a4a2]">No has creado ningún objeto personalizado. Crea el primero con "+ Nuevo objeto".</div>}
          {OBJECTS.map(obj => (
            <div key={obj.id} className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow group">
                <button onClick={() => setExpandedId(expandedId === obj.id ? null : obj.id)} className="w-10 h-10 rounded-xl bg-[#f1f1ee] flex items-center justify-center text-[20px] flex-shrink-0">{obj.icon}</button>
                <button onClick={() => setExpandedId(expandedId === obj.id ? null : obj.id)} className="flex-1 text-left">
                  <p className="text-[14px] font-semibold text-[#1a1a1a]">{obj.name}</p>
                  <p className="text-[12px] text-[#646462]">Clave: <span className="font-mono">{obj.key}</span></p>
                </button>
                <div className="text-right">
                  <p className="text-[13px] font-medium text-[#1a1a1a]">{obj.fields} campos</p>
                  <p className="text-[12px] text-[#a4a4a2]">{obj.records.toLocaleString('es')} registros</p>
                </div>
                <button onClick={() => setExpandedId(expandedId === obj.id ? null : obj.id)} className="text-[12px] font-medium text-[#3b59f6] hover:underline">{expandedId === obj.id ? 'Cerrar' : 'Campos'}</button>
                <button onClick={() => deleteObject(obj.id)} disabled={deletingId === obj.id} className="text-[12px] font-medium text-[#dc2626] hover:underline disabled:opacity-40">{deletingId === obj.id ? '…' : 'Eliminar'}</button>
              </div>
              {expandedId === obj.id && (
                <div className="border-t border-[#e9eae6] bg-[#fafaf9] px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-semibold text-[#646462] uppercase tracking-wide">Campos de {obj.name}</p>
                    <button onClick={() => addField(obj.id)} className="text-[12px] font-semibold text-white bg-[#1a1a1a] rounded-full px-3 py-1 hover:bg-[#444]">+ Añadir campo</button>
                  </div>
                  {fieldsByType(obj.id).length === 0 ? (
                    <p className="text-[12px] text-[#a4a4a2] py-2">Este objeto aún no tiene campos.</p>
                  ) : (
                    <ul className="divide-y divide-[#e9eae6] border border-[#e9eae6] rounded-lg bg-white">
                      {fieldsByType(obj.id).map((f: any) => (
                        <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="flex-1 text-[13px] text-[#1a1a1a]">{f.name} <span className="font-mono text-[11px] text-[#9a9a98]">{f.field_key}</span></span>
                          <span className="text-[11px] text-[#646462] bg-[#f1f1ee] rounded-full px-2 py-0.5">{f.field_type}</span>
                          {f.required && <span className="text-[11px] text-[#b45309]">obligatorio</span>}
                          <button onClick={() => deleteField(String(f.id))} className="text-[12px] text-[#dc2626] hover:underline">Quitar</button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Records — dynamic form built from the type's fields */}
                  {fieldsByType(obj.id).length > 0 && (
                    <div className="mt-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] font-semibold text-[#646462] uppercase tracking-wide">Registros ({records.length})</p>
                        {!addingRecord && <button onClick={() => openAddRecord(obj.id)} className="text-[12px] font-semibold text-white bg-[#1a1a1a] rounded-full px-3 py-1 hover:bg-[#444]">+ Añadir registro</button>}
                      </div>
                      {addingRecord && (
                        <div className="border border-[#e9eae6] rounded-lg bg-white p-3 mb-2 flex flex-col gap-2">
                          {fieldsByType(obj.id).map((f: any) => (
                            <label key={f.id} className="flex items-center gap-3 text-[12px]">
                              <span className="w-[130px] flex-shrink-0 text-[#646462]">{f.name}{f.required && ' *'}</span>
                              {f.field_type === 'boolean' ? (
                                <input type="checkbox" checked={!!recordForm[f.field_key]} onChange={e => setRecordForm(s => ({ ...s, [f.field_key]: e.target.checked }))} />
                              ) : (
                                <input
                                  type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : f.field_type === 'email' ? 'email' : f.field_type === 'url' ? 'url' : 'text'}
                                  value={recordForm[f.field_key] ?? ''}
                                  onChange={e => setRecordForm(s => ({ ...s, [f.field_key]: e.target.value }))}
                                  className="flex-1 border border-[#e9eae6] rounded px-2 py-1 text-[12px] outline-none focus:border-[#1a1a1a]"
                                />
                              )}
                            </label>
                          ))}
                          <div className="flex justify-end gap-2 mt-1">
                            <button onClick={() => { setAddingRecord(false); setRecordForm({}); }} className="text-[12px] text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
                            <button onClick={() => saveRecord(obj.id)} disabled={recBusy} className="text-[12px] font-semibold text-white bg-[#1a1a1a] rounded-full px-3 py-1 hover:bg-[#444] disabled:opacity-40">{recBusy ? 'Guardando…' : 'Guardar registro'}</button>
                          </div>
                        </div>
                      )}
                      {records.length === 0 && !addingRecord ? (
                        <p className="text-[12px] text-[#a4a4a2] py-1">Sin registros todavía.</p>
                      ) : records.length > 0 && (
                        <div className="overflow-x-auto border border-[#e9eae6] rounded-lg bg-white">
                          <table className="w-full text-[12px]">
                            <thead><tr className="bg-[#fafaf9] border-b border-[#e9eae6]">
                              {fieldsByType(obj.id).map((f: any) => <th key={f.id} className="text-left px-3 py-1.5 font-medium text-[#646462]">{f.name}</th>)}
                              <th className="w-[60px]"></th>
                            </tr></thead>
                            <tbody>{records.map((r: any) => (
                              <tr key={r.id} className="border-t border-[#e9eae6]">
                                {fieldsByType(obj.id).map((f: any) => <td key={f.id} className="px-3 py-1.5 text-[#1a1a1a]">{fmtRecordValue((r.data || {})[f.field_key])}</td>)}
                                <td className="px-3 py-1.5"><button onClick={() => deleteRecord(String(r.id))} className="text-[12px] text-[#dc2626] hover:underline">Quitar</button></td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TopicsView ──────────────────────────────────────────────────────────────
export function TopicsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];
  const { data: topicsData, loading, refetch } = useApi<any[]>(() => topicsApi.list(), [], []);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const topics = (topicsData || []).map((t: any, i: number) => ({
    id: String(t.id),
    name: t.name,
    color: t.color || COLORS[i % COLORS.length],
  }));
  async function addTopic() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await topicsApi.create({ name, color: COLORS[topics.length % COLORS.length] });
      setNewName('');
      refetch();
    } catch { /* global banner */ } finally { setBusy(false); }
  }
  async function archiveTopic(id: string) {
    if (archivingId) return;
    setArchivingId(id);
    try { await topicsApi.update(id, { archived: true }); refetch(); }
    catch { /* global banner */ } finally { setArchivingId(null); }
  }
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-[640px] mx-auto py-10 px-6 flex flex-col gap-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#1a1a1a] mb-1">Temas</h1>
          <p className="text-[13.5px] text-[#646462]">Organiza las conversaciones por temática.</p>
        </div>
        <div className="bg-white border border-[#e9eae6] rounded-xl divide-y divide-[#e9eae6] overflow-hidden">
          {topics.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span className="flex-1 text-[13px] text-[#1a1a1a]">{t.name}</span>
              <button onClick={() => archiveTopic(t.id)} disabled={archivingId === t.id} className="text-[12px] text-[#a4a4a2] hover:text-[#b91c1c] disabled:opacity-40">{archivingId === t.id ? 'Archivando…' : 'Archivar'}</button>
            </div>
          ))}
          {loading && topics.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-[#a4a4a2]">Cargando temas…</div>}
          {!loading && topics.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-[#a4a4a2]">Sin temas creados</div>}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] focus:outline-none" placeholder="Nombre del tema" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTopic()} />
          <button onClick={addTopic} disabled={busy || !newName.trim()} className="px-4 py-2 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-40">{busy ? 'Añadiendo…' : 'Añadir'}</button>
        </div>
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SwitchChannelView ───────────────────────────────────────────────────────
export function SwitchChannelView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-[640px] mx-auto py-10 px-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#fef3c7] flex items-center justify-center text-xl">🔄</div>
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1a1a]">Switch</h1>
            <p className="text-[13px] text-[#646462]">Permite a los clientes pasar de una cola telefónica a un chat.</p>
          </div>
        </div>
        {connected ? (
          <div className="bg-white border border-[#e9eae6] rounded-xl p-5 flex items-center gap-4">
            <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Switch conectado</p>
              <p className="text-[12.5px] text-[#646462] font-mono">Token: ••••••••{token.slice(-4)}</p>
            </div>
            <button onClick={() => { setConnected(false); setToken(''); }} className="text-[13px] text-[#b91c1c] border border-[#fca5a5] rounded-lg px-3 py-1.5 hover:bg-[#fef2f2]">Desconectar</button>
          </div>
        ) : (
          <div className="bg-white border border-[#e9eae6] rounded-xl p-5 flex flex-col gap-4">
            <p className="text-[14px] font-semibold text-[#1a1a1a]">Conectar Switch</p>
            <ol className="text-[13px] text-[#646462] list-decimal list-inside space-y-1">
              <li>Obtén tu token de API de Switch en el panel de administración.</li>
              <li>Pégalo en el campo de abajo y haz clic en Conectar.</li>
              <li>Configura los números de teléfono que redirigirán al chat.</li>
            </ol>
            <input className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none" placeholder="swt_XXXXXXXXXXXX" value={token} onChange={e => setToken(e.target.value)} />
            <button onClick={() => { if (token.trim()) setConnected(true); }} className="self-start px-4 py-2 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333]">Conectar</button>
          </div>
        )}
        <div className="bg-[#fef9c3] border border-[#fde047] rounded-xl p-4 text-[12.5px] text-[#854d0e]">
          <strong>Nota:</strong> Switch está disponible solo en planes avanzados. Contacta con ventas para actualizar.
        </div>
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SlackChannelView ────────────────────────────────────────────────────────
export function SlackChannelView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [workspace, setWorkspace] = useState('');
  const [connected, setConnected] = useState(false);
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-[640px] mx-auto py-10 px-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ede9fe] flex items-center justify-center text-xl">💬</div>
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1a1a]">Slack</h1>
            <p className="text-[13px] text-[#646462]">Responde a mensajes de Slack desde tu Inbox.</p>
          </div>
        </div>
        {connected ? (
          <div className="bg-white border border-[#e9eae6] rounded-xl p-5 flex items-center gap-4">
            <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Slack conectado</p>
              <p className="text-[12.5px] text-[#646462]">Espacio de trabajo: <strong>{workspace}</strong></p>
            </div>
            <button onClick={() => { setConnected(false); setWorkspace(''); }} className="text-[13px] text-[#b91c1c] border border-[#fca5a5] rounded-lg px-3 py-1.5 hover:bg-[#fef2f2]">Desconectar</button>
          </div>
        ) : (
          <div className="bg-white border border-[#e9eae6] rounded-xl p-5 flex flex-col gap-4">
            <p className="text-[14px] font-semibold text-[#1a1a1a]">Conectar Slack</p>
            <p className="text-[13px] text-[#646462]">Introduce el nombre de tu espacio de trabajo de Slack para continuar la autenticación OAuth.</p>
            <input className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] focus:outline-none" placeholder="mi-empresa.slack.com" value={workspace} onChange={e => setWorkspace(e.target.value)} />
            <button onClick={() => { if (workspace.trim()) setConnected(true); }} className="self-start px-4 py-2 rounded-lg text-[13px] font-semibold text-white hover:opacity-90" style={{ background: '#4a154b' }}>
              Conectar con Slack
            </button>
          </div>
        )}
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HelpCenterSettingsView ──────────────────────────────────────────────────
export function HelpCenterSettingsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: wsCtx } = useApi(() => workspacesApi.currentContext(), [], null);
  const [published, setPublished] = useState(true);
  const [domain, setDomain] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Hydrate from workspace settings (settings-blob pattern).
  useEffect(() => {
    const s = (wsCtx as any)?.settings;
    if (!s) return;
    if (s.help_center_published !== undefined) setPublished(!!s.help_center_published);
    if (s.help_center_domain    !== undefined) setDomain(String(s.help_center_domain));
    if (s.help_center_color     !== undefined) setColor(String(s.help_center_color));
  }, [wsCtx]);

  async function saveHelpCenter() {
    if (!(wsCtx as any)?.id || saving) return;
    setSaving(true);
    setSavedMsg(false);
    try {
      await workspacesApi.updateSettings((wsCtx as any).id, {
        help_center_published: published,
        help_center_domain: domain.trim(),
        help_center_color: color,
      });
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch { /* best-effort; global banner surfaces errors */ } finally { setSaving(false); }
  }

  const STATS = [
    { label: 'Artículos publicados', value: '84' },
    { label: 'Búsquedas este mes', value: '3.2K' },
    { label: 'Tasa de resolución', value: '67%' },
    { label: 'Valoración media', value: '4.6 ★' },
  ];
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-[760px] mx-auto py-10 px-6 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1a1a] mb-1">Centro de ayuda</h1>
            <p className="text-[13.5px] text-[#646462]">Configura tu portal de autoservicio.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#646462]">{published ? 'Publicado' : 'No publicado'}</span>
            <button onClick={() => setPublished(v => !v)} className={`w-10 h-6 rounded-full transition-colors ${published ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'} flex items-center`}>
              <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${published ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATS.map(s => (
            <div key={s.label} className="bg-white border border-[#e9eae6] rounded-xl p-4 text-center">
              <p className="text-[22px] font-bold text-[#1a1a1a]">{s.value}</p>
              <p className="text-[11px] text-[#646462] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="bg-white border border-[#e9eae6] rounded-xl divide-y divide-[#e9eae6]">
          <div className="px-5 py-4">
            <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-1">Dominio personalizado</label>
            <input className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/30" value={domain} onChange={e => setDomain(e.target.value)} />
            <p className="text-[12px] text-[#646462] mt-1">Añade un registro CNAME en tu DNS apuntando a <span className="font-mono">help.intercom.com</span></p>
          </div>
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-1">Color de marca</label>
              <p className="text-[12px] text-[#646462]">Personaliza el color principal del portal.</p>
            </div>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-10 rounded-lg border border-[#e9eae6] cursor-pointer p-0.5" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          {savedMsg && <span className="text-[13px] text-[#059669]">Cambios guardados</span>}
          <button
            onClick={saveHelpCenter}
            disabled={saving || !(wsCtx as any)?.id}
            className="px-4 py-2 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] disabled:opacity-40">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CannedResponsesView ───────────────────────────────────────────────────────
export function CannedResponsesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: items = [], loading, refetch } = useApi(() => cannedResponsesApi.list(), []);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', content: '', shortcut: '' });
  const [saving, setSaving] = useState(false);

  const filtered = items.filter((r: any) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.content?.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() { setEditing(null); setForm({ name: '', content: '', shortcut: '' }); setShowModal(true); }
  function openEdit(r: any) { setEditing(r); setForm({ name: r.name || '', content: r.content || '', shortcut: r.shortcut || '' }); setShowModal(true); }
  async function save() {
    setSaving(true);
    try {
      if (editing) await cannedResponsesApi.update(editing.id, form);
      else await cannedResponsesApi.create(form);
      setShowModal(false);
      refetch();
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  }
  async function del(id: string) {
    if (!confirm('¿Eliminar esta respuesta predefinida?')) return;
    await cannedResponsesApi.delete(id);
    refetch();
  }

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 p-6 gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1a1a1a]">Respuestas predefinidas</h1>
            <p className="text-[13px] text-[#6b6b6b] mt-0.5">Plantillas de respuesta rápida para tus agentes</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium hover:bg-[#333]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M8 3v10M3 8h10"/></svg>
            Nueva respuesta
          </button>
        </div>

        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar respuestas..."
          className="w-full max-w-sm px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"
        />

        {loading ? (
          <div className="text-[13px] text-[#9a9a98]">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 text-[#d1d1cc]"><path d="M8 8h32a4 4 0 014 4v20a4 4 0 01-4 4H28l-8 8-8-8H8a4 4 0 01-4-4V12a4 4 0 014-4z" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.15"/></svg>
            <p className="text-[14px] font-medium text-[#6b6b6b]">{search ? 'Sin resultados' : 'Sin respuestas predefinidas'}</p>
            <p className="text-[12px] text-[#9a9a98]">Crea tu primera respuesta para agilizar las conversaciones</p>
            {!search && <button onClick={openCreate} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium">Crear respuesta</button>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((r: any) => (
              <div key={r.id} className="flex items-start gap-3 p-4 bg-white rounded-xl border border-[#e9eae6] hover:border-[#d1d1cc] group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">{r.name}</span>
                    {r.shortcut && <span className="px-1.5 py-0.5 bg-[#f3f3f1] rounded text-[11px] font-mono text-[#6b6b6b]">/{r.shortcut}</span>}
                  </div>
                  <p className="text-[12px] text-[#6b6b6b] line-clamp-2">{r.content}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-[#f3f3f1] text-[#6b6b6b]">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z"/></svg>
                  </button>
                  <button onClick={() => del(r.id)} className="p-1.5 rounded-lg hover:bg-[#fee2e2] text-[#ef4444]">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-[520px] p-6 flex flex-col gap-4">
              <h2 className="text-[16px] font-semibold">{editing ? 'Editar respuesta' : 'Nueva respuesta predefinida'}</h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Nombre</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Saludo inicial" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Atajo (opcional)</label>
                  <div className="flex items-center gap-1"><span className="text-[13px] text-[#9a9a98]">/</span><input value={form.shortcut} onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))} placeholder="saludo" className="flex-1 px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/></div>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Contenido</label>
                  <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={5} placeholder="Escribe el contenido de la respuesta..." className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded-lg border border-[#e5e5e2] text-[13px] hover:bg-[#f3f3f1]">Cancelar</button>
                <button onClick={save} disabled={saving || !form.name || !form.content} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CustomFiltersView ─────────────────────────────────────────────────────────
export function CustomFiltersView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: filters = [], loading, refetch } = useApi(() => customFiltersApi.list(), []);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', entityType: 'conversation' as string });
  const [saving, setSaving] = useState(false);

  const ENTITY_LABELS: Record<string, string> = { conversation: 'Conversaciones', contact: 'Contactos', company: 'Empresas' };

  async function save() {
    setSaving(true);
    try {
      await customFiltersApi.create({ name: form.name, entity_type: form.entityType, owner_id: 'current-user', filters: [] });
      setShowModal(false);
      setForm({ name: '', entityType: 'conversation' });
      refetch();
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  }
  async function del(id: string) {
    if (!confirm('¿Eliminar este filtro?')) return;
    await customFiltersApi.delete(id);
    refetch();
  }

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 p-6 gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1a1a1a]">Filtros personalizados</h1>
            <p className="text-[13px] text-[#6b6b6b] mt-0.5">Guarda vistas filtradas de tus conversaciones, contactos y empresas</p>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium hover:bg-[#333]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M8 3v10M3 8h10"/></svg>
            Nuevo filtro
          </button>
        </div>

        {loading ? (
          <div className="text-[13px] text-[#9a9a98]">Cargando...</div>
        ) : filters.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 text-[#d1d1cc]"><path d="M6 12h36M14 24h20M22 36h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            <p className="text-[14px] font-medium text-[#6b6b6b]">Sin filtros personalizados</p>
            <p className="text-[12px] text-[#9a9a98]">Crea filtros para guardar vistas rápidas de tus datos</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filters.map((f: any) => (
              <div key={f.id} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-[#e9eae6] hover:border-[#d1d1cc] group">
                <div className="w-8 h-8 rounded-lg bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-[#6b6b6b]"><path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#1a1a1a]">{f.name}</div>
                  <div className="text-[11px] text-[#9a9a98]">{ENTITY_LABELS[f.entityType] || f.entityType} · {(f.filters || []).length} condiciones</div>
                </div>
                <button onClick={() => del(f.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[#fee2e2] text-[#ef4444] transition-opacity">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-[420px] p-6 flex flex-col gap-4">
              <h2 className="text-[16px] font-semibold">Nuevo filtro personalizado</h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Nombre del filtro</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Conversaciones urgentes abiertas" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Tipo de entidad</label>
                  <SettingsSelect
                    value={form.entityType}
                    onChange={v => setForm(f => ({ ...f, entityType: v }))}
                    options={[
                      { value: 'conversation', label: 'Conversaciones' },
                      { value: 'contact', label: 'Contactos' },
                      { value: 'company', label: 'Empresas' },
                    ]}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded-lg border border-[#e5e5e2] text-[13px] hover:bg-[#f3f3f1]">Cancelar</button>
                <button onClick={save} disabled={saving || !form.name} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Crear filtro'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EmailTemplatesView ────────────────────────────────────────────────────────
export function EmailTemplatesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: templates = [], loading, refetch } = useApi(() => emailTemplatesApi.list(), []);
  const [selected, setSelected] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', bodyHtml: '', category: 'general' });
  const [saving, setSaving] = useState(false);
  const [previewCtx, setPreviewCtx] = useState('');

  async function save() {
    setSaving(true);
    try {
      const payload = { name: form.name, subject: form.subject, body_html: form.bodyHtml, category: form.category };
      if (selected && showModal) await emailTemplatesApi.update(selected.id, payload);
      else await emailTemplatesApi.create(payload);
      setShowModal(false);
      refetch();
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  }
  async function del(id: string) {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    await emailTemplatesApi.delete(id);
    setSelected(null);
    refetch();
  }

  const variables = selected ? [...(selected.subject || '').matchAll(/\{\{(\w+)\}\}/g), ...(selected.bodyHtml || '').matchAll(/\{\{(\w+)\}\}/g)].map((m: any) => m[1]).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i) : [];

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-1 min-w-0 h-full overflow-hidden">
        {/* List */}
        <div className="w-[280px] flex-shrink-0 flex flex-col h-full border-r border-[#e9eae6] bg-white">
          <div className="flex items-center justify-between p-4 border-b border-[#e9eae6]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Plantillas de email</span>
            <button onClick={() => { setSelected(null); setForm({ name: '', subject: '', bodyHtml: '', category: 'general' }); setShowModal(true); }} className="p-1 rounded-lg hover:bg-[#f3f3f1]">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M8 3v10M3 8h10"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="p-4 text-[13px] text-[#9a9a98]">Cargando...</div> : templates.length === 0 ? (
              <div className="p-4 text-center text-[13px] text-[#9a9a98]">Sin plantillas</div>
            ) : templates.map((t: any) => (
              <button key={t.id} onClick={() => setSelected(t)} className={`w-full text-left p-3 border-b border-[#f3f3f1] hover:bg-[#f8f8f6] ${selected?.id === t.id ? 'bg-[#f3f3f1]' : ''}`}>
                <div className="text-[13px] font-medium text-[#1a1a1a] truncate">{t.name}</div>
                <div className="text-[11px] text-[#9a9a98] mt-0.5 truncate">{t.subject}</div>
                <span className="inline-block mt-1 px-1.5 py-0.5 bg-[#ededea] rounded text-[10px] text-[#6b6b6b]">{t.category || 'general'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 min-w-0 flex flex-col p-6 overflow-y-auto">
          {selected ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-[18px] font-semibold text-[#1a1a1a]">{selected.name}</h2>
                  <p className="text-[12px] text-[#9a9a98] mt-0.5">Asunto: {selected.subject}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setForm({ name: selected.name, subject: selected.subject, bodyHtml: selected.bodyHtml || selected.body_html || '', category: selected.category || 'general' }); setShowModal(true); }} className="px-3 py-1.5 border border-[#e5e5e2] rounded-lg text-[13px] hover:bg-[#f3f3f1]">Editar</button>
                  <button onClick={() => del(selected.id)} className="px-3 py-1.5 border border-[#fee2e2] text-[#ef4444] rounded-lg text-[13px] hover:bg-[#fee2e2]">Eliminar</button>
                </div>
              </div>
              {variables.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-3">
                  {variables.map((v: string) => <span key={v} className="px-2 py-0.5 bg-[#dbeafe] text-[#2563eb] rounded text-[11px] font-mono">{`{{${v}}}`}</span>)}
                </div>
              )}
              <div className="bg-white rounded-xl border border-[#e9eae6] p-5">
                <div className="text-[12px] text-[#9a9a98] mb-2 font-medium">VISTA PREVIA</div>
                <div className="text-[13px] text-[#1a1a1a]" dangerouslySetInnerHTML={{ __html: selected.bodyHtml || selected.body_html || '<em>Sin contenido</em>' }} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 text-[#d1d1cc]"><rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.1"/><path d="M4 16l20 12 20-12" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
              <p className="text-[14px] text-[#6b6b6b]">Selecciona una plantilla para previsualizarla</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-[600px] max-h-[80vh] overflow-y-auto p-6 flex flex-col gap-4">
            <h2 className="text-[16px] font-semibold">{selected && form.name ? 'Editar plantilla' : 'Nueva plantilla de email'}</h2>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Nombre</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre de la plantilla" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Categoría</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="ej. onboarding" list="tpl-categories" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                  <datalist id="tpl-categories"><option value="onboarding"/><option value="soporte"/><option value="marketing"/><option value="facturación"/><option value="general"/></datalist>
                </div>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Asunto</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Asunto del email (usa {{variable}} para variables)" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Cuerpo HTML</label>
                <textarea value={form.bodyHtml} onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))} rows={8} placeholder="<p>Hola {{name}},</p><p>...</p>" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded-lg border border-[#e5e5e2] text-[13px] hover:bg-[#f3f3f1]">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.subject || !form.bodyHtml} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CustomRolesView ───────────────────────────────────────────────────────────
export function CustomRolesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  // Uses iamApi.roles() — the real /iam/roles endpoint — instead of the phantom /custom-roles route.
  const { data: rolesRaw, loading, refetch } = useApi(() => iamApi.roles(), [], []);
  const roles: any[] = Array.isArray(rolesRaw) ? rolesRaw : [];

  // Permission catalog from API (falls back to static list if unavailable)
  const { data: catalogRaw } = useApi(() => iamApi.permissionsCatalog(), [], []);
  const catalog: any[] = Array.isArray(catalogRaw) ? catalogRaw : [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState<any>(null);
  const [form, setForm]           = useState({ name: '', description: '', permissions: [] as string[] });
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  // Build grouped permissions: prefer catalog, fall back to static list
  const ALL_PERMISSIONS = catalog.length > 0
    ? Object.entries(
        catalog.reduce((acc: any, p: any) => {
          const group = p.group || p.category || 'General';
          if (!acc[group]) acc[group] = [];
          acc[group].push(p.key || p.id || String(p));
          return acc;
        }, {})
      ).map(([group, perms]) => ({ group, perms: perms as string[] }))
    : [
        { group: 'Conversaciones', perms: ['conversations:read', 'conversations:write', 'conversations:assign', 'conversations:close', 'conversations:delete'] },
        { group: 'Contactos',      perms: ['contacts:read', 'contacts:write', 'contacts:delete', 'contacts:export'] },
        { group: 'Empresas',       perms: ['companies:read', 'companies:write'] },
        { group: 'Informes',       perms: ['reports:read', 'reports:export'] },
        { group: 'Ajustes',        perms: ['settings:read', 'settings:write'] },
        { group: 'Compañeros',     perms: ['teammates:read', 'teammates:invite', 'teammates:manage'] },
        { group: 'Canales',        perms: ['channels:read', 'channels:write'] },
        { group: 'IA',             perms: ['ai:read', 'ai:configure', 'ai:train'] },
      ];

  function togglePerm(p: string) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter(x => x !== p) : [...f.permissions, p],
    }));
  }
  function openCreate() { setEditing(null); setForm({ name: '', description: '', permissions: [] }); setShowModal(true); }
  function openEdit(r: any) {
    setEditing(r);
    setForm({ name: r.name || '', description: r.description || '', permissions: r.permissions || [] });
    setShowModal(true);
  }
  async function save() {
    if (!form.name.trim()) { showToast('El nombre es obligatorio.', false); return; }
    setSaving(true);
    try {
      if (editing) {
        await iamApi.updateRole(editing.id, { name: form.name, permissions: form.permissions });
        showToast('Rol actualizado.');
      } else {
        await iamApi.createRole({ name: form.name, permissions: form.permissions });
        showToast('Rol creado correctamente.');
      }
      setShowModal(false);
      refetch();
    } catch (e: any) {
      showToast(e?.message ?? 'Error al guardar el rol.', false);
    } finally { setSaving(false); }
  }
  async function del(id: string, name: string) {
    if (!window.confirm(`¿Eliminar el rol "${name}"? Los compañeros con este rol perderán sus permisos personalizados.`)) return;
    try {
      await iamApi.deleteRole(id, name);
      refetch();
      showToast('Rol eliminado.');
    } catch {
      showToast('Error al eliminar el rol.', false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="max-w-[700px] mx-auto py-10 px-6 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-[22px] font-bold text-[#1a1a1a]">Roles personalizados</h1>
                  <p className="text-[13px] text-[#646462] mt-0.5">Crea y gestiona permisos para los compañeros de equipo.</p>
                </div>
                <div className="flex items-center gap-3">
                  {toast && <span className={`text-[13px] font-medium ${toast.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{toast.ok ? '✓' : '✕'} {toast.msg}</span>}
                  <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium hover:bg-[#333]">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M8 3v10M3 8h10"/></svg>
                    Nuevo rol
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-5 h-5 border-2 border-[#e9eae6] border-t-[#1a1a1a] rounded-full animate-spin"/>
                </div>
              ) : roles.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center border border-dashed border-[#e9eae6] rounded-xl">
                  <svg viewBox="0 0 24 24" className="w-10 h-10 fill-none stroke-[#d4d4d2]" strokeWidth="1.3"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M18 3l2 2-6 6h-2v-2z"/></svg>
                  <p className="text-[14px] font-medium text-[#646462]">Sin roles aún</p>
                  <p className="text-[12px] text-[#a4a4a2] max-w-[280px]">Los roles del sistema se gestionan automáticamente. Crea roles personalizados para permisos específicos.</p>
                  <button onClick={openCreate} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium hover:bg-[#333]">Crear primer rol</button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {roles.map((r: any) => (
                    <div key={r.id} className={`p-4 bg-white rounded-xl border border-[#e9eae6] group hover:border-[#d4d4d2] transition-colors ${r.isSystem || r.is_system ? 'opacity-75' : ''}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M8 1a3 3 0 100 6A3 3 0 008 1zm-5 9a5 5 0 0110 0v1H3v-1z"/></svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-semibold text-[#1a1a1a]">{r.name}</span>
                              {(r.isSystem || r.is_system) && <span className="px-1.5 py-0.5 bg-[#f3f3f1] rounded text-[10px] text-[#9a9a98] font-medium">Sistema</span>}
                            </div>
                            {r.description && <p className="text-[12px] text-[#9a9a98] mt-0.5">{r.description}</p>}
                          </div>
                        </div>
                        {!(r.isSystem || r.is_system) && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-[#f3f3f1] text-[#6b6b6b]" title="Editar">
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z"/></svg>
                            </button>
                            <button onClick={() => del(r.id, r.name)} className="p-1.5 rounded-lg hover:bg-[#fee2e2] text-[#ef4444]" title="Eliminar">
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5"/></svg>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-11">
                        {(r.permissions || []).length === 0 ? (
                          <span className="text-[12px] text-[#a4a4a2] italic">Sin permisos específicos</span>
                        ) : (r.permissions || []).slice(0, 10).map((p: string) => (
                          <span key={p} className="px-2 py-0.5 bg-[#f3f3f1] rounded-full text-[11px] text-[#6b6b6b]">{p}</span>
                        ))}
                        {(r.permissions || []).length > 10 && <span className="px-2 py-0.5 bg-[#f3f3f1] rounded-full text-[11px] text-[#9a9a98]">+{r.permissions.length - 10} más</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-[580px] max-h-[85vh] overflow-y-auto p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-[16px] font-bold text-[#1a1a1a]">{editing ? 'Editar rol' : 'Nuevo rol personalizado'}</h2>
              <p className="text-[13px] text-[#646462] mt-0.5">Los cambios se aplican inmediatamente a los compañeros con este rol.</p>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[12px] font-medium text-[#646462] mb-1 block">Nombre del rol *</label>
                <input
                  autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Soporte Senior, Agente de Ventas…"
                  className="w-full px-3 py-2 rounded-lg border border-[#e9eae6] text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-[#646462] mb-1 block">Descripción (opcional)</label>
                <input
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descripción breve del rol"
                  className="w-full px-3 py-2 rounded-lg border border-[#e9eae6] text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-medium text-[#646462]">Permisos</label>
                  <span className="text-[11px] text-[#a4a4a2]">{form.permissions.length} seleccionado{form.permissions.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="border border-[#e9eae6] rounded-xl overflow-hidden divide-y divide-[#f3f3f1]">
                  {ALL_PERMISSIONS.map(g => (
                    <div key={g.group} className="p-3">
                      <div className="text-[10px] font-bold text-[#9a9a98] uppercase tracking-wider mb-2">{g.group}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.perms.map(p => (
                          <button key={p} onClick={() => togglePerm(p)}
                            className={`px-2.5 py-1 rounded-lg text-[12px] border transition-all ${form.permissions.includes(p) ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#646462] border-[#e9eae6] hover:border-[#1a1a1a]'}`}
                          >
                            {p.includes(':') ? p.split(':')[1] : p}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1 border-t border-[#f3f3f1]">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded-lg border border-[#e9eae6] text-[13px] hover:bg-[#f3f3f1]">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium hover:bg-[#333] disabled:opacity-50">
                {saving ? 'Guardando…' : editing ? 'Actualizar rol' : 'Crear rol'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AiFeedbackView ────────────────────────────────────────────────────────────
export function AiFeedbackView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: items = [], loading } = useApi(() => aiFeedbackApi.list({ limit: 50 }), []);
  const [filter, setFilter] = useState<string>('all');

  const FEEDBACK_TYPES = ['thumbs_up', 'thumbs_down', 'correction', 'flagged', 'escalated'];
  const LABELS: Record<string, string> = { thumbs_up: '👍 Positivo', thumbs_down: '👎 Negativo', correction: '✏️ Corrección', flagged: '🚩 Reportado', escalated: '⬆️ Escalado', all: 'Todos' };
  const COLORS: Record<string, string> = { thumbs_up: 'bg-[#dcfce7] text-[#166534]', thumbs_down: 'bg-[#fee2e2] text-[#991b1b]', correction: 'bg-[#fef3c7] text-[#92400e]', flagged: 'bg-[#fee2e2] text-[#991b1b]', escalated: 'bg-[#ede9fe] text-[#5b21b6]' };

  const filtered = filter === 'all' ? items : items.filter((i: any) => i.feedbackType === filter);

  const stats = FEEDBACK_TYPES.reduce((acc, t) => {
    acc[t] = items.filter((i: any) => i.feedbackType === t).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 p-6 gap-4 overflow-y-auto">
        <div>
          <h1 className="text-[20px] font-semibold text-[#1a1a1a]">Feedback de IA</h1>
          <p className="text-[13px] text-[#6b6b6b] mt-0.5">Revisión de valoraciones sobre las respuestas de la IA</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {FEEDBACK_TYPES.map(t => (
            <div key={t} className="bg-white rounded-xl border border-[#e9eae6] p-3 text-center">
              <div className="text-[22px] font-bold text-[#1a1a1a]">{stats[t] || 0}</div>
              <div className="text-[11px] text-[#9a9a98] mt-0.5">{LABELS[t]}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {['all', ...FEEDBACK_TYPES].map(t => (
            <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${filter === t ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-[#e5e5e2] text-[#6b6b6b] hover:border-[#1a1a1a]'}`}>
              {LABELS[t]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-[13px] text-[#9a9a98]">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-[14px] text-[#6b6b6b]">Sin registros de feedback</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item: any) => (
              <div key={item.id} className="flex items-start gap-3 p-4 bg-white rounded-xl border border-[#e9eae6]">
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${COLORS[item.feedbackType] || 'bg-[#f3f3f1] text-[#6b6b6b]'}`}>{LABELS[item.feedbackType] || item.feedbackType}</span>
                <div className="flex-1 min-w-0">
                  {item.feedbackText && <p className="text-[13px] text-[#1a1a1a] mb-1">{item.feedbackText}</p>}
                  {item.originalOutput && <p className="text-[12px] text-[#6b6b6b] line-clamp-2">Respuesta IA: {item.originalOutput}</p>}
                </div>
                <span className="text-[11px] text-[#9a9a98] flex-shrink-0">{new Date(item.createdAt).toLocaleDateString('es-ES')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CallsLiveView ─────────────────────────────────────────────────────────────
export function CallsLiveView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: stats } = useApi(() => callsApi.stats(), []);
  const { data: calls = [], loading, refetch } = useApi(() => callsApi.list({ limit: '100' }), []);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dirFilter, setDirFilter] = useState<string>('all');

  const STATUS_LABELS: Record<string, string> = { initiated: 'Iniciada', ringing: 'Sonando', in_progress: 'En curso', completed: 'Completada', missed: 'Perdida', voicemail: 'Buzón', failed: 'Fallida' };
  const STATUS_COLORS: Record<string, string> = { initiated: 'bg-[#dbeafe] text-[#2563eb]', ringing: 'bg-[#fef9c3] text-[#854d0e]', in_progress: 'bg-[#dcfce7] text-[#166534]', completed: 'bg-[#f3f4f6] text-[#374151]', missed: 'bg-[#fee2e2] text-[#991b1b]', voicemail: 'bg-[#ede9fe] text-[#5b21b6]', failed: 'bg-[#fee2e2] text-[#991b1b]' };

  const filtered = calls.filter((c: any) =>
    (statusFilter === 'all' || c.status === statusFilter) &&
    (dirFilter === 'all' || c.direction === dirFilter)
  );

  const kpis = [
    { label: 'Total llamadas', value: stats?.total ?? calls.length },
    { label: 'Completadas', value: stats?.completed ?? calls.filter((c: any) => c.status === 'completed').length },
    { label: 'Perdidas', value: stats?.missed ?? calls.filter((c: any) => c.status === 'missed').length },
    { label: 'Duración media', value: stats?.avgDurationS ? `${Math.round(stats.avgDurationS / 60)}m` : '—' },
  ];

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 p-6 gap-4 overflow-y-auto">
        <div>
          <h1 className="text-[20px] font-semibold text-[#1a1a1a]">Llamadas</h1>
          <p className="text-[13px] text-[#6b6b6b] mt-0.5">Registro de llamadas entrantes y salientes</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-[#e9eae6] p-4">
              <div className="text-[24px] font-bold text-[#1a1a1a]">{k.value ?? '—'}</div>
              <div className="text-[12px] text-[#9a9a98] mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <div className="flex gap-1.5">
            {['all', 'inbound', 'outbound'].map(d => (
              <button key={d} onClick={() => setDirFilter(d)} className={`px-3 py-1 rounded-full text-[12px] font-medium ${dirFilter === d ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-[#e5e5e2] text-[#6b6b6b]'}`}>
                {d === 'all' ? 'Todas' : d === 'inbound' ? '↙ Entrante' : '↗ Saliente'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'completed', 'missed', 'in_progress'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-full text-[12px] font-medium ${statusFilter === s ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-[#e5e5e2] text-[#6b6b6b]'}`}>
                {s === 'all' ? 'Todos' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-[13px] text-[#9a9a98]">Cargando llamadas...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <svg viewBox="0 0 48 48" fill="none" className="w-12 h-12 text-[#d1d1cc]"><path d="M9 6h9l4.5 10.5L18 20a27 27 0 0012 12l3.5-4.5L45 32v9A3 3 0 0142 44 39 39 0 013 6a3 3 0 016 0z" stroke="currentColor" strokeWidth="2" fill="currentColor" opacity="0.15"/></svg>
            <p className="text-[14px] text-[#6b6b6b]">Sin llamadas registradas</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#e9eae6]">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] flex-shrink-0 ${c.direction === 'inbound' ? 'bg-[#dbeafe] text-[#2563eb]' : 'bg-[#dcfce7] text-[#166534]'}`}>
                  {c.direction === 'inbound' ? '↙' : '↗'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#1a1a1a]">{c.fromNumber || '—'}</span>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 text-[#9a9a98]"><path d="M4 8h8"/></svg>
                    <span className="text-[13px] text-[#6b6b6b]">{c.toNumber || '—'}</span>
                  </div>
                  {c.provider && <div className="text-[11px] text-[#9a9a98]">{c.provider}</div>}
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[c.status] || 'bg-[#f3f3f1] text-[#6b6b6b]'}`}>{STATUS_LABELS[c.status] || c.status}</span>
                {c.durationSecs && <span className="text-[12px] text-[#9a9a98]">{Math.floor(c.durationSecs / 60)}:{String(c.durationSecs % 60).padStart(2, '0')}</span>}
                <span className="text-[11px] text-[#9a9a98]">{c.startedAt ? new Date(c.startedAt).toLocaleDateString('es-ES') : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── McpServersView ────────────────────────────────────────────────────────────
export function McpServersView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { data: servers = [], loading, refetch } = useApi(() => mcpServersApi.list(), []);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', url: '', description: '', authType: 'none' as string });
  const [saving, setSaving] = useState(false);

  function openCreate() { setEditing(null); setForm({ name: '', url: '', description: '', authType: 'none' }); setShowModal(true); }
  function openEdit(s: any) { setEditing(s); setForm({ name: s.name || '', url: s.url || '', description: s.description || '', authType: s.authType || 'none' }); setShowModal(true); }
  async function save() {
    setSaving(true);
    try {
      if (editing) await mcpServersApi.update(editing.id, form);
      else await mcpServersApi.create(form);
      setShowModal(false);
      refetch();
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  }
  async function del(id: string) {
    if (!confirm('¿Eliminar este servidor MCP?')) return;
    await mcpServersApi.delete(id);
    refetch();
  }

  const STATUS_COLOR: Record<string, string> = { active: 'bg-[#dcfce7] text-[#166534]', inactive: 'bg-[#f3f4f6] text-[#6b7280]', error: 'bg-[#fee2e2] text-[#991b1b]' };

  return (
    <div className="flex flex-1 min-w-0 h-full">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 p-6 gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1a1a1a]">Servidores MCP</h1>
            <p className="text-[13px] text-[#6b6b6b] mt-0.5">Model Context Protocol — conecta herramientas externas con tu agente de IA</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium hover:bg-[#333]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M8 3v10M3 8h10"/></svg>
            Añadir servidor
          </button>
        </div>

        {loading ? (
          <div className="text-[13px] text-[#9a9a98]">Cargando...</div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#f3f3f1] flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-[#9a9a98]"><rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="7" cy="12" r="1.5" fill="currentColor"/><circle cx="17" cy="12" r="1.5" fill="currentColor"/><path d="M10 12h4"/></svg>
            </div>
            <p className="text-[14px] font-medium text-[#6b6b6b]">Sin servidores MCP</p>
            <p className="text-[12px] text-[#9a9a98]">Conecta servidores MCP para ampliar las capacidades de tu agente</p>
            <button onClick={openCreate} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium">Añadir primer servidor</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {servers.map((s: any) => (
              <div key={s.id} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-[#e9eae6] hover:border-[#d1d1cc] group">
                <div className="w-9 h-9 rounded-xl bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-[#6b6b6b]"><rect x="1" y="3" width="14" height="10" rx="2" opacity="0.35"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><path d="M6.5 8h3" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[#1a1a1a]">{s.name}</div>
                  <div className="text-[12px] text-[#9a9a98] truncate">{s.url}</div>
                  {s.description && <div className="text-[11px] text-[#b0b0ae] mt-0.5">{s.description}</div>}
                </div>
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 ${STATUS_COLOR[s.status] || 'bg-[#f3f4f6] text-[#6b7280]'}`}>{s.status || 'inactivo'}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-[#f3f3f1] text-[#6b6b6b]"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5z"/></svg></button>
                  <button onClick={() => del(s.id)} className="p-1.5 rounded-lg hover:bg-[#fee2e2] text-[#ef4444]"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3.5 h-3.5"><path d="M3 5h10M6 5V3h4v2M5 5l.5 8h5L11 5"/></svg></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-[480px] p-6 flex flex-col gap-4">
              <h2 className="text-[16px] font-semibold">{editing ? 'Editar servidor MCP' : 'Añadir servidor MCP'}</h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Nombre</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: GitHub MCP" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">URL del servidor</label>
                  <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://mcp.example.com/sse" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Descripción</label>
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción opcional" className="w-full px-3 py-2 rounded-lg border border-[#e5e5e2] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/10"/>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#6b6b6b] mb-1 block">Autenticación</label>
                  <SettingsSelect
                    value={form.authType}
                    onChange={v => setForm(f => ({ ...f, authType: v }))}
                    options={[
                      { value: 'none', label: 'Sin autenticación' },
                      { value: 'bearer', label: 'Bearer token' },
                      { value: 'api_key', label: 'API Key' },
                      { value: 'oauth2', label: 'OAuth 2.0' },
                    ]}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded-lg border border-[#e5e5e2] text-[13px] hover:bg-[#f3f3f1]">Cancelar</button>
                <button onClick={save} disabled={saving || !form.name || !form.url} className="px-4 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[13px] font-medium disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
