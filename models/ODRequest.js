const mongoose = require('mongoose');

const odRequestSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    reason: { type: String, required: true },
    event_name: { type: String }, // Added for QR verification
    proofFile: { type: String }, // URL or filename
    fromDate: { type: Date, required: true },
    start_date: { type: String }, // Added for QR verification
    toDate: { type: Date, required: true },
    end_date: { type: String }, // Added for QR verification
    status: {
        type: String,
        enum: [
            'PENDING',
            'FACULTY_APPROVED',
            'COORDINATOR_APPROVED',
            'HOD_APPROVED',
            'REJECTED'
        ],
        default: 'PENDING'
    },
    approvalLevel: {
        type: String,
        enum: ['faculty', 'coordinator', 'hod'],
        default: 'faculty'
    },
    lastActionTime: {
        type: Date,
        default: Date.now
    },
    remarks: { type: String },
    faculty_status: { type: String, default: 'PENDING' },
    coordinator_status: { type: String, default: 'PENDING' },
    hod_status: { type: String, default: 'PENDING' },
    // Stores URL or encoded payload used in the QR code
    qrCodeData: { type: String },
    // Flag to indicate final approval used for digital pass
    isFinalApproved: { type: Boolean, default: false },
    location: {
        latitude: { type: Number },
        longitude: { type: Number }
    },
    checkInLocation: {
        latitude: { type: Number },
        longitude: { type: Number }
    },
    checkInTime: { type: Date },
    isLocationVerified: { type: Boolean, default: false },
    approvedBy: [{
        faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'Faculty' },
        role: String,
        date: { type: Date, default: Date.now }
    }],
    report_submitted: { type: Boolean, default: false },
    report_verified: { type: Boolean, default: false },
    report_submission_date: { type: Date },
    report_word_count: { type: Number },
    report_status: {
        type: String,
        enum: ['pending', 'submitted', 'verified', 'rejected'],
        default: 'pending'
    },
    geotag_verified: { type: Boolean, default: false },
    compliance_block: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('ODRequest', odRequestSchema);
