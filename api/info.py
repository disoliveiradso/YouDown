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
                return

        except Exception as e:
            # Fallback to Piped API if yt-dlp fails (e.g. YouTube Bot Block)
            fallback_data = self._fallback_piped(url)
            if fallback_data:
                self._respond_json(fallback_data)
                return

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

    def _fallback_piped(self, url):
        import re
        import urllib.request

        # Extract YouTube Video ID
        match = re.search(r'(?:v=|\/([0-9A-Za-z_-]{11}).*|embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})', url)
        if not match:
            return None
        
        video_id = match.group(1) or match.group(2)
        if not video_id:
            return None

        endpoints = [
            f"https://pipedapi.kavin.rocks/streams/{video_id}",
            f"https://api.piped.video/streams/{video_id}",
            f"https://pipedapi.mha.fi/streams/{video_id}"
        ]

        for ep in endpoints:
            try:
                req = urllib.request.Request(ep, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                with urllib.request.urlopen(req, timeout=6) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode('utf-8'))
                        
                        video_formats = []
                        audio_formats = []
                        seen_resolutions = set()
                        seen_audio = set()

                        # Process Video Streams
                        for vs in data.get('videoStreams', []):
                            height = vs.get('height')
                            quality_label = vs.get('quality') or (f"{height}p" if height else None)
                            if height and height not in seen_resolutions:
                                seen_resolutions.add(height)
                                video_formats.append({
                                    'format_id': f"piped-v-{height}",
                                    'quality': quality_label,
                                    'height': height,
                                    'ext': 'mp4',
                                    'filesize': vs.get('bitrate', 0),
                                    'has_audio': vs.get('videoOnly') is not True,
                                    'url': vs.get('url')
                                })

                        # Process Audio Streams
                        for idx, as_stream in enumerate(data.get('audioStreams', [])):
                            quality = as_stream.get('quality') or '128 kbps'
                            key = f"{as_stream.get('format', 'mp3')}-{quality}"
                            if key not in seen_audio:
                                seen_audio.add(key)
                                audio_formats.append({
                                    'format_id': f"piped-a-{idx}",
                                    'quality': str(quality),
                                    'ext': 'mp3',
                                    'filesize': as_stream.get('bitrate', 0),
                                    'url': as_stream.get('url')
                                })

                        video_formats.sort(key=lambda x: x.get('height', 0), reverse=True)

                        return {
                            'title': data.get('title', 'Vídeo do YouTube'),
                            'thumbnail': data.get('thumbnailUrl', ''),
                            'duration': data.get('duration', 0),
                            'uploader': data.get('uploader', 'YouTube Uploader'),
                            'views': data.get('views', 0),
                            'video_formats': video_formats[:6],
                            'audio_formats': audio_formats[:4],
                            'subtitles': [],
                            'original_url': url
                        }
            except Exception:
                continue
        return None

    def _respond_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))