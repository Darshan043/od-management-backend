const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const facultySchema = new mongoose.Schema({
    staffId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    department: { type: String, required: true },
    role: {
        type: String,
        enum: ['FACULTY', 'COORDINATOR', 'HOD', 'ADMIN'],
        required: true,
        default: 'FACULTY'
    },
    phone: { type: String }
}, { timestamps: true });

// Hash password before saving
facultySchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match password
facultySchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Faculty', facultySchema);
