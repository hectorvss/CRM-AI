/* global React, ClainV2 */
/* Features (Startups Early Stage Program) page — extracted from Figma node 2:7722
   8 sections + final CTA. Linked from "Features" entry in nav dropdown. */
(function () {
  const { PageShell } = ClainV2;

  // FEATURES (Startups) — HERO section (Figma node 2:6663)
  // Layout: 2-column grid (text left + image right)
  const featHeroImgVector  = "/v2/assets/07fbbe05-828d-4e9e-acc1-7b95e78bc123.svg";
  const featHeroImgVector1 = "/v2/assets/3831d266-6dc8-475e-b703-dd9ef65f655f.svg";
  const featHeroImgBgTrees = "/v2/assets/4ca4ca4f-48f9-4bb9-ba68-6b8f023e1a37.jpg";
  const featHeroImgFg      = "/v2/assets/e72a131a-ed35-41e2-944e-00055aad0cb3.png";

  function FeatHeroDottedSpacer() {
    return (
      <div className="opacity-100 overflow-clip relative size-[12px]">
        <div className="absolute inset-0 opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={featHeroImgVector} />
        </div>
        <div className="absolute inset-[37.5%] opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={featHeroImgVector1} />
        </div>
      </div>
    );
  }

  function FeaturesHero() {
    return (
      <div className="grid grid-cols-2 gap-[56px] grid-rows-[668px] px-[24px] relative w-full" data-node-id="2:6663">
        {/* Left column — content */}
        <div className="grid gap-[32px] grid-cols-1 grid-rows-[303.39px_14px_152.38px] h-[533.77px] justify-self-stretch relative row-1 shrink-0">
          {/* Heading + badge */}
          <div className="content-stretch flex flex-col gap-[30.795px] items-start justify-self-stretch relative row-1 self-start shrink-0">
            {/* Badge "Early Stage Program" */}
            <div className="bg-[#e8e4dc] content-stretch flex items-center px-[9px] py-[5px] relative rounded-[16px] shrink-0 w-[168.34px]">
              <p className="m-0 text-[15.1px] text-[#17100e] whitespace-nowrap leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>Early Stage Program</p>
            </div>
            {/* H1 — 3 lines */}
            <div className="content-stretch flex flex-col items-start max-w-[952.15px] pb-[0.595px] relative shrink-0 w-full">
              <p className="m-0 text-[79.9px] text-black tracking-[-4.09px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, lineHeight: '81.8px' }}>
                <span style={{ display: 'block' }}>Startups get 90%</span>
                <span style={{ display: 'block' }}>off Clain + 1</span>
                <span style={{ display: 'block' }}>year of Clain free</span>
              </p>
            </div>
          </div>

          {/* Dotted line spacer */}
          <div className="content-stretch flex flex-col h-[14px] items-start justify-self-stretch overflow-clip relative row-2 shrink-0" style={{ opacity: 0.2 }}>
            <FeatHeroDottedSpacer />
          </div>

          {/* Description + CTA */}
          <div className="content-stretch flex flex-col gap-[32px] items-start justify-self-stretch relative row-3 self-start shrink-0">
            <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
              <p className="m-0 text-[16.5px] text-black w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '21.6px' }}>
                <span style={{ display: 'block' }}>Startups get 93% off the only complete platform for perfect customer service&mdash;Clain AI</span>
                <span style={{ display: 'block' }}>{`Agent and Clain's Helpdesk. Includes 300 free Clain outcomes and 15 free Clain`}</span>
                <span style={{ display: 'block' }}>qualifications per month so you can deliver exceptional customer experiences at</span>
                <span style={{ display: 'block' }}>reduced costs.</span>
              </p>
            </div>
            <div className="content-stretch flex items-start relative shrink-0 w-full">
              <a onClick={() => ClainV2.navigate('/signup')} className="content-stretch cursor-pointer flex flex-col items-start relative self-stretch shrink-0">
                <div className="bg-[#17100e] content-stretch flex flex-col items-center px-[17px] py-[10px] relative rounded-[6px] shrink-0 w-full" style={{ border: '1px solid rgba(0,0,0,0)' }}>
                  <p className="m-0 text-[12.9px] text-white text-center tracking-[-0.35px] whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>Apply now</p>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Right column — product visual */}
        <div className="content-stretch flex flex-col items-start justify-self-stretch relative row-1 self-start shrink-0">
          <div className="aspect-square relative shrink-0 w-full">
            {/* Background image (trees) */}
            <div className="absolute content-stretch flex flex-col inset-0 items-start justify-center overflow-clip">
              <div className="flex-1 min-h-[668px] min-w-[668px] relative w-full">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute left-0 max-w-none size-full top-0" src={featHeroImgBgTrees} />
                </div>
              </div>
            </div>
            {/* Foreground image */}
            <div className="absolute content-stretch flex flex-col inset-0 items-start overflow-clip">
              <div className="aspect-square relative shrink-0 w-full">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute left-0 max-w-none size-full top-0" src={featHeroImgFg} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // FEATURES — CUSTOMER LOGOS section "Join 10,000+ fast-growing startups using Clain" (Figma node 2:6702)
  // Heading + horizontal marquee row of customer logos as styled text + Apply now CTA
  const featLogosImgMask = "/v2/assets/204df16f-d450-4003-a46b-75e7db9eae1e.svg";

  const FEATURES_CUSTOMER_LOGOS = [
    { name: 'Lovable',     left: 0,      top: 5, weight: 300, size: 30.8, tracking: '-2.56px', textTransform: 'none' },
    { name: 'Synthesia',   left: 160.14, top: 5, weight: 400, size: 26.6, tracking: '-0.32px', textTransform: 'none' },
    { name: 'ChatPRD',     left: 345.3,  top: 9, weight: 900, size: 31.5, tracking: '-1.28px', textTransform: 'none' },
    { name: 'Gamma',       left: 542.72, top: 5, weight: 700, size: 29.9, tracking: '-0.96px', textTransform: 'none' },
    { name: 'Polymarket',  left: 714.89, top: 0, weight: 400, size: 26,   tracking: '-0.64px', textTransform: 'none' },
    { name: 'Chess.com',   left: 906.36, top: 4, weight: 400, size: 31,   tracking: '-0.96px', textTransform: 'none' },
  ];

  function FeaturesCustomerLogosSection() {
    return (
      <div className="bg-[#f4f3ec] content-stretch flex flex-col items-center justify-center relative w-full" data-node-id="2:6702">
        {/* Heading */}
        <div className="content-stretch flex flex-col items-center max-w-[600px] px-[44.91px] relative shrink-0">
          <p className="m-0 text-[46.2px] text-black text-center tracking-[-2.309px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, lineHeight: '46.17px' }}>
            <span style={{ display: 'block' }}>{`Join 10,000+ fast-growing `}</span>
            <span style={{ display: 'block' }}>startups using Clain</span>
          </p>
        </div>

        {/* Marquee row */}
        <div className="content-stretch flex flex-col items-start max-w-[1080px] pt-[48px] relative shrink-0 w-[1080px]">
          <div className="h-[47px] relative shrink-0 w-full">
            <div className="absolute content-stretch flex h-[47px] items-start justify-center left-0 right-0 top-0" style={{ maskImage: `url('${featLogosImgMask}')`, WebkitMaskImage: `url('${featLogosImgMask}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskSize: '100% 47px', WebkitMaskSize: '100% 47px', maskPosition: '0% 0px', WebkitMaskPosition: '0% 0px' }}>
              <div className="flex-1 h-full min-w-px relative">
                <div className="absolute bottom-0 left-0 top-0 w-[1379.19px]">
                  {FEATURES_CUSTOMER_LOGOS.map((logo) => (
                    <div key={logo.name} className="absolute content-stretch flex flex-col items-center px-[8px]" style={{ left: logo.left, top: logo.top, padding: logo.name === 'ChatPRD' ? '3px 8px' : '0px 8px' }}>
                      <p className="m-0 text-black text-center whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: logo.weight, fontSize: logo.size, lineHeight: 'normal', letterSpacing: logo.tracking }}>{logo.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="content-stretch flex flex-col items-start pt-[48px] relative shrink-0 w-full">
          <div className="content-stretch flex flex-col items-center relative shrink-0 w-full">
            <a onClick={() => ClainV2.navigate('/signup')} className="content-stretch cursor-pointer flex items-start justify-center relative shrink-0">
              <div className="bg-[#17100e] content-stretch flex flex-col items-center px-[17px] py-[9px] relative rounded-[6px] shrink-0" style={{ border: '1px solid rgba(0,0,0,0)' }}>
                <p className="m-0 text-[14.6px] text-white text-center tracking-[-0.4px] whitespace-nowrap leading-[16px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>Apply now</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    );
  }


  // FEATURES — SAVE YEAR ON YEAR section (Figma node 2:6751)
  // 3 cards (Year 1 / Year 2 / Year 3) with discounts 93% / 50% / 25%
  // No image assets — pure structure with yellow highlight bg behind percentages

  function FeaturesSaveYearSection() {
    const yellowHighlight = {
      backgroundImage: "linear-gradient(0deg, rgba(246,244,49,0) 9%, rgb(246,244,49) 9%, rgb(246,244,49) 85%, rgba(246,244,49,0) 85%)",
    };
    const cards = [
      { year: 'Year 1', pct: '93%', body: ['for the 1st year—with 300 free Clain outcomes', 'and 15 free Clain qualifications per month.', 'Phone, SMS, and WhatsApp are charged at', 'list price.'] },
      { year: 'Year 2', pct: '50%', body: ['for the 2nd year—with 150 free Clain outcomes', 'and 15 free Clain qualifications per month.', 'Phone, SMS, and WhatsApp are charged at', 'list price.'] },
      { year: 'Year 3', pct: '25%', body: ['for the 3rd year—with 75 free Clain outcomes',  'and 15 free Clain qualifications per month.', 'Phone, SMS, and WhatsApp are charged at', 'list price.'] },
    ];
    return (
      <div className="content-stretch flex flex-col items-start px-[120px] relative w-full" data-node-id="2:6751">
        <div className="content-stretch flex flex-col items-start max-w-[1540px] px-[24px] relative shrink-0 w-[1200px]">
          <div className="content-stretch flex flex-col gap-[32px] items-start relative shrink-0 w-full">
            {/* Heading */}
            <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 w-full">
              <div className="content-stretch flex flex-col items-center max-w-[618px] relative shrink-0">
                <p className="m-0 text-[45.3px] text-black text-center tracking-[-2.309px] whitespace-nowrap leading-[46.17px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Save year on year</p>
              </div>
            </div>

            {/* 3 cards */}
            <div className="grid grid-cols-12 gap-[24px] grid-rows-[287.34px] h-[287.34px] relative shrink-0 w-full">
              {cards.map((c, i) => (
                <div key={c.year} className="border-[1px] border-[rgba(23,16,14,0.4)] border-solid col-span-4 content-stretch flex flex-col items-start justify-self-stretch p-[25px] relative row-1 self-start shrink-0">
                  {/* Year + discount */}
                  <div className="relative shrink-0 w-full">
                    <div className="content-stretch flex flex-col gap-[31.99px] items-start pb-[20px] relative size-full">
                      <div className="border-[rgba(23,16,14,0.4)] border-b-[1px] border-solid content-stretch flex flex-col items-start pb-[17px] relative shrink-0 w-full">
                        <p className="m-0 text-[14.9px] text-black whitespace-nowrap leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>{c.year}</p>
                      </div>
                      <div className="content-stretch flex h-[33.41px] items-center pb-[1.41px] relative shrink-0 w-full">
                        {/* Discount % with yellow highlight */}
                        <div className="content-stretch flex items-start py-[3px] relative shrink-0" style={yellowHighlight}>
                          <p className="m-0 text-[30.4px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{c.pct}</p>
                        </div>
                        <p className="m-0 text-[33.4px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>{` discount`}</p>
                      </div>
                    </div>
                  </div>
                  {/* Body copy */}
                  <div className="relative shrink-0 w-full">
                    <div className="content-stretch flex flex-col items-start pb-[20px] relative size-full">
                      <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                        <p className="m-0 text-[14.5px] w-full leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: 'rgba(23,16,14,0.8)' }}>
                          {c.body.map((line, j) => <span key={j} style={{ display: 'block' }}>{line}</span>)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* View pricing link */}
                  <a onClick={() => ClainV2.navigate('/pricing')} className="cursor-pointer relative shrink-0">
                    <div className="content-stretch flex flex-col items-start pr-[10px] relative size-full">
                      <div className="content-stretch flex items-start relative shrink-0" style={{ borderBottom: '1px solid #17100e' }}>
                        <p className="m-0 text-[14.9px] text-black text-left whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, lineHeight: 'normal' }}>View pricing</p>
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }


  // FEATURES — "The highest-performing AI Agent natively integrated with the Clain Helpdesk" (Figma node 2:6889)
  // 2-column layout: product image (left) + 2 trigger items "Clain AI Agent" + "Helpdesk" (right)
  const featHighestImgBg = "/v2/assets/27f5f036-35db-4499-9aea-d7d975c718aa.png";
  const featHighestImgFg = "/v2/assets/4036c35b-2ef6-4359-a22f-56d71bd1ca30.png";

  function FeaturesHighestPerformingSection() {
    return (
      <div className="content-stretch flex flex-col gap-[48px] items-center relative w-full" data-node-id="2:6889">
        {/* Heading */}
        <div className="grid grid-cols-1 grid-rows-[138.52px] h-[138.52px] max-w-[1540px] relative shrink-0 w-[960px]">
          <div className="content-stretch flex flex-col items-center justify-center justify-self-stretch relative row-1 self-start shrink-0">
            <div className="content-stretch flex flex-col items-center max-w-[698.64px] px-[81.33px] relative shrink-0">
              <p className="m-0 text-[46px] text-black text-center tracking-[-2.309px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, lineHeight: '46.17px' }}>
                <span style={{ display: 'block' }}>The highest-performing AI</span>
                <span style={{ display: 'block' }}>Agent natively integrated</span>
                <span style={{ display: 'block' }}>with the Clain Helpdesk</span>
              </p>
            </div>
          </div>
        </div>

        {/* Product card layout */}
        <div className="content-stretch flex flex-col items-start max-w-[1540px] px-[24px] relative shrink-0 w-[1200px]">
          <div className="grid grid-cols-[1.26fr_1fr] gap-x-[120px] gap-y-[120px] grid-rows-1 h-[719.19px] relative rounded-[8px] shrink-0 w-full">
            {/* Right column — 2 trigger items */}
            <div className="col-2 grid grid-cols-1 grid-rows-[719.19px] h-[719.19px] justify-self-stretch relative row-1 shrink-0">
              <div className="grid grid-cols-1 gap-[16px] grid-rows-[128.25px_149.52px] h-[293.77px] justify-self-stretch relative row-1 self-start shrink-0">
                {/* Active: Clain AI Agent */}
                <div className="content-stretch flex flex-col gap-[3.99px] items-start justify-self-stretch pt-[20px] relative row-1 self-start shrink-0">
                  <div className="absolute bg-[rgba(23,16,14,0.2)] h-[2px] left-0 right-0 top-0" />
                  <div className="absolute bg-[#17100e] h-[2px] left-0 right-0 top-0" />
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <p className="m-0 text-[15.1px] text-[#17100e] tracking-[-0.16px] w-full leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>Clain AI Agent</p>
                  </div>
                  <div className="h-[85.06px] relative shrink-0 w-full">
                    <div className="-translate-y-1/2 absolute flex flex-col h-[86px] justify-center left-0 text-[14.6px] text-[#17100e] top-[42.4px] w-[453.32px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                      <p className="leading-[21.28px] mb-0">Clain resolves everything from simple queries to complex, across all</p>
                      <p className="leading-[21.28px] mb-0">{`your channels. You're in complete control: see exactly what's`}</p>
                      <p className="leading-[21.28px] mb-0">working, make improvements yourself in minutes, and watch</p>
                      <p className="leading-[21.28px]">performance continuously improve.</p>
                    </div>
                  </div>
                </div>

                {/* Inactive: Helpdesk */}
                <div className="content-stretch flex flex-col gap-[3.99px] items-start justify-self-stretch pt-[20px] relative row-2 self-start shrink-0">
                  <div className="absolute bg-[rgba(23,16,14,0.2)] h-[2px] left-0 right-0 top-0" />
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <p className="m-0 text-[14.8px] tracking-[-0.16px] w-full leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: 'rgba(23,16,14,0.6)' }}>Helpdesk</p>
                  </div>
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                    <p className="m-0 text-[14.6px] w-full leading-[21.28px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: 'rgba(23,16,14,0.6)' }}>
                      <span style={{ display: 'block' }}>Clain seamlessly hands off to your team with full context—no</span>
                      <span style={{ display: 'block' }}>switching tools, no lost information. Get a powerful helpdesk</span>
                      <span style={{ display: 'block' }}>designed to work as one with Clain, with complete visibility across</span>
                      <span style={{ display: 'block' }}>all AI and human conversations to optimize your customer</span>
                      <span style={{ display: 'block' }}>experience.</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Left column — product image */}
            <div className="col-1 content-stretch flex flex-col items-start justify-center justify-self-stretch relative row-1 self-start shrink-0">
              <div className="content-stretch flex h-[719.19px] items-center justify-center overflow-clip relative shrink-0 w-full">
                <div className="absolute content-stretch flex flex-col h-[719.19px] items-start justify-center left-0 overflow-clip top-0 w-[575.36px]">
                  <div className="flex-1 min-h-[719.19px] min-w-[575.36px] relative w-full">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <img alt="" className="absolute left-0 max-w-none size-full top-0" src={featHighestImgBg} />
                    </div>
                  </div>
                </div>
                <div className="content-stretch flex flex-1 flex-col h-full items-start min-w-px overflow-clip relative">
                  <div className="aspect-[575.36/719.19] relative shrink-0 w-full">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <img alt="" className="absolute left-0 max-w-none size-full top-0" src={featHighestImgFg} />
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


  // FEATURES — ELIGIBILITY REQUIREMENTS section (Figma node 2:6837)
  // 3 cards: "Early stage" / "Small team" / "New customer"

  function FeaturesEligibilitySection() {
    const yellowHl = {
      backgroundImage: "linear-gradient(0deg, rgba(246,244,49,0) 9%, rgb(246,244,49) 9%, rgb(246,244,49) 85%, rgba(246,244,49,0) 85%)",
    };
    return (
      <div className="content-stretch flex flex-col items-start px-[120px] relative w-full" data-node-id="2:6837">
        <div className="content-stretch flex flex-col items-start max-w-[1540px] px-[24px] relative shrink-0 w-[1200px]">
          <div className="content-stretch flex flex-col gap-[32px] items-start relative shrink-0 w-full">
            {/* Heading */}
            <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 w-full">
              <div className="content-stretch flex flex-col items-center max-w-[618px] min-w-[448.64px] relative shrink-0">
                <p className="m-0 text-[46.2px] text-black text-center tracking-[-2.309px] whitespace-nowrap leading-[46.17px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Eligibility requirements</p>
              </div>
            </div>

            {/* 3 cards */}
            <div className="grid grid-cols-12 gap-[24px] grid-rows-[205px] h-[205px] relative shrink-0 w-full">
              {/* Card 1: Early stage */}
              <div className="border-[1px] border-[rgba(23,16,14,0.4)] border-solid col-span-4 content-stretch flex flex-col items-start justify-self-stretch pb-[58.41px] pt-[25px] px-[25px] relative row-1 self-start shrink-0">
                <div className="relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col gap-[32px] items-start pb-[19.99px] relative size-full">
                    <div className="border-[rgba(23,16,14,0.4)] border-b-[1px] border-solid content-stretch flex flex-col items-start pb-[17px] relative shrink-0 w-full">
                      <p className="m-0 text-[14.9px] text-black whitespace-nowrap leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>Early stage</p>
                    </div>
                    <div className="content-stretch flex h-[33.41px] items-center pb-[1.41px] relative shrink-0 w-full">
                      <p className="m-0 text-[33.4px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>{`Up to `}</p>
                      <div className="content-stretch flex items-start py-[3px] relative shrink-0" style={yellowHl}>
                        <p className="m-0 text-[28.6px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>$10M</p>
                      </div>
                      <p className="m-0 text-[33.4px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>{` in funding.`}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Small team */}
              <div className="border-[1px] border-[rgba(23,16,14,0.4)] border-solid col-span-4 content-stretch flex flex-col items-start justify-self-stretch p-[25px] relative row-1 self-start shrink-0">
                <div className="relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col gap-[31px] items-start pb-[17.4px] relative size-full">
                    <div className="border-[rgba(23,16,14,0.4)] border-b-[1px] border-solid content-stretch flex flex-col items-start pb-[17px] relative shrink-0 w-full">
                      <p className="m-0 text-[15.1px] text-black whitespace-nowrap leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>Small team</p>
                    </div>
                    <div className="content-stretch flex flex-col items-start pb-[3.59px] relative shrink-0 w-full">
                      <p className="m-0 text-[32.7px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Fewer than</p>
                      <div className="content-stretch flex items-start py-[3px] relative shrink-0" style={yellowHl}>
                        <p className="m-0 text-[30.9px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>15 employees.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: New customer */}
              <div className="border-[1px] border-[rgba(23,16,14,0.4)] border-solid col-span-4 content-stretch flex flex-col items-start justify-self-stretch p-[25px] relative row-1 self-start shrink-0">
                <div className="relative shrink-0 w-full">
                  <div className="content-stretch flex flex-col gap-[32px] items-start pb-[20px] relative size-full">
                    <div className="border-[rgba(23,16,14,0.4)] border-b-[1px] border-solid content-stretch flex flex-col items-start pb-[17px] relative shrink-0 w-full">
                      <p className="m-0 text-[14.9px] text-black whitespace-nowrap leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>New customer</p>
                    </div>
                    <div className="h-[66.81px] relative shrink-0 w-full">
                      <p className="m-0 text-[33.4px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Not currently an</p>
                      <div className="content-stretch flex items-start py-[3px] relative shrink-0 mt-[3px]" style={yellowHl}>
                        <p className="m-0 text-[33.4px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Clain</p>
                        <p className="m-0 text-[33.4px] text-black tracking-[-1.336px] whitespace-nowrap leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, marginLeft: '8px' }}>{`customer.`}</p>
                      </div>
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


  // FEATURES — "It's official: Clain is the best AI agent on the market" (Figma node 2:7111)
  // 2-column white card with G2 chart on the right
  const featG2ImgFin     = "/v2/assets/a1563166-92de-4349-b6aa-0bf956095ff1.png";
  const featG2ImgZendesk = "/v2/assets/16443745-b04b-438c-b183-f38db1553e1e.png";
  const featG2ImgAda     = "/v2/assets/be0330f4-eeaa-4406-82c4-6e6b14599b00.png";

  function FeaturesG2ChartSection() {
    const bars = [
      { name: ['Clain by', 'Clain'], value: '89',  img: featG2ImgFin,     active: true  },
      { name: ['Zendesk AI', 'Agent'], value: '59', img: featG2ImgZendesk, active: false },
      { name: ['Decagon'], value: '54', img: featG2ImgZendesk, active: false },
      { name: ['Forethought'], value: '40', img: featG2ImgZendesk, active: false },
      { name: ['Ada'], value: '33', img: featG2ImgAda, active: false },
    ];
    return (
      <div className="bg-[#f4f3ec] content-stretch flex items-center justify-center px-[40px] relative w-full" data-node-id="2:7111">
        <div className="bg-white border-[1px] border-[rgba(23,16,14,0.4)] border-solid content-stretch flex gap-[32px] items-start justify-center max-w-[1200px] p-[33px] relative rounded-[8px] shrink-0 w-[1200px]">

          {/* Left content */}
          <div className="flex-1 min-w-px relative self-stretch">
            <div className="content-stretch flex flex-col gap-[24px] items-start relative size-full">
              <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                <p className="m-0 text-[48px] text-black tracking-[-2.4px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, lineHeight: '48px' }}>
                  <span style={{ display: 'block' }}>It&rsquo;s official: Clain is the best</span>
                  <span style={{ display: 'block' }}>AI agent on the market</span>
                </p>
              </div>
              <div className="content-stretch flex flex-col items-start max-w-[505.44px] relative shrink-0 w-[505.44px]">
                <p className="m-0 text-[18.1px] text-black tracking-[-1px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '24px' }}>
                  <span style={{ display: 'block' }}>In G2&rsquo;s most recent User Satisfaction Ratings for Customer</span>
                  <span style={{ display: 'block' }}>Service, Clain rates highest across the board. Based on over</span>
                  <span style={{ display: 'block' }}>19,000 reviews from real customers.</span>
                </p>
              </div>
              <div className="content-stretch flex gap-[12px] items-start relative shrink-0 w-full">
                <a onClick={() => ClainV2.navigate('#')} className="content-stretch cursor-pointer flex flex-col items-start relative self-stretch shrink-0">
                  <div className="bg-[#17100e] content-stretch flex flex-col items-center px-[17px] py-[10px] relative rounded-[6px] shrink-0 w-full" style={{ border: '1px solid rgba(0,0,0,0)' }}>
                    <p className="m-0 text-[12.9px] text-white text-center tracking-[-0.35px] whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>Read the G2 Report</p>
                  </div>
                </a>
                <a onClick={() => ClainV2.navigate('#')} className="content-stretch cursor-pointer flex flex-col items-start relative self-stretch shrink-0">
                  <div className="content-stretch flex flex-col items-center px-[17px] py-[10px] relative rounded-[6px] shrink-0 w-full" style={{ border: '1px solid #17100e' }}>
                    <p className="m-0 text-[13.3px] text-[#17100e] text-center tracking-[-0.35px] whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>Read G2 Clain Reviews</p>
                  </div>
                </a>
              </div>
            </div>
          </div>

          {/* Right G2 chart */}
          <div className="flex-1 min-w-px relative self-stretch">
            <div className="content-stretch flex flex-col gap-[24px] items-start relative size-full">
              <div className="border-[#17100e] border-b-[2px] border-solid content-stretch flex flex-col items-start pb-[10px] relative shrink-0 w-full">
                <p className="m-0 text-[15px] text-black tracking-[-0.4px] whitespace-nowrap leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>{`G2's AI Agent score`}</p>
              </div>
              <div className="grid grid-cols-1 grid-rows-[56px_56px_56px_56px_56px] h-[280px] relative shrink-0 w-full">
                {bars.map((bar, i) => (
                  <div key={i} className="col-1 content-stretch flex gap-[8px] h-[56px] items-start justify-self-stretch relative shrink-0">
                    <div className="content-stretch flex h-full items-center relative shrink-0">
                      <div className="content-stretch flex h-full items-center relative shrink-0 w-[99.75px]">
                        <div className="flex flex-col text-[18.4px] text-[#17100e] tracking-[-0.8px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                          {bar.name.map((line, j) => (
                            <p key={j} className="m-0 leading-[20px]">{line}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="content-stretch flex flex-1 h-[56px] items-start min-w-px relative">
                      {bar.active ? (
                        <>
                          <div className="absolute content-stretch flex flex-col inset-0 items-start justify-center overflow-clip">
                            <div className="flex-1 min-h-[56px] relative w-full">
                              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <img alt="" className="absolute h-[122.42%] left-0 max-w-none top-[-11.21%] w-full" src={bar.img} />
                              </div>
                            </div>
                          </div>
                          <div className="absolute content-stretch flex flex-col h-[32px] items-center right-[24px] top-[12px] w-[48px]">
                            <p className="m-0 text-[29.6px] text-white text-center tracking-[-1.92px] whitespace-nowrap leading-[32px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>{bar.value}</p>
                          </div>
                        </>
                      ) : (
                        <div className="content-stretch flex flex-1 h-[56px] items-start justify-between min-w-px relative">
                          <div className="flex-1 h-full min-w-px relative">
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                              <img alt="" className="absolute left-0 max-w-none size-full top-0" src={bar.img} />
                            </div>
                          </div>
                          <div className="content-stretch flex h-full items-center pr-[24px] relative shrink-0">
                            <div className="content-stretch flex flex-col items-center relative shrink-0 w-[48px]">
                              <p className="m-0 text-[29.6px] text-[#17100e] text-center tracking-[-1.92px] whitespace-nowrap leading-[32px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>{bar.value}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // FEATURES — FAQS section (Figma node 2:7203)
  // Dark bg #17100e, heading "FAQs", left column = 5 question triggers, right column = expanded panel (cyan #ccfaf4)

  const FEATURES_FAQS = [
    { q: 'What does the Clain Early Stage Program cover?', active: true },
    { q: 'How much does Clain AI Agent cost?', active: false },
    { q: 'What happens after the first year?', active: false },
    { q: `What if we're larger than 15 employees?`, active: false },
    { q: 'How can I become a partner and offer this discount to my portfolio companies?', active: false },
  ];

  function FeaturesFaqsSection() {
    return (
      <div className="bg-[#17100e] relative w-full" data-node-id="2:7203" style={{ minHeight: 904 }}>
        {/* Heading */}
        <div className="absolute content-stretch flex flex-col items-start left-[136.8px] pb-[40px] right-[48px] top-[120px]">
          <p className="m-0 text-[45.1px] text-white tracking-[-1.76px] whitespace-nowrap leading-[46.17px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>FAQs</p>
        </div>

        {/* 2-column grid */}
        <div className="-translate-y-1/2 absolute bg-[#17100e] grid grid-cols-2 gap-[24px] grid-rows-[577.91px] h-[577.91px] left-0 right-0 top-[calc(50%+43.09px)]">

          {/* Left — 5 trigger questions */}
          <div className="col-1 content-stretch flex flex-col items-start justify-self-stretch pb-[211.91px] relative row-1 self-start shrink-0">
            {FEATURES_FAQS.map((faq, i) => (
              <div key={i} className="content-stretch flex flex-col items-start pl-[24px] relative shrink-0 w-full">
                <div className={"content-stretch flex items-start justify-center pl-[112.8px] py-[25px] relative shrink-0 w-[684px] " + (i === 0 ? "border-[rgba(255,255,255,0.2)] border-b-[1px] border-solid border-t-[1px]" : "border-[rgba(255,255,255,0.2)] border-b-[1px] border-solid")} style={i > 0 ? { paddingTop: 24, paddingBottom: 25 } : {}}>
                  <div className="flex-1 min-w-px relative self-stretch">
                    <div className="content-stretch flex flex-col items-start size-full">
                      <p className="m-0 text-[18.6px] tracking-[-0.88px] w-full leading-[20px] cursor-pointer" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, color: faq.active ? 'white' : 'rgba(255,255,255,0.6)' }}>{faq.q}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right — expanded panel (cyan card with content for the active question) */}
          <div className="col-2 content-stretch flex flex-col items-start justify-center justify-self-stretch relative row-1 self-start shrink-0">
            <div className="bg-[#ccfaf4] content-stretch flex flex-col items-start justify-center min-h-[480px] relative shrink-0 w-full">
              <div className="content-stretch flex flex-col gap-[23.3px] items-start max-h-[900px] max-w-[936px] overflow-auto p-[32px] shrink-0 sticky top-0 w-full">

                {/* H2 question */}
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                  <p className="m-0 text-[16.9px] text-black w-full leading-[normal]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>What does the Clain Early Stage Program cover?</p>
                </div>

                {/* Intro paragraph */}
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                  <p className="m-0 text-[14.6px] text-[#17100e] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '21.6px' }}>
                    <span style={{ display: 'block' }}>Get access to the best AI-first helpdesk from just $65/month, with 93% off in your first year,</span>
                    <span style={{ display: 'block' }}>50% off in your second year, and 25% off in your third year.</span>
                  </p>
                </div>

                {/* "Your Early Stage plan includes:" intro */}
                <div className="content-stretch flex flex-col items-start pt-[0.69px] relative shrink-0 w-full">
                  <p className="m-0 text-[14.6px] text-[#17100e] w-full leading-[21.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Your Early Stage plan includes the following:</p>
                </div>

                {/* List 1 — bullet items */}
                <div className="content-stretch flex flex-col items-start pt-[0.71px] relative shrink-0 w-full">
                  <div className="content-stretch flex items-center pl-[15px] relative shrink-0 w-full">
                    <span className="-translate-y-1/2 absolute h-[19px] left-0 top-[11px] w-[7.33px] text-[16px] text-[#17100e]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '21.6px' }}>-</span>
                    <p className="m-0 text-[15.1px] text-[#17100e] whitespace-nowrap leading-[21.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{`6 Advanced Seats `}</p>
                    <a onClick={() => ClainV2.navigate('#')} className="content-stretch cursor-pointer flex items-start relative shrink-0">
                      <p className="m-0 text-[14.3px] text-[#17100e] text-left w-[112.97px] leading-[21.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, borderBottom: '1px solid #17100e' }}>(see all features)</p>
                    </a>
                  </div>
                  {['6 Copilot Seats', '20 Lite Seats', 'Proactive Support Plus (500 messages sent per month)'].map((item, i) => (
                    <div key={i} className="content-stretch flex items-center pl-[15px] relative shrink-0 w-full">
                      <span className="-translate-y-1/2 absolute h-[19px] left-0 top-[11px] w-[7.33px] text-[16px] text-[#17100e]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '21.6px' }}>-</span>
                      <p className="m-0 text-[15px] text-[#17100e] whitespace-nowrap leading-[21.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{item}</p>
                    </div>
                  ))}
                </div>

                {/* "Plus a free year of Clain AI Agent:" */}
                <div className="content-stretch flex flex-col items-start pt-[0.69px] relative shrink-0 w-full">
                  <p className="m-0 text-[14.6px] text-[#17100e] w-full leading-[21.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>Plus a free year of Clain AI Agent, including:</p>
                </div>

                {/* List 2 */}
                <div className="content-stretch flex flex-col items-start pt-[0.71px] relative shrink-0 w-full">
                  {['300 Clain outcomes per month', '15 Clain qualifications per month', 'Pro (unlimited conversations analyzed per month)'].map((item, i) => (
                    <div key={i} className="content-stretch flex items-center pl-[15px] relative shrink-0 w-full">
                      <span className="-translate-y-1/2 absolute h-[19px] left-0 top-[11px] w-[7.33px] text-[16px] text-[#17100e]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '21.6px' }}>-</span>
                      <p className="m-0 text-[14.7px] text-[#17100e] whitespace-nowrap leading-[21.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>{item}</p>
                    </div>
                  ))}
                </div>

                {/* Footer paragraph */}
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                  <p className="m-0 text-[14.6px] text-[#17100e] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '21.6px' }}>
                    <span style={{ display: 'block' }}>Your 93% discount applies to usage based costs for email, messages sent (over 500 per</span>
                    <span style={{ display: 'block' }}>month) and additional seats (over 6).</span>
                  </p>
                </div>

                {/* Final note + link */}
                <div className="relative shrink-0 w-full">
                  <p className="m-0 text-[14.8px] text-[#17100e]" style={{ fontFamily: "'Inter', sans-serif", lineHeight: '21.6px' }}>
                    <span style={{ fontWeight: 600 }}>The discount does not apply to additional outcomes or qualifications,</span>
                    <span style={{ fontWeight: 400 }}>{` phone, SMS & WhatsApp, which are charged at list price. `}</span>
                    <a onClick={() => ClainV2.navigate('#')} className="cursor-pointer" style={{ borderBottom: '1px solid #17100e', color: '#17100e' }}>See usage based costs</a>
                    <span style={{ fontWeight: 400 }}>.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // FEATURES — OTHER HELPFUL RESOURCES section (Figma node 2:7302)
  // Heading + 4-card grid: Exclusive deals / Early Stage Academy / Inside the Clain Blog / Clain Community
  const featResImgVector  = "/v2/assets/c9613fc7-b542-4bad-8c0d-adb634d4fc5f.svg";
  const featResImgVector1 = "/v2/assets/29672266-a5a3-4240-9df2-c163060facf6.svg";

  function FeatResDottedLine() {
    return (
      <div className="opacity-100 overflow-clip relative size-[12px]">
        <div className="absolute inset-0 opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={featResImgVector} />
        </div>
        <div className="absolute inset-[37.5%] opacity-100">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={featResImgVector1} />
        </div>
      </div>
    );
  }

  const FEATURES_RESOURCE_CARDS = [
    { num: '01', title: 'Exclusive deals on startup tools', body: ['Program members get credits and discounts', 'worth $100K on Stripe, Notion and more.'] },
    { num: '02', title: 'Early Stage Academy',              body: ['Deep-dive courses from Clain experts on', 'topics like support, engagement, and sales.'] },
    { num: '03', title: 'Inside the Clain Blog',            body: ['Our blog and podcast give you in-depth', 'interviews, best practices, insights and more.'] },
    { num: '04', title: 'Clain Community',                  body: ['Join our community forum to ask questions or', 'connect with Clain customers and', 'partners.'] },
  ];

  function FeaturesResourcesSection() {
    return (
      <div className="content-stretch flex flex-col gap-[48px] items-center justify-center px-[12px] relative w-full" data-node-id="2:7302">
        {/* Heading */}
        <div className="content-stretch flex flex-col items-start px-[118px] relative shrink-0 w-[1416px]">
          <div className="grid grid-cols-1 grid-rows-[46.17px] h-[46.17px] max-w-[1540px] relative shrink-0 w-[1180px]">
            <div className="content-stretch flex flex-col items-center justify-center justify-self-stretch relative row-1 self-start shrink-0">
              <div className="content-stretch flex flex-col items-center max-w-[698.64px] relative shrink-0">
                <p className="m-0 text-[46.2px] text-black text-center tracking-[-2.309px] whitespace-nowrap leading-[46.17px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Other helpful resources</p>
              </div>
            </div>
          </div>
        </div>

        {/* 4-card grid */}
        <div className="grid grid-cols-4 gap-[24px] grid-rows-[329.55px] h-[361.55px] max-w-[1512px] p-[16px] relative shrink-0 w-full">
          {FEATURES_RESOURCE_CARDS.map((card) => (
            <div key={card.num} className="bg-[#f4f3ec] border-[1px] border-[rgba(23,16,14,0.4)] border-solid content-stretch flex flex-col items-start justify-between justify-self-stretch max-h-[500px] overflow-clip p-[21px] relative row-1 self-start shrink-0">
              {/* Header — number + dotted line */}
              <div className="relative shrink-0 w-full">
                <div className="content-stretch flex flex-col gap-[23.67px] items-start pb-[24px] relative size-full">
                  <p className="m-0 text-black tracking-[-2.309px] whitespace-nowrap leading-[46.17px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 40 }}>{card.num}</p>
                  <div className="content-stretch flex flex-col h-[14px] items-start overflow-clip relative shrink-0 w-full" style={{ opacity: 0.2 }}>
                    <FeatResDottedLine />
                  </div>
                </div>
              </div>

              {/* Title + body + Learn more link */}
              <div className="relative shrink-0 w-full" style={{ minHeight: 98.58 }}>
                <p className="m-0 text-[17px] text-black tracking-[-0.183px] whitespace-nowrap leading-[21.98px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>{card.title}</p>
                <div className="pt-[8px]">
                  <p className="m-0 text-[12.7px] text-black whitespace-nowrap leading-[16.8px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                    {card.body.map((line, i) => <span key={i} style={{ display: 'block' }}>{line}</span>)}
                  </p>
                </div>
                <div className="pt-[8px]">
                  <a onClick={() => ClainV2.navigate('#')} className="content-stretch cursor-pointer flex flex-col items-start pr-[10px] relative shrink-0">
                    <div className="content-stretch flex items-start relative shrink-0" style={{ borderBottom: '1px solid #17100e' }}>
                      <p className="m-0 text-[14.9px] text-black text-left whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, lineHeight: 'normal' }}>Learn more</p>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }


  // FEATURES — BANNER CTA section (Figma node 2:7395)
  // Full-bleed dark image bg + heading "Get started with our Early Stage Program today" + Apply now button
  const featBannerImgBg = "/v2/assets/51dd9f25-cad9-43a0-a1da-0dac77d2c7f9.png";

  function FeaturesBannerCtaSection() {
    return (
      <div className="bg-[#f4f3ec] content-stretch flex flex-col items-start p-[16px] relative w-full" data-node-id="2:7395">
        <div className="h-[844.8px] max-w-[1920px] overflow-clip relative shrink-0 w-full">
          {/* BG image */}
          <div className="absolute aspect-[1408/844.8] content-stretch flex flex-col items-start justify-center left-0 overflow-clip right-0 top-0">
            <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative shrink-0 w-full">
              <div className="h-[844.8px] min-w-[1408px] relative shrink-0 w-full">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img alt="" className="absolute h-full left-[-0.07%] max-w-none top-0 w-[100.13%]" src={featBannerImgBg} />
                </div>
              </div>
            </div>
          </div>

          {/* Content centered */}
          <div className="absolute grid grid-cols-1 grid-rows-[716.8px] h-[844.8px] left-0 px-[24px] py-[64px] right-0 top-0">
            <div className="col-1 content-stretch flex flex-col gap-[24px] items-center justify-self-center relative row-1 self-center shrink-0">
              <div className="content-stretch flex flex-col items-center max-w-[677.28px] px-[37.59px] relative shrink-0">
                <p className="m-0 text-[53.9px] text-white text-center tracking-[-2.886px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, lineHeight: '57.72px' }}>
                  <span style={{ display: 'block' }}>Get started with our Early</span>
                  <span style={{ display: 'block' }}>Stage Program today</span>
                </p>
              </div>
              <div className="content-stretch flex items-start relative shrink-0">
                <a onClick={() => ClainV2.navigate('/signup')} className="content-stretch cursor-pointer flex flex-col items-start relative self-stretch shrink-0">
                  <div className="bg-white content-stretch flex flex-col items-center px-[17px] py-[10px] relative rounded-[6px] shrink-0 w-full" style={{ border: '1px solid rgba(0,0,0,0)' }}>
                    <p className="m-0 text-[12.9px] text-[#17100e] text-center tracking-[-0.35px] whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>Apply now</p>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  function StartupsPage() {
    return (
      <PageShell>
        <div className="bg-[#f4f3ec]">
          <FeaturesHero />
          <FeaturesCustomerLogosSection />
          <FeaturesSaveYearSection />
          <FeaturesHighestPerformingSection />
          <FeaturesEligibilitySection />
          <FeaturesG2ChartSection />
          <FeaturesFaqsSection />
          <FeaturesResourcesSection />
          <FeaturesBannerCtaSection />
        </div>
      </PageShell>
    );
  }

  window.StartupsPage = StartupsPage;
})();
