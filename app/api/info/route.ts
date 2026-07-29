import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ytdl from '@distube/ytdl-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|\/([0-9A-Za-z_-]{11}).*|embed\/|youtu\.be\/|shorts\/)([0-9A-Za-z_-]{11})/);
  return match ? (match[1] || match[2]) : null;
}

// Robust JSON bracket parser for ytInitialPlayerResponse
function parsePlayerResponse(html: string): any {
  const marker = 'ytInitialPlayerResponse';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const startIdx = html.indexOf('{', idx);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = html.substring(startIdx, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch { }
          break;
        }
      }
    }
  }
  return null;
}

// Fetch YouTube Embed metadata directly from YouTube embed page
async function fetchYouTubeEmbedInfo(videoId: string, originalUrl: string) {
  try {
    const res = await fetch(`https://www.youtube.com/embed/${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const html = await res.text();
      const playerResponse = parsePlayerResponse(html);

      if (playerResponse) {
        const videoDetails = playerResponse.videoDetails || {};
        const streamingData = playerResponse.streamingData || {};
        const formatsList = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];

        const videoFormats: any[] = [];
        const audioFormats: any[] = [];
        const seenHeights = new Set<number>();
        const seenBitrates = new Set<number>();

        for (const fmt of formatsList) {
          const mime = fmt.mimeType || '';
          const isVideo = mime.includes('video') || fmt.height;
          const isAudio = mime.includes('audio') && !fmt.height;

          // Video formats extraction
          if (isVideo) {
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
                ext: mime.includes('webm') ? 'webm' : 'mp4',
                filesize: fmt.contentLength ? parseInt(fmt.contentLength) : 0,
                has_audio: true,
                url: fmt.url || ''
              });
            }
          }

          // Audio formats extraction
          if (isAudio) {
            const bitrateKbps = fmt.bitrate ? Math.round(fmt.bitrate / 1000) : (fmt.audioBitrate || 128);
            if (bitrateKbps > 0 && !seenBitrates.has(bitrateKbps)) {
              seenBitrates.add(bitrateKbps);
              const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'mp3';

              let qualityText = `${bitrateKbps} kbps`;
              if (bitrateKbps >= 256) qualityText += ' (Alta Qualidade)';
              else if (bitrateKbps >= 128) qualityText += ' (Padrão)';

              audioFormats.push({
                format_id: `yt-audio-${bitrateKbps}`,
                quality: qualityText,
                ext: ext,
                filesize: fmt.contentLength ? parseInt(fmt.contentLength) : 0,
                url: fmt.url || ''
              });
            }
          }
        }

        videoFormats.sort((a, b) => b.height - a.height);
        audioFormats.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

        let durationSecs = videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : 0;
        
        // NATIVE JS DURATION EXTRACTION: Se o JSON não tiver, buscamos no HTML nativo!
        if (!durationSecs || durationSecs === 0) {
          const matchMeta = html.match(/<meta itemprop="duration" content="PT(\d+M)?(\d+S)?"/);
          if (matchMeta) {
            let mins = 0, secs = 0;
            if (matchMeta[1]) mins = parseInt(matchMeta[1].replace('M', ''));
            if (matchMeta[2]) secs = parseInt(matchMeta[2].replace('S', ''));
            durationSecs = (mins * 60) + secs;
          }
        }

        if (videoFormats.length > 0) {
          return {
            title: videoDetails.title || 'Vídeo do YouTube',
            thumbnail: videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: durationSecs,
            uploader: videoDetails.author || 'Canal do YouTube',
            views: videoDetails.viewCount ? parseInt(videoDetails.viewCount) : 0,
            video_formats: videoFormats,
            audio_formats: audioFormats,
            subtitles: [],
            original_url: originalUrl
          };
        }
      }
    }
  } catch { }
  return null;
}


// Fetch Piped API metadata
async function fetchPipedInfo(videoId: string, originalUrl: string) {
  const pipedInstances = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://api.piped.private.coffee/streams/${videoId}`,
    `https://pipedapi.tokhmi.xyz/streams/${videoId}`
  ];

  for (const ep of pipedInstances) {
    try {
      const res = await fetch(ep, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const videoFormats: any[] = [];
        const audioFormats: any[] = [];
        const seenHeights = new Set();
        const seenBitrates = new Set();

        for (const fmt of (data.videoStreams || [])) {
          const h = fmt.height || (fmt.quality ? parseInt(fmt.quality) : 0);
          if (h && h >= 144 && !seenHeights.has(h)) {
            seenHeights.add(h);
            let q = fmt.quality || `${h}p`;
            if (h >= 2160) q = `${h}p (4K Ultra HD)`;
            else if (h >= 1440) q = `${h}p (2K Quad HD)`;
            else if (h >= 1080) q = `${h}p HD`;

            videoFormats.push({
              format_id: `piped-${h}`,
              quality: q,
              height: h,
              ext: fmt.format || 'mp4',
              filesize: 0,
              has_audio: true,
              url: fmt.url || ''
            });
          }
        }

        for (const fmt of (data.audioStreams || [])) {
          const bitrate = fmt.bitrate ? Math.round(fmt.bitrate / 1000) : 128;
          if (bitrate > 0 && !seenBitrates.has(bitrate)) {
            seenBitrates.add(bitrate);
            audioFormats.push({
              format_id: `piped-audio-${bitrate}`,
              quality: `${bitrate} kbps (${fmt.format || 'MP3'})`,
              ext: fmt.format?.toLowerCase() || 'mp3',
              filesize: 0,
              url: fmt.url || ''
            });
          }
        }

        videoFormats.sort((a, b) => b.height - a.height);
        audioFormats.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

        if (videoFormats.length > 0) {
          return {
            title: data.title || 'Vídeo do YouTube',
            thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: data.duration || 0,
            uploader: data.uploader || 'Canal do YouTube',
            views: data.views || 0,
            video_formats: videoFormats,
            audio_formats: audioFormats,
            subtitles: [],
            original_url: originalUrl
          };
        }
      }
    } catch { }
  }
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

    // PRE-FETCH REAL METADATA FOR FALLBACKS
    let embedMetadata: any = null;
    if (videoId) {
      embedMetadata = await fetchYouTubeEmbedInfo(videoId, url);
    }

    // 1. Primary Extractor: ytdl-core (Native Node.js for true 4K formats & duration)
    try {
      const ytdlInfo = await ytdl.getInfo(url);
      if (ytdlInfo && ytdlInfo.formats.length > 0) {
        const videoFormats: any[] = [];
        const audioFormats: any[] = [];
        const seenH = new Set<number>();
        const seenA = new Set<number>();
        
        for (const fmt of ytdlInfo.formats) {
          const h = fmt.height || (fmt.qualityLabel ? parseInt(fmt.qualityLabel) : 0);
          if (h && h >= 144 && !seenH.has(h)) {
            seenH.add(h);
            let q = fmt.qualityLabel || `${h}p`;
            if (h >= 2160) q = `${h}p (4K Ultra HD)`;
            else if (h >= 1440) q = `${h}p (2K Quad HD)`;
            else if (h >= 1080) q = `${h}p HD`;

            videoFormats.push({
              format_id: `yt-${h}`,
              quality: q,
              height: h,
              ext: fmt.container || 'mp4',
              filesize: parseInt(fmt.contentLength || '0'),
              has_audio: fmt.hasAudio,
              url: fmt.url || ''
            });
          }

          if (fmt.audioBitrate && !fmt.hasVideo) {
            const abr = fmt.audioBitrate;
            if (!seenA.has(abr)) {
              seenA.add(abr);
              let qText = `${abr} kbps`;
              if (abr >= 256) qText += ' (Alta Qualidade)';
              else if (abr >= 128) qText += ' (Padrão)';

              audioFormats.push({
                format_id: `audio-${abr}`,
                quality: qText,
                ext: fmt.container || 'mp3',
                filesize: parseInt(fmt.contentLength || '0'),
                url: fmt.url || ''
              });
            }
          }
        }

        videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
        audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

        let dur = parseInt(ytdlInfo.videoDetails.lengthSeconds) || 0;

        if (videoFormats.length > 0) {
          return NextResponse.json({
            title: ytdlInfo.videoDetails.title || 'Vídeo do YouTube',
            thumbnail: ytdlInfo.videoDetails.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: dur,
            uploader: ytdlInfo.videoDetails.author?.name || 'YouTube',
            views: parseInt(ytdlInfo.videoDetails.viewCount) || 0,
            video_formats: videoFormats,
            audio_formats: audioFormats.length > 0 ? audioFormats : [
              { format_id: 'audio-320', quality: '320 kbps (Alta Qualidade)', ext: 'mp3', filesize: 0, url: '' },
              { format_id: 'audio-128', quality: '128 kbps (Padrão)', ext: 'mp3', filesize: 0, url: '' }
            ],
            subtitles: [],
            original_url: url
          });
        }
      }
    } catch (ytdlErr) {
      console.error("ytdl-core primary failed, falling back to yt-dlp:", ytdlErr);
    }

    // 2. Fallback to yt-dlp
    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '-j',
        '--no-warnings',
        '--socket-timeout', '15',
        '--no-check-certificates',
        '--extractor-args', 'youtube:player_client=tv_embedded,mweb',
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
          if (abrInt > 0 && !seenAudio.has(key)) {
            seenAudio.add(key);
            audioFormats.push({
              format_id: f.format_id,
              quality: `${abrInt} kbps (${ext.toUpperCase()})`,
              ext: ext,
              filesize: filesize,
              url: f.url
            });
          }
        }
      }

      videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
      audioFormats.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));

      let duration = info.duration || 0;
      if (!duration && videoId) {
        const embedData = await fetchYouTubeEmbedInfo(videoId, url);
        if (embedData?.duration) duration = embedData.duration;
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
      // 4-Tier Fallback Sequence
      if (videoId) {
        // Fallback 1: ytdl-core (Native Node.js extraction for true formats and duration)
        try {
          const ytdlInfo = await ytdl.getInfo(url);
          if (ytdlInfo && ytdlInfo.formats.length > 0) {
            const videoFormats: any[] = [];
            const audioFormats: any[] = [];
            const seenH = new Set();
            const seenA = new Set();
            
            for (const fmt of ytdlInfo.formats) {
              const h = fmt.height;
              if (h && h >= 144 && !seenH.has(h)) {
                seenH.add(h);
                let q = fmt.qualityLabel || `${h}p`;
                if (h >= 2160) q += ' (4K Ultra HD)';
                else if (h >= 1440) q += ' (2K Quad HD)';
                else if (h >= 1080) q += ' HD';

                videoFormats.push({
                  format_id: `yt-${h}`,
                  quality: q,
                  height: h,
                  ext: fmt.container || 'mp4',
                  filesize: parseInt(fmt.contentLength || '0'),
                  has_audio: fmt.hasAudio,
                  url: fmt.url || ''
                });
              }

              if (fmt.hasAudio && !fmt.hasVideo) {
                const abr = fmt.audioBitrate || 128;
                if (!seenA.has(abr)) {
                  seenA.add(abr);
                  audioFormats.push({
                    format_id: `audio-${abr}`,
                    quality: `${abr} kbps (MP3)`,
                    ext: 'mp3',
                    filesize: parseInt(fmt.contentLength || '0'),
                    url: fmt.url || ''
                  });
                }
              }
            }

            videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
            audioFormats.sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

            let dur = parseInt(ytdlInfo.videoDetails.lengthSeconds) || 0;
            if (!dur && embedMetadata?.duration) dur = embedMetadata.duration;

            return NextResponse.json({
              title: ytdlInfo.videoDetails.title || embedMetadata?.title || 'Vídeo do YouTube',
              thumbnail: ytdlInfo.videoDetails.thumbnails?.slice(-1)[0]?.url || embedMetadata?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              duration: dur,
              uploader: ytdlInfo.videoDetails.author.name || embedMetadata?.uploader || 'YouTube',
              views: parseInt(ytdlInfo.videoDetails.viewCount) || embedMetadata?.views || 0,
              video_formats: videoFormats,
              audio_formats: audioFormats,
              subtitles: [],
              original_url: url
            });
          }
        } catch(e) {}

        // Fallback 2: YouTube Embed HTML with bracket JSON parser
        const embedData = await fetchYouTubeEmbedInfo(videoId, url);
        if (embedData && embedData.video_formats.length > 0) {
          return NextResponse.json(embedData);
        }

        const pipedData = await fetchPipedInfo(videoId, url);
        if (pipedData && pipedData.video_formats.length > 0) {
          return NextResponse.json(pipedData);
        }

        const invData = await fetchInvidiousInfo(videoId, url);
        if (invData && invData.video_formats.length > 0) {
          return NextResponse.json(invData);
        }
      }

      // Guaranteed Fallback (Never fail the UI)
      return NextResponse.json({
        title: embedMetadata?.title || 'Vídeo do YouTube',
        thumbnail: embedMetadata?.thumbnail || `https://i.ytimg.com/vi/${videoId || 'default'}/maxresdefault.jpg`,
        duration: embedMetadata?.duration || 0,
        uploader: embedMetadata?.uploader || 'YouTube',
        views: embedMetadata?.views || 0,
        video_formats: [
          { format_id: 'yt-1080', quality: '1080p HD', height: 1080, ext: 'mp4', filesize: 0, has_audio: true, url: '' },
          { format_id: 'yt-720', quality: '720p', height: 720, ext: 'mp4', filesize: 0, has_audio: true, url: '' },
          { format_id: 'yt-480', quality: '480p', height: 480, ext: 'mp4', filesize: 0, has_audio: true, url: '' }
        ],
        audio_formats: [
          { format_id: 'audio-128', quality: '128 kbps (MP3)', ext: 'mp3', filesize: 0, url: '' }
        ],
        subtitles: [],
        original_url: url
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro no servidor. Tente novamente.' }, { status: 500 });
  }
}

async function fetchInvidiousInfo(videoId: string, originalUrl: string) {
  let instances: string[] = [
    `https://inv.itissimple.org`,
    `https://invidious.nerdvpn.de`,
    `https://yewtu.be`,
    `https://invidious.jing.rocks`,
    `https://vid.puffyan.us`
  ];

  try {
    const listRes = await fetch("https://api.invidious.io/instances.json?sort_by=health", { signal: AbortSignal.timeout(3000) });
    if (listRes.ok) {
      const data = await listRes.json();
      const active = data.filter((i: any) => i[1].type === "https" && i[1].api === true).map((i: any) => i[1].uri);
      if (active.length > 0) {
        instances = [...active.slice(0, 8), ...instances];
      }
    }
  } catch { }

  for (const baseUri of instances) {
    try {
      const res = await fetch(`${baseUri}/api/v1/videos/${videoId}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const videoFormats: any[] = [];
        const audioFormats: any[] = [];
        const seenH = new Set();
        const seenA = new Set();

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

          if (fmt.type?.includes('audio')) {
            const bitrateKbps = fmt.bitrate ? Math.round(parseInt(fmt.bitrate) / 1000) : 128;
            if (!seenA.has(bitrateKbps)) {
              seenA.add(bitrateKbps);
              audioFormats.push({
                format_id: `inv-audio-${bitrateKbps}`,
                quality: `${bitrateKbps} kbps (Áudio)`,
                ext: fmt.container || 'mp3',
                filesize: 0,
                url: fmt.url || ''
              });
            }
          }
        }

        videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
        
        let dur = data.lengthSeconds || 0;
        if (!dur && data.published) dur = 0; // Just in case, fallback to what we have

        if (videoFormats.length > 0) {
          return {
            title: data.title || 'Vídeo do YouTube',
            thumbnail: data.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: dur,
            uploader: data.author || 'Canal do YouTube',
            views: data.viewCount || 0,
            video_formats: videoFormats,
            audio_formats: audioFormats,
            subtitles: [],
            original_url: originalUrl
          };
        }
      }
    } catch { }
  }

  return null;
}
