import { spawn } from 'child_process';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const formatId = searchParams.get('format_id');
  const type = searchParams.get('type') || 'video';
  const rawTitle = searchParams.get('title') || 'video';

  if (!url) {
    return new Response('URL é obrigatória', { status: 400 });
  }

  const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'video';
  const ext = type === 'video' ? 'mp4' : 'mp3';
  const filename = `${cleanTitle}.${ext}`;

  // Format selection
  let formatSelector = 'bestvideo+bestaudio/best';
  if (type === 'audio') {
    formatSelector = 'bestaudio/best';
  } else if (formatId && !formatId.startsWith('inv-')) {
    formatSelector = `${formatId}+bestaudio/best`;
  }

  const ytArgs = [
    '-o', '-',
    '-f', formatSelector,
    '--no-warnings',
    '--socket-timeout', '15',
    '--extractor-args', 'youtube:client=WEB,IOS,ANDROID,TV',
  ];

  if (type === 'audio') {
    ytArgs.push('-x', '--audio-format', 'mp3');
  }

  ytArgs.push(url);

  const ytProcess = spawn('yt-dlp', ytArgs);

  // Convert Node readable stream to Web ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      ytProcess.stdout.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      ytProcess.stdout.on('end', () => {
        controller.close();
      });
      ytProcess.stdout.on('error', (err) => {
        controller.error(err);
      });
      ytProcess.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      ytProcess.kill();
    }
  });

  const contentType = type === 'video' ? 'video/mp4' : 'audio/mpeg';

  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  });
}
