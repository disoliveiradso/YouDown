'use client';

import React, { useState } from 'react';
import { 
  Download, 
  Search, 
  Video, 
  Music, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Clock, 
  Eye, 
  FileText, 
  Layers, 
  Zap,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

interface FormatOption {
  format_id: string;
  quality: string;
  height?: number;
  ext: string;
  filesize?: number;
  has_audio?: boolean;
  url?: string;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  views: number;
  video_formats: FormatOption[];
  audio_formats: FormatOption[];
  subtitles: { lang: string; name: string }[];
  original_url: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [tab, setTab] = useState<'video' | 'audio'>('video');
  const [selectedFormat, setSelectedFormat] = useState<FormatOption | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  // Additional features checkboxes
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [playlistMode, setPlaylistMode] = useState(false);

  const formatDuration = (seconds: number) => {
    if (!seconds) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return 'Tamanho dinâmico';
    const mb = bytes / (1024 * 1024);
    if (mb > 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const handleFetchInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setSelectedFormat(null);

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Não foi possível carregar as informações.');
      }

      setVideoInfo(data);
      if (audioOnly) {
        setTab('audio');
        if (data.audio_formats?.length > 0) setSelectedFormat(data.audio_formats[0]);
      } else {
        setTab('video');
        if (data.video_formats?.length > 0) setSelectedFormat(data.video_formats[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!videoInfo || !selectedFormat) return;

    setDownloading(true);
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoInfo.original_url,
          format_id: selectedFormat.format_id,
          type: tab
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Falha ao processar download');
      }

      // If direct url or streaming link returned
      if (data.download_url) {
        const link = document.createElement('a');
        link.href = data.download_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('download', data.filename || 'media');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao iniciar o download.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 relative overflow-hidden flex flex-col justify-between">
      {/* Background Decorative Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-[128px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-[#090d16]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Download className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300">
              YouDown
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Gratuito & Sem Anúncios</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 flex-1 w-full flex flex-col justify-center">
        {/* Title & Tagline */}
        <div className="text-center mb-10 space-y-3">
          <div className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Download Ultra Rápido em 1 Clique</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Baixe seus vídeos e áudios <br className="hidden sm:inline" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              sem complicações
            </span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            Cole a URL do vídeo do YouTube e escolha a qualidade desejada (4K, 1080p, MP3, M4A).
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleFetchInfo} className="mb-8">
          <div className="relative glass-effect rounded-2xl p-2 shadow-2xl glow-purple focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
            <div className="flex items-center">
              <div className="pl-4 text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cole o link do vídeo ou playlist aqui (ex: https://www.youtube.com/watch?v=...)"
                required
                className="w-full bg-transparent border-0 py-3.5 px-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 text-sm sm:text-base"
              />
              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold px-6 py-3.5 rounded-xl text-sm flex items-center space-x-2 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <span>Buscar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Additional Features Bar */}
        <div className="glass-card rounded-xl p-4 mb-8 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm text-slate-300">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={audioOnly}
              onChange={(e) => {
                setAudioOnly(e.target.checked);
                if (e.target.checked && videoInfo) setTab('audio');
              }}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="flex items-center space-x-1.5">
              <Music className="w-4 h-4 text-indigo-400" />
              <span>Apenas Áudio (MP3/M4A)</span>
            </span>
          </label>

          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={downloadSubtitles}
              onChange={(e) => setDownloadSubtitles(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="flex items-center space-x-1.5">
              <FileText className="w-4 h-4 text-purple-400" />
              <span>Incluir Legendas</span>
            </span>
          </label>

          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={playlistMode}
              onChange={(e) => setPlaylistMode(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-pink-400" />
              <span>Suporte a Playlist</span>
            </span>
          </label>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-start space-x-3 text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-200">Não foi possível processar este link</p>
              <p className="text-red-400/90 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Video Metadata & Format Options Card */}
        {videoInfo && (
          <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl border border-white/10 animate-fadeIn">
            {/* Video Info Preview */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-6 border-b border-white/10">
              <div className="relative group shrink-0 w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-slate-800 border border-white/10">
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-mono text-white flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>{formatDuration(videoInfo.duration)}</span>
                </div>
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                <h2 className="text-lg font-bold text-white line-clamp-2 leading-snug">
                  {videoInfo.title}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">Canal: {videoInfo.uploader}</span>
                  {videoInfo.views > 0 && (
                    <span className="flex items-center space-x-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>{videoInfo.views.toLocaleString()} visualizações</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Format Selection Tabs */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
                <button
                  type="button"
                  onClick={() => {
                    setTab('video');
                    if (videoInfo.video_formats?.length > 0) setSelectedFormat(videoInfo.video_formats[0]);
                  }}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    tab === 'video'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Video className="w-4 h-4" />
                  <span>Vídeo com Som</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTab('audio');
                    if (videoInfo.audio_formats?.length > 0) setSelectedFormat(videoInfo.audio_formats[0]);
                  }}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    tab === 'audio'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Music className="w-4 h-4" />
                  <span>Áudio Apenas</span>
                </button>
              </div>

              {/* Resolution / Bitrate List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(tab === 'video' ? videoInfo.video_formats : videoInfo.audio_formats)?.map((opt, idx) => {
                  const isSelected = selectedFormat?.format_id === opt.format_id;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedFormat(opt)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 text-white ring-1 ring-indigo-500'
                          : 'border-white/5 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {opt.ext.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center space-x-2">
                            <span>{opt.quality}</span>
                            {opt.height && opt.height >= 1080 && (
                              <span className="text-[10px] bg-gradient-to-r from-amber-500 to-orange-500 text-black px-1.5 py-0.2 font-extrabold rounded">
                                HD
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">{formatFileSize(opt.filesize)}</span>
                        </div>
                      </div>

                      {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Download Action Button */}
            <div className="pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading || !selectedFormat}
                className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl text-base flex items-center justify-center space-x-3 shadow-xl shadow-indigo-600/30 transition-all disabled:opacity-50 active:scale-[0.99]"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Iniciando Download...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>Baixar Agora ({selectedFormat?.quality || 'Selecionado'})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 YouDown. Desenvolvido para Vercel Serverless com yt-dlp.</p>
          <div className="flex items-center space-x-4 text-slate-400">
            <span>Termos de Uso</span>
            <span>•</span>
            <span>Privacidade</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
