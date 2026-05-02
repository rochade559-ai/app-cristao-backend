const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, admin } = require('../services/firebase');
const authMiddleware = require('../middleware/auth');
const { moderateImage } = require('../services/imageModerationService');

// Configurar multer com limite de tamanho
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB máximo
});

// ============================================
// 1. CRIAR TESTEMUNHO (COM MODERAÇÃO)
// ============================================
router.post('/', authMiddleware, upload.single('foto'), async (req, res) => {
  const { texto } = req.body;
  const userId = req.user.uid;
  const userName = req.user.name || 'Anônimo';

  // Validar texto
  if (!texto || texto.trim() === '') {
    return res.status(400).json({ error: 'Texto do testemunho é obrigatório' });
  }

  if (texto.length > 500) {
    return res.status(400).json({ error: 'Texto deve ter no máximo 500 caracteres' });
  }

  let fotoURL = null;

  try {
    // Moderar imagem se foi enviada
    if (req.file) {
      const moderation = await moderateImage(req.file.buffer);
      if (!moderation.safe) {
        return res.status(400).json({ error: `Imagem não permitida: ${moderation.message}` });
      }
      fotoURL = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    // Criar testemunho
    const testemunho = {
      userId,
      userName,
      texto: texto.trim(),
      fotoURL,
      likes: [],
      createdAt: admin.firestore.Timestamp.now()
    };

    const docRef = await db.collection('testemunhos').add(testemunho);
    
    res.status(201).json({ 
      id: docRef.id, 
      message: 'Testemunho publicado com sucesso!' 
    });
  } catch (error) {
    console.error('Erro ao criar testemunho:', error);
    res.status(500).json({ error: 'Erro interno ao publicar testemunho' });
  }
});

// ============================================
// 2. LISTAR TESTEMUNHOS
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const snapshot = await db.collection('testemunhos')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const testemunhos = [];
    snapshot.forEach(doc => {
      testemunhos.push({ id: doc.id, ...doc.data() });
    });

    res.json(testemunhos);
  } catch (error) {
    console.error('Erro ao listar testemunhos:', error);
    res.status(500).json({ error: 'Erro ao carregar testemunhos' });
  }
});

// ============================================
// 3. DAR LIKE EM TESTEMUNHO
// ============================================
router.post('/:id/like', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;

  try {
    const testemunhoRef = db.collection('testemunhos').doc(id);
    const testemunho = await testemunhoRef.get();

    if (!testemunho.exists) {
      return res.status(404).json({ error: 'Testemunho não encontrado' });
    }

    const likes = testemunho.data().likes || [];
    const jaDeuLike = likes.includes(userId);

    if (jaDeuLike) {
      await testemunhoRef.update({
        likes: admin.firestore.FieldValue.arrayRemove(userId)
      });
      res.json({ message: 'Like removido', liked: false });
    } else {
      await testemunhoRef.update({
        likes: admin.firestore.FieldValue.arrayUnion(userId)
      });
      res.json({ message: 'Like adicionado', liked: true });
    }
  } catch (error) {
    console.error('Erro ao dar like:', error);
    res.status(500).json({ error: 'Erro ao processar like' });
  }
});

// ============================================
// 4. DELETAR TESTEMUNHO (APENAS O CRIADOR)
// ============================================
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;

  try {
    const testemunhoRef = db.collection('testemunhos').doc(id);
    const testemunho = await testemunhoRef.get();

    if (!testemunho.exists) {
      return res.status(404).json({ error: 'Testemunho não encontrado' });
    }

    if (testemunho.data().userId !== userId) {
      return res.status(403).json({ error: 'Você só pode deletar seus próprios testemunhos' });
    }

    await testemunhoRef.delete();
    res.json({ message: 'Testemunho deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar testemunho:', error);
    res.status(500).json({ error: 'Erro ao deletar testemunho' });
  }
});

module.exports = router;