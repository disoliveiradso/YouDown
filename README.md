# 🚀 YouDown - Download de Vídeos e Áudios com Next.js & Python yt-dlp

YouDown é uma aplicação web completa (Full-stack) pronta para ser hospedada gratuitamente na **Vercel**. Permite aos usuários buscar e baixar vídeos e áudios do YouTube diretamente pelo navegador, sem necessidade de abrir terminal ou executar comandos.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons
- **Backend Serverless (Vercel):** Python 3.9+ com a biblioteca `yt-dlp`
- **Estilização:** Dark mode moderno com efeito Glassmorphism e responsividade completa (Mobile + Desktop).

---

## 🚀 Como Fazer o Deploy na Vercel (Passo a Passo)

### 1. Conectar e Implantar na Vercel
1. Acesse o painel da [Vercel](https://vercel.com) e clique em **"Add New" -> "Project"**.
2. Importe o repositório `YouDown` do GitHub.
3. A Vercel detectará automaticamente o framework Next.js e as funções Python na pasta `/api`.
4. Clique em **Deploy**.

---

## 🔄 Como Manter o `yt-dlp` Sempre Atualizado

O YouTube frequentemente atualiza seus algoritmos. Para manter o downloader funcionando, atualize o `requirements.txt` com a versão mais recente do [yt-dlp Releases](https://github.com/yt-dlp/yt-dlp/releases).
