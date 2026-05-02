const vision = require('@google-cloud/vision');

let client = null;

try {
  client = new vision.ImageAnnotatorClient();
  console.log('✅ Google Cloud Vision API inicializado');
} catch (error) {
  console.error('❌ Erro ao inicializar Vision API:', error.message);
}

async function moderateImage(imageBuffer) {
  if (!client) {
    console.warn('⚠️ Vision API não disponível, pulando moderação');
    return { safe: true, reasons: {}, message: 'Moderação não disponível' };
  }

  try {
    const [result] = await client.safeSearchDetection(imageBuffer);
    const detections = result.safeSearchAnnotation || {};

    const levels = {
      'UNKNOWN': 0,
      'VERY_UNLIKELY': 1,
      'UNLIKELY': 2,
      'POSSIBLE': 3,
      'LIKELY': 4,
      'VERY_LIKELY': 5
    };

    const categories = {
      adult: 'conteúdo adulto',
      violence: 'violência',
      racy: 'conteúdo sugestivo',
      medical: 'conteúdo médico explícito'
    };

    const blockedReasons = [];
    const reasons = {};

    for (const [key, label] of Object.entries(categories)) {
      const value = detections[key] || 'VERY_UNLIKELY';
      reasons[key] = value;
      if (levels[value] >= 4) {
        blockedReasons.push(label);
      }
    }

    if (blockedReasons.length > 0) {
      return {
        safe: false,
        reasons,
        message: `Imagem contém ${blockedReasons.join(', ')}`
      };
    }

    return {
      safe: true,
      reasons,
      message: 'Imagem aprovada'
    };
  } catch (error) {
    console.error('❌ Erro na moderação da imagem:', error);
    return {
      safe: true,
      reasons: {},
      message: 'Erro na moderação, imagem permitida'
    };
  }
}

module.exports = { moderateImage };