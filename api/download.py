from http.server import BaseHTTPRequestHandler
import json
import urllib.parse

import os

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body.decode('utf-8'))
            url = data.get('url', '').strip()
            format_id = data.get('format_id')
            download_type = data.get('type', 'video') # 'video' or 'audio'
        except Exception:
            self._respond_json({'error': 'Requisição inválida'}, status=400)
            return

        if not url:
            self._respond_json({'error': 'URL é obrigatória'}, status=400)
            return

        if not yt_dlp:
            self._respond_json({'error': 'yt-dlp não disponível no servidor'}, status=500)
            return

        cookie_file_path = None
        if os.environ.get('YOUTUBE_COOKIES'):
            cookie_file_path = '/tmp/youtube_cookies.txt'
            try:
                with open(cookie_file_path, 'w', encoding='utf-8') as f:
                    f.write(os.environ.get('YOUTUBE_COOKIES'))
            except Exception:
                pass

        # Configure yt-dlp format string
        if format_id:
            format_selector = format_id
        else:
            format_selector = 'bestvideo+bestaudio/best' if download_type == 'video' else 'bestaudio/best'

        youtube_args = ['client=ANDROID,IOS,TV']
        if os.environ.get('POT_PROVIDER_URL'):
            youtube_args.append(f"po_token=web+{os.environ.get('POT_PROVIDER_URL')}")

        extractor_args = {
            'youtube': youtube_args
        }

        if os.environ.get('BGUTIL_BASE_URL'):
            extractor_args['youtubepot-bgutilhttp'] = [f"base_url={os.environ.get('BGUTIL_BASE_URL')}"]

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': format_selector,
            'skip_download': True,
            'extractor_args': extractor_args,
        }

        if cookie_file_path:
            ydl_opts['cookiefile'] = cookie_file_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if 'entries' in info:
                    info = info['entries'][0]

                # Get direct download URL
                download_url = info.get('url')
                title = info.get('title', 'video')
                ext = info.get('ext', 'mp4' if download_type == 'video' else 'mp3')

                # If single format URL not found, check requested format
                if not download_url and 'formats' in info:
                    for f in info['formats']:
                        if f.get('format_id') == format_id:
                            download_url = f.get('url')
                            ext = f.get('ext', ext)
                            break
                    if not download_url and info['formats']:
                        download_url = info['formats'][-1].get('url')

                if not download_url:
                    self._respond_json({'error': 'Não foi possível obter o link de download direto'}, status=404)
                    return

                # Clean filename
                clean_title = "".join(c for c in title if c.isalnum() or c in (' ', '_', '-')).rstrip()

                response_data = {
                    'download_url': download_url,
                    'title': clean_title,
                    'filename': f"{clean_title}.{ext}",
                    'ext': ext
                }

                self._respond_json(response_data)
                return

        except Exception as e:
            # Fallback to Invidious + Piped + Cobalt APIs if yt-dlp fails
            fallback_res = self._fallback_piped_download(url, download_type)
            if fallback_res:
                self._respond_json(fallback_res)
                return

            self._respond_json({'error': f'Falha ao gerar link de download: {str(e)}'}, status=500)

    def _fallback_piped_download(self, url, download_type):
        import re
        import urllib.request

        match = re.search(r'(?:v=|\/([0-9A-Za-z_-]{11}).*|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})', url)
        video_id = match.group(1) or match.group(2) if match else None
        
        if not video_id:
            return None

        # 1. Try Invidious Instances
        invidious_instances = [
            f"https://inv.itissimple.org/api/v1/videos/{video_id}",
            f"https://invidious.nerdvpn.de/api/v1/videos/{video_id}",
            f"https://yewtu.be/api/v1/videos/{video_id}",
            f"https://invidious.drgns.space/api/v1/videos/{video_id}"
        ]

        for ep in invidious_instances:
            try:
                req = urllib.request.Request(ep, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode('utf-8'))
                        title = data.get('title', 'video')
                        clean_title = "".join(c for c in title if c.isalnum() or c in (' ', '_', '-')).rstrip()

                        if download_type == 'audio':
                            adaptive = data.get('adaptiveFormats', [])
                            for fmt in adaptive:
                                if 'audio' in fmt.get('type', ''):
                                    return {
                                        'download_url': fmt.get('url'),
                                        'title': clean_title,
                                        'filename': f"{clean_title}.mp3",
                                        'ext': 'mp3'
                                    }
                        else:
                            formats = data.get('formatStreams', [])
                            if formats:
                                return {
                                    'download_url': formats[0].get('url'),
                                    'title': clean_title,
                                    'filename': f"{clean_title}.mp4",
                                    'ext': 'mp4'
                                }
            except Exception:
                continue

        # 2. Try Piped Instances
        piped_instances = [
            f"https://pipedapi.kavin.rocks/streams/{video_id}",
            f"https://api.piped.video/streams/{video_id}",
            f"https://pipedapi.adminforge.de/streams/{video_id}"
        ]

        for ep in piped_instances:
            try:
                req = urllib.request.Request(ep, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                with urllib.request.urlopen(req, timeout=5) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode('utf-8'))
                        title = data.get('title', 'video')
                        clean_title = "".join(c for c in title if c.isalnum() or c in (' ', '_', '-')).rstrip()

                        if download_type == 'audio':
                            audio_streams = data.get('audioStreams', [])
                            if audio_streams:
                                return {
                                    'download_url': audio_streams[0].get('url'),
                                    'title': clean_title,
                                    'filename': f"{clean_title}.mp3",
                                    'ext': 'mp3'
                                }
                        else:
                            video_streams = data.get('videoStreams', [])
                            if video_streams:
                                best_stream = next((vs for vs in video_streams if vs.get('videoOnly') is not True), video_streams[0])
                                return {
                                    'download_url': best_stream.get('url'),
                                    'title': clean_title,
                                    'filename': f"{clean_title}.mp4",
                                    'ext': 'mp4'
                                }
            except Exception:
                continue

        # 3. Try Cobalt API Instance
        try:
            cobalt_req = urllib.request.Request(
                'https://api.cobalt.tools/',
                data=json.dumps({'url': f"https://www.youtube.com/watch?v={video_id}"}).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            )
            with urllib.request.urlopen(cobalt_req, timeout=6) as resp:
                if resp.status == 200:
                    cdata = json.loads(resp.read().decode('utf-8'))
                    if cdata.get('url'):
                        return {
                            'download_url': cdata.get('url'),
                            'title': f"video_{video_id}",
                            'filename': f"video_{video_id}.mp4" if download_type == 'video' else f"audio_{video_id}.mp3",
                            'ext': 'mp4' if download_type == 'video' else 'mp3'
                        }
        except Exception:
            pass

        return None

    def _respond_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))