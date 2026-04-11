require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const mongoose = require('mongoose');

const Media = require('./models/media');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || 'seu-token-secreto-aqui';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024; // 100MB padrão
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Defina MONGODB_URI no ambiente (arquivo .env ou variável do sistema).');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Criar diretório de uploads se não existir
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MEDIA_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const MEDIA_KEY_LENGTH = 16;

function randomMediaKey(length = MEDIA_KEY_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += MEDIA_KEY_CHARS[bytes[i] % MEDIA_KEY_CHARS.length];
  }
  return out;
}

// Configuração do Multer para armazenamento de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname);
    const ext = rawExt ? rawExt.toLowerCase().replace(/[^.a-z0-9]/g, '') : '';
    let storedName;
    for (let attempt = 0; attempt < 32; attempt++) {
      storedName = `${randomMediaKey()}${ext}`;
      if (!fs.existsSync(path.join(UPLOAD_DIR, storedName))) {
        return cb(null, storedName);
      }
    }
    cb(new Error('Não foi possível gerar nome de arquivo único'));
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
app.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    let doc;
    try {
      doc = await Media.create({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype || 'application/octet-stream'
      });
    } catch (dbErr) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {
        /* ignore */
      }
      console.error('Erro ao registrar mídia no banco:', dbErr);
      return res.status(500).json({ error: 'Erro ao registrar o arquivo no banco de dados' });
    }

    const fileUrl = `/download/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: 'Arquivo enviado com sucesso',
      id: doc._id.toString(),
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
app.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    const onDisk = fs.existsSync(filePath);
    const inDb = await Media.findOne({ filename }).lean();

    if (!onDisk) {
      if (inDb) {
        return res.status(404).json({ error: 'Arquivo não encontrado no armazenamento' });
      }
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    // Arquivo legado no disco sem registro no banco ainda pode ser baixado
    if (!inDb) {
      console.warn(`Download sem registro no banco (legado): ${filename}`);
    }

    res.download(filePath, (err) => {
      if (err) {
        const isAborted = err.code === 'ECONNABORTED' || err.message === 'Request aborted';
        if (isAborted) {
          return;
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
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({
    status: mongoOk ? 'ok' : 'degraded',
    service: 'midiaservice',
    mongodb: mongoOk ? 'connected' : 'disconnected',
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

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB conectado.');

  app.listen(PORT, () => {
    console.log(`🚀 MidiaService rodando na porta ${PORT}`);
    console.log(`📁 Diretório de uploads: ${UPLOAD_DIR}`);
    console.log(`🔐 Autenticação: Token Bearer`);
    console.log(`📤 Upload: POST /upload (com autenticação)`);
    console.log(`📥 Download: GET /download/:filename (público)`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
