/* global React, ClainV2 */
(function () {
  const { useState } = React;
  const { PageShell } = ClainV2;

  /* ── Hero assets ── */
  const imgHeroIllustration = "/v2/assets/77820a72-82de-40fb-a4aa-857928b932d0.jpg";
  const imgHeroImage = "/v2/assets/1932ec80-366c-4bf4-9449-dc426531b9fb.png";

  /* ── Productivity assets ── */
  const imgProdGroup = "/v2/assets/5c08b485-b305-47bd-b632-fc94f4071793.svg";
  const imgProdGroup1 = "/v2/assets/e1f72566-9cd2-4d5a-8ff6-a14e508939d3.svg";
  const imgProdGroup2 = "/v2/assets/7a5e1e6c-35bf-4070-bb8e-a9024a76a2b3.svg";
  const imgProdBees = "/v2/assets/d80655f7-457a-4981-b353-c868cd58a1a7.png";
  const imgProdUi = "/v2/assets/4f85a1a6-70f9-490d-995e-98f63d7defd7.png";
  const imgProdAngelo = "/v2/assets/6fe7ca17-b023-455d-90b6-10345ccbb485.png";

  /* ── Usability assets ── */
  const imgUsabPeople = "/v2/assets/db844e5a-00a6-4be6-96f6-241037e40034.png";
  const imgUsabInsight = "/v2/assets/df87871a-5cfd-4743-bdae-9cf3aaf43775.png";
  const imgUsabTickets = "/v2/assets/8ab0e700-13ad-4bcf-a9ad-c05e5bae8cb1.png";
  const imgUsabIntegration = "/v2/assets/ab8056df-05c3-41aa-a90e-8999c75b45a8.png";

  /* ── Outbound assets ── */
  const imgOutbVector = "/v2/assets/c7818938-7240-4f79-b339-95a672d656d4.svg";
  const imgOutbSatellite = "/v2/assets/7e6d8ebd-25e2-49b5-ab33-879db70388e1.png";
  const imgOutbProduct = "/v2/assets/ba15f948-8bb5-4636-bc6c-e03e07d1973c.png";

  /* ── Features assets ── */
  const imgFeatVector = "/v2/assets/dc7637c6-f557-4e38-ad82-5bf4e5ff349a.svg";
  const imgFeatVector1 = "/v2/assets/0a0c19d5-b6ae-421e-aa39-fcbb1c7b4bc9.svg";
  const imgFeatInbox = "/v2/assets/24841882-0209-4b41-99fd-536257b3e080.png";
  const imgFeatCopilot = "/v2/assets/7013b590-dbd7-4d89-a435-50242c11d6f9.png";
  const imgFeatTickets = "/v2/assets/9ad222af-ce14-4239-b6c6-4157c183cc83.png";
  const imgFeatOmnichannel = "/v2/assets/ba2a1af9-13df-410e-bc2e-330a2e864e47.png";
  const imgFeatHelpCenter = "/v2/assets/52778cc3-0ed5-4065-a51b-097b0ce86abd.png";
  const imgFeatApps = "/v2/assets/8aeaef54-2664-4864-99e4-ceaa1ed4e959.png";
  const imgFeatReporting = "/v2/assets/90f65eca-1f7d-4c04-a175-05a6a1a5e13d.png";
  const imgFeatKnowledge = "/v2/assets/701881a6-15cd-46f2-a7fd-3ffb37b421ac.png";
  const imgFeatOutbound = "/v2/assets/b911afc5-8390-469f-8489-f2c279515084.png";

  /* ── CTA assets ── */
  const imgCtaBanner = "/v2/assets/c8618c35-8dce-4026-92c8-00c8d5c155fa.jpg";

  const FEATURES = [
    { name: 'Inbox', img: imgFeatInbox, desc: 'Resolve customer questions across email, chat, phone, and social in one AI-powered inbox.', link: '/inbox' },
    { name: 'Copilot', img: imgFeatCopilot, desc: 'An AI assistant that helps agents find answers faster and resolve issues more efficiently.', link: '/copilot' },
    { name: 'Tickets', img: imgFeatTickets, desc: 'Streamline complex issue resolution with collaborative ticketing built for modern teams.', link: '/tickets' },
    { name: 'Omnichannel', img: imgFeatOmnichannel, desc: 'Meet customers wherever they are with seamless cross-channel support.', link: '/omnichannel' },
    { name: 'Help Center', img: imgFeatHelpCenter, desc: 'Empower customers to find answers on their own with a beautiful, searchable help center.', link: '/knowledge' },
    { name: 'Apps & Integrations', img: imgFeatApps, desc: 'Connect your favorite tools and extend Clain with powerful integrations.', link: '/integrations' },
    { name: 'Reporting', img: imgFeatReporting, desc: 'Monitor, analyze and optimize your support with powerful, customizable reports.', link: '/reporting' },
    { name: 'Knowledge Hub', img: imgFeatKnowledge, desc: 'Centralize your content for AI and human support in one powerful knowledge base.', link: '/knowledge' },
    { name: 'Outbound', img: imgFeatOutbound, desc: 'Proactively reach customers with targeted messages that reduce support volume.', link: '#' },
  ];

  function FeatureArrow({ active }) {
    return (
      <div className={`relative shrink-0 size-[36px] transition-opacity${active ? '' : ' opacity-0'}`}>
        <img loading="lazy" decoding="async" alt="" className="absolute inset-0 max-w-none size-full" src={imgFeatVector} />
        <img loading="lazy" decoding="async" alt="" className="absolute inset-0 max-w-none size-full" src={imgFeatVector1} />
      </div>
    );
  }

  const HERO_FEATURES = ['Inbox','Copilot','Tickets','Omnichannel','Help Center','Apps & Integrations','Reporting','Knowledge Hub','Outbound'];

  function HowItWorksPage() {
    const [activeFeature, setActiveFeature] = useState(7);

    return (
      <PageShell>
        {/* ═══════ Section 1 — Hero ═══════ */}
        <div className="relative w-full overflow-hidden" style={{ background: '#17100e' }}>
          {/* Background illustration */}
          <div className="absolute inset-0" style={{ opacity: 0.75, background: 'linear-gradient(to bottom, #3462bd, #83a1ad)' }}>
            <img loading="lazy" decoding="async" alt="" className="absolute inset-0 w-full h-full object-cover" src={imgHeroIllustration} />
          </div>
          {/* Fade overlay top half */}
          <div className="absolute top-0 left-0 right-0 bottom-1/2" style={{ background: 'linear-gradient(to bottom, #17100e 0%, transparent 100%)' }} />

          <div className="relative max-w-[1230px] mx-auto px-6 pt-[151px] pb-[160px]">
            {/* Heading + description + buttons */}
            <div className="flex flex-col gap-8 max-w-[760px]" style={{ opacity: 1 }}>
              <div>
                <p className="font-semibold text-white leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '74px' }}>The next-gen platform</p>
                <p className="font-semibold text-white leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '74px', paddingLeft: '230px' }}>designed for efficiency</p>
              </div>
              <div className="max-w-[500px]">
                <p className="text-white text-[16px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif" }}>Clain is a modern, AI-powered platform with the tools, workflows and insights agents need to work faster and deliver the highest quality customer service.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <a data-spa href="/demo" className="border border-white rounded-[6px] px-[17px] py-[11px] text-white text-[15px] font-semibold tracking-[-0.4px] text-center no-underline" style={{ fontFamily: "'Inter', sans-serif" }}>View demo</a>
                <a data-spa href="/signup" className="bg-white rounded-[6px] px-[16px] py-[10px] text-[#17100e] text-[15px] font-semibold tracking-[-0.4px] text-center no-underline" style={{ fontFamily: "'Inter', sans-serif" }}>Start free trial</a>
              </div>
            </div>

            {/* Product visual */}
            <div className="mt-12 relative rounded-lg overflow-hidden" style={{ aspectRatio: '1230/792' }}>
              <img loading="lazy" decoding="async" alt="" className="absolute inset-0 w-full h-full object-cover" src={imgHeroImage} />
            </div>

            {/* Feature icon row */}
            <div className="flex flex-wrap gap-x-12 gap-y-2 mt-10 items-center">
              {HERO_FEATURES.map((label) => (
                <span key={label} className="font-normal text-[12px] text-white tracking-[1.2px] uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif" }}>{label}</span>
              ))}
            </div>

            {/* How Clain drives efficiency */}
            <div className="mt-12 flex flex-col gap-12">
              <div className="text-center">
                <p className="font-semibold text-white text-[44px] leading-[55px] tracking-[-1.44px] m-0" style={{ fontFamily: "'Inter', sans-serif" }}>How Clain drives efficiency</p>
              </div>
              {/* 3-column bar */}
              <div className="flex gap-8 p-8 rounded-[6px] border border-white/20" style={{ backdropFilter: 'blur(10px)', background: 'rgba(255,255,255,0.01)' }}>
                {[
                  { label: 'Productivity', title1: 'AI tools that maximize', title2: 'productivity' },
                  { label: 'Usability', title1: "Modern software that's fast", title2: 'and friction-free' },
                  { label: 'Outbound', title1: 'Outbound messaging that', title2: 'reduces support volume' },
                ].map((col, i) => (
                  <React.Fragment key={col.label}>
                    {i > 0 && <div className="w-px shrink-0 self-stretch bg-white/20" />}
                    <div className="flex-1 flex flex-col gap-4">
                      <span className="bg-white rounded-full px-4 py-[5px] text-[12px] text-[#17100e] tracking-[1.2px] uppercase self-start" style={{ fontFamily: "'Inter', sans-serif" }}>{col.label}</span>
                      <div>
                        <p className="font-semibold text-white text-[26px] leading-[32px] tracking-[-0.66px] m-0" style={{ fontFamily: "'Inter', sans-serif" }}>{col.title1}</p>
                        <p className="font-semibold text-white text-[26px] leading-[32px] tracking-[-0.66px] m-0" style={{ fontFamily: "'Inter', sans-serif" }}>{col.title2}</p>
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 2 — Productivity ═══════ */}
        <div className="w-full" style={{ background: '#f4f3ec' }}>
          <div className="max-w-[1160px] mx-auto px-6 py-[96px]">
            {/* Header */}
            <div className="flex flex-col gap-6 mb-8">
              <div>
                <p className="font-semibold text-black leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '74px' }}>AI tools that</p>
                <p className="font-semibold text-black leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '73px', paddingLeft: '229px' }}>maximize productivity</p>
              </div>
              <p className="max-w-[480px] text-[16.5px] leading-[24px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.8)' }}>Agents can resolve complex queries more efficiently in any language with instant assistance from Copilot, no-code workflows, and AI Inbox Translation.</p>
            </div>

            {/* Bees illustration */}
            <div className="rounded-[6px] overflow-hidden mb-12" style={{ aspectRatio: '1160/396' }}>
              <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgProdBees} />
            </div>

            {/* Product UI screenshot */}
            <div className="bg-[#e7e6df] rounded-[10px] overflow-hidden mb-6" style={{ aspectRatio: '1160/490' }}>
              <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgProdUi} />
            </div>

            {/* 3-column features */}
            <div className="flex gap-0 justify-between mb-12">
              {[
                { title: 'An AI assistant for every agent', desc: 'Copilot provides expert training, troubleshooting, and guidance so agents can find answers faster and get more done for customers.', link: '/copilot' },
                { title: 'Automate repetitive tasks', desc: 'No-code workflows handle repetitive tasks, so agents can focus on helping customers, not managing processes.', link: '/copilot' },
                { title: 'Support every customer, in every language', desc: 'Clain unifies messages from every channel and uses AI to translate 45+ languages in real time—so agents can respond faster, without switching tools.', link: null },
              ].map((feat) => (
                <div key={feat.title} className="flex flex-col max-w-[370px]">
                  <p className="font-semibold text-[16.5px] text-[#17100e] tracking-[-0.18px] leading-[22px] mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>{feat.title}</p>
                  <p className="text-[14.5px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.6)' }}>{feat.desc}</p>
                  {feat.link && (
                    <span className="mt-3 font-semibold text-[15px] text-[#17100e] cursor-pointer inline-block border-b border-[#17100e] self-start" style={{ fontFamily: "'Inter', sans-serif" }} onClick={() => ClainV2.navigate(feat.link)}>Learn more</span>
                  )}
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="border border-[rgba(23,16,14,0.2)] rounded-[6px] p-[49px]">
              <div className="grid grid-cols-[1fr_2fr] gap-8">
                {/* Photo */}
                <div className="row-span-2 rounded-[6px] overflow-hidden" style={{ aspectRatio: '1/1' }}>
                  <img loading="lazy" decoding="async" alt="Angelo Livanos" className="w-full h-full object-cover" src={imgProdAngelo} />
                </div>
                {/* Quote area */}
                <div className="flex flex-col gap-4">
                  {/* Company logo */}
                  <div className="h-[25px] w-[102px]" style={{ maskImage: `url('${imgProdGroup}'), url('${imgProdGroup1}')`, maskSize: '100%', maskRepeat: 'no-repeat', WebkitMaskImage: `url('${imgProdGroup}'), url('${imgProdGroup1}')`, WebkitMaskSize: '100%', WebkitMaskRepeat: 'no-repeat' }}>
                    <img loading="lazy" decoding="async" alt="" className="w-full h-full" src={imgProdGroup2} />
                  </div>
                  {/* Quote text */}
                  <div className="tracking-[-1.8px]" style={{ fontFamily: "'Inter', sans-serif", color: 'black' }}>
                    <p className="text-[36px] leading-[43px] m-0">{`“Our agents are dramatically more efficient`}</p>
                    <p className="text-[35px] leading-[43px] m-0">when using Copilot. In testing, agents using</p>
                    <p className="text-[35px] leading-[43px] m-0">Copilot were able to close 31% more</p>
                    <p className="text-[35px] leading-[43px] m-0">customer conversations daily, compared to</p>
                    <p className="text-[35px] leading-[43px] m-0">{`agents not using Copilot.”`}</p>
                  </div>
                </div>
                {/* Attribution */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="font-bold text-[15px] text-black tracking-[-0.16px] leading-[20px] m-0" style={{ fontFamily: "'Inter', sans-serif" }}>Angelo Livanos</p>
                    <p className="text-[15px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(0,0,0,0.6)' }}>Vice President, Global Support</p>
                  </div>
                  <span className="font-semibold text-[15px] text-black cursor-pointer border-b border-black pb-1" style={{ fontFamily: "'Inter', sans-serif" }} onClick={() => ClainV2.navigate('#')}>Read all customer stories</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 3 — Usability ═══════ */}
        <div className="w-full" style={{ background: '#f4f3ec' }}>
          <div className="max-w-[1160px] mx-auto px-6 py-[96px]">
            {/* Header */}
            <div className="flex flex-col gap-6 mb-8">
              <div>
                <p className="font-semibold text-black leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '74px' }}>{`Modern software that's`}</p>
                <p className="font-semibold text-black leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '74px', paddingLeft: '247px' }}>fast and friction-free</p>
              </div>
              <p className="max-w-[480px] text-[16.5px] leading-[24px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.8)' }}>Clain is fast to set up and easy to use. Pre-built reports, built-in ticketing, and native integrations with tools like Slack and Jira help teams work seamlessly and stay aligned.</p>
            </div>

            {/* People illustration */}
            <div className="rounded-[6px] overflow-hidden mb-12" style={{ aspectRatio: '1160/396' }}>
              <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgUsabPeople} />
            </div>

            {/* Product UI — Reporting */}
            <div className="bg-[#e7e6df] rounded-[10px] overflow-hidden mb-6" style={{ aspectRatio: '1160/490' }}>
              <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgUsabInsight} />
            </div>

            {/* Single feature text */}
            <div className="max-w-[390px] mb-12">
              <p className="font-semibold text-[16.5px] text-[#17100e] tracking-[-0.18px] leading-[22px] mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>Instant insight with pre-built reporting</p>
              <p className="text-[14.5px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.6)' }}>Monitor, analyze and optimize your support with powerful, customizable reports and real-time performance metrics.</p>
              <span className="mt-3 font-semibold text-[15px] text-[#17100e] cursor-pointer inline-block border-b border-[#17100e]" style={{ fontFamily: "'Inter', sans-serif" }} onClick={() => ClainV2.navigate('/reporting')}>Learn more</span>
            </div>

            {/* 2-column: Ticketing + Integrations */}
            <div className="flex gap-8">
              {/* Ticketing */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="bg-[#e7e6df] rounded-[10px] overflow-hidden" style={{ aspectRatio: '564/388' }}>
                  <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgUsabTickets} />
                </div>
                <div className="max-w-[390px]">
                  <p className="font-semibold text-[16.5px] text-[#17100e] tracking-[-0.18px] leading-[22px] mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>Ticketing designed for teamwork</p>
                  <p className="text-[14.5px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.6)' }}>Resolve complex issues more efficiently with Tickets designed to streamline collaboration and keep the conversation going—no switching tools or lost context.</p>
                  <span className="mt-3 font-semibold text-[15px] text-[#17100e] cursor-pointer inline-block border-b border-[#17100e]" style={{ fontFamily: "'Inter', sans-serif" }} onClick={() => ClainV2.navigate('/tickets')}>Learn more</span>
                </div>
              </div>
              {/* Integrations */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="bg-[#e7e6df] rounded-[10px] overflow-hidden" style={{ aspectRatio: '564/388' }}>
                  <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgUsabIntegration} />
                </div>
                <div className="max-w-[390px]">
                  <p className="font-semibold text-[16.5px] text-[#17100e] tracking-[-0.18px] leading-[22px] mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>Integrate with your existing tools</p>
                  <p className="text-[14.5px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.6)' }}>Connect apps like Slack, Jira, and Salesforce directly in Clain, so your agents can take action and access customer information in one place.</p>
                  <span className="mt-3 font-semibold text-[15px] text-[#17100e] cursor-pointer inline-block border-b border-[#17100e]" style={{ fontFamily: "'Inter', sans-serif" }} onClick={() => ClainV2.navigate('/integrations')}>Learn more</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 4 — Outbound ═══════ */}
        <div className="w-full" style={{ background: '#f4f3ec' }}>
          <div className="max-w-[1160px] mx-auto px-6 py-[96px]">
            {/* Header */}
            <div className="flex flex-col gap-6 mb-8">
              <div>
                <p className="font-semibold text-black leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '73px' }}>Outbound messaging</p>
                <p className="font-semibold text-black leading-[76px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '73px', paddingLeft: '122px' }}>that reduces support volume</p>
              </div>
              <div className="max-w-[480px]">
                <p className="text-[16.5px] leading-[24px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.8)' }}>Onboard, educate, and notify your customers with in-context, automated messages that reduce support volume and improve your customer experience.</p>
                <span className="mt-4 font-semibold text-[15px] text-black cursor-pointer inline-block border-b border-black" style={{ fontFamily: "'Inter', sans-serif" }} onClick={() => ClainV2.navigate('#')}>Learn more</span>
              </div>
            </div>

            {/* Satellite illustration */}
            <div className="rounded-[6px] overflow-hidden mb-12" style={{ aspectRatio: '1160/396' }}>
              <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgOutbSatellite} />
            </div>

            {/* Product UI */}
            <div className="bg-[#e7e6df] rounded-[10px] overflow-hidden mb-6" style={{ aspectRatio: '1160/490' }}>
              <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgOutbProduct} />
            </div>

            {/* 3-column features */}
            <div className="flex gap-0 justify-between mb-12">
              {[
                { title: 'Onboard customers faster', desc: 'Onboard users with interactive guides, personalized tasks, and in-app highlights that help them get started successfully.' },
                { title: 'Stay ahead of known issues', desc: 'Send timely messages about bugs, outages, or changes, so your customers stay informed and your team stays in control.' },
                { title: 'Answer common questions in advance', desc: 'Highlight tips, surface support content, and announce new features in-product so customers get answers before they reach out.' },
              ].map((feat) => (
                <div key={feat.title} className="flex flex-col max-w-[370px]">
                  <p className="font-semibold text-[16.5px] text-[#17100e] tracking-[-0.18px] leading-[22px] mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>{feat.title}</p>
                  <p className="text-[14.5px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.6)' }}>{feat.desc}</p>
                </div>
              ))}
            </div>

            {/* G2 Rankings */}
            <div className="border border-[rgba(23,16,14,0.2)] rounded-[6px] p-[49px]">
              <div className="flex justify-between items-start">
                {/* Left: title + description + link */}
                <div className="w-[300px] flex flex-col justify-between self-stretch">
                  <p className="font-semibold text-[17px] text-black tracking-[-0.18px] leading-[22px] m-0" style={{ fontFamily: "'Inter', sans-serif" }}>Ranked #1 on G2 in 97 categories</p>
                  <div>
                    <p className="text-[14.5px] leading-[22px] m-0 mb-4" style={{ fontFamily: "'Inter', sans-serif", color: 'black' }}>{`Clain is rated highest on G2's most recent User Satisfaction Ratings for CS.`}</p>
                    <a className="flex items-center gap-1.5 font-semibold text-[15px] text-black no-underline border-b border-black pb-1 self-start" href="#" style={{ fontFamily: "'Inter', sans-serif" }}>
                      Read the report
                      <img loading="lazy" decoding="async" alt="" className="w-2 h-2" src={imgOutbVector} />
                    </a>
                  </div>
                </div>
                {/* Right: circles */}
                <div className="flex gap-5">
                  {[
                    { value: '97', label: 'Clain', opacity: 1, fontSize: '73px' },
                    { value: '0', label: 'Salesforce', opacity: 0.4, fontSize: '84px' },
                    { value: '0', label: 'Zendesk', opacity: 0.4, fontSize: '84px' },
                  ].map((item) => (
                    <div key={item.label} className="flex flex-col items-center gap-5">
                      <div className="relative flex items-center justify-center rounded-full size-[190px]">
                        <div className="absolute inset-[2px] rounded-full bg-[#f4f3ec]" />
                        <span className="relative font-light text-center tracking-[-2.88px] leading-[84px]" style={{ fontFamily: "'Inter', sans-serif", fontSize: item.fontSize, color: item.opacity === 1 ? '#17100e' : 'rgba(23,16,14,0.4)' }}>{item.value}</span>
                      </div>
                      <span className={`text-[15px] text-black text-center tracking-[-0.16px]${item.label === 'Clain' ? ' font-semibold' : ''}`} style={{ fontFamily: "'Inter', sans-serif" }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 5 — Features (Interactive) ═══════ */}
        <div className="w-full" style={{ background: '#f4f3ec' }}>
          <div className="max-w-[1160px] mx-auto px-6 pt-[132px] pb-[96px]">
            <div className="grid grid-cols-[2fr_3fr] gap-16">
              {/* Left panel — feature image + description */}
              <div className="sticky top-[100px] self-start flex flex-col gap-4">
                <div className="relative w-full rounded-lg overflow-hidden" style={{ aspectRatio: '1/1' }}>
                  {FEATURES.map((feat, i) => (
                    <div key={feat.name} className={`absolute inset-0 overflow-hidden transition-opacity${i === activeFeature ? '' : ' opacity-0'}`}>
                      <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={feat.img} />
                    </div>
                  ))}
                </div>
                <p className="text-[16px] leading-[24px] m-0" style={{ fontFamily: "'Inter', sans-serif", color: 'rgba(23,16,14,0.6)' }}>{FEATURES[activeFeature].desc}</p>
                <span className="font-semibold text-[15px] text-[#17100e] cursor-pointer inline-block border-b border-[#17100e] self-start tracking-[-0.16px]" style={{ fontFamily: "'Inter', sans-serif" }} onClick={() => ClainV2.navigate(FEATURES[activeFeature].link)}>Find out more</span>
              </div>

              {/* Right panel — feature buttons */}
              <div className="flex flex-col">
                {FEATURES.map((feat, i) => {
                  const isActive = i === activeFeature;
                  return (
                    <div key={feat.name} className="flex items-center justify-between py-[14px] border-b cursor-pointer" style={{ borderColor: 'rgba(0,0,0,0.2)' }} onClick={() => setActiveFeature(i)}>
                      <span className="font-semibold text-[48px] leading-[49px] tracking-[-2.56px] transition-colors" style={{ fontFamily: "'Inter', sans-serif", color: isActive ? '#17100e' : 'rgba(0,0,0,0.2)' }}>{feat.name}</span>
                      <div className="pt-3">
                        <FeatureArrow active={isActive} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ Section 6 — CTA ═══════ */}
        <div className="relative w-full overflow-hidden" style={{ minHeight: '800px' }}>
          <div className="absolute inset-0">
            <img loading="lazy" decoding="async" alt="" className="w-full h-full object-cover" src={imgCtaBanner} />
          </div>
          <div className="relative flex flex-col items-center justify-center gap-6 py-[108px]" style={{ minHeight: '800px' }}>
            <div className="text-center">
              <p className="font-semibold text-white text-center leading-[80px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '74px' }}>Experience the next-gen</p>
              <p className="font-semibold text-white text-center leading-[80px] tracking-[-4px] m-0" style={{ fontFamily: "'Inter', sans-serif", fontSize: '74px' }}>platform today</p>
            </div>
            <div className="flex gap-3">
              <a data-spa href="/demo" className="border border-white rounded-[6px] px-[17px] py-[11px] text-white text-[15px] font-semibold tracking-[-0.4px] text-center no-underline" style={{ fontFamily: "'Inter', sans-serif", backdropFilter: 'blur(6px)', background: 'rgba(255,255,255,0.2)' }}>View demo</a>
              <a data-spa href="/signup" className="bg-white rounded-[6px] px-[16px] py-[10px] text-[#17100e] text-[15px] font-semibold tracking-[-0.4px] text-center no-underline" style={{ fontFamily: "'Inter', sans-serif" }}>Start free trial</a>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  window.HowItWorksPage = HowItWorksPage;
})();
