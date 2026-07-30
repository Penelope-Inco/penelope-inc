/**
 * pb-realtime.js (v2 — corrected)
 * Drop this on any PHI-Suite page, same as before. Renders a live progress
 * strip — but now fetches through /api/projects (a Vercel serverless
 * function) instead of connecting to PocketBase directly from the browser.
 *
 * WHY THIS CHANGED: your site is HTTPS (Vercel), penelope-core's backend is
 * currently plain HTTP. Browsers block HTTPS pages from calling HTTP
 * endpoints directly ("mixed content") — the old direct-to-PocketBase
 * version would silently fail once deployed, even though it works fine in
 * local testing. Routing through /api/projects.js (a server-side proxy)
 * sidesteps that entirely.
 *
 * No PocketBase JS SDK needed anymore — just plain fetch(), polled every
 * 30s. Not true instant push like the old WebSocket subscribe, but the
 * Vercel edge cache is 60s anyway, so the ceiling on staleness is the same
 * ballpark either way, and this actually works.
 *
 * Usage on a suite page (unchanged):
 *   <div class="telemetry-strip" data-project-suite="phi-twin"></div>
 *   <script src="/pb-realtime.js"></script>
 *   <script>
 *     PenelopeTelemetry.initProjectProgress('phi-twin', '#phi-twin-telemetry');
 *   </script>
 */

(function () {
  const POLL_INTERVAL_MS = 30000;

  function renderStrip(container, project, degraded, fetchedAt) {
    const pct = Math.max(0, Math.min(100, project?.progress ?? 0));
    const staleness = degraded
      ? `<span class="telemetry-updated telemetry-degraded">Showing last synced data (${formatAge(fetchedAt)})</span>`
      : `<span class="telemetry-updated">Live — synced ${formatAge(fetchedAt)}</span>`;

    container.innerHTML = `
      <div class="telemetry-head">
        <span class="telemetry-label">${escapeHtml(project?.title || 'On-going project')}</span>
        <span class="telemetry-status status-${project?.status || 'planning'}">${formatStatus(project?.status)}</span>
      </div>
      <div class="telemetry-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="telemetry-fill" style="width:${pct}%"></div>
      </div>
      <div class="telemetry-foot">
        <span class="telemetry-pct">${pct}%</span>
        ${staleness}
      </div>
    `;
  }

  function formatStatus(status) {
    return { planning: 'Planning', development: 'Active', testing: 'Testing', complete: 'Complete' }[status] || (status || 'Unknown');
  }

  function formatAge(iso) {
    if (!iso) return 'unknown';
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
    return `${Math.round(seconds / 3600)}h ago`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function fetchAndRender(suiteSlug, container) {
    try {
      const res = await fetch(`/api/projects?suite=${encodeURIComponent(suiteSlug)}`);
      const body = await res.json();

      const projects = Array.isArray(body.projects) ? body.projects : [];
      const active = projects.find((p) => p.status !== 'complete') || projects[0];

      if (!active) {
        container.innerHTML = `<div class="telemetry-empty">No active on-going project for this suite right now.</div>`;
        return;
      }

      renderStrip(container, active, body.degraded, body.fetchedAt);
    } catch (err) {
      container.innerHTML = `<div class="telemetry-empty">Unable to load live status right now.</div>`;
    }
  }

  function initProjectProgress(suiteSlug, containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.classList.add('telemetry-strip');
    container.innerHTML = `<div class="telemetry-loading">Reading live status&hellip;</div>`;

    fetchAndRender(suiteSlug, container);
    setInterval(() => fetchAndRender(suiteSlug, container), POLL_INTERVAL_MS);
  }

  window.PenelopeTelemetry = { initProjectProgress };
})();
