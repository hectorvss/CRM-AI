/* global React, ClainV2 */
(function () {
  const { useState, useEffect } = React;
  const { PageShell } = ClainV2;

/* ═══════════════════════════════════════════════════════════════════
     HERO SECTION — extracted from Figma node 2:18821
     All 49 image assets are real Figma exports stored in /v2/assets/
     ═══════════════════════════════════════════════════════════════════ */

  /* — Customer logo SVGs (Component1 variants 1-24) — */
  const imgLogoAnthropic       = "/v2/assets/19e97780-51e4-4db3-a4ee-f99dd72193c0.svg"; // v1
  const imgLogoAsana           = "/v2/assets/349a9882-5450-4ca0-b0a1-ec746be4b79d.svg"; // v2
  const imgLogoAutodesk        = "/v2/assets/b8f94a00-cf2e-4c92-9515-3d5245c9822f.svg"; // v3
  const imgLogoClayGroup       = "/v2/assets/fa3a8a7d-71fc-4eb7-af94-727eb247a120.svg"; // v4
  const imgLogoKalshi          = "/v2/assets/800e51de-37a8-428a-aa8e-2642d9c4d105.svg"; // v5
  const imgLogoCryptoMain      = "/v2/assets/33cba65c-927e-44f3-9eed-3eb19fbea48f.svg"; // v6 part1
  const imgLogoCryptoP2        = "/v2/assets/4354b4f4-da98-4944-9262-7b2df2a4ea24.svg"; // v6 part2
  const imgLogoCryptoP3        = "/v2/assets/bb5775f9-4ff4-4688-8af6-fa66d82cd35d.svg"; // v6 part3
  const imgLogoCultureAmp      = "/v2/assets/646c653a-2691-4a7b-b65f-2600203913c9.svg"; // v7
  const imgLogoDoorDashMask    = "/v2/assets/7f21602f-5ebd-431b-932c-7d8d0a3827f9.svg"; // v8 mask group source 1
  const imgLogoDoorDashG1      = "/v2/assets/38d7cb75-156d-43cd-8f14-7b796491c7c3.svg"; // v8 group inner
  const imgLogoGammaMask       = "/v2/assets/64aff3c4-4a80-4695-a004-43f3889cbfb4.svg"; // v9 mask src
  const imgLogoGamma           = "/v2/assets/6e8ad21e-c172-499f-8ead-192266b7fc3b.svg"; // v9 group inner
  const imgLogoGleanMask       = "/v2/assets/3b87929e-0b7e-40ab-979c-36493cba3e2d.svg"; // v10 mask
  const imgLogoGlean           = "/v2/assets/077bdca2-8d25-4e38-8aeb-557c31e78e00.svg"; // v10 group
  const imgLogoKajabi          = "/v2/assets/b2d54a31-d450-4aa9-9017-0002b7ddf141.svg"; // v11 group inner
  const imgLogoKajabiMask1     = "/v2/assets/ea5af086-2af6-4146-8b8d-d192cc090819.svg"; // v11 vector 9
  const imgLogoKajabiV1        = "/v2/assets/9e647a20-dae3-408f-b84e-7f18450251ed.svg"; // v11 vector 10
  const imgLogoKajabiV2        = "/v2/assets/4e97e477-4356-4a7f-a5dd-d066bc5df0aa.svg"; // v11 vector 11
  const imgLogoKajabiG7        = "/v2/assets/cd7e18c3-d26c-451c-8429-0be5af17b0bf.svg"; // v11 mask group 7
  const imgLogoKajabiG8        = "/v2/assets/25c2b1cc-69e7-41ed-a338-d873d28dddfa.svg"; // v11 group 8
  const imgLogoLaunchDarkly    = "/v2/assets/8167034d-b030-49ec-99c9-2a4f98fa6be2.svg"; // v12
  const imgLogoLinear          = "/v2/assets/3cd876b4-b67b-4460-ad0e-9416c7118da9.svg"; // v13
  const imgLogoMercuryGroup    = "/v2/assets/cf86fce3-f2a3-4c51-8e34-97514d7ff44e.svg"; // v14 group
  const imgLogoMercuryV        = "/v2/assets/4423d8c4-2580-4c70-be75-ab5e26f5ca4d.svg"; // v14 vector 14
  const imgLogoMiro            = "/v2/assets/e9e670b2-c121-4b1e-a2ef-75e9c3989b86.svg"; // v15
  const imgLogoMonday          = "/v2/assets/00a13778-12db-4a8a-9d1f-a6e756476cd8.svg"; // v16
  const imgLogoRiot            = "/v2/assets/aeffda6c-fdcc-4998-94b6-a0e349e82a79.svg"; // v17
  const imgLogoRocketMoney     = "/v2/assets/eeff7165-e557-45e8-9fe7-9658dc5102bf.svg"; // v18
  const imgLogoShutterstock    = "/v2/assets/c336a89f-935d-4e52-b5c4-0676a440b336.svg"; // v19
  const imgLogoSnowflake       = "/v2/assets/cd792fed-9f4b-4bba-bcef-dda94443c7ee.svg"; // v20
  const imgLogoSynthesia       = "/v2/assets/7b5bd171-5329-4f78-b589-800f6a9f2d24.svg"; // v21
  const imgLogoToast           = "/v2/assets/33f66fb7-6cbf-456c-9134-fda5d8addc4b.svg"; // v22
  const imgLogoVanta           = "/v2/assets/c1c9f3e5-fbeb-4abc-96d9-148ac938aaf3.svg"; // v23
  const imgLogoWhoop           = "/v2/assets/d4bac86b-b619-49d5-91f6-032b33694ee0.svg"; // v24

  /* — Apex 1.0 icon (variant 25) parts — */
  const imgApexMain            = "/v2/assets/8f336710-00a5-4b5f-b10e-bce83f95ee8d.svg";
  const imgApexAccent          = "/v2/assets/27be2a14-e544-4ce3-88dc-7bb51041e1c7.svg";
  const imgApexMask            = "/v2/assets/452ee840-d99f-4e15-b31e-c82dd08dc0db.svg";
  const imgApexFlare1          = "/v2/assets/7bdaa629-a6b1-4ba8-a6ba-d40dfc8f5057.svg";
  const imgApexFlare2          = "/v2/assets/80dafbe2-eb98-4f1f-9e03-9bb89872541b.svg";
  const imgApexFlare3          = "/v2/assets/de253f61-4946-44af-a215-8235d37cec9d.svg";
  const imgApexFlare4          = "/v2/assets/ad0c086f-aa4e-4864-a74f-6f766dffe94f.svg";
  const imgApexFlare5          = "/v2/assets/a55ca4b4-e7fc-40f5-80cf-3a1b781851b7.svg";
  const imgApexFlare6          = "/v2/assets/0d5a48d8-7a04-4b19-9b63-5b7f0c99ce16.svg";
  const imgApexFlare7          = "/v2/assets/f7a37c15-3225-40c0-9d50-4950c923209c.svg";
  const imgApexBase            = "/v2/assets/6b80998f-883d-4d52-aa54-59f3537920b3.svg";

  /* — Hero background + product images — */
  const imgHeroBgImage         = "/v2/assets/d5a0244c-f797-4f8d-88f6-2e909e4ec5d2.png";
  const imgHeroAnimation       = "/v2/assets/04d950b4-0e55-4d5e-a4fd-fb1f7085ee36.jpg";
  const imgHeroProduct         = "/v2/assets/6d9d7ae4-a60c-4fd4-81f8-8f16e284084e.png";

  /* — Customer logos data: array of 24 entries with width + variant renderer — */
  const CUSTOMER_LOGOS = [
    // Row 1
    { name: 'Anthropic',  w: 122.84, render: () => <SimpleLogo src={imgLogoAnthropic} inset="32.14% 7.77% 32.14% 7.67%" /> },
    { name: 'Asana',      w: 97.84,  render: () => <SimpleLogo src={imgLogoAsana} inset="19.88% 0 19.73% 0" /> },
    { name: 'Autodesk',   w: 118.84, render: () => <SimpleLogo src={imgLogoAutodesk} inset="33.93% 7.93% 33.93% 7.69%" /> },
    { name: 'Clay',       w: 67.92,  render: () => <SimpleLogo src={imgLogoClayGroup} inset="15.33% 0 15.45% 0.03%" /> },
    { name: 'Kalshi',     w: 73.95,  render: () => <SimpleLogo src={imgLogoKalshi} inset="16.17% 0" /> },
    { name: 'Crypto.com', w: 125.33, render: () => <CryptoLogo /> },
    // Row 2
    { name: 'Culture Amp', w: 137.14, render: () => <SimpleLogo src={imgLogoCultureAmp} inset="23.22% 6.91% 23.21% 6.67%" /> },
    { name: 'DoorDash',    w: 129.14, render: () => <MaskedLogo maskSrc={imgLogoDoorDashMask} groupSrc={imgLogoDoorDashG1} inset="30.36% 7.08%" maskInset="30.36% 7.08%" maskPos="0px 0px" maskSize="110.856px 12.571px" /> },
    { name: 'Gamma',       w: 82,     render: () => <MaskedLogo maskSrc={imgLogoGammaMask} groupSrc={imgLogoGamma} inset="0 0.98% 0 0" maskInset="28.13% 0.98% 28.13% 0" maskPos="0px -9px" maskSize="81.199px 32px" /> },
    { name: 'Glean',       w: 64,     render: () => <MaskedLogo maskSrc={imgLogoGleanMask} groupSrc={imgLogoGlean} inset="15.71% 7.86%" maskInset="16.18% 7.95%" maskPos="-0.061px -0.148px" maskSize="53.943px 21.943px" /> },
    { name: 'Kajabi',      w: 89.141, render: () => <KajabiLogo /> },
    { name: 'LaunchDarkly',w: 144.56, render: () => <SimpleLogo src={imgLogoLaunchDarkly} inset="19.65% 6.66% 19.64% 6.64%" /> },
    // Row 3
    { name: 'Linear',     w: 90.84,  render: () => <SimpleLogo src={imgLogoLinear} inset="21.43% 10.48% 21.43% 10.06%" /> },
    { name: 'Mercury',    w: 139,    render: () => <MercuryLogo /> },
    { name: 'Miro',       w: 87.19,  render: () => <SimpleLogo src={imgLogoMiro} inset="19.25% 0.03% 19.06% 14.74%" /> },
    { name: 'Monday.com', w: 126.84, render: () => <SimpleLogo src={imgLogoMonday} inset="19.65% 7.57% 19.65% 7.34%" /> },
    { name: 'Riot Games', w: 83.42,  render: () => <SimpleLogo src={imgLogoRiot} inset="21.43% 11.11% 21.43% 10.96%" /> },
    { name: 'Rocket Money', w: 91.31, render: () => <SimpleLogo src={imgLogoRocketMoney} inset="0 0.79% 1.6% 0.6%" /> },
    // Row 4
    { name: 'Shutterstock', w: 124,     render: () => <SimpleLogo src={imgLogoShutterstock} inset="26.79% 7.47% 26.79% 7.72%" /> },
    { name: 'Snowflake',    w: 106,     render: () => <SimpleLogo src={imgLogoSnowflake} inset="12.5% 0" /> },
    { name: 'Synthesia',    w: 126.281, render: () => <SimpleLogo src={imgLogoSynthesia} inset="23.22% 7.68% 23.22% 7.32%" /> },
    { name: 'Toast',        w: 86.28,   render: () => <SimpleLogo src={imgLogoToast} inset="23.22% 10.89% 23.21% 10.6%" /> },
    { name: 'Vanta',        w: 94.84,   render: () => <SimpleLogo src={imgLogoVanta} inset="3.58% 9.97% 3.58% 9.76%" /> },
    { name: 'WHOOP',        w: 116.56,  render: () => <SimpleLogo src={imgLogoWhoop} inset="25% 7.86% 25% 7.94%" /> },
  ];

  /* — Logo helper components — */
  function SimpleLogo({ src, inset }) {
    return (
      <div className="absolute opacity-100" style={{ inset }}>
        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={src} />
      </div>
    );
  }

  function CryptoLogo() {
    return (
      <>
        <div className="absolute opacity-100" style={{ inset: '12.38% 0.27% 12.38% 0' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoCryptoMain} />
        </div>
        <div className="absolute opacity-100" style={{ inset: '28.62% 87.7% 27.14% 2.06%' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoCryptoP2} />
        </div>
        <div className="absolute opacity-100" style={{ inset: '43.64% 89.61% 40.89% 6.18%' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoCryptoP3} />
        </div>
      </>
    );
  }

  function MaskedLogo({ maskSrc, groupSrc, inset, maskInset, maskPos, maskSize }) {
    const wrapStyle = { inset };
    const innerStyle = {
      inset: maskInset,
      maskImage: `url('${maskSrc}')`,
      WebkitMaskImage: `url('${maskSrc}')`,
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: maskPos,
      WebkitMaskPosition: maskPos,
      maskSize,
      WebkitMaskSize: maskSize,
    };
    return (
      <div className="absolute" style={wrapStyle}>
        <div className="absolute" style={innerStyle}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={groupSrc} />
        </div>
      </div>
    );
  }

  function KajabiLogo() {
    return (
      <div className="absolute" style={{ inset: '16.19% 10.26% 16.2% 10.26%' }}>
        {/* base mask group */}
        <div className="absolute" style={{ inset: '16.24% 10.32% 16.24% 10.26%', maskImage: `url('${imgLogoKajabiMask1}')`, WebkitMaskImage: `url('${imgLogoKajabiMask1}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoKajabi} />
        </div>
        <div className="absolute" style={{ inset: '30.11% 10.32% 20.17% 42.71%', maskImage: `url('${imgLogoKajabiMask1}')`, WebkitMaskImage: `url('${imgLogoKajabiMask1}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoKajabiV1} />
        </div>
        <div className="absolute" style={{ inset: '30.44% 26.12% 30.18% 41.62%', maskImage: `url('${imgLogoKajabiMask1}')`, WebkitMaskImage: `url('${imgLogoKajabiMask1}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoKajabiV2} />
        </div>
        <div className="absolute" style={{ inset: '16.24% 65.51% 16.24% 10.26%', maskImage: `url('${imgLogoKajabiG7}')`, WebkitMaskImage: `url('${imgLogoKajabiG7}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoKajabiG8} />
        </div>
      </div>
    );
  }

  function MercuryLogo() {
    return (
      <>
        <div className="absolute opacity-100" style={{ inset: '0 76.98% 0 0' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoMercuryGroup} />
        </div>
        <div className="absolute opacity-100" style={{ inset: '31.4% 0.58% 31.4% 31.65%' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgLogoMercuryV} />
        </div>
      </>
    );
  }

  /* — Apex 1.0 icon (variant 25): a complex layered SVG composition — */
  function ApexIcon() {
    return (
      <div className="overflow-clip relative shrink-0" style={{ width: 77, height: 96 }}>
        <div className="absolute opacity-100" style={{ inset: '0 -0.05% 0 0' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgApexMain} />
        </div>
        <div className="absolute opacity-100" style={{ inset: '6.25% 7.74% 6.25% 7.79%' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgApexAccent} />
        </div>
        <div className="absolute" style={{ inset: '15.99% 21.3% 38.01% 21.35%' }}>
          <div className="absolute" style={{ inset: '16.25% 21.62% 38.27% 21.67%' }}>
            {/* 7 flares */}
            {[
              { inset: '43.9% 39.49% 38.27% 38.46%', src: imgApexFlare1 },
              { inset: '34.9% 53.08% 39.18% 27.36%', src: imgApexFlare2 },
              { inset: '26.18% 51.32% 53.43% 21.67%', src: imgApexFlare3 },
              { inset: '16.25% 38.42% 65.93% 29.23%', src: imgApexFlare4 },
              { inset: '17.15% 27.31% 56.93% 53.12%', src: imgApexFlare5 },
              { inset: '31.4% 21.62% 48.21% 51.37%', src: imgApexFlare6 },
              { inset: '49.95% 29.18% 43.47% 62.52%', src: imgApexFlare7 },
            ].map((f, i) => (
              <div key={i} className="absolute" style={{ inset: f.inset, maskImage: `url('${imgApexMask}')`, WebkitMaskImage: `url('${imgApexMask}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}>
                <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={f.src} />
              </div>
            ))}
          </div>
        </div>
        <div className="absolute opacity-100" style={{ inset: '68.07% 14.53% 17.66% 14.76%' }}>
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={imgApexBase} />
        </div>
      </div>
    );
  }

  /* — Logo cell that mounts the variant SVGs at exact width — */
  function LogoCell({ logo }) {
    return (
      <div className="flex items-center justify-center h-[32px]">
        <div className="overflow-clip relative shrink-0 h-[32px]" style={{ width: logo.w }}>
          {logo.render()}
        </div>
      </div>
    );
  }

  function HeroSection() {
    return (
      <div className="relative w-full overflow-hidden" style={{ background: '#020917' }}>
        <div className="relative max-w-[1440px] mx-auto" style={{ height: 2016 }}>

          {/* Background dark blue panel with starfield image — full bleed within max-w container — */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute" style={{ left: -187.2, right: -187.2, top: -113.49, height: 1099.98, opacity: 1 }}>
              <div className="absolute inset-0 flex flex-col" style={{ background: '#020917' }}>
                <div className="relative w-[1795.5px] h-[1099.98px] mx-auto">
                  <img loading="lazy" decoding="async" alt="" className="absolute left-0 top-0 max-w-none size-full" src={imgHeroBgImage} />
                </div>
              </div>
            </div>
            {/* Side gradients */}
            <div className="absolute top-0 bottom-0 left-0 w-[230px]" style={{ background: 'linear-gradient(to right, #020917 0%, rgba(2,9,23,0) 100%)' }} />
            <div className="absolute top-0 bottom-0 right-0 w-[230px]" style={{ background: 'linear-gradient(to left, #020917 0%, rgba(2,9,23,0) 100%)' }} />
            {/* Bottom fade */}
            <div className="absolute left-0 right-0 bottom-0 h-[240px]" style={{ background: 'linear-gradient(to top, #020917 0%, rgba(2,9,23,0.85) 25%, rgba(2,9,23,0) 100%)' }} />
            {/* Top fade */}
            <div className="absolute left-0 right-0 top-0 h-[180px]" style={{ background: 'linear-gradient(to bottom, #020917 0%, rgba(2,9,23,0.6) 50%, rgba(2,9,23,0) 100%)' }} />
          </div>

          {/* Hero content (title, sub-claims, CTAs, Apex 1.0 callout) */}
          <div className="absolute left-0 right-0 top-0 h-[900px] flex items-center justify-center py-[96px] overflow-clip">
            <div className="flex flex-col items-start max-w-[1600px] w-full px-[24px] relative">
              <div className="flex flex-col items-start justify-center w-full" style={{ height: 612, maxHeight: 720 }}>

                {/* H1 heading */}
                <div className="flex flex-col items-start pb-[24px] w-full" style={{ paddingLeft: 169.875, paddingRight: 169.875 }}>
                  <div className="relative w-full" style={{ height: 192 }}>
                    {/* Line 1 */}
                    <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col justify-center text-center text-white" style={{ top: 47.5, width: 791.98, height: 96, fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 94.3, lineHeight: '96px', letterSpacing: '-3.008px' }}>
                      <p className="m-0">The #1 AI Agent for</p>
                    </div>
                    {/* "all" floating tag */}
                    <div className="absolute -translate-x-1/2 flex items-start justify-center py-[9.5px]" style={{ left: 'calc(50% - 480.13px)', top: 86, filter: 'drop-shadow(0px 0px 4px white)' }}>
                      <div className="text-white text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 96, lineHeight: '96px', letterSpacing: '-3.008px' }}>
                        <p className="m-0">all</p>
                      </div>
                    </div>
                    {/* Line 2 */}
                    <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col justify-center text-center text-white" style={{ top: 143.5, width: 955.95, height: 96, fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 95.4, lineHeight: '96px', letterSpacing: '-3.008px', transform: 'translate(calc(-50% + 48.33px), -50%)' }}>
                      <p className="m-0"> your customer service</p>
                    </div>
                  </div>
                </div>

                {/* Sub-claims */}
                <ul className="flex flex-col items-start pb-[36px] w-full m-0 p-0 list-none">
                  <li className="flex gap-[32px] items-center justify-center w-full">
                    {['#1 in bake-offs', '#1 in benchmarks', '#1 for complex queries'].map((claim) => (
                      <div key={claim} className="flex flex-col items-center">
                        <p className="m-0 text-center uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13.7, lineHeight: '16px', letterSpacing: '1.504px', color: 'rgba(255,255,255,0.8)' }}>{claim}</p>
                      </div>
                    ))}
                  </li>
                </ul>

                {/* CTA buttons */}
                <div className="flex flex-col items-start w-full">
                  <div className="flex flex-wrap gap-[12px] h-[42px] items-start justify-center w-full">
                    <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer h-full flex items-center justify-center px-[16px] py-[13px] rounded-[6px] border-0 bg-white text-black text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.4, lineHeight: '16px', letterSpacing: '-0.32px' }}>Start free trial</button>
                    <button onClick={() => ClainV2.navigate('/demo')} className="cursor-pointer h-full flex items-center justify-center px-[17px] py-[13px] rounded-[6px] bg-transparent text-white text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.8, lineHeight: '16px', letterSpacing: '-0.32px', border: '1px solid white' }}>View demo</button>
                  </div>
                </div>

                {/* Apex 1.0 callout */}
                <div className="flex flex-col items-start pt-[40px] w-full">
                  <div className="flex gap-[24px] items-start justify-center px-[12px] w-full">
                    <ApexIcon />
                    <div className="flex flex-col gap-[15.5px] items-start" style={{ minWidth: 280, maxWidth: 280 }}>
                      <div className="flex flex-col items-start w-full">
                        <p className="m-0 uppercase whitespace-nowrap text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.8, lineHeight: '14px', letterSpacing: '1.504px' }}>POWERED BY CLAIN APEX 1.0</p>
                      </div>
                      <div className="flex flex-col items-start w-full" style={{ opacity: 0.8 }}>
                        <p className="m-0 uppercase whitespace-nowrap text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.5, lineHeight: '14px', letterSpacing: '1.504px' }}>The highest-performing, fastest</p>
                        <p className="m-0 uppercase whitespace-nowrap text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.5, lineHeight: '14px', letterSpacing: '1.504px' }}>model for customer service.</p>
                      </div>
                      <div className="flex flex-col items-start w-full">
                        <button onClick={() => ClainV2.navigate('/cx-models')} className="cursor-pointer flex items-center justify-center pb-[4px] bg-white text-white border-0" style={{ background: 'transparent', borderBottom: '1px solid white', opacity: 0.8 }}>
                          <span className="text-center whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 12.9, lineHeight: '14px', letterSpacing: '0.07px', color: 'white' }}>Learn more</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Product visual area: hero animation + product UI screenshot with edge gradients */}
          <div className="absolute overflow-clip flex flex-col items-start" style={{ left: 80, right: 80, top: 900, aspectRatio: '1280/772' }}>
            <div className="relative w-full" style={{ aspectRatio: '1280/772', opacity: 0 }}>
              <img loading="lazy" decoding="async" alt="" className="absolute left-0 top-0 max-w-none size-full" src={imgHeroAnimation} />
            </div>
            <div className="absolute inset-0 flex flex-col items-start">
              <div className="relative" style={{ width: 1280, height: 772 }}>
                <img loading="lazy" decoding="async" alt="" className="absolute left-0 top-0 max-w-none size-full" src={imgHeroProduct} />
              </div>
            </div>
            {/* 4-side gradients */}
            <div className="absolute left-0 right-0 top-0 h-[100px]" style={{ background: 'linear-gradient(to bottom, #020917 0%, #020917 45%, rgba(2,9,23,0) 100%)' }} />
            <div className="absolute left-0 right-0 bottom-0 h-[100px]" style={{ background: 'linear-gradient(to top, #020917 0%, #020917 45%, rgba(2,9,23,0) 100%)' }} />
            <div className="absolute top-0 bottom-0 right-0 w-[100px]" style={{ background: 'linear-gradient(to left, #020917 0%, #020917 45%, rgba(2,9,23,0) 100%)' }} />
            <div className="absolute top-0 bottom-0 left-0 w-[100px]" style={{ background: 'linear-gradient(to right, #020917 0%, #020917 45%, rgba(2,9,23,0) 100%)' }} />
          </div>

          {/* Customer logo grid 6×4 (24 logos) */}
          <div className="absolute grid grid-cols-6" style={{ left: 168, right: 168, top: 1696, height: 296, gap: '56px 32px', padding: '0 24px' }}>
            {CUSTOMER_LOGOS.map((logo) => (
              <LogoCell key={logo.name} logo={logo} />
            ))}
          </div>

        </div>
      </div>
    );
  }

  /* ═══ PERFORMANCE SECTION (Figma 2:19122) ═══ */
  const PerfImgGroup = "/v2/assets/220f1460-aca4-40ef-84c3-8e7524e49ffe.svg";
  const PerfImgGroup1 = "/v2/assets/c8644094-b54d-4eed-811d-1645f9ece833.svg";
  const PerfImgGroup2 = "/v2/assets/3490bf93-be49-43a3-9dbd-ba56033d111e.svg";
  const PerfImgGroup3 = "/v2/assets/dc142e3d-f27a-443c-a1a7-e1627beacc9d.svg";
  const PerfImgGroup4 = "/v2/assets/f1926db1-e841-482f-8e52-c13f2b8a230f.svg";
  const PerfImgGroup5 = "/v2/assets/b39c1e48-45a7-49dc-8611-4268e03f2b4d.svg";
  const PerfImgVector = "/v2/assets/3f626b01-e721-469f-a3b7-1084e343266f.svg";
  const PerfImgGroup6 = "/v2/assets/d6a446fc-5fcc-4bd2-9a5e-7fa342418275.svg";
  const PerfImgVector1 = "/v2/assets/381853c9-473d-4cb0-a47a-7660672be281.svg";
  const PerfImgVector2 = "/v2/assets/a4c79da9-e5cd-4489-a0ae-a852ab4e49bb.svg";
  const PerfImgVector3 = "/v2/assets/54dcac97-e9f0-4439-8029-417223c5fff4.svg";
  const PerfImgVector4 = "/v2/assets/171af036-18ed-4c3d-8e1c-588c8680d5f7.svg";
  const PerfImgVector5 = "/v2/assets/0d7c1419-4dee-4dd1-bbcb-b9541a1f6a7c.svg";
  const PerfImgVector6 = "/v2/assets/2a4660b2-bdec-4878-9189-6c5e0b07f680.svg";
  const PerfImgVector7 = "/v2/assets/77d7e804-5242-4e25-82ac-4421b87c47a4.svg";
  const PerfImgVector8 = "/v2/assets/56f019bf-003a-4abd-be4a-56f77ad301ba.svg";
  const PerfImgVector9 = "/v2/assets/cd64de0a-2cfb-4409-9b75-3cd55ad40c8c.svg";
  const PerfImgVector10 = "/v2/assets/672a2001-16fa-4253-9de0-03e900f194b1.svg";
  const PerfImgVector11 = "/v2/assets/7a0b4f97-ce69-4ffc-af3f-0922d571b8ee.svg";
  const PerfImgVector12 = "/v2/assets/7523e7c8-599e-48f8-b3f8-4bbdc76267f0.svg";
  const PerfImgGroup7 = "/v2/assets/cfd260d2-5700-4654-a99c-0642e1ccb688.svg";
  const PerfImgGroup8 = "/v2/assets/9e5947d5-327a-40fa-900f-bc607cbe380b.svg";
  const PerfImgGroup9 = "/v2/assets/a8e1069b-8883-426a-9ad3-bbdd59cc16e5.svg";
  const PerfImgVector13 = "/v2/assets/417e32aa-6719-443a-9415-e265135e9fc7.svg";
  const PerfImgVector14 = "/v2/assets/4373e6c3-b9e4-4e75-8173-40fa2d39fea2.svg";
  const PerfImgVector15 = "/v2/assets/1d98b64f-f3e9-4610-a3d6-14202d7e7313.svg";
  const PerfImgAHeadshotOfAngeloLivanosSeniorDirectorAtLightspeed = "/v2/assets/f86ec4a6-6610-406f-a340-77446025b040.png";
  const PerfImgImage = "/v2/assets/5eb6b712-d2de-4a8b-8e5b-1503c9b79b1f.jpg";
  const PerfImgVideoThumbnail = "/v2/assets/d407b714-b349-48c1-802b-4689beea70f5.png";
  const PerfImgAiAtEnterpriseScaleWhyLightspeedChoseFin = "/v2/assets/6a9fef40-6295-4d49-a046-40a7b4d02e54.jpg";
  const PerfImgHowRocketMoneyOperationalizedAi = "/v2/assets/566c51ce-693d-4d88-9c4f-387b9ce0541b.jpg";
  const PerfImgSpanBorder = "/v2/assets/d886b76c-2383-4199-af1d-7322d100db2a.svg";
  const PerfImgVector16 = "/v2/assets/76f9eb6a-f0ca-46a1-ac07-a86fd51c7bdd.svg";
  const PerfImgVector17 = "/v2/assets/7709c236-09fe-4636-8409-83c699b8387e.svg";
  const PerfImgVector18 = "/v2/assets/23a14e6d-f03e-4686-bfd1-298d193bfcde.svg";




































function PerfComponent1({ className, variant = "26" }) {
  const is26 = variant === "26";
  const is26Or27 = ["26", "27"].includes(variant);
  const is27 = variant === "27";
  const is29 = variant === "29";
  const is30 = variant === "30";
  const is31 = variant === "31";
  const is32 = variant === "32";
  const is33 = variant === "33";
  const is34 = variant === "34";
  return (
    <div className={className || `overflow-clip relative ${["32", "33", "34"].includes(variant) ? "size-[16px]" : is31 ? "size-[20px]" : is30 ? "h-[20px] w-[178.33px]" : is29 ? "opacity-0 size-[100px]" : is27 ? "h-[340px] w-[504px]" : "h-[384px] w-[1012px]"}`} id={is34 ? "node-2_8227" : is33 ? "node-2_8224" : is32 ? "node-2_8220" : is31 ? "node-2_8216" : is30 ? "node-2_8212" : is29 ? "node-2_8199" : is27 ? "node-2_8177" : "node-2_8085"}>
      {["31", "32", "33", "34"].includes(variant) && (
        <div className="absolute inset-[15.61%_22.34%_20.39%_27.89%] opacity-[var(--opacity\/100,1)]" id={is34 ? "node-2_8226" : is33 ? "node-2_8223" : is32 ? "node-2_8219" : "node-2_8215"} data-name="Vector">
          <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={["33", "34"].includes(variant) ? PerfImgVector15 : is32 ? PerfImgVector14 : PerfImgVector13} />
        </div>
      )}
      {is26Or27 && (
        <>
          <div className={`absolute contents ${is27 ? "inset-[0.3%_94.07%_34.84%_1.37%]" : "inset-[2.69%_96.85%_28.87%_0.68%]"}`} id={is27 ? "node-2_8104" : "node-2_7872"} data-name="Group">
            <div className={`absolute contents ${is27 ? "inset-[0.3%_94.07%_34.84%_1.37%]" : "inset-[2.69%_96.85%_28.87%_0.68%]"}`} id={is27 ? "node-2_8105" : "node-2_7873"} data-name="Group">
              <div className={`absolute contents ${is27 ? "inset-[61.34%_94.07%_34.84%_1.37%]" : "inset-[67.48%_96.85%_28.87%_0.88%]"}`} id={is27 ? "node-2_8110" : "node-2_7876"} data-name="Group">
                <div className={`absolute contents ${is27 ? "inset-[61.34%_94.07%_34.84%_1.37%]" : "inset-[67.48%_96.85%_28.87%_0.88%]"}`} id={is27 ? "node-2_8111" : "node-2_7877"} data-name="Group">
                  <p className={`${String.raw`absolute font-[family-name:var(--font-family\/font-1,"Inter:Regular",sans-serif)] font-[var(--font-weight\/400,400)] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-right whitespace-nowrap `}${is27 ? String.raw`inset-[61.34%_94.07%_34.84%_1.37%] text-[length:var(--font-size\/10_87,10.871px)]` : String.raw`inset-[67.48%_96.85%_28.87%_0.88%] text-[length:var(--font-size\/11_85,11.848px)]`}`} id={is27 ? "node-2_8112" : "node-2_7878"}>
                    {is27 ? "20%" : "10%"}
                  </p>
                </div>
              </div>
              <div className={`absolute contents ${is27 ? "inset-[40.99%_94.07%_55.19%_1.37%]" : "inset-[56.68%_96.85%_39.67%_0.68%]"}`} id={is27 ? "node-2_8115" : "node-2_7879"} data-name="Group">
                <div className={`absolute contents ${is27 ? "inset-[40.99%_94.07%_55.19%_1.37%]" : "inset-[56.68%_96.85%_39.67%_0.68%]"}`} id={is27 ? "node-2_8116" : "node-2_7880"} data-name="Group">
                  <p className={`${String.raw`absolute font-[family-name:var(--font-family\/font-1,"Inter:Regular",sans-serif)] font-[var(--font-weight\/400,400)] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-right whitespace-nowrap `}${is27 ? String.raw`inset-[40.99%_94.07%_55.19%_1.37%] text-[length:var(--font-size\/10_87,10.871px)]` : String.raw`inset-[56.68%_96.85%_39.67%_0.68%] text-[length:var(--font-size\/11_85,11.848px)]`}`} id={is27 ? "node-2_8117" : "node-2_7881"}>
                    {is27 ? "40%" : "20%"}
                  </p>
                </div>
              </div>
              <div className={`absolute contents ${is27 ? "inset-[20.64%_94.07%_75.53%_1.37%]" : "inset-[45.89%_96.85%_50.47%_0.68%]"}`} id={is27 ? "node-2_8120" : "node-2_7882"} data-name="Group">
                <div className={`absolute contents ${is27 ? "inset-[20.64%_94.07%_75.53%_1.37%]" : "inset-[45.89%_96.85%_50.47%_0.68%]"}`} id={is27 ? "node-2_8121" : "node-2_7883"} data-name="Group">
                  <p className={`${String.raw`absolute font-[family-name:var(--font-family\/font-1,"Inter:Regular",sans-serif)] font-[var(--font-weight\/400,400)] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-right whitespace-nowrap `}${is27 ? String.raw`inset-[20.64%_94.07%_75.53%_1.37%] text-[length:var(--font-size\/10_87,10.871px)]` : String.raw`inset-[45.89%_96.85%_50.47%_0.68%] text-[length:var(--font-size\/11_85,11.848px)]`}`} id={is27 ? "node-2_8122" : "node-2_7884"}>
                    {is27 ? "60%" : "30%"}
                  </p>
                </div>
              </div>
              <div className={`absolute contents ${is27 ? "inset-[0.3%_94.07%_95.88%_1.37%]" : "inset-[35.09%_96.85%_61.27%_0.68%]"}`} id={is27 ? "node-2_8125" : "node-2_7885"} data-name="Group">
                <div className={`absolute contents ${is27 ? "inset-[0.3%_94.07%_95.88%_1.37%]" : "inset-[35.09%_96.85%_61.27%_0.68%]"}`} id={is27 ? "node-2_8126" : "node-2_7886"} data-name="Group">
                  <p className={`${String.raw`absolute font-[family-name:var(--font-family\/font-1,"Inter:Regular",sans-serif)] font-[var(--font-weight\/400,400)] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-right whitespace-nowrap `}${is27 ? String.raw`inset-[0.3%_94.07%_95.88%_1.37%] text-[length:var(--font-size\/10_87,10.871px)]` : String.raw`inset-[35.09%_96.85%_61.27%_0.68%] text-[length:var(--font-size\/11_85,11.848px)]`}`} id={is27 ? "node-2_8127" : "node-2_7887"}>
                    {is27 ? "80%" : "40%"}
                  </p>
                </div>
              </div>
              {is26 && (
                <>
                  <div className="absolute contents inset-[24.29%_96.85%_72.07%_0.68%]" data-node-id="2:7888" data-name="Group">
                    <div className="absolute contents inset-[24.29%_96.85%_72.07%_0.68%]" data-node-id="2:7889" data-name="Group">
                      <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[24.29%_96.85%_72.07%_0.68%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/11_85,11.848px)] text-right whitespace-nowrap" data-node-id="2:7890">
                        50%
                      </p>
                    </div>
                  </div>
                  <div className="absolute contents inset-[13.49%_96.85%_82.86%_0.68%]" data-node-id="2:7891" data-name="Group">
                    <div className="absolute contents inset-[13.49%_96.85%_82.86%_0.68%]" data-node-id="2:7892" data-name="Group">
                      <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[13.49%_96.85%_82.86%_0.68%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/11_85,11.848px)] text-right whitespace-nowrap" data-node-id="2:7893">
                        60%
                      </p>
                    </div>
                  </div>
                  <div className="absolute contents inset-[2.69%_96.85%_93.66%_0.78%]" data-node-id="2:7894" data-name="Group">
                    <div className="absolute contents inset-[2.69%_96.85%_93.66%_0.78%]" data-node-id="2:7895" data-name="Group">
                      <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[2.69%_96.85%_93.66%_0.78%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/11_85,11.848px)] text-right whitespace-nowrap" data-node-id="2:7896">
                        70%
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className={`absolute contents ${is27 ? "inset-[83.43%_0.98%_9.55%_0.98%]" : "inset-[82.14%_4.42%_14.48%_-2.24%]"}`} id={is27 ? "node-2_8128" : "node-2_7897"} data-name="Group">
            {is26 && (
              <div className="absolute contents inset-[82.14%_4.42%_14.48%_-2.24%]" data-node-id="2:7898" data-name="Group">
                <div className="absolute contents inset-[82.14%_96.91%_14.48%_-2.24%]" data-node-id="2:7899" data-name="Group">
                  <div className="absolute contents inset-[82.14%_96.91%_14.48%_-2.24%]" data-node-id="2:7900" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_96.91%_14.48%_-2.24%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7901">
                      MAY 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_93.93%_14.48%_0.84%]" data-node-id="2:7902" data-name="Group">
                  <div className="absolute contents inset-[82.14%_93.93%_14.48%_0.84%]" data-node-id="2:7903" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_93.93%_14.48%_0.84%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7904">
                      JUN 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_90.95%_14.48%_4.11%]" data-node-id="2:7905" data-name="Group">
                  <div className="absolute contents inset-[82.14%_90.95%_14.48%_4.11%]" data-node-id="2:7906" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_90.95%_14.48%_4.11%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7907">
                      JUL 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_87.96%_14.48%_6.71%]" data-node-id="2:7908" data-name="Group">
                  <div className="absolute contents inset-[82.14%_87.96%_14.48%_6.71%]" data-node-id="2:7909" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_87.96%_14.48%_6.71%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7910">
                      AUG 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_84.98%_14.48%_9.98%]" data-node-id="2:7911" data-name="Group">
                  <div className="absolute contents inset-[82.14%_84.98%_14.48%_9.98%]" data-node-id="2:7912" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_84.98%_14.48%_9.98%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7913">
                      SEP 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_81.99%_14.48%_12.67%]" data-node-id="2:7914" data-name="Group">
                  <div className="absolute contents inset-[82.14%_81.99%_14.48%_12.67%]" data-node-id="2:7915" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_81.99%_14.48%_12.67%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7916">
                      OCT 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_79.01%_14.48%_15.66%]" data-node-id="2:7917" data-name="Group">
                  <div className="absolute contents inset-[82.14%_79.01%_14.48%_15.66%]" data-node-id="2:7918" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_79.01%_14.48%_15.66%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7919">
                      NOV 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_76.03%_14.48%_18.74%]" data-node-id="2:7920" data-name="Group">
                  <div className="absolute contents inset-[82.14%_76.03%_14.48%_18.74%]" data-node-id="2:7921" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_76.03%_14.48%_18.74%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7922">
                      DEC 2023
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_73.04%_14.48%_21.82%]" data-node-id="2:7923" data-name="Group">
                  <div className="absolute contents inset-[82.14%_73.04%_14.48%_21.82%]" data-node-id="2:7924" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_73.04%_14.48%_21.82%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7925">
                      JAN 2024
                    </p>
                  </div>
                </div>
                <div className="absolute bottom-[14.48%] contents left-1/4 right-[70.06%] top-[82.14%]" data-node-id="2:7926" data-name="Group">
                  <div className="absolute bottom-[14.48%] contents left-1/4 right-[70.06%] top-[82.14%]" data-node-id="2:7927" data-name="Group">
                    <p className="absolute bottom-[14.48%] font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] leading-[normal] left-1/4 not-italic opacity-[var(--opacity\/100,1)] right-[70.06%] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right top-[82.14%] whitespace-nowrap" data-node-id="2:7928">
                      FEB 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_67.07%_14.48%_27.59%]" data-node-id="2:7929" data-name="Group">
                  <div className="absolute contents inset-[82.14%_67.07%_14.48%_27.59%]" data-node-id="2:7930" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_67.07%_14.48%_27.59%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7931">
                      MAR 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_64.09%_14.48%_30.87%]" data-node-id="2:7932" data-name="Group">
                  <div className="absolute contents inset-[82.14%_64.09%_14.48%_30.87%]" data-node-id="2:7933" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_64.09%_14.48%_30.87%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7934">
                      APR 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_61.11%_14.48%_33.56%]" data-node-id="2:7935" data-name="Group">
                  <div className="absolute contents inset-[82.14%_61.11%_14.48%_33.56%]" data-node-id="2:7936" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_61.11%_14.48%_33.56%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7937">
                      MAY 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_58.13%_14.48%_36.74%]" data-node-id="2:7938" data-name="Group">
                  <div className="absolute contents inset-[82.14%_58.13%_14.48%_36.74%]" data-node-id="2:7939" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_58.13%_14.48%_36.74%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7940">
                      JUN 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_55.14%_14.48%_39.92%]" data-node-id="2:7941" data-name="Group">
                  <div className="absolute contents inset-[82.14%_55.14%_14.48%_39.92%]" data-node-id="2:7942" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_55.14%_14.48%_39.92%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7943">
                      JUL 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_52.16%_14.48%_42.51%]" data-node-id="2:7944" data-name="Group">
                  <div className="absolute contents inset-[82.14%_52.16%_14.48%_42.51%]" data-node-id="2:7945" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_52.16%_14.48%_42.51%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7946">
                      AUG 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_49.18%_14.48%_45.78%]" data-node-id="2:7947" data-name="Group">
                  <div className="absolute contents inset-[82.14%_49.18%_14.48%_45.78%]" data-node-id="2:7948" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_49.18%_14.48%_45.78%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7949">
                      SEP 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_46.19%_14.48%_48.57%]" data-node-id="2:7950" data-name="Group">
                  <div className="absolute contents inset-[82.14%_46.19%_14.48%_48.57%]" data-node-id="2:7951" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_46.19%_14.48%_48.57%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7952">
                      OCT 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_43.21%_14.48%_51.46%]" data-node-id="2:7953" data-name="Group">
                  <div className="absolute contents inset-[82.14%_43.21%_14.48%_51.46%]" data-node-id="2:7954" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_43.21%_14.48%_51.46%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7955">
                      NOV 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_40.22%_14.48%_54.64%]" data-node-id="2:7956" data-name="Group">
                  <div className="absolute contents inset-[82.14%_40.22%_14.48%_54.64%]" data-node-id="2:7957" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_40.22%_14.48%_54.64%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7958">
                      DEC 2024
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_37.24%_14.48%_57.62%]" data-node-id="2:7959" data-name="Group">
                  <div className="absolute contents inset-[82.14%_37.24%_14.48%_57.62%]" data-node-id="2:7960" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_37.24%_14.48%_57.62%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7961">
                      JAN 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_34.26%_14.48%_60.8%]" data-node-id="2:7962" data-name="Group">
                  <div className="absolute contents inset-[82.14%_34.26%_14.48%_60.8%]" data-node-id="2:7963" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_34.26%_14.48%_60.8%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7964">
                      FEB 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_31.27%_14.48%_63.39%]" data-node-id="2:7965" data-name="Group">
                  <div className="absolute contents inset-[82.14%_31.27%_14.48%_63.39%]" data-node-id="2:7966" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_31.27%_14.48%_63.39%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7967">
                      MAR 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_28.29%_14.48%_66.67%]" data-node-id="2:7968" data-name="Group">
                  <div className="absolute contents inset-[82.14%_28.29%_14.48%_66.67%]" data-node-id="2:7969" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_28.29%_14.48%_66.67%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7970">
                      APR 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_25.31%_14.48%_69.36%]" data-node-id="2:7971" data-name="Group">
                  <div className="absolute contents inset-[82.14%_25.31%_14.48%_69.36%]" data-node-id="2:7972" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_25.31%_14.48%_69.36%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7973">
                      MAY 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_22.32%_14.48%_72.54%]" data-node-id="2:7974" data-name="Group">
                  <div className="absolute contents inset-[82.14%_22.32%_14.48%_72.54%]" data-node-id="2:7975" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_22.32%_14.48%_72.54%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7976">
                      JUN 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_19.34%_14.48%_75.72%]" data-node-id="2:7977" data-name="Group">
                  <div className="absolute contents inset-[82.14%_19.34%_14.48%_75.72%]" data-node-id="2:7978" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_19.34%_14.48%_75.72%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7979">
                      JUL 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_16.36%_14.48%_78.31%]" data-node-id="2:7980" data-name="Group">
                  <div className="absolute contents inset-[82.14%_16.36%_14.48%_78.31%]" data-node-id="2:7981" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_16.36%_14.48%_78.31%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7982">
                      AUG 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_13.38%_14.48%_81.68%]" data-node-id="2:7983" data-name="Group">
                  <div className="absolute contents inset-[82.14%_13.38%_14.48%_81.68%]" data-node-id="2:7984" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_13.38%_14.48%_81.68%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7985">
                      SEP 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_10.39%_14.48%_84.37%]" data-node-id="2:7986" data-name="Group">
                  <div className="absolute contents inset-[82.14%_10.39%_14.48%_84.37%]" data-node-id="2:7987" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_10.39%_14.48%_84.37%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7988">
                      OCT 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_7.4%_14.48%_87.26%]" data-node-id="2:7989" data-name="Group">
                  <div className="absolute contents inset-[82.14%_7.4%_14.48%_87.26%]" data-node-id="2:7990" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_7.4%_14.48%_87.26%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7991">
                      NOV 2025
                    </p>
                  </div>
                </div>
                <div className="absolute contents inset-[82.14%_4.42%_14.48%_90.44%]" data-node-id="2:7992" data-name="Group">
                  <div className="absolute contents inset-[82.14%_4.42%_14.48%_90.44%]" data-node-id="2:7993" data-name="Group">
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[82.14%_4.42%_14.48%_90.44%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_86,10.86px)] text-right whitespace-nowrap" data-node-id="2:7994">
                      DEC 2025
                    </p>
                  </div>
                </div>
              </div>
            )}
            {is27 && (
              <>
                <div className="absolute inset-[83.43%_0.98%_16.57%_0.98%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8129" data-name="Vector">
                  <div className="absolute inset-[-0.49px_0]">
                    <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector} />
                  </div>
                </div>
                <div className="absolute contents inset-[86.62%_14.73%_9.55%_16.83%]" data-node-id="2:8130" data-name="Group">
                  <div className="absolute contents inset-[86.62%_72.46%_9.55%_16.83%]" data-node-id="2:8131" data-name="Group">
                    <div className="absolute contents inset-[86.62%_72.46%_9.55%_16.83%]" data-node-id="2:8132" data-name="Group">
                      <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[86.62%_72.46%_9.55%_16.83%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_87,10.871px)] text-center whitespace-nowrap" data-node-id="2:8133">
                        DECAGON
                      </p>
                    </div>
                  </div>
                  <div className="absolute contents inset-[86.62%_38.83%_9.55%_44.71%]" data-node-id="2:8134" data-name="Group">
                    <div className="absolute contents inset-[86.62%_38.83%_9.55%_44.71%]" data-node-id="2:8135" data-name="Group">
                      <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[86.62%_38.83%_9.55%_44.71%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/10_87,10.871px)] text-center whitespace-nowrap" data-node-id="2:8136">
                        FORETHOUGHT
                      </p>
                    </div>
                  </div>
                  <div className="absolute contents inset-[86.62%_14.73%_9.55%_81.7%]" data-node-id="2:8137" data-name="Group">
                    <div className="absolute contents inset-[86.62%_14.73%_9.55%_81.7%]" data-node-id="2:8138" data-name="Group">
                      <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[86.62%_14.73%_9.55%_81.7%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/solid,black)] text-[length:var(--font-size\/10_87,10.871px)] text-center whitespace-nowrap" data-node-id="2:8139">
                        FIN
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className={`absolute contents ${is27 ? "inset-[2.04%_0.98%_16.57%_0.98%]" : "inset-[3.21%_0_21.2%_-1.27%]"}`} id={is27 ? "node-2_8140" : "node-2_7995"} data-name="Group">
            <div className={`${String.raw`absolute opacity-[var(--opacity\/100,1)] `}${is27 ? "inset-[2.04%_0.98%_16.57%_0.98%]" : "inset-[3.21%_0_21.2%_-1.27%]"}`} id={is27 ? "node-2_8141" : "node-2_7996"} data-name="Group">
              {is26 && <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgGroup} />}
              {is27 && (
                <div className="absolute inset-[-0.18%_0]">
                  <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgGroup6} />
                </div>
              )}
            </div>
            {is26 && (
              <div className="absolute inset-[3.21%_0_21.2%_-1.27%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8005" data-name="Group">
                <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgGroup1} />
              </div>
            )}
          </div>
          <div className={`absolute contents ${is27 ? "inset-[9.16%_4.05%_14.25%_9.8%]" : "inset-[5.67%_2.63%_21.2%_4.29%]"}`} id={is27 ? "node-2_8151" : "node-2_8040"} data-name="Group">
            <div className={`absolute ${is27 ? "contents inset-[9.16%_4.05%_14.25%_9.8%]" : String.raw`inset-[6.44%_2.93%_21.2%_4.59%] opacity-[var(--opacity\/100,1)]`}`} id={is27 ? "node-2_8152" : "node-2_8041"} data-name="Group">
              {is26 && (
                <div className="absolute inset-[-0.36%_0_0_0]">
                  <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgGroup2} />
                </div>
              )}
              {is27 && (
                <div className="absolute contents inset-[9.16%_4.05%_14.25%_9.8%]" data-node-id="2:8153" data-name="Group">
                  <div className="absolute contents inset-[33.58%_65.49%_14.25%_9.8%]" data-node-id="2:8154" data-name="Group">
                    <div className="absolute inset-[33.58%_65.49%_16.72%_9.8%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8155" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector1} />
                    </div>
                    <div className="absolute inset-[33.58%_65.49%_16.57%_9.8%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8156" data-name="Vector">
                      <div className="absolute inset-[-0.29%_-0.4%_0_-0.4%]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector2} />
                      </div>
                    </div>
                    <div className="absolute inset-[83.43%_65.49%_16.57%_9.8%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8157" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector3} />
                    </div>
                    <div className="absolute inset-[83.43%_90.2%_14.25%_9.8%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8158" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector4} />
                    </div>
                    <div className="absolute inset-[83.43%_65.49%_14.25%_34.51%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8159" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector4} />
                    </div>
                    <div className="absolute inset-[33.58%_82.35%_58.87%_9.8%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8160" data-name="Vector">
                      <div className="absolute inset-[-1.92%_-1.25%]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector5} />
                      </div>
                    </div>
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[35.32%_84.06%_60.56%_10.98%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/11_86,11.859px)] whitespace-nowrap" data-node-id="2:8161">
                      49%
                    </p>
                  </div>
                  <div className="absolute contents inset-[32.56%_34.77%_14.25%_40.52%]" data-node-id="2:8162" data-name="Group">
                    <div className="absolute inset-[32.56%_34.77%_16.72%_40.52%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8163" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector6} />
                    </div>
                    <div className="absolute inset-[32.56%_34.77%_16.57%_40.52%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8164" data-name="Vector">
                      <div className="absolute inset-[-0.29%_-0.4%_0_-0.4%]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector7} />
                      </div>
                    </div>
                    <div className="absolute inset-[83.43%_34.77%_16.57%_40.52%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8165" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector8} />
                    </div>
                    <div className="absolute inset-[83.43%_34.77%_14.25%_65.23%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8166" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector4} />
                    </div>
                    <div className="absolute inset-[32.56%_51.63%_59.88%_40.52%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8167" data-name="Vector">
                      <div className="absolute inset-[-1.92%_-1.25%]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector5} />
                      </div>
                    </div>
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[34.3%_53.34%_61.58%_41.7%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-60\%,rgba(0,0,0,0.6))] text-[length:var(--font-size\/11_86,11.859px)] whitespace-nowrap" data-node-id="2:8168">
                      50%
                    </p>
                  </div>
                  <div className="absolute contents inset-[9.16%_4.05%_14.25%_71.24%]" data-node-id="2:8169" data-name="Group">
                    <div className="absolute inset-[9.16%_4.05%_16.72%_71.24%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8170" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector9} />
                    </div>
                    <div className="absolute inset-[9.16%_4.05%_16.57%_71.24%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8171" data-name="Vector">
                      <div className="absolute inset-[-0.2%_-0.4%_0_-0.4%]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector10} />
                      </div>
                    </div>
                    <div className="absolute inset-[83.43%_4.05%_16.57%_71.24%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8172" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector3} />
                    </div>
                    <div className="absolute inset-[83.43%_4.05%_14.25%_95.95%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8173" data-name="Vector">
                      <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector4} />
                    </div>
                    <div className="absolute inset-[9.16%_20.92%_83.28%_71.24%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8174" data-name="Vector">
                      <div className="absolute inset-[-1.92%_-1.25%]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector11} />
                      </div>
                    </div>
                    <p className="absolute font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] inset-[10.91%_22.82%_84.98%_72.42%] leading-[normal] not-italic opacity-[var(--opacity\/100,1)] text-[color:var(--color\/black\/-80\%,rgba(0,0,0,0.8))] text-[length:var(--font-size\/11_86,11.859px)] whitespace-nowrap" data-node-id="2:8175">
                      73%
                    </p>
                  </div>
                </div>
              )}
            </div>
            {is26 && (
              <div className="absolute inset-[5.67%_2.63%_45.27%_4.29%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8044" data-name="Group">
                <div className="absolute inset-[-0.26%_0]">
                  <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgGroup3} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {is26 && (
        <>
          <div className="absolute contents inset-[6.44%_2.93%_21.2%_4.59%]" data-node-id="2:8077" data-name="Group">
            <div className="absolute inset-[6.44%_2.93%_21.2%_4.59%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8078" data-name="Group">
              <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgGroup4} />
            </div>
          </div>
          <div className="absolute contents inset-[6.44%_2.93%_21.2%_4.59%]" data-node-id="2:8081" data-name="Group">
            <div className="absolute inset-[6.44%_2.93%_21.2%_4.59%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8082" data-name="Group">
              <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgGroup5} />
            </div>
          </div>
        </>
      )}
      {is29 && (
        <div className="absolute flex inset-[32.9%_17.52%_17.52%_34.62%] items-center justify-center" style={{ containerType: "size" }}>
          <div className="flex-none h-[hypot(-35.7233cqw,-31.0261cqh)] rotate-[131.98deg] w-[hypot(-64.2767cqw,68.9739cqh)]">
            <div className="opacity-[var(--opacity\/100,1)] relative size-full" data-node-id="2:8198" data-name="Vector">
              <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgVector12} />
            </div>
          </div>
        </div>
      )}
      {is30 && (
        <div className="absolute contents inset-0" data-node-id="2:8211" data-name="Clip path group">
          <div className="absolute contents inset-0" data-node-id="2:8203" data-name="Group">
            <div className="absolute contents inset-0" data-node-id="2:8208" data-name="Mask group">
              <div className="absolute inset-[0_0_-0.12%_0] mask-position-[0px_0px,_0px_0px] opacity-[var(--opacity\/100,1)]" data-node-id="2:8204" style={{ maskImage: `url('${PerfImgGroup7}'), url('${PerfImgGroup8}')` }} data-name="Group">
                <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={PerfImgGroup9} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function PerfComponent7({ className, hover = false, variant = "1" }) {
  return (
    <div className={className || "content-stretch flex items-center justify-center relative"} data-node-id="2:18340">
      <div className="relative shrink-0 size-[25px]" data-node-id="2:18341" data-name="svg" />
    </div>
  );
}


function PerfComponent6({ className, hover = false, variant = "1" }) {
  return (
    <div className={className || "content-stretch flex items-center justify-center relative"} data-node-id="2:18336">
      <div className="relative shrink-0 size-[25px]" data-node-id="2:18337" data-name="svg.duration-400" />
    </div>
  );
}


function PerfComponent5({ className, hover = false, variant = "1" }) {
  return (
    <div className={className || "content-stretch flex items-center justify-center relative"} data-node-id="2:18332">
      <div className="relative shrink-0 size-[24px]" data-node-id="2:18333" data-name="div.relative" />
    </div>
  );
}


function PerfComponent4({ className, hover = false, variant = "1" }) {
  return (
    <div className={className || "content-stretch flex items-center justify-center relative"} data-node-id="2:18328">
      <div className="relative shrink-0 size-[25px]" data-node-id="2:18329" data-name="svg" />
    </div>
  );
}

function PerfSection() {
  return (
    <div className="bg-[var(--color\/grey\/95,#f6f6f1)] content-stretch flex flex-col gap-[var(--item-spacing\/m,32px)] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:19122" data-name="section#performance">
      <div className="border-[var(--color\/grey\/76,#c5c5c1)] border-b-[length:var(--stroke-weight\/1,1px)] border-solid content-stretch flex gap-[var(--line-height\/16,16px)] items-center pb-[13px] pt-[8px] relative shrink-0 w-full" data-node-id="2:19123" data-name="span.font-mono">
        <div className="bg-[var(--color\/orange\/50,#ff5600)] relative shrink-0 size-[6px]" data-node-id="2:19124" data-name="::before" />
        <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[10.5px] text-[color:var(--color\/black\/solid,black)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19125">
          <p className="leading-[var(--line-height\/14,14px)]">Unrivaled Performance</p>
        </div>
      </div>
      <div className="content-stretch flex flex-col gap-[var(--item-spacing\/64,64px)] items-start relative shrink-0 w-full" data-node-id="2:19126" data-name="div">
        <div className="content-stretch flex gap-[var(--item-spacing\/168_98,0px)] items-end justify-between pr-[0.01px] relative shrink-0 w-full" data-node-id="2:19127" data-name="h3.text-current">
          <div className="content-stretch flex flex-col items-start max-w-[544.7520141601562px] pr-[10.1px] relative shrink-0" data-node-id="2:19129" data-name="span.block">
            <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Light',sans-serif)] font-[var(--font-weight\/300,300)] justify-center leading-[0] not-italic relative shrink-0 text-[71.4px] text-[color:var(--color\/black\/solid,black)] tracking-[var(--letter-spacing\/-3_01,-3.008px)] whitespace-nowrap" data-node-id="2:19131">
              <p className="leading-[var(--line-height\/72,72px)] mb-0">Clain outperforms</p>
              <p className="leading-[var(--line-height\/72,72px)]">every competitor.</p>
            </div>
          </div>
          <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2:19133" data-name="span.block">
            <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Light',sans-serif)] font-[var(--font-weight\/300,300)] justify-center leading-[0] not-italic relative shrink-0 text-[color:var(--color\/black\/solid,black)] text-[length:var(--line-height\/72,72px)] tracking-[var(--letter-spacing\/-3_01,-3.008px)] whitespace-nowrap" data-node-id="2:19134">
              <p className="leading-[var(--line-height\/72,72px)]">Every time.</p>
            </div>
          </div>
        </div>
        <div className="content-stretch flex flex-col gap-[var(--line-height\/16,16px)] items-start relative shrink-0 w-full" data-node-id="2:19136" data-name="div.flex">
          <div className="content-stretch flex flex-col items-start pb-[12px] relative shrink-0 w-full" data-node-id="2:19137" data-name="div.mb-8:margin">
            <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2:19138" data-name="div.mb-8">
              <div className="content-stretch flex flex-col items-start pb-[12px] relative shrink-0 w-full" data-node-id="2:19139" data-name="span.text-current:margin">
                <div className="content-stretch flex items-start px-[12px] relative shrink-0 w-full" data-node-id="2:19140" data-name="span.text-current">
                  <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-node-id="2:19141" data-name="span.block">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[color:var(--color\/black\/solid,black)] text-[length:var(--font-size\/11,11px)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19142">
                      <p className="leading-[var(--line-height\/14,14px)]">{`Fig 2.A - `}</p>
                    </div>
                  </div>
                  <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-w-px relative self-stretch" data-node-id="2:19143" data-name="span.flex-1">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[10.7px] text-[color:var(--color\/black\/solid,black)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase w-full" data-node-id="2:19144">
                      <p className="leading-[var(--line-height\/14,14px)]">Clain’s average resolution rate increases 1% every month</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-solid content-stretch flex items-start justify-center p-[17px] relative shrink-0 w-full" data-node-id="2:19145" data-name="div.relative">
                <div className="absolute bottom-[-50px] flex h-[48px] items-center justify-center right-[-0.98px] w-px">
                  <div className="flex-none rotate-180">
                    <div className="h-[48px] relative w-px" data-node-id="2:19148" data-name="span.border:mask-group">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                        <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] bottom-0 h-[48px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] right-0 w-px" data-node-id="2:19150" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-[-50px] flex h-[48px] items-center justify-center left-[-1px] w-px">
                  <div className="flex-none rotate-180">
                    <div className="h-[48px] relative w-px" data-node-id="2:19151" data-name="span.border:mask-group">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                        <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] bottom-0 h-[48px] left-0 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] w-px" data-node-id="2:19153" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute h-[48px] left-[-1px] top-[-50px] w-px" data-node-id="2:19154" data-name="span.border:mask-group">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                    <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] h-[48px] left-0 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] top-0 w-px" data-node-id="2:19156" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                  </div>
                </div>
                <div className="absolute h-[48px] right-[-0.98px] top-[-50px] w-px" data-node-id="2:19157" data-name="span.border:mask-group">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                    <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-l-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] h-[48px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] right-0 top-0 w-px" data-node-id="2:19159" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                  </div>
                </div>
                <div className="flex-[1_0_0] h-[384px] min-w-px relative" data-node-id="2:19160" data-name="div.hidden">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                    <PerfComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-[1012px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="gap-x-[12px] gap-y-[12px] grid grid-cols-[__minmax(0,2fr)_minmax(0,1fr)] grid-rows-[__14px_minmax(0,1fr)] h-[520.34px] py-[40px] relative shrink-0 w-full" data-node-id="2:19373" data-name="div.grid">
            <div className="col-1 content-stretch flex flex-col gap-[var(--font-size\/12,12px)] items-start justify-center justify-self-stretch relative row-[1/span_2] self-start shrink-0" data-node-id="2:19374" data-name="div.relative">
              <div className="content-stretch flex flex-col h-[14px] items-start relative shrink-0 w-full" data-node-id="2:19375" data-name="div">
                <div className="content-stretch flex items-start px-[12px] relative shrink-0 w-full" data-node-id="2:19376" data-name="span.text-current">
                  <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-node-id="2:19377" data-name="span.block">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[color:var(--color\/black\/solid,black)] text-[length:var(--font-size\/11,11px)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19378">
                      <p className="leading-[var(--line-height\/14,14px)]">{`Fig 2.B - `}</p>
                    </div>
                  </div>
                  <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-w-px relative self-stretch" data-node-id="2:19379" data-name="span.flex-1">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[10.7px] text-[color:var(--color\/black\/solid,black)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase w-full" data-node-id="2:19380">
                      <p className="leading-[var(--line-height\/14,14px)]">Clain wins every head-to-head test ON RESOLUTION RATE</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-solid content-stretch flex h-[414.34px] items-center pb-[21.17px] pl-[17px] pr-px pt-[53.17px] relative shrink-0 w-full" data-node-id="2:19381" data-name="div.relative">
                <div className="absolute bottom-[-50.01px] flex h-[48px] items-center justify-center right-[-0.98px] w-px">
                  <div className="flex-none rotate-180">
                    <div className="h-[48px] relative w-px" data-node-id="2:19382" data-name="span.border:mask-group">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                        <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] bottom-0 h-[48px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] right-0 w-px" data-node-id="2:19384" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-[-50.01px] flex h-[48px] items-center justify-center left-[-1px] w-px">
                  <div className="flex-none rotate-180">
                    <div className="h-[48px] relative w-px" data-node-id="2:19385" data-name="span.border:mask-group">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                        <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] bottom-0 h-[48px] left-0 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] w-px" data-node-id="2:19387" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute h-[48px] left-[-1px] top-[-50px] w-px" data-node-id="2:19388" data-name="span.border:mask-group">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                    <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] h-[48px] left-0 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] top-0 w-px" data-node-id="2:19390" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                  </div>
                </div>
                <div className="absolute h-[48px] right-[-0.98px] top-[-50px] w-px" data-node-id="2:19391" data-name="span.border:mask-group">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                    <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-l-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] h-[48px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] right-0 top-0 w-px" data-node-id="2:19393" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                  </div>
                </div>
                <div className="h-[340px] relative shrink-0 w-[679.77px]" data-node-id="2:19394" data-name="div.mt-8">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid grid grid-cols-[repeat(12,minmax(0,1fr))] grid-rows-[_340px] relative size-full">
                    <div className="col-[1/span_9] content-stretch flex flex-col items-start justify-center relative row-1 self-start shrink-0 w-[509.81px]" data-node-id="2:19395" data-name="div.col-span-12">
                      <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2:19396" data-name="div.h-full">
                        <div className="content-stretch flex flex-col h-[340px] items-start justify-center min-h-[200px] relative shrink-0 w-full" data-node-id="2:19397" data-name="div.recharts-responsive-container">
                          <PerfComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="27" />
                        </div>
                      </div>
                    </div>
                    <div className="col-[10/span_3] content-stretch flex flex-col items-start justify-self-start pl-[8px] relative row-1 self-start shrink-0" data-node-id="2:19462" data-name="div.col-span-10:margin">
                      <div className="content-stretch flex flex-col items-start pb-[268px] relative shrink-0" data-node-id="2:19463" data-name="div.col-span-10">
                        <div className="content-stretch flex flex-col items-start pr-[16px] relative shrink-0 w-full" data-node-id="2:19464" data-name="p.font-sans">
                          <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[12.9px] text-[color:var(--color\/grey\/38,#626260)] tracking-[var(--stroke-weight\/0_5,0.499px)] whitespace-nowrap" data-node-id="2:19465">
                            <p className="leading-[var(--font-size\/18,18px)] mb-0">Resolution rate based</p>
                            <p className="leading-[var(--font-size\/18,18px)] mb-0">on independent</p>
                            <p className="leading-[var(--font-size\/18,18px)] mb-0">testing conducted by</p>
                            <p className="leading-[var(--font-size\/18,18px)]">Clain customers.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-2 content-stretch flex flex-col gap-[var(--font-size\/12,12px)] items-start justify-center justify-self-stretch relative row-[1/span_2] self-start shrink-0" data-node-id="2:19467" data-name="div.relative">
              <div className="content-stretch flex flex-col h-[14px] items-start relative shrink-0 w-full" data-node-id="2:19468" data-name="div">
                <div className="content-stretch flex gap-[var(--item-spacing\/0_01,0.01px)] items-start px-[12px] relative shrink-0 w-full" data-node-id="2:19469" data-name="span.text-current">
                  <div className="content-stretch flex flex-col items-start relative self-stretch shrink-0" data-node-id="2:19471" data-name="span.block">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[color:var(--color\/black\/solid,black)] text-[length:var(--font-size\/11,11px)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19472">
                      <p className="leading-[var(--line-height\/14,14px)]">{`Fig 2.C - `}</p>
                    </div>
                  </div>
                  <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-w-px relative self-stretch" data-node-id="2:19473" data-name="span.flex-1">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[10.3px] text-[color:var(--color\/black\/solid,black)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase w-full" data-node-id="2:19474">
                      <p className="leading-[var(--line-height\/14,14px)]">Fintech Customer</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-solid content-stretch flex flex-col h-[414.34px] isolate items-start justify-between p-[17px] relative shrink-0 w-full" data-node-id="2:19475" data-name="div.relative">
                <div className="h-[101px] relative shrink-0 w-[85px] z-[7]" data-node-id="2:19476" data-name="div.mb-4:margin">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start pb-[16px] relative size-full">
                    <div className="content-stretch flex items-start justify-center overflow-clip relative shrink-0" data-node-id="2:19477" data-name="div.overflow-hidden">
                      <div className="max-w-[85px] relative shrink-0 size-[85px]" data-node-id="2:19478" data-name="A headshot of Angelo Livanos, Senior Director at Lightspeed">
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none size-full top-0" src={PerfImgAHeadshotOfAngeloLivanosSeniorDirectorAtLightspeed} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-[0.04px] left-[-12px] top-0 w-[10.78px] z-[6]" data-node-id="2:19480" data-name="Component 1">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid overflow-clip relative rounded-[inherit] size-full">
                    <div className="absolute inset-[85.53%_0_0.35%_0] opacity-[var(--opacity\/100,1)]" data-node-id="I2:19480;2:8189" data-name="Vector">
                      <div className="absolute inset-[-0.93%_0]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector16} />
                      </div>
                    </div>
                    <div className="absolute inset-[56.51%_0_29.37%_0] opacity-[var(--opacity\/100,1)]" data-node-id="I2:19480;2:8190" data-name="Vector">
                      <div className="absolute inset-[-0.93%_0]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector17} />
                      </div>
                    </div>
                    <div className="absolute inset-[28.01%_0_57.87%_0] opacity-[var(--opacity\/100,1)]" data-node-id="I2:19480;2:8191" data-name="Vector">
                      <div className="absolute inset-[-0.93%_0]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector16} />
                      </div>
                    </div>
                    <div className="absolute inset-[0.29%_0_86.37%_0] opacity-[var(--opacity\/100,1)]" data-node-id="I2:19480;2:8192" data-name="Vector">
                      <div className="absolute inset-[-0.98%_0]">
                        <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={PerfImgVector18} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute h-[48px] right-[-0.99px] top-[-50px] w-px z-[5]" data-node-id="2:19485" data-name="span.border:mask-group">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                    <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-l-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] h-[48px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] right-0 top-0 w-px" data-node-id="2:19487" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                  </div>
                </div>
                <div className="absolute h-[48px] left-[-1px] top-[-50px] w-px z-[4]" data-node-id="2:19488" data-name="span.border:mask-group">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                    <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] h-[48px] left-0 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] top-0 w-px" data-node-id="2:19490" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                  </div>
                </div>
                <div className="absolute bottom-[-50.01px] flex h-[48px] items-center justify-center left-[-1px] w-px z-[3]">
                  <div className="flex-none rotate-180">
                    <div className="h-[48px] relative w-px" data-node-id="2:19491" data-name="span.border:mask-group">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                        <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] bottom-0 h-[48px] left-0 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] w-px" data-node-id="2:19493" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-[-50.01px] flex h-[48px] items-center justify-center right-[-0.99px] w-px z-[2]">
                  <div className="flex-none rotate-180">
                    <div className="h-[48px] relative w-px" data-node-id="2:19494" data-name="span.border:mask-group">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                        <div className="absolute border-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] border-b-[length:var(--stroke-weight\/1,1px)] border-dashed border-r-[length:var(--stroke-weight\/1,1px)] border-t-[length:var(--stroke-weight\/1,1px)] bottom-0 h-[48px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[1px_48px] right-0 w-px" data-node-id="2:19496" style={{ maskImage: `url('${PerfImgSpanBorder}')` }} data-name="span.border" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative shrink-0 w-full z-[1]" data-node-id="2:19497" data-name="div">
                  <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[var(--item-spacing\/20_01,20.01px)] items-start relative size-full">
                    <div className="h-[223.34px] relative shrink-0 w-full" data-node-id="2:19499" data-name="p.text-current">
                      <div className="-translate-y-1/2 absolute flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Light',sans-serif)] font-[var(--font-weight\/300,300)] h-[128px] justify-center leading-[0] left-0 not-italic text-[21.9px] text-[color:var(--color\/black\/solid,black)] top-[63.36px] w-[252.06px]" data-node-id="2:19500">
                        <p className="leading-[var(--line-height\/31_92,31.92px)] mb-0">“Clain is in a completely</p>
                        <p className="leading-[var(--line-height\/31_92,31.92px)] mb-0">different league. It’s now</p>
                        <p className="leading-[var(--line-height\/31_92,31.92px)] mb-0">involved in 99% of</p>
                        <p className="leading-[var(--line-height\/31_92,31.92px)]">conversations and</p>
                      </div>
                      <div className="absolute bg-[var(--color\/orange\/50,#ff5600)] h-[92.81px] left-0 top-[128.63px] w-[285.38px]" data-node-id="2:19503" data-name="span.bg-orange">
                        <div className="-translate-y-1/2 absolute flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Light',sans-serif)] font-[var(--font-weight\/300,300)] h-[96px] justify-center leading-[0] left-0 not-italic text-[22.3px] text-[color:var(--color\/black\/solid,black)] top-[46.4px] w-[285.58px]" data-node-id="2:19504">
                          <p className="leading-[var(--line-height\/31_92,31.92px)] mb-0">successfully resolves up to</p>
                          <p className="leading-[var(--line-height\/31_92,31.92px)] mb-0">65% end-to-end—even the</p>
                          <p className="leading-[var(--line-height\/31_92,31.92px)]">more complex ones.</p>
                        </div>
                      </div>
                      <div className="-translate-y-1/2 absolute flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Light',sans-serif)] font-[var(--font-weight\/300,300)] h-[32px] justify-center leading-[0] left-[205.14px] not-italic text-[color:var(--color\/black\/solid,black)] text-[length:var(--line-height\/24,24px)] top-[206.94px] w-[8.47px]" data-node-id="2:19506">
                        <p className="leading-[var(--line-height\/31_92,31.92px)]">”</p>
                      </div>
                    </div>
                    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2:19508" data-name="p.font-sans">
                      <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[13px] text-[color:var(--color\/grey\/38,#626260)] tracking-[var(--stroke-weight\/0_5,0.499px)] w-full" data-node-id="2:19509">
                        <p className="leading-[var(--font-size\/18,18px)] mb-0">Angelo Livanos, Vice President of Global</p>
                        <p className="leading-[var(--font-size\/18,18px)]">Support at Lightspeed</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="content-stretch flex flex-col items-start pt-[16px] relative shrink-0 w-full" data-node-id="2:19510" data-name="div:margin">
            <div className="content-stretch flex flex-col gap-[var(--item-spacing\/8,8px)] items-start relative shrink-0 w-full" data-node-id="2:19511" data-name="div">
              <div className="bg-[var(--color\/azure\/5,#020917)] content-stretch flex flex-col items-start overflow-clip relative rounded-[6px] shrink-0 w-full" data-node-id="2:19513" data-name="div.bg-dark-blue">
                <div className="content-stretch flex flex-col items-start justify-center overflow-clip relative shrink-0 w-full" data-node-id="2:19514" data-name="div.relative">
                  <div className="content-stretch flex flex-col h-[595.48px] items-start overflow-clip relative shrink-0 w-full" data-node-id="2:19515" data-name="video player">
                    <div className="absolute bg-[var(--color\/black\/solid,black)] inset-[0_0.01px_0_0] opacity-0" data-node-id="2:19516" data-name="::before" />
                    <div className="content-stretch flex items-start justify-center overflow-clip relative rounded-[3px] shrink-0 w-full" data-node-id="2:19517" data-name="hls-video">
                      <div className="h-[595.48px] relative shrink-0 w-[1058.66px]" data-node-id="2:19518" data-name="image">
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none size-full top-0" src={PerfImgImage} />
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-[0_0.01px_0_0]" data-node-id="2:19519" data-name="span">
                      <div className="absolute content-stretch flex flex-col inset-0 items-center justify-center" data-node-id="2:19520" data-name="slot">
                        <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2:19521" data-name="media-loading-indicator">
                          <PerfComponent1 className="opacity-0 overflow-clip relative shrink-0 size-[100px]" variant="29" />
                        </div>
                      </div>
                      <div className="absolute content-stretch flex h-[595.48px] items-center justify-center left-0 overflow-clip rounded-[3px] top-0 w-[1058.66px]" data-node-id="2:19524" data-name="div.absolute">
                        <div className="flex-[1_0_0] h-[595.48px] min-w-px relative" data-node-id="2:19525" data-name="Video thumbnail">
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <img loading="lazy" decoding="async" alt="" className="absolute h-[121.91%] left-0 max-w-none top-[-10.95%] w-full" src={PerfImgVideoThumbnail} />
                          </div>
                        </div>
                      </div>
                      <div className="absolute bg-[var(--color\/black\/-20\%,rgba(0,0,0,0.2))] h-[595.48px] left-0 rounded-[3px] top-0 w-[1058.66px]" data-node-id="2:19526" data-name="button.duration-660">
                        <div className="absolute bg-[var(--color\/black\/-15\%,rgba(0,0,0,0.15))] bottom-0 left-0 rounded-[3px] top-0 w-[1058.66px]" data-node-id="2:19527" data-name="div.absolute" />
                        <div className="absolute content-stretch flex flex-col gap-[var(--item-spacing\/-1,0px)] items-start justify-between left-0 pb-[33px] pt-[32px] px-[32px] top-0 w-[1058.66px]" data-node-id="2:19530" data-name="div.absolute">
                          <div className="content-stretch flex flex-col items-start mb-[-1px] pb-[16px] relative shrink-0 w-full" data-node-id="2:19532" data-name="div.mb-2:margin">
                            <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2:19533" data-name="div.mb-2">
                              <PerfComponent1 className="h-[20px] overflow-clip relative shrink-0 w-[178.33px]" variant="30" />
                            </div>
                          </div>
                          <div className="content-stretch flex flex-col items-start mb-[-1px] pr-[44.77px] relative shrink-0" data-node-id="2:19544" data-name="p.text-current">
                            <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Light',sans-serif)] font-[var(--font-weight\/300,300)] justify-center leading-[0] not-italic relative shrink-0 text-[29.1px] text-[color:var(--color\/white\/solid,white)] tracking-[var(--letter-spacing\/-0_4,-0.4px)] whitespace-nowrap" data-node-id="2:19545">
                              <p className="leading-[var(--line-height\/35,35px)] mb-0">“If you’re debating whether to build</p>
                              <p className="leading-[var(--line-height\/35,35px)] mb-0">your own AI solution or buy one, my</p>
                              <p className="leading-[var(--line-height\/35,35px)] mb-0">advice would be to buy – and</p>
                              <p className="leading-[var(--line-height\/35,35px)]">specifically, buy Clain.”</p>
                            </div>
                          </div>
                        </div>
                        <div className="absolute backdrop-blur-[8px] bg-[var(--color\/white\/-18\%,rgba(255,255,255,0.18))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-80\%,rgba(255,255,255,0.8))] border-solid content-stretch drop-shadow-[0px_10px_42px_rgba(0,0,0,0.75)] flex h-[46px] items-center justify-center left-[483.02px] pl-[13px] pr-[17px] py-[13px] rounded-[9999px] top-[274.73px] w-[92.61px]" data-node-id="2:19548" data-name="div.absolute">
                          <div className="relative shrink-0" data-node-id="2:19551" data-name="span.font-mono">
                            <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[var(--item-spacing\/4,4px)] items-center relative size-full">
                              <PerfComponent1 className="overflow-clip relative shrink-0 size-[20px]" variant="31" />
                              <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[13.6px] text-[color:var(--color\/white\/solid,white)] text-center tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19554">
                                <p className="leading-[var(--line-height\/16,16px)]">Play</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="absolute bottom-[-49px] content-stretch flex gap-[var(--font-size\/12,0px)] items-center justify-between left-0 pl-[12px] pr-[12.01px] py-[12px] right-0 rounded-[3px]" data-node-id="2:19556" data-name="media-control-bar">
                        <div className="-translate-y-1/2 absolute bg-gradient-to-t from-[var(--color\/black\/-75\%,rgba(0,0,0,0.75))] h-[69px] left-0 opacity-[var(--opacity\/75,0.75)] to-[var(--color\/black\/-0\%,rgba(0,0,0,0))] top-[calc(50%-10px)] via-1/2 via-[var(--color\/black\/-35\%,rgba(0,0,0,0.35))] w-[1058.66px]" data-node-id="2:19557" data-name="div.absolute" />
                        <PerfComponent4 className="content-stretch flex items-center justify-center relative shrink-0" />
                        <PerfComponent5 className="content-stretch flex items-center justify-center relative shrink-0" />
                        <div className="h-[24px] relative shrink-0 w-[73.69px]" data-node-id="2:19565" data-name="playback time" />
                        <div className="content-stretch flex h-[0.01px] items-center justify-center relative shrink-0 w-[801.97px]" data-node-id="2:19566" data-name="media-time-range">
                          <div className="flex-[1_0_0] h-full min-w-[40px] relative" data-node-id="2:19567" data-name="div#container">
                            <div className="absolute bottom-[-5px] content-stretch flex flex-col h-[20px] items-start left-0 right-0" data-node-id="2:19569" data-name="seek">
                              <div className="content-stretch flex items-center justify-center pb-[9.96px] pt-[9.95px] relative shrink-0 w-full" data-node-id="2:19570" data-name="div">
                                <div className="flex-[1_0_0] h-[0.09px] min-w-px relative" data-node-id="2:19571" data-name="div#track" />
                              </div>
                            </div>
                          </div>
                        </div>
                        <PerfComponent6 className="content-stretch flex items-center justify-center relative shrink-0" />
                        <PerfComponent7 className="content-stretch flex items-center justify-center relative shrink-0" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex gap-[var(--font-size\/12,12px)] items-start justify-center overflow-auto py-[4px] relative shrink-0 w-full" data-node-id="2:19576" data-name="div.no-scrollbar">
                <div className="bg-[var(--color\/black\/-10\%,rgba(0,0,0,0.1))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/black\/solid,black)] border-solid content-stretch flex gap-[var(--font-size\/12,12px)] items-center min-w-[322px] p-[11px] relative rounded-[6px] shrink-0 w-[344.88px]" data-node-id="2:19577" data-name="button.w-full">
                  <div className="bg-[var(--color\/azure\/13,#161e2e)] h-[80.25px] relative rounded-[4px] shrink-0 w-[107px]" data-node-id="2:19580" data-name="div.relative">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center overflow-clip relative rounded-[inherit] size-full">
                      <div className="content-stretch flex flex-[1_0_0] flex-col h-full items-start min-w-px overflow-clip relative" data-node-id="2:19583" data-name="div.overflow-hidden">
                        <div className="flex-[1_0_0] min-h-px relative w-[107px]" data-node-id="2:19584" data-name="Build vs. buy: Why Anthropic chose Clain">
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <img loading="lazy" decoding="async" alt="" className="absolute h-full left-[-4.69%] max-w-none top-0 w-[109.37%]" src={PerfImgVideoThumbnail} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-[67.88px] relative shrink-0 w-[203.88px]" data-node-id="2:19585" data-name="div.grid">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid grid grid-cols-[_203.88px] grid-rows-[__20px_47.88px] relative size-full">
                      <div className="col-1 content-stretch flex flex-col items-start justify-self-start pb-[4px] pr-[95.49px] relative row-1 self-start shrink-0" data-node-id="2:19586" data-name="span.font-mono:margin">
                        <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[13.3px] text-[color:var(--color\/grey\/38,#626260)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19587">
                          <p className="leading-[var(--line-height\/16,16px)]">Now Playing</p>
                        </div>
                      </div>
                      <div className="col-1 h-[47.88px] overflow-clip relative row-2 shrink-0 w-[203.88px]" data-node-id="2:19589" data-name="span.font-sans">
                        <div className="-translate-y-1/2 absolute flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] h-[48px] justify-center leading-[0] left-0 not-italic text-[16.7px] text-[color:var(--color\/black\/solid,black)] top-[22.97px] w-[157.53px]" data-node-id="2:19590">
                          <p className="leading-[var(--line-height\/23_94,23.94px)] mb-0">Build vs. buy: Why</p>
                          <p className="leading-[var(--line-height\/23_94,23.94px)]">Anthropic chose Clain</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bg-[var(--color\/black\/solid,black)] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/black\/solid,black)] border-solid h-[20px] right-[10.01px] rounded-[6px] top-[10px] w-[24px]" data-node-id="2:19592" data-name="div.border-content-primary">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start justify-center px-px py-[2px] relative size-full">
                      <PerfComponent1 className="h-full relative shrink-0 w-[16px]" variant="32" />
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/grey\/48,#7b7b78)] border-solid content-stretch flex gap-[var(--font-size\/12,12px)] items-center min-w-[322px] p-[11px] relative rounded-[6px] shrink-0 w-[344.89px]" data-node-id="2:19595" data-name="button.w-full">
                  <div className="bg-[var(--color\/azure\/13,#161e2e)] h-[80.25px] relative rounded-[4px] shrink-0 w-[107px]" data-node-id="2:19596" data-name="div.relative">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center overflow-clip relative rounded-[inherit] size-full">
                      <div className="content-stretch flex flex-[1_0_0] flex-col h-full items-start min-w-px overflow-clip relative" data-node-id="2:19597" data-name="div.overflow-hidden">
                        <div className="flex-[1_0_0] min-h-px relative w-[107px]" data-node-id="2:19598" data-name="AI at enterprise scale: Why Lightspeed chose Clain">
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <img loading="lazy" decoding="async" alt="" className="absolute h-full left-[-4.7%] max-w-none top-0 w-[109.4%]" src={PerfImgAiAtEnterpriseScaleWhyLightspeedChoseFin} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-[67.88px] relative shrink-0 w-[203.89px]" data-node-id="2:19599" data-name="div.grid">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid grid grid-cols-[_203.89px] grid-rows-[__20px_47.88px] relative size-full">
                      <div className="col-1 content-stretch flex flex-col items-start justify-self-start pb-[4px] pr-[118.53px] relative row-1 self-start shrink-0" data-node-id="2:19600" data-name="span.font-mono:margin">
                        <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[13.5px] text-[color:var(--color\/grey\/38,#626260)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19601">
                          <p className="leading-[var(--line-height\/16,16px)]">Play Next</p>
                        </div>
                      </div>
                      <div className="col-1 h-[47.88px] overflow-clip relative row-2 shrink-0 w-[203.89px]" data-node-id="2:19603" data-name="span.font-sans">
                        <div className="-translate-y-1/2 absolute flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] h-[48px] justify-center leading-[0] left-0 not-italic text-[16.9px] text-[color:var(--color\/black\/solid,black)] top-[22.97px] w-[182.75px]" data-node-id="2:19604">
                          <p className="leading-[var(--line-height\/23_94,23.94px)] mb-0">AI at enterprise scale:</p>
                          <p className="leading-[var(--line-height\/23_94,23.94px)]">Why Lightspeed chose</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/black\/solid,black)] border-solid h-[20px] right-[10px] rounded-[6px] top-[10px] w-[24px]" data-node-id="2:19606" data-name="div.border-content-primary">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start justify-center px-px py-[2px] relative size-full">
                      <PerfComponent1 className="h-full relative shrink-0 w-[16px]" variant="33" />
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/grey\/48,#7b7b78)] border-solid content-stretch flex gap-[var(--font-size\/12,12px)] items-center min-w-[322px] p-[11px] relative rounded-[6px] shrink-0 w-[344.89px]" data-node-id="2:19609" data-name="button.w-full">
                  <div className="bg-[var(--color\/azure\/13,#161e2e)] h-[80.25px] relative rounded-[4px] shrink-0 w-[107px]" data-node-id="2:19610" data-name="div.relative">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center overflow-clip relative rounded-[inherit] size-full">
                      <div className="content-stretch flex flex-[1_0_0] flex-col h-full items-start min-w-px overflow-clip relative" data-node-id="2:19611" data-name="div.overflow-hidden">
                        <div className="flex-[1_0_0] min-h-px relative w-[107px]" data-node-id="2:19612" data-name="How Rocket Money operationalized AI">
                          <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <img loading="lazy" decoding="async" alt="" className="absolute h-full left-[-4.7%] max-w-none top-0 w-[109.4%]" src={PerfImgHowRocketMoneyOperationalizedAi} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-[67.88px] relative shrink-0 w-[203.89px]" data-node-id="2:19613" data-name="div.grid">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid grid grid-cols-[_203.89px] grid-rows-[__20px_47.88px] relative size-full">
                      <div className="col-1 content-stretch flex flex-col items-start justify-self-start pb-[4px] pr-[118.53px] relative row-1 self-start shrink-0" data-node-id="2:19614" data-name="span.font-mono:margin">
                        <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[13.5px] text-[color:var(--color\/grey\/38,#626260)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19615">
                          <p className="leading-[var(--line-height\/16,16px)]">Play Next</p>
                        </div>
                      </div>
                      <div className="col-1 h-[47.88px] overflow-clip relative row-2 shrink-0 w-[203.89px]" data-node-id="2:19616" data-name="span.font-sans">
                        <div className="-translate-y-1/2 absolute flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] h-[48px] justify-center leading-[0] left-0 not-italic text-[17px] text-[color:var(--color\/black\/solid,black)] top-[22.97px] w-[156.34px]" data-node-id="2:19617">
                          <p className="leading-[var(--line-height\/23_94,23.94px)] mb-0">How Rocket Money</p>
                          <p className="leading-[var(--line-height\/23_94,23.94px)]">operationalized AI</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/black\/solid,black)] border-solid h-[20px] right-[10px] rounded-[6px] top-[10px] w-[24px]" data-node-id="2:19618" data-name="div.border-content-primary">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-start justify-center px-px py-[2px] relative size-full">
                      <PerfComponent1 className="h-full relative shrink-0 w-[16px]" variant="34" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute border-[var(--color\/grey\/76,#c5c5c1)] border-l-[length:var(--stroke-weight\/1,1px)] border-solid border-t-[length:var(--stroke-weight\/1,1px)] left-[8px] size-[24px] top-[8px]" data-node-id="2:19621" data-name="span.border-border-decorative" />
      <div className="absolute border-[var(--color\/grey\/76,#c5c5c1)] border-r-[length:var(--stroke-weight\/1,1px)] border-solid border-t-[length:var(--stroke-weight\/1,1px)] right-[8.02px] size-[24px] top-[8px]" data-node-id="2:19622" data-name="span.border-border-decorative" />
      <div className="absolute border-[var(--color\/grey\/76,#c5c5c1)] border-b-[length:var(--stroke-weight\/1,1px)] border-l-[length:var(--stroke-weight\/1,1px)] border-solid bottom-[8px] left-[8px] size-[24px]" data-node-id="2:19623" data-name="span.border-border-decorative" />
      <div className="absolute border-[var(--color\/grey\/76,#c5c5c1)] border-b-[length:var(--stroke-weight\/1,1px)] border-r-[length:var(--stroke-weight\/1,1px)] border-solid bottom-[8px] right-[8.02px] size-[24px]" data-node-id="2:19624" data-name="span.border-border-decorative" />
    </div>
  );
}

  /* ═══ INTEGRATIONS SECTION (Figma 2:19625) ═══ */
  const IntegImgVector = "/v2/assets/df9c03df-830c-46b3-8a7b-80a86edb77aa.svg";
  const IntegImgVector1 = "/v2/assets/866a0c7e-434b-4905-b48a-033b0e85bca1.svg";
  const IntegImgVector2 = "/v2/assets/3a0ec74c-f137-40ed-aca7-98704d6b0d58.svg";
  const IntegImgVector3 = "/v2/assets/632e811a-cb9b-4f3c-904f-99d1b920938c.svg";
  const IntegImgVector4 = "/v2/assets/0883d8ee-c068-45e4-9be2-06e50e155a07.svg";
  const IntegImgVector5 = "/v2/assets/b28de84a-a9a8-4ec2-a4f4-49c7862b4a6b.svg";
  const IntegImgVector6 = "/v2/assets/df15016c-e410-4b92-92e3-81dce7eed298.svg";
  const IntegImgVector7 = "/v2/assets/ee141a78-2212-4c0e-8f16-a4e9ff6bd7d7.svg";
  const IntegImgVector8 = "/v2/assets/a4cbf057-3496-4024-a2cf-f5addfa98219.svg";
  const IntegImgVector9 = "/v2/assets/71f273e4-4219-4d1e-a31e-17755acc8263.svg";
  const IntegImgVector10 = "/v2/assets/ecda679e-73e3-45ce-a25d-b5692445afec.svg";
  const IntegImgVector11 = "/v2/assets/09d22d1f-97c9-4e7d-bbdd-3e83b1dd6af1.svg";
  const IntegImgVector12 = "/v2/assets/5948a617-7ad0-4957-a52a-2bbd6cfb5297.svg";
  const IntegImgVector13 = "/v2/assets/557d366a-92cf-4d79-b924-d6b00e21adea.svg";
  const IntegImgVector14 = "/v2/assets/8edc2cf9-393b-4ff2-be6d-7f4b99ba0643.svg";
  const IntegImgVector15 = "/v2/assets/c8935b63-b104-44ca-9e61-6173e62d9896.svg";
  const IntegImgVector16 = "/v2/assets/809ba4e0-800a-4bd6-abf3-fd9b5356a670.svg";
  const IntegImgVector17 = "/v2/assets/9e8edf67-0d83-4bf1-a8d3-d7f612e11b11.svg";
  const IntegImgVector18 = "/v2/assets/fd3f6e40-0df0-4448-b40c-2cfebce0ac88.svg";
  const IntegImgVector19 = "/v2/assets/e73bdb6e-d002-409d-a4cf-a181ea3f400f.svg";
  const IntegImgVector20 = "/v2/assets/6d40f804-1b14-4c3a-acef-4b5776d890dc.svg";
  const IntegImgVector21 = "/v2/assets/b17b8977-71d1-4d24-ba9d-193ea9deb359.svg";
  const IntegImgVector22 = "/v2/assets/25990408-af0e-406c-85b9-d5c6112dce69.svg";
  const IntegImgVector23 = "/v2/assets/425f1cbb-ffeb-4ded-baee-830eb88b88b8.svg";
  const IntegImgVector24 = "/v2/assets/ec8d501e-376e-4d60-bc18-51a63e329de1.svg";
  const IntegImgVector25 = "/v2/assets/64aabd1a-f5b5-4a52-831d-b5f0832e2e06.svg";
  const IntegImgVector26 = "/v2/assets/a7cba048-7c59-4bfa-a7ba-77b7ef4c7c88.svg";
  const IntegImgVector27 = "/v2/assets/3ea8d9a9-c134-4e97-80dc-886584499740.svg";
  const IntegImgVector28 = "/v2/assets/9e038c71-73c7-4a24-a79d-99310ae8b232.svg";
  const IntegImgVector29 = "/v2/assets/01787809-919c-450d-96a1-9503fa166c91.svg";
  const IntegImgVector30 = "/v2/assets/8ead377c-3c6f-4d74-af11-938dae107d58.svg";
  const IntegImgVector31 = "/v2/assets/4713dbbe-6273-4e21-904b-fb4ff9a66cc9.svg";
  const IntegImgDivRelative = "/v2/assets/65a821d2-8bc1-401c-9267-368a9daa2cfa.svg";
  const IntegImgVector32 = "/v2/assets/4ca20428-13bd-4f57-935d-cd25c7596bf5.svg";
  const IntegImgVector33 = "/v2/assets/8c9773c7-6ae0-4873-a811-2986b0543d23.svg";
  const IntegImgVector34 = "/v2/assets/e8921259-df17-41fb-a21d-d94e5961b6b2.svg";
  const IntegImgVector35 = "/v2/assets/68823fd6-5578-4654-a8ce-0c227745607e.svg";
  const IntegImgVector36 = "/v2/assets/49e3e830-28b8-4a31-b9ee-db5cbd78f6c3.svg";
  const IntegImgVector37 = "/v2/assets/5e7f270d-3ac2-4b6d-8813-4ae5d828c3e4.svg";
  const IntegImgVector38 = "/v2/assets/3638558a-cbbf-425b-b8d6-beb04a056894.svg";









































function IntegComponent1({ className, variant = "35" }) {
  const is101 = variant === "101";
  const is102 = variant === "102";
  const is107 = variant === "107";
  const is108 = variant === "108";
  const is111 = variant === "111";
  const is116 = variant === "116";
  const is36 = variant === "36";
  const is37 = variant === "37";
  const is38 = variant === "38";
  const is39 = variant === "39";
  const is39Or42Or45Or48Or54Or58Or62Or70Or74Or82Or86Or94Or98Or102Or108 = ["39", "42", "45", "48", "54", "58", "62", "70", "74", "82", "86", "94", "98", "102", "108", "111", "116"].includes(variant);
  const is42 = variant === "42";
  const is45 = variant === "45";
  const is48 = variant === "48";
  const is53 = variant === "53";
  const is54 = variant === "54";
  const is54Or94Or102 = ["54", "94", "102"].includes(variant);
  const is57 = variant === "57";
  const is58 = variant === "58";
  const is61 = variant === "61";
  const is62 = variant === "62";
  const is69 = variant === "69";
  const is70 = variant === "70";
  const is73 = variant === "73";
  const is74 = variant === "74";
  const is81 = variant === "81";
  const is82 = variant === "82";
  const is85 = variant === "85";
  const is86 = variant === "86";
  const is93 = variant === "93";
  const is94 = variant === "94";
  const is97 = variant === "97";
  const is98 = variant === "98";
  return (
    <div className={className || `overflow-clip relative ${is107 ? "h-[33.017px] w-[93.38px]" : is101 ? "h-[23.469px] w-[53.359px]" : is97 ? "h-[26.39px] w-[77.81px]" : is93 ? "h-[20.405px] w-[66.7px]" : is85 ? "h-[13.219px] w-[55.58px]" : is81 ? "h-[14.234px] w-[66.7px]" : is73 ? "h-[39.048px] w-[55.58px]" : is69 ? "h-[14.031px] w-[66.7px]" : is62 ? "h-[32.018px] w-[2.001px]" : is61 ? "h-[18.515px] w-[66.7px]" : is57 ? "h-[14.156px] w-[80.03px]" : is54Or94Or102 ? "h-[31.905px] w-[1.994px]" : is53 ? "h-[29.452px] w-[66.7px]" : ["39", "42", "45", "48", "58", "70", "74", "82", "86", "98", "108", "111", "116"].includes(variant) ? "h-[16px] w-[2px]" : "h-[10px] w-[12px]"}`} id={is116 ? "node-2_8541" : is111 ? "node-2_8526" : is108 ? "node-2_8517" : is107 ? "node-2_8513" : is102 ? "node-2_8497" : is101 ? "node-2_8493" : is98 ? "node-2_8478" : is97 ? "node-2_8474" : is94 ? "node-2_8460" : is93 ? "node-2_8456" : is86 ? "node-2_8430" : is85 ? "node-2_8426" : is82 ? "node-2_8412" : is81 ? "node-2_8408" : is74 ? "node-2_8383" : is73 ? "node-2_8377" : is70 ? "node-2_8362" : is69 ? "node-2_8358" : is62 ? "node-2_8336" : is61 ? "node-2_8332" : is58 ? "node-2_8315" : is57 ? "node-2_8311" : is54 ? "node-2_8297" : is53 ? "node-2_8293" : is48 ? "node-2_8274" : is45 ? "node-2_8265" : is42 ? "node-2_8256" : is39 ? "node-2_8242" : is38 ? "node-2_8239" : is37 ? "node-2_8236" : is36 ? "node-2_8233" : "node-2_8230"}>
      {["35", "36", "37", "38", "39", "42", "45", "48", "54", "58", "62", "69", "70", "74", "82", "86", "94", "98", "102", "108", "111", "116"].includes(variant) && (
        <div className={`${String.raw`absolute opacity-[var(--opacity\/100,1)] `}${is69 ? "inset-[4.74%_1.04%_4.59%_0.33%]" : is39Or42Or45Or48Or54Or58Or62Or70Or74Or82Or86Or94Or98Or102Or108 ? "bottom-0 left-0 right-full top-0" : "inset-[5%_4.17%]"}`} id={is116 ? "node-2_8540" : is111 ? "node-2_8525" : is108 ? "node-2_8516" : is102 ? "node-2_8496" : is98 ? "node-2_8477" : is94 ? "node-2_8459" : is86 ? "node-2_8429" : is82 ? "node-2_8411" : is74 ? "node-2_8382" : is70 ? "node-2_8361" : is69 ? "node-2_8357" : is62 ? "node-2_8335" : is58 ? "node-2_8314" : is54 ? "node-2_8296" : is48 ? "node-2_8273" : is45 ? "node-2_8264" : is42 ? "node-2_8255" : is39 ? "node-2_8241" : is38 ? "node-2_8238" : is37 ? "node-2_8235" : is36 ? "node-2_8232" : "node-2_8229"} data-name="Vector">
          {is39Or42Or45Or48Or54Or58Or62Or70Or74Or82Or86Or94Or98Or102Or108 && (
            <div className={`absolute ${["54", "62", "94", "102"].includes(variant) ? "inset-[0_-1px]" : "inset-[0_-0.71px]"}`}>
              <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={is62 ? IntegImgVector10 : is54Or94Or102 ? IntegImgVector4 : IntegImgVector1} />
            </div>
          )}
          {["35", "36", "37", "38", "69"].includes(variant) && <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={is69 ? IntegImgVector11 : IntegImgVector} />}
        </div>
      )}
      {["53", "57", "61", "81", "85", "93", "97", "101"].includes(variant) && (
        <div className={`absolute contents ${is101 ? "inset-[1.31%_1.02%_3.24%_1.02%]" : is97 ? "inset-[2.07%_0.34%_1.99%_0.18%]" : is93 ? "inset-[2.82%_0.86%_2.72%_0.32%]" : is85 ? "inset-[2.37%_0.18%_2.23%_1.03%]" : is81 ? "inset-[0.35%_0.31%_0.21%_0.84%]" : is61 ? "inset-[1.44%_0.04%_3.56%_0.04%]" : is57 ? "inset-[4.35%_0.68%_4.2%_0.17%]" : "inset-[1.79%_0.06%_1.71%_1.16%]"}`} id={is101 ? "node-2_8492" : is97 ? "node-2_8473" : is93 ? "node-2_8455" : is85 ? "node-2_8425" : is81 ? "node-2_8407" : is61 ? "node-2_8331" : is57 ? "node-2_8310" : "node-2_8292"} data-name="Clip path group">
          <div className={`absolute contents ${is101 ? "inset-[13.79%_1.78%_12.78%_1.82%]" : is97 ? "inset-[10.56%_0.15%_6.86%_0]" : is93 ? "inset-[2.81%_0.86%_5.59%_0.32%]" : is85 ? "inset-[1.4%_3.98%_2.39%_1.03%]" : is81 ? "inset-[0.36%_0.76%_2.48%_0.85%]" : is61 ? "inset-[2.88%_0.04%_4.68%_0.04%]" : is57 ? "inset-[4.35%_0.68%_4.2%_0.17%]" : "inset-[2.8%_1.46%_2.68%_3.15%]"}`} id={is101 ? "node-2_8486" : is97 ? "node-2_8468" : is93 ? "node-2_8450" : is85 ? "node-2_8420" : is81 ? "node-2_8403" : is61 ? "node-2_8323" : is57 ? "node-2_8306" : "node-2_8288"} data-name="Group">
            {["53", "57", "81", "85", "93", "97", "101"].includes(variant) && (
              <div className={`${String.raw`absolute mask-alpha mask-intersect mask-no-clip mask-no-repeat opacity-[var(--opacity\/100,1)] `}${is101 ? "inset-[13.79%_1.78%_16.97%_17.37%] mask-position-[-8.723px_-2.93px] mask-size-[52.271px_22.402px]" : is97 ? "inset-[10.56%_0.15%_6.86%_0] mask-position-[0.145px_-2.242px] mask-size-[77.403px_25.32px]" : is93 ? "inset-[17.98%_0.86%_5.59%_0.32%] mask-position-[0px_-3.094px] mask-size-[65.912px_19.276px]" : is85 ? "inset-[2.37%_76.62%_4.26%_1.03%] mask-position-[0.002px_0px] mask-size-[54.906px_12.611px]" : is81 ? "inset-[0.36%_0.76%_2.48%_0.85%] mask-position-[-0.002px_0px] mask-size-[65.931px_14.156px]" : is57 ? "inset-[4.35%_0.68%_4.2%_0.17%] mask-position-[0px_0px] mask-size-[79.354px_12.946px]" : "inset-[2.8%_1.46%_2.68%_3.15%] mask-position-[-1.327px_-0.297px] mask-size-[65.889px_28.422px]"}`} id={is101 ? "node-2_8487" : is97 ? "node-2_8469" : is93 ? "node-2_8451" : is85 ? "node-2_8421" : is81 ? "node-2_8404" : is57 ? "node-2_8307" : "node-2_8289"} style={is101 ? { maskImage: `url('${IntegImgVector27}')` } : is97 ? { maskImage: `url('${IntegImgVector24}')` } : is93 ? { maskImage: `url('${IntegImgVector21}')` } : is85 ? { maskImage: `url('${IntegImgVector18}')` } : is81 ? { maskImage: `url('${IntegImgVector16}')` } : is57 ? { maskImage: `url('${IntegImgVector5}')` } : { maskImage: `url('${IntegImgVector2}')` }} data-name="Vector">
                <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={is101 ? IntegImgVector28 : is97 ? IntegImgVector25 : is93 ? IntegImgVector22 : is85 ? IntegImgVector19 : is81 ? IntegImgVector17 : is57 ? IntegImgVector6 : IntegImgVector3} />
              </div>
            )}
            {["85", "93", "97", "101"].includes(variant) && (
              <div className={`${String.raw`absolute mask-alpha mask-intersect mask-no-clip mask-no-repeat opacity-[var(--opacity\/100,1)] `}${is101 ? "inset-[31.38%_73.32%_30.37%_9.6%] mask-position-[-4.576px_-7.055px] mask-size-[52.271px_22.402px]" : is97 ? "inset-[28.96%_79.38%_25.25%_7.63%] mask-position-[-5.795px_-7.094px] mask-size-[77.403px_25.32px]" : is93 ? "inset-[2.81%_9.83%_6.93%_63.79%] mask-position-[-42.335px_0px] mask-size-[65.912px_19.276px]" : "inset-[1.4%_3.98%_2.39%_10.21%] mask-position-[-5.1px_0.125px] mask-size-[54.906px_12.611px]"}`} id={is101 ? "node-2_8488" : is97 ? "node-2_8470" : is93 ? "node-2_8452" : "node-2_8422"} style={is101 ? { maskImage: `url('${IntegImgVector27}')` } : is97 ? { maskImage: `url('${IntegImgVector24}')` } : is93 ? { maskImage: `url('${IntegImgVector21}')` } : { maskImage: `url('${IntegImgVector18}')` }} data-name="Vector">
                <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={is101 ? IntegImgVector29 : is97 ? IntegImgVector26 : is93 ? IntegImgVector23 : IntegImgVector20} />
              </div>
            )}
            {is61 && (
              <div className="absolute contents inset-[2.88%_0.04%_4.68%_0.04%]" data-node-id="2:8328" data-name="Mask group">
                <div className="absolute contents inset-[2.88%_0.03%_4.68%_0.04%]" data-node-id="2:8324" data-name="Group">
                  <div className="absolute inset-[2.88%_0.03%_4.68%_0.04%] mask-position-[0px_-0.266px,_0px_0px] opacity-[var(--opacity\/100,1)]" data-node-id="2:8325" style={{ maskImage: `url('${IntegImgVector7}'), url('${IntegImgVector8}')` }} data-name="Vector">
                    <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector9} />
                  </div>
                </div>
              </div>
            )}
            {is101 && (
              <div className="absolute inset-[49.08%_81.09%_12.78%_1.82%] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[-0.429px_-11.211px] mask-size-[52.271px_22.402px] opacity-[var(--opacity\/100,1)]" data-node-id="2:8489" style={{ maskImage: `url('${IntegImgVector27}')` }} data-name="Vector">
                <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector30} />
              </div>
            )}
          </div>
        </div>
      )}
      {is73 && (
        <>
          <div className="absolute contents inset-[1.17%_0.98%_1.12%_0.08%]" data-node-id="2:8374" data-name="Mask group">
            <div className="absolute contents inset-[1.2%_1.04%_0.82%_-0.03%]" data-node-id="2:8370" data-name="Group">
              <div className="absolute inset-[1.2%_1.04%_0.82%_-0.03%] mask-intersect mask-luminance mask-no-clip mask-no-repeat mask-position-[0.061px_-0.008px] mask-size-[54.991px_38.156px] opacity-[var(--opacity\/100,1)]" data-node-id="2:8371" style={{ maskImage: `url('${IntegImgVector12}')` }} data-name="Vector">
                <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector13} />
              </div>
            </div>
          </div>
          <div className="absolute inset-[40.55%_11.07%_46.24%_14.36%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8375" data-name="Vector">
            <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector14} />
          </div>
          <div className="absolute inset-[35.38%_40.83%_40.74%_31.57%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8376" data-name="Vector">
            <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector15} />
          </div>
        </>
      )}
      {is107 && (
        <div className="absolute contents inset-[0.3%_0.16%_0.3%_0.05%]" data-node-id="2:8511" data-name="fin-text_svg__Layer_1">
          <div className="absolute inset-[0.3%_0.16%_0.3%_0.05%] opacity-[var(--opacity\/100,1)]" data-node-id="2:8512" data-name="Vector">
            <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector31} />
          </div>
        </div>
      )}
    </div>
  );
}

function IntegSection() {
  return (
    <div className="bg-[var(--color\/azure\/7,#080f1e)] content-stretch flex flex-col gap-[var(--item-spacing\/m,32px)] items-start pb-[48px] pt-[32px] px-[48px] relative size-full" data-node-id="2:19625" data-name="section#integrations">
      <div className="border-[var(--color\/azure\/26,#393f4b)] border-b-[length:var(--stroke-weight\/1,1px)] border-solid content-stretch flex gap-[var(--line-height\/16,16px)] items-center pb-[13px] pt-[8px] relative shrink-0 w-full" data-node-id="2:19626" data-name="span.font-mono">
        <div className="bg-[var(--color\/orange\/50,#ff5600)] relative shrink-0 size-[6px]" data-node-id="2:19629" data-name="::before" />
        <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[10.8px] text-[color:var(--color\/white\/solid,white)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19630">
          <p className="leading-[var(--line-height\/14,14px)]">Seamless integration</p>
        </div>
      </div>
      <div className="h-[599.09px] relative shrink-0 w-full" data-node-id="2:19631" data-name="div.justify-items-center">
        <div className="absolute content-stretch flex flex-col gap-[var(--line-height\/24,24px)] items-start left-0 top-0" data-node-id="2:19632" data-name="hgroup.col-span-10">
          <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2:19633" data-name="h3.text-current">
            <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Light',sans-serif)] font-[var(--font-weight\/300,300)] justify-center leading-[0] not-italic relative shrink-0 text-[color:var(--color\/white\/solid,white)] text-[length:var(--font-size\/54,54px)] tracking-[var(--letter-spacing\/-3_01,-3.008px)] whitespace-nowrap" data-node-id="2:19634">
              <p className="leading-[var(--font-size\/54,54px)] mb-0">Clain works with any</p>
              <p className="leading-[var(--font-size\/54,54px)]">helpdesk</p>
            </div>
          </div>
          <div className="font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] h-[71.81px] leading-[0] not-italic relative shrink-0 w-full" data-node-id="2:19637" data-name="p.font-sans">
            <div className="-translate-y-1/2 absolute flex flex-col h-[14px] justify-center left-0 text-[color:var(--color\/grey\/82,#cecfd2)] text-[length:var(--font-size\/11,11px)] top-[13.5px] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase w-[16.5px]" data-node-id="2:19638">
              <p className="leading-[var(--line-height\/14,14px)]">03</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col h-[24px] justify-center left-[52.86px] text-[16.3px] text-[color:var(--color\/white\/solid,white)] top-[11px] w-[337.14px]" data-node-id="2:19641">
              <p className="leading-[var(--line-height\/23_94,23.94px)]">Set up Clain with your existing helpdesk or as</p>
            </div>
            <div className="-translate-y-1/2 absolute flex flex-col h-[48px] justify-center left-0 text-[16.3px] text-[color:var(--color\/white\/solid,white)] top-[46.91px] w-[418.89px]" data-node-id="2:19643">
              <p className="leading-[var(--line-height\/23_94,23.94px)] mb-0">part of the Clain Customer Service Suite—with</p>
              <p className="leading-[var(--line-height\/23_94,23.94px)]">support for additional platforms and custom channels.</p>
            </div>
          </div>
        </div>
        <div className="absolute content-stretch flex flex-col items-start left-0 right-[635.22px] top-[235.81px]" data-node-id="2:19644" data-name="div.flex">
          <div className="border-[var(--color\/azure\/26,#393f4b)] border-b-[length:var(--stroke-weight\/1,1px)] border-solid content-stretch flex flex-col items-start pb-[9px] relative shrink-0 w-full" data-node-id="2:19645" data-name="span.text-current">
            <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[10.7px] text-[color:var(--color\/white\/solid,white)] tracking-[var(--letter-spacing\/1_5,1.504px)] uppercase whitespace-nowrap" data-node-id="2:19646">
              <p className="leading-[var(--line-height\/14,14px)]">Key features</p>
            </div>
          </div>
          <div className="content-stretch flex flex-col items-start pb-[12px] relative shrink-0 w-full" data-node-id="2:19647" data-name="ul.appearance-none">
            <div className="border-[var(--color\/azure\/26,#393f4b)] border-b-[length:var(--stroke-weight\/1,1px)] border-solid content-stretch flex flex-col items-start pb-[13px] pt-[12px] relative shrink-0 w-full" data-node-id="2:19648" data-name="li.border-b-white-20">
              <div className="relative shrink-0 w-full" data-node-id="2:19649" data-name="div.flex">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[var(--font-size\/12,12px)] items-center relative size-full">
                  <div className="content-stretch flex flex-col items-start pb-[5.84px] pt-[8.16px] relative shrink-0" data-node-id="2:19650" data-name="div">
                    <IntegComponent1 className="h-[10px] overflow-clip relative shrink-0 w-[12px]" />
                  </div>
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2:19653" data-name="span.font-sans">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[12.9px] text-[color:var(--color\/grey\/82,#cecfd2)] tracking-[var(--stroke-weight\/0_5,0.499px)] whitespace-nowrap" data-node-id="2:19654">
                      <p className="leading-[var(--font-size\/18,18px)]">Set up in under an hour.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-[var(--color\/azure\/26,#393f4b)] border-b-[length:var(--stroke-weight\/1,1px)] border-solid content-stretch flex flex-col items-start pb-[13px] pt-[12px] relative shrink-0 w-full" data-node-id="2:19655" data-name="li.border-b-white-20">
              <div className="relative shrink-0 w-full" data-node-id="2:19656" data-name="div.flex">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[var(--font-size\/12,12px)] items-center relative size-full">
                  <div className="content-stretch flex flex-col items-start pb-[5.84px] pt-[8.16px] relative shrink-0" data-node-id="2:19657" data-name="div">
                    <IntegComponent1 className="h-[10px] overflow-clip relative shrink-0 w-[12px]" variant="36" />
                  </div>
                  <div className="content-stretch flex flex-col items-start pr-[3.33px] relative shrink-0" data-node-id="2:19660" data-name="span.font-sans">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[12.7px] text-[color:var(--color\/grey\/82,#cecfd2)] tracking-[var(--stroke-weight\/0_5,0.499px)] whitespace-nowrap" data-node-id="2:19661">
                      <p className="leading-[var(--font-size\/18,18px)] mb-0">Integrates into your current support channels—tickets, email,</p>
                      <p className="leading-[var(--font-size\/18,18px)]">live chat, and more.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-[var(--color\/azure\/26,#393f4b)] border-b-[length:var(--stroke-weight\/1,1px)] border-solid content-stretch flex flex-col items-start pb-[13px] pt-[12px] relative shrink-0 w-full" data-node-id="2:19662" data-name="li.border-b-white-20">
              <div className="relative shrink-0 w-full" data-node-id="2:19663" data-name="div.flex">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[var(--font-size\/12,12px)] items-center relative size-full">
                  <div className="content-stretch flex flex-col items-start pb-[5.84px] pt-[8.16px] relative shrink-0" data-node-id="2:19664" data-name="div">
                    <IntegComponent1 className="h-[10px] overflow-clip relative shrink-0 w-[12px]" variant="37" />
                  </div>
                  <div className="content-stretch flex flex-col items-start pr-[29px] relative shrink-0" data-node-id="2:19667" data-name="span.font-sans">
                    <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[12.7px] text-[color:var(--color\/grey\/82,#cecfd2)] tracking-[var(--stroke-weight\/0_5,0.499px)] whitespace-nowrap" data-node-id="2:19668">
                      <p className="leading-[var(--font-size\/18,18px)] mb-0">Follows your existing assignment rules, automations, and</p>
                      <p className="leading-[var(--font-size\/18,18px)]">reporting.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-stretch flex gap-[var(--font-size\/12,12px)] items-center pt-[12px] relative shrink-0 w-full" data-node-id="2:19669" data-name="div.flex">
              <div className="content-stretch flex flex-col items-start pb-[5.84px] pt-[8.16px] relative shrink-0" data-node-id="2:19670" data-name="div">
                <IntegComponent1 className="h-[10px] overflow-clip relative shrink-0 w-[12px]" variant="38" />
              </div>
              <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2:19673" data-name="span.font-sans">
                <div className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[12.7px] text-[color:var(--color\/grey\/82,#cecfd2)] tracking-[var(--stroke-weight\/0_5,0.499px)] whitespace-nowrap" data-node-id="2:19674">
                  <p className="leading-[var(--font-size\/18,18px)]">Escalates to agents in your preferred inbox.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute content-stretch flex flex-col items-center justify-center left-[529.31px] overflow-clip top-0 w-[529.34px]" data-node-id="2:19675" data-name="div.flex">
          <div className="h-[599.09px] relative shrink-0 w-[741.08px]" data-node-id="2:19676" data-name="div.relative:mask-group">
            <div className="-translate-y-1/2 absolute h-[599.09px] left-0 mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0px_0px] mask-size-[741.08px_599.09px] right-0 top-1/2" data-node-id="2:19678" style={{ maskImage: `url('${IntegImgDivRelative}')` }} data-name="div.relative">
              <div className="absolute gap-x-[16px] gap-y-[16px] grid grid-cols-[repeat(5,minmax(0,1fr))] grid-rows-[_86.52px] h-[86.52px] left-[74.11px] opacity-[var(--width\/40,0.4)] right-[-74.11px] top-0" data-node-id="2:19679" data-name="div.mb-3">
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-1 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19680" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19681" data-name="div.duration-400" />
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.7px] w-[2px]" data-node-id="2:19682" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="39" />
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19685" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19685;2:8247" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19687" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19687;2:8252" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-2 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19691" data-name="div.relative">
                  <div className="h-[84.52px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19692" data-name="div.duration-400" />
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.7px] w-[2px]" data-node-id="2:19693" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="42" />
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19696" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19696;2:8258" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19698" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19698;2:8261" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-3 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19702" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19703" data-name="div.duration-400" />
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.7px] w-[2px]" data-node-id="2:19704" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="45" />
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19707" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19707;2:8267" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19709" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19709;2:8270" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-4 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19713" data-name="div.relative">
                  <div className="h-[84.52px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19714" data-name="div.duration-400" />
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.71px] w-[2px]" data-node-id="2:19715" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="48" />
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19718" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19718;2:8276" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19720" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19720;2:8279" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-5 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19724" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19725" data-name="div.duration-400" />
                </div>
              </div>
              <div className="absolute gap-x-[16px] gap-y-[16px] grid grid-cols-[repeat(5,minmax(0,1fr))] grid-rows-[____86.52px_86.52px_86.52px_86.52px] h-[394.06px] left-0 right-0 top-[102.52px]" data-node-id="2:19726" data-name="div.grid">
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-1 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-1 self-start shrink-0" data-node-id="2:19727" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19728" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19729" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19729;2:8282" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19731" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19731;2:8285" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-2 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19735" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19738" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[27.54px] pt-[27.53px] relative size-full">
                      <IntegComponent1 className="h-[29.452px] overflow-clip relative shrink-0 w-[66.7px]" variant="53" />
                    </div>
                  </div>
                  <div className="absolute bottom-[-23.62px] flex items-center justify-center right-[-24.05px] size-[24.042px]">
                    <div className="-rotate-45 flex-none">
                      <div className="h-[32px] relative w-[2px]" data-node-id="2:19745" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="54" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19748" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19748;2:8300" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19750" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19750;2:8303" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-3 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19754" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19755" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center py-[35.17px] relative size-full">
                      <IntegComponent1 className="h-[14.156px] overflow-clip relative shrink-0 w-[80.03px]" variant="57" />
                    </div>
                  </div>
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.7px] w-[2px]" data-node-id="2:19762" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="58" />
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19765" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19765;2:8317" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19767" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19767;2:8320" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-4 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19771" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19772" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center py-[33px] relative size-full">
                      <IntegComponent1 className="h-[18.515px] overflow-clip relative shrink-0 w-[66.7px]" variant="61" />
                    </div>
                  </div>
                  <div className="absolute bottom-[-23.62px] flex items-center justify-center left-[-24.05px] size-[24.042px]">
                    <div className="flex-none rotate-45">
                      <div className="h-[32px] relative w-[2px]" data-node-id="2:19783" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="62" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19786" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19786;2:8339" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19788" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19788;2:8342" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-5 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-1 self-start shrink-0" data-node-id="2:19792" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19793" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19794" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19794;2:8345" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19796" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19796;2:8348" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-1 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-2 self-start shrink-0" data-node-id="2:19800" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19801" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19802" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19802;2:8351" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19804" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19804;2:8354" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-2 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-2 self-start shrink-0" data-node-id="2:19808" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19809" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[35.25px] pt-[35.24px] relative size-full">
                      <IntegComponent1 className="h-[14.031px] overflow-clip relative shrink-0 w-[66.7px]" variant="69" />
                    </div>
                  </div>
                  <div className="-translate-y-1/2 absolute flex h-[2px] items-center justify-center right-[-17px] top-[calc(50%-0.01px)] w-[16px]">
                    <div className="-rotate-90 flex-none">
                      <div className="h-[16px] relative w-[2px]" data-node-id="2:19812" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="70" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19815" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19815;2:8364" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19817" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19817;2:8367" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-4 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-2 self-start shrink-0" data-node-id="2:19821" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19822" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[22.73px] pt-[22.74px] relative size-full">
                      <IntegComponent1 className="h-[39.048px] overflow-clip relative shrink-0 w-[55.58px]" variant="73" />
                    </div>
                  </div>
                  <div className="-translate-y-1/2 absolute flex h-[2px] items-center justify-center left-[-17px] top-[calc(50%-0.01px)] w-[16px]">
                    <div className="flex-none rotate-90">
                      <div className="h-[16px] relative w-[2px]" data-node-id="2:19831" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="74" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19834" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19834;2:8385" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19836" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19836;2:8388" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-5 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-2 self-start shrink-0" data-node-id="2:19840" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19841" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19842" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19842;2:8391" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19844" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19844;2:8394" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-1 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-3 self-start shrink-0" data-node-id="2:19848" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19849" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19850" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19850;2:8397" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19852" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19852;2:8400" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-2 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-3 self-start shrink-0" data-node-id="2:19856" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19857" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[35.15px] pt-[35.14px] relative size-full">
                      <IntegComponent1 className="h-[14.234px] overflow-clip relative shrink-0 w-[66.7px]" variant="81" />
                    </div>
                  </div>
                  <div className="-translate-y-1/2 absolute flex h-[2px] items-center justify-center right-[-17px] top-[calc(50%-0.01px)] w-[16px]">
                    <div className="-rotate-90 flex-none">
                      <div className="h-[16px] relative w-[2px]" data-node-id="2:19864" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="82" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19867" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19867;2:8414" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19869" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19869;2:8417" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-4 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-3 self-start shrink-0" data-node-id="2:19873" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19874" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[35.66px] pt-[35.64px] relative size-full">
                      <IntegComponent1 className="h-[13.219px] overflow-clip relative shrink-0 w-[55.58px]" variant="85" />
                    </div>
                  </div>
                  <div className="-translate-y-1/2 absolute flex h-[2px] items-center justify-center left-[-17px] top-[calc(50%-0.01px)] w-[16px]">
                    <div className="flex-none rotate-90">
                      <div className="h-[16px] relative w-[2px]" data-node-id="2:19882" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="86" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19885" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19885;2:8432" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19887" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19887;2:8435" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-5 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-3 self-start shrink-0" data-node-id="2:19891" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19892" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19893" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19893;2:8438" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19895" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19895;2:8441" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-1 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-4 self-start shrink-0" data-node-id="2:19899" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19900" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19901" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19901;2:8444" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19903" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19903;2:8447" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-2 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-4 self-start shrink-0" data-node-id="2:19907" data-name="div.relative">
                  <div className="bg-[var(--color\/azure\/5,#020917)] relative shrink-0 w-full" data-node-id="2:19908" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[32.06px] pt-[32.05px] relative size-full">
                      <IntegComponent1 className="h-[20.405px] overflow-clip relative shrink-0 w-[66.7px]" variant="93" />
                    </div>
                  </div>
                  <div className="absolute flex items-center justify-center right-[-22.63px] size-[24.042px] top-[-24.04px]">
                    <div className="-rotate-135 flex-none">
                      <div className="h-[32px] relative w-[2px]" data-node-id="2:19916" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="94" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19919" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19919;2:8462" data-name="Vector">
                        <div className="absolute inset-[-0.58%_-0.37%]">
                          <img loading="lazy" decoding="async" alt="" className="block max-w-none size-full" src={IntegImgVector36} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19921" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19921;2:8465" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-3 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-4 self-start shrink-0" data-node-id="2:19925" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19926" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[29.06px] pt-[29.05px] relative size-full">
                      <IntegComponent1 className="h-[26.39px] overflow-clip relative shrink-0 w-[77.81px]" variant="97" />
                    </div>
                  </div>
                  <div className="absolute flex h-[16px] items-center justify-center left-[65.7px] top-[-17px] w-[2px]">
                    <div className="flex-none rotate-180">
                      <div className="h-[16px] relative w-[2px]" data-node-id="2:19934" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="98" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19937" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19937;2:8480" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19939" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19939;2:8483" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/white\/-2_5\%,rgba(255,255,255,0.03))] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-4 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-4 self-start shrink-0" data-node-id="2:19943" data-name="div.relative">
                  <div className="opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19944" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[30.53px] pt-[30.52px] relative size-full">
                      <IntegComponent1 className="h-[23.469px] overflow-clip relative shrink-0 w-[53.359px]" variant="101" />
                    </div>
                  </div>
                  <div className="absolute flex items-center justify-center left-[-24.63px] size-[24.042px] top-[-23.04px]">
                    <div className="flex-none rotate-135">
                      <div className="h-[32px] relative w-[2px]" data-node-id="2:19953" data-name="div.absolute">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                          <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="102" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19956" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19956;2:8499" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19958" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19958;2:8502" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-5 content-stretch flex flex-col items-center justify-center justify-self-stretch opacity-[var(--width\/40,0.4)] p-px relative row-4 self-start shrink-0" data-node-id="2:19962" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19963" data-name="div.duration-400" />
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19964" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19964;2:8505" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19966" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19966;2:8508" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="backdrop-blur-[8px] bg-[var(--color\/azure\/5,#020917)] border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-70\%,rgba(255,255,255,0.7))] border-solid col-3 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative rounded-[16px] row-[2/span_2] self-start shrink-0" data-node-id="2:19970" data-name="div.relative">
                  <div className="bg-[var(--color\/azure\/5,#020917)] relative rounded-[16px] shrink-0 w-full" data-node-id="2:19971" data-name="div.duration-400">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[77.01px] pt-[77px] relative size-full">
                      <IntegComponent1 className="h-[33.017px] overflow-clip relative shrink-0 w-[93.38px]" variant="107" />
                    </div>
                  </div>
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.7px] w-[2px]" data-node-id="2:19975" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="108" />
                    </div>
                  </div>
                  <div className="absolute h-[188.037px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19978" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-[0_25.6%_46.82%_0] opacity-[var(--opacity\/100,1)]" data-node-id="I2:19978;2:8519" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector37} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[188.037px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19980" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-[0_25.6%_46.82%_0] opacity-[var(--opacity\/100,1)]" data-node-id="I2:19980;2:8522" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector38} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute gap-x-[16px] gap-y-[16px] grid grid-cols-[repeat(5,minmax(0,1fr))] grid-rows-[_86.52px] h-[86.52px] left-[74.11px] opacity-[var(--width\/40,0.4)] right-[-74.11px] top-[512.58px]" data-node-id="2:19984" data-name="div.mt-3">
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-1 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19985" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19986" data-name="div.duration-400" />
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.7px] w-[2px]" data-node-id="2:19987" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="111" />
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19990" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19990;2:8528" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:19992" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19992;2:8531" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-2 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:19996" data-name="div.relative">
                  <div className="h-[84.52px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:19997" data-name="div.duration-400" />
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:19998" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:19998;2:8534" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:20000" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:20000;2:8537" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-3 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:20004" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:20005" data-name="div.duration-400" />
                  <div className="absolute bottom-[-17px] h-[16px] left-[65.7px] w-[2px]" data-node-id="2:20006" data-name="div.absolute">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start justify-center relative size-full">
                      <IntegComponent1 className="flex-[1_0_0] min-h-px overflow-clip relative w-full" variant="116" />
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:20009" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:20009;2:8543" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector32} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.503px] left-[-0.5px] top-[-0.5px] w-[134.41px]" data-node-id="2:20011" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:20011;2:8546" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector33} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-4 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:20015" data-name="div.relative">
                  <div className="h-[84.52px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:20016" data-name="div.duration-400" />
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:20017" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:20017;2:8549" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector34} />
                      </div>
                    </div>
                  </div>
                  <div className="absolute h-[85.514px] left-[-0.5px] top-[-0.5px] w-[134.42px]" data-node-id="2:20019" data-name="Component 1">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
                      <div className="absolute inset-0 opacity-[var(--opacity\/100,1)]" data-node-id="I2:20019;2:8552" data-name="Vector">
                        <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={IntegImgVector35} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-[length:var(--stroke-weight\/1,1px)] border-[var(--color\/white\/-20\%,rgba(255,255,255,0.2))] border-solid col-5 content-stretch flex flex-col items-center justify-center justify-self-stretch p-px relative row-1 self-start shrink-0" data-node-id="2:20023" data-name="div.relative">
                  <div className="h-[84.5px] opacity-[var(--width\/40,0.4)] relative shrink-0 w-full" data-node-id="2:20024" data-name="div.duration-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute content-stretch flex flex-wrap gap-[var(--line-height\/16,0px_16px)] h-[20px] items-start left-0 right-[44%] top-[509.81px]" data-node-id="2:20025" data-name="div.hidden">
          <div className="bg-white content-stretch flex flex-col h-full items-start pb-[4px] relative shrink-0" data-node-id="2:20026" data-name="Component 8">
            <a className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[14.9px] text-[color:var(--color\/white\/solid,white)] whitespace-nowrap" onClick={() => ClainV2.navigate('/demo')}>
              <p className="cursor-pointer leading-[var(--line-height\/16,16px)]">Clain Suite</p>
            </a>
          </div>
          <div className="bg-white content-stretch flex flex-col h-full items-start pb-[4px] relative shrink-0" data-node-id="2:20028" data-name="Component 8">
            <a className="flex flex-col font-[family-name:var(--font-family\/font-1,'Inter:Regular',sans-serif)] font-[var(--font-weight\/400,400)] justify-center leading-[0] not-italic relative shrink-0 text-[0px] text-[color:var(--color\/white\/solid,white)] whitespace-nowrap" onClick={() => ClainV2.navigate('/demo')}>
              <p className="cursor-pointer font-['Inter:Regular',sans-serif] font-normal leading-[16px] text-[14.9px]" role="link" tabIndex="0">
                Clain for Salesforce
              </p>
            </a>
          </div>
        </div>
      </div>
      <div className="absolute border-[var(--color\/azure\/26,#393f4b)] border-l-[length:var(--stroke-weight\/1,1px)] border-solid border-t-[length:var(--stroke-weight\/1,1px)] left-[8px] size-[24px] top-[8px]" data-node-id="2:20030" data-name="span.border-border-decorative" />
      <div className="absolute border-[var(--color\/azure\/26,#393f4b)] border-r-[length:var(--stroke-weight\/1,1px)] border-solid border-t-[length:var(--stroke-weight\/1,1px)] right-[8.02px] size-[24px] top-[8px]" data-node-id="2:20031" data-name="span.border-border-decorative" />
      <div className="absolute border-[var(--color\/azure\/26,#393f4b)] border-b-[length:var(--stroke-weight\/1,1px)] border-l-[length:var(--stroke-weight\/1,1px)] border-solid bottom-[8px] left-[8px] size-[24px]" data-node-id="2:20032" data-name="span.border-border-decorative" />
      <div className="absolute border-[var(--color\/azure\/26,#393f4b)] border-b-[length:var(--stroke-weight\/1,1px)] border-r-[length:var(--stroke-weight\/1,1px)] border-solid bottom-[8px] right-[8.02px] size-[24px]" data-node-id="2:20033" data-name="span.border-border-decorative" />
    </div>
  );
}

  /* ═══ TECHNOLOGY SECTION ═══ */

// ═══════════════════════════════════════════════════════════════════
// Technology section (Figma node 2:20034) — Clain AI Engine
// Engine schematic exported from Figma (single PNG); 6 engine steps with
// titles & descriptions extracted from Figma metadata.
// ═══════════════════════════════════════════════════════════════════
const techEngineSchematic = "/v2/assets/clain-ai-engine-schematic.png";

const ENGINE_STEPS = [
  { num: '4.a.1', title: 'Refine the query',         desc: 'In order to optimize the accuracy of an answer that an LLM generates, the inputs the LLM receives must be refined for comprehension.', side: 'left'  },
  { num: '4.a.2', title: 'Retrieve relevant content', desc: 'The retrieval process, powered by our proprietary clain-cx-retrieval model, searches across all knowledge sources and selects the most relevant information for accurate answers.', side: 'right' },
  { num: '4.a.3', title: 'Rerank for precision',     desc: 'The reranking process, powered by our proprietary clain-cx-reranker model, scores retrieved content for relevance and accuracy, then selects the optimal pieces for the LLM to use.', side: 'left'  },
  { num: '4.a.4', title: 'Generate a response',      desc: 'Clain Apex 1.0 is the generative core of Clain. It takes the most relevant content retrieved and ranked by the Clain model suite, applies your configured policies, and produces a direct answer or decides the question needs a human.', side: 'right', highlight: true },
  { num: '4.a.5', title: 'Validate accuracy',         desc: 'In the final step, the Clain AI Engine™ checks whether the LLM output meets response accuracy and safety standards.', side: 'left'  },
  { num: '4.a.6', title: 'Engine optimization',       desc: 'To calibrate performance, the Clain AI Engine™ uses integrated tools that optimize answer generation, efficiency, precision, and coverage.', side: 'right' },
];

const CERTIFICATIONS = ['ISO 27001', 'ISO 27018', 'ISO 27701', 'GDPR Compliant', 'CCPA Compliant'];

function TechnologySection() {
  return (
    <div className="relative w-full" style={{ background: '#020917' }}>
      <div className="relative max-w-[1440px] mx-auto px-[48px] pt-[32px] pb-[48px]">
        {/* Corner decorations */}
        <div className="absolute size-[24px] top-[8px] left-[8px]" style={{ borderTop: '1px solid #393f4b', borderLeft: '1px solid #393f4b' }} />
        <div className="absolute size-[24px] top-[8px] right-[8px]" style={{ borderTop: '1px solid #393f4b', borderRight: '1px solid #393f4b' }} />
        <div className="absolute size-[24px] bottom-[8px] left-[8px]" style={{ borderBottom: '1px solid #393f4b', borderLeft: '1px solid #393f4b' }} />
        <div className="absolute size-[24px] bottom-[8px] right-[8px]" style={{ borderBottom: '1px solid #393f4b', borderRight: '1px solid #393f4b' }} />

        {/* Superior Technology label */}
        <div className="flex gap-[16px] items-center pt-[8px] pb-[13px]" style={{ borderBottom: '1px solid #393f4b' }}>
          <div className="size-[6px] rounded-full" style={{ background: '#ff5600' }} />
          <p className="m-0 uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11, lineHeight: '14px', letterSpacing: '1.504px', color: 'white' }}>Superior Technology</p>
        </div>

        {/* Heading + description */}
        <div className="grid grid-cols-2 gap-[16px] mt-[32px]">
          <h2 className="m-0 text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 53.2, lineHeight: '54px', letterSpacing: '-3.008px' }}>
            <span style={{ display: 'block' }}>Powered by the</span>
            <span style={{ display: 'block' }}>Clain AI Engine&trade;</span>
          </h2>
          <div className="flex flex-col gap-[24px]">
            <div className="flex items-baseline gap-[40px]">
              <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>04</span>
              <p className="m-0 max-w-[420px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 16, lineHeight: '23.94px', color: 'rgba(255,255,255,0.8)' }}>The Clain AI Engine&trade; is a patented AI architecture specifically engineered for complex customer service queries. Every layer is optimized for accuracy, speed, and reliability&mdash;so Clain can resolve more conversations, more effectively than competing AI Agents.</p>
            </div>
            <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer self-start rounded-[6px] border-0 bg-white text-black px-[16px] py-[12px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.4, lineHeight: '16px' }}>Start free trial</button>
          </div>
        </div>

        {/* Engine schematic + 6 steps */}
        <div className="mt-[80px]">
          <div className="flex items-center gap-[20px] pb-[16px]">
            <span className="uppercase" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Fig 4.A &mdash;</span>
            <span className="uppercase" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>Clain AI Engine&trade;</span>
          </div>
          <div className="relative grid grid-cols-[1fr_300px_1fr] gap-[40px] items-start">
            {/* Left column — odd-numbered steps */}
            <div className="flex flex-col gap-[40px] pt-[40px]">
              {ENGINE_STEPS.filter(s => s.side === 'left').map((s) => (
                <div key={s.num} style={{ borderTop: s.highlight ? '1px solid #ff5600' : '1px solid rgba(255,255,255,0.2)' }} className="pt-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <span className="size-[8px]" style={{ background: s.highlight ? '#ff5600' : 'rgba(255,255,255,0.4)' }} />
                    <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 13, color: 'white' }}>[{s.num}] {s.title}</span>
                  </div>
                  <p className="m-0 mt-[12px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,0.6)' }}>{s.desc}</p>
                </div>
              ))}
            </div>
            {/* Center — engine schematic */}
            <div className="flex justify-center">
              <img loading="lazy" decoding="async" alt="Clain AI Engine" className="block" style={{ width: 299, height: 'auto' }} src={techEngineSchematic} />
            </div>
            {/* Right column — even-numbered steps */}
            <div className="flex flex-col gap-[40px] pt-[40px]">
              {ENGINE_STEPS.filter(s => s.side === 'right').map((s) => (
                <div key={s.num} style={{ borderTop: s.highlight ? '1px solid #ff5600' : '1px solid rgba(255,255,255,0.2)' }} className="pt-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <span className="size-[8px]" style={{ background: s.highlight ? '#ff5600' : 'rgba(255,255,255,0.4)' }} />
                    <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 13, color: 'white' }}>[{s.num}] {s.title}</span>
                  </div>
                  <p className="m-0 mt-[12px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13, lineHeight: '18px', color: 'rgba(255,255,255,0.6)' }}>{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trust certifications marquee */}
        <div className="mt-[80px]">
          <p className="m-0 text-center" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Trusted and fully certified</p>
          <div className="mt-[24px] flex items-center justify-center gap-[40px] flex-wrap">
            {CERTIFICATIONS.map((c) => (
              <div key={c} className="size-[50px] rounded-full flex items-center justify-center text-center" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


  /* ═══ AI TEAM SECTION ═══ */

// ═══════════════════════════════════════════════════════════════════
// AI Team section (Figma node 2:29856) — extracted from MCP
// ═══════════════════════════════════════════════════════════════════
const teamImgPratikBothra    = "/v2/assets/7b9a372c-001f-4af8-9240-c1413bcef960.png";
const teamImgRobClancy       = "/v2/assets/b1f26b25-7867-4806-8f74-153393943e83.png";
const teamImgMarioKostelac   = "/v2/assets/2e7580fe-c65e-4ae7-bcda-a42b422a155a.png";
const teamImgMollyMahar      = "/v2/assets/6c216cda-bf72-4976-91bf-daca529ae446.png";
const teamImgBrianMcDonnell  = "/v2/assets/4da22042-5e0e-41d0-a7b8-e5d9257338d5.png";
const teamImgFedorParfenov   = "/v2/assets/b3dd24e7-c362-4fb2-9e74-08582e2322e9.png";
const teamImgFergalReid      = "/v2/assets/30009f0f-b9b1-4566-871e-6f9c8615f97d.png";
const teamImgPedroTabacof    = "/v2/assets/7eae0f00-0fb8-41d0-9502-9d2861d57da9.png";
const teamImgAlexeyTarasov   = "/v2/assets/a2a2a74c-0fd5-4773-9f6e-d17b96fc575c.png";
const teamImgRatiZvirawa     = "/v2/assets/71d799f7-4e3a-4753-a579-7641412a8d17.png";
const teamImgGroupBg         = "/v2/assets/1ddbb51d-bcb4-4db4-87de-456bd5344c41.svg";

const TEAM_MEMBERS = [
  { name: 'Pratik Bothra',   role: ['Principal Machine', 'Learning Engineer'],   img: teamImgPratikBothra,   row: 0, col: 0 },
  { name: 'Rob Clancy',      role: ['Principal Machine', 'Learning Engineer'],   img: teamImgRobClancy,      row: 0, col: 1 },
  { name: 'Mario Kostelac',  role: ['Principal Machine', 'Learning Engineer'],   img: teamImgMarioKostelac,  row: 0, col: 2 },
  { name: 'Molly Mahar',     role: ['Principal AI Designer'],                    img: teamImgMollyMahar,     row: 0, col: 3 },
  { name: 'Brian McDonnell', role: ['Director, Engineering'],                    img: teamImgBrianMcDonnell, row: 0, col: 4 },
  { name: 'Fedor Parfenov',  role: ['Staff Machine', 'Learning Scientist'],      img: teamImgFedorParfenov,  row: 1, col: 0 },
  { name: 'Fergal Reid',     role: ['Chief AI Officer'],                          img: teamImgFergalReid,     row: 1, col: 1 },
  { name: 'Pedro Tabacof',   role: ['Principal Machine', 'Learning Scientist'],  img: teamImgPedroTabacof,   row: 1, col: 2 },
  { name: 'Alexey Tarasov',  role: ['Senior Manager, ML', 'Engineering'],        img: teamImgAlexeyTarasov,  row: 1, col: 3 },
  { name: 'Rati Zvirawa',    role: ['Director, Product', 'Management'],          img: teamImgRatiZvirawa,    row: 1, col: 4 },
];

function AiTeamSection() {
  return (
    <div className="relative w-full" style={{ background: '#080f1e' }}>
      <div className="relative max-w-[1440px] mx-auto px-[48px] pt-[32px] pb-[48px]">
        {/* Corner decorations */}
        <div className="absolute size-[24px] top-[8px] left-[8px]" style={{ borderTop: '1px solid #393f4b', borderLeft: '1px solid #393f4b' }} />
        <div className="absolute size-[24px] top-[8px] right-[8px]" style={{ borderTop: '1px solid #393f4b', borderRight: '1px solid #393f4b' }} />
        <div className="absolute size-[24px] bottom-[8px] left-[8px]" style={{ borderBottom: '1px solid #393f4b', borderLeft: '1px solid #393f4b' }} />
        <div className="absolute size-[24px] bottom-[8px] right-[8px]" style={{ borderBottom: '1px solid #393f4b', borderRight: '1px solid #393f4b' }} />

        {/* AI Team label */}
        <div className="flex gap-[16px] items-center pt-[8px] pb-[13px] w-full" style={{ borderBottom: '1px solid #393f4b' }}>
          <div className="size-[6px]" style={{ background: '#ff5600' }} />
          <p className="m-0 uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11, lineHeight: '14px', letterSpacing: '1.504px', color: 'white' }}>AI Team</p>
        </div>

        {/* Heading + description */}
        <div className="flex flex-col gap-[8px] mt-[32px]">
          <div className="flex items-end justify-between pb-[56px] flex-wrap gap-y-[24px]">
            <h3 className="m-0 max-w-[502.85px] text-white whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 53.2, lineHeight: '54px', letterSpacing: '-3.008px' }}>
              <span style={{ display: 'block' }}>Built by a world-class</span>
              <span style={{ display: 'block' }}>team of AI experts</span>
            </h3>
            <div className="max-w-[485px] w-[423.45px] relative" style={{ height: 143.63 }}>
              <p className="absolute m-0 uppercase" style={{ left: 0, top: 0, fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11, lineHeight: '11px', letterSpacing: '0.5517px', color: 'rgba(255,255,255,0.8)' }}>05</p>
              <p className="absolute m-0" style={{ left: 50.7, top: 0, width: 316.26, fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 16.6, lineHeight: '23.94px', color: 'rgba(255,255,255,0.8)' }}>The AI Group, an expert team of over 40</p>
              <div className="absolute" style={{ left: 0, top: 47.84, width: 416.61 }}>
                <p className="m-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 16.3, lineHeight: '23.94px', color: 'rgba(255,255,255,0.8)' }}>machine learning scientists, engineers and designers,</p>
                <p className="m-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 16.3, lineHeight: '23.94px', color: 'rgba(255,255,255,0.8)' }}>continuously optimize Clain&rsquo;s performance through</p>
                <p className="m-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 16.3, lineHeight: '23.94px', color: 'rgba(255,255,255,0.8)' }}>cutting-edge research, experimentation, and</p>
                <p className="m-0" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 16.3, lineHeight: '23.94px', color: 'rgba(255,255,255,0.8)' }}>innovation&mdash;and publish their insights in the <a onClick={() => ClainV2.navigate('#')} style={{ color: 'rgba(255,255,255,0.8)', cursor: 'pointer', textDecoration: 'underline' }}>AI research blog</a>.</p>
              </div>
            </div>
          </div>

          {/* AI Group Leadership label */}
          <div className="flex items-center pt-[8px] pb-[1px] w-full" style={{ borderBottom: '1px solid #393f4b' }}>
            <p className="m-0 uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11, lineHeight: '14px', letterSpacing: '1.504px', color: 'white' }}>AI Group Leadership</p>
          </div>

          {/* Members grid (5 per row, 2 rows) with diagonal background */}
          <div className="relative overflow-clip py-[40px]">
            {/* Diagonal background SVG */}
            <div className="absolute" style={{ inset: '81.77px 0.06px 81.76px 0', overflow: 'hidden' }}>
              <div className="absolute" style={{ inset: '0.44% 0.09% -146.05% 0' }}>
                <img loading="lazy" decoding="async" alt="" className="absolute block inset-0 max-w-none size-full" src={teamImgGroupBg} />
              </div>
            </div>
            {/* Edge gradients */}
            <div className="absolute top-0 bottom-0 left-0 w-[10%]" style={{ background: 'linear-gradient(to right, #080f1e 0%, #080f1e 50%, rgba(8,15,30,0) 100%)' }} />
            <div className="absolute top-0 bottom-0 right-0 w-[10%]" style={{ background: 'linear-gradient(to left, #080f1e 0%, #080f1e 50%, rgba(8,15,30,0) 100%)' }} />
            <div className="absolute left-0 right-0 top-0 h-[25%]" style={{ background: 'linear-gradient(to bottom, #080f1e 0%, #080f1e 50%, rgba(8,15,30,0) 100%)' }} />
            <div className="absolute left-0 right-0 bottom-0 h-[25%]" style={{ background: 'linear-gradient(to top, #080f1e 0%, #080f1e 50%, rgba(8,15,30,0) 100%)' }} />

            {/* Members */}
            <div className="relative grid grid-cols-5 gap-y-[40px]" style={{ minHeight: 296 }}>
              {TEAM_MEMBERS.map((m) => (
                <div key={m.name} className="flex flex-col items-center gap-[4px]" style={{ mixBlendMode: 'luminosity' }}>
                  <div className="rounded-full size-[80px] flex items-center justify-center overflow-hidden" style={{ background: '#080f1e', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <img loading="lazy" decoding="async" alt={m.name} className="block size-[78px] object-cover rounded-full" src={m.img} />
                  </div>
                  <p className="m-0 mt-[8px] text-center whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, lineHeight: '14px', color: 'white' }}>{m.name}</p>
                  <div className="flex flex-col items-center px-[8px] max-w-[132.19px]">
                    {m.role.map((r, i) => (
                      <p key={i} className="m-0 text-center whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 11.1, lineHeight: '15px', color: 'rgba(255,255,255,0.6)' }}>{r}</p>
                    ))}
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


  /* ═══ PRICING SECTION ═══ */

// ═══════════════════════════════════════════════════════════════════
// Pricing section (Figma node 2:30006) — extracted from MCP
// ═══════════════════════════════════════════════════════════════════
const pricingImgVector       = "/v2/assets/0afa7e77-1026-4dde-aedf-a3ecad9bb491.svg";
const pricingImgVector1      = "/v2/assets/e3050bd2-41fc-4144-ad86-b5a7a0cade63.svg";
const pricingImgSpanAbs1     = "/v2/assets/77c0fed2-5670-4f20-9801-a236c616d6b0.svg";
const pricingImgSpanAbs2     = "/v2/assets/d0dbc802-8198-411f-8349-a65379dbba6f.svg";
const pricingImgSpanAbs3     = "/v2/assets/a8ce660f-bd24-47fe-9bb5-63b9a4ef7f45.svg";

function PricingSection() {
  return (
    <div className="relative w-full" style={{ background: '#020917' }}>
      <div className="relative max-w-[1440px] mx-auto px-[48px] pt-[32px] pb-[48px]">
        {/* Heading + Clain Million Dollar Guarantee */}
        <div className="flex flex-col gap-[32px] pb-[48px]">
          <h2 className="m-0 text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 71, lineHeight: '72px', letterSpacing: '-3.6px' }}>
            <span style={{ display: 'block' }}>Get the #1 AI Agent for</span>
            <span style={{ display: 'block' }}>all your customer service</span>
          </h2>
          <div className="flex items-center pl-[16px] gap-[10px]">
            <svg width="12" height="11" viewBox="0 0 12 11" fill="none"><path d="M2 5.5L5 8.5L10 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <p className="m-0 uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13.7, lineHeight: '14px', letterSpacing: '1.4px', color: 'white' }}>CLAIN MILLION DOLLAR GUARANTEE</p>
            <div className="flex items-center justify-center size-[16px]" style={{ border: '1px solid #9c9fa5' }}>
              <svg width="5" height="9" viewBox="0 0 5 9" fill="none"><path d="M2.5 2v5" stroke="#9c9fa5" strokeWidth="1"/><circle cx="2.5" cy="0.8" r="0.5" fill="#9c9fa5"/></svg>
            </div>
          </div>
        </div>

        {/* Two-card grid */}
        <div className="grid grid-cols-2 gap-[16px] pb-[40px]" style={{ minHeight: 478.41 }}>
          {/* LEFT: Clain with your current helpdesk */}
          <div className="relative px-[33px] pt-[40px] pb-[41px] flex flex-col" style={{ background: 'linear-gradient(to bottom, #020917 0%, rgba(2,9,23,0.01) 100%)', border: '1px solid rgba(255,255,255,0.4)', backdropFilter: 'blur(4px)' }}>
            <div className="flex flex-col items-start pb-[16px]">
              <p className="m-0 text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 29.1, lineHeight: '35.2px', letterSpacing: '-0.64px' }}>
                <span style={{ display: 'block' }}>Clain with your</span>
                <span style={{ display: 'block' }}>current helpdesk</span>
              </p>
            </div>
            <div className="pb-[36px] w-[350px]">
              <p className="m-0 whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 12.8, lineHeight: '18px', letterSpacing: '0.496px', color: '#9c9fa5' }}>Clain AI Agent works seamlessly with any helpdesk,</p>
              <p className="m-0 whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 12.8, lineHeight: '18px', letterSpacing: '0.496px', color: '#9c9fa5' }}>including Salesforce, HubSpot, and more.</p>
            </div>
            <div className="relative" style={{ height: 128 }}>
              <p className="absolute m-0 text-white whitespace-nowrap" style={{ left: 0, bottom: 68, fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 60, lineHeight: '60px' }}>$0.99</p>
              <div className="absolute" style={{ left: 175.62, bottom: 70, minWidth: 175 }}>
                <div className="flex items-center gap-[10px]">
                  <p className="m-0 uppercase whitespace-nowrap text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.1, lineHeight: '14.85px', letterSpacing: '1.1px' }}>per outcome</p>
                  <div className="flex items-center justify-center size-[16px]" style={{ border: '1px solid #9c9fa5' }}>
                    <svg width="5" height="9" viewBox="0 0 5 9" fill="none"><path d="M2.5 2v5" stroke="#9c9fa5" strokeWidth="1"/><circle cx="2.5" cy="0.8" r="0.5" fill="#9c9fa5"/></svg>
                  </div>
                </div>
                <div className="max-w-[175px] mt-[4px]">
                  <p className="m-0 uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.1, lineHeight: '14.85px', letterSpacing: '1.1px', color: 'rgba(255,255,255,0.6)' }}>50 outcomes per month</p>
                  <p className="m-0 uppercase whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.1, lineHeight: '14.85px', letterSpacing: '1.1px', color: 'rgba(255,255,255,0.6)' }}>minimum</p>
                </div>
              </div>
            </div>
            <div className="flex gap-[16px] items-center mt-[24px]">
              <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer flex items-center justify-center px-[16px] py-[12px] rounded-[6px] border-0 bg-white text-black" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.4, lineHeight: '16px', letterSpacing: '-0.32px' }}>Free 14 day trial</button>
              <button onClick={() => ClainV2.navigate('/demo')} className="cursor-pointer bg-transparent border-0 pb-[2px] text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.9, lineHeight: '16px', borderBottom: '1px solid white' }}>Get a demo</button>
            </div>
          </div>

          {/* RIGHT: Clain with Clain Helpdesk */}
          <div className="relative" style={{ border: '1px solid rgba(255,255,255,0.4)' }}>
            <div className="px-[32px] pt-[39.1px] pb-[40px] flex flex-col" style={{ backdropFilter: 'blur(4px)', opacity: 0.95 }}>
              <div className="flex flex-col items-start pb-[16px]">
                <p className="m-0 text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 29.6, lineHeight: '35.2px', letterSpacing: '-0.64px' }}>
                  <span style={{ display: 'block' }}>Clain with</span>
                  <span style={{ display: 'block' }}>Clain&rsquo;s Helpdesk</span>
                </p>
              </div>
              <div className="pb-[36px] w-[350px]">
                <p className="m-0 whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13.1, lineHeight: '18px', letterSpacing: '0.496px', color: '#9c9fa5' }}>Combine Clain AI Agent with Clain&rsquo;s Helpdesk to</p>
                <p className="m-0 whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13.1, lineHeight: '18px', letterSpacing: '0.496px', color: '#9c9fa5' }}>get the full Clain Customer Service Suite.</p>
              </div>
              <div className="flex gap-[12px] items-end pt-[24px]">
                <div className="flex gap-[4px] items-center">
                  <span className="text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 14.8, lineHeight: '24px' }}>From</span>
                  <span className="text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 32, lineHeight: '32px' }}>$0.99</span>
                </div>
                <div className="relative" style={{ height: 29.69, width: 83.27 }}>
                  <div className="absolute uppercase" style={{ left: 0, top: 0, width: 57.46, fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 9.8, lineHeight: '14.85px', letterSpacing: '1.1px', color: 'white' }}>
                    <span style={{ display: 'block' }}>per</span>
                    <span style={{ display: 'block' }}>outcome</span>
                  </div>
                  <div className="absolute flex items-center justify-center size-[16px]" style={{ left: 67.26, bottom: 0, border: '1px solid #9c9fa5' }}>
                    <svg width="5" height="9" viewBox="0 0 5 9" fill="none"><path d="M2.5 2v5" stroke="#9c9fa5" strokeWidth="1"/><circle cx="2.5" cy="0.8" r="0.5" fill="#9c9fa5"/></svg>
                  </div>
                </div>
              </div>
              <p className="m-0 uppercase" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 24, lineHeight: '32px', color: '#9c9fa5' }}>+</p>
              <div className="flex gap-[12px] items-end pb-[36px]">
                <span className="text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 32, lineHeight: '32px' }}>$29</span>
                <div className="relative" style={{ height: 29.69, width: 178.75 }}>
                  <div className="absolute uppercase" style={{ left: 0, top: 0, width: 125.55, fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.7, lineHeight: '14.85px', letterSpacing: '1.1px', color: 'white' }}>
                    <span style={{ display: 'block' }}>per helpdesk seat</span>
                    <span style={{ display: 'block' }}>per month </span>
                  </div>
                  <div className="absolute" style={{ left: 74.72, top: 14.84 }}>
                    <a onClick={() => ClainV2.navigate('/pricing')} className="uppercase cursor-pointer underline whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 10.7, lineHeight: '14.85px', letterSpacing: '1.1px', color: 'white' }}>(see all plans)</a>
                  </div>
                </div>
              </div>
              <div className="flex gap-[16px] items-center">
                <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer bg-transparent flex items-center justify-center px-[17px] py-[13px] rounded-[6px] text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.8, lineHeight: '16px', letterSpacing: '-0.32px', border: '1px solid white' }}>Free 14 day trial</button>
                <button onClick={() => ClainV2.navigate('/demo')} className="cursor-pointer bg-transparent border-0 pb-[2px] text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.9, lineHeight: '16px', borderBottom: '1px solid white' }}>Get a demo</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


  /* ═══ FINAL CTA SECTION ═══ */

// ═══════════════════════════════════════════════════════════════════
// Final CTA section (Figma node 2:30184) — extracted from MCP
// ═══════════════════════════════════════════════════════════════════
const ctaImgSolarFlare       = "/v2/assets/917a1793-dafa-4bef-8ff6-327d7015d843.jpg";
const ctaImgMaskTransparent  = "/v2/assets/e5f3a4f4-474a-4c61-b090-995f9be1b7a5.svg";

function FinalCtaSection() {
  return (
    <div className="relative w-full overflow-hidden pb-[48px]" style={{ background: '#020917' }}>
      <div className="relative max-w-[1440px] mx-auto" style={{ minHeight: 666 }}>
        {/* Solar flare background with mask */}
        <div className="absolute" style={{ left: 0, right: 0, top: -120, bottom: 48, maskImage: `url('${ctaImgMaskTransparent}')`, WebkitMaskImage: `url('${ctaImgMaskTransparent}')`, maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}>
          <div className="absolute inset-0 overflow-hidden">
            <img loading="lazy" decoding="async" alt="" className="absolute left-0 max-w-none w-full" style={{ top: '-1.05%', height: '102.1%' }} src={ctaImgSolarFlare} />
          </div>
        </div>
        {/* Content grid */}
        <div className="relative grid grid-cols-12 gap-[48px] max-w-[1600px] mx-auto px-[24px] py-[200px] overflow-clip" style={{ height: 666 }}>
          <div className="col-start-3 col-span-8 self-start" style={{ height: 266 }}>
            <div className="flex flex-col gap-[0.5px] pb-[32px]">
              <p className="m-0 whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 93.9, lineHeight: '96px', letterSpacing: '-3.008px', color: 'rgba(255,255,255,0.6)' }}>Get started with the</p>
              <p className="m-0 text-right whitespace-nowrap" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, fontSize: 92.6, lineHeight: '96px', letterSpacing: '-3.008px', color: 'white' }}>#1 AI Agent today</p>
            </div>
            <div className="flex flex-wrap gap-[12px] h-[42px]">
              <button onClick={() => ClainV2.navigate('/signup')} className="cursor-pointer h-full flex items-center justify-center px-[16px] py-[13px] rounded-[6px] border-0 bg-white text-black" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.4, lineHeight: '16px', letterSpacing: '-0.32px' }}>Start free trial</button>
              <button onClick={() => ClainV2.navigate('/demo')} className="cursor-pointer bg-transparent h-full flex items-center justify-center px-[17px] py-[13px] rounded-[6px] text-white" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 14.8, lineHeight: '16px', letterSpacing: '-0.32px', border: '1px solid white' }}>View demo</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


  /* ─────────── Chapter Navigation (sticky left sidebar) ─────────── */
  const AGENT_CHAPTERS = [
    { id: 'performance',  num: '01', label: 'performance' },
    { id: 'integrations', num: '02', label: 'integrations' },
    { id: 'technology',   num: '03', label: 'technology' },
    { id: 'ai-team',      num: '04', label: 'ai team' },
    { id: 'pricing',      num: '05', label: 'pricing' },
  ];

  function AgentChapterNav({ activeId, onClick }) {
    return (
      <div className="content-stretch flex flex-col items-start relative w-full">
        {AGENT_CHAPTERS.map((c) => (
          <div key={c.id} className="content-stretch flex flex-col items-start relative shrink-0 w-full">
            <a
              href={'#' + c.id}
              onClick={(e) => { e.preventDefault(); onClick(c.id); }}
              className="content-stretch cursor-pointer flex items-start justify-center py-[10px] relative shrink-0 w-full"
              style={{ textDecoration: 'none' }}
            >
              <div className="content-stretch flex flex-1 items-center min-w-px relative">
                <div className="content-stretch flex flex-col items-start pr-[12px] relative shrink-0">
                  <p className="m-0 text-[11px] text-left tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: activeId === c.id ? 'white' : 'rgba(255,255,255,0.6)' }}>{c.num}</p>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0">
                  <p className="m-0 text-[11px] text-left tracking-[1.504px] uppercase whitespace-nowrap leading-[14px]" style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, color: activeId === c.id ? 'white' : 'rgba(255,255,255,0.6)' }}>{c.label}</p>
                </div>
              </div>
            </a>
            <div className="h-px relative shrink-0 w-full" style={{ background: activeId === c.id ? '#ff5600' : 'rgba(255,255,255,0.2)' }} />
          </div>
        ))}
      </div>
    );
  }

  function AiAgentPage() {
    const [activeSection, setActiveSection] = useState('performance');

    useEffect(() => {
      const sections = AGENT_CHAPTERS.map(c => document.getElementById(c.id)).filter(Boolean);
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
        <HeroSection />
        {/* Main content area with sticky sidebar */}
        <div style={{ background: '#020917', width: '100%' }}>
          <div style={{ maxWidth: 1440, margin: '0 auto', paddingLeft: 24, paddingRight: 24, position: 'relative' }}>
            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
              <aside style={{ width: 205, flexShrink: 0, position: 'sticky', top: 100, paddingTop: 16 }}>
                <AgentChapterNav activeId={activeSection} onClick={scrollToSection} />
              </aside>
              <div style={{ flex: 1, minWidth: 0, maxWidth: 1155 }}>
                <section id="performance"  style={{ scrollMarginTop: 80 }}>
                  <div className="w-full" style={{ background: '#f6f6f1' }}>
                    <PerfSection />
                  </div>
                </section>
                <section id="integrations" style={{ scrollMarginTop: 80 }}>
                  <div className="w-full" style={{ background: '#080f1e' }}>
                    <IntegSection />
                  </div>
                </section>
                <section id="technology"   style={{ scrollMarginTop: 80 }}><TechnologySection /></section>
                <section id="ai-team"      style={{ scrollMarginTop: 80 }}><AiTeamSection /></section>
                <section id="pricing"      style={{ scrollMarginTop: 80 }}><PricingSection /></section>
              </div>
            </div>
          </div>
          <FinalCtaSection />
        </div>
      </PageShell>
    );
  }

  window.AiAgentPage = AiAgentPage;
})();
