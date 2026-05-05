/* global React, ClainV2 */
/* Copilot landing page — extracted from Figma node 32:14697 */
(function () {
  const { PageShell } = ClainV2;

  // COPILOT — HERO section (Figma node 32:14706)
  // Includes: H1, intro paragraph + View demo button, product demo image,
  // 4-column highlight list, full-bleed background image with cream overlay
  const heroImgImage      = "/v2/assets/f8694e32-7147-429d-ab9f-e6786bad30d8.png";
  const heroImgBackground = "/v2/assets/e9328b73-bf44-4a22-9cd6-f17a4f3b61a8.jpg";

  function CopilotHero() {
    return (
      <div className="bg-[#f4f3ec] content-stretch flex flex-col items-start relative size-full" data-node-id="32:14706" data-name="div.hero_landing__Wrapper">
        <div className="content-stretch flex flex-col isolate items-start max-w-[1920px] relative shrink-0 w-full">
          {/* Hero intro */}
          <div className="content-stretch flex flex-col items-start pb-[64px] relative shrink-0 w-full z-[3]">
            <div className="content-stretch flex items-start justify-center pt-[130px] relative shrink-0 w-full">
              <div className="content-stretch flex flex-col gap-[32px] items-start max-w-[1540px] px-[24px] relative self-stretch shrink-0 w-[1200px]">
                {/* H1 — two staggered lines */}
                <div className="font-['Inter:Bold',sans-serif] font-bold h-[147.25px] leading-[0] not-italic relative shrink-0 text-white tracking-[-4.09px] w-[1152px]" data-node-id="32:14711" data-name="h1.display">
                  <div className="-translate-y-1/2 absolute flex flex-col h-[74px] justify-center left-0 text-[76.2px] top-[36px] w-[846.92px]">
                    <p className="leading-[73.62px]">Increase agent efficiency</p>
                  </div>
                  <div className="-translate-y-1/2 absolute flex flex-col h-[74px] justify-center left-[96px] text-[77.5px] top-[109.63px] w-[670.39px]">
                    <p className="leading-[73.62px]">by 31% with Copilot</p>
                  </div>
                </div>
                {/* Intro copy + CTA */}
                <div className="border-white border-solid border-t-[1px] content-stretch flex flex-col gap-[24px] items-start max-w-[520px] pt-[17px] relative shrink-0 w-[518.39px]">
                  <div className="relative shrink-0 w-full">
                    <p className="m-0 text-[16.3px] text-white leading-[22.5px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                      Clain&rsquo;s Copilot gives every support agent a personal AI assistant. Copilot provides instant answers, so your team can stop wasting time and focus on what really matters: forging deeper relationships with customers.
                    </p>
                  </div>
                  <div className="relative shrink-0 w-full">
                    <a onClick={() => ClainV2.navigate('/demo')} className="cursor-pointer inline-flex flex-col items-center px-[17px] py-[10px] rounded-[6px]" style={{ border: '1px solid white' }}>
                      <span className="text-white text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 12.8, lineHeight: '14px', letterSpacing: '-0.35px' }}>View demo</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Product demo image + 4-column highlights */}
          <div className="content-stretch flex flex-col items-center relative shrink-0 w-full z-[2]">
            <div className="content-stretch flex flex-col gap-[24px] items-start max-w-[1540px] pb-[80px] px-[24px] relative shrink-0 w-[1200px]">
              <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative shrink-0 w-full">
                <div className="content-stretch flex flex-col h-[774px] items-start justify-center relative shrink-0 w-[1152px]">
                  <div className="h-[766px] relative shrink-0 w-[1140px]">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none size-full top-0" src={heroImgImage} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-[16px] grid-rows-[84px] h-[84px] relative shrink-0 w-full">
                {[
                  ['Expert training,', 'troubleshooting, and', 'guidance'],
                  ['The best answers from', 'conversation history'],
                  ['Trusted information', 'from any content source'],
                  ['Deep insights, complete', 'oversight'],
                ].map((lines, i) => (
                  <div key={i} className="content-stretch flex h-[84px] items-start justify-center justify-self-stretch max-w-[240px] pb-[12px] relative row-1 shrink-0">
                    <div className="content-stretch flex flex-1 flex-col h-full items-start min-w-px relative">
                      {lines.map((l, j) => (
                        <p key={j} className="m-0 text-[22px] text-white tracking-[-1.2px] leading-[24px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>{l}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Background image full-bleed */}
          <div className="absolute content-stretch flex flex-col inset-0 items-start justify-center z-[1]">
            <div className="flex-1 min-h-[1500.25px] min-w-[1440px] relative w-full">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <img loading="lazy" decoding="async" alt="" className="absolute h-[158.39%] left-0 max-w-none top-[-20.44%] w-full" src={heroImgBackground} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // COPILOT — BELIEVE section (Figma node 32:14743)
  // Includes: date stamp, H2 "Give your agents time for what really matters",
  // 5 paragraphs with yellow highlights, "Learn in 73s" video card, and
  // 4 product demo blocks each with image + h4 + 2-col h5/p descriptions,
  // then final Copilot Believe illustration.
  const believeImgVector                = "/v2/assets/499be8c1-f87c-41b8-942d-80bb90247560.svg";
  const believeImgExplainerVideoThumb   = "/v2/assets/a8a88c5a-1e31-47b9-bb1a-a8cad8e58378.jpg";
  const believeImgDemo1                 = "/v2/assets/9c2d0ec2-0f89-43d6-980a-6b46173d8291.jpg";  // demo block 1 missing alt
  const believeImgDemo1Inner            = "/v2/assets/fe4f46e4-95cc-4797-9f8e-368d9e628287.png";
  const believeImgDemo2                 = "/v2/assets/8e631be3-37fd-4572-8165-b7431229013d.jpg";
  const believeImgDemo2Inner            = "/v2/assets/12e1b805-7a4e-4c72-b391-44c6885d77ac.png";
  const believeImgDemo3                 = "/v2/assets/bb9baa02-b3ee-4209-b7d0-fe27219110e0.jpg";
  const believeImgDemo3Inner            = "/v2/assets/73fe7789-616a-4ec0-b1e7-8f471f3e2915.png";
  const believeImgDemo4                 = "/v2/assets/d089599a-f83b-4363-8d76-4bf11dd9a4b2.jpg";
  const believeImgDemo4Inner            = "/v2/assets/f839be14-56dc-4dad-b510-d9af0bc9a5a3.png";
  const believeImgCopilotBelieve        = "/v2/assets/829e0e65-e668-45d0-b44f-0daecb4a8a02.png";
  const believeImgDottedBorder          = "/v2/assets/283dad57-e502-4d41-a958-210d7acc5430.svg";

  // Highlight wrapper — yellow gradient bg used for emphasized phrases
  function Hl({ children }) {
    return (
      <span style={{ background: 'linear-gradient(to right, #fefaa7 50%, rgba(254,250,167,0) 100%)', padding: '2px 0' }}>{children}</span>
    );
  }

  function ProductDemoBlock({ image, imageInner, title, descriptions }) {
    return (
      <div className="content-stretch flex flex-col gap-[40px] items-start relative shrink-0 w-full">
        {/* Image */}
        <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full">
          <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative shrink-0 w-full">
            <div className="h-[597.33px] min-w-[672px] relative shrink-0 w-full">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none size-full top-0" src={image} />
              </div>
            </div>
          </div>
          <div className="absolute content-stretch flex flex-col inset-0 items-start">
            <div className="content-stretch flex flex-1 flex-col items-start justify-center min-h-px relative w-[672px]">
              <div className="h-[597px] relative shrink-0 w-[672px]">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none size-full top-0" src={imageInner} />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute border-[2px] border-[#f4f3ec] border-solid inset-[-1px]" />
        </div>
        {/* Description */}
        <div className="content-stretch flex flex-col gap-[32px] items-start justify-center relative shrink-0 w-full">
          <div className="content-stretch flex flex-col items-start max-w-[672px] relative shrink-0">
            <p className="m-0 text-black tracking-[-0.36px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 33, lineHeight: '36px' }}>
              {title.map((line, i) => <span key={i} style={{ display: 'block' }}>{line}</span>)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-[24px] gap-y-[40px] relative shrink-0 w-[672px]">
            {descriptions.map((d, i) => (
              <div key={i} className="content-stretch flex flex-col gap-[4px] items-start justify-self-start relative self-stretch shrink-0">
                <p className="m-0 text-[18.4px] text-black tracking-[-1px] whitespace-nowrap leading-[20px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}>
                  {d.title.map((line, j) => <span key={j} style={{ display: 'block' }}>{line}</span>)}
                </p>
                <p className="m-0 text-[16.3px] text-black whitespace-nowrap leading-[24.3px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                  {d.body.map((line, j) => <span key={j} style={{ display: 'block' }}>{line}</span>)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function CopilotBelieveSection() {
    return (
      <div className="bg-[#f4f3ec] content-stretch flex flex-col items-center relative size-full" data-node-id="32:14743">
        <div className="content-stretch flex items-start justify-center max-w-[720px] pb-[48px] pt-[96px] px-[24px] relative shrink-0 w-[720px]">
          <div className="content-stretch flex flex-1 flex-col items-start min-w-px relative">

            {/* Date stamp (hidden on percy in Figma) */}
            <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
              <p className="m-0 text-[15.3px] text-black w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: 'normal' }}>Sun, 3 May 2026</p>
            </div>

            {/* Prose block */}
            <div className="content-stretch flex flex-col gap-[30.9px] items-start pt-[31.36px] relative shrink-0 w-full">
              {/* H2 */}
              <div className="content-stretch flex flex-col items-start max-w-[903px] relative shrink-0 w-full">
                <p className="m-0 text-[53.3px] text-black tracking-[-2.886px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, lineHeight: '57.72px' }}>
                  <span style={{ display: 'block' }}>Give your agents time for</span>
                  <span style={{ display: 'block' }}>what really matters</span>
                </p>
              </div>

              {/* Paragraph 1 */}
              <p className="m-0 text-[22.5px] text-black tracking-[-1.38px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '27.6px' }}>
                We&rsquo;ve been in the customer service business since 2011, and in that time we&rsquo;ve learned a lot from you, our customer service experts.
              </p>

              {/* Paragraph 2 — multiple highlights */}
              <p className="m-0 text-[22.5px] text-black tracking-[-1.38px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '27.6px' }}>
                You told us that your <Hl>agents spend too much time searching for answers</Hl> in an endless loop of different sources like help center or internal articles, past conversations, or external content libraries. You told us about the struggle your agents face when <Hl>troubleshooting complex issues</Hl>, and the overwhelming amount of information they need to sort through <Hl>when training and onboarding.</Hl>
              </p>

              {/* Paragraph 3 — "AI is changing everything." highlight */}
              <p className="m-0 text-[22.5px] text-black tracking-[-1.38px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '27.6px' }}>
                We&rsquo;re here to tell you that it doesn&rsquo;t have to be this way. <Hl>AI is changing everything.</Hl>
              </p>

              {/* Paragraph 4 — "Clain's Copilot..." highlight */}
              <p className="m-0 text-[22.5px] text-black tracking-[-1.38px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '27.6px' }}>
                <Hl>Clain&rsquo;s Copilot gives every agent their own personal AI assistant.</Hl> Copilot can find information, help solve problems, and complete all of those time-intensive tasks in seconds. And you can trust the answers it provides are accurate because it pulls from your support materials, wherever they are.
              </p>

              {/* Paragraph 5 — final highlight */}
              <p className="m-0 text-[22.5px] text-black tracking-[-1.38px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, lineHeight: '27.6px' }}>
                We&rsquo;re building a world where every agent becomes a superagent with an AI copilot by their side. An AI copilot that&rsquo;s connected to the entire platform, is constantly learning, and can proactively problem-solve alongside your human agents in real-time. <Hl>So your agents can onboard faster, work more efficiently, and spend more time focused on what really matters: building deeper, lasting customer relationships.</Hl>
              </p>
            </div>

            {/* Video card "Learn everything about Copilot in 73 seconds" */}
            <div className="h-[589.72px] relative shrink-0 w-[672px] mt-[96px]">
              <div className="absolute content-stretch flex flex-col items-start left-0 pl-[10px] right-[-0.95px] top-0">
                {/* Gradient bottom card glow */}
                <div className="absolute border-[1px] border-black border-solid bottom-[-10px] content-stretch flex flex-col items-start justify-center left-0 overflow-clip p-px rounded-[8px] top-[12px] w-[662px]">
                  <div className="flex-1 min-h-px relative w-full" style={{ background: 'linear-gradient(113.97deg, #b5c0ff 0%, #b5c0ff 15%, #d3d0ff 30%, #d3d0ff 45%, #e7b7e0 60%, #e7b7e0 75%, #f3b4bc 85%, #f3b4bc 100%)' }} />
                </div>
                {/* Card content */}
                <div className="bg-[#f4f3ec] border-[1px] border-[#17100e] border-solid content-stretch flex flex-col items-center overflow-clip p-[25px] relative rounded-[8px] shrink-0 w-full">
                  {/* Heading */}
                  <div className="relative shrink-0">
                    <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex flex-col items-start pb-[69px] px-[48px] relative size-full">
                      <div className="content-stretch flex flex-col items-center pl-[33px] pr-[33px] relative shrink-0">
                        <p className="m-0 text-[46px] text-black text-center tracking-[-2.31px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, lineHeight: '46.17px' }}>
                          <span style={{ display: 'block' }}>Learn everything about</span>
                          <span style={{ display: 'block' }}>Copilot in 73 seconds</span>
                        </p>
                      </div>
                      {/* Dotted border */}
                      <div className="absolute inset-[2.5px_2.5px_34.5px_2.5px]">
                        <div className="absolute inset-[-0.4%_0]">
                          <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={believeImgDottedBorder} />
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Video thumbnail */}
                  <div className="bg-[rgba(23,16,14,0.1)] relative shrink-0 w-full">
                    <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex items-center justify-center overflow-clip px-[235px] py-[125px] relative rounded-[inherit] size-full">
                      <div className="absolute content-stretch flex flex-col inset-0 items-start justify-center overflow-clip">
                        <div className="flex-1 min-h-[282px] min-w-[502px] relative w-full">
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <img loading="lazy" decoding="async" alt="" className="absolute h-[100.06%] left-0 max-w-none top-[-0.03%] w-full" src={believeImgExplainerVideoThumb} />
                          </div>
                        </div>
                      </div>
                      {/* Play button */}
                      <div className="bg-[#17100e] content-stretch flex items-center justify-center pb-[4.25px] pl-px pt-[8.25px] relative rounded-full shrink-0 size-[32px]">
                        <div className="h-[19.5px] relative shrink-0 w-[31px]">
                          <div className="overflow-clip relative size-[15.5px] absolute h-[15.5px] left-1/4 right-1/4 top-0">
                            <div className="absolute bottom-[12.5%] left-1/4 right-[16.67%] top-[12.5%] opacity-100">
                              <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={believeImgVector} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Product demo list — 4 blocks */}
            <div className="content-stretch flex flex-col gap-[96px] items-start pt-[112px] relative shrink-0 w-full">
              <ProductDemoBlock
                image={believeImgDemo1}
                imageInner={believeImgDemo1Inner}
                title={['Expert training, troubleshooting, and', 'guidance']}
                descriptions={[
                  {
                    title: ['Instant advice for agents'],
                    body: [
                      'Copilot can help agents figure out next',
                      'steps, troubleshoot issues, and answer',
                      'follow-up questions they would normally',
                      'need a colleague or leader to answer.',
                    ],
                  },
                  {
                    title: ['Transform training and onboarding'],
                    body: [
                      'Copilot can help onboard and train new',
                      'agents faster using internal training',
                      'materials and past agent conversations—',
                      `if an agent needs help or doesn't know`,
                      'what to do next, just ask Copilot.',
                    ],
                  },
                ]}
              />
              <ProductDemoBlock
                image={believeImgDemo2}
                imageInner={believeImgDemo2Inner}
                title={['The best answers from conversation', 'history']}
                descriptions={[
                  {
                    title: ['An untapped goldmine of data'],
                    body: [
                      'Copilot is the only AI assistant that can',
                      'generate answers using your agents’',
                      'conversation history—customizing and',
                      'personalizing every answer to suit the',
                      'current conversation.',
                    ],
                  },
                  {
                    title: ['Browse and validate sources with every', 'answer'],
                    body: [
                      'Copilot provides links to the top relevant',
                      'sources with every answer, so agents can',
                      'access, browse, and validate answers',
                      'directly in the inbox.',
                    ],
                  },
                ]}
              />
              <ProductDemoBlock
                image={believeImgDemo3}
                imageInner={believeImgDemo3Inner}
                title={['Trusted information from any content', 'source']}
                descriptions={[
                  {
                    title: ['Personalized answers generated from', 'internal and external content'],
                    body: [
                      'Copilot pulls the most relevant',
                      'information from your help center,',
                      'internal articles, public URLs, PDFs,',
                      'macros and even syncs with Notion,',
                      'Guru, or Confluence—to generate the',
                      'best possible answer based on a',
                      `customer's plan, location, personas, and`,
                      'more.',
                    ],
                  },
                  {
                    title: ['Centralize and control your content'],
                    body: [
                      'Centralize, control and optimize your',
                      'content across the Knowledge Hub, with',
                      'full control over exactly what Copilot has',
                      'access to.',
                    ],
                  },
                ]}
              />
              <ProductDemoBlock
                image={believeImgDemo4}
                imageInner={believeImgDemo4Inner}
                title={['Deep insights, complete oversight']}
                descriptions={[
                  {
                    title: ['AI-powered reporting and insights'],
                    body: [
                      'Get insights on how support agents are',
                      'using Copilot with a dedicated',
                      'dashboard.',
                    ],
                  },
                  {
                    title: ['Improve Copilot answers'],
                    body: [
                      'Easily review answers so you can',
                      'evaluate their quality and optimize your',
                      'content to improve accuracy.',
                    ],
                  },
                ]}
              />
            </div>

            {/* Final illustration */}
            <div className="content-stretch flex flex-col items-start justify-center relative shrink-0 w-full mt-[96px]">
              <div className="content-stretch flex flex-col items-start overflow-clip relative shrink-0 w-full">
                <div className="aspect-square relative shrink-0 w-full">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none size-full top-0" src={believeImgCopilotBelieve} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // COPILOT — TESTIMONIAL section (Figma node 32:14879)
  // Dark blockquote with Lightspeed logo + Angelo Livanos quote
  const testimonialImgGroup  = "/v2/assets/541ad9e8-d103-43ea-b554-eaa202a0f60e.svg";
  const testimonialImgGroup1 = "/v2/assets/e010a7b3-9be8-435c-8920-00e4cbfe0010.svg";

  function LightspeedLogo({ className }) {
    return (
      <div className={className || "h-[56px] overflow-clip relative w-[248px]"}>
        <div className="absolute inset-[2.52%_1.28%_1.79%_0.97%] opacity-100" style={{ maskImage: `url('${testimonialImgGroup}')`, WebkitMaskImage: `url('${testimonialImgGroup}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: '-0.715px -0.715px', WebkitMaskPosition: '-0.715px -0.715px', maskSize: '243.852px 55.018px', WebkitMaskSize: '243.852px 55.018px' }}>
          <div className="absolute inset-[-0.22%_0]">
            <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={testimonialImgGroup1} />
          </div>
        </div>
      </div>
    );
  }

  function CopilotTestimonialSection() {
    return (
      <div className="bg-[#17100e] content-stretch flex flex-col items-center px-[12px] relative size-full" data-node-id="32:14879">
        <div className="content-stretch flex flex-col items-start max-w-[720px] px-[24px] relative shrink-0 w-[708px]">
          <div className="content-stretch flex flex-col gap-[96px] items-start py-[96px] relative shrink-0 w-full">
            {/* Quote */}
            <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
              <p className="m-0 text-[39.7px] text-[#f4f3ec] tracking-[-2px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, lineHeight: '40px' }}>
                <span style={{ display: 'block' }}>Our Lightspeed customer service</span>
                <span style={{ display: 'block' }}>agents are dramatically more efficient</span>
                <span style={{ display: 'block' }}>when using Copilot. In testing, agents</span>
                <span style={{ display: 'block' }}>using Copilot were able to close 31%</span>
                <span style={{ display: 'block' }}>more customer conversations daily,</span>
                <span style={{ display: 'block' }}>compared to agents not using Copilot.</span>
              </p>
            </div>
            {/* Signature footer */}
            <div className="border-[rgba(255,255,255,0.2)] border-dashed border-t-[3px] content-stretch flex flex-col items-start pt-[35px] relative shrink-0 w-full">
              <LightspeedLogo />
              <div className="relative shrink-0 w-full">
                <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex flex-col items-start pt-[12px] relative size-full">
                  <p className="m-0 text-[17.6px] text-[#f4f3ec] tracking-[-0.9px] w-full leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Angelo Livanos</p>
                </div>
              </div>
              <div className="relative shrink-0 w-full">
                <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex flex-col items-start relative size-full">
                  <p className="m-0 text-[18px] text-[#f4f3ec] tracking-[-0.9px] w-full leading-[18px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300 }}>Senior Director of Global Support, Lightspeed</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // COPILOT — SMA section "Copilot is getting better, every single day" (Figma node 32:14890)
  // Side-by-side: media image (369x369 dark cell) + roadmap-style list of features
  const smaImgMultilingual = "/v2/assets/065cbdd0-0138-4a63-a78b-a9c942bddefa.png";

  function CopilotSmaSection() {
    return (
      <div className="bg-[#f4f3ec] content-stretch flex flex-col items-center pb-[96px] pt-[95.36px] relative size-full" data-node-id="32:14890">
        {/* Heading */}
        <div className="content-stretch flex flex-col items-start max-w-[720px] px-[24px] relative shrink-0 w-[720px]">
          <div className="content-stretch flex flex-col items-start pb-[48px] relative shrink-0 w-full">
            <p className="m-0 text-[54.2px] text-black tracking-[-2.886px] w-full" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, lineHeight: '57.72px' }}>
              <span style={{ display: 'block' }}>Copilot is getting better,</span>
              <span style={{ display: 'block' }}>every single day</span>
            </p>
          </div>
        </div>

        {/* Media + list */}
        <div className="content-stretch flex flex-col gap-[20px] items-start max-w-[720px] px-[24px] relative shrink-0 w-[720px]">
          {/* Image cell */}
          <div className="content-stretch flex flex-col items-start justify-center max-w-[450px] relative shrink-0 w-[369.59px]">
            <div className="bg-[#17100e] content-stretch flex flex-col items-start justify-center overflow-clip relative shrink-0 w-full">
              <div className="content-stretch flex flex-col h-[369.59px] items-start justify-center overflow-clip relative shrink-0 w-full">
                <div className="flex-1 min-h-[369.59px] min-w-[369.59px] relative w-full">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <img loading="lazy" decoding="async" alt="" className="absolute h-full left-[-0.53%] max-w-none top-0 w-[101.05%]" src={smaImgMultilingual} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Roadmap list — first item active (black), rest at 50% opacity */}
          <div className="content-stretch flex flex-col items-start pb-[16px] relative shrink-0 w-full">
            <div className="border-[rgba(0,0,0,0.25)] border-solid border-t-[1px] content-stretch flex flex-col items-start pt-px relative shrink-0 w-full">
              {[
                { text: 'Multilingual capability',           active: true },
                { text: 'Sync content from external platforms', active: false },
                { text: 'Import external URLs and files',    active: false },
                { text: 'AI compose',                        active: false },
                { text: 'AI generated summaries',            active: false },
                { text: 'AI ticket autofill',                active: false },
              ].map((item, i) => (
                <div key={i} className="border-[rgba(0,0,0,0.25)] border-b-[1px] border-solid relative shrink-0 w-full">
                  <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex items-center pb-[13px] pt-[12px] relative size-full">
                    <div className="flex-1 min-w-px relative">
                      <div className="bg-clip-padding border-0 border-transparent border-solid content-stretch flex flex-col items-start justify-center pl-[50px] relative size-full">
                        <div className="content-stretch flex h-[33.41px] items-center pb-px relative shrink-0 w-full">
                          <div className="content-stretch flex flex-1 flex-col items-start min-w-px relative">
                            <p className="m-0 tracking-[-1.336px] w-full leading-[33.4px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, fontSize: 31.4, color: item.active ? '#17100e' : 'rgba(23,16,14,0.5)' }}>{item.text}</p>
                          </div>
                        </div>
                        {item.active && (
                          <div className="absolute bottom-[-12px] content-stretch flex items-center left-0 top-[-12px] w-[22px]">
                            <div className="bg-black relative rounded-[12px] shrink-0 size-[12px]" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }


  // COPILOT — PLATFORM CARD section "Part of the only complete, AI-first customer service platform" (Figma node 32:14934)
  // White rounded card with heading + intro + product shot + 3-tab trigger (Inbox active, Tickets/Phone inactive)
  const platformImg1 = "/v2/assets/c236c6f2-9e69-4e8a-b390-60f98518b12f.png";
  const platformImg2 = "/v2/assets/649bf55b-9012-429f-84dc-6cc87817c6f3.png";

  function CopilotPlatformSection() {
    return (
      <div className="content-stretch flex flex-col items-start px-[120px] py-[96px] relative size-full" data-node-id="32:14934">
        <div className="content-stretch flex flex-col items-start max-w-[1540px] px-[24px] relative shrink-0 w-[1200px]">
          <div className="bg-white content-stretch flex flex-col gap-[24px] items-start justify-center p-[20px] relative rounded-[8px] shrink-0 w-full">

            {/* Heading + intro */}
            <div className="content-stretch flex flex-col h-[155.53px] items-center justify-center relative shrink-0 w-[1088px]">
              <div className="content-stretch flex flex-col items-center max-w-[833px] min-w-[833px] pl-[114.47px] pr-[114.46px] relative shrink-0">
                <p className="m-0 text-[46.2px] text-[#17100e] text-center tracking-[-2.309px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, lineHeight: '46.17px' }}>
                  <span style={{ display: 'block' }}>Part of the only complete, AI-</span>
                  <span style={{ display: 'block' }}>first customer service platform</span>
                </p>
              </div>
              <div className="content-stretch flex flex-col items-start max-w-[560px] pt-[18.8px] relative shrink-0">
                <div className="content-stretch flex flex-col items-center max-w-[560px] pl-[4.55px] pr-[4.56px] relative shrink-0">
                  <p className="m-0 text-[16.5px] text-[#17100e] text-center whitespace-nowrap leading-[21.6px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                    <span style={{ display: 'block' }}>Copilot is just one of the powerful tools for agents, which also includes</span>
                    <span style={{ display: 'block' }}>tickets, phone and a collaborative shared inbox.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Product mockup */}
            <div className="content-stretch flex h-[542.09px] items-center justify-center overflow-clip relative shrink-0 w-full">
              <div className="absolute content-stretch flex flex-col h-[542.09px] items-start justify-center left-0 overflow-clip top-0 w-[1112px]">
                <div className="flex-1 min-h-[542.09px] min-w-[1112px] relative w-full">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <img loading="lazy" decoding="async" alt="" className="absolute h-[101.75%] left-0 max-w-none top-[-0.88%] w-full" src={platformImg1} />
                  </div>
                </div>
              </div>
              <div className="flex-1 h-full min-w-px overflow-clip relative">
                <div className="absolute aspect-[1112/551.58] left-0 right-0 top-0">
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none size-full top-0" src={platformImg2} />
                  </div>
                </div>
              </div>
            </div>

            {/* 3-column tabs (Inbox active, Tickets and Phone inactive) */}
            <div className="grid grid-cols-1 grid-rows-[85.72px] h-[85.72px] relative shrink-0 w-full">
              <div className="grid grid-cols-3 gap-[20px] grid-rows-[85.72px] h-[85.72px] justify-self-stretch relative row-1 self-start shrink-0">
                {[
                  { title: 'Inbox',   desc: 'Maximize productivity with an AI-enhanced inbox.',                                              active: true },
                  { title: 'Tickets', desc: 'Resolve complex issues more efficiently with tickets designed to streamline collaboration.',  active: false },
                  { title: 'Phone',   desc: 'Use phone calls, video calls, and screen sharing to troubleshoot customer issues faster.',     active: false },
                ].map((tab, i) => (
                  <div key={i} className="content-stretch flex flex-col gap-[3.99px] items-start justify-self-stretch pt-[20px] relative row-1 self-start shrink-0">
                    <div className="absolute bg-[rgba(23,16,14,0.2)] h-[2px] left-0 right-0 top-0" />
                    {tab.active && <div className="absolute bg-[#17100e] h-[2px] left-0 right-0 top-0" />}
                    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                      <p className="m-0 text-[14.8px] tracking-[-0.16px] w-full leading-[19.2px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, color: tab.active ? '#17100e' : 'rgba(23,16,14,0.6)' }}>{tab.title}</p>
                    </div>
                    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
                      <p className="m-0 text-[14.6px] w-full leading-[21.28px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: tab.active ? '#17100e' : 'rgba(23,16,14,0.6)' }}>{tab.desc}</p>
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


  // COPILOT — BANNER CTA section (Figma node 32:14961)
  // Dark full-bleed banner with bg image + centered "Enter the new age" + View demo button
  const bannerCtaImgBg = "/v2/assets/8bca6672-b6e3-4f30-8e07-6b932e4b18f6.jpg";

  function CopilotBannerCtaSection() {
    return (
      <div className="bg-[#17100e] content-stretch flex flex-col items-start relative size-full" data-node-id="32:14961">
        <div className="h-[864px] max-w-[1920px] overflow-clip relative shrink-0 w-full">
          {/* BG image */}
          <div className="absolute aspect-[1440/864] content-stretch flex flex-col items-start justify-center left-0 overflow-clip right-0 top-0">
            <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative shrink-0 w-full">
              <div className="h-[864px] min-w-[1440px] relative shrink-0 w-full">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img loading="lazy" decoding="async" alt="" className="absolute h-[166.67%] left-0 max-w-none top-[-33.33%] w-full" src={bannerCtaImgBg} />
                </div>
              </div>
              <div className="absolute bg-[#17100e] inset-0" style={{ opacity: 0.2 }} />
            </div>
          </div>
          {/* Content centered */}
          <div className="absolute grid grid-cols-1 grid-rows-[736px] h-[864px] left-0 px-[24px] py-[64px] right-0 top-0">
            <div className="col-1 content-stretch flex flex-col gap-[24px] items-center justify-self-center relative row-1 self-center shrink-0">
              <div className="content-stretch flex flex-col items-center max-w-[677px] pl-[80.06px] pr-[80.08px] relative shrink-0">
                <p className="m-0 text-[52.6px] text-white text-center tracking-[-2.886px] whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700, lineHeight: '57.72px' }}>
                  <span style={{ display: 'block' }}>Enter the new age of</span>
                  <span style={{ display: 'block' }}>customer service with</span>
                  <span style={{ display: 'block' }}>Copilot</span>
                </p>
              </div>
              <a onClick={() => ClainV2.navigate('/demo')} className="content-stretch cursor-pointer flex flex-col items-start relative shrink-0">
                <div className="border-[1px] border-white border-solid content-stretch flex flex-col items-center px-[17px] py-[10px] relative rounded-[6px] shrink-0 w-full">
                  <p className="m-0 text-[12.8px] text-white text-center tracking-[-0.35px] whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>View demo</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }


  function CopilotPage() {
    return (
      <PageShell>
        <CopilotHero />
        <CopilotBelieveSection />
        <CopilotTestimonialSection />
        <CopilotSmaSection />
        <CopilotPlatformSection />
        <CopilotBannerCtaSection />
      </PageShell>
    );
  }

  window.CopilotPage = CopilotPage;
})();
