const express = require('express');

const {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
} = require('../controllers/noteController');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authMiddleware, getNotes);
router.post('/', authMiddleware, createNote);
router.put('/:id', authMiddleware, updateNote);
router.delete('/:id', authMiddleware, deleteNote);

module.exports = router;