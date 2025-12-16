# Guia de Uso - MidiaService

Documento completo explicando como usar o serviço de hospedagem de mídia.

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Instalação e Configuração](#instalação-e-configuração)
3. [Como Usar](#como-usar)
4. [Exemplos Práticos](#exemplos-práticos)
5. [Integração com Outros Sistemas](#integração-com-outros-sistemas)
6. [Tratamento de Erros](#tratamento-de-erros)
7. [Boas Práticas](#boas-práticas)

---

## 🎯 Visão Geral

O **MidiaService** é um serviço REST simples para hospedagem de arquivos que permite:
- **Upload** de arquivos com autenticação por token
- **Download** público de arquivos (sem autenticação)

### Características Principais

- ✅ Autenticação por token Bearer para upload
- ✅ Download público e direto
- ✅ Suporte a qualquer tipo de arquivo
- ✅ Nomes únicos automáticos para evitar conflitos
- ✅ Limite de tamanho configurável
- ✅ API REST simples e intuitiva

---

## 🚀 Instalação e Configuração

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo e configure:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
# Porta do servidor
PORT=3000

# Token de autenticação para upload (DEFINA UM TOKEN SEGURO!)
UPLOAD_TOKEN=Fg34Dsew5783gTy

# Tamanho máximo de arquivo em bytes (padrão: 100MB)
# Exemplo: 50MB = 52428800, 200MB = 209715200
MAX_FILE_SIZE=104857600
```

**⚠️ IMPORTANTE:** Use um token seguro e único em produção!

### 3. Iniciar o Servidor

**Desenvolvimento:**
```bash
npm run dev
```

**Produção:**
```bash
npm start
```

**Com PM2:**
```bash
pm2 start server.js --name midiaservice
pm2 save  # Salvar para iniciar automaticamente
```

O servidor estará disponível em `http://localhost:3000` (ou na porta configurada).

---

## 📖 Como Usar

### Endpoint: Upload de Arquivo

**URL:** `POST /upload`

**Autenticação:** Obrigatória (Bearer Token)

**Headers:**
```
Authorization: Bearer <seu-token>
Content-Type: multipart/form-data
```

**Body (form-data):**
- Campo: `file`
- Valor: Arquivo a ser enviado

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "message": "Arquivo enviado com sucesso",
  "filename": "documento-1765896976608-288694637.pdf",
  "originalName": "documento.pdf",
  "size": 102400,
  "url": "/download/documento-1765896976608-288694637.pdf",
  "fullUrl": "http://localhost:3000/download/documento-1765896976608-288694637.pdf"
}
```

**Respostas de Erro:**

- `401` - Token não fornecido:
```json
{
  "error": "Token de autenticação não fornecido"
}
```

- `403` - Token inválido:
```json
{
  "error": "Token inválido"
}
```

- `400` - Nenhum arquivo enviado:
```json
{
  "error": "Nenhum arquivo foi enviado"
}
```

- `400` - Arquivo muito grande:
```json
{
  "error": "Arquivo muito grande. Tamanho máximo permitido: 100MB"
}
```

---

### Endpoint: Download de Arquivo

**URL:** `GET /download/:filename`

**Autenticação:** Não necessária (público)

**Parâmetros:**
- `filename`: Nome do arquivo retornado no upload

**Resposta:**
- `200` - Arquivo enviado como download
- `404` - Arquivo não encontrado:
```json
{
  "error": "Arquivo não encontrado"
}
```

---

### Endpoint: Health Check

**URL:** `GET /health`

**Autenticação:** Não necessária

**Resposta:**
```json
{
  "status": "ok",
  "service": "midiaservice",
  "timestamp": "2024-12-16T14:54:25.272Z"
}
```

---

## 💡 Exemplos Práticos

### 1. Upload com cURL

```bash
# Upload básico
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer Fg34Dsew5783gTy" \
  -F "file=@/caminho/para/arquivo.pdf"

# Upload salvando resposta em arquivo
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer Fg34Dsew5783gTy" \
  -F "file=@documento.pdf" \
  -o resposta.json

# Upload com output formatado (jq)
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer Fg34Dsew5783gTy" \
  -F "file=@imagem.jpg" | jq .
```

### 2. Download com cURL

```bash
# Download básico
curl http://localhost:3000/download/documento-1765896976608-288694637.pdf

# Download salvando em arquivo
curl -O http://localhost:3000/download/documento-1765896976608-288694637.pdf

# Download com nome personalizado
curl -o meu-arquivo.pdf http://localhost:3000/download/documento-1765896976608-288694637.pdf
```

### 3. Upload com JavaScript (Fetch API)

```javascript
const uploadFile = async (file, token) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('http://localhost:3000/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro no upload');
    }

    const result = await response.json();
    console.log('Upload realizado:', result);
    return result;
  } catch (error) {
    console.error('Erro:', error.message);
    throw error;
  }
};

// Uso
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const token = 'Fg34Dsew5783gTy';

uploadFile(file, token)
  .then(result => {
    console.log('URL do arquivo:', result.fullUrl);
  })
  .catch(error => {
    console.error('Falha no upload:', error);
  });
```

### 4. Upload com Node.js (Axios)

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const uploadFile = async (filePath, token) => {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  try {
    const response = await axios.post('http://localhost:3000/upload', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Upload realizado:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Erro:', error.response.data);
    } else {
      console.error('Erro:', error.message);
    }
    throw error;
  }
};

// Uso
uploadFile('./documento.pdf', 'Fg34Dsew5783gTy')
  .then(result => {
    console.log('URL:', result.fullUrl);
  });
```

### 5. Upload com Python (Requests)

```python
import requests

def upload_file(file_path, token, base_url='http://localhost:3000'):
    url = f'{base_url}/upload'
    headers = {
        'Authorization': f'Bearer {token}'
    }
    
    with open(file_path, 'rb') as file:
        files = {'file': file}
        response = requests.post(url, headers=headers, files=files)
    
    if response.status_code == 200:
        result = response.json()
        print(f'Upload realizado: {result["fullUrl"]}')
        return result
    else:
        error = response.json()
        raise Exception(error.get('error', 'Erro no upload'))

# Uso
try:
    result = upload_file('documento.pdf', 'Fg34Dsew5783gTy')
    print(f'URL do arquivo: {result["fullUrl"]}')
except Exception as e:
    print(f'Erro: {e}')
```

### 6. Download com Python

```python
import requests

def download_file(filename, save_path, base_url='http://localhost:3000'):
    url = f'{base_url}/download/{filename}'
    response = requests.get(url)
    
    if response.status_code == 200:
        with open(save_path, 'wb') as file:
            file.write(response.content)
        print(f'Arquivo salvo em: {save_path}')
    else:
        error = response.json()
        raise Exception(error.get('error', 'Erro no download'))

# Uso
download_file('documento-1765896976608-288694637.pdf', 'arquivo_baixado.pdf')
```

### 7. Upload com PHP

```php
<?php
function uploadFile($filePath, $token, $baseUrl = 'http://localhost:3000') {
    $url = $baseUrl . '/upload';
    
    $ch = curl_init($url);
    
    $file = new CURLFile($filePath);
    $data = ['file' => $file];
    
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $token
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        $result = json_decode($response, true);
        echo "Upload realizado: " . $result['fullUrl'] . "\n";
        return $result;
    } else {
        $error = json_decode($response, true);
        throw new Exception($error['error'] ?? 'Erro no upload');
    }
}

// Uso
try {
    $result = uploadFile('documento.pdf', 'Fg34Dsew5783gTy');
    echo "URL: " . $result['fullUrl'] . "\n";
} catch (Exception $e) {
    echo "Erro: " . $e->getMessage() . "\n";
}
?>
```

---

## 🔗 Integração com Outros Sistemas

### Fluxo Típico de Integração

1. **Sistema A** faz upload do arquivo usando o token
2. **MidiaService** retorna a URL do arquivo
3. **Sistema A** armazena a URL
4. **Sistema B** (ou qualquer sistema) pode fazer download usando a URL pública

### Exemplo de Integração Completa

```javascript
// Sistema que faz upload
async function enviarArquivoParaMidiaService(arquivo) {
  const token = process.env.MIDIA_SERVICE_TOKEN;
  const baseUrl = process.env.MIDIA_SERVICE_URL;
  
  const formData = new FormData();
  formData.append('file', arquivo);
  
  const response = await fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  if (!response.ok) {
    throw new Error('Falha no upload');
  }
  
  const result = await response.json();
  
  // Salvar a URL no banco de dados
  await salvarUrlArquivo(result.fullUrl);
  
  return result.fullUrl;
}

// Sistema que faz download (pode ser outro sistema)
async function baixarArquivo(url) {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error('Arquivo não encontrado');
  }
  
  const blob = await response.blob();
  return blob;
}
```

---

## ⚠️ Tratamento de Erros

### Códigos HTTP

- **200** - Sucesso
- **400** - Requisição inválida (sem arquivo, arquivo muito grande)
- **401** - Não autenticado (token não fornecido)
- **403** - Acesso negado (token inválido)
- **404** - Arquivo não encontrado (download)
- **500** - Erro interno do servidor

### Exemplo de Tratamento Completo

```javascript
async function uploadComTratamentoErro(file, token) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('http://localhost:3000/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      switch (response.status) {
        case 401:
          throw new Error('Token não fornecido. Verifique a autenticação.');
        case 403:
          throw new Error('Token inválido. Verifique suas credenciais.');
        case 400:
          throw new Error(data.error || 'Erro na requisição.');
        default:
          throw new Error(data.error || 'Erro desconhecido.');
      }
    }
    
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      // Erro de rede
      throw new Error('Erro de conexão. Verifique se o servidor está rodando.');
    }
    throw error;
  }
}
```

---

## ✅ Boas Práticas

### Segurança

1. **Use tokens seguros:** Gere tokens longos e aleatórios
2. **Proteja o token:** Nunca exponha o token no frontend ou em logs
3. **Use HTTPS em produção:** Sempre use HTTPS para proteger o token em trânsito
4. **Rotacione tokens:** Mude o token periodicamente

### Performance

1. **Limite o tamanho:** Configure `MAX_FILE_SIZE` adequadamente
2. **Monitore o espaço:** Acompanhe o uso do disco na pasta `uploads/`
3. **Backup:** Faça backup regular da pasta `uploads/`

### Manutenção

1. **Logs:** Monitore os logs do servidor
2. **Health Check:** Use `/health` para monitoramento
3. **Limpeza:** Implemente rotina para remover arquivos antigos se necessário

### Exemplo de Token Seguro

```bash
# Gerar token seguro (Linux/Mac)
openssl rand -hex 32

# Ou usar Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do servidor
2. Teste o endpoint `/health`
3. Verifique se o token está correto no `.env`
4. Confirme que a pasta `uploads/` existe e tem permissões de escrita

---

**Última atualização:** Dezembro 2024

