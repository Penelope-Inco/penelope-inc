/**
 * /api/download.js
 * Vercel Serverless Function for PHI Lab Workstation direct downloads.
 * 
 * Capabilities:
 * 1. GET /api/download?info=true -> returns JSON metadata of latest release and platform assets.
 * 2. GET /api/download?os=windows | mac | linux -> quietly requests the GitHub release asset
 *    and seamlessly redirects the browser to the direct binary download stream.
 */

const GITHUB_REPO = 'Sm-bello/PHI-LAB';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    // 1. Fetch latest release from GitHub
    const reqHeaders = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'PHI-LAB-Downloader'
    };
    if (GITHUB_TOKEN) {
      reqHeaders['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }

    const releaseRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: reqHeaders
    });

    if (!releaseRes.ok) {
      return res.status(502).json({
        ok: false,
        error: `GitHub API error: ${releaseRes.status} ${releaseRes.statusText}`
      });
    }

    const release = await releaseRes.json();
    const assets = release.assets || [];

    // Helper to find asset
    const findAsset = (predicate) => assets.find(predicate);

    const assetMap = {
      windows_exe: findAsset(a => a.name.endsWith('.exe')),
      windows_msi: findAsset(a => a.name.endsWith('.msi')),
      mac_dmg: findAsset(a => a.name.endsWith('.dmg')),
      linux_appimage: findAsset(a => a.name.endsWith('.AppImage')),
      linux_deb: findAsset(a => a.name.endsWith('.deb')),
      linux_rpm: findAsset(a => a.name.endsWith('.rpm'))
    };

    // 2. Info request
    if (req.query.info === 'true') {
      return res.status(200).json({
        ok: true,
        tag: release.tag_name,
        name: release.name,
        published_at: release.published_at,
        assets: {
          windows: assetMap.windows_exe ? {
            name: assetMap.windows_exe.name,
            size: assetMap.windows_exe.size,
            download_url: '/api/download?os=windows'
          } : null,
          windows_msi: assetMap.windows_msi ? {
            name: assetMap.windows_msi.name,
            size: assetMap.windows_msi.size,
            download_url: '/api/download?os=windows_msi'
          } : null,
          mac: assetMap.mac_dmg ? {
            name: assetMap.mac_dmg.name,
            size: assetMap.mac_dmg.size,
            download_url: '/api/download?os=mac'
          } : null,
          linux: assetMap.linux_appimage ? {
            name: assetMap.linux_appimage.name,
            size: assetMap.linux_appimage.size,
            download_url: '/api/download?os=linux'
          } : null,
          linux_deb: assetMap.linux_deb ? {
            name: assetMap.linux_deb.name,
            size: assetMap.linux_deb.size,
            download_url: '/api/download?os=linux_deb'
          } : null
        }
      });
    }

    // 3. Resolve requested platform
    let requested = (req.query.os || '').toLowerCase();
    
    // Auto-detect from User-Agent if not explicitly specified
    if (!requested) {
      const ua = (req.headers['user-agent'] || '').toLowerCase();
      if (ua.includes('win')) requested = 'windows';
      else if (ua.includes('mac')) requested = 'mac';
      else if (ua.includes('linux')) requested = 'linux';
      else requested = 'windows';
    }

    let targetAsset = null;
    if (requested === 'windows' || requested === 'win') {
      targetAsset = assetMap.windows_exe || assetMap.windows_msi;
    } else if (requested === 'windows_msi' || requested === 'msi') {
      targetAsset = assetMap.windows_msi || assetMap.windows_exe;
    } else if (requested === 'mac' || requested === 'macos' || requested === 'darwin') {
      targetAsset = assetMap.mac_dmg;
    } else if (requested === 'linux' || requested === 'appimage') {
      targetAsset = assetMap.linux_appimage || assetMap.linux_deb;
    } else if (requested === 'deb' || requested === 'linux_deb') {
      targetAsset = assetMap.linux_deb || assetMap.linux_appimage;
    }

    if (!targetAsset) {
      return res.status(404).json({
        ok: false,
        error: `No build asset found for platform: "${requested}" in release ${release.tag_name}`
      });
    }

    // 4. Request the asset binary download URL from GitHub API
    const assetHeaders = {
      'Accept': 'application/octet-stream',
      'User-Agent': 'PHI-LAB-Downloader'
    };
    if (GITHUB_TOKEN) {
      assetHeaders['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }

    const assetDownloadRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${targetAsset.id}`, {
      headers: assetHeaders,
      redirect: 'manual'
    });

    const directDownloadUrl = assetDownloadRes.headers.get('location');

    if (directDownloadUrl) {
      res.writeHead(302, {
        'Location': directDownloadUrl,
        'Content-Disposition': `attachment; filename="${targetAsset.name}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      return res.end();
    }

    // Fallback: If not redirecting, return error
    return res.status(500).json({
      ok: false,
      error: 'Could not obtain direct storage URL for asset'
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal server error while resolving release asset'
    });
  }
}
