const PRIMARY_REPO = process.env.GITHUB_REPO || 'penelopei/PHI-LAB';
const FALLBACK_REPO = process.env.FALLBACK_GITHUB_REPO || 'Sm-bello/PHI-LAB';

function githubHeaders(accept = 'application/vnd.github+json') {
  const headers = {
    'User-Agent': 'PHI-Lab-Website/1.0',
    Accept: accept,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function classifyAssets(rawAssets = []) {
  const out = {
    windows: null,
    windows_msi: null,
    mac: null,
    mac_intel: null,
    linux: null,
    linux_deb: null,
    linux_rpm: null,
  };

  for (const a of rawAssets) {
    const n = String(a.name || '').toLowerCase();
    const item = {
      id: a.id,
      name: a.name,
      size: a.size,
      url: a.url,
      browser_download_url: a.browser_download_url,
    };

    if (n.endsWith('-setup.exe') || (n.endsWith('.exe') && !out.windows)) {
      out.windows = item;
    } else if (n.endsWith('.msi')) {
      out.windows_msi = item;
    } else if (n.endsWith('.dmg')) {
      if (n.includes('x64') && !n.includes('universal') && out.mac) {
        out.mac_intel = item;
      } else if (!out.mac) {
        out.mac = item;
      }
    } else if (n.endsWith('.appimage')) {
      out.linux = item;
    } else if (n.endsWith('.deb')) {
      out.linux_deb = item;
    } else if (n.endsWith('.rpm')) {
      out.linux_rpm = item;
    }
  }
  return out;
}

async function fetchLatestRelease(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: githubHeaders(),
  });
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data?.assets) && data.assets.length > 0) {
      return { repo, release: data };
    }
  }

  // Fallback to newest non-draft release in /releases?per_page=5
  const listRes = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`, {
    headers: githubHeaders(),
  });
  if (listRes.ok) {
    const list = await listRes.json();
    const valid = Array.isArray(list)
      ? list.find((r) => !r.draft && Array.isArray(r.assets) && r.assets.length > 0)
      : null;
    if (valid) return { repo, release: valid };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    let found = await fetchLatestRelease(PRIMARY_REPO);
    if (!found && FALLBACK_REPO && FALLBACK_REPO !== PRIMARY_REPO) {
      found = await fetchLatestRelease(FALLBACK_REPO);
    }

    if (!found) {
      return res.status(404).json({ ok: false, error: 'No release builds available yet.' });
    }

    const { repo, release } = found;
    const assets = classifyAssets(release.assets);

    if (req.query?.info === 'true' || req.query?.info === '1') {
      return res.status(200).json({
        ok: true,
        repo,
        tag: release.tag_name,
        published_at: release.published_at,
        assets,
      });
    }

    const osParam = String(req.query?.os || 'windows').toLowerCase();
    const chosen =
      assets[osParam] ||
      (osParam === 'windows' ? assets.windows_msi : null) ||
      (osParam === 'linux' ? assets.linux_deb : null) ||
      assets.windows;

    if (!chosen) {
      return res.status(404).json({ ok: false, error: `No asset found for platform: ${osParam}` });
    }

    // Check if GitHub private asset URL requires proxying via API asset endpoint
    const upstream = await fetch(chosen.url, {
      headers: githubHeaders('application/octet-stream'),
      redirect: 'manual',
    });

    if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
      return res.redirect(302, upstream.headers.get('location'));
    }

    if (upstream.ok) {
      res.setHeader('Content-Disposition', `attachment; filename="${chosen.name}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.status(200).send(buf);
    }

    return res.redirect(302, chosen.browser_download_url);
  } catch (err) {
    console.error('[API/Download] Error:', err);
    return res.status(500).json({ ok: false, error: 'Download lookup failed' });
  }
}
