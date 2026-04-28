require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { AccessToken } = require('livekit-server-sdk');
const axios = require('axios');

const authRoutes = require('./src/routes/authRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// 1. ROTAS DE AUTENTICAÇÃO
// ============================================
app.use('/api/auth', authRoutes);

// ============================================
// 2. HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => 
  res.json({ status: 'online', message: 'APP CRISTÃO ONLINE!' })
);

// ============================================
// 3. LIVEKIT - GERAR TOKEN PARA CHAMADAS
// ============================================
app.post('/api/livekit/token', async (req, res) => {
  const { roomName, participantName } = req.body;

  if (!roomName || !participantName) {
    return res.status(400).json({ 
      error: 'roomName e participantName são obrigatórios' 
    });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_WS_URL || 'wss://seu-projeto.livekit.cloud';

  if (!apiKey || !apiSecret) {
    console.error('❌ LIVEKIT_API_KEY ou LIVEKIT_API_SECRET não configurados no .env');
    return res.status(500).json({ error: 'Servidor mal configurado' });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      ttl: 3600,
    });
    at.addGrant({ roomJoin: true, room: roomName });
    const token = await at.toJwt();
    res.json({ token, wsUrl });
  } catch (error) {
    console.error('Erro ao gerar token LiveKit:', error);
    res.status(500).json({ error: 'Falha ao gerar token' });
  }
});

// ============================================
// 4. CHECKOUT FALSO - DOAÇÕES VIA CHAVE PIX FIXA
// ============================================

// Armazenamento temporário das transações (em produção use banco de dados)
const pendingTransactions = {};

// Chave Pix fixa da empresa
const PIX_KEY = 'd7de304f-cb52-42b2-a230-addabe095f55';
const PIX_KEY_TYPE = 'uuid'; // tipo: cpf, email, telefone, uuid
const PIX_RECEIVER_NAME = 'KODAFF COMERCIO E MARKETING LTDA';

// Função para gerar string completa do QR Code Pix (formato BR Code)
function generatePixQRCodeString(amount, transactionId) {
  // Formato simplificado do BR Code para Pix
  // Payload Format Indicator
  let payload = '000201';
  // Merchant Account Information - GUI (BCB)
  payload += '26360014br.gov.bcb.pix0114' + PIX_KEY;
  // Merchant Category Code
  payload += '52040000';
  // Transaction Currency - BRL
  payload += '5303986';
  // Transaction Amount
  const amountFormatted = amount.toFixed(2);
  const amountLength = amountFormatted.length.toString().padStart(2, '0');
  payload += `54${amountLength}${amountFormatted}`;
  // Country Code
  payload += '5802BR';
  // Merchant Name
  const nameLength = PIX_RECEIVER_NAME.length.toString().padStart(2, '0');
  payload += `59${nameLength}${PIX_RECEIVER_NAME}`;
  // Merchant City (simplificado)
  payload += '6007BRASILIA';
  // Additional Data Field - Transaction ID
  const txId = transactionId.slice(-8);
  const txIdLength = txId.length.toString().padStart(2, '0');
  payload += `62${txIdLength}${txId}`;
  // CRC16 (simplificado - em produção usar cálculo real)
  payload += '6304E6D6';
  
  return payload;
}

// Endpoint para criar uma nova transação de doação
app.post('/api/donations/fake-checkout', async (req, res) => {
  const { amount, userId, userName, userEmail } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Valor da doação é obrigatório e deve ser maior que zero." });
  }

  // Gera um identificador único para essa transação
  const transactionId = `DON_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  
  // Calcula expiração (15 minutos)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);

  // Salva no "banco" em memória
  pendingTransactions[transactionId] = {
    transactionId,
    userId: userId || 'anonymous',
    userName: userName || 'Anônimo',
    userEmail: userEmail || null,
    amount: parseFloat(amount),
    createdAt: new Date(),
    expiresAt,
    status: 'pending', // pending, waiting_confirmation, confirmed
    paidAt: null,
    confirmedAt: null
  };

  // Gera o QR Code string
  const qrCodeString = generatePixQRCodeString(parseFloat(amount), transactionId);

  // Retorna os dados que o app vai mostrar
  res.json({
    success: true,
    transaction_id: transactionId,
    pix_key: PIX_KEY,
    pix_key_type: PIX_KEY_TYPE,
    receiver_name: PIX_RECEIVER_NAME,
    amount: parseFloat(amount),
    expires_at: expiresAt.toISOString(),
    qr_code_string: qrCodeString,
    status: 'pending'
  });
});

// Endpoint para consultar uma transação específica
app.get('/api/donations/checkout/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const transaction = pendingTransactions[transactionId];
  
  if (!transaction) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  
  res.json({
    success: true,
    transaction_id: transaction.transactionId,
    amount: transaction.amount,
    status: transaction.status,
    expires_at: transaction.expiresAt,
    created_at: transaction.createdAt,
    user_name: transaction.userName
  });
});

// Endpoint para confirmar pagamento (usuário apertou "Já paguei")
app.post('/api/donations/confirm', async (req, res) => {
  const { transactionId, userId } = req.body;
  const transaction = pendingTransactions[transactionId];
  
  if (!transaction) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  
  if (transaction.userId !== userId && userId !== 'admin') {
    return res.status(403).json({ error: 'Sem permissão para confirmar esta transação' });
  }
  
  const now = new Date();
  if (now > new Date(transaction.expiresAt)) {
    transaction.status = 'expired';
    return res.status(400).json({ error: 'Prazo de pagamento expirado', status: 'expired' });
  }
  
  if (transaction.status === 'confirmed') {
    return res.json({ success: true, message: 'Pagamento já confirmado anteriormente', already_confirmed: true });
  }
  
  if (transaction.status === 'waiting_confirmation') {
    return res.json({ success: true, message: 'Pagamento já registrado, aguardando confirmação manual' });
  }
  
  // Marca como aguardando confirmação
  transaction.status = 'waiting_confirmation';
  transaction.confirmedAt = now;
  
  res.json({ 
    success: true, 
    message: 'Doação registrada. Aguardamos a confirmação do pagamento no extrato bancário.',
    transaction_id: transactionId,
    status: 'waiting_confirmation'
  });
});

// Endpoint para ADMIN confirmar pagamento manualmente
app.post('/api/donations/admin-confirm', async (req, res) => {
  const { transactionId, adminKey } = req.body;
  
  // Verificação simples de admin (em produção use token JWT)
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso não autorizado' });
  }
  
  const transaction = pendingTransactions[transactionId];
  
  if (!transaction) {
    return res.status(404).json({ error: 'Transação não encontrada' });
  }
  
  if (transaction.status === 'confirmed') {
    return res.json({ success: true, message: 'Transação já estava confirmada' });
  }
  
  transaction.status = 'confirmed';
  transaction.paidAt = new Date();
  
  res.json({ 
    success: true, 
    message: 'Pagamento confirmado com sucesso!',
    transaction_id: transactionId,
    status: 'confirmed'
  });
});

// Endpoint para listar transações pendentes (para ADMIN)
app.get('/api/donations/pending', async (req, res) => {
  const { adminKey } = req.query;
  
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso não autorizado' });
  }
  
  const pending = Object.values(pendingTransactions).filter(
    t => t.status === 'pending' || t.status === 'waiting_confirmation'
  );
  
  res.json({ success: true, transactions: pending });
});

// Endpoint para obter estatísticas (para ADMIN)
app.get('/api/donations/stats', async (req, res) => {
  const { adminKey } = req.query;
  
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Acesso não autorizado' });
  }
  
  const transactions = Object.values(pendingTransactions);
  const totalDonations = transactions.filter(t => t.status === 'confirmed').reduce((sum, t) => sum + t.amount, 0);
  const totalConfirmed = transactions.filter(t => t.status === 'confirmed').length;
  const totalPending = transactions.filter(t => t.status === 'pending').length;
  const totalWaiting = transactions.filter(t => t.status === 'waiting_confirmation').length;
  
  res.json({
    success: true,
    stats: {
      total_donations_amount: totalDonations,
      total_confirmed: totalConfirmed,
      total_pending: totalPending,
      total_waiting_confirmation: totalWaiting,
      total_transactions: transactions.length
    }
  });
});

// ============================================
// 5. INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     APP CRISTÃO - BACKEND 🚀           ║
  ╠════════════════════════════════════════╣
  ║  ✅ Servidor rodando na porta ${PORT}     ║
  ║  📱 API pronta para requisições        ║
  ║  🔗 http://localhost:${PORT}              ║
  ║  🎥 LiveKit token generator ativo      ║
  ║  💰 Checkout PIX (fake) ativo          ║
  ║  📋 Chave Pix: ${PIX_KEY} ║
  ╚════════════════════════════════════════╝
  `);
});