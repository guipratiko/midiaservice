# MidiaService

Serviço simples de hospedagem de mídia para upload e download de arquivos.

## Características

- ✅ Upload de arquivos com autenticação por token
- ✅ Download público (sem autenticação)
- ✅ Código limpo e organizado
- ✅ Sem frontend

## Instalação

```bash
npm install
```

## Configuração

1. Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```

2. Edite o arquivo `.env` e configure:
- `PORT`: Porta do servidor (padrão: 3000)
- `UPLOAD_TOKEN`: Token secreto para autenticação de upload
- `MAX_FILE_SIZE`: Tamanho máximo de arquivo em bytes (padrão: 100MB)

## Execução

```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

Ou com PM2:
```bash
pm2 start server.js --name midiaservice
```

## API Endpoints

### Upload de Arquivo

**POST** `/upload`

**Autenticação:** Bearer Token (header `Authorization: Bearer <token>`)

**Content-Type:** `multipart/form-data`

**Body:**
- `file`: Arquivo a ser enviado

**Resposta de sucesso (200):**
```json
{
  "success": true,
  "message": "Arquivo enviado com sucesso",
  "filename": "documento-1234567890-123456789.pdf",
  "originalName": "documento.pdf",
  "size": 1024,
  "url": "/download/documento-1234567890-123456789.pdf",
  "fullUrl": "http://localhost:3000/download/documento-1234567890-123456789.pdf"
}
```

**Exemplo com cURL:**
```bash
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer seu-token-secreto-aqui" \
  -F "file=@/caminho/para/arquivo.pdf"
```

### Download de Arquivo

**GET** `/download/:filename`

**Autenticação:** Nenhuma (público)

**Exemplo:**
```bash
curl http://localhost:3000/download/documento-1234567890-123456789.pdf
```

### Health Check

**GET** `/health`

**Resposta:**
```json
{
  "status": "ok",
  "service": "midiaservice",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Estrutura de Diretórios

```
midiaservice/
├── server.js          # Servidor principal
├── package.json       # Dependências
├── .env              # Configurações (não versionado)
├── .env.example      # Exemplo de configuração
├── uploads/          # Diretório de arquivos enviados
└── README.md         # Documentação
```

## Segurança

- O upload requer autenticação por token
- O download é público (sem autenticação)
- Arquivos são armazenados com nomes únicos para evitar conflitos
- Tamanho máximo de arquivo configurável

## Notas

- Os arquivos são armazenados localmente na pasta `uploads/`
- Cada arquivo recebe um nome único baseado em timestamp e número aleatório
- O nome original do arquivo é preservado na resposta do upload

