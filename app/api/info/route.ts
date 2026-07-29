import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|\/([0-9A-Za-z_-]{11}).*|embed\/|youtu\.be\/|shorts\/)([0-9A-Za-z_-]{11})/);
  return match ? (match[1] || match[2]) : null;
}

// Fetch YouTube Embed metadata directly from YouTube embed page ytInitialPlayerResponse
async function fetchYouTubeEmbedInfo(videoId: string) {
  try {
    const res = await fetch(`https://www.youtube.com/embed/${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const html = await res.text();
      const matchPlayerResponse = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      let playerResponse: any = null;
      if (matchPlayerResponse && matchPlayerResponse[1]) {
        try {
          playerResponse = JSON.parse(matchPlayerResponse[1]);
        } catch {}
      }

      if (playerResponse) {
        const videoDetails = playerResponse.videoDetails || {};
        const streamingData = playerResponse.streamingData || {};
        const formatsList = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];

        const videoFormats: any[] = [];
        const seenHeights = new Set<number>();

        for (const fmt of formatsList) {
          const height = fmt.height || (fmt.qualityLabel ? parseInt(fmt.qualityLabel) : 0);
          if (height && height >= 144 && !seenHeights.has(height)) {
            seenHeights.add(height);
            let qualityLabel = fmt.qualityLabel || `${height}p`;
            if (height >= 2160) qualityLabel = `${height}p (4K Ultra HD)`;
            else if (height >= 1440) qualityLabel = `${height}p (2K Quad HD)`;
            else if (height >= 1080) qualityLabel = `${height}p HD`;

            videoFormats.push({
              format_id: `yt-${height}`,
              quality: qualityLabel,
              height: height,
              ext: fmt.mimeType?.includes('webm') ? 'webm' : 'mp4',
              filesize: fmt.contentLength ? parseInt(fmt.contentLength) : 0,
              has_audio: true,
              url: fmt.url || ''
            });
          }
        }

        videoFormats.sort((a, b) => b.height - a.height);

        // Comprehensive audio formats
        const audioFormats = [
          { format_id: 'audio-320', quality: '320 kbps (MP3 - Máxima Qualidade)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-256', quality: '256 kbps (M4A / AAC)', ext: 'm4a', filesize: 0, url: '' },
          { format_id: 'audio-192', quality: '192 kbps (MP3 - Alta Qualidade)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-128', quality: '128 kbps (MP3 - Padrão)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-64', quality: '64 kbps (Opus / WebM)', ext: 'opus', filesize: 0, url: '' },
        ];

        const durationSecs = videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : 0;

        return {
          title: videoDetails.title || 'Vídeo do YouTube',
          thumbnail: videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: durationSecs,
          uploader: videoDetails.author || 'Canal do YouTube',
          views: videoDetails.viewCount ? parseInt(videoDetails.viewCount) : 0,
          video_formats: videoFormats,
          audio_formats: audioFormats,
          subtitles: [],
          original_url: `https://www.youtube.com/watch?v=${videoId}`
        };
      }
    }
  } catch {}
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: 'URL é obrigatória' }, { status: 400 });
    }

    const videoId = extractVideoId(url);

    // Try yt-dlp first
    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '-j',
        '--no-warnings',
        '--socket-timeout', '10',
        '--no-check-certificates',
        url
      ], { maxBuffer: 15 * 1024 * 1024 });

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
          if (height && height >= 144 && !seenResolutions.has(height)) {
            seenResolutions.add(height);
            let qualityLabel = `${height}p`;
            if (height >= 2160) qualityLabel += ' (4K Ultra HD)';
            else if (height >= 1440) qualityLabel += ' (2K Quad HD)';
            else if (height >= 1080) qualityLabel += ' HD';
            else if (fps && Number(fps) >= 50) qualityLabel += `${fps}fps`;

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

      let duration = info.duration || 0;
      if (!duration && videoId) {
        const embedData = await fetchYouTubeEmbedInfo(videoId);
        if (embedData?.duration) duration = embedData.duration;
      }

      // Add standard audio qualities if yt-dlp extracted few
      if (audioFormats.length < 3) {
        audioFormats.length = 0;
        audioFormats.push(
          { format_id: 'audio-320', quality: '320 kbps (MP3 - Máxima Qualidade)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-256', quality: '256 kbps (M4A / AAC)', ext: 'm4a', filesize: 0, url: '' },
          { format_id: 'audio-192', quality: '192 kbps (MP3 - Alta Qualidade)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-128', quality: '128 kbps (MP3 - Padrão)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-64', quality: '64 kbps (Opus / WebM)', ext: 'opus', filesize: 0, url: '' }
        );
      }

      return NextResponse.json({
        title: info.title || 'Sem título',
        thumbnail: info.thumbnail || '',
        duration: duration,
        uploader: info.uploader || 'Desconhecido',
        views: info.view_count || 0,
        video_formats: videoFormats.slice(0, 10),
        audio_formats: audioFormats.slice(0, 5),
        subtitles: [],
        original_url: url
      });
    } catch (ytErr) {
      // Fallback 1: YouTube Embed HTML Metadata (Real resolutions & lengthSeconds)
      if (videoId) {
        const embedData = await fetchYouTubeEmbedInfo(videoId);
        if (embedData && embedData.video_formats.length > 0) {
          return NextResponse.json(embedData);
        }
      }

      // Fallback 2: Invidious Instances
      if (videoId) {
        const invData = await fetchInvidiousInfo(videoId, url);
        if (invData) return NextResponse.json(invData);
      }

      throw ytErr;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao processar vídeo' }, { status: 400 });
  }
}

async function fetchInvidiousInfo(videoId: string, originalUrl: string) {
  const invidiousEndpoints = [
    `https://inv.itissimple.org/api/v1/videos/${videoId}`,
    `https://invidious.nerdvpn.de/api/v1/videos/${videoId}`,
    `https://yewtu.be/api/v1/videos/${videoId}`
  ];

  for (const ep of invidiousEndpoints) {
    try {
      const res = await fetch(ep, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        const videoFormats: any[] = [];
        const seenH = new Set();

        const allFmts = [...(data.adaptiveFormats || []), ...(data.formatStreams || [])];

        for (const fmt of allFmts) {
          const h = fmt.height || (fmt.qualityLabel ? parseInt(fmt.qualityLabel) : 0);
          if (h && h >= 144 && !seenH.has(h)) {
            seenH.add(h);
            let q = fmt.qualityLabel || `${h}p`;
            if (h >= 2160) q += ' (4K Ultra HD)';
            else if (h >= 1440) q += ' (2K Quad HD)';
            else if (h >= 1080) q += ' HD';

            videoFormats.push({
              format_id: `inv-${h}`,
              quality: q,
              height: h,
              ext: fmt.container || 'mp4',
              filesize: 0,
              has_audio: true,
              url: fmt.url || ''
            });
          }
        }

        videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

        const audioFormats = [
          { format_id: 'audio-320', quality: '320 kbps (MP3 - Máxima Qualidade)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-256', quality: '256 kbps (M4A / AAC)', ext: 'm4a', filesize: 0, url: '' },
          { format_id: 'audio-192', quality: '192 kbps (MP3 - Alta Qualidade)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-128', quality: '128 kbps (MP3 - Padrão)', ext: 'mp3', filesize: 0, url: '' },
          { format_id: 'audio-64', quality: '64 kbps (Opus / WebM)', ext: 'opus', filesize: 0, url: '' }
        ];

        return {
          title: data.title || 'Vídeo do YouTube',
          thumbnail: data.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: data.lengthSeconds || 0,
          uploader: data.author || 'Canal do YouTube',
          views: data.viewCount || 0,
          video_formats: videoFormats,
          audio_formats: audioFormats,
          subtitles: [],
          original_url: originalUrl
        };
      }
    } catch {}
  }

  return null;
}
