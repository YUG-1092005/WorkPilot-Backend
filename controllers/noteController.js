const Note = require('../models/Note');
const Business = require('../models/Business');

const getBusiness = async (userId) => {
  return await Business.findOne({
    ownerId: userId,
  });
};

// GET NOTES
const getNotes = async (req, res) => {
  try {
    const business = await getBusiness(req.user.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business workspace not found',
      });
    }

    const {
      search = '',
      type = '',
    } = req.query;

    const filter = {
      businessId: business._id,
    };

    if (type) {
      filter.type = type;
    }

    if (search.trim()) {
      filter.$or = [
        {
          title: {
            $regex: search.trim(),
            $options: 'i',
          },
        },
        {
          content: {
            $regex: search.trim(),
            $options: 'i',
          },
        },
      ];
    }

    const notes = await Note.find(filter)
      .sort({
        isPinned: -1,
        updatedAt: -1,
      })
      .lean();

    return res.json({
      success: true,
      notes,
    });
  } catch (error) {
    console.error('Get notes error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load notes',
    });
  }
};

// CREATE NOTE
const createNote = async (req, res) => {
  try {
    const business = await getBusiness(req.user.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business workspace not found',
      });
    }

    const {
      title,
      content,
      type,
      customerId,
      invoiceId,
      productId,
      expenseId,
      isPinned,
      followUpDate,
    } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Note title is required',
      });
    }

    if (!content?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Note content is required',
      });
    }

    const note = await Note.create({
      businessId: business._id,
      userId: req.user.id,
      title: title.trim(),
      content: content.trim(),
      type: type || 'General',
      customerId: customerId || null,
      invoiceId: invoiceId || null,
      productId: productId || null,
      expenseId: expenseId || null,
      isPinned: Boolean(isPinned),
      followUpDate: followUpDate || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Note created successfully',
      note,
    });
  } catch (error) {
    console.error('Create note error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to create note',
    });
  }
};

// UPDATE NOTE
const updateNote = async (req, res) => {
  try {
    const business = await getBusiness(req.user.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business workspace not found',
      });
    }

    const note = await Note.findOne({
      _id: req.params.id,
      businessId: business._id,
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found',
      });
    }

    const {
      title,
      content,
      type,
      customerId,
      invoiceId,
      productId,
      expenseId,
      isPinned,
      followUpDate,
    } = req.body;

    if (title !== undefined) {
      note.title = title.trim();
    }

    if (content !== undefined) {
      note.content = content.trim();
    }

    if (type !== undefined) {
      note.type = type;
    }

    if (customerId !== undefined) {
      note.customerId = customerId || null;
    }

    if (invoiceId !== undefined) {
      note.invoiceId = invoiceId || null;
    }

    if (productId !== undefined) {
      note.productId = productId || null;
    }

    if (expenseId !== undefined) {
      note.expenseId = expenseId || null;
    }

    if (isPinned !== undefined) {
      note.isPinned = Boolean(isPinned);
    }

    if (followUpDate !== undefined) {
      note.followUpDate = followUpDate || null;
    }

    await note.save();

    return res.json({
      success: true,
      message: 'Note updated successfully',
      note,
    });
  } catch (error) {
    console.error('Update note error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to update note',
    });
  }
};

// DELETE NOTE
const deleteNote = async (req, res) => {
  try {
    const business = await getBusiness(req.user.id);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business workspace not found',
      });
    }

    const note = await Note.findOneAndDelete({
      _id: req.params.id,
      businessId: business._id,
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found',
      });
    }

    return res.json({
      success: true,
      message: 'Note deleted successfully',
    });
  } catch (error) {
    console.error('Delete note error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to delete note',
    });
  }
};

module.exports = {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
};