const express = require('express');
const router = express.Router();
const { db, admin } = require('../services/firebase');

// Middleware de autenticação (simplificado)
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid, name: decoded.name };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Função auxiliar: número da semana
function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// ============================================
// 1. CRIAR EVENTO
// ============================================
router.post('/', authMiddleware, async (req, res) => {
  const { tipo, nome, endereco, cidade, estado, dataHoraInicio, dataHoraFim, fotoCapa } = req.body;
  const userId = req.user.uid;
  const userName = req.user.name || 'Usuário';

  // Validações
  if (!tipo || !nome || !endereco || !cidade || !dataHoraInicio || !dataHoraFim) {
    return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }
  if (nome.length > 30) return res.status(400).json({ error: 'Nome deve ter no máximo 30 caracteres' });
  if (endereco.length > 200) return res.status(400).json({ error: 'Endereço máximo 200 caracteres' });

  const inicio = new Date(dataHoraInicio);
  const fim = new Date(dataHoraFim);
  const agora = new Date();

  if (inicio < agora) return res.status(400).json({ error: 'Data/hora não pode ser no passado' });
  if (fim <= inicio) return res.status(400).json({ error: 'Término deve ser após o início' });

  try {
    const semanaAtual = getWeekNumber(agora);
    const controleRef = db.collection('controle_semanal').doc(userId);
    const controle = await controleRef.get();

    if (controle.exists && controle.data().semana === semanaAtual && controle.data().eventosIds?.length >= 1) {
      return res.status(403).json({ error: 'Você só pode criar 1 evento por semana' });
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const evento = {
      userId, userName, tipo, nome: nome.trim(), endereco: endereco.trim(),
      cidade: cidade.trim(), estado: estado || 'SP',
      dataHoraInicio: admin.firestore.Timestamp.fromDate(inicio),
      dataHoraFim: admin.firestore.Timestamp.fromDate(fim),
      fotoCapa: fotoCapa || null, confirmados: [],
      createdAt: admin.firestore.Timestamp.fromDate(agora),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt), status: 'ativo'
    };

    const eventoRef = await db.collection('eventos').add(evento);
    await controleRef.set({ semana: semanaAtual, eventosIds: [eventoRef.id] }, { merge: true });

    res.status(201).json({ id: eventoRef.id, message: 'Evento criado com sucesso!' });
  } catch (error) {
    console.error('Erro ao criar evento:', error);
    res.status(500).json({ error: 'Erro interno ao criar evento' });
  }
});

// ============================================
// 2. LISTAR EVENTOS ATIVOS
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const agora = new Date();
    const snapshot = await db.collection('eventos')
      .where('status', '==', 'ativo')
      .where('expiresAt', '>=', admin.firestore.Timestamp.fromDate(agora))
      .orderBy('createdAt', 'desc')
      .get();

    const eventos = [];
    snapshot.forEach(doc => eventos.push({ id: doc.id, ...doc.data() }));
    res.json(eventos);
  } catch (error) {
    console.error('Erro ao listar eventos:', error);
    res.status(500).json({ error: 'Erro ao carregar eventos' });
  }
});

// ============================================
// 3. BUSCAR EVENTO POR ID
// ============================================
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const evento = await db.collection('eventos').doc(id).get();
    if (!evento.exists) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json({ id: evento.id, ...evento.data() });
  } catch (error) {
    console.error('Erro ao buscar evento:', error);
    res.status(500).json({ error: 'Erro ao carregar evento' });
  }
});

// ============================================
// 4. CONFIRMAR PRESENÇA (toggle)
// ============================================
router.post('/:id/confirmar', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;

  try {
    const eventoRef = db.collection('eventos').doc(id);
    const evento = await eventoRef.get();
    if (!evento.exists) return res.status(404).json({ error: 'Evento não encontrado' });

    const confirmados = evento.data().confirmados || [];
    const jaConfirmou = confirmados.includes(userId);

    if (jaConfirmou) {
      await eventoRef.update({ confirmados: admin.firestore.FieldValue.arrayRemove(userId) });
      res.json({ message: 'Presença cancelada', confirmado: false });
    } else {
      await eventoRef.update({ confirmados: admin.firestore.FieldValue.arrayUnion(userId) });
      res.json({ message: 'Presença confirmada!', confirmado: true });
    }
  } catch (error) {
    console.error('Erro ao confirmar presença:', error);
    res.status(500).json({ error: 'Erro ao confirmar presença' });
  }
});

module.exports = router;