// ─────────────────────────────────────────────────────────────────────────────
// Channel settings views (Messenger, Email, Phone, WhatsApp, …)
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { FIGMA_CDN, IMG_CHANNELS_ALL, IMG_DISCORD_ILLO, IMG_EMAIL_BANNER, IMG_PHONE_VIDEO, IMG_WHATSAPP_BANNER, IMG_WHATSAPP_TRANS } from '../assets';
import { SettingsSidebar, TrialBanner } from '../sharedUi';
import type { View } from '../types';

const LOGO_MESSENGER_BG = `${FIGMA_CDN}/b0d81969-747c-4440-8aa9-aa5031692d5a`;
const LOGO_MESSENGER_FG = `${FIGMA_CDN}/0165b2fd-57db-43b2-9d5c-cfd2304b5304`;
const LOGO_EMAIL_BG     = `${FIGMA_CDN}/fcc5708c-0d76-4080-af5a-55fd9138bb09`;
const LOGO_EMAIL_FG     = `${FIGMA_CDN}/d586edd5-2c02-4f92-a463-8bac9e93db05`;
const LOGO_PHONE_BG     = `${FIGMA_CDN}/06f83fba-1298-49e4-99f1-9661af5f5730`;
const LOGO_PHONE_FG     = `${FIGMA_CDN}/8f27f4fc-9202-418f-a52f-3ca37a9a47c4`;
const LOGO_WHATSAPP_BG  = `${FIGMA_CDN}/be15355f-4a62-4f45-bebc-2b05cb59a292`;
const LOGO_WHATSAPP_FG  = `${FIGMA_CDN}/e0ce755b-8837-44c2-bc88-eacd7dcfdddd`;
const LOGO_INSTAGRAM_BG = `${FIGMA_CDN}/b5b4cea0-56e9-4e29-81b8-0c0065546e44`;
const LOGO_INSTAGRAM_FG = `${FIGMA_CDN}/ee4ca515-4763-4198-8a62-cbc6037cf207`;
const LOGO_FACEBOOK_BG  = `${FIGMA_CDN}/6cbcec48-06dc-4d2b-9c56-ae138012031d`;
const LOGO_FACEBOOK_FG  = `${FIGMA_CDN}/e748c75a-b32e-4e8c-ae61-e328adec6ffa`;
const LOGO_SMS_BG       = `${FIGMA_CDN}/67ffe9c8-5098-457e-b43d-30a83fb355a8`;
const LOGO_SMS_FG1      = `${FIGMA_CDN}/dcdb4bd0-9526-4597-b976-ec0ec4b2c3fe`;
const LOGO_SMS_FG2      = `${FIGMA_CDN}/4b3630c8-3fe6-45dd-99e8-67e3e943bbdd`;
const LOGO_SWITCH_BG    = `${FIGMA_CDN}/dfc422c2-01f7-4134-8d7d-5badccab6be3`;
const LOGO_SWITCH_FG1   = `${FIGMA_CDN}/03eeaa29-5ebe-4caa-a956-d979983a1155`;
const LOGO_SWITCH_FG2   = `${FIGMA_CDN}/3716abaf-18ae-4bc7-bc8f-bad0938a8348`;
// Slack logo — 14 SVG composition (multi-color hash logo from 1:67260)
const LOGO_SLACK_V0  = `${FIGMA_CDN}/6b9335b8-ffac-4d3f-8cf5-e0ef88d43356`;
const LOGO_SLACK_V1  = `${FIGMA_CDN}/f77c3052-7932-4a46-81e9-1b6e1e0b638f`;
const LOGO_SLACK_F   = `${FIGMA_CDN}/0f22b121-ccf7-486d-b8f7-102c0980dcf6`;
const LOGO_SLACK_F1  = `${FIGMA_CDN}/197ef1d6-ef8b-40cf-81c8-1ee660a65ec2`;
const LOGO_SLACK_F2  = `${FIGMA_CDN}/131dd917-5bdc-4405-b7e9-daff51023f6f`;
const LOGO_SLACK_V2  = `${FIGMA_CDN}/c4e50346-37b4-4cef-aa7d-d6cdf0ca1bc1`;
const LOGO_SLACK_V3  = `${FIGMA_CDN}/2594f183-8da1-4118-a51a-a4a351be2e28`;
const LOGO_SLACK_V4  = `${FIGMA_CDN}/fa0bcfe1-3e99-4bb0-8f89-165598a16fad`;
const LOGO_SLACK_V5  = `${FIGMA_CDN}/57a1d09d-2d63-4bad-9187-096e7a62a326`;
const LOGO_SLACK_V6  = `${FIGMA_CDN}/dc3820f8-5d7a-4f1c-b463-002d316fd58c`;
const LOGO_SLACK_V7  = `${FIGMA_CDN}/fd5ce4bc-86cb-412b-b3f1-69bfb705196b`;
const LOGO_SLACK_H   = `${FIGMA_CDN}/ae7843c2-f654-4caf-a2c5-4ebf4124d4b4`;
const LOGO_SLACK_H1  = `${FIGMA_CDN}/ca4313c4-3a66-42e9-b4e7-581608936109`;
const LOGO_SLACK_V8  = `${FIGMA_CDN}/47c5f12e-c79b-432b-8310-bdb1bd6f858f`;


// ── MessengerView (1-48766 + 1-50442 + 1-52109) ───────────────────────────────

export function MessengerView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'widget' | 'destacado' | 'sdk' | 'conversaciones' | 'general' | 'instalar' | 'seguridad'>('widget');
  const [subTab, setSubTab] = useState<'contenido' | 'apariencia'>('contenido');
  const [audience, setAudience] = useState<'visitantes' | 'todos' | 'audiencia' | 'nadie'>('nadie');
  const tabs = [
    { id: 'widget'         as const, label: 'Widget' },
    { id: 'destacado'      as const, label: 'Destacado' },
    { id: 'sdk'            as const, label: 'SDK de dispositivo móvil' },
    { id: 'conversaciones' as const, label: 'Conversaciones' },
    { id: 'general'        as const, label: 'General' },
    { id: 'instalar'       as const, label: 'Instalar' },
    { id: 'seguridad'      as const, label: 'Seguridad' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Messenger</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              <button className="bg-[#157c3c] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#0f5e2d] flex items-center gap-1.5">
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-white"><path d="M3 2l11 6-11 6V2z"/></svg>
                Guardar y establecer en vivo
              </button>
            </div>
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
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left configuration panel */}
            <div className="flex-1 overflow-y-auto p-6 border-r border-[#e9eae6]">
              {(tab === 'widget' || tab === 'sdk') && (
                <div className="bg-[#f3f3f1] rounded-full p-1 inline-flex mb-4">
                  {(['contenido', 'apariencia'] as const).map(id => (
                    <button key={id} onClick={() => setSubTab(id)}
                      className={`px-6 py-1.5 rounded-full text-[13px] font-medium ${
                        subTab === id ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#646462]'
                      }`}>
                      {id === 'contenido' ? 'Contenido' : 'Apariencia'}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'widget' && (
                <div className="flex flex-col gap-2">
                  {['Espacios de trabajo', 'Iniciar directamente en la conversación', 'Mostrar el lanzador de Messenger'].map(s => (
                    <button key={s} className="flex items-center justify-between w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 hover:bg-[#fafaf9]">
                      <span className="text-[14px] font-medium text-[#1a1a1a]">{s}</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4-4 4"/></svg>
                    </button>
                  ))}
                </div>
              )}

              {tab === 'destacado' && (
                <div className="flex flex-col gap-2 -mt-4">
                  {/* Audiencia (open) */}
                  <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#e9eae6]">
                      <span className="text-[14px] font-semibold text-[#1a1a1a]">Audiencia</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                    </div>
                    <div className="p-5">
                      <p className="text-[13px] text-[#646462] mb-4">Elija quién puede ver Spotlight Messenger. Para esa audiencia, reemplaza al Messenger clásico. Por defecto, se vuelve visible para todos los visitantes y clientes potenciales una vez que se implemente Fin for Sales.</p>
                      <div className="flex flex-col gap-2">
                        {[
                          { id: 'visitantes', label: 'Visitantes y leads', desc: 'Todos los visitantes y clientes potenciales de su sitio web, una vez que Fin for Sales esté implementado.', badge: 'Predeterminado' },
                          { id: 'todos', label: 'Todos', desc: 'Todos los visitantes, prospectos y usuarios registrados.' },
                          { id: 'audiencia', label: 'Audiencia específica', desc: 'Defina su propia segmentación.' },
                          { id: 'nadie', label: 'Nadie', desc: 'Desactive Spotlight Messenger.' },
                        ].map(opt => (
                          <button key={opt.id} onClick={() => setAudience(opt.id as typeof audience)}
                            className={`flex items-start gap-3 px-4 py-3 rounded-[8px] border text-left ${
                              audience === opt.id ? 'border-[#3b59f6] bg-[#f5f7ff]' : 'border-[#e9eae6] hover:bg-[#fafaf9]'
                            }`}>
                            <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                              audience === opt.id ? 'border-[#3b59f6]' : 'border-[#ccc]'
                            }`}>
                              {audience === opt.id && <div className="w-2 h-2 rounded-full bg-[#3b59f6] m-0.5"/>}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-[13px] font-medium text-[#1a1a1a]">{opt.label}</p>
                                {opt.badge && <span className="bg-[#e0e7ff] text-[#4338ca] rounded-full px-2 py-0.5 text-[11px] font-medium">{opt.badge}</span>}
                              </div>
                              <p className="text-[12px] text-[#646462] mt-0.5">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {['Apariencia', 'Sugerencias inteligentes'].map(s => (
                    <button key={s} className="flex items-center justify-between w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 hover:bg-[#fafaf9]">
                      <span className="text-[14px] font-semibold text-[#1a1a1a]">{s}{s === 'Sugerencias inteligentes' && <span className="ml-2 bg-[#e0e7ff] text-[#4338ca] rounded-full px-2 py-0.5 text-[11px]">Beta</span>}</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4 4-4"/></svg>
                    </button>
                  ))}
                </div>
              )}

              {tab === 'sdk' && (
                <div className="flex flex-col gap-2">
                  <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#e9eae6]">
                      <span className="text-[14px] font-semibold text-[#1a1a1a]">Espacios de trabajo</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                    </div>
                    <div className="p-5">
                      <p className="text-[13px] font-medium text-[#1a1a1a] mb-3">Espacios de trabajo</p>
                      <div className="border border-[#e9eae6] rounded-[8px] px-4 py-3 flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-[#1a1a1a] rounded-[6px] flex items-center justify-center">💬</div>
                        <div><p className="text-[13px] font-medium text-[#1a1a1a]">Mensajes</p><p className="text-[11px] text-[#646462]">Un Inbox para conversaciones y tickets</p></div>
                      </div>
                      <button className="text-[13px] text-[#fa7938] font-medium">+ Añadir espacio</button>
                    </div>
                  </div>
                  {['Iniciar directamente en la conversación', 'Configura tu mensaje de bienvenida', 'Personaliza Inicio con aplicaciones'].map(s => (
                    <button key={s} className="flex items-center justify-between w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 hover:bg-[#fafaf9]">
                      <span className="text-[14px] font-medium text-[#1a1a1a]">{s}</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4 4-4"/></svg>
                    </button>
                  ))}
                </div>
              )}

              {(tab === 'conversaciones' || tab === 'general' || tab === 'instalar' || tab === 'seguridad') && (
                <p className="text-[13px] text-[#646462]">Configuración de {tabs.find(t => t.id === tab)?.label.toLowerCase()} (próximamente).</p>
              )}
            </div>

            {/* Right preview panel */}
            <div className="w-[400px] flex-shrink-0 flex flex-col bg-[#fafaf9] overflow-y-auto">
              {/* Top toolbar */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-[#e9eae6]">
                <button className="flex items-center gap-1 text-[13px] text-[#1a1a1a]">
                  {tab === 'destacado' ? '— Predeterminado' : <>▶ Conversación <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></>}
                </button>
                <div className="flex items-center gap-1">
                  {tab === 'destacado' ? (
                    <>
                      <button className="px-2 py-1 text-[12px] text-[#646462] flex items-center gap-1">⛶ Participó</button>
                      <button className="px-2 py-1 text-[12px] text-[#646462] flex items-center gap-1">▦ Conversación</button>
                    </>
                  ) : (
                    <>
                      {tab === 'sdk' ? (
                        <>
                          <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M8 0L2 4v8l6 4 6-4V4L8 0z"/></svg></button>
                          <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><circle cx="8" cy="8" r="3"/></svg></button>
                        </>
                      ) : (
                        <>
                          <button className="px-2 py-1 text-[12px] text-[#646462] rounded hover:bg-[#f3f3f1]">Visitantes</button>
                          <button className="px-2 py-1 text-[12px] text-[#646462] rounded hover:bg-[#f3f3f1]">Usuarios</button>
                        </>
                      )}
                      <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]">☀</button>
                      <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]">🌙</button>
                    </>
                  )}
                </div>
              </div>
              {/* Warning install card */}
              <div className="m-4 bg-[#fef3c7] border border-[#fde68a] rounded-[10px] p-4">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-[#000]">⚠</span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1a1a1a]">{tab === 'sdk' ? 'No has instalado el SDK de Intercom para iOS' : 'Aún no has instalado el Messenger para visitantes'}</p>
                    <p className="text-[12px] text-[#646462] mt-1">Con nuestros ejemplos e integraciones sin código, solo te tomará unos minutos</p>
                  </div>
                </div>
                <button className="bg-[#1a1a1a] text-white rounded-full px-3 py-1.5 text-[12px] font-medium mt-2">{tab === 'sdk' ? 'Instalar el SDK de Intercom' : 'Instalar Messenger'}</button>
              </div>
              {/* Mini preview */}
              {tab !== 'destacado' && tab !== 'sdk' && (
                <div className="m-4 bg-white border border-[#e9eae6] rounded-[12px] overflow-hidden shadow-sm">
                  <div className="px-3 py-2 border-b border-[#e9eae6] flex items-center gap-2">
                    <button className="w-6 h-6 flex items-center justify-center hover:bg-[#f3f3f1] rounded">‹</button>
                    <div className="w-7 h-7 bg-[#1a1a1a] rounded-full flex items-center justify-center text-white text-[11px]">H</div>
                    <div className="flex-1"><p className="text-[12px] font-semibold text-[#1a1a1a]">Acme</p><p className="text-[10px] text-[#646462]">⏱ As soon as we can</p></div>
                  </div>
                  <div className="px-3 py-3 text-[11px] text-[#1a1a1a]">Ask us anything, or share your feedback.</div>
                </div>
              )}
              {tab === 'destacado' && (
                <div className="mx-4 mt-auto mb-4">
                  <div className="border border-[#e9eae6] rounded-full px-4 py-2 flex items-center bg-white">
                    <input className="flex-1 text-[12px] outline-none" placeholder="Escribe un mensaje..." />
                    <button>↑</button>
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

// ── EmailView (1-53459) ───────────────────────────────────────────────────────

export function EmailView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'dominios' | 'ajustes'>('dominios');
  const tabs = [
    { id: 'dominios' as const, label: 'Dominios y direcciones' },
    { id: 'ajustes'  as const, label: 'Ajustes de correo electrónico' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Correo electrónico</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
            </button>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {tab === 'dominios' && <>
              {/* Promo card with banner */}
              <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                </button>
                <div className="flex-1 max-w-[500px]">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2 leading-[20px]">Brinda asistencia a los clientes por correo electrónico, directamente desde tu Inbox</h2>
                  <p className="text-[13px] text-[#646462] mb-4">Usa el correo electrónico para administrar las conversaciones de los clientes junto con otros canales en el Inbox. Configura respuestas automáticas con Fin AI Agent y usa canales salientes para programar mensajes por segmento.</p>
                  <div className="flex items-center gap-4">
                    <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="2" y="4" width="12" height="9" rx="1.5"/></svg>Conectar al correo</button>
                    <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M8 2L2 6l6 4 6-4-6-4z"/></svg>Implementa Fin AI Agent por correo electrónico</button>
                  </div>
                </div>
                <img src={IMG_EMAIL_BANNER} alt="Email preview" className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:53419" />
              </div>
              {/* Setup card */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Comenzar la configuración del correo electrónico</h3>
                <p className="text-[13px] text-[#646462] mb-4">Agrega la dirección de correo electrónico que deseas usar con Intercom. Generalmente es el correo electrónico que utilizas para comunicarte con tus clientes. Después de agregar tu dirección de correo electrónico, te guiaremos a través del resto de la configuración. <a href="#" className="text-[#3b59f6] underline">Más información sobre dominios y direcciones de correo electrónico</a>.</p>
                <input placeholder="Dirección de correo electrónico" className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] w-[300px] focus:outline-none focus:border-[#3b59f6]" />
              </div>
            </>}
            {tab === 'ajustes' && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Dirección de correo electrónico del espacio de trabajo</h3>
                  <p className="text-[13px] text-[#646462] mb-3">Esta es la dirección de trabajo que se utiliza desde el espacio de trabajo. Las respuestas a los correos automáticos enviados desde tus aplicaciones de mensajería se desviarán hacia ella, junto con las solicitudes de los clientes que no estén dirigidas a una dirección específica.</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value="b6gvpvyn-d8d7e93dd9ab@incoming.intercom-mail.com" className="flex-1 max-w-[500px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] bg-[#fafaf9] text-[#646462]" />
                    <button className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] hover:bg-[#f3f3f1]">📋</button>
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Respuestas</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Detectar clientes en correos electrónicos', desc: 'Cuando un compañero de equipo escribe directamente al correo electrónico de un cliente, lo conectamos automáticamente con el perfil de ese cliente para que toda su comunicación quede registrada en un solo lugar.' },
                      { title: 'Conversaciones divididas entre contactos', desc: 'Cuando dos clientes están conectados a la misma conversación, el correo electrónico se redirige automáticamente al cliente activo para mantener la comunicación organizada.' },
                      { title: 'Direcciones generales', desc: 'Permite crear direcciones de correo electrónico genéricas para tu espacio de trabajo y enrutar las conversaciones recibidas en ellas como conversaciones nuevas.' },
                      { title: 'Notificaciones de contacto', desc: 'Las notificaciones permiten recibir actualizaciones sobre eventos relevantes en tu cuenta de Intercom.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Firmas y plantillas</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Firmas de correo electrónico', desc: 'Crea y administra firmas de correo electrónico para los compañeros de equipo y para todo el espacio de trabajo.' },
                      { title: 'Plantillas de correo electrónico para notificaciones', desc: 'Personaliza las plantillas de correo electrónico que reciben los clientes y compañeros de equipo cuando se envían notificaciones.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Notificaciones</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Notificaciones de seguridad de entrega', desc: 'Comunica con los compañeros de equipo cuando hay entregas de correos electrónicos rebotados o no entregados.' },
                      { title: 'Notificaciones por correo electrónico', desc: 'Cambia cuántos correos electrónicos se le envían a los clientes desde Intercom.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Medios, enlaces y documentos</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Enviando archivos', desc: 'Los correos electrónicos enviados y recibidos por los compañeros de equipo a los clientes pueden contener archivos adjuntos.' },
                      { title: 'Marca del enlace', desc: 'Cambia el dominio de los enlaces y compártelos en correos electrónicos.' },
                      { title: 'Mostrar enlaces de correo electrónico', desc: 'Si está habilitado, los correos electrónicos enviados a los clientes serán visibles en los hilos de discusión.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PhoneView (1-56416) ───────────────────────────────────────────────────────

export function PhoneView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Teléfono</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {/* Promo card with phone-video banner */}
            <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
              </button>
              <div className="flex-1 max-w-[440px]">
                <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-2 leading-[26px]">Llamadas y conversaciones en un solo lugar</h2>
                <p className="text-[13px] text-[#646462] mb-4">Aprovecha llamadas telefónicas, videollamadas y pantalla compartida para solucionar los problemas de los clientes más rápido con asistencia telefónica nativa, creada en Intercom.</p>
                <div className="flex items-center gap-4">
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Cómo configurar</button>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">▦ Flujos de trabajo de IVR</button>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📅 Precios</button>
                </div>
              </div>
              <img src={IMG_PHONE_VIDEO} alt="Phone preview" className="w-[444px] h-[250px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:56342" />
            </div>
            {/* Usage warning */}
            <div className="bg-[#fef3c7] border border-[#fde68a] rounded-[10px] px-5 py-3 mb-4 flex items-center gap-2">
              <span className="text-[#f59e0b]">⚠</span>
              <p className="text-[13px] text-[#1a1a1a]">Alcanzó el límite de uso de su teléfono. Comuníquese con asistencia para modificar su límite.</p>
            </div>
            {/* Accordion sections */}
            <div className="flex flex-col gap-3">
              {[
                { title: 'Llamadas telefónicas', desc: 'Llamadas telefónicas entrantes y salientes' },
                { title: 'Llamadas por Messenger', desc: 'Comparte voz, video y pantalla en Messenger' },
                { title: 'Grabación y transcripción', desc: 'Configurar grabaciones y transcripciones para todas las llamadas' },
              ].map(item => (
                <button key={item.title} className="w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center justify-between hover:bg-[#fafaf9]">
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-[#1a1a1a]">{item.title}</p>
                      <span className="bg-[#f3f3f1] text-[#646462] rounded-full px-2 py-0.5 text-[11px]">Off</span>
                    </div>
                    <p className="text-[12px] text-[#646462] mt-1">{item.desc}</p>
                  </div>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared Channel Promo Card ─────────────────────────────────────────────────

function ChannelPromoCard({ title, description, links, banner, dataNodeId }: {
  title: string; description: string; links: { label: string; icon?: string }[]; banner?: string; dataNodeId?: string;
}) {
  return (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
      <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
      </button>
      <div className="flex-1 max-w-[500px]">
        <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2 leading-[20px]">{title}</h2>
        <p className="text-[13px] text-[#646462] mb-4">{description}</p>
        <div className="flex items-center gap-4 flex-wrap">
          {links.map(l => (
            <button key={l.label} className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">
              {l.icon && <span>{l.icon}</span>}{l.label}
            </button>
          ))}
        </div>
      </div>
      {banner && <img src={banner} alt={title} className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id={dataNodeId} />}
    </div>
  );
}

// ── WhatsAppView (1-57872) ────────────────────────────────────────────────────

export function WhatsAppView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [transition, setTransition] = useState(true);
  const [identify, setIdentify] = useState<'new' | 'existing'>('new');
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">WhatsApp</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <ChannelPromoCard
              title="Incorpora WhatsApp a tu buzón para agilizar la asistencia"
              description="Gestiona las conversaciones de WhatsApp en tu buzón y despliega Fin AI Agent para ayudar a responder automáticamente a las preguntas más comunes. Solo se te cobrará con base en el uso."
              links={[{ icon: '📖', label: 'Conéctate a WhatsApp' }, { icon: '🤖', label: 'Implementa Fin AI Agent por chat' }]}
              banner={IMG_WHATSAPP_BANNER}
              dataNodeId="1:57727"
            />
            {/* Numbers */}
            <div className="border border-[#e9eae6] rounded-[12px] px-8 py-7 mb-4">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Números de WhatsApp Business conectados</h3>
              <p className="text-[13px] text-[#646462] mb-4">Puedes conectarte a varios números de WhatsApp Business. La facturación se basa en el uso. <a href="#" className="text-[#3b59f6] underline">Más información sobre números de WhatsApp Business</a></p>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Conectar a un número de WhatsApp Business</button>
            </div>
            {/* 2-col sections */}
            {[
              { title: 'Fin AI Agent', desc: 'Permite que Fin responda al instante las preguntas de los clientes en WhatsApp, reduce la carga de trabajo manual y mejora los tiempos de respuesta.', cta: 'Administrar Fin AI Agent' },
              { title: 'Perfil de empresa', desc: 'Agrega los detalles que tus clientes verán en tu perfil de WhatsApp Business, como foto de perfil, estado, correo electrónico, dirección y sitio web.', cta: 'Establece el perfil de tu empresa' },
            ].map(s => (
              <div key={s.title} className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
                <div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{s.title}</h3><p className="text-[13px] text-[#646462]">{s.desc}</p></div>
                <button className="border border-[#e9eae6] rounded-[6px] px-4 py-2 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] flex-shrink-0">{s.cta}</button>
              </div>
            ))}
            {/* Templates */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Plantillas de mensajes</h3>
                <p className="text-[13px] text-[#646462] mb-2">Las plantillas de mensajes son requeridas por WhatsApp para iniciar o continuar conversaciones 24 horas después de la última respuesta del usuario. <a href="#" className="text-[#3b59f6] underline">Más información</a></p>
                <div className="bg-[#fef3c7] border border-[#fde68a] rounded-[8px] px-3 py-2 mt-3 text-[12px] text-[#1a1a1a] flex items-start gap-2"><span>⚠</span>Las plantillas de marketing no son compatibles. Solo se pueden usar plantillas de utilidad y autenticación en Intercom. Las plantillas de marketing no aparecerán en tu lista de plantillas. <a href="#" className="text-[#3b59f6] underline">Más información sobre las categorías de plantillas.</a></div>
              </div>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] flex-shrink-0">Administrar plantillas de mensajes</button>
            </div>
            {/* Switch transition */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Cambiar de Messenger a WhatsApp</h3>
                <p className="text-[13px] text-[#646462] mb-3">Cuando los leads o los usuarios inicien una conversación en Messenger, ofréceles continuarla en WhatsApp en su idioma preferido (solo disponible en la web). <a href="#" className="text-[#3b59f6] underline">Explicación sobre leads y usuarios</a>.</p>
              </div>
              <div className="w-[440px] flex-shrink-0">
                <div className="flex items-center gap-3 mb-3">
                  <button onClick={() => setTransition(v => !v)} className={`w-8 h-[18px] rounded-full relative ${transition ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${transition ? 'right-0.5' : 'left-0.5'}`}/>
                  </button>
                  <span className="text-[13px] text-[#1a1a1a]">Ofrece la opción de cambiar a WhatsApp</span>
                </div>
                <img src={IMG_WHATSAPP_TRANS} alt="WhatsApp transition" className="w-full rounded-[8px] border border-[#e9eae6]" data-node-id="1:57822" />
              </div>
            </div>
            {/* New conversations */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">nuevas conversaciones</h3>
                <p className="text-[13px] text-[#646462]">Una vez cerrada la conversación, los mensajes nuevos que se reciban después de este período de tiempo establecido se tratarán como una nueva conversación.</p>
              </div>
              <select className="w-[440px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] bg-white flex-shrink-0"><option>30 días</option></select>
            </div>
            {/* Existing users */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Usuarios existentes</h3>
                <p className="text-[13px] text-[#646462]">Cuando se inicia una conversación en WhatsApp, crea un nuevo cliente potencial o intenta hacer coincidir el número de teléfono con un usuario existente. Si no se encuentra ninguna coincidencia, se creará un nuevo cliente potencial.</p>
              </div>
              <div className="w-[440px] flex flex-col gap-3 flex-shrink-0">
                {[
                  { id: 'new' as const, label: 'Crear siempre un nuevo cliente potencial' },
                  { id: 'existing' as const, label: 'Identificar a los usuarios existentes por su número de teléfono' },
                ].map(o => (
                  <label key={o.id} onClick={() => setIdentify(o.id)} className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-4 h-4 rounded-full border-2 ${identify === o.id ? 'border-[#3b59f6]' : 'border-[#ccc]'} flex items-center justify-center`}>
                      {identify === o.id && <div className="w-2 h-2 rounded-full bg-[#3b59f6]"/>}
                    </div>
                    <span className="text-[13px] text-[#1a1a1a]">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DiscordView (1-61787) ─────────────────────────────────────────────────────

export function DiscordView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Discord</h1>
            <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">Conectar servidor</button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {/* Fin AI Agent banner */}
            <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 mb-6 flex items-center justify-between">
              <p className="text-[13px] text-[#1a1a1a] max-w-[700px]">Permita que Fin responda al instante las preguntas de los clientes en Discord, reduzca la carga de trabajo manual y mejore los tiempos de respuesta</p>
              <div className="flex items-center gap-3">
                <button className="border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Administrar Fin AI Agent</button>
                <button className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
              </div>
            </div>
            {/* Promo card */}
            <div className="bg-white border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
              <div className="flex-1 max-w-[500px]">
                <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-2 leading-[26px]">Conecta Discord para empezar a administrar los mensajes de los clientes en Intercom</h2>
                <p className="text-[13px] text-[#646462] mb-4">Configura un servidor de Discord para crear, responder y resolver conversaciones desde tu buzón de Intercom. También puedes habilitar Fin para que responda en Discord.</p>
                <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canal de Discord</button>
              </div>
              <img src={IMG_DISCORD_ILLO} alt="Discord settings illustration" className="w-[298px] h-[142px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:61730" />
            </div>
            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg viewBox="0 0 24 24" className="w-10 h-10" fill="#5865F2"><path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 00-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 00-4.8 0c-.14-.33-.36-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05a18.46 18.46 0 005.59 2.83.07.07 0 00.08-.03c.43-.59.81-1.21 1.14-1.87.02-.04 0-.08-.04-.09-.61-.23-1.19-.51-1.75-.83-.04-.02-.04-.08-.01-.11.12-.09.23-.18.34-.27a.07.07 0 01.07-.01c3.66 1.67 7.61 1.67 11.23 0a.07.07 0 01.07.01c.11.09.23.18.34.27.04.03.04.09-.01.11-.56.33-1.14.6-1.75.83a.07.07 0 00-.04.09c.34.66.72 1.28 1.14 1.87.02.02.06.04.08.03 1.79-.55 3.65-1.39 5.59-2.83.02-.01.03-.03.03-.05.45-4.53-.75-8.46-3.18-11.95-.01-.01-.02-.02-.03-.02zM8.52 14.42c-1.06 0-1.93-.97-1.93-2.16 0-1.19.85-2.16 1.93-2.16 1.09 0 1.95.98 1.93 2.16 0 1.19-.85 2.16-1.93 2.16zm6.97 0c-1.06 0-1.93-.97-1.93-2.16 0-1.19.85-2.16 1.93-2.16 1.09 0 1.95.98 1.93 2.16 0 1.19-.84 2.16-1.93 2.16z"/></svg>
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Aún no hay servidores conectados.</p>
              <p className="text-[13px] text-[#646462] text-center max-w-[500px]">Conecte su servidor de Discord para comenzar a sincronizar conversaciones con Intercom. Una vez conectado, verá sus servidores listados aquí.</p>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] mt-2">+ Conectar el servidor de Discord</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SmsView (1-63243) ─────────────────────────────────────────────────────────

export function SmsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">SMS</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <h2 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Gestión de respuestas SMS</h2>
            <div className="border border-[#e9eae6] rounded-[12px] mb-3 overflow-hidden">
              <div className="px-5 py-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">💬</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2"><p className="text-[14px] font-semibold text-[#1a1a1a]">SMS de dos vías</p><span className="bg-[#dcfce7] text-[#166534] rounded-full px-2 py-0.5 text-[11px] font-medium">Activado</span></div>
                  <p className="text-[12px] text-[#646462] mt-0.5">Apoya a tus clientes al instante con conversaciones por SMS</p>
                </div>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] mt-2"><path d="M4 10l4-4 4 4"/></svg>
              </div>
              <div className="px-5 pb-5 ml-14">
                <p className="text-[13px] text-[#646462] mb-3">Cuando recibas una respuesta de palabra clave no reconocida, inicia una conversación en Inbox por SMS.</p>
                <button className="border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Activar esta función Desactivado</button>
              </div>
            </div>
            <div className="border border-[#e9eae6] rounded-[12px] mb-6 px-5 py-4 flex items-start gap-4 hover:bg-[#fafaf9]">
              <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">💬</div>
              <div className="flex-1"><p className="text-[14px] font-semibold text-[#1a1a1a]">Respuestas automáticas a palabras clave</p><p className="text-[12px] text-[#646462] mt-0.5">Administra las respuestas automatizadas que se enviarán a tus clientes.</p></div>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] mt-2"><path d="M6 4l4 4-4 4"/></svg>
            </div>
            <h2 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Configuración avanzada de SMS</h2>
            <div className="flex flex-col gap-3">
              {[
                { icon: '📱', title: 'Países y números de teléfono', desc: 'Activar nuevos países, editar y previsualizar los números de teléfono activos' },
                { icon: '⏰', title: 'Horarios tranquilos por zona horaria', desc: 'Cuando se activan para mensajes individuales, las horas tranquilas retrasan el envío del mensaje SMS para garantizar que solo se reciban cuan...' },
                { icon: '🏢', title: 'Prefijo de identificación de la empresa', desc: 'Identifica tu empresa cuando envíes SMS salientes.' },
              ].map(s => (
                <button key={s.title} className="border border-[#e9eae6] rounded-[12px] px-5 py-4 flex items-start gap-4 hover:bg-[#fafaf9] text-left">
                  <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">{s.icon}</div>
                  <div className="flex-1"><p className="text-[14px] font-semibold text-[#1a1a1a]">{s.title}</p><p className="text-[12px] text-[#646462] mt-0.5">{s.desc}</p></div>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] mt-2"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ChannelLogo (real Figma SVG compositions, extracted from 1-67348) ─────────

function ChannelLogo({ channel, size = 48 }: { channel: 'messenger'|'email'|'phone'|'whatsapp'|'instagram'|'facebook'|'slack'|'sms'|'switch'; size?: number }) {
  const sx = { width: size, height: size };
  switch (channel) {
    case 'messenger': return (
      <div className="overflow-hidden relative" style={sx}>
        <img src={LOGO_MESSENGER_BG} alt="" className="absolute inset-0 w-full h-full" />
        <img src={LOGO_MESSENGER_FG} alt="" className="absolute" style={{ inset: '27.09% 27.06% 22.89% 27.09%' }} />
      </div>
    );
    case 'email': return (
      <div className="overflow-hidden relative" style={sx}>
        <img src={LOGO_EMAIL_BG} alt="" className="absolute inset-0 w-full h-full" />
        <img src={LOGO_EMAIL_FG} alt="" className="absolute" style={{ inset: '31.26% 28.1% 31.23% 28.13%' }} />
      </div>
    );
    case 'phone': return (
      <div className="overflow-hidden relative" style={sx}>
        <img src={LOGO_PHONE_BG} alt="" className="absolute inset-0 w-full h-full" />
        <img src={LOGO_PHONE_FG} alt="" className="absolute" style={{ inset: '28.13% 28.11% 28.1% 28.14%' }} />
      </div>
    );
    case 'whatsapp': return (
      <div className="overflow-hidden relative" style={sx}>
        <div className="absolute inset-0" style={{ WebkitMaskImage: `url('${LOGO_WHATSAPP_BG}')`, maskImage: `url('${LOGO_WHATSAPP_BG}')`, WebkitMaskSize: 'cover', maskSize: 'cover' }}>
          <img src={LOGO_WHATSAPP_FG} alt="" className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    );
    case 'instagram': return (
      <div className="overflow-hidden relative" style={sx}>
        <div className="absolute inset-0" style={{ WebkitMaskImage: `url('${LOGO_INSTAGRAM_BG}')`, maskImage: `url('${LOGO_INSTAGRAM_BG}')`, WebkitMaskSize: 'cover', maskSize: 'cover' }}>
          <img src={LOGO_INSTAGRAM_FG} alt="" className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    );
    case 'facebook': return (
      <div className="overflow-hidden relative" style={sx}>
        <div className="absolute inset-0" style={{ WebkitMaskImage: `url('${LOGO_FACEBOOK_BG}')`, maskImage: `url('${LOGO_FACEBOOK_BG}')`, WebkitMaskSize: 'cover', maskSize: 'cover' }}>
          <img src={LOGO_FACEBOOK_FG} alt="" className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    );
    case 'sms': return (
      <div className="overflow-hidden relative" style={sx}>
        <img src={LOGO_SMS_BG} alt="" className="absolute inset-0 w-full h-full" />
        <img src={LOGO_SMS_FG1} alt="" className="absolute" style={{ inset: '25.01% 28.1% 48.15% 43.76%' }} />
        <img src={LOGO_SMS_FG2} alt="" className="absolute" style={{ inset: '28.13% 43.73% 28.1% 28.13%' }} />
      </div>
    );
    case 'switch': return (
      <div className="overflow-hidden relative" style={sx}>
        <img src={LOGO_SWITCH_BG} alt="" className="absolute inset-0 w-full h-full" />
        <img src={LOGO_SWITCH_FG1} alt="" className="absolute" style={{ inset: '25.01% 28.1% 41.9% 43.76%' }} />
        <img src={LOGO_SWITCH_FG2} alt="" className="absolute" style={{ inset: '28.13% 43.73% 28.1% 28.13%' }} />
      </div>
    );
    case 'slack': return (
      <div className="overflow-hidden relative" style={sx}>
        {/* 14-vector composition extracted from Figma node 1:67260 (multi-color hashtag) */}
        <img src={LOGO_SLACK_V0} alt="" className="absolute" style={{ inset: '0.58% 52.82% 78.73% 26.24%' }} />
        <img src={LOGO_SLACK_V1} alt="" className="absolute" style={{ inset: '0.58% 26.46% 52.66% 52.34%' }} />
        <div className="absolute" style={{ inset: '10.32% 52.54% 78.45% 35.6%', WebkitMaskImage: `url('${LOGO_SLACK_F}'), url('${LOGO_SLACK_F1}')`, maskImage: `url('${LOGO_SLACK_F}'), url('${LOGO_SLACK_F1}')`, WebkitMaskSize: 'cover', maskSize: 'cover' }}>
          <img src={LOGO_SLACK_F2} alt="" className="absolute inset-0 w-full h-full" />
        </div>
        <img src={LOGO_SLACK_V2} alt="" className="absolute" style={{ inset: '26.38% 52.57% 52.66% -0.12%' }} />
        <img src={LOGO_SLACK_V3} alt="" className="absolute" style={{ inset: '26.39% 0.28% 52.66% 78.72%' }} />
        <img src={LOGO_SLACK_V4} alt="" className="absolute" style={{ inset: '35.89% 10.2% 52.66% 78.72%' }} />
        <img src={LOGO_SLACK_V5} alt="" className="absolute" style={{ inset: '52.44% 0.09% 26.59% 52.35%' }} />
        <img src={LOGO_SLACK_V6} alt="" className="absolute" style={{ inset: '52.43% 78.92% 26.66% -0.12%' }} />
        <img src={LOGO_SLACK_V7} alt="" className="absolute" style={{ inset: '52.45% 52.82% 0.78% 25.98%' }} />
        <div className="absolute" style={{ inset: '78.27% 36.31% 10.04% 52.35%', WebkitMaskImage: `url('${LOGO_SLACK_H}'), url('${LOGO_SLACK_F1}')`, maskImage: `url('${LOGO_SLACK_H}'), url('${LOGO_SLACK_F1}')`, WebkitMaskSize: 'cover', maskSize: 'cover' }}>
          <img src={LOGO_SLACK_H1} alt="" className="absolute inset-0 w-full h-full" />
        </div>
        <img src={LOGO_SLACK_V8} alt="" className="absolute" style={{ inset: '78.27% 26.51% 0.79% 52.35%' }} />
      </div>
    );
  }
}

// ── AllChannelsView (1-67348) ─────────────────────────────────────────────────

type ChannelKey = 'messenger'|'email'|'phone'|'whatsapp'|'instagram'|'facebook'|'slack'|'sms'|'switch';
const ALL_CHANNELS_RECOMMENDED: { key: ChannelKey; name: string; subtitle: string; desc: string; nav: View | null }[] = [
  { key: 'messenger', name: 'Messenger',          subtitle: 'Incluido en tu plan', desc: 'Brinda ayuda proactiva, autoservicio y asistencia personal a través del chat en tu sitio web.', nav: 'messenger' },
  { key: 'email',     name: 'Correo electrónico', subtitle: 'Incluido en tu plan', desc: 'Responde a las consultas de los clientes e inicia conversaciones por correo electrónico.', nav: 'email' },
  { key: 'phone',     name: 'Teléfono',           subtitle: 'Facturado por uso',   desc: 'Inicia llamadas telefónicas, videollamadas y pantalla compartida para ayudar rápidamente a tus clientes.', nav: 'phone' },
];
const ALL_CHANNELS_OTHER: { key: ChannelKey; name: string; subtitle: string; desc: string; nav: View | null; badge?: string }[] = [
  { key: 'whatsapp',  name: 'WhatsApp',  subtitle: 'Facturado por uso',   desc: 'Responde a los mensajes de WhatsApp e interactúa con los clientes directamente desde tu Inbox.', nav: 'whatsapp' },
  { key: 'instagram', name: 'Instagram', subtitle: 'Incluido en tu plan', desc: 'Responde a los mensajes de Instagram e interactúa con los clientes directamente desde tu Inbox.', nav: 'social' },
  { key: 'facebook',  name: 'Facebook',  subtitle: 'Incluido en tu plan', desc: 'Responde a los mensajes de Facebook e interactúa con los clientes directamente desde tu Inbox.', nav: 'social' },
  { key: 'slack',     name: 'Slack',     subtitle: 'Incluido en tu plan', desc: 'Responde a los mensajes de Slack e interactúa con los clientes directamente desde tu Inbox.', nav: null },
  { key: 'sms',       name: 'SMS',       subtitle: 'Facturado por uso',   desc: 'Responde a las consultas de los clientes e inicia conversaciones con mensajes SMS.', nav: 'sms' },
  { key: 'switch',    name: 'Switch',    subtitle: 'Disponible con cambio a un plan de mayor categoría', desc: 'Permite que los clientes pasen de una cola telefónica a una experiencia de chat en Messenger.', nav: null, badge: 'Obtener funcionalidad' },
];

export function AllChannelsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Todos los canales</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {/* Hub banner */}
            <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
              <div className="flex-1 max-w-[500px]">
                <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-2">Todos los canales en un buzón</h2>
                <p className="text-[13px] text-[#646462] mb-4">Atiende a tus clientes donde están, desde chat en vivo y correo electrónico hasta teléfono y redes sociales. Todas las conversaciones se canalizan directamente a tu buzón, para que puedas priorizar los problemas y resolverlos más rápido.</p>
                <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canales</button>
              </div>
              <img src={IMG_CHANNELS_ALL} alt="Hub" className="w-[442px] h-[206px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:67142" />
            </div>
            {/* Recomendado */}
            <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Recomendado</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {ALL_CHANNELS_RECOMMENDED.map(c => (
                <button key={c.name} onClick={() => c.nav && onNavigate(c.nav)} className="border border-[#e9eae6] rounded-[10px] p-6 flex flex-col text-left hover:border-[#c8c9c4] hover:shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <ChannelLogo channel={c.key} size={48} />
                    <div><p className="text-[15px] font-semibold text-[#1a1a1a]">{c.name}</p><p className="text-[12px] text-[#646462]">{c.subtitle}</p></div>
                  </div>
                  <p className="text-[13px] text-[#646462]">{c.desc}</p>
                </button>
              ))}
            </div>
            {/* Otros canales */}
            <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Otros canales</h3>
            <div className="grid grid-cols-2 gap-4">
              {ALL_CHANNELS_OTHER.map(c => (
                <button key={c.name} onClick={() => c.nav && onNavigate(c.nav)} className="border border-[#e9eae6] rounded-[10px] p-6 flex flex-col text-left hover:border-[#c8c9c4] hover:shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <ChannelLogo channel={c.key} size={48} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><p className="text-[15px] font-semibold text-[#1a1a1a]">{c.name}</p>{c.badge && <span className="bg-[#7c3aed] text-white text-[11px] px-2 py-0.5 rounded-full font-medium">{c.badge}</span>}</div>
                      <p className="text-[12px] text-[#646462]">{c.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-[13px] text-[#646462]">{c.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
