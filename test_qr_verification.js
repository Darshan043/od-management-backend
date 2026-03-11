const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ODRequest = require('./models/ODRequest');
const Student = require('./models/Student');
const Faculty = require('./models/Faculty');

dotenv.config();

const verify = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/od-management');
        console.log('Connected to MongoDB');

        // Find a student
        const student = await Student.findOne();
        if (!student) {
            console.error('No student found in database. Run seed script first.');
            process.exit(1);
        }

        console.log(`Using student: ${student.name} (${student.regNo})`);

        // Create an OD request
        const od = await ODRequest.create({
            student: student._id,
            reason: 'Robotics Workshop',
            event_name: 'Robotics Workshop',
            fromDate: new Date(),
            start_date: new Date().toLocaleDateString(),
            toDate: new Date(Date.now() + 86400000),
            end_date: new Date(Date.now() + 86400000).toLocaleDateString(),
            status: 'PENDING',
            approvalLevel: 'faculty'
        });

        console.log(`Created OD: ${od._id}`);
        console.log(`Populated fields: event_name=${od.event_name}, start_date=${od.start_date}`);

        // Update with approvals
        od.status = 'HOD_APPROVED';
        od.faculty_status = 'APPROVED';
        od.coordinator_status = 'APPROVED';
        od.hod_status = 'APPROVED';
        od.isFinalApproved = true;
        
        const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
        od.qrCodeData = `${BASE_URL}/verify-od/${od._id}`;
        
        await od.save();
        console.log(`Finalized OD with QR: ${od.qrCodeData}`);

        const updatedStudent = await Student.findById(student._id);
        console.log(`Student updated fields: full_name=${updatedStudent.full_name}, roll_number=${updatedStudent.roll_number}`);

        console.log('\nVerification Link Testing:');
        console.log(`Navigate to: http://localhost:5000/verify-od/${od._id}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verify();
