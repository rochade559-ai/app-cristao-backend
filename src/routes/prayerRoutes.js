const express = require('express');
const router = express.Router();
router.post('/set-times', (req, res) => res.json({ success: true, message: 'Horários salvos!' }));
router.post('/confirm', (req, res) => res.json({ success: true, message: 'Oração confirmada! +1 ponto' }));
module.exports = router;
