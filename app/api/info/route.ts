import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
    }

    // Try yt-dlp first
    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '-j',
        '--no-warnings',
        '--socket-timeout', '10',
        '--extractor-args', 'youtube:client=ANDROID,IOS,TV',
        url
      ], { maxBuffer: 10 * 1024 * 1024 });

      const info = JSON.parse(stdout);
      const formats = info.formats || [];
      const videoFormats: any[] = [];
      const audioFormats: any[] = [];
      const seenResolutions = new Set();
      const seenAudio = new Set();

      for (const f of formats) {
        const vcodec = f.vcodec || 'none';
        const acodec = f.acodec || 'none';
        const ext = f.ext || 'mp4';
        const filesize = f.filesize || f.filesize_approx || 0;

        if (vcodec !== 'none') {
          const height = f.height;
          const fps = f.fps || '';
          if (height && !seenResolutions.has(height)) {
            seenResolutions.add(height);
            let qualityLabel = `${height}p`;
            if (fps && Number(fps) >= 50) qualityLabel += fps;
            videoFormats.push({
              format_id: f.format_id,
              quality: qualityLabel,
              height: height,
              ext: ext,
              filesize: filesize,
              has_audio: acodec !== 'none',
              url: f.url
            });
          }
        }

        if (vcodec === 'none' && acodec !== 'none') {
          const abr = f.abr || f.tbr || 128;
          const abrInt = Math.round(abr);
          const key = `${ext}-${abrInt}`;
          if (!seenAudio.has(key)) {
            seenAudio.add(key);
            audioFormats.push({
              format_id: f.format_id,
              quality: `${abrInt} kbps`,
              ext: ext,
              filesize: filesize,
              url: f.url
            });
          }
        }
      }

      videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

      return NextResponse.json({
        title: info.title || 'Sem título',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        uploader: info.uploader || 'Desconhecido',
        views: info.view_count || 0,
        video_formats: videoFormats.slice(0, 6),
        audio_formats: audioFormats.slice(0, 4),
        subtitles: [],
        original_url: url
      });
    } catch (ytErr) {
      // Fallback to Invidious/Piped/oEmbed
      const fallbackData = await fallbackMetadata(url);
      if (fallbackData) {
        return NextResponse.json(fallbackData);
      }
      throw ytErr;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao processar vídeo' }, { status: 400 });
  }
}

async function fallbackMetadata(url: string) {
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
        const videoFormats: any[] = [];
        const audioFormats: any[] = [];
        const seenH = new Set();

        for (const fmt of (data.formatStreams || [])) {
          const h = fmt.height || 720;
          if (!seenH.has(h)) {
            seenH.add(h);
            videoFormats.push({
              format_id: `inv-${h}`,
              quality: fmt.qualityLabel || `${h}p`,
              height: h,
              ext: fmt.container || 'mp4',
              filesize: 0,
              has_audio: true,
              url: fmt.url
            });
          }
        }

        for (const fmt of (data.adaptiveFormats || [])) {
          if (fmt.type?.includes('audio')) {
            audioFormats.push({
              format_id: 'inv-audio',
              quality: '128 kbps',
              ext: 'mp3',
              filesize: 0,
              url: fmt.url
            });
            break;
          }
        }

        return {
          title: data.title || 'Vídeo do YouTube',
          thumbnail: data.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: data.lengthSeconds || 0,
          uploader: data.author || 'YouTube Channel',
          views: data.viewCount || 0,
          video_formats: videoFormats.slice(0, 6),
          audio_formats: audioFormats.slice(0, 4),
          subtitles: [],
          original_url: url
        };
      }
    } catch {}
  }

  // oEmbed Fallback
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { signal: AbortSignal.timeout(4000) });
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      return {
        title: data.title || 'Vídeo do YouTube',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: 0,
        uploader: data.author_name || 'YouTube',
        views: 0,
        video_formats: [
          { format_id: 'best', quality: '1080p', height: 1080, ext: 'mp4', filesize: 0, has_audio: true, url: '' },
          { format_id: '720p', quality: '720p', height: 720, ext: 'mp4', filesize: 0, has_audio: true, url: '' }
        ],
        audio_formats: [
          { format_id: 'audio-best', quality: '320 kbps', ext: 'mp3', filesize: 0, url: '' }
        ],
        subtitles: [],
        original_url: url
      };
    }
  } catch {}

  return null;
}
