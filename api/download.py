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

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': format_selector,
            'skip_download': True,
            'extractor_args': {
                'youtube': {
                    'player_client': ['ios', 'mweb', 'android'],
                    'player_skip': ['webpage', 'configs', 'js']
                }
            },
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

        except Exception as e:
            self._respond_json({'error': f'Falha ao gerar link de download: {str(e)}'}, status=500)

    def _respond_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))