/**
 * scripts/build-news.js
 * Generates static HTML pages for each news item in content/news.json,
 * as well as the /news listing page. Pure static HTML — zero client-side hydration.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const NEWS_FILE = path.join(ROOT_DIR, 'content', 'news.json');
const NEWS_OUTPUT_DIR = path.join(ROOT_DIR, 'news');
const VERCEL_JSON_PATH = path.join(ROOT_DIR, 'vercel.json');

// Ensure news directory exists
if (!fs.existsSync(NEWS_OUTPUT_DIR)) {
  fs.mkdirSync(NEWS_OUTPUT_DIR, { recursive: true });
}

// Read news data
const newsData = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));

function renderHeader(activePage = 'news') {
  return `
    <div id="phi-announcement-bar" class="phi-announcement-bar"></div>
    <header>
        <a href="/" class="logo">
            <img src="/assets/phi-lab-mark-reverse.svg" alt="PHI Lab Mark" class="logo-mark">
            <span>PHI Lab</span>
        </a>

        <ul class="nav-links">
            <li class="nav-item" data-has-panel>
                <button class="nav-trigger">PHI Suites <span class="caret"></span></button>
                <div class="nav-panel">
                    <div class="nav-panel-grid">
                        <a href="/suites/phi-twin.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-01</span>
                            <span class="nav-panel-copy"><h4>PHI-Twin</h4><p>Edge digital twins for landing gear &amp; structural health.</p></span>
                        </a>
                        <a href="/suites/phi-chain.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-02</span>
                            <span class="nav-panel-copy"><h4>PHI-Chain</h4><p>Split-payload blockchain security for avionics data integrity.</p></span>
                        </a>
                        <a href="/suites/phi-arc.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-03</span>
                            <span class="nav-panel-copy"><h4>PHI-Arc</h4><p>Turbine blade prognostics with real-time fault injection.</p></span>
                        </a>
                        <a href="/suites/phi-sense.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-04</span>
                            <span class="nav-panel-copy"><h4>PHI-Sense</h4><p>Autonomous sensing pods &amp; ruggedized IoT edge nodes.</p></span>
                        </a>
                        <a href="/suites/phi-engine.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-05</span>
                            <span class="nav-panel-copy"><h4>PHI-Engine</h4><p>Predictive degradation intelligence for turbofan powerplants.</p></span>
                        </a>
                        <a href="/suites/phi-drone.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-06</span>
                            <span class="nav-panel-copy"><h4>PHI-Drone</h4><p>HIL validation for autonomous UAV trajectory &amp; fail-safes.</p></span>
                        </a>
                        <a href="/suites/phi-swarm.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-07</span>
                            <span class="nav-panel-copy"><h4>PHI-Swarm</h4><p>Decentralized multi-agent collaborative UAV swarming.</p></span>
                        </a>
                        <a href="/suites/phi-ctrl.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-08</span>
                            <span class="nav-panel-copy"><h4>PHI-Ctrl</h4><p>Physics-hybrid fault-tolerant flight control validated in JSBSim.</p></span>
                        </a>
                        <a href="/suites/phi-spike.html" class="nav-panel-link">
                            <span class="nav-panel-tag">PHI-09</span>
                            <span class="nav-panel-copy"><h4>PHI-Spike</h4><p>Neuromorphic event-driven avionics &amp; ultra-low-power edge compute.</p></span>
                        </a>
                    </div>
                </div>
            </li>

            <li class="nav-item"><a href="/services/index.html" class="nav-trigger">Services</a></li>
            <li class="nav-item"><a href="/lab.html" class="nav-trigger">The Lab</a></li>
            <li class="nav-item"><a href="/news/index.html" class="nav-trigger" style="color: ${activePage === 'news' ? 'var(--amber)' : 'inherit'}; font-weight: ${activePage === 'news' ? '600' : '500'};">News</a></li>
            <li class="nav-item"><a href="/about.html" class="nav-trigger">About</a></li>
            <li class="nav-item"><a href="/join.html" class="nav-trigger">Join Us</a></li>
            <li class="nav-item"><a href="/contact.html" class="nav-trigger">Contact</a></li>
        </ul>

        <button class="nav-hamburger" aria-label="Open menu">
            <span></span><span></span><span></span>
        </button>
    </header>

    <div class="mobile-drawer">
        <div class="mobile-accordion-item">
            <button class="mobile-accordion-trigger">PHI Suites <span class="caret"></span></button>
            <div class="mobile-accordion-panel">
                <a href="/suites/phi-twin.html"><span class="nav-panel-tag">PHI-01</span> PHI-Twin</a>
                <a href="/suites/phi-chain.html"><span class="nav-panel-tag">PHI-02</span> PHI-Chain</a>
                <a href="/suites/phi-arc.html"><span class="nav-panel-tag">PHI-03</span> PHI-Arc</a>
                <a href="/suites/phi-sense.html"><span class="nav-panel-tag">PHI-04</span> PHI-Sense</a>
                <a href="/suites/phi-engine.html"><span class="nav-panel-tag">PHI-05</span> PHI-Engine</a>
                <a href="/suites/phi-drone.html"><span class="nav-panel-tag">PHI-06</span> PHI-Drone</a>
                <a href="/suites/phi-swarm.html"><span class="nav-panel-tag">PHI-07</span> PHI-Swarm</a>
                <a href="/suites/phi-ctrl.html"><span class="nav-panel-tag">PHI-08</span> PHI-Ctrl</a>
                <a href="/suites/phi-spike.html"><span class="nav-panel-tag">PHI-09</span> PHI-Spike</a>
            </div>
        </div>
        <a href="/services/index.html" class="mobile-simple-link">Services</a>
        <a href="/lab.html" class="mobile-simple-link">The Lab</a>
        <a href="/news/index.html" class="mobile-simple-link" style="color: ${activePage === 'news' ? 'var(--amber)' : 'inherit'}; font-weight: ${activePage === 'news' ? '600' : '400'};">News</a>
        <a href="/about.html" class="mobile-simple-link">About</a>
        <a href="/join.html" class="mobile-simple-link">Join Us</a>
        <a href="/contact.html" class="mobile-simple-link">Contact</a>
    </div>
  `;
}

function renderFooter() {
  return `
    <footer>
        <div class="footer-top">
            <div class="footer-brand" style="display:flex; align-items:center; gap:0.6rem;">
                <img src="/assets/phi-lab-mark-reverse.svg" alt="PHI Lab Mark" style="width:28px; height:28px;">
                <span>PHI Lab</span>
            </div>
            <div class="footer-links">
                <div>
                    <h4>PHI Suites</h4>
                    <ul>
                        <li><a href="/suites/phi-twin.html">PHI-Twin</a></li>
                        <li><a href="/suites/phi-chain.html">PHI-Chain</a></li>
                        <li><a href="/suites/phi-arc.html">PHI-Arc</a></li>
                        <li><a href="/suites/phi-sense.html">PHI-Sense</a></li>
                        <li><a href="/suites/phi-engine.html">PHI-Engine</a></li>
                        <li><a href="/suites/phi-drone.html">PHI-Drone</a></li>
                        <li><a href="/suites/phi-swarm.html">PHI-Swarm</a></li>
                        <li><a href="/suites/phi-ctrl.html">PHI-Ctrl</a></li>
                        <li><a href="/suites/phi-spike.html">PHI-Spike</a></li>
                    </ul>
                </div>
                <div>
                    <h4>Services</h4>
                    <ul>
                        <li><a href="/services/index.html#dt-education">Digital Twin Training</a></li>
                        <li><a href="/services/index.html#church-hubs">Church Apps</a></li>
                        <li><a href="/services/index.html#cybersecurity">Security Architecture</a></li>
                    </ul>
                </div>
                <div>
                    <h4>Organization</h4>
                    <ul>
                        <li><a href="/lab.html">The Lab (Kaduna)</a></li>
                        <li><a href="/news/index.html">News &amp; Dispatches</a></li>
                        <li><a href="/about.html">About Us</a></li>
                        <li><a href="/join.html">Join Us</a></li>
                        <li><a href="/contact.html">Contact Us</a></li>
                    </ul>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 PHI Lab (Physics Hybrid Integrity Lab). All rights reserved.</p>
            <p>Kaduna Aerospace Technologies Facility &bull; DIMASA Initiative</p>
        </div>
    </footer>
  `;
}

// 1. Filter only published items
const publishedItems = newsData.filter(i => i && i.published === true);

// Clean up any stale/unpublished detail pages in news/
const validHtmlFiles = new Set(publishedItems.map(i => `${i.id}.html`));
validHtmlFiles.add('index.html');
fs.readdirSync(NEWS_OUTPUT_DIR).forEach(file => {
  if (file.endsWith('.html') && !validHtmlFiles.has(file)) {
    fs.unlinkSync(path.join(NEWS_OUTPUT_DIR, file));
    console.log(`Cleaned up unpublished page: news/${file}`);
  }
});

// Generate Detail Pages for each published item
publishedItems.forEach(item => {
  const partnerStripHtml = (item.partnerApproved && item.partners && item.partners.length > 0) ? `
    <div class="partner-strip">
      <div class="partner-strip-label">APPROVED COLLABORATING PARTNER</div>
      <div class="partner-logos">
        ${item.partners.map(p => `
          <div class="partner-logo-item">
            <img src="${p.logo}" alt="${p.name}">
            <span>${p.name}</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const detailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${item.title} | PHI Lab News</title>
    <meta name="description" content="${item.summary.replace(/"/g, '&quot;')}">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="manifest" href="/manifest.json">

    <!-- Open Graph / Social Tags -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${item.title.replace(/"/g, '&quot;')} | PHI Lab">
    <meta property="og:description" content="${item.summary.replace(/"/g, '&quot;')}">
    <meta property="og:image" content="${item.image}">
    <meta property="og:url" content="https://penelope-inc.vercel.app/news/${item.id}.html">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${item.title.replace(/"/g, '&quot;')} | PHI Lab">
    <meta name="twitter:description" content="${item.summary.replace(/"/g, '&quot;')}">
    <meta name="twitter:image" content="${item.image}">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">

    <!-- Styles -->
    <link rel="stylesheet" href="/assets/tokens.css">
    <link rel="stylesheet" href="/assets/nav.css">

    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        img { max-width: 100%; height: auto; }
        .news-article-wrap {
            max-width: 840px;
            margin: 0 auto;
            padding: 8.5rem 5% 6rem;
        }
        .news-back-link {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--slate);
            font-size: 0.88rem;
            font-weight: 600;
            margin-bottom: 2rem;
            text-decoration: none;
            transition: color 0.2s ease;
        }
        .news-back-link:hover {
            color: var(--amber);
        }
        .news-meta-row {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.2rem;
        }
        .news-date {
            font-family: var(--font-mono);
            font-size: 0.8rem;
            color: var(--slate);
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }
        .news-badge {
            background: var(--amber-soft);
            color: var(--navy);
            border: 1px solid rgba(232, 163, 61, 0.4);
            font-family: var(--font-mono);
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: 2px 8px;
            border-radius: 4px;
        }
        .news-title {
            font-family: var(--font-heading);
            font-size: clamp(2rem, 4.5vw, 3.2rem);
            font-weight: 800;
            line-height: 1.15;
            color: var(--navy);
            margin-bottom: 1.5rem;
        }
        .news-lede {
            font-size: 1.2rem;
            line-height: 1.6;
            color: var(--slate);
            margin-bottom: 2.5rem;
            border-left: 3px solid var(--amber);
            padding-left: 1.2rem;
        }
        .news-hero-img-box {
            width: 100%;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 2.5rem;
            border: 1px solid var(--border-light);
            background: #ffffff;
            box-shadow: 0 10px 30px rgba(15, 29, 46, 0.05);
        }
        .news-hero-img-box img {
            width: 100%;
            height: auto;
            display: block;
        }
        .news-body {
            font-size: 1.05rem;
            line-height: 1.8;
            color: var(--navy);
        }
        .news-body p {
            margin-bottom: 1.4rem;
        }
        .partner-strip {
            margin-top: 3.5rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border-light);
        }
        .partner-strip-label {
            font-family: var(--font-mono);
            font-size: 0.72rem;
            font-weight: 600;
            color: var(--slate);
            text-transform: uppercase;
            letter-spacing: 0.12em;
            margin-bottom: 1rem;
        }
        .partner-logos {
            display: flex;
            align-items: center;
            gap: 2rem;
            flex-wrap: wrap;
        }
        .partner-logo-item {
            display: flex;
            align-items: center;
            gap: 0.8rem;
            background: #ffffff;
            border: 1px solid var(--border-light);
            padding: 0.8rem 1.4rem;
            border-radius: 6px;
        }
        .partner-logo-item img {
            max-height: 38px;
            width: auto;
            display: block;
        }
        .partner-logo-item span {
            font-weight: 600;
            font-size: 0.95rem;
            color: var(--navy);
        }
    </style>
</head>
<body>
    ${renderHeader('news')}

    <main class="news-article-wrap">
        <a href="/news/index.html" class="news-back-link">&larr; Back to all News &amp; Dispatches</a>
        
        <div class="news-meta-row">
            <span class="news-date">${item.date}</span>
            ${item.featured ? '<span class="news-badge">Featured Dispatch</span>' : ''}
            ${!item.published ? '<span class="news-badge" style="background:#FFE4E6; border-color:#FDA4AF; color:#9F1239;">Draft Preview</span>' : ''}
        </div>

        <h1 class="news-title">${item.title}</h1>
        <p class="news-lede">${item.summary}</p>

        <div class="news-hero-img-box">
            <img src="${item.image}" alt="${item.title.replace(/"/g, '&quot;')}">
        </div>

        <div class="news-body">
            ${item.content}
        </div>

        ${partnerStripHtml}

        <div class="phi-arc-divider">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 28" width="160" height="28" fill="none" role="presentation" aria-hidden="true">
              <circle cx="16" cy="18" r="3.5" fill="#5B6B7D" opacity="0.35"/>
              <circle cx="38" cy="12" r="3.8" fill="#5B6B7D" opacity="0.55"/>
              <circle cx="60" cy="8" r="4.2" fill="#5B6B7D" opacity="0.8"/>
              <circle cx="80" cy="6" r="4.8" fill="#E8A33D"/>
              <circle cx="100" cy="8" r="4.2" fill="#5B6B7D" opacity="0.8"/>
              <circle cx="122" cy="12" r="3.8" fill="#5B6B7D" opacity="0.55"/>
              <circle cx="144" cy="18" r="3.5" fill="#5B6B7D" opacity="0.35"/>
            </svg>
        </div>
    </main>

    ${renderFooter()}

    <script src="/assets/nav.js" defer></script>
    <script src="/assets/news-client.js" defer></script>
</body>
</html>`;

  const itemFilePath = path.join(NEWS_OUTPUT_DIR, `${item.id}.html`);
  fs.writeFileSync(itemFilePath, detailHtml, 'utf8');
  console.log(`Generated news detail page: news/${item.id}.html`);
});

// 2. Generate /news/index.html (News Index Page)
const featuredItem = publishedItems.find(i => i.featured) || publishedItems[0];
const otherItems = publishedItems.filter(i => i !== featuredItem);

const newsIndexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>News &amp; Dispatches | PHI Lab — DIMASA</title>
    <meta name="description" content="Official announcements, aerospace research milestones, and institutional dispatches from PHI Lab (Physics Hybrid Integrity Lab).">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png">
    <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    <link rel="manifest" href="/manifest.json">

    <!-- Open Graph / Social Tags -->
    <meta property="og:type" content="website">
    <meta property="og:title" content="News &amp; Dispatches | PHI Lab">
    <meta property="og:description" content="Official announcements, aerospace research milestones, and institutional dispatches from PHI Lab.">
    <meta property="og:image" content="/assets/phi-lab-social-1200x630.png">
    <meta property="og:url" content="https://penelope-inc.vercel.app/news/index.html">
    <meta name="twitter:card" content="summary_large_image">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">

    <!-- Styles -->
    <link rel="stylesheet" href="/assets/tokens.css">
    <link rel="stylesheet" href="/assets/nav.css">

    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow-x: hidden; }
        img { max-width: 100%; height: auto; }
        a { text-decoration: none; color: inherit; }
        .news-hero {
            padding: 8.5rem 5% 4rem;
            background: var(--navy);
            color: var(--text-light);
            text-align: center;
        }
        .news-hero .section-label {
            color: var(--amber);
            margin-bottom: 0.8rem;
        }
        .news-hero h1 {
            font-size: clamp(2.2rem, 5vw, 3.6rem);
            margin-bottom: 1rem;
        }
        .news-hero p {
            max-width: 640px;
            margin: 0 auto;
            color: #CBD5E1;
            font-size: 1.1rem;
        }
        .news-feed-wrap {
            max-width: 1100px;
            margin: 0 auto;
            padding: 4rem 5% 6rem;
        }
        .news-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2.5rem;
        }
        .news-featured-card {
            background: #ffffff;
            border: 1px solid var(--border-light);
            border-radius: 10px;
            overflow: hidden;
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            text-decoration: none;
            color: inherit;
        }
        .news-featured-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 35px rgba(15, 29, 46, 0.08);
            border-color: var(--amber);
        }
        .news-featured-img {
            background: var(--paper-card);
            min-height: 280px;
        }
        .news-featured-img img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .news-featured-content {
            padding: 2.5rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .news-item-date {
            font-family: var(--font-mono);
            font-size: 0.78rem;
            color: var(--slate);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 0.8rem;
        }
        .news-featured-content h3 {
            font-size: 1.6rem;
            line-height: 1.25;
            color: var(--navy);
            margin-bottom: 1rem;
        }
        .news-featured-content p {
            color: var(--slate);
            font-size: 0.98rem;
            line-height: 1.6;
            margin-bottom: 1.5rem;
        }
        .news-read-more {
            font-weight: 700;
            font-size: 0.92rem;
            color: var(--navy);
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
        }
        .news-featured-card:hover .news-read-more {
            color: var(--amber);
        }
        .news-compact-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.8rem;
            margin-top: 1.5rem;
        }
        .news-compact-card {
            background: #ffffff;
            border: 1px solid var(--border-light);
            border-radius: 8px;
            padding: 1.8rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease;
        }
        .news-compact-card:hover {
            transform: translateY(-2px);
            border-color: var(--amber);
            box-shadow: 0 10px 25px rgba(15, 29, 46, 0.06);
        }
        .news-compact-card h4 {
            font-size: 1.2rem;
            margin: 0.5rem 0 0.8rem;
            color: var(--navy);
            line-height: 1.35;
        }
        .news-compact-card p {
            color: var(--slate);
            font-size: 0.92rem;
            line-height: 1.55;
            margin-bottom: 1.2rem;
        }
        .news-empty-state {
            text-align: center;
            padding: 5rem 2rem;
            background: #ffffff;
            border: 1px dashed var(--border-light);
            border-radius: 10px;
        }
        .news-empty-state h3 {
            font-size: 1.5rem;
            color: var(--navy);
            margin-bottom: 0.8rem;
        }
        .news-empty-state p {
            color: var(--slate);
            max-width: 500px;
            margin: 0 auto;
        }
        footer { font-size: 0.9rem; }
        .footer-top { display: flex; justify-content: space-between; margin-bottom: 3rem; flex-wrap: wrap; gap: 2rem; }
        .footer-links { display: flex; gap: 3rem; flex-wrap: wrap; }
        .footer-links div h4 { color: var(--text-light); margin-bottom: 1rem; font-size: 0.95rem; }
        .footer-links div ul { list-style: none; }
        .footer-links div ul li { margin-bottom: 0.6rem; }
        .footer-links div ul li a:hover { color: var(--text-light); }
        .footer-bottom { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
        @media (max-width: 960px) {
            .news-featured-card {
                grid-template-columns: 1fr;
            }
            .news-featured-img {
                height: 260px;
                min-height: auto;
            }
            .news-featured-content {
                padding: 1.8rem;
            }
            .news-featured-content h3 {
                font-size: 1.4rem;
            }
            .news-compact-list {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 600px) {
            .news-hero {
                padding: 7rem 5% 3rem;
            }
            .news-hero h1 {
                font-size: clamp(1.6rem, 5vw, 2.2rem);
            }
            .news-feed-wrap {
                padding: 2.5rem 5% 4rem;
            }
            .news-featured-img {
                height: 190px;
            }
            .news-featured-content {
                padding: 1.3rem;
            }
            .news-compact-card {
                padding: 1.3rem;
            }
            .news-empty-state {
                padding: 3rem 1.5rem;
            }
            .footer-top {
                flex-direction: column;
            }
            .footer-links {
                flex-direction: column;
                gap: 2rem;
            }
        }
    </style>
</head>
<body>
    ${renderHeader('news')}

    <section class="news-hero">
        <div class="section-label">PHI LAB INTELLIGENCE &amp; DISPATCHES</div>
        <h1>News &amp; Research Milestones</h1>
        <p>Institutional announcements, strategic industry collaborations, and technical dispatches from the Kaduna aerospace facility.</p>
    </section>

    <main class="news-feed-wrap">
        ${publishedItems.length > 0 ? `
            <div class="news-grid">
                ${featuredItem ? `
                    <a href="${featuredItem.link}" class="news-featured-card">
                        <div class="news-featured-img">
                            <img src="${featuredItem.image}" alt="${featuredItem.title.replace(/"/g, '&quot;')}">
                        </div>
                        <div class="news-featured-content">
                            <span class="news-item-date">${featuredItem.date} &bull; FEATURED</span>
                            <h3>${featuredItem.title}</h3>
                            <p>${featuredItem.summary}</p>
                            <span class="news-read-more">Read Full Dispatch &rarr;</span>
                        </div>
                    </a>
                ` : ''}

                ${otherItems.length > 0 ? `
                    <div class="news-compact-list">
                        ${otherItems.map(item => `
                            <a href="${item.link}" class="news-compact-card">
                                <div>
                                    <span class="news-item-date">${item.date}</span>
                                    <h4>${item.title}</h4>
                                    <p>${item.summary}</p>
                                </div>
                                <span class="news-read-more">Read Dispatch &rarr;</span>
                            </a>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        ` : `
            <div class="news-empty-state">
                <div class="section-label" style="margin-bottom:0.8rem; color:var(--amber);">DISPATCH DESK ACTIVE</div>
                <h3>Upcoming Dispatches Pending Release</h3>
                <p>New partnership announcements, DIMASA fleet telemetry briefings, and lab publications will appear here as they are formally confirmed.</p>
            </div>
        `}

        <div class="phi-arc-divider">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 28" width="160" height="28" fill="none" role="presentation" aria-hidden="true">
              <circle cx="16" cy="18" r="3.5" fill="#5B6B7D" opacity="0.35"/>
              <circle cx="38" cy="12" r="3.8" fill="#5B6B7D" opacity="0.55"/>
              <circle cx="60" cy="8" r="4.2" fill="#5B6B7D" opacity="0.8"/>
              <circle cx="80" cy="6" r="4.8" fill="#E8A33D"/>
              <circle cx="100" cy="8" r="4.2" fill="#5B6B7D" opacity="0.8"/>
              <circle cx="122" cy="12" r="3.8" fill="#5B6B7D" opacity="0.55"/>
              <circle cx="144" cy="18" r="3.5" fill="#5B6B7D" opacity="0.35"/>
            </svg>
        </div>
    </main>

    ${renderFooter()}

    <script src="/assets/nav.js" defer></script>
    <script src="/assets/news-client.js" defer></script>
</body>
</html>`;

fs.writeFileSync(path.join(NEWS_OUTPUT_DIR, 'index.html'), newsIndexHtml, 'utf8');
console.log('Generated news list page: news/index.html');

// 3. Handle vercel.json safely (Merge if exists, create if not)
let vercelConfig = {};
if (fs.existsSync(VERCEL_JSON_PATH)) {
  try {
    vercelConfig = JSON.parse(fs.readFileSync(VERCEL_JSON_PATH, 'utf8'));
    console.log('Existing vercel.json detected, merging settings...');
  } catch (err) {
    console.warn('Could not parse existing vercel.json, using fresh object:', err.message);
  }
}

vercelConfig.cleanUrls = true;
vercelConfig.outputDirectory = ".";

fs.writeFileSync(VERCEL_JSON_PATH, JSON.stringify(vercelConfig, null, 2), 'utf8');
console.log('Updated vercel.json with cleanUrls: true and outputDirectory: "."');
