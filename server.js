require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const Media = require('./models/media');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_TOKEN = process.env.UPLOAD_TOKEN || 'seu-token-secreto-aqui';
const BYTES_PER_MB = 1024 * 1024;
const DEFAULT_MAX_UPLOAD_MB = 100;
const _maxFromEnv = Number.parseInt(process.env.MAX_FILE_SIZE, 10);
const MAX_FILE_SIZE =
  Number.isFinite(_maxFromEnv) && _maxFromEnv > 0
    ? _maxFromEnv
    : DEFAULT_MAX_UPLOAD_MB * BYTES_PER_MB;
const MONGODB_URI = process.env.MONGODB_URI;
const GRIDFS_BUCKET_NAME = process.env.GRIDFS_BUCKET_NAME || 'mediaFs';

if (!MONGODB_URI) {
  console.error('Defina MONGODB_URI no ambiente (arquivo .env ou variável do sistema).');
  process.exit(1);
}

let gridFSBucket;

function getGridFSBucket() {
  if (!gridFSBucket) {
    gridFSBucket = new GridFSBucket(mongoose.connection.db, { bucketName: GRIDFS_BUCKET_NAME });
  }
  return gridFSBucket;
}

function uploadBufferToGridFS(bucket, filename, buffer, metadata) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { metadata });
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

function deleteGridFSFile(bucket, id) {
  return new Promise((resolve, reject) => {
    bucket.delete(id, (err) => (err ? reject(err) : resolve()));
  });
}

// Middleware
app.use(cors());
app.use(express.json());

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

async function uniqueStoredFilename(ext) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const name = `${randomMediaKey()}${ext}`;
    const exists = await Media.exists({ filename: name });
    if (!exists) {
      return name;
    }
  }
  throw new Error('Não foi possível gerar nome de arquivo único');
}

const upload = multer({
  storage: multer.memoryStorage(),
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

    const rawExt = path.extname(req.file.originalname);
    const ext = rawExt ? rawExt.toLowerCase().replace(/[^.a-z0-9]/g, '') : '';

    let storedFilename;
    try {
      storedFilename = await uniqueStoredFilename(ext);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Erro ao gerar identificador do arquivo' });
    }

    const mimeType = req.file.mimetype || 'application/octet-stream';
    const bucket = getGridFSBucket();
    let gridfsId;

    try {
      gridfsId = await uploadBufferToGridFS(bucket, storedFilename, req.file.buffer, {
        originalName: req.file.originalname,
        mimeType,
        size: req.file.size
      });
    } catch (gridErr) {
      console.error('Erro ao gravar no GridFS:', gridErr);
      return res.status(500).json({ error: 'Erro ao armazenar o arquivo no banco' });
    }

    let doc;
    try {
      doc = await Media.create({
        filename: storedFilename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType,
        gridfsId
      });
    } catch (dbErr) {
      try {
        await deleteGridFSFile(bucket, gridfsId);
      } catch (_) {
        /* ignore */
      }
      console.error('Erro ao registrar mídia no banco:', dbErr);
      return res.status(500).json({ error: 'Erro ao registrar o arquivo no banco de dados' });
    }

    const fileUrl = `/download/${storedFilename}`;

    res.status(200).json({
      success: true,
      message: 'Arquivo enviado com sucesso',
      id: doc._id.toString(),
      filename: storedFilename,
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
    const doc = await Media.findOne({ filename }).lean();

    if (!doc || !doc.gridfsId) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    const bucket = getGridFSBucket();
    res.setHeader('Content-Type', doc.mimeType);
    const asciiName = doc.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`
    );

    const downloadStream = bucket.openDownloadStream(doc.gridfsId);

    downloadStream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(404).json({ error: 'Arquivo não encontrado no armazenamento' });
      } else {
        downloadStream.destroy();
      }
    });

    req.on('aborted', () => downloadStream.destroy());
    res.on('close', () => downloadStream.destroy());

    downloadStream.pipe(res);
  } catch (error) {
    console.error('Erro no download:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao processar o download do arquivo' });
    }
  }
});

// Endpoint de health check
app.get('/health', (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({
    status: mongoOk ? 'ok' : 'degraded',
    service: 'midiaservice',
    mongodb: mongoOk ? 'connected' : 'disconnected',
    storage: 'gridfs',
    maxUploadMb: Math.round(MAX_FILE_SIZE / BYTES_PER_MB),
    timestamp: new Date().toISOString()
  });
});

// Tratamento de erros do Multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `Arquivo muito grande. Tamanho máximo permitido: ${Math.round(MAX_FILE_SIZE / BYTES_PER_MB)} MB`
      });
    }
    return res.status(400).json({ error: `Erro no upload: ${error.message}` });
  }
  next(error);
});

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('MongoDB conectado.');
  gridFSBucket = new GridFSBucket(mongoose.connection.db, { bucketName: GRIDFS_BUCKET_NAME });
  console.log(`GridFS bucket: ${GRIDFS_BUCKET_NAME}`);

  app.listen(PORT, () => {
    console.log(`🚀 MidiaService rodando na porta ${PORT}`);
    console.log(`📎 Limite por arquivo: ${Math.round(MAX_FILE_SIZE / BYTES_PER_MB)} MB`);
    console.log(`🗄️  Arquivos: MongoDB GridFS (${GRIDFS_BUCKET_NAME})`);
    console.log(`🔐 Autenticação: Token Bearer`);
    console.log(`📤 Upload: POST /upload (com autenticação)`);
    console.log(`📥 Download: GET /download/:filename (público)`);
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar:', err);
  process.exit(1);
});
