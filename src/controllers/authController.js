const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const usuarios = new Map();
function generateToken(userId) { return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' }); }
exports.register = async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ success: false, message: 'Preencha todos os campos' });
  if (usuarios.has(email)) return res.status(400).json({ success: false, message: 'E-mail já cadastrado' });
  const userId = crypto.randomBytes(16).toString('hex');
  usuarios.set(email, { id: userId, nome, email, senha, score: 0, level: 'Iniciante na Fé 🥉', prayerStreak: 0, prayerTimesSet: false });
  res.status(201).json({ success: true, message: 'Cadastro realizado!', token: generateToken(userId), user: { id: userId, nome, email } });
};
exports.login = async (req, res) => {
  const { email, senha } = req.body;
  const user = usuarios.get(email);
  if (!user || user.senha !== senha) return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos' });
  res.json({ success: true, message: 'Login realizado!', token: generateToken(user.id), user: { id: user.id, nome: user.nome, email: user.email } });
};
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = usuarios.get(email);
  if (!user) return res.json({ success: true, message: 'Se o e-mail existir, você receberá o link.' });
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetToken = resetToken;
  user.resetTokenExpires = Date.now() + 3600000;
  console.log(`\n🔗 LINK DE RECUPERAÇÃO: appcristao://reset-password/${resetToken}\n`);
  res.json({ success: true, message: 'Link de recuperação enviado!' });
};
exports.resetPassword = async (req, res) => {
  const { token, novaSenha } = req.body;
  let userEncontrado = null;
  for (const [email, user] of usuarios) {
    if (user.resetToken === token && user.resetTokenExpires > Date.now()) {
      userEncontrado = user;
      break;
    }
  }
  if (!userEncontrado) return res.status(400).json({ success: false, message: 'Link inválido ou expirado' });
  userEncontrado.senha = novaSenha;
  userEncontrado.resetToken = null;
  res.json({ success: true, message: 'Senha alterada com sucesso!' });
};
