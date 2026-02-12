require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || 'seu-token-secreto-aqui';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024; // 100MB padrão

// Middleware
app.use(cors());
app.use(express.json());

// Criar diretório de uploads se não existir
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configuração do Multer para armazenamento de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Manter nome original com timestamp para evitar conflitos
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

// Middleware de autenticação para upload
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  if (token !== UPLOAD_TOKEN) {
    return res.status(403).json({ error: 'Token inválido' });
  }

  next();
};

// Endpoint de upload (com autenticação)
app.post('/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    const fileUrl = `/download/${req.file.filename}`;
    
    res.status(200).json({
      success: true,
      message: 'Arquivo enviado com sucesso',
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      url: fileUrl,
      fullUrl: `${req.protocol}://${req.get('host')}${fileUrl}`
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro ao processar o upload do arquivo' });
  }
});

// Endpoint de download (sem autenticação)
app.get('/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    // Enviar arquivo
    res.download(filePath, (err) => {
      if (err) {
        // Cliente abortou a conexão (cancelou download, fechou aba, timeout) - não é erro do servidor
        const isAborted = err.code === 'ECONNABORTED' || err.message === 'Request aborted';
        if (isAborted) {
          return; // Não logar nem enviar resposta; a conexão já foi fechada
        }
        console.error('Erro ao fazer download:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Erro ao fazer download do arquivo' });
        }
      }
    });
  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).json({ error: 'Erro ao processar o download do arquivo' });
  }
});

// Endpoint de health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'midiaservice',
    timestamp: new Date().toISOString()
  });
});

// Tratamento de erros do Multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: `Arquivo muito grande. Tamanho máximo permitido: ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      });
    }
    return res.status(400).json({ error: `Erro no upload: ${error.message}` });
  }
  next(error);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 MidiaService rodando na porta ${PORT}`);
  console.log(`📁 Diretório de uploads: ${UPLOAD_DIR}`);
  console.log(`🔐 Autenticação: Token Bearer`);
  console.log(`📤 Upload: POST /upload (com autenticação)`);
  console.log(`📥 Download: GET /download/:filename (público)`);
});

