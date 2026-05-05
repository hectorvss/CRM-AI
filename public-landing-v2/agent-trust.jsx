/* global React, ClainV2 */
/* "agent_trust" page — extracted from Figma node 32:13227 */
(function () {
  const { useState, useEffect } = React;
  const { PageShell } = ClainV2;

  // AGENT TRUST — HERO section (Figma node 32:13230)
  // Dark gradient #020917 with masked decorative bg + heading "Safe AI, built on partnership"
  const atHeroBg   = "/v2/assets/42f647e5-d5d0-4978-9ccd-5fffb36175ff.png";
  const atHeroMask = "/v2/assets/96c42c14-887d-46ec-80ff-37740ecc26e0.svg";

  function AgentTrustHero() {
    return (
      <div className="grid grid-cols-12 gap-x-[16px] grid-rows-[713.75px] px-[24px] relative w-full max-w-[1440px] mx-auto bg-[#020917]" data-node-id="32:13230">
        {/* Decorative gradient image with mask + 4 fade overlays */}
        <div className="absolute inset-0 flex flex-col items-start justify-center pointer-events-none" style={{ maskImage: `url('${atHeroMask}')`, WebkitMaskImage: `url('${atHeroMask}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}>
          <div className="relative flex-1 w-full">
            <div className="absolute inset-0 overflow-hidden">
              <img alt="" className="absolute h-[113.07%] left-0 max-w-none top-[-6.53%] w-full" src={atHeroBg} />
            </div>
          </div>
          {/* Top fade */}
          <div className="absolute top-0 left-0 w-full h-[512px]" style={{ background: 'linear-gradient(to bottom, #020917, rgba(2,9,23,0))' }} />
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 w-full h-[112px]" style={{ background: 'linear-gradient(to top, #020917, rgba(2,9,23,0))' }} />
          {/* Right fade */}
          <div className="absolute right-0 top-0 h-full w-[96px]" style={{ background: 'linear-gradient(to left, #020917, rgba(2,9,23,0))' }} />
          {/* Left fade */}
          <div className="absolute left-0 top-0 h-full w-[96px]" style={{ background: 'linear-gradient(to right, #020917, rgba(2,9,23,0))' }} />
        </div>

        {/* Content: cols 2-9 */}
        <div className="col-start-2 col-span-8 content-stretch flex flex-col gap-[30.9px] items-start justify-self-stretch py-[160px] relative row-1 self-center shrink-0">
          <div className="content-stretch flex flex-col items-start max-w-[949.82px] relative shrink-0 w-full">
            <p className="m-0 text-white tracking-[-3.008px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 94.7, lineHeight: '96px' }}>Safe AI, built on</p>
            <p className="m-0 tracking-[-3.008px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 94.7, lineHeight: '96px', color: 'rgba(255,255,255,0.6)' }}>partnership</p>
          </div>
          <div className="content-stretch flex flex-col items-start max-w-[524.88px] pb-[0.845px] relative shrink-0 w-[524.88px]">
            <div className="text-[16.3px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '23.94px' }}>
              <p className="m-0 text-white">Clain is designed with the highest commitment to security, reliability,</p>
              <p className="m-0">
                <span className="text-white">and transparency.</span>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{` We meet the world’s leading compliance`}</span>
              </p>
              <p className="m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>standards&mdash;and give you the tools to safely deploy AI within your</p>
              <p className="m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>own boundaries.</p>
            </div>
          </div>
          <div className="content-start flex flex-wrap gap-[12px] items-start pt-[1.1px] relative shrink-0 w-full">
            <a onClick={() => ClainV2.navigate('/signup')} className="bg-white content-stretch cursor-pointer flex h-[42px] items-center justify-center pb-[13.5px] pt-[12.5px] px-[16px] relative rounded-[6px] shrink-0">
              <span className="text-[14.4px] text-black tracking-[-0.32px] leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Start free trial</span>
            </a>
            <a onClick={() => ClainV2.navigate('/demo')} className="border border-solid border-white content-stretch cursor-pointer flex h-[42px] items-center justify-center pb-[13.5px] pt-[12.5px] px-[17px] relative rounded-[6px] shrink-0">
              <span className="text-[14.8px] text-white tracking-[-0.32px] leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>View demo</span>
            </a>
          </div>
        </div>
      </div>
    );
  }


  // AGENT TRUST — PARTNERSHIP section (Figma node 32:13250)
  // Light cream bg #f6f6f1, two cards "We ensure" / "You define" with 5 bullets each
  const atBulletV = "/v2/assets/1ba284c5-dc3f-4eb5-bd82-54d9878ae1c1.svg";

  function AtBullet() {
    return (
      <div className="h-[6px] w-[8px] relative shrink-0 overflow-clip">
        <div className="absolute inset-[0_10.94%_11.25%_0]">
          <img alt="" className="block size-full" src={atBulletV} />
        </div>
      </div>
    );
  }

  const AT_PART_ENSURE = [
    'Clain operates within the scope you set',
    'Enterprise-grade security and reliability',
    'Compliance with data protection standards',
    'System uptime and performance',
    'Platform testing and monitoring capabilities',
  ];
  const AT_PART_DEFINE = [
    "Clain's goals and intended outcomes",
    "Clain's scope and boundaries",
    'Procedures for complex workflows',
    'Data Connectors and integrations',
    'Testing and validation criteria',
  ];

  function AgentTrustPartnership() {
    return (
      <section id="partnership" className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative w-full" data-node-id="32:13250">
        {/* Eyebrow */}
        <div className="border-[#c5c5c1] border-b border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <p className="m-0 text-black text-[11px] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Partnership</p>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + description grid (12 cols) */}
          <div className="grid grid-cols-12 gap-x-[16px] gap-y-[24px] relative shrink-0 w-full">
            {/* Heading: cols 1-10, two lines (left + right-aligned) */}
            <div className="col-span-10 flex flex-col items-stretch">
              <p className="m-0 text-[71.4px] text-black tracking-[-3.008px] leading-[72px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Safe AI deployment is</p>
              <p className="m-0 text-[72px] text-black text-right tracking-[-3.008px] leading-[72px] whitespace-nowrap w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>a shared partnership</p>
            </div>
            {/* Description: cols 1-4, second row */}
            <div className="col-span-4 col-start-1 flex items-start gap-[40px] relative">
              <p className="m-0 text-[12px] text-[#626260] leading-[16px] shrink-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>01</p>
              <div className="flex flex-col">
                <p className="m-0 text-[16.5px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Safe AI deployment is a partnership. Clain is built</p>
                <p className="m-0 text-[16.5px] text-[#313130] leading-[23.94px] pt-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                  <span style={{ display: 'block' }}>for transparency and control at every step—we</span>
                  <span style={{ display: 'block' }}>maintain the security and reliability foundation, while</span>
                  <span style={{ display: 'block' }}>you define the policies and boundaries that fit your</span>
                  <span style={{ display: 'block' }}>business.</span>
                </p>
              </div>
            </div>
          </div>

          {/* Two-card grid */}
          <div className="grid grid-cols-12 gap-[16px] relative shrink-0 w-full">
            {[
              { title: 'We ensure', items: AT_PART_ENSURE, hSize: 30 },
              { title: 'You define', items: AT_PART_DEFINE, hSize: 29.3 },
            ].map((card) => (
              <div key={card.title} className="col-span-6 border border-solid border-[#c5c5c1] rounded-[4px] p-[17px] flex flex-col justify-between" style={{ minHeight: 391 }}>
                <p className="m-0 text-black tracking-[-0.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: card.hSize, lineHeight: '35px' }}>{card.title}</p>
                <ul className="list-none m-0 p-0 flex flex-col gap-[4px] w-full">
                  {card.items.map((it, i) => (
                    <li key={i} className={`flex gap-[16px] items-start pb-[7px] pt-[6px] ${i < card.items.length - 1 ? 'border-[#c5c5c1] border-b border-solid' : ''}`}>
                      <div className="pt-[4px] shrink-0">
                        <AtBullet />
                      </div>
                      <p className="m-0 text-[12.8px] text-black tracking-[0.496px] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{it}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Corner brackets */}
        <div className="absolute border-[#c5c5c1] border-l border-t border-solid left-[8px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-r border-t border-solid right-[8.02px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-l border-solid bottom-[8px] left-[8px] size-[24px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-r border-solid bottom-[8px] right-[8.02px] size-[24px] pointer-events-none" />
      </section>
    );
  }


  // AGENT TRUST — AI AGENT SAFETY section (Figma node 32:13322)
  // Light bg #f6f6f1. Heading "Secure by design" + "02" callout, big empty Fig 2.B card,
  // then two-tab row "Procedures" (muted) / "Simulations" (active w/ orange progress bar)

  function AgentTrustSafety() {
    return (
      <section id="ai-agent-safety" className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative w-full" data-node-id="32:13322">
        {/* Eyebrow */}
        <div className="border-[#c5c5c1] border-b border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <p className="m-0 text-black text-[11px] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>AI Agent Safety</p>
        </div>

        {/* Corner brackets */}
        <div className="absolute border-[#c5c5c1] border-l border-t border-solid left-[8px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-r border-t border-solid right-[8.02px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-l border-solid bottom-[8px] left-[8px] size-[24px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-r border-solid bottom-[8px] right-[8.02px] size-[24px] pointer-events-none" />

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading row */}
          <div className="grid grid-cols-10 gap-x-[16px] gap-y-[24px] relative shrink-0 w-full">
            <div className="col-span-5">
              <p className="m-0 text-[52.2px] text-black tracking-[-3.008px] leading-[54px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Secure by design</p>
            </div>
            <div className="col-span-5 pl-[52.125px] pt-[9.59px] max-w-[472.125px]">
              <div className="flex items-start gap-[40px]">
                <p className="m-0 text-[11.6px] text-[#626260] leading-[16px] shrink-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>02</p>
                <div className="flex flex-col">
                  <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>AI safety isn’t a checkbox—it’s built into every</p>
                  <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px] pt-[12px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                    <span style={{ display: 'block' }}>part of Clain. Clain’s self-serve tools give you full visibility</span>
                    <span style={{ display: 'block' }}>and control over how your AI Agent behaves, before it</span>
                    <span style={{ display: 'block' }}>ever reaches a customer. You can define boundaries,</span>
                    <span style={{ display: 'block' }}>add business logic, and continuously test behavior as</span>
                    <span style={{ display: 'block' }}>your workflows evolve.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Big "Fig 2.B" empty card with radial gradient backdrop */}
          <div className="bg-[#f4f3ec] border border-solid border-[#c5c5c1] relative shrink-0 w-full overflow-hidden" style={{ height: 448.53 }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 747px 316px at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 1%)' }} />
            <div className="absolute left-0 top-0 bg-[#f4f3ec] border border-solid border-[#c5c5c1] flex items-start px-[11px] py-[9px]">
              <p className="m-0 text-[11px] text-[#626260] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Fig 2.B</p>
            </div>
          </div>

          {/* Two-tab row: Procedures (muted) / Simulations (active w/ orange progress) */}
          <div className="flex gap-[24px] items-start justify-center relative shrink-0 w-full" style={{ height: 131.94 }}>
            {/* Procedures tab — muted */}
            <div className="flex-1 relative h-full">
              <div className="absolute inset-x-0 top-0 h-px bg-[#c5c5c1]" />
              <div className="pt-[11px]">
                <p className="m-0 text-[16.7px] text-[#626260] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Procedures</p>
              </div>
              <div className="pt-[8px]">
                <p className="m-0 text-[12.9px] text-[#626260] tracking-[0.496px] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                  <span style={{ display: 'block' }}>Handle complex workflows with confidence. Procedures let Clain perform multi-</span>
                  <span style={{ display: 'block' }}>step actions, apply business rules, trigger approvals, or connect to external</span>
                  <span style={{ display: 'block' }}>systems—all while staying within your defined parameters.</span>
                </p>
              </div>
              <div className="pt-[16px]">
                <a onClick={() => ClainV2.navigate('#')} className="cursor-pointer inline-block bg-[#7b7b78] text-[#7b7b78]" style={{ borderBottom: '0', paddingBottom: 5 }}>
                  <span className="block text-[12.9px] text-center tracking-[0.07px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: '#7b7b78' }}>Learn more</span>
                </a>
              </div>
            </div>

            {/* Simulations tab — active */}
            <div className="flex-1 relative h-full">
              <div className="absolute inset-x-0 top-0 h-px bg-[#c5c5c1]" />
              <div className="absolute left-0 top-0 h-px bg-[#ff5600]" style={{ right: 423.57 }} />
              <div className="pt-[11px]">
                <p className="m-0 text-[16.7px] text-black leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Simulations</p>
              </div>
              <div className="pt-[8px]">
                <p className="m-0 text-[12.8px] text-[#313130] tracking-[0.496px] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                  <span style={{ display: 'block' }}>Test how Clain behaves in any situation. Run realistic, end-to-end conversations</span>
                  <span style={{ display: 'block' }}>that mirror customer scenarios—from simple FAQs to sensitive, high-impact</span>
                  <span style={{ display: 'block' }}>cases.</span>
                </p>
              </div>
              <div className="pt-[16px]">
                <a onClick={() => ClainV2.navigate('#')} className="cursor-pointer inline-block bg-black" style={{ paddingBottom: 5 }}>
                  <span className="block text-[12.9px] text-black text-center tracking-[0.07px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Learn more</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }


  // AGENT TRUST — TRUST section (Figma node 32:13374)
  // Light bg #f6f6f1. Heading "Trusted by over 6,000 customers" + 03 paragraph + 2x2 customer card grid

  // Customer logo + chart SVGs from Figma
  const atTrustRMLogo    = "/v2/assets/9456de0a-2bc4-4989-b5e1-101c83c0e7df.svg"; // Rocket Money logo
  const atTrustClayLogo  = "/v2/assets/3581606f-c534-4139-921d-3bc644fb5e2b.svg"; // Clay logo
  const atTrustConsLogo  = "/v2/assets/ba64936f-c9d9-4efe-86dc-aa47534d49c7.svg"; // ConsenSys logo
  const atTrustSwyftLogo = "/v2/assets/6f492060-f061-4de2-9c76-118da8f02dba.svg"; // Swyftx logo
  const atTrustChartRM   = "/v2/assets/8957ff58-8b9b-40d1-bbf7-b0e71b0367fc.svg"; // Rocket Money line chart (FIN/Zendesk/Decagon)
  const atTrustChartSwy  = "/v2/assets/e4a25c67-33e4-4ef3-a8f6-ca4d931e68f7.svg"; // Swyftx bar chart

  function AgentTrustTrust() {
    return (
      <section id="trust" className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative w-full" data-node-id="32:13374">
        {/* Eyebrow */}
        <div className="border-[#c5c5c1] border-b border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <p className="m-0 text-black text-[11px] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Trust</p>
        </div>

        {/* Corner brackets */}
        <div className="absolute border-[#c5c5c1] border-l border-t border-solid left-[8px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-r border-t border-solid right-[8.02px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-l border-solid bottom-[8px] left-[8px] size-[24px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-r border-solid bottom-[8px] right-[8.02px] size-[24px] pointer-events-none" />

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading row */}
          <div className="grid grid-cols-10 gap-x-[16px] gap-y-[24px] relative shrink-0 w-full">
            <div className="col-span-10 flex flex-col items-stretch">
              <p className="m-0 text-[71.4px] text-black text-center tracking-[-3.008px] leading-[72px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>
                <span style={{ display: 'block' }}>Trusted by over 6,000</span>
                <span style={{ display: 'block' }}>customers</span>
              </p>
            </div>
            <div className="col-span-5">
              <div className="flex items-start gap-[40px] max-w-[420px]">
                <p className="m-0 text-[12px] text-[#626260] leading-[16px] shrink-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>03</p>
                <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                  <span style={{ display: 'block' }}>Clain has successfully resolved over 40m</span>
                  <span style={{ display: 'block' }}>conversations across 6000+ organizations from</span>
                  <span style={{ display: 'block' }}>regulated fintech platforms handling millions in</span>
                  <span style={{ display: 'block' }}>transactions to healthcare companies managing</span>
                  <span style={{ display: 'block' }}>sensitive patient data.</span>
                </p>
              </div>
            </div>
          </div>

          {/* 2x2 customer card grid */}
          <div className="grid grid-cols-2 gap-[16px] relative shrink-0 w-full">
            {/* Rocket Money featured card */}
            <div className="border border-solid border-[#c5c5c1] rounded-[4px] p-[24px] flex flex-col gap-[24px] bg-white relative" style={{ minHeight: 540 }}>
              <div className="flex items-center justify-between">
                <img src={atTrustRMLogo} alt="Rocket Money" className="h-[20px]" />
              </div>
              <p className="m-0 text-[24px] text-black tracking-[-0.4px] leading-[28px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>
                <span style={{ display: 'block' }}>Why Rocket Money</span>
                <span style={{ display: 'block' }}>chose Clain AI Agent</span>
              </p>
              <p className="m-0 text-[12.8px] text-[#313130] tracking-[0.496px] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                <span style={{ display: 'block' }}>With millions of users and rising support</span>
                <span style={{ display: 'block' }}>complexity, Rocket Money didn’t just</span>
                <span style={{ display: 'block' }}>add agents—they transformed their</span>
                <span style={{ display: 'block' }}>support model with Clain, shifting how</span>
                <span style={{ display: 'block' }}>their team works, and proving</span>
                <span style={{ display: 'block' }}>automation can be both efficient and</span>
                <span style={{ display: 'block' }}>trusted.</span>
              </p>
              <div className="mt-auto">
                <img src={atTrustChartRM} alt="" className="w-full h-auto" />
                <p className="m-0 pt-[8px] text-[11px] text-[#626260] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Rocket Money resolution rate</p>
                <p className="m-0 pt-[12px] text-[11px] text-[#626260] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>With Michelle McGowan From Rocket Money</p>
              </div>
            </div>

            {/* Clay quote card */}
            <div className="border border-solid border-[#c5c5c1] rounded-[4px] p-[24px] flex flex-col gap-[20px] bg-white" style={{ minHeight: 540 }}>
              <img src={atTrustClayLogo} alt="Clay" className="h-[20px] self-start" />
              <p className="m-0 text-[16.5px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>“There’s a lot of transparency baked into how you configure Clain and build the workflows, which gives us control over the end-to-end experience. That was the light bulb moment for us; we were going to be letting this thing loose on our support queue, so we needed to have that level of transparency and control over the experience.”</p>
              <div className="mt-auto">
                <p className="m-0 text-[14px] text-black leading-[20px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>George Dilthey</p>
                <p className="m-0 text-[12.8px] text-[#626260] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Head of Support at Clay</p>
                <p className="m-0 pt-[20px] text-[71.4px] text-black tracking-[-3.008px] leading-[72px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>53%</p>
                <p className="m-0 pt-[4px] text-[11px] text-[#626260] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Clay g2 satisfaction scores</p>
              </div>
            </div>

            {/* ConsenSys quote card */}
            <div className="border border-solid border-[#c5c5c1] rounded-[4px] p-[24px] flex flex-col gap-[20px] bg-white" style={{ minHeight: 380 }}>
              <img src={atTrustConsLogo} alt="ConsenSys" className="h-[20px] self-start" />
              <p className="m-0 text-[16.5px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>“We saw quick success with Clain — reaching around a 50% resolution rate early on, and scaling that to over 70% over time, all while keeping customer satisfaction high.”</p>
              <div className="mt-auto">
                <p className="m-0 text-[14px] text-black leading-[20px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>Yair Gal</p>
                <p className="m-0 text-[12.8px] text-[#626260] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Support lead at consensys</p>
                <p className="m-0 pt-[20px] text-[71.4px] text-black tracking-[-3.008px] leading-[72px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>91%</p>
              </div>
            </div>

            {/* Swyftx card */}
            <div className="border border-solid border-[#c5c5c1] rounded-[4px] p-[24px] flex flex-col gap-[20px] bg-white" style={{ minHeight: 380 }}>
              <img src={atTrustSwyftLogo} alt="Swyftx" className="h-[20px] self-start" />
              <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                <span style={{ display: 'block' }}>Learn how Swyftx reached a 91%</span>
                <span style={{ display: 'block' }}>answer rate and earned customer trust</span>
                <span style={{ display: 'block' }}>with Clain’s unrestricted, intelligent AI</span>
                <span style={{ display: 'block' }}>support.</span>
              </p>
              <div className="mt-auto">
                <img src={atTrustChartSwy} alt="" className="w-full h-auto" />
                <p className="m-0 pt-[8px] text-[11px] text-[#626260] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Clain Answer rate</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }


  // AGENT TRUST — SECURITY AND PRIVACY section (Figma node 32:13409)
  // Light bg #f6f6f1. Heading "Enterprise security and privacy / standards you can trust"
  // Left col: 5 stacked compliance groups with bullet badges. Right col: big "Fig 4.A" image card.
  const atSecBulletV = "/v2/assets/3531bbc5-1d60-417c-81bf-128d790948dd.svg";
  const atSecImage   = "/v2/assets/8b8c121e-e598-4497-9ba7-8a4cb3074ea7.png";

  function AtSecBullet() {
    return (
      <div className="h-[6px] w-[8px] relative shrink-0 overflow-clip">
        <div className="absolute inset-[0_10.94%_11.25%_0]">
          <img alt="" className="block size-full" src={atSecBulletV} />
        </div>
      </div>
    );
  }

  const AT_SEC_GROUPS = [
    {
      title: 'Information Security Management',
      body: ['Independent audits confirm your data is encrypted,', 'monitored, and protected by enterprise-grade controls.'],
      badges: ['SOC2', 'ISO 27001'],
    },
    {
      title: 'AI Governance',
      body: ['Ethical AI deployment with bias detection, risk management,', 'and transparent decision-making.'],
      badges: ['ISO 42001', 'AIUC-1'],
    },
    {
      title: 'Privacy Protection',
      body: ['Your customer data stays yours—with GDPR/CCPA', 'compliance and transparent processing practices.'],
      badges: ['ISO 27701', 'HIPAA'],
    },
    {
      title: 'Access Control',
      body: ['Clain integrates with Okta, Azure AD, and OneLogin for SSO;', 'supports 2FA, SCIM, and IP restrictions to secure workspace', 'access.'],
      badges: null,
    },
    {
      title: 'Data Protection',
      body: ['Clain uses anonymized customer data for fine-tuning. Opt out', 'anytime—data is deleted within 30 days.'],
      badges: null,
      learnMore: true,
    },
  ];

  function AgentTrustSecurity() {
    return (
      <section id="security-and-privacy" className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative w-full" data-node-id="32:13409">
        {/* Eyebrow */}
        <div className="border-[#c5c5c1] border-b border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <p className="m-0 text-black text-[11px] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Security and Privacy</p>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + 04 description grid */}
          <div className="grid grid-cols-12 gap-x-[16px] gap-y-[24px] relative shrink-0 w-full">
            <div className="col-span-10 flex flex-col items-stretch">
              <p className="m-0 text-[72px] text-black tracking-[-3.008px] leading-[72px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Enterprise security and privacy</p>
              <p className="m-0 text-[72px] text-black text-right tracking-[-3.008px] leading-[72px] whitespace-nowrap w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>standards you can trust</p>
            </div>
            <div className="col-span-4 col-start-7 pt-[32px]">
              <div className="flex flex-col gap-[24px] max-w-[420px]">
                <div className="flex items-start gap-[40px]">
                  <p className="m-0 text-[11.6px] text-[#626260] leading-[16px] shrink-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>04</p>
                  <div className="flex flex-col">
                    <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Clain meets the highest global standards for data</p>
                    <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px] pt-[12px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                      <span style={{ display: 'block' }}>security, privacy, and AI governance. Every layer of</span>
                      <span style={{ display: 'block' }}>our platform—from infrastructure to model handling—</span>
                      <span style={{ display: 'block' }}>is designed to protect your business and your</span>
                      <span style={{ display: 'block' }}>customers.</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-start">
                  <a onClick={() => ClainV2.navigate('#')} className="border border-solid border-black content-stretch cursor-pointer flex h-[42px] items-center justify-center pb-[13.5px] pt-[12.5px] px-[17px] relative rounded-[6px] shrink-0">
                    <span className="text-[14.6px] text-black tracking-[-0.32px] leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Learn more</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Left column (compliance groups) + right column (Fig 4.A image card) */}
          <div className="grid relative shrink-0 w-full" style={{ gridTemplateColumns: '2fr 3fr', gap: '48px' }}>
            {/* Left: 5 compliance groups */}
            <div className="flex flex-col gap-[23px] pt-[24px] w-[404.25px] max-w-full">
              {AT_SEC_GROUPS.map((g, idx) => (
                <div key={g.title} className="flex flex-col w-full">
                  <p className="m-0 text-[16.7px] text-black leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{g.title}</p>
                  <div className="pt-[8px]">
                    <p className="m-0 text-[12.9px] text-[#313130] tracking-[0.496px] leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                      {g.body.map((line, i) => <span key={i} style={{ display: 'block' }}>{line}</span>)}
                    </p>
                  </div>
                  {g.badges && (
                    <ul className="list-none m-0 p-0 pt-[16px] flex flex-col">
                      {g.badges.map((b) => (
                        <li key={b} className="flex gap-[16px] items-start py-[2px]">
                          <div className="pt-[4px] shrink-0">
                            <AtSecBullet />
                          </div>
                          <p className="m-0 text-[13.8px] text-[#313130] tracking-[0.496px] leading-[18px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{b}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {g.learnMore && (
                    <div className="pt-[16px]">
                      <a onClick={() => ClainV2.navigate('#')} className="cursor-pointer inline-block bg-black" style={{ paddingBottom: 5 }}>
                        <span className="block text-[12.9px] text-black text-center tracking-[0.07px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Learn more</span>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Right: Fig 4.A image card */}
            <div className="flex flex-col items-stretch pb-[61.28px]">
              <div className="bg-[#f4f3ec] border border-solid border-[#c5c5c1] relative shrink-0 w-full overflow-hidden" style={{ aspectRatio: '604.41 / 604.41' }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle 427px at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 1%)' }} />
                <img alt="" className="absolute inset-0 size-full object-cover" src={atSecImage} />
                <div className="absolute left-[-1px] top-[-1px] bg-[#f4f3ec] border border-solid border-[#c5c5c1] flex items-start px-[11px] py-[9px]">
                  <p className="m-0 text-[11px] text-[#626260] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Fig 4.A</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Corner brackets */}
        <div className="absolute border-[#c5c5c1] border-l border-t border-solid left-[8px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-r border-t border-solid right-[8.02px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-l border-solid bottom-[8px] left-[8px] size-[24px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-r border-solid bottom-[8px] right-[8.02px] size-[24px] pointer-events-none" />
      </section>
    );
  }


  // AGENT TRUST — RELIABILITY AND SCALE section (Figma node 32:13506)
  // Light bg #f6f6f1. Heading right-aligned "Proven scale and / reliability" + "05" copy left.
  // Three rows: Multi-model resilience / Global Infrastructure / Continuous availability
  const AT_REL_ROWS = [
    { title: 'Multi-model resilience',  body: ['Clain uses OpenAI, Anthropic, Google, and Clain models,', 'switching automatically to maintain performance.'] },
    { title: 'Global Infrastructure',   body: ['Data hosted in the US, EU, or Australia based on residency', 'needs.'] },
    { title: 'Continuous availability', body: ['Redundant systems ensure zero single point of failure.'] },
  ];

  function AgentTrustReliability() {
    return (
      <section id="reliability-and-scale" className="bg-[#f6f6f1] content-stretch flex flex-col gap-[32px] items-start pb-[48px] pt-[32px] px-[48px] relative w-full" data-node-id="32:13506">
        {/* Eyebrow */}
        <div className="border-[#c5c5c1] border-b border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <p className="m-0 text-black text-[11px] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Reliability and Scale</p>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + 05 description grid */}
          <div className="grid grid-cols-12 gap-x-[16px] gap-y-[24px] relative shrink-0 w-full">
            {/* Heading: cols 6-10 right-aligned */}
            <div className="col-span-5 col-start-6 flex flex-col items-end">
              <p className="m-0 text-[71px] text-black text-right tracking-[-3.008px] leading-[72px] whitespace-nowrap w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Proven scale and</p>
              <p className="m-0 text-[72px] text-black text-right tracking-[-3.008px] leading-[72px] whitespace-nowrap w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>reliability</p>
            </div>
            {/* Description: cols 1-4 row 2 */}
            <div className="col-span-4 col-start-1 flex items-start gap-[40px]">
              <p className="m-0 text-[11.8px] text-[#626260] leading-[16px] shrink-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>05</p>
              <div className="flex flex-col">
                <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Clain’s infrastructure powers millions of secure</p>
                <p className="m-0 text-[16.3px] text-[#313130] leading-[23.94px] pt-[12px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                  <span style={{ display: 'block' }}>conversations every month—with the reliability global</span>
                  <span style={{ display: 'block' }}>enterprises depend on. Our systems are architected</span>
                  <span style={{ display: 'block' }}>for continuous uptime, built with redundancy across</span>
                  <span style={{ display: 'block' }}>regions, and backed by a 99.8% SLA to ensure every</span>
                  <span style={{ display: 'block' }}>customer interaction happens without interruption.</span>
                </p>
              </div>
            </div>
          </div>

          {/* Three reliability rows */}
          <div className="flex flex-col w-full">
            {AT_REL_ROWS.map((r) => (
              <div key={r.title} className="border-[#c5c5c1] border-t border-solid grid grid-cols-12 gap-x-[16px] gap-y-[16px] pt-[13px] pb-[12px] mb-[24px] last:mb-0 w-full">
                <div className="col-span-6">
                  <p className="m-0 text-black tracking-[-1.504px] leading-[39.96px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 36 }}>{r.title}</p>
                </div>
                <div className="col-span-6 max-w-[480px]">
                  <p className="m-0 text-[16.5px] text-[#626260] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                    {r.body.map((line, i) => <span key={i} style={{ display: 'block' }}>{line}</span>)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Corner brackets */}
        <div className="absolute border-[#c5c5c1] border-l border-t border-solid left-[8px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-r border-t border-solid right-[8.02px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-l border-solid bottom-[8px] left-[8px] size-[24px] pointer-events-none" />
        <div className="absolute border-[#c5c5c1] border-b border-r border-solid bottom-[8px] right-[8.02px] size-[24px] pointer-events-none" />
      </section>
    );
  }


  // AGENT TRUST — GUARANTEE section (Figma node 32:13543)
  // DARK bg #080f1e (only dark section after hero). Heading "Clain Million Dollar Guarantee"
  // + 06 copy + 2 trust badges. Below: bordered card with Apply Now + Eligibility criteria
  const atGuarBadge1 = "/v2/assets/dfdef1b2-b668-4333-87a4-f6635be95d4a.svg"; // G2 #1 badge
  const atGuarBadge2 = "/v2/assets/488b3884-9b55-4389-a929-8f717b9af72d.svg"; // 2M conversations badge

  function AgentTrustGuarantee() {
    return (
      <section id="guarantee" className="bg-[#080f1e] content-stretch flex flex-col gap-[32px] items-start pb-[112px] pt-[32px] px-[48px] relative w-full" data-node-id="32:13543">
        {/* Eyebrow */}
        <div className="border-[#393f4b] border-b border-solid content-stretch flex gap-[16px] items-center pb-[13px] pt-[8px] relative shrink-0 w-full">
          <div className="bg-[#ff5600] relative shrink-0 size-[6px]" />
          <p className="m-0 text-white text-[11px] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Guarantee</p>
        </div>

        <div className="content-stretch flex flex-col gap-[64px] items-start relative shrink-0 w-full">
          {/* Heading + 06 description + badges */}
          <div className="grid grid-cols-12 gap-x-[16px] gap-y-[24px] relative shrink-0 w-full">
            <div className="col-span-10">
              <p className="m-0 text-[72px] text-white tracking-[-3.008px] leading-[72px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Clain Million Dollar Guarantee</p>
            </div>
            {/* Description col 1-4 row 2 */}
            <div className="col-span-4 col-start-1 flex items-start gap-[40px]">
              <p className="m-0 text-[12px] text-[#9c9fa5] leading-[16px] shrink-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>06</p>
              <div className="flex flex-col">
                <p className="m-0 text-[16.5px] text-[#cecfd2] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Clain is the highest performing AI Agent,</p>
                <p className="m-0 text-[16.5px] text-[#cecfd2] leading-[23.94px] pt-[12px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                  <span style={{ display: 'block' }}>consistently beating competitors in head-to-head</span>
                  <span style={{ display: 'block' }}>evaluations. That’s why we offer the Clain Million Dollar</span>
                  <span style={{ display: 'block' }}>Guarantee.</span>
                </p>
              </div>
            </div>
            {/* Badges col 6-9 row 2 */}
            <div className="col-span-4 col-start-6 pt-[24px]">
              <ul className="list-none m-0 p-0 flex flex-col gap-[16px]">
                <li className="flex gap-[16px] items-start py-[2px]">
                  <div className="h-[16px] w-[14px] shrink-0 relative">
                    <img src={atGuarBadge1} alt="" className="absolute h-[14.574px] left-0 top-[2px] w-[13.98px]" />
                  </div>
                  <p className="m-0 text-[13.6px] text-white tracking-[1.504px] uppercase leading-[16px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>#1 AGENT ON G2</p>
                </li>
                <li className="flex gap-[16px] items-start py-[2px]">
                  <div className="h-[16px] w-[14px] shrink-0 pt-[2px] relative">
                    <img src={atGuarBadge2} alt="" className="h-[12.715px] w-[13.98px]" />
                  </div>
                  <p className="m-0 text-[13.1px] text-white tracking-[1.504px] uppercase leading-[16px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>2M+ conversations resolved monthly</p>
                </li>
              </ul>
            </div>
          </div>

          {/* Bordered guarantee card with two columns */}
          <div className="border border-solid border-[#393f4b] grid grid-cols-9 gap-x-[24px] gap-y-[24px] p-[25px] relative shrink-0 w-full">
            {/* Left col: payout copy + Apply Now */}
            <div className="col-span-4 flex flex-col justify-between" style={{ minHeight: 143.81 }}>
              <p className="m-0 text-[16.3px] text-[#9c9fa5] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                <span style={{ display: 'block' }}>If you sign up for our Clain Guarantee Success</span>
                <span style={{ display: 'block' }}>Program and do not achieve at least a resolution</span>
                <span style={{ display: 'block' }}>rate of 65%, we will pay you $1M.</span>
              </p>
              <div className="flex flex-wrap items-start pt-[16px]">
                <a onClick={() => ClainV2.navigate('/signup')} className="bg-white content-stretch cursor-pointer flex h-[40px] items-center justify-center pb-[12.5px] pt-[11.5px] px-[16px] relative rounded-[6px] shrink-0">
                  <span className="text-[14.4px] text-black tracking-[-0.32px] leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Apply Now</span>
                </a>
              </div>
            </div>
            {/* Right col: eligibility criteria */}
            <div className="col-span-4 col-start-6 flex flex-col gap-[14.9px] pb-[18.06px]">
              <p className="m-0 text-[11px] text-[#9c9fa5] uppercase tracking-[1.504px] leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Eligibility criteria:</p>
              <p className="m-0 text-[16.5px] text-[#9c9fa5] leading-[23.94px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                <span style={{ display: 'block' }}>We’re excited to partner with all high volume customers</span>
                <span style={{ display: 'block' }}>(over 250k monthly conversations) in North America</span>
                <span style={{ display: 'block' }}>and Europe. Phase one of this program will admit</span>
                <span style={{ display: 'block' }}>customers on Clain Helpdesk.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Corner brackets (dark) */}
        <div className="absolute border-[#393f4b] border-l border-t border-solid left-[8px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#393f4b] border-r border-t border-solid right-[8.02px] size-[24px] top-[8px] pointer-events-none" />
        <div className="absolute border-[#393f4b] border-b border-l border-solid bottom-[8px] left-[8px] size-[24px] pointer-events-none" />
        <div className="absolute border-[#393f4b] border-b border-r border-solid bottom-[8px] right-[8.02px] size-[24px] pointer-events-none" />
      </section>
    );
  }


  // AGENT TRUST — FINAL CTA section (Figma node 32:13616)
  // Full-bleed gradient bg with dual mask + heading "Deploy Clain with / confidence today"
  const atCtaBg    = "/v2/assets/949de3b7-c87c-487f-b9e4-7e26e03fe88e.png";
  const atCtaMask1 = "/v2/assets/97d9671b-59a5-424e-9c26-f4e5e326e0b6.svg";
  const atCtaMask2 = "/v2/assets/60888a10-f577-49ce-94ef-c88fe9644a28.svg";

  function AgentTrustFinalCta() {
    return (
      <div className="content-stretch flex flex-col items-start relative w-full bg-[#080f1e]" data-node-id="32:13616">
        <div className="absolute inset-0 max-w-[1920px] pointer-events-none" style={{ maskImage: `url('${atCtaMask1}')`, WebkitMaskImage: `url('${atCtaMask1}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}>
          <div className="absolute inset-0 overflow-hidden" style={{ maskImage: `url('${atCtaMask2}')`, WebkitMaskImage: `url('${atCtaMask2}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}>
            <img alt="" className="absolute inset-0 w-full h-full object-cover" src={atCtaBg} />
          </div>
        </div>
        <div className="grid grid-cols-12 gap-x-[48px] gap-y-[48px] h-[538px] max-w-[1600px] mx-auto overflow-clip px-[24px] py-[160px] relative shrink-0 w-full">
          <div className="col-start-3 col-span-8 flex flex-col items-stretch self-start">
            <div className="content-stretch flex flex-col items-start pb-[32px] relative shrink-0 w-full">
              <p className="m-0 tracking-[-3.008px] leading-[72px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 71.7, color: 'rgba(255,255,255,0.6)' }}>Deploy Clain with</p>
              <p className="m-0 text-white text-right tracking-[-3.008px] leading-[72px] whitespace-nowrap w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 69.8 }}>confidence today</p>
            </div>
            <div className="content-start flex flex-wrap gap-[12px] h-[42px] items-start relative shrink-0 w-full">
              <a onClick={() => ClainV2.navigate('/signup')} className="bg-white content-stretch cursor-pointer flex h-[42px] items-center justify-center pb-[13.5px] pt-[12.5px] px-[16px] relative rounded-[6px] shrink-0">
                <span className="text-[14.4px] text-black tracking-[-0.32px] leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Start free trial</span>
              </a>
              <a onClick={() => ClainV2.navigate('/demo')} className="border border-solid border-white content-stretch cursor-pointer flex h-[42px] items-center justify-center pb-[13.5px] pt-[12.5px] px-[17px] relative rounded-[6px] shrink-0">
                <span className="text-[14.8px] text-white tracking-[-0.32px] leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>View demo</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }


  const AT_CHAPTERS = [
    { id: 'partnership',           num: '01', label: 'partnership' },
    { id: 'ai-agent-safety',       num: '02', label: 'safety' },
    { id: 'trust',                 num: '03', label: 'trust' },
    { id: 'security-and-privacy',  num: '04', label: 'security' },
    { id: 'reliability-and-scale', num: '05', label: 'reliability' },
    { id: 'guarantee',             num: '06', label: 'guarantee' },
  ];

  function AtChapterNav({ activeId, onClick }) {
    return (
      <div className="content-stretch flex flex-col items-start relative w-full">
        {AT_CHAPTERS.map((c) => (
          <div key={c.id} className="content-stretch flex flex-col items-start relative shrink-0 w-full">
            <a href={'#' + c.id} onClick={(e) => { e.preventDefault(); onClick(c.id); }} className="content-stretch cursor-pointer flex items-start justify-center py-[10px] relative shrink-0 w-full" style={{ textDecoration: 'none' }}>
              <div className="content-stretch flex flex-1 items-center min-w-px relative">
                <div className="content-stretch flex flex-col items-start pr-[12px] relative shrink-0">
                  <p className="m-0 text-[11px] tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: activeId === c.id ? 'white' : 'rgba(255,255,255,0.6)' }}>{c.num}</p>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0">
                  <p className="m-0 text-[11px] tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: activeId === c.id ? 'white' : 'rgba(255,255,255,0.6)' }}>{c.label}</p>
                </div>
              </div>
            </a>
            <div className="h-px relative shrink-0 w-full" style={{ background: activeId === c.id ? '#ff5600' : 'rgba(255,255,255,0.2)' }} />
          </div>
        ))}
      </div>
    );
  }

  function AgentTrustPage() {
    const [activeSection, setActiveSection] = useState('partnership');
    useEffect(() => {
      const sections = AT_CHAPTERS.map(c => document.getElementById(c.id)).filter(Boolean);
      if (!sections.length) return;
      const observer = new IntersectionObserver(
        (entries) => {
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
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return (
      <PageShell>
        <div style={{ width: '100%', background: '#080f1e' }}>
          <AgentTrustHero />
          <div style={{ maxWidth: 1440, margin: '0 auto', paddingLeft: 24, paddingRight: 24, position: 'relative' }}>
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
              <aside style={{ width: 205, flexShrink: 0, position: 'sticky', top: 100, paddingTop: 16 }}>
                <AtChapterNav activeId={activeSection} onClick={scrollToSection} />
              </aside>
              <div style={{ flex: 1, minWidth: 0, maxWidth: 1155 }}>
                <div style={{ scrollMarginTop: 80 }}><AgentTrustPartnership /></div>
                <div style={{ scrollMarginTop: 80 }}><AgentTrustSafety /></div>
                <div style={{ scrollMarginTop: 80 }}><AgentTrustTrust /></div>
                <div style={{ scrollMarginTop: 80 }}><AgentTrustSecurity /></div>
                <div style={{ scrollMarginTop: 80 }}><AgentTrustReliability /></div>
                <div style={{ scrollMarginTop: 80 }}><AgentTrustGuarantee /></div>
              </div>
            </div>
          </div>
          <AgentTrustFinalCta />
        </div>
      </PageShell>
    );
  }

  window.AgentTrustPage = AgentTrustPage;
})();
