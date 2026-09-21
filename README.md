# Brito Imóveis — Site Full Stack

Protótipo funcional com site público, filtros, páginas individuais de imóveis, formulário de captação, WhatsApp, painel administrativo e banco SQLite.

## Requisitos
- Node.js 22.5+ (usa o módulo nativo `node:sqlite`)

## Executar
```bash
cd brito-imoveis
ADMIN_TOKEN="uma-senha-forte" npm start
```
Acesse: `http://localhost:8000`

Painel: `http://localhost:8000/admin`

## Estrutura
- `index.html` — site público
- `imovel.html` — página individual
- `admin.html` — painel administrativo
- `style.css` — estilos responsivos
- `script.js` — listagem, filtros, captação e WhatsApp
- `detail.js` — detalhes do imóvel + lead
- `admin.js` — painel
- `server.js` — servidor HTTP + API REST + SQLite
- `brito-imoveis.db` — criado automaticamente na primeira execução

## WhatsApp
O WhatsApp da Brito Imóveis já está configurado como **(11) 96388-2742** (`5511963882742` no formato internacional usado pelos links do WhatsApp).

## Segurança antes de produção
Este projeto é um MVP. Antes de publicar comercialmente:
1. Defina `ADMIN_TOKEN` forte no ambiente; nunca use o valor padrão.
2. Coloque o site atrás de HTTPS.
3. Prefira autenticação real com usuário/senha, hash, sessão segura e proteção CSRF no painel.
4. Adicione política de privacidade e tratamento de consentimento/LGPD.
5. Valide e limite uploads caso substitua URLs de imagens por upload de arquivos.
6. Configure backup do banco de dados.
7. Use um banco gerenciado (PostgreSQL, por exemplo) ao escalar para múltiplos usuários/servidores.

## Dados iniciais
Na primeira execução, o SQLite é preenchido automaticamente com 6 imóveis fictícios para demonstração.
