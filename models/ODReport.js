const mongoose = require('mongoose');

const odReportSchema = new mongoose.Schema({
    od_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ODRequest',
        required: true
    },
    student_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    report_text: {
        type: String,
        required: true
    },
    word_count: {
        type: Number,
        required: true
    },
    photo_urls: [String],
    geo_latitude: {
        type: Number
    },
    geo_longitude: {
        type: Number
    },
    submission_timestamp: {
        type: Date,
        default: Date.now
    },
    verification_status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    faculty_feedback: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('ODReport', odReportSchema);
