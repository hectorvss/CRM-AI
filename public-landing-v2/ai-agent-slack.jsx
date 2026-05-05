/* global React, ClainV2 */
/* AI Agent for Slack — extracted from Figma node 2:30675
   Hero, ChapterNav, 7 sections (voice, email, live-chat, social-messaging,
   slack, api, faqs), and Final CTA — all extracted via Figma MCP with real assets. */
(function () {
  const { useState, useEffect } = React;
  const { PageShell } = ClainV2;


  /* ─────────── Slack Hero assets (Figma 2:31104) ─────────── */
  const heroImgGroup       = "/v2/assets/a1781e89-4f5f-4f74-b56f-ecbea02f5b3d.svg";
  const heroImgGroup1      = "/v2/assets/ccf9fae5-4f26-498f-902c-333a0897251c.svg";
  const heroImgGroup2      = "/v2/assets/1101bc8b-e182-49a0-8172-f563ce7f9e9e.svg";
  const heroImgGroup3      = "/v2/assets/5664af38-5676-4515-9477-fdb1ddcdbd1b.svg";
  const heroImgGroup4      = "/v2/assets/7b3b1a77-6a36-437c-b0ea-e15709842375.svg";
  const heroImgGroup5      = "/v2/assets/ac73297e-f277-4363-b0ea-d48cd1db0117.svg";
  const heroImgVector      = "/v2/assets/1f89fc41-71c5-4f2b-b1c0-d02f8042a45f.svg";
  const heroImgVector1     = "/v2/assets/6c5dc851-ef4b-4bce-a667-a34348c237bd.svg";
  const heroImgVector2     = "/v2/assets/8902bcef-b807-461c-a95a-9b73df7e16ca.svg";
  const heroImgGroup6      = "/v2/assets/beafd495-bcb6-47ea-b384-d22f1a7c8aef.svg";
  const heroImgGroup7      = "/v2/assets/54ce3086-c2ea-496f-aa64-e7f22cabbcfb.svg";
  const heroImgVector3     = "/v2/assets/c47d0b8d-04e8-40ab-ab46-e427a43e87fd.svg";
  const heroImgGroup8      = "/v2/assets/d93d930c-e380-47be-9a5e-3b5fdceddff6.svg";
  const heroImgGroup9      = "/v2/assets/97152521-6544-4335-93e4-184356244231.svg";
  const heroImgGroup10     = "/v2/assets/4eca1914-d634-4fec-9f50-813e3e3f8737.svg";
  const heroImgVector4     = "/v2/assets/2bb68a59-f4c9-4617-9541-df100c03ab69.svg";
  const heroImgVector5     = "/v2/assets/e49e3923-bcfa-475c-8df0-e8c2ac201d51.svg";
  const heroImgVector6     = "/v2/assets/efda0b1d-1c04-413e-a95a-4767d07847b5.svg";
  const heroImgChannelsBg  = "/v2/assets/7be11095-c44f-4f25-946d-89cd7e6132cc.png";
  const heroImgImage       = "/v2/assets/a422c490-0142-4880-9104-30a84c56008d.png";


  /* Slack channel-icon component (Figma Component1 variants 4-10) */
  function SlackChannelIcon({ variant }) {
    const v = variant || '4';
    const sizes = {
      '4':  { inset: '0',                                src: heroImgGroup,   wrap: 'simple' },
      '5':  { inset: '18.27% 2.78% 18.27% 5.56%',        src: heroImgVector2, wrap: 'simple' },
      '6':  { inset: '0 5.88%', mask: heroImgGroup6,     src: heroImgGroup7,  wrap: 'mask' },
      '7':  { inset: '0 0.48% 0 0',                      src: heroImgVector3, wrap: 'simple' },
      '8':  { inset: '4.55% 3.03% 4.55% 6.06%', mask: heroImgGroup8, src: heroImgGroup9, wrap: 'mask' },
      '9':  { inset: '4.55% 6.06% 4.55% 3.03%', mask: heroImgGroup8, src: heroImgGroup10, wrap: 'mask' },
      '10': { inset: '12.21% 2.05% 12.21% 2.04%',        src: heroImgVector4, wrap: 'simple' },
    };
    const cfg = sizes[v] || sizes['4'];
    return (
      <div className="overflow-clip relative size-[12px]">
        {cfg.wrap === 'simple' ? (
          <div className="absolute opacity-100" style={{ inset: cfg.inset }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={cfg.src} />
          </div>
        ) : (
          <div className="absolute opacity-100" style={{ inset: cfg.inset, maskImage: `url('${cfg.mask}')`, WebkitMaskImage: `url('${cfg.mask}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={cfg.src} />
          </div>
        )}
      </div>
    );
  }

  /* Slack logo with floating "Slack." text (Figma Component1 variant 2) */
  function SlackHeroSlackLogo() {
    return (
      <div className="overflow-clip relative size-[72px]">
        <div className="absolute" style={{ inset: '4.55% 6.06% 4.55% 3.03%', maskImage: `url('${heroImgGroup2}')`, WebkitMaskImage: `url('${heroImgGroup2}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={heroImgGroup3} />
        </div>
      </div>
    );
  }
  /* Social. logo (variant 3) */
  function SlackHeroSocialLogo() {
    return (
      <div className="overflow-clip relative" style={{ width: 71.69, height: 72.003 }}>
        <div className="absolute opacity-100" style={{ inset: '4.74% 3.03% 4.74% 6.06%', maskImage: `url('${heroImgGroup4}')`, WebkitMaskImage: `url('${heroImgGroup4}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={heroImgGroup5} />
        </div>
      </div>
    );
  }

  function SlackHero() {
    return (
      <div className="content-stretch flex flex-col items-center pb-[96px] pt-[72px] relative w-full" style={{ background: '#020917' }}>
        {/* Background image with 4 edge gradients */}
        <div className="absolute content-stretch flex flex-col inset-0 items-center max-h-[780px] pointer-events-none">
          <div className="flex-1 max-w-[1536px] min-h-px overflow-clip relative w-[1440px]">
            <div className="absolute h-[772.5px] left-0 overflow-clip top-0 w-[1440px]">
              <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ inset: '-3.4% -2.67% -3.09% -3.74%', maskImage: `url('${heroImgGroup}')`, WebkitMaskImage: `url('${heroImgGroup}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={heroImgGroup1} />
              </div>
            </div>
            <div className="absolute h-[722px] left-0 right-0 top-0" style={{ background: '#020917', opacity: 0.1 }} />
          </div>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-12 gap-y-[48px] grid-rows-[500px] h-[500px] max-w-[1600px] px-[24px] relative shrink-0 w-full">
          {/* Right column — channel hero placeholder + image */}
          <div className="aspect-[580/500] col-start-8 col-span-5 justify-self-stretch relative row-1 self-start shrink-0">
            <div className="absolute bottom-0 h-[500px] opacity-0 overflow-clip right-0 w-[580px]">
              <div className="absolute aspect-[580/533.06] left-0 right-0 top-0">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute left-0 max-w-none size-full top-0" src={heroImgChannelsBg} />
                </div>
              </div>
            </div>
            <div className="absolute content-stretch flex flex-col inset-[0_0_-147px_0] items-start">
              <div className="h-[647px] relative shrink-0 w-[574px]">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute left-0 max-w-none size-full top-0" src={heroImgImage} />
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 right-[-40px] top-0 w-[200px]" style={{ background: 'linear-gradient(to left, #020917 0%, rgba(2,9,23,0.85) 60%, rgba(2,9,23,0) 100%)' }} />
          </div>

          {/* Left column — H1 "One AI Agent. For Slack." */}
          <div className="col-start-2 col-span-5 content-stretch flex flex-col items-start justify-self-stretch pt-[95px] relative row-1 self-start shrink-0">
            <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
              <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                <div className="content-stretch flex flex-col items-start pb-[64px] relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col items-start pb-[0.8px] relative shrink-0 w-full">
                    <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[77.8px] tracking-[-4.04px] w-full" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <p className="leading-[80.8px]">One AI Agent.</p>
                    </div>
                  </div>
                  {/* "For Slack." line with logo */}
                  <div className="h-[80.8px] relative shrink-0 w-full">
                    <div className="-translate-y-1/2 absolute flex flex-col font-['Inter:Light',sans-serif] font-light h-[81px] justify-center leading-[0] left-0 not-italic text-[80.8px] text-white top-[calc(50%-0.9px)] tracking-[-4.04px] w-[116.48px]">
                      <p className="leading-[80.8px]">For</p>
                    </div>
                    <div className="-translate-y-1/2 absolute h-[80.8px] left-[140.28px] top-1/2 w-[276.84px]">
                      <div className="absolute content-stretch flex flex-col items-start left-0 top-[4.78px]" style={{ filter: 'blur(1.64px)', opacity: 0.836 }}>
                        <div className="h-[80.8px] relative shrink-0 w-[276.84px]">
                          <div className="-translate-y-1/2 absolute left-0 overflow-clip size-[72px] top-[calc(50%-0.01px)]">
                            <SlackHeroSlackLogo />
                          </div>
                          <div className="-translate-y-1/2 absolute flex flex-col font-['Inter:Light',sans-serif] font-light h-[81px] justify-center leading-[0] left-[80px] not-italic text-[78.4px] text-white top-[calc(50%-0.9px)] tracking-[-4.04px] w-[197.05px]">
                            <p className="leading-[80.8px]">Slack.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* "Social." floating watermark behind */}
                <div className="absolute content-stretch flex flex-col h-[81px] items-start left-[140px] top-[56.91px] w-[296px]" style={{ filter: 'blur(7.65px)', opacity: 0.235 }}>
                  <div className="h-[80.8px] relative shrink-0 w-full">
                    <div className="-translate-y-1/2 absolute h-[72.003px] left-0 overflow-clip top-[calc(50%-0.01px)] w-[71.69px]">
                      <SlackHeroSocialLogo />
                    </div>
                    <div className="-translate-y-1/2 absolute flex flex-col font-['Inter:Light',sans-serif] font-light h-[81px] justify-center leading-[0] left-[79.69px] not-italic text-[78.4px] text-white top-[calc(50%-0.9px)] tracking-[-4.04px] w-[216.51px]">
                      <p className="leading-[80.8px]">Social.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description + buttons */}
              <div className="content-stretch flex flex-col gap-[24px] items-start max-w-[518.4px] relative shrink-0 w-[518.39px]">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-[475.19px]">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[0px] text-white w-full">
                      <p className="leading-[24.75px] mb-0 text-[16.3px]">Clain delivers unrivaled performance across every channel.</p>
                      <p className="leading-[24.75px] mb-0 text-[16.3px]" style={{ color: 'rgba(255,255,255,0.6)' }}>Wherever customers reach out, Clain provides fast, accurate,</p>
                      <p className="leading-[24.75px] mb-0 text-[16.3px]" style={{ color: 'rgba(255,255,255,0.6)' }}>personalized support&mdash;ensuring consistent, high-quality</p>
                      <p className="leading-[24.75px] text-[16.3px]" style={{ color: 'rgba(255,255,255,0.6)' }}>customer experiences at scale.</p>
                    </div>
                  </div>
                </div>
                <div className="content-stretch flex flex-wrap gap-[12px] h-[42px] items-start relative shrink-0 w-full">
                  <button onClick={() => ClainV2.navigate('/signup')} className="bg-white border-0 cursor-pointer flex h-full items-center justify-center px-[16px] py-[13px] rounded-[6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.4, lineHeight: '16px', letterSpacing: '-0.32px', color: '#000' }}>Start free trial</button>
                  <button onClick={() => ClainV2.navigate('/demo')} className="bg-transparent cursor-pointer flex h-full items-center justify-center px-[17px] py-[13px] rounded-[6px] text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.8, lineHeight: '16px', letterSpacing: '-0.32px', border: '1px solid white' }}>View demo</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute inset-[40%_0_0_0] max-h-[500px]" style={{ background: 'linear-gradient(to top, #020917 0%, rgba(2,9,23,0.85) 60%, rgba(2,9,23,0) 100%)' }} />

        {/* Channel labels strip */}
        <div className="content-stretch flex flex-col items-start pt-[40px] relative shrink-0 z-10">
          <div className="content-stretch flex gap-[28px] items-start justify-center relative shrink-0">
            {[
              { name: 'Voice',     v: '4'  },
              { name: 'Email',     v: '5'  },
              { name: 'Messenger', v: '6'  },
              { name: 'WhatsApp',  v: '7'  },
              { name: 'Social',    v: '8'  },
              { name: 'Slack',     v: '9'  },
              { name: 'API',       v: '10' },
            ].map((c) => (
              <div key={c.name} className="content-stretch flex flex-col items-start relative self-stretch shrink-0">
                <div className="content-stretch flex gap-[8px] items-center relative shrink-0">
                  <SlackChannelIcon variant={c.v} />
                  <p className="m-0 uppercase whitespace-nowrap text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11, lineHeight: '14px', letterSpacing: '1.504px' }}>{c.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }


  /* ─────────── Chapter Navigation (Figma 2:31736) ─────────── */
  const SLACK_CHAPTERS = [
    { id: 'voice',            num: '01', label: 'voice' },
    { id: 'email',            num: '02', label: 'email' },
    { id: 'live-chat',        num: '03', label: 'live chat' },
    { id: 'social-messaging', num: '04', label: 'social messaging' },
    { id: 'slack',            num: '05', label: 'slack' },
    { id: 'api',              num: '06', label: 'api' },
    { id: 'faqs',             num: '07', label: 'faqs' },
  ];

  function ChapterNav({ activeId, onClick }) {
    return (
      <div className="content-stretch flex flex-col items-start relative w-full">
        {SLACK_CHAPTERS.map((c, i) => (
          <div key={c.id} className="content-stretch flex flex-col items-start relative shrink-0 w-full">
            <a
              href={'#' + c.id}
              onClick={(e) => { e.preventDefault(); onClick(c.id); }}
              className="content-stretch cursor-pointer flex items-start justify-center py-[10px] relative shrink-0 w-full"
              style={{ textDecoration: 'none' }}
            >
              <div className="content-stretch flex flex-1 items-center min-w-px relative">
                <div className="content-stretch flex flex-col items-start pr-[12px] relative shrink-0">
                  <div className="cursor-pointer flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-left tracking-[1.504px] uppercase whitespace-nowrap" style={{ color: activeId === c.id ? 'white' : 'rgba(255,255,255,0.6)' }}>
                    <p className="leading-[14px]">{c.num}</p>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0">
                  <div className="cursor-pointer flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-left tracking-[1.504px] uppercase whitespace-nowrap" style={{ color: activeId === c.id ? 'white' : 'rgba(255,255,255,0.6)' }}>
                    <p className="leading-[14px]">{c.label}</p>
                  </div>
                </div>
              </div>
            </a>
            {/* Divider — orange progress bar on the active chapter */}
            <div className="h-px relative shrink-0 w-full" style={{ background: activeId === c.id ? '#ff5600' : 'rgba(255,255,255,0.2)' }} />
          </div>
        ))}
      </div>
    );
  }


  /* ─────────── 7 SECTIONS (each from tmp-figma/slack-sections/*.jsx) ─────────── */
  // SLACK PAGE — VOICE section (Figma node 2:31228)
  // Assets:
  const imgVector = "/v2/assets/47502478-a9c5-4cdb-974a-cca6195b1c96.svg";
  const imgVector1 = "/v2/assets/426773b9-67da-42fc-ba20-e0d6e22233d9.svg";
  const imgImage = "/v2/assets/ec873c16-7305-4f30-a495-f17d88701358.png";
  const imgPhone = "/v2/assets/3ec8eedf-babd-4476-a422-752d21caedad.png";

  function VoiceComponent1({ className, variant }) {
    const v = variant || "11";
    const is12 = v === "12";
    return (
      <div className={className || `overflow-clip relative ${is12 ? "h-[12.234px] w-[16px]" : "size-[28px]"}`}>
        <div className={`absolute opacity-100 ${is12 ? "inset-[7.41%_2.94%_4.01%_2.94%]" : "inset-[0.17%_0.19%_0.18%_0.18%]"}`}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={is12 ? imgVector1 : imgVector} />
        </div>
      </div>
    );
  }

  function VoiceSection() {
    return (
      <div className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:31228" data-name="section#voice">
        {/* Voice label */}
        <div className="border-[#c5c5c1] border-b-[1px] border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-black tracking-[1.504px] uppercase whitespace-nowrap">
            <p className="leading-[14px]">Voice</p>
          </div>
        </div>

        {/* Hero text + product visual */}
        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          <div className="gap-y-[24px] grid grid-cols-12 grid-rows-[144px_139.75px] h-[307.75px] relative shrink-0 w-full">
            {/* Heading */}
            <div className="col-span-10 content-stretch flex flex-col items-start justify-self-stretch max-w-[1047.6px] relative row-1 self-start shrink-0">
              <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[71.7px] text-black tracking-[-3.008px] w-full">
                <p className="leading-[72px]">Natural conversations.</p>
              </div>
              <div className="content-stretch flex flex-col items-end relative shrink-0 w-full">
                <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[71.6px] text-black text-right tracking-[-3.008px] whitespace-nowrap">
                  <p className="leading-[72px]">Instant answers.</p>
                </div>
              </div>
            </div>
            {/* Body copy + Learn more */}
            <div className="col-span-4 content-stretch flex flex-col gap-[24px] items-start justify-self-stretch max-w-[420px] relative row-2 self-start shrink-0">
              <div className="font-['Inter:Regular',sans-serif] font-normal h-[95.75px] leading-[0] not-italic relative shrink-0 w-full">
                <div className="-translate-y-1/2 absolute flex flex-col h-[16px] justify-center left-0 text-[12px] text-[#626260] top-[13px] w-[13.97px]">
                  <p className="leading-[16px]">01</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[24px] justify-center left-[53.76px] text-[16.3px] text-[#313130] top-[11px] w-[325.22px]">
                  <p className="leading-[23.94px]">Clain Voice transforms phone support into a</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[72px] justify-center left-0 text-[16.3px] text-[#313130] top-[58.88px] w-[414.43px]">
                  <p className="leading-[23.94px] mb-0">better experience for every caller. Phone</p>
                  <p className="leading-[23.94px] mb-0">conversations feel natural, reflect your brand, and get</p>
                  <p className="leading-[23.94px]">resolved without IVR menus or long hold times.</p>
                </div>
              </div>
              <div className="content-stretch flex flex-wrap h-[21px] items-start relative shrink-0 w-full">
                <div className="bg-black content-stretch flex h-full items-center justify-center pb-[5px] relative shrink-0">
                  <a className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[14.8px] text-black text-center tracking-[0.08px] whitespace-nowrap cursor-pointer" onClick={() => ClainV2.navigate('#')}>
                    <p className="cursor-pointer leading-[16px]">Learn more</p>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Phone call mockup */}
          <div className="grid grid-cols-1 grid-rows-[488px_103.94px] gap-x-[24px] gap-y-[24px] h-[615.94px] relative shrink-0 w-full">
            <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex flex-col items-start justify-center justify-self-stretch p-px relative row-1 self-start shrink-0">
              <div className="relative shrink-0 w-full">
                <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex flex-col items-start relative size-full">
                  <div className="bg-[rgba(0,0,0,0.03)] border-[1px] border-[rgba(0,0,0,0.2)] border-solid content-stretch flex flex-col items-start p-px relative shrink-0 w-full">
                    <div className="h-[484px] relative shrink-0 w-full">
                      <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex items-center justify-center overflow-clip relative rounded-[inherit] size-full">
                        <div className="content-stretch flex flex-1 flex-col h-full items-center justify-between min-w-px pt-[32px] relative">
                          <div className="content-stretch flex flex-col font-['Inter:Regular',sans-serif] font-normal h-[64px] items-center leading-[0] not-italic px-[8px] relative shrink-0 text-center whitespace-nowrap">
                            <div className="flex flex-col justify-center relative shrink-0 text-[22.3px] text-[#1e2939]">
                              <p className="leading-[32px]">Customer:</p>
                            </div>
                            <div className="flex flex-col justify-center relative shrink-0 text-[#1e2939] text-[0px]">
                              <p className="text-[22.1px]">
                                <span className="leading-[32px] text-[#1e2939]">{`Do you have the Nova `}</span>
                                <span className="leading-[32px] text-[#ff6900]">headphones</span>
                              </p>
                            </div>
                          </div>
                          <div className="absolute content-stretch flex flex-col inset-[0_0.01px_0_0] items-start overflow-clip">
                            <div className="h-[484px] relative shrink-0 w-[1042.16px]">
                              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgImage} />
                              </div>
                            </div>
                          </div>
                          <div className="h-[360px] overflow-clip relative shrink-0 w-full">
                            <div className="absolute inset-[120px_335.34px_-120px_335.33px]">
                              <div className="absolute aspect-[384/300] left-0 right-0 top-0">
                                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                  <img alt="" className="absolute left-0 max-w-none size-full top-0" src={imgPhone} />
                                </div>
                              </div>
                              <div className="absolute bg-black content-stretch flex gap-[12px] h-[80px] items-center left-[24px] p-[16px] right-[24px] rounded-[9999px] top-[24px]">
                                <div className="bg-[#1e2939] content-stretch flex flex-col items-start overflow-clip relative rounded-[9999px] shrink-0 size-[48px]">
                                  <div className="bg-[#1e2939] content-stretch flex items-center justify-center relative shrink-0 size-[48px]">
                                    <VoiceComponent1 className="overflow-clip relative shrink-0 size-[28px]" />
                                  </div>
                                </div>
                                <div className="content-stretch flex flex-1 items-center justify-between min-w-px overflow-clip pr-[8px] relative">
                                  <div className="content-stretch flex flex-col items-center overflow-clip relative shrink-0">
                                    <div className="flex flex-col font-['Inter:Medium',sans-serif] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[14.6px] text-white text-center whitespace-nowrap">
                                      <p className="leading-[24px]">Clain Voice Support</p>
                                    </div>
                                  </div>
                                  <div className="content-stretch flex flex-col items-center relative shrink-0">
                                    <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-[#00c950] text-center whitespace-nowrap">
                                      <p className="leading-[20px]">0:06</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="absolute bg-gradient-to-t bottom-0 from-[#f4f3ec] h-[176px] left-0 opacity-80 to-[rgba(244,243,236,0)] w-[1054.66px]" />
                          <div className="absolute bottom-[31.99px] content-stretch flex flex-col items-center left-0 w-[1054.66px]">
                            <div className="content-stretch flex items-start justify-center relative shrink-0">
                              <div className="bg-[#a4a4a4] border-[2px] border-white border-solid content-stretch flex gap-[12px] items-end justify-center px-[18px] py-[14px] relative rounded-[9999px] shrink-0">
                                <VoiceComponent1 className="h-[12.234px] relative shrink-0 w-[16px]" variant="12" />
                                <div className="relative shrink-0">
                                  <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex flex-col items-center relative size-full">
                                    <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[9.8px] text-white text-center tracking-[1.1px] uppercase whitespace-nowrap">
                                      <p className="leading-[11px]">unmute</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="absolute bg-[#f4f3ec] border-[rgba(0,0,0,0.2)] border-b-[1px] border-r-[1px] border-solid left-0 top-0">
                      <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex flex-col items-start pb-[11px] pl-[10px] pr-[11px] pt-[10px] relative size-full">
                        <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[9px] text-[rgba(0,0,0,0.6)] tracking-[0.9px] uppercase whitespace-nowrap">
                          <p className="leading-[9px]">Fig 1.A</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3-feature row */}
            <div className="col-1 content-stretch flex gap-[24px] h-[103.94px] items-start justify-center justify-self-stretch relative row-2 shrink-0">
              <div className="h-full relative shrink-0 w-[336.88px]">
                <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[-1px]">
                  <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[16.3px] text-black whitespace-nowrap">
                    <p className="leading-[23.94px]">Conversations that feel natural</p>
                  </div>
                </div>
                <div className="absolute content-stretch flex flex-col items-start left-0 pt-[8px] right-0 top-[23.94px]">
                  <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[12.8px] text-[#313130] tracking-[0.496px] w-full">
                    <p className="leading-[18px] mb-0">Clain speaks with empathy, handles interruptions</p>
                    <p className="leading-[18px] mb-0">smoothly, and keeps calls moving with relevant,</p>
                    <p className="leading-[18px]">contextual follow-ups.</p>
                  </div>
                </div>
              </div>
              <div className="h-full relative shrink-0 w-[336.89px]">
                <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[-1px]">
                  <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[16.3px] text-black whitespace-nowrap">
                    <p className="leading-[23.94px]">Customizable to your brand</p>
                  </div>
                </div>
                <div className="absolute content-stretch flex flex-col items-start left-0 pt-[8px] right-0 top-[23.94px]">
                  <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[12.6px] text-[#313130] tracking-[0.496px] w-full">
                    <p className="leading-[18px] mb-0">Choose from distinct voices, add greetings, set</p>
                    <p className="leading-[18px] mb-0">availability, and define escalation paths&mdash;so every</p>
                    <p className="leading-[18px]">call aligns with your brand and policies.</p>
                  </div>
                </div>
              </div>
              <div className="h-full relative shrink-0 w-[336.89px]">
                <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[-1px]">
                  <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[16.3px] text-black whitespace-nowrap">
                    <p className="leading-[23.94px]">Integrates with your telephony system</p>
                  </div>
                </div>
                <div className="absolute content-stretch flex flex-col items-start left-0 pt-[8px] right-0 top-[23.94px]">
                  <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[12.7px] text-[#313130] tracking-[0.496px] w-full">
                    <p className="leading-[18px] mb-0">Clain connects to your existing telephony</p>
                    <p className="leading-[18px] mb-0">infrastructure, unlocking AI-powered phone</p>
                    <p className="leading-[18px] mb-0">support without disrupting how your team already</p>
                    <p className="leading-[18px]">works.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Corner decorations */}
        <div className="absolute border-[#c5c5c1] border-l-[1px] border-solid border-t-[1px] left-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-r-[1px] border-solid border-t-[1px] right-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-l-[1px] border-solid bottom-[8px] left-[8px] size-[24px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-r-[1px] border-solid bottom-[8px] right-[8px] size-[24px]" />
      </div>
    );
  }


  // SLACK PAGE — EMAIL section (Figma node 2:31331)
  // Assets:
  const emailImgVector  = "/v2/assets/dd2db198-c22a-4ecb-a138-c77d45178d8a.svg";
  const emailImgVector1 = "/v2/assets/5799743a-0855-4f61-995a-72c20ffcf602.svg";
  const emailImgVector2 = "/v2/assets/72e0ea25-e439-4663-92e1-835b4aee3edd.svg";
  const emailImgEmailUi = "/v2/assets/564ad616-2ace-4ea0-8fdb-7337ecb91177.png";

  function EmailLogo({ className }) {
    // Avocado logo composition (Component1 variant 13 in Figma)
    return (
      <div className={className || "h-[32.532px] overflow-clip relative w-[166.66px]"}>
        <div className="absolute inset-[0.51%_0_49.62%_0.01%] opacity-100" style={{ maskImage: `url('${emailImgVector}')`, WebkitMaskImage: `url('${emailImgVector}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: '-0.003px 0.002px', WebkitMaskPosition: '-0.003px 0.002px', maskSize: '166.644px 32.2px', WebkitMaskSize: '166.644px 32.2px' }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={emailImgVector1} />
        </div>
        <div className="absolute inset-[19.81%_5.61%_0.48%_20.43%] opacity-100" style={{ maskImage: `url('${emailImgVector}')`, WebkitMaskImage: `url('${emailImgVector}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: '-34.044px -6.277px', WebkitMaskPosition: '-34.044px -6.277px', maskSize: '166.644px 32.2px', WebkitMaskSize: '166.644px 32.2px' }}>
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={emailImgVector2} />
        </div>
      </div>
    );
  }

  function EmailSection() {
    return (
      <div className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:31331" data-name="section#email">
        {/* Email label */}
        <div className="border-[#c5c5c1] border-b-[1px] border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-black tracking-[1.504px] uppercase whitespace-nowrap">
            <p className="leading-[14px]">Email</p>
          </div>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + body */}
          <div className="gap-y-[24px] grid grid-cols-12 grid-rows-[216px_115.81px] h-[355.81px] relative shrink-0 w-full">
            <div className="col-start-7 col-span-4 content-stretch flex flex-col items-end justify-self-stretch max-w-[1047.6px] relative row-1 self-start shrink-0">
              <div className="content-stretch flex flex-col items-end relative shrink-0 w-full">
                <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[70.3px] text-black text-right tracking-[-3.008px] whitespace-nowrap">
                  <p className="leading-[72px]">Fast, branded</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-end relative shrink-0 w-full">
                <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[72px] text-black text-right tracking-[-3.008px] whitespace-nowrap">
                  <p className="leading-[72px]">resolutions</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-end relative shrink-0 w-full">
                <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[72px] text-black text-right tracking-[-3.008px] whitespace-nowrap">
                  <p className="leading-[72px]">over email</p>
                </div>
              </div>
            </div>
            <div className="col-start-1 col-span-4 content-stretch flex flex-col gap-[24px] items-start justify-self-stretch max-w-[420px] relative row-2 self-start shrink-0">
              <div className="font-['Inter:Regular',sans-serif] font-normal h-[71.81px] leading-[0] not-italic relative shrink-0 w-full">
                <div className="-translate-y-1/2 absolute flex flex-col h-[16px] justify-center left-0 text-[11.6px] text-[#626260] top-[13px] w-[14.42px]">
                  <p className="leading-[16px]">02</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[24px] justify-center left-[54.22px] text-[16.3px] text-[#313130] top-[11px] w-[351.76px]">
                  <p className="leading-[23.94px]">Clain replies instantly from your domain, in your</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[48px] justify-center left-0 text-[16.3px] text-[#313130] top-[46.91px] w-[414.26px]">
                  <p className="leading-[23.94px] mb-0">brand voice, with clarity and accuracy&mdash;making email</p>
                  <p className="leading-[23.94px]">as fast and reliable as any other support channel.</p>
                </div>
              </div>
              <div className="content-stretch flex flex-wrap h-[21px] items-start relative shrink-0 w-full">
                <div className="bg-black content-stretch flex h-full items-center justify-center pb-[5px] relative shrink-0">
                  <a className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[14.8px] text-black text-center tracking-[0.08px] whitespace-nowrap cursor-pointer" onClick={() => ClainV2.navigate('#')}>
                    <p className="cursor-pointer leading-[16px]">Learn more</p>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* 3 features + Email UI mockup */}
          <div className="grid grid-cols-[2fr_3fr] gap-x-[48px] gap-y-[48px] grid-rows-[454.12px] h-[454.13px] relative shrink-0 w-full">
            <div className="col-1 content-stretch flex flex-col gap-[23px] items-start pb-[202.31px] relative row-1 self-start shrink-0 w-[404.25px]">
              {[
                { title: 'Speed that customers notice', body: ['Clain responds to customers in seconds, turning email into a', 'channel that feels responsive, not delayed.'] },
                { title: 'Channel-native communication', body: ['Clain responds with clear formatting, cited sources, and', 'thoughtful follow-ups that feel natural in the inbox.'] },
                { title: 'Secure and reliable', body: ['Spam and phishing attempts are filtered out, so Clain only', 'responds to legitimate customers.'] },
              ].map((f) => (
                <div key={f.title} className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                  <p className="m-0 text-[16.3px] text-black leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{f.title}</p>
                  <div className="pt-[8px] w-full">
                    {f.body.map((line, i) => (
                      <p key={i} className="m-0 text-[12.8px] text-[#313130] leading-[18px] tracking-[0.496px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid col-2 content-stretch flex flex-col items-start justify-center justify-self-stretch p-px relative row-1 self-start shrink-0">
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col h-[452.13px] items-start overflow-clip relative shrink-0 w-full">
                    <div className="aspect-[604.41/452.41] relative shrink-0 w-full">
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={emailImgEmailUi} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex items-start left-[-1px] px-[11px] py-[9px] top-[-1px]">
                    <div className="h-[14px] relative shrink-0">
                      <p className="m-0 text-[11px] text-[#626260] tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Fig 2.A</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quote testimonial */}
          <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex flex-col items-start justify-center p-px relative shrink-0 w-full">
            <div className="h-[348px] relative shrink-0 w-full">
              <div className="bg-clip-padding border-0 border-transparent border-solid relative size-full">
                {/* Quote text */}
                <div className="absolute content-stretch flex flex-col inset-[24px_24px_116.5px_348px] items-start">
                  <div className="h-[175px] relative shrink-0 w-full">
                    <div className="absolute bg-[#ff5600] content-stretch flex items-start left-0 py-px top-[-2px]">
                      <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[29.1px] text-black tracking-[-0.4px] whitespace-nowrap">
                        <p className="leading-[35px] mb-0">{`We're fully committed to Clain as our frontline across`}</p>
                        <p className="leading-[35px]">channels &ndash; chat, email, phone, even sales.</p>
                      </div>
                    </div>
                    <div className="-translate-y-1/2 absolute flex flex-col font-['Inter:Light',sans-serif] font-light h-[36px] justify-center leading-[0] left-[564.92px] not-italic text-[27.9px] text-black top-[52px] tracking-[-0.4px] w-[36.43px]">
                      <p className="leading-[35px]">{`It's`}</p>
                    </div>
                    <div className="-translate-y-1/2 absolute flex flex-col font-['Inter:Light',sans-serif] font-light h-[106px] justify-center leading-[0] left-0 not-italic text-[28.9px] text-black top-[122px] tracking-[-0.4px] w-[666.56px]">
                      <p className="leading-[35px] mb-0">consistent, tireless, and always available. If</p>
                      <p className="leading-[35px] mb-0">{`customers are satisfied, there's no limit to what Clain`}</p>
                      <p className="leading-[35px]">can handle.</p>
                    </div>
                  </div>
                </div>
                {/* Footer credit */}
                <div className="absolute content-stretch flex flex-col gap-[4px] inset-[288px_24px_24px_348px] items-start">
                  <p className="m-0 text-[12.9px] text-black tracking-[0.496px] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Matt Jessell</p>
                  <p className="m-0 text-[10.5px] text-[#626260] tracking-[1.504px] uppercase leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>VP of sales operations at Avocado</p>
                </div>
                {/* Logo cell */}
                <div className="absolute border-[1px] border-[#c5c5c1] border-solid content-stretch flex inset-[24px_732.67px_24px_24px] items-start justify-center p-px">
                  <div className="flex-1 h-full min-w-px relative">
                    <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex items-center justify-center p-[24px] relative size-full">
                      <EmailLogo />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Corner decorations */}
        <div className="absolute border-[#c5c5c1] border-l-[1px] border-solid border-t-[1px] left-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-r-[1px] border-solid border-t-[1px] right-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-l-[1px] border-solid bottom-[8px] left-[8px] size-[24px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-r-[1px] border-solid bottom-[8px] right-[8px] size-[24px]" />
      </div>
    );
  }


  // SLACK PAGE — LIVE CHAT section (Figma node 2:31410)
  // Assets:
  const liveChatImgMessengerUi = "/v2/assets/8458e181-f068-4d3c-bbec-618709f4a57f.png";

  function LiveChatSection() {
    return (
      <div className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:31410" data-name="section#live-chat">
        {/* Live Chat label */}
        <div className="border-[#c5c5c1] border-b-[1px] border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-black tracking-[1.504px] uppercase whitespace-nowrap">
            <p className="leading-[14px]">Live Chat</p>
          </div>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + body */}
          <div className="gap-y-[24px] grid grid-cols-12 grid-rows-[144px_139.75px] h-[307.75px] relative shrink-0 w-full">
            <div className="col-span-10 content-stretch flex flex-col items-start justify-self-stretch max-w-[1047.6px] relative row-1 self-start shrink-0">
              <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[72px] text-black tracking-[-3.008px] w-full">
                <p className="leading-[72px]">Instant, conversational</p>
              </div>
              <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[70.3px] text-black tracking-[-3.008px] w-full">
                <p className="leading-[72px]">support over Messenger</p>
              </div>
            </div>
            <div className="col-span-4 content-stretch flex flex-col gap-[24px] items-start justify-self-stretch max-w-[420px] relative row-2 self-start shrink-0">
              <div className="font-['Inter:Regular',sans-serif] font-normal h-[95.75px] leading-[0] not-italic relative shrink-0 w-full">
                <div className="-translate-y-1/2 absolute flex flex-col h-[16px] justify-center left-0 text-[11.6px] text-[#626260] top-[13px] w-[14.68px]">
                  <p className="leading-[16px]">03</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[24px] justify-center left-[54.48px] text-[16.3px] text-[#313130] top-[11px] w-[362.06px]">
                  <p className="leading-[23.94px]">Clain Messenger resolves customer queries over</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[72px] justify-center left-0 text-[16.3px] text-[#313130] top-[58.87px] w-[411.1px]">
                  <p className="leading-[23.94px] mb-0">live chat across web, iOS, and Android, while giving</p>
                  <p className="leading-[23.94px] mb-0">you full control over branding and style.</p>
                  <p className="leading-[23.94px]">Conversations feel clear, natural, and conversational.</p>
                </div>
              </div>
              <div className="content-stretch flex flex-wrap h-[21px] items-start relative shrink-0 w-full">
                <div className="bg-black content-stretch flex h-full items-center justify-center pb-[5px] relative shrink-0">
                  <a className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[14.8px] text-black text-center tracking-[0.08px] whitespace-nowrap cursor-pointer" onClick={() => ClainV2.navigate('#')}>
                    <p className="cursor-pointer leading-[16px]">Learn more</p>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Messenger UI mockup + 3-feature list */}
          <div className="grid grid-cols-[3fr_2fr] gap-x-[24px] gap-y-[24px] grid-rows-[464.88px] h-[464.88px] relative shrink-0 w-full">
            <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid col-1 content-stretch flex flex-col items-start justify-center justify-self-stretch p-px relative row-1 self-start shrink-0">
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col h-[462.88px] items-start overflow-clip relative shrink-0 w-full">
                    <div className="aspect-[618.78/463.17] relative shrink-0 w-full">
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={liveChatImgMessengerUi} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex items-start left-[-1px] px-[11px] py-[9px] top-[-1px]">
                    <div className="h-[14px] relative shrink-0">
                      <p className="m-0 text-[11px] text-[#626260] tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Fig 3.A</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-2 content-stretch flex flex-col gap-[23px] items-start pb-[195.07px] relative row-1 self-start shrink-0 w-[413.86px]">
              {[
                { title: 'Conversational by design',  body: ['Clain replies naturally without quick-reply buttons, follows up if', 'customers go quiet, and shows sources in replies—making', 'conversations smoother and easier to trust.'] },
                { title: 'Completely on-brand',       body: ['Customize tone, style, and design so replies sound and look', 'like they came directly from your team.'] },
                { title: 'Consistent across devices', body: ['Whether customers reach you on web, iOS, or Android, Clain', 'delivers the same clear, high-quality support across devices.'] },
              ].map((f) => (
                <div key={f.title} className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                  <p className="m-0 text-[16.5px] text-black leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{f.title}</p>
                  <div className="pt-[8px] w-full">
                    {f.body.map((line, i) => (
                      <p key={i} className="m-0 text-[12.8px] text-[#313130] leading-[18px] tracking-[0.496px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Corner decorations */}
        <div className="absolute border-[#c5c5c1] border-l-[1px] border-solid border-t-[1px] left-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-r-[1px] border-solid border-t-[1px] right-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-l-[1px] border-solid bottom-[8px] left-[8px] size-[24px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-r-[1px] border-solid bottom-[8px] right-[8px] size-[24px]" />
      </div>
    );
  }


  // SLACK PAGE — SOCIAL MESSAGING section (Figma node 2:31462)
  const socialImgUi = "/v2/assets/c923a837-4dc6-4a13-a2d3-76d8da54e526.png";

  function SocialMessagingSection() {
    return (
      <div className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:31462" data-name="section#social-messaging">
        {/* Social messaging label */}
        <div className="border-[#c5c5c1] border-b-[1px] border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[10.8px] text-black tracking-[1.504px] uppercase whitespace-nowrap">
            <p className="leading-[14px]">Social messaging</p>
          </div>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + body */}
          <div className="gap-y-[24px] grid grid-cols-12 grid-rows-[144px_95.75px] h-[263.75px] relative shrink-0 w-full">
            <div className="col-span-10 content-stretch flex flex-col items-start justify-self-stretch relative row-1 self-start shrink-0">
              <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[71.7px] text-black tracking-[-3.008px] whitespace-nowrap">
                <p className="leading-[72px] mb-0">Meet customers on their favorite</p>
                <p className="leading-[72px]">apps</p>
              </div>
            </div>
            <div className="col-span-4 font-['Inter:Regular',sans-serif] font-normal h-[95.75px] justify-self-stretch leading-[0] not-italic relative row-2 shrink-0">
              <div className="-translate-y-1/2 absolute flex flex-col h-[16px] justify-center left-0 text-[11.6px] text-[#626260] top-[13px] w-[14.84px]">
                <p className="leading-[16px]">04</p>
              </div>
              <div className="-translate-y-1/2 absolute flex flex-col h-[24px] justify-center left-[54.64px] text-[16.3px] text-[#313130] top-[11px] w-[306.73px]">
                <p className="leading-[23.94px]">Clain provides quick, personal support on</p>
              </div>
              <div className="-translate-y-1/2 absolute flex flex-col h-[72px] justify-center left-0 text-[16.3px] text-[#313130] top-[58.88px] w-[415.7px]">
                <p className="leading-[23.94px] mb-0">WhatsApp, Instagram, Facebook Messenger, SMS,</p>
                <p className="leading-[23.94px] mb-0">and Discord, meeting customers where they already</p>
                <p className="leading-[23.94px]">are, with conversations that feel natural and personal.</p>
              </div>
            </div>
          </div>

          {/* Social UI mockup + 3 features */}
          <div className="grid grid-cols-1 grid-rows-[557.03px_85.94px] gap-x-[24px] gap-y-[24px] h-[666.97px] relative shrink-0 w-full">
            <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid col-1 content-stretch flex flex-col items-start justify-center justify-self-stretch p-px relative row-1 self-start shrink-0">
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col h-[555.03px] items-start overflow-clip relative shrink-0 w-full">
                    <div className="aspect-[1056.66/555.2] relative shrink-0 w-full">
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={socialImgUi} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex items-start left-[-1px] px-[11px] py-[9px] top-[-1px]">
                    <div className="h-[14px] relative shrink-0">
                      <p className="m-0 text-[11px] text-[#626260] tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Fig 4.A</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-1 content-stretch flex gap-[24px] h-[85.94px] items-start justify-center justify-self-stretch relative row-2 shrink-0">
              {[
                { title: 'Designed for messaging apps',     body: [`Clain's replies are designed for messaging apps, so`, 'every answer feels at home in Instagram,', 'Messenger, or WhatsApp.'] },
                { title: 'Personal and conversational',     body: ['Conversations feel like a direct line to your brand,', 'building trust and strengthening relationships.'] },
                { title: 'Seamless customer experiences',   body: ['From product questions to order tracking, Clain', 'resolves a wide range of requests within the same', 'channel.'] },
              ].map((f) => (
                <div key={f.title} className="h-full relative shrink-0 w-[336.88px]">
                  <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[-1px]">
                    <p className="m-0 text-[16.5px] text-black whitespace-nowrap leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{f.title}</p>
                  </div>
                  <div className="absolute content-stretch flex flex-col items-start left-0 pt-[8px] right-0 top-[23.94px]">
                    {f.body.map((line, i) => (
                      <p key={i} className="m-0 text-[12.8px] text-[#313130] tracking-[0.496px] w-full leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute border-[#c5c5c1] border-l-[1px] border-solid border-t-[1px] left-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-r-[1px] border-solid border-t-[1px] right-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-l-[1px] border-solid bottom-[8px] left-[8px] size-[24px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-r-[1px] border-solid bottom-[8px] right-[8px] size-[24px]" />
      </div>
    );
  }


  // SLACK PAGE — SLACK section (Figma node 2:31507)
  const slackImgVector  = "/v2/assets/382ebcd4-0677-47ec-8bce-663cbe18d668.svg";
  const slackImgVector1 = "/v2/assets/4536d026-9cfd-4c76-b33f-cb869f5688dd.svg";
  const slackImgVector2 = "/v2/assets/c9394d8e-e6a4-4433-a254-be667f1c7d22.svg";
  const slackImgUi      = "/v2/assets/3395680b-1b13-4941-95fa-0d6c7ace6ff8.png";

  function SlackClayLogo({ className }) {
    // Clay logo — 3 vector layers (Component1 variant 14 in Figma)
    return (
      <div className={className || "h-[58.875px] overflow-clip relative w-[125px]"}>
        <div className="absolute inset-[15.33%_0.01%_15.45%_0.04%] opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={slackImgVector} />
        </div>
        <div className="absolute inset-[32.84%_16.48%_23.16%_15.12%] opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={slackImgVector1} />
        </div>
        <div className="absolute inset-[43.91%_70.69%_24.85%_18.98%] opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={slackImgVector2} />
        </div>
      </div>
    );
  }

  function SlackSection() {
    return (
      <div className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:31507" data-name="section#slack">
        {/* Slack label */}
        <div className="border-[#c5c5c1] border-b-[1px] border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[10.8px] text-black tracking-[1.504px] uppercase whitespace-nowrap">
            <p className="leading-[14px]">Slack</p>
          </div>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + body */}
          <div className="gap-y-[24px] grid grid-cols-12 grid-rows-[144px_95.75px] h-[263.75px] relative shrink-0 w-full">
            <div className="col-start-5 col-span-6 content-stretch flex flex-col items-end justify-self-stretch max-w-[1047.6px] relative row-1 self-start shrink-0">
              <div className="content-stretch flex flex-col items-end relative shrink-0 w-full">
                <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[72px] text-black text-right tracking-[-3.008px] whitespace-nowrap">
                  <p className="leading-[72px]">Clain delivers trusted</p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-end relative shrink-0 w-full">
                <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[72px] text-black text-right tracking-[-3.008px] whitespace-nowrap">
                  <p className="leading-[72px]">support in Slack</p>
                </div>
              </div>
            </div>
            <div className="col-start-1 col-span-4 font-['Inter:Regular',sans-serif] font-normal h-[95.75px] justify-self-stretch leading-[0] not-italic relative row-2 shrink-0">
              <div className="-translate-y-1/2 absolute flex flex-col h-[16px] justify-center left-0 text-[11.8px] text-[#626260] top-[13px] w-[14.72px]">
                <p className="leading-[16px]">05</p>
              </div>
              <div className="-translate-y-1/2 absolute flex flex-col h-[24px] justify-center left-[54.51px] text-[16.3px] text-[#313130] top-[11px] w-[348.73px]">
                <p className="leading-[23.94px]">Clain supports your customers directly in Slack</p>
              </div>
              <div className="-translate-y-1/2 absolute flex flex-col h-[72px] justify-center left-0 text-[16.2px] text-[#313130] top-[58.88px] w-[387.85px]">
                <p className="leading-[23.94px] mb-0">communities and dedicated Connect channels&mdash;</p>
                <p className="leading-[23.94px] mb-0">resolving questions instantly, with replies that stay</p>
                <p className="leading-[23.94px]">threaded and feel native to Slack.</p>
              </div>
            </div>
          </div>

          {/* Slack UI mockup + 3 features */}
          <div className="grid grid-cols-1 grid-rows-[557.03px_85.94px] gap-x-[24px] gap-y-[24px] h-[666.97px] relative shrink-0 w-full">
            <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid col-1 content-stretch flex flex-col items-start justify-center justify-self-stretch p-px relative row-1 self-start shrink-0">
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col h-[555.03px] items-start overflow-clip relative shrink-0 w-full">
                    <div className="aspect-[1056.66/555.2] relative shrink-0 w-full">
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={slackImgUi} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex items-start left-[-1px] px-[11px] py-[9px] top-[-1px]">
                    <div className="h-[14px] relative shrink-0">
                      <p className="m-0 text-[11px] text-[#626260] tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Fig 5.A</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-1 content-stretch flex gap-[24px] h-[85.94px] items-start justify-center justify-self-stretch relative row-2 shrink-0">
              {[
                { title: 'Slack-native experience',     body: [`Clain's answers appear naturally in Slack threads,`, 'using the same formatting, names, and style your', 'customers expect.'] },
                { title: 'Works alongside your team',  body: ['Control when Clain responds using triggers and', 'workflows—so Clain and your human agents can', 'collaborate smoothly in shared Slack channels.'] },
                { title: 'Complete visibility',         body: ['Every Slack conversation is logged in Clain, so', `you can review Clain's answers, track performance,`, 'and continuously improve.'] },
              ].map((f) => (
                <div key={f.title} className="h-full relative shrink-0 w-[336.88px]">
                  <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[-1px]">
                    <p className="m-0 text-[16.6px] text-black whitespace-nowrap leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{f.title}</p>
                  </div>
                  <div className="absolute content-stretch flex flex-col items-start left-0 pt-[8px] right-0 top-[23.94px]">
                    {f.body.map((line, i) => (
                      <p key={i} className="m-0 text-[12.8px] text-[#313130] tracking-[0.496px] w-full leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quote testimonial — Jess Bergson / Clay */}
          <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex flex-col items-start justify-center p-px relative shrink-0 w-full">
            <div className="h-[353px] relative shrink-0 w-full">
              <div className="bg-clip-padding border-0 border-transparent border-solid relative size-full">
                <div className="absolute content-stretch flex flex-col inset-[24px_24px_84px_348px] items-start">
                  <div className="font-['Inter:Light',sans-serif] font-light h-[245px] leading-[0] not-italic relative shrink-0 text-black tracking-[-0.4px] w-full">
                    <div className="-translate-y-1/2 absolute flex flex-col h-[141px] justify-center left-0 text-[29px] top-[69.5px] w-[647.1px]">
                      <p className="leading-[35px] mb-0">Rolling out Clain in Slack and over email was a big</p>
                      <p className="leading-[35px] mb-0">moment for us. These are two of our most critical</p>
                      <p className="leading-[35px] mb-0">{`support channels—Slack especially, since it's so`}</p>
                      <p className="leading-[35px]">{`public—so we needed it to be flawless. `}</p>
                    </div>
                    <div className="absolute bg-[#ff5600] h-[73px] left-0 top-[103px] w-[627.72px]">
                      <div className="-translate-y-1/2 absolute flex flex-col h-[36px] justify-center left-[523.48px] text-[29.3px] top-[19px] w-[69.4px]">
                        <p className="leading-[35px]">I was</p>
                      </div>
                      <div className="-translate-y-1/2 absolute flex flex-col h-[36px] justify-center left-0 text-[29px] top-[54px] w-[627.92px]">
                        <p className="leading-[35px]">amazed at how smooth the rollout actually was.</p>
                      </div>
                    </div>
                    <div className="-translate-y-1/2 absolute flex flex-col h-[71px] justify-center left-0 text-[29.1px] top-[209.5px] w-[644.09px]">
                      <p className="leading-[35px] mb-0">Within days, Clain was confidently resolving a high</p>
                      <p className="leading-[35px]">percentage of questions across both channels.</p>
                    </div>
                  </div>
                </div>
                <div className="absolute content-stretch flex flex-col gap-[4px] inset-[293px_24px_24px_348px] items-start">
                  <p className="m-0 text-[13px] text-black tracking-[0.496px] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Jess Bergson</p>
                  <p className="m-0 text-[10.5px] text-[#626260] tracking-[1.504px] uppercase leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Head of CX at Clay</p>
                </div>
                <div className="absolute border-[1px] border-[#c5c5c1] border-solid content-stretch flex inset-[24px_732.67px_24px_24px] items-start justify-center p-px">
                  <div className="flex-1 h-full min-w-px relative">
                    <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex items-center justify-center p-[24px] relative size-full">
                      <SlackClayLogo />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute border-[#c5c5c1] border-l-[1px] border-solid border-t-[1px] left-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-r-[1px] border-solid border-t-[1px] right-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-l-[1px] border-solid bottom-[8px] left-[8px] size-[24px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-r-[1px] border-solid bottom-[8px] right-[8px] size-[24px]" />
      </div>
    );
  }


  // SLACK PAGE — API section (Figma node 2:31575)
  const apiImgUi = "/v2/assets/986290db-2d90-4ec9-8f19-b4bdf44d9dc9.png";

  function ApiSection() {
    return (
      <div className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:31575" data-name="section#api">
        {/* API label */}
        <div className="border-[#c5c5c1] border-b-[1px] border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-black tracking-[1.504px] uppercase whitespace-nowrap">
            <p className="leading-[14px]">API</p>
          </div>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + body */}
          <div className="gap-y-[24px] grid grid-cols-12 grid-rows-[144px_139.75px] h-[307.75px] relative shrink-0 w-full">
            <div className="col-span-10 content-stretch flex flex-col items-start justify-self-stretch max-w-[1047.6px] relative row-1 self-start shrink-0">
              <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[72px] text-black tracking-[-3.008px] w-full">
                <p className="leading-[72px]">Integrate Clain into your</p>
              </div>
              <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[71.4px] text-black tracking-[-3.008px] w-full">
                <p className="leading-[72px]">custom-built products</p>
              </div>
            </div>
            <div className="col-start-7 col-span-4 content-stretch flex flex-col gap-[24px] items-start justify-self-stretch max-w-[420px] relative row-2 self-start shrink-0">
              <div className="font-['Inter:Regular',sans-serif] font-normal h-[95.75px] leading-[0] not-italic relative shrink-0 w-full">
                <div className="-translate-y-1/2 absolute flex flex-col h-[16px] justify-center left-0 text-[12px] text-[#626260] top-[13px] w-[15.08px]">
                  <p className="leading-[16px]">06</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[24px] justify-center left-[54.87px] text-[16.6px] text-[#313130] top-[11px] w-[345.68px]">
                  <p className="leading-[23.94px]">{`Use Clain's API to embed Clain into your custom`}</p>
                </div>
                <div className="-translate-y-1/2 absolute flex flex-col h-[72px] justify-center left-0 text-[16.3px] text-[#313130] top-[58.88px] w-[404.12px]">
                  <p className="leading-[23.94px] mb-0">app, delivering fast, accurate support wherever your</p>
                  <p className="leading-[23.94px] mb-0">customers need it, without changing your existing</p>
                  <p className="leading-[23.94px]">systems.</p>
                </div>
              </div>
              <div className="content-stretch flex flex-wrap h-[21px] items-start relative shrink-0 w-full">
                <div className="bg-black content-stretch flex h-full items-center justify-center pb-[5px] relative shrink-0">
                  <a className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[14.8px] text-black text-center tracking-[0.08px] whitespace-nowrap cursor-pointer" onClick={() => ClainV2.navigate('#')}>
                    <p className="cursor-pointer leading-[16px]">Learn more</p>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* API UI mockup + 3 features */}
          <div className="grid grid-cols-1 grid-rows-[557.03px_85.94px] gap-x-[24px] gap-y-[24px] h-[666.97px] relative shrink-0 w-full">
            <div className="bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid col-1 content-stretch flex flex-col items-start justify-center justify-self-stretch p-px relative row-1 self-start shrink-0">
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full">
                  <div className="h-[555.03px] overflow-clip relative shrink-0 w-full">
                    <div className="absolute aspect-[1056.66/556.13] left-0 right-0 top-0">
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <img alt="" className="absolute left-0 max-w-none size-full top-0" src={apiImgUi} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute bg-[#f4f3ec] border-[1px] border-[#c5c5c1] border-solid content-stretch flex items-start left-[-1px] px-[11px] py-[9px] top-[-1px]">
                    <div className="h-[14px] relative shrink-0">
                      <p className="m-0 text-[11px] text-[#626260] tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Fig 6.A</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-1 content-stretch flex gap-[24px] h-[85.94px] items-start justify-center justify-self-stretch relative row-2 shrink-0">
              {[
                { title: 'Flexible integration',           body: ['Connect Clain to custom-built channels—like', 'chatbots, self-service portals, or apps—while', `keeping your platform's design and flow intact.`] },
                { title: 'Keep your brand front and center', body: ['Offer AI-powered support fully under your brand,', 'with no third-party interfaces or external agents in', 'view.'] },
                { title: 'Complete control',               body: ['Define exactly how and where Clain responds to', 'ensure the experience fits seamlessly into your', 'customer journey.'] },
              ].map((f) => (
                <div key={f.title} className="h-full relative shrink-0 w-[336.88px]">
                  <div className="absolute content-stretch flex flex-col items-start left-0 right-0 top-[-1px]">
                    <p className="m-0 text-[16.5px] text-black whitespace-nowrap leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{f.title}</p>
                  </div>
                  <div className="absolute content-stretch flex flex-col items-start left-0 pt-[8px] right-0 top-[23.94px]">
                    {f.body.map((line, i) => (
                      <p key={i} className="m-0 text-[12.8px] text-[#313130] tracking-[0.496px] w-full leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute border-[#c5c5c1] border-l-[1px] border-solid border-t-[1px] left-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-r-[1px] border-solid border-t-[1px] right-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-l-[1px] border-solid bottom-[8px] left-[8px] size-[24px]" />
        <div className="absolute border-[#c5c5c1] border-b-[1px] border-r-[1px] border-solid bottom-[8px] right-[8px] size-[24px]" />
      </div>
    );
  }


  // SLACK PAGE — FAQs section (Figma node 2:31627)
  const faqsImgChevron = "/v2/assets/8b8903d5-c749-400c-9d91-027a55838f2b.svg";

  function FaqsChevron({ className }) {
    return (
      <div className={className || "overflow-clip relative size-[17px]"}>
        <div className="absolute inset-[22.23%_32.52%_26.59%_36.89%] opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={faqsImgChevron} />
        </div>
      </div>
    );
  }

  const FAQS_SLACK = [
    'What channels does Clain support?',
    'Can Clain maintain conversation context across channels?',
    'How does Clain handle phone support?',
    'How does Clain work on live chat?',
    'How does Clain handle email support?',
    'How does Clain work on social messaging apps?',
    'How does Clain work in Slack?',
    'Can I embed Clain into my own product via API?',
    'How do I set up Clain on a new channel?',
    'How much does Clain cost across channels?',
  ];

  function FaqsSection() {
    return (
      <div className="bg-[#080f1e] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:31627" data-name="section#faqs">
        {/* FAQs label */}
        <div className="border-[#393f4b] border-b-[1px] border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <div className="flex flex-col font-['Inter:Regular',sans-serif] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[11px] text-white tracking-[1.504px] uppercase whitespace-nowrap">
            <p className="leading-[14px]">FAQs</p>
          </div>
        </div>

        <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
          {/* Heading */}
          <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
            <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[52.4px] text-white tracking-[-3.008px] w-full">
              <p className="leading-[54px]">FAQs</p>
            </div>
          </div>

          {/* Accordion list */}
          <div className="content-stretch flex flex-col items-start pt-[40px] relative shrink-0 w-full">
            {/* Top divider */}
            <div className="bg-gradient-to-r from-1/2 from-[#393f4b] h-px relative shrink-0 to-1/2 to-[rgba(57,63,75,0)] w-full" />
            {FAQS_SLACK.map((q) => (
              <React.Fragment key={q}>
                <div className="content-stretch flex items-center justify-between pr-[0.01px] py-[16px] relative shrink-0 w-full cursor-pointer">
                  <div className="h-[23.94px] relative shrink-0">
                    <p className="m-0 text-[16.6px] text-[#cecfd2] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{q}</p>
                  </div>
                  <div className="content-stretch flex h-[17px] items-start justify-center relative shrink-0">
                    <div className="flex h-full items-center justify-center relative shrink-0 w-[17px]">
                      <div className="rotate-90">
                        <FaqsChevron />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-1/2 from-[#393f4b] h-px relative shrink-0 to-1/2 to-[rgba(57,63,75,0)] w-full" />
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Corner decorations */}
        <div className="absolute border-[#393f4b] border-l-[1px] border-solid border-t-[1px] left-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#393f4b] border-r-[1px] border-solid border-t-[1px] right-[8px] size-[24px] top-[8px]" />
        <div className="absolute border-[#393f4b] border-b-[1px] border-l-[1px] border-solid bottom-[8px] left-[8px] size-[24px]" />
        <div className="absolute border-[#393f4b] border-b-[1px] border-r-[1px] border-solid bottom-[8px] right-[8px] size-[24px]" />
      </div>
    );
  }


  // SLACK PAGE — FINAL CTA section (Figma node 2:31808)
  const finalCtaImg = "/v2/assets/5c48d775-86fe-4f31-b36e-967dd1738cd6.png";

  function SlackFinalCtaSection() {
    return (
      <div className="content-stretch flex flex-col items-start relative size-full" data-node-id="2:31808">
        <div className="absolute inset-0 max-w-[1600px] mx-auto overflow-clip">
          <div className="absolute content-stretch flex flex-col h-[538px] items-start justify-center left-0 overflow-clip top-0 w-full" style={{ opacity: 0.81 }}>
            <div className="content-stretch flex flex-1 flex-col items-start min-h-px relative w-full">
              <div className="h-[538px] relative shrink-0 w-full">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute left-0 max-w-none size-full top-0" src={finalCtaImg} />
                </div>
              </div>
            </div>
          </div>
          {/* Radial vignette */}
          <div className="absolute inset-0" style={{ opacity: 0.6, background: 'radial-gradient(ellipse 1018px 380px at center, rgba(2,9,23,1) 0%, rgba(2,9,23,0) 75%, rgba(2,9,23,0) 100%)' }} />
          {/* Edge gradients */}
          <div className="absolute h-[128px] left-0 right-0 top-0" style={{ background: 'linear-gradient(to bottom, #020917 0%, rgba(2,9,23,0.75) 50%, rgba(2,9,23,0) 100%)' }} />
          <div className="absolute h-[128px] left-0 right-0 bottom-0" style={{ background: 'linear-gradient(to top, #020917 0%, rgba(2,9,23,0.75) 50%, rgba(2,9,23,0) 100%)' }} />
          <div className="absolute h-full top-0 right-0 w-[144px]" style={{ background: 'linear-gradient(to left, #020917 0%, rgba(2,9,23,0.75) 50%, rgba(2,9,23,0) 100%)' }} />
          <div className="absolute h-full top-0 left-0 w-[144px]" style={{ background: 'linear-gradient(to right, #020917 0%, rgba(2,9,23,0.75) 50%, rgba(2,9,23,0) 100%)' }} />
        </div>

        {/* Content */}
        <div className="grid grid-cols-12 gap-[48px] grid-rows-[218px] h-[538px] max-w-[1600px] mx-auto overflow-clip px-[24px] py-[160px] relative shrink-0 w-full">
          <div className="col-start-3 col-span-8 grid grid-rows-[176px_42px] h-[218px] justify-self-stretch relative row-1 shrink-0">
            <div className="content-stretch flex flex-col items-start justify-self-stretch pb-[32px] relative row-1 self-start shrink-0">
              <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[70.3px] tracking-[-3.008px] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <p className="leading-[72px]">Get started with the</p>
                </div>
                <div className="content-stretch flex flex-col items-end relative shrink-0 w-full">
                  <div className="flex flex-col font-['Inter:Light',sans-serif] font-light justify-center leading-[0] not-italic relative shrink-0 text-[69.3px] text-white text-right tracking-[-3.008px] whitespace-nowrap">
                    <p className="leading-[72px]">#1 AI Agent today</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-stretch flex flex-wrap gap-[12px] h-[42px] items-start justify-self-stretch relative row-2 shrink-0">
              <button onClick={() => ClainV2.navigate('/signup')} className="bg-white border-0 cursor-pointer flex h-full items-center justify-center px-[16px] py-[13px] rounded-[6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.4, lineHeight: '16px', letterSpacing: '-0.32px', color: '#000' }}>Start free trial</button>
              <button onClick={() => ClainV2.navigate('/demo')} className="bg-transparent cursor-pointer flex h-full items-center justify-center px-[17px] py-[13px] rounded-[6px] text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.8, lineHeight: '16px', letterSpacing: '-0.32px', border: '1px solid white' }}>View demo</button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  /* ─────────── Main page with sticky sidebar layout ─────────── */
  function AiAgentSlackPage() {
    const [activeSection, setActiveSection] = useState('voice');

    useEffect(() => {
      const sections = SLACK_CHAPTERS.map(c => document.getElementById(c.id)).filter(Boolean);
      if (!sections.length) return;
      const observer = new IntersectionObserver(
        (entries) => {
          // Pick the first entry that is intersecting
          const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible.length) setActiveSection(visible[0].target.id);
        },
        { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
      );
      sections.forEach(s => observer.observe(s));
      return () => observer.disconnect();
    }, []);

    function scrollToSection(id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    return (
      <PageShell>
        <div style={{ background: "#020917", width: "100%" }}>
          <SlackHero />
          {/* Main content area: 1392px wide, sticky sidebar + section column */}
          <div style={{ maxWidth: 1440, margin: "0 auto", paddingLeft: 24, paddingRight: 24, position: "relative" }}>
            <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
              {/* Sticky chapter nav sidebar — 205px wide */}
              <aside style={{ width: 205, flexShrink: 0, position: "sticky", top: 100, paddingTop: 16 }}>
                <ChapterNav activeId={activeSection} onClick={scrollToSection} />
              </aside>
              {/* Right column — 7 sections stacked */}
              <div style={{ flex: 1, minWidth: 0, maxWidth: 1155 }}>
                <section id="voice"           style={{ scrollMarginTop: 80 }}><VoiceSection /></section>
                <section id="email"           style={{ scrollMarginTop: 80 }}><EmailSection /></section>
                <section id="live-chat"       style={{ scrollMarginTop: 80 }}><LiveChatSection /></section>
                <section id="social-messaging" style={{ scrollMarginTop: 80 }}><SocialMessagingSection /></section>
                <section id="slack"           style={{ scrollMarginTop: 80 }}><SlackSection /></section>
                <section id="api"             style={{ scrollMarginTop: 80 }}><ApiSection /></section>
                <section id="faqs"            style={{ scrollMarginTop: 80 }}><FaqsSection /></section>
              </div>
            </div>
          </div>
          {/* Final CTA full-width */}
          <div style={{ width: "100%", height: 538, position: "relative", overflow: "hidden" }}>
            <SlackFinalCtaSection />
          </div>
        </div>
      </PageShell>
    );
  }

  window.AiAgentSlackPage = AiAgentSlackPage;
})();
