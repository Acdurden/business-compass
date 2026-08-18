import { createFileRoute } from "@tanstack/react-router";
import { KRITERION_LOGO } from "@/assets/kriterionLogo";

// Public "coming soon" landing for kriterionbvi.com.
// The advisor/client app lives behind the "Team Sign-In" link at /login.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kriterion LLC — A Business Value Intelligence Platform" },
      {
        name: "description",
        content:
          "Kriterion — the transaction-readiness advisor for business owners approaching exit. Coming Q1 2027.",
      },
      { property: "og:title", content: "Kriterion LLC" },
      {
        property: "og:description",
        content: "A Business Value Intelligence Platform. Coming Q1 2027.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@1,8..60,400;0,8..60,400&display=swap",
      },
    ],
  }),
  component: ComingSoon,
});

const CSS = `
.ks-root{
  --ks-navy:#1f3a5f; --ks-navy-deep:#16304f; --ks-sky:#6ba3d6;
  --ks-ink:#2a3b4d; --ks-muted:#64748b; --ks-line:rgba(31,58,95,.12); --ks-bg:#f6f9fc;
  font-family:"Inter",ui-sans-serif,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:var(--ks-ink); min-height:100vh; display:flex; align-items:center; justify-content:center;
  position:relative; overflow:hidden; -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(1200px 700px at 78% -8%, #eaf2fb 0%, rgba(234,242,251,0) 60%),
    radial-gradient(1000px 800px at -6% 110%, #eef4fb 0%, rgba(238,244,251,0) 55%),
    linear-gradient(180deg,#ffffff 0%, var(--ks-bg) 100%);
}
.ks-net{position:fixed; inset:0; width:100%; height:100%; z-index:0; pointer-events:none}
.ks-net .ks-node{fill:var(--ks-navy)}
.ks-net .ks-edge{stroke:var(--ks-navy); stroke-width:1; fill:none}
.ks-net .ks-pulse{animation:ks-tw 5.5s ease-in-out infinite}
@keyframes ks-tw{0%,100%{opacity:.9}50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.ks-net .ks-pulse{animation:none}}
.ks-wrap{position:relative; z-index:1; width:min(680px,90vw); text-align:center; padding:48px 24px}
.ks-eyebrow{
  display:inline-flex; align-items:center; gap:9px;
  font-size:12px; font-weight:600; letter-spacing:.24em; text-transform:uppercase;
  color:var(--ks-navy); margin-bottom:38px; padding:7px 15px;
  border:1px solid var(--ks-line); border-radius:999px;
  background:rgba(255,255,255,.6); backdrop-filter:blur(4px);
}
.ks-dot{width:7px;height:7px;border-radius:50%;background:var(--ks-sky); animation:ks-beat 2.4s ease-out infinite}
@keyframes ks-beat{0%{box-shadow:0 0 0 0 rgba(107,163,214,.5)}70%{box-shadow:0 0 0 9px rgba(107,163,214,0)}100%{box-shadow:0 0 0 0 rgba(107,163,214,0)}}
.ks-logo{width:min(440px,78vw); height:auto; display:block; margin:0 auto}
.ks-subtitle{margin-top:20px; font-size:clamp(11px,2.4vw,13.5px); font-weight:600;
  letter-spacing:.28em; text-transform:uppercase; color:var(--ks-navy)}
.ks-rule{width:54px;height:2px;background:var(--ks-sky);opacity:.7;margin:34px auto 30px;border-radius:2px}
.ks-tagline{
  font-family:"Source Serif 4",Georgia,"Times New Roman",serif; font-style:italic;
  font-size:clamp(19px,3.4vw,25px); line-height:1.5; color:#334862; max-width:22ch; margin:0 auto; font-weight:400}
.ks-cta{margin-top:46px; display:flex; flex-direction:column; align-items:center; gap:11px}
.ks-btn{
  display:inline-flex; align-items:center; gap:10px; background:var(--ks-navy); color:#fff; text-decoration:none;
  font-weight:600; font-size:15px; padding:14px 26px; border-radius:10px;
  box-shadow:0 8px 22px -10px rgba(22,48,79,.55);
  transition:transform .15s ease, box-shadow .15s ease, background .15s ease}
.ks-btn:hover{background:var(--ks-navy-deep); transform:translateY(-1px); box-shadow:0 12px 26px -10px rgba(22,48,79,.6)}
.ks-btn .ks-arw{transition:transform .15s ease}
.ks-btn:hover .ks-arw{transform:translateX(3px)}
.ks-foot{position:fixed; bottom:22px; left:0; right:0; text-align:center; z-index:1;
  font-size:12px; color:var(--ks-muted); letter-spacing:.04em}
`;

function ComingSoon() {
  return (
    <div className="ks-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <svg
        className="ks-net"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <g opacity="0.10">
          <path
            className="ks-edge"
            d="M1180,90 L1290,160 M1290,160 L1250,280 M1250,280 L1130,300 M1130,300 L1180,90 M1290,160 L1400,120 M1130,300 L1030,220 M1030,220 L1180,90"
          />
          <circle className="ks-node ks-pulse" cx="1180" cy="90" r="4" />
          <circle className="ks-node" cx="1290" cy="160" r="5" />
          <circle
            className="ks-node ks-pulse"
            cx="1250"
            cy="280"
            r="4"
            style={{ animationDelay: "1.2s" }}
          />
          <circle className="ks-node" cx="1130" cy="300" r="3.5" />
          <circle
            className="ks-node ks-pulse"
            cx="1400"
            cy="120"
            r="3.5"
            style={{ animationDelay: ".6s" }}
          />
          <circle className="ks-node" cx="1030" cy="220" r="3" />
          <path
            className="ks-edge"
            d="M120,640 L60,760 M60,760 L180,830 M180,830 L260,720 M260,720 L120,640 M260,720 L370,780 M120,640 L40,560 M180,830 L300,860"
          />
          <circle className="ks-node" cx="120" cy="640" r="5" />
          <circle
            className="ks-node ks-pulse"
            cx="60"
            cy="760"
            r="4"
            style={{ animationDelay: ".9s" }}
          />
          <circle className="ks-node" cx="180" cy="830" r="3.5" />
          <circle
            className="ks-node ks-pulse"
            cx="260"
            cy="720"
            r="4"
            style={{ animationDelay: "1.8s" }}
          />
          <circle className="ks-node" cx="370" cy="780" r="3" />
          <circle className="ks-node" cx="40" cy="560" r="3" />
        </g>
      </svg>

      <main className="ks-wrap">
        <span className="ks-eyebrow">
          <span className="ks-dot" />
          Coming Q1 2027
        </span>
        <img className="ks-logo" src={KRITERION_LOGO} alt="KRITERION LLC" />
        <div className="ks-subtitle">A Business Value Intelligence Platform</div>
        <div className="ks-rule" />
        <p className="ks-tagline">
          The defining standard by which decisions are made and success is measured.
        </p>
        <div className="ks-cta">
          <a className="ks-btn" href="/login">
            Team Sign-In <span className="ks-arw">&rarr;</span>
          </a>
        </div>
      </main>
      <div className="ks-foot">&copy; 2026 Kriterion LLC</div>
    </div>
  );
}
