from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import sys
import os

# Import yt_dlp dynamically or directly
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
        except Exception:
            self._respond_json({'error': 'Invalid JSON body'}, status=400)
            return

        if not url:
            self._respond_json({'error': 'URL é obrigatória'}, status=400)
            return

        if not yt_dlp:
            self._respond_json({'error': 'yt-dlp não está instalado no servidor'}, status=500)
            return

        cookie_file_path = None
        if os.environ.get('YOUTUBE_COOKIES'):
            cookie_file_path = '/tmp/youtube_cookies.txt'
            try:
                with open(cookie_file_path, 'w', encoding='utf-8') as f:
                    f.write(os.environ.get('YOUTUBE_COOKIES'))
            except Exception:
                pass

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
            'extract_flat': False,
            'skip_download': True,
            'socket_timeout': 10,
            'extractor_args': extractor_args,
        }
        
        if cookie_file_path:
            ydl_opts['cookiefile'] = cookie_file_path

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if 'entries' in info: # Playlist
                    info = info['entries'][0]

                # Process formats
                formats = info.get('formats', [])
                video_formats = []
                audio_formats = []
                subtitles = []

                # Format subtitles
                if info.get('subtitles'):
                    for lang, subs in info.get('subtitles', {}).items():
                        subtitles.append({'lang': lang, 'name': subs[0].get('name', lang)})

                seen_resolutions = set()
                seen_audio = set()

                for f in formats:
                    vcodec = f.get('vcodec', 'none')
                    acodec = f.get('acodec', 'none')
                    ext = f.get('ext', 'mp4')
                    filesize = f.get('filesize') or f.get('filesize_approx') or 0
                    
                    # Video options
                    if vcodec != 'none':
                        height = f.get('height')
                        format_id = f.get('format_id')
                        format_note = f.get('format_note', '')
                        fps = f.get('fps', '')
                        
                        if height and height not in seen_resolutions:
                            seen_resolutions.add(height)
                            quality_label = f"{height}p"
                            if fps and int(fps) >= 50:
                                quality_label += f"{fps}"
                            
                            video_formats.append({
                                'format_id': format_id,
                                'quality': quality_label,
                                'height': height,
                                'ext': ext,
                                'filesize': filesize,
                                'has_audio': acodec != 'none',
                                'url': f.get('url')
                            })

                    # Audio options
                    if vcodec == 'none' and acodec != 'none':
                        abr = f.get('abr') or f.get('tbr') or 128
                        abr_int = int(abr) if abr else 128
                        key = f"{ext}-{abr_int}"
                        
                        if key not in seen_audio:
                            seen_audio.add(key)
                            audio_formats.append({
                                'format_id': f.get('format_id'),
                                'quality': f"{abr_int} kbps",
                                'ext': ext,
                                'filesize': filesize,
                                'url': f.get('url')
                            })

                # Sort video by height descending
                video_formats.sort(key=lambda x: x.get('height', 0), reverse=True)

                response_data = {
                    'title': info.get('title', 'Sem título'),
                    'thumbnail': info.get('thumbnail', ''),
                    'duration': info.get('duration', 0),
                    'uploader': info.get('uploader', 'Desconhecido'),
                    'views': info.get('view_count', 0),
                    'video_formats': video_formats[:6],
                    'audio_formats': audio_formats[:4],
                    'subtitles': subtitles,
                    'original_url': url
                }

                self._respond_json(response_data)

        except Exception as e:
            error_msg = str(e)
            if 'Private video' in error_msg:
                user_msg = 'Este vídeo é privado.'
            elif 'Video unavailable' in error_msg:
                user_msg = 'Vídeo indisponível ou excluído.'
            elif 'Age-restricted' in error_msg:
                user_msg = 'Este vídeo possui restrição de idade.'
            else:
                user_msg = f'Não foi possível obter informações do vídeo: {error_msg}'

            self._respond_json({'error': user_msg}, status=400)

    def _respond_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))