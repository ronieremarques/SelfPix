const express = require('express');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const ExifReader = require('exifreader');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Array de tokens do Gemini
const GEMINI_API_KEYS = [
];

// Função para obter um token aleatório
function getRandomGeminiToken() {
  const randomIndex = Math.floor(Math.random() * GEMINI_API_KEYS.length);
  return GEMINI_API_KEYS[randomIndex];
}

const app = express();
const port = 3000;

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '.jpg');
  }
});

// Filtro para aceitar apenas JPG
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/jpeg') {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens JPG são aceitas'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter
});

// Servir arquivos estáticos
app.use(express.static('public'));

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Função para verificar se é uma captura de tela
function isScreenshot(metadata, exifData) {
  // Padrões comuns de software de captura de tela
  const screenshotSoftware = [
    'screenshot', 'print', 'snipping tool', 'lightshot', 'greenshot', 
    'snagit', 'windows', 'android', 'ios', 'mac', 'iphone'
  ];

  // Verificar software nos metadados
  if (exifData.Software) {
    const software = exifData.Software.toLowerCase();
    if (screenshotSoftware.some(s => software.includes(s))) {
      return true;
    }
  }

  // Verificar proporções típicas de tela
  const aspectRatio = metadata.width / metadata.height;
  const commonRatios = [
    16/9, // 1.77 - Widescreen
    16/10, // 1.6 - Laptop comum
    4/3, // 1.33 - Monitor tradicional
    21/9, // 2.33 - Ultrawide
    19/9 // 2.11 - Smartphones modernos
  ];

  // Permitir uma margem de erro de 5% nas proporções
  const isCommonRatio = commonRatios.some(ratio => 
    Math.abs(aspectRatio - ratio) < ratio * 0.05
  );

  // Verificar dimensões típicas de tela
  const commonResolutions = [
    [1920, 1080], // Full HD
    [2560, 1440], // 2K
    [3840, 2160], // 4K
    [1366, 768], // Laptop comum
    [1280, 720], // HD
    [1440, 900], // MacBook
    [2880, 1800], // MacBook Retina
    [1792, 828], // iPhone
    [2340, 1080], // Android comum
  ];

  const hasCommonResolution = commonResolutions.some(([w, h]) => 
    (Math.abs(metadata.width - w) < w * 0.1 && Math.abs(metadata.height - h) < h * 0.1) ||
    (Math.abs(metadata.width - h) < h * 0.1 && Math.abs(metadata.height - w) < w * 0.1)
  );

  return isCommonRatio || hasCommonResolution;
}

// Função para extrair todos os metadados da imagem
async function extractMetadata(imagePath) {
  const metadata = {
    basic: {},
    exif: {},
    imageInfo: {},
    warnings: [],
    isScreenshot: false
  };

  try {
    // Informações básicas do arquivo
    const stats = fs.statSync(imagePath);
    metadata.basic = {
      tamanho: `${(stats.size / 1024).toFixed(2)} KB`,
      criacao: stats.birthtime.toLocaleString(),
      modificacao: stats.mtime.toLocaleString(),
      ultimoAcesso: stats.atime.toLocaleString()
    };

    // Informações da imagem via Sharp
    const imageInfo = await sharp(imagePath).metadata();
    metadata.imageInfo = {
      largura: imageInfo.width,
      altura: imageInfo.height,
      formato: imageInfo.format,
      espacoCor: imageInfo.space,
      canais: imageInfo.channels,
      profundidadeBits: imageInfo.depth,
      dpi: imageInfo.density,
      temAlpha: imageInfo.hasAlpha,
      compressao: imageInfo.compression
    };

    // Metadados EXIF
    const imageBuffer = fs.readFileSync(imagePath);
    const tags = ExifReader.load(imageBuffer);

    // Processar tags EXIF
    for (let key in tags) {
      if (tags[key] && tags[key].description) {
        metadata.exif[key] = tags[key].description;
      }
    }

    // Verificar se é screenshot
    metadata.isScreenshot = isScreenshot(metadata.imageInfo, metadata.exif);
    if (!metadata.isScreenshot) {
      metadata.warnings.push('⚠️ Imagem não parece ser uma captura de tela');
    }

    // Verificações de segurança específicas para screenshots
    const timeDiff = Math.abs(stats.mtime - stats.birthtime);
    if (timeDiff > 300000) { // 5 minutos
      metadata.warnings.push('⚠️ Tempo suspeito entre criação e modificação do arquivo');
    }

    // Verificar qualidade da imagem
    const stats2 = await sharp(imagePath).stats();
    const avgColorVariation = Math.abs(stats2.channels[0].mean - stats2.channels[0].min);
    if (avgColorVariation < 10) {
      metadata.warnings.push('⚠️ Baixa variação de cores - possível edição');
    }

    // Verificar compressão excessiva
    if (stats.size < 50 * 1024) { // Menos de 50KB
      metadata.warnings.push('⚠️ Arquivo muito pequeno para uma captura de tela');
    }

    // Verificar resolução muito baixa
    if (imageInfo.width < 300 || imageInfo.height < 300) {
      metadata.warnings.push('⚠️ Resolução muito baixa para uma captura de tela');
    }

    // Verificar edição em software de imagem
    if (metadata.exif.Software) {
      if (/photoshop|gimp|paint|editor|adobe/i.test(metadata.exif.Software)) {
        metadata.warnings.push(`⚠️ Software de edição detectado: ${metadata.exif.Software}`);
      }
    }

  } catch (error) {
    console.error('Erro ao extrair metadados:', error);
    metadata.warnings.push('⚠️ Erro ao analisar alguns metadados');
  }

  return metadata;
}

// Função para análise com Gemini AI
async function analyzeWithGemini(text, metadata, expectedData = {}) {
  try {
    const genAI = new GoogleGenerativeAI(getRandomGeminiToken());
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
    Analise este comprovante de pagamento e verifique sua autenticidade. 
    
    DADOS DO COMPROVANTE:
    Texto extraído: ${text}
    
    METADADOS DA IMAGEM:
    Tamanho: ${metadata.basic.tamanho}
    Data de Criação: ${metadata.basic.criacao}
    Data de Modificação: ${metadata.basic.modificacao}
    Resolução: ${metadata.imageInfo.largura}x${metadata.imageInfo.altura}
    Formato: ${metadata.imageInfo.formato}
    Software: ${metadata.exif.Software || 'Não disponível'}
    
    DADOS ESPERADOS (se fornecidos):
    Valor esperado: ${expectedData.valor || 'Não informado'}
    CPF/CNPJ do beneficiário: ${expectedData.documento || 'Não informado'}
    Nome do beneficiário: ${expectedData.beneficiario || 'Não informado'}
    Banco do beneficiário: ${expectedData.banco || 'Não informado'}
    
    Por favor, analise e responda:
    1. O comprovante parece autêntico?
    2. Os horários de criação do arquivo e data do pagamento são coerentes?
    3. Os dados do beneficiário conferem com os esperados?
    4. Há sinais de manipulação ou edição?
    5. O valor do pagamento confere?
    6. Existem inconsistências nos metadados?
    7. Qual sua conclusão final sobre a autenticidade deste comprovante?
    
    Forneça uma análise detalhada e justifique sua conclusão.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();

  } catch (error) {
    console.error('Erro na análise do Gemini:', error);
    throw new Error('Falha na análise de IA do comprovante');
  }
}

// Função para validar o comprovante (atualizada)
async function validateReceipt(text, imagePath, expectedData = {}) {
  const validation = {
    isValid: false,
    details: [],
    metadata: null,
    textAnalysis: {
      keywords: [],
      valores: [],
      datas: [],
      warnings: []
    },
    aiAnalysis: null
  };

  // Extrair e analisar metadados
  validation.metadata = await extractMetadata(imagePath);

  // Análise de texto
  const keywords = ['pagamento', 'comprovante', 'transferência', 'valor', 'data', 'R$', 'pago', 'recebido', 'banco'];
  validation.textAnalysis.keywords = keywords.filter(keyword => 
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  // Encontrar valores monetários
  const valores = text.match(/R?\$?\s*\d+[.,]\d{2}/g) || [];
  validation.textAnalysis.valores = valores.map(v => ({
    original: v,
    valor: parseFloat(v.replace(/[R$\s]/g, '').replace(',', '.'))
  }));

  // Encontrar datas
  const datas = text.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{2}/g) || [];
  validation.textAnalysis.datas = datas;

  // Verificar inconsistências no texto
  if (/\s{3,}/.test(text)) {
    validation.textAnalysis.warnings.push('⚠️ Espaçamento irregular detectado');
  }

  if (/[^a-zA-Z0-9\s\.,\-\/\(\)\$\%\:áéíóúâêîôûãõçàèìòùäëïöü]/g.test(text)) {
    validation.textAnalysis.warnings.push('⚠️ Caracteres não usuais detectados');
  }

  // Análise com IA
  try {
    validation.aiAnalysis = await analyzeWithGemini(text, validation.metadata, expectedData);
  } catch (error) {
    validation.aiAnalysis = "Não foi possível realizar a análise de IA: " + error.message;
  }

  // Validação final (agora inclui resultado da IA)
  validation.isValid = (
    validation.metadata.isScreenshot && // Deve ser uma captura de tela
    validation.textAnalysis.keywords.length >= 2 &&
    validation.textAnalysis.valores.length > 0 &&
    validation.textAnalysis.datas.length > 0 &&
    validation.metadata.warnings.length <= 2 &&
    validation.textAnalysis.warnings.length <= 1 &&
    !validation.aiAnalysis.toLowerCase().includes("não autêntico") &&
    !validation.aiAnalysis.toLowerCase().includes("manipulação")
  );

  // Detalhes da validação
  validation.details = [
    `${validation.metadata.isScreenshot ? '✓' : '✗'} Verificação de captura de tela`,
    `${validation.isValid ? '✓' : '✗'} Palavras-chave encontradas: ${validation.textAnalysis.keywords.length}`,
    `${validation.textAnalysis.valores.length > 0 ? '✓' : '✗'} Valores monetários encontrados: ${validation.textAnalysis.valores.length}`,
    `${validation.textAnalysis.datas.length > 0 ? '✓' : '✗'} Datas encontradas: ${validation.textAnalysis.datas.length}`,
    `${validation.metadata.warnings.length <= 2 ? '✓' : '✗'} Avisos de metadados: ${validation.metadata.warnings.length}`,
    `${validation.textAnalysis.warnings.length <= 1 ? '✓' : '✗'} Avisos de texto: ${validation.textAnalysis.warnings.length}`
  ];

  return validation;
}

// Função para pré-processar a imagem
async function preprocessImage(imagePath) {
  const processedPath = imagePath.replace(/\.\w+$/, '_processed.png');
  await sharp(imagePath)
    .resize(1800, null, { withoutEnlargement: true })
    .sharpen()
    .normalize()
    .toFile(processedPath);
  return processedPath;
}

// Rota para processar o upload do comprovante (atualizada)
app.post('/validate', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
  }

  let worker = null;
  let processedImagePath = null;

  try {
    // Extrair dados esperados do corpo da requisição
    const expectedData = {
      valor: req.body.valor,
      documento: req.body.documento,
      beneficiario: req.body.beneficiario,
      banco: req.body.banco
    };

    // Pré-processar a imagem
    processedImagePath = await preprocessImage(req.file.path);

    // Configurar e iniciar o worker do Tesseract
    worker = await createWorker();
    await worker.loadLanguage('por');
    await worker.initialize('por');
    
    // Realizar OCR
    const { data: { text } } = await worker.recognize(processedImagePath);
    
    // Validar o texto extraído e a imagem
    const validationResult = await validateReceipt(text, req.file.path, expectedData);

    res.json({
      success: true,
      validation: validationResult,
      extractedText: text
    });

  } catch (error) {
    console.error('Erro ao processar o comprovante:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao processar o comprovante. Por favor, tente novamente.'
    });
  } finally {
    // Limpar recursos
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        console.error('Erro ao terminar worker:', e);
      }
    }

    // Remover arquivos temporários
    try {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      if (processedImagePath && fs.existsSync(processedImagePath)) {
        fs.unlinkSync(processedImagePath);
      }
    } catch (e) {
      console.error('Erro ao remover arquivos temporários:', e);
    }
  }
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
}); 
