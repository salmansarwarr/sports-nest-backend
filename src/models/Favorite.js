const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true,
    },

    itemType: {
        type: String,
        enum: ['Court', 'Venue'],
        required: [true, 'Item type is required'],
    },

    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        required: [true, 'Item ID is required'],
        refPath: 'itemType',
    },
}, {
    timestamps: true,
});

favoriteSchema.index({ user: 1, itemType: 1, itemId: 1 }, { unique: true });

const Favorite = mongoose.model('Favorite', favoriteSchema);

module.exports = Favorite;
