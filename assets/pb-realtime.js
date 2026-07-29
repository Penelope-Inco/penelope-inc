/**
 * pb-realtime.js
 * Drop this on any PHI-Suite page. Renders a live progress strip fed from
 * the `projects` PocketBase collection and keeps it updated in real time
 * as you move the lever from the company wall / admin UI — no refresh needed.
 *
 * Usage on a suite page:
 *   <div class="telemetry-strip" data-project-suite="phi-twin"></div>
 *   <script src="pocketbase.umd.js"></script>  (or via CDN, see below)
 *   <script src="pb-realtime.js"></script>
 *
 * CDN for the PocketBase JS SDK (no build step needed):
 *   <script src="https://cdn.jsdelivr.net/npm/pocketbase@0.21.5/dist/pocketbase.umd.js"></script>
 */

(function () {
  const PB_URL = 'https://penelope-core.example.com'; // TODO: replace with your Hetzner PocketBase URL
  const pb = new PocketBase(PB_URL);

  function renderStrip(container, project) {
    const pct = Math.max(0, Math.min(100, project.progress_percent ?? 0));
    container.innerHTML = `
      <div class="telemetry-head">
        <span class="telemetry-label">${escapeHtml(project.title || 'On-going project')}</span>
        <span class="telemetry-status status-${project.status}">${formatStatus(project.status)}</span>
      </div>
      <div class="telemetry-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="telemetry-fill" style="width:${pct}%"></div>
        <div class="telemetry-ticks"></div>
      </div>
      <div class="telemetry-foot">
        <span class="telemetry-pct">${pct}%</span>
        <span class="telemetry-updated">Live — updates automatically</span>
      </div>
    `;
  }

  function formatStatus(status) {
    return { planning: 'Planning', active: 'Active', paused: 'Paused', complete: 'Complete' }[status] || status;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function initProjectProgress(suiteSlug, containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.classList.add('telemetry-strip');
    container.innerHTML = `<div class="telemetry-loading">Reading live status&hellip;</div>`;

    let record;
    try {
      record = await pb.collection('projects').getFirstListItem(
        `suite="${suiteSlug}" && status!="complete"`,
        { sort: '-created' }
      );
    } catch (err) {
      container.innerHTML = `<div class="telemetry-empty">No active on-going project for this suite right now.</div>`;
      return;
    }

    renderStrip(container, record);

    // Live updates: no polling, no refresh — PocketBase pushes the diff
    // the instant you change progress_percent from the admin UI or company wall.
    pb.collection('projects').subscribe(record.id, (e) => {
      if (e.action === 'update') renderStrip(container, e.record);
    });
  }

  window.PenelopeTelemetry = { initProjectProgress };
})();
