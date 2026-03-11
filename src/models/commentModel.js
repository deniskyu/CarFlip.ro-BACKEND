    import mongoose from 'mongoose';

    const commentSchema = new mongoose.Schema({
        sale_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'sales',
            required: true,
            index: true
        },
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users',
            required: true
        },
        parent_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Comments',
            default: null,
            index: true
        },
        text: {
            type: String,
            required: true,
            trim: true,
            maxLength: 1000,
        },
        likes_count: {
            type: Number,
            default: 0
        },
        liked_by: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'users'
        }],
        is_active: {
            type: Boolean,
            default: true
        }
    }, {
        timestamps: true
    });

    const Comments = mongoose.model('Comments', commentSchema);

    export default Comments;