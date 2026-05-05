/* global React, ClainV2 */
/* "agent_customer" page — extracted from Figma node 32:13982
   Hero + Announcement + Meet event + 4 role cards + Final CTA */
(function () {
  const { PageShell } = ClainV2;

  // AGENT CUSTOMER — HERO section (Figma node 32:13986)
  // Heading "Clain is now a Customer Agent" + 5 colorful 3D agent icons + body + CTAs + 4 orange corner squares
  const acHeroEcommerce = "/v2/assets/53629cfc-b5b5-41f7-9946-ebe713b04657.png";
  const acHeroSuccess   = "/v2/assets/e3957b23-de7f-4746-9eff-a75d0ce18efb.png";
  const acHeroFin       = "/v2/assets/87a97a5a-0b0f-4c1c-b0da-0ab6054799d7.png";
  const acHeroSales     = "/v2/assets/1fa34d43-d9c7-4b51-a7ff-65424d7543ea.png";
  const acHeroService   = "/v2/assets/e7d5c119-3eb7-43b3-8975-9dbac087ac5a.png";

  function AgentCustomerHero() {
    return (
      <section className="content-stretch flex flex-col gap-[38.9px] items-center pb-[80px] pt-[56px] px-[16px] relative w-full bg-white" data-node-id="32:13986">
        {/* Heading */}
        <p className="m-0 text-[92.6px] text-black text-center tracking-[-4px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '90px' }}>Clain is now a Customer Agent</p>

        {/* 5-icon grid (12-col, asymmetric: 2|2|4|2|2) */}
        <div className="grid grid-cols-12 gap-[16px] max-w-[1450px] relative shrink-0 w-full" style={{ height: 227.75 }}>
          <div className="col-span-2 relative">
            <img src={acHeroEcommerce} alt="Ecommerce Agent" className="absolute" style={{ top: 20.68, left: '7.5%', width: '35%', height: 96.51 }} />
          </div>
          <div className="col-span-2 flex flex-col items-center py-[32.1px]">
            <img src={acHeroSuccess} alt="Success Agent" className="block" style={{ width: 119.7, height: 149.8 }} />
          </div>
          <div className="col-span-4 flex flex-col items-center">
            <img src={acHeroFin} alt="Clain Agent" className="block" style={{ width: 229.33, height: 227.75 }} />
          </div>
          <div className="col-span-2 flex flex-col items-center py-[32.1px]">
            <img src={acHeroSales} alt="Sales Agent" className="block" style={{ width: 119.7, height: 149.8 }} />
          </div>
          <div className="col-span-2 relative">
            <img src={acHeroService} alt="Service Agent" className="absolute" style={{ top: 20.68, right: '7.5%', width: '35%', height: 96.51 }} />
          </div>
        </div>

        {/* Body + buttons */}
        <div className="content-stretch flex flex-col gap-[24px] items-center max-w-[740px] relative shrink-0">
          <div className="content-stretch flex flex-col items-center max-w-[472px] px-[2.34px] relative shrink-0">
            <p className="m-0 text-[13px] text-center tracking-[-0.16px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '22.4px', color: 'rgba(0,0,0,0.7)' }}>
              <span style={{ display: 'block' }}>Your customers don’t think in departments. Neither does Clain. Clain is a single</span>
              <span style={{ display: 'block' }}>Customer Agent that qualifies leads, closes sales, resolves issues, and moves</span>
              <span style={{ display: 'block' }}>between roles as the conversation demands.</span>
            </p>
          </div>
          <div className="content-stretch flex gap-[16.01px] items-start relative shrink-0">
            <a onClick={() => ClainV2.navigate('/signup')} className="bg-[#111] cursor-pointer content-stretch flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[14px] relative rounded-[4px] shrink-0">
              <span className="text-[14.6px] text-white text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Start free trial</span>
            </a>
            <a onClick={() => ClainV2.navigate('#contact')} className="border border-solid border-[#111] cursor-pointer content-stretch flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[15px] relative rounded-[4px] shrink-0">
              <span className="text-[14.9px] text-[#111] text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Contact sales</span>
            </a>
          </div>
        </div>

        {/* 4 orange corner squares */}
        <div className="absolute inset-[32px_16px] pointer-events-none">
          <div className="absolute bg-[#ff5600] left-0 size-[8px] top-0" />
          <div className="absolute bg-[#ff5600] right-0 size-[8px] top-0" />
          <div className="absolute bg-[#ff5600] left-0 size-[8px] bottom-[-0.37px]" />
          <div className="absolute bg-[#ff5600] right-0 size-[8px] bottom-[-0.37px]" />
        </div>
      </section>
    );
  }


  // AGENT CUSTOMER — ANNOUNCEMENT section (Figma node 32:14010)
  // Cream bg #faf9f6. Video player on top + 2-column body: announcement letter (cols 7-18) + customer quotes sidebar (cols 20-24)
  const acAnnVideoPoster = "/v2/assets/9f6606e2-bd11-4b80-9846-eec0e4e1ab61.jpg";
  const acAnnPlayIcon    = "/v2/assets/80e341a8-927e-4e4b-aec6-01ac61b987ac.svg";
  const acAnnMattAvatar  = "/v2/assets/98b952d8-5e1b-4bdf-8852-b6758ca56abf.png";
  const acAnnTylerAvatar = "/v2/assets/6eec52db-80d6-4440-819f-159bab05b175.png";

  function AgentCustomerAnnouncement() {
    return (
      <section className="bg-[#faf9f6] content-stretch flex flex-col gap-[64px] items-start pb-[80px] pt-[120px] px-[16px] relative w-full" data-node-id="32:14010">
        {/* Video player row */}
        <div className="grid grid-cols-24 relative shrink-0 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          <div className="content-stretch flex flex-col gap-[8px] items-start" style={{ gridColumn: '7 / span 12' }}>
            <p className="m-0 text-[12px] uppercase tracking-[1.2px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '12px', color: 'rgba(0,0,0,0.6)' }}>[ Clain CEO Eoghan introduces Customer Agent ]</p>
            <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full">
              <div className="relative w-full overflow-clip" style={{ height: 396 }}>
                <img src={acAnnVideoPoster} alt="" className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }} />
                <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }} />
                {/* Play button */}
                <button className="absolute bg-[#111] border border-solid border-white cursor-pointer flex h-[40px] items-center justify-center pl-[11px] pr-[15px] py-[10px] rounded-[4px]" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
                  <span className="flex gap-[4px] items-center">
                    <img src={acAnnPlayIcon} alt="" className="size-[20px]" />
                    <span className="text-[13.1px] text-white text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, lineHeight: '20px' }}>Play</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Body row: cols 7-18 letter + cols 20-24 quotes */}
        <div className="grid relative shrink-0 w-full" style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {/* Letter body (cols 7-18) */}
          <div className="content-stretch flex flex-col gap-[80px] items-start" style={{ gridColumn: '7 / span 12' }}>
            <div className="flex flex-col gap-[32px] w-full">
              <p className="m-0 text-[19.9px] tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px' }}>
                <span style={{ color: 'rgba(0,0,0,0.7)' }}>Six months ago, we shared our vision that </span>
                <span style={{ color: '#111' }}>Clain would go beyond customer service and become a single Customer Agent,</span>
                <span style={{ color: 'rgba(0,0,0,0.7)' }}>{' '}capable of delivering a seamless, personal experience across the entire customer journey.</span>
              </p>
              <p className="m-0 text-[20.1px] tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px' }}>
                <span style={{ color: 'rgba(0,0,0,0.7)' }}>Now, that’s a reality. </span>
                <span style={{ color: '#111' }}>Attio</span>
                <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: 10, letterSpacing: '0.6px' }}>{' '}[01]</span>
                <span style={{ color: 'rgba(0,0,0,0.7)' }}>{' '}is using Clain to qualify inbound leads, book meetings, and close deals - and then, when those prospects become customers and need support, Clain transitions seamlessly into providing service. </span>
                <span style={{ color: '#111' }}>Fellow</span>
                <span style={{ color: 'rgba(0,0,0,0.7)', fontSize: 10, letterSpacing: '0.6px' }}>{' '}[02]</span>
                <span style={{ color: 'rgba(0,0,0,0.7)' }}>{' '}uses Clain for sales as part of their mission to go AI-native across the entire customer journey.</span>
              </p>
              <p className="m-0 text-[19.7px] tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px', color: 'rgba(0,0,0,0.7)' }}>They’re all using Clain as a Customer Agent - and seeing these results because Clain is built on an integrated Customer Agent Platform.</p>
            </div>

            {/* The 3 capabilities list */}
            <div className="flex flex-col gap-[32.5px] w-full">
              <p className="m-0 text-[20.3px] text-[#111] tracking-[-0.4px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px' }}>The Customer Agent Platform has three capabilities.</p>
              <div className="flex flex-col gap-[32px] pl-[48px] w-full">
                <p className="m-0 text-[19.9px] tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px' }}>
                  <span style={{ color: '#111' }}>Roles:</span>
                  <span style={{ color: 'rgba(0,0,0,0.7)' }}>{' '}the customer-facing Agents that handle different jobs across the customer lifecycle.</span>
                </p>
                <p className="m-0 text-[19.9px] tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px' }}>
                  <span style={{ color: '#111' }}>Agent Operations:</span>
                  <span style={{ color: 'rgba(0,0,0,0.7)' }}>{' '}the tools that give teams control over how Clain works.</span>
                </p>
                <p className="m-0 text-[19.9px] tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px' }}>
                  <span style={{ color: '#111' }}>Models:</span>
                  <span style={{ color: 'rgba(0,0,0,0.7)' }}>{' '}powering all of it, a suite of purpose-built models developed by our AI group.</span>
                </p>
              </div>
            </div>

            <p className="m-0 text-[20.1px] tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '32px' }}>
              <span style={{ color: '#111' }}>Over the coming weeks, we’ll go deeper into each part of the Customer Agent Platform and introduce new roles Clain can do.</span>
              <span style={{ color: 'rgba(0,0,0,0.7)' }}>{' '}Join us at our upcoming events to see them in action and learn what Clain as a Customer Agent can do for your business.</span>
            </p>
          </div>

          {/* Quotes sidebar (cols 20-24) */}
          <div className="flex flex-col gap-[16px] pb-[433px]" style={{ gridColumn: '20 / span 5' }}>
            {[
              { idx: '[ 01 ]', quote: ['“Last week, a company came back to', 'us. We’d spoken to them about a year', 'ago. They had their first real interaction', 'with Clain, got their questions answered,', 'and converted to a paying customer at', 'six times our average contract value.', 'Clain handled it end to end.”'], avatar: acAnnMattAvatar, name: 'Matt Duffy', role: 'Head of New Business,', org: 'Attio', topBorder: true },
              { idx: '[ 02 ]', quote: ['“Becoming AI-native across our full', 'customer journey is one of our main', 'goals. Clain running 24/7, booking', 'meetings and answering questions,', 'wherever our customers are.”'], avatar: acAnnTylerAvatar, name: 'Tyler Ryll', role: 'Director of Customer', org: 'Success, Fellow', topBorder: true, bottomBorder: true },
            ].map((q, i) => (
              <figure key={i} className={`flex flex-col gap-[16px] py-[9px] m-0 w-full ${q.topBorder ? 'border-t' : ''} ${q.bottomBorder ? 'border-b' : ''} border-solid`} style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
                <p className="m-0 text-[10px] uppercase tracking-[1px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '10px', color: 'rgba(0,0,0,0.8)' }}>{q.idx}</p>
                <div className="flex flex-col gap-[24px] pr-[20px] w-full">
                  <blockquote className="m-0 text-[14.9px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px', color: 'rgba(0,0,0,0.8)' }}>
                    {q.quote.map((line, j) => <span key={j} style={{ display: 'block' }}>{line}</span>)}
                  </blockquote>
                  <div className="flex gap-[10px] items-start w-full">
                    <img src={q.avatar} alt={q.name} className="size-[60px] object-cover" />
                    <div className="flex flex-col" style={{ paddingTop: 8 }}>
                      <p className="m-0 text-[12px] uppercase tracking-[0.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '16.8px', color: 'rgba(0,0,0,0.8)' }}>{q.name}</p>
                      <p className="m-0 text-[12px] uppercase tracking-[0.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '16.8px', color: 'rgba(0,0,0,0.8)' }}>{q.role}</p>
                      <p className="m-0 text-[12px] uppercase tracking-[0.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '16.8px', color: 'rgba(0,0,0,0.8)' }}>{q.org}</p>
                    </div>
                  </div>
                </div>
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }


  // AGENT CUSTOMER — MEET section (Figma node 32:14078)
  // "Come meet Clain, the Customer Agent" + event card with date/location chips + Register button
  // 4 orange corner squares + Swirl-colored left border on event card

  function AgentCustomerMeet() {
    return (
      <section className="content-stretch flex flex-col gap-[20px] items-start pt-[120px] relative w-full bg-white" data-node-id="32:14078">
        {/* Heading row with corner squares */}
        <div className="content-stretch flex items-center p-[32px] relative shrink-0 w-full">
          <p className="m-0 text-[37.5px] text-black tracking-[-1.2px] whitespace-nowrap max-w-[634px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '40px' }}>Come meet Clain, the Customer Agent</p>
          <div className="absolute bg-[#ff5600] left-0 size-[8px] top-0 pointer-events-none" />
          <div className="absolute bg-[#ff5600] right-0 size-[8px] top-0 pointer-events-none" />
          <div className="absolute bg-[#ff5600] left-0 size-[8px] bottom-0 pointer-events-none" />
          <div className="absolute bg-[#ff5600] right-0 size-[8px] bottom-0 pointer-events-none" />
        </div>

        {/* Event card row */}
        <div className="grid grid-cols-2 gap-y-[32px] relative shrink-0 w-full" style={{ height: 242 }}>
          <div className="border-l border-solid border-[#d3cec6] flex flex-col justify-between pl-[25px] pr-[24px] relative h-full">
            <div className="flex flex-col gap-[20px] w-full">
              <p className="m-0 text-[22.1px] text-black tracking-[-0.48px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>The future of Clain and the Customer Agent category</p>
              <div className="flex flex-col gap-[6px] items-start">
                <div className="flex gap-[6px] items-center p-[4px]" style={{ background: 'rgba(0,0,0,0.1)' }}>
                  <div className="bg-[#ff5600] size-[6px] shrink-0" />
                  <p className="m-0 text-[11.8px] text-black uppercase tracking-[0.6px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '12px' }}>May 14</p>
                </div>
                <div className="flex gap-[6px] items-center p-[4px]" style={{ background: 'rgba(0,0,0,0.1)' }}>
                  <div className="bg-[#ff5600] size-[6px] shrink-0" />
                  <p className="m-0 text-[12px] text-black uppercase tracking-[0.6px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '12px' }}>San Francisco + Livestream</p>
                </div>
              </div>
            </div>
            <div className="flex items-center w-full">
              <a onClick={() => ClainV2.navigate('#register')} className="border border-solid border-[#111] cursor-pointer flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[15px] relative rounded-[4px] shrink-0">
                <span className="text-[14.9px] text-[#111] text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Register</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }


  // AGENT CUSTOMER — ROLES section (Figma node 32:14105)
  // Cream bg #faf9f6. Heading "Clain handles roles across the customer journey"
  // + 4 rows: each with image + title + body + Learn more
  // Row 1: Customer service (5fr+3fr, image left) — orange/coral
  // Row 2: Inbound sales — purple, with "New" + #589FB7 dot
  // Row 3: New role launching soon — yellow, with "May 7" + #A0AF64 dot, image right (2fr+3fr image)
  // Row 4: Another new role coming soon — teal, image right
  const acRolesBg1     = "/v2/assets/b7772faf-36f5-4104-853f-028bbe4516b2.jpg";    // service bg
  const acRolesService = "/v2/assets/c7f4842e-ea46-4682-98ea-8d3cb884c176.png";    // chat illustration
  const acRolesSalesBg = "/v2/assets/2b4edd90-9d1a-4bf9-b152-a5c8a0c63caa.jpg";    // sales bg
  const acRolesSales   = "/v2/assets/20152496-6bb3-4ecc-a64d-8ee13af90f7c.png";    // sales fg
  const acRolesNew1    = "/v2/assets/ce0a5c5b-41d9-4bed-9426-263f596c69ae.png";    // yellow abstract
  const acRolesNew2    = "/v2/assets/b2e3b43e-33fa-43e4-bc03-979a4266b8af.png";    // teal abstract

  function AgentCustomerRoles() {
    return (
      <section className="bg-[#faf9f6] content-stretch flex flex-col items-start pb-[80px] pt-[200px] px-[92px] relative w-full" data-node-id="32:14105">
        <div className="content-stretch flex flex-col items-start max-w-[1256px] relative shrink-0 w-full">
          <p className="m-0 text-[50.2px] text-black tracking-[-1.6px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '54px' }}>Clain handles roles across the customer journey</p>

          <div className="flex flex-col gap-[64px] items-start pt-[64px] w-full">
            {/* Row 1: Perfect customer service (image LEFT, large) */}
            <div className="grid pt-[33px] w-full" style={{ gridTemplateColumns: '5fr 3fr', gap: 32, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <div className="relative overflow-clip rounded-[inherit]">
                <img src={acRolesBg1} alt="" className="absolute inset-0 size-full object-cover" />
                <img src={acRolesService} alt="" className="relative w-full" style={{ aspectRatio: '765 / 741.88' }} />
              </div>
              <div className="flex flex-col gap-[95.085px] items-start pb-[412.32px]">
                <p className="m-0 text-[36.7px] text-black tracking-[-1.2px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '40px' }}>
                  <span style={{ display: 'block' }}>Clain delivers perfect</span>
                  <span style={{ display: 'block' }}>customer service</span>
                </p>
                <div className="flex flex-col gap-[24px] w-full">
                  <p className="m-0 text-[13.1px] tracking-[-0.16px] max-w-[613.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '22.4px', color: 'rgba(0,0,0,0.7)' }}>
                    <span style={{ display: 'block' }}>Clain resolves even your most complex support queries accurately and</span>
                    <span style={{ display: 'block' }}>reliably. Clain connects to your business tools, can take action on behalf of</span>
                    <span style={{ display: 'block' }}>your customers, and works across every channel - live chat, email, phone,</span>
                    <span style={{ display: 'block' }}>Slack, and more.</span>
                  </p>
                  <a onClick={() => ClainV2.navigate('#')} className="border border-solid border-[#111] cursor-pointer flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[15px] relative rounded-[4px] shrink-0 w-fit">
                    <span className="text-[14.9px] text-[#111] text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Learn more</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Row 2: Inbound sales (image LEFT) */}
            <div className="grid pt-[33px] w-full" style={{ gridTemplateColumns: '5fr 3fr', gap: 32, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <div className="relative overflow-clip rounded-[inherit]">
                <img src={acRolesSalesBg} alt="" className="block w-full" style={{ height: 741.44 }} />
                <div className="absolute flex flex-col items-start" style={{ inset: '8.73% 10%' }}>
                  <img src={acRolesSales} alt="" className="block size-[612px] max-w-full" />
                </div>
              </div>
              <div className="flex flex-col gap-[94.89px] items-start pb-[398.27px]">
                <div className="flex flex-col gap-[16px] w-full">
                  <p className="m-0 text-[37.2px] text-black tracking-[-1.2px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '40px' }}>
                    <span style={{ display: 'block' }}>Clain handles inbound sales</span>
                    <span style={{ display: 'block' }}>end to end</span>
                  </p>
                  <div className="flex gap-[6px] items-center p-[4px]" style={{ background: 'rgba(0,0,0,0.1)' }}>
                    <div className="bg-[#589fb7] size-[6px] shrink-0" />
                    <p className="m-0 text-[9.6px] text-black uppercase tracking-[0.6px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '12px' }}>New</p>
                  </div>
                </div>
                <div className="flex flex-col gap-[24px] w-full">
                  <p className="m-0 text-[13.3px] tracking-[-0.16px] max-w-[613.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '22.4px', color: 'rgba(0,0,0,0.7)' }}>
                    <span style={{ display: 'block' }}>From first question to qualified opportunity, Clain handles inbound sales</span>
                    <span style={{ display: 'block' }}>end to end. It engages prospects, helps them understand your product,</span>
                    <span style={{ display: 'block' }}>and passes the right ones to sales.</span>
                  </p>
                  <a onClick={() => ClainV2.navigate('#')} className="border border-solid border-[#111] cursor-pointer flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[15px] relative rounded-[4px] shrink-0 w-fit">
                    <span className="text-[14.9px] text-[#111] text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Learn more</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Row 3: New role launching soon (image RIGHT, narrower text col) */}
            <div className="grid pt-[33px] w-full" style={{ gridTemplateColumns: '2fr 3fr', gap: 32, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <div className="flex flex-col justify-between" style={{ minHeight: 450.11 }}>
                <div className="flex flex-col gap-[16px]">
                  <p className="m-0 text-[37.3px] text-black tracking-[-1.2px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '40px' }}>New role launching soon</p>
                  <div className="flex gap-[6px] items-center p-[4px] w-fit" style={{ background: 'rgba(0,0,0,0.1)' }}>
                    <div className="bg-[#a0af64] size-[6px] shrink-0" />
                    <p className="m-0 text-[11.6px] text-black uppercase tracking-[0.6px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '12px' }}>May 7</p>
                  </div>
                </div>
                <div className="flex flex-col gap-[24px] w-full">
                  <p className="m-0 text-[13.5px] tracking-[-0.16px] max-w-[613.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '22.4px', color: 'rgba(0,0,0,0.7)' }}>Join us to learn more about Clain’s newest role.</p>
                  <a onClick={() => ClainV2.navigate('#register')} className="border border-solid border-[#111] cursor-pointer flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[15px] relative rounded-[4px] shrink-0 w-fit">
                    <span className="text-[14.9px] text-[#111] text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Register</span>
                  </a>
                </div>
              </div>
              <div className="relative" style={{ aspectRatio: '734.41 / 450.11' }}>
                <img src={acRolesNew1} alt="" className="absolute inset-0 size-full object-cover" />
              </div>
            </div>

            {/* Row 4: Another new role, coming soon (image RIGHT) */}
            <div className="grid pt-[33px] w-full" style={{ gridTemplateColumns: '2fr 3fr', gap: 32, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
              <div className="flex flex-col justify-between" style={{ minHeight: 450.11 }}>
                <p className="m-0 text-[37.3px] text-black tracking-[-1.2px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '40px' }}>
                  <span style={{ display: 'block' }}>Another new role, coming</span>
                  <span style={{ display: 'block' }}>soon</span>
                </p>
                <p className="m-0 text-[13.4px] tracking-[-0.16px] max-w-[613.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '22.4px', color: 'rgba(0,0,0,0.7)' }}>Clain is taking on more roles across the customer journey. We’ll share more soon.</p>
              </div>
              <div className="relative" style={{ aspectRatio: '734.41 / 450.11' }}>
                <img src={acRolesNew2} alt="" className="absolute inset-0 size-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }


  // AGENT CUSTOMER — FINAL CTA section (Figma node 32:14167)
  // White bg. Heading "One unified Customer Agent for the / entire customer experience" (line 1 muted, line 2 black)
  // + 5 agent icons (smaller variant, same layout as hero) + Start free trial / Contact sales buttons
  const acFinalEcommerce = "/v2/assets/f7c07bdf-f4c0-4c98-9f44-09f13816b622.png";
  const acFinalSuccess   = "/v2/assets/cca7657c-1b5c-460d-8b13-efacf1add8d6.png";
  const acFinalFin       = "/v2/assets/c4e106ed-14da-4a8d-88ce-cc7d18fdc37c.png";
  const acFinalSales     = "/v2/assets/fa0661be-1449-417a-8147-d6f0a80452dc.png";
  const acFinalService   = "/v2/assets/6b419f82-9bf3-49d5-9bef-1545d07205c5.png";

  function AgentCustomerFinalCta() {
    return (
      <section className="bg-white content-stretch flex flex-col items-start pb-[160px] pt-[200px] px-[92px] relative w-full" data-node-id="32:14167">
        <div className="content-stretch flex flex-col gap-[40px] items-center max-w-[1256px] relative shrink-0 w-full">
          <p className="m-0 text-[50.5px] text-center tracking-[-1.6px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '54px' }}>
            <span style={{ display: 'block', color: 'rgba(0,0,0,0.6)' }}>One unified Customer Agent for the</span>
            <span style={{ display: 'block', color: 'black' }}>entire customer experience</span>
          </p>

          {/* 5-icon grid (slightly smaller than hero) */}
          <div className="grid grid-cols-12 gap-[16px] max-w-[1450px] relative shrink-0 w-full" style={{ height: 214 }}>
            <div className="col-span-2 relative">
              <img src={acFinalEcommerce} alt="Ecommerce Agent" className="absolute" style={{ top: 18.32, left: '7.5%', width: '35%', aspectRatio: '68.6 / 85.48' }} />
            </div>
            <div className="col-span-2 flex flex-col items-center py-[32.1px]">
              <img src={acFinalSuccess} alt="Success Agent" className="block" style={{ width: 119.7, height: 149.8 }} />
            </div>
            <div className="col-span-4 flex flex-col items-center">
              <img src={acFinalFin} alt="Clain Agent" className="block" style={{ width: 204, height: 202.59 }} />
            </div>
            <div className="col-span-2 flex flex-col items-center py-[32.1px]">
              <img src={acFinalSales} alt="Sales Agent" className="block" style={{ width: 119.7, height: 149.8 }} />
            </div>
            <div className="col-span-2 relative">
              <img src={acFinalService} alt="Service Agent" className="absolute" style={{ top: 18.32, right: '7.5%', width: '35%', aspectRatio: '68.6 / 85.48' }} />
            </div>
          </div>

          <div className="content-stretch flex gap-[16px] items-start relative shrink-0">
            <a onClick={() => ClainV2.navigate('/signup')} className="bg-[#111] cursor-pointer content-stretch flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[14px] relative rounded-[4px] shrink-0">
              <span className="text-[14.6px] text-white text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Start free trial</span>
            </a>
            <a onClick={() => ClainV2.navigate('#contact')} className="border border-solid border-[#111] cursor-pointer content-stretch flex h-[40px] items-center justify-center pb-[8.5px] pt-[7.5px] px-[15px] relative rounded-[4px] shrink-0">
              <span className="text-[14.9px] text-[#111] text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>Contact sales</span>
            </a>
          </div>
        </div>
      </section>
    );
  }


  function AgentCustomerPage() {
    return (
      <PageShell>
        <div style={{ width: '100%', background: '#ffffff' }}>
          <AgentCustomerHero />
          <AgentCustomerAnnouncement />
          <AgentCustomerMeet />
          <AgentCustomerRoles />
          <AgentCustomerFinalCta />
        </div>
      </PageShell>
    );
  }

  window.AgentCustomerPage = AgentCustomerPage;
})();
