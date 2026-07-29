'use client';

import React, { useState } from 'react';
import { 
  Download, 
  Sparkles, 
  Music, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  ShieldAlert, 
  ShieldCheck, 
  Github, 
  ExternalLink,
  FileText,
  Layers,
  Clock,
  Loader2
} from 'lucide-react';

interface FormatOption {
  format_id: string;
  quality: string;
  height?: number;
  ext: string;
  filesize: number;
  has_audio: boolean;
  url?: string;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number | string;
  uploader: string;
  views: number;
  video_formats: FormatOption[];
  audio_formats: FormatOption[];
  subtitles: { lang: string; name: string }[];
  original_url: string;
}

interface PopupMessage {
  id: string;
  type: 'error' | 'success' | 'info' | 'warning';
  title: string;
  description: string;
  position?: 'toast' | 'modal';
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [tab, setTab] = useState<'video' | 'audio'>('video');
  const [selectedFormat, setSelectedFormat] = useState<FormatOption | null>(null);
  const [downloading, setDownloading] = useState(false);
  
  // Additional features checkboxes
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [playlistMode, setPlaylistMode] = useState(false);

  // Popup & Modal States
  const [popups, setPopups] = useState<PopupMessage[]>([]);
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null);

  const addPopup = (message: Omit<PopupMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newPopup = { ...message, id };
    setPopups((prev) => [...prev, newPopup]);

    if (message.position !== 'modal') {
      setTimeout(() => {
        removePopup(id);
      }, 6000);
    }
  };

  const removePopup = (id: string) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
  };

  const formatDuration = (val: number | string) => {
    if (!val) return '';
    if (typeof val === 'string' && val.includes(':')) {
      const parts = val.split(':');
      if (parts.length === 3) {
        return `${parts[0]}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
      }
      if (parts.length === 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
      }
      return val;
    }
    const seconds = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(seconds) || seconds <= 0) return '';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleFetchInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      addPopup({
        type: 'warning',
        title: 'URL Necessária',
        description: 'Por favor, insira o link de um vídeo do YouTube válido.',
        position: 'toast'
      });
      return;
    }

    setLoading(true);
    setVideoInfo(null);
    setSelectedFormat(null);

    // Disclaimer popup on search start
    addPopup({
      type: 'info',
      title: 'Aviso de Responsabilidade',
      description: 'Ao buscar este link, você confirma que o uso e o processamento dos dados/arquivos são de sua inteira responsabilidade.',
      position: 'toast'
    });

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

      addPopup({
        type: 'success',
        title: 'Mídia Encontrada!',
        description: 'Selecione a resolução ou formato desejado para iniciar a transferência.',
        position: 'toast'
      });

    } catch (err: any) {
      addPopup({
        type: 'error',
        title: 'Erro ao buscar mídia',
        description: err.message || 'Erro ao conectar ao servidor. Verifique o link e tente novamente.',
        position: 'toast'
      });
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
        throw new Error(data.error || 'Não foi possível gerar o link de download.');
      }

      if (data.download_url) {
        // Trigger browser download via direct link
        const a = document.createElement('a');
        a.href = data.download_url;
        a.target = '_blank';
        a.download = data.filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        addPopup({
          type: 'success',
          title: 'Download Iniciado',
          description: 'A transferência da sua mídia foi iniciada no navegador.',
          position: 'toast'
        });
      }
    } catch (err: any) {
      addPopup({
        type: 'error',
        title: 'Falha no Download',
        description: err.message || 'Erro ao gerar o fluxo de download.',
        position: 'toast'
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 relative overflow-hidden flex flex-col justify-between">
      {/* Background Decorative Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-[128px] pointer-events-none" />

      {/* Popups & Toasts Container */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col space-y-3 max-w-md w-full px-4 pointer-events-none">
        {popups.filter(p => p.position !== 'modal').map((popup) => (
          <div
            key={popup.id}
            className={`pointer-events-auto p-4 rounded-xl border backdrop-blur-xl shadow-2xl flex items-start space-x-3 transition-all animate-fadeIn ${
              popup.type === 'error'
                ? 'bg-red-950/80 border-red-500/30 text-red-200'
                : popup.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-200'
                : popup.type === 'warning'
                ? 'bg-amber-950/80 border-amber-500/30 text-amber-200'
                : 'bg-indigo-950/80 border-indigo-500/30 text-indigo-200'
            }`}
          >
            {popup.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
            {popup.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
            {popup.type === 'warning' && <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
            {popup.type === 'info' && <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />}

            <div className="flex-1 text-xs sm:text-sm">
              <h4 className="font-bold text-white mb-0.5 leading-snug">{popup.title}</h4>
              <p className="opacity-90 leading-relaxed text-balance">{popup.description}</p>
            </div>

            <button
              onClick={() => removePopup(popup.id)}
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Interactive Modal for Terms & Privacy */}
      {activeModal && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors text-lg"
            >
              ✕
            </button>

            {activeModal === 'terms' ? (
              <>
                <div className="flex items-center space-x-3 text-indigo-400">
                  <ShieldCheck className="w-6 h-6 shrink-0" />
                  <h3 className="text-xl font-bold text-white leading-snug">Termos de Uso</h3>
                </div>
                <div className="text-xs sm:text-sm text-slate-300 space-y-4 max-h-96 overflow-y-auto pr-2 leading-relaxed text-pretty">
                  <p>
                    O <strong>YouDown</strong> é uma interface web de código aberto e gratuita desenvolvida apenas como um meio que conecta o usuário às funcionalidades públicas da biblioteca <strong>yt-dlp</strong>.
                  </p>
                  <p>
                    <strong>Responsabilidade de Uso:</strong> O site não armazena, hospeda, processa ou distribui nenhum arquivo de mídia, áudio ou vídeo em seus servidores. O download é realizado via redirecionamento de fluxo diretamente para o dispositivo do usuário.
                  </p>
                  <p>
                    O usuário assume total responsabilidade pelo conteúdo baixado e pelo cumprimento dos direitos autorais aplicáveis em sua jurisdição. O serviço é 100% gratuito e sem fins lucrativos.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-3 text-purple-400">
                  <ShieldAlert className="w-6 h-6 shrink-0" />
                  <h3 className="text-xl font-bold text-white leading-snug">Política de Privacidade</h3>
                </div>
                <div className="text-xs sm:text-sm text-slate-300 space-y-4 max-h-96 overflow-y-auto pr-2 leading-relaxed text-pretty">
                  <p>
                    Sua privacidade é totalmente preservada no <strong>YouDown</strong>.
                  </p>
                  <p>
                    <strong>Nenhum Dado Coletado:</strong> Não exigimos cadastro, não utilizamos cookies de rastreamento, nem armazenamos histórico das URLs inseridas ou dos arquivos baixados.
                  </p>
                  <p>
                    Todas as requisições utilizam funções serverless temporárias apenas para extrair os links de dados públicos fornecidos pelo <strong>yt-dlp</strong>.
                  </p>
                </div>
              </>
            )}

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-semibold transition-all"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Header */}
      <header className="border-b border-white/5 bg-[#090d16]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-0 sm:h-16 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
              <Download className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-300 whitespace-nowrap">
              YouDown
            </span>
          </div>

          {/* Badge posicionado abaixo em telas pequenas (mobile), e alinhado na direita em telas maiores */}
          <div className="flex items-center space-x-2 text-xs text-slate-400 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full whitespace-nowrap sm:mt-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>100% Gratuito & Livre</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 w-full flex flex-col justify-center">
        {/* Title & Tagline */}
        <div className="text-center mb-8 sm:mb-10 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 rounded-full text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap">Download Ultra Rápido em 1 Clique</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight sm:leading-tight">
            Baixe seus vídeos e áudios <br className="hidden sm:inline" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              sem complicações
            </span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-base max-w-lg mx-auto leading-relaxed text-balance">
            Cole a URL do vídeo do YouTube e escolha a qualidade desejada <span className="inline-block whitespace-nowrap">(4K, 1080p, MP3, M4A).</span>
          </p>
        </div>

        {/* Input & Search Form */}
        <form onSubmit={handleFetchInfo} className="mb-6 sm:mb-8">
          <div className="relative glass-card rounded-2xl p-2 flex flex-col sm:flex-row items-center gap-2 border border-white/10 shadow-2xl focus-within:border-indigo-500/50 transition-all">
            <div className="relative flex-1 w-full flex items-center">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cole o link do YouTube aqui (ex: https://youtube.com/watch?v=...)"
                className="w-full bg-transparent px-4 py-3 sm:py-4 text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold px-6 py-3.5 sm:py-4 rounded-xl text-sm sm:text-base flex items-center justify-center space-x-2 transition-all shadow-lg shadow-indigo-500/25 shrink-0 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Buscando...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Buscar Mídia</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Options & Features Bar */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-slate-300 mb-8 sm:mb-10 px-2">
          <label className="flex items-center space-x-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
              audioOnly 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                : 'border-slate-600 bg-slate-800/80 group-hover:border-slate-400'
            }`}>
              {audioOnly && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
            <input
              type="checkbox"
              checked={audioOnly}
              onChange={(e) => {
                setAudioOnly(e.target.checked);
                if (e.target.checked && videoInfo) setTab('audio');
              }}
              className="sr-only"
            />
            <span className="flex items-center space-x-1.5 select-none whitespace-nowrap">
              <Music className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Apenas Áudio (MP3/M4A)</span>
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
              downloadSubtitles 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                : 'border-slate-600 bg-slate-800/80 group-hover:border-slate-400'
            }`}>
              {downloadSubtitles && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
            <input
              type="checkbox"
              checked={downloadSubtitles}
              onChange={(e) => setDownloadSubtitles(e.target.checked)}
              className="sr-only"
            />
            <span className="flex items-center space-x-1.5 select-none whitespace-nowrap">
              <FileText className="w-4 h-4 text-purple-400 shrink-0" />
              <span>Incluir Legendas</span>
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
              playlistMode 
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                : 'border-slate-600 bg-slate-800/80 group-hover:border-slate-400'
            }`}>
              {playlistMode && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
            <input
              type="checkbox"
              checked={playlistMode}
              onChange={(e) => setPlaylistMode(e.target.checked)}
              className="sr-only"
            />
            <span className="flex items-center space-x-1.5 select-none whitespace-nowrap">
              <Layers className="w-4 h-4 text-pink-400 shrink-0" />
              <span>Suporte a Playlist</span>
            </span>
          </label>
        </div>

        {/* Video Metadata & Format Options Card */}
        {videoInfo && (
          <div className="glass-card rounded-2xl p-5 sm:p-8 space-y-6 shadow-2xl border border-white/10 animate-fadeIn">
            {/* Video Info Preview */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-6 border-b border-white/10">
              <div className="relative group shrink-0 w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-slate-800 border border-white/10">
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-full h-full object-cover"
                />
                {formatDuration(videoInfo.duration) && (
                  <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-mono text-white flex items-center space-x-1 border border-white/10 shadow-md">
                    <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span>{formatDuration(videoInfo.duration)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-white line-clamp-2 leading-snug text-pretty">
                  {videoInfo.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span>Canal: <strong className="text-slate-200">{videoInfo.uploader}</strong></span>
                </div>
              </div>
            </div>

            {/* Quality / Format Tabs */}
            <div className="space-y-4">
              <div className="flex border-b border-white/10 gap-6">
                <button
                  onClick={() => {
                    setTab('video');
                    if (videoInfo.video_formats?.length > 0) setSelectedFormat(videoInfo.video_formats[0]);
                  }}
                  className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
                    tab === 'video'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>Vídeo com Som</span>
                </button>
                <button
                  onClick={() => {
                    setTab('audio');
                    if (videoInfo.audio_formats?.length > 0) setSelectedFormat(videoInfo.audio_formats[0]);
                  }}
                  className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
                    tab === 'audio'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Music className="w-4 h-4" />
                  <span>Áudio Apenas</span>
                </button>
              </div>

              {/* Format Select Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {tab === 'video' ? (
                  videoInfo.video_formats.map((fmt) => (
                    <button
                      key={fmt.format_id}
                      onClick={() => setSelectedFormat(fmt)}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        selectedFormat?.format_id === fmt.format_id
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="font-bold flex items-center space-x-2">
                          <span className="uppercase text-xs font-mono bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                            {fmt.ext}
                          </span>
                          <span>{fmt.quality}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Tamanho dinâmico
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        selectedFormat?.format_id === fmt.format_id
                          ? 'border-indigo-400 bg-indigo-500 text-white'
                          : 'border-slate-600'
                      }`}>
                        {selectedFormat?.format_id === fmt.format_id && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  ))
                ) : (
                  videoInfo.audio_formats.map((fmt) => (
                    <button
                      key={fmt.format_id}
                      onClick={() => setSelectedFormat(fmt)}
                      className={`p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        selectedFormat?.format_id === fmt.format_id
                          ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="font-bold flex items-center space-x-2">
                          <span className="uppercase text-xs font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                            {fmt.ext}
                          </span>
                          <span>{fmt.quality}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          Áudio de Alta Qualidade
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                        selectedFormat?.format_id === fmt.format_id
                          ? 'border-indigo-400 bg-indigo-500 text-white'
                          : 'border-slate-600'
                      }`}>
                        {selectedFormat?.format_id === fmt.format_id && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Download CTA Button */}
              <button
                onClick={handleDownload}
                disabled={downloading || !selectedFormat}
                className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl text-sm sm:text-base flex items-center justify-center space-x-3 shadow-xl shadow-indigo-600/30 transition-all disabled:opacity-50 active:scale-[0.99]"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                    <span>Iniciando Download...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 shrink-0" />
                    <span className="whitespace-nowrap">Baixar Agora ({selectedFormat?.quality || 'Selecionado'})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Responsive Footer */}
      <footer className="border-t border-white/5 py-6 sm:py-8 bg-[#090d16]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-slate-400">
          {/* GitHub Used Repositories */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Repositório Oficial do Site */}
            <a
              href="https://github.com/disoliveiradso/YouDown"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-1.5 rounded-xl text-slate-200 transition-all whitespace-nowrap shadow-sm"
              title="Repositório Oficial do YouDown"
            >
              <Github className="w-4 h-4 text-white shrink-0" />
              <span className="font-semibold">Repositório do Site</span>
              <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
            </a>

            {/* Separador Barrinha */}
            <span className="text-slate-600 font-light select-none hidden sm:inline text-sm">|</span>

            {/* Texto discreto com menos destaque */}
            <span className="text-[11px] text-slate-500 font-medium tracking-wide uppercase whitespace-nowrap">
              Repositórios utilizados :
            </span>

            {/* 3 Repositórios Utilizados */}
            <a
              href="https://github.com/yt-dlp/yt-dlp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 rounded-xl text-slate-300 transition-all text-xs whitespace-nowrap"
              title="Motor Principal de Extração"
            >
              <Github className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>yt-dlp</span>
              <ExternalLink className="w-3.5 h-3 text-slate-500 shrink-0" />
            </a>

            <a
              href="https://github.com/Brainicism/bgutil-ytdlp-pot-provider"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 rounded-xl text-slate-300 transition-all text-xs whitespace-nowrap"
              title="Provedor de PO-Token Antibot"
            >
              <Github className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>bgutil-ytdlp-pot</span>
              <ExternalLink className="w-3.5 h-3 text-slate-500 shrink-0" />
            </a>

            <a
              href="https://github.com/iv-org/invidious"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 rounded-xl text-slate-300 transition-all text-xs whitespace-nowrap"
              title="API Fallback Secundária"
            >
              <Github className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <span>Invidious API</span>
              <ExternalLink className="w-3.5 h-3 text-slate-500 shrink-0" />
            </a>
          </div>

          {/* Legal Links */}
          <div className="flex items-center space-x-5 text-slate-300 whitespace-nowrap shrink-0">
            <button
              onClick={() => setActiveModal('terms')}
              className="hover:text-indigo-400 transition-colors"
            >
              Termos de Uso
            </button>
            <span>•</span>
            <button
              onClick={() => setActiveModal('privacy')}
              className="hover:text-indigo-400 transition-colors"
            >
              Privacidade & Isenção
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
