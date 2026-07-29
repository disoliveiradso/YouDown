import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body.url?.trim();
    const formatId = body.format_id;
    const downloadType = body.type || 'video';

    if (!url) {
      return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
    }

    // Extract Title
    let title = 'video';
    try {
      const { stdout: titleOut } = await execFileAsync('yt-dlp', ['--get-title', '--no-warnings', url]);
      title = titleOut.trim() || 'video';
    } catch {}

    const cleanTitle = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'video';
    const ext = downloadType === 'video' ? 'mp4' : 'mp3';

    // If format is Invidious fallback format
    if (formatId && formatId.startsWith('inv-')) {
      const fallbackRes = await fallbackDownloadUrl(url, downloadType);
      if (fallbackRes) {
        return NextResponse.json(fallbackRes);
      }
    }

    // Generate real-time stream URL for Docker FFmpeg processing (guarantees video+audio at requested resolution)
    const streamParams = new URLSearchParams({
      url: url,
      format_id: formatId || '',
      type: downloadType,
      title: cleanTitle
    });

    return NextResponse.json({
      download_url: `/api/stream?${streamParams.toString()}`,
      title: cleanTitle,
      filename: `${cleanTitle}.${ext}`,
      ext: ext
    });

  } catch (err: any) {
    const fallbackRes = await fallbackDownloadUrl(body.url, body.type || 'video');
    if (fallbackRes) {
      return NextResponse.json(fallbackRes);
    }
    return NextResponse.json({ error: err.message || 'Erro ao processar download' }, { status: 400 });
  }
}

async function fallbackDownloadUrl(url: string, downloadType: string) {
  const match = url.match(/(?:v=|\/([0-9A-Za-z_-]{11}).*|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})/);
  const videoId = match ? (match[1] || match[2]) : null;
  if (!videoId) return null;

  const invidiousInstances = [
    `https://inv.itissimple.org/api/v1/videos/${videoId}`,
    `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
    `https://yewtu.be/api/v1/videos/${videoId}`
  ];

  for (const ep of invidiousInstances) {
    try {
      const res = await fetch(ep, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        const title = (data.title || 'video').replace(/[^a-zA-Z0-9 _-]/g, '').trim();

        if (downloadType === 'audio') {
          for (const fmt of (data.adaptiveFormats || [])) {
            if (fmt.type?.includes('audio')) {
              return {
                download_url: fmt.url,
                title: title,
                filename: `${title}.mp3`,
                ext: 'mp3'
              };
            }
          }
        } else {
          const formats = data.formatStreams || [];
          if (formats.length > 0) {
            return {
              download_url: formats[0].url,
              title: title,
              filename: `${title}.mp4`,
              ext: 'mp4'
            };
          }
        }
      }
    } catch {}
  }
  return null;
}
