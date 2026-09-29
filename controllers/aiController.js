const { chatWithGemini } = require('../services/aiService');

const chat = async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        message: 'Message is required',
      });
    }

    const result = await chatWithGemini({
      message: message.trim(),
      history: Array.isArray(history) ? history : [],
      userId: req.user._id,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('AI chat error:', error);

    if (
      error.message?.includes('GEMINI_API_KEY')
    ) {
      return res.status(500).json({
        message: 'Gemini AI is not configured on the server',
      });
    }

    return res.status(500).json({
      message:
        'Unable to process your AI request',
    });
  }
};

module.exports = {
  chat,
};