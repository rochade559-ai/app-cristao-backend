const express = require('express');
const router = express.Router();
router.post('/create', (req, res) => res.json({ success: true, message: 'Post criado!' }));
router.get('/feed', (req, res) => res.json({ success: true, posts: [] }));
module.exports = router;
