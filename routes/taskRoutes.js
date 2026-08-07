const express = require('express');
const {
  listTasks,
  getTaskSummary,
  getTaskReferences,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} = require('../controllers/taskController');
const { protectTasks } = require('../middleware/taskAuthMiddleware');

const router = express.Router();
router.use(protectTasks);

router.get('/summary', getTaskSummary);
router.get('/references', getTaskReferences);
router.get('/', listTasks);
router.post('/', createTask);
router.patch('/:id/status', updateTaskStatus);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

module.exports = router;
