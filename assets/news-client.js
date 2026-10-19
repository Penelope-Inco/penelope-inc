/**
 * assets/news-client.js
 * Client-side integration for PHI Lab News:
 * 1. Dismissible announcement bar (shows latest published item, remembers in localStorage).
 * 2. Homepage "Latest from PHI Lab" section (hides if no published items exist).
 */

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    fetch('/content/news.json')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load news');
        return res.json();
      })
      .then(items => {
        if (!Array.isArray(items)) return;

        // Filter only published items
        const published = items.filter(item => item && item.published === true);

        // 1. ANNOUNCEMENT BAR
        const announcementBar = document.getElementById('phi-announcement-bar');
        if (announcementBar) {
          if (published.length === 0) {
            announcementBar.style.display = 'none';
          } else {
            const latest = published[0];
            let isDismissed = false;
            try {
              isDismissed = localStorage.getItem('phi_announcement_dismissed_' + latest.id) === '1';
            } catch (storageErr) {
              // localStorage access might be denied in strict/private environments
              isDismissed = false;
            }

            if (!isDismissed) {
              announcementBar.innerHTML = `
                <div class="announcement-container">
                  <div class="announcement-left">
                    <span class="announcement-badge">LATEST DISPATCH</span>
                    <span class="announcement-title">${escapeHtml(latest.title)}</span>
                  </div>
                  <div class="announcement-right">
                    <a href="${latest.link || '/news/index.html'}" class="announcement-action">Read Dispatch &rarr;</a>
                    <button class="announcement-dismiss" aria-label="Dismiss announcement">&times;</button>
                  </div>
                </div>
              `;
              announcementBar.style.display = 'block';
              document.body.classList.add('has-announcement-bar');

              const dismissBtn = announcementBar.querySelector('.announcement-dismiss');
              if (dismissBtn) {
                dismissBtn.addEventListener('click', () => {
                  try {
                    localStorage.setItem('phi_announcement_dismissed_' + latest.id, '1');
                  } catch (e) {
                    // Ignore storage quota or access errors
                  }
                  announcementBar.style.display = 'none';
                  document.body.classList.remove('has-announcement-bar');
                });
              }
            } else {
              announcementBar.style.display = 'none';
            }
          }
        }

        // 2. HOMEPAGE "LATEST FROM PHI LAB" SECTION
        const latestSection = document.getElementById('latest-news-section');
        if (latestSection) {
          if (published.length === 0) {
            latestSection.style.display = 'none';
          } else {
            latestSection.style.display = 'block';
            const featured = published.find(i => i.featured) || published[0];
            const others = published.filter(i => i !== featured).slice(0, 2);
            const hasOthers = others.length > 0;

            const container = latestSection.querySelector('.latest-news-dynamic-container');
            if (container) {
              container.innerHTML = `
                <div class="latest-news-layout ${hasOthers ? 'has-compact' : 'featured-only'}">
                  <a href="${featured.link}" class="latest-featured-card">
                    <div class="latest-featured-img">
                      <img src="${featured.image}" alt="${escapeHtml(featured.title)}">
                    </div>
                    <div class="latest-featured-body">
                      <span class="meta-label" style="color:var(--slate); margin-bottom:0.5rem; display:block;">${featured.date} &bull; FEATURED</span>
                      <h3>${escapeHtml(featured.title)}</h3>
                      <p>${escapeHtml(featured.summary)}</p>
                      <span class="link-label" style="font-weight:700; color:var(--navy);">Read Full Story &rarr;</span>
                    </div>
                  </a>

                  ${others.length > 0 ? `
                    <div class="latest-compact-column">
                      ${others.map(item => `
                        <a href="${item.link}" class="latest-compact-row">
                          <span class="meta-label" style="color:var(--slate);">${item.date}</span>
                          <h4>${escapeHtml(item.title)}</h4>
                          <p>${escapeHtml(item.summary)}</p>
                          <span class="link-label" style="font-size:0.85rem; font-weight:700; color:var(--navy);">Read Dispatch &rarr;</span>
                        </a>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }
          }
        }
      })
      .catch(err => {
        // Silently fallback without breaking page execution
        console.warn('News data unavailable:', err);
      });
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
